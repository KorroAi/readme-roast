// WORLD proof (round 3): traps per stratum. A trap is a place the explorer can walk (or climb) into
// from the arrival with no walk (or climb) back: plain rock never breaks, and a chain of short drops
// arms no pit rescue. Measured on the world as generated and on the worst case a player can make
// (every breakable block mined), the works' door, the cracked walls and the Heart's door open.
// Usage: node tools/run-ts.mjs tools/strata-traps.ts [seeds e.g. 12345,777] [strata e.g. 1,2,3,4,5,6]
import { B, SOLID } from '../src/config/blocks';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { TrapScratch, WORST_SOLID, homewardStates, isState, trapPockets, walkStates, type TrapPocket } from '../src/world/gen/strata/traps';
import { genDebug } from '../src/world/gen/strata/generateStratum';
import type { StratumLayout } from '../src/world/gen/strata/types';

export function measureTraps(l: StratumLayout, worst: boolean, scratch?: TrapScratch): { reach: number; trapped: number; pockets: TrapPocket[]; ms: number } {
  const t0 = performance.now();
  const w = l.world;
  const d = { sx: w.sx, sy: w.sy, sz: w.sz };
  const sc = scratch ?? new TrapScratch(d);
  const b = w.blocks.slice();
  const open: Array<readonly number[]> = [...(l.dungeon?.door ?? []), ...(l.stratum === 6 ? l.gate.seal : [])];
  for (const [x, y, z] of open) b[w.index(x, y, z)] = B.AIR;
  for (let i = 0; i < b.length; i++) if (b[i] === B.CRACKED_WALL) b[i] = B.AIR;
  const S = worst ? WORST_SOLID : SOLID;
  const nReach = walkStates(b, S, d, [l.arrival.x, l.arrival.y, l.arrival.z], sc.a, sc.q);
  sc.list.set(sc.q.subarray(0, nReach));
  const c = l.camp;
  const targets: number[] = [];
  for (let z = Math.ceil(c.min[2]); z <= Math.floor(c.max[2]); z++)
    for (let y = Math.max(1, Math.ceil(c.min[1])); y <= Math.min(w.sy - 3, Math.floor(c.max[1])); y++)
      for (let x = Math.ceil(c.min[0]); x <= Math.floor(c.max[0]); x++) {
        const i = w.index(x, y, z);
        if (isState(b, S, w.sx, i)) targets.push(i);
      }
  homewardStates(b, S, d, targets, sc.b, sc.q);
  let reach = 0;
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    if (!sc.a[i]) continue;
    reach++;
    if (!sc.b[i]) n++;
  }
  return { reach, trapped: n, pockets: trapPockets(sc.list, nReach, sc.b, d), ms: Math.round(performance.now() - t0) };
}

export default function traps(args: string[]): void {
  const seeds = (args[0] ?? '12345,777,4242').split(',').map(Number);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  let total = 0;
  if (args.includes('--log')) genDebug.trapLog = (line) => console.log('   ', line);
  for (const seed of seeds) for (const n of strata) {
    const l = generateStratum(seed, n);
    const fix = (l as unknown as { timings: { phases: Record<string, number> } }).timings.phases;
    for (const worst of [false, true]) {
      const r = measureTraps(l, worst);
      total += r.trapped;
      const top = r.pockets.slice(0, 4).map((p) => `${p.cells.length}@(${p.centre.map((v) => Math.round(v)).join(',')}) y${p.minY}-${p.maxY}`);
      console.log(`seed ${seed} stratum ${n} ${worst ? 'worst' : 'as-is'}: reach ${r.reach} trapped ${r.trapped} in ${r.pockets.length} pockets (${r.ms} ms) ${top.join(' ')}`);
    }
    if (fix.trapsFound !== undefined) console.log(`  generator: found ${fix.trapsFound} / ${fix.worstFound}, ladders ${fix.ladders}, filled ${fix.trapFilled}, left ${fix.trapsLeft}, ${fix.traps} ms`);
  }
  console.log('trapped cells in total', total);
}
