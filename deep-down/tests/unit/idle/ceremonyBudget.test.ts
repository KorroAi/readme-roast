// The ceremony director under the ladder's rules (SPEC §10.2, MX-26): never two T4/T5 at once; the others queue for at
// most 6 s and then play in their T3 form (or drop); T3 rate-limited; toasts wait while a T4/T5 runs and play 700 ms
// apart; a tap skips the running T4/T5 from 400 ms (and is never swallowed: the director only reports it).
import { describe, expect, it } from 'vitest';
import { JuiceBudget } from '../../../src/game/fx/juiceBudget';
import { Timeline } from '../../../src/game/fx/Timeline';
import { CeremonyDirector, QUEUE_MAX_MS, T3_WAIT_MS, TOAST_GAP_MS } from '../../../src/game/fx/ceremonies/CeremonyDirector';
import type { Ceremony, CeremonyId, CeremonyTier } from '../../../src/game/fx/ceremonies/Ceremony';

class Fake implements Ceremony {
  readonly timeline: Timeline;
  readonly digFrom = 0;
  ended = 0;
  begun = -1;
  constructor(readonly id: CeremonyId, readonly tier: CeremonyTier, len: number, readonly toast = false, private readonly t3: Ceremony | null = null) {
    this.timeline = new Timeline([], len);
  }
  begin(now: number): void {
    this.begun = now;
    this.timeline.start(now);
  }
  frame(now: number): void {
    this.timeline.update(now);
  }
  end(): void {
    this.ended++;
  }
  demote(): Ceremony | null {
    return this.t3;
  }
}

/** Run the director over [t0, t1] at 60 Hz, checking the invariant every frame. */
function run(d: CeremonyDirector, t0: number, t1: number, every?: (t: number) => void): void {
  for (let t = t0; t <= t1; t += 1000 / 60) {
    d.frame(t, 1 / 60);
    every?.(t);
  }
}

describe('CeremonyDirector', () => {
  it('never runs two T4/T5 at once; the second waits and starts when the first ends', () => {
    const b = new JuiceBudget();
    const d = new CeremonyDirector(b);
    const a = new Fake('pickTier', 4, 1600);
    const r = new Fake('biomeReveal', 5, 3600);
    d.play(a, 0);
    d.play(r, 100);
    expect(d.current).toBe('pickTier');
    expect(d.waiting).toBe(1);
    expect(b.exclusive(50)).toBe(true);
    let maxMain = 0;
    run(d, 0, 6000, () => {
      const live = d.live().filter((x) => x.tier >= 4).length;
      maxMain = Math.max(maxMain, live);
    });
    expect(maxMain).toBe(1);
    expect(a.ended).toBe(1);
    expect(r.begun).toBeGreaterThanOrEqual(1600);
    expect(r.ended).toBe(1);
  });

  it('a T4/T5 queued for more than 6 s plays in its T3 form (or drops)', () => {
    const d = new CeremonyDirector(new JuiceBudget());
    const long = new Fake('rekindle', 5, 20_000);
    const chip = new Fake('chartedGate', 3, 1200);
    const queued = new Fake('biomeReveal', 5, 3600, false, chip);
    const dropped = new Fake('pickTier', 4, 1600);
    d.play(long, 0);
    d.play(queued, 0);
    d.play(dropped, 0);
    run(d, 0, QUEUE_MAX_MS + 200);
    expect(queued.begun).toBe(-1);
    expect(chip.begun).toBeGreaterThan(QUEUE_MAX_MS);
    expect(d.dropped).toBe(1);
    expect(d.log.some((e) => e.id === 'chartedGate' && e.demoted)).toBe(true);
    expect(d.current).toBe('rekindle');
  });

  it('toasts wait while a T4/T5 runs and play one at a time, 700 ms apart', () => {
    const d = new CeremonyDirector(new JuiceBudget());
    const big = new Fake('sealBreak', 4, 1100);
    const t1 = new Fake('feat', 3, 3000, true);
    const t2 = new Fake('feat', 3, 3000, true);
    d.play(big, 0);
    d.play(t1, 10);
    d.play(t2, 20);
    expect(d.toastsHeld).toBe(true);
    run(d, 0, 1000);
    expect(t1.begun).toBe(-1);
    run(d, 1000, 9000);
    expect(t1.begun).toBeGreaterThanOrEqual(1100);
    expect(t2.begun - (t1.begun + 3000)).toBeGreaterThanOrEqual(TOAST_GAP_MS - 17);
    // Never a toast during the T4.
    expect(t1.begun).toBeGreaterThanOrEqual(big.begun + 1100);
  });

  it('T3 ceremonies are limited to one per 1.5 s: the excess waits its turn (a rank-up is never lost), then drops', () => {
    const d = new CeremonyDirector(new JuiceBudget());
    const s1 = new Fake('star', 3, 1000);
    const s2 = new Fake('star', 3, 1000);
    expect(d.play(s1, 0)).toBe(true);
    expect(d.play(s2, 400)).toBe(false);
    expect(s2.begun).toBe(-1);
    run(d, 400, 1600);
    expect(s2.begun).toBeGreaterThanOrEqual(1500);
    const r = new Fake('rankUp', 3, 1400);
    expect(d.play(r, 1700)).toBe(false);
    run(d, 1700, 3200);
    expect(r.begun).toBeGreaterThanOrEqual(3000);
    // Five at once: one plays, the next ones every 1.5 s while they are fresh (≤ T3_WAIT_MS); the rest drop.
    const many = [0, 1, 2, 3, 4].map(() => new Fake('chartedGate', 3, 800));
    for (const c of many) d.play(c, 5000);
    run(d, 5000, 12_000);
    const began = many.filter((c) => c.begun >= 0).map((c) => c.begun);
    for (let i = 1; i < began.length; i++) expect(began[i] - began[i - 1]).toBeGreaterThanOrEqual(1500 - 17);
    expect(began.length).toBeGreaterThanOrEqual(Math.floor(T3_WAIT_MS / 1500));
    expect(began.length).toBeLessThanOrEqual(1 + Math.floor(T3_WAIT_MS / 1500));
    expect(began.length).toBeLessThan(many.length);
    expect(d.dropped).toBe(many.length - began.length);
  });

  it('a tap skips the running T4/T5 only from 400 ms', () => {
    const d = new CeremonyDirector(new JuiceBudget());
    const c = new Fake('pickTier', 4, 1600);
    d.play(c, 0);
    run(d, 0, 300);
    expect(d.pointerDown(300)).toBe(false);
    expect(d.pointerDown(420)).toBe(true);
    run(d, 420, 2000);
    expect(c.ended).toBe(1);
    expect(d.exclusive).toBe(false);
  });

  it('flush ends everything in its end state, once', () => {
    const b = new JuiceBudget();
    const d = new CeremonyDirector(b);
    const a = new Fake('pickTier', 4, 1600);
    const q = new Fake('biomeReveal', 5, 3600);
    const s = new Fake('star', 3, 1000);
    d.play(a, 0);
    d.play(q, 0);
    d.play(s, 0);
    d.flush(100);
    expect([a.ended, q.ended, s.ended]).toEqual([1, 1, 1]);
    expect(d.exclusive).toBe(false);
    expect(b.exclusive(100)).toBe(false);
  });
});
