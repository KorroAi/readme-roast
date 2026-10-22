// LOOP tool (round 3): what each generated stratum holds for the loop (chests, lairs, pages, hazard
// zones, WORLD's per-biome density stats), to check the economy model's inputs.
// Usage: node tools/run-ts.mjs tools/loop-strata-stats.ts [seed]
import { generateStratum } from '../src/world/gen/strata/generateStratum';

export default function main(args: string[]): void {
  const seed = Number(args[0] ?? 12345);
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const l = generateStratum(seed, n);
    const st = Object.entries(l.stats)
      .map(([b, s]) => `${b}: tunnel ${s.tunnelMetres ?? '?'} m, chests ${s.chests}, per25 ${s.chestsPer25m.toFixed(2)}, ore ${s.oreBlocks}, veins ${s.oreVeins}`)
      .join(' | ');
    const hz: Record<string, number> = {};
    for (const h of l.hazards) hz[h.kind] = (hz[h.kind] ?? 0) + 1;
    console.log(`S${n} chests ${l.chests.length} lairs ${l.lairs.length} pages ${l.pages.map((p) => p.n).join(',')} hazards ${JSON.stringify(hz)}\n   ${st}`);
  }
}
