// The Lantern sheet (SPEC §5.9, §9.4): before 600 m a teaser ("The Ember Shrine waits at 600 m"); from there the
// Rekindle panel: the deepest metres, "Embers +N", "Power ×A → ×B", "You will pass 1,624 m in about 3 min" (the
// model's 30 ms projection), the rule anyone can repeat ("every new 200 m of record doubles your Embers"), the one big
// REKINDLE button that needs a 0.6 s hold (a brass ring fills), the perks vine (reached ones lit, the next glowing)
// and the Stats panel (every multiplier, sorted by size).

import type { TextKey } from '../../../i18n';
import { t } from '../../../i18n';
import { h } from '../../dom';
import { tween } from '../../fx/waapi';
import type { SheetBody } from '../Sheet';
import { heading, Row } from './rows';

export interface LanternView {
  /** Rekindle unlocked (the Ember Shrine reached). */
  open: boolean;
  teaser: string;
  deepest: string;
  gain: string;
  power: string;
  pass: string;
  recommended: boolean;
  canRekindle: boolean;
  embers: string;
}

export interface LanternSource {
  lantern(): LanternView;
  perks(): ReadonlyArray<{ at: string; name: string; reached: boolean; next: boolean }>;
  stats(): ReadonlyArray<{ name: string; value: string }>;
  /** The hold on REKINDLE completed. */
  rekindle(): void;
  holdSeconds: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_C = 2 * Math.PI * 34;

export class LanternSheet implements SheetBody {
  readonly id = 'lantern' as const;
  readonly title: TextKey = 'ui.sheet.lantern.title';
  readonly modes = false;
  readonly body: HTMLElement;
  private readonly teaser: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly deepest: HTMLElement;
  private readonly gain: HTMLElement;
  private readonly power: HTMLElement;
  private readonly pass: HTMLElement;
  private readonly rec: HTMLElement;
  private readonly embers: HTMLElement;
  private readonly btn: HTMLButtonElement;
  private readonly ring: SVGCircleElement;
  private readonly perksEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly perkRows: Row[] = [];
  private readonly statRows: Row[] = [];
  private holdT0 = -1;
  private holdDone = false;
  private s: Record<string, string> = {};

  constructor(private readonly src: LanternSource) {
    this.teaser = h('p', { class: 'dd-ln-teaser' });
    this.deepest = h('span', { class: 'dd-ln-deepest' });
    this.gain = h('span', { class: 'dd-ln-gain' });
    this.power = h('span', { class: 'dd-ln-power' });
    this.pass = h('span', { class: 'dd-ln-pass' });
    this.rec = h('span', { class: 'dd-ln-rec', text: t('ui.lantern.recommended') });
    this.embers = h('span', { class: 'dd-ln-embers' });
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 76 76');
    svg.setAttribute('class', 'dd-ln-ring');
    this.ring = document.createElementNS(SVG_NS, 'circle');
    this.ring.setAttribute('cx', '38');
    this.ring.setAttribute('cy', '38');
    this.ring.setAttribute('r', '34');
    this.ring.style.strokeDasharray = `${RING_C}`;
    this.ring.style.strokeDashoffset = `${RING_C}`;
    svg.appendChild(this.ring);
    this.btn = h('button', { class: 'dd-ln-btn', type: 'button', 'data-key': 'rekindle', 'aria-label': t('ui.lantern.hold') }, svg, h('span', { class: 'dd-ln-btn-t', text: t('ui.lantern.rekindle') }));
    const up = () => {
      this.holdT0 = -1;
      this.setRing(0);
    };
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.btn.disabled) return;
      this.holdT0 = performance.now();
      this.holdDone = false;
    });
    this.btn.addEventListener('pointerup', up);
    this.btn.addEventListener('pointercancel', up);
    this.btn.addEventListener('pointerleave', up);
    this.panel = h(
      'div',
      { class: 'dd-ln-panel' },
      this.deepest,
      h('span', { class: 'dd-ln-big' }, this.gain, this.rec),
      this.power,
      this.pass,
      h('p', { class: 'dd-sheet-note', text: t('ui.lantern.rule') }),
      this.btn,
      h('p', { class: 'dd-sheet-note', text: t('ui.lantern.keep') }),
      h('p', { class: 'dd-sheet-note', text: t('ui.lantern.reset') }),
    );
    this.perksEl = h('div', { class: 'dd-ln-perks' });
    this.statsEl = h('div', { class: 'dd-ln-stats' });
    this.body = h('div', { class: 'dd-sheet-body dd-lantern' }, this.teaser, this.embers, this.panel, heading(t('ui.lantern.perks')), this.perksEl, heading(t('ui.lantern.stats')), this.statsEl);
  }

  private put(k: string, el: HTMLElement, v: string): void {
    if (this.s[k] === v) return;
    this.s[k] = v;
    el.textContent = v;
  }

  private setRing(f: number): void {
    this.ring.style.strokeDashoffset = `${RING_C * (1 - Math.max(0, Math.min(1, f)))}`;
  }

  opened(): void {
    this.s = {};
    this.refresh(performance.now());
  }

  refresh(now = performance.now()): void {
    const v = this.src.lantern();
    this.teaser.style.display = v.open ? 'none' : '';
    this.panel.style.display = v.open ? '' : 'none';
    this.put('teaser', this.teaser, v.teaser);
    this.put('embers', this.embers, v.embers);
    if (v.open) {
      this.put('deepest', this.deepest, v.deepest);
      this.put('gain', this.gain, v.gain);
      this.put('power', this.power, v.power);
      this.put('pass', this.pass, v.pass);
      this.rec.style.display = v.recommended ? '' : 'none';
      this.btn.disabled = !v.canRekindle;
      this.btn.classList.toggle('ready', v.canRekindle);
      this.btn.classList.toggle('recommended', v.recommended);
    }
    // The 0.6 s hold: the brass ring fills; at the end the Rekindle starts (once).
    if (this.holdT0 >= 0 && !this.holdDone) {
      const f = (now - this.holdT0) / (this.src.holdSeconds * 1000);
      this.setRing(f);
      if (f >= 1) {
        this.holdDone = true;
        this.holdT0 = -1;
        tween(this.btn, [{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }], 300, 'outCubic');
        this.src.rekindle();
      }
    }
    const perks = this.src.perks();
    while (this.perkRows.length < perks.length) {
      const r = new Row('dd-perkrow', 'ember');
      this.perkRows.push(r);
      this.perksEl.appendChild(r.el);
    }
    perks.forEach((p, i) => this.perkRows[i].set(p.name, p.at).progress(-1).flag('reached', p.reached).flag('next', p.next));
    const stats = this.src.stats();
    while (this.statRows.length < stats.length) {
      const r = new Row('dd-statrow', 'star');
      this.statRows.push(r);
      this.statsEl.appendChild(r.el);
    }
    for (let i = 0; i < this.statRows.length; i++) {
      const st = stats[i];
      this.statRows[i].el.style.display = st ? '' : 'none';
      if (st) this.statRows[i].set(st.name, '', st.value).progress(-1);
    }
  }

  rowOf(id: string): HTMLElement | null {
    return id === 'rekindle' ? this.btn : null;
  }
}
