// Contracts (SPEC §7.4): always 3 on the Board, each generated so it takes 90–240 s at the player's live rates; one of
// the three points at a mechanic not used in the last 15 minutes (guidance in disguise). Rewards: 3–8 gems and 2 min
// of income; every 5th is a Grand Contract (a Crystal-floor chest, 15 gems and a Time Crystal). A finished contract
// is replaced at once; a reroll costs 2 gems. i18n `idle.contract.<tpl>` with {n} (and {ore}/{biome} where used).

export type ContractTpl =
  | 'cells' | 'ores' | 'depth' | 'catch' | 'chests' | 'crits' | 'combo' | 'levels' | 'skills' | 'seal' | 'lamps'
  | 'find' | 'gold' | 'perfect' | 'planted';

export interface ContractDef {
  tpl: ContractTpl;
  /** The mechanic it exercises (for the "not used in 15 minutes" rule). */
  mechanic: string;
  /** Depth (rows reached in the run) from which it is offered. */
  unlock: number;
  /** Rounding of the target (to a nice number). */
  round: number;
  /** Fixed targets for things that cannot be rated (a seal, lamps): the target is this, ETA from the cadence. */
  fixed?: number;
}

export const CONTRACTS: readonly ContractDef[] = [
  { tpl: 'cells', mechanic: 'tap', unlock: 0, round: 10 },
  { tpl: 'ores', mechanic: 'ore', unlock: 0, round: 5 },
  { tpl: 'depth', mechanic: 'dig', unlock: 0, round: 5 },
  { tpl: 'catch', mechanic: 'event', unlock: 40, round: 1 },
  { tpl: 'chests', mechanic: 'chest', unlock: 0, round: 1 },
  { tpl: 'crits', mechanic: 'crit', unlock: 0, round: 5 },
  { tpl: 'combo', mechanic: 'combo', unlock: 0, round: 5 },
  { tpl: 'levels', mechanic: 'buy', unlock: 0, round: 5 },
  { tpl: 'skills', mechanic: 'skill', unlock: 30, round: 1 },
  { tpl: 'seal', mechanic: 'seal', unlock: 40, round: 1, fixed: 1 },
  { tpl: 'lamps', mechanic: 'lamp', unlock: 0, round: 1, fixed: 3 },
  { tpl: 'find', mechanic: 'find', unlock: 120, round: 1, fixed: 1 },
  { tpl: 'gold', mechanic: 'gold', unlock: 0, round: 1 },
  { tpl: 'perfect', mechanic: 'strike', unlock: 120, round: 1, fixed: 1 },
  { tpl: 'planted', mechanic: 'lantern', unlock: 0, round: 1, fixed: 1 },
];

export const CONTRACT = {
  slots: 3,
  /** The ETA window a generated contract aims at (s). */
  etaMin: 90,
  etaMax: 240,
  gems: [3, 8] as const,
  goldSeconds: 120,
  grandEvery: 5,
  grandGems: 15,
  rerollGems: 2,
  /** A mechanic is "unused" after this long (s). */
  unused: 15 * 60,
} as const;

/** The 7-day Lantern Calendar (SPEC §7.4): a missed day pauses it; it never resets. Codes: 'chest:<tier>', 'gems:<n>', 'rerolls:<n>', 'oil'. */
export const CALENDAR = ['chest:1', 'gems:30', 'chest:2', 'rerolls:2', 'oil', 'gems:60', 'chest:3'] as const;
/** The Daily Lantern Chest's floor (Crystal) and the depth of the first, free one in session 1. */
export const DAILY = { floor: 2, firstAt: 75 } as const;
