// Facets (SPEC §5.10): a hand of three at every seal or charted gate from the second of a run; keep one for the run.
// Six tags unlock with the biomes; set bonuses at 2, 4 and 6 of a tag; duos (gold frame) only when two tags each have
// ≥ 2 facets (12 % an offer slot). Rarity: Common 70 % (×1), Rare 25 % (×1.5), Relic 5 % (×2.5). No duplicate in a hand.
// i18n `idle.facet.<id>` (name) and `idle.facet.<id>.desc` ({v} the value at the card's rarity); tags `idle.tag.<tag>`.
// Every effect is read by the system it changes through model/facets.ts `facetStats()`.

export type FacetTag = 'spark' | 'quake' | 'greed' | 'crew' | 'rhythm' | 'fortune';

export interface FacetDef {
  id: string;
  tag: FacetTag | 'duo';
  /** For duos: the two tags required (≥ 2 facets each). */
  duo?: readonly [FacetTag, FacetTag];
  /** The effect's stat and its common value (scaled by the rarity's value multiplier). */
  stat: FacetStat;
  value: number;
}

/** What a facet changes (summed per stat over the run's facets). */
export type FacetStat =
  | 'critPts' | 'critSplash' | 'staticEvery' | 'critMultAdd' // Spark
  | 'shockAdd' | 'aftershock' | 'faultEvery' | 'chargeEvery' // Quake
  | 'goldAdd' | 'veinX' | 'oreGoldX' | 'chestEvery' // Greed
  | 'crewAdd' | 'edgePts' | 'newestX' | 'unionPer' // Crew
  | 'comboWindow' | 'comboCap' | 'surgeSecs' | 'drumPer' // Rhythm
  | 'chestStepPts' | 'rareX' | 'findX' | 'doubleChest' // Fortune
  | 'critBlast' | 'critGoldX' | 'goldenX' | 'workSong' | 'crewChest' | 'rollingThunder'; // duos

export const FACET_TAGS: readonly FacetTag[] = ['spark', 'quake', 'greed', 'crew', 'rhythm', 'fortune'];

/** Depth (rows reached in the run) at which each tag joins the offers. */
export const TAG_UNLOCK: Readonly<Record<FacetTag, number>> = { spark: 120, quake: 120, greed: 240, crew: 400, rhythm: 600, fortune: 900 };

export const FACETS: readonly FacetDef[] = [
  { id: 'hotEdge', tag: 'spark', stat: 'critPts', value: 0.04 },
  { id: 'splitSpark', tag: 'spark', stat: 'critSplash', value: 0.5 },
  { id: 'static', tag: 'spark', stat: 'staticEvery', value: 10 },
  { id: 'overcharge', tag: 'spark', stat: 'critMultAdd', value: 2 },
  { id: 'wideSwing', tag: 'quake', stat: 'shockAdd', value: 0.25 },
  { id: 'aftershock', tag: 'quake', stat: 'aftershock', value: 0.2 },
  { id: 'faultLine', tag: 'quake', stat: 'faultEvery', value: 8 },
  { id: 'chargePack', tag: 'quake', stat: 'chargeEvery', value: 25 },
  { id: 'gildedEdge', tag: 'greed', stat: 'goldAdd', value: 0.3 },
  { id: 'midas', tag: 'greed', stat: 'veinX', value: 2 },
  { id: 'assay', tag: 'greed', stat: 'oreGoldX', value: 2 },
  { id: 'treasureNose', tag: 'greed', stat: 'chestEvery', value: 17 },
  { id: 'whistle', tag: 'crew', stat: 'crewAdd', value: 0.4 },
  { id: 'sharedPick', tag: 'crew', stat: 'edgePts', value: 0.04 },
  { id: 'apprentice', tag: 'crew', stat: 'newestX', value: 3 },
  { id: 'union', tag: 'crew', stat: 'unionPer', value: 0.05 },
  { id: 'tempo', tag: 'rhythm', stat: 'comboWindow', value: 0.3 },
  { id: 'crescendo', tag: 'rhythm', stat: 'comboCap', value: 25 },
  { id: 'battery', tag: 'rhythm', stat: 'surgeSecs', value: 3 },
  { id: 'drumline', tag: 'rhythm', stat: 'drumPer', value: 1 },
  { id: 'fourLeaf', tag: 'fortune', stat: 'chestStepPts', value: 0.05 },
  { id: 'geodeSense', tag: 'fortune', stat: 'rareX', value: 2 },
  { id: 'luckyFind', tag: 'fortune', stat: 'findX', value: 1.5 },
  { id: 'secondLook', tag: 'fortune', stat: 'doubleChest', value: 0.1 },
  { id: 'thunderclap', tag: 'duo', duo: ['spark', 'quake'], stat: 'critBlast', value: 0.5 },
  { id: 'payday', tag: 'duo', duo: ['spark', 'greed'], stat: 'critGoldX', value: 4 },
  { id: 'goldenHour', tag: 'duo', duo: ['greed', 'fortune'], stat: 'goldenX', value: 3 },
  { id: 'workSong', tag: 'duo', duo: ['crew', 'rhythm'], stat: 'workSong', value: 0.5 },
  { id: 'foremansLuck', tag: 'duo', duo: ['crew', 'fortune'], stat: 'crewChest', value: 40 },
  { id: 'rollingThunder', tag: 'duo', duo: ['quake', 'rhythm'], stat: 'rollingThunder', value: 10 },
];

/** Rarity odds and value multipliers. */
export const RARITY = [
  { id: 'common', p: 0.7, x: 1 },
  { id: 'rare', p: 0.25, x: 1.5 },
  { id: 'relic', p: 0.05, x: 2.5 },
] as const;

/** A duo replaces an offer slot with this chance when eligible. */
export const DUO_CHANCE = 0.12;
/** Rerolls: one free a run, then 10 gems. Auto-pick takes the highlighted card after 6 s (250 Embers). */
export const REROLL_GEMS = 10;
export const AUTO_PICK_S = 6;

/**
 * Set bonuses at 2, 4 and 6 facets of a tag (SPEC §5.10's table), as stat adds on top of the facets themselves.
 * `x` values multiply (crew ×3, gold ×3); `add` values add to the stat.
 */
export const SETS: Readonly<Record<FacetTag, ReadonlyArray<{ at: number; stat: string; v: number }>>> = {
  spark: [{ at: 2, stat: 'critPts', v: 0.05 }, { at: 4, stat: 'critChain', v: 2 }, { at: 6, stat: 'megaCrit', v: 0.1 }],
  quake: [{ at: 2, stat: 'areaX', v: 1.5 }, { at: 4, stat: 'blastRadius', v: 1 }, { at: 6, stat: 'rowBlast', v: 0.3 }],
  greed: [{ at: 2, stat: 'goldAdd', v: 0.5 }, { at: 4, stat: 'goldenEvery', v: 50 }, { at: 6, stat: 'goldX', v: 3 }],
  crew: [{ at: 2, stat: 'crewAdd', v: 0.6 }, { at: 4, stat: 'crewTwoCells', v: 1 }, { at: 6, stat: 'crewX', v: 3 }],
  rhythm: [{ at: 2, stat: 'comboBuild', v: 2 }, { at: 4, stat: 'surgeX', v: 4 }, { at: 6, stat: 'comboFloor', v: 25 }],
  fortune: [{ at: 2, stat: 'rareX', v: 1.5 }, { at: 4, stat: 'chestFloorUp', v: 1 }, { at: 6, stat: 'tenthReliquary', v: 1 }],
};

export function facetDef(id: string): FacetDef | undefined {
  return FACETS.find((f) => f.id === id);
}
