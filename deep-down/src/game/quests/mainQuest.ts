import type { BiomeKey } from '../../config/items';
import { NEXT_PICK, STRATUM_BIOMES } from '../../config/quests';
import type { QuestTarget } from './types';

/**
 * The main quest "Relight the Heart" as a pure function of the state (BRIEF §0.3).
 *
 * For the deepest stratum reached (n):
 *   1. find its two guardians' lairs (sonar, Halden's pages, walking deep into a biome);
 *   2. defeat each guardian (its Heart Shard);
 *   3. prepare the next pick (tier n+1), if it is not owned yet;
 *   4. open the stratum's Gate with its 2 shards, then descend.
 * In stratum VI, with all 12 shards: bring them to the Heart, defeat its guardian, then free play.
 * A tutorial in progress comes first; an explorer above the deepest stratum is asked to return.
 */
export interface LairInfo {
  id: string;
  biome: BiomeKey;
  guardian: string;
  x: number;
  y: number;
  z: number;
}

export interface MainState {
  tutorial: boolean;
  /** The stratum the explorer stands in, and the deepest entered. */
  stratum: number;
  deepest: number;
  shards: ReadonlySet<BiomeKey>;
  /** Lairs of the loaded stratum. */
  lairs: readonly LairInfo[];
  revealed: (id: string) => boolean;
  gate: { x: number; y: number; z: number; next: number | null } | null;
  gateOpen: boolean;
  heart: { x: number; y: number; z: number } | null;
  heartLit: boolean;
  bossDefeated: boolean;
  pickTier: number;
  /** The explorer, for the nearest lair. */
  at: { x: number; y: number; z: number };
}

export type MainStepId =
  | 'tutorial'
  | 'return'
  | 'lairs'
  | 'guardian'
  | 'prepare'
  | 'gate'
  | 'descend'
  | 'heart'
  | 'boss'
  | 'free';

export interface MainStep {
  /** Stable id: `main:s<n>.<step>` (+ `.<biome>` for a guardian). */
  id: string;
  step: MainStepId;
  stratum: number;
  biome: BiomeKey | null;
  guardian: string | null;
  progress: { have: number; need: number } | null;
  target: QuestTarget | null;
}

export function mainStep(s: MainState): MainStep {
  const n = Math.max(1, Math.min(6, s.deepest));
  const mk = (step: MainStepId, extra: Partial<MainStep> = {}): MainStep => ({
    id: `main:s${n}.${step}${extra.biome ? `.${extra.biome}` : ''}`,
    step,
    stratum: n,
    biome: null,
    guardian: null,
    progress: null,
    target: null,
    ...extra,
  });
  if (s.tutorial) return { ...mk('tutorial'), id: 'main:tutorial', stratum: 1 };
  if (s.bossDefeated) return mk('free');
  const [a, b] = STRATUM_BIOMES[n];
  const both = s.shards.has(a) && s.shards.has(b);
  if (s.stratum !== n && !(n === 6 && both)) return mk('return');
  if (!both) {
    const open = s.lairs.filter((l) => (l.biome === a || l.biome === b) && !s.shards.has(l.biome));
    const known = open.filter((l) => s.revealed(l.id));
    if (known.length > 0) {
      let best = known[0];
      let bd = Infinity;
      for (const l of known) {
        const d = (l.x - s.at.x) ** 2 + (l.y - s.at.y) ** 2 + (l.z - s.at.z) ** 2;
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      return mk('guardian', {
        biome: best.biome,
        guardian: best.guardian,
        progress: { have: Number(s.shards.has(a)) + Number(s.shards.has(b)), need: 2 },
        target: { x: best.x, y: best.y, z: best.z, stratum: n, kind: 'lair' },
      });
    }
    const found = [a, b].filter((x) => s.shards.has(x) || s.lairs.some((l) => l.biome === x && s.revealed(l.id))).length;
    return mk('lairs', { progress: { have: found, need: 2 } });
  }
  if (n < 6) {
    const gateTarget: QuestTarget | null = s.gate ? { x: s.gate.x, y: s.gate.y, z: s.gate.z, stratum: n, kind: 'gate' } : null;
    if (s.gateOpen) return mk('descend', { target: gateTarget });
    if (NEXT_PICK[n] && s.pickTier < n + 1) return mk('prepare', { target: null });
    return mk('gate', { target: gateTarget, progress: { have: 2, need: 2 } });
  }
  const heartTarget: QuestTarget | null = s.heart ? { x: s.heart.x, y: s.heart.y, z: s.heart.z, stratum: 6, kind: 'heart' } : null;
  if (!s.heartLit) return mk('heart', { target: heartTarget, progress: { have: s.shards.size, need: 12 } });
  return mk('boss', { target: heartTarget });
}

/** The chain's outline for the Quests screen: per stratum, its steps done or not. */
export function chainOutline(s: Pick<MainState, 'deepest' | 'shards' | 'heartLit' | 'bossDefeated' | 'pickTier'> & { gatesOpened: ReadonlySet<number> }): Array<{ stratum: number; steps: Array<{ id: MainStepId; biome: BiomeKey | null; done: boolean }> }> {
  const out: Array<{ stratum: number; steps: Array<{ id: MainStepId; biome: BiomeKey | null; done: boolean }> }> = [];
  for (let n = 1; n <= 6; n++) {
    const [a, b] = STRATUM_BIOMES[n];
    const steps: Array<{ id: MainStepId; biome: BiomeKey | null; done: boolean }> = [
      { id: 'guardian', biome: a, done: s.shards.has(a) },
      { id: 'guardian', biome: b, done: s.shards.has(b) },
    ];
    if (n < 6) {
      steps.push({ id: 'prepare', biome: null, done: s.pickTier >= n + 1 });
      steps.push({ id: 'gate', biome: null, done: s.gatesOpened.has(n) || s.deepest > n });
    } else {
      steps.push({ id: 'heart', biome: null, done: s.heartLit });
      steps.push({ id: 'boss', biome: null, done: s.bossDefeated });
    }
    out.push({ stratum: n, steps });
  }
  return out;
}
