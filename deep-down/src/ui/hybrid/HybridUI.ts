// The DOM over the first-person world, bottom to top: the cross-fade's dip (z 0), the calm HUD (z 1, its sheet and
// plates), the token canvas (gains fly to the gold plate, L8), toasts. Transparent to pointers except where a plate opts
// back in, so the world canvas below takes every other touch. No menu screen: the menu is the camp, in first person.

import '../ui.css';
import { installLintelFont } from '../brand/lintelFont';
import { h } from '../dom';
import { FxCanvas } from '../fx/FxCanvas';
import { Toasts, type ToastTone } from '../notices';
import type { Settings } from '../../save/types';
import { Hud, type HudHooks } from './Hud';

export class HybridUI {
  readonly el: HTMLElement;
  readonly hud: Hud;
  readonly fx: FxCanvas;
  readonly toasts = new Toasts();
  private readonly fadeEl: HTMLElement;
  private readonly fpsEl: HTMLElement;

  constructor(root: HTMLElement, hooks: HudHooks) {
    installLintelFont();
    this.el = h('div', { class: 'dd-ui hy-ui' });
    this.el.style.pointerEvents = 'none';
    this.fadeEl = h('div', { class: 'hy-fade', 'aria-hidden': 'true' });
    this.el.append(this.fadeEl);
    this.hud = new Hud(this.el, hooks);
    root.appendChild(this.el);
    this.fx = new FxCanvas(this.el);
    this.fpsEl = h('div', { class: 'dd-fps hide', 'aria-hidden': 'true' });
    this.el.append(h('div', { class: 'dd-toast-layer' }, this.toasts.el), this.fpsEl);
    void document.fonts?.ready.then(() => this.fx.fontLoaded());
  }

  /** The cross-fade's dip (0..1), drawn under the HUD so the objective line stays readable (L5). */
  setFade(v: number): void {
    const o = Math.max(0, Math.min(1, v));
    const s = o.toFixed(3);
    if (this.fadeEl.style.opacity !== s) this.fadeEl.style.opacity = s;
  }

  toast(text: string, tone: ToastTone = 'info', ms?: number): HTMLElement {
    return this.toasts.show(text, tone, ms);
  }

  /** Large text, high contrast, left-handed, motion classes on the root. */
  applySettings(s: Settings): void {
    this.el.classList.toggle('dd-large', s.textSize === 'large');
    this.el.classList.toggle('dd-contrast', s.highContrast);
    this.el.classList.toggle('dd-lefty', s.leftHanded);
    this.el.classList.toggle('dd-motion-off', s.motion === 'off');
    this.el.classList.toggle('dd-motion-reduced', s.motion === 'reduced');
    this.fpsEl.classList.toggle('hide', !s.showFps);
  }

  setFps(text: string): void {
    if (this.fpsEl.classList.contains('hide')) return;
    if (this.fpsEl.textContent !== text) this.fpsEl.textContent = text;
  }

  /** No shell screen in the hybrid (the camp is the menu); kept for the release shell's Back logic. */
  get screen(): string {
    return 'none';
  }

  get blocking(): boolean {
    return false;
  }

  dispose(): void {
    this.toasts.dispose();
    this.hud.dispose();
    this.el.remove();
  }
}
