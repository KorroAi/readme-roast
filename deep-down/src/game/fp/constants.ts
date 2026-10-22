// First-person tuning: one place for the numbers the camera, the controls and the viewmodel share.

/** Eye height above the feet (m), standing. */
export const EYE_HEIGHT = 1.62;
/** Furthest a block centre (or a prop's hit point) may be from the eye to be mined (m). */
export const REACH = 3.5;
/**
 * Walking speed (m/s) and the eased start / stop (m/s^2). Round 3 (BRIEF §0.6, the nervous feel):
 * about 4.2 m/s walking, 6.5 m/s sprinting (the stick at its edge, or Shift), quicker starts and stops.
 */
export const WALK_SPEED = 4.2;
export const SPRINT_SPEED = 6.5;
export const WALK_ACCEL = 26;
export const WALK_DECEL = 32;
/** The stick deflection (fraction of its radius) from which a push sprints. */
export const SPRINT_DEFLECTION = 0.94;
/** Dash: a short dodge along the stick (or forward), invulnerable for DASH_IFRAMES, then a cooldown. */
export const DASH_SPEED = 13;
export const DASH_TIME = 0.17;
export const DASH_IFRAMES = 0.32;
export const DASH_COOLDOWN = 1.1;
/** Sonar: the lantern pulse (radius m), how long the finds show through rock (s), and its cooldown (s). */
export const SONAR_RADIUS = 26;
export const SONAR_REVEAL = 2;
export const SONAR_COOLDOWN = 8;
/** Mining tempo: the base swing interval multiplier, and the vein combo (each chained block of the
 * same kind within COMBO_WINDOW s and COMBO_REACH m speeds the next swing up, to COMBO_MAX). */
export const MINE_TEMPO = 0.8;
export const COMBO_WINDOW = 2.6;
export const COMBO_REACH = 3.2;
export const COMBO_STEP = 0.14;
export const COMBO_MAX = 5;
/** Climbing a ladder or rope (m/s). */
export const CLIMB_SPEED = 3.2;
/** How far (m) the Place action reaches from the eye. */
export const PLACE_REACH = 4.5;
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
