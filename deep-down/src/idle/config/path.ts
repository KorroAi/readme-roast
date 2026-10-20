// The Path (SPEC §8.5): authored objectives, steps 1–15 in W1 (16–30 and Survey Orders in W2). Each step
// is done by an action the model can see; a step whose system does not exist yet (contracts in W1) is
// skipped. Rewards: gems or a chest floor. Text: `idle.path.<n>` (idleCore.ts).

export type PathReward = { gems: number } | { chest: number };

export interface PathStep {
  n: number;
  /** What completes it (checked by goals.ts). */
  kind:
    | 'tapRock' | 'clearRow' | 'pick2' | 'hireShovel' | 'openChest' | 'depth' | 'star' | 'dynamite' | 'seal'
    | 'gear' | 'surge' | 'moth' | 'hireLine' | 'contract';
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
];

/** Systems that exist in this build (a Path step of a missing system is skipped). */
export const PATH_SYSTEMS_W1: ReadonlySet<PathStep['kind']> = new Set([
  'tapRock', 'clearRow', 'pick2', 'hireShovel', 'openChest', 'depth', 'star', 'dynamite', 'seal', 'gear', 'surge', 'moth', 'hireLine',
]);
