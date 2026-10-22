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
uniform float uWidth;
uniform vec2 uViewport;
out vec3 vWorldPos;
out vec3 vNormal;
out vec4 vColor;
out vec4 vMat;
out vec3 vLocal;
out float vDepth;
#ifdef INSTANCED
// Round 3: many creatures in one draw. Each instance's bones (world space, 3 texels a bone: the
// rows of a 3x4 matrix) are a row of uBoneTex; its flash, fade, glow, seed and highlight come in
// per-instance attributes.
uniform highp sampler2D uBoneTex;
in float iRow;
in vec4 iA;
in vec4 iHi;
in float iSel;
in vec4 iFx;
out vec4 vA;
out vec4 vHi;
out float vSel;
out vec4 vFx;
mat4 boneMat(int bone, int row) {
  vec4 a = texelFetch(uBoneTex, ivec2(bone * 3 + 0, row), 0);
  vec4 b = texelFetch(uBoneTex, ivec2(bone * 3 + 1, row), 0);
  vec4 c = texelFetch(uBoneTex, ivec2(bone * 3 + 2, row), 0);
  return mat4(vec4(a.x, b.x, c.x, 0.0), vec4(a.y, b.y, c.y, 0.0), vec4(a.z, b.z, c.z, 0.0), vec4(a.w, b.w, c.w, 1.0));
}
#else
uniform mat4 uBones[${MAX_BONES}];
#endif
void main() {
#ifdef INSTANCED
  mat4 b = boneMat(int(aBone + 0.5), int(iRow + 0.5));
  vec4 wp = b * vec4(position, 1.0);
  vNormal = normalize(mat3(b) * normal);
  vA = iA;
  vHi = iHi;
  vSel = iSel;
  vFx = iFx;
#else
  mat4 b = uBones[int(aBone + 0.5)];
  vec4 lp = b * vec4(position, 1.0);
  vec3 n = mat3(b) * normal;
  vec4 wp = modelMatrix * lp;
  vNormal = normalize(mat3(modelMatrix) * n);
#endif
  vLocal = position;
  vWorldPos = wp.xyz;
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
uniform vec3 uGlowTint;
#ifdef INSTANCED
in vec4 vA;
in vec4 vHi;
in float vSel;
in vec4 vFx;
#define M_FLASH vA.x
#define M_FADE vA.y
#define M_GLOW vA.z
#define M_SEED vA.w
#define M_HICOL vHi.rgb
#define M_HIAMB vHi.a
#define M_HISEL vSel
#else
uniform vec3 uHiColor;
uniform vec2 uHi;
uniform float uFlash;
uniform float uFade;
uniform float uGlow;
#define M_FLASH uFlash
#define M_FADE uFade
#define M_GLOW uGlow
#define M_SEED uSeed
#define M_HICOL uHiColor
#define M_HIAMB uHi.x
#define M_HISEL uHi.y
#endif
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
  float a = M_HISEL * M_FADE;
  if (a < 0.02) discard;
  fragColor = vec4(sceneOut(M_HICOL * 1.6 * a), 1.0);
  return;
#else
  // Fade in / dissolve: a noise threshold in body space with a glowing seam.
  float dn = vnoise(vLocal * 9.0 + M_SEED * 17.0);
  float edge = M_FADE * 1.06 - dn;
  if (edge < 0.0) discard;
  float seam = (1.0 - smoothstep(0.0, 0.08, edge)) * step(M_FADE, 0.995);

  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float emit = vMat.x;
  float sss = vMat.y;
  float gloss = vMat.z;
  // Surface-gradient bump (Mikkelsen): the detail lives in body space, so it moves with the body.
  float h = fbm(vLocal * uBumpFreq + M_SEED);
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
#ifdef INSTANCED
  // Elites (round 3): an armoured one wears steel plates (darker, glossier, with seams).
  int fxBits = int(vFx.x + 0.5);
  if ((fxBits & 2) != 0 && emit < 0.5) {
    float plateSeam = 1.0 - smoothstep(0.0, 0.035, abs(fract(vLocal.y * 6.0 + vLocal.x * 1.7 + vLocal.z * 0.8) - 0.5) - 0.43);
    albedo = mix(albedo, vec3(0.30, 0.34, 0.38) * (0.85 + 0.3 * h), 0.6) * (1.0 - 0.45 * plateSeam);
    gloss = max(gloss, 0.8);
  }
#endif
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
  float breath = 0.82 + 0.18 * sin(uTime * uPulse + vLocal.y * 5.0 + M_SEED * 6.0);
  vec3 glow = vColor.rgb * uGlowTint * emit * M_GLOW * breath * 3.2;

  // Creatures sit a little under the props' key: their forms read by shading and rim against the
  // lit rock, not as bright cut-outs (the terrain darkens its own surface by cavity and AO).
  color *= MOB_KEY;
  vec4 atm = atmosphere(vWorldPos, vDepth, ls.rgb);
  color = mix(color, atm.rgb, atm.a);
  color += glow * uAtmos.w * (1.0 - atm.a * 0.6);
  // VIS highlight: the rarity rim (ambient) and the selection (stronger).
  color += M_HICOL * (fres * 0.9 + 0.08) * (M_HIAMB * 0.55 + M_HISEL * 1.1);
  // The dissolve seam glows faintly in the creature's own colour.
  color += (uGlowTint * 0.6 + vec3(0.4)) * seam * 0.6;
#ifdef INSTANCED
  // Elites: radiant (a warm gold aura), armoured (a cold steel rim), swift (cyan streaks flowing
  // back along the body), splitting (magenta veins that pulse). One look a creature reads by.
  if (fxBits != 0) {
    float fxk = vFx.y * M_FADE * uAtmos.w;
    if ((fxBits & 1) != 0) color += vec3(1.0, 0.76, 0.36) * (fres * 1.5 + 0.1) * (0.85 + 0.15 * sin(uTime * 3.0 + M_SEED * 6.0)) * fxk;
    if ((fxBits & 2) != 0) color += vec3(0.62, 0.74, 0.86) * fres * 0.55 * fxk;
    if ((fxBits & 4) != 0) {
      float streak = smoothstep(0.82, 1.0, sin(vLocal.z * 10.0 + uTime * 7.0 + vnoise(vLocal * 6.0 + M_SEED) * 3.0));
      color += vec3(0.45, 0.9, 1.0) * (streak * 0.7 + fres * 0.5) * fxk;
    }
    if ((fxBits & 8) != 0) {
      float vein = 1.0 - smoothstep(0.0, 0.05, abs(fbm(vLocal * 4.5 + M_SEED * 3.0) - 0.5));
      color += vec3(0.9, 0.42, 1.0) * vein * (0.55 + 0.45 * sin(uTime * 4.0 + vLocal.y * 7.0)) * 1.1 * fxk;
    }
  }
#endif
  // A hit flash on the mob only (warm white), never the screen.
  color = mix(color, vec3(1.25, 1.08, 0.9), M_FLASH * 0.55);

  float alpha = 1.0;
#ifdef TRANSLUCENT
  alpha = clamp(mix(vColor.a, 1.0, fres * 0.45) + emit * 0.6, 0.0, 1.0) * uOpacity;
#endif
#ifdef SMOKE
  // Smoke: density from a drifting fbm, thin at the edges of each blob, solid in the core.
  float dens = fbm(vWorldPos * 1.6 + vec3(0.0, -uTime * 0.45, uTime * 0.2) + M_SEED);
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

/**
 * Round 3: the instanced material (one per creature kind and part): the bones of every instance
 * come from `boneTex` (a row per instance), the per-creature flash, fade, glow, seed and highlight
 * from instance attributes (iA, iHi, iSel). `hull`: the selection outline of the selected ones.
 */
export function createInstancedMobMaterial(lighting: LightingUniforms, boneTex: THREE.DataTexture, look: MobLook = {}, hull = false): THREE.ShaderMaterial {
  const defines: Record<string, string> = { INSTANCED: '' };
  if (hull) defines.HULL = '';
  else {
    if (look.translucent) defines.TRANSLUCENT = '';
    if (look.smoke) defines.SMOKE = '';
  }
  const glow = new THREE.Color(look.glowTint ?? 0xffffff);
  const sss = new THREE.Color(look.sssTint ?? 0xff9a7a);
  const see = !hull && !!(look.translucent || look.smoke);
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: {
      ...lighting,
      uBoneTex: { value: boneTex },
      uGlowTint: { value: new THREE.Vector3(glow.r, glow.g, glow.b) },
      uPulse: { value: look.pulse ?? 1.4 },
      uSeed: { value: 0 },
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
    side: hull ? THREE.BackSide : look.doubleSided || look.smoke ? THREE.DoubleSide : THREE.FrontSide,
    transparent: see,
    depthWrite: !see && !hull,
  });
}
