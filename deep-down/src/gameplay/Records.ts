import { EXPEDITION } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import type { ItemCounts } from '../save/types';
import { addCounts, isItemId, toAmount, totalCount } from './counts';

/**
 * Expeditions and records.
 *
 * An expedition runs from leaving camp until camp entry ('returned'), a black-out ('blackout')
 * or giving up from the pause menu ('abandoned'). The tracker counts what happened on the way;
 * when it ends it produces an ExpeditionReport and updates the records, which only ever go up.
 */

export type TripOutcome = 'returned' | 'blackout' | 'abandoned';

/** The trip in progress (saved in SaveData.progression.trip, so a reload mid-trip keeps it). */
export interface TripState {
  /** Expedition number (1 for the first). */
  n: number;
  /** playTime when it started. */
  t0: number;
  /** Deepest displayed depth reached, metres. */
  deepest: number;
  /** Materials picked up on the way. */
  found: ItemCounts;
  /** Blocks mined. */
  mined: number;
  /** Health lost. */
  damage: number;
  /** Discovery ids found on the way. */
  discoveries: string[];
  /** Key items (runes) found on the way. */
  runes: string[];
  /** The depth record when the trip began (so a reload mid-trip keeps its NEW BEST). */
  best0?: number;
}

export interface RecordsState {
  /** Deepest displayed depth ever reached, metres. */
  deepest: number;
  /** Most items banked from one expedition. */
  biggestHaul: number;
  /** Expeditions finished (any outcome). */
  expeditions: number;
  blackouts: number;
  /** Longest run of expeditions without a black-out. */
  bestStreak: number;
  /** Current run (not a record: it resets on a black-out). */
  streak: number;
}

/** What an expedition amounted to (the Expedition Report reads it; W2/W3 add next and overnight). */
export interface ExpeditionReport {
  n: number;
  outcome: TripOutcome;
  /** Seconds out. */
  duration: number;
  deepest: number;
  /** The deepest depth beat the record held when the trip started. */
  newBest: boolean;
  /** The record before this trip. */
  previousBest: number;
  mined: number;
  found: ItemCounts;
  banked: ItemCounts;
  bankedTotal: number;
  /** Black-out / abandon: what was left in the cache (null when the trip returned). */
  cached: ItemCounts | null;
  /** Displayed depth (metres) where the cache lies, or null. */
  cacheDepth: number | null;
  /** Items destroyed with an older cache that this black-out replaced. */
  lostCount: number;
  damage: number;
  /** Lantern fuel left at the end, seconds. */
  fuelLeft: number;
  discoveries: string[];
  runes: string[];
  /** Records this trip raised: 'deepest' | 'biggestHaul' | 'bestStreak'. */
  records: string[];
  /** The report screen is worth showing (long enough, banked something, or found something). */
  show: boolean;
}

export const NO_RECORDS: Readonly<RecordsState> = { deepest: 0, biggestHaul: 0, expeditions: 0, blackouts: 0, bestStreak: 0, streak: 0 };

export interface EndInput {
  outcome: TripOutcome;
  now: number;
  banked?: ItemCounts;
  cached?: ItemCounts | null;
  cacheDepth?: number | null;
  lostCount?: number;
  fuelLeft: number;
}

/** Trip tracker plus the records it feeds. Pure bookkeeping: Progression turns its results into events. */
export class Records {
  private rec: RecordsState;
  private current: TripState | null = null;
  private lastReport: ExpeditionReport | null = null;
  /** The record when the current trip started (for "NEW BEST" and the depth marks). */
  private bestAtStart = 0;
  /** Highest 10 m depth mark announced on this trip. */
  private markAnnounced = 0;

  constructor(records?: Partial<RecordsState> | null, trip?: Partial<TripState> | null) {
    this.rec = normalizeRecords(records);
    this.current = trip ? normalizeTrip(trip) : null;
    const best0 = this.current?.best0;
    this.bestAtStart = typeof best0 === 'number' ? Math.min(best0, this.rec.deepest) : this.rec.deepest;
    this.markAnnounced = markOf(this.rec.deepest);
  }

  get records(): Readonly<RecordsState> {
    return this.rec;
  }

  get trip(): Readonly<TripState> | null {
    return this.current;
  }

  get report(): Readonly<ExpeditionReport> | null {
    return this.lastReport;
  }

  /** The current trip has gone deeper than the record held when it started. */
  get newBest(): boolean {
    return !!this.current && this.current.deepest > this.bestAtStart;
  }

  dismissReport(): void {
    this.lastReport = null;
  }

  /** Start an expedition (leaving camp). A trip already running (a reload mid-trip) continues. @returns its number. */
  start(now: number, depth: number): number {
    if (this.current) return this.current.n;
    this.current = { n: this.rec.expeditions + 1, t0: now, deepest: Math.max(0, Math.round(depth)), found: {}, mined: 0, damage: 0, discoveries: [], runes: [], best0: this.rec.deepest };
    this.bestAtStart = this.rec.deepest;
    this.markAnnounced = markOf(this.rec.deepest);
    return this.current.n;
  }

  /**
   * Track the current depth. @returns the new 10 m depth mark when the all-time record passes
   * one (e.g. 60 when the explorer first reaches -61 m), otherwise 0.
   */
  depth(metres: number): number {
    const d = Math.max(0, Math.round(metres));
    if (this.current && d > this.current.deepest) this.current.deepest = d;
    if (d <= this.rec.deepest) return 0;
    this.rec.deepest = d;
    const mark = markOf(d);
    if (mark > this.markAnnounced) {
      this.markAnnounced = mark;
      return mark;
    }
    return 0;
  }

  picked(item: ItemId, count: number): void {
    const t = this.current;
    if (!t || !isItemId(item)) return;
    if (ITEMS[item].keyItem) {
      if (!t.runes.includes(item)) t.runes.push(item);
    } else addCounts(t.found, { [item]: toAmount(count) });
  }

  mined(): void {
    if (this.current) this.current.mined++;
  }

  damaged(amount: number): void {
    if (this.current && amount > 0) this.current.damage += amount;
  }

  discovered(id: string): void {
    const t = this.current;
    if (t && !t.discoveries.includes(id)) t.discoveries.push(id);
  }

  /** End the current expedition. @returns its report, or null when no trip was running. */
  end(e: EndInput): ExpeditionReport | null {
    const t = this.current;
    if (!t) return null;
    this.current = null;
    const r = this.rec;
    const banked = { ...(e.banked ?? {}) };
    const bankedTotal = totalCount(banked);
    const broke: string[] = [];
    r.expeditions = Math.max(r.expeditions, t.n);
    if (e.outcome === 'blackout') {
      r.blackouts++;
      r.streak = 0;
    } else {
      r.streak++;
      if (r.streak > r.bestStreak) {
        r.bestStreak = r.streak;
        broke.push('bestStreak');
      }
    }
    if (bankedTotal > r.biggestHaul) {
      r.biggestHaul = bankedTotal;
      broke.push('biggestHaul');
    }
    const newBest = t.deepest > this.bestAtStart;
    if (newBest) broke.unshift('deepest');
    const duration = Math.max(0, e.now - t.t0);
    const report: ExpeditionReport = {
      n: t.n,
      outcome: e.outcome,
      duration,
      deepest: t.deepest,
      newBest,
      previousBest: this.bestAtStart,
      mined: t.mined,
      found: { ...t.found },
      banked,
      bankedTotal,
      cached: e.cached ? { ...e.cached } : null,
      cacheDepth: e.cached && typeof e.cacheDepth === 'number' ? Math.max(0, Math.round(e.cacheDepth)) : null,
      lostCount: Math.max(0, e.lostCount ?? 0),
      damage: Math.round(t.damage),
      fuelLeft: Math.max(0, e.fuelLeft),
      discoveries: [...t.discoveries],
      runes: [...t.runes],
      records: broke,
      show: duration >= EXPEDITION.reportMinSeconds || bankedTotal > 0 || t.discoveries.length > 0 || t.runes.length > 0 || e.outcome !== 'returned',
    };
    this.bestAtStart = r.deepest;
    this.lastReport = report;
    return report;
  }

  toJSON(): { records: RecordsState; trip: TripState | null } {
    return { records: { ...this.rec }, trip: this.current ? { ...this.current, found: { ...this.current.found }, discoveries: [...this.current.discoveries], runes: [...this.current.runes] } : null };
  }
}

const markOf = (d: number) => Math.floor(d / EXPEDITION.depthRecordStep) * EXPEDITION.depthRecordStep;

function count(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function normalizeRecords(x: unknown): RecordsState {
  const r = x && typeof x === 'object' ? (x as Record<string, unknown>) : {};
  return {
    ...r,
    deepest: count(r.deepest),
    biggestHaul: count(r.biggestHaul),
    expeditions: count(r.expeditions),
    blackouts: count(r.blackouts),
    bestStreak: count(r.bestStreak),
    streak: count(r.streak),
  };
}

function counts(x: unknown): ItemCounts {
  const out: ItemCounts = {};
  if (!x || typeof x !== 'object') return out;
  for (const [k, v] of Object.entries(x)) if (isItemId(k) && count(v) > 0) out[k] = count(v);
  return out;
}

function strings(x: unknown): string[] {
  return Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.length > 0) : [];
}

export function normalizeTrip(x: unknown): TripState | null {
  if (!x || typeof x !== 'object') return null;
  const t = x as Record<string, unknown>;
  const n = count(t.n);
  if (n < 1) return null;
  const t0 = typeof t.t0 === 'number' && Number.isFinite(t.t0) && t.t0 >= 0 ? t.t0 : 0;
  const damage = typeof t.damage === 'number' && Number.isFinite(t.damage) && t.damage > 0 ? t.damage : 0;
  // best0 is absent in saves from before it existed: leave it undefined (not 0, which would make
  // every resumed trip a NEW BEST).
  const best0 = typeof t.best0 === 'number' && Number.isFinite(t.best0) && t.best0 >= 0 ? t.best0 : undefined;
  return { ...t, n, t0, deepest: count(t.deepest), found: counts(t.found), mined: count(t.mined), damage, discoveries: strings(t.discoveries), runes: strings(t.runes), best0 };
}
