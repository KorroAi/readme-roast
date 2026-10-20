import { describe, expect, it } from 'vitest';
import { BEZIER, EASE, cubicBezier, type EaseName } from '../../../src/core/ease';
import { SPRINGS, Spring, springResponse, springSamples, springStats, springStep, type SpringName } from '../../../src/core/spring';

/** A reference cubic-bezier: 80-step bisection on x(u), then y(u) (what a browser computes). */
function reference(x1: number, y1: number, x2: number, y2: number, t: number): number {
  const bez = (a: number, b: number, u: number) => 3 * a * u * (1 - u) ** 2 + 3 * b * u * u * (1 - u) + u ** 3;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (bez(x1, x2, mid) < t) lo = mid;
    else hi = mid;
  }
  return bez(y1, y2, (lo + hi) / 2);
}

describe('cubic-bezier eases', () => {
  it('match the reference within 1e-3 for every named ease', () => {
    for (const name of Object.keys(BEZIER) as EaseName[]) {
      const [x1, y1, x2, y2] = BEZIER[name];
      for (let i = 0; i <= 200; i++) {
        const t = i / 200;
        expect(Math.abs(EASE[name](t) - reference(x1, y1, x2, y2, t)), `${name} at ${t}`).toBeLessThan(1e-3);
      }
    }
  });

  it('matches the CSS keyword ease at known points', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
  });

  it('overshoots for outBack and stays monotone for outCubic', () => {
    let max = 0;
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      max = Math.max(max, EASE.outBack(i / 100));
      const v = EASE.outCubic(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(max).toBeGreaterThan(1.05);
  });
});

describe('springs', () => {
  // SPEC §10.4: overshoot %, peak ms, 2 % settle ms.
  const table: Record<SpringName, [number, number, number]> = {
    snap: [12.3, 124, 192],
    bounce: [30.8, 151, 496],
    jelly: [39.8, 95, 403],
    soft: [0.6, 377, 263],
    kick: [20.2, 87, 205],
    follow: [4.5, 488, 661],
    heavy: [16.2, 301, 669],
  };

  it('reproduce the overshoot and peak of the spring table', () => {
    for (const name of Object.keys(table) as SpringName[]) {
      const [over, peak] = table[name];
      const s = springStats(SPRINGS[name]);
      expect(Math.abs(s.overshoot * 100 - over), `${name} overshoot`).toBeLessThan(0.6);
      expect(Math.abs(s.peak * 1000 - peak), `${name} peak`).toBeLessThan(6);
    }
  });

  it('settle near the table (2 % band; the table is rounded)', () => {
    for (const name of Object.keys(table) as SpringName[]) {
      const s = springStats(SPRINGS[name]);
      expect(Math.abs(s.settle * 1000 - table[name][2]) / table[name][2], name).toBeLessThan(0.12);
    }
  });

  it('steps exactly: two half steps equal one full step', () => {
    for (const name of Object.keys(SPRINGS) as SpringName[]) {
      const a = [0, 0];
      const b = [0, 0];
      springStep(SPRINGS[name], -1, 3, 0.05, a);
      springStep(SPRINGS[name], -1, 3, 0.025, b);
      springStep(SPRINGS[name], b[0], b[1], 0.025, b);
      expect(a[0]).toBeCloseTo(b[0], 10);
      expect(a[1]).toBeCloseTo(b[1], 8);
    }
  });

  it('handles critical and over-damping', () => {
    for (const zeta of [1, 1.6]) {
      const y = springResponse({ omega: 20, zeta }, 1);
      expect(y).toBeGreaterThan(0.99);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('keeps value and velocity when retargeted, and rests at the target', () => {
    const s = new Spring(SPRINGS.snap, 0);
    s.target = 1;
    s.step(0.05);
    const v = s.value;
    const vel = s.velocity;
    s.target = 2;
    expect(s.value).toBe(v);
    expect(s.velocity).toBe(vel);
    for (let i = 0; i < 120; i++) s.step(1 / 60);
    expect(s.value).toBe(2);
    expect(s.atRest).toBe(true);
  });

  it('samples keyframes that start, peak and end where the spring does', () => {
    const k = springSamples('jelly', 0.6, 1);
    expect(k.values[0]).toBeCloseTo(0.6, 6);
    expect(k.values[k.values.length - 1]).toBe(1);
    expect(Math.max(...k.values)).toBeGreaterThan(1.12);
    expect(k.duration).toBeGreaterThan(300);
  });
});
