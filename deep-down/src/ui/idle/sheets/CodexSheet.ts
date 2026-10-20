// The Codex (SPEC §7.5, §9.4): "Next Codex chest at 70 (3 to go)", the mystery gauge, the current biome page first
// (6 Finds, 3 creatures, 5 Lore as octagon plates: found ones bright with their level, the rest dark silhouettes with a
// hint), the other pages reached, Biome Seals stamped, and the Guide (how each system works) one tap away.

import type { TextKey } from '../../../i18n';
import { t } from '../../../i18n';
import { h } from '../../dom';
import { iconEl, setIcon, type IconId } from '../icons';
import type { SheetBody } from '../Sheet';
import { heading } from './rows';

export interface CodexEntryView {
  id: string;
  section: 'find' | 'bestiary' | 'lore';
  found: boolean;
  level: number;
  name: string;
  hint: string;
}

export interface CodexSource {
  /** Pages to show (the current biome first): biome index, name, entries, sealed. */
  pages(): ReadonlyArray<{ biome: number; name: string; entries: readonly CodexEntryView[]; sealed: boolean }>;
  nextChest(): { at: number; toGo: number };
  percent(): number;
  openGuide(): void;
}

const SECTION_ICON: Record<string, IconId> = { find: 'find', bestiary: 'creature', lore: 'lore' };
const PLATES = 14;

class Page {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly count: HTMLElement;
  private readonly plates: Array<{ el: HTMLElement; ico: HTMLElement; name: HTMLElement; lv: HTMLElement }> = [];
  private sig = '';

  constructor() {
    this.title = h('span', { class: 'dd-cx-title' });
    this.count = h('span', { class: 'dd-cx-count' });
    const grid = h('div', { class: 'dd-cx-grid' });
    for (let i = 0; i < PLATES; i++) {
      const ico = iconEl('find', 'dd-cx-ico');
      const name = h('span', { class: 'dd-cx-name' });
      const lv = h('span', { class: 'dd-cx-lv' });
      const el = h('span', { class: 'dd-cx-plate' }, ico, name, lv);
      this.plates.push({ el, ico, name, lv });
      grid.appendChild(el);
    }
    this.el = h('section', { class: 'dd-cx-page dd-row-anim' }, h('header', { class: 'dd-cx-head' }, this.title, this.count), grid);
  }

  set(name: string, entries: readonly CodexEntryView[], sealed: boolean): void {
    const sig = `${name}|${sealed}|${entries.map((e) => `${e.found ? 1 : 0}${e.level}`).join('')}`;
    if (sig === this.sig) return;
    this.sig = sig;
    this.title.textContent = name;
    const found = entries.filter((e) => e.found).length;
    this.count.textContent = sealed ? t('ui.codex.sealed') : t('ui.codex.page', { n: found, of: entries.length });
    this.el.classList.toggle('sealed', sealed);
    for (let i = 0; i < PLATES; i++) {
      const p = this.plates[i];
      const e = entries[i];
      p.el.style.display = e ? '' : 'none';
      if (!e) continue;
      setIcon(p.ico, SECTION_ICON[e.section] ?? 'find');
      p.el.className = `dd-cx-plate ${e.section}${e.found ? ' found' : ''}`;
      p.name.textContent = e.found ? e.name : e.hint;
      p.lv.textContent = e.found && e.level > 1 ? t('ui.codex.level', { level: e.level }) : '';
    }
  }
}

export class CodexSheet implements SheetBody {
  readonly id = 'codex' as const;
  readonly title: TextKey = 'ui.sheet.codex.title';
  readonly modes = false;
  readonly body: HTMLElement;
  private readonly next: HTMLElement;
  private readonly deep: HTMLElement;
  private readonly pagesEl: HTMLElement;
  private readonly pages: Page[] = [];
  private nextS = '';
  private deepS = '';
  private count = -1;

  constructor(private readonly src: CodexSource) {
    this.next = h('p', { class: 'dd-cx-next' });
    this.deep = h('p', { class: 'dd-sheet-note dd-cx-deep' });
    this.pagesEl = h('div', { class: 'dd-cx-pages' });
    const guide = h('button', { class: 'dd-row-btn dd-oct dd-cx-guide', type: 'button', 'data-key': 'guide', onclick: () => this.src.openGuide() }, iconEl('question', 'dd-row-ico'), h('span', { text: t('ui.codex.guideOpen') }));
    this.body = h('div', { class: 'dd-sheet-body dd-codex' }, this.next, this.deep, this.pagesEl, heading(t('ui.codex.guide')), guide);
  }

  opened(): void {
    this.count = -1;
    this.refresh();
  }

  refresh(): void {
    const nc = this.src.nextChest();
    const ns = t('ui.codex.next', { at: nc.at, left: nc.toGo });
    if (ns !== this.nextS) {
      this.nextS = ns;
      this.next.textContent = ns;
    }
    const ds = t('ui.codex.deep', { pct: Math.floor(this.src.percent()) });
    if (ds !== this.deepS) {
      this.deepS = ds;
      this.deep.textContent = ds;
    }
    const ps = this.src.pages();
    while (this.pages.length < ps.length) this.pages.push(new Page());
    if (ps.length !== this.count) {
      this.count = ps.length;
      this.pagesEl.replaceChildren(...this.pages.slice(0, ps.length).map((p) => p.el));
    }
    ps.forEach((p, i) => this.pages[i].set(p.name, p.entries, p.sealed));
  }
}
