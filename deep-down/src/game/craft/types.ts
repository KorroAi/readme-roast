/**
 * Round 3 seam (LOOP): crafting, the bag, the bank, gear and the hotbar (BRIEF §2).
 *
 * The data are in config/items (ItemId, ItemDef with category, stack, use, place, equip),
 * config/recipes (RECIPES: category, station, inputs, output, fuel, unlock) and config/stations.
 * This file is the contract the UI's menus and the Game hub read:
 *
 * - `CraftSystem.can / craft` (game/craft/CraftSystem): the rules, pure.
 * - `Hotbar` (game/craft/Hotbar): 6 slots (pick, weapon, bombs, torches, food, free).
 * - The views (`CraftMenuView`, `BagView`, `HotbarView`): snapshots the menus render; the UI never
 *   changes game state, it calls `LoopActions`.
 * - `Loop` (game/craft/Loop, created by Game in a `// LOOP:` block) implements `LoopActions` and
 *   builds the views; `game.loop` is how UI reaches it.
 */
import type { EquipSlot, InventoryCategory, ItemId } from '../../config/items';
import type { Recipe, RecipeCategory } from '../../config/recipes';
import type { StationId } from '../../config/stations';
import type { Rarity } from '../../config/rarity';
import type { ArmourSetId } from '../../config/armour';

export type { EquipSlot, InventoryCategory, ItemId } from '../../config/items';
export type { Recipe, RecipeCategory } from '../../config/recipes';
export type { StationId } from '../../config/stations';

export type ItemCounts = Partial<Record<ItemId, number>>;

/** A store of items the craft rules can read and spend from (the bag, the bank). */
export interface ItemStore {
  count(item: ItemId): number;
  /** @returns how many were removed. */
  remove(item: ItemId, count: number): number;
  /** @returns how many were added (a full bag adds fewer). */
  add(item: ItemId, count: number): number;
  /** How many more of `item` fit (Infinity for the bank). */
  room(item: ItemId): number;
}

/** What the craft rules read. */
export interface CraftContext {
  bag: ItemStore;
  /** The bank, when the explorer is at the camp or an outpost (null elsewhere). Spent first. */
  bank: ItemStore | null;
  /** Stations within reach now ('hand' is always there). */
  stations: ReadonlySet<StationId>;
  /** Items ever held (recipes with unlock 'seen' appear once all their inputs are known). */
  known: ReadonlySet<ItemId>;
  /** Deepest stratum entered (1..6). */
  stratum: number;
  /** Gear already owned (a pick, lantern, pack or weapon is crafted once). */
  owned: ReadonlySet<ItemId>;
  /** Rare recipes bought from the trader (unlock 'trader'). */
  bought?: ReadonlySet<string>;
  /** Furnace fuel multiplier (the camp's chimney halves it; 1 elsewhere). */
  fuelFactor?: number;
}

/**
 * Why a recipe can or cannot be made now. Precedence: hidden > owned > station > missing > fuel > ok.
 * - hidden: not unlocked yet (the menu leaves it out);
 * - owned: gear already owned (one is enough);
 * - station: its station is not within reach;
 * - missing: materials short; fuel: the Furnace has nothing to burn.
 */
export type CraftState = 'ok' | 'hidden' | 'owned' | 'station' | 'missing' | 'fuel';

export interface CraftCheck {
  ok: boolean;
  state: CraftState;
  /** Per input: what the bag (+ bank) holds, and what is short for `times` crafts. */
  have: ItemCounts;
  missing: ItemCounts;
  /** Fuel units available and needed for `times` crafts (0 / 0 off the Furnace). */
  fuelHave: number;
  fuelNeed: number;
  /** How many times it could be made right now (0 when not ok; capped at 99). */
  max: number;
}

export interface CraftOutcome {
  ok: boolean;
  /** Crafts made (≤ the times asked). */
  made: number;
  /** Output items added (made × output count; less only if the bag was full and no bank). */
  added: number;
  check: CraftCheck;
}

export interface CraftSystem {
  can(recipe: Recipe | string, ctx: CraftContext, times?: number): CraftCheck;
  craft(recipe: Recipe | string, ctx: CraftContext, times?: number): CraftOutcome;
}

// -------------------------------------------------------------------------------------
// The hotbar

/** The default role of each slot (BRIEF §0.6); a slot may hold anything once assigned. */
export type HotbarRole = 'pick' | 'weapon' | 'bombs' | 'torches' | 'food' | 'free';
export const HOTBAR_ROLES: readonly HotbarRole[] = ['pick', 'weapon', 'bombs', 'torches', 'food', 'free'];

/** What the selected slot makes the Action and Place buttons do. */
export type HeldMode = 'mine' | 'attack' | 'throw' | 'place' | 'use' | 'none';

export interface HotbarSlotView {
  index: number;
  role: HotbarRole;
  /** The item shown (the equipped pick or weapon for those slots), null when empty. */
  item: ItemId | null;
  /** How many are in the bag (1 for gear; 0 shows the slot dimmed). */
  count: number;
  selected: boolean;
  mode: HeldMode;
}

export interface HotbarView {
  slots: HotbarSlotView[];
  selected: number;
  /** The selected slot's item and what it does. */
  held: ItemId | null;
  mode: HeldMode;
}

// -------------------------------------------------------------------------------------
// The menus' views

export interface CostView {
  item: ItemId;
  name: string;
  have: number;
  need: number;
  /** Where it is found, for a raw material ("Root Galleries", "creatures"); absent for made things. */
  from?: string;
}

export interface RecipeCardView {
  id: string;
  category: RecipeCategory;
  station: StationId;
  stationName: string;
  output: { item: ItemId; count: number; name: string; desc: string; grade: Rarity };
  inputs: CostView[];
  /** Furnace fuel for one craft, with what is on hand (null off the Furnace). */
  fuel: { have: number; need: number } | null;
  state: CraftState;
  /** A short player-facing reason it cannot be made now (null when ok). */
  reason: string | null;
  /** How many could be made now (the ×5 button needs 5). */
  max: number;
  /** Unlocked since the menu was last opened (a "new" pip). */
  fresh: boolean;
  /** For gear: what it changes, e.g. "Tier III pick", "Warmth (full set)". */
  stat: string | null;
}

export interface CraftMenuView {
  categories: Array<{ id: RecipeCategory; name: string; ready: number; total: number }>;
  /** Visible recipes (state !== 'hidden'), ready ones first, in table order. */
  cards: RecipeCardView[];
  stations: Array<{ id: StationId; name: string; near: boolean }>;
  /** The bank is in reach (materials are taken from it first). */
  bank: boolean;
  /**
   * The card the menu should open on (its tab, ringed): the tutorial's torches, the main quest's next
   * pick on its 'prepare' step. Null: no suggestion.
   */
  focus?: { category: RecipeCategory; recipe: string } | null;
}

export interface BagItemView {
  item: ItemId;
  count: number;
  name: string;
  desc: string;
  category: InventoryCategory;
  grade: Rarity;
  /** What the Inventory's detail pane offers ('socket': set a gem, see socketOptions). */
  actions: Array<'use' | 'equip' | 'place' | 'assign' | 'drop' | 'bank' | 'socket'>;
  equipped: boolean;
  /** Gear with sockets (round 3 stretch): each socket's gem (null: empty), its name and what it does. */
  sockets?: Array<{ gem: ItemId | null; name: string; fx: string }>;
}

export interface BagView {
  /** Slot grid: index-stable stacks (null = empty). */
  slots: Array<{ item: ItemId; count: number } | null>;
  used: number;
  max: number;
  /** The last `pouch` slots survive a black-out. */
  pouch: number;
  /** Items grouped by tab (bag + key items), for the categories view. */
  items: Record<InventoryCategory, BagItemView[]>;
  /** The tabs in order, with their names. */
  categories: Array<{ id: InventoryCategory; name: string; count: number }>;
  /** The bank's counts when in reach, null elsewhere. */
  bank: ItemCounts | null;
  gear: GearView;
}

export interface GearView {
  equipped: Record<EquipSlot, ItemId | null>;
  /** The slots in order with their names and what is in them (for the equipment panel). */
  slots: Array<{ slot: EquipSlot; name: string; item: ItemId | null; itemName: string }>;
  /** 0..ARMOUR_CAP: the share of creature damage the armour takes. */
  armour: number;
  /** A full set worn, and its one line. */
  set: { id: ArmourSetId; name: string; bonus: string } | null;
  /** Hazard wards from the armour, 0..1 each. */
  wards: { cold: number; gas: number; heat: number; dark: number };
  pickTier: number;
  lanternTier: number;
}

// -------------------------------------------------------------------------------------
// What the menus and the hub call (implemented by game/craft/Loop)

export interface LoopActions {
  craftView(): CraftMenuView;
  /** Make a recipe `times` (1 or 5) times. @returns the outcome (toasts and sounds are emitted). */
  craft(recipeId: string, times?: number): CraftOutcome;
  bagView(): BagView;
  hotbarView(): HotbarView;
  /** Use a consumable from the bag (food, potion, oil): false when it cannot be used now. */
  use(item: ItemId): boolean;
  /** Equip gear from the bag (the old piece goes back to the bag). */
  equip(item: ItemId): boolean;
  /** Put an item on a hotbar slot (long-press). */
  assign(slot: number, item: ItemId | null): void;
  selectHotbar(slot: number): void;
  /** Move everything in the bag but gear and consumables on the hotbar to the bank (camp, outpost). */
  bankAll(): number;
  /** Take `count` of an item from the bank into the bag. */
  withdraw(item: ItemId, count: number): number;
}

/** The Place action resolved for the held item (game/craft/Building): what to put where. */
export type PlaceRequest =
  | { kind: 'block'; item: ItemId; block: number }
  | { kind: 'torch' | 'ladder' | 'rope' | 'door'; item: ItemId; block: number }
  | { kind: 'station'; item: ItemId; station: StationId }
  | { kind: 'outpost'; item: ItemId };

declare module '../../core/events' {
  interface GameEvents {
    /** Round 3 (LOOP): a recipe was made (`times` crafts, `count` items added). */
    'craft:made': { recipe: string; item: ItemId; times: number; count: number };
    /** A consumable was used (heal, oil, ward...). */
    'item:used': { item: ItemId };
    /** Gear was equipped. */
    'gear:equipped': { item: ItemId; slot: EquipSlot };
    /** A recipe was unlocked by a new material (the menu's "new" pip, a first-time tooltip). */
    'recipe:unlocked': { recipe: string; item: ItemId };
    /** A station was placed (prop) or an outpost was set up. */
    'station:placed': { station: StationId | 'outpost'; x: number; y: number; z: number; stratum: number };
    // Round 3 stretch (LOOP). Declared optional so the exhaustive sample tables of other owners
    // (tests/unit/audio.test.ts) stay typed until they map them; listeners guard the payload.
    /** A camp upgrade was built (`level` 1..). */
    'camp:upgraded'?: { id: string; level: number };
    /** A barter with the camp's trader (`recipe`: a rare recipe learned). */
    'trade:done'?: { id: string; times: number; item: ItemId | null; recipe: string | null };
    /** A gem was set in a weapon or an armour piece. */
    'gem:socketed'?: { gem: ItemId; item: ItemId; socket: number };
    /** The explorer is back at camp: the trip's summary (game/quests Trip). */
    'trip:summary'?: { summary: import('../quests/Trip').TripSummary };
    /** The Lampling's lure was used here (MOBS tames the nearest wild Lampling). */
    'companion:lure'?: { x: number; y: number; z: number; radius: number };
    /** A treat for the companion (MOBS heals it by `heal` and gives it `xp`). */
    'companion:feed'?: { item: ItemId; xp: number; heal: number };
    /** The daily descent's goal was reached (`seconds` from its start). */
    'daily:done'?: { day: number; goal: string; seconds: number; best: boolean };
  }
}
