// First-time cards (SPEC §8.8): the first time a system, tab, event or widget appears, a one-line plate slides in
// under the goal bar for 2.5 s: "NEW · Golden Vein — gold in the next 5 rows!". No pause, no button. It sits inside
// the world region, so it is pointer-events: none while play runs (CRITIQUE MUST 7): taps under it still dig.

import { t } from '../../i18n';
import { h } from '../dom';
import { spring, tween } from '../fx/waapi';

const SHOW_MS = 2500;

export class FirstTimeCard {
  readonly el: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private readonly queue: Array<{ title: string; body: string }> = [];
  private until = 0;
  private showing = false;

  constructor() {
    this.title = h('span', { class: 'dd-first-title' });
    this.body = h('span', { class: 'dd-first-body' });
    this.el = h('div', { class: 'dd-first hide', role: 'status', 'aria-live': 'polite' }, h('span', { class: 'dd-first-new', text: t('ui.first.new') }), this.title, this.body);
  }

  get visible(): boolean {
    return this.showing;
  }

  /** Queue a card (one at a time). */
  show(title: string, body: string): void {
    if (this.queue.some((q) => q.title === title)) return;
    this.queue.push({ title, body });
  }

  /** Per frame (`now` ms); `hold` while a ceremony runs (toasts wait). */
  frame(now: number, hold: boolean): void {
    if (this.showing && now >= this.until) {
      this.showing = false;
      const a = tween(this.el, [{ transform: 'translateY(0px)', opacity: 1 }, { transform: 'translateY(-12px)', opacity: 0 }], 200, 'inCubic');
      if (a) a.onfinish = () => this.el.classList.add('hide');
      else this.el.classList.add('hide');
    }
    if (!this.showing && !hold && this.queue.length) {
      const q = this.queue.shift()!;
      this.title.textContent = q.title;
      this.body.textContent = q.body;
      this.body.style.display = q.body ? '' : 'none';
      this.el.classList.remove('hide');
      this.showing = true;
      this.until = now + SHOW_MS;
      spring(this.el, 'snap', 0, 1, (v) => `translateY(${(v - 1) * 30}px)`);
    }
  }
}
