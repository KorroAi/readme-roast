import { BLOCK_COUNT } from '../config/blocks';

/**
 * World edits are saved as a delta against the deterministic generator output: a flat
 * list of [index, blockId, index, blockId, ...] pairs in ascending index order, using the
 * VoxelWorld index (x + sx * (y + sy * z)). An hour of mining is a few thousand pairs,
 * a few tens of KB of JSON, instead of the 3.3 MB volume.
 */

/** Every voxel where `current` differs from `generated`. Both must be the same size. */
export function encodeWorldEdits(generated: Uint8Array, current: Uint8Array): number[] {
  const n = generated.length;
  if (current.length !== n) throw new RangeError(`encodeWorldEdits: size mismatch (${n} vs ${current.length})`);
  const out: number[] = [];
  // Autosave scans the whole volume mid-play; comparing 4 voxels per step is ~1.5x faster
  // than a byte loop (2.3 vs 3.6 ms for 160x128x160 on the dev container).
  const aligned = generated.byteOffset % 4 === 0 && current.byteOffset % 4 === 0;
  const words = aligned ? n >>> 2 : 0;
  if (words > 0) {
    const g32 = new Uint32Array(generated.buffer, generated.byteOffset, words);
    const c32 = new Uint32Array(current.buffer, current.byteOffset, words);
    for (let w = 0; w < words; w++) {
      if (g32[w] === c32[w]) continue;
      for (let i = w * 4, end = i + 4; i < end; i++) if (generated[i] !== current[i]) out.push(i, current[i]);
    }
  }
  for (let i = words * 4; i < n; i++) if (generated[i] !== current[i]) out.push(i, current[i]);
  return out;
}

/**
 * Write saved edits into `blocks`. Pairs with a non-integer or out-of-range index, or an
 * unknown block id, are skipped (as is a dangling final index). @returns pairs applied.
 */
export function applyWorldEdits(blocks: Uint8Array, edits: readonly number[]): number {
  const n = blocks.length;
  let applied = 0;
  for (let k = 0; k + 1 < edits.length; k += 2) {
    const i = edits[k];
    const id = edits[k + 1];
    if (!Number.isInteger(i) || i < 0 || i >= n || !Number.isInteger(id) || id < 0 || id >= BLOCK_COUNT) continue;
    blocks[i] = id;
    applied++;
  }
  return applied;
}
