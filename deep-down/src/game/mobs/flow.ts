import { floorNear, type SolidFn } from './nav';

/**
 * The way to the explorer through the caves (round 3, the second MOBS): a breadth-first flood over
 * the open cells round the explorer (6-connected, from its feet and head), each cell holding its
 * distance in steps. A hunter that cannot go straight (a wall, a corner, a pillar between them)
 * follows it downhill and comes round; the spawner places hunters only on cells it reached (never
 * walled off in the next tunnel). One field per simulation, rebuilt about once a second while
 * monsters hunt (about a millisecond on the real strata); its buffers are reused.
 */
export class FlowField {
  ox = 0;
  oy = 0;
  oz = 0;
  /** Where it was built from and when (sim clock); `path` its reach in steps. */
  x = 0;
  y = 0;
  z = 0;
  at = -Infinity;
  path = 0;
  cells = 0;
  private w = 0;
  private h = 0;
  private gen = 0;
  private stamp = new Uint32Array(0);
  private dist = new Uint8Array(0);
  private queue = new Int32Array(0);

  get ready(): boolean {
    return this.cells > 0;
  }

  /** Flood from (x, y, z) feet up to `path` steps out and `up` cells above and below. */
  build(solid: SolidFn, x: number, y: number, z: number, path: number, at: number, up = 10): void {
    const W = path * 2 + 1;
    const H = up * 2 + 1;
    const size = W * W * H;
    if (this.stamp.length < size) {
      this.stamp = new Uint32Array(size);
      this.dist = new Uint8Array(size);
      this.queue = new Int32Array(size);
      this.gen = 0;
    }
    this.w = W;
    this.h = H;
    this.path = path;
    this.x = x;
    this.y = y;
    this.z = z;
    this.at = at;
    const ox = (this.ox = Math.floor(x) - path);
    const oy = (this.oy = Math.floor(y) - up);
    const oz = (this.oz = Math.floor(z) - path);
    const stamp = this.stamp;
    const dist = this.dist;
    const q = this.queue;
    const gen = ++this.gen;
    const WW = W * W;
    let tail = 0;
    const seed = (cx: number, cy: number, cz: number) => {
      const lx = cx - ox;
      const ly = cy - oy;
      const lz = cz - oz;
      if (lx < 0 || ly < 0 || lz < 0 || lx >= W || ly >= H || lz >= W) return;
      const i = lx + W * lz + WW * ly;
      if (stamp[i] === gen || solid(cx, cy, cz)) return;
      stamp[i] = gen;
      dist[i] = 0;
      q[tail++] = i;
    };
    seed(Math.floor(x), Math.floor(y), Math.floor(z));
    seed(Math.floor(x), Math.floor(y) + 1, Math.floor(z));
    let head = 0;
    for (let step = 1; step <= path && head < tail; step++) {
      const end = tail;
      for (; head < end; head++) {
        const i = q[head];
        const ly = (i / WW) | 0;
        const r = i - ly * WW;
        const lz = (r / W) | 0;
        const lx = r - lz * W;
        const cx = lx + ox;
        const cy = ly + oy;
        const cz = lz + oz;
        if (lx + 1 < W && stamp[i + 1] !== gen && !solid(cx + 1, cy, cz)) {
          stamp[i + 1] = gen;
          dist[i + 1] = step;
          q[tail++] = i + 1;
        }
        if (lx > 0 && stamp[i - 1] !== gen && !solid(cx - 1, cy, cz)) {
          stamp[i - 1] = gen;
          dist[i - 1] = step;
          q[tail++] = i - 1;
        }
        if (lz + 1 < W && stamp[i + W] !== gen && !solid(cx, cy, cz + 1)) {
          stamp[i + W] = gen;
          dist[i + W] = step;
          q[tail++] = i + W;
        }
        if (lz > 0 && stamp[i - W] !== gen && !solid(cx, cy, cz - 1)) {
          stamp[i - W] = gen;
          dist[i - W] = step;
          q[tail++] = i - W;
        }
        if (ly + 1 < H && stamp[i + WW] !== gen && !solid(cx, cy + 1, cz)) {
          stamp[i + WW] = gen;
          dist[i + WW] = step;
          q[tail++] = i + WW;
        }
        if (ly > 0 && stamp[i - WW] !== gen && !solid(cx, cy - 1, cz)) {
          stamp[i - WW] = gen;
          dist[i - WW] = step;
          q[tail++] = i - WW;
        }
      }
    }
    this.cells = tail;
  }

  /** Steps from a cell to the explorer, or 255 when the flood did not reach it. */
  distAt(x: number, y: number, z: number): number {
    const lx = Math.floor(x) - this.ox;
    const ly = Math.floor(y) - this.oy;
    const lz = Math.floor(z) - this.oz;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.w || ly >= this.h || lz >= this.w) return 255;
    const i = lx + this.w * lz + this.w * this.w * ly;
    return this.stamp[i] === this.gen ? this.dist[i] : 255;
  }

  /** Joined to the explorer through the air within `max` steps (default: its whole reach). */
  has(x: number, y: number, z: number, max = this.path): boolean {
    return this.distAt(x, y, z) <= max;
  }

  /**
   * A walker's next column downhill from its feet (one of the 8 round it, a step up or down, never
   * cutting a corner), as the point to walk to. @returns false when none is nearer the explorer.
   */
  walkerStep(solid: SolidFn, foot: { x: number; y: number; z: number }, height: number, out: { x: number; z: number }): boolean {
    const fx = Math.floor(foot.x);
    const fy = Math.floor(foot.y + 0.01);
    const fz = Math.floor(foot.z);
    // Strictly nearer than where it stands (a walker on an unreached cell takes any reached one).
    let best = this.distAt(fx, fy, fz);
    let found = false;
    for (let k = 0; k < 8; k++) floors[k] = floorNear(solid, fx + NX[k], fy, fz + NZ[k], height, 2);
    for (let k = 0; k < 8; k++) {
      const fyN = floors[k];
      if (fyN === null) continue;
      // A diagonal only where both sides are open (no corner cut through rock).
      if (k >= 4 && (floors[DIAG_A[k - 4]] === null || floors[DIAG_B[k - 4]] === null)) continue;
      const d = Math.min(this.distAt(fx + NX[k], fyN, fz + NZ[k]), this.distAt(fx + NX[k], fyN + 1, fz + NZ[k]));
      if (d < best) {
        best = d;
        out.x = fx + NX[k] + 0.5;
        out.z = fz + NZ[k] + 0.5;
        found = true;
      }
    }
    return found;
  }

  /** A flier's next open cell downhill (one of the 26 round it), its centre into `out`. @returns false when none is nearer. */
  airStep(solid: SolidFn, p: { x: number; y: number; z: number }, out: { x: number; y: number; z: number }): boolean {
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const cz = Math.floor(p.z);
    let best = this.distAt(cx, cy, cz);
    let found = false;
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy && !dz) continue;
          const d = this.distAt(cx + dx, cy + dy, cz + dz);
          if (d >= best || d === 255) continue;
          // Diagonals only through open cells.
          if ((dx && solid(cx + dx, cy, cz)) || (dy && solid(cx, cy + dy, cz)) || (dz && solid(cx, cy, cz + dz))) continue;
          best = d;
          out.x = cx + dx + 0.5;
          out.y = cy + dy + 0.5;
          out.z = cz + dz + 0.5;
          found = true;
        }
    return found;
  }
}

/** The 8 columns round a walker: the 4 sides first, then the diagonals (and the two sides each diagonal passes). */
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NZ = [0, 0, 1, -1, 1, -1, 1, -1];
const DIAG_A = [0, 0, 1, 1];
const DIAG_B = [2, 3, 2, 3];
/** Scratch for a walker's neighbour floors (no allocation per step). */
const floors: Array<number | null> = [null, null, null, null, null, null, null, null];
