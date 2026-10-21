// Engine constants the descent still reads (light, the save format, the foreman's tool head colours). Every
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
  /** Save v4: the first-person node crawl (hybrid SPEC §10); v3 migrates (SaveSystem MIGRATIONS[3]). */
  version: 4,
  /** SPEC §12.2: autosave every 30 s (and on pause, hide, purchases, ceremonies). */
  autosaveSeconds: 30,
} as const;

