import * as THREE from 'three';
import { SOLID } from '../../config/blocks';
import { ITEMS, type ItemId } from '../../config/items';
import { WORLD, lanternForTier } from '../../config/balance';
import { hasText, t, type TextKey } from '../../i18n';
import { MobRenderer } from '../../render/mobs/MobRenderer';
import { MOB_DROPS, MOBS_RULES, TREASURE_DROPS } from './config';
import { MobSim, type MobEnv, type MobSimEvent, type SentinelSite, type SimMob } from './MobSim';
import { standableFor } from './nav';
import { BestiaryLog, type BestiarySave } from './bestiary';
import { guardianState } from './guardian';
import { ROSTERS } from './rosters';
import { setSpawnSpots, type Lair, type Nest } from './spawner';
import { SPECIES } from './species';
import type { BestiaryEntryView, GuardianState, Mob, MobBiome, MobContext, MobHitResult, MobKind, MobRay, MobStrike, MobSystem } from './types';
import type { Game } from '../Game';

/**
 * The creatures in the game (rounds 2-3, MOBS): the seam's MobSystem over the simulation (MobSim)
 * and the renderer (render/mobs), wired to the explorer:
 * - monsters' blows and spits go through Health (a dash's i-frames let them pass; a black-out is
 *   the first version's), the wisps drink lantern oil, a guardian's snuff chokes the light;
 * - the beings give gems, crystals, nectar and light spores through the drops;
 * - the strata: biome rosters (WORLD's biomeAt), the lairs' guardians and the nests from the
 *   stratum layout; a guardian's defeat is the biome's Heart Shard ('mob:guardianDefeated');
 * - the bestiary: a page per creature (met, scanned by the sonar or a long look, defeated);
 * - every moment has a sound (audio/mobSfx through 'mob:sfx' and the round-2 'mob:*' events).
 *
 * Game.ts holds one (`game.mobs`) and calls frame() once per frame after the lantern update.
 */
export interface MobDirectorHooks {
  /** The explorer's health reached 0 (Game blacks out). */
  die(): void;
}

/** What MobDirector reads off the game that is not in Game's own type yet (UI's and WORLD's round-3 fields). */
interface GameExtras {
  /** UI: seconds of dash i-frames left. */
  invulnerable?: number;
  /** WORLD: the stratum manager (built outposts are safe ground). */
  strata?: { current?: number; outposts?: ReadonlyArray<{ p?: readonly number[]; x?: number; y?: number; z?: number }> };
  /** A day cycle if one is added (0 day .. 1 night). */
  dayNight?: number;
  events?: { handle?: (k: 'migration' | 'treasure') => void };
}

/** The stratum layout fields MOBS reads (structurally: WORLD's StratumLayout). */
interface StrataLayout {
  stratum?: number;
  biomeAt?: (x: number, y: number, z: number) => string;
  lairs?: ReadonlyArray<{ id: string; biome: string; guardian: string; centre: readonly number[]; radius: number; spawn?: readonly number[] }>;
  nests?: ReadonlyArray<{ id?: string; biome: string; p: readonly number[]; radius?: number; kind?: string | null }>;
  spawnPoints?: ReadonlyArray<{ p: readonly number[]; biome: string; dark: boolean; open: boolean; ceiling: boolean }>;
  heart?: { centre: readonly number[]; radius: number; spawn: readonly number[] } | null;
}

const tmp = new THREE.Vector3();
const right = new THREE.Vector3();
const look = new THREE.Vector3();

/** The dark tide: with no day cycle in the deep, the creatures stir in waves (an 8-minute cycle, 0..1). */
export function darkTide(seconds: number, period = 480): number {
  const k = 0.5 - 0.5 * Math.cos((seconds / period) * Math.PI * 2);
  return Math.max(0, Math.min(1, (k - 0.35) / 0.65));
}

export class MobDirector implements MobSystem {
  readonly sim: MobSim;
  readonly renderer: MobRenderer;
  readonly group: THREE.Group;
  readonly bestiary = new BestiaryLog();
  private readonly offs: Array<() => void> = [];
  private hitStopLeft = 0;
  private lastCtx: MobContext | null = null;
  /** Debug / tests: turn the spawner off and drive everything by hand. */
  autoSpawn = true;
  private readonly met = new Set<MobKind>();
  private eventsHandled = false;
  private layoutSeen: unknown = null;
  /** The guardian the HUD shows (the last one that woke, while it is awake). */
  private fighting: SimMob | null = null;
  /** Night now (the dark tide, or a day cycle's). */
  night = 0;
  /** Captures and some tests: blows land (events, sounds) but take no health. */
  harmless = false;

  constructor(private readonly game: Game, private readonly hooks: MobDirectorHooks) {
    const g = game;
    const extras = () => g as unknown as GameExtras;
    const env: MobEnv = {
      solid: (x, y, z) => SOLID[g.session.world.get(x, y, z)] === 1,
      light: (x, y, z) => {
        const l = g.session.sampleLight(x + 0.5, y + 0.5, z + 0.5);
        return Math.max(l.r, l.g, l.b);
      },
      inCamp: (x, y, z) => {
        const r = g.session.layout.camp;
        if (!r || r.max[0] <= r.min[0]) return false;
        // A margin round the camp: nothing hostile within 4 m of it either.
        return x >= r.min[0] - 4 && x <= r.max[0] + 4 && y >= r.min[1] - 4 && y <= r.max[1] + 4 && z >= r.min[2] - 4 && z <= r.max[2] + 4;
      },
      depthOf: (y) => WORLD.depthOffset - y,
      safe: (x, y, z) => {
        const list = extras().strata?.outposts;
        if (!list) return false;
        for (const o of list) {
          const ox = o.p ? o.p[0] : o.x;
          const oy = o.p ? o.p[1] : o.y;
          const oz = o.p ? o.p[2] : o.z;
          if (ox === undefined || oy === undefined || oz === undefined) continue;
          if (Math.hypot(x - ox, (y - oy) * 0.7, z - oz) < 11) return true;
        }
        return false;
      },
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
      for (const m of this.sim.mobs) if (m.brain === 'moth' && m.state === 'follow' && m.position.distanceTo(tmp.set(x + 0.5, y + 0.5, z + 0.5)) < 2.5) m.setState('wander');
    }));
    // The sonar's pulse scans every creature in its reach (a bestiary page each).
    this.offs.push(bus.on('player:sonar', ({ x, y, z, radius }) => {
      this.scan(x, y, z, radius);
    }));
  }

  /**
   * The world's creatures' anchors: in the first world the monster line, the Sentinel's relic and the
   * worm's chasm; in a stratum its biome map, lairs, nests and spawn points. Called again when the
   * layout changes (a stratum switch swaps it).
   */
  private configureWorld(): void {
    const layout = this.game.session.layout;
    this.layoutSeen = layout;
    const lm = layout.landmarks as Record<string, readonly number[] | undefined>;
    const landing = lm.landing;
    if (landing) this.sim.monsterDepth = Math.round(WORLD.depthOffset - landing[1]);
    this.sim.sentinelSites = this.sentinelSites(lm);
    const anchors: Array<{ x: number; y: number; z: number }> = [];
    const feat = (layout as unknown as { features?: { worm?: ReadonlyArray<readonly number[]> } }).features;
    for (const p of feat?.worm ?? []) anchors.push({ x: p[0], y: p[1], z: p[2] });
    // The far chasms: the Glimmerfall's shaft and the bridge's chasm.
    for (const k of ['fallBottom', 'bridge', 'spindle']) {
      const p = lm[k];
      if (p) anchors.push({ x: p[0], y: p[1] + (k === 'fallBottom' ? 14 : -6), z: p[2] });
    }
    this.sim.wormAnchors = anchors;
    // The strata.
    const sl = layout as unknown as StrataLayout;
    const biomeAt = sl.biomeAt;
    this.sim.env.biomeAt = typeof biomeAt === 'function' ? (x, y, z) => {
      const b = biomeAt(x, y, z);
      return b in ROSTERS ? (b as MobBiome) : null;
    } : undefined;
    const lairs: Lair[] = [];
    for (const l of sl.lairs ?? []) {
      if (!(l.biome in ROSTERS) || !(l.guardian in SPECIES)) continue;
      const sp = l.spawn ?? l.centre;
      lairs.push({ id: l.id, biome: l.biome as MobBiome, guardian: l.guardian as Lair['guardian'], x: l.centre[0], y: l.centre[1], z: l.centre[2], radius: l.radius, sx: sp[0], sy: sp[1], sz: sp[2] });
    }
    if (sl.heart) {
      const h = sl.heart;
      lairs.push({ id: 'heart', biome: 'heart', guardian: 'heartOfDark', x: h.centre[0], y: h.centre[1], z: h.centre[2], radius: h.radius, sx: h.spawn[0], sy: h.spawn[1], sz: h.spawn[2] });
    }
    this.sim.lairs = lairs;
    const nests: Nest[] = [];
    let id = 1;
    for (const n of sl.nests ?? []) {
      if (!(n.biome in ROSTERS)) continue;
      nests.push({ id: id++, biome: n.biome as MobBiome, x: n.p[0], y: n.p[1], z: n.p[2], radius: n.radius ?? 3, kind: n.kind && n.kind in SPECIES ? (n.kind as MobKind) : null, next: 0, kills: 0 });
    }
    this.sim.nests = nests;
    setSpawnSpots((sl.spawnPoints ?? []).filter((q) => q.biome in ROSTERS).map((q) => ({ x: q.p[0], y: q.p[1], z: q.p[2], biome: q.biome as MobBiome, dark: q.dark, open: q.open, ceiling: q.ceiling })));
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
  private context(active: boolean): MobContext & { look: { x: number; y: number; z: number } } {
    const g = this.game;
    const x = g as unknown as GameExtras;
    const p = g.player;
    const u = g.session.rig.uniforms;
    const cam = g.cameraRig.camera;
    const eye = cam.position;
    const lit = g.lanternFuel.lit;
    cam.getWorldDirection(look);
    const sl = g.session.layout as unknown as StrataLayout;
    const biome = this.sim.forceBiome ?? (sl.biomeAt ? (this.sim.env.biomeAt?.(p.x, p.y + 0.5, p.z) ?? undefined) : undefined);
    this.night = typeof x.dayNight === 'number' ? x.dayNight : darkTide(g.playTime ?? 0);
    return {
      time: this.sim.time,
      player: { x: p.x, y: p.y, z: p.z, vx: p.vx, vz: p.vz },
      eye: { x: eye.x, y: eye.y, z: eye.z },
      look: { x: look.x, y: look.y, z: look.z },
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
      biome: biome ?? undefined,
      stratum: typeof sl.stratum === 'number' ? sl.stratum + (sl.stratum === 0 ? 1 : 0) : biome ? ROSTERS[biome].stratum : undefined,
      night: this.night,
      invulnerable: (x.invulnerable ?? 0) > 0,
      airborne: !p.grounded,
    };
  }

  /**
   * One frame: simulate (when playing), then pose and place the creatures, and apply what they do
   * to the light (the wisps dim it, lamplings and spores brighten it). Call after the lantern update.
   */
  frame(dt: number, active: boolean): void {
    const g = this.game;
    if (g.session.layout !== this.layoutSeen) {
      // A new stratum (or New Game): its anchors, a clean slate of creatures.
      this.clear();
      this.configureWorld();
    }
    // Tell WORLD's event director that the moth migration and the treasure thief are drawn here
    // (it only schedules the kinds someone draws). It may be hooked after us: look until it is.
    if (!this.eventsHandled) {
      const d = (g as unknown as GameExtras).events;
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
    // Hit stop: a strike on a monster freezes the creatures for 40-70 ms (the world keeps running).
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
      if (this.sim.snuffLeft > 0) u.uLanternRadius.value *= 0.6;
      this.renderer.step(dt, ctx.lantern.x, ctx.lantern.y, ctx.lantern.z);
    }
    if (this.fighting && (this.fighting.dying || this.fighting.state === 'sleep' || !this.sim.mobs.includes(this.fighting))) this.fighting = null;
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

  blast(x: number, y: number, z: number, radius: number, dmg: number): number {
    const n = this.sim.blast(x, y, z, radius, dmg);
    if (n > 0) this.hitStopLeft = Math.max(this.hitStopLeft, MOBS_RULES.hitStopHeavy);
    return n;
  }

  scan(x: number, y: number, z: number, radius: number): number {
    return this.sim.scan(x, y, z, radius);
  }

  activeGuardian(): GuardianState | null {
    const m = this.fighting;
    if (!m || m.dying || m.state === 'sleep') return null;
    return guardianState(m);
  }

  /** Every guardian about (the map's lair markers, tests). */
  guardians(): GuardianState[] {
    return this.sim.mobs.filter((m) => m.guardian && !m.dying).map(guardianState);
  }

  /** Beaten guardians' biomes (their shards are taken). */
  guardiansBeaten(): MobBiome[] {
    return [...this.sim.guardiansDone];
  }

  /** UI's Bestiary screen. */
  bestiaryView(): { entries: BestiaryEntryView[]; found: number; total: number } {
    return this.bestiary.view();
  }

  /** WORLD's save v4: the bestiary and the guardians beaten. */
  serialise(): BestiarySave {
    return this.bestiary.serialise(this.sim.guardiansDone);
  }

  restore(data: unknown): void {
    const beaten = this.bestiary.restore(data);
    this.sim.guardiansDone.clear();
    for (const b of beaten) this.sim.guardiansDone.add(b);
    this.sim.known.clear();
    for (const k of this.bestiary.known()) this.sim.known.add(k);
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
   * What the creatures do to the lantern now (1 = nothing): a feeding wisp or a guardian's snuff
   * dims it, lamplings and a jelly's spores brighten it. Applied to the light in frame().
   */
  get lightFactor(): number {
    return this.sim.dim * this.sim.boost;
  }

  /** A warming follower (a hearthmite) is with the explorer: LOOP's cold may read it (0..1). */
  get warmth(): number {
    for (const m of this.sim.mobs) if (m.kind === 'hearthmite' && m.state === 'follow') return 1;
    return 0;
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

  /** Put everything away (the menu, a respawn at camp, a stratum switch). */
  clear(): void {
    this.sim.clear();
    this.hitStopLeft = 0;
    this.fighting = null;
  }

  /** A fresh game (New Game, Continue): everything put away, the Sentinels asleep again by untaken relics. */
  reset(): void {
    this.clear();
    this.sim.sentinelDone.clear();
    this.met.clear();
  }

  /** New Game: the bestiary and the beaten guardians start over too (Continue restores them). */
  newExpedition(): void {
    this.reset();
    this.bestiary.clear();
    this.sim.known.clear();
    this.sim.guardiansDone.clear();
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

  private page(kind: MobKind, page: 'new' | 'complete' | null): void {
    if (!page) return;
    if (page === 'complete') this.sim.known.add(kind);
    this.game.bus.emit('mob:bestiary', { kind, page, found: this.bestiary.found, total: this.bestiary.total });
    if (page === 'complete' && SPECIES[kind].family === 'monster') {
      const key = `mob.${kind}`;
      this.game.ui.toast(t('mob.bestiary.page', { name: hasText(key) ? t(key as TextKey) : kind }), 'good');
    }
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
        bus.emit('mob:attack', { id: e.mob.id, kind: e.mob.kind, damage: e.damage, landed: e.landed, element: e.element });
        if (e.landed && e.damage > 0) this.hurt(e.damage, e.mob);
        break;
      case 'hit': {
        const s = this.stereo(e.mob.position);
        const p = e.mob.position;
        bus.emit('mob:hit', { id: e.mob.id, kind: e.mob.kind, damage: e.damage, killed: e.killed, armoured: e.armoured, weak: e.weak, x: p.x, y: p.y, z: p.z, ...s });
        this.sfxAt(e.armoured ? 'mob.hit.armour' : e.mob.def.voice.hit, p, e.weak ? 1.15 : 1);
        break;
      }
      case 'die': {
        const m = e.mob;
        const s = this.stereo(m.position);
        bus.emit('mob:died', { id: m.id, kind: m.kind, biome: m.biome, rank: m.rank, ...s });
        this.dropsOf(m);
        this.page(m.kind, this.bestiary.defeat(m.kind));
        // A few motes in its own colour (calm: no burst, no flash on the screen).
        const p = m.position;
        const big = m.guardian ? 16 : m.def.size === 'large' || m.def.size === 'huge' ? 9 : 5;
        g.particles.sparkle(p.x, p.y, p.z, m.def.mote, big, g.rng, m.guardian ? 2.4 : big > 5 ? 1.6 : 0.8);
        if (m.brain !== 'fuse') this.sfxAt(m.def.voice.die, p);
        if (m.kind === 'sentinel' && m.relic) g.ui.toast(t('mob.sentinelDown'), 'good');
        if (m.guardian) {
          const biome = m.lair?.biome ?? m.biome;
          bus.emit('mob:guardianDefeated', { id: m.id, kind: m.kind as GuardianState['kind'], biome, shard: biome, x: p.x, y: p.y, z: p.z });
          g.ui.toast(t('mob.guardianDown', { name: t(`mob.${m.kind}` as TextKey) }), 'good');
          if (this.fighting === m) this.fighting = null;
        }
        break;
      }
      case 'interact':
        bus.emit('mob:interact', { id: e.mob.id, kind: e.mob.kind, action: e.action });
        this.page(e.mob.kind, this.bestiary.befriend(e.mob.kind));
        if (e.action === 'caught' || e.action === 'harvested') {
          this.dropsOf(e.mob, e.action === 'harvested' ? 1 : undefined);
          const p = e.mob.position;
          g.particles.sparkle(p.x, p.y + 0.2, p.z, e.mob.def.mote, 6, g.rng, 0.7);
        }
        if (e.action === 'harvested' && e.mob.kind === 'vinebell') {
          g.health.heal(15);
          g.ui.hint(t('mob.nectar'), 2200);
        } else if (e.action === 'harvested') g.ui.hint(t(e.mob.kind === 'relicTurtle' ? 'mob.harvested.turtle' : 'mob.harvested'), 2000);
        if (e.action === 'spores') {
          g.lanternFuel.add(MOBS_RULES.jellyOil);
          this.renderer.burstSpores(e.mob.position.x, e.mob.position.y, e.mob.position.z);
          g.ui.hint(t('mob.spores'), 2600);
        }
        if (e.action === 'caught' && e.mob.brain === 'thief') g.ui.hint(t('mob.thief'), 2000);
        break;
      case 'drain':
        this.drainOil(e.seconds);
        break;
      case 'cue': {
        const s = this.stereo(e.mob.position, e.mob.kind === 'worm' ? 120 : 30);
        if (s.gain > 0.02) bus.emit('mob:cue', { kind: e.mob.kind, cue: e.cue, pan: s.pan, gain: s.gain });
        break;
      }
      case 'sfx':
        this.sfxAt(e.name, e, 1, e.mob?.guardian ? 60 : 32);
        break;
      case 'meet':
        this.meet(e.mob.kind);
        break;
      case 'shot': {
        const s = this.stereo(e.shot.p);
        bus.emit('mob:shot', { phase: e.phase, ...s });
        break;
      }
      case 'scanned': {
        const first = !this.bestiary.get(e.mob.kind).scanned;
        bus.emit('mob:scanned', { id: e.mob.id, kind: e.mob.kind, first });
        this.page(e.mob.kind, this.bestiary.scan(e.mob.kind));
        break;
      }
      case 'burst':
        g.particles.sparkle(e.x, e.y, e.z, e.color, Math.round(4 + e.size * 4), g.rng, 1.2 + e.size);
        break;
      case 'guardian': {
        const m = e.mob;
        const biome = m.lair?.biome ?? m.biome;
        if (e.phase === 'awake') {
          this.fighting = m;
          bus.emit('mob:guardianAwake', { id: m.id, kind: m.kind as GuardianState['kind'], biome });
          const key = `mob.title.${m.kind}`;
          if (hasText(key)) g.ui.toast(t(key as TextKey), 'info');
        } else if (e.phase === 'phase') {
          bus.emit('mob:guardianPhase', { id: m.id, kind: m.kind as GuardianState['kind'], biome, phase: m.phase });
          g.ui.hint(t('mob.guardianPhase'), 2200);
        } else {
          if (this.fighting === m) this.fighting = null;
          bus.emit('mob:guardianReset', { id: m.id, kind: m.kind as GuardianState['kind'], biome });
          g.ui.hint(t('mob.guardianReset'), 2600);
        }
        break;
      }
      case 'recoil':
      case 'wake':
        break;
    }
  }

  /** A creature's sound by name, placed in stereo (LOOP's eventMap plays 'mob:sfx'). */
  private sfxAt(name: string, p: { x: number; y: number; z: number }, pitch = 1, range = 32): void {
    const s = this.stereo(p, range);
    if (s.gain > 0.02) this.game.bus.emit('mob:sfx', { name, pan: s.pan, gain: s.gain, pitch });
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

  /** A monster's blow lands: health, the hurt cue, and a black-out at zero (a dash's i-frames let it pass). */
  private hurt(amount: number, mob: SimMob): void {
    const g = this.game;
    if (g.mode !== 'playing') return;
    if (((g as unknown as GameExtras).invulnerable ?? 0) > 0 || this.harmless) return;
    const dealt = g.health.damage(amount);
    if (dealt <= 0) return;
    g.bus.emit('player:damaged', { amount: dealt, cause: 'hazard' });
    // A dark red pulse and a small jolt: the explorer was struck (the hit flash on monsters is theirs alone).
    g.renderer.post.params.flash = Math.max(g.renderer.post.params.flash, mob.guardian ? 0.1 : 0.07);
    g.renderer.post.params.flashColor.setRGB(0.55, 0.04, 0.03);
    g.cameraRig.addTrauma(mob.guardian ? 0.26 : 0.18);
    if (g.health.dead) this.hooks.die();
  }

  /** The first meeting of a kind: one calm hint per game (the names and the line are in i18n/en/mobs), and its bestiary page. */
  private meet(kind: MobKind): void {
    const g = this.game;
    g.bus.emit('mob:met', { kind });
    this.page(kind, this.bestiary.see(kind));
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
    const table = m.brain === 'thief' && m.treasure ? TREASURE_DROPS : MOB_DROPS[m.kind];
    if (!table) return;
    const rng = g.rng;
    const list = only !== undefined ? table.slice(0, only) : table;
    // Brood called by a guardian leaves little (no farming the summons).
    const scale = m.owner ? 0.3 : 1;
    for (const d of list) {
      if (rng.next() > d.chance * scale) continue;
      const item = d.items.find((i) => i in ITEMS) as ItemId | undefined;
      if (!item) continue;
      const n = rng.int(d.min, d.max);
      g.drops.spawn(item, n, m.position.x, m.position.y + 0.3, m.position.z, rng);
    }
  }

  /** Spawn by hand (debug and tests): a creature near a point, or in front of the explorer. */
  spawnAt(kind: MobKind, x: number, y: number, z: number, opts: { treasure?: boolean; asleep?: boolean; ceiling?: boolean } = {}): SimMob | null {
    if (kind === 'moth') {
      const ctx = this.lastCtx ?? this.context(true);
      this.sim.spawnMoths(ctx, 8, { x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
      return this.sim.mobs.filter((m) => m.kind === 'moth').at(-1) ?? null;
    }
    if (kind === 'worm') return this.sim.spawnWorm({ x, y, z }, this.lastCtx ?? this.context(true));
    if (kind === 'sentinel' && this.sim.sentinelSites.length) {
      const relic = this.sim.sentinelSites[0]?.relic ?? 'relicChoir';
      return this.sim.spawn('sentinel', x, y, z, { relic, asleep: opts.asleep ?? true });
    }
    const sp = SPECIES[kind];
    if (sp.rank !== 'minion') {
      // A guardian by hand: its own arena round the spot (tests and captures).
      const lair: Lair = { id: `debug-${kind}`, biome: sp.biome, guardian: kind as Lair['guardian'], x, y, z, radius: (sp as { arena?: number }).arena ?? 20, sx: x, sy: y, sz: z };
      const m = this.sim.spawn(kind, x, y + ((sp as { hover?: number }).hover ?? 0), z, { lair, biome: sp.biome, asleep: opts.asleep ?? true });
      if (m) {
        m.home.x = x;
        m.home.y = y;
        m.home.z = z;
      }
      return m;
    }
    return this.sim.spawn(kind, x, y, z, { ...opts, biome: sp.biome });
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.renderer.dispose();
  }
}
