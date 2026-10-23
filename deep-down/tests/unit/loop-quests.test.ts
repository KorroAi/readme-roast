import { describe, expect, it } from 'vitest';
import { ITEMS, type BiomeKey, type ItemId } from '../../src/config/items';
import { PLAYER, lanternForTier, packForTier } from '../../src/config/balance';
import { BIOMES, BIOME_IDS, type BiomeId } from '../../src/config/biomes';
import { FEATS3, GUARDIAN_LOOT, NEXT_PICK, PAGE_COUNT, STRATUM_BIOMES, TUTORIAL } from '../../src/config/quests';
import { EventBus, type GameEvents } from '../../src/core/events';
import { B } from '../../src/config/blocks';
import { en } from '../../src/i18n/en';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import { Equipment } from '../../src/gameplay/Equipment';
import { Health } from '../../src/gameplay/Health';
import { Lantern } from '../../src/gameplay/Lantern';
import { Hazards, type HazardProbe } from '../../src/gameplay/Hazards';
import { Loop, type LoopHost, type StrataLike } from '../../src/game/craft/Loop';
import { arrivalCard } from '../../src/game/quests/Guide';
import { Orders, makeOrder } from '../../src/game/quests/Orders';
import { ROSTERS } from '../../src/game/mobs/rosters';
import type { StratumLayout } from '../../src/world/gen/strata/types';
import type { StratumIndex } from '../../src/config/biomes';

// ---------------------------------------------------------------------------------------
// A fake stratum world (WORLD's StratumManager by shape)

type V3 = [number, number, number];

function layoutOf(stratum: number): StratumLayout {
  const [a, b] = STRATUM_BIOMES[stratum] as [BiomeId, BiomeId];
  const lair = (biome: BiomeId, at: V3) => ({ id: `lair_${biome}`, biome, guardian: ROSTERS[biome as keyof typeof ROSTERS].guardian, centre: at, radius: 11, spawn: at, entrance: [at[0] - 8, at[1], at[2]] as V3, revealRadius: 34 });
  return {
    stratum,
    biomes: [a, b],
    lairs: [lair(a, [60, 20, 60]), lair(b, [200, 20, 200])],
    gate: { id: `gate_${stratum}`, stratum, centre: [128, 10, 128], stand: [128, 10, 120], seal: [], shards: [a, b], shardsNeeded: 2, next: stratum < 6 ? stratum + 1 : null },
    heart: stratum === 6 ? { centre: [128, 4, 240], radius: 12, spawn: [128, 4, 240] } : null,
    pages: [1, 2, 3, 4].map((k) => ({ id: `page_${(stratum - 1) * 4 + k}`, n: (stratum - 1) * 4 + k, biome: k <= 2 ? a : b, p: [10 * k, 10, 10] as V3, prop: `page_${(stratum - 1) * 4 + k}`, revealsLair: null })),
    hazards: [],
  } as unknown as StratumLayout;
}

class World implements StrataLike {
  current = 1;
  deepest = 1;
  layout: StratumLayout | null = layoutOf(1);
  biomeHere: BiomeId | null = 'amberHollows';
  readonly revealed = new Set<string>();
  open = new Set<number>();
  opened = 0;
  descents = 0;
  constructor(private readonly bus: EventBus<GameEvents>) {}
  isRevealed(id: string): boolean {
    return this.revealed.has(id);
  }
  reveal(id: string): void {
    this.revealed.add(id);
    const l = this.layout!.lairs.find((x) => x.id === id)!;
    this.bus.emit('world:lairRevealed', { id, biome: l.biome, how: 'sonar' });
  }
  gateOpen(): boolean {
    return this.open.has(this.current);
  }
  openGate(): boolean {
    this.open.add(this.current);
    this.opened++;
    this.bus.emit('world:gateOpened', { stratum: this.current as StratumIndex });
    return true;
  }
  async descend(): Promise<boolean> {
    this.descents++;
    this.enter(this.current + 1);
    return true;
  }
  enter(n: number): void {
    const from = this.current;
    this.current = n;
    this.deepest = Math.max(this.deepest, n);
    this.layout = layoutOf(n);
    this.biomeHere = STRATUM_BIOMES[n][0] as BiomeId;
    this.bus.emit('world:stratum', { stratum: n as StratumIndex, from: from as StratumIndex, biomes: [...STRATUM_BIOMES[n]] as [BiomeId, BiomeId] });
  }
  addOutpost(): unknown {
    return null;
  }
}

interface TestHost extends LoopHost {
  inCamp: boolean;
  player: { x: number; y: number; z: number };
  strata: World;
  events: Array<{ type: string; payload: unknown }>;
}

function host(): TestHost {
  const bus = new EventBus<GameEvents>();
  const events: Array<{ type: string; payload: unknown }> = [];
  const emit = bus.emit.bind(bus);
  bus.emit = ((type: keyof GameEvents, payload: never) => {
    events.push({ type, payload });
    emit(type, payload);
  }) as typeof bus.emit;
  return {
    bus,
    backpack: new Backpack(packForTier(1).slots),
    storage: new CampStorage(),
    equipment: new Equipment(),
    health: new Health(PLAYER.maxHealth),
    lanternFuel: new Lantern(lanternForTier(1).fuelSeconds),
    inCamp: true,
    player: { x: 0, y: 10, z: 0 },
    strata: new World(bus),
    session: null,
    events,
  };
}

/**
 * A new game; armed by default (a Machete owned: the road to the first weapon, which an unarmed
 * explorer walks after the tutorial, has its own tests, with `armed` false).
 */
function game(tutorial = false, armed = true): { h: TestHost; loop: Loop } {
  const h = host();
  const loop = new Loop(h);
  loop.wire();
  loop.newGame(77, tutorial);
  if (armed) loop.gear.grant('machete');
  return { h, loop };
}

const of = (h: TestHost, type: string) => h.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);

/**
 * The camp and its surroundings for the road to the first weapon: loose stone, a coal and a copper
 * vein (each with an open face), the camp plan's Workbench, Furnace and Forge spots, a Grit Boar.
 */
function chainWorld(h: TestHost, opts: { rubble?: boolean; extra?: Array<[{ x: number; y: number; z: number }, number]> } = {}) {
  const at = {
    rubble: { x: 6.5, y: 10.5, z: 2.5 },
    coal: { x: -6.5, y: 10.5, z: 3.5 },
    copper: { x: 3.5, y: 10.5, z: -7.5 },
    boar: { x: 20, y: 10, z: -10 },
    bench: { x: 4, y: 11, z: 0 },
    furnaceSpot: { x: -4, y: 11, z: 0 },
    forgeSpot: { x: 0, y: 11, z: 4 },
  };
  const block = (p: { x: number; y: number; z: number }) => [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)].join();
  const blocks = new Map<string, number>([[block(at.rubble), B.RUBBLE], [block(at.coal), B.COAL_ORE], [block(at.copper), B.COPPER_ORE]]);
  if (opts.rubble === false) blocks.delete(block(at.rubble));
  for (const [p, id] of opts.extra ?? []) blocks.set(block(p), id);
  (h as { session: unknown }).session = {
    world: { get: (x: number, y: number, z: number) => blocks.get([x, y, z].join()) ?? B.AIR },
    liveProps: new Map(), props: { add() {}, remove() {}, has: () => false, setLift() {} }, setBlock() {}, removeProp() {},
  };
  (h.strata.layout as unknown as { campSite: unknown }).campSite = {
    region: { min: [-20, 0, -20], max: [20, 30, 20] },
    fire: [0, 10, 0],
    stations: [
      { station: 'workbench', p: [4, 10, 0], rotY: 0 },
      { station: 'furnace', p: [-4, 10, 0], rotY: 0 },
      { station: 'forge', p: [0, 10, 4], rotY: 0 },
    ],
  };
  (h as { mobs: unknown }).mobs = { list: () => [{ kind: 'gritBoar', position: at.boar, hostile: true, state: 'idle' }] };
  h.inCamp = true;
  return at;
}
const defeat = (h: TestHost, biome: BiomeKey | 'heart') =>
  h.bus.emit('mob:guardianDefeated', { id: 1, kind: biome === 'heart' ? 'heartOfDark' : ROSTERS[biome as keyof typeof ROSTERS].guardian, biome, shard: biome, x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);

// ---------------------------------------------------------------------------------------

describe('the tutorial (taught by doing, BRIEF §0.7)', () => {
  it('starts at the first step with its ringed control, and advances on what the player does', () => {
    const { h, loop } = game(true);
    const q = loop.quests;
    expect(q.tutorialStep()).toEqual({ id: 'look', highlight: 'look', line: en['tut.look'], index: 1, total: TUTORIAL.length });
    expect(q.main().kind).toBe('tutorial');
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    expect(q.tutorialStep()?.id).toBe('move');
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    expect(q.tutorialStep()).toMatchObject({ id: 'mine', highlight: 'action', index: 3 });
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: 1 });
    h.bus.emit('item:picked', { item: 'copperOre', count: 1 });
    expect(q.tutorialStep()?.id).toBe('craft');
    h.bus.emit('craft:made', { recipe: 'torch', item: 'torch', times: 1, count: 4 });
    // The torch step rings the torch slot first, then Place once a torch is in hand.
    expect(q.tutorialStep()).toMatchObject({ id: 'torch', highlight: 'hotbar:3', line: en['tut.torch.pick'] });
    h.backpack.add('torch', 4);
    loop.learn('torch');
    loop.selectHotbar(3);
    expect(q.tutorialStep()).toMatchObject({ id: 'torch', highlight: 'place', line: en['tut.torch'] });
    h.bus.emit('player:placed', { item: 'torch', block: 0, x: 0, y: 0, z: 0 });
    expect(q.tutorialStep()?.id).toBe('fight');
    h.bus.emit('mob:died', { id: 1, kind: 'crawler', pan: 0, gain: 1 });
    expect(q.tutorialStep()).toMatchObject({ id: 'sonar', highlight: 'sonar' });
    h.bus.emit('player:sonar', { x: 0, y: 0, z: 0, radius: 24, seconds: 2 });
    h.bus.emit('ui:opened', { screen: 'inventory' });
    h.bus.emit('ui:opened', { screen: 'map' });
    expect(q.tutorialStep()).toMatchObject({ id: 'quest', highlight: 'quests', index: TUTORIAL.length });
    h.bus.emit('ui:opened', { screen: 'quests' });
    expect(q.tutorialStep()).toBeNull();
    expect(of(h, 'tutorial:step').at(-1)).toEqual({ id: null, highlight: null, line: null });
    expect(q.main().kind).toBe('main');
    // Every step's line is real text and rings a real control.
    for (const s of TUTORIAL) expect(en[s.line], s.id).toBeTruthy();
  });

  it('a step done early is skipped when it comes up, and the whole tutorial can be skipped', () => {
    const { h, loop } = game(true);
    h.bus.emit('player:sonar', { x: 0, y: 0, z: 0, radius: 24, seconds: 2 });
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: 1 });
    expect(loop.quests.tutorialStep()?.id).toBe('pickup');
    loop.quests.skipTutorial();
    expect(loop.quests.tutorialStep()).toBeNull();
    expect(of(h, 'quest:done').some((e) => e.id === 'main:tutorial')).toBe(true);
  });

  it('the fight and pick-up steps move on by themselves when nothing comes', () => {
    const { h, loop } = game(true);
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: 1 });
    for (let i = 0; i < 25; i++) loop.update(1);
    expect(loop.quests.tutorialStep()?.id).toBe('craft');
  });
});

describe('the main quest: Relight the Heart', () => {
  it('stratum I: find the lairs, defeat both guardians for their shards, prepare the pick, open the gate, descend', async () => {
    const { h, loop } = game();
    const q = loop.quests;
    const w = h.strata;
    loop.gear.grant('machete'); // armed (the unarmed line is tested in "guidance (2)")
    expect(q.main()).toMatchObject({ id: 'main:s1.lairs', kind: 'main', progress: { have: 0, need: 2 }, target: null });
    w.reveal('lair_amberHollows');
    loop.update(0.5);
    const m = q.main();
    expect(m.id).toBe('main:s1.guardian.amberHollows');
    expect(m.target).toEqual({ x: 52, y: 20, z: 60, stratum: 1, kind: 'lair' });
    // "Defeat the Amber Matriarch": the guardian's name inside the line, short for the 390 px tracker
    // (QA 21:01); the Quests screen's chain line adds its biome.
    expect(m.text).toBe(`Defeat ${en[`mob.${ROSTERS.amberHollows.guardian}` as keyof typeof en].replace(/^The /, 'the ')}`);
    expect(m.text.length).toBeLessThanOrEqual(34);
    // Stratum I's outline opens with the first weapon (owned here), then the guardians.
    expect(q.view().main[0].steps[0]).toMatchObject({ text: en['quest.chain.machete'], done: true });
    expect(q.view().main[0].steps[1].text).toBe(`${m.text} (${en['biome.amberHollows.name' as keyof typeof en]})`);
    expect(of(h, 'quest:step').some((e) => e.id === 'main:s1.guardian.amberHollows')).toBe(true);
    // The compass points at it.
    h.player = { x: 52, y: 20, z: 80 };
    const hud = loop.hud(0); // yaw 0 looks toward -z
    expect(hud.compass).toMatchObject({ kind: 'lair' });
    expect(Math.abs(hud.compass!.bearing)).toBeLessThan(1e-9);
    expect(hud.compass!.distance).toBeCloseTo(20, 9);

    defeat(h, 'amberHollows');
    expect(q.shards.has('amberHollows')).toBe(true);
    expect(of(h, 'quest:shard')).toEqual([{ biome: 'amberHollows', count: 1 }]);
    for (const [id, n] of Object.entries(GUARDIAN_LOOT.amberHollows) as Array<[ItemId, number]>) expect(h.backpack.count(id) + h.storage.count(id), id).toBe(n);
    defeat(h, 'amberHollows'); // a second defeat pays nothing more
    expect(of(h, 'quest:shard')).toHaveLength(1);
    loop.update(0.5);
    expect(q.main().id).toBe('main:s1.lairs');
    expect(q.main().progress).toEqual({ have: 1, need: 2 });
    w.reveal('lair_mushroomForest');
    defeat(h, 'mushroomForest');
    loop.update(0.5);
    // Both shards: the copper pick is not made yet.
    expect(q.main().id).toBe('main:s1.prepare');
    expect(q.main().text).toContain(en['item.copperPick']);
    expect(NEXT_PICK[1]).toBe('copperPick');
    loop.gear.grant('copperPick');
    h.bus.emit('gear:equipped', { item: 'copperPick', slot: 'pick' });
    loop.update(0.5);
    expect(q.main()).toMatchObject({ id: 'main:s1.gate', target: { x: 128, y: 10, z: 120, stratum: 1, kind: 'gate' } });
    expect(q.useGate()).toBe('opened');
    expect(w.opened).toBe(1);
    loop.update(0.5);
    expect(q.main().id).toBe('main:s1.descend');
    expect(q.useGate()).toBe('descend');
    await Promise.resolve();
    expect(w.current).toBe(2);
    loop.update(0.5);
    expect(q.main().id).toBe('main:s2.lairs');
    expect(loop.deepest).toBe(2);
  });

  it('reads the world live: a pick made or a stratum entered between two frames shows at once', () => {
    const { h, loop } = game();
    defeat(h, 'amberHollows');
    defeat(h, 'mushroomForest');
    expect(loop.quests.main().id).toBe('main:s1.prepare');
    loop.gear.grant('copperPick');
    h.bus.emit('gear:equipped', { item: 'copperPick', slot: 'pick' });
    expect(loop.quests.main().id).toBe('main:s1.gate');
    h.strata.enter(2);
    expect(loop.quests.main().id).toBe('main:s2.lairs');
  });

  it('the gate stays sealed with one shard', () => {
    const { h, loop } = game();
    defeat(h, 'amberHollows');
    expect(loop.quests.useGate()).toBe('needShards');
    expect(h.strata.opened).toBe(0);
    expect(of(h, 'toast').at(-1)?.tone).toBe('warn');
  });

  it('above the deepest stratum, the tracker asks to go back down', () => {
    const { h, loop } = game();
    h.strata.enter(2);
    h.strata.enter(1);
    loop.update(0.5);
    expect(loop.quests.main().id).toBe('main:s2.return');
  });

  it('the bottom: 12 shards relight the Heart, its guardian falls, then the ending and free play', () => {
    const { h, loop } = game();
    for (let s = 2; s <= 6; s++) h.strata.enter(s);
    for (const b of BIOME_IDS) if (b !== 'heart') defeat(h, b);
    expect(loop.quests.shards.size).toBe(12);
    loop.update(0.5);
    expect(loop.quests.main()).toMatchObject({ id: 'main:s6.heart', progress: { have: 12, need: 12 }, target: { kind: 'heart', stratum: 6 } });
    h.player = { x: 128, y: 4, z: 236 };
    loop.update(0.5);
    expect(of(h, 'quest:heartLit')).toHaveLength(1);
    expect(loop.quests.main().id).toBe('main:s6.boss');
    defeat(h, 'heart');
    loop.update(0.5);
    expect(of(h, 'quest:ending')).toHaveLength(1);
    expect(loop.quests.main().id).toBe('main:s6.free');
    expect(loop.quests.view().free).toBe(true);
    expect(loop.quests.view().shards).toMatchObject({ have: 12, total: 12 });
  });

  it('the Quests screen lists the chain, the tasks, the orders, the feats and the pages', () => {
    const { loop } = game();
    const v = loop.quests.view();
    expect(v.main.map((s) => s.stratum)).toEqual([1, 2, 3, 4, 5, 6]);
    // Stratum I: the first weapon (owned), the two guardians, the pick, the Gate.
    expect(v.main[0].steps.map((s) => s.done)).toEqual([true, false, false, false, false]);
    expect(v.biomes).toHaveLength(12);
    expect(v.orders.length).toBe(4);
    expect(v.orders.filter((o) => o.daily)).toHaveLength(1);
    expect(v.feats.length).toBe(FEATS3.length);
    expect(v.pages.length).toBe(PAGE_COUNT);
    for (const f of v.feats) {
      expect(f.name.startsWith('feat3.'), f.id).toBe(false);
      expect(f.text.startsWith('feat3.'), f.id).toBe(false);
    }
  });

  it('round-trips the quests through the save', () => {
    const { h, loop } = game(true);
    defeat(h, 'amberHollows');
    loop.quests.readPage(3);
    const save = JSON.parse(JSON.stringify(loop.toSave()));
    const h2 = host();
    const l2 = new Loop(h2);
    l2.wire();
    l2.fromSave(save);
    expect([...l2.quests.shards]).toEqual(['amberHollows']);
    expect([...l2.quests.pages]).toEqual([3]);
    expect(l2.quests.tutorialStep()?.id).toBe('look');
  });
});

describe('side loop: orders, biome tasks, the bestiary, feats, pages', () => {
  it('orders: 3 plus a daily one; progress from the bus; paid and renewed at camp', () => {
    const { h, loop } = game();
    const book = loop.quests.book;
    expect(book.list).toHaveLength(4);
    const o = book.list[0];
    o.have = o.need;
    h.bus.emit('camp:entered', {});
    expect(of(h, 'order:paid').map((e) => e.id)).toEqual([o.id]);
    expect(book.list).toHaveLength(4);
    expect(book.list.some((x) => x.id === o.id)).toBe(false);
    expect(book.done).toBe(1);
    // Deterministic per seed and number.
    expect(makeOrder(5, 3, 2, false)).toEqual(makeOrder(5, 3, 2, false));
    const b2 = new Orders(9);
    b2.fill(1, 100);
    const dailyA = b2.list.find((x) => x.daily)!.id;
    b2.fill(1, 101);
    expect(b2.list.find((x) => x.daily)!.id).not.toBe(dailyA);
  });

  it('a torch order counts placed torches', () => {
    const { h, loop } = game();
    const book = loop.quests.book;
    book.list = [{ id: 'order:x', kind: 'torches', item: null, need: 2, have: 0, reward: { torch: 1 }, daily: false, stratum: 1 }];
    h.bus.emit('player:placed', { item: 'torch', block: 0, x: 0, y: 0, z: 0 });
    h.bus.emit('player:placed', { item: 'ladder', block: 0, x: 0, y: 0, z: 0 });
    expect(book.list[0].have).toBe(1);
    h.bus.emit('player:placed', { item: 'torch', block: 0, x: 0, y: 0, z: 0 });
    expect(book.list[0].have).toBe(2);
  });

  it('a new bestiary page pays the creature\'s parts; 5 pages raise max health', () => {
    const { h } = game();
    h.bus.emit('mob:bestiary', { kind: 'crawler', page: 'new', found: 1, total: 61 });
    expect(of(h, 'bestiary:reward')).toHaveLength(1);
    expect(h.backpack.count('chitin')).toBe(2);
    for (let i = 2; i <= 5; i++) h.bus.emit('mob:bestiary', { kind: 'gnasher', page: 'new', found: i, total: 61 });
    expect(h.health.max).toBe(PLAYER.maxHealth + 10);
  });

  it('feats pay their rewards once', () => {
    const { h, loop } = game();
    loop.counters.crafted = 1;
    loop.update(1.1);
    expect(of(h, 'feat:earned').map((e) => e.id)).toContain('firstCraft');
    loop.update(1.1);
    expect(of(h, 'feat:earned').filter((e) => e.id === 'firstCraft')).toHaveLength(1);
  });

  it('pages: a Halden note read in the world becomes a numbered page', () => {
    const { h, loop } = game();
    h.bus.emit('world:note', { id: 'page_2', first: true });
    expect([...loop.quests.pages]).toEqual([2]);
    expect(of(h, 'quest:page')).toEqual([{ n: 2, first: true }]);
    for (let n = 1; n <= PAGE_COUNT; n++) {
      expect(en[`page.${n}.title` as keyof typeof en], `page ${n}`).toBeTruthy();
      expect(en[`page.${n}.body` as keyof typeof en], `page ${n}`).toBeTruthy();
    }
  });

  it('biome tasks: veins mined in a biome pay its task (plain rock and built blocks do not count)', () => {
    const { h, loop } = game();
    h.strata.biomeHere = 'amberHollows';
    loop.update(0.3);
    expect(loop.quests.side()?.id).toBe('task:amberHollows.mine');
    const vein = BIOMES.amberHollows.ores[0].block;
    for (let i = 0; i < 24; i++) h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: vein });
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: B.BUILT_PLANK });
    expect(of(h, 'quest:done').some((e) => e.id === 'task:amberHollows.mine')).toBe(false);
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: vein });
    expect(of(h, 'quest:done').some((e) => e.id === 'task:amberHollows.mine')).toBe(true);
    expect(en['task.mine']).toContain('{biome}');
  });
});

describe('guidance: arrival cards and hints', () => {
  it('every biome has an arrival card with its name, line and rumour; hazard biomes name the counter', () => {
    for (const b of BIOME_IDS) {
      const c = arrivalCard(b, true);
      expect(c.name, b).not.toBe(b);
      expect(c.line.length, b).toBeGreaterThan(5);
      if (b !== 'heart') expect(c.rumour.length, b).toBeGreaterThan(5);
      if (['cold', 'gas', 'lava', 'dark', 'void'].includes(BIOMES[b].hazard.kind)) {
        expect(c.hazard, b).toBeTruthy();
        expect(c.counter, b).toBeTruthy();
      }
    }
  });

  it('entering a biome shows its card; being stuck for 90 s gives a hint', () => {
    const { h, loop } = game();
    h.bus.emit('world:biome', { biome: 'frostCaverns', from: 'amberHollows', stratum: 4, first: true });
    expect(of(h, 'guide:arrival')).toHaveLength(1);
    h.inCamp = false;
    for (let i = 0; i < 95; i++) loop.update(1);
    expect(of(h, 'guide:hint').some((e) => String(e.id).startsWith('stuck:'))).toBe(true);
  });

  it('a low flame and low health give a hint, at most once a minute', () => {
    const { h, loop } = game();
    h.inCamp = false;
    h.lanternFuel.update(lanternForTier(1).fuelSeconds * 0.85, false, lanternForTier(1));
    h.health.damage(80, true);
    loop.update(0.5);
    loop.update(0.5);
    const ids = of(h, 'guide:hint').map((e) => e.id);
    expect(ids.filter((x) => x === 'lowFlame')).toHaveLength(1);
    expect(ids.filter((x) => x === 'lowHealth')).toHaveLength(1);
  });
});

describe('hazards (cold, gas, lava, dark) and their counters', () => {
  const probe = (over: Partial<HazardProbe> = {}): HazardProbe => ({
    kind: 'cold', strength: 0.7, zone: 1, inLava: false, nearWarmth: false, lit: true, inCamp: false, moving: true,
    wards: { cold: 0, gas: 0, heat: 0, dark: 0 }, potions: {}, health: 100, ...over,
  });
  const run = (hz: Hazards, p: HazardProbe, seconds: number) => {
    let dmg = 0;
    for (let t = 0; t < seconds; t += 0.25) dmg += hz.update(0.25, p).damage;
    return dmg;
  };

  it('the cold builds up away from warmth and then bites; a torch, a tonic or the Fur set stop it', () => {
    const hz = new Hazards();
    expect(run(hz, probe(), 30)).toBe(0);
    expect(hz.meter).toBeGreaterThan(0.4);
    expect(run(hz, probe(), 40)).toBeGreaterThan(0);
    expect(hz.active).toBe('cold');
    hz.reset();
    expect(run(hz, probe({ nearWarmth: true }), 120)).toBe(0);
    expect(run(hz, probe({ potions: { cold: 60 } }), 120)).toBe(0);
    expect(run(hz, probe({ wards: { cold: 1, gas: 0, heat: 0, dark: 0 } }), 120)).toBe(0);
    // Two pieces of the set slow it a lot.
    const two = new Hazards();
    run(two, probe({ wards: { cold: 2 / 3, gas: 0, heat: 0, dark: 0 } }), 40);
    expect(two.meter).toBeLessThan(0.3);
  });

  it('gas hurts in its pockets from half the meter; the Bog set filters it', () => {
    const hz = new Hazards();
    expect(run(hz, probe({ kind: 'gas', strength: 0.8, zone: 1 }), 8)).toBeGreaterThan(0);
    const bog = new Hazards();
    expect(run(bog, probe({ kind: 'gas', strength: 0.8, zone: 1, wards: { cold: 0, gas: 1, heat: 0, dark: 0 } }), 30)).toBe(0);
    const outside = new Hazards();
    expect(run(outside, probe({ kind: 'gas', strength: 0.8, zone: 0 }), 30)).toBe(0);
  });

  it('lava: its heat near a river, and standing in it; the Ember set halves the burn', () => {
    const near = new Hazards();
    expect(run(near, probe({ kind: 'lava', strength: 0.9, zone: 1 }), 20)).toBeGreaterThan(0);
    const inLava = new Hazards().update(0.25, probe({ kind: 'lava', strength: 0.9, zone: 1, inLava: true })).damage;
    const warded = new Hazards().update(0.25, probe({ kind: 'lava', strength: 0.9, zone: 1, inLava: true, wards: { cold: 0, gas: 0, heat: 1, dark: 0 } })).damage;
    expect(inLava).toBeGreaterThan(warded);
    expect(warded).toBeGreaterThan(0);
  });

  it('the dark eats oil faster and creeps in once the flame is out; a better lantern holds it back', () => {
    const hz = new Hazards();
    const lit = hz.update(0.25, probe({ kind: 'dark', strength: 0.7, lit: true }));
    expect(lit.burn).toBeGreaterThan(1);
    expect(run(hz, probe({ kind: 'dark', strength: 0.7, lit: false }), 30)).toBeGreaterThan(0);
    const glow = new Hazards().update(0.25, probe({ kind: 'dark', strength: 0.7, lit: true, wards: { cold: 0, gas: 0, heat: 0, dark: 0.8 } }));
    expect(glow.burn).toBeLessThan(lit.burn);
  });

  it('the camp is always safe', () => {
    const hz = new Hazards();
    expect(run(hz, probe({ inCamp: true }), 200)).toBe(0);
    expect(run(hz, probe({ kind: 'lava', strength: 1, zone: 1, inLava: true, inCamp: true }), 10)).toBe(0);
  });

  it('has the hazard text: names, the hurt toasts and the counters', () => {
    for (const k of ['cold', 'gas', 'heat', 'dark']) {
      expect(en[`hazard.${k}` as keyof typeof en], k).toBeTruthy();
      expect(en[`hazard.hurt.${k}` as keyof typeof en], k).toBeTruthy();
      expect(en[`hazard.${k}.counter` as keyof typeof en], k).toBeTruthy();
    }
  });
});

describe('the loop in a stratum: hazards through the hub', () => {
  it('Frost Caverns bite a bare explorer; the damage pierces armour; a full Fur set is immune', () => {
    const { h, loop } = game();
    h.strata.enter(4);
    h.strata.biomeHere = 'frostCaverns';
    h.inCamp = false;
    for (let i = 0; i < 80 * 4; i++) loop.update(0.25);
    expect(h.health.current).toBeLessThan(PLAYER.maxHealth);
    expect(of(h, 'hazard:changed').some((e) => e.kind === 'cold')).toBe(true);
    const { h: h2, loop: l2 } = game();
    h2.strata.enter(4);
    h2.strata.biomeHere = 'frostCaverns';
    h2.inCamp = false;
    for (const id of ['furHood', 'furCoat', 'furBoots'] as ItemId[]) l2.gear.grant(id);
    l2.syncGear();
    for (let i = 0; i < 80 * 4; i++) l2.update(0.25);
    expect(h2.health.current).toBe(PLAYER.maxHealth);
  });

  it('the HUD gets the hazard meter', () => {
    const { h, loop } = game();
    h.strata.enter(4);
    h.strata.biomeHere = 'frostCaverns';
    h.inCamp = false;
    for (let i = 0; i < 40; i++) loop.update(0.25);
    expect(loop.hud(0).hazard.kind).toBe('cold');
    expect(loop.hud(0).hazard.level).toBeGreaterThan(0);
    expect(ITEMS.warmingTonic.use).toMatchObject({ kind: 'ward', hazard: 'cold' });
  });
});

describe('hazards (2): elemental blows, the warnings, the zones, thorns and flares', () => {
  const probe = (over: Partial<HazardProbe> = {}): HazardProbe => ({
    kind: 'none', strength: 0, zone: 0, inLava: false, nearWarmth: false, lit: true, inCamp: false, moving: true,
    wards: { cold: 0, gas: 0, heat: 0, dark: 0 }, potions: {}, health: 100, ...over,
  });
  const none = { cold: 0, gas: 0, heat: 0, dark: 0 };

  it('a frost blow bumps the cold meter (none under its tonic or the full Fur set); it fades away from the cold', () => {
    const hz = new Hazards();
    expect(hz.hit('frost', none, {}).meter).toBe('cold');
    expect(hz.active).toBe('cold');
    expect(hz.meter).toBeCloseTo(0.2, 5);
    for (let i = 0; i < 40; i++) hz.update(0.25, probe());
    expect(hz.meter).toBe(0);
    const tonic = new Hazards();
    expect(tonic.hit('frost', none, { cold: 30 }).meter).toBeNull();
    expect(tonic.meter).toBe(0);
    const fur = new Hazards();
    fur.hit('frost', { ...none, cold: 1 }, {});
    expect(fur.meter).toBe(0);
    // Shock and plain blows add nothing.
    expect(new Hazards().hit('shock', none, {}).meter).toBeNull();
  });

  it('fire keeps biting for a moment (about 6 hp), cut by the heat ward; the camp puts it out', () => {
    const hz = new Hazards();
    expect(hz.hit('fire', none, {}).dot).toBe(true);
    let dmg = 0;
    for (let i = 0; i < 20; i++) dmg += hz.update(0.25, probe()).damage;
    expect(dmg).toBeGreaterThan(5.5);
    expect(dmg).toBeLessThan(6.5);
    expect(hz.burning).toBe(0);
    const half = new Hazards();
    half.hit('fire', { ...none, heat: 0.5 }, {});
    let d2 = 0;
    for (let i = 0; i < 20; i++) d2 += half.update(0.25, probe({ wards: { ...none, heat: 0.5 } })).damage;
    expect(d2).toBeLessThan(dmg * 0.6);
    const camp = new Hazards();
    camp.hit('acid', none, {});
    expect(camp.update(0.25, probe({ inCamp: true })).damage).toBe(0);
    expect(camp.burning).toBe(0);
  });

  it('a meter rising past the warning level is announced once (not again for 90 s), not a blow\'s bump', () => {
    const hz = new Hazards();
    let warns = 0;
    for (let i = 0; i < 4 * 40; i++) if (hz.update(0.25, probe({ kind: 'cold', strength: 0.7, zone: 1 })).warn) warns++;
    expect(warns).toBe(1);
    const bump = new Hazards();
    bump.hit('frost', none, {});
    bump.hit('frost', none, {});
    bump.hit('frost', none, {});
    expect(bump.update(0.25, probe()).warn).toBe(false);
  });

  it('the hub: a frost blow in the Frost Caverns, the first-time line, the void drinking oil', () => {
    const { h, loop } = game();
    h.strata.enter(4);
    h.strata.biomeHere = 'frostCaverns';
    h.inCamp = false;
    h.bus.emit('mob:attack', { id: 1, kind: 'icefang', damage: 5, landed: true, element: 'frost' } as GameEvents['mob:attack']);
    h.bus.emit('mob:attack', { id: 1, kind: 'icefang', damage: 5, landed: true, element: 'frost' } as GameEvents['mob:attack']);
    expect(loop.hazards.meter).toBeGreaterThan(0.3);
    expect(of(h, 'guide:hint').filter((e) => e.id === 'element:frost')).toHaveLength(1);
    // A missed blow does nothing.
    const before = loop.hazards.meter;
    h.bus.emit('mob:attack', { id: 1, kind: 'icefang', damage: 5, landed: false, element: 'frost' } as GameEvents['mob:attack']);
    expect(loop.hazards.meter).toBe(before);
    const fuel = h.lanternFuel.fuel;
    h.bus.emit('mob:attack', { id: 2, kind: 'voidEye', damage: 5, landed: true, element: 'void' } as GameEvents['mob:attack']);
    expect(h.lanternFuel.fuel).toBeCloseTo(fuel - 8, 5);
  });

  it('the warning names the counter carried (its hotbar slot), else what to do', () => {
    const { h, loop } = game();
    expect(loop.hazardFix('cold')).toMatchObject({ item: null, target: null, text: en['hazard.fix.cold'] });
    h.backpack.add('warmingTonic', 2);
    loop.learn('warmingTonic');
    const fix = loop.hazardFix('cold');
    expect(fix.item).toBe('warmingTonic');
    expect(fix.text).toContain('2');
    expect(fix.target === 'bag' || /^hotbar:\d$/.test(String(fix.target))).toBe(true);
    // The cold building in the Frost Caverns says it once, with the tonic.
    h.strata.enter(4);
    h.strata.biomeHere = 'frostCaverns';
    h.inCamp = false;
    for (let i = 0; i < 4 * 30; i++) loop.update(0.25);
    const warn = of(h, 'toast').filter((e) => String(e.text).startsWith(en['hazard.warn.cold']));
    expect(warn).toHaveLength(1);
    expect(String(warn[0].text)).toContain(en['item.warmingTonic']);
  });

  it('walking into a hazard zone of WORLD\'s gives its line once per stratum', () => {
    const { h, loop } = game();
    h.strata.enter(3);
    h.strata.biomeHere = 'haldenMines';
    h.inCamp = false;
    (h.strata.layout as unknown as { hazards: unknown[] }).hazards = [{ kind: 'rockfall', centre: [0, 10, 0], radius: 8, strength: 0.4 }];
    for (let i = 0; i < 8; i++) loop.update(0.25);
    h.player.x = 40;
    for (let i = 0; i < 8; i++) loop.update(0.25);
    h.player.x = 0;
    for (let i = 0; i < 8; i++) loop.update(0.25);
    expect(of(h, 'guide:hint').filter((e) => e.id === 'zone:rockfall')).toHaveLength(1);
    expect(en['hazard.zone.rockfall']).toBeTruthy();
  });

  it('the Glowroot\'s vines scratch an explorer brushing past them (armour softens it)', () => {
    const { h, loop } = game();
    h.strata.enter(4);
    h.strata.biomeHere = 'glowrootJungle';
    h.inCamp = false;
    const vine = { x: 1, y: 10, z: 0 };
    (h as { session: unknown }).session = { world: { get: (x: number, y: number, z: number) => (x === vine.x && y === vine.y && z === vine.z ? B.GLOW_VINE : B.AIR) }, liveProps: new Map(), props: { add() {}, remove() {}, has: () => false, setLift() {} }, setBlock() {}, removeProp() {} };
    for (let i = 0; i < 4 * 12; i++) {
      h.player.z = (i % 2) * 0.3;
      loop.update(0.25);
    }
    expect(h.health.current).toBeLessThan(PLAYER.maxHealth);
    const hurt = h.health.current;
    h.player.x = 30;
    for (let i = 0; i < 4 * 12; i++) {
      h.player.z = (i % 2) * 0.3;
      loop.update(0.25);
    }
    expect(h.health.current).toBe(hurt);
  });

  it('a thrown flare\'s light keeps the dark back where it lands', () => {
    const { h, loop } = game();
    h.strata.enter(5);
    h.strata.biomeHere = 'sunkenCity';
    h.inCamp = false;
    h.backpack.add('flare', 2);
    h.lanternFuel.drain(h.lanternFuel.fuel);
    expect(loop.consumeThrown('flare')).toBe(true);
    h.bus.emit('weapon:flash', { x: 2, y: 10, z: 0, radius: 6, count: 0 });
    for (let i = 0; i < 4 * 30; i++) loop.update(0.25);
    expect(h.health.current).toBe(PLAYER.maxHealth);
    // Without the flare the dark creeps in once the flame is out.
    const { h: h2, loop: l2 } = game();
    h2.strata.enter(5);
    h2.strata.biomeHere = 'sunkenCity';
    h2.inCamp = false;
    h2.lanternFuel.drain(h2.lanternFuel.fuel);
    for (let i = 0; i < 4 * 30; i++) l2.update(0.25);
    expect(h2.health.current).toBeLessThan(PLAYER.maxHealth);
    // A bomb's flash is not a flare (UI's 'weapon:flash' says what landed).
    const { h: h3, loop: l3 } = game();
    h3.backpack.add('flare', 1);
    l3.consumeThrown('flare');
    h3.bus.emit('weapon:flash', { x: 0, y: 10, z: 0, radius: 4, count: 0, kind: 'bomb' } as GameEvents['weapon:flash']);
    expect((l3 as unknown as { flares: unknown[] }).flares).toHaveLength(0);
    h3.bus.emit('weapon:flash', { x: 0, y: 10, z: 0, radius: 6, count: 0, kind: 'flare' } as GameEvents['weapon:flash']);
    expect((l3 as unknown as { flares: unknown[] }).flares).toHaveLength(1);
  });
});

describe('the hidden places of each biome (WORLD\'s named sites)', () => {
  const withSites = (h: TestHost, sites: Array<{ id: string; biome: BiomeId; kind: string; name: string }>) => {
    (h.strata.layout as unknown as { sites: unknown[] }).sites = sites.map((x) => ({ ...x, centre: [0, 10, 0], radius: 10 }));
  };

  it('counts each biome\'s places from the layout, pays the task, and two feats', () => {
    const { h, loop } = game();
    withSites(h, [
      { id: 's1', biome: 'amberHollows', kind: 'setPiece', name: 'honeycomb' },
      { id: 's2', biome: 'amberHollows', kind: 'secret', name: 'secret' },
      { id: 's3', biome: 'amberHollows', kind: 'vista', name: 'honeyCathedral' },
      { id: 's4', biome: 'mushroomForest', kind: 'setPiece', name: 'grandCap' },
      { id: 's5', biome: 'mushroomForest', kind: 'secret', name: 'secret' },
      { id: 'x', biome: 'mushroomForest', kind: 'mineCamp', name: '' },
    ]);
    loop.update(0.1);
    const task = () => loop.quests.view().biomes.find((b) => b.biome === 'amberHollows')!.tasks.find((x) => x.id === 'task:amberHollows.places')!;
    expect(task()).toMatchObject({ have: 0, need: 3, done: false });
    expect(task().text).toBe(en['task.places'].replace('{biome}', en['biome.amberHollows.name']).replace('{have}', '0').replace('{need}', '3'));
    const site = (id: string, biome: BiomeId) => h.bus.emit('world:site', { id, kind: 'setPiece', name: 'x', biome, stratum: 1 as StratumIndex });
    site('s1', 'amberHollows');
    site('s1', 'amberHollows');
    expect(task().have).toBe(1);
    site('s2', 'amberHollows');
    site('s3', 'amberHollows');
    expect(task().done).toBe(true);
    expect(of(h, 'quest:done').some((e) => e.id === 'task:amberHollows.places')).toBe(true);
    site('s4', 'mushroomForest');
    site('s5', 'mushroomForest');
    loop.update(1.1);
    expect(loop.quests.feats.has('placesAll')).toBe(true);
    expect(loop.quests.feats.has('places10')).toBe(false);
    // Saved and restored.
    const save = JSON.parse(JSON.stringify(loop.toSave()));
    const h2 = host();
    const l2 = new Loop(h2);
    l2.wire();
    l2.fromSave(save);
    expect(l2.quests.placesSummary()).toEqual({ found: 5, stratumDone: true });
    expect(l2.quests.view().biomes.find((b) => b.biome === 'amberHollows')!.tasks.find((x) => x.id === 'task:amberHollows.places')).toMatchObject({ have: 3, need: 3, done: true });
  });

  it('a biome of a stratum not entered yet asks for its set piece and secret room', () => {
    const { loop } = game();
    const t = loop.quests.view().biomes.find((b) => b.biome === 'magmaVeins')!.tasks.find((x) => x.id === 'task:magmaVeins.places')!;
    expect(t.need).toBe(2);
  });

  it('the trip card counts the places found on the trip', () => {
    const { h, loop } = game();
    h.bus.emit('camp:left', {});
    h.inCamp = false;
    loop.update(30);
    h.bus.emit('world:site', { id: 'v', kind: 'vista', name: 'honeyCathedral', biome: 'amberHollows', stratum: 1 as StratumIndex });
    h.inCamp = true;
    h.bus.emit('camp:entered', {});
    loop.update(0.1);
    const s = loop.lastTrip();
    expect(s?.places).toBe(1);
    expect(s?.lines.some((l) => l.label === en['trip3.places'] && l.value === '1')).toBe(true);
  });
});

describe('guidance (2): the tutorial points and waits for no one; rumours of the lairs; the Craft menu\'s focus', () => {
  it('the tracker says where the tutorial stands; the bubble says what to do', () => {
    const { loop } = game(true);
    expect(loop.quests.main()).toMatchObject({ kind: 'tutorial', text: en['quest.step.tutorial'], progress: { have: 0, need: TUTORIAL.length } });
    expect(loop.quests.tutorialStep()?.line).toBe(en['tut.look']);
  });

  it('on the mining step the compass points at the nearest open vein the pick can break', () => {
    const { h, loop } = game(true);
    const ore = { x: 6, y: 10, z: 2 };
    const deep = { x: 2, y: 10, z: 3 };
    h.inCamp = false;
    (h as { session: unknown }).session = {
      world: {
        get: (x: number, y: number, z: number) => {
          if (x === ore.x && y === ore.y && z === ore.z) return B.COPPER_ORE;
          // A buried vein (no open face) and a vein too hard for the rusty pick, both nearer.
          if (x === deep.x && y === deep.y && z === deep.z) return B.COPPER_ORE;
          if (Math.abs(x - deep.x) + Math.abs(y - deep.y) + Math.abs(z - deep.z) === 1) return B.SLATE;
          if (x === 3 && y === 10 && z === -1) return B.FROST_IRON;
          return B.AIR;
        },
      },
      liveProps: new Map(), props: { add() {}, remove() {}, has: () => false, setLift() {} }, setBlock() {}, removeProp() {},
    };
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    expect(loop.quests.tutorialStep()?.id).toBe('mine');
    loop.update(0.3);
    const tg = loop.quests.main().target;
    expect(tg).toMatchObject({ x: 6.5, y: 10.5, z: 2.5, kind: 'point', stratum: 1 });
    expect(loop.hud(0).compass).not.toBeNull();
    h.bus.emit('block:broken', { x: 6, y: 10, z: 2, block: B.COPPER_ORE });
    expect(loop.quests.main().target).toBeNull();
  });

  it('the fight step in the camp sends the explorer out (creatures shun its light), waits longer there, and points at the nearest monster (QA 21:29)', () => {
    const { h, loop } = game(true);
    const q = loop.quests;
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: 1 });
    h.bus.emit('item:picked', { item: 'copperOre', count: 1 });
    h.bus.emit('craft:made', { recipe: 'torch', item: 'torch', times: 1, count: 4 });
    h.bus.emit('player:placed', { item: 'torch', block: 0, x: 0, y: 0, z: 0 });
    h.inCamp = true;
    expect(q.tutorialStep()).toMatchObject({ id: 'fight', line: en['tut.fightOut'], highlight: 'joystick' });
    // Its 45 s take 2 minutes in the camp (the explorer has time to walk out), then it moves on.
    for (let i = 0; i < 100; i++) loop.update(1);
    expect(q.tutorialStep()?.id).toBe('fight');
    // Out of the camp: the usual line, Action rung, and the compass on the nearest monster.
    h.inCamp = false;
    (h as { mobs: unknown }).mobs = {
      list: () => [
        { position: { x: 1, y: 10, z: 1 }, hostile: false, state: 'idle' },
        { position: { x: 30, y: 10, z: 0 }, hostile: true, state: 'idle' },
        { position: { x: 6, y: 10, z: -8 }, hostile: true, state: 'chase' },
        { position: { x: 2, y: 10, z: 2 }, hostile: true, state: 'dying' },
      ],
    };
    expect(q.tutorialStep()).toMatchObject({ id: 'fight', line: en['tut.fight'], highlight: 'action' });
    loop.update(0.5);
    expect(q.main().target).toMatchObject({ x: 6, y: 10, z: -8, kind: 'point' });
    // Back in the camp's light with the creature close by (QA 22:25): still "aim and strike".
    h.inCamp = true;
    expect(q.tutorialStep()).toMatchObject({ id: 'fight', line: en['tut.fight'], highlight: 'action' });
    h.inCamp = false;
    for (let i = 0; i < 10; i++) loop.update(1);
    expect(q.tutorialStep()?.id).toBe('sonar');
  });

  it('a step left alone moves on by itself (the tutorial never blocks), only while playing', () => {
    const { h, loop } = game(true);
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    expect(loop.quests.tutorialStep()?.id).toBe('mine');
    for (let i = 0; i < 149; i++) loop.update(1, false);
    expect(loop.quests.tutorialStep()?.id).toBe('mine');
    for (let i = 0; i < 151; i++) loop.update(1);
    expect(loop.quests.tutorialStep()?.id).not.toBe('mine');
    for (const s of TUTORIAL) expect(s.timeout, s.id).toBeGreaterThan(0);
  });

  it('after the tutorial an unarmed explorer walks the road to the first weapon, in order, each step with its count and compass (QA 01:44)', () => {
    const { h, loop } = game(true, false);
    const at = chainWorld(h);
    loop.quests.skipTutorial();
    const q = loop.quests;
    const seen: string[] = [];
    const step = () => {
      loop.update(0.3);
      const m = q.mainRawStep();
      if (seen[seen.length - 1] !== m.id) seen.push(m.id);
      return q.main();
    };
    const near = (p: { x: number; y: number; z: number }) => ({ x: p.x, y: p.y, z: p.z, kind: 'point' });
    // 1. Build a Furnace (12 stone, 2 coal): the materials' count, the compass on the nearest loose stone, then coal, then the bench.
    expect(step()).toMatchObject({ text: en['quest.step.furnace'], progress: { have: 0, need: 14 }, target: near(at.rubble) });
    expect(loop.craftView().focus).toMatchObject({ recipe: 'furnace' });
    h.storage.add('stone', 12);
    expect(step()).toMatchObject({ progress: { have: 12, need: 14 }, target: near(at.coal) });
    h.storage.add('coal', 2);
    expect(step()).toMatchObject({ progress: { have: 14, need: 14 }, target: near(at.bench) });
    // Made at the Workbench, it waits in the bag: place it (its camp spot).
    h.backpack.add('furnace' as ItemId, 1);
    expect(step()).toMatchObject({ text: en['quest.step.placeFurnace'], progress: null, target: near(at.furnaceSpot) });
    h.backpack.remove('furnace' as ItemId, 1);
    loop.placeStation('furnace', { x: 9, y: 10, z: 9 });
    // 2. Smelt 7 copper bars (4 for the Forge, 3 for the Machete): the compass on copper, then on the Furnace.
    expect(step()).toMatchObject({ text: en['quest.step.bars'], progress: { have: 0, need: 7 }, target: near(at.copper) });
    expect(loop.craftView().focus).toMatchObject({ recipe: 'copperIngot' });
    h.storage.add('copperOre', 14);
    expect(step()).toMatchObject({ progress: { have: 0, need: 7 }, target: near(at.furnaceSpot) });
    h.storage.add('copperIngot', 7);
    // 3. Build the Forge (10 stone, 4 bars, 2 coal), place it.
    expect(step()).toMatchObject({ text: en['quest.step.forge'], progress: { have: 16, need: 16 }, target: near(at.bench) });
    h.backpack.add('forge' as ItemId, 1);
    expect(step()).toMatchObject({ text: en['quest.step.placeForge'], target: near(at.forgeSpot) });
    h.backpack.remove('forge' as ItemId, 1);
    loop.placeStation('forge', { x: 9, y: 10, z: 9 });
    // 4. A Grit Boar's hide: the compass on the nearest boar.
    expect(step()).toMatchObject({ text: en['quest.step.hide'], progress: { have: 0, need: 1 }, target: near(at.boar) });
    h.backpack.add('hide', 1);
    // 5. Forge the Machete at the Forge.
    expect(step()).toMatchObject({ text: en['quest.step.machete'], progress: { have: 4, need: 4 }, target: near(at.forgeSpot) });
    expect(loop.craftView().focus).toMatchObject({ recipe: 'machete' });
    loop.gear.grant('machete');
    expect(step()).toMatchObject({ id: 'main:s1.lairs', text: en['quest.step.lairs'].replace('{stratum}', en['stratum.1']) });
    expect(seen).toEqual(['main:arm.furnace', 'main:arm.placeFurnace', 'main:arm.bars', 'main:arm.forge', 'main:arm.placeForge', 'main:arm.hide', 'main:arm.machete', 'main:s1.lairs']);
    expect(of(h, 'quest:step').map((e) => e.id)).toEqual(expect.arrayContaining(seen));
    // Why, once, as the road begins.
    expect(of(h, 'guide:hint').filter((e) => e.id === 'arm:chain')).toHaveLength(1);
    // Stratum I's outline opens with it, now done.
    expect(q.view().main[0].steps[0]).toMatchObject({ text: en['quest.chain.machete'], done: true });
  });

  it('with no loose stone in range, the stone compass takes the nearest rock vein (each gives stone 40 %), never a cap or a vine; with nothing in range, no arrow', () => {
    // The real round-3 camp has no rubble near it (only the nests have some): the arrow was missing.
    const cap = { x: 1.5, y: 10.5, z: 1.5 };
    const vine = { x: -1.5, y: 10.5, z: 1.5 };
    const { h, loop } = game(false, false);
    const at = chainWorld(h, { rubble: false, extra: [[cap, B.MUSHROOM_CAP_TEAL], [vine, B.GLOW_VINE]] });
    loop.update(0.3);
    expect(loop.quests.main()).toMatchObject({ id: 'main:arm.furnace', target: { x: at.coal.x, y: at.coal.y, z: at.coal.z, kind: 'point' } });
    // The same for the Forge's stone, once the bars are in.
    loop.placeStation('furnace', { x: 9, y: 10, z: 9 });
    h.storage.add('copperIngot', 7);
    h.storage.add('coal', 2);
    loop.update(0.3);
    expect(loop.quests.main()).toMatchObject({ id: 'main:arm.forge', target: { x: at.coal.x, y: at.coal.y, z: at.coal.z, kind: 'point' } });
    // An empty cave: the step and its count, no arrow.
    const bare = game(false, false);
    chainWorld(bare.h, { rubble: false });
    (bare.h as unknown as { session: { world: { get: () => number } } }).session.world.get = () => B.AIR;
    bare.loop.update(0.3);
    expect(bare.loop.quests.main()).toMatchObject({ id: 'main:arm.furnace', progress: { have: 0, need: 14 }, target: null });
  });

  it('a step whose result is already there is skipped at once, never shown; a save in the middle of the road resumes at its step', () => {
    const { h, loop } = game(false, false);
    chainWorld(h);
    // Seven bars from a chest: no Furnace is needed for now, the Forge is next.
    h.storage.add('copperIngot', 7);
    loop.update(0.3);
    expect(loop.quests.mainRawStep().id).toBe('main:arm.forge');
    loop.placeStation('forge', { x: 1, y: 10, z: 1 });
    h.storage.add('hide', 1);
    loop.update(0.3);
    expect(loop.quests.mainRawStep().id).toBe('main:arm.machete');
    const shown = of(h, 'quest:step').map((e) => e.id);
    expect(shown).not.toContain('main:arm.furnace');
    expect(shown).not.toContain('main:arm.bars');
    expect(shown).not.toContain('main:arm.hide');
    // The save keeps the Forge: a reload (the bank as the game restores it) resumes at the Machete.
    const save = JSON.parse(JSON.stringify(loop.toSave()));
    const h2 = host();
    chainWorld(h2);
    h2.storage.add('copperIngot', 7);
    h2.storage.add('hide', 1);
    const l2 = new Loop(h2);
    l2.wire();
    l2.fromSave(save);
    l2.update(0.3);
    expect(l2.quests.mainRawStep().id).toBe('main:arm.machete');
    // A Forge standing but its bars spent: 3 more (a Furnace first if there is none).
    h2.storage.remove('copperIngot', 6);
    l2.update(0.3);
    expect(l2.quests.main()).toMatchObject({ id: 'main:arm.furnace' });
    l2.placeStation('furnace', { x: 2, y: 10, z: 2 });
    l2.update(0.3);
    expect(l2.quests.main()).toMatchObject({ id: 'main:arm.bars', progress: { have: 1, need: 3 } });
  });

  it('by a lair on the road, the warning comes once per lair; a weapon found in the bag ends the road (QA 22:10)', () => {
    const { h, loop } = game(false, false);
    h.inCamp = false;
    h.strata.reveal('lair_amberHollows');
    loop.update(0.5);
    const q = loop.quests;
    expect(q.mainRawStep().id).toMatch(/^main:arm\./);
    const hints = () => of(h, 'guide:hint').filter((e) => String(e.id).startsWith('arm:'));
    expect(hints().map((e) => e.id)).toEqual(['arm:chain']);
    // Walking up to the lair unarmed: the warning, by the Craft button, once.
    h.player = { x: 52, y: 20, z: 62 };
    for (let i = 0; i < 4; i++) loop.update(0.5);
    expect(hints().map((e) => e.id)).toEqual(['arm:chain', 'arm:near:lair_amberHollows']);
    expect(hints()[1]).toMatchObject({ target: 'craft' });
    // A Machete picked up from a chest goes to the locker and is worn: the road ends, the guardian is next.
    h.backpack.add('machete', 1);
    h.bus.emit('inventory:changed', {});
    loop.update(0.5);
    expect(h.backpack.count('machete')).toBe(0);
    expect(loop.gear.equipped.weapon).toBe('machete');
    expect(of(h, 'gear:equipped').some((e) => e.item === 'machete')).toBe(true);
    loop.update(0.5);
    expect(q.main()).toMatchObject({ text: `Defeat ${en['mob.amberMatriarch' as keyof typeof en].replace(/^The /, 'the ')}`, target: { kind: 'lair' } });
  });

  it('after 90 s without a lead the rumour points near the nearest unrevealed lair, with the stuck hint', () => {
    const { h, loop } = game();
    loop.gear.grant('machete');
    h.inCamp = false;
    loop.update(1);
    expect(loop.quests.main()).toMatchObject({ id: 'main:s1.lairs', target: null });
    for (let i = 0; i < 92; i++) loop.update(1);
    const tg = loop.quests.main().target;
    expect(tg?.kind).toBe('point');
    const lair = h.strata.layout!.lairs[0];
    expect(Math.hypot(tg!.x - lair.entrance[0], tg!.z - lair.entrance[2])).toBeLessThanOrEqual(14.01);
    expect(of(h, 'guide:hint').some((e) => e.id === 'stuck:lairs')).toBe(true);
    // Once a lair is known the arrow goes to it exactly.
    h.strata.reveal(lair.id);
    loop.update(0.3);
    expect(loop.quests.main()).toMatchObject({ kind: 'main', target: { x: lair.entrance[0], z: lair.entrance[2], kind: 'lair' } });
  });

  it('the Crafting menu opens on the tutorial\'s torches, and on the pick the quest asks for', () => {
    const { h, loop } = game(true);
    h.backpack.add('fungalWood', 2);
    h.backpack.add('coal', 2);
    loop.learn('fungalWood');
    loop.learn('coal');
    expect(loop.craftView().focus ?? null).toBeNull();
    for (let i = 0; i < 3; i++) h.bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) h.bus.emit('ui:used', { control: 'move' });
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: B.COPPER_ORE });
    h.bus.emit('item:picked', { item: 'copperOre', count: 1 });
    expect(loop.quests.tutorialStep()?.id).toBe('craft');
    expect(loop.craftView().focus).toEqual({ category: 'building', recipe: 'torch' });
    // The prepare step: both shards of stratum I, no copper pick yet.
    loop.quests.skipTutorial();
    h.bus.emit('mob:guardianDefeated', { id: 1, kind: 'amberMatriarch', biome: 'amberHollows', shard: 'amberHollows', x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);
    h.bus.emit('mob:guardianDefeated', { id: 2, kind: 'mycelord', biome: 'mushroomForest', shard: 'mushroomForest', x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);
    loop.learn('copperIngot');
    expect(loop.quests.mainRawStep().step).toBe('prepare');
    expect(loop.craftView().focus).toEqual({ category: 'tools', recipe: 'copperPick' });
  });
});

describe('camp orders (2): paid on the arrival\'s own deposit; the needs follow the explorer down', () => {
  it('a delivery done by the bag banked on arrival is paid on that same arrival', () => {
    const { h, loop } = game();
    const book = loop.quests.book;
    book.list = [{ id: 'order:x', kind: 'deliver', item: 'copperOre', need: 5, have: 0, reward: { torch: 3 }, daily: false, stratum: 1 }, ...book.list.filter((o) => o.daily)];
    h.inCamp = true;
    h.bus.emit('camp:entered', {});
    expect(of(h, 'order:paid')).toHaveLength(0);
    h.bus.emit('items:banked', { total: 6, items: { copperOre: 6 } });
    expect(of(h, 'order:paid').map((e) => e.id)).toEqual(['order:x']);
    expect(book.list.filter((o) => !o.daily)).toHaveLength(3);
  });

  it('an order not started, made for a shallower stratum, is replaced; one under way stays', () => {
    const { h, loop } = game();
    const book = loop.quests.book;
    const keep = { id: 'order:keep', kind: 'hunt' as const, item: null, need: 6, have: 2, reward: { torch: 3 }, daily: false, stratum: 1 };
    const stale = { id: 'order:stale', kind: 'hunt' as const, item: null, need: 6, have: 0, reward: { torch: 3 }, daily: false, stratum: 1 };
    book.list = [keep, stale, ...book.list.filter((o) => o.daily)];
    h.strata.enter(2);
    h.strata.enter(3);
    // Stratum III's lift landing pays what is done, but brings no new orders (QA 22:10).
    h.bus.emit('camp:entered', {});
    expect(book.list.map((o) => o.id)).toContain('order:stale');
    expect(of(h, 'toast').some((e) => e.text === en['order.renewed'])).toBe(false);
    // Back at the camp: the needs have followed the explorer down.
    h.bus.emit('camp:left', {});
    h.strata.enter(1);
    h.bus.emit('camp:entered', {});
    const ids = book.list.map((o) => o.id);
    expect(ids).toContain('order:keep');
    expect(ids).not.toContain('order:stale');
    expect(book.list.filter((o) => !o.daily && o.id !== 'order:keep').every((o) => o.stratum === 3)).toBe(true);
    expect(of(h, 'toast').some((e) => e.text === en['order.renewed'])).toBe(true);
  });
});

describe('the side tracker\'s suggested craft (what the descent needs next)', () => {
  it('armed but wearing nothing at a first-strata guardian: the Miner set\'s next piece, once its materials are seen (MOBS 23:00)', () => {
    const { h, loop } = game();
    h.inCamp = false;
    loop.gear.grant('machete');
    h.strata.reveal('lair_amberHollows');
    loop.update(0.5);
    expect(loop.quests.mainRawStep().step).toBe('guardian');
    expect(loop.advice()).toBeNull();
    for (const id of ['hide', 'chitin', 'copperIngot'] as ItemId[]) loop.learn(id);
    expect(loop.advice()).toMatchObject({ why: 'guard', item: 'minerVest' });
    loop.update(0.3);
    expect(loop.quests.side()?.text).toBe(en['advice.guard'].replace('{item}', en['item.minerVest' as keyof typeof en]));
    loop.gear.grant('minerVest');
    expect(loop.advice()).toBeNull();
  });

  it('a weapon before the guardians, the ward of a hazard stratum, a brighter lantern, an outpost', () => {
    const { h, loop } = game(false, false);
    // Stratum I with no weapon: the main line walks the road to the Machete (QA 01:44), so no side
    // line repeats it, even once its materials are known.
    for (const id of ['copperIngot', 'hide', 'fungalWood', 'gel', 'fang'] as ItemId[]) loop.learn(id);
    expect(loop.quests.mainRawStep().id).toMatch(/^main:arm\./);
    expect(loop.advice()).toBeNull();
    loop.gear.grant('machete');
    expect(loop.advice()).toBeNull();
    loop.update(0.3);
    expect(loop.quests.side()?.kind).not.toBe('side');
    // Stratum IV: the Fur set (chest first), then the next piece.
    h.strata.enter(2);
    h.strata.enter(3);
    h.strata.enter(4);
    for (const id of ['frostFur', 'silverIngot', 'chitin'] as ItemId[]) loop.learn(id);
    loop.gear.grant('sword');
    expect(loop.advice()).toMatchObject({ why: 'armour', item: 'furCoat', hazard: en['hazard.noun.cold'] });
    loop.update(0.3);
    expect(loop.quests.side()?.text).toBe(en['advice.armour'].replace('{item}', en['item.furCoat']).replace('{hazard}', en['hazard.noun.cold']));
    expect(loop.quests.side()).toMatchObject({ id: 'advice:furCoat', kind: 'side', title: en['advice.title'] });
    // A tracked task wins.
    loop.quests.track('task:frostCaverns.mine');
    expect(loop.quests.side()?.id).toBe('task:frostCaverns.mine');
    loop.quests.track(null);
    for (const id of ['furCoat', 'furHood', 'furBoots'] as ItemId[]) loop.gear.grant(id);
    // A lantern three tiers behind (the copper one is known: glass, amber, copper bars).
    for (const id of ['glass', 'amber'] as ItemId[]) loop.learn(id);
    expect(loop.advice()).toMatchObject({ why: 'lantern', item: 'copperLantern' });
  });
});

describe('the earlier deep\'s feats', () => {
  it('a 1.x explorer\'s feats show earned in the Quests screen, under their own names', () => {
    const { h, loop } = game();
    (h as unknown as { progression: unknown }).progression = { extra: { feats: ['firstStone', 'answer', 'nope'] } };
    const feats = loop.quests.view().feats;
    const legacy = feats.filter((f) => f.id.startsWith('legacy:'));
    expect(legacy.map((f) => f.id)).toEqual(['legacy:firstStone', 'legacy:answer']);
    expect(legacy.every((f) => f.earned)).toBe(true);
    expect(legacy[0].name).toBe(en['feat3.legacy'].replace('{name}', en['feat.firstStone.name']));
    expect(feats.length).toBe(FEATS3.length + 2);
  });
});

describe('the trip card says where the trip ended', () => {
  it('back at camp; at a lower stratum\'s lift; rested at an outpost (the next trip starts there); a black-out', () => {
    const { h, loop } = game();
    const out = () => { h.bus.emit('camp:left', {}); h.inCamp = false; loop.update(30); };
    const home = () => { h.inCamp = true; h.bus.emit('camp:entered', {}); loop.update(0.1); h.inCamp = false; };
    out();
    h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: B.COPPER_ORE });
    home();
    expect(loop.lastTrip()).toMatchObject({ where: 'camp', title: en['trip3.title'] });
    out();
    h.strata.enter(2);
    h.strata.enter(3);
    loop.update(1);
    home();
    expect(loop.lastTrip()).toMatchObject({ where: 'lift', title: en['trip3.title.lift'].replace('{stratum}', 'III') });
    out();
    const o = loop.placeOutpost({ x: 5, y: 10, z: 5 })!;
    loop.update(25);
    expect(loop.restAtOutpost(o.id)).toBe(true);
    loop.update(0.1);
    expect(loop.lastTrip()).toMatchObject({ where: 'outpost', title: en['trip3.title.outpost'] });
    expect(loop.trip.active).toBe(true);
    loop.update(30);
    h.bus.emit('player:died', { lost: null } as unknown as GameEvents['player:died']);
    loop.update(0.1);
    expect(loop.lastTrip()).toMatchObject({ outcome: 'blackout', where: 'outpost', title: en['trip3.blackout.outpost'] });
  });
});

describe('the whole descent, step by step (BRIEF §0.3)', () => {
  it('tutorial → six strata (lairs, guardians, the pick, the gate, the descent) → the Heart → its guardian → the ending → free play', async () => {
    const { h, loop } = game(true);
    const q = loop.quests;
    const seen: string[] = [];
    const step = () => {
      loop.update(0.3);
      const m = q.mainRawStep();
      const v = q.main();
      if (seen[seen.length - 1] !== m.id) seen.push(m.id);
      expect(v.text.length, m.id).toBeGreaterThan(5);
      expect(/\{[a-z]+\}/i.test(v.text), v.text).toBe(false);
      return { m, v };
    };
    expect(step().m.step).toBe('tutorial');
    q.skipTutorial();
    h.inCamp = false;
    loop.gear.grant('machete'); // the first weapon, made at the Forge in stratum I
    const picks = NEXT_PICK as Record<number, ItemId | null>;
    for (let n = 1; n <= 6; n++) {
      expect(h.strata.current).toBe(n);
      expect(step().m).toMatchObject({ step: 'lairs', stratum: n });
      for (const lair of h.strata.layout!.lairs) {
        h.strata.reveal(lair.id);
        const g = step();
        expect(g.m).toMatchObject({ step: 'guardian', biome: lair.biome });
        expect(g.v.target).toMatchObject({ kind: 'lair', stratum: n });
        defeat(h, lair.biome);
      }
      if (n < 6) {
        expect(step().m.step).toBe('prepare');
        loop.gear.grant(picks[n] as ItemId);
        h.bus.emit('gear:equipped', { item: picks[n] as ItemId, slot: 'pick' });
        const g = step();
        expect(g.m.step).toBe('gate');
        expect(g.v.target?.kind).toBe('gate');
        expect(q.useGate()).toBe('opened');
        expect(step().m.step).toBe('descend');
        expect(q.useGate()).toBe('descend');
        await Promise.resolve();
      }
    }
    expect(q.shards.size).toBe(12);
    const heart = step();
    expect(heart.m.step).toBe('heart');
    expect(heart.v.target?.kind).toBe('heart');
    h.player.x = 128;
    h.player.z = 240;
    expect(step().m.step).toBe('boss');
    expect(q.heartLit).toBe(true);
    defeat(h, 'heart');
    expect(step().m.step).toBe('free');
    expect(of(h, 'quest:ending')).toHaveLength(1);
    expect(q.view().free).toBe(true);
    // The chain, in order: 1 tutorial + per stratum lairs, 2 guardians (+ lairs again between), prepare, gate, descend.
    expect(seen[0]).toBe('main:tutorial');
    expect(seen.filter((s) => s.endsWith('.gate'))).toHaveLength(5);
    expect(seen.filter((s) => s.includes('.guardian.'))).toHaveLength(12);
    expect(seen.slice(-3)).toEqual(['main:s6.heart', 'main:s6.boss', 'main:s6.free']);
    // The feats of the descent, and every stratum's step in the Quests screen done.
    for (let i = 0; i < 3; i++) loop.update(1);
    for (const f of ['firstGuardian', 'stratum2', 'stratum3', 'stratum4', 'stratum5', 'stratum6', 'sixShards', 'allShards', 'heart', 'sunPick']) expect(q.feats.has(f), f).toBe(true);
    expect(q.view().main.every((s) => s.steps.every((x) => x.done))).toBe(true);
  });
});

describe('chest orders', () => {
  it('an "open 4 chests" order counts the chests opened, and the trip card too', () => {
    const { h, loop } = game();
    const book = loop.quests.book;
    book.list = [{ id: 'order:c', kind: 'chests', item: null, need: 2, have: 0, reward: { torch: 2 }, daily: false, stratum: 1 }, ...book.list.filter((o) => o.daily)];
    h.bus.emit('camp:left', {});
    h.inCamp = false;
    loop.update(1);
    loop.chestOpened();
    loop.chestOpened();
    expect(book.list[0].have).toBe(2);
    expect(of(h, 'toast').some((e) => e.text === en['order.ready'])).toBe(true);
    h.inCamp = true;
    h.bus.emit('camp:entered', {});
    loop.update(0.1);
    expect(of(h, 'order:paid').map((e) => e.id)).toContain('order:c');
    expect(loop.lastTrip()?.chests).toBe(2);
    expect(en['order.chests']).toBeTruthy();
  });
});
