import { describe, expect, it } from 'vitest';
import { BIOMES, STRATA } from '../../src/config/biomes';
import { ROSTERS } from '../../src/game/mobs/rosters';
import { MOB_BIOMES } from '../../src/game/mobs/types';
import { generateStratum } from '../../src/world/gen/strata/generateStratum';

// MOBS (round 3): WORLD's biome table and lairs name only the creatures that live there (WORLD mirrors
// MOBS' rosters): the arrival cards, the map and the bestiary never promise a creature a biome lacks,
// and every lair's sleeper is its biome's guardian.

describe("WORLD's biomes agree with the rosters", () => {
  it('BIOMES[b].mobs is ROSTERS[b] for the 12 biomes and the Heart, and each stratum holds its two biomes', () => {
    for (const b of MOB_BIOMES) {
      const r = ROSTERS[b];
      expect(BIOMES[b].mobs.monsters, b).toEqual(r.monsters.map((e) => e.kind));
      expect(BIOMES[b].mobs.beings, b).toEqual(r.beings.map((e) => e.kind));
      expect(BIOMES[b].mobs.guardian, b).toBe(r.guardian);
      if (b !== 'heart') expect(STRATA[r.stratum - 1].biomes, b).toContain(b);
    }
  });

  it("each generated lair's guardian is its biome's (strata I and VI)", () => {
    for (const n of [1, 6]) {
      const l = generateStratum(4242, n);
      expect(l.lairs.length, `stratum ${n}`).toBe(2);
      for (const lair of l.lairs) expect(lair.guardian, lair.id).toBe(ROSTERS[lair.biome].guardian);
      if (n === 6) expect(l.heart, 'the Heart in stratum VI').toBeTruthy();
    }
  }, 60_000);
});
