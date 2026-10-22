import { describe, expect, it } from 'vitest';
import { MobSim, type MobEnv, type MobSimEvent, type SimMob } from '../../src/game/mobs/MobSim';
import { MOBS_RULES } from '../../src/game/mobs/config';
import { BESTIARY_ORDER, ROSTERS, bestiary } from '../../src/game/mobs/rosters';
import { ALL_KINDS, BEING_KINDS, GUARDIAN_DEFS, GUARDIAN_KINDS, MONSTER_KINDS, SPECIES } from '../../src/game/mobs/species';
import { maybeElite, pickEntry, spawnFirstFight, strataBudget, type Lair } from '../../src/game/mobs/spawner';
import { AFFIXES, ELITE_CHANCE, canTake, eliteName, rollAffixes } from '../../src/game/mobs/elites';
import { CompanionBrain, LEVELS, levelFor, lightBoost, nextLevelXp, senseRange, zapDamage } from '../../src/game/mobs/companion';
import { mobModel } from '../../src/render/mobs/models';
import { PLANNED_KINDS } from '../../src/render/mobs/bodyPlan';
import { MAX_BONES } from '../../src/render/mobs/rig';
import { Rng } from '../../src/core/rng';
import { ITEMS } from '../../src/config/items';
import { isSfxName } from '../../src/audio/sfx';
import { BestiaryLog } from '../../src/game/mobs/bestiary';
import { guardianState } from '../../src/game/mobs/guardian';
import { MOB_BIOMES, type GuardianKind, type MobBiome, type MobContext, type MobKind } from '../../src/game/mobs/types';
import { hasText } from '../../src/i18n';

// Round 3 (MOBS): the twelve biomes' rosters, the eight archetypes' brains (every blow telegraphed,
// every area blow marked on the ground), the guardians' fights (phases, the leash, the shard), the
// Heart's three phases, the biome spawner and the bestiary. A synthetic cavern: an 80 x 14 x 80 m
// hall, floor at y = 10, ceiling at y = 24, a pillar in the middle, a low wall.

const FLOOR = 10;
const CEIL = 24;
const solid = (x: number, y: number, z: number): boolean => {
  if (y < FLOOR || y >= CEIL || x < 0 || x >= 80 || z < 0 || z >= 80) return true;
  if (x >= 38 && x <= 41 && z >= 38 && z <= 41) return true;
  return false;
};

function env(opts: { camp?: [number, number, number, number]; biome?: MobBiome; safe?: (x: number, z: number) => boolean } = {}): MobEnv {
  const camp = opts.camp ?? [-100, -100, -90, -90];
  return {
    solid,
    light: () => 0,
    inCamp: (x, _y, z) => x >= camp[0] && x <= camp[2] && z >= camp[1] && z <= camp[3],
    depthOf: (y) => 300 - y,
    biomeAt: opts.biome ? () => opts.biome as MobBiome : undefined,
    safe: opts.safe ? (x, _y, z) => opts.safe!(x, z) : undefined,
  };
}

function ctx(p: { x: number; z: number }, extra: Partial<MobContext> = {}, l: Partial<MobContext['lantern']> = {}): MobContext {
  return {
    time: 0,
    player: { x: p.x, y: FLOOR, z: p.z, vx: 0, vz: 0 },
    eye: { x: p.x, y: FLOOR + 1.62, z: p.z },
    lantern: { x: p.x - 0.3, y: FLOOR + 1.2, z: p.z + 0.3, radius: 11, flame: 1, lit: true, raised: false, ...l },
    depth: 200,
    atCamp: false,
    active: true,
    airborne: false,
    ...extra,
  };
}

function run(sim: MobSim, c: MobContext, seconds: number, dt = 1 / 30, each?: (t: number) => void): void {
  for (let t = 0; t < seconds; t += dt) {
    sim.update(dt, c);
    each?.(t);
  }
}

function record(sim: MobSim): MobSimEvent[] {
  const log: MobSimEvent[] = [];
  sim.on((e) => log.push(e));
  return log;
}

describe('rosters (BRIEF §0.5)', () => {
  it('12 biomes with at least 3 monsters, 1 being and a guardian each, and the Heart', () => {
    const biomes = MOB_BIOMES.filter((b) => b !== 'heart');
    expect(biomes.length).toBe(12);
    for (const b of biomes) {
      const r = ROSTERS[b];
      const own = r.monsters.filter((e) => SPECIES[e.kind].family === 'monster');
      expect(own.length, b).toBeGreaterThanOrEqual(3);
      expect(r.beings.length, b).toBeGreaterThanOrEqual(1);
      expect(SPECIES[r.guardian].rank, b).toBe('guardian');
      // Each biome's home kinds are its own (a kind's home biome has it in its roster).
      for (const e of [...r.monsters, ...r.beings]) expect(SPECIES[e.kind], e.kind).toBeDefined();
    }
    expect(ROSTERS.heart.guardian).toBe('heartOfDark');
    expect(SPECIES.heartOfDark.rank).toBe('boss');
  });

  it('at least 36 distinct monsters, 12 beings and 12 guardians; the first game\'s 12 kinds are in the rosters', () => {
    const monsters = MONSTER_KINDS.filter((k) => SPECIES[k].brain !== 'vista');
    expect(monsters.length).toBeGreaterThanOrEqual(35);
    expect(MONSTER_KINDS.length).toBeGreaterThanOrEqual(36);
    expect(BEING_KINDS.length).toBeGreaterThanOrEqual(12);
    expect(GUARDIAN_KINDS.filter((k) => SPECIES[k].rank === 'guardian').length).toBe(12);
    const inRoster = new Set<MobKind>();
    for (const b of MOB_BIOMES) for (const e of [...ROSTERS[b].monsters, ...ROSTERS[b].beings]) inRoster.add(e.kind);
    for (const k of ['crawler', 'gnasher', 'wisp', 'stalker', 'sentinel', 'moth', 'lampling', 'glimmerkin', 'shellback', 'jelly', 'burrower'] as MobKind[]) expect(inRoster.has(k), k).toBe(true);
    // The Deep Worm is the abyss' far glimpse (an event, not a roster pick).
    expect(SPECIES.worm.biome).toBe('obsidianAbyss');
    // Every roster monster belongs to one of the eight archetypes.
    const arch = new Set(MONSTER_KINDS.map((k) => SPECIES[k].archetype));
    for (const a of ['swarmer', 'charger', 'spitter', 'ambusher', 'flyer', 'burrower', 'brute', 'exploder']) expect(arch.has(a as never), a).toBe(true);
    // Sizes from tiny swarmers to huge brutes.
    const sizes = new Set(ALL_KINDS.map((k) => SPECIES[k].size));
    for (const s of ['tiny', 'small', 'medium', 'large', 'huge']) expect(sizes.has(s as never), s).toBe(true);
  });

  it('every creature has its text (name, lore, tip; a meeting line; a title for each guardian) and a bestiary page', () => {
    expect(BESTIARY_ORDER.length).toBe(ALL_KINDS.length);
    for (const k of ALL_KINDS) {
      const e = bestiary(k);
      expect(hasText(e.nameKey), e.nameKey).toBe(true);
      expect(hasText(e.loreKey), e.loreKey).toBe(true);
      expect(hasText(e.tipKey), e.tipKey).toBe(true);
      if (SPECIES[k].rank === 'minion') expect(hasText(`mob.meet.${k}`) || k === 'moth', `mob.meet.${k}`).toBe(true);
      else expect(hasText(`mob.title.${k}`), `mob.title.${k}`).toBe(true);
    }
    for (const p of ['slam', 'ring', 'volley', 'charge', 'summon', 'burrow', 'dive', 'line', 'snuff']) expect(hasText(`mob.pattern.${p}`)).toBe(true);
  });

  it('guardians: 2-3 patterns a phase, 2 phases (the Heart 3), a brood from their biome', () => {
    for (const k of GUARDIAN_KINDS) {
      const d = GUARDIAN_DEFS[k];
      expect(d.patterns.length, k).toBe(k === 'heartOfDark' ? 3 : 2);
      for (const ph of d.patterns) expect(ph.length, k).toBeGreaterThanOrEqual(2);
      expect(d.brood.length, k).toBeGreaterThan(0);
      for (const b of d.brood) expect(SPECIES[b].family, b).toBe('monster');
    }
  });
});

describe('the archetypes: every blow is telegraphed, the area blows are marked', () => {
  const hostile = MONSTER_KINDS.filter((k) => !['vista', 'drain', 'lurk', 'sentinel', 'cling', 'mimic'].includes(SPECIES[k].brain));
  it.each(hostile)('%s winds up before it strikes, and lands on a still explorer', (kind) => {
    const sim = new MobSim(env(), 7);
    sim.spawning = false;
    const log = record(sim);
    const c = ctx({ x: 20, z: 20 });
    const d = SPECIES[kind];
    const dist = d.brain === 'spit' ? 8 : d.brain === 'charge' ? 7 : d.brain === 'dig' ? 9 : d.brain === 'drop' ? 0 : 3;
    const y = d.locomotion === 'fly' ? FLOOR + 2.5 : d.brain === 'drop' ? CEIL - 1 : FLOOR;
    const m = sim.spawn(kind, 20.5, y, 20.5 + dist, { ceiling: d.brain === 'drop' })!;
    expect(m, kind).not.toBeNull();
    let strikes = 0;
    let telegraphs = 0;
    let marked = false;
    let firstStrike = -1;
    let firstTele = -1;
    run(sim, c, 14, 1 / 30, (t) => {
      if (sim.markers.some((k) => k.owner === m.id)) marked = true;
      void t;
    });
    log.forEach((e, i) => {
      if (e.type === 'telegraph' && e.mob === m) {
        telegraphs++;
        if (firstTele < 0) firstTele = i;
      }
      if (e.type === 'attack' && e.mob === m && e.landed) {
        strikes++;
        if (firstStrike < 0) firstStrike = i;
      }
    });
    expect(telegraphs, `${kind} telegraphs`).toBeGreaterThan(0);
    expect(strikes, `${kind} lands a blow`).toBeGreaterThan(0);
    expect(firstTele, `${kind}: the wind-up comes first`).toBeLessThan(firstStrike);
    if (['charge', 'drop', 'dive', 'dig', 'slam', 'fuse'].includes(d.brain)) expect(marked, `${kind} marks its blow on the ground`).toBe(true);
  });

  it('a dash (i-frames) lets blows and spits pass', () => {
    const sim = new MobSim(env(), 3);
    sim.spawning = false;
    const log = record(sim);
    const c = ctx({ x: 20, z: 20 }, { invulnerable: true });
    sim.spawn('capSpitter', 20.5, FLOOR, 28.5);
    sim.spawn('amberTick', 20.5, FLOOR, 22.5);
    run(sim, c, 10);
    expect(log.some((e) => e.type === 'attack' && e.dodged)).toBe(true);
    expect(log.some((e) => e.type === 'attack' && e.landed && e.damage > 0)).toBe(false);
  });

  it('a spit is slow and visible: a strafing explorer is missed more than a still one', () => {
    const hits = (strafe: boolean) => {
      const sim = new MobSim(env(), 11);
      sim.spawning = false;
      const log = record(sim);
      const c = ctx({ x: 20, z: 20 });
      sim.spawn('spitNewt', 20.5, FLOOR, 30.5);
      let dir = 1;
      run(sim, c, 20, 1 / 30, (t) => {
        if (!strafe) return;
        if (Math.floor(t / 0.8) % 2 === 0) dir = 1;
        else dir = -1;
        c.player.x += dir * 5 / 30;
        c.player.vx = dir * 5;
        c.eye.x = c.player.x;
        c.lantern.x = c.player.x - 0.3;
      });
      return log.filter((e) => e.type === 'attack' && e.landed && e.damage > 0).length;
    };
    const still = hits(false);
    const moving = hits(true);
    expect(still).toBeGreaterThan(2);
    expect(moving).toBeLessThan(still);
  });

  it('a charger that rushes into rock is stunned, and its guard is down', () => {
    const sim = new MobSim(env(), 5);
    sim.spawning = false;
    // The explorer stands with the pillar behind it (x 38..41): the charge runs into it after a dodge.
    const c = ctx({ x: 36, z: 39.5 });
    const m = sim.spawn('thornback', 28.5, FLOOR, 39.5)!;
    let stunned = false;
    run(sim, c, 12, 1 / 30, () => {
      if (m.state === 'attack' && c.player.z < 41) {
        // Sidestep the lane.
        c.player.z = 43;
        c.eye.z = 43;
      }
      if (m.state === 'stunned') stunned = true;
      if (stunned) return;
      if (m.state !== 'attack') {
        c.player.z = 39.5;
        c.eye.z = 39.5;
      }
    });
    expect(stunned).toBe(true);
    // Stunned it takes more.
    const s2 = new MobSim(env(), 5);
    const a = s2.spawn('thornback', 10.5, FLOOR, 10.5)!;
    const b = s2.spawn('thornback', 14.5, FLOOR, 10.5)!;
    b.setState('stunned');
    b.timer = 2;
    s2.ctx = ctx({ x: 12, z: 12 });
    const ra = s2.hit(a, 4);
    const rb = s2.hit(b, 4);
    expect(rb.damage!).toBeGreaterThan(ra.damage!);
    expect(rb.weak).toBe(true);
  });

  it('an exploder struck before its fuse only pops (no harm to the explorer, it hurts the monsters round it); a lit one bursts', () => {
    const sim = new MobSim(env(), 9);
    sim.spawning = false;
    const log = record(sim);
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const boom = sim.spawn('fuseBeetle', 20.5, FLOOR, 27.5)!;
    const near = sim.spawn('rustMite', 21.5, FLOOR, 27.5)!;
    const hp0 = near.hp!;
    sim.hit(boom, 99);
    expect(log.some((e) => e.type === 'attack' && e.landed && e.damage > 0)).toBe(false);
    expect(near.hp! < hp0 || near.dying).toBe(true);
    // A lit one next to the explorer.
    const s2 = new MobSim(env(), 9);
    s2.spawning = false;
    const log2 = record(s2);
    s2.spawn('sporeling', 20.5, FLOOR, 22.5);
    run(s2, c, 6);
    expect(log2.some((e) => e.type === 'attack' && e.landed && e.damage > 0)).toBe(true);
    expect(log2.some((e) => e.type === 'burst')).toBe(true);
  });

  it('a burrower is out of reach underground (a ripple shows it), then bursts up under a marked circle', () => {
    const sim = new MobSim(env(), 13);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    const m = sim.spawn('tunnelGrub', 20.5, FLOOR, 32.5)!;
    expect(m.mode).toBe('under');
    expect(m.tappable).toBe(false);
    sim.ctx = c;
    expect(sim.hit(m, 10).hit).toBe(false);
    let ripple = false;
    let disc = false;
    let surfaced = false;
    run(sim, c, 10, 1 / 30, () => {
      for (const k of sim.markers) if (k.owner === m.id) (k.kind === 'ripple' ? (ripple = true) : k.kind === 'disc' ? (disc = true) : 0);
      if (m.mode === '' && m.tappable) surfaced = true;
    });
    expect(ripple).toBe(true);
    expect(disc).toBe(true);
    expect(surfaced).toBe(true);
  });

  it('a brute shrugs blows off (plates) until it has slammed; then its guard is open', () => {
    const sim = new MobSim(env(), 21);
    sim.spawning = false;
    sim.ctx = ctx({ x: 20, z: 20 });
    const m = sim.spawn('geodeGolem', 20.5, FLOOR, 23.5)!;
    const shut = sim.hit(m, 10);
    expect(shut.damage!).toBeLessThan(5);
    m.setState('recoil');
    m.timer = 2;
    const open = sim.hit(m, 10);
    expect(open.damage!).toBeGreaterThanOrEqual(10);
    expect(open.weak).toBe(true);
  });

  it('a blow knocks a light creature back, a heavy one barely', () => {
    const sim = new MobSim(env(), 4);
    sim.ctx = ctx({ x: 20, z: 20 });
    const tick = sim.spawn('amberTick', 20.5, FLOOR, 22.5)!;
    const brute = sim.spawn('clatterclaw', 24.5, FLOOR, 22.5)!;
    sim.hit(tick, 0.5);
    sim.hit(brute, 0.5);
    expect(Math.hypot(tick.knock.x, tick.knock.z)).toBeGreaterThan(Math.hypot(brute.knock.x, brute.knock.z) * 3);
  });
});

describe('guardians and the Heart', () => {
  function lairOf(kind: GuardianKind, x = 40, z = 20, r = 18): Lair {
    return { id: `l-${kind}`, biome: SPECIES[kind].biome, guardian: kind, x, y: FLOOR, z, radius: r, sx: x, sy: FLOOR, sz: z };
  }

  it('sleeps in its lair until the explorer walks in; then a loop of telegraphed patterns', () => {
    const sim = new MobSim(env(), 31);
    sim.spawning = false;
    const log = record(sim);
    const lair = lairOf('amberMatriarch', 40, 20);
    sim.lairs = [lair];
    const c = ctx({ x: 10, z: 70 });
    // Far away: nothing.
    run(sim, c, 3);
    expect(sim.mobs.some((m) => m.guardian)).toBe(false);
    // Near the lair: it is spawned asleep.
    c.player.x = 40;
    c.player.z = 48;
    c.eye.x = 40;
    c.eye.z = 48;
    run(sim, c, 2);
    const g = sim.mobs.find((m) => m.guardian)!;
    expect(g).toBeDefined();
    expect(g.state).toBe('sleep');
    // In the arena: it wakes and fights.
    c.player.z = 30;
    c.eye.z = 30;
    run(sim, c, 25);
    expect(log.some((e) => e.type === 'guardian' && e.phase === 'awake')).toBe(true);
    const patterns = new Set<string>();
    const tele = log.filter((e) => e.type === 'telegraph' && e.mob === g).length;
    for (const e of log) if (e.type === 'telegraph' && e.mob === g && g.pattern) patterns.add(g.pattern);
    expect(tele).toBeGreaterThanOrEqual(3);
    expect(log.some((e) => e.type === 'attack' && e.mob === g)).toBe(true);
    const st = guardianState(g);
    expect(st.name).toBe('The Amber Matriarch');
    expect(st.phases).toBe(2);
  });

  it('its open guard (after each attack) takes 1.6x; a phase turns at half its health', () => {
    const sim = new MobSim(env(), 32);
    sim.spawning = false;
    const log = record(sim);
    sim.lairs = [lairOf('quartzTitan')];
    const c = ctx({ x: 40, z: 30 });
    run(sim, c, 2);
    const g = sim.mobs.find((m) => m.guardian)!;
    sim.ctx = c;
    const shut = sim.hit(g, 10);
    expect(shut.armoured === false || shut.damage! < 10).toBe(true);
    g.setState('recoil');
    g.timer = 2;
    const open = sim.hit(g, 10);
    expect(open.damage).toBeCloseTo(16, 5);
    // Down to half: phase 2.
    g.setState('recoil');
    g.timer = 2;
    sim.hit(g, (g.hp! - g.maxHp! * 0.45) / 1.6);
    expect(g.phase).toBe(2);
    expect(log.some((e) => e.type === 'guardian' && e.phase === 'phase')).toBe(true);
  });

  it('flee its arena and it heals and sleeps again; beaten, it never returns and drops its shard', () => {
    const sim = new MobSim(env(), 33);
    sim.spawning = false;
    const log = record(sim);
    const lair = lairOf('mycelord', 40, 20, 14);
    sim.lairs = [lair];
    const c = ctx({ x: 40, z: 28 });
    run(sim, c, 4);
    const g = sim.mobs.find((m) => m.guardian)!;
    sim.ctx = c;
    g.setState('recoil');
    sim.hit(g, 20);
    expect(g.hp!).toBeLessThan(g.maxHp!);
    // Out of the arena for a while.
    c.player.z = 60;
    c.eye.z = 60;
    run(sim, c, MOBS_RULES.leashSeconds + 2);
    expect(g.hp).toBe(g.maxHp);
    expect(g.state).toBe('sleep');
    expect(log.some((e) => e.type === 'guardian' && e.phase === 'reset')).toBe(true);
    // Back, and beaten.
    c.player.z = 28;
    c.eye.z = 28;
    run(sim, c, 3);
    g.setState('recoil');
    sim.hit(g, 9999);
    expect(g.dying).toBe(true);
    expect(sim.guardiansDone.has('mushroomForest')).toBe(true);
    expect(log.some((e) => e.type === 'die' && e.mob === g)).toBe(true);
    run(sim, c, 6);
    expect(sim.mobs.some((m) => m.guardian && !m.dying)).toBe(false);
  });

  it('the Heart has three phases, quicker each time', () => {
    const sim = new MobSim(env(), 34);
    sim.spawning = false;
    sim.lairs = [lairOf('heartOfDark', 40, 20, 24)];
    const c = ctx({ x: 40, z: 30 });
    run(sim, c, 3);
    const h = sim.mobs.find((m) => m.kind === 'heartOfDark')!;
    expect(h).toBeDefined();
    sim.ctx = c;
    const max = h.maxHp!;
    h.setState('recoil');
    sim.hit(h, (max * 0.36) / 1.6);
    expect(h.phase).toBe(2);
    h.setState('recoil');
    sim.hit(h, (max * 0.34) / 1.6);
    expect(h.phase).toBe(3);
    expect(guardianState(h).phases).toBe(3);
    // Phase 3 fights on.
    const log = record(sim);
    run(sim, c, 20);
    expect(log.filter((e) => e.type === 'telegraph' && e.mob === h).length).toBeGreaterThanOrEqual(2);
  });

  it("the Dark Heart's chamber stays still until the 12 shards relight it (no ending before the shards)", () => {
    const sim = new MobSim(env(), 41);
    sim.spawning = false;
    let lit = false;
    sim.lairs = [{ ...lairOf('heartOfDark', 40, 22, 24), sealed: () => !lit }];
    const c = ctx({ x: 40, z: 30 });
    run(sim, c, 3);
    expect(sim.mobs.some((m) => m.kind === 'heartOfDark')).toBe(false);
    lit = true;
    run(sim, c, 3);
    const h = sim.mobs.find((m) => m.kind === 'heartOfDark');
    expect(h).toBeDefined();
    expect(h!.state === 'wake' || h!.state === 'stalk' || h!.state === 'windup').toBe(true);
  });

  it.each(GUARDIAN_KINDS)('%s fights: it telegraphs and lands blows on a still explorer in its arena', (kind) => {
    const sim = new MobSim(env(), 40);
    sim.spawning = false;
    const log = record(sim);
    sim.lairs = [lairOf(kind, 40, 22, 20)];
    const c = ctx({ x: 40, z: 30 });
    run(sim, c, 40);
    const g = sim.mobs.find((m) => m.kind === kind);
    expect(g, kind).toBeDefined();
    expect(log.filter((e) => e.type === 'telegraph' && e.mob === g).length, `${kind} telegraphs`).toBeGreaterThanOrEqual(3);
    const landed = log.filter((e) => e.type === 'attack' && e.landed && e.damage > 0).length;
    expect(landed, `${kind} lands blows`).toBeGreaterThan(0);
  });
});

describe('the biome spawner', () => {
  it('spawns from the biome\'s roster, never in the camp or at an outpost, more with depth, night and a dead flame', () => {
    expect(strataBudget(1)).toBeLessThan(strataBudget(6));
    expect(strataBudget(3, 1, 1)).toBeGreaterThan(strataBudget(3));
    for (const b of ['amberHollows', 'frostCaverns', 'sunkenCity'] as MobBiome[]) {
      // The camp with its 4 m margin, as MobDirector's env gives it.
      const sim = new MobSim(env({ biome: b, camp: [-4, -4, 16, 16], safe: (x, z) => x > 60 && z > 60 }), 50);
      const c = ctx({ x: 30, z: 30 }, { stratum: ROSTERS[b].stratum, biome: b });
      const seen = new Set<MobKind>();
      let cleared = 0;
      run(sim, c, 120, 1 / 20, (t) => {
        // The explorer clears them away now and then, so the spawner keeps drawing from the roster.
        if (t - cleared > 15) {
          cleared = t;
          for (const m of sim.mobs) if (m.hostile) sim.remove(m);
        }
        for (const m of sim.mobs) {
          if (m.dying) continue;
          seen.add(m.kind);
          if (m.hostile) {
            expect(m.position.x > 12 + 4 || m.position.z > 12 + 4, `not in the camp: ${b} ${m.kind} at ${m.position.x.toFixed(1)},${m.position.z.toFixed(1)}`).toBe(true);
            expect(!(m.position.x > 60 && m.position.z > 60), 'not at the outpost').toBe(true);
          }
        }
      });
      const roster = new Set([...ROSTERS[b].monsters, ...ROSTERS[b].beings].map((e) => e.kind));
      for (const k of seen) expect(roster.has(k) || k === 'moth', `${k} belongs to ${b}`).toBe(true);
      expect([...seen].filter((k) => SPECIES[k].family === 'monster').length, `${b}: several of its monsters`).toBeGreaterThanOrEqual(2);
    }
  });

  it('a quiet stretch in the deep brings an encounter within 20-40 s', () => {
    const sim = new MobSim(env({ biome: 'magmaVeins' }), 51);
    const c = ctx({ x: 30, z: 30 }, { stratum: 6, biome: 'magmaVeins' });
    const engaged: number[] = [];
    let last = 0;
    run(sim, c, 160, 1 / 20, (t) => {
      // The explorer keeps clearing them away (a monster in range = an encounter).
      const near = sim.mobs.filter((m) => m.hostile && !m.dying && m.position.distanceTo({ x: c.player.x, y: c.player.y, z: c.player.z } as never) < 18);
      if (near.length && t - last > 5) {
        engaged.push(t);
        last = t;
      }
      for (const m of near) if (m.state !== 'windup') sim.remove(m);
    });
    expect(engaged.length).toBeGreaterThanOrEqual(4);
    for (let i = 1; i < engaged.length; i++) expect(engaged[i] - engaged[i - 1]).toBeLessThanOrEqual(MOBS_RULES.encounterMax + 8);
  });

  it('pickEntry follows the weights and skips a kind at its cap', () => {
    const entries = ROSTERS.crystalGeode.monsters;
    const counts = new Map<string, number>();
    for (let i = 0; i < 1000; i++) {
      const e = pickEntry(entries, i / 1000, () => 0)!;
      counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
    }
    expect(counts.get('shardling')!).toBeGreaterThan(counts.get('geodeGolem')!);
    const capped = pickEntry(entries, 0.01, (k) => (k === 'shardling' ? 99 : 0))!;
    expect(capped.kind).not.toBe('shardling');
  });

  it('nests breed packs near the explorer until enough of their brood fell', () => {
    const sim = new MobSim(env({ biome: 'haldenMines' }), 52);
    sim.nests = [{ id: 1, biome: 'haldenMines', x: 30, y: FLOOR, z: 44, radius: 3, kind: 'rustMite', next: 0, kills: 0 }];
    const c = ctx({ x: 30, z: 30 }, { stratum: 3, biome: 'haldenMines' });
    const log = record(sim);
    // It stirs first (told: a rumble, chittering, dust), then its brood comes out.
    run(sim, c, 2 + MOBS_RULES.nestStir + 0.2);
    const stir = log.findIndex((e) => e.type === 'sfx' && e.name === 'mob.rumble');
    const out = log.findIndex((e) => e.type === 'spawn' && e.mob.nest === 1);
    expect(stir).toBeGreaterThanOrEqual(0);
    expect(out).toBeGreaterThan(stir);
    const brood = sim.mobs.filter((m) => m.nest === 1);
    expect(brood.length).toBeGreaterThanOrEqual(3);
    sim.ctx = c;
    sim.nests[0].kills = MOBS_RULES.nestKills;
    for (const m of brood) sim.kill(m);
    run(sim, c, MOBS_RULES.nestGap + 2);
    expect(sim.mobs.filter((m) => m.nest === 1 && !m.dying).length).toBe(0);
  });
});

describe('the bestiary', () => {
  it('a page is found on meeting, completed by a scan or a defeat, and saved', () => {
    const log = new BestiaryLog();
    expect(log.see('icefang')).toBe('new');
    expect(log.see('icefang')).toBeNull();
    expect(log.complete('icefang')).toBe(false);
    expect(log.scan('icefang')).toBe('complete');
    expect(log.defeat('frostBat')).toBe('complete');
    expect(log.found).toBe(2);
    expect(log.total).toBe(ALL_KINDS.length);
    const save = log.serialise(['frostCaverns']);
    const again = new BestiaryLog();
    expect(again.restore(JSON.parse(JSON.stringify(save)))).toEqual(['frostCaverns']);
    expect(again.complete('icefang')).toBe(true);
    expect(again.get('frostBat').defeated).toBe(1);
    // A broken save is no page, not a crash.
    expect(new BestiaryLog().restore({ pages: [['nope', 1, 1, 1, 1], 'x'] })).toEqual([]);
    const v = again.view();
    expect(v.entries.length).toBe(ALL_KINDS.length);
    expect(v.entries.find((e) => e.kind === 'icefang')!.bonus).not.toBeNull();
    expect(v.entries.find((e) => e.kind === 'gasbag')!.seen).toBe(false);
  });

  it('a completed page makes blows land 20% harder; the sonar scans every creature in reach', () => {
    const sim = new MobSim(env(), 60);
    sim.ctx = ctx({ x: 20, z: 20 });
    const a = sim.spawn('cinderHound', 20.5, FLOOR, 25.5)!;
    const r1 = sim.hit(a, 5);
    sim.known.add('cinderHound');
    const r2 = sim.hit(a, 5);
    expect(r2.damage! / r1.damage!).toBeCloseTo(1.2, 5);
    const log = record(sim);
    sim.spawn('icefang', 24.5, FLOOR, 20.5);
    expect(sim.scan(20, FLOOR + 1, 20, 12)).toBe(2);
    expect(log.filter((e) => e.type === 'scanned').length).toBe(2);
  });
});

describe('density: 30+ creatures can be about', () => {
  it('a crowd of 36 creatures of a dozen kinds simulates without error and stays out of rock', () => {
    const sim = new MobSim(env(), 70);
    sim.spawning = false;
    const kinds = ['amberTick', 'rustMite', 'gildedScarab', 'icefang', 'capSpitter', 'prismBat', 'shardling', 'clatterclaw', 'brineLeech', 'glimmerkin', 'hearthmite', 'mudpup'] as MobKind[];
    let made = 0;
    for (let i = 0; i < 36; i++) {
      const k = kinds[i % kinds.length];
      const x = 8 + (i % 9) * 7;
      const z = 8 + Math.floor(i / 9) * 14;
      const fly = SPECIES[k].locomotion === 'fly';
      if (sim.spawn(k, x + 0.5, fly ? FLOOR + 2.5 : FLOOR, z + 0.5)) made++;
    }
    expect(made).toBeGreaterThanOrEqual(34);
    const c = ctx({ x: 40, z: 60 });
    run(sim, c, 15, 1 / 30, () => {
      for (const m of sim.mobs) if (!m.dying && m.mode !== 'under') expect(solid(Math.floor(m.position.x), Math.floor(m.position.y), Math.floor(m.position.z)), `${m.kind} in rock`).toBe(false);
    });
  });
});

describe('drops, sounds and the tutorial (round 3 polish)', () => {
  it('every drop row names an item LOOP knows, and stratum I gives the early parts (hide, chitin, fang, gel)', () => {
    for (const k of ALL_KINDS) for (const d of SPECIES[k].drops) expect(d.items.some((i) => i in ITEMS), `${k}: ${d.items.join('/')}`).toBe(true);
    const early = new Set<string>();
    for (const b of ['amberHollows', 'mushroomForest'] as MobBiome[]) for (const e of ROSTERS[b].monsters) for (const d of SPECIES[e.kind].drops) early.add(d.items.find((i) => i in ITEMS)!);
    for (const part of ['hide', 'chitin', 'fang', 'gel']) expect(early.has(part), part).toBe(true);
    // LOOP's biome parts deeper down: roots give heartwood, frost frostFur, the bog venomSac, magma emberCore, the abyss voidEssence.
    const of = (b: MobBiome) => new Set(ROSTERS[b].monsters.flatMap((e) => SPECIES[e.kind].drops.map((d) => d.items.find((i) => i in ITEMS))));
    expect(of('rootGalleries').has('heartwood')).toBe(true);
    expect(of('frostCaverns').has('frostFur')).toBe(true);
    expect(of('sulphurBog').has('venomSac')).toBe(true);
    expect(of('magmaVeins').has('emberCore')).toBe(true);
    expect(of('obsidianAbyss').has('voidEssence')).toBe(true);
    // No shard item: LOOP pays the Heart Shard on 'mob:guardianDefeated'.
    for (const k of GUARDIAN_KINDS) for (const d of SPECIES[k].drops) expect(d.items).not.toContain('heartShard');
  });

  it('every sound a creature makes in a fight is a registered voice (audio/mobSfx through sfx.ts)', () => {
    const names = new Set<string>();
    for (const k of ALL_KINDS) {
      const v = SPECIES[k].voice;
      for (const n of [v.tele, v.hit, v.die, v.idle]) if (n) names.add(n);
    }
    const kinds = [...MONSTER_KINDS.filter((k) => SPECIES[k].brain !== 'vista'), ...GUARDIAN_KINDS];
    for (const kind of kinds) {
      const sim = new MobSim(env(), 90);
      sim.spawning = false;
      sim.on((e) => {
        if (e.type === 'sfx') names.add(e.name);
      });
      const d = SPECIES[kind];
      if (d.rank !== 'minion') sim.lairs = [{ id: 'l', biome: d.biome, guardian: kind as GuardianKind, x: 40, y: FLOOR, z: 22, radius: 20, sx: 40, sy: FLOOR, sz: 22 }];
      else sim.spawn(kind, 20.5, d.locomotion === 'fly' ? FLOOR + 2.5 : d.brain === 'drop' ? CEIL - 1 : FLOOR, 24.5, { ceiling: d.brain === 'drop' });
      const c = ctx(d.rank !== 'minion' ? { x: 40, z: 30 } : { x: 20, z: 20 });
      run(sim, c, 12, 1 / 20);
      for (const m of [...sim.mobs]) if (m.hostile && !m.dying) sim.hit(m, 9999);
      run(sim, c, 1, 1 / 20);
    }
    for (const n of names) expect(isSfxName(n), n).toBe(true);
    expect(names.size).toBeGreaterThan(30);
  });

  it("LOOP's tutorial fight: one soft Amber Tick 8-18 m out, never in the camp, facing the explorer", () => {
    // The camp: a 12 m square round the explorer.
    const sim = new MobSim(env({ camp: [14, 14, 26, 26] }), 91);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 }) as MobContext & { look?: { x: number; y: number; z: number } };
    c.look = { x: 0, y: 0, z: 1 };
    sim.ctx = c;
    const m = spawnFirstFight(sim, c)!;
    expect(m).not.toBeNull();
    expect(m.kind).toBe('amberTick');
    const d = Math.hypot(m.position.x - 20, m.position.z - 20);
    expect(d).toBeGreaterThanOrEqual(7.5);
    expect(d).toBeLessThanOrEqual(18.8);
    expect(sim.unsafe(m.position.x, m.position.y, m.position.z)).toBe(false);
    expect(m.hp).toBe(3);
    // Ahead of the view (+z) when the ground allows.
    expect(m.position.z).toBeGreaterThan(20);
    // Its bite is soft: 60 % of a tick's.
    const log = record(sim);
    sim.strikePlayer(m, SPECIES.amberTick.damage);
    const a = log.find((e) => e.type === 'attack');
    expect(a && a.type === 'attack' ? a.damage : 0).toBe(Math.round(SPECIES.amberTick.damage * 0.6));
    // Three pick blows (1 each) end it.
    sim.hit(m, 1);
    sim.hit(m, 1);
    expect(sim.hit(m, 1).killed).toBe(true);
  });
});

describe('elites (BRIEF §6 stretch): radiant, armoured, swift, splitting', () => {
  it('one affix in strata I-III, up to two from IV; each kind only takes what suits it; a name through t()', () => {
    const rng = new Rng(5);
    let two = 0;
    for (let i = 0; i < 400; i++) {
      expect(rollAffixes(rng, 2, 'thornback').length).toBe(1);
      const a = rollAffixes(rng, 5, 'cinderHound');
      expect(a.length).toBeGreaterThanOrEqual(1);
      expect(new Set(a).size).toBe(a.length);
      if (a.length === 2) two++;
    }
    expect(two).toBeGreaterThan(60);
    expect(canTake('wisp', 'radiant')).toBe(false);
    expect(canTake('sporeling', 'splitting')).toBe(false);
    expect(canTake('gnasher', 'swift')).toBe(false);
    expect(canTake('amberMatriarch', 'armoured')).toBe(false);
    expect(canTake('moth', 'swift')).toBe(false);
    expect(eliteName('icefang', ['swift', 'armoured'])).toBe('Swift Armoured Icefang');
  });

  it('elites lead some packs, more of them deeper down', () => {
    const count = (stratum: number) => {
      const sim = new MobSim(env(), 7 + stratum);
      let n = 0;
      for (let i = 0; i < 2000; i++) {
        const m = sim.spawn('thornback', 20.5, FLOOR, 20.5)!;
        if (maybeElite(sim, [m], stratum)) n++;
        sim.mobs.length = 0;
      }
      return n / 2000;
    };
    const one = count(1);
    const six = count(6);
    expect(one).toBeGreaterThan(ELITE_CHANCE[1] * 0.6);
    expect(one).toBeLessThan(ELITE_CHANCE[1] * 1.5);
    expect(six).toBeGreaterThan(one * 1.8);
  });

  it('an elite is tougher and a little bigger; armour turns frontal blows, a flank or back blow lands in full', () => {
    const sim = new MobSim(env(), 81);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const m = sim.spawn('thornback', 20.5, FLOOR, 25.5)!;
    const base = m.scale;
    sim.makeElite(m, ['armoured']);
    expect(m.maxHp).toBe(Math.round(SPECIES.thornback.hp * AFFIXES.armoured.hp));
    expect(m.scale).toBeCloseTo(base * 1.12, 5);
    expect(m.bounds.radius).toBeCloseTo(SPECIES.thornback.radius * m.scale, 5);
    // Facing the explorer (south, -z): a blow from the explorer is frontal.
    m.yaw = Math.atan2(20 - 20.5, 20 - 25.5);
    const front = sim.hit(m, 10);
    expect(front.armoured).toBe(true);
    expect(front.damage).toBeCloseTo(4.5, 5);
    // Struck from behind it (north): in full.
    const back = sim.hit(m, 10, { from: { x: 20.5, y: FLOOR, z: 31 } });
    expect(back.armoured).toBe(false);
    expect(back.damage).toBeCloseTo(10, 5);
    // A bomb ignores the plates.
    expect(sim.hit(m, 10, { blast: true }).damage).toBeCloseTo(10, 5);
  });

  it('a swift elite moves 40 % faster and winds up in 80 % of the time, never under 0.35 s', () => {
    const sim = new MobSim(env(), 82);
    const a = sim.spawn('icefang', 10.5, FLOOR, 10.5)!;
    const b = sim.spawn('icefang', 10.5, FLOOR, 30.5)!;
    sim.makeElite(b, ['swift']);
    expect(sim.windupOf(b)).toBeCloseTo(Math.max(0.35, SPECIES.icefang.windup * 0.8), 5);
    const tick = sim.spawn('rustMite', 10.5, FLOOR, 50.5)!;
    sim.makeElite(tick, ['swift']);
    expect(sim.windupOf(tick)).toBeCloseTo(Math.max(Math.min(SPECIES.rustMite.windup, 0.35), SPECIES.rustMite.windup * 0.8), 5);
    for (let i = 0; i < 30; i++) {
      sim.walkToward(a, 60, 10.5, 2, 1 / 30);
      sim.walkToward(b, 60, 30.5, 2, 1 / 30);
    }
    const da = a.foot.x - 10.5;
    const db = b.foot.x - 10.5;
    // Walking speed also grows with the body (scale ** 0.5): the elite is 12 % bigger.
    expect(db / da).toBeCloseTo(1.4 * Math.sqrt(b.scale / a.scale), 1);
  });

  it('a radiant leader: its pack bites 15 % harder and fears no raised flame; it bursts in light when it falls', () => {
    const sim = new MobSim(env(), 83);
    sim.spawning = false;
    const log = record(sim);
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const lead = sim.spawn('amberTick', 21.5, FLOOR, 23.5)!;
    const mate = sim.spawn('amberTick', 19.5, FLOOR, 23.5)!;
    const far = sim.spawn('amberTick', 60.5, FLOOR, 60.5)!;
    sim.makeElite(lead, ['radiant']);
    expect(sim.brave(mate)).toBe(true);
    expect(sim.brave(far)).toBe(false);
    sim.strikePlayer(mate, 10);
    sim.strikePlayer(far, 10);
    const hits = log.filter((e) => e.type === 'attack').map((e) => (e.type === 'attack' ? e.damage : 0));
    expect(hits).toEqual([Math.round(10 * 1.15), 10]);
    // A raised flame does not cow a crawler beside it.
    const crawler = sim.spawn('crawler', 22.5, FLOOR, 21.5)!;
    const raised = ctx({ x: 20, z: 20 }, {}, { raised: true });
    run(sim, raised, 0.5);
    expect(crawler.state).not.toBe('recoil');
    // It falls: the others recoil from its light.
    sim.ctx = c;
    sim.hit(lead, 999);
    expect(mate.state).toBe('recoil');
  });

  it('a splitting elite splits in two smaller, weaker ones of its kind, which do not split again', () => {
    const sim = new MobSim(env(), 84);
    sim.spawning = false;
    sim.ctx = ctx({ x: 20, z: 20 });
    const m = sim.spawn('thornback', 30.5, FLOOR, 30.5)!;
    sim.makeElite(m, ['splitting']);
    sim.hit(m, 999);
    const kids = sim.mobs.filter((o) => o !== m && o.kind === 'thornback' && !o.dying);
    expect(kids.length).toBe(2);
    for (const k of kids) {
      expect(k.split).toBe(true);
      expect(k.elite).toBe(false);
      expect(k.maxHp).toBe(Math.round(SPECIES.thornback.hp * 0.4));
      expect(k.scale).toBeLessThan(m.scale * 0.7);
      sim.hit(k, 999);
    }
    expect(sim.mobs.filter((o) => o.kind === 'thornback' && !o.dying).length).toBe(0);
  });
});

describe('the companion (BRIEF §6 stretch): a Lampling tamed with glowcaps', () => {
  // A rare ore 6 m from the explorer, an epic one 11 m off, common copper everywhere else in the walls.
  const RARE = 200;
  const EPIC = 201;
  const COPPER = 202;
  const world = {
    block: (x: number, y: number, z: number) => (x === 26 && y === FLOOR + 1 && z === 20 ? RARE : x === 31 && y === FLOOR + 1 && z === 20 ? EPIC : solid(x, y, z) ? COPPER : 0),
    oreRarity: (id: number) => (id === RARE ? 2 : id === EPIC ? 3 : id === COPPER ? 0 : -1),
  };

  function tame(sim: MobSim, level = 1): { m: SimMob; brain: CompanionBrain } {
    const brain = new CompanionBrain(world);
    const m = sim.spawn('lampling', 20.5, FLOOR + 1.9, 20.5)!;
    m.tame = true;
    m.setState('follow');
    sim.companion = { brain, level };
    return { m, brain };
  }

  it('levels 1..5 from experience; light, sense, zaps grow with them', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(LEVELS[1])).toBe(2);
    expect(levelFor(999)).toBe(5);
    expect(nextLevelXp(1)).toBe(LEVELS[1]);
    expect(nextLevelXp(5)).toBeNull();
    expect(lightBoost(5)).toBeGreaterThan(lightBoost(1));
    expect(senseRange(5)).toBeGreaterThan(senseRange(1));
    expect(zapDamage(5)).toBeGreaterThan(zapDamage(1));
  });

  it('it follows ahead of the explorer at head height, catches up when left behind, and brightens the lantern', () => {
    const sim = new MobSim(env(), 101);
    sim.spawning = false;
    const { m } = tame(sim, 3);
    const c = ctx({ x: 30, z: 55 });
    run(sim, c, 4);
    expect(Math.hypot(m.position.x - 30, m.position.z - 55)).toBeLessThan(3.5);
    expect(solid(Math.floor(m.position.x), Math.floor(m.position.y), Math.floor(m.position.z))).toBe(false);
    expect(m.position.y).toBeGreaterThan(FLOOR + 1.2);
    expect(sim.boost).toBeCloseTo(lightBoost(3), 1);
    // Far away (a ride, a fall): it pops back beside the explorer; it is never put away by distance.
    c.player.x = 70;
    c.player.z = 70;
    c.eye.x = 70;
    c.eye.z = 70;
    run(sim, c, 1);
    expect(m.dying).toBe(false);
    expect(Math.hypot(m.position.x - 70, m.position.z - 70)).toBeLessThan(4);
  });

  it('it senses the rarest ore in reach (the rare one first at level 1, the epic one once nearer, or at once with a wider sense), each once a minute', () => {
    const sim = new MobSim(env(), 102);
    sim.spawning = false;
    const log = record(sim);
    tame(sim, 1);
    const c = ctx({ x: 20, z: 20 });
    run(sim, c, 1.6);
    const ores = () => log.filter((e) => e.type === 'companion' && e.event.what === 'ore').map((e) => (e.type === 'companion' && e.event.what === 'ore' ? e.event : null));
    expect(ores().length).toBe(1);
    expect(ores()[0]).toMatchObject({ x: 26, z: 20, rarity: 'rare' });
    // It hovers by the vein: from there the epic one, 5 m further, is in reach; then nothing new.
    run(sim, c, 9);
    expect(ores().map((o) => o!.rarity)).toEqual(['rare', 'epic']);
    // Level 5 reaches 14 m: the epic vein, rarer, is told first.
    const sim2 = new MobSim(env(), 103);
    sim2.spawning = false;
    const log2 = record(sim2);
    tame(sim2, 5);
    run(sim2, ctx({ x: 20, z: 20 }), 2);
    const first = log2.find((e) => e.type === 'companion' && e.event.what === 'ore');
    expect(first && first.type === 'companion' && first.event.what === 'ore' ? first.event.rarity : null).toBe('epic');
  });

  it('it zaps small foes near the explorer (never a guardian, never one far off), more of them with its level', () => {
    const sim = new MobSim(env(), 104);
    sim.spawning = false;
    const log = record(sim);
    tame(sim, 1);
    const c = ctx({ x: 30, z: 55 });
    const tick = sim.spawn('amberTick', 33.5, FLOOR, 56.5)!;
    const crab = sim.spawn('clatterclaw', 26.5, FLOOR, 58.5)!;
    sim.lairs = [{ id: 'l', biome: 'amberHollows', guardian: 'amberMatriarch', x: 30, y: FLOOR, z: 45, radius: 4, sx: 30, sy: FLOOR, sz: 49 }];
    run(sim, c, 7);
    const zaps = log.filter((e) => e.type === 'companion' && e.event.what === 'zap').map((e) => (e.type === 'companion' && e.event.what === 'zap' ? e.event.target : null));
    expect(zaps.length).toBeGreaterThan(0);
    expect(zaps[0]).toBe(tick);
    expect(tick.dying).toBe(true);
    // The big crab and the sleeping guardian are not its to fight.
    expect(zaps.includes(crab)).toBe(false);
    expect(crab.hp).toBe(crab.maxHp);
    const g = sim.mobs.find((m) => m.guardian)!;
    expect(g).toBeDefined();
    expect(zaps.includes(g)).toBe(false);
  });

  it('a tap meant for a monster behind the companion reaches the monster', () => {
    const sim = new MobSim(env(), 105);
    sim.spawning = false;
    const { m } = tame(sim, 1);
    m.position.set(20.5, FLOOR + 1.62, 22.5);
    m.fade = 1;
    const tick = sim.spawn('thornback', 20.5, FLOOR, 26.5)!;
    tick.fade = 1;
    const ray = { ox: 20.5, oy: FLOOR + 1.62, oz: 20, dx: 0, dy: -0.15, dz: 1 };
    expect(sim.pick(ray)).toBe(tick);
    sim.remove(tick);
    expect(sim.pick(ray)).toBe(m);
  });
});

describe('smarter packs and beings (BRIEF §6 stretch): flanks, ceiling drops, a chase', () => {
  it('a pack spreads round the explorer and the one at the side strikes (each blow still told)', () => {
    const sim = new MobSim(env(), 111);
    sim.spawning = false;
    const log = record(sim);
    // The explorer looks along +z.
    const c = ctx({ x: 30, z: 55 }, { look: { x: 0, y: 0, z: 1 } });
    const g = sim.group();
    for (let i = 0; i < 4; i++) sim.spawn('amberTick', 27.5 + i * 2, FLOOR, 50.5, { group: g });
    let sides = 0;
    let fronts = 0;
    run(sim, c, 20, 1 / 30, () => {
      for (const e of log.splice(0)) {
        if (e.type !== 'telegraph') continue;
        const dx = e.mob.position.x - 30;
        const dz = e.mob.position.z - 55;
        const sin = Math.abs(dz * 0 - dx * 1) / Math.max(0.01, Math.hypot(dx, dz));
        if (sin > 0.5) sides++;
        else fronts++;
      }
    });
    expect(sides + fronts).toBeGreaterThan(2);
    expect(sides).toBeGreaterThan(fronts);
  });

  it("a roster's Stone Sentinel (no relic) keeps its post: it wakes when the explorer comes near, or to a blow", () => {
    const sim = new MobSim(env({ biome: 'haldenMines' }), 115);
    sim.spawning = false;
    const c = ctx({ x: 30, z: 30 }, { biome: 'haldenMines', stratum: 3 });
    const s = sim.spawn('sentinel', 30.5, FLOOR, 45.5)!;
    run(sim, c, 2);
    expect(s.state).toBe('sleep');
    c.player.z = 41;
    c.eye.z = 41;
    run(sim, c, 3);
    expect(['wake', 'stalk', 'windup', 'attack', 'recoil']).toContain(s.state);
    const t = sim.spawn('sentinel', 60.5, FLOOR, 20.5)!;
    expect(t.state).toBe('sleep');
    sim.ctx = c;
    sim.hit(t, 1);
    expect(t.state).toBe('wake');
  });

  it('a torch holds a pack off: they circle at the edge of its light and do not come in', () => {
    // A torch's pool round (30, 55): placed light 0.8 within 4 m.
    const lit: MobEnv = { ...env(), light: (x, _y, z) => (Math.hypot(x + 0.5 - 30, z + 0.5 - 55) < 4 ? 0.8 : 0) };
    const sim = new MobSim(lit, 114);
    sim.spawning = false;
    const log = record(sim);
    const c = ctx({ x: 30, z: 55 });
    const g = sim.group();
    for (let i = 0; i < 3; i++) sim.spawn('amberTick', 26.5 + i * 3, FLOOR, 47.5, { group: g });
    run(sim, c, 12);
    expect(log.filter((e) => e.type === 'telegraph').length).toBe(0);
    for (const m of sim.mobs) expect(Math.hypot(m.position.x - 30, m.position.z - 55)).toBeGreaterThan(3);
    // Out of the light, they come.
    c.player.x = 30;
    c.player.z = 30;
    c.eye.x = 30;
    c.eye.z = 30;
    run(sim, c, 12);
    expect(log.filter((e) => e.type === 'telegraph').length).toBeGreaterThan(0);
  });

  it('a crawler climbs over the explorer and drops from the ceiling: a drip, a circle, then the blow', () => {
    // A low tunnel: floor at 10, the roof at 15.
    const low = (x: number, y: number, z: number) => y < FLOOR || y >= 15 || x < 0 || x >= 40 || z < 0 || z >= 40;
    const e2: MobEnv = { solid: low, light: () => 0, inCamp: () => false, depthOf: (y) => 300 - y, biomeAt: () => 'amberHollows' };
    const sim = new MobSim(e2, 112);
    sim.spawning = false;
    const log = record(sim);
    const c = ctx({ x: 20, z: 20 }, {}, { flame: 0.3 });
    // It came on the roof (as a crawler pack's ambusher does in the strata).
    const m = sim.spawn('crawler', 24.5, FLOOR + 3, 24.5, { ceiling: true })!;
    expect(m.ambush).toBe(true);
    expect(m.up.y).toBeLessThan(-0.6);
    let marked = false;
    let ceiling = false;
    run(sim, c, 25, 1 / 30, () => {
      if (m.mode === 'ceiling') ceiling = true;
      if (sim.markers.some((k) => k.owner === m.id && k.kind === 'disc')) marked = true;
    });
    expect(ceiling).toBe(true);
    expect(marked).toBe(true);
    expect(log.some((e) => e.type === 'sfx' && e.name === 'mob.drip')).toBe(true);
    expect(log.some((e) => e.type === 'attack' && e.mob === m && e.landed)).toBe(true);
    expect(m.ambush).toBe(false);
  });

  it('a chased glimmerkin keeps running, tires, then stops out of breath: caught', () => {
    const sim = new MobSim(env(), 113);
    sim.spawning = false;
    const k = sim.spawn('glimmerkin', 30.5, FLOOR, 30.5)!;
    k.fade = 1;
    const c = ctx({ x: 30, z: 27 });
    // Hurrying at it: it flees; the explorer keeps running after it at 4 m/s.
    let first = -1;
    let last = -1;
    let stopped = -1;
    let t = 0;
    for (; t < 12; t += 1 / 30) {
      const dx = k.position.x - c.player.x;
      const dz = k.position.z - c.player.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      c.player.vx = (dx / d) * 4;
      c.player.vz = (dz / d) * 4;
      if (d > 2.4) {
        c.player.x += c.player.vx / 30;
        c.player.z += c.player.vz / 30;
      }
      c.eye.x = c.player.x;
      c.eye.z = c.player.z;
      const before = { x: k.foot.x, z: k.foot.z };
      sim.update(1 / 30, c);
      const v = Math.hypot(k.foot.x - before.x, k.foot.z - before.z) * 30;
      if (k.state === 'flee' && first < 0 && v > 0.5) first = v;
      if (k.state === 'flee' && v > 0) last = v;
      if (k.state === 'idle' && first > 0) {
        stopped = t;
        break;
      }
    }
    expect(stopped).toBeGreaterThan(0);
    // It ran past its usual stop (a chase keeps it going), and slower by the end.
    expect(last).toBeLessThan(first * 0.8);
    // Panting: it waits, and a tap within reach catches it.
    expect(k.cooldown).toBeGreaterThan(1.5);
    c.eye.x = k.position.x - 1.5;
    c.eye.z = k.position.z;
    c.eye.y = k.position.y + 1;
    sim.ctx = c;
    expect(sim.hit(k, 1).action).toBe('caught');
  });
});

describe('the modular body builder: every creature has its own sculpted model', () => {
  const FIRST = ['crawler', 'gnasher', 'wisp', 'stalker', 'sentinel', 'worm', 'moth', 'lampling', 'glimmerkin', 'shellback', 'jelly', 'burrower'];
  it('every kind of the rosters is planned (no placeholder), within the bone budget, sized to its capsule', () => {
    for (const k of ALL_KINDS) {
      if (FIRST.includes(k)) continue;
      expect(PLANNED_KINDS.includes(k), `${k} has a body plan`).toBe(true);
      const m = mobModel(k);
      const pos = m.geometry.getAttribute('position');
      const bone = m.geometry.getAttribute('aBone');
      expect(pos.count, `${k} vertices`).toBeGreaterThan(150);
      expect(m.bones.length, `${k} bones`).toBeLessThanOrEqual(MAX_BONES);
      for (let i = 0; i < bone.count; i += 7) expect(bone.getX(i)).toBeLessThan(m.bones.length);
      for (let i = 0; i < pos.count; i += 5) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), k).toBe(true);
      // The drawn body is about the simulated one (half to four times its capsule's radius, the lanky ones longer).
      const r = SPECIES[k].radius + SPECIES[k].halfHeight;
      expect(m.radius, `${k} model radius ${m.radius.toFixed(2)} vs capsule ${r.toFixed(2)}`).toBeGreaterThan(r * 0.5);
      expect(m.radius, `${k} model radius ${m.radius.toFixed(2)} vs capsule ${r.toFixed(2)}`).toBeLessThan(r * 4.5 + 0.6);
    }
  });

  it('kinds that share a template still differ (their own geometry, size or skin)', () => {
    const sig = (k: MobKind) => {
      const m = mobModel(k);
      const c = m.geometry.getAttribute('color');
      return `${m.geometry.getAttribute('position').count}:${m.radius.toFixed(2)}:${c.getX(0).toFixed(3)},${c.getY(0).toFixed(3)}`;
    };
    const planned = ALL_KINDS.filter((k) => !FIRST.includes(k));
    expect(new Set(planned.map(sig)).size).toBe(planned.length);
  });
});

void ({} as SimMob);
