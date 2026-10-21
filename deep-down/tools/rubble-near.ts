// Count loose stone and root tangles near the camp (WORLD round 2 helper: the tutorial's 12 stone).
import { B } from '../src/config/blocks';
import { generateWorld } from '../src/world/gen/generateWorld';
export default function run(): void {
  const l = generateWorld();
  const w = l.world;
  const s = l.spawn;
  for (const R of [15, 25, 40]) {
    let rubble = 0, roots = 0, copper = 0;
    for (let z = 0; z < w.sz; z++) for (let y = 80; y < w.sy; y++) for (let x = 0; x < w.sx; x++) {
      const id = w.get(x, y, z);
      if (id !== B.RUBBLE && id !== B.ROOTS && id !== B.COPPER_ORE) continue;
      if (Math.hypot(x + 0.5 - s.x, (y - s.y) * 1.5, z + 0.5 - s.z) > R) continue;
      if (id === B.RUBBLE) rubble++; else if (id === B.ROOTS) roots++; else copper++;
    }
    console.log(`within ${R} m of the spawn: rubble ${rubble}, roots ${roots}, copper ${copper}`);
  }
}
