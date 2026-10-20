// Prestige layer 1, Rekindle → Embers (SPEC §5.9): EmbersTotal(R) = floor(25 × 2^((R − 600) / 200)), R the deepest
// point since the last Weave ("every new 200 m of record doubles your Embers"). A Rekindle pays the total minus the
// Embers owned. Each Ember is +10 % damage (additive); Embers are never spent. Perks unlock on the highest total ever
// held. Weave (Threads) and Breach (Sigils) are W3's; their state fields exist (meta.threads, loom, sigils).

/** The Ember Shrine: Rekindle unlocks at this depth (rows). */
export const REKINDLE_AT = 600;
/** EmbersTotal(R) = floor(base × 2^((R − at) / per)). */
export const EMBERS = { base: 25, at: 600, per: 200, perEmber: 0.1 } as const;

/** log10 of EmbersTotal(R) before the floor (exact at any depth). */
export function embersTotalLog10(record: number): number {
  return Math.log10(EMBERS.base) + ((record - EMBERS.at) / EMBERS.per) * Math.LOG10E * Math.LN2;
}

/**
 * The recommend rule (SPEC §5.9): gain ≥ owned and rows slower than 8 s, or gain ≥ 10 × owned; or walled (rows slower
 * than 45 s, run > 10 min) and gain ≥ 25 % of owned.
 */
export const RECOMMEND = { slowRow: 8, gainX: 10, walledRow: 45, walledRun: 600, walledFrac: 0.25 } as const;

/** Ember perks: thresholds on embersMax (the highest total ever held). i18n `idle.perk.<id>`. */
export const PERKS: ReadonlyArray<{ id: string; at: number }> = [
  { id: 'blueprints', at: 1 },
  { id: 'startLevels', at: 10 },
  { id: 'offline6', at: 25 },
  { id: 'autoPick', at: 50 },
  { id: 'headStart10', at: 100 },
  { id: 'offline12', at: 250 },
  { id: 'autoCrew', at: 500 },
  { id: 'autoSkills', at: 1000 },
  { id: 'headStart20', at: 1e4 },
  { id: 'offline100', at: 1e5 },
  { id: 'autoGear', at: 1e6 },
  { id: 'headStart30', at: 1e8 },
];

/** The 10-Ember perk: each run starts with Shovel Hand 10 and Pick 10. */
export const START_LEVELS = { pick: 10, shovel: 10 } as const;
/** A planted lantern tapped as you pass it: +2 % damage for the run (stacking). */
export const PLANTED_BONUS = 0.02;
/** The REKINDLE button's hold (s) — the UI's; the model only needs the call. */
export const REKINDLE_HOLD = 0.6;
/** The par run (CRITIQUE MUST 6): sampled every 30 s; a green split must beat par by ≥ 5 % and pays 5 gems. */
export const PAR = { every: 30, greenBy: 0.05, gems: 5, maxSecs: 3600 } as const;
