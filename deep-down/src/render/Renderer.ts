import * as THREE from 'three';
import { PostFX } from './PostFX';
import { disposeDetail, paintDetail } from './detail';

export type QualityLevel = 'battery' | 'balanced' | 'high';

export interface QualityPreset {
  /** Maximum device pixel ratio used for the canvas. */
  maxDpr: number;
  /** Scale on top of the DPR cap (internal resolution). */
  renderScale: number;
  bloom: boolean;
  msaa: number;
  /** Frame cap in FPS (0 = display refresh). */
  fpsCap: number;
  viewDistance: number;
  particleBudget: number;
  /**
   * Natural material boundaries in the terrain shader (USE_BLEND: one extra material fetch on
   * faces near a same-family boundary). Off on Battery: boundaries fall back to the voxel edge.
   */
  terrainBlend: boolean;
  /**
   * Directional placed light in the terrain shader (LAMP_DIR: one extra light-volume fetch per
   * fragment, so the backs of forms in a lamp pool fall to the cool fill). Off on Battery.
   */
  lampDirection: boolean;
  /** FXAA after the grade (presets without MSAA). */
  fxaa: boolean;
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  battery: { maxDpr: 1.25, renderScale: 0.8, bloom: false, msaa: 0, fpsCap: 30, viewDistance: 64, particleBudget: 120, terrainBlend: false, lampDirection: false, fxaa: false },
  balanced: { maxDpr: 1.75, renderScale: 0.9, bloom: true, msaa: 0, fpsCap: 60, viewDistance: 88, particleBudget: 220, terrainBlend: true, lampDirection: true, fxaa: true },
  high: { maxDpr: 2.5, renderScale: 1, bloom: true, msaa: 4, fpsCap: 60, viewDistance: 110, particleBudget: 400, terrainBlend: true, lampDirection: true, fxaa: false },
};

/** WebGL2 renderer + post chain + resize handling, shared by the game and the Visual Lab. */
// Player brightness 1 = this. The scene exposure itself is per zone (ATMOSPHERES[*].exposure in
// lighting.ts, applied as post.params.zoneExposure), so tools that set their own zone exposure
// (the Visual Lab's review light) are not affected by it.
const BASE_EXPOSURE = 1.05;

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly post: PostFX;
  readonly canvas: HTMLCanvasElement;
  preset: QualityPreset;
  quality: QualityLevel;
  renderScaleOverride: number | null = null;
  /** Player's Glow setting; bloom runs only if both this and the preset allow it. */
  userBloom = true;
  private width = 1;
  private height = 1;

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
    // ?ldr=1 forces the 8-bit fallback targets (devices without EXT_color_buffer_float), to test it.
    const forceLdr = typeof location !== 'undefined' && /[?&]ldr=1(&|$)/.test(location.search);
    this.post = new PostFX(this.gl, { bloom: this.preset.bloom, msaa: this.preset.msaa, fxaa: this.preset.fxaa, forceLdr });
    // HD stone: the close-up detail layers, painted once on the GPU (render/detail.ts).
    this.detailMs = paintDetail(this.gl);
    this.resize();
  }

  /** Time the HD stone detail paint took at startup (ms, CPU side). */
  readonly detailMs: number;

  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.preset = QUALITY[level];
    this.terrainPresetDirty = true;
    this.applyPostOptions();
    this.resize();
  }

  /** Player brightness setting: scales the tone-mapping exposure. */
  setBrightness(k: number): void {
    this.post.params.exposure = BASE_EXPOSURE * k;
  }

  setUserBloom(on: boolean): void {
    this.userBloom = on;
    this.applyPostOptions();
  }

  private applyPostOptions(): void {
    this.post.setOptions({ bloom: this.preset.bloom && this.userBloom, msaa: this.preset.msaa, fxaa: this.preset.fxaa });
  }

  /**
   * The terrain material's USE_BLEND and LAMP_DIR defines follow the preset. Terrain materials are
   * found in the scene on the first frame after a quality change (one traversal; they are the
   * ShaderMaterials with the material-layer uniforms), so no other module has to forward the
   * preset. A define a material was built without (the viewer's ?blend=0) is never switched on.
   */
  private terrainPresetDirty = true;
  private readonly presetOff: Record<string, WeakSet<THREE.Material>> = { USE_BLEND: new WeakSet(), LAMP_DIR: new WeakSet() };

  private applyTerrainPreset(scene: THREE.Scene): void {
    let found = false;
    const seen = new Set<THREE.Material>();
    const want: Record<string, boolean> = { USE_BLEND: this.preset.terrainBlend, LAMP_DIR: this.preset.lampDirection };
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!(m instanceof THREE.ShaderMaterial) || seen.has(m) || !('uMatGlow' in m.uniforms)) return;
      seen.add(m);
      found = true;
      const defines = m.defines as Record<string, string>;
      for (const name of Object.keys(want)) {
        const on = name in defines;
        const off = this.presetOff[name];
        if (!want[name] && on) {
          delete defines[name];
          off.add(m);
          m.needsUpdate = true;
        } else if (want[name] && !on && off.has(m)) {
          defines[name] = '';
          off.delete(m);
          m.needsUpdate = true;
        }
      }
    });
    if (found) this.terrainPresetDirty = false;
  }

  get pixelRatio(): number {
    const dpr = Math.min(window.devicePixelRatio || 1, this.preset.maxDpr);
    return dpr * (this.renderScaleOverride ?? this.preset.renderScale);
  }

  resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    const pr = this.pixelRatio;
    this.gl.setPixelRatio(pr);
    this.gl.setSize(w, h, false);
    this.post.setSize(w * pr, h * pr);
  }

  get aspect(): number {
    return this.width / Math.max(1, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, time: number): void {
    if (this.terrainPresetDirty) this.applyTerrainPreset(scene);
    this.gl.info.reset();
    this.post.render(scene, camera, time);
  }

  dispose(): void {
    disposeDetail(this.gl);
    this.post.dispose();
    this.gl.dispose();
  }
}
