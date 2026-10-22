import { PLAYER, SAVE, WORLD, lanternForTier, packForTier } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import { isItemId } from '../gameplay/counts';
import { OBJECTIVE_CHAIN } from '../gameplay/Objectives';
import { NO_RECORDS, normalizeRecords, normalizeTrip } from '../gameplay/Records';
import { NO_LIFE, normalizeLife } from '../gameplay/Feats';
import type { CacheState } from '../gameplay/Expedition';
import type { WorldLayout } from '../world/gen/types';
import type { ItemCounts, ProgressionSave, SaveData, SlotData } from './types';
import { BIOMES, STRATUM_COUNT, type BiomeId, type StratumIndex } from '../config/biomes';
import type { OutpostRecord, StrataSave, StratumSlice } from '../game/Stratum';

/** Upper bound for a backpack array in a save (far above any pack tier). */
const MAX_SLOTS = 64;

/** Defaults for SaveData.progression (fresh game, and any field missing from an older save). */
export function defaultProgression(): ProgressionSave {
  return {
    day: 0,
    expeditions: 0,
    trip: null,
    records: { ...NO_RECORDS },
    cache: null,
    stations: [],
    gear: [],
    relics: [],
    seams: [],
    minedDay: [],
    hintsShown: [],
    finale: false,
    compassTarget: null,
    foundAt: {},
    looted: [],
    feats: [],
    life: { ...NO_LIFE, firsts: [] },
  };
}

/** Fresh-expedition defaults: tier 1 gear, empty bags, standing at the spawn point. */
export function createNewSave(spawn: WorldLayout['spawn'], seed: number, now: number = Date.now()): SaveData {
  return {
    version: SAVE.version,
    genVersion: WORLD.genVersion,
    savedAt: now,
    worldSeed: seed,
    playTime: 0,
    player: { x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw, health: PLAYER.maxHealth, lanternFuel: lanternForTier(1).fuelSeconds },
    backpack: new Array(packForTier(1).slots).fill(null),
    storage: {},
    equipment: { pickaxe: 1, lantern: 1, pack: 1 },
    journal: [],
    discoveries: [],
    objectives: { completed: [], current: OBJECTIVE_CHAIN[0], stats: {} },
    worldEdits: [],
    removedProps: [],
    stats: { blocksMined: 0, deaths: 0, itemsBanked: 0 },
    progression: defaultProgression(),
  };
}

/**
 * Structural check of untrusted data (parsed JSON) against the current SaveData shape.
 * Pure and total: never throws. It checks shape, not the version; SaveSystem migrates
 * older versions and normalizes before validating.
 */
export function validateSaveData(x: unknown): x is SaveData {
  if (!isObj(x)) return false;
  const p = x.player;
  const eq = x.equipment;
  const o = x.objectives;
  const st = x.stats;
  return (
    Number.isInteger(x.version) &&
    (x.version as number) >= 1 &&
    count(x.genVersion) &&
    finite(x.savedAt) &&
    finite(x.worldSeed) &&
    finite(x.playTime) &&
    (x.playTime as number) >= 0 &&
    isObj(p) &&
    ['x', 'y', 'z', 'yaw', 'health', 'lanternFuel'].every((k) => finite(p[k])) &&
    Array.isArray(x.backpack) &&
    x.backpack.length <= MAX_SLOTS &&
    x.backpack.every(validSlot) &&
    isObj(x.storage) &&
    Object.entries(x.storage).every(([k, v]) => isItemId(k) && count(v)) &&
    isObj(eq) &&
    ['pickaxe', 'lantern', 'pack'].every((k) => Number.isInteger(eq[k]) && (eq[k] as number) >= 1) &&
    strings(x.journal) &&
    strings(x.discoveries) &&
    isObj(o) &&
    strings(o.completed) &&
    (o.current === null || typeof o.current === 'string') &&
    isObj(o.stats) &&
    Object.values(o.stats).every(finite) &&
    Array.isArray(x.worldEdits) &&
    x.worldEdits.length % 2 === 0 &&
    x.worldEdits.every(Number.isInteger) &&
    strings(x.removedProps) &&
    isObj(st) &&
    ['blocksMined', 'deaths', 'itemsBanked'].every((k) => count(st[k])) &&
    validProgression(x.progression) &&
    (x.strata === undefined || validStrata(x.strata))
  );
}

/** Save v4's strata part, as normalizeStrata leaves it (a seed and a stratum at least). */
function validStrata(x: unknown): boolean {
  return isObj(x) && finite(x.seed) && isStratum(x.current) && isStratum(x.deepest) && isObj(x.strata) && Array.isArray(x.outposts) && strings(x.shards);
}

const isStratum = (v: unknown): v is StratumIndex => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= STRATUM_COUNT;
const isBiome = (v: unknown): v is BiomeId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(BIOMES, v);

/**
 * Save v4: bring an untrusted strata part into shape (anything malformed is dropped, not fatal): the
 * seed and the stratum, each stratum's slice (edits as integer pairs, props, the explored map, the
 * revealed lairs, the gate, the biomes seen), the outposts and the Heart Shards. A part without a
 * usable seed is no part (undefined): Continue then treats the save as one from another world.
 */
export function normalizeStrata(x: unknown): StrataSave | undefined {
  if (!isObj(x) || !finite(x.seed)) return undefined;
  const current: StratumIndex = isStratum(x.current) ? x.current : 1;
  const deepest: StratumIndex = isStratum(x.deepest) ? (Math.max(x.deepest, current) as StratumIndex) : current;
  const strs = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  const strata: Partial<Record<StratumIndex, StratumSlice>> = {};
  if (isObj(x.strata)) {
    for (const [k, v] of Object.entries(x.strata)) {
      const n = Number(k);
      if (!isStratum(n) || !isObj(v)) continue;
      const edits = Array.isArray(v.edits) && v.edits.length % 2 === 0 && v.edits.every(Number.isInteger) ? (v.edits as number[]).slice() : [];
      strata[n] = {
        edits,
        removedProps: strs(v.removedProps),
        explored: isObj(v.explored) ? (v.explored as unknown as StratumSlice['explored']) : null,
        revealed: strs(v.revealed),
        gateOpen: v.gateOpen === true,
        seenBiomes: strs(v.seenBiomes).filter(isBiome),
        found: strs(v.found),
      };
    }
  }
  const outposts: OutpostRecord[] = [];
  if (Array.isArray(x.outposts)) {
    for (const o of x.outposts) {
      if (!isObj(o) || typeof o.id !== 'string' || !isStratum(o.stratum) || !finite(o.x) || !finite(o.y) || !finite(o.z)) continue;
      outposts.push({ id: o.id, stratum: o.stratum, x: o.x as number, y: o.y as number, z: o.z as number, biome: isBiome(o.biome) ? o.biome : BIOMES.amberHollows.id });
    }
  }
  const out: StrataSave = { seed: (x.seed as number) >>> 0, current, deepest, strata, outposts, shards: [...new Set(strs(x.shards).filter(isBiome))], gen: count(x.gen) ? (x.gen as number) : 0 };
  if (x.fresh === true) out.fresh = true;
  return out;
}

function validProgression(x: unknown): boolean {
  if (!isObj(x)) return false;
  const r = x.records;
  return (
    count(x.day) &&
    count(x.expeditions) &&
    (x.trip === null || (isObj(x.trip) && count(x.trip.n) && (x.trip.n as number) >= 1)) &&
    isObj(r) &&
    ['deepest', 'biggestHaul', 'expeditions', 'blackouts', 'bestStreak', 'streak'].every((k) => count(r[k])) &&
    (x.cache === null || validCache(x.cache)) &&
    strings(x.stations) &&
    strings(x.gear) &&
    strings(x.relics) &&
    Array.isArray(x.seams) &&
    Array.isArray(x.minedDay) &&
    x.minedDay.every(Number.isInteger) &&
    strings(x.hintsShown) &&
    typeof x.finale === 'boolean' &&
    (x.compassTarget === null || typeof x.compassTarget === 'string') &&
    (x.foundAt === undefined || isObj(x.foundAt))
  );
}

function validCache(c: unknown): boolean {
  return isObj(c) && finite(c.x) && finite(c.y) && finite(c.z) && finite(c.depth) && isObj(c.items) && Object.entries(c.items).every(([k, v]) => isItemId(k) && !ITEMS[k].keyItem && count(v));
}

/** What normalizeSave changed. */
export interface NormalizeReport {
  /** Items with ids this build does not know, removed from the pack, storage and cache. */
  dropped: number;
  /** Items moved from the pack into camp storage (stacks above the stack size, slots past the pack). */
  movedToStorage: number;
}

/**
 * Bring untrusted save data (after migration) into the current shape without rejecting it for
 * fixable problems: unknown item ids are removed and counted, key items found in the pack go
 * to the journal, stacks above the stack size and slots past the pack's size move into camp
 * storage (nothing is lost), and every missing progression field gets its default. Valid data
 * comes back deep-equal. Shape errors it cannot fix are left for validateSaveData to reject.
 */
export function normalizeSave(raw: Record<string, unknown>): { data: Record<string, unknown>; report: NormalizeReport } {
  const report: NormalizeReport = { dropped: 0, movedToStorage: 0 };
  const d: Record<string, unknown> = { ...raw };
  if (d.genVersion === undefined) d.genVersion = 0;
  const storage = isObj(d.storage) ? { ...(d.storage as Record<string, unknown>) } : d.storage;
  if (isObj(storage)) {
    for (const k of Object.keys(storage)) {
      if (!isItemId(k) || ITEMS[k].keyItem) {
        report.dropped += amount(storage[k]);
        delete storage[k];
      }
    }
    d.storage = storage;
  }
  const journal = Array.isArray(d.journal) ? [...(d.journal as unknown[])] : d.journal;
  if (Array.isArray(d.backpack) && isObj(storage) && Array.isArray(journal)) {
    const tier = isObj(d.equipment) && Number.isInteger(d.equipment.pack) ? (d.equipment.pack as number) : 1;
    const slots = packForTier(tier).slots;
    const pack: Array<SlotData | null> = [];
    (d.backpack as unknown[]).forEach((s, i) => {
      if (s === null || !isObj(s)) {
        if (i < slots) pack.push(s === null ? null : (s as never));
        return;
      }
      const item = s.item;
      const n = s.count;
      if (!isItemId(item)) {
        report.dropped += amount(n);
        if (i < slots) pack.push(null);
        return;
      }
      if (ITEMS[item].keyItem) {
        if (!journal.includes(item)) journal.push(item);
        if (i < slots) pack.push(null);
        return;
      }
      if (!Number.isInteger(n) || (n as number) < 1) {
        if (i < slots) pack.push(s as never);
        return;
      }
      const keep = i < slots ? Math.min(n as number, ITEMS[item].stackSize) : 0;
      const extra = (n as number) - keep;
      if (extra > 0) {
        storage[item] = amount(storage[item]) + extra;
        report.movedToStorage += extra;
      }
      if (i < slots) pack.push(keep > 0 ? { item, count: keep } : null);
    });
    while (pack.length < slots) pack.push(null);
    d.backpack = pack;
    d.journal = journal;
  }
  d.progression = normalizeProgression(d.progression, report);
  if (d.strata !== undefined) {
    const st = normalizeStrata(d.strata);
    if (st) d.strata = st;
    else delete d.strata;
  }
  return { data: d, report };
}

/** Fill progression defaults; drop unknown ids from the cache (counted in `report`). */
export function normalizeProgression(x: unknown, report?: NormalizeReport): ProgressionSave {
  const p = isObj(x) ? x : {};
  const def = defaultProgression();
  const strs = (v: unknown, fallback: string[]) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : fallback);
  // Unknown fields are kept: a later wave's optional field survives an older build's load and save.
  return {
    ...p,
    day: count(p.day) ? (p.day as number) : def.day,
    expeditions: count(p.expeditions) ? (p.expeditions as number) : def.expeditions,
    trip: normalizeTrip(p.trip),
    records: normalizeRecords(p.records),
    cache: normalizeCache(p.cache, report),
    stations: strs(p.stations, def.stations),
    gear: strs(p.gear, def.gear),
    relics: strs(p.relics, def.relics),
    seams: Array.isArray(p.seams) ? [...p.seams] : def.seams,
    minedDay: Array.isArray(p.minedDay) ? p.minedDay.filter((v): v is number => Number.isInteger(v)) : def.minedDay,
    hintsShown: strs(p.hintsShown, def.hintsShown),
    finale: p.finale === true,
    compassTarget: typeof p.compassTarget === 'string' ? p.compassTarget : null,
    foundAt: normalizeFoundAt(p.foundAt),
    looted: strs(p.looted, def.looted),
    feats: strs(p.feats, def.feats),
    life: normalizeLife(p.life),
  };
}

/** Keep [expedition, depth] pairs of non-negative integers keyed by id; drop anything else. */
function normalizeFoundAt(x: unknown): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  if (!isObj(x)) return out;
  for (const [k, v] of Object.entries(x)) {
    if (!Array.isArray(v) || v.length !== 2 || !count(v[0]) || !count(v[1])) continue;
    out[k] = [v[0] as number, v[1] as number];
  }
  return out;
}

function normalizeCache(x: unknown, report?: NormalizeReport): CacheState | null {
  if (!isObj(x) || !finite(x.x) || !finite(x.y) || !finite(x.z)) return null;
  const items: ItemCounts = {};
  if (isObj(x.items)) {
    for (const [k, v] of Object.entries(x.items)) {
      if (isItemId(k) && !ITEMS[k].keyItem) {
        const n = amount(v);
        if (n > 0) items[k] = n;
      } else if (report) report.dropped += amount(v);
    }
  }
  if (Object.keys(items).length === 0) return null;
  return { x: x.x as number, y: x.y as number, z: x.z as number, depth: finite(x.depth) ? (x.depth as number) : 0, items };
}

/**
 * Save format v1 -> v2: the progression block and genVersion arrive (genVersion 0: the world a v1
 * save was made in is unknown, so its edits are dropped on load), and stacks above the new
 * stack sizes (or in slots past the new pack sizes) move into camp storage with nothing lost.
 */
export function migrateV1(old: Record<string, unknown>): Record<string, unknown> {
  const d: Record<string, unknown> = { ...old, genVersion: typeof old.genVersion === 'number' ? old.genVersion : 0 };
  if (!isObj(d.storage)) d.storage = {};
  return normalizeSave(d).data;
}

/**
 * Save format v2 -> v3 (finished game, content): the progression block gains the opened caches,
 * the feats and the lifetime counters (defaults: nothing opened, nothing earned, the lifetime
 * counters seeded from the v2 stats). Nothing else changes.
 */
export function migrateV2(old: Record<string, unknown>): Record<string, unknown> {
  const d = normalizeSave({ ...old }).data;
  const stats = isObj(old.stats) ? old.stats : {};
  const p = d.progression as unknown as Record<string, unknown>;
  const life = normalizeLife(p.life);
  if (life.blocksMined === 0 && count(stats.blocksMined)) life.blocksMined = stats.blocksMined as number;
  if (life.itemsBanked === 0 && count(stats.itemsBanked)) life.itemsBanked = stats.itemsBanked as number;
  p.life = life;
  return d;
}

/**
 * Save format v3 -> v4 (round 3, the strata): a 1.x save's world (the hand-made 160 x 128 x 160 deep)
 * cannot map onto the random strata. Its world edits and removed props go; everything else is kept
 * for now and the save is marked `changed`: on Continue the game shows the calm card and starts a new
 * expedition that keeps the feats, the lifetime counters and the records (game/StratumFlow).
 */
export function migrateV3(old: Record<string, unknown>): Record<string, unknown> {
  const d = normalizeSave({ ...old }).data;
  delete d.strata;
  return { ...d, worldEdits: [], removedProps: [], changed: true };
}

/**
 * A save made by another world generator: its world edits and removed props would land in a
 * different world, so they are dropped, the explorer wakes at camp and a pack left behind is
 * carried to camp storage. Inventory, equipment, journal, records and stats are kept.
 * @returns the adjusted copy, or the same object when the versions match.
 */
export function shiftWorldIfNeeded(d: SaveData, spawn: WorldLayout['spawn'], genVersion: number = WORLD.genVersion): { data: SaveData; shifted: boolean } {
  if (d.genVersion === genVersion) return { data: d, shifted: false };
  // A compatible older generator (WORLD.genCompatible): its edits land on the same cells here.
  if (genVersion === WORLD.genVersion && WORLD.genCompatible.includes(d.genVersion)) return { data: { ...d, genVersion }, shifted: false };
  const storage: ItemCounts = { ...d.storage };
  const cache = d.progression.cache;
  if (cache) for (const [k, v] of Object.entries(cache.items) as Array<[ItemId, number]>) storage[k] = (storage[k] ?? 0) + v;
  return {
    shifted: true,
    data: {
      ...d,
      genVersion,
      worldEdits: [],
      removedProps: [],
      storage,
      player: { ...d.player, x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw },
      // Cache ids are handed out in generation order: in another world the same id is another cache.
      progression: { ...d.progression, cache: null, trip: null, minedDay: [], looted: [] },
    },
  };
}

function validSlot(s: unknown): boolean {
  if (s === null) return true;
  return isObj(s) && isItemId(s.item) && !ITEMS[s.item].keyItem && Number.isInteger(s.count) && (s.count as number) >= 1;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function finite(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v);
}

function count(v: unknown): boolean {
  return Number.isInteger(v) && (v as number) >= 0;
}

function amount(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

function strings(v: unknown): boolean {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}
