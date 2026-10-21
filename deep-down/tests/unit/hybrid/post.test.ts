// The filmic pipeline (W1-LEAD §4.8; owner 1E): AgX, the grade limits, and the banned effects.
import { describe, expect, it } from 'vitest';
import POST from '../../../src/render/PostFX.ts?raw';
import { PASS_COST } from '../../../src/render/PostFX';
import { agx, TONE_LOOK } from '../../../src/render/light/tonemap';


describe('AgX', () => {
  it('is monotonic in value and keeps black black', () => {
    let prev = -1;
    for (let e = -10; e <= 6; e += 0.25) {
      const v = agx([2 ** e, 2 ** e, 2 ** e])[1];
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
    expect(agx([0, 0, 0])[0]).toBeLessThan(0.002);
  });

  it('maps mid grey near mid grey and never clips below 16× mid grey', () => {
    const g = agx([0.18, 0.18, 0.18])[1];
    expect(g).toBeGreaterThan(0.12);
    expect(g).toBeLessThan(0.3);
    const hot = agx([0.18 * 16, 0.18 * 16, 0.18 * 16]);
    expect(Math.max(...hot)).toBeLessThan(0.999);
  });

  it('keeps the lantern amber amber, and rolls a very hot flame toward warm white (no hue flip)', () => {
    const amber = agx([1.0, 0.45, 0.12]);
    expect(amber[0]).toBeGreaterThan(amber[1]);
    expect(amber[1]).toBeGreaterThan(amber[2]);
    const flame = agx([40, 18, 5]);
    expect(flame[0]).toBeGreaterThan(flame[2]);
    expect(flame[2] / flame[0]).toBeGreaterThan(amber[2] / amber[0]);
  });

  it('the look stays between AgX base and its punchy look (power ≤ 1.35, saturation ≤ 1.25)', () => {
    expect(TONE_LOOK[0]).toBeGreaterThanOrEqual(1);
    expect(TONE_LOOK[0]).toBeLessThanOrEqual(1.35);
    expect(TONE_LOOK[1]).toBeLessThanOrEqual(1.25);
  });
});

describe('the post chain lint (W1-LEAD §4.8, U-LOOK)', () => {
  it('has no chromatic aberration, lens flare, grain, motion blur, iris, shock ring, god rays or bloom pulse', () => {
    const code = POST.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const banned of [/chroma/i, /flare/i, /\bgrain\b/i, /motionBlur/i, /\buIris/, /\buShock/, /godRay/i, /bloomPulse/, /\biris\b/, /\bshock\b/]) expect(code).not.toMatch(banned);
  });

  it('clamps the bloom strength to ≤ 0.25, the threshold to ≥ 1.0, the vignette to ≤ 0.15 and the flash lift to 0.12', () => {
    expect(POST).toContain('Math.min(0.25, Math.max(0, p.bloomStrength))');
    expect(POST).toContain('Math.max(1, p.threshold)');
    expect(POST).toContain('Math.min(0.15, Math.max(0, p.vignette))');
    expect(POST).toContain('Math.min(0.12, p.flash)');
  });

  it('runs AgX, the per-biome 32³ LUT pair, FXAA and dither', () => {
    expect(POST).toContain('agxDisplay(hdr, uTone.yz)');
    expect(POST).toContain('tLutA');
    expect(POST).toContain('fxaaFrag');
    expect(POST).toMatch(/dither/i);
  });

  it('models every pass for tools/perf.mjs, the lighting passes included', () => {
    for (const k of ['bright', 'down', 'up', 'resolve', 'fxaa', 'final', 'gtao', 'aoBlur', 'composite', 'volStep']) expect(PASS_COST).toHaveProperty(k);
  });
});
