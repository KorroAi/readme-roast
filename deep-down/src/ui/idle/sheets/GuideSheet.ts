// The Guide (SPEC §8.8, §9.4; CRITIQUE MUST 7): every first-time card the player has seen, newest first, with its
// one line and its three-line "how it works". First-time cards never take a tap while play runs (they sit over the
// shaft), so this is where they are read again: the 48 px "?" chip in the skill row opens it, and so does the Codex.

import { t, type TextKey } from '../../../i18n';
import { h } from '../../dom';
import type { SheetBody } from '../Sheet';

/** One entry of the Guide. */
export interface GuideEntry {
  id: string;
  title: string;
  body: string;
}

export interface GuideSource {
  /** Every first-time card seen, oldest first (only those with words). */
  guideEntries(): readonly GuideEntry[];
}

export class GuideSheet implements SheetBody {
  readonly id = 'guide' as const;
  readonly title: TextKey = 'ui.guide.title';
  readonly modes = false;
  readonly body: HTMLElement;
  private readonly list: HTMLElement;
  private readonly empty: HTMLElement;
  private count = -1;
  private readonly rows = new Map<string, HTMLElement>();

  constructor(private readonly src: GuideSource) {
    this.list = h('div', { class: 'dd-guide-list' });
    this.empty = h('p', { class: 'dd-sheet-note', text: t('ui.guide.empty') });
    this.body = h('div', { class: 'dd-sheet-body dd-guide-sheet' }, h('p', { class: 'dd-sheet-note', text: t('ui.guide.intro') }), this.empty, this.list);
  }

  opened(): void {
    this.count = -1;
    this.refresh();
  }

  refresh(): void {
    const entries = this.src.guideEntries();
    if (entries.length === this.count) return;
    this.count = entries.length;
    this.empty.style.display = entries.length ? 'none' : '';
    const parts: HTMLElement[] = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      let row = this.rows.get(e.id);
      if (!row) {
        row = h('article', { class: 'dd-guide-row dd-row-anim', 'data-guide': e.id }, h('h3', { class: 'dd-guide-title', text: e.title }), h('p', { class: 'dd-guide-body', text: e.body }));
        this.rows.set(e.id, row);
      }
      parts.push(row);
    }
    this.list.replaceChildren(...parts);
  }

  rowOf(id: string): HTMLElement | null {
    return this.rows.get(id) ?? null;
  }
}
