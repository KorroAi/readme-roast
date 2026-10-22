// WORLD probe (round 3): which key places fail per attempt of the strata generator (seeds x strata).
// Usage: node tools/run-ts.mjs tools/strata-attempts.ts [seeds e.g. 1,2,3] [strata e.g. 1,2,3,4,5,6]
import { attemptStratum } from '../src/world/gen/strata/generateStratum';

export default function attempts(args: string[]): void {
  const seeds = (args[0] ?? '12345,777,4242').split(',').map(Number);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  const tally: Record<string, number> = {};
  let total = 0;
  let firstOk = 0;
  for (const seed of seeds) for (const n of strata) {
    for (let a = 0; a < 6; a++) {
      const t0 = performance.now();
      const l = attemptStratum(seed, n as 1, a);
      const ms = Math.round(performance.now() - t0);
      total++;
      for (const f of l.failed) tally[f.replace(/_[a-zA-Z]+$/, '_*')] = (tally[f.replace(/_[a-zA-Z]+$/, '_*')] ?? 0) + 1;
      console.log(`seed ${seed} stratum ${n} attempt ${a}: ${l.ok ? 'ok' : 'FAIL ' + l.failed.join(',')} ${ms} ms vista=${!!l.vista} works=${!!l.dungeon} river=${l.rivers.length} sets=${l.sites.filter((s) => s.kind === 'setPiece').map((s) => s.name).join('/')}`);
      if (l.ok) {
        if (a === 0) firstOk++;
        break;
      }
    }
  }
  console.log('attempts', total, 'first-try ok', firstOk, 'of', seeds.length * strata.length, 'failures', JSON.stringify(tally));
}
