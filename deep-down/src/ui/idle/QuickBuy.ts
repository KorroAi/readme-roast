// The quick-buy row (SPEC §9.1): the three most important buttons in the game, under the thumb: [PICK] [★ BEST]
// [CREW] (A's `quickSlots`: slot 1 the pick, slot 2 the lowest payback, slot 3 the newest line). Slots reveal in the
// tutorial's order (SPEC §8.3: the Pick at 30 gold, the crew at 50, BEST when two options first compete) and rise in
// on the snap spring.

import type { CardView } from '../../idle/model/run';
import { t } from '../../i18n';
import { h } from '../dom';
import { spring } from '../fx/waapi';
import { Card, PingLimiter } from './Card';

export class QuickBuy {
  readonly el: HTMLElement;
  readonly cards: Card[] = [];
  private readonly shown = [false, false, false];
  private readonly empty = [false, false, false];
  private readonly pings = new PingLimiter();
  /** One BEST tab that rides over whichever card is best (it slides when BEST moves). */
  private readonly bestTab: HTMLElement;
  private bestSlot = -1;

  constructor(onBuy: (slot: number, id: string, repeat: boolean, index: number) => boolean, onReady: (id: string, slot: number) => void) {
    this.el = h('div', { class: 'dd-quick', 'data-hud': 'quick' });
    for (let i = 0; i < 3; i++) {
      const c = new Card({ shape: 'quick', pings: this.pings, slot: i, onBuy: (id, repeat, index) => onBuy(i, id, repeat, index), onReady });
      c.el.dataset.slot = String(i);
      c.el.classList.add('hide');
      this.cards.push(c);
      this.el.appendChild(c.el);
    }
    this.bestTab = h('span', { class: 'dd-best-tab hide', 'aria-hidden': 'true', text: t('ui.card.best') });
    this.el.appendChild(this.bestTab);
  }

  /** Reveal slot `i` (rises in on the snap spring). */
  reveal(i: number, instant = false): void {
    if (this.shown[i]) return;
    this.shown[i] = true;
    const el = this.cards[i].el;
    el.classList.remove('hide');
    if (!instant) spring(el, 'snap', 0, 1, (v) => `translateY(${(1 - v) * 40}px) scale(${0.9 + 0.1 * v})`);
  }

  revealed(i: number): boolean {
    return this.shown[i];
  }

  update(views: ReadonlyArray<CardView | null>, shownLog10: number, now: number): void {
    let best = -1;
    for (let i = 0; i < 3; i++) {
      const v = this.shown[i] ? (views[i] ?? null) : null;
      this.cards[i].update(v, shownLog10, now);
      if (v?.best && best < 0) best = i;
      // A revealed slot with nothing to offer (BEST is the Pick or the crew card itself) shows no empty frame.
      const empty = this.shown[i] && !v;
      if (empty !== this.empty[i]) {
        this.empty[i] = empty;
        this.cards[i].el.classList.toggle('dd-card-empty', empty);
      }
    }
    if (best !== this.bestSlot) {
      this.bestSlot = best;
      this.bestTab.classList.toggle('hide', best < 0);
      if (best >= 0) {
        this.bestTab.dataset.slot = String(best);
      }
    }
  }

  /** The card element in a slot (the ghost hand points at it). */
  slotEl(i: number): HTMLElement {
    return this.cards[i].el;
  }

  /** The slot showing a card id (−1 none). */
  slotOf(id: string): number {
    for (let i = 0; i < 3; i++) if (this.shown[i] && this.cards[i].id === id) return i;
    return -1;
  }
}
