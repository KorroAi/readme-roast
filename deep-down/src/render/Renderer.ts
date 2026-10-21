import * as THREE from 'three';
import { LightRig } from './light/rig';
import { LIGHT_UNIFORMS } from './light/uniforms';
import { featuresAt, type LightFeatures } from './light/presets';
import { PostFX, type OverlayPass, type PassInfo } from './PostFX';
import { FeatureLadder, FineScaleController } from './QualityGovernor';

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
  high: { maxDpr: 3, renderScale: 0.8, scaleMin: 0.7, scaleMax: 0.85, bloom: true, bloomLevels: 5, msaa: 2, fxaa: true, fpsCap: 60, viewDistance: 110, particleBudget: 400, terrainBlend: true, lampDirection: true },
};

// Player brightness 1 = this. The scene exposure itself is per biome (post.params.zoneExposure).
const BASE_EXPOSURE = 1.05;

/**
 * WebGL2 renderer + the lighting stack + the filmic post chain + resize and dynamic resolution (owner 1E).
 *
 * Per frame the scene facade (DepthScene, 1C) calls `light.update(camera, lantern, lamps, time)` and then
 * `render(scene, camera, time, overlay)`: the rig's passes (dirty shadow cubes, one probe face), the world, the half-res
 * lighting passes and the composite (GTAO, volumetric fog), the overlay (the viewmodel: its own camera, depth cleared),
 * bloom, AgX and the LUT grade, FXAA, the upsample. The quality preset and the governor's feature ladder decide what
 * runs (light/presets.ts).
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly post: PostFX;
  /** The light rig: the lantern, the practicals, shadows, probes, fog (light/rig.ts). */
  readonly light = new LightRig();
  /** The governor's feature ladder inside the preset (steps down before frames drop). */
  readonly ladder = new FeatureLadder();
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
    // ?light=off renders the "before" of the lighting stack (no shadows, AO, volumetrics, probes); ?flame=0 freezes the
    // flame (captures, the stillness test); ?ladder=N pins the governor's step.
    this.light.stackOff = /[?&]light=off(&|$)/.test(q);
    this.light.flameFrozen = /[?&]flame=0(&|$)/.test(q);
    const lad = /[?&]ladder=(\d)/.exec(q);
    if (lad) this.ladder.pin(Number(lad[1]));
    this.applyLightFeatures();
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
    /** The lighting stack: features in force, the ladder step, the rig's counters, GPU bytes of shadows and probes. */
    light: () => ({
      features: { ...this.light.features },
      step: this.ladder.step,
      stackOff: this.light.stackOff,
      stats: { ...this.light.stats },
      shadowBytes: this.light.shadowA.memoryBytes() + this.light.shadowB.memoryBytes(),
      probeBytes: this.light.probe.memoryBytes(),
      frame: { calls: this.gl.info.render.calls, tris: this.gl.info.render.triangles },
    }),
    /** Toggle the stack (before/after captures) and the flame freeze; a debug view (light/chunk.ts LIGHT_DEBUG). */
    setLight: (patch: { off?: boolean; frozen?: boolean; view?: number; post?: number; step?: number; tone?: number; look?: [number, number]; soft?: number; gain?: number; ao?: number; veil?: number; refresh?: boolean }): void => {
      if (patch.refresh) this.light.invalidateShadows();
      if (patch.soft !== undefined) this.light.lanternSoft = patch.soft;
      if (patch.gain !== undefined) this.light.lanternGain = patch.gain;
      if (patch.ao !== undefined) this.post.light.ao.strength = patch.ao;
      if (patch.veil !== undefined) this.post.light.vol.lantern = patch.veil;
      if (patch.tone !== undefined) this.post.params.tonemap = patch.tone;
      if (patch.look) this.post.toneLook.set(patch.look[0], patch.look[1]);
      if (patch.off !== undefined) this.light.stackOff = patch.off;
      if (patch.frozen !== undefined) this.light.flameFrozen = patch.frozen;
      if (patch.view !== undefined) LIGHT_UNIFORMS.uL_Frame.value.z = patch.view;
      if (patch.post !== undefined) this.post.lightOptions.debug = patch.post;
      if (patch.step !== undefined) this.ladder.pin(patch.step);
      this.applyLightFeatures();
    },
  };

  /** The rig's features from the preset and the ladder step; the post chain's lighting passes follow them. */
  private applyLightFeatures(): void {
    const f: LightFeatures = featuresAt(this.quality, this.ladder.step);
    if (!this.post.hdr) {
      // The 8-bit fallback: no float targets for shadows, the half-res passes or probes.
      f.shadows = f.ao = f.volumetric = f.probes = f.secondShadow = false;
    }
    this.light.features = f;
    const lo = this.post.lightOptions;
    lo.ao = this.light.aoOn;
    lo.vol = this.light.volumetricOn;
    lo.volSteps = f.volSteps;
    lo.volShadow = f.volShadow && f.shadows;
    lo.scale = f.aoScale;
  }

  private postOptions() {
    return { bloom: this.preset.bloom && this.userBloom, bloomLevels: this.preset.bloomLevels, msaa: this.preset.msaa, fxaa: this.preset.fxaa, forceLdr: this.forceLdr };
  }

  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.preset = QUALITY[level];
    this.scale = this.preset.renderScale;
    this.fine.reset();
    this.ladder.reset();
    this.post.setOptions(this.postOptions());
    this.applyLightFeatures();
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

  /**
   * Render one frame: the rig's passes, the world, the lighting composite, then `overlay` (the viewmodel: its own scene
   * and camera, drawn after the composite with the depth cleared), bloom, the grade, FXAA and the upsample.
   */
  render(scene: THREE.Scene, camera: THREE.Camera, time: number, overlay?: OverlayPass | null): void {
    // The fine controller: frame intervals step the scene scale inside the preset's range (no reallocation); at the
    // bottom of the range the feature ladder sheds the costliest lighting features, and gives them back when it is fast.
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    const dt = this.lastFrameAt ? now - this.lastFrameAt : 0;
    this.lastFrameAt = now;
    if (dt > 0) {
      if (this.fixedScale === null) {
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
      // A fixed scale (the player's Render scale) has no resolution left to give: the ladder may act at once.
      const atFloor = this.fixedScale !== null || this.scale <= this.preset.scaleMin + 1e-6;
      if (this.ladder.sample(dt, now, atFloor) !== 0) this.applyLightFeatures();
    }
    // Keep the passes in step with the stack toggles (the rig's flags may change between frames).
    const lo = this.post.lightOptions;
    lo.ao = this.light.aoOn;
    lo.vol = this.light.volumetricOn;
    // The clear colour is the hued fog, so any gap (a Vista opening, the window's edge) reads as haze.
    this.clear.copy(LIGHT_UNIFORMS.uL_FogColor.value);
    this.gl.setClearColor(this.clear, 1);
    this.gl.info.reset();
    this.light.renderPasses(this.gl, scene);
    this.post.render(scene, camera, time, overlay ?? null, this.light);
  }

  dispose(): void {
    this.light.dispose();
    this.post.dispose();
    this.gl.dispose();
  }
}
