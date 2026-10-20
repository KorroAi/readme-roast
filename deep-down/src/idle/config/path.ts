// The Path (SPEC §8.5): authored objectives, steps 1–15 in W1 (16–30 and Survey Orders in W2). Each step
// is done by an action the model can see; a step whose system does not exist yet (contracts in W1) is
// skipped. Rewards: gems or a chest floor. Text: `idle.path.<n>` (idleCore.ts).

export type PathReward = { gems: number } | { chest: number };

export interface PathStep {
  n: number;
  /** What completes it (checked by goals.ts). */
  kind:
    | 'tapRock' | 'clearRow' | 'pick2' | 'hireShovel' | 'openChest' | 'depth' | 'star' | 'dynamite' | 'seal'
    | 'gear' | 'surge' | 'moth' | 'hireLine' | 'contract' | 'facet' | 'catch' | 'rank' | 'finds' | 'pickLevel'
    | 'crystalChest' | 'crown' | 'creature' | 'page' | 'rekindle' | 'planted';
  /** Parameter: a depth, a line, a biome. */
  arg: number;
  reward: PathReward | null;
}

export const PATH: readonly PathStep[] = [
  { n: 1, kind: 'tapRock', arg: 0, reward: null },
  { n: 2, kind: 'clearRow', arg: 0, reward: null },
  { n: 3, kind: 'pick2', arg: 2, reward: { gems: 5 } },
  { n: 4, kind: 'hireShovel', arg: 0, reward: { chest: 0 } },
  { n: 5, kind: 'openChest', arg: 0, reward: { gems: 5 } },
  { n: 6, kind: 'depth', arg: 20, reward: { gems: 5 } },
  { n: 7, kind: 'star', arg: 0, reward: { gems: 5 } },
  { n: 8, kind: 'dynamite', arg: 0, reward: { gems: 5 } },
  { n: 9, kind: 'seal', arg: 1, reward: { chest: 1 } },
  { n: 10, kind: 'gear', arg: 0, reward: { gems: 5 } },
  { n: 11, kind: 'surge', arg: 0, reward: { gems: 5 } },
  { n: 12, kind: 'moth', arg: 0, reward: { gems: 5 } },
  { n: 13, kind: 'hireLine', arg: 2, reward: { gems: 10 } },
  { n: 14, kind: 'contract', arg: 0, reward: { gems: 10 } },
  { n: 15, kind: 'seal', arg: 2, reward: { chest: 2 } },
  { n: 16, kind: 'facet', arg: 1, reward: { gems: 10 } },
  { n: 17, kind: 'catch', arg: 5, reward: { gems: 5 } },
  { n: 18, kind: 'rank', arg: 5, reward: { chest: 1 } },
  { n: 19, kind: 'finds', arg: 3, reward: { gems: 10 } },
  { n: 20, kind: 'pickLevel', arg: 25, reward: { gems: 10 } },
  { n: 21, kind: 'depth', arg: 240, reward: { chest: 2 } },
  { n: 22, kind: 'crystalChest', arg: 1, reward: { gems: 15 } },
  { n: 23, kind: 'crown', arg: 50, reward: { chest: 2 } },
  { n: 24, kind: 'depth', arg: 400, reward: { chest: 2 } },
  { n: 25, kind: 'creature', arg: 1, reward: { gems: 10 } },
  { n: 26, kind: 'page', arg: 1, reward: { chest: 2 } },
  { n: 27, kind: 'depth', arg: 600, reward: { chest: 2 } },
  { n: 28, kind: 'rekindle', arg: 1, reward: { chest: 3 } },
  { n: 29, kind: 'planted', arg: 1, reward: { gems: 15 } },
  { n: 30, kind: 'depth', arg: 900, reward: { chest: 3 } },
];

/** Systems that exist in this build (a Path step of a missing system is skipped). W2: every step of 1–30. */
export const PATH_SYSTEMS_W1: ReadonlySet<PathStep['kind']> = new Set([
  'tapRock', 'clearRow', 'pick2', 'hireShovel', 'openChest', 'depth', 'star', 'dynamite', 'seal', 'gear', 'surge', 'moth', 'hireLine',
  'contract', 'facet', 'catch', 'rank', 'finds', 'pickLevel', 'crystalChest', 'crown', 'creature', 'page', 'rekindle', 'planted',
]);
