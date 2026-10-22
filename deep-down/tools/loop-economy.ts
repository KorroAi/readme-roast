// LOOP tool (round 3): the economy and quest simulation on real strata. Generates the six strata of
// an expedition seed with WORLD's generator, measures what each offers (sight-minable ore blocks
// per item and tier, chests, the creatures' drops, the guardians), then runs the descent plan of
// src/game/craft/economy.ts with the recipes as written and prints a table per stratum.
// Usage: node tools/run-ts.mjs tools/loop-economy.ts [seed] [outJson]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { measureStrata } from '../src/game/craft/supply';
import { simulateDescent } from '../src/game/craft/economy';
import { ITEMS, type ItemId } from '../src/config/items';

const fmt = (n: number, w = 6, d = 1) => n.toFixed(d).padStart(w);

export default function main(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  const out = args[1] ?? null;
  const t0 = performance.now();
  const supplies = measureStrata(seed);
  const t1 = performance.now();
  const report = simulateDescent(supplies);
  console.log(`seed ${seed}: measured 6 strata in ${((t1 - t0) / 1000).toFixed(1)} s`);
  console.log('stratum  tunnel m  ore blocks  chests  phi   min   walk  mine fight chest guard  over   dps  pick  short');
  for (const r of report.strata) {
    const s = supplies.find((x) => x.stratum === r.stratum)!;
    const oreBlocks = s.ores.reduce((a, o) => a + o.blocks, 0);
    const short = Object.entries(r.short).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
    console.log(
      `   ${r.stratum}     ${fmt(s.tunnelMetres, 7, 0)}   ${fmt(oreBlocks, 8, 0)}   ${fmt(s.chests.length, 5, 0)}  ${fmt(r.phi, 4, 2)} ${fmt(r.minutes, 5)} ${fmt(r.parts.walk, 5)} ${fmt(r.parts.mine, 5)} ${fmt(r.parts.fight, 5)} ${fmt(r.parts.chests, 5)} ${fmt(r.parts.guardians, 5)} ${fmt(r.parts.overhead, 5)} ${fmt(r.dps, 5)}   ${r.pickTier}   ${short}`,
    );
  }
  console.log(`total ${report.totalMinutes.toFixed(1)} min; feasible: ${report.feasible}`);
  // Sensitivity: an explorer who finds the lairs with less walking, or more.
  for (const share of [0.25, 0.45]) {
    const r = simulateDescent(supplies, undefined, undefined, share);
    const shorts = r.strata.filter((x) => Object.keys(x.short).length).map((x) => `S${x.stratum} ${Object.entries(x.short).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    console.log(`  walking ${Math.round(share * 100)} % of the tunnels: ${r.strata.map((x) => x.minutes.toFixed(1)).join(' / ')} min (total ${r.totalMinutes.toFixed(0)}), feasible ${r.feasible}${shorts.length ? ` (short: ${shorts.join('; ')})` : ''}`);
  }
  for (const r of report.strata) {
    const raw = Object.entries(r.bill.raw)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([k, v]) => `${k} ${Math.ceil(v ?? 0)}`)
      .join(', ');
    console.log(`  S${r.stratum} gathers: ${raw || '-'} | fuel ${r.bill.fuel} | blocks mined ${Math.round(r.blocks)}, kills ${Math.round(r.kills)}`);
    console.log(`      made: ${r.made.join(', ')}${r.skipped.length ? ` | left for later: ${r.skipped.join(', ')}` : ''}`);
  }
  const bank = Object.entries(report.bank)
    .filter(([, v]) => (v ?? 0) >= 1)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .slice(0, 20)
    .map(([k, v]) => `${ITEMS[k as ItemId] ? k : '?' + k} ${Math.floor(v ?? 0)}`)
    .join(', ');
  console.log(`  bank at the Heart (top 20): ${bank}`);
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({ seed, supplies, report }, null, 1));
    console.log(`wrote ${out}`);
  }
}
