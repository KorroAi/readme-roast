import { describe, expect, it } from 'vitest';
import { BIOMES, STRATA } from '../../src/config/biomes';
import { ROSTERS } from '../../src/game/mobs/rosters';
import { MOB_BIOMES } from '../../src/game/mobs/types';
import { generateStratum } from '../../src/world/gen/strata/generateStratum';
import { MobSim, type MobEnv, type SimMob } from '../../src/game/mobs/MobSim';
import { linkStrata, underLake, type LakeView } from '../../src/game/mobs/strataLink';
import type { MobContext } from '../../src/game/mobs/types';

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

// Still water (WORLD's lakes fill a flooded chamber's dips): nothing spawns where the water would hide
// it. A synthetic hall, floor y = 10, with a dip 2 m deep (x 14..40, z 10..40) under a lake at 9.82.
describe('no creature spawns under a lake', () => {
  const FLOOR = 10;
  const dip = (x: number, z: number) => x >= 14 && x <= 40 && z >= 10 && z <= 40;
  const solid = (x: number, y: number, z: number): boolean => {
    if (x < 0 || x >= 80 || z < 0 || z >= 80 || y >= 26) return true;
    if (dip(x, z)) return y < FLOOR - 2;
    return y < FLOOR;
  };
  const x0 = 14;
  const z0 = 10;
  const w = 40 - 14 + 1;
  const mask = new Uint8Array(w * (40 - 10 + 1));
  for (let z = 10; z <= 40; z++) for (let x = 14; x <= 40; x++) mask[(z - z0) * w + (x - x0)] = 1;
  const lake: LakeView = { level: FLOOR - 0.18, min: [x0, z0], max: [40, 40], mask };

  it('underLake: the dip is under water, the shore and a cave under rock are not', () => {
    expect(underLake([lake], solid, 25, FLOOR - 2, 25)).toBe(true);
    expect(underLake([lake], solid, 25, FLOOR - 1, 25)).toBe(true);
    expect(underLake([lake], solid, 25, FLOOR, 25)).toBe(false);
    expect(underLake([lake], solid, 8, FLOOR, 25)).toBe(false);
    // A slab of rock over the cell: another cave under the lake, dry.
    const roofed = (x: number, y: number, z: number) => solid(x, y, z) || (x === 25 && z === 25 && y === FLOOR - 1);
    expect(underLake([lake], roofed, 25, FLOOR - 2, 25)).toBe(false);
  });

  const spawnsIn = (withLake: boolean): { all: number; wet: number } => {
    const env: MobEnv = { solid, light: () => 0, inCamp: () => false, depthOf: (y) => 300 - y };
    const sim = new MobSim(env, 4242);
    linkStrata(sim, { biomes: ['floodedGrottoes'], biomeAt: () => 'floodedGrottoes', features: withLake ? { lakes: [lake] } : {} }, () => false);
    const born: SimMob[] = [];
    sim.on((e) => {
      if (e.type === 'spawn') born.push(e.mob);
    });
    const c: MobContext = {
      time: 0,
      player: { x: 6.5, y: FLOOR, z: 25.5, vx: 0, vz: 0 },
      eye: { x: 6.5, y: FLOOR + 1.62, z: 25.5 },
      lantern: { x: 6.2, y: FLOOR + 1.2, z: 25.8, radius: 11, flame: 1, lit: true, raised: false },
      depth: 200,
      atCamp: false,
      active: true,
      airborne: false,
    };
    let wet = 0;
    const seen = new Set<number>();
    for (let t = 0; t < 240; t += 1 / 15) {
      c.time = t;
      sim.update(1 / 15, c);
      for (const m of born) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const loco = m.def.locomotion;
        const at = loco === 'walk' || loco === 'still' ? m.foot : loco === 'crawl' ? m.cell : m.position;
        if (underLake([lake], solid, Math.floor(at.x), Math.floor(at.y), Math.floor(at.z))) wet++;
      }
      // Clear the field now and then so the clock keeps sending packs.
      if (Math.floor(t * 15) % (15 * 40) === 0) sim.clear();
    }
    return { all: seen.size, wet };
  };

  it('the strata spawner never places one in the water (and would, without the lake)', () => {
    const dry = spawnsIn(false);
    const wet = spawnsIn(true);
    expect(dry.all, 'creatures spawned (no lake)').toBeGreaterThan(5);
    expect(dry.wet, 'in the dip with no lake known').toBeGreaterThan(0);
    expect(wet.all, 'creatures spawned (lake)').toBeGreaterThan(5);
    expect(wet.wet, 'under the lake').toBe(0);
  }, 60_000);
});
