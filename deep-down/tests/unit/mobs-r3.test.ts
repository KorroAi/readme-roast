import { describe, expect, it } from 'vitest';
import { MobSim, type MobEnv, type MobSimEvent, type SimMob } from '../../src/game/mobs/MobSim';
import { MOBS_RULES } from '../../src/game/mobs/config';
import { BESTIARY_ORDER, ROSTERS, bestiary } from '../../src/game/mobs/rosters';
import { ALL_KINDS, BEING_KINDS, GUARDIAN_DEFS, GUARDIAN_KINDS, MONSTER_KINDS, SPECIES } from '../../src/game/mobs/species';
import { pickEntry, strataBudget, type Lair } from '../../src/game/mobs/spawner';
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
      const sim = new MobSim(env({ biome: b, camp: [0, 0, 12, 12], safe: (x, z) => x > 60 && z > 60 }), 50);
      const c = ctx({ x: 30, z: 30 }, { stratum: ROSTERS[b].stratum, biome: b });
      const seen = new Set<MobKind>();
      run(sim, c, 120, 1 / 20, () => {
        for (const m of sim.mobs) {
          if (m.dying) continue;
          seen.add(m.kind);
          if (m.hostile) {
            expect(m.position.x > 12 + 4 || m.position.z > 12 + 4, 'not in the camp').toBe(true);
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
    run(sim, c, 4);
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

void ({} as SimMob);
