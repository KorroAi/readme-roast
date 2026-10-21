import * as THREE from 'three';
import { LIGHTING_GLSL, type LightingUniforms } from '../lighting';
import { MAX_BONES } from './rig';

/**
 * The creatures' material (round 2, MOBS): rigidly skinned (uBones), lit by the same light volume
 * and lantern as the rock, with what makes a creature read as alive and well made:
 * - surface-gradient bump from a 3D noise in body space (pores, chitin grain, fur, stone grit), so
 *   the detail sticks to the body as it moves;
 * - subsurface: the flame's light through thin flesh, wax and jelly (wrap plus back-scatter), tinted;
 * - GGX glints of the flame on wet or polished parts, a fresnel rim from the room's light, and a
 *   faint cold rim in the dark so a silhouette at the edge of the light is just readable;
 * - emissive parts (veins, crystal teeth, cores, eyes) that breathe slowly;
 * - a hit flash on the mob only, a noise dissolve for fading in and out;
 * - VIS's highlight uniforms (uHiColor, uHi): the rarity rim of catchable beings, and the selection.
 * Variants: TRANSLUCENT (jelly bells, lantern glass: fresnel-weighted opacity), SMOKE (the wisp:
 * animated fbm density, soft edges), HULL (the selection outline: an inflated back-face shell).
 */

const NOISE_GLSL = /* glsl */ `
float mhash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mhash(i), b = mhash(i + vec3(1, 0, 0)), c = mhash(i + vec3(0, 1, 0)), d = mhash(i + vec3(1, 1, 0));
  float e = mhash(i + vec3(0, 0, 1)), f1 = mhash(i + vec3(1, 0, 1)), g = mhash(i + vec3(0, 1, 1)), h = mhash(i + vec3(1, 1, 1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
float fbm(vec3 p) {
  return vnoise(p) * 0.55 + vnoise(p * 2.07 + 7.1) * 0.3 + vnoise(p * 4.3 - 3.7) * 0.15;
}
`;

const vertex = /* glsl */ `
in vec4 color;
in float aBone;
in vec4 aMat;
uniform mat4 uBones[${MAX_BONES}];
uniform float uWidth;
uniform vec2 uViewport;
out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vColor;
out vec4 vMat;
out vec3 vLocal;
out float vDepth;
void main() {
  mat4 b = uBones[int(aBone + 0.5)];
  vec4 lp = b * vec4(position, 1.0);
  vec3 n = mat3(b) * normal;
  vLocal = position;
  vec4 wp = modelMatrix * lp;
  vWorldPos = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * n);
  vColor = color;
  vMat = aMat;
  vec4 mv = viewMatrix * wp;
  vDepth = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
#ifdef HULL
  // A screen-constant outline: push the back-face shell out along the normal in clip space.
  vec3 vn = normalize(mat3(viewMatrix) * vNormal);
  vec2 dir = normalize((projectionMatrix * vec4(vn, 0.0)).xy + 1e-5);
  gl_Position.xy += dir * uWidth * 2.0 / uViewport * gl_Position.w;
#endif
}
`;

const fragment = /* glsl */ `
precision highp float;
${LIGHTING_GLSL}
${NOISE_GLSL}
uniform vec3 uHiColor;
uniform vec2 uHi;
uniform float uFlash;
uniform float uFade;
uniform float uGlow;
uniform vec3 uGlowTint;
uniform float uPulse;
uniform float uSeed;
uniform float uBump;
uniform float uBumpFreq;
uniform vec3 uSssTint;
uniform vec3 uRimDark;
uniform float uOpacity;
in vec3 vWorldPos;
in vec3 vNormal;
in vec4 vColor;
in vec4 vMat;
in vec3 vLocal;
in float vDepth;
layout(location = 0) out highp vec4 fragColor;
const float MOB_KEY = 0.62;

void main() {
#ifdef HULL
  float a = uHi.y * uFade;
  if (a < 0.02) discard;
  fragColor = vec4(sceneOut(uHiColor * 1.6 * a), 1.0);
  return;
#else
  // Fade in / dissolve: a noise threshold in body space with a glowing seam.
  float dn = vnoise(vLocal * 9.0 + uSeed * 17.0);
  float edge = uFade * 1.06 - dn;
  if (edge < 0.0) discard;
  float seam = (1.0 - smoothstep(0.0, 0.08, edge)) * step(uFade, 0.995);

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float emit = vMat.x;
  float sss = vMat.y;
  float gloss = vMat.z;
  // Surface-gradient bump (Mikkelsen): the detail lives in body space, so it moves with the body.
  float h = fbm(vLocal * uBumpFreq + uSeed);
  vec3 dpx = dFdx(vWorldPos);
  vec3 dpy = dFdy(vWorldPos);
  float dhx = dFdx(h);
  float dhy = dFdy(h);
  vec3 r1 = cross(dpy, n);
  vec3 r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
  float bump = uBump * (1.0 - emit);
  n = normalize(abs(det) * n - grad * bump);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(n, V), 0.0, 1.0);

  // Albedo, mottled by the same noise (no two creatures alike).
  vec3 albedo = vColor.rgb * (0.7 + 0.18 * h);
  vec3 samplePos = vWorldPos + n * 0.35;
  vec4 ls = lightSample(samplePos);
  vec3 lantern = lanternLight(samplePos, vWorldPos, n, max(ls.a, 0.3), 0.0);
  vec3 env = ambientFrom(ls, n);
  float cavity = 0.86 + 0.14 * smoothstep(0.25, 0.7, h);
  vec3 color = nearShoulder(albedo * (env * cavity + lantern), albedo * lantern);

  // Subsurface: the flame's light through thin parts (wrap toward the flame, and through toward the eye).
  vec3 L = gLanternL;
  float wrap = pow(clamp(0.55 - 0.45 * dot(n, L), 0.0, 1.0), 2.0);
  float through = pow(clamp(dot(V, -L), 0.0, 1.0), 4.0);
  color += gLanternRad * uSssTint * albedo * sss * (wrap * 0.035 + through * 0.07);
  color += env * uSssTint * albedo * sss * 0.12;

  // Glints of the flame on wet chitin, polished stone, glass.
  color += lanternSpec(n, V, mix(0.75, 0.16, gloss), vec3(0.03 + 0.06 * gloss));

  // Rim: the room's light on the silhouette, and a faint cold rim in the dark.
  float fres = pow(1.0 - ndv, 3.0);
  // (dark hides and cloth take less of it, so a black shape stays black against the lit rock)
  float alum = dot(albedo, vec3(0.2126, 0.7152, 0.0722));
  color += fres * vMat.w * mix(0.35, 1.0, smoothstep(0.02, 0.2, alum)) * (env * 0.55 + gLanternRad * 0.006 + uRimDark);

  // Emissive parts (veins, crystal, cores, eyes), breathing slowly.
  float breath = 0.82 + 0.18 * sin(uTime * uPulse + vLocal.y * 5.0 + uSeed * 6.0);
  vec3 glow = vColor.rgb * uGlowTint * emit * uGlow * breath * 3.2;

  // Creatures sit a little under the props' key: their forms read by shading and rim against the
  // lit rock, not as bright cut-outs (the terrain darkens its own surface by cavity and AO).
  color *= MOB_KEY;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb, atm.a);
  color += glow * uAtmos.w * (1.0 - atm.a * 0.6);
  // VIS highlight: the rarity rim (ambient) and the selection (stronger).
  color += uHiColor * (fres * 0.9 + 0.08) * (uHi.x * 0.55 + uHi.y * 1.1);
  // The dissolve seam glows faintly in the creature's own colour.
  color += (uGlowTint * 0.6 + vec3(0.4)) * seam * 0.6;
  // A hit flash on the mob only (warm white), never the screen.
  color = mix(color, vec3(1.25, 1.08, 0.9), uFlash * 0.55);

  float alpha = 1.0;
#ifdef TRANSLUCENT
  alpha = clamp(mix(vColor.a, 1.0, fres * 0.45) + emit * 0.6, 0.0, 1.0) * uOpacity;
#endif
#ifdef SMOKE
  // Smoke: density from a drifting fbm, thin at the edges of each blob, solid in the core.
  float dens = fbm(vWorldPos * 1.6 + vec3(0.0, -uTime * 0.45, uTime * 0.2) + uSeed);
  float soft = pow(ndv, 1.4);
  alpha = clamp((dens * 1.6 - 0.35) * soft * vColor.a + emit, 0.0, 1.0) * uOpacity;
  // Smoke drinks the light: a dark, cold veil (only its embers glow).
  float sl = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(mix(vec3(sl), color, 0.35) * 0.28 + vec3(0.006, 0.004, 0.012), color, emit);
#endif
  fragColor = vec4(sceneOut(color), alpha);
#endif
}
`;

export interface MobLook {
  bump?: number;
  bumpFreq?: number;
  sssTint?: number;
  rimDark?: [number, number, number];
  glowTint?: number;
  pulse?: number;
  translucent?: boolean;
  smoke?: boolean;
  doubleSided?: boolean;
}

/** One material per creature (its own bones, flash and fade); the program is shared by kind. */
export function createMobMaterial(lighting: LightingUniforms, bones: THREE.Matrix4[], look: MobLook = {}, seed = 0): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (look.translucent) defines.TRANSLUCENT = '';
  if (look.smoke) defines.SMOKE = '';
  const glow = new THREE.Color(look.glowTint ?? 0xffffff);
  const sss = new THREE.Color(look.sssTint ?? 0xff9a7a);
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...lighting,
      uBones: { value: bones },
      uHiColor: { value: new THREE.Vector3(1, 1, 1) },
      uHi: { value: new THREE.Vector2(0, 0) },
      uFlash: { value: 0 },
      uFade: { value: 1 },
      uGlow: { value: 1 },
      uGlowTint: { value: new THREE.Vector3(glow.r, glow.g, glow.b) },
      uPulse: { value: look.pulse ?? 1.4 },
      uSeed: { value: seed },
      uBump: { value: look.bump ?? 0.012 },
      uBumpFreq: { value: look.bumpFreq ?? 14 },
      uSssTint: { value: new THREE.Vector3(sss.r, sss.g, sss.b) },
      uRimDark: { value: new THREE.Vector3(...(look.rimDark ?? [0.012, 0.016, 0.024])) },
      uOpacity: { value: 1 },
      uWidth: { value: 1.6 },
      uViewport: { value: new THREE.Vector2(1, 1) },
    },
    defines,
    vertexShader: vertex,
    fragmentShader: fragment,
    side: look.doubleSided || look.smoke ? THREE.DoubleSide : THREE.FrontSide,
    transparent: !!(look.translucent || look.smoke),
    depthWrite: !(look.translucent || look.smoke),
  });
  return m;
}

/**
 * The selection outline for a creature (VIS drives it through uHiColor / uHi like the body): a
 * back-face shell pushed out a constant 1.6 px, following the bones, so it outlines the pose.
 */
export function createMobHull(body: THREE.ShaderMaterial): THREE.ShaderMaterial {
  const u = body.uniforms;
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...u,
      // Shared with the body so one setHi drives both.
      uHiColor: u.uHiColor,
      uHi: u.uHi,
      uFade: u.uFade,
      uBones: u.uBones,
    },
    defines: { HULL: '' },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    transparent: false,
  });
}
