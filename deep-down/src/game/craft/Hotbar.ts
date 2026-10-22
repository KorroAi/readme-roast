import { ITEMS, isItem, type ItemId } from '../../config/items';
import { HOTBAR_ROLES, type HeldMode, type HotbarRole, type HotbarSlotView, type HotbarView } from './types';

export const HOTBAR_SIZE = 6;

/** What the hotbar reads from the rest of the loop. */
export interface HotbarSource {
  /** How many of an item are in the bag. */
  count(item: ItemId): number;
  /** The equipped pick and weapon (slots 0 and 1 show them). */
  pick(): ItemId;
  weapon(): ItemId | null;
}

export interface HotbarSave {
  slots: Array<ItemId | null>;
  selected: number;
}

/** What the selected item makes Action / Place do. */
export function modeOf(item: ItemId | null): HeldMode {
  if (!item) return 'none';
  const d = ITEMS[item];
  if (d.equip === 'pick') return 'mine';
  if (d.equip === 'weapon') return 'attack';
  if (d.use?.kind === 'bomb' || d.use?.kind === 'flare') return 'throw';
  if (d.place) return 'place';
  if (d.use) return 'use';
  return 'none';
}

/** The slot an item goes to on its own the first time it is held (null: it waits for a long-press). */
export function homeSlot(item: ItemId): number | null {
  const d = ITEMS[item];
  if (d.equip === 'pick') return 0;
  if (d.equip === 'weapon') return 1;
  if (d.kind === 'bomb') return 2;
  if (d.place === 'torch') return 3;
  if (d.use?.kind === 'heal') return 4;
  if (d.place || d.use) return 5;
  return null;
}

/**
 * The 6-slot hotbar (BRIEF §0.6): pick, weapon, bombs, torches, food and one free slot. Slots 0 and 1
 * always show the equipped pick and weapon; the others hold an item id (its count is the bag's, a
 * slot whose stack ran out stays, dimmed, until something else is assigned). Tap selects; a
 * long-press assigns (assign()). New items fall into their home slot when it is empty (offer()).
 */
export class Hotbar {
  private readonly ids: Array<ItemId | null> = new Array<ItemId | null>(HOTBAR_SIZE).fill(null);
  selected = 0;
  private readonly views: HotbarSlotView[] = HOTBAR_ROLES.map((role, index) => ({ index, role, item: null, count: 0, selected: index === 0, mode: 'none' as HeldMode }));
  private readonly viewOut: HotbarView = { slots: this.views, selected: 0, held: null, mode: 'none' };

  constructor(private readonly src: HotbarSource) {}

  role(i: number): HotbarRole {
    return HOTBAR_ROLES[i] ?? 'free';
  }

  /** The item a slot shows (the pick and weapon for slots 0 and 1). */
  itemAt(i: number): ItemId | null {
    if (i === 0) return this.src.pick();
    if (i === 1) return this.src.weapon();
    return this.ids[i] ?? null;
  }

  /** The selected slot's item. */
  held(): ItemId | null {
    return this.itemAt(this.selected);
  }

  mode(): HeldMode {
    const item = this.held();
    if (item && this.selected > 1 && this.src.count(item) <= 0) return 'none';
    return modeOf(item);
  }

  select(i: number): boolean {
    if (!Number.isInteger(i) || i < 0 || i >= HOTBAR_SIZE) return false;
    this.selected = i;
    return true;
  }

  /**
   * Put an item on slot i (2..5; the pick and weapon slots follow the gear: the caller equips).
   * The same item on another slot moves here. Null clears the slot.
   */
  assign(i: number, item: ItemId | null): boolean {
    if (!Number.isInteger(i) || i < 2 || i >= HOTBAR_SIZE) return false;
    if (item !== null && (!isItem(item) || ITEMS[item].equip === 'pick' || ITEMS[item].equip === 'weapon')) return false;
    if (item !== null) for (let k = 2; k < HOTBAR_SIZE; k++) if (this.ids[k] === item) this.ids[k] = null;
    this.ids[i] = item;
    return true;
  }

  /** A new item was held: it takes its home slot if that is empty. @returns the slot, or -1. */
  offer(item: ItemId): number {
    const home = homeSlot(item);
    if (home === null || home < 2) return -1;
    if (this.ids.includes(item)) return -1;
    if (this.ids[home] === null || (this.ids[home] && this.src.count(this.ids[home] as ItemId) <= 0 && homeSlot(this.ids[home] as ItemId) !== home)) {
      this.ids[home] = item;
      return home;
    }
    if (home !== 5 && this.ids[5] === null) {
      this.ids[5] = item;
      return 5;
    }
    return -1;
  }

  /** The slot an item is on (-1: none; 0/1 for the equipped pick and weapon). */
  slotOf(item: ItemId): number {
    for (let i = 0; i < HOTBAR_SIZE; i++) if (this.itemAt(i) === item) return i;
    return -1;
  }

  /** Snapshot for the HUD (reused object: read it before the next call). */
  view(): HotbarView {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const v = this.views[i];
      const item = this.itemAt(i);
      v.item = item;
      v.count = item ? (i < 2 ? 1 : this.src.count(item)) : 0;
      v.selected = i === this.selected;
      v.mode = item && (i < 2 || v.count > 0) ? modeOf(item) : 'none';
    }
    this.viewOut.selected = this.selected;
    this.viewOut.held = this.held();
    this.viewOut.mode = this.mode();
    return this.viewOut;
  }

  /** UI's shape: [{ item, count }] per slot. */
  slots(): Array<{ item: ItemId | null; count: number }> {
    return this.view().slots.map((s) => ({ item: s.item, count: s.count }));
  }

  toJSON(): HotbarSave {
    return { slots: [...this.ids], selected: this.selected };
  }

  load(x: unknown): void {
    this.ids.fill(null);
    this.selected = 0;
    if (!x || typeof x !== 'object') return;
    const o = x as Partial<HotbarSave>;
    if (Array.isArray(o.slots)) o.slots.slice(0, HOTBAR_SIZE).forEach((id, i) => {
      if (i >= 2 && isItem(id) && ITEMS[id].equip !== 'pick' && ITEMS[id].equip !== 'weapon') this.ids[i] = id;
    });
    if (typeof o.selected === 'number') this.select(o.selected);
  }
}
