/**
 * Round 3 (UI): the taught-by-doing tutorial's presentation (LOOP owns the steps). One step at a
 * time: a ring round the control the step names (`[data-ui-target]`, ui/hud/actions UiTargetId),
 * a short line in a bubble beside it, the step count and a Skip button. Also the first-time
 * tooltips: a bubble by a control the first time it appears (once per install).
 */
import { t } from '../../i18n';
import { h } from '../dom';
import type { UiHighlighter, UiTargetId } from './actions';
import type { TutorialView } from '../types';

const TIPS_KEY = 'deepdown.tips';

/** Where the ring goes while a step's own control is hidden (a selector for what reveals it). */
const TARGET_VIA: Partial<Record<UiTargetId, string>> = {
  place: '.dd-hslot[data-placeable="1"]',
};

function loadTips(): Set<string> {
  try {
    const raw = globalThis.localStorage?.getItem(TIPS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function saveTips(s: Set<string>): void {
  try {
    globalThis.localStorage?.setItem(TIPS_KEY, JSON.stringify([...s]));
  } catch {
    // Private windows refuse storage: the tips simply show again next time.
  }
}

/** Where a bubble goes beside a target rect (pure, unit-tested): above it, else below, kept on screen. */
export function bubblePlacement(
  rect: { left: number; top: number; width: number; height: number },
  bubble: { width: number; height: number },
  view: { width: number; height: number },
  margin = 10,
  cluster?: { left: number; top: number; width: number; height: number },
): { x: number; y: number; side: 'above' | 'below' | 'left' | 'right'; tip: number } {
  // A control in the action pads (`cluster`: their bounds): the bubble clears the whole cluster, so
  // it never sits on the other pads the player is about to need.
  const a = cluster ?? rect;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const x = Math.max(margin, Math.min(view.width - bubble.width - margin, cx - bubble.width / 2));
  // The pointer aims at the control even when the bubble is pushed along the edge.
  const tipX = Math.max(14, Math.min(bubble.width - 14, cx - x));
  const above = a.top - bubble.height - margin;
  if (above >= margin + 40) return { x, y: above, side: 'above', tip: tipX };
  if (cluster) {
    // No room above the pads (a landscape phone): beside them, on the open side of the screen.
    const y = Math.max(margin, Math.min(view.height - bubble.height - margin, cy - bubble.height / 2));
    const tipY = Math.max(14, Math.min(bubble.height - 14, cy - y));
    if (a.left - bubble.width - margin >= margin) return { x: a.left - bubble.width - margin, y, side: 'left', tip: tipY };
    if (a.left + a.width + margin + bubble.width <= view.width - margin) return { x: a.left + a.width + margin, y, side: 'right', tip: tipY };
  }
  return { x, y: Math.min(view.height - bubble.height - margin, a.top + a.height + margin), side: 'below', tip: tipX };
}

type Box = { left: number; top: number; width: number; height: number };

/** After a tutorial bubble goes, a tip waits this long: the next step's bubble often comes at once. */
export const TIP_AFTER_BUBBLE_MS = 1500;

/**
 * Whose turn a first-use tip has (QA 01:31: the Place tip drawn under the step 7 bubble): one notice
 * at a time, a tutorial bubble first. 'wait': it waits (shown once the bubble has gone a moment);
 * 'show': now.
 */
export function tipTurn(s: { bubbleUp: boolean; held: boolean; tipUp: boolean; sinceBubbleMs: number }): 'wait' | 'show' {
  return s.bubbleUp || s.held || s.tipUp || s.sinceBubbleMs < TIP_AFTER_BUBBLE_MS ? 'wait' : 'show';
}

/**
 * bubblePlacement that also keeps clear of `avoid`, a control the bubble must not cover: the
 * Interact chip shares the band above the pads (QA 01:43: the Place tip sat on "Craft / Workbench").
 * A bubble that would cover it clears both, the control it points at and the one it avoids.
 */
export function bubbleClear(rect: Box, bubble: { width: number; height: number }, view: { width: number; height: number }, margin: number, avoid: Box | null): ReturnType<typeof bubblePlacement> {
  const p = bubblePlacement(rect, bubble, view, margin);
  if (!avoid || avoid.width <= 0 || avoid.height <= 0) return p;
  const covers = p.x < avoid.left + avoid.width && p.x + bubble.width > avoid.left && p.y < avoid.top + avoid.height && p.y + bubble.height > avoid.top;
  if (!covers) return p;
  const left = Math.min(rect.left, avoid.left);
  const top = Math.min(rect.top, avoid.top);
  const both = { left, top, width: Math.max(rect.left + rect.width, avoid.left + avoid.width) - left, height: Math.max(rect.top + rect.height, avoid.top + avoid.height) - top };
  return bubblePlacement(rect, bubble, view, margin, both);
}

/** The bounds of the visible action pads (Action, Jump, Dash, Sonar, Place), or null. */
function padCluster(scope: ParentNode): { left: number; top: number; width: number; height: number } | null {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let b = -Infinity;
  for (const el of scope.querySelectorAll<HTMLElement>('.dd-pad-btn')) {
    const pr = el.getBoundingClientRect();
    if (pr.width <= 0 || pr.height <= 0 || el.hidden) continue;
    l = Math.min(l, pr.left);
    t = Math.min(t, pr.top);
    r = Math.max(r, pr.right);
    b = Math.max(b, pr.bottom);
  }
  return l < r ? { left: l, top: t, width: r - l, height: b - t } : null;
}

export class TutorialOverlay implements UiHighlighter {
  readonly el: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly bubble: HTMLElement;
  private readonly lineEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly skipBtn: HTMLButtonElement;
  private readonly tipEl: HTMLElement;
  private target: UiTargetId | null = null;
  /** The element the ring is on now (its class marks it; it may be a stand-in, see TARGET_VIA). */
  private ringedEl: HTMLElement | null = null;
  private stepKey = '';
  private placedFor = '';
  private placedAt = 0;
  private tipTimer = 0;
  private tipFor: string | null = null;
  private tipTarget: UiTargetId = 'action';
  private tipMs = 4200;
  /** First-use tips waiting their turn (a bubble or another tip was up), oldest first. */
  private pendingTips: Array<{ id: string; target: UiTargetId; text: string; ms: number }> = [];
  /** When the bubble last went (performance.now()); the tips' pump was tried. */
  private bubbleOffAt = -1e9;
  private tipPumpAt = 0;
  private readonly tips = loadTips();
  /** The ghost finger that shows a gesture with no control of its own (look: drag on the view). */
  private readonly swipe: HTMLElement;
  /** performance.now() until which the bubble steps aside (a biome arrival card is up). */
  private heldUntil = 0;
  private held = false;
  /** The step shown last (a higher one next means a step was done). */
  private lastStep = 0;
  /** Where the bubble was placed last (CSS px, its top and bottom edges). */
  private bubbleTop = 0;
  private bubbleBottom = 0;
  private passTimer = 0;

  constructor(private readonly scope: HTMLElement, onSkip: () => void) {
    this.ring = h('div', { class: 'dd-tut-ring', 'aria-hidden': 'true' });
    this.lineEl = h('p', { class: 'dd-tut-line' });
    this.countEl = h('span', { class: 'dd-tut-count' });
    this.skipBtn = h('button', { class: 'dd-tut-skip', type: 'button', text: t('tut.skip') });
    this.skipBtn.addEventListener('click', () => onSkip());
    this.bubble = h('div', { class: 'dd-tut-bubble', role: 'status', 'aria-live': 'polite', 'data-touch-ignore': '' }, h('div', { class: 'dd-tut-head' }, this.countEl, this.skipBtn), this.lineEl);
    this.tipEl = h('div', { class: 'dd-tip', role: 'status' });
    this.swipe = h('div', { class: 'dd-tut-swipe', 'aria-hidden': 'true' }, h('span', { class: 'dd-tut-finger' }), h('span', { class: 'dd-tut-trail' }));
    this.el = h('div', { class: 'dd-tut' }, this.ring, this.swipe, this.bubble, this.tipEl);
  }

  /** A tutorial step (one of LOOP's, counted) is on screen now. */
  get active(): boolean {
    return this.el.classList.contains('on') && this.lastStep > 0;
  }

  /** UiHighlighter: ring one control (null clears), with its line. */
  highlight(target: UiTargetId | null, line: string | null = null): void {
    this.show(target === null && !line ? null : { target, line: line ?? '', step: 0, total: 0 });
  }

  /**
   * Step aside for `ms` (a biome arrival card is up: the card first, then the step). 0 ends a
   * hold at once (the card was dismissed).
   */
  suspend(ms: number): void {
    this.heldUntil = ms > 0 ? performance.now() + ms : 0;
    this.updateHeld();
  }

  private updateHeld(): void {
    const held = performance.now() < this.heldUntil;
    if (held === this.held) return;
    this.held = held;
    this.el.classList.toggle('held', held);
    // Back from a hold: measure again (the layout may have moved meanwhile).
    if (!held) this.placedFor = '';
  }

  /** The tutorial step to show (from the HUD snapshot), or null. Cheap when unchanged. */
  show(v: TutorialView | null): void {
    this.updateHeld();
    this.pumpTips();
    const key = v ? `${v.target}|${v.line}|${v.step}|${v.total}` : '';
    if (key === this.stepKey) {
      // The target can move (a button appears, the layout mirrors): re-measure 4 times a second.
      const now = performance.now();
      if (v && now - this.placedAt > 250) {
        this.placedAt = now;
        this.place();
      }
      return;
    }
    this.stepKey = key;
    this.placedFor = '';
    this.ringedEl?.classList.remove('dd-tut-on');
    this.ringedEl = null;
    this.target = v?.target ?? null;
    const wasOn = this.el.classList.contains('on');
    this.el.classList.toggle('on', !!v);
    if (wasOn && !v) this.bubbleOffAt = performance.now();
    // A bubble over a tip: the tip steps aside and comes back once the bubble has gone.
    if (v) this.stashTip();
    // The look step has no button: a ghost finger drags across the view instead.
    this.swipe.classList.toggle('on', v?.target === 'look');
    // A step done (the next one comes): the new bubble opens with a check (the "done" beat).
    const passed = !!v && v.total > 0 && this.lastStep > 0 && v.step > this.lastStep;
    this.lastStep = v?.step ?? 0;
    if (!v) return;
    this.bubble.classList.remove('fresh', 'passed');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('fresh');
    if (passed) {
      this.bubble.classList.add('passed');
      window.clearTimeout(this.passTimer);
      this.passTimer = window.setTimeout(() => this.bubble.classList.remove('passed'), 900);
    }
    this.lineEl.textContent = v.line;
    this.countEl.textContent = v.total > 0 ? t('tut.step', { n: v.step, total: v.total }) : '';
    this.skipBtn.hidden = v.total <= 0;
    this.place();
  }

  /** The ring and bubble follow the target's rect (it can move: the layout mirrors, a button appears). */
  place(): void {
    if (!this.el.classList.contains('on')) return;
    const el = this.target ? this.targetEl(this.target) : null;
    const view = { width: window.innerWidth, height: window.innerHeight };
    const r = el?.getBoundingClientRect();
    const visible = !!r && r.width > 0 && r.height > 0;
    const key = visible ? `${Math.round(r!.left)},${Math.round(r!.top)},${Math.round(r!.width)},${Math.round(r!.height)},${view.width},${view.height}` : `none,${view.width},${view.height}`;
    if (key === this.placedFor && el === this.ringedEl) return;
    this.placedFor = key;
    if (el !== this.ringedEl) {
      this.ringedEl?.classList.remove('dd-tut-on');
      this.ringedEl = el;
      el?.classList.add('dd-tut-on');
    }
    this.ring.style.display = visible ? '' : 'none';
    const bw = Math.min(300, view.width - 24);
    this.bubble.style.width = `${bw}px`;
    const bh = this.bubble.offsetHeight || 80;
    if (visible) {
      const pad = 6;
      this.ring.style.transform = `translate3d(${r!.left - pad}px, ${r!.top - pad}px, 0)`;
      this.ring.style.width = `${r!.width + pad * 2}px`;
      this.ring.style.height = `${r!.height + pad * 2}px`;
      // A pad or a hotbar slot (the pads stand over the hotbar): the bubble clears the pad cluster.
      const cluster = el && (el.classList.contains('dd-pad-btn') || el.classList.contains('dd-hslot')) ? padCluster(this.scope) ?? undefined : undefined;
      const p = bubblePlacement(r!, { width: bw, height: bh }, view, 10, cluster);
      this.bubbleTop = p.y;
      this.bubbleBottom = p.y + bh;
      this.bubble.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      this.bubble.style.setProperty('--tip', `${Math.round(p.tip)}px`);
      this.bubble.dataset.side = p.side;
    } else {
      // No control to point at (a "walk there" step): the bubble sits under the top HUD.
      this.bubbleTop = Math.round(view.height * 0.24);
      this.bubbleBottom = this.bubbleTop + bh;
      this.bubble.style.transform = `translate3d(${(view.width - bw) / 2}px, ${this.bubbleTop}px, 0)`;
      this.bubble.dataset.side = 'free';
    }
  }

  /**
   * The bubble's bottom edge (CSS px) while it is shown in the top part of the view, under the HUD
   * where the notice cards and the toasts stand (they wait or go under it: ui/hud/noticeGate), else 0.
   * A bubble stepped aside for a moment (an arrival card) still counts: it comes back there.
   */
  bandBottom(viewHeight = window.innerHeight): number {
    if (!this.el.classList.contains('on') || this.el.classList.contains('hud-off')) return 0;
    return this.bubbleTop < viewHeight * 0.45 ? this.bubbleBottom : 0;
  }

  /**
   * A first-time tooltip by a control (once per install): `id` names the tip, `target` the
   * control it points at. @returns true when it showed.
   */
  tip(id: string, target: UiTargetId, text: string, ms = 4200): boolean {
    if (this.tips.has(id)) return false;
    if (this.tipTurnNow() === 'wait') {
      // Its turn comes after the bubble (or the tip) up now: it waits, at most a few of them.
      if (!this.pendingTips.some((p) => p.id === id) && this.tipFor !== id) this.pendingTips.push({ id, target, text, ms });
      if (this.pendingTips.length > 4) this.pendingTips.shift();
      return true;
    }
    return this.showTip(id, target, text, ms);
  }

  private tipTurnNow(): 'wait' | 'show' {
    return tipTurn({ bubbleUp: this.el.classList.contains('on'), held: this.held, tipUp: this.tipFor !== null, sinceBubbleMs: performance.now() - this.bubbleOffAt });
  }

  /** The waiting tips, one at a time, once it is their turn (tried a few times a second). */
  private pumpTips(): void {
    if (!this.pendingTips.length) return;
    const now = performance.now();
    if (now - this.tipPumpAt < 400 || this.tipTurnNow() === 'wait') return;
    this.tipPumpAt = now;
    // The first whose control is on screen now (a tip for a control gone from view waits for it).
    for (let i = 0; i < this.pendingTips.length; i++) {
      const p = this.pendingTips[i];
      if (this.showTip(p.id, p.target, p.text, p.ms)) {
        this.pendingTips.splice(i, 1);
        return;
      }
    }
  }

  /** A tip up when a bubble comes: hidden, back at the front of the queue. */
  private stashTip(): void {
    if (this.tipFor === null) return;
    window.clearTimeout(this.tipTimer);
    this.tipEl.classList.remove('on');
    this.pendingTips.unshift({ id: this.tipFor, target: this.tipTarget, text: this.tipEl.textContent ?? '', ms: this.tipMs });
    this.tipFor = null;
  }

  private showTip(id: string, target: UiTargetId, text: string, ms: number): boolean {
    const el = this.targetEl(target);
    const r = el?.getBoundingClientRect();
    if (!r || r.width <= 0) return false;
    this.tips.add(id);
    saveTips(this.tips);
    this.tipFor = id;
    this.tipTarget = target;
    this.tipMs = ms;
    this.tipEl.textContent = text;
    this.tipEl.classList.add('on');
    const bw = Math.min(240, window.innerWidth - 24);
    this.tipEl.style.width = `${bw}px`;
    // The Interact chip, when it is up, keeps its band: the bubble clears it (QA 01:43).
    const chip = target === 'interact' ? null : this.shownEl('interact');
    const p = bubbleClear(r, { width: bw, height: this.tipEl.offsetHeight || 44 }, { width: window.innerWidth, height: window.innerHeight }, 8, chip?.getBoundingClientRect() ?? null);
    this.tipEl.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    window.clearTimeout(this.tipTimer);
    this.tipTimer = window.setTimeout(() => {
      this.tipEl.classList.remove('on');
      this.tipFor = null;
    }, ms);
    return true;
  }

  /** Forget the shown tips (Settings: replay the tips). */
  resetTips(): void {
    this.tips.clear();
    saveTips(this.tips);
  }

  dispose(): void {
    window.clearTimeout(this.tipTimer);
    window.clearTimeout(this.passTimer);
  }

  /** The control shown now for `id` (no stand-in), or null. */
  private shownEl(id: UiTargetId): HTMLElement | null {
    for (const el of this.scope.querySelectorAll<HTMLElement>(`[data-ui-target="${id}"]`)) if (!el.hidden && el.offsetParent !== null) return el;
    return null;
  }

  private targetEl(id: UiTargetId): HTMLElement | null {
    const list = this.scope.querySelectorAll<HTMLElement>(`[data-ui-target="${id}"]`);
    for (const el of list) if (!el.hidden && el.offsetParent !== null) return el;
    // A control that is not shown yet points the way to what shows it: Place appears once a
    // placeable item (a torch) is picked on the hotbar, so the ring goes to that slot first.
    const via = TARGET_VIA[id];
    if (via) {
      const alt = this.scope.querySelector<HTMLElement>(via);
      if (alt && !alt.hidden && alt.offsetParent !== null) return alt;
    }
    return list[0] ?? null;
  }
}
