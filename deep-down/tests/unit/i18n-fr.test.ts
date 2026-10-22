import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { FR_SECTIONS, fr } from '../../src/i18n/fr';
import { FR_SOURCES } from '../../src/i18n/fr/sources';
import { LANGUAGES, coverage, detectLanguage, language, onLanguage, setLanguage, t } from '../../src/i18n';

/**
 * Round 3 (LOOP): the languages. English is complete; French fills in at the end of the round and
 * falls back to English key by key, so no raw key ever shows. A French line keeps the English line's
 * {placeholders} (the game fills them in either language).
 */
const placeholders = (s: string) => [...s.matchAll(/\{([A-Za-z]+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setLanguage('en'));

describe('languages (English, French)', () => {
  it('every French key is an English key and keeps its placeholders', () => {
    for (const [k, v] of Object.entries(fr)) {
      expect(k in en, k).toBe(true);
      expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
      expect(placeholders(v as string), k).toEqual(placeholders((en as Record<string, string>)[k]));
    }
  });

  it('no French line is stale: its English source is the one it was translated from (tools/loop-fr-sync.ts)', () => {
    const stale = Object.keys(fr).filter((k) => FR_SOURCES[k] !== (en as Record<string, string>)[k]);
    expect(stale.map((k) => `${k}: was "${FR_SOURCES[k]}", now "${(en as Record<string, string>)[k]}"`)).toEqual([]);
  });

  it('no key is defined twice across the French sections', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const [name, sec] of Object.entries(FR_SECTIONS)) for (const k of Object.keys(sec)) {
      if (seen.has(k)) dup.push(`${k} in ${seen.get(k)} and ${name}`);
      seen.set(k, name);
    }
    expect(dup).toEqual([]);
  });

  it('the device language picks French for any French locale, else English', () => {
    expect(detectLanguage(['fr-FR', 'en-US'])).toBe('fr');
    expect(detectLanguage(['fr_CA'])).toBe('fr');
    expect(detectLanguage(['de-DE', 'fr'])).toBe('fr');
    expect(detectLanguage(['es-ES'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'fr']);
  });

  it('switching falls back to English for a key French does not have yet, and tells the listeners', () => {
    const heard: string[] = [];
    const off = onLanguage((c) => heard.push(c));
    setLanguage('fr');
    expect(language()).toBe('fr');
    const k = 'quest.main.title';
    expect(t(k)).toBe((fr as Record<string, string>)[k] ?? en[k]);
    setLanguage('xx');
    expect(language()).toBe('en');
    off();
    expect(heard).toEqual(['fr', 'en']);
    expect(coverage('en')).toBe(1);
    expect(coverage('fr')).toBeGreaterThanOrEqual(0);
  });
});
