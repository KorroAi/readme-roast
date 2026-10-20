// The scripted first-time player (CRITIQUE MUST 9, SPEC G1): the real model at 60 Hz, tapping the centre
// column at a fixed rate, acting on whatever the guide points at (the Pick card, the Shovel Hand, the chest,
// the crystals, Dynamite, a gear card) and buying BEST when it is affordable. It times every tutorial step,
// so `TUTORIAL_TIMES` (tutorial.ts) and the e2e G1 come from the same economy the game plays.

import { createIdleBus } from '../bus';
import { gearOf } from '../config/gear';
import { best, buy, price } from '../model/run';
import { useSkill } from '../model/skills';
import type { IdleState } from '../model/state';
import { createIdle, STEP_DT, stepIdle, type ModelTap } from '../model/step';
import { guideTarget, TUTORIAL_STEPS } from '../model/tutorial';

export interface TutorialSimResult {
  /** [step id, start time s] in order. */
  steps: Array<[string, number]>;
  doneAt: number;
  sealAt: number;
  gearAt: number;
  state: IdleState;
}

function affordable(s: IdleState, id: string): boolean {
  return price(s, id, 'x1').costLog10 <= s.run.gold.log10() + 1e-9;
}

/** Run the first minutes at `taps` per second; stop when the tutorial ends or after `maxSecs`. */
export function simTutorial(taps: number, maxSecs = 600, seed = 7): TutorialSimResult {
  const s = createIdle(seed, 0);
  const bus = createIdleBus();
  const steps: Array<[string, number]> = [];
  let doneAt = Infinity;
  let sealAt = Infinity;
  let gearAt = Infinity;
  bus.on('tutorial:step', (e) => steps.push([e.id, s.time]));
  bus.on('tutorial:done', () => (doneAt = s.time));
  bus.on('seal:break', (e) => {
    if (e.biome === 1) sealAt = s.time;
  });
  bus.on('buy:done', (e) => {
    if (e.id.startsWith('gear:') && gearAt === Infinity) gearAt = s.time;
  });
  const interval = 1 / taps;
  let nextTap = 0.4; // a human's first tap lands a beat after the screen appears
  let nextAct = 0;
  let crystal = 0;
  const queue: ModelTap[] = [];
  for (let t = 0; t < maxSecs && doneAt === Infinity; t += STEP_DT) {
    queue.length = 0;
    if (s.time >= nextTap) {
      queue.push({ col: 3, kind: 'tap' });
      nextTap += interval;
    }
    // React to the guide about 3 times a second (a player looks, then acts).
    if (s.time >= nextAct) {
      nextAct = s.time + 0.35;
      const g = guideTarget(s);
      if (g === 'card:pick' && affordable(s, 'pick')) buy(s, 'pick', 'x1', bus);
      else if (g === 'card:crew:0' && affordable(s, 'crew:0')) buy(s, 'crew:0', 'x1', bus);
      else if (g.startsWith('chest:')) queue.push({ col: -1, kind: 'tap', entity: g });
      else if (g === 'crystal') queue.push({ col: -1, kind: 'tap', entity: `crystal:${crystal++ % 3}` });
      else if (g === 'skill:dynamite') useSkill(s, 'dynamite', bus);
      else if (g === 'tab:dig') {
        for (const gr of gearOf(1)) if (affordable(s, `gear:${gr.id}`)) {
          buy(s, `gear:${gr.id}`, 'x1', bus);
          break;
        }
      } else {
        const b = best(s);
        if (b && affordable(s, b)) buy(s, b, 'x1', bus);
        else if (!b && affordable(s, 'pick') && s.run.pick < 2 + s.meta.stats.purchases) buy(s, 'pick', 'x1', bus);
      }
    }
    stepIdle(s, STEP_DT, queue, bus);
  }
  return { steps, doneAt, sealAt, gearAt, state: s };
}

/** The tutorial's step ids in order (for the e2e G1 table). */
export const TUTORIAL_IDS = TUTORIAL_STEPS.map((x) => x.id);
