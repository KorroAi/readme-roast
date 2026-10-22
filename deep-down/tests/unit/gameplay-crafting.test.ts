import { describe, expect, it } from 'vitest';
import { LANTERNS, PACKS, PICKAXES, packForTier } from '../../src/config/balance';
import { NODES, NODE_LIST, nodeInputs, type NodeDef, type NodeId } from '../../src/config/recipes';
import { Crafting, craft, evaluate, isOwned, type CraftContext } from '../../src/gameplay/Crafting';
import { buildTreeView, nodeStats } from '../../src/gameplay/Tree';
import { en } from '../../src/i18n/en';
import { Equipment } from '../../src/gameplay/Equipment';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';

function setup(pack = packForTier(1).slots) {
  return { backpack: new Backpack(pack), storage: new CampStorage(), equipment: new Equipment() };
}

/** A craft context at camp with nothing built and no world conditions met. */
function ctxOf(over: Partial<CraftContext> = {}): CraftContext {
  return { ...setup(), built: new Set<string>(), atCamp: true, rift: false, rune: false, ...over };
}

/** Fill storage with exactly a node's inputs. */
function stock(c: CraftContext, id: NodeId, into: 'storage' | 'backpack' = 'storage'): void {
  for (const [item, n] of nodeInputs(NODES[id])) (into === 'storage' ? c.storage : c.backpack).add(item, n);
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

describe('Crafting: the upgrade tree', () => {
  it('has the 12 nodes of plan 2.3 as amended (no Rift Winch, no Halden Lift) and the 4 weapon nodes of round 2, each with a sentence and a place', () => {
    expect(NODE_LIST.map((n) => n.id)).toEqual([
      'copperPickaxe', 'sturdyPack', 'copperLantern', 'surveyTable', 'forge', 'relicShelf',
      'ironPickaxe', 'expeditionPack', 'gripBoots', 'minersCoat', 'attunedLantern', 'glimmerPickaxe',
      'machete', 'sling', 'spear', 'flashCharges',
    ]);
    // Round 2: the weapons come from the Forge (after the first iron); Flash Charges repeat.
    for (const id of ['machete', 'sling', 'spear', 'flashCharges'] as const) expect(NODES[id].place).toBe('forge');
    expect(NODES.flashCharges.repeat).toEqual({ item: 'flashCharge', count: 2 });
    expect(NODE_LIST).not.toContainEqual(expect.objectContaining({ id: 'riftWinch' }));
    for (const n of NODE_LIST) {
      expect(en, n.id).toHaveProperty(n.name);
      expect(en, n.id).toHaveProperty(n.does);
      expect(['workbench', 'forge', 'camp', 'field']).toContain(n.place);
      // Rows are unique within a line (the screen lays them out in a grid).
      expect(NODE_LIST.filter((m) => m.line === n.line && m.row === n.row).length, n.id).toBe(1);
      for (const p of n.prereqs) if (p !== 'rift' && p !== 'rune') expect(NODES[p].order, `${n.id} after ${p}`).toBeLessThan(n.order);
    }
    // The amended prerequisite 9: "the Rift reached".
    expect(NODES.attunedLantern.prereqs).toEqual(['copperLantern', 'rift']);
    expect(NODES.glimmerPickaxe.prereqs).toEqual(['ironPickaxe', 'rift']);
    // Balance tiers (round 3: the strata's picks I-VI, five lanterns, four bags).
    expect([PICKAXES.length, LANTERNS.length, PACKS.length]).toEqual([6, 5, 4]);
  });

  it('reports missing materials with have/need (storage and pack together)', () => {
    const c = ctxOf();
    c.backpack.add('stone', 5);
    c.storage.add('copperOre', 3);
    const r = evaluate('copperPickaxe', c);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('missing');
    expect(r.have).toEqual({ copperOre: 3, stone: 5 });
    expect(r.missing).toEqual({ copperOre: 5, stone: 7 });
    c.backpack.add('stone', 7);
    c.backpack.add('copperOre', 5);
    expect(evaluate('copperPickaxe', c)).toMatchObject({ ok: true, reason: 'ok', missing: {} });
  });

  it('every refusal reason: owned > locked > notHere > carryToSite > missing', () => {
    // owned (an equipment tier, a station, a gear)
    const owned = ctxOf({ built: new Set(['forge', 'gripBoots']) });
    owned.equipment.upgrade('pickaxe', 2);
    expect(evaluate('copperPickaxe', owned).reason).toBe('owned');
    expect(evaluate('forge', owned).reason).toBe('owned');
    expect(evaluate('gripBoots', owned).reason).toBe('owned');
    // locked: a node, the rift, a rune; whatever is on hand
    const locked = ctxOf();
    stock(locked, 'forge');
    expect(evaluate('forge', locked)).toMatchObject({ reason: 'locked', unmet: ['copperPickaxe'] });
    expect(evaluate('ironPickaxe', locked)).toMatchObject({ reason: 'locked', unmet: ['forge'] });
    const lantern = ctxOf({ built: new Set(['forge']) });
    lantern.equipment.upgrade('lantern', 2);
    expect(evaluate('attunedLantern', lantern)).toMatchObject({ reason: 'locked', unmet: ['rift'] });
    expect(evaluate('attunedLantern', { ...lantern, rift: true }).reason).toBe('missing');
    expect(evaluate('relicShelf', ctxOf())).toMatchObject({ reason: 'locked', unmet: ['rune'] });
    expect(evaluate('relicShelf', ctxOf({ rune: true })).reason).toBe('ok');
    // notHere: away from camp, even with everything
    const away = ctxOf({ atCamp: false });
    stock(away, 'copperPickaxe');
    expect(evaluate('copperPickaxe', away).reason).toBe('notHere');
    expect(evaluate('copperPickaxe', { ...away, atCamp: true }).reason).toBe('ok');
    // carryToSite / missing for a field site (none ships today; the rule stays for content)
    const site: NodeDef = { ...NODES.gripBoots, id: 'gripBoots', place: 'field', prereqs: [] };
    const field = ctxOf({ atCamp: false, atSite: () => false });
    for (const [item, n] of nodeInputs(site)) field.backpack.add(item, n);
    expect(evaluate(site, field).reason).toBe('carryToSite');
    expect(evaluate(site, { ...field, atSite: () => true }).reason).toBe('ok');
    const empty = ctxOf({ atSite: () => true });
    expect(evaluate(site, empty).reason).toBe('missing');
  });

  it('camp nodes pay from storage first, then the pack; field sites from the pack only', () => {
    const c = ctxOf();
    c.storage.add('stone', 10);
    c.storage.add('copperOre', 20);
    c.backpack.add('stone', 5);
    c.backpack.add('copperOre', 3);
    const r = craft('copperPickaxe', c);
    expect(r.ok).toBe(true);
    expect(r.packSlots).toBeNull();
    expect(c.storage.count('stone')).toBe(0);
    expect(c.backpack.count('stone')).toBe(3);
    expect(c.storage.count('copperOre')).toBe(12);
    expect(c.backpack.count('copperOre')).toBe(3);
    expect(c.equipment.pickaxe().tier).toBe(2);
    // Field: storage does not count and is never touched.
    const site: NodeDef = { ...NODES.gripBoots, place: 'field', prereqs: [] };
    const f = ctxOf({ atSite: () => true });
    for (const [item, n] of nodeInputs(site)) f.storage.add(item, n);
    expect(evaluate(site, f).reason).toBe('missing');
    for (const [item, n] of nodeInputs(site)) f.backpack.add(item, n);
    expect(craft(site, f).ok).toBe(true);
    for (const [item, n] of nodeInputs(site)) {
      expect(f.storage.count(item)).toBe(n);
      expect(f.backpack.count(item)).toBe(0);
    }
  });

  it('does not change anything when it refuses', () => {
    const c = ctxOf();
    c.backpack.add('stone', 12);
    c.backpack.add('copperOre', 7);
    const r = craft('copperPickaxe', c);
    expect(r.reason).toBe('missing');
    expect(c.backpack.count('stone')).toBe(12);
    expect(c.backpack.count('copperOre')).toBe(7);
    expect(c.equipment.tier('pickaxe')).toBe(1);
  });

  it('the pack nodes resize the backpack (the Expedition Pack adds the Sealed Pouch)', () => {
    const c = ctxOf({ built: new Set(['forge']) });
    stock(c, 'sturdyPack', 'backpack');
    c.backpack.add('glimmerShard', 2);
    const r = Crafting.craft('sturdyPack', c);
    expect(r.ok).toBe(true);
    expect(r.packSlots).toBe(packForTier(2).slots);
    expect(c.backpack.slotCount).toBe(packForTier(2).slots);
    expect(c.backpack.count('glimmerShard')).toBe(2);
    stock(c, 'expeditionPack');
    expect(craft('expeditionPack', c).packSlots).toBe(packForTier(3).slots);
    expect(c.backpack.pouchSlots).toBe(packForTier(3).pouch);
  });

  it('every node is makeable from exactly its inputs once its prerequisites hold', () => {
    for (const n of NODE_LIST) {
      const c = ctxOf({ built: new Set(['forge', 'surveyTable', 'machete']), rift: true, rune: true });
      c.equipment.upgrade('pickaxe', n.id === 'glimmerPickaxe' ? 3 : n.id === 'ironPickaxe' ? 2 : n.id === 'copperPickaxe' ? 1 : 3);
      c.equipment.upgrade('lantern', n.id === 'copperLantern' ? 1 : 2);
      c.equipment.upgrade('pack', n.id === 'sturdyPack' ? 1 : 2);
      const built = new Set(c.built);
      built.delete(n.id);
      const ctx = { ...c, built };
      stock(ctx, n.id);
      const r = craft(n.id, ctx);
      expect(r.ok, n.id).toBe(true);
      expect(ctx.storage.total, n.id).toBe(0);
      // A repeatable craft is never owned: it can be made again.
      if (n.repeat) expect(isOwned(n, ctx.equipment, ctx.built), n.id).toBe(false);
      if (n.result.kind === 'equip') expect(ctx.equipment.tier(n.result.slot), n.id).toBe(n.result.tier);
    }
  });

  it('the tree view: states, reasons, cost chips, stats; places closed until built', () => {
    const c = ctxOf();
    c.storage.add('copperOre', 8);
    c.storage.add('stone', 12);
    const v = buildTreeView(c, { focus: 'camp', select: 'forge' });
    expect(v.nodes.length).toBe(16);
    expect(v.focus).toBe('camp');
    expect(v.select).toBe('forge');
    const byId = Object.fromEntries(v.nodes.map((n) => [n.id, n]));
    expect(byId.copperPickaxe).toMatchObject({ state: 'ok', reason: null, partial: false });
    expect(byId.forge).toMatchObject({ state: 'locked', reason: 'Build the Copper Pickaxe first'.replace('Build', 'Make') });
    expect(byId.ironPickaxe.reason).toBe('Build the Forge first');
    expect(byId.attunedLantern.reason).toBe('Make the Copper Lantern first');
    expect(byId.relicShelf).toMatchObject({ state: 'locked', auto: true, reason: 'Appears with your first rune' });
    expect(byId.surveyTable).toMatchObject({ state: 'missing', partial: true });
    expect(byId.surveyTable.cost).toEqual([{ item: 'stone', have: 12, need: 12 }, { item: 'copperOre', have: 8, need: 4 }, { item: 'glimmerShard', have: 0, need: 2 }]);
    expect(v.places.find((p) => p.id === 'forge')).toMatchObject({ open: false, reason: 'Build the Forge first' });
    // Away from camp the camp places close.
    const away = buildTreeView({ ...c, atCamp: false });
    expect(away.places.find((p) => p.id === 'workbench')).toMatchObject({ open: false, reason: 'Only at camp' });
    expect(away.nodes.find((n) => n.id === 'copperPickaxe')!.state).toBe('notHere');
    // Before -> after numbers.
    expect(nodeStats(NODES.gripBoots, c).map((s) => [s.beforeText, s.afterText])).toEqual([['1.1 m', '2.1 m'], ['3.5 m', '7 m']]);
    expect(nodeStats(NODES.minersCoat, c).map((s) => [s.before, s.after])).toEqual([[5, 7], [100, 50]]);
    expect(nodeStats(NODES.ironPickaxe, c)[1]).toMatchObject({ beforeText: 'Tier 1', afterText: 'Tier 3' });
  });

  it('keeps the W1 recipe ids and inputs for the first three nodes (data-key craft:copperPickaxe)', () => {
    expect(NODES.copperPickaxe).toMatchObject({ result: { kind: 'equip', slot: 'pickaxe', tier: 2 }, inputs: { copperOre: 8, stone: 12 } });
    expect(NODES.copperLantern.inputs).toEqual({ copperOre: 6, glimmerShard: 3 });
  });

  it('rejects unknown node ids loudly', () => {
    expect(() => evaluate('nope' as NodeId, ctxOf())).toThrow();
  });
});
