// The Lantern Voxel stone surface (W1-LEAD §1, §4): the world shader of the chunk meshes. It builds a `Surface` from the
// painted layers and calls 1E's `shade()` (src/render/light/chunk.ts); it never computes lighting itself.
//
//   albedo     biplanar world-space sampling of the layer at two scales and rotations (never a tile, never a repeat
//              within 8 m), ±6 % value per 0.5 m block, the biome tone and a slow macro hue drift;
//   normal     the layer's height-derived normal, a per-block plate tilt, and a resolution-free micro-relief at arm's
//              length (height, normal and roughness), faded out by screen-space frequency so it never shimmers;
//   roughness  the layer's, wet floors (puddles in the low spots near walls) darker and glossy;
//   metal      iron and brass layers;
//   ao         the mesher's vertex AO (1E's GTAO multiplies on top);
//   emission   glowroot, crystal, gold and rune seams by glow class, capped (≤ 1.5 HDR).

import * as THREE from 'three';
import { LIGHTING_GLSL, lightingUniforms } from '../light/chunk';
import { LAYER, LAYER_FINISH } from './layers';
import { TILE_M, type StoneTextures } from './painter';

/** Shared look uniforms of the stone surface (one write restyles every chunk). */
export const SURFACE_UNIFORMS = {
  /** Biome tint of the stone (multiplies albedo, ~1). */
  uStoneTint: { value: new THREE.Color(1, 1, 1) },
  /** Emission gains per glow class 1..6 (glowroot, crystal, gold, ember, violet, rune). */
  uGlowGain: { value: [1, 1, 1, 1, 1, 1] as number[] },
  /** x wet-floor amount (0..1), y micro-detail strength, z macro hue drift, w unused. */
  uSurfaceK: { value: new THREE.Vector4(0.6, 1, 1, 0) },
  /** Strike cracks on world cells (skin): xyz centre, w stage 0..1 (0 = none). Up to 4. */
  uCracks: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
};

const FINISH_GLSL = `const vec2 L_FINISH[${LAYER_FINISH.length}] = vec2[${LAYER_FINISH.length}](${LAYER_FINISH.map((f) => `vec2(${f.rough.toFixed(3)}, ${f.metal.toFixed(1)})`).join(', ')});`;

export const SURFACE_VERT = /* glsl */ `
attribute vec4 aMat;
attribute vec4 aMat2;
varying vec3 vWorld;
varying vec3 vNormal;
flat varying vec4 vMatF;
flat varying vec4 vMat2F;
varying float vAo;
varying float vEdge;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vMatF = aMat;
  vMat2F = aMat2;
  vAo = aMat.z / 255.0;
  vEdge = aMat2.w / 255.0;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const SURFACE_FRAG = /* glsl */ `
${LIGHTING_GLSL}
uniform highp sampler2DArray tStoneA;
uniform highp sampler2DArray tStoneB;
uniform vec3 uStoneTint;
uniform float uGlowGain[6];
uniform vec4 uSurfaceK;
uniform vec4 uCracks[4];
varying vec3 vWorld;
varying vec3 vNormal;
flat varying vec4 vMatF;
flat varying vec4 vMat2F;
varying float vAo;
varying float vEdge;
${FINISH_GLSL}

float sh11(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float vn3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh11(i), sh11(i + vec3(1, 0, 0)), f.x), mix(sh11(i + vec3(0, 1, 0)), sh11(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(sh11(i + vec3(0, 0, 1)), sh11(i + vec3(1, 0, 1)), f.x), mix(sh11(i + vec3(0, 1, 1)), sh11(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
mat2 rot2(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

// One biplanar-style projection: the two dominant axes of the normal, sharp blend.
struct Tap { vec4 a; vec4 b; };
Tap sampleAxis(vec2 uv, float layer) { Tap t; t.a = texture(tStoneA, vec3(uv, layer)); t.b = texture(tStoneB, vec3(uv, layer)); return t; }

void main() {
  vec3 ng = normalize(vNormal);
  if (!gl_FrontFacing) ng = -ng;
  float layer = vMatF.x;
  float seed = vMatF.y / 255.0;
  int glow = int(vMatF.w + 0.5);
  float tone = vMat2F.x / 128.0;
  int face = int(vMat2F.y + 0.5);
  vec3 p = vWorld;
  // The block this fragment belongs to (0.5 m cells; the face normal steps inside it).
  vec3 axisN = face == 0 ? vec3(1, 0, 0) : face == 1 ? vec3(-1, 0, 0) : face == 2 ? vec3(0, 1, 0) : face == 3 ? vec3(0, -1, 0) : face == 4 ? vec3(0, 0, 1) : vec3(0, 0, -1);

  // Biplanar: the projection plane of the face axis, and a second one for the bevels.
  vec3 an = abs(ng);
  vec2 uvX = p.zy, uvY = p.xz, uvZ = p.xy;
  vec2 uv1 = face < 2 ? uvX : face < 4 ? uvY : uvZ;
  // Second plane: the next largest normal component (bevel strips turn toward it).
  vec2 uv2; float w2;
  if (face < 2) { uv2 = an.y > an.z ? uvY : uvZ; w2 = max(an.y, an.z); }
  else if (face < 4) { uv2 = an.x > an.z ? uvX : uvZ; w2 = max(an.x, an.z); }
  else { uv2 = an.x > an.y ? uvX : uvY; w2 = max(an.x, an.y); }
  float w1 = face < 2 ? an.x : face < 4 ? an.y : an.z;
  vec2 ww = pow(vec2(w1, w2), vec2(6.0));
  ww /= (ww.x + ww.y);

  // Two scales, rotated against each other (no visible period), blended by a slow world noise.
  float macro = vn3(p * 0.21 + 3.1);
  float mixK = smoothstep(0.3, 0.7, vn3(p * 0.37 + 11.7));
  vec2 s1 = uv1 / ${TILE_M.toFixed(3)};
  vec2 s1b = rot2(0.61) * uv1 / ${(TILE_M * 1.618).toFixed(3)} + 0.37;
  Tap A = sampleAxis(s1, layer);
  Tap A2 = sampleAxis(s1b, layer);
  vec4 ta = mix(A.a, A2.a, mixK * 0.55);
  vec4 tb = mix(A.b, A2.b, mixK * 0.55);
  if (ww.y > 0.02) {
    Tap Bt = sampleAxis(uv2 / ${TILE_M.toFixed(3)} + 0.5, layer);
    ta = mix(ta, Bt.a, ww.y);
    tb = mix(tb, Bt.b, ww.y);
  }
  vec3 alb = ta.rgb;
  float height = ta.a;

  // Per block: ±6 % value, a little warmth drift, the biome tone; slow macro hue drift across the wall.
  alb *= (0.94 + 0.12 * seed) * tone;
  alb *= mix(vec3(0.95, 0.98, 1.04), vec3(1.05, 1.0, 0.94), macro * uSurfaceK.z);
  alb *= uStoneTint;

  // Tangent frame of the projection plane (world axes), the painted normal, the per-block plate tilt.
  vec3 T = face < 2 ? vec3(0, 0, 1) : vec3(1, 0, 0);
  vec3 Bv = face < 2 || face > 3 ? vec3(0, 1, 0) : vec3(0, 0, 1);
  vec2 tn = tb.xy * 2.0 - 1.0;
  vec3 n = normalize(ng + (T * tn.x + Bv * tn.y) * mix(1.0, 0.6, vEdge));
  vec2 tilt = (vec2(fract(seed * 17.3), fract(seed * 31.7)) - 0.5) * 0.09;
  n = normalize(n + (T * tilt.x + Bv * tilt.y) * (1.0 - vEdge));

  // Micro-relief at arm's length: resolution-free, faded by screen frequency (never below 2 scene pixels: C13).
  float fw = length(fwidth(p));
  float micro = (1.0 - smoothstep(0.006, 0.02, fw)) * uSurfaceK.y;
  if (micro > 0.01) {
    vec3 q = p * 26.0;
    float m0 = vn3(q), mx = vn3(q + vec3(0.21, 0, 0)), my = vn3(q + vec3(0, 0.21, 0)), mz = vn3(q + vec3(0, 0, 0.21));
    vec3 g = vec3(mx - m0, my - m0, mz - m0) / 0.21;
    g -= ng * dot(g, ng);
    n = normalize(n - g * 0.035 * micro);
    alb *= 1.0 + (m0 - 0.5) * 0.08 * micro;
  }

  vec2 fin = L_FINISH[int(layer + 0.5)];
  float rough = mix(fin.x, tb.z, 0.7);
  float metal = fin.y * tb.w;

  // Wet floors: puddles in the low spots of up-facing stone (never on timber or metal), darker and glossy.
  float wet = 0.0;
  if (face == 2 && fin.y < 0.5 && layer != ${LAYER.timber.toFixed(1)}) {
    float pud = vn3(p * vec3(0.55, 0.0, 0.55) + 7.3) * 0.65 + vn3(p * 1.9 + 2.1) * 0.35;
    wet = smoothstep(0.62, 0.7, pud + (0.5 - height) * 0.3) * uSurfaceK.x;
    // Damp halo around a puddle.
    wet = max(wet, smoothstep(0.55, 0.66, pud) * 0.35 * uSurfaceK.x);
  }

  // Strike cracks on world cells (wall skin): tapered grooves radiating from the struck point.
  for (int i = 0; i < 4; i++) {
    vec4 c = uCracks[i];
    if (c.w <= 0.0) continue;
    vec3 d = p - c.xyz;
    if (dot(d, d) > 0.3) continue;
    vec2 f = face < 2 ? d.zy : face < 4 ? d.xz : d.xy;
    float a = atan(f.y, f.x);
    float r = length(f);
    float k = 0.0;
    for (int j = 0; j < 5; j++) {
      float aj = float(j) * 1.2566 + 0.4 * sin(float(j) * 2.7 + c.x);
      float da = abs(mod(a - aj - 0.35 * sin(r * 9.0 + float(j)) + 3.1416, 6.2832) - 3.1416);
      float w = 0.045 * (1.0 - r * 1.6);
      k = max(k, (1.0 - smoothstep(w * 0.4, w, da * r)) * step(r, c.w * 0.45));
    }
    alb *= 1.0 - 0.8 * k;
    rough = mix(rough, 1.0, k);
  }

  // Emission by glow class (the layer's mask carries where the seam is).
  vec3 emis = vec3(0.0);
  if (glow == 7) {
    // A cracked wall (a secret): jagged fracture lines across the blocks, a faint cool draught in the deepest.
    vec2 q = uv1 * 1.7;
    float cr = 0.0;
    for (int j = 0; j < 3; j++) {
      float fj = float(j);
      float line = abs(q.y - (0.9 * sin(q.x * (1.3 + fj * 0.7) + fj * 2.1) + 0.35 * sin(q.x * 4.1 + fj)) - fj * 0.8 + 0.8);
      cr = max(cr, 1.0 - smoothstep(0.015, 0.045, line));
    }
    alb *= 1.0 - 0.75 * cr;
    rough = mix(rough, 1.0, cr);
    emis += vec3(0.12, 0.2, 0.26) * cr * 0.25;
    glow = 0;
  }
  if (glow > 0) {
    vec3 gc = glow == 1 ? vec3(0.35, 0.95, 0.5) : glow == 2 ? vec3(0.25, 0.85, 1.0) : glow == 3 ? vec3(1.0, 0.72, 0.28)
            : glow == 4 ? vec3(1.0, 0.45, 0.12) : glow == 5 ? vec3(0.6, 0.4, 1.0) : vec3(0.3, 0.85, 0.95);
    float gm = max(tb.w, 0.12);
    emis = gc * gm * 1.2 * uGlowGain[glow - 1];
  }

  Surface s = surfaceInit(alb, n);
  s.geoNormal = ng;
  s.roughness = rough;
  s.metal = metal;
  s.ao = vAo;
  s.emission = min(emis, vec3(1.5));
  s.wet = wet;
  vec3 V = normalize(cameraPosition - p);
  vec3 col = shade(s, p, V);
  gl_FragColor = lightOut(col, p);
}
`;

/** The stone surface material (one per renderer: every chunk mesh shares it). */
export function createSurfaceMaterial(tex: StoneTextures): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: { ...lightingUniforms(), ...SURFACE_UNIFORMS, tStoneA: { value: tex.albedo }, tStoneB: { value: tex.normal } },
    vertexShader: SURFACE_VERT,
    fragmentShader: SURFACE_FRAG,
  });
  m.name = 'lanternStone';
  return m;
}
