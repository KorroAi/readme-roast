import { packForTier } from '../config/balance';
import type { ItemId } from '../config/items';
import { NODES, nodeInputs, type NodeDef, type NodeId, type Prereq } from '../config/recipes';
import type { ItemCounts } from '../save/types';
import type { Equipment } from './Equipment';
import type { Backpack } from './Inventory';
import type { CampStorage } from './Storage';

/**
 * The upgrade tree's rules (config/recipes NODES).
 *
 * - Camp nodes (the Workbench, the Forge, a camp plot) are paid from camp storage plus the pack,
 *   storage first, so the pack keeps its room for the next trip. They can only be made at camp.
 * - Field sites are paid from the pack only, at the site: the cost has to be carried there.
 * - A node with an unmet prerequisite is locked, whatever is on hand.
 */

/** Why a node can or cannot be made now. Precedence: owned > locked > notHere > carryToSite > missing. */
export type CraftReason = 'ok' | 'owned' | 'locked' | 'notHere' | 'missing' | 'carryToSite';

/** Everything the rules read. */
export interface CraftContext {
  backpack: Backpack;
  storage: CampStorage;
  equipment: Equipment;
  /** Stations and gear built (node ids). Equipment nodes are owned by tier instead. */
  built: ReadonlySet<string>;
  atCamp: boolean;
  /** The Rift reached (the journal's 'undercroft'). */
  rift: boolean;
  /** A rune found (the Ancient Tablet counts). */
  rune: boolean;
  /** Field sites only: the explorer stands at this node's site. */
  atSite?: (id: NodeId) => boolean;
}

export interface CraftResult {
  ok: boolean;
  reason: CraftReason;
  /** Per input: how many more are needed from the node's payment source (only inputs that are short). */
  missing: ItemCounts;
  /** Per input: how many the node's payment source holds (storage + pack, or the pack for a field site). */
  have: ItemCounts;
  /** Prerequisites not met yet, in the node's order. */
  unmet: Prereq[];
  /**
   * Set when a successful craft upgraded the pack: the backpack's new slot count (craft() has
   * already resized it). Null for every other outcome.
   */
  packSlots: number | null;
}

/** The node's definition (throws for an unknown id: a programming error, not a player state). */
export function nodeDef(id: NodeId): NodeDef {
  const n = NODES[id];
  if (!n) throw new Error(`Crafting: unknown node "${id}"`);
  return n;
}

/** True once the node is made: its equipment tier is reached, or its station / gear is built. */
export function isOwned(def: NodeDef, equipment: Equipment, built: ReadonlySet<string>): boolean {
  if (def.repeat) return false;
  const r = def.result;
  return r.kind === 'equip' ? equipment.tier(r.slot) >= r.tier : built.has(def.id);
}

/** True when one prerequisite holds. */
export function prereqMet(p: Prereq, ctx: Pick<CraftContext, 'equipment' | 'built' | 'rift' | 'rune'>): boolean {
  if (p === 'rift') return ctx.rift;
  if (p === 'rune') return ctx.rune;
  return isOwned(nodeDef(p), ctx.equipment, ctx.built);
}

/** Can a node be made right now, and if not, why? Changes nothing. */
export function evaluate(node: NodeId | NodeDef, ctx: CraftContext): CraftResult {
  const def = typeof node === 'string' ? nodeDef(node) : node;
  const id = def.id;
  const field = def.place === 'field';
  const have: ItemCounts = {};
  const missing: ItemCounts = {};
  let short = false;
  for (const [item, need] of nodeInputs(def)) {
    const n = ctx.backpack.count(item) + (field ? 0 : ctx.storage.count(item));
    have[item] = n;
    if (n < need) {
      missing[item] = need - n;
      short = true;
    }
  }
  const unmet = def.prereqs.filter((p) => !prereqMet(p, ctx));
  let reason: CraftReason;
  if (isOwned(def, ctx.equipment, ctx.built)) reason = 'owned';
  else if (unmet.length > 0) reason = 'locked';
  else if (field) reason = ctx.atSite?.(id) ? (short ? 'missing' : 'ok') : short ? 'missing' : 'carryToSite';
  else if (!ctx.atCamp) reason = 'notHere';
  else reason = short ? 'missing' : 'ok';
  return { ok: reason === 'ok', reason, missing, have, unmet, packSlots: null };
}

/**
 * Make node `id`: on success spends the inputs (camp: storage first, then the pack; field: the
 * pack), and applies an equipment result (a pack result also resizes `ctx.backpack`). Stations and
 * gear are recorded by the caller (Progression), which owns `built`. Nothing changes on failure.
 */
export function craft(node: NodeId | NodeDef, ctx: CraftContext): CraftResult {
  const res = evaluate(node, ctx);
  if (!res.ok) return res;
  const def = typeof node === 'string' ? nodeDef(node) : node;
  pay(def, ctx.backpack, ctx.storage);
  const r = def.result;
  if (r.kind === 'equip') {
    ctx.equipment.upgrade(r.slot, r.tier);
    if (r.slot === 'pack') {
      const pack = packForTier(ctx.equipment.tier('pack'));
      res.packSlots = pack.slots;
      ctx.backpack.resize(pack.slots, pack.pouch);
    }
  }
  return res;
}

/** Spend a node's inputs (assumes they are there). */
export function pay(def: NodeDef, backpack: Backpack, storage: CampStorage): void {
  const field = def.place === 'field';
  for (const [item, need] of nodeInputs(def)) {
    const fromStorage = field ? 0 : storage.remove(item, need);
    backpack.remove(item, need - fromStorage);
  }
}

/** How many of a node's materials are on hand (capped at each need), and how many it needs in all. */
export function progressOf(def: NodeDef, have: ItemCounts): { have: number; need: number } {
  let h = 0;
  let n = 0;
  for (const [item, need] of nodeInputs(def)) {
    h += Math.min(need, have[item as ItemId] ?? 0);
    n += need;
  }
  return { have: h, need: n };
}

/** Namespace-style access used by the game: Crafting.evaluate / Crafting.craft. */
export const Crafting = { evaluate, craft } as const;
