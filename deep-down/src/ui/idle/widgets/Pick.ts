// Pick (SPEC §7.3) and the hand of cards it shares with the facet hand (SPEC §5.10): three cards flip in from their
// backs (80 ms apart, outBack), each with its rarity frame, name and one-line effect; one tap keeps one. The kept card
// rises with a glint, the others fall away. The hand sits low in the world region (thumb rule, U4) and only its cards
// take a touch: the floor row above stays a dig target, and taps between the cards dig too. pointerdown picks.

import type { PickWidget } from '../../../idle/model/state';
import { h } from '../../dom';
import { spring, tween } from '../../fx/waapi';
import { iconEl, setIcon, type IconId } from '../icons';
import type { WidgetSource, WidgetTarget, WidgetUi } from './types';

export interface HandCard {
  /** The card's id (a boost id, a facet id). */
  id: string;
  name: string;
  desc: string;
  /** 'common' | 'rare' | 'relic' | 'duo' (the frame colour). */
  rarity: string;
  /** A small caption: the facet's tag and its set progress ("Spark · 1 → 2"), '' none. */
  tag: string;
  icon: IconId;
}

/** Three flipping cards; `onPick(i)` on a pointerdown. */
export class CardHand {
  readonly el: HTMLElement;
  private readonly cards: Array<{ el: HTMLButtonElement; name: HTMLElement; desc: HTMLElement; tag: HTMLElement; icon: HTMLElement }> = [];
  private live = false;
  private picked = -1;
  onPick: ((i: number) => void) | null = null;

  constructor(className: string) {
    for (let i = 0; i < 3; i++) {
      const name = h('span', { class: 'dd-hc-name' });
      const desc = h('span', { class: 'dd-hc-desc' });
      const tag = h('span', { class: 'dd-hc-tag' });
      const icon = iconEl('facet', 'dd-hc-ico');
      const el = h('button', { class: 'dd-hc', type: 'button', 'data-hand': String(i) }, h('span', { class: 'dd-hc-face' }, icon, name, desc, tag), h('span', { class: 'dd-hc-back', 'aria-hidden': 'true' }));
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (this.live && this.picked < 0) this.onPick?.(i);
      });
      this.cards.push({ el, name, desc, tag, icon });
    }
    this.el = h('div', { class: `dd-hand hide ${className}` }, ...this.cards.map((c) => c.el));
  }

  get open(): boolean {
    return this.live;
  }

  /** Deal the cards (they flip in from their backs). */
  deal(cards: readonly HandCard[]): void {
    this.live = true;
    this.picked = -1;
    this.el.classList.remove('hide', 'done');
    for (let i = 0; i < 3; i++) {
      const c = this.cards[i];
      const v = cards[i];
      c.el.classList.toggle('hide', !v);
      if (!v) continue;
      c.el.dataset.rarity = v.rarity;
      c.el.classList.remove('kept', 'gone');
      c.name.textContent = v.name;
      // "50 %" never breaks before its sign.
      c.desc.textContent = v.desc.replace(/ %/g, '\u00a0%');
      c.tag.textContent = v.tag;
      c.tag.style.display = v.tag ? '' : 'none';
      setIcon(c.icon, v.icon);
      c.el.setAttribute('aria-label', `${v.name}. ${v.desc}`);
      spring(c.el, 'bounce', 0, 1, (k) => `translateY(${(1 - k) * 60}px) rotateY(${(1 - Math.min(1, k)) * 180}deg)`, { delay: 80 * i, fill: 'backwards' });
    }
  }

  /** The kept card rises; the others fall away. */
  keep(i: number): void {
    this.picked = i;
    for (let k = 0; k < 3; k++) {
      const c = this.cards[k];
      if (k === i) {
        c.el.classList.add('kept');
        tween(c.el, [{ transform: 'translateY(0px) scale(1)' }, { transform: 'translateY(-26px) scale(1.08)' }], 260, 'outBack', { fill: 'forwards' });
      } else {
        c.el.classList.add('gone');
        tween(c.el, [{ transform: 'translateY(0px)', opacity: 1 }, { transform: 'translateY(40px)', opacity: 0 }], 240, 'inCubic', { fill: 'forwards' });
      }
    }
  }

  /** Close (after the keep, or when the window ran out). */
  close(): void {
    this.live = false;
    this.el.classList.add('done');
    for (const c of this.cards) for (const a of c.el.getAnimations?.() ?? []) a.cancel();
    this.el.classList.add('hide');
  }

  rect(i: number): DOMRect | null {
    const c = this.cards[i];
    return c && !c.el.classList.contains('hide') ? c.el.getBoundingClientRect() : null;
  }
}

/** The Supply Rope's boosts (and any Pick of 3 the model opens). */
export class PickUi implements WidgetUi {
  readonly kind = 'pick' as const;
  readonly el: HTMLElement;
  widgetId = '';
  private readonly hand = new CardHand('dd-hand-pick');
  private closing = 0;
  private dealt = false;
  private owner = '';
  private readonly title: HTMLElement;

  constructor(private readonly src: WidgetSource) {
    this.title = h('span', { class: 'dd-hand-title' });
    this.el = h('div', { class: 'dd-widget dd-w-pick hide' }, this.title, this.hand.el);
    this.hand.onPick = (i) => {
      if (!this.widgetId) return;
      this.src.tap(`${this.widgetId}:${i}`);
      this.hand.keep(i);
    };
  }

  get idle(): boolean {
    return this.widgetId === '' && this.closing === 0;
  }

  open(widgetId: string, owner: string, floor: number, now: number): void {
    void floor;
    void now;
    this.widgetId = widgetId;
    this.owner = owner;
    this.closing = 0;
    this.dealt = false;
    this.deal();
  }

  /** Deal once the model's widget holds its cards (it may announce the widget a frame before it fills it). */
  private deal(): void {
    const w = this.src.widget(this.widgetId);
    const ids = w && w.kind === 'pick' ? (w as PickWidget).cards : [];
    if (ids.length === 0) return;
    this.dealt = true;
    const owner = this.owner;
    this.title.textContent = this.src.text(owner === 'rope' || owner.startsWith('event:') ? 'ui.widget.rope' : 'ui.widget.pick');
    this.hand.deal(ids.map((id) => ({
      id,
      name: this.src.text(`idle.boost.${id}`) || this.src.text(`ui.boost.${id}`),
      desc: this.src.text(`idle.boost.${id}.desc`) || this.src.text(`ui.boost.${id}.desc`),
      rarity: 'common',
      tag: this.src.text('ui.boost.time'),
      icon: boostIcon(id),
    })));
    this.el.classList.remove('hide');
  }

  frame(now: number, dt: number): void {
    void dt;
    if (this.closing && now >= this.closing) {
      this.closing = 0;
      this.hand.close();
      this.el.classList.add('hide');
    }
    if (this.widgetId && !this.dealt) this.deal();
  }

  targets(): readonly WidgetTarget[] {
    return NONE;
  }

  hit(id: string, now: number): void {
    void id;
    void now;
  }

  close(result: string, now: number): void {
    void result;
    this.widgetId = '';
    this.closing = now + 420;
  }
}

/** The icon of a Supply Rope boost. */
export function boostIcon(id: string): IconId {
  if (id.startsWith('crew')) return 'crew';
  if (id.startsWith('crit')) return 'lucky';
  if (id.startsWith('ores')) return 'coin';
  if (id.startsWith('combo')) return 'skill';
  if (id.startsWith('golden')) return 'rush';
  return 'star';
}

const NONE: WidgetTarget[] = [];
