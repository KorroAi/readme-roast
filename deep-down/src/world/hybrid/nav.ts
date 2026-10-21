// The walkability grid of Explore (W1-LEAD §3 and §5: "per-voxel walkable flags, step-up links, ladder and rope links,
// and a pure findPath(from, to) that 1D calls"). Pure TypeScript over any voxel reader, so it runs in Node tests, the
// slab worker and the game alike.
//
// A FEET POINT is a world point in metres on a floor surface: x and z at a cell centre, y the top of the floor voxel
// (a multiple of 0.5). A cell is STANDABLE when the voxel under it is solid and the 4 voxels above it (2.0 m) are open;
// it is WALKABLE when it is standable and no wall stands within a body's radius (its 8 neighbours are open from 0.5 m
// to 2.0 m above its floor, so a step at foot level is allowed but a wall is not: the eye stays ≥ 0.5 m from rock).
// Moves go to the 8 neighbours with a floor change of at most one voxel (0.5 m: climbed smoothly, no bob), never
// cutting a corner; ladders and ropes are explicit links ridden on rails.
//
// CONTRACT (W1, 1B, published at 0:45): `NavGrid` implements 1D's `NavLike` (src/game/hybrid/explore.ts):
// `walkableAt(x, y, z)`, `findPath(from, to)` and `cell`.

import { SOLID } from '../../config/blocks';
import { VOXEL, mid, vox, type V3 } from './grid';
import type { NavLinkInfo } from './kits/types';

/** Anything that reads voxels by world voxel coordinates (VoxelRing, a slab-local grid, a test grid). */
export interface VoxelReader {
  get(x: number, j: number, z: number): number;
}

/** Voxel bounds (inclusive min, exclusive max). */
export interface VoxelBounds {
  x0: number;
  x1: number;
  j0: number;
  j1: number;
  z0: number;
  z1: number;
}

/** Headroom in voxels (2.0 m) and the clearance band checked around a cell (rows 1..3 above its floor). */
export const HEADROOM = 4;
const CLEAR_FROM = 1;
const CLEAR_TO = 3;

export interface NavOptions {
  links?: ReadonlyArray<NavLinkInfo>;
  /** Floor discs nobody walks through (crates, barrels, plinths, chests): centre (m) and radius (m). */
  blockers?: ReadonlyArray<{ pos: V3; r: number }>;
  /** Extra solidity test (e.g. FACE_PLUG treated as solid already by SOLID). */
  solid?: (id: number) => boolean;
}

/** A neighbour step: dx, dz and its base cost. */
const STEPS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** A tiny binary min-heap of (key, priority) for A*. */
class Heap {
  private keys: number[] = [];
  private pri: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(k: number, p: number): void {
    const keys = this.keys;
    const pri = this.pri;
    let i = keys.length;
    keys.push(k);
    pri.push(p);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pri[parent] <= p) break;
      keys[i] = keys[parent];
      pri[i] = pri[parent];
      i = parent;
    }
    keys[i] = k;
    pri[i] = p;
  }
  pop(): number {
    const keys = this.keys;
    const pri = this.pri;
    const top = keys[0];
    const lk = keys.pop()!;
    const lp = pri.pop()!;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && pri[r] < pri[l] ? r : l;
        if (pri[c] >= lp) break;
        keys[i] = keys[c];
        pri[i] = pri[c];
        i = c;
      }
      keys[i] = lk;
      pri[i] = lp;
    }
    return top;
  }
}

/**
 * The walkability of one region (a node's chamber, its drift and exits, or the camp), built from voxels. Rebuild a
 * sub-box after an edit (a secret broken open, a slice dug) with `rebuild(box)`.
 */
export class NavGrid {
  /** The grid cell (m). */
  readonly cell = VOXEL;
  readonly bounds: VoxelBounds;
  private readonly nx: number;
  private readonly ny: number;
  private readonly nz: number;
  /** 1 = standable, 2 = walkable (standable and clear), 0 = neither; per voxel (x, feet row j, z) of the bounds. */
  readonly flags: Uint8Array;
  /** Blocked by a prop disc. */
  private readonly blocked: Uint8Array;
  /** Link adjacency: cell index → list of [other cell index, cost]. */
  private readonly linkMap = new Map<number, Array<[number, number]>>();
  private readonly isSolid: (id: number) => boolean;

  constructor(
    private readonly reader: VoxelReader,
    bounds: VoxelBounds,
    private readonly opts: NavOptions = {},
  ) {
    this.bounds = { ...bounds };
    this.nx = bounds.x1 - bounds.x0;
    this.ny = bounds.j1 - bounds.j0;
    this.nz = bounds.z1 - bounds.z0;
    this.flags = new Uint8Array(this.nx * this.ny * this.nz);
    this.blocked = new Uint8Array(this.nx * this.ny * this.nz);
    this.isSolid = opts.solid ?? ((id) => SOLID[id] === 1);
    this.rebuild();
  }

  private index(x: number, j: number, z: number): number {
    return x - this.bounds.x0 + this.nx * (j - this.bounds.j0 + this.ny * (z - this.bounds.z0));
  }

  private inside(x: number, j: number, z: number): boolean {
    const b = this.bounds;
    return x >= b.x0 && x < b.x1 && j >= b.j0 && j < b.j1 && z >= b.z0 && z < b.z1;
  }

  private solid(x: number, j: number, z: number): boolean {
    return this.isSolid(this.reader.get(x, j, z));
  }

  /** Standable: solid floor under the feet voxel, HEADROOM open voxels from it up. */
  private standable(x: number, j: number, z: number): boolean {
    if (!this.solid(x, j - 1, z)) return false;
    for (let h = 0; h < HEADROOM; h++) if (this.solid(x, j + h, z)) return false;
    return true;
  }

  /** No wall within a body's radius: the 8 neighbours are open from 0.5 m to 2.0 m above the floor. */
  private clear(x: number, j: number, z: number): boolean {
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        for (let h = CLEAR_FROM; h <= CLEAR_TO; h++) if (this.solid(x + dx, j + h, z + dz)) return false;
      }
    return true;
  }

  /** Recompute the flags in a voxel sub-box (default: everything), then the prop blockers and the links. */
  rebuild(box: Partial<VoxelBounds> = {}): void {
    const b = this.bounds;
    const x0 = Math.max(b.x0, box.x0 ?? b.x0);
    const x1 = Math.min(b.x1, box.x1 ?? b.x1);
    const j0 = Math.max(b.j0, box.j0 ?? b.j0);
    const j1 = Math.min(b.j1, box.j1 ?? b.j1);
    const z0 = Math.max(b.z0, box.z0 ?? b.z0);
    const z1 = Math.min(b.z1, box.z1 ?? b.z1);
    for (let z = z0; z < z1; z++)
      for (let x = x0; x < x1; x++)
        for (let j = j0; j < j1; j++) {
          const i = this.index(x, j, z);
          this.flags[i] = this.standable(x, j, z) ? (this.clear(x, j, z) ? 2 : 1) : 0;
        }
    this.blocked.fill(0);
    for (const bl of this.opts.blockers ?? []) {
      const r = bl.r + 0.2;
      const cx0 = vox(bl.pos.x - r);
      const cx1 = vox(bl.pos.x + r);
      const cz0 = vox(bl.pos.z - r);
      const cz1 = vox(bl.pos.z + r);
      const jf = Math.round(bl.pos.y / VOXEL);
      for (let z = cz0; z <= cz1; z++)
        for (let x = cx0; x <= cx1; x++) {
          if (Math.hypot(mid(x) - bl.pos.x, mid(z) - bl.pos.z) > r) continue;
          for (let j = jf - 1; j <= jf + 1; j++) if (this.inside(x, j, z)) this.blocked[this.index(x, j, z)] = 1;
        }
    }
    this.linkMap.clear();
    for (const l of this.opts.links ?? []) {
      const a = this.cellOf(l.a);
      const c = this.cellOf(l.b);
      if (a < 0 || c < 0) continue;
      const cost = Math.hypot(l.a.x - l.b.x, l.a.y - l.b.y, l.a.z - l.b.z) * 1.5 + 1;
      this.addLink(a, c, cost);
      this.addLink(c, a, cost);
    }
  }

  private addLink(a: number, b: number, cost: number): void {
    const l = this.linkMap.get(a);
    if (l) l.push([b, cost]);
    else this.linkMap.set(a, [[b, cost]]);
  }

  /** The cell index of a feet point, or -1 outside the bounds. */
  private cellOf(p: V3): number {
    const x = vox(p.x);
    const z = vox(p.z);
    const j = Math.round(p.y / VOXEL);
    return this.inside(x, j, z) ? this.index(x, j, z) : -1;
  }

  private walkIdx(i: number): boolean {
    return this.flags[i] === 2 && this.blocked[i] === 0;
  }

  /** 1D's NavLike: can a body stand at the cell holding this feet point (x, z in the cell; y the floor surface)? */
  walkableAt(x: number, y: number, z: number): boolean {
    const i = this.cellOf({ x, y, z });
    return i >= 0 && this.walkIdx(i);
  }

  /** The feet point of the walkable cell nearest to p within maxR (m), searching floors from 1 m above p down to 2.5 m below. */
  nearestWalkable(p: V3, maxR = 1.5): V3 | null {
    const cx = vox(p.x);
    const cz = vox(p.z);
    const jTop = Math.round(p.y / VOXEL) + 2;
    const jBot = Math.round(p.y / VOXEL) - 5;
    const R = Math.ceil(maxR / VOXEL);
    let best: V3 | null = null;
    let bd = Infinity;
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        for (let j = jTop; j >= jBot; j--) {
          if (!this.inside(x, j, z) || !this.walkIdx(this.index(x, j, z))) continue;
          const q = { x: mid(x), y: j * VOXEL, z: mid(z) };
          const d = Math.hypot(q.x - p.x, (q.y - p.y) * 0.7, q.z - p.z);
          if (d < bd && d <= maxR + VOXEL) {
            bd = d;
            best = q;
          }
          break;
        }
      }
    return best;
  }

  /**
   * 1D's NavLike: the feet path from `from` to `to` over walkable cells (A*, 8 neighbours, ±0.5 m steps, no corner
   * cutting, links for ladders and ropes), or null when there is none. Both ends snap to the nearest walkable cell
   * within 1 m. The first point is the start cell, the last the goal cell.
   */
  findPath(from: V3, to: V3): V3[] | null {
    const a = this.walkIdx(Math.max(0, this.cellOf(from))) && this.cellOf(from) >= 0 ? from : this.nearestWalkable(from, 1.0);
    const b = this.walkIdx(Math.max(0, this.cellOf(to))) && this.cellOf(to) >= 0 ? to : this.nearestWalkable(to, 1.0);
    if (!a || !b) return null;
    const start = this.cellOf(a);
    const goal = this.cellOf(b);
    if (start < 0 || goal < 0) return null;
    if (start === goal) return [this.pointOf(start)];
    const nx = this.nx;
    const nxy = this.nx * this.ny;
    const gz = Math.floor(goal / nxy);
    const gj = Math.floor((goal - gz * nxy) / nx);
    const gx = goal - gz * nxy - gj * nx;
    const h = (i: number): number => {
      const z = Math.floor(i / nxy);
      const j = Math.floor((i - z * nxy) / nx);
      const x = i - z * nxy - j * nx;
      const dx = Math.abs(x - gx);
      const dz = Math.abs(z - gz);
      return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz) + Math.abs(j - gj) * 0.5;
    };
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const closed = new Set<number>();
    const open = new Heap();
    g.set(start, 0);
    open.push(start, h(start));
    let expanded = 0;
    const b0 = this.bounds;
    while (open.size) {
      const cur = open.pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > 200000) return null;
      const gc = g.get(cur)!;
      const cz = Math.floor(cur / nxy);
      const cj = Math.floor((cur - cz * nxy) / nx);
      const cx = cur - cz * nxy - cj * nx;
      const wx = cx + b0.x0;
      const wj = cj + b0.j0;
      const wz = cz + b0.z0;
      for (const [dx, dz, base] of STEPS) {
        const tx = wx + dx;
        const tz = wz + dz;
        for (const dj of [0, 1, -1]) {
          const tj = wj + dj;
          if (!this.inside(tx, tj, tz)) continue;
          const ti = this.index(tx, tj, tz);
          if (!this.walkIdx(ti)) continue;
          // A step up needs headroom over the current cell for the rise; a step down needs it over the target.
          if (dj === 1 && this.solid(wx, wj + HEADROOM, wz)) continue;
          if (dj === -1 && this.solid(tx, tj + HEADROOM, tz)) continue;
          // No corner cutting: a diagonal needs both orthogonal cells walkable at the current or the target level.
          if (dx && dz) {
            const okA = this.passable(wx + dx, wj, wz) || this.passable(wx + dx, tj, wz);
            const okB = this.passable(wx, wj, wz + dz) || this.passable(wx, tj, wz + dz);
            if (!okA || !okB) continue;
          }
          const ng = gc + base + (dj ? 0.35 : 0);
          if (ng < (g.get(ti) ?? Infinity)) {
            g.set(ti, ng);
            came.set(ti, cur);
            open.push(ti, ng + h(ti));
          }
          break;
        }
      }
      const links = this.linkMap.get(cur);
      if (links)
        for (const [ti, cost] of links) {
          if (!this.walkIdx(ti) && ti !== goal) continue;
          const ng = gc + cost;
          if (ng < (g.get(ti) ?? Infinity)) {
            g.set(ti, ng);
            came.set(ti, cur);
            open.push(ti, ng + h(ti));
          }
        }
    }
    if (!came.has(goal)) return null;
    const out: V3[] = [];
    for (let c: number | undefined = goal; c !== undefined; c = came.get(c)) {
      out.push(this.pointOf(c));
      if (c === start) break;
    }
    out.reverse();
    return out;
  }

  private passable(x: number, j: number, z: number): boolean {
    return this.inside(x, j, z) && this.walkIdx(this.index(x, j, z));
  }

  /** The feet point of a cell index. */
  private pointOf(i: number): V3 {
    const nx = this.nx;
    const nxy = this.nx * this.ny;
    const z = Math.floor(i / nxy);
    const j = Math.floor((i - z * nxy) / nx);
    const x = i - z * nxy - j * nx;
    return { x: mid(x + this.bounds.x0), y: (j + this.bounds.j0) * VOXEL, z: mid(z + this.bounds.z0) };
  }

  /** Every walkable feet point (fill-scan samples them; the tests check reachability). */
  walkableCells(): V3[] {
    const out: V3[] = [];
    for (let i = 0; i < this.flags.length; i++) if (this.walkIdx(i)) out.push(this.pointOf(i));
    return out;
  }

  /** The walkable cells reachable from a feet point (links included): the Explore space the player can really reach. */
  reachableFrom(from: V3): V3[] {
    const s0 = this.cellOf(from) >= 0 && this.walkIdx(this.cellOf(from)) ? from : this.nearestWalkable(from, 1.0);
    if (!s0) return [];
    const start = this.cellOf(s0);
    const seen = new Uint8Array(this.flags.length);
    const queue = [start];
    seen[start] = 1;
    const b0 = this.bounds;
    const nx = this.nx;
    const nxy = this.nx * this.ny;
    for (let q = 0; q < queue.length; q++) {
      const cur = queue[q];
      const cz = Math.floor(cur / nxy);
      const cj = Math.floor((cur - cz * nxy) / nx);
      const cx = cur - cz * nxy - cj * nx;
      for (const [dx, dz] of STEPS) {
        for (const dj of [0, 1, -1]) {
          const tx = cx + b0.x0 + dx;
          const tj = cj + b0.j0 + dj;
          const tz = cz + b0.z0 + dz;
          if (!this.passable(tx, tj, tz)) continue;
          if (dx && dz && !((this.passable(cx + b0.x0 + dx, cj + b0.j0, cz + b0.z0) || this.passable(cx + b0.x0 + dx, tj, cz + b0.z0)) && (this.passable(cx + b0.x0, cj + b0.j0, cz + b0.z0 + dz) || this.passable(cx + b0.x0, tj, cz + b0.z0 + dz)))) continue;
          const ti = this.index(tx, tj, tz);
          if (!seen[ti]) {
            seen[ti] = 1;
            queue.push(ti);
          }
          break;
        }
      }
      for (const [ti] of this.linkMap.get(cur) ?? [])
        if (!seen[ti] && this.walkIdx(ti)) {
          seen[ti] = 1;
          queue.push(ti);
        }
    }
    return queue.map((i) => this.pointOf(i));
  }
}

/** A walk path's length in metres. */
export function pathLengthM(pts: ReadonlyArray<V3>): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  return L;
}

/** The pure entry point of W1-LEAD §5: a path of feet points over a grid, or null. */
export function findPath(nav: NavGrid, from: V3, to: V3): V3[] | null {
  return nav.findPath(from, to);
}
