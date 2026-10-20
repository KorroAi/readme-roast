// The UI's view of the economy (SPEC §5.4–§5.6, BUILD §1): DPS, tap damage, costs, cards, buying with
// ×1 / ×10 / NEXT ★ / MAX (closed form), and BEST (the lowest payback). Pure: reads and mutates
// IdleState only; purchases emit IdleEvents on the bus given.
//
// Card ids: 'pick', 'up:<lucky|steady|shock|bellows>', 'crew:<line>', 'gear:<biome>.<kind>', 'skill:<id>'.

import { Big } from '../../core/big';
import type { BuyMode, IdleBus } from '../bus';
import { biomeAt, biomeStart } from '../config/biomes';
import { addLog, goldPerHp, hpLog10, KAPPA, rowsOfGoldLog10, subLog } from '../config/curves';
import { AUTHORED_LINES, CROWN_EVERY, crewLine, lineCostLog10, lineOutLog10, lineUnlock, STAR_EVERY } from '../config/crew';
import { gearById, gearOf, type GearDef } from '../config/gear';
import { SKILLS, skillDef } from '../config/skills';
import { COMBO, CRIT, PICK, pickTier, SURGE, UPGRADES, upgradeDef } from '../config/upgrades';
import { XP } from '../config/rank';
import { facetStats } from './facets';
import { addXp } from './gain';
import { mults } from './mult';
import type { IdleState } from './state';

const L10 = Math.log10;

export type Sheet = 'dig' | 'crew' | 'quick';
export type CardKind = 'pick' | 'upgrade' | 'crew' | 'gear' | 'skill';

/** Everything a card shows (SPEC §5.5, §10.7). */
export interface CardView {
  id: string;
  kind: CardKind;
  /** i18n key of the name and its params (crew lines carry their Echo mark). */
  nameKey: string;
  nameParams: Record<string, string | number>;
  /** One-line effect key (`idle.card.<…>.desc`) and params. */
  descKey: string;
  descParams: Record<string, string | number>;
  level: number;
  /** Levels the current mode would buy (≥ 1 unless maxed or locked). */
  levels: number;
  maxed: boolean;
  locked: boolean;
  /** Unlock depth (rows) when locked. */
  unlockDepth: number;
  /** Price of `levels` levels. */
  cost: Big;
  costLog10: number;
  /** Actual gold ≥ cost (the UI refines with the display ledger). */
  affordable: boolean;
  /** Relative gain of what this purchase improves (tap damage for the pick, line DPS, total DPS for gear). */
  delta: number;
  /** The value after the purchase (tap damage, DPS…) and what it is ('tap', 'dps', 'crit', 'hold', 'surge', 'splash'). */
  after: Big;
  unit: string;
  /** Pips to the next milestone (10 for a line, 25 for the pick in 5 groups of 5). */
  pips: { filled: number; total: number };
  /** The next milestone: ★, crown or pick tier, at `level`. */
  next: { kind: 'star' | 'crown' | 'tier' | 'none'; level: number };
  /** The lowest payback right now (one per state). */
  best: boolean;
  /** Payback seconds (cost / Δincome + wait). */
  payback: number;
  /** New since the player last saw this sheet (gear of a new biome). */
  fresh: boolean;
}

// ----- multipliers ------------------------------------------------------------------------------------

/** log10 of M_all (SPEC §5.6) for W1: Embers, planted lanterns, the Moth Frenzy and boosts. */
export function mAllLog10(s: IdleState): number {
  const kindle = 0.1 + ((s.meta.feats.emberborn ?? 0) >= 10 ? 0.01 : 0) + 0.01 * (s.meta.loom.kindling ?? 0);
  let l = embersLog10(s.meta.embers.log10(), kindle);
  if (s.run.plantedBonus > 0) l += L10(1 + s.run.plantedBonus);
  if (s.meta.boostEnd > s.now) l += L10(2);
  return l + mults(s).power;
}

/** log10(1 + kindle × Embers), exact for any Ember count (Embers past 1e300 stay finite in log space). */
function embersLog10(eLog10: number, kindle: number): number {
  if (eLog10 === -Infinity) return 0;
  const x = eLog10 + L10(kindle);
  return x > 15 ? x : L10(1 + Math.pow(10, x));
}

/** log10 of the active skill multiplier on all damage (Moth Frenzy ×7, Cataclysm ×2). */
export function skillMultLog10(s: IdleState): number {
  let l = 0;
  if (s.run.frenzyEnd > s.time) l += L10(7);
  if (s.run.cataclysmEnd > s.time) l += L10(2);
  return l;
}

function gearMults(s: IdleState): { line: number[]; pick: number; all: number } {
  const line: number[] = [];
  let pick = 0;
  let all = 0;
  for (const id of s.run.gear) {
    const g = gearById(id);
    if (!g) continue;
    const lm = L10(g.mult);
    if ('line' in g.target) line[g.target.line] = (line[g.target.line] ?? 0) + lm;
    else if ('pick' in g.target) pick += lm;
    else all += lm;
  }
  return { line, pick, all };
}

/** log10 of line i's DPS with every multiplier (−Infinity when not hired). */
export function lineDpsLog10(s: IdleState, i: number, level = s.run.lines[i] ?? 0, gm = gearMults(s)): number {
  if (level <= 0) return -Infinity;
  let l = lineOutLog10(i, level) + (gm.line[i] ?? 0) + gm.all + mAllLog10(s) + skillMultLog10(s) + mults(s).crew;
  const fs = facetStats(s);
  if (fs.newestX > 1 && i === newestHired(s)) l += L10(fs.newestX);
  return l;
}

/** The newest hired line (−1 none). */
export function newestHired(s: IdleState): number {
  for (let i = s.run.lines.length - 1; i >= 0; i--) if (s.run.lines[i] > 0) return i;
  return -1;
}

/** log10 of the overdrive multiplier on the crew (W1: the Overdrive skill when active). */
function overdriveLog10(s: IdleState): number {
  const o = s.run.skills.overdrive;
  if (!o || o.activeEnd <= s.time) return 0;
  return L10(10 + 2 * Math.max(0, o.lvl - 1));
}

/** log10 of the crew's total DPS. */
export function crewDpsLog10(s: IdleState, override?: { line: number; level: number }): number {
  const gm = gearMults(s);
  let t = -Infinity;
  for (let i = 0; i < s.run.lines.length; i++) {
    const lv = override && override.line === i ? override.level : s.run.lines[i];
    if (lv > 0) t = addLog(t, lineDpsLog10(s, i, lv, gm));
  }
  if (override && override.line >= s.run.lines.length && override.level > 0) t = addLog(t, lineDpsLog10(s, override.line, override.level, gm));
  return t + overdriveLog10(s);
}

/** The reference pick level for a depth (CRITIQUE MUST 2): where its next level costs about 3.6 rows of gold. */
export function edgeRefLevel(depth: number): number {
  return (hpLog10(depth) - 2) / L10(PICK.r) + PICK.edgeOffset;
}

/** The pick's edge: the share of the crew's DPS every tap carries (CRITIQUE MUST 2). */
export function edgeOf(level: number, depth: number, bonus = 0): number {
  const e = PICK.edgeBase * Math.pow(PICK.edgeStep, level - edgeRefLevel(depth));
  return Math.min(PICK.edgeMax, Math.max(PICK.edgeMin, e)) + bonus;
}

/** log10 of the pick's own damage at level L (100 × L × 2.5^tier × gear × M_all). */
export function pickDmgLog10(s: IdleState, level = s.run.pick): number {
  const gm = gearMults(s);
  return L10(PICK.dmg * Math.max(1, level)) + pickTier(level) * L10(PICK.tierX) + gm.pick + gm.all + mAllLog10(s) + skillMultLog10(s) + mults(s).pick;
}

/** log10 of a tap's base damage (before combo, crit and the Surge): pick + edge × crew DPS. */
export function tapBaseLog10(s: IdleState, level = s.run.pick, crewLog10 = crewDpsLog10(s)): number {
  return addLog(pickDmgLog10(s, level), L10(edgeOf(level, s.run.depth, facetStats(s).edgePts)) + crewLog10);
}

/** Crit chance (SPEC §3.2). */
export function critChance(s: IdleState, lucky = s.run.ups.lucky ?? 0): number {
  return Math.min(0.95, Math.min(CRIT.max, CRIT.base + CRIT.perLevel * lucky) + mults(s).critP);
}

/** The crit multiplier (×5; Overcharge and crit Finds raise it). */
export function critMult(s: IdleState): number {
  return CRIT.mult + mults(s).critX;
}

/** The combo multiplier for a combo count (the Crescendo facet raises the cap; pass `cap`). */
export function comboMult(combo: number, cap: number = COMBO.cap): number {
  return 1 + COMBO.perCombo * Math.min(Math.max(0, combo), cap);
}

/** The combo cap of this run (50; Crescendo +25 per facet). */
export function comboCap(s: IdleState): number {
  return COMBO.cap + mults(s).comboCap;
}

/** The combo window of this run (0.6 s; Tempo +0.3, the Rhythm perk +0.2). */
export function comboWindow(s: IdleState): number {
  return COMBO.window + mults(s).comboWindow;
}

/** Surge duration (s). */
export function surgeDuration(s: IdleState): number {
  return SURGE.duration + SURGE.perBellows * (s.run.ups.bellows ?? 0) + facetStats(s).surgeSecs;
}

/** The Surge's tap multiplier (×3; ×4 with the Rhythm 4 set). */
export function surgeMult(s: IdleState): number {
  return Math.max(SURGE.mult, facetStats(s).surgeX);
}

/**
 * log10 of the expected active DPS at `tapsPerSec` (the sim's and BEST's model, SPEC Appendix A): crew +
 * taps × min(tap × combo 1.5 × crit, cell HP). Taps never count more than one cell's HP (conservative).
 */
export function activeDpsLog10(s: IdleState, tapsPerSec: number, crewLog10 = crewDpsLog10(s), level = s.run.pick, lucky = s.run.ups.lucky ?? 0, cap = true): number {
  if (tapsPerSec <= 0) return crewLog10;
  const p = critChance(s, lucky);
  const tap = tapBaseLog10(s, level, crewLog10) + L10(1.5 * (1 + p * (critMult(s) - 1)));
  const cell = hpLog10(s.run.depth);
  return addLog(crewLog10, (cap ? Math.min(tap, cell) : tap) + L10(tapsPerSec));
}

/**
 * The game's own active DPS (no cell cap: overkill pierces and flows on, total damage conserved, SPEC
 * §3.2). BEST, the goal ETAs and the rates use it; the calibration sim keeps Appendix A's cap.
 */
export function gameDpsLog10(s: IdleState, tapsPerSec: number, crewLog10 = crewDpsLog10(s)): number {
  return activeDpsLog10(s, tapsPerSec, crewLog10, s.run.pick, s.run.ups.lucky ?? 0, false);
}

/** log10 of gold per damage (gold per HP over the row's κ: the crumble pays the whole row). */
export function goldPerDmgLog10(s?: IdleState): number {
  return L10(goldPerHp() / KAPPA) + (s ? mults(s).gold : 0);
}

// ----- costs and purchases ----------------------------------------------------------------------------

interface Priced {
  kind: CardKind;
  level: number;
  max: number;
  /** log10 of the cost of level `level` → `level` + 1 and the ratio per level. */
  c: number;
  r: number;
  locked: boolean;
  unlockDepth: number;
}

function priced(s: IdleState, id: string): Priced | null {
  const p = pricedBase(s, id);
  if (p && p.kind !== 'gear') {
    const c = mults(s).cost;
    if (c !== 0) p.c += c;
  }
  return p;
}

function pricedBase(s: IdleState, id: string): Priced | null {
  const d = s.run.dmax;
  if (id === 'pick') return { kind: 'pick', level: s.run.pick, max: Infinity, c: L10(PICK.c0) + (s.run.pick - 1) * L10(PICK.r), r: PICK.r, locked: false, unlockDepth: 0 };
  if (id.startsWith('up:')) {
    const u = upgradeDef(id.slice(3));
    if (!u) return null;
    const lv = s.run.ups[u.id] ?? 0;
    return { kind: 'upgrade', level: lv, max: u.max, c: rowsOfGoldLog10(u.costAt, u.costRows) + lv * L10(u.r), r: u.r, locked: d < u.unlock, unlockDepth: u.unlock };
  }
  if (id.startsWith('crew:')) {
    const i = Number(id.slice(5));
    if (!Number.isInteger(i) || i < 0) return null;
    const lv = s.run.lines[i] ?? 0;
    const unlock = lineUnlock(i);
    const locked = d < unlock && i >= s.meta.blueprints;
    return { kind: 'crew', level: lv, max: Infinity, c: lineCostLog10(i, lv), r: crewLine(i).r, locked, unlockDepth: unlock };
  }
  if (id.startsWith('gear:')) {
    const g = gearById(id.slice(5));
    if (!g) return null;
    const owned = s.run.gear.includes(g.id);
    // A biome's gear arrives past its gate (after the seal and the reveal, SPEC §8.2 1:18), not during the fight.
    return { kind: 'gear', level: owned ? 1 : 0, max: 1, c: g.costLog10, r: 1, locked: d < biomeStart(g.biome), unlockDepth: biomeStart(g.biome) };
  }
  if (id.startsWith('skill:')) {
    const k = skillDef(id.slice(6));
    if (!k) return null;
    // Level 1 is granted on unlock; level 2 costs 3 rows of gold at the unlock depth, ×5 per level.
    const lv = s.run.skills[k.id]?.lvl ?? 0;
    return { kind: 'skill', level: lv, max: k.maxLevel, c: rowsOfGoldLog10(k.unlock, k.costRows) + Math.max(0, lv - 1) * L10(k.costR), r: k.costR, locked: d < k.unlock || lv === 0, unlockDepth: k.unlock };
  }
  return null;
}

/** log10 of the price of n levels from the priced level (geometric sum). */
function sumLog10(p: Priced, n: number): number {
  if (n <= 0) return -Infinity;
  if (p.r === 1) return p.c + L10(n);
  const lr = L10(p.r);
  const kl = n * lr;
  return p.c + (kl > 15 ? kl : L10(Math.pow(p.r, n) - 1)) - L10(p.r - 1);
}

/** Levels the mode buys from level L (before affordability; MAX resolves against gold). */
function modeLevels(p: Priced, mode: BuyMode, goldLog10: number): number {
  const room = p.max - p.level;
  if (room <= 0) return 0;
  let n = 1;
  if (mode === 'x10') n = 10;
  else if (mode === 'star') {
    if (p.kind === 'crew') n = STAR_EVERY - (p.level % STAR_EVERY);
    else if (p.kind === 'pick') n = PICK.tierEvery - (p.level % PICK.tierEvery);
    else n = 1;
  } else if (mode === 'max') {
    // floor(log_r(1 + G(r − 1)/c)), at least 1 (shown unaffordable).
    if (p.r === 1) n = 1;
    else {
      const x = goldLog10 - p.c + L10(p.r - 1);
      const lr = L10(p.r);
      const k = x > 15 ? x / lr : L10(1 + Math.pow(10, x)) / lr;
      n = Math.max(1, Math.floor(k + 1e-9));
    }
  }
  return Math.min(n, room);
}

/** The price of a card in a mode: how many levels and their cost (log10 and Big). */
export function price(s: IdleState, id: string, mode: BuyMode = 'x1'): { levels: number; costLog10: number; cost: Big } {
  const p = priced(s, id);
  if (!p) return { levels: 0, costLog10: Infinity, cost: Big.zero() };
  const n = modeLevels(p, mode, s.run.gold.log10());
  const c = sumLog10(p, n);
  return { levels: n, costLog10: c, cost: Big.fromLog10(c) };
}

export interface BuyResult {
  ok: boolean;
  levels: number;
  cost: Big;
  reason?: 'gold' | 'locked' | 'max' | 'unknown';
}

/** Buy a card in a mode. Emits buy:done (and ★, crown, tier events) or buy:fail. */
export function buy(s: IdleState, id: string, mode: BuyMode, bus?: IdleBus): BuyResult {
  const p = priced(s, id);
  if (!p) return { ok: false, levels: 0, cost: Big.zero(), reason: 'unknown' };
  if (p.locked) {
    bus?.emit('buy:fail', { id, reason: 'locked' });
    return { ok: false, levels: 0, cost: Big.zero(), reason: 'locked' };
  }
  const n = modeLevels(p, mode, s.run.gold.log10());
  if (n <= 0) {
    bus?.emit('buy:fail', { id, reason: 'max' });
    return { ok: false, levels: 0, cost: Big.zero(), reason: 'max' };
  }
  const cLog = sumLog10(p, n);
  const goldLog = s.run.gold.log10();
  // A float guard: within 1e-9 in log10 counts as affordable (MAX computed against this gold).
  if (cLog > goldLog + 1e-9) {
    bus?.emit('buy:fail', { id, reason: 'gold' });
    return { ok: false, levels: 0, cost: Big.zero(), reason: 'gold' };
  }
  const cost = Big.fromLog10(cLog);
  s.run.gold.setLog10(subLog(goldLog, cLog));
  const from = p.level;
  const to = from + n;
  applyLevels(s, id, p, to, bus);
  s.meta.stats.purchases++;
  s.meta.stats.levels += n;
  s.meta.lastUsed.buy = s.playTime;
  addXp(s, XP.purchase);
  if (p.kind === 'pick' && pickTier(to) > pickTier(from)) addXp(s, XP.pickTier * (pickTier(to) - pickTier(from)));
  if (p.kind === 'crew') addXp(s, XP.star * (Math.floor(to / STAR_EVERY) - Math.floor(from / STAR_EVERY)));
  bus?.emit('buy:done', { id, mode, levels: n, from, to, cost: cost.clone() });
  return { ok: true, levels: n, cost };
}

function applyLevels(s: IdleState, id: string, p: Priced, to: number, bus?: IdleBus): void {
  const from = p.level;
  if (p.kind === 'pick') {
    s.run.pick = to;
    const t0 = pickTier(from);
    const t1 = pickTier(to);
    if (t1 > t0) bus?.emit('pick:tier', { tier: t1, from: t0, tiers: t1 - t0, level: to });
    return;
  }
  if (p.kind === 'upgrade') {
    s.run.ups[id.slice(3)] = to;
    return;
  }
  if (p.kind === 'crew') {
    const i = Number(id.slice(5));
    while (s.run.lines.length <= i) s.run.lines.push(0);
    s.run.lines[i] = to;
    const st0 = Math.floor(from / STAR_EVERY);
    const st1 = Math.floor(to / STAR_EVERY);
    if (st1 > st0) {
      s.meta.stats.stars += st1 - st0;
      s.run.stars += st1 - st0;
      bus?.emit('crew:star', { line: i, level: to, stars: st1 });
      const c0 = Math.floor(from / CROWN_EVERY);
      const c1 = Math.floor(to / CROWN_EVERY);
      if (c1 > c0) bus?.emit('crew:crown', { line: i, level: to, crowns: c1 });
    }
    if (from === 0 && i >= s.meta.blueprints) s.meta.blueprints = Math.max(s.meta.blueprints, i + 1);
    return;
  }
  if (p.kind === 'gear') {
    s.run.gear.push(id.slice(5));
    return;
  }
  if (p.kind === 'skill') {
    const k = id.slice(6);
    const cur = s.run.skills[k] ?? { lvl: 0, cdEnd: 0, activeEnd: 0, charges: 0 };
    cur.lvl = to;
    s.run.skills[k] = cur;
    if (from === 0) bus?.emit('skill:unlock', { id: k });
  }
}

// ----- the cards --------------------------------------------------------------------------------------

/** Every card id a sheet lists, in order (locked teasers last). */
export function cardIds(s: IdleState, sheet: Sheet): string[] {
  const d = s.run.dmax;
  if (sheet === 'crew') {
    const ids: string[] = [];
    const n = Math.max(s.run.lines.length, linesVisible(s));
    for (let i = 0; i < n; i++) ids.push(`crew:${i}`);
    return ids;
  }
  if (sheet === 'dig') {
    const ids: string[] = [];
    // Gear of the current biome first (and any unbought of the previous ones).
    const k = biomeAt(d);
    for (let b = 1; b <= k; b++) for (const g of gearOf(b)) if (!s.run.gear.includes(g.id) || b === k) ids.push(`gear:${g.id}`);
    ids.push('pick');
    for (const u of UPGRADES) ids.push(`up:${u.id}`);
    for (const sk of SKILLS) ids.push(`skill:${sk.id}`);
    return ids;
  }
  return quickSlots(s).filter((x) => x !== '');
}

/** Lines shown in the Crew sheet: every unlocked line plus the next one as a teaser. */
function linesVisible(s: IdleState): number {
  let n = 0;
  while (lineUnlock(n) <= s.run.dmax || n < s.meta.blueprints) n++;
  return n + 1;
}

/** The three quick-buy slots (SPEC §9.1): [PICK] [★ BEST] [CREW: the newest hired or unlocked line]. */
export function quickSlots(s: IdleState): [string, string, string] {
  const b = best(s) ?? '';
  let crew = '';
  for (let i = s.run.lines.length - 1; i >= 0 && !crew; i--) if (s.run.lines[i] > 0) crew = `crew:${i}`;
  // The newest unlocked but unhired line takes the slot once affordable-ish (its card is the news).
  let newest = 0;
  while (lineUnlock(newest + 1) <= s.run.dmax || newest + 1 < s.meta.blueprints) newest++;
  if ((s.run.lines[newest] ?? 0) === 0) crew = `crew:${newest}`;
  if (!crew) crew = 'crew:0';
  return ['pick', b === 'pick' || b === crew ? '' : b, crew];
}

/** One card's view. */
export function card(s: IdleState, id: string, mode: BuyMode = 'x1', bestId: string | null = best(s)): CardView | null {
  const p = priced(s, id);
  if (!p) return null;
  const pr = price(s, id, mode);
  const levels = pr.levels;
  const v: CardView = {
    id,
    kind: p.kind,
    nameKey: '',
    nameParams: {},
    descKey: '',
    descParams: {},
    level: p.level,
    levels,
    maxed: p.level >= p.max,
    locked: p.locked,
    unlockDepth: p.unlockDepth,
    cost: pr.cost,
    costLog10: pr.costLog10,
    affordable: !p.locked && levels > 0 && pr.costLog10 <= s.run.gold.log10() + 1e-9,
    delta: 0,
    after: Big.zero(),
    unit: 'dps',
    pips: { filled: 0, total: 10 },
    next: { kind: 'none', level: 0 },
    best: bestId === id,
    payback: Infinity,
    fresh: false,
  };
  const n = Math.max(1, levels);
  if (p.kind === 'pick') {
    v.nameKey = 'idle.card.pick';
    v.descKey = 'idle.card.pick.desc';
    const now = tapBaseLog10(s, p.level);
    const after = tapBaseLog10(s, p.level + n);
    v.delta = Math.pow(10, after - now) - 1;
    v.after = Big.fromLog10(after);
    v.unit = 'tap';
    v.descParams = { edge: Math.round(edgeOf(p.level, s.run.depth) * 100) };
    v.pips = { filled: p.level % PICK.tierEvery, total: PICK.tierEvery };
    v.next = { kind: 'tier', level: (Math.floor(p.level / PICK.tierEvery) + 1) * PICK.tierEvery };
  } else if (p.kind === 'crew') {
    const i = Number(id.slice(5));
    const def = crewLine(i);
    v.nameKey = `idle.crew.${def.id}`;
    v.nameParams = { mk: i >= AUTHORED_LINES ? 1 + Math.floor((i - AUTHORED_LINES) / AUTHORED_LINES) + 1 : 0 };
    v.descKey = 'idle.card.crew.desc';
    const gm = gearMults(s);
    const now = lineDpsLog10(s, i, p.level, gm);
    const after = lineDpsLog10(s, i, p.level + n, gm);
    v.delta = now === -Infinity ? Infinity : Math.pow(10, after - now) - 1;
    v.after = Big.fromLog10(after);
    v.pips = { filled: p.level % STAR_EVERY, total: STAR_EVERY };
    const nextStar = (Math.floor(p.level / STAR_EVERY) + 1) * STAR_EVERY;
    v.next = { kind: nextStar % CROWN_EVERY === 0 ? 'crown' : 'star', level: nextStar };
  } else if (p.kind === 'gear') {
    const g = gearById(id.slice(5)) as GearDef;
    v.nameKey = `idle.gear.${g.kind}`;
    v.nameParams = { biome: `idle.biome.${biomeIdOf(g.biome)}` };
    v.descKey = `idle.gear.${g.kind}.desc`;
    v.descParams = 'line' in g.target ? { line: `idle.crew.${crewLine(g.target.line).id}`, x: g.mult } : { x: g.mult };
    v.maxed = s.run.gear.includes(g.id);
    v.delta = g.mult - 1;
    v.unit = 'line' in g.target ? 'line' : 'pick' in g.target ? 'tap' : 'all';
    v.pips = { filled: v.maxed ? 1 : 0, total: 1 };
  } else if (p.kind === 'upgrade') {
    const u = id.slice(3);
    v.nameKey = `idle.up.${u}`;
    v.descKey = `idle.up.${u}.desc`;
    v.unit = u;
    v.pips = { filled: p.level % 10, total: Math.min(10, Number.isFinite(p.max) ? p.max : 10) };
    if (u === 'lucky') {
      const c0 = critChance(s, p.level);
      const c1 = critChance(s, p.level + n);
      const cm = critMult(s);
      v.delta = (1 + c1 * (cm - 1)) / (1 + c0 * (cm - 1)) - 1;
      v.descParams = { pct: Math.round(c1 * 100) };
    } else v.delta = 0.1;
  } else if (p.kind === 'skill') {
    const k = id.slice(6);
    v.nameKey = `idle.skill.${k}`;
    v.descKey = `idle.skill.${k}.desc`;
    v.unit = 'skill';
    v.pips = { filled: p.level, total: Number.isFinite(p.max) ? p.max : 10 };
    v.delta = p.level === 0 ? Infinity : 0.1;
  }
  v.payback = paybackOf(s, id);
  return v;
}

/** The cards of a sheet. */
export function cards(s: IdleState, sheet: Sheet, mode: BuyMode = 'x1'): CardView[] {
  const b = best(s);
  const out: CardView[] = [];
  for (const id of cardIds(s, sheet)) {
    const c = card(s, id, mode, b);
    if (c) out.push(c);
  }
  return out;
}

function biomeIdOf(k: number): string {
  return BIOME_IDS[Math.min(BIOME_IDS.length - 1, k)] ?? 'topsoil';
}
const BIOME_IDS = ['topsoil', 'glowroot', 'crystal', 'halden', 'fungal', 'drowned', 'magma', 'fossil', 'frost', 'loom', 'ironCore', 'starHeart', 'voidSea', 'gate'];

// ----- BEST (SPEC §5.5 item 3) ------------------------------------------------------------------------

/** The tap rate BEST assumes (the sim's 5/s; the Surge and skills are margin). */
export const BEST_TAPS = 5;
/** BEST values crew gains ×1.3 like the calibration bot: the crew also digs while you are away. */
export const BEST_CREW_BIAS = 1.3;

/** log10 of gold/s at the current rates. */
export function incomeLog10(s: IdleState, tapsPerSec = BEST_TAPS): number {
  return gameDpsLog10(s, tapsPerSec) + goldPerDmgLog10(s);
}

/** The candidates BEST and the bot compare: one level of every unlocked, buyable card. */
export function candidates(s: IdleState): string[] {
  const ids = ['pick'];
  for (const u of UPGRADES) if (u.id === 'lucky' && s.run.dmax >= u.unlock && (s.run.ups.lucky ?? 0) < u.max) ids.push('up:lucky');
  const n = linesVisible(s) - 1;
  for (let i = 0; i < n; i++) ids.push(`crew:${i}`);
  const k = biomeAt(s.run.dmax);
  for (let b = 1; b <= k; b++) for (const g of gearOf(b)) if (!s.run.gear.includes(g.id)) ids.push(`gear:${g.id}`);
  return ids;
}

/**
 * log10 of the active DPS gain of one purchase of `id` (×1) at `tapsPerSec`; crew gains are valued
 * ×crewBias (they work offline; Appendix A's 1.3).
 */
export function gainLog10(s: IdleState, id: string, tapsPerSec = BEST_TAPS, crewBias = 1.3): number {
  const crew = crewDpsLog10(s);
  const base = addLog(crew + L10(crewBias), tapPartLog10(s, tapsPerSec, crew));
  let after: number;
  if (id === 'pick') {
    after = addLog(crew + L10(crewBias), tapPartLog10(s, tapsPerSec, crew, s.run.pick + 1));
  } else if (id === 'up:lucky') {
    after = addLog(crew + L10(crewBias), tapPartLog10(s, tapsPerSec, crew, s.run.pick, (s.run.ups.lucky ?? 0) + 1));
  } else if (id.startsWith('crew:')) {
    const i = Number(id.slice(5));
    const c2 = crewDpsLog10(s, { line: i, level: (s.run.lines[i] ?? 0) + 1 });
    after = addLog(c2 + L10(crewBias), tapPartLog10(s, tapsPerSec, c2));
  } else if (id.startsWith('gear:')) {
    const g = gearById(id.slice(5));
    if (!g) return -Infinity;
    s.run.gear.push(g.id);
    const c2 = crewDpsLog10(s);
    after = addLog(c2 + L10(crewBias), tapPartLog10(s, tapsPerSec, c2));
    s.run.gear.pop();
  } else return -Infinity;
  return subLog(after, base);
}

/** log10 of the taps' share of the game's active DPS: taps × tap × 1.5 (combo) × crit (overkill flows on). */
function tapPartLog10(s: IdleState, tapsPerSec: number, crewLog10: number, level = s.run.pick, lucky = s.run.ups.lucky ?? 0): number {
  if (tapsPerSec <= 0) return -Infinity;
  const p = critChance(s, lucky);
  const tap = tapBaseLog10(s, level, crewLog10) + L10(1.5 * (1 + p * (critMult(s) - 1)));
  return tap + L10(tapsPerSec);
}

/** Payback seconds of one level of `id`: cost / Δincome + max(0, cost − gold) / income. */
export function paybackOf(s: IdleState, id: string): number {
  const p = priced(s, id);
  if (!p || p.locked || p.level >= p.max) return Infinity;
  const g = gainLog10(s, id, BEST_TAPS, BEST_CREW_BIAS);
  if (g === -Infinity) return Infinity;
  const dIncome = g + goldPerDmgLog10(s);
  const inc = incomeLog10(s);
  const gold = s.run.gold.log10();
  const wait = p.c > gold ? Math.pow(10, subLog(p.c, gold) - inc) : 0;
  return Math.pow(10, p.c - dIncome) + wait;
}

/** The BEST card: the lowest payback among the candidates (null before two options compete). */
export function best(s: IdleState): string | null {
  let bestId: string | null = null;
  let bestP = Infinity;
  let count = 0;
  for (const id of candidates(s)) {
    const p = paybackOf(s, id);
    if (!Number.isFinite(p)) continue;
    count++;
    if (p < bestP) {
      bestP = p;
      bestId = id;
    }
  }
  return count >= 2 ? bestId : null;
}

/** The buy modes on offer (SPEC §5.5 item 4): ×1 until the first ★; then ×1 / ×10 / NEXT ★ / MAX. */
export function buyModes(s: IdleState): BuyMode[] {
  return s.meta.stats.stars > 0 ? ['x1', 'x10', 'star', 'max'] : ['x1'];
}

/** The default mode: NEXT ★ after the first ★, MAX after the first Rekindle. */
export function defaultMode(s: IdleState): BuyMode {
  if (s.meta.stats.rekindles > 0) return 'max';
  return s.meta.stats.stars > 0 ? 'star' : 'x1';
}

/** Cache the rates the UI and goals read every frame (called by step every 0.25 s). */
export function refreshRates(s: IdleState, tapsPerSec: number): void {
  const crew = crewDpsLog10(s);
  s.rates.crewDps.setLog10(crew);
  const p = critChance(s);
  s.rates.tapDmg.setLog10(tapBaseLog10(s, s.run.pick, crew) + L10(comboMult(s.tap.combo, comboCap(s))) + 0 * p);
  const act = gameDpsLog10(s, tapsPerSec, crew);
  s.rates.goldPerSec.setLog10(act + goldPerDmgLog10(s));
  s.rates.rowSec = act === -Infinity ? Infinity : Math.pow(10, L10(KAPPA * 7) + hpLog10(s.run.depth) - act);
  s.rates.tapsPerSec = tapsPerSec;
}

