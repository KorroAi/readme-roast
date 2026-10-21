/**
 * The eye on the Halden hoist (polish 2): the ride carries the feet up and down the rope's axis,
 * which put the rope, the hook and the spreader right over the lens, filling the top of the frame.
 * The explorer stands off-centre on the cage instead: the eye sits HOIST_EYE_OFF metres to one side
 * of the axis, blended in (smoothstep) over the last HOIST_EYE_BLEND metres of the walk onto the
 * cage and out over the first metres off it, so the eye never jumps and stays at least
 * HOIST_EYE_MIN from the axis on the whole ride. Pure: Game.ts adds it to the camera's eye point.
 */
export const HOIST_EYE_OFF = 0.48;
export const HOIST_EYE_BLEND = 1.4;
/** The brief's floor: the eye at least this far off the rope's axis (m). */
export const HOIST_EYE_MIN = 0.45;

export interface HoistSide {
  /** The rope's axis (world x, z). */
  ax: number;
  az: number;
  /** Unit side to stand on (world x, z). */
  ux: number;
  uz: number;
}

/**
 * The side to stand on for a hoist whose rope hangs at `axis` and whose bottom stand is `bottom`
 * (world points; y ignored): toward the bottom stand, the way the explorer steps off, so the eye
 * never crosses the axis there. Falls back to +z when the stand is right under the rope.
 */
export function hoistSide(axis: readonly number[], bottom: readonly number[]): HoistSide {
  const dx = bottom[0] - axis[0];
  const dz = bottom[2] - axis[2];
  const len = Math.hypot(dx, dz);
  return len > 1e-3 ? { ax: axis[0], az: axis[2], ux: dx / len, uz: dz / len } : { ax: axis[0], az: axis[2], ux: 0, uz: 1 };
}

/** The eye's horizontal offset (m) for feet at (x, z) on a hoist ride, written into `out`. */
export function hoistEyeOffset(side: HoistSide, x: number, z: number, out: { x: number; z: number }): { x: number; z: number } {
  const d = Math.hypot(x - side.ax, z - side.az);
  const u = Math.max(0, Math.min(1, 1 - d / HOIST_EYE_BLEND));
  const k = u * u * (3 - 2 * u);
  out.x = side.ux * HOIST_EYE_OFF * k;
  out.z = side.uz * HOIST_EYE_OFF * k;
  return out;
}
