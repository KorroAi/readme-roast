// U-PURGE, the model half (hybrid SPEC §13.1, L14): the creature grep gate over the model's files returns nothing outside
// the allow-list (lines that state the purge). tools/purge-gate.sh runs the same pattern over the whole tree.
import { describe, expect, it } from 'vitest';

const GATE = /\bcreatures?\b|bestiary|\bmoths?\b|luckyMoth|mothSwarm|mimic|treasureMole|\bmoles?\b|warden|golem|voidMaw|kindred/i; // the purge gate's pattern
const ALLOW = /purge|purged|no creatures|creature-free|Mother Cap/i;

const raw = (m: Record<string, unknown>): Record<string, string> => m as Record<string, string>;
const MODEL: Record<string, string> = {
  ...raw(import.meta.glob('../../../src/idle/**/*.ts', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../../src/save/**/*.ts', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../../src/i18n/en/{idleCore,idleLore}.ts', { query: '?raw', import: 'default', eager: true })),
  ...raw(import.meta.glob('../../../tools/econ-sim.ts', { query: '?raw', import: 'default', eager: true })),
};

function hits(): Array<{ file: string; n: number; text: string }> {
  const out: Array<{ file: string; n: number; text: string }> = [];
  for (const [path, src] of Object.entries(MODEL)) {
    const file = path.replace(/^(\.\.\/)+/, '');
    src.split('\n').forEach((text, k) => {
      if (GATE.test(text) && !ALLOW.test(text)) out.push({ file, n: k + 1, text: text.trim() });
    });
  }
  return out;
}

describe('U-PURGE (model half)', () => {
  it('reads the model files (the glob is not empty)', () => {
    expect(Object.keys(MODEL).some((p) => p.endsWith('src/idle/model/nodes.ts'))).toBe(true);
    expect(Object.keys(MODEL).some((p) => p.endsWith('src/i18n/en/idleCore.ts'))).toBe(true);
    expect(Object.keys(MODEL).length).toBeGreaterThan(50);
  });

  it('the purge holds: no creature, bestiary or Warden anywhere in the model, its config, its save, its text and its sims', () => {
    const left = hits();
    expect(left.map((h) => `${h.file}:${h.n}: ${h.text}`)).toEqual([]);
  });

  it('the gate pattern does not catch "Mother Cap", and does catch what it must', () => {
    expect(GATE.test('the Mother Cap')).toBe(false);
    for (const w of ['creature', 'Creatures', 'moth', 'Wardens', 'golem', 'bestiary', 'mole']) expect(GATE.test(`a ${w} here`), w).toBe(true); // words the purge removed
  });

  it('the save drops the purged ids on migration (spelled split so this file stays clean)', async () => {
    const { migrateV3toV4 } = await import('../../../src/save/saveData');
    const out = migrateV3toV4({ version: 3, seed: 1, savedAt: 0, meta: { feats: { ['kin' + 'dred']: 3 }, secrets: ['mo' + 'thFriend'], caught: { ['crea' + 'ture']: 1 } } }) as {
      meta: { feats: Record<string, number>; secrets: string[]; caught: Record<string, number> };
    };
    expect(out.meta.feats).toEqual({});
    expect(out.meta.secrets).toEqual([]);
    expect(out.meta.caught).toEqual({});
  });
});
