import { describe, expect, it } from 'vitest';
import { B, BLOCKS } from '../../src/config/blocks';
import { ITEMS } from '../../src/config/items';
import { NODES } from '../../src/config/recipes';
import { RARITY_COLOR, RARITY_RANK, isBreakable, isMinable, itemRarity, rarityOf } from '../../src/config/rarity';
import { WEAPONS, bestWeapon, dps } from '../../src/config/weapons';
import { en } from '../../src/i18n/en';
import type { PropSpec } from '../../src/world/gen/types';

/** Round 2 (WORLD): only interesting things are minable, by rarity; the weapons as items and recipes. */
describe('minability and rarity', () => {
  it('keeps ordinary rock, soil, gravel, bedrock and masonry indestructible', () => {
    for (const id of [B.SLATE, B.DEEP_SLATE, B.UMBER, B.SOIL, B.GRAVEL, B.MOSS, B.BEDROCK, B.ANCIENT_BRICK, B.ANCIENT_TILE, B.GLYPH_STONE, B.STRUCTURE]) {
      expect(isMinable(id, 4), BLOCKS[id].name).toBe(false);
      expect(isBreakable(id), BLOCKS[id].name).toBe(false);
      expect(rarityOf(id), BLOCKS[id].name).toBeNull();
    }
    expect(BLOCKS[B.SLATE].plain).toBe(true);
    // Air, lights and the camp are not minable either.
    for (const id of [B.AIR, B.LIGHT_LAMP, B.PLANK, B.HEARTH, B.LIGHT_EVENT]) expect(isMinable(id, 4)).toBe(false);
  });

  it('lets the interesting things break, the seals by tier', () => {
    for (const id of [B.RUBBLE, B.ROOTS, B.COPPER_ORE, B.CRYSTAL, B.LANTERNSTONE, B.CRUMBLING_BRICK]) expect(isMinable(id, 1), BLOCKS[id].name).toBe(true);
    expect(isMinable(B.IRON_ORE, 1)).toBe(false);
    expect(isMinable(B.IRON_ORE, 2)).toBe(true);
    expect(isMinable(B.GEM_ORE, 2)).toBe(true);
    expect([isMinable(B.HARDENED_SLATE, 1), isMinable(B.HARDENED_SLATE, 2)]).toEqual([false, true]);
    expect([isMinable(B.IRONBOUND, 2), isMinable(B.IRONBOUND, 3)]).toEqual([false, true]);
    expect([isMinable(B.EMBER_GLASS, 3), isMinable(B.EMBER_GLASS, 4)]).toEqual([false, true]);
    // Stone and fibre for the recipes come from loose stone and root tangles.
    expect(BLOCKS[B.RUBBLE].drop?.item).toBe('stone');
    expect(BLOCKS[B.ROOTS].drop?.item).toBe('rootFibre');
    expect(BLOCKS[B.GEM_ORE].drop?.item).toBe('gem');
  });

  it('gives every minable block and find its rarity colour, from common to legendary', () => {
    expect(RARITY_COLOR).toEqual({ common: '#f2e6cf', uncommon: '#6fe08a', rare: '#5fb7ff', epic: '#b98cff', legendary: '#ffcf5a' });
    expect([rarityOf(B.RUBBLE), rarityOf(B.COPPER_ORE), rarityOf(B.IRON_ORE), rarityOf(B.ECHO_CRYSTAL), rarityOf(B.CRYSTAL), rarityOf(B.GEM_ORE), rarityOf(B.LANTERNSTONE)]).toEqual([
      'common', 'common', 'uncommon', 'rare', 'epic', 'epic', 'legendary',
    ]);
    for (const b of BLOCKS) if (b && isBreakable(b.id)) expect(rarityOf(b.id), b.name).not.toBeNull();
    const prop = (p: Partial<PropSpec>): PropSpec => ({ id: 'p', kind: 'crate', x: 0, y: 0, z: 0, rotY: 0, scale: 1, anchor: null, emitters: [], seed: 0, ...p });
    expect(rarityOf(prop({ kind: 'crystalCluster', minable: { hardness: 2, tier: 1, drop: 'glimmerShard', min: 1, max: 2 } }))).toBe('rare');
    expect(rarityOf(prop({ id: 'bloom_e3', kind: 'crystalCluster', minable: { hardness: 2, tier: 1, drop: 'glimmerShard', min: 2, max: 3 } }))).toBe('epic');
    expect(rarityOf(prop({ kind: 'chest', secret: 'x', feature: { kind: 'cache', id: 'x' } }))).toBe('legendary');
    expect(rarityOf(prop({ kind: 'crate', feature: { kind: 'cache', id: 'x' } }))).toBe('common');
    expect(rarityOf(prop({ kind: 'chest', interact: 'storage' }))).toBeNull();
    expect(rarityOf(prop({ kind: 'tablet', feature: { kind: 'relic', id: 'r' } }))).toBe('legendary');
    expect(RARITY_RANK.legendary).toBeGreaterThan(RARITY_RANK.epic);
    for (const id of Object.keys(ITEMS) as Array<keyof typeof ITEMS>) expect(itemRarity(id), id).toBeTruthy();
    for (const r of Object.keys(RARITY_COLOR)) {
      expect(en).toHaveProperty(`rarity.${r}`);
      expect(en).toHaveProperty(`rarity.${r}.what`);
    }
  });
});

describe('weapons', () => {
  it('has the pick always, and the Forge weapons after the first iron', () => {
    expect(bestWeapon([]).id).toBe('pick');
    for (const id of ['machete', 'sling', 'spear', 'flashCharges'] as const) {
      expect(NODES[id].place).toBe('forge');
      // The Forge itself needs iron, so weapons come after the first iron.
      expect(NODES.forge.inputs.ironOre).toBeGreaterThan(0);
    }
    expect(NODES.spear.prereqs).toContain('machete');
    expect(NODES.spear.inputs.gem).toBeGreaterThan(0);
    for (const w of Object.values(WEAPONS)) expect(en, w.id).toHaveProperty(w.name);
  });

  it('chooses the best weapon for the distance: melee in reach, the sling beyond it', () => {
    expect(bestWeapon(['machete'], 1).id).toBe('machete');
    expect(bestWeapon(['machete', 'spear'], 1).id).toBe('spear');
    // The spear reaches 3 m, the machete 2.6 m.
    expect(bestWeapon(['machete', 'spear'], 2.9).id).toBe('spear');
    expect(bestWeapon(['machete'], 2.9).id).toBe('pick');
    expect(bestWeapon(['machete', 'sling'], 8).id).toBe('sling');
    expect(bestWeapon(['sling'], 30).id).toBe('pick');
    expect(dps(WEAPONS.spear)).toBeGreaterThan(dps(WEAPONS.machete));
    expect(dps(WEAPONS.machete)).toBeGreaterThan(dps(WEAPONS.pick));
    expect(WEAPONS.sling.ranged).toBe(true);
    expect(WEAPONS.flash.consumes).toBe('flashCharge');
    for (const w of Object.values(WEAPONS)) expect(w.hitStop).toBeCloseTo(0.04, 6);
  });
});
