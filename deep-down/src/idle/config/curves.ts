// The depth curve and the global economy knobs (SPEC §5.2, Appendix A). Read by the game and the sim.
// HP is piecewise geometric: a constant ratio per metre inside each segment, so every quantity has an
// exact closed form (offline, analytic rows). All work is in log10 to stay exact at any depth.

/** HP of a 0 m cell (= the level-1 pick's damage, E1). */
export const HP0 = 100;
export const HP0_LOG10 = 2;

/** Depth curve segments: from `from` rows on, HP grows by `slope` per row (SPEC §5.2). */
export const SEGMENTS: Array<{ from: number; slope: number }> = [
  { from: 0, slope: 1.14 },
  { from: 40, slope: 1.044 },
  { from: 240, slope: 1.0392 },
  { from: 900, slope: 1.0416 },
  { from: 2400, slope: 1.044 },
];

/**
 * Gold per HP dug. SPEC §5.1 writes "HP / 100"; the calibration model (m5.mjs) credited a row's partial
 * gold and then its full gold again on completion, which paid about ×1.5–1.9 while rows took several
 * steps (the first 40 minutes), and it charged rows 7 × H with no crumble. The port fixes the accounting,
 * charges κ × 7 × H (the crumble) and the pick's edge (CRITIQUE MUST 2), and carries the difference here
 * (×1.4) so the first-run table of SPEC §5.12 reproduces (`tools/econ-sim.ts first`). Prices stay the
 * SPEC's numbers (COST_GOLD_PER_HP).
 */
export const GOLD_PER_HP = 0.014;

/**
 * The live economy knobs the formulas read (calibration tools may tune them for a sweep; the game never
 * writes them). Defaults are the constants above.
 */
export const ECON = { goldPerHp: GOLD_PER_HP };

/** Gold per HP now (ECON). */
export function goldPerHp(): number {
  return ECON.goldPerHp;
}

/** The gold unit prices are written in (SPEC §5.4's tables: "rows of gold" = 7 × HP / 100). */
export const COST_GOLD_PER_HP = 0.01;

/** A row costs κ × 7 × H(d): the leftover crumble at 5 of 7 (SPEC §3.2; measured by shaft.test.ts). */
export const KAPPA = 0.86;

/** Cells of a row that must break before the rest crumble. */
export const CRUMBLE_AT = 5;
/** The crumble's shake before the cells fall (s). */
export const CRUMBLE_DELAY = 0.3;

const LN10 = Math.LN10;

// Precomputed log10 HP at each segment start.
const SEG_LOG: number[] = [];

/** Recompute the segment table (calibration tools that change SEGMENTS call it; the game never does). */
export function rebuildSegments(): void {
  SEG_LOG.length = 0;
  let l = HP0_LOG10;
  for (let i = 0; i < SEGMENTS.length; i++) {
    SEG_LOG.push(l);
    if (i + 1 < SEGMENTS.length) l += (SEGMENTS[i + 1].from - SEGMENTS[i].from) * Math.log10(SEGMENTS[i].slope);
  }
}
rebuildSegments();

/** The segment index for a depth. */
export function segmentAt(depth: number): number {
  let i = 0;
  while (i + 1 < SEGMENTS.length && SEGMENTS[i + 1].from <= depth) i++;
  return i;
}

/** log10 of a rock cell's HP at depth d (rows, may be fractional for interpolation; floors to the row). */
export function hpLog10(depth: number, slopeAdd = 0): number {
  const d = Math.max(0, Math.floor(depth));
  const i = segmentAt(d);
  const s = SEGMENTS[i];
  if (slopeAdd === 0) return SEG_LOG[i] + (d - s.from) * Math.log10(s.slope);
  // A slope change (Granite, Deep Lungs; W3) re-integrates from the top.
  let l = HP0_LOG10;
  for (let k = 0; k < i; k++) l += (SEGMENTS[k + 1].from - SEGMENTS[k].from) * Math.log10(SEGMENTS[k].slope + slopeAdd);
  return l + (d - s.from) * Math.log10(s.slope + slopeAdd);
}

/** HP as a plain number (Infinity past 1e308: use hpLog10). */
export function hp(depth: number): number {
  return Math.pow(10, hpLog10(depth));
}

/** log10 of the gold an average rock-mix cell pays at depth d (kind multiplier 1.00). */
export function goldPerCellLog10(depth: number): number {
  return hpLog10(depth) + Math.log10(ECON.goldPerHp);
}

/** log10 of a price of `rows` "rows of gold at u" (SPEC §5.4: 7 × HP(u) / 100 each). */
export function rowsOfGoldLog10(u: number, rows = 1): number {
  return Math.log10(7 * rows * COST_GOLD_PER_HP) + hpLog10(u);
}

/** log10 of a row's cost in damage: κ × 7 × H(d). */
export function rowCostLog10(depth: number): number {
  return Math.log10(KAPPA * 7) + hpLog10(depth);
}

/**
 * log10 of the damage to clear rows [a, b) (each κ·7·H): the closed form over segments (SPEC §4.3).
 */
export function rowsCostLog10(a: number, b: number): number {
  if (b <= a) return -Infinity;
  let total = -Infinity;
  let d = Math.floor(a);
  const end = Math.floor(b);
  while (d < end) {
    const i = segmentAt(d);
    const segEnd = i + 1 < SEGMENTS.length ? Math.min(end, SEGMENTS[i + 1].from) : end;
    const k = segEnd - d;
    const g = SEGMENTS[i].slope;
    // κ·7·H(d)·(g^k − 1)/(g − 1)
    const part = rowCostLog10(d) + log10GeomSum(g, k);
    total = addLog(total, part);
    d = segEnd;
  }
  return total;
}

/** log10((g^k − 1)/(g − 1)), stable for large k. */
export function log10GeomSum(g: number, k: number): number {
  if (k <= 0) return -Infinity;
  const lg = Math.log10(g);
  const kl = k * lg;
  // (g^k − 1)/(g − 1) = g^k (1 − g^−k)/(g − 1)
  if (kl > 15) return kl - Math.log10(g - 1);
  return Math.log10((Math.pow(g, k) - 1) / (g - 1));
}

/**
 * How many whole rows from depth `a` a work of 10^w damage clears, and the fraction of the next row left
 * over (the closed form of SPEC §4.3). `stopAt` caps the walk (an unopened seal). Returns the rows
 * cleared, the leftover fraction of the next row in [0, 1), and log10 of the work used.
 */
export function rowsForWork(a: number, w: number, stopAt = Infinity): { rows: number; frac: number; used: number } {
  let d = Math.floor(a);
  let left = w; // log10 of remaining work
  let used = -Infinity;
  for (let guard = 0; guard < 64 && left > -Infinity; guard++) {
    if (d >= stopAt) break;
    const i = segmentAt(d);
    const segEnd = Math.min(stopAt, i + 1 < SEGMENTS.length ? SEGMENTS[i + 1].from : Infinity);
    const g = SEGMENTS[i].slope;
    const c0 = rowCostLog10(d); // log10 of row d's cost
    const lg = Math.log10(g);
    // Rows k with c0·(g^k − 1)/(g − 1) ≤ W → k = floor(log_g(1 + W(g − 1)/c0))
    const x = left - c0 + Math.log10(g - 1); // log10(W(g−1)/c0)
    const kMaxL = x > 15 ? x / lg : Math.log10(1 + Math.pow(10, x)) / lg;
    let k = Math.floor(kMaxL + 1e-9);
    const room = segEnd - d;
    if (k >= room) {
      // The whole segment (to segEnd) is paid for.
      const cost = c0 + log10GeomSum(g, room);
      used = addLog(used, cost);
      left = subLog(left, cost);
      d = segEnd;
      if (!Number.isFinite(segEnd)) break;
      continue;
    }
    if (k < 0) k = 0;
    const cost = k > 0 ? c0 + log10GeomSum(g, k) : -Infinity;
    used = addLog(used, cost);
    left = subLog(left, cost);
    d += k;
    // Leftover: a fraction of row d.
    const rowC = rowCostLog10(d);
    const frac = left === -Infinity ? 0 : Math.min(0.999999999, Math.pow(10, left - rowC));
    used = addLog(used, left);
    return { rows: d - Math.floor(a), frac, used };
  }
  return { rows: d - Math.floor(a), frac: 0, used };
}

// ----- log helpers (shared) ---------------------------------------------------------------------------

/** log10(10^a + 10^b). */
export function addLog(a: number, b: number): number {
  if (a === -Infinity) return b;
  if (b === -Infinity) return a;
  const m = Math.max(a, b);
  const d = Math.abs(a - b);
  if (d > 17) return m;
  return m + Math.log1p(Math.pow(10, -d)) / LN10;
}

/** log10(10^a − 10^b) (−Infinity when b ≥ a). */
export function subLog(a: number, b: number): number {
  if (b === -Infinity) return a;
  if (b >= a) return -Infinity;
  const d = a - b;
  if (d > 17) return a;
  return a + Math.log1p(-Math.pow(10, -d)) / LN10;
}
