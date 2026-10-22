import type { ItemId } from '../../config/items';
import { ORDER_SLOTS, ORDER_TEMPLATES, REWARDS, type OrderKind, type Reward } from '../../config/quests';
import { Rng } from '../../core/rng';

/**
 * Camp orders (round 3, LOOP; BRIEF §0.3): three at a time plus one daily order. Each asks for a
 * small job sized to the deepest stratum (bank 12 copper, craft 6 torches, defeat 6 creatures, smelt
 * 5 bars, place 8 torches...), counts its progress from the bus, and is paid at camp. On each
 * return to camp the paid orders are replaced by new ones; the daily order changes with the date.
 * Pure: game/quests/Quests feeds it events and pays the rewards.
 */
export interface Order {
  id: string;
  kind: OrderKind;
  item: ItemId | null;
  need: number;
  have: number;
  reward: Reward;
  daily: boolean;
  stratum: number;
}

export interface OrdersSave {
  list: Order[];
  seq: number;
  /** Day number (UTC days since 1970) of the daily order. */
  day: number;
  done: number;
}

/** Make one order (deterministic per seed, sequence number and stratum). */
export function makeOrder(seed: number, seq: number, stratum: number, daily: boolean): Order {
  const rng = new Rng((seed ^ Math.imul(seq + 1, 0x9e3779b1) ^ (daily ? 0x5a5a : 0)) >>> 0);
  const s = Math.max(1, Math.min(6, stratum));
  const tpl = ORDER_TEMPLATES[Math.floor(rng.next() * ORDER_TEMPLATES.length) % ORDER_TEMPLATES.length];
  const scale = 1 + (s - 1) * 0.5;
  let item: ItemId | null = null;
  if (tpl.items) {
    const pool = tpl.items[s] ?? tpl.items[1];
    item = pool[Math.floor(rng.next() * pool.length) % pool.length];
  }
  const need = Math.max(2, Math.round(tpl.need * (daily ? 2 : 1) * (tpl.kind === 'deliver' || tpl.kind === 'craft' ? 1 : Math.sqrt(scale))));
  const rewards = REWARDS[s];
  const base = rewards[Math.floor(rng.next() * rewards.length) % rewards.length];
  const reward: Reward = {};
  for (const [k, v] of Object.entries(base) as Array<[ItemId, number]>) reward[k] = daily ? v * 2 : v;
  return { id: `order:${daily ? 'd' : ''}${seq}`, kind: tpl.kind, item, need, have: 0, reward, daily, stratum: s };
}

export class Orders {
  list: Order[] = [];
  seq = 0;
  day = -1;
  done = 0;

  constructor(private seed: number) {}

  setSeed(seed: number): void {
    this.seed = seed >>> 0;
  }

  /** Fill the 3 slots and the daily order (call on a new game, on load and on camp entry). */
  fill(stratum: number, today: number): void {
    const regular = this.list.filter((o) => !o.daily);
    while (regular.length < ORDER_SLOTS) {
      const o = makeOrder(this.seed, this.seq++, stratum, false);
      regular.push(o);
    }
    let daily = this.list.find((o) => o.daily) ?? null;
    if (!daily || this.day !== today) {
      daily = makeOrder(this.seed ^ today, today, stratum, true);
      daily.id = `order:d${today}`;
      this.day = today;
    }
    this.list = [...regular, daily];
  }

  /** Progress from the bus. @returns the orders that just became done. */
  progress(kind: OrderKind, item: ItemId | null, amount: number): Order[] {
    const out: Order[] = [];
    if (!(amount > 0)) return out;
    for (const o of this.list) {
      if (o.kind !== kind || o.have >= o.need) continue;
      if (o.item && o.item !== item) continue;
      o.have = Math.min(o.need, o.have + amount);
      if (o.have >= o.need) out.push(o);
    }
    return out;
  }

  /** At camp: take the done orders out (to be paid) and refill. */
  collect(stratum: number, today: number): Order[] {
    const paid = this.list.filter((o) => o.have >= o.need);
    if (paid.length === 0 && this.day === today) return [];
    this.list = this.list.filter((o) => o.have < o.need);
    this.done += paid.length;
    this.fill(stratum, today);
    return paid;
  }

  toJSON(): OrdersSave {
    return { list: this.list.map((o) => ({ ...o, reward: { ...o.reward } })), seq: this.seq, day: this.day, done: this.done };
  }

  load(x: unknown): void {
    this.list = [];
    this.seq = 0;
    this.day = -1;
    this.done = 0;
    if (!x || typeof x !== 'object') return;
    const o = x as Partial<OrdersSave>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    this.seq = Math.max(0, Math.floor(num(o.seq)));
    this.day = Math.floor(num(o.day)) || -1;
    this.done = Math.max(0, Math.floor(num(o.done)));
    if (Array.isArray(o.list))
      for (const r of o.list) {
        if (!r || typeof r !== 'object') continue;
        const q = r as Order;
        if (typeof q.id !== 'string' || !ORDER_TEMPLATES.some((t) => t.kind === q.kind)) continue;
        this.list.push({ id: q.id, kind: q.kind, item: (q.item as ItemId) ?? null, need: Math.max(1, num(q.need)), have: Math.max(0, num(q.have)), reward: { ...(q.reward ?? {}) }, daily: !!q.daily, stratum: Math.max(1, Math.min(6, num(q.stratum) || 1)) });
      }
  }
}

/** UTC day number for the daily order. */
export function dayNumber(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}
