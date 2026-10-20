// Shared fixtures for the W2 system tests: a state past the tutorial at a depth, with a believable build.
import { Big } from '../../../src/core/big';
import { biomeAt } from '../../../src/idle/config/biomes';
import { refreshRates } from '../../../src/idle/model/run';
import { resetWindow } from '../../../src/idle/model/shaft';
import type { IdleState } from '../../../src/idle/model/state';
import { createIdle, STEP_DT, stepIdle, type ModelTap } from '../../../src/idle/model/step';
import type { IdleBus } from '../../../src/idle/bus';

/** A state at `depth` with every seal above opened, the tutorial done and a build that digs (pick, lines). */
export function stateAt(depth: number, seed = 11, opts: { pick?: number; lines?: number[]; open?: boolean } = {}): IdleState {
  const s = createIdle(seed, 0);
  s.meta.tutorial.done = true;
  s.tutorial.done = true;
  s.meta.path.step = 99;
  const k = biomeAt(depth);
  if (opts.open !== false) for (let b = 1; b <= k; b++) s.meta.sealsOpened.push(b);
  s.run.pick = opts.pick ?? Math.max(1, Math.floor(depth / 4));
  s.run.lines = opts.lines ?? [Math.max(1, Math.floor(depth / 5))];
  s.run.dmax = depth;
  s.meta.record = depth;
  s.meta.revealed.push('surge', 'combo', 'skills', 'boardTab');
  resetWindow(s, depth);
  s.run.gold = Big.zero();
  refreshRates(s, 4);
  return s;
}

/** Step `secs` seconds tapping `col` at `rate` per second (0: no taps). */
export function play(s: IdleState, secs: number, rate: number, bus?: IdleBus, col = 3, dt = STEP_DT): void {
  const one: ModelTap[] = [{ col, kind: 'tap' }];
  const none: ModelTap[] = [];
  let acc = 0;
  for (let t = 0; t < secs; t += dt) {
    acc += rate * dt;
    let taps = none;
    if (acc >= 1) {
      acc -= 1;
      taps = one;
    }
    stepIdle(s, dt, taps, bus);
  }
}
