import { describe, expect, it } from 'vitest';
import { MemoryStore, SAVE_KEYS, SaveSystem } from '../../src/save/SaveSystem';
import { SETTINGS_LIMITS, sanitizeSettings } from '../../src/save/settings';
import { DEFAULT_SETTINGS, type Settings } from '../../src/save/types';

describe('sanitizeSettings', () => {
  it('returns a copy of the defaults for empty or non-object input', () => {
    for (const x of [null, undefined, 3, 'high', []]) {
      const s = sanitizeSettings(x);
      expect(s).toEqual(DEFAULT_SETTINGS);
      expect(s).not.toBe(DEFAULT_SETTINGS);
    }
  });

  it('merges partial settings over the defaults', () => {
    expect(sanitizeSettings({ quality: 'high', motion: 'reduced' })).toEqual({ ...DEFAULT_SETTINGS, quality: 'high', motion: 'reduced' });
  });

  it('drops the third-person fields and keeps the rest of a v2 settings object (S2)', () => {
    const v2 = { quality: 'battery', lookSensitivity: 1.6, invertY: true, cameraFollow: false, masterVolume: 0.4, vibration: false, leftHanded: true };
    const s = sanitizeSettings(v2);
    for (const k of ['lookSensitivity', 'invertY', 'cameraFollow']) expect(k in s).toBe(false);
    expect(s).toMatchObject({ quality: 'battery', masterVolume: 0.4, vibration: false, hapticStrength: 'off', leftHanded: true });
  });

  it('sanitizes the new fields (motion, flashes, notation, haptic strength, break reminder, auto facets)', () => {
    expect(sanitizeSettings({ motion: 'off', flashes: 'soft', notation: 'scientific', hapticStrength: 'strong', breakReminder: false, autoFacets: true })).toMatchObject({
      motion: 'off', flashes: 'soft', notation: 'scientific', hapticStrength: 'strong', breakReminder: false, autoFacets: true,
    });
    expect(sanitizeSettings({ motion: 'wild', flashes: 1, notation: 'roman', hapticStrength: 'max' })).toMatchObject({
      motion: 'full', flashes: 'on', notation: 'letters', hapticStrength: 'normal',
    });
  });

  it('clamps numeric ranges', () => {
    const s = sanitizeSettings({
      masterVolume: -1,
      musicVolume: 2,
      sfxVolume: 0.3,
      ambienceVolume: 1.0001,
      cameraShake: -0.5,
      renderScale: 0.1,
    });
    expect(s.masterVolume).toBe(0);
    expect(s.musicVolume).toBe(1);
    expect(s.sfxVolume).toBe(0.3);
    expect(s.ambienceVolume).toBe(1);
    expect(s.cameraShake).toBe(0);
    expect(s.renderScale).toBe(SETTINGS_LIMITS.renderScale[0]);
    expect(sanitizeSettings({ brightness: 3 }).brightness).toBe(SETTINGS_LIMITS.brightness[1]);
    expect(sanitizeSettings({ brightness: 'dark' }).brightness).toBe(1);
  });

  it('falls back per field on wrong types and unknown values', () => {
    const s = sanitizeSettings({
      quality: 'ultra',
      bloom: 'yes',
      showFps: 1,
      cameraShake: Number.NaN,
      masterVolume: '0.5',
      textSize: 'huge',
      highContrast: null,
      leftHanded: true,
    });
    expect(s).toEqual({ ...DEFAULT_SETTINGS, leftHanded: true });
  });

  it('keeps an explicit null render scale (preset default) and drops unknown fields', () => {
    expect(sanitizeSettings({ renderScale: null }).renderScale).toBeNull();
    expect(sanitizeSettings({ renderScale: 0.75 }).renderScale).toBe(0.75);
    expect(sanitizeSettings({ renderScale: Number.POSITIVE_INFINITY }).renderScale).toBe(DEFAULT_SETTINGS.renderScale);
    expect('extra' in sanitizeSettings({ extra: 1 })).toBe(false);
  });

  it('is idempotent on valid settings', () => {
    const custom: Settings = { ...DEFAULT_SETTINGS, quality: 'battery', renderScale: 0.8, textSize: 'large', masterVolume: 0.25 };
    expect(sanitizeSettings(custom)).toEqual(custom);
  });
});

describe('SaveSystem settings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(new SaveSystem(new MemoryStore()).loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings', () => {
    const store = new MemoryStore();
    const custom: Settings = { ...DEFAULT_SETTINGS, quality: 'high', bloom: false, notation: 'engineering', textSize: 'large' };
    expect(new SaveSystem(store).saveSettings(custom)).toEqual({ ok: true });
    expect(new SaveSystem(store).loadSettings()).toEqual(custom);
  });

  it('stores sanitized values', () => {
    const store = new MemoryStore();
    new SaveSystem(store).saveSettings({ ...DEFAULT_SETTINGS, masterVolume: 7 });
    expect(JSON.parse(store.getItem(SAVE_KEYS.settings)!).masterVolume).toBe(1);
  });

  it('corrupted settings yield the defaults', () => {
    const store = new MemoryStore();
    for (const raw of ['{"quality":', 'null', '"high"', '[1,2]', '']) {
      store.setItem(SAVE_KEYS.settings, raw);
      expect(new SaveSystem(store).loadSettings()).toEqual(DEFAULT_SETTINGS);
    }
  });

  it('merges older settings that lack newer fields', () => {
    const store = new MemoryStore();
    store.setItem(SAVE_KEYS.settings, JSON.stringify({ quality: 'battery', musicVolume: 0.1 }));
    expect(new SaveSystem(store).loadSettings()).toEqual({ ...DEFAULT_SETTINGS, quality: 'battery', musicVolume: 0.1 });
  });

  it('reports a quota error when settings cannot be written', () => {
    const saves = new SaveSystem(new MemoryStore(10));
    expect(saves.saveSettings(DEFAULT_SETTINGS)).toEqual({ ok: false, error: 'quota' });
    expect(saves.loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
