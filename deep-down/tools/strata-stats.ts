// WORLD proof (round 3): robustness over many seeds. For each (seed, stratum): does the first plan
// pass (every key place walkable), how many attempts the generator needed, and is every structure
// there (the vista, the river, the Halden works, a set piece and a secret room per biome, the
// ravines), with the timing. Ends with the totals and the failure causes.
// Usage: node tools/run-ts.mjs tools/strata-stats.ts [firstSeed] [count] [strata e.g. 1,2,3,4,5,6]
import { attemptStratum } from '../src/world/gen/strata/generateStratum';
import { SET_PIECES } from '../src/world/gen/strata/structures';
import type { StratumIndex } from '../src/config/biomes';

export default function stats(args: string[]): void {
  const first = Number(args[0] ?? 1);
  const count = Number(args[1] ?? 12);
  const strata = (args[2] ?? '1,2,3,4,5,6').split(',').map(Number);
  const tally: Record<string, number> = {};
  const missing: Record<string, number> = {};
  let plans = 0;
  let firstOk = 0;
  let allOk = 0;
  let worst = 0;
  const times: number[] = [];
  for (let s = first; s < first + count; s++) {
    const seed = (Math.imul(s, 0x9e3779b1) >>> 0) || 1;
    for (const n of strata) {
      plans++;
      let ok = false;
      for (let a = 0; a < 6 && !ok; a++) {
        const t0 = performance.now();
        const l = attemptStratum(seed, n as StratumIndex, a);
        const ms = performance.now() - t0;
        times.push(ms);
        worst = Math.max(worst, ms);
        for (const f of l.failed) tally[f.replace(/_[a-zA-Z]+$/, '_*')] = (tally[f.replace(/_[a-zA-Z]+$/, '_*')] ?? 0) + 1;
        if (!l.ok) {
          console.log(`seed ${seed} stratum ${n} attempt ${a}: FAIL ${l.failed.join(',')} (${Math.round(ms)} ms)`);
          continue;
        }
        ok = true;
        if (a === 0) firstOk++;
        allOk++;
        const miss: string[] = [];
        if (!l.vista) miss.push('vista');
        if (!l.rivers.length) miss.push('river');
        if (!l.dungeon) miss.push(`works(${l.worksNote})`);
        for (const b of l.biomes) {
          if (!l.sites.some((x) => x.kind === 'setPiece' && x.name === SET_PIECES[b as keyof typeof SET_PIECES])) miss.push(`set:${b}`);
          if (!l.secrets.some((x) => x.biome === b)) miss.push(`secret:${b}`);
        }
        if (!l.ravines.length) miss.push('ravines');
        if ((l.timings.phases.trapsLeft ?? 0) > 0) miss.push(`traps:${l.timings.phases.trapsLeft}`);
        for (const m of miss) missing[m.replace(/\(.*\)|:.*$/, '')] = (missing[m.replace(/\(.*\)|:.*$/, '')] ?? 0) + 1;
        console.log(`seed ${seed} stratum ${n} attempt ${a}: ok (${Math.round(ms)} ms)${miss.length ? ' MISSING ' + miss.join(',') : ''}`);
      }
      if (!ok) console.log(`seed ${seed} stratum ${n}: NO VALID PLAN in 6 attempts`);
    }
  }
  times.sort((a, b) => a - b);
  console.log(`plans ${plans}, first-plan ok ${firstOk} (${((firstOk / plans) * 100).toFixed(1)} %), valid within 6 ${allOk}, attempt ms median ${Math.round(times[times.length >> 1])} p95 ${Math.round(times[Math.floor(times.length * 0.95)])} max ${Math.round(worst)}`);
  console.log('failed keys', JSON.stringify(tally), 'missing structures', JSON.stringify(missing));
}
