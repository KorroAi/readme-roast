// Buttons, cards and purchases (SPEC §10.7): the press, the snap back, the "no" shake, the ready ping, the delta
// chip, and hold-to-buy (after 380 ms, 8 buys a second rising to 16/s after 1.5 s; each repeat a mini-press).
// Transforms go on an inner element so a card's own layout transform is never overwritten.

import { play, spring, tween } from './waapi';

/** Hold-to-buy timing (SPEC §5.5 item 5). */
export const HOLD = { delay: 380, rate: 8, fastRate: 16, fastAfter: 1500, slop: 10 } as const;

/** The press: scale 0.94 and 2 px down, 70 ms outQuad. */
export function pressDown(el: Element): void {
  tween(el, [{ transform: 'translateY(0px) scale(1)' }, { transform: 'translateY(2px) scale(0.94)' }], 70, 'outQuad', { fill: 'forwards' });
}

/** The release: snap back to 1 (peak 1.007 on the snap spring). */
export function pressUp(el: Element): void {
  spring(el, 'snap', 0.94, 1, (v) => `translateY(${((1 - v) / 0.06) * 2}px) scale(${v})`);
}

/** A repeat inside a hold: 0.97 → 1 over 60 ms. */
export function miniPress(el: Element): void {
  tween(el, [{ transform: 'scale(0.97)' }, { transform: 'scale(1)' }], 60, 'outQuad');
}

/** "No": 0, −6, 6, −4, 4, −2, 0 px over 280 ms. */
export function shakeNo(el: Element): void {
  play(
    el,
    [0, -6, 6, -4, 4, -2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 280, easing: 'linear' },
  );
}

/** The ready ping: snap 1 → 1.04 → 1. */
export function readyPing(el: Element): void {
  play(
    el,
    [{ transform: 'scale(1)' }, { transform: 'scale(1.04)', offset: 0.35 }, { transform: 'scale(1)' }],
    { duration: 300, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
  );
}

/** A pip pops 0 → 1.3 → 1. */
export function pipPop(el: Element): void {
  spring(el, 'jelly', 0, 1, (v) => `scale(${v})`);
}

/** A stamp lands 1.8 → 1 with −8° → 0° on the snap spring. */
export function stamp(el: Element): void {
  spring(el, 'snap', 1.8, 1, (v) => `rotate(${((v - 1) / 0.8) * -8}deg) scale(${v})`);
}

/** A chip rises `px` and fades over `ms`. */
export function riseFade(el: Element, px = 18, ms = 700): Animation | null {
  return tween(el, [{ transform: 'translateY(0px)', opacity: 1 }, { transform: `translateY(${-px}px)`, opacity: 0 }], ms, 'outCubic', { fill: 'forwards' });
}

export interface HoldButtonOptions {
  /** One purchase. @returns true when it went through (a repeat that fails ends the hold). */
  act(repeat: boolean, index: number): boolean;
  /** The element that squashes (an inner face). */
  face: Element;
  /** performance.now() (tests). */
  now?: () => number;
}

/**
 * Tap or hold a button to act. A tap acts on release (a drag past 10 px cancels: lists scroll). A hold acts at
 * 380 ms, then repeats at 8/s, 16/s after 1.5 s, until release or a failed act.
 */
export class HoldButton {
  private down = false;
  private held = false;
  private moved = false;
  private x = 0;
  private y = 0;
  private t0 = 0;
  private next = 0;
  private count = 0;
  private raf = 0;
  private readonly now: () => number;
  private readonly disposers: Array<() => void> = [];
  /** Purchases made by the current hold (0 when none). */
  get repeats(): number {
    return this.held ? this.count : 0;
  }

  constructor(private readonly el: HTMLElement, private readonly o: HoldButtonOptions) {
    this.now = o.now ?? (() => performance.now());
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(type, fn as EventListener);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener));
    };
    on('pointerdown', (e) => this.onDown(e));
    on('pointermove', (e) => this.onMove(e));
    on('pointerup', () => this.onUp(false));
    on('pointercancel', () => this.onUp(true));
    on('lostpointercapture', () => this.onUp(true));
    // Keyboard and assistive tech: a click with no pointer (detail 0) acts once.
    on('click', (e) => {
      if ((e as MouseEvent).detail === 0) this.o.act(false, 0);
    });
  }

  private onDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.down = true;
    this.held = false;
    this.moved = false;
    this.count = 0;
    this.x = e.clientX;
    this.y = e.clientY;
    this.t0 = this.now();
    this.next = this.t0 + HOLD.delay;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Capture is optional.
    }
    pressDown(this.o.face);
    this.loop();
  }

  private onMove(e: PointerEvent): void {
    if (!this.down || this.held) return;
    if (Math.hypot(e.clientX - this.x, e.clientY - this.y) > HOLD.slop) {
      this.moved = true;
      this.stop();
      pressUp(this.o.face);
    }
  }

  private onUp(cancel: boolean): void {
    if (!this.down) return;
    const wasHeld = this.held;
    this.stop();
    pressUp(this.o.face);
    if (!cancel && !wasHeld && !this.moved) this.o.act(false, 0);
  }

  private stop(): void {
    this.down = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly loop = (): void => {
    if (!this.down) return;
    const t = this.now();
    if (t >= this.next) {
      if (!this.held) this.held = true;
      const ok = this.o.act(this.count > 0, this.count);
      this.count++;
      if (this.count > 1) miniPress(this.o.face);
      if (!ok) {
        this.stop();
        pressUp(this.o.face);
        return;
      }
      const rate = t - this.t0 >= HOLD.fastAfter ? HOLD.fastRate : HOLD.rate;
      this.next = Math.max(this.next + 1000 / rate, t - 1000 / rate);
    }
    this.raf = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    this.stop();
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }
}
