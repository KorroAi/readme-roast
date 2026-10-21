// Health as pixel hearts. Pure, unit tested in Node.

export const HEART_COUNT = 5;

/** 0 = empty, 1 = half, 2 = full. */
export type HeartFill = 0 | 1 | 2;

/**
 * Health in half-heart units (0..2 * HEART_COUNT). Rounded to the nearest half heart, but a
 * living player always shows at least half a heart and only full health shows all hearts.
 */
export function healthHalves(health: number, max: number): number {
  const total = HEART_COUNT * 2;
  if (!(max > 0) || !(health > 0)) return 0;
  if (health >= max) return total;
  return Math.max(1, Math.min(total - 1, Math.round((health / max) * total)));
}

/** Fill state of heart `i` (0-based, left to right) for a half-heart total. */
export function heartFill(halves: number, i: number): HeartFill {
  const v = halves - i * 2;
  return v >= 2 ? 2 : v === 1 ? 1 : 0;
}
