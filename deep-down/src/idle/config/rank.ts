// Rank (SPEC §7.7; never resets): XP from everything, need(r) = 120 · r^0.78 XP from rank r to r + 1, so a rank-up
// is always "soon" (0.9 min at the start, about 18 min at rank 100). Rewards: +0.5 % to all per rank, 2–10 gems, a
// Copper-floor chest every 5 ranks, a cosmetic every 10 and a Might title every 25 ranks.

/** XP per source (SPEC §7.7). Cells count only below the lifetime record (CRITIQUE MUST 5). */
export const XP = {
  cell: 1,
  ore: 3,
  /** Chests by tier wood … lintel. */
  chest: [20, 40, 80, 160, 320] as readonly number[],
  purchase: 1,
  star: 10,
  pickTier: 50,
  firstBiome: 100,
  gate: 20,
  firstSeal: 150,
  feat: 30,
  event: 15,
  contract: 40,
  creature: 15,
  find: 25,
} as const;

/** XP from rank r to r + 1. */
export function rankNeed(r: number): number {
  return Math.round(120 * Math.pow(Math.max(1, r), 0.78));
}

/** Rank reward gems: 2 + floor(rank / 5), max 10. */
export function rankGems(r: number): number {
  return Math.min(10, 2 + Math.floor(r / 5));
}

/** Power per rank above 1 (+0.5 % to all). */
export const RANK_POWER = 0.005;

/** The Might titles, one every 25 ranks (then Lanternlord II, III…). i18n `idle.title.<id>`. */
export const TITLES = [
  'scratcher', 'digger', 'delver', 'tunneler', 'excavator', 'deepwright', 'stonebreaker', 'quakemaker', 'starbreaker',
  'voidwalker', 'lintelbearer', 'lanternlord',
] as const;

/** The title at rank r: index into TITLES, and its numeral past the last (Lanternlord II = 2). */
export function titleAt(r: number): { id: string; n: number } {
  const i = Math.floor(Math.max(1, r) / 25);
  if (i < TITLES.length) return { id: TITLES[i], n: 0 };
  return { id: TITLES[TITLES.length - 1], n: i - TITLES.length + 2 };
}

/** Cosmetics granted every 10 ranks (ids from the cosmetics list, cycling). */
export const RANK_COSMETICS = ['trail.ember', 'flame.amber', 'frame.brass', 'skin.copper', 'trail.rune', 'flame.cyan', 'frame.rune', 'skin.crystal', 'trail.star', 'flame.violet'] as const;
