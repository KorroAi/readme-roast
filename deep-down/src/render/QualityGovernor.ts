import type { QualityLevel } from './Renderer';

/**
 * Automatic low-end quality: picks the first-launch preset from the device class, then watches
 * frame times while the player is playing and steps quality down when the device cannot keep up.
 *
 * - Downshift only: Balanced (or High) → Battery, then Battery → render scale 0.65. Never back up.
 * - Warm-up: the first 5 s of play after a start (or after a step) are not measured (shader
 *   compiles, world streaming).
 * - Each decision is the median of an 8 s window of frame intervals, so one hitch never counts.
 * - A manual quality or render-scale change switches it off for good (the caller persists that).
 *
 * Pure and allocation-free while sampling: a fixed ring buffer and an in-place selection for the
 * median. src/main.ts feeds it requestAnimationFrame intervals and applies its decisions through
 * the public Game API (updateSettings, the bus toast).
 */
export const GOVERNOR = {
  /** Play time not measured after play starts or after a step, ms. */
  warmupMs: 5000,
  /** Frame time covered by one decision, ms. */
  windowMs: 8000,
  /** Balanced/High → Battery when the window's median frame interval is above this (≈ 45 fps). */
  balancedLimitMs: 22,
  /** Battery → lower render scale above this (≈ 25 fps against Battery's 30 fps cap). */
  batteryLimitMs: 40,
  /** The render scale of the last step. */
  lowScale: 0.65,
  /**
   * Longer intervals are gaps (a debugger, a stall), not frames: ignored, so one gap cannot fill
   * the window. Slow frames below it still count: a device at 2 fps must step down too.
   */
  maxGapMs: 2000,
  /** Ring capacity: the most recent samples of a window (8 s at 120 Hz fits). */
  capacity: 1024,
} as const;

export type GovernorAction = 'none' | 'battery' | 'scale';

/** First launch: Battery on small devices (≤ 3 GB, or ≤ 4 cores), Balanced otherwise. */
export function initialQuality(deviceMemoryGb: number | undefined, cores: number | undefined): 'battery' | 'balanced' {
  if (typeof deviceMemoryGb === 'number' && deviceMemoryGb > 0 && deviceMemoryGb <= 3) return 'battery';
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return 'battery';
  return 'balanced';
}

export class QualityGovernor {
  private readonly ring = new Float32Array(GOVERNOR.capacity);
  private readonly scratch = new Float32Array(GOVERNOR.capacity);
  private count = 0;
  private head = 0;
  private warm = 0;
  private windowElapsed = 0;
  /** Medians of the decisions taken so far (the last one), for diagnostics and tests. */
  lastMedianMs = 0;

  constructor(
    /** Off after a manual change (persisted by the caller). */
    public auto = true,
  ) {}

  /** Play stopped (menu, pause, death, page hidden): the next play warms up again. */
  reset(): void {
    this.count = 0;
    this.head = 0;
    this.warm = 0;
    this.windowElapsed = 0;
  }

  /** The player chose a quality or render scale: never touch the settings again. */
  disable(): void {
    this.auto = false;
    this.reset();
  }

  /**
   * One frame interval while playing, with the current settings. Returns the step to apply now
   * ('none' almost always). After a step the governor warms up again before it measures.
   */
  sample(intervalMs: number, quality: QualityLevel, renderScale: number | null): GovernorAction {
    if (!this.auto || !(intervalMs > 0) || intervalMs > GOVERNOR.maxGapMs) return 'none';
    const bottom = quality === 'battery' && renderScale !== null && renderScale <= GOVERNOR.lowScale;
    if (bottom) return 'none';
    if (this.warm < GOVERNOR.warmupMs) {
      this.warm += intervalMs;
      return 'none';
    }
    this.ring[this.head] = intervalMs;
    this.head = (this.head + 1) % GOVERNOR.capacity;
    if (this.count < GOVERNOR.capacity) this.count++;
    this.windowElapsed += intervalMs;
    if (this.windowElapsed < GOVERNOR.windowMs) return 'none';

    const median = this.median();
    this.lastMedianMs = median;
    this.count = 0;
    this.head = 0;
    this.windowElapsed = 0;
    let action: GovernorAction = 'none';
    if (quality !== 'battery') {
      if (median > GOVERNOR.balancedLimitMs) action = 'battery';
    } else if (median > GOVERNOR.batteryLimitMs) action = 'scale';
    if (action !== 'none') this.warm = 0;
    return action;
  }

  /** Median of the ring's samples (in-place quickselect on a scratch copy; no allocation). */
  private median(): number {
    const n = this.count;
    const a = this.scratch;
    for (let i = 0; i < n; i++) a[i] = this.ring[i];
    const k = n >> 1;
    const hi = select(a, 0, n - 1, k);
    if (n & 1) return hi;
    // Even count: the mean of the two middle values (the lower one is the max of the left part).
    let lo = -Infinity;
    for (let i = 0; i < k; i++) if (a[i] > lo) lo = a[i];
    return (lo + hi) / 2;
  }
}

/** Hoare's selection: reorders a[l..r] so a[k] is the k-th smallest and returns it. */
function select(a: Float32Array, l: number, r: number, k: number): number {
  while (r > l) {
    const pivot = a[(l + r) >> 1];
    let i = l;
    let j = r;
    while (i <= j) {
      while (a[i] < pivot) i++;
      while (a[j] > pivot) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) r = j;
    else if (k >= i) l = i;
    else break;
  }
  return a[k];
}
