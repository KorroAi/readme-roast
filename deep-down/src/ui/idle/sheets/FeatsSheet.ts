// The Feats sheet (SPEC §7.6, §9.4): every family sorted by closeness to its next tier (the top three glow with
// "93 %": the almost-there engine), the tier numeral, the counter line and the tier X perk; secret Feats as "???"
// with their hint; the Marks total (+1 % all each); the Rank track with its next rewards on top.

import type { TextKey } from '../../../i18n';
import { t } from '../../../i18n';
import { h } from '../../dom';
import type { SheetBody } from '../Sheet';
import { heading, Row } from './rows';

export interface FeatRowView {
  id: string;
  name: string;
  line: string;
  tier: string;
  progress: number;
  done: boolean;
}

export interface FeatsSource {
  feats(): readonly FeatRowView[];
  secrets(): ReadonlyArray<{ id: string; name: string; hint: string; found: boolean }>;
  marks(): number;
  rank(): { rank: number; xp: number; need: number; title: string; next: string };
}

export class FeatsSheet implements SheetBody {
  readonly id = 'feats' as const;
  readonly title: TextKey = 'ui.tab.feats';
  readonly modes = false;
  readonly body: HTMLElement;
  private readonly rankRow = new Row('dd-rankrow', 'rank');
  private readonly marksNote: HTMLElement;
  private readonly list: HTMLElement;
  private readonly secretList: HTMLElement;
  private readonly rows = new Map<string, Row>();
  private readonly secretRows = new Map<string, Row>();
  private order = '';
  private marksS = '';

  constructor(private readonly src: FeatsSource) {
    this.marksNote = h('p', { class: 'dd-sheet-note' });
    this.list = h('div', { class: 'dd-feat-list' });
    this.secretList = h('div', { class: 'dd-feat-list' });
    this.body = h('div', { class: 'dd-sheet-body dd-feats' }, this.rankRow.el, this.marksNote, heading(t('ui.tab.feats')), this.list, heading(t('ui.feat.secret')), this.secretList);
  }

  opened(): void {
    this.order = '';
    this.refresh();
  }

  refresh(): void {
    const r = this.src.rank();
    this.rankRow.set(t('ui.rank.label', { rank: r.rank }), r.next, r.title).progress(r.need > 0 ? r.xp / r.need : 0);
    const marks = this.src.marks();
    const ms = t('ui.feat.marks', { marks, pct: marks });
    if (ms !== this.marksS) {
      this.marksS = ms;
      this.marksNote.textContent = ms;
    }
    const fs = this.src.feats();
    const order = fs.map((f) => f.id).join(',');
    for (const f of fs) {
      let row = this.rows.get(f.id);
      if (!row) {
        row = new Row('dd-featrow', 'medal');
        this.rows.set(f.id, row);
      }
      row.set(f.name, f.line, f.tier).progress(f.progress).flag('hot', false);
    }
    // The top three (closest to a tier) glow.
    fs.slice(0, 3).forEach((f) => this.rows.get(f.id)?.flag('hot', f.progress >= 0.5));
    if (order !== this.order) {
      this.order = order;
      this.list.replaceChildren(...fs.map((f) => this.rows.get(f.id)!.el));
    }
    const ss = this.src.secrets();
    if (this.secretRows.size !== ss.length) {
      this.secretList.replaceChildren();
      this.secretRows.clear();
      for (const sec of ss) {
        const row = new Row('dd-secretrow', 'question');
        this.secretRows.set(sec.id, row);
        this.secretList.appendChild(row.el);
      }
    }
    for (const sec of ss) {
      const row = this.secretRows.get(sec.id);
      if (!row) continue;
      row.set(sec.found ? sec.name : t('ui.feat.locked'), sec.hint).progress(-1).flag('found', sec.found).setIcon(sec.found ? 'medal' : 'question');
    }
  }

  rowOf(id: string): HTMLElement | null {
    return this.rows.get(id)?.el ?? null;
  }
}
