import { describe, expect, it } from 'vitest';
import { Big, big, BIG_MAX_EXP } from '../../../src/core/big';

const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-300);

describe('Big (E14)', () => {
  it('normalises the mantissa into [1, 10) and keeps 0 as {0, 0}', () => {
    for (const x of [1, 9.99, 10, 12345.678, 0.000321, -42, 1e300, 5e-300]) {
      const b = Big.from(x);
      expect(Math.abs(b.m)).toBeGreaterThanOrEqual(1);
      expect(Math.abs(b.m)).toBeLessThan(10);
      expect(rel(b.toNumber(), x)).toBeLessThan(1e-14);
    }
    expect(Big.from(0)).toMatchObject({ m: 0, e: 0 });
    expect(Big.from(Number.NaN)).toMatchObject({ m: 0, e: 0 });
  });

  for (const e of [300, 5000, 1e15]) {
    it(`round-trips add, mul, div and pow at 1e${e} within 1e-12`, () => {
      const a = Big.fromLog10(e + 0.123456);
      const b = Big.fromLog10(e - 3 + 0.654321);
      // add then sub
      const s = a.add(b).sub(b);
      expect(rel(s.log10(), a.log10())).toBeLessThan(1e-12);
      expect(Math.abs(s.m - a.m)).toBeLessThan(1e-11);
      // mul then div
      const m = a.mul(b).div(b);
      expect(m.e).toBe(a.e);
      expect(Math.abs(m.m - a.m) / a.m).toBeLessThan(1e-12);
      // pow and back (exponent precision is the limit at 1e15)
      const p = a.pow(2).pow(0.5);
      expect(Math.abs(p.log10() - a.log10()) / a.log10()).toBeLessThan(1e-12);
      // JSON
      expect(Big.fromJSON(JSON.parse(JSON.stringify(a)))).toEqual(a);
      for (const v of [s, m, p]) {
        expect(Number.isFinite(v.m)).toBe(true);
        expect(Number.isFinite(v.e)).toBe(true);
      }
    });
  }

  it('adds across a large exponent gap without change, and cancels exactly', () => {
    const a = Big.fromLog10(100);
    expect(a.add(Big.fromLog10(50)).eq(a)).toBe(true);
    expect(a.sub(a).isZero()).toBe(true);
    expect(Big.from(5).sub(7).toNumber()).toBe(-2);
  });

  it('compares by sign, exponent and mantissa', () => {
    const xs = [big(-1e10), big(-3), big(0), big(2), big(2.5), big(1e5), Big.fromLog10(400), Big.fromLog10(5000)];
    for (let i = 0; i < xs.length; i++) for (let j = 0; j < xs.length; j++) expect(xs[i].cmp(xs[j])).toBe(Math.sign(i - j));
  });

  it('in-place operations match the immutable ones and allocate nothing new', () => {
    const a = Big.fromLog10(77.7);
    const b = Big.fromLog10(76.1);
    const c = a.clone();
    expect(c.addIn(b)).toBe(c);
    expect(c.eq(a.add(b))).toBe(true);
    expect(c.clone().mulIn(b).eq(c.mul(b))).toBe(true);
    expect(c.clone().mulLog10In(3).log10()).toBeCloseTo(c.log10() + 3, 10);
  });

  it('saturates instead of NaN or Infinity (division by zero, overflow)', () => {
    const z = Big.from(1).divIn(0);
    expect(z.e).toBe(BIG_MAX_EXP);
    expect(Big.fromLog10(Infinity).e).toBe(BIG_MAX_EXP);
    expect(Big.fromLog10(-Infinity).isZero()).toBe(true);
    expect(Big.fromLog10(1e15).mul(Big.fromLog10(1e15)).e).toBeLessThanOrEqual(BIG_MAX_EXP + 1);
  });

  it('parses and serialises', () => {
    expect(Big.parse('1.5e300').log10()).toBeCloseTo(300.176, 3);
    expect(Big.parse('nonsense').isZero()).toBe(true);
    expect(Big.fromJSON([2, 5]).toNumber()).toBe(2e5);
    expect(Big.fromJSON({ m: 3, e: 2 }).toNumber()).toBe(300);
    expect(Big.fromJSON('oops').isZero()).toBe(true);
    expect(Big.fromLog10(1e15).toJSON()).toEqual([1, 1e15]);
  });

  it('no NaN or Infinity over a long chain of mixed operations', () => {
    const x = Big.from(1);
    for (let i = 0; i < 20000; i++) {
      x.mulIn(1.044).addIn(i);
      if (i % 1000 === 0) x.subIn(x.div(3));
    }
    expect(Number.isFinite(x.m) && Number.isFinite(x.e) && x.m > 0).toBe(true);
  });
});
