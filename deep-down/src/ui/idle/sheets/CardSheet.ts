// The Dig and Crew sheets (SPEC §9.4): rows of cards (72 px: icon, name, level, pips, the delta preview, the buy
// button with its cost and fill), grouped, locked teasers at the bottom in violet ("Unlocks at 240 m"). Rows are
// rebuilt only when the list of cards changes, and updated in place every frame.

import type { BuyMode } from '../../../idle/bus';
import type { CardView } from '../../../idle/model/run';
import { format } from '../../../idle/num/notation';
import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import { Card, PingLimiter } from '../Card';
import type { SheetBody, SheetId } from '../Sheet';

export interface CardSource {
  cards(sheet: 'dig' | 'crew', mode: BuyMode): CardView[];
  /** The gold shown on the counter (log10; the display ledger). */
  shownGoldLog10(): number;
  buy(id: string, repeat: boolean, index: number): boolean;
  /** The buy mode the sheets show. */
  buyModeNow(): BuyMode;
  /** The crew's total DPS as text ('' none). */
  crewDps(): string;
}

interface Group {
  key: TextKey;
  match(v: CardView): boolean;
}

const DIG_GROUPS: Group[] = [
  { key: 'ui.sheet.dig.gear', match: (v) => v.kind === 'gear' && !v.locked },
  { key: 'ui.sheet.dig.tools', match: (v) => (v.kind === 'pick' || v.kind === 'upgrade') && !v.locked },
  { key: 'ui.sheet.dig.skills', match: (v) => v.kind === 'skill' && !v.locked },
  { key: 'ui.sheet.dig.soon', match: (v) => v.locked },
];

const CREW_GROUPS: Group[] = [
  { key: 'ui.sheet.crew.totalLabel', match: (v) => !v.locked },
  { key: 'ui.sheet.dig.soon', match: (v) => v.locked },
];

export class CardSheet implements SheetBody {
  readonly body: HTMLElement;
  readonly modes = true;
  private readonly rows = new Map<string, Card>();
  private signature = '';
  private readonly pings = new PingLimiter();
  private readonly header: HTMLElement | null;
  private headerS = '';
  private views: CardView[] = [];

  constructor(readonly id: SheetId & ('dig' | 'crew'), readonly title: TextKey, private readonly src: CardSource) {
    this.header = id === 'crew' ? h('p', { class: 'dd-sheet-total' }) : null;
    this.body = h('div', { class: 'dd-sheet-body' });
  }

  opened(): void {
    this.signature = '';
    this.refresh(performance.now());
  }

  refresh(now: number): void {
    const views = this.src.cards(this.id, this.src.buyModeNow());
    this.views = views;
    const groups = this.id === 'dig' ? DIG_GROUPS : CREW_GROUPS;
    const sig = views.map((v) => `${v.id}:${v.locked ? 1 : 0}`).join('|');
    if (sig !== this.signature) {
      this.signature = sig;
      this.rebuild(views, groups);
    }
    const shown = this.src.shownGoldLog10();
    for (const v of views) this.rows.get(v.id)?.update(v, shown, now);
    if (this.header) {
      const dps = this.src.crewDps();
      const s = dps ? t('ui.sheet.crew.total', { dps }) : '';
      if (s !== this.headerS) {
        this.headerS = s;
        this.header.textContent = s;
      }
    }
  }

  /** The card views shown (tests and the guide). */
  get shownViews(): readonly CardView[] {
    return this.views;
  }

  /** The row element of a card (the ghost hand points at it). */
  rowOf(id: string): HTMLElement | null {
    return this.rows.get(id)?.el ?? null;
  }

  private rebuild(views: CardView[], groups: Group[]): void {
    const keep = new Set(views.map((v) => v.id));
    for (const [id, c] of this.rows) {
      if (!keep.has(id)) {
        c.dispose();
        this.rows.delete(id);
      }
    }
    const parts: HTMLElement[] = [];
    if (this.header) parts.push(this.header, h('p', { class: 'dd-sheet-note', text: t('ui.sheet.crew.away') }));
    for (const g of groups) {
      const items = views.filter((v) => g.match(v));
      if (!items.length) continue;
      parts.push(h('h3', { class: 'dd-sheet-group', text: t(g.key) }));
      for (const v of items) {
        let c = this.rows.get(v.id);
        if (!c) {
          c = new Card({ shape: 'row', pings: this.pings, onBuy: (id, repeat, index) => this.src.buy(id, repeat, index) });
          this.rows.set(v.id, c);
        }
        c.el.classList.add('dd-row-anim');
        parts.push(c.el);
      }
    }
    this.body.replaceChildren(...parts);
    void format;
  }
}
