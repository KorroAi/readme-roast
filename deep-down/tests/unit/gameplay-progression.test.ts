import { describe, expect, it } from 'vitest';
import { LANTERNS, PACKS, PLAYER, lanternForTier, packForTier } from '../../src/config/balance';
import { BLOCKS, B } from '../../src/config/blocks';
import { ITEMS, RUNE_ITEMS } from '../../src/config/items';
import { en } from '../../src/i18n/en';
import { t } from '../../src/i18n';
import { DISCOVERIES, DISCOVERY_TOTAL, discoveryDef, discoveryNumbering } from '../../src/gameplay/discoveries';
import { Lantern } from '../../src/gameplay/Lantern';
import { Objectives, OBJECTIVE_CHAIN } from '../../src/gameplay/Objectives';
import { closestRecipe, nextLine } from '../../src/gameplay/NextStep';

describe('materials, packs and lanterns (loop spec 2.1, 2.2)', () => {
  it('has the six materials with tight stacks and the eight runes as key items', () => {
    const stacks = Object.fromEntries(['stone', 'rootFibre', 'copperOre', 'ironOre', 'glimmerShard', 'echoShard'].map((id) => [id, ITEMS[id as keyof typeof ITEMS].stackSize]));
    expect(stacks).toEqual({ stone: 30, rootFibre: 20, copperOre: 15, ironOre: 10, glimmerShard: 10, echoShard: 5 });
    expect(RUNE_ITEMS.length).toBe(8);
    expect(RUNE_ITEMS).toContain('ancientTablet');
    for (const id of RUNE_ITEMS) expect(ITEMS[id].keyItem).toBe(true);
    for (const id of Object.keys(ITEMS)) {
      expect(en).toHaveProperty(`item.${id}`);
      expect(en).toHaveProperty(`item.${id}.desc`);
    }
  });

  it('cave soil drops root fibre at 45%; iron ore drops 1-2', () => {
    expect(BLOCKS[B.SOIL].drop).toEqual({ item: 'rootFibre', min: 1, max: 1, chance: 0.45 });
    expect(BLOCKS[B.IRON_ORE].drop).toMatchObject({ item: 'ironOre', min: 1, max: 2 });
  });

  it('packs grow 6 -> 8 -> 10, and only the Expedition Pack has the 2-slot Sealed Pouch', () => {
    expect(PACKS.map((p) => [p.slots, p.pouch])).toEqual([[6, 0], [8, 0], [10, 2]]);
    expect(packForTier(3).name).toBe('equip.expeditionPack');
  });

  it('lanterns burn 300 / 600 / 900 s; the Attuned one keeps a bright ember and the cold away', () => {
    expect(LANTERNS.map((l) => l.fuelSeconds)).toEqual([300, 600, 900]);
    expect(LANTERNS.map((l) => l.noCold)).toEqual([false, false, true]);
    expect(lanternForTier(3).ember).toBe(0.7);
    const l = new Lantern(300, 0);
    expect(l.radiusFactor).toBe(PLAYER.emptyLanternFactor);
    l.refill(lanternForTier(3));
    l.update(1000, false, lanternForTier(3));
    expect(l.lit).toBe(false);
    expect(l.radiusFactor).toBe(0.7);
  });

  it('Lantern.add refuels in the field, capped at the capacity', () => {
    const l = new Lantern(300, 100);
    expect(l.add(30)).toBe(30);
    expect(l.fuel).toBe(130);
    expect(l.add(1000)).toBe(170);
    expect(l.fuel).toBe(300);
    expect(l.add(-5)).toBe(0);
    expect(l.add(Number.NaN)).toBe(0);
  });
});

describe('discoveries table', () => {
  it('numbers banners from the table: index = how many found, total from the table', () => {
    expect(DISCOVERY_TOTAL).toBe(DISCOVERIES.length);
    expect(new Set(DISCOVERIES.map((d) => d.id)).size).toBe(DISCOVERIES.length);
    for (const d of DISCOVERIES) {
      expect(en).toHaveProperty(`discovery.${d.id}.title`);
      expect(en).toHaveProperty(`discovery.${d.id}.body`);
    }
    expect(discoveryNumbering('crystals', ['crystals'])).toEqual({ index: 1, total: DISCOVERY_TOTAL, major: false });
    expect(discoveryNumbering('hollow', ['crystals', 'hollow'])).toEqual({ index: 2, total: DISCOVERY_TOTAL, major: true });
    // Unknown ids in an old save do not count.
    expect(discoveryNumbering('gate', ['nonsense', 'gate']).index).toBe(1);
    expect(discoveryDef('shrine')).toMatchObject({ major: true, slot: 3 });
    expect(discoveryDef('nope')).toBeNull();
  });
});

describe('the Next line', () => {
  const tier1 = { pickaxe: 1, lantern: 1, pack: 1 };

  it('a waiting pack comes first, even during the tutorial', () => {
    const o = new Objectives();
    const n = nextLine({ cacheDistance: 84.4, chain: o.step(), equipment: tier1, available: {}, bestDepth: 60 });
    expect(n).toEqual({ id: 'recoverPack', text: t('next.recoverPack', { distance: 84 }) });
    expect(n.text).toBe('Recover your pack — 84 m');
  });

  it('then the tutorial chain, then the closest upgrade, then going deeper; never empty, never "done"', () => {
    const o = new Objectives();
    expect(nextLine({ cacheDistance: null, chain: o.step(), equipment: tier1, available: {}, bestDepth: 0 }).text).toBe('Mine stone (0/12)');
    // Finish the chain.
    o.onEvent('item:picked', { item: 'stone', count: 12 });
    o.onEvent('item:picked', { item: 'copperOre', count: 8 });
    o.setTotals({ copperOwned: 8, atCamp: true });
    o.onEvent('craft:done', { recipe: 'copperPickaxe' });
    o.onEvent('block:broken', { x: 0, y: 0, z: 0, block: B.HARDENED_SLATE });
    o.onEvent('discovery', { id: 'gate' });
    expect(o.done).toBe(true);
    expect(o.step()).toBeNull();
    const eq = { pickaxe: 2, lantern: 1, pack: 1 };
    const n = nextLine({ cacheDistance: null, chain: o.step(), equipment: eq, available: { stone: 10, copperOre: 4 }, bestDepth: 96 });
    // Sturdy Pack needs 16 stone 4 copper (6 short); Copper Lantern needs 6 copper 3 glimmer (5 short): the lantern is closer.
    expect(n.id).toBe('craft:copperLantern');
    expect(n.text).toBe('Next: Copper Lantern — Copper Ore 4/6');
    const ready = nextLine({ cacheDistance: null, chain: null, equipment: eq, available: { copperOre: 6, glimmerShard: 3 }, bestDepth: 96 });
    expect(ready.text).toBe('Next: craft the Copper Lantern at the Workbench');
    const all = nextLine({ cacheDistance: null, chain: null, equipment: { pickaxe: 2, lantern: 2, pack: 2 }, available: {}, bestDepth: 96.4 });
    expect(all).toEqual({ id: 'deeper', text: 'Go deeper — your best is -96 m' });
    for (const line of [n, ready, all]) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.text).not.toMatch(/done|complete/i);
    }
    expect(en).not.toHaveProperty('objective.done');
  });

  it('closestRecipe skips what is owned', () => {
    expect(closestRecipe({ pickaxe: 2, lantern: 2, pack: 2 }, {})).toBeNull();
    expect(closestRecipe(tier1, { copperOre: 8, stone: 12 })).toMatchObject({ recipe: { id: 'copperPickaxe' }, missing: 0, short: null });
  });

  it('the chain still has its six steps', () => {
    expect(OBJECTIVE_CHAIN.length).toBe(6);
  });
});
