import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { crewLine } from '../../../src/idle/config/crew';
import { impactsIn, stepCrew, strikePhase } from '../../../src/idle/model/crew';
import { tickHints } from '../../../src/idle/model/hints';
import { catchMoth, tickMoth } from '../../../src/idle/model/moth';
import { resetWindow } from '../../../src/idle/model/shaft';
import { createIdle } from '../../../src/idle/model/step';

describe('hints H1, H2, H10 (SPEC §8.7)', () => {
  it('H1 after 6 s without a tap, H2 when BEST waits 15 s, at most one per 20 s, 3 a lifetime; H10 on a tab reveal', () => {
    const s = createIdle(5, 0);
    s.meta.tutorial.done = true;
    s.tutorial.done = true;
    s.meta.sealsOpened = [1, 2];
    resetWindow(s, 60);
    s.run.dmax = 60;
    s.run.pick = 20;
    s.run.lines = [12, 2];
    s.run.gold = Big.from(1e7);
    const bus = createIdleBus();
    const shown: Array<[string, number]> = [];
    bus.on('hint:show', (e) => shown.push([e.id, s.time]));
    s.meta.revealed.push('crewTab');
    for (let t = 0; t < 400; t += 1 / 60) {
      s.time = t;
      s.playTime = t;
      tickHints(s, bus);
    }
    expect(shown[0]).toEqual(['H10', 0]);
    const h1 = shown.filter((x) => x[0] === 'H1');
    const h2 = shown.filter((x) => x[0] === 'H2');
    expect(h1.length).toBeGreaterThan(0);
    expect(h1[0][1]).toBeGreaterThanOrEqual(6);
    expect(h1.length + h2.length).toBeLessThanOrEqual(6);
    expect(h1.length).toBeLessThanOrEqual(3);
    const timed = shown.filter((x) => x[0] !== 'H10').map((x) => x[1]);
    for (let i = 1; i < timed.length; i++) expect(timed[i] - timed[i - 1]).toBeGreaterThanOrEqual(20 - 1e-6);
  });
});

describe('the crew strike schedule (BUILD §2.1 MUST 4) and the Lucky Moth', () => {
  it('damage lands only on impact frames, the same instants the rig plays', () => {
    const s = createIdle(5, 0);
    s.meta.sealsOpened = [1, 2, 3];
    resetWindow(s, 50);
    s.run.lines = [10];
    const bus = createIdleBus();
    const at: number[] = [];
    bus.on('crew:strike', () => at.push(s.time));
    for (let i = 0; i < 600; i++) {
      s.time += 1 / 60;
      stepCrew(s, 1 / 60, bus);
    }
    const rig = crewLine(0).rig;
    expect(at.length).toBe(impactsIn(s, 0, 0, s.time));
    for (const t of at) {
      const ph = strikePhase(s, 0, t);
      // Each strike is within one frame after an impact instant of the loop.
      expect(rig.impacts.some((imp) => ph - imp >= -1e-9 && ph - imp < 1 / 60 + 1e-9)).toBe(true);
    }
  });

  it('the Lucky Moth comes on its own clock in active play, and the first catch is a Gold Shower', () => {
    const s = createIdle(5, 0);
    s.meta.tutorial.done = true;
    s.tutorial.done = true;
    s.meta.revealed.push('surge');
    s.rates.goldPerSec = Big.from(100);
    const bus = createIdleBus();
    let spawned = 0;
    bus.on('moth:spawn', () => spawned++);
    for (let t = 0; t < 200 && !s.moth; t += 0.1) {
      s.time = t;
      s.playTime = t;
      s.hints.lastHitAt = t; // active
      tickMoth(s, 0.1, bus);
    }
    expect(spawned).toBe(1);
    expect(s.playTime).toBeGreaterThanOrEqual(100);
    let outcome = '';
    bus.on('moth:catch', (e) => (outcome = e.outcome));
    expect(catchMoth(s, bus)).toBe(true);
    expect(outcome).toBe('gold');
    expect(s.run.gold.toNumber()).toBeCloseTo(6000, 6);
  });
});
