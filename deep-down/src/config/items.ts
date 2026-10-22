import type { TextKey } from '../i18n';
import type { Rarity as Grade } from './rarity';
import { TILE } from './tiles';

/**
 * Every item of the game (round 3, LOOP seam: BRIEF §2 and §0.4).
 *
 * - Materials come from the 12 biomes (two per stratum), from creatures and from the Furnace.
 * - Tools, weapons, armour and lanterns are gear: crafted, then equipped (game/craft Gear).
 * - Consumables are used from the bag or the hotbar; building items are placed with Place.
 * - Key items (Heart Shards, journal pages, legacy relics) never take bag room and are never lost.
 *
 * The 1.x ids (stone ... relicEmber) are kept so saves and the other owners' code keep working; the
 * hand-made runes and relics are retired from the new world (nothing grants them any more).
 */
export type ItemId =
  // --- Stratum I: Amber Hollows, Mushroom Forest (and the 1.x stone)
  | 'stone'
  | 'copperOre'
  | 'coal'
  | 'amber'
  | 'glowcap'
  | 'fungalWood'
  | 'sporeQuartz'
  // --- Stratum II: Root Galleries, Flooded Grottoes
  | 'rootFibre'
  | 'ironOre'
  | 'heartwood'
  | 'silverOre'
  | 'pearl'
  // --- Stratum III: Crystal Geode, Old Halden Mines
  | 'glimmerShard'
  | 'echoShard'
  | 'gem'
  | 'haldenScrap'
  | 'goldOre'
  | 'blackOil'
  // --- Stratum IV: Frost Caverns, Glowroot Jungle
  | 'rimeIron'
  | 'frostCrystal'
  | 'glowvine'
  | 'sapAmber'
  | 'verdite'
  // --- Stratum V: Sulphur Bog, Sunken City
  | 'sulphur'
  | 'mireOpal'
  | 'runegold'
  | 'orichalcum'
  // --- Stratum VI: Magma Veins, Obsidian Abyss
  | 'emberite'
  | 'magmaCore'
  | 'voidshard'
  | 'starsteel'
  // --- Creature parts (MOBS drops)
  | 'chitin'
  | 'hide'
  | 'gel'
  | 'fang'
  | 'frostFur'
  | 'venomSac'
  | 'emberCore'
  | 'voidEssence'
  // --- The Furnace's bars and blocks
  | 'copperIngot'
  | 'ironIngot'
  | 'silverIngot'
  | 'goldIngot'
  | 'coldsteelIngot'
  | 'sunmetalIngot'
  | 'embersteelIngot'
  | 'glass'
  | 'brick'
  // --- Picks I–VI
  | 'rustyPick'
  | 'copperPick'
  | 'ironPick'
  | 'crystalPick'
  | 'coldsteelPick'
  | 'sunmetalPick'
  // --- Weapons (three tier bands: melee, reach, ranged)
  | 'machete'
  | 'spear'
  | 'sling'
  | 'sword'
  | 'crystalSpear'
  | 'crossbow'
  | 'greatAxe'
  | 'sunLance'
  | 'emberCrossbow'
  // --- Bombs
  | 'flashCharge'
  | 'blastBomb'
  // --- Armour: four sets of helmet, chest and boots
  | 'minerHelmet'
  | 'minerVest'
  | 'minerBoots'
  | 'furHood'
  | 'furCoat'
  | 'furBoots'
  | 'bogMask'
  | 'bogCoat'
  | 'bogBoots'
  | 'emberHelm'
  | 'emberPlate'
  | 'emberGreaves'
  // --- Lanterns and bags
  | 'oilLantern'
  | 'copperLantern'
  | 'crystalLantern'
  | 'glowLantern'
  | 'sunLantern'
  | 'sturdyPack'
  | 'expeditionPack'
  | 'deepPack'
  // --- Consumables
  | 'bandage'
  | 'roastCap'
  | 'caveStew'
  | 'healingDraught'
  | 'oilFlask'
  | 'antidote'
  | 'warmingTonic'
  | 'coolingDraught'
  | 'flare'
  // --- Building
  | 'plank'
  | 'torch'
  | 'ladder'
  | 'rope'
  | 'door'
  | 'furnace'
  | 'forge'
  | 'alchemyTable'
  | 'outpostKit'
  // --- Key items
  | 'heartShard'
  | 'journalPage'
  // --- 1.x key items (retired with the hand-made world; kept for saves)
  | 'ancientTablet'
  | 'runeDescent'
  | 'runeEye'
  | 'runeStar'
  | 'runeSpire'
  | 'runeGate'
  | 'runeWaves'
  | 'runeChasm'
  | 'bearerLens'
  | 'firstLamp'
  | 'relicGlowroot'
  | 'relicChoir'
  | 'relicEmber';

/** The 1.x colour class (ui.css .common/.uncommon/.rare/.relic). New code reads `grade`. */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'relic';

/** The 12 biomes plus the Heart: must equal WORLD's `BiomeId` (src/config/biomes.ts). */
export type BiomeKey =
  | 'amberHollows'
  | 'mushroomForest'
  | 'rootGalleries'
  | 'floodedGrottoes'
  | 'crystalGeode'
  | 'haldenMines'
  | 'frostCaverns'
  | 'glowrootJungle'
  | 'sulphurBog'
  | 'sunkenCity'
  | 'magmaVeins'
  | 'obsidianAbyss'
  | 'heart';

/** What an item is (fine-grained); `category` is the bag's tab. */
export type ItemKind =
  | 'material'
  | 'ore'
  | 'gem'
  | 'part'
  | 'ingot'
  | 'tool'
  | 'weapon'
  | 'bomb'
  | 'armour'
  | 'lantern'
  | 'pack'
  | 'food'
  | 'potion'
  | 'block'
  | 'light'
  | 'climb'
  | 'station'
  | 'key';

/** The bag's tabs (Inventory categories, BRIEF §0.6). */
export type InventoryCategory = 'materials' | 'gear' | 'consumables' | 'building' | 'key';
export const INVENTORY_CATEGORIES: readonly InventoryCategory[] = ['materials', 'gear', 'consumables', 'building', 'key'];

/** Where an equippable item goes (game/craft Gear). */
export type EquipSlot = 'pick' | 'weapon' | 'lantern' | 'pack' | 'head' | 'chest' | 'feet';

/** The hazards of §0.2 (gameplay/Hazards). */
export type HazardKind = 'cold' | 'gas' | 'heat' | 'dark';

/** What using a consumable does (gameplay/Consumables). */
export type ItemUse =
  | { kind: 'heal'; amount: number }
  | { kind: 'oil'; fraction: number }
  /** Clears a hazard's build-up and wards it off for `seconds`. */
  | { kind: 'ward'; hazard: HazardKind; seconds: number; heal?: number }
  /** Thrown: a light that burns `seconds` where it lands and scares monsters (the flare). */
  | { kind: 'flare'; seconds: number }
  /** Thrown: a bomb (config/weapons WEAPONS[weapon]). */
  | { kind: 'bomb'; weapon: 'flash' | 'bomb' };

/**
 * What placing an item does (Place action, game/craft Building). The block ids of placed things
 * are WORLD's (config/blocks); `placeBlock()` resolves them by name so a missing id never breaks.
 * - block: a solid building block (plank, brick);
 * - torch: a small light on the face (monsters never spawn in torch light);
 * - ladder / rope: a climbable column (a rope unrolls down to the floor);
 * - door: a door block that opens on Interact;
 * - station: a crafting station prop (Furnace, Forge, Alchemy Table);
 * - outpost: an outpost (bank, fast travel, bedroll, light, a field workbench).
 */
export type PlaceKind = 'block' | 'torch' | 'ladder' | 'rope' | 'door' | 'station' | 'outpost';

export type ItemIcon =
  | { kind: 'cube'; tile: number }
  | {
      kind:
        | 'shard'
        | 'tablet'
        | 'ore'
        | 'gem'
        | 'ingot'
        | 'part'
        | 'pick'
        | 'blade'
        | 'spear'
        | 'bow'
        | 'bomb'
        | 'helmet'
        | 'chest'
        | 'boots'
        | 'lantern'
        | 'pack'
        | 'food'
        | 'potion'
        | 'torch'
        | 'ladder'
        | 'rope'
        | 'door'
        | 'station'
        | 'kit'
        | 'page'
        | 'heart';
    };

export interface ItemDef {
  id: ItemId;
  name: TextKey;
  desc: TextKey;
  stackSize: number;
  /** 1.x colour class (derived from `grade`). */
  rarity: Rarity;
  /** The rarity tier (config/rarity colours): pickup flashes, the bag's rim, the drop's glow. */
  grade: Grade;
  icon: ItemIcon;
  /** sRGB colour: icons, pickup flashes, particles. */
  color: number;
  /** Key items go to the key tab, take no bag room and are never lost. */
  keyItem: boolean;
  kind: ItemKind;
  category: InventoryCategory;
  /** The biome it is found in (materials), for the "found in" line of a recipe card. */
  biome?: BiomeKey;
  /** Gear: the slot it is equipped in and its tier (picks I–VI, lanterns 1–5, packs 1–4, armour bands 1–4). */
  equip?: EquipSlot;
  tier?: number;
  /** Consumables. */
  use?: ItemUse;
  /** Placeable things. */
  place?: PlaceKind;
  /** Furnace fuel units one item gives (coal 4, wood 1...). */
  fuel?: number;
}

const GRADE_CLASS: Record<Grade, Rarity> = { common: 'common', uncommon: 'uncommon', rare: 'rare', epic: 'rare', legendary: 'relic' };

const CAT: Record<ItemKind, InventoryCategory> = {
  material: 'materials', ore: 'materials', gem: 'materials', part: 'materials', ingot: 'materials',
  tool: 'gear', weapon: 'gear', armour: 'gear', lantern: 'gear', pack: 'gear',
  bomb: 'consumables', food: 'consumables', potion: 'consumables',
  block: 'building', light: 'building', climb: 'building', station: 'building',
  key: 'key',
};

const STACK: Record<ItemKind, number> = {
  material: 60, ore: 60, gem: 30, part: 40, ingot: 40, tool: 1, weapon: 1, armour: 1, lantern: 1, pack: 1,
  bomb: 10, food: 20, potion: 10, block: 99, light: 30, climb: 30, station: 1, key: 99,
};

const ICON: Record<ItemKind, ItemIcon['kind']> = {
  material: 'ore', ore: 'ore', gem: 'gem', part: 'part', ingot: 'ingot', tool: 'pick', weapon: 'blade', bomb: 'bomb',
  armour: 'chest', lantern: 'lantern', pack: 'pack', food: 'food', potion: 'potion', block: 'cube', light: 'torch',
  climb: 'ladder', station: 'station', key: 'page',
};

type Extra = Partial<Omit<ItemDef, 'id' | 'name' | 'desc' | 'kind' | 'category' | 'grade' | 'rarity' | 'color'>>;

function item(id: ItemId, kind: ItemKind, grade: Grade, color: number, extra: Extra = {}): ItemDef {
  const icon = extra.icon ?? ({ kind: ICON[kind] } as ItemIcon);
  return {
    id,
    name: `item.${id}` as TextKey,
    desc: `item.${id}.desc` as TextKey,
    stackSize: extra.stackSize ?? STACK[kind],
    rarity: GRADE_CLASS[grade],
    grade,
    color,
    keyItem: kind === 'key',
    kind,
    category: CAT[kind],
    ...extra,
    icon,
  };
}

const legacyKey = (id: ItemId, color: number): ItemDef => item(id, 'key', 'legendary', color, { icon: { kind: 'tablet' }, stackSize: 1 });

export const ITEMS: Record<ItemId, ItemDef> = {
  // Stratum I
  stone: item('stone', 'material', 'common', 0x8a95a8, { icon: { kind: 'cube', tile: TILE.slate }, biome: 'amberHollows' }),
  copperOre: item('copperOre', 'ore', 'common', 0xe0874a, { icon: { kind: 'cube', tile: TILE.copperOre }, biome: 'amberHollows' }),
  coal: item('coal', 'ore', 'common', 0x3a3a40, { biome: 'amberHollows', fuel: 4 }),
  amber: item('amber', 'gem', 'uncommon', 0xf0a830, { biome: 'amberHollows' }),
  glowcap: item('glowcap', 'material', 'common', 0x3fe0c8, { biome: 'mushroomForest', icon: { kind: 'food' } }),
  fungalWood: item('fungalWood', 'material', 'common', 0xc08fd0, { biome: 'mushroomForest', fuel: 1 }),
  sporeQuartz: item('sporeQuartz', 'gem', 'rare', 0xff6fd8, { biome: 'mushroomForest' }),
  // Stratum II
  rootFibre: item('rootFibre', 'material', 'common', 0xb59a6e, { icon: { kind: 'cube', tile: TILE.soil }, biome: 'rootGalleries' }),
  ironOre: item('ironOre', 'ore', 'uncommon', 0xc9b7a6, { icon: { kind: 'cube', tile: TILE.ironOre }, biome: 'rootGalleries' }),
  heartwood: item('heartwood', 'material', 'rare', 0xd8a040, { biome: 'rootGalleries', fuel: 3 }),
  silverOre: item('silverOre', 'ore', 'uncommon', 0xcfe0f0, { biome: 'haldenMines' }),
  pearl: item('pearl', 'gem', 'rare', 0xe8f4ff, { biome: 'floodedGrottoes' }),
  // Stratum III
  glimmerShard: item('glimmerShard', 'gem', 'rare', 0x52e8f5, { icon: { kind: 'shard' }, biome: 'crystalGeode' }),
  echoShard: item('echoShard', 'gem', 'rare', 0xd8f4f6, { icon: { kind: 'shard' }, biome: 'crystalGeode' }),
  gem: item('gem', 'gem', 'epic', 0xb98cff, { icon: { kind: 'shard' }, biome: 'crystalGeode' }),
  haldenScrap: item('haldenScrap', 'material', 'common', 0xa0603a, { biome: 'haldenMines' }),
  goldOre: item('goldOre', 'ore', 'rare', 0xffd060, { biome: 'rootGalleries' }),
  blackOil: item('blackOil', 'material', 'uncommon', 0x2a2030, { biome: 'haldenMines', fuel: 2 }),
  // Stratum IV
  rimeIron: item('rimeIron', 'ore', 'uncommon', 0x9ad8ff, { biome: 'frostCaverns' }),
  frostCrystal: item('frostCrystal', 'gem', 'rare', 0xbfeaff, { biome: 'frostCaverns', icon: { kind: 'shard' } }),
  glowvine: item('glowvine', 'material', 'common', 0x7ff07a, { biome: 'glowrootJungle' }),
  sapAmber: item('sapAmber', 'material', 'rare', 0xc8ff6a, { biome: 'glowrootJungle', icon: { kind: 'potion' } }),
  verdite: item('verdite', 'gem', 'epic', 0x3fc890, { biome: 'glowrootJungle' }),
  // Stratum V
  sulphur: item('sulphur', 'ore', 'common', 0xd8e040, { biome: 'sulphurBog', fuel: 3 }),
  mireOpal: item('mireOpal', 'gem', 'rare', 0x9aff40, { biome: 'sulphurBog' }),
  runegold: item('runegold', 'ore', 'uncommon', 0xffc840, { biome: 'sunkenCity' }),
  orichalcum: item('orichalcum', 'gem', 'epic', 0xffe080, { biome: 'sunkenCity' }),
  // Stratum VI
  emberite: item('emberite', 'ore', 'uncommon', 0xff6a30, { biome: 'magmaVeins' }),
  magmaCore: item('magmaCore', 'gem', 'epic', 0xff4060, { biome: 'magmaVeins' }),
  voidshard: item('voidshard', 'gem', 'epic', 0x9a60ff, { biome: 'obsidianAbyss', icon: { kind: 'shard' } }),
  starsteel: item('starsteel', 'ore', 'legendary', 0xd8e0ff, { biome: 'obsidianAbyss' }),
  // Creature parts
  chitin: item('chitin', 'part', 'common', 0xc8c0a8),
  hide: item('hide', 'part', 'common', 0x9a7050),
  gel: item('gel', 'part', 'common', 0x80e0ff),
  fang: item('fang', 'part', 'uncommon', 0xf0e8d8),
  frostFur: item('frostFur', 'part', 'uncommon', 0xe0f0ff, { biome: 'frostCaverns' }),
  venomSac: item('venomSac', 'part', 'uncommon', 0xa0e040, { biome: 'sulphurBog' }),
  emberCore: item('emberCore', 'part', 'rare', 0xff8030, { biome: 'magmaVeins' }),
  voidEssence: item('voidEssence', 'part', 'epic', 0xb070ff, { biome: 'obsidianAbyss' }),
  // Bars and blocks from the Furnace
  copperIngot: item('copperIngot', 'ingot', 'common', 0xe0874a),
  ironIngot: item('ironIngot', 'ingot', 'uncommon', 0xb8c0c8),
  silverIngot: item('silverIngot', 'ingot', 'uncommon', 0xe0eaf4),
  goldIngot: item('goldIngot', 'ingot', 'rare', 0xffd060),
  coldsteelIngot: item('coldsteelIngot', 'ingot', 'rare', 0x9ad8ff),
  sunmetalIngot: item('sunmetalIngot', 'ingot', 'epic', 0xffc840),
  embersteelIngot: item('embersteelIngot', 'ingot', 'epic', 0xff6a30),
  glass: item('glass', 'ingot', 'common', 0xc8f0ff),
  brick: item('brick', 'block', 'common', 0xa05a40, { place: 'block' }),
  // Picks I–VI
  rustyPick: item('rustyPick', 'tool', 'common', 0x7d6a5a, { equip: 'pick', tier: 1 }),
  copperPick: item('copperPick', 'tool', 'common', 0xd9864b, { equip: 'pick', tier: 2 }),
  ironPick: item('ironPick', 'tool', 'uncommon', 0x9aa3ad, { equip: 'pick', tier: 3 }),
  crystalPick: item('crystalPick', 'tool', 'rare', 0x8fe3ee, { equip: 'pick', tier: 4 }),
  coldsteelPick: item('coldsteelPick', 'tool', 'epic', 0x9ad8ff, { equip: 'pick', tier: 5 }),
  sunmetalPick: item('sunmetalPick', 'tool', 'legendary', 0xffc840, { equip: 'pick', tier: 6 }),
  // Weapons
  machete: item('machete', 'weapon', 'common', 0xb8c0c8, { equip: 'weapon', tier: 1 }),
  spear: item('spear', 'weapon', 'uncommon', 0xc8a070, { equip: 'weapon', tier: 1, icon: { kind: 'spear' } }),
  sling: item('sling', 'weapon', 'common', 0xb59a6e, { equip: 'weapon', tier: 1, icon: { kind: 'bow' } }),
  sword: item('sword', 'weapon', 'rare', 0xe0eaf4, { equip: 'weapon', tier: 2 }),
  crystalSpear: item('crystalSpear', 'weapon', 'rare', 0x52e8f5, { equip: 'weapon', tier: 2, icon: { kind: 'spear' } }),
  crossbow: item('crossbow', 'weapon', 'rare', 0x9a7050, { equip: 'weapon', tier: 2, icon: { kind: 'bow' } }),
  greatAxe: item('greatAxe', 'weapon', 'epic', 0xff6a30, { equip: 'weapon', tier: 3 }),
  sunLance: item('sunLance', 'weapon', 'epic', 0xffc840, { equip: 'weapon', tier: 3, icon: { kind: 'spear' } }),
  emberCrossbow: item('emberCrossbow', 'weapon', 'legendary', 0xff4060, { equip: 'weapon', tier: 3, icon: { kind: 'bow' } }),
  // Bombs
  flashCharge: item('flashCharge', 'bomb', 'uncommon', 0xfff1c4, { use: { kind: 'bomb', weapon: 'flash' } }),
  blastBomb: item('blastBomb', 'bomb', 'rare', 0xff9040, { use: { kind: 'bomb', weapon: 'bomb' } }),
  // Armour
  minerHelmet: item('minerHelmet', 'armour', 'common', 0xc8a070, { equip: 'head', tier: 1, icon: { kind: 'helmet' } }),
  minerVest: item('minerVest', 'armour', 'common', 0x9a7050, { equip: 'chest', tier: 1 }),
  minerBoots: item('minerBoots', 'armour', 'common', 0x6a5040, { equip: 'feet', tier: 1, icon: { kind: 'boots' } }),
  furHood: item('furHood', 'armour', 'rare', 0xe0f0ff, { equip: 'head', tier: 2, icon: { kind: 'helmet' } }),
  furCoat: item('furCoat', 'armour', 'rare', 0xd0e4f4, { equip: 'chest', tier: 2 }),
  furBoots: item('furBoots', 'armour', 'rare', 0xb8d0e8, { equip: 'feet', tier: 2, icon: { kind: 'boots' } }),
  bogMask: item('bogMask', 'armour', 'epic', 0xa0e040, { equip: 'head', tier: 3, icon: { kind: 'helmet' } }),
  bogCoat: item('bogCoat', 'armour', 'epic', 0x8ac040, { equip: 'chest', tier: 3 }),
  bogBoots: item('bogBoots', 'armour', 'epic', 0x6a9a30, { equip: 'feet', tier: 3, icon: { kind: 'boots' } }),
  emberHelm: item('emberHelm', 'armour', 'legendary', 0xff6a30, { equip: 'head', tier: 4, icon: { kind: 'helmet' } }),
  emberPlate: item('emberPlate', 'armour', 'legendary', 0xff5a20, { equip: 'chest', tier: 4 }),
  emberGreaves: item('emberGreaves', 'armour', 'legendary', 0xe04a10, { equip: 'feet', tier: 4, icon: { kind: 'boots' } }),
  // Lanterns and packs
  oilLantern: item('oilLantern', 'lantern', 'common', 0xd0a060, { equip: 'lantern', tier: 1 }),
  copperLantern: item('copperLantern', 'lantern', 'uncommon', 0xe0874a, { equip: 'lantern', tier: 2 }),
  crystalLantern: item('crystalLantern', 'lantern', 'rare', 0x52e8f5, { equip: 'lantern', tier: 3 }),
  glowLantern: item('glowLantern', 'lantern', 'epic', 0xc8ff6a, { equip: 'lantern', tier: 4 }),
  sunLantern: item('sunLantern', 'lantern', 'legendary', 0xffe080, { equip: 'lantern', tier: 5 }),
  sturdyPack: item('sturdyPack', 'pack', 'common', 0x9a7050, { equip: 'pack', tier: 2 }),
  expeditionPack: item('expeditionPack', 'pack', 'uncommon', 0x7a5a40, { equip: 'pack', tier: 3 }),
  deepPack: item('deepPack', 'pack', 'rare', 0x5a4a6a, { equip: 'pack', tier: 4 }),
  // Consumables
  bandage: item('bandage', 'food', 'common', 0xf0e8d8, { use: { kind: 'heal', amount: 20 }, icon: { kind: 'part' } }),
  roastCap: item('roastCap', 'food', 'common', 0xc87040, { use: { kind: 'heal', amount: 15 } }),
  caveStew: item('caveStew', 'food', 'uncommon', 0xd09040, { use: { kind: 'heal', amount: 40 } }),
  healingDraught: item('healingDraught', 'potion', 'rare', 0xff5a7a, { use: { kind: 'heal', amount: 70 } }),
  oilFlask: item('oilFlask', 'potion', 'common', 0xf0c040, { use: { kind: 'oil', fraction: 0.5 } }),
  antidote: item('antidote', 'potion', 'uncommon', 0xa0ff60, { use: { kind: 'ward', hazard: 'gas', seconds: 120, heal: 10 } }),
  warmingTonic: item('warmingTonic', 'potion', 'uncommon', 0xff9040, { use: { kind: 'ward', hazard: 'cold', seconds: 150 } }),
  coolingDraught: item('coolingDraught', 'potion', 'rare', 0x60c0ff, { use: { kind: 'ward', hazard: 'heat', seconds: 120 } }),
  flare: item('flare', 'bomb', 'common', 0xff7040, { use: { kind: 'flare', seconds: 40 }, icon: { kind: 'torch' } }),
  // Building
  plank: item('plank', 'block', 'common', 0x9a6a40, { icon: { kind: 'cube', tile: TILE.plank }, place: 'block' }),
  torch: item('torch', 'light', 'common', 0xffb050, { place: 'torch' }),
  ladder: item('ladder', 'climb', 'common', 0xa07040, { place: 'ladder' }),
  rope: item('rope', 'climb', 'common', 0xc8a070, { place: 'rope', icon: { kind: 'rope' } }),
  door: item('door', 'block', 'common', 0x8a5a30, { place: 'door', icon: { kind: 'door' }, stackSize: 10 }),
  furnace: item('furnace', 'station', 'uncommon', 0xff8040, { place: 'station' }),
  forge: item('forge', 'station', 'rare', 0xffa060, { place: 'station' }),
  alchemyTable: item('alchemyTable', 'station', 'rare', 0x9a7aff, { place: 'station' }),
  outpostKit: item('outpostKit', 'station', 'rare', 0xffd28a, { place: 'outpost', icon: { kind: 'kit' }, stackSize: 5 }),
  // Key items
  heartShard: item('heartShard', 'key', 'legendary', 0xff5a5a, { icon: { kind: 'heart' }, stackSize: 12 }),
  journalPage: item('journalPage', 'key', 'uncommon', 0xe8d8b0, { icon: { kind: 'page' } }),
  // 1.x key items (retired)
  ancientTablet: legacyKey('ancientTablet', 0x7ff0ff),
  runeDescent: legacyKey('runeDescent', 0x7ff0ff),
  runeEye: legacyKey('runeEye', 0x7ff0ff),
  runeStar: legacyKey('runeStar', 0x7ff0ff),
  runeSpire: legacyKey('runeSpire', 0x7ff0ff),
  runeGate: legacyKey('runeGate', 0x7ff0ff),
  runeWaves: legacyKey('runeWaves', 0x7ff0ff),
  runeChasm: legacyKey('runeChasm', 0x7ff0ff),
  bearerLens: legacyKey('bearerLens', 0xbfe9ff),
  firstLamp: legacyKey('firstLamp', 0xffd28a),
  relicGlowroot: legacyKey('relicGlowroot', 0xc8f08a),
  relicChoir: legacyKey('relicChoir', 0x9ff6ff),
  relicEmber: legacyKey('relicEmber', 0xff9a5a),
};

/** The relics, in Journal order (1.x; retired). */
export const RELIC_ITEMS = ['bearerLens', 'firstLamp', 'relicGlowroot', 'relicChoir', 'relicEmber'] as const satisfies readonly ItemId[];

/** The eight runes (1.x; retired). */
export const RUNE_ITEMS = ['runeDescent', 'runeEye', 'runeStar', 'ancientTablet', 'runeSpire', 'runeGate', 'runeWaves', 'runeChasm'] as const satisfies readonly ItemId[];

/** Ids no longer granted by the new world (kept so 1.x saves load). */
export const LEGACY_ITEMS: ReadonlySet<ItemId> = new Set<ItemId>([...RELIC_ITEMS, ...RUNE_ITEMS]);

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** The items of the new game (legacy ids left out): catalogue order. */
export const CATALOGUE: readonly ItemId[] = ITEM_IDS.filter((id) => !LEGACY_ITEMS.has(id));

export function isItem(x: unknown): x is ItemId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, x);
}

/** Every item of a kind, catalogue order. */
export function itemsOfKind(kind: ItemKind): ItemId[] {
  return CATALOGUE.filter((id) => ITEMS[id].kind === kind);
}

/** The gear for a slot, by tier (picks I–VI, lanterns 1–5, packs 2–4, armour by band). */
export function gearFor(slot: EquipSlot, tier: number): ItemId | null {
  for (const id of CATALOGUE) {
    const d = ITEMS[id];
    if (d.equip === slot && d.tier === tier) return id;
  }
  return null;
}

/** Materials found in a biome, rarest last. */
export function biomeMaterials(biome: BiomeKey): ItemId[] {
  const rank: Record<Grade, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  return CATALOGUE.filter((id) => ITEMS[id].biome === biome && ITEMS[id].category === 'materials').sort((a, b) => rank[ITEMS[a].grade] - rank[ITEMS[b].grade]);
}

/** Rarity accents for the 1.x colour classes (src/ui/brand/tokens.ts RARITY). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c9bfae',
  uncommon: '#e58444',
  rare: '#8fe3ee',
  relic: '#b9a2ff',
};
