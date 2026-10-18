import { PLAYER, type LanternDef } from '../config/balance';

/** One-frame transitions reported by Lantern.update, for events and hints. */
export interface LanternEdges {
  becameLow: boolean;
  becameEmpty: boolean;
  refueled: boolean;
}

/**
 * Lantern fuel in seconds of burn time. It burns 1 s per second outside camp and is
 * topped up instantly at camp. When it runs dry the light shrinks to an ember instead of
 * going out completely, so the player can always find the way back.
 */
export class Lantern {
  private fuelS: number;
  private cap: number;
  // Reused every update so the per-frame call allocates nothing.
  private readonly edges: LanternEdges = { becameLow: false, becameEmpty: false, refueled: false };

  constructor(capacity: number, fuel: number = capacity) {
    this.cap = Math.max(1, Number.isFinite(capacity) ? capacity : 1);
    this.fuelS = Number.isFinite(fuel) ? clampFuel(fuel, this.cap) : this.cap;
  }

  get fuel(): number {
    return this.fuelS;
  }

  get capacity(): number {
    return this.cap;
  }

  /** Remaining fuel in [0, 1]. */
  get fraction(): number {
    return this.fuelS / this.cap;
  }

  get lit(): boolean {
    return this.fuelS > 0;
  }

  get low(): boolean {
    return this.fraction < PLAYER.lanternLowFraction;
  }

  /** Light radius multiplier: full when lit, a dim ember when empty. */
  get radiusFactor(): number {
    return this.lit ? 1 : PLAYER.emptyLanternFactor;
  }

  /**
   * Advance by `dt` seconds. `def` is the equipped lantern (its fuelSeconds is the capacity).
   * The returned object is reused: read it before the next update.
   */
  update(dt: number, atCamp: boolean, def: LanternDef): Readonly<LanternEdges> {
    const e = this.edges;
    e.becameLow = e.becameEmpty = e.refueled = false;
    this.setCapacity(def.fuelSeconds);
    if (atCamp) {
      e.refueled = this.fill();
      return e;
    }
    const wasLow = this.low;
    const wasLit = this.lit;
    this.fuelS = Math.max(0, this.fuelS - Math.max(0, dt));
    e.becameLow = !wasLow && this.low;
    e.becameEmpty = wasLit && !this.lit;
    return e;
  }

  /** Fill to capacity (campfire rest, respawn, lantern upgrade). @returns true if it was not full. */
  refill(def?: LanternDef): boolean {
    if (def) this.setCapacity(def.fuelSeconds);
    return this.fill();
  }

  private fill(): boolean {
    if (this.fuelS >= this.cap) return false;
    this.fuelS = this.cap;
    return true;
  }

  private setCapacity(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds === this.cap) return;
    this.cap = seconds;
    this.fuelS = clampFuel(this.fuelS, this.cap);
  }
}

function clampFuel(fuel: number, cap: number): number {
  return Math.max(0, Math.min(cap, fuel));
}
