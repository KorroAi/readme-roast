import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { VoxBuilder } from '../voxModel';
import { AMBER } from './palette';

/** One "pixel" of model detail: props and the explorer are built from boxes of 1/16 to 1/4 m. */
export const PX = 1 / 16;

/** Scale an sRGB hex color's brightness. */
export function shade(hex: number, f: number): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (ch((hex >> 16) & 255) << 16) | (ch((hex >> 8) & 255) << 8) | ch(hex & 255);
}

/** Blend two sRGB hex colors. */
export function mixHex(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Random brightness jitter so neighbouring planks, stones and staves never look identical. */
export const vary = (hex: number, rng: Rng, amount = 0.08): number => shade(hex, 1 + (rng.next() * 2 - 1) * amount);

/**
 * Solid and glowing geometry of one model, built in lockstep. Glowing parts get their own
 * geometry so a renderer can animate their emissive strength independently. Passing the same
 * builder twice merges both layers (the explorer uses a single material).
 */
export class Layers {
  readonly solid: VoxBuilder;
  readonly glow: VoxBuilder;

  constructor(solid: VoxBuilder, glow: VoxBuilder = solid) {
    this.solid = solid;
    this.glow = glow;
  }

  private each(fn: (b: VoxBuilder) => void): this {
    fn(this.solid);
    if (this.glow !== this.solid) fn(this.glow);
    return this;
  }

  push(): this {
    return this.each((b) => b.push());
  }

  pop(): this {
    return this.each((b) => b.pop());
  }

  translate(x: number, y: number, z: number): this {
    return this.each((b) => b.translate(x, y, z));
  }

  rotateX(a: number): this {
    return this.each((b) => b.rotateX(a));
  }

  rotateY(a: number): this {
    return this.each((b) => b.rotateY(a));
  }

  rotateZ(a: number): this {
    return this.each((b) => b.rotateZ(a));
  }

  scale(s: number): this {
    return this.each((b) => b.scale(s));
  }
}

export interface RingOptions {
  sides: number;
  /** Distance from the axis to the middle of each segment. */
  radius: number;
  /** Radial thickness of each segment. */
  thickness: number;
  y0: number;
  y1: number;
  color: (i: number) => number;
  /** Rotation of the first segment, in radians. */
  phase?: number;
  emissive?: number;
}

/** Height step between neighbouring ring segments: invisible, but well above depth precision. */
const RING_LIFT = 0.0008;

/**
 * A closed ring of boxes around +Y (barrel staves, hoops, rope turns). Segments are just wide
 * enough at their outer face to close the gaps between neighbours, so neighbours overlap near
 * the inner face; every other segment is a hair taller so those overlaps never share a plane
 * (coplanar faces of different colors would z-fight).
 */
export function ring(b: VoxBuilder, o: RingOptions): void {
  const width = 2 * (o.radius + o.thickness / 2) * Math.tan(Math.PI / o.sides) * 1.02;
  for (let i = 0; i < o.sides; i++) {
    const a = (i / o.sides) * Math.PI * 2 + (o.phase ?? 0);
    // With an odd count the last segment neighbours segment 0 too, so it gets a third height.
    const lift = RING_LIFT * (i % 2 === 1 ? 1 : i === o.sides - 1 ? 2 : 0);
    b.push()
      .rotateY(-a)
      .box(o.radius - o.thickness / 2, o.y0 - lift, -width / 2, o.radius + o.thickness / 2, o.y1 + lift, width / 2, o.color(i), o.emissive ?? 0)
      .pop();
  }
}

/**
 * Octagonal slab centered on the current origin, lying in XZ: two crosses, one turned 45 degrees.
 * Each cross's corners are octagon vertices, so together they fill the octagon exactly.
 */
export function disc(b: VoxBuilder, radius: number, y0: number, y1: number, color: number, emissive = 0): void {
  const h = radius * Math.cos(Math.PI / 8);
  const s = h * Math.tan(Math.PI / 8);
  for (const a of [0, Math.PI / 4]) {
    b.push().rotateY(a);
    b.box(-h, y0, -s, h, y1, s, color, emissive);
    b.box(-s, y0, -h, s, y1, h, color, emissive);
    b.pop();
  }
}

/** Box spanning two points, `w` by `h` in cross-section (`h` along the local up of the beam). */
export function beam(
  b: VoxBuilder,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  w: number,
  h: number,
  color: number,
  emissive = 0,
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return;
  const yaw = Math.atan2(dx, dz);
  const pitch = Math.atan2(dy, Math.hypot(dx, dz));
  b.push()
    .translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)
    .rotateY(yaw)
    .rotateX(-pitch)
    .box(-w / 2, -h / 2, -len / 2, w / 2, h / 2, len / 2, color, emissive)
    .pop();
}

export interface LanternStyle {
  frame: number;
  frameDark: number;
  /** Accent color for the bands and ring. */
  trim: number;
  /** Overall scale: 1 = a 0.34 m tall camp lantern. */
  size: number;
  /** Emissive strength of the glass (the lower half burns hotter). */
  glow: number;
}

export const CAMP_LANTERN: LanternStyle = { frame: 0x4f4a45, frameDark: 0x2c2927, trim: 0x726b63, size: 1, glow: 0.85 };

export interface LanternShape {
  /** Height of the top of the carry ring, where the lantern hangs from. */
  top: number;
  /** Height of the flame center. */
  flameY: number;
}

/**
 * A lantern standing on y = 0 with a carry ring on top. Frame parts go to the solid layer and
 * the glass to the glow layer. Shared by camp lanterns and the explorer's hand lanterns.
 */
export function buildLantern(L: Layers, s: LanternStyle): LanternShape {
  const k = s.size;
  L.push().scale(k);
  const f = L.solid;
  const g = L.glow;
  // Glass: hot near the wick, cooler toward the cap so the flame reads through it.
  g.box(-0.066, 0.03, -0.066, 0.066, 0.115, 0.066, AMBER.hot, s.glow);
  g.box(-0.062, 0.115, -0.062, 0.062, 0.19, 0.062, AMBER.glass, s.glow * 0.82);
  // Base, corner posts, a band around the middle.
  f.box(-0.09, 0, -0.09, 0.09, 0.032, 0.09, s.frameDark);
  f.box(-0.075, 0.032, -0.075, 0.075, 0.042, 0.075, s.frame);
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    f.box(x * 0.074 - 0.016, 0.03, z * 0.074 - 0.016, x * 0.074 + 0.016, 0.195, z * 0.074 + 0.016, s.frame);
  }
  f.box(-0.071, 0.108, -0.071, 0.071, 0.122, 0.071, s.trim);
  // Cap, chimney and carry ring.
  f.box(-0.088, 0.19, -0.088, 0.088, 0.218, 0.088, s.frame);
  f.box(-0.06, 0.218, -0.06, 0.06, 0.245, 0.06, s.frameDark);
  f.box(-0.028, 0.245, -0.028, 0.028, 0.275, 0.028, s.frame);
  f.box(-0.04, 0.27, -0.007, -0.028, 0.33, 0.007, s.trim);
  f.box(0.028, 0.27, -0.007, 0.04, 0.33, 0.007, s.trim);
  f.box(-0.04, 0.32, -0.007, 0.04, 0.334, 0.007, s.trim);
  L.pop();
  return { top: 0.334 * k, flameY: 0.09 * k };
}

export interface PickaxeStyle {
  head: number;
  headDark: number;
  headLight: number;
  handle: number;
  grip: number;
  /** Rust flecks on worn heads; 0 for none. */
  rust: number;
}

/**
 * Pickaxe with the grip at the origin, the handle along +Y and the pick point toward +Z
 * (curving down toward the handle). Returns the pick tip in the pickaxe's local frame.
 */
export function buildPickaxe(b: VoxBuilder, s: PickaxeStyle, length = 0.66): THREE.Vector3 {
  const L = length;
  b.box(-0.021, -0.07, -0.021, 0.021, L, 0.021, s.handle);
  b.box(-0.026, -0.1, -0.026, 0.026, -0.07, 0.026, shade(s.handle, 0.7));
  b.box(-0.026, -0.06, -0.026, 0.026, 0.1, 0.026, s.grip);
  b.box(-0.028, 0.02, -0.028, 0.028, 0.035, 0.028, shade(s.grip, 1.35));
  // Collar around the handle top.
  b.box(-0.036, L - 0.09, -0.042, 0.036, L + 0.03, 0.042, s.headDark);
  // Forward pick, in three segments that curve down and taper to a point.
  const pick = [
    { len: 0.1, w: 0.056, bend: 0, color: s.head },
    { len: 0.09, w: 0.046, bend: 0.18, color: s.head },
    { len: 0.085, w: 0.032, bend: 0.2, color: s.headLight },
  ];
  const m = new THREE.Matrix4().makeTranslation(0, L - 0.025, 0.035);
  const step = new THREE.Matrix4();
  b.push().translate(0, L - 0.025, 0.035);
  for (const seg of pick) {
    b.rotateX(seg.bend);
    m.multiply(step.makeRotationX(seg.bend));
    b.box(-seg.w / 2, -seg.w / 2, 0, seg.w / 2, seg.w / 2, seg.len, seg.color);
    b.translate(0, 0, seg.len);
    m.multiply(step.makeTranslation(0, 0, seg.len));
  }
  b.box(-0.009, -0.009, 0, 0.009, 0.009, 0.03, s.headLight);
  m.multiply(step.makeTranslation(0, 0, 0.03));
  b.pop();
  // Back end: a shorter, blunter pick for balance.
  b.push().translate(0, L - 0.025, -0.035);
  b.box(-0.028, -0.028, -0.09, 0.028, 0.028, 0, s.head);
  b.translate(0, 0, -0.09).rotateX(-0.22);
  b.box(-0.022, -0.022, -0.07, 0.022, 0.022, 0, s.headDark);
  b.pop();
  if (s.rust) {
    b.box(-0.03, L - 0.04, 0.05, 0.03, L - 0.012, 0.075, s.rust);
    b.box(-0.031, L - 0.02, -0.07, 0.031, L + 0.004, -0.05, s.rust);
  }
  return new THREE.Vector3(0, 0, 0).applyMatrix4(m);
}
