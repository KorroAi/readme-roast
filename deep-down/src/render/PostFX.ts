import * as THREE from 'three';

/**
 * Lightweight HDR post chain tuned for mobile:
 *   scene (HalfFloat, optional MSAA) -> bright pass -> 4-level dual-filter bloom
 *   -> composite: exposure, filmic tone map, split-tone grade, vignette, dither, sRGB.
 *
 * Bloom is optional; with it disabled the chain is a single fullscreen pass.
 */

const fullscreenVert = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const brightFrag = /* glsl */ `
precision highp float;
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uThreshold;
in vec2 vUv;
layout(location = 0) out highp vec4 fragColor;
void main() {
  // 4-tap box downsample while extracting, to avoid fireflies.
  vec3 c = texture(tInput, vUv + uTexel * vec2(-0.5, -0.5)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(0.5, -0.5)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(-0.5, 0.5)).rgb;
  c += texture(tInput, vUv + uTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.6;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);
  fragColor = vec4(min(c * contrib, vec3(16.0)), 1.0);
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

vec3 filmic(vec3 x) {
  // ACES fitted (Narkowicz), gentle on saturated emissives.
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec3 hdr = texture(tScene, vUv).rgb;
  #ifdef USE_BLOOM
  hdr += texture(tBloom, vUv).rgb * uBloomStrength;
  #endif
  hdr *= uExposure;
  hdr += uFlashColor * uFlash;
  vec3 c = filmic(hdr);
  // Split tone: cool, slightly teal shadows; warm highlights.
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, c * vec3(0.92, 1.0, 1.1), (1.0 - smoothstep(0.0, 0.35, lum)) * 0.35);
  c = mix(c, c * vec3(1.06, 1.0, 0.92), smoothstep(0.45, 1.0, lum) * 0.3);
  vec2 q = vUv - 0.5;
  q.x *= uResolution.x / uResolution.y;
  float vig = 1.0 - uVignette * smoothstep(0.35, 1.05, length(q));
  c *= vig;
  c = toSrgb(c);
  // Dither to hide banding in the dark fog gradients.
  c += (ign(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) / 255.0;
  fragColor = vec4(c, 1.0);
}
`;

export interface PostFXOptions {
  bloom: boolean;
  msaa: number;
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
  readonly params = { bloomStrength: 0.55, threshold: 0.75, exposure: 1.15, vignette: 0.42, flash: 0, flashColor: new THREE.Color(1, 1, 1) };

  constructor(renderer: THREE.WebGLRenderer, options: PostFXOptions) {
    this.renderer = renderer;
    this.options = { ...options };
    this.sceneRT = this.makeSceneRT(1, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string> = {}) =>
      new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: fullscreenVert, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.bright = mk(brightFrag, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 } });
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
      options.bloom ? { USE_BLOOM: '' } : {},
    );
    this.quad = new THREE.Mesh(geo, this.composite);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  private makeSceneRT(w: number, h: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      samples: this.options?.msaa ?? 0,
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
      this.composite.defines = options.bloom ? { USE_BLOOM: '' } : {};
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
          new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter }),
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
    u.uExposure.value = this.params.exposure;
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
      s = new THREE.WebGLRenderTarget(base.width, base.height, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
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
