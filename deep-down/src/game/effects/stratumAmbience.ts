import { SOLID } from '../../config/blocks';
import { hash32 } from '../../core/math';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { AmbientAnchor } from './Ambience';

/**
 * Round 3 (VIS): the strata's ambient anchors, read from the voxels (the hand-made world had WORLD
 * list them; a random stratum is read where it really is).
 *
 * Drips fall only from a real roof over a real floor (3-12 m below), in the biomes whose look lists
 * 'drips', about one per 3 x 3 columns that qualify, spread by a hash so they never line up.
 */

export interface DripOptions {
  /** Column step (m). */
  step?: number;
  /** Share of the qualifying columns that drip. */
  chance?: number;
  /** At most this many. */
  max?: number;
  seed?: number;
}

/** Drip anchors over a world (pure; unit-tested). `wants(x, y, z)` says whether that spot's biome drips. */
export function dripAnchors(world: VoxelWorld, wants: (x: number, y: number, z: number) => boolean, opts: DripOptions = {}): AmbientAnchor[] {
  const step = opts.step ?? 3;
  const chance = opts.chance ?? 0.2;
  const max = opts.max ?? 1200;
  const seed = opts.seed ?? 1;
  const out: AmbientAnchor[] = [];
  const { sx, sy, sz } = world;
  for (let bz = 1; bz < sz - 1; bz += step)
    for (let bx = 1; bx < sx - 1; bx += step) {
      const h = hash32(bx * 73856093 + bz * 19349663 + seed * 83492791) >>> 0;
      // One column per block, jittered inside it.
      const x = Math.min(sx - 2, bx + (h % step));
      const z = Math.min(sz - 2, bz + ((h >>> 8) % step));
      // Every roof over air in this column, top down.
      for (let y = sy - 2; y > 1; y--) {
        if (!SOLID[world.get(x, y, z)] || SOLID[world.get(x, y - 1, z)]) continue;
        // y is a roof cell (its bottom face over air): the floor below.
        let f = y - 1;
        while (f > 0 && !SOLID[world.get(x, f, z)]) f--;
        const drop = y - (f + 1);
        const r = ((hash32(h ^ (y * 2654435761)) >>> 0) % 10000) / 10000;
        if (drop >= 3 && drop <= 12 && f > 0 && r < chance && wants(x + 0.5, f + 1, z + 0.5)) {
          out.push({ kind: 'drip', p: [x + 0.5, y, z + 0.5], drop });
          if (out.length >= max) return out;
        }
        y = f + 1;
      }
    }
  return out;
}
