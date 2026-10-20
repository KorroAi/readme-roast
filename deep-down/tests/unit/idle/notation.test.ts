import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { format, formatDepth, formatRate, suffixForGroup, suffixOf, suffixRank, THIN } from '../../../src/idle/num/notation';

const T = THIN;

describe('notation (SPEC §5.1, E14)', () => {
  it('integers below 10,000 with a thin space', () => {
    expect(format(0)).toBe('0');
    expect(format(7)).toBe('7');
    expect(format(999)).toBe('999');
    expect(format(1234)).toBe(`1${T}234`);
    expect(format(9999)).toBe(`9${T}999`);
    expect(format(0.9)).toBe('0.9');
  });

  it('every row of the suffix table, with three significant digits (truncated)', () => {
    const table: Array<[number, string]> = [
      [3, 'K'], [6, 'M'], [9, 'B'], [12, 'T'], [15, 'Qa'], [18, 'Qi'], [21, 'Sx'], [24, 'Sp'], [27, 'Oc'], [30, 'No'],
      [33, 'Dc'], [36, 'UDc'], [39, 'DDc'], [42, 'TDc'], [45, 'QaDc'], [48, 'QiDc'], [51, 'SxDc'], [54, 'SpDc'], [57, 'OcDc'],
      [60, 'NoDc'], [63, 'Vg'], [66, 'aa'], [69, 'ab'], [66 + 3 * 25, 'az'], [66 + 3 * 26, 'ba'], [2091, 'zz'],
    ];
    for (const [e, suf] of table) {
      if (e === 3) {
        expect(format(Big.fromLog10(4 + Math.log10(1.23)))).toBe('12.3K');
        continue;
      }
      expect(format(Big.fromLog10(e + Math.log10(4.567)))).toBe(`4.56${suf}`);
      expect(format(Big.fromLog10(e + 1 + Math.log10(1.2345)))).toBe(`12.3${suf}`);
      expect(format(Big.fromLog10(e + 2 + Math.log10(9.999)))).toBe(`999${suf}`);
    }
  });

  it('scientific past zz, and the exponent itself shortened past 1e1,000,000', () => {
    expect(format(Big.fromLog10(2094 + Math.log10(1.23)))).toBe('1.23e2094');
    expect(format(Big.fromLog10(1.2e6))).toBe('e1.20M');
    expect(format(Big.fromLog10(3.45e9))).toBe('e3.45B');
  });

  it('Scientific and Engineering modes', () => {
    const x = Big.fromLog10(45 + Math.log10(1.234));
    expect(format(x, 'scientific')).toBe('1.23e45');
    expect(format(x, 'engineering')).toBe('1.23e45');
    expect(format(Big.fromLog10(46 + Math.log10(1.234)), 'engineering')).toBe('12.3e45');
    expect(format(1234, 'scientific')).toBe(`1${T}234`);
  });

  it('is monotonic from 1 to 1e3000 (rank never falls, text never repeats a smaller value)', () => {
    let prevRank = -1;
    let prevLead = 0;
    for (let l = 0; l <= 3000; l += 0.137) {
      const x = Big.fromLog10(l);
      const r = suffixRank(x);
      expect(r).toBeGreaterThanOrEqual(prevRank);
      const txt = format(x);
      const lead = Number.parseFloat(txt.replace(T, '').replace(/^e/, ''));
      if (r === prevRank && l >= 4 && l < 2094) expect(lead).toBeGreaterThanOrEqual(prevLead);
      prevRank = r;
      prevLead = lead;
      expect(txt).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it('suffixes and depth text', () => {
    expect(suffixForGroup(1)).toBe('K');
    expect(suffixForGroup(21)).toBe('Vg');
    expect(suffixForGroup(22)).toBe('aa');
    expect(suffixOf(5000)).toBe('');
    expect(suffixOf(50000)).toBe('K');
    expect(formatDepth(128)).toBe(`128${T}m`);
    expect(formatDepth(9999)).toBe(`9${T}999${T}m`);
    expect(formatDepth(12480)).toBe(`12.48${T}km`);
    expect(formatDepth(128400)).toBe(`128.4${T}km`);
    expect(formatDepth(1234567)).toBe(`1${T}234${T}km`);
    expect(formatDepth(1000, 10)).toBe(`10.00${T}km`);
    expect(formatRate(4567)).toBe(`+4${T}567/s`);
    expect(formatRate(45678)).toBe('+45.6K/s');
  });
});
