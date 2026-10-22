import { GEAR, PLAYER } from '../config/balance';

/** Player health. Damage and healing are clamped to [0, max]; at 0 the player is dead. */
export class Health {
  private maxV: number;
  private hp: number;
  /**
   * Round 3 (LOOP): the share of each blow the armour takes (game/craft Loop sets it from the gear,
   * 0..0.45). damage() applies it unless the damage pierces (hazards, the dark's cold).
   */
  armour = 0;

  constructor(max: number, current: number = max) {
    this.maxV = Number.isFinite(max) && max > 0 ? max : PLAYER.maxHealth;
    this.hp = Number.isFinite(current) ? Math.max(0, Math.min(this.maxV, current)) : this.maxV;
  }

  get max(): number {
    return this.maxV;
  }

  /** Change the maximum (armour sets, bestiary milestones): a higher max adds the difference (unless `heal` is false), a lower one clamps. */
  setMax(max: number, heal = true): void {
    if (!Number.isFinite(max) || max <= 0 || max === this.maxV) return;
    const gain = max - this.maxV;
    this.maxV = max;
    if (this.hp > 0) this.hp = Math.max(1, Math.min(max, this.hp + (heal ? Math.max(0, gain) : 0)));
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
  damage(amount: number, pierce = false): number {
    if (!(amount > 0) || this.dead) return 0;
    const a = pierce ? amount : amount * (1 - Math.max(0, Math.min(0.9, this.armour)));
    const dealt = Math.min(a, this.hp);
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
