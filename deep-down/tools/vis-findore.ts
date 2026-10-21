import { generateWorld } from '../src/world/gen/generateWorld';
import { B } from '../src/config/blocks';
import { standable } from '../src/world/analysis/reachability';
// Exposed ore faces with a standable cell 2-3 m in front (for first-person close-ups).
export default function findOre(): void {
  const l = generateWorld();
  const w = l.world;
  for (const [name, id] of [['copper', B.COPPER_ORE], ['iron', B.IRON_ORE], ['lanternstone', B.LANTERNSTONE]] as const) {
    let n = 0;
    for (let z = 1; z < w.sz - 1 && n < 4; z++)
      for (let y = 1; y < w.sy - 1 && n < 4; y++)
        for (let x = 1; x < w.sx - 1 && n < 4; x++) {
          if (w.get(x, y, z) !== id) continue;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const sx = x + dx * 3, sz = z + dz * 3;
            if (w.get(x + dx, y, z + dz) !== 0) continue;
            for (const sy of [y - 1, y]) if (standable(w, sx, sy, sz)) { console.log(name, 'block', x, y, z, 'stand', sx, sy, sz); n++; break; }
            if (n >= 4) break;
          }
        }
  }
}
