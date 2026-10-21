/**
 * The plain-rock hint (polish 2): a tap on ordinary rock is a soft "tunk", and once in a while it
 * also says why (`hint.plainRock`: look for a glowing vein, loose stone or roots). The first tunk
 * says it; after that only when enough time and enough tunks have passed, and the wait doubles
 * each time it shows (40 s, 80 s, 160 s, then every 240 s at most), so it never nags.
 */
export const PLAIN_ROCK_HINT = {
  /** Seconds after the first showing before it may show again; doubles each time. */
  firstGap: 40,
  maxGap: 240,
  /** Tunks since the last showing before it may show again. */
  tunksBetween: 4,
} as const;

export class PlainRockHint {
  private shownAt = -Infinity;
  private shown = 0;
  private since = 0;

  /** One tunk at game time `now` (s). @returns true when the hint should show with it. */
  onTunk(now: number): boolean {
    this.since++;
    const gap = Math.min(PLAIN_ROCK_HINT.maxGap, PLAIN_ROCK_HINT.firstGap * 2 ** Math.max(0, this.shown - 1));
    const due = this.shown === 0 || (now - this.shownAt >= gap && this.since >= PLAIN_ROCK_HINT.tunksBetween);
    if (!due) return false;
    this.shownAt = now;
    this.shown++;
    this.since = 0;
    return true;
  }
}
