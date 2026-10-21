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
  { tier: 3, name: 'equip.ironPickaxe', desc: 'equip.ironPickaxe.desc', power: 2.4, swingInterval: 0.4, headColor: 0x9aa3ad },
  { tier: 4, name: 'equip.glimmerPickaxe', desc: 'equip.glimmerPickaxe.desc', power: 3.4, swingInterval: 0.38, headColor: 0x8fe3ee },
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
  /** Walking speed (m/s): the first person's (game/fp/constants WALK_SPEED, the source). */
  walkSpeed: 3.3,
  /** Ground acceleration (m/s^2) and air control fraction. */
  accel: 38,
  airControl: 0.35,
  jumpVelocity: 7.4,
  gravity: 24,
  maxFallSpeed: 32,
  /** Player collision box, in blocks. */
  width: 0.62,
  height: 1.72,
  /** Eye over the feet (m): game/fp/constants EYE_HEIGHT (the source). */
  eyeHeight: 1.62,
  /** Falls landing faster than this (m/s) hurt; damage scales linearly beyond it. */
  safeFallSpeed: 13,
  fallDamagePerSpeed: 9,
  coyoteTime: 0.12,
  jumpBuffer: 0.14,
  /** Max height auto-stepped while walking into a 1-block ledge. */
  stepHeight: 1.05,
  /** Max distance from the eye to the centre of a block that can be mined: game/fp/constants REACH (the source). */
  reach: 3.5,
  pickupRadius: 2.6,
  /** Health regained per second while inside the camp. */
  campRegen: 12,
  lanternLowFraction: 0.2,
  /** Lantern radius multiplier once the fuel is gone (an ember, never total darkness). */
  emptyLanternFactor: 0.38,
} as const;

/** Gear (final pass W3): worn, it changes how the explorer moves and endures. */
export const GEAR = {
  /** Grip Boots: jump 1.14 -> 2.1 m, safe drop 3.5 -> 7 m (PlayerController). */
  gripBoots: { jumpVelocity: 10.1, safeFallSpeed: 18.3 },
  /** Miner's Coat: 5 -> 7 hearts (Health); the cold's bite is COLD.coatFactor. */
  minersCoat: { maxHealth: 140 },
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
  /** Walking seconds per BFS step: route detours and the stairs make a step 1.35 m of walking, at the walk's 3.3 m/s. */
  secondsPerStep: 1.35 / 3.3,
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
  genVersion: 6,
  /**
   * Older generator versions whose world edits still apply to this one, cell for cell: version 4
   * (finished game, content) only carves the deep beyond the rift into rock nobody could reach and
   * adds ore, caches and secrets, so a version 3 save keeps its mined cells, opened doors and taken
   * props (save/saveData shiftWorldIfNeeded). Version 5 (polish, features/focal) only adds props
   * with new ids and lights in open air, and changes unbreakable kerb stones, so a version 3 or 4
   * save keeps everything too.
   */
  genCompatible: [3, 4] as readonly number[],
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
  autosaveSeconds: 45,
} as const;

/**
 * Glow spores (game/moths.ts, drawn by game/effects/LumenMoths.ts): ambient motes of light that
 * drift in the still air of the caves. No creatures: they carry no gameplay, do not come to the
 * lantern and do not flee; a pick strike only stirs the air round them. (The config keeps its old
 * name, MOTHS, so the simulation and the renderer keep their contracts.)
 */
export const MOTHS = {
  /** Spores simulated at once per quality preset. */
  cap: { high: 40, balanced: 32, battery: 16 },
  /** Only anchors this close to the explorer have spores (m). */
  simRadius: 45,
  /** Drift loop radius range (m) and vertical swing (m). */
  roostRadius: [0.5, 1.8] as readonly [number, number],
  roostVertical: 0.6,
  /** Drift speed range (m/s), and the speed when rising round the black stone. */
  speed: [0.12, 0.3] as readonly [number, number],
  drawnSpeed: 0.8,
  /** Steering: velocity per metre off the target (1/s), and how fast velocity follows (1/s). */
  gain: 1.2,
  steer: 1.6,
  /** A slow wander added to the velocity (m/s). */
  flutter: 0.04,
  /** Spores are not drawn to the lantern (drawnMax 0); kept for the simulation's contract. */
  drawRadius: 0,
  drawnMax: 0,
  drawnMinFuel: 1,
  drawnOrbit: 0.9,
  dropOff: 12,
  /** A pick strike within this radius stirs the air: spores drift outward, then settle back. */
  scatterRadius: 2.5,
  scatterImpulse: 0.6,
  scatterSeconds: [3, 6] as readonly [number, number],
  /** Touching the black stone: spores within this radius rise for spiralSeconds at spiralRise m/s. */
  spiralRadius: 40,
  spiralSeconds: 6,
  spiralRise: 0.6,
  /** A slow pulse of their glow per second (the renderer's flutter; no wings). */
  wingHz: [0.3, 0.7] as readonly [number, number],
  /** Mote size (m) and colour (linear, times intensity). */
  wingspan: 0.07,
  color: [0.78, 0.95, 1.0] as readonly [number, number, number],
  intensity: 1.0,
} as const;

/** Rides (game/ropeRide.ts) and the interaction ranges of the world features. */
export const RIDES = {
  /** Use a hoist or a rope from within this far of its stand (m). */
  standRange: 1.8,
  /** Touch the black stone from within this far of its portal (m). */
  stoneRange: 3.5,
  /** Rune door opening: seconds between rows. */
  doorRowSeconds: 0.3,
  /** Walk-home field: a ride counts as this many steps per second of riding. */
  stepsPerSecond: 4.6 / 1.35,
} as const;
