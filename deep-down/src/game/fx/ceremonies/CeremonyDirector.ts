// Runs ceremonies under the response ladder's rules (SPEC §10.2, MX-26):
// - one T4 or T5 at a time; the others queue for at most 6 s, then play in their T3 form (or are dropped: the model
//   already credited their rewards);
// - T3 ceremonies are rate-limited to 1 per 1.5 s (the JuiceBudget's admitT3; the excess merges into the last one);
// - toast-like ceremonies (the Feat toast) wait while a T4/T5 runs and play 700 ms apart;
// - a tap never waits: `pointerDown` skips the running T4/T5 from its 400 ms mark and the tap still digs.
// Pure apart from the ceremonies' own callbacks: tests/unit/idle/ceremonyBudget.test.ts drives it with fakes.

import type { JuiceBudget } from '../juiceBudget';
import type { Ceremony, CeremonyId } from './Ceremony';

/** How long a T4/T5 may wait in the queue before it plays in its T3 form (ms). */
export const QUEUE_MAX_MS = 6000;
/** Gap between two toasts (ms). */
export const TOAST_GAP_MS = 700;
/** A T3 held by the rate limit waits at most this long (ms). */
export const T3_WAIT_MS = 4500;

interface Queued {
  c: Ceremony;
  at: number;
}

export class CeremonyDirector {
  /** The running T4/T5 (null when none). */
  private main: Ceremony | null = null;
  /** T3 ceremonies running alongside (★, rank-up, the gate flash…). */
  private readonly side: Ceremony[] = [];
  private readonly queue: Queued[] = [];
  private readonly toasts: Ceremony[] = [];
  private lastToastEnd = -Infinity;
  private toastNow: Ceremony | null = null;
  /** Every ceremony started, in order (the debug surface and the tests). */
  readonly log: Array<{ id: CeremonyId; tier: number; t: number; demoted: boolean }> = [];
  /** Ceremonies dropped (queued too long with no T3 form). */
  dropped = 0;
  /** The ceremony started last (the capture hook holds it). */
  latest: Ceremony | null = null;

  constructor(private readonly budget: Pick<JuiceBudget, 'beginExclusive' | 'endExclusive' | 'admitT3' | 't3Free'>) {}

  /** A T4 or T5 runs now. */
  get exclusive(): boolean {
    return this.main !== null;
  }

  /** The running T4/T5's id ('' none). */
  get current(): CeremonyId | '' {
    return this.main?.id ?? '';
  }

  /** The running T4/T5 (the capture hook seeks its timeline). */
  get running(): Ceremony | null {
    return this.main;
  }

  /** T4/T5 ceremonies waiting (the "stack" icon). */
  get waiting(): number {
    return this.queue.length;
  }

  /** Toasts are held right now (a T4/T5 runs). */
  get toastsHeld(): boolean {
    return this.main !== null;
  }

  /**
   * Ask for a ceremony now. T4/T5: plays at once, or queues behind the running one. T3: plays alongside unless the
   * T3 rate limit merges it (@returns false then). Toasts: queued, one at a time, never during a T4/T5.
   */
  play(c: Ceremony, now: number): boolean {
    if (c.toast) {
      this.toasts.push(c);
      this.pumpToasts(now);
      return true;
    }
    if (c.tier >= 4) {
      if (this.main) {
        this.queue.push({ c, at: now });
        return true;
      }
      this.startMain(c, now, false);
      return true;
    }
    if (this.budget.admitT3(now) > 0) {
      // The T3 rate limit (1 per 1.5 s): it waits its turn (a rank-up is never lost), up to T3_WAIT_MS.
      this.t3q.push({ c, at: now });
      this.latest = c;
      return false;
    }
    this.startSide(c, now);
    return true;
  }

  private startSide(c: Ceremony, now: number): void {
    this.side.push(c);
    c.begin(now);
    this.latest = c;
    this.log.push({ id: c.id, tier: c.tier, t: now, demoted: false });
  }

  /** T3s held by the rate limit, oldest first. */
  private readonly t3q: Array<{ c: Ceremony; at: number }> = [];

  private startMain(c: Ceremony, now: number, demoted: boolean): void {
    this.main = c;
    this.budget.beginExclusive(c.timeline.length, now);
    c.begin(now);
    this.latest = c;
    this.log.push({ id: c.id, tier: c.tier, t: now, demoted });
  }

  /** Something else holds the toast slot (a first-time card on screen: one plate at a time under the goal bar). */
  toastBlock: (() => boolean) | null = null;

  /** A toast is on screen now. */
  get toastShowing(): boolean {
    return this.toastNow !== null;
  }

  private pumpToasts(now: number): void {
    if (this.toastNow || this.main || !this.toasts.length || now - this.lastToastEnd < TOAST_GAP_MS) return;
    if (this.toastBlock?.()) return;
    const c = this.toasts.shift()!;
    this.toastNow = c;
    c.begin(now);
    this.latest = c;
    this.log.push({ id: c.id, tier: c.tier, t: now, demoted: false });
  }

  /** Toasts waiting (the Feat toasts collapse past 3: the caller merges them). */
  get toastQueue(): readonly Ceremony[] {
    return this.toasts;
  }

  /** Drop waiting toasts (they were merged into one "+N Feats" by the caller). */
  clearToasts(keep: number): Ceremony[] {
    return this.toasts.splice(keep);
  }

  /** Per frame (`now` ms, `dt` s). */
  frame(now: number, dt: number): void {
    if (this.main) {
      this.main.frame(now, dt);
      if (this.main.timeline.done) {
        const c = this.main;
        this.main = null;
        c.end(now);
        this.budget.endExclusive(now);
      }
    }
    // Queued T4/T5 that waited too long play in their T3 form; the next one starts when the stage is free.
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (now - q.at > QUEUE_MAX_MS) {
        this.queue.splice(i, 1);
        const t3 = q.c.demote?.() ?? null;
        if (t3) {
          this.side.push(t3);
          t3.begin(now);
          this.log.push({ id: t3.id, tier: t3.tier, t: now, demoted: true });
        } else this.dropped++;
      }
    }
    if (!this.main && this.queue.length) {
      const q = this.queue.shift()!;
      this.startMain(q.c, now, false);
    }
    // A held T3 plays when the rate limit frees its slot; one that waited past T3_WAIT_MS is dropped (counted).
    while (this.t3q.length && now - this.t3q[0].at > T3_WAIT_MS) {
      this.t3q.shift();
      this.dropped++;
    }
    if (this.t3q.length && this.budget.t3Free(now)) {
      const q = this.t3q.shift()!;
      this.budget.admitT3(now);
      this.startSide(q.c, now);
    }
    for (let i = this.side.length - 1; i >= 0; i--) {
      const c = this.side[i];
      c.frame(now, dt);
      if (c.timeline.done) {
        this.side.splice(i, 1);
        c.end(now);
      }
    }
    if (this.toastNow) {
      this.toastNow.frame(now, dt);
      if (this.toastNow.timeline.done) {
        this.toastNow.end(now);
        this.toastNow = null;
        this.lastToastEnd = now;
      }
    }
    this.pumpToasts(now);
  }

  /**
   * A pointerdown anywhere: the running T4/T5 skips to its end state from 400 ms (the tap itself still digs: the
   * caller passes it on). A tap on a toast does not skip it (the toast opens its sheet through its own handler).
   * @returns true when it skipped something.
   */
  pointerDown(now: number): boolean {
    let skipped = false;
    if (this.main && this.main.timeline.skip(now)) skipped = true;
    return skipped;
  }

  /** Cut everything (a mode change, the menu): every running ceremony ends in its end state. */
  flush(now: number): void {
    const all = [...(this.main ? [this.main] : []), ...this.side, ...(this.toastNow ? [this.toastNow] : [])];
    this.main = null;
    this.side.length = 0;
    this.toastNow = null;
    for (const c of all) {
      c.timeline.finish(now);
      c.end(now);
    }
    for (const q of this.queue) {
      q.c.timeline.finish(now);
      q.c.end(now);
    }
    this.queue.length = 0;
    // T3s still held by the rate limit never began: they are let go.
    this.t3q.length = 0;
    this.budget.endExclusive(now);
  }

  /** Everything that runs now (the debug surface). */
  live(): Array<{ id: CeremonyId; tier: number; t: number }> {
    const out: Array<{ id: CeremonyId; tier: number; t: number }> = [];
    if (this.main) out.push({ id: this.main.id, tier: this.main.tier, t: this.main.timeline.t });
    for (const c of this.side) out.push({ id: c.id, tier: c.tier, t: c.timeline.t });
    if (this.toastNow) out.push({ id: this.toastNow.id, tier: this.toastNow.tier, t: this.toastNow.timeline.t });
    return out;
  }
}
