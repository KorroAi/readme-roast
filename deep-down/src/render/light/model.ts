// The light model in plain TypeScript (owner 1E), line for line with the GLSL of chunk.ts, so its calibration is
// unit-tested in Node: the lantern's falloff and tint, the wrapped Burley diffuse, GGX, the display value of a face
// through AgX and sRGB. Pure.

import { agxDisplay } from './tonemap';
import { LANTERN_GAIN, LANTERN_SOFT } from './flame';

export type V3 = [number, number, number];

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const linearToSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const hexLinear = (hex: number): V3 => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
export const luma = (c: V3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** L_lanternAtt: soft inverse square times a smooth window at the range. */
export function lanternAtt(d: number, range = 9, soft = LANTERN_SOFT): number {
  const att = 1 / (1 + (d * d) / (soft * soft));
  const w = Math.min(1, Math.max(0, 1 - Math.pow(d / Math.max(range, 0.5), 4)));
  return att * w * w;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** L_lanternTint: the core (#ffe6c6 × gain) deepening to amber (#ffb35c) with distance, luminance kept. */
export function lanternRadiance(d: number, intensity = 1, range = 9): V3 {
  const core = hexLinear(0xffe6c6).map((v) => v * LANTERN_GAIN * intensity) as V3;
  const deep = hexLinear(0xffb35c);
  const k = luma(core) / luma(deep);
  const t = smooth(0.35, 2.6, d);
  const a = lanternAtt(d, range);
  return [0, 1, 2].map((i) => (core[i] * (1 - t) + deep[i] * k * t) * a) as V3;
}

/** The energy-conserving wrapped Lambert of L_direct (wrap 0.35 for stone). */
export function wrapLambert(nl: number, wrap = 0.35): number {
  return Math.min(1, Math.max(0, (nl + wrap) / ((1 + wrap) * (1 + wrap))));
}

/** Burley's retro-reflective diffuse factor. */
export function burley(nv: number, nl: number, lh: number, rough: number): number {
  const f90 = 0.5 + 2 * rough * lh * lh;
  return (1 + (f90 - 1) * Math.pow(1 - nl, 5)) * (1 + (f90 - 1) * Math.pow(1 - nv, 5));
}

/** GGX normal distribution. */
export function ggxD(nh: number, a: number): number {
  const a2 = a * a;
  const d = nh * nh * (a2 - 1) + 1;
  return a2 / (Math.PI * d * d);
}

/**
 * The diffuse radiance of a dielectric face lit head-on by the lantern at distance d (viewed head-on, the lantern
 * beside the eye), plus an ambient irradiance `amb` × albedo.
 */
export function faceRadiance(albedo: number, d: number, rough = 0.85, amb = 0): V3 {
  const Li = lanternRadiance(d);
  const F = 0.04;
  const diff = albedo * (1 - F) * burley(1, 1, 1, rough) * wrapLambert(1);
  return [0, 1, 2].map((i) => diff * Li[i] + albedo * amb) as V3;
}

/** Display value (the luma of the encoded output, 0..1) of a linear HDR colour through exposure and AgX. */
export function displayValue(rgb: V3, exposure = 1): number {
  return luma(agxDisplay([rgb[0] * exposure, rgb[1] * exposure, rgb[2] * exposure]));
}
