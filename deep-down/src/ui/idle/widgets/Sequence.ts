// Sequence (SPEC §7.3): 3–8 marks light in order (0.5 s each), then the player taps them back in order (Ancient Echo,
// Bone Rattle, Thread Weave, Rune Lock). The board sits on the back wall above the floor, inside the reach band
// (CRITIQUE MUST 8); a wrong tap shakes the board and the show plays again once. Marks are world targets (entity ids
// `<widgetId>:<mark>`), so a tap between them digs.

import type { SequenceWidget } from '../../../idle/model/state';
import { sequenceLit, sequenceShowing } from '../../../idle/model/widgets';
import { h } from '../../dom';
import { spring, tween } from '../../fx/waapi';
import { WidgetBar } from './common';
import type { WidgetSource, WidgetTarget, WidgetUi } from './types';

const MAX = 8;
const HIT_R = 34;

/** Eight carved glyphs of the builders' script (stroke paths on a 24-unit grid). */
const GLYPHS = [
  'M8 4 V20 M8 8 L16 4 M8 13 L16 9',
  'M12 4 V20 M6 10 L12 4 L18 10',
  'M7 4 V20 M17 4 V20 M7 12 L17 12',
  'M12 4 L18 12 L12 20 L6 12 Z',
  'M7 4 L17 20 M17 4 L7 20',
  'M12 4 V20 M12 12 L6 6 M12 12 L18 6',
  'M6 6 H18 M12 6 V20 M8 20 H16',
  'M7 20 V8 L12 4 L17 8 V20',
];
const glyphSvg = (i: number) =>
  `<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="${GLYPHS[i % GLYPHS.length]}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Board layout (shaft columns, rows below the floor's top): two rows of up to 4 marks, 1.3 m above the floor and 1.6 m
 * into the section, so every mark sits in the reach band and the lower 65 % of the world region (CRITIQUE MUST 8).
 */
export function sequenceBoard(n: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  const top = Math.ceil(n / 2);
  const bottom = n - top;
  const row = (k: number, y: number) => {
    for (let i = 0; i < k; i++) out.push({ x: k === 1 ? 3 : 0.6 + (4.8 * i) / (k - 1), y });
  };
  row(top, -1.3);
  row(bottom, 1.6);
  return out;
}

export class SequenceUi implements WidgetUi {
  readonly kind = 'sequence' as const;
  readonly el: HTMLElement;
  widgetId = '';
  private floor0 = 0;
  private readonly marks: HTMLElement[] = [];
  private readonly bar = new WidgetBar();
  private readonly list: WidgetTarget[] = [];
  private board: Array<{ x: number; y: number }> = [];
  private closing = 0;
  private litS = -2;
  private posS = -1;
  private restartsS = 0;

  constructor(private readonly src: WidgetSource) {
    for (let i = 0; i < MAX; i++) {
      const g = h('i', { class: 'dd-seq-glyph' });
      // trusted: the static glyph table above
      g.innerHTML = glyphSvg(i);
      this.marks.push(h('span', { class: 'dd-seq-mark hide' }, g));
    }
    this.el = h('div', { class: 'dd-widget dd-w-seq hide', 'aria-hidden': 'true' }, this.bar.el, ...this.marks);
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
    this.litS = -2;
    this.posS = -1;
    this.restartsS = 0;
    this.board = [];
    this.layout(this.view());
    this.el.classList.remove('hide');
    this.bar.show('rune');
  }

  /** Lay out the board once the model's widget exists (it announces the widget a frame before it holds it). */
  private layout(w: SequenceWidget | null): void {
    if (!w) {
      for (const m of this.marks) m.className = 'dd-seq-mark hide';
      return;
    }
    const n = Math.max(3, Math.min(MAX, w.board));
    this.board = sequenceBoard(n);
    for (let i = 0; i < MAX; i++) this.marks[i].className = i < n ? 'dd-seq-mark' : 'dd-seq-mark hide';
  }

  private view(): SequenceWidget | null {
    const w = this.src.widget(this.widgetId);
    return w && w.kind === 'sequence' ? w : null;
  }

  frame(now: number, dt: number): void {
    void dt;
    if (this.closing && now >= this.closing) {
      this.closing = 0;
      this.el.classList.add('hide');
      this.bar.hide();
    }
    this.list.length = 0;
    if (!this.widgetId) return;
    const w = this.view();
    if (!w) return;
    if (this.board.length !== Math.max(3, Math.min(MAX, w.board))) this.layout(w);
    const t = this.src.time();
    const showing = sequenceShowing(w, t);
    const lit = sequenceLit(w, t);
    for (let i = 0; i < this.board.length; i++) {
      const b = this.board[i];
      const at = this.src.screen(b.x, b.y, this.floor0);
      const m = this.marks[i];
      const tr = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
      if (m.style.transform !== tr) m.style.transform = tr;
      if (!showing) this.list.push({ id: `${this.widgetId}:${i}`, x: at.x, y: at.y, r: HIT_R });
    }
    if (lit !== this.litS) {
      if (this.litS >= 0) this.marks[this.litS]?.classList.remove('lit');
      this.litS = lit;
      if (lit >= 0) {
        this.marks[lit]?.classList.add('lit');
        spring(this.marks[lit].firstElementChild as Element, 'snap', 1.35, 1, (v) => `scale(${v})`);
      }
    }
    this.el.classList.toggle('input', !showing);
    if (w.pos !== this.posS) {
      // Marks already tapped back stay lit in order.
      for (let i = 0; i < this.board.length; i++) this.marks[i].classList.toggle('done', w.order.slice(0, w.pos).includes(i));
      this.posS = w.pos;
    }
    if (w.restarts !== this.restartsS) {
      this.restartsS = w.restarts;
      tween(this.el, [{ transform: 'translateX(0px)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0px)' }], 280, 'standard');
    }
    const end = w.born + w.life;
    this.bar.set(this.src.text(showing ? 'ui.widget.seqWatch' : 'ui.widget.seqTap', { n: w.pos, of: w.order.length }), showing ? 1 : (end - t) / Math.max(1e-6, w.life));
  }

  targets(): readonly WidgetTarget[] {
    return this.list;
  }

  hit(id: string, now: number): void {
    void now;
    const i = Number(id.slice(id.lastIndexOf(':') + 1));
    const m = this.marks[i];
    if (m) spring(m.firstElementChild as Element, 'jelly', 0.75, 1, (v) => `scale(${v})`);
  }

  close(result: string, now: number): void {
    this.el.dataset.result = result;
    this.widgetId = '';
    this.list.length = 0;
    this.closing = now + 520;
  }
}
