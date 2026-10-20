import { describe, expect, it } from 'vitest';
import { BIOME_LOOKS } from '../../../src/idle/config/biomeLooks';
import { IDENTITY_LOOK, LUT_SIZE, baseGrade, buildLut, deltaE2000, gradeSrgb, linearToSrgb, neutralRampLab, sampleLut, srgbToLab, srgbToLinear } from '../../../src/render/post/lut';

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

/** A seeded stream of colours. */
function* colours(n: number, seed = 7): Generator<[number, number, number]> {
  let s = seed >>> 0;
  const next = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < n; i++) yield [next(), next(), next()];
}

describe('the LUT (post/lut.ts: 32^3, sRGB-encoded domain; CRITIQUE B12)', () => {
  it('the builder is pure: the same look gives the same bytes; size and layout', () => {
    const a = buildLut(BIOME_LOOKS[2]);
    const b = buildLut(BIOME_LOOKS[2]);
    expect(a.length).toBe(LUT_SIZE ** 3 * 4);
    expect(sameBytes(a, b)).toBe(true);
    expect(sameBytes(a, buildLut(BIOME_LOOKS[3]))).toBe(false);
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255);
  });

  it('the identity look is the W1 grade: identity round trip through the LUT within ΔE 1 (p99) and 2.5 (max)', () => {
    const lut = buildLut(IDENTITY_LOOK);
    const errs: number[] = [];
    for (const [r, g, b] of colours(4000)) {
      const want = baseGrade(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)).map((v) => linearToSrgb(Math.min(1, v)));
      const got = sampleLut(lut, r, g, b);
      errs.push(deltaE2000(srgbToLab(want[0], want[1], want[2]), srgbToLab(got[0], got[1], got[2])));
    }
    errs.sort((x, y) => x - y);
    const mean = errs.reduce((x, y) => x + y, 0) / errs.length;
    expect(mean).toBeLessThan(0.35);
    expect(errs[Math.floor(errs.length * 0.99)]).toBeLessThan(1);
    expect(errs[errs.length - 1]).toBeLessThan(2.5);
  });

  it('black stays black and white stays near white through every look; greys keep their luminance', () => {
    for (const look of BIOME_LOOKS) {
      const k = gradeSrgb(look, 0, 0, 0);
      expect(Math.max(...k)).toBeLessThan(0.01);
      const w = gradeSrgb(look, 1, 1, 1);
      expect(Math.min(...w)).toBeGreaterThan(0.75);
      expect(srgbToLab(w[0], w[1], w[2])[0]).toBeGreaterThan(90);
      const g = gradeSrgb(look, 0.5, 0.5, 0.5);
      const gi = gradeSrgb(IDENTITY_LOOK, 0.5, 0.5, 0.5);
      expect(Math.abs(srgbToLab(g[0], g[1], g[2])[0] - srgbToLab(gi[0], gi[1], gi[2])[0])).toBeLessThan(2.5);
    }
  });

  it('V5: consecutive biome LUTs differ by ΔE2000 ≥ 8 on a neutral ramp', () => {
    const labs = BIOME_LOOKS.map((l) => neutralRampLab(l));
    for (let i = 1; i < labs.length; i++) expect(deltaE2000(labs[i - 1], labs[i]), `biome ${i - 1} -> ${i}`).toBeGreaterThanOrEqual(8);
  });
});
