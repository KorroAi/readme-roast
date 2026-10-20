import { VoxelWorld } from '../VoxelWorld';
import { LightField } from '../light';
import { RING_SX, RING_SZ, SLAB_ROWS } from './RingWorld';

/** Rows of context above a slab whose light the slab can change (≥ LIGHT_REACH, so the merge is exact). */
export const CONTEXT_ROWS = 32;

/**
 * Light for a new slab and the max-merge for the rows above it (SPEC §6.2), computed off the main thread.
 * `context` holds the CONTEXT_ROWS rows above the slab as they are in the ring now (slab layout: index
 * x + 64 (r + rows z), r = 0 the topmost, i.e. depth 16k - 32). The result is in storage-row order (world y
 * ascending): `slab` for the slab's 16 rows (y from -16k - 16), `context` for the 32 rows above (y from -16k).
 * Both are RGBA8 in LightField.writeRows layout (x + 64 (r + count z)).
 */
export function slabLight(slabBlocks: Uint8Array, context: Uint8Array): { slab: Uint8Array; context: Uint8Array } {
  const rows = SLAB_ROWS + CONTEXT_ROWS;
  // Temp world y ascending with world y: ty 0..15 = slab rows 15..0, ty 16..47 = context rows 31..0.
  const w = new VoxelWorld(RING_SX, rows, RING_SZ);
  const b = w.blocks;
  for (let z = 0; z < RING_SZ; z++) {
    for (let r = 0; r < SLAB_ROWS; r++) {
      const ty = SLAB_ROWS - 1 - r;
      b.set(slabBlocks.subarray(RING_SX * (r + SLAB_ROWS * z), RING_SX * (r + SLAB_ROWS * z) + RING_SX), RING_SX * (ty + rows * z));
    }
    for (let r = 0; r < CONTEXT_ROWS; r++) {
      const ty = SLAB_ROWS + CONTEXT_ROWS - 1 - r;
      b.set(context.subarray(RING_SX * (r + CONTEXT_ROWS * z), RING_SX * (r + CONTEXT_ROWS * z) + RING_SX), RING_SX * (ty + rows * z));
    }
  }
  const field = new LightField(w);
  field.computeAll();
  const slab = new Uint8Array(RING_SX * SLAB_ROWS * RING_SZ * 4);
  const ctx = new Uint8Array(RING_SX * CONTEXT_ROWS * RING_SZ * 4);
  const rowBytes = RING_SX * 4;
  for (let z = 0; z < RING_SZ; z++)
    for (let ty = 0; ty < rows; ty++) {
      const src = RING_SX * (ty + rows * z) * 4;
      if (ty < SLAB_ROWS) slab.set(field.data.subarray(src, src + rowBytes), RING_SX * (ty + SLAB_ROWS * z) * 4);
      else ctx.set(field.data.subarray(src, src + rowBytes), RING_SX * (ty - SLAB_ROWS + CONTEXT_ROWS * z) * 4);
    }
  return { slab, context: ctx };
}
