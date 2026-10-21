// Cube shadows for point lights (W1-LEAD §4.2): the lantern's (256² on Balanced, 512² on High, off on Battery) and one
// shadowed practical on High. Each face stores dist / far from the render origin in an R16F cube; the light chunk
// filters it (normal offset, slope bias, a blocker search for contact hardening, rotated Vogel PCF).
//
// Cost control: only geometry within `far` (14 m) renders (the face cameras' far plane culls the rest); the cube
// refreshes when its light moved by > 1 cm or the world changed (invalidate), at most every N frames while moving, and
// is reused otherwise: at rest it costs nothing. Movers (`userData.noShadow`), transparent and additive materials,
// points, lines and sprites never enter it.

import * as THREE from 'three';

/** Move threshold (m): below it the cube is reused. */
export const SHADOW_MOVE_EPS = 0.01;

/** The distance pass: three's distance vertex shader (instancing, batching, skinning, morphs) and dist / far. */
function distanceMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'dd-light-distance',
    vertexShader: THREE.ShaderLib.distance.vertexShader,
    fragmentShader: /* glsl */ `
      uniform vec3 uRef;
      uniform float uFar;
      varying vec3 vWorldPosition;
      void main() {
        gl_FragColor = vec4(clamp(length(vWorldPosition - uRef) / uFar, 0.0, 1.0), 0.0, 0.0, 1.0);
      }`,
    uniforms: { uRef: { value: new THREE.Vector3() }, uFar: { value: 14 } },
    side: THREE.DoubleSide,
  });
}

/** Is this object a shadow caster? (Opaque meshes not marked `noShadow`.) */
export function castsShadow(o: THREE.Object3D): boolean {
  if (o.userData?.noShadow) return false;
  const m = o as THREE.Mesh;
  if (!m.isMesh) return false;
  const mats = Array.isArray(m.material) ? m.material : [m.material];
  for (const mat of mats) {
    if (!mat) return false;
    if (mat.transparent || mat.blending !== THREE.NormalBlending || mat.depthWrite === false) return false;
  }
  return true;
}

/**
 * Decide whether a cube must refresh: the world changed; or the light is away from the cube's origin and either the
 * cadence while moving is due, or it has just stopped (so the picture at rest is always exact). Pure (tests).
 */
export function shadowDue(moved: number, dirty: boolean, framesSince: number, everyFrames: number, stopped = false): boolean {
  if (dirty) return true;
  if (moved <= SHADOW_MOVE_EPS) return false;
  return stopped || framesSince >= Math.max(1, everyFrames);
}

const SPHERE = new THREE.Sphere();

/** True when a mesh's world bounding sphere lies wholly farther than `far` from `p` (never for unbounded objects). */
export function beyond(m: THREE.Mesh, p: THREE.Vector3, far: number): boolean {
  const im = m as unknown as THREE.InstancedMesh;
  let bs: THREE.Sphere | null = null;
  if (im.isInstancedMesh) {
    if (!im.boundingSphere) im.computeBoundingSphere();
    bs = im.boundingSphere;
  } else {
    const g = m.geometry;
    if (!g) return false;
    if (!g.boundingSphere) g.computeBoundingSphere();
    bs = g.boundingSphere;
  }
  if (!bs || !Number.isFinite(bs.radius)) return false;
  SPHERE.copy(bs).applyMatrix4(m.matrixWorld);
  const d = SPHERE.center.distanceTo(p) - SPHERE.radius;
  // A small prop (a pebble, a nugget, a lamp head) far from the light casts a shadow a few centimetres wide: one draw
  // call per face saved for nothing seen.
  if (SPHERE.radius < SMALL_CASTER_M && d > SMALL_CASTER_FAR_M) return true;
  return d > far;
}

/** Small casters (bounding radius, m) beyond this distance from the light (m) are left out of its cube. */
export const SMALL_CASTER_M = 0.35;
export const SMALL_CASTER_FAR_M = 5;

export class CubeShadow {
  enabled = false;
  res = 0;
  far = 14;
  /** Where the cube was last rendered from (the shader tests distances from here). */
  readonly origin = new THREE.Vector3();
  /** True once the cube holds a render for the current configuration. */
  valid = false;
  private rt: THREE.WebGLCubeRenderTarget | null = null;
  private readonly cams: THREE.PerspectiveCamera[] = [];
  private readonly mat = distanceMaterial();
  private readonly want = new THREE.Vector3();
  private readonly lastWant = new THREE.Vector3(1e9, 0, 0);
  private stopped = false;
  private dirty = true;
  private wanted = false;
  private lastFrame = -1e9;
  private frame = 0;
  private everyFrames = 1;
  private readonly hidden: THREE.Object3D[] = [];
  private readonly clear = new THREE.Color();
  /** Casters drawn by the last render (tests, perf). */
  casters = 0;

  constructor(readonly name: string) {
    const dirs: Array<[number, number, number, number, number, number]> = [
      [1, 0, 0, 0, -1, 0],
      [-1, 0, 0, 0, -1, 0],
      [0, 1, 0, 0, 0, 1],
      [0, -1, 0, 0, 0, -1],
      [0, 0, 1, 0, -1, 0],
      [0, 0, -1, 0, -1, 0],
    ];
    // The GL cube-map face convention (faces stored with t pointing down), so a world direction samples the cube
    // directly with texture(cube, dir): checked by the lab's raw-lookup view (light/chunk.ts debug 6).
    for (const [x, y, z, ux, uy, uz] of dirs) {
      const c = new THREE.PerspectiveCamera(90, 1, 0.05, 14);
      c.up.set(ux, uy, uz);
      c.lookAt(x, y, z);
      c.updateMatrix();
      this.cams.push(c);
    }
  }

  get texture(): THREE.CubeTexture | null {
    return this.rt?.texture ?? null;
  }

  /** Set the configuration (a change reallocates and invalidates). */
  configure(enabled: boolean, res: number, far: number): void {
    if (!enabled || res <= 0) {
      this.enabled = false;
      return;
    }
    if (res !== this.res || far !== this.far) {
      this.rt?.dispose();
      this.rt = null;
      this.res = res;
      this.far = far;
      this.valid = false;
      this.dirty = true;
    }
    this.enabled = true;
  }

  /** The light is at `pos` this frame (frame index `frame`); refresh at most every `everyFrames` frames while moving. */
  request(pos: THREE.Vector3Like, frame: number, everyFrames: number): void {
    this.lastWant.copy(this.want);
    this.want.set(pos.x, pos.y, pos.z);
    this.stopped = this.want.distanceTo(this.lastWant) < SHADOW_MOVE_EPS * 0.25;
    this.wanted = true;
    this.frame = frame;
    this.everyFrames = everyFrames;
  }

  invalidate(): void {
    this.dirty = true;
  }

  /** Render the cube if it is due. Returns true when it rendered. */
  render(gl: THREE.WebGLRenderer, scene: THREE.Scene): boolean {
    if (!this.enabled || !this.wanted) return false;
    this.wanted = false;
    const moved = this.valid ? this.want.distanceTo(this.origin) : Infinity;
    if (this.valid && !shadowDue(moved, this.dirty, this.frame - this.lastFrame, this.everyFrames, this.stopped)) return false;
    if (!this.rt) {
      const ext = gl.extensions;
      const float = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
      if (!float) {
        this.enabled = false;
        return false;
      }
      this.rt = new THREE.WebGLCubeRenderTarget(this.res, {
        type: THREE.HalfFloatType,
        format: THREE.RedFormat,
        generateMipmaps: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: true,
      });
      this.rt.texture.name = `dd-shadow-${this.name}`;
    }
    this.origin.copy(this.want);
    this.mat.uniforms.uRef.value.copy(this.origin);
    this.mat.uniforms.uFar.value = this.far;
    // Hide the non-casters for the pass, and the casters wholly beyond the light's range (only geometry within `far`
    // renders: W1-LEAD §4.2; objects that skip frustum culling would otherwise draw in all six faces).
    this.hidden.length = 0;
    this.casters = 0;
    scene.traverseVisible((o) => {
      if (o === scene) return;
      if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite) {
        if (!castsShadow(o) || beyond(o as THREE.Mesh, this.origin, this.far)) this.hidden.push(o);
        else this.casters++;
      }
    });
    for (const o of this.hidden) o.visible = false;
    const prevTarget = gl.getRenderTarget();
    const prevFace = gl.getActiveCubeFace();
    const prevMip = gl.getActiveMipmapLevel();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevClearAlpha = gl.getClearAlpha();
    gl.getClearColor(this.clear);
    const prevAutoClear = gl.autoClear;
    scene.overrideMaterial = this.mat;
    scene.background = null;
    gl.setClearColor(0xffffff, 1);
    gl.autoClear = false;
    for (let i = 0; i < 6; i++) {
      const c = this.cams[i];
      c.far = this.far;
      c.updateProjectionMatrix();
      c.position.copy(this.origin);
      c.updateMatrixWorld(true);
      gl.setRenderTarget(this.rt, i);
      gl.clear(true, true, false);
      gl.render(scene, c);
    }
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    gl.setClearColor(this.clear, prevClearAlpha);
    gl.autoClear = prevAutoClear;
    gl.setRenderTarget(prevTarget, prevFace, prevMip);
    for (const o of this.hidden) o.visible = true;
    this.hidden.length = 0;
    this.valid = true;
    this.dirty = false;
    this.lastFrame = this.frame;
    return true;
  }

  /** Bytes on the GPU (R16F colour + 24-bit depth per face). */
  memoryBytes(): number {
    return this.rt ? this.res * this.res * 6 * (2 + 4) : 0;
  }

  dispose(): void {
    this.rt?.dispose();
    this.rt = null;
    this.mat.dispose();
  }
}
