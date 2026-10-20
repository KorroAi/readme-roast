import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { GOAL_HOLD, markGoal, selectGoal, tickGoals } from '../../../src/idle/model/goals';
import { refreshRates } from '../../../src/idle/model/run';
import { resetWindow } from '../../../src/idle/model/shaft';
import { createIdle } from '../../../src/idle/model/step';
import { simFirstRun } from '../../../src/idle/sim/pacing';

describe('the goal bar (SPEC §8.4, L5, E12)', () => {
  it('E12 over a 2 h sim: a goal ≥ 15 % done and ≤ 90 s away (or the fallback) in 100 % of 0.5 s samples; median fill ≥ 0.55; fill ≥ 0.5 for ≥ 65 % of the first hour', () => {
    const r = simFirstRun({ secs: 7200, sampleGoals: true });
    const g = r.goals;
    expect(g.length).toBeGreaterThan(14000);
    const ok = g.filter((x) => x.id === 'fallback' || (x.fill >= 0.15 && x.eta <= 90));
    expect(ok.length / g.length).toBe(1);
    const fills = g.map((x) => x.fill).sort((a, b) => a - b);
    expect(fills[Math.floor(fills.length / 2)]).toBeGreaterThanOrEqual(0.55);
    const hour = g.filter((x) => x.t < 3600);
    expect(hour.filter((x) => x.fill >= 0.5).length / hour.length).toBeGreaterThanOrEqual(0.65);
    // Never empty.
    expect(g.every((x) => x.id.length > 0)).toBe(true);
  }, 30000);

  it('hysteresis: a goal stays at least 4 s unless it completes', () => {
    const s = createIdle(8, 0);
    s.meta.tutorial.done = true;
    s.tutorial.done = true;
    s.meta.path.step = 99;
    s.meta.sealsOpened = [1, 2, 3, 4];
    resetWindow(s, 61);
    s.run.dmax = 61;
    s.run.lines = [14];
    s.run.gold = Big.from(10);
    refreshRates(s, 5);
    const bus = createIdleBus();
    const changes: number[] = [];
    bus.on('goal:change', () => changes.push(s.time));
    for (let i = 0; i < 600; i++) {
      s.time += 1 / 60;
      // Gold swings so the best near goal flips every few frames.
      s.run.gold = Big.from(i % 30 < 15 ? 10 : 5e3);
      tickGoals(s, bus);
    }
    for (let i = 1; i < changes.length; i++) expect(changes[i] - changes[i - 1]).toBeGreaterThanOrEqual(GOAL_HOLD - 1e-9);
  });

  it('the fallback is the next 20 m mark, and a never-opened seal within reach wins over near goals', () => {
    const s = createIdle(8, 0);
    s.meta.tutorial.done = true;
    s.tutorial.done = true;
    s.meta.path.step = 99;
    resetWindow(s, 22);
    s.run.dmax = 22;
    refreshRates(s, 5);
    s.rates.rowSec = 1;
    expect(selectGoal(s).id).toBe('seal:near');
    s.meta.sealsOpened = [1];
    const m = markGoal(s);
    expect(m.id).toBe('mark:40');
    expect(m.fill).toBeCloseTo(0.1, 9);
  });

  it('the tutorial owns the bar first ("Tap the rock")', () => {
    const s = createIdle(1, 0);
    expect(selectGoal(s).key).toBe('idle.tut.tapRock');
  });
});
