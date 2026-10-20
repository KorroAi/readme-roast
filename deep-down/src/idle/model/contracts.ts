// Contracts (SPEC §7.4): always 3 on the Board (4 with the Contractor perk), each generated from a template to take
// 90–240 s at the player's live rates; one of them always points at a mechanic not used in the last 15 minutes
// (guidance in disguise). Rewards: 3–8 gems and 2 min of income; every 5th is a Grand Contract (a Crystal-floor chest,
// 15 gems and a Time Crystal). A finished contract is replaced at once (no timers); a reroll costs 2 gems.
// Progress is a counter's growth since the contract was made (`base`), so nothing has to be hooked by hand.

import type { IdleBus } from '../bus';
import { CONTRACT, CONTRACTS, type ContractDef, type ContractTpl } from '../config/contracts';
import { XP } from '../config/rank';
import { openChest } from './chests';
import { addXp, creditGems, creditSeconds, spendGems } from './gain';
import { hasPerk } from './mult';
import { nextSealDepth } from './shaft';
import type { IdleState } from './state';
import { critChance } from './run';
import { rand } from './tap';

export type Contract = IdleState['meta']['contracts'][number];

/** The counter a template tracks now (log10 of gold earned for 'gold'). */
export function counter(s: IdleState, tpl: ContractTpl): number {
  const st = s.meta.stats;
  switch (tpl) {
    case 'cells': return st.cells;
    case 'ores': return st.ores;
    case 'depth': return s.run.dmax;
    case 'catch': return s.meta.caught.targets ?? 0;
    case 'chests': return st.chests;
    case 'crits': return st.crits;
    case 'combo': return 0; // a reach: progress is the best combo since the contract was made
    case 'levels': return st.levels;
    case 'skills': return st.skills;
    case 'seal': return st.seals + st.gates;
    case 'creature': return st.creatures;
    case 'find': return st.finds;
    case 'gold': return s.run.goldEarned.log10();
    case 'perfect': return st.perfects;
    case 'planted': return st.passed;
  }
}

/** Slots on the Board. */
export function slots(s: IdleState): number {
  return CONTRACT.slots + (hasPerk(s, 'contractor') ? 1 : 0);
}

/** Live rates for the generator (per second). */
function rates(s: IdleState): { rows: number; cells: number; taps: number } {
  const rowSec = Number.isFinite(s.rates.rowSec) && s.rates.rowSec > 0 ? s.rates.rowSec : 4;
  const taps = Math.max(2, s.rates.tapsPerSec);
  return { rows: 1 / rowSec, cells: 7 / rowSec, taps };
}

function niceRound(x: number, step: number): number {
  return Math.max(step, Math.round(x / step) * step);
}

/** Can a template be offered now (unlocked, and its thing exists within reach)? */
function offerable(s: IdleState, d: ContractDef): boolean {
  if (s.run.dmax < d.unlock) return false;
  if (d.tpl === 'seal') return nextSealDepth(s, s.run.depth) - s.run.depth <= 60 || s.meta.sealsOpened.some((b) => b > 0);
  if (d.tpl === 'planted') return s.meta.planted.some((p) => p.depth > s.run.depth && p.depth - s.run.depth < 120 && !s.run.lanterns.includes(p.n));
  if (d.tpl === 'skills') return Object.keys(s.run.skills).length > 0;
  return true;
}

/** Generate a contract from `d` at the live rates, aiming at an ETA in [90, 240] s. */
export function generate(s: IdleState, d: ContractDef, grand: boolean): Contract {
  const r = rates(s);
  const eta = CONTRACT.etaMin + rand(s) * (CONTRACT.etaMax - CONTRACT.etaMin) * 0.85;
  let target = 1;
  let base = counter(s, d.tpl);
  let arg = '';
  switch (d.tpl) {
    case 'cells': target = niceRound(r.cells * eta * 0.85, d.round); break;
    case 'ores': target = niceRound(r.cells * 0.14 * eta * 0.8, d.round); break;
    case 'depth': {
      target = niceRound(r.rows * eta, d.round);
      arg = String(s.run.dmax + target);
      base = s.run.dmax;
      break;
    }
    case 'catch': target = Math.max(3, Math.round((eta / 55) * 6)); break;
    case 'chests': target = Math.max(1, Math.round(eta * r.rows / 25 + eta / 120)); break;
    case 'crits': target = niceRound(r.taps * critChance(s) * eta * 0.8, d.round); break;
    // A reach (an unbroken streak), offered at the player's rhythm: rated by its own cadence, like a seal.
    case 'combo': target = niceRound(Math.min(200, 25 + r.taps * 15), d.round); base = 0; break;
    case 'levels': {
      const per = Math.max(0.05, s.meta.stats.levels / Math.max(60, s.playTime));
      target = niceRound(per * eta, d.round);
      break;
    }
    case 'skills': target = Math.max(1, Math.round(eta / 75)); break;
    case 'gold': {
      // log10 of the gold to earn, as a target in display units: progress compares in log space.
      const inc = s.rates.goldPerSec.log10();
      target = Number.isFinite(inc) ? +(inc + Math.log10(eta)).toFixed(3) : 2;
      arg = 'log10';
      break;
    }
    default: target = d.fixed ?? 1;
  }
  return { tpl: d.tpl, target, progress: 0, base, arg, grand };
}

/** The ETA (s) of a contract at the live rates (for the goal bar and E22). */
export function contractEta(s: IdleState, c: Contract): number {
  const r = rates(s);
  const left = Math.max(0, c.target - c.progress);
  switch (c.tpl as ContractTpl) {
    case 'cells': return left / r.cells;
    case 'ores': return left / (r.cells * 0.14);
    case 'depth': return left / r.rows;
    case 'catch': return (left / 6) * 55;
    case 'chests': return left / (r.rows / 25 + 1 / 120);
    case 'crits': return left / (r.taps * critChance(s));
    case 'combo': return left > 0 ? Math.max(5, left / r.taps) : 0;
    case 'levels': return left / Math.max(0.05, s.meta.stats.levels / Math.max(60, s.playTime));
    case 'skills': return left * 75;
    case 'gold': {
      const inc = s.rates.goldPerSec.log10();
      return c.progress >= c.target ? 0 : Math.max(0, Math.pow(10, c.target - inc) - Math.pow(10, Math.max(-20, c.progress) - inc));
    }
    default: return 150;
  }
}

/** The fraction done (0..1). */
export function contractFill(c: Contract): number {
  if (c.arg === 'log10') return c.progress <= -Infinity ? 0 : Math.max(0, Math.min(1, Math.pow(10, c.progress - c.target)));
  return Math.max(0, Math.min(1, c.progress / Math.max(1e-9, c.target)));
}

/** Fill every empty slot; one contract must exercise a mechanic unused for 15 minutes when there is one. */
export function fillBoard(s: IdleState, bus?: IdleBus): void {
  const n = slots(s);
  const board = s.meta.contracts;
  for (let slot = 0; slot < n; slot++) {
    if (board[slot]) continue;
    board[slot] = pickNew(s, bus, slot);
  }
}

function unused(s: IdleState, mechanic: string): boolean {
  const t = s.meta.lastUsed[mechanic];
  return t === undefined || s.playTime - t > CONTRACT.unused;
}

function pickNew(s: IdleState, bus: IdleBus | undefined, slot: number): Contract {
  const board = s.meta.contracts;
  const held = new Set(board.filter(Boolean).map((c) => c.tpl));
  const pool = CONTRACTS.filter((d) => offerable(s, d) && !held.has(d.tpl));
  const guidance = !board.some((c, i) => c && i !== slot && unused(s, CONTRACTS.find((d) => d.tpl === c.tpl)?.mechanic ?? ''));
  const unusedPool = pool.filter((d) => unused(s, d.mechanic));
  const from = guidance && unusedPool.length ? unusedPool : pool.length ? pool : CONTRACTS.slice(0, 1);
  const d = from[Math.floor(rand(s) * from.length)];
  const grand = (s.meta.contractCount + board.filter(Boolean).length) % CONTRACT.grandEvery === CONTRACT.grandEvery - 1;
  const c = generate(s, d, grand);
  bus?.emit('contract:new', { slot, tpl: c.tpl, target: c.target, grand });
  return c;
}

/** Mark a mechanic used now (the contract generator's guidance). */
export function used(s: IdleState, mechanic: string): void {
  s.meta.lastUsed[mechanic] = s.playTime;
}

/** Update progress, complete and replace (called 4 times a second). */
export function tickContracts(s: IdleState, bus?: IdleBus): void {
  // The Board opens with its tab (after the first Warden, CRITIQUE SHOULD 9): no contract runs before.
  if (!s.meta.revealed.includes('boardTab')) return;
  if (s.meta.contracts.length < slots(s) || s.meta.contracts.some((c) => !c)) fillBoard(s, bus);
  const board = s.meta.contracts;
  for (let slot = 0; slot < board.length; slot++) {
    const c = board[slot];
    if (!c) continue;
    const before = contractFill(c);
    if (c.tpl === 'combo') c.progress = Math.max(c.progress, Math.floor(s.tap.combo));
    else if (c.tpl === 'depth') c.progress = s.run.dmax - c.base;
    else if (c.arg === 'log10') c.progress = goldSince(s, c);
    else c.progress = counter(s, c.tpl as ContractTpl) - c.base;
    const after = contractFill(c);
    if (Math.floor(after * 4) > Math.floor(before * 4) && after < 1) bus?.emit('contract:progress', { slot, progress: c.progress, target: c.target });
    if (after >= 1) complete(s, slot, bus);
  }
}

/** log10 of the gold earned since the contract was made (base holds log10 of goldEarned then). */
function goldSince(s: IdleState, c: Contract): number {
  const now = s.run.goldEarned.log10();
  if (c.base === -Infinity || !Number.isFinite(c.base)) return now;
  if (now <= c.base) return -Infinity;
  const d = now - c.base;
  return now + Math.log10(1 - Math.pow(10, -d));
}

function complete(s: IdleState, slot: number, bus?: IdleBus): void {
  const c = s.meta.contracts[slot];
  if (!c) return;
  const gems = 3 + Math.floor(rand(s) * 6);
  creditGems(s, gems, 'contract', bus);
  const gold = creditSeconds(s, CONTRACT.goldSeconds, 'contract', bus);
  if (c.grand) {
    creditGems(s, CONTRACT.grandGems, 'contract', bus);
    s.meta.timeCrystals++;
    openChest(s, `contract:${s.meta.contractCount}`, 2, 'contract', bus);
  }
  s.meta.contractCount++;
  s.meta.stats.contracts++;
  addXp(s, XP.contract);
  s.director.lastBeat = s.time;
  bus?.emit('contract:done', { id: c.tpl, grand: c.grand, slot, gems: gems + (c.grand ? CONTRACT.grandGems : 0), gold });
  s.meta.contracts[slot] = pickNew(s, bus, slot);
}

/** Reroll a contract for 2 gems. @returns success. */
export function rerollContract(s: IdleState, slot: number, bus?: IdleBus): boolean {
  if (!s.meta.contracts[slot]) return false;
  if (!spendGems(s, CONTRACT.rerollGems, 'contractReroll', bus)) return false;
  const old = s.meta.contracts[slot];
  s.meta.contracts[slot] = undefined as unknown as Contract;
  const c = pickNew(s, bus, slot);
  if (c.tpl === old.tpl) c.target = Math.max(1, Math.round(c.target * 0.9));
  s.meta.contracts[slot] = c;
  return true;
}

/** The contract nearest completion (the goal bar's near goal). */
export function nearestContract(s: IdleState): { slot: number; c: Contract; fill: number; eta: number } | null {
  let best: { slot: number; c: Contract; fill: number; eta: number } | null = null;
  s.meta.contracts.forEach((c, slot) => {
    if (!c) return;
    const fill = contractFill(c);
    if (!best || fill > best.fill) best = { slot, c, fill, eta: contractEta(s, c) };
  });
  return best;
}
