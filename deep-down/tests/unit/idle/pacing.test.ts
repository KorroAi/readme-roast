import { describe, expect, it } from 'vitest';
import { FIRST_RUN_TARGETS, simFirstRun } from '../../../src/idle/sim/pacing';

describe('first-run pacing (SPEC §5.12, E1–E6, E20)', () => {
  it('E2–E6 and the §5.12 table at 5 taps/s; a 3 taps/s run stays within ×1.65 of it (≤ 20 s)', () => {
    const t0 = Date.now();
    const r = simFirstRun({ secs: 8000 });
    // E2, E3: first purchase ≤ 6 s, first crew ≤ 12 s.
    expect(r.firstBuy).toBeLessThanOrEqual(6);
    expect(r.firstCrew).toBeLessThanOrEqual(12);
    // E4: every row of §5.12 inside its band, and within ±10 % of the calibration (the open-ended wall: band only).
    for (const [m, sim, lo, hi] of FIRST_RUN_TARGETS) {
      const got = r.reach[m];
      expect(got).toBeGreaterThanOrEqual(lo);
      expect(got).toBeLessThanOrEqual(hi);
      // The 20 m row trades against G4 (W2 MUST 0: a 3 taps/s tapper who never buys reaches 20 m in a minute, so the
      // soil is softer and the buyer arrives early): ±15 % there, ±10 % everywhere else.
      if (Number.isFinite(hi)) expect(Math.abs(got - sim) / sim).toBeLessThanOrEqual(m === 20 ? 0.15 : 0.1);
    }
    // E5: the longest gap between rewards in the first 30 minutes.
    expect(r.maxGap).toBeLessThanOrEqual(30);
    // E6: taps per cell over the first 45 minutes.
    expect(r.tpc[1]).toBeLessThanOrEqual(4);
    expect(r.tpc[2]).toBeLessThanOrEqual(7.5);
    // E20: active ÷ idle between 2 and 4 at 5, 30 and 120 minutes.
    for (const v of Object.values(r.e20)) {
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
    }
    const slow = simFirstRun({ secs: 4000, taps: 3 });
    for (const [m] of FIRST_RUN_TARGETS.slice(0, 9)) expect(slow.reach[m] / r.reach[m]).toBeLessThanOrEqual(1.65);
    expect(Date.now() - t0).toBeLessThan(20000);
  }, 30000);

  it('CRITIQUE MUST 1 (E20 variant): a hold-only bot does not reach a greater depth at 30 min than the 5 taps/s tapper', () => {
    const tap = simFirstRun({ secs: 1800 });
    const hold = simFirstRun({ secs: 1800, profile: 'hold', bot: { taps: 5, crewBias: 1.3, saveSec: 60, ups: ['steady'], cap: false } });
    expect(hold.state.run.dmax).toBeLessThanOrEqual(tap.state.run.dmax);
  }, 30000);
});
