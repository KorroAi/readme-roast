// A ceremony timeline (SPEC §10.8): keyed steps on a fixed clock, `skip()` from 400 ms jumps to the end state (and
// fires every step not yet fired, in order, so the end state is always reached), and a fixed-time capture hook
// (`seek(t)` + `freeze`): a capture sets the clock to t ms, fires every step due by then, and holds there, so a
// screenshot shows the same frame every time. Pure apart from the callbacks (tests/unit/idle/timeline.test.ts).

export interface TimelineStep {
  /** ms from the start. */
  at: number;
  run(): void;
}

/** A continuous track: called every frame with the local time (ms) while `from ≤ t < to`, and once at `to`. */
export interface TimelineTrack {
  from: number;
  to: number;
  /** `u` is 0..1 over [from, to]; `t` the timeline's ms. */
  run(u: number, t: number): void;
}

export class Timeline {
  private readonly steps: TimelineStep[];
  private readonly tracks: TimelineTrack[];
  private next = 0;
  private t0 = 0;
  /** Started (t0 may be negative after a skip: the clock was moved back to land on the end state). */
  private started = false;
  /** A tap after this many ms skips to `skipTo`. */
  skipFrom = 400;
  done = false;
  /** Held at a fixed time (the capture hook): `update` does not advance the clock. */
  frozen = false;
  private frozenAt = 0;
  /** The time the last `update` saw (ms since the start). */
  t = 0;
  /** True once a tap skipped it. */
  skipped = false;

  constructor(steps: TimelineStep[], readonly length: number, private readonly skipTo = length, tracks: TimelineTrack[] = []) {
    this.steps = [...steps].sort((a, b) => a.at - b.at);
    this.tracks = tracks;
  }

  start(now: number): void {
    this.started = true;
    this.t0 = now;
    this.next = 0;
    this.done = false;
    this.skipped = false;
    this.t = 0;
  }

  get running(): boolean {
    return this.started && !this.done;
  }

  /** ms since the start. */
  elapsed(now: number): number {
    if (!this.started) return 0;
    return this.frozen ? this.frozenAt : now - this.t0;
  }

  /** Fire the steps due by `now` and run the live tracks. */
  update(now: number): void {
    if (!this.running) return;
    const t = this.frozen ? this.frozenAt : now - this.t0;
    this.advanceTo(t);
    if (!this.frozen && t >= this.length) this.done = true;
  }

  private advanceTo(t: number): void {
    const prev = this.t;
    this.t = t;
    while (this.next < this.steps.length && this.steps[this.next].at <= t) this.steps[this.next++].run();
    for (const tr of this.tracks) {
      if (t >= tr.from && t < tr.to) tr.run((t - tr.from) / Math.max(1, tr.to - tr.from), t);
      // A track whose end was crossed this update lands exactly on its end state.
      else if (t >= tr.to && prev < tr.to) tr.run(1, tr.to);
    }
  }

  /** A tap: from `skipFrom` ms, jump to `skipTo` (every earlier step fires). @returns true when it skipped. */
  skip(now: number): boolean {
    if (!this.running || this.frozen || now - this.t0 < this.skipFrom) return false;
    this.skipped = true;
    this.t0 = now - this.skipTo;
    this.update(now);
    return true;
  }

  /**
   * The capture hook: hold the timeline at `t` ms (every step due by then fires; tracks show their state at t). A
   * frozen timeline never ends by itself; `release(now)` lets it run on from there.
   */
  seek(t: number, now: number): void {
    if (!this.started) this.start(now);
    const tt = Math.max(0, Math.min(this.length, t));
    if (tt < this.t) {
      // Seeking back replays from the start (steps are idempotent by contract: they set states, never accumulate).
      this.next = 0;
      this.t = 0;
    }
    this.frozen = true;
    this.frozenAt = tt;
    this.advanceTo(tt);
  }

  /** Let a frozen timeline run on from where it was held. */
  release(now: number): void {
    if (!this.frozen) return;
    this.frozen = false;
    this.t0 = now - this.frozenAt;
  }

  /** Jump straight to the end (every step fires; tracks land on their end state). */
  finish(now: number): void {
    if (!this.started) this.start(now);
    this.frozen = false;
    this.t0 = now - this.length;
    this.update(now);
    this.done = true;
  }
}
