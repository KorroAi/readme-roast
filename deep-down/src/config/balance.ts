import type { TextKey } from '../i18n';

// Engine constants the descent still reads (light, moths, the save format, the foreman's tool and lantern
// looks). Every economy number lives in src/idle/config/*.ts (the idle game is pure and unit-tested there).

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

export const PICKAXES: readonly PickaxeDef[] = [
  { tier: 1, name: 'equip.rustyPickaxe', desc: 'equip.rustyPickaxe.desc', power: 1, swingInterval: 0.42, headColor: 0x7d6a5a },
  { tier: 2, name: 'equip.copperPickaxe', desc: 'equip.copperPickaxe.desc', power: 1.6, swingInterval: 0.42, headColor: 0xd9864b },
  { tier: 3, name: 'equip.ironPickaxe', desc: 'equip.ironPickaxe.desc', power: 2.4, swingInterval: 0.4, headColor: 0x9aa3ad },
  { tier: 4, name: 'equip.glimmerPickaxe', desc: 'equip.glimmerPickaxe.desc', power: 3.4, swingInterval: 0.38, headColor: 0x8fe3ee },
];

export const LANTERNS: readonly LanternDef[] = [
  { tier: 1, name: 'equip.oilLantern', desc: 'equip.oilLantern.desc', fuelSeconds: 300, radius: 11, intensity: 1, ember: 0.38, noCold: false },
  { tier: 2, name: 'equip.copperLantern', desc: 'equip.copperLantern.desc', fuelSeconds: 600, radius: 14.5, intensity: 1.15, ember: 0.38, noCold: false },
  { tier: 3, name: 'equip.attunedLantern', desc: 'equip.attunedLantern.desc', fuelSeconds: 900, radius: 16, intensity: 1.2, ember: 0.7, noCold: true },
];

export const pickaxeForTier = (tier: number): PickaxeDef => PICKAXES[Math.max(0, Math.min(PICKAXES.length - 1, tier - 1))];
export const lanternForTier = (tier: number): LanternDef => LANTERNS[Math.max(0, Math.min(LANTERNS.length - 1, tier - 1))];

/** Kept until src/game/Drops.ts is deleted (C, W1). */
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

/** Loose drops nobody collects fade away, dimming over their last seconds. */
export const DROPS = {
  lifeSeconds: 90,
  dimSeconds: 10,
} as const;

export const LIGHT = {
  /** Fraction of light kept per block step; keeps hue constant as light fades. */
  falloffPerStep: 0.85,
  /** Constant subtracted per step so the exponential tail ends (sets the maximum reach). */
  tailCut: 2,
  maxLevel: 255,
} as const;

export const SAVE = {
  version: 3,
  /** SPEC §12.2: autosave every 30 s (and on pause, hide, purchases, ceremonies). */
  autosaveSeconds: 30,
} as const;

/** Lumen moths (game/moths.ts, game/effects/LumenMoths.ts). */
export const MOTHS = {
  /** Moths simulated at once per quality preset. */
  cap: { high: 40, balanced: 32, battery: 16 },
  /** Only anchors this close to the explorer have moths (m). */
  simRadius: 45,
  /** Roost loop radius range (m) and vertical swing (m). */
  roostRadius: [0.3, 1.1] as readonly [number, number],
  roostVertical: 0.42,
  /** Cruise speed range (m/s) on the roost loop, and when drawn to the lantern or rising. */
  speed: [0.6, 1.3] as readonly [number, number],
  drawnSpeed: 2.8,
  /** Steering: velocity per metre off the target (1/s), and how fast velocity follows (1/s). */
  gain: 2.4,
  steer: 5,
  /** Wing-beat flutter added to the velocity (m/s). */
  flutter: 0.16,
  /** A lit lantern with at least this much fuel within drawRadius pulls up to drawnMax moths. */
  drawRadius: 7,
  drawnMax: 8,
  drawnMinFuel: 0.2,
  drawnOrbit: 0.9,
  /** Drawn moths go home once the lantern is this far from their roost (m). */
  dropOff: 12,
  /** A mining hit within this radius throws moths outward; they come back after a few seconds. */
  scatterRadius: 4,
  scatterImpulse: 3,
  scatterSeconds: [2, 4] as readonly [number, number],
  /** Touching the black stone: moths within this radius rise for spiralSeconds at spiralRise m/s. */
  spiralRadius: 40,
  spiralSeconds: 6,
  spiralRise: 0.8,
  /** Wing beats per second (drawn as a flutter, not counted). */
  wingHz: [7, 11] as readonly [number, number],
  /** Wingspan (m) and colour (linear, times intensity). */
  wingspan: 0.15,
  color: [0.78, 0.95, 1.0] as readonly [number, number, number],
  intensity: 1.15,
} as const;
