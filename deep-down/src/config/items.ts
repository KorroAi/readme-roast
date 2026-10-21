import type { TextKey } from '../i18n';
import { TILE } from './tiles';

/** Materials, then key items: the Ancient Tablet is the Lantern rune (its id is kept for saves). */
export type ItemId =
  | 'stone'
  | 'rootFibre'
  | 'copperOre'
  | 'ironOre'
  | 'glimmerShard'
  | 'echoShard'
  // Round 2 (WORLD): gems from the gem pockets (and the Glimmerkin), and the Forge's Flash Charges.
  | 'gem'
  | 'flashCharge'
  | 'ancientTablet'
  | 'runeDescent'
  | 'runeEye'
  | 'runeStar'
  | 'runeSpire'
  | 'runeGate'
  | 'runeWaves'
  | 'runeChasm'
  // Relics (key items with one lore line in the Journal): the reliquary's and the gallery's tablets,
  // and the three beyond the rift (finished game, content).
  | 'bearerLens'
  | 'firstLamp'
  | 'relicGlowroot'
  | 'relicChoir'
  | 'relicEmber';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'relic';

export interface ItemDef {
  id: ItemId;
  name: TextKey;
  desc: TextKey;
  stackSize: number;
  rarity: Rarity;
  /** Icon style: a block-textured cube, a crystal shard, or a tablet. */
  icon: { kind: 'cube'; tile: number } | { kind: 'shard' } | { kind: 'tablet' };
  /** sRGB color used for pickup flashes, particles and rarity accents. */
  color: number;
  /** Key items go to the journal instead of taking backpack space and are never lost. */
  keyItem: boolean;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  stone: {
    id: 'stone',
    name: 'item.stone',
    desc: 'item.stone.desc',
    stackSize: 30,
    rarity: 'common',
    icon: { kind: 'cube', tile: TILE.slate },
    color: 0x8a95a8,
    keyItem: false,
  },
  rootFibre: {
    id: 'rootFibre',
    name: 'item.rootFibre',
    desc: 'item.rootFibre.desc',
    stackSize: 20,
    rarity: 'common',
    icon: { kind: 'cube', tile: TILE.soil },
    color: 0xb59a6e,
    keyItem: false,
  },
  copperOre: {
    id: 'copperOre',
    name: 'item.copperOre',
    desc: 'item.copperOre.desc',
    stackSize: 15,
    rarity: 'uncommon',
    icon: { kind: 'cube', tile: TILE.copperOre },
    color: 0xe0874a,
    keyItem: false,
  },
  ironOre: {
    id: 'ironOre',
    name: 'item.ironOre',
    desc: 'item.ironOre.desc',
    stackSize: 10,
    rarity: 'uncommon',
    icon: { kind: 'cube', tile: TILE.ironOre },
    color: 0xc9b7a6,
    keyItem: false,
  },
  glimmerShard: {
    id: 'glimmerShard',
    name: 'item.glimmerShard',
    desc: 'item.glimmerShard.desc',
    stackSize: 10,
    rarity: 'rare',
    icon: { kind: 'shard' },
    color: 0x52e8f5,
    keyItem: false,
  },
  echoShard: {
    id: 'echoShard',
    name: 'item.echoShard',
    desc: 'item.echoShard.desc',
    stackSize: 5,
    rarity: 'rare',
    icon: { kind: 'shard' },
    color: 0xd8f4f6,
    keyItem: false,
  },
  gem: {
    id: 'gem',
    name: 'item.gem',
    desc: 'item.gem.desc',
    stackSize: 8,
    rarity: 'rare',
    icon: { kind: 'shard' },
    color: 0xb98cff,
    keyItem: false,
  },
  flashCharge: {
    id: 'flashCharge',
    name: 'item.flashCharge',
    desc: 'item.flashCharge.desc',
    stackSize: 6,
    rarity: 'uncommon',
    icon: { kind: 'shard' },
    color: 0xfff1c4,
    keyItem: false,
  },
  ancientTablet: {
    id: 'ancientTablet',
    name: 'item.ancientTablet',
    desc: 'item.ancientTablet.desc',
    stackSize: 1,
    rarity: 'relic',
    icon: { kind: 'tablet' },
    color: 0x7ff0ff,
    keyItem: true,
  },
  runeDescent: rune('runeDescent'),
  runeEye: rune('runeEye'),
  runeStar: rune('runeStar'),
  runeSpire: rune('runeSpire'),
  runeGate: rune('runeGate'),
  runeWaves: rune('runeWaves'),
  runeChasm: rune('runeChasm'),
  bearerLens: relic('bearerLens', 0xbfe9ff),
  firstLamp: relic('firstLamp', 0xffd28a),
  relicGlowroot: relic('relicGlowroot', 0xc8f08a),
  relicChoir: relic('relicChoir', 0x9ff6ff),
  relicEmber: relic('relicEmber', 0xff9a5a),
};

/** The relics, in Journal order (found in the world, never lost). */
export const RELIC_ITEMS = ['bearerLens', 'firstLamp', 'relicGlowroot', 'relicChoir', 'relicEmber'] as const satisfies readonly ItemId[];

/** The eight runes: the Ancient Tablet (the Lantern rune) plus seven rune stones. */
export const RUNE_ITEMS = ['runeDescent', 'runeEye', 'runeStar', 'ancientTablet', 'runeSpire', 'runeGate', 'runeWaves', 'runeChasm'] as const satisfies readonly ItemId[];

function relic(id: ItemId, color: number): ItemDef {
  return { id, name: `item.${id}` as TextKey, desc: `item.${id}.desc` as TextKey, stackSize: 1, rarity: 'relic', icon: { kind: 'tablet' }, color, keyItem: true };
}

function rune(id: ItemId): ItemDef {
  return { id, name: `item.${id}` as TextKey, desc: `item.${id}.desc` as TextKey, stackSize: 1, rarity: 'relic', icon: { kind: 'tablet' }, color: 0x7ff0ff, keyItem: true };
}

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Rarity accents: the brand tokens (src/ui/brand/tokens.ts RARITY). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#c9bfae',
  uncommon: '#e58444',
  rare: '#8fe3ee',
  relic: '#b9a2ff',
};
