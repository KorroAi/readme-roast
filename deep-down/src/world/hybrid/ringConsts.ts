// Re-exports of the grid constants VoxelRing needs (kept separate so the slab worker imports no Three).
export { CHUNK, PER_M, RING_SX, RING_SY, RING_SZ, SLAB_ROWS, SLOTS, slotOfSlab, storageRow } from './grid';
/** A slot that holds no slab. */
export const DEAD_SLAB = -0x7fffffff;
