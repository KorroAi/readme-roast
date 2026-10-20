// The tutorial's guide (SPEC §8.2, §9.3 z 6): a ghost hand that presses the thing to do, and a focus scrim (0.45)
// with an octagon hole on it. Both are pointer-events: none: the world keeps digging under them (§8.1 "no modal in
// the first 3 minutes"), and the target itself stays tappable through the hole.

import { h } from '../dom';
import { play } from '../fx/waapi';

export interface GuideTarget {
  /** Centre of the target (CSS px). */
  x: number;
  y: number;
  /** Size of the focus hole (CSS px; 0: no scrim). */
  w: number;
  h: number;
}

export class GhostHand {
  readonly el: HTMLElement;
  private readonly hand: HTMLElement;
  private readonly scrim: HTMLElement;
  private readonly prompt: HTMLElement;
  private target: GuideTarget | null = null;
  private id = '';
  private anim: Animation | null = null;
  private promptS = '';
  private key = '';

  constructor() {
    this.hand = h('span', { class: 'dd-hand', 'aria-hidden': 'true' });
    this.hand.innerHTML =
      // A gloved pointing hand in lamplight (decorative SVG, generated here).
      '<svg viewBox="0 0 48 56" width="48" height="56"><defs><radialGradient id="ddhg" cx="40%" cy="30%" r="70%"><stop offset="0" stop-color="#fff6e0"/><stop offset="1" stop-color="#e2b673"/></radialGradient></defs>' +
      '<path d="M18 4c3 0 5 2 5 5v17l2-1V15c0-3 5-3 5 0v10l2-.5V18c0-3 5-3 5 0v8l1.5-.3c2.5-.4 4.5 1.4 4.5 4v9c0 9-7 15-16 15h-2c-6 0-10-3-13-8L5 33c-1.6-2.8 1.8-5.8 4.4-3.8L13 32V9c0-3 2-5 5-5z" fill="url(#ddhg)" stroke="#5e4220" stroke-width="2" stroke-linejoin="round"/></svg>';
    this.scrim = h('span', { class: 'dd-focus', 'aria-hidden': 'true' });
    this.prompt = h('span', { class: 'dd-guide-prompt', role: 'status', 'aria-live': 'polite', style: 'display:none' });
    this.el = h('div', { class: 'dd-guide hide' }, this.scrim, this.hand, this.prompt);
  }

  /** What the hand points at ('' hidden). */
  get targetId(): string {
    return this.id;
  }

  /**
   * Point at a target (null hides). `scrim` darkens everything but the target. `text` is the prompt beside the hand
   * ('' none; the goal bar carries the main line). Call every frame: it follows the target.
   */
  show(id: string, t: GuideTarget | null, scrim: boolean, text = ''): void {
    if (!t || !id) {
      if (this.id) {
        this.id = '';
        this.target = null;
        this.el.classList.add('hide');
        this.anim?.cancel();
        this.anim = null;
      }
      return;
    }
    const key = `${id}|${Math.round(t.x)}|${Math.round(t.y)}|${scrim ? 1 : 0}|${Math.round(t.w)}`;
    if (key !== this.key) {
      this.key = key;
      this.hand.style.transform = `translate(${Math.round(t.x - 14)}px, ${Math.round(t.y - 6)}px)`;
      if (scrim && t.w > 0) {
        const x0 = t.x - t.w / 2 - 6;
        const y0 = t.y - t.h / 2 - 6;
        const x1 = t.x + t.w / 2 + 6;
        const y1 = t.y + t.h / 2 + 6;
        const c = 10;
        // An evenodd polygon: the whole screen with an octagon hole around the target.
        this.scrim.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x0 + c}px ${y0}px, ${x1 - c}px ${y0}px, ${x1}px ${y0 + c}px, ${x1}px ${y1 - c}px, ${x1 - c}px ${y1}px, ${x0 + c}px ${y1}px, ${x0}px ${y1 - c}px, ${x0}px ${y0 + c}px, ${x0 + c}px ${y0}px)`;
        this.scrim.style.display = '';
      } else this.scrim.style.display = 'none';
    }
    if (text !== this.promptS) {
      this.promptS = text;
      this.prompt.textContent = text;
      this.prompt.style.display = text ? '' : 'none';
    }
    if (text) this.prompt.style.transform = `translate(${Math.round(Math.max(16, Math.min(window.innerWidth - 220, t.x - 100)))}px, ${Math.round(t.y - t.h / 2 - 44)}px)`;
    if (id !== this.id) {
      this.id = id;
      this.target = t;
      this.el.classList.remove('hide');
      this.anim?.cancel();
      // The press: down 10 px and squash, up again, every 1.2 s (inOutCubic).
      this.anim = play(
        this.hand.firstElementChild as Element,
        [
          { transform: 'translate(0px, -10px) scale(1)', opacity: 0.95 },
          { transform: 'translate(0px, 0px) scale(0.92)', opacity: 1, offset: 0.35 },
          { transform: 'translate(0px, -2px) scale(0.96)', opacity: 1, offset: 0.5 },
          { transform: 'translate(0px, -10px) scale(1)', opacity: 0.95 },
        ],
        { duration: 1200, iterations: Infinity, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' },
      );
    }
    this.target = t;
  }

  get current(): GuideTarget | null {
    return this.target;
  }
}
