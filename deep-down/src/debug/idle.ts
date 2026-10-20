// window.__DD__.idle (SPEC §12.4): the test and support surface of the idle game. End-to-end tests drive
// the game with REAL touches (tests/e2e/touch.ts) and use this only to set up a state or read results.
// The type is shared with the e2e specs (tests/e2e/dd.ts imports it), so both sides compile together.

/** The goal bar as shown. */
export interface IdleGoalView {
  /** The line on the bar ('' when nothing is shown: never in play). */
  text: string;
  /** The fill shown, 0..1. */
  fill: number;
  /** The goal's id (the Path step, the tutorial step, 'near:*', 'fallback'). */
  id: string;
  /** The bar is laid out and visible (display, opacity, inside the viewport). */
  visible: boolean;
  /** The ETA text ('' when none). */
  eta: string;
}

/** Live FX counts (F12) and the flashes of the last second (F8). */
export interface IdleFxView {
  numbers: number;
  tokens: number;
  particles: number;
  shards: number;
  /** Full-screen flashes started in the last 1,000 ms, with their intensity. */
  flashes: number[];
  /** Live trauma 0..1 and the kick offset in px (Reduced motion: both 0). */
  trauma: number;
  kick: number;
  /** A hit-stop holds the FX clock right now. */
  hitStop: boolean;
  /** The last token flights: launch, scheduled arrival and landing (performance.now() ms; landed 0 while flying). */
  flights: Array<{ kind: string; launched: number; due: number; landed: number }>;
}

/** The display ledger (SPEC §10.6): shown = actual − in flight. Values are display strings and log10. */
export interface IdleLedgerView {
  actual: string;
  shown: string;
  actualLog10: number;
  shownLog10: number;
  /** Gold tokens in flight. */
  inFlight: number;
  /** The gold counter's text right now. */
  counter: string;
  /** The value the counter shows (log10; −Infinity at 0) and whether a scripted count is running (big gains). */
  counterLog10: number;
  scripted: boolean;
}

/** The 7 column strips at the floor row and the world region, in CSS px. */
export interface IdleColumnsView {
  strips: Array<{ left: number; right: number }>;
  floorY: number;
  region: { top: number; bottom: number; left: number; right: number };
}

/** The HUD's interactive rects (ui-check and the e2e taps). */
export interface IdleHudView {
  /** id → rect, for every visible control (quick-buy cards, tabs, sheet rows, Collect, menu). */
  rects: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }>;
  /** Which sheet is open ('' when none). */
  sheet: string;
  /** Quick-buy slots: the card id in each slot and its state. */
  quick: Array<{ slot: number; id: string; state: 'locked' | 'poor' | 'near' | 'ready' | 'hidden'; best: boolean; level: number }>;
  /** The legacy-save notice is on screen. */
  legacyNotice: boolean;
  /** The return feast is on screen (and its phase). */
  feast: '' | 'counting' | 'collect' | 'rack';
  /** The tutorial guide (ghost hand) target id, '' when hidden. */
  guide: string;
}

export interface IdleDebug {
  /** True once the first frame of the shaft drew. */
  ready: boolean;
  /** 'boot' | 'menu' | 'playing' | 'paused' | 'crashed'. */
  mode(): string;
  /** A JSON snapshot of the model (IdleState, Big values as [m, e]). */
  state(): any;
  goal(): IdleGoalView;
  fx(): IdleFxView;
  /** Frames from each recent `pointerdown` to its first changed frame (F1), oldest first, ≤ 256. */
  lastTapFrames(): number[];
  /** How the recent taps resolved: the column hit (−1: none), the cell row, the kind. */
  lastTaps(): Array<{ x: number; y: number; col: number; raw: number; row: number; kind: string; counted: boolean; entity: string }>;
  ledger(): IdleLedgerView;
  columns(): IdleColumnsView;
  hud(): IdleHudView;
  /** Fast-forward `seconds` with the crew only (no taps), at the model's analytic speed. */
  advance(seconds: number): void;
  setDepth(m: number): void;
  give(p: { gold?: number | string; gems?: number; embers?: number }): void;
  forceEvent(id: string): boolean;
  forceChest(tier: string): boolean;
  /** Jump to 2 m above the next seal. */
  toSeal(): void;
  /** Rewind savedAt by `hours`, save and reload the page (the offline return). */
  offline(hours: number): void;
  /** Frame, slab and light timings (ms). */
  perf(): { frameMs: number; p95FrameMs: number; slabMs: number; lightMs: number; fps: number };
  /** Shader program count (P3). */
  programs(): number;
  /** Save now (bypasses the autosave timer). @returns success. */
  save(): boolean;
  /**
   * Recent IdleEvents and the shell's (game:saved, game:mode), newest last, ≤ 512; cleared by clearEvents(). `t` is
   * performance.now() ms, `mt` the model clock (s) when it fired.
   */
  events(name?: string): Array<{ name: string; payload: any; t: number; mt: number }>;
  clearEvents(): void;
  /** Settings now, and a patch (as the Settings sheet would). */
  settings(patch?: Record<string, unknown>): any;
  /** Frames drawn since boot (a frame counter for per-frame sampling). */
  frame(): number;
  /** The model clock (s) and the tutorial: the current step ('' after the last), its index, whether it began. */
  tutorial(): { time: number; id: string; index: number; started: boolean; done: boolean };
  /** Where the ghost hand points now (CSS px), or null when it is hidden. */
  guidePoint(): { id: string; x: number; y: number } | null;
  /** The model clock's speed against the wall clock (1: real time); sets it when given. @returns the speed. */
  timeScale(k?: number): number;
  /** Ceremonies (SPEC §10.8): what runs now (id, tier, local ms), every one started so far, and how many wait. */
  ceremonies(): IdleCeremonyView;
  /**
   * The capture hook (debug only): play ceremony `id` now (with a representative payload) and, when `t` is given, hold
   * it at `t` ms so a screenshot shows a fixed frame. `ceremony('', -1)` releases a held one. @returns false when unknown.
   */
  ceremony(id: string, t?: number): boolean;
  /** The open widget (SPEC §7.3): its kind, event id and tappable targets in CSS px (null when none). */
  widget(): IdleWidgetView | null;
  /** Set-up helpers (debug only): end the tutorial; queue a facet hand (as a broken seal would). */
  skipTutorial(): void;
  facetHand(): boolean;
}

/** The ceremony director's state. */
export interface IdleCeremonyView {
  live: Array<{ id: string; tier: number; t: number }>;
  log: Array<{ id: string; tier: number; t: number; demoted: boolean }>;
  waiting: number;
  /** A T4/T5 runs (toasts wait, particles at 50 %). */
  exclusive: boolean;
}

/** The open widget. */
export interface IdleWidgetView {
  kind: string;
  eventId: string;
  targets: Array<{ id: string; x: number; y: number; r: number }>;
}

/** Install `window.__DD__.idle` (and keep `window.__DD__` itself as the container). */
export function installIdleDebug(api: IdleDebug): void {
  const w = window as unknown as { __DD__?: Record<string, unknown> };
  w.__DD__ = { ...(w.__DD__ ?? {}), idle: api };
}

// ---------------------------------------------------------------------------------------------------------------
// The implementation over the running game.

import { Big } from '../core/big';
import { nextSealDepth, resetWindow } from '../idle/model/shaft';
import { openSealsThrough } from '../idle/model/seals';
import { currentStep } from '../idle/model/tutorial';
import { biomeAt } from '../idle/config/biomes';
import { format } from '../idle/num/notation';
import { stateToSave } from '../save/saveData';
import { forceEvent as modelForceEvent } from '../idle/model/director';
import { skipTutorial as modelSkipTutorial } from '../idle/model/tutorial';
import { queueHand } from '../idle/model/facets';
import type { IdleGame } from '../game/IdleGame';
import { debugMutationsAllowed } from './DebugApi';

const typedReplacer = (_k: string, v: unknown): unknown => (ArrayBuffer.isView(v) ? Array.from(v as unknown as ArrayLike<number>) : v);

/** Build `window.__DD__.idle` for a running game. Mutating helpers work under automation or ?debug=1 only. */
export function installIdleSurface(g: IdleGame): void {
  const allowed = debugMutationsAllowed();
  const gate = <A extends unknown[], R>(fn: (...a: A) => R, none: R) => (allowed ? fn : (..._a: A) => none);
  const rectOf = (el: Element | null) => {
    if (!el) return { x: 0, y: 0, w: 0, h: 0, visible: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && !el.closest('.hide');
    return { x: r.left, y: r.top, w: r.width, h: r.height, visible };
  };
  const setDepth = (m: number) => {
    const s = g.state;
    const d = Math.max(0, Math.floor(m));
    // Every seal above is opened (a jump never strands the floor on a fight it skipped).
    openSealsThrough(s, biomeAt(d));
    s.run.depth = d;
    s.run.dmax = Math.max(s.run.dmax, d);
    s.meta.record = Math.max(s.meta.record, d);
    resetWindow(s, d);
    void g.scene.jump(d);
  };
  const api: IdleDebug = {
    get ready() {
      return g.ready && g.frames > 0;
    },
    mode: () => g.mode,
    state: () => JSON.parse(JSON.stringify(g.state, typedReplacer)),
    goal: () => {
      const bar = g.ui.hud.goal;
      const r = rectOf(bar.el);
      const vh = window.innerHeight;
      return { text: bar.value, fill: bar.fill, id: bar.id_, visible: r.visible && r.y >= 0 && r.y + r.h <= vh, eta: bar.el.querySelector('.dd-goal-eta')?.textContent ?? '' };
    },
    fx: () => {
      const now = performance.now();
      const fx = g.ui.fx;
      const b = g.cam.budget;
      return {
        numbers: fx.liveNumbers,
        tokens: fx.liveTokens,
        particles: fx.liveSparks,
        shards: g.scene.debug.debris().live,
        flashes: b.recentFlashes(now),
        trauma: g.scene.rig.traumaNow,
        kick: g.scene.rig.kickPx,
        hitStop: b.stopped(now),
        flights: fx.flights(),
      };
    },
    lastTapFrames: () => [...g.dig.tapFrames],
    lastTaps: () => g.dig.records.map((r) => ({ x: r.x, y: r.y, col: r.col, raw: r.raw, row: r.row, kind: r.kind, counted: r.counted, entity: r.entity })),
    ledger: () => {
      const actual = g.state.run.gold;
      const shown = g.gold.shown(actual);
      return {
        actual: format(actual),
        shown: format(shown),
        actualLog10: actual.isZero() ? -Infinity : actual.log10(),
        shownLog10: shown.isZero() ? -Infinity : shown.log10(),
        inFlight: g.gold.count,
        counter: g.ui.hud.top.gold.roll.value,
        counterLog10: g.ui.hud.top.gold.shown,
        scripted: g.ui.hud.top.gold.counting,
      };
    },
    columns: () => {
      const s = g.scene.columns();
      const w = (s.right - s.left) / 7;
      const strips = [];
      for (let c = 0; c < 7; c++) strips.push({ left: s.left + c * w, right: s.left + (c + 1) * w });
      const l = g.ui.hud.layoutNow;
      return { strips, floorY: s.floorY, region: l ? { ...l.region } : { top: 0, bottom: 0, left: 0, right: 0 } };
    },
    hud: () => {
      const hud = g.ui.hud;
      const rects: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }> = {};
      for (const el of g.ui.el.querySelectorAll<HTMLElement>('[data-hud], [data-card], [data-tab], [data-skill], [data-mode], .dd-sheet .dd-card, .dd-screen button')) {
        const key = el.dataset.hud ? `hud:${el.dataset.hud}` : el.dataset.tab ? `tab:${el.dataset.tab}` : el.dataset.skill ? `skill:${el.dataset.skill}` : el.dataset.mode ? `mode:${el.dataset.mode}` : el.dataset.slot !== undefined ? `quick:${el.dataset.slot}` : el.dataset.card ? `card:${el.dataset.card}` : el.dataset.key ? `btn:${el.dataset.key}` : '';
        if (key) rects[key] = rectOf(el);
      }
      return {
        rects,
        sheet: hud.sheets.open ?? '',
        quick: hud.quick.cards.map((c, i) => ({ slot: i, id: c.id, state: (hud.quick.revealed(i) ? c.state : 'hidden') as 'locked' | 'poor' | 'near' | 'ready' | 'hidden', best: !!c.view?.best, level: c.view?.level ?? 0 })),
        legacyNotice: !!g.ui.el.querySelector('[data-hud="legacy"]'),
        feast: hud.feast.phase,
        guide: hud.guide.targetId,
      };
    },
    advance: gate((seconds: number) => g.advance(seconds), undefined),
    setDepth: gate(setDepth, undefined),
    give: gate((p: { gold?: number | string; gems?: number; embers?: number }) => {
      const gold = p.gold === undefined ? Big.zero() : typeof p.gold === 'string' ? Big.parse(p.gold) : Big.from(p.gold);
      g.give(gold, p.gems ?? 0);
      if (p.embers) g.state.meta.embers.addIn(p.embers);
    }, undefined),
    forceEvent: gate((id: string) => {
      const ok = modelForceEvent(g.state, id, g.events);
      if (ok) g.state.time += 0;
      return ok;
    }, false),
    forceChest: gate((tier: string) => {
      // A chest pops out on the floor and waits for a real tap (its roll-up starts at `tier`).
      const floor = Math.max(0, ['wood', 'copper', 'crystal', 'reliquary', 'lintel'].indexOf(tier));
      const s = g.state;
      const id = `chest:${s.nextId++}`;
      s.chests.push({ id, col: 3, depth: s.run.depth, floor, at: s.time });
      g.events.emit('chest:exposed', { id, col: 3, depth: s.run.depth, floor: (['wood', 'copper', 'crystal', 'reliquary', 'lintel'] as const)[floor] });
      return true;
    }, false),
    toSeal: gate(() => {
      const d = nextSealDepth(g.state, g.state.run.depth);
      if (Number.isFinite(d)) setDepth(Math.max(0, d - 2));
    }, undefined),
    offline: gate((hours: number) => {
      const s = g.state;
      const data = stateToSave(s);
      data.savedAt = Date.now() - hours * 3600_000;
      g.saves.save(data);
      // The reload's pagehide must not overwrite the planted save with a fresh savedAt.
      g.savesHeld = true;
      location.reload();
    }, undefined),
    perf: () => {
      const f = [...g.frameTimes].sort((a, b) => a - b);
      const s = g.scene.debug.slabs();
      return { frameMs: g.frameMs, p95FrameMs: f.length ? f[Math.floor(f.length * 0.95)] : 0, slabMs: s.lastApplyMs, lightMs: 0, fps: g.fps };
    },
    programs: () => g.scene.programs(),
    save: () => g.saveNow('debug'),
    events: (name?: string) => g.recentEvents(name).map((e) => ({ name: e.name, payload: JSON.parse(JSON.stringify(e.payload ?? null)), t: e.t, mt: e.mt })),
    clearEvents: () => g.clearEvents(),
    settings: (patch?: Record<string, unknown>) => {
      if (patch && allowed) g.updateSettings(patch);
      return { ...g.settings };
    },
    frame: () => g.frames,
    tutorial: () => {
      const s = g.state;
      return { time: s.time, id: currentStep(s)?.id ?? '', index: s.tutorial.index, started: s.tutorial.since >= 0, done: s.tutorial.done || s.meta.tutorial.done };
    },
    timeScale: (k?: number) => {
      if (allowed && k !== undefined && Number.isFinite(k) && k > 0) g.modelScale = Math.min(4, k);
      return g.modelScale;
    },
    ceremonies: () => g.ceremonyView(),
    ceremony: gate((id: string, t?: number) => g.debugCeremony(id, t), false),
    widget: () => g.widgetView(),
    skipTutorial: gate(() => {
      modelSkipTutorial(g.state, g.events);
      for (const id of ['gold', 'depth', 'quick1', 'quick2', 'quick3', 'digTab', 'crewTab', 'ruler', 'buyMode', 'combo', 'surge']) g.ui.hud.reveal(id, true);
    }, undefined),
    facetHand: gate(() => {
      queueHand(g.state, g.events);
      return !!g.state.hand;
    }, false),
    guidePoint: () => {
      const gh = g.ui.hud.guide;
      const c = gh.current;
      return gh.targetId && c ? { id: gh.targetId, x: c.x, y: c.y } : null;
    },
  };
  installIdleDebug(api);
  // Internals for on-device debugging (read-only use).
  (window as unknown as { __DD__: Record<string, unknown> }).__DD__.internals = { fx: g.ui.fx, game: g };
}
