import { ITEMS, isItem, type BiomeKey, type ItemId } from '../../config/items';
import { CAMP_BONUS, CAMP_UPGRADES, CAMP_UPGRADE_IDS, TRADER_SLOTS, TRADES, TROPHY_SPOTS, type CampUpgradeId, type TradeDef } from '../../config/camp';
import { recipeById } from '../../config/recipes';
import { STATIONS } from '../../config/stations';
import { B } from '../../config/blocks';
import { Rng } from '../../core/rng';
import { hasText, t, type TextKey } from '../../i18n';
import { ROSTERS } from '../mobs/rosters';
import type { BuiltThing } from './Builder';
import type { CostView, CraftCheck, CraftContext, CraftOutcome, ItemCounts, RecipeCardView } from './types';
import { deliver } from './CraftSystem';

/**
 * The camp grows, and the trader (round 3 stretch, LOOP; BRIEF §6). Upgrades are built at the
 * camp's Workbench and change both what the camp looks like (props round the fire: tents, lamps, a
 * chimney, a trophy wall with a head for each guardian beaten, a mushroom garden) and the
 * expedition (max health, orders that pay more, half the Furnace's fuel at camp, weapon damage per
 * trophy, a harvest on each return). The trader sells barters (five at a time, new ones on each
 * return) and a few rare recipes (the Lampling's lure and treats, the deep stew, gem cutting).
 * Both appear as cards in the Crafting menu ('camp' and 'trader' tabs) and are made with craft().
 */
export interface CampSave {
  levels: Partial<Record<CampUpgradeId, number>>;
  bought: string[];
  offers: string[];
  visits: number;
}

export interface CampCtx extends CraftContext {
  /** At the stratum I camp (upgrades are built there, the trader waits there). */
  atCamp: boolean;
  deepest: number;
}

const STATE_REASON: Partial<Record<CraftCheck['state'], TextKey>> = {
  station: 'camp3.needCamp',
  missing: 'craft3.missing',
};

export class Camp {
  readonly levels: Record<CampUpgradeId, number> = { tents: 0, lamps: 0, chimney: 0, trophies: 0, garden: 0 };
  /** Rare recipes bought (recipe ids, and 'sockets' for gem cutting). */
  readonly bought = new Set<string>();
  /** The trader's barters on offer (trade ids). */
  offers: string[] = [];
  visits = 0;

  reset(): void {
    for (const id of CAMP_UPGRADE_IDS) this.levels[id] = 0;
    this.bought.clear();
    this.offers = [];
    this.visits = 0;
  }

  // ------------------------------------------------------------------------------------
  // Effects

  bonusHealth(): number {
    return CAMP_BONUS.tentHealth[this.levels.tents] ?? 0;
  }

  /** Orders pay this many times their reward. */
  orderFactor(): number {
    return 1 + (CAMP_BONUS.lampOrders[this.levels.lamps] ?? 0);
  }

  /** Furnace fuel multiplier at the camp. */
  fuelFactor(atCamp: boolean): number {
    return atCamp && this.levels.chimney > 0 ? CAMP_BONUS.chimneyFuel : 1;
  }

  /** Weapon damage multiplier from the trophy wall. */
  damageFactor(trophies: number): number {
    return this.levels.trophies > 0 ? 1 + CAMP_BONUS.trophyDamage * Math.max(0, trophies) : 1;
  }

  /** What the garden grew since the last return (paid on entering the camp). */
  harvest(): ItemCounts {
    return { ...(CAMP_BONUS.garden[this.levels.garden] ?? {}) };
  }

  /** Gem cutting was bought (sockets can be set at a Forge). */
  get gemCutting(): boolean {
    return this.bought.has('sockets');
  }

  // ------------------------------------------------------------------------------------
  // The trader's stock

  /** New wares (on a new game and each return to camp): TRADER_SLOTS barters of the depth reached. */
  restock(seed: number, deepest: number): void {
    this.visits++;
    const rng = new Rng((seed ^ Math.imul(this.visits + 7, 0x2c1b3c6d)) >>> 0);
    const pool = TRADES.filter((x) => !x.recipe && x.stratum <= deepest);
    // The deeper barters weigh more: what the explorer needs now.
    const picks: string[] = [];
    const left = [...pool];
    while (picks.length < TRADER_SLOTS && left.length > 0) {
      let total = 0;
      for (const x of left) total += 1 + x.stratum * (x.stratum >= deepest - 1 ? 2 : 0.5);
      let r = rng.next() * total;
      let k = 0;
      for (; k < left.length - 1; k++) {
        r -= 1 + left[k].stratum * (left[k].stratum >= deepest - 1 ? 2 : 0.5);
        if (r <= 0) break;
      }
      picks.push(left[k].id);
      left.splice(k, 1);
    }
    this.offers = picks;
  }

  /** The barters on offer and the next rare recipe not bought yet (one at a time). */
  stock(deepest: number): TradeDef[] {
    const out = this.offers.map((id) => TRADES.find((x) => x.id === id)).filter((x): x is TradeDef => !!x);
    const rare = TRADES.find((x) => x.recipe && x.stratum <= deepest && !this.bought.has(x.recipe));
    if (rare) out.push(rare);
    return out;
  }

  // ------------------------------------------------------------------------------------
  // The cards (the Crafting menu's 'camp' and 'trader' tabs)

  upgradeCards(ctx: CampCtx): RecipeCardView[] {
    const cards: RecipeCardView[] = [];
    for (const id of CAMP_UPGRADE_IDS) {
      const def = CAMP_UPGRADES[id];
      const lv = this.levels[id];
      const next = def.levels[lv] ?? null;
      const last = def.levels[def.levels.length - 1];
      const shown = next ?? last;
      if (!shown || shown.stratum > ctx.deepest) continue;
      const inputs = costs(shown.cost, ctx);
      const state: CraftCheck['state'] = !next ? 'owned' : !ctx.atCamp ? 'station' : inputs.some((c) => c.have < c.need) ? 'missing' : 'ok';
      cards.push({
        id: `camp:${id}`,
        category: 'camp',
        station: 'workbench',
        stationName: t('station.workbench'),
        output: { item: def.icon, count: 1, name: next ? t('camp3.level', { name: t(def.name), n: lv + 1 }) : t(def.name), desc: t(def.desc), grade: lv >= 1 ? 'rare' : 'uncommon' },
        inputs,
        fuel: null,
        state,
        reason: reasonOf(state, inputs, next ? null : t('camp3.maxed')),
        max: state === 'ok' ? 1 : 0,
        fresh: false,
        stat: t(shown.does),
      });
    }
    return cards;
  }

  traderCards(ctx: CampCtx): RecipeCardView[] {
    const cards: RecipeCardView[] = [];
    for (const x of this.stock(ctx.deepest)) {
      const inputs = costs(x.give, ctx);
      const rec = x.recipe && x.recipe !== 'sockets' ? recipeById(x.recipe) : null;
      const sold = !!x.recipe && this.bought.has(x.recipe);
      const state: CraftCheck['state'] = sold ? 'owned' : !ctx.atCamp ? 'station' : inputs.some((c) => c.have < c.need) ? 'missing' : ctx.bag.room(x.get.item) + (ctx.bank?.room(x.get.item) ?? 0) < x.get.count ? 'missing' : 'ok';
      let max = 0;
      if (state === 'ok') {
        max = x.recipe ? 1 : 99;
        for (const c of inputs) max = Math.min(max, Math.floor(c.have / c.need));
      }
      const outName = x.recipe === 'sockets' ? t('trader3.recipe.sockets') : t(ITEMS[x.get.item].name);
      cards.push({
        id: `trade:${x.id}`,
        category: 'trader',
        station: 'trader',
        stationName: t('station.trader'),
        output: {
          item: x.get.item,
          count: x.get.count,
          name: x.recipe ? t('trader3.recipe', { name: outName }) : outName,
          desc: x.recipe === 'sockets' ? t('trader3.recipe.sockets.desc') : t(ITEMS[x.get.item].desc),
          grade: x.recipe ? 'epic' : ITEMS[x.get.item].grade,
        },
        inputs,
        fuel: null,
        state,
        reason: sold ? t('trader3.sold') : state === 'station' ? t('trader3.needCamp') : reasonOf(state, inputs, null),
        max,
        fresh: !!x.recipe,
        stat: rec ? t('trader3.learned', { name: t(ITEMS[rec.output.item].name) }) : null,
      });
    }
    return cards;
  }

  // ------------------------------------------------------------------------------------
  // Making them

  build(id: CampUpgradeId, ctx: CampCtx): CraftOutcome {
    const def = CAMP_UPGRADES[id];
    const next = def?.levels[this.levels[id]] ?? null;
    const none = (state: CraftCheck['state']): CraftOutcome => ({ ok: false, made: 0, added: 0, check: { ok: false, state, have: {}, missing: {}, fuelHave: 0, fuelNeed: 0, max: 0 } });
    if (!def || !next) return none('owned');
    if (next.stratum > ctx.deepest) return none('hidden');
    if (!ctx.atCamp) return none('station');
    if (!payable(next.cost, ctx, 1)) return none('missing');
    pay(next.cost, ctx, 1);
    this.levels[id]++;
    return { ok: true, made: 1, added: 0, check: { ok: true, state: 'ok', have: {}, missing: {}, fuelHave: 0, fuelNeed: 0, max: 0 } };
  }

  trade(id: string, ctx: CampCtx, times = 1): CraftOutcome & { learned: string | null } {
    const x = this.stock(ctx.deepest).find((d) => d.id === id) ?? null;
    const none = (state: CraftCheck['state']): CraftOutcome & { learned: null } => ({ ok: false, made: 0, added: 0, learned: null, check: { ok: false, state, have: {}, missing: {}, fuelHave: 0, fuelNeed: 0, max: 0 } });
    if (!x) return none('hidden');
    if (x.recipe && this.bought.has(x.recipe)) return none('owned');
    if (!ctx.atCamp) return none('station');
    const want = x.recipe ? 1 : Math.max(1, Math.min(99, Math.floor(times) || 1));
    let n = want;
    while (n > 0 && !payable(x.give, ctx, n)) n--;
    if (n <= 0) return none('missing');
    const room = ctx.bag.room(x.get.item) + (ctx.bank?.room(x.get.item) ?? 0);
    if (room < x.get.count * n) return none('missing');
    pay(x.give, ctx, n);
    const added = deliver(ctx.bag, ctx.bank, x.get.item, x.get.count * n);
    if (x.recipe) this.bought.add(x.recipe);
    return { ok: true, made: n, added, learned: x.recipe ?? null, check: { ok: true, state: 'ok', have: {}, missing: {}, fuelHave: 0, fuelNeed: 0, max: 0 } };
  }

  // ------------------------------------------------------------------------------------
  // What the camp shows (stratum I)

  /**
   * The camp's props: every built level's, a guardian's trophy on the wall for each shard taken,
   * and the trader's cart by the fire. Positions are relative to the camp fire; the Builder settles
   * them on the floor.
   */
  props(fire: readonly [number, number, number], shards: readonly BiomeKey[]): BuiltThing[] {
    const [fx, fy, fz] = fire;
    const out: BuiltThing[] = [];
    for (const id of CAMP_UPGRADE_IDS) {
      const def = CAMP_UPGRADES[id];
      for (let lv = 0; lv < this.levels[id]; lv++) {
        def.levels[lv]?.props.forEach((p, k) => {
          out.push({
            id: `camp:${id}:${lv + 1}:${k}`,
            kind: 'decor',
            prop: p.kind,
            fallback: p.fallback,
            x: fx + p.dx,
            y: fy,
            z: fz + p.dz,
            rotY: p.rotY,
            scale: p.scale,
            settle: true,
            glow: p.kind === 'lanternPost' || p.kind === 'lairBrazier' ? B.LIGHT_AMBER : undefined,
          });
        });
      }
    }
    if (this.levels.trophies > 0) {
      shards.forEach((b, i) => {
        const spot = TROPHY_SPOTS[i];
        if (!spot) return;
        const order = Object.keys(ROSTERS).indexOf(b);
        out.push({ id: `camp:trophy:${b}`, kind: 'decor', prop: 'guardianTrophy', fallback: 'statue', x: fx + spot[0], y: fy, z: fz + spot[1], rotY: 0, scale: 0.55, settle: true, variant: Math.max(0, order) });
      });
    }
    // The trader's cart, by the fire (the Craft menu's trader tab).
    out.push({ id: 'camp:trader', kind: 'trader', x: fx + 6.5, y: fy, z: fz + 7.5, rotY: -2.4, settle: true });
    return out;
  }

  /** The guardian's name for the trophy toast. */
  static trophyName(b: BiomeKey): string {
    const g = ROSTERS[b as keyof typeof ROSTERS]?.guardian;
    const k = g ? `mob.${g}` : '';
    return k && hasText(k) ? t(k as TextKey) : b;
  }

  toJSON(): CampSave {
    const levels: Partial<Record<CampUpgradeId, number>> = {};
    for (const id of CAMP_UPGRADE_IDS) if (this.levels[id] > 0) levels[id] = this.levels[id];
    return { levels, bought: [...this.bought], offers: [...this.offers], visits: this.visits };
  }

  load(x: unknown): void {
    this.reset();
    if (!x || typeof x !== 'object') return;
    const o = x as Partial<CampSave>;
    if (o.levels && typeof o.levels === 'object')
      for (const id of CAMP_UPGRADE_IDS) {
        const v = (o.levels as Record<string, unknown>)[id];
        if (typeof v === 'number' && Number.isFinite(v)) this.levels[id] = Math.max(0, Math.min(CAMP_UPGRADES[id].levels.length, Math.floor(v)));
      }
    if (Array.isArray(o.bought)) for (const b of o.bought) if (typeof b === 'string' && (b === 'sockets' || recipeById(b))) this.bought.add(b);
    if (Array.isArray(o.offers)) this.offers = o.offers.filter((id): id is string => typeof id === 'string' && TRADES.some((d) => d.id === id && !d.recipe));
    this.visits = typeof o.visits === 'number' && Number.isFinite(o.visits) ? Math.max(0, Math.floor(o.visits)) : 0;
  }
}

function held(ctx: CraftContext, item: ItemId): number {
  return ctx.bag.count(item) + (ctx.bank ? ctx.bank.count(item) : 0);
}

function costs(cost: Partial<Record<ItemId, number>>, ctx: CraftContext): CostView[] {
  return (Object.entries(cost) as Array<[ItemId, number]>)
    .filter(([id, n]) => isItem(id) && n > 0)
    .map(([item, need]) => ({ item, name: t(ITEMS[item].name), have: held(ctx, item), need }));
}

function payable(cost: Partial<Record<ItemId, number>>, ctx: CraftContext, times: number): boolean {
  return (Object.entries(cost) as Array<[ItemId, number]>).every(([id, n]) => held(ctx, id) >= n * times);
}

/** Take the cost from the bank first, then the bag. */
function pay(cost: Partial<Record<ItemId, number>>, ctx: CraftContext, times: number): void {
  for (const [id, n] of Object.entries(cost) as Array<[ItemId, number]>) {
    let left = n * times;
    if (ctx.bank) left -= ctx.bank.remove(id, left);
    if (left > 0) ctx.bag.remove(id, left);
  }
}

function reasonOf(state: CraftCheck['state'], inputs: CostView[], owned: string | null): string | null {
  if (state === 'ok') return null;
  if (state === 'owned') return owned;
  if (state === 'missing') return t('craft3.missing', { items: inputs.filter((c) => c.have < c.need).map((c) => `${c.need - c.have} ${c.name}`).join(', ') });
  const key = STATE_REASON[state];
  return key ? t(key) : null;
}

void STATIONS;
