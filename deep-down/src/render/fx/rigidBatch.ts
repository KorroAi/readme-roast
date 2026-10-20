import * as THREE from 'three';

/**
 * One draw for an articulated model (P1 ≤ 110 draw calls, W2 MUST 0): the foreman's 17 rigid parts and the crew rigs
 * share one material, so their geometries are merged into one mesh whose vertices are re-posed on the CPU each frame
 * from the parts' matrices (rigid skinning: a few thousand vertices, ~0.1 ms). The original meshes stay in the
 * hierarchy for their transforms and visibility, on a layer the camera does not render.
 *
 * Supported vertex layout: position, normal (Float32 x3), color (Uint8 x3 normalized), aEmissive (Uint8 normalized).
 */
export const HIDDEN_LAYER = 31;

interface Part {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  start: number;
  count: number;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();

export class RigidBatch {
  readonly mesh: THREE.Mesh;
  private parts: Part[] = [];
  private pos!: THREE.BufferAttribute;
  private nor!: THREE.BufferAttribute;
  private readonly geo = new THREE.BufferGeometry();

  constructor(
    private readonly root: THREE.Object3D,
    material: THREE.Material,
    private readonly filter: (m: THREE.Mesh) => boolean = (m) => m.material === material,
  ) {
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.name = `${root.name || 'rig'}:batch`;
    this.mesh.frustumCulled = false;
    this.rebuild();
  }

  /** Collect the parts and allocate the merged buffers (when a part's geometry changes, e.g. a new tool). */
  rebuild(): void {
    const meshes: THREE.Mesh[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m !== this.mesh && m.geometry && this.filter(m)) meshes.push(m);
    });
    let verts = 0;
    let idx = 0;
    for (const m of meshes) {
      const p = m.geometry.getAttribute('position');
      if (!p) continue;
      verts += p.count;
      idx += m.geometry.index ? m.geometry.index.count : p.count;
    }
    const pos = new Float32Array(verts * 3);
    const nor = new Float32Array(verts * 3);
    const col = new Uint8Array(verts * 3);
    const emi = new Uint8Array(verts);
    const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    this.parts = [];
    let vo = 0;
    let io = 0;
    for (const m of meshes) {
      const g = m.geometry;
      const p = g.getAttribute('position');
      if (!p) continue;
      const c = g.getAttribute('color') as THREE.BufferAttribute | undefined;
      const e = g.getAttribute('aEmissive') as THREE.BufferAttribute | undefined;
      if (c && c.array instanceof Uint8Array) col.set(c.array.subarray(0, p.count * 3), vo * 3);
      else col.fill(200, vo * 3, (vo + p.count) * 3);
      if (e && e.array instanceof Uint8Array) emi.set(e.array.subarray(0, p.count), vo);
      if (g.index) {
        const ia = g.index.array;
        for (let i = 0; i < ia.length; i++) index[io + i] = ia[i] + vo;
        io += ia.length;
      } else {
        for (let i = 0; i < p.count; i++) index[io + i] = vo + i;
        io += p.count;
      }
      this.parts.push({ mesh: m, geometry: g, start: vo, count: p.count });
      m.layers.set(HIDDEN_LAYER);
      vo += p.count;
    }
    this.geo.dispose();
    for (const k of Object.keys(this.geo.attributes)) this.geo.deleteAttribute(k);
    this.pos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('normal', this.nor);
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    this.geo.setAttribute('aEmissive', new THREE.BufferAttribute(emi, 1, true));
    this.geo.setIndex(new THREE.BufferAttribute(index, 1));
    if (this.mesh.parent !== this.root) this.root.add(this.mesh);
    this.update();
  }

  /** A batch of every single-material mesh under `root`, drawn with the first one's material. */
  static of(root: THREE.Object3D): RigidBatch {
    let mat: THREE.Material | null = null;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!mat && m.isMesh && !Array.isArray(m.material)) mat = m.material as THREE.Material;
    });
    return new RigidBatch(root, mat ?? new THREE.MeshBasicMaterial(), (m) => m.material === mat);
  }

  /** Re-pose the merged vertices from the parts' matrices (call after the model's own update). */
  update(): void {
    for (const p of this.parts)
      if (p.mesh.geometry !== p.geometry) {
        this.rebuild();
        return;
      }
    this.root.updateMatrixWorld(true);
    _inv.copy(this.root.matrixWorld).invert();
    const pos = this.pos.array as Float32Array;
    const nor = this.nor.array as Float32Array;
    for (const p of this.parts) {
      const src = p.geometry.getAttribute('position') as THREE.BufferAttribute;
      const srcN = p.geometry.getAttribute('normal') as THREE.BufferAttribute | undefined;
      if (!visibleChain(p.mesh, this.root)) {
        // Collapse a hidden part (degenerate triangles draw nothing).
        pos.fill(0, p.start * 3, (p.start + p.count) * 3);
        continue;
      }
      _m.multiplyMatrices(_inv, p.mesh.matrixWorld);
      _n.getNormalMatrix(_m);
      for (let i = 0; i < p.count; i++) {
        _v.fromBufferAttribute(src, i).applyMatrix4(_m);
        const o = (p.start + i) * 3;
        pos[o] = _v.x;
        pos[o + 1] = _v.y;
        pos[o + 2] = _v.z;
        if (srcN) {
          _v.fromBufferAttribute(srcN, i).applyMatrix3(_n);
          const l = Math.hypot(_v.x, _v.y, _v.z) || 1;
          nor[o] = _v.x / l;
          nor[o + 1] = _v.y / l;
          nor[o + 2] = _v.z / l;
        }
      }
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
  }

  /** Vertices in the batch (debug). */
  get vertices(): number {
    return this.pos.count;
  }
}

function visibleChain(o: THREE.Object3D, root: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p && p !== root) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}
