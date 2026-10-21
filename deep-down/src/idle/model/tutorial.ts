// The tutorial and the lesson sequencer (hybrid SPEC §6.3–§6.4, L13; BUILD §3.1 MUST 6), pure.
//
// Six steps taught by doing, in the node crawl: Tap (the adit plug) → Buy (the Pick card) → Light (the breach leaking
// dusk, then the chest in the Root Cellar's lantern pool) → Go (the rope ladder) → Hire (the Shovel Hand from BEST) →
// Hold (keep digging). One verb at a time, one line ≤ 8 words, one amber rim on the thing itself, no modal, nothing
// pauses, it cannot be failed: every step has a fallback (the rim brightens, a first-time card, the ghost hand once on
// step 1, the Pick buys itself after two), and a step the player does before its prompt is skipped unseen.
//
// After the six steps, each mechanic arrives as a **lesson**: an objective line plus one 2.5 s first-time card at the
// moment it first matters (the lamps in the Lamp Room, the relic ring in the Reliquary niche, Dynamite at 30 m, the seal
// in the Lift Bottom, gear after the reveal, the first dark mouth in Glowroot). The sequencer holds a lesson until no
// other prompt is on screen and the spacing allows it: ≥ 40 s after the previous new mechanic before 3:00 of play, ≥ 60 s
// after (the opening pair, the tap and the Pick card, is exempt). Never two prompts at once.

import type { IdleBus } from '../bus';
import { crewLine } from '../config/crew';
import { PICK } from '../config/upgrades';
import { contentsOf } from './nodes';
import { nodeAt } from './chart';
import { best, buy } from './run';
import { cooldownLeft } from './skills';
import type { IdleState, TutorialState } from './state';

export interface TutorialStep {
  id: string;
  /** i18n key of the prompt (`idle.tut.<id>`). */
  text: string;
  /**
   * What the rim points at ('' none): 'face' (the centre block), 'card:pick', 'card:crew:0', 'breach', 'focus:<id>',
   * 'exit'. The shell resolves it to the object on screen.
   */
  target: string;
  /** The step begins when this holds (after the previous one is done and the spacing allows it). */
  start: (s: IdleState) => boolean;
  /** The step is done (an action). */
  done: (s: IdleState) => boolean;
  /** Seconds of inaction before the fallback, and how many times it may fire. */
  fallbackAfter?: number;
  fallbacks?: number;
  /** The fallback acts (the Pick buys itself on the second); otherwise the shell brightens the rim / shows the card. */
  act?: (s: IdleState, bus?: IdleBus) => void;
  /** A first-time card shown with the step's second fallback (`idle.first.<id>.title/.body`). */
  card?: string;
  /** The UI elements revealed when the step begins (SPEC §8.3). */
  reveal?: readonly string[];
  /** Its moment has passed (the player got there another way): skip it unseen. */
  skip?: (s: IdleState) => boolean;
  /** Seconds after which an unfinished step moves on anyway (the tutorial cannot be failed). */
  giveUpAfter?: number;
  /** The fallback clock counts from the step's start even while the player taps (card steps). */
  clockIgnoresTaps?: boolean;
  /** A new mechanic for the spacing rule (the opening pair is exempt). */
  mechanic: boolean;
  /**
   * While it waits for its start, the next step may run first (the Pick card waits for 30 gold; the breach can come first).
   * It runs as soon as its start holds and no other prompt is up, then the sequence resumes where it was.
   */
  deferrable?: boolean;
}

const pickCost = PICK.c0;
const shovelCost = Math.pow(10, crewLine(0).c0Log10);

/** The Root Cellar's chest (node 0's focus socket holding the scripted chest). */
function cellarChest(s: IdleState): string {
  const con = contentsOf(s, 0);
  return con.focus.find((id) => con.sockets[id].kind === 'chest') ?? '';
}

function cellarOpen(s: IdleState): boolean {
  return !!s.node.chambers[0] || s.run.depth > nodeAt(s.seed, 0).breach;
}

function chestDone(s: IdleState): boolean {
  if (s.meta.stats.chests >= 1) return true;
  const c = s.node.chambers[0];
  const id = cellarChest(s);
  return !!c && !!id && c.resolved.includes(id);
}

/** Taps on the face the player is at now (the hold step shows after 6). */
function faceTaps(s: IdleState): number {
  const tu = s.tutorial;
  return tu.faceNode === s.node.node ? s.run.taps - tu.faceTaps0 : 0;
}

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    // 1. Tap: the adit plug, the centre block rimmed; HP 100 = damage 100, the first tap always breaks.
    id: 'tapRock', text: 'idle.tut.tapRock', target: 'face',
    start: () => true,
    done: (s) => s.meta.stats.cells >= 1,
    // The ghost hand appears once after 4 s without input (the shell draws it on 'tutorial:fallback').
    fallbackAfter: 4, fallbacks: 1,
    reveal: ['goalBar'],
    mechanic: false,
  },
  {
    // 2. Buy: 30 gold, the Pick card rises (the only card so far), rimmed. After two fallbacks it buys itself.
    id: 'buyPick', text: 'idle.tut.buyPick', target: 'card:pick',
    start: (s) => s.run.gold.toNumber() >= pickCost - 1e-9 || s.run.pick >= 2,
    done: (s) => s.run.pick >= 2,
    // Its moment passes once the player is past the first ride (the BEST card teaches buying from then on).
    skip: (s) => s.node.node >= 1 && s.run.gold.toNumber() < pickCost - 1e-9,
    deferrable: true,
    fallbackAfter: 8, fallbacks: 2, giveUpAfter: 40, clockIgnoresTaps: true,
    act: (s, bus) => {
      if (s.tutorial.fallbacks >= 2) buy(s, 'pick', 'x1', bus);
    },
    reveal: ['gold', 'depth', 'quick1'],
    mechanic: false,
  },
  {
    // 3a. Light: the last slice of drift 1 leaks dusk light. Done at the breakthrough.
    id: 'light', text: 'idle.tut.light', target: 'breach',
    start: (s) => {
      const t = nodeAt(s.seed, 0);
      return s.run.depth >= t.breach - 1 || cellarOpen(s);
    },
    done: (s) => cellarOpen(s),
    fallbackAfter: 6, fallbacks: 2, card: 'breach',
    mechanic: true,
  },
  {
    // 3b. …then the chest in the Root Cellar's lantern pool (part of the same lesson: M3).
    id: 'chest', text: 'idle.tut.chest', target: 'focus:chest',
    start: (s) => s.node.phase === 'explore' && s.node.node === 0,
    done: chestDone,
    skip: (s) => s.node.node > 0,
    fallbackAfter: 6, fallbacks: 2, card: 'chest',
    reveal: ['gems'],
    mechanic: false,
  },
  {
    // 4. Go: the Root Cellar's rope ladder, rimmed once the chest is open (or after 20 s).
    id: 'go', text: 'idle.tut.go', target: 'exit',
    start: (s) => s.node.phase === 'explore' && s.node.node === 0,
    done: (s) => s.node.node >= 1 || s.node.phase === 'ride',
    fallbackAfter: 8, fallbacks: 2, card: 'explore',
    mechanic: true,
  },
  {
    // 5. Hire: 50 gold, the BEST card appears with the Shovel Hand. The rim stays after two fallbacks (never auto-hired).
    id: 'hire', text: 'idle.tut.hire', target: 'card:crew:0',
    start: (s) => s.run.gold.toNumber() >= shovelCost - 1e-9 || (s.run.lines[0] ?? 0) >= 1,
    done: (s) => (s.run.lines[0] ?? 0) >= 1,
    fallbackAfter: 8, fallbacks: 2, clockIgnoresTaps: true,
    reveal: ['quick2', 'crewTab'],
    mechanic: true,
  },
  {
    // 6. Hold: at a face, ≥ 40 s after the hire, shown after 6 taps on that face; done with 1.5 s of hold.
    id: 'hold', text: 'idle.tut.hold', target: 'face',
    start: (s) => s.node.phase === 'dig' && s.playTime - s.tutorial.hiredAt >= 40 && faceTaps(s) >= 6,
    done: (s) => s.tap.holdSince >= 0 && s.tap.holdLast - s.tap.holdSince >= 1.5 - 1e-9,
    fallbackAfter: 10, fallbacks: 1, giveUpAfter: 60,
    reveal: ['digTab'],
    mechanic: true,
  },
];

// ----- lessons (SPEC §6.4) --------------------------------------------------------------------------------

export interface Lesson {
  id: string;
  /** It matters now (the moment it first matters). */
  ready: (s: IdleState) => boolean;
  /** It is learnt (the player did it). */
  done: (s: IdleState) => boolean;
  /** Shown even when the spacing would hold it (the player started it: the seal fight); it still counts. */
  urgent?: boolean;
  /** A lesson still on screen this long gives way (s); the next one may come. */
  maxOn: number;
}

function inChamber(s: IdleState, i: number): boolean {
  const c = s.node.chambers[i];
  return s.node.phase === 'explore' && s.node.node === i && !!c && c.lit;
}

export const LESSONS: readonly Lesson[] = [
  {
    // The Copper Lode → Lamp Room cart run: tap the glints as they pass (W1-LEAD §3 Ride).
    id: 'glints',
    ready: (s) => s.node.phase === 'ride' && !!s.node.ride && contentsOf(s, s.node.ride.from).ride.length > 0,
    done: (s) => s.meta.nodeStats.glints >= 1,
    maxOn: 12,
  },
  {
    // The Lamp Room (C3): relight the lamps, chart the chamber.
    id: 'lamps',
    ready: (s) => inChamber(s, 2) || (s.node.node > 2 && s.node.phase === 'explore' && contentsOf(s, s.node.node).lamps.length > 0),
    done: (s) => s.meta.charted.some((i) => contentsOf(s, i).lamps.length > 0) && s.meta.nodeStats.lamps >= 2,
    maxOn: 60,
  },
  {
    // The Reliquary niche (C4): the relic ring.
    id: 'relic',
    ready: (s) => inChamber(s, 3),
    done: (s) => Object.keys(s.meta.relicGrades).length > 0,
    maxOn: 45,
  },
  {
    // 30 m: Dynamite on the rack.
    id: 'dynamite',
    ready: (s) => s.node.phase === 'dig' && !!s.run.skills.dynamite && cooldownLeft(s, 'dynamite') === 0,
    done: (s) => s.meta.firstTime.includes('used:dynamite'),
    maxOn: 30,
  },
  {
    // The Lift Bottom (C6): the seal. Shown when the fight starts, whatever the spacing (the player chose it).
    id: 'seal',
    ready: (s) => s.node.phase === 'seal',
    done: (s) => s.meta.sealsOpened.includes(1),
    urgent: true,
    maxOn: 90,
  },
  {
    // After the reveal: the biome's four gear cards.
    id: 'gear',
    ready: (s) => s.meta.sealsOpened.includes(1) && s.run.gear.length === 0 && s.node.phase !== 'seal',
    done: (s) => s.run.gear.length >= 1,
    maxOn: 60,
  },
  {
    // Glowroot: the first dark mouth the crew opened ahead (the leash): first light is yours.
    id: 'dark',
    ready: (s) => s.node.phase === 'explore' && !!s.node.chambers[s.node.node] && !s.node.chambers[s.node.node].lit && s.node.chambers[s.node.node].by === 'crew',
    done: (s) => s.meta.firstTime.includes('lit:crew'),
    maxOn: 20,
  },
];

/** Seconds between new mechanics (L13): 40 s before 3:00 of play, 60 s after. */
export function spacingAt(playTime: number): number {
  return playTime < 180 ? 40 : 60;
}

export function initTutorial(): TutorialState {
  return {
    index: 0, since: -1, fallbacks: 0, nextFallback: Infinity, breaks: 0, done: false,
    lesson: '', lessonSince: -1, lastMechanicAt: -Infinity, faceNode: -1, faceTaps0: 0, hiredAt: Infinity, deferred: -1, resumeIndex: -1,
  };
}

/** The current step (null when the six steps are over). */
export function currentStep(s: IdleState): TutorialStep | null {
  if (s.tutorial.done || s.meta.tutorial.done) return null;
  return TUTORIAL_STEPS[s.tutorial.index] ?? null;
}

/** Has the current step begun (its start condition held)? */
export function stepStarted(s: IdleState): boolean {
  return s.tutorial.since >= 0;
}

/** The lesson on screen ('' none). */
export function currentLesson(s: IdleState): string {
  return s.tutorial.lesson;
}

/** The prompt on screen now: a running step's id, a lesson's id, or '' (never both: L13). */
export function activePrompt(s: IdleState): string {
  const step = currentStep(s);
  if (step && s.tutorial.since >= 0) return `tut:${step.id}`;
  if (s.tutorial.lesson) return `lesson:${s.tutorial.lesson}`;
  return '';
}

/** Advance the step machine and the sequencer. Emits tutorial:step, tutorial:fallback, firsttime, ui:reveal, tutorial:done. */
export function tickTutorial(s: IdleState, bus?: IdleBus): void {
  const tu = s.tutorial;
  progressiveReveal(s, bus);
  // The face the player stands at (the hold step counts its taps).
  if (s.node.phase === 'dig' && tu.faceNode !== s.node.node) {
    tu.faceNode = s.node.node;
    tu.faceTaps0 = s.run.taps;
  }
  tickSteps(s, bus);
  tickLessons(s, bus);
}

function spacingOk(s: IdleState): boolean {
  return s.playTime - s.tutorial.lastMechanicAt >= spacingAt(s.tutorial.lastMechanicAt) - 1e-9;
}

function tickSteps(s: IdleState, bus?: IdleBus): void {
  const tu = s.tutorial;
  if (tu.done || s.meta.tutorial.done) return;
  for (let guard = 0; guard < TUTORIAL_STEPS.length + 2; guard++) {
    // A deferred step comes back the moment it can run (no prompt up), or drops once done or past its moment.
    if (tu.deferred >= 0 && tu.since < 0 && tu.resumeIndex < 0) {
      const d = TUTORIAL_STEPS[tu.deferred];
      if (!d || d.done(s) || d.skip?.(s)) tu.deferred = -1;
      else if (!tu.lesson && d.start(s)) {
        tu.resumeIndex = tu.index;
        tu.index = tu.deferred;
        tu.deferred = -1;
      }
    }
    const step = TUTORIAL_STEPS[tu.index];
    if (!step) {
      finish(s, bus);
      return;
    }
    if (tu.since < 0) {
      // Done before its prompt, or its moment passed: skipped unseen.
      if (step.done(s) || step.skip?.(s)) {
        next(s, step);
        continue;
      }
      // One prompt at a time, and the spacing rule for new mechanics.
      if (tu.lesson) return;
      if (!step.start(s)) {
        // A deferrable step waiting for its moment lets the next step go first when that one can start now.
        const nx = TUTORIAL_STEPS[tu.index + 1];
        if (step.deferrable && tu.deferred < 0 && tu.resumeIndex < 0 && nx && !nx.done(s) && nx.start(s)) {
          tu.deferred = tu.index;
          tu.index++;
          continue;
        }
        return;
      }
      if (step.mechanic && !spacingOk(s)) return;
      begin(s, step, bus);
    }
    const elapsed = s.time - tu.since;
    if (step.done(s) || !!step.skip?.(s) || (step.giveUpAfter !== undefined && elapsed >= step.giveUpAfter)) {
      next(s, step);
      continue;
    }
    // Fallback after inaction (a hit or a purchase resets the clock unless the step ignores taps).
    if (step.fallbackAfter !== undefined && tu.fallbacks < (step.fallbacks ?? 1)) {
      const idleSince = step.clockIgnoresTaps ? tu.since : Math.max(tu.since, s.hints.lastHitAt);
      if (s.time - idleSince >= step.fallbackAfter && s.time >= tu.nextFallback - 1e-9) {
        tu.fallbacks++;
        tu.nextFallback = s.time + step.fallbackAfter;
        bus?.emit('tutorial:fallback', { id: step.id });
        if (step.card && tu.fallbacks === 2) firstTime(s, step.card, bus);
        step.act?.(s, bus);
      } else if (!Number.isFinite(tu.nextFallback)) tu.nextFallback = s.time + step.fallbackAfter;
    }
    return;
  }
}

function next(s: IdleState, step: TutorialStep): void {
  const tu = s.tutorial;
  if (step.id === 'hire') tu.hiredAt = s.playTime;
  if (tu.resumeIndex >= 0) {
    // The deferred step ran out of order: resume the sequence where it was.
    tu.index = tu.resumeIndex;
    tu.resumeIndex = -1;
  } else tu.index++;
  tu.since = -1;
  tu.fallbacks = 0;
  tu.nextFallback = Infinity;
  s.meta.tutorial.step = tu.index;
}

function begin(s: IdleState, step: TutorialStep, bus?: IdleBus): void {
  const tu = s.tutorial;
  tu.since = s.time;
  tu.fallbacks = 0;
  tu.nextFallback = step.fallbackAfter !== undefined ? s.time + step.fallbackAfter : Infinity;
  if (step.mechanic) tu.lastMechanicAt = s.playTime;
  for (const id of step.reveal ?? []) reveal(s, id, bus);
  bus?.emit('tutorial:step', { id: step.id, index: tu.index });
}

function tickLessons(s: IdleState, bus?: IdleBus): void {
  const tu = s.tutorial;
  const learnt = s.meta.tutorial.lessons;
  // The lesson on screen ends when it is done, its moment passed, or it stayed its time.
  if (tu.lesson) {
    const l = LESSONS.find((x) => x.id === tu.lesson);
    if (!l || l.done(s) || !l.ready(s) || s.time - tu.lessonSince >= l.maxOn) {
      if (l && (l.done(s) || s.time - tu.lessonSince >= l.maxOn)) learnt.push(l.id);
      tu.lesson = '';
      tu.lessonSince = -1;
    } else return;
  }
  // A running tutorial step is the one prompt.
  const step = currentStep(s);
  if (step && tu.since >= 0) return;
  for (const l of LESSONS) {
    if (learnt.includes(l.id)) continue;
    if (l.done(s)) {
      learnt.push(l.id);
      continue;
    }
    if (!l.ready(s)) continue;
    if (!l.urgent && !spacingOk(s)) return;
    tu.lesson = l.id;
    tu.lessonSince = s.time;
    tu.lastMechanicAt = s.playTime;
    firstTime(s, `lesson.${l.id}`, bus);
    bus?.emit('tutorial:step', { id: `lesson:${l.id}`, index: -1 });
    return;
  }
}

/** One first-time card, once in a lifetime (`idle.first.<id>.title/.body`). */
export function firstTime(s: IdleState, id: string, bus?: IdleBus): void {
  const key = `ft:${id}`;
  if (s.meta.firstTime.includes(key)) return;
  s.meta.firstTime.push(key);
  bus?.emit('firsttime', { id });
}

/**
 * The progressive reveal (SPEC §8.3), independent of the tutorial's order: each element appears the moment its
 * condition first holds (the gold counter at the first break, the crew card at 50 gold…).
 */
export function progressiveReveal(s: IdleState, bus?: IdleBus): void {
  const r = s.meta.revealed;
  for (const [id, when] of REVEAL_RULES) if (!r.includes(id) && when(s)) reveal(s, id, bus);
  // BEST competes from two options (checked twice a second: it is the costly one).
  if (!r.includes('quick2') && Math.floor(s.time * 2) !== Math.floor((s.time - 1 / 60) * 2) && best(s) !== null && s.meta.stats.purchases > 0) reveal(s, 'quick2', bus);
}

const REVEAL_RULES: ReadonlyArray<readonly [string, (s: IdleState) => boolean]> = [
  ['goalBar', () => true],
  ['gold', (s) => s.meta.stats.cells >= 1],
  ['depth', (s) => s.meta.record >= 1],
  ['quick1', (s) => s.run.gold.toNumber() >= pickCost - 1e-9 || s.run.pick >= 2],
  ['quick3', (s) => s.run.gold.toNumber() >= shovelCost - 1e-9 || (s.run.lines[0] ?? 0) >= 1],
  ['gems', (s) => s.meta.gems > 0],
  ['buyMode', (s) => s.meta.stats.stars >= 1],
  ['digTab', (s) => s.meta.stats.purchases >= 1],
  ['crewTab', (s) => s.meta.record >= 16 || (s.run.lines[0] ?? 0) >= 1],
  ['skills', (s) => !!s.run.skills.dynamite],
  ['combo', (s) => s.tap.combo >= 15],
  // W2 (SPEC §6.4: the Board, Codex and Feats wait for session 2 and the second seal).
  ['rank', (s) => s.meta.rank.r >= 2],
  ['featsTab', (s) => s.meta.marks >= 1 && s.meta.sealsOpened.includes(2)],
  ['boardTab', (s) => s.meta.sealsOpened.includes(2)],
  ['codexTab', (s) => s.meta.stats.finds + s.meta.lore.length >= 1 && s.meta.sealsOpened.includes(2)],
  ['lanternTab', (s) => s.meta.record >= 400],
  ['events', (s) => s.meta.stats.events >= 1 || !!s.event],
  ['facets', (s) => s.run.hands > 0 || s.run.facets.length > 0],
  ['daily', (s) => s.meta.dailyReady || s.meta.daily.lastDay > 0],
];

function finish(s: IdleState, bus?: IdleBus): void {
  s.tutorial.done = true;
  s.meta.tutorial.done = true;
  s.meta.tutorial.step = TUTORIAL_STEPS.length;
  for (const id of ['gold', 'depth', 'quick1', 'quick2', 'quick3', 'goalBar', 'digTab', 'crewTab']) reveal(s, id, bus);
  bus?.emit('tutorial:done', {});
}

/** Reveal a UI element once (SPEC §8.3): records it and emits ui:reveal. */
export function reveal(s: IdleState, id: string, bus?: IdleBus): void {
  if (s.meta.revealed.includes(id)) return;
  s.meta.revealed.push(id);
  bus?.emit('ui:reveal', { id });
}

/** Skip the tutorial (a returning player, debug): the six steps done; lessons still come when they matter. */
export function skipTutorial(s: IdleState, bus?: IdleBus): void {
  s.tutorial.hiredAt = Math.min(s.tutorial.hiredAt, s.playTime);
  finish(s, bus);
}

/**
 * What the amber rim should be on now for the tutorial ('' none): 'face', 'card:pick', 'card:crew:0', 'breach', 'exit',
 * or 'focus:<socketId>' for the Root Cellar's chest.
 */
export function guideTarget(s: IdleState): string {
  const step = currentStep(s);
  if (!step || s.tutorial.since < 0) return '';
  if (step.target === 'focus:chest') return `focus:${cellarChest(s)}`;
  return step.target;
}

