import { B } from '../config/blocks';
import { PADDED_VOXELS, meshPadded } from './mesher';

/**
 * Mesh synthetic chunks so V8 compiles the mesher before real work arrives: a fresh isolate (each
 * mesh worker) spends its first ~10 meshes at 15-90 ms each before the optimised code takes over
 * at ~1 ms. Each block is a rolling natural-rock surface with a pillar, masonry, crystal and
 * timber, so every sculpting, AO and seam path runs. Output is discarded; MESH_OPTIONS are not
 * touched. Stops after `reps` meshes or `budgetMs`. Returns the ms spent.
 */
export function warmUpMesher(reps = 32, budgetMs = 900): number {
  const t0 = performance.now();
  const v = new Uint8Array(PADDED_VOXELS);
  for (let rep = 0; rep < reps && performance.now() - t0 < budgetMs; rep++) {
    for (let z = 0; z < 20; z++)
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 20; x++) {
          const pillar = y > 12 && x > 6 && x < 10 && z > 5 && z < 9 ? 6 : 0;
          const h = 9 + 3 * Math.sin((x + rep * 3) * 0.45) + 2 * Math.cos((z + rep) * 0.37 + x * 0.1) + pillar;
          let id: number = y < h ? ((x + z + rep) % 7 ? B.SLATE : B.UMBER) : B.AIR;
          if (id !== B.AIR && x > 12 && z < 6) id = B.ANCIENT_BRICK;
          if (id !== B.AIR && x === 3 && y > 4 && y < 8) id = B.CRYSTAL;
          if (y === 15 && x > 13 && z > 13) id = B.PLANK;
          v[x + 20 * (y + 20 * z)] = id;
        }
    meshPadded(v, rep, 2, rep % 5);
  }
  return performance.now() - t0;
}
