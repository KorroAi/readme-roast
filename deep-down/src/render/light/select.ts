// Practical light selection (W1-LEAD §4.6): up to 8 per-pixel practicals per view, chosen per frame by nearest and
// brightest, with hysteresis so two lamps of similar weight never swap back and forth (no popping), and a short fade
// for a light that leaves the set. A lamp that is newly lit enters in the frame it is passed (relight shows at once).
// Pure (no Three.js): positions are plain numbers.

export interface LightCandidate {
  id: string;
  x: number;
  y: number;
  z: number;
  /** Peak radiance (colour luminance × intensity); 0 = cold or off. */
  power: number;
  /** Range in metres. */
  range: number;
}

export interface SelectState {
  /** Ids currently selected, with their fade weight 0..1. */
  weight: Map<string, number>;
}

export const SELECT = {
  max: 8,
  /** A newcomer must beat the weakest selected light by this factor to take its slot. */
  hysteresis: 1.25,
  /** Fade-out time (s) of a light that loses its slot (a relit lamp enters at once). */
  fadeS: 0.2,
} as const;

/** The importance of a light seen from (ex, ey, ez): power over distance, zero beyond its range plus a margin. */
export function importance(c: LightCandidate, ex: number, ey: number, ez: number): number {
  if (!(c.power > 0) || !(c.range > 0)) return 0;
  const d = Math.hypot(c.x - ex, c.y - ey, c.z - ez);
  // A light is useful while the eye can see surfaces it reaches: up to its range plus the view's reach into the room.
  if (d > c.range + 14) return 0;
  return (c.power * c.range * c.range) / Math.max(0.25, d * d);
}

export function newSelectState(): SelectState {
  return { weight: new Map() };
}

/**
 * Choose up to `max` lights for this frame. Returns the chosen candidates with their weights (fading ones included,
 * ≤ max in total), most important first. `dt` drives the fades (0 = snap: loads, cuts).
 */
export function selectLights(
  cands: ReadonlyArray<LightCandidate>,
  ex: number,
  ey: number,
  ez: number,
  state: SelectState,
  dt: number,
  max: number = SELECT.max,
): Array<{ c: LightCandidate; w: number }> {
  const scored: Array<{ c: LightCandidate; s: number }> = [];
  for (const c of cands) {
    const s = importance(c, ex, ey, ez);
    if (s > 0) scored.push({ c, s });
  }
  scored.sort((a, b) => b.s - a.s || (a.c.id < b.c.id ? -1 : 1));
  // Keep the incumbents that still score, unless a newcomer beats the weakest incumbent clearly.
  const incumbents = scored.filter((e) => (state.weight.get(e.c.id) ?? 0) > 0.999);
  const others = scored.filter((e) => !((state.weight.get(e.c.id) ?? 0) > 0.999));
  const chosen = incumbents.slice(0, max);
  for (const e of others) {
    if (chosen.length < max) {
      chosen.push(e);
      continue;
    }
    let weakest = 0;
    for (let i = 1; i < chosen.length; i++) if (chosen[i].s < chosen[weakest].s) weakest = i;
    if (e.s > chosen[weakest].s * SELECT.hysteresis) chosen[weakest] = e;
  }
  const chosenIds = new Set(chosen.map((e) => e.c.id));
  const next = new Map<string, number>();
  const out: Array<{ c: LightCandidate; w: number }> = [];
  for (const e of chosen) {
    next.set(e.c.id, 1);
    out.push({ c: e.c, w: 1 });
  }
  // Lights that lost their slot fade out (while there is room); gone lights drop at once.
  const fade = dt > 0 ? dt / SELECT.fadeS : 1;
  const byId = new Map(scored.map((e) => [e.c.id, e.c] as const));
  for (const [id, w] of state.weight) {
    if (chosenIds.has(id)) continue;
    const c = byId.get(id);
    const nw = w - fade;
    if (!c || nw <= 0 || out.length >= max) continue;
    next.set(id, nw);
    out.push({ c, w: nw });
  }
  state.weight = next;
  out.sort((a, b) => b.w - a.w || importance(b.c, ex, ey, ez) - importance(a.c, ex, ey, ez));
  return out;
}
