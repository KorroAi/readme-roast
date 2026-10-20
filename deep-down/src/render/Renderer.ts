import * as THREE from 'three';
import { lookShared } from './look';
import { PostFX, type PassInfo } from './PostFX';
import { FineScaleController } from './QualityGovernor';
import { TERRAIN_PRESET } from './terrainMaterial';

export type QualityLevel = 'battery' | 'balanced' | 'high';

/**
 * A portrait quality preset (SPEC §11.5, CRITIQUE B16; owner 2D). Two resolutions: the canvas composites at
 * the native DPR (capped by `maxDpr`), the scene renders at a dynamic fraction of it (`scaleMin`..`scaleMax`,
 * starting at `renderScale`) through a sub-viewport, so a scale step never reallocates.
 */
export interface QualityPreset {
  /** Composite (canvas) device-pixel-ratio cap. */
  maxDpr: number;
  /** The scene's starting scale of native, and its dynamic range. */
  renderScale: number;
  scaleMin: number;
  scaleMax: number;
  bloom: boolean;
  /** Bloom levels (Balanced 4, High 5). */
  bloomLevels: number;
  msaa: number;
  /** FXAA 3.11 before the upsample (Balanced; High has MSAA). */
  fxaa: boolean;
  /** Frame cap in FPS (0 = display refresh). Battery plays at 60; the manual Saver is 30. */
  fpsCap: number;
  viewDistance: number;
  particleBudget: number;
  /** Natural material boundaries in the terrain shader (one extra fetch near a boundary). Off on Battery. */
  terrainBlend: boolean;
  /** Directional placed light in the terrain shader (one extra light-volume fetch). Off on Battery. */
  lampDirection: boolean;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  battery: { maxDpr: 2, renderScale: 0.5, scaleMin: 0.45, scaleMax: 0.55, bloom: false, bloomLevels: 0, msaa: 0, fxaa: false, fpsCap: 60, viewDistance: 64, particleBudget: 120, terrainBlend: false, lampDirection: false },
  balanced: { maxDpr: 2.25, renderScale: 0.65, scaleMin: 0.6, scaleMax: 0.7, bloom: true, bloomLevels: 4, msaa: 0, fxaa: true, fpsCap: 60, viewDistance: 88, particleBudget: 220, terrainBlend: true, lampDirection: true },
  high: { maxDpr: 3, renderScale: 0.9, scaleMin: 0.8, scaleMax: 1, bloom: true, bloomLevels: 5, msaa: 4, fxaa: false, fpsCap: 60, viewDistance: 110, particleBudget: 400, terrainBlend: true, lampDirection: true },
};

// Player brightness 1 = this. The scene exposure itself is per biome (post.params.zoneExposure).
const BASE_EXPOSURE = 1.05;

/** WebGL2 renderer + the HD post chain + resize and dynamic resolution, shared by the game and the Biome Lab. */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly post: PostFX;
  readonly canvas: HTMLCanvasElement;
  preset: QualityPreset;
  quality: QualityLevel;
  /** A fixed scene scale (the player's Render scale setting, or ?rscale= for captures); null = dynamic. */
  renderScaleOverride: number | null = null;
  /** Player's Glow setting; bloom runs only if both this and the preset allow it. */
  userBloom = true;
  /** The fine resolution controller (SPEC §11.3 QualityGovernor): steps the scene scale inside the preset. */
  readonly fine = new FineScaleController();
  private width = 1;
  private height = 1;
  private dpr = 1;
  private scale = 0.65;
  private lastFrameAt = 0;
  private readonly clear = new THREE.Color();
  private readonly pinned: number | null;
  private forceLdr = false;

  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl2');
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement, quality: QualityLevel = 'balanced') {
    this.canvas = canvas;
    this.quality = quality;
    this.preset = QUALITY[quality];
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      preserveDrawingBuffer: false,
    });
    this.gl.autoClear = false;
    this.gl.setClearColor(0x05080c, 1);
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace; // the composite pass encodes sRGB itself
    this.gl.info.autoReset = false;
    const q = typeof location !== 'undefined' ? location.search : '';
    // ?ldr=1 forces the 8-bit fallback targets (devices without EXT_color_buffer_float), to test it.
    this.forceLdr = /[?&]ldr=1(&|$)/.test(q);
    // ?rscale=0.65 pins the scene scale (captures, A/B comparisons).
    const m = /[?&]rscale=([0-9.]+)/.exec(q);
    this.pinned = m ? Math.min(1, Math.max(0.2, Number(m[1]))) : null;
    this.post = new PostFX(this.gl, this.postOptions());
    this.scale = this.preset.renderScale;
    this.applyTerrainPreset();
    this.resize();
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __DD__?: Record<string, unknown> };
      w.__DD__ = { ...(w.__DD__ ?? {}), render: this.debug };
    }
  }

  /** Debug and test surface (window.__DD__.render). */
  readonly debug = {
    passes: (): PassInfo[] => this.post.passes(),
    scale: (): number => this.post.sceneScale,
    dpr: (): number => this.dpr,
    memoryBytes: (): number => this.post.memoryBytes(),
    programs: (): number => this.gl.info.programs?.length ?? 0,
    quality: (): QualityLevel => this.quality,
  };

  private postOptions() {
    return { bloom: this.preset.bloom && this.userBloom, bloomLevels: this.preset.bloomLevels, msaa: this.preset.msaa, fxaa: this.preset.fxaa, forceLdr: this.forceLdr };
  }

  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.preset = QUALITY[level];
    this.scale = this.preset.renderScale;
    this.fine.reset();
    this.applyTerrainPreset();
    this.post.setOptions(this.postOptions());
    this.resize();
  }

  /** Player brightness setting: scales the tone-mapping exposure. */
  setBrightness(k: number): void {
    this.post.params.exposure = BASE_EXPOSURE * k;
  }

  setUserBloom(on: boolean): void {
    this.userBloom = on;
    this.post.setOptions(this.postOptions());
  }

  /** The terrain's preset switches are shared uniforms: a quality change never compiles a shader. */
  private applyTerrainPreset(): void {
    TERRAIN_PRESET.blend.value = this.preset.terrainBlend ? 1 : 0;
    TERRAIN_PRESET.lampDir.value = this.preset.lampDirection ? 1 : 0;
  }

  /** The composite (canvas) device pixel ratio. */
  get compositeDpr(): number {
    return this.dpr;
  }

  /** Scene pixels per CSS px (the composite DPR x the scene scale). */
  get pixelRatio(): number {
    return this.dpr * this.post.sceneScale;
  }

  /** The live scene height in device px (point sprites size themselves by it, not by the canvas). */
  get scenePixelHeight(): number {
    return this.post.sceneSize.height;
  }

  private get fixedScale(): number | null {
    const s = this.pinned ?? this.renderScaleOverride;
    return s === null ? null : Math.min(1, Math.max(0.2, s));
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    this.dpr = Math.min(window.devicePixelRatio || 1, this.preset.maxDpr);
    this.gl.setPixelRatio(this.dpr);
    this.gl.setSize(w, h, false);
    const fixed = this.fixedScale;
    const top = fixed ?? this.preset.scaleMax;
    this.post.setSize(w * this.dpr, h * this.dpr, top, fixed ?? this.scale);
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    // The fine controller: frame intervals step the scene scale inside the preset's range (no reallocation).
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;
    if (this.fixedScale === null && dt > 0) {
      const step = this.fine.sample(dt, now);
      if (step !== 0) {
        const p = this.preset;
        const next = Math.min(p.scaleMax, Math.max(p.scaleMin, Math.round((this.scale + step) * 100) / 100));
        if (next !== this.scale) {
          this.scale = next;
          this.post.setScale(next);
        }
      }
    }
    // The clear colour is the blended fog, so any gap (a Vista opening, the window's edge) reads as haze.
    const L = lookShared();
    this.clear.copy(L.uLookFogLow.value).lerp(L.uLookFog.value, 0.6).multiplyScalar(1.3);
    this.gl.setClearColor(this.clear, 1);
    this.gl.info.reset();
    this.post.render(scene, camera, time);
  }

  dispose(): void {
    this.post.dispose();
    this.gl.dispose();
  }
}
