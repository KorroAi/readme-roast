import { EMIT_B, EMIT_G, EMIT_R, SOLID } from '../config/blocks';
import { LIGHT } from '../config/balance';
import type { VoxelWorld } from './VoxelWorld';

export interface Box3i {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
}

// Light decays multiplicatively (plus a small constant that ends the tail), so a light keeps
// its hue as it fades. Subtractive per-channel decay would drain blue and green first and
// turn every warm lamp red at a distance.
const DECAY_FACE = new Uint8Array(256);
const DECAY_EDGE = new Uint8Array(256);
for (let v = 0; v < 256; v++) {
  DECAY_FACE[v] = Math.max(0, Math.floor(v * LIGHT.falloffPerStep) - LIGHT.tailCut);
  DECAY_EDGE[v] = Math.max(0, Math.floor(v * Math.pow(LIGHT.falloffPerStep, Math.SQRT2)) - LIGHT.tailCut);
}

/** Farthest a full-intensity emitter can reach, in steps; local updates must cover it. */
export const LIGHT_REACH = (() => {
  let v: number = LIGHT.maxLevel;
  let steps = 0;
  while (v > 0) {
    v = DECAY_FACE[v];
    steps++;
  }
  return steps + 1;
})();

// 6 face neighbors followed by 12 edge neighbors (with the two face steps that bound each edge).
const FACE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];
const EDGE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [1, -1, 0], [-1, 1, 0], [-1, -1, 0],
  [1, 0, 1], [1, 0, -1], [-1, 0, 1], [-1, 0, -1],
  [0, 1, 1], [0, 1, -1], [0, -1, 1], [0, -1, -1],
];

export interface LightOptions {
  /**
   * The y axis is a ring (RingWorld): y neighbours wrap from the last storage row to the first. A dead
   * (bedrock) slab in the ring is the barrier between the window's bottom and its top.
   */
  wrapY?: boolean;
}

/**
 * Colored flood-fill light for static emitters (crystals, lamps, glowroot), stored as RGBA8 per voxel:
 * RGB = emitted light, A = "openness" (how much open space surrounds the voxel), which the shader turns
 * into a faint ambient fill so huge chambers read as huge.
 *
 * Propagation uses 18-connectivity (faces + edges) so pools of light are round rather than diamond
 * shaped. Diagonal steps require one open face neighbor so light never leaks through a sealed corner.
 *
 * All coordinates here are STORAGE coordinates (x + sx (y + sy z)). With `wrapY` the y neighbours wrap
 * (the descent's ring); `changedRows` then lists the storage rows touched by the last operation, so the
 * uploader can split a change that crosses the wrap.
 */
export class LightField {
  readonly data: Uint8Array;
  readonly wrapY: boolean;
  private readonly world: VoxelWorld;
  private queue: Int32Array;
  private qHead = 0;
  private qTail = 0;
  private qMask: number;
  private readonly faceOff: Int32Array;
  private readonly edgeOff: Int32Array;
  private readonly edgeA: Int32Array;
  private readonly edgeB: Int32Array;
  /** Per edge step: the face-step index (0..5) of its two components. */
  private readonly edgeFa: Int32Array;
  private readonly edgeFb: Int32Array;
  private readonly removalQueue: number[] = [];
  /** Scratch: face neighbour indices of the voxel being expanded (-1 = outside). */
  private readonly fn = new Int32Array(6);
  /** Bounding box of voxels changed by the last operation (for partial GPU upload). With wrapY, its
   *  y range is the min/max storage row; `changedRows` is exact. */
  readonly changed: Box3i = { x0: 0, y0: 0, z0: 0, x1: -1, y1: -1, z1: -1 };
  /** Storage rows changed by the last operation (1 = changed). */
  readonly changedRows: Uint8Array;
  /** Rows a propagation may write (null: all); x/z limits. */
  private rowLimit: Uint8Array | null = null;
  private lx0 = 0;
  private lx1 = 0;
  private lz0 = 0;
  private lz1 = 0;

  /** @param data optional precomputed light buffer to adopt (e.g. from the loading worker). */
  constructor(world: VoxelWorld, data?: Uint8Array, options: LightOptions = {}) {
    this.world = world;
    this.wrapY = !!options.wrapY;
    if (data && data.length !== world.sx * world.sy * world.sz * 4) throw new Error('light buffer size mismatch');
    this.data = data ?? new Uint8Array(world.sx * world.sy * world.sz * 4);
    this.changedRows = new Uint8Array(world.sy);
    const size = 1 << 20;
    this.queue = new Int32Array(size);
    this.qMask = size - 1;
    const sx = world.sx;
    const sxy = world.sx * world.sy;
    const off = (d: readonly [number, number, number]) => d[0] + d[1] * sx + d[2] * sxy;
    this.faceOff = Int32Array.from(FACE_DIRS.map(off));
    this.edgeOff = Int32Array.from(EDGE_DIRS.map(off));
    this.edgeA = new Int32Array(EDGE_DIRS.length);
    this.edgeB = new Int32Array(EDGE_DIRS.length);
    this.edgeFa = new Int32Array(EDGE_DIRS.length);
    this.edgeFb = new Int32Array(EDGE_DIRS.length);
    const faceIndex = (d: [number, number, number]) => FACE_DIRS.findIndex((f) => f[0] === d[0] && f[1] === d[1] && f[2] === d[2]);
    // An edge step (two non-zero components) is bounded by the two single-axis face steps.
    for (let i = 0; i < EDGE_DIRS.length; i++) {
      const [dx, dy, dz] = EDGE_DIRS[i];
      const comps: Array<[number, number, number]> = [];
      if (dx) comps.push([dx, 0, 0]);
      if (dy) comps.push([0, dy, 0]);
      if (dz) comps.push([0, 0, dz]);
      this.edgeA[i] = off(comps[0]);
      this.edgeB[i] = off(comps[1]);
      this.edgeFa[i] = faceIndex(comps[0]);
      this.edgeFb[i] = faceIndex(comps[1]);
    }
  }

  /** Storage index of a face neighbour of (x, y, z) at index i, -1 outside (y wraps with wrapY). */
  private faceN(i: number, x: number, y: number, z: number, k: number): number {
    const w = this.world;
    const d = FACE_DIRS[k];
    if (d[0]) {
      const nx = x + d[0];
      return nx < 0 || nx >= w.sx ? -1 : i + d[0];
    }
    if (d[2]) {
      const nz = z + d[2];
      return nz < 0 || nz >= w.sz ? -1 : i + this.faceOff[k];
    }
    const ny = y + d[1];
    if (ny < 0) return this.wrapY ? i + (w.sy - 1) * w.sx : -1;
    if (ny >= w.sy) return this.wrapY ? i - (w.sy - 1) * w.sx : -1;
    return i + this.faceOff[k];
  }

  /** Fill `fn` with the 6 face neighbour indices of voxel i. */
  private faces(i: number, x: number, y: number, z: number): void {
    for (let k = 0; k < 6; k++) this.fn[k] = this.faceN(i, x, y, z, k);
  }

  /** Storage index of edge neighbour e (given the face neighbours in `fn`), -1 outside or sealed corner
   *  (both bounding face voxels solid: `sealed` set when blocked). */
  private edgeN(e: number, x: number, y: number, z: number): number {
    const a = this.fn[this.edgeFa[e]];
    const b = this.fn[this.edgeFb[e]];
    if (a < 0 || b < 0) return -1;
    // a + (b - i): the step of b applied to a. With the y wrap, b - i already holds the wrapped step.
    void x;
    void y;
    void z;
    return a + (b - this.cur);
  }

  /** The voxel being expanded (edgeN's base). */
  private cur = 0;

  private coords(i: number): void {
    const w = this.world;
    const sxy = w.sx * w.sy;
    const z = (i / sxy) | 0;
    const rem = i - z * sxy;
    const y = (rem / w.sx) | 0;
    this.cx = rem - y * w.sx;
    this.cy = y;
    this.cz = z;
  }
  private cx = 0;
  private cy = 0;
  private cz = 0;

  /** Recompute everything from scratch (world load). */
  computeAll(): void {
    const w = this.world;
    const d = this.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 0;
      d[i + 1] = 0;
      d[i + 2] = 0;
    }
    this.resetChanged();
    this.qHead = this.qTail = 0;
    const blocks = w.blocks;
    for (let i = 0; i < blocks.length; i++) {
      const id = blocks[i];
      if ((EMIT_R[id] | EMIT_G[id] | EMIT_B[id]) !== 0) {
        d[i * 4] = EMIT_R[id];
        d[i * 4 + 1] = EMIT_G[id];
        d[i * 4 + 2] = EMIT_B[id];
        this.push(i);
      }
    }
    this.setLimit(null);
    this.propagate(false);
    this.computeOpenness();
    this.changed.x0 = 0;
    this.changed.y0 = 0;
    this.changed.z0 = 0;
    this.changed.x1 = w.sx - 1;
    this.changed.y1 = w.sy - 1;
    this.changed.z1 = w.sz - 1;
    this.changedRows.fill(1);
  }

  /**
   * Update light after the voxel at storage (x, y, z) changed from `oldId` to the id now stored there.
   * Returns the bounding box of changed light texels (empty box if nothing changed).
   */
  onBlockChanged(x: number, y: number, z: number, oldId: number): Box3i {
    const w = this.world;
    const i = w.index(x, y, z);
    const newId = w.blocks[i];
    this.resetChanged();
    const oldEmits = (EMIT_R[oldId] | EMIT_G[oldId] | EMIT_B[oldId]) !== 0;
    const newEmits = (EMIT_R[newId] | EMIT_G[newId] | EMIT_B[newId]) !== 0;
    const becameSolid = !SOLID[oldId] && SOLID[newId];
    if (becameSolid) {
      this.data[i * 4 + 3] = 0;
      // Adding an occluder can darken anything its shadow reaches: rebuild locally (rare).
      this.recomputeBox({
        x0: x - LIGHT_REACH, y0: y - LIGHT_REACH, z0: z - LIGHT_REACH,
        x1: x + LIGHT_REACH, y1: y + LIGHT_REACH, z1: z + LIGHT_REACH,
      });
      return this.changed;
    }
    const d = this.data;
    this.qHead = this.qTail = 0;
    this.setLimit(null);
    if (oldEmits) this.removeLight(i, x, y, z);
    if (SOLID[oldId] && !SOLID[newId]) this.openVoxel(i, x, y, z);
    if (newEmits) {
      d[i * 4] = Math.max(d[i * 4], EMIT_R[newId]);
      d[i * 4 + 1] = Math.max(d[i * 4 + 1], EMIT_G[newId]);
      d[i * 4 + 2] = Math.max(d[i * 4 + 2], EMIT_B[newId]);
      this.expand(x, y, z);
      this.push(i);
    }
    this.propagate(true);
    return this.changed;
  }

  /**
   * Batch fill for many voxels that turned from solid non-emitters to air in one frame (a blast, a row
   * wipe): one flood fill for all of them (`openMany`, SPEC §6.2). Indices are storage indices.
   */
  openMany(indices: ArrayLike<number>, count = indices.length): Box3i {
    this.resetChanged();
    this.qHead = this.qTail = 0;
    this.setLimit(null);
    const w = this.world;
    const sxy = w.sx * w.sy;
    for (let k = 0; k < count; k++) {
      const i = indices[k];
      const z = (i / sxy) | 0;
      const rem = i - z * sxy;
      const y = (rem / w.sx) | 0;
      const x = rem - y * w.sx;
      if (SOLID[w.blocks[i]]) continue;
      this.openVoxel(i, x, y, z);
    }
    this.propagate(true);
    return this.changed;
  }

  /** An occluder at i was removed: pull light in from neighbours and queue the frontier. */
  private openVoxel(i: number, x: number, y: number, z: number): void {
    const d = this.data;
    d[i * 4] = 0;
    d[i * 4 + 1] = 0;
    d[i * 4 + 2] = 0;
    // Openness is smooth at this scale: the opened voxel takes its most open face neighbour's value.
    this.faces(i, x, y, z);
    let open = 0;
    for (let k = 0; k < 6; k++) {
      const n = this.fn[k];
      if (n >= 0) open = Math.max(open, d[n * 4 + 3]);
    }
    d[i * 4 + 3] = open;
    this.expand(x, y, z);
    this.pullFromNeighbors(i, x, y, z);
    if (d[i * 4] | d[i * 4 + 1] | d[i * 4 + 2]) this.push(i);
    // The opened voxel may also unblock diagonal steps between two of its face neighbors.
    this.faces(i, x, y, z);
    for (let k = 0; k < 6; k++) {
      const n = this.fn[k];
      if (n >= 0 && d[n * 4] | d[n * 4 + 1] | d[n * 4 + 2]) this.push(n);
    }
  }

  /**
   * Remove the light an emitter at voxel i contributed, per channel, then queue the brighter frontier so
   * other sources refill the cleared region (the classic voxel light-removal flood fill, generalised to the
   * multiplicative decay).
   */
  private removeLight(i: number, x: number, y: number, z: number): void {
    const w = this.world;
    const d = this.data;
    const blocks = w.blocks;
    const emitTables = [EMIT_R, EMIT_G, EMIT_B];
    const rq = this.removalQueue;
    for (let c = 0; c < 3; c++) {
      const start = d[i * 4 + c];
      if (start === 0) continue;
      const emitC = emitTables[c];
      d[i * 4 + c] = 0;
      this.expand(x, y, z);
      rq.length = 0;
      rq.push(i, start);
      for (let h = 0; h < rq.length; h += 2) {
        const idx = rq[h];
        const lvl = rq[h + 1];
        this.coords(idx);
        const cx = this.cx;
        const cy = this.cy;
        const cz = this.cz;
        this.faces(idx, cx, cy, cz);
        this.cur = idx;
        for (let k = 0; k < 18; k++) {
          let n: number;
          let decayed: number;
          if (k < 6) {
            n = this.fn[k];
            if (n < 0) continue;
            decayed = DECAY_FACE[lvl];
          } else {
            const e = k - 6;
            n = this.edgeN(e, cx, cy, cz);
            if (n < 0) continue;
            if (SOLID[blocks[this.fn[this.edgeFa[e]]]] && SOLID[blocks[this.fn[this.edgeFb[e]]]]) continue;
            decayed = DECAY_EDGE[lvl];
          }
          const v = d[n * 4 + c];
          if (v === 0) continue;
          const own = emitC[blocks[n]];
          if (!SOLID[blocks[n]] && v <= decayed && v > own) {
            d[n * 4 + c] = own;
            this.expandIndex(n);
            rq.push(n, v);
            if (own > 0) this.push(n);
          } else {
            // Lit by another source (or an emitter itself): it will refill the gap.
            this.push(n);
          }
        }
      }
    }
  }

  /** Clear and rebuild light inside `box` (x, z clamped; y wraps with wrapY), seeding from emitters inside
   *  and lit voxels just outside. */
  recomputeBox(box: Box3i): void {
    const w = this.world;
    const x0 = Math.max(0, box.x0);
    const x1 = Math.min(w.sx - 1, box.x1);
    const z0 = Math.max(0, box.z0);
    const z1 = Math.min(w.sz - 1, box.z1);
    let y0 = box.y0;
    let y1 = box.y1;
    if (!this.wrapY) {
      y0 = Math.max(0, y0);
      y1 = Math.min(w.sy - 1, y1);
    } else if (y1 - y0 + 1 >= w.sy) {
      y0 = 0;
      y1 = w.sy - 1;
    }
    const rows = new Uint8Array(w.sy);
    for (let y = y0; y <= y1; y++) rows[((y % w.sy) + w.sy) % w.sy] = 1;
    const d = this.data;
    const blocks = w.blocks;
    this.resetChanged();
    this.qHead = this.qTail = 0;
    for (let yy = y0; yy <= y1; yy++) {
      const y = ((yy % w.sy) + w.sy) % w.sy;
      this.changedRows[y] = 1;
      for (let z = z0; z <= z1; z++) {
        let i = w.index(x0, y, z);
        for (let x = x0; x <= x1; x++, i++) {
          const id = blocks[i];
          const r = EMIT_R[id];
          const g = EMIT_G[id];
          const bl = EMIT_B[id];
          d[i * 4] = r;
          d[i * 4 + 1] = g;
          d[i * 4 + 2] = bl;
          if (r | g | bl) this.push(i);
        }
      }
    }
    // Seed from the one-voxel shell around the box: those values are still correct because the box
    // extends past the reach of any light that could have passed through the change.
    for (let yy = y0 - 1; yy <= y1 + 1; yy++) {
      let y = yy;
      if (this.wrapY) y = ((yy % w.sy) + w.sy) % w.sy;
      else if (y < 0 || y >= w.sy) continue;
      const rowInside = rows[y] === 1;
      for (let z = z0 - 1; z <= z1 + 1; z++)
        for (let x = x0 - 1; x <= x1 + 1; x++) {
          if (x < 0 || z < 0 || x >= w.sx || z >= w.sz) continue;
          const inside = rowInside && x >= x0 && x <= x1 && z >= z0 && z <= z1;
          if (inside) continue;
          const i = w.index(x, y, z);
          if (d[i * 4] | d[i * 4 + 1] | d[i * 4 + 2]) this.push(i);
        }
    }
    this.changed.x0 = x0;
    this.changed.x1 = x1;
    this.changed.z0 = z0;
    this.changed.z1 = z1;
    this.changed.y0 = Math.max(0, Math.min(y0, w.sy - 1));
    this.changed.y1 = Math.min(w.sy - 1, Math.max(0, y1));
    if (this.wrapY && (y0 < 0 || y1 >= w.sy)) {
      this.changed.y0 = 0;
      this.changed.y1 = w.sy - 1;
    }
    this.lx0 = x0;
    this.lx1 = x1;
    this.lz0 = z0;
    this.lz1 = z1;
    this.rowLimit = rows;
    this.propagate(false);
    this.setLimit(null);
  }

  /** Rebuild `count` storage rows from y0 (wrapping), every x and z. */
  recomputeRows(y0: number, count: number): void {
    const w = this.world;
    this.recomputeBox({ x0: 0, x1: w.sx - 1, z0: 0, z1: w.sz - 1, y0, y1: y0 + count - 1 });
  }

  /**
   * Max-merge light computed elsewhere (the slab worker) into `count` storage rows from y0: `src` holds
   * RGBA8 for those rows in order (row-major x, then row, then z: index x + sx (r + count z)), RGB only.
   */
  mergeMaxRows(src: Uint8Array, y0: number, count: number): void {
    const w = this.world;
    const d = this.data;
    for (let z = 0; z < w.sz; z++)
      for (let r = 0; r < count; r++) {
        const y = (((y0 + r) % w.sy) + w.sy) % w.sy;
        this.changedRows[y] = 1;
        let o = w.index(0, y, z) * 4;
        let s = (w.sx * (r + count * z)) * 4;
        for (let x = 0; x < w.sx; x++, o += 4, s += 4) {
          if (src[s] > d[o]) d[o] = src[s];
          if (src[s + 1] > d[o + 1]) d[o + 1] = src[s + 1];
          if (src[s + 2] > d[o + 2]) d[o + 2] = src[s + 2];
        }
      }
  }

  /** Write RGBA rows (same layout as mergeMaxRows), replacing what is there. */
  writeRows(src: Uint8Array, y0: number, count: number): void {
    const w = this.world;
    const d = this.data;
    const rowBytes = w.sx * 4;
    for (let z = 0; z < w.sz; z++)
      for (let r = 0; r < count; r++) {
        const y = (((y0 + r) % w.sy) + w.sy) % w.sy;
        this.changedRows[y] = 1;
        const o = w.index(0, y, z) * 4;
        const s = w.sx * (r + count * z) * 4;
        d.set(src.subarray(s, s + rowBytes), o);
      }
  }

  /** Zero `count` storage rows from y0 (RGBA), e.g. a slot that just died. */
  clearRows(y0: number, count: number): void {
    const w = this.world;
    const d = this.data;
    for (let z = 0; z < w.sz; z++)
      for (let r = 0; r < count; r++) {
        const y = (((y0 + r) % w.sy) + w.sy) % w.sy;
        this.changedRows[y] = 1;
        const o = w.index(0, y, z) * 4;
        d.fill(0, o, o + w.sx * 4);
      }
  }

  /** Forget the changed rows (after an upload). */
  clearChangedRows(): void {
    this.changedRows.fill(0);
  }

  private setLimit(rows: Uint8Array | null): void {
    this.rowLimit = rows;
    if (!rows) {
      this.lx0 = 0;
      this.lz0 = 0;
      this.lx1 = this.world.sx - 1;
      this.lz1 = this.world.sz - 1;
    }
  }

  private resetChanged(): void {
    const c = this.changed;
    c.x0 = c.y0 = c.z0 = Number.MAX_SAFE_INTEGER;
    c.x1 = c.y1 = c.z1 = -1;
  }

  private expand(x: number, y: number, z: number): void {
    const c = this.changed;
    if (x < c.x0) c.x0 = x;
    if (y < c.y0) c.y0 = y;
    if (z < c.z0) c.z0 = z;
    if (x > c.x1) c.x1 = x;
    if (y > c.y1) c.y1 = y;
    if (z > c.z1) c.z1 = z;
    this.changedRows[y] = 1;
  }

  private expandIndex(i: number): void {
    this.coords(i);
    this.expand(this.cx, this.cy, this.cz);
  }

  private push(i: number): void {
    this.queue[this.qTail & this.qMask] = i;
    this.qTail++;
    if (this.qTail - this.qHead > this.qMask) {
      // Grow the ring buffer (rare: only for huge, fully open worlds).
      const old = this.queue;
      const next = new Int32Array(old.length * 2);
      const n = this.qTail - this.qHead - 1;
      for (let k = 0; k < n; k++) next[k] = old[(this.qHead + k) & this.qMask];
      next[n] = i;
      this.queue = next;
      this.qMask = next.length - 1;
      this.qHead = 0;
      this.qTail = n + 1;
    }
  }

  private pullFromNeighbors(i: number, x: number, y: number, z: number): void {
    const d = this.data;
    const blocks = this.world.blocks;
    let r = 0;
    let g = 0;
    let bl = 0;
    this.faces(i, x, y, z);
    this.cur = i;
    for (let k = 0; k < 6; k++) {
      const n = this.fn[k];
      if (n < 0) continue;
      r = Math.max(r, DECAY_FACE[d[n * 4]]);
      g = Math.max(g, DECAY_FACE[d[n * 4 + 1]]);
      bl = Math.max(bl, DECAY_FACE[d[n * 4 + 2]]);
    }
    for (let e = 0; e < 12; e++) {
      const n = this.edgeN(e, x, y, z);
      if (n < 0) continue;
      if (SOLID[blocks[this.fn[this.edgeFa[e]]]] && SOLID[blocks[this.fn[this.edgeFb[e]]]]) continue;
      r = Math.max(r, DECAY_EDGE[d[n * 4]]);
      g = Math.max(g, DECAY_EDGE[d[n * 4 + 1]]);
      bl = Math.max(bl, DECAY_EDGE[d[n * 4 + 2]]);
    }
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = bl;
  }

  /** Max-propagation flood fill, confined to the current limit (x/z range and row mask). */
  private propagate(track: boolean): void {
    const w = this.world;
    const d = this.data;
    const blocks = w.blocks;
    const sx = w.sx;
    const sy = w.sy;
    const sz = w.sz;
    const sxy = sx * sy;
    const rows = this.rowLimit;
    const lx0 = this.lx0;
    const lx1 = this.lx1;
    const lz0 = this.lz0;
    const lz1 = this.lz1;
    const fn = this.fn;
    const faceOff = this.faceOff;
    const edgeOff = this.edgeOff;
    const edgeA = this.edgeA;
    const edgeB = this.edgeB;

    while (this.qHead < this.qTail) {
      const i = this.queue[this.qHead & this.qMask];
      this.qHead++;
      const r = d[i * 4];
      const g = d[i * 4 + 1];
      const b = d[i * 4 + 2];
      if (DECAY_FACE[r] === 0 && DECAY_FACE[g] === 0 && DECAY_FACE[b] === 0) continue;
      const z = (i / sxy) | 0;
      const rem = i - z * sxy;
      const y = (rem / sx) | 0;
      const x = rem - y * sx;
      // Interior rows use the flat offsets; boundary rows (and the ring's wrap) go through faceN.
      const interior = y > 0 && y < sy - 1 && x > 0 && x < sx - 1 && z > 0 && z < sz - 1;
      if (!interior) this.faces(i, x, y, z);
      for (let k = 0; k < 18; k++) {
        let n: number;
        let table: Uint8Array;
        if (k < 6) {
          n = interior ? i + faceOff[k] : fn[k];
          if (n < 0) continue;
          table = DECAY_FACE;
        } else {
          const e = k - 6;
          let a: number;
          let bb: number;
          if (interior) {
            a = i + edgeA[e];
            bb = i + edgeB[e];
            n = i + edgeOff[e];
          } else {
            a = fn[this.edgeFa[e]];
            bb = fn[this.edgeFb[e]];
            if (a < 0 || bb < 0) continue;
            n = a + (bb - i);
          }
          if (SOLID[blocks[a]] && SOLID[blocks[bb]]) continue;
          table = DECAY_EDGE;
        }
        if (SOLID[blocks[n]]) continue;
        const dir = k < 6 ? FACE_DIRS[k] : EDGE_DIRS[k - 6];
        const nx = x + dir[0];
        const nz = z + dir[2];
        let ny = y + dir[1];
        if (ny < 0) ny += sy;
        else if (ny >= sy) ny -= sy;
        if (nx < lx0 || nx > lx1 || nz < lz0 || nz > lz1) continue;
        if (rows !== null && rows[ny] === 0) continue;
        const nr = table[r];
        const ng = table[g];
        const nb = table[b];
        const o = n * 4;
        let improved = false;
        if (nr > d[o]) {
          d[o] = nr;
          improved = true;
        }
        if (ng > d[o + 1]) {
          d[o + 1] = ng;
          improved = true;
        }
        if (nb > d[o + 2]) {
          d[o + 2] = nb;
          improved = true;
        }
        if (improved) {
          if (track) this.expand(nx, ny, nz);
          this.push(n);
        }
      }
    }
  }

  /**
   * Openness: fraction of open voxels in a ~(2r+1)^3 neighborhood, on a half-resolution grid with three
   * separable box sums (integer, so a band recompute equals a full one exactly) and sampled back per voxel.
   * x and z clamp at the edges; y clamps, or wraps with wrapY.
   */
  computeOpenness(radius = 6): void {
    this.computeOpennessRows(0, this.world.sy, radius);
  }

  /**
   * Recompute openness for `count` storage rows from y0 (wrapping with wrapY): what a new slab changes.
   * y0 and count must be even (half-resolution rows pair storage rows 2h, 2h + 1).
   */
  computeOpennessRows(y0: number, count: number, radius = 6): void {
    const w = this.world;
    const { sx, sy, sz } = w;
    const hx = Math.ceil(sx / 2);
    const hy = Math.ceil(sy / 2);
    const hz = Math.ceil(sz / 2);
    const r = Math.max(1, Math.round(radius / 2));
    const full = count >= sy;
    const h0 = full ? 0 : Math.floor(y0 / 2);
    const hn = full ? hy : Math.ceil(count / 2);
    // Local half rows: full = every half row by index; a band = the targets and r on each side.
    const first = full ? 0 : h0 - r;
    const span = full ? hy : hn + 2 * r;
    const hyIndex = (h: number): number => (this.wrapY ? ((h % hy) + hy) % hy : Math.min(hy - 1, Math.max(0, h)));
    const blocks = w.blocks;
    const occ = new Int32Array(span * hz * hx);
    for (let j = 0; j < span; j++) {
      const h = full ? j : hyIndex(first + j);
      for (let dy = 0; dy < 2; dy++) {
        const y = 2 * h + dy;
        if (y >= sy) continue;
        for (let z = 0; z < sz; z++) {
          const base = (j * hz + (z >> 1)) * hx;
          let i = sx * (y + sy * z);
          for (let x = 0; x < sx; x++, i++) if (!SOLID[blocks[i]]) occ[base + (x >> 1)]++;
        }
      }
    }
    // x pass (clamped at the edges).
    const tmp = new Int32Array(occ.length);
    for (let line = 0; line < span * hz; line++) {
      const base = line * hx;
      for (let p = 0; p < hx; p++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += occ[base + Math.min(hx - 1, Math.max(0, p + k))];
        tmp[base + p] = sum;
      }
    }
    // z pass (clamped at the edges).
    for (let j = 0; j < span; j++)
      for (let q = 0; q < hz; q++)
        for (let p = 0; p < hx; p++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) sum += tmp[(j * hz + Math.min(hz - 1, Math.max(0, q + k))) * hx + p];
          occ[(j * hz + q) * hx + p] = sum;
        }
    // y pass for the target half rows, then the voxels of those rows.
    const d = this.data;
    const total = 8 * (2 * r + 1) ** 3;
    const plane = new Int32Array(hz * hx);
    for (let t = 0; t < hn; t++) {
      const h = h0 + t;
      for (let q = 0; q < hz; q++)
        for (let p = 0; p < hx; p++) {
          let sum = 0;
          for (let k = -r; k <= r; k++) {
            const j = full ? hyIndex(h + k) : h + k - first;
            sum += occ[(j * hz + q) * hx + p];
          }
          plane[q * hx + p] = sum;
        }
      const hw = hyIndex(h);
      for (let dy = 0; dy < 2; dy++) {
        const y = 2 * hw + dy;
        if (y >= sy) continue;
        this.changedRows[y] = 1;
        for (let z = 0; z < sz; z++) {
          const row = (z >> 1) * hx;
          let i = sx * (y + sy * z);
          for (let x = 0; x < sx; x++, i++) d[i * 4 + 3] = SOLID[blocks[i]] ? 0 : Math.round(Math.min(1, plane[row + (x >> 1)] / total) * 255);
        }
      }
    }
  }
}

/**
 * Visibility of the player's lantern, in a small grid that follows the player (0..255).
 *
 * Computed by one outward propagation pass instead of a ray per voxel: a voxel's visibility is
 * the average of its up-to-three neighbours one step back toward the lantern, weighted by how
 * much the lantern direction runs along each axis, and 0 if the voxel is solid. Straight lines
 * of sight stay fully lit, walls cast shadows, and penumbrae soften with distance like a real
 * flame's. O(r^3): 0.2-0.6 ms on the real world (Node, dev container) where per-voxel ray
 * marching was O(r^4) and took 1.75-5.7 ms, so moving with the lantern never stalls a frame. Trilinear filtering on the GPU
 * smooths the grid; the shader applies the distance falloff from the exact flame position.
 */
export class LanternField {
  static readonly SIZE = 32;
  readonly data = new Uint8Array(LanternField.SIZE ** 3);
  /** World voxel coordinate of texel (0,0,0). */
  originX = 0;
  originY = 0;
  originZ = 0;
  /** Lantern position used for the last compute. */
  lastX = Number.NaN;
  lastY = Number.NaN;
  lastZ = Number.NaN;
  private lastRadius = Number.NaN;
  private lastRevision = -1;
  private readonly vis = new Float32Array(LanternField.SIZE ** 3);

  constructor(private readonly world: VoxelWorld) {}

  /** Recompute when the lantern moved, its radius changed or the world changed. Returns true if data changed. */
  update(lx: number, ly: number, lz: number, radius: number, force = false): boolean {
    const moved = Math.abs(lx - this.lastX) + Math.abs(ly - this.lastY) + Math.abs(lz - this.lastZ);
    const resized = !(Math.abs(radius - this.lastRadius) < 0.25);
    if (!force && !resized && moved < 0.35 && this.world.revision === this.lastRevision) return false;
    this.compute(lx, ly, lz, radius);
    return true;
  }

  compute(lx: number, ly: number, lz: number, radius: number): void {
    const S = LanternField.SIZE;
    const half = S / 2;
    const w = this.world;
    this.lastX = lx;
    this.lastY = ly;
    this.lastZ = lz;
    this.lastRadius = radius;
    this.lastRevision = w.revision;
    // The flame can sit a few centimetres inside a wall when the explorer stands flush against
    // it: start from the nearest open voxel instead, so the lantern never goes dark.
    let cx = Math.floor(lx);
    let cy = Math.floor(ly);
    let cz = Math.floor(lz);
    if (w.isSolid(cx, cy, cz)) {
      let best = Infinity;
      const ox = cx;
      const oy = cy;
      const oz = cz;
      for (let dz = -1; dz <= 1; dz++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = ox + dx;
            const y = oy + dy;
            const z = oz + dz;
            if (w.isSolid(x, y, z)) continue;
            const qx = lx - Math.max(x, Math.min(x + 1, lx));
            const qy = ly - Math.max(y, Math.min(y + 1, ly));
            const qz = lz - Math.max(z, Math.min(z + 1, lz));
            const dist = qx * qx + qy * qy + qz * qz;
            if (dist < best) {
              best = dist;
              cx = x;
              cy = y;
              cz = z;
            }
          }
    }
    this.originX = cx - half;
    this.originY = cy - half;
    this.originZ = cz - half;
    const d = this.data;
    const vis = this.vis;
    d.fill(0);
    vis.fill(0);
    const r = Math.min(half - 1, Math.ceil(radius));
    const r2 = (r + 0.5) * (r + 0.5);
    const SS = S * S;
    const c0 = half + S * half + SS * half;
    vis[c0] = 1;
    d[c0] = 255;
    // Each octant is swept outward from the lantern voxel, so the neighbours one step back
    // toward the lantern are always already done. (The axis planes are shared and recomputed
    // identically.)
    for (let oz = -1; oz <= 1; oz += 2)
      for (let oy = -1; oy <= 1; oy += 2)
        for (let ox = -1; ox <= 1; ox += 2)
          for (let az = 0; az <= r; az++)
            for (let ay = 0; ay <= r; ay++)
              for (let ax = 0; ax <= r; ax++) {
                if (ax + ay + az === 0) continue;
                const x = cx + ox * ax;
                const y = cy + oy * ay;
                const z = cz + oz * az;
                const ddx = x + 0.5 - lx;
                const ddy = y + 0.5 - ly;
                const ddz = z + 0.5 - lz;
                if (ddx * ddx + ddy * ddy + ddz * ddz > r2) continue;
                const t = half + ox * ax + S * (half + oy * ay) + SS * (half + oz * az);
                if (w.isSolid(x, y, z)) {
                  vis[t] = 0;
                  continue;
                }
                const wx = ax > 0 ? Math.abs(ddx) : 0;
                const wy = ay > 0 ? Math.abs(ddy) : 0;
                const wz = az > 0 ? Math.abs(ddz) : 0;
                const sum = wx + wy + wz;
                let v: number;
                if (sum < 1e-6) {
                  // Directly beside the flame along an axis it is level with.
                  v = (ax > 0 ? vis[t - ox] : 0) + (ay > 0 ? vis[t - oy * S] : 0) + (az > 0 ? vis[t - oz * SS] : 0);
                  v = Math.min(1, v);
                } else {
                  v = ((wx > 0 ? wx * vis[t - ox] : 0) + (wy > 0 ? wy * vis[t - oy * S] : 0) + (wz > 0 ? wz * vis[t - oz * SS] : 0)) / sum;
                }
                vis[t] = v;
                d[t] = Math.round(v * 255);
              }
  }
}

/** True if the segment from a to b crosses no solid voxel (the end voxel itself is not tested). */
export function segmentClear(w: VoxelWorld, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  let x = Math.floor(ax);
  let y = Math.floor(ay);
  let z = Math.floor(az);
  const ex = Math.floor(bx);
  const ey = Math.floor(by);
  const ez = Math.floor(bz);
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * tdy : Infinity;
  let tmz = dz !== 0 ? (dz > 0 ? z + 1 - az : az - z) * tdz : Infinity;
  for (let i = 0; i < 128; i++) {
    if (x === ex && y === ey && z === ez) return true;
    if (w.isSolid(x, y, z)) return false;
    if (tmx < tmy && tmx < tmz) {
      x += stepX;
      tmx += tdx;
    } else if (tmy < tmz) {
      y += stepY;
      tmy += tdy;
    } else {
      z += stepZ;
      tmz += tdz;
    }
  }
  return true;
}
