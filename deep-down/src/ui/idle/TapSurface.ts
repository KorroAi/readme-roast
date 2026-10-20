// The input contract of SPEC §3.1 (with the critic panel's changes): pointerdown on the world fires a
// tap the same frame; a still finger auto-taps its column as ONE global hold stream; a held finger that
// crosses into another column hits it at once; every counted hit, from any pointer, shares one cap of
// 8 per second. Pure parts (column mapping, the target rule, the cap) are exported for unit tests.

/** How a hit was made. Holds give half combo and half Surge meter in the model (CRITIQUE MUST 1). */
export type TapKind = 'tap' | 'hold' | 'swipe' | 'key';

/** One queued input, in CSS px from the top left of the viewport. `t` is performance.now() in ms. */
export interface TapInput {
  x: number;
  y: number;
  /** The pointer id (keys use −1 − column). */
  id: number;
  t: number;
  kind: TapKind;
}

/** The world region taps dig in: from the goal bar's bottom + 4 px to the skill row's top (SPEC §3.1). */
export interface TapRegion {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The 7 column strips at the floor row: the projected shaft walls (DescentScene.columns()). */
export interface ColumnStrips {
  /** Screen x of the shaft's left wall at the floor row (CSS px). */
  left: number;
  /** Screen x of the shaft's right wall at the floor row (CSS px). */
  right: number;
  /** Screen y of the floor's front edge (CSS px). */
  floorY: number;
}

export const SHAFT_COLUMNS = 7;
/** Counted hits per second across every pointer (CRITIQUE MUST 1; SPEC §3.1 said 15). */
export const TAP_CAP_PER_S = 8;
/** A finger held still this long (ms) starts the hold stream. */
export const HOLD_DELAY_MS = 250;
/** A hold stays a hold while the finger moves at most this far (CSS px) before the delay. */
export const HOLD_SLOP_PX = 12;
/** Swipe hysteresis: the finger must be this far (in columns) past the strip edge to switch. */
export const SWIPE_HYSTERESIS = 0.6;
/** Simultaneous pointers that tap. */
export const MAX_POINTERS = 3;
/** The tap ring (SPEC §3.1: 0 allocations per tap). */
export const RING_SIZE = 32;

/**
 * The hold stream's rate (hits per second): 3 base, +1/3 per Steady Hand level up to 5, 8 in a
 * Surge (CRITIQUE MUST 1). One stream however many fingers are held.
 */
export function holdRate(steadyLevel: number, surge: boolean): number {
  if (surge) return 8;
  return Math.min(5, 3 + Math.max(0, steadyLevel) / 3);
}

/**
 * Column under screen x (vertical position ignored): 7 equal strips between the shaft walls; left
 * of the shaft maps to column 0, right of it to column 6 (F3).
 */
export function columnAt(x: number, s: Pick<ColumnStrips, 'left' | 'right'>): number {
  const w = (s.right - s.left) / SHAFT_COLUMNS;
  if (!(w > 0)) return 3;
  const c = Math.floor((x - s.left) / w);
  return c < 0 ? 0 : c >= SHAFT_COLUMNS ? SHAFT_COLUMNS - 1 : c;
}

/**
 * The column a held finger is on, with hysteresis: it leaves column `current` only once it is
 * `SWIPE_HYSTERESIS` of a column width past that strip's edge.
 */
export function swipeColumn(x: number, current: number, s: Pick<ColumnStrips, 'left' | 'right'>): number {
  const w = (s.right - s.left) / SHAFT_COLUMNS;
  if (!(w > 0)) return current;
  const lo = s.left + current * w;
  const hi = lo + w;
  const pad = SWIPE_HYSTERESIS * w;
  if ((x < lo - pad && current > 0) || (x > hi + pad && current < SHAFT_COLUMNS - 1)) return columnAt(x, s);
  return current;
}

/**
 * The target rule (SPEC §3.1): the tapped column if its topmost solid cell is at most `maxBelow`
 * rows below the floor row; otherwise the nearest column (by distance, the left one first on a tie)
 * whose top cell is. `depthBelow[c]` is how many rows below the floor row column c's topmost solid
 * cell is (0 = the floor row itself; Infinity or a negative value when the column has none in reach).
 * @returns the column to hit, or −1 when no column qualifies (the tap still flashes the floor).
 */
export function targetColumn(col: number, depthBelow: ArrayLike<number>, maxBelow = 2): number {
  const ok = (c: number) => {
    const d = depthBelow[c];
    return d >= 0 && d <= maxBelow;
  };
  if (ok(col)) return col;
  for (let k = 1; k < SHAFT_COLUMNS; k++) {
    const l = col - k;
    const r = col + k;
    if (l >= 0 && ok(l)) return l;
    if (r < SHAFT_COLUMNS && ok(r)) return r;
  }
  return -1;
}

/** True when (x, y) is inside the world region (taps dig there; outside, HUD plates own the touch). */
export function inRegion(x: number, y: number, r: TapRegion): boolean {
  return y >= r.top && y < r.bottom && x >= r.left && x < r.right;
}

/**
 * The reach band for entities (CRITIQUE MUST 8): 4 m above to 4 m below the floor. `pxPerM` is the
 * camera's CSS px per metre at the cut plane (44).
 */
export function inReach(y: number, floorY: number, pxPerM = 44): boolean {
  return y >= floorY - 4 * pxPerM && y <= floorY + 4 * pxPerM;
}

/**
 * The global cap: at most `perSecond` counted hits in any 1 s window, across every pointer, holds
 * and swipes included. A hit over the cap is not counted: it shows (a flash on its cell) but deals no
 * damage and moves no meter (the anti-autoclicker and FX budget, SPEC §3.1 and CRITIQUE MUST 1).
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
    // The oldest of the last n counted hits must be at least 1 s old.
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
  /** Column the finger is on (−1 before strips exist). */
  col: number;
  /** Moved more than the slop before the hold delay: it can swipe, never hold. */
  moved: boolean;
  /** The order it went down (the most recent still finger leads the hold stream). */
  seq: number;
  /**
   * A frame has already seen this finger held past the delay. The stream starts on the next one: a quick tap whose
   * pointerup was queued behind one long frame (a GC pause, a slow device) is never read as a hold.
   */
  armed: boolean;
}

export interface TapSurfaceOptions {
  /** The world region now (recomputed by the HUD on layout). */
  region: () => TapRegion;
  /** The column strips now (null before the scene has a camera). */
  strips: () => ColumnStrips | null;
  /** performance.now() (injectable for tests). */
  now?: () => number;
}

/**
 * The world's touch surface. `pointerdown` pushes a tap into a fixed ring of 32 (no allocation);
 * `IdleGame.frame` drains it first, before the simulation, and calls `update(now, rate)` to emit the
 * hold stream and swipe crossings into the same ring. `pointerup` and `click` are never used.
 */
export class TapSurface {
  private readonly ring: TapInput[] = [];
  private head = 0;
  private size = 0;
  private readonly pointers: PointerTrack[] = [];
  private seq = 0;
  /** Next hold-stream hit time (ms), NaN while no finger holds. */
  private nextHold = Number.NaN;
  private readonly now: () => number;
  private readonly disposers: Array<() => void> = [];
  enabled = true;
  /** Taps dropped because the ring was full (never expected: ≤ 32 per frame). */
  dropped = 0;
  /** The last pointerdown time (ms), for the idle frame cap and lastTapFrames. */
  lastDownAt = -Infinity;

  constructor(private readonly el: HTMLElement, private readonly opts: TapSurfaceOptions) {
    for (let i = 0; i < RING_SIZE; i++) this.ring.push({ x: 0, y: 0, id: 0, t: 0, kind: 'tap' });
    this.now = opts.now ?? (() => performance.now());
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, o?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, o);
      this.disposers.push(() => el.removeEventListener(type, fn as EventListener, o));
    };
    on('pointerdown', (e) => this.onDown(e), { passive: false });
    on('pointermove', (e) => this.onMove(e), { passive: true });
    on('pointerup', (e) => this.onUp(e), { passive: true });
    on('pointercancel', (e) => this.onUp(e), { passive: true });
    on('lostpointercapture', (e) => this.onUp(e), { passive: true });
    on('contextmenu', (e) => e.preventDefault());
  }

  /** Push an input (keys, tests). @returns false when the ring is full. */
  push(x: number, y: number, id: number, t: number, kind: TapKind): boolean {
    if (this.size >= RING_SIZE) {
      this.dropped++;
      return false;
    }
    const slot = this.ring[(this.head + this.size) % RING_SIZE];
    slot.x = x;
    slot.y = y;
    slot.id = id;
    slot.t = t;
    slot.kind = kind;
    this.size++;
    return true;
  }

  /** Visit every queued input in order and empty the ring. The object is reused: copy what you keep. */
  drain(fn: (tap: TapInput) => void): number {
    const n = this.size;
    for (let i = 0; i < n; i++) fn(this.ring[(this.head + i) % RING_SIZE]);
    this.head = (this.head + n) % RING_SIZE;
    this.size = 0;
    return n;
  }

  /** Queued inputs not drained yet. */
  get pending(): number {
    return this.size;
  }

  /** Fingers down now. */
  get fingers(): number {
    return this.pointers.length;
  }

  /** A finger is holding (the hold stream runs). */
  get holding(): boolean {
    return !Number.isNaN(this.nextHold);
  }

  /**
   * Emit the hold stream and swipe crossings for this frame into the ring. `rate` is hits per second
   * (`holdRate()`); one stream for every held finger together, on the most recent still finger's column.
   */
  update(now: number, rate: number): void {
    const strips = this.opts.strips();
    let lead: PointerTrack | null = null;
    for (const p of this.pointers) {
      if (p.moved || now - p.downT < HOLD_DELAY_MS) continue;
      if (!lead || p.seq > lead.seq) lead = p;
    }
    if (!lead || !strips) {
      this.nextHold = Number.NaN;
      return;
    }
    if (!lead.armed) {
      lead.armed = true;
      return;
    }
    const interval = 1000 / Math.max(0.5, rate);
    if (Number.isNaN(this.nextHold)) this.nextHold = lead.downT + HOLD_DELAY_MS;
    // At most 2 stream hits a frame (a long frame never floods the ring).
    for (let k = 0; k < 2 && now >= this.nextHold; k++) {
      this.push(lead.x, lead.y, lead.id, this.nextHold, 'hold');
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
    // No scroll, no zoom, no long-press menu: the world owns this finger.
    if (e.cancelable) e.preventDefault();
    if (this.pointers.length >= MAX_POINTERS) return;
    const t = this.now();
    this.lastDownAt = t;
    const strips = this.opts.strips();
    this.pointers.push({
      id: e.pointerId,
      downX: e.clientX,
      downY: e.clientY,
      x: e.clientX,
      y: e.clientY,
      downT: t,
      col: strips ? columnAt(e.clientX, strips) : -1,
      moved: false,
      seq: ++this.seq,
      armed: false,
    });
    try {
      this.el.setPointerCapture?.(e.pointerId);
    } catch {
      // Capture is a convenience (moves outside the element still track).
    }
    this.push(e.clientX, e.clientY, e.pointerId, t, 'tap');
  }

  private onMove(e: PointerEvent): void {
    const p = this.find(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    const t = this.now();
    if (!p.moved && t - p.downT < HOLD_DELAY_MS && Math.hypot(p.x - p.downX, p.y - p.downY) > HOLD_SLOP_PX) p.moved = true;
    const strips = this.opts.strips();
    if (!strips) return;
    if (p.col < 0) p.col = columnAt(p.x, strips);
    const next = swipeColumn(p.x, p.col, strips);
    if (next !== p.col) {
      p.col = next;
      p.moved = true;
      // The swipe hits the new column at once (its x at the strip centre, so the column is exact).
      const w = (strips.right - strips.left) / SHAFT_COLUMNS;
      this.push(strips.left + (next + 0.5) * w, p.y, p.id, t, 'swipe');
    }
  }

  private onUp(e: PointerEvent): void {
    const i = this.pointers.findIndex((p) => p.id === e.pointerId);
    if (i >= 0) this.pointers.splice(i, 1);
    if (this.pointers.length === 0) this.nextHold = Number.NaN;
  }

  private find(id: number): PointerTrack | undefined {
    for (const p of this.pointers) if (p.id === id) return p;
    return undefined;
  }
}
