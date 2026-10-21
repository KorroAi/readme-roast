import {
  LANTERNS,
  PACKS,
  PICKAXES,
  lanternForTier,
  packForTier,
  pickaxeForTier,
  type LanternDef,
  type PackDef,
  type PickaxeDef,
} from '../config/balance';
import type { EquipmentSlot } from '../config/recipes';

export type EquipmentTiers = Record<EquipmentSlot, number>;

const MAX_TIER: EquipmentTiers = { pickaxe: PICKAXES.length, lantern: LANTERNS.length, pack: PACKS.length };
const SLOTS: readonly EquipmentSlot[] = ['pickaxe', 'lantern', 'pack'];

/** Equipped tool tiers. Upgrades are permanent: tiers never go down. */
export class Equipment {
  private readonly t: EquipmentTiers = { pickaxe: 1, lantern: 1, pack: 1 };

  /** Missing or invalid tiers fall back to 1; tiers beyond the defined tools are clamped. */
  constructor(tiers?: Partial<EquipmentTiers>) {
    for (const slot of SLOTS) this.t[slot] = clampTier(slot, tiers?.[slot]);
  }

  get tiers(): Readonly<EquipmentTiers> {
    return this.t;
  }

  tier(slot: EquipmentSlot): number {
    return this.t[slot];
  }

  pickaxe(): PickaxeDef {
    return pickaxeForTier(this.t.pickaxe);
  }

  lantern(): LanternDef {
    return lanternForTier(this.t.lantern);
  }

  pack(): PackDef {
    return packForTier(this.t.pack);
  }

  /** Raise `slot` to `tier`. @returns true if the tier changed (never downgrades). */
  upgrade(slot: EquipmentSlot, tier: number): boolean {
    const next = clampTier(slot, tier);
    if (next <= this.t[slot]) return false;
    this.t[slot] = next;
    return true;
  }

  toJSON(): EquipmentTiers {
    return { ...this.t };
  }
}

function clampTier(slot: EquipmentSlot, tier: unknown): number {
  if (typeof tier !== 'number' || !Number.isFinite(tier)) return 1;
  return Math.max(1, Math.min(MAX_TIER[slot], Math.floor(tier)));
}
