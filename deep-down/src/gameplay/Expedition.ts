import { ITEMS } from '../config/items';
import type { ItemCounts } from '../save/types';
import { addCounts, isItemId, toAmount, totalCount } from './counts';
import type { Backpack } from './Inventory';
import type { CampStorage } from './Storage';

/**
 * The expedition risk rule in one place: what you carry is at stake, what you banked is safe.
 *
 * - A black-out (or abandoning the trip) leaves one cache where the explorer last stood safely:
 *   the pack minus the Sealed Pouch, plus any loose drops still on the ground. Walk back to it
 *   and the items return. Only one cache exists: a second black-out destroys the first.
 * - Camp storage, equipment and journal key items are never at risk.
 * - Entering camp banks the whole backpack into storage.
 */

export { totalCount } from './counts';

/** A pack left behind, waiting at a cell (feet position x, y, z). Saved in SaveData.progression.cache. */
export interface CacheState {
  x: number;
  y: number;
  z: number;
  items: ItemCounts;
  /** Displayed depth in metres where it lies. */
  depth: number;
}

/**
 * What a black-out leaves behind: everything outside the Sealed Pouch, plus loose drops (key
 * items among the drops are ignored: they are never lost). Empties those slots of `backpack`.
 */
export function makeCache(backpack: Backpack, groundDrops?: ItemCounts): ItemCounts {
  const items = backpack.takeUnprotected();
  if (groundDrops) {
    const loose: ItemCounts = {};
    for (const id in groundDrops) if (isItemId(id) && !ITEMS[id].keyItem) loose[id] = toAmount(groundDrops[id]);
    addCounts(items, loose);
  }
  return items;
}

/**
 * One cache at a time. A black-out leaves `items` at `at` (feet cell, depth in metres) and
 * destroys any older cache, even when it leaves nothing itself. @returns the new cache (null
 * when nothing was left) and how many items the old one held (lost for good).
 */
export function replaceCache(old: CacheState | null, items: ItemCounts, at: { x: number; y: number; z: number; depth: number }): { cache: CacheState | null; replaced: number } {
  const replaced = old ? totalCount(old.items) : 0;
  const cache = totalCount(items) > 0 ? { x: at.x, y: at.y, z: at.z, depth: at.depth, items: { ...items } } : null;
  return { cache, replaced };
}

/**
 * Pick a cache up: as much as fits goes into `backpack`; anything that does not fit stays in
 * the cache (whose `items` are updated). @returns what was taken and what is left.
 */
export function recoverCache(cache: CacheState, backpack: Backpack): { taken: ItemCounts; count: number; left: number } {
  const taken: ItemCounts = {};
  for (const id in cache.items) {
    if (!isItemId(id)) continue;
    const want = toAmount(cache.items[id]);
    if (want === 0) continue;
    const n = backpack.add(id, want);
    if (n > 0) taken[id] = n;
    const rest = want - n;
    if (rest > 0) cache.items[id] = rest;
    else delete cache.items[id];
  }
  return { taken, count: totalCount(taken), left: totalCount(cache.items) };
}

/** True when the backpack can take at least one of the cache's items. */
export function cacheFits(cache: CacheState, backpack: Backpack): boolean {
  for (const id in cache.items) if (isItemId(id) && (cache.items[id] ?? 0) > 0 && backpack.canAccept(id)) return true;
  return false;
}

/** Bank the backpack at camp. @returns the counts banked and their total. */
export function onCampEntry(backpack: Backpack, storage: CampStorage): { items: ItemCounts; total: number } {
  const items = storage.deposit(backpack);
  return { items, total: totalCount(items) };
}
