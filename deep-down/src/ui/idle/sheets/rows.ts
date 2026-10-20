// Small building blocks shared by the W2 sheets (Board, Feats, Codex, Lantern): a row with an icon, a title, a line,
// a progress bar and an optional button, all written only when a value changes (F10: no DOM churn in steady frames).

import { h } from '../../dom';
import { iconEl, setIcon, type IconId } from '../icons';

export class Row {
  readonly el: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly title: HTMLElement;
  private readonly line: HTMLElement;
  private readonly side: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  readonly btn: HTMLButtonElement | null;
  private s: Record<string, string> = {};
  private fillS = -1;

  constructor(cls: string, icon: IconId, withButton: ((ev: Event) => void) | null = null, key = '') {
    this.icon = iconEl(icon, 'dd-row-ico');
    this.title = h('span', { class: 'dd-row-title' });
    this.line = h('span', { class: 'dd-row-line' });
    this.side = h('span', { class: 'dd-row-side' });
    this.fill = h('i', { class: 'dd-row-fill' });
    this.bar = h('span', { class: 'dd-row-bar' }, this.fill);
    this.btn = withButton ? h('button', { class: 'dd-row-btn dd-oct', type: 'button', 'data-key': key }) : null;
    if (this.btn && withButton) this.btn.addEventListener('click', withButton);
    this.el = h('div', { class: `dd-row dd-row-anim ${cls}` }, this.icon, h('span', { class: 'dd-row-text' }, h('span', { class: 'dd-row-top' }, this.title, this.side), this.line, this.bar), ...(this.btn ? [this.btn] : []));
  }

  private put(k: string, el: HTMLElement, v: string): void {
    if (this.s[k] === v) return;
    this.s[k] = v;
    el.textContent = v;
    el.style.display = v ? '' : 'none';
  }

  set(title: string, line: string, side = ''): this {
    this.put('t', this.title, title);
    this.put('l', this.line, line);
    this.put('s', this.side, side);
    return this;
  }

  /** The progress bar (−1 hides it). */
  progress(f: number): this {
    const v = f < 0 ? -1 : Math.round(Math.max(0, Math.min(1, f)) * 400) / 400;
    if (v === this.fillS) return this;
    this.fillS = v;
    this.bar.style.display = v < 0 ? 'none' : '';
    if (v >= 0) this.fill.style.transform = `scaleX(${v})`;
    return this;
  }

  setIcon(id: IconId): this {
    setIcon(this.icon, id);
    return this;
  }

  button(text: string, enabled: boolean): this {
    if (!this.btn) return this;
    const k = `${text}|${enabled}`;
    if (this.s.b === k) return this;
    this.s.b = k;
    this.btn.textContent = text;
    this.btn.style.display = text ? '' : 'none';
    this.btn.disabled = !enabled;
    this.btn.classList.toggle('ready', enabled);
    return this;
  }

  flag(cls: string, on: boolean): this {
    if (this.el.classList.contains(cls) !== on) this.el.classList.toggle(cls, on);
    return this;
  }
}

/** A section heading. */
export function heading(text: string): HTMLElement {
  return h('h3', { class: 'dd-sheet-group', text });
}
