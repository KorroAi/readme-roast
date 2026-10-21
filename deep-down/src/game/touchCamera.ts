import { dampAngle } from '../core/math';

/**
 * Touch camera follow. On a phone the right thumb is busy mining, so walking sideways with the
 * joystick gently swings the camera round behind the explorer and a corner can be taken with the
 * left thumb alone. It waits until the look thumb has been still for a moment, never runs while
 * mining, and ignores walking back toward the camera (following that would spin the view).
 */

/** Follow rate (1/s) at full sideways input. Holding the stick fully right circles in about 10 s. */
export const FOLLOW_RATE = 0.4;
/** Seconds the look thumb must have been still before the camera follows again. */
export const FOLLOW_LOOK_IDLE_S = 0.8;
/** Smallest stick deflection that counts as walking. */
const MIN_STICK = 0.3;

/**
 * @param camYaw  camera yaw (the camera looks along the body when camYaw = bodyYaw + PI)
 * @param bodyYaw the explorer's facing
 * @param mx      stick x (right +), camera-relative
 * @param my      stick y (forward +), camera-relative
 * @returns the new camera yaw
 */
export function followYaw(camYaw: number, bodyYaw: number, mx: number, my: number, dt: number): number {
  const m = Math.hypot(mx, my);
  if (m < MIN_STICK || my < -0.25 * m) return camYaw;
  const side = Math.abs(mx) / m;
  return dampAngle(camYaw, bodyYaw + Math.PI, FOLLOW_RATE * side * Math.min(1, m), dt);
}
