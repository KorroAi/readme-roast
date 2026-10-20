// The crew on screen (SPEC §4.1, §6.9): each hired line's rig strikes on its loop's impact frames and
// the damage lands on those frames, so the screen and the numbers agree (BUILD §2.1 MUST 4). A strike
// deals lineDPS × period / impacts, to the floor row's weakest cell first, then it flows like a tap.
// B's CrewRenderer reads `strikePhase()` (or `state.time` and `state.crewT0`) to play the same loop.

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { crewLine } from '../config/crew';
import { lineDpsLog10 } from './run';
import { hitSeal } from './seals';
import { applyHit, weakestCell } from './shaft';
import { CELL, type IdleState } from './state';

const L10 = Math.log10;

/** The phase of line i's loop now (seconds into the loop, 0 ≤ phase < period). */
export function strikePhase(s: IdleState, line: number, time = s.time): number {
  const rig = crewLine(line).rig;
  const t0 = s.crewT0[line] ?? 0;
  const p = (time - t0) % rig.period;
  return p < 0 ? p + rig.period : p;
}

/** Seconds until line i's next impact (for B's anticipation and tests). */
export function nextImpactIn(s: IdleState, line: number): number {
  const rig = crewLine(line).rig;
  const ph = strikePhase(s, line);
  for (const at of rig.impacts) if (at > ph + 1e-9) return at - ph;
  return rig.period - ph + rig.impacts[0];
}

/** Count line i's impact instants in the half-open window (t0, t1]. */
export function impactsIn(s: IdleState, line: number, t0: number, t1: number): number {
  const rig = crewLine(line).rig;
  const o = s.crewT0[line] ?? 0;
  let n = 0;
  for (const at of rig.impacts) {
    // Impacts at o + at + k·period; count k with t0 < o + at + k·P ≤ t1.
    const a = Math.floor((t1 - o - at) / rig.period);
    const b = Math.floor((t0 - o - at) / rig.period);
    n += Math.max(0, a - b);
  }
  return n;
}

/** Hire a line's loop origin (a fresh rig starts its loop when hired). */
export function ensureCrewClock(s: IdleState, line: number): void {
  while (s.crewT0.length <= line) s.crewT0.push(s.time);
}

/**
 * Land every crew impact in (t − dt, t]. Each strike's damage is the line's DPS × period / impacts.
 * Returns how many strikes landed.
 */
export function stepCrew(s: IdleState, dt: number, bus?: IdleBus): number {
  const t1 = s.time;
  const t0 = t1 - dt;
  let strikes = 0;
  for (let i = 0; i < s.run.lines.length; i++) {
    if ((s.run.lines[i] ?? 0) <= 0) continue;
    ensureCrewClock(s, i);
    const n = impactsIn(s, i, t0, t1);
    if (n <= 0) continue;
    const rig = crewLine(i).rig;
    const dmg = lineDpsLog10(s, i) + L10((rig.period / rig.impacts.length) * n);
    strikes += n;
    const floor = s.shaft.rows[0];
    if (floor.kinds[0] === CELL.SEAL) {
      hitSeal(s, dmg, true, bus);
      continue;
    }
    const c = weakestCell(s);
    if (c < 0) continue;
    const res = applyHit(s, c, floor.depth, dmg, { source: 'crew', crit: false, pierce: 1 }, bus);
    bus?.emit('crew:strike', { line: i, col: c, depth: floor.depth, dmg: Big.fromLog10(dmg), cells: res.cells });
  }
  return strikes;
}
