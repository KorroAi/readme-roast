// MOBS (round 3): the tutorial's first fight called while the explorer stands in the camp (QA 21:29),
// proved on WORLD's real stratum I with its light volume, for several seeds: where the Tick stands
// (outside the camp and its margin, within the compass's 40 m, walking distance), that it waits 20 s
// at the edge while the explorer stays by the fire (never inside, never put away), then comes and
// strikes, told first, once the explorer steps out of the camp toward it.
// Usage: node tools/run-ts.mjs tools/mob-tutorial.ts [seeds=7,12345,777,4242,2024]
import { SOLID } from '../src/config/blocks';
import { loadZone } from '../src/world/gen/zoneLoader';
import { MobSim, type MobEnv } from '../src/game/mobs/MobSim';
import { spawnFirstFight } from '../src/game/mobs/spawner';
import { linkStrata, type StrataLayout } from '../src/game/mobs/strataLink';
import type { StratumLayout } from '../src/world/gen/strata/types';
import type { MobContext } from '../src/game/mobs/types';

export default async function main(args: string[]): Promise<void> {
  const seeds = (args[0] ?? '7,12345,777,4242,2024').split(',').map(Number);
  let ok = 0;
  for (const seed of seeds) {
    const zone = await loadZone(seed, () => undefined, 1, false);
    const l = zone.layout as unknown as StratumLayout & { camp?: { min: number[]; max: number[] } };
    const w = l.world;
    const light = zone.light;
    const camp = l.camp;
    if (!camp) {
      console.log(`seed ${seed}: no camp`);
      continue;
    }
    const inBox = (x: number, y: number, z: number, m: number) => x >= camp.min[0] - m && x <= camp.max[0] + m && y >= camp.min[1] - m && y <= camp.max[1] + m && z >= camp.min[2] - m && z <= camp.max[2] + m;
    const env: MobEnv = {
      solid: (x, y, z) => SOLID[w.get(x, y, z)] === 1,
      light: (x, y, z) => {
        if (!w.inBounds(x, y, z)) return 0;
        const i = w.index(x, y, z) * 4;
        const d = light.data;
        return Math.max(d[i], d[i + 1], d[i + 2]) / 255;
      },
      // The game's camp margin (MobDirector): nothing hostile within 4 m of the camp either.
      inCamp: (x, y, z) => inBox(x, y, z, 4),
      depthOf: (y) => 300 - y,
    };
    const sim = new MobSim(env, seed ^ 0x51);
    linkStrata(sim, l as unknown as StrataLayout, () => false);
    sim.spawning = false;
    // The explorer by the fire: the camp's middle (the nearest standing cell to it).
    const cx = Math.floor((camp.min[0] + camp.max[0]) / 2);
    const cz = Math.floor((camp.min[2] + camp.max[2]) / 2);
    let at: [number, number, number] | null = null;
    for (let r = 0; r < 10 && !at; r++)
      for (let dz = -r; dz <= r && !at; dz++)
        for (let dx = -r; dx <= r && !at; dx++)
          for (let y = camp.max[1]; y >= camp.min[1] - 2 && !at; y--) if (!env.solid(cx + dx, y, cz + dz) && !env.solid(cx + dx, y + 1, cz + dz) && env.solid(cx + dx, y - 1, cz + dz)) at = [cx + dx + 0.5, y, cz + dz + 0.5];
    if (!at) {
      console.log(`seed ${seed}: no floor in the camp`);
      continue;
    }
    const c: MobContext = {
      time: 0,
      player: { x: at[0], y: at[1], z: at[2], vx: 0, vz: 0 },
      eye: { x: at[0], y: at[1] + 1.62, z: at[2] },
      lantern: { x: at[0], y: at[1] + 1.2, z: at[2], radius: 11, flame: 1, lit: true, raised: false },
      depth: 0,
      atCamp: true,
      active: true,
      airborne: false,
    };
    sim.update(1 / 30, c);
    const tick = spawnFirstFight(sim, c);
    if (!tick) {
      console.log(`seed ${seed}: camp ${camp.max[0] - camp.min[0]}x${camp.max[2] - camp.min[2]} m: NO TICK`);
      continue;
    }
    const d0 = Math.hypot(tick.foot.x - at[0], tick.foot.z - at[2]);
    const path = sim.flow.distAt(Math.floor(tick.foot.x), Math.floor(tick.foot.y), Math.floor(tick.foot.z));
    const lit = env.light(Math.floor(tick.foot.x), Math.floor(tick.foot.y), Math.floor(tick.foot.z));
    const seen = sim.clearSight({ x: tick.position.x, y: tick.position.y + 0.3, z: tick.position.z }, c.eye);
    // 20 s by the fire.
    let inside = 0;
    for (let t = 0; t < 20; t += 1 / 30) {
      sim.update(1 / 30, c);
      if (inBox(tick.position.x, tick.position.y - 0.2, tick.position.z, 4)) inside++;
    }
    const waited = sim.mobs.includes(tick) && !tick.dying;
    const dWait = Math.hypot(tick.position.x - at[0], tick.position.z - at[2]);
    // Out of the camp toward it: the first cell of its way out beyond the margin.
    let out: [number, number, number] | null = null;
    const steps = 60;
    for (let k = 1; k <= steps && !out; k++) {
      const x = Math.floor(at[0] + ((tick.position.x - at[0]) * k) / steps);
      const z = Math.floor(at[2] + ((tick.position.z - at[2]) * k) / steps);
      for (let dy = 3; dy >= -4; dy--) {
        const y = Math.floor(at[1]) + dy;
        if (!env.solid(x, y, z) && !env.solid(x, y + 1, z) && env.solid(x, y - 1, z)) {
          if (!inBox(x + 0.5, y, z + 0.5, 4.5)) out = [x + 0.5, y, z + 0.5];
          break;
        }
      }
    }
    const told: string[] = [];
    sim.on((e) => {
      if ((e.type === 'telegraph' || e.type === 'attack') && e.mob === tick) told.push(e.type);
    });
    if (out) {
      c.player.x = c.eye.x = c.lantern.x = out[0];
      c.player.y = out[1];
      c.eye.y = out[1] + 1.62;
      c.lantern.y = out[1] + 1.2;
      c.player.z = c.eye.z = c.lantern.z = out[2];
      c.atCamp = false;
      for (let t = 0; t < 30 && !told.includes('attack'); t += 1 / 30) sim.update(1 / 30, c);
    }
    const fought = told.includes('attack') && told[0] === 'telegraph';
    const good = d0 < 40 && !inBox(tick.foot.x, tick.foot.y, tick.foot.z, 4) && inside === 0 && waited && fought;
    if (good) ok++;
    console.log(
      `seed ${seed}: camp ${camp.max[0] - camp.min[0]}x${camp.max[2] - camp.min[2]} m; the Tick ${d0.toFixed(1)} m from the fire (${path >= 0 ? `${path} steps' walk` : 'no walk!'}), light ${lit.toFixed(2)}, ${seen ? 'in sight' : 'out of sight'}; ` +
        `20 s by the fire: ${waited ? `waiting ${dWait.toFixed(1)} m off` : 'GONE'}, frames inside ${inside}; stepped out ${out ? `${Math.hypot(out[0] - at[0], out[2] - at[2]).toFixed(1)} m` : '(no way out found)'}: ${told.length ? told.slice(0, 4).join(' → ') : 'nothing'}${good ? '' : '  <-- CHECK'}`,
    );
  }
  console.log(`${ok}/${seeds.length} seeds: the Tick comes from beyond the camp, waits outside, and fights once the explorer steps out`);
}
