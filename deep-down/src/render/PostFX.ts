import * as THREE from 'three';
import { baseBiome, echoNumber } from '../idle/config/biomes';
import { BIOME_LOOKS } from '../idle/config/biomeLooks';
import { SCENE_ENCODE } from './lighting';
import { lookShared } from './look';
import { LUT_SIZE, buildLut, type GradeLook } from './post/lut';

/**
 * The HD post chain (SPEC §11.3, CRITIQUE B12, B13, B15, B16; owner 2D). Two resolutions:
 *
 *   scene     the world renders into a HalfFloat target at a dynamic fraction `s` of the native resolution,
 *             through a sub-viewport of a target allocated at the preset's top scale (a scale step never
 *             reallocates), optionally with 4x MSAA (High)
 *   bloom     bright pass + 4-5 level dual-filter bloom, every tap clamped to the live rect
 *   resolve   at scene resolution: exposure, flash, the hue-preserving tone map, then the LUT pair of the two
 *             biomes nearest the camera (32^3, sRGB-encoded domain: lut.ts holds the W1 grade + each look),
 *             written sRGB-encoded with its luma in alpha
 *   fxaa      FXAA 3.11 (quality 12) at scene resolution, before the upsample (Balanced; High has MSAA)
 *   final     at native resolution into the canvas: the screen shock, a 5-tap Catmull-Rom upsample, CAS
 *             (only while s < 1), the portrait vignette, dim, the octagon iris with its brass rim, dither
 *
 * Every program is compiled at construction; options switch passes and uniforms, never defines (P3 across
 * presets). The 8-bit fallback (no float targets) keeps its ENCODED define: a device constant.
 */

const fullscreenVert = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// Inverse of sceneOut() in lighting.ts for the 8-bit fallback (ENCODED define).
const decodeGlsl = /* glsl */ `
vec3 sceneIn(vec3 c) {
#ifdef ENCODED
  vec3 y = min(c * c, vec3(0.995));
  return y / (1.0 - y);
#else
  return c;
#endif
}
`;

const brightFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform vec2 uScale;
uniform vec2 uMax;
uniform float uThreshold;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${decodeGlsl}
vec3 tap(vec2 uv) { return sceneIn(texture(tInput, min(uv, uMax)).rgb); }
void main() {
  vec2 uv = vUv * uScale;
  // 4-tap box downsample while extracting, to avoid fireflies.
  vec3 c = tap(uv + uTexel * vec2(-0.5, -0.5)) + tap(uv + uTexel * vec2(0.5, -0.5)) + tap(uv + uTexel * vec2(-0.5, 0.5)) + tap(uv + uTexel * vec2(0.5, 0.5));
  c *= 0.25;
  // Luminance, not the max channel: a saturated cyan surface is not a light source.
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = uThreshold * 0.35;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(min(c * contrib, vec3(12.0)), 1.0);
}
`;

const downFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform vec2 uScale;
uniform vec2 uMax;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
vec3 tap(vec2 uv) { return texture(tInput, min(uv, uMax)).rgb; }
void main() {
  vec2 uv = vUv * uScale;
  vec3 c = tap(uv) * 4.0;
  c += tap(uv + uTexel * vec2(-1.0, -1.0));
  c += tap(uv + uTexel * vec2(1.0, -1.0));
  c += tap(uv + uTexel * vec2(-1.0, 1.0));
  c += tap(uv + uTexel * vec2(1.0, 1.0));
  fragColor = vec4(c / 8.0, 1.0);
}
`;

const upFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform vec2 uScale;
uniform vec2 uMax;
uniform vec2 uBaseScale;
uniform vec2 uBaseMax;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
vec3 tap(vec2 uv) { return texture(tInput, min(uv, uMax)).rgb; }
void main() {
  vec2 uv = vUv * uScale;
  vec3 c = tap(uv + uTexel * vec2(-1.0, 0.0));
  c += tap(uv + uTexel * vec2(1.0, 0.0));
  c += tap(uv + uTexel * vec2(0.0, -1.0));
  c += tap(uv + uTexel * vec2(0.0, 1.0));
  c += tap(uv + uTexel * vec2(-0.7, -0.7)) * 0.5;
  c += tap(uv + uTexel * vec2(0.7, -0.7)) * 0.5;
  c += tap(uv + uTexel * vec2(-0.7, 0.7)) * 0.5;
  c += tap(uv + uTexel * vec2(0.7, 0.7)) * 0.5;
  fragColor = vec4(c / 6.0 + texture(tBase, min(vUv * uBaseScale, uBaseMax)).rgb, 1.0);
}
`;

const resolveFrag = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler3D tLutA;
uniform sampler3D tLutB;
uniform float uLutMix;
uniform vec2 uScale;
uniform vec2 uMax;
uniform vec2 uBloomScale;
uniform vec2 uBloomMax;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uFlash;
uniform vec3 uFlashColor;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${decodeGlsl}

// Filmic curve (ACES fit): a real toe (slope ~0.25 near black, no lift), so shadows are deep and the lit
// mids carry the contrast; white is reached around x = 6.
float curve(float x) {
  return clamp((x * (2.51 * x + 0.035)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Hue-preserving tone map: in the highlights the curve drives the brightest channel and the other channels
// keep their ratio to it, so cyan and amber lights stay cyan and amber. In the shadows and mids half of the
// per-channel curve is kept (its toe deepens the weaker channels). Very hot cores roll partly toward white.
vec3 tonemap(vec3 x) {
  float peak = max(x.r, max(x.g, x.b));
  vec3 hue = x * (curve(peak) / max(peak, 1e-5));
  vec3 per = vec3(curve(x.r), curve(x.g), curve(x.b));
  float w = 0.5 * (1.0 - smoothstep(0.35, 1.5, peak)) + 0.6 * smoothstep(2.5, 9.0, peak);
  return mix(hue, per, w);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec3 hdr = sceneIn(texture(tScene, min(vUv * uScale, uMax)).rgb);
  hdr += texture(tBloom, min(vUv * uBloomScale, uBloomMax)).rgb * uBloomStrength;
  hdr *= uExposure;
  hdr += uFlashColor * uFlash;
  vec3 c = clamp(toSrgb(tonemap(hdr)), 0.0, 1.0);
  // The grade: the LUT pair in the sRGB-encoded domain (texel centres at (i + 0.5) / 32).
  vec3 lc = c * ${(LUT_SIZE - 1) / LUT_SIZE} + ${0.5 / LUT_SIZE};
  vec3 g = mix(texture(tLutA, lc).rgb, texture(tLutB, lc).rgb, uLutMix);
  fragColor = vec4(g, dot(g, vec3(0.299, 0.587, 0.114)));
}
`;

// FXAA 3.11, quality preset 12 (NVIDIA, public domain), on the resolved sRGB image with luma in alpha.
const fxaaFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uRcp;
uniform vec2 uScale;
uniform vec2 uMax;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
float L(vec2 uv) { return texture(tInput, min(uv, uMax)).a; }
void main() {
  vec2 posM = vUv * uScale;
  vec4 rgbyM = texture(tInput, min(posM, uMax));
  float lumaM = rgbyM.a;
  float lumaS = L(posM + vec2(0.0, 1.0) * uRcp);
  float lumaE = L(posM + vec2(1.0, 0.0) * uRcp);
  float lumaN = L(posM + vec2(0.0, -1.0) * uRcp);
  float lumaW = L(posM + vec2(-1.0, 0.0) * uRcp);
  float maxSM = max(lumaS, lumaM);
  float minSM = min(lumaS, lumaM);
  float maxESM = max(lumaE, maxSM);
  float minESM = min(lumaE, minSM);
  float maxWN = max(lumaN, lumaW);
  float minWN = min(lumaN, lumaW);
  float rangeMax = max(maxWN, maxESM);
  float rangeMin = min(minWN, minESM);
  float range = rangeMax - rangeMin;
  if (range < max(0.0625, rangeMax * 0.125)) {
    fragColor = rgbyM;
    return;
  }
  float lumaNW = L(posM + vec2(-1.0, -1.0) * uRcp);
  float lumaSE = L(posM + vec2(1.0, 1.0) * uRcp);
  float lumaNE = L(posM + vec2(1.0, -1.0) * uRcp);
  float lumaSW = L(posM + vec2(-1.0, 1.0) * uRcp);
  float lumaNS = lumaN + lumaS;
  float lumaWE = lumaW + lumaE;
  float subpixRcpRange = 1.0 / range;
  float subpixNSWE = lumaNS + lumaWE;
  float edgeHorz1 = (-2.0 * lumaM) + lumaNS;
  float edgeVert1 = (-2.0 * lumaM) + lumaWE;
  float lumaNESE = lumaNE + lumaSE;
  float lumaNWNE = lumaNW + lumaNE;
  float edgeHorz2 = (-2.0 * lumaE) + lumaNESE;
  float edgeVert2 = (-2.0 * lumaN) + lumaNWNE;
  float lumaNWSW = lumaNW + lumaSW;
  float lumaSWSE = lumaSW + lumaSE;
  float edgeHorz4 = (abs(edgeHorz1) * 2.0) + abs(edgeHorz2);
  float edgeVert4 = (abs(edgeVert1) * 2.0) + abs(edgeVert2);
  float edgeHorz3 = (-2.0 * lumaW) + lumaNWSW;
  float edgeVert3 = (-2.0 * lumaS) + lumaSWSE;
  float edgeHorz = abs(edgeHorz3) + edgeHorz4;
  float edgeVert = abs(edgeVert3) + edgeVert4;
  float subpixNWSWNESE = lumaNWSW + lumaNESE;
  float lengthSign = uRcp.x;
  bool horzSpan = edgeHorz >= edgeVert;
  float subpixA = subpixNSWE * 2.0 + subpixNWSWNESE;
  if (!horzSpan) lumaN = lumaW;
  if (!horzSpan) lumaS = lumaE;
  if (horzSpan) lengthSign = uRcp.y;
  float subpixB = (subpixA * (1.0 / 12.0)) - lumaM;
  float gradientN = lumaN - lumaM;
  float gradientS = lumaS - lumaM;
  float lumaNN = lumaN + lumaM;
  float lumaSS = lumaS + lumaM;
  bool pairN = abs(gradientN) >= abs(gradientS);
  float gradient = max(abs(gradientN), abs(gradientS));
  if (pairN) lengthSign = -lengthSign;
  float subpixC = clamp(abs(subpixB) * subpixRcpRange, 0.0, 1.0);
  vec2 posB = posM;
  vec2 offNP = vec2(horzSpan ? uRcp.x : 0.0, horzSpan ? 0.0 : uRcp.y);
  if (!horzSpan) posB.x += lengthSign * 0.5;
  if (horzSpan) posB.y += lengthSign * 0.5;
  vec2 posN = posB - offNP;
  vec2 posP = posB + offNP;
  float subpixD = ((-2.0) * subpixC) + 3.0;
  float lumaEndN = L(posN);
  float subpixE = subpixC * subpixC;
  float lumaEndP = L(posP);
  if (!pairN) lumaNN = lumaSS;
  float gradientScaled = gradient * (1.0 / 4.0);
  float lumaMM = lumaM - lumaNN * 0.5;
  float subpixF = subpixD * subpixE;
  bool lumaMLTZero = lumaMM < 0.0;
  lumaEndN -= lumaNN * 0.5;
  lumaEndP -= lumaNN * 0.5;
  bool doneN = abs(lumaEndN) >= gradientScaled;
  bool doneP = abs(lumaEndP) >= gradientScaled;
  const float QS[4] = float[](1.5, 2.0, 4.0, 12.0);
  for (int i = 0; i < 4; i++) {
    if (doneN && doneP) break;
    if (!doneN) {
      posN -= offNP * QS[i];
      lumaEndN = L(posN) - lumaNN * 0.5;
      doneN = abs(lumaEndN) >= gradientScaled;
    }
    if (!doneP) {
      posP += offNP * QS[i];
      lumaEndP = L(posP) - lumaNN * 0.5;
      doneP = abs(lumaEndP) >= gradientScaled;
    }
  }
  float dstN = horzSpan ? posM.x - posN.x : posM.y - posN.y;
  float dstP = horzSpan ? posP.x - posM.x : posP.y - posM.y;
  bool goodSpanN = (lumaEndN < 0.0) != lumaMLTZero;
  bool goodSpanP = (lumaEndP < 0.0) != lumaMLTZero;
  float spanLengthRcp = 1.0 / (dstP + dstN);
  bool directionN = dstN < dstP;
  float dst = min(dstN, dstP);
  bool goodSpan = directionN ? goodSpanN : goodSpanP;
  float subpixG = subpixF * subpixF;
  float pixelOffset = (dst * (-spanLengthRcp)) + 0.5;
  float subpixH = subpixG * 0.75;
  float pixelOffsetGood = goodSpan ? pixelOffset : 0.0;
  float pixelOffsetSubpix = max(pixelOffsetGood, subpixH);
  if (!horzSpan) posM.x += pixelOffsetSubpix * lengthSign;
  if (horzSpan) posM.y += pixelOffsetSubpix * lengthSign;
  fragColor = vec4(texture(tInput, min(posM, uMax)).rgb, lumaM);
}
`;

const finalFrag = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uSrcSize;
uniform vec2 uSrcLive;
uniform float uCas;
uniform float uVignette;
uniform float uDim;
uniform float uIris;
uniform vec2 uIrisC;
uniform float uAspect;
uniform float uShock;
uniform vec2 uShockC;
uniform float uTime;
uniform vec2 uRes;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;

vec3 tap(vec2 px) {
  px = clamp(px, vec2(0.5), uSrcLive - 0.5);
  return texture(tSrc, px / uSrcSize).rgb;
}
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void main() {
  vec2 uv = vUv;
  // Screen shock: one ring of refraction expanding from its centre (screen heights), fading as it grows.
  if (uShock > 0.001 && uShock < 0.999) {
    vec2 d = (uv - uShockC) * vec2(uAspect, 1.0);
    float len = length(d);
    float r = uShock * 0.9;
    float ring = exp(-pow((len - r) / 0.04, 2.0));
    uv -= (d / max(len, 1e-4)) / vec2(uAspect, 1.0) * ring * 0.016 * (1.0 - uShock);
  }
  // 5-tap Catmull-Rom upsample from the scene-resolution image (post/composite.ts mirrors the weights).
  vec2 pos = uv * uSrcLive;
  vec2 tc = floor(pos - 0.5) + 0.5;
  vec2 f = pos - tc;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 tc12 = tc + w2 / w12;
  vec2 tc0 = tc - 1.0;
  vec2 tc3 = tc + 2.0;
  float a = w12.x * w0.y, b = w0.x * w12.y, cc = w12.x * w12.y, d = w3.x * w12.y, e = w12.x * w3.y;
  vec3 s = tap(vec2(tc12.x, tc0.y));
  vec3 we = tap(vec2(tc0.x, tc12.y));
  vec3 mid = tap(tc12);
  vec3 ea = tap(vec2(tc3.x, tc12.y));
  vec3 n = tap(vec2(tc12.x, tc3.y));
  vec3 c = (s * a + we * b + mid * cc + ea * d + n * e) / (a + b + cc + d + e);
  // Contrast-adaptive sharpening (the cross form of AMD CAS), only while the scene is below native. Its cross is
  // the Catmull-Rom's own four outer taps, one source texel out on each side: CAS of the source as it is
  // upsampled (AMD's upscaling mode), with no fetch of its own (CRITIQUE B16: the composite fits 1.9 ms).
  if (uCas > 0.001) {
    float lc = luma(c), ln = luma(n), ls = luma(s), le = luma(ea), lw = luma(we);
    float mn = min(lc, min(min(ln, ls), min(le, lw)));
    float mx = max(lc, max(max(ln, ls), max(le, lw)));
    float amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-5), 0.0, 1.0));
    float wgt = amp * (-1.0 / (8.0 - 3.0 * uCas));
    c = (c + (n + s + ea + we) * wgt) / (1.0 + 4.0 * wgt);
  }
  c = max(c, vec3(0.0));
  // Portrait vignette: top 0.30, bottom 0.25, sides 0.10 (at 0.25), so the dig band stays the brightest.
  float top = smoothstep(0.62, 1.0, vUv.y) * 0.3;
  float bottom = smoothstep(0.38, 0.0, vUv.y) * 0.25;
  float sides = smoothstep(0.32, 0.5, abs(vUv.x - 0.5)) * 0.1;
  c *= 1.0 - min(1.0, (top + bottom + sides) * (uVignette / 0.25));
  c *= 1.0 - uDim;
  // The octagon iris with a 1 px brass rim (Rekindle).
  if (uIris < 1.499) {
    vec2 q = abs((vUv - uIrisC) * vec2(uAspect, 1.0));
    float od = max(max(q.x, q.y), (q.x + q.y) * 0.70710678);
    float px = 1.0 / uRes.y;
    float inside = smoothstep(uIris + px, uIris - px, od);
    float rim = 1.0 - smoothstep(0.0, 1.5 * px, abs(od - uIris));
    c = c * inside + vec3(0.886, 0.714, 0.451) * rim * step(0.001, uIris);
  }
  // Dither last, to hide banding in the dark fog gradients.
  c += (ign(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  fragColor = vec4(c, 1.0);
}
`;

/**
 * The post parameters other modules drive (W2 seam 2). Ceremonies (C) own the transient ones and restore
 * them; the biome look (DescentScene) writes threshold, bloomStrength and zoneExposure every frame, so a
 * ceremony that wants more glow uses `bloomPulse`, never `bloomStrength`.
 */
export interface PostParams {
  /** Bloom strength of the current look (DescentScene sets it from the biome every frame). */
  bloomStrength: number;
  /** Bloom threshold, scene-linear luminance. */
  threshold: number;
  /** The player's brightness x the base exposure (Renderer.setBrightness). */
  exposure: number;
  /** The biome look's exposure (DescentScene). */
  zoneExposure: number;
  /** Portrait vignette strength (top 0.30, bottom 0.25, sides 0.10 at 0.25). */
  vignette: number;
  /** A full-screen flash 0..1 added in HDR before the tone map (L12: the caller keeps ≤ 2 a second, never red). */
  flash: number;
  flashColor: THREE.Color;
  /** Dim 0..1: darkens the whole frame toward black (0 = none, 1 = black), for title cards and modal moments. */
  dim: number;
  /**
   * Iris radius 0..1.5 in screen heights from `irisCenter` (UV, y up; 0.5, 0.5 = the centre): outside the
   * octagon the frame is black, with a 1 px brass rim on its edge. 1.5 (the default) is fully open. Set the
   * centre with `irisCenter.set(u, v)` (an [u, v] array is accepted too).
   */
  iris: number;
  irisCenter: THREE.Vector2;
  /**
   * Screen shock 0..1: one expanding ring of refraction centred on `shockCenter` (UV, y up). The caller
   * animates it from 0 (born) to 1 (gone): the ring's radius grows with it and its strength fades. 0 = none.
   */
  shock: number;
  shockCenter: THREE.Vector2;
  /** Extra bloom 0..1 on top of the look's (Surge, crits, ceremonies): up to +0.6 strength and a lower threshold. */
  bloomPulse: number;
}

export interface PostFXOptions {
  bloom: boolean;
  msaa: number;
  /** FXAA 3.11 before the upsample (Balanced). */
  fxaa?: boolean;
  /** Bloom levels (Balanced 4, High 5). */
  bloomLevels?: number;
  /** Debug: use the 8-bit fallback targets even when float targets are renderable. */
  forceLdr?: boolean;
}

/** One pass of the frame for the cost model (tools/perf.mjs). */
export interface PassInfo {
  name: string;
  /** Pixels written. */
  px: number;
  /** Texture fetches and ALU (approximate ops) per pixel. */
  fetches: number;
  alu: number;
}

/** Per-pixel costs of each post pass (fetches, ALU), from the shaders above. */
export const PASS_COST: Record<string, { fetches: number; alu: number }> = {
  bright: { fetches: 4, alu: 30 },
  down: { fetches: 5, alu: 12 },
  up: { fetches: 9, alu: 18 },
  resolve: { fetches: 4, alu: 70 },
  // FXAA: most pixels leave after the 5-tap range test; the edge walk (up to 12 more) is the minority.
  fxaa: { fetches: 6, alu: 30 },
  final: { fetches: 5, alu: 60 },
  // CAS reuses the Catmull-Rom's outer taps: no fetch of its own.
  cas: { fetches: 0, alu: 28 },
};

const black1 = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/** The grade of biome index k (Echo strata: their base biome's tints; the composite blends a pair). */
export function gradeOf(k: number): GradeLook {
  const b = BIOME_LOOKS[Math.min(BIOME_LOOKS.length - 1, baseBiome(Math.max(0, k)))];
  const n = echoNumber(Math.max(0, k));
  return { shadow: b.shadow, highlight: b.highlight, saturation: b.saturation + 0.03 * n };
}

export class PostFX {
  private readonly renderer: THREE.WebGLRenderer;
  private sceneRT: THREE.WebGLRenderTarget;
  private gradeRT: THREE.WebGLRenderTarget;
  private fxaaRT: THREE.WebGLRenderTarget;
  private bloomRTs: THREE.WebGLRenderTarget[] = [];
  private bloomLive: Array<[number, number]> = [];
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bright: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private readonly resolve: THREE.ShaderMaterial;
  private readonly fxaa: THREE.ShaderMaterial;
  private readonly final: THREE.ShaderMaterial;
  /** Native (canvas) size in device px. */
  private nativeW = 1;
  private nativeH = 1;
  /** The scene target's allocation and its live rect. */
  private allocW = 1;
  private allocH = 1;
  private liveW = 1;
  private liveH = 1;
  private maxScale = 1;
  private scale = 1;
  private options: PostFXOptions;
  private readonly luts = new Map<number, THREE.Data3DTexture>();
  private readonly lutOrder: number[] = [];
  /**
   * HDR targets need EXT_color_buffer_(half_)float to be renderable. A WebGL2 device without it would
   * otherwise get an incomplete framebuffer (a black screen): fall back to 8-bit targets.
   */
  readonly hdr: boolean;
  private readonly colorType: THREE.TextureDataType;
  readonly params: PostParams = {
    bloomStrength: 0.4,
    threshold: 1.2,
    exposure: 1.0,
    zoneExposure: 1,
    vignette: 0.25,
    flash: 0,
    flashColor: new THREE.Color(1, 1, 1),
    dim: 0,
    iris: 1.5,
    irisCenter: new THREE.Vector2(0.5, 0.5),
    shock: 0,
    shockCenter: new THREE.Vector2(0.5, 0.5),
    bloomPulse: 0,
  };
  /** CAS strength while the scene is below native (SPEC §11.3: 0.2). */
  casStrength = 0.2;

  constructor(renderer: THREE.WebGLRenderer, options: PostFXOptions) {
    const ext = renderer.extensions;
    this.hdr = !options.forceLdr && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.colorType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.renderer = renderer;
    this.options = { ...options };
    this.sceneRT = this.makeSceneRT(1, 1);
    this.gradeRT = this.makeLdrRT(1, 1);
    this.fxaaRT = this.makeLdrRT(1, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) =>
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: fullscreenVert, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    // 8-bit fallback: lit materials encode the scene (SCENE_ENCODE), the passes reading it decode.
    SCENE_ENCODE.value = this.hdr ? 0 : 1;
    const enc: Record<string, string> = this.hdr ? {} : { ENCODED: '' };
    const v2 = () => ({ value: new THREE.Vector2(1, 1) });
    this.bright = mk(brightFrag, { tInput: { value: null }, uTexel: v2(), uScale: v2(), uMax: v2(), uThreshold: { value: 1 } }, enc);
    this.down = mk(downFrag, { tInput: { value: null }, uTexel: v2(), uScale: v2(), uMax: v2() });
    this.up = mk(upFrag, { tInput: { value: null }, tBase: { value: null }, uTexel: v2(), uScale: v2(), uMax: v2(), uBaseScale: v2(), uBaseMax: v2() });
    const lut0 = this.lutFor(0);
    this.resolve = mk(
      resolveFrag,
      {
        tScene: { value: null },
        tBloom: { value: black1 },
        tLutA: { value: lut0 },
        tLutB: { value: lut0 },
        uLutMix: { value: 0 },
        uScale: v2(),
        uMax: v2(),
        uBloomScale: v2(),
        uBloomMax: v2(),
        uBloomStrength: { value: 0.5 },
        uExposure: { value: 1 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color() },
      },
      enc,
    );
    this.fxaa = mk(fxaaFrag, { tInput: { value: null }, uRcp: v2(), uScale: v2(), uMax: v2() });
    this.final = mk(finalFrag, {
      tSrc: { value: null },
      uSrcSize: v2(),
      uSrcLive: v2(),
      uCas: { value: 0 },
      uVignette: { value: 0.25 },
      uDim: { value: 0 },
      uIris: { value: 1.5 },
      uIrisC: { value: new THREE.Vector2(0.5, 0.5) },
      uAspect: { value: 0.46 },
      uShock: { value: 0 },
      uShockC: { value: new THREE.Vector2(0.5, 0.5) },
      uTime: { value: 0 },
      uRes: v2(),
    });
    this.quad = new THREE.Mesh(geo, this.final);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.compileAll();
  }

  /** Compile every post program now (P3: nothing compiles after load, whatever the preset). */
  compileAll(): void {
    for (const m of [this.bright, this.down, this.up, this.resolve, this.fxaa, this.final]) {
      this.quad.material = m;
      this.renderer.compile(this.quadScene, this.quadCam);
    }
    this.quad.material = this.final;
  }

  private makeSceneRT(w: number, h: number): THREE.WebGLRenderTarget {
    const samples = this.options?.msaa ?? 0;
    return new THREE.WebGLRenderTarget(w, h, {
      type: this.colorType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      samples,
      // No pass reads depth after the scene: don't resolve the multisampled depth every frame.
      resolveDepthBuffer: samples === 0,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  private makeLdrRT(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  }

  setOptions(options: PostFXOptions): void {
    const msaaChanged = options.msaa !== this.options.msaa;
    const bloomChanged = options.bloom !== this.options.bloom || (options.bloomLevels ?? 4) !== (this.options.bloomLevels ?? 4);
    this.options = { ...options };
    if (msaaChanged) {
      this.sceneRT.dispose();
      this.sceneRT = this.makeSceneRT(this.allocW, this.allocH);
    }
    if (bloomChanged) this.allocate();
  }

  /**
   * Size the chain: `w` x `h` native device px (the canvas), the scene target allocated at `maxScale` of it
   * and drawn at `scale` (≤ maxScale) through a sub-viewport.
   */
  setSize(w: number, h: number, maxScale = 1, scale = maxScale): void {
    this.nativeW = Math.max(1, Math.floor(w));
    this.nativeH = Math.max(1, Math.floor(h));
    this.maxScale = Math.max(0.1, maxScale);
    this.allocate();
    this.setScale(scale);
  }

  /** The dynamic scene scale (no reallocation; clamped to the allocation). */
  setScale(s: number): void {
    this.scale = Math.min(this.maxScale, Math.max(0.1, s));
    this.liveW = Math.max(1, Math.min(this.allocW, Math.round(this.nativeW * this.scale)));
    this.liveH = Math.max(1, Math.min(this.allocH, Math.round(this.nativeH * this.scale)));
    this.bloomLive = [];
    let bw = this.liveW;
    let bh = this.liveH;
    for (let i = 0; i < this.bloomRTs.length; i++) {
      bw = Math.max(1, Math.floor(bw / 2));
      bh = Math.max(1, Math.floor(bh / 2));
      this.bloomLive.push([Math.min(bw, this.bloomRTs[i].width), Math.min(bh, this.bloomRTs[i].height)]);
    }
  }

  get sceneScale(): number {
    return this.scale;
  }

  /** The live scene size in device px (point sprites size themselves by it). */
  get sceneSize(): { width: number; height: number } {
    return { width: this.liveW, height: this.liveH };
  }

  private allocate(): void {
    this.allocW = Math.max(1, Math.ceil(this.nativeW * this.maxScale));
    this.allocH = Math.max(1, Math.ceil(this.nativeH * this.maxScale));
    this.sceneRT.setSize(this.allocW, this.allocH);
    this.gradeRT.setSize(this.allocW, this.allocH);
    this.fxaaRT.setSize(this.allocW, this.allocH);
    for (const rt of this.bloomRTs) rt.dispose();
    for (const rt of this.scratch) rt?.dispose();
    this.scratch = [];
    this.bloomRTs = [];
    if (this.options.bloom) {
      let bw = this.allocW;
      let bh = this.allocH;
      const levels = this.options.bloomLevels ?? 4;
      for (let i = 0; i < levels; i++) {
        bw = Math.max(1, Math.floor(bw / 2));
        bh = Math.max(1, Math.floor(bh / 2));
        this.bloomRTs.push(new THREE.WebGLRenderTarget(bw, bh, { type: this.colorType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }));
      }
    }
    this.setScale(this.scale);
  }

  /** The LUT of biome index k (built on first use, cached; ≈ 30 ms to build in JS, 128 KB on the GPU). */
  lutFor(k: number): THREE.Data3DTexture {
    let t = this.luts.get(k);
    if (t) return t;
    t = new THREE.Data3DTexture(buildLut(gradeOf(k)), LUT_SIZE, LUT_SIZE, LUT_SIZE);
    t.format = THREE.RGBAFormat;
    t.type = THREE.UnsignedByteType;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    this.luts.set(k, t);
    this.lutOrder.push(k);
    // Keep at most 6 (the pair in use and their neighbours); the rest are rebuilt if a jump returns.
    while (this.lutOrder.length > 6) {
      const old = this.lutOrder.shift()!;
      const u = this.resolve?.uniforms;
      const tex = this.luts.get(old);
      if (tex && u && (u.tLutA.value === tex || u.tLutB.value === tex)) {
        this.lutOrder.push(old);
        if (this.lutOrder.length > 8) break;
        continue;
      }
      tex?.dispose();
      this.luts.delete(old);
    }
    return t;
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, w = 0, h = 0): void {
    this.quad.material = material;
    if (target) target.viewport.set(0, 0, w || target.width, h || target.height);
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  /** UV scale and clamp of a live rect inside an allocation. */
  private static fit(scale: THREE.Vector2, max: THREE.Vector2, lw: number, lh: number, aw: number, ah: number): void {
    scale.set(lw / aw, lh / ah);
    max.set((lw - 0.5) / aw, (lh - 0.5) / ah);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    const p = this.params;
    this.sceneRT.viewport.set(0, 0, this.liveW, this.liveH);
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(scene, camera);
    const pulse = Math.max(0, Math.min(1, p.bloomPulse || 0));
    const ru = this.resolve.uniforms;
    if (this.options.bloom && this.bloomRTs.length) {
      const rts = this.bloomRTs;
      const L = this.bloomLive;
      const b = this.bright.uniforms;
      b.tInput.value = this.sceneRT.texture;
      b.uTexel.value.set(1 / this.allocW, 1 / this.allocH);
      PostFX.fit(b.uScale.value, b.uMax.value, this.liveW, this.liveH, this.allocW, this.allocH);
      b.uThreshold.value = p.threshold * (1 - 0.3 * pulse);
      this.pass(this.bright, rts[0], L[0][0], L[0][1]);
      const d = this.down.uniforms;
      for (let i = 1; i < rts.length; i++) {
        d.tInput.value = rts[i - 1].texture;
        d.uTexel.value.set(1 / rts[i - 1].width, 1 / rts[i - 1].height);
        PostFX.fit(d.uScale.value, d.uMax.value, L[i - 1][0], L[i - 1][1], rts[i - 1].width, rts[i - 1].height);
        this.pass(this.down, rts[i], L[i][0], L[i][1]);
      }
      const u = this.up.uniforms;
      for (let i = rts.length - 1; i > 0; i--) {
        u.tInput.value = rts[i].texture;
        u.tBase.value = rts[i - 1].texture;
        u.uTexel.value.set(1 / rts[i].width, 1 / rts[i].height);
        PostFX.fit(u.uScale.value, u.uMax.value, L[i][0], L[i][1], rts[i].width, rts[i].height);
        PostFX.fit(u.uBaseScale.value, u.uBaseMax.value, L[i - 1][0], L[i - 1][1], rts[i - 1].width, rts[i - 1].height);
        // Ping-pong is avoided by accumulating into the larger level's scratch twin, then swapping.
        const s = this.scratchFor(i - 1);
        this.pass(this.up, s, L[i - 1][0], L[i - 1][1]);
        this.swapScratch(i - 1);
      }
      ru.tBloom.value = this.bloomRTs[0].texture;
      PostFX.fit(ru.uBloomScale.value, ru.uBloomMax.value, L[0][0], L[0][1], this.bloomRTs[0].width, this.bloomRTs[0].height);
      ru.uBloomStrength.value = p.bloomStrength + 0.6 * pulse;
    } else {
      ru.tBloom.value = black1;
      ru.uBloomScale.value.set(1, 1);
      ru.uBloomMax.value.set(1, 1);
      ru.uBloomStrength.value = 0;
    }
    // The grade pair from the look (BiomeLook writes the two biomes and the blend).
    const g = lookShared().uLookGrade.value;
    ru.tLutA.value = this.lutFor(g.x);
    ru.tLutB.value = this.lutFor(g.y);
    ru.uLutMix.value = g.z;
    ru.tScene.value = this.sceneRT.texture;
    PostFX.fit(ru.uScale.value, ru.uMax.value, this.liveW, this.liveH, this.allocW, this.allocH);
    ru.uExposure.value = p.exposure * p.zoneExposure;
    ru.uFlash.value = p.flash;
    ru.uFlashColor.value.copy(p.flashColor);
    this.pass(this.resolve, this.gradeRT, this.liveW, this.liveH);
    let src = this.gradeRT;
    if (this.options.fxaa) {
      const f = this.fxaa.uniforms;
      f.tInput.value = this.gradeRT.texture;
      f.uRcp.value.set(1 / this.allocW, 1 / this.allocH);
      PostFX.fit(f.uScale.value, f.uMax.value, this.liveW, this.liveH, this.allocW, this.allocH);
      this.pass(this.fxaa, this.fxaaRT, this.liveW, this.liveH);
      src = this.fxaaRT;
    }
    const fu = this.final.uniforms;
    fu.tSrc.value = src.texture;
    fu.uSrcSize.value.set(this.allocW, this.allocH);
    fu.uSrcLive.value.set(this.liveW, this.liveH);
    fu.uCas.value = this.scale < 0.99 ? this.casStrength : 0;
    fu.uVignette.value = p.vignette;
    fu.uDim.value = Math.max(0, Math.min(1, p.dim || 0));
    fu.uIris.value = Math.max(0, Math.min(1.5, p.iris ?? 1.5));
    PostFX.vec2From(p.irisCenter, fu.uIrisC.value);
    fu.uAspect.value = this.nativeW / this.nativeH;
    fu.uShock.value = Math.max(0, Math.min(1, p.shock || 0));
    PostFX.vec2From(p.shockCenter, fu.uShockC.value);
    fu.uTime.value = time;
    fu.uRes.value.set(this.nativeW, this.nativeH);
    this.pass(this.final, null);
  }

  /** Accept a Vector2 or an [u, v] array for a centre (callers set either). */
  private static vec2From(v: unknown, out: THREE.Vector2): void {
    if (v instanceof THREE.Vector2) out.copy(v);
    else if (Array.isArray(v) && v.length >= 2) out.set(Number(v[0]) || 0.5, Number(v[1]) || 0.5);
  }

  /** The passes of the current configuration with their pixel counts (the cost model, tools/perf.mjs). */
  passes(): PassInfo[] {
    const out: PassInfo[] = [];
    const add = (name: string, px: number, cost = PASS_COST[name]) => out.push({ name, px, fetches: cost.fetches, alu: cost.alu });
    if (this.options.bloom && this.bloomLive.length) {
      add('bright', this.bloomLive[0][0] * this.bloomLive[0][1]);
      for (let i = 1; i < this.bloomLive.length; i++) add('down', this.bloomLive[i][0] * this.bloomLive[i][1]);
      for (let i = this.bloomLive.length - 1; i > 0; i--) add('up', this.bloomLive[i - 1][0] * this.bloomLive[i - 1][1]);
    }
    add('resolve', this.liveW * this.liveH);
    if (this.options.fxaa) add('fxaa', this.liveW * this.liveH);
    const fin = PASS_COST.final;
    const cas = this.scale < 0.99 ? PASS_COST.cas : { fetches: 0, alu: 0 };
    add('final', this.nativeW * this.nativeH, { fetches: fin.fetches + cas.fetches, alu: fin.alu + cas.alu });
    return out;
  }

  /** Bytes of GPU memory the chain holds (render targets and LUTs), for the budget. */
  memoryBytes(): number {
    const hdrB = this.hdr ? 8 : 4;
    const samples = Math.max(1, this.options.msaa || 0);
    let b = this.allocW * this.allocH * (hdrB * samples + 4 * samples) + (this.options.msaa ? this.allocW * this.allocH * hdrB : 0);
    b += this.allocW * this.allocH * 4 * 2;
    for (const rt of this.bloomRTs) b += rt.width * rt.height * hdrB * 2;
    b += this.luts.size * LUT_SIZE ** 3 * 4;
    // The canvas back buffer (double-buffered RGBA8 + depth).
    b += this.nativeW * this.nativeH * (4 * 2 + 4);
    return b;
  }

  // Upsampling reads level i-1 as the base and writes the combined result; WebGL forbids reading and
  // writing the same texture, so each level has a scratch twin that we swap in.
  private scratch: Array<THREE.WebGLRenderTarget | undefined> = [];

  private scratchFor(level: number): THREE.WebGLRenderTarget {
    const base = this.bloomRTs[level];
    let s = this.scratch[level];
    if (!s || s.width !== base.width || s.height !== base.height) {
      s?.dispose();
      s = new THREE.WebGLRenderTarget(base.width, base.height, { type: this.colorType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.scratch[level] = s;
    }
    return s;
  }

  private swapScratch(level: number): void {
    const s = this.scratch[level]!;
    this.scratch[level] = this.bloomRTs[level];
    this.bloomRTs[level] = s;
  }

  dispose(): void {
    this.sceneRT.dispose();
    this.gradeRT.dispose();
    this.fxaaRT.dispose();
    for (const rt of this.bloomRTs) rt.dispose();
    for (const rt of this.scratch) rt?.dispose();
    for (const t of this.luts.values()) t.dispose();
    this.bright.dispose();
    this.down.dispose();
    this.up.dispose();
    this.resolve.dispose();
    this.fxaa.dispose();
    this.final.dispose();
  }
}
