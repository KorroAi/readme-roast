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
 * per-zone preset blended by where the explorer is (see atmosphere.ts and updateAtmosphere).
 */

/**
 * How lit materials write the scene target, shared by every material (one object, set by PostFX):
 * 0 = linear HDR (half-float target); 1 = the 8-bit fallback, where colours are stored as
 * sqrt(x / (1 + x)) so values above 1 (crystals, flames) survive the 8-bit clamp and the darks
 * get far finer steps than linear 8-bit. The post chain decodes it.
 */
export const SCENE_ENCODE: THREE.IUniform<number> = { value: 0 };

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
  //   uAtmos   vec4  x: light-volume in-scatter, y: lantern bounce, z: emission absorbed by fog
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

// Emitter light + ambient from a light sample. Openness adds a neutral blue-grey fill so big
// spaces read as big; its colour comes from the zone's atmosphere.
vec3 ambientFrom(vec4 ls) {
  return uAmbient + uOpenAmbient * (ls.a * ls.a) + ls.rgb;
}

// Emitter light + ambient at a sample point that lies in open space next to the surface.
vec3 worldLight(vec3 samplePos) {
  return ambientFrom(lightSample(samplePos));
}

float lanternVisibility(vec3 samplePos) {
  return texture(uLanternTex, (samplePos - uLanternOrigin) * (1.0 / 32.0)).r;
}

// Warm lantern light: a pale-gold hot core that deepens to amber toward the rim of the pool
// (a flame's light reads warmer as it falls off), a diffuse term with only a little wrap so the
// sculpted facets catch it, and a soft directionless bounce (light scattered back by the rock
// around the explorer) so surfaces turned away from the flame stay readable instead of black.
// Bounce is gated by the same visibility as the direct light, so nothing leaks through walls.
// open: openness at the sample (light volume alpha). Bounce is stronger in enclosed spaces
// (a lantern fills a small room with scattered light) and weaker in open halls.
vec3 lanternLight(vec3 samplePos, vec3 fragPos, vec3 n, float open) {
  vec3 d = uLanternPos - fragPos;
  float dist = length(d);
  float x = clamp(dist / uLanternRadius, 0.0, 1.0);
  // Flat through the middle of the pool (a room or a stair run 5-8 m away stays readable), then
  // a soft edge; the hot core near the flame comes from the inverse-square-like term.
  float att = 1.0 - x * x * x;
  att *= att;
  float core = 0.9 / (1.0 + dist * dist * 0.35);
  float ndl = dot(n, d / max(dist, 1e-3));
  float diff = clamp(ndl * 0.85 + 0.15, 0.0, 1.0);
  vec3 tint = mix(vec3(1.0, 0.6, 0.36), vec3(1.0, 0.94, 0.86), smoothstep(0.05, 0.8, att));
  float vis = lanternVisibility(samplePos);
  float bounce = uAtmos.y * (1.5 - open);
  return uLanternColor * tint * (uLanternIntensity * vis * att * ((1.0 + core) * diff + bounce));
}

vec3 lanternLight(vec3 samplePos, vec3 fragPos, vec3 n) {
  return lanternLight(samplePos, fragPos, n, 0.5);
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
// in the space. The haze is darker where it pools and a little lighter in mid-air (so near
// forms silhouette against it), and the light volume at the fragment scatters into it, so lamps
// and crystals glow in the air around them instead of being cut out of a flat fog.
vec4 atmosphere(vec3 wp, float depth, vec3 emit) {
  float f = depth * uFogDensity;
  float od = f * f * 0.6 + f * 0.4 + poolDepth(wp, depth);
  float lift = smoothstep(-3.0, 10.0, wp.y - uFogPool.x);
  // In-scatter saturates softly: a lamp warms the air around it without a solid glowing cloud.
  vec3 col = mix(uFogLow, uFogColor, lift) + emit * (uAtmos.x / (1.0 + max(emit.r, max(emit.g, emit.b))));
  return vec4(col, 1.0 - exp(-od));
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
`;

/**
 * Atmosphere presets, one per kind of space. Colours are sRGB hex; gains scale them in linear.
 *   camp    warm umber haze, a warm fill: people live here
 *   tunnel  neutral grey stone haze, denser (short sight lines), no pooling
 *   hollow  blue-black air, haze pooling low under the hall floor (violet-tinged where it
 *           sinks into the chasm), lighter mid-air haze so pillars and stairs silhouette
 *   rift    the deep: violet underglow pooling low, cool violet-grey fill
 * The open-space fill is a desaturated blue-grey (not the old saturated navy), so big spaces read
 * as big without turning the image monochrome.
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
  /** Exposure multiplier for the post chain (per-zone grade). */
  exposure: number;
}

export type AtmosphereZone = 'camp' | 'tunnel' | 'hollow' | 'rift';

export const ATMOSPHERES: Record<AtmosphereZone, AtmospherePreset> = {
  camp: { fog: 0x22190f, fogLow: 0x130d09, density: 0.026, poolLevel: 100, poolThickness: 2.5, poolDensity: 0.02, ambient: 0x17110c, ambientGain: 0.6, open: 0x3a2f26, openGain: 0.6, scatter: 0.1, bounce: 0.12, absorb: 0.9, exposure: 1.0 },
  tunnel: { fog: 0x17191c, fogLow: 0x0e0f11, density: 0.03, poolLevel: 0, poolThickness: 4, poolDensity: 0, ambient: 0x121418, ambientGain: 0.6, open: 0x3a3e45, openGain: 0.8, scatter: 0.1, bounce: 0.13, absorb: 0.9, exposure: 1.0 },
  hollow: { fog: 0x15212f, fogLow: 0x0c0b18, density: 0.026, poolLevel: 38, poolThickness: 6, poolDensity: 0.035, ambient: 0x0c1118, ambientGain: 0.6, open: 0x303c4c, openGain: 0.95, scatter: 0.1, bounce: 0.14, absorb: 0.92, exposure: 1.0 },
  rift: { fog: 0x171428, fogLow: 0x22153c, density: 0.024, poolLevel: 14, poolThickness: 8, poolDensity: 0.03, ambient: 0x100c18, ambientGain: 0.6, open: 0x353048, openGain: 0.85, scatter: 0.12, bounce: 0.12, absorb: 0.92, exposure: 1.0 },
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
  /** density, poolLevel, 1/poolThickness, poolDensity, scatter, bounce, absorb, exposure */
  k: number[];
}

function linearPreset(p: AtmospherePreset): AtmosphereMix {
  const c = (hex: number, gain = 1) => new THREE.Color().setRGB(...hexToLinear(hex)).multiplyScalar(gain);
  return {
    fog: c(p.fog),
    fogLow: c(p.fogLow),
    ambient: c(p.ambient, p.ambientGain),
    open: c(p.open, p.openGain),
    k: [p.density, p.poolLevel, 1 / p.poolThickness, p.poolDensity, p.scatter, p.bounce, p.absorb, p.exposure],
  };
}

const ZONES: AtmosphereZone[] = ['camp', 'tunnel', 'hollow', 'rift'];
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
  /** Current zone weights (camp, tunnel, hollow, rift), smoothed over time. */
  readonly zoneWeights: Record<AtmosphereZone, number> = { camp: 0, tunnel: 0, hollow: 1, rift: 0 };
  /** Exposure multiplier of the current atmosphere (the post chain applies it). */
  exposure = 1;
  private readonly mixed = linearPreset(ATMOSPHERES.hollow);
  private readonly fogLow = new THREE.Color();
  private readonly fogPool = new THREE.Vector4();
  private readonly atmos = new THREE.Vector4();
  private atmosphereInit = false;

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
      uLanternColor: { value: new THREE.Color().setRGB(...hexToLinear(0xffd2a6)).multiplyScalar(1.85) },
      uLanternRadius: { value: 11 },
      uLanternIntensity: { value: 1 },
      uAmbient: { value: new THREE.Color() },
      uOpenAmbient: { value: new THREE.Color() },
      uEmitGain: { value: 2.9 },
      uFogColor: { value: new THREE.Color() },
      uFogLow: { value: this.fogLow },
      uFogPool: { value: this.fogPool },
      uAtmos: { value: this.atmos },
      uFogDensity: { value: 0.02 },
      uTime: { value: 0 },
      uDebug: { value: new THREE.Vector3(0, 9999, 0) },
      uSceneEncode: SCENE_ENCODE,
    };
    // Default atmosphere (Visual Lab, viewer): the Hollow's.
    this.applyAtmosphere();
  }

  /**
   * Blend the zone atmospheres for the explorer's position and ease the uniforms toward it.
   * Zones are recognised from data the world already has, so a new zone layout needs no code:
   *   camp    distance to the camp box (8 m blend)
   *   rift    depth below the Hollow floor (y 36 -> 26)
   *   hollow  openness (fraction of open space) around the explorer, from the light volume
   *   tunnel  whatever is left: enclosed passages
   * @param dt frame time (s); 0 snaps (teleports, loads)
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
    let campW = 0;
    if (camp) {
      const ex = Math.max(camp.min[0] - x, 0, x - camp.max[0]);
      const ey = Math.max(camp.min[1] - y, 0, y - camp.max[1]);
      const ez = Math.max(camp.min[2] - z, 0, z - camp.max[2]);
      campW = 1 - smooth(0, 8, Math.hypot(ex, ey, ez));
    }
    const riftW = smooth(36, 26, y) * (1 - campW);
    const rest = 1 - campW - riftW;
    const hollowW = smooth(0.12, 0.42, open) * rest;
    const target: Record<AtmosphereZone, number> = { camp: campW, tunnel: rest - hollowW, hollow: hollowW, rift: riftW };
    // Ease toward the target (time constant ~0.7 s) so crossing a threshold never pops.
    const a = !this.atmosphereInit || dt <= 0 ? 1 : 1 - Math.exp(-dt / 0.7);
    this.atmosphereInit = true;
    for (const zn of ZONES) this.zoneWeights[zn] += (target[zn] - this.zoneWeights[zn]) * a;
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
    this.atmos.set(m.k[4], m.k[5], m.k[6], 0);
    this.exposure = m.k[7];
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
