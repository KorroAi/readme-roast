import { describe, expect, it } from 'vitest';
import { LANTERNS, PACKS, PLAYER, lanternForTier, packForTier } from '../../src/config/balance';
import { BLOCKS, B } from '../../src/config/blocks';
import { ITEMS, RUNE_ITEMS } from '../../src/config/items';
import { en } from '../../src/i18n/en';
import { t } from '../../src/i18n';
import { DISCOVERIES, DISCOVERY_TOTAL, discoveryDef, discoveryNumbering } from '../../src/gameplay/discoveries';
import { Lantern } from '../../src/gameplay/Lantern';
import { Objectives, OBJECTIVE_CHAIN } from '../../src/gameplay/Objectives';
import { nextLine, type NextInput } from '../../src/gameplay/NextStep';
import { closestNode } from '../../src/gameplay/Tree';
import { Equipment } from '../../src/gameplay/Equipment';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import type { CraftContext } from '../../src/gameplay/Crafting';
import type { ItemCounts } from '../../src/save/types';

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
  const ctx = (tiers: Partial<Record<'pickaxe' | 'lantern' | 'pack', number>>, storage: ItemCounts = {}, built: string[] = [], extra: Partial<CraftContext> = {}): CraftContext => {
    const st = new CampStorage();
    for (const [k, v] of Object.entries(storage)) st.add(k as keyof typeof ITEMS, v as number);
    return { backpack: new Backpack(6), storage: st, equipment: new Equipment(tiers), built: new Set(built), atCamp: true, rift: false, rune: false, ...extra };
  };
  const base = (over: Partial<NextInput>): NextInput => ({ cacheDistance: null, chain: null, node: null, runes: 0, runesTotal: 8, finale: false, rumour: null, bestDepth: 0, ...over });
  const node = (c: CraftContext) => {
    const n = closestNode(c);
    return n ? { id: n.id, short: n.short } : null;
  };

  it('a waiting pack comes first, even during the tutorial', () => {
    const o = new Objectives();
    const n = nextLine(base({ cacheDistance: 84.4, chain: o.step(), bestDepth: 60 }));
    expect(n).toEqual({ id: 'recoverPack', text: t('next.recoverPack', { distance: 84 }) });
    expect(n.text).toBe('Recover your pack — 84 m');
  });

  it('then the chain, the cheapest node, the runes, the stone, a rumour; never empty, never "done"', () => {
    const o = new Objectives();
    // The control steps first (look round, walk), then the loop.
    expect(nextLine(base({ chain: o.step() })).text).toBe('Drag anywhere to look around');
    o.setTotals({ touch: false });
    o.noteControls(90, 6);
    expect(nextLine(base({ chain: o.step() })).text).toBe('Mine stone (0/12)');
    // Finish the chain.
    o.onEvent('item:picked', { item: 'stone', count: 12 });
    o.onEvent('item:picked', { item: 'copperOre', count: 8 });
    o.setTotals({ copperOwned: 8, atCamp: true });
    o.onEvent('craft:done', { recipe: 'copperPickaxe' });
    o.onEvent('block:broken', { x: 0, y: 0, z: 0, block: B.HARDENED_SLATE });
    o.onEvent('discovery', { id: 'gate' });
    expect(o.done).toBe(true);
    expect(o.step()).toBeNull();
    // Copper pickaxe made; 10 stone 4 copper on hand. The Survey Table (12 St 4 Cu 2 Gl) is 4 short,
    // the Copper Lantern (6 Cu 3 Gl) 5 short, the Grip Boots (8 St 6 Fi 3 Cu) 6 short: the Table.
    const c1 = ctx({ pickaxe: 2 }, { stone: 10, copperOre: 4 });
    const n = nextLine(base({ chain: o.step(), node: node(c1), bestDepth: 96 }));
    expect(n.id).toBe('craft:surveyTable');
    expect(n.text).toBe('Next: Survey Table — Stone 10/12');
    const ready = nextLine(base({ node: node(ctx({ pickaxe: 2 }, { copperOre: 6, glimmerShard: 3 })) }));
    expect(ready.text).toBe('Next: craft the Copper Lantern at the Workbench');
    const forge = nextLine(base({ node: node(ctx({ pickaxe: 3, lantern: 2, pack: 2 }, { stone: 24, copperOre: 6, ironOre: 3 }, ['surveyTable', 'gripBoots'])) }));
    expect(forge.text).toBe('Next: build the Forge at camp');
    // Everything made that can be (the rift not reached yet): the runes.
    const all = ['surveyTable', 'forge', 'gripBoots', 'minersCoat', 'relicShelf'];
    const done = ctx({ pickaxe: 3, lantern: 2, pack: 3 }, {}, all);
    expect(closestNode(done)).toBeNull();
    const runes = nextLine(base({ node: null, runes: 5, bestDepth: 96 }));
    expect(runes).toEqual({ id: 'runes', text: 'Find the runes — 5/8' });
    const stone = nextLine(base({ runes: 8 }));
    expect(stone).toEqual({ id: 'stone', text: 'Take the eight runes to the black stone' });
    const rumour = nextLine(base({ runes: 8, finale: true, rumour: { id: 'haldenFace', what: 'Fresh copper and iron at the Halden Face', distance: 61.2 } }));
    expect(rumour).toEqual({ id: 'rumour:haldenFace', text: 'Fresh copper and iron at the Halden Face — 61 m' });
    const deeper = nextLine(base({ runes: 8, finale: true, bestDepth: 96.4 }));
    expect(deeper).toEqual({ id: 'deeper', text: 'Go deeper — your best is -96 m' });
    for (const line of [n, ready, forge, runes, stone, rumour, deeper]) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.text).not.toMatch(/done|complete/i);
    }
    expect(en).not.toHaveProperty('objective.done');
  });

  it('the closest node skips what is owned, locked or free', () => {
    // Nothing owned: the Forge is locked (Copper Pickaxe first), the shelf is free (it comes with a rune).
    const c = ctx({}, { copperOre: 8, stone: 12 });
    expect(closestNode(c)).toMatchObject({ id: 'copperPickaxe', missing: 0, short: null });
    const later = ctx({ pickaxe: 4, lantern: 3, pack: 3 }, {}, ['surveyTable', 'forge', 'gripBoots', 'minersCoat', 'relicShelf'], { rift: true, rune: true });
    expect(closestNode(later)).toBeNull();
  });

  it('the chain has its two control steps and the six steps of the loop', () => {
    expect(OBJECTIVE_CHAIN.length).toBe(8);
    expect(OBJECTIVE_CHAIN.slice(0, 2)).toEqual(['look', 'walk']);
  });
});
