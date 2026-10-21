// The governor's feature ladder and the lighting presets (W1-LEAD §4.10; owner 1E).
import { describe, expect, it } from 'vitest';
import { FeatureLadder, LADDER_GOV } from '../../../src/render/QualityGovernor';
import { LADDER, LIGHT_PRESETS, featuresAt } from '../../../src/render/light/presets';

/** Feed a constant interval for `seconds`; returns the step changes. */
function feed(l: FeatureLadder, ms: number, seconds: number, atFloor = true, t0 = { now: 0 }): number[] {
  const out: number[] = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    t0.now += ms;
    const c = l.sample(ms, t0.now, atFloor);
    if (c) out.push(c);
  }
  return out;
}

describe('presets', () => {
  it('Battery: no shadows, AO, volumetrics or probes; Balanced: everything at 256² and half res; High: 512² and more', () => {
    const b = LIGHT_PRESETS.battery;
    expect([b.shadows, b.ao, b.volumetric, b.probes]).toEqual([false, false, false, false]);
    const m = LIGHT_PRESETS.balanced;
    expect([m.shadows, m.ao, m.volumetric, m.probes]).toEqual([true, true, true, true]);
    expect([m.shadowRes, m.aoScale, m.volScale]).toEqual([256, 0.5, 0.5]);
    const h = LIGHT_PRESETS.high;
    expect([h.shadowRes, h.secondShadow, h.volShadow]).toEqual([512, true, true]);
  });

  it('the ladder sheds the cheapest losses first and ends with no shadows; Battery has nothing to shed', () => {
    expect(LADDER.map((s) => s.id)).toEqual(['volSteps', 'shadowTaps', 'shadowCadence', 'ao', 'volumetric', 'shadows']);
    const last = featuresAt('balanced', LADDER.length);
    expect([last.ao, last.volumetric, last.shadows]).toEqual([false, false, false]);
    expect(featuresAt('battery', 3)).toEqual(LIGHT_PRESETS.battery);
    // A step never mutates the preset table.
    expect(LIGHT_PRESETS.balanced.ao).toBe(true);
  });
});

describe('FeatureLadder', () => {
  it('stays put at 60 fps', () => {
    const l = new FeatureLadder();
    expect(feed(l, 16.6, 30)).toEqual([]);
    expect(l.step).toBe(0);
  });

  it('steps down before frames drop: two slow windows (mean > 17.8 ms) at the scale floor', () => {
    const l = new FeatureLadder();
    const t = { now: 0 };
    expect(feed(l, 19, 1.9, true, t)).toEqual([]);
    expect(feed(l, 19, 0.2, true, t)).toEqual([1]);
    expect(l.step).toBe(1);
  });

  it('never sheds features while the resolution can still drop (not at the floor)', () => {
    const l = new FeatureLadder();
    expect(feed(l, 25, 20, false)).toEqual([]);
  });

  it('one change per 3 s at most; then gives features back after 8 s fast', () => {
    const l = new FeatureLadder();
    const t = { now: 0 };
    feed(l, 25, 10, true, t);
    expect(l.step).toBeLessThanOrEqual(Math.ceil(10 / (LADDER_GOV.minGapMs / 1000)));
    const s = l.step;
    expect(s).toBeGreaterThan(1);
    feed(l, 12, 9, true, t);
    expect(l.step).toBe(s - 1);
  });

  it('a pinned step (captures) never moves', () => {
    const l = new FeatureLadder();
    l.pin(2);
    expect(feed(l, 40, 20)).toEqual([]);
    expect(l.step).toBe(2);
  });
});
