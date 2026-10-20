// The FX clock and the camera's juice (SPEC §10.9): hit-stops run on a separate FX clock (fxDt = dt × scale: 0, or
// 0.05 for "heavy" stops) that freezes shards, particles, number rises, crew loops and the camera follow, while the
// flash decay, shake, kick, the UI, audio, tokens in flight and the simulation keep running. A new pointerdown ends
// a stop in that frame. Kick and trauma go to the DescentScene through the budget (taps kick, never shake); flashes
// and bloom pulses go to the post chain through the photosensitivity limiter.

import type { Renderer } from '../../render/Renderer';
import { JuiceBudget, type StopContext, type Tier } from './juiceBudget';

/** What CameraFx drives in the scene (DescentScene satisfies it). */
export interface CameraTarget {
  kick(dx: number, dy: number, crit?: boolean): void;
  trauma(t: number): void;
  readonly rig: { readonly traumaNow: number; readonly kickPx: number };
}

export class CameraFx {
  readonly budget = new JuiceBudget();
  /** The FX clock (seconds of FX time since boot). */
  fxTime = 0;
  /** Base bloom strength (the preset's), restored as pulses decay. */
  private baseBloom = -1;
  private bloomAdd = 0;
  private bloomUntil = 0;
  private bloomMs = 1;
  private flash = 0;
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
    this.flash = Math.max(this.flash, g);
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

  /** Per frame: decay the flash and the bloom pulse into the post chain. */
  frame(dt: number, now: number): void {
    const post = this.renderer.post.params;
    if (this.baseBloom < 0) this.baseBloom = post.bloomStrength;
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - this.flash * Math.min(1, this.flashDecay * dt) - dt * 0.2);
      post.flash = this.flash;
      post.flashColor.setRGB(this.flashRgb[0], this.flashRgb[1], this.flashRgb[2]);
    } else if (post.flash !== 0) post.flash = 0;
    const left = Math.max(0, (this.bloomUntil - now) / this.bloomMs);
    post.bloomStrength = this.baseBloom + this.bloomAdd * left * left;
  }

  /** The preset changed (the base bloom is read again). */
  presetChanged(): void {
    this.baseBloom = -1;
  }
}
