import { ITEMS, type BiomeKey, type ItemId } from '../../config/items';
import { RARITIES, RARITY_RANK, rarityOf, type Rarity } from '../../config/rarity';
import { BIOMES, allOres } from '../../config/biomes';
import type { EventBus, GameEvents } from '../../core/events';
import { hasText, t, type TextKey } from '../../i18n';

/**
 * The trip summary (round 3 stretch, LOOP; BRIEF §6): every return to camp ends a trip with a card
 * of what it brought (time out, the deepest point, finds by rarity and the rarest one, creatures,
 * crafts, torches, Heart Shards, orders, pages, bestiary pages, what was banked) and the records it
 * set (the deepest dive, the most creatures, the most finds, the longest trip). The counters follow
 * the bus; Loop starts a trip on 'camp:left' and ends it on 'camp:entered' or a black-out, then
 * emits 'trip:summary' for the UI's card.
 */
export type TripRecord = 'depth' | 'kills' | 'finds' | 'long';

/** Where a trip ended: the stratum I camp, a lower stratum's lift landing, an outpost's bed. */
export type TripEnd = 'camp' | 'lift' | 'outpost';

export interface TripSummary {
  n: number;
  outcome: 'returned' | 'blackout';
  /** Where it ended (the black-out: where the explorer wakes). Optional for older fixtures. */
  where?: TripEnd;
  seconds: number;
  /** Metres. */
  deepest: number;
  stratum: number;
  biomes: BiomeKey[];
  finds: Record<Rarity, number>;
  rarest: ItemId | null;
  kills: number;
  crafted: number;
  torches: number;
  shards: BiomeKey[];
  orders: number;
  pages: number;
  bestiary: number;
  banked: number;
  /** Named places reached for the first time on this trip (WORLD's 'world:site'; optional for older fixtures). */
  places?: number;
  /** Chests opened on this trip (optional for older fixtures). */
  chests?: number;
  records: TripRecord[];
  /** The main quest's step now (the card's "Next"). */
  next: string;
  /** Ready-made lines for the card: label and value, in order. */
  lines: Array<{ label: string; value: string }>;
  title: string;
}

export interface TripRecords {
  depth: number;
  kills: number;
  finds: number;
  long: number;
  trips: number;
}

interface Live {
  t0: number;
  deepest: number;
  stratum: number;
  biomes: Set<BiomeKey>;
  finds: Record<Rarity, number>;
  rarest: ItemId | null;
  rarestRank: number;
  kills: number;
  crafted: number;
  torches: number;
  shards: BiomeKey[];
  orders: number;
  pages: number;
  bestiary: number;
  banked: number;
  places: number;
  chests: number;
}

/** The ore item a block gives (for the rarest find's name). */
const ORE_ITEM = new Map<number, ItemId>(allOres().map((o) => [o.block & 255, o.item as ItemId]));

const zero = (): Record<Rarity, number> => ({ common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 });

export class Trip {
  private live: Live | null = null;
  records: TripRecords = { depth: 0, kills: 0, finds: 0, long: 0, trips: 0 };
  last: TripSummary | null = null;

  constructor(private readonly bus: EventBus<GameEvents>) {}

  wire(): void {
    const bus = this.bus;
    bus.on('block:broken', (e) => {
      const l = this.live;
      const r = rarityOf(e.block);
      if (!l || !r) return;
      l.finds[r]++;
      const rank = RARITY_RANK[r];
      const item = ORE_ITEM.get(e.block) ?? null;
      if (item && rank > l.rarestRank) {
        l.rarestRank = rank;
        l.rarest = item;
      }
    });
    bus.on('mob:died', (e) => {
      if (this.live && e.rank !== 'guardian' && e.rank !== 'boss') this.live.kills++;
    });
    bus.on('craft:made', (e) => {
      if (this.live) this.live.crafted += e.times;
    });
    bus.on('player:placed', (e) => {
      if (this.live && e.item === 'torch') this.live.torches++;
    });
    bus.on('quest:shard', (e) => this.live?.shards.push(e.biome));
    bus.on('order:paid', () => {
      if (this.live) this.live.orders++;
    });
    bus.on('quest:page', (e) => {
      if (this.live && e.first) this.live.pages++;
    });
    bus.on('mob:bestiary', (e) => {
      if (this.live && e.page === 'new') this.live.bestiary++;
    });
    bus.on('items:banked', (e) => {
      if (this.live) this.live.banked += e.total;
    });
    bus.on('world:biome', (e) => {
      if (this.live && e.biome !== 'heart' && e.biome in BIOMES) this.live.biomes.add(e.biome as BiomeKey);
    });
    bus.on('world:site', () => {
      if (this.live) this.live.places++;
    });
  }

  get active(): boolean {
    return this.live !== null;
  }

  /** A trip starts (the explorer left the camp). */
  start(now: number, stratum: number, biome: BiomeKey | null): void {
    this.live = {
      t0: now,
      deepest: 0,
      stratum,
      biomes: new Set(biome ? [biome] : []),
      finds: zero(),
      rarest: null,
      rarestRank: -1,
      kills: 0,
      crafted: 0,
      torches: 0,
      shards: [],
      orders: 0,
      pages: 0,
      bestiary: 0,
      banked: 0,
      places: 0,
      chests: 0,
    };
  }

  /** A chest was opened (Loop.chestOpened). */
  chestOpened(): void {
    if (this.live) this.live.chests++;
  }

  /** Each frame while out: the depth (metres) and the stratum. */
  follow(depth: number, stratum: number): void {
    const l = this.live;
    if (!l) return;
    if (depth > l.deepest) l.deepest = depth;
    if (stratum > l.stratum) l.stratum = stratum;
  }

  /**
   * The trip ends: its summary (null when there was none, or it was too short to tell: under 20 s
   * with nothing found). The orders paid and the bank at the camp count when they come right after.
   */
  end(now: number, outcome: TripSummary['outcome'], next: string, where: TripEnd = 'camp'): TripSummary | null {
    const l = this.live;
    this.live = null;
    if (!l) return null;
    const seconds = Math.max(0, now - l.t0);
    const finds = RARITIES.reduce((a, r) => a + l.finds[r], 0);
    if (seconds < 20 && finds === 0 && l.kills === 0 && l.shards.length === 0 && l.places === 0 && l.chests === 0) return null;
    const rec = this.records;
    rec.trips++;
    const records: TripRecord[] = [];
    if (rec.trips > 1) {
      if (l.deepest > rec.depth + 0.5) records.push('depth');
      if (l.kills > rec.kills && l.kills >= 5) records.push('kills');
      if (finds > rec.finds && finds >= 10) records.push('finds');
      if (seconds > rec.long && seconds >= 300) records.push('long');
    }
    rec.depth = Math.max(rec.depth, l.deepest);
    rec.kills = Math.max(rec.kills, l.kills);
    rec.finds = Math.max(rec.finds, finds);
    rec.long = Math.max(rec.long, seconds);
    const s: TripSummary = {
      n: rec.trips,
      outcome,
      seconds,
      deepest: Math.round(l.deepest),
      stratum: l.stratum,
      biomes: [...l.biomes],
      finds: { ...l.finds },
      rarest: l.rarest,
      kills: l.kills,
      crafted: l.crafted,
      torches: l.torches,
      shards: [...l.shards],
      orders: l.orders,
      pages: l.pages,
      bestiary: l.bestiary,
      banked: l.banked,
      places: l.places,
      chests: l.chests,
      records,
      next,
      lines: [],
      where,
      title: t(TITLE[outcome][where], { stratum: ROMAN_NUM[l.stratum] ?? '' }),
    };
    s.lines = linesOf(s);
    this.last = s;
    return s;
  }

  /** The orders paid and the items banked on arriving count for the trip just ended. */
  addArrival(orders: number, banked: number): void {
    const s = this.last;
    if (!s) return;
    s.orders += orders;
    s.banked += banked;
    s.lines = linesOf(s);
  }

  toJSON(): TripRecords {
    return { ...this.records };
  }

  load(x: unknown): void {
    this.live = null;
    this.last = null;
    this.records = { depth: 0, kills: 0, finds: 0, long: 0, trips: 0 };
    if (!x || typeof x !== 'object') return;
    const o = x as Partial<TripRecords>;
    for (const k of ['depth', 'kills', 'finds', 'long', 'trips'] as const) {
      const v = o[k];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) this.records[k] = v;
    }
  }
}

/** The card's title by how and where the trip ended. */
const TITLE: Record<TripSummary['outcome'], Record<TripEnd, TextKey>> = {
  returned: { camp: 'trip3.title', lift: 'trip3.title.lift', outpost: 'trip3.title.outpost' },
  blackout: { camp: 'trip3.blackout', lift: 'trip3.blackout.lift', outpost: 'trip3.blackout.outpost' },
};
const ROMAN_NUM = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'];

function minutes(s: number): string {
  const m = Math.floor(s / 60);
  return t('trip3.minutes', { m, s: Math.round(s - m * 60) });
}

function linesOf(s: TripSummary): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const add = (label: TextKey, value: string | number, when = true) => {
    if (when) out.push({ label: t(label), value: String(value) });
  };
  const finds = RARITIES.reduce((a, r) => a + s.finds[r], 0);
  add('trip3.time', minutes(s.seconds));
  add('trip3.deepest', t('loop3.metres', { n: s.deepest }));
  add('trip3.biomes', s.biomes.map((b) => (hasText(`biome.${b}.name`) ? t(`biome.${b}.name` as TextKey) : b)).join(t('loop3.listSep')), s.biomes.length > 0);
  add('trip3.finds', RARITIES.filter((r) => s.finds[r] > 0).map((r) => t('loop3.count', { n: s.finds[r], item: t(`rarity.${r}` as TextKey) })).join(t('loop3.dotSep')) || '0', true);
  add('trip3.rarest', s.rarest ? t(ITEMS[s.rarest].name) : '', !!s.rarest && finds > 0);
  add('trip3.kills', s.kills, s.kills > 0);
  add('trip3.shards', s.shards.length, s.shards.length > 0);
  add('trip3.crafted', s.crafted, s.crafted > 0);
  add('trip3.torches', s.torches, s.torches > 0);
  add('trip3.orders', s.orders, s.orders > 0);
  add('trip3.places', s.places ?? 0, (s.places ?? 0) > 0);
  add('trip3.chests', s.chests ?? 0, (s.chests ?? 0) > 0);
  add('trip3.pages', s.pages, s.pages > 0);
  add('trip3.bestiary', s.bestiary, s.bestiary > 0);
  add('trip3.banked', s.banked, s.banked > 0);
  // The records and the next step are not ledger rows: the card shows them apart (UI: a star list
  // above the ledger, the "Next" bar under it), so the real game showed each twice.
  return out;
}
