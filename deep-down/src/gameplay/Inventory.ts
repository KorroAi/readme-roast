import { ITEMS, type ItemId } from '../config/items';
import type { ItemCounts, SlotData } from '../save/types';
import { isItemId, toAmount } from './counts';

/**
 * The expedition backpack: a fixed number of slots, each holding one stack of one item.
 *
 * Slot positions are stable (removing items never shifts other stacks) so the inventory UI
 * does not reshuffle under the player's finger. Key items never enter the backpack: they
 * go to the Journal and can never be lost.
 */
export class Backpack {
  private data: Array<SlotData | null>;

  constructor(slotCount: number) {
    this.data = new Array<SlotData | null>(validSlotCount(slotCount)).fill(null);
  }

  /** Read-only view of the slots; mutate through add/remove/resize/takeAll. */
  get slots(): ReadonlyArray<Readonly<SlotData> | null> {
    return this.data;
  }

  get slotCount(): number {
    return this.data.length;
  }

  get usedSlots(): number {
    let used = 0;
    for (const s of this.data) if (s) used++;
    return used;
  }

  get isEmpty(): boolean {
    return this.usedSlots === 0;
  }

  count(item: ItemId): number {
    let n = 0;
    for (const s of this.data) if (s && s.item === item) n += s.count;
    return n;
  }

  /** True when at least one more `item` fits (room in a matching stack, or an empty slot). */
  canAccept(item: ItemId): boolean {
    if (!isItemId(item) || ITEMS[item].keyItem) return false;
    const stack = ITEMS[item].stackSize;
    for (const s of this.data) if (!s || (s.item === item && s.count < stack)) return true;
    return false;
  }

  /**
   * Add up to `count` of `item`, topping up existing stacks before opening empty slots.
   * @returns how many were actually added (0 for key items, unknown items or a full pack).
   */
  add(item: ItemId, count: number): number {
    const amount = toAmount(count);
    if (amount === 0 || !isItemId(item) || ITEMS[item].keyItem) return 0;
    let left = amount;
    const stack = ITEMS[item].stackSize;
    for (const s of this.data) {
      if (left === 0) break;
      if (!s || s.item !== item || s.count >= stack) continue;
      const n = Math.min(stack - s.count, left);
      s.count += n;
      left -= n;
    }
    for (let i = 0; i < this.data.length && left > 0; i++) {
      if (this.data[i]) continue;
      const n = Math.min(stack, left);
      this.data[i] = { item, count: n };
      left -= n;
    }
    return amount - left;
  }

  /**
   * Remove up to `count` of `item`, draining the last stacks first so earlier (usually full)
   * stacks stay intact. @returns how many were removed.
   */
  remove(item: ItemId, count: number): number {
    const wanted = toAmount(count);
    let left = wanted;
    for (let i = this.data.length - 1; i >= 0 && left > 0; i--) {
      const s = this.data[i];
      if (!s || s.item !== item) continue;
      const n = Math.min(s.count, left);
      s.count -= n;
      left -= n;
      if (s.count === 0) this.data[i] = null;
    }
    return wanted - left;
  }

  /**
   * Change the number of slots (pack upgrades). Growing appends empty slots. Shrinking keeps
   * every item, consolidating stacks if needed, and throws a RangeError (leaving the pack
   * untouched) when the contents cannot fit.
   */
  resize(slotCount: number): void {
    const n = validSlotCount(slotCount);
    const cur = this.data.length;
    if (n >= cur) {
      for (let i = cur; i < n; i++) this.data.push(null);
      return;
    }
    if (this.data.slice(n).every((s) => s === null)) {
      this.data.length = n;
      return;
    }
    const totals = this.totals();
    let needed = 0;
    for (const id in totals) needed += Math.ceil((totals[id as ItemId] ?? 0) / ITEMS[id as ItemId].stackSize);
    if (needed > n) throw new RangeError(`Backpack: ${needed} stacks cannot fit in ${n} slots`);
    const items = this.data;
    this.data = new Array<SlotData | null>(n).fill(null);
    for (const s of items) if (s) this.add(s.item, s.count);
  }

  /** Empty the backpack. @returns everything it held (for banking at camp, or loss on death). */
  takeAll(): ItemCounts {
    const out = this.totals();
    this.data.fill(null);
    return out;
  }

  /** Totals per item, without changing the backpack. */
  totals(): ItemCounts {
    const out: ItemCounts = {};
    for (const s of this.data) if (s) out[s.item] = (out[s.item] ?? 0) + s.count;
    return out;
  }

  /** Detached copy of the slots, safe to store or hand to the UI. */
  toJSON(): Array<SlotData | null> {
    return this.data.map((s) => (s ? { item: s.item, count: s.count } : null));
  }

  /**
   * Rebuild from saved slots. Valid stacks keep their slot position; malformed entries are
   * dropped, and oversized stacks or stacks beyond `slotCount` are re-added into free space
   * (whatever still does not fit is discarded, which only happens with damaged data).
   */
  static fromJSON(slots: unknown, slotCount: number): Backpack {
    const pack = new Backpack(slotCount);
    if (!Array.isArray(slots)) return pack;
    const overflow: SlotData[] = [];
    slots.forEach((raw: unknown, i) => {
      if (!raw || typeof raw !== 'object') return;
      const { item, count } = raw as Partial<SlotData>;
      const n = toAmount(count);
      if (!isItemId(item) || ITEMS[item].keyItem || n === 0) return;
      const keep = i < pack.slotCount ? Math.min(n, ITEMS[item].stackSize) : 0;
      if (keep > 0) pack.data[i] = { item, count: keep };
      if (n > keep) overflow.push({ item, count: n - keep });
    });
    for (const s of overflow) pack.add(s.item, s.count);
    return pack;
  }
}

function validSlotCount(n: number): number {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Backpack: invalid slot count ${n}`);
  return n;
}
