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
  /** Light radius multiplier once the fuel is gone (an ember, never total darkness). */
  ember: number;
  /** The dark's cold cannot reach the explorer while carrying this lantern. */
  noCold: boolean;
}

export interface PackDef {
  tier: number;
  name: TextKey;
  desc: TextKey;
  slots: number;
  /** The last `pouch` slots are the Sealed Pouch: what is in them survives a black-out. */
  pouch: number;
}

export const PICKAXES: readonly PickaxeDef[] = [
  { tier: 1, name: 'equip.rustyPickaxe', desc: 'equip.rustyPickaxe.desc', power: 1, swingInterval: 0.42, headColor: 0x7d6a5a },
  { tier: 2, name: 'equip.copperPickaxe', desc: 'equip.copperPickaxe.desc', power: 1.6, swingInterval: 0.42, headColor: 0xd9864b },
];

export const LANTERNS: readonly LanternDef[] = [
  { tier: 1, name: 'equip.oilLantern', desc: 'equip.oilLantern.desc', fuelSeconds: 300, radius: 11, intensity: 1, ember: 0.38, noCold: false },
  { tier: 2, name: 'equip.copperLantern', desc: 'equip.copperLantern.desc', fuelSeconds: 600, radius: 14.5, intensity: 1.15, ember: 0.38, noCold: false },
  { tier: 3, name: 'equip.attunedLantern', desc: 'equip.attunedLantern.desc', fuelSeconds: 900, radius: 16, intensity: 1.2, ember: 0.7, noCold: true },
];

/** Pack tiers: Tiny 6, Sturdy 8, Expedition 10 slots (its last 2 are the Sealed Pouch). */
export const PACKS: readonly PackDef[] = [
  { tier: 1, name: 'equip.tinyPack', desc: 'equip.tinyPack.desc', slots: 6, pouch: 0 },
  { tier: 2, name: 'equip.sturdyPack', desc: 'equip.sturdyPack.desc', slots: 8, pouch: 0 },
  { tier: 3, name: 'equip.expeditionPack', desc: 'equip.expeditionPack.desc', slots: 10, pouch: 2 },
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

/** The dark is cold: once the flame dies and the grace runs out, it hurts (gameplay/Cold). */
export const COLD = {
  /** Seconds after the flame dies before the cold starts to bite. */
  graceSeconds: 8,
  /** Damage per interval (applied continuously: 10 hp per 5 s is 2 hp/s). */
  damage: 10,
  intervalSeconds: 5,
  /** Damage multiplier with the Miner's Coat. */
  coatFactor: 0.5,
} as const;

/** Walk-home field, turn-back mark and compass (world/analysis/homeField, game/Progression). */
export const HOME = {
  /** Walking seconds per BFS step: route detours and the stairs make a step 1.35 m of walking. */
  secondsPerStep: 1.35 / 4.6,
  /** The turn-back mark sits at walkHome x turnBackFactor + turnBackMarginS of fuel. */
  turnBackFactor: 1.25,
  turnBackMarginS: 10,
  /** At walkHome x criticalFactor of fuel the gauge turns critical. */
  criticalFactor: 1,
  /** Recompute the field after this many mined blocks (and on leaving camp). */
  recomputeBlocks: 25,
  /** The compass aims at the cell this many steps down the field's steepest descent. */
  lookAheadSteps: 6,
  /** Safe drop height (blocks) for the walking graph, as in reachability. */
  maxDrop: 3,
} as const;

/** The pack left behind on a black-out (gameplay/Expedition, game/Progression). */
export const CACHE = {
  /** Walk this close (metres) and the pack's contents fly back. */
  pickupRadius: 1.6,
  /** The cache lands on the last cell the explorer stood on for at least this long. */
  groundedSeconds: 0.3,
} as const;

/** Loose drops nobody collects fade away, dimming over their last seconds. */
export const DROPS = {
  lifeSeconds: 90,
  dimSeconds: 10,
} as const;

/** Trips and records (gameplay/Records). */
export const EXPEDITION = {
  /** A depth record is announced in steps of this many metres. */
  depthRecordStep: 10,
  /** The Expedition Report shows after a trip at least this long (or one that banked or found something). */
  reportMinSeconds: 45,
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
  /**
   * World generator version, saved with every game. Bump it whenever the generated world changes
   * (tests/unit/genVersion.test.ts pins the fingerprint): a save from another version keeps
   * everything but its world edits, and wakes the explorer at camp.
   */
  genVersion: 1,
} as const;

export const LIGHT = {
  /** Fraction of light kept per block step; keeps hue constant as light fades. */
  falloffPerStep: 0.85,
  /** Constant subtracted per step so the exponential tail ends (sets the maximum reach). */
  tailCut: 2,
  maxLevel: 255,
} as const;

export const SAVE = {
  version: 2,
  autosaveSeconds: 45,
} as const;
