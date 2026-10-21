// The per-chamber ambient probe (W1-LEAD §4.3): L1 spherical harmonics stored as irradiance, so the shader evaluates
// E(n) = c0 + c1·n.x + c2·n.y + c3·n.z (four vec3). Built from the biome's fill: a sky/ground hemisphere (exact in L1)
// plus soft directional lobes (the far opening's accent, a sky shaft's bounce). Pure (no Three.js).

export type Rgb = [number, number, number];

/** Irradiance coefficients [c0, cx, cy, cz], each RGB. */
export type ShIrradiance = [Rgb, Rgb, Rgb, Rgb];

export function shZero(): ShIrradiance {
  return [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
}

/** A hemisphere: `sky` irradiance on an up-facing surface, `ground` on a down-facing one (linear in n.y: exact). */
export function shAddHemisphere(sh: ShIrradiance, sky: Rgb, ground: Rgb): ShIrradiance {
  for (let i = 0; i < 3; i++) {
    sh[0][i] += 0.5 * (sky[i] + ground[i]);
    sh[2][i] += 0.5 * (sky[i] - ground[i]);
  }
  return sh;
}

/**
 * A distant light from direction `dir` (toward the light, unit) with irradiance `c` at normal incidence, convolved to
 * L1: E(n) ≈ c·(0.25 + 0.5·dir·n) (the clamped cosine's first two bands; never negative on the lit side).
 */
export function shAddDirectional(sh: ShIrradiance, dir: Rgb, c: Rgb): ShIrradiance {
  const l = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d: Rgb = [dir[0] / l, dir[1] / l, dir[2] / l];
  for (let i = 0; i < 3; i++) {
    sh[0][i] += 0.25 * c[i];
    sh[1][i] += 0.5 * c[i] * d[0];
    sh[2][i] += 0.5 * c[i] * d[1];
    sh[3][i] += 0.5 * c[i] * d[2];
  }
  return sh;
}

/** Evaluate E(n), clamped at 0 (as the shader does). */
export function shEval(sh: ShIrradiance, n: Rgb): Rgb {
  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) out[i] = Math.max(0, sh[0][i] + sh[1][i] * n[0] + sh[2][i] * n[1] + sh[3][i] * n[2]);
  return out;
}

/** The lowest irradiance over all directions (≥ 0): the probe's floor, for the "darks stay hued" check. */
export function shMin(sh: ShIrradiance): Rgb {
  const out: Rgb = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const g = Math.hypot(sh[1][i], sh[2][i], sh[3][i]);
    out[i] = Math.max(0, sh[0][i] - g);
  }
  return out;
}
