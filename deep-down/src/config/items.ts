import type { TextKey } from '../i18n';
import { TILE } from './tiles';

export type ItemId = 'stone' | 'copperOre' | 'ironOre' | 'glimmerShard' | 'ancientTablet';

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
    stackSize: 40,
    rarity: 'common',
    icon: { kind: 'cube', tile: TILE.slate },
    color: 0x8a95a8,
    keyItem: false,
  },
  copperOre: {
    id: 'copperOre',
    name: 'item.copperOre',
    desc: 'item.copperOre.desc',
    stackSize: 30,
    rarity: 'uncommon',
    icon: { kind: 'cube', tile: TILE.copperOre },
    color: 0xe0874a,
    keyItem: false,
  },
  ironOre: {
    id: 'ironOre',
    name: 'item.ironOre',
    desc: 'item.ironOre.desc',
    stackSize: 30,
    rarity: 'uncommon',
    icon: { kind: 'cube', tile: TILE.ironOre },
    color: 0xc9b7a6,
    keyItem: false,
  },
  glimmerShard: {
    id: 'glimmerShard',
    name: 'item.glimmerShard',
    desc: 'item.glimmerShard.desc',
    stackSize: 20,
    rarity: 'rare',
    icon: { kind: 'shard' },
    color: 0x52e8f5,
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
};

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#aab4c4',
  uncommon: '#f0a060',
  rare: '#5ff0ff',
  relic: '#c9a2ff',
};
