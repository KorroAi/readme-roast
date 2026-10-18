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

/**
 * Colored flood-fill light for static emitters (crystals, camp lamps, glyphs), stored as
 * RGBA8 per voxel: RGB = emitted light, A = "openness" (how much open space surrounds the
 * voxel), which the shader turns into a faint ambient fill so huge chambers read as huge.
 *
 * Propagation uses 18-connectivity (faces + edges) so pools of light are round rather than
 * diamond shaped. Diagonal steps require one open face neighbor so light never leaks
 * through a sealed corner.
 */
export class LightField {
  readonly data: Uint8Array;
  private readonly world: VoxelWorld;
  private queue: Int32Array;
  private qHead = 0;
  private qTail = 0;
  private qMask: number;
  private readonly faceOff: Int32Array;
  private readonly edgeOff: Int32Array;
  private readonly edgeA: Int32Array;
  private readonly edgeB: Int32Array;
  private readonly removalQueue: number[] = [];
  /** Bounding box of voxels changed by the last operation (for partial GPU upload). */
  readonly changed: Box3i = { x0: 0, y0: 0, z0: 0, x1: -1, y1: -1, z1: -1 };

  constructor(world: VoxelWorld) {
    this.world = world;
    this.data = new Uint8Array(world.sx * world.sy * world.sz * 4);
    const size = 1 << 21;
    this.queue = new Int32Array(size);
    this.qMask = size - 1;
    const sx = world.sx;
    const sxy = world.sx * world.sy;
    const off = (d: readonly [number, number, number]) => d[0] + d[1] * sx + d[2] * sxy;
    this.faceOff = Int32Array.from(FACE_DIRS.map(off));
    this.edgeOff = Int32Array.from(EDGE_DIRS.map(off));
    this.edgeA = new Int32Array(EDGE_DIRS.length);
    this.edgeB = new Int32Array(EDGE_DIRS.length);
    // An edge step (two non-zero components) is bounded by the two single-axis face steps.
    for (let i = 0; i < EDGE_DIRS.length; i++) {
      const [dx, dy, dz] = EDGE_DIRS[i];
      const comps: Array<[number, number, number]> = [];
      if (dx) comps.push([dx, 0, 0]);
      if (dy) comps.push([0, dy, 0]);
      if (dz) comps.push([0, 0, dz]);
      this.edgeA[i] = off(comps[0]);
      this.edgeB[i] = off(comps[1]);
    }
  }

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
    this.propagate(null);
    this.computeOpenness();
    this.changed.x0 = 0;
    this.changed.y0 = 0;
    this.changed.z0 = 0;
    this.changed.x1 = w.sx - 1;
    this.changed.y1 = w.sy - 1;
    this.changed.z1 = w.sz - 1;
  }

  /**
   * Update light after a voxel changed from `oldId` to the id now stored in the world.
   * Returns the bounding box of changed light texels (empty box if nothing changed).
   */
  onBlockChanged(x: number, y: number, z: number, oldId: number): Box3i {
    const w = this.world;
    const newId = w.get(x, y, z);
    this.resetChanged();
    const oldEmits = (EMIT_R[oldId] | EMIT_G[oldId] | EMIT_B[oldId]) !== 0;
    const newEmits = (EMIT_R[newId] | EMIT_G[newId] | EMIT_B[newId]) !== 0;
    const becameSolid = !SOLID[oldId] && SOLID[newId];
    if (becameSolid) {
      // Adding an occluder can darken anything its shadow reaches: rebuild locally (rare).
      this.recomputeBox({
        x0: x - LIGHT_REACH, y0: y - LIGHT_REACH, z0: z - LIGHT_REACH,
        x1: x + LIGHT_REACH, y1: y + LIGHT_REACH, z1: z + LIGHT_REACH,
      });
      return this.changed;
    }
    const i = w.index(x, y, z);
    const d = this.data;
    this.qHead = this.qTail = 0;
    if (oldEmits) this.removeLight(i, x, y, z);
    if (SOLID[oldId] && !SOLID[newId]) {
      // An occluder was removed: light can only increase. Pull light in from neighbors.
      d[i * 4] = 0;
      d[i * 4 + 1] = 0;
      d[i * 4 + 2] = 0;
      this.expand(x, y, z);
      this.pullFromNeighbors(i, x, y, z);
      if (d[i * 4] | d[i * 4 + 1] | d[i * 4 + 2]) this.push(i);
      // The opened voxel may also unblock diagonal steps between two of its face neighbors.
      for (let k = 0; k < 6; k++) {
        const [dx, dy, dz] = FACE_DIRS[k];
        if (!w.inBounds(x + dx, y + dy, z + dz)) continue;
        const n = i + this.faceOff[k];
        if (d[n * 4] | d[n * 4 + 1] | d[n * 4 + 2]) this.push(n);
      }
    }
    if (newEmits) {
      d[i * 4] = Math.max(d[i * 4], EMIT_R[newId]);
      d[i * 4 + 1] = Math.max(d[i * 4 + 1], EMIT_G[newId]);
      d[i * 4 + 2] = Math.max(d[i * 4 + 2], EMIT_B[newId]);
      this.expand(x, y, z);
      this.push(i);
    }
    this.propagate(null);
    return this.changed;
  }

  /**
   * Remove the light an emitter at voxel i contributed, per channel, then queue the
   * brighter frontier so other sources refill the cleared region. Generalizes the classic
   * voxel light-removal flood fill to our multiplicative decay: a neighbor is assumed lit
   * by the removed light when its value is no brighter than the decayed level reaching it.
   * Visits only voxels that the light actually reached (far fewer than a box rebuild).
   */
  private removeLight(i: number, x: number, y: number, z: number): void {
    const w = this.world;
    const d = this.data;
    const blocks = w.blocks;
    const sx = w.sx;
    const sy = w.sy;
    const sz = w.sz;
    const sxy = sx * sy;
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
        const cz = (idx / sxy) | 0;
        const rem = idx - cz * sxy;
        const cy = (rem / sx) | 0;
        const cx = rem - cy * sx;
        for (let k = 0; k < 18; k++) {
          const dir = k < 6 ? FACE_DIRS[k] : EDGE_DIRS[k - 6];
          const nx = cx + dir[0];
          const ny = cy + dir[1];
          const nz = cz + dir[2];
          if (nx < 0 || ny < 0 || nz < 0 || nx >= sx || ny >= sy || nz >= sz) continue;
          let n: number;
          let decayed: number;
          if (k < 6) {
            n = idx + this.faceOff[k];
            decayed = DECAY_FACE[lvl];
          } else {
            const e = k - 6;
            if (SOLID[blocks[idx + this.edgeA[e]]] && SOLID[blocks[idx + this.edgeB[e]]]) continue;
            n = idx + this.edgeOff[e];
            decayed = DECAY_EDGE[lvl];
          }
          const v = d[n * 4 + c];
          if (v === 0) continue;
          if (emitC[blocks[n]] === 0 && !SOLID[blocks[n]] && v <= decayed) {
            d[n * 4 + c] = 0;
            this.expand(nx, ny, nz);
            rq.push(n, v);
          } else {
            // Lit by another source (or an emitter itself): it will refill the gap.
            this.push(n);
          }
        }
      }
    }
  }

  /** Clear and rebuild light inside `box` (clamped), seeding from emitters inside and lit voxels just outside. */
  recomputeBox(box: Box3i): void {
    const w = this.world;
    const b = {
      x0: Math.max(0, box.x0), y0: Math.max(0, box.y0), z0: Math.max(0, box.z0),
      x1: Math.min(w.sx - 1, box.x1), y1: Math.min(w.sy - 1, box.y1), z1: Math.min(w.sz - 1, box.z1),
    };
    const d = this.data;
    const blocks = w.blocks;
    this.qHead = this.qTail = 0;
    for (let z = b.z0; z <= b.z1; z++)
      for (let y = b.y0; y <= b.y1; y++) {
        let i = w.index(b.x0, y, z);
        for (let x = b.x0; x <= b.x1; x++, i++) {
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
    // Seed from the one-voxel shell around the box: those values are still correct because
    // the box extends past the reach of any light that could have passed through the change.
    for (let z = b.z0 - 1; z <= b.z1 + 1; z++)
      for (let y = b.y0 - 1; y <= b.y1 + 1; y++)
        for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
          const inside = x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && z >= b.z0 && z <= b.z1;
          if (inside || !w.inBounds(x, y, z)) continue;
          const i = w.index(x, y, z);
          if (d[i * 4] | d[i * 4 + 1] | d[i * 4 + 2]) this.push(i);
        }
    this.changed.x0 = b.x0;
    this.changed.y0 = b.y0;
    this.changed.z0 = b.z0;
    this.changed.x1 = b.x1;
    this.changed.y1 = b.y1;
    this.changed.z1 = b.z1;
    this.propagate(b);
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
    const w = this.world;
    const d = this.data;
    const blocks = w.blocks;
    let r = 0;
    let g = 0;
    let bl = 0;
    for (let k = 0; k < 6; k++) {
      const [dx, dy, dz] = FACE_DIRS[k];
      if (!w.inBounds(x + dx, y + dy, z + dz)) continue;
      const n = i + this.faceOff[k];
      r = Math.max(r, DECAY_FACE[d[n * 4]]);
      g = Math.max(g, DECAY_FACE[d[n * 4 + 1]]);
      bl = Math.max(bl, DECAY_FACE[d[n * 4 + 2]]);
    }
    for (let k = 0; k < 12; k++) {
      const [dx, dy, dz] = EDGE_DIRS[k];
      if (!w.inBounds(x + dx, y + dy, z + dz)) continue;
      if (SOLID[blocks[i + this.edgeA[k]]] && SOLID[blocks[i + this.edgeB[k]]]) continue;
      const n = i + this.edgeOff[k];
      r = Math.max(r, DECAY_EDGE[d[n * 4]]);
      g = Math.max(g, DECAY_EDGE[d[n * 4 + 1]]);
      bl = Math.max(bl, DECAY_EDGE[d[n * 4 + 2]]);
    }
    d[i * 4] = r;
    d[i * 4 + 1] = g;
    d[i * 4 + 2] = bl;
  }

  /** Max-propagation flood fill. If `limit` is given, writes are confined to that box. */
  private propagate(limit: Box3i | null): void {
    const w = this.world;
    const d = this.data;
    const blocks = w.blocks;
    const sx = w.sx;
    const sy = w.sy;
    const sz = w.sz;
    const sxy = sx * sy;
    const lx0 = limit ? limit.x0 : 0;
    const ly0 = limit ? limit.y0 : 0;
    const lz0 = limit ? limit.z0 : 0;
    const lx1 = limit ? limit.x1 : sx - 1;
    const ly1 = limit ? limit.y1 : sy - 1;
    const lz1 = limit ? limit.z1 : sz - 1;
    const track = limit === null;

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

      for (let k = 0; k < 18; k++) {
        const dir = k < 6 ? FACE_DIRS[k] : EDGE_DIRS[k - 6];
        const nx = x + dir[0];
        const ny = y + dir[1];
        const nz = z + dir[2];
        if (nx < lx0 || ny < ly0 || nz < lz0 || nx > lx1 || ny > ly1 || nz > lz1) continue;
        let n: number;
        let table: Uint8Array;
        if (k < 6) {
          n = i + this.faceOff[k];
          table = DECAY_FACE;
        } else {
          const e = k - 6;
          if (SOLID[blocks[i + this.edgeA[e]]] && SOLID[blocks[i + this.edgeB[e]]]) continue;
          n = i + this.edgeOff[e];
          table = DECAY_EDGE;
        }
        if (SOLID[blocks[n]]) continue;
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
   * Openness: fraction of open voxels in a (2r+1)^3 neighborhood, computed with three
   * separable box-blur passes. Only computed on load; a single mined block changes it by
   * far less than one 8-bit step, so gameplay edits do not need to refresh it.
   */
  computeOpenness(radius = 6): void {
    const w = this.world;
    const { sx, sy, sz } = w;
    const n = sx * sy * sz;
    let a = new Float32Array(n);
    let bBuf = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = SOLID[w.blocks[i]] ? 0 : 1;
    const passes: Array<[number, number]> = [
      [1, sx],
      [sx, sy],
      [sx * sy, sz],
    ];
    for (const [stride, len] of passes) {
      const lines = n / len;
      for (let line = 0; line < lines; line++) {
        // Base index of this line: enumerate all indices whose coordinate along this axis is 0.
        let base: number;
        if (stride === 1) base = line * sx;
        else if (stride === sx) base = (line % sx) + Math.floor(line / sx) * sx * sy;
        else base = line;
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const kk = Math.min(len - 1, Math.max(0, k));
          sum += a[base + kk * stride];
        }
        for (let p = 0; p < len; p++) {
          bBuf[base + p * stride] = sum / (radius * 2 + 1);
          const out = Math.max(0, p - radius);
          const inn = Math.min(len - 1, p + radius + 1);
          sum += a[base + inn * stride] - a[base + out * stride];
        }
      }
      const t = a;
      a = bBuf;
      bBuf = t;
    }
    const d = this.data;
    for (let i = 0; i < n; i++) d[i * 4 + 3] = SOLID[w.blocks[i]] ? 0 : Math.round(Math.min(1, a[i]) * 255);
  }
}

/**
 * Visibility of the player's lantern, in a small grid that follows the player.
 * Each voxel within the lantern radius stores 255 if a straight line from the lantern
 * reaches its center without crossing a solid voxel, else 0. Trilinear filtering on the
 * GPU turns this into soft shadow edges. The shader applies the smooth distance falloff
 * from the lantern's exact position, so moving within a voxel never makes light jump.
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
  private lastRevision = -1;

  constructor(private readonly world: VoxelWorld) {}

  /** Recompute when the lantern moved enough or the world changed. Returns true if data changed. */
  update(lx: number, ly: number, lz: number, radius: number, force = false): boolean {
    const moved = Math.abs(lx - this.lastX) + Math.abs(ly - this.lastY) + Math.abs(lz - this.lastZ);
    if (!force && moved < 0.35 && this.world.revision === this.lastRevision) return false;
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
    this.lastRevision = w.revision;
    this.originX = Math.floor(lx) - half;
    this.originY = Math.floor(ly) - half;
    this.originZ = Math.floor(lz) - half;
    const d = this.data;
    d.fill(0);
    const r = Math.min(half - 1, Math.ceil(radius));
    const r2 = (r + 0.5) * (r + 0.5);
    const cx = Math.floor(lx);
    const cy = Math.floor(ly);
    const cz = Math.floor(lz);
    for (let z = cz - r; z <= cz + r; z++)
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          const px = x + 0.5;
          const py = y + 0.5;
          const pz = z + 0.5;
          const ddx = px - lx;
          const ddy = py - ly;
          const ddz = pz - lz;
          if (ddx * ddx + ddy * ddy + ddz * ddz > r2) continue;
          if (w.isSolid(x, y, z)) continue;
          if (segmentClear(w, lx, ly, lz, px, py, pz)) {
            d[x - this.originX + S * (y - this.originY + S * (z - this.originZ))] = 255;
          }
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
