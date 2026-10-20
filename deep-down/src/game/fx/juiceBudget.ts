// The response ladder (SPEC §10.2) and its budgets, pure: tier caps, the hit-stop rules (§10.9), the
// photosensitivity limiter (§10.13), trauma caps (§10.12), T3 merging and freshness damping. JuiceDirector asks
// this module before it plays anything; unit-tested in Node (tests/unit/idle/juiceBudget.test.ts).

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;
export type MotionLevel = 'full' | 'reduced' | 'off';
export type FlashLevel = 'on' | 'soft' | 'off';

export interface TierCaps {
  /** Longest effect (ms). */
  maxMs: number;
  /** Footprint radius on screen (px; Infinity = full screen). */
  footprint: number;
  /** Longest hit-stop (ms). */
  hitStop: number;
  /** Trauma ceiling. */
  trauma: number;
  /** Full-screen flash ceiling. */
  flash: number;
}

export const TIER_CAPS: Readonly<Record<Tier, TierCaps>> = {
  0: { maxMs: Infinity, footprint: Infinity, hitStop: 0, trauma: 0, flash: 0 },
  1: { maxMs: 150, footprint: 60, hitStop: 0, trauma: 0, flash: 0 },
  2: { maxMs: 400, footprint: 160, hitStop: 40, trauma: 0.25, flash: 0 },
  3: { maxMs: 1400, footprint: 422, hitStop: 60, trauma: 0.45, flash: 0.12 },
  4: { maxMs: 2400, footprint: Infinity, hitStop: 120, trauma: 0.6, flash: 0.3 },
  5: { maxMs: 4000, footprint: Infinity, hitStop: 160, trauma: 0.8, flash: 0.35 },
};

/** Hit-stop rules (§10.9). */
export const HIT_STOP = {
  /** Minimum gap between the end of one stop and the start of the next (ms). */
  gap: 300,
  /** No stop while the 1 s average of breaks is at or above this (breaks/s). */
  maxBreakRate: 3,
  /** Time scale of a "heavy" stop (pick tier). */
  heavyScale: 0.05,
} as const;

/** Photosensitivity (§10.13, WCAG 2.3.1). */
export const FLASH = {
  /** At most this many full-screen flashes in any 1 s. */
  perSecond: 2,
  /** And at least this far apart (ms). */
  minGap: 500,
  /** Intensity ceiling (Rekindle may reach REKINDLE with a 200 ms ramp). */
  max: 0.35,
  rekindle: 0.4,
  /** Reduced motion ceiling. */
  reduced: 0.15,
  /** Flashes 'soft' scale. */
  soft: 0.5,
} as const;

/** Trauma ceiling for everything except the seal break and the plunge landing (§10.12). */
export const TRAUMA_CAP = 0.5;
export const TRAUMA_CAP_BIG = 0.7;

/** Particle count multipliers by quality preset (§10.3) and by motion level (§10.13). */
export const PRESET_PARTICLES = { battery: 0.4, balanced: 1, high: 1.6 } as const;
export const MOTION_PARTICLES: Readonly<Record<MotionLevel, number>> = { full: 1, reduced: 0.6, off: 0 };
/** Motion Off: at most this many particles per event. */
export const MOTION_OFF_PARTICLES = 20;

/** Context of a hit-stop request. */
export interface StopContext {
  /** Breaks per second averaged over the last 1 s. */
  breakRate: number;
  /** A finger is holding (the hold stream runs). */
  holding: boolean;
  /** The Lantern Surge runs. */
  surge: boolean;
}

/** Is a colour a saturated red (never flashed full screen)? r, g, b in 0..1. */
export function isRed(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= 0) return false;
  const sat = (max - min) / max;
  // Hue near 0° (red dominant, green and blue low).
  return sat > 0.6 && r === max && g < r * 0.55 && b < r * 0.55;
}

/**
 * The mutable budget state. Times are ms on one monotonic clock (performance.now() in the game).
 */
export class JuiceBudget {
  motion: MotionLevel = 'full';
  flashes: FlashLevel = 'on';
  /** Camera shake setting 0..1. */
  shake = 1;

  // Hit-stop
  private stopUntil = -Infinity;
  private stopScale = 1;
  private lastStopEnd = -Infinity;
  // Flashes: the start times of the last full-screen flashes.
  private readonly flashTimes: number[] = [];
  /** Intensities of the flashes granted in the last second (F8, read by the debug surface). */
  readonly flashLog: Array<{ t: number; v: number }> = [];
  // T3 rate limit: one per 1.5 s, the excess merges.
  private lastT3 = -Infinity;
  private t3Merged = 0;
  // Exclusive T4/T5 ceremony.
  private exclusiveUntil = -Infinity;
  // Freshness damping: last time and repeat count per cue.
  private readonly fresh = new Map<string, { t: number; n: number }>();

  /** The FX clock's time scale now: 0 (frozen), 0.05 (heavy stop) or 1. */
  timeScale(now: number): number {
    return now < this.stopUntil ? this.stopScale : 1;
  }

  /** A hit-stop holds the FX clock now. */
  stopped(now: number): boolean {
    return now < this.stopUntil;
  }

  /**
   * Ask for a hit-stop of `ms` for an event of `tier`. @returns the granted length (0: refused).
   * Never on T0–T1; never in Reduced or Off motion; ≥ 300 ms after the last stop; never while breaks run at
   * ≥ 3/s, while holding or in a Surge (T2–T3 only: ceremonies T4–T5 keep theirs); capped by the tier;
   * overlapping stops take the max.
   */
  requestStop(ms: number, tier: Tier, now: number, ctx: StopContext, heavy = false): number {
    if (tier <= 1 || ms <= 0 || this.motion !== 'full') return 0;
    if (tier <= 3 && (ctx.breakRate >= HIT_STOP.maxBreakRate || ctx.holding || ctx.surge)) return 0;
    const running = now < this.stopUntil;
    if (!running && now - this.lastStopEnd < HIT_STOP.gap) return 0;
    const len = Math.min(ms, TIER_CAPS[tier].hitStop);
    const end = Math.max(this.stopUntil, now + len);
    this.stopUntil = end;
    this.stopScale = heavy ? HIT_STOP.heavyScale : 0;
    this.lastStopEnd = end;
    return len;
  }

  /** A new pointerdown ends the stop in that frame (F6, §10.9). */
  onPointerDown(now: number): void {
    if (now < this.stopUntil) {
      this.stopUntil = now;
      this.lastStopEnd = now;
    }
  }

  /**
   * Ask for a full-screen flash. @returns the intensity to play (0: refused). Enforces ≤ 2 a second, ≥ 500 ms
   * apart, the tier ceiling, the motion and flash settings, and never red.
   */
  requestFlash(intensity: number, tier: Tier, now: number, rgb: readonly [number, number, number] = [1, 1, 1], rekindle = false): number {
    if (intensity <= 0 || this.flashes === 'off' || this.motion === 'off') return 0;
    if (isRed(rgb[0], rgb[1], rgb[2])) return 0;
    const cap = rekindle ? FLASH.rekindle : Math.min(FLASH.max, TIER_CAPS[tier].flash);
    let v = Math.min(intensity, cap);
    if (this.motion === 'reduced') v = Math.min(v, FLASH.reduced);
    if (this.flashes === 'soft') v *= FLASH.soft;
    if (v <= 0) return 0;
    while (this.flashTimes.length && now - this.flashTimes[0] >= 1000) this.flashTimes.shift();
    if (this.flashTimes.length >= FLASH.perSecond) return 0;
    const last = this.flashTimes[this.flashTimes.length - 1];
    if (last !== undefined && now - last < FLASH.minGap) return 0;
    this.flashTimes.push(now);
    this.flashLog.push({ t: now, v });
    while (this.flashLog.length && now - this.flashLog[0].t >= 1000) this.flashLog.shift();
    return v;
  }

  /** The intensities of full-screen flashes granted in the second before `now`. */
  recentFlashes(now: number): number[] {
    const out: number[] = [];
    for (const f of this.flashLog) if (now - f.t < 1000) out.push(f.v);
    return out;
  }

  /**
   * Trauma to add for a cue of `tier`, given the current trauma: capped by the tier, the global 0.5 cap
   * (0.7 for the seal break and the plunge landing) and scaled by the shake setting. Reduced/Off: 0.
   */
  trauma(add: number, tier: Tier, current: number, big = false): number {
    if (this.motion !== 'full' || add <= 0) return 0;
    const ceiling = Math.min(TIER_CAPS[tier].trauma, big ? TRAUMA_CAP_BIG : TRAUMA_CAP);
    const scaled = add * this.shake;
    return Math.max(0, Math.min(scaled, ceiling - current));
  }

  /** The kick impulse to apply (taps add kick only, never trauma). Reduced/Off: 0. */
  kick(v: number): number {
    return this.motion === 'full' ? v * Math.max(0.25, this.shake) : 0;
  }

  /**
   * T3 rate limit: one per 1.5 s; the excess merges ("×3 ★"). @returns 0 to play now, or the merge count
   * (≥ 1) when it merged into the last one.
   */
  /** A T3 would be admitted now (no side effect: a waiting ceremony asks before it takes the slot). */
  t3Free(now: number): boolean {
    return now - this.lastT3 >= 1500;
  }

  admitT3(now: number): number {
    if (now - this.lastT3 >= 1500) {
      this.lastT3 = now;
      this.t3Merged = 0;
      return 0;
    }
    return ++this.t3Merged;
  }

  /** Start an exclusive T4/T5 for `ms`. @returns false while another one runs (the caller queues it). */
  beginExclusive(ms: number, now: number): boolean {
    if (now < this.exclusiveUntil) return false;
    this.exclusiveUntil = now + ms;
    return true;
  }

  /** End the exclusive ceremony early (skipped). */
  endExclusive(now: number): void {
    this.exclusiveUntil = Math.min(this.exclusiveUntil, now);
  }

  /** A T4 or T5 runs: T1–T2 effects play at 50 % particles and toasts wait. */
  exclusive(now: number): boolean {
    return now < this.exclusiveUntil;
  }

  /**
   * Freshness damping (§10.12): the same cue within 2 s of its last play plays at −15 % per repeat (min 50 %)
   * on flash, bloom and particles. @returns the multiplier for this play.
   */
  freshness(cue: string, now: number): number {
    const f = this.fresh.get(cue);
    if (!f || now - f.t > 2000) {
      this.fresh.set(cue, { t: now, n: 0 });
      return 1;
    }
    f.t = now;
    f.n++;
    return Math.max(0.5, 1 - 0.15 * f.n);
  }

  /** Particle count for a request of `n`: preset, motion level, exclusivity and freshness applied. */
  particles(n: number, preset: keyof typeof PRESET_PARTICLES, now: number, fresh = 1): number {
    if (n <= 0) return 0;
    if (this.motion === 'off') return Math.min(MOTION_OFF_PARTICLES, Math.round(n * PRESET_PARTICLES[preset] * 0.3));
    let k = PRESET_PARTICLES[preset] * MOTION_PARTICLES[this.motion] * fresh;
    if (this.exclusive(now)) k *= 0.5;
    return Math.max(1, Math.round(n * k));
  }
}
