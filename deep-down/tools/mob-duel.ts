// MOBS (round 3): a guardian duel in the real simulation (its brain, patterns, phases, open guard,
// brood, shots and waves; the explorer kept out of its drawn body as in the game), the explorer
// scripted like a fair player: it keeps ~4.5 m off, and for each tell read (probability `dodge`)
// steps off a charge's lane, out of a slam's disc, sideways from a volley or a dive after a 0.35 s
// reaction, dashes (i-frames) 0.25 s after a charge, a volley or a dive is unleashed, jumps a
// shockwave, backs off a brood exploder's told fuse (or strikes it first); it strikes the open guard
// (and a brood minion at hand) with a weapon of config/weapons at its rate. Reports the time to win,
// the damage taken (by source), the deaths.
// Usage: node tools/run-ts.mjs tools/mob-duel.ts [guardian=amberMatriarch] [weapons=pick,machete,sword] [dodges=0.5,0.8] [runs=12]
//   env: MOB_HP (100), MOB_ARMOUR (0..0.45, config/armour), MOB_NODASH=1 (walks off lanes), MOB_LOCK (a lane lock to try)
import { MobSim, type MobEnv, type SimMob } from '../src/game/mobs/MobSim';
import { SPECIES } from '../src/game/mobs/species';
import { bodyPush } from '../src/game/mobs/bodyPush';
import { LANE_LOCK, setLaneLock } from '../src/game/mobs/guardian';
import { bodyExtent, mobModel } from '../src/render/mobs/models';
import { WEAPONS, type WeaponId } from '../src/config/weapons';
import type { Lair } from '../src/game/mobs/spawner';
import type { GuardianKind, MobContext } from '../src/game/mobs/types';

const FLOOR = 10;
/** Where a guardian's lane stops following the explorer (guardian.ts LANE_LOCK; MOB_LOCK to try another). */
if (process.env.MOB_LOCK) setLaneLock(Number(process.env.MOB_LOCK));
const LOCK = LANE_LOCK;
/** MOB_NODASH=1: the explorer walks off a locked lane instead of dashing (a phone player's dodge). */
const NODASH = process.env.MOB_NODASH === '1';
/** The explorer's health and armour (config/armour: the set's share of creature damage taken away). */
const HP = Number(process.env.MOB_HP ?? 100);
const ARMOUR = Number(process.env.MOB_ARMOUR ?? 0);
const solid = (x: number, y: number, z: number): boolean => y < FLOOR || y >= 26 || x < 0 || x >= 90 || z < 0 || z >= 90;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Duel {
  /** Damage taken by source: its patterns ('charge', 'volley'...), 'brood', 'other'. */
  by: Record<string, number>;
  won: boolean;
  died: boolean;
  seconds: number;
  taken: number;
  blows: number;
  dodged: number;
  told: number;
}

function duel(kind: GuardianKind, weapon: WeaponId, dodge: number, seed: number): Duel {
  const rnd = mulberry(seed);
  const env: MobEnv = { solid, light: () => 0, inCamp: () => false, depthOf: (y) => 300 - y };
  const sim = new MobSim(env, seed);
  sim.spawning = false;
  const lair: Lair = { id: `l-${kind}`, biome: SPECIES[kind].biome, guardian: kind, x: 45, y: FLOOR, z: 40, radius: 18, sx: 45, sy: FLOOR, sz: 40 };
  sim.lairs = [lair];
  const p = { x: 45, y: FLOOR, z: 62 };
  const c: MobContext = {
    time: 0,
    player: { x: p.x, y: FLOOR, z: p.z, vx: 0, vz: 0 },
    eye: { x: p.x, y: FLOOR + 1.62, z: p.z },
    lantern: { x: p.x, y: FLOOR + 1.2, z: p.z, radius: 11, flame: 1, lit: true, raised: false },
    depth: 200,
    atCamp: false,
    active: true,
    airborne: false,
  };
  const w = WEAPONS[weapon];
  const out: Duel = { by: {}, won: false, died: false, seconds: 0, taken: 0, blows: 0, dodged: 0, told: 0 };
  let hp = HP;
  let g: SimMob | undefined;
  // A pending reaction to a tell: when, and whether this one is dodged.
  let react: { at: number; dodge: boolean; done: boolean } | null = null;
  let dodgeTo: { x: number; z: number } | null = null;
  let jumpFor = 0;
  let swingIn = 0;
  // The dash (fp/constants: 13 m/s for 0.17 s, i-frames 0.32 s, 1.1 s cooldown): through a charge, a
  // volley or a dive, 0.25 s after it is unleashed, sideways.
  let wantDash = false;
  let unleashed = -1;
  let dashLeft = 0;
  let iframes = 0;
  let dashCd = 0;
  const dashDir = { x: 0, z: 0 };
  const fuses: SimMob[] = [];
  sim.on((e) => {
    if (e.type === 'attack' && e.landed) {
      const dmg = e.damage * (1 - ARMOUR);
      hp -= dmg;
      out.taken += dmg;
      out.blows++;
      const src = g && e.mob === g ? (g.pattern ?? 'other') : e.mob.owner ? 'brood' : 'other';
      out.by[src] = (out.by[src] ?? 0) + dmg;
    }
    // A brood exploder's fuse (told): back off out of its blast (or strike it first), when read.
    if (e.type === 'telegraph' && g && e.mob !== g && e.mob.def.blast && rnd() < dodge) fuses.push(e.mob);
    if (e.type === 'telegraph' && g && e.mob === g) {
      out.told++;
      const dodges = rnd() < dodge;
      react = { at: sim.clock + 0.35, dodge: dodges, done: false };
      wantDash = dodges && (e.mob.pattern === 'charge' || e.mob.pattern === 'volley' || e.mob.pattern === 'dive');
      unleashed = -1;
    }
  });
  const dt = 1 / 30;
  const e = bodyExtent(mobModel(kind));
  const speed = 4.2;
  for (let t = 0; t < 300; t += dt) {
    c.time = t;
    sim.update(dt, c);
    out.seconds = t;
    if (hp <= 0) {
      out.died = true;
      break;
    }
    g ??= sim.mobs.find((m) => m.kind === kind);
    if (!g) continue;
    if (g.dying) {
      out.won = true;
      break;
    }
    // The director's part: its drawn body, the explorer kept out of it.
    g.body = { front: e.front * g.scale, back: e.back * g.scale, side: e.side * g.scale };
    // The reaction, once due: where to step (or a jump for a wave).
    const r: { at: number; dodge: boolean; done: boolean } | null = react;
    if (r && !r.done && sim.clock >= r.at) {
      r.done = true;
      if (r.dodge) {
        out.dodged++;
        const mk = sim.markers.find((k) => k.owner === g!.id);
        const pat = g.pattern;
        if (mk && mk.kind === 'line' && pat !== 'charge') {
          // Off the lane: perpendicular, to the nearer side, past its edge.
          const along = (c.player.x - mk.x) * mk.dx + (c.player.z - mk.z) * mk.dz;
          const sx = -mk.dz;
          const sz = mk.dx;
          const side = (c.player.x - mk.x) * sx + (c.player.z - mk.z) * sz >= 0 ? 1 : -1;
          dodgeTo = { x: mk.x + mk.dx * along + sx * side * (mk.r + 0.9), z: mk.z + mk.dz * along + sz * side * (mk.r + 0.9) };
        } else if (mk && (mk.kind === 'disc' || mk.kind === 'target')) {
          const dx = c.player.x - mk.x;
          const dz = c.player.z - mk.z;
          const l = Math.max(0.01, Math.hypot(dx, dz));
          dodgeTo = { x: mk.x + (dx / l) * (mk.r + 1.0), z: mk.z + (dz / l) * (mk.r + 1.0) };
        } else if (pat === 'volley' || pat === 'dive' || !mk) {
          const dx = c.player.x - g.position.x;
          const dz = c.player.z - g.position.z;
          const l = Math.max(0.01, Math.hypot(dx, dz));
          const s = rnd() < 0.5 ? 1 : -1;
          dodgeTo = { x: c.player.x - (dz / l) * 2.6 * s, z: c.player.z + (dx / l) * 2.6 * s };
        }
        if (pat === 'ring' || (pat === 'slam' && g.phase >= 2)) jumpFor = -1;
      }
    }
    // The dash: a charge's 0.25 s after its lane locks (its marker stops following), off the lane;
    // a volley's or a dive's 0.25 s after it is unleashed, sideways.
    const lane = g.pattern === 'charge' ? sim.markers.find((k) => k.owner === g!.id && k.kind === 'line') : undefined;
    if (wantDash && unleashed < 0 && (lane ? lane.progress >= LOCK : g.state === 'attack')) unleashed = sim.clock;
    if (wantDash && unleashed >= 0 && sim.clock >= unleashed + 0.25 && dashCd <= 0) {
      wantDash = false;
      let s = rnd() < 0.5 ? 1 : -1;
      if (lane) {
        // Away from the lane's line, to the side the explorer already stands on.
        const sx = -lane.dz;
        const sz = lane.dx;
        s = (c.player.x - lane.x) * sx + (c.player.z - lane.z) * sz >= 0 ? 1 : -1;
        dashDir.x = sx * s;
        dashDir.z = sz * s;
        dodgeTo = { x: c.player.x + sx * s * 3, z: c.player.z + sz * s * 3 };
      } else {
        const ddx = c.player.x - g.position.x;
        const ddz = c.player.z - g.position.z;
        const l = Math.max(0.01, Math.hypot(ddx, ddz));
        dashDir.x = (-ddz / l) * s;
        dashDir.z = (ddx / l) * s;
      }
      if (!NODASH) {
        dashLeft = 0.17;
        iframes = 0.32;
        dashCd = 1.1;
      }
    }
    c.invulnerable = iframes > 0;
    iframes = Math.max(0, iframes - dt);
    dashCd = Math.max(0, dashCd - dt);
    // A shockwave near: jump it (when this tell was read).
    c.airborne = false;
    if (jumpFor !== 0) {
      for (const wv of sim.markers) {
        if (wv.kind !== 'wave' || wv.owner !== g.id) continue;
        const flat = Math.hypot(c.player.x - wv.x, c.player.z - wv.z);
        if (Math.abs(flat - wv.r) < 1.3) c.airborne = true;
      }
      if (!sim.markers.some((k) => k.kind === 'wave' && k.owner === g!.id) && g.state !== 'windup' && g.state !== 'attack') jumpFor = 0;
    }
    // Where to go: a dodge, the open guard, a minion at hand, else 4.5 m off.
    const gx = g.position.x;
    const gz = g.position.z;
    const dx = c.player.x - gx;
    const dz = c.player.z - gz;
    const d = Math.max(0.01, Math.hypot(dx, dz));
    let tx: number;
    let tz: number;
    const open = g.vulnerable && (g.state === 'recoil' || g.state === 'stunned');
    for (let i = fuses.length - 1; i >= 0; i--) if (fuses[i].dying || !sim.mobs.includes(fuses[i])) fuses.splice(i, 1);
    const fuse = fuses[0];
    if (dodgeTo && (g.state === 'windup' || g.state === 'attack')) {
      tx = dodgeTo.x;
      tz = dodgeTo.z;
    } else if (fuse) {
      // Out of its blast, away from it.
      const fx = c.player.x - fuse.position.x;
      const fz = c.player.z - fuse.position.z;
      const fl = Math.max(0.01, Math.hypot(fx, fz));
      const want = (fuse.def.blast ?? 2) + 1.2;
      tx = fuse.position.x + (fx / fl) * want;
      tz = fuse.position.z + (fz / fl) * want;
    } else {
      dodgeTo = null;
      const want = open ? Math.max(1.2, g.body.side + 0.6) : 4.5;
      tx = gx + (dx / d) * want;
      tz = gz + (dz / d) * want;
    }
    const mx = tx - c.player.x;
    const mz = tz - c.player.z;
    const ml = Math.hypot(mx, mz);
    if (dashLeft > 0) {
      c.player.x += dashDir.x * 13 * dt;
      c.player.z += dashDir.z * 13 * dt;
      dashLeft -= dt;
    } else if (ml > 0.05) {
      const step = Math.min(ml, speed * dt);
      c.player.x += (mx / ml) * step;
      c.player.z += (mz / ml) * step;
    }
    const push = bodyPush(c.player.x, c.player.z, gx, gz, g.yaw, g.body, 0.43);
    if (push) {
      c.player.x += push.x;
      c.player.z += push.z;
    }
    c.player.x = Math.max(1.5, Math.min(88.5, c.player.x));
    c.player.z = Math.max(1.5, Math.min(88.5, c.player.z));
    c.eye.x = c.lantern.x = c.player.x;
    c.eye.z = c.lantern.z = c.player.z;
    c.look = { x: -dx / d, y: 0, z: -dz / d };
    // Swings: the open guard first, else a brood minion within reach, at the weapon's rate.
    swingIn -= dt;
    if (swingIn <= 0) {
      const reachOf = (m: SimMob) => Math.hypot(m.position.x - c.eye.x, m.position.y - c.eye.y, m.position.z - c.eye.z) - m.bounds.radius;
      let target: SimMob | null = null;
      // A fusing one in reach first (before it pops), then the open guard, then a minion at hand.
      const f = fuses.find((m) => reachOf(m) <= w.reach);
      if (f) target = f;
      else if (open && reachOf(g) <= w.reach) target = g;
      else if (!open) for (const m of sim.mobs) if (m !== g && m.hostile && !m.dying && reachOf(m) <= w.reach) target = m;
      if (target) {
        sim.hit(target, w.damage, { weapon, from: { x: c.eye.x, y: c.eye.y, z: c.eye.z } });
        swingIn = w.rate;
      }
    }
  }
  return out;
}

export default async function main(args: string[]): Promise<void> {
  const kind = (args[0] ?? 'amberMatriarch') as GuardianKind;
  const weapons = (args[1] ?? 'pick,machete,sword').split(',') as WeaponId[];
  const dodges = (args[2] ?? '0.5,0.8').split(',').map(Number);
  const runs = Number(args[3] ?? 12);
  console.log(`MOBS duel: ${kind} (${SPECIES[kind].hp} hp, ${SPECIES[kind].damage} a blow), ${runs} runs each, 300 s at most, explorer ${HP} hp, armour ${Math.round(ARMOUR * 100)} %`);
  for (const wid of weapons) {
    for (const dg of dodges) {
      const rs: Duel[] = [];
      for (let k = 0; k < runs; k++) rs.push(duel(kind, wid, dg, 1000 + k * 7919));
      const won = rs.filter((r) => r.won);
      const died = rs.filter((r) => r.died).length;
      const med = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
      console.log(
        `  ${wid.padEnd(8)} dodging ${Math.round(dg * 100)} % of the tells: won ${won.length}/${runs}, died ${died}, ` +
          `time to win median ${med(won.map((r) => r.seconds)).toFixed(0)} s, damage taken median ${med(rs.map((r) => r.taken)).toFixed(0)} (won: ${med(won.map((r) => r.taken)).toFixed(0)}), ` +
          `tells median ${med(rs.map((r) => r.told)).toFixed(0)}`,
      );
      const by: Record<string, number> = {};
      for (const r of rs) for (const [k, v] of Object.entries(r.by)) by[k] = (by[k] ?? 0) + v / rs.length;
      console.log(`           damage a run by source: ${Object.entries(by).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ')}`);
    }
  }
}
