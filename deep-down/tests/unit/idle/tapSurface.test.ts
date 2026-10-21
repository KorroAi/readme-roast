// U-IN1 (SPEC §2.6, §13.1) on the first-person TapSurface (src/ui/hybrid/TapSurface.ts): raw points, no columns; the
// 8 counted hits per second across pointers; the hold stream 3/s → 5/s (Steady Hand) → 8/s in a Surge after 250 ms
// within 12 px; and Explore's gestures (W1-LEAD §3): a tap is a release < 300 ms and < 12 px, a drag (> 12 px) looks
// and is never a tap or a hold.
import { describe, expect, it } from 'vitest';
import { HOLD_DELAY_MS, HOLD_SLOP_PX, TAP_CAP_PER_S, TAP_MAX_MS, TapCap, TapSurface, holdRate, inRegion, type TouchEvent2 } from '../../../src/ui/hybrid/TapSurface';

type Handler = (e: unknown) => void;

/** A stand-in for the canvas: records listeners, dispatches pointer events. */
function fakeEl() {
  const handlers: Record<string, Handler[]> = {};
  const el = {
    addEventListener: (type: string, fn: Handler) => (handlers[type] ??= []).push(fn),
    removeEventListener: (type: string, fn: Handler) => {
      handlers[type] = (handlers[type] ?? []).filter((f) => f !== fn);
    },
    setPointerCapture: () => {},
  };
  const fire = (type: string, x: number, y: number, id = 1, timeStamp?: number) =>
    (handlers[type] ?? []).forEach((f) => f({ clientX: x, clientY: y, pointerId: id, pointerType: 'touch', button: 0, cancelable: true, preventDefault() {}, timeStamp }));
  return { el: el as unknown as HTMLElement, fire };
}

function rig() {
  let now = 1000;
  const { el, fire } = fakeEl();
  const ts = new TapSurface(el, { region: () => ({ top: 100, bottom: 700, left: 0, right: 390 }), now: () => now });
  const out: TouchEvent2[] = [];
  const drain = () => ts.drain((e) => out.push({ ...e }));
  return {
    ts,
    out,
    fire,
    drain,
    at: (t: number) => (now = t),
    get now() {
      return now;
    },
    /** Advance `ms` in 16 ms frames, updating at `rate` and draining. */
    frames(ms: number, rate = 3) {
      const end = now + ms;
      while (now < end) {
        now = Math.min(end, now + 16);
        ts.update(now, rate);
        drain();
      }
    },
  };
}

describe('U-IN1: the cap', () => {
  it('admits 8 counted hits in any 1 s window across every pointer', () => {
    const cap = new TapCap();
    let counted = 0;
    for (let t = 0; t < 1000; t += 20) if (cap.admit(t)) counted++;
    expect(counted).toBe(TAP_CAP_PER_S);
    // Over 10 s of 50 taps/s: 8 per second.
    const cap2 = new TapCap();
    let n = 0;
    for (let t = 0; t < 10_000; t += 20) if (cap2.admit(t)) n++;
    expect(n).toBeGreaterThanOrEqual(79);
    expect(n).toBeLessThanOrEqual(81);
  });
  it('the hold rate: 3/s, +1/3 per Steady Hand to 5/s, 8/s in a Surge', () => {
    expect(holdRate(0, false)).toBe(3);
    expect(holdRate(3, false)).toBe(4);
    expect(holdRate(6, false)).toBe(5);
    expect(holdRate(30, false)).toBe(5);
    expect(holdRate(0, true)).toBe(8);
  });
});

describe('U-IN1: presses, taps, holds, drags', () => {
  it('a press is queued at pointerdown, the same frame (L1); outside the region nothing', () => {
    const r = rig();
    r.fire('pointerdown', 200, 400);
    expect(r.ts.pending).toBe(1);
    r.drain();
    expect(r.out[0].kind).toBe('press');
    r.fire('pointerdown', 200, 40, 2);
    expect(r.ts.pending).toBe(0);
    expect(inRegion(200, 40, { top: 100, bottom: 700, left: 0, right: 390 })).toBe(false);
  });
  it('a quick release within 12 px is a tap; a slow one is not', () => {
    const r = rig();
    r.fire('pointerdown', 200, 400);
    r.frames(100);
    r.fire('pointermove', 205, 404);
    r.fire('pointerup', 205, 404);
    r.drain();
    expect(r.out.map((e) => e.kind)).toEqual(['press', 'up', 'tap']);
    expect(r.out[2].x).toBe(200);
    r.out.length = 0;
    r.fire('pointerdown', 200, 400, 3);
    r.at(r.now + TAP_MAX_MS + 10);
    r.fire('pointerup', 200, 400, 3);
    r.drain();
    expect(r.out.some((e) => e.kind === 'tap')).toBe(false);
  });
  it('the hold stream starts after 250 ms still and runs at the rate; its release (after 300 ms) is no tap', () => {
    const r = rig();
    r.fire('pointerdown', 200, 400);
    r.frames(HOLD_DELAY_MS - 20);
    expect(r.out.filter((e) => e.kind === 'hold').length).toBe(0);
    r.frames(2000 + 20, 3);
    const holds = r.out.filter((e) => e.kind === 'hold');
    expect(holds.length).toBeGreaterThanOrEqual(5);
    expect(holds.length).toBeLessThanOrEqual(7);
    r.fire('pointerup', 200, 400);
    r.drain();
    expect(r.out.some((e) => e.kind === 'tap')).toBe(false);
  });
  it('the hold rate follows Steady Hand and the Surge', () => {
    for (const [rate, lo, hi] of [[5, 9, 11], [8, 15, 17]] as const) {
      const r = rig();
      r.fire('pointerdown', 200, 400);
      r.frames(HOLD_DELAY_MS + 2000, rate);
      const n = r.out.filter((e) => e.kind === 'hold').length;
      expect(n).toBeGreaterThanOrEqual(lo);
      expect(n).toBeLessThanOrEqual(hi);
    }
  });
  it('a finger that travels > 12 px before 250 ms drags: drag steps, no hold, no tap', () => {
    const r = rig();
    r.fire('pointerdown', 200, 400);
    r.frames(30);
    r.fire('pointermove', 200 + HOLD_SLOP_PX + 1, 400);
    r.frames(16);
    r.fire('pointermove', 260, 380);
    r.frames(600);
    r.fire('pointerup', 270, 380);
    r.drain();
    const kinds = r.out.map((e) => e.kind);
    expect(kinds).not.toContain('hold');
    expect(kinds).not.toContain('tap');
    const drags = r.out.filter((e) => e.kind === 'drag');
    expect(drags.length).toBeGreaterThanOrEqual(2);
    const dx = drags.reduce((a, e) => a + e.dx, 0);
    const dy = drags.reduce((a, e) => a + e.dy, 0);
    // The travel after the slop crossing (213 → 270, 400 → 380).
    expect(dx).toBe(270 - 213);
    expect(dy).toBe(-20);
  });
  it('one hold stream for every held finger together (the most recent still one leads)', () => {
    const r = rig();
    r.fire('pointerdown', 100, 400, 1);
    r.fire('pointerdown', 300, 400, 2);
    r.frames(HOLD_DELAY_MS + 1000, 3);
    const holds = r.out.filter((e) => e.kind === 'hold');
    expect(holds.length).toBeLessThanOrEqual(4);
    expect(holds.every((e) => e.id === 2)).toBe(true);
  });
  it('a press delivered late by a long frame (its timestamp 900 ms old) waits the hold delay from its arrival: its release is a tap, no hold', () => {
    const r = rig();
    r.at(5000);
    // The finger went down at 4100 and up at 4160; the page sees the down at 5000 and the up one long frame later.
    r.fire('pointerdown', 200, 400, 1, 4100);
    r.ts.update(5000, 3);
    r.drain();
    r.at(5200);
    r.ts.update(5200, 3);
    r.drain();
    r.fire('pointerup', 200, 400, 1, 4160);
    r.drain();
    const kinds = r.out.map((e) => e.kind);
    expect(kinds).not.toContain('hold');
    expect(kinds).toEqual(['press', 'up', 'tap']);
    expect(r.out[2].heldMs).toBe(60);
  });
  it('long frames that deliver a moving finger one event per frame: a drag (by the finger\'s clock), never a hold', () => {
    const r = rig();
    r.at(16_000);
    r.fire('pointerdown', 260, 450, 1, 15_100);
    // Frames 800 ms apart; each brings one move 12 px further (the finger made them 30 ms apart).
    for (let i = 1; i <= 10; i++) {
      r.at(16_000 + i * 800);
      r.fire('pointermove', 260 - 12 * i, 450, 1, 15_100 + 30 * i);
      r.ts.update(r.now, 3);
      r.drain();
      r.at(r.now + 400);
      r.ts.update(r.now, 3);
      r.drain();
    }
    r.fire('pointerup', 140, 450, 1, 15_420);
    r.drain();
    const kinds = r.out.map((e) => e.kind);
    expect(kinds).not.toContain('hold');
    expect(kinds).not.toContain('tap');
    expect(r.out.filter((e) => e.kind === 'drag').reduce((a, e) => a + e.dx, 0)).toBeLessThan(-90);
  });
  it('the ring never allocates: 32 slots, the overflow counted', () => {
    const r = rig();
    for (let i = 0; i < 40; i++) r.ts.push('press', 10, 200, 9, i);
    expect(r.ts.pending).toBe(32);
    expect(r.ts.dropped).toBe(8);
  });
});
