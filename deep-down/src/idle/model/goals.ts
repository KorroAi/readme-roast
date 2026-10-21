// The objective line (hybrid SPEC §6.1–§6.2, L5): one objective on screen in every frame of play, in every phase.
// Re-evaluated every 0.5 s; the first match wins:
//   1 a tutorial step or a lesson; 2 something to claim (the return haul); 3 the seal (the fight, or within 2 chambers);
//   4 Rekindle [W3]; 5 a manual feature in this chamber (open the chest, read the note, grade the relic, relight the
//   lamps · 1/3, tap what glows); 7 the Path step when close; 9 the best near goal (a ★, a gear card, the pick's next
//   tier); 10 the fallback: "Break through · N m" in a drift, "Go deeper" in a chamber.
// A goal stays ≥ 4 s unless it completes; on completion the next one slides in without emptying (the UI morphs the
// fill). Path steps complete and pay here. `go` tells the shell where tapping the line goes: 'face', 'breach', 'exit',
// 'enter', 'focus:<id>', 'lamp:<id>', 'strike:<id>', 'glint', 'seal', 'adit', 'card:<id>', 'sheet:<id>'.
// With the node layer off (the closed-form sims) the free face's older order runs (`legacySelect`).

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
import { activePrompt, currentStep, guideTarget, type TutorialStep } from './tutorial';
import { contentsOf, nodeView } from './nodes';
import { nodeAt, sealClosed } from './chart';
import { sealTimeLeft } from './seals';
import { sealPending } from './shaft';
import { Big } from '../../core/big';
import { rankGems, rankNeed } from '../config/rank';
import { format } from '../num/notation';
import { nearestContract } from './contracts';
import { featView } from './feats';
import { powerAfter, recommend, rekindleGain } from './prestige';

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
  return { current: view('tut:tapRock', 'idle.tut.tapRock', {}, NEAR_MIN_FILL, 2, 'face', 'tap'), since: 0, nextEval: 0 };
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

/** A Path step waiting on a seal this build keeps closed (the Root Knot in W1): the Path pauses there, unshown. */
function pathPaused(p: PathStep): boolean {
  return p.kind === 'seal' && sealClosed(p.arg);
}

/** The current Path step (skipping steps of systems this build lacks), or null after the last or at a closed seal. */
export function pathStep(s: IdleState): PathStep | null {
  for (let n = s.meta.path.step; n <= PATH.length; n++) {
    const p = PATH[n - 1];
    if (pathPaused(p)) return null;
    if (PATH_SYSTEMS_W1.has(p.kind)) return p;
  }
  return null;
}

/** Is a Path step done now? */
export function pathDone(s: IdleState, p: PathStep): boolean {
  switch (p.kind) {
    case 'tapRock': return s.meta.stats.cells >= 1;
    case 'breakThrough': return s.meta.nodeStats.breaches >= p.arg;
    case 'pick2': return s.run.pick >= p.arg;
    case 'hireShovel': return (s.run.lines[0] ?? 0) >= 1;
    case 'openChest': return s.meta.stats.chests >= 1;
    case 'depth': return s.meta.record >= p.arg;
    case 'star': return s.meta.stats.stars >= 1;
    case 'dynamite': return s.meta.firstTime.includes('used:dynamite');
    case 'seal': return s.meta.sealsOpened.includes(p.arg);
    case 'gear': return s.run.gear.length >= 1;
    case 'surge': return s.meta.firstTime.includes('used:surge');
    case 'ember': return s.meta.firstTime.includes('ember:caught');
    case 'lamps': return s.meta.nodeStats.lamps >= p.arg;
    case 'chart': return s.meta.charted.length >= p.arg;
    case 'relic': return Object.values(s.meta.relicGrades).some((g) => g >= p.arg);
    case 'secret': return s.meta.nodeStats.secrets >= p.arg;
    case 'hireLine': return (s.run.lines[p.arg] ?? 0) >= 1;
    case 'contract': return s.meta.stats.contracts >= 1;
    case 'facet': return s.run.facets.length >= 1 || s.meta.firstTime.includes('used:facet');
    case 'rank': return s.meta.rank.r >= p.arg;
    case 'finds': return s.meta.stats.finds >= p.arg;
    case 'pickLevel': return s.run.pick >= p.arg || s.meta.bestTier >= 1;
    case 'crystalChest': return s.meta.stats.crystalPlus >= p.arg;
    case 'crown': return s.run.lines.some((l) => l >= p.arg);
    case 'page': return s.meta.biomeSeals.length >= p.arg;
    case 'rekindle': return s.meta.stats.rekindles >= p.arg;
    case 'planted': return s.meta.stats.passed >= p.arg;
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
      params = { seal: `idle.mech.${biomeDef(biomeAt(sd) - 1).seal}`, m: dist };
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
    case 'rank': {
      fill = (s.meta.rank.r - 1 + Math.min(1, s.meta.rank.xp / rankNeed(s.meta.rank.r))) / Math.max(1, p.arg - 1);
      eta = (rankNeed(s.meta.rank.r) - s.meta.rank.xp) / 4;
      params = { n: p.arg };
      go = 'rank';
      break;
    }
    case 'pickLevel': {
      fill = s.run.pick / p.arg;
      const pr = price(s, 'pick', 'star');
      eta = etaGold(s, pr.costLog10);
      params = { n: p.arg };
      go = 'card:pick';
      break;
    }
    case 'finds':
    case 'lamps':
    case 'chart':
    case 'secret':
    case 'breakThrough':
    case 'crystalChest': {
      const have =
        p.kind === 'finds' ? s.meta.stats.finds
        : p.kind === 'lamps' ? s.meta.nodeStats.lamps
        : p.kind === 'chart' ? s.meta.charted.length
        : p.kind === 'secret' ? s.meta.nodeStats.secrets
        : p.kind === 'breakThrough' ? s.meta.nodeStats.breaches
        : s.meta.stats.crystalPlus;
      fill = have / Math.max(1, p.arg);
      eta = 60;
      params = { n: p.arg };
      go = p.kind === 'finds' ? 'sheet:codex' : '';
      break;
    }
    case 'crown': {
      let lv = 0;
      let line = 0;
      s.run.lines.forEach((l, i) => {
        if (l > lv) {
          lv = l;
          line = i;
        }
      });
      fill = lv / p.arg;
      eta = 90;
      params = { line: `idle.crew.${crewLine(line).id}`, n: p.arg };
      go = `card:crew:${line}`;
      break;
    }
    case 'rekindle':
      fill = Math.min(1, s.run.dmax / 600);
      eta = recommend(s).ok ? 5 : 600;
      go = 'sheet:lantern';
      break;
    case 'contract':
      fill = nearestContract(s)?.fill ?? NEAR_MIN_FILL;
      eta = nearestContract(s)?.eta ?? 120;
      go = 'sheet:board';
      break;
    case 'planted': {
      const next = s.meta.planted.filter((x) => x.depth > s.run.depth && !s.run.lanterns.includes(x.n)).sort((a, b) => a.depth - b.depth)[0];
      fill = next ? 1 - Math.min(1, (next.depth - s.run.depth) / 120) : NEAR_MIN_FILL;
      eta = next ? etaRows(s, next.depth - s.run.depth) : Infinity;
      params = { m: next ? next.depth - s.run.depth : 0 };
      go = 'ruler';
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
    // A seal this build keeps closed: the Path waits there (it resumes when the seal opens in a later build).
    if (pathPaused(p)) return;
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
  // The contract nearest completion.
  const nc = nearestContract(s);
  if (nc) out.push(view(`near:contract:${nc.slot}`, `idle.contract.${nc.c.tpl}`, { n: nc.c.arg === 'log10' ? format(Big.fromLog10(nc.c.target)) : nc.c.target }, nc.fill, nc.eta, 'sheet:board', 'contract', 'idle.reward.gems', { n: 3 }));
  // The next Feat tier (the closest family) and the next rank.
  const fv = featView(s)[0];
  if (fv && s.meta.revealed.includes('featsTab')) out.push(view(`near:feat:${fv.id}`, 'idle.goal.feat', { feat: `idle.feat.${fv.id}`, tier: fv.tier + 1 }, fv.progress, 60, 'sheet:feats', 'feat', 'idle.reward.gems', { n: 5 * Math.min(10, fv.tier + 1) }));
  if (s.meta.revealed.includes('rank')) {
    const need = rankNeed(s.meta.rank.r);
    out.push(view('near:rank', 'idle.goal.rank', { n: s.meta.rank.r + 1 }, s.meta.rank.xp / need, (need - s.meta.rank.xp) / Math.max(1, xpRate(s)), 'rank', 'rank', 'idle.reward.gems', { n: rankGems(s.meta.rank.r + 1) }));
  }
  return out;
}

/** XP per second lately (for the rank goal's ETA): about the cells broken per second below the record. */
function xpRate(s: IdleState): number {
  return Number.isFinite(s.rates.rowSec) && s.rates.rowSec > 0 ? 7 / s.rates.rowSec : 1;
}

// ----- selection --------------------------------------------------------------------------------------

/** The goal the bar should show now (pure). */
export function selectGoal(s: IdleState): GoalView {
  return s.node.on ? nodeSelect(s) : legacySelect(s);
}

// ----- the node crawl's selection (hybrid SPEC §6.2) ------------------------------------------------------------

const mechKey = (biome: number): string => `idle.mech.${biomeDef(Math.max(0, biome - 1)).seal}`;

function nodeSelect(s: IdleState): GoalView {
  const n = s.node;
  // 1. The tutorial step or the lesson on screen (one prompt at a time).
  // The first step owns the bar from the first frame (before the tutorial's first tick begins it).
  const first = currentStep(s);
  const prompt = first && first.id === 'tapRock' ? 'tut:tapRock' : activePrompt(s);
  if (prompt.startsWith('tut:')) {
    const g = stepGoal(s, currentStep(s) as TutorialStep);
    if (g) return g;
  } else if (prompt.startsWith('lesson:')) {
    const g = lessonGoal(s, prompt.slice(7));
    if (g) return g;
  }
  // 2. Something to claim.
  if (s.offline && !s.offline.collected) return view('claim:offline', 'idle.goal.claim', {}, 1, 0, 'feast', 'claim');
  // The camp at dusk: go down the adit.
  if (n.phase === 'camp') return view('camp', 'idle.goal.camp', {}, NEAR_MIN_FILL, 2, 'adit', 'go');
  // 3. The seal: the fight (the HP and the timer live in the line's ring).
  if (n.phase === 'seal' || s.seal) {
    const st = s.seal;
    const biome = st ? st.biome : nodeAt(s.seed, n.node + 1).biome;
    if (st && st.phase === 'held') return view('seal:held', 'idle.goal.sealHeld', { seal: mechKey(biome), pct: Math.round(st.left * 100) }, Math.max(NEAR_MIN_FILL, 1 - st.left), 30, 'seal', 'seal');
    return view('seal', 'idle.goal.sealFight', { seal: mechKey(biome), s: Math.ceil(sealTimeLeft(s)) }, Math.max(NEAR_MIN_FILL, st ? 1 - st.left : 0), Math.max(1, sealTimeLeft(s)), 'seal', 'seal');
  }
  // The ride: the pass-by glints, else where it goes.
  if (n.phase === 'ride' && n.ride) {
    const v = nodeView(s);
    const left = v.ride ? v.ride.glints - v.ride.mined : 0;
    if (v.ride && v.ride.glints > 0 && left > 0) return view('ride:glints', 'idle.goal.glints', { n: v.ride.mined, of: v.ride.glints }, Math.max(NEAR_MIN_FILL, v.ride.mined / v.ride.glints), 3, 'glint', 'gem');
    return view('ride', 'idle.goal.rideDown', { m: nodeAt(s.seed, n.ride.to).depthTop }, 0.5, n.ride.seconds, '', 'go');
  }
  const seal = sealAhead(s);
  if (n.phase === 'explore') {
    const g = chamberGoal(s, seal);
    if (g) return g;
  } else if (seal && !seal.closed && seal.chambers <= 2) {
    const key = seal.chambers === 0 ? 'idle.goal.sealAhead' : seal.chambers === 1 ? 'idle.goal.sealNode1' : 'idle.goal.sealNodes';
    return view('seal:near', key, { seal: mechKey(seal.biome), n: seal.chambers }, 1 - seal.chambers / 3, etaRows(s, seal.rows), 'seal', 'seal');
  }
  // 4. Rekindle recommended [W3].
  const rk = recommend(s);
  if (rk.ok) {
    const gain = rekindleGain(s);
    const pw = powerAfter(s);
    return view('rekindle', 'idle.goal.rekindle', { n: format(gain), x: +(pw.after / pw.before).toFixed(1) }, 0.95, 5, 'sheet:lantern', 'rekindle', 'idle.reward.mult', { x: +(pw.after / pw.before).toFixed(1) });
  }
  // 7. The Path step when close.
  const p = pathStep(s);
  if (p) {
    const g = pathGoal(s, p);
    if (g.eta <= NEAR_MAX_ETA && (g.eta <= PATH_MAX_ETA || g.fill >= 0.5)) return g;
  }
  // 9. The best near goal.
  let bestG: GoalView | null = null;
  for (const g of nearGoals(s)) {
    if (g.id.startsWith('mark:')) continue; // depth marks are the drift's own fallback here
    if (g.fill < NEAR_MIN_FILL || g.fill >= 1 || g.eta > NEAR_MAX_ETA) continue;
    if (!bestG || g.fill > bestG.fill) bestG = g;
  }
  if (bestG) return bestG;
  // 10. The fallback.
  return fallbackGoal(s);
}

/** The next unopened seal ahead of the player: its biome, the chambers until its Seal hall and the rows to its row. */
function sealAhead(s: IdleState): { biome: number; chambers: number; rows: number; closed: boolean } | null {
  const i0 = s.node.node;
  for (let i = i0; i < i0 + 24; i++) {
    const t = nodeAt(s.seed, i);
    if (t.seal && i > i0 && sealPending(s, t.depthTop)) return { biome: t.biome, chambers: i - 1 - i0, rows: Math.max(0, t.depthTop - s.run.depth), closed: t.closed };
  }
  return null;
}

/** "Break through · N m" in a drift, "Go deeper" in a chamber (always ≤ 30 s away in a drift). */
function fallbackGoal(s: IdleState): GoalView {
  const n = s.node;
  if (n.phase === 'dig') {
    const t = nodeAt(s.seed, n.node);
    const left = Math.max(1, t.depth - s.run.depth);
    return view(`drift:${n.node}`, 'idle.goal.breakThrough', { m: left }, Math.max(NEAR_MIN_FILL, 1 - left / t.K), etaRows(s, left), 'face', 'tap');
  }
  return view(`go:${n.node}`, 'idle.goal.goDeeper', {}, 0.9, 5, 'exit', 'go');
}

/** What is left to do in the player's chamber (item 5), the seal from its Seal hall, the Root Knot closed. */
function chamberGoal(s: IdleState, _seal: ReturnType<typeof sealAhead>): GoalView | null {
  const n = s.node;
  const i = n.node;
  const c = n.chambers[i];
  if (!c) return null;
  if (!c.lit) return view(`enter:${i}`, 'idle.goal.enter', {}, NEAR_MIN_FILL, 2, 'enter', 'light');
  const topo = nodeAt(s.seed, i);
  // 3. The seal from its Seal hall (the Hatch: "Open the Halden Hatch"); a closed one says so once the room is done.
  const next = nodeAt(s.seed, i + 1);
  const pendingSeal = topo.exitSeal && next.seal && sealPending(s, next.depthTop);
  if (pendingSeal && !next.closed) return view(`seal:hall:${i}`, 'idle.goal.sealOpen', { seal: mechKey(next.biome) }, 0.5, 30, 'exit', 'seal');
  const con = contentsOf(s, i);
  // 5. A manual feature: chests, relics, notes, a revealed cache, a cracked geode.
  for (const id of [...con.focus, ...c.secrets.map((x) => con.caches[x]).filter(Boolean)]) {
    if (c.resolved.includes(id)) continue;
    const kind = con.sockets[id]?.kind ?? 'chest';
    const key = kind === 'relic' ? 'idle.goal.relic' : kind === 'note' || kind === 'mural' ? 'idle.goal.note' : kind === 'gems' ? 'idle.goal.cache' : 'idle.goal.chest';
    return view(`focus:${i}:${id}`, key, {}, 0.5, 4, `focus:${id}`, kind === 'relic' ? 'relic' : kind === 'note' ? 'note' : 'chest');
  }
  for (const id of con.strike) {
    const sc = con.sockets[id];
    if (sc.kind === 'geode' && (c.left[id] ?? 1) <= 0 && !c.resolved.includes(id)) return view(`focus:${i}:${id}`, 'idle.goal.geode', {}, 0.5, 4, `focus:${id}`, 'gem');
  }
  // The lamps: relight them all to chart the chamber.
  const cold = con.lamps.filter((id) => !c.lamps.includes(id));
  if (cold.length > 0) return view(`lamps:${i}`, 'idle.goal.lamps', { n: con.lamps.length - cold.length, of: con.lamps.length }, Math.max(NEAR_MIN_FILL, (con.lamps.length - cold.length) / con.lamps.length), 6, `lamp:${cold[0]}`, 'lamp');
  // The veins and clusters, until half the chamber's value is in.
  const v = nodeView(s);
  if (v.left.strike > 0 && v.harvested < 0.5) {
    const firstLeft = con.strike.find((id) => con.sockets[id].kind !== 'secret' && (c.left[id] ?? 1) > 0) ?? '';
    return view(`strike:${i}`, 'idle.goal.glow', { n: v.left.strike }, Math.max(NEAR_MIN_FILL, v.harvested * 2), 8, firstLeft ? `strike:${firstLeft}` : '', 'gem');
  }
  if (topo.exitSeal && pendingSeal && next.closed) return view(`seal:closed:${i}`, 'idle.goal.sealClosed', { seal: mechKey(next.biome) }, 1, Infinity, '', 'seal');
  return null;
}

/** A running tutorial step as the objective line. */
function stepGoal(s: IdleState, step: TutorialStep): GoalView | null {
  const target = guideTarget(s);
  switch (step.id) {
    case 'tapRock':
      return view('tut:tapRock', step.text, {}, NEAR_MIN_FILL, 2, 'face', 'tap');
    case 'buyPick': {
      const pr = price(s, 'pick', 'x1');
      return view('tut:buyPick', step.text, {}, Math.max(NEAR_MIN_FILL, goldFill(s, pr.costLog10)), etaGold(s, pr.costLog10), 'card:pick', 'pick');
    }
    case 'light': {
      const t = nodeAt(s.seed, 0);
      const left = Math.max(1, t.depth - s.run.depth);
      return view('tut:light', step.text, { m: left }, Math.max(NEAR_MIN_FILL, 1 - left / t.K), etaRows(s, left), 'breach', 'light');
    }
    case 'chest':
      return view('tut:chest', step.text, {}, 0.5, 3, target || 'focus:chest', 'chest');
    case 'go':
      return view('tut:go', step.text, {}, 0.8, 4, 'exit', 'go');
    case 'hire': {
      const pr = price(s, 'crew:0', 'x1');
      return view('tut:hire', step.text, {}, Math.max(NEAR_MIN_FILL, goldFill(s, pr.costLog10)), etaGold(s, pr.costLog10), 'card:crew:0', 'crew');
    }
    case 'hold': {
      const held = s.tap.holdSince >= 0 ? Math.max(0, s.tap.holdLast - s.tap.holdSince) : 0;
      return view('tut:hold', step.text, {}, Math.max(NEAR_MIN_FILL, held / 1.5), 2, 'face', 'tap');
    }
  }
  return null;
}

/** The lesson on screen as the objective line. */
function lessonGoal(s: IdleState, id: string): GoalView | null {
  const n = s.node;
  switch (id) {
    case 'glints': {
      const v = nodeView(s);
      if (!v.ride) return null;
      return view('lesson:glints', 'idle.goal.glints', { n: v.ride.mined, of: v.ride.glints }, Math.max(NEAR_MIN_FILL, v.ride.mined / Math.max(1, v.ride.glints)), 3, 'glint', 'gem');
    }
    case 'lamps': {
      const c = n.chambers[n.node];
      if (!c) return null;
      const con = contentsOf(s, n.node);
      const lit = con.lamps.filter((x) => c.lamps.includes(x)).length;
      const cold = con.lamps.find((x) => !c.lamps.includes(x)) ?? '';
      return view('lesson:lamps', 'idle.goal.lamps', { n: lit, of: con.lamps.length }, Math.max(NEAR_MIN_FILL, lit / Math.max(1, con.lamps.length)), 8, cold ? `lamp:${cold}` : '', 'lamp');
    }
    case 'relic': {
      const con = contentsOf(s, n.node);
      const r = con.focus.find((x) => con.sockets[x].kind === 'relic') ?? '';
      return view('lesson:relic', 'idle.goal.relic', {}, 0.5, 4, r ? `focus:${r}` : '', 'relic');
    }
    case 'dynamite':
      return view('lesson:dynamite', 'idle.goal.dynamite', {}, 0.5, 3, 'skill:dynamite', 'dynamite');
    case 'seal': {
      const st = s.seal;
      const biome = st ? st.biome : nodeAt(s.seed, n.node + 1).biome;
      return view('lesson:seal', 'idle.goal.sealFight', { seal: mechKey(biome), s: Math.ceil(sealTimeLeft(s)) }, Math.max(NEAR_MIN_FILL, st ? 1 - st.left : 0), Math.max(1, sealTimeLeft(s)), 'seal', 'seal', 'idle.reward.chest', { tier: 'idle.chest.crystal' });
    }
    case 'gear': {
      let bestL = Infinity;
      let gid = '';
      for (const g of gearOf(biomeAt(s.run.dmax))) if (!s.run.gear.includes(g.id) && g.costLog10 < bestL) {
        bestL = g.costLog10;
        gid = g.id;
      }
      return view('lesson:gear', 'idle.goal.buyGear', {}, Math.max(NEAR_MIN_FILL, goldFill(s, bestL)), etaGold(s, bestL), gid ? `card:gear:${gid}` : 'sheet:dig', 'gear', 'idle.reward.mult', { x: 3 });
    }
    case 'dark':
      return view('lesson:dark', 'idle.goal.enter', {}, NEAR_MIN_FILL, 2, 'enter', 'light');
  }
  return null;
}

// ----- the free face's selection (the closed-form sims and the older pure tests) -----------------------------------

function legacySelect(s: IdleState): GoalView {
  // 1. The tutorial step (the node tutorial does not run on the free face).
  const step = currentStep(s);
  if (step && step.text && step.id === 'tapRock') return view('tut:tapRock', step.text, {}, NEAR_MIN_FILL, 2, 'face', 'tap');
  // 2. Something to claim.
  if (s.offline && !s.offline.collected) return view('claim:offline', 'idle.goal.claim', {}, 1, 0, 'feast', 'claim');
  // 3. A never-opened seal near (or the fight itself).
  if (s.seal) {
    const w = biomeDef(s.seal.biome - 1).seal;
    return view('seal', 'idle.goal.sealFight', { seal: `idle.mech.${w}` }, Math.max(NEAR_MIN_FILL, 1 - s.seal.left), Math.max(1, s.seal.endsAt - s.time), 'seal', 'seal');
  }
  const sd = nextSealDepth(s, s.run.depth);
  const dist = sd - s.run.depth;
  if (dist > 0 && dist <= 34) {
    const eta = etaRows(s, dist);
    if (eta <= NEAR_MAX_ETA) {
      const w = biomeDef(biomeAt(sd) - 1).seal;
      return view('seal:near', 'idle.goal.seal', { seal: `idle.mech.${w}`, m: dist }, 1 - dist / 40, eta, 'seal', 'seal');
    }
  }
  // 4. Rekindle recommended.
  const rk = recommend(s);
  if (rk.ok) {
    const gain = rekindleGain(s);
    const pw = powerAfter(s);
    return view('rekindle', 'idle.goal.rekindle', { n: format(gain), x: +(pw.after / pw.before).toFixed(1) }, 0.95, 5, 'sheet:lantern', 'rekindle', 'idle.reward.mult', { x: +(pw.after / pw.before).toFixed(1) });
  }
  // 5. The Path step when close.
  // (L5 wins over §8.4's "ETA ≤ 120 s or half done": a Path step shows only while it is ≤ 90 s away.)
  const p = pathStep(s);
  if (p) {
    const g = pathGoal(s, p);
    if (g.eta <= NEAR_MAX_ETA && (g.eta <= PATH_MAX_ETA || g.fill >= 0.5)) return g;
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
  if (m.eta > 240) return view('walled', s.run.dmax >= 600 ? 'idle.goal.walledRekindle' : 'idle.goal.walled', {}, Math.max(NEAR_MIN_FILL, m.fill), m.eta, s.run.dmax >= 600 ? 'sheet:lantern' : 'sheet:dig', 'up');
  return { ...m, id: 'fallback', fill: Math.max(m.fill, 0) };
}

/** Is the current goal complete now (so the next one slides in at once)? */
function completed(s: IdleState, g: GoalView): boolean {
  if (g.id.startsWith('tut:') || g.id.startsWith('lesson:')) return activePrompt(s) !== g.id;
  if (s.node.on) {
    // Node goals complete when the line they stand for moved on (cheap: re-select and compare).
    if (/^(focus|lamps|strike|enter|seal|ride|drift|go|camp)/.test(g.id)) return nodeSelect(s).id !== g.id;
  }
  if (g.id.startsWith('mark:')) return s.run.depth >= Number(g.id.slice(5));
  if (g.id.startsWith('near:star:')) return (s.run.lines[Number(g.id.slice(10))] ?? 0) >= Number(g.params.at);
  if (g.id === 'near:pickTier') return s.run.pick >= Number(g.params.level);
  if (g.id.startsWith('near:gear:')) return s.run.gear.includes(g.id.slice(10));
  if (g.id.startsWith('path:')) return s.meta.path.step > Number(g.id.slice(5));
  if (g.id === 'seal' || g.id === 'seal:near') return !s.seal && g.id === 'seal';
  if (g.id === 'claim:offline') return !s.offline || s.offline.collected;
  if (g.id === 'rekindle') return !recommend(s).ok;
  if (g.id === 'near:rank') return s.meta.rank.r >= Number(g.params.n);
  if (g.id.startsWith('near:feat:')) return (s.meta.feats[g.id.slice(10)] ?? 0) >= Number(g.params.tier);
  if (g.id.startsWith('near:contract:')) return !s.meta.contracts[Number(g.id.slice(14))] || s.meta.contracts[Number(g.id.slice(14))].tpl !== g.key.slice(14);
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
  // Hysteresis: hold a goal 4 s unless it completed (the tutorial and the lessons always win).
  const urgent = (id: string) => id.startsWith('tut:') || id.startsWith('lesson:') || id.startsWith('seal') || id.startsWith('ride') || id.startsWith('enter');
  if (!done && s.time - gs.since < GOAL_HOLD && !urgent(next.id) && !urgent(cur.id)) {
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

