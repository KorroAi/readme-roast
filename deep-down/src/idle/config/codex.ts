// The Codex (SPEC §7.5): per biome 6 Finds (2 minerals, 2 fossils, 2 relics), 3 creatures (the Bestiary) and 5 Lore
// (3 Halden notes, 1 mural, 1 seal card) = 14 entries; 14 biomes × 14 = 196. A complete page grants a Biome Seal
// (+10 % gold and +10 % power). Every 10 entries a Codex chest (Crystal floor). Finds: +3 % to one stat of their biome,
// +1 % per duplicate level (no cap). Bestiary: catch tiers 1 / 10 / 100 / 1,000 / …, each +2 % gold per species.
// Entry ids: Finds `find:<biome>:<i>` (i 0..5: mineral, mineral, fossil, fossil, relic, relic); creatures
// `creature:<creatureId>` (ids from config/biomes.ts); lore `lore:<biome>:<note0|note1|note2|mural|seal>`.
// Names: i18n `idle.find.<biome>.<i>` and `idle.codexHint.<source>` (B's idleWorld owns the creature names).

import { AUTHORED_BIOMES, BIOMES } from './biomes';

export type FindSource = 'rare' | 'fossil' | 'relic';
export type FindStat = 'crew' | 'taps' | 'gold' | 'crit' | 'offline' | 'chests';

export interface FindDef {
  id: string;
  biome: number;
  i: number;
  source: FindSource;
  /** Drop odds per eligible break (SPEC §7.5): common 1/40, uncommon 1/250, rare 1/1,500. */
  odds: number;
  stat: FindStat;
}

const STATS: readonly FindStat[] = ['crew', 'taps', 'gold', 'crit', 'offline', 'chests'];

/** Every Find of the 14 authored biomes. */
export const FINDS: readonly FindDef[] = (() => {
  const out: FindDef[] = [];
  for (let b = 0; b < AUTHORED_BIOMES; b++) {
    for (let i = 0; i < 6; i++) {
      const source: FindSource = i < 2 ? 'rare' : i < 4 ? 'fossil' : 'relic';
      const odds = i % 2 === 0 ? 1 / 40 : 1 / 250;
      out.push({ id: `find:${b}:${i}`, biome: b, i, source, odds: source === 'relic' ? 1 / 1500 : odds, stat: STATS[(b + i) % STATS.length] });
    }
  }
  return out;
})();

/** Per-entry bonuses. */
export const CODEX = {
  findBase: 0.03,
  findPerLevel: 0.01,
  bestiaryPerTier: 0.02,
  biomeSealGold: 0.1,
  biomeSealPower: 0.1,
  chestEvery: 10,
  /** Taps a creature takes to be caught. */
  creatureTaps: 3,
  /** A Crystal chest's Find roll is a new entry 60 % of the time (when one is left). */
  chestNew: 0.6,
} as const;

/** Lore entry ids of a biome page. */
export const LORE_IDS = ['note0', 'note1', 'note2', 'mural', 'seal'] as const;

/** Every Codex entry id of biome b's page (14). */
export function pageEntries(b: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < 6; i++) out.push(`find:${b}:${i}`);
  for (const c of BIOMES[b].creatures) out.push(`creature:${c}`);
  for (const l of LORE_IDS) out.push(`lore:${b}:${l}`);
  return out;
}

/** The biome of a creature id (−1 unknown). */
export function creatureBiome(id: string): number {
  for (let b = 0; b < AUTHORED_BIOMES; b++) if (BIOMES[b].creatures.includes(id)) return b;
  return -1;
}

/** Catch tier of a count (1, 10, 100, … → 1, 2, 3, …). */
export function bestiaryTier(count: number): number {
  return count <= 0 ? 0 : 1 + Math.floor(Math.log10(count) + 1e-9);
}

export function findDef(id: string): FindDef | undefined {
  const m = /^find:(\d+):(\d)$/.exec(id);
  if (!m) return undefined;
  return FINDS[Number(m[1]) * 6 + Number(m[2])];
}
