// MOBS: the cost of the spawner's reach flood (game/mobs/spawner Reach) on WORLD's real strata, at
// walkable spots in tunnels and in the biggest caverns. Usage: node tools/run-ts.mjs tools/mob-reach-bench.ts [seed] [strata]
import { SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { standableAt } from '../src/world/gen/strata/content';
import { FlowField } from '../src/game/mobs/flow';
import { MOBS_RULES } from '../src/game/mobs/config';

export default function bench(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  for (const n of (args[1] ?? '1,3,6').split(',').map(Number)) {
    const l = generateStratum(seed, n);
    const w = l.world;
    const solid = (x: number, y: number, z: number) => SOLID[w.get(x, y, z)] === 1;
    const spots: Array<[number, number, number, string]> = [];
    for (const c of (l as unknown as { caverns?: Array<{ centre?: number[]; c?: number[] }> }).caverns ?? []) {
      const p = c.centre ?? c.c;
      if (!p) continue;
      for (let dy = -8; dy < 8; dy++) if (standableAt(w.blocks, w.sx, w.sy, Math.floor(p[0]), Math.floor(p[1]) + dy, Math.floor(p[2]))) {
        spots.push([Math.floor(p[0]), Math.floor(p[1]) + dy, Math.floor(p[2]), 'cavern']);
        break;
      }
    }
    for (const sp of l.spawnPoints.slice(0, 40)) spots.push([Math.floor(sp.p[0]), Math.floor(sp.p[1]), Math.floor(sp.p[2]), 'spot']);
    const res: Record<string, number[]> = { hunt: [], ambush: [], cells: [] };
    const ff = new FlowField();
    for (const [x, y, z] of spots) {
      let t0 = performance.now();
      ff.build(solid, x + 0.5, y, z + 0.5, MOBS_RULES.huntReach, 0);
      res.hunt.push(performance.now() - t0);
      res.cells.push(ff.cells);
      t0 = performance.now();
      ff.build(solid, x + 0.5, y, z + 0.5, MOBS_RULES.flowReach, 0);
      res.ambush.push(performance.now() - t0);
    }
    const q = (a: number[], k: number) => [...a].sort((u, v) => u - v)[Math.min(a.length - 1, Math.floor(k * (a.length - 1)))];
    console.log(`stratum ${n}: ${spots.length} spots; a flood of ${MOBS_RULES.huntReach} steps: median ${q(res.hunt, 0.5).toFixed(2)} ms, p90 ${q(res.hunt, 0.9).toFixed(2)}, max ${Math.max(...res.hunt).toFixed(2)}; the flow field (${MOBS_RULES.flowReach} steps): median ${q(res.ambush, 0.5).toFixed(2)} ms, max ${Math.max(...res.ambush).toFixed(2)}; cells reached median ${q(res.cells, 0.5)}, max ${Math.max(...res.cells)}`);
  }
}
