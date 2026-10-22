import { describe, expect, it } from 'vitest';
import { ITEMS, CATALOGUE, isItem, type ItemId } from '../../src/config/items';
import { RECIPES, RECIPE_CATEGORIES, recipeInputs, recipesFor } from '../../src/config/recipes';
import { STATIONS, STATION_IDS, OUTPOST } from '../../src/config/stations';
import { ARMOUR_SETS, ARMOUR_SET_IDS, ARMOUR_CAP } from '../../src/config/armour';
import { WEAPONS } from '../../src/config/weapons';
import { PLAYER, lanternForTier, packForTier } from '../../src/config/balance';
import { B } from '../../src/config/blocks';
import { rarityOf } from '../../src/config/rarity';
import { allOres } from '../../src/config/biomes';
import { EventBus, type GameEvents } from '../../src/core/events';
import { en } from '../../src/i18n/en';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import { Equipment } from '../../src/gameplay/Equipment';
import { Health } from '../../src/gameplay/Health';
import { Lantern } from '../../src/gameplay/Lantern';
import { Gear } from '../../src/gameplay/Gear';
import { Craft, FUEL_ITEMS, isUnlocked } from '../../src/game/craft/CraftSystem';
import { Hotbar, modeOf } from '../../src/game/craft/Hotbar';
import { Loop, type LoopHost, type StrataLike } from '../../src/game/craft/Loop';
import type { CraftContext, ItemStore } from '../../src/game/craft/types';
import type { StratumLayout } from '../../src/world/gen/strata/types';
import { BONUS_DROPS, lootFor, type ChestKind } from '../../src/config/loot';
import { Rng } from '../../src/core/rng';
import { BIOMES } from '../../src/config/biomes';

// ---------------------------------------------------------------------------------------
// Helpers

function storeOf(b: Backpack | CampStorage): ItemStore {
  return { count: (i) => b.count(i), add: (i, n) => b.add(i, n), remove: (i, n) => b.remove(i, n), room: (i) => b.room(i) };
}

function ctx(over: Partial<CraftContext> & { bagItems?: Partial<Record<ItemId, number>>; bankItems?: Partial<Record<ItemId, number>> } = {}): CraftContext & { backpack: Backpack; storage: CampStorage } {
  const backpack = new Backpack(16);
  const storage = new CampStorage();
  for (const [k, v] of Object.entries(over.bagItems ?? {})) backpack.add(k as ItemId, v as number);
  for (const [k, v] of Object.entries(over.bankItems ?? {})) storage.add(k as ItemId, v as number);
  return {
    bag: storeOf(backpack),
    bank: over.bankItems ? storeOf(storage) : null,
    stations: over.stations ?? new Set(['hand']),
    known: over.known ?? new Set(CATALOGUE),
    stratum: over.stratum ?? 6,
    owned: over.owned ?? new Set<ItemId>(['rustyPick', 'oilLantern']),
    backpack,
    storage,
  };
}

class FakeStrata implements StrataLike {
  current = 1;
  deepest = 1;
  layout: StratumLayout | null = null;
  biomeHere = null;
  outposts: Array<{ id: string; x: number; y: number; z: number }> = [];
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
  addOutpost(id: string, x: number, y: number, z: number): unknown {
    const i = this.outposts.findIndex((o) => o.id === id);
    if (i >= 0) this.outposts[i] = { id, x, y, z };
    else this.outposts.push({ id, x, y, z });
    return null;
  }
}

interface TestHost extends LoopHost {
  inCamp: boolean;
  player: { x: number; y: number; z: number };
  strata: FakeStrata;
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
    player: { x: 0, y: 0, z: 0 },
    strata: new FakeStrata(),
    session: null,
    events,
  };
}

function loopOf(h = host()): { h: TestHost; loop: Loop } {
  const loop = new Loop(h);
  loop.wire();
  loop.newGame(1234, false);
  return { h, loop };
}

const types = (h: TestHost) => h.events.map((e) => e.type);

// ---------------------------------------------------------------------------------------
// The data

describe('round 3 items, recipes and stations (LOOP data)', () => {
  it('every recipe reads real items, a real station, and the Furnace ones burn fuel', () => {
    const ids = new Set<string>();
    for (const r of RECIPES) {
      expect(ids.has(r.id), r.id).toBe(false);
      ids.add(r.id);
      expect(isItem(r.output.item), r.id).toBe(true);
      expect(r.output.count, r.id).toBeGreaterThan(0);
      expect(STATION_IDS, r.id).toContain(r.station);
      expect(RECIPE_CATEGORIES, r.id).toContain(r.category);
      for (const [item, n] of recipeInputs(r)) {
        expect(isItem(item), `${r.id} <- ${item}`).toBe(true);
        expect(n, r.id).toBeGreaterThan(0);
        expect(ITEMS[item].keyItem, `${r.id} spends a key item`).toBe(false);
      }
      if (r.station === 'furnace') expect(r.fuel ?? 0, `${r.id} burns fuel`).toBeGreaterThan(0);
      else expect(r.fuel ?? 0, `${r.id} off the Furnace`).toBe(0);
    }
    expect(RECIPES.length).toBeGreaterThanOrEqual(75);
  });

  it('every piece of gear, every station, every consumable and every building item has a recipe (but the starting gear)', () => {
    const start = new Set<ItemId>(['rustyPick', 'oilLantern']);
    for (const id of CATALOGUE) {
      const d = ITEMS[id];
      const made = recipesFor(id).length > 0;
      if (d.equip && !start.has(id)) expect(made, `${id} (gear)`).toBe(true);
      if (d.kind === 'station' || d.category === 'building' || d.category === 'consumables') expect(made, id).toBe(true);
    }
    // Ingots and glass only come from the Furnace.
    for (const id of CATALOGUE.filter((x) => ITEMS[x].kind === 'ingot')) expect(recipesFor(id).every((r) => r.station === 'furnace'), id).toBe(true);
    // Each placed station is an item with a Workbench recipe.
    for (const s of STATION_IDS) {
      const item = STATIONS[s].item;
      if (item) expect(recipesFor(item).some((r) => r.station === 'workbench'), s).toBe(true);
    }
  });

  it('has three weapons per band (melee, reach, ranged), the four armour sets and five picks above the rusty one', () => {
    const weapons = CATALOGUE.filter((id) => ITEMS[id].equip === 'weapon');
    expect(weapons).toHaveLength(9);
    for (const band of [1, 2, 3]) expect(weapons.filter((id) => ITEMS[id].tier === band), `band ${band}`).toHaveLength(3);
    for (const id of weapons) expect(WEAPONS[id as keyof typeof WEAPONS], id).toBeTruthy();
    expect(ARMOUR_SET_IDS).toEqual(['miner', 'fur', 'bog', 'ember']);
    expect(ARMOUR_SETS.fur.ward).toBe('cold');
    expect(ARMOUR_SETS.bog.ward).toBe('gas');
    expect(ARMOUR_SETS.ember.ward).toBe('heat');
    expect(CATALOGUE.filter((id) => ITEMS[id].equip === 'pick').map((id) => ITEMS[id].tier)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('building items place WORLD blocks, stations and outposts', () => {
    expect(ITEMS.torch.place).toBe('torch');
    expect(ITEMS.ladder.place).toBe('ladder');
    expect(ITEMS.rope.place).toBe('rope');
    expect(ITEMS.plank.place).toBe('block');
    expect(ITEMS.brick.place).toBe('block');
    expect(ITEMS.door.place).toBe('door');
    expect(ITEMS.furnace.place).toBe('station');
    expect(ITEMS.forge.place).toBe('station');
    expect(ITEMS.alchemyTable.place).toBe('station');
    expect(ITEMS.outpostKit.place).toBe('outpost');
    for (const b of [B.TORCH, B.LADDER, B.ROPE, B.BUILT_PLANK, B.BUILT_BRICK, B.DOOR]) expect(b).toBeGreaterThan(0);
  });

  it('every new ore reads as its biome rarity; cracked walls are a common find', () => {
    const home = new Map<number, string>();
    for (const o of allOres()) if (!home.has(o.block)) home.set(o.block, o.rarity);
    for (const [block, rarity] of home) expect(rarityOf(block), `block ${block}`).toBe(rarity);
    expect(rarityOf(B.CRACKED_WALL)).toBe('common');
    // What you build never glows as a find.
    for (const b of [B.BUILT_PLANK, B.BUILT_BRICK, B.TORCH, B.LADDER, B.ROPE, B.DOOR]) expect(rarityOf(b), `placed ${b}`).toBeNull();
  });

  it('has the text of every item, station, category and armour set', () => {
    const has = (k: string) => Object.prototype.hasOwnProperty.call(en, k);
    for (const id of CATALOGUE) {
      expect(has(ITEMS[id].name), ITEMS[id].name).toBe(true);
      expect(has(ITEMS[id].desc), ITEMS[id].desc).toBe(true);
    }
    for (const s of STATION_IDS) {
      expect(has(STATIONS[s].name), s).toBe(true);
      expect(has(STATIONS[s].desc), s).toBe(true);
    }
    for (const c of RECIPE_CATEGORIES) expect(has(`craft3.cat.${c}`), c).toBe(true);
    for (const id of ARMOUR_SET_IDS) {
      expect(has(ARMOUR_SETS[id].name), id).toBe(true);
      expect(has(ARMOUR_SETS[id].bonus), id).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------------------
// The craft rules

describe('CraftSystem (round 3)', () => {
  it('makes torches by hand from fungal wood and coal', () => {
    const c = ctx({ bagItems: { fungalWood: 2, coal: 2 } });
    const chk = Craft.can('torch', c);
    expect(chk).toMatchObject({ ok: true, state: 'ok', max: 2 });
    const out = Craft.craft('torch', c, 1);
    expect(out).toMatchObject({ ok: true, made: 1, added: 4 });
    expect(c.backpack.count('torch')).toBe(4);
    expect(c.backpack.count('fungalWood')).toBe(1);
    expect(c.backpack.count('coal')).toBe(1);
  });

  it('needs the station in reach, then the materials, then the fuel', () => {
    const c = ctx({ bagItems: { copperOre: 4 } });
    expect(Craft.can('copperIngot', c).state).toBe('station');
    c.stations = new Set(['hand', 'furnace']);
    expect(Craft.can('copperIngot', c).state).toBe('fuel');
    c.backpack.add('fungalWood', 1);
    expect(Craft.can('copperIngot', c)).toMatchObject({ state: 'ok', fuelHave: 1, fuelNeed: 1, max: 1 });
    c.backpack.add('coal', 1);
    // 4 ore make 2 bars; coal (4 units) and the wood (1) give 5 units.
    expect(Craft.can('copperIngot', c).max).toBe(2);
    expect(Craft.can('copperIngot', c, 3)).toMatchObject({ ok: false, state: 'missing', missing: { copperOre: 2 } });
  });

  it('burns coal before wood, and never a recipe input as fuel', () => {
    expect(FUEL_ITEMS.slice(0, 3)).toEqual(['coal', 'blackOil', 'sulphur']);
    expect(FUEL_ITEMS.indexOf('fungalWood')).toBeLessThan(FUEL_ITEMS.indexOf('heartwood'));
    const c = ctx({ bagItems: { copperOre: 4, coal: 1, fungalWood: 3 }, stations: new Set(['hand', 'furnace']) });
    const out = Craft.craft('copperIngot', c, 2);
    expect(out).toMatchObject({ ok: true, made: 2 });
    expect(c.backpack.count('coal')).toBe(0);
    expect(c.backpack.count('fungalWood')).toBe(3);
    // Torches from wood and coal: the coal is an input, so a Furnace craft cannot burn it.
    const d = ctx({ bagItems: { glowcap: 2, coal: 1 }, stations: new Set(['hand', 'furnace']) });
    expect(Craft.can('roastCap', d)).toMatchObject({ state: 'ok', fuelHave: 4 });
  });

  it('takes from the bank first at the camp (the bag keeps its room) and makes up to 5 at once', () => {
    const c = ctx({ bagItems: { fungalWood: 5 }, bankItems: { fungalWood: 2 } });
    const out = Craft.craft('plank', c, 5);
    expect(out).toMatchObject({ ok: true, made: 5, added: 20 });
    expect(c.storage.count('fungalWood')).toBe(0);
    expect(c.backpack.count('fungalWood')).toBe(2);
    expect(c.backpack.count('plank')).toBe(20);
  });

  it('makes gear once and reports it owned', () => {
    const c = ctx({ bagItems: { copperIngot: 10, fungalWood: 6 }, stations: new Set(['hand', 'workbench']) });
    expect(Craft.can('copperPick', c).max).toBe(1);
    expect(Craft.craft('copperPick', c, 5).made).toBe(1);
    c.owned = new Set<ItemId>([...c.owned, 'copperPick']);
    expect(Craft.can('copperPick', c).state).toBe('owned');
  });

  it('refuses a craft whose output has nowhere to go', () => {
    const c = ctx({ bagItems: { fungalWood: 1 } });
    const bag = new Backpack(1);
    bag.add('fungalWood', 1);
    c.bag = storeOf(bag);
    // Planks take the wood's slot once it is spent? No: the check runs before spending.
    expect(Craft.craft('plank', c).ok).toBe(false);
    expect(bag.count('fungalWood')).toBe(1);
  });

  it('shows recipes as their materials are found, or by stratum', () => {
    const torch = RECIPES.find((r) => r.id === 'torch')!;
    const pick = RECIPES.find((r) => r.id === 'copperPick')!;
    expect(isUnlocked(torch, { known: new Set(), stratum: 1 })).toBe(true);
    expect(isUnlocked(pick, { known: new Set<ItemId>(['copperIngot']), stratum: 1 })).toBe(false);
    expect(isUnlocked(pick, { known: new Set<ItemId>(['copperIngot', 'fungalWood']), stratum: 1 })).toBe(true);
    expect(Craft.can(pick, ctx({ known: new Set() })).state).toBe('hidden');
  });
});

// ---------------------------------------------------------------------------------------
// The hotbar

describe('Hotbar (6 slots)', () => {
  const bag = new Backpack(16);
  const gear = new Gear();
  const hb = new Hotbar({ count: (i) => bag.count(i), pick: () => gear.equipped.pick ?? 'rustyPick', weapon: () => gear.equipped.weapon });

  it('shows the pick and the weapon, and puts new things in their home slots', () => {
    expect(hb.itemAt(0)).toBe('rustyPick');
    expect(hb.itemAt(1)).toBeNull();
    bag.add('torch', 4);
    bag.add('bandage', 2);
    bag.add('blastBomb', 1);
    bag.add('rope', 3);
    expect(hb.offer('torch')).toBe(3);
    expect(hb.offer('bandage')).toBe(4);
    expect(hb.offer('blastBomb')).toBe(2);
    expect(hb.offer('rope')).toBe(5);
    expect(hb.offer('copperOre')).toBe(-1);
    expect(hb.slots().map((s) => s.item)).toEqual(['rustyPick', null, 'blastBomb', 'torch', 'bandage', 'rope']);
  });

  it('selects, assigns (moving an item) and reports what Action and Place do', () => {
    expect(hb.select(3)).toBe(true);
    expect(hb.view().mode).toBe('place');
    expect(hb.select(2) && hb.view().mode).toBe('throw');
    expect(hb.select(4) && hb.view().mode).toBe('use');
    expect(hb.select(0) && hb.view().mode).toBe('mine');
    expect(hb.select(9)).toBe(false);
    expect(hb.assign(5, 'torch')).toBe(true);
    expect(hb.itemAt(3)).toBeNull();
    expect(hb.itemAt(5)).toBe('torch');
    expect(hb.assign(1, 'machete')).toBe(false);
    expect(modeOf('machete')).toBe('attack');
    gear.grant('machete');
    expect(hb.itemAt(1)).toBe('machete');
    // A stack that ran out stays on its slot, dimmed.
    bag.remove('torch', 4);
    hb.select(5);
    expect(hb.view().slots[5]).toMatchObject({ item: 'torch', count: 0, mode: 'none' });
    expect(hb.view().mode).toBe('none');
  });

  it('saves and loads its slots', () => {
    const save = hb.toJSON();
    const other = new Hotbar({ count: () => 1, pick: () => 'rustyPick', weapon: () => null });
    other.load(save);
    expect(other.toJSON()).toEqual(save);
    other.load({ slots: ['machete', 'copperPick', 'nope', 'torch'], selected: 3 });
    expect(other.toJSON()).toEqual({ slots: [null, null, null, 'torch', null, null], selected: 3 });
  });
});

// ---------------------------------------------------------------------------------------
// The loop hub

describe('Loop: crafting, gear, stations, outposts, consumables', () => {
  it('crafts a pick at the camp bench: it is equipped (gear never takes bag room) and the mining tier follows', () => {
    const { h, loop } = loopOf();
    h.storage.add('copperIngot', 5);
    h.backpack.add('fungalWood', 3);
    loop.learn('copperIngot');
    loop.learn('fungalWood');
    expect(loop.craftView().cards.find((c) => c.id === 'copperPick')).toMatchObject({ state: 'ok', stationName: 'Workbench' });
    const out = loop.craft('copperPick');
    expect(out.ok).toBe(true);
    expect(loop.gear.equipped.pick).toBe('copperPick');
    expect(h.backpack.count('copperPick')).toBe(0);
    expect(h.equipment.tier('pickaxe')).toBe(2);
    expect(types(h)).toContain('craft:made');
    expect(types(h)).toContain('gear:equipped');
    expect(loop.craft('copperPick').check.state).toBe('owned');
  });

  it('a full bag sends crafted things to the bank at the camp', () => {
    const { h, loop } = loopOf();
    h.backpack.resize(1);
    h.backpack.add('fungalWood', 1);
    expect(loop.craft('plank').ok).toBe(true);
    expect(h.storage.count('plank') + h.backpack.count('plank')).toBe(4);
  });

  it('places stations and outposts: a Furnace in reach opens smelting; an outpost is a bench, a bank and a bed', () => {
    const { h, loop } = loopOf();
    h.inCamp = false;
    h.player = { x: 50, y: 10, z: 50 };
    expect(loop.stationsNear().has('workbench')).toBe(false);
    expect(loop.bankHere()).toBe(false);
    loop.placeStation('furnace', { x: 52, y: 10, z: 50 });
    expect(loop.stationsNear().has('furnace')).toBe(true);
    h.player = { x: 60, y: 10, z: 50 };
    expect(loop.stationsNear().has('furnace')).toBe(false);
    const o = loop.placeOutpost({ x: 61, y: 10, z: 50 });
    expect(o).not.toBeNull();
    expect(h.strata.outposts.map((x) => x.id)).toEqual([o!.id]);
    expect(loop.bed).toBe(o!.id);
    expect(loop.bankHere()).toBe(true);
    expect(loop.stationsNear().has('workbench')).toBe(true);
    expect(types(h).filter((x) => x === 'station:placed')).toHaveLength(2);
    // At most OUTPOST.maxPerStratum per stratum.
    for (let i = 1; i < OUTPOST.maxPerStratum; i++) expect(loop.placeOutpost({ x: 100 + i * 10, y: 10, z: 50 })).not.toBeNull();
    expect(loop.placeOutpost({ x: 200, y: 10, z: 50 })).toBeNull();
  });

  it('resolves the Place action for the held item', () => {
    const { h, loop } = loopOf();
    const blocks = { BUILT_PLANK: B.BUILT_PLANK, BUILT_BRICK: B.BUILT_BRICK, TORCH: B.TORCH, LADDER: B.LADDER, ROPE: B.ROPE, DOOR: B.DOOR };
    const hold = (item: ItemId, n = 3) => {
      h.backpack.add(item, n);
      loop.learn(item);
      const slot = loop.hotbar.slotOf(item) >= 0 ? loop.hotbar.slotOf(item) : 5;
      loop.assign(slot, item);
      loop.selectHotbar(slot);
      return loop.placeRequest(blocks);
    };
    expect(hold('torch')).toEqual({ kind: 'torch', item: 'torch', block: B.TORCH });
    expect(hold('ladder')).toEqual({ kind: 'ladder', item: 'ladder', block: B.LADDER });
    expect(hold('rope')).toEqual({ kind: 'rope', item: 'rope', block: B.ROPE });
    expect(hold('plank')).toEqual({ kind: 'block', item: 'plank', block: B.BUILT_PLANK });
    expect(hold('brick')).toEqual({ kind: 'block', item: 'brick', block: B.BUILT_BRICK });
    expect(hold('door', 1)).toEqual({ kind: 'door', item: 'door', block: B.DOOR });
    expect(hold('furnace', 1)).toEqual({ kind: 'station', item: 'furnace', station: 'furnace' });
    expect(hold('outpostKit', 1)).toEqual({ kind: 'outpost', item: 'outpostKit' });
    loop.consumePlaced('outpostKit');
    expect(h.backpack.count('outpostKit')).toBe(0);
    expect(loop.placeRequest(blocks)).toBeNull();
  });

  it('uses consumables: food heals, oil refills the flame, a tonic wards the cold; throws spend bombs', () => {
    const { h, loop } = loopOf();
    h.backpack.add('bandage', 2);
    expect(loop.use('bandage')).toBe(false); // full health
    h.health.damage(50);
    expect(loop.use('bandage')).toBe(true);
    expect(h.health.current).toBe(PLAYER.maxHealth - 50 + 20);
    h.backpack.add('oilFlask', 1);
    expect(loop.use('oilFlask')).toBe(false); // full flame
    h.lanternFuel.update(300, false, lanternForTier(1));
    const before = h.lanternFuel.fuel;
    expect(loop.use('oilFlask')).toBe(true);
    expect(h.lanternFuel.fuel).toBeCloseTo(Math.min(lanternForTier(1).fuelSeconds, before + lanternForTier(1).fuelSeconds * 0.5), 6);
    h.backpack.add('warmingTonic', 1);
    expect(loop.use('warmingTonic')).toBe(true);
    expect(loop.wards.cold).toBe(150);
    loop.update(10);
    expect(loop.wards.cold).toBeCloseTo(140, 6);
    h.backpack.add('blastBomb', 2);
    expect(loop.use('blastBomb')).toBe(false);
    expect(loop.consumeThrown('blastBomb')).toBe(true);
    expect(h.backpack.count('blastBomb')).toBe(1);
    expect(types(h).filter((x) => x === 'item:used')).toHaveLength(4);
  });

  it('banks everything but what the hotbar holds', () => {
    const { h, loop } = loopOf();
    h.backpack.add('torch', 8);
    h.backpack.add('copperOre', 20);
    loop.learn('torch');
    expect(loop.hotbar.itemAt(3)).toBe('torch');
    expect(loop.bankAll()).toBe(20);
    expect(h.backpack.count('torch')).toBe(8);
    expect(h.storage.count('copperOre')).toBe(20);
    expect(loop.withdraw('copperOre', 5)).toBe(5);
    h.inCamp = false;
    expect(loop.bankAll()).toBe(0);
  });

  it('the weapon follows the distance: the equipped one in reach, a ranged one far away', () => {
    const { loop } = loopOf();
    expect(loop.weaponFor(1).id).toBe('pick');
    loop.gear.grant('machete');
    loop.gear.grant('sling');
    expect(loop.weaponFor(2).id).toBe('machete');
    expect(loop.weaponFor(10).id).toBe('sling');
    expect(loop.ownedWeapons().sort()).toEqual(['machete', 'sling']);
  });

  it('armour takes its share of creature blows (not hazards); a full Miner set adds 20 health', () => {
    const { h, loop } = loopOf();
    for (const id of ['minerHelmet', 'minerVest', 'minerBoots'] as ItemId[]) {
      loop.gear.grant(id);
      loop.equip(id);
    }
    expect(loop.gear.fullSet()).toBe('miner');
    expect(h.health.armour).toBeCloseTo(0.15, 9);
    expect(h.health.max).toBe(PLAYER.maxHealth + 20);
    expect(h.health.damage(20)).toBeCloseTo(17, 9);
    expect(h.health.damage(20, true)).toBe(20);
    for (const id of ['emberHelm', 'emberPlate', 'emberGreaves'] as ItemId[]) loop.gear.grant(id);
    loop.syncGear();
    expect(h.health.armour).toBeLessThanOrEqual(ARMOUR_CAP);
    expect(loop.gear.fullSet()).toBe('ember');
    expect(loop.gear.wards().heat).toBe(1);
  });

  it('round-trips its save (gear, hotbar, stations, outposts, counters, quests)', () => {
    const { h, loop } = loopOf();
    loop.gear.grant('copperPick');
    h.backpack.add('torch', 5);
    loop.learn('torch');
    loop.placeStation('forge', { x: 1, y: 2, z: 3 });
    h.inCamp = false;
    loop.placeOutpost({ x: 40, y: 2, z: 40 });
    loop.counters.crafted = 7;
    const save = JSON.parse(JSON.stringify(loop.toSave()));
    const h2 = host();
    h2.backpack.add('torch', 5);
    const l2 = new Loop(h2);
    l2.wire();
    l2.fromSave(save);
    expect(l2.gear.equipped.pick).toBe('copperPick');
    expect(l2.hotbar.itemAt(3)).toBe('torch');
    expect(l2.stations).toEqual(loop.stations);
    expect(l2.outposts).toEqual(loop.outposts);
    expect(l2.bed).toBe(loop.bed);
    expect(l2.counters.crafted).toBe(7);
    expect(h2.equipment.tier('pickaxe')).toBe(2);
    // A damaged slice gives a fresh loop.
    const l3 = new Loop(host());
    l3.fromSave('garbage');
    expect(l3.gear.equipped.pick).toBe('rustyPick');
  });
});

// ---------------------------------------------------------------------------------------
// Loot and banking

describe('loot: chests and the loose rock of the ores', () => {
  it('a chest holds its stratum\'s materials and supplies; the rare ones a prize; deterministic per stream', () => {
    for (let tier = 1; tier <= 6; tier++) {
      for (const kind of ['tunnel', 'vault', 'lair', 'oreRoom', 'shrine', 'camp', 'secret', 'dungeon', 'ravine', 'setPiece'] as ChestKind[]) {
        const a = lootFor(kind, tier, new Rng(tier * 31 + kind.length));
        const b = lootFor(kind, tier, new Rng(tier * 31 + kind.length));
        expect(a).toEqual(b);
        const items = Object.keys(a) as ItemId[];
        // A tunnel chest is a find (one or two things); the rare ones hold more and a prize.
        expect(items.length, `${kind} ${tier}`).toBeGreaterThanOrEqual(['vault', 'lair', 'oreRoom', 'shrine', 'secret', 'dungeon', 'setPiece'].includes(kind) ? 3 : 1);
        for (const id of items) {
          expect(isItem(id), id).toBe(true);
          expect(ITEMS[id].keyItem, id).toBe(false);
          expect(a[id]!, id).toBeGreaterThan(0);
        }
      }
    }
    // Many tunnel chests of stratum I give enough stone for a Furnace and a Forge.
    let stone = 0;
    const rng = new Rng(7);
    for (let i = 0; i < 40; i++) stone += lootFor('tunnel', 1, rng, 'amberHollows').stone ?? 0;
    expect(stone).toBeGreaterThan(10);
    expect(lootFor('tunnel', 99, new Rng(1))).toBeTruthy();
  });

  it('every biome ore gives loose stone 40 % of the time, through the drops', () => {
    for (const b of Object.keys(BIOMES) as Array<keyof typeof BIOMES>) for (const o of BIOMES[b].ores) if (o.item !== 'stone') expect(BONUS_DROPS.get(o.block & 255)?.item, `${b} ${o.block}`).toBe('stone');
    const spawned: Array<[ItemId, number]> = [];
    const h = host();
    (h as { drops: unknown }).drops = { spawn: (item: ItemId, n: number) => spawned.push([item, n]) };
    const loop = new Loop(h);
    loop.wire();
    loop.newGame(5, false);
    const vein = BIOMES.amberHollows.ores[0].block;
    for (let i = 0; i < 200; i++) h.bus.emit('block:broken', { x: 1, y: 2, z: 3, block: vein });
    const n = spawned.length;
    expect(n).toBeGreaterThan(60);
    expect(n).toBeLessThan(100);
    expect(spawned.every(([item]) => item === 'stone')).toBe(true);
    h.bus.emit('block:broken', { x: 1, y: 2, z: 3, block: B.BUILT_PLANK });
    expect(spawned.length).toBe(n);
  });

  it('banking at camp keeps the hotbar\'s loadout in the bag', () => {
    const bag = new Backpack(16);
    const bank = new CampStorage();
    bag.add('torch', 6);
    bag.add('bandage', 2);
    bag.add('copperOre', 30);
    const moved = bank.deposit(bag, new Set<ItemId>(['torch', 'bandage']));
    expect(moved).toEqual({ copperOre: 30 });
    expect(bag.totals()).toEqual({ torch: 6, bandage: 2 });
    expect(bank.deposit(bag)).toEqual({ torch: 6, bandage: 2 });
    const { h, loop } = loopOf();
    h.backpack.add('torch', 3);
    loop.learn('torch');
    expect([...loop.keepOnBank()]).toEqual(['torch']);
  });
});

// ---------------------------------------------------------------------------------------
// What the player builds, in the world

describe('Builder: placed stations and outposts as props', () => {
  function session() {
    const liveProps = new Map<string, import('../../src/world/gen/types').PropSpec>();
    const lifts = new Map<string, number>();
    const blocks = new Map<string, number>();
    return {
      liveProps,
      lifts,
      blocks,
      props: {
        add: (spec: import('../../src/world/gen/types').PropSpec) => void spec,
        remove: (id: string) => void lifts.delete(id),
        has: (id: string) => liveProps.has(id),
        setLift: (id: string, v: number) => void lifts.set(id, v),
      },
      world: { get: (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? B.AIR },
      setBlock: (x: number, y: number, z: number, id: number) => void blocks.set(`${x},${y},${z}`, id),
      removeProp: (id: string) => liveProps.delete(id),
    };
  }

  it('a placed Furnace rises out of the floor with an ember glow, opens the Craft menu, and comes back on a stratum re-entry', () => {
    const h = host();
    const s = session();
    (h as { session: unknown }).session = s;
    const loop = new Loop(h);
    loop.wire();
    loop.newGame(3, false);
    h.inCamp = false;
    h.player = { x: 10, y: 5, z: 10 };
    const st = loop.placeStation('furnace', { x: 12.5, y: 5, z: 10.5 });
    const spec = s.liveProps.get(st.id)!;
    expect(spec).toMatchObject({ kind: 'furnace', interact: 'craft', x: 12.5, y: 5, z: 10.5 });
    expect(spec.emitters).toHaveLength(1);
    expect([...s.blocks.values()]).toContain(B.LIGHT_EMBER);
    expect(s.lifts.get(st.id)).toBeLessThan(0);
    for (let i = 0; i < 10; i++) loop.update(0.2);
    expect(s.lifts.get(st.id)).toBe(0);
    // A switch rebuilds the session's props from the layout: the loop puts its things back.
    s.liveProps.clear();
    h.bus.emit('world:stratum', { stratum: 1, from: null, biomes: ['amberHollows', 'mushroomForest'] } as never);
    expect(s.liveProps.has(st.id)).toBe(true);
    // Another stratum shows none of stratum I's things.
    h.strata.current = 2;
    h.bus.emit('world:stratum', { stratum: 2, from: 1, biomes: ['rootGalleries', 'floodedGrottoes'] } as never);
    expect(s.liveProps.has(st.id)).toBe(false);
  });

  it('an outpost is a place to rest: its bed is the respawn point and its chest takes the bag', () => {
    const h = host();
    const s = session();
    (h as { session: unknown }).session = s;
    h.strata.layout = { stratum: 1 } as unknown as StratumLayout;
    const loop = new Loop(h);
    loop.wire();
    loop.newGame(3, false);
    h.inCamp = false;
    h.player = { x: 40, y: 8, z: 40 };
    const o = loop.placeOutpost({ x: 42.5, y: 8, z: 40.5 })!;
    expect(s.liveProps.get(o.id)).toMatchObject({ kind: 'outpost', interact: 'rest' });
    h.backpack.add('copperOre', 12);
    loop.bed = null;
    expect(loop.restAtOutpost(o.id)).toBe(true);
    expect(loop.bed).toBe(o.id);
    expect(h.storage.count('copperOre')).toBe(12);
    const spot = loop.respawnSpot()!;
    expect(Math.hypot(spot.x - o.x, spot.z - o.z)).toBeCloseTo(1.4, 6);
    h.strata.current = 2;
    expect(loop.respawnSpot()).toBeNull();
  });

  it('at the camp, a station takes its own spot in the camp plan', () => {
    const h = host();
    const s = session();
    (h as { session: unknown }).session = s;
    h.strata.layout = { stratum: 1, campSite: { stations: [{ station: 'forge', p: [100.5, 62, 20.5], rotY: 0.5 }] } } as unknown as StratumLayout;
    const loop = new Loop(h);
    loop.wire();
    loop.newGame(3, false);
    const a = loop.placeStation('forge', { x: 90, y: 62, z: 30 });
    expect(a).toMatchObject({ x: 100.5, y: 62, z: 20.5, rotY: 0.5 });
    // A second forge goes where it is put.
    const b = loop.placeStation('forge', { x: 90, y: 62, z: 30 });
    expect(b).toMatchObject({ x: 90, z: 30 });
  });

  it('wakes the armour up again after a respawn (the hub builds a fresh Health)', () => {
    const { h, loop } = loopOf();
    loop.gear.grant('minerVest');
    loop.syncGear();
    expect(h.health.armour).toBeGreaterThan(0);
    h.health = new Health(h.health.max);
    h.bus.emit('player:respawned', {});
    expect(h.health.armour).toBeGreaterThan(0);
  });
});
