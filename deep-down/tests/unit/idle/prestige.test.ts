import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { embersTotal, canRekindle, computePar, projection, recommend, rekindle, rekindleGain } from '../../../src/idle/model/prestige';
import { ghostDepth, parTime, tapLantern } from '../../../src/idle/model/records';
import { tapEntityResult } from '../../../src/idle/model/entities';
import { refreshRates } from '../../../src/idle/model/run';
import { simFirstRun } from '../../../src/idle/sim/pacing';
import { stateAt } from './w2fixture';

describe('Rekindle (SPEC §5.9)', () => {
  it('EmbersTotal(R) = floor(25 × 2^((R − 600)/200)): "every new 200 m of record doubles your Embers"', () => {
    expect(Math.round(embersTotal(599).toNumber())).toBe(0);
    expect(Math.round(embersTotal(600).toNumber())).toBe(25);
    expect(Math.round(embersTotal(800).toNumber())).toBe(50);
    expect(Math.round(embersTotal(1000).toNumber())).toBe(100);
    expect(Math.round(embersTotal(1300).toNumber())).toBe(282); // SPEC's table rounds 25·2^3.5 = 282.8 up to 283
    expect(Math.round(embersTotal(1800).toNumber())).toBe(1600);
    expect(Math.round(embersTotal(2400).toNumber())).toBe(12800);
    expect(embersTotal(6000).log10()).toBeCloseTo(Math.log10(25) + 27 * Math.log10(2), 6);
  });

  it('resets the run, keeps the meta, plants the lantern, sets the par; the recommend rule and the projection', () => {
    const r = simFirstRun({ secs: 1600 });
    const s = r.state;
    s.meta.cycleRecord = s.run.dmax;
    s.meta.record = s.run.dmax;
    refreshRates(s, 5);
    expect(s.run.dmax).toBeGreaterThanOrEqual(600);
    expect(canRekindle(s)).toBe(true);
    expect(recommend(s).ok).toBe(true); // no Embers yet: any gain is ≥ 10× owned
    // The Rekindle screen's promise is a pure sim run (SPEC: about 30 ms; the best of three, the machine is shared).
    let best = Infinity;
    let pj = projection(s);
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      pj = projection(s);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(40);
    expect(pj.passAt).toBeLessThan(1800);
    expect(pj.after).toBeGreaterThan(pj.before);
    const gain = rekindleGain(s);
    const gems = s.meta.gems;
    const record = s.meta.record;
    s.meta.finds['find:0:0'] = 2;
    const bus = createIdleBus();
    let done = false;
    bus.on('prestige:done', () => (done = true));
    const got = rekindle(s, bus);
    expect(done).toBe(true);
    expect(got.toNumber()).toBe(gain.toNumber());
    expect(s.meta.embers.toNumber()).toBe(gain.toNumber());
    // The run is new (the 10-Ember perk starts Pick and Shovel Hand at 10); the meta is kept.
    expect(s.run.depth).toBeLessThan(record);
    expect(s.run.gear).toEqual([]);
    expect(s.meta.gems).toBe(gems);
    expect(s.meta.record).toBe(record);
    expect(s.meta.finds['find:0:0']).toBe(2);
    expect(s.meta.planted.length).toBe(1);
    expect(s.meta.planted[0].depth).toBe(r.state.meta.record);
    expect(s.run.par.length).toBeGreaterThan(3);
    expect(s.run.pick).toBeGreaterThanOrEqual(10);
    // Nothing more to gain right after: not recommended.
    expect(recommend(s).ok).toBe(false);
  }, 30000);

  it('the ghost races a par (CRITIQUE MUST 6): the par passes the record within the projection; a planted lantern pays +2 % once', () => {
    const r = simFirstRun({ secs: 1600 });
    const s = r.state;
    s.meta.cycleRecord = s.run.dmax;
    s.meta.record = s.run.dmax;
    s.meta.embers = Big.from(25);
    s.meta.embersMax = Big.from(25);
    const par = computePar(s);
    s.run.par = par;
    expect(par[0]).toBe(0);
    for (let i = 1; i < par.length; i++) expect(par[i]).toBeGreaterThanOrEqual(par[i - 1]);
    expect(Number.isFinite(parTime(s, 300))).toBe(true);
    s.run.runTime = 90;
    expect(ghostDepth(s)).toBeGreaterThan(0);
    // Planted lantern n: +2 % once a run.
    const t = stateAt(100, 3);
    t.meta.planted.push({ depth: 104, n: 1 });
    expect(tapEntityResult(t, 'lantern:1').ok).toBe(true);
    expect(t.run.plantedBonus).toBeCloseTo(0.02, 9);
    expect(tapLantern(t, 1)).toBe(false);
    expect(t.run.plantedBonus).toBeCloseTo(0.02, 9);
  }, 30000);
});
