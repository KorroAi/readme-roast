// The Director (SPEC §7.2), pure and seeded: it deals one event every U(40, 70) s of active play so the screen never
// goes quiet. Never two at once, never during a seal or a held ceremony (`holdDirector`), never in the first second of
// a Surge. Deck rules: biome weights; never the same type twice in a row; every unlocked type at least once in any 10
// consecutive events (an earliest-deadline-first guard); a type unseen for 12 events weighs ×3. Idle-friendly: after
// 20 s without a tap only waiting events are dealt (Supply Rope, Treasure Map). The find guarantee (10 s of active play
// with nothing new in view → a micro-surfacing within 1 s), the boredom breaker (no special cell for 25 s → one in the
// next 2 rows; no beat for 70 s → deal now) and the Codex pity (6 min without a new entry on an incomplete page → a
// geode or fossil sure to hold one, in the next 6 rows) live here too.
//
// Every event runs through `startEvent` → its widget (widgets.ts) → `endEvent` (rewards). Targets are entity ids
// `event:<eventId>:<n>`; B spawns them from 'event:target' and removes them on 'event:hit' (caught) or 'event:miss'.

import { Big } from '../../core/big';
import type { EventPath, IdleBus } from '../bus';
import { AUTHORED_BIOMES, BIOMES, baseBiome, biomeAt } from '../config/biomes';
import {
  DECK, DIRECTOR, ECHO_GEMS, EVENTS, type EventType, GEODE, GLIMMER, MAP, MASH_PAY, ROPE_BOOSTS, ROPE_SECONDS, type RopeBoost,
  SIGNATURES, VEIN, WEIGHTS,
} from '../config/events';
import { XP } from '../config/rank';
import { openChest } from './chests';
import { currentPage, pageIncomplete, readNote, rollFind } from './codex';
import { facetStats } from './facets';
import { addXp, creditGems, creditSeconds } from './gain';
import { hasPerk, invalidateMults } from './mult';
import { surgeDuration } from './run';
import { rowAt } from './shaft';
import { CELL, type CellKind, COLS, type ActiveEvent, type CatchWidget, type DirectorState, type EventTarget, type IdleState, type MashWidget, type PickWidget, type SequenceWidget, type StrikeWidget } from './state';
import { rand } from './tap';
import { bestGrade, catchExpire, catchHit, close, expire, mashTap, mashTier, openCatch, openMash, openPick, openSequence, openStrike, pickCard, sequenceTap, strikeStop } from './widgets';

const L10 = Math.log10;

export function newDirector(): DirectorState {
  return {
    wait: DIRECTOR.gap[0] + 0.5 * (DIRECTOR.gap[1] - DIRECTOR.gap[0]),
    next: '',
    announced: false,
    history: [],
    since: {},
    dealt: 0,
    lastBeat: 0,
    lastSpecial: 0,
    lastFind: 0,
    findQuiet: 0,
    specialQuiet: 0,
    holdUntil: 0,
    codexQuiet: 0,
  };
}

// ----- the deck ---------------------------------------------------------------------------------------------

/** The weight column for a biome (B0 … B5+). */
function column(s: IdleState): number {
  return Math.min(5, baseBiome(biomeAt(s.run.depth)));
}

/** Types in the deck at the run's depth (unlocked and weighted here). */
export function deckTypes(s: IdleState): EventType[] {
  const col = column(s);
  return DECK.filter((t) => s.run.dmax >= EVENTS[t].unlock && (WEIGHTS[t]?.[col] ?? 0) > 0);
}

/** The gap to the next event (s of active play): U(40, 70), shortened by the Wonderstruck perk (≥ 25 s). */
export function nextGap(s: IdleState): number {
  const g = DIRECTOR.gap[0] + rand(s) * (DIRECTOR.gap[1] - DIRECTOR.gap[0]);
  return hasPerk(s, 'wonderstruck') ? Math.max(DIRECTOR.minGap, g / 1.25) : g;
}

/**
 * Choose the next event type by the deck rules (pure apart from the RNG). `idle` keeps only waiting events.
 * @returns '' when nothing can be dealt.
 */
export function nextEvent(s: IdleState, idle = false): EventType | '' {
  const d = s.director;
  const last = d.history[d.history.length - 1] ?? '';
  let types = deckTypes(s);
  for (const t of types) if (d.since[t] === undefined) d.since[t] = 0;
  if (idle) types = types.filter((t) => EVENTS[t].waits);
  const allowed = types.filter((t) => t !== last);
  if (!allowed.length) return '';
  // Rotation guard: earliest deadline first when the window is tight.
  if (!idle) {
    const sorted = [...types].sort((a, b) => (d.since[b] ?? 0) - (d.since[a] ?? 0));
    for (let i = 0; i < sorted.length; i++) {
      const deadline = DIRECTOR.rotation - 1 - (d.since[sorted[i]] ?? 0);
      if (deadline <= i) {
        const pick = sorted.find((t) => t !== last);
        if (pick) return pick;
      }
    }
  }
  const col = column(s);
  const fs = facetStats(s);
  let total = 0;
  const w: number[] = [];
  for (const t of allowed) {
    let x = WEIGHTS[t][col];
    if ((d.since[t] ?? 0) >= DIRECTOR.unseenAfter) x *= DIRECTOR.unseenX;
    if (t === 'goldenVein') x *= fs.veinX;
    w.push(x);
    total += x;
  }
  let r = rand(s) * total;
  for (let i = 0; i < allowed.length; i++) {
    r -= w[i];
    if (r <= 0) return allowed[i];
  }
  return allowed[allowed.length - 1];
}

/** Record a dealt type (history, since-counters). */
export function recordDealt(s: IdleState, type: string): void {
  const d = s.director;
  for (const t of Object.keys(d.since)) d.since[t]++;
  d.since[type] = 0;
  d.history.push(type);
  if (d.history.length > 12) d.history.shift();
  d.dealt++;
}

/** Hold the Director (a T4/T5 ceremony, a reveal) for `seconds`. */
export function holdDirector(s: IdleState, seconds: number): void {
  s.director.holdUntil = Math.max(s.director.holdUntil, s.time + seconds);
}

/** The welcome back (SPEC §4.4): within 5 s of the feast closing, a Supply Rope (or a Drifting Ember before 180 m). */
export function welcomeBack(s: IdleState): void {
  const d = s.director;
  if (s.run.dmax >= EVENTS.supplyRope.unlock && !s.event) {
    d.next = 'supplyRope';
    d.announced = true;
    d.wait = Math.min(d.wait, 3);
  } else s.nextEmberAt = Math.min(s.nextEmberAt, s.playTime + 3);
}

/** A new tappable or find entered the view (B calls this when it shows one): the find guarantee's clock resets. */
export function noteTappableSeen(s: IdleState): void {
  s.director.findQuiet = 0;
  s.director.lastFind = s.time;
}

/** A special cell broke (ore and up): the boredom breaker and the find guarantee reset. */
export function noteSpecial(s: IdleState, kind: number): void {
  const d = s.director;
  if (kind === CELL.ORE || kind === CELL.RICH || kind === CELL.GEM || kind === CELL.FOSSIL || kind === CELL.GEODE || kind === CELL.CHEST || kind === CELL.GOLDEN) {
    d.specialQuiet = 0;
    d.lastSpecial = s.time;
  }
  if (kind === CELL.RICH || kind === CELL.GEM || kind === CELL.FOSSIL || kind === CELL.GEODE || kind === CELL.CHEST || kind === CELL.GOLDEN) noteTappableSeen(s);
}

// ----- the clock --------------------------------------------------------------------------------------------

/** Advance the Director by dt (model s). */
export function tickDirector(s: IdleState, dt: number, bus?: IdleBus): void {
  const d = s.director;
  const sinceHit = s.time - s.hints.lastHitAt;
  const active = sinceHit <= DIRECTOR.activeWindow && s.meta.stats.taps > 0;
  const idle = sinceHit > DIRECTOR.idleAfter;
  if (s.event) tickEvent(s, bus);
  tickStandalone(s, bus);
  if (!s.meta.tutorial.done) return; // the tutorial scripts its own beats until 3:00
  const surgeStart = s.tap.surgeEnd - surgeDuration(s);
  const blocked = !!s.seal || s.time < d.holdUntil || (s.tap.surgeEnd > s.time && s.time - surgeStart < DIRECTOR.holdSurge);
  if (active) {
    d.findQuiet += dt;
    d.specialQuiet += dt;
    d.codexQuiet += dt;
  }
  // The find guarantee and the boredom breaker work in active play.
  if (active && !blocked) {
    if (d.findQuiet >= DIRECTOR.findQuiet && !s.event) surface(s, bus);
    if (d.specialQuiet >= DIRECTOR.specialQuiet) boredSpecial(s, bus);
    if (d.codexQuiet >= DIRECTOR.codexPity) codexPity(s, bus);
    if (s.time - d.lastBeat >= DIRECTOR.beatQuiet && !s.event) d.wait = Math.min(d.wait, 0);
  }
  if (s.event || blocked) return;
  // The clock runs on active play; while idle it runs at half speed but deals only waiting events.
  if (active) d.wait -= dt;
  else if (idle) d.wait -= dt * 0.5;
  if (!d.announced && d.wait <= DIRECTOR.announce) {
    const t = nextEvent(s, idle);
    if (t) {
      d.next = t;
      d.announced = true;
      bus?.emit('event:announce', { id: `next:${d.dealt + 1}`, type: t, inSeconds: Math.max(0, d.wait) });
    }
  }
  if (d.wait <= 0) {
    let t = d.next as EventType | '';
    if (!t || (idle && !EVENTS[t].waits) || s.run.dmax < EVENTS[t].unlock) t = nextEvent(s, idle);
    d.next = '';
    d.announced = false;
    d.wait = nextGap(s);
    if (t) startEvent(s, t, bus);
  }
}

// ----- events -----------------------------------------------------------------------------------------------

function eventId(s: IdleState): string {
  return String(s.nextId++);
}

/** A path from (x0, y0) to (x1, y1) bending through (cx, cy), clamped into the reach band (CRITIQUE MUST 8). */
function path(x0: number, y0: number, cx: number, cy: number, x1: number, y1: number): EventPath {
  const cy2 = (y: number) => Math.max(-2.5, Math.min(3.5, y));
  const cx2 = (x: number) => Math.max(-0.8, Math.min(6.8, x));
  return { x0: cx2(x0), y0: cy2(y0), cx: cx2(cx), cy: cy2(cy), x1: cx2(x1), y1: cy2(y1) };
}

function between(s: IdleState, a: number, b: number): number {
  return a + rand(s) * (b - a);
}

function intBetween(s: IdleState, a: number, b: number): number {
  return a + Math.floor(rand(s) * (b - a + 1));
}

/** Start an event of `type` now (the Director, `forceEvent`, the tutorial's scripted Glimmerfall). */
export function startEvent(s: IdleState, type: EventType, bus?: IdleBus): ActiveEvent | null {
  if (s.event && !s.event.widget?.done) return null;
  const def = EVENTS[type];
  const id = eventId(s);
  const owner = `event:${id}`;
  const t0 = s.time + def.warn;
  const ev: ActiveEvent = { id, type, born: s.time, ends: s.time + def.warn + def.life, widget: null, n: 0, caught: 0, of: 0, goldLog10: -Infinity, gems: 0 };
  const first = !s.meta.firstTime.includes(`event:${type}`);
  const targets: EventTarget[] = [];
  const target = (kind: string, a: number, b: number, p: EventPath, need = 1) => {
    const tg: EventTarget = { id: `${owner}:${targets.length}`, kind, t0: a, t1: b, path: p, need, hits: 0, state: 'live' };
    targets.push(tg);
    return tg;
  };
  switch (type) {
    case 'goldenVein': {
      const cells: Array<{ depth: number; col: number; kind: CellKind }> = [];
      for (let k = 1; k <= VEIN.rows; k++) {
        const dep = s.run.depth + k;
        const cols = [0, 1, 2, 3, 4, 5, 6].sort(() => rand(s) - 0.5).slice(0, VEIN.cells);
        for (const c of cols) if (setCell(s, dep, c, CELL.GOLDEN, 0)) cells.push({ depth: dep, col: c, kind: CELL.GOLDEN });
      }
      ev.n = s.run.depth + VEIN.rows;
      ev.of = cells.length;
      if (cells.length) bus?.emit('cells:change', { cells, reason: 'goldenVein' });
      break;
    }
    case 'glimmerfall': {
      const n = intBetween(s, def.targets[0], def.targets[1]);
      for (let i = 0; i < n; i++) {
        const a = t0 + (i / n) * (def.life - 1.2);
        const x = between(s, 0, 6);
        target('crystal', a, a + between(s, def.onScreen[0], def.onScreen[1]), path(x, -2.5, x + between(s, -0.5, 0.5), -1, x + between(s, -0.6, 0.6), 0.2));
      }
      break;
    }
    case 'seedFall': {
      // Seed pods drift down slowly through the lantern pool, swaying (inanimate: no flight, no path across the frame).
      const n = intBetween(s, def.targets[0], def.targets[1]);
      for (let i = 0; i < n; i++) {
        const a = t0 + (i / n) * (def.life - 2.2);
        const x = between(s, 0.4, 5.6);
        target('seed', a, a + between(s, def.onScreen[0], def.onScreen[1]), path(x, -2.5, x + between(s, -0.8, 0.8), -1.2, x + between(s, -0.4, 0.4), 0.2));
      }
      break;
    }
    case 'rattlingBricks': {
      // Bricks of a Halden stash loosen one by one in the wall (they stay put; each takes one tap).
      const n = intBetween(s, def.targets[0], def.targets[1]);
      const left = rand(s) < 0.5;
      for (let i = 0; i < n; i++) {
        const a = t0 + i * 0.7;
        const x = left ? 0.2 + i * 0.35 : 5.8 - i * 0.35;
        const y = between(s, -1.2, 0.6);
        target('brick', a, a + between(s, def.onScreen[0], def.onScreen[1]), path(x, y, x, y, x, y));
      }
      break;
    }
    case 'caveIn': {
      const n = intBetween(s, def.targets[0], def.targets[1]);
      for (let i = 0; i < n; i++) {
        const a = t0 + (i / n) * (def.life - 2);
        const x = between(s, 0.3, 5.7);
        target('boulder', a, a + between(s, def.onScreen[0], def.onScreen[1]), path(x, -2.5, x, -1.5, x, -0.1), intBetween(s, def.taps[0], def.taps[1]));
      }
      break;
    }
    case 'supplyRope':
      target('crate', t0, t0 + def.life, path(3, -2.5, 3, -2, 3, -1.4));
      break;
    case 'wedgedChest': {
      // A chest caught in a slowly closing crack (the crack is the target; it does not move).
      const x0 = between(s, 1.5, 4.5);
      target('crack', t0, t0 + def.life, path(x0, -0.4, x0, -0.4, x0, -0.4), def.taps[0]);
      break;
    }
    case 'treasureMap': {
      const dep = s.run.depth + MAP.rows;
      const c = intBetween(s, 0, COLS - 1);
      if (setCell(s, dep, c, CELL.CHEST, 2)) bus?.emit('cells:change', { cells: [{ depth: dep, col: c, kind: CELL.CHEST }], reason: 'treasureMap' });
      ev.n = dep;
      ev.of = 1;
      break;
    }
    case 'ancientEcho': {
      const n = intBetween(s, def.targets[0], def.targets[1]);
      const board = 6;
      for (let i = 0; i < board; i++) {
        const a = (i / board) * Math.PI * 2;
        const x = 3 + 2.2 * Math.cos(a);
        const y = -0.6 + 1.4 * Math.sin(a);
        target('rune', t0, t0 + def.life + 0.4 + n * 0.5 + 6, path(x, y, x, y, x, y));
      }
      const order: number[] = [];
      for (let i = 0; i < n; i++) {
        let m = intBetween(s, 0, board - 1);
        if (order.length && m === order[order.length - 1]) m = (m + 1) % board;
        order.push(m);
      }
      ev.widget = openSequence(s, owner, def.life, board, order, bus);
      break;
    }
    case 'signature': {
      const sig = SIGNATURES[BIOMES[Math.min(AUTHORED_BIOMES - 1, baseBiome(biomeAt(s.run.depth)))].event] ?? SIGNATURES.rootPull;
      ev.ends = s.time + sig.life;
      ev.n = 0;
      if (sig.widget === 'catch') {
        const n = intBetween(s, sig.targets[0], sig.targets[1]);
        for (let i = 0; i < n; i++) {
          const a = t0 + (i / n) * (sig.life - 1.6);
          const x = between(s, 0, 6);
          const up = sig.kind === 'bubble' || sig.kind === 'drop';
          target(sig.kind, a, a + between(s, 1.4, 2), up ? path(x, 3.3, x + between(s, -1, 1), 1, x + between(s, -1, 1), -2.4) : path(x, -2.5, x + between(s, -1, 1), -1, x + between(s, -1, 1), 0.2));
        }
      } else if (sig.widget === 'sequence') {
        const n = intBetween(s, sig.targets[0], sig.targets[1]);
        const board = 6;
        for (let i = 0; i < board; i++) {
          const a = (i / board) * Math.PI * 2;
          target(sig.kind, t0, t0 + sig.life + 0.4 + n * 0.5 + 6, path(3 + 2.2 * Math.cos(a), -0.6 + 1.4 * Math.sin(a), 3, -0.6, 3 + 2.2 * Math.cos(a), -0.6 + 1.4 * Math.sin(a)));
        }
        const order: number[] = [];
        for (let i = 0; i < n; i++) order.push((intBetween(s, 0, board - 1) + (i > 0 && rand(s) < 0.5 ? 1 : 0)) % board);
        ev.widget = openSequence(s, owner, sig.life, board, order, bus);
      } else {
        target(sig.kind, t0, t0 + sig.life, path(3, 1, 3, 1, 3, 1));
        ev.widget = sig.widget === 'strike' ? openStrike(s, owner, sig.life, 1, between(s, 0.3, 0.7), bus) : openMash(s, owner, sig.life, `${owner}:0`, bus);
      }
      if (!ev.widget) ev.widget = openCatch(s, owner, sig.life, targets, bus);
      break;
    }
    case 'surface':
    case 'geode':
      break;
  }
  // Catch events take their targets; Sequence marks and Mash/Strike targets are entities too (B draws them), living
  // with the widget.
  if (!ev.widget && targets.length) ev.widget = openCatch(s, owner, def.warn + def.life, targets, bus);
  ev.of = ev.of || targets.length;
  s.event = ev;
  recordDealt(s, type);
  s.director.lastBeat = s.time;
  noteTappableSeen(s);
  if (first) s.meta.firstTime.push(`event:${type}`);
  bus?.emit('event:start', { id, type, widget: ev.widget?.kind ?? '', life: ev.ends - s.time, first, depth: s.run.depth });
  for (const tg of targets) bus?.emit('event:target', { event: id, id: tg.id, kind: tg.kind, t0: tg.t0, t1: tg.t1, path: tg.path, taps: tg.need });
  if (first) bus?.emit('firsttime', { id: `event.${type}` });
  return ev;
}

/** Change a generated cell (overrides survive window refills and saves). @returns false when the cell is not solid rock-like. */
export function setCell(s: IdleState, depth: number, col: number, kind: number, floor: number): boolean {
  const row = rowAt(s, depth);
  if (row) {
    const k = row.kinds[col];
    if (k === CELL.AIR || k === CELL.SEAL || k === CELL.GATE || k === CELL.CHEST || row.left[col] <= 0) return false;
    row.kinds[col] = kind;
    row.left[col] = 1;
  }
  const i = s.overrides.findIndex((o) => o.depth === depth && o.col === col);
  if (i >= 0) s.overrides.splice(i, 1);
  s.overrides.push({ depth, col, kind, floor });
  if (s.overrides.length > 64) s.overrides.splice(0, s.overrides.length - 64);
  return true;
}

/** The chest floor of an override chest cell at (depth, col) (0 when none). */
export function overrideFloor(s: IdleState, depth: number, col: number): number {
  return s.overrides.find((o) => o.depth === depth && o.col === col)?.floor ?? 0;
}

function tickEvent(s: IdleState, bus?: IdleBus): void {
  const ev = s.event;
  if (!ev) return;
  const w = ev.widget;
  if (w && w.kind === 'catch' && !w.done) {
    for (const id of catchExpire(s, w, ev.id, bus)) missTarget(s, ev, id, bus);
  }
  if (w && !w.done) expire(s, w, bus);
  // Passive events end when their rows pass or the window closes.
  if (ev.type === 'goldenVein' && (s.run.depth > ev.n || s.time >= ev.ends)) return endEvent(s, 'done', bus);
  if (ev.type === 'treasureMap' && (s.run.depth > ev.n || s.time >= ev.born + 300)) return endEvent(s, ev.caught > 0 ? 'done' : 'missed', bus);
  if (w?.done) return endEvent(s, w.result === 'done' ? 'done' : w.result === 'partial' ? 'partial' : 'missed', bus);
  if (!w && s.time >= ev.ends) endEvent(s, 'missed', bus);
}

/** An uncaught target left: Glimmerfall crystals shatter for 25 %; Cave-in boulders land as boulder cells. */
function missTarget(s: IdleState, ev: ActiveEvent, id: string, bus?: IdleBus): void {
  if (ev.type === 'glimmerfall') {
    const g = creditSeconds(s, EVENTS.glimmerfall.perTarget * GLIMMER.missPay, 'event', bus);
    ev.goldLog10 = addL(ev.goldLog10, g.log10());
  } else if (ev.type === 'caveIn') {
    const tg = (ev.widget as CatchWidget).targets.find((x) => x.id === id);
    const c = Math.max(0, Math.min(COLS - 1, Math.round(tg?.path.x1 ?? 3)));
    if (setCell(s, s.run.depth, c, CELL.BOULDER, 0)) bus?.emit('cells:change', { cells: [{ depth: s.run.depth, col: c, kind: CELL.BOULDER }], reason: 'caveIn' });
  }
}

function addL(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  return m + L10(1 + Math.pow(10, -Math.abs(a - b)));
}

/** A tap on an event entity (`event:<eventId>:<n>`). @returns true when it counted. */
export function eventTap(s: IdleState, id: string, bus?: IdleBus): boolean {
  const ev = s.event;
  if (!ev || !id.startsWith(`event:${ev.id}:`)) return surfaceTap(s, id, bus);
  const w = ev.widget;
  if (!w || w.done) return false;
  if (w.kind === 'catch') {
    const left = catchHit(s, w, id, ev.id, bus);
    if (left < 0) return false;
    if (left === 0) onCaught(s, ev, id, bus);
    return true;
  }
  if (w.kind === 'mash') {
    mashTap(w as MashWidget, bus);
    bus?.emit('event:hit', { event: ev.id, id, left: 0, caught: false });
    return true;
  }
  if (w.kind === 'sequence') {
    const mark = Number(id.slice(id.lastIndexOf(':') + 1));
    const r = sequenceTap(s, w as SequenceWidget, mark, bus);
    return r !== 'wait';
  }
  if (w.kind === 'strike') {
    strikeStop(s, w as StrikeWidget, bus);
    return true;
  }
  if (w.kind === 'pick') return false;
  return false;
}

/** A Catch target was taken: its reward now (each crystal, seed pod, boulder), the crate opens its Pick. */
function onCaught(s: IdleState, ev: ActiveEvent, id: string, bus?: IdleBus): void {
  ev.caught++;
  s.meta.caught.targets = (s.meta.caught.targets ?? 0) + 1;
  s.meta.lastUsed.event = s.playTime;
  const def = EVENTS[ev.type as EventType];
  const tg = (ev.widget as CatchWidget).targets.find((x) => x.id === id);
  const col = Math.round(tg?.path.x1 ?? 3);
  if (def.perTarget > 0) {
    const g = creditSeconds(s, def.perTarget, 'event', bus, col, s.run.depth);
    ev.goldLog10 = addL(ev.goldLog10, g.log10());
  }
  if (ev.type === 'glimmerfall' && ev.caught % GLIMMER.gemEvery === 0) {
    creditGems(s, 1, 'event', bus, col, s.run.depth);
    ev.gems++;
  }
  if (ev.type === 'supplyRope') {
    // The crate opens: Pick 1 of 3 boosts.
    const cards = [...ROPE_BOOSTS].sort(() => rand(s) - 0.5).slice(0, 3);
    close(ev.widget as CatchWidget, 'done');
    ev.widget = openPick(s, `event:${ev.id}`, 30, cards, bus);
  }
  bus?.emit('entity:done', { id, kind: tg?.kind ?? '', reward: '' });
}

/** Pick a Supply Rope card (the UI's Pick widget). */
export function pickBoost(s: IdleState, i: number, bus?: IdleBus): string {
  const ev = s.event;
  if (!ev || ev.widget?.kind !== 'pick') return '';
  const id = pickCard(ev.widget as PickWidget, i, bus);
  if (!id) return '';
  s.run.boosts[id] = { end: s.time + ROPE_SECONDS, mult: id === 'crew2' ? 2 : id === 'ores3' ? 3 : id === 'crit25' ? 0.25 : 1 };
  invalidateMults(s);
  bus?.emit('boost:start', { id, until: s.time + ROPE_SECONDS, mult: s.run.boosts[id].mult });
  return id;
}

/** Is a Supply Rope boost on? */
export function boostOn(s: IdleState, id: RopeBoost | 'storm'): boolean {
  const b = s.run.boosts[id];
  return !!b && b.end > s.time;
}

/** End the live event: its rewards by result, event:end, the beat. */
export function endEvent(s: IdleState, result: 'done' | 'partial' | 'missed', bus?: IdleBus): void {
  const ev = s.event;
  if (!ev) return;
  s.event = null;
  const w = ev.widget;
  if (w && !w.done) close(w, result === 'done' ? 'done' : result === 'partial' ? 'partial' : 'missed', bus);
  const extras: string[] = [];
  const page = currentPage(s);
  const pay = (secs: number) => {
    const g = creditSeconds(s, secs, 'event', bus);
    ev.goldLog10 = addL(ev.goldLog10, g.log10());
  };
  switch (ev.type) {
    case 'seedFall':
      if (ev.caught > 0 && ev.caught === ev.of) {
        pay(EVENTS.seedFall.perTarget * ev.of * 2); // all = ×3
        s.meta.caught.seedsAll = (s.meta.caught.seedsAll ?? 0) + 1;
      }
      break;
    case 'rattlingBricks':
      if (ev.caught > 0) openChest(s, `event:${ev.id}`, 1, 'event', bus);
      break;
    case 'caveIn':
      if (ev.caught > 0 && ev.caught === ev.of) {
        creditGems(s, 1, 'event', bus);
        ev.gems++;
      }
      break;
    case 'wedgedChest':
      if (ev.caught > 0) openChest(s, `event:${ev.id}`, 2, 'event', bus);
      else {
        const cid = `chest:${s.nextId++}`;
        s.chests.push({ id: cid, col: 3, depth: s.run.depth, floor: 0, at: s.time });
        bus?.emit('chest:exposed', { id: cid, col: 3, depth: s.run.depth, floor: 'wood' });
      }
      break;
    case 'ancientEcho':
      if (result === 'done') {
        const lore = readNote(s, page, bus);
        if (lore) extras.push(`lore:${lore}`);
        creditGems(s, ECHO_GEMS, 'event', bus);
        ev.gems += ECHO_GEMS;
      }
      break;
    case 'signature': {
      if (w?.kind === 'mash') {
        const tier = mashTier(w as MashWidget);
        if (tier > 0) pay(MASH_PAY[tier - 1]);
        if (tier >= 2) {
          const f = rollFind(s, 'fossil', page, bus, 40);
          if (f) extras.push(`find:${f}`);
        }
      } else if (result !== 'missed') {
        const full = result === 'done';
        pay(full ? EVENTS.signature.allBonus : EVENTS.signature.allBonus / 3);
        if (full) {
          const f = rollFind(s, 'rare', page, bus, 40);
          if (f) extras.push(`find:${f}`);
        }
      }
      break;
    }
    default:
      break;
  }
  if (result !== 'missed' || ev.caught > 0) {
    s.meta.stats.events++;
    s.meta.caught[ev.type] = (s.meta.caught[ev.type] ?? 0) + 1;
    addXp(s, XP.event);
  }
  s.director.lastBeat = s.time;
  bus?.emit('event:end', { id: ev.id, type: ev.type, result, gold: Number.isFinite(ev.goldLog10) ? Big.fromLog10(ev.goldLog10) : Big.zero(), gems: ev.gems, caught: ev.caught, of: ev.of, extras });
}

/** The Treasure Map's chest was broken (shaft.ts tells the Director when an override chest pops). */
export function mapChestFound(s: IdleState): void {
  if (s.event?.type === 'treasureMap') s.event.caught = 1;
}

/** Force an event now (debug, tests, the tutorial's scripted Glimmerfall). */
export function forceEvent(s: IdleState, type: string, bus?: IdleBus): boolean {
  if (!(type in EVENTS)) return false;
  if (type === 'geode') {
    openGeode(s, s.run.depth, 3, bus);
    return true;
  }
  if (type === 'surface') {
    surface(s, bus);
    return true;
  }
  if (s.event) endEvent(s, 'missed', bus);
  return !!startEvent(s, type as EventType, bus);
}

// ----- standalone widgets: geodes and micro-surfacings ------------------------------------------------------

/** A geode cell broke: its Strike (3 needles) waits in the rock. */
export function openGeode(s: IdleState, depth: number, col: number, bus?: IdleBus): void {
  const w = openStrike(s, 'geode', Infinity, GEODE.needles, 0.3 + rand(s) * 0.4, bus);
  s.widgets.push(w);
  if (!s.meta.firstTime.includes('event:geode')) {
    s.meta.firstTime.push('event:geode');
    bus?.emit('firsttime', { id: 'event.geode' });
  }
  void depth;
  void col;
}

/** A geode's Strike closed: perfect a rare Find + 5 gems; good a Find roll; miss 2 gems. */
export function geodeDone(s: IdleState, w: StrikeWidget, bus?: IdleBus): void {
  const g = bestGrade(w);
  const page = currentPage(s);
  if (g === 'perfect') {
    rollFind(s, 'rare', page, bus, 1, true);
    creditGems(s, GEODE.perfectGems, 'event', bus);
  } else if (g === 'good') rollFind(s, 'rare', page, bus, 20);
  else creditGems(s, GEODE.missGems, 'event', bus);
  s.meta.stats.events++;
  addXp(s, XP.event);
}

/** The find guarantee: a micro-surfacing (a gem glints out of the wall, a critter, an ore pebble). */
function surface(s: IdleState, bus?: IdleBus): void {
  const d = s.director;
  d.findQuiet = 0;
  const kinds = ['gem', 'critter', 'pebble'] as const;
  const kind = kinds[Math.floor(rand(s) * kinds.length)];
  const id = `event:s${s.nextId++}:0`;
  const left = rand(s) < 0.5;
  const life = EVENTS.surface.life;
  const p = kind === 'pebble' ? path(left ? 0.5 : 5.5, -2.2, 3, -1.5, left ? 5.5 : 0.5, -0.3) : path(left ? -0.7 : 6.7, between(s, -1.5, 1.5), left ? -0.4 : 6.4, between(s, -1.5, 1.5), left ? -0.2 : 6.2, between(s, -1.5, 1.5));
  const tg: EventTarget = { id, kind, t0: s.time, t1: s.time + life, path: p, need: 1, hits: 0, state: 'live' };
  const w = openCatch(s, 'surface', life, [tg], bus);
  s.widgets.push(w);
  bus?.emit('find:surface', { id, kind, col: left ? 0 : 6, depth: s.run.depth, life });
  bus?.emit('event:target', { event: 'surface', id, kind, t0: tg.t0, t1: tg.t1, path: p, taps: 1 });
}

function surfaceTap(s: IdleState, id: string, bus?: IdleBus): boolean {
  for (const w of s.widgets) {
    if (w.kind !== 'catch' || w.owner !== 'surface' || w.done) continue;
    const left = catchHit(s, w, id, 'surface', bus);
    if (left === 0) {
      const tg = w.targets.find((x) => x.id === id);
      creditSeconds(s, EVENTS.surface.perTarget, 'tappable', bus);
      if (tg?.kind === 'gem') creditGems(s, 1, 'tappable', bus);
      bus?.emit('entity:done', { id, kind: tg?.kind ?? 'gem', reward: '' });
      return true;
    }
    if (left > 0) return true;
  }
  return false;
}

/** Standalone widgets (geodes, the seal finisher, micro-surfacings): expiry and cleanup. */
function tickStandalone(s: IdleState, bus?: IdleBus): void {
  if (!s.widgets.length) return;
  for (const w of s.widgets) {
    if (w.done) continue;
    if (w.kind === 'catch') catchExpire(s, w, w.owner, bus);
    expire(s, w, bus);
  }
  for (let i = s.widgets.length - 1; i >= 0; i--) if (s.widgets[i].done) s.widgets.splice(i, 1);
}

// ----- the boredom breaker and the Codex pity ---------------------------------------------------------------

function plantIn(s: IdleState, from: number, to: number, kind: number, floor: number, reason: string, bus?: IdleBus): boolean {
  for (let tries = 0; tries < 8; tries++) {
    const dep = s.run.depth + intBetween(s, from, to);
    const c = intBetween(s, 0, COLS - 1);
    if (setCell(s, dep, c, kind, floor)) {
      bus?.emit('cells:change', { cells: [{ depth: dep, col: c, kind: kind as CellKind }], reason });
      return true;
    }
  }
  return false;
}

function boredSpecial(s: IdleState, bus?: IdleBus): void {
  s.director.specialQuiet = 0;
  plantIn(s, 1, 2, rand(s) < 0.6 ? CELL.RICH : CELL.GEM, 0, 'boredom', bus);
}

/** The Codex pity: a geode or fossil cell sure to hold a new entry (override floor −2), in the next 6 rows. */
function codexPity(s: IdleState, bus?: IdleBus): void {
  s.director.codexQuiet = 0;
  if (!pageIncomplete(s, currentPage(s))) return;
  plantIn(s, 1, 6, rand(s) < 0.5 ? CELL.FOSSIL : CELL.GEODE, -2, 'codexPity', bus);
}

/** A planted pity cell broke: a new entry for sure. */
export function pityFind(s: IdleState, kind: number, bus?: IdleBus): string {
  return rollFind(s, kind === CELL.FOSSIL ? 'fossil' : 'rare', currentPage(s), bus, 1, true);
}

/** The ruler's "next event in N s" (Infinity when nothing is announced). */
export function nextEventIn(s: IdleState): { type: string; inSeconds: number } | null {
  const d = s.director;
  return d.announced && d.next ? { type: d.next, inSeconds: Math.max(0, d.wait) } : null;
}
