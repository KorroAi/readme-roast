import { describe, expect, it } from 'vitest';
import { SAVE } from '../../src/config/balance';
import {
  LocalStorageStore,
  MemoryStore,
  MIGRATIONS,
  SAVE_KEYS,
  SaveSystem,
  StoreError,
  checksum,
  createNewSave,
  validateSaveData,
  type KeyValueStore,
} from '../../src/save/SaveSystem';
import { DEFAULT_SETTINGS, type SaveData } from '../../src/save/types';

function sample(savedAt: number, tweak: (d: SaveData) => void = () => {}): SaveData {
  const d = createNewSave(0xdeedd0, savedAt);
  d.playTime = savedAt / 1000;
  d.run.gold = [1.5, 12];
  d.run.pick = 7;
  d.run.lines = [12, 3];
  d.run.gear = ['1.tools'];
  d.meta.gems = 42;
  d.meta.record = 87;
  d.meta.sealsOpened = [1];
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
      ['valid checksum over the wrong shape', () => envelopeOf({ ...sample(2), run: 'lots' })],
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
    bad.run.digDepth = Number.NaN;
    expect(saves.save(bad)).toEqual({ ok: false, error: 'invalid' });
    expect(saves.save({ ...sample(3000), version: SAVE.version + 1 } as unknown as SaveData)).toEqual({ ok: false, error: 'invalid' });
    expect(store.getItem(SAVE_KEYS.slotB)).toBeNull();
    expect(new SaveSystem(store).load().data?.savedAt).toBe(1000);
  });

  it('reports a quota error and keeps the previous save', () => {
    const big = sample(2000, (d) => (d.meta.firstTime = Array.from({ length: 4000 }, (_, i) => `seen:${i}`)));
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
    saves.saveSettings({ ...DEFAULT_SETTINGS, leftHanded: true });
    saves.save(sample(1));
    saves.save(sample(2));
    saves.clear();
    expect(saves.hasSave()).toBe(false);
    expect(saves.timestamp()).toBeNull();
    expect(saves.load()).toEqual({ data: null, recovered: false });
    expect(saves.loadSettings().leftHanded).toBe(true);
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
    // Unwrapped, with reads throwing too: every entry point still answers instead of throwing.
    const bare = new SaveSystem(hostile);
    expect(bare.hasSave()).toBe(false);
    expect(bare.timestamp()).toBeNull();
    expect(bare.load()).toEqual({ data: null, recovered: false });
    expect(bare.save(sample(1))).toEqual({ ok: false, error: 'unavailable' });
    expect(bare.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(bare.saveSettings(DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'unavailable' });
    expect(() => bare.clear()).not.toThrow();
  });

  describe('versions: v3, the legacy saves of the old game, newer builds', () => {
    /** A save of the third-person game (v1 or v2): a different game, never loaded (SPEC §12.3). */
    function legacy(version: number, savedAt: number): Record<string, unknown> {
      return { version, genVersion: 3, savedAt, worldSeed: 1, playTime: 10, player: { x: 1, y: 2, z: 3, yaw: 0, health: 100, lanternFuel: 300 }, backpack: [], storage: {} };
    }

    for (const v of [1, 2]) {
      it(`a v${v} save is reported as legacy, not loaded, and no error`, () => {
        const store = new MemoryStore();
        store.setItem(SAVE_KEYS.slotA, envelopeOf(legacy(v, 500)));
        store.setItem(SAVE_KEYS.active, 'a');
        const res = new SaveSystem(store).load();
        expect(res).toEqual({ data: null, recovered: false, legacy: true });
        expect(new SaveSystem(store).hasSave()).toBe(false);
      });
    }

    it('the notice is pending once, and the first v4 saves overwrite both legacy slots (S2)', () => {
      const store = new MemoryStore();
      store.setItem(SAVE_KEYS.slotA, envelopeOf(legacy(2, 500)));
      store.setItem(SAVE_KEYS.slotB, envelopeOf(legacy(1, 400)));
      store.setItem(SAVE_KEYS.active, 'a');
      store.setItem(SAVE_KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, masterVolume: 0.3, invertY: true }));
      const saves = new SaveSystem(store);
      expect(saves.legacyNoticePending()).toBe(true);
      saves.markLegacyNoticeShown();
      expect(saves.legacyNoticePending()).toBe(false);
      // Settings survive the switch (minus the old camera fields).
      expect(saves.loadSettings().masterVolume).toBe(0.3);
      expect('invertY' in saves.loadSettings()).toBe(false);
      expect(saves.save(sample(1000)).ok).toBe(true);
      expect(saves.save(sample(2000)).ok).toBe(true);
      for (const key of [SAVE_KEYS.slotA, SAVE_KEYS.slotB]) expect(JSON.parse(JSON.parse(store.getItem(key)!).json).version).toBe(4);
      const res = new SaveSystem(store).load();
      expect(res).toMatchObject({ recovered: false, data: { savedAt: 2000 } });
      expect(res.legacy).toBeUndefined();
    });

    it('a legacy slot beside a v4 slot: the v4 save loads (no recovery flag)', () => {
      const store = new MemoryStore();
      new SaveSystem(store).save(sample(1000)); // a
      store.setItem(SAVE_KEYS.slotB, envelopeOf(legacy(2, 3000)));
      store.setItem(SAVE_KEYS.active, 'b');
      const res = new SaveSystem(store).load();
      expect(res.data?.savedAt).toBe(1000);
      expect(res.recovered).toBe(false);
      expect(res.legacy).toBe(true);
    });

    it('a save from a newer build is reported, and the older slot is used if possible', () => {
      const store = new MemoryStore();
      store.setItem(SAVE_KEYS.slotA, envelopeOf({ ...sample(5000), version: SAVE.version + 1 }));
      store.setItem(SAVE_KEYS.active, 'a');
      expect(new SaveSystem(store).load()).toEqual({ data: null, recovered: false, error: 'version' });
      store.setItem(SAVE_KEYS.slotB, envelopeOf(sample(1000)));
      expect(new SaveSystem(store).load()).toMatchObject({ recovered: true, data: { savedAt: 1000 } });
    });

    it('the current version is 4 (the node crawl), and a v3 save migrates through MIGRATIONS[3]', () => {
      expect(SAVE.version).toBe(4);
      expect(typeof MIGRATIONS[3]).toBe('function');
      const store = new MemoryStore();
      new SaveSystem(store).save(sample(1));
      expect(new SaveSystem(store).load().data?.version).toBe(4);
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
  it('a new save is a fresh game at the surface and is valid', () => {
    const d = createNewSave(123, 77);
    expect(validateSaveData(d)).toBe(true);
    expect(d).toMatchObject({ version: 4, savedAt: 77, seed: 123, playTime: 0, runIndex: 0 });
    expect(d.run).toMatchObject({ digDepth: 0, node: 0, phase: 'dig', pick: 1, lines: [], gear: [], gold: [0, 0] });
    expect(d.run.rows.length).toBeGreaterThanOrEqual(4);
    expect(d.run.rows[0].kinds).toHaveLength(7);
    expect(d.meta).toMatchObject({ gems: 0, record: 0, sealsOpened: [], tutorial: { step: 0, done: false } });
  });

  const mutations: Array<[string, (d: Record<string, unknown> & SaveData) => void]> = [
    ['version 2', (d) => ((d as { version: number }).version = 2)],
    ['fractional version', (d) => ((d as { version: number }).version = 3.5)],
    ['missing run', (d) => delete (d as Partial<SaveData>).run],
    ['missing meta', (d) => delete (d as Partial<SaveData>).meta],
    ['NaN depth', (d) => (d.run.digDepth = Number.NaN)],
    ['negative depth', (d) => (d.run.digDepth = -3)],
    ['pick 0', (d) => (d.run.pick = 0)],
    ['gold not a pair', (d) => ((d.run as unknown as Record<string, unknown>).gold = 12)],
    ['lines not an array', (d) => ((d.run as unknown as Record<string, unknown>).lines = { 0: 1 })],
    ['rows not an array', (d) => ((d.run as unknown as Record<string, unknown>).rows = 'x')],
    ['gems a string', (d) => ((d.meta as unknown as Record<string, unknown>).gems = '5')],
    ['negative play time', (d) => (d.playTime = -1)],
    ['seed missing', (d) => delete (d as Partial<SaveData>).seed],
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
