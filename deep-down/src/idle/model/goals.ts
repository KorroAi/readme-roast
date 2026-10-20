// The goal bar (SPEC §8.4): one objective on screen in every frame of play. Re-evaluated every 0.5 s;
// first match wins: the tutorial step, something to claim, a never-opened seal near, (Rekindle: W2), the
// Path step when close, the best near goal (a ★, a gear card, the pick's next tier, the next 20 m mark),
// the 20 m fallback. A goal stays at least 4 s unless it completes; on completion the next one slides in
// without emptying (the UI morphs the fill). Path steps 1–15 complete and pay here.

import type { IdleBus } from '../bus';
import { biomeAt, biomeDef } from '../config/biomes';
import { crewLine, STAR_EVERY } from '../config/crew';
import { gearOf } from '../config/gear';
import { PATH, PATH_SYSTEMS_W1, type PathStep } from '../config/path';
import { PICK } from '../config/upgrades';
import { openChest } from './chests';
import { price } from './run';
import { nextSealDepth } from './shaft';
import { type GoalState, type GoalView, type IdleState } from './state';
import { currentStep } from './tutorial';

/** Re-evaluation period and hysteresis (s). */
export const GOAL_EVAL = 0.5;
export const GOAL_HOLD = 4;
/** A near goal must be at least this far along and at most this many seconds away (L5). */
export const NEAR_MIN_FILL = 0.15;
export const NEAR_MAX_ETA = 90;
/** The Path step shows when its ETA is at most this or it is half done. */
export const PATH_MAX_ETA = 120;

function view(id: string, key: string, params: Record<string, string | number>, fill: number, eta: number, go = '', icon = 'goal', reward = '', rewardParams: Record<string, string | number> = {}): GoalView {
  return { id, key, params, fill: Math.max(0, Math.min(1, fill)), eta, reward, rewardParams, go, icon };
}

export function initGoals(): GoalState {
  return { current: view('tut:tapRock', 'idle.tut.tapRock', {}, NEAR_MIN_FILL, 2, 'cell', 'tap'), since: 0, nextEval: 0 };
}

// ----- measures ---------------------------------------------------------------------------------------

/** Seconds to afford `costLog10` at the current income (0 when affordable). */
function etaGold(s: IdleState, costLog10: number): number {
  const g = s.run.gold.log10();
  if (g >= costLog10) return 0;
  const inc = s.rates.goldPerSec.log10();
  if (inc === -Infinity) return Infinity;
  const need = Math.pow(10, costLog10) - (g === -Infinity ? 0 : Math.pow(10, g));
  // For huge numbers work in log space.
  if (!Number.isFinite(need)) return Math.pow(10, costLog10 - inc);
  return need / Math.pow(10, inc);
}

function goldFill(s: IdleState, costLog10: number): number {
  const g = s.run.gold.log10();
  if (g === -Infinity) return 0;
  return Math.min(1, Math.pow(10, g - costLog10));
}

/** Seconds to dig `rows` rows at the current row time. */
function etaRows(s: IdleState, rows: number): number {
  return rows * (Number.isFinite(s.rates.rowSec) ? s.rates.rowSec : 60);
}

/** The next 20 m mark: fill and ETA. */
export function markGoal(s: IdleState): GoalView {
  const d = s.run.depth;
  const m = (Math.floor(d / 20) + 1) * 20;
  const fill = (d - (m - 20)) / 20;
  const first = m > s.meta.markMax;
  return view(`mark:${m}`, 'idle.goal.mark', { m }, fill, etaRows(s, m - d), 'ruler', 'depth', first ? 'idle.reward.gems' : '', first ? { n: 1 } : {});
}

// ----- the Path ---------------------------------------------------------------------------------------

/** The current Path step (skipping steps of systems this build lacks), or null after the last. */
export function pathStep(s: IdleState): PathStep | null {
  for (let n = s.meta.path.step; n <= PATH.length; n++) {
    const p = PATH[n - 1];
    if (PATH_SYSTEMS_W1.has(p.kind)) return p;
  }
  return null;
}

/** Is a Path step done now? */
export function pathDone(s: IdleState, p: PathStep): boolean {
  switch (p.kind) {
    case 'tapRock': return s.meta.stats.cells >= 1;
    case 'clearRow': return s.meta.record >= 1;
    case 'pick2': return s.run.pick >= p.arg;
    case 'hireShovel': return (s.run.lines[0] ?? 0) >= 1;
    case 'openChest': return s.meta.stats.chests >= 1;
    case 'depth': return s.meta.record >= p.arg;
    case 'star': return s.meta.stats.stars >= 1;
    case 'dynamite': return s.meta.firstTime.includes('used:dynamite');
    case 'seal': return s.meta.sealsOpened.includes(p.arg);
    case 'gear': return s.run.gear.length >= 1;
    case 'surge': return s.meta.firstTime.includes('used:surge');
    case 'moth': return s.meta.firstTime.includes('moth:caught');
    case 'hireLine': return (s.run.lines[p.arg] ?? 0) >= 1;
    case 'contract': return false;
  }
}

/** The Path step's goal view (fill and ETA). */
function pathGoal(s: IdleState, p: PathStep): GoalView {
  const reward = p.reward ? ('gems' in p.reward ? 'idle.reward.gems' : 'idle.reward.chest') : '';
  const rp: Record<string, string | number> = p.reward ? ('gems' in p.reward ? { n: p.reward.gems } : { tier: `idle.chest.${['wood', 'copper', 'crystal', 'reliquary', 'lintel'][p.reward.chest]}` }) : {};
  let fill = NEAR_MIN_FILL;
  let eta = Infinity;
  let go = '';
  let params: Record<string, string | number> = {};
  switch (p.kind) {
    case 'depth': {
      fill = s.run.depth / p.arg;
      eta = etaRows(s, p.arg - s.run.depth);
      params = { m: p.arg };
      go = 'ruler';
      break;
    }
    case 'seal': {
      const sd = nextSealDepth(s, s.run.depth);
      const dist = Math.max(0, sd - s.run.depth);
      fill = 1 - Math.min(1, dist / Math.max(40, sd - (sd >= 120 ? 40 : 0)));
      eta = etaRows(s, dist) + 15;
      params = { warden: `idle.warden.${biomeDef(biomeAt(sd) - 1).warden}`, m: dist };
      go = 'seal';
      break;
    }
    case 'pick2': {
      const pr = price(s, 'pick', 'x1');
      fill = goldFill(s, pr.costLog10);
      eta = etaGold(s, pr.costLog10);
      go = 'card:pick';
      break;
    }
    case 'hireShovel':
    case 'hireLine': {
      const i = p.kind === 'hireShovel' ? 0 : p.arg;
      const pr = price(s, `crew:${i}`, 'x1');
      fill = goldFill(s, pr.costLog10);
      eta = etaGold(s, pr.costLog10);
      params = { line: `idle.crew.${crewLine(i).id}` };
      go = `card:crew:${i}`;
      break;
    }
    case 'gear': {
      let bestL = Infinity;
      let id = '';
      for (const g of gearOf(biomeAt(s.run.dmax))) if (!s.run.gear.includes(g.id) && g.costLog10 < bestL) {
        bestL = g.costLog10;
        id = g.id;
      }
      if (id) {
        fill = goldFill(s, bestL);
        eta = etaGold(s, bestL);
        go = `card:gear:${id}`;
      }
      break;
    }
    case 'star': {
      const lv = s.run.lines[0] ?? 0;
      fill = (lv % STAR_EVERY) / STAR_EVERY;
      const pr = price(s, 'crew:0', 'star');
      eta = etaGold(s, pr.costLog10);
      go = 'card:crew:0';
      break;
    }
    case 'surge': {
      fill = s.tap.surge / 240;
      eta = (240 - s.tap.surge) / 5;
      go = 'surge';
      break;
    }
    default:
      fill = NEAR_MIN_FILL;
      eta = 30;
  }
  return view(`path:${p.n}`, `idle.path.${p.n}`, params, Math.max(NEAR_MIN_FILL, fill), eta, go, 'path', reward, rp);
}

/** Complete every Path step that is done, paying its reward (auto-claimed). */
function claimPath(s: IdleState, bus?: IdleBus): void {
  for (let guard = 0; guard < PATH.length; guard++) {
    const p = PATH[s.meta.path.step - 1];
    if (!p) return;
    if (!PATH_SYSTEMS_W1.has(p.kind)) {
      // A system this build lacks: skip it (no reward).
      s.meta.path.step++;
      continue;
    }
    if (!pathDone(s, p)) return;
    s.meta.path.step++;
    let reward = '';
    if (p.reward && 'gems' in p.reward) {
      s.meta.gems += p.reward.gems;
      bus?.emit('gems:gain', { amount: p.reward.gems, source: 'path', col: -1, depth: s.run.depth });
      reward = `gems:${p.reward.gems}`;
    } else if (p.reward && 'chest' in p.reward) {
      openChest(s, `path:${p.n}`, p.reward.chest, 'path', bus);
      reward = `chest:${p.reward.chest}`;
    }
    bus?.emit('path:done', { index: p.n, reward });
  }
}

// ----- near goals -------------------------------------------------------------------------------------

function nearGoals(s: IdleState): GoalView[] {
  const out: GoalView[] = [];
  // The next ★ on any hired line.
  for (let i = 0; i < s.run.lines.length; i++) {
    const lv = s.run.lines[i] ?? 0;
    if (lv <= 0) continue;
    // Fill: levels toward the ★ plus the gold toward the next level (the bar climbs with every purchase).
    const pr = price(s, `crew:${i}`, 'star');
    const next = price(s, `crew:${i}`, 'x1');
    const f = ((lv % STAR_EVERY) + goldFill(s, next.costLog10)) / STAR_EVERY;
    const at = (Math.floor(lv / STAR_EVERY) + 1) * STAR_EVERY;
    out.push(view(`near:star:${i}`, 'idle.goal.star', { line: `idle.crew.${crewLine(i).id}`, at }, f, etaGold(s, pr.costLog10), `card:crew:${i}`, 'star', 'idle.reward.mult', { x: 2 }));
  }
  // An affordable-soon gear card of the current biome.
  for (const g of gearOf(biomeAt(s.run.dmax))) {
    if (s.run.gear.includes(g.id)) continue;
    out.push(view(`near:gear:${g.id}`, 'idle.goal.gear', { gear: `idle.gear.${g.kind}`, biome: `idle.biome.${biomeDef(g.biome).id}` }, goldFill(s, g.costLog10), etaGold(s, g.costLog10), `card:gear:${g.id}`, 'gear', 'idle.reward.mult', { x: g.mult }));
  }
  // The pick's next damage tier.
  {
    const pr = price(s, 'pick', 'star');
    out.push(view('near:pickTier', 'idle.goal.pickTier', { level: (Math.floor(s.run.pick / PICK.tierEvery) + 1) * PICK.tierEvery }, goldFill(s, pr.costLog10), etaGold(s, pr.costLog10), 'card:pick', 'pick', 'idle.reward.mult', { x: PICK.tierX }));
  }
  out.push(markGoal(s));
  return out;
}

// ----- selection --------------------------------------------------------------------------------------

/** The goal the bar should show now (pure). */
export function selectGoal(s: IdleState): GoalView {
  // 1. The tutorial step.
  const step = currentStep(s);
  if (step && step.text) {
    const g = tutorialGoal(s, step.id, step.text);
    if (g) return g;
  }
  // 2. Something to claim.
  if (s.offline && !s.offline.collected) return view('claim:offline', 'idle.goal.claim', {}, 1, 0, 'feast', 'claim');
  // 3. A never-opened seal near (or the fight itself).
  if (s.seal) {
    const w = biomeDef(s.seal.biome - 1).warden;
    return view('seal', 'idle.goal.sealFight', { warden: `idle.warden.${w}` }, Math.max(NEAR_MIN_FILL, 1 - s.seal.left), Math.max(1, s.seal.endsAt - s.time), 'seal', 'seal');
  }
  const sd = nextSealDepth(s, s.run.depth);
  const dist = sd - s.run.depth;
  if (dist > 0 && dist <= 34) {
    const eta = etaRows(s, dist);
    if (eta <= NEAR_MAX_ETA) {
      const w = biomeDef(biomeAt(sd) - 1).warden;
      return view('seal:near', 'idle.goal.seal', { warden: `idle.warden.${w}`, m: dist }, 1 - dist / 40, eta, 'seal', 'seal');
    }
  }
  // 5. The Path step when close.
  const p = pathStep(s);
  if (p) {
    const g = pathGoal(s, p);
    if (g.eta <= PATH_MAX_ETA || g.fill >= 0.5) return g;
  }
  // 6. The best near goal.
  let best: GoalView | null = null;
  for (const g of nearGoals(s)) {
    if (g.fill < NEAR_MIN_FILL || g.fill >= 1 || g.eta > NEAR_MAX_ETA) continue;
    if (!best || g.fill > best.fill) best = g;
  }
  if (best) return best;
  // 7. The fallback: the next 20 m mark; when walled, upgrade (Rekindle from W2).
  const m = markGoal(s);
  if (m.eta > 240) return view('walled', 'idle.goal.walled', {}, Math.max(NEAR_MIN_FILL, m.fill), m.eta, 'sheet:dig', 'up');
  return { ...m, id: 'fallback', fill: Math.max(m.fill, 0) };
}

function tutorialGoal(s: IdleState, id: string, text: string): GoalView | null {
  const tu = s.tutorial;
  const waiting = tu.since < 0;
  switch (id) {
    case 'tapRock':
      return view('tut:tapRock', text, {}, NEAR_MIN_FILL, 2, 'cell', 'tap');
    case 'clearRow': {
      const row = s.shaft.rows[0];
      let broken = 0;
      for (let c = 0; c < 7; c++) if (row.left[c] <= 0) broken++;
      return view('tut:clearRow', text, { n: broken, of: 7 }, Math.max(NEAR_MIN_FILL, broken / 7), 4, 'cell', 'tap');
    }
    case 'buyPick': {
      const pr = price(s, 'pick', 'x1');
      return view('tut:buyPick', text, {}, Math.max(NEAR_MIN_FILL, goldFill(s, pr.costLog10)), etaGold(s, pr.costLog10), 'card:pick', 'pick', 'idle.reward.gems', { n: 5 });
    }
    case 'hireShovel': {
      const pr = price(s, 'crew:0', 'x1');
      return view('tut:hireShovel', text, {}, Math.max(NEAR_MIN_FILL, goldFill(s, pr.costLog10)), etaGold(s, pr.costLog10), 'card:crew:0', 'crew');
    }
    case 'chest':
      if (waiting) return null;
      return view('tut:chest', text, {}, 0.5, 3, 'chest', 'chest');
    case 'crystals':
      if (waiting) return null;
      return view('tut:crystals', text, { n: tu.breaks, of: 3 }, Math.max(NEAR_MIN_FILL, tu.breaks / 3), 6, 'crystal', 'gem');
    case 'dynamite':
      if (waiting) return null;
      return view('tut:dynamite', text, {}, 0.5, 3, 'skill:dynamite', 'dynamite');
    case 'hatchNear':
    case 'hatch': {
      if (waiting && id === 'hatchNear') return null;
      const dist = Math.max(0, 40 - s.run.depth);
      if (s.seal) return view('tut:hatch', 'idle.tut.hatch', {}, Math.max(NEAR_MIN_FILL, 1 - s.seal.left), Math.max(1, s.seal.endsAt - s.time), 'seal', 'seal', 'idle.reward.chest', { tier: 'idle.chest.copper' });
      return view('tut:hatchNear', 'idle.tut.hatchNear', { m: dist }, Math.max(NEAR_MIN_FILL, 1 - dist / 40), etaRows(s, dist), 'seal', 'seal');
    }
    case 'gear': {
      let bestL = Infinity;
      let gid = '';
      for (const g of gearOf(1)) if (!s.run.gear.includes(g.id) && g.costLog10 < bestL) {
        bestL = g.costLog10;
        gid = g.id;
      }
      return view('tut:gear', text, {}, Math.max(NEAR_MIN_FILL, goldFill(s, bestL)), etaGold(s, bestL), gid ? `card:gear:${gid}` : 'sheet:dig', 'gear', 'idle.reward.mult', { x: 3 });
    }
    case 'surge':
      return view('tut:surge', text, {}, Math.max(NEAR_MIN_FILL, s.tap.surge / 240), (240 - s.tap.surge) / 5, 'surge', 'surge');
    default:
      return null;
  }
}

/** Is the current goal complete now (so the next one slides in at once)? */
function completed(s: IdleState, g: GoalView): boolean {
  if (g.id.startsWith('tut:')) {
    const step = currentStep(s);
    return !step || `tut:${step.id}` !== g.id;
  }
  if (g.id.startsWith('mark:')) return s.run.depth >= Number(g.id.slice(5));
  if (g.id.startsWith('near:star:')) return (s.run.lines[Number(g.id.slice(10))] ?? 0) >= Number(g.params.at);
  if (g.id === 'near:pickTier') return s.run.pick >= Number(g.params.level);
  if (g.id.startsWith('near:gear:')) return s.run.gear.includes(g.id.slice(10));
  if (g.id.startsWith('path:')) return s.meta.path.step > Number(g.id.slice(5));
  if (g.id === 'seal' || g.id === 'seal:near') return !s.seal && g.id === 'seal';
  if (g.id === 'claim:offline') return !s.offline || s.offline.collected;
  return false;
}

/** Advance the goal bar (every 0.5 s). */
export function tickGoals(s: IdleState, bus?: IdleBus): void {
  claimPath(s, bus);
  const gs = s.goals;
  const cur = gs.current;
  const done = completed(s, cur);
  if (!done && s.time < gs.nextEval) {
    // Keep the shown goal's numbers live between evaluations.
    refreshLive(s, cur);
    return;
  }
  gs.nextEval = s.time + GOAL_EVAL;
  if (done) bus?.emit('goal:done', { id: cur.id, reward: cur.reward });
  const next = selectGoal(s);
  if (next.id === cur.id) {
    gs.current = next;
    return;
  }
  // Hysteresis: hold a goal 4 s unless it completed (the tutorial always wins).
  if (!done && s.time - gs.since < GOAL_HOLD && !next.id.startsWith('tut:') && !cur.id.startsWith('tut:')) {
    refreshLive(s, cur);
    return;
  }
  gs.current = next;
  gs.since = s.time;
  bus?.emit('goal:change', { id: next.id });
}

/** Update fill and ETA of the shown goal in place (between evaluations). */
function refreshLive(s: IdleState, g: GoalView): void {
  if (g.id.startsWith('mark:') || g.id === 'fallback') {
    const m = markGoal(s);
    if (g.id === 'fallback' || m.id === g.id) {
      g.fill = m.fill;
      g.eta = m.eta;
    }
  }
}

/** The goal on the bar now. */
export function currentGoal(s: IdleState): GoalView {
  return s.goals.current;
}

