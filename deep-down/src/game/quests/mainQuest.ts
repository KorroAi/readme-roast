import type { BiomeKey, ItemId } from '../../config/items';
import { NEXT_PICK, STRATUM_BIOMES } from '../../config/quests';
import { RECIPES } from '../../config/recipes';
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
 * Between the tutorial and the first lairs, an explorer with no weapon walks the road to the first
 * one (QA 01:44): build a Furnace, smelt copper bars, build the Forge, a Grit Boar's hide, forge the
 * Machete (`ArmState`; each step skipped once its result is there).
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
  /** The tutorial's own target (the nearest vein on its mining step), if any. */
  tutorialTarget?: { x: number; y: number; z: number } | null;
  /** The lairs' rumour points the way (after a while without a lead): the arrow aims near the nearest unrevealed lair. */
  rumour?: boolean;
  /** The road to the first weapon, when the explorer owns none (null or absent: armed). */
  arm?: ArmState | null;
}

/** A step of the road to the first weapon. */
export type ArmStepId = 'furnace' | 'placeFurnace' | 'bars' | 'forge' | 'placeForge' | 'hide' | 'machete';

/** What the road to the first weapon reads: what is built, what is held, where the compass can point. */
export interface ArmState {
  /** A Furnace / a Forge set up (placed), or one crafted and still in the bag. */
  furnace: boolean;
  furnaceItem: boolean;
  forge: boolean;
  forgeItem: boolean;
  /** Held in the bag and the bank (fuel in fuel units). */
  counts: { stone: number; coal: number; copperOre: number; copperIngot: number; hide: number; fuel: number };
  /** The nearest of each thing the road may send the explorer to (null: none known in range). */
  targets: {
    stone?: P3 | null;
    coal?: P3 | null;
    copper?: P3 | null;
    boar?: P3 | null;
    bench?: P3 | null;
    furnaceSpot?: P3 | null;
    forgeSpot?: P3 | null;
    furnace?: P3 | null;
    forge?: P3 | null;
  };
}
type P3 = { x: number; y: number; z: number };

/** The first recipe's inputs for an item (the road's needs, read from the recipes as written). */
function inputsOf(item: ItemId): Array<[string, number]> {
  const r = RECIPES.find((x) => x.id === item) ?? RECIPES.find((x) => x.output.item === item);
  return r ? (Object.entries(r.inputs) as Array<[string, number]>) : [];
}
const FURNACE_NEEDS = inputsOf('furnace');
const FORGE_NEEDS = inputsOf('forge');
const MACHETE_NEEDS = inputsOf('machete');
const BAR_ORE = inputsOf('copperIngot').find(([id]) => id === 'copperOre')?.[1] ?? 2;
const barsIn = (list: Array<[string, number]>) => list.find(([id]) => id === 'copperIngot')?.[1] ?? 0;

/** The road's step now, its count and where the compass points. */
export function armStep(a: ArmState): { step: ArmStepId; progress: { have: number; need: number } | null; target: P3 | null } {
  const have = (id: string) => (a.counts as Record<string, number>)[id] ?? 0;
  const units = (list: Array<[string, number]>) => ({ have: list.reduce((t, [id, n]) => t + Math.min(have(id), n), 0), need: list.reduce((t, [, n]) => t + n, 0) });
  const source = (id: string): P3 | null => (id === 'stone' ? a.targets.stone : id === 'coal' ? a.targets.coal : id === 'hide' ? a.targets.boar : id === 'copperIngot' ? a.targets.copper : null) ?? null;
  // A card still short of something: the nearest source of the first short input that has one in
  // range; everything in hand: the Workbench to build it on.
  const toward = (list: Array<[string, number]>): P3 | null => {
    let short = false;
    for (const [id, n] of list) {
      if (have(id) >= n) continue;
      short = true;
      const p = source(id);
      if (p) return p;
    }
    return short ? null : a.targets.bench ?? null;
  };
  // Bars for the Forge (until it stands) and the Machete: a Furnace first to smelt them.
  const barsNeed = (a.forge ? 0 : barsIn(FORGE_NEEDS)) + barsIn(MACHETE_NEEDS);
  const bars = have('copperIngot');
  if (bars < barsNeed) {
    if (!a.furnace) {
      if (a.furnaceItem) return { step: 'placeFurnace', progress: null, target: a.targets.furnaceSpot ?? a.targets.bench ?? null };
      return { step: 'furnace', progress: units(FURNACE_NEEDS), target: toward(FURNACE_NEEDS) };
    }
    const short = barsNeed - bars;
    const target = have('copperOre') < short * BAR_ORE ? a.targets.copper : have('fuel') < short ? a.targets.coal : a.targets.furnace;
    return { step: 'bars', progress: { have: bars, need: barsNeed }, target: target ?? null };
  }
  if (!a.forge) {
    if (a.forgeItem) return { step: 'placeForge', progress: null, target: a.targets.forgeSpot ?? a.targets.bench ?? null };
    return { step: 'forge', progress: units(FORGE_NEEDS), target: toward(FORGE_NEEDS) };
  }
  if (have('hide') < 1) return { step: 'hide', progress: { have: have('hide'), need: 1 }, target: a.targets.boar ?? null };
  return { step: 'machete', progress: units(MACHETE_NEEDS), target: a.targets.forge ?? null };
}

/** How far from its lair a rumour points (m): a direction, not the spot. */
export const RUMOUR_SPREAD = 14;

/** A lair's rumour point: its entrance moved by a fixed offset of up to RUMOUR_SPREAD m (per lair id). */
export function rumourPoint(l: LairInfo): { x: number; y: number; z: number } {
  let h = 2166136261;
  for (let i = 0; i < l.id.length; i++) h = Math.imul(h ^ l.id.charCodeAt(i), 16777619);
  const a = ((h >>> 0) % 3600) / 3600 * Math.PI * 2;
  const r = RUMOUR_SPREAD * (0.5 + (((h >>> 12) % 1000) / 1000) * 0.5);
  return { x: l.x + Math.cos(a) * r, y: l.y, z: l.z + Math.sin(a) * r };
}

export type MainStepId =
  | 'tutorial'
  | ArmStepId
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
  if (s.tutorial) {
    const tt = s.tutorialTarget ?? null;
    return { ...mk('tutorial'), id: 'main:tutorial', stratum: 1, target: tt ? { x: tt.x, y: tt.y, z: tt.z, stratum: s.stratum, kind: 'point' } : null };
  }
  if (s.bossDefeated) return mk('free');
  // The road to the first weapon, before the lairs (an unarmed explorer would meet a guardian with a pick).
  if (s.arm) {
    const r = armStep(s.arm);
    return { ...mk(r.step), stratum: 1, id: `main:arm.${r.step}`, progress: r.progress, target: r.target ? { x: r.target.x, y: r.target.y, z: r.target.z, stratum: s.stratum, kind: 'point' } : null };
  }
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
    let target: QuestTarget | null = null;
    if (s.rumour && open.length > 0) {
      let best = open[0];
      let bd = Infinity;
      for (const l of open) {
        const d = (l.x - s.at.x) ** 2 + (l.z - s.at.z) ** 2;
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      const r = rumourPoint(best);
      target = { x: r.x, y: r.y, z: r.z, stratum: n, kind: 'point' };
    }
    return mk('lairs', { progress: { have: found, need: 2 }, target });
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
export function chainOutline(s: Pick<MainState, 'deepest' | 'shards' | 'heartLit' | 'bossDefeated' | 'pickTier'> & { gatesOpened: ReadonlySet<number>; armed?: boolean }): Array<{ stratum: number; steps: Array<{ id: MainStepId; biome: BiomeKey | null; done: boolean }> }> {
  const out: Array<{ stratum: number; steps: Array<{ id: MainStepId; biome: BiomeKey | null; done: boolean }> }> = [];
  for (let n = 1; n <= 6; n++) {
    const [a, b] = STRATUM_BIOMES[n];
    const steps: Array<{ id: MainStepId; biome: BiomeKey | null; done: boolean }> = [
      { id: 'guardian', biome: a, done: s.shards.has(a) },
      { id: 'guardian', biome: b, done: s.shards.has(b) },
    ];
    // Stratum I opens with the road to the first weapon (when the host tells whether one is owned).
    if (n === 1 && s.armed !== undefined) steps.unshift({ id: 'machete', biome: null, done: s.armed });
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
