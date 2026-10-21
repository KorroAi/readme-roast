// The Path (SPEC §8.5): authored objectives, steps 1–15 in W1 (16–30 and Survey Orders in W2). Each step
// is done by an action the model can see; a step whose system does not exist yet (contracts in W1) is
// skipped. Rewards: gems or a chest floor. Text: `idle.path.<n>` (idleCore.ts).

export type PathReward = { gems: number } | { chest: number };

export interface PathStep {
  n: number;
  /** What completes it (checked by goals.ts). */
  kind:
    | 'tapRock' | 'breakThrough' | 'pick2' | 'hireShovel' | 'openChest' | 'lamps' | 'depth' | 'star' | 'chart' | 'relic'
    | 'dynamite' | 'seal' | 'gear' | 'hireLine' | 'secret' | 'rank' | 'finds' | 'pickLevel' | 'ember' | 'surge'
    | 'contract' | 'facet' | 'crystalChest' | 'crown' | 'page' | 'rekindle' | 'planted';
  /** Parameter: a depth, a line, a biome, a count, a relic grade (0 worn … 4 perfect). */
  arg: number;
  reward: PathReward | null;
}

/**
 * The 30 authored steps (hybrid SPEC §6.2; the purge replaced two steps with "Relight lamps" and "Catch the ember" [W2]);
 * new: "Break through", "Chart a chamber", "Grade a relic Fine or better", "Find a secret".
 * Steps 1–21 cover 0–120 m (BUILD §3.1 MUST 6).
 */
export const PATH: readonly PathStep[] = [
  { n: 1, kind: 'tapRock', arg: 0, reward: null },
  { n: 2, kind: 'breakThrough', arg: 1, reward: null },
  { n: 3, kind: 'pick2', arg: 2, reward: { gems: 5 } },
  { n: 4, kind: 'openChest', arg: 0, reward: { gems: 5 } },
  { n: 5, kind: 'hireShovel', arg: 0, reward: { chest: 0 } },
  { n: 6, kind: 'lamps', arg: 3, reward: { gems: 5 } },
  { n: 7, kind: 'depth', arg: 20, reward: { gems: 5 } },
  { n: 8, kind: 'star', arg: 0, reward: { gems: 5 } },
  { n: 9, kind: 'chart', arg: 1, reward: { gems: 5 } },
  { n: 10, kind: 'relic', arg: 2, reward: { gems: 10 } },
  { n: 11, kind: 'dynamite', arg: 0, reward: { gems: 5 } },
  { n: 12, kind: 'seal', arg: 1, reward: { chest: 1 } },
  { n: 13, kind: 'gear', arg: 0, reward: { gems: 5 } },
  { n: 14, kind: 'hireLine', arg: 2, reward: { gems: 10 } },
  { n: 15, kind: 'secret', arg: 1, reward: { gems: 10 } },
  { n: 16, kind: 'depth', arg: 80, reward: { gems: 10 } },
  { n: 17, kind: 'lamps', arg: 15, reward: { gems: 10 } },
  { n: 18, kind: 'rank', arg: 5, reward: { chest: 1 } },
  { n: 19, kind: 'finds', arg: 3, reward: { gems: 10 } },
  { n: 20, kind: 'pickLevel', arg: 25, reward: { gems: 10 } },
  { n: 21, kind: 'seal', arg: 2, reward: { chest: 2 } },
  { n: 22, kind: 'ember', arg: 1, reward: { gems: 5 } },
  { n: 23, kind: 'surge', arg: 0, reward: { gems: 5 } },
  { n: 24, kind: 'contract', arg: 0, reward: { gems: 10 } },
  { n: 25, kind: 'facet', arg: 1, reward: { gems: 10 } },
  { n: 26, kind: 'crystalChest', arg: 1, reward: { gems: 15 } },
  { n: 27, kind: 'crown', arg: 50, reward: { chest: 2 } },
  { n: 28, kind: 'depth', arg: 600, reward: { chest: 2 } },
  { n: 29, kind: 'rekindle', arg: 1, reward: { chest: 3 } },
  { n: 30, kind: 'planted', arg: 1, reward: { gems: 15 } },
];

/**
 * Systems that exist in this build (a Path step of a missing system is skipped; so is a seal closed in this build, the
 * Root Knot in W1). W2 adds the ember, the Pulse (`surge`), contracts, facets and the rest.
 */
export const PATH_SYSTEMS_W1: ReadonlySet<PathStep['kind']> = new Set([
  'tapRock', 'breakThrough', 'pick2', 'hireShovel', 'openChest', 'lamps', 'depth', 'star', 'chart', 'relic', 'dynamite', 'seal',
  'gear', 'hireLine', 'secret', 'rank', 'finds', 'pickLevel',
]);
