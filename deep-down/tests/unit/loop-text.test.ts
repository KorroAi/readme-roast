import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { CATALOGUE, ITEMS } from '../../src/config/items';
import { FEATS3, NEXT_PICK, ORDER_TEMPLATES, TUTORIAL, PAGE_COUNT, STRATUM_BIOMES } from '../../src/config/quests';
import { CAMP_UPGRADES, CAMP_UPGRADE_IDS, TRADES } from '../../src/config/camp';
import { RECIPE_CATEGORIES, RECIPES, recipeInputs } from '../../src/config/recipes';
import { STATIONS, STATION_IDS } from '../../src/config/stations';
import { ARMOUR_SETS, ARMOUR_SET_IDS } from '../../src/config/armour';
import { GEM_FX } from '../../src/game/craft/Sockets';
import { daily } from '../../src/game/quests/Daily';

/**
 * Every text the loop shows goes through t() (BRIEF §4): the keys it builds at run time exist in
 * the English table, and none of them reads as a key or an empty line.
 */
const has = (k: string) => Object.prototype.hasOwnProperty.call(en, k) && String((en as Record<string, string>)[k]).trim().length > 0;

describe('LOOP text (round 3)', () => {
  it('items, stations, recipe tabs, armour sets', () => {
    for (const id of CATALOGUE) expect(has(ITEMS[id].name) && has(ITEMS[id].desc), id).toBe(true);
    for (const s of STATION_IDS) expect(has(STATIONS[s].name) && has(STATIONS[s].desc), s).toBe(true);
    for (const c of RECIPE_CATEGORIES) expect(has(`craft3.cat.${c}`), c).toBe(true);
    for (const a of ARMOUR_SET_IDS) expect(has(ARMOUR_SETS[a].name) && has(ARMOUR_SETS[a].bonus), a).toBe(true);
    for (const r of RECIPES) for (const [i] of recipeInputs(r)) expect(has(ITEMS[i].name), `${r.id} ${i}`).toBe(true);
  });

  it('quests: the tutorial, orders, feats, pages, the strata and biomes they name', () => {
    for (const s of TUTORIAL) expect(has(s.line), s.id).toBe(true);
    expect(has('tut.torch.pick')).toBe(true);
    for (const o of ORDER_TEMPLATES) expect(has(`order.${o.kind}`), o.kind).toBe(true);
    for (const f of FEATS3) expect(has(`feat3.${f.id}`) && has(`feat3.${f.id}.text`), f.id).toBe(true);
    for (let n = 1; n <= PAGE_COUNT; n++) expect(has(`page.${n}.title`) && has(`page.${n}.body`), `page ${n}`).toBe(true);
    for (let s = 1; s <= 6; s++) {
      expect(has(`stratum.${s}`), `stratum ${s}`).toBe(true);
      for (const b of STRATUM_BIOMES[s]) expect(has(`biome.${b}.name`), b).toBe(true);
    }
    for (const k of ['lairs', 'guardian', 'prepare', 'gate', 'descend', 'heart', 'boss', 'free', 'return']) expect(has(`quest.step.${k}`), k).toBe(true);
    for (const k of ['tutorial', 'lairs', 'guardian', 'prepare', 'gate', 'descend', 'heart']) expect(has(`hint3.stuck.${k}`), k).toBe(true);
  });

  it('hazards, gems, the camp, the trader, the trip card and the daily descent', () => {
    for (const k of ['cold', 'gas', 'heat', 'dark']) expect(has(`hazard.${k}`) && has(`hazard.hurt.${k}`) && has(`hazard.${k}.counter`), k).toBe(true);
    for (const g of Object.keys(GEM_FX)) expect(has(`item.${g}`), g).toBe(true);
    for (const k of ['damage', 'speed', 'armour', 'health', 'ward']) expect(has(`gem3.fx.${k}`), k).toBe(true);
    for (const id of CAMP_UPGRADE_IDS) {
      expect(has(CAMP_UPGRADES[id].name) && has(CAMP_UPGRADES[id].desc), id).toBe(true);
      for (const l of CAMP_UPGRADES[id].levels) expect(has(l.does), id).toBe(true);
    }
    for (const x of TRADES) {
      expect(ITEMS[x.get.item], x.id).toBeTruthy();
      for (const i of Object.keys(x.give)) expect(ITEMS[i as keyof typeof ITEMS], `${x.id} ${i}`).toBeTruthy();
    }
    for (const r of ['depth', 'kills', 'finds', 'long']) expect(has(`trip3.rec.${r}`), r).toBe(true);
    for (let d = 20000; d < 20030; d++) {
      const x = daily(d);
      expect(x.goalText.length).toBeGreaterThan(5);
      for (const m of x.modTexts) expect(m.length).toBeGreaterThan(5);
    }
  });
});

// ---------------------------------------------------------------------------------------
// No raw key, no unfilled {placeholder}, no "undefined" in anything the loop shows.

import { EventBus, type GameEvents } from '../../src/core/events';
import { PLAYER, lanternForTier, packForTier } from '../../src/config/balance';
import { BIOME_IDS, type BiomeId, type StratumIndex } from '../../src/config/biomes';
import { B } from '../../src/config/blocks';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import { Equipment } from '../../src/gameplay/Equipment';
import { Health } from '../../src/gameplay/Health';
import { Lantern } from '../../src/gameplay/Lantern';
import { Loop, type LoopHost, type StrataLike } from '../../src/game/craft/Loop';
import { arrivalCard } from '../../src/game/quests/Guide';
import { ROSTERS } from '../../src/game/mobs/rosters';
import type { StratumLayout } from '../../src/world/gen/strata/types';
import type { ItemId } from '../../src/config/items';

const KEYISH = /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9]+)+$/;
const PLACEHOLDER = /\{[A-Za-z]+\}/;
const BAD = /\bundefined\b|\bNaN\b|\[object Object\]/;

function badText(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  if (KEYISH.test(s.trim())) return `raw key: ${s}`;
  if (PLACEHOLDER.test(s)) return `placeholder: ${s}`;
  if (BAD.test(s)) return `bad: ${s}`;
  return null;
}

/**
 * French grammar a filled-in template can break (names carry their article: "La Matriarche d’Ambre"):
 * a capitalised article after a lowercase word ("vainquez La Matriarche", "de La Racine"), or two
 * articles in a row ("vers la le Cœur"). A line that starts with the name, or puts it after ":" or "—",
 * is fine.
 */
function frenchSlip(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  if (/[a-zà-ÿ’,] (Le|La|Les|L’)\s?[A-ZÀ-Ý]/.test(s)) return `capital article mid-sentence: ${s}`;
  if (/(?<![A-Za-zÀ-ÿ’-])(la|le|les|du|des|au|aux) (?:(?:le|la|les)(?![A-Za-zÀ-ÿ’])|l’)/i.test(s)) return `two articles: ${s}`;
  return null;
}

/** Every string inside a value (objects, arrays), with its path. */
function strings(v: unknown, path = '', out: Array<[string, string]> = []): Array<[string, string]> {
  if (typeof v === 'string') out.push([path, v]);
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${path}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) strings(x, path ? `${path}.${k}` : k, out);
  return out;
}

type V3 = [number, number, number];
function layoutOf(stratum: number): StratumLayout {
  const [a, b] = STRATUM_BIOMES[stratum] as [BiomeId, BiomeId];
  const lair = (biome: BiomeId, at: V3) => ({ id: `lair_${biome}`, biome, guardian: ROSTERS[biome as keyof typeof ROSTERS].guardian, centre: at, radius: 11, spawn: at, entrance: [at[0] - 8, at[1], at[2]] as V3, revealRadius: 34 });
  return {
    stratum,
    biomes: [a, b],
    lairs: [lair(a, [60, 20, 60]), lair(b, [200, 20, 200])],
    gate: { id: `gate_${stratum}`, stratum, centre: [128, 10, 128], stand: [128, 10, 120], seal: [], shards: [a, b], shardsNeeded: 2, next: stratum < 6 ? stratum + 1 : null },
    heart: stratum === 6 ? { centre: [0, 10, 0], radius: 12, spawn: [0, 10, 0] } : null,
    pages: [1, 2, 3, 4].map((k) => ({ id: `page_${(stratum - 1) * 4 + k}`, n: (stratum - 1) * 4 + k, biome: k <= 2 ? a : b, p: [10 * k, 10, 10] as V3, prop: `page_${(stratum - 1) * 4 + k}`, revealsLair: null })),
    hazards: [{ kind: 'gas', centre: [0, 10, 0], radius: 6, strength: 0.8 }, { kind: 'falls', centre: [0, 10, 0], radius: 9, strength: 0.5 }],
    sites: [{ id: `s${stratum}a`, kind: 'setPiece', biome: a, centre: [0, 10, 0], radius: 10, name: 'x' }, { id: `s${stratum}b`, kind: 'secret', biome: b, centre: [0, 10, 0], radius: 10, name: 'secret' }],
    campSite: stratum === 1 ? { fire: [0, 10, 0], stations: [] } : null,
  } as unknown as StratumLayout;
}

class World implements StrataLike {
  current = 1;
  deepest = 1;
  layout: StratumLayout | null = layoutOf(1);
  biomeHere: BiomeId | null = 'amberHollows';
  revealedSet = new Set<string>();
  open = new Set<number>();
  constructor(private readonly bus: EventBus<GameEvents>) {}
  isRevealed(id: string): boolean {
    return this.revealedSet.has(id);
  }
  gateOpen(): boolean {
    return this.open.has(this.current);
  }
  openGate(): boolean {
    this.open.add(this.current);
    this.bus.emit('world:gateOpened', { stratum: this.current as StratumIndex });
    return true;
  }
  depth(y: number): number {
    return this.current * 90 - y;
  }
  async descend(): Promise<boolean> {
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
    this.bus.emit('world:biome', { biome: this.biomeHere, from: null, stratum: n as StratumIndex, first: true } as GameEvents['world:biome']);
  }
  addOutpost(): unknown {
    return null;
  }
}

import { language, setLanguage, t, type TextKey } from '../../src/i18n';
import { inSentence } from '../../src/game/quests/Quests';

describe('the main tracker fits one row of the 390 px HUD', () => {
  for (const lang of ['en', 'fr'] as const) it(`every step line of the chain, for every stratum, guardian and pick (${lang})`, () => {
    setLanguage(lang);
    try {
      const strata = [1, 2, 3, 4, 5, 6].map((n) => t(`stratum.${n}` as TextKey));
      const lines = [t('quest.step.tutorial'), t('quest.step.heart'), t('quest.step.boss'), t('quest.step.free')];
      // The road to the first weapon (QA 01:44).
      for (const k of ['furnace', 'placeFurnace', 'bars', 'forge', 'placeForge', 'hide', 'machete']) lines.push(t(`quest.step.${k}` as TextKey));
      for (const sn of strata) lines.push(t('quest.step.lairs', { stratum: sn }), t('quest.step.gate', { stratum: sn }), t('quest.step.return', { stratum: sn }));
      for (const next of strata.slice(1)) lines.push(t('quest.step.descend', { next }));
      for (const r of Object.values(ROSTERS)) lines.push(t('quest.step.guardian', { guardian: inSentence(t(`mob.${r.guardian}` as TextKey)) }));
      for (const pick of Object.values(NEXT_PICK)) if (pick) lines.push(t('quest.step.prepare', { pick: t(ITEMS[pick as ItemId].name) }));
      expect(lines.length).toBeGreaterThan(47);
      expect(lines.filter((line) => line.length > 34)).toEqual([]);
    } finally {
      setLanguage('en');
    }
  });
});

describe('nothing the loop shows is a raw key, an unfilled {placeholder} or "undefined"', () => {
  for (const lang of ['en', 'fr'] as const) it(`a whole expedition, scripted (${lang}): every toast, hint, card, view and line`, () => {
    setLanguage(lang);
    try {
      expedition();
    } finally {
      setLanguage('en');
    }
  });
});

function expedition(): void {
  {
    const bus = new EventBus<GameEvents>();
    const said: Array<[string, unknown]> = [];
    const emit = bus.emit.bind(bus);
    bus.emit = ((type: keyof GameEvents, payload: never) => {
      said.push([type, payload]);
      emit(type, payload);
    }) as typeof bus.emit;
    const world = new World(bus);
    const h: LoopHost & { inCamp: boolean; player: { x: number; y: number; z: number } } = {
      bus,
      backpack: new Backpack(packForTier(4).slots),
      storage: new CampStorage(),
      equipment: new Equipment(),
      health: new Health(PLAYER.maxHealth),
      lanternFuel: new Lantern(lanternForTier(1).fuelSeconds),
      inCamp: true,
      player: { x: 0, y: 10, z: 0 },
      strata: world,
      session: null,
      mobs: { companion: () => ({ level: 1 }), feedCompanion: () => true, lureLampling: () => false },
    };
    const loop = new Loop(h);
    loop.wire();
    loop.newGame(4242, true, { fungalWood: 3, coal: 2, glowcap: 2, bandage: 2 });
    const views: Array<[string, unknown]> = [];
    const snap = (tag: string) => {
      views.push([`${tag}.craft`, loop.craftView()]);
      views.push([`${tag}.bag`, loop.bagView()]);
      views.push([`${tag}.quests`, loop.quests.view()]);
      views.push([`${tag}.main`, loop.quests.main()]);
      views.push([`${tag}.side`, loop.quests.side()]);
      views.push([`${tag}.tut`, loop.quests.tutorial()]);
      views.push([`${tag}.orders`, loop.quests.orders()]);
      views.push([`${tag}.hud`, loop.hud(0)]);
      views.push([`${tag}.slots`, loop.hudSlots()]);
      for (const k of ['cold', 'gas', 'heat', 'dark'] as const) views.push([`${tag}.fix.${k}`, loop.hazardFix(k)]);
    };
    snap('start');
    // The tutorial, step by step.
    for (let i = 0; i < 3; i++) bus.emit('ui:used', { control: 'look' });
    for (let i = 0; i < 4; i++) bus.emit('ui:used', { control: 'move' });
    bus.emit('block:broken', { x: 0, y: 0, z: 0, block: B.COPPER_ORE });
    bus.emit('item:picked', { item: 'copperOre', count: 1 });
    snap('tut-craft');
    loop.craft('torch');
    snap('tut-torch');
    bus.emit('player:placed', { item: 'torch', block: B.TORCH, x: 0, y: 0, z: 0 });
    bus.emit('mob:died', { id: 1, kind: 'amberTick', pan: 0, gain: 1 } as GameEvents['mob:died']);
    bus.emit('player:sonar', { x: 0, y: 0, z: 0, radius: 24, seconds: 2 });
    for (const screen of ['inventory', 'map', 'quests'] as const) bus.emit('ui:opened', { screen });
    snap('tut-done');
    // Gear and supplies for every recipe and stat line.
    for (const id of CATALOGUE) {
      if (ITEMS[id].keyItem) continue;
      if (ITEMS[id].equip) loop.gear.grant(id);
      else h.backpack.add(id, 3);
      loop.learn(id);
      views.push([`stat.${id}`, loop.statLine(id)]);
    }
    loop.syncGear();
    for (const s of ['forge', 'furnace', 'alchemy'] as const) loop.placeStation(s, { x: 1, y: 10, z: 1 });
    snap('stocked');
    for (const r of RECIPES.slice(0, 40)) loop.craft(r.id);
    // Each stratum: its biomes, hazards, blows, guardians, pages, the gate.
    h.inCamp = false;
    bus.emit('camp:left', {});
    for (let n = 1; n <= 6; n++) {
      if (n > 1) world.enter(n);
      for (const b of STRATUM_BIOMES[n]) {
        world.biomeHere = b as BiomeId;
        bus.emit('world:biome', { biome: b as BiomeId, from: null, stratum: n as StratumIndex, first: true } as GameEvents['world:biome']);
        for (let i = 0; i < 30; i++) loop.update(1);
        for (const element of ['frost', 'fire', 'acid', 'spore', 'void', 'shock'] as const) bus.emit('mob:attack', { id: 9, kind: 'crawler', damage: 1, landed: true, element } as GameEvents['mob:attack']);
        bus.emit('world:site', { id: `s${n}${b}`, kind: 'setPiece', name: 'x', biome: b as BiomeId, stratum: n as StratumIndex });
        bus.emit('mob:guardianDefeated', { id: 2, kind: ROSTERS[b as keyof typeof ROSTERS].guardian, biome: b, shard: b, x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);
        h.health.heal(1000);
      }
      bus.emit('world:note', { id: `page_${(n - 1) * 4 + 1}` } as GameEvents['world:note']);
      snap(`s${n}`);
      if (n < 6) {
        loop.quests.useGate();
        loop.quests.useGate();
      }
    }
    for (let i = 0; i < 5; i++) loop.update(1);
    snap('heart');
    bus.emit('mob:guardianDefeated', { id: 3, kind: 'heartOfDark', biome: 'heart', shard: 'heart', x: 0, y: 0, z: 0 } as GameEvents['mob:guardianDefeated']);
    snap('free');
    views.push(['ending', loop.endingView(7200)]);
    // Home: the orders, the garden, the trader, the trip card.
    h.inCamp = true;
    world.enter(1);
    bus.emit('camp:entered', {});
    loop.update(0.1);
    views.push(['trip', loop.lastTrip()]);
    for (const c of loop.craftView().cards.filter((x) => x.category === 'camp' || x.category === 'trader')) loop.craft(c.id);
    snap('home');
    for (const b of BIOME_IDS) views.push([`arrival.${b}`, arrivalCard(b, true)]);
    for (let d = 20400; d < 20410; d++) views.push([`daily.${d}`, daily(d)]);
    loop.use('glowTreat' as ItemId);
    loop.use('lamplingLure' as ItemId);
    // Collect: every view's strings and everything said on the bus.
    const problems: string[] = [];
    const fr = language() === 'fr';
    for (const [tag, v] of views) for (const [path, s] of strings(v)) {
      const slip = fr ? frenchSlip(s) : null;
      if (slip) problems.push(`${tag}.${path}: ${slip}`);
      const bad = badText(s);
      if (bad && !/(^|\.)(id|item|category|station|kind|recipe|gem|biome|slot|state|grade|highlight|target|goal|mods)$/.test(path) && !/\.(slots|equipped|shards|biomes|mods)\[/.test(path)) problems.push(`${tag}.${path}: ${bad}`);
    }
    for (const [type, p] of said) {
      if (!['toast', 'guide:hint', 'quest:step', 'quest:done', 'order:paid', 'bestiary:reward', 'tutorial:step', 'trip:summary', 'guide:arrival'].includes(type)) continue;
      for (const [path, s] of strings(p)) {
        const slip = fr ? frenchSlip(s) : null;
        if (slip) problems.push(`${type}.${path}: ${slip}`);
        const bad = badText(s);
        if (bad && !/(^|\.)(id|biome|kind|highlight|target|item|rarest|outcome)$/.test(path) && !/\.(biomes|shards|records)\[/.test(path)) problems.push(`${type}.${path}: ${bad}`);
      }
    }
    // Every main tracker line the expedition showed fits one row of the 390 px HUD (QA 21:01), in
    // either language: the HUD draws its count apart, so the line itself stays at 34 characters.
    const steps = said.filter(([t]) => t === 'quest:step').map(([, p]) => (p as { text: string }).text);
    expect(new Set(steps).size).toBeGreaterThan(10);
    expect(steps.filter((line) => line.length > 34)).toEqual([]);
    expect(said.filter(([t]) => t === 'toast').length).toBeGreaterThan(40);
    expect(problems.slice(0, 40)).toEqual([]);
    // The checker itself catches what it is for, and it read a lot of text.
    expect(badText('craft3.missing')).not.toBeNull();
    expect(badText('Missing {items}')).not.toBeNull();
    expect(badText('3 undefined')).not.toBeNull();
    expect(badText('Missing 2 Coal')).toBeNull();
    expect(frenchSlip('Vainquez La Matriarche d’Ambre')).not.toBeNull();
    expect(frenchSlip('Descendez vers la le Cœur')).not.toBeNull();
    expect(frenchSlip('Victoire ! La Matriarche d’Ambre tombe.')).toBeNull();
    expect(frenchSlip('Éloignez-vous de la lave ; elle brûle la gorge.')).toBeNull();
    const total = views.reduce((a, [, v]) => a + strings(v).length, 0);
    expect(total).toBeGreaterThan(3000);
  }
}
