// The per-chamber reflection probe (W1-LEAD §4.7): a cube captured once on first light, one face per frame (no long
// task), box-projected so reflections on wet stone and puddles sit on the chamber's walls. Mip levels give the glossy
// blur by roughness. Double-buffered: materials keep sampling the last finished probe while the next is captured.

import * as THREE from 'three';

export class ProbeCapture {
  /** True while faces remain to capture. */
  pending = false;
  /** True when a finished probe is bound. */
  ready = false;
  readonly centre = new THREE.Vector3();
  readonly boxMin = new THREE.Vector3(-1e4, -1e4, -1e4);
  readonly boxMax = new THREE.Vector3(1e4, 1e4, 1e4);
  boxed = false;
  maxMip = 0;
  private targets: [THREE.WebGLCubeRenderTarget | null, THREE.WebGLCubeRenderTarget | null] = [null, null];
  private front = 0;
  private face = 0;
  private res = 64;
  private readonly next = new THREE.Vector3();
  private readonly nextMin = new THREE.Vector3();
  private readonly nextMax = new THREE.Vector3();
  private nextBoxed = false;
  private readonly cams: THREE.PerspectiveCamera[] = [];
  private readonly clearColor = new THREE.Color();

  constructor() {
    const dirs: Array<[number, number, number, number, number, number]> = [
      [1, 0, 0, 0, -1, 0],
      [-1, 0, 0, 0, -1, 0],
      [0, 1, 0, 0, 0, 1],
      [0, -1, 0, 0, 0, -1],
      [0, 0, 1, 0, -1, 0],
      [0, 0, -1, 0, -1, 0],
    ];
    for (const [x, y, z, ux, uy, uz] of dirs) {
      const c = new THREE.PerspectiveCamera(90, 1, 0.1, 60);
      c.up.set(ux, uy, uz);
      c.lookAt(x, y, z);
      c.updateMatrix();
      this.cams.push(c);
    }
  }

  get texture(): THREE.CubeTexture | null {
    return this.targets[this.front]?.texture ?? null;
  }

  request(centre: THREE.Vector3Like, box: { min: THREE.Vector3Like; max: THREE.Vector3Like } | null, res: number): void {
    this.next.set(centre.x, centre.y, centre.z);
    this.nextBoxed = !!box;
    if (box) {
      this.nextMin.set(box.min.x, box.min.y, box.min.z);
      this.nextMax.set(box.max.x, box.max.y, box.max.z);
    }
    if (res !== this.res) {
      for (const t of this.targets) t?.dispose();
      this.targets = [null, null];
      this.ready = false;
      this.res = res;
    }
    this.pending = true;
    this.face = 0;
  }

  clear(): void {
    this.pending = false;
    this.ready = false;
  }

  /** Render the next face into the back buffer; on the sixth, swap. Returns true when it rendered a face. */
  renderFace(gl: THREE.WebGLRenderer, scene: THREE.Scene): boolean {
    if (!this.pending) return false;
    const back = 1 - this.front;
    let rt = this.targets[back];
    if (!rt) {
      const ext = gl.extensions;
      const float = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
      rt = new THREE.WebGLCubeRenderTarget(this.res, {
        type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
        generateMipmaps: true,
        minFilter: THREE.LinearMipmapLinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
      });
      rt.texture.name = 'dd-probe';
      this.targets[back] = rt;
    }
    const i = this.face;
    const c = this.cams[i];
    c.position.copy(this.next);
    c.updateMatrixWorld(true);
    const prevTarget = gl.getRenderTarget();
    const prevFace = gl.getActiveCubeFace();
    const prevMip = gl.getActiveMipmapLevel();
    const prevAutoClear = gl.autoClear;
    const prevClearAlpha = gl.getClearAlpha();
    gl.getClearColor(this.clearColor);
    // Mipmaps are built after the last face only.
    rt.texture.generateMipmaps = i === 5;
    gl.autoClear = false;
    gl.setRenderTarget(rt, i);
    gl.clear(true, true, false);
    gl.render(scene, c);
    gl.setRenderTarget(prevTarget, prevFace, prevMip);
    gl.autoClear = prevAutoClear;
    gl.setClearColor(this.clearColor, prevClearAlpha);
    this.face++;
    if (this.face >= 6) {
      this.pending = false;
      this.front = back;
      this.ready = true;
      this.centre.copy(this.next);
      this.boxed = this.nextBoxed;
      this.boxMin.copy(this.nextBoxed ? this.nextMin : this.boxMin.set(-1e4, -1e4, -1e4));
      this.boxMax.copy(this.nextBoxed ? this.nextMax : this.boxMax.set(1e4, 1e4, 1e4));
      this.maxMip = Math.log2(this.res);
    }
    return true;
  }

  memoryBytes(): number {
    let b = 0;
    for (const t of this.targets) if (t) b += this.res * this.res * 6 * 8 * (4 / 3);
    return b;
  }

  dispose(): void {
    for (const t of this.targets) t?.dispose();
    this.targets = [null, null];
  }
}
