import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { t } from '../../src/i18n';
import { Journal } from '../../src/gameplay/Journal';
import { OBJECTIVE_CHAIN, OBJECTIVE_NEED, Objectives } from '../../src/gameplay/Objectives';

const at = (x: number) => ({ x, y: 0, z: 0 });

/** A new chain past the control steps (look round, walk), on a desktop (the texts say click and keys). */
function fresh(): Objectives {
  const o = new Objectives();
  o.setTotals({ touch: false });
  o.noteControls(90, 6);
  return o;
}

function mineStone(o: Objectives, n: number): void {
  for (let i = 0; i < n; i++) o.onEvent('block:broken', { ...at(i), block: B.RUBBLE });
}

/** Play the intended order up to (not including) `stop`. */
function playTo(o: Objectives, stop: (typeof OBJECTIVE_CHAIN)[number] | 'done'): void {
  const steps: Array<[string, () => void]> = [
    ['mineStone', () => mineStone(o, OBJECTIVE_NEED.stone)],
    ['findCopper', () => {
      o.onEvent('item:picked', { item: 'copperOre', count: OBJECTIVE_NEED.copper });
      o.setTotals({ copperOwned: OBJECTIVE_NEED.copper });
    }],
    ['returnToCamp', () => o.onEvent('camp:entered', {})],
    ['craftPickaxe', () => o.onEvent('craft:done', { recipe: 'copperPickaxe' })],
    ['breakSeal', () => o.onEvent('block:broken', { ...at(0), block: B.HARDENED_SLATE })],
    ['goDeeper', () => o.onEvent('discovery', { id: 'gate' })],
  ];
  for (const [id, run] of steps) {
    if (id === stop) return;
    run();
  }
}

describe('Objectives', () => {
  it('starts with the controls (look round, then walk), then mining stone, showing have/need', () => {
    const o = new Objectives();
    expect(o.current()).toEqual({ id: 'look', text: t('objective.look') });
    expect(o.noteControls(40, 0)).toBe(false);
    expect(o.noteControls(40, 0)).toBe(true);
    expect(o.current()).toEqual({ id: 'walk', text: t('objective.walk') });
    o.setTotals({ touch: false });
    expect(o.current().text).toBe(t('objective.walkDesktop'));
    expect(o.noteControls(0, 5.5)).toBe(true);
    expect(o.current()).toEqual({ id: 'mineStone', text: t('objective.mineStone', { have: 0, need: OBJECTIVE_NEED.stone }) });
    expect(o.current().text).toBe('Gather loose stone (0/12)');
    expect(o.completed).toEqual(['look', 'walk']);
    o.setTotals({ touch: true });
    expect(o.current().text).toBe('Tap glowing loose stone to gather it (0/12)');
    // Later steps do not count turning or walking.
    expect(o.noteControls(500, 500)).toBe(false);
  });

  it('never holds a player back on the controls: mining first skips them', () => {
    const o = new Objectives();
    mineStone(o, OBJECTIVE_NEED.stone);
    expect(o.currentId).toBe('findCopper');
  });

  it('counts broken blocks that drop stone, but not other blocks', () => {
    const o = fresh();
    mineStone(o, 3);
    o.onEvent('block:broken', { ...at(0), block: B.ROOTS }); // drops fibre
    o.onEvent('block:broken', { ...at(0), block: B.COPPER_ORE });
    o.onEvent('block:broken', { ...at(0), block: B.CRUMBLING_BRICK }); // drop item is stone
    expect(o.current().text).toBe('Gather loose stone (4/12)');
  });

  it('counts picked-up stone without double counting broken blocks', () => {
    const o = fresh();
    mineStone(o, 5);
    o.onEvent('item:picked', { item: 'stone', count: 5 });
    expect(o.current().text).toBe('Gather loose stone (5/12)');
    o.onEvent('item:picked', { item: 'stone', count: 3 });
    expect(o.current().text).toBe('Gather loose stone (8/12)');
  });

  it('walks the whole chain in order and reports changes', () => {
    const o = fresh();
    mineStone(o, OBJECTIVE_NEED.stone - 1);
    expect(o.currentId).toBe('mineStone');
    expect(o.onEvent('block:broken', { ...at(99), block: B.RUBBLE })).toBe(true);
    expect(o.current().id).toBe('findCopper');
    expect(o.current().text).toBe('Find copper ore (0/8)');

    expect(o.onEvent('item:picked', { item: 'copperOre', count: 5 })).toBe(false);
    expect(o.current().text).toBe('Find copper ore (5/8)');
    expect(o.onEvent('item:picked', { item: 'copperOre', count: 3 })).toBe(true);
    o.setTotals({ copperOwned: 8 });
    expect(o.current()).toEqual({ id: 'returnToCamp', text: t('objective.returnToCamp') });

    expect(o.onEvent('camp:entered', {})).toBe(true);
    expect(o.current().id).toBe('craftPickaxe');
    expect(o.onEvent('craft:done', { recipe: 'sturdyPack' })).toBe(false);
    expect(o.onEvent('craft:done', { recipe: 'copperPickaxe' })).toBe(true);
    expect(o.current().id).toBe('breakSeal');
    expect(o.onEvent('block:broken', { ...at(0), block: B.RUBBLE })).toBe(false);
    expect(o.onEvent('block:broken', { ...at(0), block: B.HARDENED_SLATE })).toBe(true);
    expect(o.current()).toEqual({ id: 'goDeeper', text: t('objective.goDeeper') });
    expect(o.onEvent('discovery', { id: 'hollow' })).toBe(false);
    expect(o.onEvent('discovery', { id: 'gate' })).toBe(true);
    expect(o.done).toBe(true);
    expect(o.current()).toEqual({ id: 'done', text: '' });
    expect(o.step()).toBeNull();
    expect(o.completed).toEqual([...OBJECTIVE_CHAIN]);
  });

  it('moves on as soon as a count target is reached', () => {
    const o = fresh();
    o.onEvent('item:picked', { item: 'stone', count: 4 });
    o.onEvent('item:picked', { item: 'copperOre', count: 3 });
    expect(o.current().text).toBe('Gather loose stone (4/12)');
    o.onEvent('item:picked', { item: 'stone', count: 40 });
    expect(o.current().text).toBe('Find copper ore (3/8)');
  });

  it('returning to camp needs enough copper owned at entry', () => {
    const o = fresh();
    playTo(o, 'returnToCamp');
    o.setTotals({ copperOwned: 3 }); // lost some on the way back (death)
    expect(o.current().text).toBe('Find copper ore (3/8)');
    expect(o.onEvent('camp:entered', {})).toBe(false);
    expect(o.currentId).toBe('returnToCamp');
    o.setTotals({ copperOwned: 8 });
    expect(o.current().id).toBe('returnToCamp');
    expect(o.onEvent('camp:entered', {})).toBe(true);
    expect(o.currentId).toBe('craftPickaxe');
  });

  it('completes the return when the last copper is picked up inside camp', () => {
    const o = fresh();
    playTo(o, 'returnToCamp');
    o.setTotals({ copperOwned: 7, atCamp: true });
    expect(o.currentId).toBe('returnToCamp');
    expect(o.setTotals({ copperOwned: 8, atCamp: true })).toBe(true);
    expect(o.currentId).toBe('craftPickaxe');
  });

  it('entering camp before having copper does not complete the return', () => {
    const o = fresh();
    o.setTotals({ copperOwned: 0 });
    o.onEvent('camp:entered', {});
    playTo(o, 'returnToCamp');
    expect(o.currentId).toBe('returnToCamp');
  });

  it('skips forward when a later objective is already satisfied', () => {
    const o = fresh();
    o.onEvent('craft:done', { recipe: 'copperPickaxe' });
    expect(o.currentId).toBe('breakSeal');
    expect(o.completed).toEqual(['look', 'walk', 'mineStone', 'findCopper', 'returnToCamp', 'craftPickaxe']);
  });

  it('skips forward from equipment that is already upgraded', () => {
    const o = fresh();
    expect(o.setTotals({ pickaxeTier: 2 })).toBe(true);
    expect(o.currentId).toBe('breakSeal');
  });

  it('skips several steps at once when they were done out of order', () => {
    const o = fresh();
    o.onEvent('item:picked', { item: 'copperOre', count: 8 });
    o.setTotals({ copperOwned: 8 });
    mineStone(o, 12);
    expect(o.currentId).toBe('returnToCamp');
    o.onEvent('discovery', { id: 'gate' });
    expect(o.done).toBe(true);
  });

  it('exposes the shrine as a side hint once the Hollow is found', () => {
    const o = fresh();
    expect(o.sideHint()).toBeNull();
    o.onEvent('discovery', { id: 'hollow' });
    expect(o.sideHint()).toEqual({ id: 'findShrine', text: t('objective.findShrine') });
    expect(OBJECTIVE_CHAIN).not.toContain('findShrine');
    o.onEvent('discovery', { id: 'shrine' });
    expect(o.sideHint()).toBeNull();
  });

  it('caches the current view until something changes', () => {
    const o = fresh();
    o.setTotals({ copperOwned: 0 });
    const a = o.current();
    expect(o.current()).toBe(a);
    o.setTotals({ copperOwned: 0 }); // unchanged totals, as the game reports every frame
    expect(o.current()).toBe(a);
    mineStone(o, 1);
    expect(o.current()).not.toBe(a);
  });

  it('round-trips through JSON mid-chain', () => {
    const o = fresh();
    playTo(o, 'craftPickaxe');
    mineStone(o, 2);
    const json = JSON.parse(JSON.stringify(o.toJSON()));
    expect(json.current).toBe('craftPickaxe');
    expect(json.completed).toEqual(['look', 'walk', 'mineStone', 'findCopper', 'returnToCamp']);
    const r = Objectives.fromJSON(json);
    expect(r.currentId).toBe('craftPickaxe');
    expect(r.toJSON()).toEqual(o.toJSON());
  });

  it('serializes the finished chain with current = null', () => {
    const o = fresh();
    playTo(o, 'done');
    const j = o.toJSON();
    expect(j.current).toBeNull();
    expect(Objectives.fromJSON(j).done).toBe(true);
  });

  it('restores from partial or damaged state without getting stuck', () => {
    expect(Objectives.fromJSON(null).currentId).toBe('look');
    expect(Objectives.fromJSON({ completed: ['mineStone'], current: 'bogus', stats: { stoneMined: 'x' } }).currentId).toBe('findCopper');
    expect(Objectives.fromJSON({ completed: [], current: null, stats: {} }).currentId).toBe('look');
    // A save from before the control steps: its finished chain stays finished, a mid-chain one resumes.
    expect(Objectives.fromJSON({ completed: ['mineStone', 'findCopper', 'returnToCamp', 'craftPickaxe', 'breakSeal', 'goDeeper'], current: null, stats: {} }).done).toBe(true);
    expect(Objectives.fromJSON({ completed: ['mineStone'], current: 'findCopper', stats: {} }).currentId).toBe('findCopper');
    // Stats that already satisfy later steps move the chain forward on load.
    const o = Objectives.fromJSON({ completed: [], current: 'mineStone', stats: { craftedPickaxe: 1, sealBroken: 1 } });
    expect(o.currentId).toBe('goDeeper');
  });

  it('ignores unknown discovery ids, including prototype keys', () => {
    const o = new Objectives();
    expect(o.onEvent('discovery', { id: 'toString' })).toBe(false);
    expect(o.onEvent('discovery', { id: 'crystals' })).toBe(false);
    expect(o.toJSON().stats).toEqual({});
  });

  it('ignores negative pickup counts', () => {
    const o = fresh();
    o.onEvent('item:picked', { item: 'stone', count: -50 });
    expect(o.current().text).toBe('Gather loose stone (0/12)');
  });
});

describe('Journal', () => {
  it('records discoveries and key items once, in order', () => {
    const j = new Journal();
    expect(j.addDiscovery('hollow')).toBe(true);
    expect(j.addDiscovery('hollow')).toBe(false);
    expect(j.addDiscovery('crystals')).toBe(true);
    expect(j.addKeyItem('ancientTablet')).toBe(true);
    expect(j.add('keyItem', 'ancientTablet')).toBe(false);
    expect(j.discoveries).toEqual(['hollow', 'crystals']);
    expect(j.keyItems).toEqual(['ancientTablet']);
  });

  it('has() answers for both kinds', () => {
    const j = new Journal();
    j.addDiscovery('gate');
    j.addKeyItem('ancientTablet');
    expect(j.has('gate')).toBe(true);
    expect(j.has('ancientTablet')).toBe(true);
    expect(j.hasDiscovery('ancientTablet')).toBe(false);
    expect(j.hasKeyItem('ancientTablet')).toBe(true);
    expect(j.has('shrine')).toBe(false);
  });

  it('rejects empty ids', () => {
    expect(new Journal().addDiscovery('')).toBe(false);
  });

  it('round-trips and dedupes saved data', () => {
    const j = Journal.fromJSON({ discoveries: ['hollow', 'hollow', 3, '', 'gate'], keyItems: ['ancientTablet'] });
    expect(j.toJSON()).toEqual({ discoveries: ['hollow', 'gate'], keyItems: ['ancientTablet'] });
    expect(Journal.fromJSON(JSON.parse(JSON.stringify(j.toJSON()))).toJSON()).toEqual(j.toJSON());
    expect(Journal.fromJSON('nope').toJSON()).toEqual({ discoveries: [], keyItems: [] });
  });

  it('toJSON is a detached copy', () => {
    const j = new Journal();
    j.addDiscovery('hollow');
    j.toJSON().discoveries.push('x');
    expect(j.discoveries).toEqual(['hollow']);
  });
});
