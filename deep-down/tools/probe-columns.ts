// Print the open runs (feet levels) of given columns (WORLD round 2 helper).
// Usage: node tools/run-ts.mjs tools/probe-columns.ts x,z x,z ...
import { SOLID } from '../src/config/blocks';
import { generateWorld } from '../src/world/gen/generateWorld';
export default function probe(args: string[]): void {
  const { world: w } = generateWorld();
  for (const a of args) {
    const [x, z] = a.split(',').map(Number);
    const runs: string[] = [];
    let y = 1;
    while (y < w.sy - 1) {
      if (SOLID[w.get(x, y, z)]) { y++; continue; }
      const y0 = y;
      while (y < w.sy - 1 && !SOLID[w.get(x, y, z)]) y++;
      runs.push(`${y0}-${y - 1}(floor ${w.get(x, y0 - 1, z)})`);
    }
    console.log(`${x},${z}: ${runs.join(' ')}`);
  }
}
