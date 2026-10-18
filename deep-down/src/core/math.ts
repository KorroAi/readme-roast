// Small, allocation-free math helpers shared by every system.

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const saturate = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number): number => (b === a ? 0 : (v - a) / (b - a));

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Frame-rate independent exponential approach. `rate` is in 1/seconds. */
export const damp = (current: number, target: number, rate: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-rate * dt));

/** Shortest signed angular difference b - a, in radians, within [-PI, PI]. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export const dampAngle = (current: number, target: number, rate: number, dt: number): number =>
  current + angleDelta(current, target) * (1 - Math.exp(-rate * dt));

/** 32-bit integer hash (lowbias32). Deterministic across platforms. */
export function hash32(x: number): number {
  x |= 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Hash of integer lattice coordinates + seed, returned in [0, 1). */
export function hash3(x: number, y: number, z: number, seed = 0): number {
  const h = hash32(x * 0x1f1f1f1f + hash32(y * 0x5bd1e995 + hash32(z * 0x27d4eb2d + seed)));
  return h / 4294967296;
}

export function hash2(x: number, y: number, seed = 0): number {
  return hash32(x * 0x1f1f1f1f + hash32(y * 0x5bd1e995 + seed)) / 4294967296;
}

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export const dist3 = (ax: number, ay: number, az: number, bx: number, by: number, bz: number): number =>
  Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (ay - by) + (az - bz) * (az - bz));

/** sRGB hex color to linear float components. */
export function hexToLinear(hex: number): [number, number, number] {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [c((hex >> 16) & 255), c((hex >> 8) & 255), c(hex & 255)];
}

export function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
