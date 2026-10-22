import type { BiomeKey, ItemId } from './items';
import { allOres } from './biomes';
import { B } from './blocks';

/**
 * Loot (round 3, LOOP): what a chest holds, and the bonus drops of mined blocks.
 *
 * - `lootFor(kind, tier, rng, biome)`: a chest's contents (WORLD calls it in the worker when it
 *   places a chest; deterministic for the rng's stream). A chest holds 2–3 materials of its
 *   stratum, 1–2 supplies (torches, food, oil, rope, flares, potions by depth), and the rarer
 *   chests (vaults, lairs, ore rooms, shrines) an ingot bundle or a gem of the stratum.
 * - `BONUS_DROPS`: loose rock with every ore (stone for the Furnace, bricks and glass), applied
 *   by the loop hub on 'block:broken' (game/craft/Loop).
 */
export interface LootRng {
  next(): number;
  int(lo: number, hi: number): number;
}

export type ChestKind = 'tunnel' | 'vault' | 'camp' | 'shrine' | 'lair' | 'oreRoom' | 'secret' | 'dungeon' | 'ravine' | 'setPiece';

/** The chests that hold a prize (the stratum's bars or a gem) and more materials. */
const RICH: ReadonlySet<ChestKind> = new Set<ChestKind>(['vault', 'lair', 'oreRoom', 'shrine', 'secret', 'dungeon', 'setPiece']);
export type Loot = Partial<Record<ItemId, number>>;

type Entry = readonly [item: ItemId, min: number, max: number, weight: number];

/** The materials a chest of each tier draws from (biome-flavoured below). */
const MATERIALS: Record<number, readonly Entry[]> = {
  1: [['stone', 2, 4, 4], ['copperOre', 1, 3, 4], ['coal', 1, 2, 4], ['fungalWood', 1, 2, 3], ['glowcap', 1, 2, 2], ['amber', 1, 1, 1.5], ['hide', 1, 1, 1], ['chitin', 1, 2, 1], ['sporeQuartz', 1, 1, 0.6]],
  2: [['stone', 2, 4, 3], ['ironOre', 1, 2, 4], ['rootFibre', 1, 3, 3], ['coal', 1, 2, 3], ['hide', 1, 1, 1], ['heartwood', 1, 1, 1.2], ['goldOre', 1, 1, 1.2], ['pearl', 1, 1, 0.8], ['glimmerShard', 1, 1, 0.6]],
  3: [['stone', 2, 4, 2], ['haldenScrap', 2, 4, 3], ['silverOre', 1, 2, 3], ['coal', 1, 3, 3], ['glimmerShard', 1, 2, 2], ['blackOil', 1, 2, 2], ['echoShard', 1, 1, 1], ['gem', 1, 1, 0.5]],
  4: [['rimeIron', 1, 3, 4], ['glowvine', 2, 4, 3], ['silverOre', 1, 2, 2], ['goldOre', 1, 2, 2], ['coal', 1, 3, 2], ['frostCrystal', 1, 1, 1], ['sapAmber', 1, 1, 1], ['verdite', 1, 1, 0.5]],
  5: [['sulphur', 2, 4, 4], ['runegold', 1, 2, 3], ['rimeIron', 1, 2, 2], ['silverOre', 1, 2, 2], ['coal', 1, 3, 2], ['mireOpal', 1, 1, 0.7], ['orichalcum', 1, 1, 0.4]],
  6: [['emberite', 1, 3, 4], ['sulphur', 1, 3, 2], ['runegold', 1, 2, 2], ['coal', 2, 3, 2], ['voidshard', 1, 1, 1], ['magmaCore', 1, 1, 0.5], ['starsteel', 1, 1, 0.25]],
};

/** Supplies by tier (each tier also draws from the ones above it). */
const SUPPLIES: Record<number, readonly Entry[]> = {
  1: [['torch', 2, 4, 4], ['bandage', 1, 2, 3], ['oilFlask', 1, 1, 2], ['rope', 2, 3, 1.5], ['flare', 1, 2, 1], ['flashCharge', 1, 2, 1]],
  2: [['roastCap', 1, 3, 2], ['blastBomb', 1, 2, 1], ['ladder', 2, 3, 1]],
  3: [['healingDraught', 1, 1, 2], ['caveStew', 1, 2, 2]],
  4: [['warmingTonic', 1, 2, 3]],
  5: [['antidote', 1, 2, 3]],
  6: [['coolingDraught', 1, 2, 3]],
};

/** A rare chest's prize: the stratum's bars or a gem. */
const PRIZE: Record<number, readonly Entry[]> = {
  1: [['copperIngot', 2, 4, 3], ['amber', 2, 3, 2], ['sporeQuartz', 1, 2, 1]],
  2: [['ironIngot', 2, 3, 3], ['goldIngot', 1, 2, 2], ['pearl', 1, 2, 1]],
  3: [['silverIngot', 2, 3, 3], ['gem', 1, 2, 2], ['echoShard', 1, 2, 1]],
  4: [['coldsteelIngot', 1, 2, 3], ['frostCrystal', 1, 2, 2], ['verdite', 1, 1, 1]],
  5: [['sunmetalIngot', 1, 2, 3], ['mireOpal', 1, 2, 2], ['orichalcum', 1, 1, 1]],
  6: [['embersteelIngot', 1, 2, 3], ['magmaCore', 1, 1, 1.5], ['voidshard', 1, 2, 1.5], ['starsteel', 1, 1, 0.5]],
};

/** A biome's own materials are twice as likely in its chests. */
const BIOME_FAVOURS: Partial<Record<BiomeKey, readonly ItemId[]>> = {
  amberHollows: ['copperOre', 'coal', 'amber'],
  mushroomForest: ['glowcap', 'fungalWood', 'sporeQuartz'],
  rootGalleries: ['rootFibre', 'heartwood', 'goldOre'],
  floodedGrottoes: ['pearl', 'ironOre', 'glimmerShard'],
  crystalGeode: ['glimmerShard', 'echoShard', 'gem'],
  haldenMines: ['haldenScrap', 'blackOil', 'silverOre'],
  frostCaverns: ['rimeIron', 'frostCrystal'],
  glowrootJungle: ['glowvine', 'sapAmber', 'verdite'],
  sulphurBog: ['sulphur', 'mireOpal'],
  sunkenCity: ['runegold', 'orichalcum'],
  magmaVeins: ['emberite', 'magmaCore'],
  obsidianAbyss: ['voidshard', 'starsteel'],
};

const clampTier = (t: number) => Math.max(1, Math.min(6, Math.floor(t) || 1));

function pick(entries: readonly Entry[], rng: LootRng, favour: readonly ItemId[] = [], skip: ReadonlySet<ItemId> = new Set()): Entry | null {
  let total = 0;
  for (const e of entries) if (!skip.has(e[0])) total += e[3] * (favour.includes(e[0]) ? 2 : 1);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const e of entries) {
    if (skip.has(e[0])) continue;
    r -= e[3] * (favour.includes(e[0]) ? 2 : 1);
    if (r <= 0) return e;
  }
  return entries.find((e) => !skip.has(e[0])) ?? null;
}

function add(out: Loot, e: Entry | null, rng: LootRng, mult = 1): void {
  if (!e) return;
  const n = rng.int(e[1], e[2]) * mult;
  if (n > 0) out[e[0]] = (out[e[0]] ?? 0) + n;
}

/**
 * A chest's contents. `tier` is the stratum (WORLD adds 1 for vaults and lairs: it is clamped to
 * 1..6); `kind` decides how rich it is; `biome` flavours the materials.
 */
export function lootFor(kind: ChestKind, tier: number, rng: LootRng, biome?: BiomeKey | null): Loot {
  const t = clampTier(tier);
  const out: Loot = {};
  const favour = (biome && BIOME_FAVOURS[biome]) || [];
  const rich = RICH.has(kind);
  const taken = new Set<ItemId>();
  // A find, not the economy: one or two materials (the veins are the economy), a supply now and then.
  const materials = rich ? 2 : 1 + (rng.next() < 0.25 ? 1 : 0);
  for (let i = 0; i < materials; i++) {
    const e = pick(MATERIALS[t], rng, favour, taken);
    if (e) taken.add(e[0]);
    add(out, e, rng, kind === 'oreRoom' ? 2 : 1);
  }
  const supplyPool: Entry[] = [];
  for (let k = 1; k <= t; k++) supplyPool.push(...SUPPLIES[k]);
  const supplies = rich || kind === 'camp' ? 1 + (rng.next() < 0.5 ? 1 : 0) : rng.next() < 0.55 ? 1 : 0;
  for (let i = 0; i < supplies; i++) {
    const e = pick(supplyPool, rng, [], taken);
    if (e) taken.add(e[0]);
    add(out, e, rng);
  }
  // Never an empty chest.
  if (Object.keys(out).length === 0) add(out, pick(MATERIALS[t], rng, favour), rng);
  if (rich) add(out, pick(PRIZE[t], rng, favour), rng, kind === 'vault' || kind === 'secret' || kind === 'dungeon' ? 2 : 1);
  return out;
}

/** A bonus drop of a mined block: `item` × min..max with `chance`. */
export interface BonusDrop {
  item: ItemId;
  min: number;
  max: number;
  chance: number;
}

/**
 * Bonus drops per block id: every biome ore gives loose rock (stone) 40 % of the time, so the
 * Furnace, bricks and glass are in reach of anyone who mines. The cracked walls of vaults give
 * extra rubble.
 */
export const BONUS_DROPS: ReadonlyMap<number, BonusDrop> = (() => {
  const m = new Map<number, BonusDrop>();
  for (const o of allOres()) {
    const id = o.block & 255;
    if (m.has(id) || o.item === 'stone') continue;
    m.set(id, { item: 'stone', min: 1, max: 1, chance: 0.4 });
  }
  for (const id of [B.COPPER_ORE, B.IRON_ORE]) if (!m.has(id)) m.set(id, { item: 'stone', min: 1, max: 1, chance: 0.4 });
  m.set(B.CRACKED_WALL, { item: 'stone', min: 1, max: 2, chance: 1 });
  return m;
})();
