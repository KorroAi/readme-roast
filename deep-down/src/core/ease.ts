// Eases (SPEC §10.4). `cubicBezier` evaluates a CSS cubic-bezier by Newton-Raphson (4 iterations) with a
// bisection fallback, to within 1e-3 of the browser, so the DOM, the FX canvas and the shaders agree.
// Pure, allocation-free once built.

export type Ease = (t: number) => number;

/** A CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress t ∈ [0, 1]. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  // Polynomial coefficients of x(u) and y(u) for the curve P0 = 0, P3 = 1.
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sy = (u: number) => ((ay * u + by) * u + cy) * u;
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  const solve = (x: number): number => {
    let u = x;
    for (let i = 0; i < 4; i++) {
      const err = sx(u) - x;
      if (Math.abs(err) < 1e-6) return u;
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u -= err / d;
    }
    // Bisection fallback (flat derivative or a slow Newton).
    let lo = 0;
    let hi = 1;
    u = x;
    if (u < lo) return lo;
    if (u > hi) return hi;
    for (let i = 0; i < 30; i++) {
      const v = sx(u);
      if (Math.abs(v - x) < 1e-6) return u;
      if (x > v) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return u;
  };
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sy(solve(t));
  };
}

/** The named curves of SPEC §10.4, as [x1, y1, x2, y2]. */
export const BEZIER = {
  enter: [0.2, 0.7, 0.2, 1],
  exit: [0.4, 0, 1, 1],
  standard: [0.4, 0, 0.2, 1],
  outQuad: [0.5, 1, 0.89, 1],
  outCubic: [0.33, 1, 0.68, 1],
  outQuart: [0.25, 1, 0.5, 1],
  outQuint: [0.22, 1, 0.36, 1],
  outExpo: [0.16, 1, 0.3, 1],
  outBack: [0.34, 1.56, 0.64, 1],
  inQuad: [0.11, 0, 0.5, 0],
  inCubic: [0.32, 0, 0.67, 0],
  inOutCubic: [0.65, 0, 0.35, 1],
  inOutSine: [0.37, 0, 0.63, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type EaseName = keyof typeof BEZIER;

/** Every named ease as a function. */
export const EASE: Record<EaseName, Ease> = Object.fromEntries(
  (Object.keys(BEZIER) as EaseName[]).map((k) => {
    const [a, b, c, d] = BEZIER[k];
    return [k, cubicBezier(a, b, c, d)];
  }),
) as Record<EaseName, Ease>;

/** The CSS string of a named ease. */
export const cssEase = (name: EaseName): string => `cubic-bezier(${BEZIER[name].join(', ')})`;

export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Linear interpolation. */
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
