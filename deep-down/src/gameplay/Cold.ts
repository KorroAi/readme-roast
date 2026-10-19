import { COLD } from '../config/balance';

/** What the cold needs to know each step. */
export interface ColdInput {
  /** The lantern still burns. */
  lit: boolean;
  /** Inside the camp region: never cold there. */
  atCamp: boolean;
  /** The equipped lantern keeps the cold away even when empty (Attuned Lantern). */
  immune: boolean;
  /** Damage multiplier (COLD.coatFactor with the Miner's Coat, otherwise 1). */
  factor: number;
}

/** One step's result. The object is reused: read it before the next update. */
export interface ColdStep {
  /** Health to take this step (fractional; 0 while lit, in the grace, at camp or immune). */
  damage: number;
  /** True on the step where another full interval of cold has bitten (for the event and haptic). */
  tick: boolean;
  /** Damage of a full interval, reported with the tick. */
  tickDamage: number;
}

/**
 * The dark is cold. When the flame dies the explorer has COLD.graceSeconds of grace; after that
 * the cold takes COLD.damage health every COLD.intervalSeconds, applied evenly over the interval
 * (2 hp/s), so from full health (100) a black-out comes exactly 8 + 50 = 58 s after the flame
 * dies, and with the Miner's Coat (140 hp, half damage) 8 + 140 = 148 s. Pure: no events, no
 * DOM; Progression turns the result into damage, events and hints.
 */
export class Cold {
  /** Seconds in the dark (unlit, outside camp, not immune) since the flame died. */
  private dark = 0;
  /** Cold damage dealt since the bite started, before the factor (for interval ticks). */
  private bitten = 0;
  private readonly out: ColdStep = { damage: 0, tick: false, tickDamage: 0 };

  /** Seconds since the flame died (0 while lit). */
  get darkSeconds(): number {
    return this.dark;
  }

  /** True once the grace has run out and the cold hurts. */
  get biting(): boolean {
    return this.dark > COLD.graceSeconds;
  }

  /** Frost amount for the HUD in [0, 1]: creeps in over the grace, full while it bites. */
  get level(): number {
    return Math.max(0, Math.min(1, this.dark / COLD.graceSeconds));
  }

  update(dt: number, s: ColdInput): Readonly<ColdStep> {
    const o = this.out;
    o.damage = 0;
    o.tick = false;
    const step = dt > 0 && Number.isFinite(dt) ? dt : 0;
    if (s.lit || s.atCamp || s.immune) {
      this.reset();
      return o;
    }
    const before = Math.max(0, this.dark - COLD.graceSeconds);
    this.dark += step;
    const cold = Math.max(0, this.dark - COLD.graceSeconds) - before;
    if (cold <= 0) return o;
    const rate = COLD.damage / COLD.intervalSeconds;
    const factor = s.factor > 0 && Number.isFinite(s.factor) ? s.factor : 1;
    const raw = cold * rate;
    const prevTicks = Math.floor(this.bitten / COLD.damage + 1e-9);
    this.bitten += raw;
    o.damage = raw * factor;
    o.tickDamage = COLD.damage * factor;
    o.tick = Math.floor(this.bitten / COLD.damage + 1e-9) > prevTicks;
    return o;
  }

  /** Light again (refuel, camp): the cold lets go and the grace starts over next time. */
  reset(): void {
    this.dark = 0;
    this.bitten = 0;
  }
}
