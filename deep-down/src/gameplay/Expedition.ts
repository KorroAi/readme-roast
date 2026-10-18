import { ITEMS } from '../config/items';
import type { ItemCounts } from '../save/types';
import { addCounts, isItemId, totalCount } from './counts';
import type { Backpack } from './Inventory';
import type { CampStorage } from './Storage';

/**
 * The expedition risk rule in one place: what you carry is at stake, what you banked is safe.
 *
 * - Death (or abandoning the trip) loses the whole backpack plus any loose drops that were
 *   still on the ground. Camp storage, equipment and journal key items are always kept.
 * - Entering camp banks the whole backpack into storage.
 */

export { totalCount } from './counts';

/**
 * Apply an expedition loss. `groundDrops` are uncollected drops that vanish with the player;
 * key items among them are ignored since they can never be lost.
 * @returns everything that was lost.
 */
export function onDeath(backpack: Backpack, groundDrops?: ItemCounts): ItemCounts {
  const lost = backpack.takeAll();
  if (groundDrops) {
    const loose: ItemCounts = {};
    for (const id in groundDrops) if (isItemId(id) && !ITEMS[id].keyItem) loose[id] = groundDrops[id];
    addCounts(lost, loose);
  }
  return lost;
}

/** Bank the backpack at camp. @returns the counts banked and their total. */
export function onCampEntry(backpack: Backpack, storage: CampStorage): { items: ItemCounts; total: number } {
  const items = storage.deposit(backpack);
  return { items, total: totalCount(items) };
}
