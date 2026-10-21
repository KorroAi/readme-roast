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
  'boneRam', 'rimeAuger', 'loomWeaver', 'gravityWell', 'starForge', 'voidEngine', 'gateEngine',
];

/**
 * The shared crew bar (hybrid SPEC §5.3; BUILD §3.1 MUST 5): every visible rig strikes on the same 0.9 s beat, so the
 * crew reads as ONE ambient group. Periods are whole multiples of the bar and every impact sits at CREW_BEAT + k × bar
 * after the loop's start (which is itself on the bar, `ensureCrewClock`). The damage per impact is the line's DPS ×
 * period / impacts (stepCrew), so the DPS of every line is unchanged by the quantisation (asserted in nodes.test).
 */
export const CREW_BAR = 0.9;
/** Where in the bar the impacts land (s after the bar starts). */
export const CREW_BEAT = 0.52;

const beat = (k: number) => CREW_BEAT + k * CREW_BAR;

const RIGS: readonly CrewRig[] = [
  { period: 0.9, impacts: [beat(0)], area: 'cell' }, // Shovel Hand: every beat
  { period: 1.8, impacts: [beat(0), beat(1)], area: 'cell' }, // Pick Crew: two miners alternating
  { period: 2.7, impacts: [beat(1)], area: 'column' }, // Mine Cart
  { period: 1.8, impacts: [beat(0), beat(1)], area: 'column' }, // Steam Drill
  { period: 6.3, impacts: [beat(4)], area: 'blast3' }, // Blast Team
  { period: 1.8, impacts: [beat(0), beat(1)], area: 'row' }, // Tunnel Borer
  { period: 2.7, impacts: [beat(0), beat(1)], area: 'row' }, // Crystal Resonator
  { period: 2.7, impacts: [beat(1)], area: 'beam' }, // Magma Lance
  { period: 3.6, impacts: [beat(2)], area: 'row' }, // Bone Ram
  { period: 1.8, impacts: [beat(0), beat(1)], area: 'column' }, // Rime Auger
  { period: 2.7, impacts: [beat(0), beat(1), beat(2)], area: 'beam' }, // Loom Weaver
  { period: 3.6, impacts: [beat(3)], area: 'row' }, // Gravity Well
  { period: 3.6, impacts: [beat(1), beat(3)], area: 'beam' }, // Star Forge
  { period: 4.5, impacts: [beat(2)], area: 'row' }, // Void Engine
  { period: 5.4, impacts: [beat(0), beat(2), beat(4)], area: 'row' }, // Gate Engine
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
