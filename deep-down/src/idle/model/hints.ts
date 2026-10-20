// Contextual hints (SPEC §8.7), W1 part: H1 (no tap for 6 s in the first 30 minutes: the hand pulses over
// the best target), H2 (an affordable BEST card unbought for 15 s: it pings twice and the hand points),
// H10 (a tab unlocks: a dot and a first-time card). At most one hint per 20 s; each at most 3 times in a
// lifetime; never during a seal or the tutorial's own prompts (the tutorial has its fallbacks).

import type { IdleBus } from '../bus';
import { SKILLS } from '../config/skills';
import { recommend } from './prestige';
import { best, price } from './run';
import { cooldownLeft } from './skills';
import type { IdleState } from './state';

export const HINTS = {
  gap: 20,
  maxPerLife: 3,
  h1Idle: 6,
  h1Window: 30 * 60,
  h2Wait: 15,
  h3Wait: 30,
  h4Wait: 5,
  h12Play: 45 * 60,
} as const;

/** Tabs whose reveal is announced by H10 (their first-time card). */
const TABS = ['digTab', 'crewTab', 'boardTab', 'featsTab', 'codexTab', 'lanternTab'];

function canShow(s: IdleState, id: string): boolean {
  if ((s.meta.hints[id] ?? 0) >= HINTS.maxPerLife) return false;
  // The seal's own hints (H5, H6) show during the fight; every other hint waits for it.
  if (id !== 'H5' && id !== 'H6') {
    if (s.time - s.hints.lastShown < HINTS.gap) return false;
    if (s.seal) return false;
  }
  if (!s.meta.tutorial.done && id !== 'H5' && id !== 'H6') return false;
  return true;
}

/** The seal appeared (H5: "Break it in 30 s · estimate ~14 s", coloured by the estimate). */
export function sealHint(s: IdleState, estimate: number, bus?: IdleBus): void {
  if (canShow(s, 'H5')) show(s, 'H5', estimate <= 15 ? 'seal:green' : estimate <= 25 ? 'seal:amber' : 'seal:red', bus);
}

/** The seal held (H6: "The seal holds · 64 %. Upgrade, then try again" + the BEST glow). */
export function sealFailHint(s: IdleState, bus?: IdleBus): void {
  if (canShow(s, 'H6')) show(s, 'H6', 'card:best', bus);
}

/** A return with the crew waiting at a seal (H9: the seal card), and an offline time that was capped (H11). */
export function returnHints(s: IdleState, waitingAtSeal: boolean, capped: boolean, bus?: IdleBus): void {
  if (waitingAtSeal && (s.meta.hints.H9 ?? 0) < HINTS.maxPerLife) {
    s.meta.hints.H9 = (s.meta.hints.H9 ?? 0) + 1;
    bus?.emit('hint:show', { id: 'H9', target: 'seal' });
  }
  if (capped && (s.meta.hints.H11 ?? 0) < 1) {
    s.meta.hints.H11 = 1;
    bus?.emit('hint:show', { id: 'H11', target: 'lanternTab' });
  }
}

/** A combo of 7–12 lost (H8 after the third, once). */
export function comboLostHint(s: IdleState, combo: number, bus?: IdleBus): void {
  if (combo < 7 || combo > 12) return;
  s.meta.hints.H8c = (s.meta.hints.H8c ?? 0) + 1;
  if (s.meta.hints.H8c >= 3 && (s.meta.hints.H8 ?? 0) < 1 && canShow(s, 'H8')) {
    show(s, 'H8', 'combo', bus);
    s.meta.hints.H8 = HINTS.maxPerLife;
  }
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
  // H3: a skill ready and unused for 30 s (its ring pulses once).
  for (const k of SKILLS) {
    const st = s.run.skills[k.id];
    if (!st || st.lvl <= 0 || cooldownLeft(s, k.id) > 0) continue;
    if (st.readyAt === undefined) st.readyAt = s.time;
    if (s.time - st.readyAt >= HINTS.h3Wait && canShow(s, 'H3')) {
      show(s, 'H3', `skill:${k.id}`, bus);
      st.readyAt = s.time;
      break;
    }
  }
  // H4: a popped chest untouched for 5 s (a sparkle ring around it).
  const c = s.chests[0];
  if (c && s.time - c.at >= HINTS.h4Wait && canShow(s, 'H4')) show(s, 'H4', c.id, bus);
  // H7: Rekindle recommended (the goal bar switches; the Lantern tab glows).
  if (s.meta.revealed.includes('lanternTab') && canShow(s, 'H7') && recommend(s).ok) show(s, 'H7', 'tab:lanternTab', bus);
  // H12: 45 minutes of continuous play (the break reminder; the UI drops it when the setting is off).
  if (s.time >= HINTS.h12Play && s.time - s.hints.lastShown > HINTS.gap && (s.meta.hints.H12at ?? 0) + HINTS.h12Play <= s.time && canShow(s, 'H12')) {
    s.meta.hints.H12at = s.time;
    show(s, 'H12', 'rest', bus);
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
