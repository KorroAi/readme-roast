// Bevelled-block mesher on the voxel lattice.
//
// Every exposed block face is split into a 3 x 3 grid (a plate inset by the bevel, four edge strips, four corners).
// Vertices on lattice points and lattice edges are SHARED between faces: their positions are a pure function of the
// integer lattice key (the edge's fold type sets its displacement, a lattice point takes the mean of its edges), so
// the surface stays watertight by construction - no cracks, no T-junctions, no coplanar duplicates:
//   convex edge (1 solid of 4)  -> pushed b/2 into the block on both axes = a 45 degree chamfer,
//   coplanar seam (2 of 4)      -> pushed b into the solid = a V groove between neighbouring blocks,
//   concave edge (3 of 4)       -> pushed c diagonally into the solid = a small notch in the inner corner.
// Plates get a tiny per-corner tilt so each block catches the lantern a little differently.

import * as THREE from 'three';
import { Blk, CELL, Grid, layersFor } from './grid';
import { hash4, hashf } from './util';

const BEVEL = 0.07; // metres
const CONCAVE = 0.03;
const JIT_POINT = 0.011;
const JIT_EDGE = 0.007;
const JIT_PLATE = 0.014;
const B = BEVEL / CELL; // bevel in lattice units

/** Axis helpers: unit vectors. */
const E: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

export class Lattice {
  /** Per lattice edge (3 axes) displacement, metres; NaN-free. */
  private edge: Float32Array;
  private point: Float32Array;
  /** 1 where a lattice edge borders both solid and air. */
  private surf: Uint8Array;
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  constructor(readonly grid: Grid) {
    this.px = grid.nx + 1;
    this.py = grid.ny + 1;
    this.pz = grid.nz + 1;
    const n = this.px * this.py * this.pz;
    this.edge = new Float32Array(n * 9);
    this.point = new Float32Array(n * 3);
    this.surf = new Uint8Array(n * 3);
    this.update(0, 0, 0, this.px - 1, this.py - 1, this.pz - 1);
  }
  pidx(i: number, j: number, k: number): number {
    return i + this.px * (j + this.py * k);
  }
  /** Recompute edges and points in a lattice box (inclusive), e.g. after an edit. */
  update(i0: number, j0: number, k0: number, i1: number, j1: number, k1: number): void {
    const g = this.grid;
    const c = (v: number, hi: number) => Math.max(0, Math.min(hi, v));
    i0 = c(i0, this.px - 1); j0 = c(j0, this.py - 1); k0 = c(k0, this.pz - 1);
    i1 = c(i1, this.px - 1); j1 = c(j1, this.py - 1); k1 = c(k1, this.pz - 1);
    for (let k = k0; k <= k1; k++)
      for (let j = j0; j <= j1; j++)
        for (let i = i0; i <= i1; i++) {
          const p = [i, j, k];
          const base = this.pidx(i, j, k) * 9;
          for (let a = 0; a < 3; a++) {
            const u = (a + 1) % 3, v = (a + 2) % 3;
            const cell = (du: number, dv: number) => {
              const q = [p[0], p[1], p[2]];
              q[u] += du;
              q[v] += dv;
              return g.solid(q[0], q[1], q[2]);
            };
            const s00 = cell(-1, -1), s10 = cell(0, -1), s01 = cell(-1, 0), s11 = cell(0, 0);
            const n = +s00 + +s10 + +s01 + +s11;
            let du = 0, dv = 0;
            if (n === 1) {
              du = (s00 || s01 ? -1 : 1) * (BEVEL / 2);
              dv = (s00 || s10 ? -1 : 1) * (BEVEL / 2);
            } else if (n === 2) {
              if (s00 && s10) dv = -BEVEL;
              else if (s01 && s11) dv = BEVEL;
              else if (s00 && s01) du = -BEVEL;
              else if (s10 && s11) du = BEVEL;
            } else if (n === 3) {
              const ou = !s00 || !s01 ? -1 : 1;
              const ov = !s00 || !s10 ? -1 : 1;
              du = -ou * CONCAVE;
              dv = -ov * CONCAVE;
            }
            const d = [0, 0, 0];
            d[u] = du;
            d[v] = dv;
            this.edge[base + a * 3 + 0] = d[0];
            this.edge[base + a * 3 + 1] = d[1];
            this.edge[base + a * 3 + 2] = d[2];
            this.surf[this.pidx(i, j, k) * 3 + a] = n >= 1 && n <= 3 ? 1 : 0;
          }
        }
    // Points: the mean of their surface edges (6 incident edges).
    for (let k = Math.max(0, k0 - 1); k <= Math.min(this.pz - 1, k1 + 1); k++)
      for (let j = Math.max(0, j0 - 1); j <= Math.min(this.py - 1, j1 + 1); j++)
        for (let i = Math.max(0, i0 - 1); i <= Math.min(this.px - 1, i1 + 1); i++) {
          let sx = 0, sy = 0, sz = 0, n = 0;
          const p = [i, j, k];
          for (let a = 0; a < 3; a++)
            for (const back of [0, 1]) {
              const q = [p[0], p[1], p[2]];
              q[a] -= back;
              if (q[a] < 0) continue;
              const id = this.pidx(q[0], q[1], q[2]);
              if (!this.surf[id * 3 + a]) continue;
              const e = id * 9 + a * 3;
              sx += this.edge[e];
              sy += this.edge[e + 1];
              sz += this.edge[e + 2];
              n++;
            }
          const o = this.pidx(i, j, k) * 3;
          this.point[o] = n ? sx / n : 0;
          this.point[o + 1] = n ? sy / n : 0;
          this.point[o + 2] = n ? sz / n : 0;
        }
  }
  /** World position of a lattice point (displaced + jittered). */
  pointPos(i: number, j: number, k: number, out: number[]): void {
    const g = this.grid;
    const o = this.pidx(i, j, k) * 3;
    const h = hash4(i, j, k, 7);
    out[0] = g.ox + i * CELL + this.point[o] + ((h & 255) / 255 - 0.5) * 2 * JIT_POINT;
    out[1] = g.oy + j * CELL + this.point[o + 1] + (((h >> 8) & 255) / 255 - 0.5) * 2 * JIT_POINT;
    out[2] = g.oz + k * CELL + this.point[o + 2] + (((h >> 16) & 255) / 255 - 0.5) * 2 * JIT_POINT;
  }
  /** World position of the vertex at `s` (0 = B, 1 = 1 - B) along the lattice edge starting at (i, j, k) on axis a. */
  edgePos(i: number, j: number, k: number, a: number, s: number, out: number[]): void {
    const g = this.grid;
    const e = this.pidx(i, j, k) * 9 + a * 3;
    const t = s === 0 ? B : 1 - B;
    const h = hash4(i, j, k, 11 + a * 2 + s);
    out[0] = g.ox + (i + E[a][0] * t) * CELL + this.edge[e] + ((h & 255) / 255 - 0.5) * 2 * JIT_EDGE;
    out[1] = g.oy + (j + E[a][1] * t) * CELL + this.edge[e + 1] + (((h >> 8) & 255) / 255 - 0.5) * 2 * JIT_EDGE;
    out[2] = g.oz + (k + E[a][2] * t) * CELL + this.edge[e + 2] + (((h >> 16) & 255) / 255 - 0.5) * 2 * JIT_EDGE;
  }
}

/** The six face directions: normal axis, sign, and tangent axes (U x V = n). */
const FACES = [
  { a: 0, s: 1, u: 1, v: 2 }, // +x: y x z = x
  { a: 0, s: -1, u: 2, v: 1 }, // -x: z x y = -x
  { a: 1, s: 1, u: 2, v: 0 }, // +y: z x x = y
  { a: 1, s: -1, u: 0, v: 2 }, // -y: x x z = -y
  { a: 2, s: 1, u: 0, v: 1 }, // +z: x x y = z
  { a: 2, s: -1, u: 1, v: 0 }, // -z: y x x = -z
] as const;

const GRID_T = [0, B, 1 - B, 1];

export interface ChunkGeo {
  geometry: THREE.BufferGeometry;
  faces: number;
}

/**
 * Mesh every exposed face of the solid cells in [x0, x1) x [y0, y1) x [z0, z1).
 * Attributes: position, normal, tangent (vec3), uv, aMat (layer, seed, 0, 0).
 */
export function buildChunk(lat: Lattice, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): ChunkGeo | null {
  const g = lat.grid;
  const pos: number[] = [], nrm: number[] = [], tan: number[] = [], uv: number[] = [], mat: number[] = [];
  const idx: number[] = [];
  let faces = 0;
  const vp: number[][] = Array.from({ length: 16 }, () => [0, 0, 0]);
  const vn: number[][] = Array.from({ length: 16 }, () => [0, 0, 0]);
  const tmp = [0, 0, 0];
  for (let z = z0; z < z1; z++)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const b = g.get(x, y, z);
        if (b === Blk.Air) continue;
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nb = [x, y, z];
          nb[F.a] += F.s;
          if (g.solid(nb[0], nb[1], nb[2])) continue;
          faces++;
          // Lattice origin of the face (min corner on the face plane).
          const o = [x, y, z];
          if (F.s > 0) o[F.a] += 1;
          // 4 x 4 vertex grid.
          for (let jv = 0; jv < 4; jv++)
            for (let iu = 0; iu < 4; iu++) {
              const out = vp[jv * 4 + iu];
              const cu = iu === 0 || iu === 3, cv = jv === 0 || jv === 3;
              if (cu && cv) {
                const q = [o[0], o[1], o[2]];
                q[F.u] += iu === 3 ? 1 : 0;
                q[F.v] += jv === 3 ? 1 : 0;
                lat.pointPos(q[0], q[1], q[2], out);
              } else if (cv) {
                // On an edge along U (at V = 0 or 1).
                const q = [o[0], o[1], o[2]];
                q[F.v] += jv === 3 ? 1 : 0;
                lat.edgePos(q[0], q[1], q[2], F.u, iu === 1 ? 0 : 1, out);
              } else if (cu) {
                const q = [o[0], o[1], o[2]];
                q[F.u] += iu === 3 ? 1 : 0;
                lat.edgePos(q[0], q[1], q[2], F.v, jv === 1 ? 0 : 1, out);
              } else {
                const w = [g.ox + o[0] * CELL, g.oy + o[1] * CELL, g.oz + o[2] * CELL];
                w[F.u] += GRID_T[iu] * CELL;
                w[F.v] += GRID_T[jv] * CELL;
                const hj = hashf(x, y, z, f * 4 + (iu - 1) + (jv - 1) * 2 + 101) - 0.5;
                w[F.a] += F.s * hj * 2 * JIT_PLATE;
                out[0] = w[0];
                out[1] = w[1];
                out[2] = w[2];
              }
            }
          // Normals: area-weighted sub-quad normals accumulated per vertex (within this face only).
          for (const n of vn) n[0] = n[1] = n[2] = 0;
          for (let jv = 0; jv < 3; jv++)
            for (let iu = 0; iu < 3; iu++) {
              const a = vp[jv * 4 + iu], bq = vp[jv * 4 + iu + 1], cq = vp[(jv + 1) * 4 + iu + 1], d = vp[(jv + 1) * 4 + iu];
              // (c - a) x (d - b)
              const e1x = cq[0] - a[0], e1y = cq[1] - a[1], e1z = cq[2] - a[2];
              const e2x = d[0] - bq[0], e2y = d[1] - bq[1], e2z = d[2] - bq[2];
              const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
              for (const vi of [jv * 4 + iu, jv * 4 + iu + 1, (jv + 1) * 4 + iu + 1, (jv + 1) * 4 + iu]) {
                vn[vi][0] += nx;
                vn[vi][1] += ny;
                vn[vi][2] += nz;
              }
            }
          // Flat plates, rounded bevels: the inner vertices take the plate's own normal, so the shading only turns
          // inside the bevel strips (crisp block faces, soft highlight lines on the chamfers).
          {
            const a = vp[5], bq = vp[6], cq = vp[10], d = vp[9];
            const e1x = cq[0] - a[0], e1y = cq[1] - a[1], e1z = cq[2] - a[2];
            const e2x = d[0] - bq[0], e2y = d[1] - bq[1], e2z = d[2] - bq[2];
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            for (const vi of [5, 6, 9, 10]) {
              vn[vi][0] = nx;
              vn[vi][1] = ny;
              vn[vi][2] = nz;
            }
          }
          // Per-face texture frame: random variant, quarter rotation and offset.
          const h = hash4(x, y, z, f + 31);
          const [top, side, bottom] = layersFor(b);
          const set = F.a === 1 ? (F.s > 0 ? top : bottom) : side;
          const layer = set[h % set.length];
          const rot = (h >>> 8) & 3;
          const offU = ((h >>> 12) & 255) / 256, offV = ((h >>> 20) & 255) / 256;
          const seed = hashf(x, y, z, 5);
          const eU = E[F.u], eV = E[F.v];
          const T = rot === 0 ? eU : rot === 1 ? eV.map((q) => -q) : rot === 2 ? eU.map((q) => -q) : eV;
          const base = pos.length / 3;
          const ox = g.ox + o[0] * CELL, oy = g.oy + o[1] * CELL, oz = g.oz + o[2] * CELL;
          for (let vi = 0; vi < 16; vi++) {
            const p = vp[vi];
            pos.push(p[0], p[1], p[2]);
            const n = vn[vi];
            const l = Math.hypot(n[0], n[1], n[2]) || 1;
            nrm.push(n[0] / l, n[1] / l, n[2] / l);
            tan.push(T[0], T[1], T[2]);
            tmp[0] = p[0] - ox;
            tmp[1] = p[1] - oy;
            tmp[2] = p[2] - oz;
            const lu = tmp[F.u] / CELL - 0.5, lv = tmp[F.v] / CELL - 0.5;
            let ru = lu, rv = lv;
            if (rot === 1) {
              ru = -lv;
              rv = lu;
            } else if (rot === 2) {
              ru = -lu;
              rv = -lv;
            } else if (rot === 3) {
              ru = lv;
              rv = -lu;
            }
            uv.push(ru + 0.5 + offU, rv + 0.5 + offV);
            mat.push(layer, seed, b, 0);
          }
          for (let jv = 0; jv < 3; jv++)
            for (let iu = 0; iu < 3; iu++) {
              const a = base + jv * 4 + iu, bq = a + 1, cq = a + 5, d = a + 4;
              idx.push(a, bq, cq, a, cq, d);
            }
        }
      }
  if (!faces) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('aTangent', new THREE.Float32BufferAttribute(tan, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 4));
  geo.setIndex(idx);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return { geometry: geo, faces };
}
