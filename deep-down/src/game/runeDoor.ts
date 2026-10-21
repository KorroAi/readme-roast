import { SOLID } from '../config/blocks';
import type { RuneDoorDef } from '../world/gen/features/types';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * Lantern-bearer rune doors (world/gen/features: the Reliquary, the Lamp Gallery). A door wakes
 * while the explorer stands within its radius of the wake point holding a lit lantern of a high
 * enough tier; after `hold` seconds it opens (game/WorldFeatures sinks it row by row). Stepping
 * away lets the waking fade twice as fast. Pure: the open state itself is read from the world
 * (every door cell air), so saves need nothing beyond the world delta.
 */
export type DoorState = 'idle' | 'waking' | 'weak' | 'dark' | 'open';

export interface DoorWake {
  /** 0..1 toward opening. */
  progress: number;
  state: DoorState;
}

export interface WakeInput {
  px: number;
  py: number;
  pz: number;
  lanternLit: boolean;
  lanternTier: number;
}

/** True when the explorer's feet are in the door's wake zone. */
export function inWakeZone(door: Pick<RuneDoorDef, 'wake' | 'radius'>, px: number, py: number, pz: number): boolean {
  return Math.hypot(px - door.wake[0], pz - door.wake[2]) <= door.radius && Math.abs(py - door.wake[1]) <= 2.5;
}

/** One frame of waking. Mutates and returns `st`. */
export function wakeStep(door: Pick<RuneDoorDef, 'wake' | 'radius' | 'hold' | 'minLanternTier'>, st: DoorWake, dt: number, inp: WakeInput): DoorWake {
  if (st.state === 'open') return st;
  const rate = dt / Math.max(0.05, door.hold);
  if (!inWakeZone(door, inp.px, inp.py, inp.pz)) {
    st.progress = Math.max(0, st.progress - 2 * rate);
    st.state = 'idle';
    return st;
  }
  if (!inp.lanternLit) {
    st.progress = Math.max(0, st.progress - 2 * rate);
    st.state = 'dark';
    return st;
  }
  if (inp.lanternTier < door.minLanternTier) {
    st.progress = Math.max(0, st.progress - 2 * rate);
    st.state = 'weak';
    return st;
  }
  st.progress = Math.min(1, st.progress + rate);
  st.state = st.progress >= 1 ? 'open' : 'waking';
  return st;
}

/** A door is open once none of its cells is solid any more. */
export function doorIsOpen(world: VoxelWorld, door: Pick<RuneDoorDef, 'cells'>): boolean {
  return door.cells.every(([x, y, z]) => !SOLID[world.get(x, y, z)]);
}

/** The door's cells grouped in rows from the top down (the order they sink in). */
export function doorRows(door: Pick<RuneDoorDef, 'cells'>): Array<Array<[number, number, number]>> {
  const ys = [...new Set(door.cells.map((c) => c[1]))].sort((a, b) => b - a);
  return ys.map((y) => door.cells.filter((c) => c[1] === y).map((c) => [c[0], c[1], c[2]] as [number, number, number]));
}
