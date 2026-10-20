import { describe, expect, it } from 'vitest';
import { Big } from '../../../src/core/big';
import { createIdleBus } from '../../../src/idle/bus';
import { buy } from '../../../src/idle/model/run';
import { createIdle, stepIdle } from '../../../src/idle/model/step';
import { currentStep, guideTarget, TUTORIAL_STEPS, TUTORIAL_TIMES } from '../../../src/idle/model/tutorial';
import { simTutorial } from '../../../src/idle/sim/tutorialSim';

const DT = 1 / 60;

function run(s: ReturnType<typeof createIdle>, secs: number, taps: Array<{ col: number; kind: 'tap' }> = [], bus = createIdleBus()) {
  for (let t = 0; t < secs; t += DT) stepIdle(s, DT, taps, bus);
}

describe('the tutorial (SPEC §8.2)', () => {
  it('steps advance on the action: tap → break, the row, the pick, the Shovel Hand', () => {
    const s = createIdle(3, 0);
    const bus = createIdleBus();
    const steps: string[] = [];
    bus.on('tutorial:step', (e) => steps.push(e.id));
    run(s, 0.1, [], bus);
    expect(currentStep(s)?.id).toBe('tapRock');
    expect(guideTarget(s)).toBe('cell');
    stepIdle(s, DT, [{ col: 3, kind: 'tap' }], bus);
    run(s, 0.1, [], bus);
    expect(currentStep(s)?.id).toBe('clearRow');
    for (let i = 0; i < 12; i++) {
      stepIdle(s, DT, [{ col: i % 7, kind: 'tap' }], bus);
      run(s, 0.2, [], bus);
    }
    expect(s.run.dmax).toBeGreaterThanOrEqual(1);
    s.run.gold = Big.from(200);
    run(s, 0.1, [], bus);
    expect(currentStep(s)?.id).toBe('buyPick');
    expect(guideTarget(s)).toBe('card:pick');
    buy(s, 'pick', 'x1', bus);
    run(s, 0.1, [], bus);
    expect(currentStep(s)?.id).toBe('hireShovel');
    buy(s, 'crew:0', 'x1', bus);
    run(s, 0.1, [], bus);
    expect(steps.slice(0, 4)).toEqual(['tapRock', 'clearRow', 'buyPick', 'hireShovel']);
  });

  it('fallbacks fire after their delays: the ghost hand breaks the first cell after 4 s', () => {
    const s = createIdle(3, 0);
    const bus = createIdleBus();
    const fb: Array<[string, number]> = [];
    bus.on('tutorial:fallback', (e) => fb.push([e.id, s.time]));
    run(s, 3.9, [], bus);
    expect(fb).toHaveLength(0);
    run(s, 0.3, [], bus);
    expect(fb[0]?.[0]).toBe('tapRock');
    expect(fb[0][1]).toBeGreaterThanOrEqual(4);
    expect(s.meta.stats.cells).toBeGreaterThanOrEqual(1);
  });

  it('cannot be failed: a player who never buys still reaches the hatch step when the seal comes', () => {
    const s = createIdle(3, 0);
    s.run.lines = [80];
    s.run.dmax = 0;
    run(s, 300, []);
    // The crew dug to the hatch; the tutorial jumped to it.
    expect(s.run.depth).toBe(40);
    expect(['hatch', 'reveal', 'gear', 'surge']).toContain(currentStep(s)?.id ?? 'done');
  });

  it('G1 (model): a scripted player at 4 taps/s reaches Seal 1, the reveal and the first gear within 2:30; no step waits > 25 s for its prompt', () => {
    const r = simTutorial(4, 400);
    expect(r.sealAt).toBeLessThan(150);
    expect(r.gearAt).toBeLessThan(150);
    expect(r.doneAt).toBeLessThan(200);
    const ids = r.steps.map((x) => x[0]);
    expect(ids).toEqual(TUTORIAL_STEPS.map((x) => x.id));
    for (let i = 1; i < r.steps.length; i++) expect(r.steps[i][1] - r.steps[i - 1][1]).toBeLessThan(25);
  });

  it('CRITIQUE MUST 9: TUTORIAL_TIMES match the sim at 5 and 3 taps/s within ±25 % (and 2 s)', () => {
    for (const [k, taps] of [[0, 5], [1, 3]] as const) {
      const r = simTutorial(taps, 400);
      for (const [id, t] of r.steps) {
        const want = TUTORIAL_TIMES[id][k];
        expect(Math.abs(t - want)).toBeLessThanOrEqual(Math.max(2, 0.25 * want));
      }
    }
  });
});
