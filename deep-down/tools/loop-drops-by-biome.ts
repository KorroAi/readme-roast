// LOOP tool (round 3): what each biome's creatures drop (MOBS' SPECIES drops over the ROSTERS), to
// check that every stratum gives its recipes' creature parts.
// Usage: node tools/run-ts.mjs tools/loop-drops-by-biome.ts
import { ROSTERS } from '../src/game/mobs/rosters';
import { SPECIES } from '../src/game/mobs/species';

export default function main(): void {
  for (const [b, r] of Object.entries(ROSTERS)) {
    const parts: Record<string, number> = {};
    for (const e of [...r.monsters, ...r.beings]) {
      const sp = SPECIES[e.kind];
      for (const d of sp.drops) for (const it of d.items.slice(0, 1)) parts[it] = (parts[it] ?? 0) + e.weight * d.chance * ((d.min + d.max) / 2);
    }
    const g = SPECIES[r.guardian];
    console.log(`${b.padEnd(16)} monsters ${r.monsters.map((m) => m.kind).join(',')} | beings ${r.beings.map((m) => m.kind).join(',')} | guardian ${r.guardian} hp ${g.hp}\n   drops ${Object.entries(parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
  }
}
