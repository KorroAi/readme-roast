// The post-world lighting passes (W1-LEAD §4.4–§4.5; owner 1E), run by PostFX between the world pass and the overlay:
//
//   depth    half resolution: linear view depth from the scene's depth texture (checkerboard min/max, edges kept)
//   gtao     half resolution: ground-truth AO (2 slices × 2 sides × 4 steps, a 4 × 4 interleaved rotation)
//   aoBlur   half resolution: a 4 × 4 depth-aware blur (removes the rotation pattern exactly; nothing animates)
//   vol      half resolution: raymarched single scattering of the lantern (shadowed on High), the practicals and the
//            LightField's light (the sky shaft, crystals, lamps, the breach leak), with the height fog; blue-noise
//            (IGN) jitter per frame and temporal accumulation (converges at rest, so the air is still)
//   composite (scene resolution, in PostFX): AO on the indirect share only, then fog: c · T + in-scatter
//
// Every program compiles at construction; the presets switch passes and uniforms, never defines.

import * as THREE from 'three';
import { LIGHT_UNIFORMS } from './uniforms';

const VERT = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Linearise a [0, 1] perspective depth (three's WebGL convention) to positive view distance. */
const LINEAR_DEPTH = /* glsl */ `
float linDepth(float d, float n, float f) {
  float z = d * 2.0 - 1.0;
  return (2.0 * n * f) / (f + n - z * (f - n));
}
`;

const DEPTH_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;
uniform vec2 uTexel;     // full-res texel (allocation)
uniform vec2 uScale;     // half-res uv -> full-res allocation uv
uniform vec2 uMax;
uniform vec2 uNearFar;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${LINEAR_DEPTH}
void main() {
  vec2 uv = vUv * uScale;
  float a = texture(tDepth, min(uv + uTexel * vec2(-0.5, -0.5), uMax)).r;
  float b = texture(tDepth, min(uv + uTexel * vec2(0.5, -0.5), uMax)).r;
  float c = texture(tDepth, min(uv + uTexel * vec2(-0.5, 0.5), uMax)).r;
  float d = texture(tDepth, min(uv + uTexel * vec2(0.5, 0.5), uMax)).r;
  // Checkerboard min/max: both sides of every depth edge survive the downsample.
  ivec2 p = ivec2(gl_FragCoord.xy);
  float pick = ((p.x + p.y) & 1) == 0 ? min(min(a, b), min(c, d)) : max(max(a, b), max(c, d));
  fragColor = vec4(linDepth(pick, uNearFar.x, uNearFar.y), pick, 0.0, 1.0);
}
`;

const GTAO_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tDepth;   // the scene's full-resolution depth texture (24-bit: half floats band on slopes)
uniform vec2 uScaleFull;    // screen uv -> scene allocation uv
uniform vec2 uMaxFull;
uniform vec2 uNearFar;
uniform vec2 uLive;         // half-res live size (px)
uniform vec2 uTanHalf;      // tan(fov/2) in x and y
uniform float uRadius;      // world radius (m)
uniform float uPower;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
#define PI 3.14159265
${LINEAR_DEPTH}
float depthAt(vec2 s) { return linDepth(texture(tDepth, min(s * uScaleFull, uMaxFull)).r, uNearFar.x, uNearFar.y); }
vec3 viewPos(vec2 s, float z) { return vec3((s * 2.0 - 1.0) * uTanHalf * z, -z); }
void main() {
  vec2 s = vUv;
  float z = depthAt(s);
  if (z > 80.0) { fragColor = vec4(1.0); return; }
  vec3 P = viewPos(s, z);
  vec2 px = 1.0 / uLive;
  // Normal from depth: the smaller difference on each axis (no halos across edges).
  vec3 pr = viewPos(s + vec2(px.x, 0.0), depthAt(s + vec2(px.x, 0.0)));
  vec3 pl = viewPos(s - vec2(px.x, 0.0), depthAt(s - vec2(px.x, 0.0)));
  vec3 pu = viewPos(s + vec2(0.0, px.y), depthAt(s + vec2(0.0, px.y)));
  vec3 pd = viewPos(s - vec2(0.0, px.y), depthAt(s - vec2(0.0, px.y)));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  vec3 V = normalize(-P);
  if (dot(N, V) < 0.0) N = -N;
  // The 4 x 4 interleaved rotation and step offset (removed exactly by the 4 x 4 blur).
  ivec2 ip = ivec2(gl_FragCoord.xy) & 3;
  // A 4 x 4 Bayer table: 16 distinct rotations over each 4 x 4 tile, and 16 distinct step offsets.
  const float BAYER[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  float b = BAYER[ip.y * 4 + ip.x];
  float n1 = (b + 0.5) / 16.0;
  float n2 = fract(b * 0.3125 + 0.03125);
  // The radius in uv on screen.
  float rUv = uRadius / (z * 2.0 * uTanHalf.y);
  rUv = min(rUv, 0.12);
  float vis = 0.0;
  for (int sl = 0; sl < 2; sl++) {
    float phi = (float(sl) + n1) * (PI * 0.5);
    vec2 dir = vec2(cos(phi), sin(phi));
    vec2 dirUv = dir * vec2(uLive.y / uLive.x, 1.0) * rUv;
    vec3 sliceDir = vec3(dir, 0.0);
    vec3 ortho = normalize(sliceDir - V * dot(sliceDir, V));
    vec3 axis = cross(ortho, V);
    vec3 projN = N - axis * dot(N, axis);
    float projLen = length(projN);
    float cosN = clamp(dot(projN / max(projLen, 1e-4), V), -1.0, 1.0);
    float n = sign(dot(projN, ortho)) * acos(cosN);
    float c0 = -1.0;
    float c1 = -1.0;
    for (int st = 0; st < 4; st++) {
      float t = (float(st) + n2 + 0.15) / 4.0;
      t = t * t;
      vec2 o = dirUv * t;
      for (int side = 0; side < 2; side++) {
        vec2 q = side == 0 ? s - o : s + o;
        if (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) continue;
        vec3 S = viewPos(q, depthAt(q));
        vec3 dv = S - P;
        float len = length(dv);
        float ch = dot(dv / max(len, 1e-4), V);
        float fall = clamp(len / uRadius * 1.25 - 0.25, 0.0, 1.0);
        ch = mix(ch, -1.0, fall * fall);
        if (side == 0) c0 = max(c0, ch); else c1 = max(c1, ch);
      }
    }
    float h0 = -acos(clamp(c0, -1.0, 1.0));
    float h1 = acos(clamp(c1, -1.0, 1.0));
    h0 = n + max(h0 - n, -PI * 0.5);
    h1 = n + min(h1 - n, PI * 0.5);
    float sn = sin(n);
    float a0 = 0.25 * (-cos(2.0 * h0 - n) + cosN + 2.0 * h0 * sn);
    float a1 = 0.25 * (-cos(2.0 * h1 - n) + cosN + 2.0 * h1 * sn);
    vis += projLen * (a0 + a1);
  }
  vis = clamp(vis * 0.5, 0.0, 1.0);
  // Fade the effect out with distance (far walls keep their baked AO only).
  vis = mix(vis, 1.0, smoothstep(24.0, 40.0, z));
  fragColor = vec4(pow(vis, uPower), z, 0.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tAo;      // r: ao, g: linear depth
uniform vec2 uLive;
uniform vec2 uAlloc;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec2 base = floor(vUv * uLive) - 1.5;
  vec2 c = texture(tAo, min(vUv * uLive, uLive - 0.5) / uAlloc).rg;
  float sum = 0.0;
  float w = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 p = clamp(base + vec2(float(x), float(y)) + 0.5, vec2(0.5), uLive - 0.5);
      vec2 t = texture(tAo, p / uAlloc).rg;
      float k = 1.0 / (1e-3 + abs(t.g - c.g) / max(c.g, 0.1) * 24.0);
      k = min(k, 30.0);
      sum += t.r * k;
      w += k;
    }
  }
  fragColor = vec4(sum / max(w, 1e-4), c.g, 0.0, 1.0);
}
`;

const VOL_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler2D tDepthH;
uniform sampler2D tHistory;
uniform vec2 uLive;
uniform vec2 uAlloc;
uniform vec2 uTanHalf;
uniform mat4 uCamWorld;     // camera matrixWorld
uniform mat4 uPrevViewProj; // last frame's projection x view
uniform vec3 uCamPos;
uniform vec4 uVol;          // x steps, y max distance, z history weight floor, w 1 = history valid
uniform vec4 uVolLight;     // x lantern scatter, y field scatter, z practical scatter, w anisotropy g
uniform float uVolShadow;   // 1 = the lantern's cube shadow in the march (High)
uniform float uJitter;      // per-frame jitter offset
uniform vec4 uL_Lantern;
uniform vec4 uL_LanternColor;
uniform vec4 uL_LanternShape;
uniform samplerCube uL_ShadowA;
uniform vec4 uL_ShadowAPos;
uniform vec4 uL_PracPos[8];
uniform vec4 uL_PracCol[8];
uniform int uL_PracCount;
uniform highp sampler3D uL_Irr;
uniform vec3 uL_IrrOrigin;
uniform vec3 uL_IrrInvSize;
uniform vec4 uL_IrrParams;
uniform vec3 uL_FogColor;
uniform vec4 uL_Fog;
uniform vec4 uL_Shaft[2];
uniform vec4 uL_ShaftDir[2];
uniform vec4 uL_ShaftCol[2];
uniform int uL_ShaftCount;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
#define PI 3.14159265
float shaftAt(int i, vec3 p) {
  vec4 a = uL_Shaft[i];
  vec4 d = uL_ShaftDir[i];
  vec3 v = p - a.xyz;
  float t = dot(v, d.xyz);
  if (t < 0.0 || t > d.w) return 0.0;
  float r = length(v - d.xyz * t);
  float soft = clamp(uL_ShaftCol[i].w, 0.05, 1.0);
  return (1.0 - smoothstep(a.w * (1.0 - soft), a.w, r)) * smoothstep(0.0, 0.6, t) * (1.0 - smoothstep(d.w * 0.85, d.w, t));
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float hg(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * c, 1e-3), 1.5));
}
float lanternAtt(float d) {
  float s = uL_LanternShape.x;
  float att = 1.0 / (1.0 + d * d / (s * s));
  float w = clamp(1.0 - pow(d / max(uL_LanternColor.w, 0.5), 4.0), 0.0, 1.0);
  return att * w * w;
}
float sigmaAt(vec3 x) {
  return uL_Fog.x + uL_Fog.w * exp(-max(x.y - uL_Fog.y, 0.0) * uL_Fog.z);
}
void main() {
  vec2 s = vUv;
  vec2 tex = min(s * uLive, uLive - 0.5) / uAlloc;
  float z = texture(tDepthH, tex).r;
  vec3 vdir = normalize(vec3((s * 2.0 - 1.0) * uTanHalf, -1.0));
  float dist = z / max(-vdir.z, 1e-3);
  vec3 rd = normalize(mat3(uCamWorld) * vdir);
  float maxD = min(dist, uVol.y);
  int steps = int(uVol.x + 0.5);
  float dt = maxD / float(max(steps, 1));
  float j = fract(ign(gl_FragCoord.xy) + uJitter);
  vec3 ins = vec3(0.0);
  float T = 1.0;
  float g = uVolLight.w;
  for (int i = 0; i < 32; i++) {
    if (i >= steps) break;
    float t = (float(i) + j) * dt;
    vec3 x = uCamPos + rd * t;
    float sig = sigmaAt(x);
    vec3 L = vec3(0.0);
    if (uL_Lantern.w > 0.5) {
      vec3 lv = x - uL_Lantern.xyz;
      float d = length(lv);
      float att = lanternAtt(d);
      if (att > 1e-4) {
        float sh = 1.0;
        if (uVolShadow > 0.5 && uL_ShadowAPos.w > 0.0) {
          vec3 sv = x - uL_ShadowAPos.xyz;
          float sd = length(sv);
          if (sd < uL_ShadowAPos.w) sh = step(sd - 0.08, texture(uL_ShadowA, sv).r * uL_ShadowAPos.w);
        }
        // Clear air in the first metre (no veil on the lens), luminous beyond.
        float near = smoothstep(0.4, 2.2, t);
        L += uL_LanternColor.rgb * (att * sh * near * hg(dot(lv / max(d, 1e-3), -rd), g * 0.5) * uVolLight.x);
      }
    }
    for (int k = 0; k < 4; k++) {
      if (k >= uL_PracCount) break;
      vec4 pp = uL_PracPos[k];
      vec3 lv = x - pp.xyz;
      float d2 = dot(lv, lv);
      float r2 = pp.w * pp.w;
      if (d2 >= r2) continue;
      float q = 1.0 - d2 / r2;
      L += uL_PracCol[k].rgb * (q * q / (1.0 + d2 / 0.49) * hg(dot(lv * inversesqrt(max(d2, 1e-4)), -rd), g) * uVolLight.z);
    }
    if (uL_IrrParams.w > 0.5) {
      vec4 l = texture(uL_Irr, (x - uL_IrrOrigin) * uL_IrrInvSize);
      // Solid voxels carry no light (alpha = openness): the shaft is cut out by the rock it passes. Only bright pockets
      // scatter visibly (a sky shaft, a lamp, a crystal knot): the chamber's dim flood fill would only veil the view.
      vec3 fl = pow(l.rgb, vec3(uL_IrrParams.y)) * uL_IrrParams.x;
      float fb = smoothstep(0.08, 0.7, dot(fl, vec3(0.2126, 0.7152, 0.0722)));
      L += fl * (fb * uVolLight.y / (4.0 * PI)) * smoothstep(1.5, 4.0, t);
    }
    // Light shafts: sunlight scatters forward strongly (g 0.55), so a beam glows when you look along it.
    for (int k = 0; k < 2; k++) {
      if (k >= uL_ShaftCount) break;
      float sk = shaftAt(k, x);
      if (sk > 0.0) L += uL_ShaftCol[k].rgb * (sk * hg(dot(uL_ShaftDir[k].xyz, -rd), 0.55) * uVolLight.y);
    }
    // The haze's own hued radiance (multiple scattering folded in; the analytic fog of Battery uses the same colour).
    L += uL_FogColor / (4.0 * PI);
    float Ts = exp(-sig * dt);
    // Energy-conserving step integration (Hillaire 2015).
    ins += T * L * (1.0 - Ts) * (4.0 * PI);
    T *= Ts;
  }
  // Beyond the march: the rest of the ray in analytic fog (far walls fade into the hued haze).
  if (dist > maxD) {
    float rest = dist - maxD;
    float sig = sigmaAt(uCamPos + rd * maxD);
    float Tr = exp(-sig * min(rest, 200.0));
    ins += T * uL_FogColor * (1.0 - Tr);
    T *= Tr;
  }
  vec4 cur = vec4(ins, T);
  // Temporal accumulation: reproject the ray's mid point into last frame.
  vec4 outv = cur;
  if (uVol.w > 0.5) {
    vec3 xm = uCamPos + rd * min(dist, 6.0);
    vec4 pc = uPrevViewProj * vec4(xm, 1.0);
    vec2 ps = pc.xy / pc.w * 0.5 + 0.5;
    if (pc.w > 0.0 && ps.x >= 0.0 && ps.y >= 0.0 && ps.x <= 1.0 && ps.y <= 1.0) {
      vec4 h = texture(tHistory, min(ps * uLive, uLive - 0.5) / uAlloc);
      outv = mix(h, cur, uVol.z);
    }
  }
  fragColor = outv;
}
`;

/** The composite (scene resolution): AO on the indirect share, then the volumetric fog. Exported for PostFX. */
export const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tAo;      // half: r ao
uniform sampler2D tVol;     // half: rgb in-scatter, a transmittance
uniform sampler2D tDepthH;  // half: r linear depth (the bilateral weights)
uniform vec2 uScale;
uniform vec2 uMax;
uniform vec2 uHalfLive;
uniform vec2 uHalfAlloc;
uniform vec2 uNearFar;
uniform vec4 uOn;           // x ao, y vol, z ao strength, w debug (1 = show ao, 2 = show fog)
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
float linDepth(float d, float n, float f) {
  float z = d * 2.0 - 1.0;
  return (2.0 * n * f) / (f + n - z * (f - n));
}
// Depth-aware upsample: the 4 half-res texels around the pixel, weighted by bilinear weight x depth similarity.
vec4 bilateral(sampler2D t, vec2 s, float z, out float zh) {
  vec2 p = s * uHalfLive - 0.5;
  vec2 f = fract(p);
  vec2 b = floor(p) + 0.5;
  vec4 acc = vec4(0.0);
  float wsum = 0.0;
  zh = 0.0;
  for (int i = 0; i < 4; i++) {
    vec2 o = vec2(float(i & 1), float(i >> 1));
    vec2 q = clamp(b + o, vec2(0.5), uHalfLive - 0.5) / uHalfAlloc;
    float bw = (o.x > 0.5 ? f.x : 1.0 - f.x) * (o.y > 0.5 ? f.y : 1.0 - f.y);
    float dz = texture(tDepthH, q).r;
    float w = bw / (1e-3 + abs(dz - z) / max(z, 0.05) * 30.0) + 1e-5;
    acc += texture(t, q) * w;
    wsum += w;
  }
  return acc / wsum;
}
void main() {
  vec2 s = vUv;
  vec4 c = texture(tScene, min(s * uScale, uMax));
  float d = texture(tDepth, min(s * uScale, uMax)).r;
  float z = linDepth(d, uNearFar.x, uNearFar.y);
  float zh;
  if (uOn.x > 0.5 && d < 1.0) {
    float ao = bilateral(tAo, s, z, zh).r;
    // Occlude the indirect share only (alpha = 1 - indirect share); a whisper on the direct light for contact.
    float ind = 1.0 - clamp(c.a, 0.0, 1.0);
    c.rgb *= 1.0 - (1.0 - ao) * uOn.z * (ind + 0.12 * (1.0 - ind));
    if (uOn.w > 0.5 && uOn.w < 1.5) c.rgb = vec3(ao);
  }
  if (uOn.y > 0.5) {
    vec4 v = bilateral(tVol, s, min(z, 400.0), zh);
    if (uOn.w > 1.5) c.rgb = v.rgb;
    else c.rgb = c.rgb * v.a + v.rgb;
  }
  fragColor = vec4(c.rgb, 1.0);
}
`;

export const PASS_VERT = VERT;

/** The temporal history weight of the volumetric pass: ghost-free while the view moves, converging at rest (still air). */
export function historyWeight(moved: boolean, stillFrames: number): number {
  return moved ? 0.3 : Math.max(1 / 64, 1 / (stillFrames + 2));
}

/** The per-frame jitter offset: a 64-frame golden-ratio cycle that the history averages out (no residual grain). */
export function jitterAt(frame: number): number {
  return ((frame % 64) * 0.618034) % 1;
}

/**
 * The march's step integration (Hillaire 2015, energy-conserving) for a homogeneous medium of extinction `sigma` lit
 * by a uniform in-scatter source `S` over `dist` metres in `steps` steps: returns [in-scatter, transmittance]. The
 * analytic answer is [S (1 − e^(−σd)), e^(−σd)] whatever the step count. Pure twin of VOL_FRAG's loop.
 */
export function marchHomogeneous(sigma: number, S: number, dist: number, steps: number): [number, number] {
  const dt = dist / steps;
  let ins = 0;
  let T = 1;
  for (let i = 0; i < steps; i++) {
    const Ts = Math.exp(-sigma * dt);
    ins += T * S * (1 - Ts);
    T *= Ts;
  }
  return [ins, T];
}

/** Per-pixel costs (fetches, ALU) of the lighting passes, for tools/perf.mjs (from the shaders above). */
export const LIGHT_PASS_COST: Record<string, { fetches: number; alu: number }> = {
  lightDepth: { fetches: 4, alu: 20 },
  gtao: { fetches: 21, alu: 260 },
  aoBlur: { fetches: 17, alu: 90 },
  // Per march step: the field (1), the shadow tap on High (1), ~60 ALU with the lantern and 2 practicals in range.
  volStep: { fetches: 1.3, alu: 70 },
  volBase: { fetches: 3, alu: 80 },
  composite: { fetches: 11, alu: 90 },
  // The shadow cube: per face, per pixel written (the geometry cost is modelled from the draw calls).
  shadowFace: { fetches: 0, alu: 12 },
};

export class LightPasses {
  readonly depthRT: THREE.WebGLRenderTarget;
  readonly aoRT: THREE.WebGLRenderTarget;
  readonly aoBlurRT: THREE.WebGLRenderTarget;
  private volA: THREE.WebGLRenderTarget;
  private volB: THREE.WebGLRenderTarget;
  readonly depthMat: THREE.ShaderMaterial;
  readonly gtaoMat: THREE.ShaderMaterial;
  readonly blurMat: THREE.ShaderMaterial;
  readonly volMat: THREE.ShaderMaterial;
  /** Half-res allocation and live sizes. */
  allocW = 1;
  allocH = 1;
  liveW = 1;
  liveH = 1;
  private histValid = false;
  private stillFrames = 0;
  private frame = 0;
  private readonly prevVP = new THREE.Matrix4();
  private readonly lastCam = new THREE.Matrix4();
  /** AO tuning (world radius, power, strength in the composite). */
  readonly ao = { radius: 0.75, power: 1.15, strength: 0.85 };
  /** Volumetric tuning: scatter weights of the lantern, the LightField and the practicals; the far march (m). */
  readonly vol = { lantern: 0.16, field: 1.6, practical: 0.6, maxDist: 26 };

  constructor() {
    const half = (fmt: THREE.PixelFormat) =>
      new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, format: fmt, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    this.depthRT = half(THREE.RGFormat);
    this.aoRT = half(THREE.RGFormat);
    this.aoBlurRT = half(THREE.RGFormat);
    this.volA = half(THREE.RGBAFormat);
    this.volB = half(THREE.RGBAFormat);
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
    const v2 = () => ({ value: new THREE.Vector2(1, 1) });
    this.depthMat = mk(DEPTH_FRAG, { tDepth: { value: null }, uTexel: v2(), uScale: v2(), uMax: v2(), uNearFar: v2() });
    this.gtaoMat = mk(GTAO_FRAG, { tDepth: { value: null }, uScaleFull: v2(), uMaxFull: v2(), uNearFar: v2(), uLive: v2(), uTanHalf: v2(), uRadius: { value: 0.75 }, uPower: { value: 1.15 } });
    this.blurMat = mk(BLUR_FRAG, { tAo: { value: null }, uLive: v2(), uAlloc: v2() });
    const L = LIGHT_UNIFORMS;
    this.volMat = mk(VOL_FRAG, {
      tDepthH: { value: null },
      tHistory: { value: null },
      uLive: v2(),
      uAlloc: v2(),
      uTanHalf: v2(),
      uCamWorld: { value: new THREE.Matrix4() },
      uPrevViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uVol: { value: new THREE.Vector4(12, 26, 0.2, 0) },
      uVolLight: { value: new THREE.Vector4(0.16, 1, 0.6, 0.35) },
      uVolShadow: { value: 0 },
      uJitter: { value: 0 },
      uL_Lantern: L.uL_Lantern,
      uL_LanternColor: L.uL_LanternColor,
      uL_LanternShape: L.uL_LanternShape,
      uL_ShadowA: L.uL_ShadowA,
      uL_ShadowAPos: L.uL_ShadowAPos,
      uL_PracPos: L.uL_PracPos,
      uL_PracCol: L.uL_PracCol,
      uL_PracCount: L.uL_PracCount,
      uL_Irr: L.uL_Irr,
      uL_IrrOrigin: L.uL_IrrOrigin,
      uL_IrrInvSize: L.uL_IrrInvSize,
      uL_IrrParams: L.uL_IrrParams,
      uL_FogColor: L.uL_FogColor,
      uL_Fog: L.uL_Fog,
      uL_Shaft: L.uL_Shaft,
      uL_ShaftDir: L.uL_ShaftDir,
      uL_ShaftCol: L.uL_ShaftCol,
      uL_ShaftCount: L.uL_ShaftCount,
    });
  }

  materials(): THREE.ShaderMaterial[] {
    return [this.depthMat, this.gtaoMat, this.blurMat, this.volMat];
  }

  /** Allocate at half of the scene allocation; live at half of the scene's live rect. */
  setSize(sceneAllocW: number, sceneAllocH: number, scale: number): void {
    const aw = Math.max(1, Math.ceil(sceneAllocW * scale));
    const ah = Math.max(1, Math.ceil(sceneAllocH * scale));
    if (aw !== this.allocW || ah !== this.allocH) {
      this.allocW = aw;
      this.allocH = ah;
      for (const rt of [this.depthRT, this.aoRT, this.aoBlurRT, this.volA, this.volB]) rt.setSize(aw, ah);
      this.histValid = false;
    }
  }

  setLive(sceneLiveW: number, sceneLiveH: number, scale: number): void {
    const lw = Math.max(1, Math.min(this.allocW, Math.round(sceneLiveW * scale)));
    const lh = Math.max(1, Math.min(this.allocH, Math.round(sceneLiveH * scale)));
    if (lw !== this.liveW || lh !== this.liveH) this.histValid = false;
    this.liveW = lw;
    this.liveH = lh;
  }

  /** A cut, a teleport, a quality change: drop the history. */
  resetHistory(): void {
    this.histValid = false;
  }

  /**
   * Run the half-res passes from the scene's depth texture. `pass(material, target, w, h)` draws a full-screen quad;
   * the uv scale/max of the scene's live rect inside its allocation are given.
   */
  run(
    pass: (m: THREE.ShaderMaterial, t: THREE.WebGLRenderTarget, w: number, h: number) => void,
    depth: THREE.Texture,
    camera: THREE.PerspectiveCamera,
    sceneUv: { scale: THREE.Vector2; max: THREE.Vector2; texel: THREE.Vector2 },
    opts: { ao: boolean; vol: boolean; steps: number; volShadow: boolean; anisotropy: number; scatter: number },
  ): void {
    const lw = this.liveW;
    const lh = this.liveH;
    const aw = this.allocW;
    const ah = this.allocH;
    const tanY = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const tanX = tanY * camera.aspect;
    // Depth.
    const du = this.depthMat.uniforms;
    du.tDepth.value = depth;
    du.uTexel.value.copy(sceneUv.texel);
    // The quad's vUv spans the half-res live rect (pass() sets the viewport), i.e. the scene's whole live rect.
    du.uScale.value.copy(sceneUv.scale);
    du.uMax.value.copy(sceneUv.max);
    du.uNearFar.value.set(camera.near, camera.far);
    pass(this.depthMat, this.depthRT, lw, lh);
    if (opts.ao) {
      const gu = this.gtaoMat.uniforms;
      gu.tDepth.value = depth;
      gu.uScaleFull.value.copy(sceneUv.scale);
      gu.uMaxFull.value.copy(sceneUv.max);
      gu.uNearFar.value.set(camera.near, camera.far);
      gu.uLive.value.set(lw, lh);
      gu.uTanHalf.value.set(tanX, tanY);
      gu.uRadius.value = this.ao.radius;
      gu.uPower.value = this.ao.power;
      pass(this.gtaoMat, this.aoRT, lw, lh);
      const bu = this.blurMat.uniforms;
      bu.tAo.value = this.aoRT.texture;
      bu.uLive.value.set(lw, lh);
      bu.uAlloc.value.set(aw, ah);
      pass(this.blurMat, this.aoBlurRT, lw, lh);
    }
    if (opts.vol) {
      // Camera motion: the history weight floor rises when the view changed (ghost-free), falls at rest (still air).
      camera.updateMatrixWorld();
      const moved = !this.lastCam.equals(camera.matrixWorld);
      this.lastCam.copy(camera.matrixWorld);
      this.stillFrames = moved ? 0 : this.stillFrames + 1;
      this.frame++;
      const w = historyWeight(moved, this.stillFrames);
      const vu = this.volMat.uniforms;
      vu.tDepthH.value = this.depthRT.texture;
      vu.tHistory.value = this.volB.texture;
      vu.uLive.value.set(lw, lh);
      vu.uAlloc.value.set(aw, ah);
      vu.uTanHalf.value.set(tanX, tanY);
      vu.uCamWorld.value.copy(camera.matrixWorld);
      vu.uPrevViewProj.value.copy(this.prevVP);
      vu.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
      vu.uVol.value.set(opts.steps, this.vol.maxDist, this.histValid ? w : 1, this.histValid ? 1 : 0);
      vu.uVolLight.value.set(this.vol.lantern * opts.scatter, this.vol.field * opts.scatter, this.vol.practical * opts.scatter, opts.anisotropy);
      vu.uVolShadow.value = opts.volShadow ? 1 : 0;
      // A 64-frame jitter cycle (golden-ratio steps): the history averages it out.
      vu.uJitter.value = jitterAt(this.frame);
      pass(this.volMat, this.volA, lw, lh);
      // Swap: volA holds this frame's result, volB the history for the next frame.
      const t = this.volA;
      this.volA = this.volB;
      this.volB = t;
      this.histValid = true;
      this.prevVP.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    } else this.histValid = false;
  }

  /** The finished volumetric texture of this frame (after the swap it is volB). */
  get volResult(): THREE.Texture {
    return this.volB.texture;
  }

  memoryBytes(): number {
    return this.allocW * this.allocH * (4 * 3 + 8 * 2);
  }

  dispose(): void {
    for (const rt of [this.depthRT, this.aoRT, this.aoBlurRT, this.volA, this.volB]) rt.dispose();
    for (const m of this.materials()) m.dispose();
  }
}
