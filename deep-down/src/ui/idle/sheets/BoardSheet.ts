// The Board (SPEC §7.4, §9.4): the three contracts (each a progress bar with its reward and a 2-gem reroll), the next
// Grand Contract, the Daily Lantern Chest, the 7-day Lantern Calendar (a missed day pauses it; it never resets), the
// Chest Rack and the Time Crystals. Rows are built once on open and written only on change.

import type { TextKey } from '../../../i18n';
import { t } from '../../../i18n';
import { h } from '../../dom';
import type { SheetBody } from '../Sheet';
import { heading, Row } from './rows';

export interface BoardContract {
  text: string;
  fill: number;
  progress: string;
  reward: string;
  grand: boolean;
}

export interface BoardSource {
  contracts(): readonly BoardContract[];
  rerollContract(slot: number): void;
  /** Contracts until the next Grand one. */
  nextGrand(): number;
  daily(): { ready: boolean; next: number; days: readonly string[] };
  claimDaily(): void;
  rack(): number;
  openRack(): void;
  crystals(): number;
  warp(): void;
  gems(): number;
}

export class BoardSheet implements SheetBody {
  readonly id = 'board' as const;
  readonly title: TextKey = 'ui.sheet.board.title';
  readonly modes = false;
  readonly body: HTMLElement;
  private readonly rows: Row[] = [];
  private readonly grandNote: HTMLElement;
  private readonly daily: Row;
  private readonly cal: HTMLElement;
  private readonly calDays: HTMLElement[] = [];
  private readonly rackRow: Row;
  private readonly warpRow: Row;
  private calS = '';
  private grandS = '';

  constructor(private readonly src: BoardSource) {
    for (let i = 0; i < 4; i++) {
      const slot = i;
      this.rows.push(new Row('dd-contract', 'contract', () => this.src.rerollContract(slot), `reroll${i}`));
    }
    this.grandNote = h('p', { class: 'dd-sheet-note' });
    this.daily = new Row('dd-daily', 'chest', () => this.src.claimDaily(), 'daily');
    for (let i = 0; i < 7; i++) this.calDays.push(h('span', { class: 'dd-cal-day' }, h('b', { text: t('ui.board.day', { n: i + 1 }) }), h('i')));
    this.cal = h('div', { class: 'dd-cal' }, ...this.calDays);
    this.rackRow = new Row('dd-rackrow', 'rack', () => this.src.openRack(), 'rack');
    this.warpRow = new Row('dd-warprow', 'warp', () => this.src.warp(), 'warp');
    this.body = h(
      'div',
      { class: 'dd-sheet-body dd-board' },
      heading(t('ui.board.contracts')),
      ...this.rows.map((r) => r.el),
      this.grandNote,
      heading(t('ui.board.daily')),
      this.daily.el,
      heading(t('ui.board.calendar')),
      this.cal,
      h('p', { class: 'dd-sheet-note', text: t('ui.board.calendarNote') }),
      heading(t('ui.board.rack')),
      this.rackRow.el,
      this.warpRow.el,
    );
  }

  opened(): void {
    this.refresh();
  }

  refresh(): void {
    const cs = this.src.contracts();
    const gems = this.src.gems();
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const c = cs[i];
      r.el.style.display = c ? '' : 'none';
      if (!c) continue;
      r.set(c.text, c.reward, c.progress).progress(c.fill).flag('grand', c.grand).button(t('ui.board.reroll'), gems >= 2);
    }
    const g = this.src.nextGrand();
    const gs = g > 0 ? t('ui.board.next', { n: g }) : '';
    if (gs !== this.grandS) {
      this.grandS = gs;
      this.grandNote.textContent = gs;
    }
    const d = this.src.daily();
    this.daily.set(t('ui.board.daily'), d.ready ? '' : t('ui.board.dailyDone')).progress(-1).button(d.ready ? t('ui.board.dailyReady') : '', d.ready).flag('ready', d.ready);
    const cal = `${d.next}|${d.ready}|${d.days.join(',')}`;
    if (cal !== this.calS) {
      this.calS = cal;
      for (let i = 0; i < 7; i++) {
        const el = this.calDays[i];
        el.className = `dd-cal-day${i < d.next ? ' done' : ''}${i === d.next ? (d.ready ? ' today' : ' next') : ''}`;
        (el.lastElementChild as HTMLElement).textContent = d.days[i] ?? '';
      }
    }
    const rack = this.src.rack();
    this.rackRow.set(t('ui.board.rack'), rack > 0 ? (rack === 1 ? t('ui.feast.chest') : t('ui.feast.chests', { count: rack })) : t('ui.board.rackEmpty')).progress(-1).button(rack > 0 ? t('ui.feast.open') : '', rack > 0);
    const cr = this.src.crystals();
    this.warpRow.el.style.display = cr > 0 ? '' : 'none';
    if (cr > 0) this.warpRow.set(t('ui.board.warp', { n: cr }), '').progress(-1).button(t('ui.board.warpUse'), true);
  }

  rowOf(id: string): HTMLElement | null {
    if (id.startsWith('contract')) return this.rows[Number(id.slice(8)) || 0]?.el ?? null;
    if (id === 'daily') return this.daily.el;
    if (id === 'rack') return this.rackRow.el;
    return null;
  }
}
