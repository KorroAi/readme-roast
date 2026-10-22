// WORLD probe (round 3): where a lair's (or any key's) way breaks: walks its tunnel from the lair to its
// neighbour, printing per metre the floor, the walk BFS state and what blocks the walk.
// Usage: node tools/run-ts.mjs tools/strata-break-probe.ts seed stratum attempt [lairBiome]
import { BLOCKS, SOLID } from '../src/config/blocks';
import { attemptStratum } from '../src/world/gen/strata/generateStratum';
import { standableAt, walkBfs } from '../src/world/gen/strata/content';
import { edgePath, planStratum } from '../src/world/gen/strata/plan';
import { stratumDef } from '../src/config/biomes';
import { hash32 } from '../src/core/math';
import { stratumSeed } from '../src/world/gen/strata/generateStratum';

export default function probe(args: string[]): void {
  const seed = Number(args[0]);
  const n = Number(args[1]);
  const attempt = Number(args[2] ?? 0);
  const l = attemptStratum(seed, n as 1, attempt);
  const s = hash32(stratumSeed(seed, n) + attempt * 0x1f123bb5) >>> 0;
  const plan = planStratum(s, n as 1, stratumDef(n).biomes, 256, 256);
  const w = l.world;
  const open = new Set([...l.gate.seal, ...(l.dungeon?.door ?? [])].map(([x, y, z]) => w.index(x, y, z)));
  const seen = walkBfs({ world: w }, [l.arrival.x, l.arrival.y, l.arrival.z], open);
  console.log('failed', l.failed);
  const want = args[3];
  const targets = want === 'works' && plan.dungeon ? [plan.dungeon.node] : plan.lairs;
  for (const li of targets) {
    const lair = plan.nodes[li];
    if (want && want !== 'works' && lair.biome !== want) continue;
    const e = plan.edges.find((ed) => ed.a === li || ed.b === li)!;
    const other = plan.nodes[e.a === li ? e.b : e.a];
    console.log(`lair ${lair.biome} (${lair.x.toFixed(0)},${lair.y},${lair.z.toFixed(0)}) <- ${other.kind}#${other.id} (${other.x.toFixed(0)},${other.y},${other.z.toFixed(0)}) bridge=${!!e.bridge}`);
    const path = edgePath(plan, e, 1);
    const seq = e.a === li ? path : [...path].reverse();
    let k = 0;
    for (const [x0, y0, z0] of seq) {
      const x = Math.floor(x0);
      const z = Math.floor(z0);
      const y = Math.round(y0);
      let col = '';
      for (let yy = y - 3; yy <= y + 4; yy++) {
        const id = w.get(x, yy, z);
        col += seen[w.index(x, yy, z)] ? 'o' : standableAt(w.blocks, w.sx, w.sy, x, yy, z) ? 's' : SOLID[id] ? '#' : '.';
      }
      const below = BLOCKS[w.get(x, y - 1, z)]?.name;
      if (k % 2 === 0) console.log(`${String(k).padStart(3)} (${x},${y},${z}) [${col}] under=${below} vista=${l.vista ? Math.hypot(x - l.vista.centre[0], z - l.vista.centre[2]).toFixed(0) : '-'}`);
      k++;
    }
  }
}
