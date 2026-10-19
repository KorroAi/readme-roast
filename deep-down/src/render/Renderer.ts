import * as THREE from 'three';
import { PostFX } from './PostFX';

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
}

export const QUALITY: Record<QualityLevel, QualityPreset> = {
  battery: { maxDpr: 1.25, renderScale: 0.8, bloom: false, msaa: 0, fpsCap: 30, viewDistance: 64, particleBudget: 120, terrainBlend: false },
  balanced: { maxDpr: 1.75, renderScale: 0.9, bloom: true, msaa: 0, fpsCap: 60, viewDistance: 88, particleBudget: 220, terrainBlend: true },
  high: { maxDpr: 2.5, renderScale: 1, bloom: true, msaa: 4, fpsCap: 60, viewDistance: 110, particleBudget: 400, terrainBlend: true },
};

/** WebGL2 renderer + post chain + resize handling, shared by the game and the Visual Lab. */
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
    this.post = new PostFX(this.gl, { bloom: this.preset.bloom, msaa: this.preset.msaa, forceLdr });
    this.resize();
  }

  setQuality(level: QualityLevel): void {
    this.quality = level;
    this.preset = QUALITY[level];
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
    this.post.setOptions({ bloom: this.preset.bloom && this.userBloom, msaa: this.preset.msaa });
  }

  /**
   * Apply the preset's terrain shader options to a terrain material (see createTerrainMaterial):
   * Battery drops the boundary blending. Returns true if the material had to recompile.
   */
  configureTerrainMaterial(material: THREE.ShaderMaterial): boolean {
    const defines = (material.defines ??= {}) as Record<string, string>;
    const on = 'USE_BLEND' in defines;
    if (on === this.preset.terrainBlend) return false;
    if (this.preset.terrainBlend) defines.USE_BLEND = '';
    else delete defines.USE_BLEND;
    material.needsUpdate = true;
    return true;
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
    this.gl.info.reset();
    this.post.render(scene, camera, time);
  }

  dispose(): void {
    this.post.dispose();
    this.gl.dispose();
  }
}
