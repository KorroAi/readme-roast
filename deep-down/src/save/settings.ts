import { DEFAULT_SETTINGS, type Settings } from './types';

/** Valid ranges for numeric settings. The settings UI should use the same bounds. */
export const SETTINGS_LIMITS = {
  renderScale: [0.5, 1.5],
  brightness: [0.7, 1.5],
  volume: [0, 1],
  cameraShake: [0, 1],
} as const;

const QUALITIES: readonly Settings['quality'][] = ['battery', 'balanced', 'high'];
const TEXT_SIZES: readonly Settings['textSize'][] = ['normal', 'large'];
const HAPTICS: readonly Settings['hapticStrength'][] = ['off', 'light', 'normal', 'strong'];
const MOTIONS: readonly Settings['motion'][] = ['full', 'reduced', 'off'];
const FLASHES: readonly Settings['flashes'][] = ['on', 'soft', 'off'];
const NOTATIONS: readonly Settings['notation'][] = ['letters', 'scientific', 'engineering'];

/**
 * Merge untrusted settings (parsed storage, UI patches) over the defaults: every field that is missing,
 * of the wrong type or out of range takes its default or is clamped. Never throws; unknown fields are
 * dropped, including the third-person game's `lookSensitivity`, `invertY` and `cameraFollow` (SPEC §12.3).
 * A v2 settings object keeps every field the descent still has (S2: settings survive the switch).
 */
export function sanitizeSettings(x: unknown): Settings {
  const s = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  const vibration = bool(s.vibration, d.vibration);
  // A v2 save had only the vibration switch: off maps to the 'off' strength.
  const hapticStrength = oneOf(s.hapticStrength, HAPTICS, vibration ? d.hapticStrength : 'off');
  return {
    quality: oneOf(s.quality, QUALITIES, d.quality),
    autoQuality: bool(s.autoQuality, d.autoQuality),
    renderScale: s.renderScale === null ? null : num(s.renderScale, SETTINGS_LIMITS.renderScale, d.renderScale),
    bloom: bool(s.bloom, d.bloom),
    brightness: num(s.brightness, SETTINGS_LIMITS.brightness, d.brightness),
    showFps: bool(s.showFps, d.showFps),
    leftHanded: bool(s.leftHanded, d.leftHanded),
    vibration,
    hapticStrength,
    masterVolume: num(s.masterVolume, SETTINGS_LIMITS.volume, d.masterVolume),
    musicVolume: num(s.musicVolume, SETTINGS_LIMITS.volume, d.musicVolume),
    sfxVolume: num(s.sfxVolume, SETTINGS_LIMITS.volume, d.sfxVolume),
    ambienceVolume: num(s.ambienceVolume, SETTINGS_LIMITS.volume, d.ambienceVolume),
    cameraShake: num(s.cameraShake, SETTINGS_LIMITS.cameraShake, d.cameraShake),
    textSize: oneOf(s.textSize, TEXT_SIZES, d.textSize),
    highContrast: bool(s.highContrast, d.highContrast),
    motion: oneOf(s.motion, MOTIONS, d.motion),
    flashes: oneOf(s.flashes, FLASHES, d.flashes),
    notation: oneOf(s.notation, NOTATIONS, d.notation),
    breakReminder: bool(s.breakReminder, d.breakReminder),
    autoFacets: bool(s.autoFacets, d.autoFacets),
  };
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function num<F extends number | null>(v: unknown, [lo, hi]: readonly [number, number], fallback: F): number | F {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}
