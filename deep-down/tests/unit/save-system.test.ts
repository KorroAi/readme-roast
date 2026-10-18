import { describe, expect, it } from 'vitest';
import { SAVE } from '../../src/config/balance';
import {
  LocalStorageStore,
  MemoryStore,
  SAVE_KEYS,
  SaveSystem,
  StoreError,
  checksum,
  createNewSave,
  validateSaveData,
  type KeyValueStore,
} from '../../src/save/SaveSystem';
import { DEFAULT_SETTINGS, type SaveData } from '../../src/save/types';

const SPAWN = { x: 30.5, y: 101, z: 40.5, yaw: 1.2 };

function sample(savedAt: number, tweak: (d: SaveData) => void = () => {}): SaveData {
  const d = createNewSave(SPAWN, 0xdeedd0, savedAt);
  d.playTime = savedAt / 1000;
  d.backpack[0] = { item: 'stone', count: 12 };
  d.storage = { copperOre: 8 };
  d.journal = ['ancientTablet'];
  d.discoveries = ['hollow'];
  d.worldEdits = [100, 0, 2048, 0];
  tweak(d);
  return d;
}

function envelopeOf(data: unknown): string {
  const json = JSON.stringify(data);
  return JSON.stringify({ checksum: checksum(json), json });
}

/** Store that delegates to a MemoryStore and fails writes to one key on demand. */
class FlakyStore implements KeyValueStore {
  readonly inner = new MemoryStore();
  failKey: string | null = null;
  getItem(key: string) {
    return this.inner.getItem(key);
  }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new StoreError('quota');
    this.inner.setItem(key, value);
  }
  removeItem(key: string) {
    this.inner.removeItem(key);
  }
}

describe('checksum (FNV-1a 32)', () => {
  it('matches the reference test vectors', () => {
    expect(checksum('')).toBe('811c9dc5');
    expect(checksum('a')).toBe('e40c292c');
    expect(checksum('foobar')).toBe('bf9cf968');
  });

  it('changes when a single character changes', () => {
    expect(checksum('{"x":1}')).not.toBe(checksum('{"x":2}'));
  });
});

describe('SaveSystem', () => {
  it('round-trips a save', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    expect(saves.hasSave()).toBe(false);
    expect(saves.timestamp()).toBeNull();
    const d = sample(1000);
    expect(saves.save(d)).toEqual({ ok: true });
    expect(saves.hasSave()).toBe(true);
    expect(saves.timestamp()).toBe(1000);
    const res = new SaveSystem(store).load();
    expect(res.recovered).toBe(false);
    expect(res.error).toBeUndefined();
    expect(res.data).toEqual(d);
  });

  it('alternates slots and flips the pointer after each save', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    saves.save(sample(1));
    expect(store.getItem(SAVE_KEYS.active)).toBe('a');
    saves.save(sample(2));
    expect(store.getItem(SAVE_KEYS.active)).toBe('b');
    saves.save(sample(3));
    expect(store.getItem(SAVE_KEYS.active)).toBe('a');
    const env = JSON.parse(store.getItem(SAVE_KEYS.slotB)!);
    expect(Object.keys(env).sort()).toEqual(['checksum', 'json']);
    expect(JSON.parse(env.json).savedAt).toBe(2);
    expect(new SaveSystem(store).load().data?.savedAt).toBe(3);
  });

  it('a fresh SaveSystem on existing storage writes to the inactive slot', () => {
    const store = new MemoryStore();
    new SaveSystem(store).save(sample(1));
    new SaveSystem(store).save(sample(2));
    expect(store.getItem(SAVE_KEYS.active)).toBe('b');
    expect(JSON.parse(JSON.parse(store.getItem(SAVE_KEYS.slotA)!).json).savedAt).toBe(1);
  });

  describe('corrupted active slot', () => {
    const corruptions: Array<[string, (raw: string) => string]> = [
      ['truncated envelope', (raw) => raw.slice(0, Math.floor(raw.length / 2))],
      ['altered json body (checksum no longer matches)', (raw) => {
        const env = JSON.parse(raw);
        env.json = env.json.replace('"playTime":2', '"playTime":9');
        return JSON.stringify(env);
      }],
      ['bad checksum', (raw) => {
        const env = JSON.parse(raw);
        env.checksum = '00000000';
        return JSON.stringify(env);
      }],
      ['valid checksum over truncated json', (raw) => {
        const json = JSON.parse(raw).json.slice(0, -10);
        return JSON.stringify({ checksum: checksum(json), json });
      }],
      ['valid checksum over the wrong shape', () => envelopeOf({ ...sample(2), backpack: 'lots' })],
      ['empty string', () => ''],
      ['not an object', () => '42'],
    ];

    for (const [name, corrupt] of corruptions) {
      it(`falls back to the other slot: ${name}`, () => {
        const store = new MemoryStore();
        const saves = new SaveSystem(store);
        saves.save(sample(1000));
        saves.save(sample(2000)); // active = b
        store.setItem(SAVE_KEYS.slotB, corrupt(store.getItem(SAVE_KEYS.slotB)!));
        const res = new SaveSystem(store).load();
        expect(res.recovered).toBe(true);
        expect(res.data?.savedAt).toBe(1000);
        expect(res.error).toBeUndefined();
      });
    }

    it('the next save overwrites the damaged slot, never the good one', () => {
      const store = new MemoryStore();
      const saves = new SaveSystem(store);
      saves.save(sample(1000));
      saves.save(sample(2000)); // active = b
      store.setItem(SAVE_KEYS.slotB, 'garbage');
      const fresh = new SaveSystem(store);
      expect(fresh.load().recovered).toBe(true);
      expect(fresh.save(sample(3000)).ok).toBe(true);
      expect(store.getItem(SAVE_KEYS.active)).toBe('b');
      expect(JSON.parse(JSON.parse(store.getItem(SAVE_KEYS.slotA)!).json).savedAt).toBe(1000);
      expect(new SaveSystem(store).load()).toMatchObject({ recovered: false, data: { savedAt: 3000 } });
    });

    it('also avoids the good slot when saving without loading first', () => {
      const store = new MemoryStore();
      const saves = new SaveSystem(store);
      saves.save(sample(1000));
      saves.save(sample(2000)); // active = b
      store.setItem(SAVE_KEYS.slotB, 'garbage');
      new SaveSystem(store).save(sample(3000));
      expect(JSON.parse(JSON.parse(store.getItem(SAVE_KEYS.slotA)!).json).savedAt).toBe(1000);
    });
  });

  it('reports corrupt when both slots are damaged', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    saves.save(sample(1));
    saves.save(sample(2));
    store.setItem(SAVE_KEYS.slotA, '{');
    store.setItem(SAVE_KEYS.slotB, '{"checksum":"x","json":"{}"}');
    const fresh = new SaveSystem(store);
    expect(fresh.load()).toEqual({ data: null, recovered: false, error: 'corrupt' });
    expect(fresh.hasSave()).toBe(false);
  });

  it('an interrupted save (pointer never flipped) keeps the previous save active', () => {
    const store = new FlakyStore();
    const saves = new SaveSystem(store);
    expect(saves.save(sample(1000)).ok).toBe(true);
    store.failKey = SAVE_KEYS.active;
    expect(saves.save(sample(2000))).toEqual({ ok: false, error: 'quota' });
    // The new data reached slot b, but it was never committed.
    expect(JSON.parse(JSON.parse(store.getItem(SAVE_KEYS.slotB)!).json).savedAt).toBe(2000);
    const res = new SaveSystem(store).load();
    expect(res).toMatchObject({ recovered: false, data: { savedAt: 1000 } });
    expect(saves.timestamp()).toBe(1000);
  });

  it('a crash mid-write of the inactive slot leaves the active save intact', () => {
    const store = new MemoryStore();
    new SaveSystem(store).save(sample(1000)); // active = a
    store.setItem(SAVE_KEYS.slotB, envelopeOf(sample(2000)).slice(0, 40));
    expect(new SaveSystem(store).load()).toMatchObject({ recovered: false, data: { savedAt: 1000 } });
  });

  it('without a pointer, loads the newest valid slot', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEYS.slotA, envelopeOf(sample(500)));
    store.setItem(SAVE_KEYS.slotB, envelopeOf(sample(900)));
    expect(new SaveSystem(store).load()).toMatchObject({ recovered: false, data: { savedAt: 900 } });
    store.setItem(SAVE_KEYS.active, 'zzz');
    expect(new SaveSystem(store).load().data?.savedAt).toBe(900);
  });

  it('refuses to write invalid data and keeps the previous save', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    saves.save(sample(1000));
    const bad = sample(2000);
    bad.player.x = Number.NaN;
    expect(saves.save(bad)).toEqual({ ok: false, error: 'invalid' });
    expect(saves.save({ ...sample(3000), version: SAVE.version + 1 })).toEqual({ ok: false, error: 'invalid' });
    expect(store.getItem(SAVE_KEYS.slotB)).toBeNull();
    expect(new SaveSystem(store).load().data?.savedAt).toBe(1000);
  });

  it('reports a quota error and keeps the previous save', () => {
    const big = sample(2000, (d) => (d.worldEdits = Array.from({ length: 4000 }, (_, i) => (i % 2 ? 0 : i))));
    const small = sample(1000);
    const quota = envelopeOf(small).length * 2 + 200;
    const store = new MemoryStore(quota);
    const saves = new SaveSystem(store);
    expect(saves.save(small).ok).toBe(true);
    expect(saves.save(big)).toEqual({ ok: false, error: 'quota' });
    expect(new SaveSystem(store).load().data?.savedAt).toBe(1000);
  });

  it('clear() deletes the save but keeps settings', () => {
    const store = new MemoryStore();
    const saves = new SaveSystem(store);
    saves.saveSettings({ ...DEFAULT_SETTINGS, invertY: true });
    saves.save(sample(1));
    saves.save(sample(2));
    saves.clear();
    expect(saves.hasSave()).toBe(false);
    expect(saves.timestamp()).toBeNull();
    expect(saves.load()).toEqual({ data: null, recovered: false });
    expect(saves.loadSettings().invertY).toBe(true);
    expect([...store.data.keys()]).toEqual([SAVE_KEYS.settings]);
    expect(saves.save(sample(3)).ok).toBe(true);
    expect(store.getItem(SAVE_KEYS.active)).toBe('a');
  });

  it('never throws, even when every storage call throws', () => {
    const hostile: KeyValueStore = {
      getItem: () => {
        throw new Error('boom');
      },
      setItem: () => {
        throw new TypeError('boom');
      },
      removeItem: () => {
        throw new Error('boom');
      },
    };
    // A hostile raw store is wrapped by LocalStorageStore in the game; check both paths.
    const wrapped = new SaveSystem(new LocalStorageStore(hostile));
    expect(wrapped.save(sample(1))).toEqual({ ok: false, error: 'unavailable' });
    expect(wrapped.load()).toEqual({ data: null, recovered: false });
    expect(() => wrapped.clear()).not.toThrow();
    expect(wrapped.loadSettings()).toEqual(DEFAULT_SETTINGS);
    const raw = new SaveSystem({ ...hostile, getItem: () => null });
    expect(raw.save(sample(1))).toEqual({ ok: false, error: 'unavailable' });
  });

  describe('versions and migrations', () => {
    /** A pre-release v1 shape: no removedProps/stats, lantern fuel stored as a fraction. */
    function legacyV1(): Record<string, unknown> {
      const d: Partial<SaveData> = sample(1000);
      delete d.removedProps;
      delete d.stats;
      return { ...d, version: 1, player: { ...d.player!, lanternFuel: 0.5 } };
    }

    const migrations = {
      1: (old: Record<string, unknown>) => ({
        ...old,
        removedProps: [],
        stats: { blocksMined: 0, deaths: 0, itemsBanked: 0 },
        player: { ...(old.player as object), lanternFuel: ((old.player as { lanternFuel: number }).lanternFuel ?? 1) * 300 },
      }),
    };

    it('migrates an older save up to the current version', () => {
      const store = new MemoryStore();
      store.setItem(SAVE_KEYS.slotA, envelopeOf(legacyV1()));
      store.setItem(SAVE_KEYS.active, 'a');
      const res = new SaveSystem(store, { version: 2, migrations }).load();
      expect(res.recovered).toBe(false);
      expect(res.data?.version).toBe(2);
      expect(res.data?.player.lanternFuel).toBe(150);
      expect(res.data?.removedProps).toEqual([]);
      expect(validateSaveData(res.data)).toBe(true);
    });

    it('chains several migration steps', () => {
      const store = new MemoryStore();
      store.setItem(SAVE_KEYS.slotA, envelopeOf(legacyV1()));
      store.setItem(SAVE_KEYS.active, 'a');
      const chain = { ...migrations, 2: (old: Record<string, unknown>) => ({ ...old, playTime: 42 }) };
      const res = new SaveSystem(store, { version: 3, migrations: chain }).load();
      expect(res.data).toMatchObject({ version: 3, playTime: 42 });
    });

    it('the unmigrated legacy shape is rejected by validation', () => {
      expect(validateSaveData(legacyV1())).toBe(false);
    });

    it('a missing or throwing migration step makes that slot unloadable', () => {
      const store = new MemoryStore();
      store.setItem(SAVE_KEYS.slotA, envelopeOf(legacyV1()));
      store.setItem(SAVE_KEYS.active, 'a');
      expect(new SaveSystem(store, { version: 2, migrations: {} }).load()).toEqual({ data: null, recovered: false, error: 'corrupt' });
      const throwing = {
        1: () => {
          throw new Error('bad migration');
        },
      };
      expect(new SaveSystem(store, { version: 2, migrations: throwing }).load().data).toBeNull();
    });

    it('a save from a newer build is reported, and the older slot is used if possible', () => {
      const store = new MemoryStore();
      store.setItem(SAVE_KEYS.slotA, envelopeOf({ ...sample(5000), version: SAVE.version + 1 }));
      store.setItem(SAVE_KEYS.active, 'a');
      expect(new SaveSystem(store).load()).toEqual({ data: null, recovered: false, error: 'version' });
      store.setItem(SAVE_KEYS.slotB, envelopeOf(sample(1000)));
      expect(new SaveSystem(store).load()).toMatchObject({ recovered: true, data: { savedAt: 1000 } });
    });

    it('the current version loads with the default migration table', () => {
      const store = new MemoryStore();
      new SaveSystem(store).save(sample(1));
      expect(new SaveSystem(store).load().data?.version).toBe(SAVE.version);
    });
  });
});

describe('LocalStorageStore', () => {
  function fakeStorage(setItem: (k: string, v: string) => void = () => {}) {
    const m = new Map<string, string>();
    return {
      map: m,
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => {
        setItem(k, v);
        m.set(k, v);
      },
      removeItem: (k: string) => void m.delete(k),
    };
  }

  it('passes reads and writes through', () => {
    const backend = fakeStorage();
    const s = new LocalStorageStore(backend);
    expect(s.available).toBe(true);
    s.setItem('k', 'v');
    expect(s.getItem('k')).toBe('v');
    s.removeItem('k');
    expect(s.getItem('k')).toBeNull();
  });

  it('maps quota exceptions to StoreError("quota")', () => {
    for (const err of [new DOMException('full', 'QuotaExceededError'), { name: 'NS_ERROR_DOM_QUOTA_REACHED' }, { code: 22 }]) {
      const s = new LocalStorageStore(
        fakeStorage(() => {
          throw err;
        }),
      );
      let caught: unknown;
      try {
        s.setItem('k', 'v');
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(StoreError);
      expect((caught as StoreError).code).toBe('quota');
    }
  });

  it('a quota error surfaces from SaveSystem.save as "quota"', () => {
    const backend = fakeStorage((k) => {
      if (k === SAVE_KEYS.slotB) throw new DOMException('full', 'QuotaExceededError');
    });
    const saves = new SaveSystem(new LocalStorageStore(backend));
    expect(saves.save(sample(1)).ok).toBe(true);
    expect(saves.save(sample(2))).toEqual({ ok: false, error: 'quota' });
    expect(saves.load().data?.savedAt).toBe(1);
  });

  it('works as an inert store when storage is unavailable', () => {
    const s = new LocalStorageStore(null);
    expect(s.available).toBe(false);
    expect(s.getItem('k')).toBeNull();
    expect(() => s.setItem('k', 'v')).toThrow(StoreError);
    expect(() => s.removeItem('k')).not.toThrow();
    const saves = new SaveSystem(s);
    expect(saves.save(sample(1))).toEqual({ ok: false, error: 'unavailable' });
    expect(saves.hasSave()).toBe(false);
    expect(saves.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(saves.saveSettings(DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'unavailable' });
  });

  it('defaults to the global localStorage, or none in Node', () => {
    const s = new LocalStorageStore();
    expect(s.available).toBe(typeof localStorage !== 'undefined');
  });
});

describe('validateSaveData / createNewSave', () => {
  it('a new save has fresh-game defaults and is valid', () => {
    const d = createNewSave(SPAWN, 123, 77);
    expect(validateSaveData(d)).toBe(true);
    expect(d).toMatchObject({
      version: SAVE.version,
      savedAt: 77,
      worldSeed: 123,
      playTime: 0,
      player: { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z, yaw: SPAWN.yaw, health: 100, lanternFuel: 300 },
      storage: {},
      equipment: { pickaxe: 1, lantern: 1, pack: 1 },
      objectives: { completed: [], current: 'mineStone', stats: {} },
      worldEdits: [],
      stats: { blocksMined: 0, deaths: 0, itemsBanked: 0 },
    });
    expect(d.backpack).toEqual([null, null, null, null, null, null]);
  });

  const mutations: Array<[string, (d: Record<string, unknown> & SaveData) => void]> = [
    ['version 0', (d) => (d.version = 0)],
    ['fractional version', (d) => (d.version = 1.5)],
    ['missing player', (d) => delete (d as Partial<SaveData>).player],
    ['NaN coordinate', (d) => (d.player.y = Number.NaN)],
    ['string health', (d) => ((d.player as unknown as Record<string, unknown>).health = '100')],
    ['negative play time', (d) => (d.playTime = -1)],
    ['unknown backpack item', (d) => (d.backpack[0] = { item: 'gold' as never, count: 1 })],
    ['key item in backpack', (d) => (d.backpack[0] = { item: 'ancientTablet', count: 1 })],
    ['zero count stack', (d) => (d.backpack[0] = { item: 'stone', count: 0 })],
    ['huge backpack', (d) => (d.backpack = new Array(500).fill(null))],
    ['storage unknown item', (d) => (d.storage = { gold: 1 } as never)],
    ['storage negative', (d) => (d.storage = { stone: -1 })],
    ['equipment tier 0', (d) => (d.equipment.pack = 0)],
    ['journal not strings', (d) => (d.journal = [1] as never)],
    ['objectives current number', (d) => (d.objectives.current = 3 as never)],
    ['objectives stats NaN', (d) => (d.objectives.stats = { a: Number.NaN })],
    ['odd world edits', (d) => (d.worldEdits = [1, 2, 3])],
    ['fractional world edit', (d) => (d.worldEdits = [1.5, 2])],
    ['removedProps missing', (d) => delete (d as Partial<SaveData>).removedProps],
    ['stats fractional', (d) => (d.stats.deaths = 0.5)],
  ];

  for (const [name, mutate] of mutations) {
    it(`rejects: ${name}`, () => {
      const d = sample(1) as Record<string, unknown> & SaveData;
      mutate(d);
      expect(validateSaveData(d)).toBe(false);
    });
  }

  it('rejects non-objects without throwing', () => {
    for (const x of [null, undefined, 0, 'save', [], () => 1]) expect(validateSaveData(x)).toBe(false);
  });
});
