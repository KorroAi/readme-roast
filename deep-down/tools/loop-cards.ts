// LOOP tool (round 3): every biome's arrival card as the player reads it (name, line, hazard, counter, rumour).
// Usage: node tools/run-ts.mjs tools/loop-cards.ts
import { BIOME_IDS } from '../src/config/biomes';
import { arrivalCard } from '../src/game/quests/Guide';

export default function main(): void {
  for (const b of BIOME_IDS) {
    const c = arrivalCard(b, true);
    console.log(`${c.stratum} ${c.name}: ${c.line}\n   hazard: ${c.hazard ?? '-'}\n   counter: ${c.counter ?? '-'}\n   rumour: ${c.rumour}`);
  }
}
