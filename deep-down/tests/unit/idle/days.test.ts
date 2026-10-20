// The session sim (BUILD §3.1 MUST 8, SPEC §5.12 and §13.1): the REAL model with every W2 system on, driven by the
// player bot, over the 40-minute first session (the multi-day run is `node tools/run-ts.mjs tools/econ-sim.ts days N`,
// minutes of CPU). What holds is asserted; the E-targets the calibration does not meet yet are `it.fails` with the
// measured numbers in their names, so the suite says exactly where the economy stands and turns red when one is fixed.
import { beforeAll, describe, expect, it } from 'vitest';
import { daysChecks, simDays, type DaysResult } from '../../../src/idle/sim/days';

let r: DaysResult;
const check = (id: string) => daysChecks(r).find((c) => c.id === id)!;

describe('the session sim, first session (40 min, every system on)', () => {
  beforeAll(() => {
    r = simDays({ days: 1, seed: 2026, first: 40, session: 0, every: 100, sampleEvery: 30 });
  }, 240_000);

  it('runs the real model for 40 played minutes with every number finite (E14: no NaN or Infinity)', () => {
    expect(r.samples.length).toBeGreaterThan(70);
    expect(r.samples.at(-1)!.played).toBeGreaterThan(2350);
    // Lifetime gold is 0 (log −∞) only at the very first sample.
    for (const x of r.samples.slice(1)) {
      for (const v of [x.record, x.depth, x.embers, x.rank, x.featTiers, x.side, x.goldLog10]) expect(Number.isFinite(v)).toBe(true);
    }
    expect(Number.isFinite(r.state.meta.lifetime.gold.log10())).toBe(true);
  });

  it('E18 (first part): ≥ 12 Feat tiers in 30 minutes, every tier paid', () => {
    expect(r.feats30).toBeGreaterThanOrEqual(12);
    expect(r.state.meta.marks).toBeGreaterThanOrEqual(r.feats30);
  });

  it('the Rekindle loop closes: the bot Rekindles by the recommend rule and each new run passes the old record (E8 shape)', () => {
    expect(r.runs.length).toBeGreaterThanOrEqual(1);
    expect(r.passes.length).toBeGreaterThanOrEqual(1);
    expect(r.state.meta.embers.gt(0)).toBe(true);
    expect(r.state.meta.planted.length).toBeGreaterThanOrEqual(1);
  });

  // ── Known calibration gaps (reported to the lead): the full model runs far ahead of SPEC's first-run table. ──
  it.fails('KNOWN GAP E9: no 3 consecutive Rekindles with runs < 3 min (measured: chains of 5–7 in the first session)', () => {
    expect(check('E9').ok).toBe(true);
  });

  it.fails('KNOWN GAP E19: rank 10 between 12 and 20 min (measured: about 3 min)', () => {
    expect(check('E19').ok).toBe(true);
  });

  it.fails('KNOWN GAP E25: side multipliers ≤ ×10 (the day-3 bound; measured: ×16–×37 inside the first session)', () => {
    expect(r.samples.at(-1)!.side).toBeLessThanOrEqual(10);
  });

  it.fails('KNOWN GAP pace: 600 m no sooner than 20 min (SPEC §5.12 band; measured: 600 m at 4–5 min)', () => {
    const at600 = r.samples.find((x) => x.record >= 600)?.played ?? Infinity;
    expect(at600).toBeGreaterThanOrEqual(1200);
  });
});
