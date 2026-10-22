import { en, type TextKey } from './en';
import { fr } from './fr';

export type { TextKey } from './en';

type Table = Record<TextKey, string>;

/** The languages the game speaks (round 3: English, the complete launch language, and French). */
export type LanguageCode = 'en' | 'fr';

export interface LanguageDef {
  code: LanguageCode;
  /** The language's own name (shown as is in every language). */
  name: string;
}

export const LANGUAGES: readonly LanguageDef[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
];

/** Every table: a language may leave keys out (they fall back to English). */
const tables: Record<LanguageCode, Partial<Table>> = { en, fr };
let active: Partial<Table> = en;
let activeCode: LanguageCode = 'en';
const listeners = new Set<(code: LanguageCode) => void>();

export function isLanguage(code: unknown): code is LanguageCode {
  return typeof code === 'string' && LANGUAGES.some((l) => l.code === code);
}

/** Switch the active language table (an unknown code is English). Listeners hear the change. */
export function setLanguage(code: string): void {
  const next: LanguageCode = isLanguage(code) ? code : 'en';
  active = tables[next] ?? en;
  if (next === activeCode) return;
  activeCode = next;
  for (const f of listeners) f(next);
}

/** The active language. */
export function language(): LanguageCode {
  return activeCode;
}

/** Hear language switches (the UI rebuilds its screens). @returns the unsubscribe. */
export function onLanguage(f: (code: LanguageCode) => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * The device's language among ours: the first of `preferred` (navigator.languages, best first)
 * whose primary subtag we speak ("fr-CA" → fr), else English.
 */
export function detectLanguage(preferred?: readonly string[] | null): LanguageCode {
  let list = preferred;
  if (!list) {
    try {
      const n = typeof navigator !== 'undefined' ? navigator : null;
      list = n ? (n.languages && n.languages.length ? n.languages : n.language ? [n.language] : []) : [];
    } catch {
      list = [];
    }
  }
  for (const tag of list) {
    const primary = String(tag).toLowerCase().split(/[-_]/)[0];
    if (isLanguage(primary)) return primary;
  }
  return 'en';
}

/** How much of a language's table is filled (keys with text / every English key). */
export function coverage(code: LanguageCode): number {
  const t = tables[code];
  const keys = Object.keys(en);
  let n = 0;
  for (const k of keys) if (typeof (t as Record<string, unknown>)[k] === 'string') n++;
  return keys.length ? n / keys.length : 1;
}

/**
 * Look up player-facing text. `{name}` placeholders are replaced from `params`.
 * Missing keys fall back to English, then to the key itself so gaps are visible in QA.
 */
export function t(key: TextKey, params?: Record<string, string | number>): string {
  let s = active[key] ?? en[key] ?? key;
  if (params) {
    for (const k in params) s = s.split(`{${k}}`).join(String(params[k]));
  }
  return s;
}

export function hasText(key: string): key is TextKey {
  return key in en;
}
