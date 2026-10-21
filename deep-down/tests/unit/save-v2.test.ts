import { describe, expect, it } from 'vitest';
import { SAVE, WORLD } from '../../src/config/balance';
import { ITEMS, type ItemId } from '../../src/config/items';
import { MIGRATIONS, MemoryStore, SAVE_KEYS, SaveSystem, checksum, createNewSave, validateSaveData } from '../../src/save/SaveSystem';
import { defaultProgression, normalizeSave, shiftWorldIfNeeded } from '../../src/save/saveData';
import type { ItemCounts, SaveData } from '../../src/save/types';

const SPAWN = { x: 34.5, y: 101, z: 43.2, yaw: Math.PI / 2 };

function envelopeOf(data: unknown): string {
  const json = JSON.stringify(data);
  return JSON.stringify({ checksum: checksum(json), json });
}

function store(data: unknown): MemoryStore {
  const s = new MemoryStore();
  s.setItem(SAVE_KEYS.slotA, envelopeOf(data));
  s.setItem(SAVE_KEYS.active, 'a');
  return s;
}

/** Every item the save owns: pack, storage and a cache. */
function totals(d: Pick<SaveData, 'backpack' | 'storage'> & { progression?: SaveData['progression'] }): ItemCounts {
  const out: ItemCounts = {};
  const add = (id: ItemId, n: number) => (out[id] = (out[id] ?? 0) + n);
  for (const s of d.backpack) if (s) add(s.item, s.count);
  for (const [k, v] of Object.entries(d.storage)) add(k as ItemId, v ?? 0);
  for (const [k, v] of Object.entries(d.progression?.cache?.items ?? {})) add(k as ItemId, v ?? 0);
  return out;
}

/** A save as the version-1 build wrote it: no genVersion or progression, the old 40/30/20 stacks, a 10-slot Sturdy Pack. */
function v1Fixture(): Record<string, unknown> {
  return {
    version: 1,
    savedAt: 1_700_000_000_000,
    worldSeed: WORLD.seed,
    playTime: 1312.5,
    player: { x: 92.5, y: 88, z: 76.5, yaw: 0.4, health: 72, lanternFuel: 410 },
    backpack: [
      { item: 'stone', count: 40 },
      { item: 'copperOre', count: 30 },
      { item: 'glimmerShard', count: 20 },
      { item: 'ironOre', count: 12 },
      null,
      { item: 'stone', count: 17 },
      null,
      null,
      { item: 'copperOre', count: 4 },
      { item: 'stone', count: 9 },
    ],
    storage: { stone: 120, copperOre: 18, glimmerShard: 3 },
    equipment: { pickaxe: 2, lantern: 2, pack: 2 },
    journal: ['ancientTablet'],
    discoveries: ['crystals', 'hollow', 'shrine', 'tablet'],
    objectives: { completed: ['mineStone', 'findCopper', 'returnToCamp', 'craftPickaxe'], current: 'breakSeal', stats: { stoneMined: 40 } },
    worldEdits: [100, 0, 2048, 0],
    removedProps: ['crystalCluster_2'],
    stats: { blocksMined: 311, deaths: 2, itemsBanked: 240 },
  };
}

describe('save v2', () => {
  it('is the current format, with migrations from v1 and v2', () => {
    expect(SAVE.version).toBe(3);
    expect(typeof MIGRATIONS[1]).toBe('function');
    expect(typeof MIGRATIONS[2]).toBe('function');
    const d = createNewSave(SPAWN, WORLD.seed, 1);
    expect(d.genVersion).toBe(WORLD.genVersion);
    expect(d.progression).toEqual(defaultProgression());
    expect(validateSaveData(d)).toBe(true);
  });

  it('a v1 save migrates to v3: oversized stacks move into storage and no item is lost', () => {
    const old = v1Fixture();
    const before = totals(old as unknown as SaveData);
    const res = new SaveSystem(store(old)).load();
    expect(res.error).toBeUndefined();
    const d = res.data!;
    expect(d.version).toBe(3);
    expect(totals(d)).toEqual(before);
    // The Sturdy Pack now has 8 slots, and every stack is within the new stack sizes.
    expect(d.backpack.length).toBe(8);
    for (const s of d.backpack) if (s) expect(s.count).toBeLessThanOrEqual(ITEMS[s.item].stackSize);
    expect(d.backpack[0]).toEqual({ item: 'stone', count: 30 });
    expect(d.backpack[1]).toEqual({ item: 'copperOre', count: 15 });
    expect(d.storage.stone).toBe(120 + 10 + 9); // the 40-stack's extra 10 and slot 9's stack
    expect(d.storage.copperOre).toBe(18 + 15 + 4); // the 30-stack's extra 15 and slot 8's stack
    // Everything else is kept; the v1 world is unknown (genVersion 0), so its edits drop on load.
    expect(d.genVersion).toBe(0);
    // v3: the lifetime counters start from the old stats.
    const st = old.stats as { blocksMined: number; itemsBanked: number };
    const life = { ...defaultProgression().life, blocksMined: st.blocksMined, itemsBanked: st.itemsBanked };
    expect(d.progression).toEqual({ ...defaultProgression(), life });
    expect(d.player).toEqual(old.player);
    expect(d.journal).toEqual(['ancientTablet']);
    expect(d.stats).toEqual(old.stats);
    expect(validateSaveData(d)).toBe(true);
  });

  it('a save holding an unknown item loads with that slot emptied and the dropped count reported', () => {
    const d = createNewSave(SPAWN, WORLD.seed, 5) as unknown as Record<string, unknown> & SaveData;
    d.backpack[0] = { item: 'stone', count: 4 };
    d.backpack[2] = { item: 'fooOre' as ItemId, count: 3 };
    (d.storage as Record<string, number>).barOre = 5;
    d.progression.cache = { x: 90.5, y: 88, z: 76.5, depth: 62, items: { stone: 2, ['fooOre' as ItemId]: 4 } };
    const res = new SaveSystem(store(d)).load();
    expect(res.data).not.toBeNull();
    expect(res.dropped).toBe(3 + 5 + 4);
    expect(res.data!.backpack[2]).toBeNull();
    expect(res.data!.backpack[0]).toEqual({ item: 'stone', count: 4 });
    expect(res.data!.storage).toEqual({});
    expect(res.data!.progression.cache!.items).toEqual({ stone: 2 });
  });

  it('a clean save reports nothing dropped and round-trips unchanged', () => {
    const d = createNewSave(SPAWN, WORLD.seed, 9);
    d.backpack[1] = { item: 'rootFibre', count: 7 };
    d.progression.cache = { x: 1.5, y: 40, z: 2.5, depth: 110, items: { copperOre: 3 } };
    d.progression.records = { deepest: 96, biggestHaul: 31, expeditions: 4, blackouts: 1, bestStreak: 3, streak: 0 };
    d.progression.trip = { n: 5, t0: 1200, deepest: 80, found: { stone: 3 }, mined: 4, damage: 10, discoveries: [], runes: [] };
    d.progression.hintsShown = ['move', 'mine'];
    const s = new MemoryStore();
    expect(new SaveSystem(s).save(d)).toEqual({ ok: true });
    const res = new SaveSystem(s).load();
    expect(res.dropped).toBeUndefined();
    expect(res.data).toEqual(d);
  });

  it('normalize fills missing progression fields and keeps fields a later wave added', () => {
    const d = createNewSave(SPAWN, WORLD.seed, 1) as unknown as Record<string, unknown>;
    d.progression = { day: 3, stations: ['forge'], futureField: { a: 1 } };
    const { data } = normalizeSave(d);
    const p = data.progression as Record<string, unknown>;
    expect(p).toMatchObject({ ...defaultProgression(), day: 3, stations: ['forge'] });
    expect(p.futureField).toEqual({ a: 1 });
    expect(validateSaveData(data)).toBe(true);
  });

  it('rejects malformed progression', () => {
    const bad: Array<(d: SaveData) => void> = [
      (d) => ((d as unknown as Record<string, unknown>).progression = 3),
      (d) => (d.progression.records.deepest = -1),
      (d) => (d.progression.hintsShown = [1 as never]),
      (d) => (d.progression.cache = { x: Number.NaN, y: 0, z: 0, depth: 0, items: {} }),
      (d) => (d.genVersion = -1),
    ];
    for (const f of bad) {
      const d = createNewSave(SPAWN, WORLD.seed, 1);
      f(d);
      expect(validateSaveData(d)).toBe(false);
    }
  });

  it('a genVersion mismatch keeps inventory, equipment, journal and stats, empties the edits and wakes at camp', () => {
    const d = createNewSave(SPAWN, WORLD.seed, 1);
    d.genVersion = WORLD.genVersion + 7;
    d.backpack[0] = { item: 'copperOre', count: 5 };
    d.storage = { stone: 40 };
    d.equipment = { pickaxe: 2, lantern: 2, pack: 1 };
    d.journal = ['ancientTablet'];
    d.discoveries = ['hollow', 'gate'];
    d.stats = { blocksMined: 50, deaths: 1, itemsBanked: 77 };
    d.worldEdits = [10, 0, 20, 0];
    d.removedProps = ['crystalCluster_1'];
    d.player = { x: 136, y: 25, z: 127, yaw: 1, health: 40, lanternFuel: 100 };
    d.progression.cache = { x: 120.5, y: 42, z: 100.5, depth: 108, items: { ironOre: 3, stone: 2 } };
    d.progression.records.deepest = 125;
    d.progression.looted = ['c_chest_0'];
    d.progression.life.caches = 4;
    const { data, shifted } = shiftWorldIfNeeded(d, SPAWN);
    expect(shifted).toBe(true);
    expect(data.genVersion).toBe(WORLD.genVersion);
    expect(data.worldEdits).toEqual([]);
    expect(data.removedProps).toEqual([]);
    expect([data.player.x, data.player.y, data.player.z]).toEqual([SPAWN.x, SPAWN.y, SPAWN.z]);
    expect(data.player.health).toBe(40);
    expect(data.backpack[0]).toEqual({ item: 'copperOre', count: 5 });
    expect(data.equipment).toEqual(d.equipment);
    expect(data.journal).toEqual(['ancientTablet']);
    expect(data.discoveries).toEqual(['hollow', 'gate']);
    expect(data.stats).toEqual(d.stats);
    expect(data.progression.records.deepest).toBe(125);
    // Cache ids follow generation order, so in the new world they name other caches: all closed again, the count kept.
    expect(data.progression.looted).toEqual([]);
    expect(data.progression.life.caches).toBe(4);
    // The pack left in the old world is carried to camp storage, nothing lost.
    expect(data.progression.cache).toBeNull();
    expect(data.storage).toEqual({ stone: 42, ironOre: 3 });
    expect(validateSaveData(data)).toBe(true);
    // The same version changes nothing.
    const same = createNewSave(SPAWN, WORLD.seed, 1);
    expect(shiftWorldIfNeeded(same, SPAWN)).toEqual({ data: same, shifted: false });
  });

  it('a v2 save migrates to v3: nothing opened, nothing earned, lifetime counters from its stats; its world edits still apply', () => {
    const v2 = createNewSave(SPAWN, WORLD.seed, 9) as unknown as Record<string, unknown> & SaveData;
    v2.version = 2;
    v2.genVersion = 3;
    v2.worldEdits = [12345, 0];
    v2.stats = { blocksMined: 321, deaths: 2, itemsBanked: 99 };
    const p = v2.progression as unknown as Record<string, unknown>;
    delete p.looted;
    delete p.feats;
    delete p.life;
    const res = new SaveSystem(store(v2 as never)).load();
    expect(res.error).toBeUndefined();
    const d = res.data!;
    expect(d.version).toBe(3);
    expect(d.progression.looted).toEqual([]);
    expect(d.progression.feats).toEqual([]);
    expect(d.progression.life.blocksMined).toBe(321);
    expect(d.progression.life.itemsBanked).toBe(99);
    expect(validateSaveData(d)).toBe(true);
    // Generator 4 keeps generator 3's edits (it only adds rock-locked places, finds and secrets).
    const shifted = shiftWorldIfNeeded(d, SPAWN);
    expect(shifted.shifted).toBe(false);
    expect(shifted.data.worldEdits).toEqual([12345, 0]);
    expect(shifted.data.genVersion).toBe(WORLD.genVersion);
    expect(shiftWorldIfNeeded({ ...d, genVersion: 2 }, SPAWN).shifted).toBe(true);
  });
});
