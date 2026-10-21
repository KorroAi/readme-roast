import { describe, expect, it } from 'vitest';
import { GOVERNOR, QualityGovernor, initialQuality, type GovernorAction } from '../../src/render/QualityGovernor';
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
