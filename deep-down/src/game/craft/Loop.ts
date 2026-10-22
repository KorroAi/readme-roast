import { packForTier, lanternForTier, PLAYER } from '../../config/balance';
import { ARMOUR_SETS } from '../../config/armour';
import { CATALOGUE, INVENTORY_CATEGORIES, ITEMS, isItem, type EquipSlot, type HazardKind, type InventoryCategory, type ItemId } from '../../config/items';
import { RECIPES, RECIPE_CATEGORIES, recipeInputs, type Recipe } from '../../config/recipes';
import { OUTPOST, STATIONS, STATION_IDS, stationOfItem, type StationId } from '../../config/stations';
import { WEAPONS, bestWeapon, type Weapon, type WeaponId } from '../../config/weapons';
import { BIOMES, type BiomeId } from '../../config/biomes';
import { B } from '../../config/blocks';
import type { Reward } from '../../config/quests';
import { Hazards, type HazardProbe, type WorldHazard } from '../../gameplay/Hazards';
import { Quests, type QuestWorld } from '../quests/Quests';
import { Guide } from '../quests/Guide';
import type { LoopHud } from '../quests/types';
import type { StratumLayout } from '../../world/gen/strata/types';
import type { EventBus, GameEvents } from '../../core/events';
import { t, type TextKey } from '../../i18n';
import { Gear, EQUIP_SLOTS, type GearSave } from '../../gameplay/Gear';
import type { Backpack } from '../../gameplay/Inventory';
import type { CampStorage } from '../../gameplay/Storage';
import type { Equipment } from '../../gameplay/Equipment';
import type { Health } from '../../gameplay/Health';
import type { Lantern } from '../../gameplay/Lantern';
import type { HudSlot } from '../../ui/types';
import { Craft, isUnlocked } from './CraftSystem';
import { Hotbar, HOTBAR_SIZE, type HotbarSave } from './Hotbar';
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
  /** The voxels, for the hazard probes (torch warmth, lava heat). */
  readonly session?: { world: { get(x: number, y: number, z: number): number } } | null;
}

/** The parts of WORLD's StratumManager the loop reads (game/Stratum). */
export interface StrataLike {
  readonly current: number;
  readonly deepest: number;
  readonly layout: StratumLayout | null;
  readonly biomeHere: BiomeId | null;
  isRevealed(lairId: string): boolean;
  gateOpen(): boolean;
  openGate(): boolean;
  descend(): Promise<boolean>;
  addOutpost?(id: string, x: number, y: number, z: number): unknown;
}

/** A station placed in the world (Place on a Furnace, Forge or Alchemy Table item). */
export interface PlacedStation {
  station: StationId;
  stratum: number;
  x: number;
  y: number;
  z: number;
}

/** An outpost (the Outpost Kit, placed). */
export interface Outpost {
  id: string;
  stratum: number;
  x: number;
  y: number;
  z: number;
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
}

const ZERO_COUNTERS: LoopCounters = { crafted: 0, smelted: 0, torches: 0, placed: 0, outposts: 0, used: 0 };

const CAT_KEY: Record<string, TextKey> = {
  tools: 'craft3.cat.tools', weapons: 'craft3.cat.weapons', armour: 'craft3.cat.armour', lanterns: 'craft3.cat.lanterns',
  consumables: 'craft3.cat.consumables', building: 'craft3.cat.building', stations: 'craft3.cat.stations', smelting: 'craft3.cat.smelting',
};
const BAG_KEY: Record<InventoryCategory, TextKey> = {
  materials: 'bag3.cat.materials', gear: 'bag3.cat.gear', consumables: 'bag3.cat.consumables', building: 'bag3.cat.building', key: 'bag3.cat.key',
};
const SLOT_KEY: Record<EquipSlot, TextKey> = {
  pick: 'gear3.pick', weapon: 'gear3.weapon', lantern: 'gear3.lantern', pack: 'gear3.pack', head: 'gear3.head', chest: 'gear3.chest', feet: 'gear3.feet',
};

const dist2 = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

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
  private qworldT = -1;
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
    });
    this.guide = new Guide(host.bus);
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
    bus.on('mob:bestiary', (e) => {
      if (e.page === 'new') this.bestiaryFound = Math.max(this.bestiaryFound + 1, e.found);
    });
    bus.on('world:stratum', (e) => this.enterStratum(e.stratum));
    this.quests.wire();
    this.guide.wire();
    bus.on('player:placed', (e) => {
      this.counters.placed++;
      if (e.item === 'torch') this.counters.torches++;
    });
  }

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
    this.bed = null;
    this.stratum = 1;
    this.deepest = 1;
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
    this.reset();
    this.quests.reset(this.seed, tutorial);
    for (const id of Object.keys(this.host.backpack.totals()) as ItemId[]) this.learn(id);
    this.pay(gift, 'starter');
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
    return bestWeapon(owned, distance, this.gear.equipped.weapon);
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

  private unlockCtx(): Pick<CraftContext, 'known' | 'stratum'> {
    return { known: this.known, stratum: this.deepest };
  }

  /** Apply the gear to the tools the rest of the game reads (mining tier, lantern, bag size, health). */
  syncGear(heal = true): void {
    const h = this.host;
    h.equipment.upgrade('pickaxe', this.gear.tier('pick'));
    h.equipment.upgrade('lantern', this.gear.tier('lantern'));
    h.equipment.upgrade('pack', this.gear.tier('pack'));
    const pack = packForTier(Math.max(this.gear.tier('pack'), h.equipment.tier('pack')));
    if (h.backpack.slotCount < pack.slots) h.backpack.resize(pack.slots, pack.pouch);
    const max = PLAYER.maxHealth + this.gear.bonusHealth() + this.bonusHealth;
    h.health.setMax(max, heal);
    h.health.armour = this.gear.armour();
  }

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
    const p = this.host.player;
    for (const s of this.stations) {
      if (s.stratum !== this.stratum) continue;
      if (dist2(s, p) <= STATIONS[s.station].reach ** 2) set.add(s.station);
    }
    return set;
  }

  /** Record a placed station (the prop is WORLD's/VIS's to draw). */
  placeStation(station: StationId, at: { x: number; y: number; z: number }): PlacedStation {
    const s: PlacedStation = { station, stratum: this.stratum, x: at.x, y: at.y, z: at.z };
    this.stations.push(s);
    this.host.bus.emit('station:placed', { station, x: at.x, y: at.y, z: at.z, stratum: this.stratum });
    return s;
  }

  /** Set up an outpost (the kit placed). @returns null when the stratum has its maximum. */
  placeOutpost(at: { x: number; y: number; z: number }): Outpost | null {
    if (this.outposts.filter((o) => o.stratum === this.stratum).length >= OUTPOST.maxPerStratum) return null;
    const o: Outpost = { id: `outpost:${this.stratum}:${this.counters.outposts + 1}`, stratum: this.stratum, x: at.x, y: at.y, z: at.z };
    this.outposts.push(o);
    this.counters.outposts++;
    this.bed = o.id;
    this.host.strata?.addOutpost?.(o.id, at.x, at.y, at.z);
    this.host.bus.emit('station:placed', { station: 'outpost', x: at.x, y: at.y, z: at.z, stratum: this.stratum });
    return o;
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

  craftContext(): CraftContext {
    return {
      bag: this.bagStore,
      bank: this.bankHere() ? this.bankStore : null,
      stations: this.stationsNear(),
      known: this.known,
      stratum: this.deepest,
      owned: this.gear.owned,
    };
  }

  craft(recipeId: string, times = 1): CraftOutcome {
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
      this.host.bus.emit('toast', { text: t('craft3.made', { count: out.added, item: t(ITEMS[item].name) }), tone: 'good' });
    }
    this.counters.crafted += out.made;
    if (rec.category === 'smelting') this.counters.smelted += out.made;
    this.host.bus.emit('craft:made', { recipe: rec.id, item, times: out.made, count: out.made * rec.output.count });
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
    cards.sort((a, b) => Number(b.state === 'ok') - Number(a.state === 'ok'));
    const categories = RECIPE_CATEGORIES.map((id) => ({
      id,
      name: t(CAT_KEY[id]),
      ready: cards.filter((c) => c.category === id && c.state === 'ok').length,
      total: cards.filter((c) => c.category === id).length,
    }));
    const near = this.stationsNear();
    return { categories, cards, stations: STATION_IDS.map((id) => ({ id, name: t(STATIONS[id].name), near: near.has(id) })), bank: ctx.bank !== null };
  }

  /** Mark every visible recipe as seen (the menu was opened). */
  markRecipesSeen(): void {
    for (const id of this.unlockedCache) this.seenRecipes.add(id);
  }

  private card(r: Recipe, state: RecipeCardView['state'], have: Partial<Record<ItemId, number>>, max: number, fuelHave: number): RecipeCardView {
    const out = ITEMS[r.output.item];
    const inputs = recipeInputs(r).map(([item, need]) => ({ item, name: t(ITEMS[item].name), have: have[item] ?? 0, need }));
    let reason: string | null = null;
    if (state === 'station') reason = t('craft3.needStation', { station: t(STATIONS[r.station].name) });
    else if (state === 'missing') reason = t('craft3.missing', { items: inputs.filter((c) => c.have < c.need).map((c) => `${c.need - c.have} ${c.name}`).join(', ') });
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
      return w ? t('craft3.stat.weapon', { damage: w.damage, reach: w.reach }) : null;
    }
    if (d.equip === 'head' || d.equip === 'chest' || d.equip === 'feet') {
      for (const set of Object.values(ARMOUR_SETS)) if (Object.values(set.pieces).includes(item)) return t('craft3.stat.armour', { armour: 0, set: t(set.name) }).replace(' 0%', '');
    }
    if (d.use?.kind === 'heal') return t('craft3.stat.heal', { amount: d.use.amount });
    if (d.use?.kind === 'ward') return t('craft3.stat.ward', { hazard: t(`hazard.${d.use.hazard}` as TextKey), seconds: d.use.seconds });
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

  /** A bomb or flare was thrown by the hub: spend one. */
  consumeThrown(item: ItemId): boolean {
    if (this.host.backpack.remove(item, 1) !== 1) return false;
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

  /** Bank everything but what the hotbar holds (camp, outpost). @returns items moved. */
  bankAll(): number {
    if (!this.bankHere()) return 0;
    const keep = new Set<ItemId>();
    for (let i = 2; i < HOTBAR_SIZE; i++) {
      const id = this.hotbar.itemAt(i);
      if (id) keep.add(id);
    }
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
      items[d.category].push({ item: id, count: owned ? 1 : count, name: t(d.name), desc: t(d.desc), category: d.category, grade: d.grade, actions, equipped });
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
    for (const k of Object.keys(this.wards) as HazardKind[]) {
      const left = (this.wards[k] ?? 0) - dt;
      if (left > 0) this.wards[k] = left;
      else delete this.wards[k];
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
    h.lanternFuel.burn = step.burn;
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
    this.quests.update(dt);
    const main = this.quests.mainRawStep();
    const mv = this.quests.main();
    this.guide.update(dt, { mainId: main.id, mainStep: main.step, mainText: mv.text, flame: h.lanternFuel.fraction, health: h.health.fraction, inCamp: h.inCamp, playing });
  }

  /** Sample the world round the explorer for the hazards (biome, zones, lava, warmth). */
  private refreshProbe(): void {
    const h = this.host;
    const p = this.probe;
    const at = h.player;
    p.moving = (at.x - this.lastPos.x) ** 2 + (at.z - this.lastPos.z) ** 2 > 0.04;
    this.lastPos = { x: at.x, y: at.y, z: at.z };
    const wards = this.gear.wards();
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
      return;
    }
    const hz = BIOMES[biome].hazard;
    p.kind = hz.kind as WorldHazard;
    p.strength = hz.strength;
    // Local intensity: WORLD's pockets; biome-wide hazards are everywhere in the biome.
    let zone = p.kind === 'cold' || p.kind === 'dark' || p.kind === 'void' || p.kind === 'falls' || p.kind === 'rockfall' ? 1 : 0;
    for (const z of layout.hazards) {
      const d = Math.hypot(at.x - z.centre[0], (at.y - z.centre[1]) * 1.4, at.z - z.centre[2]);
      if (d < z.radius) {
        const k = z.kind as WorldHazard;
        if (k !== p.kind && k !== 'none') {
          // A pocket of another kind (a lava river in the Abyss) takes over while you stand in it.
          p.kind = k;
          p.strength = Math.max(p.strength, z.strength);
        }
        zone = Math.max(zone, (1 - d / z.radius) * 0.5 + 0.5);
      }
    }
    // Lava heat and warmth from the voxels (a 13 m cube for lava, 9 m for torches).
    const w = h.session?.world;
    let lavaD = Infinity;
    let warm = h.inCamp || this.outpostNear(OUTPOST.useRadius + 2) !== null;
    p.inLava = false;
    if (w) {
      const cx = Math.floor(at.x);
      const cy = Math.floor(at.y);
      const cz = Math.floor(at.z);
      p.inLava = w.get(cx, cy, cz) === B.LAVA || w.get(cx, cy - 1, cz) === B.LAVA;
      const scanLava = p.kind === 'lava' || biome === 'magmaVeins' || biome === 'heart';
      for (let dy = -3; dy <= 3; dy++)
        for (let dz = -6; dz <= 6; dz++)
          for (let dx = -6; dx <= 6; dx++) {
            const id = w.get(cx + dx, cy + dy, cz + dz);
            if (id === B.TORCH && !warm && Math.abs(dx) <= 4 && Math.abs(dz) <= 4) warm = true;
            if (scanLava && id === B.LAVA) lavaD = Math.min(lavaD, Math.hypot(dx, dy, dz));
          }
    }
    if (lavaD < Infinity) {
      p.kind = 'lava';
      p.strength = Math.max(p.strength, BIOMES.magmaVeins.hazard.strength);
      zone = Math.max(zone, Math.max(0, 1 - lavaD / 6));
    } else if (p.kind === 'lava') zone = Math.min(zone, 0.3);
    p.zone = zone;
    p.nearWarmth = warm;
  }

  /** What the quests read (rebuilt at most once a frame). */
  private questWorld(): QuestWorld {
    if (this.qworld && this.qworldT === this.clock) return this.qworld;
    const st = this.host.strata ?? null;
    const layout = st?.layout ?? null;
    const lairs = layout
      ? layout.lairs.map((l) => ({ id: l.id, biome: l.biome as Exclude<BiomeId, 'heart'>, guardian: l.guardian, x: l.entrance[0], y: l.entrance[1], z: l.entrance[2] }))
      : [];
    const g = layout?.gate ?? null;
    this.qworld = {
      stratum: st?.current ?? this.stratum,
      deepest: Math.max(st?.deepest ?? 1, this.deepest),
      lairs,
      revealed: (id) => st?.isRevealed(id) ?? false,
      gate: g ? { x: g.stand[0], y: g.stand[1], z: g.stand[2], next: g.next } : null,
      gateOpen: st ? st.gateOpen() : false,
      heart: layout?.heart ? { x: layout.heart.centre[0], y: layout.heart.centre[1], z: layout.heart.centre[2] } : null,
      pickTier: this.gear.tier('pick'),
      at: this.host.player,
      biome: st?.biomeHere && st.biomeHere !== 'heart' ? (st.biomeHere as QuestWorld['biome']) : null,
      bestiaryFound: this.bestiaryFound,
      pageOf: (propId) => {
        const m = /page_(\d+)/.exec(propId);
        if (m) return Number(m[1]);
        const pg = layout?.pages.find((x) => x.prop === propId || x.id === propId);
        return pg ? pg.n : null;
      },
      pagesIn: (b) => layout?.pages.filter((x) => x.biome === b).length ?? 0,
      fullSet: this.gear.fullSet() !== null,
      counters: this.counters,
    };
    this.qworldT = this.clock;
    return this.qworld;
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
    if (Array.isArray(o.stations)) this.stations = o.stations.filter((s): s is PlacedStation => pt(s) && STATION_IDS.includes((s as PlacedStation).station)).map((s) => ({ ...s }));
    if (Array.isArray(o.outposts)) this.outposts = o.outposts.filter((s): s is Outpost => pt(s) && typeof (s as Outpost).id === 'string').map((s) => ({ ...s }));
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
    this.guide.fromSave(o.tips);
    this.unlockedCache.clear();
    for (const r of RECIPES) if (isUnlocked(r, this.unlockCtx())) this.unlockedCache.add(r.id);
    this.syncGear(false);
    if (num(o.hp) && (o.hp as number) > this.host.health.current) this.host.health.heal((o.hp as number) - this.host.health.current);
  }
}
