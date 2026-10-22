import { describe, expect, it } from 'vitest';
import { MobSim, collapseOf, type MobEnv, type MobSimEvent, type SimMob } from '../../src/game/mobs/MobSim';
import { SPECIES } from '../../src/game/mobs/species';
import { HEART_BEAT, beatNudge, guardianState } from '../../src/game/mobs/guardian';
import type { Lair } from '../../src/game/mobs/spawner';
import { WEAPONS } from '../../src/config/weapons';
import { isSfxName } from '../../src/audio/sfx';
import { hasText } from '../../src/i18n';
import { GUARDIAN_KINDS, GUARDIAN_DEFS } from '../../src/game/mobs/species';
import type { GuardianKind, MobContext } from '../../src/game/mobs/types';

// Round 3 (the second MOBS): the feel of a fight. Hit reactions (a flinch away from the blow, the
// weapon's own knock-back), deaths that read on the body (a collapse before the dissolve: fliers
// fall, crawlers drop off the roof, the big ones go down slowly), a charger's charge broken by a hard
// blow while it paws, a guardian's open guard told (event, sound, a window that closes), the harmless
// ring of light when a guardian's fight turns, the Dark Heart's beat quickening with its phases.
// The synthetic cavern of mobs-r3: an 80 x 14 x 80 m hall, floor y = 10, ceiling y = 24, a pillar.

const FLOOR = 10;
const CEIL = 24;
const solid = (x: number, y: number, z: number): boolean => {
  if (y < FLOOR || y >= CEIL || x < 0 || x >= 80 || z < 0 || z >= 80) return true;
  return x >= 38 && x <= 41 && z >= 38 && z <= 41;
};

function env(): MobEnv {
  return { solid, light: () => 0, inCamp: () => false, depthOf: (y) => 300 - y };
}

function ctx(p: { x: number; z: number }, extra: Partial<MobContext> = {}): MobContext {
  return {
    time: 0,
    player: { x: p.x, y: FLOOR, z: p.z, vx: 0, vz: 0 },
    eye: { x: p.x, y: FLOOR + 1.62, z: p.z },
    lantern: { x: p.x - 0.3, y: FLOOR + 1.2, z: p.z + 0.3, radius: 11, flame: 1, lit: true, raised: false },
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

function lairOf(kind: GuardianKind, x = 40, z = 20, r = 18): Lair {
  return { id: `l-${kind}`, biome: SPECIES[kind].biome, guardian: kind, x, y: FLOOR, z, radius: r, sx: x, sy: FLOOR, sz: z };
}

describe('hit reactions', () => {
  it('a blow makes the creature flinch away from it (a quarter second), and the flinch is gone after', () => {
    const sim = new MobSim(env(), 3);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const m = sim.spawn('gritBoar', 20.5, FLOOR, 24.5)!;
    sim.hit(m, 1, { weapon: 'machete', from: { x: 20, y: FLOOR + 1.6, z: 20 } });
    expect(m.hurt).toBeGreaterThan(0.5);
    // Pushed away from the explorer (+z).
    expect(m.hurtDir.z).toBeGreaterThan(0.9);
    run(sim, c, 0.3);
    expect(m.hurt).toBe(0);
    // A weak spot jolts it harder than a plate.
    const g = sim.spawn('clatterclaw', 30.5, FLOOR, 24.5)!;
    sim.hit(g, 1, { from: { x: 30, y: FLOOR + 1.6, z: 20 } });
    const plate = g.hurt;
    g.hurt = 0;
    g.setState('recoil');
    g.timer = 2;
    sim.hit(g, 1, { from: { x: 30, y: FLOOR + 1.6, z: 20 } });
    expect(g.hurt).toBeGreaterThan(plate);
  });

  it("each weapon knocks by LOOP's own number: the great axe shoves, the machete nudges, the pick barely", () => {
    expect(WEAPONS.greatAxe.knockback!).toBeGreaterThan(WEAPONS.machete.knockback!);
    const push = (weapon: string) => {
      const sim = new MobSim(env(), 4);
      sim.spawning = false;
      sim.ctx = ctx({ x: 20, z: 20 });
      const m = sim.spawn('icefang', 20.5, FLOOR, 24.5)!;
      // Big enough that the blow does not kill it.
      m.hp = 999;
      sim.hit(m, 0.5, { weapon, from: { x: 20.5, y: FLOOR + 1.6, z: 20 } });
      return Math.hypot(m.knock.x, m.knock.z);
    };
    expect(push('greatAxe')).toBeGreaterThan(push('machete') * 2);
    expect(push('machete')).toBeGreaterThan(push('pick'));
    expect(push('greatAxe')).toBeCloseTo(WEAPONS.greatAxe.knockback! / SPECIES.icefang.mass, 5);
  });

  it("a hard blow while a charger paws breaks its charge: no rush follows, and it backs off (still told: its marker goes)", () => {
    const sim = new MobSim(env(), 5);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    const log = record(sim);
    const m = sim.spawn('thornback', 20.5, FLOOR, 28.5)!;
    let hitDuringWindup = false;
    run(sim, c, 8, 1 / 30, () => {
      if (!hitDuringWindup && m.state === 'windup' && m.stateTime > 0.2) {
        hitDuringWindup = true;
        sim.hit(m, m.maxHp! * 0.3, { weapon: 'sword', from: c.eye });
        expect(m.state).toBe('recoil');
        expect(sim.markers.some((k) => k.owner === m.id)).toBe(false);
      }
    });
    expect(hitDuringWindup).toBe(true);
    // The first wind-up was broken; a later one may come (still told first).
    const firstRush = log.findIndex((e) => e.type === 'sfx' && e.name === 'mob.rush');
    const tells = log.filter((e, i) => e.type === 'telegraph' && e.mob === m && (firstRush < 0 || i < firstRush)).length;
    expect(tells).toBeGreaterThanOrEqual(firstRush < 0 ? 1 : 2);
  });
});

describe('deaths that read on the body', () => {
  it('struck down, a creature stays whole while it collapses, then dissolves; one put away fades at once', () => {
    const sim = new MobSim(env(), 6);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const log = record(sim);
    const m = sim.spawn('icefang', 20.5, FLOOR, 24.5)!;
    m.fade = 1;
    sim.hit(m, 999, { weapon: 'sword', from: c.eye });
    expect(m.dying).toBe(true);
    expect(m.killed).toBe(true);
    expect(m.collapse).toBe(collapseOf(m));
    expect(m.collapse).toBeGreaterThan(0.4);
    run(sim, c, m.collapse * 0.8);
    expect(m.fade).toBe(1);
    run(sim, c, m.collapse * 0.2 + 1.2);
    expect(sim.mobs.includes(m)).toBe(false);
    expect(log.some((e) => e.type === 'gone' && e.mob === m)).toBe(true);
    // Put away (despawned): no collapse.
    const n = sim.spawn('icefang', 30.5, FLOOR, 24.5)!;
    n.fade = 1;
    sim.remove(n);
    expect(n.killed).toBe(false);
    run(sim, c, 0.2);
    expect(n.fade).toBeLessThan(1);
  });

  it('a flier struck down falls out of the air to the floor', () => {
    const sim = new MobSim(env(), 7);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const bat = sim.spawn('frostBat', 20.5, FLOOR + 4.5, 24.5)!;
    bat.fade = 1;
    const y0 = bat.position.y;
    const log = record(sim);
    sim.hit(bat, 999, { from: c.eye });
    expect(bat.collapse).toBeGreaterThanOrEqual(0.7);
    // Whole while it falls (the dissolve starts on the ground).
    let fadedInAir = false;
    run(sim, c, bat.collapse + 0.3, 1 / 30, () => {
      if (bat.position.y > FLOOR + 1 && bat.fade < 1) fadedInAir = true;
    });
    expect(fadedInAir).toBe(false);
    expect(bat.position.y).toBeLessThan(y0 - 2.5);
    expect(bat.position.y).toBeGreaterThanOrEqual(FLOOR);
    // Heard as it hits the floor.
    expect(log.some((e) => e.type === 'sfx' && e.name === 'mob.thud' && e.mob === bat)).toBe(true);
  });

  it('a crawler struck down on the roof lets go and drops to the floor', () => {
    const sim = new MobSim(env(), 8);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 20 });
    sim.ctx = c;
    const cr = sim.spawn('crawler', 20.5, CEIL - 1, 24.5, { ceiling: true })!;
    expect(cr.up.y).toBeLessThan(-0.6);
    cr.fade = 1;
    sim.hit(cr, 999, { from: c.eye });
    // A 13 m drop: it is still whole when it lands (the collapse waits for the fall).
    let landedWhole = false;
    run(sim, c, 2, 1 / 30, () => {
      if (!landedWhole && cr.position.y < FLOOR + 1.2) landedWhole = cr.fade === 1;
    });
    expect(landedWhole).toBe(true);
    expect(cr.up.y).toBeGreaterThan(0.9);
  });

  it('a guardian goes down slowly, light breaking out of it, before it dissolves', () => {
    const sim = new MobSim(env(), 9);
    sim.spawning = false;
    sim.lairs = [lairOf('foremanEngine', 40, 20, 18)];
    const c = ctx({ x: 40, z: 30 });
    run(sim, c, 3);
    const g = sim.mobs.find((m) => m.guardian)!;
    const log = record(sim);
    g.setState('recoil');
    sim.hit(g, 99999, { from: c.eye });
    const f0 = g.fade;
    expect(g.collapse).toBeGreaterThanOrEqual(2);
    run(sim, c, g.collapse * 0.98);
    expect(g.fade).toBe(f0);
    expect(log.filter((e) => e.type === 'burst').length).toBeGreaterThanOrEqual(4);
  });
});

describe("a guardian's open guard is told", () => {
  it('after each attack: an event with its seconds, a sound, a window that closes as it runs out', () => {
    const sim = new MobSim(env(), 10);
    sim.spawning = false;
    const log = record(sim);
    sim.lairs = [lairOf('amberMatriarch', 40, 20, 18)];
    const c = ctx({ x: 40, z: 30 });
    let sawFull = false;
    let sawClosing = false;
    run(sim, c, 30, 1 / 30, () => {
      const g = sim.mobs.find((m) => m.guardian);
      if (!g || !g.vulnerable) return;
      const w = guardianState(g).window;
      if (w > 0.9) sawFull = true;
      if (w > 0 && w < 0.3) sawClosing = true;
    });
    const opens = log.filter((e) => e.type === 'guardian' && e.phase === 'open');
    expect(opens.length).toBeGreaterThanOrEqual(2);
    for (const o of opens) expect(o.type === 'guardian' && o.mob.openFor).toBeGreaterThan(1);
    expect(log.some((e) => e.type === 'sfx' && e.name === 'guardian.open')).toBe(true);
    expect(sawFull && sawClosing).toBe(true);
    // Shut, the window reads 0.
    const g = sim.mobs.find((m) => m.guardian)!;
    g.setState('stalk');
    expect(guardianState(g).window).toBe(0);
  });

  it('every voice it uses is registered, and each guardian has a line for its new phase', () => {
    for (const n of ['guardian.open', 'guardian.heartbeat']) expect(isSfxName(n), n).toBe(true);
    for (const k of GUARDIAN_KINDS) for (let p = 2; p <= GUARDIAN_DEFS[k].patterns.length; p++) expect(hasText(`mob.phaseLine.${k}.${p}`), `${k} phase ${p}`).toBe(true);
    expect(hasText('mob.guardianOpen')).toBe(true);
  });

  it('its fight turning rolls out a ring of light that hurts no one', () => {
    const sim = new MobSim(env(), 11);
    sim.spawning = false;
    sim.lairs = [lairOf('quartzTitan', 40, 20, 18)];
    const c = ctx({ x: 40, z: 26 });
    run(sim, c, 2);
    const g = sim.mobs.find((m) => m.guardian)!;
    sim.ctx = c;
    const log = record(sim);
    g.setState('recoil');
    g.timer = 2;
    sim.hit(g, (g.hp! - g.maxHp! * 0.45) / 1.6);
    expect(g.phase).toBe(2);
    expect(sim.markers.some((k) => k.kind === 'pulse' && k.owner === g.id)).toBe(true);
    // The ring passes the explorer (6 m off) without a blow.
    sim.brains = false;
    run(sim, c, 2);
    expect(log.some((e) => e.type === 'attack' && e.landed)).toBe(false);
    expect(sim.markers.some((k) => k.kind === 'pulse')).toBe(false);
  });
});

describe("the Dark Heart's beat", () => {
  it('it beats (a sound each beat), quicker in each phase', () => {
    const beats = (phase: number) => {
      const sim = new MobSim(env(), 12);
      sim.spawning = false;
      sim.lairs = [lairOf('heartOfDark', 40, 20, 24)];
      const c = ctx({ x: 40, z: 30 });
      run(sim, c, 2);
      const h = sim.mobs.find((m) => m.kind === 'heartOfDark')!;
      h.phase = phase;
      sim.brains = true;
      const log = record(sim);
      // Hold it awake without fighting: only its heart runs.
      sim.spawning = false;
      run(sim, c, 10, 1 / 30, () => {
        h.cooldown = 99;
      });
      return log.filter((e) => e.type === 'sfx' && e.name === 'guardian.heartbeat').length;
    };
    const b1 = beats(1);
    const b3 = beats(3);
    expect(b1).toBeGreaterThanOrEqual(6);
    expect(b3).toBeGreaterThan(b1 * 1.5);
  });

  it("the Heart's beat settles on the score's grid (120 bpm): on the beats for 1.5 / 1.0 s, every other lub on the beat for 0.75 s", () => {
    const beatLen = 0.5;
    for (const [period, grid] of [[1.5, 0.5], [1.0, 0.5], [0.75, 0.25]] as const) {
      // 0.2 s late to start with (nearer the off-beat than the beat).
      let beat = 0.5 - 0.2 / period;
      const lubs: number[] = [];
      const dt = 1 / 30;
      for (let t = 0; t < 12; t += dt) {
        beat += dt / period;
        if (beat >= 1) {
          beat -= 1;
          lubs.push(t - beat * period);
        }
        beat = beatNudge(beat, period, beatLen - (t % beatLen), beatLen, dt);
      }
      // The last lubs sit on the grid (within 25 ms).
      for (const at of lubs.slice(-4)) {
        const off = Math.abs(((at % grid) + grid) % grid);
        expect(Math.min(off, grid - off), `period ${period}: lub at ${at.toFixed(3)} s`).toBeLessThan(0.025);
      }
      if (period === 0.75) {
        const onBeat = lubs.slice(-4).map((at) => {
          const off = ((at % beatLen) + beatLen) % beatLen;
          return Math.min(off, beatLen - off) < 0.03;
        });
        expect(onBeat.filter(Boolean).length, 'every other lub on a whole beat').toBe(2);
      }
    }
  });

  it("the Heart's beat is in its guardian state (period and phase: the relit Heart can pulse with it); a guardian has none", () => {
    const sim = new MobSim(env(), 12);
    sim.spawning = false;
    sim.lairs = [lairOf('heartOfDark', 40, 20, 24), lairOf('rimeWyrm', 20, 60, 14)];
    run(sim, ctx({ x: 40, z: 30 }), 2);
    const h = sim.mobs.find((m) => m.kind === 'heartOfDark')!;
    const s = guardianState(h);
    expect(s.beat?.period).toBe(HEART_BEAT[h.state === 'sleep' ? 0 : Math.min(3, h.phase)]);
    expect(s.beat!.phase).toBeGreaterThanOrEqual(0);
    expect(s.beat!.phase).toBeLessThan(1);
    const w = sim.mobs.find((m) => m.kind === 'rimeWyrm');
    if (w) expect(guardianState(w).beat).toBeUndefined();
  });
});

describe('spawning that keeps a fight nervous but fair (measured on the real strata by tools/mob-density.ts)', () => {
  it('a hunter is only placed where the air joins it to the explorer (never walled off in the next tunnel)', async () => {
    const { FlowField } = await import('../../src/game/mobs/flow');
    // Two halls side by side, a solid wall between them (x 30..31) with no way round within reach.
    const walled = (x: number, y: number, z: number) => solid(x, y, z) || (x >= 30 && x <= 31);
    const r = new FlowField();
    r.build(walled, 20.5, FLOOR, 40.5, 36, 0);
    expect(r.has(26, FLOOR, 40)).toBe(true);
    expect(r.distAt(26, FLOOR, 40)).toBe(6);
    expect(r.has(34, FLOOR, 40)).toBe(false);
    // Rock itself is never "reached".
    expect(r.has(20, FLOOR - 1, 40)).toBe(false);
  });

  it('a stalking monster behind a wall does not hold the encounter clock (the explorer meets nothing there)', () => {
    const walled = (x: number, y: number, z: number) => solid(x, y, z) || (x >= 30 && x <= 31);
    const sim = new MobSim({ solid: walled, light: () => 0, inCamp: () => false, depthOf: (y) => 300 - y }, 13);
    sim.spawning = false;
    const c = ctx({ x: 26, z: 40 });
    const m = sim.spawn('thornback', 34.5, FLOOR, 40.5)!;
    m.setState('stalk');
    run(sim, c, 3);
    expect(sim.quiet).toBeGreaterThan(2.5);
    // In sight in the same hall, it does.
    const n = sim.spawn('thornback', 20.5, FLOOR, 40.5)!;
    n.setState('stalk');
    run(sim, c, 0.5);
    expect(sim.quiet).toBeLessThan(0.2);
  });

  it('after a quiet stretch a hunting pack comes (sooner in the deep, at night, with a dying flame); ambushers wait ahead', async () => {
    const { huntQuiet, isHunter } = await import('../../src/game/mobs/spawner');
    expect(huntQuiet(6, 0.5)).toBeLessThan(huntQuiet(1, 0.5));
    expect(huntQuiet(3, 0.5, 1)).toBeLessThan(huntQuiet(3, 0.5));
    expect(huntQuiet(3, 0.5, 0, 1)).toBeLessThan(huntQuiet(3, 0.5));
    expect(isHunter('rootWeevil')).toBe(true);
    expect(isHunter('gnasher')).toBe(false);
    expect(isHunter('gillhanger')).toBe(false);
    const sim = new MobSim({ ...env(), biomeAt: () => 'rootGalleries' }, 14);
    const c = ctx({ x: 20, z: 20 }, { stratum: 2, biome: 'rootGalleries', look: { x: 0, y: 0, z: 1 } });
    const times: number[] = [];
    sim.on((e) => {
      if (e.type === 'spawn' && e.mob.hostile && isHunter(e.mob.kind) && !e.mob.nest) times.push(sim.time);
    });
    const due0 = sim.encounterDue;
    run(sim, c, 90, 1 / 30, () => {
      // Every creature that comes is struck down where it is (the explorer fights back at once).
      for (const m of sim.mobs) if (m.hostile && !m.dying && m.stateTime > 1) sim.kill(m);
    });
    // The first pack only after the first quiet stretch, then one after each quiet stretch.
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect(times[0]).toBeGreaterThanOrEqual(due0);
    const waves = times.filter((t, i) => i === 0 || t - times[i - 1] > 2);
    for (let i = 1; i < waves.length; i++) expect(waves[i] - waves[i - 1], `wave ${i}`).toBeGreaterThanOrEqual(huntQuiet(2, 0) * 0.75);
  });
});

describe('exploders are fair to strike', () => {
  it('struck down in the first instant of its fuse it only pops; once its tell has had time to read, it bursts', () => {
    const outcome = (after: number) => {
      const sim = new MobSim(env(), 21);
      sim.spawning = false;
      const c = ctx({ x: 20, z: 20 });
      const log = record(sim);
      const m = sim.spawn('sporeling', 20.5, FLOOR, 21.8)!;
      let struck = false;
      run(sim, c, 6, 1 / 30, () => {
        if (!struck && m.fused && sim.time - m.fuseAt >= after) {
          struck = true;
          sim.hit(m, 99, { from: c.eye });
        }
      });
      let sound: string | null = null;
      for (const e of log) if (e.type === 'sfx' && e.mob === m && (e.name === 'mob.boom' || e.name === 'mob.pop')) sound = e.name;
      return { struck, hurt: log.some((e) => e.type === 'attack' && e.landed && e.damage > 0 && e.mob === m), sound };
    };
    const quick = outcome(0.05);
    expect(quick.struck).toBe(true);
    expect(quick.hurt).toBe(false);
    expect(quick.sound).toBe('mob.pop');
    const late = outcome(0.5);
    expect(late.struck).toBe(true);
    expect(late.hurt).toBe(true);
    expect(late.sound).toBe('mob.boom');
  });
});

describe('hunters find the explorer round rock (the flow field)', () => {
  // A wall between them (x 30..31) with a way round its end (z 48 on).
  const walled = (x: number, y: number, z: number) => solid(x, y, z) || (x >= 30 && x <= 31 && z < 48);
  const walledEnv = (): MobEnv => ({ solid: walled, light: () => 0, inCamp: () => false, depthOf: (y) => 300 - y });

  it.each([
    ['icefang', 'a walker'],
    ['frostBat', 'a flier'],
    ['crawler', 'a crawler'],
  ] as const)('%s (%s) behind a wall comes round it to the explorer', (kind, what) => {
    void what;
    const sim = new MobSim(walledEnv(), 23);
    sim.spawning = false;
    const c = ctx({ x: 24, z: 40 });
    const fly = SPECIES[kind].locomotion === 'fly';
    const m = sim.spawn(kind, 36.5, fly ? FLOOR + 2.5 : FLOOR, 40.5)!;
    expect(m).not.toBeNull();
    let closest = Infinity;
    run(sim, c, 30, 1 / 30, () => {
      closest = Math.min(closest, Math.hypot(m.position.x - 24, m.position.z - 40));
    });
    expect(closest, `${kind} came round`).toBeLessThan(5);
  });
});

// QA 22:10: at striking range the lens was inside the Amber Matriarch (its model three times its
// capsule). Every guardian and big creature now keeps the explorer out of its drawn bulk.
describe('the explorer is kept out of a big body', () => {
  it("bodyExtent reads a model's bulk: the Matriarch is wider than its capsule, a serpent is long", async () => {
    const { bodyExtent, mobModel } = await import('../../src/render/mobs/models');
    const mat = bodyExtent(mobModel('amberMatriarch'));
    expect(mat.side).toBeGreaterThan(SPECIES.amberMatriarch.radius * 1.15);
    const wyrm = bodyExtent(mobModel('rimeWyrm'));
    expect(wyrm.back + wyrm.front).toBeGreaterThan(wyrm.side * 4);
    expect(mat.top).toBeGreaterThan(mat.bottom);
  });

  it('bodyPush puts the explorer on the edge of the body along the nearest way out, and leaves one outside alone', async () => {
    const { bodyPush } = await import('../../src/game/mobs/bodyPush');
    const b = { front: 2, back: 1, side: 1.5 };
    // Outside: nothing.
    expect(bodyPush(10, 0, 0, 0, 0, b, 0.4)).toBeNull();
    // Inside on its right flank (yaw 0: right is +x): out along +x to side + pad.
    const p = bodyPush(1, 0, 0, 0, 0, b, 0.4)!;
    expect(p.x).toBeCloseTo(0.9, 5);
    expect(p.z).toBeCloseTo(0, 5);
    // Ahead of it, turned to face +x (yaw pi/2): out along +x past its front (2 ahead: spine to 0.5, then 1.9).
    const q = bodyPush(1.5, 0, 0, 0, Math.PI / 2, b, 0.4)!;
    expect(1.5 + q.x).toBeCloseTo(0.5 + 1.9, 5);
    expect(Math.abs(q.z)).toBeLessThan(1e-6);
    // A long body: beside its tail, pushed sideways, not to its far end.
    const long = { front: 1, back: 5, side: 0.6 };
    const r = bodyPush(0.3, -3, 0, 0, 0, long, 0.4)!;
    expect(r.z).toBeCloseTo(0, 5);
    expect(0.3 + r.x).toBeCloseTo(1.0, 5);
    // Right on its spine: still out, to a side.
    const s = bodyPush(0, 0.2, 0, 0, 0, b, 0.4)!;
    expect(Math.hypot(s.x, s.z)).toBeGreaterThan(1);
  });
});

describe("a long guardian's charge lands at its front (the explorer is kept out of its bulk)", () => {
  it('the Magma Behemoth (3.2 m of body ahead of its centre) still lands its charges on an explorer it shoves', async () => {
    const { bodyExtent, mobModel } = await import('../../src/render/mobs/models');
    const { bodyPush } = await import('../../src/game/mobs/bodyPush');
    const e = bodyExtent(mobModel('magmaBehemoth'));
    const charges = (useBulk: boolean): number => {
      const sim = new MobSim(env(), 91);
      sim.spawning = false;
      sim.lairs = [lairOf('magmaBehemoth', 40, 22, 20)];
      const c = ctx({ x: 40, z: 36 });
      let landed = 0;
      let g: SimMob | undefined;
      sim.on((ev) => {
        if (ev.type === 'attack' && ev.landed && ev.mob === g && ev.mob.pattern === 'charge') landed++;
      });
      for (let t = 0; t < 120; t += 1 / 30) {
        sim.update(1 / 30, c);
        g ??= sim.mobs.find((m) => m.kind === 'magmaBehemoth');
        if (!g || g.dying) continue;
        // What the director does each frame (MobDirector.keepExplorerOut).
        g.body = useBulk ? { front: e.front * g.scale, back: e.back * g.scale, side: e.side * g.scale } : null;
        const p = bodyPush(c.player.x, c.player.z, g.position.x, g.position.z, g.yaw, { front: e.front * g.scale, back: e.back * g.scale, side: e.side * g.scale }, 0.43);
        if (p) {
          c.player.x += p.x;
          c.player.z += p.z;
          c.eye.x = c.player.x;
          c.eye.z = c.player.z;
        }
      }
      return landed;
    };
    const withBulk = charges(true);
    const capsuleOnly = charges(false);
    console.log(`[mobs] Magma Behemoth charges landed in 120 s on a shoved explorer: ${withBulk} (contact at its capsule only: ${capsuleOnly})`);
    expect(withBulk, 'charges that land').toBeGreaterThan(0);
    expect(capsuleOnly, 'charges landing with the capsule-only contact').toBeLessThan(withBulk);
  }, 60_000);
});

describe('a charge is fair: its contact is its drawn lane', () => {
  // The Thornback winds up toward the explorer 8 m off, its lane marked (it tracks the explorer for two
  // thirds of the wind-up, then the lane is locked); the explorer then stands still on the lane, or
  // steps sideways off it (the lane's half-width + 0.35 m from its line).
  const run1 = (offLane: boolean): { landed: number; half: number } => {
    const sim = new MobSim(env(), 23);
    sim.spawning = false;
    const c = ctx({ x: 20, z: 30 });
    const m = sim.spawn('thornback', 20.5, FLOOR, 22.5, { asleep: false })!;
    let landed = 0;
    let half = 0;
    sim.on((e) => {
      if (e.type === 'attack' && e.mob === m && e.landed) landed++;
    });
    let stepped = false;
    for (let t = 0; t < 12; t += 1 / 30) {
      sim.update(1 / 30, c);
      const mk = sim.markers.find((k) => k.owner === m.id && k.kind === 'line');
      if (mk && !stepped && mk.progress >= 0.7) {
        half = mk.r;
        stepped = true;
        if (offLane) {
          // Sideways off its line, beyond the drawn edge.
          const sx = -mk.dz;
          const sz = mk.dx;
          const along = (c.player.x - mk.x) * mk.dx + (c.player.z - mk.z) * mk.dz;
          c.player.x = mk.x + mk.dx * along + sx * (mk.r + 0.35);
          c.player.z = mk.z + mk.dz * along + sz * (mk.r + 0.35);
          c.eye.x = c.player.x;
          c.eye.z = c.player.z;
        }
      }
      if (stepped && !sim.markers.some((k) => k.owner === m.id && k.kind === 'line') && m.state !== 'attack' && m.state !== 'windup') break;
    }
    return { landed, half };
  };

  it('standing on the lane it is struck; one step off the drawn edge it misses', () => {
    const on = run1(false);
    const off = run1(true);
    expect(on.half).toBeGreaterThan(0.5);
    expect(on.landed, 'on the lane').toBeGreaterThan(0);
    expect(off.landed, 'off the lane').toBe(0);
  });
});

describe('a tap on what is drawn picks it', () => {
  it("a ray at the Magma Behemoth's head (3 m ahead of its centre, outside its capsule) picks it once its body is known", async () => {
    const { bodyExtent, mobModel } = await import('../../src/render/mobs/models');
    const e = bodyExtent(mobModel('magmaBehemoth'));
    const sim = new MobSim(env(), 3);
    sim.spawning = false;
    const g = sim.spawn('magmaBehemoth', 40.5, FLOOR, 20.5, { asleep: false })!;
    g.fade = 1;
    g.yaw = 0;
    // From the side, level with its body, aimed 2.9 m ahead of its centre (its head).
    const ray = { ox: 30, oy: g.position.y, oz: g.position.z + 2.9, dx: 1, dy: 0, dz: 0, maxDist: 30 };
    expect(sim.pick(ray), 'capsule only').toBeNull();
    g.body = { front: e.front * g.scale, back: e.back * g.scale, side: e.side * g.scale };
    expect(sim.pick(ray)?.id, 'with its drawn body').toBe(g.id);
    // A ray well clear of it still misses.
    expect(sim.pick({ ...ray, oz: g.position.z + 6 })).toBeNull();
  });
});
