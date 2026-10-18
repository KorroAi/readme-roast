import * as THREE from 'three';
import { VoxBuilder } from '../../render/voxModel';
import { pickaxeForTier } from '../../config/balance';
import { CLOTH, COPPER, IRON, LEATHER, ROPE, RUST, WOOD } from '../../render/props/palette';
import { Layers, buildLantern, buildPickaxe, disc, ring, shade, type LanternShape, type LanternStyle, type PickaxeStyle } from '../../render/props/shapes';

/**
 * Geometry for the explorer's rigid parts, each built in its own joint frame (the joint pivot is
 * the origin). Proportions are chunky: a 0.42 m head on a 1.72 m body, big boots, a big pack.
 */

/** Joint layout in meters (feet at y = 0, facing +Z, the explorer's left is +X). */
export const RIG = {
  /** Hip joint height; the hips pivot. */
  hipY: 0.8,
  /** Half the distance between the thigh pivots. */
  hipX: 0.1,
  thigh: 0.38,
  shin: 0.42,
  /** Hips pivot to torso pivot. */
  waist: 0.1,
  /** Torso pivot to head pivot. */
  neck: 0.4,
  shoulderX: 0.275,
  shoulderY: 0.32,
  upperArm: 0.27,
  /** Elbow to the center of the grip. */
  forearm: 0.27,
  packY: 0.36,
  packZ: -0.13,
} as const;

const SKIN = 0xe3b48d;
const SKIN_SHADE = 0xc9966f;
const BLUSH = 0xe39c84;
const EYE = 0x1d1a1a;
const EYE_SHINE = 0xf4f1ea;
const MOUTH = 0x8f5a4a;
const HAIR = 0x3e2a1c;
const HOOD = 0x6b4a30;
const HOOD_LIGHT = 0x86603e;
const HOOD_DARK = 0x553a26;
const TROUSERS = 0x2f333d;
const TROUSERS_DARK = 0x262a32;
const TROUSERS_PATCH = 0x3d4350;
const BOOT = 0x5a3c26;
const BOOT_LIGHT = 0x7a5636;
const BOOT_SOLE = 0x2a1d14;

export function buildHips(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.19, -0.07, -0.115, 0.19, 0.12, 0.115, TROUSERS);
  // Leather belt with a copper buckle, a pouch on the right hip and a canteen on the left.
  b.box(-0.2, 0.05, -0.125, 0.2, 0.12, 0.125, LEATHER.mid);
  b.box(-0.042, 0.052, 0.125, 0.042, 0.118, 0.136, COPPER.light);
  b.box(-0.022, 0.07, 0.136, 0.022, 0.1, 0.139, LEATHER.dark);
  b.box(-0.26, -0.07, -0.06, -0.2, 0.07, 0.07, LEATHER.light);
  b.box(-0.265, 0.02, -0.065, -0.2, 0.08, 0.075, LEATHER.mid);
  b.box(0.2, -0.08, -0.09, 0.25, 0.06, 0.01, IRON.light);
  b.box(0.205, 0.06, -0.06, 0.245, 0.085, -0.02, IRON.dark);
  return b.build();
}

export function buildTorso(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.21, 0, -0.13, 0.21, 0.38, 0.13, CLOTH.cream);
  b.box(-0.205, -0.03, -0.125, 0.205, 0.05, 0.125, CLOTH.creamDark);
  // Placket with buttons.
  b.box(-0.016, 0.06, 0.13, 0.016, 0.33, 0.136, CLOTH.creamDark);
  for (const y of [0.12, 0.2, 0.28]) b.box(-0.01, y, 0.136, 0.01, y + 0.02, 0.14, LEATHER.dark);
  // Pack straps over the chest, joined by a chest strap.
  for (const x of [-0.12, 0.12]) b.box(x - 0.028, 0.04, 0.13, x + 0.028, 0.36, 0.144, LEATHER.dark);
  b.box(-0.13, 0.21, 0.144, 0.13, 0.24, 0.15, LEATHER.mid);
  b.box(-0.022, 0.205, 0.15, 0.022, 0.245, 0.156, COPPER.light);
  // Hood cowl draped around the neck and shoulders.
  b.box(-0.2, 0.33, -0.15, 0.2, 0.43, 0.15, HOOD);
  b.box(-0.17, 0.3, 0.1, 0.17, 0.34, 0.155, HOOD_DARK);
  return b.build();
}

export function buildHead(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.19, 0, -0.19, 0.19, 0.38, 0.19, SKIN);
  // Hood: crown, sides and back with a lighter rim around the face and a drooping tip.
  b.box(-0.215, 0.3, -0.215, 0.215, 0.42, 0.215, HOOD);
  b.box(-0.215, 0.02, -0.215, -0.15, 0.3, 0.215, HOOD);
  b.box(0.15, 0.02, -0.215, 0.215, 0.3, 0.215, HOOD);
  b.box(-0.215, 0, -0.215, 0.215, 0.3, -0.12, HOOD);
  b.box(-0.215, 0.02, 0.215, -0.15, 0.32, 0.224, HOOD_LIGHT);
  b.box(0.15, 0.02, 0.215, 0.215, 0.32, 0.224, HOOD_LIGHT);
  b.box(-0.15, 0.285, 0.215, 0.15, 0.32, 0.224, HOOD_LIGHT);
  b.box(-0.08, 0.24, -0.27, 0.08, 0.38, -0.21, HOOD_DARK);
  b.box(-0.05, 0.18, -0.29, 0.05, 0.26, -0.24, HOOD_DARK);
  // Hair fringe with a ragged edge.
  b.box(-0.15, 0.245, 0.19, 0.15, 0.285, 0.205, HAIR);
  b.box(-0.15, 0.215, 0.19, -0.09, 0.245, 0.205, HAIR);
  b.box(0.0, 0.225, 0.19, 0.07, 0.245, 0.205, HAIR);
  b.box(0.11, 0.2, 0.19, 0.15, 0.245, 0.205, HAIR);
  // Face: eyes with a highlight, brows, nose, mouth and a little blush.
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? 0.045 : -0.1;
    b.box(x0, 0.115, 0.19, x0 + 0.055, 0.185, 0.2, EYE);
    const hx = sx > 0 ? x0 + 0.033 : x0 + 0.004;
    b.box(hx, 0.162, 0.2, hx + 0.018, 0.18, 0.203, EYE_SHINE);
    b.box(x0 - 0.008, 0.198, 0.19, x0 + 0.06, 0.214, 0.201, HAIR);
    b.box(sx > 0 ? 0.105 : -0.14, 0.075, 0.19, sx > 0 ? 0.14 : -0.105, 0.1, 0.194, BLUSH);
  }
  b.box(-0.022, 0.08, 0.19, 0.022, 0.125, 0.214, SKIN_SHADE);
  b.box(-0.036, 0.045, 0.19, 0.036, 0.058, 0.197, MOUTH);
  return b.build();
}

export function buildPack(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // Main bag, darker base, leather top flap with copper buckles.
  b.box(-0.22, -0.5, -0.3, 0.22, 0.06, 0, CLOTH.canvas);
  b.box(-0.225, -0.5, -0.305, 0.225, -0.42, 0.0, CLOTH.canvasDark);
  b.box(-0.23, -0.02, -0.315, 0.23, 0.08, 0.005, LEATHER.mid);
  b.box(-0.2, -0.24, -0.315, 0.2, -0.02, -0.3, LEATHER.mid);
  for (const x of [-0.1, 0.1]) {
    b.box(x - 0.02, -0.38, -0.312, x + 0.02, -0.2, -0.3, LEATHER.dark);
    b.box(x - 0.026, -0.235, -0.322, x + 0.026, -0.19, -0.315, COPPER.light);
  }
  // Outer pocket and side pockets.
  b.box(-0.14, -0.45, -0.345, 0.14, -0.27, -0.3, CLOTH.canvasDark);
  b.box(-0.145, -0.31, -0.35, 0.145, -0.26, -0.3, LEATHER.mid);
  for (const sx of [-1, 1]) b.box(sx > 0 ? 0.22 : -0.27, -0.44, -0.24, sx > 0 ? 0.27 : -0.22, -0.16, -0.06, CLOTH.canvasDark);
  // Bedroll strapped across the top.
  b.push().translate(0, 0.16, -0.15).rotateZ(Math.PI / 2);
  disc(b, 0.1, -0.3, 0.3, CLOTH.red);
  disc(b, 0.075, -0.31, -0.3, CLOTH.cream);
  disc(b, 0.075, 0.3, 0.31, CLOTH.cream);
  disc(b, 0.03, -0.315, -0.31, CLOTH.redDark);
  disc(b, 0.03, 0.31, 0.315, CLOTH.redDark);
  disc(b, 0.106, -0.19, -0.15, LEATHER.dark);
  disc(b, 0.106, 0.15, 0.19, LEATHER.dark);
  b.pop();
  // A frying pan hangs on the left side, a coil of rope on the right.
  b.push().translate(0.29, -0.32, -0.15).rotateZ(Math.PI / 2);
  disc(b, 0.1, -0.018, 0.018, IRON.dark);
  disc(b, 0.075, -0.024, -0.018, IRON.mid);
  b.pop();
  b.box(0.276, -0.23, -0.163, 0.3, -0.04, -0.137, WOOD.mid);
  b.push().translate(-0.285, -0.3, -0.15).rotateZ(Math.PI / 2);
  ring(b, { sides: 10, radius: 0.085, thickness: 0.035, y0: -0.022, y1: 0.022, color: (i) => (i % 2 ? ROPE.mid : ROPE.light) });
  b.pop();
  return b.build();
}

export function buildUpperArm(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.065, -0.22, -0.068, 0.065, 0.05, 0.068, CLOTH.cream);
  b.box(-0.07, -0.27, -0.073, 0.07, -0.2, 0.073, CLOTH.creamDark);
  return b.build();
}

export function buildForearm(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.056, -0.14, -0.058, 0.056, 0.0, 0.058, SKIN);
  b.box(-0.062, -0.22, -0.064, 0.062, -0.13, 0.064, LEATHER.mid);
  // Gloved fist around the grip point (0, -forearm, 0), thumb on the forward side.
  b.box(-0.06, -0.33, -0.065, 0.06, -0.21, 0.065, LEATHER.dark);
  b.box(-0.035, -0.3, 0.065, 0.035, -0.24, 0.085, LEATHER.dark);
  return b.build();
}

export function buildThigh(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.088, -0.4, -0.1, 0.088, 0.04, 0.1, TROUSERS);
  b.box(-0.062, -0.37, 0.1, 0.062, -0.27, 0.107, TROUSERS_PATCH);
  b.box(-0.09, -0.06, -0.102, 0.09, -0.02, 0.102, TROUSERS_DARK);
  return b.build();
}

export function buildShin(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.085, -0.2, -0.095, 0.085, 0.02, 0.095, TROUSERS);
  // Boot: shaft with a turned-down cuff, a long toe, a dark proud sole and laces.
  b.box(-0.095, -0.36, -0.105, 0.095, -0.18, 0.105, BOOT);
  b.box(-0.1, -0.21, -0.11, 0.1, -0.16, 0.11, BOOT_LIGHT);
  b.box(-0.095, -0.4, -0.105, 0.095, -0.32, 0.19, BOOT);
  b.box(-0.1, -0.42, -0.11, 0.1, -0.395, 0.2, BOOT_SOLE);
  b.box(-0.04, -0.32, 0.105, 0.04, -0.314, 0.17, LEATHER.light);
  return b.build();
}

/** Pickaxe in the right hand: tier 1 is a rusty old pick, tier 2+ a bright copper one. */
export function buildToolPickaxe(tier: number): { geometry: THREE.BufferGeometry; tip: THREE.Vector3 } {
  const head = pickaxeForTier(tier).headColor;
  const style: PickaxeStyle =
    tier <= 1
      ? { head, headDark: RUST.dark, headLight: RUST.light, handle: WOOD.light, grip: LEATHER.dark, rust: RUST.spot }
      : { head, headDark: shade(head, 0.65), headLight: COPPER.shine, handle: WOOD.pale, grip: LEATHER.mid, rust: 0 };
  const b = new VoxBuilder();
  const tip = buildPickaxe(b, style, 0.6);
  return { geometry: b.build(), tip };
}

const LANTERNS: readonly LanternStyle[] = [
  { frame: IRON.mid, frameDark: IRON.dark, trim: IRON.light, size: 0.8, glow: 0.9 },
  { frame: COPPER.mid, frameDark: COPPER.dark, trim: COPPER.light, size: 0.92, glow: 0.95 },
];

/** Hand lantern: tier 1 is a small iron oil lantern, tier 2+ a larger copper lantern. */
export function buildToolLantern(tier: number): { geometry: THREE.BufferGeometry; shape: LanternShape } {
  const b = new VoxBuilder();
  const shape = buildLantern(new Layers(b), LANTERNS[Math.max(0, Math.min(LANTERNS.length - 1, tier - 1))]);
  return { geometry: b.build(), shape };
}
