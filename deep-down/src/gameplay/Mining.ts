import type { PickaxeDef } from '../config/balance';
import { UNBREAKABLE_TIER, type BlockDef } from '../config/blocks';
import type { Rng } from '../core/rng';

/** Why a hit does no damage: pickaxe tier too low, or the block can never be mined. */
export type MiningBlockReason = 'tier' | 'unbreakable' | 'protected';

export interface MiningHit {
  /** Accumulated damage on the target in [0, 1]. */
  progress: number;
  broken: boolean;
  blocked: boolean;
  reason: MiningBlockReason | null;
}

export type DropSpec = NonNullable<BlockDef['drop']>;

export const MINING = {
  /** Damage holds this long after the last hit… */
  holdSeconds: 1,
  /** …then recedes at one full bar per fadeSeconds, so any damage is gone 1.5 s after the last hit. */
  fadeSeconds: 0.5,
} as const;

// Accumulated float damage (e.g. 3 x 1/3) must still break the block.
const EPS = 1e-6;

/** Why `pickaxeTier` cannot damage a block, or null if it can. */
export function miningBlockReason(
  requiredTier: number,
  pickaxeTier: number,
  protectedReason: BlockDef['protectedReason'] | null = null,
): MiningBlockReason | null {
  if (protectedReason) return protectedReason;
  if (requiredTier >= UNBREAKABLE_TIER) return 'unbreakable';
  return requiredTier > pickaxeTier ? 'tier' : null;
}

/**
 * Damage accumulated on the single target being mined (a voxel key or a prop id).
 * Switching target starts over; leaving a target alone lets its cracks heal.
 */
export class MiningProgress {
  private key: string | null = null;
  private dmg = 0;
  private hardness = 1;
  private idle = 0;

  get targetKey(): string | null {
    return this.key;
  }

  get progress(): number {
    return this.key === null || this.hardness <= 0 ? 0 : Math.min(1, this.dmg / this.hardness);
  }

  /**
   * Land one pickaxe impact on `targetKey`. `hardness` is in pickaxe-power units and `tier`
   * is the block's required tier. Pass the block's protectedReason so camp structures report
   * 'protected' rather than 'unbreakable'.
   */
  hit(
    targetKey: string,
    hardness: number,
    tier: number,
    pickaxe: PickaxeDef,
    protectedReason: BlockDef['protectedReason'] | null = null,
  ): MiningHit {
    if (targetKey !== this.key) {
      this.key = targetKey;
      this.dmg = 0;
    }
    this.idle = 0;
    this.hardness = hardness;
    const reason = miningBlockReason(tier, pickaxe.tier, protectedReason);
    if (reason) return { progress: this.progress, broken: false, blocked: true, reason };
    this.dmg += Math.max(0, pickaxe.power);
    if (hardness <= 0 || this.dmg >= hardness - EPS) {
      this.reset();
      return { progress: 1, broken: true, blocked: false, reason: null };
    }
    return { progress: this.progress, broken: false, blocked: false, reason: null };
  }

  /** Heal the current target's damage when it has not been hit recently. */
  update(dt: number): void {
    if (this.key === null || !(dt > 0)) return;
    const before = this.idle;
    this.idle += dt;
    if (this.idle >= MINING.holdSeconds + MINING.fadeSeconds) {
      this.reset();
      return;
    }
    const fading = this.idle - Math.max(before, MINING.holdSeconds);
    if (fading > 0) this.dmg = Math.max(0, this.dmg - (this.hardness * fading) / MINING.fadeSeconds);
  }

  reset(): void {
    this.key = null;
    this.dmg = 0;
    this.idle = 0;
  }
}

/**
 * How many items a broken block drops. Always consumes exactly two draws from `rng`, so the
 * stream stays aligned for every other system sharing it regardless of the outcome.
 */
export function rollDrop(drop: DropSpec | null, rng: Rng): number {
  if (!drop) return 0;
  const roll = rng.next();
  const lo = Math.max(0, Math.floor(Math.min(drop.min, drop.max)));
  const hi = Math.max(lo, Math.floor(Math.max(drop.min, drop.max)));
  const amount = rng.int(lo, hi);
  return roll < drop.chance ? amount : 0;
}
