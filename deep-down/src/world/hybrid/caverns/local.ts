// A chamber's local voxel grid and the carving toolkit the templates are written with. Local frame (metres): u along
// the arrival direction (0 = the entry wall), v across it (0 = the outer side wall, toward the footprint's edge), y up
// (0 = the entry floor's surface). Voxels are 0.5 m; local voxel (iu, iy, iv) spans u in [iu·0.5, iu·0.5 + 0.5),
// v likewise, y in [y0 + iy·0.5, y0 + iy·0.5 + 0.5).

import { B, SOLID } from '../../../config/blocks';
import { VOXEL } from '../grid';

/** A local point (metres). */
export interface L3 {
  u: number;
  y: number;
  v: number;
}

export const l3 = (u: number, y: number, v: number): L3 => ({ u, y, v });

/** A seeded hash in [0, 1). */
export function h01(seed: number, a: number, b = 0, c = 0): number {
  let h = (seed ^ 0x6a09e667) >>> 0;
  h = Math.imul(h ^ (a | 0), 0x9e3779b1) >>> 0;
  h = Math.imul(h ^ (b | 0), 0x85ebca77) >>> 0;
  h = Math.imul(h ^ (c | 0), 0xc2b2ae3d) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
}

/** A small deterministic RNG (mulberry32). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number): number {
    return a + Math.floor(this.next() * (b - a + 1));
  }
  pick<T>(xs: readonly T[]): T {
    return xs[Math.floor(this.next() * xs.length) % xs.length];
  }
}

/** Smooth value noise in 3D (deterministic, cheap; the cavern walls' irregularity). */
export function vnoise(seed: number, x: number, y: number, z: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const u = s(xf);
  const v = s(yf);
  const w = s(zf);
  const c = (a: number, b: number, d: number) => h01(seed, xi + a, yi + b, zi + d) * 2 - 1;
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v;
  const y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}

/** Two octaves of value noise, roughly in [-1, 1]. */
export function fbm(seed: number, x: number, y: number, z: number): number {
  return 0.68 * vnoise(seed, x, y, z) + 0.32 * vnoise(seed ^ 0x5bd1e995, x * 2.03 + 7.1, y * 2.03 + 1.3, z * 2.03 + 3.7);
}

/**
 * A chamber's voxels in its local frame. Extents in metres: u in [u0, u1), v in [v0, v1), y in [y0, y1) (all on the
 * 0.5 m grid). Starts solid (host rock); templates carve air and place built blocks.
 */
export class LocalGrid {
  readonly nu: number;
  readonly ny: number;
  readonly nv: number;
  readonly data: Uint8Array;

  constructor(
    readonly u0: number,
    readonly u1: number,
    readonly y0: number,
    readonly y1: number,
    readonly v0: number,
    readonly v1: number,
    fill: number,
  ) {
    this.nu = Math.round((u1 - u0) / VOXEL);
    this.ny = Math.round((y1 - y0) / VOXEL);
    this.nv = Math.round((v1 - v0) / VOXEL);
    this.data = new Uint8Array(this.nu * this.ny * this.nv).fill(fill);
  }

  /** Voxel indices of a local point. */
  iu(u: number): number {
    return Math.floor((u - this.u0) / VOXEL + 1e-9);
  }
  iy(y: number): number {
    return Math.floor((y - this.y0) / VOXEL + 1e-9);
  }
  iv(v: number): number {
    return Math.floor((v - this.v0) / VOXEL + 1e-9);
  }
  /** Local metres of a voxel's centre. */
  cu(i: number): number {
    return this.u0 + (i + 0.5) * VOXEL;
  }
  cy(i: number): number {
    return this.y0 + (i + 0.5) * VOXEL;
  }
  cv(i: number): number {
    return this.v0 + (i + 0.5) * VOXEL;
  }
  /** The floor surface (local y) of feet voxel row iy. */
  fy(i: number): number {
    return this.y0 + i * VOXEL;
  }

  inside(iu: number, iy: number, iv: number): boolean {
    return iu >= 0 && iy >= 0 && iv >= 0 && iu < this.nu && iy < this.ny && iv < this.nv;
  }

  idx(iu: number, iy: number, iv: number): number {
    return iu + this.nu * (iy + this.ny * iv);
  }

  /** Outside the grid reads as host rock (solid). */
  get(iu: number, iy: number, iv: number): number {
    if (!this.inside(iu, iy, iv)) return B.BEDROCK;
    return this.data[this.idx(iu, iy, iv)];
  }

  set(iu: number, iy: number, iv: number, id: number): void {
    if (this.inside(iu, iy, iv)) this.data[this.idx(iu, iy, iv)] = id;
  }

  solid(iu: number, iy: number, iv: number): boolean {
    return SOLID[this.get(iu, iy, iv)] === 1;
  }

  /** Metres versions. */
  getM(u: number, y: number, v: number): number {
    return this.get(this.iu(u), this.iy(y), this.iv(v));
  }
  setM(u: number, y: number, v: number, id: number): void {
    this.set(this.iu(u), this.iy(y), this.iv(v), id);
  }
  solidM(u: number, y: number, v: number): boolean {
    return this.solid(this.iu(u), this.iy(y), this.iv(v));
  }

  /** Set every voxel whose centre lies in the box [a, b) (metres) to id; `only` limits it to voxels whose current id passes. */
  box(ua: number, ya: number, va: number, ub: number, yb: number, vb: number, id: number, only?: (cur: number) => boolean): void {
    const i0 = Math.max(0, this.iu(Math.min(ua, ub)));
    const i1 = Math.min(this.nu - 1, this.iu(Math.max(ua, ub) - 1e-6));
    const j0 = Math.max(0, this.iy(Math.min(ya, yb)));
    const j1 = Math.min(this.ny - 1, this.iy(Math.max(ya, yb) - 1e-6));
    const k0 = Math.max(0, this.iv(Math.min(va, vb)));
    const k1 = Math.min(this.nv - 1, this.iv(Math.max(va, vb) - 1e-6));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const n = this.idx(i, j, k);
          if (!only || only(this.data[n])) this.data[n] = id;
        }
  }

  /** Air in the box (metres). */
  carveBox(ua: number, ya: number, va: number, ub: number, yb: number, vb: number): void {
    this.box(ua, ya, va, ub, yb, vb, B.AIR);
  }

  /** Visit every voxel of the grid with its centre (metres). */
  each(f: (i: number, j: number, k: number, u: number, y: number, v: number) => void): void {
    for (let k = 0; k < this.nv; k++) {
      const v = this.cv(k);
      for (let j = 0; j < this.ny; j++) {
        const y = this.cy(j);
        for (let i = 0; i < this.nu; i++) f(i, j, k, this.cu(i), y, v);
      }
    }
  }

  /** Visit the voxels whose centres lie in a box (metres). */
  eachIn(ua: number, ya: number, va: number, ub: number, yb: number, vb: number, f: (i: number, j: number, k: number, u: number, y: number, v: number) => void): void {
    const i0 = Math.max(0, this.iu(ua));
    const i1 = Math.min(this.nu - 1, this.iu(ub - 1e-6));
    const j0 = Math.max(0, this.iy(ya));
    const j1 = Math.min(this.ny - 1, this.iy(yb - 1e-6));
    const k0 = Math.max(0, this.iv(va));
    const k1 = Math.min(this.nv - 1, this.iv(vb - 1e-6));
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) f(i, j, k, this.cu(i), this.cy(j), this.cv(k));
  }

  /** Is a body standable at feet voxel (i, j, k): solid floor under it, 4 open voxels (2 m) above? */
  standable(i: number, j: number, k: number): boolean {
    if (!this.solid(i, j - 1, k)) return false;
    for (let h = 0; h < 4; h++) if (this.solid(i, j + h, k)) return false;
    return true;
  }

  /** The feet row of the highest standable cell in column (i, k) at or below row jTop, or -1. */
  floorBelow(i: number, k: number, jTop: number): number {
    for (let j = Math.min(jTop, this.ny - 4); j >= 1; j--) if (this.standable(i, j, k)) return j;
    return -1;
  }
}
