import { describe, expect, it } from 'vitest';
import { ITEMS, type ItemId } from '../../src/config/items';
import { PLAYER, lanternForTier, packForTier } from '../../src/config/balance';
import { B } from '../../src/config/blocks';
import { BIOMES } from '../../src/config/biomes';
import { CAMP_UPGRADES, CAMP_UPGRADE_IDS, TRADES } from '../../src/config/camp';
import { RECIPES } from '../../src/config/recipes';
import { WEAPONS } from '../../src/config/weapons';
import { EventBus, type GameEvents } from '../../src/core/events';
import { en } from '../../src/i18n/en';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import { Equipment } from '../../src/gameplay/Equipment';
import { Health } from '../../src/gameplay/Health';
import { Lantern } from '../../src/gameplay/Lantern';
import { Loop, type LoopHost, type StrataLike } from '../../src/game/craft/Loop';
import { GEM_FX, socketsOf } from '../../src/game/craft/Sockets';
import { daily, dayOf } from '../../src/game/quests/Daily';
import type { StratumLayout } from '../../src/world/gen/strata/types';
import type { PropSpec } from '../../src/world/gen/types';

// ---------------------------------------------------------------------------------------
// A camp in stratum I, with a session that holds props

const FIRE: [number, number, number] = [100.5, 20, 100.5];

function session() {
  const liveProps = new Map<string, PropSpec>();
  return {
    liveProps,
    props: { add: () => undefined, remove: () => undefined, has: (id: string) => liveProps.has(id), setLift: () => undefined },
    // A flat floor at y 19 (solid below 20), air above.
    world: { get: (_x: number, y: number) => (y < 20 ? B.SLATE : B.AIR) },
    setBlock: () => undefined,
    removeProp: (id: string) => liveProps.delete(id),
  };
}

class Strata implements StrataLike {
  current = 1;
  deepest = 1;
  layout = { stratum: 1, campSite: { fire: FIRE, stations: [] }, lairs: [], gate: { stand: [0, 0, 0], next: 2 }, heart: null, pages: [], hazards: [] } as unknown as StratumLayout;
  biomeHere = 'amberHollows' as const;
  isRevealed(): boolean {
    return false;
  }
  gateOpen(): boolean {
    return false;
  }
  openGate(): boolean {
    return true;
  }
  async descend(): Promise<boolean> {
    return true;
  }
  depth(y: number): number {
    return 100 - y;
  }
}

interface TestHost extends LoopHost {
  inCamp: boolean;
  player: { x: number; y: number; z: number };
  strata: Strata;
  session: ReturnType<typeof session>;
  mobs: object | null;
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
    player: { x: FIRE[0], y: 20, z: FIRE[2] + 3 },
    strata: new Strata(),
    session: session(),
    mobs: null,
    events,
  };
}

function game(): { h: TestHost; loop: Loop } {
  const h = host();
  const loop = new Loop(h);
  loop.wire();
  loop.newGame(99, false);
  return { h, loop };
}

const of = (h: TestHost, type: string) => h.events.filter((e) => e.type === type).map((e) => e.payload as Record<string, unknown>);
const give = (h: TestHost, items: Partial<Record<ItemId, number>>) => {
  for (const [id, n] of Object.entries(items) as Array<[ItemId, number]>) h.storage.add(id, n);
};

// ---------------------------------------------------------------------------------------

describe('the camp grows (upgrades built at the camp Workbench)', () => {
  it('shows each upgrade as a card in the camp tab, with have/need, and builds it level by level', () => {
    const { h, loop } = game();
    const v = loop.craftView();
    expect(v.categories.map((c) => c.id)).toContain('camp');
    const tents = v.cards.find((c) => c.id === 'camp:tents')!;
    expect(tents).toMatchObject({ category: 'camp', state: 'missing', stat: en['camp3.tents.1'] });
    expect(tents.inputs.map((i) => i.item)).toEqual(Object.keys(CAMP_UPGRADES.tents.levels[0].cost));
    give(h, CAMP_UPGRADES.tents.levels[0].cost);
    expect(loop.craftView().cards.find((c) => c.id === 'camp:tents')!.state).toBe('ok');
    expect(loop.craft('camp:tents').ok).toBe(true);
    expect(loop.camp.levels.tents).toBe(1);
    expect(h.health.max).toBe(PLAYER.maxHealth + 10);
    expect(of(h, 'camp:upgraded')).toEqual([{ id: 'tents', level: 1 }]);
    // Its prop stands at the camp now (settled on the floor), and so does the trader's cart.
    const tent = [...h.session.liveProps.values()].find((p) => p.id.startsWith('camp:tents:1'))!;
    expect(tent).toBeTruthy();
    expect(tent.y).toBe(20);
    expect(h.session.liveProps.has('camp:trader')).toBe(true);
    // Level 2 waits for stratum IV.
    expect(loop.craftView().cards.find((c) => c.id === 'camp:tents')).toBeUndefined();
  });

  it('every upgrade level has its text and a stratum gate; the fully built ones read as owned', () => {
    for (const id of CAMP_UPGRADE_IDS) {
      const d = CAMP_UPGRADES[id];
      expect(en[d.name], id).toBeTruthy();
      expect(en[d.desc], id).toBeTruthy();
      for (const l of d.levels) {
        expect(en[l.does], id).toBeTruthy();
        for (const item of Object.keys(l.cost)) expect(ITEMS[item as ItemId], `${id} ${item}`).toBeTruthy();
      }
    }
    const { h, loop } = game();
    give(h, CAMP_UPGRADES.garden.levels[0].cost);
    loop.craft('camp:garden');
    loop.deepest = 6;
    give(h, CAMP_UPGRADES.garden.levels[1].cost);
    expect(loop.craft('camp:garden').ok).toBe(true);
    expect(loop.craftView().cards.find((c) => c.id === 'camp:garden')).toMatchObject({ state: 'owned', reason: en['camp3.maxed'] });
  });

  it('away from the camp it cannot be built', () => {
    const { h, loop } = game();
    give(h, CAMP_UPGRADES.lamps.levels[0].cost);
    h.inCamp = false;
    expect(loop.craft('camp:lamps').ok).toBe(false);
    expect(loop.craftView().cards.find((c) => c.id === 'camp:lamps')!.state).toBe('station');
  });

  it('the chimney halves the Furnace fuel at the camp; the lamps make orders pay more', () => {
    const { h, loop } = game();
    loop.deepest = 2;
    give(h, CAMP_UPGRADES.chimney.levels[0].cost);
    expect(loop.craft('camp:chimney').ok).toBe(true);
    loop.placeStation('furnace', { x: FIRE[0] + 1, y: 20, z: FIRE[2] + 3 });
    give(h, { copperOre: 8, coal: 1 });
    loop.learn('copperOre');
    expect(loop.craft('copperIngot', 4)).toMatchObject({ ok: true, made: 4 });
    expect(h.storage.count('coal')).toBe(0); // 4 crafts burnt 2 units: one coal (4 units) was enough, the rest of it is gone with it
    // Lamps: an order of 4 torches pays 6.
    give(h, CAMP_UPGRADES.lamps.levels[0].cost);
    expect(loop.craft('camp:lamps').ok).toBe(true);
    loop.quests.book.list = [{ id: 'order:t', kind: 'torches', item: null, need: 1, have: 1, reward: { torch: 4 }, daily: false, stratum: 1 }];
    const before = h.backpack.count('torch') + h.storage.count('torch');
    h.bus.emit('camp:entered', {});
    expect(h.backpack.count('torch') + h.storage.count('torch') - before).toBe(6);
  });

  it('the trophy wall hangs a head for each shard and adds 2 % damage per trophy', () => {
    const { h, loop } = game();
    loop.deepest = 2;
    give(h, CAMP_UPGRADES.trophies.levels[0].cost);
    expect(loop.craft('camp:trophies').ok).toBe(true);
    loop.gear.grant('machete');
    const base = WEAPONS.machete.damage;
    for (const b of ['amberHollows', 'mushroomForest'] as const) h.bus.emit('mob:guardianDefeated', { id: 1, kind: 'amberMatriarch', biome: b, shard: b, x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);
    expect(loop.weaponFor(1).damage).toBeCloseTo(base * 1.04, 6);
    expect(h.session.liveProps.has('camp:trophy:amberHollows')).toBe(true);
    expect(h.session.liveProps.has('camp:trophy:mushroomForest')).toBe(true);
  });

  it('the garden fills the bank on each return from a trip', () => {
    const { h, loop } = game();
    give(h, CAMP_UPGRADES.garden.levels[0].cost);
    expect(loop.craft('camp:garden').ok).toBe(true);
    const cap = h.storage.count('glowcap');
    h.inCamp = false;
    h.bus.emit('camp:left', {});
    loop.update(30);
    h.inCamp = true;
    h.bus.emit('camp:entered', {});
    expect(h.storage.count('glowcap') - cap).toBe(4);
    expect(of(h, 'reward:paid').some((e) => e.reason === 'garden')).toBe(true);
  });
});

describe('the trader at the camp', () => {
  it('offers five barters and one rare recipe at a time; barters make several at once', () => {
    const { h, loop } = game();
    const cards = loop.craftView().cards.filter((c) => c.category === 'trader');
    expect(cards.length).toBe(6);
    expect(cards.filter((c) => c.output.name.startsWith(en['trader3.recipe'].split('{')[0]))).toHaveLength(1);
    const barter = cards.find((c) => !c.fresh)!;
    const def = TRADES.find((x) => `trade:${x.id}` === barter.id)!;
    give(h, Object.fromEntries(Object.entries(def.give).map(([k, v]) => [k, (v ?? 0) * 3])));
    const out = loop.craft(barter.id, 5);
    expect(out).toMatchObject({ ok: true, made: 3 });
    expect(h.backpack.count(def.get.item) + h.storage.count(def.get.item)).toBeGreaterThanOrEqual(def.get.count * 3);
    expect(of(h, 'trade:done')).toHaveLength(1);
  });

  it('a rare recipe is learned for good: the Lampling Lure shows in the Crafting menu', () => {
    const { h, loop } = game();
    const lure = RECIPES.find((r) => r.id === 'lamplingLure')!;
    expect(lure.unlock).toBe('trader');
    expect(loop.craftView().cards.some((c) => c.id === 'lamplingLure')).toBe(false);
    give(h, TRADES.find((x) => x.id === 'lure')!.give);
    expect(loop.craft('trade:lure').ok).toBe(true);
    expect(loop.camp.bought.has('lamplingLure')).toBe(true);
    expect(loop.craftView().cards.some((c) => c.id === 'lamplingLure')).toBe(true);
    expect(h.backpack.count('lamplingLure') + h.storage.count('lamplingLure')).toBe(1);
    // The next rare recipe takes its place.
    expect(loop.craftView().cards.filter((c) => c.category === 'trader' && c.fresh).map((c) => c.id)).toEqual(['trade:treats']);
  });

  it('new wares come with each return from a trip', () => {
    const { h, loop } = game();
    const before = [...loop.camp.offers];
    h.inCamp = false;
    h.bus.emit('camp:left', {});
    loop.deepest = 4;
    h.inCamp = true;
    h.bus.emit('camp:entered', {});
    expect(loop.camp.offers).not.toEqual(before);
    expect(loop.camp.offers).toHaveLength(5);
  });
});

describe('gem sockets', () => {
  function cutter(h: TestHost, loop: Loop) {
    loop.deepest = 3;
    give(h, TRADES.find((x) => x.id === 'gemcutter')!.give);
    // The rare recipes come one at a time: buy the ones before it.
    for (const id of ['lure', 'treats', 'stew']) {
      give(h, TRADES.find((x) => x.id === id)!.give);
      expect(loop.craft(`trade:${id}`).ok, id).toBe(true);
    }
    expect(loop.craft('trade:gemcutter').ok).toBe(true);
    expect(loop.camp.gemCutting).toBe(true);
  }

  it('weapons have a socket per band, armour one (two from the Bog set); every gem has its effect line', () => {
    expect([socketsOf('machete'), socketsOf('sword'), socketsOf('sunLance')]).toEqual([1, 2, 3]);
    expect([socketsOf('minerVest'), socketsOf('bogCoat'), socketsOf('emberPlate')]).toEqual([1, 2, 2]);
    expect(socketsOf('copperPick')).toBe(0);
    for (const g of Object.keys(GEM_FX)) expect(ITEMS[g as ItemId].kind === 'gem' || g === 'sapAmber', g).toBe(true);
  });

  it('needs the trader\'s gem cutting and a Forge; a gem in the weapon adds damage, in armour armour or wards', () => {
    const { h, loop } = game();
    loop.gear.grant('sword');
    loop.equip('sword');
    h.backpack.add('gem', 2);
    expect(loop.socket('sword', 'gem')).toBe(false);
    expect(loop.socketBlock('sword', 'gem')).toBe(en['gem3.needCutter']);
    cutter(h, loop);
    expect(loop.socketBlock('sword', 'gem')).toBe(en['gem3.needForge']);
    loop.placeStation('forge', { x: FIRE[0] + 1, y: 20, z: FIRE[2] + 3 });
    expect(loop.socketOptions('sword').map((o) => o.gem)).toContain('gem');
    expect(loop.socket('sword', 'gem')).toBe(true);
    expect(loop.weaponFor(1).damage).toBeCloseTo(WEAPONS.sword.damage * 1.1, 6);
    expect(loop.bagView().items.gear.find((x) => x.item === 'sword')!.sockets).toEqual([
      { gem: 'gem', name: en['item.gem'], fx: '+10 % damage' },
      { gem: null, name: en['gem3.empty'], fx: '' },
    ]);
    // Armour: frost crystal wards the cold.
    loop.gear.grant('furCoat');
    loop.equip('furCoat');
    h.backpack.add('frostCrystal', 1);
    expect(loop.socket('furCoat', 'frostCrystal')).toBe(true);
    // A full piece gives its first gem back for a new one.
    h.backpack.add('amber', 1);
    expect(loop.socket('furCoat', 'amber')).toBe(true);
    expect(h.backpack.count('frostCrystal')).toBe(1);
    expect(h.health.max).toBe(PLAYER.maxHealth + 5);
  });
});

describe('the trip summary', () => {
  it('counts a trip from the camp to the camp and shows its card on the next frame', () => {
    const { h, loop } = game();
    h.inCamp = false;
    h.bus.emit('camp:left', {});
    h.player = { x: 0, y: 40, z: 0 };
    loop.update(30);
    const vein = BIOMES.amberHollows.ores[0].block;
    for (let i = 0; i < 12; i++) h.bus.emit('block:broken', { x: 0, y: 0, z: 0, block: vein });
    h.bus.emit('mob:died', { id: 1, kind: 'crawler', pan: 0, gain: 1 });
    h.bus.emit('craft:made', { recipe: 'torch', item: 'torch', times: 2, count: 8 });
    h.player = { x: 0, y: 70, z: 0 };
    h.inCamp = true;
    h.bus.emit('camp:entered', {});
    h.bus.emit('items:banked', { total: 15, items: { copperOre: 15 } });
    expect(of(h, 'trip:summary')).toHaveLength(0);
    loop.update(0.1);
    const s = (of(h, 'trip:summary')[0] as { summary: import('../../src/game/quests/Trip').TripSummary }).summary;
    expect(s).toMatchObject({ outcome: 'returned', deepest: 60, kills: 1, crafted: 2, banked: 15 });
    expect(s.finds.common).toBe(12);
    expect(s.seconds).toBeCloseTo(30.1, 6);
    expect(s.lines.find((l) => l.label === en['trip3.deepest'])!.value).toBe('60 m');
    expect(s.lines.at(-1)!.label).toBe(en['trip3.nextLabel']);
    expect(loop.lastTrip()).toBe(s);
  });

  it('a later trip that goes deeper sets a record', () => {
    const { h, loop } = game();
    const trip = (y: number) => {
      h.inCamp = false;
      h.bus.emit('camp:left', {});
      h.player = { x: 0, y, z: 0 };
      loop.update(40);
      h.player = { x: 0, y: 90, z: 0 };
      h.inCamp = true;
      h.bus.emit('camp:entered', {});
      loop.update(0.1);
      return loop.lastTrip()!;
    };
    expect(trip(60).records).toEqual([]);
    expect(trip(30).records).toContain('depth');
    expect(trip(70).records).not.toContain('depth');
  });
});

describe('the daily descent', () => {
  it('one seed, goal and modifiers per day for everyone, with the text', () => {
    const a = daily(20000);
    expect(daily(20000)).toEqual(a);
    expect(daily(20001).seed).not.toBe(a.seed);
    expect(a.date).toBe('4 October 2024');
    expect(a.goalText).toBe(en[`daily3.goal.${a.goal}` as keyof typeof en]);
    expect(a.mods.length).toBeGreaterThanOrEqual(1);
    for (const m of a.mods) expect(en[`daily3.mod.${m}` as keyof typeof en]).toBeTruthy();
    expect(dayOf(Date.UTC(2026, 9, 22, 12))).toBe(20748);
  });

  it('a daily run applies its modifiers and records the best time when its goal is reached', () => {
    const { h, loop } = game();
    let def = daily(20000);
    for (let d = 20000; d < 20400 && !(def.goal === 'guardian' && def.mods.includes('gift')); d++) def = daily(d);
    expect(def.goal).toBe('guardian');
    loop.startDaily(def);
    expect(h.backpack.count('torch') + h.storage.count('torch')).toBeGreaterThanOrEqual(12);
    loop.update(50);
    h.bus.emit('mob:guardianDefeated', { id: 1, kind: 'amberMatriarch', biome: 'amberHollows', shard: 'amberHollows', x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);
    loop.update(1);
    expect(of(h, 'daily:done')).toHaveLength(1);
    expect(loop.dailyBest[String(def.day)]).toBeGreaterThan(50);
    expect(loop.dailyToday(def.day * 86_400_000 + 1000).best).toBe(loop.dailyBest[String(def.day)]);
  });
});

describe('the Lampling companion: the lure and the treats', () => {
  it('the lure asks MOBS to tame a Lampling nearby, and is kept when none came', () => {
    const { h, loop } = game();
    h.backpack.add('lamplingLure', 2);
    let answer = false;
    h.mobs = { lureLampling: () => answer };
    expect(loop.use('lamplingLure')).toBe(false);
    expect(h.backpack.count('lamplingLure')).toBe(2);
    answer = true;
    expect(loop.use('lamplingLure')).toBe(true);
    expect(h.backpack.count('lamplingLure')).toBe(1);
    expect(of(h, 'companion:lure')).toHaveLength(1);
  });

  it('the lure is kept while a Lampling already follows, and without MOBS hooks', () => {
    const { h, loop } = game();
    h.backpack.add('lamplingLure', 1);
    h.mobs = {};
    expect(loop.use('lamplingLure')).toBe(false);
    h.mobs = { lureLampling: () => true, companion: () => ({ level: 1 }) };
    expect(loop.use('lamplingLure')).toBe(false);
    expect(h.backpack.count('lamplingLure')).toBe(1);
    expect(of(h, 'companion:lure')).toHaveLength(0);
  });

  it('a treat feeds the companion (xp and health for it); none is wasted without one', () => {
    const { h, loop } = game();
    h.backpack.add('glowTreat', 3);
    const fed: Array<[number, number]> = [];
    h.mobs = { hasCompanion: () => false, feedCompanion: (xp: number, heal: number) => (fed.push([xp, heal]), true) };
    expect(loop.use('glowTreat')).toBe(false);
    // A companion that cannot eat now (or a MOBS without the hook) keeps the treat.
    h.mobs = { hasCompanion: () => true };
    expect(loop.use('glowTreat')).toBe(false);
    expect(h.backpack.count('glowTreat')).toBe(3);
    h.mobs = { companion: () => ({ level: 1 }), feedCompanion: (xp: number, heal: number) => (fed.push([xp, heal]), true) };
    expect(loop.use('glowTreat')).toBe(true);
    expect(h.backpack.count('glowTreat')).toBe(2);
    expect(fed).toEqual([[1, 30]]);
    expect(of(h, 'companion:feed')).toEqual([{ item: 'glowTreat', xp: 1, heal: 30 }]);
    // A tamed companion is a feat.
    h.bus.emit('companion:tamed', { kind: 'lampling', name: 'Lampling' } as GameEvents['companion:tamed']);
    loop.update(1.1);
    expect(of(h, 'feat:earned').map((e) => e.id)).toContain('tamed');
  });
});

describe('the stretch state saves', () => {
  it('round-trips the camp, the trader, the sockets, the trip records and the daily bests', () => {
    const { h, loop } = game();
    give(h, CAMP_UPGRADES.tents.levels[0].cost);
    loop.craft('camp:tents');
    give(h, TRADES.find((x) => x.id === 'lure')!.give);
    loop.craft('trade:lure');
    loop.sockets.put('machete', 'amber');
    loop.dailyBest['20000'] = 321;
    loop.trip.records.depth = 77;
    const save = JSON.parse(JSON.stringify(loop.toSave()));
    const h2 = host();
    const l2 = new Loop(h2);
    l2.wire();
    l2.fromSave(save);
    expect(l2.camp.levels.tents).toBe(1);
    expect(l2.camp.bought.has('lamplingLure')).toBe(true);
    expect(l2.camp.offers).toEqual(loop.camp.offers);
    expect(l2.sockets.of('machete')).toEqual(['amber']);
    expect(l2.dailyBest['20000']).toBe(321);
    expect(l2.trip.records.depth).toBe(77);
    expect(h2.health.max).toBe(PLAYER.maxHealth + 10);
  });
});
