// LOOP: list every creature's biome, hp and drops (economy checks).
import { SPECIES } from '../src/game/mobs/species';
import { ROSTERS } from '../src/game/mobs/rosters';
export default function main(): void {
  for (const [b, r] of Object.entries(ROSTERS)) {
    const line = (k: string, w?: number) => {
      const s = SPECIES[k as keyof typeof SPECIES];
      return `${k}(${w ?? '-'} hp${s.hp}: ${s.drops.map((d) => `${d.items.join('|')} ${d.min}-${d.max}@${d.chance}`).join(', ')})`;
    };
    console.log(`${b}: ${r.monsters.map((e) => line(e.kind, e.weight)).join('; ')}`);
    console.log(`   guardian ${line(r.guardian)}`);
  }
}
