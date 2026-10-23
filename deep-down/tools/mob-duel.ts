// MOBS (round 3): a guardian duel in the real simulation (its brain, patterns, phases, open guard,
// brood, shots and waves; the explorer kept out of its drawn body as in the game), the explorer
// scripted like a fair player: it keeps ~4.5 m off, and for each tell read (probability `dodge`)
// steps off a charge's lane, out of a slam's disc, sideways from a volley or a dive after a 0.35 s
// reaction, dashes (i-frames) 0.25 s after a charge, a volley or a dive is unleashed, jumps a
// shockwave, backs off a brood exploder's told fuse (or strikes it first); it strikes the open guard
// (and a brood minion at hand) with a weapon of config/weapons at its rate. Reports the time to win,
// the damage taken (by source), the deaths.
// Usage: node tools/run-ts.mjs tools/mob-duel.ts [guardian=amberMatriarch] [weapons=pick,machete,sword] [dodges=0.5,0.8] [runs=12]
//        node tools/run-ts.mjs tools/mob-duel.ts --plan [runs=12] [read=0.8] [kinds]   (the descent plan's gear, every guardian)
//   env: MOB_HP (100), MOB_ARMOUR (0..0.45, config/armour), MOB_NODASH=1 (walks off lanes), MOB_LOCK (a lane lock to try)
import { MobSim, type MobEnv, type SimMob } from '../src/game/mobs/MobSim';
import { SPECIES } from '../src/game/mobs/species';
import { bodyPush } from '../src/game/mobs/bodyPush';
import { BROOD, LANE_LOCK, VOLLEY, setLaneLock } from '../src/game/mobs/guardian';
import { bodyExtent, mobModel } from '../src/render/mobs/models';
import { WEAPONS, bestWeapon, type WeaponId } from '../src/config/weapons';
import { ROSTERS } from '../src/game/mobs/rosters';
import { GUARDIAN_KINDS } from '../src/game/mobs/species';
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

/** What the explorer brings: a weapon, health and armour, and consumables (healing, bombs). */
interface Gear {
  weapon: WeaponId;
  hp: number;
  armour: number;
  /** Healing items and what each gives back (draughts +70; stratum I's bandages +20). */
  heals: number;
  heal: number;
  /** Blast bombs (config/weapons bomb: 18, thrown at its open guard within 14 m, one a second). */
  bombs: number;
}

function duel(kind: GuardianKind, gear: Gear, dodge: number, seed: number): Duel {
  const weapon = gear.weapon;
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
  let hp = gear.hp;
  let heals = gear.heals;
  let bombs = gear.bombs;
  let healCd = 0;
  let bombCd = 0;
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
  // Every marker of its blows that appears over the explorer (a slam's or an emergence's disc, a
  // dive's mark, an eruption line) is read with probability `dodge`: 0.3 s later the explorer dashes
  // (if it can) or runs out of it.
  const seenMarks = new Set<number>();
  let escape: { at: number; x: number; z: number; dash: boolean } | null = null;
  const lanes: Array<{ mk: { id: number; x: number; z: number; dx: number; dz: number; r: number; len: number; progress: number }; read: boolean; lock: number }> = [];
  let dodgeUntil = -1;
  let lastSpit = -1;
  let salvoDash = -1;
  sim.on((e) => {
    if (e.type === 'attack' && e.landed) {
      const dmg = e.damage * (1 - gear.armour);
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
      wantDash = dodges && (e.mob.pattern === 'charge' || e.mob.pattern === 'dive');
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
    // Its blows and its brood's: a new disc or mark over the explorer is read at once (out of it 0.3 s
    // later); a lane (a brood charger's, an eruption line) once it locks (0.25 s later, off it).
    const byBrood = (id: number) => sim.mobs.some((o) => o.id === id && o.owner === g!.id);
    for (const mk of sim.markers) {
      if (seenMarks.has(mk.id) || (mk.kind !== 'disc' && mk.kind !== 'target' && mk.kind !== 'line')) continue;
      if (mk.owner !== g.id && !byBrood(mk.owner)) continue;
      if (mk.kind === 'line' && mk.owner === g.id && g.pattern === 'charge') continue;
      seenMarks.add(mk.id);
      if (mk.kind === 'line') {
        lanes.push({ mk, read: rnd() < dodge, lock: mk.owner === g.id ? LOCK : 0.66 });
        continue;
      }
      const ox = c.player.x - mk.x;
      const oz = c.player.z - mk.z;
      const dd = Math.hypot(ox, oz);
      if (dd > mk.r + 0.4 || rnd() >= dodge) continue;
      // (Right on its centre, as an emergence's disc is: out any way, here away from the guardian.)
      let ux = ox;
      let uz = oz;
      if (dd < 0.3) {
        ux = c.player.x - g.position.x;
        uz = c.player.z - g.position.z;
        if (Math.hypot(ux, uz) < 0.3) {
          ux = Math.sin(rnd() * 6.283);
          uz = Math.cos(rnd() * 6.283);
        }
      }
      const l = Math.max(0.01, Math.hypot(ux, uz));
      escape = { at: sim.clock + 0.3, x: mk.x + (ux / l) * (mk.r + 1.0), z: mk.z + (uz / l) * (mk.r + 1.0), dash: true };
    }
    for (let i = lanes.length - 1; i >= 0; i--) {
      const ln = lanes[i];
      if (!sim.markers.includes(ln.mk)) {
        lanes.splice(i, 1);
        continue;
      }
      if (ln.mk.progress < ln.lock) continue;
      lanes.splice(i, 1);
      if (!ln.read) continue;
      const mk = ln.mk;
      const ox = c.player.x - mk.x;
      const oz = c.player.z - mk.z;
      const along = ox * mk.dx + oz * mk.dz;
      const lat = -ox * mk.dz + oz * mk.dx;
      if (along < -0.5 || along > mk.len + 0.5 || Math.abs(lat) > mk.r + 0.4) continue;
      const sgn = lat >= 0 ? 1 : -1;
      const off = mk.r + 1.0 - Math.abs(lat);
      escape = { at: sim.clock + 0.25, x: c.player.x - mk.dz * sgn * off, z: c.player.z + mk.dx * sgn * off, dash: true };
    }
    if (escape && sim.clock >= escape.at) {
      const ex = escape.x - c.player.x;
      const ez = escape.z - c.player.z;
      const el = Math.hypot(ex, ez);
      if (escape.dash && dashCd <= 0 && el > 0.3 && !NODASH) {
        dashDir.x = ex / el;
        dashDir.z = ez / el;
        dashLeft = 0.17;
        iframes = 0.32;
        dashCd = 1.1;
      }
      dodgeTo = { x: escape.x, z: escape.z };
      dodgeUntil = sim.clock + 1.2;
      escape = null;
    }
    // A salvo of shots (its volley's, a brood spitter's) flying at the explorer, read: a dash 0.25 s after it is loosed.
    let loosed = false;
    for (const sp of sim.spits) {
      if (sp.id <= lastSpit) continue;
      lastSpit = Math.max(lastSpit, sp.id);
      if (sp.owner === g || sp.owner.owner === g.id) loosed = true;
    }
    if (loosed && rnd() < dodge) salvoDash = sim.clock + 0.25;
    if (salvoDash >= 0 && sim.clock >= salvoDash && dashCd <= 0 && !NODASH) {
      salvoDash = -1;
      const ddx = c.player.x - g.position.x;
      const ddz = c.player.z - g.position.z;
      const l = Math.max(0.01, Math.hypot(ddx, ddz));
      const sgn = rnd() < 0.5 ? 1 : -1;
      dashDir.x = (-ddz / l) * sgn;
      dashDir.z = (ddx / l) * sgn;
      dashLeft = 0.17;
      iframes = 0.32;
      dashCd = 1.1;
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
    if (dodgeTo && (g.state === 'windup' || g.state === 'attack' || g.state === 'burrow' || sim.clock < dodgeUntil)) {
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
    // A healing item when low (one every 2 s).
    healCd -= dt;
    if (heals > 0 && healCd <= 0 && hp < gear.hp * 0.35) {
      heals--;
      hp = Math.min(gear.hp, hp + gear.heal);
      healCd = 2;
    }
    // A blast bomb at its open guard (in place of a swing).
    bombCd -= dt;
    if (bombs > 0 && bombCd <= 0 && open && Math.hypot(gx - c.player.x, gz - c.player.z) <= 14) {
      bombs--;
      sim.hit(g, WEAPONS.bomb.damage, { weapon: 'bomb', blast: true, from: { x: c.eye.x, y: c.eye.y, z: c.eye.z } });
      bombCd = WEAPONS.bomb.rate;
      swingIn = Math.max(swingIn, WEAPONS.bomb.rate);
    }
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

/**
 * The descent plan's gear by stratum (src/game/craft/economy.ts DESCENT_PLAN, LOOP): the weapons made
 * so far (the game's weapon: config/weapons bestWeapon, the best melee by damage per second), the
 * armour set of the band (config/armour: miner 15 % and +20 hp in I-III, fur 22 % in IV, bog 28 % in
 * V, ember 35 % and +30 hp in VI) and the stratum's consumables (I: 4 bandages +20; II-VI: healing
 * draughts +70: 3, 3, 2, 3, 4; blast bombs: 4 in III and V).
 */
const PLAN: Record<number, { weapons: WeaponId[]; hp: number; armour: number; heals: number; heal: number; bombs: number }> = {
  1: { weapons: ['machete', 'sling'], hp: 120, armour: 0.15, heals: 4, heal: 20, bombs: 0 },
  2: { weapons: ['machete', 'sling', 'spear'], hp: 120, armour: 0.15, heals: 3, heal: 70, bombs: 0 },
  3: { weapons: ['machete', 'sling', 'spear', 'sword', 'crossbow'], hp: 120, armour: 0.15, heals: 3, heal: 70, bombs: 4 },
  4: { weapons: ['machete', 'sling', 'spear', 'sword', 'crossbow', 'crystalSpear'], hp: 100, armour: 0.22, heals: 2, heal: 70, bombs: 0 },
  5: { weapons: ['machete', 'sling', 'spear', 'sword', 'crossbow', 'crystalSpear', 'greatAxe'], hp: 100, armour: 0.28, heals: 3, heal: 70, bombs: 4 },
  6: { weapons: ['machete', 'sling', 'spear', 'sword', 'crossbow', 'crystalSpear', 'greatAxe', 'emberCrossbow', 'sunLance'], hp: 130, armour: 0.35, heals: 4, heal: 70, bombs: 0 },
};

function stratumOf(kind: GuardianKind): number {
  const b = SPECIES[kind].biome;
  return b === 'heart' ? 6 : ROSTERS[b as keyof typeof ROSTERS].stratum;
}

function planGear(kind: GuardianKind, withConsumables: boolean): Gear {
  const p = PLAN[stratumOf(kind)];
  return { weapon: bestWeapon(p.weapons).id, hp: p.hp, armour: p.armour, heals: withConsumables ? p.heals : 0, heal: p.heal, bombs: withConsumables ? p.bombs : 0 };
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

/**
 * The guardians as they were when the lead asked for the rebalance (00:10, Oct 23): `--before` puts
 * these back for a measurement (the brood at full strength, 2 + phase a call; salvos 0.4 s apart;
 * the defs' numbers below), so before and after are measured by the same model.
 */
const BEFORE_DEFS: Partial<Record<GuardianKind, { hp?: number; damage?: number; shot?: { damage?: number; count?: number } }>> = {};
function useBefore(): void {
  Object.assign(BROOD, { hp: 1, power: 1, scale: 1, firstBlow: 0, most: 3, base: 2 });
  VOLLEY.every = 0.4;
  for (const [k, v] of Object.entries(BEFORE_DEFS)) {
    const d = SPECIES[k as GuardianKind] as unknown as { hp: number; damage: number; shot?: { damage: number; count: number } };
    if (v.hp !== undefined) d.hp = v.hp;
    if (v.damage !== undefined) d.damage = v.damage;
    if (v.shot && d.shot) Object.assign(d.shot, v.shot);
  }
}

/** `--plan [runs] [read share] [kinds] [--before]`: every guardian with its stratum's gear, without and with consumables. */
async function planTable(args: string[]): Promise<void> {
  if (args.includes('--before')) {
    useBefore();
    args = args.filter((x) => x !== '--before');
    console.log('(the guardians as they were before the rebalance)');
  }
  const runs = Number(args[0] ?? 12);
  const read = Number(args[1] ?? 0.8);
  const kinds = args[2] ? (args[2].split(',') as GuardianKind[]) : [...GUARDIAN_KINDS];
  console.log(`MOBS duels on the descent plan's gear, a player reading ${Math.round(read * 100)} % of the tells, ${runs} runs each (won / median time / median hp lost of those who won; consumables: the stratum's heals and bombs)`);
  for (const kind of kinds) {
    const st = stratumOf(kind);
    const row: string[] = [];
    for (const withC of [false, true]) {
      const gear = planGear(kind, withC);
      const rs: Duel[] = [];
      for (let k = 0; k < runs; k++) rs.push(duel(kind, gear, read, 1000 + k * 7919));
      const won = rs.filter((r) => r.won);
      row.push(`${withC ? 'with' : 'without'}: ${won.length}/${runs} won, ${median(won.map((r) => r.seconds)).toFixed(0)} s, ${median(won.map((r) => r.taken)).toFixed(0)} hp lost`);
      if (!withC) {
        const by: Record<string, number> = {};
        for (const r of rs) for (const [k2, v] of Object.entries(r.by)) by[k2] = (by[k2] ?? 0) + v / rs.length;
        row.push(`[hurt by ${Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k2, v]) => `${k2} ${v.toFixed(0)}`).join(', ')}]`);
      }
    }
    const g = planGear(kind, false);
    console.log(`  ${st} ${kind.padEnd(15)} ${String(SPECIES[kind].hp).padStart(4)} hp vs ${g.weapon} ${g.hp} hp ${Math.round(g.armour * 100)} %: ${row.join(' | ')}`);
  }
}

export default async function main(args: string[]): Promise<void> {
  if (args[0] === '--plan') return planTable(args.slice(1));
  const kind = (args[0] ?? 'amberMatriarch') as GuardianKind;
  const weapons = (args[1] ?? 'pick,machete,sword').split(',') as WeaponId[];
  const dodges = (args[2] ?? '0.5,0.8').split(',').map(Number);
  const runs = Number(args[3] ?? 12);
  console.log(`MOBS duel: ${kind} (${SPECIES[kind].hp} hp, ${SPECIES[kind].damage} a blow), ${runs} runs each, 300 s at most, explorer ${HP} hp, armour ${Math.round(ARMOUR * 100)} %`);
  for (const wid of weapons) {
    for (const dg of dodges) {
      const rs: Duel[] = [];
      for (let k = 0; k < runs; k++) rs.push(duel(kind, { weapon: wid, hp: HP, armour: ARMOUR, heals: 0, heal: 70, bombs: 0 }, dg, 1000 + k * 7919));
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
