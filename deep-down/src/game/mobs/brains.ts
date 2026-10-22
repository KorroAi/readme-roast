import { MOBS_RULES } from './config';
import { floorNear, flyStep, walkStep } from './nav';
import type { MobSim, SimMob } from './MobSim';
import type { MobContext } from './types';

/**
 * The round 3 archetype brains (MOBS; BRIEF §0.5): pack swarmers, chargers, spitters, ceiling
 * droppers, divers, burrowers, brutes and exploders. Every attack is telegraphed: a wind-up with
 * its voice and pose, and for the area blows a marker on the ground (MobSim.markers) that fills
 * as the blow comes. Each brain reads its numbers from the species (damage, wind-up, reach, rush,
 * blast, shot), so one brain serves many kinds skinned per biome.
 */
export function runBrain(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  idleVoice(sim, m, dt, ctx);
  switch (m.brain) {
    case 'pack':
      return pack(sim, m, dt, ctx);
    case 'charge':
      return charge(sim, m, dt, ctx);
    case 'spit':
      return spit(sim, m, dt, ctx);
    case 'drop':
      return drop(sim, m, dt, ctx);
    case 'dive':
      return dive(sim, m, dt, ctx);
    case 'dig':
      return dig(sim, m, dt, ctx);
    case 'slam':
      return slam(sim, m, dt, ctx);
    case 'fuse':
      return fuse(sim, m, dt, ctx);
    default:
      return;
  }
}

/** A dropper down on the rock fights like a crawler. */
export function crawlerGround(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  idleVoice(sim, m, dt, ctx);
  sim.crawler(m, dt, ctx);
}

/** Now and then a creature near the explorer makes its sound (heard before it is seen). */
function idleVoice(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const v = m.def.voice.idle;
  if (!v) return;
  m.timer2 -= dt;
  if (m.timer2 > 0) return;
  m.timer2 = 4 + sim.rng.range(0, 5);
  if (sim.distToPlayer(m, ctx) < 16 && m.state !== 'windup' && m.state !== 'attack') sim.sfx(m, v);
}

const away = { x: 0, z: 0 };

/** A point `d` m from the explorer on the far side from the mob (to back off toward). */
function backOff(m: SimMob, ctx: MobContext, d: number): { x: number; z: number } {
  const dx = m.foot.x - ctx.player.x;
  const dz = m.foot.z - ctx.player.z;
  const l = Math.max(0.01, Math.hypot(dx, dz));
  away.x = m.foot.x + (dx / l) * d;
  away.z = m.foot.z + (dz / l) * d;
  return away;
}

/** Its wind-up (s): a swift elite's is shorter, never under 0.35 s (every blow stays told). */
function windupTime(m: SimMob): number {
  return Math.max(Math.min(m.def.windup, 0.35), m.def.windup * m.tempo);
}

// ---------------------------------------------------------------------------------------
// Pack swarmers: circle, and nip in one at a time (the pack takes turns).

function pack(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const dp = sim.flatDist(m, ctx);
  const l = ctx.lantern;
  const bright = sim.brightRadius(ctx);
  const dl = Math.hypot(m.position.x - l.x, m.position.z - l.z);
  sim.announce(m, ctx);
  const d = m.def;
  switch (m.state) {
    case 'windup':
      sim.face(m, ctx, dt, 10);
      sim.walkerSettle(m, dt);
      if (m.stateTime >= windupTime(m)) {
        m.setState('attack');
        m.landed = false;
      }
      return;
    case 'attack': {
      sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed * 2.4, dt);
      if (!m.landed && sim.distToPlayer(m, ctx) <= d.reach + m.bounds.radius * 0.5) {
        m.landed = true;
        sim.strikePlayer(m, d.damage);
        m.cooldown = d.cooldown;
        sim.recoil(m, 0.9);
      } else if (m.stateTime > 1.1) {
        if (!m.landed) sim.emit({ type: 'attack', mob: m, damage: 0, landed: false });
        m.cooldown = d.cooldown * 0.6;
        sim.recoil(m, 0.7);
      }
      return;
    }
    case 'recoil':
    case 'flee': {
      const b = backOff(m, ctx, 4);
      sim.walkToward(m, b.x, b.z, d.speed * 1.3, dt);
      if (m.stateTime >= (m.timer || 0.8)) m.setState('stalk');
      return;
    }
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      const ring = Math.max(2.4, Math.min(5, bright * 0.6 + 1.6)) + m.seed;
      // A pack flanks: its members spread round the explorer in slots centred on the explorer's back
      // (drifting slowly), a lone one circles. Far off, they come straight in.
      const slot = sim.groupSlot(m);
      const look = ctx.look ? Math.atan2(ctx.look.x, ctx.look.z) : null;
      const a =
        look !== null && slot.n > 1
          ? look + Math.PI + (slot.i - (slot.n - 1) / 2) * Math.min((2 * Math.PI) / slot.n, 1.25) + Math.sin(sim.clock * 0.4 + m.group) * 0.35
          : sim.clock * (0.55 + m.seed * 0.35) * (m.seed > 0.5 ? 1 : -1) + m.seed * 6.283 + m.group;
      // Placed light (a torch) holds a pack off: they circle at its edge and do not come in.
      const lit = !sim.brave(m) && sim.env.light(Math.floor(ctx.player.x), Math.floor(ctx.player.y + 0.5), Math.floor(ctx.player.z)) > MOBS_RULES.torchFear;
      const rr = lit ? ring + 3.5 : ring;
      if (dp > 13) sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed, dt);
      else sim.walkToward(m, ctx.player.x + Math.sin(a) * rr, ctx.player.z + Math.cos(a) * rr, d.speed * 0.8, dt);
      if (lit) return;
      if (l.raised && dl < bright + 1 && !sim.brave(m)) {
        sim.recoil(m, 1.8);
        return;
      }
      const token = sim.packNext.get(m.group) ?? 0;
      const bold = !l.lit ? 1.8 : l.flame < MOBS_RULES.dimFlame ? 1.4 : 1;
      // They take turns; the one most to the explorer's side goes (a flank: its tell is heard on that side).
      if (m.cooldown <= 0 && sim.clock >= token && dp < 7.5 && m.stateTime > 0.6 && (dp < 2.6 || sim.rng.next() < dt * 1.6 * bold) && sim.flanker(m, ctx) && sim.seesPlayer(m, ctx)) {
        m.setState('windup');
        m.landed = false;
        sim.packNext.set(m.group, sim.clock + 0.9 + sim.rng.range(0, 0.8));
        sim.telegraph(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Chargers: keep a run-up, paw (a line marks the lane), rush; a wall stuns them.

function charge(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  const dp = sim.flatDist(m, ctx);
  sim.announce(m, ctx);
  switch (m.state) {
    case 'windup': {
      const k = Math.min(1, m.stateTime / windupTime(m));
      m.strike = k;
      // It tracks the explorer for two thirds of the wind-up, then the lane is locked.
      if (k < 0.66) {
        const dx = ctx.player.x - m.foot.x;
        const dz = ctx.player.z - m.foot.z;
        const l = Math.max(0.01, Math.hypot(dx, dz));
        m.dir.x = dx / l;
        m.dir.z = dz / l;
        m.yaw = Math.atan2(m.dir.x, m.dir.z);
      }
      const mk = sim.marker(m);
      if (mk) {
        mk.x = m.foot.x;
        mk.y = m.foot.y;
        mk.z = m.foot.z;
        mk.dx = m.dir.x;
        mk.dz = m.dir.z;
        mk.progress = k;
      }
      sim.walkerSettle(m, dt);
      if (k >= 1) {
        m.setState('attack');
        m.run = 0;
        m.landed = false;
        sim.sfx(m, 'mob.rush');
      }
      return;
    }
    case 'attack': {
      const rush = (d.rush ?? d.speed * 3) * m.scale ** 0.3 * m.pace;
      const bx = m.foot.x;
      const bz = m.foot.z;
      const blocked = walkStep(sim.env.solid, m.foot, m.dir.x * rush, m.dir.z * rush, dt, d.height, m.bounds.radius);
      sim.placeWalker(m);
      const moved = Math.hypot(m.foot.x - bx, m.foot.z - bz);
      m.run += moved;
      m.speedNow = moved / Math.max(1e-4, dt);
      m.gait += moved * 1.5;
      m.yaw = Math.atan2(m.dir.x, m.dir.z);
      if (!m.landed && sim.flatDist(m, ctx) <= m.bounds.radius + 0.9 && Math.abs(ctx.player.y - m.foot.y) < 2) {
        m.landed = true;
        sim.strikePlayer(m, d.damage);
      }
      const lane = sim.marker(m)?.len ?? 12;
      if (blocked && moved < rush * dt * 0.3) {
        // Into the rock: dazed, its guard down.
        sim.dropMarker(m);
        m.setState('stunned');
        m.timer = 1.9;
        sim.sfx(m, 'mob.thud');
        sim.emit({ type: 'burst', x: m.position.x + m.dir.x * m.bounds.radius, y: m.position.y, z: m.position.z + m.dir.z * m.bounds.radius, color: 0xb8a890, size: 0.8 });
        m.cooldown = d.cooldown;
      } else if (m.run >= lane + 1 || m.stateTime > 2.2) {
        if (!m.landed) sim.emit({ type: 'attack', mob: m, damage: 0, landed: false });
        sim.dropMarker(m);
        sim.recoil(m, 0.9);
        m.cooldown = d.cooldown;
      }
      return;
    }
    case 'stunned':
    case 'flee':
      m.open = Math.min(1, m.stateTime * 4);
      sim.walkerSettle(m, dt);
      if (m.stateTime >= (m.timer || 1.6)) {
        m.open = 0;
        m.setState('stalk');
      }
      return;
    case 'recoil':
      sim.walkerSettle(m, dt);
      if (m.stateTime >= (m.timer || 0.8)) m.setState('stalk');
      return;
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      sim.face(m, ctx, dt, 4);
      if (dp > 11) sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed, dt);
      else if (dp < 4.5) {
        const b = backOff(m, ctx, 3);
        sim.walkToward(m, b.x, b.z, d.speed * 0.8, dt);
        sim.face(m, ctx, dt, 6);
      } else {
        // Pace sideways, watching.
        const a = Math.atan2(m.foot.x - ctx.player.x, m.foot.z - ctx.player.z) + (m.seed > 0.5 ? 0.5 : -0.5);
        sim.walkToward(m, ctx.player.x + Math.sin(a) * dp, ctx.player.z + Math.cos(a) * dp, d.speed * 0.5, dt);
        sim.face(m, ctx, dt, 6);
      }
      if (m.cooldown <= 0 && m.stateTime > 0.8 && dp < 13 && dp > 2.2 && sim.seesPlayer(m, ctx)) {
        m.setState('windup');
        const dx = ctx.player.x - m.foot.x;
        const dz = ctx.player.z - m.foot.z;
        const l = Math.max(0.01, Math.hypot(dx, dz));
        m.dir.x = dx / l;
        m.dir.z = dz / l;
        sim.addMarker(m, 'line', m.foot.x, m.foot.y, m.foot.z, m.bounds.radius + 0.5, { dx: m.dir.x, dz: m.dir.z, len: Math.min(dp + 4, 15) });
        sim.telegraph(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Spitters: keep their distance, swell (the glow and a hiss), spit a slow glob.

function spit(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  const fly = d.locomotion === 'fly';
  const dp = sim.flatDist(m, ctx);
  sim.announce(m, ctx);
  const want = Math.min(d.reach * 0.6, 8.5);
  const hoverY = ctx.player.y + 2.4 + Math.sin(sim.clock * 0.9 + m.seed * 6) * 0.5;
  switch (m.state) {
    case 'windup': {
      sim.face(m, ctx, dt, 8);
      m.strike = Math.min(1, m.stateTime / windupTime(m));
      if (fly) sim.flyToward(m, m.position.x, hoverY, m.position.z, d.speed * 0.3, dt, 2);
      else sim.walkerSettle(m, dt);
      if (m.stateTime >= windupTime(m) && d.shot) {
        const fx = Math.sin(m.yaw);
        const fz = Math.cos(m.yaw);
        const from = { x: m.position.x + fx * m.bounds.radius * 0.9, y: m.position.y + m.bounds.halfHeight * 0.6 + 0.1, z: m.position.z + fz * m.bounds.radius * 0.9 };
        sim.spitAt(m, d.shot, from, ctx);
        m.cooldown = d.cooldown * (0.85 + sim.rng.next() * 0.3);
        m.setState('attack');
      }
      return;
    }
    case 'attack':
      m.strike = Math.max(0, 1 - m.stateTime * 3);
      if (fly) sim.flyToward(m, m.position.x, hoverY, m.position.z, d.speed * 0.3, dt, 2);
      else sim.walkerSettle(m, dt);
      if (m.stateTime > 0.45) m.setState('stalk');
      return;
    case 'flee':
    case 'recoil':
      m.strike = 0;
      if (fly) sim.flyToward(m, m.position.x, hoverY + 1, m.position.z, d.speed * 0.4, dt, 2);
      else sim.walkerSettle(m, dt);
      if (m.stateTime >= (m.timer || 0.8)) m.setState('stalk');
      return;
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      // Keep the range, circling slowly.
      const side = (m.seed > 0.5 ? 1 : -1) * 0.35;
      const a = Math.atan2(m.position.x - ctx.player.x, m.position.z - ctx.player.z) + side * dt * 4;
      const r = dp > want + 2.5 ? dp - 2 : dp < want - 2.5 ? dp + 2 : dp;
      const tx = ctx.player.x + Math.sin(a) * r;
      const tz = ctx.player.z + Math.cos(a) * r;
      if (fly) {
        sim.flyToward(m, tx, hoverY, tz, d.speed, dt, 1.5);
        sim.face(m, ctx, dt, 4);
      } else {
        sim.walkToward(m, tx, tz, d.speed * (Math.abs(r - dp) > 1 ? 1 : 0.5), dt);
        sim.face(m, ctx, dt, 5);
      }
      if (m.cooldown <= 0 && m.stateTime > 0.7 && dp < d.reach && sim.seesPlayer(m, ctx)) {
        m.setState('windup');
        sim.telegraph(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Ceiling droppers: hang still above the way, drip when the explorer passes under (a circle
// marks where it will land), fall, then fight on the rock like a crawler.

function drop(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  sim.announce(m, ctx);
  switch (m.state) {
    case 'windup': {
      const k = Math.min(1, m.stateTime / windupTime(m));
      m.strike = k;
      const mk = sim.marker(m);
      if (mk) mk.progress = k;
      if (k >= 1) {
        m.setState('attack');
        m.vel.y = 0;
        m.landed = false;
      }
      return;
    }
    case 'attack': {
      const floor = sim.floorY(m.position.x, m.position.y, m.position.z);
      m.vel.y -= 24 * dt;
      m.position.y += m.vel.y * dt;
      m.up.set(0, 1, 0);
      const ground = floor + d.lift * m.scale;
      if (m.position.y <= ground) {
        m.position.y = ground;
        sim.areaStrike(m, m.position.x, floor, m.position.z, d.blast ?? 1.6, d.damage, false);
        sim.emit({ type: 'burst', x: m.position.x, y: floor + 0.2, z: m.position.z, color: d.mote, size: 0.7 });
        sim.sfx(m, 'mob.thud');
        sim.dropMarker(m);
        m.mode = 'ground';
        const c = sim.nearestCling(Math.floor(m.position.x), floor, Math.floor(m.position.z));
        if (c) {
          m.cell.x = m.next.x = c.x;
          m.cell.y = m.next.y = c.y;
          m.cell.z = m.next.z = c.z;
        }
        m.cooldown = d.cooldown;
        sim.recoil(m, 1.2);
      }
      return;
    }
    default: {
      // Perched: a slow sway, a drip now and then.
      if (m.state !== 'sleep') m.setState('sleep');
      m.open = 0.5 + 0.5 * Math.sin(sim.clock * 0.8 + m.seed * 9);
      m.up.set(0, -1, 0);
      const fd = sim.flatDist(m, ctx);
      const below = ctx.player.y + 1 < m.position.y;
      if (fd < 2.8 + m.bounds.radius && below && m.stateTime > 0.5 && sim.seesPlayer(m, ctx)) {
        const floor = sim.floorY(m.position.x, m.position.y, m.position.z);
        m.setState('windup');
        sim.addMarker(m, 'disc', m.position.x, floor, m.position.z, d.blast ?? 1.6);
        sim.telegraph(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Divers: circle overhead, shriek and hover (a target marks the spot), dive on it, climb away.

function dive(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  const l = ctx.lantern;
  const bright = sim.brightRadius(ctx);
  sim.announce(m, ctx);
  m.gait += dt * (m.state === 'attack' ? 4 : 11);
  switch (m.state) {
    case 'windup': {
      const k = Math.min(1, m.stateTime / windupTime(m));
      m.strike = k;
      if (k < 0.6) {
        m.target.x = ctx.player.x;
        m.target.y = ctx.player.y + 0.9;
        m.target.z = ctx.player.z;
      }
      const mk = sim.marker(m);
      if (mk) {
        if (k < 0.6) {
          mk.x = ctx.player.x;
          mk.y = ctx.player.y;
          mk.z = ctx.player.z;
        }
        mk.progress = k;
      }
      sim.flyToward(m, m.position.x, m.position.y + 0.2, m.position.z, 1, dt, 3);
      m.yaw = Math.atan2(m.target.x - m.position.x, m.target.z - m.position.z);
      if (k >= 1) {
        m.setState('attack');
        m.landed = false;
        m.run = 0;
        sim.sfx(m, 'mob.swoop');
      }
      return;
    }
    case 'attack': {
      const dx = m.target.x - m.position.x;
      const dy = m.target.y - m.position.y;
      const dz = m.target.z - m.position.z;
      const dd = Math.hypot(dx, dy, dz);
      const rush = (d.rush ?? 10) * m.pace;
      m.vel.x = (dx / Math.max(0.01, dd)) * rush;
      m.vel.y = (dy / Math.max(0.01, dd)) * rush;
      m.vel.z = (dz / Math.max(0.01, dd)) * rush;
      const bx = m.position.x;
      const by = m.position.y;
      const bz = m.position.z;
      flyStep(sim.env.solid, m.position, m.vel, dt, m.bounds.radius);
      const moved = Math.hypot(m.position.x - bx, m.position.y - by, m.position.z - bz);
      m.run += moved;
      m.speedNow = moved / Math.max(1e-4, dt);
      if (!m.landed && sim.playerDistance(m.position.x, m.position.y, m.position.z, ctx) <= m.bounds.radius + d.reach * 0.5) {
        m.landed = true;
        sim.strikePlayer(m, d.damage);
      }
      if (dd < 0.7 || m.stateTime > 1.5 || moved < rush * dt * 0.2) {
        if (!m.landed) sim.emit({ type: 'attack', mob: m, damage: 0, landed: false });
        sim.dropMarker(m);
        sim.recoil(m, 1.3);
        m.cooldown = d.cooldown;
      }
      return;
    }
    case 'recoil':
    case 'flee': {
      m.strike = 0;
      const dx = m.position.x - ctx.player.x;
      const dz = m.position.z - ctx.player.z;
      const ll = Math.max(0.01, Math.hypot(dx, dz));
      sim.flyToward(m, m.position.x + (dx / ll) * 3, ctx.player.y + 4.2, m.position.z + (dz / ll) * 3, d.speed * 0.9, dt, 3);
      if (m.stateTime >= (m.timer || 1.2)) m.setState('stalk');
      return;
    }
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      const r = 4.5 + m.seed * 2;
      const a = sim.clock * (0.7 + m.seed * 0.3) * (m.seed > 0.5 ? 1 : -1) + m.seed * 6.283;
      sim.flyToward(m, ctx.player.x + Math.sin(a) * r, ctx.player.y + 3.4 + Math.sin(sim.clock + m.seed * 4) * 0.6, ctx.player.z + Math.cos(a) * r, d.speed, dt, 2.5);
      if (l.raised && Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z) < bright + 1 && !sim.brave(m)) {
        sim.recoil(m, 2);
        return;
      }
      if (m.cooldown <= 0 && m.stateTime > 1.2 && sim.distToPlayer(m, ctx) < 14 && sim.seesPlayer(m, ctx)) {
        m.setState('windup');
        m.target.x = ctx.player.x;
        m.target.y = ctx.player.y + 0.9;
        m.target.z = ctx.player.z;
        sim.addMarker(m, 'target', ctx.player.x, ctx.player.y, ctx.player.z, 1.2);
        sim.telegraph(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Burrowers: travel underground (a ripple and a rumble), mark a circle under the explorer, burst
// up, stay up a while (strike it then), sink again.

function dig(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  const s = sim.env.solid;
  switch (m.state) {
    case 'burrow': {
      m.mode = 'under';
      m.tappable = false;
      const dx = ctx.player.x - m.foot.x;
      const dz = ctx.player.z - m.foot.z;
      const l = Math.max(0.01, Math.hypot(dx, dz));
      const step = Math.min(l, d.speed * m.pace * dt);
      m.foot.x += (dx / l) * step;
      m.foot.z += (dz / l) * step;
      m.foot.y += (ctx.player.y - m.foot.y) * Math.min(1, dt * 2);
      m.position.set(m.foot.x, m.foot.y - 1.2, m.foot.z);
      m.yaw = Math.atan2(dx, dz);
      const fy = sim.floorY(m.foot.x, m.foot.y + 0.5, m.foot.z);
      const mk = sim.marker(m);
      if (mk && mk.kind === 'ripple') {
        mk.x = m.foot.x;
        mk.y = fy;
        mk.z = m.foot.z;
      } else sim.addMarker(m, 'ripple', m.foot.x, fy, m.foot.z, 0.8 * m.scale + 0.3);
      m.timer -= dt;
      if (m.timer <= 0) {
        m.timer = 1.3;
        sim.sfx(m, 'mob.rumble');
      }
      if (l < 1.4 || m.stateTime > 7) {
        m.target.x = ctx.player.x;
        m.target.y = ctx.player.y;
        m.target.z = ctx.player.z;
        m.setState('windup');
        sim.addMarker(m, 'disc', m.target.x, sim.floorY(m.target.x, m.target.y + 0.5, m.target.z), m.target.z, d.blast ?? 1.8);
        sim.telegraph(m);
        sim.announce(m, ctx);
      }
      if (Math.hypot(dx, dz) > 40) sim.remove(m);
      return;
    }
    case 'windup': {
      const k = Math.min(1, m.stateTime / windupTime(m));
      const mk = sim.marker(m);
      if (mk) mk.progress = k;
      // Under the circle.
      m.foot.x += (m.target.x - m.foot.x) * Math.min(1, dt * 6);
      m.foot.z += (m.target.z - m.foot.z) * Math.min(1, dt * 6);
      m.position.set(m.foot.x, m.foot.y - 1.2, m.foot.z);
      if (k >= 1) {
        const fx = Math.floor(m.target.x);
        const fz = Math.floor(m.target.z);
        const fy = floorNear(s, fx, Math.floor(m.target.y), fz, d.height, 4);
        const floor = fy ?? sim.floorY(m.target.x, m.target.y + 0.5, m.target.z);
        m.foot.x = fx + 0.5;
        m.foot.z = fz + 0.5;
        m.foot.y = floor;
        sim.placeWalker(m);
        m.mode = '';
        m.tappable = true;
        m.fade = Math.max(m.fade, 0.55);
        sim.areaStrike(m, m.foot.x, floor, m.foot.z, d.blast ?? 1.8, d.damage, false);
        sim.emit({ type: 'burst', x: m.foot.x, y: floor + 0.3, z: m.foot.z, color: 0xb89a70, size: 1.1 });
        sim.sfx(m, 'mob.burst');
        sim.dropMarker(m);
        m.setState('recoil');
        m.timer = 2.0;
        m.cooldown = 1.2;
      }
      return;
    }
    case 'recoil':
      // Surfaced and dazed: its guard is down.
      m.open = Math.max(0, 1 - m.stateTime);
      sim.face(m, ctx, dt, 3);
      sim.walkerSettle(m, dt);
      if (m.stateTime >= (m.timer || 1.5)) m.setState('stalk');
      return;
    case 'lurk': {
      // A bite on the surface.
      m.strike = Math.min(1, m.stateTime / 0.5);
      sim.face(m, ctx, dt, 8);
      sim.walkerSettle(m, dt);
      if (m.stateTime >= 0.5) {
        if (sim.distToPlayer(m, ctx) <= d.reach + m.bounds.radius) sim.strikePlayer(m, Math.round(d.damage * 0.6));
        else sim.emit({ type: 'attack', mob: m, damage: 0, landed: false });
        m.cooldown = 1.6;
        m.setState('stalk');
      }
      return;
    }
    case 'sleep':
      // Sinking back down.
      m.open = Math.min(1, m.stateTime / 0.7);
      sim.walkerSettle(m, dt);
      if (m.stateTime >= 0.7) {
        m.mode = 'under';
        m.tappable = false;
        m.timer = 0.4;
        m.setState('burrow');
      }
      return;
    case 'flee':
      sim.walkerSettle(m, dt);
      if (m.stateTime >= (m.timer || 1)) m.setState('stalk');
      return;
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      sim.announce(m, ctx);
      sim.face(m, ctx, dt, 4);
      if (sim.flatDist(m, ctx) > 1.6) sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed * 0.35, dt);
      else sim.walkerSettle(m, dt);
      if (m.cooldown <= 0 && sim.distToPlayer(m, ctx) <= d.reach + m.bounds.radius + 0.4) {
        m.setState('lurk');
        sim.telegraph(m);
      } else if (m.stateTime > 4) {
        m.setState('sleep');
        sim.sfx(m, 'mob.rumble');
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Brutes: slow, plated (blows glance off), a raised slam on a marked circle, then their guard
// is open; some throw a rock from afar.

function slam(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  const dp = sim.flatDist(m, ctx);
  sim.announce(m, ctx);
  const front = (k: number) => ({ x: m.foot.x + Math.sin(m.yaw) * k, z: m.foot.z + Math.cos(m.yaw) * k });
  switch (m.state) {
    case 'windup': {
      const k = Math.min(1, m.stateTime / windupTime(m));
      m.strike = k;
      sim.face(m, ctx, dt, k < 0.6 ? 2.5 : 0.3);
      const f = front(m.bounds.radius * 0.7);
      const mk = sim.marker(m);
      if (mk) {
        mk.x = f.x;
        mk.z = f.z;
        mk.progress = k;
      }
      sim.walkerSettle(m, dt);
      if (k >= 1) {
        m.setState('attack');
        m.landed = false;
      }
      return;
    }
    case 'attack': {
      m.strike = Math.max(0, 1 - m.stateTime / 0.25);
      if (!m.landed && m.stateTime >= 0.1) {
        m.landed = true;
        const mk = sim.marker(m);
        const f = mk ? { x: mk.x, z: mk.z } : front(m.bounds.radius * 0.7);
        sim.areaStrike(m, f.x, m.foot.y, f.z, d.blast ?? 2.4, d.damage, false);
        sim.emit({ type: 'burst', x: f.x, y: m.foot.y + 0.2, z: f.z, color: 0xa89880, size: 1.2 });
        sim.sfx(m, 'mob.stomp');
        sim.dropMarker(m);
      }
      sim.walkerSettle(m, dt);
      if (m.stateTime >= 0.5) {
        m.setState('recoil');
        m.timer = 1.7;
        m.cooldown = d.cooldown;
      }
      return;
    }
    case 'lurk': {
      // A throw: the rock lifted overhead, then hurled.
      m.strike = Math.min(1, m.stateTime / 0.9);
      sim.face(m, ctx, dt, 4);
      sim.walkerSettle(m, dt);
      if (m.stateTime >= 0.9 && d.shot) {
        sim.spitAt(m, d.shot, { x: m.position.x, y: m.position.y + m.bounds.halfHeight + 0.6, z: m.position.z }, ctx);
        m.cooldown = d.cooldown;
        m.strike = 0;
        m.setState('stalk');
      }
      return;
    }
    case 'recoil':
    case 'flee':
      m.open += (1 - m.open) * Math.min(1, dt * 6);
      m.strike = 0;
      sim.walkerSettle(m, dt);
      if (m.stateTime >= (m.timer || 1.5)) {
        m.setState('stalk');
      }
      return;
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      m.open += (0 - m.open) * Math.min(1, dt * 3);
      sim.face(m, ctx, dt, 2);
      if (dp > d.reach * 0.8) sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed, dt);
      else sim.walkerSettle(m, dt);
      if (m.cooldown <= 0 && dp <= d.reach + 0.6 && Math.abs(ctx.player.y - m.foot.y) < 2.5) {
        m.setState('windup');
        const f = front(m.bounds.radius * 0.7);
        sim.addMarker(m, 'disc', f.x, m.foot.y, f.z, d.blast ?? 2.4);
        sim.telegraph(m);
      } else if (d.shot && m.cooldown <= 0 && dp > 6 && dp < 15 && m.stateTime > 1.5 && sim.rng.next() < dt * 0.6 && sim.seesPlayer(m, ctx)) {
        m.setState('lurk');
        sim.telegraph(m);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------
// Exploders: rush in, light up and swell (a circle marks the burst), then burst. Struck down
// before the fuse, they only pop (and hurt the monsters round them).

function fuse(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const d = m.def;
  const fly = d.locomotion === 'fly';
  sim.announce(m, ctx);
  switch (m.state) {
    case 'windup': {
      const T = m.timer > 0 ? m.timer : windupTime(m);
      const k = Math.min(1, m.stateTime / T);
      m.strike = k;
      m.flash = Math.max(m.flash, (0.5 + 0.5 * Math.sin(m.stateTime * (12 + k * 30))) * 0.55);
      if (fly) sim.flyToward(m, ctx.player.x, ctx.player.y + 1.4, ctx.player.z, d.speed * 0.35, dt, 2);
      else sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed * 0.35, dt);
      const mk = sim.marker(m);
      if (mk) {
        mk.x = m.position.x;
        mk.y = fly ? sim.floorY(m.position.x, m.position.y, m.position.z) : m.foot.y;
        mk.z = m.position.z;
        mk.progress = k;
      } else sim.addMarker(m, 'disc', m.position.x, fly ? sim.floorY(m.position.x, m.position.y, m.position.z) : m.foot.y, m.position.z, d.blast ?? 2.4);
      if (k >= 1) {
        m.fused = true;
        sim.kill(m);
      }
      return;
    }
    default: {
      if (m.state !== 'stalk') m.setState('stalk');
      if (fly) sim.flyToward(m, ctx.player.x, ctx.player.y + 1.4, ctx.player.z, d.speed, dt, 1.8);
      else sim.walkToward(m, ctx.player.x, ctx.player.z, d.speed, dt);
      m.gait += dt * 2;
      if (sim.distToPlayer(m, ctx) <= d.reach && m.stateTime > 0.4 && sim.seesPlayer(m, ctx)) {
        m.fused = true;
        m.timer = 0;
        m.setState('windup');
        sim.addMarker(m, 'disc', m.position.x, fly ? sim.floorY(m.position.x, m.position.y, m.position.z) : m.foot.y, m.position.z, d.blast ?? 2.4);
        sim.telegraph(m);
      }
    }
  }
}
