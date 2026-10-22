// French text table (round 3). Every key is an English key (TextKey); a key left out falls back to
// English, so a partial table never shows a raw key. tests/unit/i18n-fr.test.ts checks that each
// French line keeps the English line's {placeholders}, and that its English source has not changed
// since it was translated (src/i18n/fr/sources.ts, written by tools/loop-fr-sync.ts).
import type { TextKey } from './en';
import { items3 } from './fr/items3';
import { loop3 } from './fr/loop3';
import { pages3 } from './fr/pages3';
import { stretch3 } from './fr/stretch3';
import { controls } from './fr/controls';
import { strata } from './fr/strata';

export const FR_SECTIONS = { items3, loop3, stretch3, pages3, controls, strata } as const;

export const fr: Partial<Record<TextKey, string>> = { ...items3, ...loop3, ...stretch3, ...pages3, ...controls, ...strata };
