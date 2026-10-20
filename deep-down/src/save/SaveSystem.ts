import { SAVE } from '../config/balance';
import { normalizeSave, validateSaveData } from './saveData';
import { sanitizeSettings } from './settings';
import type { SaveData, Settings } from './types';

export { createNewSave, normalizeSave, saveToState, stateToSave, validateSaveData } from './saveData';

/**
 * Versioned two-slot persistence.
 *
 * Every save goes to the slot that is NOT active, as an envelope {checksum, json}. The slot
 * is read back and verified, and only then is the active pointer flipped to it. A crash or
 * a quota error at any point therefore leaves the previous save intact and active. On load,
 * a corrupt active slot (bad JSON, bad checksum, wrong shape) falls back to the other slot
 * and the result is flagged `recovered` so the player can be told.
 */

/** Minimal synchronous key-value storage (the subset of the Web Storage API we use). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  /** May throw (StoreError with code 'quota' or 'unavailable'). */
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StoreErrorCode = 'quota' | 'unavailable';

export class StoreError extends Error {
  constructor(
    readonly code: StoreErrorCode,
    cause?: unknown,
  ) {
    super(`storage ${code}`, { cause });
    this.name = 'StoreError';
  }
}

type WebStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * window.localStorage with guards: merely touching it throws in some privacy modes and
 * sandboxed WebViews, and writes throw when the quota is exhausted. Reads fail soft (null);
 * writes throw a StoreError so the save system can report why.
 */
export class LocalStorageStore implements KeyValueStore {
  private readonly backend: WebStorage | null;

  /** `backend` is for tests; by default the page's localStorage is used if reachable. */
  constructor(backend?: WebStorage | null) {
    this.backend = backend === undefined ? resolveLocalStorage() : backend;
  }

  get available(): boolean {
    return this.backend !== null;
  }

  getItem(key: string): string | null {
    try {
      return this.backend?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (!this.backend) throw new StoreError('unavailable');
    try {
      this.backend.setItem(key, value);
    } catch (err) {
      throw new StoreError(isQuotaError(err) ? 'quota' : 'unavailable', err);
    }
  }

  removeItem(key: string): void {
    try {
      this.backend?.removeItem(key);
    } catch {
      // Removal is best-effort cleanup; a failure leaves stale data that load() still validates.
    }
  }
}

/** In-memory store for tests and as a fallback. `quotaChars` simulates a full device. */
export class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, string>();

  constructor(private readonly quotaChars = Infinity) {}

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    let used = key.length + value.length;
    for (const [k, v] of this.data) if (k !== key) used += k.length + v.length;
    if (used > this.quotaChars) throw new StoreError('quota');
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export const SAVE_KEYS = {
  slotA: 'deepdown.save.a',
  slotB: 'deepdown.save.b',
  active: 'deepdown.save.active',
  settings: 'deepdown.settings',
  /** Set once the "old cave expedition" notice was shown (SPEC §12.3). */
  legacyNotice: 'deepdown.legacyNoticeShown',
} as const;

type SlotId = 'a' | 'b';
const SLOT_KEY: Record<SlotId, string> = { a: SAVE_KEYS.slotA, b: SAVE_KEYS.slotB };
const other = (s: SlotId): SlotId => (s === 'a' ? 'b' : 'a');

/** Upgrades a save of version N (the map key) to version N + 1. The version field is set by the caller. */
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/**
 * Save format history. When SAVE.version is bumped to N + 1, add MIGRATIONS[N] here.
 * - v3 (the vertical descent): no migration. Saves of versions 1 and 2 belong to the old cave
 *   expedition, a different game: they are reported as `legacy`, not loaded, and the two-slot rotation
 *   overwrites them with the first v3 saves (SPEC §12.3).
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/** Versions before this are the old game (legacy: never loaded). */
export const FIRST_LOADABLE_VERSION = 3;

export type SaveErrorCode = 'invalid' | 'serialize' | 'quota' | 'unavailable' | 'verify';
export type LoadErrorCode = 'corrupt' | 'version' | 'legacy';

export interface SaveResult {
  ok: boolean;
  error?: SaveErrorCode;
}

export interface LoadResult {
  data: SaveData | null;
  /** True when the active slot was unreadable and the other (older) slot was loaded. */
  recovered: boolean;
  /** Set when save data existed but none of it could be loaded. */
  error?: LoadErrorCode;
  /** Unknown fields removed while loading (only set when > 0). */
  dropped?: number;
  /** A save of the old game (v1 or v2) was found and ignored (the one-line notice). */
  legacy?: boolean;
}

export interface SaveSystemOptions {
  /** Current format version (default SAVE.version). */
  version?: number;
  migrations?: Readonly<Record<number, Migration>>;
}

type SlotRead = { data: SaveData; dropped: number } | { error: LoadErrorCode } | null;

export class SaveSystem {
  private readonly version: number;
  private readonly migrations: Readonly<Record<number, Migration>>;
  // Which slot holds the loadable save (null = none); undefined until storage has been read.
  // Saves always go to the other slot, so the last good save is never the one overwritten.
  private good: { slot: SlotId; savedAt: number } | null | undefined;

  constructor(
    private readonly store: KeyValueStore,
    options: SaveSystemOptions = {},
  ) {
    this.version = options.version ?? SAVE.version;
    this.migrations = options.migrations ?? MIGRATIONS;
  }

  /** Write `data` to the slot not holding the current save, verify it, then make it active. Never throws. */
  save(data: SaveData): SaveResult {
    if (!validateSaveData(data) || data.version !== this.version) return { ok: false, error: 'invalid' };
    let json: string;
    try {
      json = JSON.stringify(data);
    } catch {
      return { ok: false, error: 'serialize' };
    }
    const envelope = JSON.stringify({ checksum: checksum(json), json });
    if (this.good === undefined) this.load();
    const keep = this.good?.slot ?? this.activeSlot();
    const target: SlotId = keep ? other(keep) : 'a';
    const key = SLOT_KEY[target];
    try {
      this.store.setItem(key, envelope);
      if (this.store.getItem(key) !== envelope) return { ok: false, error: 'verify' };
      this.store.setItem(SAVE_KEYS.active, target);
      if (this.store.getItem(SAVE_KEYS.active) !== target) return { ok: false, error: 'verify' };
    } catch (err) {
      return { ok: false, error: err instanceof StoreError ? err.code : 'unavailable' };
    }
    this.good = { slot: target, savedAt: data.savedAt };
    return { ok: true };
  }

  /** Load the active save, falling back to the other slot if it is damaged. Never throws. */
  load(): LoadResult {
    const reads: Record<SlotId, SlotRead> = { a: this.readSlot('a'), b: this.readSlot('b') };
    const valid = (s: SlotId) => {
      const r = reads[s];
      return r && 'data' in r ? r.data : null;
    };
    const active = this.activeSlot();
    let slot: SlotId | null = null;
    if (active) slot = valid(active) ? active : valid(other(active)) ? other(active) : null;
    else {
      // No pointer (the very first save was interrupted before the flip): take the newest valid slot.
      const a = valid('a');
      const b = valid('b');
      slot = a && b ? (b.savedAt > a.savedAt ? 'b' : 'a') : a ? 'a' : b ? 'b' : null;
    }
    const data = slot ? valid(slot) : null;
    this.good = slot && data ? { slot, savedAt: data.savedAt } : null;
    const legacy = isLegacy(reads.a) || isLegacy(reads.b);
    if (data && slot) {
      const r = reads[slot];
      const dropped = r && 'dropped' in r ? r.dropped : 0;
      const res: LoadResult = { data, recovered: active !== null && slot !== active && !isLegacy(reads[active]) };
      if (dropped > 0) res.dropped = dropped;
      if (legacy) res.legacy = true;
      return res;
    }
    const error = loadError(reads.a, reads.b);
    const res: LoadResult = { data: null, recovered: false };
    if (error) res.error = error;
    if (legacy) res.legacy = true;
    return res;
  }

  hasSave(): boolean {
    return this.timestamp() !== null;
  }

  /** savedAt (ms since epoch) of the save that load() would return, or null. */
  timestamp(): number | null {
    if (this.good === undefined) this.load();
    return this.good?.savedAt ?? null;
  }

  /** Delete the game save (both slots and the pointer). Settings are kept. */
  clear(): void {
    for (const key of [SAVE_KEYS.active, SAVE_KEYS.slotA, SAVE_KEYS.slotB]) {
      try {
        this.store.removeItem(key);
      } catch {
        // Best effort, like LocalStorageStore: anything left behind is still validated on load.
      }
    }
    this.good = null;
  }

  /** True when a legacy save exists and its notice was never shown (show it once, then markLegacyNoticeShown). */
  legacyNoticePending(): boolean {
    if (this.read(SAVE_KEYS.legacyNotice) === '1') return false;
    return this.load().legacy === true;
  }

  markLegacyNoticeShown(): void {
    try {
      this.store.setItem(SAVE_KEYS.legacyNotice, '1');
    } catch {
      // Best effort: the notice may show once more.
    }
  }

  /** Stored settings merged over the defaults; damaged settings yield the defaults. */
  loadSettings(): Settings {
    const raw = this.read(SAVE_KEYS.settings);
    if (raw === null) return sanitizeSettings(null);
    try {
      return sanitizeSettings(JSON.parse(raw));
    } catch {
      return sanitizeSettings(null);
    }
  }

  /** Persist settings (sanitized). Never throws. */
  saveSettings(settings: Settings): SaveResult {
    try {
      this.store.setItem(SAVE_KEYS.settings, JSON.stringify(sanitizeSettings(settings)));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof StoreError ? err.code : 'unavailable' };
    }
  }

  /** Reads fail soft so that load(), hasSave() and save() stay total even over a store whose reads throw. */
  private read(key: string): string | null {
    try {
      return this.store.getItem(key);
    } catch {
      return null;
    }
  }

  private activeSlot(): SlotId | null {
    const p = this.read(SAVE_KEYS.active);
    return p === 'a' || p === 'b' ? p : null;
  }

  /** null = slot empty; otherwise the verified, migrated, validated data or why it failed. */
  private readSlot(slot: SlotId): SlotRead {
    const raw = this.read(SLOT_KEY[slot]);
    if (raw === null) return null;
    try {
      const env: unknown = JSON.parse(raw);
      if (!env || typeof env !== 'object') return { error: 'corrupt' };
      const { checksum: sum, json } = env as { checksum?: unknown; json?: unknown };
      if (typeof json !== 'string' || sum !== checksum(json)) return { error: 'corrupt' };
      const parsed: unknown = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'corrupt' };
      const version = (parsed as { version?: unknown }).version;
      if (typeof version === 'number' && version > this.version) return { error: 'version' };
      if (typeof version === 'number' && version >= 1 && version < FIRST_LOADABLE_VERSION && this.version >= FIRST_LOADABLE_VERSION) return { error: 'legacy' };
      const res = this.migrate(parsed as Record<string, unknown>);
      return res ?? { error: 'corrupt' };
    } catch {
      return { error: 'corrupt' };
    }
  }

  /**
   * Bring an older save up to the current version, then normalize it (unknown item ids are
   * removed and counted rather than failing the load). Returns null if impossible or invalid.
   */
  private migrate(data: Record<string, unknown>): { data: SaveData; dropped: number } | null {
    let v = data.version;
    if (!Number.isInteger(v) || (v as number) < 1) return null;
    let cur = data;
    while ((v as number) < this.version) {
      const step = this.migrations[v as number];
      if (!step) return null;
      v = (v as number) + 1;
      cur = { ...step(cur), version: v };
    }
    // The essentials must be there and typed before defaults fill the rest (a damaged run is never
    // silently replaced by a fresh one).
    if (!validateSaveData(cur)) return null;
    const { data: norm, report } = normalizeSave(cur);
    return validateSaveData(norm) ? { data: norm, dropped: report.dropped } : null;
  }
}

/** FNV-1a 32-bit hash over UTF-16 code units, as 8 lowercase hex digits. */
export function checksum(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Why nothing loaded: 'version' wins so a save from a newer build is reported as such; legacy is not an error. */
function loadError(...reads: SlotRead[]): LoadErrorCode | undefined {
  const errors = reads.map((r) => (r && 'error' in r ? r.error : undefined));
  return errors.includes('version') ? 'version' : errors.includes('corrupt') ? 'corrupt' : undefined;
}

function isLegacy(r: SlotRead): boolean {
  return !!r && 'error' in r && r.error === 'legacy';
}

function resolveLocalStorage(): WebStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { name, code } = err as { name?: unknown; code?: unknown };
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' || code === 22 || code === 1014;
}
