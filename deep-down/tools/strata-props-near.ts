// WORLD probe: the props of a stratum near a point (id, kind, position, turn), nearest first.
// Usage: node tools/run-ts.mjs tools/strata-props-near.ts seed stratum x,y,z [radius] [kind]
import { generateStratum } from '../src/world/gen/strata/generateStratum';
export default function near(args: string[]): void {
  const l = generateStratum(Number(args[0]), Number(args[1]));
  const [x, y, z] = args[2].split(',').map(Number);
  const r = Number(args[3] ?? 6);
  const kind = args[4];
  const list = l.props
    .filter((p) => (!kind || p.kind === kind) && Math.hypot(p.x - x, (p.y - y) * 2, p.z - z) < r)
    .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  for (const p of list) console.log(p.id, p.kind, [p.x, p.y, p.z].map((v) => +v.toFixed(2)).join(','), 'rotY', p.rotY.toFixed(2), p.interact ? `interact ${p.interact}` : 'decor');
}
