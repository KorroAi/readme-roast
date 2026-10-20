// Engine constants the descent still reads (light, moths, the save format, the foreman's tool head colours). Every
// economy number lives in src/idle/config/*.ts (the idle game is pure and unit-tested there).

/** The foreman's tool head colour per tier (sRGB), for the procedural tool mesh. */
export interface PickaxeDef {
  tier: number;
  headColor: number;
}

export const PICKAXES: readonly PickaxeDef[] = [
  { tier: 1, headColor: 0x7d6a5a },
  { tier: 2, headColor: 0xd9864b },
  { tier: 3, headColor: 0x9aa3ad },
  { tier: 4, headColor: 0x8fe3ee },
];

export const pickaxeForTier = (tier: number): PickaxeDef => PICKAXES[Math.max(0, Math.min(PICKAXES.length - 1, tier - 1))];

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
