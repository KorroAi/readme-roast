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

function game(tutorial = false): { h: TestHost; loop: Loop } {
  const h = host();
  const loop = new Loop(h);
  loop.wire();
  loop.newGame(77, tutorial);
  return { h, loop };
}

const of = (h: TestHost, type: string) => h.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);
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
    expect(q.main()).toMatchObject({ id: 'main:s1.lairs', kind: 'main', progress: { have: 0, need: 2 }, target: null });
    w.reveal('lair_amberHollows');
    loop.update(0.5);
    const m = q.main();
    expect(m.id).toBe('main:s1.guardian.amberHollows');
    expect(m.target).toEqual({ x: 52, y: 20, z: 60, stratum: 1, kind: 'lair' });
    // "Defeat the Amber Matriarch in the Amber Hollows": the guardian's name inside the line.
    expect(m.text).toBe(`Defeat ${en[`mob.${ROSTERS.amberHollows.guardian}` as keyof typeof en].replace(/^The /, 'the ')} in the ${en['biome.amberHollows.name' as keyof typeof en]}`);
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
    expect(v.main[0].steps.map((s) => s.done)).toEqual([false, false, false, false]);
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
