// Mash (SPEC §7.3): tap the target as fast as you can for 4–5 s; tiers at 15 / 25 / 40 taps (Root Pull, Crystal
// Bloom, Lava Surge). The target sits on the floor's centre, a step above it; a ring fills toward the next tier and the
// tier stamps as it lands. It is a world target (DigController hit-tests it), so taps on the rock beside it dig.

import type { MashWidget } from '../../../idle/model/state';
import { mashTier } from '../../../idle/model/widgets';
import { h } from '../../dom';
import { spring } from '../../fx/waapi';
import { TargetSprite, WidgetBar } from './common';
import type { WidgetSource, WidgetTarget, WidgetUi } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 38;
const RING_C = 2 * Math.PI * RING_R;

export class MashUi implements WidgetUi {
  readonly kind = 'mash' as const;
  readonly el: HTMLElement;
  widgetId = '';
  private floor0 = 0;
  private readonly sprite = new TargetSprite();
  private readonly bar = new WidgetBar();
  private readonly ring: SVGCircleElement;
  private readonly ringWrap: HTMLElement;
  private readonly count: HTMLElement;
  private readonly list: WidgetTarget[] = [{ id: '', x: 0, y: 0, r: 56 }];
  private closing = 0;
  private tierSeen = 0;
  private tapsS = -1;
  private placed = '';

  constructor(private readonly src: WidgetSource) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 96 96');
    svg.setAttribute('class', 'dd-mash-svg');
    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'dd-mash-track');
    this.ring = document.createElementNS(SVG_NS, 'circle');
    this.ring.setAttribute('class', 'dd-mash-ring');
    for (const c of [track, this.ring]) {
      c.setAttribute('cx', '48');
      c.setAttribute('cy', '48');
      c.setAttribute('r', String(RING_R));
      svg.appendChild(c);
    }
    this.ring.style.strokeDasharray = `${RING_C}`;
    this.ring.style.strokeDashoffset = `${RING_C}`;
    this.count = h('span', { class: 'dd-mash-count' });
    this.ringWrap = h('div', { class: 'dd-mash-wrap' }, svg, this.count);
    this.el = h('div', { class: 'dd-widget dd-w-mash hide', 'aria-hidden': 'true' }, this.bar.el, this.ringWrap, this.sprite.el);
  }

  get idle(): boolean {
    return this.widgetId === '' && this.closing === 0;
  }

  open(widgetId: string, owner: string, floor: number, now: number): void {
    void owner;
    void now;
    this.widgetId = widgetId;
    this.floor0 = floor;
    this.closing = 0;
    this.tierSeen = 0;
    this.tapsS = -1;
    this.placed = '';
    this.sprite.hide();
    this.place();
    this.el.classList.remove('hide');
    this.ringWrap.dataset.tier = '0';
    this.bar.show('amber');
  }

  /** The ring over the root, above the floor's centre (placed at open too: it never paints at the origin). */
  private place(): { x: number; y: number } {
    const at = this.src.screen(3, -1.3, this.floor0);
    const key = `${Math.round(at.x)},${Math.round(at.y)}`;
    if (key !== this.placed) {
      this.placed = key;
      this.ringWrap.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    }
    return at;
  }

  private view(): MashWidget | null {
    const w = this.src.widget(this.widgetId);
    return w && w.kind === 'mash' ? w : null;
  }

  frame(now: number, dt: number): void {
    void dt;
    if (this.closing && now >= this.closing) {
      this.closing = 0;
      this.el.classList.add('hide');
      this.bar.hide();
      this.sprite.hide();
    }
    if (!this.widgetId) return;
    const w = this.view();
    if (!w) return;
    if (this.sprite.id !== w.target) this.sprite.show(w.target, 'root', this.src.drawn(w.target));
    const at = this.place();
    this.sprite.place(at.x, at.y);
    this.list[0].id = w.target;
    this.list[0].x = at.x;
    this.list[0].y = at.y;
    if (w.taps !== this.tapsS) {
      this.tapsS = w.taps;
      const tier = mashTier(w);
      const lo = tier === 0 ? 0 : w.tiers[tier - 1];
      const hi = w.tiers[Math.min(tier, w.tiers.length - 1)];
      const f = tier >= w.tiers.length ? 1 : (w.taps - lo) / Math.max(1, hi - lo);
      this.ring.style.strokeDashoffset = `${RING_C * (1 - f)}`;
      this.count.textContent = String(w.taps);
      if (tier > this.tierSeen) {
        this.tierSeen = tier;
        this.ringWrap.dataset.tier = String(tier);
        spring(this.ringWrap.firstElementChild as Element, 'snap', 1.3, 1, (v) => `scale(${v})`);
      }
    }
    const end = w.born + w.life;
    const t = this.src.time();
    this.bar.set(this.src.text('ui.widget.mash', { n: w.taps, next: w.tiers[Math.min(mashTier(w), w.tiers.length - 1)] }), (end - t) / Math.max(1e-6, w.life));
  }

  targets(): readonly WidgetTarget[] {
    return this.widgetId && this.sprite.id ? this.list : NONE;
  }

  hit(id: string, now: number): void {
    void id;
    void now;
    this.sprite.bump();
  }

  close(result: string, now: number): void {
    void result;
    this.widgetId = '';
    this.sprite.caught();
    this.closing = now + 450;
  }
}

const NONE: WidgetTarget[] = [];
