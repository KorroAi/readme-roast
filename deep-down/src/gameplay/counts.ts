import { ITEMS, type ItemId } from '../config/items';
import type { ItemCounts } from '../save/types';

// Helpers for ItemCounts bags shared by the backpack, camp storage, crafting and saves.

/** True for known item ids. Guards against prototype keys such as "toString" in loaded data. */
export function isItemId(x: unknown): x is ItemId {
  return typeof x === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, x);
}

/** Positive integer amount, or 0 for anything else (negative, NaN, Infinity, non-numbers). */
export function toAmount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Sum of every count in the bag. */
export function totalCount(counts: ItemCounts): number {
  let total = 0;
  for (const id in counts) total += counts[id as ItemId] ?? 0;
  return total;
}

/** Add `from` into `into` (mutates and returns `into`). Non-positive entries are skipped. */
export function addCounts(into: ItemCounts, from: ItemCounts): ItemCounts {
  for (const id in from) {
    const n = from[id as ItemId] ?? 0;
    if (n > 0) into[id as ItemId] = (into[id as ItemId] ?? 0) + n;
  }
  return into;
}
