import { describe, expect, it } from 'vitest';
import { en } from '../../src/i18n/en';
import { CATALOGUE, ITEMS } from '../../src/config/items';
import { FEATS3, ORDER_TEMPLATES, TUTORIAL, PAGE_COUNT, STRATUM_BIOMES } from '../../src/config/quests';
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
