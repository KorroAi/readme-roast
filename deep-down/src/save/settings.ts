import { DEFAULT_SETTINGS, type Settings } from './types';

/** Valid ranges for numeric settings. The settings UI should use the same bounds. */
export const SETTINGS_LIMITS = {
  renderScale: [0.5, 1.5],
  lookSensitivity: [0.25, 2],
  volume: [0, 1],
  cameraShake: [0, 1],
} as const;

const QUALITIES: readonly Settings['quality'][] = ['battery', 'balanced', 'high'];
const TEXT_SIZES: readonly Settings['textSize'][] = ['normal', 'large'];

/**
 * Merge untrusted settings (parsed storage, UI patches) over the defaults: every field
 * that is missing, of the wrong type or out of range takes its default or is clamped.
 * Never throws; unknown fields are dropped.
 */
export function sanitizeSettings(x: unknown): Settings {
  const s = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  const d = DEFAULT_SETTINGS;
  return {
    quality: oneOf(s.quality, QUALITIES, d.quality),
    renderScale: s.renderScale === null ? null : num(s.renderScale, SETTINGS_LIMITS.renderScale, d.renderScale),
    bloom: bool(s.bloom, d.bloom),
    showFps: bool(s.showFps, d.showFps),
    lookSensitivity: num(s.lookSensitivity, SETTINGS_LIMITS.lookSensitivity, d.lookSensitivity),
    invertY: bool(s.invertY, d.invertY),
    leftHanded: bool(s.leftHanded, d.leftHanded),
    masterVolume: num(s.masterVolume, SETTINGS_LIMITS.volume, d.masterVolume),
    musicVolume: num(s.musicVolume, SETTINGS_LIMITS.volume, d.musicVolume),
    sfxVolume: num(s.sfxVolume, SETTINGS_LIMITS.volume, d.sfxVolume),
    ambienceVolume: num(s.ambienceVolume, SETTINGS_LIMITS.volume, d.ambienceVolume),
    cameraShake: num(s.cameraShake, SETTINGS_LIMITS.cameraShake, d.cameraShake),
    textSize: oneOf(s.textSize, TEXT_SIZES, d.textSize),
    highContrast: bool(s.highContrast, d.highContrast),
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
