import { describe, expect, it } from 'vitest';
import { MobSim, rayCapsule, type MobEnv, type MobSimEvent, type SimMob } from '../../src/game/mobs/MobSim';
import { MOB_DEFS, MOBS_RULES, monsterBudget, packSize } from '../../src/game/mobs/config';
import { clingable, crawlNext, floorNear, flyStep, standableFor, walkStep } from '../../src/game/mobs/nav';
import type { MobContext } from '../../src/game/mobs/types';

// The creatures' rules (round 2, MOBS): spawning (never in the lantern pool, never at camp, density
// rising with depth), movement (never in rock, never floating), combat, telegraphs, the light rules
// and the beings' interactions. A synthetic cave: a 60 x 10 x 60 m hall, floor at y = 10, a pillar.

const FLOOR = 10;
const CEIL = 20;
const solid = (x: number, y: number, z: number): boolean => {
  if (y < FLOOR || y >= CEIL || x < 0 || x >= 60 || z < 0 || z >= 60) return true;
  // A pillar in the middle and a low wall, so paths must go round rock.
  if (x >= 28 && x <= 31 && z >= 28 && z <= 31) return true;
  if (z === 45 && x >= 10 && x <= 40 && y < FLOOR + 2) return true;
  return false;
};

function env(opts: { depthAt?: (y: number) => number; lamp?: (x: number, y: number, z: number) => number; camp?: [number, number, number, number] } = {}): MobEnv {
  const camp = opts.camp ?? [-100, -100, -90, -90];
  return {
    solid,
    light: opts.lamp ?? (() => 0),
    inCamp: (x, _y, z) => x >= camp[0] && x <= camp[2] && z >= camp[1] && z <= camp[3],
    depthOf: opts.depthAt ?? ((y) => 150 - y),
  };
}

function ctx(p: { x: number; z: number }, l: Partial<MobContext['lantern']> = {}, extra: Partial<MobContext> = {}): MobContext {
  return {
    time: 0,
    player: { x: p.x, y: FLOOR, z: p.z, vx: 0, vz: 0 },
    eye: { x: p.x, y: FLOOR + 1.62, z: p.z },
    lantern: { x: p.x - 0.3, y: FLOOR + 1.2, z: p.z + 0.3, radius: 11, flame: 1, lit: true, raised: false, ...l },
    depth: 140,
    atCamp: false,
    active: true,
    ...extra,
  };
}

function run(sim: MobSim, c: MobContext, seconds: number, dt = 1 / 30, each?: () => void): void {
  for (let t = 0; t < seconds; t += dt) {
    sim.update(dt, c);
    each?.();
  }
}

describe('spawn rules', () => {
  it('no monster above the Hollow, more of them deeper, capped', () => {
    expect(monsterBudget(40)).toBe(0);
    expect(monsterBudget(MOBS_RULES.monsterDepth - 1)).toBe(0);
    expect(monsterBudget(MOBS_RULES.monsterDepth)).toBe(1);
    const mid = monsterBudget(MOBS_RULES.monsterDepth + 30);
    const deep = monsterBudget(MOBS_RULES.monsterDepth + 60);
    expect(mid).toBeGreaterThan(1);
    expect(deep).toBeGreaterThan(mid);
    expect(monsterBudget(999)).toBe(MOBS_RULES.maxMonsters);
    // Lone crawlers near the top, packs of 2-4 deeper down.
    expect(packSize(MOBS_RULES.monsterDepth + 2, 0.9)).toBe(1);
    for (const r of [0, 0.5, 0.99]) {
      const n = packSize(MOBS_RULES.monsterDepth + 60, r);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  it('never in the lantern pool, at camp, in lit places, or above the monster line', () => {
    const sim = new MobSim(env({ lamp: (x, _y, z) => (x > 50 && z > 50 ? 0.8 : 0), camp: [0, 0, 8, 8] }));
    const c = ctx({ x: 30, z: 15 });
    // In the pool (3 m from the flame).
    expect(sim.canSpawnMonster(33, FLOOR, 15, c)).toBe(false);
    // Out in the dark, far enough.
    expect(sim.canSpawnMonster(30, FLOOR, 38, c)).toBe(true);
    // At the camp (and its margin is the env's business: here the box itself).
    expect(sim.canSpawnMonster(4, FLOOR, 4, c)).toBe(false);
    // Under a lamp.
    expect(sim.canSpawnMonster(55, FLOOR, 55, c)).toBe(false);
    // A shallow world: nothing hostile at all.
    const shallow = new MobSim(env({ depthAt: () => 40 }));
    expect(shallow.canSpawnMonster(30, FLOOR, 38, c)).toBe(false);
  });

  it('the spawner keeps every monster out of the pool and the camp, over minutes of play', () => {
    const sim = new MobSim(env({ camp: [0, 0, 12, 12] }), 7);
    const c = ctx({ x: 20, z: 20 });
    const spawned: SimMob[] = [];
    sim.on((e: MobSimEvent) => {
      if (e.type === 'spawn' && e.mob.hostile) spawned.push(e.mob);
    });
    run(sim, c, 240);
    expect(spawned.length).toBeGreaterThan(3);
    // Where each monster first stood: outside the pool (and the camp).
    for (const m of spawned) {
      const d = Math.hypot(m.home.x - c.lantern.x, m.home.y - c.lantern.y, m.home.z - c.lantern.z);
      expect(d).toBeGreaterThan(c.lantern.radius * MOBS_RULES.poolFactor * c.lantern.flame);
      expect(m.home.x <= 12 && m.home.z <= 12).toBe(false);
    }
    // At camp, every monster is put away and none comes.
    const home = ctx({ x: 20, z: 20 }, {}, { atCamp: true });
    run(sim, home, 3);
    expect(sim.mobs.filter((m) => m.hostile && !m.dying).length).toBe(0);
  });

  it('density rises with depth', () => {
    const count = (depth: number) => {
      const sim = new MobSim(env({ depthAt: () => depth }), 3);
      let most = 0;
      run(sim, ctx({ x: 20, z: 20 }, {}, { depth }), 180, 1 / 15, () => {
        most = Math.max(most, sim.count('monster'));
      });
      return most;
    };
    const top = count(MOBS_RULES.monsterDepth - 5);
    const mid = count(MOBS_RULES.monsterDepth + 5);
    const deep = count(MOBS_RULES.monsterDepth + 60);
    expect(top).toBe(0);
    expect(mid).toBeGreaterThan(0);
    expect(deep).toBeGreaterThan(mid);
  });
});

describe('movement: never in rock, never floating', () => {
  it('walkers keep their feet on a floor and refuse walls', () => {
    const foot = { x: 20.5, y: FLOOR, z: 40.5 };
    for (let i = 0; i < 300; i++) {
      walkStep(solid, foot, 0, 3, 1 / 30, 2, 0.4);
      expect(standableFor(solid, Math.floor(foot.x), Math.round(foot.y), Math.floor(foot.z), 2)).toBe(true);
    }
    // The low wall at z = 45 is 2 high: it stops a walker (one step up only).
    expect(foot.z).toBeLessThan(45);
    expect(floorNear(solid, 20, FLOOR, 20, 2)).toBe(FLOOR);
  });

  it('crawlers move cell by cell on rock faces, never inside rock', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const c = ctx({ x: 15, z: 15 });
    const m = sim.spawn('crawler', 40, FLOOR, 40)!;
    expect(m).not.toBeNull();
    run(sim, c, 20, 1 / 30, () => {
      expect(solid(Math.floor(m.position.x), Math.floor(m.position.y), Math.floor(m.position.z))).toBe(false);
      expect(clingable(solid, m.cell.x, m.cell.y, m.cell.z)).toBe(true);
    });
    // And a step never crosses an edge of rock.
    const out = { x: 0, y: 0, z: 0 };
    expect(crawlNext(solid, { x: 27, y: FLOOR, z: 27 }, { x: 33, y: FLOOR, z: 33 }, out, () => 0, () => 0)).toBe(true);
    expect(solid(out.x, out.y, out.z)).toBe(false);
  });

  it('fliers refuse every move into rock', () => {
    const p = { x: 27.5, y: 14, z: 29.5 };
    const v = { x: 4, y: 0, z: 0 };
    for (let i = 0; i < 60; i++) flyStep(solid, p, v, 1 / 30, 0.4);
    expect(p.x).toBeLessThan(28);
  });
});

describe('combat and the light', () => {
  it('a crawler takes two machete blows, a light shard hurts it more, every strike stops time 40 ms', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const m = sim.spawn('crawler', 40, FLOOR, 40)!;
    sim.update(1 / 30, ctx({ x: 36, z: 40 }));
    expect(m.hp).toBe(MOB_DEFS.crawler.hp);
    const r1 = sim.hit(m, 2);
    expect(r1).toMatchObject({ hit: true, killed: false, hitStop: MOBS_RULES.hitStop });
    expect(m.state).toBe('recoil');
    const r2 = sim.hit(m, 2);
    expect(r2.killed).toBe(true);
    expect(m.dying).toBe(true);
    const n = sim.spawn('crawler', 40, FLOOR, 38)!;
    sim.hit(n, 1.5, { light: true });
    expect(n.hp).toBeCloseTo(MOB_DEFS.crawler.hp - 2.25, 5);
  });

  it('the Gnasher shrugs blows off while shut; the Sentinel takes full blows only on its open core', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const g = sim.spawn('gnasher', 40, FLOOR, 40)!;
    const r = sim.hit(g, 2);
    expect(r.hit).toBe(true);
    expect(g.hp).toBeCloseTo(MOB_DEFS.gnasher.hp - 0.6, 5);
    expect(g.state).toBe('windup');
    const s = sim.spawn('sentinel', 20, FLOOR, 20, { relic: 'relicChoir', asleep: false })!;
    s.setState('stalk');
    sim.hit(s, 4);
    expect(s.hp).toBeCloseTo(MOB_DEFS.sentinel.hp - 1, 5);
    s.setState('recoil');
    sim.hit(s, 4);
    expect(s.hp).toBeCloseTo(MOB_DEFS.sentinel.hp - 5, 5);
    // A sleeping Sentinel cannot be struck; beating it marks its relic done.
    s.hp = 1;
    sim.hit(s, 4);
    expect(sim.sentinelDone.has('relicChoir')).toBe(true);
  });

  it('every blow is telegraphed first', () => {
    const sim = new MobSim(env({ depthAt: () => 140 }), 11);
    const c = ctx({ x: 20, z: 20 }, { flame: 0.2 });
    const tele = new Map<number, number>();
    let attacks = 0;
    sim.on((e) => {
      if (e.type === 'telegraph') tele.set(e.mob.id, sim.time);
      if (e.type === 'attack' && e.damage > 0) {
        attacks++;
        expect(tele.has(e.mob.id), `${e.mob.kind} telegraphed`).toBe(true);
        expect(sim.time - tele.get(e.mob.id)!).toBeGreaterThanOrEqual(e.mob.def.windup * 0.9);
      }
    });
    sim.spawning = false;
    for (let i = 0; i < 3; i++) sim.spawn('crawler', 26 + i, FLOOR, 26);
    sim.spawn('gnasher', 21.5, FLOOR, 21.5);
    run(sim, c, 40);
    expect(attacks).toBeGreaterThan(0);
  });

  it('a wisp drinks the oil and dims the flame; a raised lantern burns it away', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    const w = sim.spawn('wisp', 23, FLOOR + 2, 23)!;
    let drained = 0;
    sim.on((e) => {
      if (e.type === 'drain') drained += e.seconds;
    });
    run(sim, c, 12);
    expect(w.state).toBe('attack');
    expect(drained).toBeGreaterThan(5);
    expect(sim.dim).toBeLessThan(0.8);
    c.lantern.raised = true;
    run(sim, c, 4);
    expect(w.dying || w.state === 'recoil').toBe(true);
  });

  it('the Hollow Stalker waits at the edge of a full flame, comes when it is dim, flees when it is raised', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const c = ctx({ x: 15, z: 15 });
    const s = sim.spawn('stalker', 15.5, FLOOR, 27.5)!;
    run(sim, c, 3);
    // Full flame, far: it stands and watches.
    expect(s.state).toBe('lurk');
    const z0 = s.foot.z;
    c.lantern.flame = 0.2;
    run(sim, c, 4);
    expect(s.state).toBe('stalk');
    expect(s.foot.z).toBeLessThan(z0 - 1);
    c.lantern.raised = true;
    run(sim, c, 0.5);
    expect(s.state).toBe('flee');
  });

  it('crawlers recoil from a raised flame and a Flash Charge clears a group', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    const pack = [sim.spawn('crawler', 24, FLOOR, 20)!, sim.spawn('crawler', 20, FLOOR, 24)!, sim.spawn('crawler', 17, FLOOR, 17)!];
    sim.update(1 / 30, c);
    const n = sim.flash(20, FLOOR + 1.5, 20, 6, 6);
    expect(n).toBe(3);
    for (const m of pack) expect(m.dying).toBe(true);
  });

  it('a pick ray finds a creature by its capsule, not through rock', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const m = sim.spawn('glimmerkin', 20, FLOOR, 35)!;
    m.fade = 1;
    sim.update(1 / 30, ctx({ x: 20, z: 20 }));
    m.fade = 1;
    const eye = { ox: 20.5, oy: m.position.y, oz: 22 };
    expect(sim.pick({ ...eye, dx: 0, dy: 0, dz: 1 })?.id).toBe(m.id);
    expect(sim.pick({ ...eye, dx: 1, dy: 0, dz: 0 })).toBeNull();
    // Behind the pillar.
    const hid = sim.spawn('glimmerkin', 33.5, FLOOR, 29.5)!;
    hid.fade = 1;
    expect(sim.pick({ ox: 25, oy: FLOOR + 0.3, oz: 29.5, dx: 1, dy: 0, dz: 0 })).toBeNull();
    expect(rayCapsule(0, 0, 0, 0, 0, 1, 0, -1, 5, 1, 0.5)).toBeCloseTo(4.5, 5);
  });
});

describe('the endearing beings', () => {
  it('a Glimmerkin is caught by a tap within reach (not from afar) and leaves gems', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const k = sim.spawn('glimmerkin', 20.5, FLOOR, 30.5)!;
    sim.update(1 / 30, ctx({ x: 20.5, z: 20 }));
    expect(sim.hit(k, 1).hit).toBe(false);
    sim.update(1 / 30, ctx({ x: 20.5, z: 28.5 }));
    const caught: string[] = [];
    sim.on((e) => {
      if (e.type === 'interact') caught.push(e.action);
    });
    const r = sim.hit(k, 1);
    expect(r).toMatchObject({ hit: true, action: 'caught', hitStop: 0 });
    expect(caught).toEqual(['caught']);
  });

  it('a Shellback gives a crystal per tap until bare, and its crystals grow back', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const s = sim.spawn('shellback', 20.5, FLOOR, 23)!;
    const c = ctx({ x: 20.5, z: 20.6 });
    sim.update(1 / 30, c);
    const start = s.crystals;
    let n = 0;
    for (let i = 0; i < 6; i++) {
      run(sim, c, 1.8);
      if (sim.hit(s, 1).action === 'harvested') n++;
    }
    expect(n).toBe(start);
    expect(s.crystals).toBe(0);
    expect(s.tappable).toBe(false);
    run(sim, c, MOBS_RULES.shellRegrow + 1, 1 / 10);
    expect(s.crystals).toBeGreaterThan(0);
    expect(s.tappable).toBe(true);
  });

  it('a drift jelly gives light spores (a lantern boost), then needs time', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const j = sim.spawn('jelly', 20.5, FLOOR + 2.5, 22)!;
    const c = ctx({ x: 20.5, z: 20 });
    run(sim, c, 1);
    expect(sim.hit(j, 1).action).toBe('spores');
    run(sim, c, 2);
    expect(sim.boost).toBeGreaterThan(1.1);
    expect(sim.hit(j, 1).hit).toBe(false);
  });

  it('lamplings follow a lit lantern, then go home', () => {
    const sim = new MobSim(env());
    sim.spawning = false;
    const l = sim.spawn('lampling', 22, FLOOR + 1.5, 22)!;
    const c = ctx({ x: 20, z: 20 });
    run(sim, c, 2);
    expect(l.state).toBe('follow');
    run(sim, c, MOBS_RULES.lamplingFollow + 1, 1 / 10);
    expect(['flee', 'idle']).toContain(l.state);
  });
});
