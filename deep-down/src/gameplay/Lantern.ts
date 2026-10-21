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
  private ember: number = PLAYER.emptyLanternFactor;
  // Reused every update so the per-frame call allocates nothing.
  private readonly edges: LanternEdges = { becameLow: false, becameEmpty: false, refueled: false };
  /**
   * Round 2 (WORLD): a gust (game/events) dims the light to this fraction until the explorer stands
   * by a lamp or a fire; 1 otherwise. Multiplies the light's radius and intensity (Game.updateLantern).
   */
  dim = 1;

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
    return this.lit ? 1 : this.ember;
  }

  /**
   * Advance by `dt` seconds. `def` is the equipped lantern (its fuelSeconds is the capacity).
   * The returned object is reused: read it before the next update.
   */
  update(dt: number, atCamp: boolean, def: LanternDef): Readonly<LanternEdges> {
    const e = this.edges;
    e.becameLow = e.becameEmpty = e.refueled = false;
    this.setCapacity(def.fuelSeconds);
    this.setEmber(def.ember);
    if (atCamp) {
      e.refueled = this.fill();
      return e;
    }
    const wasLow = this.low;
    const wasLit = this.lit;
    // A NaN step must not poison the fuel: NaN fuel would also fail save validation forever.
    this.fuelS = Math.max(0, this.fuelS - (dt > 0 ? dt : 0));
    e.becameLow = !wasLow && this.low;
    e.becameEmpty = wasLit && !this.lit;
    return e;
  }

  /** Fill to capacity (campfire rest, respawn, lantern upgrade). @returns true if it was not full. */
  refill(def?: LanternDef): boolean {
    if (def) {
      this.setCapacity(def.fuelSeconds);
      this.setEmber(def.ember);
    }
    return this.fill();
  }

  /**
   * Add burn time in the field (e.g. a Lantern Ember), capped at the capacity.
   * @returns the seconds actually added.
   */
  add(seconds: number): number {
    if (!(seconds > 0) || !Number.isFinite(seconds)) return 0;
    const before = this.fuelS;
    this.fuelS = clampFuel(this.fuelS + seconds, this.cap);
    return this.fuelS - before;
  }

  private setEmber(f: number | undefined): void {
    if (typeof f === 'number' && Number.isFinite(f) && f > 0) this.ember = Math.min(1, f);
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
