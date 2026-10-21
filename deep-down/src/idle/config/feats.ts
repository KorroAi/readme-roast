// Feats (hybrid SPEC §5.8): 21 families with tiers I–X, then endless (each threshold ×3, or ×10 for counting families).
// Every tier: +1 Mark (+1 % damage and gold), 5 × min(tier, 10) gems and 30 XP. Tier V: a cosmetic. Tier X: the
// family's permanent perk. 12 secret Feats ("???" with a one-line hint): 5 Marks and 25 gems each.
// i18n: `idle.feat.<id>` (name), `idle.feat.<id>.desc` (counter line), `idle.feat.<id>.perk`; secrets
// `idle.secret.<id>` and `idle.secret.<id>.hint`.

export type FeatCounter =
  | 'deepest' | 'cells' | 'crits' | 'bestCombo' | 'levels' | 'stars' | 'runTier' | 'runLines' | 'chests' | 'chestRarity'
  | 'runGold' | 'rekindles' | 'embersEver' | 'codex' | 'biomes' | 'offlineHours' | 'events' | 'lamps' | 'charted' | 'swift'
  | 'contracts';

export interface FeatFamily {
  id: string;
  counter: FeatCounter;
  /** Thresholds I–X. For 'swift' smaller is better (run seconds to 600 m). For 'runGold' and 'embersEver', log10. */
  tiers: readonly number[];
  /** Past X: each threshold × this (counting families ×10, others ×3); 'swift' halves; 'deepest' +2,000 m. */
  next: 'x3' | 'x10' | 'plus2000' | 'half' | 'plus2';
  /** The tier X perk (i18n `idle.feat.<id>.perk`) and its effect id (read by the systems it changes). */
  perk: string;
}

export const FEATS: readonly FeatFamily[] = [
  { id: 'delver', counter: 'deepest', tiers: [20, 80, 240, 600, 1300, 2400, 3900, 5800, 8000, 10000], next: 'plus2000', perk: 'headStart5' },
  { id: 'breaker', counter: 'cells', tiers: [100, 1e3, 1e4, 5e4, 2.5e5, 1e6, 5e6, 2.5e7, 1e8, 1e9], next: 'x10', perk: 'splash10' },
  { id: 'spark', counter: 'crits', tiers: [10, 100, 1e3, 5e3, 2.5e4, 1e5, 5e5, 2e6, 1e7, 5e7], next: 'x10', perk: 'crit3' },
  // Rhythm: the combo never caps for Feats, and a steady 5 taps/s reaches 500 in 100 s, so SPEC's 10 … 500 would hand
  // out ten tiers (and the perk) in the first two minutes. Doubling from 50 makes the late tiers a real streak.
  { id: 'rhythm', counter: 'bestCombo', tiers: [10, 25, 50, 100, 200, 400, 800, 1600, 3200, 6400], next: 'x3', perk: 'window02' },
  { id: 'tinkerer', counter: 'levels', tiers: [25, 250, 1e3, 5e3, 2e4, 5e4, 1e5, 2.5e5, 5e5, 1e6], next: 'x10', perk: 'cost5' },
  { id: 'starwright', counter: 'stars', tiers: [1, 10, 50, 150, 400, 1e3, 2.5e3, 5e3, 1e4, 2.5e4], next: 'x10', perk: 'starGold' },
  { id: 'forgemaster', counter: 'runTier', tiers: [2, 3, 4, 5, 6, 8, 10, 12, 14, 16], next: 'plus2', perk: 'startTier2' },
  { id: 'foreman', counter: 'runLines', tiers: [2, 4, 6, 8, 10, 11, 12, 13, 14, 15], next: 'plus2', perk: 'crew15' },
  { id: 'lockpick', counter: 'chests', tiers: [5, 25, 100, 250, 500, 1e3, 2.5e3, 5e3, 1e4, 2.5e4], next: 'x10', perk: 'chestCard' },
  // Lucky Lamp: chest rarity milestones, encoded as a score (see feats.ts in the model): 1 Copper+, 2 5×Crystal+, …
  { id: 'luckyLamp', counter: 'chestRarity', tiers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], next: 'plus2', perk: 'chestStep2' },
  { id: 'demesure', counter: 'runGold', tiers: [6, 12, 24, 33, 48, 63, 100, 150, 200, 303], next: 'x3', perk: 'gold2' },
  { id: 'kindler', counter: 'rekindles', tiers: [1, 3, 5, 10, 20, 35, 50, 75, 100, 150], next: 'x3', perk: 'embers10' },
  { id: 'emberborn', counter: 'embersEver', tiers: [Math.log10(25), 2, 3, 4, 5, 6, 8, 10, 12, 15], next: 'x3', perk: 'kindle11' },
  { id: 'collector', counter: 'codex', tiers: [10, 25, 50, 75, 100, 125, 150, 175, 196, 250], next: 'x3', perk: 'entry05' },
  { id: 'wayfinder', counter: 'biomes', tiers: [2, 4, 6, 8, 10, 12, 14, 15, 17, 19], next: 'plus2', perk: 'revealChest' },
  { id: 'overseer', counter: 'offlineHours', tiers: [1, 8, 24, 72, 168, 336, 720, 1500, 3000, 6000], next: 'x3', perk: 'offline25' },
  { id: 'wonderstruck', counter: 'events', tiers: [5, 25, 75, 200, 500, 1e3, 2e3, 4e3, 7e3, 1e4], next: 'x3', perk: 'events25' },
  // Lamplighter (lamps relit; tier X: lamps within 6 m relight themselves) and Cartographer (chambers charted; tier X: forks
  // offer 3 roads) are the node crawl's own families (hybrid SPEC §5.8).
  { id: 'lamplighter', counter: 'lamps', tiers: [5, 25, 100, 300, 1e3, 3e3, 1e4, 3e4, 1e5, 3e5], next: 'x10', perk: 'lampsNear' },
  { id: 'cartographer', counter: 'charted', tiers: [3, 15, 50, 150, 400, 1e3, 2.5e3, 5e3, 1e4, 2.5e4], next: 'x10', perk: 'forks3' },
  { id: 'swift', counter: 'swift', tiers: [1200, 720, 480, 300, 180, 120, 90, 60, 45, 30], next: 'half', perk: 'headStart5b' },
  { id: 'contractor', counter: 'contracts', tiers: [3, 15, 50, 150, 400, 1e3, 2.5e3, 5e3, 1e4, 2.5e4], next: 'x10', perk: 'slot4' },
];

/** The threshold of tier t (1-based; t > 10 continues past X). */
export function featThreshold(f: FeatFamily, t: number): number {
  if (t <= 10) return f.tiers[t - 1];
  const x = f.tiers[9];
  const k = t - 10;
  switch (f.next) {
    case 'plus2000': return x + 2000 * k;
    case 'x10': return x * Math.pow(10, k);
    case 'x3': return f.counter === 'runGold' || f.counter === 'embersEver' ? x + k * Math.log10(3) * 3 : x * Math.pow(3, k);
    // Swift past X: 10 % faster a tier, never under 10 s (a run must still dig its 600 m).
    case 'half': return Math.max(10, x * Math.pow(0.9, k));
    case 'plus2': return x + 2 * k;
  }
}

/** Gems for reaching tier t. */
export function featGems(t: number): number {
  return 5 * Math.min(t, 10);
}

/** Tier V's cosmetic per family (cycling a small set: trails, skins, frames, flames). */
export function featCosmetic(familyIndex: number): string {
  const kinds = ['trail', 'skin', 'frame', 'flame'];
  return `${kinds[familyIndex % 4]}.feat${familyIndex}`;
}

/**
 * Secret Feats (hybrid SPEC §5.8): the kept ones, plus Through the Dark (find a vault [W2]), First Light (break 100
 * breaches yourself), Full Sweep (harvest a whole chamber, skin included, 10 times) and Every Flame (relight every lamp of
 * one biome in one run). 'firstChest' is the old first-chest secret (renamed: Lamplighter is a family now).
 */
export const SECRETS = [
  'firstChest', 'overkill', 'cleanSweep', 'patience', 'nightOwl', 'bareHands', 'handsFree', 'fullSet', 'throughTheDark',
  'cataclysm', 'echoOfHalden', 'theAnswer', 'firstLight', 'fullSweep', 'everyFlame',
] as const;
export type SecretId = (typeof SECRETS)[number];
export const SECRET_REWARD = { marks: 5, gems: 25 } as const;
