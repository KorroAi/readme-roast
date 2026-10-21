// Seals (hybrid SPEC §5.5): the first time ever at a biome boundary, the way down is a mechanism (the Halden Hatch, the
// Root Knot, a prism lock…) for a 30 s fight; seals are machines and locks, never beings. Seal HP = 20 s × (crew DPS + 4 × tap damage without crit) measured on arrival, × 0.5 for
// the Halden Hatch. Taps and the crew both apply (the crew only while the player is hitting: a seal never
// breaks in front of an idle player, L10); skills and the Surge count. The weak point lights every 5 s for 1 s: a tap
// on it (`weak:<sealId>:<i>`) hits ×5. At 25 % HP the Strike finisher appears (perfect = a ×10 hit). A fail keeps
// 50 % of the damage dealt and waits for a tap (nothing is lost, L11). Offline the crew stops here.
// Win: the seal's relic (a Find), a Crystal-floor chest, 5 gems, +150 XP, the seal card (Lore) and, from the second
// seal of a run, a facet hand. Charted gates (seals opened in an earlier run) break like hard rows: shaft.ts calls
// `chartedGate` when the floor crosses one.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { AUTHORED_BIOMES, biomeAt, biomeDef, biomeStart } from '../config/biomes';
import { XP } from '../config/rank';
import { openChest } from './chests';
import { addLore, awardFind } from './codex';
import { queueHand } from './facets';
import { addXp, creditGems } from './gain';
import { sealFailHint, sealHint } from './hints';
import { biomeSplit } from './records';
import { comboCap, comboMult, crewDpsLog10, tapBaseLog10 } from './run';
import { resetWindow, settleFloor } from './shaft';
import { CELL, COLS, type IdleState, type StrikeWidget } from './state';
import { gradeMult, openStrike, strikeStop } from './widgets';

const L10 = Math.log10;

export const SEAL = {
  /** Seconds of arrival DPS the HP is worth. */
  hpSeconds: 20,
  /** Taps per second the HP assumes (4 × tap damage). */
  taps: 4,
  /** The fight's timer (s). */
  time: 30,
  /** Damage kept after a fail. */
  kept: 0.5,
  /** The tutorial's Halden Hatch (biome 1's seal) at half HP. */
  hatchFactor: 0.5,
  /** The weak point: ×5 while lit; it lights every 5 s for 1 s; a mechanism has three (padlock, knots, facets…). */
  weakX: 5,
  weakEvery: 5,
  weakFor: 1,
  weakPoints: 3,
  /** The Strike finisher appears at this fraction left; its window (s). */
  finisherAt: 0.25,
  finisherLife: 6,
  /** The crew's strikes count on a seal only within this many seconds of the player's last hit. */
  crewWindow: 2,
  /**
   * A fighting tap's multiplier in the HP rule (1: the bare tap). The HP is the player's own DPS at arrival × hpSeconds,
   * so every seal is the same fight at any depth; a combo, crits and the weak point are the player's edge (E21).
   */
  fightTapX: 1,
  /** Rewards (SPEC §7.1): gems, the chest floor (Crystal), XP. */
  gems: 5,
  chestFloor: 2,
} as const;

/** The mechanism sealing the start of biome k (the seal at the exit of the biome above; i18n `idle.seal.<id>`). */
export function mechOf(biome: number): string {
  return biomeDef(Math.max(0, biome - 1)).seal;
}

/** The seal id of the seal opening biome k (the weak point entity ids use it): the biome index. */
export function sealId(biome: number): number {
  return biome;
}

/**
 * log10 of a seal's HP for the player's power now: 20 s of (crew DPS + 4 taps a second), the taps at the combo, crit
 * and weak-point rate a fighting player really reaches (×2 combo, ×1.2 crits, ×1.8 for the weak point lit 1 s in 5 at
 * ×5), so a player at 4–5 taps/s wins in about 12–20 s as SPEC §7.1 intends (W1's "tap without crit" let the stacked
 * weak point break a seal in two seconds).
 */
export function sealHpLog10(s: IdleState, biome: number): number {
  const crew = crewDpsLog10(s);
  const tap = tapBaseLog10(s, s.run.pick, crew) + L10(SEAL.fightTapX);
  const dps = crew === -Infinity ? tap + L10(SEAL.taps) : Math.max(crew, tap + L10(SEAL.taps)) + L10(1 + Math.pow(10, -Math.abs(crew - (tap + L10(SEAL.taps)))));
  return dps + L10(SEAL.hpSeconds) + (biome === 1 ? L10(SEAL.hatchFactor) : 0);
}

/** Seconds an active player (4 taps/s, crew helping) needs for the HP left: H5's estimate. */
export function sealEstimate(s: IdleState): number {
  const st = s.seal;
  if (!st) return 0;
  const crew = crewDpsLog10(s);
  const tap = tapBaseLog10(s, s.run.pick, crew) + L10(SEAL.fightTapX) + L10(SEAL.taps);
  const dps = crew === -Infinity ? tap : Math.max(crew, tap) + L10(1 + Math.pow(10, -Math.abs(crew - tap)));
  return Math.pow(10, st.hp.log10() + L10(Math.max(1e-9, st.left)) - dps);
}

/** The floor reached a never-opened seal: start (or keep) the fight. */
export function arriveAtSeal(s: IdleState, bus?: IdleBus): void {
  const floor = s.shaft.rows[0];
  if (floor.kinds[0] !== CELL.SEAL) {
    s.seal = null;
    return;
  }
  if (s.seal && s.seal.depth === floor.depth) return;
  const biome = biomeAt(floor.depth);
  const hp = Big.fromLog10(sealHpLog10(s, biome));
  s.seal = {
    biome, depth: floor.depth, hp, left: 1, endsAt: s.time + SEAL.time, time: SEAL.time, phase: 'fight', started: s.time,
    mech: mechOf(biome), warden: mechOf(biome), weakNext: s.time + SEAL.weakEvery, weakUntil: 0, weakIndex: 0, finisher: '', fails: 0, // `warden` the purge shim
  };
  const estimate = sealEstimate(s);
  bus?.emit('seal:start', { biome, depth: floor.depth, hp: hp.clone(), time: SEAL.time, mech: s.seal.mech, estimate });
  sealHint(s, estimate, bus);
  sealFirstTime(s, bus);
}

/** The first seal's first-time card (once). Without a bus (the offline return) it waits for the fight's start. */
function sealFirstTime(s: IdleState, bus?: IdleBus): void {
  if (!bus || s.meta.firstTime.includes('ft:seal')) return;
  s.meta.firstTime.push('ft:seal');
  bus.emit('firsttime', { id: 'seal' });
}

/**
 * The offline return stopped the crew at a never-opened seal: the seal is there, held, until the player's first tap
 * starts the fight (the timer never runs while the return feast is up).
 */
export function holdSealOnReturn(s: IdleState): void {
  if (s.shaft.rows[0].kinds[0] !== CELL.SEAL) return;
  s.seal = null;
  arriveAtSeal(s);
  const st = s.seal as IdleState['seal'];
  if (!st) return;
  st.phase = 'held';
  st.endsAt = 0;
  st.weakNext = 0;
}

/** True while the weak point is lit. */
export function weakLit(s: IdleState): boolean {
  return !!s.seal && s.seal.phase === 'fight' && s.seal.weakUntil > s.time;
}

/** The weak point's entity id now ('' when dark or no seal). */
export function weakId(s: IdleState): string {
  const st = s.seal;
  if (!st || !weakLit(s)) return '';
  return `weak:${sealId(st.biome)}:${st.weakIndex}`;
}

/**
 * A hit on the seal (taps and crew). A tap on a held seal starts the fight again at once. `weak` multiplies ×5
 * (only meaningful while lit); `finisher` marks the Strike finisher's hit.
 */
export function hitSeal(s: IdleState, dmgLog10: number, crew: boolean, bus?: IdleBus, weak = false, finisher = false): void {
  const st = s.seal;
  if (!st) return;
  // The crew helps only while the player fights (a hit in the last 2 s): first sight is the player's (L10).
  if (crew && s.time - s.hints.lastHitAt > SEAL.crewWindow) return;
  if (st.phase === 'held') {
    if (crew) return;
    st.phase = 'fight';
    st.endsAt = s.time + SEAL.time;
    st.started = s.time;
    st.weakNext = s.time + SEAL.weakEvery;
    st.weakUntil = 0;
    st.finisher = '';
    bus?.emit('seal:start', { biome: st.biome, depth: st.depth, hp: st.hp.clone(), time: SEAL.time, mech: st.mech, estimate: sealEstimate(s), retry: st.fails > 0 });
    sealFirstTime(s, bus);
  }
  const d = dmgLog10 + (weak ? L10(SEAL.weakX) : 0);
  const f = Math.pow(10, d - st.hp.log10());
  st.left = Math.max(0, st.left - f);
  bus?.emit('seal:hit', { biome: st.biome, left: st.left, dmg: Big.fromLog10(d), weak, finisher });
  if (st.left <= 0) breakSeal(s, bus);
  else if (!st.finisher && st.left <= SEAL.finisherAt && st.phase === 'fight') openFinisher(s, bus);
}

/** A tap on a weak point entity: ×5 while it is the lit one, a plain seal hit otherwise. */
export function tapWeak(s: IdleState, id: string, dmgLog10: number, bus?: IdleBus): boolean {
  const st = s.seal;
  if (!st) return false;
  const lit = weakId(s) === id;
  hitSeal(s, dmgLog10, false, bus, lit);
  return true;
}

function openFinisher(s: IdleState, bus?: IdleBus): void {
  const st = s.seal;
  if (!st) return;
  const w = openStrike(s, 'seal', SEAL.finisherLife, 1, 0.5, bus);
  s.widgets.push(w);
  st.finisher = w.id;
  bus?.emit('seal:finisher', { biome: st.biome, widget: w.id });
}

/** The finisher's needle was stopped: a hit of grade × the tap's damage (perfect ×10, good ×2). */
export function finisherStop(s: IdleState, w: StrikeWidget, bus?: IdleBus): void {
  const g = strikeStop(s, w, bus);
  const st = s.seal;
  if (!st) return;
  const tap = tapBaseLog10(s) + L10(comboMult(s.tap.combo, comboCap(s)));
  hitSeal(s, tap + L10(gradeMult(g, true)), false, bus, false, true);
}

function breakSeal(s: IdleState, bus?: IdleBus): void {
  const st = s.seal;
  if (!st) return;
  const time = s.time - st.started;
  const first = !s.meta.sealsOpened.includes(st.biome);
  if (first) s.meta.sealsOpened.push(st.biome);
  s.meta.stats.seals++;
  s.run.sealsBroken++;
  s.meta.lastUsed.seal = s.playTime;
  // Close the finisher if it is still up.
  for (const w of s.widgets) if (w.owner === 'seal' && !w.done) {
    w.done = true;
    w.result = 'skipped';
  }
  // Rewards: gems, the seal's relic, the seal card, a Crystal chest, XP, a facet hand from the second seal.
  creditGems(s, SEAL.gems, 'seal', bus, -1, st.depth);
  const page = Math.max(0, Math.min(AUTHORED_BIOMES - 1, st.biome - 1));
  // The seal's relic is the page's second relic slot (i 5: the Hatch Key, the Root Crown, the Prism Lens…); slot 4 is the
  // relic found in the biome's Reliquary niches and Lintel chests.
  const relic = awardFind(s, `find:${page}:5`, bus);
  addLore(s, `lore:${page}:seal`, bus);
  addXp(s, XP.firstSeal);
  const floor = s.shaft.rows[0];
  floor.kinds.fill(CELL.AIR);
  for (let c = 0; c < COLS; c++) floor.left[c] = 0;
  s.seal = null;
  const hand = s.run.sealsBroken >= 2;
  bus?.emit('seal:break', { biome: st.biome, depth: st.depth, time, gems: SEAL.gems, relic: relic ? `find:${page}:5` : '', xp: XP.firstSeal, hand });
  openChest(s, `seal:${st.biome}`, SEAL.chestFloor, 'seal', bus);
  if (hand) queueHand(s, bus);
  s.director.holdUntil = Math.max(s.director.holdUntil, s.time + 5);
  bus?.emit('biome:reveal', { biome: st.biome });
  s.meta.stats.reveals++;
  biomeSplit(s, st.biome, bus);
  settleFloor(s, bus, 'tap');
}

/**
 * The floor crossed a charted gate (a seal opened in an earlier run) while digging: a T3 gate flash with the split,
 * 20 XP, and a facet hand from the second gate or seal of the run. Called by shaft.ts's depth hook.
 */
export function chartedGate(s: IdleState, biome: number, bus?: IdleBus): void {
  s.run.sealsBroken++;
  s.meta.stats.gates++;
  s.meta.lastUsed.seal = s.playTime;
  addXp(s, XP.gate);
  const sp = biomeSplit(s, biome, bus);
  bus?.emit('gate:break', { biome, depth: biomeStart(biome), split: sp.time, best: sp.best, par: sp.par, green: sp.green });
  if (s.run.sealsBroken >= 2) queueHand(s, bus);
}

/** Advance the timer, the weak point and the finisher: a fail keeps half the damage dealt and waits for a tap. */
export function tickSeal(s: IdleState, bus?: IdleBus): void {
  const st = s.seal;
  if (!st) {
    // The node layer: the fight starts only when the player took the Seal hall's exit (the seal phase).
    if (s.shaft.rows[0].kinds[0] === CELL.SEAL && (!s.node.on || s.node.phase === 'seal')) arriveAtSeal(s, bus);
    return;
  }
  if (st.phase !== 'fight') return;
  // The weak point: every 5 s for 1 s, cycling the mechanism's three points.
  if (st.weakUntil > 0 && s.time >= st.weakUntil) {
    st.weakUntil = 0;
    bus?.emit('seal:weak', { biome: st.biome, lit: false, id: `weak:${sealId(st.biome)}:${st.weakIndex}`, point: st.weakIndex, until: s.time });
    st.weakIndex = (st.weakIndex + 1) % SEAL.weakPoints;
  }
  if (st.weakUntil === 0 && s.time >= st.weakNext) {
    st.weakUntil = s.time + SEAL.weakFor;
    st.weakNext = s.time + SEAL.weakEvery;
    bus?.emit('seal:weak', { biome: st.biome, lit: true, id: `weak:${sealId(st.biome)}:${st.weakIndex}`, point: st.weakIndex, until: st.weakUntil });
  }
  if (s.time >= st.endsAt) {
    const dealt = 1 - st.left;
    st.left = 1 - dealt * SEAL.kept;
    st.phase = 'held';
    st.fails++;
    st.weakUntil = 0;
    for (const w of s.widgets) if (w.owner === 'seal' && !w.done) {
      w.done = true;
      w.result = 'missed';
    }
    st.finisher = '';
    bus?.emit('seal:fail', { biome: st.biome, left: st.left, kept: SEAL.kept, pct: Math.round(st.left * 100) });
    sealFailHint(s, bus);
  }
}

/** Seconds left on the timer (0 when held). */
export function sealTimeLeft(s: IdleState): number {
  const st = s.seal;
  if (!st || st.phase !== 'fight') return 0;
  return Math.max(0, st.endsAt - s.time);
}

/** What the SealHud shows. */
export interface SealView {
  biome: number;
  /** The mechanism id (i18n `idle.seal.<id>`). */
  mech: string;
  warden: string; // = mech, read by the pre-switch HUD until the purge switch deletes it
  left: number;
  timeLeft: number;
  phase: 'fight' | 'held';
  /** The lit weak point's id ('' dark), seconds to the next lighting. */
  weak: string;
  weakIn: number;
  /** The finisher's widget id ('' none). */
  finisher: string;
  /** Seconds an active player needs for what is left (H5's colour: green < 15, amber < 25, red). */
  estimate: number;
  fails: number;
}

export function sealView(s: IdleState): SealView | null {
  const st = s.seal;
  if (!st) return null;
  return {
    warden: st.mech, // the purge shim (pre-switch HUD)
    biome: st.biome, mech: st.mech, left: st.left, timeLeft: sealTimeLeft(s), phase: st.phase, weak: weakId(s),
    weakIn: st.weakUntil > 0 ? 0 : Math.max(0, st.weakNext - s.time), finisher: st.finisher, estimate: sealEstimate(s), fails: st.fails,
  };
}

/** Debug and tests: open every seal up to and including biome k (no fight). */
export function openSealsThrough(s: IdleState, k: number): void {
  for (let b = 1; b <= k; b++) if (!s.meta.sealsOpened.includes(b)) s.meta.sealsOpened.push(b);
  resetWindow(s, s.run.depth);
  s.seal = null;
}
