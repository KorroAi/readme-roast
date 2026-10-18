import { describe, expect, it } from 'vitest';
import { LANTERNS, PACKS, PICKAXES, packForTier } from '../../src/config/balance';
import { RECIPES, RECIPE_LIST } from '../../src/config/recipes';
import { Crafting, craft, evaluate } from '../../src/gameplay/Crafting';
import { Equipment } from '../../src/gameplay/Equipment';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';

function setup(pack = packForTier(1).slots) {
  return { backpack: new Backpack(pack), storage: new CampStorage(), equipment: new Equipment() };
}

describe('Equipment', () => {
  it('defaults to tier 1 everywhere', () => {
    const e = new Equipment();
    expect(e.tiers).toEqual({ pickaxe: 1, lantern: 1, pack: 1 });
    expect(e.pickaxe()).toBe(PICKAXES[0]);
    expect(e.lantern()).toBe(LANTERNS[0]);
    expect(e.pack()).toBe(PACKS[0]);
  });

  it('upgrades but never downgrades', () => {
    const e = new Equipment();
    expect(e.upgrade('pickaxe', 2)).toBe(true);
    expect(e.pickaxe().tier).toBe(2);
    expect(e.upgrade('pickaxe', 1)).toBe(false);
    expect(e.upgrade('pickaxe', 2)).toBe(false);
    expect(e.tier('pickaxe')).toBe(2);
  });

  it('clamps loaded tiers to the defined tools', () => {
    const e = new Equipment({ pickaxe: 7, lantern: 0, pack: Number.NaN });
    expect(e.tiers).toEqual({ pickaxe: PICKAXES.length, lantern: 1, pack: 1 });
    expect(e.upgrade('lantern', 99)).toBe(true);
    expect(e.tier('lantern')).toBe(LANTERNS.length);
  });

  it('exposes read-only tiers and a detached JSON copy', () => {
    const e = new Equipment({ pack: 2 });
    const j = e.toJSON();
    j.pack = 1;
    expect(e.tiers.pack).toBe(2);
  });
});

describe('Crafting', () => {
  it('reports missing materials with have/need', () => {
    const { backpack, storage, equipment } = setup();
    backpack.add('stone', 5);
    storage.add('copperOre', 3);
    const r = evaluate('copperPickaxe', backpack, storage, equipment, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing');
    expect(r.have).toEqual({ copperOre: 3, stone: 5 });
    expect(r.missing).toEqual({ copperOre: 5, stone: 7 });
  });

  it('counts backpack and storage together', () => {
    const { backpack, storage, equipment } = setup();
    backpack.add('stone', 6);
    storage.add('stone', 6);
    backpack.add('copperOre', 4);
    storage.add('copperOre', 4);
    const r = evaluate('copperPickaxe', backpack, storage, equipment, true);
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('ok');
    expect(r.missing).toEqual({});
    expect(r.have).toEqual({ copperOre: 8, stone: 12 });
  });

  it('reports owned when the equipment tier already matches', () => {
    const { backpack, storage, equipment } = setup();
    equipment.upgrade('pickaxe', 2);
    storage.add('stone', 100);
    storage.add('copperOre', 100);
    const r = craft('copperPickaxe', backpack, storage, equipment, true);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('owned');
    expect(storage.count('stone')).toBe(100);
  });

  it('requires being at camp, but previews materials anywhere', () => {
    const { backpack, storage, equipment } = setup();
    storage.add('stone', 12);
    storage.add('copperOre', 8);
    expect(evaluate('copperPickaxe', backpack, storage, equipment).ok).toBe(true);
    const r = craft('copperPickaxe', backpack, storage, equipment, false);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('notAtCamp');
    expect(equipment.tier('pickaxe')).toBe(1);
    expect(storage.count('stone')).toBe(12);
  });

  it('reason precedence is owned > notAtCamp > missing', () => {
    const { backpack, storage, equipment } = setup();
    expect(evaluate('copperPickaxe', backpack, storage, equipment, false).reason).toBe('notAtCamp');
    equipment.upgrade('pickaxe', 2);
    expect(evaluate('copperPickaxe', backpack, storage, equipment, false).reason).toBe('owned');
  });

  it('does not change anything when materials are missing', () => {
    const { backpack, storage, equipment } = setup();
    backpack.add('stone', 12);
    backpack.add('copperOre', 7);
    const r = craft('copperPickaxe', backpack, storage, equipment, true);
    expect(r.reason).toBe('missing');
    expect(backpack.count('stone')).toBe(12);
    expect(backpack.count('copperOre')).toBe(7);
    expect(equipment.tier('pickaxe')).toBe(1);
  });

  it('spends storage first, then the backpack, and upgrades the equipment', () => {
    const { backpack, storage, equipment } = setup();
    storage.add('stone', 10);
    storage.add('copperOre', 20);
    backpack.add('stone', 5);
    backpack.add('copperOre', 3);
    const r = craft('copperPickaxe', backpack, storage, equipment, true);
    expect(r.ok).toBe(true);
    expect(r.packSlots).toBeNull();
    expect(storage.count('stone')).toBe(0);
    expect(backpack.count('stone')).toBe(3);
    expect(storage.count('copperOre')).toBe(12);
    expect(backpack.count('copperOre')).toBe(3);
    expect(equipment.pickaxe().tier).toBe(2);
    expect(evaluate('copperPickaxe', backpack, storage, equipment).reason).toBe('owned');
  });

  it('the pack recipe resizes the backpack and reports the new slot count', () => {
    const { backpack, storage, equipment } = setup();
    backpack.add('stone', 16);
    backpack.add('copperOre', 30);
    backpack.add('glimmerShard', 2);
    const r = Crafting.craft('sturdyPack', backpack, storage, equipment, true);
    expect(r.ok).toBe(true);
    expect(r.packSlots).toBe(packForTier(2).slots);
    expect(backpack.slotCount).toBe(packForTier(2).slots);
    expect(equipment.pack().slots).toBe(packForTier(2).slots);
    expect(backpack.count('stone')).toBe(0);
    expect(backpack.count('copperOre')).toBe(26);
    expect(backpack.count('glimmerShard')).toBe(2);
  });

  it('every recipe is craftable from exactly its inputs and upgrades its slot', () => {
    for (const recipe of RECIPE_LIST) {
      const { backpack, storage, equipment } = setup();
      for (const [id, n] of Object.entries(recipe.inputs)) storage.add(id as keyof typeof recipe.inputs, n ?? 0);
      const r = craft(recipe.id, backpack, storage, equipment, true);
      expect(r.ok, recipe.id).toBe(true);
      expect(storage.total, recipe.id).toBe(0);
      expect(equipment.tier(recipe.result.slot)).toBe(recipe.result.tier);
    }
  });

  it('rejects unknown recipe ids loudly', () => {
    const { backpack, storage, equipment } = setup();
    expect(() => evaluate('nope' as keyof typeof RECIPES, backpack, storage, equipment)).toThrow();
  });
});
