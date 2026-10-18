import { packForTier } from '../config/balance';
import type { ItemId } from '../config/items';
import { RECIPES, type RecipeDef, type RecipeId } from '../config/recipes';
import type { ItemCounts } from '../save/types';
import type { Equipment } from './Equipment';
import type { Backpack } from './Inventory';
import type { CampStorage } from './Storage';

/**
 * Workbench rules. Inputs are counted across camp storage and the backpack; crafting spends
 * storage first so the backpack keeps as much free space as possible for the next trip.
 */

export type CraftReason = 'ok' | 'missing' | 'owned' | 'notAtCamp';

export interface CraftResult {
  ok: boolean;
  /** Why it cannot be crafted. Precedence: owned > notAtCamp > missing. */
  reason: CraftReason;
  /** Per input: how many more are needed (only inputs that are short). */
  missing: ItemCounts;
  /** Per input: how many are available (backpack + storage) before crafting. */
  have: ItemCounts;
  /**
   * Set when a successful craft upgraded the pack: the backpack's new slot count.
   * craft() has already resized the backpack it was given, so callers only use this to
   * refresh views; it is null for every other outcome.
   */
  packSlots: number | null;
}

/**
 * Can `recipeId` be crafted right now? `atCamp` defaults to true so the UI can preview
 * materials anywhere; craft() always requires it explicitly.
 */
export function evaluate(
  recipeId: RecipeId,
  backpack: Backpack,
  storage: CampStorage,
  equipment: Equipment,
  atCamp = true,
): CraftResult {
  const recipe = recipeDef(recipeId);
  const have: ItemCounts = {};
  const missing: ItemCounts = {};
  let short = false;
  for (const [id, need] of inputs(recipe)) {
    const n = backpack.count(id) + storage.count(id);
    have[id] = n;
    if (n < need) {
      missing[id] = need - n;
      short = true;
    }
  }
  const reason: CraftReason =
    equipment.tier(recipe.result.slot) >= recipe.result.tier ? 'owned' : !atCamp ? 'notAtCamp' : short ? 'missing' : 'ok';
  return { ok: reason === 'ok', reason, missing, have, packSlots: null };
}

/**
 * Craft `recipeId`: on success spends the inputs (storage first, then backpack), upgrades the
 * equipment, and when the result is a pack, resizes `backpack` to the new pack's slot count.
 * Nothing is changed on failure.
 */
export function craft(recipeId: RecipeId, backpack: Backpack, storage: CampStorage, equipment: Equipment, atCamp: boolean): CraftResult {
  const res = evaluate(recipeId, backpack, storage, equipment, atCamp);
  if (!res.ok) return res;
  const recipe = recipeDef(recipeId);
  for (const [id, need] of inputs(recipe)) {
    const fromStorage = storage.remove(id, need);
    backpack.remove(id, need - fromStorage);
  }
  const { slot, tier } = recipe.result;
  equipment.upgrade(slot, tier);
  if (slot === 'pack') {
    res.packSlots = packForTier(equipment.tier('pack')).slots;
    backpack.resize(res.packSlots);
  }
  return res;
}

/** Namespace-style access used by the game: Crafting.evaluate / Crafting.craft. */
export const Crafting = { evaluate, craft } as const;

function recipeDef(id: RecipeId): RecipeDef {
  const r = RECIPES[id];
  if (!r) throw new Error(`Crafting: unknown recipe "${id}"`);
  return r;
}

function inputs(recipe: RecipeDef): Array<[ItemId, number]> {
  return (Object.entries(recipe.inputs) as Array<[ItemId, number | undefined]>)
    .filter((e): e is [ItemId, number] => (e[1] ?? 0) > 0);
}
