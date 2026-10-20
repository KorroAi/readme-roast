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
  | 'glimmerPickaxe';

export type EquipmentSlot = 'pickaxe' | 'lantern' | 'pack';

/** Where a node is made: at camp (the Workbench, the Forge, a camp plot) or at a field site (paid from the pack). */
export type Place = 'workbench' | 'forge' | 'camp' | 'field';

/** Camp stations: built on a plot, they rise from the ground and stay. */
export type StationId = 'surveyTable' | 'forge' | 'relicShelf';

/** Gear: worn, changes how the explorer moves or endures. */
export type GearId = 'gripBoots' | 'minersCoat';

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

// ---------------------------------------------------------------------------------------
// The W1 Workbench list (interim). The screens stream replaces inventory.ts buildCrafting with the
// tree (CraftTreeView) in W3; until it does, these keep the three equipment recipes it lists in
// their old shape. Remove once nothing imports them, and make RecipeId an alias of NodeId.

/** @deprecated Interim: the three Workbench recipes of the W1 list. Use NodeId. */
export type RecipeId = 'copperPickaxe' | 'copperLantern' | 'sturdyPack';

/** @deprecated Interim: a W1 Workbench recipe (an equipment node). Use NodeDef. */
export interface RecipeDef {
  id: RecipeId;
  name: TextKey;
  result: { slot: EquipmentSlot; tier: number };
  inputs: Partial<Record<ItemId, number>>;
  order: number;
}

function legacy(id: RecipeId): RecipeDef {
  const n = NODES[id];
  const r = n.result as Extract<NodeResult, { kind: 'equip' }>;
  return { id, name: n.name, result: { slot: r.slot, tier: r.tier }, inputs: n.inputs, order: n.order };
}

/** @deprecated Interim (see RecipeDef). */
export const RECIPES: Record<RecipeId, RecipeDef> = {
  copperPickaxe: legacy('copperPickaxe'),
  sturdyPack: legacy('sturdyPack'),
  copperLantern: legacy('copperLantern'),
};

/** @deprecated Interim (see RecipeDef). */
export const RECIPE_LIST: readonly RecipeDef[] = Object.values(RECIPES).sort((a, b) => a.order - b.order);
