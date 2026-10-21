// First-person tuning: one place for the numbers the camera, the controls and the viewmodel share.

/** Eye height above the feet (m), standing. */
export const EYE_HEIGHT = 1.62;
/** Furthest a block centre (or a prop's hit point) may be from the eye to be mined (m). */
export const REACH = 3.5;
/** Walking speed (m/s) and the eased start / stop (m/s^2). */
export const WALK_SPEED = 3.3;
export const WALK_ACCEL = 15;
export const WALK_DECEL = 19;
/** Vertical field of view (deg) on an upright phone, and the horizontal lock on wide screens. */
export const FP_VFOV = 78;
export const FP_HFOV = 90;
/** Pitch limit (rad): +-75 degrees. */
export const PITCH_LIMIT = (75 * Math.PI) / 180;
/** Near plane (m) and the clearance kept between the eye and any solid voxel (m). */
export const NEAR = 0.05;
export const EYE_CLEARANCE = 0.42;
/** Look damping rate (1/s): the view eases to the look input in ~40 ms (no lag felt, no jitter). */
export const LOOK_RATE = 26;
/** Radians per CSS pixel of drag at sensitivity 1. */
export const LOOK_PER_PX = 0.0042;
/**
 * Where the lantern light hangs, in the world camera's space (m): low and to the left of the eye,
 * a little ahead, as the drawn lantern is held.
 */
export const LANTERN_LIGHT_CAM: readonly [number, number, number] = [-0.24, -0.4, -0.3];
