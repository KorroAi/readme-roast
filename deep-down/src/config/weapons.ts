import type { TextKey } from '../i18n';
import type { ItemId } from './items';

/**
 * Weapons (round 2, WORLD seam; ROUND2 §0.10). The pickaxe can always strike a monster, weakly.
 * After the first iron the Forge offers the Iron Machete, the Glimmer Spear and the Flare Sling
 * (config/recipes: nodes 'machete', 'spear', 'sling', built once, kept for good) and Flash Charges
 * (node 'flashCharges': a repeatable craft that puts charges in the pack).
 *
 * Input (FP): tapping a monster attacks it with bestWeapon(owned, distance); a tap on ore always
 * uses the pick, so there is never a mode switch. Ranged fire aims at the tapped monster.
 * Damage is in mob hit points (MOBS sets the hp: about crawler 3, wisp 4, gnasher 8, stalker 14,
 * the Sentinel's core 24), dealt through MobSystem.hit(mob, damage).
 */
export type WeaponId = 'pick' | 'machete' | 'spear' | 'sling' | 'flash';

export interface Weapon {
  id: WeaponId;
  name: TextKey;
  /** Hit points per strike (or per shard; the flash: to every mob in `area`). */
  damage: number;
  /** Metres from the eye: melee reach, or the sling's range. */
  reach: number;
  /** Seconds between two attacks (a held tap repeats at this rate). */
  rate: number;
  /** Seconds from the tap to the impact (the wind-up the viewmodel plays). */
  windup: number;
  /** Fires a projectile instead of striking in reach. */
  ranged?: boolean;
  projectile?: {
    /** m/s, and the drop (m/s²) of the shard's arc. */
    speed: number;
    gravity: number;
    /** A light shard: its glow (0..1 of a lamp) while it flies and where it lands, for `lightSeconds`. */
    light: number;
    lightSeconds: number;
  };
  /** Light scares crawlers: seconds they flee after a hit (or within the flash's area). */
  scare?: number;
  /** The flash only: radius (m) of the burst round the explorer. */
  area?: number;
  /** Consumes one of this item per use (Flash Charges). */
  consumes?: ItemId;
  /** Hit stop on a monster hit (s): ROUND2 §0.10, 40 ms. */
  hitStop: number;
}

export const WEAPONS: Record<WeaponId, Weapon> = {
  pick: { id: 'pick', name: 'weapon.pick', damage: 1, reach: 3.2, rate: 0.55, windup: 0.16, hitStop: 0.04 },
  machete: { id: 'machete', name: 'weapon.machete', damage: 2, reach: 2.6, rate: 0.32, windup: 0.1, hitStop: 0.04 },
  spear: { id: 'spear', name: 'weapon.spear', damage: 5, reach: 3.0, rate: 0.7, windup: 0.22, hitStop: 0.04 },
  sling: {
    id: 'sling', name: 'weapon.sling', damage: 1.5, reach: 16, rate: 0.85, windup: 0.18, ranged: true,
    projectile: { speed: 22, gravity: 6, light: 0.6, lightSeconds: 2.5 }, scare: 3, hitStop: 0.04,
  },
  flash: { id: 'flash', name: 'weapon.flash', damage: 6, reach: 6, rate: 1.2, windup: 0.25, area: 6, scare: 6, consumes: 'flashCharge', hitStop: 0.04 },
};

/** The Forge node that makes each weapon (config/recipes). The pick needs none; the flash is crafted as charges. */
export const WEAPON_NODE = { machete: 'machete', spear: 'spear', sling: 'sling' } as const satisfies Partial<Record<WeaponId, string>>;

/** Flash Charges made per craft of the 'flashCharges' node. */
export const FLASH_CHARGES_PER_CRAFT = 2;

/** Strike weapons in order of preference when several reach (best damage per second first). */
const MELEE: readonly WeaponId[] = ['spear', 'machete', 'pick'];

/** Damage per second of a weapon (for choosing and for the tree's stats). */
export function dps(w: Weapon): number {
  return w.damage / Math.max(0.05, w.rate);
}

/**
 * The weapon a tap on a monster uses: the best melee weapon owned whose reach covers `distance`
 * (metres from the eye to the monster's nearest point); else the sling if owned and in range; else
 * the best melee weapon owned (the tap walks into reach first). The pick is always owned. Flash
 * Charges are never chosen here: they are their own action (FP's button), see `WEAPONS.flash`.
 * @param owned weapon ids or node ids owned (Progression.ownedWeapons()), e.g. ['machete', 'sling'].
 */
export function bestWeapon(owned: Iterable<string>, distance = 0): Weapon {
  const have = new Set<string>(owned);
  have.add('pick');
  const melee = MELEE.filter((id) => have.has(id)).map((id) => WEAPONS[id]);
  // In reach, the strongest per second; spear and machete are close, so prefer the machete's
  // speed against small fast things only when the spear is not owned (MELEE order).
  const inReach = melee.filter((w) => w.reach >= distance).sort((a, b) => dps(b) - dps(a));
  if (inReach.length > 0) return inReach[0];
  if (have.has('sling') && distance <= WEAPONS.sling.reach) return WEAPONS.sling;
  return melee.sort((a, b) => dps(b) - dps(a))[0] ?? WEAPONS.pick;
}

/** Every weapon owned, the pick first (the journal, debug). */
export function ownedWeapons(owned: Iterable<string>): Weapon[] {
  const have = new Set<string>(owned);
  return (['pick', 'machete', 'spear', 'sling'] as const).filter((id) => id === 'pick' || have.has(id)).map((id) => WEAPONS[id]);
}
