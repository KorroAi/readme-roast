// Shell-only preferences that live beside the settings (src/save is the model's): the creep variant for the week-1 A/B
// (SPEC §3.6, D2). Stored in `deepdown.hybrid.prefs`; read soft, never fatal.

export interface ShellPrefs {
  /** The creep: A the step (default), B the glide (the setting for the phone test). */
  creep: 'A' | 'B';
}

export const PREFS_KEY = 'deepdown.hybrid.prefs';
const DEFAULT: ShellPrefs = { creep: 'A' };

export function loadPrefs(): ShellPrefs {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(PREFS_KEY) : null;
    if (!raw) return { ...DEFAULT };
    const v = JSON.parse(raw) as Partial<ShellPrefs>;
    return { creep: v.creep === 'B' ? 'B' : 'A' };
  } catch {
    return { ...DEFAULT };
  }
}

export function savePrefs(p: ShellPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    // Private mode: the preference lasts for this session.
  }
}
