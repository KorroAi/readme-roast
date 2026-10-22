import type { TextKey } from '../i18n';
import type { ItemId } from './items';

/**
 * The upgrade tree (final pass W3, plan §2.3 as amended by MERGE.md): 12 nodes. The Rift Winch and
 * the Halden Lift are cut (the world's rope and hoist replace them), so prerequisite "9" is "the
 * Rift reached" (the journal's 'undercroft'), and no node is a field site today. Every node has a
 * behaviour sentence and a working effect.
 */
export type NodeId =
  | 'copperPickaxe'
  | 'sturdyPack'
  | 'copperLantern'
  | 'surveyTable'
  | 'forge'
  | 'relicShelf'
  | 'ironPickaxe'
  | 'expeditionPack'
  | 'attunedLantern'
  | 'gripBoots'
  | 'minersCoat'
  | 'glimmerPickaxe'
  // Round 2 (WORLD): the Forge's weapons, after the first iron (config/weapons), and Flash Charges.
  | 'machete'
  | 'sling'
  | 'spear'
  | 'flashCharges';

export type EquipmentSlot = 'pickaxe' | 'lantern' | 'pack';

/** Where a node is made: at camp (the Workbench, the Forge, a camp plot) or at a field site (paid from the pack). */
export type Place = 'workbench' | 'forge' | 'camp' | 'field';

/** Camp stations: built on a plot, they rise from the ground and stay. */
export type StationId = 'surveyTable' | 'forge' | 'relicShelf';

/**
 * Gear: worn or carried, changes how the explorer moves, endures or fights. The weapons (round 2)
 * are gear too: built once at the Forge and kept (config/weapons). 'flashCharges' is a repeatable
 * craft (NodeDef.repeat), never owned.
 */
export type GearId = 'gripBoots' | 'minersCoat' | 'machete' | 'sling' | 'spear' | 'flashCharges';

/** The weapon nodes (round 2). */
export const WEAPON_NODES = ['machete', 'sling', 'spear'] as const satisfies readonly NodeId[];

/** The tree's columns (the screen lays them out left to right). */
export type TreeLine = 'pickaxe' | 'lantern' | 'pack' | 'gear' | 'stations';

/** What a node gives. */
export type NodeResult =
  | { kind: 'equip'; slot: EquipmentSlot; tier: number }
  | { kind: 'station'; station: StationId }
  | { kind: 'gear'; gear: GearId };

/**
 * A prerequisite: another node, or a condition of the world.
 * - 'rift': the Rift reached (the journal entry 'undercroft': standing on the rift floor, by the rope).
 * - 'rune': a rune found (the Ancient Tablet counts).
 */
export type Prereq = NodeId | 'rift' | 'rune';

export interface NodeDef {
  id: NodeId;
  name: TextKey;
  /** One sentence: what the node changes (shown in the tree's detail pane). */
  does: TextKey;
  place: Place;
  result: NodeResult;
  inputs: Partial<Record<ItemId, number>>;
  prereqs: readonly Prereq[];
  /** Layout: the column, and the row from the top (unique within a column). */
  line: TreeLine;
  row: number;
  prio: 'must' | 'should';
  /** Tree order (economy test, the Next line's ties, the list fallback). */
  order: number;
  /** Built for free as soon as its prerequisites are met (the Relic Shelf). */
  auto?: true;
  /**
   * A repeatable craft (round 2: Flash Charges): never owned; each craft puts `count` of `item`
   * into camp storage.
   */
  repeat?: { item: ItemId; count: number };
}

export const NODES: Record<NodeId, NodeDef> = {
  copperPickaxe: {
    id: 'copperPickaxe',
    name: 'recipe.copperPickaxe',
    does: 'node.copperPickaxe.does',
    place: 'workbench',
    result: { kind: 'equip', slot: 'pickaxe', tier: 2 },
    inputs: { copperOre: 8, stone: 12 },
    prereqs: [],
    line: 'pickaxe',
    row: 1,
    prio: 'must',
    order: 0,
  },
  sturdyPack: {
    id: 'sturdyPack',
    name: 'recipe.sturdyPack',
    does: 'node.sturdyPack.does',
    place: 'workbench',
    result: { kind: 'equip', slot: 'pack', tier: 2 },
    inputs: { stone: 16, copperOre: 4, rootFibre: 4 },
    prereqs: [],
    line: 'pack',
    row: 1,
    prio: 'must',
    order: 1,
  },
  copperLantern: {
    id: 'copperLantern',
    name: 'recipe.copperLantern',
    does: 'node.copperLantern.does',
    place: 'workbench',
    result: { kind: 'equip', slot: 'lantern', tier: 2 },
    inputs: { copperOre: 6, glimmerShard: 3 },
    prereqs: [],
    line: 'lantern',
    row: 1,
    prio: 'must',
    order: 2,
  },
  surveyTable: {
    id: 'surveyTable',
    name: 'recipe.surveyTable',
    does: 'node.surveyTable.does',
    place: 'camp',
    result: { kind: 'station', station: 'surveyTable' },
    inputs: { stone: 12, copperOre: 4, glimmerShard: 2 },
    prereqs: [],
    line: 'stations',
    row: 1,
    prio: 'must',
    order: 3,
  },
  forge: {
    id: 'forge',
    name: 'recipe.forge',
    does: 'node.forge.does',
    place: 'camp',
    result: { kind: 'station', station: 'forge' },
    inputs: { stone: 24, copperOre: 6, ironOre: 3 },
    prereqs: ['copperPickaxe'],
    line: 'stations',
    row: 2,
    prio: 'must',
    order: 4,
  },
  relicShelf: {
    id: 'relicShelf',
    name: 'recipe.relicShelf',
    does: 'node.relicShelf.does',
    place: 'camp',
    result: { kind: 'station', station: 'relicShelf' },
    inputs: {},
    prereqs: ['rune'],
    line: 'stations',
    row: 0,
    prio: 'must',
    order: 5,
    auto: true,
  },
  ironPickaxe: {
    id: 'ironPickaxe',
    name: 'recipe.ironPickaxe',
    does: 'node.ironPickaxe.does',
    place: 'forge',
    result: { kind: 'equip', slot: 'pickaxe', tier: 3 },
    inputs: { ironOre: 8, copperOre: 6, stone: 10 },
    prereqs: ['forge'],
    line: 'pickaxe',
    row: 2,
    prio: 'must',
    order: 6,
  },
  expeditionPack: {
    id: 'expeditionPack',
    name: 'recipe.expeditionPack',
    does: 'node.expeditionPack.does',
    place: 'forge',
    result: { kind: 'equip', slot: 'pack', tier: 3 },
    inputs: { ironOre: 6, rootFibre: 8, stone: 10 },
    prereqs: ['sturdyPack', 'forge'],
    line: 'pack',
    row: 2,
    prio: 'must',
    order: 7,
  },
  gripBoots: {
    id: 'gripBoots',
    name: 'recipe.gripBoots',
    does: 'node.gripBoots.does',
    place: 'workbench',
    result: { kind: 'gear', gear: 'gripBoots' },
    inputs: { stone: 8, rootFibre: 6, copperOre: 3 },
    prereqs: [],
    line: 'gear',
    row: 1,
    prio: 'must',
    order: 8,
  },
  minersCoat: {
    id: 'minersCoat',
    name: 'recipe.minersCoat',
    does: 'node.minersCoat.does',
    place: 'forge',
    result: { kind: 'gear', gear: 'minersCoat' },
    inputs: { rootFibre: 6, ironOre: 4 },
    prereqs: ['forge'],
    line: 'gear',
    row: 2,
    prio: 'must',
    order: 9,
  },
  attunedLantern: {
    id: 'attunedLantern',
    name: 'recipe.attunedLantern',
    does: 'node.attunedLantern.does',
    place: 'forge',
    result: { kind: 'equip', slot: 'lantern', tier: 3 },
    inputs: { glimmerShard: 8, echoShard: 3, ironOre: 4 },
    prereqs: ['copperLantern', 'rift'],
    line: 'lantern',
    row: 3,
    prio: 'must',
    order: 10,
  },
  glimmerPickaxe: {
    id: 'glimmerPickaxe',
    name: 'recipe.glimmerPickaxe',
    does: 'node.glimmerPickaxe.does',
    place: 'forge',
    result: { kind: 'equip', slot: 'pickaxe', tier: 4 },
    inputs: { glimmerShard: 6, ironOre: 6, echoShard: 4 },
    prereqs: ['ironPickaxe', 'rift'],
    line: 'pickaxe',
    row: 3,
    prio: 'must',
    order: 11,
  },
  // Round 2 (WORLD): weapons at the Forge, a bit later in the game (the Forge needs the first iron).
  machete: {
    id: 'machete',
    name: 'recipe.machete',
    does: 'node.machete.does',
    place: 'forge',
    result: { kind: 'gear', gear: 'machete' },
    inputs: { ironOre: 4, copperOre: 3, rootFibre: 2 },
    prereqs: ['forge'],
    line: 'gear',
    row: 3,
    prio: 'must',
    order: 12,
  },
  sling: {
    id: 'sling',
    name: 'recipe.sling',
    does: 'node.sling.does',
    place: 'forge',
    result: { kind: 'gear', gear: 'sling' },
    inputs: { rootFibre: 6, copperOre: 4, glimmerShard: 2 },
    prereqs: ['forge'],
    line: 'gear',
    row: 4,
    prio: 'must',
    order: 13,
  },
  spear: {
    id: 'spear',
    name: 'recipe.spear',
    does: 'node.spear.does',
    place: 'forge',
    result: { kind: 'gear', gear: 'spear' },
    inputs: { ironOre: 6, glimmerShard: 4, gem: 2 },
    prereqs: ['machete'],
    line: 'gear',
    row: 5,
    prio: 'must',
    order: 14,
  },
  flashCharges: {
    id: 'flashCharges',
    name: 'recipe.flashCharges',
    does: 'node.flashCharges.does',
    place: 'forge',
    result: { kind: 'gear', gear: 'flashCharges' },
    inputs: { glimmerShard: 1, copperOre: 2, stone: 2 },
    prereqs: ['forge'],
    line: 'gear',
    row: 6,
    prio: 'should',
    order: 15,
    repeat: { item: 'flashCharge', count: 2 },
  },
};

/** Every node in tree order. */
export const NODE_LIST: readonly NodeDef[] = Object.values(NODES).sort((a, b) => a.order - b.order);

export const NODE_IDS: readonly NodeId[] = NODE_LIST.map((n) => n.id);

export function isNodeId(x: unknown): x is NodeId {
  return typeof x === 'string' && x in NODES;
}

/** The node that builds a station. */
export const STATION_NODE: Record<StationId, NodeId> = { surveyTable: 'surveyTable', forge: 'forge', relicShelf: 'relicShelf' };

/** The materials a node costs, as [item, count] pairs with count > 0. */
export function nodeInputs(def: NodeDef): Array<[ItemId, number]> {
  return (Object.entries(def.inputs) as Array<[ItemId, number | undefined]>).filter((e): e is [ItemId, number] => (e[1] ?? 0) > 0);
}

/** The W1 name of a node id (events and saves say 'recipe'); the data-keys stay craft:{id}. */
export type RecipeId = NodeId;

// =====================================================================================
// Round 3 (LOOP seam, BRIEF §0.4): crafting everything. The 1.x upgrade tree above (NODES) is
// legacy: the new Crafting menu reads RECIPES. Every recipe is made at a station (config/stations)
// from the bag (plus the bank when the explorer is at the camp or an outpost).
// =====================================================================================

import type { StationId as CraftStation } from './stations';

/** The Crafting menu's tabs, in order. */
export type RecipeCategory = 'tools' | 'weapons' | 'armour' | 'lanterns' | 'consumables' | 'building' | 'stations' | 'smelting';
export const RECIPE_CATEGORIES: readonly RecipeCategory[] = ['tools', 'weapons', 'armour', 'lanterns', 'consumables', 'building', 'stations', 'smelting'];

/**
 * When a recipe shows in the menu.
 * - 'start': from the first minute.
 * - 'seen': once every input has been held at least once (the default: recipes appear as the
 *   descent finds their materials, so the menu never lists what cannot be made yet).
 * - stratum: once that stratum has been entered.
 */
export type RecipeUnlock = 'start' | 'seen' | { stratum: number };

export interface Recipe {
  /** Unique: the output id, or `${output}@${n}` for an alternative recipe of the same thing. */
  id: string;
  category: RecipeCategory;
  station: CraftStation;
  inputs: Partial<Record<ItemId, number>>;
  output: { item: ItemId; count: number };
  /** Furnace fuel units per craft (coal gives 4, wood 1: ItemDef.fuel). */
  fuel?: number;
  unlock: RecipeUnlock;
}

type R = Omit<Recipe, 'id' | 'unlock' | 'output'> & { out: ItemId; n?: number; alt?: number; unlock?: RecipeUnlock };

const r = (x: R): Recipe => ({
  id: x.alt ? `${x.out}@${x.alt}` : x.out,
  category: x.category,
  station: x.station,
  inputs: x.inputs,
  output: { item: x.out, count: x.n ?? 1 },
  ...(x.fuel ? { fuel: x.fuel } : {}),
  unlock: x.unlock ?? 'seen',
});

export const RECIPES: readonly Recipe[] = [
  // --- Tools: pick I is the start; each next tier is made from the stratum it opens out of.
  r({ out: 'copperPick', category: 'tools', station: 'workbench', inputs: { copperIngot: 5, fungalWood: 3 } }),
  r({ out: 'ironPick', category: 'tools', station: 'workbench', inputs: { ironIngot: 6, heartwood: 2, goldIngot: 1 } }),
  r({ out: 'crystalPick', category: 'tools', station: 'workbench', inputs: { glimmerShard: 6, silverIngot: 3, ironIngot: 4 } }),
  r({ out: 'coldsteelPick', category: 'tools', station: 'workbench', inputs: { coldsteelIngot: 6, verdite: 2, frostCrystal: 3 } }),
  r({ out: 'sunmetalPick', category: 'tools', station: 'workbench', inputs: { sunmetalIngot: 6, orichalcum: 2, mireOpal: 2 } }),
  // --- Weapons: three per band (melee, reach, ranged), at the Forge; bombs at the Alchemy Table.
  r({ out: 'machete', category: 'weapons', station: 'forge', inputs: { copperIngot: 3, hide: 1 } }),
  r({ out: 'spear', category: 'weapons', station: 'forge', inputs: { copperIngot: 2, fungalWood: 3, fang: 1 } }),
  r({ out: 'sling', category: 'weapons', station: 'workbench', inputs: { hide: 2, fungalWood: 2 } }),
  r({ out: 'sword', category: 'weapons', station: 'forge', inputs: { silverIngot: 4, ironIngot: 3, fang: 2 } }),
  r({ out: 'crystalSpear', category: 'weapons', station: 'forge', inputs: { glimmerShard: 4, ironIngot: 3, heartwood: 2 } }),
  r({ out: 'crossbow', category: 'weapons', station: 'forge', inputs: { heartwood: 3, ironIngot: 3, chitin: 3, goldIngot: 1 } }),
  r({ out: 'greatAxe', category: 'weapons', station: 'forge', inputs: { sunmetalIngot: 4, coldsteelIngot: 3, fang: 3 } }),
  r({ out: 'sunLance', category: 'weapons', station: 'forge', inputs: { sunmetalIngot: 3, orichalcum: 2, verdite: 1 } }),
  r({ out: 'emberCrossbow', category: 'weapons', station: 'forge', inputs: { embersteelIngot: 3, starsteel: 1, heartwood: 2, chitin: 4 } }),
  r({ out: 'flashCharge', n: 2, category: 'weapons', station: 'alchemy', inputs: { sporeQuartz: 1, coal: 1 } }),
  r({ out: 'flashCharge', alt: 2, n: 2, category: 'weapons', station: 'alchemy', inputs: { glimmerShard: 1, glowcap: 2 } }),
  r({ out: 'blastBomb', n: 2, category: 'weapons', station: 'alchemy', inputs: { coal: 2, gel: 1, copperIngot: 1 } }),
  r({ out: 'blastBomb', alt: 2, n: 3, category: 'weapons', station: 'alchemy', inputs: { sulphur: 2, gel: 1 } }),
  // --- Armour: four sets (helmet, chest, boots); a full set gives its bonus (config/armour).
  r({ out: 'minerHelmet', category: 'armour', station: 'forge', inputs: { copperIngot: 2, hide: 1, amber: 1 } }),
  r({ out: 'minerVest', category: 'armour', station: 'forge', inputs: { hide: 3, fungalWood: 2, copperIngot: 1 } }),
  r({ out: 'minerBoots', category: 'armour', station: 'forge', inputs: { hide: 2, chitin: 2 } }),
  r({ out: 'furHood', category: 'armour', station: 'forge', inputs: { frostFur: 2, silverIngot: 1 } }),
  r({ out: 'furCoat', category: 'armour', station: 'forge', inputs: { frostFur: 4, hide: 2, silverIngot: 2 } }),
  r({ out: 'furBoots', category: 'armour', station: 'forge', inputs: { frostFur: 2, chitin: 2 } }),
  r({ out: 'bogMask', category: 'armour', station: 'forge', inputs: { glass: 3, mireOpal: 1, coldsteelIngot: 1 } }),
  r({ out: 'bogCoat', category: 'armour', station: 'forge', inputs: { hide: 3, coldsteelIngot: 2, glowvine: 4 } }),
  r({ out: 'bogBoots', category: 'armour', station: 'forge', inputs: { hide: 2, rimeIron: 3, chitin: 2 } }),
  r({ out: 'emberHelm', category: 'armour', station: 'forge', inputs: { embersteelIngot: 3, magmaCore: 1 } }),
  r({ out: 'emberPlate', category: 'armour', station: 'forge', inputs: { embersteelIngot: 5, sunmetalIngot: 2, emberCore: 2 } }),
  r({ out: 'emberGreaves', category: 'armour', station: 'forge', inputs: { embersteelIngot: 3, voidshard: 2 } }),
  // --- Lanterns (brighter, longer, wider sonar) and packs.
  r({ out: 'copperLantern', category: 'lanterns', station: 'forge', inputs: { copperIngot: 3, glass: 2, amber: 1 } }),
  r({ out: 'crystalLantern', category: 'lanterns', station: 'forge', inputs: { glimmerShard: 4, goldIngot: 2, glass: 2 } }),
  r({ out: 'glowLantern', category: 'lanterns', station: 'forge', inputs: { sapAmber: 3, silverIngot: 2, glass: 2, frostCrystal: 1 } }),
  r({ out: 'sunLantern', category: 'lanterns', station: 'forge', inputs: { orichalcum: 2, sunmetalIngot: 2, glass: 3 } }),
  r({ out: 'sturdyPack', category: 'lanterns', station: 'workbench', inputs: { hide: 4, fungalWood: 2, copperIngot: 1 } }),
  r({ out: 'expeditionPack', category: 'lanterns', station: 'workbench', inputs: { hide: 6, rootFibre: 6, ironIngot: 2 } }),
  r({ out: 'deepPack', category: 'lanterns', station: 'workbench', inputs: { frostFur: 4, glowvine: 6, silverIngot: 2 } }),
  // --- Consumables: food and healing, oil, wards against the hazards, flares.
  r({ out: 'bandage', n: 2, category: 'consumables', station: 'hand', inputs: { glowcap: 1, fungalWood: 1 }, unlock: 'start' }),
  r({ out: 'roastCap', n: 2, category: 'consumables', station: 'furnace', inputs: { glowcap: 2 }, fuel: 1 }),
  r({ out: 'caveStew', n: 2, category: 'consumables', station: 'furnace', inputs: { glowcap: 3, hide: 1 }, fuel: 1 }),
  r({ out: 'healingDraught', category: 'consumables', station: 'alchemy', inputs: { glowcap: 2, pearl: 1, gel: 1 } }),
  r({ out: 'healingDraught', alt: 2, category: 'consumables', station: 'alchemy', inputs: { glowcap: 3, sporeQuartz: 1 } }),
  r({ out: 'oilFlask', n: 2, category: 'consumables', station: 'alchemy', inputs: { amber: 1, glowcap: 2 } }),
  r({ out: 'oilFlask', alt: 2, n: 2, category: 'consumables', station: 'workbench', inputs: { blackOil: 2 } }),
  r({ out: 'oilFlask', alt: 3, n: 3, category: 'consumables', station: 'alchemy', inputs: { sapAmber: 1 } }),
  r({ out: 'warmingTonic', n: 2, category: 'consumables', station: 'alchemy', inputs: { coal: 2, amber: 1, glowcap: 2 } }),
  r({ out: 'antidote', n: 2, category: 'consumables', station: 'alchemy', inputs: { glowvine: 2, pearl: 1 } }),
  r({ out: 'antidote', alt: 2, n: 2, category: 'consumables', station: 'alchemy', inputs: { venomSac: 1, glowcap: 2 } }),
  r({ out: 'coolingDraught', n: 2, category: 'consumables', station: 'alchemy', inputs: { frostCrystal: 1, gel: 1, glowcap: 2 } }),
  r({ out: 'flare', n: 2, category: 'consumables', station: 'workbench', inputs: { amber: 1, coal: 1 } }),
  r({ out: 'flare', alt: 2, n: 3, category: 'consumables', station: 'workbench', inputs: { sulphur: 1, fungalWood: 1 } }),
  // --- Building: planks, bricks, torches, ladders, ropes, doors.
  r({ out: 'plank', n: 4, category: 'building', station: 'hand', inputs: { fungalWood: 1 }, unlock: 'start' }),
  r({ out: 'plank', alt: 2, n: 6, category: 'building', station: 'hand', inputs: { heartwood: 1 } }),
  r({ out: 'torch', n: 4, category: 'building', station: 'hand', inputs: { fungalWood: 1, coal: 1 }, unlock: 'start' }),
  r({ out: 'torch', alt: 2, n: 3, category: 'building', station: 'hand', inputs: { fungalWood: 1, glowcap: 1 }, unlock: 'start' }),
  r({ out: 'torch', alt: 3, n: 6, category: 'building', station: 'hand', inputs: { sulphur: 1, fungalWood: 1 } }),
  r({ out: 'torch', alt: 4, n: 4, category: 'building', station: 'hand', inputs: { glowvine: 1, coal: 1 } }),
  r({ out: 'ladder', n: 3, category: 'building', station: 'workbench', inputs: { plank: 3 } }),
  r({ out: 'rope', n: 2, category: 'building', station: 'workbench', inputs: { fungalWood: 2, hide: 1 } }),
  r({ out: 'rope', alt: 2, n: 3, category: 'building', station: 'workbench', inputs: { rootFibre: 3 } }),
  r({ out: 'rope', alt: 3, n: 3, category: 'building', station: 'workbench', inputs: { glowvine: 3 } }),
  r({ out: 'door', category: 'building', station: 'workbench', inputs: { plank: 4, copperIngot: 1 } }),
  r({ out: 'brick', n: 4, category: 'building', station: 'furnace', inputs: { stone: 3 }, fuel: 1 }),
  // --- Stations and outposts (made at the Workbench, placed with Place).
  r({ out: 'furnace', category: 'stations', station: 'workbench', inputs: { stone: 12, coal: 2 }, unlock: 'start' }),
  r({ out: 'furnace', alt: 2, category: 'stations', station: 'workbench', inputs: { stone: 12, fungalWood: 4 }, unlock: 'start' }),
  r({ out: 'forge', category: 'stations', station: 'workbench', inputs: { stone: 10, copperIngot: 4, coal: 2 } }),
  r({ out: 'alchemyTable', category: 'stations', station: 'workbench', inputs: { fungalWood: 4, glowcap: 4, amber: 2, copperIngot: 1 } }),
  r({ out: 'outpostKit', category: 'stations', station: 'workbench', inputs: { plank: 8, torch: 4, copperIngot: 3, hide: 2 } }),
  // --- Smelting at the Furnace (fuel per craft).
  r({ out: 'copperIngot', category: 'smelting', station: 'furnace', inputs: { copperOre: 2 }, fuel: 1 }),
  r({ out: 'ironIngot', category: 'smelting', station: 'furnace', inputs: { ironOre: 2 }, fuel: 1 }),
  r({ out: 'ironIngot', alt: 2, category: 'smelting', station: 'furnace', inputs: { haldenScrap: 3 }, fuel: 1 }),
  r({ out: 'goldIngot', category: 'smelting', station: 'furnace', inputs: { goldOre: 2 }, fuel: 2 }),
  r({ out: 'silverIngot', category: 'smelting', station: 'furnace', inputs: { silverOre: 2 }, fuel: 1 }),
  r({ out: 'coldsteelIngot', category: 'smelting', station: 'furnace', inputs: { rimeIron: 2, ironIngot: 1 }, fuel: 2 }),
  r({ out: 'sunmetalIngot', category: 'smelting', station: 'furnace', inputs: { runegold: 2, goldIngot: 1 }, fuel: 2 }),
  r({ out: 'embersteelIngot', category: 'smelting', station: 'furnace', inputs: { emberite: 2, coldsteelIngot: 1 }, fuel: 3 }),
  r({ out: 'glass', n: 2, category: 'smelting', station: 'furnace', inputs: { stone: 3 }, fuel: 1 }),
];

export const RECIPE_BY_ID: ReadonlyMap<string, Recipe> = new Map(RECIPES.map((x) => [x.id, x]));

export function recipeById(id: string): Recipe | null {
  return RECIPE_BY_ID.get(id) ?? null;
}

/** The recipes that make an item (the main one first). */
export function recipesFor(item: ItemId): Recipe[] {
  return RECIPES.filter((x) => x.output.item === item);
}

/** A recipe's inputs as [item, count] pairs with count > 0. */
export function recipeInputs(x: Recipe): Array<[ItemId, number]> {
  return (Object.entries(x.inputs) as Array<[ItemId, number | undefined]>).filter((e): e is [ItemId, number] => (e[1] ?? 0) > 0);
}
