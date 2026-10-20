import { describe, expect, it } from 'vitest';
import { casApply, casWeight, catmullRom5, catmullRomWeights, irisMask, octagon, vignette } from '../../../src/render/post/composite';

describe('composite kernels (PostFX final pass, mirrored in post/composite.ts)', () => {
  it('Catmull-Rom weights sum to 1 at every fractional position, and interpolate at f = 0', () => {
    for (let i = 0; i <= 100; i++) {
      const f = i / 100;
      const w = catmullRomWeights(f);
      expect(w[0] + w[1] + w[2] + w[3]).toBeCloseTo(1, 12);
    }
    catmullRomWeights(0).forEach((w, i) => expect(w).toBeCloseTo(i === 1 ? 1 : 0, 12));
    // Reproduces a linear ramp exactly (a cubic interpolant): 4 samples 0,1,2,3 at f -> 1 + f.
    for (const f of [0.1, 0.37, 0.5, 0.9]) {
      const w = catmullRomWeights(f);
      expect(w[0] * 0 + w[1] * 1 + w[2] * 2 + w[3] * 3).toBeCloseTo(1 + f, 12);
    }
  });

  it('the 5-tap form is normalised and keeps the centre dominant', () => {
    for (const [fx, fy] of [[0, 0], [0.5, 0.5], [0.25, 0.8], [0.99, 0.01]]) {
      const w = catmullRom5(fx, fy);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
      expect(w[2]).toBeGreaterThan(0.5);
    }
    catmullRom5(0, 0).forEach((w, i) => expect(w).toBeCloseTo(i === 2 ? 1 : 0, 12));
  });

  it('CAS: a negative neighbour weight, larger on soft detail than on flat or saturated regions; flat stays flat', () => {
    const soft = casWeight(0.4, 0.5, 0.2);
    const flat = casWeight(0.5, 0.5, 0.2);
    const hard = casWeight(0.02, 0.98, 0.2);
    expect(soft).toBeLessThan(0);
    expect(Math.abs(hard)).toBeLessThan(Math.abs(soft));
    expect(Math.abs(flat)).toBeGreaterThan(0);
    expect(casApply(0.5, [0.5, 0.5, 0.5, 0.5], 0.2)).toBeCloseTo(0.5, 12);
    // A soft bump gets sharper (further from its neighbours), never overshooting outside [0, 1].
    const c = casApply(0.6, [0.5, 0.5, 0.5, 0.5], 0.2);
    expect(c).toBeGreaterThan(0.6);
    expect(c).toBeLessThan(1);
    // More sharpness, more boost.
    expect(Math.abs(casWeight(0.4, 0.5, 1))).toBeGreaterThan(Math.abs(casWeight(0.4, 0.5, 0)));
  });

  it('the iris: open at 1.5, an octagon of the radius around the centre, black outside', () => {
    expect(irisMask(0, 0, 0.5, 0.5, 1.5, 0.46)).toBe(1);
    expect(irisMask(0.5, 0.5, 0.5, 0.5, 0.2, 0.46)).toBe(1);
    expect(irisMask(0.5, 0.95, 0.5, 0.5, 0.2, 0.46)).toBe(0);
    expect(irisMask(0.5, 0.5, 0.5, 0.5, 0, 0.46)).toBe(0);
    // Octagon: the diagonal reaches 1/√2 x (|x| + |y|).
    expect(octagon(0.1, 0.1)).toBeCloseTo(0.2 * Math.SQRT1_2, 12);
    expect(octagon(0.3, 0)).toBeCloseTo(0.3, 12);
    // In UV the horizontal reach is radius / aspect: at aspect 0.5, radius 0.1 reaches 0.2 in u.
    expect(irisMask(0.5 + 0.19, 0.5, 0.5, 0.5, 0.1, 0.5)).toBe(1);
    expect(irisMask(0.5 + 0.21, 0.5, 0.5, 0.5, 0.1, 0.5)).toBe(0);
  });

  it('the portrait vignette: clean centre, heavier top than bottom, light sides', () => {
    expect(vignette(0.5, 0.5, 0.25)).toBe(0);
    expect(vignette(0.5, 1, 0.25)).toBeCloseTo(0.3, 6);
    expect(vignette(0.5, 0, 0.25)).toBeCloseTo(0.25, 6);
    expect(vignette(0, 0.5, 0.25)).toBeCloseTo(0.1, 6);
    expect(vignette(0.5, 1, 0)).toBe(0);
  });
});
