import { h } from './dom';

// The info toast: short system lines (saved, quality lowered, the legacy-save notice). It never takes pointer
// input (CRITIQUE MUST 7: HUD overlays never steal a dig tap) and cleans up its own timers.

const TOAST_MS = 3200;
const TOAST_MAX = 3;
const LEAVE_MS = 400;

export type ToastTone = 'info' | 'warn' | 'good';

/** Remove after the CSS leave transition (shorter when motion is reduced). */
function leave(el: HTMLElement): void {
  el.classList.add('leaving');
  window.setTimeout(() => el.remove(), LEAVE_MS);
}

export class Toasts {
  readonly el = h('div', { class: 'dd-toasts', 'aria-live': 'polite' });
  private readonly live = new Map<string, { el: HTMLElement; timer: number }>();

  /** @param ms how long it stays (default 3.2 s). */
  show(text: string, tone: ToastTone = 'info', ms = TOAST_MS): HTMLElement {
    // The same message again refreshes instead of stacking.
    const existing = this.live.get(text);
    if (existing) {
      window.clearTimeout(existing.timer);
      existing.timer = window.setTimeout(() => this.dismiss(text), ms);
      return existing.el;
    }
    const el = h('div', { class: `dd-toast ${tone}`, role: tone === 'warn' ? 'alert' : 'status' }, h('span', { class: 'dd-toast-dot', 'aria-hidden': 'true' }), text);
    this.el.appendChild(el);
    this.live.set(text, { el, timer: window.setTimeout(() => this.dismiss(text), ms) });
    while (this.live.size > TOAST_MAX) this.dismiss(this.live.keys().next().value!);
    return el;
  }

  /** Toasts on screen now. */
  get count(): number {
    return this.live.size;
  }

  private dismiss(text: string): void {
    const entry = this.live.get(text);
    if (!entry) return;
    window.clearTimeout(entry.timer);
    this.live.delete(text);
    leave(entry.el);
  }

  dispose(): void {
    for (const e of this.live.values()) window.clearTimeout(e.timer);
    this.live.clear();
  }
}
