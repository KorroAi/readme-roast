import * as THREE from 'three';
import { baseBiome, echoNumber } from '../idle/config/biomes';
import { BIOME_LOOKS } from '../idle/config/biomeLooks';
import { SCENE_ENCODE } from './light/uniforms';
import { COMPOSITE_FRAG, LIGHT_PASS_COST, LightPasses } from './light/passes';
import { DARK_LIFT, LIGHT_UNIFORMS } from './light/uniforms';
import type { LightRig } from './light/rig';
import { AGX_GLSL, TONE_LOOK } from './light/tonemap';
import { LUT_SIZE, buildLut, type GradeLook } from './post/lut';

/**
 * The filmic pipeline (W1-LEAD §4.8; owner 1E). Two resolutions:
 *
 *   scene     the world renders into a HalfFloat target (colour + a depth texture) at a dynamic fraction `s` of the
 *             native resolution, through a sub-viewport of a target allocated at the preset's top scale (a scale
 *             step never reallocates), optionally with 4x MSAA (High). Lit materials write the indirect share in alpha
 *   light     half resolution (light/passes.ts): linear depth, GTAO + its 4x4 blur, the volumetric march with
 *             temporal accumulation
 *   composite at scene resolution: GTAO on the indirect share, then the volumetric fog (c · T + in-scatter) into the
 *             lit target; then the overlay pass (the viewmodel) draws into it with its own depth
 *   bloom     bright pass (threshold ≥ 1) + 4-5 level dual-filter bloom (strength ≤ 0.25), clamped to the live rect
 *   resolve   exposure, flash, AgX, then the LUT pair of the two biomes nearest the camera (32^3, sRGB-encoded
 *             domain: lut.ts holds the W1 grade + each look), written sRGB-encoded with its luma in alpha
 *   fxaa      FXAA 3.11 (quality 12) at scene resolution, before the upsample (Balanced; High has MSAA)
 *   final     at native resolution into the canvas: a 5-tap Catmull-Rom upsample, CAS (only while s < 1), the
 *             vignette (≤ 0.15), dim, dither
 *
 * Banned and absent: chromatic aberration, lens flare, grain, motion blur, iris, shock rings, screen-space rays,
 * bloom pulses. Every program is compiled at construction; options switch passes and uniforms, never defines (P3
 * across presets). The 8-bit fallback (no float targets) keeps its ENCODED define and runs no light passes.
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
uniform vec4 uTone;      // x 0 = AgX, 1 = the hue-preserving ACES fit; y look power, z look saturation
uniform vec3 uLift;      // the hued dark floor (linear, added before the tone map): darks never below 0.04 display
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${decodeGlsl}
${AGX_GLSL}

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
  hdr += uLift;
  vec3 c = uTone.x < 0.5 ? agxDisplay(hdr, uTone.yz) : clamp(toSrgb(tonemap(hdr)), 0.0, 1.0);
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
uniform float uAspect;
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
  // Contrast-adaptive sharpening (the cross form of AMD CAS), only while the scene is below native, from the
  // Catmull-Rom's own outer taps (no fetch of its own).
  if (uCas > 0.001) {
    float lc = luma(c), ln = luma(n), ls = luma(s), le = luma(ea), lw = luma(we);
    float mn = min(lc, min(min(ln, ls), min(le, lw)));
    float mx = max(lc, max(max(ln, ls), max(le, lw)));
    float amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-5), 0.0, 1.0));
    float wgt = amp * (-1.0 / (8.0 - 3.0 * uCas));
    c = (c + (n + s + ea + we) * wgt) / (1.0 + 4.0 * wgt);
  }
  c = max(c, vec3(0.0));
  // The vignette (≤ 0.15): radial in the portrait frame, a little heavier at the crown so the eye falls to the
  // lit middle. The HUD bands sit on it anyway.
  vec2 q = (vUv - vec2(0.5, 0.47)) * vec2(uAspect, 1.0);
  float r = length(q * vec2(1.35, 1.0));
  float vig = smoothstep(0.28, 0.78, r) + 0.35 * smoothstep(0.7, 1.0, vUv.y);
  c *= 1.0 - min(uVignette, 0.15) * clamp(vig, 0.0, 1.0);
  c *= 1.0 - uDim;
  // Triangular dither (±1 LSB), static in time (stillness), against banding in the dark fog gradients.
  float t = ign(gl_FragCoord.xy) + ign(gl_FragCoord.xy + vec2(17.3, 41.9)) - 1.0;
  c += t / 255.0;
  fragColor = vec4(c, 1.0);
}
`;

/**
 * The post parameters other modules drive. DepthScene (1C) writes the look's threshold, bloomStrength, zoneExposure and
 * the grade pair every frame (or once per look change); ceremonies own the transient flash and dim and restore them.
 */
export interface PostParams {
  /** Bloom strength of the current look (≤ 0.25, SPEC §8.3). */
  bloomStrength: number;
  /** Bloom threshold, scene-linear luminance (≥ 1.0). */
  threshold: number;
  /** The player's brightness x the base exposure (Renderer.setBrightness). */
  exposure: number;
  /** The biome look's exposure (1.0 ± 0.15). */
  zoneExposure: number;
  /** Vignette strength (clamped to 0.15). */
  vignette: number;
  /** A full-screen lift 0..1 added in HDR before the tone map: the seal opening's one 0.12 lift ≤ 150 ms only. */
  flash: number;
  flashColor: THREE.Color;
  /** Dim 0..1: darkens the whole frame (a sheet 30 %, the focus pop 30 %). */
  dim: number;
  /** The grade: the LUT pair of the two nearest biomes (indices) and their blend 0..1. */
  gradeA: number;
  gradeB: number;
  gradeMix: number;
  /** Tone map: 0 = AgX (the default), 1 = the old hue-preserving ACES fit (A/B captures only). */
  tonemap: number;
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

/** What the lighting composite does this frame (from the rig's features; Battery: none). */
export interface LightPassOptions {
  ao: boolean;
  vol: boolean;
  volSteps: number;
  volShadow: boolean;
  /** Fraction of the scene resolution of the half-res passes (0.5). */
  scale: number;
  /** Debug view: 0 none, 1 AO only, 2 fog in-scatter only. */
  debug: number;
}

/** A pass drawn after the lighting composite with its own camera (the viewmodel), depth cleared first. */
export interface OverlayPass {
  scene: THREE.Scene;
  camera: THREE.Camera;
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

/** Per-pixel costs of each post pass (fetches, ALU), from the shaders above and light/passes.ts. */
export const PASS_COST: Record<string, { fetches: number; alu: number }> = {
  bright: { fetches: 4, alu: 30 },
  down: { fetches: 5, alu: 12 },
  up: { fetches: 9, alu: 18 },
  // AgX: two 3x3 matrices, a log2 and a degree-6 polynomial per channel, the look (its output is display-encoded:
  // no sRGB pow); then the LUT pair.
  resolve: { fetches: 4, alu: 84 },
  // FXAA: most pixels leave after the 5-tap range test; the edge walk (up to 12 more) is the minority.
  fxaa: { fetches: 6, alu: 30 },
  final: { fetches: 5, alu: 50 },
  // CAS reuses the Catmull-Rom's outer taps: no fetch of its own.
  cas: { fetches: 0, alu: 28 },
  ...LIGHT_PASS_COST,
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
  /** The lit target: the composite (AO, fog) of the world, then the overlay; bloom and the resolve read it. */
  private litRT: THREE.WebGLRenderTarget;
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
  private readonly composite: THREE.ShaderMaterial;
  /** The half-resolution lighting passes (GTAO, volumetrics). */
  readonly light: LightPasses;
  /** What the lighting composite does (the Renderer sets it from the rig's features each frame). */
  lightOptions: LightPassOptions = { ao: false, vol: false, volSteps: 12, volShadow: false, scale: 0.5, debug: 0 };
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
  private lastLightPasses = { ao: false, vol: false, composite: false, volSteps: 0 };
  private readonly sceneUv = { scale: new THREE.Vector2(1, 1), max: new THREE.Vector2(1, 1), texel: new THREE.Vector2(1, 1) };
  /**
   * HDR targets need EXT_color_buffer_(half_)float to be renderable. A WebGL2 device without it would
   * otherwise get an incomplete framebuffer (a black screen): fall back to 8-bit targets.
   */
  readonly hdr: boolean;
  private readonly colorType: THREE.TextureDataType;
  readonly params: PostParams = {
    bloomStrength: 0.2,
    threshold: 1.2,
    exposure: 1.0,
    zoneExposure: 1,
    vignette: 0.14,
    flash: 0,
    flashColor: new THREE.Color(1, 1, 1),
    dim: 0,
    gradeA: 0,
    gradeB: 0,
    gradeMix: 0,
    tonemap: 0,
  };
  /** The tone map's look (power, saturation): restrained, SPEC §8.3. */
  readonly toneLook = new THREE.Vector2(TONE_LOOK[0], TONE_LOOK[1]);
  /** CAS strength while the scene is below native (SPEC §11.3: 0.2). */
  casStrength = 0.2;

  constructor(renderer: THREE.WebGLRenderer, options: PostFXOptions) {
    const ext = renderer.extensions;
    this.hdr = !options.forceLdr && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.colorType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.renderer = renderer;
    this.options = { ...options };
    this.sceneRT = this.makeSceneRT(1, 1);
    this.litRT = this.makeLitRT(1, 1);
    this.gradeRT = this.makeLdrRT(1, 1);
    this.fxaaRT = this.makeLdrRT(1, 1);
    this.light = new LightPasses();
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
        uBloomStrength: { value: 0.2 },
        uExposure: { value: 1 },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color() },
        uTone: { value: new THREE.Vector4(0, TONE_LOOK[0], TONE_LOOK[1], 0) },
        uLift: { value: new THREE.Vector3() },
      },
      enc,
    );
    this.fxaa = mk(fxaaFrag, { tInput: { value: null }, uRcp: v2(), uScale: v2(), uMax: v2() });
    this.final = mk(finalFrag, {
      tSrc: { value: null },
      uSrcSize: v2(),
      uSrcLive: v2(),
      uCas: { value: 0 },
      uVignette: { value: 0.14 },
      uDim: { value: 0 },
      uAspect: { value: 0.46 },
      uTime: { value: 0 },
      uRes: v2(),
    });
    this.composite = mk(COMPOSITE_FRAG, {
      tScene: { value: null },
      tDepth: { value: null },
      tAo: { value: black1 },
      tVol: { value: black1 },
      tDepthH: { value: black1 },
      uScale: v2(),
      uMax: v2(),
      uHalfLive: v2(),
      uHalfAlloc: v2(),
      uNearFar: v2(),
      uOn: { value: new THREE.Vector4(0, 0, 0.85, 0) },
    });
    this.quad = new THREE.Mesh(geo, this.final);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
    this.compileAll();
  }

  /** Compile every post program now (P3: nothing compiles after load, whatever the preset). */
  compileAll(): void {
    for (const m of [this.bright, this.down, this.up, this.resolve, this.fxaa, this.final, this.composite, ...this.light.materials()]) {
      this.quad.material = m;
      this.renderer.compile(this.quadScene, this.quadCam);
    }
    this.quad.material = this.final;
  }

  private makeSceneRT(w: number, h: number): THREE.WebGLRenderTarget {
    const samples = this.options?.msaa ?? 0;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: this.colorType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      samples,
      // The lighting passes read the depth: resolve it (MSAA) into the depth texture.
      resolveDepthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    if (this.hdr) {
      const dt = new THREE.DepthTexture(w, h);
      dt.type = THREE.UnsignedIntType;
      dt.minFilter = dt.magFilter = THREE.NearestFilter;
      rt.depthTexture = dt;
    }
    return rt;
  }

  /** Never multisampled: the composite needs no MSAA, and the overlay's edges get FXAA (memory: one more HDR target). */
  private makeLitRT(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: this.colorType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      samples: 0,
      resolveDepthBuffer: false,
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
      this.sceneRT.depthTexture?.dispose();
      this.sceneRT = this.makeSceneRT(this.allocW, this.allocH);
    }
    if (bloomChanged) this.allocate();
    this.light.resetHistory();
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
    this.light.setLive(this.liveW, this.liveH, this.lightOptions.scale);
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
    this.litRT.setSize(this.allocW, this.allocH);
    this.gradeRT.setSize(this.allocW, this.allocH);
    this.fxaaRT.setSize(this.allocW, this.allocH);
    this.light.setSize(this.allocW, this.allocH, this.lightOptions.scale);
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

  /**
   * One frame: the world into the scene target, the lighting passes and composite (when the rig asks for them), the
   * overlay (the viewmodel, its own camera, depth cleared), then bloom, the resolve, FXAA and the final composite.
   */
  render(scene: THREE.Scene, camera: THREE.Camera, time: number, overlay?: OverlayPass | null, rig?: LightRig | null): void {
    const r = this.renderer;
    const p = this.params;
    const lo = this.lightOptions;
    const persp = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? (camera as THREE.PerspectiveCamera) : null;
    const lightOn = this.hdr && !!persp && !!this.sceneRT.depthTexture && (lo.ao || lo.vol);
    this.sceneRT.viewport.set(0, 0, this.liveW, this.liveH);
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(scene, camera);
    let src = this.sceneRT;
    if (lightOn && persp) {
      PostFX.fit(this.sceneUv.scale, this.sceneUv.max, this.liveW, this.liveH, this.allocW, this.allocH);
      this.sceneUv.texel.set(1 / this.allocW, 1 / this.allocH);
      this.light.run(
        (m, t, w, h) => this.pass(m, t, w, h),
        this.sceneRT.depthTexture!,
        persp,
        this.sceneUv,
        { ao: lo.ao, vol: lo.vol, steps: lo.volSteps, volShadow: lo.volShadow, anisotropy: rig?.fog.anisotropy ?? 0.35, scatter: rig?.fog.scatter ?? 1 },
      );
      const cu = this.composite.uniforms;
      cu.tScene.value = this.sceneRT.texture;
      cu.tDepth.value = this.sceneRT.depthTexture;
      cu.tAo.value = lo.ao ? this.light.aoBlurRT.texture : black1;
      cu.tVol.value = lo.vol ? this.light.volResult : black1;
      cu.tDepthH.value = this.light.depthRT.texture;
      cu.uScale.value.copy(this.sceneUv.scale);
      cu.uMax.value.copy(this.sceneUv.max);
      cu.uHalfLive.value.set(this.light.liveW, this.light.liveH);
      cu.uHalfAlloc.value.set(this.light.allocW, this.light.allocH);
      cu.uNearFar.value.set(persp.near, persp.far);
      cu.uOn.value.set(lo.ao ? 1 : 0, lo.vol ? 1 : 0, this.light.ao.strength, lo.debug);
      this.pass(this.composite, this.litRT, this.liveW, this.liveH);
      src = this.litRT;
    } else this.light.resetHistory();
    this.lastLightPasses = { ao: lightOn && lo.ao, vol: lightOn && lo.vol, composite: lightOn, volSteps: lo.volSteps };
    if (overlay) {
      src.viewport.set(0, 0, this.liveW, this.liveH);
      r.setRenderTarget(src);
      r.clear(false, true, false);
      r.render(overlay.scene, overlay.camera);
    }
    const ru = this.resolve.uniforms;
    if (this.options.bloom && this.bloomRTs.length) {
      const rts = this.bloomRTs;
      const L = this.bloomLive;
      const b = this.bright.uniforms;
      b.tInput.value = src.texture;
      b.uTexel.value.set(1 / this.allocW, 1 / this.allocH);
      PostFX.fit(b.uScale.value, b.uMax.value, this.liveW, this.liveH, this.allocW, this.allocH);
      b.uThreshold.value = Math.max(1, p.threshold);
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
        const sc = this.scratchFor(i - 1);
        this.pass(this.up, sc, L[i - 1][0], L[i - 1][1]);
        this.swapScratch(i - 1);
      }
      ru.tBloom.value = this.bloomRTs[0].texture;
      PostFX.fit(ru.uBloomScale.value, ru.uBloomMax.value, L[0][0], L[0][1], this.bloomRTs[0].width, this.bloomRTs[0].height);
      ru.uBloomStrength.value = Math.min(0.25, Math.max(0, p.bloomStrength));
    } else {
      ru.tBloom.value = black1;
      ru.uBloomScale.value.set(1, 1);
      ru.uBloomMax.value.set(1, 1);
      ru.uBloomStrength.value = 0;
    }
    // The grade pair (DepthScene writes the two biomes and the blend).
    ru.tLutA.value = this.lutFor(Math.max(0, Math.floor(p.gradeA)));
    ru.tLutB.value = this.lutFor(Math.max(0, Math.floor(p.gradeB)));
    ru.uLutMix.value = Math.max(0, Math.min(1, p.gradeMix));
    ru.tScene.value = src.texture;
    PostFX.fit(ru.uScale.value, ru.uMax.value, this.liveW, this.liveH, this.allocW, this.allocH);
    ru.uExposure.value = p.exposure * p.zoneExposure;
    ru.uFlash.value = Math.max(0, Math.min(0.12, p.flash));
    ru.uFlashColor.value.copy(p.flashColor);
    ru.uTone.value.set(p.tonemap, this.toneLook.x, this.toneLook.y, 0);
    // The dark floor takes the hue of the space's haze at a fixed luminance (W1-LEAD §4.3: darks stay hued, ≥ 0.04).
    const fog = LIGHT_UNIFORMS.uL_FogColor.value;
    const fl = 0.2126 * fog.r + 0.7152 * fog.g + 0.0722 * fog.b;
    const k = fl > 1e-6 ? DARK_LIFT / fl : 0;
    ru.uLift.value.set(fog.r * k, fog.g * k, fog.b * k).multiplyScalar(this.hdr ? 1 : 0);
    this.pass(this.resolve, this.gradeRT, this.liveW, this.liveH);
    let out = this.gradeRT;
    if (this.options.fxaa) {
      const f = this.fxaa.uniforms;
      f.tInput.value = this.gradeRT.texture;
      f.uRcp.value.set(1 / this.allocW, 1 / this.allocH);
      PostFX.fit(f.uScale.value, f.uMax.value, this.liveW, this.liveH, this.allocW, this.allocH);
      this.pass(this.fxaa, this.fxaaRT, this.liveW, this.liveH);
      out = this.fxaaRT;
    }
    const fu = this.final.uniforms;
    fu.tSrc.value = out.texture;
    fu.uSrcSize.value.set(this.allocW, this.allocH);
    fu.uSrcLive.value.set(this.liveW, this.liveH);
    fu.uCas.value = this.scale < 0.99 ? this.casStrength : 0;
    fu.uVignette.value = Math.min(0.15, Math.max(0, p.vignette));
    fu.uDim.value = Math.max(0, Math.min(1, p.dim || 0));
    fu.uAspect.value = this.nativeW / this.nativeH;
    fu.uTime.value = time;
    fu.uRes.value.set(this.nativeW, this.nativeH);
    this.pass(this.final, null);
  }

  /** The passes of the current configuration with their pixel counts (the cost model, tools/perf.mjs). */
  passes(): PassInfo[] {
    const out: PassInfo[] = [];
    const add = (name: string, px: number, cost = PASS_COST[name]) => out.push({ name, px, fetches: cost.fetches, alu: cost.alu });
    const lp = this.lastLightPasses;
    if (lp.composite) {
      const hpx = this.light.liveW * this.light.liveH;
      add('lightDepth', hpx);
      if (lp.ao) {
        add('gtao', hpx);
        add('aoBlur', hpx);
      }
      if (lp.vol) {
        const st = PASS_COST.volStep;
        const vb = PASS_COST.volBase;
        add('vol', hpx, { fetches: vb.fetches + st.fetches * lp.volSteps, alu: vb.alu + st.alu * lp.volSteps });
      }
      add('composite', this.liveW * this.liveH);
    }
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
    // The scene target (colour and depth, multisampled on High, plus its resolve), the lit target and the depth texture.
    let b = this.allocW * this.allocH * (hdrB * samples + 4 * samples) + (this.options.msaa ? this.allocW * this.allocH * hdrB : 0);
    b += this.allocW * this.allocH * (hdrB + 4);
    b += this.allocW * this.allocH * 4;
    b += this.allocW * this.allocH * 4 * 2;
    for (const rt of this.bloomRTs) b += rt.width * rt.height * hdrB * 2;
    b += this.luts.size * LUT_SIZE ** 3 * 4;
    b += this.light.memoryBytes();
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
    this.sceneRT.depthTexture?.dispose();
    this.sceneRT.dispose();
    this.litRT.dispose();
    this.gradeRT.dispose();
    this.fxaaRT.dispose();
    for (const rt of this.bloomRTs) rt.dispose();
    for (const rt of this.scratch) rt?.dispose();
    for (const t of this.luts.values()) t.dispose();
    this.light.dispose();
    this.bright.dispose();
    this.down.dispose();
    this.up.dispose();
    this.resolve.dispose();
    this.fxaa.dispose();
    this.final.dispose();
    this.composite.dispose();
  }
}
