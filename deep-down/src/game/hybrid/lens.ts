// The first-person lens (SPEC §3.1): a rectilinear projection with the HORIZONTAL field of view locked at 52°, so the
// visible width at distance d is 0.9755 · d metres on every portrait phone. Ported from v1's `lockedVerticalFov`
// (CameraRig, 9eb4166) without its vertical cap: a portrait frame keeps its full height.

export const DEG = Math.PI / 180;

/** The locked horizontal field of view (degrees). */
export const HFOV_DEG = 52;
/** Eye height above the floor (m) in drifts and chambers; low drifts 1.45; never below 1.2. */
export const EYE_HEIGHT = 1.6;
export const EYE_LOW = 1.45;
export const EYE_MIN = 1.2;
/** The near plane (m). */
export const NEAR = 0.08;
/** Pitches (degrees, + looks up). */
export const PITCH = {
  drift: -8,
  stand: 0,
  standLow: -4,
  standTall: 4,
  wayDown: -20,
  floorSeal: -35,
  sump: -55,
  revealLift: 12,
} as const;

/** Visible width (m) per metre of distance: 2 · tan(hfov / 2) = 0.9755 at 52°. */
export const WIDTH_PER_M = 2 * Math.tan((HFOV_DEG / 2) * DEG);

/** The vertical field of view (degrees) for a viewport aspect (width / height) at the locked horizontal one. */
export function verticalFov(aspect: number, hfov = HFOV_DEG): number {
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  return (2 * Math.atan(Math.tan((hfov / 2) * DEG) / a)) / DEG;
}

/** CSS px per metre at distance `d` on a viewport `widthPx` wide. */
export function pxPerMetre(d: number, widthPx: number, hfov = HFOV_DEG): number {
  return widthPx / (2 * Math.tan((hfov / 2) * DEG) * Math.max(1e-6, d));
}

/** The screen size (CSS px) of an object `size` metres across, facing the camera at distance `d`. */
export function sizePx(size: number, d: number, widthPx: number, hfov = HFOV_DEG): number {
  return size * pxPerMetre(d, widthPx, hfov);
}

/** The nominal face block (SPEC §3.5) and its pixel floors (C7, U-CAM6). */
export const BLOCK_M = 0.8;
export const STANDOFF_M = 3.0;
export const BLOCK_MIN_REST_PX = 92;
export const BLOCK_MIN_MOVING_PX = 86;

/** The largest standoff (m) at which a face block stays at least `minPx` wide on a viewport `widthPx` wide. */
export function maxStandoffFor(minPx: number, widthPx: number, block = BLOCK_M): number {
  return (block * widthPx) / (WIDTH_PER_M * minPx);
}
