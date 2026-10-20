import * as THREE from 'three';
import { createEntityMaterial } from '../entityMaterial';
import type { LightingUniforms } from '../lighting';
import { buildPropModel, type PropModel } from '../props/models';
import { modelOptions } from '../props/PropRenderer';
import type { PropSpec } from '../props/types';

/**
 * Static cavern dressing, batched (SPEC §11.4; P1 ≤ 110 draw calls, W2 MUST 0): every non-tappable prop of a slab
 * (and the shaft's lamps of that slab) is merged into one mesh (bodies and glows together, their emissive scales
 * baked into the vertices), so a slab's 30-80 props cost 1 draw instead of 1-3 each. Tappables stay in PropRenderer (they animate, flash and leave). A batch is rebuilt
 * when its slab arrives or its lamps change (a few thousand vertices: well under a millisecond); the prop models
 * are built once per kind and variant and cached.
 */

/** The glow material's emissive scale; each prop's own glow scale is baked into its vertices against it. */
const GLOW_SCALE = 3.2;
/** The entity material's default emissive scale (what a body mesh would use): bodies bake it the same way, so a
 *  batch's bodies and glows share one mesh and one draw (emission is albedo × aEmissive × scale, nothing else). */
const BODY_SCALE = 2.2;

interface Batch {
  body: THREE.Mesh | null;
  glow: THREE.Mesh | null;
  count: number;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _t = new THREE.Vector3();
const _v = new THREE.Vector3();
const _n = new THREE.Matrix3();
const UP = new THREE.Vector3(0, 1, 0);

export class CavernProps {
  readonly group = new THREE.Group();
  private readonly body: THREE.ShaderMaterial;
  private readonly glowMat: THREE.ShaderMaterial;
  private readonly list = new Map<string, Batch>();
  private readonly models = new Map<string, PropModel>();

  constructor(lighting: LightingUniforms) {
    this.group.name = 'cavernProps';
    this.group.matrixAutoUpdate = false;
    this.body = createEntityMaterial(lighting);
    this.glowMat = createEntityMaterial(lighting, { emissiveScale: GLOW_SCALE });
  }

  /** Can this prop be batched (static dressing: not tappable)? */
  static batchable(spec: PropSpec): boolean {
    return !spec.tap;
  }

  /** Set batch `key`'s props (replaces what it had; an empty list removes it). */
  setBatch(key: string, specs: readonly PropSpec[]): void {
    this.drop(key);
    if (!specs.length) return;
    const bodies: Array<[THREE.BufferGeometry, THREE.Matrix4, number]> = [];
    const glows: Array<[THREE.BufferGeometry, THREE.Matrix4, number]> = [];
    for (const spec of specs) {
      const model = this.model(spec);
      _q.setFromAxisAngle(UP, spec.rotY);
      _s.setScalar(spec.scale);
      _t.set(spec.x, spec.y, spec.z);
      const m = new THREE.Matrix4().compose(_t, _q, _s);
      bodies.push([model.body, m, BODY_SCALE / GLOW_SCALE]);
      if (model.glow) glows.push([model.glow, m, model.glowScale / GLOW_SCALE]);
      for (const p of model.parts) glows.push([p.geometry, new THREE.Matrix4().multiplyMatrices(m, _m.makeTranslation(p.origin.x, p.origin.y, p.origin.z)), model.glowScale / GLOW_SCALE]);
    }
    const b: Batch = { body: null, glow: null, count: specs.length };
    if (bodies.length + glows.length) b.glow = this.mesh(merge([...bodies, ...glows]), this.glowMat, key);
    this.list.set(key, b);
  }

  /** Set slab k's batched dressing. */
  setSlab(k: number, specs: readonly PropSpec[]): void {
    this.setBatch(`s${k}`, specs.filter(CavernProps.batchable));
  }

  dropSlab(k: number): void {
    this.drop(`s${k}`);
  }

  drop(key: string): void {
    const b = this.list.get(key);
    if (!b) return;
    for (const m of [b.body, b.glow]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.list.delete(key);
  }

  /** Draw calls the batches can cost (body and glow per batch). */
  get batches(): number {
    let n = 0;
    for (const b of this.list.values()) n += (b.body ? 1 : 0) + (b.glow ? 1 : 0);
    return n;
  }

  /** Props batched in all. */
  get props(): number {
    let n = 0;
    for (const b of this.list.values()) n += b.count;
    return n;
  }

  private model(spec: PropSpec): PropModel {
    const o = modelOptions(spec);
    const key = `${spec.kind}:${o.variant}:${o.hangHeight ?? 0}`;
    let m = this.models.get(key);
    if (!m) {
      m = buildPropModel(spec.kind, o);
      this.models.set(key, m);
    }
    return m;
  }

  private mesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.group.add(mesh);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  dispose(): void {
    for (const k of [...this.list.keys()]) this.drop(k);
    this.body.dispose();
    this.glowMat.dispose();
  }
}

/** Merge VoxBuilder geometries (position, normal, color u8 x3, aEmissive u8) under their matrices; `emi` scales aEmissive. */
function merge(parts: ReadonlyArray<[THREE.BufferGeometry, THREE.Matrix4, number]>): THREE.BufferGeometry {
  let verts = 0;
  let idx = 0;
  for (const [g] of parts) {
    verts += g.getAttribute('position').count;
    idx += g.index ? g.index.count : g.getAttribute('position').count;
  }
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const col = new Uint8Array(verts * 3);
  const emi = new Uint8Array(verts);
  const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
  let vo = 0;
  let io = 0;
  for (const [g, m, k] of parts) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = g.getAttribute('color') as THREE.BufferAttribute;
    const e = g.getAttribute('aEmissive') as THREE.BufferAttribute | undefined;
    _n.getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(m);
      pos[(vo + i) * 3] = _v.x;
      pos[(vo + i) * 3 + 1] = _v.y;
      pos[(vo + i) * 3 + 2] = _v.z;
      _v.fromBufferAttribute(n, i).applyMatrix3(_n).normalize();
      nor[(vo + i) * 3] = _v.x;
      nor[(vo + i) * 3 + 1] = _v.y;
      nor[(vo + i) * 3 + 2] = _v.z;
    }
    col.set((c.array as Uint8Array).subarray(0, p.count * 3), vo * 3);
    if (e) {
      const ea = e.array as Uint8Array;
      for (let i = 0; i < p.count; i++) emi[vo + i] = Math.min(255, Math.round(ea[i] * k));
    }
    if (g.index) {
      const ia = g.index.array;
      for (let i = 0; i < ia.length; i++) index[io + i] = ia[i] + vo;
      io += ia.length;
    } else {
      for (let i = 0; i < p.count; i++) index[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
  geo.setAttribute('aEmissive', new THREE.BufferAttribute(emi, 1, true));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
