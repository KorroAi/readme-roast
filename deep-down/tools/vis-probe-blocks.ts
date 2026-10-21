// VIS probe (temporary): solid voxels in a box at one height (args: x0 x1 z0 z1 y).
import { generateWorld } from '../src/world/gen/generateWorld';
import { B } from '../src/config/blocks';
export default function probe(args: string[]): void {
  const [x0, x1, z0, z1, y] = args.map(Number);
  const names = Object.fromEntries(Object.entries(B).map(([k, v]) => [v, k]));
  const w = generateWorld().world;
  for (let z = z0; z <= z1; z++) {
    const row: string[] = [];
    for (let x = x0; x <= x1; x++) row.push((names[w.get(x, y, z)] ?? '?').slice(0, 6).padEnd(6));
    console.log(z, row.join(' '));
  }
}
