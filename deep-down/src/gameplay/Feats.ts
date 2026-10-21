import type { ItemId } from '../config/items';
import { t, type TextKey } from '../i18n';
import type { ItemCounts } from '../save/types';

/**
 * Feats (finished game, content): small milestones that each get a calm toast, a page in the
 * Journal and a small reward paid into camp storage. Pure: the conditions read a snapshot that
 * game/Progression builds from the records, the journal, the tree and the lifetime stats, and
 * newFeats() returns the ones just earned (in table order). Earned feats are saved by id, so a
 * feat is earned once; ids never change (saves keep them).
 */

/** Lifetime counters (SaveData.progression.life): they only go up. */
export interface LifeStats {
  blocksMined: number;
  /** Ore and crystal blocks mined (copper, iron, crystal, echo, lanternstone). */
  oreMined: number;
  itemsBanked: number;
  /** Lantern embers carried from lanternstone. */
  embers: number;
  /** Halden caches, supply crates and coffers opened. */
  caches: number;
  /** Secret alcoves found (counted when their cache is opened). */
  secrets: number;
  /** Metres walked (rides not counted). */
  walked: number;
  /** Items mined by kind, first ones only matter (copper, iron...). */
  firsts: string[];
}

export const NO_LIFE: LifeStats = { blocksMined: 0, oreMined: 0, itemsBanked: 0, embers: 0, caches: 0, secrets: 0, walked: 0, firsts: [] };

export function normalizeLife(x: unknown): LifeStats {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(1e9, v) : 0);
  return {
    blocksMined: Math.floor(n(o.blocksMined)),
    oreMined: Math.floor(n(o.oreMined)),
    itemsBanked: Math.floor(n(o.itemsBanked)),
    embers: Math.floor(n(o.embers)),
    caches: Math.floor(n(o.caches)),
    secrets: Math.floor(n(o.secrets)),
    walked: Math.round(n(o.walked)),
    firsts: Array.isArray(o.firsts) ? o.firsts.filter((s): s is string => typeof s === 'string').slice(0, 64) : [],
  };
}

/** What the feat conditions read. */
export interface FeatSnapshot {
  life: LifeStats;
  /** Deepest depth stood on, metres. */
  deepest: number;
  /** Expeditions that came home (any outcome counts in records.expeditions; returned trips here). */
  expeditions: number;
  biggestHaul: number;
  bestStreak: number;
  discoveries: ReadonlySet<string>;
  keyItems: ReadonlySet<string>;
  runes: number;
  runesTotal: number;
  relics: number;
  relicsTotal: number;
  /** Every discovery in the table. */
  discoveryIds: readonly string[];
  secretsTotal: number;
  treeBuilt: number;
  treeTotal: number;
  finale: boolean;
  /** A pack left behind has been recovered at least once. */
  recovered: boolean;
}

export interface FeatDef {
  id: string;
  /** Journal group: firsts, depths, labour, finds, story. */
  group: 'firsts' | 'depths' | 'labour' | 'finds' | 'story';
  check(s: FeatSnapshot): boolean;
  /** Paid into camp storage when earned. */
  reward: ItemCounts;
}

const first = (id: string) => (s: FeatSnapshot) => s.life.firsts.includes(id);

export const FEATS: readonly FeatDef[] = [
  { id: 'firstStone', group: 'firsts', check: (s) => s.life.blocksMined >= 1, reward: { stone: 3 } },
  { id: 'firstCopper', group: 'firsts', check: first('copperOre'), reward: { stone: 4 } },
  { id: 'firstGlimmer', group: 'firsts', check: first('glimmerShard'), reward: { copperOre: 2 } },
  { id: 'firstIron', group: 'firsts', check: first('ironOre'), reward: { copperOre: 3 } },
  { id: 'firstEcho', group: 'firsts', check: first('echoShard'), reward: { ironOre: 2 } },
  { id: 'firstEmber', group: 'firsts', check: (s) => s.life.embers >= 1, reward: { glimmerShard: 1 } },
  { id: 'depth50', group: 'depths', check: (s) => s.deepest >= 50, reward: { copperOre: 2 } },
  { id: 'depth100', group: 'depths', check: (s) => s.deepest >= 100, reward: { glimmerShard: 1 } },
  { id: 'depth144', group: 'depths', check: (s) => s.deepest >= 143, reward: { ironOre: 2 } },
  { id: 'depth148', group: 'depths', check: (s) => s.deepest >= 147, reward: { echoShard: 2 } },
  { id: 'mined100', group: 'labour', check: (s) => s.life.blocksMined >= 100, reward: { copperOre: 3 } },
  { id: 'mined500', group: 'labour', check: (s) => s.life.blocksMined >= 500, reward: { ironOre: 3 } },
  { id: 'mined2000', group: 'labour', check: (s) => s.life.blocksMined >= 2000, reward: { glimmerShard: 3 } },
  { id: 'trips5', group: 'labour', check: (s) => s.expeditions >= 5, reward: { rootFibre: 4 } },
  { id: 'trips20', group: 'labour', check: (s) => s.expeditions >= 20, reward: { glimmerShard: 2 } },
  { id: 'haul40', group: 'labour', check: (s) => s.biggestHaul >= 40, reward: { copperOre: 3 } },
  { id: 'streak5', group: 'labour', check: (s) => s.bestStreak >= 5, reward: { ironOre: 2 } },
  { id: 'recovered', group: 'labour', check: (s) => s.recovered, reward: { stone: 6 } },
  { id: 'caches3', group: 'finds', check: (s) => s.life.caches >= 3, reward: { copperOre: 2 } },
  { id: 'caches12', group: 'finds', check: (s) => s.life.caches >= 12, reward: { glimmerShard: 2 } },
  { id: 'secrets3', group: 'finds', check: (s) => s.life.secrets >= 3, reward: { glimmerShard: 1 } },
  { id: 'secretsAll', group: 'finds', check: (s) => s.secretsTotal > 0 && s.life.secrets >= s.secretsTotal, reward: { echoShard: 2 } },
  { id: 'relics', group: 'finds', check: (s) => s.relicsTotal > 0 && s.relics >= s.relicsTotal, reward: { echoShard: 1 } },
  { id: 'logs', group: 'story', check: (s) => ['note.office', 'note.landing', 'note.yard', 'note.rift'].every((id) => s.discoveries.has(id)), reward: { ironOre: 2 } },
  { id: 'runes4', group: 'story', check: (s) => s.runes >= 4, reward: { glimmerShard: 1 } },
  { id: 'beyond', group: 'story', check: (s) => ['glowroot', 'choir', 'emberDeep'].every((id) => s.discoveries.has(id)), reward: { echoShard: 1 } },
  { id: 'tree', group: 'story', check: (s) => s.treeTotal > 0 && s.treeBuilt >= s.treeTotal, reward: { glimmerShard: 2 } },
  { id: 'answer', group: 'story', check: (s) => s.finale, reward: {} },
  { id: 'discoveries', group: 'story', check: (s) => s.discoveryIds.every((id) => s.discoveries.has(id)), reward: {} },
];

export const FEAT_TOTAL = FEATS.length;

const BY_ID = new Map(FEATS.map((f) => [f.id, f]));

export function featDef(id: string): FeatDef | null {
  return BY_ID.get(id) ?? null;
}

/** Feats whose condition holds now and that are not yet earned, in table order. */
export function newFeats(earned: ReadonlySet<string>, s: FeatSnapshot): FeatDef[] {
  return FEATS.filter((f) => !earned.has(f.id) && f.check(s));
}

/** "2 Copper Ore, 1 Glimmer Shard" (item names through `name`). */
export function rewardText(reward: ItemCounts, name: (item: ItemId) => string): string {
  return (Object.entries(reward) as Array<[ItemId, number]>)
    .filter(([, n]) => n > 0)
    .map(([item, n]) => `${n} ${name(item)}`)
    .join(', ');
}

/** One feat as the Journal shows it. */
export interface FeatPage {
  id: string;
  group: FeatDef['group'];
  name: string;
  desc: string;
  earned: boolean;
  /** The reward line ("2 Copper Ore"), empty when there is none. */
  reward: string;
}

/** The Journal's Feats page: every feat (earned or not) and the lifetime numbers. */
export interface FeatsView {
  feats: FeatPage[];
  earned: number;
  total: number;
  /** Lifetime rows: a label and a formatted value. */
  stats: Array<{ id: string; label: string; value: string }>;
}

export function buildFeatsView(earned: ReadonlySet<string>, life: LifeStats, extra: { expeditions: number; deepest: number; blackouts: number }, name: (item: ItemId) => string): FeatsView {
  const feats = FEATS.map((f) => ({
    id: f.id,
    group: f.group,
    name: t(`feat.${f.id}.name` as TextKey),
    desc: t(`feat.${f.id}.desc` as TextKey),
    earned: earned.has(f.id),
    reward: rewardText(f.reward, name),
  }));
  const row = (id: string, value: string) => ({ id, label: t(`stat.${id}` as TextKey), value });
  return {
    feats,
    earned: feats.filter((f) => f.earned).length,
    total: feats.length,
    stats: [
      row('expeditions', String(extra.expeditions)),
      row('deepest', `-${Math.round(extra.deepest)} m`),
      row('blocksMined', String(life.blocksMined)),
      row('oreMined', String(life.oreMined)),
      row('itemsBanked', String(life.itemsBanked)),
      row('caches', String(life.caches)),
      row('secrets', String(life.secrets)),
      row('embers', String(life.embers)),
      row('walked', `${Math.round(life.walked)} m`),
      row('blackouts', String(extra.blackouts)),
    ],
  };
}
