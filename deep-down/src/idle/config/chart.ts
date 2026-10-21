// The chart's knobs (SPEC §4.3–§4.4, §5.2, §5.3; W1-LEAD §3): drift length K per biome, the chamber HP budget, the
// contents classes and their pity floors, the leash, the explore chamber's contents counts and the ride's pass-by
// glints. BUILD rule 12: these are frozen until the node-paced bot (src/idle/sim/nodeBot.ts) says what to change; then
// only K and CHAMBER_EQ move first (the knobs in order: K per biome, CHAMBER_EQ, the leash base, the side multipliers).

/** Topsoil's six authored drifts (slices): C1 at 5 m … C6 (the Seal hall) at 40 m. Sum = 40 = biomeStart(1). */
export const TOPSOIL_K: readonly number[] = [5, 6, 7, 7, 7, 8];

/** K per biome from Glowroot on (SPEC §4.3, Appendix A); index = biome. Echo strata use the last value. */
export const K_BY_BIOME: readonly number[] = [7, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 30, 30];

/** K of biome k's generated drifts. */
export function kOf(biome: number): number {
  return K_BY_BIOME[Math.min(K_BY_BIOME.length - 1, Math.max(0, biome))];
}

/**
 * The chamber HP budget (SPEC §5.2): CHAMBER_EQ cell-equivalents of the chamber depth's host-rock HP, spread over its
 * strike-type tappables by weight. Range 8–14 (the second knob after K).
 */
export const CHAMBER_EQ = 10;

/** Gold per damage of chamber things, as a multiple of the face's gold per HP (L6, SPEC §5.2). */
export const GOLD_X = {
  vein: 2.5,
  rich: 4,
  gem: 8,
  /** A loose stash brick: a nugget's worth. */
  stash: 4,
  /** A cracked wall, hollow floor or loose brick hiding a cache: host-rock gold. */
  secret: 1,
  skin: 0.6,
  /** A skin pocket's nugget (×4 of the cell's value). */
  nugget: 4,
  /** The Works haul once the leftovers are mined (SPEC §5.3). */
  works: 1,
  /** A ride's pass-by glint by kind. */
  glintOre: 2.5,
  glintRich: 4,
  glintGem: 8,
} as const;

/** HP weight of each strike kind inside the chamber budget (rich ×1.5, gem ×2, as the face's cells). */
export const HP_WEIGHT = { vein: 1, rich: 1.5, gem: 2, stash: 0.8, geode: 1.5 } as const;

/** A cracked secret's HP (cell-equivalents, on top of the budget) and a skin cell's (one cell). */
export const SECRET_HP_EQ = 1.5;
export const SKIN_HP_EQ = 1;

/** Wall skin (SPEC §4.7): cells per chamber when the template gives no count, and the pocket odds. */
export const SKIN = { cells: 40, pocket: 0.12, nugget: 0.8, gem: 0.15, scrap: 0.05 } as const;

/** Gems a gem cluster gives when it breaks, and the chance a gem cluster drops a gem at all. */
export const GEM_CLUSTER = { gems: 1, chance: 1 } as const;

/** One ride glint is worth this many cell-equivalents (each tap mines one; it pays for the HP it really took). */
export const GLINT_HP_EQ = 0.5;

/** Pass-by glints per Way Down kind (W1-LEAD §3 Ride; the cart run is the long one). */
export const RIDE_GLINTS: Readonly<Record<string, number>> = {
  cart: 6,
  stair: 3,
  chute: 3,
  ladder: 2,
  rope: 2,
  cage: 2,
  drop: 0,
  none: 0,
};

/** Seconds each Way Down kind takes in the bot's model (SPEC §3.3: 1.6–2.6 s; the cart run is longer, skippable). */
export const RIDE_SECONDS: Readonly<Record<string, number>> = {
  cart: 7,
  stair: 2.2,
  chute: 2.0,
  ladder: 1.8,
  rope: 1.8,
  cage: 2.6,
  drop: 1.2,
  none: 0,
};

/**
 * The contents classes of ordinary chambers (SPEC §4.4) and their shares. W2 classes (Depot, Lamp Hall) are listed so the
 * table is whole; `CLASS_ON` folds them into Gallery until their wave ships (no placeholder is ever shown).
 */
export const CLASS_SHARES = {
  gallery: 40,
  lode: 12,
  cache: 9,
  reliquary: 6,
  geode: 5,
  depot: 5,
  lampHall: 4,
  haldenCamp: 4,
  collapse: 2,
} as const;

export type OrdinaryClass = keyof typeof CLASS_SHARES;

/** Classes shipped in this build. */
export const CLASS_ON: Readonly<Record<OrdinaryClass, boolean>> = {
  gallery: true,
  lode: true,
  cache: true,
  reliquary: true,
  geode: true,
  depot: false,
  lampHall: false,
  haldenCamp: true,
  collapse: true,
};

/** Pity floors (SPEC §4.4): at most this many chambers apart (counting only ordinary chambers). */
export const PITY_APART = { cache: 6, reliquary: 10, geode: 12, lampHall: 5 } as const;
/** Per biome minimums: reliquaries and Halden notes. */
export const PER_BIOME_MIN = { reliquary: 2, notes: 3 } as const;

/** Secrets (W1-LEAD §3 pacing: about 1 in 2 chambers, never more than 3 apart). */
export const SECRET = { chance: 0.5, apart: 3 } as const;

/** Lamps per chamber (SPEC §4.6): 2–4 cold lamps. */
export const LAMPS = { min: 2, max: 4 } as const;

/** Strike tappables per explore chamber (W1-LEAD §3: 6–14). */
export const STRIKES = { min: 6, max: 14 } as const;

/** Charting a chamber (SPEC §4.6): +20 rank XP, +1 gem the first time ever. */
export const CHARTED = { xp: 20, gems: 1 } as const;

/** XP for a first light, a lamp, a secret (SPEC §5.8). */
export const NODE_XP = { firstLight: 5, lamp: 2, secret: 25 } as const;

/** The leash (SPEC §5.3): L = 0 in Topsoil, 3 from Glowroot; +1 per Survey Lamps level (W2), max 8. */
export const LEASH = { topsoil: 0, base: 3, max: 8 } as const;

/** Works haul: one floating number per cart delivery (s) once Mine Carts are owned (SPEC §5.3). */
export const WORKS_DELIVERY_S = 6;

/** The chest rack holds 10 (chests, relics and keystones); beyond 10 a chest pays its value in gold. */
export const RACK_MAX_ITEMS = 10;

/** Where the generated biome's fixed rooms sit: the Vista at this fraction of the trunk; a landmark fills any gap > 4. */
export const VISTA_AT = 0.35;
export const LANDMARK_GAP = 4;

/** The Root Knot (Glowroot's seal) is shown closed in this build ("Opens in the next build"). */
export const CLOSED_SEALS: readonly number[] = [2];

/** The relic ring (SPEC §5.7): closes over 0.9 s; grade bands by the fraction of the close at release. */
export const RELIC_RING = {
  close: 0.9,
  /** Release within this many seconds past the close still counts as the gold band. */
  grace: 0.15,
  /** No release within this long: Worn. */
  worn: 2,
  /** Lower edges of the bands (fraction of the close): Perfect ≥ 0.92, Pristine ≥ 0.80, Fine ≥ 0.55, else Sound. */
  perfect: 0.92,
  pristine: 0.8,
  fine: 0.55,
  /** Gems by grade: Worn, Sound, Fine, Pristine, Perfect. */
  gems: [1, 2, 5, 8, 12],
} as const;

/** Relic grades, worst first (a better grade replaces a worse one: +1 % per step). */
export const RELIC_GRADES = ['worn', 'sound', 'fine', 'pristine', 'perfect'] as const;
export type RelicGrade = (typeof RELIC_GRADES)[number];
