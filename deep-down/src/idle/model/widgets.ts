// The five mini-game widgets (SPEC §7.3), as pure state the UI renders: Catch (targets cross on curves; tap each),
// Mash (tap as fast as you can; tiers at 15 / 25 / 40), Strike (a needle sweeps a brass arc, 0.9 s a pass; tap to stop
// it: perfect 8 % ×5, good 25 % ×2), Sequence (3–8 marks light in order, 0.5 s each; tap them back; a wrong tap restarts
// once) and Pick (1 of 3 cards). Every widget is skippable, never blocks digging outside its target and never removes
// anything when missed. Owners (the seal finisher, a geode, an event, the Supply Rope) read the result when it closes:
// the router is `widgetTap` in entities.ts.

import type { EventPath, IdleBus, StrikeGrade, WidgetKind } from '../bus';
import type { CatchWidget, EventTarget, IdleState, MashWidget, PickWidget, SequenceWidget, StrikeWidget, WidgetState } from './state';

/** Widget numbers (SPEC §7.3). */
export const WIDGET = {
  /** Catch: hit radius (CSS px, for the UI and B's picking) and each target's time on screen. */
  catchRadius: 44,
  /** Strike: one pass of the needle (s), the zones' widths (fractions of the arc) and their multipliers. */
  strikePeriod: 0.9,
  perfect: 0.08,
  good: 0.25,
  perfectX: 5,
  goodX: 2,
  /** A seal finisher's perfect is a ×10 hit. */
  finisherPerfectX: 10,
  /** Sequence: each mark is shown this long; one restart after a wrong tap. */
  showEach: 0.5,
  restarts: 1,
  /** Mash tiers. */
  mashTiers: [15, 25, 40] as readonly number[],
} as const;

let nextWidget = 1;
function widgetId(s: IdleState): string {
  return `widget:${s.nextId++ || nextWidget++}`;
}

function base<K extends WidgetKind>(s: IdleState, kind: K, owner: string, life: number) {
  return { id: widgetId(s), kind, owner, born: s.time, life, done: false, result: '' as const };
}

/** Open a Catch widget with its targets (each `event:<eventId>:<n>`). */
export function openCatch(s: IdleState, owner: string, life: number, targets: EventTarget[], bus?: IdleBus): CatchWidget {
  const w: CatchWidget = { ...base(s, 'catch', owner, life), targets };
  bus?.emit('widget:start', { id: w.id, kind: 'catch', owner, life });
  return w;
}

/** Open a Mash widget on one target entity. */
export function openMash(s: IdleState, owner: string, life: number, target: string, bus?: IdleBus): MashWidget {
  const w: MashWidget = { ...base(s, 'mash', owner, life), target, taps: 0, tiers: WIDGET.mashTiers };
  bus?.emit('widget:start', { id: w.id, kind: 'mash', owner, life });
  return w;
}

/** Open a Strike widget: `needles` 1–3, the perfect zone's centre drawn from `zone` (0.25..0.75). */
export function openStrike(s: IdleState, owner: string, life: number, needles: number, zone: number, bus?: IdleBus): StrikeWidget {
  const w: StrikeWidget = {
    ...base(s, 'strike', owner, life),
    needles: Math.max(1, Math.min(3, needles)),
    period: WIDGET.strikePeriod,
    zone: Math.max(0.2, Math.min(0.8, zone)),
    perfect: WIDGET.perfect,
    good: WIDGET.good,
    needleStart: s.time,
    grades: [],
  };
  bus?.emit('widget:start', { id: w.id, kind: 'strike', owner, life });
  return w;
}

/** Open a Sequence widget: `order` lights first (indices into a board of `board` marks). */
export function openSequence(s: IdleState, owner: string, life: number, board: number, order: number[], bus?: IdleBus): SequenceWidget {
  const w: SequenceWidget = { ...base(s, 'sequence', owner, life), board, order, showEach: WIDGET.showEach, showFrom: s.time + 0.4, pos: 0, restarts: 0 };
  // The window counts from the end of the show (the player must see the marks before the clock runs).
  w.life = life + 0.4 + order.length * w.showEach;
  bus?.emit('widget:start', { id: w.id, kind: 'sequence', owner, life: w.life });
  return w;
}

/** Open a Pick widget with 3 card ids. */
export function openPick(s: IdleState, owner: string, life: number, cards: string[], bus?: IdleBus): PickWidget {
  const w: PickWidget = { ...base(s, 'pick', owner, life), cards, picked: -1 };
  bus?.emit('widget:start', { id: w.id, kind: 'pick', owner, life });
  return w;
}

// ----- Strike ---------------------------------------------------------------------------------------------

/** The needle's position on the arc (0..1) at model time t: a triangle wave, one pass per period. */
export function strikePos(w: StrikeWidget, t: number): number {
  const u = Math.max(0, t - w.needleStart) / w.period;
  const f = u - 2 * Math.floor(u / 2);
  return f <= 1 ? f : 2 - f;
}

/** The grade of a needle stopped at `pos`. */
export function strikeGrade(w: Pick<StrikeWidget, 'zone' | 'perfect' | 'good'>, pos: number): StrikeGrade {
  const d = Math.abs(pos - w.zone);
  if (d <= w.perfect / 2) return 'perfect';
  if (d <= w.good / 2) return 'good';
  return 'miss';
}

/** The multiplier of a grade (a seal finisher's perfect is ×10). */
export function gradeMult(g: StrikeGrade, finisher = false): number {
  if (g === 'perfect') return finisher ? WIDGET.finisherPerfectX : WIDGET.perfectX;
  if (g === 'good') return WIDGET.goodX;
  return 1;
}

/** Stop the current needle at model time t. @returns its grade; the widget closes after the last needle. */
export function strikeStop(s: IdleState, w: StrikeWidget, bus?: IdleBus): StrikeGrade {
  const g = strikeGrade(w, strikePos(w, s.time));
  w.grades.push(g);
  w.needleStart = s.time;
  if (g === 'perfect') s.meta.stats.perfects++;
  s.meta.lastUsed.strike = s.playTime;
  bus?.emit('widget:input', { id: w.id, kind: 'strike', grade: g, value: gradeMult(g) });
  if (w.grades.length >= w.needles) close(w, w.grades.every((x) => x === 'miss') ? 'missed' : 'done', bus);
  return g;
}

/** The best grade a Strike reached. */
export function bestGrade(w: StrikeWidget): StrikeGrade {
  if (w.grades.includes('perfect')) return 'perfect';
  if (w.grades.includes('good')) return 'good';
  return 'miss';
}

// ----- Sequence ---------------------------------------------------------------------------------------------

/** True while the marks are being shown (input waits). */
export function sequenceShowing(w: SequenceWidget, t: number): boolean {
  return t < w.showFrom + w.order.length * w.showEach;
}

/** The mark lit at time t during the show (−1 none). */
export function sequenceLit(w: SequenceWidget, t: number): number {
  if (t < w.showFrom || !sequenceShowing(w, t)) return -1;
  return w.order[Math.floor((t - w.showFrom) / w.showEach)] ?? -1;
}

/** A tap on mark `mark`. A wrong tap restarts the show once; a second wrong tap ends it partial. */
export function sequenceTap(s: IdleState, w: SequenceWidget, mark: number, bus?: IdleBus): 'ok' | 'wrong' | 'done' | 'wait' {
  if (w.done) return 'done';
  if (sequenceShowing(w, s.time)) return 'wait';
  if (w.order[w.pos] === mark) {
    w.pos++;
    bus?.emit('widget:input', { id: w.id, kind: 'sequence', grade: 'ok', value: w.pos });
    if (w.pos >= w.order.length) {
      close(w, 'done', bus);
      return 'done';
    }
    return 'ok';
  }
  bus?.emit('widget:input', { id: w.id, kind: 'sequence', grade: 'wrong', value: w.pos });
  if (w.restarts < WIDGET.restarts) {
    w.restarts++;
    w.pos = 0;
    w.showFrom = s.time + 0.3;
    w.life += 0.3 + w.order.length * w.showEach;
    return 'wrong';
  }
  close(w, w.pos > 0 ? 'partial' : 'missed', bus);
  return 'done';
}

// ----- Mash -------------------------------------------------------------------------------------------------

/** One mash tap. @returns the tier reached (0 none, 1–3). */
export function mashTap(w: MashWidget, bus?: IdleBus): number {
  if (w.done) return mashTier(w);
  w.taps++;
  const tier = mashTier(w);
  if (w.tiers.includes(w.taps)) bus?.emit('widget:input', { id: w.id, kind: 'mash', grade: `tier${tier}`, value: w.taps });
  return tier;
}

export function mashTier(w: MashWidget): number {
  let t = 0;
  for (const x of w.tiers) if (w.taps >= x) t++;
  return t;
}

// ----- Pick ---------------------------------------------------------------------------------------------------

export function pickCard(w: PickWidget, i: number, bus?: IdleBus): string {
  if (w.done || i < 0 || i >= w.cards.length) return '';
  w.picked = i;
  bus?.emit('widget:input', { id: w.id, kind: 'pick', grade: w.cards[i], value: i });
  close(w, 'done', bus);
  return w.cards[i];
}

// ----- Catch --------------------------------------------------------------------------------------------------

/** The point of a target at model time t (shaft coordinates relative to the floor at spawn), null off screen. */
export function targetAt(tg: EventTarget, t: number): { x: number; y: number } | null {
  if (t < tg.t0 || t > tg.t1 || tg.state !== 'live') return null;
  return pathAt(tg.path, (t - tg.t0) / Math.max(1e-6, tg.t1 - tg.t0));
}

/** The quadratic Bézier of an event path at u ∈ [0, 1]. */
export function pathAt(p: EventPath, u: number): { x: number; y: number } {
  const v = Math.max(0, Math.min(1, u));
  const a = (1 - v) * (1 - v);
  const b = 2 * v * (1 - v);
  const c = v * v;
  return { x: a * p.x0 + b * p.cx + c * p.x1, y: a * p.y0 + b * p.cy + c * p.y1 };
}

/** Hit a target of a Catch. @returns the taps it still needs (0: caught), −1 when it is not live. */
export function catchHit(s: IdleState, w: CatchWidget, id: string, ownerEvent: string, bus?: IdleBus): number {
  const tg = w.targets.find((x) => x.id === id);
  if (!tg || tg.state !== 'live' || s.time < tg.t0) return -1;
  tg.hits++;
  const left = Math.max(0, tg.need - tg.hits);
  if (left === 0) tg.state = 'caught';
  bus?.emit('event:hit', { event: ownerEvent, id, left, caught: left === 0 });
  if (w.targets.every((x) => x.state !== 'live')) close(w, w.targets.every((x) => x.state === 'caught') ? 'done' : 'partial', bus);
  return left;
}

/** Expire targets whose time ran out. @returns the ids that left uncaught this step. */
export function catchExpire(s: IdleState, w: CatchWidget, ownerEvent: string, bus?: IdleBus): string[] {
  const out: string[] = [];
  for (const tg of w.targets) {
    if (tg.state === 'live' && s.time > tg.t1) {
      tg.state = 'missed';
      out.push(tg.id);
      bus?.emit('event:miss', { event: ownerEvent, id: tg.id });
    }
  }
  if (!w.done && w.targets.every((x) => x.state !== 'live')) {
    const caught = w.targets.filter((x) => x.state === 'caught').length;
    close(w, caught === w.targets.length ? 'done' : caught > 0 ? 'partial' : 'missed', bus);
  }
  return out;
}

// ----- common -------------------------------------------------------------------------------------------------

/** Close a widget with a result (idempotent). */
export function close(w: WidgetState, result: WidgetState['result'], bus?: IdleBus): void {
  if (w.done) return;
  w.done = true;
  w.result = result;
  const score = w.kind === 'strike' ? gradeMult(bestGrade(w)) : w.kind === 'mash' ? w.taps : w.kind === 'sequence' ? w.pos : w.kind === 'catch' ? w.targets.filter((x) => x.state === 'caught').length : w.picked;
  bus?.emit('widget:end', { id: w.id, kind: w.kind, owner: w.owner, result, score });
}

/** A widget's window ran out (Mash ends with its tier; others close missed or partial). @returns true when it closed now. */
export function expire(s: IdleState, w: WidgetState, bus?: IdleBus): boolean {
  if (w.done || s.time - w.born < w.life) return false;
  if (w.kind === 'mash') close(w, mashTier(w) > 0 ? 'done' : w.taps > 0 ? 'partial' : 'missed', bus);
  else if (w.kind === 'sequence') close(w, w.pos > 0 ? 'partial' : 'missed', bus);
  else if (w.kind === 'strike') close(w, w.grades.length ? 'partial' : 'missed', bus);
  else if (w.kind === 'catch') {
    for (const tg of w.targets) if (tg.state === 'live') tg.state = 'missed';
    const caught = w.targets.filter((x) => x.state === 'caught').length;
    close(w, caught === w.targets.length ? 'done' : caught > 0 ? 'partial' : 'missed', bus);
  } else close(w, 'missed', bus);
  return true;
}

/** Skip a widget (the UI's skip): it closes, nothing is taken away. */
export function skip(w: WidgetState, bus?: IdleBus): void {
  close(w, 'skipped', bus);
}

/** Every open widget, the live event's first (the UI renders them in this order). */
export function openWidgets(s: IdleState): WidgetState[] {
  const out: WidgetState[] = [];
  if (s.event?.widget && !s.event.widget.done) out.push(s.event.widget);
  for (const w of s.widgets) if (!w.done) out.push(w);
  return out;
}

/** Find a widget by id (live event or standalone). */
export function widgetById(s: IdleState, id: string): WidgetState | null {
  if (s.event?.widget?.id === id) return s.event.widget;
  return s.widgets.find((w) => w.id === id) ?? null;
}
