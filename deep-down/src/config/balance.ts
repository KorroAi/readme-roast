import type { TextKey } from '../i18n';

// Every tunable gameplay number lives here so balancing never requires hunting through systems.

export interface PickaxeDef {
  tier: number;
  name: TextKey;
  desc: TextKey;
  /** Damage dealt per swing, in block hardness units. */
  power: number;
  /** Seconds between swing impacts while mining is held. */
  swingInterval: number;
  /** sRGB head color for the procedural tool mesh. */
  headColor: number;
}

export interface LanternDef {
  tier: number;
  name: TextKey;
  desc: TextKey;
  /** Seconds of burn time at full fuel. */
  fuelSeconds: number;
  /** Radius in blocks where the lantern light reaches zero. */
  radius: number;
  intensity: number;
}

export interface PackDef {
  tier: number;
  name: TextKey;
  desc: TextKey;
  slots: number;
}

export const PICKAXES: readonly PickaxeDef[] = [
  { tier: 1, name: 'equip.rustyPickaxe', desc: 'equip.rustyPickaxe.desc', power: 1, swingInterval: 0.42, headColor: 0x7d6a5a },
  { tier: 2, name: 'equip.copperPickaxe', desc: 'equip.copperPickaxe.desc', power: 1.6, swingInterval: 0.42, headColor: 0xd9864b },
];

export const LANTERNS: readonly LanternDef[] = [
  { tier: 1, name: 'equip.oilLantern', desc: 'equip.oilLantern.desc', fuelSeconds: 300, radius: 11, intensity: 1 },
  { tier: 2, name: 'equip.copperLantern', desc: 'equip.copperLantern.desc', fuelSeconds: 600, radius: 14.5, intensity: 1.15 },
];

export const PACKS: readonly PackDef[] = [
  { tier: 1, name: 'equip.tinyPack', desc: 'equip.tinyPack.desc', slots: 6 },
  { tier: 2, name: 'equip.sturdyPack', desc: 'equip.sturdyPack.desc', slots: 10 },
];

export const pickaxeForTier = (tier: number): PickaxeDef => PICKAXES[Math.max(0, Math.min(PICKAXES.length - 1, tier - 1))];
export const lanternForTier = (tier: number): LanternDef => LANTERNS[Math.max(0, Math.min(LANTERNS.length - 1, tier - 1))];
export const packForTier = (tier: number): PackDef => PACKS[Math.max(0, Math.min(PACKS.length - 1, tier - 1))];

export const PLAYER = {
  maxHealth: 100,
  walkSpeed: 4.6,
  /** Ground acceleration (m/s^2) and air control fraction. */
  accel: 38,
  airControl: 0.35,
  jumpVelocity: 7.4,
  gravity: 24,
  maxFallSpeed: 32,
  /** Player collision box, in blocks. */
  width: 0.62,
  height: 1.72,
  eyeHeight: 1.5,
  /** Falls landing faster than this (m/s) hurt; damage scales linearly beyond it. */
  safeFallSpeed: 13,
  fallDamagePerSpeed: 9,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  /** Max height auto-stepped while walking into a 1-block ledge. */
  stepHeight: 1.05,
  /** Max distance from the hand to the center of a block that can be mined. */
  reach: 4.6,
  pickupRadius: 2.6,
  /** Health regained per second while inside the camp. */
  campRegen: 12,
  lanternLowFraction: 0.2,
  /** Lantern radius multiplier once the fuel is gone (an ember, never total darkness). */
  emptyLanternFactor: 0.38,
} as const;

export const WORLD = {
  /** World volume in blocks (X, Y, Z). Y is up. */
  sizeX: 160,
  sizeY: 128,
  sizeZ: 160,
  chunkSize: 16,
  /** Displayed depth in meters = depthOffset - y. */
  depthOffset: 150,
  seed: 0xdeedd0,
} as const;

export const LIGHT = {
  /** Fraction of light kept per block step; keeps hue constant as light fades. */
  falloffPerStep: 0.85,
  /** Constant subtracted per step so the exponential tail ends (sets the maximum reach). */
  tailCut: 2,
  maxLevel: 255,
} as const;

export const SAVE = {
  version: 1,
  autosaveSeconds: 45,
} as const;
