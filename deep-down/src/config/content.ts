/**
 * Tunables of the content pass (finished game): the lantern gamble, the feats' pacing, the hints
 * for when the player is stuck. World placement tables live with their generators
 * (world/gen/content.ts, world/gen/features/deep.ts).
 */
export const CONTENT = {
  /** Seconds of flame a Lantern Ember (broken lanternstone) adds, up to a full lantern. */
  emberSeconds: 30,
  /** Seconds between two feat toasts (they queue, never stack). */
  featToastGap: 3.6,
  /** The same objective for this long without progress, away from danger: a hint (s). */
  stuckSeconds: 75,
  /** ...and again after this long (s); at most this many times per objective. */
  stuckRepeatSeconds: 120,
  stuckMaxHints: 3,
  /** Walking less than this far (m) over stuckSeconds also counts as stuck. */
  stuckIdleMetres: 4,
} as const;
