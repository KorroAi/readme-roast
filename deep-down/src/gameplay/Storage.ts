import { ITEMS, ITEM_IDS, type ItemId } from '../config/items';
import type { ItemCounts } from '../save/types';
import { isItemId, toAmount } from './counts';
import type { Backpack } from './Inventory';

/**
 * Camp storage: unlimited counts per item. Everything banked here is safe from death.
 * Key items are refused because they live in the Journal.
 */
export class CampStorage {
  // No prototype, so a stray key such as "toString" reads as 0 instead of an inherited member.
  private readonly items: ItemCounts = Object.create(null) as ItemCounts;

  /** Move the whole backpack into storage. @returns the counts moved. */
  deposit(backpack: Backpack): ItemCounts {
    const moved = backpack.takeAll();
    for (const id in moved) this.add(id as ItemId, moved[id as ItemId] ?? 0);
    return moved;
  }

  /** @returns how many were added (0 for key items, unknown items or non-positive counts). */
  add(item: ItemId, count: number): number {
    const n = toAmount(count);
    if (n === 0 || !isItemId(item) || ITEMS[item].keyItem) return 0;
    this.items[item] = (this.items[item] ?? 0) + n;
    return n;
  }

  /** The bank has no limit (key items are refused). */
  room(item: ItemId): number {
    return isItemId(item) && !ITEMS[item].keyItem ? Infinity : 0;
  }

  count(item: ItemId): number {
    return this.items[item] ?? 0;
  }

  /** Remove up to `count`. @returns how many were removed. */
  remove(item: ItemId, count: number): number {
    const n = Math.min(toAmount(count), this.count(item));
    if (n === 0) return 0;
    const left = this.count(item) - n;
    if (left > 0) this.items[item] = left;
    else delete this.items[item];
    return n;
  }

  get total(): number {
    let n = 0;
    for (const id of ITEM_IDS) n += this.count(id);
    return n;
  }

  /** Detached copy with only positive counts, in a stable item order. */
  toJSON(): ItemCounts {
    const out: ItemCounts = {};
    for (const id of ITEM_IDS) if (this.count(id) > 0) out[id] = this.count(id);
    return out;
  }

  /** Rebuild from saved counts; unknown items and invalid counts are ignored. */
  static fromJSON(x: unknown): CampStorage {
    const s = new CampStorage();
    if (!x || typeof x !== 'object') return s;
    for (const [id, n] of Object.entries(x)) if (isItemId(id)) s.add(id, n as number);
    return s;
  }
}
