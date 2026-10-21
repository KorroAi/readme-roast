// GTAO and the volumetric march (W1-LEAD §4.4–§4.5; owner 1E): the step integration, the temporal weights, the
// presets and the composite's rules.
import { describe, expect, it } from 'vitest';
import { COMPOSITE_FRAG, LIGHT_PASS_COST, historyWeight, jitterAt, marchHomogeneous } from '../../../src/render/light/passes';
import PASSES from '../../../src/render/light/passes.ts?raw';
import { LIGHT_PRESETS, featuresAt } from '../../../src/render/light/presets';

describe('the volumetric march', () => {
  it('integrates a homogeneous medium exactly at any step count (energy-conserving steps)', () => {
    for (const steps of [4, 8, 12, 20]) {
      const [ins, T] = marchHomogeneous(0.05, 0.8, 20, steps);
      expect(T).toBeCloseTo(Math.exp(-1), 10);
      expect(ins).toBeCloseTo(0.8 * (1 - Math.exp(-1)), 10);
    }
  });

  it('converges at rest (still air) and stays ghost-free while the view moves', () => {
    expect(historyWeight(true, 0)).toBe(0.3);
    expect(historyWeight(false, 0)).toBe(0.5);
    expect(historyWeight(false, 10)).toBeCloseTo(1 / 12);
    expect(historyWeight(false, 1000)).toBeCloseTo(1 / 64);
    // A 64-frame jitter cycle of distinct offsets in [0, 1).
    const js = Array.from({ length: 64 }, (_, f) => jitterAt(f));
    expect(new Set(js.map((v) => v.toFixed(6))).size).toBe(64);
    for (const v of js) expect(v >= 0 && v < 1).toBe(true);
    expect(jitterAt(64)).toBeCloseTo(jitterAt(0), 12);
  });

  it('a still frame changes by less than the stillness bound once the history has converged', () => {
    // Worst case: the per-frame estimate swings by ±50 % around its mean (12 jittered steps); after 2 s at rest the
    // accumulated value moves by at most the weight times the swing.
    const w = historyWeight(false, 120);
    const swing = 0.5 * 0.1; // a fog in-scatter of 0.1 display-linear, ±50 %
    expect(w * swing).toBeLessThan(0.01);
  });

  it('marches real light sources, never a screen-space ray: the lantern, the practicals, the LightField and the shafts', () => {
    expect(PASSES).toContain('uniform vec4 uL_Shaft[2];');
    expect(PASSES).toMatch(/hg\(dot\(uL_ShaftDir\[k\]\.xyz, -rd\), 0\.55\)/);
    expect(PASSES).toContain('texture(uL_Irr, (x - uL_IrrOrigin) * uL_IrrInvSize)');
    expect(PASSES).toContain('uL_PracCol[k]');
    expect(PASSES).not.toMatch(/godRay|radialBlur|lightScatter2D/i);
  });

  it('runs half resolution on Balanced and High, with the lantern shadow in the march on High only; off on Battery', () => {
    expect(LIGHT_PRESETS.balanced.volumetric && LIGHT_PRESETS.high.volumetric).toBe(true);
    expect(LIGHT_PRESETS.battery.volumetric).toBe(false);
    expect(LIGHT_PRESETS.balanced.volScale).toBe(0.5);
    expect(LIGHT_PRESETS.balanced.volShadow).toBe(false);
    expect(LIGHT_PRESETS.high.volShadow).toBe(true);
    expect(LIGHT_PRESETS.high.volSteps).toBeGreaterThan(LIGHT_PRESETS.balanced.volSteps);
    expect(featuresAt('balanced', 1).volSteps).toBeLessThanOrEqual(8);
  });
});

describe('GTAO', () => {
  it('runs at half resolution on Balanced and High, never on Battery', () => {
    expect(LIGHT_PRESETS.balanced.ao && LIGHT_PRESETS.high.ao).toBe(true);
    expect(LIGHT_PRESETS.balanced.aoScale).toBe(0.5);
    expect(LIGHT_PRESETS.battery.ao).toBe(false);
  });

  it('the composite occludes the indirect share only (alpha) and upsamples depth-aware', () => {
    expect(COMPOSITE_FRAG).toContain('float ind = 1.0 - clamp(c.a, 0.0, 1.0);');
    expect(COMPOSITE_FRAG).toContain('vec4 bilateral(');
    // The fog: c · T + in-scatter.
    expect(COMPOSITE_FRAG).toContain('c.rgb * v.a + v.rgb');
  });

  it('every lighting pass has a cost entry for tools/perf.mjs', () => {
    for (const k of ['lightDepth', 'gtao', 'aoBlur', 'volStep', 'volBase', 'composite', 'shadowFace']) expect(LIGHT_PASS_COST).toHaveProperty(k);
  });
});
