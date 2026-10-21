import * as THREE from 'three';
import { B } from '../config/blocks';
import { CACHE, COLD, GEAR, HOME, PLAYER, WORLD, lanternForTier, packForTier } from '../config/balance';
import { ITEMS, RELIC_ITEMS, RUNE_ITEMS, type ItemId } from '../config/items';
import { NODES, WEAPON_NODES, isNodeId, type NodeId, type Place, type StationId } from '../config/recipes';
import { bestWeapon, type Weapon, type WeaponId } from '../config/weapons';
import { damp } from '../core/math';
import { t } from '../i18n';
import { Cold } from '../gameplay/Cold';
import { CacheSpot, PitWatch, type SpotFields } from '../gameplay/CacheSpot';
import { cacheFits, makeCache, recoverCache, replaceCache, type CacheState } from '../gameplay/Expedition';
import { totalCount } from '../gameplay/counts';
import { discoveryNumbering, DISCOVERY_TOTAL } from '../gameplay/discoveries';
import { nextLine, type NextLine } from '../gameplay/NextStep';
import { Records, type ExpeditionReport, type ReportOvernight, type TripOutcome } from '../gameplay/Records';
import { craft as craftNode, type CraftContext, type CraftResult } from '../gameplay/Crafting';
import { Health } from '../gameplay/Health';
import { Backpack } from '../gameplay/Inventory';
import { buildJournalView } from '../gameplay/Journal';
import { NO_LIFE, buildFeatsView, featDef, newFeats, rewardText, type FeatSnapshot, type FeatsView } from '../gameplay/Feats';
import { CONTENT } from '../config/content';
import { StuckWatch } from '../gameplay/Hints';
import { DISCOVERIES } from '../gameplay/discoveries';
import { anyCraftable, availableCounts, buildTreeView, closestNode } from '../gameplay/Tree';
import { defaultProgression } from '../save/saveData';
import type { ItemCounts, ProgressionSave, SaveData } from '../save/types';
import type { CraftTreeView, FuelState, HudState, JournalTab, JournalView, Rumour, SaveSummary, SurveyView } from '../ui/types';
import { HomeField, ReachSet, walkSeconds } from '../world/analysis/homeField';
import type { PropSpec } from '../world/gen/types';
import type { HaloSource } from './effects/Halos';
import type { Game } from './Game';
import { EYE_HEIGHT } from './fp/constants';
import { Guidance } from './Guidance';
import { Runes, RUNES_TOTAL } from './Runes';
import { Stations } from './Stations';
import { EventDirector } from './events/EventDirector';
import type { EventContext } from './events/types';
import { areaNameOf, buildRumours, focusRumour, siteCell } from './Survey';

/** Within this far of a compass target's cell (walking steps), it counts as reached. */
const TARGET_REACHED_STEPS = 4;

/** Prop id of the pack left behind (a satchel with an ember glow and halo). */
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
 * - The upgrade tree (config/recipes NODES, gameplay/Crafting, gameplay/Tree): stations and gear
 *   built, their effects (the Grip Boots, the Miner's Coat), the tree view.
 * - The camp stations rising on their plots (game/Stations), the runes and the finale
 *   (game/Runes), the Survey Table's rumours and the compass target (game/Survey), the Journal.
 */
export class Progression {
  records = new Records();
  readonly stations: Stations;
  readonly runes: Runes;
  cache: CacheState | null = null;
  readonly cold = new Cold();
  /** Tutorial hints already shown (persisted). */
  readonly hintsShown = new Set<string>();
  /** Fields of SaveData.progression beyond the trip and records (stations, gear, relics, finale...). */
  extra: Omit<ProgressionSave, 'expeditions' | 'trip' | 'records' | 'cache' | 'hintsShown'> = strip(defaultProgression());

  home: HomeField | null = null;
  reach: ReachSet | null = null;
  private cacheField: HomeField | null = null;
  private fieldsDirty = true;
  private fieldsScheduled = false;
  private minedSinceField = 0;
  private cacheFieldFor: CacheState | null = null;
  /** Rides (world/gen/features, via game/WorldFeatures): extra edges of every walking field. */
  private rides: Array<{ from: readonly [number, number, number]; to: readonly [number, number, number]; cost: number }> = [];

  /** Last cell the explorer stood on safely (grounded >= CACHE.groundedSeconds, on the reach set). */
  private readonly spot = new CacheSpot();
  /** A long fall into a pit (no walk home): the explorer climbs back to `spot` (gameplay/CacheSpot). */
  private readonly pit = new PitWatch();
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

  // The compass target (a rumour) and the field that walks to it.
  private targetField: HomeField | null = null;
  private targetFieldFor: string | null = null;
  private targetCell: [number, number, number] | null = null;
  private readonly targetAim = new THREE.Vector3();
  private targetAimSet = false;
  private targetBearing = 0;
  private targetDistance: number | null = null;
  private rumourCache: Rumour[] | null = null;
  private rumourTimer = 0;
  /** The last breath of the deep (world:regrow), for the report's Overnight section. */
  private lastBreath: { epoch: number; cells: number; regrown: number } | null = null;
  /** Where openCrafting / openJournal want the screen to start. */
  private treeFocus: { place: Place; select: NodeId | null } = { place: 'workbench', select: null };
  private journalFocus: JournalTab = 'discoveries';

  // Content (finished game): feats waiting for their toast, the feat check's timer, the walk meter.
  private readonly featQueue: string[] = [];
  private featTimer = 0;
  private featToastTimer = 0;
  private walkFrom: [number, number] | null = null;
  private secretsTotalV = -1;
  private lastYaw: number | null = null;
  private readonly stuck = new StuckWatch();
  private tripStart = { feats: 0, caches: 0, secrets: 0 };
  /** The first feat check after a load catches up quietly (a save from before the feats existed). */
  private featsCatchUp = true;

  constructor(private readonly game: Game) {
    this.stations = new Stations(game);
    this.runes = new Runes(game);
    this.events = new EventDirector(game);
  }

  /** WORLD (round 2): the events director (game/events): something happens every 2–4 minutes of exploration. */
  readonly events: EventDirector;
  private readonly eventCtx: EventContext = { x: 0, y: 0, z: 0, inCamp: true, busy: false, lit: true, depth: 0 };

  /** Listen to the world (called once the bus exists, at boot). */
  wire(): void {
    const bus = this.game.bus;
    bus.on('world:regrow', (e) => {
      this.lastBreath = { epoch: e.epoch, cells: e.cells, regrown: e.regrown };
      this.rumoursChanged();
    });
    bus.on('world:bloom', () => this.rumoursChanged());
    bus.on('prop:broken', (e) => {
      if (e.propId.startsWith('bloom_e')) this.rumoursChanged();
    });
    bus.on('world:monolith', () => this.runes.onStoneTouched());
    // Content (finished game): lanternstone feeds the lantern; lifetime counters and firsts for the feats.
    bus.on('block:broken', (e) => this.onBroken(e.block, e.x, e.y, e.z));
    bus.on('item:picked', (e) => this.first(e.item));
    bus.on('items:banked', (e) => {
      this.extra.life.itemsBanked += Math.max(0, e.total | 0);
    });
    bus.on('cache:recovered', () => this.first('recovered'));
    // WORLD (round 2): a black-out ends any world event (and its passing lights).
    bus.on('player:died', () => this.events.reset());
  }

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
    this.resetTarget();
    this.lastBreath = null;
  }

  fromSave(p: ProgressionSave): void {
    this.records = new Records({ ...p.records, expeditions: Math.max(p.records.expeditions, p.expeditions) }, p.trip);
    this.setCache(p.cache ? { ...p.cache, items: { ...p.cache.items } } : null);
    this.cold.reset();
    this.hintsShown.clear();
    for (const h of p.hintsShown) this.hintsShown.add(h);
    this.extra = strip(p);
    // Drop unknown node ids (a save from a build with other nodes).
    this.extra.stations = this.extra.stations.filter((id) => isNodeId(id) && NODES[id].result.kind === 'station');
    this.extra.gear = this.extra.gear.filter((id) => isNodeId(id) && NODES[id].result.kind === 'gear');
    this.spot.reset();
    this.turnBackShown = false;
    this.coldHinted = false;
    this.nextTimer = 0;
    this.resetTarget();
    this.lastBreath = null;
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
    this.applyRides();
    this.fieldsDirty = true;
    this.recomputeFields();
    this.campAimSet = this.cacheAimSet = false;
    this.cachePropShown = false;
    this.syncCacheProp();
    // Runes found by builds before the shelf existed sit on it now; the shelf stands with the first.
    for (const id of this.runes.found()) if (!this.extra.relics.includes(id)) this.extra.relics.push(id);
    if (this.runes.count > 0 && !this.extra.stations.includes('relicShelf')) this.extra.stations.push('relicShelf');
    this.stations.attach(this.built);
    this.runes.attach();
    this.events.reset();
    this.applyGear();
    this.rumoursChanged();
    this.featsCatchUp = true;
    this.featQueue.length = 0;
    this.secretsTotalV = -1;
    this.markTripStart();
    // A save made down a pit (paused or quit before the climb back): look again once loaded.
    if (atCamp) this.pit.disarm();
    else this.pit.arm();
    if (!atCamp && !this.records.trip) this.startTrip();
    // A save written at camp with the trip still open (by builds before the camp-save fix) would
    // merge it into the next trip: close it quietly, as returned.
    else if (atCamp && this.records.trip) this.endTrip('returned', { banked: {} }, false);
  }

  // ------------------------------------------------------------------------------------
  // Loop seams (called by Game)

  onCampLeft(): void {
    this.startTrip();
    this.scheduleFields();
  }

  /**
   * Camp entry, after banking: the trip ends as 'returned'. Not announced here: Game saves first,
   * then calls announceEnded(), so the camp save already holds the closed trip.
   */
  onCampEntered(banked: ItemCounts): ExpeditionReport | null {
    this.cold.reset();
    // The deep breathes after a trip into the Hollow (game/WorldFeatures), before the camp save.
    const day0 = this.day;
    this.lastBreath = null;
    this.game.features?.onCampEntered(this.records.trip?.deepest ?? 0);
    const report = this.endTrip('returned', { banked }, false);
    if (report) this.decorate(report, this.day !== day0);
    return report;
  }

  /** The expedition counter the living rock and the bloom follow (SaveData.progression.day). */
  get day(): number {
    return this.extra.day;
  }

  set day(n: number) {
    this.extra.day = Number.isFinite(n) ? Math.max(0, Math.min(1e6, Math.floor(n))) : 0;
  }

  /**
   * The rides as extra edges of the walk-home, cache and reach fields (`cost` in field steps). The
   * fields are recomputed between frames.
   */
  setRides(edges: ReadonlyArray<{ from: readonly [number, number, number]; to: readonly [number, number, number]; cost: number }>): void {
    this.rides = edges.map((e) => ({ from: [...e.from] as [number, number, number], to: [...e.to] as [number, number, number], cost: e.cost }));
    this.applyRides();
    this.scheduleFields();
  }

  /** The walkable world changed (a door opened, rock grew back): recompute the fields between frames. */
  fieldsChanged(): void {
    this.scheduleFields();
  }

  /** Emit 'expedition:ended' for a trip ended without announcing it (see onCampEntered). */
  announceEnded(report: ExpeditionReport): void {
    this.game.bus.emit('expedition:ended', { report });
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
    this.markFound(id);
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
    this.liftFromPit(dt, atCamp);
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
    this.updateTarget();
    // WORLD (round 2): the world events.
    const ec = this.eventCtx;
    ec.x = p.x;
    ec.y = p.y;
    ec.z = p.z;
    ec.inCamp = atCamp;
    ec.busy = g.ui.isBlockingInput() || g.features.riding;
    ec.lit = lantern.lit;
    ec.depth = WORLD.depthOffset - p.y;
    this.events.update(dt, ec);
    if (g.health.dead) return true;
    this.stations.update(dt);
    this.runes.update(dt);

    const walked = this.updateWalk();
    this.updateTutorial(dt, walked);
    this.updateFeats(dt);

    this.rumourTimer -= dt;
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
    // A rumour picked on the Survey Table leads the way out while the lantern has fuel to spare;
    // past the turn-back mark (and at camp) the needle points home again.
    const seam = this.targetActive && !atCamp && this.fuelStateV === 'ok' && this.targetDistance !== null;
    compass.kind = seam ? 'seam' : 'camp';
    compass.bearing = seam ? this.targetBearing : this.campBearing;
    compass.distance = seam ? (this.targetDistance as number) : this.campDistance;
    out.compass = compass;
    // campBearing / campDistance stay on camp: today's HUD labels its needle "Camp" (it shows the
    // seam once it reads compass.kind; the Next line carries the target's walk meanwhile).
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
    this.rumourCache = null;
    this.computeTargetField();
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
      case 'feature':
        return this.game.features.label(spec);
      case 'station':
        return this.stations.label(spec);
      case 'rune':
        return this.runes.label();
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
      case 'feature':
        g.features.interact(spec);
        break;
      case 'station':
        this.stations.interact(spec);
        break;
      case 'rune':
        this.runes.take(spec);
        break;
    }
  }

  // ------------------------------------------------------------------------------------
  // Content (finished game): Halden caches and secrets, lanternstone, feats, lifetime counters

  /** This cache, crate or coffer has been opened (it stays as scenery). */
  looted(id: string): boolean {
    return this.extra.looted.includes(id);
  }

  /** Open a cache: its loot flies to the pack (what does not fit waits on the floor). */
  openCache(spec: PropSpec): void {
    const g = this.game;
    if (this.looted(spec.id)) {
      g.ui.hint(t('toast.cacheEmpty'), 2200);
      return;
    }
    const loot = spec.loot && Object.keys(spec.loot).length ? spec.loot : { stone: 2 };
    // Open it only when everything inside fits the pack (nothing is left to fade on the floor).
    const sim = new Backpack(g.backpack.slotCount, g.backpack.pouchSlots);
    g.backpack.slots.forEach((sl) => sl && sim.add(sl.item, sl.count));
    for (const [item, n] of Object.entries(loot) as Array<[ItemId, number]>) {
      if (n > 0 && sim.add(item, n) < n) {
        g.ui.hint(t('toast.cacheFull'), 2800);
        return;
      }
    }
    this.extra.looted.push(spec.id);
    for (const [item, n] of Object.entries(loot) as Array<[ItemId, number]>) {
      if (n > 0) g.drops.spawn(item, n, spec.x, spec.y + 0.7, spec.z, g.rng);
    }
    const life = this.extra.life;
    life.caches++;
    g.particles.sparkle(spec.x, spec.y + 0.6, spec.z, 0xffd9a0, 10, g.rng, 1.4);
    if (spec.secret) {
      life.secrets++;
      g.ui.toast(t('toast.secret', { found: this.secretsFound, total: this.secretsTotal }), 'good');
    } else g.ui.toast(t('toast.cacheLoot', { items: rewardText(loot, (i) => t(ITEMS[i].name)) }), 'good');
    g.clearFocus();
    this.featTimer = 0;
  }

  /** Secret alcoves opened in this world. The lifetime count also keeps those of an older world (save/saveData shiftWorldIfNeeded). */
  get secretsFound(): number {
    return this.game.session.layout.props.filter((p) => p.secret && this.looted(p.id)).length;
  }

  /** Secret alcoves in this world (props with a secret tag). */
  get secretsTotal(): number {
    if (this.secretsTotalV < 0) this.secretsTotalV = this.game.session.layout.props.filter((p) => p.secret).length;
    return this.secretsTotalV;
  }

  private onBroken(block: number, x: number, y: number, z: number): void {
    const life = this.extra.life;
    life.blocksMined++;
    if (block === B.COPPER_ORE || block === B.IRON_ORE || block === B.CRYSTAL || block === B.ECHO_CRYSTAL || block === B.LANTERNSTONE) life.oreMined++;
    if (block === B.COPPER_ORE) this.first('copperOre');
    else if (block === B.IRON_ORE) this.first('ironOre');
    if (block === B.LANTERNSTONE) this.ember(x, y, z);
  }

  /** Lanternstone broke: its ember leaps into the lantern (+CONTENT.emberSeconds, up to full). */
  private ember(x: number, y: number, z: number): void {
    const g = this.game;
    const added = g.lanternFuel.add(CONTENT.emberSeconds);
    this.extra.life.embers++;
    g.particles.sparkle(x + 0.5, y + 0.5, z + 0.5, 0xffc76f, 12, g.rng, 1.8);
    if (added > 0) g.bus.emit('lantern:refueled', {});
    g.ui.toast(added >= CONTENT.emberSeconds - 0.5 ? t('toast.ember', { s: Math.round(added) }) : t('toast.emberFull'), 'good');
    if (!g.journal.hasDiscovery('lanternstone')) g.discover('lanternstone');
    this.invalidateNext();
  }

  /** Record a first (an item picked, an ore mined, a pack recovered) for the feats. */
  private first(id: string): void {
    const f = this.extra.life.firsts;
    if (f.includes(id)) return;
    f.push(id);
    this.featTimer = 0;
  }

  /** Metres walked on foot this frame (rides and teleports are not walking). */
  private updateWalk(): number {
    const p = this.game.player;
    const riding = this.game.features?.riding ?? false;
    if (riding || !p.grounded) {
      if (riding) this.walkFrom = null;
      return 0;
    }
    let walked = 0;
    if (this.walkFrom) {
      const d = Math.hypot(p.x - this.walkFrom[0], p.z - this.walkFrom[1]);
      if (d < 0.25) return 0;
      // A teleport is not walking; a slow frame's long step is.
      if (d < 8) {
        walked = d;
        this.extra.life.walked += d;
      }
    }
    this.walkFrom = [p.x, p.z];
    return walked;
  }

  /**
   * The tutorial taught by doing (gameplay/Objectives: look round, then walk), the hints for when
   * the objective line has not moved for a while (gameplay/Hints), and the lanternstone hint the
   * first time the flame runs tight down in the deep.
   */
  private updateTutorial(dt: number, walked: number): void {
    const g = this.game;
    const yaw = g.cameraRig.yaw;
    let turned = 0;
    if (this.lastYaw !== null) {
      const d = Math.abs(Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)));
      // A snap (a respawn, a ride's end) is not looking round; a fast drag on a slow frame is.
      if (d < 2.5) turned = (d * 180) / Math.PI;
    }
    this.lastYaw = yaw;
    const o = g.objectives;
    let moved = o.setTotals({ touch: g.isTouch() });
    if (turned > 0 || walked > 0) moved = o.noteControls(turned, walked) || moved;
    if (moved) {
      g.bus.emit('objective:changed', { id: o.current().id });
      this.invalidateNext();
    }
    if (g.inCamp && this.next.id !== 'look' && this.next.id !== 'walk' && this.next.id !== 'craftPickaxe' && !this.next.id.startsWith('craft:')) this.stuck.reset();
    else {
      const node = this.next.id.startsWith('craft:') ? closestNode(this.craftContext()) : null;
      const key = this.stuck.update(dt, this.next.id, this.next.text, node?.short?.[0] ?? null);
      if (key) g.ui.hint(t(key), 6500);
    }
    if (this.fuelStateV === 'tight' && !this.hintsShown.has('lanternstone') && g.player.y < 45) {
      this.hintsShown.add('lanternstone');
      g.ui.hint(t('hint.lanternstone'), 6000);
    }
  }

  /** What the feats read right now. */
  featSnapshot(): FeatSnapshot {
    const g = this.game;
    const r = this.records.records;
    let treeBuilt = 0;
    const built = this.built;
    // A repeatable craft (Flash Charges) is never owned, so it is not part of "every upgrade".
    const owned = Object.values(NODES).filter((n) => !n.repeat);
    for (const n of owned) {
      const res = n.result;
      if (res.kind === 'equip' ? g.equipment.tiers[res.slot] >= res.tier : built.has(n.id)) treeBuilt++;
    }
    return {
      life: this.extra.life,
      deepest: r.deepest,
      expeditions: Math.max(0, r.expeditions - r.blackouts),
      biggestHaul: r.biggestHaul,
      bestStreak: r.bestStreak,
      discoveries: new Set(g.journal.discoveries),
      keyItems: new Set(g.journal.keyItems),
      runes: this.runes.count,
      runesTotal: RUNES_TOTAL,
      relics: RELIC_ITEMS.filter((id) => g.journal.hasKeyItem(id)).length,
      relicsTotal: RELIC_ITEMS.length,
      discoveryIds: DISCOVERIES.map((d) => d.id),
      secretsFound: this.secretsFound,
      secretsTotal: this.secretsTotal,
      treeBuilt,
      treeTotal: owned.length,
      finale: this.extra.finale,
      recovered: this.extra.life.firsts.includes('recovered'),
    };
  }

  /** Check the feats once a second; announce each new one with a calm toast, one at a time. */
  private updateFeats(dt: number): void {
    const g = this.game;
    this.featTimer -= dt;
    this.featToastTimer -= dt;
    if (this.featTimer <= 0) {
      this.featTimer = 1;
      const earned = new Set(this.extra.feats);
      const fresh = newFeats(earned, this.featSnapshot());
      const quiet = this.featsCatchUp && fresh.length > 2;
      this.featsCatchUp = false;
      for (const f of fresh) {
        this.extra.feats.push(f.id);
        for (const [item, n] of Object.entries(f.reward) as Array<[ItemId, number]>) if (n > 0) g.storage.add(item, n);
        if (!quiet) this.featQueue.push(f.id);
      }
      if (quiet) g.ui.toast(t('toast.featsCaughtUp', { n: fresh.length }), 'good');
    }
    if (this.featQueue.length && this.featToastTimer <= 0) {
      const id = this.featQueue.shift() as string;
      const f = featDef(id);
      const name = t(`feat.${id}.name` as never);
      const reward = f ? rewardText(f.reward, (i) => t(ITEMS[i].name)) : '';
      g.ui.toast(reward ? t('toast.featReward', { name, reward }) : t('toast.feat', { name }), 'good');
      g.bus.emit('feat:earned', { id });
      this.featToastTimer = CONTENT.featToastGap;
      this.invalidateNext();
    }
  }

  /** The Journal's Feats page (requested from the screens: a 'feats' tab). */
  featsView(): FeatsView {
    const r = this.records.records;
    return buildFeatsView(new Set(this.extra.feats), this.extra.life, { expeditions: r.expeditions, deepest: r.deepest, blackouts: r.blackouts }, (i) => t(ITEMS[i].name));
  }

  // ------------------------------------------------------------------------------------
  // Internals

  private startTrip(): void {
    const g = this.game;
    if (this.records.trip) return;
    const n = this.records.start(g.playTime, WORLD.depthOffset - g.player.y);
    this.markTripStart();
    this.turnBackShown = false;
    this.coldHinted = false;
    g.bus.emit('expedition:started', { n });
  }

  private endTrip(outcome: TripOutcome, extra: { banked?: ItemCounts; cached?: ItemCounts | null; cacheDepth?: number | null; lostCount?: number }, announce = true): ExpeditionReport | null {
    const g = this.game;
    const report = this.records.end({ outcome, now: g.playTime, fuelLeft: g.lanternFuel.fuel, ...extra });
    this.turnBackShown = false;
    if (report && outcome !== 'returned') this.decorate(report, false);
    if (report && announce) g.bus.emit('expedition:ended', { report });
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

  /** Game.onLanded: a survivable landing from higher than a walk drops (HOME.maxDrop). */
  onLongFall(): void {
    this.pit.arm();
    // Blocks mined since the fields were computed (a seal, a cracked wall) may have joined the floor
    // below to a walk home the field does not know yet: the watch waits for the recompute.
    if (this.minedSinceField > 0) this.scheduleFields();
  }

  /** After a long fall into a pit, climb back to the last safe cell instead of being stranded. */
  private liftFromPit(dt: number, atCamp: boolean): void {
    const g = this.game;
    const p = g.player;
    if (atCamp) return this.pit.disarm();
    const h = this.home;
    const fresh = !!h && !this.fieldsDirty && !this.fieldsScheduled && !g.features.riding;
    if (!this.pit.update(dt, p.grounded, !!h && h.cellNear(p.x, p.y, p.z) >= 0, fresh)) return;
    // The last safe cell (the brink the fall began at), else the nearest one with a walk home.
    const c = this.spot.cell ?? this.spot.place(p.x, p.y, p.z, this.spotFields, 16);
    if (!c) return;
    p.teleport(c[0] + 0.5, c[1], c[2] + 0.5);
    g.cameraRig.snapTo(p.x, p.y + EYE_HEIGHT, p.z);
    g.ui.toast(t('toast.climbedBack'), 'warn');
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
      props.add({ id: CACHE_PROP_ID, kind: 'satchel', x: c.x, y: c.y, z: c.z, rotY: 0.6, scale: 1, anchor: null, emitters: [], seed: 7 });
      this.cachePropShown = true;
    }
    g.markHalosDirty();
  }

  private applyRides(): void {
    for (const f of [this.home, this.cacheField, this.targetField]) {
      if (!f) continue;
      f.clearEdges();
      for (const e of this.rides) f.addEdge(e.from, e.to, e.cost);
    }
    if (this.reach) {
      this.reach.clearEdges();
      for (const e of this.rides) this.reach.addEdge(e.from, e.to);
    }
  }

  private computeCacheField(): void {
    const c = this.cache;
    if (!c) return;
    const w = this.game.session.world;
    if (!this.cacheField) {
      this.cacheField = new HomeField(w);
      for (const e of this.rides) this.cacheField.addEdge(e.from, e.to, e.cost);
    }
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
    const ctx = this.craftContext();
    const node = closestNode(ctx);
    const targeted = this.extra.compassTarget !== null;
    const r = node && !targeted ? null : this.focusRumour();
    this.next = nextLine({
      targeted: targeted && r?.id === this.extra.compassTarget,
      cacheDistance: this.cache ? this.cacheDistance : null,
      chain: g.objectives.step(),
      node: node ? { id: node.id, short: node.short } : null,
      runes: this.runes.count,
      runesTotal: RUNES_TOTAL,
      finale: this.extra.finale,
      rumour: r ? { id: r.id, what: r.kind === 'bloom' ? t('rumour.bloom', { area: r.areaName }) : r.text.split(' — ')[0], distance: r.id === this.targetFieldFor && this.targetDistance !== null && !g.inCamp ? this.targetDistance : r.distance } : null,
      bestDepth: this.records.records.deepest,
      beyond: this.nextBeyond(),
    });
  }

  /** The next cavern beyond the rift to find, once the rift floor is reached (content). */
  private nextBeyond(): { id: 'glowroot' | 'choir' | 'emberDeep'; open: boolean } | null {
    const j = this.game.journal;
    if (!j.hasDiscovery('undercroft')) return null;
    const tier = this.game.equipment.tiers.pickaxe;
    if (!j.hasDiscovery('glowroot')) return { id: 'glowroot', open: true };
    if (!j.hasDiscovery('choir')) return { id: 'choir', open: tier >= 3 };
    if (!j.hasDiscovery('emberDeep')) return { id: 'emberDeep', open: tier >= 4 };
    return null;
  }

  // ------------------------------------------------------------------------------------
  // The upgrade tree (final pass W3)

  /** Stations and gear built (node ids). */
  get built(): ReadonlySet<string> {
    return new Set([...this.extra.stations, ...this.extra.gear]);
  }

  hasGear(id: 'gripBoots' | 'minersCoat'): boolean {
    return this.extra.gear.includes(id);
  }

  /** The weapons built at the Forge (round 2): node ids among 'machete', 'sling', 'spear'. The pick is implied. */
  ownedWeapons(): WeaponId[] {
    return WEAPON_NODES.filter((id) => this.extra.gear.includes(id));
  }

  /** The weapon a tap on a monster `distance` m away uses (config/weapons bestWeapon). */
  bestWeapon(distance = 0): Weapon {
    return bestWeapon(this.ownedWeapons(), distance);
  }

  /** Flash Charges carried (pack) and banked (camp storage). */
  flashCharges(): { pack: number; storage: number } {
    return { pack: this.game.backpack.count('flashCharge'), storage: this.game.storage.count('flashCharge') };
  }

  /**
   * Use one Flash Charge from the pack (at camp, storage counts too). @returns false when there is
   * none. The burst itself (damage, scare) is MobSystem's: WEAPONS.flash.
   */
  useFlashCharge(): boolean {
    const g = this.game;
    if (g.backpack.count('flashCharge') > 0) g.backpack.remove('flashCharge', 1);
    else if (g.inCamp && g.storage.count('flashCharge') > 0) g.storage.remove('flashCharge', 1);
    else return false;
    g.bus.emit('inventory:changed', {});
    return true;
  }

  stationBuilt(id: StationId): boolean {
    return this.extra.stations.includes(id);
  }

  /** What the tree's rules read right now. */
  craftContext(): CraftContext {
    const g = this.game;
    return {
      backpack: g.backpack,
      storage: g.storage,
      equipment: g.equipment,
      built: this.built,
      atCamp: g.inCamp,
      rift: g.journal.hasDiscovery('undercroft'),
      rune: this.runes.count > 0,
    };
  }

  /**
   * Make node `id` (Game.craft calls this and shows the result). Equipment nodes upgrade a tier;
   * stations are recorded and rise on their plot; gear is recorded and worn at once.
   */
  craft(id: NodeId): CraftResult {
    const res = craftNode(id, this.craftContext());
    if (!res.ok) return res;
    const r = NODES[id].result;
    const rep = NODES[id].repeat;
    if (rep) {
      // WORLD (round 2): a repeatable craft (Flash Charges) puts its items in camp storage.
      this.game.storage.add(rep.item, rep.count);
      this.game.bus.emit('inventory:changed', {});
    } else if (r.kind === 'station') {
      if (!this.extra.stations.includes(id)) this.extra.stations.push(id);
      this.stations.build(r.station);
    } else if (r.kind === 'gear') {
      if (!this.extra.gear.includes(id)) this.extra.gear.push(id);
      this.applyGear();
    }
    this.invalidateNext();
    return res;
  }

  /** The backpack follows the pack tier (a debug grant of a pack node). */
  applyPack(): void {
    const g = this.game;
    const pack = packForTier(g.equipment.tiers.pack);
    g.backpack.resize(pack.slots, pack.pouch);
  }

  /** Wear the gear built: the Grip Boots' jump and safe drop, the Miner's Coat's health. */
  applyGear(): void {
    const g = this.game;
    const boots = this.hasGear('gripBoots');
    g.player.jumpVelocity = boots ? GEAR.gripBoots.jumpVelocity : PLAYER.jumpVelocity;
    g.player.safeFallSpeed = boots ? GEAR.gripBoots.safeFallSpeed : PLAYER.safeFallSpeed;
    const max = Health.maxFor(this.extra.gear);
    if (g.health.max !== max) {
      // Keep the fraction of health: a coat put on at full health is a full 140.
      const frac = g.health.max > 0 ? g.health.current / g.health.max : 1;
      g.health = new Health(max, Math.round(max * frac));
    }
  }

  /** The tree for the crafting screen. */
  treeView(): CraftTreeView {
    const ctx = this.craftContext();
    const node = closestNode(ctx);
    return buildTreeView(ctx, { focus: this.treeFocus.place, select: this.treeFocus.select, next: node?.id ?? null });
  }

  /** Where the tree screen opens next (openCrafting(place) / a stake sign). */
  focusTree(place: Place = 'workbench', select: NodeId | null = null): void {
    this.treeFocus = { place, select };
  }

  focusJournal(tab: JournalTab = 'discoveries'): void {
    this.journalFocus = tab;
  }

  // ------------------------------------------------------------------------------------
  // Runes, the shelf, the finale

  get finale(): boolean {
    return this.extra.finale;
  }

  set finale(v: boolean) {
    this.extra.finale = v;
  }

  /** The Relic Shelf's lit sockets (bit i = glyph i). */
  get runeMask(): number {
    return this.runes.mask;
  }

  relicPlaced(item: string): boolean {
    return this.extra.relics.includes(item);
  }

  placeRelic(item: string): void {
    if (!this.extra.relics.includes(item)) this.extra.relics.push(item);
  }

  /** Remember when something was found (the Journal shows the expedition and the depth). */
  markFound(id: string): void {
    if (this.extra.foundAt[id]) return;
    const p = this.game.player;
    const n = this.records.trip?.n ?? Math.max(1, this.records.records.expeditions);
    this.extra.foundAt[id] = [n, Math.max(0, Math.round(WORLD.depthOffset - p.y))];
  }

  /** The Relic Shelf comes with the first rune. @returns true when it was raised just now. */
  ensureShelf(): boolean {
    if (this.extra.stations.includes('relicShelf')) return false;
    this.extra.stations.push('relicShelf');
    this.stations.build('relicShelf');
    return true;
  }

  syncShelf(): void {
    this.stations.setShelfMask(this.runes.mask);
  }

  journalView(): JournalView & { feats: FeatsView } {
    const g = this.game;
    const r = this.records.records;
    // The Feats page rides along (content): the screens read view.feats for a Feats tab.
    const view = buildJournalView({
      discoveries: g.journal.discoveries,
      keyItems: g.journal.keyItems,
      foundAt: this.extra.foundAt,
      finale: this.extra.finale,
      expeditions: r.expeditions,
      deepest: r.deepest,
      playTime: g.playTime,
      focus: this.journalFocus,
    });
    return Object.assign(view, { feats: this.featsView() });
  }

  // ------------------------------------------------------------------------------------
  // The Survey Table: rumours and the compass target

  /** Rumours as they stand (cached; rebuilt when the deep breathes or the fields change). */
  rumours(): Rumour[] {
    if (!this.rumourCache || this.rumourTimer <= 0) {
      this.rumourTimer = 2;
      this.rumourCache = buildRumours(this.game.features?.sites() ?? [], this.home, this.extra.compassTarget);
    }
    return this.rumourCache;
  }

  surveyView(): SurveyView {
    return {
      records: { ...this.records.records },
      day: this.day,
      rumours: this.rumours().map((r) => ({ ...r, ore: r.ore.map((o) => ({ ...o })) })),
      target: this.extra.compassTarget,
      built: this.stationBuilt('surveyTable'),
    };
  }

  get compassTarget(): string | null {
    return this.extra.compassTarget;
  }

  /** Point the compass at a rumour's site (its id), or home (null). Unknown ids point home. */
  setCompassTarget(id: string | null): void {
    const r = id ? this.rumours().find((x) => x.id === id && x.present) : null;
    const next = r ? r.id : null;
    if (next === this.extra.compassTarget) return;
    this.extra.compassTarget = next;
    this.rumoursChanged();
    this.computeTargetField();
    this.game.ui.toast(r ? t('toast.targetSet', { area: r.areaName }) : t('toast.targetCleared'), 'info');
  }

  private get targetActive(): boolean {
    return this.extra.compassTarget !== null && this.targetFieldFor === this.extra.compassTarget;
  }

  private focusRumour(): Rumour | null {
    return focusRumour(this.rumours(), this.extra.compassTarget);
  }

  private rumoursChanged(): void {
    this.rumourCache = null;
    this.invalidateNext();
  }

  private resetTarget(): void {
    this.targetFieldFor = null;
    this.targetCell = null;
    this.targetDistance = null;
    this.targetAimSet = false;
    this.rumourCache = null;
  }

  /** The walk to the rumour the Next line offers (the compass target first). */
  private computeTargetField(): void {
    const home = this.home;
    const r = home ? this.focusRumour() : null;
    const site = r ? (this.game.features?.sites() ?? []).find((s) => s.id === r.id) : null;
    const cell = home && site ? siteCell(home, site.x, site.y, site.z) : null;
    if (!cell) {
      this.resetTarget();
      return;
    }
    if (!this.targetField) {
      this.targetField = new HomeField(this.game.session.world);
      for (const e of this.rides) this.targetField.addEdge(e.from, e.to, e.cost);
    }
    this.targetField.computeToCell(cell[0], cell[1], cell[2]);
    this.targetFieldFor = r!.id;
    this.targetCell = cell;
    this.targetAimSet = false;
  }

  /** Follow the target field like the cache's; clear the target once reached (or gone). */
  private updateTarget(): void {
    const g = this.game;
    const tf = this.targetField;
    const id = this.targetFieldFor;
    if (!tf || !id || !this.targetCell) {
      this.targetDistance = null;
      return;
    }
    const p = g.player;
    const c = tf.cellNear(p.x, p.y, p.z);
    if (c >= 0) {
      this.targetDistance = tf.dist[c];
      const [tx, ty, tz] = tf.cellXYZ(tf.descend(c, HOME.lookAheadSteps));
      aimAt(this.targetAim, tx + 0.5, ty, tz + 0.5, 1 / 60, !this.targetAimSet);
      this.targetAimSet = true;
      this.targetBearing = Guidance.bearing(g.cameraRig.yaw, p.x, p.z, this.targetAim.x, this.targetAim.z);
    } else {
      const [x, y, z] = this.targetCell;
      this.targetDistance = Math.round(Math.hypot(x + 0.5 - p.x, y - p.y, z + 0.5 - p.z));
      this.targetAimSet = false;
      this.targetBearing = Guidance.bearing(g.cameraRig.yaw, p.x, p.z, x + 0.5, z + 0.5);
    }
    if (id === this.extra.compassTarget && this.targetDistance !== null && this.targetDistance <= TARGET_REACHED_STEPS && !g.inCamp) {
      const r = this.rumours().find((x) => x.id === id);
      this.extra.compassTarget = null;
      g.ui.toast(t('toast.targetReached', { area: r ? r.areaName : areaNameOf('hall') }), 'good');
      this.rumoursChanged();
    }
  }

  // ------------------------------------------------------------------------------------
  // The Expedition Report's Next card, CTA and Overnight section

  private decorate(report: ExpeditionReport, breathed: boolean): void {
    const ctx = this.craftContext();
    const node = closestNode(ctx);
    if (node) {
      const def = NODES[node.id];
      const have = availableCounts(ctx);
      report.next = {
        id: def.id,
        name: t(def.name),
        cost: Object.entries(def.inputs).filter(([, n]) => (n ?? 0) > 0).map(([item, need]) => ({ item: item as ItemId, have: have[item as ItemId] ?? 0, need: need as number })),
        ready: node.short === null,
      };
    } else report.next = null;
    report.craftableNow = anyCraftable({ ...ctx, atCamp: true });
    report.overnight = breathed ? this.overnight() : null;
    // Content: what this trip found besides ore (the report's feats and finds lines).
    const life = this.extra.life;
    report.feats = this.extra.feats.slice(this.tripStart.feats).map((id) => t(`feat.${id}.name` as never));
    report.caches = life.caches - this.tripStart.caches;
    report.secrets = life.secrets - this.tripStart.secrets;
    this.markTripStart();
  }

  /** Where the trip's counters began (the report's feats and finds lines count from here). */
  private markTripStart(): void {
    this.tripStart = { feats: this.extra.feats.length, caches: this.extra.life.caches, secrets: this.extra.life.secrets };
  }

  private overnight(): ReportOvernight {
    const b = this.lastBreath;
    // The bloom grows a frame after the breath: count it as present (its id is new tonight).
    const sites = (this.game.features?.sites() ?? []).map((s) => (s.kind === 'bloom' ? { ...s, present: true } : s));
    const rumours = buildRumours(sites, this.home, this.extra.compassTarget);
    return {
      day: this.day,
      cells: b?.cells ?? 0,
      regrown: b?.regrown ?? 0,
      rumours: rumours.map((r) => ({ id: r.id, kind: r.kind, area: r.area, text: r.text, distance: r.distance })),
    };
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
    finale: d.progression.finale,
  };
}

function strip(p: ProgressionSave): Omit<ProgressionSave, 'expeditions' | 'trip' | 'records' | 'cache' | 'hintsShown'> {
  const { expeditions: _e, trip: _t, records: _r, cache: _c, hintsShown: _h, ...rest } = p;
  const foundAt: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(rest.foundAt ?? {})) foundAt[k] = [v[0], v[1]];
  return {
    ...rest,
    stations: [...rest.stations],
    gear: [...rest.gear],
    relics: [...rest.relics],
    seams: [...rest.seams],
    minedDay: [...rest.minedDay],
    foundAt,
    looted: [...(rest.looted ?? [])],
    feats: [...(rest.feats ?? [])],
    life: { ...(rest.life ?? NO_LIFE), firsts: [...(rest.life?.firsts ?? [])] },
  };
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
