// The Codex (SPEC §7.5): Finds with levels, the Bestiary with catch tiers, Lore, Biome Seals and Codex chests. Pure.
// Finds drop from eligible breaks (rare cells: gems and geodes give minerals, fossil cells give fossils), from the
// caverns' tappables (gem clusters and fossils), from Crystal+ chests and the Wardens (relics). Odds per eligible
// break: common entries 1/40, uncommon 1/250, rare 1/1,500 (Lucky Find and Fortune facets multiply). A complete page
// (6 Finds, 3 creatures, 5 Lore) stamps its Biome Seal (+10 % gold and power); every 10 entries a Codex chest.
// The pity (an incomplete page with no new entry for 6 minutes of active play there) is the Director's: it plants a
// geode or a fossil cell that is sure to hold a new entry (director.ts).

import type { IdleBus } from '../bus';
import { AUTHORED_BIOMES, BIOMES, baseBiome, biomeAt } from '../config/biomes';
import { CODEX, FINDS, type FindSource, LORE_IDS, bestiaryTier, creatureBiome, findDef, pageEntries } from '../config/codex';
import { XP } from '../config/rank';
import { openChest } from './chests';
import { facetStats } from './facets';
import { addXp } from './gain';
import { invalidateMults } from './mult';
import type { IdleState } from './state';
import { rand } from './tap';

/** Codex entries found (Finds, creatures, Lore). */
export function codexCount(s: IdleState): number {
  let n = s.meta.lore.length;
  for (const id in s.meta.finds) if (s.meta.finds[id] > 0) n++;
  for (const id in s.meta.bestiary) if (s.meta.bestiary[id] > 0) n++;
  return n;
}

/** Entries found on biome b's page (of 14). */
export function pageCount(s: IdleState, b: number): number {
  let n = 0;
  for (const id of pageEntries(b)) if (hasEntry(s, id)) n++;
  return n;
}

/** Is a Codex entry found? */
export function hasEntry(s: IdleState, id: string): boolean {
  if (id.startsWith('find:')) return (s.meta.finds[id] ?? 0) > 0;
  if (id.startsWith('creature:')) return (s.meta.bestiary[id.slice(9)] ?? 0) > 0;
  return s.meta.lore.includes(id);
}

/** The page the player is on (the current authored biome; Echo strata use their base). */
export function currentPage(s: IdleState): number {
  return Math.min(AUTHORED_BIOMES - 1, baseBiome(biomeAt(s.run.depth)));
}

/** The header's "Next chest at 70 (3 to go)". */
export function nextCodexChest(s: IdleState): { at: number; toGo: number } {
  const n = codexCount(s);
  const at = (Math.floor(n / CODEX.chestEvery) + 1) * CODEX.chestEvery;
  return { at, toGo: at - n };
}

/** A new entry was added: the Codex chest every 10, the Biome Seal on a complete page, the pity clock. */
function onNewEntry(s: IdleState, biome: number, bus?: IdleBus): void {
  s.director.codexQuiet = 0;
  invalidateMults(s);
  const n = codexCount(s);
  if (n > 0 && n % CODEX.chestEvery === 0) {
    bus?.emit('codex:chest', { entries: n });
    openChest(s, `codex:${n}`, 2, 'codex', bus);
  }
  if (biome >= 0 && biome < AUTHORED_BIOMES && !s.meta.biomeSeals.includes(biome) && pageCount(s, biome) >= 14) {
    s.meta.biomeSeals.push(biome);
    bus?.emit('codex:page', { biome });
  }
}

/** Award a Find: new (level 1) or a duplicate (+1 level). @returns true when it was new. */
export function awardFind(s: IdleState, id: string, bus?: IdleBus): boolean {
  const d = findDef(id);
  if (!d) return false;
  const lv = s.meta.finds[id] ?? 0;
  s.meta.finds[id] = lv + 1;
  s.meta.stats.finds++;
  s.meta.lastUsed.find = s.playTime;
  addXp(s, XP.find);
  invalidateMults(s);
  if (lv === 0) {
    bus?.emit('codex:new', { id, section: 'find', biome: d.biome });
    onNewEntry(s, d.biome, bus);
    return true;
  }
  bus?.emit('codex:level', { id, level: lv + 1 });
  return false;
}

/** Add a Lore entry (a note read, a mural, a seal card). @returns true when it was new. */
export function addLore(s: IdleState, id: string, bus?: IdleBus): boolean {
  if (s.meta.lore.includes(id)) return false;
  s.meta.lore.push(id);
  const b = Number(id.split(':')[1]);
  bus?.emit('lore:read', { id, biome: b });
  bus?.emit('codex:new', { id, section: 'lore', biome: b });
  onNewEntry(s, b, bus);
  return true;
}

/** Read the next unread note of biome b's page (notes, then the mural). @returns the lore id ('' when all are read). */
export function readNote(s: IdleState, b: number, bus?: IdleBus): string {
  const page = Math.max(0, Math.min(AUTHORED_BIOMES - 1, b));
  for (const l of LORE_IDS) {
    if (l === 'seal') continue;
    const id = `lore:${page}:${l}`;
    if (!s.meta.lore.includes(id)) {
      addLore(s, id, bus);
      return id;
    }
  }
  return '';
}

/** A creature was caught (its taps done): the Bestiary count, a new entry or a tier. */
export function catchCreature(s: IdleState, kind: string, bus?: IdleBus): void {
  const n = (s.meta.bestiary[kind] ?? 0) + 1;
  const t0 = bestiaryTier(n - 1);
  s.meta.bestiary[kind] = n;
  s.meta.stats.creatures++;
  s.meta.lastUsed.creature = s.playTime;
  addXp(s, XP.creature);
  invalidateMults(s);
  if (n === 1) {
    bus?.emit('codex:new', { id: `creature:${kind}`, section: 'bestiary', biome: creatureBiome(kind) });
    onNewEntry(s, creatureBiome(kind), bus);
  } else if (bestiaryTier(n) > t0) bus?.emit('codex:level', { id: `creature:${kind}`, level: bestiaryTier(n) });
}

/**
 * Roll a Find for an eligible break or tappable of `source` on biome b's page. `mult` scales the odds (a cavern
 * fossil is a much better chance than a fossil cell). `forceNew` (the pity, a Crystal chest's 60 %) picks a missing entry.
 * @returns the Find id awarded ('' none).
 */
export function rollFind(s: IdleState, source: FindSource, b: number, bus?: IdleBus, mult = 1, forceNew = false): string {
  const page = Math.max(0, Math.min(AUTHORED_BIOMES - 1, b));
  const pool = FINDS.filter((f) => f.biome === page && (source === 'relic' ? f.source === 'relic' : f.source === source));
  if (!pool.length) return '';
  if (forceNew) {
    const missing = pool.filter((f) => !(s.meta.finds[f.id] > 0));
    const list = missing.length ? missing : pool;
    const f = list[Math.floor(rand(s) * list.length)];
    awardFind(s, f.id, bus);
    return f.id;
  }
  const x = mult * facetStats(s).findX;
  for (const f of pool) {
    if (rand(s) < Math.min(1, f.odds * x)) {
      awardFind(s, f.id, bus);
      return f.id;
    }
  }
  return '';
}

/** The page is incomplete (the pity may plant something). */
export function pageIncomplete(s: IdleState, b: number): boolean {
  return pageCount(s, b) < 14;
}

/** A biome page as the Codex sheet draws it: every entry, found or a silhouette with its hint. */
export function pageView(s: IdleState, b: number): Array<{ id: string; found: boolean; level: number; section: 'find' | 'bestiary' | 'lore'; hint: string }> {
  return pageEntries(b).map((id) => {
    const section = id.startsWith('find:') ? 'find' : id.startsWith('creature:') ? 'bestiary' : 'lore';
    const level = section === 'find' ? (s.meta.finds[id] ?? 0) : section === 'bestiary' ? (s.meta.bestiary[id.slice(9)] ?? 0) : s.meta.lore.includes(id) ? 1 : 0;
    const hint = section === 'find' ? `idle.codexHint.${findDef(id)?.source ?? 'rare'}` : section === 'bestiary' ? 'idle.codexHint.creature' : `idle.codexHint.${id.split(':')[2].startsWith('note') ? 'note' : id.split(':')[2]}`;
    return { id, found: level > 0, level, section, hint };
  });
}

/** Every biome's page completion (the Codex header's "Codex %"). */
export function codexPercent(s: IdleState): number {
  return Math.round((codexCount(s) / (AUTHORED_BIOMES * 14)) * 100);
}

/** Creatures of biome b (for B's spawns and the Bestiary). */
export function creaturesOf(b: number): readonly string[] {
  return BIOMES[Math.max(0, Math.min(AUTHORED_BIOMES - 1, baseBiome(b)))].creatures;
}
