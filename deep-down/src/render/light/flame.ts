// The lantern flame (W1-LEAD §4.9): a ±3 % flicker on intensity and a 2–4 cm source wobble so shadows breathe slightly.
// Never a strobe: the signal is a sum of slow incommensurate sines (≤ 2.3 Hz), smooth in time, deterministic in t.
// Pure (no Three.js) so tests bound it exactly.

/** The lantern's radiance scale: a mid stone face (albedo 0.4) at 1.5 m reads 0.62–0.75 display (SPEC §8.3; model.ts). */
export const LANTERN_GAIN = 7.0;
/** The lantern's inverse-square soft radius (m): steep enough that the pool reads as a pool (the spike's 1.0). */
export const LANTERN_SOFT = 1.1;

/** The flicker amplitude (fraction of intensity) and the wobble amplitude (metres). */
export const FLAME = {
  flicker: 0.03,
  wobble: 0.025,
  /** The highest frequency in the signal (Hz). */
  maxHz: 2.3,
} as const;

const F = [0.37, 0.91, 1.53, 2.3];
const A = [0.42, 0.3, 0.18, 0.1];
const PH = [0.0, 1.7, 4.1, 2.6];

/** Flicker multiplier at time t (s): 1 ± FLAME.flicker, smooth. */
export function flicker(t: number, amount: number = FLAME.flicker): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += A[i] * Math.sin(2 * Math.PI * F[i] * t + PH[i]);
  // Σ|A| = 1, so s ∈ [-1, 1].
  return 1 + amount * s;
}

/** The flame's wobble offset (metres) at time t, written into out[0..2]; |offset| ≤ FLAME.wobble. */
export function wobble(t: number, out: number[] | Float32Array, amount: number = FLAME.wobble): void {
  const x = 0.55 * Math.sin(2 * Math.PI * 0.29 * t + 0.4) + 0.45 * Math.sin(2 * Math.PI * 0.83 * t + 2.2);
  const y = 0.6 * Math.sin(2 * Math.PI * 0.41 * t + 1.1) + 0.4 * Math.sin(2 * Math.PI * 1.17 * t + 0.3);
  const z = 0.55 * Math.sin(2 * Math.PI * 0.33 * t + 3.0) + 0.45 * Math.sin(2 * Math.PI * 0.97 * t + 5.1);
  // Each axis is in [-1, 1]; scale so the vector length never exceeds `amount`.
  const k = amount / Math.sqrt(3);
  out[0] = x * k;
  out[1] = y * k;
  out[2] = z * k;
}
