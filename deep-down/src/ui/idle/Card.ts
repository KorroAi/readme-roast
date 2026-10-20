// A purchase card (SPEC §5.5, §10.7): its own progress bar (shown gold / cost, moving as each coin lands), the pip
// ring to the next milestone, the BEST chip, the ready ping, every state (locked, poor, near, ready, maxed), the press
// and hold-to-buy. Two shapes: a quick-buy card (118 × 72) and a sheet row (72 px). DOM writes happen only when a
// shown value changes (F10).

import type { CardView } from '../../idle/model/run';
import { format } from '../../idle/num/notation';
import { hasText, t, type TextKey } from '../../i18n';
import { HoldButton, pipPop, readyPing, shakeNo, stamp } from '../fx/press';
import { h } from '../dom';
import { cardIcon, iconEl, setIcon } from './icons';

export type CardState = 'hidden' | 'locked' | 'poor' | 'near' | 'ready' | 'maxed';

/**
 * Look up a key the model names (its strings live in another section). A key with no text yet shows nothing: no
 * placeholder ever reaches a player.
 */
export function tr(key: string, params?: Record<string, string | number>): string {
  if (!key || !hasText(key)) return '';
  if (!params) return t(key as TextKey);
  // A parameter may itself name a key (the model passes `warden: 'idle.warden.haldenHatch'`): it reads as its text.
  let resolved: Record<string, string | number> | null = null;
  for (const k in params) {
    const v = params[k];
    if (typeof v === 'string' && KEYISH.test(v) && hasText(v)) {
      resolved ??= { ...params };
      resolved[k] = t(v as TextKey);
    }
  }
  return t(key as TextKey, resolved ?? params);
}

const KEYISH = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9]+)+$/;

/** Ready pings: ≤ 1 per card per 3 s and ≤ 1 per 400 ms overall (SPEC §10.7). */
export class PingLimiter {
  private last = -Infinity;
  private readonly perCard = new Map<string, number>();
  allow(id: string, now: number): boolean {
    if (now - this.last < 400) return false;
    const c = this.perCard.get(id);
    if (c !== undefined && now - c < 3000) return false;
    this.last = now;
    this.perCard.set(id, now);
    return true;
  }
}

/** Pure: a card's state from its view and the shown gold (log10). */
export function cardState(v: CardView | null, shownLog10: number): CardState {
  if (!v) return 'hidden';
  if (v.locked) return 'locked';
  if (v.maxed) return 'maxed';
  if (shownLog10 >= v.costLog10) return 'ready';
  if (v.best && shownLog10 >= v.costLog10 + Math.log10(0.85)) return 'near';
  return 'poor';
}

/** Pure: the fill (0..1) of shown gold over the cost. */
export function cardFill(v: CardView | null, shownLog10: number): number {
  if (!v || v.locked) return 0;
  if (v.maxed) return 1;
  if (!Number.isFinite(shownLog10)) return 0;
  const f = Math.pow(10, Math.min(0, shownLog10 - v.costLog10));
  return f > 1 ? 1 : f;
}

const PIP_R = 20;
const PIP_MAX = 25;

/** The pip arcs for `n` pips (25 as 5 groups of 5), as SVG path data. */
export function pipArcs(n: number): string[] {
  const out: string[] = [];
  const groups = n === 25 ? 5 : 1;
  const per = n / groups;
  const groupGap = groups > 1 ? 0.22 : 0;
  const total = Math.PI * 2;
  const span = (total - groups * groupGap) / n;
  const gap = Math.min(0.12, span * 0.35);
  let a = -Math.PI / 2 + groupGap / 2;
  for (let g = 0; g < groups; g++) {
    for (let i = 0; i < per; i++) {
      const a0 = a + gap / 2;
      const a1 = a + span - gap / 2;
      const p = (x: number) => `${(24 + PIP_R * Math.cos(x)).toFixed(2)} ${(24 + PIP_R * Math.sin(x)).toFixed(2)}`;
      out.push(`M ${p(a0)} A ${PIP_R} ${PIP_R} 0 0 1 ${p(a1)}`);
      a += span;
    }
    a += groupGap;
  }
  return out;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export interface CardOptions {
  shape: 'quick' | 'row';
  /** Buy (repeat: inside a hold). @returns true when it went through. */
  onBuy(id: string, repeat: boolean, index: number): boolean;
  pings: PingLimiter;
  /** Sound and haptic hooks for the ready ping (slot 0..2 for the pitch). */
  onReady?(id: string, slot: number): void;
  slot?: number;
}

export class Card {
  readonly el: HTMLButtonElement;
  readonly face: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly name: HTMLElement;
  private readonly lv: HTMLElement;
  private readonly cost: HTMLElement;
  private readonly costText: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly best: HTMLElement;
  private readonly delta: HTMLElement | null;
  private readonly lock: HTMLElement;
  private readonly pips: SVGPathElement[] = [];
  private readonly hold: HoldButton;
  private pipN = 0;
  private pipK = -1;
  // Last written values.
  id = '';
  state: CardState = 'hidden';
  private nameS = '';
  private lvS = '';
  private costS = '';
  private deltaS = '';
  private fillV = -1;
  private bestV = false;
  private labelS = '';
  /** The view this card shows (for the hold's purchases). */
  view: CardView | null = null;

  constructor(private readonly o: CardOptions) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('class', 'dd-card-pips');
    svg.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < PIP_MAX; i++) {
      const p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('class', 'dd-pip');
      svg.appendChild(p);
      this.pips.push(p);
    }
    this.icon = iconEl('goal', 'dd-card-ico');
    this.lock = iconEl('lock', 'dd-card-lock');
    this.name = h('span', { class: 'dd-card-name' });
    this.lv = h('span', { class: 'dd-card-lv' });
    this.costText = h('span', { class: 'dd-card-cost-v' });
    this.cost = h('span', { class: 'dd-card-cost' }, iconEl('coin', 'dd-card-coin'), this.costText);
    this.fill = h('i', { class: 'dd-card-fill-i' });
    this.best = h('span', { class: 'dd-card-best', text: t('ui.card.best'), 'aria-hidden': 'true' });
    this.delta = o.shape === 'row' ? h('span', { class: 'dd-card-delta' }) : null;
    this.face = h(
      'span',
      { class: 'dd-card-face' },
      h('span', { class: 'dd-card-sock' }, svg, this.icon, this.lock),
      h('span', { class: 'dd-card-text' }, this.name, this.lv, this.delta),
      this.cost,
      h('span', { class: 'dd-card-fill' }, this.fill),
      this.best,
    );
    this.el = h('button', { class: `dd-card dd-card-${o.shape} s-hidden`, type: 'button' }, this.face);
    this.hold = new HoldButton(this.el, {
      face: this.face,
      act: (repeat, index) => {
        if (!this.id || this.state === 'locked' || this.state === 'maxed' || this.state === 'hidden') {
          if (!repeat) shakeNo(this.face);
          return false;
        }
        const ok = this.o.onBuy(this.id, repeat, index);
        if (!ok && !repeat) this.refuse();
        return ok;
      },
    });
  }

  /** The "no": the cost flashes and the card shakes (never red text: bone-500 is "can't afford"). */
  refuse(): void {
    shakeNo(this.face);
    this.cost.classList.remove('no');
    void this.cost.offsetWidth;
    this.cost.classList.add('no');
  }

  /** A purchase landed: the level rolls, a pip pops; a ★ stamps. */
  bought(star: boolean): void {
    if (star) {
      this.el.classList.remove('starred');
      void this.el.offsetWidth;
      this.el.classList.add('starred');
      stamp(this.best);
    }
  }

  /** Show `v` with the shown gold (log10). `now` ms. */
  update(v: CardView | null, shownLog10: number, now: number): void {
    this.view = v;
    const id = v?.id ?? '';
    if (id !== this.id) {
      this.id = id;
      this.el.dataset.card = id;
      if (id) setIcon(this.icon, cardIcon(id));
      this.pipK = -1;
    }
    const st = cardState(v, shownLog10);
    if (st !== this.state) {
      const prev = this.state;
      this.el.classList.replace(`s-${prev}`, `s-${st}`);
      this.state = st;
      if (st === 'ready' && (prev === 'poor' || prev === 'near') && v && this.o.pings.allow(v.id, now)) {
        readyPing(this.face);
        this.o.onReady?.(v.id, this.o.slot ?? 0);
      }
    }
    if (!v) return;
    const name = tr(v.nameKey, v.nameParams);
    if (name !== this.nameS) {
      this.nameS = name;
      this.name.textContent = name;
    }
    const lv = v.locked ? t('ui.card.locked', { depth: `${v.unlockDepth} m` }) : v.kind === 'gear' ? '' : v.maxed ? t('ui.card.maxed') : v.levels > 1 ? t(this.o.shape === 'quick' ? 'ui.card.levelUpShort' : 'ui.card.levelUp', { level: v.level, to: v.level + v.levels }) : v.level === 0 && v.kind === 'crew' ? t('ui.card.hire') : t('ui.card.level', { level: v.level });
    if (lv !== this.lvS) {
      this.lvS = lv;
      this.lv.textContent = lv;
    }
    const cost = v.maxed ? t('ui.card.maxed') : v.locked ? '' : format(v.cost);
    if (cost !== this.costS) {
      this.costS = cost;
      this.costText.textContent = cost;
    }
    if (this.delta) {
      const d = v.locked || v.maxed ? '' : deltaText(v);
      if (d !== this.deltaS) {
        this.deltaS = d;
        this.delta.textContent = d;
      }
    }
    const f = Math.round(cardFill(v, shownLog10) * 200) / 200;
    if (f !== this.fillV) {
      this.fillV = f;
      this.fill.style.transform = `scaleX(${f})`;
    }
    if (v.best !== this.bestV) {
      this.bestV = v.best;
      this.el.classList.toggle('best', v.best);
    }
    // Pips (10 for a line, 25 for the pick in 5 groups of 5).
    const n = Math.min(PIP_MAX, v.pips.total);
    if (n !== this.pipN) {
      this.pipN = n;
      const arcs = pipArcs(n);
      for (let i = 0; i < PIP_MAX; i++) {
        const p = this.pips[i];
        if (i < n) {
          p.setAttribute('d', arcs[i]);
          p.style.display = '';
        } else p.style.display = 'none';
      }
      this.pipK = -1;
    }
    const k = Math.min(n, v.pips.filled);
    if (k !== this.pipK) {
      const grew = this.pipK >= 0 && k > this.pipK;
      for (let i = 0; i < n; i++) this.pips[i].classList.toggle('on', i < k);
      if (grew && k > 0) pipPop(this.pips[k - 1]);
      this.pipK = k;
    }
    const label = v.locked ? `${name}. ${lv}` : v.maxed ? `${name}. ${t('ui.card.maxed')}` : v.levels > 1 ? t('ui.card.buyLevels', { levels: v.levels, name, cost }) : t('ui.card.buy', { name, cost });
    if (label !== this.labelS) {
      this.labelS = label;
      this.el.setAttribute('aria-label', label);
    }
  }

  dispose(): void {
    this.hold.dispose();
  }
}

/** "+12 % → 1.42K / tap" (verdigris), from the card's delta and its value after the purchase. */
export function deltaText(v: CardView): string {
  if (!(v.delta > 0)) return '';
  const pct = v.delta >= 10 ? `×${format(1 + v.delta)}` : v.delta >= 1 ? `×${(1 + v.delta).toFixed(1)}` : `${Math.max(1, Math.round(v.delta * 100))} %`;
  const unitKey = `ui.card.deltaUnit.${v.unit}` as TextKey;
  const unit = v.unit ? tr(unitKey) : '';
  return t('ui.card.delta', { pct, after: `${format(v.after)}${unit && unit !== unitKey ? ` ${unit}` : ''}` });
}
