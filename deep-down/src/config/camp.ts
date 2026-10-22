import type { TextKey } from '../i18n';
import type { ItemId } from './items';

/**
 * The camp grows (round 3, LOOP; BRIEF §6): upgrades built at the camp's Workbench that change
 * the camp you see (tents, lamps, a forge chimney, a trophy wall of the guardians' heads, a mushroom
 * garden) and give the expedition a lasting bonus; and the trader who comes to the camp with
 * barters and a few rare recipes. Both show in the Crafting menu at camp (the 'camp' and 'trader'
 * tabs: their cards read like recipes).
 */

export type CampUpgradeId = 'tents' | 'lamps' | 'chimney' | 'trophies' | 'garden';
export const CAMP_UPGRADE_IDS: readonly CampUpgradeId[] = ['tents', 'lamps', 'chimney', 'trophies', 'garden'];

/** A prop the upgrade adds to the camp, placed relative to the camp fire (metres). */
export interface CampPropDef {
  /** The model VIS draws (falls back to `fallback` until it is modelled). */
  kind: string;
  fallback: string;
  dx: number;
  dz: number;
  rotY: number;
  scale?: number;
}

export interface CampLevelDef {
  cost: Partial<Record<ItemId, number>>;
  /** The deepest stratum entered before this level shows. */
  stratum: number;
  /** What it does, one line (shown on the card). */
  does: TextKey;
  props: readonly CampPropDef[];
}

export interface CampUpgradeDef {
  id: CampUpgradeId;
  name: TextKey;
  desc: TextKey;
  /** The card's icon (an item of the same look). */
  icon: ItemId;
  levels: readonly CampLevelDef[];
}

/** The bonuses (read by game/craft/Camp). */
export const CAMP_BONUS = {
  /** Tents: extra max health per level. */
  tentHealth: [0, 10, 25],
  /** Lamps: the camp's orders pay this much more per level. */
  lampOrders: [0, 0.5, 1],
  /** Chimney: Furnace fuel at the camp is multiplied by this. */
  chimneyFuel: 0.5,
  /** Trophy wall: weapon damage per guardian trophy hung. */
  trophyDamage: 0.02,
  /** Garden: what each return to camp gathers in the bank, per level. */
  garden: [{}, { glowcap: 4, fungalWood: 2 }, { glowcap: 6, fungalWood: 3, roastCap: 2, sporeQuartz: 1 }] as ReadonlyArray<Partial<Record<ItemId, number>>>,
} as const;

export const CAMP_UPGRADES: Record<CampUpgradeId, CampUpgradeDef> = {
  tents: {
    id: 'tents',
    name: 'camp3.tents',
    desc: 'camp3.tents.desc',
    icon: 'outpostKit',
    levels: [
      { cost: { plank: 12, hide: 3, rope: 2 }, stratum: 1, does: 'camp3.tents.1', props: [{ kind: 'campTent', fallback: 'outpost', dx: 8.5, dz: 6, rotY: -2.2 }] },
      { cost: { plank: 16, frostFur: 4, silverIngot: 2 }, stratum: 4, does: 'camp3.tents.2', props: [{ kind: 'campTent', fallback: 'outpost', dx: -8.5, dz: 6.5, rotY: 2.3 }] },
    ],
  },
  lamps: {
    id: 'lamps',
    name: 'camp3.lamps',
    desc: 'camp3.lamps.desc',
    icon: 'torch',
    levels: [
      {
        cost: { copperIngot: 4, glass: 4, amber: 2 },
        stratum: 1,
        does: 'camp3.lamps.1',
        props: [
          { kind: 'lanternPost', fallback: 'lanternPost', dx: 9, dz: -7, rotY: 0 },
          { kind: 'lanternPost', fallback: 'lanternPost', dx: -9, dz: -7, rotY: 0 },
          { kind: 'lanternPost', fallback: 'lanternPost', dx: 0, dz: 9, rotY: 0 },
        ],
      },
      {
        cost: { goldIngot: 2, glass: 6, sapAmber: 2 },
        stratum: 4,
        does: 'camp3.lamps.2',
        props: [
          { kind: 'lairBrazier', fallback: 'lanternPost', dx: 4.5, dz: 8.5, rotY: 0 },
          { kind: 'lairBrazier', fallback: 'lanternPost', dx: -4.5, dz: 8.5, rotY: 0 },
        ],
      },
    ],
  },
  chimney: {
    id: 'chimney',
    name: 'camp3.chimney',
    desc: 'camp3.chimney.desc',
    icon: 'brick',
    levels: [{ cost: { brick: 16, ironIngot: 4, coal: 6 }, stratum: 2, does: 'camp3.chimney.1', props: [{ kind: 'campChimney', fallback: 'basaltColumn', dx: 7.5, dz: -3, rotY: 0 }] }],
  },
  trophies: {
    id: 'trophies',
    name: 'camp3.trophies',
    desc: 'camp3.trophies.desc',
    icon: 'heartShard',
    levels: [{ cost: { plank: 10, ironIngot: 2, rope: 2 }, stratum: 2, does: 'camp3.trophies.1', props: [{ kind: 'trophyWall', fallback: 'lairPillar', dx: 0, dz: -9, rotY: 0 }] }],
  },
  garden: {
    id: 'garden',
    name: 'camp3.garden',
    desc: 'camp3.garden.desc',
    icon: 'glowcap',
    levels: [
      {
        cost: { fungalWood: 8, glowcap: 8, sporeQuartz: 1 },
        stratum: 1,
        does: 'camp3.garden.1',
        props: [
          { kind: 'mushroomCluster', fallback: 'mushroomCluster', dx: -9.5, dz: 2.5, rotY: 0.4 },
          { kind: 'mushroomSmall', fallback: 'mushroomSmall', dx: -8.5, dz: 4.5, rotY: 1.2 },
        ],
      },
      {
        cost: { heartwood: 3, glowvine: 6, pearl: 1 },
        stratum: 4,
        does: 'camp3.garden.2',
        props: [
          { kind: 'mushroomCluster', fallback: 'mushroomCluster', dx: -10.5, dz: 0.5, rotY: 2.1 },
          { kind: 'glowBulb', fallback: 'mushroomSmall', dx: -9.5, dz: -1.5, rotY: 0 },
        ],
      },
    ],
  },
};

/** Where the guardians' trophies hang (relative to the camp fire): along the wall, by shard order. */
export const TROPHY_SPOTS: ReadonlyArray<readonly [number, number]> = [
  [-4.5, -8.6], [-3.7, -8.6], [-2.9, -8.6], [-2.1, -8.6], [-1.3, -8.6], [-0.5, -8.6],
  [0.5, -8.6], [1.3, -8.6], [2.1, -8.6], [2.9, -8.6], [3.7, -8.6], [4.5, -8.6],
];

// -------------------------------------------------------------------------------------
// The trader

/** One barter: give `give`, get `get` (a craft card in the trader tab). */
export interface TradeDef {
  id: string;
  give: Partial<Record<ItemId, number>>;
  get: { item: ItemId; count: number };
  /** The deepest stratum entered before the trader offers it. */
  stratum: number;
  /** A rare recipe: bought once, it unlocks `recipe` for good (the card shows the recipe's output). */
  recipe?: string;
}

/** The barters the trader draws from (5 at a time, renewed on each return to camp). */
export const TRADES: readonly TradeDef[] = [
  { id: 'coal', give: { stone: 10 }, get: { item: 'coal', count: 3 }, stratum: 1 },
  { id: 'torches', give: { coal: 2, fungalWood: 2 }, get: { item: 'torch', count: 10 }, stratum: 1 },
  { id: 'bandages', give: { glowcap: 5 }, get: { item: 'bandage', count: 3 }, stratum: 1 },
  { id: 'hide', give: { copperOre: 8 }, get: { item: 'hide', count: 2 }, stratum: 1 },
  { id: 'oil', give: { amber: 2 }, get: { item: 'oilFlask', count: 2 }, stratum: 1 },
  { id: 'flash', give: { sporeQuartz: 1, coal: 1 }, get: { item: 'flashCharge', count: 3 }, stratum: 1 },
  { id: 'iron', give: { copperIngot: 4 }, get: { item: 'ironIngot', count: 2 }, stratum: 2 },
  { id: 'rope', give: { rootFibre: 6 }, get: { item: 'rope', count: 4 }, stratum: 2 },
  { id: 'gold', give: { pearl: 2 }, get: { item: 'goldIngot', count: 1 }, stratum: 2 },
  { id: 'draught', give: { gel: 3, glowcap: 3 }, get: { item: 'healingDraught', count: 1 }, stratum: 2 },
  { id: 'bombs', give: { coal: 4, gel: 2 }, get: { item: 'blastBomb', count: 3 }, stratum: 3 },
  { id: 'silver', give: { haldenScrap: 6 }, get: { item: 'silverIngot', count: 2 }, stratum: 3 },
  { id: 'glimmer', give: { echoShard: 2 }, get: { item: 'glimmerShard', count: 3 }, stratum: 3 },
  { id: 'tonic', give: { coal: 3, glowcap: 3 }, get: { item: 'warmingTonic', count: 2 }, stratum: 4 },
  { id: 'fur', give: { hide: 3, chitin: 2 }, get: { item: 'frostFur', count: 2 }, stratum: 4 },
  { id: 'coldsteel', give: { rimeIron: 3, silverIngot: 1 }, get: { item: 'coldsteelIngot', count: 2 }, stratum: 4 },
  { id: 'antidote', give: { glowvine: 3, gel: 1 }, get: { item: 'antidote', count: 2 }, stratum: 5 },
  { id: 'sunmetal', give: { runegold: 3, goldIngot: 1 }, get: { item: 'sunmetalIngot', count: 2 }, stratum: 5 },
  { id: 'cooling', give: { frostCrystal: 1, gel: 2 }, get: { item: 'coolingDraught', count: 2 }, stratum: 6 },
  { id: 'embersteel', give: { emberite: 3, coldsteelIngot: 1 }, get: { item: 'embersteelIngot', count: 2 }, stratum: 6 },
  // Rare recipes (once each).
  { id: 'lure', give: { amber: 3, glowcap: 6 }, get: { item: 'lamplingLure', count: 1 }, stratum: 1, recipe: 'lamplingLure' },
  { id: 'treats', give: { glowcap: 4, sporeQuartz: 1 }, get: { item: 'glowTreat', count: 3 }, stratum: 1, recipe: 'glowTreat' },
  { id: 'stew', give: { glowcap: 6, hide: 2, pearl: 1 }, get: { item: 'deepStew', count: 2 }, stratum: 2, recipe: 'deepStew' },
  // Gem cutting: the Forge learns to set gems in weapons and armour (game/craft Sockets).
  { id: 'gemcutter', give: { gem: 2, silverIngot: 2 }, get: { item: 'gem', count: 1 }, stratum: 3, recipe: 'sockets' },
];

/** Barters on offer at once (rare recipes come on top, one at a time, until all are bought). */
export const TRADER_SLOTS = 5;
