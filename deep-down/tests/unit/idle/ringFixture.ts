import { rowKinds } from '../../../src/idle/model/shaft';
import { CELL } from '../../../src/idle/model/state';
import { RingWorld, SLAB_ROWS } from '../../../src/world/descent/RingWorld';
import { generateSlab } from '../../../src/world/descent/slab';

/** The shaft kinds of slab k from the model's pure table (rows above `floor` dug). */
export function kindsFor(seed: number, k: number, floor = 0): Uint8Array {
  const out = new Uint8Array(SLAB_ROWS * 7);
  if (k < 0) return out;
  for (let r = 0; r < SLAB_ROWS; r++) {
    const row = k * SLAB_ROWS + r;
    const kinds = rowKinds(seed, row);
    for (let c = 0; c < 7; c++) out[r * 7 + c] = row < floor ? CELL.AIR : kinds[c];
  }
  return out;
}

/** A RingWorld holding the live window around `floor` (synchronous generation, no light). */
export function ringAt(seed: number, floor: number): RingWorld {
  const ring = new RingWorld();
  const { first, last } = RingWorld.windowFor(floor);
  for (let k = first; k <= last; k++) ring.writeSlab(k, generateSlab({ runSeed: seed, k, kinds: kindsFor(seed, k, floor) }).blocks);
  return ring;
}
