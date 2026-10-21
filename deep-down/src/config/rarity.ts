import { B, BLOCKS, SOLID, UNBREAKABLE_TIER } from './blocks';
import type { ItemId } from './items';
import type { PropKind, PropSpec } from '../world/gen/types';

/**
 * Rarity tiers (round 2, WORLD seam): only interesting things are minable, and every minable or
 * collectable thing shows a highlight in its rarity colour (render/highlight, VIS).
 *
 * | Rarity    | What                                                   | Colour                      |
 * |-----------|--------------------------------------------------------|-----------------------------|
 * | common    | rubble, root tangles, copper, cracked walls, seals, crates | soft warm white `#f2e6cf` |
 * | uncommon  | iron, Halden chests and caches                         | green `#6fe08a`             |
 * | rare      | crystal clusters, echo crystal                         | blue `#5fb7ff`              |
 * | epic      | glimmer crystal seams, the glimmer bloom, gem pockets  | violet `#b98cff`            |
 * | legendary | lanternstone, relics, rune stones, secret chests       | gold `#ffcf5a`, slow shimmer |
 *
 * Ordinary rock, bedrock, soil, gravel and masonry have no rarity (null) and are never minable:
 * a tap on them is a soft "tunk" (FP). The progression seals (hardened slate, Ironbound, ember
 * glass) are minable from their tier; below it they keep their highlight (common) and the tap says
 * which pick is needed.
 */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export const RARITIES: readonly Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/** 0 (common) .. 4 (legendary): the tap hit-test prefers the higher rank, then the nearer. */
export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };

/** The highlight colours (sRGB hex strings, and as numbers for three.js). */
export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#f2e6cf',
  uncommon: '#6fe08a',
  rare: '#5fb7ff',
  epic: '#b98cff',
  legendary: '#ffcf5a',
};
export const RARITY_HEX: Record<Rarity, number> = {
  common: 0xf2e6cf,
  uncommon: 0x6fe08a,
  rare: 0x5fb7ff,
  epic: 0xb98cff,
  legendary: 0xffcf5a,
};

/** Highlight rules (ROUND2 §0.3): visible within this range of the eye (m), one calm pulse at most every 2.5 s. */
export const HIGHLIGHT = {
  range: 14,
  pulseSeconds: 2.5,
  /** Only legendary things shimmer (a slow sweep). */
  shimmer: { legendary: true } as Partial<Record<Rarity, boolean>>,
} as const;

/** Rarity per block id (null: not minable, no highlight). */
const BLOCK_RARITY = new Array<Rarity | null>(256).fill(null);
BLOCK_RARITY[B.RUBBLE] = 'common';
BLOCK_RARITY[B.ROOTS] = 'common';
BLOCK_RARITY[B.COPPER_ORE] = 'common';
BLOCK_RARITY[B.CRUMBLING_BRICK] = 'common';
BLOCK_RARITY[B.HARDENED_SLATE] = 'common';
BLOCK_RARITY[B.IRONBOUND] = 'common';
BLOCK_RARITY[B.EMBER_GLASS] = 'common';
BLOCK_RARITY[B.IRON_ORE] = 'uncommon';
BLOCK_RARITY[B.ECHO_CRYSTAL] = 'rare';
BLOCK_RARITY[B.CRYSTAL] = 'epic';
BLOCK_RARITY[B.GEM_ORE] = 'epic';
BLOCK_RARITY[B.LANTERNSTONE] = 'legendary';

/** The progression seals: minable by tier (hardened slate 2, Ironbound 3, ember glass 4). */
export const SEAL_BLOCKS: ReadonlySet<number> = new Set([B.HARDENED_SLATE, B.IRONBOUND, B.EMBER_GLASS]);

/** Per block id, 0..5: 0 none, else RARITY_RANK + 1 (flat table for shaders and hot loops). */
export const RARITY_CODE = new Uint8Array(256);
for (let id = 0; id < 256; id++) {
  const r = BLOCK_RARITY[id];
  RARITY_CODE[id] = r ? RARITY_RANK[r] + 1 : 0;
}

/** Props that are collectable or usable finds, by kind (the spec refines it: see rarityOf). */
const PROP_RARITY: Partial<Record<PropKind, Rarity>> = {
  crystalCluster: 'rare',
  crate: 'common',
  barrel: 'common',
  chest: 'uncommon',
  satchel: 'uncommon',
  haldenNote: 'common',
  tablet: 'legendary',
  runeStone: 'legendary',
};

/**
 * The rarity of a block id, a prop kind or a prop spec; null when it is not a minable or
 * collectable thing (plain rock, lamps, camp furniture, ropes).
 * - A prop spec: a secret alcove's chest and a relic are legendary; the glimmer bloom is epic; any
 *   other crystal cluster is rare; a Halden cache (feature 'cache') takes its container's rarity;
 *   a camp chest (storage) has none.
 */
export function rarityOf(x: number | PropKind | PropSpec): Rarity | null {
  if (typeof x === 'number') return BLOCK_RARITY[x & 255] ?? null;
  if (typeof x === 'string') return PROP_RARITY[x] ?? null;
  const spec = x;
  if (spec.secret) return 'legendary';
  if (spec.feature?.kind === 'relic' || spec.interact === 'relic' || spec.interact === 'rune') return 'legendary';
  if (spec.id.startsWith('bloom_e')) return 'epic';
  if (spec.minable) return 'rare';
  if (spec.feature?.kind === 'cache') return PROP_RARITY[spec.kind] ?? 'common';
  if (spec.feature?.kind === 'note') return 'common';
  if (spec.interact === 'storage' || spec.interact === 'craft' || spec.interact === 'rest' || spec.interact === 'station') return null;
  return null;
}

/**
 * Can a pick of `tier` break block `id`? False for air, lights, plain rock, masonry, structures and
 * the camp; seals and veins need their tier.
 */
export function isMinable(id: number, tier: number): boolean {
  const d = BLOCKS[id & 255];
  if (!d || !SOLID[d.id] || d.plain || d.protectedReason || d.tier >= UNBREAKABLE_TIER) return false;
  return d.tier <= tier;
}

/** Can block `id` be broken by some pick (whatever the current tier)? */
export function isBreakable(id: number): boolean {
  return isMinable(id, UNBREAKABLE_TIER - 1);
}

/** The rarity an item reads as (pickup flashes, the bag, the journal legend). */
export const ITEM_RARITY: Partial<Record<ItemId, Rarity>> = {
  stone: 'common',
  rootFibre: 'common',
  copperOre: 'common',
  ironOre: 'uncommon',
  echoShard: 'rare',
  glimmerShard: 'epic',
  gem: 'epic',
  flashCharge: 'uncommon',
  ancientTablet: 'legendary',
  bearerLens: 'legendary',
  firstLamp: 'legendary',
  relicGlowroot: 'legendary',
  relicChoir: 'legendary',
  relicEmber: 'legendary',
};

export function itemRarity(item: ItemId): Rarity {
  return ITEM_RARITY[item] ?? (item.startsWith('rune') ? 'legendary' : 'common');
}

/** The legend shown once in the first-time card and in the journal: [rarity, i18n key of its examples]. */
export const RARITY_LEGEND: ReadonlyArray<{ rarity: Rarity; name: `rarity.${Rarity}`; what: `rarity.${Rarity}.what` }> = RARITIES.map((r) => ({
  rarity: r,
  name: `rarity.${r}` as const,
  what: `rarity.${r}.what` as const,
}));
