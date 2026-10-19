import { ITEMS, type ItemId } from '../config/items';
import { RECIPE_LIST, type RecipeDef } from '../config/recipes';
import { t } from '../i18n';
import type { ItemCounts } from '../save/types';
import type { ObjectiveView } from './Objectives';

/**
 * The Next line: the one actionable sentence on the objective pill. It is never empty and
 * never says "done". In priority order:
 *   1. a pack is waiting (a cache exists)  -> "Recover your pack — 84 m"
 *   2. the tutorial chain is not finished  -> its current step
 *   3. the upgrade closest to affordable    -> "Next: Copper Lantern — Glimmer Shard 1/3"
 *   4. otherwise                            -> "Go deeper — your best is -96 m"
 * Later waves insert their lines (field sites, runes, seams) in this function.
 */
export interface NextInput {
  /** Walking metres to the cache, or null when there is none. */
  cacheDistance: number | null;
  /** The tutorial chain's current step, or null once it is complete. */
  chain: Readonly<ObjectiveView> | null;
  /** Equipment tiers owned. */
  equipment: Readonly<Record<RecipeDef['result']['slot'], number>>;
  /** Materials available for crafting (pack + storage). */
  available: ItemCounts;
  /** Deepest depth ever reached, metres. */
  bestDepth: number;
}

export interface NextLine {
  id: string;
  text: string;
}

export function nextLine(s: NextInput): NextLine {
  if (s.cacheDistance !== null) return { id: 'recoverPack', text: t('next.recoverPack', { distance: Math.max(0, Math.round(s.cacheDistance)) }) };
  if (s.chain) return { id: s.chain.id, text: s.chain.text };
  const craft = closestRecipe(s.equipment, s.available);
  if (craft) {
    const item = t(craft.recipe.name);
    if (!craft.short) return { id: `craft:${craft.recipe.id}`, text: t('next.craftReady', { item }) };
    const [id, have, need] = craft.short;
    return { id: `craft:${craft.recipe.id}`, text: t('next.craft', { item, material: t(ITEMS[id].name), have, need }) };
  }
  return { id: 'deeper', text: t('next.deeper', { depth: Math.max(0, Math.round(s.bestDepth)) }) };
}

/**
 * The unowned recipe with the fewest materials still missing (ties: list order), and its first
 * short input as [item, have, need] (null when it can be crafted now).
 */
export function closestRecipe(
  equipment: NextInput['equipment'],
  available: ItemCounts,
): { recipe: RecipeDef; missing: number; short: [ItemId, number, number] | null } | null {
  let best: { recipe: RecipeDef; missing: number; short: [ItemId, number, number] | null } | null = null;
  for (const recipe of RECIPE_LIST) {
    if ((equipment[recipe.result.slot] ?? 1) >= recipe.result.tier) continue;
    let missing = 0;
    let short: [ItemId, number, number] | null = null;
    for (const [id, need] of Object.entries(recipe.inputs) as Array<[ItemId, number]>) {
      const have = available[id] ?? 0;
      if (have < need) {
        missing += need - have;
        short ??= [id, have, need];
      }
    }
    if (!best || missing < best.missing) best = { recipe, missing, short };
  }
  return best;
}
