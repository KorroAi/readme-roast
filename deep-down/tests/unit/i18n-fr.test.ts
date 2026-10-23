import { afterEach, describe, expect, it } from 'vitest';
import { EN_SECTIONS, en } from '../../src/i18n/en';
import { FR_SECTIONS, fr, frenchSpacing } from '../../src/i18n/fr';
import { FR_SOURCES } from '../../src/i18n/fr/sources';
import { LANGUAGES, coverage, detectLanguage, formatNumber, language, onLanguage, setLanguage, t } from '../../src/i18n';

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

  it('every English key has its French line (the French pass covers every section, whoever writes the English)', () => {
    const missing: Record<string, string[]> = {};
    for (const [name, sec] of Object.entries(EN_SECTIONS)) {
      const m = Object.keys(sec).filter((k) => typeof (fr as Record<string, string | undefined>)[k] !== 'string');
      if (m.length) missing[name] = m;
    }
    const report = Object.entries(missing).map(([name, m]) => `${name}: ${m.length} missing (${m.slice(0, 4).join(', ')}${m.length > 4 ? ', …' : ''})`);
    expect(report, 'English keys with no French line yet (write them in src/i18n/fr/, then run tools/loop-fr-sync.ts)').toEqual([]);
  });

  it('no French line is stale: its English source is the one it was translated from (tools/loop-fr-sync.ts)', () => {
    const stale = Object.keys(fr).filter((k) => FR_SOURCES[k] !== (en as Record<string, string>)[k]);
    expect(
      stale.map((k) => `${k}: was "${FR_SOURCES[k]}", now "${(en as Record<string, string>)[k]}"`),
      'update these French lines, then run tools/loop-fr-sync.ts --accept <their keys> (a new line: no flag)',
    ).toEqual([]);
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

  it('French typography: typographic apostrophes, and a no-break space before : ; ! ? % (a phone HUD never wraps them alone)', () => {
    const straight: string[] = [];
    const breakable: string[] = [];
    for (const [k, v] of Object.entries(fr)) {
      if (/[A-Za-zÀ-ÿ]'[A-Za-zÀ-ÿ]/.test(v as string)) straight.push(k);
      if (/ [:;!?%»]|« /.test(v as string)) breakable.push(k);
    }
    expect(straight, 'use ’ in French text').toEqual([]);
    expect(breakable).toEqual([]);
    expect(frenchSpacing('Attention : la lave ! 20 %')).toBe('Attention\u00a0: la lave\u00a0! 20\u00a0%');
  });

  it('a stratum never wraps its numeral alone: a no-break space before it, in English and in French (QA 00:32)', () => {
    const E = en as Record<string, string>;
    const F = fr as Record<string, string>;
    for (let n = 1; n <= 6; n++) {
      expect(E[`stratum.${n}`]).toMatch(/^Stratum\u00a0[IVX]+$/);
      expect(F[`stratum.${n}`]).toMatch(/^Strate\u00a0[IVX]+$/);
    }
    const plain = /\bStrat(?:um|e) (?=[IVX]+\b|\{[a-z]+\})/;
    expect(Object.keys(F).filter((k) => plain.test(F[k]))).toEqual([]);
    // English: every section but UI's controls and MOBS's creatures (theirs to space; asked in STATUS).
    const enBad = Object.entries(EN_SECTIONS)
      .filter(([name]) => name !== 'controls' && name !== 'mobs')
      .flatMap(([, sec]) => Object.keys(sec).filter((k) => plain.test(E[k])));
    expect(enBad).toEqual([]);
    expect(frenchSpacing('Ouvrez la Porte de la Strate I')).toBe('Ouvrez la Porte de la Strate\u00a0I');
    expect(frenchSpacing('Strate {n}')).toBe('Strate\u00a0{n}');
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
    // Numbers in the language's notation: a decimal comma in French.
    expect(formatNumber(3.5)).toBe('3.5');
    setLanguage('fr');
    expect(formatNumber(3.5)).toBe('3,5');
    expect(formatNumber(2)).toBe('2');
    setLanguage('en');
    expect(coverage('en')).toBe(1);
    expect(coverage('fr')).toBeGreaterThanOrEqual(0);
  });
});
