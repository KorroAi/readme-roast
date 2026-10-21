import { B } from '../../config/blocks';
import { VoxelWorld } from '../VoxelWorld';
import { LightField } from '../light';
import { RING_SX, RING_SZ, SLAB_ROWS, VOXEL } from './grid';

/** Voxel rows of context above a slab whose light the slab can change (≥ the light's reach at 0.5 m steps). */
export const CONTEXT_ROWS = 2 * SLAB_ROWS;
/** Bedrock rows under the slab in the worker's world (the ring's dead slot below a new slab is bedrock). */
const FLOOR_ROWS = 8;
/** Context rows above the slab whose openness the slab changes (≥ the openness radius). */
export const OPEN_CONTEXT_ROWS = 8;

/** The LightField options of the hybrid's 0.5 m grid. */
export const LIGHT_OPTIONS = { wrapY: true, stepMetres: VOXEL } as const;

/**
 * Light for a new slab and the max-merge for the rows above it, off the main thread (the old descent's protocol at
 * 0.5 m). `context` holds the CONTEXT_ROWS voxel rows above the slab as they are in the ring now (slab layout:
 * x + 128 (r + rows z), r = 0 the topmost). The result is in storage-row order (world y ascending): `slab` for the slab's
 * 32 rows, `context` for the rows above, both RGBA8 in LightField.writeRows layout; `contextOpen` the exact openness of
 * the OPEN_CONTEXT_ROWS rows just above the slab.
 */
export function slabLight(slabBlocks: Uint8Array, context: Uint8Array): { slab: Uint8Array; context: Uint8Array; contextOpen: Uint8Array } {
  const rows = FLOOR_ROWS + SLAB_ROWS + CONTEXT_ROWS;
  const w = new VoxelWorld(RING_SX, rows, RING_SZ, 8);
  const b = w.blocks;
  b.fill(B.BEDROCK);
  for (let z = 0; z < RING_SZ; z++) {
    for (let r = 0; r < SLAB_ROWS; r++) {
      const ty = FLOOR_ROWS + SLAB_ROWS - 1 - r;
      b.set(slabBlocks.subarray(RING_SX * (r + SLAB_ROWS * z), RING_SX * (r + SLAB_ROWS * z) + RING_SX), RING_SX * (ty + rows * z));
    }
    for (let r = 0; r < CONTEXT_ROWS; r++) {
      const ty = FLOOR_ROWS + SLAB_ROWS + CONTEXT_ROWS - 1 - r;
      b.set(context.subarray(RING_SX * (r + CONTEXT_ROWS * z), RING_SX * (r + CONTEXT_ROWS * z) + RING_SX), RING_SX * (ty + rows * z));
    }
  }
  const field = new LightField(w, undefined, { stepMetres: VOXEL });
  field.computeAll();
  const slab = new Uint8Array(RING_SX * SLAB_ROWS * RING_SZ * 4);
  const ctx = new Uint8Array(RING_SX * CONTEXT_ROWS * RING_SZ * 4);
  const open = new Uint8Array(RING_SX * OPEN_CONTEXT_ROWS * RING_SZ);
  const rowBytes = RING_SX * 4;
  for (let z = 0; z < RING_SZ; z++)
    for (let ty = FLOOR_ROWS; ty < rows; ty++) {
      const src = RING_SX * (ty + rows * z) * 4;
      const r = ty - FLOOR_ROWS;
      if (r < SLAB_ROWS) slab.set(field.data.subarray(src, src + rowBytes), RING_SX * (r + SLAB_ROWS * z) * 4);
      else {
        ctx.set(field.data.subarray(src, src + rowBytes), RING_SX * (r - SLAB_ROWS + CONTEXT_ROWS * z) * 4);
        const c = r - SLAB_ROWS;
        if (c < OPEN_CONTEXT_ROWS) for (let x = 0; x < RING_SX; x++) open[x + RING_SX * (c + OPEN_CONTEXT_ROWS * z)] = field.data[src + x * 4 + 3];
      }
    }
  return { slab, context: ctx, contextOpen: open };
}
