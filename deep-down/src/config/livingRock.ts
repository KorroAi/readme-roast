import { B } from './blocks';

/**
 * The living rock: how much ore each living wall grows per expedition (exact counts; the rest of
 * the site stays host rock). world/gen/features/living.ts deals these out over the site's cells.
 * Other streams may append rows (for example a deep ore on the rift walls); counts per site must
 * stay within 38 % of its cells so one expedition's veins never land where the last one's were.
 */
export const LIVING_TABLES: Record<'haldenFace' | 'riftWalls' | 'emberWalls', Array<{ block: number; count: number }>> = {
  /** The Halden Face (the adit off the yard): the copper that "grew back by Friday". */
  haldenFace: [
    { block: B.COPPER_ORE, count: 10 },
    { block: B.IRON_ORE, count: 6 },
  ],
  /** The rift walls round the black stone. */
  riftWalls: [
    { block: B.IRON_ORE, count: 12 },
    { block: B.COPPER_ORE, count: 4 },
    { block: B.CRYSTAL, count: 2 },
  ],
  /** The Ember Deep's walls (content, finished game): iron, and lanternstone to feed the lantern. */
  emberWalls: [
    { block: B.IRON_ORE, count: 8 },
    { block: B.LANTERNSTONE, count: 4 },
    { block: B.COPPER_ORE, count: 2 },
  ],
};

/** The glimmer bloom: one cluster per expedition at a new site. */
export const BLOOM = {
  glimmerMin: 2,
  glimmerMax: 3,
  hardness: 2.5,
  scale: 1.35,
  /** Moths gathered over it. */
  moths: 8,
} as const;

/** The epoch (expedition counter) only advances after a trip that went below this height (the Hollow). */
export const BREATHE_BELOW_Y = 80;
