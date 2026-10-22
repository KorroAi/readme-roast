// WORLD probe: the generator's phase timings (ms) for some strata, and the totals.
import { attemptStratum } from '../src/world/gen/strata/generateStratum';
export default function phases(args: string[]): void {
  const seeds = (args[0] ?? '12345').split(',').map(Number);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  const sum: Record<string, number> = {};
  let n = 0;
  for (const seed of seeds) for (const s of strata) {
    const t0 = performance.now();
    const l = attemptStratum(seed, s as 1, 0);
    const ms = performance.now() - t0;
    n++;
    const keys = ['plan', 'host', 'carve', 'worms', 'structures', 'dress', 'traps', 'walk', 'content', 'shell'];
    for (const k of keys) sum[k] = (sum[k] ?? 0) + (l.timings.phases[k] ?? 0);
    sum.total = (sum.total ?? 0) + ms;
    console.log(`seed ${seed} s${s} ${Math.round(ms)} ms`, keys.map((k) => `${k} ${l.timings.phases[k]}`).join(' '), `ravines ${l.ravines.length} works ${!!l.dungeon} ladders ${l.timings.phases.ladders}`);
  }
  console.log('mean', Object.entries(sum).map(([k, v]) => `${k} ${Math.round(v / n)}`).join(' '));
}
