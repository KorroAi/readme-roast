import { describe, expect, it } from 'vitest';
import { FINE, FineScaleController, GOVERNOR, QualityGovernor, initialQuality, type GovernorAction } from '../../src/render/QualityGovernor';
import type { QualityLevel } from '../../src/render/Renderer';

/** Feed a constant frame interval for `seconds` of frame time; apply each step like main.ts does. */
function run(g: QualityGovernor, s: { quality: QualityLevel; renderScale: number | null }, ms: number, seconds: number): GovernorAction[] {
  const actions: GovernorAction[] = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const a = g.sample(ms, s.quality, s.renderScale);
    if (a === 'battery') s.quality = 'battery';
    if (a === 'scale') s.renderScale = GOVERNOR.lowScale;
    if (a !== 'none') actions.push(a);
  }
  return actions;
}

describe('QualityGovernor', () => {
  it('first launch: Battery on ≤ 3 GB or ≤ 4 cores, Balanced otherwise', () => {
    expect(initialQuality(2, 8)).toBe('battery');
    expect(initialQuality(3, 8)).toBe('battery');
    expect(initialQuality(4, 4)).toBe('battery');
    expect(initialQuality(8, 8)).toBe('balanced');
    expect(initialQuality(undefined, 8)).toBe('balanced');
    expect(initialQuality(undefined, undefined)).toBe('balanced');
  });

  it('16 ms frames stay Balanced', () => {
    const s = { quality: 'balanced' as QualityLevel, renderScale: null };
    expect(run(new QualityGovernor(), s, 16, 60)).toEqual([]);
    expect(s.quality).toBe('balanced');
  });

  it('30 ms frames switch Balanced to Battery after the warm-up and one window, not before', () => {
    const g = new QualityGovernor();
    const s = { quality: 'balanced' as QualityLevel, renderScale: null };
    const window = (GOVERNOR.warmupMs + GOVERNOR.windowMs) / 1000;
    expect(run(g, s, 30, window - 0.1)).toEqual([]);
    expect(s.quality).toBe('balanced');
    expect(run(g, s, 30, 0.2)).toEqual(['battery']);
    expect(s.quality).toBe('battery');
    expect(g.lastMedianMs).toBeCloseTo(30, 3);
    // 30 ms is fine on Battery (its cap is 30 fps): nothing more happens.
    expect(run(g, s, 30, 60)).toEqual([]);
    expect(s.renderScale).toBeNull();
  });

  it('50 ms frames on Battery lower the render scale to 0.65, then stop', () => {
    const s = { quality: 'battery' as QualityLevel, renderScale: null as number | null };
    expect(run(new QualityGovernor(), s, 50, 14)).toEqual(['scale']);
    expect(s.renderScale).toBe(0.65);
    expect(run(new QualityGovernor(), s, 50, 60)).toEqual([]);
  });

  it('a 2 s burst of 30 ms frames, then 16 ms, changes nothing', () => {
    const g = new QualityGovernor();
    const s = { quality: 'balanced' as QualityLevel, renderScale: null };
    // Burst right after the warm-up, i.e. inside the measured window.
    expect(run(g, s, 16, GOVERNOR.warmupMs / 1000)).toEqual([]);
    expect(run(g, s, 30, 2)).toEqual([]);
    expect(run(g, s, 16, 60)).toEqual([]);
    expect(s.quality).toBe('balanced');
  });

  it('downshifts in two steps on a very slow device, never back up', () => {
    const s = { quality: 'balanced' as QualityLevel, renderScale: null as number | null };
    const g = new QualityGovernor();
    expect(run(g, s, 60, 40)).toEqual(['battery', 'scale']);
    expect(run(g, s, 10, 60)).toEqual([]);
    expect(s).toEqual({ quality: 'battery', renderScale: 0.65 });
  });

  it('counts very slow frames (2 fps is a frame rate, not a gap)', () => {
    const s = { quality: 'balanced' as QualityLevel, renderScale: null as number | null };
    expect(run(new QualityGovernor(), s, 600, 40)).toEqual(['battery', 'scale']);
  });

  it('ignores gaps (hidden tab, load hitches) and does nothing once disabled or reset', () => {
    const g = new QualityGovernor();
    const s = { quality: 'balanced' as QualityLevel, renderScale: null };
    expect(run(g, s, 2500, 120)).toEqual([]);
    g.reset();
    expect(run(g, s, 30, 12)).toEqual([]); // a reset restarts the warm-up: 12 s < 5 + 8 s
    g.reset();
    g.disable();
    expect(run(g, s, 30, 60)).toEqual([]);
    expect(s.quality).toBe('balanced');
  });

  it('uses the median, not the mean: rare long frames do not count', () => {
    const g = new QualityGovernor();
    let action: GovernorAction = 'none';
    for (let t = 0; t < 20000 && action === 'none'; t += 16) {
      const ms = Math.floor(t / 16) % 5 === 0 ? 120 : 16; // one frame in five is very long
      action = g.sample(ms, 'balanced', null);
    }
    expect(action).toBe('none');
    expect(g.lastMedianMs).toBe(16);
  });
});

describe('FineScaleController (SPEC §11.3: the fine resolution controller)', () => {
  /** Feed `ms` frames for `seconds`, starting at t0; returns the steps with their times. */
  const feed = (c: FineScaleController, ms: number, seconds: number, t0 = 0): Array<{ t: number; step: number }> => {
    const out: Array<{ t: number; step: number }> = [];
    for (let t = t0 + ms; t <= t0 + seconds * 1000; t += ms) {
      const s = c.sample(ms, t);
      if (s !== 0) out.push({ t, step: s });
    }
    return out;
  };

  it('steps down 0.05 when the median frame is above 17.5 ms, at most once per 2 s', () => {
    const c = new FineScaleController();
    const steps = feed(c, 25, 10);
    expect(steps.length).toBeGreaterThanOrEqual(4);
    expect(steps.every((s) => s.step === -FINE.step)).toBe(true);
    for (let i = 1; i < steps.length; i++) expect(steps[i].t - steps[i - 1].t).toBeGreaterThanOrEqual(FINE.minGapMs);
    expect(c.lastMedianMs).toBeCloseTo(25, 5);
  });

  it('steps up only after 4 s below 14.5 ms, and holds between the thresholds', () => {
    const c = new FineScaleController();
    expect(feed(c, 12, 3.5)).toEqual([]);
    const up = feed(c, 12, 2, 3500);
    expect(up.length).toBe(1);
    expect(up[0].step).toBe(FINE.step);
    expect(up[0].t).toBeGreaterThanOrEqual(4000);
    const c2 = new FineScaleController();
    expect(feed(c2, 16, 20)).toEqual([]);
  });

  it('uses the median (one long hitch does not step) and ignores gaps', () => {
    const c = new FineScaleController();
    let steps = 0;
    for (let t = 0; t < 10000; t += 16) {
      const ms = t % 1000 < 16 ? 120 : 16;
      if (c.sample(ms, t) !== 0) steps++;
    }
    expect(steps).toBe(0);
    expect(c.sample(5000, 20000)).toBe(0);
    expect(c.sample(Number.NaN, 20016)).toBe(0);
  });

  it('a fresh window after reset()', () => {
    const c = new FineScaleController();
    feed(c, 25, 0.9);
    c.reset();
    expect(feed(c, 25, 0.9, 900)).toEqual([]);
  });
});
