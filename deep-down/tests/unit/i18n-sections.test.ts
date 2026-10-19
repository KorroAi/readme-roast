import { describe, expect, it } from 'vitest';
import { EN_SECTIONS, en } from '../../src/i18n/en';

describe('English text sections', () => {
  it('never defines a key in two sections', () => {
    const owner = new Map<string, string>();
    const dupes: string[] = [];
    for (const [section, table] of Object.entries(EN_SECTIONS)) {
      for (const key of Object.keys(table)) {
        const prev = owner.get(key);
        if (prev) dupes.push(`${key} (${prev}, ${section})`);
        else owner.set(key, section);
      }
    }
    expect(dupes).toEqual([]);
    expect(Object.keys(en).length).toBe(owner.size);
  });

  it('has no empty strings', () => {
    expect(Object.entries(en).filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k)).toEqual([]);
  });
});
