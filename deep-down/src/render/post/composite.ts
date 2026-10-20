/**
 * The composite's maths in plain TypeScript (owner 2D), line for line with the GLSL in PostFX.ts, so the
 * kernels are unit-tested (composite.test.ts): the Catmull-Rom upsample weights, the contrast-adaptive
 * sharpening weight, the octagon iris mask and the portrait vignette. Pure.
 */

/** Catmull-Rom weights of the 4 taps around a fractional position f in [0, 1) (they sum to 1). */
export function catmullRomWeights(f: number): [number, number, number, number] {
  const w0 = f * (-0.5 + f * (1 - 0.5 * f));
  const w1 = 1 + f * f * (-2.5 + 1.5 * f);
  const w2 = f * (0.5 + f * (2 - 1.5 * f));
  const w3 = f * f * (-0.5 + 0.5 * f);
  return [w0, w1, w2, w3];
}

/**
 * The 5-tap Catmull-Rom (the 9-tap bilinear form without its 4 corners): weights of the centre cross, in
 * the order (top, left, centre, right, bottom), normalised to sum to 1.
 */
export function catmullRom5(fx: number, fy: number): [number, number, number, number, number] {
  const x = catmullRomWeights(fx);
  const y = catmullRomWeights(fy);
  const x12 = x[1] + x[2];
  const y12 = y[1] + y[2];
  const w = [x12 * y[0], x[0] * y12, x12 * y12, x[3] * y12, x12 * y[3]];
  const s = w[0] + w[1] + w[2] + w[3] + w[4];
  return [w[0] / s, w[1] / s, w[2] / s, w[3] / s, w[4] / s];
}

/**
 * Contrast-adaptive sharpening (AMD FidelityFX CAS, the cross form): from the min and max luminance of the
 * centre and its 4 neighbours, the (negative) weight of each neighbour. Flat or already-contrasted regions
 * get little; soft detail gets the most. `sharpness` 0..1.
 */
export function casWeight(mn: number, mx: number, sharpness: number): number {
  const amp = Math.sqrt(Math.min(1, Math.max(0, Math.min(mn, 1 - mx) / Math.max(mx, 1e-5))));
  const peak = -1 / (8 - 3 * sharpness);
  return amp * peak;
}

/** CAS on a centre value and its 4 neighbours (the GLSL applies it per channel with the luma weight). */
export function casApply(c: number, n: [number, number, number, number], sharpness: number): number {
  const mn = Math.min(c, ...n);
  const mx = Math.max(c, ...n);
  const w = casWeight(mn, mx, sharpness);
  return (c + (n[0] + n[1] + n[2] + n[3]) * w) / (1 + 4 * w);
}

/** Octagon distance (screen heights): max(|x|, |y|, (|x| + |y|) / √2). */
export function octagon(x: number, y: number): number {
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  return Math.max(ax, ay, (ax + ay) * Math.SQRT1_2);
}

/**
 * The iris (Rekindle): 1 inside the octagon of `radius` screen heights around the centre (UV, y up), 0
 * outside, with a soft edge of `edge` screen heights. aspect = width / height.
 */
export function irisMask(u: number, v: number, cx: number, cy: number, radius: number, aspect: number, edge = 0.004): number {
  if (radius >= 1.5) return 1;
  const d = octagon((u - cx) * aspect, v - cy);
  const t = Math.min(1, Math.max(0, (radius - d) / edge));
  return t * t * (3 - 2 * t);
}

/** The portrait vignette's darkening at a UV (top 0.30, bottom 0.25, sides 0.10 at strength 0.25). */
export function vignette(u: number, v: number, strength: number): number {
  const s = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const top = s(0.62, 1.0, v) * 0.3;
  const bottom = s(0.38, 0.0, v) * 0.25;
  const sides = s(0.32, 0.5, Math.abs(u - 0.5)) * 0.1;
  return Math.min(1, (top + bottom + sides) * (strength / 0.25));
}
