import { describe, expect, it } from 'vitest';
import { ITEMS } from '../../src/config/items';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import { onCampEntry, onDeath, totalCount } from '../../src/gameplay/Expedition';
import { addCounts, isItemId, toAmount } from '../../src/gameplay/counts';

const STONE = ITEMS.stone.stackSize; // 40
const COPPER = ITEMS.copperOre.stackSize; // 30

describe('Backpack', () => {
  it('starts empty with the requested slot count', () => {
    const b = new Backpack(6);
    expect(b.slotCount).toBe(6);
    expect(b.usedSlots).toBe(0);
    expect(b.isEmpty).toBe(true);
    expect(b.slots).toEqual([null, null, null, null, null, null]);
  });

  it('rejects invalid slot counts', () => {
    expect(() => new Backpack(0)).toThrow(RangeError);
    expect(() => new Backpack(2.5)).toThrow(RangeError);
  });

  it('fills existing stacks before opening new slots', () => {
    const b = new Backpack(6);
    expect(b.add('stone', 10)).toBe(10);
    expect(b.add('copperOre', 5)).toBe(5);
    expect(b.add('stone', 5)).toBe(5);
    expect(b.usedSlots).toBe(2);
    expect(b.slots[0]).toEqual({ item: 'stone', count: 15 });
    expect(b.slots[1]).toEqual({ item: 'copperOre', count: 5 });
  });

  it('splits across slots at the stack size', () => {
    const b = new Backpack(6);
    expect(b.add('stone', STONE * 2 + 3)).toBe(STONE * 2 + 3);
    expect(b.toJSON().slice(0, 3)).toEqual([
      { item: 'stone', count: STONE },
      { item: 'stone', count: STONE },
      { item: 'stone', count: 3 },
    ]);
    expect(b.count('stone')).toBe(STONE * 2 + 3);
  });

  it('tops up a partial stack in a later slot before using an empty earlier slot', () => {
    const b = new Backpack(3);
    b.add('copperOre', 1);
    b.add('stone', 38);
    b.remove('copperOre', 1); // slot 0 is now empty, slot 1 holds 38 stone
    expect(b.add('stone', 5)).toBe(5);
    expect(b.toJSON()).toEqual([{ item: 'stone', count: 3 }, { item: 'stone', count: STONE }, null]);
  });

  it('reports how many fit when the backpack fills up', () => {
    const b = new Backpack(2);
    expect(b.add('copperOre', COPPER * 2 + 7)).toBe(COPPER * 2);
    expect(b.usedSlots).toBe(2);
    expect(b.canAccept('copperOre')).toBe(false);
    expect(b.canAccept('stone')).toBe(false);
    expect(b.add('stone', 1)).toBe(0);
  });

  it('accepts into a partial stack even when no slot is empty', () => {
    const b = new Backpack(1);
    b.add('stone', 39);
    expect(b.canAccept('stone')).toBe(true);
    expect(b.canAccept('copperOre')).toBe(false);
    expect(b.add('stone', 5)).toBe(1);
  });

  it('rejects key items (they belong to the journal)', () => {
    const b = new Backpack(6);
    expect(ITEMS.ancientTablet.keyItem).toBe(true);
    expect(b.canAccept('ancientTablet')).toBe(false);
    expect(b.add('ancientTablet', 1)).toBe(0);
    expect(b.usedSlots).toBe(0);
  });

  it('ignores non-positive, fractional and non-finite counts', () => {
    const b = new Backpack(2);
    expect(b.add('stone', 0)).toBe(0);
    expect(b.add('stone', -4)).toBe(0);
    expect(b.add('stone', Number.NaN)).toBe(0);
    expect(b.add('stone', Number.POSITIVE_INFINITY)).toBe(0);
    expect(b.add('stone', 2.9)).toBe(2);
    expect(b.count('stone')).toBe(2);
  });

  it('removes from the last stacks first and frees emptied slots', () => {
    const b = new Backpack(4);
    b.add('stone', STONE + 10); // [40, 10]
    expect(b.remove('stone', 15)).toBe(15);
    expect(b.toJSON()).toEqual([{ item: 'stone', count: 35 }, null, null, null]);
    expect(b.remove('stone', 100)).toBe(35);
    expect(b.usedSlots).toBe(0);
    expect(b.remove('copperOre', 3)).toBe(0);
  });

  it('keeps slot positions stable when removing', () => {
    const b = new Backpack(3);
    b.add('stone', 5);
    b.add('copperOre', 5);
    b.add('glimmerShard', 2);
    b.remove('copperOre', 5);
    expect(b.toJSON()).toEqual([{ item: 'stone', count: 5 }, null, { item: 'glimmerShard', count: 2 }]);
  });

  it('grows without touching items', () => {
    const b = new Backpack(6);
    b.add('stone', 12);
    b.add('copperOre', 8);
    b.resize(10);
    expect(b.slotCount).toBe(10);
    expect(b.count('stone')).toBe(12);
    expect(b.count('copperOre')).toBe(8);
    expect(b.slots[1]).toEqual({ item: 'copperOre', count: 8 });
    expect(b.add('ironOre', COPPER * 8)).toBe(COPPER * 8);
  });

  it('shrinks by truncating empty tail slots', () => {
    const b = new Backpack(6);
    b.add('stone', 5);
    b.resize(2);
    expect(b.slotCount).toBe(2);
    expect(b.count('stone')).toBe(5);
  });

  it('shrinks by repacking a stack that sits beyond the new size', () => {
    const b = Backpack.fromJSON([{ item: 'stone', count: 5 }, null, { item: 'copperOre', count: 3 }, { item: 'glimmerShard', count: 2 }], 4);
    b.resize(3);
    expect(b.slotCount).toBe(3);
    expect(b.toJSON()).toEqual([
      { item: 'stone', count: 5 },
      { item: 'copperOre', count: 3 },
      { item: 'glimmerShard', count: 2 },
    ]);
  });

  it('merges split partial stacks of the same item to make room', () => {
    const b = Backpack.fromJSON([{ item: 'stone', count: 20 }, { item: 'copperOre', count: 5 }, { item: 'stone', count: 20 }], 3);
    b.resize(2);
    expect(b.toJSON()).toEqual([{ item: 'stone', count: STONE }, { item: 'copperOre', count: 5 }]);
  });

  it('throws and keeps every item when shrinking would lose items', () => {
    const b = new Backpack(3);
    b.add('stone', 5);
    b.add('copperOre', 5);
    b.add('glimmerShard', 5);
    const before = b.toJSON();
    expect(() => b.resize(2)).toThrow(RangeError);
    expect(b.toJSON()).toEqual(before);
    expect(b.slotCount).toBe(3);
  });

  it('takeAll empties the backpack and returns the totals', () => {
    const b = new Backpack(6);
    b.add('stone', 45);
    b.add('copperOre', 3);
    expect(b.takeAll()).toEqual({ stone: 45, copperOre: 3 });
    expect(b.usedSlots).toBe(0);
    expect(b.takeAll()).toEqual({});
  });

  it('toJSON returns a detached copy', () => {
    const b = new Backpack(2);
    b.add('stone', 3);
    const j = b.toJSON();
    j[0]!.count = 99;
    expect(b.count('stone')).toBe(3);
  });

  it('round-trips through JSON', () => {
    const b = new Backpack(6);
    b.add('stone', 50);
    b.add('copperOre', 7);
    b.remove('stone', 50);
    b.add('glimmerShard', 2);
    const json = JSON.parse(JSON.stringify(b.toJSON()));
    const c = Backpack.fromJSON(json, 6);
    expect(c.toJSON()).toEqual(b.toJSON());
  });

  it('fromJSON drops malformed entries and re-stacks overflow', () => {
    const c = Backpack.fromJSON(
      [
        { item: 'stone', count: 55 }, // over stack size: 40 stay, 15 overflow
        { item: 'nope', count: 3 },
        { item: 'ancientTablet', count: 1 },
        { item: 'copperOre', count: -2 },
        'garbage',
        null,
        { item: 'copperOre', count: 4 }, // beyond a 4-slot pack: re-added into free space
      ],
      4,
    );
    expect(c.slotCount).toBe(4);
    expect(c.count('stone')).toBe(55);
    expect(c.count('copperOre')).toBe(4);
    expect(c.count('ancientTablet')).toBe(0);
    expect(c.slots[0]).toEqual({ item: 'stone', count: STONE });
  });

  it('fromJSON tolerates non-array input', () => {
    expect(Backpack.fromJSON(undefined, 6).usedSlots).toBe(0);
    expect(Backpack.fromJSON({ 0: { item: 'stone', count: 1 } }, 6).usedSlots).toBe(0);
  });
});

describe('CampStorage', () => {
  it('deposits the whole backpack with unlimited stacking', () => {
    const s = new CampStorage();
    const b = new Backpack(6);
    b.add('stone', 120);
    b.add('copperOre', 9);
    expect(s.deposit(b)).toEqual({ stone: 120, copperOre: 9 });
    expect(b.usedSlots).toBe(0);
    b.add('stone', 200);
    s.deposit(b);
    expect(s.count('stone')).toBe(320);
    expect(s.total).toBe(329);
  });

  it('deposit of an empty backpack moves nothing', () => {
    const s = new CampStorage();
    expect(s.deposit(new Backpack(6))).toEqual({});
    expect(s.toJSON()).toEqual({});
  });

  it('removes up to what it holds', () => {
    const s = new CampStorage();
    s.add('copperOre', 5);
    expect(s.remove('copperOre', 3)).toBe(3);
    expect(s.remove('copperOre', 10)).toBe(2);
    expect(s.count('copperOre')).toBe(0);
    expect(s.toJSON()).toEqual({});
    expect(s.remove('stone', 1)).toBe(0);
  });

  it('refuses key items and invalid counts', () => {
    const s = new CampStorage();
    expect(s.add('ancientTablet', 1)).toBe(0);
    expect(s.add('stone', -1)).toBe(0);
    expect(s.add('stone', Number.NaN)).toBe(0);
    expect(s.total).toBe(0);
  });

  it('round-trips and sanitizes JSON', () => {
    const s = new CampStorage();
    s.add('stone', 12);
    s.add('glimmerShard', 3);
    expect(CampStorage.fromJSON(JSON.parse(JSON.stringify(s.toJSON()))).toJSON()).toEqual({ stone: 12, glimmerShard: 3 });
    const bad = CampStorage.fromJSON({ stone: 4, toString: 5, copperOre: 'x', ironOre: -1, ancientTablet: 2 });
    expect(bad.toJSON()).toEqual({ stone: 4 });
    expect(CampStorage.fromJSON(null).toJSON()).toEqual({});
  });
});

describe('Expedition', () => {
  it('death loses the whole backpack and loose drops, but keeps storage', () => {
    const b = new Backpack(6);
    const s = new CampStorage();
    s.add('stone', 30);
    b.add('copperOre', 6);
    b.add('stone', 2);
    const lost = onDeath(b, { stone: 3, glimmerShard: 1, ancientTablet: 1 });
    expect(lost).toEqual({ copperOre: 6, stone: 5, glimmerShard: 1 });
    expect(b.usedSlots).toBe(0);
    expect(s.count('stone')).toBe(30);
  });

  it('death with an empty backpack loses nothing', () => {
    expect(onDeath(new Backpack(6))).toEqual({});
  });

  it('camp entry banks everything and reports the total', () => {
    const b = new Backpack(6);
    const s = new CampStorage();
    b.add('stone', 14);
    b.add('copperOre', 8);
    expect(onCampEntry(b, s)).toEqual({ items: { stone: 14, copperOre: 8 }, total: 22 });
    expect(b.usedSlots).toBe(0);
    expect(s.toJSON()).toEqual({ stone: 14, copperOre: 8 });
  });
});

describe('count helpers', () => {
  it('validate item ids and amounts', () => {
    expect(isItemId('stone')).toBe(true);
    expect(isItemId('toString')).toBe(false);
    expect(isItemId(3)).toBe(false);
    expect(toAmount(3.7)).toBe(3);
    expect(toAmount(-1)).toBe(0);
    expect(toAmount('5')).toBe(0);
  });

  it('sum and merge counts', () => {
    expect(totalCount({ stone: 3, copperOre: 4 })).toBe(7);
    expect(addCounts({ stone: 1 }, { stone: 2, ironOre: 1, copperOre: 0 })).toEqual({ stone: 3, ironOre: 1 });
  });
});
