import * as THREE from 'three';
import { Rng } from '../../core/rng';
import { MOB_DEFS, MOBS_RULES, monsterBudget, packSize, type MobDef } from './config';
import { clearLine, clingable, crawlNext, floorNear, flyStep, headroom, standableFor, surfaceNormal, walkStep, type SolidFn, type V3 } from './nav';
import type { Mob, MobContext, MobFamily, MobHitResult, MobKind, MobRarity, MobRay, MobState, MobStrike } from './types';

/**
 * The creatures' simulation (round 2, MOBS): spawning, the brains of the twelve kinds, combat, the
 * light rules and the projectiles. No three.js objects but vectors, no game references: it reads
 * the world through `MobEnv` and reports what happens as `MobSimEvent`s (the facade, MobSystem,
 * turns them into damage, drops, sounds and hints). Unit-tested in Node.
 *
 * Survival rules (ROUND2 §0.9): monsters appear from the Hollow down, more of them deeper; never in
 * the lantern's pool, never in the camp, never in lit places; every attack is telegraphed (a
 * wind-up with its own sound and pose); the lantern is the explorer's safety: crawlers keep to the
 * edge of its light and recoil from a raised flame, the Stalker only comes when the flame is dim.
 */
export interface MobEnv {
  solid: SolidFn;
  /** Placed light at a cell (lamps, crystals: the light volume's brightest channel, 0..1). */
  light(x: number, y: number, z: number): number;
  inCamp(x: number, y: number, z: number): boolean;
  /** Displayed depth (m) of a world height. */
  depthOf(y: number): number;
}

export type MobSimEvent =
  | { type: 'spawn'; mob: SimMob }
  | { type: 'gone'; mob: SimMob }
  | { type: 'telegraph'; mob: SimMob }
  | { type: 'attack'; mob: SimMob; damage: number; landed: boolean }
  | { type: 'hit'; mob: SimMob; damage: number; killed: boolean; armoured: boolean }
  | { type: 'die'; mob: SimMob }
  | { type: 'recoil'; mob: SimMob }
  | { type: 'wake'; mob: SimMob }
  | { type: 'interact'; mob: SimMob; action: 'caught' | 'harvested' | 'spores' | 'petted' }
  | { type: 'drain'; mob: SimMob; seconds: number }
  | { type: 'cue'; mob: SimMob; cue: 'breath' | 'chitter' | 'whisper' | 'drone' | 'grind' | 'chirp' | 'squeak' | 'groan' | 'chime' }
  | { type: 'meet'; mob: SimMob }
  | { type: 'shot'; shot: Shot; phase: 'fly' | 'hit' | 'miss' };

export interface Shot {
  id: number;
  p: THREE.Vector3;
  v: THREE.Vector3;
  target: number;
  dmg: number;
  life: number;
  /** Seconds since it landed (the light shard glows a while where it fell); -1 while flying. */
  landed: number;
}

/** A guarded relic: the Stone Sentinel sleeps by it and wakes when it is taken. */
export interface SentinelSite {
  relic: string;
  x: number;
  y: number;
  z: number;
}

let nextId = 1;

/** One creature. Public fields are read by the renderer (poses) and the tests. */
export class SimMob implements Mob {
  readonly id = nextId++;
  readonly family: MobFamily;
  readonly position = new THREE.Vector3();
  readonly bounds: { radius: number; halfHeight: number };
  readonly hostile: boolean;
  readonly def: MobDef;
  yaw = 0;
  hp?: number;
  maxHp?: number;
  state: MobState = 'idle';
  stateTime = 0;
  tappable = true;
  rarity?: MobRarity;
  object?: THREE.Object3D;
  /** Feet (walkers), cell (crawlers), the home (nest, roost, guard post). */
  readonly foot = { x: 0, y: 0, z: 0 };
  readonly cell = { x: 0, y: 0, z: 0 };
  readonly next = { x: 0, y: 0, z: 0 };
  readonly normal = { x: 0, y: 1, z: 0 };
  /** The smoothed surface normal a crawler's body is oriented to. */
  readonly up = new THREE.Vector3(0, 1, 0);
  readonly vel = { x: 0, y: 0, z: 0 };
  readonly home = { x: 0, y: 0, z: 0 };
  readonly goal = { x: 0, y: 0, z: 0 };
  /** Animation: stride phase, current speed, jaw / shell open 0..1, strike 0..1, alertness 0..1, glow 0..1. */
  gait = 0;
  speedNow = 0;
  open = 0;
  strike = 0;
  alert = 0;
  glow = 1;
  /** Hit flash 0..1 (on the mob only), and the fade-in / dissolve 0..1 (1 = solid). */
  flash = 0;
  fade = 0;
  cooldown = 0;
  timer = 0;
  /** A crawler pack, a lampling nest group. */
  group = 0;
  /** A Shellback's crystals, a burrower's pouch (1: full), the treasure thief. */
  crystals = 0;
  carry = 0;
  treasure = false;
  /** Per-mob variation 0..1 (size, hue, gait). */
  readonly seed: number;
  scale = 1;
  /** The Sentinel's relic, the worm's pass. */
  relic = '';
  path: { ax: number; ay: number; az: number; bx: number; by: number; bz: number; t: number; len: number; amp: number } | null = null;
  /** Set once a kind's first meeting has been announced for this mob. */
  met = false;
  /** Has struck the explorer during this attack. */
  landed = false;
  stuck = 0;
  /** Seconds since a burrower woke (it digs away after ~14 s). */
  timer2 = 0;

  constructor(readonly kind: MobKind, seed: number) {
    const d = MOB_DEFS[kind];
    this.def = d;
    this.family = d.family;
    this.hostile = d.family === 'monster' && kind !== 'worm';
    this.seed = seed;
    this.scale = 1;
    this.bounds = { radius: d.radius, halfHeight: d.halfHeight };
    if (this.hostile) {
      this.hp = d.hp;
      this.maxHp = d.hp;
    }
    this.rarity = d.rarity;
    this.tappable = kind !== 'moth' && kind !== 'worm';
  }

  setState(s: MobState): void {
    if (this.state === s) return;
    this.state = s;
    this.stateTime = 0;
  }

  get dying(): boolean {
    return this.state === 'dying';
  }
}

const tmpA: V3 = { x: 0, y: 0, z: 0 };
const tmpB: V3 = { x: 0, y: 0, z: 0 };
const tmpN: V3 = { x: 0, y: 0, z: 0 };

export class MobSim {
  readonly mobs: SimMob[] = [];
  readonly shots: Shot[] = [];
  readonly rng: Rng;
  /** Lantern intensity factor from the wisps (1 = untouched). */
  dim = 1;
  /** Lantern boost from lamplings and jelly spores (1 = none). */
  boost = 1;
  /** Seconds of jelly boost left. */
  boostLeft = 0;
  /** Monsters stop spawning (tests, the menu). */
  spawning = true;
  /** Brains off (captures): creatures hold still, still breathing. */
  brains = true;
  monsterDepth: number = MOBS_RULES.monsterDepth;
  sentinelSites: SentinelSite[] = [];
  /** Relics already taken / Sentinels already beaten (no Sentinel there). */
  readonly sentinelDone = new Set<string>();
  /** Points the Deep Worm may pass (far chasms, the lake), besides the automatic vista finder. */
  wormAnchors: V3[] = [];
  private listeners: Array<(e: MobSimEvent) => void> = [];
  private attemptIn = 2;
  private lastMonster = -Infinity;
  private lastBeing = -Infinity;
  private lastStalker = -Infinity;
  private lastWorm = -Infinity;
  private clock = 0;
  private nextShot = 1;
  private nextGroup = 1;
  private readonly packNext = new Map<number, number>();
  ctx: MobContext | null = null;

  constructor(readonly env: MobEnv, seed = 0x4d0b5) {
    this.rng = new Rng(seed);
    // The first meeting of the session must not be at boot.
    this.lastWorm = -MOBS_RULES.wormGap * 0.6;
  }

  on(fn: (e: MobSimEvent) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((f) => f !== fn);
    };
  }

  private emit(e: MobSimEvent): void {
    for (const fn of this.listeners) fn(e);
  }

  get time(): number {
    return this.clock;
  }

  count(family?: MobFamily, kind?: MobKind): number {
    let n = 0;
    for (const m of this.mobs) if (!m.dying && (!family || m.family === family) && (!kind || m.kind === kind)) n++;
    return n;
  }

  // ------------------------------------------------------------------------------------
  // Spawning

  /** Put a mob in the world at a point (feet for walkers, the nearest clingable cell for crawlers). @returns null where it cannot stand. */
  spawn(kind: MobKind, x: number, y: number, z: number, opts: { group?: number; treasure?: boolean; relic?: string; asleep?: boolean } = {}): SimMob | null {
    const m = new SimMob(kind, this.rng.next());
    const d = m.def;
    const s = this.env.solid;
    m.group = opts.group ?? 0;
    if (d.locomotion === 'walk' || d.locomotion === 'still') {
      const h = this.heightOf(m);
      const fx = Math.floor(x);
      const fz = Math.floor(z);
      const fy = floorNear(s, fx, Math.floor(y), fz, h, 4);
      if (fy === null) return null;
      m.foot.x = fx + 0.5;
      m.foot.y = fy;
      m.foot.z = fz + 0.5;
    } else if (d.locomotion === 'crawl') {
      const c = this.nearestCling(Math.floor(x), Math.floor(y), Math.floor(z));
      if (!c) return null;
      m.cell.x = m.next.x = c.x;
      m.cell.y = m.next.y = c.y;
      m.cell.z = m.next.z = c.z;
      surfaceNormal(s, c.x, c.y, c.z, m.normal);
      m.up.set(m.normal.x, m.normal.y, m.normal.z);
      this.crawlAnchor(m, m.cell, tmpA);
      m.position.set(tmpA.x, tmpA.y, tmpA.z);
    } else {
      if (s(Math.floor(x), Math.floor(y), Math.floor(z))) return null;
      m.position.set(x, y, z);
    }
    m.home.x = x;
    m.home.y = y;
    m.home.z = z;
    m.goal.x = x;
    m.goal.y = y;
    m.goal.z = z;
    m.yaw = this.rng.range(-Math.PI, Math.PI);
    m.scale = this.scaleFor(kind, m.seed);
    // The capsule is the drawn size (FP's screen snap and the pick read it as is).
    m.bounds.radius = d.radius * m.scale;
    m.bounds.halfHeight = d.halfHeight * m.scale;
    if (kind === 'shellback') m.crystals = 3 + (m.seed > 0.6 ? 1 : 0);
    if (kind === 'burrower') {
      m.carry = 1;
      m.treasure = opts.treasure === true;
      if (m.treasure) m.rarity = 'legendary';
      m.setState('wake');
    }
    if (kind === 'sentinel') {
      m.relic = opts.relic ?? '';
      m.setState(opts.asleep === false ? 'wake' : 'sleep');
      m.glow = 0.15;
    } else if (kind === 'gnasher') m.setState('sleep');
    else if (kind === 'stalker') m.setState('lurk');
    else if (kind === 'crawler') m.setState('lurk');
    else if (kind === 'wisp') m.setState('wander');
    else if (kind !== 'burrower') m.setState('idle');
    if (d.locomotion === 'walk' || d.locomotion === 'still') this.placeWalker(m);
    this.mobs.push(m);
    this.emit({ type: 'spawn', mob: m });
    return m;
  }

  private scaleFor(kind: MobKind, seed: number): number {
    // Varied sizes within a kind: crawlers from small to medium, the rest a little either way.
    if (kind === 'crawler') return 0.7 + seed * 0.55;
    if (kind === 'glimmerkin' || kind === 'burrower' || kind === 'lampling') return 0.88 + seed * 0.24;
    if (kind === 'moth') return 0.75 + seed * 0.5;
    return 0.92 + seed * 0.16;
  }

  private heightOf(m: SimMob): number {
    return m.kind === 'stalker' ? 2 : m.kind === 'sentinel' ? 3 : m.kind === 'shellback' || m.kind === 'gnasher' ? 2 : 1;
  }

  private nearestCling(x: number, y: number, z: number): V3 | null {
    const s = this.env.solid;
    for (let r = 0; r <= 3; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
            if (clingable(s, x + dx, y + dy, z + dz)) return { x: x + dx, y: y + dy, z: z + dz };
          }
    return null;
  }

  /** Where a crawler's body sits in a cell: hugging its rock (the cell centre moved toward the surface). */
  private crawlAnchor(m: SimMob, c: V3, out: V3): V3 {
    surfaceNormal(this.env.solid, c.x, c.y, c.z, tmpN);
    const off = 0.5 - m.def.lift * m.scale;
    out.x = c.x + 0.5 - tmpN.x * off;
    out.y = c.y + 0.5 - tmpN.y * off;
    out.z = c.z + 0.5 - tmpN.z * off;
    return out;
  }

  private placeWalker(m: SimMob): void {
    m.position.set(m.foot.x, m.foot.y + m.def.lift * m.scale, m.foot.z);
  }

  /** The lantern's bright pool now (m): crawlers keep out of it, the Stalker waits beyond it. */
  brightRadius(ctx: MobContext): number {
    const l = ctx.lantern;
    if (!l.lit) return 0;
    const r = l.radius * 0.55 * Math.max(0, Math.min(1, l.flame));
    return l.raised ? r * 1.5 + 1.5 : r;
  }

  /** May a monster spawn in this cell now? (dark, outside the pool and the camp, deep enough). Pure, unit-tested. */
  canSpawnMonster(x: number, y: number, z: number, ctx: MobContext): boolean {
    const env = this.env;
    if (env.inCamp(x + 0.5, y, z + 0.5)) return false;
    if (env.depthOf(y) < this.monsterDepth) return false;
    if (env.light(x, y, z) > MOBS_RULES.darkLight) return false;
    const l = ctx.lantern;
    const pool = l.lit ? l.radius * MOBS_RULES.poolFactor * Math.max(0.35, l.flame) + MOBS_RULES.poolMargin : MOBS_RULES.poolMargin + 4;
    if (Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y, z + 0.5 - l.z) < pool) return false;
    if (Math.hypot(x + 0.5 - ctx.player.x, y + 0.5 - ctx.player.y, z + 0.5 - ctx.player.z) < MOBS_RULES.spawnMin) return false;
    return true;
  }

  private canSpawnBeing(x: number, y: number, z: number, ctx: MobContext): boolean {
    if (this.env.inCamp(x + 0.5, y, z + 0.5)) return false;
    if (this.env.depthOf(y) < MOBS_RULES.beingDepth) return false;
    return Math.hypot(x + 0.5 - ctx.player.x, y + 0.5 - ctx.player.y, z + 0.5 - ctx.player.z) >= 7;
  }

  /** A random cell of the wanted shape in the spawn shell. */
  private findCell(ctx: MobContext, shape: 'floor' | 'cling' | 'air', ok: (x: number, y: number, z: number) => boolean, height = 1, minR: number = MOBS_RULES.spawnMin, maxR: number = MOBS_RULES.spawnMax): V3 | null {
    const s = this.env.solid;
    const r = this.rng;
    for (let tries = 0; tries < 28; tries++) {
      const a = r.range(-Math.PI, Math.PI);
      const d = r.range(minR, maxR);
      const x = Math.floor(ctx.player.x + Math.sin(a) * d);
      const z = Math.floor(ctx.player.z + Math.cos(a) * d);
      const y0 = Math.floor(ctx.player.y + r.range(-5, 4));
      for (let k = 0; k < 9; k++) {
        const y = y0 + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
        let fits: boolean;
        if (shape === 'floor') fits = standableFor(s, x, y, z, height);
        else if (shape === 'cling') fits = clingable(s, x, y, z);
        else fits = !s(x, y, z) && !s(x, y - 1, z) && !s(x, y + 1, z) && headroom(s, x, y - 2, z, 6) >= 4;
        if (fits && ok(x, y, z)) return { x, y, z };
      }
    }
    return null;
  }

  private spawner(dt: number, ctx: MobContext): void {
    this.attemptIn -= dt;
    if (this.attemptIn > 0 || ctx.atCamp) return;
    this.attemptIn = MOBS_RULES.attemptEvery;
    // The Sentinel sleeps by its relic until it is taken (placed, not bred: even with the spawner off).
    for (const site of this.sentinelSites) {
      if (this.sentinelDone.has(site.relic)) continue;
      if (this.mobs.some((m) => m.kind === 'sentinel' && m.relic === site.relic)) continue;
      if (Math.hypot(site.x - ctx.player.x, site.y - ctx.player.y, site.z - ctx.player.z) > 34) continue;
      this.spawn('sentinel', site.x, site.y, site.z, { relic: site.relic });
    }
    if (!this.spawning) return;
    const depth = ctx.depth;
    const now = this.clock;
    const r = this.rng;
    const budget = monsterBudget(depth, this.monsterDepth);
    const monsters = this.count('monster') - this.count('monster', 'worm') - this.count('monster', 'sentinel');
    if (monsters < budget && now - this.lastMonster >= MOBS_RULES.monsterGap) {
      const okM = (x: number, y: number, z: number) => this.canSpawnMonster(x, y, z, ctx);
      let kind: MobKind;
      const deep = depth >= this.monsterDepth + 20;
      if (deep && now - this.lastStalker >= MOBS_RULES.stalkerGap && this.count(undefined, 'stalker') === 0 && r.int(0, MOBS_RULES.stalkerOdds - 1) === 0) kind = 'stalker';
      else {
        const roll = r.next();
        kind = roll < 0.5 ? 'crawler' : roll < 0.78 ? 'wisp' : 'gnasher';
        if (kind === 'wisp' && this.count(undefined, 'wisp') >= 2) kind = 'crawler';
        if (kind === 'gnasher' && this.count(undefined, 'gnasher') >= 2) kind = 'crawler';
      }
      let made = 0;
      if (kind === 'crawler') {
        const c = this.findCell(ctx, 'cling', okM);
        if (c) {
          const n = Math.min(packSize(depth, r.next(), this.monsterDepth), budget - monsters + 1);
          const g = this.nextGroup++;
          for (let i = 0; i < n; i++) {
            const m = this.spawn('crawler', c.x + r.int(-1, 1), c.y, c.z + r.int(-1, 1), { group: g });
            if (m) made++;
          }
        }
      } else if (kind === 'wisp') {
        const c = this.findCell(ctx, 'air', okM);
        if (c && this.spawn('wisp', c.x + 0.5, c.y + 0.5, c.z + 0.5)) made++;
      } else if (kind === 'gnasher') {
        // An ambush: on the floor a little nearer the way, but still in the dark.
        const c = this.findCell(ctx, 'floor', okM, 2, MOBS_RULES.spawnMin, MOBS_RULES.spawnMin + 7);
        if (c && this.spawn('gnasher', c.x + 0.5, c.y, c.z + 0.5)) made++;
      } else {
        const c = this.findCell(ctx, 'floor', okM, 2, MOBS_RULES.spawnMin, MOBS_RULES.spawnMin + 5);
        if (c && this.spawn('stalker', c.x + 0.5, c.y, c.z + 0.5)) {
          made++;
          this.lastStalker = now;
        }
      }
      if (made > 0) this.lastMonster = now;
    }
    // Beings: a few about from the tunnel down (never at camp).
    if (depth >= MOBS_RULES.beingDepth && now - this.lastBeing >= MOBS_RULES.beingGap && this.beingCount() < MOBS_RULES.maxBeings) {
      const okB = (x: number, y: number, z: number) => this.canSpawnBeing(x, y, z, ctx);
      const roll = r.next();
      let made = false;
      if (roll < 0.22) {
        const c = this.findCell(ctx, 'floor', okB, 1, 8, 18);
        if (c) made = !!this.spawn('glimmerkin', c.x + 0.5, c.y, c.z + 0.5);
      } else if (roll < 0.36) {
        if (this.count(undefined, 'shellback') === 0) {
          const c = this.findCell(ctx, 'floor', okB, 2, 9, 20);
          if (c) made = !!this.spawn('shellback', c.x + 0.5, c.y, c.z + 0.5);
        }
      } else if (roll < 0.52) {
        if (this.count(undefined, 'jelly') < 2) {
          const c = this.findCell(ctx, 'air', okB, 1, 9, 22);
          if (c) made = !!this.spawn('jelly', c.x + 0.5, c.y + 1.5, c.z + 0.5);
        }
      } else if (roll < 0.7) {
        if (this.count(undefined, 'lampling') === 0) {
          const c = this.findCell(ctx, 'air', okB, 1, 8, 16);
          if (c) {
            const g = this.nextGroup++;
            const n = 2 + r.int(0, 1);
            for (let i = 0; i < n; i++) made = !!this.spawn('lampling', c.x + 0.5 + r.range(-0.6, 0.6), c.y + 0.5 + r.range(-0.3, 0.3), c.z + 0.5 + r.range(-0.6, 0.6), { group: g }) || made;
          }
        }
      } else if (roll < 0.84) {
        if (this.count(undefined, 'moth') < 10) made = this.spawnMoths(ctx, 6 + r.int(0, 4)) > 0;
      } else if (this.count(undefined, 'burrower') === 0) {
        const c = this.findCell(ctx, 'floor', okB, 1, 5, 9);
        if (c) made = !!this.spawn('burrower', c.x + 0.5, c.y, c.z + 0.5);
      }
      if (made) this.lastBeing = now;
    }
  }

  private beingCount(): number {
    let n = 0;
    for (const m of this.mobs) if (!m.dying && m.family === 'being' && m.kind !== 'moth') n++;
    return n + (this.count(undefined, 'moth') > 0 ? 1 : 0);
  }

  /** A small cloud of lumen moths somewhere open nearby. @returns how many. */
  spawnMoths(ctx: MobContext, n: number, at?: V3): number {
    const c = at ?? this.findCell(ctx, 'air', (x, y, z) => this.canSpawnBeing(x, y, z, ctx), 1, 7, 15);
    if (!c) return 0;
    const g = this.nextGroup++;
    let k = 0;
    for (let i = 0; i < n; i++) {
      const m = this.spawn('moth', c.x + 0.5 + this.rng.range(-1, 1), c.y + 0.5 + this.rng.range(-0.5, 0.8), c.z + 0.5 + this.rng.range(-1, 1), { group: g });
      if (m) k++;
    }
    return k;
  }

  // ------------------------------------------------------------------------------------
  // The frame

  update(dt: number, ctx: MobContext): void {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    this.ctx = ctx;
    this.clock += dt;
    if (ctx.active) this.spawner(dt, ctx);
    let dim = 1;
    let followers = 0;
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      m.stateTime += dt;
      m.flash = Math.max(0, m.flash - dt / MOBS_RULES.flash);
      m.cooldown -= dt;
      if (m.dying) {
        m.fade = Math.max(0, m.fade - dt / (m.kind === 'sentinel' ? 2.4 : m.kind === 'wisp' ? 0.9 : 0.7));
        if (m.kind !== 'wisp' && m.kind !== 'moth' && m.kind !== 'jelly' && m.kind !== 'lampling') this.walkerSettle(m, dt);
        if (m.fade <= 0) {
          this.mobs.splice(i, 1);
          this.emit({ type: 'gone', mob: m });
        }
        continue;
      }
      m.fade = Math.min(1, m.fade + dt / 0.9);
      if (ctx.active && this.brains) this.brain(m, dt, ctx);
      this.animate(m, dt);
      if (m.kind === 'wisp' && m.state === 'attack') dim = Math.min(dim, MOBS_RULES.wispDim + (1 - MOBS_RULES.wispDim) * (1 - Math.min(1, m.stateTime / 1.5)));
      if (m.kind === 'lampling' && m.state === 'follow') followers++;
      // Put away what is far behind (and every monster when the explorer is home).
      const far = Math.hypot(m.position.x - ctx.player.x, m.position.y - ctx.player.y, m.position.z - ctx.player.z) > (m.kind === 'worm' ? 140 : m.kind === 'sentinel' ? 60 : MOBS_RULES.despawn);
      if (far || (ctx.atCamp && m.hostile && m.kind !== 'sentinel')) this.remove(m);
      // Monsters never enter the camp: one that strays in or above the Hollow's edge turns back.
      else if (m.hostile && (this.env.inCamp(m.position.x, m.position.y, m.position.z) || this.env.depthOf(m.position.y) < this.monsterDepth - 12)) this.remove(m);
    }
    this.dim += (dim - this.dim) * Math.min(1, dt * 3);
    this.boostLeft = Math.max(0, this.boostLeft - dt);
    const boost = (this.boostLeft > 0 ? MOBS_RULES.jellyBoost : 1) * (followers > 0 ? 1.1 : 1);
    this.boost += (boost - this.boost) * Math.min(1, dt * 2);
    this.updateShots(dt);
    if (ctx.active) this.wormDirector(ctx);
  }

  /** Fade a mob out now (despawn); 'gone' follows. */
  remove(m: SimMob): void {
    if (m.dying) return;
    m.setState('dying');
    m.tappable = false;
  }

  private walkerSettle(m: SimMob, dt: number): void {
    if (m.def.locomotion !== 'walk' && m.def.locomotion !== 'still') return;
    walkStep(this.env.solid, m.foot, 0, 0, dt, this.heightOf(m), m.bounds.radius);
    this.placeWalker(m);
  }

  // ------------------------------------------------------------------------------------
  // Brains

  private brain(m: SimMob, dt: number, ctx: MobContext): void {
    switch (m.kind) {
      case 'crawler':
        return this.crawler(m, dt, ctx);
      case 'gnasher':
        return this.gnasher(m, dt, ctx);
      case 'wisp':
        return this.wisp(m, dt, ctx);
      case 'stalker':
        return this.stalker(m, dt, ctx);
      case 'sentinel':
        return this.sentinel(m, dt, ctx);
      case 'worm':
        return this.worm(m, dt);
      case 'moth':
        return this.moth(m, dt, ctx);
      case 'lampling':
        return this.lampling(m, dt, ctx);
      case 'glimmerkin':
        return this.glimmerkin(m, dt, ctx);
      case 'shellback':
        return this.shellback(m, dt, ctx);
      case 'jelly':
        return this.jelly(m, dt, ctx);
      case 'burrower':
        return this.burrower(m, dt, ctx);
    }
  }

  private distToPlayer(m: SimMob, ctx: MobContext): number {
    return Math.hypot(m.position.x - ctx.player.x, m.position.y - (ctx.player.y + 1.0), m.position.z - ctx.player.z);
  }

  private flatDist(m: SimMob, ctx: MobContext): number {
    return Math.hypot(m.position.x - ctx.player.x, m.position.z - ctx.player.z);
  }

  private seesPlayer(m: SimMob, ctx: MobContext): boolean {
    tmpA.x = m.position.x;
    tmpA.y = m.position.y + 0.1;
    tmpA.z = m.position.z;
    return clearLine(this.env.solid, tmpA, ctx.eye) || clearLine(this.env.solid, tmpA, { x: ctx.player.x, y: ctx.player.y + 0.9, z: ctx.player.z });
  }

  private announce(m: SimMob, ctx: MobContext): void {
    if (m.met) return;
    if (this.distToPlayer(m, ctx) > (m.kind === 'worm' ? 80 : 13)) return;
    if (m.kind !== 'worm' && !this.seesPlayer(m, ctx)) return;
    m.met = true;
    this.emit({ type: 'meet', mob: m });
  }

  /** The crawler: on rock at the edge of the light, darting in from the dark, recoiling from a bright flame. */
  private crawler(m: SimMob, dt: number, ctx: MobContext): void {
    const bright = this.brightRadius(ctx);
    const l = ctx.lantern;
    const dl = Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z);
    const dp = this.distToPlayer(m, ctx);
    this.announce(m, ctx);
    let speed = m.def.speed * (0.85 + 0.3 * m.seed);
    let away = false;
    switch (m.state) {
      case 'lurk': {
        // Circle at the edge of the pool (each crawler at its own bearing, drifting slowly).
        const ring = Math.max(1.9, bright + 0.8);
        const a = this.clock * (0.22 + m.seed * 0.12) * (m.seed > 0.5 ? 1 : -1) + m.seed * 6.283 + m.group;
        m.goal.x = ctx.player.x + Math.sin(a) * ring;
        m.goal.y = ctx.player.y + 1 + Math.sin(a * 1.7) * 1.4;
        m.goal.z = ctx.player.z + Math.cos(a) * ring;
        if (l.raised && dl < bright + 1) {
          this.recoil(m);
          break;
        }
        if (dl < bright * 0.8 && l.flame > 0.5) away = true;
        const token = this.packNext.get(m.group) ?? 0;
        const bold = !l.lit ? 2.2 : l.flame < MOBS_RULES.dimFlame ? 1.6 : 1;
        // It strikes from the dark now and then, and at once when the explorer comes close (still telegraphed).
        const cornered = dp < 3.4 && m.stateTime > 0.5;
        if (m.cooldown <= 0 && this.clock >= token && dp < 9 + bold * 2 && m.stateTime > (cornered ? 0.5 : 1.2) && (cornered || this.rng.next() < dt * 0.55 * bold) && this.seesPlayer(m, ctx)) {
          m.setState('windup');
          m.landed = false;
          this.packNext.set(m.group, this.clock + 2.2 + this.rng.range(0, 1.5));
          this.emit({ type: 'telegraph', mob: m });
          this.emit({ type: 'cue', mob: m, cue: 'chitter' });
        }
        break;
      }
      case 'windup':
        speed = 0;
        if (m.stateTime >= m.def.windup) m.setState('attack');
        break;
      case 'attack': {
        speed = m.def.speed * 2.3;
        m.goal.x = ctx.player.x;
        m.goal.y = ctx.player.y + 1.0;
        m.goal.z = ctx.player.z;
        if (!m.landed && dp <= m.def.reach) {
          m.landed = true;
          this.emit({ type: 'attack', mob: m, damage: m.def.damage, landed: true });
          m.cooldown = m.def.cooldown;
          this.recoil(m, 1.6);
        } else if (m.stateTime > 2.6 || (l.raised && dl < bright)) {
          if (!m.landed) this.emit({ type: 'attack', mob: m, damage: 0, landed: false });
          m.cooldown = m.def.cooldown * 0.6;
          this.recoil(m);
        }
        break;
      }
      case 'recoil':
      case 'flee':
        speed = m.def.speed * 1.6;
        away = true;
        m.goal.x = ctx.player.x;
        m.goal.y = ctx.player.y + 1;
        m.goal.z = ctx.player.z;
        if (m.stateTime >= m.timer) m.setState('lurk');
        break;
      default:
        m.setState('lurk');
    }
    this.crawlMove(m, dt, speed, away, m.state === 'attack' ? 0 : bright, ctx);
  }

  private recoil(m: SimMob, seconds = 2.4): void {
    m.setState('recoil');
    m.timer = seconds;
    this.emit({ type: 'recoil', mob: m });
  }

  /** Step a crawler along the rock toward (or away from) its goal, avoiding the lantern's pool. */
  private crawlMove(m: SimMob, dt: number, speed: number, away: boolean, bright: number, ctx: MobContext): void {
    const s = this.env.solid;
    // The rock it clung to was mined away (or its next cell filled): back onto the nearest face.
    if (!clingable(s, m.next.x, m.next.y, m.next.z)) {
      const c = this.nearestCling(m.next.x, m.next.y, m.next.z);
      if (c) {
        m.next.x = c.x;
        m.next.y = c.y;
        m.next.z = c.z;
      }
    }
    this.crawlAnchor(m, m.next, tmpB);
    const dx = tmpB.x - m.position.x;
    const dy = tmpB.y - m.position.y;
    const dz = tmpB.z - m.position.z;
    const d = Math.hypot(dx, dy, dz);
    const step = speed * dt * m.scale ** 0.3;
    if (d <= Math.max(0.04, step)) {
      m.position.set(tmpB.x, tmpB.y, tmpB.z);
      m.cell.x = m.next.x;
      m.cell.y = m.next.y;
      m.cell.z = m.next.z;
      if (speed > 0) {
        const l = ctx.lantern;
        const camp = this.env;
        const cost = (x: number, y: number, z: number) => {
          let c = 0;
          if (bright > 0) {
            const dd = Math.hypot(x + 0.5 - l.x, y + 0.5 - l.y, z + 0.5 - l.z);
            if (dd < bright) c += (bright - dd) * 1.5;
          }
          if (camp.inCamp(x + 0.5, y, z + 0.5)) c += 100;
          return c;
        };
        if (!crawlNext(s, m.cell, m.goal, m.next, cost, () => this.rng.next(), away)) {
          m.next.x = m.cell.x;
          m.next.y = m.cell.y;
          m.next.z = m.cell.z;
        }
      }
      m.speedNow += (0 - m.speedNow) * Math.min(1, dt * 8);
    } else {
      const k = step / d;
      m.position.x += dx * k;
      m.position.y += dy * k;
      m.position.z += dz * k;
      m.speedNow += (speed - m.speedNow) * Math.min(1, dt * 8);
      // Facing: along the move, in the plane of the rock.
      if (Math.abs(dx) + Math.abs(dz) > 1e-4) m.yaw = dampAngle(m.yaw, Math.atan2(dx, dz), 10, dt);
    }
    surfaceNormal(s, m.cell.x, m.cell.y, m.cell.z, tmpN);
    const n = m.up;
    const kk = Math.min(1, dt * 7);
    n.set(n.x + (tmpN.x - n.x) * kk, n.y + (tmpN.y - n.y) * kk, n.z + (tmpN.z - n.z) * kk).normalize();
    m.gait += m.speedNow * dt * 5.5;
  }

  /** The Gnasher: a boulder that breathes; it opens its ring of crystal teeth when you come close. */
  private gnasher(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    const vdy = Math.abs(ctx.player.y - m.foot.y);
    switch (m.state) {
      case 'sleep':
        m.open += (0 - m.open) * Math.min(1, dt * 4);
        m.timer -= dt;
        if (m.timer <= 0 && dp < 10) {
          m.timer = 3.5 + this.rng.range(0, 2.5);
          this.emit({ type: 'cue', mob: m, cue: 'breath' });
        }
        if (dp < 3.3 && vdy < 2.5 && m.cooldown <= 0 && this.seesPlayer(m, ctx)) {
          this.announce(m, ctx);
          m.setState('windup');
          m.landed = false;
          this.emit({ type: 'telegraph', mob: m });
        }
        break;
      case 'windup':
        m.open = Math.min(1, m.stateTime / m.def.windup) * 0.75;
        this.face(m, ctx, dt, 6);
        if (m.stateTime >= m.def.windup) m.setState('attack');
        break;
      case 'attack':
        m.open = 1;
        this.face(m, ctx, dt, 6);
        // A short lunge, then the snap.
        if (m.stateTime < 0.25) this.walkToward(m, ctx.player.x, ctx.player.z, 3.2, dt);
        if (!m.landed && m.stateTime >= 0.18) {
          m.landed = true;
          const hitIt = this.flatDist(m, ctx) <= m.def.reach && vdy < 2.2;
          this.emit({ type: 'attack', mob: m, damage: hitIt ? m.def.damage : 0, landed: hitIt });
        }
        if (m.stateTime >= 0.4) {
          // Teeth out: the moment to strike it.
          m.setState('recoil');
          m.timer = 1.8;
          m.cooldown = m.def.cooldown;
        }
        break;
      case 'recoil':
        m.open += (0.85 - m.open) * Math.min(1, dt * 6);
        if (m.stateTime >= m.timer) m.setState('sleep');
        break;
      case 'flee':
        // Stunned by a flash: shut tight.
        m.open += (0 - m.open) * Math.min(1, dt * 10);
        if (m.stateTime >= m.timer) m.setState('sleep');
        break;
      default:
        m.setState('sleep');
    }
    this.walkerSettle(m, dt);
  }

  /** The Shade Wisp: drifting smoke that comes for the flame; it drinks the oil and dims the light. */
  private wisp(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const dl = Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z);
    this.announce(m, ctx);
    let tx = m.home.x + Math.sin(this.clock * 0.3 + m.seed * 9) * 3;
    let ty = m.home.y + Math.sin(this.clock * 0.5 + m.seed * 4) * 0.8;
    let tz = m.home.z + Math.cos(this.clock * 0.27 + m.seed * 7) * 3;
    let speed = m.def.speed * 0.6;
    // A raised flame burns it away.
    if (l.raised && dl < this.brightRadius(ctx)) {
      if (m.state !== 'recoil') this.recoil(m, 2.5);
      if (m.hp !== undefined) {
        m.hp -= dt * 2.2;
        m.flash = Math.max(m.flash, 0.35);
        if (m.hp <= 0) return this.kill(m);
      }
    }
    switch (m.state) {
      case 'wander':
      case 'idle':
        if (dl < 15 && l.lit && this.seesPlayer(m, ctx)) m.setState('stalk');
        break;
      case 'stalk': {
        speed = m.def.speed;
        const a = this.clock * 0.6 + m.seed * 6;
        tx = l.x + Math.sin(a) * 1.6;
        ty = l.y + 0.6;
        tz = l.z + Math.cos(a) * 1.6;
        if (dl < m.def.reach) {
          m.setState('attack');
          this.emit({ type: 'telegraph', mob: m });
        }
        if (dl > 22) m.setState('wander');
        break;
      }
      case 'attack': {
        // Feeding: it wraps the lantern, the flame gutters and the oil drains (a slow whisper).
        speed = m.def.speed * 0.8;
        const a = this.clock * 1.1 + m.seed * 6;
        tx = l.x + Math.sin(a) * 1.1;
        ty = l.y + 0.35 + Math.sin(a * 1.3) * 0.25;
        tz = l.z + Math.cos(a) * 1.1;
        if (l.lit) this.emit({ type: 'drain', mob: m, seconds: MOBS_RULES.wispDrain * dt });
        m.timer -= dt;
        if (m.timer <= 0) {
          m.timer = 2.2;
          this.emit({ type: 'cue', mob: m, cue: 'whisper' });
        }
        if (dl > m.def.reach * 1.8) m.setState('stalk');
        break;
      }
      case 'recoil':
      case 'flee':
        speed = m.def.speed * 2;
        tx = m.position.x + (m.position.x - l.x) * 2;
        ty = m.position.y + 0.5;
        tz = m.position.z + (m.position.z - l.z) * 2;
        if (m.stateTime >= m.timer) m.setState('stalk');
        break;
      default:
        m.setState('wander');
    }
    this.flyToward(m, tx, ty, tz, speed, dt, 1.2);
  }

  /** The Hollow Stalker: tall and thin at the edge of the light; it comes only when the flame is dim. */
  private stalker(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const flame = l.lit ? l.flame : 0;
    const full = (flame >= MOBS_RULES.fullFlame || l.raised) && l.lit;
    const dim = flame < MOBS_RULES.dimFlame && !l.raised;
    const dp = this.flatDist(m, ctx);
    const bright = this.brightRadius(ctx);
    this.announce(m, ctx);
    switch (m.state) {
      case 'lurk':
        this.face(m, ctx, dt, 2);
        m.alert += (0.4 - m.alert) * Math.min(1, dt * 2);
        if (full && dp < bright + 2) this.flee(m, 7);
        else if (dim && m.stateTime > 1.5) m.setState('stalk');
        else if (l.raised) this.flee(m, 7);
        break;
      case 'stalk':
        this.face(m, ctx, dt, 3);
        m.alert += (1 - m.alert) * Math.min(1, dt * 2);
        if (full) {
          this.flee(m, 7);
          break;
        }
        if (!dim) {
          m.setState('lurk');
          break;
        }
        this.walkToward(m, ctx.player.x, ctx.player.z, m.def.speed, dt);
        m.timer -= dt;
        if (m.timer <= 0) {
          m.timer = 4;
          this.emit({ type: 'cue', mob: m, cue: 'drone' });
        }
        if (dp <= m.def.reach) {
          m.setState('windup');
          m.landed = false;
          this.emit({ type: 'telegraph', mob: m });
        }
        break;
      case 'windup':
        this.face(m, ctx, dt, 4);
        m.strike = Math.min(1, m.stateTime / m.def.windup);
        if (full) {
          m.strike = 0;
          this.flee(m, 7);
          break;
        }
        if (m.stateTime >= m.def.windup) m.setState('attack');
        break;
      case 'attack':
        m.strike = 1 - Math.min(1, m.stateTime / 0.35);
        if (!m.landed) {
          m.landed = true;
          const hitIt = this.flatDist(m, ctx) <= m.def.reach + 0.4;
          this.emit({ type: 'attack', mob: m, damage: hitIt ? m.def.damage : 0, landed: hitIt });
        }
        if (m.stateTime >= 0.5) {
          m.cooldown = m.def.cooldown;
          this.flee(m, 3.5);
        }
        break;
      case 'flee':
      case 'recoil': {
        m.alert += (1 - m.alert) * Math.min(1, dt * 3);
        const ax = m.foot.x + (m.foot.x - ctx.player.x);
        const az = m.foot.z + (m.foot.z - ctx.player.z);
        const blocked = this.walkToward(m, ax, az, m.def.speed * 2.6, dt, true);
        m.stuck = blocked ? m.stuck + dt : 0;
        // Gone into the dark for good once far or out of sight.
        if (m.stateTime >= m.timer || dp > 22 || m.stuck > 1.5) {
          if (m.state === 'flee' && m.timer > 5) this.remove(m);
          else m.setState(m.cooldown > 0 ? 'lurk' : 'stalk');
        }
        break;
      }
      default:
        m.setState('lurk');
    }
    if (m.state !== 'stalk' && m.state !== 'flee' && m.state !== 'recoil') this.walkerSettle(m, dt);
  }

  private flee(m: SimMob, seconds: number): void {
    if (m.state === 'flee') return;
    m.setState('flee');
    m.timer = seconds;
    this.emit({ type: 'recoil', mob: m });
  }

  /** The Stone Sentinel: a Halden automaton; slow sweeps, then its core opens. */
  private sentinel(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    const dHome = Math.hypot(ctx.player.x - m.home.x, ctx.player.z - m.home.z);
    switch (m.state) {
      case 'sleep':
        m.glow += (0.12 - m.glow) * Math.min(1, dt * 2);
        m.open += (0 - m.open) * Math.min(1, dt * 2);
        return this.walkerSettle(m, dt);
      case 'wake':
        m.glow = Math.min(1, m.stateTime / 2);
        if (m.stateTime < dt * 1.5) {
          this.emit({ type: 'wake', mob: m });
          this.emit({ type: 'cue', mob: m, cue: 'grind' });
        }
        this.face(m, ctx, dt, 1.5);
        if (m.stateTime >= 2.2) {
          this.announce(m, ctx);
          m.setState('stalk');
        }
        return this.walkerSettle(m, dt);
      case 'stalk':
        m.glow += (0.7 - m.glow) * Math.min(1, dt * 3);
        m.open += (0 - m.open) * Math.min(1, dt * 4);
        this.face(m, ctx, dt, 1.8);
        if (dHome > 30) {
          // Leashed to its relic's hall: it walks back.
          this.walkToward(m, m.home.x, m.home.z, m.def.speed, dt);
          return;
        }
        if (dp > m.def.reach * 0.85) this.walkToward(m, ctx.player.x, ctx.player.z, m.def.speed, dt);
        else this.walkerSettle(m, dt);
        if (dp <= m.def.reach && m.cooldown <= 0) {
          m.setState('windup');
          m.landed = false;
          this.emit({ type: 'telegraph', mob: m });
          this.emit({ type: 'cue', mob: m, cue: 'grind' });
        }
        return;
      case 'windup':
        // The sweep is raised slowly: plenty of time to step back.
        m.strike = Math.min(1, m.stateTime / m.def.windup);
        this.face(m, ctx, dt, 1.2);
        if (m.stateTime >= m.def.windup) m.setState('attack');
        return this.walkerSettle(m, dt);
      case 'attack': {
        m.strike = 1 - Math.min(1, m.stateTime / 0.45);
        if (!m.landed && m.stateTime >= 0.2) {
          m.landed = true;
          const fx = Math.sin(m.yaw);
          const fz = Math.cos(m.yaw);
          const px = ctx.player.x - m.foot.x;
          const pz = ctx.player.z - m.foot.z;
          const front = (px * fx + pz * fz) / Math.max(0.01, Math.hypot(px, pz)) > Math.cos(1.25);
          const hitIt = front && dp <= m.def.reach + 0.3 && Math.abs(ctx.player.y - m.foot.y) < 2.5;
          this.emit({ type: 'attack', mob: m, damage: hitIt ? m.def.damage : 0, landed: hitIt });
        }
        if (m.stateTime >= 0.55) {
          // The core opens between sweeps: strike it now.
          m.setState('recoil');
          m.timer = 2.2;
          m.cooldown = m.def.cooldown;
        }
        return this.walkerSettle(m, dt);
      }
      case 'recoil':
        m.open += (1 - m.open) * Math.min(1, dt * 6);
        m.glow += (1 - m.glow) * Math.min(1, dt * 6);
        m.strike = 0;
        if (m.stateTime >= m.timer) m.setState('stalk');
        return this.walkerSettle(m, dt);
      case 'flee':
        // Stunned by a flash.
        m.open += (1 - m.open) * Math.min(1, dt * 6);
        if (m.stateTime >= m.timer) m.setState('stalk');
        return this.walkerSettle(m, dt);
      default:
        m.setState('stalk');
    }
  }

  /** Wake the Sentinel guarding `relic` (its relic was taken). @returns whether one woke. */
  wakeSentinel(relic: string): boolean {
    for (const m of this.mobs) {
      if (m.kind !== 'sentinel' || m.relic !== relic || m.dying) continue;
      if (m.state === 'sleep') {
        m.setState('wake');
        return true;
      }
      return false;
    }
    // Not spawned yet (the explorer took the relic from afar): it wakes where it stands.
    const site = this.sentinelSites.find((s) => s.relic === relic);
    if (!site || this.sentinelDone.has(relic)) return false;
    const m = this.spawn('sentinel', site.x, site.y, site.z, { relic, asleep: false });
    return m !== null;
  }

  /** The Deep Worm: a glimpse of something vast passing through a far chasm. */
  private worm(m: SimMob, dt: number): void {
    const p = m.path;
    if (!p) return this.remove(m);
    p.t += (m.def.speed * dt) / p.len;
    wormPoint(p, p.t, m.position);
    const ahead = new THREE.Vector3();
    wormPoint(p, p.t + 0.01, ahead);
    m.yaw = Math.atan2(ahead.x - m.position.x, ahead.z - m.position.z);
    m.timer -= dt;
    if (m.timer <= 0) {
      m.timer = 3.2;
      this.emit({ type: 'cue', mob: m, cue: 'groan' });
    }
    if (this.ctx) this.announce(m, this.ctx);
    // The whole body (about 30 m) has passed.
    if (p.t > 1 + 34 / p.len) {
      this.mobs.splice(this.mobs.indexOf(m), 1);
      this.emit({ type: 'gone', mob: m });
    }
  }

  /** Start a pass of the Deep Worm across `at`, crossing the explorer's view. */
  spawnWorm(at: V3, ctx: MobContext): SimMob | null {
    if (this.count(undefined, 'worm') > 0) return null;
    const vx = at.x - ctx.eye.x;
    const vz = at.z - ctx.eye.z;
    const l = Math.max(0.01, Math.hypot(vx, vz));
    // Across the line of sight.
    const sx = -vz / l;
    const sz = vx / l;
    const half = 26;
    const m = new SimMob('worm', this.rng.next());
    m.path = { ax: at.x - sx * half, ay: at.y - 3, az: at.z - sz * half, bx: at.x + sx * half, by: at.y + 2, bz: at.z + sz * half, t: -0.05, len: half * 2, amp: 4 + this.rng.range(0, 3) };
    wormPoint(m.path, m.path.t, m.position);
    m.setState('wander');
    m.tappable = false;
    m.fade = 1;
    this.mobs.push(m);
    this.lastWorm = this.clock;
    this.emit({ type: 'spawn', mob: m });
    return m;
  }

  private wormDirector(ctx: MobContext): void {
    if (this.clock - this.lastWorm < MOBS_RULES.wormGap || ctx.depth < this.monsterDepth + 15) return;
    if (this.rng.next() > 0.004) return;
    // A far vista: open air 26-46 m out along the view (or a known anchor in sight).
    const s = this.env.solid;
    for (const a of this.wormAnchors) {
      const d = Math.hypot(a.x - ctx.eye.x, a.y - ctx.eye.y, a.z - ctx.eye.z);
      if (d > 24 && d < 70 && clearLine(s, ctx.eye, a)) {
        this.spawnWorm(a, ctx);
        return;
      }
    }
  }

  /** Lumen moths: drawn to the lantern, they circle it a while, then drift off. */
  private moth(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const dl = Math.hypot(m.position.x - l.x, m.position.y - l.y, m.position.z - l.z);
    let tx: number;
    let ty: number;
    let tz: number;
    let speed = m.def.speed;
    if (m.state === 'flee') {
      // A migration: drifting along its way, a wide flutter.
      tx = m.position.x + m.goal.x * 3;
      ty = m.position.y + m.goal.y * 3 + Math.sin(this.clock * 1.3 + m.seed * 9) * 0.6;
      tz = m.position.z + m.goal.z * 3;
      if (m.stateTime > m.timer) this.remove(m);
    } else if (m.state === 'follow') {
      const a = this.clock * (1.8 + m.seed) + m.seed * 6.28;
      const r = 0.45 + m.seed * 0.45;
      tx = l.x + Math.sin(a) * r;
      ty = l.y + 0.15 + Math.sin(a * 1.7) * 0.3;
      tz = l.z + Math.cos(a) * r;
      speed = 3.2;
      if (!l.lit || l.flame < 0.25 || m.stateTime > 30 + m.seed * 25) {
        m.setState('wander');
        m.timer = 1;
      }
    } else {
      tx = m.home.x + Math.sin(this.clock * 0.7 + m.seed * 9) * 1.4;
      ty = m.home.y + Math.sin(this.clock * 0.9 + m.seed * 5) * 0.5;
      tz = m.home.z + Math.cos(this.clock * 0.6 + m.seed * 7) * 1.4;
      if (m.state === 'wander' && m.stateTime > 12) this.remove(m);
      else if (m.state === 'idle' && l.lit && l.flame > 0.3 && dl < 11) m.setState('follow');
    }
    this.flyToward(m, tx, ty, tz, speed, dt, 6);
    m.gait += dt * (18 + m.seed * 10);
  }

  /** Lamplings: lantern-bodied sprites; they follow and light the way for a while, then go home. */
  private lampling(m: SimMob, dt: number, ctx: MobContext): void {
    const l = ctx.lantern;
    const dp = this.distToPlayer(m, ctx);
    let tx = m.home.x + Math.sin(this.clock * 0.9 + m.seed * 9) * 0.7;
    let ty = m.home.y + Math.sin(this.clock * 1.4 + m.seed * 5) * 0.25;
    let tz = m.home.z + Math.cos(this.clock * 0.8 + m.seed * 7) * 0.7;
    let speed = 1.2;
    switch (m.state) {
      case 'idle':
        if (dp < 8 && l.lit && m.cooldown <= 0) {
          this.announce(m, ctx);
          m.setState('follow');
          this.emit({ type: 'cue', mob: m, cue: 'chime' });
        }
        break;
      case 'follow': {
        // Ahead of the explorer along the view, a little to the side, at about head height.
        const fx = ctx.eye.x - ctx.player.x;
        const yaw = Math.atan2(ctx.player.vx, ctx.player.vz);
        const moving = Math.hypot(ctx.player.vx, ctx.player.vz) > 0.4;
        const side = (m.seed - 0.5) * 2.6;
        const ahead = moving ? 2.6 : 1.8;
        const dirx = moving ? Math.sin(yaw) : Math.sin(this.clock * 0.2 + m.seed * 6);
        const dirz = moving ? Math.cos(yaw) : Math.cos(this.clock * 0.2 + m.seed * 6);
        tx = ctx.player.x + dirx * ahead + dirz * side + fx * 0;
        ty = ctx.player.y + 1.9 + Math.sin(this.clock * 2 + m.seed * 4) * 0.2;
        tz = ctx.player.z + dirz * ahead - dirx * side;
        speed = 4.2;
        if (m.stateTime > MOBS_RULES.lamplingFollow || dp > 26) {
          m.setState('flee');
          m.cooldown = 120;
        }
        break;
      }
      case 'flee':
        // Home to the nest.
        speed = 2.4;
        if (Math.hypot(m.position.x - m.home.x, m.position.y - m.home.y, m.position.z - m.home.z) < 1) m.setState('idle');
        if (m.stateTime > 25) this.remove(m);
        break;
      default:
        m.setState('idle');
    }
    this.flyToward(m, tx, ty, tz, speed, dt, 3);
  }

  /** The Glimmerkin: a crystal-backed scurrier; it flees a hurried approach, then stops to look. */
  private glimmerkin(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    const pspeed = Math.hypot(ctx.player.vx, ctx.player.vz);
    switch (m.state) {
      case 'idle':
      case 'wander': {
        if (m.state === 'idle') this.face(m, ctx, dt, 3);
        else this.walkToward(m, m.goal.x, m.goal.z, m.def.speed * 0.4, dt);
        if (m.stateTime > 2 + m.seed * 3) {
          if (m.state === 'idle') {
            m.setState('wander');
            m.goal.x = m.home.x + this.rng.range(-4, 4);
            m.goal.z = m.home.z + this.rng.range(-4, 4);
          } else m.setState('idle');
        }
        if (dp < 9) this.announce(m, ctx);
        if (dp < 4.5 && pspeed > 2.2 && m.cooldown <= 0) {
          m.setState('flee');
          m.timer = 1.6 + this.rng.range(0, 1.2);
          this.emit({ type: 'cue', mob: m, cue: 'chirp' });
        }
        if (m.state !== 'idle') break;
        return this.walkerSettle(m, dt);
      }
      case 'flee': {
        const ax = m.foot.x + (m.foot.x - ctx.player.x) * 3;
        const az = m.foot.z + (m.foot.z - ctx.player.z) * 3;
        this.walkToward(m, ax, az, m.def.speed, dt, true);
        if (m.stateTime >= m.timer) {
          // It stops to look back: the moment to catch it.
          m.setState('idle');
          m.cooldown = 2.5;
        }
        break;
      }
      case 'caught':
        m.open = Math.min(1, m.stateTime / 0.4);
        if (m.stateTime > 0.9) this.remove(m);
        return this.walkerSettle(m, dt);
      default:
        m.setState('idle');
    }
  }

  /** The Shellback: a big, gentle geode-shelled snail; its crystals regrow. */
  private shellback(m: SimMob, dt: number, ctx: MobContext): void {
    if (this.distToPlayer(m, ctx) < 10) this.announce(m, ctx);
    m.timer += dt;
    if (m.crystals < 4 && m.timer >= MOBS_RULES.shellRegrow) {
      m.timer = 0;
      m.crystals++;
      m.tappable = true;
      m.rarity = 'rare';
    }
    if (m.state === 'harvested') {
      m.open += (1 - m.open) * Math.min(1, dt * 5);
      if (m.stateTime > 1.6) m.setState('wander');
      return this.walkerSettle(m, dt);
    }
    m.open += (0 - m.open) * Math.min(1, dt * 1.5);
    if (m.state !== 'wander' || m.stateTime > 14) {
      m.setState('wander');
      m.goal.x = m.home.x + this.rng.range(-5, 5);
      m.goal.z = m.home.z + this.rng.range(-5, 5);
    }
    // It turns its eyestalks to the explorer, and edges aside if walked into.
    if (this.flatDist(m, ctx) < 1.6) this.walkToward(m, m.foot.x + (m.foot.x - ctx.player.x), m.foot.z + (m.foot.z - ctx.player.z), m.def.speed * 2, dt);
    else if (this.walkToward(m, m.goal.x, m.goal.z, m.def.speed, dt)) m.stateTime = 99;
  }

  /** The Drift Jelly: a glowing jelly that floats in the big caverns; a tap gives light spores. */
  private jelly(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.distToPlayer(m, ctx);
    if (dp < 14) this.announce(m, ctx);
    if (m.cooldown <= 0 && !m.tappable) {
      m.tappable = true;
      m.rarity = 'uncommon';
    }
    let tx = m.home.x + Math.sin(this.clock * 0.13 + m.seed * 9) * 4;
    let ty = m.home.y + Math.sin(this.clock * 0.21 + m.seed * 3) * 0.8;
    let tz = m.home.z + Math.cos(this.clock * 0.11 + m.seed * 7) * 4;
    if (m.tappable && dp < 9 && ctx.lantern.lit) {
      // Curious: it drifts down toward the flame, within a tap's reach.
      tx = ctx.eye.x + (m.position.x - ctx.eye.x) * 0.6;
      ty = ctx.eye.y + 0.7;
      tz = ctx.eye.z + (m.position.z - ctx.eye.z) * 0.6;
      if (Math.hypot(tx - ctx.eye.x, tz - ctx.eye.z) < 1.8) {
        const a = Math.atan2(m.position.x - ctx.eye.x, m.position.z - ctx.eye.z);
        tx = ctx.eye.x + Math.sin(a) * 2;
        tz = ctx.eye.z + Math.cos(a) * 2;
      }
    }
    if (m.state === 'flee') ty = m.home.y + 3;
    if (m.state === 'flee' && m.stateTime > 6) m.setState('idle');
    this.flyToward(m, tx, ty, tz, m.def.speed, dt, 0.8);
    m.gait += dt * (1.1 + m.seed * 0.4);
  }

  /** The Burrower: a cheeky ore thief; it pops up, taunts, runs, and digs away if not caught. */
  private burrower(m: SimMob, dt: number, ctx: MobContext): void {
    const dp = this.flatDist(m, ctx);
    switch (m.state) {
      case 'wake':
        m.open = 1 - Math.min(1, m.stateTime / 0.8);
        this.face(m, ctx, dt, 6);
        if (m.stateTime >= 0.8) {
          this.announce(m, ctx);
          m.setState('idle');
          this.emit({ type: 'cue', mob: m, cue: 'squeak' });
        }
        return this.walkerSettle(m, dt);
      case 'idle':
        // A taunt: it shows its loot.
        this.face(m, ctx, dt, 6);
        if (m.stateTime > 0.9 + m.seed * 0.6 || dp < 2.5) {
          m.setState('flee');
          m.timer = 2.2 + this.rng.range(0, 1.6);
        }
        break;
      case 'flee': {
        const ax = m.foot.x + (m.foot.x - ctx.player.x) * 2 + Math.sin(this.clock * 3 + m.seed * 9) * 2;
        const az = m.foot.z + (m.foot.z - ctx.player.z) * 2 + Math.cos(this.clock * 3 + m.seed * 9) * 2;
        this.walkToward(m, ax, az, m.def.speed * (m.treasure ? 1.15 : 1), dt, true);
        if (m.stateTime >= m.timer) {
          const dig = this.clockOf(m) > 14;
          m.setState(dig ? 'sleep' : 'idle');
          if (!dig) this.emit({ type: 'cue', mob: m, cue: 'squeak' });
        }
        break;
      }
      case 'sleep':
        // Digging away.
        m.open = Math.min(1, m.stateTime / 0.9);
        if (m.stateTime > 0.9) this.remove(m);
        return this.walkerSettle(m, dt);
      case 'caught':
        if (m.stateTime > 0.6) {
          m.setState('sleep');
          m.tappable = false;
        }
        return this.walkerSettle(m, dt);
      default:
        m.setState('idle');
    }
    m.timer2 += dt;
  }

  private clockOf(m: SimMob): number {
    return m.timer2;
  }

  // ------------------------------------------------------------------------------------
  // Locomotion helpers

  private face(m: SimMob, ctx: MobContext, dt: number, rate: number): void {
    m.yaw = dampAngle(m.yaw, Math.atan2(ctx.player.x - m.position.x, ctx.player.z - m.position.z), rate, dt);
  }

  /** Walk the feet toward (x, z). @returns whether the way was blocked. */
  private walkToward(m: SimMob, x: number, z: number, speed: number, dt: number, keepCampOut = true): boolean {
    const dx = x - m.foot.x;
    const dz = z - m.foot.z;
    const d = Math.hypot(dx, dz);
    let vx = 0;
    let vz = 0;
    if (d > 0.15) {
      vx = (dx / d) * speed * m.scale ** 0.5;
      vz = (dz / d) * speed * m.scale ** 0.5;
      m.yaw = dampAngle(m.yaw, Math.atan2(dx, dz), 5, dt);
    }
    if (keepCampOut && m.hostile && this.env.inCamp(m.foot.x + vx * 0.5, m.foot.y + 0.5, m.foot.z + vz * 0.5)) {
      vx = 0;
      vz = 0;
    }
    const bx = m.foot.x;
    const bz = m.foot.z;
    const blocked = walkStep(this.env.solid, m.foot, vx, vz, dt, this.heightOf(m), m.bounds.radius);
    const moved = Math.hypot(m.foot.x - bx, m.foot.z - bz) / Math.max(dt, 1e-4);
    m.speedNow += (moved - m.speedNow) * Math.min(1, dt * 10);
    m.gait += moved * dt * (m.kind === 'stalker' ? 1.6 : m.kind === 'sentinel' ? 1.3 : 6);
    this.placeWalker(m);
    return blocked;
  }

  private flyToward(m: SimMob, tx: number, ty: number, tz: number, speed: number, dt: number, accel: number): void {
    const dx = tx - m.position.x;
    const dy = ty - m.position.y;
    const dz = tz - m.position.z;
    const d = Math.hypot(dx, dy, dz);
    const want = d > 0.05 ? Math.min(speed, d * 1.5) / d : 0;
    const k = Math.min(1, dt * accel);
    m.vel.x += (dx * want - m.vel.x) * k;
    m.vel.y += (dy * want - m.vel.y) * k;
    m.vel.z += (dz * want - m.vel.z) * k;
    flyStep(this.env.solid, m.position, m.vel, dt, m.bounds.radius);
    const sp = Math.hypot(m.vel.x, m.vel.z);
    if (sp > 0.05) m.yaw = dampAngle(m.yaw, Math.atan2(m.vel.x, m.vel.z), 3, dt);
    m.speedNow = Math.hypot(m.vel.x, m.vel.y, m.vel.z);
  }

  private animate(m: SimMob, dt: number): void {
    if (m.kind !== 'stalker' && m.kind !== 'sentinel') m.strike += ((m.state === 'windup' ? 1 : 0) - m.strike) * Math.min(1, dt * 10);
    m.alert += ((m.state === 'windup' || m.state === 'attack' ? 1 : m.state === 'stalk' ? 0.6 : 0.2) - m.alert) * Math.min(1, dt * 3);
  }

  // ------------------------------------------------------------------------------------
  // Combat and touch

  /** The nearest tappable mob along a ray, not behind rock. */
  pick(ray: MobRay): SimMob | null {
    const len = Math.hypot(ray.dx, ray.dy, ray.dz);
    if (len < 1e-9) return null;
    const dx = ray.dx / len;
    const dy = ray.dy / len;
    const dz = ray.dz / len;
    const maxD = ray.maxDist ?? 30;
    const slack = ray.slack ?? 0.25;
    let best: SimMob | null = null;
    let bestT = Infinity;
    for (const m of this.mobs) {
      if (!m.tappable || m.dying || m.fade < 0.3) continue;
      const r = m.bounds.radius + slack;
      const h = m.bounds.halfHeight;
      const t = rayCapsule(ray.ox, ray.oy, ray.oz, dx, dy, dz, m.position.x, m.position.y - h, m.position.z, m.position.y + h, r);
      if (t === null || t > maxD || t >= bestT) continue;
      const hit = { x: ray.ox + dx * t, y: ray.oy + dy * t, z: ray.oz + dz * t };
      if (!clearLine(this.env.solid, { x: ray.ox, y: ray.oy, z: ray.oz }, hit)) continue;
      best = m;
      bestT = t;
    }
    return best;
  }

  /** Metres from a point to a mob's capsule surface. */
  distanceTo(m: SimMob, x: number, y: number, z: number): number {
    const h = m.bounds.halfHeight;
    const cy = Math.max(m.position.y - h, Math.min(m.position.y + h, y));
    return Math.max(0, Math.hypot(x - m.position.x, y - cy, z - m.position.z) - m.bounds.radius);
  }

  hit(m: SimMob, dmg: number, strike: MobStrike = {}): MobHitResult {
    const miss: MobHitResult = { hit: false, killed: false, hitStop: 0 };
    if (m.dying || !this.mobs.includes(m)) return miss;
    if (m.family === 'being') return this.touch(m);
    if (m.kind === 'worm') return miss;
    let d = Math.max(0, dmg);
    let armoured = false;
    const light = strike.light === true;
    if (light && (m.kind === 'crawler' || m.kind === 'wisp')) d *= 1.5;
    if (m.kind === 'gnasher' && m.open < 0.5) {
      // Closed, it is a boulder: the blow glances off and wakes it.
      d *= 0.3;
      armoured = true;
      if (m.state === 'sleep') {
        m.setState('windup');
        m.landed = false;
        this.emit({ type: 'telegraph', mob: m });
      }
    }
    if (m.kind === 'sentinel') {
      if (m.state === 'sleep') return miss;
      // Only the open core takes the full blow.
      if (m.state !== 'recoil' && m.state !== 'flee') {
        d *= 0.25;
        armoured = true;
      }
    }
    m.hp = (m.hp ?? 1) - d;
    m.flash = 1;
    const killed = m.hp <= 0;
    this.emit({ type: 'hit', mob: m, damage: d, killed, armoured });
    if (killed) this.kill(m);
    else if (m.kind === 'crawler') this.recoil(m, light ? 3 : 1.4);
    else if (m.kind === 'wisp') this.recoil(m, 1.6);
    else if (m.kind === 'stalker') this.flee(m, 2.5);
    else if (m.kind === 'gnasher' && !armoured && m.state === 'recoil') m.timer = Math.max(m.timer, m.stateTime + 0.6);
    return { hit: true, killed, hitStop: MOBS_RULES.hitStop };
  }

  private kill(m: SimMob): void {
    if (m.dying) return;
    m.hp = 0;
    m.setState('dying');
    m.tappable = false;
    if (m.kind === 'sentinel' && m.relic) this.sentinelDone.add(m.relic);
    this.emit({ type: 'die', mob: m });
  }

  /** A tap on a being (within reach of the eye): catch, harvest, spores, a pat. */
  private touch(m: SimMob): MobHitResult {
    const miss: MobHitResult = { hit: false, killed: false, hitStop: 0 };
    const ctx = this.ctx;
    if (!m.tappable) return miss;
    if (ctx && this.distanceTo(m, ctx.eye.x, ctx.eye.y, ctx.eye.z) > MOBS_RULES.touchReach) return miss;
    switch (m.kind) {
      case 'glimmerkin':
        if (m.state === 'caught') return miss;
        m.setState('caught');
        m.tappable = false;
        this.emit({ type: 'interact', mob: m, action: 'caught' });
        return { hit: true, killed: true, hitStop: 0, action: 'caught' };
      case 'burrower':
        if (m.state === 'caught' || m.state === 'sleep') return miss;
        m.setState('caught');
        m.carry = 0;
        m.tappable = false;
        this.emit({ type: 'interact', mob: m, action: 'caught' });
        this.emit({ type: 'cue', mob: m, cue: 'squeak' });
        return { hit: true, killed: false, hitStop: 0, action: 'caught' };
      case 'shellback':
        if (m.crystals <= 0 || m.state === 'harvested') return miss;
        m.crystals--;
        m.timer = 0;
        m.setState('harvested');
        if (m.crystals <= 0) {
          m.tappable = false;
          m.rarity = undefined;
        }
        this.emit({ type: 'interact', mob: m, action: 'harvested' });
        return { hit: true, killed: false, hitStop: 0, action: 'harvested' };
      case 'jelly':
        m.cooldown = 90;
        m.tappable = false;
        m.rarity = undefined;
        m.flash = 1;
        m.setState('flee');
        this.boostLeft = MOBS_RULES.jellyBoostSeconds;
        this.emit({ type: 'interact', mob: m, action: 'spores' });
        return { hit: true, killed: false, hitStop: 0, action: 'spores' };
      case 'lampling':
        m.flash = 0.6;
        if (m.state === 'follow') m.stateTime = Math.max(0, m.stateTime - 30);
        else if (m.cooldown <= 0 || m.state === 'idle') {
          m.cooldown = 0;
          m.setState('follow');
        }
        this.emit({ type: 'interact', mob: m, action: 'petted' });
        this.emit({ type: 'cue', mob: m, cue: 'chime' });
        return { hit: true, killed: false, hitStop: 0, action: 'petted' };
      default:
        return miss;
    }
  }

  /** A burst of light at a point: monsters in `radius` (and in sight) recoil, flee or close; `dmg` to each. */
  flash(x: number, y: number, z: number, radius: number, dmg = 0): number {
    let n = 0;
    const o = { x, y, z };
    for (const m of [...this.mobs]) {
      if (!m.hostile || m.dying) continue;
      const d = Math.hypot(m.position.x - x, m.position.y - y, m.position.z - z);
      if (d > radius || !clearLine(this.env.solid, o, m.position)) continue;
      n++;
      if (dmg > 0 && m.state !== 'sleep') this.hit(m, dmg, { light: true, from: o });
      if (m.dying) continue;
      if (m.kind === 'crawler' || m.kind === 'wisp') this.recoil(m, 4);
      else if (m.kind === 'stalker') this.flee(m, 8);
      else if (m.kind === 'gnasher' || m.kind === 'sentinel') {
        if (m.state !== 'sleep') {
          m.setState('flee');
          m.timer = m.kind === 'sentinel' ? 1.6 : 2.2;
        }
      }
    }
    return n;
  }

  /** A light shard from the Flare Sling. */
  fire(from: V3, target: SimMob | null, dmg: number, dir?: V3, speed = 22): Shot {
    const v = new THREE.Vector3();
    if (target) v.set(target.position.x - from.x, target.position.y - from.y, target.position.z - from.z);
    else if (dir) v.set(dir.x, dir.y, dir.z);
    else v.set(0, 0, 1);
    v.normalize().multiplyScalar(speed);
    const s: Shot = { id: this.nextShot++, p: new THREE.Vector3(from.x, from.y, from.z), v, target: target?.id ?? 0, dmg, life: 1.6, landed: -1 };
    this.shots.push(s);
    this.emit({ type: 'shot', shot: s, phase: 'fly' });
    return s;
  }

  private updateShots(dt: number): void {
    const solid = this.env.solid;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      if (s.landed >= 0) {
        s.landed += dt;
        if (s.landed > 2.5) this.shots.splice(i, 1);
        continue;
      }
      s.life -= dt;
      const tgt = s.target ? this.mobs.find((m) => m.id === s.target && !m.dying) : undefined;
      if (tgt) {
        // A light shard bends a little toward the tapped monster.
        const want = new THREE.Vector3(tgt.position.x - s.p.x, tgt.position.y - s.p.y, tgt.position.z - s.p.z);
        const sp = s.v.length();
        want.normalize().multiplyScalar(sp);
        s.v.lerp(want, Math.min(1, dt * 6));
      } else s.v.y -= 6 * dt;
      const steps = Math.max(1, Math.ceil((s.v.length() * dt) / 0.3));
      let done = false;
      for (let k = 0; k < steps && !done; k++) {
        s.p.addScaledVector(s.v, dt / steps);
        for (const m of this.mobs) {
          if (!m.hostile || m.dying) continue;
          if (this.distanceTo(m, s.p.x, s.p.y, s.p.z) <= 0.25) {
            this.hit(m, s.dmg, { light: true, from: s.p });
            done = true;
            break;
          }
        }
        if (!done && solid(Math.floor(s.p.x), Math.floor(s.p.y), Math.floor(s.p.z))) {
          s.p.addScaledVector(s.v, -dt / steps);
          done = true;
        }
      }
      if (done || s.life <= 0) {
        s.landed = 0;
        // The light where it lands scares crawlers near it.
        for (const m of this.mobs) if (m.kind === 'crawler' && !m.dying && m.position.distanceTo(s.p) < 3.2) this.recoil(m, 3);
        this.emit({ type: 'shot', shot: s, phase: done ? 'hit' : 'miss' });
      }
    }
  }

  clear(): void {
    for (const m of this.mobs) this.emit({ type: 'gone', mob: m });
    this.mobs.length = 0;
    this.shots.length = 0;
    this.dim = 1;
    this.boost = 1;
    this.boostLeft = 0;
  }
}

/** A point of the worm's pass at t (0..1 across; the body trails behind at t - s/len). */
export function wormPoint(p: NonNullable<SimMob['path']>, t: number, out: THREE.Vector3): THREE.Vector3 {
  const k = t;
  out.set(p.ax + (p.bx - p.ax) * k, p.ay + (p.by - p.ay) * k + Math.sin(k * Math.PI * 1.6) * p.amp, p.az + (p.bz - p.az) * k);
  // A slow sideways sway, toward and away from the watcher.
  const w = Math.sin(k * Math.PI * 2.3 + 0.7) * p.amp * 0.6;
  out.x += (-(p.bz - p.az) / p.len) * w;
  out.z += ((p.bx - p.ax) / p.len) * w;
  return out;
}

function dampAngle(a: number, b: number, rate: number, dt: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-rate * dt));
}

/**
 * Distance along a unit ray to a vertical capsule (segment y0..y1 at x, z, radius r), or null.
 * Closest-approach test of the ray against the segment, then the sphere at that point.
 */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, y0: number, cz: number, y1: number, r: number): number | null {
  // Sample the closest point on the segment to the ray by minimising over the segment parameter.
  const segLen = y1 - y0;
  let best: number | null = null;
  const n = segLen > 0.05 ? 5 : 1;
  for (let i = 0; i < n; i++) {
    const cy = n === 1 ? (y0 + y1) / 2 : y0 + (segLen * i) / (n - 1);
    // Ray-sphere.
    const lx = ox - cx;
    const ly = oy - cy;
    const lz = oz - cz;
    const b = lx * dx + ly * dy + lz * dz;
    const c = lx * lx + ly * ly + lz * lz - r * r;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    const tt = t >= 0 ? t : c <= 0 ? 0 : null;
    if (tt !== null && (best === null || tt < best)) best = tt;
  }
  if (segLen > 0.05) {
    // The straight part between the samples: a cylinder test in xz.
    const a = dx * dx + dz * dz;
    if (a > 1e-9) {
      const lx = ox - cx;
      const lz = oz - cz;
      const b = lx * dx + lz * dz;
      const c = lx * lx + lz * lz - r * r;
      const disc = b * b - a * c;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / a;
        if (t >= 0) {
          const y = oy + dy * t;
          if (y >= y0 && y <= y1 && (best === null || t < best)) best = t;
        }
      }
    }
  }
  return best;
}
