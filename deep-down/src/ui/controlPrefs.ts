/**
 * Round 3 (UI): the control layout's and the screen's own preferences (Settings: button size and
 * opacity; accessibility: rarity patterns for colour-blind players, reduced motion). They are a
 * per-device convenience, kept in localStorage beside the settings (the save is not touched); a
 * private window or blocked storage simply keeps the defaults.
 */
export interface ControlPrefs {
  /** Button size multiplier (0.8 .. 1.3). */
  scale: number;
  /** Button opacity at rest (0.35 .. 1). */
  opacity: number;
  /** Rarity also told by pattern and letter, not by colour alone (colour-blind players). */
  patterns: boolean;
  /** Motion: follow the device's setting ('auto'), or reduce it here whatever it says. */
  motion: 'auto' | 'reduce';
}

const KEY = 'deepdown.controls';
export const DEFAULT_CONTROL_PREFS: ControlPrefs = { scale: 1, opacity: 0.86, patterns: false, motion: 'auto' };

export function sanitizeControlPrefs(x: unknown): ControlPrefs {
  const v = (x ?? {}) as Partial<ControlPrefs>;
  const num = (n: unknown, lo: number, hi: number, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d);
  return {
    scale: num(v.scale, 0.8, 1.3, DEFAULT_CONTROL_PREFS.scale),
    opacity: num(v.opacity, 0.35, 1, DEFAULT_CONTROL_PREFS.opacity),
    patterns: v.patterns === true,
    motion: v.motion === 'reduce' ? 'reduce' : 'auto',
  };
}

export function loadControlPrefs(): ControlPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    return sanitizeControlPrefs(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_CONTROL_PREFS };
  }
}

export function saveControlPrefs(p: ControlPrefs): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(sanitizeControlPrefs(p)));
  } catch {
    // Storage refused: the change holds for this session only.
  }
}
