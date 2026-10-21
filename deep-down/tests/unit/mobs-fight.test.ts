import { describe, expect, it } from 'vitest';
import { MobSim, type MobEnv } from '../../src/game/mobs/MobSim';
import type { MobContext } from '../../src/game/mobs/types';

// Balance (round 2, MOBS): a pack of crawlers can be fought off with the Iron Machete (2 hp a blow,
// one blow every 0.32 s, 2.6 m reach) under a low flame, by an explorer who strikes whatever comes
// within reach, and the fight costs some health but not a life. The world: a flat 40 m hall.
const solid = (x: number, y: number, z: number) => y < 10 || y >= 18 || x < 0 || x >= 40 || z < 0 || z >= 40;
const env: MobEnv = { solid, light: () => 0, inCamp: () => false, depthOf: (y) => 150 - y };

function fight(seed: number, flame: number, chase: boolean): { time: number; damage: number; left: number } {
  const sim = new MobSim(env, seed);
  sim.spawning = false;
  const p = { x: 20, z: 20 };
  const ctx: MobContext = {
    time: 0, player: { x: p.x, y: 10, z: p.z, vx: 0, vz: 0 }, eye: { x: p.x, y: 11.62, z: p.z },
    lantern: { x: p.x - 0.3, y: 11.2, z: p.z + 0.3, radius: 11, flame, lit: true, raised: false }, depth: 140, atCamp: false, active: true,
  };
  let damage = 0;
  sim.on((e) => {
    if (e.type === 'attack' && e.landed) damage += e.damage;
  });
  const pack = [sim.spawn('crawler', 24, 10, 20)!, sim.spawn('crawler', 20, 10, 25)!, sim.spawn('crawler', 16, 10, 17)!];
  let cd = 0;
  let t = 0;
  const dt = 1 / 30;
  for (; t < 120; t += dt) {
    sim.update(dt, ctx);
    cd -= dt;
    const live = pack.filter((m) => !m.dying);
    if (live.length === 0) break;
    live.sort((a, b) => sim.distanceTo(a, ctx.eye.x, ctx.eye.y, ctx.eye.z) - sim.distanceTo(b, ctx.eye.x, ctx.eye.y, ctx.eye.z));
    const m = live[0];
    const d = sim.distanceTo(m, ctx.eye.x, ctx.eye.y, ctx.eye.z);
    if (d <= 2.6 && cd <= 0) {
      sim.hit(m, 2);
      cd = 0.32;
    } else if (chase && d > 2.6) {
      // Tap-to-walk toward it at walking pace.
      const dx = m.position.x - ctx.player.x;
      const dz = m.position.z - ctx.player.z;
      const l = Math.hypot(dx, dz) || 1;
      ctx.player.x += (dx / l) * 3.3 * dt;
      ctx.player.z += (dz / l) * 3.3 * dt;
      ctx.eye.x = ctx.player.x;
      ctx.eye.z = ctx.player.z;
      ctx.lantern.x = ctx.player.x - 0.3;
      ctx.lantern.z = ctx.player.z + 0.3;
    }
  }
  return { time: t, damage, left: pack.filter((m) => !m.dying).length };
}

describe('crawler pack balance', () => {
  it('a low flame: they come in, and an explorer who chases them with the machete wins, hurt but alive', () => {
    for (const seed of [1, 2, 3, 4]) {
      const r = fight(seed, 0.3, true);
      expect(r.left, `seed ${seed}`).toBe(0);
      expect(r.time).toBeLessThan(60);
      expect(r.damage).toBeLessThan(100);
    }
  });
  it('a full flame keeps them off: little damage, they are hard to reach', () => {
    const r = fight(5, 1, false);
    expect(r.damage).toBeLessThan(30);
  });
});
