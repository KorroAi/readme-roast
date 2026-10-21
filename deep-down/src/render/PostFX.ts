import * as THREE from 'three';
import { SCENE_ENCODE } from './lighting';

/**
 * Lightweight HDR post chain tuned for mobile:
 *   scene (HalfFloat, optional MSAA) -> bright pass -> 4-level dual-filter bloom
 *   -> composite: exposure, PBR Neutral tone map, grade (cool lift, warm gain, saturation),
 *      portrait vignette and a darker crown, dither, sRGB -> FXAA (no-MSAA presets).
 *
 * Bloom is optional; with it disabled the chain is a single fullscreen pass.
 *
 * Design notes (art direction: restrained glow, blue-black but navigable shadows):
 * - Bloom is extracted on luminance above a high threshold, so only true light sources (flames,
 *   lamp glass, the brightest crystal facets) bloom, not every lit glyph or cyan surface.
 * - The tone curve is applied to the brightest channel and the colour keeps its ratios, so
 *   saturated cyan and amber highlights stay cyan and amber instead of bleaching to white.
 * - The toe is not lifted (ACES-like, slope ~0.25 near black): readable darks come from the
 *   zones' cool fill and haze, so blacks stay deep and the lit mids carry the contrast.
 * - The grade is a split balance: blue-black shadows and amber highlights; mids keep the light's colour.
 * - The vignette follows the screen shape and is weighted to the top (the ceiling), so the
 *   bottom corners where the touch controls sit stay clean.
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
uniform float uThreshold;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${decodeGlsl}
void main() {
  // 4-tap box downsample while extracting, to avoid fireflies.
  vec3 c = sceneIn(texture(tInput, vUv + uTexel * vec2(-0.5, -0.5)).rgb);
  c += sceneIn(texture(tInput, vUv + uTexel * vec2(0.5, -0.5)).rgb);
  c += sceneIn(texture(tInput, vUv + uTexel * vec2(-0.5, 0.5)).rgb);
  c += sceneIn(texture(tInput, vUv + uTexel * vec2(0.5, 0.5)).rgb);
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
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 c = texture(tInput, vUv).rgb * 4.0;
  c += texture(tInput, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  fragColor = vec4(c / 8.0, 1.0);
}
`;

const upFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform sampler2D tBase;
uniform vec2 uTexel;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
void main() {
  vec3 c = texture(tInput, vUv + uTexel * vec2(-1.0, 0.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(1.0, 0.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(0.0, -1.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(0.0, 1.0)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(-0.7, -0.7)).rgb * 0.5;
  c += texture(tInput, vUv + uTexel * vec2(0.7, -0.7)).rgb * 0.5;
  c += texture(tInput, vUv + uTexel * vec2(-0.7, 0.7)).rgb * 0.5;
  c += texture(tInput, vUv + uTexel * vec2(0.7, 0.7)).rgb * 0.5;
  fragColor = vec4(c / 6.0 + texture(tBase, vUv).rgb, 1.0);
}
`;

const compositeFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uTime;
uniform vec2 uResolution;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uSat;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${decodeGlsl}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

// Khronos PBR Neutral tone mapping (the Lantern Voxel look the director picked): linear up to
// ~0.76, a soft shoulder above, hue and saturation kept, so amber pools stay amber and cyan
// crystals stay cyan instead of bleaching; only very hot cores roll toward white.
vec3 neutral(vec3 c) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.08; // half Khronos' 0.15: bright lantern-lit stone stays warm
  float x = min(c.r, min(c.g, c.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max(c.r, max(c.g, c.b));
  if (peak < startCompression) return c;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  c *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(c, vec3(newPeak), g);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec3 hdr = sceneIn(texture(tScene, vUv).rgb);
  #ifdef USE_BLOOM
  hdr += texture(tBloom, vUv).rgb * uBloomStrength;
  #endif
  hdr *= uExposure;
  // Feedback tint (damage, a rune waking): at the screen's edge only and gentle, never a full-screen
  // flash over the play.
  vec2 q = vUv - 0.5;
  float edge = smoothstep(0.25, 0.75, length(q * vec2(1.0, 0.7)));
  hdr += uFlashColor * uFlash * edge * 0.6;
  vec3 c = neutral(hdr);
  // Grade: hued (never crushed) darks lifted toward a cool teal, warm highlights, gentle saturation.
  float l = dot(c, LUMA);
  c += uLift * (1.0 - smoothstep(0.0, 0.35, l));
  c *= mix(vec3(1.0), uGain, smoothstep(0.25, 0.9, l));
  c = max(mix(vec3(l), c, uSat), 0.0);
  // Vignette for the portrait frame, and a darker crown: the vault frames the view, the eye falls
  // to the lit middle (the HUD corners at the bottom stay clean).
  vec2 qa = q;
  qa.x *= uResolution.x / max(uResolution.y, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(qa * vec2(1.25, 0.95)));
  c *= 1.0 - 0.2 * smoothstep(0.62, 1.0, vUv.y);
  c = toSrgb(clamp(c, 0.0, 1.0));
  // Triangular dither (+-1 LSB) against banding in the dark gradients.
  float n = ign(gl_FragCoord.xy + fract(uTime) * 61.0) + ign(gl_FragCoord.xy + 17.3) - 1.0;
  c += n / 255.0;
  // FXAA reads luma from alpha (computed on the graded image).
  fragColor = vec4(c, dot(c, vec3(0.299, 0.587, 0.114)));
}
`;

// FXAA (after Lottes' FXAA 3.11 "quality" preset, reduced to 5 search steps): smooths the stair
// steps of voxel silhouettes and thin props on presets without MSAA. Luma comes from alpha.
const fxaaFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
float lumaAt(vec2 uv) { return texture(tInput, uv).a; }
void main() {
  vec4 rgbM = texture(tInput, vUv);
  float lM = rgbM.a;
  float lN = lumaAt(vUv + vec2(0.0, uTexel.y));
  float lS = lumaAt(vUv - vec2(0.0, uTexel.y));
  float lE = lumaAt(vUv + vec2(uTexel.x, 0.0));
  float lW = lumaAt(vUv - vec2(uTexel.x, 0.0));
  float lMax = max(lM, max(max(lN, lS), max(lE, lW)));
  float lMin = min(lM, min(min(lN, lS), min(lE, lW)));
  float range = lMax - lMin;
  if (range < max(0.0312, lMax * 0.125)) { fragColor = vec4(rgbM.rgb, 1.0); return; }
  float lNW = lumaAt(vUv + vec2(-uTexel.x, uTexel.y));
  float lNE = lumaAt(vUv + uTexel);
  float lSW = lumaAt(vUv - uTexel);
  float lSE = lumaAt(vUv + vec2(uTexel.x, -uTexel.y));
  float edgeH = abs(lNW + lNE - 2.0 * lN) + 2.0 * abs(lW + lE - 2.0 * lM) + abs(lSW + lSE - 2.0 * lS);
  float edgeV = abs(lNW + lSW - 2.0 * lW) + 2.0 * abs(lN + lS - 2.0 * lM) + abs(lNE + lSE - 2.0 * lE);
  bool horz = edgeH >= edgeV;
  float l1 = horz ? lS : lW;
  float l2 = horz ? lN : lE;
  float g1 = abs(l1 - lM);
  float g2 = abs(l2 - lM);
  float stepLen = horz ? uTexel.y : uTexel.x;
  float lLocal;
  float gScaled;
  if (g1 >= g2) { stepLen = -stepLen; lLocal = 0.5 * (l1 + lM); gScaled = 0.25 * g1; }
  else { lLocal = 0.5 * (l2 + lM); gScaled = 0.25 * g2; }
  vec2 uvE = vUv;
  if (horz) uvE.y += stepLen * 0.5; else uvE.x += stepLen * 0.5;
  vec2 off = horz ? vec2(uTexel.x, 0.0) : vec2(0.0, uTexel.y);
  vec2 uv1 = uvE - off;
  vec2 uv2 = uvE + off;
  float e1 = lumaAt(uv1) - lLocal;
  float e2 = lumaAt(uv2) - lLocal;
  bool d1 = abs(e1) >= gScaled;
  bool d2 = abs(e2) >= gScaled;
  const float QUALITY[5] = float[](1.5, 2.0, 4.0, 8.0, 12.0);
  for (int i = 0; i < 5; i++) {
    if (d1 && d2) break;
    if (!d1) { uv1 -= off * QUALITY[i]; e1 = lumaAt(uv1) - lLocal; d1 = abs(e1) >= gScaled; }
    if (!d2) { uv2 += off * QUALITY[i]; e2 = lumaAt(uv2) - lLocal; d2 = abs(e2) >= gScaled; }
  }
  float dist1 = horz ? vUv.x - uv1.x : vUv.y - uv1.y;
  float dist2 = horz ? uv2.x - vUv.x : uv2.y - vUv.y;
  bool closer1 = dist1 < dist2;
  float dMin = min(dist1, dist2);
  float edgeLen = dist1 + dist2;
  float pixOff = -dMin / max(edgeLen, 1e-6) + 0.5;
  bool smaller = lM < lLocal;
  bool good = ((closer1 ? e1 : e2) < 0.0) != smaller;
  float finalOff = good ? pixOff : 0.0;
  float lAvg = (2.0 * (lN + lS + lE + lW) + lNW + lNE + lSW + lSE) / 12.0;
  float sub = clamp(abs(lAvg - lM) / range, 0.0, 1.0);
  sub = (-2.0 * sub + 3.0) * sub * sub;
  finalOff = max(finalOff, sub * sub * 0.75);
  vec2 uv = vUv;
  if (horz) uv.y += finalOff * stepLen; else uv.x += finalOff * stepLen;
  fragColor = vec4(texture(tInput, uv).rgb, 1.0);
}
`;

export interface PostFXOptions {
  bloom: boolean;
  msaa: number;
  /** FXAA after the grade (one more full-screen pass): on where there is no MSAA, off on Battery. */
  fxaa?: boolean;
  /** Debug: use the 8-bit fallback targets even when float targets are renderable. */
  forceLdr?: boolean;
}

export class PostFX {
  private readonly renderer: THREE.WebGLRenderer;
  private sceneRT: THREE.WebGLRenderTarget;
  private bloomRTs: THREE.WebGLRenderTarget[] = [];
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly bright: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private width = 1;
  private height = 1;
  private options: PostFXOptions;
  /**
   * HDR targets need EXT_color_buffer_(half_)float to be renderable. A WebGL2 device without it
   * would otherwise get an incomplete framebuffer (a black screen): fall back to 8-bit targets
   * (no HDR headroom, so bloom has little to catch, but the game is playable).
   */
  readonly hdr: boolean;
  private readonly colorType: THREE.TextureDataType;
  /**
   * threshold is scene-linear luminance (lamp glass and flames sit at 1.5-3, lit rock below 0.5);
   * zoneExposure is the current atmosphere's exposure multiplier (LightingRig.exposure).
   */
  readonly params = {
    bloomStrength: 0.42,
    threshold: 1.6,
    exposure: 1.0,
    zoneExposure: 1,
    vignette: 0.28,
    flash: 0,
    flashColor: new THREE.Color(1, 1, 1),
    /** Grade (display-linear): cool lift of the darks, warm gain of the highlights, saturation. */
    lift: new THREE.Color(0.0024, 0.0052, 0.0072),
    gain: new THREE.Color(1.05, 1.0, 0.93),
    saturation: 1.12,
  };
  private ldrRT: THREE.WebGLRenderTarget | null = null;
  private readonly fxaa: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer, options: PostFXOptions) {
    const ext = renderer.extensions;
    this.hdr = !options.forceLdr && (ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float'));
    this.colorType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.renderer = renderer;
    this.options = { ...options };
    this.sceneRT = this.makeSceneRT(1, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) =>
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: fullscreenVert, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    // 8-bit fallback: lit materials encode the scene (SCENE_ENCODE), the passes reading it decode.
    SCENE_ENCODE.value = this.hdr ? 0 : 1;
    const enc: Record<string, string> = this.hdr ? {} : { ENCODED: '' };
    this.bright = mk(brightFrag, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } }, enc);
    this.down = mk(downFrag, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mk(upFrag, { tInput: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.composite = mk(
      compositeFrag,
      {
        tScene: { value: null },
        tBloom: { value: null },
        uBloomStrength: { value: 0.5 },
        uExposure: { value: 1 },
        uVignette: { value: 0.4 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uFlash: { value: 0 },
        uFlashColor: { value: new THREE.Color() },
        uLift: { value: new THREE.Color() },
        uGain: { value: new THREE.Color(1, 1, 1) },
        uSat: { value: 1 },
      },
      { ...enc, ...(options.bloom ? { USE_BLOOM: '' } : {}) },
    );
    this.fxaa = mk(fxaaFrag, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.quad = new THREE.Mesh(geo, this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
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

  setOptions(options: PostFXOptions): void {
    const msaaChanged = options.msaa !== this.options.msaa;
    const bloomChanged = options.bloom !== this.options.bloom;
    const fxaaChanged = !!options.fxaa !== !!this.options.fxaa;
    this.options = { ...options };
    if (fxaaChanged && !bloomChanged) this.setSize(this.width, this.height);
    if (msaaChanged) {
      this.sceneRT.dispose();
      this.sceneRT = this.makeSceneRT(this.width, this.height);
    }
    if (bloomChanged) {
      this.composite.defines = { ...(this.hdr ? {} : { ENCODED: '' }), ...(options.bloom ? { USE_BLOOM: '' } : {}) };
      this.composite.needsUpdate = true;
      this.setSize(this.width, this.height);
    }
  }

  setSize(w: number, h: number): void {
    this.width = Math.max(1, Math.floor(w));
    this.height = Math.max(1, Math.floor(h));
    this.sceneRT.setSize(this.width, this.height);
    for (const rt of this.bloomRTs) rt.dispose();
    this.bloomRTs = [];
    if (this.options.bloom) {
      let bw = this.width;
      let bh = this.height;
      for (let i = 0; i < 4; i++) {
        bw = Math.max(1, Math.floor(bw / 2));
        bh = Math.max(1, Math.floor(bh / 2));
        this.bloomRTs.push(
          new THREE.WebGLRenderTarget(bw, bh, { type: this.colorType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
        );
      }
    }
    this.composite.uniforms.uResolution.value.set(this.width, this.height);
    this.ldrRT?.dispose();
    this.ldrRT = null;
    if (this.options.fxaa) {
      this.ldrRT = new THREE.WebGLRenderTarget(this.width, this.height, { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
      this.fxaa.uniforms.tInput.value = this.ldrRT.texture;
      this.fxaa.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
    }
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCam);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    const r = this.renderer;
    r.setRenderTarget(this.sceneRT);
    r.clear(true, true, false);
    r.render(scene, camera);

    if (this.options.bloom && this.bloomRTs.length) {
      const rts = this.bloomRTs;
      this.bright.uniforms.tInput.value = this.sceneRT.texture;
      this.bright.uniforms.uTexel.value.set(1 / this.width, 1 / this.height);
      this.bright.uniforms.uThreshold.value = this.params.threshold;
      this.pass(this.bright, rts[0]);
      for (let i = 1; i < rts.length; i++) {
        this.down.uniforms.tInput.value = rts[i - 1].texture;
        this.down.uniforms.uTexel.value.set(1 / rts[i - 1].width, 1 / rts[i - 1].height);
        this.pass(this.down, rts[i]);
      }
      for (let i = rts.length - 1; i > 0; i--) {
        this.up.uniforms.tInput.value = rts[i].texture;
        this.up.uniforms.tBase.value = rts[i - 1].texture;
        this.up.uniforms.uTexel.value.set(1 / rts[i].width, 1 / rts[i].height);
        // Ping-pong is avoided by accumulating into the larger level in place via a copy target.
        this.pass(this.up, this.scratchFor(i - 1));
        this.swapScratch(i - 1);
      }
      this.composite.uniforms.tBloom.value = rts[0].texture;
    }

    const u = this.composite.uniforms;
    u.tScene.value = this.sceneRT.texture;
    u.uBloomStrength.value = this.params.bloomStrength;
    u.uExposure.value = this.params.exposure * this.params.zoneExposure;
    u.uVignette.value = this.params.vignette;
    u.uTime.value = time;
    u.uFlash.value = this.params.flash;
    u.uFlashColor.value.copy(this.params.flashColor);
    u.uLift.value.copy(this.params.lift);
    u.uGain.value.copy(this.params.gain);
    u.uSat.value = this.params.saturation;
    if (this.ldrRT) {
      this.pass(this.composite, this.ldrRT);
      this.pass(this.fxaa, null);
    } else this.pass(this.composite, null);
  }

  // Upsampling reads level i-1 as the base and writes the combined result; WebGL forbids
  // reading and writing the same texture, so each level has a scratch twin that we swap in.
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
    for (const rt of this.bloomRTs) rt.dispose();
    for (const rt of this.scratch) rt?.dispose();
    this.bright.dispose();
    this.down.dispose();
    this.up.dispose();
    this.composite.dispose();
    this.fxaa.dispose();
    this.ldrRT?.dispose();
  }
}
