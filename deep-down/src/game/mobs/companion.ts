import type { MobSim, SimMob } from './MobSim';
import type { MobContext, MobKind, MobRarity, MobSize } from './types';

/**
 * The companion (round 3 stretch, MOBS; BRIEF §6): a Lampling tamed with glowcaps (three fed to
 * a wild one) follows the explorer from then on, across the strata and saves:
 * - it lights the way (the lantern burns brighter while it is near, more with each level);
 * - it senses rare ores through the rock and chirps, hovering by the vein a moment;
 * - it zaps small foes near the explorer with a mote of light;
 * - it levels up (1..5) from what it does with the explorer: ores found and mined, foes zapped,
 *   glowcaps fed. Each level: more light, a wider sense, harder and quicker zaps, bigger foes.
 * LOOP owns the taming item and the feeding economy (glowcaps today); UI draws its HUD chip from
 * `MobDirector.companion()`.
 */
export interface CompanionState {
  kind: MobKind;
  level: number;
  xp: number;
}

export interface CompanionView {
  kind: MobKind;
  name: string;
  level: number;
  xp: number;
  /** Experience at which the next level comes (null at the top level). */
  next: number | null;
  /** What it is doing: following, scouting an ore, zapping a foe. */
  state: 'follow' | 'scout' | 'fight';
  /** 0..1: its glow (brighter fed and levelled). */
  glow: number;
}

/** Glowcaps a wild Lampling must be fed to trust the explorer. */
export const TAME_NEED = 3;
/** Experience per deed. */
export const XP = { fed: 3, oreFound: 1, oreMined: 2, zapKill: 1 };
/** The experience each level starts at (level 1 at 0). */
export const LEVELS: readonly number[] = [0, 5, 12, 22, 35];
export const MAX_LEVEL = LEVELS.length;

export function levelFor(xp: number): number {
  let l = 1;
  for (let i = 1; i < LEVELS.length; i++) if (xp >= LEVELS[i]) l = i + 1;
  return l;
}

export function nextLevelXp(level: number): number | null {
  return level >= MAX_LEVEL ? null : LEVELS[level];
}

/** The lantern's boost while it follows (1.1 at level 1 .. 1.22 at 5). */
export function lightBoost(level: number): number {
  return 1.1 + 0.03 * (Math.max(1, Math.min(MAX_LEVEL, level)) - 1);
}

/** Its ore sense's reach (m). */
export function senseRange(level: number): number {
  return 8 + 1.5 * (level - 1);
}

/** A zap: its damage and the seconds between two. */
export function zapDamage(level: number): number {
  return 1 + 0.75 * (level - 1);
}

export function zapEvery(level: number): number {
  return 3 - 0.25 * (level - 1);
}

/** The biggest foes it will zap: small ones, medium from level 3. */
export function zapSizes(level: number): ReadonlySet<MobSize> {
  return new Set<MobSize>(level >= 3 ? ['tiny', 'small', 'medium'] : ['tiny', 'small']);
}

const RARITY: readonly MobRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
/** Where it pops back to round the explorer (feet-relative), the first open one. */
const POP: ReadonlyArray<readonly [number, number, number]> = [
  [0.6, 1.9, 0.6],
  [-0.6, 1.9, 0.6],
  [0.6, 1.9, -0.6],
  [-0.6, 1.9, -0.6],
  [0, 1.95, 0],
  [0.35, 1.3, 0.35],
  [0, 1.2, 0],
];

/** What the companion's sense needs from the world (MobDirector wires it to the voxels and LOOP's rarities). */
export interface CompanionWorld {
  block(x: number, y: number, z: number): number;
  /** 0 common .. 4 legendary, or -1 for no ore. */
  oreRarity(block: number): number;
}

/** Events the companion's brain reports (MobDirector turns them into bus events, sounds and experience). */
export type CompanionEvent =
  | { what: 'ore'; x: number; y: number; z: number; block: number; rarity: MobRarity }
  | { what: 'zap'; target: SimMob; damage: number; killed: boolean };

/**
 * The companion's body in the current stratum: one tame Lampling, driven each frame. It never
 * despawns by distance (it catches up, or is placed near the explorer again after a switch).
 */
export class CompanionBrain {
  /** Ore cells already chirped about (key -> sim clock), so a vein is announced once a minute. */
  private readonly told = new Map<number, number>();
  private senseIn = 1;
  private zapIn = 2;
  private scoutLeft = 0;
  private readonly ore = { x: 0, y: 0, z: 0 };
  /** The rarity colour it glows in while scouting (-1: none). */
  scoutRarity = -1;
  state: CompanionView['state'] = 'follow';
  zapTarget = 0;
  /** The last zap's ray, for the renderer (seconds left of its flash). */
  readonly zap = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0, t: 0 };

  constructor(private readonly world: CompanionWorld) {}

  step(sim: MobSim, m: SimMob, dt: number, ctx: MobContext, level: number, out: CompanionEvent[]): void {
    const p = ctx.player;
    this.zap.t = Math.max(0, this.zap.t - dt);
    // Senses: an ore every 1.5 s, a foe every few seconds.
    this.senseIn -= dt;
    if (this.senseIn <= 0) {
      this.senseIn = 1.5;
      const e = this.sense(sim, m, level);
      if (e) {
        out.push(e);
        this.ore.x = e.x + 0.5;
        this.ore.y = e.y + 0.5;
        this.ore.z = e.z + 0.5;
        this.scoutLeft = 4;
        this.scoutRarity = RARITY.indexOf(e.rarity);
      }
    }
    this.zapIn -= dt;
    if (this.zapIn <= 0) {
      const e = this.fight(sim, m, ctx, level);
      this.zapIn = e ? zapEvery(level) : 0.5;
      if (e) out.push(e);
    }
    // Where it flies: by the ore it found, else ahead of the explorer at head height.
    let tx: number;
    let ty: number;
    let tz: number;
    let speed = 4.6;
    this.scoutLeft = Math.max(0, this.scoutLeft - dt);
    if (this.scoutLeft > 0 && Math.hypot(this.ore.x - p.x, this.ore.z - p.z) < senseRange(level) + 4) {
      this.state = 'scout';
      const a = sim.clock * 2.2;
      // Hover on the explorer's side of the vein (it cannot fly into the rock).
      const dx = p.x - this.ore.x;
      const dz = p.z - this.ore.z;
      const l = Math.max(0.01, Math.hypot(dx, dz));
      tx = this.ore.x + (dx / l) * 1.1 + Math.sin(a) * 0.25;
      ty = this.ore.y + 0.2 + Math.sin(a * 1.3) * 0.15;
      tz = this.ore.z + (dz / l) * 1.1 + Math.cos(a) * 0.25;
    } else {
      this.scoutRarity = -1;
      this.state = this.zap.t > 0 ? 'fight' : 'follow';
      const moving = Math.hypot(p.vx, p.vz) > 0.4;
      const yaw = moving ? Math.atan2(p.vx, p.vz) : sim.clock * 0.25;
      const side = 0.9;
      const ahead = moving ? 2.2 : 1.5;
      tx = p.x + Math.sin(yaw) * ahead + Math.cos(yaw) * side;
      ty = p.y + 1.95 + Math.sin(sim.clock * 2.1) * 0.18;
      tz = p.z + Math.cos(yaw) * ahead - Math.sin(yaw) * side;
    }
    const d = Math.hypot(m.position.x - p.x, m.position.y - p.y, m.position.z - p.z);
    if (d > 7) speed = 9;
    sim.flyToward(m, tx, ty, tz, speed, dt, 4);
    // Lost (a fall, a ride, a stratum switch) or caught in rock: it pops back beside the explorer,
    // at the first open spot round the head (in a low tunnel, by the explorer's own shoulder).
    const s = sim.env.solid;
    if (d > 26 || s(Math.floor(m.position.x), Math.floor(m.position.y), Math.floor(m.position.z))) {
      for (const [ox, oy, oz] of POP) {
        const x = p.x + ox;
        const y = p.y + oy;
        const z = p.z + oz;
        if (s(Math.floor(x), Math.floor(y), Math.floor(z))) continue;
        m.position.set(x, y, z);
        break;
      }
      m.vel.x = m.vel.y = m.vel.z = 0;
    }
  }

  /** The rarest ore within reach not told about in the last minute (rare and better). */
  private sense(sim: MobSim, m: SimMob, level: number): Extract<CompanionEvent, { what: 'ore' }> | null {
    const R = senseRange(level);
    const r = Math.ceil(R);
    const cx = Math.floor(m.position.x);
    const cy = Math.floor(m.position.y);
    const cz = Math.floor(m.position.z);
    let best: { x: number; y: number; z: number; block: number; rank: number; d: number } | null = null;
    const now = sim.clock;
    for (let dy = -r; dy <= r; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const dd = dx * dx + dy * dy + dz * dz;
          if (dd > R * R) continue;
          const x = cx + dx;
          const y = cy + dy;
          const z = cz + dz;
          const id = this.world.block(x, y, z);
          if (!id) continue;
          const rank = this.world.oreRarity(id);
          if (rank < 2) continue;
          if (best && (rank < best.rank || (rank === best.rank && dd >= best.d))) continue;
          const key = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
          const at = this.told.get(key);
          if (at !== undefined && now - at < 60) continue;
          best = { x, y, z, block: id, rank, d: dd };
        }
    if (!best) return null;
    this.told.set((best.x * 73856093) ^ (best.y * 19349663) ^ (best.z * 83492791), now);
    if (this.told.size > 400) for (const [k, t] of this.told) if (now - t > 60) this.told.delete(k);
    return { what: 'ore', x: best.x, y: best.y, z: best.z, block: best.block, rarity: RARITY[best.rank] };
  }

  /** Zap the nearest small foe near the explorer that it can see. */
  private fight(sim: MobSim, m: SimMob, ctx: MobContext, level: number): Extract<CompanionEvent, { what: 'zap' }> | null {
    const sizes = zapSizes(level);
    let best: SimMob | null = null;
    let bestD = Infinity;
    for (const o of sim.mobs) {
      if (!o.hostile || o.dying || o.guardian || o.mode === 'under' || o.fade < 0.6 || !sizes.has(o.def.size)) continue;
      if (o.brain === 'mimic' && o.state === 'sleep') continue;
      const dp = Math.hypot(o.position.x - ctx.player.x, o.position.z - ctx.player.z);
      if (dp > 7) continue;
      const dm = o.position.distanceTo(m.position);
      // Those already pressing the explorer first.
      const score = dm - (o.state === 'windup' || o.state === 'attack' ? 4 : 0);
      if (score >= bestD || !sim.clearSight(m.position, o.position)) continue;
      best = o;
      bestD = score;
    }
    if (!best) return null;
    const damage = zapDamage(level);
    const r = sim.hit(best, damage, { light: true, from: { x: m.position.x, y: m.position.y, z: m.position.z }, knock: 0.6 });
    this.zap.x0 = m.position.x;
    this.zap.y0 = m.position.y;
    this.zap.z0 = m.position.z;
    this.zap.x1 = best.position.x;
    this.zap.y1 = best.position.y;
    this.zap.z1 = best.position.z;
    this.zap.t = 0.35;
    this.zapTarget = best.id;
    return { what: 'zap', target: best, damage: r.damage ?? damage, killed: r.killed };
  }
}
