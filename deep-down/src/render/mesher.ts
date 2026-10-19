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
 *   4..7   aData   face 0..5, ambient occlusion 0..3, material layer,
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

  /** [face, AO 0..3, material layer, bits] per vertex. */
  get data(): Uint8Array {
    return (this.cacheData ??= this.pick(4, 4));
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

// ---------------------------------------------------------------------------------------------
// Value noise with an analytic gradient (quintic fade), hashed on the integer lattice: a pure,
// deterministic function of world position, so both chunks that share a vertex agree.

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x8da6b343) ^ Math.imul(y, 0xd8163841) ^ Math.imul(z, 0xcb1ab31f) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

const NZ = new Float64Array(4);
/** Value noise in [-1, 1] at (x, y, z); writes [value, d/dx, d/dy, d/dz] into NZ. */
function vnoise(x: number, y: number, z: number, seed: number): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
  const duy = 30 * fy * fy * (fy * (fy - 2) + 1);
  const duz = 30 * fz * fz * (fz * (fz - 2) + 1);
  const K = 1 / 32767.5;
  const a = (hash3(ix, iy, iz, seed) & 0xffff) * K - 1;
  const b = (hash3(ix + 1, iy, iz, seed) & 0xffff) * K - 1;
  const c = (hash3(ix, iy + 1, iz, seed) & 0xffff) * K - 1;
  const d = (hash3(ix + 1, iy + 1, iz, seed) & 0xffff) * K - 1;
  const e = (hash3(ix, iy, iz + 1, seed) & 0xffff) * K - 1;
  const f = (hash3(ix + 1, iy, iz + 1, seed) & 0xffff) * K - 1;
  const g = (hash3(ix, iy + 1, iz + 1, seed) & 0xffff) * K - 1;
  const h = (hash3(ix + 1, iy + 1, iz + 1, seed) & 0xffff) * K - 1;
  const k1 = b - a;
  const k2 = c - a;
  const k3 = e - a;
  const k4 = a - b - c + d;
  const k5 = a - c - e + g;
  const k6 = a - b - e + f;
  const k7 = -a + b + c - d + e - f - g + h;
  NZ[0] = a + k1 * ux + k2 * uy + k3 * uz + k4 * ux * uy + k5 * uy * uz + k6 * uz * ux + k7 * ux * uy * uz;
  NZ[1] = dux * (k1 + k4 * uy + k6 * uz + k7 * uy * uz);
  NZ[2] = duy * (k2 + k5 * uz + k4 * ux + k7 * uz * ux);
  NZ[3] = duz * (k3 + k6 * ux + k5 * uy + k7 * ux * uy);
}

// Relief field: two octaves, irrational-ish frequencies so lattice points never alias.
const F1 = 1 / 2.6;
const F2 = 1 / 7.3;
const RH = new Float64Array(4);
function relief(x: number, y: number, z: number): void {
  vnoise(x * F1 + 0.37, y * F1 * 1.3 + 0.11, z * F1 + 0.73, 0x5ca1ab1e);
  RH[0] = NZ[0] * 0.6;
  RH[1] = NZ[1] * 0.6 * F1;
  RH[2] = NZ[2] * 0.6 * F1 * 1.3;
  RH[3] = NZ[3] * 0.6 * F1;
  vnoise(x * F2 + 5.1, y * F2 + 1.7, z * F2 + 3.3, 0x0dd5eed5);
  RH[0] += NZ[0] * 0.4;
  RH[1] += NZ[1] * 0.4 * F2;
  RH[2] += NZ[2] * 0.4 * F2;
  RH[3] += NZ[3] * 0.4 * F2;
}

// Tangential jitter: three value-noise channels from one set of lattice hashes (no gradient).
const JX = new Float64Array(3);
const JF = 0.43;
function jitter(x: number, y: number, z: number): void {
  const px = x * JF + 9.7;
  const py = y * JF + 2.9;
  const pz = z * JF + 6.1;
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const iz = Math.floor(pz);
  const fx = px - ix;
  const fy = py - iy;
  const fz = pz - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  JX[0] = JX[1] = JX[2] = 0;
  for (let c = 0; c < 8; c++) {
    const cx = c & 1;
    const cy = (c >> 1) & 1;
    const cz = (c >> 2) & 1;
    const w = (cx ? ux : 1 - ux) * (cy ? uy : 1 - uy) * (cz ? uz : 1 - uz);
    const h = hash3(ix + cx, iy + cy, iz + cz, 0x7e57ab1e);
    JX[0] += w * ((h & 1023) / 511.5 - 1);
    JX[1] += w * (((h >>> 10) & 1023) / 511.5 - 1);
    JX[2] += w * (((h >>> 20) & 1023) / 511.5 - 1);
  }
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

/** Byte pair (0..254, 127 = 0) for a unit normal. */
function octEncode(x: number, y: number, z: number, out: Uint8Array, o: number): void {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  let ex = x / s;
  let ey = y / s;
  if (z < 0) {
    const tx = (1 - Math.abs(ey)) * (ex >= 0 ? 1 : -1);
    ey = (1 - Math.abs(ex)) * (ey >= 0 ? 1 : -1);
    ex = tx;
  }
  out[o] = Math.round(ex * 127) + 127;
  out[o + 1] = Math.round(ey * 127) + 127;
}

// ---------------------------------------------------------------------------------------------
// Per-lattice-point cache (17^3 points per chunk), valid for one meshChunk call.

const L = 17;
const lStamp = new Int32Array(L * L * L);
const lOff = new Uint8Array(L * L * L * 3);
const lNrm = new Float32Array(L * L * L * 3);
const lOct = new Uint8Array(L * L * L * 2);
const lRig = new Uint8Array(L * L * L);
let stamp = 0;
const octTmp = new Uint8Array(2);

/** Mesher options (debug viewer): `sculpt: false` meshes plain cubes with face normals. */
export const MESH_OPTIONS = { sculpt: true, wide: 1 };

// 4x4x4 voxel window around a corner with tent weights (1/3, 1, 1, 1/3 per axis): padded-index
// delta from the window origin, weight, and weight x centre offset for the gradient.
const WIDE_DELTA = new Int32Array(64);
const WIDE_GX = new Float32Array(64);
const WIDE_GY = new Float32Array(64);
const WIDE_GZ = new Float32Array(64);
{
  const TENT = [1 / 3, 1, 1, 1 / 3];
  let t = 0;
  for (let k = 0; k < 4; k++)
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 4; i++, t++) {
        const wgt = TENT[i] * TENT[j] * TENT[k];
        WIDE_DELTA[t] = i + j * P + k * P2;
        WIDE_GX[t] = wgt * (i - 1.5);
        WIDE_GY[t] = wgt * (j - 1.5);
        WIDE_GZ[t] = wgt * (k - 1.5);
      }
}

/** Sculpt rigidity per block id: crystal is shaped like its host rock (its faces stay flat). */
const SCULPT_RIGIDITY = new Uint8Array(RIGIDITY);
SCULPT_RIGIDITY[B.CRYSTAL] = 3;
/** Depth of the groove a crystal seam sits in, metres. */
const CRYSTAL_INSET = 0.2;

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
  if (wide > 0) {
    const b0 = base - 1 - P - P2;
    for (let t = 0; t < 64; t++) {
      if (OPAQUE[pad[b0 + WIDE_DELTA[t]]]) {
        gx -= WIDE_GX[t];
        gy -= WIDE_GY[t];
        gz -= WIDE_GZ[t];
      } else {
        gx += WIDE_GX[t];
        gy += WIDE_GY[t];
        gz += WIDE_GZ[t];
      }
    }
  }
  const gl = Math.hypot(gx, gy, gz);
  if (wide > 0 && gl > 1e-3 && (nx !== 0 || ny !== 0 || nz !== 0)) {
    nx = nx * (1 - wide) + (gx / gl) * wide;
    ny = ny * (1 - wide) + (gy / gl) * wide;
    nz = nz * (1 - wide) + (gz / gl) * wide;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
  }
  let ox = 0;
  let oy = 0;
  let oz = 0;
  if (MESH_OPTIONS.sculpt && mask !== FLAT_FLOOR && r > 0) {
    const ch = CHAMFER[r];
    ox = SN_OFF[m3] * ch;
    oy = SN_OFF[m3 + 1] * ch * (WALK[mask] ? WALK_CHAMFER_Y : 1);
    oz = SN_OFF[m3 + 2] * ch;
    const hasN = nx !== 0 || ny !== 0 || nz !== 0;
    // Noise relief along the normal, plus a tangential jitter.
    relief(wx, wy, wz);
    let amp = RELIEF[r];
    if (CEIL[mask] && ny < -0.5) amp *= CEIL_RELIEF;
    const h = RH[0] * amp;
    let rx = nx * h;
    let ry = ny * h;
    let rz = nz * h;
    jitter(wx, wy, wz);
    const jt = JX[0] * nx + JX[1] * ny + JX[2] * nz;
    const ja = JITTER[r];
    rx += (JX[0] - jt * nx) * ja;
    ry += (JX[1] - jt * ny) * ja;
    rz += (JX[2] - jt * nz) * ja;
    if (WALK[mask]) ry *= WALK_NOISE_Y;
    // A crystal seam sits sunk in a groove of its host rock, not proud of it as a box.
    if (crystals && hasN) {
      let solids = 0;
      for (let m = mask; m; m &= m - 1) solids++;
      const d = CRYSTAL_INSET * Math.min(1, (2 * crystals) / solids);
      rx -= nx * d;
      ry -= ny * d * (WALK[mask] ? WALK_NOISE_Y : 1);
      rz -= nz * d;
    }
    ox += rx;
    oy += ry;
    oz += rz;
    // Bend the normal by the relief: subtract the tangential gradient of the height field.
    if (hasN) {
      const hx = RH[1] * amp;
      const hy = RH[2] * amp;
      const hz = RH[3] * amp;
      const hn = hx * nx + hy * ny + hz * nz;
      nx -= hx - hn * nx;
      ny -= hy - hn * ny;
      nz -= hz - hn * nz;
      const l = Math.hypot(nx, ny, nz);
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
  if (nx !== 0 || ny !== 0 || nz !== 0) octEncode(nx, ny, nz, lOct, li * 2);
  else lOct[li * 2] = lOct[li * 2 + 1] = 127;
  return li;
}

/**
 * Seam hashes: for each of the 26 neighbour chunks (index (dx+1) + 3 (dy+1) + 9 (dz+1)), a hash
 * of everything this chunk derives for the lattice points it shares with that neighbour. The
 * wide normal and AO read voxels two cells away, one more than VoxelWorld's dirty marking
 * covers, so the chunk renderer re-meshes a neighbour whose shared seam changed.
 */
function seamHashes(ox0: number, oy0: number, oz0: number): Uint32Array {
  const hs = new Uint32Array(27).fill(2166136261);
  const mix = (h: number, v: number) => Math.imul(h ^ v, 16777619) >>> 0;
  for (let lz = 0; lz < L; lz++)
    for (let ly = 0; ly < L; ly++)
      for (let lx = 0; lx < L; lx++) {
        const ex = lx === 0 ? -1 : lx === L - 1 ? 1 : 0;
        const ey = ly === 0 ? -1 : ly === L - 1 ? 1 : 0;
        const ez = lz === 0 ? -1 : lz === L - 1 ? 1 : 0;
        if (!ex && !ey && !ez) {
          lx = L - 2; // jump to the far face of this row
          continue;
        }
        const li = lattice(lx, ly, lz, ox0 + lx, oy0 + ly, oz0 + lz);
        const v = lOff[li * 3] | (lOff[li * 3 + 1] << 8) | (lOff[li * 3 + 2] << 16) | (lRig[li] << 24);
        const w = lOct[li * 2] | (lOct[li * 2 + 1] << 8);
        for (let dz = ez < 0 ? -1 : 0; dz <= (ez > 0 ? 1 : 0); dz++)
          for (let dy = ey < 0 ? -1 : 0; dy <= (ey > 0 ? 1 : 0); dy++)
            for (let dx = ex < 0 ? -1 : 0; dx <= (ex > 0 ? 1 : 0); dx++) {
              if (!dx && !dy && !dz) continue;
              if ((dx && dx !== ex) || (dy && dy !== ey) || (dz && dz !== ez)) continue;
              const k = dx + 1 + (dy + 1) * 3 + (dz + 1) * 9;
              hs[k] = mix(mix(mix(hs[k], li), v), w);
            }
      }
  return hs;
}

// Scratch for the per-face corners (positions in metres and shading normals).
const cp = new Float64Array(12);
const cn = new Float64Array(12);

/** Normal of triangle (a, b, c) of the current face corners, dotted with the sum of their normals. */
function triAgreement(a: number, b: number, c: number): number {
  const ux = cp[b * 3] - cp[a * 3];
  const uy = cp[b * 3 + 1] - cp[a * 3 + 1];
  const uz = cp[b * 3 + 2] - cp[a * 3 + 2];
  const vx = cp[c * 3] - cp[a * 3];
  const vy = cp[c * 3 + 1] - cp[a * 3 + 1];
  const vz = cp[c * 3 + 2] - cp[a * 3 + 2];
  let tx = uy * vz - uz * vy;
  let ty = uz * vx - ux * vz;
  let tz = ux * vy - uy * vx;
  const l = Math.hypot(tx, ty, tz) || 1;
  tx /= l;
  ty /= l;
  tz /= l;
  const sx = cn[a * 3] + cn[b * 3] + cn[c * 3];
  const sy = cn[a * 3 + 1] + cn[b * 3 + 1] + cn[c * 3 + 1];
  const sz = cn[a * 3 + 2] + cn[b * 3 + 2] + cn[c * 3 + 2];
  return tx * sx + ty * sy + tz * sz;
}

export function meshChunk(world: VoxelWorld, ccx: number, ccy: number, ccz: number): ChunkMeshData {
  const cs = world.chunkSize;
  if (cs !== 16) throw new Error('mesher expects 16^3 chunks');
  const bx = ccx * cs - PAD;
  const by = ccy * cs - PAD;
  const bz = ccz * cs - PAD;
  stamp++;

  // Copy the chunk plus a one-voxel border so the inner loop needs no bounds checks.
  const { sx, sy, sz, blocks } = world;
  let anyVisible = false;
  for (let z = 0; z < P; z++) {
    const wz = bz + z;
    for (let y = 0; y < P; y++) {
      const wy = by + y;
      const row = y * P + z * P2;
      const inside = wz >= 0 && wz < sz && wy >= 0 && wy < sy;
      for (let x = 0; x < P; x++) {
        const wx = bx + x;
        let id: number;
        if (inside && wx >= 0 && wx < sx) id = blocks[wx + sx * (wy + sy * wz)];
        else id = B.BEDROCK; // Outside the world: opaque, never meshed, only occludes.
        pad[x + row] = id;
        if (!anyVisible && x >= PAD && y >= PAD && z >= PAD && x < P - PAD && y < P - PAD && z < P - PAD && VISIBLE[id]) anyVisible = true;
      }
    }
  }

  const ox0 = ccx * cs;
  const oy0 = ccy * cs;
  const oz0 = ccz * cs;
  const out = scratchVerts;
  let faces = 0;
  if (anyVisible) {
    for (let z = PAD; z < P - PAD; z++)
      for (let y = PAD; y < P - PAD; y++)
        for (let x = PAD; x < P - PAD; x++) {
          const i = x + y * P + z * P2;
          const id = pad[i];
          if (!VISIBLE[id]) continue;
          for (let f = 0; f < 6; f++) {
            const front = i + FACE_DELTA[f];
            if (OPAQUE[pad[front]]) continue;
            const matOf = f === 2 ? MAT_TOP : f === 3 ? MAT_BOTTOM : MAT_SIDE;
            const layer = matOf[id];
            const family = FAMILY_OF[id];
            // Boundary partners: solid neighbours in the face plane of the same family with a
            // different material on this face orientation.
            const [d1, d2] = TANGENT_DELTA[f >> 1];
            let nb0 = 255;
            let nb1 = 255;
            let nb2 = 255;
            let nb3 = 255;
            if (family !== 0) {
              const pick = (n: number) => (OPAQUE[n] && FAMILY_OF[n] === family && matOf[n] !== layer ? matOf[n] : 255);
              nb0 = pick(pad[i - d1]);
              nb1 = pick(pad[i + d1]);
              nb2 = pick(pad[i - d2]);
              nb3 = pick(pad[i + d2]);
            }
            const flags = (family << 4) | (RUNE_FLAG[id] << 6);
            const ao = AO_OFFSETS[f];
            const corners = FACE_CORNERS[f];
            const uvs = FACE_UVS[f];
            const fn = FACE_NORMALS[f];
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
              const li = lattice(lx, ly, lz, ox0 + lx, oy0 + ly, oz0 + lz);
              const r = lRig[li];
              const o = (v0 + c) * VERTEX_BYTES;
              out[o] = lx;
              out[o + 1] = ly;
              out[o + 2] = lz;
              out[o + 4] = f;
              out[o + 5] = occ;
              // Shading: natural rock takes the smooth lattice normal; built and crystalline
              // faces keep the flat face normal.
              const s = MESH_OPTIONS.sculpt && family !== FAMILY.CRYSTAL ? SMOOTH[r] : 0;
              out[o + 6] = layer;
              out[o + 7] = uvs[c][0] | (uvs[c][1] << 1) | (r << 2) | flags;
              out[o + 8] = nb0;
              out[o + 9] = nb1;
              out[o + 10] = nb2;
              out[o + 11] = nb3;
              out[o + 12] = lOff[li * 3];
              out[o + 13] = lOff[li * 3 + 1];
              out[o + 14] = lOff[li * 3 + 2];
              // The shading normal never faces away from its face.
              let nx = lNrm[li * 3];
              let ny = lNrm[li * 3 + 1];
              let nz = lNrm[li * 3 + 2];
              const d = nx * fn[0] + ny * fn[1] + nz * fn[2];
              if (s === 1 && d >= 0.05) {
                out[o + 3] = lOct[li * 2];
                out[o + 15] = lOct[li * 2 + 1];
              } else {
                let w = s;
                if (d < 0.05) w = Math.min(w, d > 0 ? d / 0.05 : 0);
                nx = fn[0] + (nx - fn[0]) * w;
                ny = fn[1] + (ny - fn[1]) * w;
                nz = fn[2] + (nz - fn[2]) * w;
                const l = Math.hypot(nx, ny, nz) || 1;
                nx /= l;
                ny /= l;
                nz /= l;
                octEncode(nx, ny, nz, octTmp, 0);
                out[o + 3] = octTmp[0];
                out[o + 15] = octTmp[1];
              }
              cp[c * 3] = lx + (out[o + 12] - 128) * OFF_STEP;
              cp[c * 3 + 1] = ly + (out[o + 13] - 128) * OFF_STEP;
              cp[c * 3 + 2] = lz + (out[o + 14] - 128) * OFF_STEP;
              cn[c * 3] = nx;
              cn[c * 3 + 1] = ny;
              cn[c * 3 + 2] = nz;
            }
            const k = faces * 6;
            // Split a folded quad along the diagonal whose triangles agree with the shading
            // normals (the fold follows the form, no saddles); a flat quad along the diagonal
            // joining the brighter pair, so AO gradients stay symmetric.
            const sa = triAgreement(0, 1, 2) + triAgreement(0, 2, 3);
            const sb = triAgreement(1, 2, 3) + triAgreement(1, 3, 0);
            const splitA = Math.abs(sa - sb) > 0.004 ? sa > sb : a0 + a2 >= a1 + a3;
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
  const seams = anyVisible ? seamHashes(ox0, oy0, oz0) : new Uint32Array(27);
  return new ChunkMeshData(out.slice(0, vertexCount * VERTEX_BYTES), indices, vertexCount, faces, seams);
}
