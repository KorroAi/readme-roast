import * as THREE from 'three';
import type { PropSpec } from '../../world/gen/types';
import type { LightingUniforms } from '../lighting';
import { createEntityMaterial, shareSonar } from '../entityMaterial';
import { FOG_CULL } from '../lighting';
import type { PropModel } from './models';

/**
 * Round 3 (VIS): ambient props merged per 32 m cell.
 *
 * The strata dress their caves with hundreds of small things (fungi, bones, roots, icicles, shells,
 * urns...). Drawn one mesh each they would cost a draw call apiece; here every prop with nothing to
 * do (no interaction, nothing to mine, no flame, no moving part) is baked into its cell's merged
 * mesh: one draw call for the cell's bodies and one for its glowing parts, whatever the count. A
 * cell is rebuilt lazily (nearest first, two a frame) when one of its props comes or goes, drawn
 * within the small-prop distance (45 m, or the haze), and its ground props sit on the drawn rock.
 */

const CELL = 32;
const FAR = 45;
/** Beyond this (m, from the cell's nearest point) a cell draws its far level: the big things and the lights. */
const NEAR = 18;

/** Decor that stays in the far level whatever its size (it lights the cave: the pockets' glow). */
const ALWAYS_FAR = /^(glowWorms|glowCaps|amberGlow|crystalDrops|iceGlow|sulphurCrust|mineLamp|runeLamp|emberCrack|voidShards|heartVein|lairRune)/;

interface DecorItem {
  spec: PropSpec;
  model: PropModel;
}

interface DecorCell {
  key: string;
  items: Map<string, DecorItem>;
  body: THREE.Mesh | null;
  glow: THREE.Mesh | null;
  /** The far level (null when nothing in the cell is big enough to see from there). */
  bodyFar: THREE.Mesh | null;
  glowFar: THREE.Mesh | null;
  dirty: boolean;
  center: THREE.Vector3;
  radius: number;
}

/** Can a prop be baked into the decor (it never moves, glows on its own, or answers a tap)? */
export function isDecor(spec: PropSpec, model: PropModel): boolean {
  if (spec.interact || spec.minable || spec.feature || spec.secret || spec.loot) return false;
  if (model.sway || model.parts.length || model.flames.length) return false;
  if (model.anim !== 'none' && model.anim !== 'crystal') return false;
  if (spec.emitters.length) return false;
  return true;
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class DecorBatch {
  readonly group = new THREE.Group();
  private readonly cells = new Map<string, DecorCell>();
  private readonly cellOf = new Map<string, DecorCell>();
  private readonly solid: THREE.ShaderMaterial;
  private readonly glowMat: THREE.ShaderMaterial;
  /** Where the drawn ground is (PropRenderer.surfaceTop). */
  surfaceTop: ((x: number, y: number, z: number) => number | null) | null = null;
  /** Round 3: is the terrain chunk at a point drawn (cave culling)? A cell none of whose chunks is drawn is hidden. */
  chunkDrawn: ((x: number, y: number, z: number) => boolean) | null = null;
  /** Props baked (tests and the report). */
  get count(): number {
    return this.cellOf.size;
  }
  /** Cells drawn at the last update. */
  drawnCells = 0;

  constructor(lighting: LightingUniforms, solid: THREE.ShaderMaterial) {
    this.solid = solid;
    this.glowMat = createEntityMaterial(lighting, { emissiveScale: 1.9, sonarGlow: true });
    this.group.name = 'decor';
    this.group.matrixAutoUpdate = false;
  }

  has(id: string): boolean {
    return this.cellOf.has(id);
  }

  /** Round 3: the glowing decor flares with the sonar's shell (the terrain's uniforms). */
  setSonar(sonar: THREE.IUniform<THREE.Vector4>, fx: THREE.IUniform<THREE.Vector4>): void {
    shareSonar(this.glowMat, sonar, fx);
  }

  add(spec: PropSpec, model: PropModel): void {
    this.remove(spec.id);
    const key = `${Math.floor(spec.x / CELL)},${Math.floor(spec.y / CELL)},${Math.floor(spec.z / CELL)}`;
    let cell = this.cells.get(key);
    if (!cell) {
      const [cx, cy, cz] = key.split(',').map(Number);
      cell = { key, items: new Map(), body: null, glow: null, bodyFar: null, glowFar: null, dirty: true, center: new THREE.Vector3((cx + 0.5) * CELL, (cy + 0.5) * CELL, (cz + 0.5) * CELL), radius: CELL * 0.87 + 2 };
      this.cells.set(key, cell);
    }
    cell.items.set(spec.id, { spec, model });
    cell.dirty = true;
    this.cellOf.set(spec.id, cell);
  }

  /** Remove a baked prop; returns its model (the caller releases its geometry) or null. */
  remove(id: string): PropModel | null {
    const cell = this.cellOf.get(id);
    if (!cell) return null;
    const it = cell.items.get(id);
    cell.items.delete(id);
    cell.dirty = true;
    this.cellOf.delete(id);
    return it?.model ?? null;
  }

  update(cameraPos: THREE.Vector3, viewDistance: number): void {
    const far = Math.min(viewDistance, FOG_CULL.value, FAR);
    let rebuilt = 0;
    let drawn = 0;
    // Nearest dirty cells first.
    const dirty: DecorCell[] = [];
    for (const c of this.cells.values()) {
      const d = cameraPos.distanceTo(c.center) - c.radius;
      const vis = d < far && this.cellDrawn(c);
      this.show(c, vis, d < NEAR);
      if (vis && (c.body || c.glow)) drawn++;
      if (c.dirty && d < far + CELL) dirty.push(c);
    }
    if (dirty.length > 1) dirty.sort((a, b) => cameraPos.distanceToSquared(a.center) - cameraPos.distanceToSquared(b.center));
    for (const c of dirty) {
      if (rebuilt >= 2) break;
      this.build(c);
      rebuilt++;
      const d = cameraPos.distanceTo(c.center) - c.radius;
      const vis = d < far && this.cellDrawn(c);
      this.show(c, vis, d < NEAR);
    }
    this.drawnCells = drawn;
  }

  /** Any of the cell's eight 16 m chunks drawn (true without cave culling). */
  private cellDrawn(c: DecorCell): boolean {
    const f = this.chunkDrawn;
    if (!f) return true;
    const h = CELL / 4;
    for (let k = 0; k < 8; k++) if (f(c.center.x + (k & 1 ? h : -h), c.center.y + (k & 2 ? h : -h), c.center.z + (k & 4 ? h : -h))) return true;
    return false;
  }

  /** Near: the full cell; far: only its big things and its lights (fewer triangles, less noise). */
  private show(c: DecorCell, vis: boolean, near: boolean): void {
    if (c.body) c.body.visible = vis && near;
    if (c.glow) c.glow.visible = vis && near;
    if (c.bodyFar) c.bodyFar.visible = vis && !near;
    if (c.glowFar) c.glowFar.visible = vis && !near;
  }

  /** Triangles of the levels drawn (the report). */
  get drawnTriangles(): number {
    let n = 0;
    for (const c of this.cells.values()) for (const m of [c.body, c.glow, c.bodyFar, c.glowFar]) if (m?.visible) n += (m.geometry.index?.count ?? 0) / 3;
    return n;
  }

  private build(c: DecorCell): void {
    c.dirty = false;
    for (const m of [c.body, c.glow, c.bodyFar, c.glowFar]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    c.body = null;
    c.glow = null;
    c.bodyFar = null;
    c.glowFar = null;
    if (!c.items.size) {
      this.cells.delete(c.key);
      return;
    }
    const bodies: Array<{ g: THREE.BufferGeometry; m: THREE.Matrix4 }> = [];
    const glows: Array<{ g: THREE.BufferGeometry; m: THREE.Matrix4 }> = [];
    const farBodies: Array<{ g: THREE.BufferGeometry; m: THREE.Matrix4 }> = [];
    const farGlows: Array<{ g: THREE.BufferGeometry; m: THREE.Matrix4 }> = [];
    for (const { spec, model } of c.items.values()) {
      let y = spec.y;
      // Ground props sit on the drawn (sculpted) rock, as PropRenderer's do.
      if (this.surfaceTop && spec.anchor && spec.anchor[1] < spec.y) {
        const h = this.surfaceTop(spec.x, spec.y, spec.z);
        if (h !== null && Math.abs(h - spec.y) <= 0.4) y = h;
      }
      _q.setFromAxisAngle(_up, spec.rotY);
      const mat = new THREE.Matrix4().compose(_p.set(spec.x, y, spec.z), _q, _s.setScalar(spec.scale));
      bodies.push({ g: model.body, m: mat });
      if (model.glow) glows.push({ g: model.glow, m: mat });
      // The far level keeps what reads from 18 m on: about a metre or more across, or a light.
      const size = model.bounds.getSize(_v);
      if (Math.max(size.x, size.y, size.z) * spec.scale >= 0.9 || ALWAYS_FAR.test(spec.kind)) {
        farBodies.push({ g: model.body, m: mat });
        if (model.glow) farGlows.push({ g: model.glow, m: mat });
      }
    }
    c.body = this.merged(bodies, this.solid, 'decor-body');
    c.glow = glows.length ? this.merged(glows, this.glowMat, 'decor-glow') : null;
    c.bodyFar = farBodies.length ? this.merged(farBodies, this.solid, 'decor-body-far') : null;
    c.glowFar = farGlows.length ? this.merged(farGlows, this.glowMat, 'decor-glow-far') : null;
    for (const m of [c.body, c.glow, c.bodyFar, c.glowFar]) if (m) this.group.add(m);
  }

  private merged(parts: Array<{ g: THREE.BufferGeometry; m: THREE.Matrix4 }>, material: THREE.Material, name: string): THREE.Mesh | null {
    let verts = 0;
    let idx = 0;
    for (const p of parts) {
      verts += p.g.getAttribute('position').count;
      idx += p.g.index ? p.g.index.count : p.g.getAttribute('position').count;
    }
    if (!verts) return null;
    const pos = new Float32Array(verts * 3);
    const nrm = new Float32Array(verts * 3);
    const col = new Uint8Array(verts * 3);
    const emi = new Uint8Array(verts);
    const index = verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx);
    let vo = 0;
    let io = 0;
    for (const p of parts) {
      const P = p.g.getAttribute('position') as THREE.BufferAttribute;
      const N = p.g.getAttribute('normal') as THREE.BufferAttribute;
      const C = p.g.getAttribute('color') as THREE.BufferAttribute;
      const E = p.g.getAttribute('aEmissive') as THREE.BufferAttribute | undefined;
      _n.getNormalMatrix(p.m);
      const n = P.count;
      for (let i = 0; i < n; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(p.m);
        pos[(vo + i) * 3] = _v.x;
        pos[(vo + i) * 3 + 1] = _v.y;
        pos[(vo + i) * 3 + 2] = _v.z;
        _v.fromBufferAttribute(N, i).applyMatrix3(_n).normalize();
        nrm[(vo + i) * 3] = _v.x;
        nrm[(vo + i) * 3 + 1] = _v.y;
        nrm[(vo + i) * 3 + 2] = _v.z;
      }
      col.set((C.array as Uint8Array).subarray(0, n * 3), vo * 3);
      if (E) emi.set((E.array as Uint8Array).subarray(0, n), vo);
      if (p.g.index) {
        const src = p.g.index.array;
        for (let k = 0; k < src.length; k++) index[io + k] = src[k] + vo;
        io += src.length;
      } else {
        for (let k = 0; k < n; k++) index[io + k] = vo + k;
        io += n;
      }
      vo += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3, true));
    g.setAttribute('aEmissive', new THREE.BufferAttribute(emi, 1, true));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, material);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }

  dispose(): void {
    for (const c of this.cells.values()) for (const m of [c.body, c.glow, c.bodyFar, c.glowFar]) m?.geometry.dispose();
    this.cells.clear();
    this.cellOf.clear();
    this.glowMat.dispose();
  }
}
