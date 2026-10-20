// The calibration bot (SPEC Appendix A): every step it buys the item with the best ΔDPS / cost among
// items affordable within 60 s of income (crew valued ×1.3 because it works offline), until nothing
// affordable is worth buying. The "human" profile buys only BEST, with a 2 s delay before each purchase.
// It reads the real model's formulas (run.ts) on a real IdleState, so the game and the sim agree.

import { addLog, subLog } from '../config/curves';
import { biomeAt } from '../config/biomes';
import { lineUnlock } from '../config/crew';
import { gearById, gearOf } from '../config/gear';
import { UPGRADES } from '../config/upgrades';
import { activeDpsLog10, best, buy, crewDpsLog10, defaultMode, goldPerDmgLog10, price } from '../model/run';
import type { IdleState } from '../model/state';

const L10 = Math.log10;

export interface BotOpts {
  /** Taps per second the bot's DPS assumes. */
  taps: number;
  /** Crew gains valued × this (Appendix A: 1.3). */
  crewBias: number;
  /** Buy what is affordable within this many seconds of income. */
  saveSec: number;
  /** Candidate upgrades beyond the pick, lines and gear ('lucky', 'steady'). */
  ups: readonly string[];
  /** Cap a tap at one cell's HP (Appendix A) or let overkill flow on (the game). */
  cap: boolean;
}

export const BOT_DEFAULT: BotOpts = { taps: 5, crewBias: 1.3, saveSec: 60, ups: [], cap: false };

/** The bot's candidates: the pick, every unlocked line, the current biome's unbought gear, chosen upgrades. */
export function botCandidates(s: IdleState, o: BotOpts): string[] {
  const ids = ['pick'];
  for (const u of UPGRADES) if (o.ups.includes(u.id) && s.run.dmax >= u.unlock && (s.run.ups[u.id] ?? 0) < u.max) ids.push(`up:${u.id}`);
  for (let i = 0; lineUnlock(i) <= s.run.dmax || i < s.meta.blueprints; i++) ids.push(`crew:${i}`);
  const k = biomeAt(s.run.dmax);
  for (let b = 1; b <= k; b++) for (const g of gearOf(b)) if (!s.run.gear.includes(g.id)) ids.push(`gear:${g.id}`);
  return ids;
}

/** log10 of the bot's valued DPS: crew × bias + taps. */
function valued(s: IdleState, o: BotOpts, crew = crewDpsLog10(s)): number {
  const act = activeDpsLog10(s, o.taps, crew, s.run.pick, s.run.ups.lucky ?? 0, o.cap);
  // act = crew + taps; valued = crew × bias + (act − crew)
  const tapPart = subLog(act, crew);
  return addLog(crew + L10(o.crewBias), tapPart);
}

/** log10 of the valued DPS gain of one ×1 purchase. */
function gainOf(s: IdleState, id: string, o: BotOpts, base: number): number {
  if (id === 'pick') {
    s.run.pick++;
    const v = valued(s, o);
    s.run.pick--;
    return subLog(v, base);
  }
  if (id.startsWith('up:')) {
    const u = id.slice(3);
    const lv = s.run.ups[u] ?? 0;
    s.run.ups[u] = lv + 1;
    let v: number;
    if (u === 'steady') v = valued(s, { ...o, taps: o.taps + 1 / 3 });
    else v = valued(s, o);
    s.run.ups[u] = lv;
    return subLog(v, base);
  }
  if (id.startsWith('crew:')) {
    const i = Number(id.slice(5));
    while (s.run.lines.length <= i) s.run.lines.push(0);
    s.run.lines[i]++;
    const v = valued(s, o);
    s.run.lines[i]--;
    return subLog(v, base);
  }
  if (id.startsWith('gear:')) {
    const g = gearById(id.slice(5));
    if (!g) return -Infinity;
    s.run.gear.push(g.id);
    const v = valued(s, o);
    s.run.gear.pop();
    return subLog(v, base);
  }
  return -Infinity;
}

/** One buying pass of the greedy bot. Returns the ids bought (in order). */
export function botBuy(s: IdleState, o: BotOpts, maxBuys = 600): string[] {
  const bought: string[] = [];
  const income = activeDpsLog10(s, o.taps, crewDpsLog10(s), s.run.pick, s.run.ups.lucky ?? 0, o.cap) + goldPerDmgLog10();
  const horizon = addLog(s.run.gold.log10(), income + L10(o.saveSec));
  for (let k = 0; k < maxBuys; k++) {
    const base = valued(s, o);
    let bestId = '';
    let bestScore = -Infinity;
    let bestCost = Infinity;
    for (const id of botCandidates(s, o)) {
      const c = price(s, id, 'x1').costLog10;
      if (!(c <= horizon)) continue;
      const g = gainOf(s, id, o, base);
      if (g === -Infinity) continue;
      const sc = g - c;
      if (sc > bestScore) {
        bestScore = sc;
        bestId = id;
        bestCost = c;
      }
    }
    if (!bestId || bestCost > s.run.gold.log10() + 1e-9) break;
    const r = buy(s, bestId, 'x1');
    if (!r.ok) break;
    bought.push(bestId);
  }
  return bought;
}

/** The human profile: buy BEST only (when affordable), in the UI's default buy mode (NEXT ★ after the first ★). */
export function humanBuy(s: IdleState): string | null {
  const mode = defaultMode(s);
  const b = best(s);
  if (!b) {
    // Before two options compete the human buys what the tutorial points at (the pick, then the Shovel Hand).
    for (const id of ['pick', 'crew:0']) if (price(s, id, 'x1').costLog10 <= s.run.gold.log10() + 1e-9) {
      buy(s, id, 'x1');
      return id;
    }
    return null;
  }
  if (price(s, b, mode).costLog10 <= s.run.gold.log10() + 1e-9) return buy(s, b, mode).ok ? b : null;
  if (price(s, b, 'x1').costLog10 > s.run.gold.log10() + 1e-9) return null;
  return buy(s, b, 'x1').ok ? b : null;
}

