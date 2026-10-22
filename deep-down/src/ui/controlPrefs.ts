/**
 * Round 3 (UI): the control layout's own preferences (Settings: button size and opacity). They are
 * a per-device convenience, kept in localStorage beside the settings (the save is not touched); a
 * private window or blocked storage simply keeps the defaults.
 */
export interface ControlPrefs {
  /** Button size multiplier (0.8 .. 1.3). */
  scale: number;
  /** Button opacity at rest (0.35 .. 1). */
  opacity: number;
}

const KEY = 'deepdown.controls';
export const DEFAULT_CONTROL_PREFS: ControlPrefs = { scale: 1, opacity: 0.86 };

export function sanitizeControlPrefs(x: unknown): ControlPrefs {
  const v = (x ?? {}) as Partial<ControlPrefs>;
  const num = (n: unknown, lo: number, hi: number, d: number) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d);
  return { scale: num(v.scale, 0.8, 1.3, DEFAULT_CONTROL_PREFS.scale), opacity: num(v.opacity, 0.35, 1, DEFAULT_CONTROL_PREFS.opacity) };
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
