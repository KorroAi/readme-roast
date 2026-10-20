// The FX clock and the camera's juice (SPEC §10.9): hit-stops run on a separate FX clock (fxDt = dt × scale: 0, or
// 0.05 for "heavy" stops) that freezes shards, particles, number rises, crew loops and the camera follow, while the
// flash decay, shake, kick, the UI, audio, tokens in flight and the simulation keep running. A new pointerdown ends
// a stop in that frame. Kick and trauma go to the DescentScene through the budget (taps kick, never shake); flashes
// and bloom pulses go to the post chain through the photosensitivity limiter.

import type { Renderer } from '../../render/Renderer';
import type { CeremonyPost } from './ceremonies/Ceremony';
import { JuiceBudget, type StopContext, type Tier } from './juiceBudget';

/** The post params 2D publishes for ceremonies (W2.md seam 2); optional so this compiles before and after they land. */
interface CeremonyParams {
  dim?: number;
  iris?: number;
  irisCenter?: { set(x: number, y: number): unknown };
  shock?: number;
  shockCenter?: { set(x: number, y: number): unknown };
  bloomPulse?: number;
}

/** What CameraFx drives in the scene (DescentScene satisfies it). */
export interface CameraTarget {
  kick(dx: number, dy: number, crit?: boolean): void;
  trauma(t: number): void;
  readonly rig: { readonly traumaNow: number; readonly kickPx: number };
}

export class CameraFx implements CeremonyPost {
  readonly budget = new JuiceBudget();
  /** Ceremony-driven post values (restored to rest when a ceremony ends: dim 0, iris 1.5, shock 0). */
  private dimV = 0;
  private irisV = 1.5;
  private shockV = 0;
  private pulseV = 0;
  /** The FX clock (seconds of FX time since boot). */
  fxTime = 0;
  /** Base bloom strength (the preset's), restored as pulses decay. */
  private baseBloom = -1;
  private bloomAdd = 0;
  private bloomUntil = 0;
  private bloomMs = 1;
  private flashV = 0;
  private readonly flashRgb: [number, number, number] = [1, 1, 1];
  /** Flash decay per second (the cue's own length). */
  private flashDecay = 8;

  constructor(private readonly renderer: Renderer, private readonly cam: CameraTarget) {}

  /** The FX time step for this frame (0 during a hit-stop; the heavy stop runs at 5 %). */
  fxDt(dt: number, now: number): number {
    const k = this.budget.timeScale(now);
    const fx = dt * k;
    this.fxTime += fx;
    return fx;
  }

  /** A hit-stop request (rules in JuiceBudget.requestStop). @returns the granted ms. */
  stop(ms: number, tier: Tier, now: number, ctx: StopContext, heavy = false): number {
    return this.budget.requestStop(ms, tier, now, ctx, heavy);
  }

  /** A new pointerdown: any hit-stop ends in this frame (F6). */
  pointerDown(now: number): void {
    this.budget.onPointerDown(now);
  }

  /** A tap kick toward a screen direction (2 px; a crit 4 px). */
  kick(dx: number, dy: number, crit = false): void {
    if (this.budget.kick(1) === 0) return;
    this.cam.kick(dx, dy, crit);
  }

  /** Add trauma for a cue (capped by tier and globally; Reduced: none). */
  trauma(add: number, tier: Tier, big = false): void {
    const t = this.budget.trauma(add, tier, this.cam.rig.traumaNow, big);
    if (t > 0) this.cam.trauma(t);
  }

  /** A full-screen flash (limited: ≤ 2 a second, ≤ 0.35, never red). `ms` its decay. @returns the intensity played. */
  fullFlash(v: number, tier: Tier, now: number, rgb: readonly [number, number, number] = [1, 1, 1], ms = 120, rekindle = false): number {
    const g = this.budget.requestFlash(v, tier, now, rgb, rekindle);
    if (g <= 0) return 0;
    this.flashV = Math.max(this.flashV, g);
    this.flashRgb[0] = rgb[0];
    this.flashRgb[1] = rgb[1];
    this.flashRgb[2] = rgb[2];
    this.flashDecay = 1000 / Math.max(60, ms);
    return g;
  }

  /** A bloom pulse: +`add` to the bloom strength, decaying over `ms`. */
  bloom(add: number, ms: number, now: number): void {
    if (this.budget.motion === 'off' || this.budget.flashes === 'off') return;
    const k = this.budget.flashes === 'soft' ? 0.5 : 1;
    if (add * k <= this.bloomAdd * Math.max(0, (this.bloomUntil - now) / this.bloomMs)) return;
    this.bloomAdd = add * k;
    this.bloomUntil = now + ms;
    this.bloomMs = ms;
  }

  // ----- CeremonyPost (W2.md seam 2) -------------------------------------------------------------------------

  /** The world dims (0..1), through the composite's uDim. Motion Off keeps it (a dim is not motion). */
  dim(v: number): void {
    this.dimV = Math.max(0, Math.min(1, v));
  }

  /** The octagon iris: radius 0..1.5 (1.5 open), centre in CSS px (default the screen centre). */
  iris(r: number, cx?: number, cy?: number): void {
    this.irisV = Math.max(0, Math.min(1.5, r));
    const p = this.renderer.post.params as unknown as CeremonyParams;
    if (p.irisCenter && cx !== undefined && cy !== undefined) p.irisCenter.set(cx / Math.max(1, innerWidth), 1 - cy / Math.max(1, innerHeight));
  }

  /** A screen shock ring from a centre (CSS px), `u` 0..1 of its run (Reduced and Off: none). */
  shock(cx: number, cy: number, u: number): void {
    this.shockV = this.budget.motion === 'full' ? Math.max(0, Math.min(1, u)) : 0;
    const p = this.renderer.post.params as unknown as CeremonyParams;
    if (p.shockCenter) p.shockCenter.set(cx / Math.max(1, innerWidth), 1 - cy / Math.max(1, innerHeight));
  }

  /** A held bloom pulse 0..1 (the Surge's blaze, a ceremony's glow), on top of the timed pulses. */
  bloomPulse(v: number): void {
    this.pulseV = Math.max(0, Math.min(1, v));
  }

  /** CeremonyPost's flash: the limiter decides. */
  flash(v: number, tier: Tier, rgb: readonly [number, number, number] = [1, 1, 1], ms = 120, rekindle = false): number {
    return this.fullFlash(v, tier, performance.now(), rgb, ms, rekindle);
  }

  /** Every ceremony value back at rest (a ceremony ended or was cut). */
  restCeremony(): void {
    this.dimV = 0;
    this.irisV = 1.5;
    this.shockV = 0;
    this.pulseV = 0;
  }

  /** The values a ceremony holds now (the debug surface and the tests). */
  ceremonyState(): { dim: number; iris: number; shock: number; pulse: number } {
    return { dim: this.dimV, iris: this.irisV, shock: this.shockV, pulse: this.pulseV };
  }

  /** Per frame: decay the flash and the bloom pulse into the post chain; write the ceremony values. */
  frame(dt: number, now: number): void {
    const post = this.renderer.post.params;
    const cp = post as unknown as CeremonyParams;
    if (this.flashV > 0) {
      this.flashV = Math.max(0, this.flashV - this.flashV * Math.min(1, this.flashDecay * dt) - dt * 0.2);
      post.flash = this.flashV;
      post.flashColor.setRGB(this.flashRgb[0], this.flashRgb[1], this.flashRgb[2]);
    } else if (post.flash !== 0) post.flash = 0;
    const left = Math.max(0, (this.bloomUntil - now) / this.bloomMs);
    const timed = this.bloomAdd * left * left;
    if (cp.bloomPulse !== undefined) {
      // 2D's bloomPulse adds up to +0.6 strength: the look keeps writing bloomStrength itself.
      cp.bloomPulse = Math.min(1, timed / 0.6 + this.pulseV);
    } else {
      if (this.baseBloom < 0) this.baseBloom = post.bloomStrength;
      post.bloomStrength = this.baseBloom + timed + this.pulseV * 0.6;
    }
    if (cp.dim !== undefined) cp.dim = this.dimV;
    if (cp.iris !== undefined) cp.iris = this.irisV;
    if (cp.shock !== undefined) cp.shock = this.shockV;
  }

  /** The preset changed (the base bloom is read again). */
  presetChanged(): void {
    this.baseBloom = -1;
  }
}
