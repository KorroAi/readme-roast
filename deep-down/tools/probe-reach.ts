// List reachable stand cells (barriers open, rides on) inside a box (WORLD round 2 helper).
// Usage: node tools/run-ts.mjs tools/probe-reach.ts x0,y0,z0,x1,y1,z1 [limit]
import { generateWorld } from '../src/world/gen/generateWorld';
import { reachableCells } from '../src/world/analysis/reachability';
import { openWorld } from './poi-density';
export default function probe(args: string[]): void {
  const layout = generateWorld();
  const w = openWorld(layout);
  const sp = layout.spawn;
  const seen = reachableCells(w, Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z), 3, layout.features?.links ?? []);
  for (const a of args.filter((s) => s.includes(','))) {
    const [x0, y0, z0, x1, y1, z1] = a.split(',').map(Number);
    const out: string[] = [];
    const ys = new Map<number, number>();
    for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (w.inBounds(x, y, z) && seen[w.index(x, y, z)]) { out.push(`${x},${y},${z}`); ys.set(y, (ys.get(y) ?? 0) + 1); }
    console.log(a, 'count', out.length, 'by y', JSON.stringify([...ys].sort((p, q) => p[0] - q[0])));
    console.log(out.slice(0, Number(args.find((s) => !s.includes(',')) ?? 40)).join(' '));
  }
}
