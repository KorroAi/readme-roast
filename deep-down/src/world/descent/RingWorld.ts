import { B } from '../../config/blocks';
import { VoxelWorld } from '../VoxelWorld';

/**
 * The streamed world window of the descent (SPEC §6.2): 64 x 160 x 64 voxels whose y axis is a ring of 10
 * slabs of 16 rows. Depth d (metres) occupies world y in [-d - 1, -d); the storage row of world y is
 * ((y mod 160) + 160) mod 160, so the 3D light texture samples world positions directly with
 * `wrapT = Repeat`.
 *
 * Coordinates: x and z are storage coordinates (0..63). The cut plane is the plane z = CUT_Z (60, see
 * DescentCamera); voxels z 60..63 are the light apron (always air, CRITIQUE B1) and everything behind the
 * cut lies at z < 60. y is the world y (negative below the surface).
 *
 * Reads (`get`, `isSolid`): y >= 0 is the sky (AIR), z >= CUT_Z is the apron (AIR), and rows outside the live
 * window are STONE (BEDROCK id). Slab k (rows 16k..16k+15 below the surface) lives in slot (-k - 1) mod 10.
 * One slot is always dead (BEDROCK, light 0): it separates the window's bottom from its top in the ring, so a
 * solid slab is a perfect light barrier and LightField only needs to wrap its y neighbours.
 *
 * Writes: `set(x, y, z, id)` takes world y and marks the storage chunks dirty (wrapping in y).
 */

export const RING_SX = 64;
export const RING_SY = 160;
export const RING_SZ = 64;
export const SLAB_ROWS = 16;
export const SLOTS = RING_SY / SLAB_ROWS;
/** The cut plane (section faces at z = 60 facing +z) and the first apron voxel. */
export const RING_CUT_Z = 60;
/** Live slabs relative to the floor's slab: 2 above (the dug shaft and its history), 6 below. */
export const LIVE_ABOVE = 2;
export const LIVE_BELOW = 6;
export const DEAD = -0x7fffffff;

/** The slab holding depth row d (metres). */
export const slabOfRow = (row: number): number => Math.floor(row / SLAB_ROWS);
/** The storage slot of slab k. */
export const slotOfSlab = (k: number): number => (((-k - 1) % SLOTS) + SLOTS) % SLOTS;
/** Storage row of world y. */
export const storageRow = (y: number): number => ((y % RING_SY) + RING_SY) % RING_SY;
/** World y of the top row (row 16k) of slab k is -16k - 1; its rows span y in [-16k - 16, -16k). */
export const slabBottomY = (k: number): number => -SLAB_ROWS * k - SLAB_ROWS;

export class RingWorld extends VoxelWorld {
  /** The slab index each storage slot holds (DEAD when the slot is a barrier or not generated yet). */
  readonly slotSlab = new Int32Array(SLOTS).fill(DEAD);

  constructor() {
    super(RING_SX, RING_SY, RING_SZ, 16);
    this.blocks.fill(B.BEDROCK);
  }

  /** The live slab range [first, last] for a floor row. */
  static windowFor(floorRow: number): { first: number; last: number } {
    const k = slabOfRow(floorRow);
    return { first: k - LIVE_ABOVE, last: k + LIVE_BELOW };
  }

  /** True when slab k is written into its slot. */
  hasSlab(k: number): boolean {
    return this.slotSlab[slotOfSlab(k)] === k;
  }

  /** The world chunk y (cy) of storage chunk row `scy` (one slab per chunk row), or null when the slot is dead. */
  worldChunkY(scy: number): number | null {
    const k = this.slotSlab[scy];
    if (k === DEAD) return null;
    return -k - 1;
  }

  /** Storage chunk row of world chunk row `wcy` (world y in [16 wcy, 16 wcy + 16)). */
  storageChunkY(wcy: number): number {
    return ((wcy % SLOTS) + SLOTS) % SLOTS;
  }

  /** Is world y inside a live slab? */
  liveY(y: number): boolean {
    if (y >= 0) return false;
    const k = Math.floor(-(y + 1) / SLAB_ROWS);
    return this.slotSlab[slotOfSlab(k)] === k;
  }

  /** Storage index of (x, world y, z) (no bounds check on x and z). */
  indexW(x: number, y: number, z: number): number {
    return x + RING_SX * (storageRow(y) + RING_SY * z);
  }

  /** World read: sky above y = 0, the apron in front of the cut, STONE (bedrock) outside the live window. */
  override get(x: number, y: number, z: number): number {
    // The sky above the surface and the apron (and everything in front of it) are open air.
    if (y >= 0 || z >= RING_CUT_Z) return B.AIR;
    if (x < 0 || z < 0 || x >= RING_SX) return B.BEDROCK;
    const k = Math.floor(-(y + 1) / SLAB_ROWS);
    if (this.slotSlab[slotOfSlab(k)] !== k) return B.BEDROCK;
    return this.blocks[x + RING_SX * (storageRow(y) + RING_SY * z)];
  }

  /** World write (gameplay edits): marks the storage chunks dirty. Only live slabs accept writes. */
  override set(x: number, y: number, z: number, id: number): boolean {
    if (x < 0 || z < 0 || x >= RING_SX || z >= RING_SZ || !this.liveY(y)) return false;
    const sy = storageRow(y);
    const i = x + RING_SX * (sy + RING_SY * z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    this.revision++;
    const cs = 16;
    const lx = x % cs;
    const ly = sy % cs;
    const lz = z % cs;
    const ccx = (x / cs) | 0;
    const ccy = (sy / cs) | 0;
    const ccz = (z / cs) | 0;
    // The mesher reads 2 voxels around a chunk: an edit within 2 of a chunk edge dirties the neighbour.
    const dxs = lx <= 1 ? [0, -1] : lx >= cs - 2 ? [0, 1] : [0];
    const dys = ly <= 1 ? [0, -1] : ly >= cs - 2 ? [0, 1] : [0];
    const dzs = lz <= 1 ? [0, -1] : lz >= cs - 2 ? [0, 1] : [0];
    for (const dx of dxs) for (const dy of dys) for (const dz of dzs) this.markDirty(ccx + dx, ccy + dy, ccz + dz);
    return true;
  }

  /** Dirty marking wraps in y (storage chunk rows form a ring). */
  override markDirty(ccx: number, ccy: number, ccz: number): void {
    if (ccx < 0 || ccz < 0 || ccx >= this.cx || ccz >= this.cz) return;
    const y = ((ccy % this.cy) + this.cy) % this.cy;
    this.dirty[this.chunkIndex(ccx, y, ccz)] = 1;
  }

  /** Mark every chunk of storage chunk row `scy` dirty. */
  markRowDirty(scy: number): void {
    const y = ((scy % this.cy) + this.cy) % this.cy;
    for (let z = 0; z < this.cz; z++) for (let x = 0; x < this.cx; x++) this.dirty[this.chunkIndex(x, y, z)] = 1;
  }

  /**
   * Write slab k (64 x 16 x 64 blocks, index x + 64 (row + 16 z), row 0 = the slab's top row, i.e. depth 16k)
   * into its slot. The slot must be dead (call `killSlot` first when it held another slab).
   */
  writeSlab(k: number, slab: Uint8Array): void {
    if (slab.length !== RING_SX * SLAB_ROWS * RING_SZ) throw new Error('slab size mismatch');
    const slot = slotOfSlab(k);
    const b = this.blocks;
    for (let z = 0; z < RING_SZ; z++)
      for (let r = 0; r < SLAB_ROWS; r++) {
        // Slab row r is depth 16k + r: world y = -16k - r - 1.
        const sy = storageRow(-SLAB_ROWS * k - r - 1);
        b.set(slab.subarray(RING_SX * (r + SLAB_ROWS * z), RING_SX * (r + SLAB_ROWS * z) + RING_SX), RING_SX * (sy + RING_SY * z));
      }
    this.slotSlab[slot] = k;
    this.revision++;
    // Its own chunks, and the neighbours whose 2-voxel padding reads into it.
    this.markRowDirty(slot);
    this.markRowDirty(slot - 1);
    this.markRowDirty(slot + 1);
  }

  /** Fill a slot with BEDROCK (a light barrier) and forget its slab. */
  killSlot(slot: number): void {
    const b = this.blocks;
    for (let z = 0; z < RING_SZ; z++) b.fill(B.BEDROCK, RING_SX * (slot * SLAB_ROWS + RING_SY * z), RING_SX * (slot * SLAB_ROWS + SLAB_ROWS + RING_SY * z));
    this.slotSlab[slot] = DEAD;
    this.revision++;
    this.markRowDirty(slot);
    this.markRowDirty(slot - 1);
    this.markRowDirty(slot + 1);
  }

  /** Copy slab k's current blocks out (same layout as writeSlab), e.g. as the slab worker's light context. */
  readSlab(k: number, out: Uint8Array = new Uint8Array(RING_SX * SLAB_ROWS * RING_SZ)): Uint8Array {
    const b = this.blocks;
    for (let z = 0; z < RING_SZ; z++)
      for (let r = 0; r < SLAB_ROWS; r++) {
        const sy = storageRow(-SLAB_ROWS * k - r - 1);
        out.set(b.subarray(RING_SX * (sy + RING_SY * z), RING_SX * (sy + RING_SY * z) + RING_SX), RING_SX * (r + SLAB_ROWS * z));
      }
    return out;
  }

  /**
   * The mesher's padded block for storage chunk (ccx, scy, ccz), read through the ring in world space
   * (rows outside the live window are bedrock, the sky and the apron are air). P = 20, PAD = 2.
   */
  copyPaddedWorld(ccx: number, scy: number, ccz: number, out: Uint8Array): Uint8Array {
    const wcy = this.worldChunkY(scy);
    const P = 20;
    const PAD = 2;
    if (wcy === null) return out.fill(B.BEDROCK);
    const bx = ccx * 16 - PAD;
    const by = wcy * 16 - PAD;
    const bz = ccz * 16 - PAD;
    for (let z = 0; z < P; z++) {
      const wz = bz + z;
      for (let y = 0; y < P; y++) {
        const wy = by + y;
        const row = y * P + z * P * P;
        if (wy >= 0 || wz >= RING_CUT_Z) {
          // Sky and apron are air (outside x too: open space reads as air there).
          out.fill(B.AIR, row, row + P);
          continue;
        }
        if (wz < 0 || !this.liveY(wy)) {
          out.fill(B.BEDROCK, row, row + P);
          continue;
        }
        const src = RING_SX * (storageRow(wy) + RING_SY * wz);
        for (let x = 0; x < P; x++) {
          const wx = bx + x;
          out[row + x] = wx < 0 || wx >= RING_SX ? B.BEDROCK : this.blocks[src + wx];
        }
      }
    }
    return out;
  }
}
