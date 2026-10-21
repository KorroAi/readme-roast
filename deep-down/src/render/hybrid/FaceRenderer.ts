// The drift face (SPEC §3.5, §8.5; W1-LEAD §1.1): 7 blocks in a 2-3-2 bond under the octagon heading, drawn as
// instanced irregular fracture plugs in the voxel bevel language: 8 variants per rock family (a chamfered block whose
// front is a jittered relief of chisel facets), rotated and mirrored per instance so no two neighbours match; joints of
// 5 cm read as dark cracks; procedural cracks grow from the tap point; ore, rich and gem blocks carry half-sunk 3D
// nuggets and crystals; the last 3 slices leak the promise colour through hairline joints (C14).
//
// The trim: the heading's cross-section outside the bond is drawn as bevelled stone pieces of each slice (they fall with
// the slice) over a dark backplate, so the plug never shows a hole.
//
// Draws: blocks (1 instanced), trim (1 instanced), nuggets (1 instanced), crystals (1 instanced).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CELL as MODEL_CELL } from '../../idle/model/state';
import type { VoxelWorld } from '../../world/VoxelWorld';
import { CrystalBuilder, PropBuilder, rng } from '../lantern/props';
import { LAYER } from '../lantern/layers';
import { TINT, type PropMaterials } from '../lantern/propSurface';
import type { FaceView } from './source';
import { PROMISE_COLOUR, type CellRect, type Rect, type Vec3 } from './types';
import { v3 } from './source';

/** Block cell size (m) and joint: SPEC §3.5 asks 0.80 × 0.78; 0.80 × 0.82 keeps the bottom row ≥ 92 px at 360 × 740 under the Dig pitch of −8° (C7). */
export const BLOCK_W = 0.8;
export const BLOCK_H = 0.82;
export const JOINT = 0.05;
export const SLICE_DEPTH = 1.0;
/** Slices drawn: the front and up to 7 behind. */
export const DRAWN_SLICES = 8;
const VARIANTS = 8;

/** The 2-3-2 bond: per model column (snake map), the block centre (u right, v up) on the face plane (m). */
export const BOND: ReadonlyArray<readonly [number, number]> = (() => {
  const row = (r: number) => (r + 0.5) * BLOCK_H + 0.04;
  // col: 0 middle-left, 1 top-left, 2 top-right, 3 centre, 4 middle-right, 5 bottom-right, 6 bottom-left.
  return [
    [-BLOCK_W, row(1)],
    [-BLOCK_W / 2, row(2)],
    [BLOCK_W / 2, row(2)],
    [0, row(1)],
    [BLOCK_W, row(1)],
    [BLOCK_W / 2, row(0)],
    [-BLOCK_W / 2, row(0)],
  ] as const;
})();

/** One fracture-plug variant: a chamfered block (front toward +z) whose front is a relief of chisel facets. */
function plugVariant(seed: number): THREE.BufferGeometry {
  const w = BLOCK_W - JOINT, h = BLOCK_H - JOINT, d = SLICE_DEPTH - 0.02;
  const g = new RoundedBoxGeometry(w, h, d, 3, 0.045);
  const p = g.getAttribute('position');
  const r = rng(seed * 101 + 7);
  // Facet centres on the front: 8–14 planes of 0.2–0.35 m, each tilted; the front vertices take the nearest plane.
  const nF = 8 + Math.floor(r() * 7);
  const facets: Array<{ x: number; y: number; tx: number; ty: number; dz: number }> = [];
  for (let i = 0; i < nF; i++) facets.push({ x: (r() - 0.5) * w, y: (r() - 0.5) * h, tx: (r() - 0.5) * 0.16, ty: (r() - 0.5) * 0.16, dz: (r() - 0.5) * 0.035 });
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (z < d / 2 - 0.06) continue;
    let best = facets[0], bd = Infinity;
    for (const f of facets) {
      const dd = (x - f.x) ** 2 + (y - f.y) ** 2;
      if (dd < bd) {
        bd = dd;
        best = f;
      }
    }
    // Edge vertices move less (the chamfer stays clean); the centre takes the full relief.
    const edge = Math.min(1, Math.min(w / 2 - Math.abs(x), h / 2 - Math.abs(y)) / 0.12);
    const off = (best.dz + best.tx * (x - best.x) + best.ty * (y - best.y)) * edge;
    p.setZ(i, z + off);
  }
  g.computeVertexNormals();
  // Metric uvs (front: x, y) for the painted stone.
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) uv.set([p.getX(i) + seed * 0.37, p.getY(i)], i * 2);
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Rock family layer per biome (the face's host stone). */
const FACE_LAYER = (biome: number) => (biome <= 0 ? LAYER.slate : LAYER.moss);

interface BlockInst {
  col: number;
  slice: number;
  depth: number;
  kind: number;
  left: number;
  centre: THREE.Vector3;
}

export class FaceRenderer {
  readonly group = new THREE.Group();
  private readonly blocks: THREE.InstancedMesh;
  private readonly trim: THREE.InstancedMesh;
  private readonly nug: THREE.InstancedMesh;
  private readonly gems: THREE.InstancedMesh;
  private readonly inst: THREE.InstancedBufferAttribute;
  private readonly variantOf: Uint8Array;
  private view: FaceView | null = null;
  private live: BlockInst[] = [];
  private readonly frame = { o: new THREE.Vector3(), d: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(0, 1, 0), r: new THREE.Vector3(1, 0, 0) };
  private readonly quat = new THREE.Quaternion();
  /** Last tap point per block key (u, v in 0..1 on the block front) for the crack pattern. */
  private readonly taps = new Map<string, [number, number]>();
  private rimKey: string | null = null;
  private sig = '';
  private trimSig = '';
  /** The leak's promise colour on the joints of the last 3 slices (C14). */
  readonly leak = new THREE.Color();

  constructor(mats: PropMaterials) {
    const vg = new PropBuilder();
    // All variants in one geometry would need a per-instance range: draw variant 0..7 as one geometry with the
    // variant chosen by a vertex group is not possible with instancing, so blocks share 1 variant per draw and the
    // irregularity comes from rotation, mirror and the per-instance seed. 8 draws would break the 1–2 draw budget.
    const geo = plugVariant(1);
    vg.geometry(geo, new THREE.Matrix4(), { layer: LAYER.slate }, 0.5, 1);
    geo.dispose();
    const g = vg.build();
    const max = 7 * DRAWN_SLICES;
    this.inst = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
    g.setAttribute('aInst', this.inst);
    this.blocks = new THREE.InstancedMesh(g, mats.prop, max);
    this.blocks.count = 0;
    this.blocks.frustumCulled = false;
    this.blocks.name = 'face';
    this.variantOf = new Uint8Array(max);
    // Trim cubes (0.5 m bevelled stone).
    const tb = new PropBuilder();
    // A unit trim piece (scaled per instance to its tile): a chamfered stone block, darker than the face.
    tb.box(new THREE.Vector3(), new THREE.Vector3(0.5, 0.5, 0.5), new THREE.Quaternion(), { layer: LAYER.slate }, 0.5, 0.08);
    const tg = tb.build();
    const ta = new Float32Array(400 * 4);
    for (let i = 0; i < 400; i++) ta.set([0, 1, 0, TINT.trimStone], i * 4);
    tg.setAttribute('aInst', new THREE.InstancedBufferAttribute(ta, 4));
    this.trim = new THREE.InstancedMesh(tg, mats.prop, 400);
    this.trim.count = 0;
    this.trim.frustumCulled = false;
    // Nuggets (copper/amber/tin) half-sunk in ore blocks.
    const nb = new PropBuilder();
    const dg = new THREE.DodecahedronGeometry(1, 0);
    nb.geometry(dg, new THREE.Matrix4(), { layer: LAYER.brass, tint: TINT.oreCopper }, 0.5, 0.3);
    dg.dispose();
    const ng = nb.build();
    ng.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(400 * 4), 4));
    // Tint per instance: the prop shader reads tint from aProp; nuggets need per-instance tints → aInst.w carries it.
    this.nug = new THREE.InstancedMesh(ng, mats.prop, 400);
    this.nug.count = 0;
    this.nug.frustumCulled = false;
    // Gem crystals on gem blocks.
    const cb = new CrystalBuilder();
    cb.cluster(new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 4, 0.24, 0.5, 2, 77);
    const cg = cb.build();
    cg.setAttribute('aInst', new THREE.InstancedBufferAttribute(new Float32Array(64 * 4), 4));
    this.gems = new THREE.InstancedMesh(cg, mats.crystal, 64);
    this.gems.count = 0;
    this.gems.frustumCulled = false;
    this.group.add(this.blocks, this.trim, this.nug, this.gems);
    this.group.name = 'faceRenderer';
  }

  /** The block centre (world) of a model column at a slice. */
  centreOf(col: number, slice: number, out = new THREE.Vector3()): THREE.Vector3 {
    const [u, v] = BOND[col];
    const F = this.frame;
    return out.copy(F.o).addScaledVector(F.r, u).addScaledVector(F.u, v).addScaledVector(F.d, slice * SLICE_DEPTH + SLICE_DEPTH / 2);
  }

  /** Update from the model's face (cheap when nothing changed). */
  update(view: FaceView | null, world: VoxelWorld | null): void {
    this.view = view;
    if (!view) {
      this.blocks.count = this.trim.count = this.nug.count = this.gems.count = 0;
      this.live = [];
      this.sig = '';
      return;
    }
    const F = this.frame;
    F.o.copy(v3(view.frame.origin) as THREE.Vector3Like as THREE.Vector3);
    const o = v3(view.frame.origin), d = v3(view.frame.dir), u = v3(view.frame.up);
    F.o.set(o.x, o.y, o.z);
    F.d.set(d.x, d.y, d.z).normalize();
    F.u.set(u.x, u.y, u.z).normalize();
    F.r.crossVectors(F.d, F.u).normalize();
    // Block orientation: local +z (front) faces back toward the viewer (−d), +y up.
    const m = new THREE.Matrix4().makeBasis(F.r, F.u, F.d.clone().negate());
    this.quat.setFromRotationMatrix(m);
    let sig = `${o.x},${o.y},${o.z},${this.rimKey}`;
    for (const row of view.rows.slice(0, DRAWN_SLICES)) {
      sig += `|${row.depth}`;
      for (let c = 0; c < 7; c++) sig += `,${row.kinds[c]}:${Math.round(row.left[c] * 40)}`;
    }
    if (sig === this.sig) return;
    this.sig = sig;
    this.live = [];
    const mtx = new THREE.Matrix4();
    const s = new THREE.Vector3();
    let n = 0, nn = 0, ng = 0;
    const nugAttr = this.nug.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
    const gemAttr = this.gems.geometry.getAttribute('aInst') as THREE.InstancedBufferAttribute;
    const front = view.rows.length ? view.rows[0].depth : view.depth0;
    for (let ri = 0; ri < Math.min(DRAWN_SLICES, view.rows.length); ri++) {
      const row = view.rows[ri];
      const slice = row.depth - view.depth0;
      const lastThree = view.K - slice <= 3;
      for (let c = 0; c < 7; c++) {
        const kind = row.kinds[c];
        const left = row.left[c];
        if (kind === MODEL_CELL.AIR || left <= 0) continue;
        const centre = this.centreOf(c, slice);
        const h = (row.depth * 7 + c) * 2654435761;
        const r = rng(h >>> 0);
        // A quarter turn about the block normal (0, 90, 180, 270°; the 2 cm aspect change is invisible) and a seed for
        // the painted stone: no two neighbours match.
        const turn = Math.floor(r() * 4) * (Math.PI / 2);
        const q = this.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), turn));
        s.set(1, 1, 1);
        mtx.compose(centre, q, s);
        this.blocks.setMatrixAt(n, mtx);
        const key = `${row.depth}:${c}`;
        const tap = this.taps.get(key) ?? [0.5, 0.5];
        const rim = this.rimKey === `face:${c}` && ri === 0 ? 1 : 0;
        // aInst: rim, remaining HP (the crack stage follows 1 − left), the tap point packed, the leak flag.
        this.inst.setXYZW(n, rim, left, 1 + Math.floor(tap[0] * 63) * 64 + Math.floor(tap[1] * 63), lastThree ? 100 : 0);
        this.variantOf[n] = h % VARIANTS;
        this.live.push({ col: c, slice, depth: row.depth, kind, left, centre: centre.clone() });
        n++;
        // Ore, rich and gem blocks: nuggets half-sunk in the front (3–6), crystals on gems.
        if (kind === MODEL_CELL.ORE || kind === MODEL_CELL.RICH || kind === MODEL_CELL.GOLDEN) {
          const count = kind === MODEL_CELL.RICH ? 6 : kind === MODEL_CELL.GOLDEN ? 7 : 4;
          for (let i = 0; i < count && nn < 400; i++) {
            const pu = (r() - 0.5) * 0.55, pv = (r() - 0.5) * 0.5, sz = 0.04 + r() * 0.05;
            const p = centre.clone().addScaledVector(F.r, pu).addScaledVector(F.u, pv).addScaledVector(F.d, -SLICE_DEPTH / 2 + 0.005);
            mtx.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), new THREE.Vector3(sz, sz * 0.8, sz));
            this.nug.setMatrixAt(nn, mtx);
            nugAttr.setXYZW(nn, 0, 1, 0, kind === MODEL_CELL.RICH ? TINT.oreAmber : kind === MODEL_CELL.GOLDEN ? TINT.gold : view.biome <= 0 ? TINT.oreCopper : TINT.oreTin);
            nn++;
          }
        } else if (kind === MODEL_CELL.GEM && ng < 64) {
          const p = centre.clone().addScaledVector(F.d, -SLICE_DEPTH / 2 - 0.02);
          mtx.compose(p, this.quat, new THREE.Vector3(1, 1, 1));
          this.gems.setMatrixAt(ng, mtx);
          gemAttr.setXYZW(ng, 0, left, 0, 0);
          ng++;
        }
      }
    }
    void front;
    this.blocks.count = n;
    this.nug.count = nn;
    this.gems.count = ng;
    this.blocks.instanceMatrix.needsUpdate = true;
    this.inst.needsUpdate = true;
    this.nug.instanceMatrix.needsUpdate = true;
    nugAttr.needsUpdate = true;
    this.gems.instanceMatrix.needsUpdate = true;
    gemAttr.needsUpdate = true;
    const p = PROMISE_COLOUR[view.promise];
    this.leak.setHex(p, THREE.SRGBColorSpace);
    if (world) this.updateTrim(view, world);
  }

  /** Heading size (m): 1B's drift tube (W1: 3.5 × 3.0, the octagon's corners chamfered by one voxel). */
  heading = { w: 3.5, h: 3.0 };

  /**
   * Trim: the heading's cross-section outside the 2-3-2 bond (side strips, the top band, the bond's notches) as
   * bevelled stone pieces of each drawn slice, a few centimetres behind the blocks so the face reads as the plug, and a
   * dark backplate at the back of every slice so a joint never shows through.
   */
  private updateTrim(view: FaceView, world: VoxelWorld): void {
    void world;
    const F = this.frame;
    const live = view.rows.slice(0, DRAWN_SLICES).map((r) => r.depth - view.depth0);
    const sig = `${F.o.x},${F.o.y},${F.o.z}|${live.join(',')}|${this.heading.w}x${this.heading.h}`;
    if (sig === this.trimSig) return;
    this.trimSig = sig;
    const W = this.heading.w, H = this.heading.h;
    const bw = BLOCK_W * 1.5, top = BOND[1][1] + BLOCK_H / 2, lowTop = BOND[5][1] + BLOCK_H / 2, midTop = BOND[0][1] + BLOCK_H / 2;
    // Regions (u0, u1, v0, v1) in the face plane.
    const regions: Array<[number, number, number, number]> = [
      [-W / 2, -bw, 0, H],
      [bw, W / 2, 0, H],
      [-bw, bw, top, H],
      [-bw, -BLOCK_W, 0.0, lowTop],
      [BLOCK_W, bw, 0.0, lowTop],
      [-bw, -BLOCK_W, midTop, top],
      [BLOCK_W, bw, midTop, top],
    ];
    let n = 0;
    const mtx = new THREE.Matrix4();
    const sc = new THREE.Vector3();
    const r = rng(Math.round(F.o.x * 7 + F.o.z * 13) >>> 0);
    const inOct = (u: number, v: number) => !(Math.abs(u) > W / 2 - 0.5 && (v < 0.5 || v > H - 0.5)) || Math.abs(u) + Math.min(v, H - v) * 0 < W / 2 - 0.5;
    for (const slice of live) {
      const z0 = slice * SLICE_DEPTH;
      for (const [u0, u1, v0, v1] of regions) {
        const du = u1 - u0, dv = v1 - v0;
        if (du < 0.05 || dv < 0.05) continue;
        const nu = Math.max(1, Math.round(du / 0.5)), nv = Math.max(1, Math.round(dv / 0.5));
        for (let iu = 0; iu < nu; iu++)
          for (let iv = 0; iv < nv; iv++) {
            const cu = u0 + ((iu + 0.5) * du) / nu, cv = v0 + ((iv + 0.5) * dv) / nv;
            if (!inOct(cu, cv) && Math.abs(cu) > W / 2 - 0.5 && (cv < 0.5 || cv > H - 0.5)) continue;
            if (n >= 400) break;
            const recess = 0.06 + r() * 0.06;
            const c = F.o.clone().addScaledVector(F.r, cu).addScaledVector(F.u, cv).addScaledVector(F.d, z0 + SLICE_DEPTH / 2 + recess);
            sc.set((du / nu - 0.03) * 2, (dv / nv - 0.03) * 2, (SLICE_DEPTH - 0.04) * 2);
            const q = this.quat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (r() - 0.5) * 0.06));
            mtx.compose(c, q, sc);
            this.trim.setMatrixAt(n++, mtx);
          }
      }
      // The backplate of the slice (behind every joint).
      if (n < 400) {
        const c = F.o.clone().addScaledVector(F.u, H / 2).addScaledVector(F.d, z0 + SLICE_DEPTH - 0.03);
        sc.set(W * 2, H * 2, 0.06 * 2);
        mtx.compose(c, this.quat, sc);
        this.trim.setMatrixAt(n++, mtx);
      }
    }
    this.trim.count = n;
    this.trim.instanceMatrix.needsUpdate = true;
  }

  /** A strike on a block: remember the tap point for its crack pattern. */
  tap(col: number, depth: number, point: Vec3): void {
    const live = this.live.find((b) => b.col === col && b.depth === depth);
    if (!live) return;
    const F = this.frame;
    const rel = new THREE.Vector3(point.x, point.y, point.z).sub(live.centre);
    const u = Math.max(0, Math.min(1, rel.dot(F.r) / (BLOCK_W - JOINT) + 0.5));
    const v = Math.max(0, Math.min(1, rel.dot(F.u) / (BLOCK_H - JOINT) + 0.5));
    this.taps.set(`${depth}:${col}`, [u, v]);
    this.sig = '';
  }

  /** The amber rim on a face block ('face:<col>') or none. */
  rim(id: string | null): void {
    if (id === this.rimKey) return;
    this.rimKey = id && id.startsWith('face:') ? id : null;
    this.sig = '';
  }

  /** The front slice's live blocks as drawn (CSS px), in model column order. */
  cells(camera: THREE.Camera, w: number, h: number): CellRect[] {
    const out: CellRect[] = [];
    if (!this.view || !this.live.length) return out;
    const front = Math.min(...this.live.map((b) => b.slice));
    const F = this.frame;
    for (const b of this.live) {
      if (b.slice !== front) continue;
      // The block's cell (0.80 × 0.78 m, its joints included: a tap on a joint takes the block, SPEC §3.5).
      const corners = [-1, 1].flatMap((su) => [-1, 1].map((sv) => b.centre.clone().addScaledVector(F.r, (su * BLOCK_W) / 2).addScaledVector(F.u, (sv * BLOCK_H) / 2).addScaledVector(F.d, -SLICE_DEPTH / 2)));
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of corners) {
        c.project(camera);
        const x = (c.x * 0.5 + 0.5) * w, y = (-c.y * 0.5 + 0.5) * h;
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
      const rect: Rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const inset = 4;
      out.push({ col: b.col, depth: b.depth, slice: b.slice, rect, cx: x0 + rect.w / 2, cy: y0 + rect.h / 2, bound: { x: x0 + inset, y: y0 + inset, w: rect.w - 2 * inset, h: rect.h - 2 * inset }, left: b.left, kind: b.kind });
    }
    return out.sort((a, b) => a.col - b.col);
  }

  /** Ray against the live blocks (nearest): the block's column, depth, slice and the hit point. */
  raycast(ray: THREE.Ray): { col: number; depth: number; slice: number; point: THREE.Vector3; t: number } | null {
    const F = this.frame;
    let best: { col: number; depth: number; slice: number; point: THREE.Vector3; t: number } | null = null;
    const inv = new THREE.Matrix4().makeBasis(F.r, F.u, F.d).invert();
    const o = ray.origin.clone().sub(F.o).applyMatrix4(inv);
    const d = ray.direction.clone().applyMatrix4(inv);
    const lr = new THREE.Ray(o, d);
    const box = new THREE.Box3();
    const hit = new THREE.Vector3();
    for (const b of this.live) {
      const [u, v] = BOND[b.col];
      const z0 = b.slice * SLICE_DEPTH;
      // The block plus half the joint (a tap on a joint takes the nearer block: never a miss).
      box.min.set(u - BLOCK_W / 2, v - BLOCK_H / 2, z0);
      box.max.set(u + BLOCK_W / 2, v + BLOCK_H / 2, z0 + SLICE_DEPTH);
      if (!lr.intersectBox(box, hit)) continue;
      const t = hit.distanceTo(o);
      if (!best || t < best.t) best = { col: b.col, depth: b.depth, slice: b.slice, t, point: ray.at(t, new THREE.Vector3()) };
    }
    return best;
  }

  /** Live blocks (FX: shards take a block's place and look). */
  block(col: number, depth: number): { centre: THREE.Vector3; kind: number } | null {
    const b = this.live.find((x) => x.col === col && x.depth === depth);
    return b ? { centre: b.centre.clone(), kind: b.kind } : null;
  }

  get frameAxes(): { o: THREE.Vector3; d: THREE.Vector3; u: THREE.Vector3; r: THREE.Vector3 } {
    return this.frame;
  }

  /** Tris and draws (stats). */
  get draws(): number {
    return (this.blocks.count ? 1 : 0) + (this.trim.count ? 1 : 0) + (this.nug.count ? 1 : 0) + (this.gems.count ? 1 : 0);
  }

  dispose(): void {
    for (const m of [this.blocks, this.trim, this.nug, this.gems]) m.geometry.dispose();
  }
}

export { FACE_LAYER };
