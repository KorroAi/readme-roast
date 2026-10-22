import { ITEMS, isItem, type BiomeKey, type ItemId } from '../../config/items';
import {
  BESTIARY_MILESTONES,
  BIOME_TASKS,
  FEATS3,
  GUARDIAN_LOOT,
  GUIDE,
  NEXT_PICK,
  PAGE_COUNT,
  PLACES_DEFAULT,
  REWARDS,
  ROMAN,
  STRATUM_BIOMES,
  TUTORIAL,
  TUTORIAL_REWARD,
  stratumOfBiome,
  type BiomeTaskId,
  type FeatSnapshot3,
  type Reward,
} from '../../config/quests';
import type { EventBus, GameEvents } from '../../core/events';
import { hasText, t, type TextKey } from '../../i18n';
import { rarityOf } from '../../config/rarity';
import { ROSTERS } from '../mobs/rosters';
import { bestiary } from '../mobs/rosters';
import { chainOutline, mainStep, type LairInfo, type MainState, type MainStep } from './mainQuest';
import { Orders, dayNumber, type Order, type OrdersSave } from './Orders';
import type { OrderView, QuestStepView, QuestSystem, QuestsScreenView, TutorialStepId, TutorialStepView } from './types';

/** What the quests read of the world each time they look (Loop builds it). */
export interface QuestWorld {
  stratum: number;
  deepest: number;
  lairs: readonly LairInfo[];
  revealed(id: string): boolean;
  gate: { x: number; y: number; z: number; next: number | null } | null;
  gateOpen: boolean;
  heart: { x: number; y: number; z: number } | null;
  pickTier: number;
  at: { x: number; y: number; z: number };
  /** The biome under the explorer (null: the old world). */
  biome: BiomeKey | null;
  /** Bestiary pages found (MOBS). */
  bestiaryFound: number;
  /** Prop id → page number (the loaded stratum's pages). */
  pageOf(propId: string): number | null;
  /** Pages in a biome of the loaded stratum (0 when unknown). */
  pagesIn(biome: BiomeKey): number;
  fullSet: boolean;
  counters: { crafted: number; smelted: number; torches: number; outposts: number; upgrades?: number; trades?: number; gems?: number; dailies?: number };
  /** The loaded stratum's named places (WORLD's layout.sites with a name), for the 'places' task. */
  places?: ReadonlyArray<{ id: string; biome: BiomeKey }>;
  /** The nearest vein the pick can break, in view range (the tutorial's mining step points at it). */
  nearestVein?(): { x: number; y: number; z: number } | null;
  /** The nearest monster in range (the tutorial's fight step points at it), or null. */
  foe?(): { x: number; y: number; z: number } | null;
  /** Does the explorer own a weapon? (false: the guardian step says to make one first) */
  armed?(): boolean;
  /** The first weapon to make and where (the unarmed guardian step's line). */
  firstWeapon?(): { item: string; station: string };
  /** A craft the descent needs now (Loop's gear advice: a weapon, a ward, a lantern, an outpost), or null. */
  advice?(): Advice | null;
  /** Feats earned in the 1.x deep (kept by the "deep has changed" card): shown earned in the Quests screen. */
  legacyFeats?(): readonly string[];
}

/** A suggested craft (the side tracker's line when nothing else is tracked). */
export interface Advice {
  why: 'weapon' | 'guard' | 'armour' | 'lantern' | 'outpost';
  item: ItemId;
  station: string;
  hazard?: string;
}

/**
 * Seconds on the 'lairs' step (in a stratum) before the rumour points the way: the moment the stuck
 * hint comes (GUIDE.stuckSeconds), which tells of it.
 */
export const RUMOUR_AFTER: number = GUIDE.stuckSeconds;

/**
 * The tutorial's fight step waits longer while the explorer stays in the camp (no creature comes into
 * its light): its 45 s run at this rate there (2 minutes), at the full rate once outside.
 */
export const FIGHT_CAMP_RATE = 45 / 120;

/** Metres within which a monster makes the fight step say "aim and strike" even in the camp's light. */
export const FOE_NEAR = 15;

export interface QuestHost {
  readonly bus: EventBus<GameEvents>;
  world(): QuestWorld;
  /** Pay a reward into the bag (the bank when full). */
  pay(reward: Reward, reason: string): void;
  /** WORLD's strata (null on the old world). */
  strata(): { openGate(): boolean; descend(): Promise<boolean>; gateOpen(): boolean } | null;
  /** Max health from the bestiary's milestones. */
  setBonusHealth(n: number): void;
  /** The camp's lamps make orders pay more (1: as written). */
  orderFactor?(): number;
  /** The hotbar's selected item (the torch step rings the torch slot until a torch is in hand). */
  held?(): ItemId | null;
  /** At the camp (or a lift's ledger): orders are paid there, including what the arrival just banked. */
  atCamp?(): boolean;
  /** At the stratum I camp itself (not a lift landing): only there do the camp's orders renew. */
  atMainCamp?(): boolean;
}

interface BiomeProgress {
  mine: number;
  hunt: number;
  scan: number;
  torches: number;
  places: number;
  paid: string[];
}

export interface QuestSave {
  v: 1;
  shards: BiomeKey[];
  tutorial: { step: number; done: boolean; flags: string[] };
  heartLit: boolean;
  bossDefeated: boolean;
  ending: boolean;
  pages: number[];
  orders: OrdersSave;
  tracked: string | null;
  biomes: Partial<Record<BiomeKey, BiomeProgress>>;
  visited: BiomeKey[];
  bestiaryPaid: number[];
  feats: string[];
  gatesOpened: number[];
  companion?: number;
  elites?: number;
  /** Named places found per biome (site ids), and each biome's count once its stratum was entered. */
  places?: Partial<Record<BiomeKey, string[]>>;
  placeTotals?: Partial<Record<BiomeKey, number>>;
}

const BIOME_LIST: readonly BiomeKey[] = Object.values(STRATUM_BIOMES).flat();
const isBiome = (x: unknown): x is BiomeKey => typeof x === 'string' && (BIOME_LIST as readonly string[]).includes(x);

const guardianName = (kind: string | null): string => {
  if (!kind) return '';
  const k = `mob.${kind}`;
  return hasText(k) ? t(k) : kind;
};
/**
 * The name inside a sentence: "Defeat the Amber Matriarch", « Vainquez la Matriarche » (a name's
 * leading article, English or French, in lower case).
 */
export const inSentence = (name: string): string => name.replace(/^(The|Le|La|Les) /, (m) => m.toLowerCase()).replace(/^L([’'])/, 'l$1');
const guardianInLine = (kind: string | null): string => inSentence(guardianName(kind));
const biomeName = (b: BiomeKey | null): string => {
  if (!b) return '';
  const k = `biome.${b}.name`;
  return hasText(k) ? t(k) : b;
};
const stratumName = (n: number): string => (n >= 1 && n <= 6 ? t(`stratum.${n}` as TextKey) : t('quest.heartPlace'));

export function rewardLine(r: Reward): string {
  return (Object.entries(r) as Array<[ItemId, number]>)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => t('loop3.plus', { n, item: t(ITEMS[id].name) }))
    .join(t('loop3.listSep'));
}

/**
 * The goal and the side loop (round 3, LOOP): the main quest, the tutorial, camp orders, biome
 * tasks, bestiary rewards, Halden's pages, feats. It listens to the bus and pays rewards through
 * the host; the tracker reads main()/side() each frame (cached, rebuilt at most 4 times a second or
 * when something changed).
 */
export class Quests implements QuestSystem {
  readonly shards = new Set<BiomeKey>();
  /** The tutorial's current step (index into TUTORIAL). */
  tutIndex = 0;
  tutorialDone = false;
  private readonly tutFlags = new Set<string>();
  private tutTimer = 0;
  heartLit = false;
  bossDefeated = false;
  ending = false;
  readonly pages = new Set<number>();
  readonly book: Orders;
  tracked: string | null = null;
  private biomes: Partial<Record<BiomeKey, BiomeProgress>> = {};
  readonly visited = new Set<BiomeKey>();
  private readonly bestiaryPaid = new Set<number>();
  readonly feats = new Set<string>();
  readonly gatesOpened = new Set<number>();
  /** The Lampling companion's level (0: none tamed; MOBS' 'companion:tamed' / 'companion:level'). */
  companionLevel = 0;
  /** Elite creatures defeated (MOBS' 'mob:died' {elite}). */
  elites = 0;
  /** Named places found, per biome (site ids), and how many each biome holds (once its stratum was entered). */
  /** Seconds spent on the 'lairs' step of the current stratum (the rumour's clock). */
  private lairsT = 0;
  private lairsStratum = 0;
  private placesFound: Partial<Record<BiomeKey, string[]>> = {};
  private placeTotals: Partial<Record<BiomeKey, number>> = {};
  private placesSrc: unknown = null;

  private mainCache: QuestStepView | null = null;
  private mainRaw: MainStep | null = null;
  private sideCache: QuestStepView | null = null;
  private dirty = true;
  private clock = 0;
  private featClock = 0;
  private lastMainId = '';
  private lookCount = 0;
  private moveCount = 0;

  constructor(private readonly host: QuestHost, seed = 0x5eed) {
    this.book = new Orders(seed);
  }

  /** Listen to the bus (once). */
  wire(): void {
    const bus = this.host.bus;
    const touch = () => (this.dirty = true);
    bus.on('ui:used', (e) => {
      if (e.control === 'look') this.lookCount++;
      if (e.control === 'move' || e.control === 'sprint') this.moveCount++;
      if (this.lookCount >= 3) this.flag('look');
      if (this.moveCount >= 4) this.flag('move');
    });
    bus.on('ui:opened', (e) => {
      if (e.screen === 'inventory') this.flag('bag');
      if (e.screen === 'map') this.flag('map');
      if (e.screen === 'quests') this.flag('quest');
    });
    bus.on('block:broken', (e) => {
      this.flag('mine');
      // Biome task: veins mined in the biome you stand in (any find: rarityOf is not null).
      if (rarityOf(e.block) === null) return;
      const b = this.host.world().biome;
      if (b && isBiome(b)) this.biomeAdd(b, 'mine', 1);
    });
    bus.on('item:picked', () => {
      this.flag('pickup');
      touch();
    });
    bus.on('craft:made', (e) => {
      this.flag('craft');
      this.orderProgress(this.book.progress('craft', e.item, e.count));
      if (ITEMS[e.item]?.category === 'materials' && ITEMS[e.item].kind === 'ingot') this.orderProgress(this.book.progress('smelt', null, e.times));
      touch();
    });
    bus.on('player:placed', (e) => {
      if (e.item === 'torch') {
        this.flag('torch');
        this.orderProgress(this.book.progress('torches', null, 1));
        const b = this.host.world().biome;
        if (b) this.biomeAdd(b, 'torches', 1);
      }
    });
    bus.on('mob:hit', () => this.flag('fight'));
    bus.on('mob:died', (e) => {
      this.flag('fight');
      if (e.rank === 'guardian' || e.rank === 'boss') return;
      if ((e as { elite?: boolean }).elite) this.elites++;
      this.orderProgress(this.book.progress('hunt', null, 1));
      const b = (e.biome as BiomeKey | undefined) ?? this.host.world().biome;
      if (b && isBiome(b)) this.biomeAdd(b, 'hunt', 1);
    });
    bus.on('player:sonar', () => this.flag('sonar'));
    bus.on('items:banked', (e) => {
      for (const [id, n] of Object.entries(e.items) as Array<[ItemId, number]>) this.orderProgress(this.book.progress('deliver', id, n));
      // The arrival's own deposit pays its orders at once (the hub banks right after 'camp:entered').
      if (this.host.atCamp?.()) this.collectOrders();
      touch();
    });
    bus.on('mob:guardianDefeated', (e) => this.onGuardian(e.shard as BiomeKey));
    bus.on('mob:bestiary', (e) => this.onBestiary(e.kind, e.page, e.found));
    bus.on('world:lairRevealed', (e) => {
      touch();
      const name = guardianName(this.host.world().lairs.find((l) => l.id === e.id)?.guardian ?? null);
      if (name) bus.emit('toast', { text: t('quest.lairFound', { guardian: name }), tone: 'good' });
    });
    bus.on('world:gateOpened', (e) => {
      this.gatesOpened.add(e.stratum);
      touch();
    });
    bus.on('world:stratum', () => {
      this.countPlaces();
      touch();
    });
    // A named place reached for the first time (WORLD's vista, river, works, set pieces, secret rooms).
    bus.on('world:site', (e) => {
      const b = e.biome as BiomeKey;
      if (!isBiome(b)) return;
      const list = (this.placesFound[b] ??= []);
      if (list.includes(e.id)) return;
      list.push(e.id);
      this.countPlaces();
      this.biomeAdd(b, 'places', 1);
    });
    bus.on('world:biome', (e) => {
      if (isBiome(e.biome)) this.visited.add(e.biome);
      touch();
    });
    bus.on('world:note', (e) => {
      const n = this.host.world().pageOf(e.id);
      if (n !== null) this.readPage(n);
    });
    bus.on('camp:entered', () => this.collectOrders());
    bus.on('companion:tamed', () => {
      this.companionLevel = Math.max(1, this.companionLevel);
      this.featClock = 1;
    });
    bus.on('companion:level', (e) => {
      this.companionLevel = Math.max(this.companionLevel, e.level);
      this.featClock = 1;
    });
    bus.on('inventory:changed', touch);
    bus.on('gear:equipped', touch);
    // A recipe newly shown may be the suggested craft.
    bus.on('recipe:unlocked', touch);
  }

  // ------------------------------------------------------------------------------------
  // Lifecycle

  reset(seed: number, tutorial = true): void {
    this.shards.clear();
    this.tutIndex = 0;
    this.tutorialDone = !tutorial;
    this.tutFlags.clear();
    this.tutTimer = 0;
    this.heartLit = false;
    this.bossDefeated = false;
    this.ending = false;
    this.pages.clear();
    this.book.setSeed(seed);
    this.book.load(null);
    this.book.fill(1, dayNumber());
    this.tracked = null;
    this.biomes = {};
    this.visited.clear();
    this.bestiaryPaid.clear();
    this.feats.clear();
    this.gatesOpened.clear();
    this.companionLevel = 0;
    this.elites = 0;
    this.placesFound = {};
    this.placeTotals = {};
    this.placesSrc = null;
    this.lairsT = 0;
    this.lairsStratum = 0;
    this.lookCount = this.moveCount = 0;
    this.dirty = true;
    this.lastMainId = '';
    if (!this.tutorialDone) this.emitTutorial();
  }

  private flag(id: TutorialStepId | string): void {
    this.tutFlags.add(id);
    if (!this.tutorialDone) this.advanceTutorial();
  }

  private advanceTutorial(): void {
    const before = this.tutIndex;
    while (this.tutIndex < TUTORIAL.length && this.tutFlags.has(TUTORIAL[this.tutIndex].id)) this.tutIndex++;
    if (this.tutIndex >= TUTORIAL.length) {
      this.finishTutorial(false);
      return;
    }
    if (this.tutIndex !== before) {
      this.tutTimer = 0;
      this.emitTutorial();
      this.dirty = true;
    }
  }

  private emitTutorial(): void {
    const s = TUTORIAL[this.tutIndex];
    this.host.bus.emit('tutorial:step', s ? { id: s.id, highlight: s.highlight, line: t(s.line) } : { id: null, highlight: null, line: null });
  }

  private finishTutorial(skipped: boolean): void {
    if (this.tutorialDone) return;
    this.tutorialDone = true;
    this.tutIndex = TUTORIAL.length;
    this.host.bus.emit('tutorial:step', { id: null, highlight: null, line: null });
    // Finished by doing: light and food for the first trip (a skip pays nothing).
    if (!skipped) this.host.pay(TUTORIAL_REWARD, 'tutorial');
    this.host.bus.emit('quest:done', { id: 'main:tutorial', kind: 'tutorial', reward: skipped ? null : rewardLine(TUTORIAL_REWARD) });
    if (!skipped) this.host.bus.emit('toast', { text: t('tut.doneReward', { done: t('tut.done'), reward: rewardLine(TUTORIAL_REWARD) }), tone: 'good' });
    this.dirty = true;
  }

  skipTutorial(): void {
    this.finishTutorial(true);
  }

  /** How many named places each biome of the loaded stratum holds (the 'places' task's need). */
  private countPlaces(): void {
    const list = this.host.world().places;
    if (!list || list === this.placesSrc) return;
    this.placesSrc = list;
    const n: Partial<Record<BiomeKey, number>> = {};
    for (const s of list) if (isBiome(s.biome)) n[s.biome] = (n[s.biome] ?? 0) + 1;
    for (const [b, k] of Object.entries(n) as Array<[BiomeKey, number]>) this.placeTotals[b] = k;
    this.dirty = true;
  }

  /** Named places found in all, and whether every place of some stratum was found. */
  placesSummary(): { found: number; stratumDone: boolean } {
    let found = 0;
    for (const l of Object.values(this.placesFound)) found += l?.length ?? 0;
    let stratumDone = false;
    for (let s = 1; s <= 6 && !stratumDone; s++) {
      const [a, b] = STRATUM_BIOMES[s];
      const ta = this.placeTotals[a];
      const tb = this.placeTotals[b];
      if (ta === undefined || tb === undefined) continue;
      stratumDone = (this.placesFound[a]?.length ?? 0) >= ta && (this.placesFound[b]?.length ?? 0) >= tb;
    }
    return { found, stratumDone };
  }

  /** Each playing frame. */
  update(dt: number): void {
    if (!(dt > 0)) return;
    this.clock += dt;
    if (!this.tutorialDone) {
      const s = TUTORIAL[this.tutIndex];
      // No creature comes into the camp's light (QA 21:29): while the fight step waits in the camp
      // its clock runs at FIGHT_CAMP_RATE, so the explorer has time to walk out to the foe.
      this.tutTimer += s?.id === 'fight' && this.host.atCamp?.() ? dt * FIGHT_CAMP_RATE : dt;
      if (s?.timeout && this.tutTimer >= s.timeout) this.flag(s.id);
    }
    // The Heart: standing in its chamber with all 12 shards lights it.
    const w = this.host.world();
    if (w.places && w.places !== this.placesSrc) this.countPlaces();
    if (!this.heartLit && this.shards.size >= 12 && w.heart && (w.at.x - w.heart.x) ** 2 + (w.at.z - w.heart.z) ** 2 < 14 * 14) {
      this.heartLit = true;
      this.host.bus.emit('quest:heartLit', {});
      this.host.bus.emit('toast', { text: t('quest.heartLit'), tone: 'good' });
      this.dirty = true;
    }
    // The rumour's clock: time spent looking for this stratum's lairs.
    const raw = this.mainRaw;
    if (raw && raw.step === 'lairs') {
      if (this.lairsStratum !== raw.stratum) {
        this.lairsStratum = raw.stratum;
        this.lairsT = 0;
      }
      const before = this.lairsT;
      this.lairsT += dt;
      if (before < RUMOUR_AFTER && this.lairsT >= RUMOUR_AFTER) this.dirty = true;
    }
    this.featClock += dt;
    if (this.featClock >= 1) {
      this.featClock = 0;
      this.checkFeats();
    }
  }

  // ------------------------------------------------------------------------------------
  // Events

  private onGuardian(biome: BiomeKey | 'heart'): void {
    if (biome === 'heart') {
      if (this.bossDefeated) return;
      this.bossDefeated = true;
      this.ending = true;
      this.host.pay(GUARDIAN_LOOT.heart, 'guardian');
      this.host.bus.emit('quest:done', { id: 'main:heart', kind: 'main', reward: rewardLine(GUARDIAN_LOOT.heart) });
      this.host.bus.emit('quest:ending', {});
      this.dirty = true;
      return;
    }
    if (!isBiome(biome) || this.shards.has(biome)) return;
    this.shards.add(biome);
    this.host.bus.emit('quest:shard', { biome, count: this.shards.size });
    this.host.bus.emit('toast', { text: t('quest.shardFrom', { biome: biomeName(biome), count: this.shards.size }), tone: 'good' });
    const loot = GUARDIAN_LOOT[biome];
    this.host.pay(loot, 'guardian');
    this.host.bus.emit('quest:done', { id: `main:guardian.${biome}`, kind: 'main', reward: rewardLine(loot) });
    this.dirty = true;
  }

  private onBestiary(kind: string, page: 'new' | 'complete', found: number): void {
    if (page !== 'new') return;
    const n = Math.max(found, this.bestiaryPaid.size + 1);
    if (this.bestiaryPaid.has(n)) return;
    this.bestiaryPaid.add(n);
    let reward: Reward = { bandage: 1 };
    try {
      const drop = bestiary(kind as Parameters<typeof bestiary>[0]).drops.find((d) => isItem(d));
      if (drop && isItem(drop)) reward = { [drop]: 2 } as Reward;
    } catch {
      /* an unknown kind: the bandage */
    }
    this.host.pay(reward, 'bestiary');
    const name = hasText(`mob.${kind}`) ? t(`mob.${kind}` as TextKey) : kind;
    this.host.bus.emit('bestiary:reward', { kind, text: t('bestiary.reward', { name, bonus: rewardLine(reward) }) });
    this.applyMilestones(n);
    // Biome task: record its creatures.
    for (const b of BIOME_LIST) {
      const r = ROSTERS[b];
      if (r && [...r.monsters, ...r.beings].some((e) => e.kind === kind)) this.biomeAdd(b, 'scan', 1);
    }
  }

  private applyMilestones(found: number): void {
    let health = 0;
    for (const m of BESTIARY_MILESTONES) if (found >= m.count) health += m.health;
    const prev = BESTIARY_MILESTONES.filter((m) => found - 1 >= m.count).reduce((a, m) => a + m.health, 0);
    this.host.setBonusHealth(health);
    if (health > prev) this.host.bus.emit('toast', { text: t('bestiary.milestone', { count: found, bonus: t('bestiary.bonus.health', { n: health - prev }) }), tone: 'good' });
  }

  readPage(n: number): void {
    if (!(n >= 1 && n <= PAGE_COUNT)) return;
    const first = !this.pages.has(n);
    this.pages.add(n);
    // WORLD's discovery banner shows the page's title and text: no toast here.
    this.host.bus.emit('quest:page', { n, first });
    this.dirty = true;
  }

  private orderProgress(done: Order[]): void {
    if (done.length && !this.host.atCamp?.()) this.host.bus.emit('toast', { text: t('order.ready'), tone: 'good' });
    if (done.length) this.dirty = true;
  }

  /** A chest was opened (Progression.openCache, through the loop): the chest orders count it. */
  chestOpened(): void {
    this.orderProgress(this.book.progress('chests', null, 1));
    this.dirty = true;
  }

  /**
   * On camp entry: pay the done orders, renew them. A lower stratum's lift landing pays them too, but
   * only the camp itself brings new ones (QA 22:10: "New camp orders" on first reaching stratum II).
   */
  collectOrders(): void {
    const main = this.host.atMainCamp?.() ?? true;
    const paid = this.book.collect(this.host.world().deepest, dayNumber(), main);
    if (main && (this.book.renewed > 0 || paid.length > 0)) this.host.bus.emit('toast', { text: t('order.renewed'), tone: 'info' });
    const f = Math.max(1, this.host.orderFactor?.() ?? 1);
    for (const o of paid) {
      const reward: Reward = {};
      for (const [id, n] of Object.entries(o.reward) as Array<[ItemId, number]>) reward[id] = Math.round(n * f);
      this.host.pay(reward, 'order');
      const line = rewardLine(reward);
      this.host.bus.emit('order:paid', { id: o.id, reward: line });
      this.host.bus.emit('quest:done', { id: o.id, kind: 'order', reward: line });
      this.host.bus.emit('toast', { text: t('order.paid', { reward: line }), tone: 'good' });
    }
    if (paid.length) this.dirty = true;
  }

  private progressOf(b: BiomeKey): BiomeProgress {
    let p = this.biomes[b];
    if (!p) p = this.biomes[b] = { mine: 0, hunt: 0, scan: 0, torches: 0, places: 0, paid: [] };
    return p;
  }

  private taskNeed(b: BiomeKey, id: BiomeTaskId): number {
    if (id === 'scan') {
      const r = ROSTERS[b];
      return r ? r.monsters.length + r.beings.length : 4;
    }
    if (id === 'places') return Math.max(1, this.placeTotals[b] ?? PLACES_DEFAULT);
    return BIOME_TASKS.find((x) => x.id === id)?.need ?? 10;
  }

  private biomeAdd(b: BiomeKey, id: BiomeTaskId, n: number): void {
    const p = this.progressOf(b);
    p[id] += n;
    const need = this.taskNeed(b, id);
    if (p[id] >= need && !p.paid.includes(id)) {
      p.paid.push(id);
      const s = stratumOfBiome(b);
      const reward = REWARDS[s][(BIOME_TASKS.findIndex((x) => x.id === id) + s) % REWARDS[s].length];
      this.host.pay(reward, 'task');
      this.host.bus.emit('quest:done', { id: `task:${b}.${id}`, kind: 'biome', reward: rewardLine(reward) });
      this.host.bus.emit('toast', { text: t('loop3.taskDone', { task: this.taskText(b, id), reward: rewardLine(reward) }), tone: 'good' });
    }
    this.dirty = true;
  }

  /** A task's line (its count shows beside it: the line does not repeat it). */
  private taskText(b: BiomeKey, id: BiomeTaskId): string {
    const need = this.taskNeed(b, id);
    switch (id) {
      case 'mine':
        return t('task.mine', { need, biome: biomeName(b) });
      case 'hunt':
        return t('task.hunt', { need, biome: biomeName(b) });
      case 'scan':
        return t('task.scan', { biome: biomeName(b) });
      case 'places':
        return t('task.places', { biome: biomeName(b) });
      default:
        return t('task.torches', { biome: biomeName(b), need });
    }
  }

  private checkFeats(): void {
    const w = this.host.world();
    const snap: FeatSnapshot3 = {
      crafted: w.counters.crafted,
      smelted: w.counters.smelted,
      torches: w.counters.torches,
      outposts: w.counters.outposts,
      shards: this.shards.size,
      deepest: w.deepest,
      heart: this.heartLit,
      bestiary: w.bestiaryFound,
      orders: this.book.done,
      fullSet: w.fullSet,
      pages: this.pages.size,
      pickTier: w.pickTier,
      companion: this.companionLevel,
      elites: this.elites,
      upgrades: w.counters.upgrades ?? 0,
      trades: w.counters.trades ?? 0,
      gems: w.counters.gems ?? 0,
      dailies: w.counters.dailies ?? 0,
    };
    const pl = this.placesSummary();
    snap.places = pl.found;
    snap.placesStratum = pl.stratumDone;
    for (const f of FEATS3) {
      if (this.feats.has(f.id) || !f.check(snap)) continue;
      this.feats.add(f.id);
      this.host.pay(f.reward, 'feat');
      this.host.bus.emit('feat:earned', { id: f.id });
      this.host.bus.emit('toast', { text: t('feat3.earned', { name: t(`feat3.${f.id}` as TextKey) }), tone: 'good' });
    }
  }

  // ------------------------------------------------------------------------------------
  // The gate (the stand's Interact)

  /** @returns what happened: the gate opened, the descent began, or the shards are missing. */
  useGate(): 'opened' | 'descend' | 'needShards' | 'none' {
    const st = this.host.strata();
    const w = this.host.world();
    if (!st) return 'none';
    if (st.gateOpen()) {
      void st.descend();
      return 'descend';
    }
    const [a, b] = STRATUM_BIOMES[w.stratum] ?? STRATUM_BIOMES[1];
    if (!(this.shards.has(a) && this.shards.has(b))) {
      this.host.bus.emit('toast', { text: t('world.gate.sealed', { count: 2 }), tone: 'warn' });
      return 'needShards';
    }
    if (st.openGate()) {
      this.gatesOpened.add(w.stratum);
      this.host.bus.emit('toast', { text: t('quest.gateOpen', { stratum: stratumName(w.stratum) }), tone: 'good' });
      this.host.bus.emit('quest:done', { id: `main:s${w.stratum}.gate`, kind: 'main', reward: null });
      this.dirty = true;
      return 'opened';
    }
    return 'none';
  }

  // ------------------------------------------------------------------------------------
  // Views

  private state(): MainState {
    const w = this.host.world();
    const tut = !this.tutorialDone ? TUTORIAL[this.tutIndex] : undefined;
    return {
      tutorialTarget: tut?.id === 'mine' ? w.nearestVein?.() ?? null : tut?.id === 'fight' ? w.foe?.() ?? null : null,
      rumour: this.lairsT >= RUMOUR_AFTER && this.lairsStratum === w.deepest,
      tutorial: !this.tutorialDone,
      stratum: w.stratum,
      deepest: w.deepest,
      shards: this.shards,
      lairs: w.lairs,
      revealed: (id) => w.revealed(id),
      gate: w.gate,
      gateOpen: w.gateOpen,
      heart: w.heart,
      heartLit: this.heartLit,
      bossDefeated: this.bossDefeated,
      pickTier: w.pickTier,
      at: w.at,
    };
  }

  /** The raw main step (ids, target) for the guide and the compass. */
  mainRawStep(): MainStep {
    this.refresh();
    return this.mainRaw as MainStep;
  }

  private refresh(): void {
    if (!this.dirty && this.mainCache && this.clock - this.lastRefresh < 0.25) return;
    this.lastRefresh = this.clock;
    this.dirty = false;
    const raw = mainStep(this.state());
    this.mainRaw = raw;
    this.mainCache = this.mainView(raw);
    this.sideCache = this.sideView();
    if (raw.id !== this.lastMainId) {
      this.lastMainId = raw.id;
      this.host.bus.emit('quest:step', { id: raw.id, kind: raw.step === 'tutorial' ? 'tutorial' : 'main', text: this.mainCache.text });
    }
  }
  private lastRefresh = -1;

  private mainView(m: MainStep): QuestStepView {
    const sn = stratumName(m.stratum);
    let text = '';
    let progress = m.progress;
    let target = m.target;
    switch (m.step) {
      case 'tutorial': {
        // The bubble by the ringed control gives the step's line: the tracker shows where it stands.
        text = t('quest.step.tutorial');
        progress = { have: Math.min(this.tutIndex, TUTORIAL.length), need: TUTORIAL.length };
        break;
      }
      case 'return':
        text = t('quest.step.return', { stratum: sn });
        break;
      case 'lairs':
        text = t('quest.step.lairs', { stratum: sn });
        break;
      case 'guardian': {
        // No weapon yet (QA 22:10): the pick barely scratches a guardian, so the line says what to
        // make first, and the compass waits (the Craft menu's focus and a hint say where).
        const w = this.host.world();
        if (w.armed?.() === false) {
          text = t('quest.step.arm', { item: w.firstWeapon?.().item ?? '' });
          target = null;
        } else text = t('quest.step.guardian', { guardian: guardianInLine(m.guardian) });
        break;
      }
      case 'prepare': {
        const pick = NEXT_PICK[m.stratum];
        text = t('quest.step.prepare', { pick: pick ? t(ITEMS[pick].name) : '' });
        break;
      }
      case 'gate':
        text = t('quest.step.gate', { stratum: sn });
        break;
      case 'descend':
        text = t('quest.step.descend', { next: stratumName(m.stratum + 1) });
        break;
      case 'heart':
        text = t('quest.step.heart');
        break;
      case 'boss':
        text = t('quest.step.boss');
        break;
      default:
        text = t('quest.step.free');
    }
    const title = m.step === 'tutorial' ? t('quest.main.title') : t('quest.main.stratum', { stratum: ROMAN[m.stratum] ?? '' });
    return { id: m.id, kind: m.step === 'tutorial' ? 'tutorial' : 'main', title, text, progress, target, reward: null };
  }

  main(): QuestStepView {
    this.refresh();
    return this.mainCache as QuestStepView;
  }

  private sideView(): QuestStepView | null {
    const orders = this.book.list;
    const tracked = this.tracked;
    if (tracked) {
      const o = orders.find((x) => x.id === tracked);
      if (o && o.have < o.need) return this.orderStep(o);
      const m = /^task:(\w+)\.(\w+)$/.exec(tracked);
      if (m && isBiome(m[1]) && BIOME_TASKS.some((x) => x.id === m[2])) {
        const v = this.taskStep(m[1], m[2] as BiomeTaskId);
        if (v) return v;
      }
    }
    // What the descent needs now comes first (a weapon before the guardians, the ward before a hazard).
    const adv = this.tutorialDone ? this.host.world().advice?.() ?? null : null;
    if (adv) return this.adviceStep(adv);
    const b = this.host.world().biome;
    if (b && isBiome(b)) {
      for (const tdef of BIOME_TASKS) {
        const v = this.taskStep(b, tdef.id);
        if (v) return v;
      }
    }
    const o = orders.find((x) => x.have < x.need && !x.daily) ?? orders.find((x) => x.have < x.need);
    return o ? this.orderStep(o) : null;
  }

  private adviceStep(a: Advice): QuestStepView {
    const item = t(ITEMS[a.item].name);
    const text =
      a.why === 'weapon' ? t('advice.weapon', { item, station: a.station })
      : a.why === 'guard' ? t('advice.guard', { item })
      : a.why === 'armour' ? t('advice.armour', { item, hazard: a.hazard ?? '' })
      : a.why === 'lantern' ? t('advice.lantern', { item })
      : t('advice.outpost', { item });
    return { id: `advice:${a.item}`, kind: 'side', title: t('advice.title'), text, progress: null, target: null, reward: null };
  }

  private taskStep(b: BiomeKey, id: BiomeTaskId): QuestStepView | null {
    const p = this.progressOf(b);
    if (p.paid.includes(id)) return null;
    const need = this.taskNeed(b, id);
    if (need <= 0) return null;
    const s = stratumOfBiome(b);
    const reward = REWARDS[s][(BIOME_TASKS.findIndex((x) => x.id === id) + s) % REWARDS[s].length];
    return { id: `task:${b}.${id}`, kind: 'biome', title: biomeName(b), text: this.taskText(b, id), progress: { have: Math.min(need, p[id]), need }, target: null, reward: rewardLine(reward) };
  }

  private orderText(o: Order): string {
    const item = o.item ? t(ITEMS[o.item].name) : '';
    return t(`order.${o.kind}` as TextKey, { need: o.need, item });
  }

  private orderStep(o: Order): QuestStepView {
    return { id: o.id, kind: 'order', title: o.daily ? t('order.daily') : t('order.title'), text: this.orderText(o), progress: { have: o.have, need: o.need }, target: null, reward: rewardLine(o.reward) };
  }

  side(): QuestStepView | null {
    this.refresh();
    return this.sideCache;
  }

  orders(): OrderView[] {
    return this.book.list.map((o) => ({ id: o.id, text: this.orderText(o), have: o.have, need: o.need, reward: rewardLine(o.reward), daily: o.daily, done: o.have >= o.need }));
  }

  track(id: string | null): void {
    this.tracked = id;
    this.dirty = true;
  }

  tutorial(): TutorialStepView | null {
    if (this.tutorialDone) return null;
    const s = TUTORIAL[this.tutIndex];
    if (!s) return null;
    // The torch step: first the torch slot, then Place.
    if (s.id === 'torch' && this.host.held && this.host.held() !== 'torch') return { id: s.id, index: this.tutIndex + 1, total: TUTORIAL.length, line: t('tut.torch.pick'), highlight: 'hotbar:3' };
    // The fight step in the camp: creatures keep out of its light, so the line sends the explorer out
    // (the compass points at the nearest monster when one is about) and rings the stick.
    if (s.id === 'fight' && this.host.atCamp?.() && !this.foeNear()) return { id: s.id, index: this.tutIndex + 1, total: TUTORIAL.length, line: t('tut.fightOut'), highlight: 'joystick' };
    return { id: s.id, index: this.tutIndex + 1, total: TUTORIAL.length, line: t(s.line), highlight: s.highlight };
  }

  /** A monster within FOE_NEAR m (the fight step's usual line even at the camp's edge: QA 22:25). */
  private foeNear(): boolean {
    const w = this.host.world();
    const f = w.foe?.() ?? null;
    return !!f && (f.x - w.at.x) ** 2 + (f.z - w.at.z) ** 2 < FOE_NEAR * FOE_NEAR;
  }

  /** UI's name for tutorial(): the step to show ({ id, highlight, line, index, total }), null when done or skipped. */
  tutorialStep(): TutorialStepView | null {
    return this.tutorial();
  }

  view(): QuestsScreenView {
    const cur = this.main();
    const raw = this.mainRawStep();
    const w = this.host.world();
    const outline = chainOutline({ deepest: w.deepest, shards: this.shards, heartLit: this.heartLit, bossDefeated: this.bossDefeated, pickTier: w.pickTier, gatesOpened: this.gatesOpened });
    const main = outline.map((st) => ({
      stratum: st.stratum,
      name: stratumName(st.stratum),
      steps: st.steps.map((s) => {
        // The Quests screen has room: the chain's longer lines (what each step is for).
        let text = '';
        if (s.id === 'guardian') text = t('quest.chain.guardian', { guardian: guardianInLine(ROSTERS[s.biome as BiomeKey]?.guardian ?? null), biome: biomeName(s.biome) });
        else if (s.id === 'prepare') text = t('quest.chain.prepare', { pick: NEXT_PICK[st.stratum] ? t(ITEMS[NEXT_PICK[st.stratum] as ItemId].name) : '' });
        else if (s.id === 'gate') text = t('quest.chain.gate', { stratum: stratumName(st.stratum) });
        else if (s.id === 'heart') text = t('quest.chain.heart');
        else text = t('quest.chain.boss');
        const current = raw.stratum === st.stratum && raw.step === s.id && (s.id !== 'guardian' || raw.biome === s.biome);
        return { text, done: s.done, current };
      }),
    }));
    const biomes = BIOME_LIST.map((b) => ({
      biome: b,
      name: biomeName(b),
      visited: this.visited.has(b),
      tasks: BIOME_TASKS.map((d) => {
        const need = this.taskNeed(b, d.id);
        const p = this.progressOf(b);
        const s = stratumOfBiome(b);
        return { id: `task:${b}.${d.id}`, text: this.taskText(b, d.id), have: Math.min(need, p[d.id]), need, done: p.paid.includes(d.id), reward: rewardLine(REWARDS[s][(BIOME_TASKS.findIndex((x) => x.id === d.id) + s) % REWARDS[s].length]) };
      }),
    }));
    const pages = Array.from({ length: PAGE_COUNT }, (_, i) => i + 1).map((n) => ({
      n,
      title: this.pages.has(n) ? t(`page.${n}.title` as TextKey) : t('world.page.name', { n }),
      body: this.pages.has(n) ? t(`page.${n}.body` as TextKey) : '',
      found: this.pages.has(n),
    }));
    return {
      main,
      current: cur,
      tracked: this.tracked,
      biomes,
      orders: this.orders(),
      feats: [
        ...FEATS3.map((f) => ({ id: f.id, name: t(`feat3.${f.id}` as TextKey), text: t(`feat3.${f.id}.text` as TextKey), earned: this.feats.has(f.id) })),
        // The earlier deep's feats, kept: earned, under their own names.
        ...(w.legacyFeats?.() ?? [])
          .filter((id) => hasText(`feat.${id}.name`) && hasText(`feat.${id}.desc`))
          .map((id) => ({ id: `legacy:${id}`, name: t('feat3.legacy', { name: t(`feat.${id}.name` as TextKey) }), text: t(`feat.${id}.desc` as TextKey), earned: true })),
      ],
      pages,
      shards: { have: this.shards.size, total: 12, biomes: [...this.shards] },
      free: this.bossDefeated,
    };
  }

  // ------------------------------------------------------------------------------------
  // Save

  toSave(): QuestSave {
    return {
      v: 1,
      shards: [...this.shards],
      tutorial: { step: this.tutIndex, done: this.tutorialDone, flags: [...this.tutFlags] },
      heartLit: this.heartLit,
      bossDefeated: this.bossDefeated,
      ending: this.ending,
      pages: [...this.pages],
      orders: this.book.toJSON(),
      tracked: this.tracked,
      biomes: JSON.parse(JSON.stringify(this.biomes)) as QuestSave['biomes'],
      visited: [...this.visited],
      bestiaryPaid: [...this.bestiaryPaid],
      feats: [...this.feats],
      gatesOpened: [...this.gatesOpened],
      companion: this.companionLevel,
      elites: this.elites,
      places: JSON.parse(JSON.stringify(this.placesFound)) as QuestSave['places'],
      placeTotals: { ...this.placeTotals },
    };
  }

  fromSave(x: unknown, seed: number): void {
    this.reset(seed, false);
    const o = x && typeof x === 'object' ? (x as Partial<QuestSave>) : null;
    if (!o) return;
    if (Array.isArray(o.shards)) for (const b of o.shards) if (isBiome(b)) this.shards.add(b);
    if (o.tutorial && typeof o.tutorial === 'object') {
      this.tutorialDone = !!o.tutorial.done;
      this.tutIndex = Math.max(0, Math.min(TUTORIAL.length, Math.floor(Number(o.tutorial.step) || 0)));
      if (Array.isArray(o.tutorial.flags)) for (const f of o.tutorial.flags) if (typeof f === 'string') this.tutFlags.add(f);
    }
    this.heartLit = !!o.heartLit;
    this.bossDefeated = !!o.bossDefeated;
    this.ending = !!o.ending;
    if (Array.isArray(o.pages)) for (const n of o.pages) if (typeof n === 'number' && n >= 1 && n <= PAGE_COUNT) this.pages.add(n);
    this.book.load(o.orders);
    this.book.fill(1, dayNumber());
    this.tracked = typeof o.tracked === 'string' ? o.tracked : null;
    if (o.biomes && typeof o.biomes === 'object')
      for (const [b, p] of Object.entries(o.biomes)) {
        if (!isBiome(b) || !p || typeof p !== 'object') continue;
        const q = p as Partial<BiomeProgress>;
        const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
        this.biomes[b] = { mine: n(q.mine), hunt: n(q.hunt), scan: n(q.scan), torches: n(q.torches), places: n(q.places), paid: Array.isArray(q.paid) ? q.paid.filter((s): s is string => typeof s === 'string') : [] };
      }
    if (Array.isArray(o.visited)) for (const b of o.visited) if (isBiome(b)) this.visited.add(b);
    if (Array.isArray(o.bestiaryPaid)) for (const n of o.bestiaryPaid) if (typeof n === 'number') this.bestiaryPaid.add(n);
    if (Array.isArray(o.feats)) for (const f of o.feats) if (typeof f === 'string') this.feats.add(f);
    if (Array.isArray(o.gatesOpened)) for (const n of o.gatesOpened) if (typeof n === 'number') this.gatesOpened.add(n);
    this.companionLevel = typeof o.companion === 'number' && Number.isFinite(o.companion) ? Math.max(0, Math.floor(o.companion)) : 0;
    this.elites = typeof o.elites === 'number' && Number.isFinite(o.elites) ? Math.max(0, Math.floor(o.elites)) : 0;
    if (o.places && typeof o.places === 'object')
      for (const [b, ids] of Object.entries(o.places)) if (isBiome(b) && Array.isArray(ids)) this.placesFound[b] = [...new Set(ids.filter((x): x is string => typeof x === 'string'))];
    if (o.placeTotals && typeof o.placeTotals === 'object')
      for (const [b, n] of Object.entries(o.placeTotals)) if (isBiome(b) && typeof n === 'number' && Number.isFinite(n) && n > 0) this.placeTotals[b] = Math.floor(n);
    this.applyMilestones(this.bestiaryPaid.size);
    this.dirty = true;
    if (!this.tutorialDone) this.emitTutorial();
  }
}
