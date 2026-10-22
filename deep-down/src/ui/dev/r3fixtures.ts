/**
 * Round 3 (UI): the UI sandbox's fixtures for the action layout's HUD and menus, so tools/ui-check.mjs
 * audits (and captures) what the strata game shows: the Bag and Craft menus over LOOP's real craft
 * rules and hotbar (game/craft), the Bestiary over MOBS's real log, a Map of a painted stratum with
 * every kind of marker and the river, the Quests, a trip card, the end card and today's Daily
 * Descent. Nothing here runs in the game.
 */
import { BIOMES, type BiomeId } from '../../config/biomes';
import { INVENTORY_CATEGORIES, ITEMS, type InventoryCategory, type ItemId } from '../../config/items';
import { RECIPES, RECIPE_CATEGORIES } from '../../config/recipes';
import { STATIONS, STATION_IDS, type StationId } from '../../config/stations';
import type { EventBus, GameEvents } from '../../core/events';
import { Noise } from '../../core/noise';
import { Craft } from '../../game/craft/CraftSystem';
import { Hotbar, modeOf } from '../../game/craft/Hotbar';
import type { BagItemView, BagView, CraftContext, CraftMenuView, ItemStore, LoopActions, RecipeCardView } from '../../game/craft/types';
import { BestiaryLog } from '../../game/mobs/bestiary';
import { ROSTERS, bestiary } from '../../game/mobs/rosters';
import type { MobKind } from '../../game/mobs/types';
import type { QuestsScreenView } from '../../game/quests/types';
import type { TripSummary } from '../../game/quests/Trip';
import { hasText, t, type TextKey } from '../../i18n';
import type { BestiaryView, DailyCard, HudSlot, MapMarker, MapSource, MapView } from '../types';

const CAT_KEY: Record<string, TextKey> = {
  tools: 'craft3.cat.tools', weapons: 'craft3.cat.weapons', armour: 'craft3.cat.armour', lanterns: 'craft3.cat.lanterns',
  consumables: 'craft3.cat.consumables', building: 'craft3.cat.building', stations: 'craft3.cat.stations', smelting: 'craft3.cat.smelting',
  camp: 'craft3.cat.camp', trader: 'craft3.cat.trader',
};
const BAG_KEY: Record<InventoryCategory, TextKey> = {
  materials: 'bag3.cat.materials', gear: 'bag3.cat.gear', consumables: 'bag3.cat.consumables', building: 'bag3.cat.building', key: 'bag3.cat.key',
};

/** A plain counted store (the fake bag and bank). */
class Store implements ItemStore {
  readonly n = new Map<ItemId, number>();
  constructor(private readonly cap = Infinity) {}
  count(item: ItemId): number {
    return this.n.get(item) ?? 0;
  }
  remove(item: ItemId, count: number): number {
    const have = this.count(item);
    const k = Math.min(have, count);
    if (have - k > 0) this.n.set(item, have - k);
    else this.n.delete(item);
    return k;
  }
  add(item: ItemId, count: number): number {
    const k = Math.min(count, this.room(item));
    if (k > 0) this.n.set(item, this.count(item) + k);
    return k;
  }
  room(item: ItemId): number {
    return this.n.has(item) || this.n.size < this.cap ? 999 : 0;
  }
}

/** The fake loop: a bag, a bank in reach, the Workbench near, LOOP's craft rules and hotbar. */
export interface FixtureLoop extends LoopActions {
  hudSlots(): HudSlot[];
  /** Stations in reach (the sandbox's scenes set it). */
  near: Set<StationId>;
  bankNear: boolean;
}

export function fixtureLoop(bus: EventBus<GameEvents>): FixtureLoop {
  const bag = new Store(24);
  const bank = new Store();
  const owned = new Set<ItemId>(['crudePick', 'copperPick', 'machete', 'brassLantern'] as ItemId[]);
  const equipped: Partial<Record<string, ItemId>> = { pick: 'copperPick' as ItemId, weapon: 'machete' as ItemId, lantern: 'brassLantern' as ItemId };
  const fill: Array<[string, number]> = [
    ['stone', 46], ['copperOre', 11], ['copperIngot', 6], ['coal', 7], ['fungalWood', 9], ['amber', 3], ['sporeQuartz', 2], ['glowcap', 5],
    ['hide', 2], ['chitin', 3], ['fang', 1], ['gel', 2], ['torch', 12], ['ladder', 2], ['rope', 1], ['plank', 8], ['bandage', 3],
    ['oilFlask', 2], ['flare', 2], ['blastBomb', 3], ['healingDraught', 1], ['outpostKit', 1], ['glimmerShard', 2],
  ];
  for (const [id, n] of fill) if (id in ITEMS) bag.add(id as ItemId, n);
  for (const [id, n] of [['stone', 120], ['copperOre', 14], ['coal', 9], ['fungalWood', 12], ['ironOre', 5]] as Array<[string, number]>) if (id in ITEMS) bank.add(id as ItemId, n);
  const known = new Set<ItemId>(Object.keys(ITEMS) as ItemId[]);
  const near = new Set<StationId>(['hand', 'workbench']);
  const state = { bankNear: true };
  const hotbar = new Hotbar({
    count: (i) => bag.count(i),
    pick: () => (equipped.pick ?? 'crudePick') as ItemId,
    weapon: () => (equipped.weapon ?? null) as ItemId | null,
  });
  for (const id of ['blastBomb', 'torch', 'bandage', 'ladder'] as ItemId[]) if (id in ITEMS) hotbar.offer(id);
  const ctx = (): CraftContext => ({ bag, bank: state.bankNear ? bank : null, stations: near, known, stratum: 2, owned });
  const card = (r: (typeof RECIPES)[number]): RecipeCardView | null => {
    const c = Craft.can(r, ctx(), 1);
    if (c.state === 'hidden') return null;
    const out = ITEMS[r.output.item];
    const inputs = (Object.entries(r.inputs) as Array<[ItemId, number]>).map(([item, need]) => ({ item, name: t(ITEMS[item].name), have: c.have[item] ?? 0, need }));
    const reason =
      c.state === 'station' ? t('craft3.needStation', { station: t(STATIONS[r.station].name) })
      : c.state === 'missing' ? t('craft3.missing', { items: inputs.filter((x) => x.have < x.need).map((x) => `${x.need - x.have} ${x.name}`).join(', ') })
      : c.state === 'fuel' ? t('craft3.noFuel')
      : c.state === 'owned' ? t('craft3.owned')
      : null;
    return {
      id: r.id,
      category: r.category,
      station: r.station,
      stationName: t(STATIONS[r.station].name),
      output: { item: r.output.item, count: r.output.count, name: t(out.name), desc: t(out.desc), grade: out.grade },
      inputs,
      fuel: r.fuel && STATIONS[r.station].fuel ? { have: c.fuelHave, need: r.fuel } : null,
      state: c.state,
      reason,
      max: c.max,
      fresh: r.id === 'ladder' || r.id === 'machete',
      stat: out.equip ? `${t(`gear3.${out.equip}` as TextKey)}${out.tier ? ` · ${'I II III IV V VI'.split(' ')[out.tier - 1] ?? out.tier}` : ''}` : null,
    };
  };
  const loop: FixtureLoop = {
    near,
    get bankNear() {
      return state.bankNear;
    },
    set bankNear(b: boolean) {
      state.bankNear = b;
    },
    craftView(): CraftMenuView {
      const cards = RECIPES.map(card).filter((c): c is RecipeCardView => c !== null);
      cards.sort((a, b) => Number(b.state === 'ok') - Number(a.state === 'ok'));
      return {
        categories: RECIPE_CATEGORIES.map((id) => ({ id, name: t(CAT_KEY[id]), ready: cards.filter((c) => c.category === id && c.state === 'ok').length, total: cards.filter((c) => c.category === id).length })),
        cards,
        stations: STATION_IDS.map((id) => ({ id, name: t(STATIONS[id].name), near: near.has(id) })),
        bank: state.bankNear,
      };
    },
    craft(id, times = 1) {
      const r = RECIPES.find((x) => x.id === id)!;
      const out = Craft.craft(r, ctx(), times);
      if (out.ok) {
        if (ITEMS[r.output.item].equip) owned.add(r.output.item);
        hotbar.offer(r.output.item);
        bus.emit('craft:made', { recipe: id, item: r.output.item, count: out.added, times: out.made } as GameEvents['craft:made']);
        bus.emit('inventory:changed', {});
      }
      return out;
    },
    bagView(): BagView {
      const items = Object.fromEntries(INVENTORY_CATEGORIES.map((c) => [c, [] as BagItemView[]])) as Record<InventoryCategory, BagItemView[]>;
      const ids = new Set<ItemId>([...bag.n.keys(), ...owned]);
      for (const id of ids) {
        const d = ITEMS[id];
        const isOwned = !!d.equip && owned.has(id);
        const count = isOwned ? 1 : bag.count(id);
        if (count <= 0) continue;
        const worn = !!d.equip && equipped[d.equip] === id;
        const actions: BagItemView['actions'] = [];
        if (d.use && d.use.kind !== 'bomb' && d.use.kind !== 'flare') actions.push('use');
        if (d.equip && !worn) actions.push('equip');
        if (d.place) actions.push('place');
        if (!d.equip) actions.push('assign', 'drop');
        if (!d.equip && state.bankNear) actions.push('bank');
        items[d.category].push({ item: id, count, name: t(d.name), desc: t(d.desc), category: d.category, grade: d.grade, actions, equipped: worn });
      }
      const slots = ['pick', 'weapon', 'lantern', 'pack', 'head', 'chest', 'feet'] as const;
      return {
        slots: [...bag.n].map(([item, count]) => ({ item, count })),
        used: bag.n.size,
        max: 24,
        pouch: 0,
        items,
        categories: INVENTORY_CATEGORIES.map((id) => ({ id, name: t(BAG_KEY[id]), count: items[id].length })),
        bank: state.bankNear ? Object.fromEntries(bank.n) : null,
        gear: {
          equipped: Object.fromEntries(slots.map((s) => [s, equipped[s] ?? null])) as BagView['gear']['equipped'],
          slots: slots.map((s) => ({ slot: s, name: t(`gear3.${s}` as TextKey), item: (equipped[s] ?? null) as ItemId | null, itemName: equipped[s] ? t(ITEMS[equipped[s]!].name) : '' })),
          armour: 0.12,
          set: null,
          wards: { cold: 0.2, gas: 0, heat: 0, dark: 0 },
          pickTier: 2,
          lanternTier: 2,
        },
      };
    },
    hotbarView: () => hotbar.view(),
    hudSlots(): HudSlot[] {
      return hotbar.view().slots.map((s) => ({ item: s.item, name: s.item ? t(ITEMS[s.item].name) : '', count: s.count, placeable: !!s.item && modeOf(s.item) === 'place' }));
    },
    use(item) {
      if (!ITEMS[item].use || bag.count(item) <= 0) return false;
      bag.remove(item, 1);
      bus.emit('inventory:changed', {});
      return true;
    },
    equip(item) {
      const d = ITEMS[item];
      if (!d.equip) return false;
      equipped[d.equip] = item;
      bus.emit('inventory:changed', {});
      return true;
    },
    assign(slot, item) {
      hotbar.assign(slot, item);
    },
    selectHotbar(slot) {
      hotbar.select(slot);
    },
    bankAll() {
      let n = 0;
      for (const [id, c] of [...bag.n]) {
        if (ITEMS[id].equip || ITEMS[id].use || ITEMS[id].place) continue;
        n += bank.add(id, bag.remove(id, c));
      }
      bus.emit('inventory:changed', {});
      return n;
    },
    withdraw(item, count) {
      return bag.add(item, bank.remove(item, count));
    },
  };
  return loop;
}

/** A painted stratum round the explorer: tunnels and two halls explored, two biomes, relief, every marker. */
export function fixtureMap(biomes: [BiomeId, BiomeId] = ['amberHollows', 'mushroomForest']): MapView {
  const W = 256;
  const noise = new Noise(11);
  const px = 118;
  const pz = 134;
  const cls = new Uint8Array(W * W);
  const hts = new Float32Array(W * W);
  for (let z = 0; z < W; z++)
    for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - px, z - pz);
      if (d > 70) continue;
      const ridge = Math.abs(noise.fbm2(x / 38, z / 38, 3));
      const hall = Math.hypot(x - (px + 16), z - (pz - 10)) < 15 || Math.hypot(x - (px - 24), z - (pz + 18)) < 11;
      const open = hall || ridge < 0.07;
      const seen = d < 60 - noise.noise2(x / 9, z / 9) * 10;
      if (!seen) continue;
      cls[x + z * W] = open ? (noise.noise2(x / 6 + 40, z / 6) > 0.62 ? 4 : 2) : 1;
      hts[x + z * W] = 52 + noise.fbm2(x / 30 + 9, z / 30, 3) * 12;
    }
  const markers: MapMarker[] = [
    { kind: 'camp', x: px - 4, z: pz + 6 },
    { kind: 'outpost', x: px + 40, z: pz - 18, id: 'op1' },
    { kind: 'lair', x: px + 28, z: pz + 30, label: t(BIOMES[biomes[0]].name) },
    { kind: 'gate', x: px - 46, z: pz - 22 },
    { kind: 'page', x: px + 12, z: pz + 22, id: 'p1' },
    { kind: 'page', x: px - 18, z: pz - 30, id: 'p2', done: true },
    { kind: 'chest', x: px + 8, z: pz - 14, id: 'c1' },
    { kind: 'chest', x: px - 30, z: pz + 8, id: 'c2', done: true },
    { kind: 'vista', x: px + 16, z: pz - 10, id: 'vista_1', label: hasText('site.honeyCathedral.title') ? t('site.honeyCathedral.title' as TextKey) : undefined },
    { kind: 'river', x: px - 40, z: pz + 30, id: 'river_1' },
    { kind: 'works', x: px + 44, z: pz + 6, id: 'works_1' },
    { kind: 'secret', x: px - 10, z: pz - 44, id: 'secret_1' },
    { kind: 'place', x: px - 24, z: pz + 18, id: 'set_1' },
    { kind: 'ravine', x: px + 30, z: pz - 36, id: 'rav_1' },
    { kind: 'nest', x: px + 36, z: pz + 44, id: 'nest_1' },
    { kind: 'cache', x: px + 20, z: pz + 8, id: 'cache', label: t('m3.map.cacheLabel', { count: 23 }) },
    { kind: 'objective', x: px + 28, z: pz + 30 },
  ];
  const river: number[] = [];
  for (let k = 0; k <= 60; k++) river.push(px - 40 + k * 0.95, pz + 30 - k * 0.5 + Math.sin(k / 6) * 4);
  const src: MapSource = {
    width: W,
    depth: W,
    originX: 0,
    originZ: 0,
    revision: 1,
    cell: (x, z) => cls[Math.floor(x) + Math.floor(z) * W] ?? 0,
    biome: (x, z) => (x + noise.noise2(z / 40, 3) * 30 > px + 6 ? 1 : 0),
    height: (x, z) => hts[Math.floor(x) + Math.floor(z) * W] ?? 0,
    biomeColors: [hexOf(BIOMES[biomes[0]].light), hexOf(BIOMES[biomes[1]].light), 0xff5a3a],
    markers,
    lines: [{ kind: 'water', runs: [river] }],
    heightRange: [42, 68],
    playerX: px,
    playerZ: pz,
    yaw: 0.6,
  };
  return {
    source: src,
    stratum: 1,
    stratumName: `${t('stratum.1' as TextKey)} · ${biomes.map((b) => t(BIOMES[b].name)).join(' & ')}`,
    biomes: biomes.map((b, i) => ({ name: t(BIOMES[b].name), color: src.biomeColors[i], explored: i ? 0.18 : 0.42 })),
    travel: [
      { id: 'camp', name: t('m3.map.campName'), x: px - 4, z: pz + 6, here: true, can: false, reason: null, stratum: 1 },
      { id: 'op1', name: t('m3.map.outpostIn', { biome: t(BIOMES[biomes[1]].name) }), x: px + 40, z: pz - 18, here: false, can: true, reason: null, stratum: 1 },
      { id: 'op2', name: t('m3.map.outpostIn', { biome: t(BIOMES.rootGalleries.name) }), x: 60, z: 70, here: false, can: true, reason: null, stratum: 2 },
    ],
    seed: '48151623',
    places: { found: 4, total: 9 },
  };
}

function hexOf(rgb: readonly number[]): number {
  const c = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 255);
  return (c(rgb[0]) << 16) | (c(rgb[1]) << 8) | c(rgb[2]);
}

/** MOBS's real bestiary log, with a few pages met, scanned and defeated. */
export function fixtureBestiary(): BestiaryView {
  const log = new BestiaryLog();
  const kinds: Array<[string, 'see' | 'scan' | 'defeat']> = [['crawler', 'defeat'], ['gritBoar', 'scan'], ['amberTick', 'defeat'], ['glimmerkin', 'see'], ['lampling', 'scan'], ['moth', 'see'], ['gillhanger', 'see']];
  for (const [k, how] of kinds) {
    try {
      if (how === 'see') log.see(k as MobKind);
      else if (how === 'scan') log.scan(k as MobKind);
      else log.defeat(k as MobKind);
    } catch {
      // A kind MOBS renamed: the page simply stays unmet.
    }
  }
  return log.view();
}

/** The name of a biome's guardian (MOBS's text), for the fixtures' quest lines. */
export function guardianName(b: BiomeId): string {
  const kind = ROSTERS[b as keyof typeof ROSTERS]?.guardian;
  const key = kind ? bestiary(kind).nameKey : '';
  return key && hasText(key) ? t(key as TextKey) : b;
}

/** The Quests screen mid-stratum I (LOOP's real text): the chain, a shard, tasks, orders, feats and pages. */
export function fixtureQuests(): QuestsScreenView {
  const step = (text: string, done: boolean, current = false) => ({ text, done, current });
  const s1 = t('stratum.1' as TextKey);
  const a = t(BIOMES.amberHollows.name);
  const m = t(BIOMES.mushroomForest.name);
  const second = t('quest.step.guardian', { guardian: guardianName('mushroomForest'), biome: m });
  const reward = t('quest.reward', { items: `3 ${t(ITEMS.copperIngot.name)}` });
  const reward2 = t('quest.reward', { items: `8 ${t(ITEMS.torch.name)}` });
  return {
    main: [
      {
        stratum: 1,
        name: s1,
        steps: [
          step(t('quest.step.tutorial'), true),
          step(t('quest.step.lairs', { stratum: s1, have: 2, need: 2 }), true),
          step(t('quest.step.guardian', { guardian: guardianName('amberHollows'), biome: a }), true),
          step(second, false, true),
          step(t('quest.step.gate', { stratum: s1 }), false),
        ],
      },
      { stratum: 2, name: t('stratum.2' as TextKey), steps: [step(t('quest.step.descend', { next: t('stratum.2' as TextKey) }), false)] },
    ],
    current: { id: 'main.1.guardian.mushroomForest', kind: 'main', title: t('quest.main.title'), text: second, target: null, progress: { have: 1, need: 2 }, reward: null } as unknown as QuestsScreenView['current'],
    tracked: 'order.1',
    biomes: [
      { biome: 'amberHollows', name: a, visited: true, tasks: [{ id: 'task.a1', text: t('task.mine', { need: 10, biome: a }), have: 6, need: 10, done: false, reward }, { id: 'task.a2', text: t('task.torches', { need: 5, biome: a }), have: 5, need: 5, done: true, reward: reward2 }] },
      { biome: 'mushroomForest', name: m, visited: true, tasks: [{ id: 'task.m1', text: t('task.hunt', { need: 6, biome: m }), have: 2, need: 6, done: false, reward }] },
    ],
    orders: [
      { id: 'order.1', text: t('order.deliver', { need: 8, item: t(ITEMS.copperOre.name) }), have: 4, need: 8, done: false, reward, daily: false },
      { id: 'order.2', text: t('order.craft', { need: 3, item: t(ITEMS.torch.name) }), have: 3, need: 3, done: true, reward: reward2, daily: false },
      { id: 'order.d', text: t('order.hunt', { need: 5 }), have: 0, need: 5, done: false, reward: reward2, daily: true },
    ] as unknown as QuestsScreenView['orders'],
    feats: [
      { id: 'firstCraft', name: t('feat3.firstCraft'), text: t('feat3.firstCraft.text'), earned: true },
      { id: 'firstTorch', name: t('feat3.firstTorch'), text: t('feat3.firstTorch.text'), earned: true },
      { id: 'firstGuardian', name: t('feat3.firstGuardian'), text: t('feat3.firstGuardian.text'), earned: false },
    ],
    pages: [
      { n: 1, title: t('page.1.title' as TextKey), body: t('page.1.body' as TextKey), found: true },
      { n: 2, title: '', body: '', found: false },
    ],
    shards: { have: 1, total: 12, biomes: ['amberHollows'] },
    free: false,
  };
}

/** A trip card: back from the first stratum with a record. */
export function fixtureTrip(outcome: 'returned' | 'blackout' = 'returned'): TripSummary {
  const lines = [
    [t('trip3.time'), t('trip3.minutes', { m: 9, s: 42 })],
    [t('trip3.deepest'), '-74 m'],
    [t('trip3.biomes'), `${t(BIOMES.amberHollows.name)}, ${t(BIOMES.mushroomForest.name)}`],
    [t('trip3.finds'), '23 · 4 · 1'],
    [t('trip3.rarest'), t(ITEMS.sporeQuartz.name)],
    [t('trip3.kills'), '6'],
    [t('trip3.crafted'), '3'],
    [t('trip3.torches'), '5'],
    [t('trip3.banked'), '41'],
  ] as const;
  return {
    n: 3,
    outcome,
    seconds: 582,
    deepest: 74,
    stratum: 1,
    biomes: ['amberHollows', 'mushroomForest'],
    finds: { common: 23, uncommon: 4, rare: 1, epic: 0, legendary: 0 },
    rarest: 'sporeQuartz' as ItemId,
    kills: 6,
    crafted: 3,
    torches: 5,
    shards: [],
    orders: 1,
    pages: 1,
    bestiary: 2,
    banked: 41,
    records: outcome === 'returned' ? ['depth', 'finds'] : [],
    next: t('quest.step.guardian', { guardian: guardianName('mushroomForest'), biome: t(BIOMES.mushroomForest.name) }),
    lines: lines.map(([label, value]) => ({ label, value })),
    title: t(outcome === 'returned' ? 'trip3.title' : 'trip3.blackout'),
  };
}

/** The strata's end card. */
export function fixtureEnding(): { title: string; body: string; free: string; lines: Array<{ label: string; value: string }> } {
  return {
    title: t('ending3.title'),
    body: t('ending3.body'),
    free: t('ending3.free'),
    lines: [
      { label: t('ending3.time'), value: t('ending3.hm', { h: 2, m: 31 }) },
      { label: t('trip3.shards'), value: '12 / 12' },
      { label: t('trip3.pages'), value: '19 / 24' },
      { label: t('ending3.bestiary'), value: '57' },
      { label: t('trip3.kills'), value: '412' },
      { label: t('ending3.feats'), value: '23' },
    ],
  };
}

/** Today's Daily Descent. */
export function fixtureDaily(): DailyCard {
  return { title: t('daily3.title', { date: '2026-10-22' }), goalText: t('daily3.goal.guardian'), modTexts: [t('daily3.mod.swarm')], best: null };
}
