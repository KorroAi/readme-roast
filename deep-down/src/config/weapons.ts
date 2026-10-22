import type { TextKey } from '../i18n';
import type { ItemId } from './items';

/**
 * Weapons (round 3, LOOP; BRIEF §0.4): three per tier band, melee (machete → sword → great axe),
 * reach (spear → crystal spear → sun lance) and ranged (sling → crossbow → ember crossbow), plus the
 * pick (always there, weak) and two bombs (the flash and the blast bomb, thrown from the hotbar).
 * Each weapon is an item of the same id (config/items, equip 'weapon'), made at the Forge (the sling
 * at the Workbench) and kept for good.
 *
 * Damage is in mob hit points, dealt through MobSystem.hit. Best damage per second by stratum
 * (bestiary bonus ×1.2 not counted): I 6, II 10.7, III 13.7, IV 13.7 (+ bombs), V 23, VI 27.5.
 */
export type WeaponId =
  | 'pick'
  | 'machete'
  | 'spear'
  | 'sling'
  | 'sword'
  | 'crystalSpear'
  | 'crossbow'
  | 'greatAxe'
  | 'sunLance'
  | 'emberCrossbow'
  | 'flash'
  | 'bomb';

export interface Weapon {
  id: WeaponId;
  name: TextKey;
  /** Hit points per strike (or per bolt; a bomb: to every mob in `area`). */
  damage: number;
  /** Metres from the eye: melee reach, or a ranged weapon's range. */
  reach: number;
  /** Seconds between two attacks (a held Action repeats at this rate). */
  rate: number;
  /** Seconds from the press to the impact (the wind-up the viewmodel plays). */
  windup: number;
  /** Fires a projectile instead of striking in reach. */
  ranged?: boolean;
  projectile?: {
    /** m/s, and the drop (m/s²) of the arc. */
    speed: number;
    gravity: number;
    /** A light shard: its glow (0..1 of a lamp) while it flies and where it lands, for `lightSeconds`. */
    light: number;
    lightSeconds: number;
  };
  /** Light scares crawlers: seconds they flee after a hit (or within a flash's area). */
  scare?: number;
  /** Bombs: radius (m) of the burst. */
  area?: number;
  /** Consumes one of this item per use (bombs). */
  consumes?: ItemId;
  /** Knockback (m/s) on a hit (MOBS applies it; the snappy feel of §0.6). */
  knockback?: number;
  /** Hit stop on a monster hit (s). */
  hitStop: number;
}

const w = (x: Weapon): Weapon => x;

export const WEAPONS: Record<WeaponId, Weapon> = {
  pick: w({ id: 'pick', name: 'weapon.pick', damage: 1.5, reach: 3.2, rate: 0.5, windup: 0.14, knockback: 2, hitStop: 0.04 }),
  machete: w({ id: 'machete', name: 'item.machete', damage: 2.4, reach: 2.6, rate: 0.4, windup: 0.09, knockback: 3, hitStop: 0.04 }),
  spear: w({ id: 'spear', name: 'item.spear', damage: 4.2, reach: 3.0, rate: 0.7, windup: 0.2, knockback: 4, hitStop: 0.05 }),
  sling: w({
    id: 'sling', name: 'item.sling', damage: 2.5, reach: 16, rate: 0.6, windup: 0.16, ranged: true,
    projectile: { speed: 22, gravity: 6, light: 0.6, lightSeconds: 2.5 }, scare: 3, knockback: 2, hitStop: 0.04,
  }),
  sword: w({ id: 'sword', name: 'item.sword', damage: 5.2, reach: 2.8, rate: 0.38, windup: 0.1, knockback: 4, hitStop: 0.05 }),
  crystalSpear: w({ id: 'crystalSpear', name: 'item.crystalSpear', damage: 8, reach: 3.2, rate: 0.75, windup: 0.2, scare: 1, knockback: 5, hitStop: 0.05 }),
  crossbow: w({
    id: 'crossbow', name: 'item.crossbow', damage: 9, reach: 22, rate: 0.9, windup: 0.2, ranged: true,
    projectile: { speed: 34, gravity: 3, light: 0.3, lightSeconds: 1.5 }, knockback: 4, hitStop: 0.05,
  }),
  greatAxe: w({ id: 'greatAxe', name: 'item.greatAxe', damage: 14, reach: 3.0, rate: 0.6, windup: 0.22, knockback: 7, hitStop: 0.07 }),
  sunLance: w({ id: 'sunLance', name: 'item.sunLance', damage: 16, reach: 3.5, rate: 0.7, windup: 0.22, scare: 2, knockback: 6, hitStop: 0.06 }),
  emberCrossbow: w({
    id: 'emberCrossbow', name: 'item.emberCrossbow', damage: 22, reach: 26, rate: 0.8, windup: 0.2, ranged: true,
    projectile: { speed: 40, gravity: 2, light: 0.8, lightSeconds: 2 }, knockback: 5, hitStop: 0.06,
  }),
  flash: w({ id: 'flash', name: 'weapon.flash', damage: 6, reach: 6, rate: 1.2, windup: 0.25, area: 6, scare: 6, consumes: 'flashCharge', hitStop: 0.04 }),
  bomb: w({ id: 'bomb', name: 'item.blastBomb', damage: 18, reach: 14, rate: 1.0, windup: 0.3, area: 4, consumes: 'blastBomb', knockback: 8, hitStop: 0.06 }),
};

/** Strike and ranged weapons (bombs are thrown from the hotbar). */
const MELEE: readonly WeaponId[] = ['pick', 'machete', 'spear', 'sword', 'crystalSpear', 'greatAxe', 'sunLance'];
const RANGED: readonly WeaponId[] = ['sling', 'crossbow', 'emberCrossbow'];

/** 1.x: the Forge node that made each weapon (legacy tree). */
export const WEAPON_NODE = { machete: 'machete', spear: 'spear', sling: 'sling' } as const satisfies Partial<Record<WeaponId, string>>;

/** Flash Charges made per craft (1.x node; the round-3 recipe makes 2 too). */
export const FLASH_CHARGES_PER_CRAFT = 2;

export function isWeaponId(x: unknown): x is WeaponId {
  return typeof x === 'string' && x in WEAPONS;
}

/** Damage per second of a weapon. */
export function dps(x: Weapon): number {
  return x.damage / Math.max(0.05, x.rate);
}

/**
 * The weapon an attack on a monster uses: the best melee weapon owned whose reach covers `distance`
 * (metres from the eye to the monster); else the best ranged weapon owned in range; else the best
 * melee weapon owned (the explorer closes in). The pick is always owned. When `equipped` is given
 * (the hotbar's weapon) it is preferred whenever it reaches.
 */
export function bestWeapon(owned: Iterable<string>, distance = 0, equipped?: string | null): Weapon {
  const have = new Set<string>(owned);
  have.add('pick');
  if (equipped && isWeaponId(equipped) && have.has(equipped) && WEAPONS[equipped].reach >= distance && !WEAPONS[equipped].consumes) return WEAPONS[equipped];
  const melee = MELEE.filter((id) => have.has(id)).map((id) => WEAPONS[id]);
  const inReach = melee.filter((x) => x.reach >= distance).sort((a, b) => dps(b) - dps(a));
  if (inReach.length > 0) return inReach[0];
  const ranged = RANGED.filter((id) => have.has(id)).map((id) => WEAPONS[id]).filter((x) => x.reach >= distance).sort((a, b) => dps(b) - dps(a));
  if (ranged.length > 0) return ranged[0];
  return melee.sort((a, b) => dps(b) - dps(a))[0] ?? WEAPONS.pick;
}

/** Every weapon owned, the pick first (the bag, debug). */
export function ownedWeapons(owned: Iterable<string>): Weapon[] {
  const have = new Set<string>(owned);
  return [...MELEE, ...RANGED].filter((id) => id === 'pick' || have.has(id)).map((id) => WEAPONS[id]);
}
