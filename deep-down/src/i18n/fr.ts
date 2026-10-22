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
import { mobs } from './fr/mobs';
import { core } from './fr/core';
import { loop } from './fr/loop';
import { world } from './fr/world';
import { release } from './fr/release';
import { screens } from './fr/screens';
import { content } from './fr/content';
import { expanse } from './fr/expanse';

export const FR_SECTIONS = { core, loop, world, release, screens, content, expanse, items3, loop3, stretch3, pages3, controls, strata, mobs } as const;

/**
 * French typography, applied once to the whole table: the space before « : ; ! ? % » and after «,
 * and the one between thousands (2 000), is a no-break space, so a narrow phone HUD never wraps a
 * lone "!" or ":" onto its own line. The tables are written with plain spaces (easier to read).
 */
export function frenchSpacing(s: string): string {
  return s
    .replace(/ ([:;!?%\u00bb])/g, '\u00a0$1')
    .replace(/\u00ab /g, '\u00ab\u00a0')
    .replace(/(\d) (\d{3})(?!\d)/g, '$1\u00a0$2');
}

const merged: Partial<Record<TextKey, string>> = { ...core, ...loop, ...world, ...release, ...screens, ...content, ...expanse, ...items3, ...loop3, ...stretch3, ...pages3, ...controls, ...strata, ...mobs };

export const fr: Partial<Record<TextKey, string>> = Object.fromEntries(
  Object.entries(merged).map(([k, v]) => [k, frenchSpacing(v as string)]),
) as Partial<Record<TextKey, string>>;
