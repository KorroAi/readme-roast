// The crew (SPEC §5.4): 15 authored lines, then an Echo line per Echo stratum. Lines 0–5 are priced at
// their unlock depth u (c0 = 26.6 rows of gold at u, output HP(u)/44.4 per level; line 0 costs 50);
// lines 6+ are a geometric ladder: ×1e4 cost and ×1e4 output per line, not indexed to HP (the most
// important structural rule of the economy). r = 1.10 for every line. Output b × L × 2^floor(L / 10).
//
// Each line's rig strikes on fixed impact frames (`rig`): B's CrewRenderer plays the same loop, and the
// model lands the line's damage at the same instants (BUILD §2.1 MUST 4), so the screen and the numbers
// agree. Phase = (state.time − state.crewT0[line]) mod period.

import { biomeStart, ECHO_SPACING, ECHO_START } from './biomes';
import { COST_GOLD_PER_HP, hpLog10 } from './curves';

export interface CrewRig {
  /** Loop length (s). */
  period: number;
  /** Impact instants inside the loop (s from the loop start); damage lands on each. */
  impacts: readonly number[];
  /** How the strike lands: 'cell' (the weakest floor cell), 'column', 'blast3' (3×3), 'row', 'beam'. */
  area: 'cell' | 'column' | 'blast3' | 'row' | 'beam';
}

export interface CrewDef {
  /** Line index. */
  i: number;
  /** i18n `idle.crew.<id>`. */
  id: string;
  /** Unlock depth (rows). */
  unlock: number;
  /** log10 of c0 (gold) and of the output per level (HP/s). */
  c0Log10: number;
  bLog10: number;
  r: number;
  rig: CrewRig;
}

/** Cost ratio per level for every line. */
export const LINE_R = 1.1;
/** Rows of gold at the unlock depth for lines 1–5's first level. */
export const LINE_COST_ROWS = 26.6;
/** Output at unlock: a level-1 line breaks one cell every 44.4 s at its unlock depth. */
export const LINE_OUT_DIV = 44.4;
/** The geometric ladder from line 6 on. */
export const LADDER_FROM = 5;
export const LADDER_X = 1e4;
/** ★ every 10 levels (×2), a crown every 50. */
export const STAR_EVERY = 10;
export const STAR_X = 2;
export const CROWN_EVERY = 50;

const IDS = [
  'shovelHand', 'pickCrew', 'mineCart', 'steamDrill', 'blastTeam', 'tunnelBorer', 'crystalResonator', 'magmaLance',
  'fossilGolem', 'rimeAuger', 'loomWeaver', 'gravityWell', 'starForge', 'voidMaw', 'gateEngine',
];

const RIGS: readonly CrewRig[] = [
  { period: 0.9, impacts: [0.52], area: 'cell' },
  { period: 1.2, impacts: [0.35, 0.95], area: 'cell' },
  { period: 2.4, impacts: [1.9], area: 'column' },
  { period: 1.6, impacts: [0.6, 1.0, 1.4], area: 'column' },
  { period: 6, impacts: [4.6], area: 'blast3' },
  { period: 2, impacts: [0.5, 1.0, 1.5, 2.0 - 1e-3], area: 'row' },
  { period: 3, impacts: [1.2, 2.4], area: 'row' },
  { period: 2.5, impacts: [1.0], area: 'beam' },
  { period: 3.2, impacts: [2.1], area: 'row' },
  { period: 2.2, impacts: [0.8, 1.6], area: 'column' },
  { period: 2.8, impacts: [0.7, 1.4, 2.1], area: 'beam' },
  { period: 4, impacts: [3.0], area: 'row' },
  { period: 3.6, impacts: [1.8, 3.4], area: 'beam' },
  { period: 4.4, impacts: [2.6], area: 'row' },
  { period: 5, impacts: [1.2, 2.5, 3.8], area: 'row' },
];

/** Authored line count. */
export const AUTHORED_LINES = 15;

/** Unlock depth of line i: 0, 16 m, then the start of biome i − 1; Echo lines with their strata (the W1 calibration). */
export function lineUnlock(i: number): number {
  if (i <= 0) return 0;
  if (i === 1) return 16;
  if (i < AUTHORED_LINES) return biomeStart(i - 1);
  return ECHO_START + (i - AUTHORED_LINES) * ECHO_SPACING;
}

const cache: CrewDef[] = [];

/** The definition of line i (any i ≥ 0; Echo lines continue the ladder). */
export function crewLine(i: number): CrewDef {
  let d = cache[i];
  if (d) return d;
  const u = lineUnlock(i);
  let c0Log10: number;
  let bLog10: number;
  if (i === 0) {
    c0Log10 = Math.log10(50);
    bLog10 = hpLog10(0) - Math.log10(LINE_OUT_DIV);
  } else if (i <= LADDER_FROM) {
    // 26.6 rows of the SPEC's gold (HP / 100 a cell) at u; the costs stay the SPEC's numbers while the
    // income carries GOLD_PER_HP (curves.ts).
    c0Log10 = Math.log10(7 * LINE_COST_ROWS) + hpLog10(u) + Math.log10(COST_GOLD_PER_HP);
    bLog10 = hpLog10(u) - Math.log10(LINE_OUT_DIV);
  } else {
    const p = crewLine(LADDER_FROM);
    const n = i - LADDER_FROM;
    c0Log10 = p.c0Log10 + n * Math.log10(LADDER_X);
    bLog10 = p.bLog10 + n * Math.log10(LADDER_X);
  }
  const base = i < AUTHORED_LINES ? i : (i - AUTHORED_LINES) % AUTHORED_LINES;
  d = { i, id: IDS[base], unlock: u, c0Log10, bLog10, r: LINE_R, rig: RIGS[base] };
  cache[i] = d;
  return d;
}

/** Echo mark of line i (0 for authored lines; 1 = Mk II…). */
export function lineEcho(i: number): number {
  return i < AUTHORED_LINES ? 0 : 1 + Math.floor((i - AUTHORED_LINES) / AUTHORED_LINES);
}

/** The number of lines unlocked at a depth (all lines whose unlock ≤ depth). */
export function linesUnlockedAt(depth: number): number {
  let n = 0;
  while (lineUnlock(n) <= depth) n++;
  return n;
}

/** log10 of the cost of level L → L + 1 of line i. */
export function lineCostLog10(i: number, level: number): number {
  const d = crewLine(i);
  return d.c0Log10 + level * Math.log10(d.r);
}

/** log10 of the line's output at level L before multipliers (b × L × 2^floor(L/10)). */
export function lineOutLog10(i: number, level: number): number {
  if (level <= 0) return -Infinity;
  const d = crewLine(i);
  return d.bLog10 + Math.log10(level) + Math.floor(level / STAR_EVERY) * Math.log10(STAR_X);
}
