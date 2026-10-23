import { describe, expect, it } from 'vitest';
import { BIOMES, STRATA } from '../../src/config/biomes';
import { ROSTERS } from '../../src/game/mobs/rosters';
import { MOB_BIOMES } from '../../src/game/mobs/types';
import { generateStratum } from '../../src/world/gen/strata/generateStratum';
import { MobSim, type MobEnv, type SimMob } from '../../src/game/mobs/MobSim';
import { linkStrata, underLake, type LakeView } from '../../src/game/mobs/strataLink';
import type { MobContext } from '../../src/game/mobs/types';
import { B } from '../../src/config/blocks';
import { WEAPONS } from '../../src/config/weapons';
import { SPECIES } from '../../src/game/mobs/species';
import { DropSystem } from '../../src/game/Drops';
import { Rng } from '../../src/core/rng';
import { findPoint, lootPoint } from '../../src/game/mobs/lootPoint';
import type { VoxelWorld } from '../../src/world/VoxelWorld';

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

// QA 21:29: the tutorial's "A creature!" step came while the explorer stood in the camp, where every
// cell 8-18 m out is the camp or its margin and every monster is put away while the explorer is home:
// no creature ever came. Now the Tick comes from the dark beyond the camp's edge and waits there.
describe("the tutorial's first fight, called from the camp", () => {
  const FLOOR = 10;
  const solid = (x: number, y: number, z: number): boolean => y < FLOOR || y >= 24 || x < 0 || x >= 96 || z < 0 || z >= 96;
  // The camp's region with the director's 4 m margin.
  const inCamp = (x: number, y: number, z: number): boolean => x >= 26 && x <= 54 && z >= 26 && z <= 54 && y >= FLOOR - 4 && y <= FLOOR + 10;
  const at = (x: number, z: number, home: boolean): MobContext => ({
    time: 0,
    player: { x, y: FLOOR, z, vx: 0, vz: 0 },
    eye: { x, y: FLOOR + 1.62, z },
    lantern: { x: x - 0.3, y: FLOOR + 1.2, z: z + 0.3, radius: 11, flame: 1, lit: true, raised: false },
    depth: 200,
    atCamp: home,
    active: true,
    airborne: false,
  });

  it('the Tick stands beyond the camp edge within the compass reach, waits outside (never put away), and fights once the explorer steps out', async () => {
    const { spawnFirstFight } = await import('../../src/game/mobs/spawner');
    const sim = new MobSim({ solid, light: () => 0, inCamp, depthOf: (y) => 300 - y }, 77);
    sim.spawning = false;
    const c = at(40.5, 40.5, true);
    sim.update(1 / 30, c);
    const m = spawnFirstFight(sim, c);
    expect(m, 'a tick from the camp').not.toBeNull();
    const tick = m!;
    expect(inCamp(tick.foot.x, tick.foot.y, tick.foot.z), 'outside the camp and its margin').toBe(false);
    expect(Math.hypot(tick.foot.x - 40.5, tick.foot.z - 40.5), 'within the compass reach (40 m)').toBeLessThan(36);
    expect(tick.tutorial).toBe(true);
    // 20 s with the explorer by the fire: it keeps out of the camp and is not put away.
    let inside = 0;
    for (let t = 0; t < 20; t += 1 / 30) {
      sim.update(1 / 30, c);
      if (inCamp(tick.position.x, tick.position.y - 0.2, tick.position.z)) inside++;
    }
    expect(inside, 'frames inside the camp').toBe(0);
    expect(sim.mobs.includes(tick) && !tick.dying, 'still waiting').toBe(true);
    // The explorer steps out toward it: it comes and strikes (told first).
    const out = { x: tick.foot.x + (40.5 - tick.foot.x) * 0.2, z: tick.foot.z + (40.5 - tick.foot.z) * 0.2 };
    const c2 = at(inCamp(out.x, FLOOR, out.z) ? tick.foot.x + 2 : out.x, inCamp(out.x, FLOOR, out.z) ? tick.foot.z + 2 : out.z, false);
    const seen: string[] = [];
    sim.on((e) => {
      if ((e.type === 'telegraph' || e.type === 'attack') && e.mob === tick) seen.push(e.type);
    });
    for (let t = 0; t < 15 && !seen.includes('attack'); t += 1 / 30) sim.update(1 / 30, c2);
    expect(seen[0], 'told first').toBe('telegraph');
    expect(seen, 'it fights').toContain('attack');
  }, 30_000);
});

describe('a blow never knocks a monster into the camp (QA 22:25: the Tick faded at the edge)', () => {
  const FLOOR = 10;
  const solid = (x: number, y: number, z: number): boolean => y < FLOOR || y >= 24 || x < 0 || x >= 96 || z < 0 || z >= 96;
  const inCamp = (x: number, y: number, z: number): boolean => x >= 26 && x <= 54 && z >= 26 && z <= 54 && y >= FLOOR - 4 && y <= FLOOR + 10;
  it('struck from the field side at the camp edge, a monster stops at the edge, alive', () => {
    const sim = new MobSim({ solid, light: () => 0, inCamp, depthOf: (y) => 300 - y }, 5);
    sim.spawning = false;
    const c: MobContext = {
      time: 0,
      player: { x: 60.5, y: FLOOR, z: 40.5, vx: 0, vz: 0 },
      eye: { x: 60.5, y: FLOOR + 1.62, z: 40.5 },
      lantern: { x: 60.2, y: FLOOR + 1.2, z: 40.8, radius: 11, flame: 1, lit: true, raised: false },
      depth: 200,
      atCamp: false,
      active: true,
      airborne: false,
    };
    const m = sim.spawn('gritBoar', 54.6, FLOOR, 40.5, { asleep: false })!;
    expect(m).toBeTruthy();
    // (Its brain held: only the blow moves it.)
    sim.brains = false;
    sim.update(1 / 30, c);
    // A great axe's blow from the explorer's side (east), toward the camp (west).
    sim.hit(m, 1, { weapon: 'greatAxe', from: { x: 60.5, y: FLOOR + 1.6, z: 40.5 }, knock: 2 });
    for (let t = 0; t < 1; t += 1 / 30) sim.update(1 / 30, c);
    expect(inCamp(m.foot.x, m.foot.y + 0.5, m.foot.z), 'not knocked in').toBe(false);
    expect(sim.mobs.includes(m) && !m.dying, 'not put away').toBe(true);
  });
});

describe("a kill's loot reaches the bag (the lead's gate, 03:11)", () => {
  // The Silver Sword reaches 2.8 m from the eye to a creature's body (game/fp/Combat distanceTo), so a
  // Grit Boar falls with its centre ~3.1 m off; the bag pulls a drop in only within 2.6 m of the chest
  // (game/Drops, PLAYER.pickupRadius). From where the boar fell most of its loot stayed on the floor;
  // from lootPoint every drop flies to the bag. The real DropSystem, on a flat floor (y < 10 rock).
  const rock = (_x: number, y: number) => y < 10;
  const world = { get: (x: number, y: number) => (rock(x, y) ? B.SLATE : B.AIR) } as unknown as VoxelWorld;
  const solid = (x: number, y: number, z: number) => rock(x, y) || (wall ? wall(x, y, z) : false);
  let wall: ((x: number, y: number, z: number) => boolean) | null = null;
  const player = { x: 0.5, y: 10, z: 0.5 };
  const collected = (start: { x: number; y: number; z: number }, seed: number): boolean => {
    const drops = new DropSystem(world, {} as never, {} as never);
    drops.spawn('hide', 1, start.x, start.y, start.z, new Rng(seed));
    let got = 0;
    for (let t = 0; t < 4; t += 1 / 30) drops.update(1 / 30, t, player.x, player.y, player.z, () => true, (_i, n) => ((got += n), n), () => undefined);
    return got > 0;
  };

  it("a Grit Boar felled at the sword's reach: its hide flies to the bag", () => {
    const r = SPECIES.gritBoar.radius;
    const lift = SPECIES.gritBoar.lift ?? 0.44;
    const h = Math.sqrt((WEAPONS.sword.reach + r) ** 2 - (1.62 - lift) ** 2);
    expect(h, 'struck dead this far off').toBeGreaterThan(2.9);
    const fell = { x: player.x + h, y: player.y + lift, z: player.z };
    let before = 0;
    let after = 0;
    const N = 40;
    for (let s = 1; s <= N; s++) {
      if (collected({ x: fell.x, y: fell.y + 0.3, z: fell.z }, s)) before++;
      if (collected(lootPoint(fell, player, solid), s)) after++;
    }
    console.log(`[mobs] a Grit Boar felled ${h.toFixed(2)} m off: its hide reached the bag ${before}/${N} from where it fell, ${after}/${N} from lootPoint`);
    expect(before, 'from where it fell (the old start)').toBeLessThan(N * 0.6);
    expect(after, 'from lootPoint').toBe(N);
    // A close kill keeps its loot where it fell; so does a ranged one (a sling's, a crossbow's).
    expect(lootPoint({ x: 1.2, y: 10.5, z: 0.5 }, player, solid)).toEqual({ x: 1.2, y: 10.8, z: 0.5 });
    expect(lootPoint({ x: 12.5, y: 10.5, z: 0.5 }, player, solid)).toEqual({ x: 12.5, y: 10.8, z: 0.5 });
  });

  it('never starts a drop in rock: a pillar between, it starts on the open side nearest the explorer', () => {
    // A pillar at x = 2 between the explorer (x 0.5) and a boar fallen at x 3.6.
    wall = (x) => x === 2;
    const o = lootPoint({ x: 3.6, y: 10.5, z: 0.5 }, player, solid);
    wall = null;
    expect(Math.floor(o.x)).not.toBe(2);
    expect(o.x).toBeGreaterThan(2.9);
    expect(o.x).toBeLessThanOrEqual(3.6);
  });
});

describe("a mined find's drop reaches the bag (the lead, after the gate)", () => {
  // The pick reaches 3.5 m from the hand to a block's centre (game/fp/constants REACH); the bag pulls a
  // drop in within 2.6 m of the chest (game/Drops). The real DropSystem; the explorer never moves.
  const player = { x: 0.1, y: 10, z: 0.5 };
  const worldWith = (rock: (x: number, y: number, z: number) => boolean) => ({
    world: { get: (x: number, y: number, z: number) => (rock(x, y, z) ? B.SLATE : B.AIR) } as unknown as VoxelWorld,
    solid: rock,
  });
  const reached = (w: VoxelWorld, start: { x: number; y: number; z: number }, seed: number): boolean => {
    const drops = new DropSystem(w, {} as never, {} as never);
    // (A gem: its model needs no tile atlas; the flight is the same for every item.)
    drops.spawn('glimmerShard', 2, start.x, start.y, start.z, new Rng(seed));
    let got = 0;
    for (let t = 0; t < 4; t += 1 / 30) drops.update(1 / 30, t, player.x, player.y, player.z, () => true, (_i, n) => ((got += n), n), () => undefined);
    return got > 0;
  };
  const N = 40;
  const runs = (w: VoxelWorld, start: { x: number; y: number; z: number }) => {
    let n = 0;
    for (let s = 1; s <= N; s++) if (reached(w, start, s)) n++;
    return n;
  };

  it('a vein broken 3.4 m from the chest: its find flies to the bag, 40 times in 40', () => {
    // A wall of rock from x = 3, the floor below y = 10; the vein at the wall's foot (cell 3,10,0), broken.
    const { world, solid } = worldWith((x, y, z) => y < 10 || (x >= 3 && !(x === 3 && y === 10 && z === 0)));
    const vein = { x: 3.5, y: 10.5, z: 0.5 };
    const d = Math.hypot(vein.x - player.x, vein.y - (player.y + 1), vein.z - player.z);
    expect(d, 'from the chest').toBeGreaterThan(3.4);
    expect(d).toBeLessThan(3.5);
    const before = runs(world, vein);
    const after = runs(world, findPoint(vein, player, solid));
    console.log(`[mobs] a vein broken ${d.toFixed(2)} m from the chest: its find reached the bag ${before}/${N} from the block, ${after}/${N} from findPoint`);
    expect(before, 'from the block (as it was)').toBeLessThan(N);
    expect(after, 'from findPoint').toBe(N);
  });

  it('a floor vein 2.8 m off (its pit left open) too; one 1.5 m off still starts at the block; without a world, as before', () => {
    const { world, solid } = worldWith((x, y, z) => y < 10 && !(x === 2 && y === 9 && z === 0));
    const vein = { x: 2.5, y: 9.5, z: 0.5 };
    expect(Math.hypot(vein.x - player.x, vein.y - (player.y + 1), vein.z - player.z)).toBeGreaterThan(2.8);
    expect(runs(world, findPoint(vein, player, solid)), 'from findPoint').toBe(N);
    // Close mining looks as it always has: the drop starts at the block's centre.
    const near = { x: 1.5, y: 10.5, z: 0.5 };
    expect(Math.hypot(near.x - player.x, near.y - (player.y + 1), near.z - player.z)).toBeLessThan(1.55);
    expect(findPoint(near, player, solid)).toEqual(near);
    expect(findPoint(vein, player, null)).toEqual(vein);
  });
});
