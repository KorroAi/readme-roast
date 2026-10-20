// Cheap mobile post: HDR scene target (MSAA), a 5-level bloom pyramid (1 prefilter + 4 down + 4 up passes at
// half resolution and below), and one composite pass (tone map, grade, vignette, dither). 10 draws in all.

import * as THREE from 'three';
import { COMPOSITE_FRAG, DOWN_FRAG, POST_VERT, PREFILTER_FRAG, UP_FRAG } from './shaders';

export interface Grade {
  exposure: number;
  bloom: number;
  threshold: number;
  lift: THREE.Color;
  gain: THREE.Color;
  sat: number;
  vignette: number;
}

export class Post {
  readonly scene: THREE.WebGLRenderTarget;
  private levels: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private qscene = new THREE.Scene();
  private qcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private pre: THREE.ShaderMaterial;
  private down: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  grade: Grade = {
    exposure: 1,
    bloom: 0.5,
    threshold: 1.0,
    lift: new THREE.Color(0.006, 0.012, 0.016),
    gain: new THREE.Color(1.03, 1.0, 0.95),
    sat: 1.06,
    vignette: 0.22,
  };
  constructor(
    private renderer: THREE.WebGLRenderer,
    w: number,
    h: number,
    samples: number,
  ) {
    this.scene = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples, depthBuffer: true });
    let lw = w >> 1, lh = h >> 1;
    for (let i = 0; i < 5; i++) {
      this.levels.push(new THREE.WebGLRenderTarget(Math.max(1, lw), Math.max(1, lh), { type: THREE.HalfFloatType, depthBuffer: false }));
      lw >>= 1;
      lh >>= 1;
    }
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending = THREE.NoBlending) =>
      new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending });
    this.pre = mk(PREFILTER_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1 }, uKnee: { value: 0.5 } });
    this.down = mk(DOWN_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = mk(UP_FRAG, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uScatter: { value: 0.62 } }, THREE.AdditiveBlending);
    this.comp = mk(COMPOSITE_FRAG, {
      tScene: { value: null },
      tBloom: { value: null },
      uBloom: { value: 0.5 },
      uExposure: { value: 1 },
      uLift: { value: new THREE.Color() },
      uGain: { value: new THREE.Color() },
      uSat: { value: 1 },
      uVignette: { value: 0.2 },
      uRes: { value: new THREE.Vector2(w, h) },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.pre);
    this.quad.frustumCulled = false;
    this.qscene.add(this.quad);
  }
  materials(): THREE.Material[] {
    return [this.pre, this.down, this.up, this.comp];
  }
  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null, clear = true): void {
    this.quad.material = mat;
    const r = this.renderer;
    r.setRenderTarget(target);
    r.autoClear = clear;
    r.render(this.qscene, this.qcam);
    r.autoClear = true;
  }
  /** Bloom + composite to the screen. */
  finish(): void {
    const g = this.grade;
    const L = this.levels;
    this.pre.uniforms.tSrc.value = this.scene.texture;
    this.pre.uniforms.uTexel.value.set(1 / this.scene.width, 1 / this.scene.height);
    this.pre.uniforms.uThreshold.value = g.threshold;
    this.pass(this.pre, L[0]);
    for (let i = 1; i < L.length; i++) {
      this.down.uniforms.tSrc.value = L[i - 1].texture;
      this.down.uniforms.uTexel.value.set(1 / L[i - 1].width, 1 / L[i - 1].height);
      this.pass(this.down, L[i]);
    }
    for (let i = L.length - 1; i > 0; i--) {
      this.up.uniforms.tSrc.value = L[i].texture;
      this.up.uniforms.uTexel.value.set(1 / L[i].width, 1 / L[i].height);
      this.pass(this.up, L[i - 1], false);
    }
    const c = this.comp.uniforms;
    c.tScene.value = this.scene.texture;
    c.tBloom.value = L[0].texture;
    c.uBloom.value = g.bloom;
    c.uExposure.value = g.exposure;
    c.uLift.value.copy(g.lift);
    c.uGain.value.copy(g.gain);
    c.uSat.value = g.sat;
    c.uVignette.value = g.vignette;
    this.pass(this.comp, null);
  }
}
