// WORLD probe: one attempt with and without the trap fix (does the fix change the key places?).
import { attemptStratum, genDebug } from '../src/world/gen/strata/generateStratum';
export default function probe(args: string[]): void {
  const seed = Number(args[0]);
  const n = Number(args[1]) as 1;
  const a = Number(args[2] ?? 0);
  for (const off of [false, true]) {
    genDebug.noTraps = off;
    const l = attemptStratum(seed, n, a);
    console.log(off ? 'no fix ' : 'fixed  ', 'ok', l.ok, 'failed', l.failed.join(','), JSON.stringify(l.timings.phases));
  }
}
