// A ring fixture from the hybrid world (BUILD §3.2): the live window of slabs around a depth, generated synchronously
// without light, for the mesher tests. (The old 7-cell shaft fixture went with the descent world's cut.)
import { VoxelRing } from '../../../src/world/hybrid/VoxelRing';
import { generateSlab } from '../../../src/world/hybrid/slab';
import { SLAB_M } from '../../../src/world/hybrid/grid';

/** A VoxelRing holding the live window around `depthM` metres down (the dig front at `dugTo` rows). */
export function ringAt(seed: number, depthM: number, runSeed = 7, dugTo = 0): VoxelRing {
  const ring = new VoxelRing();
  const focus = Math.max(0, Math.floor(depthM / SLAB_M));
  const { first, last } = VoxelRing.windowFor(focus);
  for (let k = first; k <= last; k++) ring.writeSlab(k, generateSlab({ lifeSeed: seed, runSeed, k, dugTo }).blocks);
  return ring;
}
