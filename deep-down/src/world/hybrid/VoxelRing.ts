import { B, SOLID } from '../../config/blocks';
import { VoxelWorld } from '../VoxelWorld';
import { CHUNK, DEAD_SLAB, PER_M, RING_SX, RING_SY, RING_SZ, SLAB_ROWS, SLOTS, slotOfSlab, storageRow } from './ringConsts';

/**
 * The streamed world window of the hybrid (SPEC §4.10, BUILD §3.2 MUST 1: RingWorld without the cut): 128 x 192 x 128
 * voxels of 0.5 m (64 x 96 x 64 m) whose y axis is a ring of 6 slabs of 32 voxel rows (16 m). There is no cut plane, no
 * apron and no open back: the whole footprint is rock and the spiral's spaces.
 *
 * Coordinates are VOXELS: x and z 0..127 (world metres = voxel · 0.5), j the world voxel row (world y = j · 0.5,
 * negative below the surface). The storage row of j is ((j mod 192) + 192) mod 192, so the light texture samples world
 * positions directly with wrapT = Repeat (grid.ts LIGHT_VOLUME).
 *
 * Reads: j >= 0 is the sky (AIR); x or z outside the footprint and rows outside the live window are BEDROCK. Slab k
 * (voxel rows -32k - 32 .. -32k - 1, world y in [-16k - 16, -16k)) lives in slot (-k - 1) mod 6; one slot is always
 * dead (BEDROCK, light 0) so the window's bottom never sees its top through the ring, and LightField only wraps y.
 *
 * Writes: `set(x, j, z, id)` takes the world row and marks the storage chunks dirty (wrapping in y).
 */
export class VoxelRing extends VoxelWorld {
  /** The slab index each storage slot holds (DEAD_SLAB when the slot is a barrier or not generated yet). */
  readonly slotSlab = new Int32Array(SLOTS).fill(DEAD_SLAB);

  constructor() {
    super(RING_SX, RING_SY, RING_SZ, CHUNK);
    this.blocks.fill(B.BEDROCK);
  }

  /** The live slab range [first, last] around the focus slab (the player's). */
  static windowFor(focusSlab: number, above = 1, below = 3): { first: number; last: number } {
    return { first: Math.max(0, focusSlab - above), last: focusSlab + below };
  }

  /** True when slab k is written into its slot. */
  hasSlab(k: number): boolean {
    return this.slotSlab[slotOfSlab(k)] === k;
  }

  /** Is world voxel row j inside a live slab? */
  liveRow(j: number): boolean {
    if (j >= 0) return false;
    const k = Math.floor((-j - 1) / SLAB_ROWS);
    return this.slotSlab[slotOfSlab(k)] === k;
  }

  /** The world chunk row (world voxel rows [16 wcy, 16 wcy + 16)) of storage chunk row `scy`, or null when dead. */
  worldChunkY(scy: number): number | null {
    const slot = Math.floor(scy / (SLAB_ROWS / CHUNK));
    const k = this.slotSlab[slot];
    if (k === DEAD_SLAB) return null;
    // Slab k's rows are j in [-32k - 32, -32k): chunk rows -2k - 2 (bottom half) and -2k - 1 (top half). Storage rows of
    // slot s are 32s .. 32s + 31; the bottom half (storage 32s..32s+15) holds world rows -32k-32..-32k-17.
    const half = scy - slot * (SLAB_ROWS / CHUNK);
    return -(SLAB_ROWS / CHUNK) * k - (SLAB_ROWS / CHUNK) + half;
  }

  /** Storage chunk row of world chunk row `wcy`. */
  storageChunkY(wcy: number): number {
    const n = RING_SY / CHUNK;
    return ((wcy % n) + n) % n;
  }

  /** Storage index of (x, world row j, z) (no bounds check on x and z). */
  indexW(x: number, j: number, z: number): number {
    return x + RING_SX * (storageRow(j) + RING_SY * z);
  }

  /** World read (voxels): sky above j = 0, BEDROCK outside the footprint and the live window. */
  override get(x: number, j: number, z: number): number {
    if (j >= 0) return B.AIR;
    if (x < 0 || x >= RING_SX || z < 0 || z >= RING_SZ) return B.BEDROCK;
    const k = Math.floor((-j - 1) / SLAB_ROWS);
    if (this.slotSlab[slotOfSlab(k)] !== k) return B.BEDROCK;
    return this.blocks[x + RING_SX * (storageRow(j) + RING_SY * z)];
  }

  override isSolid(x: number, j: number, z: number): boolean {
    return SOLID[this.get(x, j, z)] === 1;
  }

  /** Solidity at a world point in metres. */
  solidAtM(x: number, y: number, z: number): boolean {
    return SOLID[this.get(Math.floor(x * PER_M), Math.floor(y * PER_M), Math.floor(z * PER_M))] === 1;
  }

  /** Block at a world point in metres. */
  getM(x: number, y: number, z: number): number {
    return this.get(Math.floor(x * PER_M), Math.floor(y * PER_M), Math.floor(z * PER_M));
  }

  /** World write (gameplay edits: a slice dug, a secret opened, skin broken): marks the storage chunks dirty. */
  override set(x: number, j: number, z: number, id: number): boolean {
    if (x < 0 || z < 0 || x >= RING_SX || z >= RING_SZ || !this.liveRow(j)) return false;
    const sy = storageRow(j);
    const i = x + RING_SX * (sy + RING_SY * z);
    if (this.blocks[i] === id) return false;
    this.blocks[i] = id;
    this.revision++;
    const cs = CHUNK;
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

  /** Mark every chunk of the storage chunk rows of slot `slot` (and the rows touching it) dirty. */
  markSlotDirty(slot: number): void {
    const per = SLAB_ROWS / CHUNK;
    for (let r = -1; r <= per; r++) {
      const y = (((slot * per + r) % this.cy) + this.cy) % this.cy;
      for (let z = 0; z < this.cz; z++) for (let x = 0; x < this.cx; x++) this.dirty[this.chunkIndex(x, y, z)] = 1;
    }
  }

  /**
   * Write slab k (128 x 32 x 128 voxels, index x + 128 (r + 32 z), r = 0 the slab's TOP row, world row -32k - 1) into
   * its slot.
   */
  writeSlab(k: number, slab: Uint8Array): void {
    if (slab.length !== RING_SX * SLAB_ROWS * RING_SZ) throw new Error('slab size mismatch');
    const slot = slotOfSlab(k);
    const b = this.blocks;
    for (let z = 0; z < RING_SZ; z++)
      for (let r = 0; r < SLAB_ROWS; r++) {
        const sy = storageRow(-SLAB_ROWS * k - r - 1);
        b.set(slab.subarray(RING_SX * (r + SLAB_ROWS * z), RING_SX * (r + SLAB_ROWS * z) + RING_SX), RING_SX * (sy + RING_SY * z));
      }
    this.slotSlab[slot] = k;
    this.revision++;
    this.markSlotDirty(slot);
  }

  /** Fill a slot with BEDROCK (the light barrier) and forget its slab. */
  killSlot(slot: number): void {
    const b = this.blocks;
    for (let z = 0; z < RING_SZ; z++) b.fill(B.BEDROCK, RING_SX * (slot * SLAB_ROWS + RING_SY * z), RING_SX * (slot * SLAB_ROWS + SLAB_ROWS + RING_SY * z));
    this.slotSlab[slot] = DEAD_SLAB;
    this.revision++;
    this.markSlotDirty(slot);
  }

  /** Copy slab k's current blocks out (writeSlab's layout), e.g. as the slab worker's light context. */
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
   * The mesher's padded block for storage chunk (ccx, scy, ccz), read through the ring in world space (rows outside
   * the live window are bedrock, the sky is air). P = 20, PAD = 2, index x + P (y + P z), y ascending with world y.
   */
  copyPaddedWorld(ccx: number, scy: number, ccz: number, out: Uint8Array): Uint8Array {
    const wcy = this.worldChunkY(scy);
    const P = CHUNK + 4;
    const PAD = 2;
    if (wcy === null) return out.fill(B.BEDROCK);
    const bx = ccx * CHUNK - PAD;
    const by = wcy * CHUNK - PAD;
    const bz = ccz * CHUNK - PAD;
    for (let z = 0; z < P; z++) {
      const wz = bz + z;
      for (let y = 0; y < P; y++) {
        const wy = by + y;
        const row = y * P + z * P * P;
        if (wy >= 0) {
          out.fill(B.AIR, row, row + P);
          continue;
        }
        if (!this.liveRow(wy) || wz < 0 || wz >= RING_SZ) {
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
