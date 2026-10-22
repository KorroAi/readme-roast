// WORLD probe: why a plan has no Halden works: the works' entry, its box direction, and the chambers in
// front of it with whether a tunnel to them would cross another (the plan's own rules).
import { stratumDef } from '../src/config/biomes';
import { hash32 } from '../src/core/math';
import { planStratum } from '../src/world/gen/strata/plan';
import { stratumSeed } from '../src/world/gen/strata/generateStratum';
export default function why(args: string[]): void {
  const seed = Number(args[0]);
  const n = Number(args[1]);
  const attempt = Number(args[2] ?? 0);
  const s = hash32(stratumSeed(seed, n) + attempt * 0x1f123bb5) >>> 0;
  const plan = planStratum(s, n as 1, stratumDef(n).biomes, 256, 256);
  console.log('note', plan.worksNote, 'nodes', plan.nodes.length, 'edges', plan.edges.length);
  const dn = plan.nodes.find((x) => x.kind === 'room' && x.rx === 6 && x.ry === 4.5);
  if (dn) console.log('works fell back to a room at', dn.x.toFixed(0), dn.z.toFixed(0), 'edges', dn.edges.length);
}
