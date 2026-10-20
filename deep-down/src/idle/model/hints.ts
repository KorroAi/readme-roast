// Contextual hints (SPEC §8.7), W1 part: H1 (no tap for 6 s in the first 30 minutes: the hand pulses over
// the best target), H2 (an affordable BEST card unbought for 15 s: it pings twice and the hand points),
// H10 (a tab unlocks: a dot and a first-time card). At most one hint per 20 s; each at most 3 times in a
// lifetime; never during a seal or the tutorial's own prompts (the tutorial has its fallbacks).

import type { IdleBus } from '../bus';
import { best, price } from './run';
import type { IdleState } from './state';

export const HINTS = {
  gap: 20,
  maxPerLife: 3,
  h1Idle: 6,
  h1Window: 30 * 60,
  h2Wait: 15,
} as const;

/** Tabs whose reveal is announced by H10 (their first-time card). */
const TABS = ['digTab', 'crewTab', 'boardTab', 'featsTab', 'codexTab', 'lanternTab'];

function canShow(s: IdleState, id: string): boolean {
  if ((s.meta.hints[id] ?? 0) >= HINTS.maxPerLife) return false;
  if (s.time - s.hints.lastShown < HINTS.gap) return false;
  if (s.seal) return false;
  if (!s.meta.tutorial.done) return false;
  return true;
}

function show(s: IdleState, id: string, target: string, bus?: IdleBus): void {
  s.meta.hints[id] = (s.meta.hints[id] ?? 0) + 1;
  s.hints.lastShown = s.time;
  bus?.emit('hint:show', { id, target });
}

/** Every step: check H1, H2, H10. */
export function tickHints(s: IdleState, bus?: IdleBus): void {
  // H10: a tab revealed → its first-time card (once each; not rate-limited, it is news).
  for (const tab of TABS) {
    if (s.meta.revealed.includes(tab) && !s.meta.firstTime.includes(`tab:${tab}`)) {
      s.meta.firstTime.push(`tab:${tab}`);
      bus?.emit('firsttime', { id: tab });
      bus?.emit('hint:show', { id: 'H10', target: `tab:${tab}` });
    }
  }
  // Only check the others four times a second.
  if (Math.floor(s.time * 4) === Math.floor((s.time - 1 / 60) * 4)) return;
  // H1: no tap for 6 s in the first 30 minutes of play.
  if (s.playTime < HINTS.h1Window && s.time - s.hints.lastHitAt >= HINTS.h1Idle && canShow(s, 'H1')) {
    show(s, 'H1', 'cell', bus);
  }
  // H2: BEST affordable and unbought for 15 s.
  const b = best(s);
  if (b) {
    const affordable = price(s, b, 'x1').costLog10 <= s.run.gold.log10() + 1e-9;
    if (!affordable || b !== s.hints.bestReadyId) {
      s.hints.bestReadyId = affordable ? b : '';
      s.hints.bestReadySince = affordable ? s.time : -1;
    } else if (s.hints.bestReadySince >= 0 && s.time - s.hints.bestReadySince >= HINTS.h2Wait && canShow(s, 'H2')) {
      show(s, 'H2', `card:${b}`, bus);
      s.hints.bestReadySince = s.time;
    }
  }
}

/** Doing the hinted action retires a hint (the UI calls this on a purchase of BEST, etc.). */
export function retireHint(s: IdleState, id: string): void {
  s.meta.hints[id] = HINTS.maxPerLife;
}
