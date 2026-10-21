// Save v4 (hybrid SPEC §12, §13.1 U-SAVE1, U-SAVE2; BUILD §3.1 MUST 7). The SaveSystem's slots, checksums, corrupt-slot
// fallback and newer-version refusal are covered by tests/unit/save-system.test.ts; this file covers the v4 payload.
import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { contentsOf, setPlayerNode, type NodeAction } from '../../../src/idle/model/nodes';
import type { IdleState } from '../../../src/idle/model/state';
import { createHybrid, STEP_DT, stepIdle } from '../../../src/idle/model/step';
import { decodeRuns, encodeRuns, migrateV3toV4, normalizeSave, saveToState, stateToSave, validateSaveData } from '../../../src/save/saveData';
import { checksum, MemoryStore, MIGRATIONS, SAVE_KEYS, SaveSystem } from '../../../src/save/SaveSystem';
import { SAVE } from '../../../src/config/balance';
import type { SaveV4 } from '../../../src/save/types';

/** A state mid-crawl: in the Lamp Room with a lamp relit, a vein chipped, the note read; seen and charted bits; a rack. */
function midCrawl(): IdleState {
  const s = createHybrid(7, 1_000);
  const bus = createIdleBus();
  setPlayerNode(s, 2, 'explore', bus);
  const con = contentsOf(s, 2);
  const acts: NodeAction[] = [{ type: 'relight', lampId: con.lamps[0] }];
  const vein = con.strike.find((id) => con.sockets[id].kind !== 'secret') as string;
  acts.push({ type: 'strike', target: { kind: 'tappable', id: vein } });
  const note = con.focus.find((id) => con.sockets[id].kind === 'note');
  if (note) acts.push({ type: 'resolve', id: note, input: 'tap' });
  acts.push({ type: 'walk', x: 1.5, y: 0.25, z: -2, yaw: 0.4, pitch: -0.1 });
  stepIdle(s, STEP_DT, [], acts, bus);
  s.meta.seen.push(9, 10, 11, 40);
  s.meta.charted.push(0, 1);
  s.run.rack.push(0, 1);
  s.node.rackRelics.push('find:0:4');
  s.node.worksHp = Big.fromLog10(5.5);
  s.node.worksGold = Big.fromLog10(4.25);
  s.run.gold = Big.fromLog10(7.3);
  s.meta.gems = 42;
  return s;
}

describe('U-SAVE1 v4 round trip', () => {
  it('the node crawl survives stateToSave → JSON → normalize → saveToState', () => {
    const s = midCrawl();
    const save = stateToSave(s);
    expect(save.version).toBe(4);
    expect(validateSaveData(save)).toBe(true);
    const json = JSON.parse(JSON.stringify(save));
    const { data, report } = normalizeSave(json);
    expect(validateSaveData(data)).toBe(true);
    expect(report).toBeDefined();
    const t = saveToState(data, 2_000);
    expect(t.node.on).toBe(true);
    expect(t.node.node).toBe(2);
    expect(t.node.phase).toBe('explore');
    expect(t.node.pose).toEqual({ x: 1.5, y: 0.25, z: -2, yaw: 0.4, pitch: -0.1 });
    expect(t.node.chambers[2]).toEqual(s.node.chambers[2]);
    expect([...t.meta.seen].sort((a, b) => a - b)).toEqual([...s.meta.seen].sort((a, b) => a - b));
    expect([...t.meta.charted].sort((a, b) => a - b)).toEqual([...s.meta.charted].sort((a, b) => a - b));
    expect(t.run.rack).toEqual(s.run.rack);
    expect(t.node.rackRelics).toEqual(['find:0:4']);
    expect(t.node.worksHp.log10()).toBeCloseTo(5.5, 12);
    expect(t.node.worksGold.log10()).toBeCloseTo(4.25, 12);
    expect(t.run.gold.log10()).toBeCloseTo(7.3, 12);
    expect(t.meta.gems).toBe(42);
    expect(t.meta.lore).toEqual(s.meta.lore);
    expect(t.run.depth).toBe(s.run.depth);
    // A second round trip is stable.
    expect(JSON.stringify(stateToSave(t).run)).toBe(JSON.stringify({ ...stateToSave(s).run }));
  });

  it('the seen and charted bitsets are run-length encoded and decode exactly', () => {
    for (const ids of [[], [0], [0, 1, 2, 3, 9, 10, 11, 400], Array.from({ length: 300 }, (_, i) => i * 2), Array.from({ length: 500 }, (_, i) => i)]) {
      expect(decodeRuns(encodeRuns(ids))).toEqual(ids);
    }
    expect(encodeRuns(Array.from({ length: 500 }, (_, i) => i)).length).toBeLessThanOrEqual(2);
  });

  it('a ride in progress loads at its end (the camera never resumes mid-ride)', () => {
    const s = createHybrid(7, 0);
    const bus = createIdleBus();
    setPlayerNode(s, 0, 'explore', bus);
    stepIdle(s, STEP_DT, [], [{ type: 'exit', exitId: 'e0' }], bus);
    expect(s.node.phase).toBe('ride');
    const t = saveToState(normalizeSave(JSON.parse(JSON.stringify(stateToSave(s)))).data, 10);
    expect(t.node.phase).not.toBe('ride');
    expect(t.node.ride).toBeNull();
    expect(t.node.node).toBe(1);
  });

  it('through the SaveSystem: a corrupt active slot falls back to the other; a newer build is refused', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    expect(saves.save({ ...stateToSave(midCrawl()), savedAt: 1000 }).ok).toBe(true);
    expect(saves.save({ ...stateToSave(midCrawl()), savedAt: 2000 }).ok).toBe(true);
    const active = store.getItem(SAVE_KEYS.active) === 'a' ? SAVE_KEYS.slotA : SAVE_KEYS.slotB;
    store.setItem(active, '{"broken":');
    const r = new SaveSystem(store).load();
    expect(r.recovered).toBe(true);
    expect(r.data?.savedAt).toBe(1000);
    expect(r.data?.run.node).toBe(2);
    const newer = new MemoryStore();
    newer.setItem(SAVE_KEYS.slotA, envelopeOf({ ...stateToSave(midCrawl()), savedAt: 5, version: SAVE.version + 1 }));
    newer.setItem(SAVE_KEYS.active, 'a');
    const res = new SaveSystem(newer).load();
    expect(res.data).toBeNull();
    expect(res.error).toBe('version');
  });
});

/** The SaveSystem's slot envelope (the body and its checksum). */
function envelopeOf(data: unknown): string {
  const json = JSON.stringify(data);
  return JSON.stringify({ checksum: checksum(json), json });
}

/** A v3 save as the cutaway build wrote it (the fields the migration reads, with the fields the purge drops). */
function v3Save(): Record<string, unknown> {
  const s = createHybrid(99, 0);
  const v4 = stateToSave(s) as unknown as Record<string, unknown>;
  const meta = { ...(v4.meta as Record<string, unknown>) };
  const crea = 'crea' + 'tures';
  return {
    version: 3,
    seed: 99,
    savedAt: 123_456,
    monotonicMs: 123_456,
    playTime: 4321,
    runIndex: 3,
    run: { depth: 412, gold: [1, 9] },
    meta: {
      ...meta,
      gems: 777,
      timeCrystals: 12,
      embers: [1, 3],
      embersMax: [5, 3],
      threads: [2, 1],
      sigils: { s1: 2 },
      loom: { nightShift: 1 },
      record: 640,
      finds: { 'find:0:4': 2, 'find:1:2': 1, [`${crea}:0:1`]: 1 },
      lore: ['lore:0:note0', 'lore:1:seal', 'best' + 'iary:3'],
      feats: { deep: 3, ['kin' + 'dred']: 2 },
      secrets: ['patience', 'mo' + 'thFriend'],
      rank: { r: 9, xp: 120 },
      stats: { ...(meta.stats as Record<string, number>), [crea]: 40, chests: 31 },
      caught: { goldenVein: 4, [crea]: 9, ['luckyM' + 'oth']: 3 },
      lastUsed: { [crea]: 10, seal: 50 },
      tutorial: { step: 9, done: true },
    },
  };
}

describe('U-SAVE2 the v3 → v4 migration', () => {
  it('keeps the listed meta, drops the purged fields, starts the run fresh at the camp, sets the notice once', () => {
    const old = v3Save();
    expect(MIGRATIONS[3]).toBe(migrateV3toV4);
    const out = migrateV3toV4(old) as unknown as SaveV4;
    expect(out.version).toBe(4);
    const m = out.meta;
    expect(m.gems).toBe(777);
    expect(m.timeCrystals).toBe(12);
    expect(m.embers).toEqual([1, 3]);
    expect(m.embersMax).toEqual([5, 3]);
    expect(m.threads).toEqual([2, 1]);
    expect(m.sigils).toEqual({ s1: 2 });
    expect(m.record).toBe(640);
    expect(m.rank).toEqual({ r: 9, xp: 120 });
    expect(m.finds).toEqual({ 'find:0:4': 2, 'find:1:2': 1 });
    expect(m.lore).toEqual(['lore:0:note0', 'lore:1:seal']);
    expect(m.feats).toEqual({ deep: 3 });
    expect(m.secrets).toEqual(['patience']);
    expect(m.stats.chests).toBe(31);
    expect(JSON.stringify(m)).not.toMatch(new RegExp(['crea' + 'ture', '[Mm]o' + 'th', 'kin' + 'dred', 'best' + 'iary'].join('|'))); // nothing the purge removed
    expect(m.caught).toEqual({ goldenVein: 4 });
    expect(m.rechartNotice).toBe(1);
    // The run starts fresh at the camp; the descent resumes from the adit plug.
    expect(out.run.phase).toBe('camp');
    expect(out.run.resume).toBe('dig');
    expect(out.savedAt).toBe(123_456);
    expect(out.playTime).toBe(4321);
    // It loads, and once the shell showed the notice (2) it never comes back.
    const { data } = normalizeSave(JSON.parse(JSON.stringify(out)));
    const t = saveToState(data, 200_000);
    expect(t.node.phase).toBe('camp');
    expect(t.run.depth).toBe(0);
    expect(t.meta.rechartNotice).toBe(1);
    t.meta.rechartNotice = 2;
    const again = saveToState(normalizeSave(JSON.parse(JSON.stringify(stateToSave(t)))).data, 300_000);
    expect(again.meta.rechartNotice).toBe(2);
  });

  it('through the SaveSystem: a v3 slot loads as v4 via MIGRATIONS[3]', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEYS.slotA, envelopeOf(v3Save()));
    store.setItem(SAVE_KEYS.active, 'a');
    const res = new SaveSystem(store).load();
    expect(res.error).toBeUndefined();
    expect(res.data?.version).toBe(4);
    expect(res.data?.meta.gems).toBe(777);
    expect(res.data?.meta.rechartNotice).toBe(1);
    expect(res.data?.run.phase).toBe('camp');
  });
});
