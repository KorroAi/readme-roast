import { GEAR, PLAYER } from '../config/balance';

/** Player health. Damage and healing are clamped to [0, max]; at 0 the player is dead. */
export class Health {
  readonly max: number;
  private hp: number;

  constructor(max: number, current: number = max) {
    this.max = Number.isFinite(max) && max > 0 ? max : PLAYER.maxHealth;
    this.hp = Number.isFinite(current) ? Math.max(0, Math.min(this.max, current)) : this.max;
  }

  get current(): number {
    return this.hp;
  }

  get fraction(): number {
    return this.hp / this.max;
  }

  get dead(): boolean {
    return this.hp <= 0;
  }

  /** @returns the damage actually dealt (never negative, never more than the remaining health). */
  damage(amount: number): number {
    if (!(amount > 0) || this.dead) return 0;
    const dealt = Math.min(amount, this.hp);
    this.hp -= dealt;
    return dealt;
  }

  /** @returns the health actually restored. Healing does not revive: respawn makes a new Health. */
  heal(amount: number): number {
    if (!(amount > 0) || this.dead) return 0;
    const healed = Math.min(amount, this.max - this.hp);
    this.hp += healed;
    return healed;
  }

  /**
   * Damage for landing at `fallSpeed` (m/s): none up to `safe` (PLAYER.safeFallSpeed, or the Grip
   * Boots' GEAR.gripBoots.safeFallSpeed), then linear in the excess speed, rounded to whole points.
   */
  static fallDamage(fallSpeed: number, safe: number = PLAYER.safeFallSpeed): number {
    if (!(fallSpeed > safe)) return 0;
    return Math.round((fallSpeed - safe) * PLAYER.fallDamagePerSpeed);
  }

  /** Health for the gear worn: 100, or 140 with the Miner's Coat. */
  static maxFor(gear: readonly string[]): number {
    return gear.includes('minersCoat') ? GEAR.minersCoat.maxHealth : PLAYER.maxHealth;
  }
}
