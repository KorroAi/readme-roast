import { describe, expect, it } from 'vitest';
import { AUTHORED_BIOMES, biomeStart } from '../../../src/idle/config/biomes';
import { expectedGold, KINDS, mixFor } from '../../../src/idle/config/cells';
import { rowKinds } from '../../../src/idle/model/shaft';
import { CELL, COLS } from '../../../src/idle/model/state';

describe('the cell mix (E13)', () => {
  it('every biome table has an expected gold multiplier of 1.00 ± 0.01 (analytic)', () => {
    for (let b = 0; b < AUTHORED_BIOMES + 8; b++) expect(Math.abs(expectedGold(mixFor(b)) - 1)).toBeLessThan(0.01);
    // The Rich mutator's law: ore shares ×2, rock gold re-solved.
    expect(Math.abs(expectedGold(mixFor(5, 2)) - 1)).toBeLessThan(1e-9);
  });

  it('generated rows of every biome average 1.00 ± 0.01 (Monte Carlo over seeds)', () => {
    const kinds = new Uint8Array(COLS);
    for (let b = 1; b < AUTHORED_BIOMES + 3; b++) {
      const from = biomeStart(b) + 1;
      const to = Math.min(biomeStart(b + 1) - 1, from + 79);
      let sum = 0;
      let n = 0;
      let ore = 0;
      for (let seed = 1; seed <= 400; seed++) {
        for (let d = from; d < to; d++) {
          rowKinds(seed * 7919, d, kinds);
          for (let c = 0; c < COLS; c++) {
            const k = kinds[c];
            if (k === CELL.AIR || k === CELL.CHEST || k === CELL.GATE) continue;
            sum += k === CELL.ROCK ? mixFor(b).rockGold : KINDS[k].gold;
            n++;
            if (k === CELL.ORE || k === CELL.RICH) ore++;
          }
        }
      }
      expect(Math.abs(sum / n - 1)).toBeLessThan(0.01);
      expect(ore / n).toBeGreaterThan(0.12);
      expect(ore / n).toBeLessThan(0.16);
    }
  });

  it('veins: ore comes in runs (2–6 cells), not salt and pepper', () => {
    const kinds = new Uint8Array(COLS);
    let adjacent = 0;
    let ores = 0;
    for (let d = 100; d < 20100; d++) {
      rowKinds(99, d, kinds);
      for (let c = 0; c < COLS; c++) {
        if (kinds[c] !== CELL.ORE && kinds[c] !== CELL.RICH) continue;
        ores++;
        const l = c > 0 && (kinds[c - 1] === CELL.ORE || kinds[c - 1] === CELL.RICH);
        const r = c < COLS - 1 && (kinds[c + 1] === CELL.ORE || kinds[c + 1] === CELL.RICH);
        if (l || r) adjacent++;
      }
    }
    // Independent cells at 14 % would neighbour another ore about 26 % of the time.
    expect(adjacent / ores).toBeGreaterThan(0.4);
  });

  it('chest cells every 25 rows on the centre column; gate rows at biome starts; row 0 pays 1 a cell', () => {
    const kinds = new Uint8Array(COLS);
    rowKinds(5, 49, kinds);
    expect(kinds[3]).toBe(CELL.CHEST);
    rowKinds(5, 120, kinds);
    expect([...kinds].every((k) => k === CELL.GATE)).toBe(true);
    rowKinds(5, 0, kinds);
    expect([...kinds].every((k) => k === CELL.TOPSOIL)).toBe(true);
    expect(KINDS[CELL.TOPSOIL].gold * 100 * 0.014).toBeCloseTo(1, 9);
  });
});
