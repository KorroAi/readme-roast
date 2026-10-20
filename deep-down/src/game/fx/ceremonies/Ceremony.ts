// The ceremony contract (SPEC §10.2, §10.8; BUILD §3.3 contracts): every T3–T5 moment (★, crown, pick tier, chest,
// Feat, rank-up, biome reveal, charted gate, seal break, Rekindle, the offline feast) is a Ceremony: a Timeline of
// keyed steps and tracks on a fixed clock, a tier, the time from which taps dig again under it, a `skip()` from
// 400 ms, a fixed-time capture hook (`timeline.seek(t)`), and an `end()` that restores everything it touched.
// CeremonyDirector (same folder) runs them under the ladder's rules: one T4/T5 at a time, the rest queued for at most
// 6 s and then played in their T3 form, T3 rate-limited, toasts held while a T4/T5 runs. A tap is never dropped: it
// skips the running ceremony (from 400 ms) AND reaches the world in the same frame.

import type { Timeline } from '../Timeline';
import type { Tier } from '../juiceBudget';

/** Every ceremony of SPEC §10.8 that W2 plays (number milestones, Googol and Weave arrive in W3). */
export type CeremonyId =
  | 'star' | 'crown' | 'pickTier' | 'chest' | 'feat' | 'rankUp' | 'biomeReveal' | 'chartedGate' | 'sealBreak'
  | 'rekindle' | 'offlineFeast' | 'surge' | 'facetHand' | 'cataclysm';

export type CeremonyTier = Extract<Tier, 3 | 4 | 5>;

export interface Ceremony {
  readonly id: CeremonyId;
  readonly tier: CeremonyTier;
  readonly timeline: Timeline;
  /**
   * ms from the start after which world taps dig again (SPEC §10.1 rule 7: T5 1,200 ms). Before that, taps still reach
   * the model (they are never dropped: F6); the world simply keeps its framing until then.
   */
  readonly digFrom: number;
  /** A toast-like ceremony (the Feat toast): it waits while a T4/T5 runs instead of overlapping it. */
  readonly toast?: boolean;
  /** Start at `now` (ms, performance.now()). */
  begin(now: number): void;
  /** Per frame while it runs (`dt` seconds): the timeline's tracks advance here. */
  frame(now: number, dt: number): void;
  /** Restore everything it touched (post params, the HUD fade, overlays). Called exactly once. */
  end(now: number): void;
  /**
   * The T3 form it plays after waiting more than 6 s in the queue (SPEC §10.2: "others queue for at most 6 s, then play
   * in their T3 form"); null drops it (its rewards were already credited by the model).
   */
  demote?(): Ceremony | null;
}

/** What a ceremony may drive in the post chain (2D's PostFX params, W2.md seam 2), through CameraFx's limiter. */
export interface CeremonyPost {
  /** The world dims (0..1): the composite's uDim. */
  dim(v: number): void;
  /** The octagon iris: radius 0..1.5 (1.5 = open), centre in CSS px (null: the screen centre). */
  iris(r: number, cx?: number, cy?: number): void;
  /** A screen shock ring from a centre (CSS px), 0..1 of its run. */
  shock(cx: number, cy: number, u: number): void;
  /** A bloom pulse 0..1 on top of the preset's bloom. */
  bloomPulse(v: number): void;
  /** A full-screen flash through the photosensitivity limiter. @returns the intensity played (0: refused). */
  flash(v: number, tier: Tier, rgb?: readonly [number, number, number], ms?: number, rekindle?: boolean): number;
}

/** A ceremony that is only a timeline and callbacks (most of them): the shared base. */
export abstract class TimelineCeremony implements Ceremony {
  abstract readonly id: CeremonyId;
  abstract readonly tier: CeremonyTier;
  abstract readonly timeline: Timeline;
  readonly digFrom: number = 0;
  readonly toast: boolean = false;
  private ended = false;

  begin(now: number): void {
    this.timeline.start(now);
    this.timeline.update(now);
  }

  frame(now: number, dt: number): void {
    void dt;
    this.timeline.update(now);
  }

  end(now: number): void {
    if (this.ended) return;
    this.ended = true;
    this.cleanup(now);
  }

  /** Restore what the ceremony touched (called once by `end`). */
  protected abstract cleanup(now: number): void;
}
