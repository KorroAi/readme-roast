// Prints the zone's light budget: cyan vs warm emitter voxels and the distance from each landmark
// to the nearest warm emitter. Usage: node tools/run-ts.mjs tools/emission-budget.ts
import { BLOCKS } from '../src/config/blocks';
import { generateWorld } from '../src/world/gen/generateWorld';

export default function emissionBudget(): void {
  const { world, landmarks } = generateWorld();
  let cyan = 0;
  let warm = 0;
  const warmCells: [number, number, number][] = [];
  for (let y = 0; y < world.sy; y++)
    for (let z = 0; z < world.sz; z++)
      for (let x = 0; x < world.sx; x++) {
        const e = BLOCKS[world.get(x, y, z)]?.emission;
        if (!e) continue;
        if (e[2] > e[0]) cyan++;
        else {
          warm++;
          warmCells.push([x, y, z]);
        }
      }
  console.log(`cyan emitter voxels ${cyan}, warm ${warm}`);
  for (const [name, p] of Object.entries(landmarks)) {
    if (!p) continue;
    let best = Infinity;
    for (const c of warmCells)
      best = Math.min(
        best,
        Math.hypot(c[0] + 0.5 - p[0], c[1] + 0.5 - p[1], c[2] + 0.5 - p[2]),
      );
    console.log(`${name.padEnd(16)} nearest warm ${best.toFixed(1)} m`);
  }
}
