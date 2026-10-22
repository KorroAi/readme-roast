import { MOBS_RULES } from './config';
import { floorNear, flyStep, walkStep } from './nav';
import { GUARDIAN_DEFS, type GuardianDef, type GuardianPattern } from './species';
import type { MobSim, SimMob } from './MobSim';
import type { GuardianKind, GuardianState, MobContext, MobKind, MobStrike } from './types';
import { t, hasText, type TextKey } from '../../i18n';

/**
 * The guardians' fights (round 3, MOBS; BRIEF §0.5): asleep in their lair until the explorer
 * walks in, then a loop of attack patterns, each with a clear telegraph (a pose, a roar and a
 * marker on the ground), each followed by an open guard (blows land for 1.6x). A guardian has two
 * phases (the second adds a pattern and quickens); the Heart has three. It keeps to its arena:
 * flee far enough and it heals and sleeps again. Its defeat drops the biome's Heart Shard.
 */

/** The wind-up of each pattern (s, before the phase quickening). */
const WINDUP: Record<GuardianPattern, number> = { slam: 1.2, ring: 1.0, volley: 0.85, charge: 1.0, summon: 1.0, burrow: 0.7, dive: 0.95, line: 1.0, snuff: 1.2 };

/** Patterns that want the explorer close (the others are fine from afar). */
const CLOSE: ReadonlySet<GuardianPattern> = new Set(['slam']);

function gdef(m: SimMob): GuardianDef {
  return GUARDIAN_DEFS[m.kind as GuardianKind];
}

/** Quicker in the later phases. */
function quick(m: SimMob): number {
  return 1 - 0.12 * (m.phase - 1);
}

function arenaRadius(m: SimMob): number {
  return m.lair?.radius ?? gdef(m).arena;
}

function arenaCentre(m: SimMob): { x: number; y: number; z: number } {
  return m.lair ? { x: m.lair.x, y: m.lair.y, z: m.lair.z } : m.home;
}

const fly = (m: SimMob) => m.def.locomotion === 'fly';

/** The guardian's hit points thresholds for the next phase. */
function phaseAt(def: GuardianDef, hp: number, max: number): number {
  const n = def.patterns.length;
  const frac = Math.max(0, hp) / max;
  // Two phases: at half; three: at two thirds and one third.
  return Math.min(n, 1 + Math.floor((1 - frac) * n + 1e-6));
}

export function guardianBrain(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  const def = gdef(m);
  const c = arenaCentre(m);
  const R = arenaRadius(m);
  const inArena = Math.hypot(ctx.player.x - c.x, ctx.player.z - c.z) < R && Math.abs(ctx.player.y - c.y) < 10;
  // ---- Asleep in the lair.
  if (m.state === 'sleep') {
    m.glow += (0.3 - m.glow) * Math.min(1, dt * 2);
    m.open += (0 - m.open) * Math.min(1, dt * 2);
    settle(sim, m, dt, ctx);
    if (inArena && (sim.seesPlayer(m, ctx) || Math.hypot(ctx.player.x - m.position.x, ctx.player.z - m.position.z) < R * 0.6)) wake(sim, m);
    return;
  }
  // ---- The leash: out of the arena too long, it heals and goes back to sleep.
  if (!inArena && m.state !== 'dying') {
    m.leash += dt;
    if (m.leash > MOBS_RULES.leashSeconds && Math.hypot(ctx.player.x - c.x, ctx.player.z - c.z) > R + MOBS_RULES.leashMargin * 0.5) return reset(sim, m);
  } else m.leash = 0;
  if (m.state === 'wake') {
    m.glow = Math.min(1, m.stateTime / 1.5);
    m.strike = Math.sin(Math.min(1, m.stateTime / 1.8) * Math.PI) * 0.8;
    sim.face(m, ctx, dt, 2);
    settle(sim, m, dt, ctx);
    if (m.stateTime >= 1.8) {
      m.cooldown = 0.6;
      m.setState('stalk');
    }
    return;
  }
  switch (m.state) {
    case 'windup':
      return windup(sim, m, dt, ctx, def);
    case 'attack':
      return attack(sim, m, dt, ctx, def);
    case 'burrow':
      return burrowing(sim, m, dt, ctx, def);
    case 'recoil':
    case 'stunned':
    case 'flee':
      m.open += (1 - m.open) * Math.min(1, dt * 5);
      m.strike *= Math.exp(-dt * 6);
      settle(sim, m, dt, ctx);
      if (m.stateTime >= (m.timer || 1.6)) {
        m.setState('stalk');
        m.cooldown = def.cooldown * quick(m) * (0.7 + sim.rng.next() * 0.5);
      }
      return;
    default:
      return stalk(sim, m, dt, ctx, def);
  }
}

function wake(sim: MobSim, m: SimMob): void {
  m.setState('wake');
  m.leash = 0;
  sim.emit({ type: 'guardian', mob: m, phase: 'awake' });
  sim.sfx(m, 'guardian.roar');
  if (sim.ctx) sim.announce(m, sim.ctx);
}

function reset(sim: MobSim, m: SimMob): void {
  sim.dropMarker(m);
  m.hp = m.maxHp;
  m.phase = 1;
  m.leash = 0;
  m.pattern = null;
  m.mode = '';
  m.tappable = true;
  const c = arenaCentre(m);
  const l = m.lair;
  const sx = l ? l.sx : c.x;
  const sy = l ? l.sy : c.y;
  const sz = l ? l.sz : c.z;
  m.foot.x = sx;
  m.foot.y = sy;
  m.foot.z = sz;
  if (fly(m)) m.position.set(sx, sy + gdef(m).hover, sz);
  else sim.placeWalker(m);
  m.setState('sleep');
  // Its brood goes back to the dark too.
  for (const o of sim.mobs) if (o.owner === m.id) sim.remove(o);
  sim.emit({ type: 'guardian', mob: m, phase: 'reset' });
}

/** Keep its body where it belongs: fliers hover, walkers stand on the floor. */
function settle(sim: MobSim, m: SimMob, dt: number, ctx: MobContext): void {
  if (fly(m)) {
    const def = gdef(m);
    const floor = sim.floorY(m.position.x, m.position.y, m.position.z);
    const hy = floor + def.hover + Math.sin(sim.clock * 0.8 + m.seed * 5) * 0.35;
    sim.flyToward(m, m.position.x, hy, m.position.z, 1.2, dt, 2);
    void ctx;
  } else sim.walkerSettle(m, dt);
}

function stalk(sim: MobSim, m: SimMob, dt: number, ctx: MobContext, def: GuardianDef): void {
  if (m.state !== 'stalk') m.setState('stalk');
  m.open += (0 - m.open) * Math.min(1, dt * 3);
  m.glow += (0.75 - m.glow) * Math.min(1, dt * 2);
  const dp = sim.flatDist(m, ctx);
  const c = arenaCentre(m);
  const R = arenaRadius(m);
  sim.face(m, ctx, dt, 2.5);
  const stationary = m.brain === 'heart';
  if (fly(m)) {
    // Circle the explorer at a distance, over the arena.
    const a = sim.clock * 0.35 * (m.seed > 0.5 ? 1 : -1) + m.seed * 6.28;
    const rr = stationary ? 0 : 7;
    let tx = (stationary ? c.x : ctx.player.x) + Math.sin(a) * rr;
    let tz = (stationary ? c.z : ctx.player.z) + Math.cos(a) * rr;
    const k = Math.hypot(tx - c.x, tz - c.z);
    if (k > R * 0.85) {
      tx = c.x + ((tx - c.x) / k) * R * 0.85;
      tz = c.z + ((tz - c.z) / k) * R * 0.85;
    }
    const floor = sim.floorY(tx, m.position.y, tz);
    sim.flyToward(m, tx, floor + def.hover + Math.sin(sim.clock * 0.8) * 0.4, tz, def.speed * 0.6, dt, 1.5);
    sim.face(m, ctx, dt, 3);
  } else if (!stationary) {
    const want = 3.2 + m.bounds.radius;
    if (dp > want) {
      // Toward the explorer, but never out of the arena.
      const tx = ctx.player.x;
      const tz = ctx.player.z;
      if (Math.hypot(tx - c.x, tz - c.z) < R + 2) sim.walkToward(m, tx, tz, def.speed * (1 + 0.15 * (m.phase - 1)), dt, false);
      else sim.walkToward(m, c.x, c.z, def.speed, dt, false);
    } else sim.walkerSettle(m, dt);
  } else settle(sim, m, dt, ctx);
  if (m.cooldown > 0 || m.stateTime < 0.5) return;
  // The next pattern: not the same twice, the close ones only when close, the brood only when thin.
  const list = def.patterns[Math.min(def.patterns.length, m.phase) - 1];
  const brood = sim.mobs.filter((o) => o.owner === m.id && !o.dying).length;
  const ok = list.filter((p) => p !== m.lastPattern && !(CLOSE.has(p) && dp > 6) && !(p === 'summon' && brood >= 3) && !(p === 'dive' && !fly(m) && m.brain !== 'heart') && !(p === 'burrow' && fly(m)));
  const pool = ok.length ? ok : list.filter((p) => p !== 'summon');
  const p = pool[sim.rng.int(0, pool.length - 1)];
  begin(sim, m, ctx, def, p);
}

function begin(sim: MobSim, m: SimMob, ctx: MobContext, def: GuardianDef, p: GuardianPattern): void {
  m.pattern = p;
  m.lastPattern = p;
  m.landed = false;
  m.run = 0;
  m.setState('windup');
  const foot = fly(m) ? { x: m.position.x, y: sim.floorY(m.position.x, m.position.y, m.position.z), z: m.position.z } : m.foot;
  const dx = ctx.player.x - foot.x;
  const dz = ctx.player.z - foot.z;
  const l = Math.max(0.01, Math.hypot(dx, dz));
  m.dir.x = dx / l;
  m.dir.z = dz / l;
  const blast = def.blast ?? 3;
  switch (p) {
    case 'slam':
      sim.addMarker(m, 'disc', foot.x, foot.y, foot.z, blast + m.bounds.radius * 0.5);
      break;
    case 'ring':
      sim.addMarker(m, 'disc', foot.x, foot.y, foot.z, m.bounds.radius + 1.2);
      break;
    case 'charge':
      sim.addMarker(m, 'line', foot.x, foot.y, foot.z, m.bounds.radius + 0.6, { dx: m.dir.x, dz: m.dir.z, len: Math.min(l + 5, arenaRadius(m) * 1.6) });
      break;
    case 'line':
      sim.addMarker(m, 'line', foot.x, foot.y, foot.z, 1.1, { dx: m.dir.x, dz: m.dir.z, len: Math.min(l + 6, 20) });
      break;
    case 'dive':
      m.target.x = ctx.player.x;
      m.target.y = ctx.player.y + 1;
      m.target.z = ctx.player.z;
      sim.addMarker(m, 'target', ctx.player.x, ctx.player.y, ctx.player.z, 2.2);
      break;
    case 'snuff':
      sim.addMarker(m, 'disc', foot.x, foot.y, foot.z, 9);
      break;
    default:
      break;
  }
  sim.telegraph(m);
  sim.emit({ type: 'sfx', name: p === 'summon' ? 'guardian.call' : p === 'volley' ? 'mob.hiss' : 'guardian.roar', x: m.position.x, y: m.position.y, z: m.position.z, mob: m });
}

function windup(sim: MobSim, m: SimMob, dt: number, ctx: MobContext, def: GuardianDef): void {
  void def;
  const p = m.pattern ?? 'slam';
  const T = WINDUP[p] * quick(m);
  const k = Math.min(1, m.stateTime / T);
  m.strike = k;
  m.glow = 0.75 + k * 0.5;
  const mk = sim.marker(m);
  if (mk) mk.progress = k;
  // Lanes and targets follow the explorer for most of the wind-up, then lock.
  if (k < 0.65 && (p === 'charge' || p === 'line' || p === 'dive')) {
    const foot = fly(m) ? m.position : m.foot;
    const dx = ctx.player.x - foot.x;
    const dz = ctx.player.z - foot.z;
    const l = Math.max(0.01, Math.hypot(dx, dz));
    m.dir.x = dx / l;
    m.dir.z = dz / l;
    if (mk && p !== 'dive') {
      mk.dx = m.dir.x;
      mk.dz = m.dir.z;
    }
    if (p === 'dive') {
      m.target.x = ctx.player.x;
      m.target.y = ctx.player.y + 1;
      m.target.z = ctx.player.z;
      if (mk) {
        mk.x = ctx.player.x;
        mk.y = ctx.player.y;
        mk.z = ctx.player.z;
      }
    }
    sim.face(m, ctx, dt, 5);
  }
  if (p === 'burrow') m.open = k;
  settle(sim, m, dt, ctx);
  if (k >= 1) {
    m.setState(p === 'burrow' ? 'burrow' : 'attack');
    m.landed = false;
    m.run = 0;
    if (p === 'burrow') {
      sim.dropMarker(m);
      m.mode = 'under';
      m.tappable = false;
      m.timer = 1.4 + sim.rng.range(0, 0.8);
    }
  }
}

function attack(sim: MobSim, m: SimMob, dt: number, ctx: MobContext, def: GuardianDef): void {
  const p = m.pattern ?? 'slam';
  const foot = fly(m) ? { x: m.position.x, y: sim.floorY(m.position.x, m.position.y, m.position.z), z: m.position.z } : m.foot;
  const blast = def.blast ?? 3;
  const open = (seconds: number) => {
    m.setState('recoil');
    m.timer = seconds * (1 - 0.1 * (m.phase - 1));
  };
  switch (p) {
    case 'slam':
      if (!m.landed) {
        m.landed = true;
        const mk = sim.marker(m);
        sim.areaStrike(m, mk?.x ?? foot.x, foot.y, mk?.z ?? foot.z, mk?.r ?? blast, def.damage, false);
        sim.emit({ type: 'burst', x: foot.x, y: foot.y + 0.2, z: foot.z, color: def.mote, size: 1.6 });
        sim.sfx(m, 'mob.stomp');
        sim.dropMarker(m);
        if (m.phase >= 2) sim.addWave(m, foot.x, foot.y, foot.z, 12, 8, Math.round(def.damage * 0.6));
      }
      settle(sim, m, dt, ctx);
      if (m.stateTime > 0.5) open(2.0);
      return;
    case 'ring':
      if (!m.landed) {
        m.landed = true;
        sim.dropMarker(m);
        sim.addWave(m, foot.x, foot.y, foot.z, 18, 8.5, Math.round(def.damage * 0.8));
        // The Heart's (and late phases') double ring: a second one close behind.
        if (m.phase >= 3 || m.brain === 'heart') m.timer2 = 0.55;
        sim.sfx(m, 'guardian.wave');
        sim.emit({ type: 'burst', x: foot.x, y: foot.y + 0.3, z: foot.z, color: def.mote, size: 1.2 });
      }
      if (m.timer2 > 0) {
        m.timer2 -= dt;
        if (m.timer2 <= 0) sim.addWave(m, foot.x, foot.y, foot.z, 18, 8.5, Math.round(def.damage * 0.8));
      }
      settle(sim, m, dt, ctx);
      if (m.stateTime > 0.8) open(1.6);
      return;
    case 'volley': {
      const salvos = m.phase >= 2 ? 2 : 1;
      const every = 0.4;
      const fired = Math.floor(m.run);
      if (fired < salvos && m.stateTime >= fired * every && def.shot) {
        m.run = fired + 1;
        const from = { x: m.position.x + Math.sin(m.yaw) * m.bounds.radius, y: m.position.y + m.bounds.halfHeight * 0.5 + 0.3, z: m.position.z + Math.cos(m.yaw) * m.bounds.radius };
        sim.spitAt(m, def.shot, from, ctx, fired % 2 === 0 ? 1 : 0.6);
      }
      sim.face(m, ctx, dt, 4);
      settle(sim, m, dt, ctx);
      if (m.stateTime > salvos * every + 0.3) open(1.4);
      return;
    }
    case 'charge': {
      const rush = def.rush ?? 9;
      if (fly(m)) {
        m.vel.x = m.dir.x * rush;
        m.vel.z = m.dir.z * rush;
        m.vel.y = 0;
        flyStep(sim.env.solid, m.position, m.vel, dt, m.bounds.radius);
      } else {
        const bx = m.foot.x;
        const bz = m.foot.z;
        const blocked = walkStep(sim.env.solid, m.foot, m.dir.x * rush, m.dir.z * rush, dt, def.height, m.bounds.radius);
        sim.placeWalker(m);
        const moved = Math.hypot(m.foot.x - bx, m.foot.z - bz);
        m.run += moved;
        m.speedNow = moved / Math.max(1e-4, dt);
        m.gait += moved * 0.8;
        if (blocked && moved < rush * dt * 0.3) {
          // Into the arena's wall: dazed.
          sim.dropMarker(m);
          sim.sfx(m, 'mob.thud');
          sim.emit({ type: 'burst', x: m.position.x + m.dir.x * m.bounds.radius, y: m.position.y, z: m.position.z + m.dir.z * m.bounds.radius, color: 0xb8a890, size: 1.4 });
          m.setState('stunned');
          m.timer = 2.6;
          return;
        }
      }
      m.yaw = Math.atan2(m.dir.x, m.dir.z);
      if (!m.landed && sim.flatDist(m, ctx) <= m.bounds.radius + 1.1 && Math.abs(ctx.player.y - foot.y) < 2.5) {
        m.landed = true;
        sim.strikePlayer(m, def.damage);
      }
      const len = sim.marker(m)?.len ?? 14;
      const out = Math.hypot(m.position.x - arenaCentre(m).x, m.position.z - arenaCentre(m).z) > arenaRadius(m) + 1;
      if (m.run >= len || m.stateTime > 2.2 || out) {
        sim.dropMarker(m);
        open(1.4);
      }
      return;
    }
    case 'summon': {
      if (!m.landed) {
        m.landed = true;
        const n = 2 + m.phase;
        for (let i = 0; i < n; i++) {
          const kind = def.brood[sim.rng.int(0, def.brood.length - 1)] as MobKind;
          const a = sim.rng.range(-Math.PI, Math.PI);
          const r = m.bounds.radius + 2 + sim.rng.range(0, 2.5);
          const x = foot.x + Math.sin(a) * r;
          const z = foot.z + Math.cos(a) * r;
          const fy = floorNear(sim.env.solid, Math.floor(x), Math.floor(foot.y), Math.floor(z), 1, 4);
          if (fy === null) continue;
          const o = sim.spawn(kind, x, fy + (sim.mobs.length >= 0 && isFlyer(kind) ? 2 : 0), z, { owner: m.id, biome: m.biome, ceiling: false });
          if (o) sim.emit({ type: 'burst', x: o.position.x, y: o.position.y, z: o.position.z, color: def.mote, size: 0.6 });
        }
      }
      settle(sim, m, dt, ctx);
      if (m.stateTime > 0.8) open(1.2);
      return;
    }
    case 'dive': {
      const rush = def.rush ?? 12;
      const dx = m.target.x - m.position.x;
      const dy = m.target.y + 0.5 - m.position.y;
      const dz = m.target.z - m.position.z;
      const dd = Math.hypot(dx, dy, dz);
      m.vel.x = (dx / Math.max(0.01, dd)) * rush;
      m.vel.y = (dy / Math.max(0.01, dd)) * rush;
      m.vel.z = (dz / Math.max(0.01, dd)) * rush;
      flyStep(sim.env.solid, m.position, m.vel, dt, m.bounds.radius);
      if (!m.landed && (dd < 1.2 || m.stateTime > 1.4)) {
        m.landed = true;
        const fy = sim.floorY(m.position.x, m.position.y, m.position.z);
        sim.areaStrike(m, m.position.x, fy, m.position.z, 2.4, def.damage, false);
        sim.emit({ type: 'burst', x: m.position.x, y: fy + 0.3, z: m.position.z, color: def.mote, size: 1.3 });
        sim.sfx(m, 'mob.stomp');
        sim.dropMarker(m);
        // Down on the floor a moment, open.
        open(2.0);
      }
      return;
    }
    case 'line': {
      if (!m.landed) {
        m.landed = true;
        const mk = sim.marker(m);
        if (mk) sim.addEruption(m, mk, Math.round(def.damage * 0.85));
        sim.sfx(m, 'guardian.wave');
      }
      settle(sim, m, dt, ctx);
      if (m.stateTime > 0.9) open(1.5);
      return;
    }
    case 'snuff': {
      if (!m.landed) {
        m.landed = true;
        sim.dropMarker(m);
        sim.snuffLeft = 6;
        sim.sfx(m, 'guardian.snuff');
        for (let i = 0; i < 2 + (m.phase - 1); i++) {
          const kind = def.brood[sim.rng.int(0, def.brood.length - 1)] as MobKind;
          const a = sim.rng.range(-Math.PI, Math.PI);
          const x = ctx.player.x + Math.sin(a) * 7;
          const z = ctx.player.z + Math.cos(a) * 7;
          const fy = floorNear(sim.env.solid, Math.floor(x), Math.floor(ctx.player.y), Math.floor(z), 1, 5);
          if (fy !== null) sim.spawn(kind, x, fy + (isFlyer(kind) ? 2 : 0), z, { owner: m.id, biome: m.biome });
        }
      }
      settle(sim, m, dt, ctx);
      if (m.stateTime > 0.8) open(1.8);
      return;
    }
    default:
      open(1);
  }
}

function isFlyer(kind: MobKind): boolean {
  return GUARDIAN_DEFS[kind as GuardianKind]?.locomotion === 'fly';
}

/** Underground (the 'burrow' pattern): a ripple toward the explorer, then a marked circle, then up. */
function burrowing(sim: MobSim, m: SimMob, dt: number, ctx: MobContext, def: GuardianDef): void {
  const c = arenaCentre(m);
  const R = arenaRadius(m);
  if (m.mode === 'under') {
    if (m.run === 0) {
      // Travel.
      const dx = ctx.player.x - m.foot.x;
      const dz = ctx.player.z - m.foot.z;
      const l = Math.max(0.01, Math.hypot(dx, dz));
      const step = Math.min(l, 7 * dt);
      m.foot.x += (dx / l) * step;
      m.foot.z += (dz / l) * step;
      const k = Math.hypot(m.foot.x - c.x, m.foot.z - c.z);
      if (k > R) {
        m.foot.x = c.x + ((m.foot.x - c.x) / k) * R;
        m.foot.z = c.z + ((m.foot.z - c.z) / k) * R;
      }
      m.position.set(m.foot.x, m.foot.y - 2, m.foot.z);
      const mk = sim.marker(m);
      const fy = sim.floorY(m.foot.x, m.foot.y + 0.5, m.foot.z);
      if (mk && mk.kind === 'ripple') {
        mk.x = m.foot.x;
        mk.y = fy;
        mk.z = m.foot.z;
      } else sim.addMarker(m, 'ripple', m.foot.x, fy, m.foot.z, 1.6);
      m.timer -= dt;
      if (m.timer <= 0 || l < 1.5) {
        m.run = 1;
        m.target.x = ctx.player.x;
        m.target.y = ctx.player.y;
        m.target.z = ctx.player.z;
        m.stateTime = 0;
        sim.addMarker(m, 'disc', m.target.x, sim.floorY(m.target.x, m.target.y + 0.5, m.target.z), m.target.z, (def.blast ?? 3) * 0.9);
        sim.sfx(m, 'mob.rumble');
      }
      return;
    }
    // The circle fills, then it bursts up.
    const T = 0.95 * quick(m);
    const mk = sim.marker(m);
    if (mk) mk.progress = Math.min(1, m.stateTime / T);
    if (m.stateTime >= T) {
      const fx = Math.floor(m.target.x);
      const fz = Math.floor(m.target.z);
      const fy = floorNear(sim.env.solid, fx, Math.floor(m.target.y), fz, Math.min(3, def.height), 4) ?? sim.floorY(m.target.x, m.target.y + 0.5, m.target.z);
      m.foot.x = fx + 0.5;
      m.foot.z = fz + 0.5;
      m.foot.y = fy;
      sim.placeWalker(m);
      m.mode = '';
      m.tappable = true;
      m.fade = Math.max(m.fade, 0.6);
      sim.areaStrike(m, m.foot.x, fy, m.foot.z, mk?.r ?? 2.7, def.damage, false);
      sim.emit({ type: 'burst', x: m.foot.x, y: fy + 0.3, z: m.foot.z, color: 0xb89a70, size: 1.6 });
      sim.sfx(m, 'mob.burst');
      sim.dropMarker(m);
      m.setState('recoil');
      m.timer = 2.4;
    }
    return;
  }
  m.setState('stalk');
}

/**
 * A blow on a guardian: asleep, it wakes (and takes the blow); its guard (armour) is down while it
 * recoils or is stunned; a phase turns at its thresholds. @returns the damage dealt, or null for none.
 */
export function guardianOnHit(sim: MobSim, m: SimMob, dmg: number, strike: MobStrike): { damage: number; armoured: boolean; weak: boolean } | null {
  void strike;
  if (m.mode === 'under') return null;
  const def = gdef(m);
  if (m.state === 'sleep') wake(sim, m);
  const weak = m.state === 'recoil' || m.state === 'stunned';
  const armoured = !weak;
  let d = dmg * (weak ? MOBS_RULES.vulnerable * (m.state === 'stunned' ? 1.15 : 1) : def.armour);
  // The roar between phases: barely scratched.
  if (m.state === 'wake') d *= 0.3;
  const max = m.maxHp ?? def.hp;
  const before = phaseAt(def, m.hp ?? max, max);
  const after = phaseAt(def, (m.hp ?? max) - d, max);
  if (after > before && (m.hp ?? max) - d > 0) {
    // A new phase: it roars (a breath of time), quicker from now on.
    m.phase = after;
    sim.dropMarker(m);
    m.mode = '';
    m.tappable = true;
    m.setState('wake');
    m.stateTime = 0.4;
    sim.emit({ type: 'guardian', mob: m, phase: 'phase' });
    sim.sfx(m, 'guardian.phase');
  }
  return { damage: d, armoured, weak };
}

/** The HUD's view of a guardian. */
export function guardianState(m: SimMob): GuardianState {
  const def = gdef(m);
  const key = `mob.${m.kind}`;
  return {
    id: m.id,
    kind: m.kind as GuardianKind,
    biome: m.lair?.biome ?? m.biome,
    name: hasText(key) ? t(key as TextKey) : m.kind,
    nameKey: key,
    hp: Math.max(0, Math.round(m.hp ?? 0)),
    max: m.maxHp ?? def.hp,
    phase: m.phase,
    phases: def.patterns.length,
    status: m.dying ? 'defeated' : m.state === 'sleep' ? 'dormant' : 'awake',
    vulnerable: m.vulnerable,
    telegraph: m.state === 'windup' && m.pattern ? `mob.pattern.${m.pattern}` : null,
  };
}
