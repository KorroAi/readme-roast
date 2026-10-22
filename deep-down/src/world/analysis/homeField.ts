import { HOME } from '../../config/balance';
import { B, CLIMB, SOLID } from '../../config/blocks';
import type { Region } from '../gen/types';
import type { VoxelWorld } from '../VoxelWorld';

/**
 * Round 3 (WORLD): the walk model of the strata (world/gen/strata/traps.ts): a cell is a state when the
 * explorer stands there (room for the body, solid ground that is not lava) or hangs there (room for
 * the body and a ladder or a rope at the feet or the chest). Ladders and ropes are climbed up and down
 * and catch a drop. A world with no ladder, rope or lava (the old hand-made one) walks exactly as before.
 */
const stands = (b: Uint8Array, sx: number, i: number): boolean => {
  const below = b[i - sx];
  return SOLID[b[i]] === 0 && SOLID[b[i + sx]] === 0 && SOLID[below] === 1 && below !== B.LAVA;
};
const hangs = (b: Uint8Array, sx: number, i: number): boolean => SOLID[b[i]] === 0 && SOLID[b[i + sx]] === 0 && (CLIMB[b[i]] === 1 || CLIMB[b[i + sx]] === 1);
const isState = (b: Uint8Array, sx: number, i: number): boolean => stands(b, sx, i) || hangs(b, sx, i);

/**
 * The forward moves from state c at height y (traps.ts forEachMove): walk to a 4-neighbour state, else
 * step up one (headroom over c), else drop up to maxDrop into the neighbour column; on a ladder or a
 * rope also climb up, or down to the first state below.
 */
function forwardMoves(b: Uint8Array, sx: number, sy: number, sxy: number, c: number, y: number, maxDrop: number, emit: (n: number) => void): void {
  if (y < 1 || y > sy - 3) return;
  for (const dir of [1, -1, sxy, -sxy]) {
    const n = c + dir;
    if (isState(b, sx, n)) {
      emit(n);
      continue;
    }
    if (y + 1 <= sy - 3 && SOLID[b[c + 2 * sx]] === 0 && isState(b, sx, n + sx)) {
      emit(n + sx);
      continue;
    }
    if (SOLID[b[n]] === 0 && SOLID[b[n + sx]] === 0) {
      for (let d = 1; d <= maxDrop && y - d >= 1; d++) {
        const m = n - d * sx;
        if (SOLID[b[m]]) break;
        if (isState(b, sx, m)) {
          emit(m);
          break;
        }
      }
    }
  }
  if (hangs(b, sx, c)) {
    if (y + 1 <= sy - 3 && isState(b, sx, c + sx)) emit(c + sx);
    for (let d = 1; d <= maxDrop && y - d >= 1; d++) {
      const m = c - d * sx;
      if (SOLID[b[m]]) break;
      if (isState(b, sx, m)) {
        emit(m);
        break;
      }
    }
  }
}

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
    const state = (i: number) => isState(blocks, sx, i);
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
        // The inverse of forwardMoves (traps.ts homewardStates, held equal to its oracle by the tests).
        for (let k = 0; k < 4; k++) {
          const n = c + dirs[k];
          // (a) walk in from the same level.
          if (y >= 1 && y <= sy - 3 && dist[n] === -1 && state(n)) offer(n);
          // (b) step up into c from one level below: headroom over the lower cell, and no state in c's
          // column at that level (the walk would take it).
          if (y >= 2) {
            const lower = n - sx;
            if (dist[lower] === -1 && state(lower) && !state(c - sx) && !S[blocks[n + sx]]) offer(lower);
          }
          // (c) drop into c's column from d levels above: the fall passes open cells that are no
          // state, enters where nothing stops it, and c is the first state it finds.
          for (let d = 1; d <= maxDrop; d++) {
            if (y + d > sy - 3) break;
            if (d > 1) {
              const mid = c + (d - 1) * sx;
              if (S[blocks[mid]] || state(mid)) break;
            }
            const entry = c + d * sx;
            if (S[blocks[entry]] || S[blocks[entry + sx]]) continue;
            const p = n + d * sx;
            if (dist[p] !== -1 || !state(p) || state(entry)) continue;
            if (y + d + 1 <= sy - 3 && !S[blocks[p + 2 * sx]] && state(entry + sx)) continue;
            offer(p);
          }
        }
        // (d) climb up into c from the ladder or rope just below.
        if (y >= 2 && dist[c - sx] === -1 && hangs(blocks, sx, c - sx)) offer(c - sx);
        // (e) climb down (or let go) from d higher in c's column: c is the first state below.
        for (let d = 1; d <= maxDrop; d++) {
          if (y + d > sy - 3) break;
          if (d > 1) {
            const mid = c + (d - 1) * sx;
            if (S[blocks[mid]] || state(mid)) break;
          }
          const p = c + d * sx;
          if (dist[p] === -1 && hangs(blocks, sx, p)) offer(p);
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
    forwardMoves(blocks, sx, sy, this.sxy, c, y, this.maxDrop, consider);
    void S;
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

  /** A state of the walk model (standing, or hanging on a ladder or a rope). */
  private standableAt(i: number): boolean {
    return isState(this.world.blocks, this.sx, i);
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
    const standable = (i: number) => isState(blocks, sx, i);
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
      while (queue.length) {
        const c = queue.pop()!;
        const cy = Math.floor(c / sx) % sy;
        const ride = this.jumps.size ? this.jumps.get(c) : undefined;
        if (ride) for (const j of ride) add(j);
        forwardMoves(blocks, sx, sy, this.sxy, c, cy, this.maxDrop, add);
      }
    }
    void S;
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
