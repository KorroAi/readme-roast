import * as THREE from 'three';
import { SOLID } from '../config/blocks';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * Round 3 (VIS): cave culling for the terrain's chunk meshes (the chunk visibility graph of T.
 * Checchi's "Advanced Cave Culling", as in Minecraft).
 *
 * The strata are rock with caves in it: from any spot most chunks inside the view distance sit behind
 * metres of rock, yet the distance and frustum culls draw them all (a draw call each). Here:
 * - each chunk keeps which of its six faces are joined through its open (non-solid) cells: a 15-bit
 *   mask, one bit per face pair, found by a flood fill of its 16^3 cells (lazily, a few a frame, and
 *   again when its voxels change; an unknown chunk counts as open everywhere: never hidden wrongly);
 * - each frame a breadth-first walk leaves the camera's chunk through every face, enters a neighbour
 *   by the shared face and goes on only through faces joined to that entry face, never back toward
 *   the camera on any axis (a sight line never reverses on an axis), within the frustum and the
 *   distance. The chunks it reaches are drawn; the rest are rock between the eye and them.
 * A solid chunk next to a reached open one is reached (its faces bound the cave) but leads nowhere.
 */

/** Face order: +x, -x, +y, -y, +z, -z. */
export const FACE_DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const OPP = [1, 0, 3, 2, 5, 4];

/** The bit of the face pair (a, b) in the 15-bit connectivity mask. */
const PAIR = (() => {
  const t = new Int8Array(36).fill(-1);
  let k = 0;
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++) {
      t[a * 6 + b] = k;
      t[b * 6 + a] = k;
      k++;
    }
  return t;
})();
export const ALL_CONNECTED = 0x7fff;

export function connected(mask: number, a: number, b: number): boolean {
  return a === b || ((mask >> PAIR[a * 6 + b]) & 1) === 1;
}

const cellSeen = new Uint8Array(32 * 32 * 32);
const stack = new Int32Array(32 * 32 * 32);

/**
 * Which faces of chunk (cx, cy, cz) its open cells join (pure; unit-tested): bit PAIR(a, b) is set
 * when one connected region of non-solid cells touches both face a and face b.
 */
export function chunkConnectivity(world: VoxelWorld, cx: number, cy: number, cz: number): number {
  const cs = world.chunkSize;
  const n = cs * cs * cs;
  const seen = cellSeen;
  seen.fill(0, 0, n);
  const x0 = cx * cs;
  const y0 = cy * cs;
  const z0 = cz * cs;
  const b = world.blocks;
  const sx = world.sx;
  const sxy = world.sx * world.sy;
  const open = (lx: number, ly: number, lz: number) => SOLID[b[x0 + lx + sx * (y0 + ly) + sxy * (z0 + lz)]] === 0;
  let mask = 0;
  const last = cs - 1;
  for (let start = 0; start < n; start++) {
    if (seen[start]) continue;
    const lx0 = start % cs;
    const ly0 = Math.floor(start / cs) % cs;
    const lz0 = Math.floor(start / (cs * cs));
    if (!open(lx0, ly0, lz0)) {
      seen[start] = 1;
      continue;
    }
    // Flood this region and note the faces it touches.
    let faces = 0;
    let sp = 0;
    stack[sp++] = start;
    seen[start] = 1;
    while (sp > 0) {
      const c = stack[--sp];
      const lx = c % cs;
      const ly = Math.floor(c / cs) % cs;
      const lz = Math.floor(c / (cs * cs));
      if (lx === last) faces |= 1;
      if (lx === 0) faces |= 2;
      if (ly === last) faces |= 4;
      if (ly === 0) faces |= 8;
      if (lz === last) faces |= 16;
      if (lz === 0) faces |= 32;
      if (lx < last) {
        const j = c + 1;
        if (!seen[j]) {
          seen[j] = 1;
          if (open(lx + 1, ly, lz)) stack[sp++] = j;
        }
      }
      if (lx > 0) {
        const j = c - 1;
        if (!seen[j]) {
          seen[j] = 1;
          if (open(lx - 1, ly, lz)) stack[sp++] = j;
        }
      }
      if (ly < last) {
        const j = c + cs;
        if (!seen[j]) {
          seen[j] = 1;
          if (open(lx, ly + 1, lz)) stack[sp++] = j;
        }
      }
      if (ly > 0) {
        const j = c - cs;
        if (!seen[j]) {
          seen[j] = 1;
          if (open(lx, ly - 1, lz)) stack[sp++] = j;
        }
      }
      if (lz < last) {
        const j = c + cs * cs;
        if (!seen[j]) {
          seen[j] = 1;
          if (open(lx, ly, lz + 1)) stack[sp++] = j;
        }
      }
      if (lz > 0) {
        const j = c - cs * cs;
        if (!seen[j]) {
          seen[j] = 1;
          if (open(lx, ly, lz - 1)) stack[sp++] = j;
        }
      }
    }
    for (let a = 0; a < 6; a++) {
      if (!(faces & (1 << a))) continue;
      for (let c2 = a + 1; c2 < 6; c2++) if (faces & (1 << c2)) mask |= 1 << PAIR[a * 6 + c2];
    }
    if (mask === ALL_CONNECTED) break;
  }
  return mask;
}

const _box = new THREE.Box3();
const _min = new THREE.Vector3();
const _max = new THREE.Vector3();

export class CaveCuller {
  /** Connectivity per chunk (-1: not known yet, drawn as if open). */
  private readonly conn: Int32Array;
  /** Faces each chunk was entered by this walk (bit per face; 64 = the start). */
  private readonly entered: Uint8Array;
  /** 1 where the last walk reached the chunk. */
  readonly visible: Uint8Array;
  private readonly queue: Int32Array;
  private readonly pending: number[] = [];
  private readonly pendingSet: Uint8Array;
  /** Chunks reached by the last walk (the report). */
  reached = 0;
  /** Chunks whose connectivity is known. */
  known = 0;

  constructor(private readonly world: VoxelWorld) {
    const n = world.cx * world.cy * world.cz;
    this.conn = new Int32Array(n).fill(-1);
    this.entered = new Uint8Array(n);
    this.visible = new Uint8Array(n);
    this.queue = new Int32Array(n * 6 * 3 + 64);
    this.pendingSet = new Uint8Array(n);
  }

  /** A chunk's voxels changed: find its connectivity again (soon). */
  invalidate(i: number): void {
    if (this.conn[i] >= 0) this.known--;
    this.conn[i] = -1;
    if (!this.pendingSet[i]) {
      this.pendingSet[i] = 1;
      this.pending.push(i);
    }
  }

  invalidateAll(): void {
    for (let i = 0; i < this.conn.length; i++) this.invalidate(i);
  }

  /** Work through the chunks waiting for their connectivity, for up to `budgetMs`. */
  compute(budgetMs: number): void {
    const w = this.world;
    const t0 = performance.now();
    while (this.pending.length) {
      const i = this.pending.pop()!;
      this.pendingSet[i] = 0;
      const cx = i % w.cx;
      const cy = Math.floor(i / w.cx) % w.cy;
      const cz = Math.floor(i / (w.cx * w.cy));
      this.conn[i] = chunkConnectivity(w, cx, cy, cz);
      this.known++;
      if (performance.now() - t0 > budgetMs) break;
    }
  }

  /** Connectivity of chunk i (computing it now if unknown). */
  connectivity(i: number): number {
    if (this.conn[i] < 0) {
      const w = this.world;
      this.conn[i] = chunkConnectivity(w, i % w.cx, Math.floor(i / w.cx) % w.cy, Math.floor(i / (w.cx * w.cy)));
      this.known++;
    }
    return this.conn[i];
  }

  /**
   * Walk from the eye: marks `visible` for every chunk a sight line can reach through open cells
   * (within `maxDist` of the eye and, when given, the frustum). Returns how many it reached.
   */
  run(eye: THREE.Vector3, maxDist: number, frustum: THREE.Frustum | null): number {
    const w = this.world;
    const cs = w.chunkSize;
    const ncx = w.cx;
    const ncy = w.cy;
    const ncz = w.cz;
    this.visible.fill(0);
    this.entered.fill(0);
    const ex = Math.floor(eye.x / cs);
    const ey = Math.floor(eye.y / cs);
    const ez = Math.floor(eye.z / cs);
    if (ex < 0 || ey < 0 || ez < 0 || ex >= ncx || ey >= ncy || ez >= ncz) {
      this.visible.fill(1);
      this.reached = this.visible.length;
      return this.reached;
    }
    const q = this.queue;
    let head = 0;
    let tail = 0;
    const maxD2 = (maxDist + cs) * (maxDist + cs);
    const push = (i: number, face: number, dirs: number) => {
      q[tail++] = i;
      q[tail++] = face;
      q[tail++] = dirs;
    };
    const start = ex + ncx * (ey + ncy * ez);
    this.visible[start] = 1;
    this.entered[start] = 64;
    push(start, -1, 0);
    // A chunk within a metre of the eye across a face is a start too (the near plane reaches it).
    const lx = eye.x - ex * cs;
    const ly = eye.y - ey * cs;
    const lz = eye.z - ez * cs;
    const near = [lx > cs - 1, lx < 1, ly > cs - 1, ly < 1, lz > cs - 1, lz < 1];
    for (let f = 0; f < 6; f++) {
      if (!near[f]) continue;
      const [dx, dy, dz] = FACE_DIRS[f];
      const nx = ex + dx, ny = ey + dy, nz = ez + dz;
      if (nx < 0 || ny < 0 || nz < 0 || nx >= ncx || ny >= ncy || nz >= ncz) continue;
      const j = nx + ncx * (ny + ncy * nz);
      this.visible[j] = 1;
      this.entered[j] = 64;
      push(j, -1, 0);
    }
    let reached = 0;
    while (head < tail) {
      const i = q[head++];
      const entry = q[head++];
      const dirs = q[head++];
      const cx = i % ncx;
      const cy = Math.floor(i / ncx) % ncy;
      const cz = Math.floor(i / (ncx * ncy));
      let mask = ALL_CONNECTED;
      if (entry >= 0) {
        const c = this.conn[i];
        if (c >= 0) mask = c;
        else if (!this.pendingSet[i]) {
          // Not known yet: drawn as if open, found soon (compute()).
          this.pendingSet[i] = 1;
          this.pending.push(i);
        }
      }
      if (mask === 0 && entry >= 0) continue;
      for (let f = 0; f < 6; f++) {
        // Never back toward the eye on an axis already taken the other way.
        if (dirs & (1 << OPP[f])) continue;
        if (entry >= 0 && !connected(mask, entry, f)) continue;
        const [dx, dy, dz] = FACE_DIRS[f];
        const nx = cx + dx, ny = cy + dy, nz = cz + dz;
        if (nx < 0 || ny < 0 || nz < 0 || nx >= ncx || ny >= ncy || nz >= ncz) continue;
        const j = nx + ncx * (ny + ncy * nz);
        const inFace = OPP[f];
        if (this.entered[j] & (64 | (1 << inFace))) continue;
        // Distance and frustum (the chunk's box).
        const mx = nx * cs + cs / 2 - eye.x;
        const my = ny * cs + cs / 2 - eye.y;
        const mz = nz * cs + cs / 2 - eye.z;
        if (mx * mx + my * my + mz * mz > maxD2) continue;
        if (frustum) {
          _min.set(nx * cs - 0.5, ny * cs - 0.5, nz * cs - 0.5);
          _max.set(nx * cs + cs + 0.5, ny * cs + cs + 0.5, nz * cs + cs + 0.5);
          _box.set(_min, _max);
          if (!frustum.intersectsBox(_box)) continue;
        }
        this.entered[j] |= 1 << inFace;
        if (!this.visible[j]) {
          this.visible[j] = 1;
          reached++;
        }
        push(j, inFace, dirs | (1 << f));
      }
    }
    this.reached = reached + 1;
    return this.reached;
  }
}
