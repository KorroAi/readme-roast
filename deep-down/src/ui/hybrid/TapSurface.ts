// The world's touch surface (SPEC §2.2, W1-LEAD §3): raw points, no columns, no swipes. Every pointer gives the game
// a stream of gesture events in one fixed ring (32 slots, no allocation per touch):
//   press  pointerdown, the same frame (Dig and the seal strike on it: L1);
//   tap    a quick release, < 300 ms down and < 12 px of travel (Explore and the camp act on it);
//   hold   the hold stream: a finger still for ≥ 250 ms within 12 px emits hits at the hold rate (one stream for all
//          fingers, on the most recent still one);
//   drag   a finger that travelled > 12 px: its travel since the last frame, coalesced to one event per finger per
//          frame (Explore's look); a drag never becomes a tap or a hold;
//   up     every release, with how long the finger was down (the relic ring's hold-and-release).
// The counted-hit cap (8 per second across every pointer, SPEC §2.6) is `TapCap`, applied by the game to strikes.

/** One queued gesture event, in CSS px from the top left of the viewport. `t` is performance.now() in ms. */
export interface TouchEvent2 {
  kind: 'press' | 'tap' | 'hold' | 'up' | 'drag' | 'key';
  x: number;
  y: number;
  /** The pointer id (keys use −1 − key index). */
  id: number;
  t: number;
  /** Where the finger went down. */
  downX: number;
  downY: number;
  /** 'up', 'tap': ms down. 'hold': ms since down. */
  heldMs: number;
  /** 'drag': travel since the last drag event (CSS px). */
  dx: number;
  dy: number;
}

/** The world region taps act in (between the HUD's top band and its cards). */
export interface TapRegion {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Counted hits per second across every pointer (SPEC §2.6, `upgrades.ts` TAP_CAP). */
export const TAP_CAP_PER_S = 8;
/** A finger held still this long (ms) starts the hold stream. */
export const HOLD_DELAY_MS = 250;
/** A hold (and a tap) stays one while the finger moves at most this far (CSS px). */
export const HOLD_SLOP_PX = 12;
/** A release within this long (ms) and the slop is a tap (Explore). */
export const TAP_MAX_MS = 300;
/** Simultaneous pointers tracked. */
export const MAX_POINTERS = 3;
/** The event ring. */
export const RING_SIZE = 32;

/** The hold stream's rate (hits per second): 3 base, +1/3 per Steady Hand level up to 5, 8 in a Surge (SPEC §2.6). */
export function holdRate(steadyLevel: number, surge: boolean): number {
  if (surge) return 8;
  return Math.min(5, 3 + Math.max(0, steadyLevel) / 3);
}

/** True when (x, y) is inside the world region. */
export function inRegion(x: number, y: number, r: TapRegion): boolean {
  return y >= r.top && y < r.bottom && x >= r.left && x < r.right;
}

/**
 * The global cap: at most `perSecond` counted hits in any 1 s window, across every pointer, holds included. A hit over
 * the cap shows (the tool, the crack) but deals no damage and moves no meter (SPEC §2.6).
 */
export class TapCap {
  private readonly times: Float64Array;
  private head = 0;
  private count = 0;

  constructor(readonly perSecond = TAP_CAP_PER_S) {
    this.times = new Float64Array(perSecond);
  }

  /** @param t ms. @returns true when this hit is counted. */
  admit(t: number): boolean {
    const n = this.perSecond;
    if (this.count < n) {
      this.times[(this.head + this.count) % n] = t;
      this.count++;
      return true;
    }
    if (t - this.times[this.head] < 1000) return false;
    this.times[this.head] = t;
    this.head = (this.head + 1) % n;
    return true;
  }

  /** Counted hits in the last second before `t`. */
  recent(t: number): number {
    let k = 0;
    for (let i = 0; i < this.count; i++) if (t - this.times[(this.head + i) % this.perSecond] < 1000) k++;
    return k;
  }

  reset(): void {
    this.head = 0;
    this.count = 0;
  }
}

interface PointerTrack {
  id: number;
  downX: number;
  downY: number;
  x: number;
  y: number;
  downT: number;
  /** When the page received the pointerdown (ms): a down delivered late (a long frame) still waits the hold delay from
   *  here, so its release, queued behind that frame, can arrive before any hold is streamed. */
  recvT: number;
  /** When the page received this finger's latest event (ms). */
  lastRecvT: number;
  /** Travelled past the slop: a drag from then on, never a tap or a hold. */
  moved: boolean;
  /** Where the last drag event was measured from. */
  dragX: number;
  dragY: number;
  /** The order it went down (the most recent still finger leads the hold stream). */
  seq: number;
  /** A frame has seen this finger held past the delay (the stream starts on the next one). */
  armed: boolean;
  /** The hold stream ran on this finger (its release is no tap). */
  held: boolean;
}

export interface TapSurfaceOptions {
  /** The world region now. */
  region: () => TapRegion;
  /** performance.now() (injectable for tests). */
  now?: () => number;
}

export class TapSurface {
  private readonly ring: TouchEvent2[] = [];
  private head = 0;
  private size = 0;
  private readonly pointers: PointerTrack[] = [];
  private seq = 0;
  private nextHold = Number.NaN;
  /** The last frame intervals (ms): moves arrive one per frame, so a finger is "still" only after more than the longest. */
  private readonly gaps = new Float64Array(8).fill(16);
  private gapAt = 0;
  private lastUpdate = Number.NaN;
  private readonly now: () => number;
  private readonly disposers: Array<() => void> = [];
  enabled = true;
  /** Events dropped because the ring was full (never expected). */
  dropped = 0;
  /** The last pointerdown time (ms). */
  lastDownAt = -Infinity;
  /** The last release time of a world pointer (ms): the Pulse's deliberate gesture [W2]. */
  lastUpAt = -Infinity;
  /** Whether holds stream at all (off while a sheet or a ceremony owns the screen). */
  holdsEnabled = true;

  constructor(private readonly el: HTMLElement, private readonly opts: TapSurfaceOptions) {
    for (let i = 0; i < RING_SIZE; i++) this.ring.push({ kind: 'press', x: 0, y: 0, id: 0, t: 0, downX: 0, downY: 0, heldMs: 0, dx: 0, dy: 0 });
    this.now = opts.now ?? (() => performance.now());
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, o);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, o));
    };
    on('pointerdown', (e) => this.onDown(e), { passive: false });
    on('pointermove', (e) => this.onMove(e), { passive: true });
    on('pointerup', (e) => this.onUp(e, false), { passive: true });
    on('pointercancel', (e) => this.onUp(e, true), { passive: true });
    on('lostpointercapture', (e) => this.onUp(e, true), { passive: true });
    on('contextmenu', (e) => e.preventDefault());
  }

  /** Push an event (keys, tests). @returns false when the ring is full. */
  push(kind: TouchEvent2['kind'], x: number, y: number, id: number, t: number, extra?: Partial<Pick<TouchEvent2, 'downX' | 'downY' | 'heldMs' | 'dx' | 'dy'>>): boolean {
    if (this.size >= RING_SIZE) {
      this.dropped++;
      return false;
    }
    const s = this.ring[(this.head + this.size) % RING_SIZE];
    s.kind = kind;
    s.x = x;
    s.y = y;
    s.id = id;
    s.t = t;
    s.downX = extra?.downX ?? x;
    s.downY = extra?.downY ?? y;
    s.heldMs = extra?.heldMs ?? 0;
    s.dx = extra?.dx ?? 0;
    s.dy = extra?.dy ?? 0;
    this.size++;
    return true;
  }

  /** Visit every queued event in order and empty the ring. The object is reused: copy what you keep. */
  drain(fn: (e: TouchEvent2) => void): number {
    const n = this.size;
    for (let i = 0; i < n; i++) fn(this.ring[(this.head + i) % RING_SIZE]);
    this.head = (this.head + n) % RING_SIZE;
    this.size = 0;
    return n;
  }

  get pending(): number {
    return this.size;
  }

  get fingers(): number {
    return this.pointers.length;
  }

  /** The hold stream runs. */
  get holding(): boolean {
    return !Number.isNaN(this.nextHold);
  }

  /** A finger is dragging (Explore's look). */
  get dragging(): boolean {
    for (const p of this.pointers) if (p.moved) return true;
    return false;
  }

  /**
   * Once a frame, before draining: emit the coalesced drag steps and the hold stream at `rate` hits per second.
   */
  update(now: number, rate: number): void {
    if (!Number.isNaN(this.lastUpdate)) {
      this.gaps[this.gapAt] = Math.min(3000, Math.max(1, now - this.lastUpdate));
      this.gapAt = (this.gapAt + 1) % this.gaps.length;
    }
    this.lastUpdate = now;
    // Still = no news from the finger for the hold delay and for two of the longest recent frames (long frames deliver a
    // moving finger's events one per frame: between two of them it only looks still). On a phone: 250 ms.
    let gap = 0;
    for (const g of this.gaps) gap = Math.max(gap, g);
    const quiet = Math.max(HOLD_DELAY_MS, gap * 2);
    for (const p of this.pointers) {
      if (!p.moved) continue;
      const dx = p.x - p.dragX;
      const dy = p.y - p.dragY;
      if (dx === 0 && dy === 0) continue;
      p.dragX = p.x;
      p.dragY = p.y;
      this.push('drag', p.x, p.y, p.id, now, { downX: p.downX, downY: p.downY, heldMs: now - p.downT, dx, dy });
    }
    let lead: PointerTrack | null = null;
    if (this.holdsEnabled) {
      for (const p of this.pointers) {
        if (p.moved || now - p.downT < HOLD_DELAY_MS || now - p.recvT < HOLD_DELAY_MS || now - p.lastRecvT < quiet) continue;
        if (!lead || p.seq > lead.seq) lead = p;
      }
    }
    if (!lead) {
      this.nextHold = Number.NaN;
      return;
    }
    if (!lead.armed) {
      lead.armed = true;
      return;
    }
    lead.held = true;
    const interval = 1000 / Math.max(0.5, rate);
    if (Number.isNaN(this.nextHold)) this.nextHold = lead.downT + HOLD_DELAY_MS;
    for (let k = 0; k < 2 && now >= this.nextHold; k++) {
      this.push('hold', lead.x, lead.y, lead.id, this.nextHold, { downX: lead.downX, downY: lead.downY, heldMs: this.nextHold - lead.downT });
      this.nextHold += interval;
    }
    if (now > this.nextHold) this.nextHold = now + interval * 0.5;
  }

  /** Forget fingers and the stream (a mode change, a sheet that takes the touch). */
  reset(): void {
    this.pointers.length = 0;
    this.nextHold = Number.NaN;
    this.size = 0;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
  }

  private onDown(e: PointerEvent): void {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = this.opts.region();
    if (!inRegion(e.clientX, e.clientY, r)) return;
    if (e.cancelable) e.preventDefault();
    if (this.pointers.length >= MAX_POINTERS) return;
    const t = this.stamp(e);
    this.lastDownAt = t;
    this.pointers.push({ id: e.pointerId, downX: e.clientX, downY: e.clientY, x: e.clientX, y: e.clientY, downT: t, recvT: this.now(), lastRecvT: this.now(), moved: false, dragX: e.clientX, dragY: e.clientY, seq: ++this.seq, armed: false, held: false });
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is a convenience.
    }
    this.push('press', e.clientX, e.clientY, e.pointerId, t);
  }

  private onMove(e: PointerEvent): void {
    const p = this.find(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    p.lastRecvT = this.now();
    // A drag is a finger that left the slop before the hold delay, by the finger's own clock (a long frame may have
    // started the hold stream already: the drag wins and the stream stops).
    if (!p.moved && Math.hypot(p.x - p.downX, p.y - p.downY) > HOLD_SLOP_PX && (!p.held || this.stamp(e) - p.downT < HOLD_DELAY_MS)) {
      p.moved = true;
      p.held = false;
      this.nextHold = Number.NaN;
      // The look starts from where the finger crossed the slop: a tap's tremor never turns the view.
      p.dragX = p.x;
      p.dragY = p.y;
    }
  }

  private onUp(e: PointerEvent, cancelled: boolean): void {
    const i = this.pointers.findIndex((p) => p.id === e.pointerId);
    if (i < 0) return;
    const p = this.pointers[i];
    this.pointers.splice(i, 1);
    if (!cancelled && Number.isFinite(e.clientX)) {
      p.x = e.clientX;
      p.y = e.clientY;
      if (!p.moved && !p.held && Math.hypot(p.x - p.downX, p.y - p.downY) > HOLD_SLOP_PX) {
        p.moved = true;
        p.dragX = p.x;
        p.dragY = p.y;
      }
    }
    const t = this.stamp(e);
    const held = t - p.downT;
    // The last drag step (travel since the last frame) is not lost.
    if (p.moved && (p.x !== p.dragX || p.y !== p.dragY)) this.push('drag', p.x, p.y, p.id, t, { downX: p.downX, downY: p.downY, heldMs: held, dx: p.x - p.dragX, dy: p.y - p.dragY });
    this.push('up', p.x, p.y, p.id, t, { downX: p.downX, downY: p.downY, heldMs: held });
    // A tap is decided by the finger's own times (event timestamps): a release within 300 ms is a tap even when a long
    // frame let the hold stream start first (holds and taps overlap by design between 250 and 300 ms, W1-LEAD §3).
    if (!cancelled && !p.moved && held < TAP_MAX_MS) this.push('tap', p.downX, p.downY, p.id, t, { downX: p.downX, downY: p.downY, heldMs: held });
    this.lastUpAt = t;
    if (this.pointers.length === 0) this.nextHold = Number.NaN;
  }

  /**
   * When the input happened (ms, performance.now()'s clock): the event's own timestamp when it is sane, so a finger's
   * down-to-up time is measured at the screen even when a long frame delayed the handlers (a tap stays a tap).
   */
  private stamp(e: Event): number {
    const now = this.now();
    const ts = (e as { timeStamp?: number }).timeStamp;
    // Sane: on performance.now()'s clock and not from the future; a busy page (SwiftShader) delivers input seconds late.
    return typeof ts === 'number' && ts > 0 && ts <= now + 1 && now - ts < 30_000 ? ts : now;
  }

  private find(id: number): PointerTrack | undefined {
    for (const p of this.pointers) if (p.id === id) return p;
    return undefined;
  }
}
