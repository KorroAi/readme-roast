import * as THREE from 'three';
import { SOLID } from '../../config/blocks';
import { ITEMS, type ItemId } from '../../config/items';
import { WORLD, lanternForTier } from '../../config/balance';
import { hasText, t, type TextKey } from '../../i18n';
import { MobRenderer } from '../../render/mobs/MobRenderer';
import { MOB_DROPS, MOBS_RULES, TREASURE_DROPS } from './config';
import { MobSim, type MobEnv, type MobSimEvent, type SentinelSite, type SimMob } from './MobSim';
import { standableFor } from './nav';
import type { Mob, MobContext, MobHitResult, MobKind, MobRay, MobStrike, MobSystem } from './types';
import type { Game } from '../Game';

/**
 * The creatures in the game (round 2, MOBS): the seam's MobSystem over the simulation (MobSim)
 * and the renderer (render/mobs), wired to the explorer: monsters' attacks go through Health (a
 * black-out is the first version's: the pack stays as a cache, the explorer wakes at camp), the
 * wisps drink lantern oil, the beings give gems, crystals and light spores through the drops, and
 * every moment has a sound (audio/mobSfx, through 'mob:*' bus events with a stereo position).
 *
 * Game.ts holds one (`game.mobs`) and calls frame() once per frame after the lantern update.
 */
declare module '../../core/events' {
  interface GameEvents {
    'mob:spawned': { id: number; kind: MobKind };
    /** A wind-up: every attack is announced (sound, pose) before it lands. */
    'mob:telegraph': { id: number; kind: MobKind; pan: number; gain: number };
    'mob:attack': { id: number; kind: MobKind; damage: number; landed: boolean };
    'mob:hit': { id: number; kind: MobKind; damage: number; killed: boolean; armoured: boolean; pan: number; gain: number };
    'mob:died': { id: number; kind: MobKind; pan: number; gain: number };
    'mob:interact': { id: number; kind: MobKind; action: 'caught' | 'harvested' | 'spores' | 'petted' };
    /** A creature's voice (breathing, chitter, whisper, drone...), placed in stereo. */
    'mob:cue': { kind: MobKind; cue: string; pan: number; gain: number };
    'mob:shot': { phase: 'fly' | 'hit' | 'miss'; pan: number; gain: number };
    'mob:met': { kind: MobKind };
  }
}

export interface MobDirectorHooks {
  /** The explorer's health reached 0 (Game blacks out). */
  die(): void;
}

/** The motes a monster leaves as it fades (its own glow). */
const DEATH_MOTES: Partial<Record<MobKind, number>> = { crawler: 0x9ff7dc, gnasher: 0xff8a50, wisp: 0xb9a8e8, stalker: 0xcfe9ff, sentinel: 0xffd27a };

const tmp = new THREE.Vector3();
const right = new THREE.Vector3();

export class MobDirector implements MobSystem {
  readonly sim: MobSim;
  readonly renderer: MobRenderer;
  readonly group: THREE.Group;
  private readonly offs: Array<() => void> = [];
  private hitStopLeft = 0;
  private lastCtx: MobContext | null = null;
  /** Debug / tests: turn the spawner off and drive everything by hand. */
  autoSpawn = true;
  private readonly met = new Set<MobKind>();
  private eventsHandled = false;

  constructor(private readonly game: Game, private readonly hooks: MobDirectorHooks) {
    const g = game;
    const env: MobEnv = {
      solid: (x, y, z) => SOLID[g.session.world.get(x, y, z)] === 1,
      light: (x, y, z) => {
        const l = g.session.sampleLight(x + 0.5, y + 0.5, z + 0.5);
        return Math.max(l.r, l.g, l.b);
      },
      inCamp: (x, y, z) => {
        const r = g.session.layout.camp;
        // A margin round the camp: nothing hostile within 4 m of it either.
        return x >= r.min[0] - 4 && x <= r.max[0] + 4 && y >= r.min[1] - 4 && y <= r.max[1] + 4 && z >= r.min[2] - 4 && z <= r.max[2] + 4;
      },
      depthOf: (y) => WORLD.depthOffset - y,
    };
    this.sim = new MobSim(env, 0x6d0b5 ^ Math.floor(Math.random() * 1e6));
    this.renderer = new MobRenderer(g.session.rig.uniforms);
    this.group = this.renderer.group;
    this.configureWorld();
    this.offs.push(this.sim.on((e) => this.onSim(e)));
    const bus = g.bus;
    // A guarded relic taken wakes its Sentinel.
    this.offs.push(bus.on('item:picked', ({ item }) => {
      for (const s of this.sim.sentinelSites) if (s.relic === item) this.sim.wakeSentinel(item);
    }));
    // The event director's event mobs.
    this.offs.push(bus.on('world:event', ({ event, phase }) => {
      if (phase !== 'start') return;
      if (event.kind === 'migration' || event.kind === 'treasure') {
        const [x, y, z] = event.anchor;
        const mobs = this.spawnEvent(event.kind, { x, y, z });
        if (event.target) for (const m of mobs) this.aim(m as SimMob, event.target);
      }
    }));
    // A mining hit scatters lumen moths near it.
    this.offs.push(bus.on('block:hit', ({ x, y, z }) => {
      for (const m of this.sim.mobs) if (m.kind === 'moth' && m.state === 'follow' && m.position.distanceTo(tmp.set(x + 0.5, y + 0.5, z + 0.5)) < 2.5) m.setState('wander');
    }));
  }

  /** The monster line from the layout (the landing above the Hollow), the Sentinel's relic, the worm's chasm. */
  private configureWorld(): void {
    const lm = this.game.session.layout.landmarks as Record<string, readonly number[] | undefined>;
    const landing = lm.landing;
    if (landing) this.sim.monsterDepth = Math.round(WORLD.depthOffset - landing[1]);
    this.sim.sentinelSites = this.sentinelSites(lm);
    const anchors: Array<{ x: number; y: number; z: number }> = [];
    const feat = (this.game.session.layout as unknown as { features?: { worm?: ReadonlyArray<readonly number[]> } }).features;
    for (const p of feat?.worm ?? []) anchors.push({ x: p[0], y: p[1], z: p[2] });
    // The far chasms: the Glimmerfall's shaft and the bridge's chasm.
    for (const k of ['fallBottom', 'bridge', 'spindle']) {
      const p = lm[k];
      if (p) anchors.push({ x: p[0], y: p[1] + (k === 'fallBottom' ? 14 : -6), z: p[2] });
    }
    this.sim.wormAnchors = anchors;
  }

  private sentinelSites(lm: Record<string, readonly number[] | undefined>): SentinelSite[] {
    const w = this.game.session.world;
    const solid = (x: number, y: number, z: number) => SOLID[w.get(x, y, z)] === 1;
    const out: SentinelSite[] = [];
    const guard: Array<[string, ItemId | string]> = [['relic_choir', 'relicChoir']];
    for (const [key, relic] of guard) {
      const p = lm[key];
      if (!p) continue;
      // A standable spot 3-5 m from the relic with room for its height.
      let best: SentinelSite | null = null;
      for (let r = 3; r <= 6 && !best; r++)
        for (let a = 0; a < 16 && !best; a++) {
          const x = Math.floor(p[0] + Math.sin((a / 16) * Math.PI * 2) * r);
          const z = Math.floor(p[2] + Math.cos((a / 16) * Math.PI * 2) * r);
          for (let dy = 2; dy >= -3; dy--) {
            const y = Math.floor(p[1]) + dy;
            if (standableFor(solid, x, y, z, 3)) {
              best = { relic, x: x + 0.5, y, z: z + 0.5 };
              break;
            }
          }
        }
      if (best) out.push(best);
    }
    return out;
  }

  // ------------------------------------------------------------------------------------
  // The frame

  /** The context from the game this frame. */
  private context(active: boolean): MobContext {
    const g = this.game;
    const p = g.player;
    const u = g.session.rig.uniforms;
    const eye = g.cameraRig.camera.position;
    const lit = g.lanternFuel.lit;
    const ctx: MobContext = {
      time: this.sim.time,
      player: { x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz },
      eye: { x: eye.x, y: eye.y, z: eye.z },
      lantern: {
        x: u.uLanternPos.value.x,
        y: u.uLanternPos.value.y,
        z: u.uLanternPos.value.z,
        radius: u.uLanternRadius.value,
        // The flame: full while the oil is above ~45 %, dimmer below, dimmer still where a wisp feeds.
        flame: lit ? Math.min(1, g.lanternFuel.fraction * 2.2) * this.sim.dim : 0,
        lit,
        raised: (g.viewmodel as unknown as { raised?: number }).raised !== undefined ? ((g.viewmodel as unknown as { raised: number }).raised > 0.45) : false,
      },
      depth: Math.max(0, WORLD.depthOffset - p.y),
      atCamp: g.inCamp,
      active,
    };
    return ctx;
  }

  /**
   * One frame: simulate (when playing), then pose and place the creatures, and apply what they do
   * to the light (the wisps dim it, lamplings and spores brighten it). Call after the lantern update.
   */
  frame(dt: number, active: boolean): void {
    const g = this.game;
    // Tell WORLD's event director that the moth migration and the treasure thief are drawn here
    // (it only schedules the kinds someone draws). It may be hooked after us: look until it is.
    if (!this.eventsHandled) {
      const d = (g as unknown as { events?: { handle?: (k: 'migration' | 'treasure') => void } }).events;
      if (d && typeof d.handle === 'function') {
        d.handle('migration');
        d.handle('treasure');
        this.eventsHandled = true;
      }
    }
    const ctx = this.context(active);
    this.sim.spawning = this.autoSpawn;
    // A relic already in the journal (an earlier trip) has no Sentinel left by it.
    for (const site of this.sim.sentinelSites) {
      if (!this.sim.sentinelDone.has(site.relic) && g.journal.hasKeyItem(site.relic) && !this.sim.mobs.some((m) => m.kind === 'sentinel' && m.relic === site.relic)) this.sim.sentinelDone.add(site.relic);
    }
    // Hit stop: a strike on a monster freezes the creatures for 40 ms (the world keeps running).
    let simDt = dt;
    if (this.hitStopLeft > 0) {
      const used = Math.min(this.hitStopLeft, dt);
      this.hitStopLeft -= used;
      simDt = dt - used;
    }
    this.update(active ? simDt : 0, ctx);
    if (active) {
      const u = g.session.rig.uniforms;
      u.uLanternIntensity.value *= this.sim.dim * this.sim.boost;
      u.uLanternRadius.value *= 1 + (this.sim.boost - 1) * 0.5;
      this.renderer.step(dt, ctx.lantern.x, ctx.lantern.y, ctx.lantern.z);
    }
  }

  update(dt: number, ctx: MobContext): void {
    this.lastCtx = ctx;
    if (dt > 0) this.sim.update(dt, ctx);
    else this.sim.ctx = ctx;
    const g = this.game;
    const cam = g.cameraRig.camera;
    this.renderer.sync(this.sim, g.session.rig.uniforms.uTime.value, cam, g.renderer.canvas.height, cam.fov);
  }

  // ------------------------------------------------------------------------------------
  // The seam

  pick(ray: MobRay): Mob | null {
    return this.sim.pick(ray);
  }

  hit(mob: Mob, dmg: number, strike?: MobStrike): MobHitResult {
    const r = this.sim.hit(mob as SimMob, dmg, strike);
    if (r.hitStop > 0) this.hitStopLeft = Math.max(this.hitStopLeft, r.hitStop);
    return r;
  }

  fire(from: { x: number; y: number; z: number }, mob: Mob | null, dmg: number, dir?: { x: number; y: number; z: number }): void {
    this.sim.fire(from, mob as SimMob | null, dmg, dir);
  }

  flash(x: number, y: number, z: number, radius: number, dmg = 0): number {
    return this.sim.flash(x, y, z, radius, dmg);
  }

  spawnEvent(kind: 'migration' | 'treasure' | 'worm', at: { x: number; y: number; z: number }): Mob[] {
    const ctx = this.lastCtx ?? this.context(true);
    if (kind === 'worm') {
      const w = this.sim.spawnWorm(at, ctx);
      return w ? [w] : [];
    }
    if (kind === 'treasure') {
      const m = this.sim.spawn('burrower', at.x, at.y, at.z, { treasure: true });
      return m ? [m] : [];
    }
    // A migration: a long stream of moths passing through.
    const before = this.sim.mobs.length;
    this.sim.spawnMoths(ctx, 26, { x: Math.floor(at.x), y: Math.floor(at.y), z: Math.floor(at.z) });
    const made = this.sim.mobs.slice(before).filter((m) => m.kind === 'moth');
    const dx = ctx.player.x - at.x;
    const dz = ctx.player.z - at.z;
    const l = Math.max(0.1, Math.hypot(dx, dz));
    made.forEach((m, i) => {
      m.setState('flee');
      m.timer = 28 + i * 0.3;
      m.goal.x = dx / l;
      m.goal.y = 0.05;
      m.goal.z = dz / l;
    });
    return made;
  }

  /** Point an event mob at its way out. */
  private aim(m: SimMob, target: readonly number[]): void {
    const dx = target[0] - m.position.x;
    const dy = target[1] - m.position.y;
    const dz = target[2] - m.position.z;
    const l = Math.max(0.1, Math.hypot(dx, dy, dz));
    if (m.kind === 'moth') {
      m.goal.x = dx / l;
      m.goal.y = dy / l;
      m.goal.z = dz / l;
    } else {
      m.home.x = target[0];
      m.home.z = target[2];
    }
  }

  list(): readonly Mob[] {
    return this.sim.mobs;
  }

  /**
   * What the creatures do to the lantern now (1 = nothing): a feeding wisp dims it (down to ~0.55),
   * lamplings and a jelly's spores brighten it. Applied to the light in frame(); the drawn flame
   * (FP / VIS) may follow it too.
   */
  get lightFactor(): number {
    return this.sim.dim * this.sim.boost;
  }

  /** Mobs near the eye that VIS should highlight (catchable beings in their rarity). */
  highlightTargets(range = 14): Array<{ kind: 'object'; id: string; object: THREE.Object3D; rarity: NonNullable<Mob['rarity']> }> {
    const out: Array<{ kind: 'object'; id: string; object: THREE.Object3D; rarity: NonNullable<Mob['rarity']> }> = [];
    const e = this.game.cameraRig.camera.position;
    for (const m of this.sim.mobs) {
      if (!m.tappable || !m.rarity || !m.object || m.family !== 'being' || m.dying) continue;
      if (m.position.distanceTo(e) > range) continue;
      out.push({ kind: 'object', id: `mob-${m.id}`, object: m.object, rarity: m.rarity });
    }
    return out;
  }

  /** Put everything away (the menu, a respawn at camp). */
  clear(): void {
    this.sim.clear();
    this.hitStopLeft = 0;
  }

  /** A fresh game (New Game, Continue): everything put away, the Sentinels asleep again by untaken relics. */
  reset(): void {
    this.clear();
    this.sim.sentinelDone.clear();
    this.met.clear();
  }

  // ------------------------------------------------------------------------------------
  // What the creatures do to the game

  private stereo(p: { x: number; y: number; z: number }, range = 30): { pan: number; gain: number } {
    const cam = this.game.cameraRig.camera;
    tmp.set(p.x - cam.position.x, p.y - cam.position.y, p.z - cam.position.z);
    const d = tmp.length();
    right.set(1, 0, 0).applyQuaternion(cam.quaternion);
    const pan = d > 0.01 ? Math.max(-1, Math.min(1, tmp.dot(right) / d)) * 0.85 : 0;
    const gain = Math.pow(Math.max(0, 1 - d / range), 1.4);
    return { pan, gain };
  }

  private onSim(e: MobSimEvent): void {
    const g = this.game;
    const bus = g.bus;
    switch (e.type) {
      case 'spawn':
        bus.emit('mob:spawned', { id: e.mob.id, kind: e.mob.kind });
        break;
      case 'gone':
        this.renderer.drop(e.mob);
        break;
      case 'telegraph': {
        const s = this.stereo(e.mob.position);
        bus.emit('mob:telegraph', { id: e.mob.id, kind: e.mob.kind, ...s });
        break;
      }
      case 'attack':
        bus.emit('mob:attack', { id: e.mob.id, kind: e.mob.kind, damage: e.damage, landed: e.landed });
        if (e.landed && e.damage > 0) this.hurt(e.damage, e.mob);
        break;
      case 'hit': {
        const s = this.stereo(e.mob.position);
        bus.emit('mob:hit', { id: e.mob.id, kind: e.mob.kind, damage: e.damage, killed: e.killed, armoured: e.armoured, ...s });
        break;
      }
      case 'die': {
        const s = this.stereo(e.mob.position);
        bus.emit('mob:died', { id: e.mob.id, kind: e.mob.kind, ...s });
        this.dropsOf(e.mob);
        // A few motes in its own colour (calm: no burst, no flash on the screen).
        const p = e.mob.position;
        g.particles.sparkle(p.x, p.y, p.z, DEATH_MOTES[e.mob.kind] ?? 0xcfd8e0, e.mob.kind === 'sentinel' ? 9 : 5, g.rng, e.mob.kind === 'sentinel' ? 1.6 : 0.8);
        if (e.mob.kind === 'sentinel') g.ui.toast(t('mob.sentinelDown'), 'good');
        break;
      }
      case 'interact':
        bus.emit('mob:interact', { id: e.mob.id, kind: e.mob.kind, action: e.action });
        if (e.action === 'caught' || e.action === 'harvested') {
          this.dropsOf(e.mob, e.action === 'harvested' ? 1 : undefined);
          const p = e.mob.position;
          g.particles.sparkle(p.x, p.y + 0.2, p.z, e.mob.kind === 'shellback' ? 0x7ad8ff : e.mob.kind === 'glimmerkin' ? 0xc29cff : 0xffd36a, 6, g.rng, 0.7);
        }
        if (e.action === 'spores') {
          g.lanternFuel.add(MOBS_RULES.jellyOil);
          this.renderer.burstSpores(e.mob.position.x, e.mob.position.y, e.mob.position.z);
          g.ui.hint(t('mob.spores'), 2600);
        }
        if (e.action === 'harvested') g.ui.hint(t('mob.harvested'), 2000);
        if (e.action === 'caught' && e.mob.kind === 'burrower') g.ui.hint(t('mob.thief'), 2000);
        break;
      case 'drain':
        this.drainOil(e.seconds);
        break;
      case 'cue': {
        const s = this.stereo(e.mob.position, e.mob.kind === 'worm' ? 120 : 30);
        if (s.gain > 0.02) bus.emit('mob:cue', { kind: e.mob.kind, cue: e.cue, pan: s.pan, gain: s.gain });
        break;
      }
      case 'meet':
        this.meet(e.mob.kind);
        break;
      case 'shot': {
        const s = this.stereo(e.shot.p);
        bus.emit('mob:shot', { phase: e.phase, ...s });
        break;
      }
      case 'recoil':
      case 'wake':
        break;
    }
  }

  /**
   * A wisp drinks `seconds` of oil (Lantern.add only adds, so the oil is burnt like a frame's), and
   * the low and empty warnings still sound when its feeding crosses them.
   */
  private drainOil(seconds: number): void {
    const g = this.game;
    if (!(seconds > 0) || !g.lanternFuel.lit) return;
    const e = g.lanternFuel.update(seconds, false, lanternForTier(g.equipment.tiers.lantern));
    if (e.becameLow) {
      g.bus.emit('lantern:low', {});
      g.ui.hint(t('hint.lanternLow'), 3500);
    }
    if (e.becameEmpty) {
      g.bus.emit('lantern:empty', {});
      g.ui.hint(t('hint.lanternEmpty'), 5000);
    }
  }

  /** A monster's blow lands: health, the hurt cue, and a black-out at zero. */
  private hurt(amount: number, mob: SimMob): void {
    const g = this.game;
    if (g.mode !== 'playing') return;
    const dealt = g.health.damage(amount);
    if (dealt <= 0) return;
    g.bus.emit('player:damaged', { amount: dealt, cause: 'hazard' });
    // A dark red pulse and a small jolt: the explorer was struck (the hit flash on monsters is theirs alone).
    g.renderer.post.params.flash = Math.max(g.renderer.post.params.flash, 0.07);
    g.renderer.post.params.flashColor.setRGB(0.55, 0.04, 0.03);
    g.cameraRig.addTrauma(0.18);
    void mob;
    if (g.health.dead) this.hooks.die();
  }

  /** The first meeting of a kind: one calm hint per game (the names and the line are in i18n/en/mobs). */
  private meet(kind: MobKind): void {
    const g = this.game;
    g.bus.emit('mob:met', { kind });
    const id = `mob.${kind}`;
    if (this.met.has(kind) || g.progression.hintsShown.has(id)) return;
    this.met.add(kind);
    g.progression.hintsShown.add(id);
    const key = `mob.meet.${kind}`;
    if (hasText(key)) g.ui.hint(t(key as TextKey), 4200);
  }

  /** Drops fly to the bag like a mined vein's. */
  private dropsOf(m: SimMob, only?: number): void {
    const g = this.game;
    const table = m.kind === 'burrower' && m.treasure ? TREASURE_DROPS : MOB_DROPS[m.kind];
    if (!table) return;
    const rng = g.rng;
    const list = only !== undefined ? table.slice(0, only) : table;
    for (const d of list) {
      if (rng.next() > d.chance) continue;
      const item = d.items.find((i) => i in ITEMS) as ItemId | undefined;
      if (!item) continue;
      const n = rng.int(d.min, d.max);
      g.drops.spawn(item, n, m.position.x, m.position.y + 0.3, m.position.z, rng);
    }
  }

  /** Spawn by hand (debug and tests): a creature near a point, or in front of the explorer. */
  spawnAt(kind: MobKind, x: number, y: number, z: number, opts: { treasure?: boolean; asleep?: boolean } = {}): SimMob | null {
    if (kind === 'moth') {
      const ctx = this.lastCtx ?? this.context(true);
      this.sim.spawnMoths(ctx, 8, { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
      return this.sim.mobs.filter((m) => m.kind === 'moth').at(-1) ?? null;
    }
    if (kind === 'worm') return this.sim.spawnWorm({ x, y, z }, this.lastCtx ?? this.context(true));
    if (kind === 'sentinel') {
      const relic = this.sim.sentinelSites[0]?.relic ?? 'relicChoir';
      return this.sim.spawn('sentinel', x, y, z, { relic, asleep: opts.asleep ?? true });
    }
    return this.sim.spawn(kind, x, y, z, opts);
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.renderer.dispose();
  }
}
