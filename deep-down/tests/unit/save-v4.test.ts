import { describe, expect, it } from 'vitest';
import { SAVE, STRATA_GEN, WORLD } from '../../src/config/balance';
import { ITEMS } from '../../src/config/items';
import { EventBus, type GameEvents } from '../../src/core/events';
import { StratumManager, type StrataSave, type StratumHost } from '../../src/game/Stratum';
import { CHANGED_GIFT, freshFromOld } from '../../src/game/StratumFlow';
import { MemoryStore, SAVE_KEYS, SaveSystem, checksum, createNewSave, validateSaveData } from '../../src/save/SaveSystem';
import { normalizeStrata } from '../../src/save/saveData';
import type { SaveData } from '../../src/save/types';
import { ExploredMap } from '../../src/world/gen/strata/explored';

const SPAWN = { x: 120.5, y: 62, z: 40.5, yaw: 0 };

function envelopeOf(data: unknown): string {
  const json = JSON.stringify(data);
  return JSON.stringify({ checksum: checksum(json), json });
}

function storeWith(data: unknown): MemoryStore {
  const s = new MemoryStore();
  s.setItem(SAVE_KEYS.slotA, envelopeOf(data));
  s.setItem(SAVE_KEYS.active, 'a');
  return s;
}

/** A strata part as StratumManager.toSave writes it: two strata walked, a gate open, an outpost, shards. */
function strataPart(): StrataSave {
  const map = new ExploredMap(256, 256);
  map.markAround(100, 100, 20, 40);
  return {
    seed: 987654321,
    current: 2,
    deepest: 2,
    strata: {
      1: { edits: [1000, 0, 2000, 0], removedProps: ['s1_crystalCluster_4'], explored: map.serialise(), revealed: ['lair_amberHollows'], gateOpen: true, seenBiomes: ['amberHollows', 'mushroomForest'], found: ['vista_1'] },
      2: { edits: [], removedProps: [], explored: null, revealed: [], gateOpen: false, seenBiomes: ['rootGalleries'], found: [] },
    },
    outposts: [{ id: 'outpost_1', stratum: 1, x: 40.5, y: 50, z: 60.5, biome: 'mushroomForest' }],
    shards: ['amberHollows', 'mushroomForest'],
    gen: STRATA_GEN.genVersion,
  };
}

/** A 1.x (v3) save of the old hand-made world, with feats and lifetime counters earned. */
function v3Save(): Record<string, unknown> {
  const d = createNewSave({ x: 34.5, y: 101, z: 43.2, yaw: 1 }, WORLD.seed, 1_700_000_000_000) as unknown as Record<string, unknown> & SaveData;
  d.version = 3;
  d.playTime = 7200;
  d.worldEdits = [500, 0, 600, 0];
  d.removedProps = ['crystalCluster_3'];
  d.backpack[0] = { item: 'copperOre', count: 9 };
  d.storage = { stone: 80 };
  d.stats = { blocksMined: 900, deaths: 4, itemsBanked: 512 };
  d.progression.feats = ['firstDescent', 'tree'];
  d.progression.life = { ...d.progression.life, blocksMined: 900, itemsBanked: 512, caches: 6 };
  d.progression.records = { deepest: 131, biggestHaul: 40, expeditions: 12, blackouts: 3, bestStreak: 5, streak: 1 };
  return d;
}

describe('save v4 (round 3: the strata)', () => {
  it('is the current format: a strata save round-trips unchanged', () => {
    expect(SAVE.version).toBe(4);
    const d = createNewSave(SPAWN, WORLD.seed, 5);
    d.strata = strataPart();
    d.mobs = { known: ['crawler'], guardians: [] };
    expect(validateSaveData(d)).toBe(true);
    const store = new MemoryStore();
    expect(new SaveSystem(store).save(d)).toEqual({ ok: true });
    const res = new SaveSystem(store).load();
    expect(res.error).toBeUndefined();
    expect(res.data).toEqual(d);
  });

  it("keeps the black-out pack's stratum (LOOP's cache.stratum), and drops a stratum that is not one", () => {
    const d = createNewSave(SPAWN, WORLD.seed, 1_700_000_000_000);
    d.strata = strataPart();
    d.progression.cache = { x: 10.5, y: 30, z: 12.5, depth: 120, items: { copperOre: 4 }, stratum: 3 };
    const res = new SaveSystem(storeWith(d)).load();
    expect(res.data?.progression.cache).toEqual({ x: 10.5, y: 30, z: 12.5, depth: 120, items: { copperOre: 4 }, stratum: 3 });
    const bad = { ...d, progression: { ...d.progression, cache: { ...d.progression.cache!, stratum: 9 } } };
    const res2 = new SaveSystem(storeWith(bad)).load();
    expect(res2.data?.progression.cache?.stratum).toBeUndefined();
    expect(res2.data?.progression.cache?.items).toEqual({ copperOre: 4 });
  });

  it('drops a malformed strata part piece by piece, never the whole save', () => {
    const st = strataPart() as unknown as Record<string, unknown>;
    (st.strata as Record<string, unknown>)['9'] = { edits: [1, 2] };
    (st.strata as Record<string, unknown>)['1'] = { edits: [1, 2, 3], removedProps: ['a', 4], explored: 'junk', revealed: 'no', gateOpen: 'yes', seenBiomes: ['amberHollows', 'nowhere'] };
    st.outposts = [{ id: 'ok', stratum: 2, x: 1, y: 2, z: 3, biome: 'rootGalleries' }, { id: 'bad', stratum: 9, x: 1, y: 2, z: 3 }, 'junk'];
    st.shards = ['amberHollows', 'amberHollows', 'atlantis', 7];
    st.current = 42;
    const n = normalizeStrata(st)!;
    expect(n.current).toBe(1);
    expect(Object.keys(n.strata)).toEqual(['1', '2']);
    expect(n.strata[1]).toEqual({ edits: [], removedProps: ['a'], explored: null, revealed: [], gateOpen: false, seenBiomes: ['amberHollows'], found: [] });
    expect(n.outposts.map((o) => o.id)).toEqual(['ok']);
    expect(n.shards).toEqual(['amberHollows']);
    // No usable seed: no strata part at all (Continue then treats the save as another world's).
    expect(normalizeStrata({ current: 1 })).toBeUndefined();
    const d = createNewSave(SPAWN, WORLD.seed, 5) as unknown as Record<string, unknown>;
    d.strata = { seed: 'x' };
    const res = new SaveSystem(storeWith(d)).load();
    expect(res.data).not.toBeNull();
    expect(res.data!.strata).toBeUndefined();
  });

  it('a 1.x (v3) save loads as v4 marked changed, its old world edits gone and nothing else lost', () => {
    const old = v3Save();
    const res = new SaveSystem(storeWith(old)).load();
    expect(res.error).toBeUndefined();
    const d = res.data!;
    expect(d.version).toBe(4);
    expect(d.changed).toBe(true);
    expect(d.worldEdits).toEqual([]);
    expect(d.removedProps).toEqual([]);
    expect(d.progression.feats).toEqual(['firstDescent', 'tree']);
    expect(d.stats).toEqual(old.stats);
    expect(validateSaveData(d)).toBe(true);
  });

  it("the card's Begin: a new expedition keeping feats, lifetime counters, records, stats and play time, with a gift", () => {
    const d = new SaveSystem(storeWith(v3Save())).load().data!;
    const fresh = freshFromOld(d);
    expect(validateSaveData(fresh)).toBe(true);
    expect(fresh.version).toBe(SAVE.version);
    expect(fresh.changed).toBeUndefined();
    expect(fresh.progression.feats).toEqual(['firstDescent', 'tree']);
    expect(fresh.progression.life.caches).toBe(6);
    expect(fresh.progression.life.blocksMined).toBe(900);
    expect(fresh.progression.records.deepest).toBe(131);
    expect(fresh.stats).toEqual({ blocksMined: 900, deaths: 4, itemsBanked: 512 });
    expect(fresh.playTime).toBe(7200);
    // The old world's things do not come along: a new pack (the gift in it), an empty camp chest.
    expect(fresh.storage).toEqual({});
    expect(fresh.worldEdits).toEqual([]);
    const pack = Object.fromEntries(fresh.backpack.filter((s) => s).map((s) => [s!.item, s!.count]));
    for (const [item, n] of Object.entries(CHANGED_GIFT)) if (item in ITEMS) expect(pack[item]).toBe(Math.min(n!, ITEMS[item as keyof typeof ITEMS].stackSize));
    expect(pack.copperOre).toBeUndefined();
    // A fresh strata part: stratum I of a seed drawn from the old save (the same every time), at the arrival.
    expect(fresh.strata).toMatchObject({ current: 1, deepest: 1, strata: {}, outposts: [], shards: [], gen: STRATA_GEN.genVersion, fresh: true });
    expect(freshFromOld(d).strata!.seed).toBe(fresh.strata!.seed);
    // It saves and loads as an ordinary v4 save (no second card).
    const store = new MemoryStore();
    expect(new SaveSystem(store).save(fresh)).toEqual({ ok: true });
    const back = new SaveSystem(store).load().data!;
    expect(back.changed).toBeUndefined();
    expect(back.strata?.fresh).toBe(true);
  });

  it('stays within the 1.5 MB budget for a long expedition (six strata explored, 6000 edits each)', () => {
    const d = createNewSave(SPAWN, WORLD.seed, 5);
    const st = strataPart();
    for (let n = 1; n <= 6; n++) {
      const map = new ExploredMap(256, 256);
      for (let z = 0; z < 256; z++) for (let x = 0; x < 256; x++) if ((x * 7 + z * 13) % 10 < 7) map.markExplored(x, z, (x + z) % 90);
      const edits: number[] = [];
      for (let k = 0; k < 6000; k++) edits.push(1_000_000 + k * 977, k % 3 === 0 ? 0 : 120);
      st.strata[n as 1] = { edits, removedProps: Array.from({ length: 200 }, (_, i) => `s${n}_crystalCluster_${i}`), explored: map.serialise(), revealed: ['lair_a', 'lair_b'], gateOpen: true, seenBiomes: [], found: ['vista_1', 'river_1', 'works_1'] };
    }
    d.strata = st;
    const bytes = JSON.stringify({ checksum: '00000000', json: JSON.stringify(d) }).length;
    expect(bytes).toBeLessThan(1.5e6);
  });
});

describe('the StratumManager save part', () => {
  const host = (): StratumHost => ({ session: { layout: {} } as never, bus: new EventBus<GameEvents>(), loading: () => undefined, placeExplorer: () => undefined });

  it('reads back what it writes: seed, stratum, slices, outposts and shards', () => {
    const m = new StratumManager(host(), 1);
    expect(m.fromSave(strataPart())).toBe(true);
    const out = m.toSave();
    expect(out).toEqual(strataPart());
    expect(m.shardsHere()).toBe(0);
    expect(m.seed).toBe(987654321);
    expect(m.current).toBe(2);
  });

  it("a save from another strata generator keeps the expedition but not the cells (edits, props, maps)", () => {
    const m = new StratumManager(host(), 1);
    const old = { ...strataPart(), gen: STRATA_GEN.genVersion + 1 };
    expect(m.fromSave(old)).toBe(false);
    const out = m.toSave();
    expect(out.seed).toBe(old.seed);
    expect(out.shards).toEqual(old.shards);
    expect(out.strata[1]).toEqual({ edits: [], removedProps: [], explored: null, revealed: ['lair_amberHollows'], gateOpen: true, seenBiomes: ['amberHollows', 'mushroomForest'], found: ['vista_1'] });
    // Outposts stand on cells too: they go with the edits.
    expect(out.outposts).toEqual([]);
    expect(out.gen).toBe(STRATA_GEN.genVersion);
  });

  it('a new expedition forgets every slice', () => {
    const m = new StratumManager(host(), 1);
    m.fromSave(strataPart());
    m.reset(55);
    expect(m.toSave()).toEqual({ seed: 55, current: 1, deepest: 1, strata: {}, outposts: [], shards: [], gen: STRATA_GEN.genVersion });
  });
});

describe('the explored map (ExploredMap)', () => {
  it('round-trips its columns and heights, and ignores a map of another size or garbage', () => {
    const m = new ExploredMap(256, 256);
    expect(m.markAround(30, 40, 5, 33)).toBeGreaterThan(70);
    m.markExplored(255, 255, 90);
    const back = ExploredMap.deserialise(JSON.parse(JSON.stringify(m.serialise())), 256, 256);
    expect(back.count).toBe(m.count);
    expect(back.has(30, 40)).toBe(true);
    expect(back.has(30, 60)).toBe(false);
    expect(back.heightAt(30, 40)).toBe(33);
    expect(back.heightAt(255, 255)).toBe(90);
    expect(back.fraction()).toBeCloseTo(m.fraction());
    expect(ExploredMap.deserialise(m.serialise(), 128, 128).count).toBe(0);
    expect(ExploredMap.deserialise({ sx: 256, sz: 256, bits: '%%%', heights: '' }, 256, 256).count).toBe(0);
    expect(ExploredMap.deserialise(null, 256, 256).count).toBe(0);
  });
});
