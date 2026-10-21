// The Codex of objects (hybrid SPEC §5.7): Finds with levels, Lore, Biome Seals and Codex chests (the legendary Lamps
// join the pages in W2). Pure. Finds drop from eligible breaks (rare cells: gems and geodes give minerals, fossil cells
// give fossils), from the chambers' tappables (gem clusters, geodes, skin pockets), from Crystal+ chests and the seals'
// relics. Odds per eligible break: common entries 1/40, uncommon 1/250, rare 1/1,500 (Lucky Find and Fortune facets
// multiply). A complete page stamps its Biome Seal (+10 % gold and power); every 10 entries a Codex chest.
// The pity (an incomplete page with no new entry for 6 minutes of active play there) is the Director's: it plants a
// geode or a fossil cell that is sure to hold a new entry (director.ts).

import type { IdleBus } from '../bus';
import { AUTHORED_BIOMES, baseBiome, biomeAt } from '../config/biomes';
import { CODEX, FINDS, type FindSource, LORE_IDS, findDef, PAGE_SIZE, pageEntries } from '../config/codex';
import { XP } from '../config/rank';
import { openChest } from './chests';
import { facetStats } from './facets';
import { addXp } from './gain';
import { invalidateMults } from './mult';
import type { IdleState } from './state';
import { rand } from './tap';

/** Codex entries found (Finds, Lore). */
/**
 * The text key of a Codex entry id: a Find `find:<b>:<i>` → `idle.find.<b>.<i>`; a lore entry `lore:<b>:<id>` is its own key
 * (idleLore.ts). '' for anything else. The shell reads entry names through this (never shows the raw id).
 */
export function entryTextKey(id: string): string {
  const f = /^find:(\d+):(\d+)$/.exec(id);
  if (f) return `idle.find.${f[1]}.${f[2]}`;
  return /^lore:\d+:\w+$/.test(id) ? id : '';
}

export function codexCount(s: IdleState): number {
  let n = s.meta.lore.length;
  for (const id in s.meta.finds) if (s.meta.finds[id] > 0) n++;
  return n;
}

/** Entries found on biome b's page (of PAGE_SIZE). */
export function pageCount(s: IdleState, b: number): number {
  let n = 0;
  for (const id of pageEntries(b)) if (hasEntry(s, id)) n++;
  return n;
}

/** Is a Codex entry found? */
export function hasEntry(s: IdleState, id: string): boolean {
  if (id.startsWith('find:')) return (s.meta.finds[id] ?? 0) > 0;
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
  if (biome >= 0 && biome < AUTHORED_BIOMES && !s.meta.biomeSeals.includes(biome) && pageCount(s, biome) >= PAGE_SIZE) {
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
  return pageCount(s, b) < PAGE_SIZE;
}

/** A biome page as the Codex sheet draws it: every entry, found or a silhouette with its hint. */
export function pageView(s: IdleState, b: number): Array<{ id: string; found: boolean; level: number; section: 'find' | 'lore'; hint: string }> {
  return pageEntries(b).map((id) => {
    const section: 'find' | 'lore' = id.startsWith('find:') ? 'find' : 'lore';
    const level = section === 'find' ? (s.meta.finds[id] ?? 0) : s.meta.lore.includes(id) ? 1 : 0;
    const hint = section === 'find' ? `idle.codexHint.${findDef(id)?.source ?? 'rare'}` : `idle.codexHint.${id.split(':')[2].startsWith('note') ? 'note' : id.split(':')[2]}`;
    return { id, found: level > 0, level, section, hint };
  });
}

/** Every biome's page completion (the Codex header's "Codex %"). */
export function codexPercent(s: IdleState): number {
  return Math.round((codexCount(s) / (AUTHORED_BIOMES * PAGE_SIZE)) * 100);
}
