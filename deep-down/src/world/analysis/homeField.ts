import { HOME } from '../../config/balance';
import { SOLID } from '../../config/blocks';
import type { Region } from '../gen/types';
import type { VoxelWorld } from '../VoxelWorld';

/** An extra one-way edge (a rope ride, a hoist): `from` reaches `to` in `cost` walking steps. */
export interface FieldEdge {
  from: number;
  to: number;
  cost: number;
}

/**
 * Walking-distance field toward a target (camp, or the pack left behind).
 *
 * dist[cell] is the number of moves an explorer at that standable cell needs to reach the
 * target, using the moves of world/analysis/reachability (walk to a 4-neighbour, step up one
 * block, drop at most HOME.maxDrop blocks) plus any extra edges (rides). -1 means the target
 * cannot be walked to from there. It is a breadth-first search backwards from the target over
 * the predecessors of each cell, level by level, so extra edges may cost more than one step.
 *
 * One Int32Array covers the whole volume and is reused: a recompute only resets the cells the
 * previous one touched, so it costs time proportional to the walkable area, not the volume.
 */
export class HomeField {
  readonly dist: Int32Array;
  /** Milliseconds the last compute took. */
  lastMs = 0;
  /** Cells with a distance (the walkable area that can reach the target). */
  size = 0;
  private touched: number[] = [];
  private readonly edgesTo = new Map<number, FieldEdge[]>();
  private readonly edgesFrom = new Map<number, FieldEdge[]>();
  private readonly sx: number;
  private readonly sxy: number;

  constructor(
    private readonly world: VoxelWorld,
    private readonly maxDrop: number = HOME.maxDrop,
  ) {
    this.dist = new Int32Array(world.sx * world.sy * world.sz).fill(-1);
    this.sx = world.sx;
    this.sxy = world.sx * world.sy;
  }

  /** Add a one-way edge (a ride) costing `costSteps` (rounded up to whole steps, at least 1). */
  addEdge(from: readonly [number, number, number], to: readonly [number, number, number], costSteps: number): void {
    const e: FieldEdge = { from: this.world.index(from[0], from[1], from[2]), to: this.world.index(to[0], to[1], to[2]), cost: Math.max(1, Math.ceil(costSteps)) };
    push(this.edgesTo, e.to, e);
    push(this.edgesFrom, e.from, e);
  }

  clearEdges(): void {
    this.edgesTo.clear();
    this.edgesFrom.clear();
  }

  /** Distance field toward every standable cell inside `r` (cell centres in the box, feet height in range). */
  computeToRegion(r: Region): number {
    const seeds: number[] = [];
    const w = this.world;
    const x0 = Math.max(1, Math.ceil(r.min[0] - 0.5));
    const x1 = Math.min(w.sx - 2, Math.floor(r.max[0] - 0.5));
    const y0 = Math.max(1, Math.ceil(r.min[1]));
    const y1 = Math.min(w.sy - 3, Math.floor(r.max[1]));
    const z0 = Math.max(1, Math.ceil(r.min[2] - 0.5));
    const z1 = Math.min(w.sz - 2, Math.floor(r.max[2] - 0.5));
    for (let z = z0; z <= z1; z++)
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const i = w.index(x, y, z);
          if (this.standableAt(i)) seeds.push(i);
        }
    return this.compute(seeds);
  }

  /** Distance field toward one cell (and nothing else). */
  computeToCell(x: number, y: number, z: number): number {
    const w = this.world;
    if (!w.inBounds(x, y, z)) return this.compute([]);
    return this.compute([w.index(x, y, z)]);
  }

  /** Breadth-first search backwards from `seeds` (distance 0). @returns the time taken in ms. */
  compute(seeds: readonly number[]): number {
    const t0 = performanceNow();
    const dist = this.dist;
    for (const i of this.touched) dist[i] = -1;
    const touched: number[] = [];
    const blocks = this.world.blocks;
    const S = SOLID;
    const sx = this.sx;
    const sxy = this.sxy;
    const sy = this.world.sy;
    const maxDrop = this.maxDrop;
    const dirs = [1, -1, sxy, -sxy];
    let frontier: number[] = [];
    for (const i of seeds) {
      if (dist[i] !== -1) continue;
      dist[i] = 0;
      touched.push(i);
      frontier.push(i);
    }
    // Ride edges land in later levels: pending[level] holds cells first offered at that level.
    const pending = new Map<number, number[]>();
    const hasEdges = this.edgesTo.size > 0;
    const standable = (i: number) => !S[blocks[i]] && !S[blocks[i + sx]] && S[blocks[i - sx]] === 1;
    let level = 0;
    while (frontier.length > 0 || pending.size > 0) {
      const next: number[] = [];
      const nd = level + 1;
      const offer = (p: number) => {
        if (dist[p] !== -1) return;
        dist[p] = nd;
        touched.push(p);
        next.push(p);
      };
      for (let f = 0; f < frontier.length; f++) {
        const c = frontier[f];
        const y = Math.floor(c / sx) % sy;
        for (let k = 0; k < 4; k++) {
          const n = c + dirs[k];
          // (a) walk in from the same level.
          if (standable(n)) offer(n);
          // (b) step up into c from one level below (needs headroom over the lower cell).
          if (y >= 2) {
            const lower = n - sx;
            if (standable(lower) && !S[blocks[n + sx]]) offer(lower);
          }
          // (c) drop into c's column from d levels above: c's column must be open up to the
          // faller's head (y + d + 1), so c is the first floor the fall finds.
          for (let d = 1; d <= maxDrop; d++) {
            if (y + d + 2 >= sy) break;
            const colTop = c + (d + 1) * sx;
            if (S[blocks[colTop]] || S[blocks[c + d * sx]]) break;
            const p = n + d * sx;
            if (standable(p)) offer(p);
          }
        }
        if (hasEdges) {
          const into = this.edgesTo.get(c);
          if (into) {
            for (const e of into) {
              const at = level + e.cost;
              if (dist[e.from] !== -1 && dist[e.from] <= at) continue;
              let list = pending.get(at);
              if (!list) pending.set(at, (list = []));
              list.push(e.from);
            }
          }
        }
      }
      const due = pending.get(nd);
      if (due) {
        pending.delete(nd);
        for (const p of due) offer(p);
      }
      frontier = next;
      level = nd;
      if (frontier.length === 0 && pending.size > 0) {
        // Jump straight to the next level that has a ride landing.
        let min = Infinity;
        for (const k of pending.keys()) if (k < min) min = k;
        level = min - 1;
      }
    }
    this.touched = touched;
    this.size = touched.length;
    this.lastMs = performanceNow() - t0;
    return this.lastMs;
  }

  /** Distance at a cell, or -1. */
  at(x: number, y: number, z: number): number {
    const w = this.world;
    return w.inBounds(x, y, z) ? this.dist[w.index(x, y, z)] : -1;
  }

  /**
   * The field cell an explorer whose feet are at (x, y, z) stands in: the feet cell, or the
   * nearest one with a distance a little above or below (stairs, jumps) or one column over.
   * @returns the cell index, or -1 when no cell nearby has a distance.
   */
  cellNear(x: number, y: number, z: number): number {
    const w = this.world;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const cy = Math.floor(y + 0.2);
    for (let r = 0; r <= 1; r++) {
      let best = -1;
      let bestScore = Infinity;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (r > 0 && Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
          for (const dy of DY_ORDER) {
            const xx = cx + dx;
            const yy = cy + dy;
            const zz = cz + dz;
            if (!w.inBounds(xx, yy, zz)) continue;
            const i = w.index(xx, yy, zz);
            const d = this.dist[i];
            if (d < 0) continue;
            const off = Math.hypot(xx + 0.5 - x, (yy - y) * 0.5, zz + 0.5 - z);
            if (off < bestScore) {
              bestScore = off;
              best = i;
            }
          }
        }
      if (best >= 0) return best;
    }
    return -1;
  }

  /**
   * Follow the field downhill `steps` moves from cell `i` (the steepest descent: each move goes
   * to the successor with the lowest distance). @returns the cell reached (i itself at the target).
   */
  descend(i: number, steps: number): number {
    let c = i;
    for (let s = 0; s < steps; s++) {
      const n = this.downhill(c);
      if (n < 0) break;
      c = n;
    }
    return c;
  }

  /** The successor of cell `c` (a cell one forward move away) with the lowest distance, or -1. */
  downhill(c: number): number {
    const dist = this.dist;
    const here = dist[c];
    if (here <= 0) return -1;
    const blocks = this.world.blocks;
    const S = SOLID;
    const sx = this.sx;
    const sy = this.world.sy;
    const y = Math.floor(c / sx) % sy;
    let best = -1;
    let bestD = here;
    const consider = (n: number) => {
      const d = dist[n];
      if (d >= 0 && d < bestD) {
        bestD = d;
        best = n;
      }
    };
    const standable = (i: number) => !S[blocks[i]] && !S[blocks[i + sx]] && S[blocks[i - sx]] === 1;
    for (const dir of [1, -1, this.sxy, -this.sxy]) {
      const n = c + dir;
      if (standable(n)) consider(n);
      if (y + 2 < sy && !S[blocks[c + 2 * sx]] && standable(n + sx)) consider(n + sx);
      if (!S[blocks[n]] && !S[blocks[n + sx]]) {
        for (let d = 1; d <= this.maxDrop && y - d >= 1; d++) {
          const m = n - d * sx;
          if (S[blocks[m]]) break;
          if (standable(m)) {
            consider(m);
            break;
          }
        }
      }
    }
    const rides = this.edgesFrom.get(c);
    if (rides) for (const e of rides) consider(e.to);
    return best;
  }

  /** Cell index -> [x, y, z]. */
  cellXYZ(i: number): [number, number, number] {
    const sx = this.sx;
    const sy = this.world.sy;
    return [i % sx, Math.floor(i / sx) % sy, Math.floor(i / this.sxy)];
  }

  private standableAt(i: number): boolean {
    const b = this.world.blocks;
    return !SOLID[b[i]] && !SOLID[b[i + this.sx]] && SOLID[b[i - this.sx]] === 1;
  }
}

/** Seconds of walking for `steps` field steps (HOME.secondsPerStep each). */
export function walkSeconds(steps: number): number {
  return steps * HOME.secondsPerStep;
}

const DY_ORDER = [0, 1, -1, 2, -2, -3] as const;

function push(m: Map<number, FieldEdge[]>, k: number, e: FieldEdge): void {
  const l = m.get(k);
  if (l) l.push(e);
  else m.set(k, [e]);
}

function performanceNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * The cells an explorer can walk to from a start cell (the forward moves of reachability, with
 * the same fast reuse as HomeField): reach[cell] = 1. Equal to reachableCells() on the same
 * world; kept current while the world is mined (the pack left behind must lie on one).
 */
export class ReachSet {
  readonly reach: Uint8Array;
  lastMs = 0;
  size = 0;
  private touched: number[] = [];
  /** Rides (world/gen/features): standing on `from` reaches `to`. */
  private readonly jumps = new Map<number, number[]>();
  private readonly sx: number;
  private readonly sxy: number;

  constructor(
    private readonly world: VoxelWorld,
    private readonly maxDrop: number = HOME.maxDrop,
  ) {
    this.reach = new Uint8Array(world.sx * world.sy * world.sz);
    this.sx = world.sx;
    this.sxy = world.sx * world.sy;
  }

  /** Add a one-way ride from one stand cell to another. */
  addEdge(from: readonly [number, number, number], to: readonly [number, number, number]): void {
    const w = this.world;
    const a = w.index(from[0], from[1], from[2]);
    const list = this.jumps.get(a);
    const b = w.index(to[0], to[1], to[2]);
    if (list) list.push(b);
    else this.jumps.set(a, [b]);
  }

  clearEdges(): void {
    this.jumps.clear();
  }

  /** Recompute from the standable cell at or below (x, y, z), as reachableCells does. @returns ms. */
  computeFrom(x: number, y: number, z: number): number {
    const t0 = performanceNow();
    const reach = this.reach;
    for (const i of this.touched) reach[i] = 0;
    const touched: number[] = [];
    const w = this.world;
    const blocks = w.blocks;
    const S = SOLID;
    const sx = this.sx;
    const sy = w.sy;
    const standable = (i: number) => !S[blocks[i]] && !S[blocks[i + sx]] && S[blocks[i - sx]] === 1;
    let y0 = y;
    while (y0 > 1 && w.inBounds(x, y0, z) && !standable(w.index(x, y0, z))) y0--;
    if (w.inBounds(x, y0, z) && standable(w.index(x, y0, z))) {
      const queue: number[] = [w.index(x, y0, z)];
      reach[queue[0]] = 1;
      touched.push(queue[0]);
      const add = (i: number) => {
        if (reach[i]) return;
        reach[i] = 1;
        touched.push(i);
        queue.push(i);
      };
      const dirs = [1, -1, this.sxy, -this.sxy];
      while (queue.length) {
        const c = queue.pop()!;
        const cy = Math.floor(c / sx) % sy;
        const ride = this.jumps.size ? this.jumps.get(c) : undefined;
        if (ride) for (const j of ride) add(j);
        for (const dir of dirs) {
          const n = c + dir;
          if (standable(n)) add(n);
          if (cy + 2 < sy && !S[blocks[c + 2 * sx]] && standable(n + sx)) add(n + sx);
          if (!S[blocks[n]] && !S[blocks[n + sx]]) {
            for (let d = 1; d <= this.maxDrop && cy - d >= 1; d++) {
              const m = n - d * sx;
              if (S[blocks[m]]) break;
              if (standable(m)) {
                add(m);
                break;
              }
            }
          }
        }
      }
    }
    this.touched = touched;
    this.size = touched.length;
    this.lastMs = performanceNow() - t0;
    return this.lastMs;
  }

  has(x: number, y: number, z: number): boolean {
    const w = this.world;
    return w.inBounds(x, y, z) && this.reach[w.index(x, y, z)] === 1;
  }
}
