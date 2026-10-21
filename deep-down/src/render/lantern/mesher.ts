// The Lantern Voxel mesher (W1-LEAD §1, ported from reference/spike-lantern/src/mesher.ts): bevelled 0.5 m stone
// blocks on the voxel lattice.
//
// Every exposed block face is split into a 3 × 3 grid (a plate inset by the bevel, four edge strips, four corners).
// Vertices on lattice points and lattice edges are a pure function of the integer lattice key and the cells around
// it (in world coordinates), so faces of two blocks, or of two chunks, meet exactly: no cracks, no T-junctions.
//   convex edge (1 solid of 4)  → pushed b/2 into the block on both axes: a 45° chamfer (BEVEL);
//   coplanar seam (2 of 4)      → pushed into the solid: a shallow V joint between neighbouring blocks (SEAM);
//   concave edge (3 of 4)       → pushed diagonally into the solid: a small notch in the inner corner (CONCAVE).
// Plates take a tiny per-corner tilt so each block catches the lantern differently ("no two neighbours identical").
//
// Output: plain typed arrays (worker-ready), positions relative to the chunk's world origin (metres).
// The grid is the world's own (1B: 0.5 m voxels): one stone block per voxel.
//   position f32×3 · normal i8×4 (xyz + 0) · aMat u8×4 (layer, block seed, AO 0..255, glow class) ·
//   aMat2 u8×4 (tone, face 0..5, nugget class, edge flag 255 on bevel strips)

import { SOLID, VISIBLE } from '../../config/blocks';
import { CELL, RP, RPAD, RCHUNK, hash4 } from './cells';
import { GLOW_CLASS, LAYER_BOTTOM, LAYER_SIDE, LAYER_TOP, TONE, nuggetClass } from './layers';

/** Chamfer of a convex block edge (m): W1-LEAD §1.1 asks 3–6 cm. */
export const BEVEL = 0.05;
/** Depth of the joint between two coplanar blocks (m). */
export const SEAM = 0.022;
export const CONCAVE = 0.018;
const JIT_POINT = 0.008;
const JIT_EDGE = 0.005;
const JIT_PLATE = 0.011;
const BT = BEVEL / CELL; // bevel in lattice units

const LP = RP + 1; // lattice points per padded axis
const solidC = new Uint8Array(RP * RP * RP);
/** Per lattice point: the 8 cells around it as bits (dx + 2 dy + 4 dz for cell p − 1 + d). */
const maskP = new Uint8Array(LP * LP * LP);
const aoP = new Float32Array(LP * LP * LP);
/** Vertex caches (stamped per mesh call): lattice points, and edge vertices per (point, axis, end). */
const pCache = new Float64Array(LP * LP * LP * 3);
const pStamp = new Int32Array(LP * LP * LP);
const eCache = new Float64Array(LP * LP * LP * 18);
const eStamp = new Int32Array(LP * LP * LP * 6);
let stamp = 0;

const pidx = (i: number, j: number, k: number) => i + LP * (j + LP * k);
const cidx = (x: number, y: number, z: number) => x + RP * (y + RP * z);

/** Cell bit of the 8-cell mask for offsets (0|1) along x, y, z. */
const bit = (xo: number, yo: number, zo: number) => 1 << (xo + 2 * yo + 4 * zo);
/**
 * Tables over the 256 masks: the displacement of the lattice edge starting at the point along each axis (EDGE[m][a]:
 * the 4 cells with offset 1 along a), of the edge ending at it (EDGE_IN: offset 0), the point's own displacement (the
 * mean of its incident surface edges) and its weighted openness per octant (AO).
 */
const EDGE = new Float32Array(256 * 9);
const EDGE_IN = new Float32Array(256 * 9);
const POINT = new Float32Array(256 * 3);
function foldOf(m: number, a: number, ao: number, out: Float32Array, o: number): boolean {
  const u = (a + 1) % 3, v = (a + 2) % 3;
  const at = (uo: number, vo: number) => {
    const d = [0, 0, 0];
    d[a] = ao;
    d[u] = uo;
    d[v] = vo;
    return (m & bit(d[0], d[1], d[2])) !== 0;
  };
  const s00 = at(0, 0), s10 = at(1, 0), s01 = at(0, 1), s11 = at(1, 1);
  const n = +s00 + +s10 + +s01 + +s11;
  let du = 0, dv = 0;
  if (n === 1) {
    du = (s00 || s01 ? -1 : 1) * (BEVEL / 2);
    dv = (s00 || s10 ? -1 : 1) * (BEVEL / 2);
  } else if (n === 2) {
    if (s00 && s10) dv = -SEAM;
    else if (s01 && s11) dv = SEAM;
    else if (s00 && s01) du = -SEAM;
    else if (s10 && s11) du = SEAM;
  } else if (n === 3) {
    const ou = !s00 || !s01 ? -1 : 1;
    const ov = !s00 || !s10 ? -1 : 1;
    du = -ou * CONCAVE;
    dv = -ov * CONCAVE;
  }
  out[o + a * 3 + u] = du;
  out[o + a * 3 + v] = dv;
  return n >= 1 && n <= 3;
}
for (let m = 0; m < 256; m++) {
  let sx = 0, sy = 0, sz = 0, n = 0;
  for (let a = 0; a < 3; a++)
    for (const [ao, T] of [[1, EDGE], [0, EDGE_IN]] as const) {
      if (foldOf(m, a, ao, T, m * 9)) {
        sx += T[m * 9 + a * 3];
        sy += T[m * 9 + a * 3 + 1];
        sz += T[m * 9 + a * 3 + 2];
        n++;
      }
    }
  POINT[m * 3] = n ? sx / n : 0;
  POINT[m * 3 + 1] = n ? sy / n : 0;
  POINT[m * 3 + 2] = n ? sz / n : 0;
}
/** AOW[oct * 256 + m]: tent-weighted open count of the 8 cells of mask m when they are octant oct of a 4³ window. */
const AOW = new Float32Array(8 * 256);
for (let oct = 0; oct < 8; oct++)
  for (let m = 0; m < 256; m++) {
    let s = 0;
    for (let c = 0; c < 8; c++) {
      if (m & (1 << c)) continue;
      const cx = c & 1, cy = (c >> 1) & 1, cz = (c >> 2) & 1;
      // Octant bit 0 = the + side along that axis: its outer cell is offset 1; on the − side the outer cell is offset 0.
      const outer = (ax: number, co: number) => ((oct >> ax) & 1 ? co === 1 : co === 0);
      s += (outer(0, cx) ? 0.35 : 1) * (outer(1, cy) ? 0.35 : 1) * (outer(2, cz) ? 0.35 : 1);
    }
    AOW[oct * 256 + m] = s;
  }
const AO_TOTAL = (2 * (1 + 0.35)) ** 3;

/** The six face directions: normal axis, sign, tangent axes (U × V = n). Order +x, −x, +y, −y, +z, −z. */
const FACES = [
  { a: 0, s: 1, u: 1, v: 2 },
  { a: 0, s: -1, u: 2, v: 1 },
  { a: 1, s: 1, u: 2, v: 0 },
  { a: 1, s: -1, u: 0, v: 2 },
  { a: 2, s: 1, u: 0, v: 1 },
  { a: 2, s: -1, u: 1, v: 0 },
] as const;
const GRID_T = [0, BT, 1 - BT, 1];

export interface LanternMesh {
  positions: Float32Array;
  normals: Int8Array;
  mat: Uint8Array;
  mat2: Uint8Array;
  indices: Uint32Array;
  /** The far LOD (W1-LEAD §1.3): the same vertices, one quad per face through its four corners (2 triangles). */
  indicesFar: Uint32Array;
  vertexCount: number;
  faceCount: number;
  /** Exposed faces of ore, rich and gem cells (for the 3D nugget dressing): x, y, z (chunk-local m, face centre),
   *  face 0..5, class 1..3, seed. */
  nuggets: Float32Array;
}

/**
 * Mesh one world chunk. `pad` = its padded world voxels (mesher.ts copyPadded: 20³, PAD 2, index x + 20 (y + 20 z));
 * (ox, oy, oz) = the chunk's world voxel origin (hashes: stable under ring recycling). Positions are relative to that
 * origin in metres (voxel × 0.5).
 */
export function meshLantern(pad: Uint8Array, ox: number, oy: number, oz: number): LanternMesh {
  const cells = pad;
  for (let i = 0; i < cells.length; i++) solidC[i] = SOLID[cells[i]];
  // World lattice coordinates of padded lattice point 0.
  const lx0 = ox - RPAD, ly0 = oy - RPAD, lz0 = oz - RPAD;
  // Masks of every lattice point (the 8 cells around it).
  for (let k = 1; k < LP - 1; k++)
    for (let j = 1; j < LP - 1; j++)
      for (let i = 1; i < LP - 1; i++) {
        const c0 = cidx(i - 1, j - 1, k - 1);
        const m =
          solidC[c0] | (solidC[c0 + 1] << 1) | (solidC[c0 + RP] << 2) | (solidC[c0 + RP + 1] << 3) |
          (solidC[c0 + RP * RP] << 4) | (solidC[c0 + RP * RP + 1] << 5) | (solidC[c0 + RP * RP + RP] << 6) | (solidC[c0 + RP * RP + RP + 1] << 7);
        maskP[pidx(i, j, k)] = m;
      }
  // AO of surface points from the 8 masks around them (the 4³ cell window, tent weights).
  for (let k = 2; k < LP - 2; k++)
    for (let j = 2; j < LP - 2; j++)
      for (let i = 2; i < LP - 2; i++) {
        const m = maskP[pidx(i, j, k)];
        if (m === 0 || m === 255) continue;
        let open = 0;
        for (let oct = 0; oct < 8; oct++) {
          const ox2 = oct & 1 ? 1 : -1, oy2 = (oct >> 1) & 1 ? 1 : -1, oz2 = (oct >> 2) & 1 ? 1 : -1;
          open += AOW[oct * 256 + maskP[pidx(i + ox2, j + oy2, k + oz2)]];
        }
        // A flat surface is half open → 1.0; an inner edge ≈ 0.6; an inner corner ≈ 0.4.
        const f = Math.min(1, open / AO_TOTAL / 0.5);
        aoP[pidx(i, j, k)] = 0.22 + 0.78 * Math.sqrt(f);
      }

  // Vertex position caches: lattice points and edge vertices are shared by up to four faces.
  stamp++;
  const pointPos = (i: number, j: number, k: number, out: Float64Array, o: number) => {
    const id = pidx(i, j, k);
    const c = id * 3;
    if (pStamp[id] !== stamp) {
      pStamp[id] = stamp;
      const m = maskP[id] * 3;
      const h = hash4(lx0 + i, ly0 + j, lz0 + k, 7);
      pCache[c] = (i - RPAD) * CELL + POINT[m] + ((h & 255) / 255 - 0.5) * 2 * JIT_POINT;
      pCache[c + 1] = (j - RPAD) * CELL + POINT[m + 1] + (((h >> 8) & 255) / 255 - 0.5) * 2 * JIT_POINT;
      pCache[c + 2] = (k - RPAD) * CELL + POINT[m + 2] + (((h >> 16) & 255) / 255 - 0.5) * 2 * JIT_POINT;
    }
    out[o] = pCache[c];
    out[o + 1] = pCache[c + 1];
    out[o + 2] = pCache[c + 2];
  };
  const edgePos = (i: number, j: number, k: number, a: number, sIdx: number, out: Float64Array, o: number) => {
    const id = pidx(i, j, k);
    const slot = id * 6 + a * 2 + sIdx;
    const c = slot * 3;
    if (eStamp[slot] !== stamp) {
      eStamp[slot] = stamp;
      const e = maskP[id] * 9 + a * 3;
      const t = sIdx === 0 ? BT : 1 - BT;
      const h = hash4(lx0 + i, ly0 + j, lz0 + k, 11 + a * 2 + sIdx);
      eCache[c] = (i - RPAD + (a === 0 ? t : 0)) * CELL + EDGE[e] + ((h & 255) / 255 - 0.5) * 2 * JIT_EDGE;
      eCache[c + 1] = (j - RPAD + (a === 1 ? t : 0)) * CELL + EDGE[e + 1] + (((h >> 8) & 255) / 255 - 0.5) * 2 * JIT_EDGE;
      eCache[c + 2] = (k - RPAD + (a === 2 ? t : 0)) * CELL + EDGE[e + 2] + (((h >> 16) & 255) / 255 - 0.5) * 2 * JIT_EDGE;
    }
    out[o] = eCache[c];
    out[o + 1] = eCache[c + 1];
    out[o + 2] = eCache[c + 2];
  };

  // Count faces first (exact allocation).
  let faces = 0;
  const DX = [1, -1, 0, 0, 0, 0], DY = [0, 0, 1, -1, 0, 0], DZ = [0, 0, 0, 0, 1, -1];
  for (let z = RPAD; z < RPAD + RCHUNK; z++)
    for (let y = RPAD; y < RPAD + RCHUNK; y++)
      for (let x = RPAD; x < RPAD + RCHUNK; x++) {
        const ci = cidx(x, y, z);
        const b = cells[ci];
        if (!SOLID[b] || !VISIBLE[b]) continue;
        for (let f = 0; f < 6; f++) if (!solidC[ci + DX[f] + RP * (DY[f] + RP * DZ[f])]) faces++;
      }
  const V = faces * 16;
  const positions = new Float32Array(V * 3);
  const normals = new Int8Array(V * 4);
  const mat = new Uint8Array(V * 4);
  const mat2 = new Uint8Array(V * 4);
  const indices = new Uint32Array(faces * 54);
  const indicesFar = new Uint32Array(faces * 6);
  let fi = 0;
  const nug: number[] = [];
  const vp = new Float64Array(48);
  const vn = new Float64Array(48);
  const cAo = [0, 0, 0, 0];
  let vi0 = 0, ii = 0;
  const q = [0, 0, 0];
  const o3 = [0, 0, 0];
  for (let z = RPAD; z < RPAD + RCHUNK; z++)
    for (let y = RPAD; y < RPAD + RCHUNK; y++)
      for (let x = RPAD; x < RPAD + RCHUNK; x++) {
        const ci = cidx(x, y, z);
        const b = cells[ci];
        if (!SOLID[b] || !VISIBLE[b]) continue;
        let cellHash = -1;
        for (let f = 0; f < 6; f++) {
          if (solidC[ci + DX[f] + RP * (DY[f] + RP * DZ[f])]) continue;
          if (cellHash < 0) cellHash = hash4(lx0 + x, ly0 + y, lz0 + z, 5);
          const F = FACES[f];
          const Fu = F.u, Fv = F.v, Fa = F.a;
          o3[0] = x;
          o3[1] = y;
          o3[2] = z;
          if (F.s > 0) o3[Fa] += 1;
          for (let jv = 0; jv < 4; jv++)
            for (let iu = 0; iu < 4; iu++) {
              const o = (jv * 4 + iu) * 3;
              const cu = iu === 0 || iu === 3, cv = jv === 0 || jv === 3;
              q[0] = o3[0];
              q[1] = o3[1];
              q[2] = o3[2];
              if (cu && cv) {
                if (iu === 3) q[Fu] += 1;
                if (jv === 3) q[Fv] += 1;
                pointPos(q[0], q[1], q[2], vp, o);
              } else if (cv) {
                if (jv === 3) q[Fv] += 1;
                edgePos(q[0], q[1], q[2], Fu, iu === 1 ? 0 : 1, vp, o);
              } else if (cu) {
                if (iu === 3) q[Fu] += 1;
                edgePos(q[0], q[1], q[2], Fv, jv === 1 ? 0 : 1, vp, o);
              } else {
                vp[o] = (o3[0] - RPAD) * CELL;
                vp[o + 1] = (o3[1] - RPAD) * CELL;
                vp[o + 2] = (o3[2] - RPAD) * CELL;
                vp[o + Fu] += GRID_T[iu] * CELL;
                vp[o + Fv] += GRID_T[jv] * CELL;
                const hj = (((cellHash >>> ((f * 4 + (iu - 1) + (jv - 1) * 2) & 15)) * 2654435761) >>> 22) / 1023 - 0.5;
                vp[o + Fa] += F.s * hj * 2 * JIT_PLATE;
              }
            }
          // Normals: area-weighted sub-quad normals per vertex (this face only); flat plates.
          vn.fill(0);
          for (let jv = 0; jv < 3; jv++)
            for (let iu = 0; iu < 3; iu++) {
              const A = (jv * 4 + iu) * 3, Bq = A + 3, D = A + 12, Cq = A + 15;
              const e1x = vp[Cq] - vp[A], e1y = vp[Cq + 1] - vp[A + 1], e1z = vp[Cq + 2] - vp[A + 2];
              const e2x = vp[D] - vp[Bq], e2y = vp[D + 1] - vp[Bq + 1], e2z = vp[D + 2] - vp[Bq + 2];
              const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
              vn[A] += nx; vn[A + 1] += ny; vn[A + 2] += nz;
              vn[Bq] += nx; vn[Bq + 1] += ny; vn[Bq + 2] += nz;
              vn[Cq] += nx; vn[Cq + 1] += ny; vn[Cq + 2] += nz;
              vn[D] += nx; vn[D + 1] += ny; vn[D + 2] += nz;
            }
          {
            const A = 15, Bq = 18, Cq = 30, D = 27;
            const e1x = vp[Cq] - vp[A], e1y = vp[Cq + 1] - vp[A + 1], e1z = vp[Cq + 2] - vp[A + 2];
            const e2x = vp[D] - vp[Bq], e2y = vp[D + 1] - vp[Bq + 1], e2z = vp[D + 2] - vp[Bq + 2];
            const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
            for (const k2 of [15, 18, 27, 30]) {
              vn[k2] = nx;
              vn[k2 + 1] = ny;
              vn[k2 + 2] = nz;
            }
          }
          // AO at the four face corners (bilinear inside).
          for (let c = 0; c < 4; c++) {
            q[0] = o3[0];
            q[1] = o3[1];
            q[2] = o3[2];
            q[Fu] += c & 1;
            q[Fv] += c >> 1;
            cAo[c] = aoP[pidx(q[0], q[1], q[2])];
          }
          const layer = Fa === 1 ? (F.s > 0 ? LAYER_TOP[b] : LAYER_BOTTOM[b]) : LAYER_SIDE[b];
          const glow = GLOW_CLASS[b];
          const tone = TONE[b];
          const nc = nuggetClass(b);
          const seed = cellHash & 255;
          for (let k2 = 0; k2 < 16; k2++) {
            const vi = vi0 + k2;
            const o = k2 * 3;
            positions[vi * 3] = vp[o];
            positions[vi * 3 + 1] = vp[o + 1];
            positions[vi * 3 + 2] = vp[o + 2];
            const nx = vn[o], ny = vn[o + 1], nz = vn[o + 2];
            const l = 127 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
            normals[vi * 4] = Math.round(nx * l);
            normals[vi * 4 + 1] = Math.round(ny * l);
            normals[vi * 4 + 2] = Math.round(nz * l);
            const iu = k2 & 3, jv = k2 >> 2;
            const tu = GRID_T[iu], tv = GRID_T[jv];
            const ao = (cAo[0] * (1 - tu) + cAo[1] * tu) * (1 - tv) + (cAo[2] * (1 - tu) + cAo[3] * tu) * tv;
            const m4 = vi * 4;
            mat[m4] = layer;
            mat[m4 + 1] = seed;
            mat[m4 + 2] = Math.round(Math.min(1, ao) * 255);
            mat[m4 + 3] = glow;
            mat2[m4] = tone;
            mat2[m4 + 1] = f;
            mat2[m4 + 2] = nc;
            mat2[m4 + 3] = iu === 0 || iu === 3 || jv === 0 || jv === 3 ? 255 : 0;
          }
          for (let jv = 0; jv < 3; jv++)
            for (let iu = 0; iu < 3; iu++) {
              const a0 = vi0 + jv * 4 + iu, b0 = a0 + 1, c0 = a0 + 5, d0 = a0 + 4;
              indices[ii++] = a0;
              indices[ii++] = b0;
              indices[ii++] = c0;
              indices[ii++] = a0;
              indices[ii++] = c0;
              indices[ii++] = d0;
            }
          indicesFar[fi++] = vi0;
          indicesFar[fi++] = vi0 + 3;
          indicesFar[fi++] = vi0 + 15;
          indicesFar[fi++] = vi0;
          indicesFar[fi++] = vi0 + 15;
          indicesFar[fi++] = vi0 + 12;
          vi0 += 16;
          if (nc && !(Fa === 1 && F.s < 0)) nug.push((vp[15] + vp[30]) / 2, (vp[16] + vp[31]) / 2, (vp[17] + vp[32]) / 2, f, nc, (cellHash >>> 8) & 255);
        }
      }
  return { positions, normals, mat, mat2, indices, indicesFar, vertexCount: V, faceCount: faces, nuggets: new Float32Array(nug) };
}
