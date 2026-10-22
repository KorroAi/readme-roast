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
): { x: number; y: number; side: 'above' | 'below' } {
  const cx = rect.left + rect.width / 2;
  const x = Math.max(margin, Math.min(view.width - bubble.width - margin, cx - bubble.width / 2));
  const above = rect.top - bubble.height - margin;
  if (above >= margin + 40) return { x, y: above, side: 'above' };
  return { x, y: Math.min(view.height - bubble.height - margin, rect.top + rect.height + margin), side: 'below' };
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
  private readonly tips = loadTips();
  /** The ghost finger that shows a gesture with no control of its own (look: drag on the view). */
  private readonly swipe: HTMLElement;
  /** performance.now() until which the bubble steps aside (a biome arrival card is up). */
  private heldUntil = 0;
  private held = false;

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
    this.el.classList.toggle('on', !!v);
    // The look step has no button: a ghost finger drags across the view instead.
    this.swipe.classList.toggle('on', v?.target === 'look');
    if (!v) return;
    this.bubble.classList.remove('fresh');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('fresh');
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
      const p = bubblePlacement(r!, { width: bw, height: bh }, view);
      this.bubble.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      this.bubble.dataset.side = p.side;
    } else {
      // No control to point at (a "walk there" step): the bubble sits under the top HUD.
      this.bubble.style.transform = `translate3d(${(view.width - bw) / 2}px, ${Math.round(view.height * 0.24)}px, 0)`;
      this.bubble.dataset.side = 'free';
    }
  }

  /**
   * A first-time tooltip by a control (once per install): `id` names the tip, `target` the
   * control it points at. @returns true when it showed.
   */
  tip(id: string, target: UiTargetId, text: string, ms = 4200): boolean {
    if (this.tips.has(id) || this.el.classList.contains('on') || this.tipFor || this.held) return false;
    const el = this.targetEl(target);
    const r = el?.getBoundingClientRect();
    if (!r || r.width <= 0) return false;
    this.tips.add(id);
    saveTips(this.tips);
    this.tipFor = id;
    this.tipEl.textContent = text;
    this.tipEl.classList.add('on');
    const bw = Math.min(240, window.innerWidth - 24);
    this.tipEl.style.width = `${bw}px`;
    const p = bubblePlacement(r, { width: bw, height: this.tipEl.offsetHeight || 44 }, { width: window.innerWidth, height: window.innerHeight }, 8);
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
