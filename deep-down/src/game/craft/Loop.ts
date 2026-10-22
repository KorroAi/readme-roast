import { packForTier, lanternForTier, PLAYER } from '../../config/balance';
import { ARMOUR_CAP, ARMOUR_SETS, armourPiece } from '../../config/armour';
import { CATALOGUE, INVENTORY_CATEGORIES, ITEMS, isItem, type BiomeKey, type EquipSlot, type HazardKind, type InventoryCategory, type ItemId } from '../../config/items';
import { RECIPES, RECIPE_CATEGORIES, recipeInputs, type Recipe } from '../../config/recipes';
import { OUTPOST, STATIONS, STATION_IDS, stationOfItem, type StationId } from '../../config/stations';
import { WEAPONS, bestWeapon, type Weapon, type WeaponId } from '../../config/weapons';
import { BIOMES, allOres, type BiomeId } from '../../config/biomes';
import { B, BLOCKS, SOLID, blockDef } from '../../config/blocks';
import { NEXT_PICK, PAGE_COUNT, type Reward } from '../../config/quests';
import { BONUS_DROPS } from '../../config/loot';
import { Rng } from '../../core/rng';
import { Hazards, type Element, type HazardProbe, type WorldHazard } from '../../gameplay/Hazards';
import { Quests, type Advice, type QuestWorld } from '../quests/Quests';
import { Guide } from '../quests/Guide';
import type { LoopHud } from '../quests/types';
import type { StratumLayout } from '../../world/gen/strata/types';
import type { EventBus, GameEvents } from '../../core/events';
import { formatNumber, t, type TextKey } from '../../i18n';
import { Gear, EQUIP_SLOTS, type GearSave } from '../../gameplay/Gear';
import type { Backpack } from '../../gameplay/Inventory';
import type { CampStorage } from '../../gameplay/Storage';
import type { Equipment } from '../../gameplay/Equipment';
import type { Health } from '../../gameplay/Health';
import type { Lantern } from '../../gameplay/Lantern';
import type { HudSlot } from '../../ui/types';
import type { UiTargetId } from '../../ui/hud/actions';
import { Craft, costLine, isUnlocked, sourceOf } from './CraftSystem';
import { Builder, type BuilderSession, type BuiltThing } from './Builder';
import { Camp, type CampCtx } from './Camp';
import { CAMP_UPGRADES, type CampUpgradeId } from '../../config/camp';
import { Hotbar, HOTBAR_SIZE, type HotbarSave } from './Hotbar';
import { Sockets, gemLine, isGem, socketsOf, type SocketTotals } from './Sockets';
import { Trip, type TripEnd, type TripSummary } from '../quests/Trip';
import { DAILY_EFFECT, daily, dayOf, goalMet, type DailyDef, type DailyRun, type DailySave } from '../quests/Daily';
import type { CraftContext, CraftOutcome, HotbarView, ItemStore, LoopActions, PlaceRequest, CraftMenuView, BagView, RecipeCardView, BagItemView } from './types';

/** What Loop reads from the game (Game satisfies it structurally). */
export interface LoopHost {
  readonly bus: EventBus<GameEvents>;
  backpack: Backpack;
  storage: CampStorage;
  equipment: Equipment;
  health: Health;
  lanternFuel: Lantern;
  readonly inCamp: boolean;
  readonly player: { x: number; y: number; z: number };
  /** WORLD's StratumManager (absent on the old hand-made world). */
  readonly strata?: StrataLike | null;
  /** The voxels (the hazard probes: torch warmth, lava heat) and the props (placed stations and outposts). */
  readonly session?: (BuilderSession & { world: { get(x: number, y: number, z: number): number } }) | null;
  markHalosDirty?(): void;
  /** The drops in the world (game/Drops): bonus drops of mined blocks fly out of the rock with the main one. */
  readonly drops?: { spawn(item: ItemId, count: number, x: number, y: number, z: number, rng: Rng): void } | null;
  /**
   * MOBS' creatures, for the Lampling companion (read by shape; each part optional):
   * `lureLampling` tames the nearest wild Lampling within `radius` (true when one came),
   * `hasCompanion` tells whether a tame one follows the explorer.
   */
  readonly mobs?: object | null;
}

/** The parts of MOBS' director the companion items use (all optional, read by shape). */
interface CompanionHooks {
  /** Tame the nearest wild Lampling within `radius` (true: one came). */
  lureLampling?(x: number, y: number, z: number, radius: number): boolean;
  hasCompanion?(): boolean;
  /** Feed the tame Lampling: `xp` experience and `heal` health (true: eaten). */
  feedCompanion?(xp: number, heal: number): boolean;
  /** UI's chip view: null before one is tamed. */
  companion?(): unknown;
  /** Every creature about (MobDirector.list): the tutorial's fight step points the compass at the nearest monster. */
  list?(): ReadonlyArray<{ readonly position: { x: number; y: number; z: number }; readonly hostile: boolean; readonly state: string }>;
}

/** Metres within which the tutorial's fight step points the compass at a monster. */
const FOE_RANGE = 40;

/** Metres from a lair at which an unarmed explorer is reminded to make a weapon first. */
const ARM_NEAR = 30;

/** Is a Lampling following the explorer (MOBS' hasCompanion, else its chip view)? */
function companionFollows(m: CompanionHooks | null): boolean {
  if (!m) return false;
  if (typeof m.hasCompanion === 'function') return m.hasCompanion();
  return typeof m.companion === 'function' ? m.companion() !== null : false;
}

/** Metres within which the lure calls a wild Lampling. */
const LURE_RADIUS = 10;

/** The parts of WORLD's StratumManager the loop reads (game/Stratum). */
export interface StrataLike {
  readonly current: number;
  readonly deepest: number;
  readonly layout: StratumLayout | null;
  readonly biomeHere: BiomeId | null;
  isRevealed(lairId: string): boolean;
  gateOpen(): boolean;
  openGate(): boolean;
  /** Displayed depth (m) of a height in the loaded stratum. */
  depth?(y: number): number;
  descend(): Promise<boolean>;
  addOutpost?(id: string, x: number, y: number, z: number): unknown;
}

/** A station placed in the world (Place on a Furnace, Forge or Alchemy Table item). */
export interface PlacedStation {
  /** The prop's id (`station:<stratum>:<n>`). */
  id: string;
  station: StationId;
  stratum: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** An outpost (the Outpost Kit, placed). */
export interface Outpost {
  id: string;
  stratum: number;
  x: number;
  y: number;
  z: number;
  rotY?: number;
}

export interface LoopSave {
  v: 1;
  gear: GearSave;
  hotbar: HotbarSave;
  known: ItemId[];
  seenRecipes: string[];
  stations: PlacedStation[];
  outposts: Outpost[];
  /** Outpost id where the bedroll was last used (respawn), or null for the camp. */
  bed: string | null;
  stratum: number;
  deepest: number;
  wards: Partial<Record<HazardKind, number>>;
  counters: LoopCounters;
  seed: number;
  bestiaryFound: number;
  quests: unknown;
  camp?: unknown;
  sockets?: unknown;
  trips?: unknown;
  daily?: DailySave;
  tips: string[];
  /** Health at the save (the armour's extra max health is applied after the Health is rebuilt). */
  hp: number;
}

/** Lifetime counters the quests, orders and feats read. */
export interface LoopCounters {
  crafted: number;
  smelted: number;
  torches: number;
  placed: number;
  outposts: number;
  used: number;
  /** Round 3 stretch: camp levels built, barters made, gems set, daily goals reached. */
  upgrades: number;
  trades: number;
  gems: number;
  dailies: number;
  /** Creatures defeated (not the guardians). */
  kills: number;
}

const ZERO_COUNTERS: LoopCounters = { crafted: 0, smelted: 0, torches: 0, placed: 0, outposts: 0, used: 0, upgrades: 0, trades: 0, gems: 0, dailies: 0, kills: 0 };

const CAT_KEY: Record<string, TextKey> = {
  tools: 'craft3.cat.tools', weapons: 'craft3.cat.weapons', armour: 'craft3.cat.armour', lanterns: 'craft3.cat.lanterns',
  consumables: 'craft3.cat.consumables', building: 'craft3.cat.building', stations: 'craft3.cat.stations', smelting: 'craft3.cat.smelting',
  camp: 'craft3.cat.camp', trader: 'craft3.cat.trader',
};
const BAG_KEY: Record<InventoryCategory, TextKey> = {
  materials: 'bag3.cat.materials', gear: 'bag3.cat.gear', consumables: 'bag3.cat.consumables', building: 'bag3.cat.building', key: 'bag3.cat.key',
};
const SLOT_KEY: Record<EquipSlot, TextKey> = {
  pick: 'gear3.pick', weapon: 'gear3.weapon', lantern: 'gear3.lantern', pack: 'gear3.pack', head: 'gear3.head', chest: 'gear3.chest', feet: 'gear3.feet',
};

const dist2 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** The ore blocks of the strata (and the old world's copper and iron), for the tutorial's vein arrow. */
const ORE_BLOCK = new Uint8Array(256);
for (const o of allOres()) ORE_BLOCK[o.block & 255] = 1;
ORE_BLOCK[B.COPPER_ORE] = 1;
ORE_BLOCK[B.IRON_ORE] = 1;
/** How far the tutorial looks for a vein to point at (m), and how often (s). */
const VEIN_RANGE = 22;
const VEIN_EVERY = 1.5;

/** The line a hazard zone of WORLD's gets when the explorer walks into it (Loop.enterZone). */
const ZONE_LINE: Partial<Record<WorldHazard, TextKey>> = {
  falls: 'hazard.zone.falls',
  rockfall: 'hazard.zone.rockfall',
  chill: 'hazard.zone.chill',
  gas: 'hazard.zone.gas',
  lava: 'hazard.zone.lava',
};

/** Metres from the camp fire within which a station placed at the camp serves the whole camp. */
const CAMP_REACH = 16;
/** A burning flare's light and warmth reach (m). */
const FLARE_RADIUS = 8;

/**
 * The loop's hub (round 3, LOOP): the bag, the bank, gear, the hotbar, crafting, stations and
 * outposts, consumables. Game creates it (`game.loop`, a `// LOOP:` block) and the menus call its
 * LoopActions; quests, guidance and hazards hang off it (game/quests, gameplay/Hazards).
 */
export class Loop implements LoopActions {
  gear = new Gear();
  readonly hotbar: Hotbar;
  /** Items ever held: recipes with unlock 'seen' appear once their inputs are known. */
  readonly known = new Set<ItemId>();
  /** Recipes the player has seen in the menu (for the "new" pip). */
  readonly seenRecipes = new Set<string>();
  stations: PlacedStation[] = [];
  outposts: Outpost[] = [];
  bed: string | null = null;
  /** The stratum the explorer is in, and the deepest entered (1..6). */
  stratum = 1;
  deepest = 1;
  /** Seconds left on each hazard ward from a potion (antidote, warming tonic, cooling draught). */
  readonly wards: Partial<Record<HazardKind, number>> = {};
  counters: LoopCounters = { ...ZERO_COUNTERS };
  /** Extra max health from elsewhere (the bestiary's milestones), added by syncGear. */
  bonusHealth = 0;

  readonly quests: Quests;
  readonly guide: Guide;
  readonly hazards = new Hazards();
  /** Placed stations and outposts as props in the loaded stratum. */
  readonly builder: Builder;
  /** The camp's upgrades and the trader (round 3 stretch). */
  readonly camp = new Camp();
  /** Gems set in weapons and armour (round 3 stretch). */
  readonly sockets = new Sockets();
  private readonly socketOut: SocketTotals = { damage: 0, speed: 0, armour: 0, health: 0, wards: { cold: 0, gas: 0, heat: 0, dark: 0 } };
  /** The trip summary (round 3 stretch): counted from the camp to the camp. */
  readonly trip: Trip;
  private tripEnding: 'returned' | 'blackout' | null = null;
  private tripWhere: TripEnd = 'camp';
  /** The daily descent in progress (null: an ordinary expedition), and the best times per day. */
  dailyRun: DailyRun | null = null;
  dailyBest: Record<string, number> = {};
  private dailyT = 0;
  private shownLayout: unknown = null;
  private placedSeq = 0;
  /** The expedition seed (orders and loot), set by Game on a new game / load. */
  seed = 0x5eed;
  /** Bestiary pages found so far (from MOBS' 'mob:bestiary'). */
  bestiaryFound = 0;
  /** Falls hurt this much more in the biome (the hub multiplies its fall damage). */
  fallFactor = 1;
  private probeT = 0;
  private readonly probe: HazardProbe = {
    kind: 'none', strength: 0, zone: 0, inLava: false, nearWarmth: false, lit: true, inCamp: true, moving: false,
    wards: { cold: 0, gas: 0, heat: 0, dark: 0 }, potions: {}, health: 100,
  };
  private lastPos = { x: 0, y: 0, z: 0 };
  private qworld: QuestWorld | null = null;
  private clock = 0;
  private readonly hudOut: LoopHud;

  private readonly bagStore: ItemStore;
  private readonly bankStore: ItemStore;
  private readonly stationSet = new Set<StationId>();
  private unlockedCache = new Set<string>();

  constructor(private readonly host: LoopHost) {
    this.quests = new Quests({
      bus: host.bus,
      world: () => this.questWorld(),
      pay: (r, reason) => this.pay(r, reason),
      strata: () => this.host.strata ?? null,
      setBonusHealth: (n) => {
        this.bonusHealth = n;
        this.syncGear();
      },
      orderFactor: () => this.camp.orderFactor(),
      held: () => this.hotbar.held(),
      atCamp: () => this.host.inCamp,
      atMainCamp: () => this.atMainCamp(),
    });
    this.guide = new Guide(host.bus);
    this.builder = new Builder(host);
    this.trip = new Trip(host.bus);
    this.hotbar = new Hotbar({
      count: (item) => this.host.backpack.count(item),
      pick: () => this.gear.equipped.pick ?? 'rustyPick',
      weapon: () => this.gear.equipped.weapon,
    });
    this.bagStore = {
      count: (i) => this.host.backpack.count(i),
      add: (i, n) => this.host.backpack.add(i, n),
      remove: (i, n) => this.host.backpack.remove(i, n),
      room: (i) => this.host.backpack.room(i),
    };
    this.bankStore = {
      count: (i) => this.host.storage.count(i),
      add: (i, n) => this.host.storage.add(i, n),
      remove: (i, n) => this.host.storage.remove(i, n),
      room: (i) => this.host.storage.room(i),
    };
    this.hudOut = { main: { id: '', kind: 'main', title: '', text: '', progress: null, target: null, reward: null }, side: null, tutorial: null, compass: null, hazard: { kind: null, level: 0, warded: 0 } };
  }

  /** Listen to the bus (once, at boot). */
  wire(): void {
    const bus = this.host.bus;
    bus.on('item:picked', (e) => this.learn(e.item));
    bus.on('block:broken', (e) => this.bonusDrop(e.block, e.x, e.y, e.z));
    bus.on('mob:bestiary', (e) => {
      if (e.page === 'new') this.bestiaryFound = Math.max(this.bestiaryFound + 1, e.found);
    });
    bus.on('world:stratum', (e) => {
      this.enterStratum(e.stratum);
      this.showBuilt();
    });
    this.quests.wire();
    this.guide.wire();
    bus.on('player:placed', (e) => {
      this.counters.placed++;
      if (e.item === 'torch') this.counters.torches++;
    });
    // The hub builds a fresh Health on a respawn: the armour and the extra max health go back on.
    bus.on('player:respawned', () => {
      this.hazards.reset();
      this.syncGear(true);
    });
    // The trip summary: a trip runs from leaving the camp to coming back (or a black-out); it ends
    // on the next frame, so the orders paid and the bag banked on arrival count for it.
    this.trip.wire();
    bus.on('inventory:changed', () => {
      this.gearSweep = true;
    });
    bus.on('camp:left', () => {
      this.keptHere.clear();
      if (!this.trip.active) this.trip.start(this.clock, this.host.strata?.current ?? this.stratum, (this.host.strata?.biomeHere ?? null) as never);
    });
    bus.on('camp:entered', () => {
      // The stratum I camp, or a lower stratum's lift landing (its camp region: a ledger, a bench).
      if (this.trip.active) this.endTripAt('returned', this.atMainCamp() ? 'camp' : 'lift');
      if (this.atMainCamp()) this.arriveAtCamp();
    });
    bus.on('player:died', () => {
      // Where the explorer wakes: an outpost's bed in this stratum, else the camp or the lift.
      if (this.trip.active) this.endTripAt('blackout', this.respawnSpot() ? 'outpost' : (this.host.strata?.current ?? 1) > 1 ? 'lift' : 'camp');
    });
    bus.on('quest:shard', () => {
      if ((this.host.strata?.current ?? 1) === 1) this.showBuilt(true);
    });
    bus.on('mob:died', (e) => {
      if (e.rank !== 'guardian' && e.rank !== 'boss') this.counters.kills++;
    });
    // A creature's landed elemental blow feeds its hazard's meter (the biome's armour and potions ward it).
    bus.on('mob:attack', (e) => {
      if (e.landed && e.element && e.element !== 'none') this.elementalHit(e.element as Element);
    });
    // A thrown flare lands (the hub's throw emits 'weapon:flash' where it lands): its light keeps the dark back.
    bus.on('weapon:flash', (e) => {
      // UI's throw says what landed ('flash' | 'bomb' | 'flare'); an older build only the count of flares thrown.
      const kind = (e as { kind?: string }).kind;
      if (kind !== undefined ? kind !== 'flare' : this.flaresFlying <= 0) return;
      this.flaresFlying = Math.max(0, this.flaresFlying - 1);
      this.flareAt(e.x, e.y, e.z);
    });
  }

  /** Flares thrown and not landed yet (their 'weapon:flash' registers the light). */
  private flaresFlying = 0;
  /** The elements already explained once (a first-time line per element). */
  private readonly elementsSeen = new Set<string>();

  /** A landed elemental blow: the meter, a lingering burn, the void's thirst for oil (gameplay/Hazards ELEMENT_FX). */
  private elementalHit(element: Element): void {
    const r = this.hazards.hit(element, this.wardsNow(), this.wards);
    if (r.oil > 0) this.host.lanternFuel.drain(r.oil);
    if (!r.meter || this.elementsSeen.has(element)) return;
    this.elementsSeen.add(element);
    this.host.bus.emit('guide:hint', { id: `element:${element}`, text: t(`hazard.hit.${element}` as TextKey), target: null });
  }

  /** The hazard wards worn now (armour pieces and set, the lantern, the gems), 0..1 each. */
  private wardsNow(): Record<HazardKind, number> {
    const w = this.gear.wards();
    const sw = this.socketTotals().wards;
    const o = this.wardOut;
    o.cold = Math.min(1, w.cold + sw.cold);
    o.gas = Math.min(1, w.gas + sw.gas);
    o.heat = Math.min(1, w.heat + sw.heat);
    o.dark = Math.min(1, w.dark + sw.dark);
    return o;
  }
  private readonly wardOut: Record<HazardKind, number> = { cold: 0, gas: 0, heat: 0, dark: 0 };

  // ------------------------------------------------------------------------------------
  // State

  /** A fresh game. */
  reset(): void {
    this.gear = new Gear();
    this.hotbar.load(null);
    this.known.clear();
    this.seenRecipes.clear();
    this.unlockedCache.clear();
    this.stations = [];
    this.outposts = [];
    this.placedSeq = 0;
    this.bed = null;
    this.stratum = 1;
    this.deepest = 1;
    this.builder.sync([]);
    this.shownLayout = null;
    this.camp.reset();
    this.sockets.reset();
    this.tripEnding = null;
    this.dailyRun = null;
    for (const k of Object.keys(this.wards)) delete this.wards[k as HazardKind];
    this.counters = { ...ZERO_COUNTERS };
    this.bonusHealth = 0;
    this.bestiaryFound = 0;
    this.hazards.reset();
    this.guide.reset();
    for (const r of RECIPES) if (isUnlocked(r, this.unlockCtx())) this.unlockedCache.add(r.id);
    this.syncGear();
  }

  /** A new game: a fresh loop, the tutorial from its first step, the starter gift in the bag. */
  newGame(seed: number, tutorial = true, gift: Reward = {}): void {
    this.seed = seed >>> 0;
    this.dropRng = new Rng(this.seed ^ 0xb0b);
    this.reset();
    this.camp.restock(this.seed, 1);
    this.quests.reset(this.seed, tutorial);
    for (const id of Object.keys(this.host.backpack.totals()) as ItemId[]) this.learn(id);
    this.pay(gift, 'starter');
    this.guide.quietItems(this.known);
  }

  /** Pay a reward: the bag first, the bank for what does not fit. */
  pay(reward: Reward, reason: string): void {
    const paid: Partial<Record<ItemId, number>> = {};
    let any = false;
    for (const [id, n] of Object.entries(reward) as Array<[ItemId, number]>) {
      if (!isItem(id) || !(n > 0)) continue;
      if (ITEMS[id].equip) {
        this.gear.grant(id);
        any = true;
        paid[id] = 1;
        continue;
      }
      const a = this.host.backpack.add(id, n);
      if (a < n) this.host.storage.add(id, n - a);
      this.learn(id);
      paid[id] = n;
      any = true;
    }
    if (!any) return;
    this.syncGear();
    this.host.bus.emit('reward:paid', { items: paid, reason });
    this.host.bus.emit('inventory:changed', {});
  }

  /** The weapon an attack at `distance` m uses: the equipped one when it reaches, else the best owned (config/weapons). */
  weaponFor(distance = 0): Weapon {
    const owned = [...this.gear.owned].filter((id) => ITEMS[id].equip === 'weapon');
    const w = bestWeapon(owned, distance, this.gear.equipped.weapon);
    // The trophy wall, and the gems set in the weapon in hand.
    const st = w.id === this.gear.equipped.weapon ? this.socketTotals() : null;
    const f = this.camp.damageFactor(this.quests.shards.size) * (1 + (st?.damage ?? 0));
    const speed = 1 + (st?.speed ?? 0);
    return f === 1 && speed === 1 ? w : { ...w, damage: w.damage * f, rate: w.rate / speed };
  }

  /** Weapons owned (Combat's 'owned' list). */
  ownedWeapons(): WeaponId[] {
    return [...this.gear.owned].filter((id): id is ItemId & WeaponId => ITEMS[id].equip === 'weapon' && id in WEAPONS);
  }

  /** Remember an item as held (unlocks recipes, offers a hotbar slot). */
  learn(item: ItemId): void {
    if (!isItem(item)) return;
    const fresh = !this.known.has(item);
    this.known.add(item);
    this.hotbar.offer(item);
    if (!fresh) return;
    this.guide.firstItem(item);
    const ctx = this.unlockCtx();
    for (const r of RECIPES) {
      if (this.unlockedCache.has(r.id) || !isUnlocked(r, ctx)) continue;
      this.unlockedCache.add(r.id);
      if (r.unlock !== 'start') this.host.bus.emit('recipe:unlocked', { recipe: r.id, item: r.output.item });
    }
  }

  /** Enter a stratum (WORLD's StratumManager onEnter calls this through Game). */
  enterStratum(n: number): void {
    const s = Math.max(1, Math.min(6, Math.floor(n) || 1));
    this.stratum = s;
    if (s > this.deepest) this.deepest = s;
    const ctx = this.unlockCtx();
    for (const r of RECIPES) if (!this.unlockedCache.has(r.id) && isUnlocked(r, ctx)) this.unlockedCache.add(r.id);
  }

  private unlockCtx(): Pick<CraftContext, 'known' | 'stratum' | 'bought'> {
    return { known: this.known, stratum: this.deepest, bought: this.camp.bought };
  }

  /** At the stratum I camp (not a lift landing): the upgrades and the trader are there. */
  atMainCamp(): boolean {
    return this.host.inCamp && (this.host.strata?.current ?? 1) === 1;
  }

  /** Apply the gear to the tools the rest of the game reads (mining tier, lantern, bag size, health). */
  syncGear(heal = true): void {
    const h = this.host;
    h.equipment.upgrade('pickaxe', this.gear.tier('pick'));
    h.equipment.upgrade('lantern', this.gear.tier('lantern'));
    h.equipment.upgrade('pack', this.gear.tier('pack'));
    const pack = packForTier(Math.max(this.gear.tier('pack'), h.equipment.tier('pack')));
    if (h.backpack.slotCount < pack.slots) h.backpack.resize(pack.slots, pack.pouch);
    const st = this.socketTotals();
    const max = Math.max(20, PLAYER.maxHealth + this.gear.bonusHealth() + this.bonusHealth + this.camp.bonusHealth() + st.health + this.dailyFactor('maxHealth'));
    h.health.setMax(max, heal);
    h.health.armour = Math.min(ARMOUR_CAP, this.gear.armour() + st.armour);
  }

  /** Back at the stratum I camp: the garden's harvest goes to the bank, the trader brings new wares. */
  private arriveAtCamp(): void {
    const grown = this.camp.harvest();
    const items = Object.entries(grown) as Array<[ItemId, number]>;
    if (items.length && this.trip.active) {
      for (const [id, n] of items) {
        this.host.storage.add(id, n);
        this.learn(id);
      }
      this.host.bus.emit('reward:paid', { items: grown, reason: 'garden' });
      this.host.bus.emit('toast', { text: t('camp3.garden.harvest', { items: items.map(([id, n]) => t('loop3.count', { n, item: t(ITEMS[id].name) })).join(t('loop3.listSep')) }), tone: 'good' });
    }
    if (this.trip.active) {
      this.camp.restock(this.seed, this.deepest);
      this.host.bus.emit('toast', { text: t('trader3.restock'), tone: 'info' });
    }
  }

  // ------------------------------------------------------------------------------------
  // The daily descent

  /** Today's daily descent, with the best time recorded for it (null: none yet). */
  dailyToday(now = Date.now()): DailyDef & { best: number | null } {
    const d = daily(dayOf(now));
    const best = this.dailyBest[String(d.day)];
    return { ...d, best: typeof best === 'number' ? best : null };
  }

  /**
   * Start a daily run on the expedition just begun (New Game → Daily Descent: the hub starts the
   * new game on `def.seed`, then calls this). Its modifiers apply at once.
   */
  startDaily(def: DailyDef = daily()): void {
    this.dailyRun = { day: def.day, goal: def.goal, mods: [...def.mods], t0: this.clock, done: null };
    for (const m of def.mods) {
      const gift = DAILY_EFFECT[m].gift;
      if (gift) this.pay(gift, 'daily');
    }
    this.syncGear();
  }

  private loadDaily(x: unknown): void {
    this.dailyRun = null;
    this.dailyBest = {};
    if (!x || typeof x !== 'object') return;
    const o = x as Partial<DailySave>;
    if (o.best && typeof o.best === 'object') for (const [k, v] of Object.entries(o.best)) if (typeof v === 'number' && Number.isFinite(v) && v >= 0) this.dailyBest[k] = v;
    const r = o.run as Partial<DailyRun> | null | undefined;
    if (r && typeof r.day === 'number' && typeof r.goal === 'string' && Array.isArray(r.mods)) {
      const def = daily(r.day);
      this.dailyRun = { day: def.day, goal: def.goal, mods: [...def.mods], t0: typeof r.t0 === 'number' ? r.t0 : 0, done: typeof r.done === 'number' ? r.done : null };
    }
  }

  /** The active daily modifiers (MOBS reads 'swarm'). */
  dailyMods(): readonly string[] {
    return this.dailyRun?.mods ?? [];
  }

  private dailyFactor(key: 'burn' | 'maxHealth' | 'dropBonus' | 'swarm'): number {
    let v = key === 'maxHealth' || key === 'dropBonus' ? 0 : 1;
    for (const m of this.dailyRun?.mods ?? []) {
      const e = DAILY_EFFECT[m as keyof typeof DAILY_EFFECT]?.[key];
      if (typeof e === 'number') v = key === 'maxHealth' || key === 'dropBonus' ? v + e : v * e;
    }
    return v;
  }

  private checkDaily(): void {
    const run = this.dailyRun;
    if (!run || run.done !== null) return;
    const q = this.quests;
    if (!goalMet(run.goal, { shards: q.shards.size, gatesOpened: q.gatesOpened.size, deepest: this.deepest, guardians: q.shards.size })) return;
    const seconds = Math.max(0, this.clock - run.t0);
    run.done = seconds;
    this.counters.dailies++;
    const key = String(run.day);
    const prev = this.dailyBest[key];
    const best = typeof prev !== 'number' || seconds < prev;
    if (best) this.dailyBest[key] = seconds;
    // Keep the last 14 days.
    for (const k of Object.keys(this.dailyBest)) if (Number(k) < run.day - 14) delete this.dailyBest[k];
    const m = Math.floor(seconds / 60);
    const time = t('trip3.minutes', { m, s: Math.round(seconds - m * 60) });
    this.host.bus.emit('daily:done', { day: run.day, goal: run.goal, seconds, best });
    this.host.bus.emit('toast', { text: `${t('daily3.done', { goal: t(`daily3.goal.${run.goal}` as TextKey), time })}${best ? ` · ${t('daily3.new')}` : ''}`, tone: 'good' });
  }

  // ------------------------------------------------------------------------------------
  // Gem sockets

  /** Gems in the bag (and the bank in reach) that fit a piece, with what each would do there. */
  socketOptions(item: ItemId): Array<{ gem: ItemId; name: string; count: number; fx: string }> {
    const where = ITEMS[item].equip === 'weapon' ? 'weapon' : 'armour';
    if (socketsOf(item) === 0) return [];
    const bank = this.bankHere();
    const out: Array<{ gem: ItemId; name: string; count: number; fx: string }> = [];
    for (const id of CATALOGUE) {
      if (!isGem(id)) continue;
      const n = this.host.backpack.count(id) + (bank ? this.host.storage.count(id) : 0);
      if (n > 0) out.push({ gem: id, name: t(ITEMS[id].name), count: n, fx: gemLine(id, where) });
    }
    return out;
  }

  /** Why a gem cannot be set now (null: it can). */
  socketBlock(item: ItemId, gem: ItemId): string | null {
    if (!this.camp.gemCutting) return t('gem3.needCutter');
    if (!this.stationsNear().has('forge')) return t('gem3.needForge');
    if (!this.gear.owned.has(item) || socketsOf(item) === 0 || !isGem(gem)) return t('bag3.cantUse');
    const have = this.host.backpack.count(gem) + (this.bankHere() ? this.host.storage.count(gem) : 0);
    return have > 0 ? null : t('craft3.missing', { items: t('loop3.count', { n: 1, item: t(ITEMS[gem].name) }) });
  }

  /** Set a gem in a piece of gear (at a Forge, gem cutting bought). The gem a full piece gives up goes back to the bag. */
  socket(item: ItemId, gem: ItemId): boolean {
    if (this.socketBlock(item, gem) !== null) return false;
    const res = this.sockets.put(item, gem);
    if (!res) return false;
    if (this.host.backpack.remove(gem, 1) < 1) this.host.storage.remove(gem, 1);
    if (res.replaced) {
      const a = this.host.backpack.add(res.replaced, 1);
      if (a < 1) this.host.storage.add(res.replaced, 1);
    }
    this.syncGear(false);
    this.counters.gems++;
    this.host.bus.emit('gem:socketed', { gem, item, socket: res.socket });
    this.host.bus.emit('toast', { text: t('gem3.set', { gem: t(ITEMS[gem].name), item: t(ITEMS[item].name) }), tone: 'good' });
    this.host.bus.emit('inventory:changed', {});
    return true;
  }

  /** The worn gems' bonuses (reused object). */
  private socketTotals(): SocketTotals {
    const e = this.gear.equipped;
    return this.sockets.totals(e.weapon, [e.head, e.chest, e.feet], this.socketOut);
  }

  /** A mined block's bonus drop (config/loot BONUS_DROPS: loose rock with every ore). */
  private bonusDrop(block: number, x: number, y: number, z: number): void {
    const b = BONUS_DROPS.get(block);
    const drops = this.host.drops;
    if (!b || !drops) return;
    // The daily's rich veins: half the ores give one more of their own.
    const rich = this.dailyFactor('dropBonus');
    const main = BLOCKS[block]?.drop?.item ?? null;
    if (rich > 0 && main && main !== 'stone' && this.dropRng.next() < rich) drops.spawn(main, 1, x + 0.5, y + 0.5, z + 0.5, this.dropRng);
    if (this.dropRng.next() >= b.chance) return;
    const n = this.dropRng.int(b.min, b.max);
    if (n > 0) drops.spawn(b.item, n, x + 0.5, y + 0.5, z + 0.5, this.dropRng);
  }
  /** The bonus drops' own stream (the shared game rng stays aligned for everything else). */
  private dropRng = new Rng(0x5eed ^ 0xb0b);

  // ------------------------------------------------------------------------------------
  // Stations and outposts

  /** Is the bank in reach (the camp, an outpost)? */
  bankHere(): boolean {
    return this.host.inCamp || this.outpostNear(OUTPOST.useRadius) !== null;
  }

  outpostNear(radius: number): Outpost | null {
    const p = this.host.player;
    let best: Outpost | null = null;
    let bd = radius * radius;
    for (const o of this.outposts) {
      if (o.stratum !== this.stratum) continue;
      const d = dist2(o, p);
      if (d <= bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  /** The stations in reach now ('hand' always; the Workbench at camp or an outpost). */
  stationsNear(): ReadonlySet<StationId> {
    const set = this.stationSet;
    set.clear();
    set.add('hand');
    if (this.host.inCamp || this.outpostNear(OUTPOST.benchRadius)) set.add('workbench');
    const camp = this.atMainCamp();
    if (camp) set.add('trader');
    const p = this.host.player;
    // At the camp, its stations are in reach anywhere round the fire (the camp is one workshop).
    const fire = camp ? this.host.strata?.layout?.campSite?.fire ?? null : null;
    for (const s of this.stations) {
      if (s.stratum !== this.stratum) continue;
      if (dist2(s, p) <= STATIONS[s.station].reach ** 2) set.add(s.station);
      else if (fire && (s.x - fire[0]) ** 2 + (s.z - fire[2]) ** 2 <= CAMP_REACH * CAMP_REACH) set.add(s.station);
    }
    return set;
  }

  /**
   * Place a station (Place on a Furnace, Forge or Alchemy Table item): it rises out of the floor and
   * opens the Craft menu on Interact. At the camp it takes its own spot when that is free (WORLD's
   * camp plan: the camp visibly grows).
   */
  placeStation(station: StationId, at: { x: number; y: number; z: number }): PlacedStation {
    const p = this.host.player;
    let pos = { x: at.x, y: at.y, z: at.z, rotY: Math.atan2(p.x - at.x, p.z - at.z) };
    const slot = this.campSlot(station);
    if (slot) pos = slot;
    const s: PlacedStation = { id: `station:${this.stratum}:${++this.placedSeq}`, station, stratum: this.stratum, ...pos };
    this.stations.push(s);
    this.builder.show({ id: s.id, kind: station, x: s.x, y: s.y, z: s.z, rotY: s.rotY }, true);
    this.host.bus.emit('station:placed', { station, x: s.x, y: s.y, z: s.z, stratum: this.stratum });
    return s;
  }

  /** The camp's own spot for a station (stratum I's camp plan), when the explorer is at camp and it is free. */
  private campSlot(station: StationId): { x: number; y: number; z: number; rotY: number } | null {
    if (!this.host.inCamp || this.stratum !== 1) return null;
    const plan = this.host.strata?.layout?.campSite?.stations ?? null;
    const spot = plan?.find((x) => x.station === station) ?? null;
    if (!spot) return null;
    const taken = this.stations.some((s) => s.stratum === 1 && Math.abs(s.x - spot.p[0]) < 0.5 && Math.abs(s.z - spot.p[2]) < 0.5);
    return taken ? null : { x: spot.p[0], y: spot.p[1], z: spot.p[2], rotY: spot.rotY };
  }

  /** Set up an outpost (the kit placed). @returns null when the stratum has its maximum. */
  placeOutpost(at: { x: number; y: number; z: number }): Outpost | null {
    if (this.outposts.filter((o) => o.stratum === this.stratum).length >= OUTPOST.maxPerStratum) return null;
    const p = this.host.player;
    const o: Outpost = { id: `outpost:${this.stratum}:${this.counters.outposts + 1}`, stratum: this.stratum, x: at.x, y: at.y, z: at.z, rotY: Math.atan2(p.x - at.x, p.z - at.z) };
    this.outposts.push(o);
    this.counters.outposts++;
    this.bed = o.id;
    this.host.strata?.addOutpost?.(o.id, at.x, at.y, at.z);
    this.builder.show({ id: o.id, kind: 'outpost', x: o.x, y: o.y, z: o.z, rotY: o.rotY ?? 0 }, true);
    this.host.bus.emit('station:placed', { station: 'outpost', x: at.x, y: at.y, z: at.z, stratum: this.stratum });
    return o;
  }

  /**
   * Show the current stratum's stations and outposts, and at the stratum I camp its upgrades, the
   * trophies and the trader (on entering or restoring a stratum; `rise`: the new ones come up out of
   * the floor, after a build).
   */
  showBuilt(rise = false): void {
    const n = this.host.strata?.current ?? this.stratum;
    const things: BuiltThing[] = [];
    for (const s of this.stations) if (s.stratum === n) things.push({ id: s.id, kind: s.station, x: s.x, y: s.y, z: s.z, rotY: s.rotY });
    for (const o of this.outposts) if (o.stratum === n) things.push({ id: o.id, kind: 'outpost', x: o.x, y: o.y, z: o.z, rotY: o.rotY ?? 0 });
    const fire = n === 1 ? this.host.strata?.layout?.campSite?.fire ?? null : null;
    if (fire) things.push(...this.camp.props(fire, [...this.quests.shards]));
    if (rise) {
      const before = new Set(things.filter((x) => this.host.session?.liveProps.has(x.id)).map((x) => x.id));
      this.builder.sync(things.filter((x) => before.has(x.id)));
      for (const x of things) if (!before.has(x.id)) this.builder.show(x, true);
    } else this.builder.sync(things);
    this.shownLayout = this.host.strata?.layout ?? null;
  }

  /** Where a black-out wakes the explorer: the bed of an outpost in the loaded stratum (null: the hub's spawn). */
  respawnSpot(): { x: number; y: number; z: number; yaw: number } | null {
    const n = this.host.strata?.current ?? this.stratum;
    const o = this.bed ? this.outposts.find((x) => x.id === this.bed && x.stratum === n) : null;
    if (!o || !this.host.strata?.layout) return null;
    // Beside the tent, facing it.
    const a = (o.rotY ?? 0) + Math.PI;
    return { x: o.x + Math.sin(a) * 1.4, y: o.y, z: o.z + Math.cos(a) * 1.4, yaw: a };
  }

  /**
   * Rest at an outpost (its Interact): its bed becomes the respawn point and the bag is banked (the
   * hotbar's loadout stays). The hub heals and refills the lantern as at the camp fire.
   */
  restAtOutpost(id: string): boolean {
    const o = this.outposts.find((x) => x.id === id);
    if (!o) return false;
    this.bed = o.id;
    // A rest at the bed ends the trip (its card), and the next one starts from here.
    if (this.trip.active) this.endTripAt('returned', 'outpost');
    this.bankAll();
    this.hazards.reset();
    this.host.bus.emit('toast', { text: t('outpost3.rested'), tone: 'good' });
    return true;
  }

  /** What the Place action would put down for the held item (null: nothing placeable held). */
  placeRequest(blocks: Partial<Record<'BUILT_PLANK' | 'BUILT_BRICK' | 'TORCH' | 'LADDER' | 'ROPE' | 'DOOR', number>>): PlaceRequest | null {
    const item = this.hotbar.held();
    if (!item || this.host.backpack.count(item) <= 0) return null;
    const d = ITEMS[item];
    switch (d.place) {
      case 'block': {
        const block = item === 'brick' ? blocks.BUILT_BRICK : blocks.BUILT_PLANK;
        return block === undefined ? null : { kind: 'block', item, block };
      }
      case 'torch':
        return blocks.TORCH === undefined ? null : { kind: 'torch', item, block: blocks.TORCH };
      case 'ladder':
        return blocks.LADDER === undefined ? null : { kind: 'ladder', item, block: blocks.LADDER };
      case 'rope':
        return blocks.ROPE === undefined ? null : { kind: 'rope', item, block: blocks.ROPE };
      case 'door':
        return blocks.DOOR === undefined ? null : { kind: 'door', item, block: blocks.DOOR };
      case 'station': {
        const station = stationOfItem(item);
        return station ? { kind: 'station', item, station } : null;
      }
      case 'outpost':
        return { kind: 'outpost', item };
      default:
        return null;
    }
  }

  /** Spend one of the held placeable after a successful placement. */
  consumePlaced(item: ItemId): void {
    this.host.backpack.remove(item, 1);
    this.host.bus.emit('inventory:changed', {});
  }

  // ------------------------------------------------------------------------------------
  // Crafting

  craftContext(): CampCtx {
    const atCamp = this.atMainCamp();
    return {
      bag: this.bagStore,
      bank: this.bankHere() ? this.bankStore : null,
      stations: this.stationsNear(),
      known: this.known,
      stratum: this.deepest,
      owned: this.gear.owned,
      bought: this.camp.bought,
      fuelFactor: this.camp.fuelFactor(atCamp),
      atCamp,
      deepest: this.deepest,
    };
  }

  craft(recipeId: string, times = 1): CraftOutcome {
    if (recipeId.startsWith('camp:')) return this.buildUpgrade(recipeId.slice(5) as CampUpgradeId);
    if (recipeId.startsWith('trade:')) return this.trade(recipeId.slice(6), times);
    const rec = RECIPES.find((r) => r.id === recipeId) ?? null;
    const ctx = this.craftContext();
    const gearOut = rec ? !!ITEMS[rec.output.item].equip : false;
    const out = Craft.craft(recipeId, ctx, gearOut ? 1 : times);
    if (!out.ok || !rec) return out;
    const item = rec.output.item;
    if (gearOut) {
      // Gear goes to the locker, not the bag.
      this.host.backpack.remove(item, out.added);
      if (ctx.bank) ctx.bank.remove(item, Math.max(0, out.made * rec.output.count - out.added));
      const equipped = this.gear.grant(item);
      this.syncGear();
      if (equipped) this.host.bus.emit('gear:equipped', { item, slot: ITEMS[item].equip as EquipSlot });
      this.host.bus.emit('toast', { text: t(equipped ? 'craft3.madeGear' : 'craft3.made', { count: 1, item: t(ITEMS[item].name) }), tone: 'good' });
    } else {
      this.learn(item);
      if (this.host.inCamp) this.keptHere.add(item);
      this.host.bus.emit('toast', { text: t('craft3.made', { count: out.added, item: t(ITEMS[item].name) }), tone: 'good' });
    }
    this.counters.crafted += out.made;
    if (rec.category === 'smelting') this.counters.smelted += out.made;
    this.host.bus.emit('craft:made', { recipe: rec.id, item, times: out.made, count: out.made * rec.output.count });
    this.host.bus.emit('inventory:changed', {});
    return out;
  }

  /** Build the next level of a camp upgrade (at the camp's Workbench). */
  buildUpgrade(id: CampUpgradeId): CraftOutcome {
    const ctx = this.craftContext();
    const out = this.camp.build(id, ctx);
    if (!out.ok) return out;
    const def = CAMP_UPGRADES[id];
    const lv = this.camp.levels[id];
    this.showBuilt(true);
    this.syncGear();
    this.counters.upgrades++;
    this.host.bus.emit('camp:upgraded', { id, level: lv });
    this.host.bus.emit('toast', { text: t('camp3.upgraded', { name: t(def.name), does: t(def.levels[lv - 1].does) }), tone: 'good' });
    this.host.bus.emit('inventory:changed', {});
    return out;
  }

  /** Barter with the trader (at the camp); a rare recipe is learned for good. */
  trade(id: string, times = 1): CraftOutcome {
    const ctx = this.craftContext();
    const out = this.camp.trade(id, ctx, times);
    if (!out.ok) return out;
    const def = this.camp.stock(this.deepest).find((x) => x.id === id) ?? null;
    if (def) this.learn(def.get.item);
    if (out.learned) {
      // The recipe shows in its tab at once (and a 'recipe:unlocked' pip for the menu).
      const r = RECIPES.find((x) => x.id === out.learned);
      if (r) {
        this.unlockedCache.add(r.id);
        this.host.bus.emit('recipe:unlocked', { recipe: r.id, item: r.output.item });
        this.host.bus.emit('toast', { text: t('trader3.learned', { name: t(ITEMS[r.output.item].name) }), tone: 'good' });
      } else if (out.learned === 'sockets') this.host.bus.emit('toast', { text: t('trader3.learned', { name: t('trader3.recipe.sockets') }), tone: 'good' });
    } else if (def) this.host.bus.emit('toast', { text: t('trader3.done', { items: t('loop3.count', { n: out.added, item: t(ITEMS[def.get.item].name) }) }), tone: 'good' });
    this.counters.trades += out.made;
    this.host.bus.emit('trade:done', { id, times: out.made, item: def?.get.item ?? null, recipe: out.learned });
    this.host.bus.emit('inventory:changed', {});
    return out;
  }

  /** The Crafting menu (LOOP's own view). */
  craftView(): CraftMenuView {
    const ctx = this.craftContext();
    const cards: RecipeCardView[] = [];
    for (const r of RECIPES) {
      const c = Craft.can(r, ctx, 1);
      if (c.state === 'hidden') continue;
      cards.push(this.card(r, c.state, c.have, c.max, c.fuelHave));
    }
    cards.push(...this.camp.upgradeCards(ctx), ...this.camp.traderCards(ctx));
    cards.sort((a, b) => Number(b.state === 'ok') - Number(a.state === 'ok'));
    const categories = RECIPE_CATEGORIES.map((id) => ({
      id,
      name: t(CAT_KEY[id]),
      ready: cards.filter((c) => c.category === id && c.state === 'ok').length,
      total: cards.filter((c) => c.category === id).length,
    }));
    const near = this.stationsNear();
    return { categories, cards, stations: STATION_IDS.map((id) => ({ id, name: t(STATIONS[id].name), near: near.has(id) })), bank: ctx.bank !== null, focus: this.craftFocus(cards) };
  }

  /**
   * The card the Crafting menu opens on: the tutorial's torches (the first torch recipe that can be
   * made, else the first shown), or on the main quest's 'prepare' step the pick it asks for.
   */
  private craftFocus(cards: readonly RecipeCardView[]): CraftMenuView['focus'] {
    const tut = this.quests.tutorial();
    let item: ItemId | null = null;
    if (tut?.id === 'craft') item = 'torch';
    else if (!tut) {
      const m = this.quests.mainRawStep();
      if (m.step === 'prepare') item = NEXT_PICK[m.stratum] ?? null;
    }
    if (!item) return null;
    const list = cards.filter((c) => c.output.item === item);
    const card = list.find((c) => c.state === 'ok') ?? list[0];
    return card ? { category: card.category, recipe: card.id } : null;
  }

  /** Mark every visible recipe as seen (the menu was opened). */
  markRecipesSeen(): void {
    for (const id of this.unlockedCache) this.seenRecipes.add(id);
  }

  private card(r: Recipe, state: RecipeCardView['state'], have: Partial<Record<ItemId, number>>, max: number, fuelHave: number): RecipeCardView {
    const out = ITEMS[r.output.item];
    const inputs = recipeInputs(r).map(([item, need]) => {
      const from = sourceOf(item);
      return { item, name: t(ITEMS[item].name), have: have[item] ?? 0, need, ...(from ? { from } : {}) };
    });
    let reason: string | null = null;
    if (state === 'station') reason = t('craft3.needStation', { station: t(STATIONS[r.station].name) });
    else if (state === 'missing') reason = t('craft3.missing', { items: inputs.filter((c) => c.have < c.need).map((c) => costLine(c.item, c.need - c.have, c.name)).join(t('loop3.listSep')) });
    else if (state === 'fuel') reason = t('craft3.noFuel');
    else if (state === 'owned') reason = t('craft3.owned');
    return {
      id: r.id,
      category: r.category,
      station: r.station,
      stationName: t(STATIONS[r.station].name),
      output: { item: r.output.item, count: r.output.count, name: t(out.name), desc: t(out.desc), grade: out.grade },
      inputs,
      fuel: r.fuel && STATIONS[r.station].fuel ? { have: fuelHave, need: r.fuel } : null,
      state,
      reason,
      max,
      fresh: !this.seenRecipes.has(r.id),
      stat: this.statLine(r.output.item),
    };
  }

  /** One line of what a gear item or consumable does. */
  statLine(item: ItemId): string | null {
    const d = ITEMS[item];
    if (d.equip === 'pick') return t('craft3.stat.pick', { tier: d.tier ?? 1 });
    if (d.equip === 'lantern') {
      const l = lanternForTier(d.tier ?? 1);
      return t('craft3.stat.lantern', { tier: d.tier ?? 1, light: Math.round(l.radius), sonar: l.sonar });
    }
    if (d.equip === 'pack') return t('craft3.stat.pack', { slots: packForTier(d.tier ?? 1).slots });
    if (d.equip === 'weapon') {
      const w = WEAPONS[item as WeaponId];
      return w ? t('craft3.stat.weapon', { damage: formatNumber(w.damage), reach: formatNumber(w.reach) }) : null;
    }
    if (d.equip === 'head' || d.equip === 'chest' || d.equip === 'feet') {
      const piece = armourPiece(item);
      if (piece) return t('craft3.stat.armour', { armour: Math.round(piece.armour * 100), set: t(ARMOUR_SETS[piece.set].name) });
    }
    if (d.use?.kind === 'heal') return t('craft3.stat.heal', { amount: d.use.amount });
    if (d.use?.kind === 'ward') return t('craft3.stat.ward', { hazard: t(`hazard.noun.${d.use.hazard}` as TextKey), seconds: d.use.seconds });
    return null;
  }

  // ------------------------------------------------------------------------------------
  // The bag, the bank, gear, the hotbar

  use(item: ItemId): boolean {
    const d = ITEMS[item];
    const h = this.host;
    if (!d.use || h.backpack.count(item) <= 0) return false;
    const u = d.use;
    let ok = false;
    let text = '';
    if (u.kind === 'heal') {
      if (h.health.current >= h.health.max) return false;
      ok = h.health.heal(u.amount) > 0;
      text = t('bag3.healed', { amount: u.amount });
    } else if (u.kind === 'oil') {
      const def = lanternForTier(h.equipment.tier('lantern'));
      if (h.lanternFuel.fraction >= 0.98) return false;
      h.lanternFuel.add(def.fuelSeconds * u.fraction);
      ok = true;
      text = t('bag3.oiled');
      h.bus.emit('lantern:refueled', {});
    } else if (u.kind === 'ward') {
      this.wards[u.hazard] = Math.max(this.wards[u.hazard] ?? 0, u.seconds);
      if (u.heal) h.health.heal(u.heal);
      ok = true;
      text = t('bag3.warded', { hazard: t(`hazard.${u.hazard}` as TextKey), seconds: u.seconds });
    } else if (u.kind === 'lure') {
      // MOBS tames the nearest wild Lampling; the lure is kept when none answers (or one already follows).
      const p = h.player;
      const mobs = (h.mobs ?? null) as CompanionHooks | null;
      if (companionFollows(mobs)) {
        h.bus.emit('toast', { text: t('companion3.already'), tone: 'info' });
        return false;
      }
      if (!mobs?.lureLampling || !mobs.lureLampling(p.x, p.y, p.z, LURE_RADIUS)) {
        h.bus.emit('toast', { text: t('companion3.noLampling'), tone: 'info' });
        return false;
      }
      h.bus.emit('companion:lure', { x: p.x, y: p.y, z: p.z, radius: LURE_RADIUS });
      ok = true;
      text = t('companion3.lured');
    } else if (u.kind === 'feed') {
      // A treat goes to the tame Lampling (MOBS gives it the experience and the health).
      const mobs = (h.mobs ?? null) as CompanionHooks | null;
      if (!companionFollows(mobs)) {
        h.bus.emit('toast', { text: t('companion3.none'), tone: 'info' });
        return false;
      }
      if (!mobs?.feedCompanion || !mobs.feedCompanion(u.xp, u.heal)) {
        h.bus.emit('toast', { text: t('companion3.full'), tone: 'info' });
        return false;
      }
      h.bus.emit('companion:feed', { item, xp: u.xp, heal: u.heal });
      ok = true;
      text = t('companion3.fed');
    } else {
      // Thrown things (bombs, flares) go through the hub's throw action (UI) which calls consumeThrown.
      return false;
    }
    if (!ok) return false;
    h.backpack.remove(item, 1);
    this.counters.used++;
    h.bus.emit('item:used', { item });
    h.bus.emit('inventory:changed', {});
    h.bus.emit('toast', { text, tone: 'good' });
    return true;
  }

  /** Burning flares (thrown): their light keeps the dark and the cold back within FLARE_RADIUS. */
  private readonly flares: Array<{ x: number; y: number; z: number; left: number }> = [];

  /** A thrown flare landed here and burns `seconds` (the hub's throw calls it; the light is the hazards'). */
  flareAt(x: number, y: number, z: number, seconds?: number): void {
    const s = seconds ?? (ITEMS.flare.use?.kind === 'flare' ? ITEMS.flare.use.seconds : 40);
    if (this.flares.length >= 8) this.flares.shift();
    this.flares.push({ x, y, z, left: s });
  }

  /** A chest was opened (Progression.openCache): the orders and the trip count it. */
  chestOpened(): void {
    this.quests.chestOpened();
    this.trip.chestOpened();
  }

  /** A bomb or flare was thrown by the hub: spend one. */
  consumeThrown(item: ItemId): boolean {
    if (this.host.backpack.remove(item, 1) !== 1) return false;
    if (ITEMS[item].use?.kind === 'flare') this.flaresFlying = Math.min(4, this.flaresFlying + 1);
    this.counters.used++;
    this.host.bus.emit('item:used', { item });
    this.host.bus.emit('inventory:changed', {});
    return true;
  }

  equip(item: ItemId): boolean {
    if (!this.gear.equip(item)) return false;
    this.syncGear();
    this.host.bus.emit('gear:equipped', { item, slot: ITEMS[item].equip as EquipSlot });
    return true;
  }

  assign(slot: number, item: ItemId | null): void {
    if (item && ITEMS[item].equip === 'weapon' && slot === 1) {
      this.equip(item);
      return;
    }
    if (this.hotbar.assign(slot, item) && item) this.host.bus.emit('toast', { text: t('hotbar3.assigned', { item: t(ITEMS[item].name), slot: slot + 1 }), tone: 'info' });
  }

  selectHotbar(slot: number): void {
    if (this.hotbar.select(slot)) this.host.bus.emit('hotbar:selected', { slot, item: this.hotbar.held() });
  }

  hotbarView(): HotbarView {
    return this.hotbar.view();
  }

  /** The HUD's hotbar row (ui/types HudSlot). */
  hudSlots(): HudSlot[] {
    const v = this.hotbar.view();
    return v.slots.map((s) => ({ item: s.item, name: s.item ? t(ITEMS[s.item].name) : '', count: s.count, placeable: s.mode === 'place' }));
  }

  /**
   * The items a deposit leaves in the bag: the hotbar's slots 2..5 (bombs, torches, food, the free
   * slot). During the tutorial the camp takes nothing: its first craft (torches by hand) needs the
   * starter kit's wood and coal in the bag once the explorer has walked out to the first vein, and its
   * Bag step shows what was just mined.
   */
  keepOnBank(): ReadonlySet<ItemId> {
    const keep = this.keepSet;
    keep.clear();
    if (!this.quests.tutorialDone) {
      for (const id of Object.keys(this.host.backpack.totals()) as ItemId[]) keep.add(id);
      return keep;
    }
    for (let i = 2; i < HOTBAR_SIZE; i++) {
      const id = this.hotbar.itemAt(i);
      if (id) keep.add(id);
    }
    // What was made or taken out of the bank during this camp visit stays in the bag until the
    // explorer leaves (UI 22:17: a ladder crafted at the bench went straight back to the bank).
    for (const id of this.keptHere) keep.add(id);
    return keep;
  }
  private readonly keepSet = new Set<ItemId>();
  /** Items crafted or withdrawn in the camp this visit (kept in the bag by the camp's deposit). */
  private readonly keptHere = new Set<ItemId>();
  /** Gear may have reached the bag or the bank (a chest, a drop, an old save): see sweepGear. */
  private gearSweep = true;
  /** The unarmed-guardian hints already given (per stratum, and per lair approached). */
  private readonly armHinted = new Set<string>();

  /** The hotbar's loadout (slots 2..5), kept in the bag by a deposit made by hand. */
  private hotbarKeep(): ReadonlySet<ItemId> {
    const keep = this.keepSet;
    keep.clear();
    for (let i = 2; i < HOTBAR_SIZE; i++) {
      const id = this.hotbar.itemAt(i);
      if (id) keep.add(id);
    }
    return keep;
  }

  /** Bank everything but what the hotbar holds (camp, outpost). @returns items moved. */
  bankAll(): number {
    if (!this.bankHere()) return 0;
    // Banking by hand (the Bag's button, an outpost's rest) takes everything but the hotbar's loadout.
    const keep = this.hotbarKeep();
    const totals = this.host.backpack.totals();
    let moved = 0;
    const items: Partial<Record<ItemId, number>> = {};
    for (const id of Object.keys(totals) as ItemId[]) {
      if (keep.has(id)) continue;
      const n = this.host.backpack.remove(id, totals[id] ?? 0);
      this.host.storage.add(id, n);
      moved += n;
      items[id] = n;
    }
    if (moved > 0) {
      this.host.bus.emit('items:banked', { total: moved, items });
      this.host.bus.emit('inventory:changed', {});
      this.host.bus.emit('toast', { text: t('bag3.banked', { count: moved }), tone: 'good' });
    }
    return moved;
  }

  withdraw(item: ItemId, count: number): number {
    if (!this.bankHere()) return 0;
    const n = Math.min(count, this.host.storage.count(item), this.host.backpack.room(item));
    if (n <= 0) return 0;
    this.host.storage.remove(item, n);
    this.host.backpack.add(item, n);
    this.learn(item);
    if (this.host.inCamp) this.keptHere.add(item);
    this.host.bus.emit('inventory:changed', {});
    return n;
  }

  bagView(): BagView {
    const h = this.host;
    const items = Object.fromEntries(INVENTORY_CATEGORIES.map((c) => [c, [] as BagItemView[]])) as Record<InventoryCategory, BagItemView[]>;
    const totals = h.backpack.totals();
    for (const id of CATALOGUE) {
      const d = ITEMS[id];
      const owned = d.equip && this.gear.owned.has(id);
      const count = totals[id] ?? 0;
      if (!owned && count <= 0) continue;
      const equipped = !!d.equip && this.gear.equipped[d.equip] === id;
      const actions: BagItemView['actions'] = [];
      if (d.use && d.use.kind !== 'bomb' && d.use.kind !== 'flare') actions.push('use');
      if (d.equip && !equipped) actions.push('equip');
      if (d.place) actions.push('place');
      if (!d.equip) actions.push('assign', 'drop');
      if (!d.equip && this.bankHere()) actions.push('bank');
      const n = owned ? socketsOf(id) : 0;
      const where = d.equip === 'weapon' ? 'weapon' : 'armour';
      const sockets = n > 0 ? this.sockets.of(id).map((g) => ({ gem: g, name: g ? t(ITEMS[g].name) : t('gem3.empty'), fx: g ? gemLine(g, where) : '' })) : undefined;
      if (n > 0 && this.camp.gemCutting) actions.push('socket');
      items[d.category].push({ item: id, count: owned ? 1 : count, name: t(d.name), desc: t(d.desc), category: d.category, grade: d.grade, actions, equipped, ...(sockets ? { sockets } : {}) });
    }
    const set = this.gear.fullSet();
    return {
      slots: h.backpack.toJSON(),
      used: h.backpack.usedSlots,
      max: h.backpack.slotCount,
      pouch: h.backpack.pouchSlots,
      items,
      categories: INVENTORY_CATEGORIES.map((id) => ({ id, name: t(BAG_KEY[id]), count: items[id].length })),
      bank: this.bankHere() ? h.storage.toJSON() : null,
      gear: {
        equipped: { ...this.gear.equipped },
        slots: EQUIP_SLOTS.map((slot) => {
          const id = this.gear.equipped[slot];
          return { slot, name: t(SLOT_KEY[slot]), item: id, itemName: id ? t(ITEMS[id].name) : '' };
        }),
        armour: this.gear.armour(),
        set: set ? { id: set, name: t(ARMOUR_SETS[set].name), bonus: t(ARMOUR_SETS[set].bonus) } : null,
        wards: this.gear.wards(),
        pickTier: this.gear.tier('pick'),
        lanternTier: this.gear.tier('lantern'),
      },
    };
  }

  // ------------------------------------------------------------------------------------
  // Frame and save

  /**
   * Each playing frame: potion wards wear off, the hazards bite (their damage pierces armour), the
   * quests and the guide follow along.
   */
  update(dt: number, playing = true): void {
    if (!(dt > 0)) return;
    this.clock += dt;
    // A new layout (a switch, a restore, a new game) brings the session's props back from the
    // layout: put the placed things back on it.
    const layout = this.host.strata?.layout ?? null;
    if (layout !== this.shownLayout) this.showBuilt();
    this.builder.update(dt);
    for (const k of Object.keys(this.wards) as HazardKind[]) {
      const left = (this.wards[k] ?? 0) - dt;
      if (left > 0) this.wards[k] = left;
      else delete this.wards[k];
    }
    for (let i = this.flares.length - 1; i >= 0; i--) {
      this.flares[i].left -= dt;
      if (this.flares[i].left <= 0) this.flares.splice(i, 1);
    }
    if (!playing) return;
    const h = this.host;
    // Hazards (the probe is refreshed 4 times a second; the meter runs every frame).
    this.probeT -= dt;
    if (this.probeT <= 0) {
      this.probeT = 0.25;
      this.refreshProbe();
    }
    const p = this.probe;
    p.lit = h.lanternFuel.lit;
    p.inCamp = h.inCamp;
    p.health = h.health.current;
    const step = this.hazards.update(dt, p);
    h.lanternFuel.burn = step.burn * this.dailyFactor('burn');
    this.fallFactor = this.gear.safeFall() ? Math.min(1, step.fallFactor) : step.fallFactor;
    if (step.damage > 0) {
      const dealt = h.health.damage(step.damage, true);
      if (dealt > 0) h.bus.emit('player:damaged', { amount: dealt, cause: 'hazard' });
    }
    if (step.blunt > 0) {
      const dealt = h.health.damage(step.blunt);
      if (dealt > 0) h.bus.emit('player:damaged', { amount: dealt, cause: 'hazard' });
    }
    if (step.startedHurting && step.kind) {
      h.bus.emit('hazard:changed', { kind: step.kind, level: step.level });
      h.bus.emit('toast', { text: t(`hazard.hurt.${step.kind}` as TextKey), tone: 'warn' });
    } else if (step.stoppedHurting) h.bus.emit('hazard:changed', { kind: null, level: 0 });
    else if (step.warn && step.kind) this.warnHazard(step.kind);
    this.quests.update(dt);
    // The trip: its deepest point; its end (a frame after the arrival or the black-out).
    if (this.trip.active) {
      const st = h.strata ?? null;
      const depth = st?.depth ? st.depth(h.player.y) : 0;
      this.trip.follow(depth, st?.current ?? this.stratum);
    }
    if (this.tripEnding) this.endTrip();
    this.dailyT += dt;
    if (this.dailyT >= 1) {
      this.dailyT = 0;
      this.checkDaily();
    }
    if (this.gearSweep) {
      this.gearSweep = false;
      this.sweepGear();
    }
    const main = this.quests.mainRawStep();
    const mv = this.quests.main();
    this.armHint(main);
    this.guide.update(dt, { mainId: main.id, mainStep: main.step, mainText: mv.text, flame: h.lanternFuel.fraction, health: h.health.fraction, inCamp: h.inCamp, playing });
  }

  /** Does the explorer own a weapon (any band)? A pick alone barely scratches a guardian. */
  armed(): boolean {
    for (const id of this.gear.owned) if (ITEMS[id].equip === 'weapon') return true;
    return false;
  }

  /** The first weapon to make, for the unarmed guardian step: the Machete, at the Forge. */
  firstWeapon(): { item: string; station: string } {
    return { item: t(ITEMS.machete.name), station: t(STATIONS.forge.name) };
  }

  /**
   * A guardian's step with no weapon owned (QA 22:10: the starter pick deals 1 a hit to a 90-point
   * guardian): say once per stratum what to make, and once more when the explorer walks up to the lair
   * still unarmed. The tracker's line says it too (Quests: 'quest.step.arm').
   */
  private armHint(main: { id: string; step: string; stratum: number; target: { x: number; z: number } | null }): void {
    if (main.step !== 'guardian' || this.armed()) return;
    const p = this.host.player;
    const near = main.target ? (main.target.x - p.x) ** 2 + (main.target.z - p.z) ** 2 < ARM_NEAR * ARM_NEAR : false;
    const id = near ? `near:${main.id}` : `s${main.stratum}`;
    if (this.armHinted.has(id)) return;
    this.armHinted.add(id);
    this.host.bus.emit('guide:hint', { id: `arm:${id}`, text: t('hint3.needWeapon', this.firstWeapon()), target: 'craft' });
  }

  /**
   * Gear is never carried (it lives in the locker, Gear): a weapon, armour piece, lantern or pack that
   * reaches the bag or the bank (a chest, a drop, a trade, an old save) goes to the locker, and is worn
   * when its slot is empty or it is better (QA 22:10: a Machete carried in the bag, never used).
   */
  private sweepGear(): void {
    const h = this.host;
    let moved = false;
    const stores = [
      { counts: h.backpack.totals() as Partial<Record<ItemId, number>>, remove: (id: ItemId, n: number) => h.backpack.remove(id, n) },
      { counts: h.storage.toJSON() as Partial<Record<ItemId, number>>, remove: (id: ItemId, n: number) => h.storage.remove(id, n) },
    ];
    for (const st of stores)
      for (const [id, n] of Object.entries(st.counts) as Array<[ItemId, number]>) {
        if (!isItem(id) || !ITEMS[id].equip || !(n > 0)) continue;
        st.remove(id, n);
        const worn = this.gear.grant(id);
        moved = true;
        if (worn) h.bus.emit('gear:equipped', { item: id, slot: ITEMS[id].equip as EquipSlot });
        h.bus.emit('toast', { text: t(worn ? 'craft3.madeGear' : 'gear3.kept', { item: t(ITEMS[id].name) }), tone: 'good' });
      }
    if (!moved) return;
    this.syncGear();
    h.bus.emit('inventory:changed', {});
  }

  /**
   * A hazard's meter is rising: say so once, with the answer the explorer carries (the potion in the
   * bag, else what to do), and ring the hotbar slot that holds it.
   */
  private warnHazard(kind: HazardKind): void {
    const h = this.host;
    const fix = this.hazardFix(kind);
    h.bus.emit('toast', { text: t('hazard.warnLine', { what: t(`hazard.warn.${kind}` as TextKey), fix: fix.text }), tone: 'warn' });
    h.bus.emit('guide:hint', { id: `hazard:${kind}`, text: fix.text, target: fix.target });
  }

  /** What answers a hazard now: a counter in the bag first, else the way out. */
  hazardFix(kind: HazardKind): { text: string; item: ItemId | null; target: UiTargetId | null } {
    const bag = this.host.backpack;
    const lantern = this.host.lanternFuel;
    const candidates: Record<HazardKind, ItemId[]> = {
      cold: ['warmingTonic', 'torch'],
      gas: ['antidote'],
      heat: ['coolingDraught'],
      dark: lantern.fraction < 0.9 ? ['oilFlask', 'torch', 'flare'] : ['torch', 'flare'],
    };
    for (const id of candidates[kind]) {
      const n = bag.count(id);
      if (n <= 0) continue;
      const slot = this.hotbar.slotOf(id);
      return { text: t(ITEMS[id].place ? 'hazard.fix.place' : 'hazard.fix.item', { item: t(ITEMS[id].name), n }), item: id, target: slot >= 0 ? (`hotbar:${slot}` as UiTargetId) : 'bag' };
    }
    return { text: t(`hazard.fix.${kind}` as TextKey), item: null, target: null };
  }

  /** The trip ends on the next frame (so the orders paid and the bag banked on arrival count for it). */
  private endTripAt(outcome: 'returned' | 'blackout', where: TripEnd): void {
    this.tripEnding = outcome;
    this.tripWhere = where;
  }

  /** End the trip under way and show its summary ('trip:summary'). An outpost's rest starts the next trip there. */
  private endTrip(): void {
    const outcome = this.tripEnding ?? 'returned';
    const where = this.tripWhere;
    this.tripEnding = null;
    const s = this.trip.end(this.clock, outcome, this.quests.main().text, where);
    if (s) this.host.bus.emit('trip:summary', { summary: s });
    if (where === 'outpost' && outcome === 'returned') this.trip.start(this.clock, this.host.strata?.current ?? this.stratum, (this.host.strata?.biomeHere ?? null) as never);
  }

  /**
   * The ending card (after 'quest:ending': the Heart relit, its guardian fallen): the expedition in
   * a few lines, then free play.
   */
  endingView(playSeconds?: number): { title: string; body: string; free: string; lines: Array<{ label: string; value: string }> } {
    const q = this.quests;
    const secs = playSeconds ?? this.clock;
    const h = Math.floor(secs / 3600);
    const m = Math.round((secs - h * 3600) / 60);
    const lines: Array<{ label: string; value: string }> = [
      { label: t('ending3.time'), value: t('ending3.hm', { h, m }) },
      { label: t('trip3.shards'), value: t('loop3.ofTotal', { have: q.shards.size, total: 12 }) },
      { label: t('trip3.pages'), value: t('loop3.ofTotal', { have: q.pages.size, total: PAGE_COUNT }) },
      { label: t('ending3.bestiary'), value: String(this.bestiaryFound) },
      { label: t('trip3.kills'), value: String(this.counters.kills) },
      { label: t('trip3.crafted'), value: String(this.counters.crafted) },
      { label: t('ending3.feats'), value: String(q.feats.size) },
      { label: t('ending3.trips'), value: String(this.trip.records.trips) },
    ];
    return { title: t('ending3.title'), body: t('ending3.body'), free: t('ending3.free'), lines };
  }

  /** The last trip's summary (the UI's card after a return), null before the first. */
  lastTrip(): TripSummary | null {
    return this.trip.last;
  }

  /** Sample the world round the explorer for the hazards (biome, zones, lava, warmth). */
  private refreshProbe(): void {
    const h = this.host;
    const p = this.probe;
    const at = h.player;
    p.moving = (at.x - this.lastPos.x) ** 2 + (at.z - this.lastPos.z) ** 2 > 0.04;
    this.lastPos = { x: at.x, y: at.y, z: at.z };
    const wards = this.wardsNow();
    p.wards.cold = wards.cold;
    p.wards.gas = wards.gas;
    p.wards.heat = wards.heat;
    p.wards.dark = wards.dark;
    p.potions = this.wards;
    const st = h.strata ?? null;
    const layout = st?.layout ?? null;
    const biome = st?.biomeHere ?? null;
    if (!layout || !biome || !(biome in BIOMES)) {
      p.kind = 'none';
      p.strength = 0;
      p.zone = 0;
      p.inLava = false;
      p.nearWarmth = h.inCamp;
      this.enterZone(null);
      return;
    }
    const hz = BIOMES[biome].hazard;
    p.kind = hz.kind as WorldHazard;
    p.strength = hz.strength;
    // Local intensity: WORLD's pockets; biome-wide hazards are everywhere in the biome.
    let zone = p.kind === 'cold' || p.kind === 'dark' || p.kind === 'void' || p.kind === 'falls' || p.kind === 'rockfall' ? 1 : 0;
    let inZone: WorldHazard | null = null;
    for (const z of layout.hazards) {
      const d = Math.hypot(at.x - z.centre[0], (at.y - z.centre[1]) * 1.4, at.z - z.centre[2]);
      if (d < z.radius) {
        const k = z.kind as WorldHazard;
        if (k !== p.kind && k !== 'none') {
          // A pocket of another kind (a lava river in the Abyss) takes over while you stand in it.
          p.kind = k;
          p.strength = Math.max(p.strength, z.strength);
        }
        if (k !== 'none') inZone = k;
        zone = Math.max(zone, (1 - d / z.radius) * 0.5 + 0.5);
      }
    }
    this.enterZone(inZone);
    // Lava heat and warmth from the voxels (a 13 m cube for lava, 9 m for torches).
    const w = h.session?.world;
    let lavaD = Infinity;
    let warm = h.inCamp || this.outpostNear(OUTPOST.useRadius + 2) !== null || this.flares.some((f) => dist2(f, at) <= FLARE_RADIUS * FLARE_RADIUS);
    p.inLava = false;
    if (w) {
      const cx = Math.floor(at.x);
      const cy = Math.floor(at.y);
      const cz = Math.floor(at.z);
      p.inLava = w.get(cx, cy, cz) === B.LAVA || w.get(cx, cy - 1, cz) === B.LAVA;
      const scanLava = p.kind === 'lava' || biome === 'magmaVeins' || biome === 'heart';
      const scanVines = p.kind === 'thorns';
      let vines = false;
      for (let dy = -3; dy <= 3; dy++)
        for (let dz = -6; dz <= 6; dz++)
          for (let dx = -6; dx <= 6; dx++) {
            const id = w.get(cx + dx, cy + dy, cz + dz);
            if (id === B.TORCH && !warm && Math.abs(dx) <= 4 && Math.abs(dz) <= 4) warm = true;
            if (scanLava && id === B.LAVA) lavaD = Math.min(lavaD, Math.hypot(dx, dy, dz));
            // The Glowroot's thorny vines scratch whoever brushes past them (within a step).
            if (scanVines && id === B.GLOW_VINE && Math.abs(dx) <= 1 && Math.abs(dz) <= 1 && dy >= -1 && dy <= 2) vines = true;
          }
      if (scanVines) zone = vines ? 1 : 0;
    }
    if (lavaD < Infinity) {
      p.kind = 'lava';
      p.strength = Math.max(p.strength, BIOMES.magmaVeins.hazard.strength);
      zone = Math.max(zone, Math.max(0, 1 - lavaD / 6));
    } else if (p.kind === 'lava') zone = Math.min(zone, 0.3);
    p.zone = zone;
    p.nearWarmth = warm;
  }

  /** The hazard zone the explorer stands in (layout.hazards), for its warning. */
  private zoneIn: WorldHazard | null = null;
  private readonly zoneWarnedAt = new Map<string, number>();

  /**
   * Walking into a hazard zone of WORLD's (a sheer drop, a loose roof, cold water, a gas pocket, lava):
   * one line on what it does and what answers it, the first time in each stratum and then at most
   * every five minutes per kind.
   */
  private enterZone(kind: WorldHazard | null): void {
    if (kind === this.zoneIn) return;
    this.zoneIn = kind;
    if (!kind || !ZONE_LINE[kind]) return;
    const key = `${this.host.strata?.current ?? this.stratum}:${kind}`;
    const last = this.zoneWarnedAt.get(key);
    if (last !== undefined && this.clock - last < 300) return;
    this.zoneWarnedAt.set(key, this.clock);
    this.host.bus.emit('guide:hint', { id: `zone:${kind}`, text: t(ZONE_LINE[kind] as TextKey), target: null });
  }

  /**
   * What the quests read. One object with live getters (never a stale snapshot, even between two
   * frames); only the lair list is cached, per loaded layout.
   */
  private questWorld(): QuestWorld {
    if (this.qworld) return this.qworld;
    const loop = this;
    const st = () => loop.host.strata ?? null;
    const layout = () => st()?.layout ?? null;
    this.qworld = {
      get stratum() {
        return st()?.current ?? loop.stratum;
      },
      get deepest() {
        return Math.max(st()?.deepest ?? 1, loop.deepest);
      },
      get lairs() {
        return loop.lairsOf(layout());
      },
      revealed: (id) => st()?.isRevealed(id) ?? false,
      get gate() {
        const g = layout()?.gate ?? null;
        if (!g) return null;
        const c = loop.gateCache;
        if (c.src !== g) {
          c.src = g;
          c.value = { x: g.stand[0], y: g.stand[1], z: g.stand[2], next: g.next };
        }
        return c.value;
      },
      get gateOpen() {
        const s = st();
        return s ? s.gateOpen() : false;
      },
      get heart() {
        const h = layout()?.heart ?? null;
        return h ? { x: h.centre[0], y: h.centre[1], z: h.centre[2] } : null;
      },
      get pickTier() {
        return loop.gear.tier('pick');
      },
      get at() {
        return loop.host.player;
      },
      get biome() {
        const b = st()?.biomeHere ?? null;
        return b && b !== 'heart' ? (b as QuestWorld['biome']) : null;
      },
      get bestiaryFound() {
        return loop.bestiaryFound;
      },
      pageOf: (propId) => {
        const m = /page_(\d+)/.exec(propId);
        if (m) return Number(m[1]);
        const pg = layout()?.pages.find((x) => x.prop === propId || x.id === propId);
        return pg ? pg.n : null;
      },
      pagesIn: (b) => layout()?.pages.filter((x) => x.biome === b).length ?? 0,
      get fullSet() {
        return loop.gear.fullSet() !== null;
      },
      get counters() {
        return loop.counters;
      },
      get places() {
        return loop.placesOf(layout());
      },
      nearestVein: () => loop.nearestVein(),
      foe: () => loop.nearestFoe(),
      armed: () => loop.armed(),
      firstWeapon: () => loop.firstWeapon(),
      advice: () => loop.advice(),
      legacyFeats: () => {
        const f = (loop.host as { progression?: { extra?: { feats?: unknown } } }).progression?.extra?.feats;
        return Array.isArray(f) ? f.filter((x): x is string => typeof x === 'string') : [];
      },
    };
    return this.qworld;
  }

  /**
   * A craft the descent needs now, for the side tracker (only what the Crafting menu already shows,
   * so the explorer can act on it): (1) the weapon band of the deepest stratum when none of it is
   * owned and a guardian is next; (2) the next missing piece of the set that wards the deepest
   * stratum's hazard (Fur in IV, Bog in V, Ember in VI); (3) a brighter lantern a stratum behind;
   * (4) an Outpost Kit in a stratum below the first with none set up.
   */
  advice(): Advice | null {
    const deep = Math.max(this.deepest, this.host.strata?.deepest ?? 1);
    const visible = (item: ItemId) => RECIPES.some((r) => r.output.item === item && this.unlockedCache.has(r.id));
    const station = (item: ItemId) => {
      const r = RECIPES.find((x) => x.output.item === item && this.unlockedCache.has(x.id));
      return r ? t(STATIONS[r.station].name) : '';
    };
    const step = this.quests.mainRawStep().step;
    // Every input of the item's recipe already met (the Machete shows from the start, but the lairs
    // step suggests it only once the explorer has seen what it takes; a guardian step always does).
    const met = (item: ItemId) => RECIPES.some((r) => r.output.item === item && this.unlockedCache.has(r.id) && recipeInputs(r).every(([id]) => this.known.has(id)));
    // (1) The weapon band: strata I-II band 1, III-IV band 2, V-VI band 3.
    if (step === 'guardian' || step === 'lairs' || step === 'heart' || step === 'boss') {
      const band = deep <= 2 ? 1 : deep <= 4 ? 2 : 3;
      const ofBand = (CATALOGUE as readonly ItemId[]).filter((id) => ITEMS[id].equip === 'weapon' && (ITEMS[id].tier ?? 1) >= band);
      if (!ofBand.some((id) => this.gear.owned.has(id))) {
        const next = ofBand.filter((id) => (ITEMS[id].tier ?? 1) === band).find((id) => (step === 'lairs' ? met(id) : visible(id)));
        if (next) return { why: 'weapon', item: next, station: station(next) };
      }
    }
    // (2) The ward of the deepest stratum's hazard.
    const SET: Partial<Record<number, { set: keyof typeof ARMOUR_SETS; hazard: HazardKind }>> = { 4: { set: 'fur', hazard: 'cold' }, 5: { set: 'bog', hazard: 'gas' }, 6: { set: 'ember', hazard: 'heat' } };
    const need = SET[deep];
    if (need) {
      const pieces = ARMOUR_SETS[need.set].pieces;
      for (const slot of ['chest', 'head', 'feet'] as const) {
        const id = pieces[slot];
        if (!this.gear.owned.has(id) && visible(id)) return { why: 'armour', item: id, station: station(id), hazard: t(`hazard.noun.${need.hazard}` as TextKey) };
      }
    }
    // (3) A lantern a stratum behind (tier 1 in II, 2 in III...).
    const lt = this.gear.tier('lantern');
    if (deep >= 2 && lt < Math.min(5, deep)) {
      const next = (CATALOGUE as readonly ItemId[]).find((id) => ITEMS[id].equip === 'lantern' && (ITEMS[id].tier ?? 1) === lt + 1);
      if (next && visible(next)) return { why: 'lantern', item: next, station: station(next) };
    }
    // (4) An outpost in the stratum the explorer is in (below the first).
    const here = this.host.strata?.current ?? this.stratum;
    if (here >= 2 && !this.outposts.some((o) => o.stratum === here) && this.host.backpack.count('outpostKit') === 0 && visible('outpostKit')) return { why: 'outpost', item: 'outpostKit', station: station('outpostKit') };
    return null;
  }

  private veinCache: { t: number; x: number; y: number; z: number; at: { x: number; y: number; z: number } | null } = { t: -Infinity, x: 0, y: 0, z: 0, at: null };

  /** The nearest monster within FOE_RANGE m (MOBS' list), for the tutorial's fight step; null when none. */
  nearestFoe(): { x: number; y: number; z: number } | null {
    const mobs = (this.host.mobs ?? null) as CompanionHooks | null;
    if (!mobs || typeof mobs.list !== 'function') return null;
    const p = this.host.player;
    let best: { x: number; y: number; z: number } | null = null;
    let bd = FOE_RANGE * FOE_RANGE;
    for (const m of mobs.list()) {
      if (!m.hostile || m.state === 'dying') continue;
      const d = (m.position.x - p.x) ** 2 + (m.position.y - p.y) ** 2 + (m.position.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = { x: m.position.x, y: m.position.y, z: m.position.z };
      }
    }
    return best;
  }

  /**
   * The nearest vein (an ore block with an open face) the pick can break within VEIN_RANGE m: the
   * tutorial's mining step points the compass at it. Searched in growing shells, at most every
   * VEIN_EVERY s or after a few metres walked; a vein just mined is looked for again at once.
   */
  nearestVein(): { x: number; y: number; z: number } | null {
    const w = this.host.session?.world;
    if (!w) return null;
    const p = this.host.player;
    const c = this.veinCache;
    const gone = c.at && !ORE_BLOCK[w.get(Math.floor(c.at.x), Math.floor(c.at.y), Math.floor(c.at.z)) & 255];
    if (!gone && this.clock - c.t < VEIN_EVERY && (p.x - c.x) ** 2 + (p.z - c.z) ** 2 < 9) return c.at;
    c.t = this.clock;
    c.x = p.x;
    c.y = p.y;
    c.z = p.z;
    c.at = null;
    const tier = this.gear.tier('pick');
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y + 1);
    const cz = Math.floor(p.z);
    let best = Infinity;
    for (let r = 4; r <= VEIN_RANGE && c.at === null; r += 6) {
      for (let dy = -Math.min(r, 6); dy <= Math.min(r, 8); dy++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            const d2 = dx * dx + dy * dy * 2 + dz * dz;
            if (d2 >= best || d2 > r * r) continue;
            const x = cx + dx;
            const y = cy + dy;
            const z = cz + dz;
            const id = w.get(x, y, z) & 255;
            if (!ORE_BLOCK[id] || blockDef(id).tier > tier) continue;
            if (SOLID[w.get(x + 1, y, z)] && SOLID[w.get(x - 1, y, z)] && SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] && SOLID[w.get(x, y, z + 1)] && SOLID[w.get(x, y, z - 1)]) continue;
            best = d2;
            c.at = { x: x + 0.5, y: y + 0.5, z: z + 0.5 };
          }
    }
    return c.at;
  }

  private placeCache: { layout: StratumLayout | null; list: Array<{ id: string; biome: BiomeKey }> | undefined } = { layout: null, list: undefined };

  /** The loaded layout's named places (cached per layout). */
  private placesOf(layout: StratumLayout | null): Array<{ id: string; biome: BiomeKey }> | undefined {
    const c = this.placeCache;
    if (c.layout === layout && c.list) return c.list;
    c.layout = layout;
    c.list = layout ? (layout.sites ?? []).filter((x) => !!x.name).map((x) => ({ id: x.id, biome: x.biome as BiomeKey })) : undefined;
    return c.list;
  }

  private readonly gateCache: { src: unknown; value: QuestWorld['gate'] } = { src: null, value: null };
  private lairCache: { layout: StratumLayout | null; list: QuestWorld['lairs'] } = { layout: null, list: [] };

  /** The loaded layout's lairs as the quests read them (cached per layout). */
  private lairsOf(layout: StratumLayout | null): QuestWorld['lairs'] {
    const c = this.lairCache;
    if (c.layout === layout) return c.list;
    c.layout = layout;
    c.list = layout
      ? layout.lairs.map((l) => ({ id: l.id, biome: l.biome as Exclude<BiomeId, 'heart'>, guardian: l.guardian, x: l.entrance[0], y: l.entrance[1], z: l.entrance[2] }))
      : [];
    return c.list;
  }

  /**
   * What the HUD shows of the loop this frame (reused object): the tracker's main step and side
   * task, the tutorial step, the compass to the main target (bearing relative to the view yaw, the
   * camera's convention: forward = (-sin yaw, -cos yaw)), the hazard meter.
   */
  hud(yaw: number): LoopHud {
    const o = this.hudOut;
    o.main = this.quests.main();
    o.side = this.quests.side();
    o.tutorial = this.quests.tutorial();
    const tg = o.main.target;
    const st = this.host.strata ?? null;
    const here = st?.current ?? this.stratum;
    if (tg && tg.stratum === here) {
      const p = this.host.player;
      const dx = tg.x - p.x;
      const dz = tg.z - p.z;
      const forward = Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
      const target = Math.atan2(dx, dz);
      let b = forward - target;
      while (b > Math.PI) b -= Math.PI * 2;
      while (b < -Math.PI) b += Math.PI * 2;
      const c = o.compass ?? { bearing: 0, distance: 0, kind: tg.kind };
      c.bearing = b;
      c.distance = Math.hypot(dx, tg.y - p.y, dz);
      c.kind = tg.kind;
      o.compass = c;
    } else o.compass = null;
    o.hazard.kind = this.hazards.active;
    o.hazard.level = this.hazards.meter;
    o.hazard.warded = o.hazard.kind ? this.wards[o.hazard.kind] ?? 0 : 0;
    return o;
  }

  toSave(): LoopSave {
    return {
      v: 1,
      gear: this.gear.toJSON(),
      hotbar: this.hotbar.toJSON(),
      known: [...this.known],
      seenRecipes: [...this.seenRecipes],
      stations: this.stations.map((s) => ({ ...s })),
      outposts: this.outposts.map((o) => ({ ...o })),
      bed: this.bed,
      stratum: this.stratum,
      deepest: this.deepest,
      wards: { ...this.wards },
      counters: { ...this.counters },
      seed: this.seed,
      bestiaryFound: this.bestiaryFound,
      quests: this.quests.toSave(),
      camp: this.camp.toJSON(),
      sockets: this.sockets.toJSON(),
      trips: this.trip.toJSON(),
      daily: { run: this.dailyRun ? { ...this.dailyRun, mods: [...this.dailyRun.mods] } : null, best: { ...this.dailyBest } },
      tips: this.guide.toSave(),
      hp: this.host.health.current,
    };
  }

  /** Restore (a missing or damaged slice gives a fresh loop; tool tiers of an older save become gear). */
  fromSave(x: unknown): void {
    this.reset();
    const o = x && typeof x === 'object' ? (x as Partial<LoopSave>) : {};
    const tiers = this.host.equipment.tiers;
    this.gear = Gear.fromJSON(o.gear, { pickaxe: tiers.pickaxe, lantern: tiers.lantern, pack: tiers.pack });
    this.hotbar.load(o.hotbar);
    if (Array.isArray(o.known)) for (const id of o.known) if (isItem(id)) this.known.add(id);
    for (const id of Object.keys(this.host.backpack.totals()) as ItemId[]) this.known.add(id);
    for (const id of Object.keys(this.host.storage.toJSON()) as ItemId[]) this.known.add(id);
    if (Array.isArray(o.seenRecipes)) for (const id of o.seenRecipes) if (typeof id === 'string') this.seenRecipes.add(id);
    const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    const pt = (p: unknown): p is { x: number; y: number; z: number; stratum: number } =>
      !!p && typeof p === 'object' && num((p as { x: unknown }).x) && num((p as { y: unknown }).y) && num((p as { z: unknown }).z) && num((p as { stratum: unknown }).stratum);
    if (Array.isArray(o.stations))
      this.stations = o.stations
        .filter((s): s is PlacedStation => pt(s) && STATION_IDS.includes((s as PlacedStation).station))
        .map((s) => ({ ...s, id: typeof s.id === 'string' ? s.id : `station:${s.stratum}:${++this.placedSeq}`, rotY: num(s.rotY) ? s.rotY : 0 }));
    this.placedSeq = Math.max(this.placedSeq, ...this.stations.map((s) => Number(/:(\d+)$/.exec(s.id)?.[1] ?? 0)));
    if (Array.isArray(o.outposts)) this.outposts = o.outposts.filter((s): s is Outpost => pt(s) && typeof (s as Outpost).id === 'string').map((s) => ({ ...s, rotY: num(s.rotY) ? s.rotY : 0 }));
    this.bed = typeof o.bed === 'string' && this.outposts.some((p) => p.id === o.bed) ? o.bed : null;
    this.deepest = num(o.deepest) ? Math.max(1, Math.min(6, Math.floor(o.deepest as number))) : 1;
    this.stratum = num(o.stratum) ? Math.max(1, Math.min(6, Math.floor(o.stratum as number))) : 1;
    if (o.wards && typeof o.wards === 'object') for (const [k, v] of Object.entries(o.wards)) if (num(v) && (v as number) > 0 && ['cold', 'gas', 'heat', 'dark'].includes(k)) this.wards[k as HazardKind] = v as number;
    if (o.counters && typeof o.counters === 'object') for (const k of Object.keys(ZERO_COUNTERS) as Array<keyof LoopCounters>) {
      const v = (o.counters as unknown as Record<string, unknown>)[k];
      if (num(v) && (v as number) >= 0) this.counters[k] = Math.floor(v as number);
    }
    this.seed = num(o.seed) ? (o.seed as number) >>> 0 : this.seed;
    this.bestiaryFound = num(o.bestiaryFound) ? Math.max(0, Math.floor(o.bestiaryFound as number)) : 0;
    this.quests.fromSave(o.quests, this.seed);
    this.camp.load(o.camp);
    if (this.camp.offers.length === 0) this.camp.restock(this.seed, this.deepest);
    this.sockets.load(o.sockets);
    this.trip.load(o.trips);
    this.loadDaily(o.daily);
    this.guide.fromSave(o.tips);
    this.unlockedCache.clear();
    for (const r of RECIPES) if (isUnlocked(r, this.unlockCtx())) this.unlockedCache.add(r.id);
    this.syncGear(false);
    if (num(o.hp) && (o.hp as number) > this.host.health.current) this.host.health.heal((o.hp as number) - this.host.health.current);
  }
}
