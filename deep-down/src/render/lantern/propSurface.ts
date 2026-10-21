// The materials of everything that is not voxel stone (W1-LEAD §4 "visual detail"): props, face blocks, tappables, the
// viewmodel. One PBR prop surface (the painted layers on the prop's own uv, a tint, the amber rim), one crystal surface
// (inner glow, light through the body), one flame/emitter surface. All build a `Surface` and call 1E's `shade()`.
//
// Geometry attributes (props.ts PropBuilder): position, normal, uv (metres along the surface), aProp = (layer, tint,
// seed 0..1, glow). Instanced meshes add aInst = (rim 0..1, state, crack stage, value) per instance.

import * as THREE from 'three';
import { LIGHTING_GLSL, lightingUniforms } from '../light/chunk';
import { LAYER_FINISH } from './layers';
import { TILE_M, type StoneTextures } from './painter';

/** Tints (aProp.y): how a layer is coloured for a built material. */
export const TINT = {
  none: 0,
  gold: 1,
  darkIron: 2,
  brass: 3,
  copper: 4,
  bone: 5,
  rope: 6,
  /** Rune cyan carving (emissive in its grooves). */
  rune: 7,
  /** Wet dark wood (old timber sets). */
  oldWood: 8,
  /** Glass (smoky, lit from inside). */
  glass: 9,
  /** Chalk (bone-white, matte). */
  chalk: 10,
  /** Cobweb strands (pale, translucent-looking, matte). */
  web: 11,
  /** Copper ore metal (native copper nuggets). */
  oreCopper: 12,
  /** Amber gem / rich ore (warm translucent). */
  oreAmber: 13,
  /** Silver-tin ore. */
  oreTin: 14,
  /** Jade / green gem. */
  oreJade: 15,
  /** Still water (puddles): dark, mirror-smooth, reflects the chamber probe. */
  water: 16,
  /** Trim and backing stone: the host rock, darker and rougher (it frames, never competes with, the face). */
  trimStone: 17,
} as const;

/** The amber of the rim and of "you" (SPEC §8.4). */
export const RIM_COLOUR = new THREE.Color().setHex(0xffb35c, THREE.SRGBColorSpace);

export const PROP_UNIFORMS = {
  /** The single amber rim's colour × gain, and the hint rim's (dimmer). */
  uRimColor: { value: RIM_COLOUR.clone().multiplyScalar(1.6) },
  /** World dim of the focus pop (0..0.3): everything but the popped object darkens through the grade. */
  uPropK: { value: new THREE.Vector4(1, 0, 0, 0) },
  /** The breach leak (SPEC §4.2, C14): the promise colour in the joints of the last 3 slices (linear × gain). */
  uLeakColor: { value: new THREE.Color(0, 0, 0) },
};

const FINISH_GLSL = `const vec2 P_FINISH[${LAYER_FINISH.length}] = vec2[${LAYER_FINISH.length}](${LAYER_FINISH.map((f) => `vec2(${f.rough.toFixed(3)}, ${f.metal.toFixed(1)})`).join(', ')});`;

const PROP_VERT = /* glsl */ `
attribute vec4 aProp;
#ifdef USE_INSTANCING
attribute vec4 aInst;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vLocal;
flat varying vec4 vProp;
flat varying vec4 vInst;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  vInst = aInst;
#else
  vInst = vec4(0.0);
#endif
  vLocal = position;
  vec4 wp = m * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(m) * normal);
  vUv = uv;
  vProp = aProp;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PROP_FRAG = /* glsl */ `
${LIGHTING_GLSL}
uniform highp sampler2DArray tStoneA;
uniform highp sampler2DArray tStoneB;
uniform vec3 uRimColor;
uniform vec4 uPropK;
uniform vec3 uLeakColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
varying vec3 vLocal;
flat varying vec4 vProp;
flat varying vec4 vInst;
${FINISH_GLSL}

// Cotangent frame from screen derivatives (no tangent attribute needed).
mat3 cotangentFrame(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)) + 1e-12);
  return mat3(T * invmax, B * invmax, N);
}

void main() {
  vec3 ng = normalize(vNormal);
  if (!gl_FrontFacing) ng = -ng;
  float layer = vProp.x;
  int tint = int(vProp.y + 0.5);
  // Instanced tint override (aInst.w 1..99: nuggets of an ore kind); 100+ = the face's leak flag.
  if (vInst.w > 0.5 && vInst.w < 99.5) tint = int(vInst.w + 0.5);
  float seed = vProp.z;
  int glow = int(vProp.w + 0.5);
  vec2 uv = vUv / ${TILE_M.toFixed(3)} + seed * 7.31;
  vec4 ta = texture(tStoneA, vec3(uv, layer));
  vec4 tb = texture(tStoneB, vec3(uv, layer));
  vec3 alb = ta.rgb * (0.94 + 0.12 * fract(seed * 13.7));
  vec2 fin = P_FINISH[int(layer + 0.5)];
  float rough = mix(fin.x, tb.z, 0.7);
  float metal = fin.y * tb.w;
  vec3 emis = vec3(0.0);
  float sss = 0.0;
  vec3 sssC = alb;
  float wet = 0.0;
  float nk = 1.0;
  // Built material tints (value-capped: never brighter than the suggestion).
  if (tint == 1) { alb = vec3(0.95, 0.66, 0.24) * (0.75 + 0.35 * ta.r / max(ta.g, 0.05)); metal = 1.0; rough = 0.3; nk = 0.4; }
  else if (tint == 2) { alb *= vec3(0.5, 0.48, 0.47); metal = 0.85; rough = 0.55; }
  else if (tint == 3) { alb = mix(vec3(0.6, 0.42, 0.16), vec3(0.85, 0.64, 0.32), ta.g); metal = 1.0; rough = 0.38; nk = 0.5; }
  else if (tint == 4) { alb = mix(vec3(0.55, 0.22, 0.1), vec3(0.95, 0.52, 0.3), ta.g); metal = 1.0; rough = 0.32; nk = 0.5; }
  else if (tint == 5) { alb = vec3(0.72, 0.68, 0.6) * (0.85 + 0.3 * ta.g); rough = 0.75; }
  else if (tint == 6) { alb = vec3(0.42, 0.33, 0.22) * (0.8 + 0.4 * ta.g); rough = 0.9; }
  else if (tint == 7) { alb *= 0.7; emis = vec3(0.18, 0.72, 0.85) * smoothstep(0.55, 0.3, ta.a) * 0.9; }
  else if (tint == 8) { alb *= vec3(0.78, 0.74, 0.7); rough = 0.8; }
  else if (tint == 10) { alb = vec3(0.86, 0.84, 0.78); rough = 0.95; nk = 0.2; }
  else if (tint == 11) { alb = vec3(0.7, 0.72, 0.74); rough = 0.9; nk = 0.0; sss = 0.5; sssC = vec3(0.6); }
  else if (tint == 12) { alb = mix(vec3(0.45, 0.17, 0.07), vec3(0.98, 0.56, 0.3), ta.g); metal = 1.0; rough = 0.28; nk = 0.35; }
  else if (tint == 13) { alb = vec3(0.95, 0.6, 0.18); rough = 0.18; sss = 0.8; sssC = vec3(1.0, 0.55, 0.15); emis = vec3(0.3, 0.14, 0.03); nk = 0.2; }
  else if (tint == 14) { alb = mix(vec3(0.5, 0.52, 0.56), vec3(0.85, 0.88, 0.92), ta.g); metal = 1.0; rough = 0.3; nk = 0.35; }
  else if (tint == 15) { alb = vec3(0.3, 0.85, 0.5); rough = 0.2; sss = 0.8; sssC = vec3(0.2, 0.9, 0.5); emis = vec3(0.04, 0.2, 0.08); nk = 0.2; }
  else if (tint == 16) { alb = vec3(0.05, 0.06, 0.065); rough = 0.04; wet = 1.0; nk = 0.05; }
  else if (tint == 17) { alb *= vec3(0.5, 0.52, 0.56); rough = 0.9; }
  // Normal from the layer's height (cotangent frame), damped on smooth built materials.
  vec3 n = ng;
  if (nk > 0.0) {
    mat3 TBN = cotangentFrame(ng, vWorld, uv);
    vec2 tn = (tb.xy * 2.0 - 1.0) * nk;
    n = normalize(TBN * vec3(tn, 1.0));
  }
  // Face blocks (aInst.z = packed tap point + 1) are fresh fractures: the host rock broken open, lighter and a little
  // warmer than the weathered walls and dusted with rock flour in the pores (the face is the brightest large stone of
  // a drift frame under the same light, C4; capped at 0.55 albedo).
  if (vInst.z > 0.5) {
    float flour = smoothstep(0.35, 0.15, ta.a) * 0.06;
    alb = min(alb * vec3(1.34, 1.26, 1.14) + vec3(0.014, 0.012, 0.009) + flour, vec3(0.55));
  }
  // Cracks grow from the tap point as HP falls (aInst.y = left).
  if (vInst.z > 0.5 && vInst.y < 0.999) {
    float packed = vInst.z - 1.0;
    vec2 tp = (vec2(floor(packed / 64.0), mod(packed, 64.0)) / 63.0 - 0.5) * vec2(0.75, 0.77);
    vec2 f = vLocal.xy - tp;
    float stage = 1.0 - vInst.y;
    float a = atan(f.y, f.x);
    float r = length(f);
    float k = 0.0;
    for (int j = 0; j < 6; j++) {
      float aj = float(j) * 1.0472 + 0.5 * sin(float(j) * 2.7 + packed);
      float da = abs(mod(a - aj - 0.3 * sin(r * 11.0 + float(j)) + 3.1416, 6.2832) - 3.1416);
      float w = 0.035 * (1.0 - r * 1.2);
      k = max(k, (1.0 - smoothstep(w * 0.35, w, da * r)) * step(r, stage * 0.62));
    }
    k *= step(0.3, vLocal.z);
    alb *= 1.0 - 0.85 * k;
    rough = mix(rough, 1.0, k);
  }
  // The breach leak: a hairline of the promise colour along the block's edges (the joints), last 3 slices.
  if (vInst.w > 99.5) {
    float ex = 0.375 - abs(vLocal.x), ey = 0.385 - abs(vLocal.y);
    float edge = 1.0 - smoothstep(0.0, 0.02, min(ex, ey));
    emis += uLeakColor * edge * step(0.3, vLocal.z);
  }
  if (glow == 1) emis += vec3(1.0, 0.6, 0.25) * 2.2; // a lamp's lit glass / ember
  else if (glow == 2) emis += vec3(0.25, 0.85, 1.0) * 1.2; // rune seam
  else if (glow == 3) emis += vec3(0.35, 0.95, 0.5) * 1.1; // glowroot
  Surface s = surfaceInit(alb, n);
  s.geoNormal = ng;
  s.roughness = rough;
  s.metal = metal;
  s.emission = emis;
  s.sss = sss;
  s.sssColor = sssC;
  s.wet = wet;
  vec3 V = normalize(cameraPosition - vWorld);
  vec3 col = shade(s, vWorld, V);
  // The single amber rim (SPEC §6.1): a soft Fresnel edge on the suggested object, static (no pulse).
  float rim = vInst.x;
  if (rim > 0.0) {
    float nv = clamp(dot(ng, V), 0.0, 1.0);
    col += uRimColor * rim * (pow(1.0 - nv, 2.2) * 0.9 + 0.06);
  }
  gl_FragColor = lightOut(col, vWorld);
}
`;

/** Crystals and gems: a luminous heart low in the body, thin lit facet edges, light through the body (sss), glints. */
const CRYSTAL_VERT = /* glsl */ `
attribute vec4 aCry;
#ifdef USE_INSTANCING
attribute vec4 aInst;
#endif
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vCry;
flat varying vec4 vInst;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = modelMatrix * instanceMatrix;
  vInst = aInst;
#else
  vInst = vec4(0.0);
#endif
  vec4 wp = m * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(m) * normal);
  vCry = aCry;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const CRYSTAL_FRAG = /* glsl */ `
${LIGHTING_GLSL}
uniform vec3 uPal[6];
uniform vec3 uDeep[6];
uniform float uCrystalGain;
uniform vec3 uRimColor;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec4 vCry;
flat varying vec4 vInst;
void main() {
  int ci = int(vCry.w + 0.5);
  vec3 glow = uPal[0];
  vec3 deep = uDeep[0];
  for (int i = 1; i < 6; i++) if (i == ci) { glow = uPal[i]; deep = uDeep[i]; }
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = abs(dot(n, V));
  float t = vCry.x;
  vec2 f = vCry.yz;
  float e;
  if (f.x > 1.5) { float b0 = f.x - 2.0, b1 = f.y; e = min(min(b0, b1), 1.0 - b0 - b1) * 1.5; }
  else e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  float fw = fwidth(e) * 1.5;
  float edge = 1.0 - smoothstep(0.012, 0.05 + fw, e);
  float centre = smoothstep(0.0, 0.45, e);
  float axial = 1.0 - t;
  float core = pow(axial, 1.1) * (0.35 + 0.65 * centre);
  // Harvested crystals (vInst.y = remaining 0..1) dim toward the host rock.
  float alive = mix(1.0, vInst.y, step(0.001, vInst.w));
  vec3 emis = glow * (0.05 + 0.85 * core) * uCrystalGain * alive;
  emis += mix(glow, vec3(0.85, 1.0, 1.0), 0.3) * edge * (0.06 + 0.25 * axial) * uCrystalGain * alive;
  emis += glow * smoothstep(0.82, 1.0, t) * 0.12 * uCrystalGain * alive;
  Surface s = surfaceInit(deep * 0.9, n);
  s.roughness = 0.08;
  s.sss = 0.9;
  s.sssColor = glow;
  s.emission = min(emis, vec3(1.5));
  s.specCap = 2.5;
  vec3 col = shade(s, vWorld, V);
  float rim = vInst.x;
  if (rim > 0.0) col += uRimColor * rim * (pow(1.0 - ndv, 2.2) * 0.9 + 0.06);
  gl_FragColor = lightOut(col, vWorld);
}
`;

/** Flames, glowing glass, lit lamp hearts: emission only, fog applied (no shadow, no specular). */
const GLOW_FRAG = /* glsl */ `
${LIGHTING_GLSL}
uniform vec3 uGlowColor;
uniform float uGlow;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vUv;
flat varying vec4 vProp;
flat varying vec4 vInst;
void main() {
  vec3 n = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorld);
  float core = pow(abs(dot(n, V)), 1.5);
  vec3 c = mix(uGlowColor * vec3(1.0, 0.55, 0.25), mix(uGlowColor, vec3(1.0, 0.95, 0.85), 0.5), core) * uGlow;
  // Instanced lamps: vInst.y = lit 0..1.
#ifdef USE_INSTANCING
  c *= vInst.y;
#endif
  gl_FragColor = vec4(lightFog(c, vWorld), 1.0);
}
`;

export const CRYSTAL_PALETTE = {
  /** 0 cyan, 1 violet, 2 rose, 3 amber, 4 jade, 5 glowroot green. */
  glow: [0x3fdcf4, 0x9a6bff, 0xd27cff, 0xffb347, 0x6ff0a8, 0x9be7a8],
  deep: [0x06222c, 0x170c33, 0x2a0b3a, 0x3a1c06, 0x062a18, 0x0c2414],
};

export interface PropMaterials {
  prop: THREE.ShaderMaterial;
  crystal: THREE.ShaderMaterial;
  glow: THREE.ShaderMaterial;
}

let shared: PropMaterials | null = null;

/** The shared prop materials (one program each; instanced meshes compile their own variant once). */
export function propMaterials(tex: StoneTextures): PropMaterials {
  if (shared) return shared;
  const L = lightingUniforms();
  const pal = (hexes: number[]) => hexes.map((h) => new THREE.Color().setHex(h, THREE.SRGBColorSpace));
  const prop = new THREE.ShaderMaterial({
    uniforms: { ...L, ...PROP_UNIFORMS, tStoneA: { value: tex.albedo }, tStoneB: { value: tex.normal } },
    vertexShader: PROP_VERT,
    fragmentShader: PROP_FRAG,
  });
  prop.name = 'lanternProp';
  const crystal = new THREE.ShaderMaterial({
    uniforms: { ...L, ...PROP_UNIFORMS, uPal: { value: pal(CRYSTAL_PALETTE.glow) }, uDeep: { value: pal(CRYSTAL_PALETTE.deep) }, uCrystalGain: { value: 1 } },
    vertexShader: CRYSTAL_VERT,
    fragmentShader: CRYSTAL_FRAG,
  });
  crystal.name = 'lanternCrystal';
  const glow = new THREE.ShaderMaterial({
    uniforms: { ...L, uGlowColor: { value: new THREE.Color().setHex(0xffb35c, THREE.SRGBColorSpace) }, uGlow: { value: 3 } },
    vertexShader: PROP_VERT,
    fragmentShader: GLOW_FRAG,
  });
  glow.name = 'lanternGlow';
  shared = { prop, crystal, glow };
  return shared;
}
