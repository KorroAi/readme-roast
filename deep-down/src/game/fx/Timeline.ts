// A ceremony timeline (SPEC §10.8): keyed steps on a fixed clock, `skip()` from 400 ms jumps to the end state (and
// fires every step not yet fired, in order, so the end state is always reached), and a fixed-time capture hook.
// Pure apart from the callbacks; the W2 ceremonies build on it.

export interface TimelineStep {
  /** ms from the start. */
  at: number;
  run(): void;
}

export class Timeline {
  private readonly steps: TimelineStep[];
  private next = 0;
  private t0 = -1;
  /** A tap after this many ms skips to `skipTo`. */
  skipFrom = 400;
  done = false;

  constructor(steps: TimelineStep[], readonly length: number, private readonly skipTo = length) {
    this.steps = [...steps].sort((a, b) => a.at - b.at);
  }

  start(now: number): void {
    this.t0 = now;
    this.next = 0;
    this.done = false;
  }

  get running(): boolean {
    return this.t0 >= 0 && !this.done;
  }

  /** ms since the start. */
  elapsed(now: number): number {
    return this.t0 < 0 ? 0 : now - this.t0;
  }

  /** Fire the steps due by `now`. */
  update(now: number): void {
    if (!this.running) return;
    const t = now - this.t0;
    while (this.next < this.steps.length && this.steps[this.next].at <= t) this.steps[this.next++].run();
    if (t >= this.length) this.done = true;
  }

  /** A tap: from `skipFrom` ms, jump to `skipTo` (every earlier step fires). @returns true when it skipped. */
  skip(now: number): boolean {
    if (!this.running || now - this.t0 < this.skipFrom) return false;
    this.t0 = now - this.skipTo;
    this.update(now);
    return true;
  }
}
