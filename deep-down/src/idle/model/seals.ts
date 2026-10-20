// Seals (SPEC §7.1), the W1 part: the first time ever at a biome boundary, the floor is a carved slab
// held for a 30 s fight. Seal HP = 20 s × (crew DPS + 4 × tap damage without crit) on arrival, × 0.5 for
// the tutorial's Halden Hatch. Taps and the crew both apply (the crew only while the player is hitting:
// a seal never breaks in front of an idle player). A fail keeps 50 % of the damage dealt and
// waits for a tap (nothing is lost, L11). Offline, the crew stops here (L10). Weak points and the Strike
// finisher are W2 (hooks: `weak` on hitSeal).

import { Big } from '../../core/big';
import type { IdleBus } from '../bus';
import { biomeAt } from '../config/biomes';
import { crewDpsLog10, tapBaseLog10 } from './run';
import { resetWindow, settleFloor } from './shaft';
import { CELL, COLS, type IdleState } from './state';

const L10 = Math.log10;

export const SEAL = {
  /** Seconds of arrival DPS the HP is worth. */
  hpSeconds: 20,
  /** Taps per second the HP assumes (4 × tap damage). */
  taps: 4,
  /** The fight's timer (s). */
  time: 30,
  /** Damage kept after a fail. */
  kept: 0.5,
  /** The tutorial's Halden Hatch (biome 1's seal) at half HP. */
  hatchFactor: 0.5,
  /** The weak point (W2): ×5 while lit. */
  weakX: 5,
  /** The crew's strikes count on a seal only within this many seconds of the player's last hit. */
  crewWindow: 2,
} as const;

/** log10 of a seal's HP for the player's power now. */
export function sealHpLog10(s: IdleState, biome: number): number {
  const crew = crewDpsLog10(s);
  const tap = tapBaseLog10(s, s.run.pick, crew) + L10(1.5);
  const dps = crew === -Infinity ? tap + L10(SEAL.taps) : Math.max(crew, tap + L10(SEAL.taps)) + L10(1 + Math.pow(10, -Math.abs(crew - (tap + L10(SEAL.taps)))));
  return dps + L10(SEAL.hpSeconds) + (biome === 1 ? L10(SEAL.hatchFactor) : 0);
}

/** The floor reached a never-opened seal: start (or keep) the fight. */
export function arriveAtSeal(s: IdleState, bus?: IdleBus): void {
  const floor = s.shaft.rows[0];
  if (floor.kinds[0] !== CELL.SEAL) {
    s.seal = null;
    return;
  }
  if (s.seal && s.seal.depth === floor.depth) return;
  const biome = biomeAt(floor.depth);
  const hp = Big.fromLog10(sealHpLog10(s, biome));
  s.seal = { biome, depth: floor.depth, hp, left: 1, endsAt: s.time + SEAL.time, time: SEAL.time, phase: 'fight', started: s.time };
  bus?.emit('seal:start', { biome, depth: floor.depth, hp: hp.clone(), time: SEAL.time });
}

/** A hit on the seal (taps and crew). A tap on a held seal starts the fight again at once. */
export function hitSeal(s: IdleState, dmgLog10: number, crew: boolean, bus?: IdleBus, weak = false): void {
  const st = s.seal;
  if (!st) return;
  // The crew helps only while the player fights (a hit in the last 2 s): first sight is the player's (L10).
  if (crew && s.time - s.hints.lastHitAt > SEAL.crewWindow) return;
  if (st.phase === 'held') {
    if (crew) return;
    st.phase = 'fight';
    st.endsAt = s.time + SEAL.time;
    st.started = s.time;
    bus?.emit('seal:start', { biome: st.biome, depth: st.depth, hp: st.hp.clone(), time: SEAL.time });
  }
  const d = dmgLog10 + (weak ? L10(SEAL.weakX) : 0);
  const f = Math.pow(10, d - st.hp.log10());
  st.left = Math.max(0, st.left - f);
  bus?.emit('seal:hit', { biome: st.biome, left: st.left, dmg: Big.fromLog10(d), weak });
  if (st.left <= 0) breakSeal(s, bus);
}

function breakSeal(s: IdleState, bus?: IdleBus): void {
  const st = s.seal;
  if (!st) return;
  const time = s.time - st.started;
  if (!s.meta.sealsOpened.includes(st.biome)) s.meta.sealsOpened.push(st.biome);
  s.meta.gems += 5;
  bus?.emit('gems:gain', { amount: 5, source: 'seal', col: -1, depth: st.depth });
  const floor = s.shaft.rows[0];
  // The slab is gone: the row is open, the floor drops onto the biome's first rock.
  floor.kinds.fill(CELL.AIR);
  for (let c = 0; c < COLS; c++) floor.left[c] = 0;
  s.seal = null;
  bus?.emit('seal:break', { biome: st.biome, depth: st.depth, time });
  bus?.emit('biome:reveal', { biome: st.biome });
  settleFloor(s, bus, 'tap');
}

/** Advance the timer: a fail keeps half the damage dealt and waits for a tap. */
export function tickSeal(s: IdleState, bus?: IdleBus): void {
  const st = s.seal;
  if (!st) {
    if (s.shaft.rows[0].kinds[0] === CELL.SEAL) arriveAtSeal(s, bus);
    return;
  }
  if (st.phase === 'fight' && s.time >= st.endsAt) {
    const dealt = 1 - st.left;
    st.left = 1 - dealt * SEAL.kept;
    st.phase = 'held';
    bus?.emit('seal:fail', { biome: st.biome, left: st.left, kept: SEAL.kept });
  }
}

/** Seconds left on the timer (0 when held). */
export function sealTimeLeft(s: IdleState): number {
  const st = s.seal;
  if (!st || st.phase !== 'fight') return 0;
  return Math.max(0, st.endsAt - s.time);
}

/** Debug and tests: open every seal up to and including biome k (no fight). */
export function openSealsThrough(s: IdleState, k: number): void {
  for (let b = 1; b <= k; b++) if (!s.meta.sealsOpened.includes(b)) s.meta.sealsOpened.push(b);
  resetWindow(s, s.run.depth);
  s.seal = null;
}
