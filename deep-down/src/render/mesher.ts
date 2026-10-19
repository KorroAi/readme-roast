import { B, SOLID, VISIBLE } from '../config/blocks';
import type { VoxelWorld } from '../world/VoxelWorld';
import { FAMILY, FAMILY_OF, MAT_BOTTOM, MAT_SIDE, MAT_TOP, RIGIDITY, RUNE_FLAG } from './materials';

/**
 * Chunk mesher: one quad per visible block face that touches a non-opaque voxel, sculpted into
 * modelled rock.
 *
 * Shape. Every quad corner sits on a lattice point, the centre of the 2x2x2 block of voxels
 * around it (a surface-nets dual cell). The corner moves toward that cell's surface-nets point
 * (the mean of the midpoints of the cell's solid/air edges), weighted by rigidity: flat floors and
 * walls stay exactly in place, convex edges bevel by 0.25 m, convex corners by 0.33 m, concave
 * creases fill, a 1 m step becomes a slope and a 2x2 shaft an octagon. On top, natural rock gets
 * world-space noise relief along the surface normal (about 2.6 m and 7 m features) and a small
 * tangential jitter, so arrises are not ruler-straight. Masonry is only chipped, timber is exact.
 * Walkable tops keep their height (flat interiors move by exactly 0; edges by the bevel only).
 *
 * Shading. Each lattice point gets a smooth normal: the 2x2x2 occupancy gradient, bent by the
 * analytic gradient of the relief noise. Natural rock uses it as is (rounded, modelled form under
 * the lantern instead of a printed triangle lattice); masonry, crystal and timber faces keep their
 * flat face normal so arrises stay crisp. Quads that the sculpting folds are split along the
 * diagonal that agrees with those normals; flat quads keep the AO-symmetric split.
 *
 * Everything about a lattice point is a pure function of its world position and the 8 voxels
 * around it, so a vertex shared by two chunks (the 1-voxel padding sees the same voxels) gets
 * bit-identical offset and normal bytes from both: no cracks and no lighting seams.
 *
 * Vertex format: one interleaved Uint8 buffer, 16 bytes per vertex.
 *   0..3   aGeo    lattice corner x, y, z (chunk-local 0..16), octahedral normal x (0..254)
 *   4..7   aData   face 0..5, ambient occlusion 0..3 x AO_SCALE, material layer,
 *                  bits: u | v << 1 | rigidity << 2 | family << 4 | rune << 6
 *   8..11  aNb     material layer of the in-plane neighbour across each face edge
 *                  (-t1, +t1, -t2, +t2), 255 when no boundary should be drawn
 *   12..15 aShape  sculpted offset x, y, z (128 = 0, OFFSET_RANGE / 127 m per step),
 *                  octahedral normal y (0..254)
 * The fragment shader keeps the undisplaced lattice position (vGrid) for cell picking, world
 * texture coordinates and the boundary blend, so mining and materials stay on the right block.
 *
 * Pure function of the voxel data, so it is unit-testable and can move to a worker.
 */

/** Bytes per vertex in ChunkMeshData.vertices. */
export const VERTEX_BYTES = 16;
/** Largest sculpted offset per axis, in metres (Uint8 step = OFFSET_RANGE / 127). */
export const OFFSET_RANGE = 1.0;
const OFF_STEP = OFFSET_RANGE / 127;

export class ChunkMeshData {
  private cachePos: Uint8Array | null = null;
  private cacheData: Uint8Array | null = null;
  private cacheNb: Uint8Array | null = null;

  constructor(
    /** Interleaved vertex bytes, VERTEX_BYTES per vertex (see the format above). */
    readonly vertices: Uint8Array,
    readonly indices: Uint16Array | Uint32Array,
    readonly vertexCount: number,
    readonly faceCount: number,
    /** Seam hash per neighbour chunk, index (dx+1) + 3 (dy+1) + 9 (dz+1) (see seamHashes). */
    readonly seams: Uint32Array = new Uint32Array(27),
  ) {}

  private pick(offset: number, n: number): Uint8Array {
    const out = new Uint8Array(this.vertexCount * n);
    for (let v = 0; v < this.vertexCount; v++) for (let k = 0; k < n; k++) out[v * n + k] = this.vertices[v * VERTEX_BYTES + offset + k];
    return out;
  }

  /** Lattice corners (Uint8 x3 per vertex): the undisplaced grid position. */
  get positions(): Uint8Array {
    return (this.cachePos ??= this.pick(0, 3));
  }

  /** [face, AO 0..3 (floored: any occlusion reads below 3), material layer, bits] per vertex. */
  get data(): Uint8Array {
    if (!this.cacheData) {
      const d = this.pick(4, 4);
      for (let v = 0; v < this.vertexCount; v++) d[v * 4 + 1] = Math.floor(d[v * 4 + 1] / AO_SCALE);
      this.cacheData = d;
    }
    return this.cacheData;
  }

  /** Ambient occlusion of vertex `v`, 0..3 with the fraction the shader sees. */
  ao(v: number): number {
    return this.vertices[v * VERTEX_BYTES + 5] / AO_SCALE;
  }

  /** Boundary partner layers per vertex. */
  get nb(): Uint8Array {
    return (this.cacheNb ??= this.pick(8, 4));
  }

  /** Sculpted offset of vertex `v` in metres (exactly what the vertex shader adds). */
  offset(v: number, out: number[] = [0, 0, 0]): number[] {
    const b = v * VERTEX_BYTES + 12;
    for (let k = 0; k < 3; k++) out[k] = (this.vertices[b + k] - 128) * OFF_STEP;
    return out;
  }

  /** Shading normal of vertex `v` (decoded exactly like the vertex shader). */
  normal(v: number, out: number[] = [0, 0, 0]): number[] {
    const b = v * VERTEX_BYTES;
    return octDecode((this.vertices[b + 3] - 127) / 127, (this.vertices[b + 15] - 127) / 127, out);
  }
}

// Face order: +X, -X, +Y, -Y, +Z, -Z. Corners are counter-clockwise seen from outside.
const FACE_NORMALS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
] as const;

const FACE_CORNERS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];

// Texture coordinates per corner so side textures stay upright and are not mirrored.
const FACE_UVS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[1, 0], [1, 1], [0, 1], [0, 0]],
  [[1, 0], [1, 1], [0, 1], [0, 0]],
  [[0, 0], [0, 1], [1, 1], [1, 0]],
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [0, 1]],
];

const PAD = 2; // border voxels on each side: the wide normal reads 2 voxels around a corner
const P = 16 + 2 * PAD; // padded chunk edge
const P2 = P * P;
const pad = new Uint8Array(P * P * P);

// AO sample offsets per face/corner: [side1, side2, diagonal] as padded-array index deltas
// relative to the voxel in front of the face.
const AO_OFFSETS: Int32Array[] = [];
for (let f = 0; f < 6; f++) {
  const n = FACE_NORMALS[f];
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  const t1 = (axis + 1) % 3;
  const t2 = (axis + 2) % 3;
  const arr = new Int32Array(12);
  for (let c = 0; c < 4; c++) {
    const corner = FACE_CORNERS[f][c];
    const s1 = corner[t1] * 2 - 1;
    const s2 = corner[t2] * 2 - 1;
    const v1 = [0, 0, 0];
    const v2 = [0, 0, 0];
    v1[t1] = s1;
    v2[t2] = s2;
    const idx = (v: number[]) => v[0] + v[1] * P + v[2] * P2;
    arr[c * 3] = idx(v1);
    arr[c * 3 + 1] = idx(v2);
    arr[c * 3 + 2] = idx([v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]]);
  }
  AO_OFFSETS.push(arr);
}
const FACE_DELTA = FACE_NORMALS.map((n) => n[0] + n[1] * P + n[2] * P2);

const MAX_FACES = 16 * 16 * 16 * 6;
const scratchVerts = new Uint8Array(MAX_FACES * 4 * VERTEX_BYTES);
const scratchIdx = new Uint32Array(MAX_FACES * 6);

// In-plane tangents per face axis (must match the terrain shader): X faces use (Y, Z),
// Y faces use (X, Z), Z faces use (X, Y).
const TANGENT_DELTA = [0, 1, 2].map((axis) => {
  const t1 = axis === 0 ? 1 : 0;
  const t2 = axis === 2 ? 1 : 2;
  const d = (a: number) => (a === 0 ? 1 : a === 1 ? P : P2);
  return [d(t1), d(t2)];
});

/** Opaque = occludes neighbor faces and casts ambient occlusion. */
const OPAQUE = new Uint8Array(256);
for (let i = 0; i < 256; i++) OPAQUE[i] = SOLID[i] && VISIBLE[i] ? 1 : 0;

// ---------------------------------------------------------------------------------------------
// Dual-cell tables, indexed by the 2x2x2 occupancy mask around a lattice point
// (bit dx + 2 dy + 4 dz is set when that voxel is opaque; dx = 0 is the voxel at x - 1).

/** Surface-nets point relative to the lattice point (mean of the solid/air edge midpoints). */
const SN_OFF = new Float32Array(256 * 3);
/** Unit occupancy gradient, pointing from solid into air (0 when ambiguous). */
const SN_NRM = new Float32Array(256 * 3);
/** 1 when one of the four lower voxels is a walkable top (opaque with air above it). */
const WALK = new Uint8Array(256);
/** 1 when one of the four upper voxels is a ceiling (opaque with air below it). */
const CEIL = new Uint8Array(256);
/** The flat-floor cell: the four lower voxels opaque, the four upper ones open. */
const FLAT_FLOOR = 1 | 2 | 16 | 32;
for (let m = 0; m < 256; m++) {
  let ox = 0;
  let oy = 0;
  let oz = 0;
  let edges = 0;
  for (let i = 0; i < 8; i++)
    for (const bit of [1, 2, 4]) {
      if (i & bit) continue;
      const j = i | bit;
      if (((m >> i) & 1) === ((m >> j) & 1)) continue;
      ox += ((i & 1) + (j & 1)) * 0.5 - 0.5;
      oy += (((i >> 1) & 1) + ((j >> 1) & 1)) * 0.5 - 0.5;
      oz += (((i >> 2) & 1) + ((j >> 2) & 1)) * 0.5 - 0.5;
      edges++;
    }
  if (edges) {
    SN_OFF[m * 3] = ox / edges;
    SN_OFF[m * 3 + 1] = oy / edges;
    SN_OFF[m * 3 + 2] = oz / edges;
  }
  let gx = 0;
  let gy = 0;
  let gz = 0;
  for (let i = 0; i < 8; i++) {
    const s = (m >> i) & 1 ? -1 : 1;
    gx += s * ((i & 1) - 0.5);
    gy += s * (((i >> 1) & 1) - 0.5);
    gz += s * (((i >> 2) & 1) - 0.5);
  }
  const gl = Math.hypot(gx, gy, gz);
  if (gl > 0.5) {
    SN_NRM[m * 3] = gx / gl;
    SN_NRM[m * 3 + 1] = gy / gl;
    SN_NRM[m * 3 + 2] = gz / gl;
  }
  for (const i of [0, 1, 4, 5]) {
    if ((m >> i) & 1 && !((m >> (i + 2)) & 1)) WALK[m] = 1;
    if (!((m >> i) & 1) && (m >> (i + 2)) & 1) CEIL[m] = 1;
  }
}

// Sculpting per vertex rigidity (timber, masonry / crystal / hearth, firm rock, natural rock).
/** Weight of the surface-nets chamfer. */
const CHAMFER = [0, 0.12, 0.7, 1.0];
/** Relief along the normal, metres (noise amplitude). */
const RELIEF = [0, 0.035, 0.16, 0.36];
/** Tangential jitter, metres. */
const JITTER = [0, 0.02, 0.06, 0.13];
/** Share of the smooth lattice normal in the shading normal (0 = flat face normal). */
const SMOOTH = [0, 0, 0.8, 1];
/** On walkable vertices (feet stay on the floor): share of the bevel's and of the noise's
 *  vertical offset. Edges move at most ~0.25 m, convex corners ~0.3 m, flat interiors 0. */
const WALK_CHAMFER_Y = 0.85;
const WALK_NOISE_Y = 0.1;
/** Relief on ceilings (the explorer's hat in a 2 m tunnel). */
const CEIL_RELIEF = 0.6;
/** Largest downward offset of a ceiling vertex, metres. */
const CEIL_SAG = 0.12;
/** Largest offset of any vertex out of the rock along its normal, metres. */
const MAX_INTRUDE = 0.4;

// ---------------------------------------------------------------------------------------------
// Value noise with an analytic gradient (quintic fade), hashed on the integer lattice: a pure,
// deterministic function of world position, so both chunks that share a vertex agree.

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

// Relief field: two octaves, irrational-ish frequencies so lattice points never alias. The first
// octave's lattice hashes also carry a 3-channel tangential jitter (bits 16..30), so the jitter
// costs no extra hashing.
const F1 = 1 / 2.6;
const F2 = 1 / 7.3;
const RH = new Float64Array(4);
const JX = new Float64Array(3);
function relief(x: number, y: number, z: number): void {
  const px = x * F1 + 0.37;
  const py = y * F1 * 1.3 + 0.11;
  const pz = z * F1 + 0.73;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fy = py - iy;
  const fz = pz - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const K = 1 / 32767.5;
  const J = 1 / 15.5;
  let v = 0;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let j0 = 0;
  let j1 = 0;
  let j2 = 0;
  for (let c = 0; c < 8; c++) {
    const cx = c & 1;
    const cy = (c >> 1) & 1;
    const cz = (c >> 2) & 1;
    const h = hash3(ix + cx, iy + cy, iz + cz, 0x5ca1ab1e);
    const val = (h & 0xffff) * K - 1;
    const wx = cx ? ux : 1 - ux;
    const wy = cy ? uy : 1 - uy;
    const wz = cz ? uz : 1 - uz;
    const sx = cx ? 1 : -1;
    const sy = cy ? 1 : -1;
    const sz = cz ? 1 : -1;
    const wxy = wx * wy;
    const w = wxy * wz;
    v += w * val;
    gx += sx * wy * wz * val;
    gy += sy * wx * wz * val;
    gz += sz * wxy * val;
    j0 += w * (((h >>> 16) & 31) * J - 1);
    j1 += w * (((h >>> 21) & 31) * J - 1);
    j2 += w * (((h >>> 26) & 31) * J - 1);
  }
  RH[0] = v * 0.6;
  RH[1] = gx * dux * 0.6 * F1;
  RH[2] = gy * duy * 0.6 * F1 * 1.3;
  RH[3] = gz * duz * 0.6 * F1;
  JX[0] = j0;
  JX[1] = j1;
  JX[2] = j2;
  // Second octave: value only (its slope is a quarter of the first octave's; the normal ignores it).
  const qx = x * F2 + 5.1;
  const qy = y * F2 + 1.7;
  const qz = z * F2 + 3.3;
  const kx = Math.floor(qx);
  const ky = Math.floor(qy);
  const kz = Math.floor(qz);
  let tx = qx - kx;
  let ty = qy - ky;
  let tz = qz - kz;
  tx = tx * tx * (3 - 2 * tx);
  ty = ty * ty * (3 - 2 * ty);
  tz = tz * tz * (3 - 2 * tz);
  let v2 = 0;
  for (let c = 0; c < 8; c++) {
    const cx = c & 1;
    const cy = (c >> 1) & 1;
    const cz = (c >> 2) & 1;
    const w = (cx ? tx : 1 - tx) * (cy ? ty : 1 - ty) * (cz ? tz : 1 - tz);
    v2 += w * ((hash3(kx + cx, ky + cy, kz + cz, 0x0dd5eed5) & 0xffff) * K - 1);
  }
  RH[0] += v2 * 0.4;
}

// Octahedral normal encoding (two components in [-1, 1]).
function octDecode(ex: number, ey: number, out: number[]): number[] {
  let x = ex;
  let y = ey;
  const z = 1 - Math.abs(ex) - Math.abs(ey);
  if (z < 0) {
    x = (1 - Math.abs(ey)) * (ex >= 0 ? 1 : -1);
    y = (1 - Math.abs(ex)) * (ey >= 0 ? 1 : -1);
  }
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l;
  out[1] = y / l;
  out[2] = z / l;
  return out;
}

/** Byte pair (0..254, 127 = 0) for a unit normal, written to out[ox] and out[oy]. */
function octEncode(x: number, y: number, z: number, out: Uint8Array, ox: number, oy: number): void {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let ex = x / s;
  let ey = y / s;
  if (z < 0) {
    const tx = (1 - Math.abs(ey)) * (ex >= 0 ? 1 : -1);
    ey = (1 - Math.abs(ex)) * (ey >= 0 ? 1 : -1);
    ex = tx;
  }
  out[ox] = Math.round(ex * 127) + 127;
  out[oy] = Math.round(ey * 127) + 127;
}

/** Octahedral bytes of the six face normals. */
const FACE_OCT = new Uint8Array(12);
for (let f = 0; f < 6; f++) octEncode(FACE_NORMALS[f][0], FACE_NORMALS[f][1], FACE_NORMALS[f][2], FACE_OCT, f * 2, f * 2 + 1);

// ---------------------------------------------------------------------------------------------
// Per-lattice-point cache (17^3 points per chunk), valid for one meshChunk call.

const L = 17;
const lStamp = new Int32Array(L * L * L);
const lOff = new Uint8Array(L * L * L * 3);
const lNrm = new Float32Array(L * L * L * 3);
const lOct = new Uint8Array(L * L * L * 2);
const lRig = new Uint8Array(L * L * L);
/** Smooth ambient occlusion byte (0..3 x AO_SCALE) from the 4x4x4 openness (natural rock). */
const lAo = new Uint8Array(L * L * L);
let stamp = 0;

/** Mesher options (debug viewer): `sculpt: false` meshes plain cubes with face normals. */
export const MESH_OPTIONS = { sculpt: true, wide: 1, relax: 0.5, smoothAo: true, aoBias: 0.1, aoPow: 3 };
/** AO byte = AO (0..3) x AO_SCALE, so the smooth lattice AO keeps its gradient (the vertex
 *  shader divides). */
export const AO_SCALE = 85;

// 4x4x4 voxel window around a corner with tent weights (1/3, 1, 1, 1/3 per axis). The window is
// read as 16 rows of 4 voxels from per-row occupancy bits: per 4-bit row pattern, the tent sum of
// the signed occupancy (air +1, solid -1) and of its x-moment.
const TENT = [1 / 3, 1, 1, 1 / 3];
/** Signed openness above which a window is treated as unoccluded (flat, convex, gentle slopes). */
const AO_OPEN = 0.25;
/** Gradient magnitude of the window over a flat half-space: 2 x (8/3)^2. */
const HALF_SPACE_G = 2 * (8 / 3) ** 2;
const ROW_T = new Float32Array(16);
const ROW_D = new Float32Array(16);
for (let pt = 0; pt < 16; pt++)
  for (let i = 0; i < 4; i++) {
    const sgn = (pt >> i) & 1 ? -1 : 1;
    ROW_T[pt] += TENT[i] * sgn;
    ROW_D[pt] += TENT[i] * (i - 1.5) * sgn;
  }
/** Per padded row (y + z * P): bit x set when voxel x of that row is opaque. */
const rowBits = new Uint32Array(P * P);

/** Sculpt rigidity per block id: crystal is shaped like its host rock (its faces stay flat). */
const SCULPT_RIGIDITY = new Uint8Array(RIGIDITY);
SCULPT_RIGIDITY[B.CRYSTAL] = 3;
/** Depth of the groove a crystal seam sits in, metres. */
const CRYSTAL_INSET = 0.2;

/** 2x2x2 occupancy mask from four row-bit words (rows (y,z), (y+1,z), (y,z+1), (y+1,z+1)) at bit x. */
function mask4(b00: number, b10: number, b01: number, b11: number, x: number): number {
  return ((b00 >>> x) & 3) | (((b10 >>> x) & 3) << 2) | (((b01 >>> x) & 3) << 4) | (((b11 >>> x) & 3) << 6);
}

/**
 * Compute offset, smooth normal, AO and rigidity of lattice point (lx, ly, lz) (chunk-local
 * corner coords 0..16; world corner = origin + local). Returns the cache index.
 */
function lattice(lx: number, ly: number, lz: number, wx: number, wy: number, wz: number): number {
  const li = lx + ly * L + lz * L * L;
  if (lStamp[li] === stamp) return li;
  lStamp[li] = stamp;
  // Voxel (bx,by,bz) in chunk-local coords lives at padded index (bx+PAD) + (by+PAD)*P + ...;
  // the voxels around corner (lx,ly,lz) are bx in {lx-1, lx}.
  const base = lx + PAD - 1 + (ly + PAD - 1) * P + (lz + PAD - 1) * P2;
  let mask = 0;
  let r = 3;
  let crystals = 0;
  for (let i = 0; i < 8; i++) {
    const id = pad[base + (i & 1) + ((i >> 1) & 1) * P + ((i >> 2) & 1) * P2];
    if (OPAQUE[id]) {
      mask |= 1 << i;
      if (id === B.CRYSTAL) crystals++;
    }
    const rv = SCULPT_RIGIDITY[id];
    if (rv < r) r = rv;
  }
  lRig[li] = r;
  const o3 = li * 3;
  if (mask === 0 || mask === 255) {
    // No surface through this corner (only reached by the seam hash).
    lOff[o3] = lOff[o3 + 1] = lOff[o3 + 2] = 128;
    lNrm[o3] = lNrm[o3 + 1] = lNrm[o3 + 2] = 0;
    lOct[li * 2] = lOct[li * 2 + 1] = 127;
    lAo[li] = 3 * AO_SCALE;
    return li;
  }
  const m3 = mask * 3;
  let nx = SN_NRM[m3];
  let ny = SN_NRM[m3 + 1];
  let nz = SN_NRM[m3 + 2];
  // Occupancy gradient over the 4x4x4 voxels around the corner (tent weights): the wall's own
  // orientation, so voxel terraces on a slope do not shade as a row of pillows.
  const wide = MESH_OPTIONS.wide;
  let gx = 0;
  let gy = 0;
  let gz = 0;
  let open = 0; // signed tent sum: > 0 when the window is more than half air
  if (wide > 0 || MESH_OPTIONS.smoothAo) {
    // Window voxels x in lx-2..lx+1 are padded columns lx..lx+3 (PAD = 2).
    for (let k = 0; k < 4; k++) {
      const tk = TENT[k];
      const ck = k - 1.5;
      const rk = (lz + k) * P + ly;
      for (let j = 0; j < 4; j++) {
        const pt = (rowBits[rk + j] >>> lx) & 15;
        const w = TENT[j] * tk;
        const rt = ROW_T[pt] * w;
        open += rt;
        gx += ROW_D[pt] * w;
        gy += rt * (j - 1.5);
        gz += rt * ck;
      }
    }
  }
  const gl = Math.sqrt(gx * gx + gy * gy + gz * gz);
  if (wide > 0 && gl > 1e-3 && (nx !== 0 || ny !== 0 || nz !== 0)) {
    nx = nx * (1 - wide) + (gx / gl) * wide;
    ny = ny * (1 - wide) + (gy / gl) * wide;
    nz = nz * (1 - wide) + (gz / gl) * wide;
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
  }
  // Smooth ambient occlusion for natural rock: the share of rock in front of the surface over
  // the 4x4x4 window, each voxel weighted by its depth along the normal, minus a small bias.
  // Flat and convex rock read 3, a 1 m step of a voxel staircase about 2.8 (no dark line at every
  // step), a wall's foot about 2.1, an inner corner about 0.4. Thin slabs are not lightened by
  // the air behind them.
  lAo[li] = 3 * AO_SCALE;
  // A window that is one flat half-space (the gradient is axis-aligned at full strength) has
  // nothing in front of the surface: skip the loop.
  const planar = Math.abs(gl - HALF_SPACE_G) < 1e-3 && (Math.abs(gx) > HALF_SPACE_G - 1e-3 || Math.abs(gy) > HALF_SPACE_G - 1e-3 || Math.abs(gz) > HALF_SPACE_G - 1e-3);
  if (MESH_OPTIONS.smoothAo && r === 3 && !planar && open < AO_OPEN && (nx !== 0 || ny !== 0 || nz !== 0)) {
    let occ = 0;
    let tot = 0;
    for (let k = 0; k < 4; k++) {
      const tk = TENT[k];
      const ak = nz * (k - 1.5);
      const rk = (lz + k) * P + ly;
      for (let j = 0; j < 4; j++) {
        const pt = (rowBits[rk + j] >>> lx) & 15;
        const tj = TENT[j] * tk;
        const a = ak + ny * (j - 1.5);
        for (let i = 0; i < 4; i++) {
          const d = a + nx * (i - 1.5);
          if (d <= 0) continue;
          const w = TENT[i] * tj * d;
          tot += w;
          if ((pt >> i) & 1) occ += w;
        }
      }
    }
    if (tot > 0) lAo[li] = Math.round(3 * AO_SCALE * Math.pow(1 - Math.max(0, occ / tot - MESH_OPTIONS.aoBias) / (1 - MESH_OPTIONS.aoBias), MESH_OPTIONS.aoPow));
  }
  let ox = 0;
  let oy = 0;
  let oz = 0;
  if (MESH_OPTIONS.sculpt && mask !== FLAT_FLOOR && r > 0) {
    const ch = CHAMFER[r];
    let sx = SN_OFF[m3];
    let sy = SN_OFF[m3 + 1];
    let sz = SN_OFF[m3 + 2];
    // One Laplacian relaxation toward the surface-nets points of the 6 neighbouring lattice
    // points: on a wall that curves across the voxel grid (1:2, 1:3 steps) every step would
    // otherwise bevel into the same rounded lump, a quilt. Natural rock only.
    const relax = r >= 2 ? MESH_OPTIONS.relax : 0;
    if (relax > 0) {
      // Neighbour masks from the row bits: the 2x2 voxel columns of rows (y, z) .. (y+1, z+1),
      // shifted to x. Rows r0 (y, z), r0 + 1 (y+1, z), r0 + P (y, z+1), r0 + P + 1.
      const r0 = (lz + PAD - 1) * P + ly + PAD - 1;
      const sh = lx + PAD - 1;
      const a1 = rowBits[r0 - P];
      const a2 = rowBits[r0 - P + 1];
      const a3 = rowBits[r0 - 1];
      const a4 = rowBits[r0];
      const a5 = rowBits[r0 + 1];
      const a6 = rowBits[r0 + 2];
      const a7 = rowBits[r0 + P - 1];
      const a8 = rowBits[r0 + P];
      const a9 = rowBits[r0 + P + 1];
      const a10 = rowBits[r0 + P + 2];
      const a11 = rowBits[r0 + 2 * P];
      const a12 = rowBits[r0 + 2 * P + 1];
      let ax = 0;
      let ay = 0;
      let az = 0;
      let cnt = 0;
      let nm = mask4(a4, a5, a8, a9, sh - 1); // -x
      if (nm !== 0 && nm !== 255) (ax += SN_OFF[nm * 3] - 1), (ay += SN_OFF[nm * 3 + 1]), (az += SN_OFF[nm * 3 + 2]), cnt++;
      nm = mask4(a4, a5, a8, a9, sh + 1); // +x
      if (nm !== 0 && nm !== 255) (ax += SN_OFF[nm * 3] + 1), (ay += SN_OFF[nm * 3 + 1]), (az += SN_OFF[nm * 3 + 2]), cnt++;
      nm = mask4(a3, a4, a7, a8, sh); // -y
      if (nm !== 0 && nm !== 255) (ax += SN_OFF[nm * 3]), (ay += SN_OFF[nm * 3 + 1] - 1), (az += SN_OFF[nm * 3 + 2]), cnt++;
      nm = mask4(a5, a6, a9, a10, sh); // +y
      if (nm !== 0 && nm !== 255) (ax += SN_OFF[nm * 3]), (ay += SN_OFF[nm * 3 + 1] + 1), (az += SN_OFF[nm * 3 + 2]), cnt++;
      nm = mask4(a1, a2, a4, a5, sh); // -z
      if (nm !== 0 && nm !== 255) (ax += SN_OFF[nm * 3]), (ay += SN_OFF[nm * 3 + 1]), (az += SN_OFF[nm * 3 + 2] - 1), cnt++;
      nm = mask4(a8, a9, a11, a12, sh); // +z
      if (nm !== 0 && nm !== 255) (ax += SN_OFF[nm * 3]), (ay += SN_OFF[nm * 3 + 1]), (az += SN_OFF[nm * 3 + 2] + 1), cnt++;
      if (cnt) {
        const inv = relax / cnt;
        sx += ax * inv - sx * relax;
        // Walkable tops relax only sideways: their height stays the bevel's (feet on the floor).
        if (!WALK[mask]) sy += ay * inv - sy * relax;
        sz += az * inv - sz * relax;
      }
    }
    ox = sx * ch;
    oy = sy * ch * (WALK[mask] ? WALK_CHAMFER_Y : 1);
    oz = sz * ch;
    const hasN = nx !== 0 || ny !== 0 || nz !== 0;
    // Noise relief along the normal, plus a tangential jitter. Thin convex features (a lone
    // voxel, a 1-voxel fin) get less, so the relief cannot turn them inside out.
    relief(wx, wy, wz);
    let solids = 0;
    for (let m = mask; m; m &= m - 1) solids++;
    let amp = RELIEF[r] * (solids <= 1 ? 0.35 : solids <= 2 ? 0.7 : 1);
    if (CEIL[mask] && ny < -0.5) amp *= CEIL_RELIEF;
    const h = RH[0] * amp;
    let rx = nx * h;
    let ry = ny * h;
    let rz = nz * h;
    const jt = JX[0] * nx + JX[1] * ny + JX[2] * nz;
    const ja = JITTER[r];
    rx += (JX[0] - jt * nx) * ja;
    ry += (JX[1] - jt * ny) * ja;
    rz += (JX[2] - jt * nz) * ja;
    if (WALK[mask]) ry *= WALK_NOISE_Y;
    // A crystal seam sits sunk in a groove of its host rock, not proud of it as a box.
    if (crystals && hasN) {
      const d = CRYSTAL_INSET * Math.min(1, (2 * crystals) / solids);
      rx -= nx * d;
      ry -= ny * d * (WALK[mask] ? WALK_NOISE_Y : 1);
      rz -= nz * d;
    }
    ox += rx;
    oy += ry;
    oz += rz;
    if (hasN) {
      // Rock never reaches more than MAX_INTRUDE into the open voxel in front of it (camera and
      // character collide with voxels), and ceilings sag at most CEIL_SAG (headroom in 2 m
      // tunnels for the hat and pack poles).
      const out = ox * nx + oy * ny + oz * nz;
      if (out > MAX_INTRUDE) {
        const e = out - MAX_INTRUDE;
        ox -= nx * e;
        // Walkable tops keep their height (the cap must never lift a floor).
        if (!WALK[mask]) oy -= ny * e;
        oz -= nz * e;
      }
      if (CEIL[mask] && oy < -CEIL_SAG) oy = -CEIL_SAG;
    }
    // Bend the normal by the relief: subtract the tangential gradient of the height field.
    if (hasN) {
      const hx = RH[1] * amp;
      const hy = RH[2] * amp;
      const hz = RH[3] * amp;
      const hn = hx * nx + hy * ny + hz * nz;
      nx -= hx - hn * nx;
      ny -= hy - hn * ny;
      nz -= hz - hn * nz;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= l;
      ny /= l;
      nz /= l;
    }
  }
  lOff[o3] = Math.max(1, Math.min(255, Math.round(ox / OFF_STEP) + 128));
  lOff[o3 + 1] = Math.max(1, Math.min(255, Math.round(oy / OFF_STEP) + 128));
  lOff[o3 + 2] = Math.max(1, Math.min(255, Math.round(oz / OFF_STEP) + 128));
  lNrm[o3] = nx;
  lNrm[o3 + 1] = ny;
  lNrm[o3 + 2] = nz;
  if (nx !== 0 || ny !== 0 || nz !== 0) octEncode(nx, ny, nz, lOct, li * 2, li * 2 + 1);
  else lOct[li * 2] = lOct[li * 2 + 1] = 127;
  return li;
}

/**
 * Seam keys: for each of the 26 neighbour chunks (index (dx+1) + 3 (dy+1) + 9 (dz+1)), a hash of
 * this chunk's voxels within two cells of the shared seam (occupancy, sculpt class, crystal).
 * The lattice points on a seam read voxels up to two cells into each chunk, one more than
 * VoxelWorld's dirty marking covers; when a re-mesh finds a seam key changed, the chunk renderer
 * re-meshes the neighbour too. Voxels on the neighbour's side are its own: editing them re-meshes it.
 */
const VOXEL_CODE = new Uint8Array(256);
for (let id = 0; id < 256; id++) VOXEL_CODE[id] = 1 + OPAQUE[id] + 2 * (SCULPT_RIGIDITY[id] === 255 ? 4 : SCULPT_RIGIDITY[id]) + (id === B.CRYSTAL ? 16 : 0);
const BAND = 2;
function seamHashes(): Uint32Array {
  const hs = new Uint32Array(27).fill(2166136261);
  const lo = PAD + BAND;
  const hi = P - PAD - BAND;
  for (let z = PAD; z < P - PAD; z++) {
    const cz = z < lo ? -1 : z >= hi ? 1 : 0;
    for (let y = PAD; y < P - PAD; y++) {
      const cy = y < lo ? -1 : y >= hi ? 1 : 0;
      const row = y * P + z * P2;
      for (let x = PAD; x < P - PAD; x++) {
        const cx = x < lo ? -1 : x >= hi ? 1 : 0;
        if (!cx && !cy && !cz) {
          x = hi - 1; // skip the row's interior
          continue;
        }
        const v = VOXEL_CODE[pad[row + x]] | ((x + row) << 5);
        for (let dz = Math.min(cz, 0); dz <= Math.max(cz, 0); dz++)
          for (let dy = Math.min(cy, 0); dy <= Math.max(cy, 0); dy++)
            for (let dx = Math.min(cx, 0); dx <= Math.max(cx, 0); dx++) {
              const k = dx + 1 + (dy + 1) * 3 + (dz + 1) * 9;
              if (k !== 13) hs[k] = Math.imul(hs[k] ^ v, 16777619) >>> 0;
            }
      }
    }
  }
  return hs;
}

/** Shading normals of the current face's corners (for the fold-aware split). */
const cn = new Float64Array(12);

export function meshChunk(world: VoxelWorld, ccx: number, ccy: number, ccz: number): ChunkMeshData {
  const cs = world.chunkSize;
  if (cs !== 16) throw new Error('mesher expects 16^3 chunks');
  const bx = ccx * cs - PAD;
  const by = ccy * cs - PAD;
  const bz = ccz * cs - PAD;
  stamp++;

  // Copy the chunk plus a PAD-voxel border so the inner loops need no bounds checks. Outside
  // the world reads as bedrock: opaque, never meshed, only occludes.
  const { sx, sy, sz, blocks } = world;
  const x0 = Math.max(0, bx);
  const x1 = Math.min(sx, bx + P);
  for (let z = 0; z < P; z++) {
    const wz = bz + z;
    for (let y = 0; y < P; y++) {
      const wy = by + y;
      const row = y * P + z * P2;
      if (wz < 0 || wz >= sz || wy < 0 || wy >= sy || x1 <= x0) {
        pad.fill(B.BEDROCK, row, row + P);
        continue;
      }
      let x = 0;
      for (; x < x0 - bx; x++) pad[row + x] = B.BEDROCK;
      const src = x0 + sx * (wy + sy * wz) - (x0 - bx);
      for (; x < x1 - bx; x++) pad[row + x] = blocks[src + x];
      for (; x < P; x++) pad[row + x] = B.BEDROCK;
    }
  }
  let anyVisible = false;
  scan: for (let z = PAD; z < P - PAD; z++)
    for (let y = PAD; y < P - PAD; y++) {
      const row = y * P + z * P2;
      for (let x = PAD; x < P - PAD; x++)
        if (VISIBLE[pad[row + x]]) {
          anyVisible = true;
          break scan;
        }
    }

  const ox0 = ccx * cs;
  const oy0 = ccy * cs;
  const oz0 = ccz * cs;
  const out = scratchVerts;
  const sculpt = MESH_OPTIONS.sculpt;
  let faces = 0;
  if (anyVisible) {
    // Occupancy bits per padded row, for the wide normal window.
    for (let r = 0; r < P * P; r++) {
      let bits = 0;
      const row = r * P;
      for (let x = 0; x < P; x++) if (OPAQUE[pad[row + x]]) bits |= 1 << x;
      rowBits[r] = bits;
    }
    for (let z = PAD; z < P - PAD; z++)
      for (let y = PAD; y < P - PAD; y++)
        for (let x = PAD; x < P - PAD; x++) {
          const i = x + y * P + z * P2;
          const id = pad[i];
          if (!VISIBLE[id]) continue;
          const family = FAMILY_OF[id];
          const flags = (family << 4) | (RUNE_FLAG[id] << 6);
          const flat = !sculpt || family === FAMILY.CRYSTAL;
          for (let f = 0; f < 6; f++) {
            const front = i + FACE_DELTA[f];
            if (OPAQUE[pad[front]]) continue;
            const matOf = f === 2 ? MAT_TOP : f === 3 ? MAT_BOTTOM : MAT_SIDE;
            const layer = matOf[id];
            // Boundary partners: solid neighbours in the face plane of the same family with a
            // different material on this face orientation.
            const td = TANGENT_DELTA[f >> 1];
            const d1 = td[0];
            const d2 = td[1];
            let nb0 = 255;
            let nb1 = 255;
            let nb2 = 255;
            let nb3 = 255;
            if (family !== 0) {
              let n = pad[i - d1];
              if (OPAQUE[n] && FAMILY_OF[n] === family && matOf[n] !== layer) nb0 = matOf[n];
              n = pad[i + d1];
              if (OPAQUE[n] && FAMILY_OF[n] === family && matOf[n] !== layer) nb1 = matOf[n];
              n = pad[i - d2];
              if (OPAQUE[n] && FAMILY_OF[n] === family && matOf[n] !== layer) nb2 = matOf[n];
              n = pad[i + d2];
              if (OPAQUE[n] && FAMILY_OF[n] === family && matOf[n] !== layer) nb3 = matOf[n];
            }
            const ao = AO_OFFSETS[f];
            const corners = FACE_CORNERS[f];
            const uvs = FACE_UVS[f];
            const fn = FACE_NORMALS[f];
            const fx = fn[0];
            const fy = fn[1];
            const fz = fn[2];
            const v0 = faces * 4;
            let a0 = 0;
            let a1 = 0;
            let a2 = 0;
            let a3 = 0;
            for (let c = 0; c < 4; c++) {
              const s1 = OPAQUE[pad[front + ao[c * 3]]];
              const s2 = OPAQUE[pad[front + ao[c * 3 + 1]]];
              const cnr = OPAQUE[pad[front + ao[c * 3 + 2]]];
              const occ = s1 && s2 ? 0 : 3 - (s1 + s2 + cnr);
              if (c === 0) a0 = occ;
              else if (c === 1) a1 = occ;
              else if (c === 2) a2 = occ;
              else a3 = occ;
              const corner = corners[c];
              const lx = x - PAD + corner[0];
              const ly = y - PAD + corner[1];
              const lz = z - PAD + corner[2];
              const lc = lx + ly * L + lz * L * L;
              const li = lStamp[lc] === stamp ? lc : lattice(lx, ly, lz, ox0 + lx, oy0 + ly, oz0 + lz);
              const r = lRig[li];
              const uv = uvs[c];
              const o = (v0 + c) * VERTEX_BYTES;
              out[o] = lx;
              out[o + 1] = ly;
              out[o + 2] = lz;
              out[o + 4] = f;
              out[o + 6] = layer;
              out[o + 7] = uv[0] | (uv[1] << 1) | (r << 2) | flags;
              out[o + 8] = nb0;
              out[o + 9] = nb1;
              out[o + 10] = nb2;
              out[o + 11] = nb3;
              const l3 = li * 3;
              out[o + 12] = lOff[l3];
              out[o + 13] = lOff[l3 + 1];
              out[o + 14] = lOff[l3 + 2];
              // Shading: natural rock takes the smooth lattice normal; built and crystalline
              // faces keep the flat face normal. The normal never faces away from its face.
              const s = flat ? 0 : SMOOTH[r];
              // Natural rock takes the smooth lattice AO, never darker than one step below the
              // voxel AO; built and crystalline faces keep the per-face voxel AO.
              out[o + 5] = s === 1 && MESH_OPTIONS.smoothAo ? Math.max((occ - 1) * AO_SCALE, lAo[li]) : occ * AO_SCALE;
              let nx = lNrm[l3];
              let ny = lNrm[l3 + 1];
              let nz = lNrm[l3 + 2];
              const d = nx * fx + ny * fy + nz * fz;
              if (s === 1 && d >= 0.05) {
                out[o + 3] = lOct[li * 2];
                out[o + 15] = lOct[li * 2 + 1];
              } else {
                const w = d < 0.05 ? Math.min(s, d > 0 ? d / 0.05 : 0) : s;
                if (w === 0) {
                  nx = fx;
                  ny = fy;
                  nz = fz;
                  out[o + 3] = FACE_OCT[f * 2];
                  out[o + 15] = FACE_OCT[f * 2 + 1];
                } else {
                  nx = fx + (nx - fx) * w;
                  ny = fy + (ny - fy) * w;
                  nz = fz + (nz - fz) * w;
                  const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
                  nx *= il;
                  ny *= il;
                  nz *= il;
                  octEncode(nx, ny, nz, out, o + 3, o + 15);
                }
              }
              cn[c * 3] = nx;
              cn[c * 3 + 1] = ny;
              cn[c * 3 + 2] = nz;
            }
            const k = faces * 6;
            // Split a quad whose shading normals vary along the diagonal whose end normals agree
            // most: the fold then follows the form (a bevelled corner folds convex, a filled
            // crease concave) instead of cutting across it. Quads with one normal keep the split
            // along the diagonal joining the brighter AO pair, so AO gradients stay symmetric.
            const dA = cn[0] * cn[6] + cn[1] * cn[7] + cn[2] * cn[8];
            const dB = cn[3] * cn[9] + cn[4] * cn[10] + cn[5] * cn[11];
            const splitA = Math.abs(dA - dB) > 0.002 ? dA > dB : a0 + a2 >= a1 + a3;
            if (splitA) {
              scratchIdx[k] = v0;
              scratchIdx[k + 1] = v0 + 1;
              scratchIdx[k + 2] = v0 + 2;
              scratchIdx[k + 3] = v0;
              scratchIdx[k + 4] = v0 + 2;
              scratchIdx[k + 5] = v0 + 3;
            } else {
              scratchIdx[k] = v0;
              scratchIdx[k + 1] = v0 + 1;
              scratchIdx[k + 2] = v0 + 3;
              scratchIdx[k + 3] = v0 + 1;
              scratchIdx[k + 4] = v0 + 2;
              scratchIdx[k + 5] = v0 + 3;
            }
            faces++;
          }
        }
  }

  const vertexCount = faces * 4;
  const indexCount = faces * 6;
  const indices = vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
  for (let k = 0; k < indexCount; k++) indices[k] = scratchIdx[k];
  // An empty chunk reports zeros: becoming non-empty (or empty) changes its key either way.
  const seams = anyVisible ? seamHashes() : new Uint32Array(27);
  return new ChunkMeshData(out.slice(0, vertexCount * VERTEX_BYTES), indices, vertexCount, faces, seams);
}
