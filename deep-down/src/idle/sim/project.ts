// The projection (SPEC §5.9 "You will pass 1,624 m in about 3 min"; CRITIQUE MUST 6's par): a fast, pure run of the
// calibration bot from a fresh run with the meta of a given state (Embers, Finds, Marks, rank, perks, opened seals),
// stepped with the closed form (rowsForWork) so a whole hour costs a few milliseconds. It powers the Rekindle screen's
// promise, the recommend rule's preview and the par the ghost lantern races.

import { Big } from '../../core/big';
import { CHEST_EVERY } from '../config/cells';
import { addLog, rowCostLog10, rowsForWork, subLog } from '../config/curves';
import { START_LEVELS } from '../config/prestige';
import { activeDpsLog10, buy, crewDpsLog10, goldPerDmgLog10, price } from '../model/run';
import { newMeta, type IdleState } from '../model/state';
import { createIdle, newRun } from '../model/step';
import { BOT_DEFAULT, botCandidates } from './bot';

const L10 = Math.log10;

export interface Projection {
  /** Depth every `every` seconds from 0. */
  samples: number[];
  every: number;
  /** Seconds to pass `target` (Infinity when not within `secs`). */
  passAt: number;
  /** The depth at the end. */
  depth: number;
}

/**
 * A fresh run with `src`'s meta (Embers overridden by `embers` when given) at `taps`/s, for at most `secs` seconds or
 * until `target` is passed (then `extra` more seconds). Pure: `src` is not modified.
 */
export function projectRun(src: IdleState, opts: { embers?: Big; secs?: number; target?: number; extra?: number; taps?: number; every?: number; dt?: number } = {}): Projection {
  const secs = opts.secs ?? 3600;
  const target = opts.target ?? Infinity;
  const extra = opts.extra ?? 0;
  const taps = opts.taps ?? 5;
  const every = opts.every ?? 30;
  const dt = opts.dt ?? 2;
  const s = createIdle(src.seed, 0);
  copyMeta(src, s);
  if (opts.embers) s.meta.embers = opts.embers.clone();
  s.meta.tutorial.done = true;
  s.tutorial.done = true;
  s.run = newRun();
  applyStartPerks(s);
  const samples: number[] = [0];
  let passAt = Infinity;
  let t = 0;
  let frac = 0;
  let nextSample = every;
  let nextBuy = 0;
  for (let guard = 0; guard < 200000 && t < secs; guard++) {
    const crew = crewDpsLog10(s);
    const dps = activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, false);
    if (dps > -Infinity) {
      const from = s.run.depth;
      const w = addLog(dps + L10(dt), frac > 0 ? rowCostLog10(from) + L10(frac) : -Infinity);
      const res = rowsForWork(from, w);
      const to = from + res.rows;
      frac = res.frac;
      // Gold for the work (chest cells ≈ 30 s of income each).
      let gL = dps + L10(dt) + goldPerDmgLog10(s);
      const chests = Math.floor(to / CHEST_EVERY) - Math.floor(from / CHEST_EVERY);
      if (chests > 0) gL = addLog(gL, dps + goldPerDmgLog10(s) + L10(30 * chests));
      s.run.gold.addIn(Big.fromLog10(gL));
      s.run.depth = to;
      if (to > s.run.dmax) s.run.dmax = to;
    }
    t += dt;
    if (t >= nextBuy) {
      fastBuy(s, taps);
      nextBuy = t + dt;
    }
    while (t >= nextSample) {
      samples.push(s.run.depth);
      nextSample += every;
    }
    if (passAt === Infinity && s.run.depth > target) {
      passAt = t;
      if (extra <= 0) break;
    }
    if (passAt !== Infinity && t > passAt + extra) break;
  }
  return { samples, every, passAt, depth: s.run.depth };
}

/**
 * The projection's buyer: the calibration bot's rule (best valued ΔDPS / cost, crew ×1.3) in chunks (×10 levels, a
 * gear card whole), so an hour of buying is a few hundred decisions, not thousands (the Rekindle screen's 30 ms).
 */
function fastBuy(s: IdleState, taps: number): void {
  for (let k = 0; k < 24; k++) {
    const crew = crewDpsLog10(s);
    const base = valued(s, taps, crew);
    let bestId = '';
    let bestScore = -Infinity;
    const gold = s.run.gold.log10();
    for (const id of botCandidates(s, BOT_DEFAULT)) {
      const mode = id.startsWith('gear:') ? 'x1' : 'x10';
      const pr = price(s, id, mode);
      if (!(pr.costLog10 <= gold + 1e-9) || pr.levels <= 0) continue;
      const g = chunkGain(s, id, pr.levels, taps, base);
      if (g === -Infinity) continue;
      const sc = g - pr.costLog10;
      if (sc > bestScore) {
        bestScore = sc;
        bestId = id;
      }
    }
    if (!bestId) return;
    if (!buy(s, bestId, bestId.startsWith('gear:') ? 'x1' : 'x10').ok) return;
  }
}

function valued(s: IdleState, taps: number, crew = crewDpsLog10(s)): number {
  const act = activeDpsLog10(s, taps, crew, s.run.pick, s.run.ups.lucky ?? 0, false);
  return addLog(crew + L10(1.3), subLog(act, crew));
}

function chunkGain(s: IdleState, id: string, n: number, taps: number, base: number): number {
  let v: number;
  if (id === 'pick') {
    s.run.pick += n;
    v = valued(s, taps);
    s.run.pick -= n;
  } else if (id.startsWith('crew:')) {
    const i = Number(id.slice(5));
    while (s.run.lines.length <= i) s.run.lines.push(0);
    s.run.lines[i] += n;
    v = valued(s, taps);
    s.run.lines[i] -= n;
  } else if (id.startsWith('gear:')) {
    s.run.gear.push(id.slice(5));
    v = valued(s, taps);
    s.run.gear.pop();
  } else return -Infinity;
  return subLog(v, base);
}

/** The meta a projection needs (multipliers and perks), copied by value. */
function copyMeta(src: IdleState, dst: IdleState): void {
  const m = src.meta;
  const d = newMeta();
  d.embers = m.embers.clone();
  d.embersMax = m.embersMax.clone();
  d.threads = m.threads.clone();
  d.loom = { ...m.loom };
  d.sealsOpened = [...m.sealsOpened];
  d.biomesSeen = [...m.biomesSeen];
  d.finds = { ...m.finds };
  d.bestiary = { ...m.bestiary };
  d.lore = [...m.lore];
  d.biomeSeals = [...m.biomeSeals];
  d.feats = { ...m.feats };
  d.marks = m.marks;
  d.rank = { ...m.rank };
  d.blueprints = m.blueprints;
  d.record = m.record;
  d.stats = { ...m.stats };
  dst.meta = d;
}

/** The start-of-run perks (10 Embers: Shovel Hand 10 and Pick 10; Forgemaster X: pick tier 2). */
export function applyStartPerks(s: IdleState): void {
  const e = s.meta.embersMax.toNumber();
  if (e >= 10) {
    s.run.pick = Math.max(s.run.pick, START_LEVELS.pick);
    while (s.run.lines.length < 1) s.run.lines.push(0);
    s.run.lines[0] = Math.max(s.run.lines[0], START_LEVELS.shovel);
  }
  if ((s.meta.feats.forgemaster ?? 0) >= 10) s.run.pick = Math.max(s.run.pick, 50);
}
