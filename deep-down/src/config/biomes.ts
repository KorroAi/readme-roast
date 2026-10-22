import { B, BLOCKS } from './blocks';
import type { ItemId } from './items';
import type { Rarity } from './rarity';
import type { TextKey } from '../i18n';
import type { GuardianKind, MobKind } from '../game/mobs/types';
import { ROSTERS } from '../game/mobs/rosters';

/**
 * Round 3 (WORLD seam): the twelve biomes of the strata and the six strata that hold them
 * (docs/round3/BRIEF.md §0.1-0.2). Everything here is data: the generator (world/gen/strata) reads the
 * blocks and the layout knobs, VIS reads the look hints (light, fog, grade, ambience, props), MOBS the
 * rosters, LOOP the hazards and the ores (their tier, rarity and item).
 *
 * Text: every key named here lives in world/gen/strata/text.ts (WORLD_TEXT_EN), which LOOP spreads
 * into the English table; read it with biomeText().
 */
export type BiomeId =
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

/** The twelve biomes in descent order (two per stratum), then the Heart. */
export const BIOME_IDS: readonly BiomeId[] = ['amberHollows', 'mushroomForest', 'rootGalleries', 'floodedGrottoes', 'crystalGeode', 'haldenMines', 'frostCaverns', 'glowrootJungle', 'sulphurBog', 'sunkenCity', 'magmaVeins', 'obsidianAbyss', 'heart'];

/** 1..6 (Stratum I is the top, with the camp). */
export type StratumIndex = 1 | 2 | 3 | 4 | 5 | 6;
export const STRATUM_COUNT = 6;

/**
 * What a biome does to the explorer (LOOP's hazards apply it; VIS draws it):
 * none in I; gentle in II and III (falls, a chill near water, rockfall); real from IV (cold, gas, dark, lava).
 */
export type HazardKind = 'none' | 'falls' | 'chill' | 'rockfall' | 'cold' | 'thorns' | 'gas' | 'dark' | 'lava' | 'void';

export interface BiomeOre {
  block: number;
  rarity: Rarity;
  /** Pick tier needed (the first ore of a biome opens one tier below its stratum's). */
  tier: number;
  /** What it drops today (an item that exists), and the item LOOP adds for it (proposed id). */
  item: ItemId;
  proposedItem: string;
  /** Share of the biome's ore veins (the generator normalises the weights). */
  weight: number;
}

/**
 * The creature kinds are MOBS' (game/mobs/types.ts owns the union and the real rosters, ROSTERS);
 * BIOMES[b].mobs is read from ROSTERS (so arrival cards and the map only name creatures that live there).
 */
export type MobKindId = MobKind;

/** A biome's creatures, from MOBS' roster (the spawner's own table). */
const roster = (id: BiomeId): BiomeDef['mobs'] => ({ monsters: ROSTERS[id].monsters.map((e) => e.kind), beings: ROSTERS[id].beings.map((e) => e.kind), guardian: ROSTERS[id].guardian as GuardianKind });

export interface BiomeDef {
  id: BiomeId;
  stratum: StratumIndex;
  /** Displayed depth band (m). */
  depth: [number, number];
  name: TextKey;
  desc: TextKey;
  /** The arrival card's hazard line, the gear that answers it, the guardian's rumour. */
  hazardText: TextKey;
  gearText: TextKey;
  rumour: TextKey;
  /** Two host rocks (walls, ceilings: plain) and the floor variant (plain). */
  hosts: [number, number];
  floor: number;
  ores: BiomeOre[];
  /** Look hints for VIS (applyBiomeLook): the light colour (linear RGB), fog hue (sRGB hex), grade. */
  light: [number, number, number];
  /** The emitter block of the biome's light pockets. */
  lightBlock: number;
  fog: number;
  grade: { warmth: number; saturation: number; exposure: number };
  hazard: { kind: HazardKind; strength: number };
  mobs: { monsters: MobKindId[]; beings: MobKindId[]; guardian: GuardianKind };
  /** Ambience bed key for LOOP's audio (one per biome). */
  ambience: string;
  /** The ambient props this biome dresses its caves with (VIS models them; WORLD places them). */
  props: string[];
  /** Generator knobs: how the caves of this biome are shaped (0..1 unless said). */
  shape: {
    /** Openness: spaghetti tunnel radius scale and how often big caverns appear. */
    tunnelWidth: number;
    caverns: number;
    /** Pillars in the caverns, water lakes, lava rivers, vertical shafts. */
    pillars: number;
    lakes: number;
    lava: number;
    shafts: number;
    /** Block columns of the biome (giant fungi, elder roots, ice spikes, crystal spires, ruins). */
    columns: 'none' | 'fungi' | 'roots' | 'ice' | 'crystal' | 'ruins' | 'timber' | 'vines' | 'spires';
  };
}

/** An ore of a biome; its tier is the block's own (config/blocks), the `_tier` argument documents it. */
const ore = (block: number, rarity: Rarity, _tier: number, item: ItemId, proposedItem: string, weight: number): BiomeOre => ({ block, rarity, tier: BLOCKS[block].tier, item, proposedItem, weight });
const key = (k: string) => k as TextKey;
const text = (id: BiomeId) => ({
  name: key(`biome.${id}.name`),
  desc: key(`biome.${id}.desc`),
  hazardText: key(`biome.${id}.hazard`),
  gearText: key(`biome.${id}.gear`),
  rumour: key(`biome.${id}.rumour`),
});

export const BIOMES: Record<BiomeId, BiomeDef> = {
  amberHollows: {
    id: 'amberHollows', stratum: 1, depth: [0, 90], ...text('amberHollows'),
    hosts: [B.AMBER_LIMESTONE, B.AMBER_SANDSTONE], floor: B.AMBER_FLOOR,
    ores: [ore(B.COPPER_ORE, 'common', 1, 'copperOre', 'copperOre', 5), ore(B.COAL_ORE, 'common', 1, 'coal', 'coal', 3), ore(B.AMBER_ORE, 'uncommon', 1, 'amber', 'amber', 3), ore(B.LANTERNSTONE, 'legendary', 1, 'stone', 'lanternEmber', 0.5)],
    light: [1.0, 0.72, 0.42], lightBlock: B.LIGHT_LAMP, fog: 0x2a2018, grade: { warmth: 0.6, saturation: 1.05, exposure: 1.05 },
    hazard: { kind: 'none', strength: 0 },
    mobs: roster('amberHollows'),
    ambience: 'amb.amberHollows', props: ['crate', 'barrel', 'lanternPost', 'bones', 'stalagmite', 'amberDrip'],
    shape: { tunnelWidth: 1, caverns: 0.7, pillars: 0.5, lakes: 0.1, lava: 0, shafts: 0.2, columns: 'none' },
  },
  mushroomForest: {
    id: 'mushroomForest', stratum: 1, depth: [0, 90], ...text('mushroomForest'),
    hosts: [B.MYCEL_ROCK, B.SPORE_LOAM], floor: B.MYCEL_FLOOR,
    ores: [ore(B.COPPER_ORE, 'common', 1, 'copperOre', 'copperOre', 3), ore(B.SPORE_QUARTZ, 'rare', 1, 'sporeQuartz', 'sporeQuartz', 3), ore(B.MUSHROOM_CAP_TEAL, 'common', 1, 'glowcap', 'glowcap', 2)],
    light: [0.2, 0.9, 0.8], lightBlock: B.LIGHT_TEAL, fog: 0x12202a, grade: { warmth: -0.3, saturation: 1.2, exposure: 1.1 },
    hazard: { kind: 'none', strength: 0 },
    mobs: roster('mushroomForest'),
    ambience: 'amb.mushroomForest', props: ['mushroomSmall', 'mushroomCluster', 'sporePuff', 'bones'],
    shape: { tunnelWidth: 1.15, caverns: 0.9, pillars: 0.2, lakes: 0.15, lava: 0, shafts: 0.1, columns: 'fungi' },
  },
  rootGalleries: {
    id: 'rootGalleries', stratum: 2, depth: [90, 180], ...text('rootGalleries'),
    hosts: [B.ROOT_EARTH, B.ROOT_CLAY], floor: B.ROOT_FLOOR,
    ores: [ore(B.IRON_ORE, 'uncommon', 1, 'ironOre', 'ironOre', 4), ore(B.GOLD_ORE, 'rare', 2, 'goldOre', 'goldOre', 2), ore(B.ROOTS, 'common', 1, 'rootFibre', 'rootFibre', 3)],
    light: [0.62, 0.8, 0.32], lightBlock: B.LIGHT_GLOWROOT, fog: 0x1a2012, grade: { warmth: 0.3, saturation: 1.1, exposure: 1.05 },
    hazard: { kind: 'falls', strength: 0.3 },
    mobs: roster('rootGalleries'),
    ambience: 'amb.rootGalleries', props: ['hangingRoots', 'rootKnot', 'bones', 'crate'],
    shape: { tunnelWidth: 0.95, caverns: 0.6, pillars: 0.4, lakes: 0.1, lava: 0, shafts: 0.4, columns: 'roots' },
  },
  floodedGrottoes: {
    id: 'floodedGrottoes', stratum: 2, depth: [90, 180], ...text('floodedGrottoes'),
    hosts: [B.FLOOD_STONE, B.FLOOD_SHALE], floor: B.FLOOD_FLOOR,
    ores: [ore(B.IRON_ORE, 'uncommon', 1, 'ironOre', 'ironOre', 3), ore(B.PEARL_ORE, 'rare', 2, 'pearl', 'pearl', 3), ore(B.CRYSTAL, 'epic', 2, 'glimmerShard', 'glimmerShard', 1)],
    light: [0.36, 0.6, 0.9], lightBlock: B.LIGHT_CYAN, fog: 0x0e1a28, grade: { warmth: -0.6, saturation: 1.0, exposure: 1.0 },
    hazard: { kind: 'chill', strength: 0.3 },
    mobs: roster('floodedGrottoes'),
    ambience: 'amb.floodedGrottoes', props: ['reeds', 'shells', 'driftwood', 'waterfall'],
    shape: { tunnelWidth: 1.1, caverns: 0.8, pillars: 0.3, lakes: 1, lava: 0, shafts: 0.2, columns: 'none' },
  },
  crystalGeode: {
    id: 'crystalGeode', stratum: 3, depth: [180, 270], ...text('crystalGeode'),
    hosts: [B.GEODE_ROCK, B.GEODE_CALCITE], floor: B.GEODE_FLOOR,
    ores: [ore(B.ECHO_CRYSTAL, 'rare', 2, 'echoShard', 'echoShard', 3), ore(B.CRYSTAL, 'epic', 3, 'glimmerShard', 'glimmerShard', 2), ore(B.AMETHYST, 'epic', 3, 'gem', 'gem', 2), ore(B.GEM_ORE, 'epic', 3, 'gem', 'gem', 1)],
    light: [0.42, 0.5, 1.0], lightBlock: B.LIGHT_ABYSS, fog: 0x161028, grade: { warmth: -0.4, saturation: 1.25, exposure: 1.1 },
    hazard: { kind: 'falls', strength: 0.5 },
    mobs: roster('crystalGeode'),
    ambience: 'amb.crystalGeode', props: ['crystalCluster', 'crystalSpire', 'geodeShards'],
    shape: { tunnelWidth: 1, caverns: 1, pillars: 0.6, lakes: 0.05, lava: 0, shafts: 0.3, columns: 'crystal' },
  },
  haldenMines: {
    id: 'haldenMines', stratum: 3, depth: [180, 270], ...text('haldenMines'),
    hosts: [B.MINE_ROCK, B.MINE_SHALE], floor: B.MINE_FLOOR,
    ores: [ore(B.COAL_ORE, 'common', 1, 'coal', 'coal', 4), ore(B.IRON_ORE, 'uncommon', 2, 'ironOre', 'ironOre', 3), ore(B.SILVER_ORE, 'rare', 3, 'silverOre', 'silverOre', 2)],
    light: [1.0, 0.62, 0.3], lightBlock: B.LIGHT_LAMP, fog: 0x201610, grade: { warmth: 0.7, saturation: 1.0, exposure: 1.0 },
    hazard: { kind: 'rockfall', strength: 0.4 },
    mobs: roster('haldenMines'),
    ambience: 'amb.haldenMines', props: ['rail', 'brokenCart', 'crate', 'barrel', 'hangingLantern', 'timberProp', 'pickaxeRack'],
    shape: { tunnelWidth: 0.85, caverns: 0.4, pillars: 0.2, lakes: 0, lava: 0, shafts: 0.6, columns: 'timber' },
  },
  frostCaverns: {
    id: 'frostCaverns', stratum: 4, depth: [270, 360], ...text('frostCaverns'),
    hosts: [B.FROST_ICE, B.FROST_ROCK], floor: B.FROST_SNOW,
    ores: [ore(B.SILVER_ORE, 'uncommon', 3, 'silverOre', 'silverOre', 2), ore(B.FROST_IRON, 'rare', 4, 'rimeIron', 'rimeIron', 3), ore(B.ICE_CRYSTAL, 'epic', 4, 'frostCrystal', 'frostCrystal', 2)],
    light: [0.6, 0.82, 1.0], lightBlock: B.LIGHT_ICE, fog: 0x18243a, grade: { warmth: -0.8, saturation: 0.9, exposure: 1.1 },
    hazard: { kind: 'cold', strength: 0.7 },
    mobs: roster('frostCaverns'),
    ambience: 'amb.frostCaverns', props: ['icicle', 'iceSpike', 'frozenBones'],
    shape: { tunnelWidth: 1.05, caverns: 0.8, pillars: 0.5, lakes: 0.3, lava: 0, shafts: 0.3, columns: 'ice' },
  },
  glowrootJungle: {
    id: 'glowrootJungle', stratum: 4, depth: [270, 360], ...text('glowrootJungle'),
    hosts: [B.JUNGLE_ROCK, B.JUNGLE_LOAM], floor: B.JUNGLE_MOSS,
    ores: [ore(B.GOLD_ORE, 'uncommon', 3, 'goldOre', 'goldOre', 2), ore(B.VERDITE, 'rare', 3, 'verdite', 'verdite', 3), ore(B.SAP_AMBER, 'epic', 4, 'sapAmber', 'sapAmber', 2), ore(B.GLOW_VINE, 'common', 1, 'glowvine', 'glowvine', 2)],
    light: [0.4, 1.0, 0.36], lightBlock: B.LIGHT_GLOWROOT, fog: 0x0e2012, grade: { warmth: 0, saturation: 1.25, exposure: 1.05 },
    hazard: { kind: 'thorns', strength: 0.5 },
    mobs: roster('glowrootJungle'),
    ambience: 'amb.glowrootJungle', props: ['vineCurtain', 'fern', 'glowBulb', 'hangingRoots'],
    shape: { tunnelWidth: 1.15, caverns: 0.9, pillars: 0.4, lakes: 0.2, lava: 0, shafts: 0.2, columns: 'vines' },
  },
  sulphurBog: {
    id: 'sulphurBog', stratum: 5, depth: [360, 450], ...text('sulphurBog'),
    hosts: [B.SULPHUR_ROCK, B.BOG_MUD], floor: B.BOG_CRUST,
    ores: [ore(B.SULPHUR_ORE, 'common', 4, 'sulphur', 'sulphur', 4), ore(B.MIRE_OPAL, 'epic', 5, 'mireOpal', 'mireOpal', 2), ore(B.FROST_IRON, 'rare', 4, 'rimeIron', 'rimeIron', 1)],
    light: [0.78, 0.9, 0.2], lightBlock: B.LIGHT_SULPHUR, fog: 0x1e2210, grade: { warmth: 0.2, saturation: 1.1, exposure: 1.0 },
    hazard: { kind: 'gas', strength: 0.8 },
    mobs: roster('sulphurBog'),
    ambience: 'amb.sulphurBog', props: ['gasVent', 'bogBubble', 'deadTree', 'bones'],
    shape: { tunnelWidth: 1.05, caverns: 0.7, pillars: 0.3, lakes: 0.5, lava: 0, shafts: 0.2, columns: 'none' },
  },
  sunkenCity: {
    id: 'sunkenCity', stratum: 5, depth: [360, 450], ...text('sunkenCity'),
    hosts: [B.CITY_STONE, B.CITY_BRICK], floor: B.CITY_TILE,
    ores: [ore(B.RUNEGOLD, 'epic', 4, 'runegold', 'runegold', 3), ore(B.ORICHALCUM, 'legendary', 5, 'orichalcum', 'orichalcum', 1), ore(B.SILVER_ORE, 'uncommon', 3, 'silverOre', 'silverOre', 2)],
    light: [1.0, 0.8, 0.36], lightBlock: B.LIGHT_RUNE, fog: 0x14120c, grade: { warmth: 0.5, saturation: 1.05, exposure: 0.95 },
    hazard: { kind: 'dark', strength: 0.7 },
    mobs: roster('sunkenCity'),
    ambience: 'amb.sunkenCity', props: ['statue', 'urn', 'brokenColumn', 'runeStone', 'chest'],
    shape: { tunnelWidth: 1, caverns: 0.8, pillars: 0.8, lakes: 0.3, lava: 0, shafts: 0.1, columns: 'ruins' },
  },
  magmaVeins: {
    id: 'magmaVeins', stratum: 6, depth: [450, 540], ...text('magmaVeins'),
    hosts: [B.BASALT, B.SCORIA], floor: B.ASH_FLOOR,
    ores: [ore(B.EMBERITE, 'epic', 5, 'emberite', 'emberite', 3), ore(B.MAGMA_CORE, 'legendary', 6, 'magmaCore', 'magmaCore', 1), ore(B.ORICHALCUM, 'rare', 5, 'orichalcum', 'orichalcum', 1)],
    light: [1.0, 0.42, 0.14], lightBlock: B.LIGHT_MAGMA, fog: 0x2a0e06, grade: { warmth: 0.9, saturation: 1.15, exposure: 1.0 },
    hazard: { kind: 'lava', strength: 0.9 },
    mobs: roster('magmaVeins'),
    ambience: 'amb.magmaVeins', props: ['emberVent', 'basaltColumn', 'charredBones', 'lavaGlow'],
    shape: { tunnelWidth: 1.1, caverns: 0.8, pillars: 0.5, lakes: 0, lava: 1, shafts: 0.2, columns: 'spires' },
  },
  obsidianAbyss: {
    id: 'obsidianAbyss', stratum: 6, depth: [450, 540], ...text('obsidianAbyss'),
    hosts: [B.OBSIDIAN, B.VOID_STONE], floor: B.OBSIDIAN_FLOOR,
    ores: [ore(B.VOIDSHARD, 'epic', 5, 'voidshard', 'voidshard', 3), ore(B.STARSTEEL, 'legendary', 6, 'starsteel', 'starsteel', 1), ore(B.EMBERITE, 'rare', 5, 'emberite', 'emberite', 1)],
    light: [0.52, 0.24, 1.0], lightBlock: B.LIGHT_VOID, fog: 0x0e0818, grade: { warmth: -0.5, saturation: 1.2, exposure: 0.95 },
    hazard: { kind: 'void', strength: 0.9 },
    mobs: roster('obsidianAbyss'),
    ambience: 'amb.obsidianAbyss', props: ['glassShard', 'voidSpire', 'abyssMonolith'],
    shape: { tunnelWidth: 1.2, caverns: 1, pillars: 0.6, lakes: 0, lava: 0.2, shafts: 0.5, columns: 'spires' },
  },
  heart: {
    id: 'heart', stratum: 6, depth: [520, 540], ...text('heart'),
    hosts: [B.HEART_STONE, B.OBSIDIAN], floor: B.OBSIDIAN_FLOOR,
    ores: [],
    light: [0.9, 0.18, 0.26], lightBlock: B.LIGHT_HEART, fog: 0x1a060c, grade: { warmth: 0.4, saturation: 1.2, exposure: 1.0 },
    hazard: { kind: 'void', strength: 1 },
    mobs: roster('heart'),
    ambience: 'amb.heart', props: ['abyssMonolith'],
    shape: { tunnelWidth: 1, caverns: 1, pillars: 0, lakes: 0, lava: 0, shafts: 0, columns: 'none' },
  },
};

/** One stratum: one generated zone, two biomes, one gate down (none below VI: the Heart is there). */
export interface StratumDef {
  index: StratumIndex;
  name: TextKey;
  biomes: [BiomeId, BiomeId];
  /** Zone size in blocks (x, y, z): the same for every stratum, so a switch reuses every buffer. */
  size: [number, number, number];
  /** Displayed depth at the top of the zone (m); depth grows 1 m per block downward. */
  depthTop: number;
  /** Heart Shards that open this stratum's gate (its two guardians'). */
  shardsToOpen: number;
  /** The pick tier the stratum is built for (its host rock and its main ores). */
  tier: number;
}

/** Every stratum is 256 x 96 x 256 blocks: 2.5x the old world's floor, 6 chunks tall. */
export const STRATUM_SIZE: [number, number, number] = [256, 96, 256];
/** Depth (m) per stratum, and the block row at the zone's top that reads as the stratum's top depth. */
export const STRATUM_DEPTH = 90;
/**
 * Halden's 24 journal pages (LOOP's text, `page.N.title|body`), four per stratum: the biome each is
 * found in (by its content), whether it names that biome's guardian (reading it marks the lair on
 * the map), and pages tied to a place (the camp's, the one past the first gate, the Heart's door).
 */
export const PAGE_PLAN: ReadonlyArray<{ n: number; biome: BiomeId; lair: boolean; near?: 'arrival' | 'gate' }> = [
  { n: 1, biome: 'amberHollows', lair: false, near: 'arrival' },
  { n: 2, biome: 'amberHollows', lair: false },
  { n: 3, biome: 'amberHollows', lair: true },
  { n: 4, biome: 'mushroomForest', lair: true },
  { n: 5, biome: 'rootGalleries', lair: false, near: 'arrival' },
  { n: 6, biome: 'rootGalleries', lair: true },
  { n: 7, biome: 'floodedGrottoes', lair: true },
  { n: 8, biome: 'floodedGrottoes', lair: false },
  { n: 9, biome: 'crystalGeode', lair: true },
  { n: 10, biome: 'haldenMines', lair: true },
  { n: 11, biome: 'haldenMines', lair: false },
  { n: 12, biome: 'crystalGeode', lair: false },
  { n: 13, biome: 'frostCaverns', lair: false },
  { n: 14, biome: 'frostCaverns', lair: true },
  { n: 15, biome: 'glowrootJungle', lair: false },
  { n: 16, biome: 'glowrootJungle', lair: true },
  { n: 17, biome: 'sulphurBog', lair: true },
  { n: 18, biome: 'sunkenCity', lair: false },
  { n: 19, biome: 'sunkenCity', lair: false },
  { n: 20, biome: 'sunkenCity', lair: true },
  { n: 21, biome: 'magmaVeins', lair: true },
  { n: 22, biome: 'obsidianAbyss', lair: true },
  { n: 23, biome: 'obsidianAbyss', lair: false },
  { n: 24, biome: 'obsidianAbyss', lair: false, near: 'gate' },
];
export const STRATUM_TOP_Y = 92;

export const STRATA: readonly StratumDef[] = ([1, 2, 3, 4, 5, 6] as const).map((index) => ({
  index,
  name: key(`stratum.${index}`),
  biomes: [BIOME_IDS[(index - 1) * 2], BIOME_IDS[(index - 1) * 2 + 1]] as [BiomeId, BiomeId],
  size: STRATUM_SIZE,
  depthTop: (index - 1) * STRATUM_DEPTH,
  shardsToOpen: 2,
  tier: index,
}));

export const stratumDef = (s: number): StratumDef => STRATA[Math.max(1, Math.min(STRATUM_COUNT, Math.floor(s))) - 1];

/** Displayed depth (m) of feet at block height y in stratum s. */
export function depthAt(s: number, y: number): number {
  return Math.max(0, stratumDef(s).depthTop + (STRATUM_TOP_Y - y));
}

/** The biome's text (keys from WORLD_TEXT_EN). */
export function biomeText(id: BiomeId, field: 'name' | 'desc' | 'hazardText' | 'gearText' | 'rumour'): TextKey {
  return BIOMES[id][field];
}

/** Every ore block with its biome (LOOP: rarities and drops; VIS: the highlight and the sonar). */
export function allOres(): Array<BiomeOre & { biome: BiomeId }> {
  const out: Array<BiomeOre & { biome: BiomeId }> = [];
  for (const id of BIOME_IDS) for (const o of BIOMES[id].ores) out.push({ ...o, biome: id });
  return out;
}

/** The biome index of a stratum's biome (0 = A, 1 = B), or -1. */
export const biomeSlot = (s: StratumIndex, id: BiomeId): number => stratumDef(s).biomes.indexOf(id);
