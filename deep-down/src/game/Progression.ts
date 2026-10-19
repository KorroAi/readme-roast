import * as THREE from 'three';
import { B } from '../config/blocks';
import { CACHE, COLD, HOME, WORLD, lanternForTier } from '../config/balance';
import { ITEMS, ITEM_IDS, RUNE_ITEMS, type ItemId } from '../config/items';
import { damp } from '../core/math';
import { t } from '../i18n';
import { Cold } from '../gameplay/Cold';
import { CacheSpot, type SpotFields } from '../gameplay/CacheSpot';
import { cacheFits, makeCache, recoverCache, replaceCache, type CacheState } from '../gameplay/Expedition';
import { totalCount } from '../gameplay/counts';
import { discoveryNumbering, DISCOVERY_TOTAL } from '../gameplay/discoveries';
import { nextLine, type NextLine } from '../gameplay/NextStep';
import { Records, type ExpeditionReport, type TripOutcome } from '../gameplay/Records';
import { defaultProgression } from '../save/saveData';
import type { ItemCounts, ProgressionSave, SaveData } from '../save/types';
import type { FuelState, HudState, SaveSummary } from '../ui/types';
import { HomeField, ReachSet, walkSeconds } from '../world/analysis/homeField';
import type { PropSpec } from '../world/gen/types';
import type { HaloSource } from './effects/Halos';
import type { Game } from './Game';
import { Guidance } from './Guidance';

/** Prop id of the pack left behind (interim model: a small crate with an ember halo). */
export const CACHE_PROP_ID = 'cache:pack';

/** What a black-out or an abandoned trip left behind. */
export interface LeftBehind {
  /** Items now waiting in the cache. */
  cached: ItemCounts;
  count: number;
  /** Items destroyed with the previous cache. */
  replaced: number;
  cache: CacheState | null;
}

/**
 * The progression controller: everything that makes a trip a decision and progress durable.
 * Game owns the systems and the frame loop and delegates to this class at the loop's seams
 * (camp entry and exit, black-out, abandon, interaction, HUD, save). Later waves extend
 * Progression rather than Game.
 *
 * - Expedition tracking and records (gameplay/Records): 'expedition:started' / 'expedition:ended'.
 * - The walk-home field (world/analysis/homeField): compass in walking metres, the turn-back
 *   mark on the lantern gauge ('lantern:turnBack' once per trip), the critical state.
 * - The cold (gameplay/Cold) once the flame dies.
 * - The cache: a black-out leaves the pack (minus the Sealed Pouch) where the explorer last
 *   stood safely; walking back to it returns the items.
 * - The Next line on the objective pill (gameplay/NextStep).
 */
export class Progression {
  records = new Records();
  cache: CacheState | null = null;
  readonly cold = new Cold();
  /** Tutorial hints already shown (persisted). */
  readonly hintsShown = new Set<string>();
  /** Fields of SaveData.progression that later waves own, carried through unchanged. */
  private extra: Omit<ProgressionSave, 'expeditions' | 'trip' | 'records' | 'cache' | 'hintsShown'> = strip(defaultProgression());

  home: HomeField | null = null;
  reach: ReachSet | null = null;
  private cacheField: HomeField | null = null;
  private fieldsDirty = true;
  private fieldsScheduled = false;
  private minedSinceField = 0;
  private cacheFieldFor: CacheState | null = null;

  /** Last cell the explorer stood on safely (grounded >= CACHE.groundedSeconds, on the reach set). */
  private readonly spot = new CacheSpot();
  private readonly spotFields: SpotFields = {
    cellAt: (x, y, z) => {
      const h = this.home;
      const c = h ? h.cellNear(x, y, z) : -1;
      return h && c >= 0 ? h.cellXYZ(c) : null;
    },
    reachable: (x, y, z) => this.reach?.has(x, y, z) ?? false,
    homeSteps: (x, y, z) => this.home?.at(x, y, z) ?? -1,
  };
  private turnBackShown = false;
  private coldHinted = false;
  private cacheBlockedHint = false;
  private cachePropShown = false;

  // Per-frame derived state (read by hud()).
  private homeSecondsV: number | null = null;
  private campBearing = 0;
  private campDistance = 0;
  private cacheBearing = 0;
  private cacheDistance = 0;
  private fuelStateV: FuelState = 'ok';
  private readonly campAim = new THREE.Vector3();
  private readonly cacheAim = new THREE.Vector3();
  private campAimSet = false;
  private cacheAimSet = false;
  private next: NextLine = { id: 'mineStone', text: '' };
  private readonly compassOut: HudState['compass'] = { kind: 'camp', bearing: 0, distance: 0 };
  private readonly cacheOut: NonNullable<HudState['cache']> = { bearing: 0, distance: 0, count: 0 };
  private cacheCount = 0;
  private nextTimer = 0;

  constructor(private readonly game: Game) {}

  // ------------------------------------------------------------------------------------
  // Lifecycle

  /** Fresh game: no records, no cache, no trip. */
  reset(): void {
    this.records = new Records();
    this.setCache(null);
    this.cold.reset();
    this.hintsShown.clear();
    this.extra = strip(defaultProgression());
    this.spot.reset();
    this.turnBackShown = false;
    this.coldHinted = false;
    this.nextTimer = 0;
  }

  fromSave(p: ProgressionSave): void {
    this.records = new Records({ ...p.records, expeditions: Math.max(p.records.expeditions, p.expeditions) }, p.trip);
    this.setCache(p.cache ? { ...p.cache, items: { ...p.cache.items } } : null);
    this.cold.reset();
    this.hintsShown.clear();
    for (const h of p.hintsShown) this.hintsShown.add(h);
    this.extra = strip(p);
    this.spot.reset();
    this.turnBackShown = false;
    this.coldHinted = false;
    this.nextTimer = 0;
  }

  toSave(): ProgressionSave {
    const { records, trip } = this.records.toJSON();
    return {
      ...this.extra,
      expeditions: records.expeditions,
      trip,
      records,
      cache: this.cache ? { ...this.cache, items: { ...this.cache.items } } : null,
      hintsShown: [...this.hintsShown],
    };
  }

  /**
   * The world is loaded (new game, continue, or a reload): build the walking fields now so the
   * compass is right from the first frame, show the cache, and resume a trip if the save was
   * made away from camp.
   */
  attachWorld(atCamp: boolean): void {
    const w = this.game.session.world;
    if (!this.home || this.home.dist.length !== w.blocks.length) {
      this.home = new HomeField(w);
      this.reach = new ReachSet(w);
      this.cacheField = null;
    }
    this.fieldsDirty = true;
    this.recomputeFields();
    this.campAimSet = this.cacheAimSet = false;
    this.cachePropShown = false;
    this.syncCacheProp();
    if (!atCamp && !this.records.trip) this.startTrip();
  }

  // ------------------------------------------------------------------------------------
  // Loop seams (called by Game)

  onCampLeft(): void {
    this.startTrip();
    this.scheduleFields();
  }

  /** Camp entry, after banking: the trip ends as 'returned'. */
  onCampEntered(banked: ItemCounts): ExpeditionReport | null {
    this.cold.reset();
    return this.endTrip('returned', { banked });
  }

  /** A black-out: the pack (minus the pouch) and loose drops become the cache. */
  onBlackout(): LeftBehind {
    return this.leaveCache('blackout');
  }

  /** The pause menu's Return to Camp: the pack waits where the explorer stands. */
  onAbandon(): LeftBehind {
    return this.leaveCache('abandoned');
  }

  onBlockMined(): void {
    this.records.mined();
    if (++this.minedSinceField >= HOME.recomputeBlocks) this.scheduleFields();
  }

  onItemPicked(item: ItemId, count: number): void {
    this.records.picked(item, count);
  }

  onDamaged(amount: number): void {
    this.records.damaged(amount);
  }

  /** Banner numbering for a discovery just recorded (the journal already holds it). */
  onDiscovery(id: string): { index: number; total: number; major: boolean } {
    this.records.discovered(id);
    return discoveryNumbering(id, this.game.journal.discoveries);
  }

  /**
   * Advance one playing frame (after the player, lantern and camp updates).
   * @returns true when the cold has blacked the explorer out (the caller runs the black-out).
   */
  update(dt: number): boolean {
    const g = this.game;
    const p = g.player;
    const atCamp = g.inCamp;
    if (this.fieldsDirty && !this.fieldsScheduled) this.scheduleFields();

    // Depth records, announced in 10 m steps (from the second expedition on, as a toast). Only
    // depths stood on during an expedition count: a fatal fall into the rift is not a record.
    const mark = p.grounded && this.records.trip ? this.records.depth(Math.max(0, WORLD.depthOffset - p.y)) : 0;
    if (mark > 0) {
      g.bus.emit('record:depth', { depth: mark });
      if (this.records.records.expeditions > 0) g.ui.toast(t('toast.depthRecord', { depth: mark }), 'good');
    }

    this.trackSafeCell(dt);
    this.updateGuidance(dt, atCamp);

    // Fuel: the turn-back mark and the critical state.
    const lantern = g.lanternFuel;
    const home = this.homeSecondsV;
    let state: FuelState = 'ok';
    if (!lantern.lit) state = 'empty';
    else if (!atCamp && home !== null) {
      if (lantern.fuel <= home * HOME.criticalFactor) state = 'critical';
      else if (lantern.fuel <= home * HOME.turnBackFactor + HOME.turnBackMarginS) state = 'tight';
    }
    this.fuelStateV = state;
    if (!atCamp && state !== 'ok' && !this.turnBackShown && this.records.trip && home !== null) {
      this.turnBackShown = true;
      const seconds = Math.max(1, Math.round(home));
      g.bus.emit('lantern:turnBack', { seconds });
      g.ui.toast(t('toast.turnBack', { s: seconds }), 'warn');
    }

    // The cold.
    const def = lanternForTier(g.equipment.tiers.lantern);
    const bite = this.cold.update(dt, { lit: lantern.lit, atCamp, immune: def.noCold, factor: this.extra.gear.includes('minersCoat') ? COLD.coatFactor : 1 });
    if (bite.damage > 0) {
      const dealt = g.health.damage(bite.damage);
      this.records.damaged(dealt);
      if (!this.coldHinted) {
        this.coldHinted = true;
        g.ui.hint(t('hint.cold'), 4000);
      }
      if (bite.tick) g.bus.emit('player:cold', { damage: bite.tickDamage });
      if (g.health.dead) return true;
    }

    this.updateCachePickup();

    this.nextTimer -= dt;
    if (this.nextTimer <= 0) this.refreshNext();
    return false;
  }

  /** Force the Next line to be rebuilt on the next frame (inventory or objective changed). */
  invalidateNext(): void {
    this.nextTimer = 0;
  }

  // ------------------------------------------------------------------------------------
  // HUD and views

  hud(out: HudState): void {
    const g = this.game;
    const l = g.lanternFuel;
    const atCamp = g.inCamp;
    out.fuelSeconds = l.fuel;
    out.fuelCapacity = l.capacity;
    out.homeSeconds = atCamp ? null : this.homeSecondsV;
    out.turnBackFraction = atCamp || this.homeSecondsV === null ? null : Math.min(1, (this.homeSecondsV * HOME.turnBackFactor + HOME.turnBackMarginS) / l.capacity);
    out.fuelState = atCamp ? (l.lit ? 'ok' : 'empty') : this.fuelStateV;
    out.cold = atCamp ? 0 : this.cold.level;
    // Nested HUD objects are reused: the HUD compares values, and nothing is allocated per frame.
    const compass = this.compassOut;
    compass.kind = 'camp';
    compass.bearing = this.campBearing;
    compass.distance = this.campDistance;
    out.compass = compass;
    out.campBearing = this.campBearing;
    out.campDistance = this.campDistance;
    if (this.cache) {
      const c = this.cacheOut;
      c.bearing = this.cacheBearing;
      c.distance = this.cacheDistance;
      c.count = this.cacheCount;
      out.cache = c;
    } else out.cache = null;
    out.bestDepth = this.records.records.deepest;
    out.newBest = this.records.newBest;
    out.packFull = g.backpack.usedSlots >= g.backpack.slotCount;
    out.pouchSlots = g.backpack.pouchSlots;
    out.objectiveText = this.next.text;
  }

  /** The Next line currently on the pill. */
  get nextStep(): Readonly<NextLine> {
    if (!this.next.text) this.refreshNext();
    return this.next;
  }

  get report(): ExpeditionReport | null {
    return this.records.report;
  }

  dismissReport(): void {
    this.records.dismissReport();
  }

  /** The halo over the pack left behind (Game merges it into the halo sources). */
  haloSource(): HaloSource | null {
    const c = this.cache;
    return c ? { x: Math.floor(c.x), y: Math.floor(c.y + 0.6), z: Math.floor(c.z), id: B.LIGHT_EMBER } : null;
  }

  /** Walking metres to camp from here (straight-line where no walk home exists). */
  get walkToCamp(): number {
    return this.campDistance;
  }

  /** Seconds of walking home, or null where the field has no way home. */
  get homeSeconds(): number | null {
    return this.homeSecondsV;
  }

  get fuelState(): FuelState {
    return this.fuelStateV;
  }

  get walkToCache(): number | null {
    return this.cache ? this.cacheDistance : null;
  }

  /** The cell the cache would land on right now. */
  get safeStandCell(): readonly [number, number, number] | null {
    return this.spot.cell;
  }

  /** Recompute the walking fields now (tests, and after world edits from the debug API). */
  recomputeFields(): void {
    const g = this.game;
    const s = g.session;
    if (!this.home || !this.reach) return;
    this.fieldsDirty = false;
    this.minedSinceField = 0;
    this.home.computeToRegion(s.layout.camp);
    const sp = s.layout.spawn;
    this.reach.computeFrom(Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z));
    this.computeCacheField();
  }

  /** Timing of the last field recompute, ms. */
  fieldTimings(): { homeMs: number; reachMs: number; cacheMs: number; homeCells: number } {
    return { homeMs: this.home?.lastMs ?? 0, reachMs: this.reach?.lastMs ?? 0, cacheMs: this.cacheField?.lastMs ?? 0, homeCells: this.home?.size ?? 0 };
  }

  // ------------------------------------------------------------------------------------
  // Camp props

  interactLabel(spec: PropSpec): string {
    switch (spec.interact) {
      case 'craft':
        return t('hint.interactWorkbench');
      case 'storage':
        return t('hint.interactChest');
      case 'rest':
        return t('hint.interactCampfire');
      case 'relic':
        return t('hint.interactTablet');
      default:
        return t('hud.interact');
    }
  }

  interact(spec: PropSpec): void {
    const g = this.game;
    switch (spec.interact) {
      case 'craft':
        g.openCrafting();
        break;
      case 'storage':
        g.openInventory();
        break;
      case 'rest':
        g.health.heal(g.health.max);
        g.lanternFuel.refill(lanternForTier(g.equipment.tiers.lantern));
        this.cold.reset();
        g.ui.toast(t('toast.rested'), 'good');
        g.saveNow('rest');
        break;
      case 'relic':
        g.collectRelic(spec);
        break;
    }
  }

  // ------------------------------------------------------------------------------------
  // Internals

  private startTrip(): void {
    const g = this.game;
    if (this.records.trip) return;
    const n = this.records.start(g.playTime, WORLD.depthOffset - g.player.y);
    this.turnBackShown = false;
    this.coldHinted = false;
    g.bus.emit('expedition:started', { n });
  }

  private endTrip(outcome: TripOutcome, extra: { banked?: ItemCounts; cached?: ItemCounts | null; cacheDepth?: number | null; lostCount?: number }): ExpeditionReport | null {
    const g = this.game;
    const report = this.records.end({ outcome, now: g.playTime, fuelLeft: g.lanternFuel.fuel, ...extra });
    this.turnBackShown = false;
    if (report) g.bus.emit('expedition:ended', { report });
    return report;
  }

  private leaveCache(outcome: 'blackout' | 'abandoned'): LeftBehind {
    const g = this.game;
    const replaced = this.cache ? totalCount(this.cache.items) : 0;
    const ground = g.drops.clear();
    const items = makeCache(g.backpack, ground);
    const count = totalCount(items);
    if (outcome === 'abandoned' && count === 0) {
      // Nothing to leave: giving up a trip with an empty pack keeps the pack already waiting.
      this.cold.reset();
      this.endTrip(outcome, { cached: {}, cacheDepth: null, lostCount: 0 });
      return { cached: items, count: 0, replaced: 0, cache: this.cache };
    }
    // One cache at a time: a second black-out destroys the first, even when it leaves nothing.
    const [x, y, z] = count > 0 ? this.cacheCell() : [0, 0, 0];
    const { cache } = replaceCache(this.cache, items, { x: x + 0.5, y, z: z + 0.5, depth: Math.max(0, Math.round(WORLD.depthOffset - y)) });
    this.setCache(cache);
    this.cold.reset();
    if (cache || replaced > 0) g.bus.emit('cache:created', { x: cache?.x ?? 0, y: cache?.y ?? 0, z: cache?.z ?? 0, count, replaced });
    this.endTrip(outcome, { cached: items, cacheDepth: cache?.depth ?? null, lostCount: replaced });
    g.bus.emit('inventory:changed', {});
    return { cached: items, count, replaced, cache };
  }

  /** Where a cache lands: the last safe cell, else the nearest walkable cell, else the camp spawn. */
  private cacheCell(): [number, number, number] {
    const p = this.game.player;
    const at = this.spot.place(p.x, p.y, p.z, this.spotFields);
    if (at) return at;
    const sp = this.game.session.layout.spawn;
    return [Math.floor(sp.x), Math.floor(sp.y), Math.floor(sp.z)];
  }

  private trackSafeCell(dt: number): void {
    const p = this.game.player;
    this.spot.update(dt, p.grounded, p.x, p.y, p.z, this.spotFields);
  }

  private updateGuidance(dt: number, atCamp: boolean): void {
    const g = this.game;
    const p = g.player;
    const camYaw = g.cameraRig.yaw;
    const camp = g.session.layout.landmarks.campfire;
    const home = this.home;
    const cell = home && !atCamp ? home.cellNear(p.x, p.y, p.z) : -1;
    if (cell >= 0 && home) {
      const steps = home.dist[cell];
      this.homeSecondsV = walkSeconds(steps);
      this.campDistance = steps;
      const [tx, ty, tz] = home.cellXYZ(home.descend(cell, HOME.lookAheadSteps));
      aimAt(this.campAim, tx + 0.5, ty, tz + 0.5, dt, !this.campAimSet);
      this.campAimSet = true;
      this.campBearing = Guidance.bearing(camYaw, p.x, p.z, this.campAim.x, this.campAim.z);
    } else {
      // At camp, or somewhere the field has no way home (off the walkable set): a straight line.
      const straight = Math.hypot(camp[0] - p.x, camp[1] - p.y, camp[2] - p.z);
      this.homeSecondsV = atCamp ? 0 : home ? walkSeconds(straight) : null;
      this.campDistance = Math.round(straight);
      this.campAimSet = false;
      this.campBearing = Guidance.bearing(camYaw, p.x, p.z, camp[0], camp[2]);
    }
    const c = this.cache;
    if (!c) return;
    const cf = this.cacheField;
    const cc = cf && this.cacheFieldFor === c ? cf.cellNear(p.x, p.y, p.z) : -1;
    if (cc >= 0 && cf) {
      this.cacheDistance = cf.dist[cc];
      const [tx, ty, tz] = cf.cellXYZ(cf.descend(cc, HOME.lookAheadSteps));
      aimAt(this.cacheAim, tx + 0.5, ty, tz + 0.5, dt, !this.cacheAimSet);
      this.cacheAimSet = true;
      this.cacheBearing = Guidance.bearing(camYaw, p.x, p.z, this.cacheAim.x, this.cacheAim.z);
    } else {
      this.cacheDistance = Math.round(Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z));
      this.cacheAimSet = false;
      this.cacheBearing = Guidance.bearing(camYaw, p.x, p.z, c.x, c.z);
    }
  }

  private updateCachePickup(): void {
    const c = this.cache;
    if (!c) return;
    const g = this.game;
    const p = g.player;
    const d = Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z);
    if (d > CACHE.pickupRadius) {
      if (d > CACHE.pickupRadius * 2) this.cacheBlockedHint = false;
      return;
    }
    if (!cacheFits(c, g.backpack)) {
      if (!this.cacheBlockedHint) {
        this.cacheBlockedHint = true;
        g.ui.hint(t('hint.backpackFull'), 2500);
      }
      return;
    }
    const res = recoverCache(c, g.backpack);
    g.bus.emit('cache:recovered', { count: res.count, left: res.left });
    g.bus.emit('inventory:changed', {});
    g.particles.sparkle(c.x, c.y + 0.4, c.z, 0xffc58a, 14, g.rng, 1.6);
    if (res.left > 0) {
      g.ui.toast(t('toast.cacheRecoveredPartial', { count: res.count, left: res.left }), 'info');
      this.cacheBlockedHint = true;
      this.cacheCount = res.left;
    } else {
      g.ui.toast(t('toast.cacheRecovered', { count: res.count }), 'good');
      this.setCache(null);
    }
    this.invalidateNext();
    g.saveNow('cache');
  }

  private setCache(c: CacheState | null): void {
    this.cache = c;
    this.cacheCount = c ? totalCount(c.items) : 0;
    this.cacheAimSet = false;
    this.cacheBlockedHint = false;
    this.syncCacheProp();
    if (c && this.home) this.computeCacheField();
    if (!c) this.cacheFieldFor = null;
    this.invalidateNext();
  }

  /** Show the cache prop and its halo where the cache lies (or remove them). */
  private syncCacheProp(): void {
    const g = this.game;
    const props = g.session?.props;
    if (!props) return;
    if (this.cachePropShown || props.has(CACHE_PROP_ID)) props.remove(CACHE_PROP_ID);
    this.cachePropShown = false;
    const c = this.cache;
    if (c) {
      props.add({ id: CACHE_PROP_ID, kind: 'crate', x: c.x, y: c.y, z: c.z, rotY: 0.6, scale: 0.55, anchor: null, emitters: [], seed: 7 });
      this.cachePropShown = true;
    }
    g.markHalosDirty();
  }

  private computeCacheField(): void {
    const c = this.cache;
    if (!c) return;
    const w = this.game.session.world;
    this.cacheField ??= new HomeField(w);
    this.cacheField.computeToCell(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z));
    this.cacheFieldFor = c;
  }

  /** Recompute the fields between frames (setTimeout / idle), not inside a frame's step. */
  private scheduleFields(): void {
    this.fieldsDirty = true;
    if (this.fieldsScheduled) return;
    this.fieldsScheduled = true;
    const run = () => {
      this.fieldsScheduled = false;
      if (this.fieldsDirty) this.recomputeFields();
    };
    const idle = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (typeof idle === 'function') idle(run, { timeout: 200 });
    else setTimeout(run, 0);
  }

  private refreshNext(): void {
    const g = this.game;
    this.nextTimer = 0.25;
    const available: ItemCounts = {};
    for (const id of ITEM_IDS) {
      if (ITEMS[id].keyItem) continue;
      const n = g.backpack.count(id) + g.storage.count(id);
      if (n > 0) available[id] = n;
    }
    this.next = nextLine({
      cacheDistance: this.cache ? this.cacheDistance : null,
      chain: g.objectives.step(),
      equipment: g.equipment.tiers,
      available,
      bestDepth: this.records.records.deepest,
    });
  }
}

/** Summary of a saved game for the Continue card. */
export function summarizeSave(d: SaveData): SaveSummary {
  const runes = RUNE_ITEMS.filter((id) => d.journal.includes(id)).length;
  return {
    savedAt: d.savedAt,
    playTime: d.playTime,
    expeditions: Math.max(d.progression.expeditions, d.progression.records.expeditions),
    bestDepth: d.progression.records.deepest,
    discoveries: d.discoveries.length,
    discoveriesTotal: DISCOVERY_TOTAL,
    runes,
    runesTotal: RUNE_ITEMS.length,
    equipment: { ...d.equipment },
    cacheWaiting: d.progression.cache !== null,
  };
}

function strip(p: ProgressionSave): Omit<ProgressionSave, 'expeditions' | 'trip' | 'records' | 'cache' | 'hintsShown'> {
  const { expeditions: _e, trip: _t, records: _r, cache: _c, hintsShown: _h, ...rest } = p;
  return { ...rest, stations: [...rest.stations], gear: [...rest.gear], relics: [...rest.relics], seams: [...rest.seams], minedDay: [...rest.minedDay] };
}

/** Ease the compass aim point toward a new target (snap the first time). */
function aimAt(v: THREE.Vector3, x: number, y: number, z: number, dt: number, snap: boolean): void {
  if (snap || dt <= 0) {
    v.set(x, y, z);
    return;
  }
  v.x = damp(v.x, x, 8, dt);
  v.y = damp(v.y, y, 8, dt);
  v.z = damp(v.z, z, 8, dt);
}
