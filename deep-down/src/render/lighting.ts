import * as THREE from 'three';
import type { LightField, LanternField, Box3i } from '../world/light';
import { LanternField as LanternFieldClass } from '../world/light';
import { hexToLinear } from '../core/math';

/**
 * The shared lighting rig. Every lit material in the game (terrain, character, props,
 * drops, debris) samples the same two volumes, so a crystal tints the explorer exactly as
 * it tints the rock beside them:
 *
 *   uLightTex   world-sized RGBA8 3D texture: colored emitter light + openness (A)
 *   uLanternTex 32^3 R8 3D texture: line-of-sight visibility of the player's lantern
 *
 * The lantern itself is the only dynamic light. Its falloff is computed per pixel from its
 * exact position, so it moves smoothly while the visibility volume prevents leaks.
 *
 * Atmosphere (fog colour, haze pooling low, ambient fill, in-scattering, lantern bounce) is a
 * per-zone preset blended by where the explorer is (see ATMOSPHERES and LightingRig.updateAtmosphere).
 */

/**
 * How lit materials write the scene target, shared by every material (one object, set by PostFX):
 * 0 = linear HDR (half-float target); 1 = the 8-bit fallback, where colours are stored as
 * sqrt(x / (1 + x)) so values above 1 (crystals, flames) survive the 8-bit clamp and the darks
 * get far finer steps than linear 8-bit. The post chain decodes it.
 */
export const SCENE_ENCODE: THREE.IUniform<number> = { value: 0 };

/**
 * Distance (m) past which the current zone's haze hides everything (distance fog >= ~97 %, the low
 * pool ignored, so it is conservative): the chunk renderer draws nothing beyond it, which keeps
 * enclosed passages far under the draw-call budget. Set by the active LightingRig.
 */
export const FOG_CULL = { value: Infinity };

export interface LightingUniforms {
  [name: string]: THREE.IUniform;
  uLightTex: THREE.IUniform<THREE.Data3DTexture>;
  uLanternTex: THREE.IUniform<THREE.Data3DTexture>;
  uWorldSize: THREE.IUniform<THREE.Vector3>;
  uLanternOrigin: THREE.IUniform<THREE.Vector3>;
  uLanternPos: THREE.IUniform<THREE.Vector3>;
  uLanternColor: THREE.IUniform<THREE.Color>;
  uLanternRadius: THREE.IUniform<number>;
  uLanternIntensity: THREE.IUniform<number>;
  uAmbient: THREE.IUniform<THREE.Color>;
  uOpenAmbient: THREE.IUniform<THREE.Color>;
  uEmitGain: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogDensity: THREE.IUniform<number>;
  uTime: THREE.IUniform<number>;
  uDebug: THREE.IUniform<THREE.Vector3>;
  // Atmosphere uniforms are added by LightingRig through the index signature (so hand-built
  // uniform sets in unit tests stay valid; a missing uniform reads as 0 in GLSL):
  //   uFogLow  vec3  haze that pools low in a space (darker blue-black, violet over the rift)
  //   uFogPool vec4  x: pool level (world y), y: 1 / pool thickness, z: pool density (1/m)
  //   uAtmos   vec4  x: light-volume in-scatter, y: lantern bounce, z: emission absorbed by fog,
  //                  w: the zone's light gain (terrain and prop emission take it)
}

export const LIGHTING_GLSL = /* glsl */ `
uniform highp sampler3D uLightTex;
uniform highp sampler3D uLanternTex;
uniform vec3 uWorldSize;
uniform vec3 uLanternOrigin;
uniform vec3 uLanternPos;
uniform vec3 uLanternColor;
uniform float uLanternRadius;
uniform float uLanternIntensity;
uniform vec3 uAmbient;
uniform vec3 uOpenAmbient;
uniform float uEmitGain;
uniform vec3 uFogColor;
uniform vec3 uFogLow;
uniform vec4 uFogPool;
uniform vec4 uAtmos;
uniform float uFogDensity;
uniform float uTime;
uniform vec3 uDebug; // x: fullbright amount, y: clip height (discard above), z: unused
uniform float uSceneEncode;

// Final write of a lit colour into the scene target (see SCENE_ENCODE).
vec3 sceneOut(vec3 c) {
  return uSceneEncode > 0.5 ? sqrt(c / (1.0 + c)) : c;
}

// One fetch of the world light volume: rgb = emitter light (linear, gained), a = openness.
vec4 lightSample(vec3 samplePos) {
  vec4 l = texture(uLightTex, samplePos / uWorldSize);
  return vec4(pow(l.rgb, vec3(1.55)) * uEmitGain, l.a);
}

// Set by lanternLight (call it first): how far the face is inside the lantern's pool (in sight of
// the flame, within ~3.3 m fully and fading by 7.5 m, scaled with the lantern's radius, and turned
// to it), for ambientFrom's warm-against-cool ownership. 0 where no lantern was computed.
float gLanternOwn = 0.0;

// Emitter light + ambient from a light sample. Openness adds a neutral blue-grey fill so big
// spaces read as big; its colour comes from the zone's atmosphere.
vec3 ambientFrom(vec4 ls) {
  return uAmbient + uOpenAmbient * (ls.a * ls.a) + ls.rgb;
}

// The same with a hemisphere on the open-space fill: in big spaces that cool fill is the haze
// glowing above, so up-facing ground catches it, walls get 40 % and overhangs nothing.
// Unlit forms keep their shape (and silhouette against the haze) instead of an even blue wash.
vec3 ambientFrom(vec4 ls, vec3 n) {
  return uAmbient + uOpenAmbient * (ls.a * ls.a * (0.4 + 0.6 * n.y)) + ls.rgb;
}

// Terrain form: the cool fill and the placed light each scaled by how the face meets them
// (facing = placedFacing(): x placed light, y open fill) and the placed light falling off faster
// in recesses (ao) than the all-round fill. Warm against cold per face: where a lamp lights a face
// it owns it (the cool fill there is cut by up to 75 %), so faces turned to a lamp read amber and the
// faces turned away go blue, instead of amber plus sky blue mixing into lavender on every face.
// lantern: the explorer's lantern light at the face (computed first), which owns the faces it
// lights in the same way, so the pool reads amber on charcoal, not lilac. Ownership goes by how the
// warm light compares with the fill at the face (from about 0.6x to 1.8x), so a face is either
// warm or cool and the neutral band where the two meet stays narrow.
vec3 ambientFrom(vec4 ls, vec3 n, vec2 facing, float ao, vec3 lantern) {
  vec3 placed = ls.rgb * (facing.x * (1.0 - 0.6 * (1.0 - ao)));
  vec3 fill = uOpenAmbient * (ls.a * ls.a * (0.4 + 0.6 * n.y) * facing.y);
  const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  // Cool placed light (crystals, the rift) gives way where the lantern clearly owns the face, so
  // the pool reads amber against cyan around it instead of lavender where the two overlap.
  float pl = max(dot(placed, LUM), 1e-4);
  float cool = smoothstep(0.0, 0.6, (placed.b + 0.5 * placed.g - 1.5 * placed.r) / pl);
  // Polish round: the pool owns its faces as soon as the flame is about as bright as the cool light
  // there (from 0.35x, fully by 1.4x, up to 80 %), so the floor ahead reads golden even under the
  // rift's violet or the Glowroot's green, not lilac or olive.
  // Inside the pool itself (gLanternOwn: in sight of the flame, within ~3-7 m, turned to it) the
  // flame owns the face outright, however strong the cool light there.
  placed *= 1.0 - 0.8 * cool * max(smoothstep(0.35, 1.4, dot(lantern, LUM) / pl), gLanternOwn);
  float own = 1.0 - 0.85 * max(smoothstep(0.4, 1.4, dot(placed + lantern, LUM) / max(dot(fill, LUM), 0.004)), gLanternOwn);
  // The zone's constant ambient (its hued dark) gives way in the pool too, so pale floors there
  // read gold, not lilac.
  return uAmbient * (1.0 - 0.7 * gLanternOwn) + fill * own + placed;
}
vec3 ambientFrom(vec4 ls, vec3 n, vec2 facing, float ao) {
  return ambientFrom(ls, n, facing, ao, vec3(0.0));
}

// Which way the placed light (lamps, crystals, the fall) arrives at a face, from the light
// volume's gradient along the face normal: one more fetch, one voxel further out. Light that grows
// away from the face comes from in front of it (up to 1.6x); light that fades away from the face
// only wraps around to it (down to 0.25x), so the backs of pillars, kerbs and stair cheeks in a
// warm pool fall to the cool fill instead of an even amber wash, and lamps model form.
// A solid voxel further out carries no light, so it gives no evidence (1).
// The same fetch gives the openness gradient: a face that looks into the open hall sees more of
// the glowing haze than one that looks at a wall a few metres away (y: open-fill factor).
vec2 placedFacing(vec4 ls, vec3 samplePos, vec3 n) {
  vec4 l1 = lightSample(samplePos + n);
  if (l1.a < 0.02) return vec2(1.0);
  float m0 = max(ls.r, max(ls.g, ls.b));
  float m1 = max(l1.r, max(l1.g, l1.b));
  float placed = m0 < 1e-4 ? 1.0 : clamp(1.0 + 2.2 * (m1 - m0) / m0, 0.25, 1.6);
  float open = clamp(0.9 + 2.5 * (l1.a - ls.a) / max(ls.a, 0.05), 0.45, 1.4);
  return vec2(placed, open);
}

// Emitter light + ambient at a sample point that lies in open space next to the surface.
vec3 worldLight(vec3 samplePos) {
  return ambientFrom(lightSample(samplePos));
}

float lanternVisibility(vec3 samplePos) {
  return texture(uLanternTex, (samplePos - uLanternOrigin) * (1.0 / 32.0)).r;
}

// The lantern: a windowed inverse-square falloff, so the flame models form (bright near the
// explorer, about 3x dimmer 6 m away) and the pool ends softly at uLanternRadius instead of a
// flat floodlight with a cliff edge. The falloff is relative to the radius (k = K / R^2), so a
// bigger lantern throws a proportionally bigger pool and a dying one shrinks to an ember.
// R = 11 m: 1 m 0.95, 3 m 0.68, 6 m 0.30, 9 m 0.06 (x LANTERN_GAIN): flatter than a bare inverse
// square, so the pool carries out to the way ahead instead of peaking at the carrier. A hand
// lantern throws its light out through the glass, not down: the fuel tank shades the cone below
// the flame (from ~17 degrees down, 90 % at ~50 degrees: a dark disc about 1 m across under the
// flame, where the cool fill shows), and ground near the carrier takes it at a grazing angle, so
// the pool is a warm ring on the way ahead, not a white disc at the boots.
// Colour: uLanternColor is the warm-pale core (pale gold, never white); it deepens to amber by
// ~1.8 m (a flame's light reads warmer as it falls off), so the pool reads amber on charcoal. A
// diffuse term with very little wrap on walls so the sculpted facets catch it, and a soft bounce
// (light scattered back by the cool grey rock around the explorer, so it is much closer to neutral
// than the flame, and only partly shaded by the tank), gated by the same visibility so nothing
// leaks through walls. open: openness at the sample (light volume alpha): the bounce is stronger
// in enclosed spaces and weaker in open halls. minDist: entities next to the flame (the explorer
// who carries it) clamp the distance, so the carrier is never the brightest thing on screen.
// First person (2026-10 visual pass): the flame hangs in the hand low left of the eye (about 1.2 m
// above the feet, a little ahead), so the pool is the floor and walls ahead of the player. The
// falloff is steeper (K 16: 1 m 0.86, 2 m 0.6, 3 m 0.4, 4 m 0.28, 6 m 0.12 of the gain), so the
// pool reads 6-8 m across and the far dark keeps its depth; the tank only shades the floor
// almost straight below the flame (out of view). Polish round: the near field rolls off (below).
const float LANTERN_K = 16.0;
const float LANTERN_GAIN = 11.5;
// Set by lanternLight for lanternSpec (the same flame, no second visibility fetch): the radiance
// reaching the fragment (shadowed, tank-shaded, tinted) and the direction to the flame.
vec3 gLanternRad = vec3(0.0);
vec3 gLanternL = vec3(0.0, 1.0, 0.0);
vec3 lanternLight(vec3 samplePos, vec3 fragPos, vec3 n, float open, float minDist) {
  vec3 d = uLanternPos - fragPos;
  float dist = length(d);
  vec3 l = d / max(dist, 1e-3);
  float x = max(dist, minDist) / max(uLanternRadius, 0.5);
  float win = clamp(1.0 - x * x * x * x, 0.0, 1.0);
  float att = win * win / (1.0 + LANTERN_K * x * x);
  // Arm's length: a wall right in front of the flame would wash to cream; the near field rolls off
  // (0.42x at 0.2 m, 0.52x at 1 m, 0.78x at 2 m, 1x from 3.4 m), so the light reaching a face is
  // about level from the hand out to 3 m (no hot spot at 1.5-2.5 m) and falls away beyond; with
  // the near-field shoulder (nearShoulder) lit stone peaks at about 0.75 display at 1 m.
  att *= 0.42 + 0.58 * smoothstep(0.2, 3.4, dist);
  // The fuel tank shades the floor almost straight below the flame (out of view in first person);
  // roofs above the hand are lit, so a 2 m tunnel's roof still reads.
  float tank = 1.0 - 0.75 * smoothstep(0.8, 0.97, l.y);
  // Ground (up-facing) takes the light with more wrap, as rough rubble does, so the pool still
  // reads 3-6 m out where the flame grazes it (the flame hangs only ~0.7 m above the floor); within
  // ~4 m it takes less, so the ground at the carrier's feet is never the largest bright area.
  float up = smoothstep(0.5, 0.9, n.y);
  float wrap = 0.08 + 0.27 * up;
  float diff = clamp(dot(n, l) * (1.0 - wrap) + wrap, 0.0, 1.0);
  // The floor right ahead is the largest lit area of a first-person frame: it takes a little less,
  // so the pool stays golden there instead of washing out, and the walls carry the light.
  diff *= 1.0 - 0.3 * up * (1.0 - smoothstep(1.2, 3.5, dist));
  // Pale gold within ~1 m, amber by ~3 m, deep amber at the rim of the pool (uLanternColor is the
  // amber of the flame; the core is paler).
  vec3 tint = mix(mix(vec3(1.0, 1.05, 1.12), vec3(1.0, 0.92, 0.82), smoothstep(0.04, 0.26, x)), vec3(1.0, 0.8, 0.62), smoothstep(0.3, 0.75, x));
  float vis = lanternVisibility(samplePos);
  float bounce = uAtmos.y * (1.5 - open);
  vec3 bounceTint = mix(tint, vec3(0.75, 0.85, 1.0), 0.7);
  gLanternRad = uLanternColor * tint * (LANTERN_GAIN * tank * uLanternIntensity * vis * att);
  gLanternL = l;
  gLanternOwn = vis * tank * (1.0 - smoothstep(0.3, 0.68, x)) * smoothstep(0.0, 0.2, dot(n, l)) * min(uLanternIntensity, 1.0);
  return uLanternColor * (tint * (LANTERN_GAIN * diff * tank) + bounceTint * (bounce * (0.3 + 0.7 * tank))) * (uLanternIntensity * vis * att);
}

// Specular of the lantern on a surface (call after lanternLight): GGX distribution with the
// mobile visibility approximation (Unity's "minimalist" Cook-Torrance), Schlick Fresnel. n: the
// detailed shading normal, rough: perceptual roughness, f0: reflectance at normal incidence.
// Wet stone, ore metal and dressed faces catch the flame as it moves; dry rubble barely does.
vec3 lanternSpec(vec3 n, vec3 v, float rough, vec3 f0) {
  vec3 l = gLanternL;
  vec3 h = normalize(l + v);
  float ndl = max(dot(n, l), 0.0);
  float ndh = max(dot(n, h), 0.0);
  float ldh = max(dot(l, h), 0.0);
  float a = rough * rough;
  float a2 = a * a;
  float d = ndh * ndh * (a2 - 1.0) + 1.0;
  float spec = a2 / (4.0 * 3.14159 * d * d * max(0.1, ldh * ldh) * (rough + 0.5));
  vec3 f = f0 + (1.0 - f0) * pow(1.0 - ldh, 5.0);
  return gLanternRad * f * min(spec, 24.0) * ndl;
}

// The near-field shoulder: a face the flame lights at arm's length (pale stone, a vein, a crate)
// would still clip to cream in the tone map. Its lit colour (c, linear) is eased toward a ceiling
// by its brightest channel, hue and saturation kept, in proportion to how much of it is the
// lantern's (lit: albedo x lantern light), so lamp-lit walls and dark stone are untouched. The
// shoulder starts at NEAR_KNEE (about 0.6 display) and never passes NEAR_CEIL (about 0.76 display
// through the grade).
const float NEAR_KNEE = 0.24;
const float NEAR_CEIL = 0.46;
vec3 nearShoulder(vec3 c, vec3 lit) {
  float y = max(c.r, max(c.g, c.b));
  if (y <= NEAR_KNEE) return c;
  float span = NEAR_CEIL - NEAR_KNEE;
  float f = NEAR_KNEE + span * (1.0 - exp(-(y - NEAR_KNEE) / span));
  float own = clamp(max(lit.r, max(lit.g, lit.b)) / y, 0.0, 1.0);
  return c * mix(1.0, f / y, own);
}

vec3 lanternLight(vec3 samplePos, vec3 fragPos, vec3 n, float open) {
  return lanternLight(samplePos, fragPos, n, open, 0.0);
}

vec3 lanternLight(vec3 samplePos, vec3 fragPos, vec3 n) {
  return lanternLight(samplePos, fragPos, n, 0.5, 0.0);
}

float fogFactor(float depth) {
  float f = depth * uFogDensity;
  return 1.0 - exp(-f * f * 0.6 - f * 0.4);
}

// Optical depth of the haze that pools low: density uFogPool.z * exp(-(y - level) / thickness),
// integrated analytically along the ray from the camera to the fragment.
float poolDepth(vec3 wp, float depth) {
  float k = max(uFogPool.y, 1e-3);
  float hc = clamp(cameraPosition.y - uFogPool.x, -4.0, 60.0);
  float hp = clamp(wp.y - uFogPool.x, -4.0, 60.0);
  float ec = exp(-hc * k);
  float ep = exp(-hp * k);
  float dh = hp - hc;
  float avg = abs(dh) > 0.02 ? (ec - ep) / (k * dh) : ep;
  return uFogPool.z * avg * depth;
}

// Fog colour (rgb) and amount (a) for a fragment: distance haze plus the pool of denser haze low
// in the space. The haze is darker where it pools and a little lighter in mid-air, and the light
// volume at the fragment scatters into it, so lamps and crystals glow in the air around them
// instead of being cut out of a flat fog. Aerial perspective: a thin veil of haze is dark and a
// deep one glows (light scattered many times), so mid-distance forms (pillars, the Spindle, stair
// flights) stand as darker silhouettes against the lighter depth behind them.
// Clear air near the player: the haze starts 12 m out and is fully in by 18 m (first person: the
// room around the lantern is never veiled; depth reads in the far dark, in a hued haze).
const float FOG_START = 12.0;
vec4 atmosphere(vec3 wp, float depth, vec3 emit) {
  float fd = max(depth - FOG_START, 0.0) * smoothstep(FOG_START, FOG_START + 6.0, depth);
  float f = fd * uFogDensity;
  float od = f * f * 0.6 + f * 0.4 + poolDepth(wp, fd);
  float a = 1.0 - exp(-od);
  float lift = smoothstep(-3.0, 10.0, wp.y - uFogPool.x);
  // In-scatter saturates softly: a lamp warms the air around it without a solid glowing cloud.
  vec3 col = mix(uFogLow, uFogColor, lift) * (0.7 + 0.7 * a) + emit * (uAtmos.x / (1.0 + max(emit.r, max(emit.g, emit.b))));
  return vec4(col, a);
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
`;

/**
 * Atmosphere presets, one per kind of space. Colours are sRGB hex; gains scale them in linear.
 *   camp    warm light from the fire and lamps in cool charcoal air (the warmth is the light, not
 *           the cave): people live here
 *   tunnel  neutral grey stone haze, denser (short sight lines), no pooling
 *   hollow  blue-black air, haze pooling low under the hall floor (violet-tinged where it
 *           sinks into the chasm), lighter mid-air haze so pillars and stairs silhouette
 *   rift    the deep: violet underglow pooling low, cool violet-grey fill
 * The open-space fill is a cool hemispheric light (the haze glowing above: strongest on floors,
 * 40 % on walls, none on overhangs). It is what the unlit side of a form gets, so shadows in the
 * Hollow, the shrine and the rift go blue-black instead of brown. The Hollow's fill is a
 * desaturated blue-grey (a saturated sky blue mixed with amber lamp light into lavender). Even
 * the camp's shadows are cool (the cave beyond the fire), so the warm pocket has a counterpoint
 * instead of reading as one sepia tone.
 * Exposure is per zone: the tunnel's lantern-lit walls are close and need less, the open Hollow
 * more (the post chain multiplies it with the player's brightness).
 */
export interface AtmospherePreset {
  /** Mid-air haze colour. */
  fog: number;
  /** Haze colour where it pools low. */
  fogLow: number;
  /** Exponential-squared distance fog density (1/m). */
  density: number;
  /** World y under which the low haze pools, its e-folding thickness (m) and density (1/m). */
  poolLevel: number;
  poolThickness: number;
  poolDensity: number;
  /** Base ambient (everywhere) and open-space fill (scaled by openness squared). */
  ambient: number;
  ambientGain: number;
  open: number;
  openGain: number;
  /** How much the light volume at a fragment scatters into its fog. */
  scatter: number;
  /** Lantern bounce fill (fraction of the direct lantern light, directionless). */
  bounce: number;
  /** Fraction of emission the fog absorbs at full fog (1 = distant glows vanish into haze). */
  absorb: number;
  /**
   * Scene exposure of the zone for the post chain (times the player's brightness, 1.05 at the
   * default setting): 1.0-1.15. The brightness comes from the lights (lightGain), not the exposure.
   */
  exposure: number;
  /**
   * Gain on the zone's lights: ambient, open fill, haze colours, placed lights (uEmitGain) and
   * terrain emission (uAtmos.w). The albedos are real reflectances (palette.ts), so a zone's light
   * is about 1.2-2x what an exposure of 1 alone would show.
   */
  lightGain: number;
}

export type AtmosphereZone = 'camp' | 'tunnel' | 'hollow' | 'rift' | 'glowroot' | 'ember';

export const ATMOSPHERES: Record<AtmosphereZone, AtmospherePreset> = {
  camp: { fog: 0x1b1a1c, fogLow: 0x101116, density: 0.04, poolLevel: 100, poolThickness: 2.5, poolDensity: 0.02, ambient: 0x101626, ambientGain: 1.6, open: 0x3e4a60, openGain: 1.4, scatter: 0.1, bounce: 0.14, absorb: 0.85, exposure: 1.0, lightGain: 1.8 },
  tunnel: { fog: 0x14202a, fogLow: 0x0c1218, density: 0.05, poolLevel: 0, poolThickness: 4, poolDensity: 0, ambient: 0x12243a, ambientGain: 0.6, open: 0x4f7088, openGain: 0.8, scatter: 0.1, bounce: 0.1, absorb: 0.85, exposure: 1.0, lightGain: 1.36 },
  hollow: { fog: 0x1c3248, fogLow: 0x121638, density: 0.022, poolLevel: 38, poolThickness: 6, poolDensity: 0.025, ambient: 0x1a2a44, ambientGain: 0.6, open: 0x84a0bc, openGain: 0.95, scatter: 0.12, bounce: 0.1, absorb: 0.6, exposure: 1.0, lightGain: 2.25 },
  rift: { fog: 0x1e1a36, fogLow: 0x2a1a4a, density: 0.035, poolLevel: 14, poolThickness: 8, poolDensity: 0.03, ambient: 0x100c18, ambientGain: 0.5, open: 0x6a5a9a, openGain: 0.8, scatter: 0.14, bounce: 0.12, absorb: 0.6, exposure: 1.0, lightGain: 2.09 },
  // The deep zones beyond the rift (content pass), told apart by the hue of their own light:
  // the Glowroot's moss-green air over green-gold drifts, the Ember Deep's smoky red over its fissures.
  glowroot: { fog: 0x0f2216, fogLow: 0x0c1a0c, density: 0.035, poolLevel: 0, poolThickness: 5, poolDensity: 0.02, ambient: 0x0c1a12, ambientGain: 0.55, open: 0x5f8a56, openGain: 0.75, scatter: 0.16, bounce: 0.12, absorb: 0.6, exposure: 1.0, lightGain: 1.98 },
  ember: { fog: 0x26100c, fogLow: 0x341208, density: 0.04, poolLevel: -2, poolThickness: 4, poolDensity: 0.03, ambient: 0x160a0a, ambientGain: 0.55, open: 0x7a4a3c, openGain: 0.7, scatter: 0.18, bounce: 0.12, absorb: 0.6, exposure: 1.0, lightGain: 1.98 },
};

/** Axis-aligned box (world units) used to find the camp. */
export interface AtmosphereBox {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** Linear-space, blendable form of a preset. */
interface AtmosphereMix {
  fog: THREE.Color;
  fogLow: THREE.Color;
  ambient: THREE.Color;
  open: THREE.Color;
  /** density, poolLevel, 1/poolThickness, poolDensity, scatter, bounce, absorb, exposure, lightGain */
  k: number[];
}

function linearPreset(p: AtmospherePreset): AtmosphereMix {
  const g = p.lightGain;
  const c = (hex: number, gain = 1) => new THREE.Color().setRGB(...hexToLinear(hex)).multiplyScalar(gain * g);
  return {
    fog: c(p.fog),
    fogLow: c(p.fogLow),
    ambient: c(p.ambient, p.ambientGain),
    open: c(p.open, p.openGain),
    k: [p.density, p.poolLevel, 1 / p.poolThickness, p.poolDensity, p.scatter, p.bounce, p.absorb, p.exposure, p.lightGain],
  };
}

/** The placed-light gain at lightGain 1 (the light volume's emitters, uEmitGain). */
export const EMIT_GAIN = 3.6;

const ZONES: AtmosphereZone[] = ['camp', 'tunnel', 'hollow', 'rift', 'glowroot', 'ember'];
const LINEAR: Record<AtmosphereZone, AtmosphereMix> = Object.fromEntries(ZONES.map((z) => [z, linearPreset(ATMOSPHERES[z])])) as Record<AtmosphereZone, AtmosphereMix>;

function addScaled(out: THREE.Color, c: THREE.Color, w: number): void {
  out.r += c.r * w;
  out.g += c.g * w;
  out.b += c.b * w;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class LightingRig {
  readonly uniforms: LightingUniforms;
  readonly lightTex: THREE.Data3DTexture;
  readonly lanternTex: THREE.Data3DTexture;
  private readonly field: LightField;
  private readonly sx: number;
  private readonly sy: number;
  private readonly sz: number;
  private pending: Box3i | null = null;
  /** Anchors of the zones with their own air (the deep zones), see setZoneAnchors. */
  private anchors: ReadonlyArray<{ zone: 'glowroot' | 'ember'; at: readonly [number, number, number]; radius: number }> = [];

  /**
   * Places that keep their own air: within `radius` of `at` (vertical distance counts 1.5x) the
   * zone's preset takes over, easing out over the outer 45 %.
   */
  setZoneAnchors(anchors: ReadonlyArray<{ zone: 'glowroot' | 'ember'; at: readonly [number, number, number]; radius: number }>): void {
    this.anchors = anchors.slice();
  }

  /** Current zone weights (camp, tunnel, hollow, rift, glowroot, ember), smoothed over time. */
  readonly zoneWeights: Record<AtmosphereZone, number> = { camp: 0, tunnel: 0, hollow: 1, rift: 0, glowroot: 0, ember: 0 };
  /** Exposure multiplier of the current atmosphere (the post chain applies it): 1.0-1.15. */
  exposure = 1;
  /** Light gain of the current atmosphere (uAtmos.w; uEmitGain = EMIT_GAIN x this). */
  lightGain = 1;
  private readonly mixed = linearPreset(ATMOSPHERES.hollow);
  private readonly fogLow = new THREE.Color();
  private readonly fogPool = new THREE.Vector4();
  private readonly atmos = new THREE.Vector4();
  private atmosphereInit = false;
  private lastAtmosphereX = Number.NaN;
  private lastAtmosphereY = Number.NaN;
  private lastAtmosphereZ = Number.NaN;

  constructor(field: LightField, lantern: LanternField, sx: number, sy: number, sz: number) {
    this.field = field;
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.lightTex = new THREE.Data3DTexture(field.data, sx, sy, sz);
    this.lightTex.format = THREE.RGBAFormat;
    this.lightTex.type = THREE.UnsignedByteType;
    this.lightTex.minFilter = THREE.LinearFilter;
    this.lightTex.magFilter = THREE.LinearFilter;
    this.lightTex.wrapS = this.lightTex.wrapT = this.lightTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lightTex.unpackAlignment = 1;
    this.lightTex.generateMipmaps = false;
    this.lightTex.needsUpdate = true;

    const L = LanternFieldClass.SIZE;
    this.lanternTex = new THREE.Data3DTexture(lantern.data, L, L, L);
    this.lanternTex.format = THREE.RedFormat;
    this.lanternTex.type = THREE.UnsignedByteType;
    this.lanternTex.minFilter = THREE.LinearFilter;
    this.lanternTex.magFilter = THREE.LinearFilter;
    this.lanternTex.wrapS = this.lanternTex.wrapT = this.lanternTex.wrapR = THREE.ClampToEdgeWrapping;
    this.lanternTex.unpackAlignment = 1;
    this.lanternTex.generateMipmaps = false;
    this.lanternTex.needsUpdate = true;

    this.uniforms = {
      uLightTex: { value: this.lightTex },
      uLanternTex: { value: this.lanternTex },
      uWorldSize: { value: new THREE.Vector3(sx, sy, sz) },
      uLanternOrigin: { value: new THREE.Vector3() },
      uLanternPos: { value: new THREE.Vector3() },
      // The flame's amber (the shader pales it toward gold at the core and deepens it at the rim).
      uLanternColor: { value: new THREE.Color().setRGB(...hexToLinear(0xffb878)).multiplyScalar(1.1) },
      uLanternRadius: { value: 11 },
      uLanternIntensity: { value: 1 },
      uAmbient: { value: new THREE.Color() },
      uOpenAmbient: { value: new THREE.Color() },
      uEmitGain: { value: EMIT_GAIN },
      uFogColor: { value: new THREE.Color() },
      uFogLow: { value: this.fogLow },
      uFogPool: { value: this.fogPool },
      uAtmos: { value: this.atmos },
      uFogDensity: { value: 0.02 },
      uTime: { value: 0 },
      uDebug: { value: new THREE.Vector3(0, 9999, 0) },
      uSceneEncode: SCENE_ENCODE,
    };
    // Default until updateAtmosphere() runs (Visual Lab, viewer): the Hollow's colours and
    // distance fog without its height pool, whose level is a height in the game world.
    this.applyAtmosphere();
    this.fogPool.z = 0;
  }

  /**
   * Blend the zone atmospheres for the explorer's position and ease the uniforms toward it.
   * Zones are recognised from data the world already has, so a new zone layout needs no code:
   *   camp    distance to the camp box (8 m blend)
   *   rift    depth below the Hollow floor (y 37.5 -> 30: the balcony and the rift itself)
   *   hollow  openness (fraction of open space) around the explorer, from the light volume
   *   tunnel  whatever is left: enclosed passages
   * @param dt frame time (s); 0 snaps (loads)
   */
  updateAtmosphere(dt: number, x: number, y: number, z: number, camp: AtmosphereBox | null): void {
    // Openness averaged over a 9 x 5 x 9 m box (stride 2) around head height: 75 reads.
    const d = this.field.data;
    let sum = 0;
    let n = 0;

    for (let dz = -4; dz <= 4; dz += 2)
      for (let dy = 0; dy <= 4; dy += 2)
        for (let dx = -4; dx <= 4; dx += 2) {
          const xi = Math.floor(x + dx);
          const yi = Math.floor(y + 1 + dy);
          const zi = Math.floor(z + dz);
          n++;
          if (xi < 0 || yi < 0 || zi < 0 || xi >= this.sx || yi >= this.sy || zi >= this.sz) continue;
          sum += d[(xi + this.sx * (yi + this.sy * zi)) * 4 + 3];
        }
    const open = sum / (n * 255);
    // The deep zones beyond the rift carry their own air around their anchors (setZoneAnchors).
    let green = 0;
    let red = 0;
    for (const an of this.anchors) {
      const w = 1 - smooth(an.radius * 0.55, an.radius, Math.hypot(x - an.at[0], (y - an.at[1]) * 1.5, z - an.at[2]));
      if (an.zone === 'glowroot') green = Math.max(green, w);
      else red = Math.max(red, w);
    }
    let campW = 0;
    if (camp) {
      const ex = Math.max(camp.min[0] - x, 0, x - camp.max[0]);
      const ey = Math.max(camp.min[1] - y, 0, y - camp.max[1]);
      const ez = Math.max(camp.min[2] - z, 0, z - camp.max[2]);
      campW = 1 - smooth(0, 8, Math.hypot(ex, ey, ez));
    }
    const glowW = green * (1 - red) * (1 - campW);
    const emberW = red * (1 - campW);
    const left = 1 - campW - glowW - emberW;
    const riftW = smooth(37.5, 30, y) * left;
    const rest = left - riftW;
    const hollowW = smooth(0.12, 0.42, open) * rest;
    // Ease toward the target (time constant ~0.7 s) so crossing a threshold never pops; snap on a
    // jump of more than 6 m in one frame (respawn, return to camp, debug teleport).
    const jump = Math.abs(x - this.lastAtmosphereX) + Math.abs(y - this.lastAtmosphereY) + Math.abs(z - this.lastAtmosphereZ);
    this.lastAtmosphereX = x;
    this.lastAtmosphereY = y;
    this.lastAtmosphereZ = z;
    const a = !this.atmosphereInit || dt <= 0 || !(jump < 6) ? 1 : 1 - Math.exp(-dt / 0.7);
    this.atmosphereInit = true;
    const zw = this.zoneWeights;
    zw.camp += (campW - zw.camp) * a;
    zw.tunnel += (rest - hollowW - zw.tunnel) * a;
    zw.hollow += (hollowW - zw.hollow) * a;
    zw.rift += (riftW - zw.rift) * a;
    zw.glowroot += (glowW - zw.glowroot) * a;
    zw.ember += (emberW - zw.ember) * a;
    this.applyAtmosphere();
  }

  private applyAtmosphere(): void {
    const m = this.mixed;
    m.fog.setRGB(0, 0, 0);
    m.fogLow.setRGB(0, 0, 0);
    m.ambient.setRGB(0, 0, 0);
    m.open.setRGB(0, 0, 0);
    m.k.fill(0);
    let total = 0;
    for (const zn of ZONES) total += this.zoneWeights[zn];
    for (const zn of ZONES) {
      const w = this.zoneWeights[zn] / Math.max(1e-6, total);
      if (w <= 0) continue;
      const p = LINEAR[zn];
      addScaled(m.fog, p.fog, w);
      addScaled(m.fogLow, p.fogLow, w);
      addScaled(m.ambient, p.ambient, w);
      addScaled(m.open, p.open, w);
      // A zone without a pool contributes no pool density, but must not drag the level to 0.
      for (let i = 0; i < m.k.length; i++) m.k[i] += (i === 1 || i === 2 ? (p.k[3] > 0 ? p.k[i] : 0) : p.k[i]) * w;
    }
    // Pool level and thickness are averaged over the zones that have a pool only.
    let poolW = 0;
    for (const zn of ZONES) if (LINEAR[zn].k[3] > 0) poolW += this.zoneWeights[zn] / Math.max(1e-6, total);
    if (poolW > 1e-4) {
      m.k[1] /= poolW;
      m.k[2] /= poolW;
    } else {
      m.k[1] = -1000;
      m.k[2] = 0.25;
    }
    const u = this.uniforms;
    u.uFogColor.value.copy(m.fog);
    this.fogLow.copy(m.fogLow);
    u.uAmbient.value.copy(m.ambient);
    u.uOpenAmbient.value.copy(m.open);
    u.uFogDensity.value = m.k[0];
    this.fogPool.set(m.k[1], m.k[2], m.k[3], 0);
    this.atmos.set(m.k[4], m.k[5], m.k[6], m.k[8]);
    // f^2 0.6 + f 0.4 = 3.5 at f = 2.12 (optical depth 3.5: 97 % haze), past FOG_START.
    FOG_CULL.value = m.k[0] > 1e-4 ? 12 + 2.12 / m.k[0] + 6 : Infinity;
    this.exposure = m.k[7];
    this.lightGain = m.k[8];
    u.uEmitGain.value = EMIT_GAIN * m.k[8];
  }

  /** Queue a sub-region of the world light texture for upload. */
  markLightDirty(box: Box3i): void {
    if (box.x1 < box.x0) return;
    if (!this.pending) {
      this.pending = { ...box };
      return;
    }
    const p = this.pending;
    p.x0 = Math.min(p.x0, box.x0);
    p.y0 = Math.min(p.y0, box.y0);
    p.z0 = Math.min(p.z0, box.z0);
    p.x1 = Math.max(p.x1, box.x1);
    p.y1 = Math.max(p.y1, box.y1);
    p.z1 = Math.max(p.z1, box.z1);
  }

  /** Mark the whole lantern volume for re-upload (it is tiny: 32 KB). */
  markLanternDirty(origin: THREE.Vector3Like): void {
    this.uniforms.uLanternOrigin.value.set(origin.x, origin.y, origin.z);
    this.lanternTex.needsUpdate = true;
  }

  /**
   * Upload pending light changes with texSubImage3D so mining a block never re-uploads the
   * whole world volume. Falls back to a full upload if the texture is not on the GPU yet.
   */
  flush(renderer: THREE.WebGLRenderer): void {
    const box = this.pending;
    if (!box) return;
    this.pending = null;
    const props = renderer.properties.get(this.lightTex) as { __webglTexture?: WebGLTexture };
    const glTex = props.__webglTexture;
    if (!glTex || this.lightTex.version === 0) {
      this.lightTex.needsUpdate = true;
      return;
    }
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const state = renderer.state;
    const x0 = Math.max(0, box.x0);
    const y0 = Math.max(0, box.y0);
    const z0 = Math.max(0, box.z0);
    const w = Math.min(this.sx - 1, box.x1) - x0 + 1;
    const h = Math.min(this.sy - 1, box.y1) - y0 + 1;
    const d = Math.min(this.sz - 1, box.z1) - z0 + 1;
    if (w <= 0 || h <= 0 || d <= 0) return;
    state.activeTexture(gl.TEXTURE0);
    state.bindTexture(gl.TEXTURE_3D, glTex);
    state.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    state.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    state.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    state.pixelStorei(gl.UNPACK_ROW_LENGTH, this.sx);
    state.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, this.sy);
    state.pixelStorei(gl.UNPACK_SKIP_PIXELS, x0);
    state.pixelStorei(gl.UNPACK_SKIP_ROWS, y0);
    state.pixelStorei(gl.UNPACK_SKIP_IMAGES, z0);
    gl.texSubImage3D(gl.TEXTURE_3D, 0, x0, y0, z0, w, h, d, gl.RGBA, gl.UNSIGNED_BYTE, this.field.data);
    state.pixelStorei(gl.UNPACK_ROW_LENGTH, 0);
    state.pixelStorei(gl.UNPACK_IMAGE_HEIGHT, 0);
    state.pixelStorei(gl.UNPACK_SKIP_PIXELS, 0);
    state.pixelStorei(gl.UNPACK_SKIP_ROWS, 0);
    state.pixelStorei(gl.UNPACK_SKIP_IMAGES, 0);
    state.unbindTexture();
  }

  dispose(): void {
    this.lightTex.dispose();
    this.lanternTex.dispose();
  }
}
