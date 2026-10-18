import { PLAYER, SAVE, lanternForTier, packForTier } from '../config/balance';
import { ITEMS } from '../config/items';
import { isItemId } from '../gameplay/counts';
import { OBJECTIVE_CHAIN } from '../gameplay/Objectives';
import type { WorldLayout } from '../world/gen/types';
import type { SaveData } from './types';

/** Upper bound for a backpack array in a save (far above any pack tier). */
const MAX_SLOTS = 64;

/** Fresh-expedition defaults: tier 1 gear, empty bags, standing at the spawn point. */
export function createNewSave(spawn: WorldLayout['spawn'], seed: number, now: number = Date.now()): SaveData {
  return {
    version: SAVE.version,
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
  };
}

/**
 * Structural check of untrusted data (parsed JSON) against the current SaveData shape.
 * Pure and total: never throws. It checks shape, not the version; SaveSystem migrates
 * older versions before validating.
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
    ['blocksMined', 'deaths', 'itemsBanked'].every((k) => count(st[k]))
  );
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

function strings(v: unknown): boolean {
  return Array.isArray(v) && v.every((s) => typeof s === 'string');
}
