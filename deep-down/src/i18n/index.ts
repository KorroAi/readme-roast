import { en, type TextKey } from './en';

export type { TextKey } from './en';

type Table = Record<TextKey, string>;

const tables: Record<string, Table> = { en };
let active: Table = en;

/** Switch the active language table. English is the complete launch language. */
export function setLanguage(code: string): void {
  active = tables[code] ?? en;
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
