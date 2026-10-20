// One fixed step of the whole model (SPEC §12.2 step 2): taps → resolveTap, crew strikes, crumbles,
// the seal, skills, the Surge, the Lucky Moth, unlocks, the tutorial, goals and hints. The game calls
// `stepIdle` at 60 Hz (≤ 4 steps a frame); the sim and the tests call it with any dt (≤ 0.5 s keeps the
// impact frames exact; larger jumps go through `advanceIdle`, the closed form).

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { biomeAt, biomeStart } from '../config/biomes';
import { lineUnlock } from '../config/crew';
import { gearOf } from '../config/gear';
import { SKILLS } from '../config/skills';
import { ensureCrewClock, stepCrew } from './crew';
import { tickGoals, initGoals } from './goals';
import { tickHints } from './hints';
import { tickMoth } from './moth';
import { tapEntity } from './entities';
import { newDirector, tickDirector } from './director';
import { tickContracts } from './contracts';
import { tickDaily } from './daily';
import { facetStats, tickFacets } from './facets';
import { flagSecret, tickFeats } from './feats';
import { invalidateMults } from './mult';
import { tickPrestige } from './prestige';
import { tickRank } from './rank';
import { tickRecords } from './records';
import { pickTier } from '../config/upgrades';
import { comboCap, refreshRates } from './run';
import { tickSeal } from './seals';
import { resetWindow, tickCrumbles, weakestCell } from './shaft';
import { tickSkills } from './skills';
import { type IdleState, newMeta, runSeedOf } from './state';
import { resolveTap, tickCombo, tickSurge, type ModelTap } from './tap';
import { initTutorial, tickTutorial } from './tutorial';

export type { ModelTap } from './tap';

/** The model's fixed step (s). */
export const STEP_DT = 1 / 60;

/** A brand-new game at the surface (SPEC §8.2: the first launch goes straight into the shaft). */
export function createIdle(seed: number, now: number): IdleState {
  const s: IdleState = {
    v: 3,
    seed: seed >>> 0,
    runIndex: 0,
    runSeed: runSeedOf(seed >>> 0, 0),
    time: 0,
    playTime: 0,
    now,
    monotonicMs: now,
    run: newRun(),
    meta: newMeta(),
    shaft: { rows: [] },
    tap: { combo: 0, lastHit: -Infinity, decayAt: 0, tierShown: 0, surge: 0, surgeEnd: 0, surgeArmedAt: 0, rng: ((seed >>> 0) ^ 0xa5a5a5a5) >>> 0 || 1, hitsThisSecond: 0, secondStart: 0, drum: 0, peak: 0 },
    seal: null,
    goals: initGoals(),
    tutorial: initTutorial(),
    hints: { lastShown: -Infinity, lastHitAt: 0, bestReadySince: -1, bestReadyId: '' },
    offline: null,
    chests: [],
    moth: null,
    nextMothAt: Infinity,
    nextId: 1,
    crewT0: [],
    crewPending: [],
    rates: { crewDps: Big.zero(), tapDmg: Big.zero(), goldPerSec: Big.zero(), rowSec: Infinity, tapsPerSec: 0 },
    director: newDirector(),
    event: null,
    widgets: [],
    hand: null,
    overrides: [],
    hits: {},
    xpPending: 0,
    nextCheck: 0,
    crewRows: 0,
    opts: { autoFacets: false },
  };
  resetWindow(s, 0);
  refreshRates(s, 0);
  return s;
}

/** A fresh run state (depth 0, Pick 1, nothing hired). */
export function newRun(): IdleState['run'] {
  return {
    depth: 0,
    dmax: 0,
    gold: Big.zero(),
    goldEarned: Big.zero(),
    pick: 1,
    ups: {},
    lines: [],
    gear: [],
    skills: {},
    runTime: 0,
    rack: [],
    ghost: [],
    plantedBonus: 0,
    frenzyEnd: 0,
    cataclysmEnd: 0,
    boosts: {},
    facets: [],
    hands: 0,
    freeReroll: true,
    used: [],
    lanterns: [],
    sealsBroken: 0,
    splits: {},
    par: [],
    ghostPassed: -1,
    taps: 0,
    cells: 0,
    rows: 0,
    chests: 0,
    stars: 0,
  };
}

/**
 * One fixed step: `dt` seconds (1/60 in the game), the counted taps of this step, events on `bus`.
 * `nowMs` (epoch) advances the wall clock for daily items and the save (defaults to + dt).
 */
export function stepIdle(s: IdleState, dt: number, taps: readonly ModelTap[], bus?: IdleBus, nowMs?: number): void {
  s.time += dt;
  s.playTime += dt;
  s.run.runTime += dt;
  const wall = nowMs ?? s.now + dt * 1000;
  s.now = wall;
  if (wall > s.monotonicMs) s.monotonicMs = wall;
  // 1. Taps, in order.
  for (const tp of taps) {
    if (tp.entity) {
      tapEntity(s, tp.entity, bus);
      continue;
    }
    resolveTap(s, tp.col, tp.kind, bus);
  }
  // A running estimate of the tap rate (exponential, τ 3 s) for rates and ETAs.
  let counted = 0;
  for (const tp of taps) if (!tp.entity) counted++;
  const est = s.rates.tapsPerSec + (counted / Math.max(dt, 1e-6) - s.rates.tapsPerSec) * Math.min(1, dt / 3);
  // 2. The crew, the crumble, the seal, skills, the combo, the Surge, the moth, the Director, boosts.
  stepCrew(s, dt, bus);
  tickCrumbles(s, bus);
  tickSeal(s, bus);
  tickSkills(s, bus);
  tickCombo(s, bus);
  tickSurge(s, bus);
  tickDrum(s, dt, bus);
  tickMoth(s, dt, bus);
  tickDirector(s, dt, bus);
  tickBoosts(s, bus);
  // 3. Unlocks from depth.
  unlocks(s, bus);
  // 4. Rates (every step is cheap enough: a few logs), guidance.
  refreshRates(s, Math.max(0, Math.min(8, est)));
  tickTutorial(s, bus);
  tickGoals(s, bus);
  tickHints(s, bus);
  // 5. Progression, four times a second: Feats, rank, contracts, records, the daily chest, prestige, facets.
  if (s.time >= s.nextCheck) {
    s.nextCheck = s.time + 0.25;
    tickProgress(s, wall, bus);
  }
}

/** The 0.25 s progression checks (also run by the sims at their own step). */
export function tickProgress(s: IdleState, wallMs: number, bus?: IdleBus): void {
  const tier = pickTier(s.run.pick);
  if (tier > s.meta.bestTier) s.meta.bestTier = tier;
  let hired = 0;
  for (const lv of s.run.lines) if (lv > 0) hired++;
  if (hired > s.meta.bestLines) s.meta.bestLines = hired;
  tickFeats(s, bus);
  tickRank(s, bus);
  tickContracts(s, bus);
  tickRecords(s, bus);
  tickDaily(s, wallMs, bus);
  tickPrestige(s, bus);
  tickFacets(s, s.opts.autoFacets, bus);
  if (s.meta.tutorial.done && (new Date(wallMs).getHours() < 4)) flagSecret(s, 'nightOwl');
}

/** Timed boosts end (Supply Rope picks, a Lantern Storm, Cataclysm, Lantern Oil): boost:end. */
function tickBoosts(s: IdleState, bus?: IdleBus): void {
  for (const id in s.run.boosts) {
    if (s.run.boosts[id].end <= s.time) {
      delete s.run.boosts[id];
      invalidateMults(s);
      bus?.emit('boost:end', { id });
    }
  }
  if (s.run.cataclysmEnd > 0 && s.run.cataclysmEnd <= s.time) {
    s.run.cataclysmEnd = 0;
    bus?.emit('boost:end', { id: 'cataclysm' });
  }
}

/** Drumline: +1 auto-tap a second per 25 combo (hits the floor's weakest cell as a hold). */
function tickDrum(s: IdleState, dt: number, bus?: IdleBus): void {
  const per = facetStats(s).drumPer;
  if (per <= 0 || s.tap.combo < 25 || s.time - s.hints.lastHitAt > 1.2) return;
  // Per 25 combo up to the run's combo cap (the count runs on past the cap; the drum, like the multiplier, does not).
  s.tap.drum += per * Math.floor(Math.min(s.tap.combo, comboCap(s)) / 25) * dt;
  while (s.tap.drum >= 1) {
    s.tap.drum -= 1;
    const c = weakestCell(s);
    if (c >= 0) resolveTap(s, c, 'hold', bus);
  }
}

/** What the depth unlocks: crew lines, gear cards, skills (SPEC §6.5 table, §8.3). */
export function unlocks(s: IdleState, bus?: IdleBus): void {
  const d = s.run.dmax;
  // Crew lines: an event the first time each line's depth is reached in this run.
  while (lineUnlock(s.crewT0.length) <= d) {
    const i = s.crewT0.length;
    ensureCrewClock(s, i);
    if (i > 0) bus?.emit('crew:unlock', { line: i, blueprint: i < s.meta.blueprints });
  }
  // Gear: four cards at each biome start from biome 1.
  const k = biomeAt(d);
  const seenKey = `gear:${k}`;
  if (k >= 1 && !s.meta.firstTime.includes(seenKey) && d >= biomeStart(k)) {
    s.meta.firstTime.push(seenKey);
    bus?.emit('gear:new', { biome: k, ids: gearOf(k).map((g) => g.id) });
  }
  // Skills: level 1 free on unlock; Dynamite's first use is free in the tutorial.
  for (const sk of SKILLS) {
    if (d >= sk.unlock && !s.run.skills[sk.id]) {
      s.run.skills[sk.id] = { lvl: 1, cdEnd: 0, activeEnd: 0, charges: sk.id === 'dynamite' && !s.meta.tutorial.done ? 1 : 0 };
      bus?.emit('skill:unlock', { id: sk.id });
    }
  }
}

/** A new run (Rekindle, W2): keeps meta, resets the run and the shaft. */
export function startRun(s: IdleState): void {
  s.runIndex++;
  s.runSeed = runSeedOf(s.seed, s.runIndex);
  s.run = newRun();
  s.crewT0 = [];
  s.seal = null;
  s.chests = [];
  s.event = null;
  s.widgets = [];
  s.hand = null;
  s.overrides = [];
  s.hits = {};
  invalidateMults(s);
  resetWindow(s, 0);
}

/** The model time of a fresh state (tests). */
export function freshMeta(): IdleState['meta'] {
  return newMeta();
}
