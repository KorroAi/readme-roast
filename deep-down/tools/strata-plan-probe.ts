// WORLD probe (round 3): the plan's special nodes (works, vista, overlook) and their edges for one attempt.
// Usage: node tools/run-ts.mjs tools/strata-plan-probe.ts seed stratum attempt
import { stratumDef } from '../src/config/biomes';
import { hash32 } from '../src/core/math';
import { planStratum } from '../src/world/gen/strata/plan';
import { stratumSeed } from '../src/world/gen/strata/generateStratum';

export default function probe(args: string[]): void {
  const seed = Number(args[0]);
  const n = Number(args[1]);
  const attempt = Number(args[2] ?? 0);
  const s = hash32(stratumSeed(seed, n) + attempt * 0x1f123bb5) >>> 0;
  const plan = planStratum(s, n as 1, stratumDef(n).biomes, 256, 256);
  for (const nd of plan.nodes) {
    if (!['dungeon', 'vista', 'overlook', 'lair'].includes(nd.kind)) continue;
    const es = plan.edges.filter((e) => e.a === nd.id || e.b === nd.id).map((e) => {
      const o = plan.nodes[e.a === nd.id ? e.b : e.a];
      return `${o.kind}#${o.id}@(${o.x.toFixed(0)},${o.y},${o.z.toFixed(0)})`;
    });
    console.log(nd.kind, nd.id, `(${nd.x.toFixed(1)}, ${nd.y}, ${nd.z.toFixed(1)})`, 'edges:', es.join(' '));
  }
  console.log('dungeon', plan.dungeon, 'note', plan.worksNote, 'river', plan.river);
}
