/**
 * The frame loop's crash guard. Each frame runs inside run(): an exception is logged and counted
 * instead of freezing the loop (or flooding the console every frame). After `limit` failures in
 * a row the guard trips: the game stops its loop, lets the screen sleep, silences audio and
 * raises the window event 'dd:crash' (the crash panel in src/main.ts listens). Any good frame
 * resets the count. From the first error until a good frame, nothing may be saved (canSave),
 * so a broken state never overwrites the last good save; once tripped, never again.
 */
export class FrameGuard {
  /** Failures in a row. */
  private failures = 0;
  private tripped = false;
  private firstError: unknown = null;

  constructor(
    private readonly onCrash: (error: unknown) => void,
    readonly limit = 3,
  ) {}

  get crashed(): boolean {
    return this.tripped;
  }

  /** False after an error until a frame succeeds again, and forever once the guard tripped. */
  get canSave(): boolean {
    return !this.tripped && this.failures === 0;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }

  /** The error that started the current run of failures. */
  get error(): unknown {
    return this.firstError;
  }

  /** Trip the guard from outside (an uncaught error elsewhere): no more frames, no more saves. */
  trip(err: unknown): void {
    if (this.tripped) return;
    this.tripped = true;
    if (this.firstError === null) this.firstError = err;
  }

  /** Run one frame. @returns false when it threw (or the guard has tripped). */
  run(frame: () => void): boolean {
    if (this.tripped) return false;
    try {
      frame();
      this.failures = 0;
      this.firstError = null;
      return true;
    } catch (err) {
      if (this.failures === 0) {
        this.firstError = err;
        console.error('[deep-down] frame failed', err);
      }
      this.failures++;
      if (this.failures >= this.limit) {
        this.tripped = true;
        this.onCrash(this.firstError ?? err);
      }
      return false;
    }
  }
}
