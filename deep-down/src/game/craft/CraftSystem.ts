import { ITEMS, type ItemId } from '../../config/items';
import { RECIPE_BY_ID, recipeInputs, type Recipe } from '../../config/recipes';
import { STATIONS } from '../../config/stations';
import type { CraftCheck, CraftContext, CraftOutcome, CraftSystem, ItemCounts, ItemStore } from './types';

/**
 * The craft rules (round 3, LOOP). Pure: no events, no DOM; game/craft/Loop turns outcomes into
 * toasts, sounds and quest progress.
 *
 * - A recipe is visible once unlocked: 'start', 'seen' (every input held at least once), or a
 *   stratum entered.
 * - It is made at its station (in reach) from the bank first (at the camp or an outpost), then the
 *   bag, so the bag keeps room for the next run.
 * - Furnace recipes burn `fuel` units per craft, paid from fuel items (coal 4, heartwood 3,
 *   sulphur 3, black oil 2, wood 1) in FUEL_ITEMS order, never a recipe's own input.
 * - Gear (a pick, lantern, pack or weapon, any armour piece) is made once: an owned one shows 'owned'.
 * - The output goes to the bag; what does not fit goes to the bank, else the craft is refused.
 */

const MAX_TIMES = 99;

/** Gear kinds that are made once. */
const ONCE = new Set(['tool', 'weapon', 'armour', 'lantern', 'pack']);

/**
 * Fuel items in the order the Furnace burns them: the dedicated fuels first (coal, black oil,
 * sulphur), then fungal wood, and the rare heartwood last (both are building materials too).
 * Any other item with a fuel value follows, most units per item first.
 */
const FUEL_PRIORITY: readonly ItemId[] = ['coal', 'blackOil', 'sulphur', 'fungalWood', 'heartwood'];
export const FUEL_ITEMS: readonly ItemId[] = [
  ...FUEL_PRIORITY.filter((id) => (ITEMS[id].fuel ?? 0) > 0),
  ...(Object.keys(ITEMS) as ItemId[]).filter((id) => (ITEMS[id].fuel ?? 0) > 0 && !FUEL_PRIORITY.includes(id)).sort((a, b) => (ITEMS[b].fuel ?? 0) - (ITEMS[a].fuel ?? 0)),
];

export function resolveRecipe(x: Recipe | string): Recipe | null {
  return typeof x === 'string' ? RECIPE_BY_ID.get(x) ?? null : x;
}

export function isUnlocked(rec: Recipe, ctx: Pick<CraftContext, 'known' | 'stratum' | 'bought'>): boolean {
  const u = rec.unlock;
  if (u === 'start') return true;
  if (u === 'seen') return recipeInputs(rec).every(([id]) => ctx.known.has(id));
  if (u === 'trader') return ctx.bought?.has(rec.id) ?? false;
  return ctx.stratum >= u.stratum;
}

/** Is this output gear that is crafted once and already owned? */
export function isOwnedGear(item: ItemId, owned: ReadonlySet<ItemId>): boolean {
  return ONCE.has(ITEMS[item].kind) && owned.has(item);
}

/** The camp's chimney halves the Furnace's fuel (CraftContext.fuelFactor; 1 elsewhere). */
function fuelFactorOf(ctx: CraftContext): number {
  const f = ctx.fuelFactor ?? 1;
  return f > 0 && f <= 1 ? f : 1;
}

/** Whole fuel units for `times` crafts at `per` units each (a fraction rounds up once per batch). */
function fuelUnits(per: number, times: number): number {
  return per > 0 ? Math.ceil(per * times - 1e-9) : 0;
}

function held(ctx: CraftContext, item: ItemId): number {
  return ctx.bag.count(item) + (ctx.bank ? ctx.bank.count(item) : 0);
}

/** Fuel units on hand, leaving `reserve` of each item untouched (a recipe's own inputs). */
function fuelOnHand(ctx: CraftContext, reserve: ItemCounts): number {
  let units = 0;
  for (const id of FUEL_ITEMS) units += Math.max(0, held(ctx, id) - (reserve[id] ?? 0)) * (ITEMS[id].fuel ?? 0);
  return units;
}

function check(rec: Recipe, ctx: CraftContext, times: number): CraftCheck {
  const n = Math.max(1, Math.min(MAX_TIMES, Math.floor(times) || 1));
  const have: ItemCounts = {};
  const missing: ItemCounts = {};
  let short = false;
  let max = MAX_TIMES;
  const reserve: ItemCounts = {};
  for (const [item, need] of recipeInputs(rec)) {
    const h = held(ctx, item);
    have[item] = h;
    reserve[item] = need * n;
    max = Math.min(max, Math.floor(h / need));
    if (h < need * n) {
      missing[item] = need * n - h;
      short = true;
    }
  }
  const perFuel = (STATIONS[rec.station].fuel ? rec.fuel ?? 0 : 0) * fuelFactorOf(ctx);
  const fuelNeed = fuelUnits(perFuel, n);
  // Fuel is counted with the recipe's own inputs held back (a stack of coal is not both).
  const fuelHave = perFuel > 0 ? fuelOnHand(ctx, reserve) : 0;
  if (perFuel > 0) {
    const perCraftReserve: ItemCounts = {};
    for (const [item, need] of recipeInputs(rec)) perCraftReserve[item] = need * Math.max(1, max);
    max = Math.min(max, Math.floor(fuelOnHand(ctx, perCraftReserve) / perFuel + 1e-9));
  }
  let state: CraftCheck['state'];
  if (!isUnlocked(rec, ctx)) state = 'hidden';
  else if (isOwnedGear(rec.output.item, ctx.owned)) state = 'owned';
  else if (!ctx.stations.has(rec.station)) state = 'station';
  else if (short) state = 'missing';
  else if (fuelHave < fuelNeed) state = 'fuel';
  else state = 'ok';
  if (ONCE.has(ITEMS[rec.output.item].kind)) max = Math.min(max, 1);
  if (state !== 'ok') max = 0;
  return { ok: state === 'ok', state, have, missing, fuelHave, fuelNeed, max: Math.max(0, max) };
}

/** Take `count` from the bank first, then the bag. */
function spend(ctx: CraftContext, item: ItemId, count: number): void {
  let left = count;
  if (ctx.bank) left -= ctx.bank.remove(item, left);
  if (left > 0) ctx.bag.remove(item, left);
}

function spendFuel(ctx: CraftContext, units: number, reserve: ItemCounts): void {
  let left = units;
  for (const id of FUEL_ITEMS) {
    if (left <= 0) break;
    const per = ITEMS[id].fuel ?? 0;
    const free = Math.max(0, held(ctx, id) - (reserve[id] ?? 0));
    const take = Math.min(free, Math.ceil(left / per));
    if (take > 0) {
      spend(ctx, id, take);
      left -= take * per;
    }
  }
}

/** Put items in the bag, the rest in the bank. @returns how many found a place. */
export function deliver(bag: ItemStore, bank: ItemStore | null, item: ItemId, count: number): number {
  const a = bag.add(item, count);
  const b = a < count && bank ? bank.add(item, count - a) : 0;
  return a + b;
}

export const Craft: CraftSystem = {
  can(recipe, ctx, times = 1) {
    const rec = resolveRecipe(recipe);
    if (!rec) return { ok: false, state: 'hidden', have: {}, missing: {}, fuelHave: 0, fuelNeed: 0, max: 0 };
    return check(rec, ctx, times);
  },

  craft(recipe, ctx, times = 1) {
    const rec = resolveRecipe(recipe);
    const none = (c: CraftCheck): CraftOutcome => ({ ok: false, made: 0, added: 0, check: c });
    if (!rec) return none({ ok: false, state: 'hidden', have: {}, missing: {}, fuelHave: 0, fuelNeed: 0, max: 0 });
    const want = Math.max(1, Math.min(MAX_TIMES, Math.floor(times) || 1));
    const first = check(rec, ctx, 1);
    if (!first.ok) return none(first);
    const made = Math.min(want, first.max);
    // Room for the output: the bag, else the bank; refuse rather than lose anything.
    const out = rec.output.count * made;
    const room = ctx.bag.room(rec.output.item) + (ctx.bank ? ctx.bank.room(rec.output.item) : 0);
    if (room < out) return none({ ...first, ok: false, state: 'missing', max: 0 });
    const reserve: ItemCounts = {};
    for (const [item, need] of recipeInputs(rec)) reserve[item] = need * made;
    const fuel = fuelUnits((STATIONS[rec.station].fuel ? rec.fuel ?? 0 : 0) * fuelFactorOf(ctx), made);
    if (fuel > 0) spendFuel(ctx, fuel, reserve);
    for (const [item, need] of recipeInputs(rec)) spend(ctx, item, need * made);
    const added = deliver(ctx.bag, ctx.bank, rec.output.item, out);
    return { ok: true, made, added, check: check(rec, ctx, 1) };
  },
};
