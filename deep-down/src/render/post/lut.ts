/**
 * The colour grade as a 32^3 LUT (CRITIQUE B12; SPEC §11.3; owner 2D). Pure: no Three.js, no DOM.
 *
 * Domain: the LUT's input is the tone-mapped colour ENCODED TO sRGB (not display-linear, where everything
 * darker than about sRGB 72 would sit between the first two lattice points of a small LUT and the brand's
 * blue-black shadow split would be lost). Its output is the graded colour, also sRGB-encoded. 32^3 RGBA8 =
 * 128 KB per look; the composite mixes a pair (the two biomes nearest the camera) with two fetches.
 *
 * The base is the W1 grade, baked in (the composite used to compute it per pixel): a contrast S-curve on
 * luminance around display-linear 0.1, a chroma-aware split that sends neutral darks toward a cool blue-black
 * of the same luminance (coloured darks keep their hue, so lamp falloff never turns rose), and an amber lift
 * of the highlights. Each biome look adds on top: a shadow and a highlight balance (from its shadow and
 * highlight tints) and a saturation. The identity look reproduces the base exactly (lut.test.ts).
 */

export const LUT_SIZE = 32;

export interface GradeLook {
  /** Shadow and highlight tints (sRGB hex); a neutral grey is no tint. */
  shadow: number;
  highlight: number;
  /** Saturation multiplier (1 = none). */
  saturation: number;
}

/** The identity look: today's grade, nothing on top. */
export const IDENTITY_LOOK: GradeLook = { shadow: 0x808080, highlight: 0x808080, saturation: 1 };

/**
 * How strongly a look's tints pull the shadows, the mid-tones (the mean of both balances) and the highlights.
 * Strong enough that every biome reads as its own world (V5: ΔE2000 ≥ 8 between neighbours), never a wash:
 * luminance is preserved, so the value plan of the image is untouched.
 */
export const SHADOW_PULL = 0.95;
export const MID_PULL = 0.42;
export const HIGHLIGHT_PULL = 0.55;

const LUMA = [0.2126, 0.7152, 0.0722] as const;
const CONTRAST = 1.3;
const PIVOT = 0.1;

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
export const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const smooth = (e0: number, e1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const hexLin = (hex: number): [number, number, number] => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];

/** The W1 composite's grade on a display-linear colour (the old GLSL, line for line). */
export function baseGrade(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  let lum = r * LUMA[0] + g * LUMA[1] + b * LUMA[2];
  const sl = lum < PIVOT ? PIVOT * (lum / PIVOT) ** CONTRAST : 1 - (1 - PIVOT) * (Math.max(1 - lum, 0) / (1 - PIVOT)) ** CONTRAST;
  const k = sl / Math.max(lum, 1e-5);
  r *= k;
  g *= k;
  b *= k;
  lum = sl;
  const ws = 1 - smooth(0, 0.16, lum);
  const wh = smooth(0.2, 0.75, lum);
  const cmx = Math.max(r, g, b);
  const sat = (cmx - Math.min(r, g, b)) / Math.max(cmx, 1e-5);
  const t = ws * 0.85 * (1 - smooth(0.15, 0.45, sat));
  r += (lum * 0.8 - r) * t;
  g += (lum * 1.01 - g) * t;
  b += (lum * 1.5 - b) * t;
  r *= 1 + (1.07 - 1) * wh * 0.6;
  b *= 1 + (0.86 - 1) * wh * 0.6;
  out[0] = r;
  out[1] = g;
  out[2] = b;
  return out;
}

/** Balance of a tint: its colour divided by its luminance (1, 1, 1 for a neutral). */
function balance(hex: number): [number, number, number] {
  const c = hexLin(hex);
  const l = Math.max(1e-4, c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2]);
  // Clamp the balance so a saturated tint shifts the hue without blowing a channel.
  return [Math.min(2.2, c[0] / l), Math.min(2.2, c[1] / l), Math.min(2.2, c[2] / l)];
}

/** The full grade of one look on a display-linear colour (base + the look on top). */
export function gradeLinear(look: GradeLook, r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  baseGrade(r, g, b, out);
  let [x, y, z] = out;
  const lum = x * LUMA[0] + y * LUMA[1] + z * LUMA[2];
  const s = balance(look.shadow);
  const h = balance(look.highlight);
  const ws = (1 - smooth(0.0, 0.3, lum)) * SHADOW_PULL;
  const wh = smooth(0.3, 0.95, lum) * HIGHLIGHT_PULL;
  const wm = smooth(0.0, 0.25, lum) * (1 - smooth(0.4, 0.9, lum)) * MID_PULL;
  const m0 = (s[0] + h[0]) / 2, m1 = (s[1] + h[1]) / 2, m2 = (s[2] + h[2]) / 2;
  x *= (1 + (s[0] - 1) * ws) * (1 + (h[0] - 1) * wh) * (1 + (m0 - 1) * wm);
  y *= (1 + (s[1] - 1) * ws) * (1 + (h[1] - 1) * wh) * (1 + (m1 - 1) * wm);
  z *= (1 + (s[2] - 1) * ws) * (1 + (h[2] - 1) * wh) * (1 + (m2 - 1) * wm);
  // Keep the luminance the balance moved, then the saturation around it.
  const l2 = x * LUMA[0] + y * LUMA[1] + z * LUMA[2];
  const kl = l2 > 1e-6 ? lum / l2 : 1;
  x *= kl;
  y *= kl;
  z *= kl;
  const sat = look.saturation;
  out[0] = Math.max(0, lum + (x - lum) * sat);
  out[1] = Math.max(0, lum + (y - lum) * sat);
  out[2] = Math.max(0, lum + (z - lum) * sat);
  return out;
}

/** The grade of an sRGB-encoded colour, sRGB-encoded out (what one LUT texel holds). */
export function gradeSrgb(look: GradeLook, r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  gradeLinear(look, srgbToLinear(r), srgbToLinear(g), srgbToLinear(b), out);
  out[0] = Math.min(1, linearToSrgb(Math.min(1, out[0])));
  out[1] = Math.min(1, linearToSrgb(Math.min(1, out[1])));
  out[2] = Math.min(1, linearToSrgb(Math.min(1, out[2])));
  return out;
}

/** Build a look's LUT: RGBA8, r fastest then g then b (a Data3DTexture's layout). Pure and deterministic. */
export function buildLut(look: GradeLook, size = LUT_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  const o = [0, 0, 0];
  let i = 0;
  for (let b = 0; b < size; b++)
    for (let g = 0; g < size; g++)
      for (let r = 0; r < size; r++) {
        gradeSrgb(look, r / (size - 1), g / (size - 1), b / (size - 1), o);
        data[i++] = Math.round(o[0] * 255);
        data[i++] = Math.round(o[1] * 255);
        data[i++] = Math.round(o[2] * 255);
        data[i++] = 255;
      }
  return data;
}

/** Trilinear lookup of an sRGB-encoded colour in a LUT built by buildLut (what the GPU does). */
export function sampleLut(data: Uint8Array, r: number, g: number, b: number, size = LUT_SIZE, out: number[] = [0, 0, 0]): number[] {
  const f = (v: number) => Math.min(size - 1, Math.max(0, v * (size - 1)));
  const x = f(r);
  const y = f(g);
  const z = f(b);
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const x1 = Math.min(size - 1, x0 + 1), y1 = Math.min(size - 1, y0 + 1), z1 = Math.min(size - 1, z0 + 1);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  for (let c = 0; c < 3; c++) {
    const v = (xi: number, yi: number, zi: number) => data[((zi * size + yi) * size + xi) * 4 + c] / 255;
    const c00 = v(x0, y0, z0) * (1 - fx) + v(x1, y0, z0) * fx;
    const c10 = v(x0, y1, z0) * (1 - fx) + v(x1, y1, z0) * fx;
    const c01 = v(x0, y0, z1) * (1 - fx) + v(x1, y0, z1) * fx;
    const c11 = v(x0, y1, z1) * (1 - fx) + v(x1, y1, z1) * fx;
    out[c] = (c00 * (1 - fy) + c10 * fy) * (1 - fz) + (c01 * (1 - fy) + c11 * fy) * fz;
  }
  return out;
}

// ---- Colour science for the tests and the look tools (CIE Lab, ΔE2000) ----

/** sRGB-encoded (0..1) to CIE L*a*b* (D65). */
export function srgbToLab(r: number, g: number, b: number): [number, number, number] {
  const R = srgbToLinear(r), G = srgbToLinear(g), B = srgbToLinear(b);
  let X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  let Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  let Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const fn = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  X = fn(X);
  Y = fn(Y);
  Z = fn(Z);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

/** CIEDE2000 colour difference. */
export function deltaE2000(l1: readonly number[], l2: readonly number[]): number {
  const [L1, a1, b1] = l1;
  const [L2, a2, b2] = l2;
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h = (a: number, b: number) => {
    const v = Math.atan2(b, a) / rad;
    return v < 0 ? v + 360 : v;
  };
  const h1p = h(a1p, b1), h2p = h(a2p, b2);
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lbp = (L1 + L2) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
    else hbp = (h1p + h2p) / 2;
  }
  const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad) + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.2 * Math.cos((4 * hbp - 63) * rad);
  const dTh = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTh * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

/**
 * V5's measure: the mean graded colour (Lab) of a fixed neutral ramp (12 greys from sRGB 0.06 to 0.94)
 * through a look. Consecutive biomes must differ by ΔE2000 ≥ 8.
 */
export function neutralRampLab(look: GradeLook): [number, number, number] {
  let L = 0, A = 0, B = 0;
  const o = [0, 0, 0];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const v = 0.06 + (0.88 * i) / (n - 1);
    gradeSrgb(look, v, v, v, o);
    const lab = srgbToLab(o[0], o[1], o[2]);
    L += lab[0];
    A += lab[1];
    B += lab[2];
  }
  return [L / n, A / n, B / n];
}
