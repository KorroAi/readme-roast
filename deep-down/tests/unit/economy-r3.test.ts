import { beforeAll, describe, expect, it } from 'vitest';
import { measureStrata } from '../../src/game/craft/supply';
import { DESCENT_PLAN, PACE, billOf, simulateDescent, type DescentReport, type StratumSupply } from '../../src/game/craft/economy';
import { ITEMS, type ItemId } from '../../src/config/items';
import { NEXT_PICK } from '../../src/config/quests';
import { recipesFor } from '../../src/config/recipes';

/**
 * The economy and quest simulation (BRIEF §3, LOOP's proof): a new explorer descends the six strata
 * of real generated expeditions (WORLD's generator: sight-minable ore blocks, chests, MOBS'
 * rosters and guardians) following the descent plan with the recipes as written, and reaches the
 * Heart; each stratum takes about 15–25 minutes (the first one also holds the 5-minute tutorial).
 */
const SEEDS = [12345, 777];
const runs = new Map<number, { supplies: StratumSupply[]; report: DescentReport }>();

beforeAll(() => {
  for (const seed of SEEDS) {
    const supplies = measureStrata(seed);
    runs.set(seed, { supplies, report: simulateDescent(supplies) });
  }
}, 240_000);

const fmt = (n: number) => n.toFixed(1).padStart(5);

describe('the economy and quest simulation (round 3)', () => {
  it('reaches the Heart with the recipes as written, on two expeditions', () => {
    for (const seed of SEEDS) {
      const { report } = runs.get(seed)!;
      const lines = report.strata.map(
        (r) => `S${r.stratum} walk ${Math.round(r.phi * 100)} %  ${fmt(r.minutes)} min (walk ${fmt(r.parts.walk)}, mine ${fmt(r.parts.mine)}, fights ${fmt(r.parts.fight)}, chests ${fmt(r.parts.chests)}, guardians ${fmt(r.parts.guardians)}, stations ${fmt(r.parts.overhead)})  dps ${r.dps.toFixed(1)}  pick ${r.pickTier}`,
      );
      console.log([`seed ${seed}: ${report.totalMinutes.toFixed(0)} min to the Heart`, ...lines].join('\n'));
      expect(report.feasible, `seed ${seed}: ${JSON.stringify(report.strata.map((r) => r.short))}`).toBe(true);
      expect(report.strata.map((r) => r.stratum)).toEqual([1, 2, 3, 4, 5, 6]);
      // The gate of each stratum asks for the next pick: it is made in that stratum.
      for (const r of report.strata) if (NEXT_PICK[r.stratum]) expect(r.made, `S${r.stratum}`).toContain(NEXT_PICK[r.stratum] as ItemId);
      // The hazards' armour is made before its stratum's guardians.
      expect(report.strata[3].made).toEqual(expect.arrayContaining(['furHood', 'furCoat', 'furBoots', 'warmingTonic']));
      expect(report.strata[4].made).toEqual(expect.arrayContaining(['bogMask', 'bogCoat', 'bogBoots', 'antidote']));
      expect(report.strata[5].made).toEqual(expect.arrayContaining(['emberHelm', 'emberPlate', 'emberGreaves', 'coolingDraught']));
    }
  });

  it('paces each stratum at about 15–25 minutes (the first with its tutorial), and the weapons keep up with the guardians', () => {
    for (const seed of SEEDS) {
      const { report } = runs.get(seed)!;
      for (const r of report.strata) {
        const play = r.minutes - (r.stratum === 1 ? PACE.tutorialSeconds / 60 : 0);
        expect(play, `seed ${seed} S${r.stratum}`).toBeGreaterThanOrEqual(14);
        expect(play, `seed ${seed} S${r.stratum}`).toBeLessThanOrEqual(27);
        // A guardian fight takes a few minutes at most with the band's weapon.
        expect(r.parts.guardians, `seed ${seed} S${r.stratum}`).toBeLessThan(5);
      }
      expect(report.totalMinutes).toBeLessThan(180);
      expect(report.strata.map((r) => r.dps)).toEqual([...report.strata.map((r) => r.dps)].sort((a, b) => a - b));
    }
  });

  it('every stratum gives what its own plan needs: no stratum lives on a bank it cannot fill', () => {
    for (const seed of SEEDS) {
      const { supplies } = runs.get(seed)!;
      for (const s of supplies) {
        expect(s.ores.length, `seed ${seed} S${s.stratum}`).toBeGreaterThan(3);
        expect(s.chests.length, `seed ${seed} S${s.stratum}`).toBeGreaterThan(40);
        expect(s.guardians, `seed ${seed} S${s.stratum}`).toHaveLength(2);
      }
    }
  });

  it('the bill: intermediates expand into raw materials and fuel; the bank pays first', () => {
    const all = () => true;
    const b = billOf([['copperPick', 1]], {}, all);
    expect(b.raw).toEqual({ copperOre: 10, fungalWood: 3 });
    expect(b.fuel).toBe(5);
    const banked = billOf([['copperPick', 1]], { copperIngot: 3 }, all);
    expect(banked.raw).toEqual({ copperOre: 4, fungalWood: 3 });
    expect(banked.spent).toEqual({ copperIngot: 3 });
    // Every item in the plan can be made.
    for (const step of DESCENT_PLAN) for (const [item] of [...step.make, ...(step.extra ?? [])]) expect(recipesFor(item).length, `${item}`).toBeGreaterThan(0);
    for (const step of DESCENT_PLAN) for (const [item] of step.make) expect(ITEMS[item], item).toBeTruthy();
  });
});
