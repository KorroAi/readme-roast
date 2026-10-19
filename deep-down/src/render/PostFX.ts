import * as THREE from 'three';
import { SCENE_ENCODE } from './lighting';

/**
 * Lightweight HDR post chain tuned for mobile:
 *   scene (HalfFloat, optional MSAA) -> bright pass -> 4-level dual-filter bloom
 *   -> composite: exposure, hue-preserving tone map, light grade, vignette, dither, sRGB.
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
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
${decodeGlsl}

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
const float CONTRAST = 1.15;
const float CONTRAST_PIVOT = 0.16;

// Filmic curve (ACES fit): a real toe (slope ~0.25 near black, no lift), so shadows are deep
// and the lit mids carry the contrast; white is reached around x = 6. Navigable darks come from
// the zones' cool fill and haze, not from lifting black.
float curve(float x) {
  return clamp((x * (2.51 * x + 0.035)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Hue-preserving tone map: in the highlights the curve drives the brightest channel and the
// other channels keep their ratio to it, so cyan and amber lights stay cyan and amber. In the
// shadows and mids half of the per-channel curve is kept (its toe deepens the weaker channels,
// which keeps dark stone and cloth rich instead of milky). Only very hot cores (flame centres,
// flashes) roll partly toward white.
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

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec3 hdr = sceneIn(texture(tScene, vUv).rgb);
  #ifdef USE_BLOOM
  hdr += texture(tBloom, vUv).rgb * uBloomStrength;
  #endif
  hdr *= uExposure;
  hdr += uFlashColor * uFlash;
  vec3 c = tonemap(hdr);
  // Split balance (the look): blue-black shadows (multiplied, so black stays black) and amber
  // highlights; the mids keep the light's own colour (warm pools stay warm, haze stays blue).
  // Weights are in display-linear luminance: 0.03 ~ sRGB 48, 0.12 ~ sRGB 97, 0.5 ~ sRGB 188.
  float lum = dot(c, LUMA);
  // Contrast: an S-curve on luminance around a pivot (display-linear 0.16 ~ sRGB 110), a power
  // below it and a mirrored power above it, so black and white stay fixed and the hue is kept.
  // It separates the mid-tones where the stone's texture and form live.
  float sl = lum < CONTRAST_PIVOT
    ? CONTRAST_PIVOT * pow(lum / CONTRAST_PIVOT, CONTRAST)
    : 1.0 - (1.0 - CONTRAST_PIVOT) * pow(max(1.0 - lum, 0.0) / (1.0 - CONTRAST_PIVOT), CONTRAST);
  c *= sl / max(lum, 1e-5);
  lum = sl;
  float ws = 1.0 - smoothstep(0.0, 0.14, lum);
  float wh = smoothstep(0.2, 0.75, lum);
  c *= mix(vec3(1.0), vec3(0.84, 0.95, 1.18), ws * 0.55);
  c *= mix(vec3(1.0), vec3(1.07, 1.0, 0.86), wh * 0.6);
  // Vignette: elliptical (follows the landscape screen), heavier toward the top, light at the
  // bottom where the joystick and jump button sit.
  vec2 q = vUv - 0.5;
  q.y *= q.y > 0.0 ? 1.25 : 0.55;
  c *= 1.0 - uVignette * smoothstep(0.42, 0.85, length(q));
  c = toSrgb(c);
  // Dither to hide banding in the dark fog gradients.
  c += (ign(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  fragColor = vec4(c, 1.0);
}
`;

export interface PostFXOptions {
  bloom: boolean;
  msaa: number;
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
  readonly params = { bloomStrength: 0.4, threshold: 1.2, exposure: 1.0, zoneExposure: 1, vignette: 0.25, flash: 0, flashColor: new THREE.Color(1, 1, 1) };

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
      },
      { ...enc, ...(options.bloom ? { USE_BLOOM: '' } : {}) },
    );
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
    this.options = { ...options };
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
    this.pass(this.composite, null);
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
  }
}
