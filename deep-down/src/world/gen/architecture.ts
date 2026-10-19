/**
 * Shapes of the builders' architecture shared by the generator (which writes their collision
 * cells) and the structure meshes (render/structures), so collision and mesh agree. Pure
 * functions of the spec; world metres.
 */

/** Height of a stair flight's parapet coping above its walking plane (render/structures/stairs.ts). */
export const STAIR_COPING = 1.15;
/** Height of the bridge's newels above its walk (render/structures/bridge.ts). */
export const BRIDGE_NEWEL = 2.0;

/** Hash of two ints to [0, 1). */
export function hash01(a: number, b: number, seed: number): number {
  let h = Math.imul(a | 0, 0x8da6b343) ^ Math.imul(b | 0, 0xd8163841) ^ Math.imul(seed | 0, 0xcb1ab31f);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Smooth 1D value noise in [-1, 1] (period-free), for chipped edges and fracture surfaces. */
export function noise1(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  const a = hash01(i, 7, seed) * 2 - 1;
  const b = hash01(i + 1, 7, seed) * 2 - 1;
  return a + (b - a) * u;
}

// ---------------------------------------------------------------------------------------------
// Columns. A column stands on the floor at y (the floor's top). Vertical layout above it:
//   plinth  y .. y + 1                 square, half-size R + PLINTH_OUT
//   base    y + 1 .. y + BASE_TOP      torus, scotia, torus (attic base)
//   shaft   y + BASE_TOP .. neck       drums with entasis
//   capital neck .. abacus             necking ring and a flaring echinus
//   abacus  abacus .. top + ABACUS_UP  square slab into the rock (full columns)

export const PLINTH_OUT = 0.62;
export const BASE_TOP = 1.95;
/** Height of the capital (necking + echinus) under the abacus. */
export const CAPITAL_H = 1.7;
/** Thickness of the abacus below the rock it meets. */
export const ABACUS_H = 1.1;

export interface ColumnShape {
  y: number;
  radius: number;
  /** Full: the last open cell under the rock; broken / stump: the height of the break. */
  top: number;
  state: 'full' | 'broken' | 'stump';
  seed: number;
}

/** Bottom of the capital's necking (full columns). */
export function columnNeck(c: ColumnShape): number {
  return c.top + 1 - ABACUS_H - CAPITAL_H;
}

/** Shaft radius at height y (entasis: a slight swell low on the shaft and a 12 % taper). */
export function shaftRadius(c: ColumnShape, y: number): number {
  const y0 = c.y + BASE_TOP;
  const y1 = c.state === 'full' ? columnNeck(c) : Math.max(y0 + 4, c.y + 30);
  const t = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0)));
  return c.radius * (1 - 0.12 * t + 0.035 * Math.sin(Math.PI * Math.min(1, t * 1.6)));
}

/** Height of the fracture of a broken shaft over the point (x, z) relative to its axis. */
export function fractureHeight(c: ColumnShape, dx: number, dz: number): number {
  const a = hash01(1, 2, c.seed) * Math.PI * 2;
  const slope = c.state === 'stump' ? 0.35 : 0.55;
  const along = (dx * Math.cos(a) + dz * Math.sin(a)) / c.radius;
  const ang = Math.atan2(dz, dx);
  const r = Math.hypot(dx, dz) / c.radius;
  // A conchoidal break: a slanting plane, a ridge where the halves tore apart, broken lips.
  const ridge = 0.35 * Math.exp(-((along + 0.15) ** 2) * 6);
  const p1 = hash01(3, 4, c.seed) * 6.283;
  const p2 = hash01(5, 6, c.seed) * 6.283;
  const rough = 0.22 * r * (0.6 * Math.sin(ang * 3 + p1) + 0.4 * Math.sin(ang * 5 + p2)) + 0.12 * noise1(r * 4 + 2, c.seed + 5);
  return c.top + along * slope * c.radius * 0.75 + ridge + rough;
}

/** Half-size of a column's square plinth and abacus (whole metres: their collision is exact). */
export function plinthHalf(radius: number): number {
  return Math.round(radius + 1.05);
}

/** Largest radius of a full column's capital (the echinus under the abacus). */
export function echinusRadius(radius: number): number {
  return radius + 0.8;
}

/** Radius of the column's outline at height y (base, shaft, capital), for its collision. */
export function columnOutline(c: ColumnShape, y: number): number {
  if (y < c.y + 1) return plinthHalf(c.radius);
  if (y < c.y + BASE_TOP) return c.radius + 0.42;
  if (c.state !== 'full') return shaftRadius(c, y);
  const neck = columnNeck(c);
  if (y < neck) return shaftRadius(c, y);
  const t = Math.max(0, Math.min(1, (y - neck) / CAPITAL_H));
  const rn = shaftRadius(c, neck);
  return rn + (echinusRadius(c.radius) - rn) * t * t;
}

// ---------------------------------------------------------------------------------------------
// The bridge: a segmental arch over the chasm from zA to zB, springing at `spring`, its intrados
// rising to `crown` at mid-span.

export interface ArchShape {
  zA: number;
  zB: number;
  spring: number;
  crown: number;
}

/** Circle of the arch's intrados: centre height and radius. */
export function archCircle(a: ArchShape): { zc: number; yc: number; r: number } {
  const half = (a.zB - a.zA) / 2;
  const rise = a.crown - a.spring;
  const r = (half * half + rise * rise) / (2 * rise);
  return { zc: (a.zA + a.zB) / 2, yc: a.crown - r, r };
}

/** Height of the intrados over z (below the springing outside the span: the abutments). */
export function bridgeIntrados(a: ArchShape, z: number): number {
  const { zc, yc, r } = archCircle(a);
  const d = z - zc;
  if (Math.abs(d) >= (a.zB - a.zA) / 2) return a.spring - 40;
  return yc + Math.sqrt(r * r - d * d);
}
