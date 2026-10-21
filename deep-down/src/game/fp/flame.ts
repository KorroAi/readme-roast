/**
 * The lantern's flicker, shared by the flame drawn in the hand (fp/Viewmodel) and the light it
 * casts on the world (Game.updateLantern), so the two always breathe together.
 *
 * Calm: a slow breath and a small fast shiver (about +-4 %), a little livelier when the oil runs
 * low (the low-fuel sputter, +-8 %). Deterministic in `time` so captures and tests repeat.
 */
export function lanternFlicker(time: number, oil: number, lowFraction = 0.25): number {
  const calm = Math.sin(time * 13.1) * 0.022 + Math.sin(time * 7.3 + 1.2) * 0.03 + Math.sin(time * 2.1 + 0.4) * 0.012;
  const low = oil < lowFraction ? (1 - oil / lowFraction) * (Math.sin(time * 31) * 0.05 + Math.sin(time * 17.7 + 2.0) * 0.03) : 0;
  return 1 + calm + low;
}

/**
 * How big the flame stands on the wick for the oil left (0..1): full at a full fount, shrinking as it
 * drains, a small ember when the lantern is out.
 */
export function flameSize(oil: number, lit: boolean): number {
  if (!lit) return 0.2;
  return 0.42 + 0.58 * Math.sqrt(Math.max(0, Math.min(1, oil)));
}
