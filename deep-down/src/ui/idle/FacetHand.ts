// The facet hand (SPEC §5.10, §10.3 "Facet hand"): from the second seal of a run, three facet cards fly up and flip;
// keep one for the run. A T2 overlay: the world keeps digging behind it, only the cards and the two buttons take a
// touch. Rarity frames (Common bone, Rare rune, Relic violet, Duo gold), the tag with its set progress ("Spark 1 → 2"),
// the highlighted best card, a reroll (one free a run, then 10 gems) and "Later" (the hand waits as the "Facet ×N"
// chip in the skill row). The auto-pick perk shows its countdown.

import type { FacetCardView } from '../../idle/bus';
import { facetDef } from '../../idle/config/facets';
import { h } from '../dom';
import { spring } from '../fx/waapi';
import { CardHand, type HandCard } from './widgets/Pick';
import type { IconId } from './icons';

export interface FacetSource {
  /** The hand on offer (null none) and whether it is shown now (not deferred with "Later"). */
  hand(): { cards: readonly FacetCardView[]; at: number } | null;
  /** The card the model highlights as best (−1 none). */
  highlighted(): number;
  /** How many facets of a tag the run holds. */
  tagCount(tag: string): number;
  /** The reroll is free / its gem price, and whether it can be paid. */
  reroll(): { free: boolean; gems: number; can: boolean };
  /** Seconds until the auto-pick takes the highlighted card (NaN when the perk is off). */
  autoIn(): number;
  text(key: string, params?: Record<string, string | number>): string;
  pick(i: number): void;
  doReroll(): void;
}

const TAG_ICON: Record<string, IconId> = { spark: 'lucky', quake: 'quake', greed: 'coin', crew: 'crew', rhythm: 'skill', fortune: 'chest', duo: 'star' };

export class FacetHand {
  readonly el: HTMLElement;
  private readonly hand = new CardHand('dd-hand-facet');
  private readonly title: HTMLElement;
  private readonly rerollBtn: HTMLButtonElement;
  private readonly laterBtn: HTMLButtonElement;
  private readonly timer: HTMLElement;
  private shownAt = -1;
  private deferredAt = -1;
  private sig = '';
  private rerollS = '';
  private timerS = '';
  private closing = 0;

  constructor(private readonly src: FacetSource) {
    this.title = h('span', { class: 'dd-hand-title', text: src.text('ui.facet.title') });
    this.timer = h('span', { class: 'dd-facet-timer' });
    this.rerollBtn = h('button', { class: 'dd-facet-btn dd-oct', type: 'button', 'data-hud': 'facetReroll' });
    this.rerollBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.src.doReroll();
    });
    this.laterBtn = h('button', { class: 'dd-facet-btn dd-oct', type: 'button', 'data-hud': 'facetLater', text: src.text('ui.facet.later') });
    this.laterBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.defer();
    });
    this.el = h('div', { class: 'dd-facet hide' }, this.title, this.timer, this.hand.el, h('div', { class: 'dd-facet-foot' }, this.rerollBtn, this.laterBtn));
    this.hand.onPick = (i) => {
      this.hand.keep(i);
      this.src.pick(i);
      this.closing = performance.now() + 420;
    };
  }

  /** The hand is on screen. */
  get open(): boolean {
    return this.shownAt >= 0;
  }

  /** "Later": hide the hand; it waits as the chip in the skill row. */
  defer(): void {
    if (this.shownAt < 0) return;
    this.deferredAt = this.shownAt;
    this.hide();
  }

  /** The skill row's "Facet ×N" chip: show the waiting hand again. */
  resume(): void {
    this.deferredAt = -1;
    this.sig = '';
  }

  private hide(): void {
    this.shownAt = -1;
    this.hand.close();
    this.el.classList.add('hide');
  }

  /** Per frame (`now` ms). */
  frame(now: number): void {
    if (this.closing && now >= this.closing) {
      this.closing = 0;
      this.hide();
    }
    const hd = this.src.hand();
    if (!hd) {
      if (this.shownAt >= 0 && !this.closing) this.hide();
      this.deferredAt = -1;
      this.sig = '';
      return;
    }
    if (this.closing) return;
    // A hand deferred with "Later" stays hidden until the chip is tapped (a new hand shows at once).
    if (this.deferredAt === hd.at) return;
    const sig = `${hd.at}|${hd.cards.map((c) => `${c.id}.${c.rarity}`).join(',')}`;
    if (sig !== this.sig) {
      this.sig = sig;
      const best = this.src.highlighted();
      const cards: HandCard[] = hd.cards.map((c) => this.card(c));
      this.hand.deal(cards);
      this.hand.el.querySelectorAll<HTMLElement>('.dd-hc').forEach((el, i) => (el.dataset.best = i === best ? '1' : '0'));
      if (this.shownAt < 0) {
        this.el.classList.remove('hide');
        spring(this.title, 'snap', 0, 1, (v) => `translateY(${(v - 1) * 20}px)`);
      }
      this.shownAt = hd.at;
    }
    const r = this.src.reroll();
    const rs = r.free ? this.src.text('ui.facet.rerollFree') : this.src.text('ui.facet.rerollGems', { gems: r.gems });
    const rk = `${rs}|${r.can}`;
    if (rk !== this.rerollS) {
      this.rerollS = rk;
      this.rerollBtn.textContent = rs;
      this.rerollBtn.classList.toggle('off', !r.can);
    }
    const a = this.src.autoIn();
    const ts = Number.isFinite(a) && a > 0 ? this.src.text('ui.facet.auto', { s: Math.ceil(a) }) : '';
    if (ts !== this.timerS) {
      this.timerS = ts;
      this.timer.textContent = ts;
    }
  }

  private card(c: FacetCardView): HandCard {
    // The effect at this rarity: the facet's common value × the rarity's multiplier (×1, ×1.5, ×2.5).
    const v = (facetDef(c.id)?.value ?? 1) * c.value;
    const name = this.src.text(`idle.facet.${c.id}`);
    const desc = this.src.text(`idle.facet.${c.id}.desc`, { v: fmtValue(v), pct: fmtValue(v * 100) });
    const tag = c.duo ? this.src.text('ui.facet.rarity.duo') : this.src.text(`idle.tag.${c.tag}`);
    const have = c.duo ? 0 : this.src.tagCount(c.tag);
    const next = have < 2 ? 2 : have < 4 ? 4 : 6;
    const tagLine = tag ? (c.duo ? tag : this.src.text('ui.facet.set', { tag, have: have + 1, next })) : this.src.text(`ui.facet.rarity.${c.rarity}`);
    return { id: c.id, name: name || this.src.text(`ui.facet.rarity.${c.rarity}`), desc, rarity: c.duo ? 'duo' : c.rarity, tag: tagLine, icon: TAG_ICON[c.duo ? 'duo' : c.tag] ?? 'facet' };
  }
}

/** A facet value as shown on its card (×1.5, +4 pt…): the model's desc string places it. */
function fmtValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(v < 1 ? 2 : 1).replace(/0+$/, '').replace(/\.$/, '');
}
