// The cell mix (SPEC §5.3): what a row is made of, per biome. Every biome's table has an expected gold
// multiplier of 1.00 (E13): biomes differ in what appears, never in average value. Ore ids per biome are
// in biomes.ts. Row content is a pure function of (runSeed, depth) so the world (B's slab pass 4) and the
// model agree cell for cell: `src/idle/model/shaft.ts` `rowKinds()`.

import { CELL, type CellKind, CELL_KIND_COUNT } from '../model/state';
import { GOLD_PER_HP } from './curves';

/** HP × of the soil rows 1–19 (a calibration knob: the first 20 m take 2–4 taps a cell). */
export const SOIL_HP = 2;
/** Rows of soil under the surface row. */
export const SOIL_ROWS = 20;
/** Gold × of a soil cell (rock pays 0.6; the soil a little more, for the tutorial's first purchases). */
export const SOIL_GOLD = 0.8;

export interface CellKindDef {
  kind: CellKind;
  /** Gold × (on the average cell's HP / 100 × GOLD_PER_HP). */
  gold: number;
  /** HP × on the row's HP. */
  hp: number;
  /** Gems on break. */
  gems: number;
}

/**
 * Per-kind values. Rock pays 0.6 so the mix averages 1.00 with ore, rich and rare cells; the topsoil row
 * pays exactly 1 gold a cell (gold mult chosen against GOLD_PER_HP at HP 100).
 */
export const KINDS: readonly CellKindDef[] = (() => {
  const t: CellKindDef[] = [];
  for (let k = 0; k < CELL_KIND_COUNT; k++) t.push({ kind: k as CellKind, gold: 0, hp: 1, gems: 0 });
  const set = (k: CellKind, gold: number, hp: number, gems = 0) => (t[k] = { kind: k, gold, hp, gems });
  set(CELL.AIR, 0, 0);
  set(CELL.ROCK, 0.6, 1);
  set(CELL.ORE, 2.5, 1);
  set(CELL.RICH, 4, 1.5);
  set(CELL.GEM, 8, 2, 1);
  set(CELL.FOSSIL, 8, 2);
  set(CELL.GEODE, 8, 2);
  set(CELL.CHEST, 0, 3);
  set(CELL.GOLDEN, 20, 1);
  set(CELL.GATE, 1, 3);
  set(CELL.BOULDER, 3, 3);
  set(CELL.SEAL, 0, 0);
  // Exactly 1 gold at HP 100 (row 0); the soil below pays HP / 100 a cell and takes twice the hits.
  set(CELL.TOPSOIL, 1 / (100 * GOLD_PER_HP), 1);
  set(CELL.SOIL, SOIL_GOLD, SOIL_HP);
  return t;
})();

/** Shares of the random row mix (SPEC §5.3): rock 84 %, ore 10 %, rich 4 %, rare 1 % (+ the rest rock). */
export interface CellMix {
  ore: number;
  rich: number;
  /** gem, fossil, geode split of the 1 % rare share. */
  gem: number;
  fossil: number;
  geode: number;
  /** Rock's gold so the mix averages 1.00 (solved, not authored). */
  rockGold: number;
}

/** The default mix; per-biome tables (and the Rich mutator) can change the shares, rockGold is re-solved. */
export function mixFor(_biome: number, oreScale = 1): CellMix {
  const ore = 0.1 * oreScale;
  const rich = 0.04 * oreScale;
  // Rare: gems everywhere; fossils from the Fossil Halls up; geodes from the Crystal Grotto on (W2 events).
  const gem = 0.004;
  const fossil = 0.003;
  const geode = 0.003;
  const rare = gem + fossil + geode;
  const rock = 1 - ore - rich - rare;
  // E[gold] = rock·rg + ore·2.5 + rich·4 + rare·8 = 1 → rg
  const rockGold = (1 - ore * 2.5 - rich * 4 - rare * 8) / rock;
  return { ore, rich, gem, fossil, geode, rockGold };
}

/** Chest cells: one every 25 rows on the centre column (SPEC §5.3; Chest Weave and Treasure Nose lower it). */
export const CHEST_EVERY = 25;

/** Expected gold multiplier of a mix (E13). */
export function expectedGold(m: CellMix): number {
  const rare = m.gem + m.fossil + m.geode;
  return (1 - m.ore - m.rich - rare) * m.rockGold + m.ore * KINDS[CELL.ORE].gold + m.rich * KINDS[CELL.RICH].gold + rare * 8;
}
