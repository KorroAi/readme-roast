import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { buy } from '../../../src/idle/model/run';
import { resetWindow } from '../../../src/idle/model/shaft';
import { createIdle, stepIdle } from '../../../src/idle/model/step';
import { checksum, MemoryStore, SAVE_KEYS, saveToState, SaveSystem, stateToSave } from '../../../src/save/SaveSystem';
import { DEFAULT_SETTINGS } from '../../../src/save/types';

/** A random but plausible state: depth, gold, levels, damage on the floor, a seal, meta. */
function randomState(seed: number) {
  let r = seed * 2654435761 >>> 0 || 1;
  const rnd = () => ((r = (Math.imul(r ^ (r >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
  const s = createIdle(seed, 1_700_000_000_000 + seed * 1000);
  const depth = Math.floor(rnd() * 6000);
  s.meta.sealsOpened = Array.from({ length: Math.floor(rnd() * 14) }, (_, i) => i + 1);
  resetWindow(s, depth);
  s.run.dmax = depth + Math.floor(rnd() * 50);
  s.meta.record = s.run.dmax + Math.floor(rnd() * 500);
  s.run.gold = Big.fromLog10(rnd() * 120);
  s.run.pick = 1 + Math.floor(rnd() * 400);
  s.run.lines = Array.from({ length: Math.floor(rnd() * 15) }, () => Math.floor(rnd() * 300));
  s.run.gear = rnd() < 0.5 ? ['1.tools', '1.edge'] : [];
  s.run.ups = { lucky: Math.floor(rnd() * 25) };
  for (const row of s.shaft.rows) for (let c = 0; c < 7; c++) if (row.left[c] > 0 && rnd() < 0.3) row.left[c] = rnd();
  s.meta.gems = Math.floor(rnd() * 5000);
  s.meta.firstTime = ['ember', 'beat:star', 'gear:1'];
  s.meta.hints = { H1: 2 };
  s.meta.lifetime.gold = Big.fromLog10(rnd() * 200);
  s.run.rack = Array.from({ length: Math.floor(rnd() * 10) }, () => 0);
  s.tap.surge = Math.floor(rnd() * 240);
  s.meta.tutorial = { step: Math.floor(rnd() * 12), done: rnd() < 0.5, lessons: rnd() < 0.5 ? ['glints', 'lamps'] : [] };
  // W2: facets, boosts, the run's counters and splits, the par, contracts, the Codex, Feats, rank, the Director.
  s.run.facets = rnd() < 0.5 ? ['hotEdge@1', 'whistle@0', 'payday@2'] : [];
  s.run.hands = Math.floor(rnd() * 3);
  s.run.boosts = rnd() < 0.5 ? { crew2: { end: s.time + 30, mult: 2 } } : {};
  s.run.used = ['crystal:3', 'fossil:12'];
  s.run.lanterns = [1, 2];
  s.run.splits = { '2': 190.5 };
  s.run.par = Array.from({ length: 40 }, (_, i) => i * 12);
  s.run.taps = Math.floor(rnd() * 1e5);
  s.meta.contracts = [{ tpl: 'cells', target: 400, progress: 12, base: 900, arg: '', grand: false }, { tpl: 'gold', target: 41.5, progress: 39, base: 37, arg: 'log10', grand: true }];
  s.meta.finds = { 'find:0:0': 3, 'find:4:5': 1 };
  s.meta.lore = ['lore:1:note0'];
  s.meta.feats = { delver: 4, breaker: 2 };
  s.meta.secrets = ['lamplighter'];
  s.meta.marks = 11;
  s.meta.rank = { r: 1 + Math.floor(rnd() * 120), xp: Math.floor(rnd() * 500) };
  s.meta.planted = [{ depth: 640, n: 1 }, { depth: 905, n: 2 }];
  s.meta.swift600 = rnd() < 0.5 ? Infinity : 900;
  s.meta.caught = { targets: 33, seedFall: 2 };
  s.meta.rerolls = 2;
  s.director.history = ['goldenVein', 'caveIn'];
  s.director.since = { goldenVein: 1, caveIn: 0 };
  s.director.wait = 33;
  s.overrides = [{ depth: depth + 3, col: 2, kind: 8, floor: 0 }];
  return s;
}

describe('save v3 (SPEC §12.3, S1, S2)', () => {
  it('W2 fields round-trip: facets, boosts, counters, splits, par, contracts, Codex, Feats, rank, planted, the Director', () => {
    for (let i = 1; i <= 50; i++) {
      const a = randomState(i * 7);
      const b = saveToState(JSON.parse(JSON.stringify(stateToSave(a))), a.now);
      expect(b.run.facets).toEqual(a.run.facets);
      expect(b.run.hands).toBe(a.run.hands);
      expect(Object.keys(b.run.boosts)).toEqual(Object.keys(a.run.boosts));
      expect(b.run.splits).toEqual(a.run.splits);
      expect(b.run.par).toEqual(a.run.par);
      expect(b.run.taps).toBe(a.run.taps);
      expect(b.meta.contracts).toEqual(a.meta.contracts);
      expect(b.meta.finds).toEqual(a.meta.finds);
      expect(b.meta.feats).toEqual(a.meta.feats);
      expect(b.meta.rank).toEqual(a.meta.rank);
      expect(b.meta.planted).toEqual(a.meta.planted);
      expect(b.meta.swift600).toBe(a.meta.swift600);
      expect(b.meta.rerolls).toBe(a.meta.rerolls);
      expect(b.director.history).toEqual(a.director.history);
      expect(b.director.wait).toBeCloseTo(a.director.wait, 6);
      expect(b.overrides).toEqual(a.overrides);
      expect(JSON.stringify(stateToSave(a)).length).toBeLessThanOrEqual(16 * 1024);
    }
  });

  it('S1: 500 random states round-trip through the two-slot store, each ≤ 16 KB', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    let maxBytes = 0;
    for (let i = 1; i <= 500; i++) {
      const s = randomState(i);
      const d = stateToSave(s);
      expect(saves.save(d)).toEqual({ ok: true });
      const raw = store.getItem(store.getItem(SAVE_KEYS.active) === 'a' ? SAVE_KEYS.slotA : SAVE_KEYS.slotB)!;
      maxBytes = Math.max(maxBytes, raw.length);
      const back = new SaveSystem(store).load();
      expect(back.data).toEqual(JSON.parse(JSON.stringify(d)));
      // And into a live state again: the same numbers.
      const s2 = saveToState(back.data!, d.savedAt);
      expect(s2.run.depth).toBe(s.run.depth);
      expect(s2.run.gold.log10()).toBeCloseTo(s.run.gold.log10(), 9);
      expect(s2.run.lines).toEqual(s.run.lines);
      expect([...s2.shaft.rows[0].left]).toEqual([...s.shaft.rows[0].left].map((v) => (v > 0 ? +v.toPrecision(15) : 0)));
      expect(s2.meta.gems).toBe(s.meta.gems);
    }
    expect(maxBytes).toBeLessThanOrEqual(16 * 1024);
  });

  it('a saved game resumes and keeps playing (depth, gold and levels after a reload)', () => {
    const s = createIdle(77, 1000);
    for (let i = 0; i < 1200; i++) stepIdle(s, 1 / 60, i % 12 === 0 ? [{ col: i % 7, kind: 'tap' }] : []);
    buy(s, 'pick', 'x1');
    const d = stateToSave(s);
    const s2 = saveToState(JSON.parse(JSON.stringify(d)), s.now);
    expect(s2.run.depth).toBe(s.run.depth);
    expect(s2.run.pick).toBe(s.run.pick);
    expect(s2.run.gold.log10()).toBeCloseTo(s.run.gold.log10(), 9);
    for (let i = 0; i < 600; i++) stepIdle(s2, 1 / 60, i % 12 === 0 ? [{ col: 3, kind: 'tap' }] : []);
    expect(s2.meta.stats.cells).toBeGreaterThan(s.meta.stats.cells);
  });

  it('S2: a v2 save is ignored with one notice, settings kept, and overwritten by the first v4 saves', () => {
    const store = new MemoryStore();
    const v2 = JSON.stringify({ version: 2, savedAt: 5, worldSeed: 1, player: { x: 0, y: 0, z: 0 }, backpack: [] });
    store.setItem(SAVE_KEYS.slotA, JSON.stringify({ checksum: checksum(v2), json: v2 }));
    store.setItem(SAVE_KEYS.active, 'a');
    store.setItem(SAVE_KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, sfxVolume: 0.2, lookSensitivity: 1.4 }));
    const saves = new SaveSystem(store);
    expect(saves.load()).toEqual({ data: null, recovered: false, legacy: true });
    expect(saves.legacyNoticePending()).toBe(true);
    saves.markLegacyNoticeShown();
    expect(new SaveSystem(store).legacyNoticePending()).toBe(false);
    expect(saves.loadSettings().sfxVolume).toBe(0.2);
    saves.save(stateToSave(createIdle(1, 100)));
    saves.save(stateToSave(createIdle(1, 200)));
    for (const k of [SAVE_KEYS.slotA, SAVE_KEYS.slotB]) expect(JSON.parse(JSON.parse(store.getItem(k)!).json).version).toBe(4);
  });

  it('a seal fight saved mid-way resumes held, with its damage kept (nothing lost)', () => {
    const s = createIdle(4, 0);
    resetWindow(s, 40);
    stepIdle(s, 1 / 60, []);
    stepIdle(s, 1 / 60, [{ col: 2, kind: 'tap' }]);
    expect(s.seal).not.toBeNull();
    const left = s.seal!.left;
    const s2 = saveToState(JSON.parse(JSON.stringify(stateToSave(s))), s.now);
    expect(s2.seal?.phase).toBe('held');
    expect(s2.seal?.left).toBeCloseTo(left, 12);
  });
});
