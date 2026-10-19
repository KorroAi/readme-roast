import * as THREE from 'three';
import { VoxBuilder } from '../../render/voxModel';
import { pickaxeForTier } from '../../config/balance';
import { AMBER, COPPER, IRON, LEATHER, ROPE, RUST, WOOD } from '../../render/props/palette';
import { Layers, beam, buildLantern, buildPickaxe, disc, ring, shade, type LanternShape, type LanternStyle, type PickaxeStyle } from '../../render/props/shapes';

/**
 * Geometry for the explorer's rigid parts, each built in its own joint frame (the joint pivot is
 * the origin).
 *
 * Design: a delver of the expedition company. Read from behind (the gameplay camera sits over the
 * right shoulder), the silhouette stacks distinct shapes instead of one box: a broad felt brim, a
 * red scarf over an amber-ochre coat, a timber pack frame whose poles rise past the hat with an
 * ember vial swinging from a peg, a rounded olive sack over a cream bedroll, split coat tails that
 * swing with the stride, dark trousers in tall boots. Amber/ochre is the people colour of this
 * world, the scarf is the single strong accent, and nothing is cyan. Corners of the head, hat,
 * sack and bedroll are chamfered with crossed boxes so they read round, not cubic.
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
  /** Coat tail joints at the back of the hips (x is plus or minus tailX), in the hips frame. */
  tailX: 0.095,
  tailY: 0.06,
  tailZ: -0.125,
  /** Length of a coat tail from its joint to the lowest point of the hem. */
  tailLength: 0.44,
  /** Pack frame poles: half the spacing, and their depth in the pack frame. */
  poleX: 0.235,
  poleZ: -0.065,
  /**
   * The peg the ember vial hangs from, in the pack frame: out to the left and back from the left
   * pole, so the vial hangs clear of the brim from behind and behind the head in profile.
   */
  hookX: 0.305,
  hookY: 0.5,
  hookZ: -0.165,
} as const;

const SKIN = 0xe3b48d;
const SKIN_SHADE = 0xc9966f;
const BLUSH = 0xe39c84;
const EYE = 0x1d1a1a;
const EYE_SHINE = 0xf4f1ea;
const MOUTH = 0x8f5a4a;
const HAIR = 0x4a2c1a;
// Waxed-cotton coat in amber ochre: the warm colour of people and safety.
const COAT = 0xa86b33;
const COAT_LIGHT = 0xbd8042;
const COAT_DARK = 0x80522a;
const COAT_HEM = 0x65401f;
const WAISTCOAT = 0x3b302b;
// Knitted scarf: the one strong accent.
const SCARF = 0xa8372a;
const SCARF_DARK = 0x7e271f;
const SCARF_LIGHT = 0xc44c33;
// Felt hat, dark enough to frame the face, light enough to separate from the slate behind it;
// the brim is a shade lighter than the crown so it rings the head from behind.
const HAT = 0x6a4a35;
const HAT_BRIM = 0x7b5a40;
const HAT_BAND = 0x2e2018;
const BRASS = 0xc99a47;
const BRASS_DARK = 0x8a6428;
const LENS = 0x6e4519;
const LENS_SHINE = 0xf0cf8c;
const TROUSERS = 0x2d2c30;
const TROUSERS_PATCH = 0x3b393e;
const BOOT = 0x4a3122;
const BOOT_LIGHT = 0x6b4a31;
const BOOT_SOLE = 0x211710;
// Waxed olive canvas for the load, so it never merges with the ochre coat.
const CANVAS = 0x716a48;
const CANVAS_DARK = 0x575136;
const CANVAS_LIGHT = 0x8a8259;
const WOOL = 0xbcae8c;
const WOOL_DARK = 0x8f8266;
const FRAME = WOOD.end;

/** A block with its four vertical edges chamfered by `c`: two crossed boxes, reads as rounded. */
function chamfer(b: VoxBuilder, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number, color: number): void {
  b.box(x0, y0, z0 + c, x1, y1, z1 - c, color);
  b.box(x0 + c, y0, z0, x1 - c, y1, z1, color);
}

/** A round-ish rod along X (crossed boxes, a chamfered square section of radius `r`). */
function rodX(b: VoxBuilder, x0: number, x1: number, cy: number, cz: number, r: number, color: number): void {
  const s = r * 0.58;
  b.box(x0, cy - s, cz - r, x1, cy + s, cz + r, color);
  b.box(x0, cy - r, cz - s, x1, cy + r, cz + s, color);
}

export function buildHips(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.18, -0.07, -0.11, 0.18, 0.1, 0.11, TROUSERS);
  // The coat's skirts fall over the hips at the sides; the front is cut away and the back is
  // the two tails (their own joints).
  for (const sx of [-1, 1]) b.box(sx > 0 ? 0.17 : -0.212, -0.13, -0.125, sx > 0 ? 0.212 : -0.17, 0.08, 0.1, COAT);
  // Belt over the coat with a brass buckle.
  b.box(-0.2, 0.05, -0.13, 0.2, 0.12, 0.13, LEATHER.dark);
  b.box(-0.04, 0.045, 0.13, 0.04, 0.125, 0.14, BRASS);
  b.box(-0.022, 0.066, 0.14, 0.022, 0.104, 0.144, BRASS_DARK);
  // Tool pouch on the right hip, a brass oil flask for the lantern on the left.
  b.box(-0.27, -0.08, -0.07, -0.212, 0.055, 0.06, LEATHER.mid);
  b.box(-0.276, 0.0, -0.076, -0.208, 0.07, 0.066, LEATHER.light);
  b.box(0.212, -0.09, -0.06, 0.262, 0.035, 0.02, BRASS);
  b.box(0.224, 0.035, -0.036, 0.25, 0.07, -0.004, BRASS_DARK);
  return b.build();
}

/**
 * One coat tail, hanging from its joint (y down, the plate behind the joint along -Z).
 * `side` is +1 for the left tail, -1 for the right; the inner corner hangs lowest, so the pair
 * forms a split, swallow-tailed hem with a vent between them.
 */
export function buildCoatTail(side: number): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // u runs from the inner edge (-) to the outer edge (+).
  const ux = (u0: number, u1: number): [number, number] => (side > 0 ? [u0, u1] : [-u1, -u0]);
  const box = (u0: number, y0: number, z0: number, u1: number, y1: number, z1: number, color: number) => {
    const [x0, x1] = ux(u0, u1);
    b.box(x0, y0, z0, x1, y1, z1, color);
  };
  const len = RIG.tailLength;
  box(-0.085, -len + 0.08, -0.03, 0.088, 0, 0, COAT);
  box(-0.085, -len, -0.03, 0.03, -len + 0.08, 0, COAT);
  // Darker hem, stepped up toward the outer edge.
  box(0.03, -len + 0.065, -0.034, 0.09, -len + 0.095, 0.003, COAT_HEM);
  box(-0.087, -len - 0.004, -0.034, 0.032, -len + 0.028, 0.003, COAT_HEM);
  return b.build();
}

export function buildTorso(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // Coat: a broad chest over a slightly narrower waist, with a lighter double-layer yoke.
  chamfer(b, -0.21, 0.1, -0.13, 0.21, 0.37, 0.13, 0.03, COAT);
  b.box(-0.195, -0.03, -0.125, 0.195, 0.1, 0.125, COAT);
  chamfer(b, -0.2, 0.3, -0.136, 0.2, 0.38, 0.136, 0.03, COAT_LIGHT);
  // Open front over a dark waistcoat with brass buttons, lapels turned back.
  b.box(-0.085, -0.02, 0.13, 0.085, 0.31, 0.14, WAISTCOAT);
  for (const y of [0.06, 0.14, 0.22]) b.box(-0.014, y, 0.14, 0.014, y + 0.028, 0.147, BRASS);
  for (const sx of [-1, 1]) b.box(sx > 0 ? 0.085 : -0.15, 0.16, 0.13, sx > 0 ? 0.15 : -0.085, 0.345, 0.145, COAT_LIGHT);
  // Pack straps over the chest, joined by a chest strap with a buckle.
  for (const x of [-0.13, 0.13]) b.box(x - 0.026, 0.02, 0.13, x + 0.026, 0.375, 0.153, LEATHER.dark);
  b.box(-0.156, 0.19, 0.153, 0.156, 0.222, 0.159, LEATHER.mid);
  b.box(-0.02, 0.185, 0.159, 0.02, 0.227, 0.165, BRASS);
  // Knitted scarf wound thick around the neck, a fold line around it, knotted at the front with
  // two ends hanging down the chest.
  chamfer(b, -0.178, 0.33, -0.153, 0.178, 0.445, 0.158, 0.032, SCARF);
  b.box(-0.183, 0.362, -0.158, 0.183, 0.394, 0.163, SCARF_DARK);
  b.box(-0.125, 0.44, -0.166, 0.125, 0.52, -0.07, SCARF);
  b.box(0.032, 0.29, 0.15, 0.118, 0.372, 0.192, SCARF_LIGHT);
  b.box(0.045, 0.1, 0.158, 0.1, 0.3, 0.184, SCARF);
  b.box(0.088, 0.15, 0.154, 0.134, 0.29, 0.177, SCARF_DARK);
  return b.build();
}

export function buildHead(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  // Head: a chamfered block over a narrower jaw, so the outline is round rather than a cube.
  chamfer(b, -0.165, 0.085, -0.165, 0.165, 0.29, 0.165, 0.035, SKIN);
  b.box(-0.142, 0.0, -0.13, 0.142, 0.085, 0.12, SKIN);
  b.box(-0.105, 0.0, -0.15, 0.105, 0.085, 0.165, SKIN);
  for (const sx of [-1, 1]) b.box(sx > 0 ? 0.165 : -0.185, 0.11, -0.03, sx > 0 ? 0.185 : -0.165, 0.18, 0.025, SKIN_SHADE);
  // Hair: thick at the back and the temples under the brim, a ragged fringe at the front.
  chamfer(b, -0.172, 0.06, -0.176, 0.172, 0.285, -0.04, 0.03, HAIR);
  for (const sx of [-1, 1]) b.box(sx > 0 ? 0.14 : -0.172, 0.18, -0.04, sx > 0 ? 0.172 : -0.14, 0.285, 0.07, HAIR);
  // Hair tied up in a bun under the hat.
  chamfer(b, -0.068, 0.1, -0.232, 0.068, 0.2, -0.17, 0.024, HAIR);
  b.box(-0.072, 0.135, -0.236, 0.072, 0.158, -0.172, LEATHER.dark);
  b.box(-0.13, 0.245, 0.165, 0.13, 0.285, 0.177, HAIR);
  b.box(-0.13, 0.22, 0.165, -0.07, 0.245, 0.177, HAIR);
  b.box(0.03, 0.225, 0.165, 0.09, 0.245, 0.177, HAIR);
  // Face: eyes with a highlight, brows, nose, mouth and a little blush.
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? 0.035 : -0.09;
    b.box(x0, 0.115, 0.165, x0 + 0.055, 0.18, 0.175, EYE);
    const hx = sx > 0 ? x0 + 0.033 : x0 + 0.004;
    b.box(hx, 0.158, 0.175, hx + 0.018, 0.176, 0.178, EYE_SHINE);
    b.box(x0 - 0.006, 0.192, 0.165, x0 + 0.06, 0.207, 0.176, HAIR);
    b.box(sx > 0 ? 0.095 : -0.125, 0.086, 0.165, sx > 0 ? 0.125 : -0.095, 0.106, 0.169, BLUSH);
  }
  b.box(-0.02, 0.08, 0.165, 0.02, 0.122, 0.188, SKIN_SHADE);
  b.box(-0.032, 0.048, 0.165, 0.032, 0.06, 0.171, MOUTH);
  // Felt hat worn tipped back and a little to one side: a broad octagonal brim, a low rounded
  // crown and a band, with brass goggles pushed up onto the band.
  b.push().translate(0, 0.255, -0.005).rotateX(-0.12).rotateZ(0.05);
  disc(b, 0.29, 0.0, 0.034, HAT_BRIM);
  chamfer(b, -0.172, 0.03, -0.172, 0.172, 0.12, 0.172, 0.05, HAT);
  chamfer(b, -0.14, 0.12, -0.14, 0.14, 0.155, 0.14, 0.045, HAT);
  chamfer(b, -0.178, 0.034, -0.178, 0.178, 0.072, 0.178, 0.052, HAT_BAND);
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? 0.022 : -0.112;
    b.box(x0, 0.036, 0.162, x0 + 0.09, 0.112, 0.205, BRASS);
    b.box(x0 + 0.016, 0.051, 0.205, x0 + 0.074, 0.097, 0.211, LENS);
    b.box(x0 + (sx > 0 ? 0.05 : 0.018), 0.08, 0.211, x0 + (sx > 0 ? 0.066 : 0.034), 0.093, 0.214, LENS_SHINE);
  }
  b.box(-0.024, 0.06, 0.172, 0.024, 0.088, 0.196, HAT_BAND);
  b.pop();
  return b.build();
}

export function buildPack(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  const px = RIG.poleX;
  const pz = RIG.poleZ;
  // Timber frame: two poles that rise past the hat, capped with brass ferrules.
  for (const sx of [-1, 1]) {
    b.box(sx * px - 0.019, -0.52, pz - 0.019, sx * px + 0.019, 0.575, pz + 0.019, FRAME);
    b.box(sx * px - 0.024, 0.55, pz - 0.024, sx * px + 0.024, 0.6, pz + 0.024, BRASS);
  }
  // A peg out to the left and back near the top, with an iron hook: the ember vial hangs from it.
  beam(b, px, RIG.hookY + 0.033, pz, RIG.hookX + 0.008, RIG.hookY + 0.033, RIG.hookZ - 0.008, 0.026, 0.025, FRAME);
  b.box(RIG.hookX - 0.008, RIG.hookY - 0.004, RIG.hookZ - 0.008, RIG.hookX + 0.008, RIG.hookY + 0.03, RIG.hookZ + 0.008, IRON.mid);
  // The load: a waxed-canvas duffel lashed between the poles, tapering to a tied-off neck.
  chamfer(b, -0.17, -0.4, -0.31, 0.17, -0.13, -0.045, 0.04, CANVAS);
  chamfer(b, -0.145, -0.13, -0.29, 0.145, -0.08, -0.065, 0.04, CANVAS);
  b.box(-0.13, -0.43, -0.285, 0.13, -0.4, -0.07, CANVAS_DARK);
  b.box(-0.08, -0.08, -0.235, 0.08, -0.035, -0.12, CANVAS_LIGHT);
  b.box(-0.086, -0.084, -0.241, 0.086, -0.064, -0.114, ROPE.mid);
  // A leather closing strap down the back with a brass buckle.
  b.box(-0.022, -0.415, -0.323, 0.022, -0.115, -0.3, LEATHER.mid);
  b.box(-0.032, -0.205, -0.332, 0.032, -0.165, -0.32, BRASS);
  // One rope lashing ties the load to both poles.
  b.box(-px - 0.024, -0.284, -0.318, px + 0.024, -0.256, pz + 0.012, ROPE.mid);
  // Cream wool bedroll strapped under the load, the roll's spiral showing at the ends.
  rodX(b, -0.22, 0.22, -0.515, -0.19, 0.08, WOOL);
  for (const x of [-0.13, 0.13]) rodX(b, x - 0.022, x + 0.022, -0.515, -0.19, 0.088, LEATHER.dark);
  for (const sx of [-1, 1]) b.box(sx > 0 ? 0.22 : -0.224, -0.548, -0.223, sx > 0 ? 0.224 : -0.22, -0.482, -0.157, WOOL_DARK);
  // A tight coil of rope on the right pole, a tin canteen on the left.
  b.push().translate(-px - 0.046, -0.25, -0.17).rotateZ(Math.PI / 2);
  ring(b, { sides: 8, radius: 0.068, thickness: 0.05, y0: -0.028, y1: 0.028, color: (i) => (i % 2 ? ROPE.dark : ROPE.mid) });
  b.pop();
  b.box(px + 0.02, -0.34, -0.22, px + 0.072, -0.17, -0.12, IRON.light);
  b.box(px + 0.032, -0.17, -0.186, px + 0.06, -0.14, -0.154, LEATHER.dark);
  return b.build();
}

/** The ember vial: a brass-capped glass vial on a short cord, hanging from its joint. */
export function buildCharm(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.006, -0.05, -0.006, 0.006, 0.004, 0.006, LEATHER.dark);
  b.box(-0.024, -0.07, -0.024, 0.024, -0.048, 0.024, BRASS);
  b.box(-0.029, -0.152, -0.029, 0.029, -0.07, 0.029, AMBER.glass, 0.6);
  b.box(-0.032, -0.164, -0.032, 0.032, -0.148, 0.032, BRASS_DARK);
  return b.build();
}

export function buildUpperArm(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.065, -0.22, -0.068, 0.065, 0.05, 0.068, COAT);
  // Shoulder seam, a wider elbow, and a leather patch on the back of the elbow.
  b.box(-0.07, -0.002, -0.073, 0.07, 0.056, 0.073, COAT_LIGHT);
  b.box(-0.07, -0.27, -0.073, 0.07, -0.2, 0.073, COAT);
  b.box(-0.05, -0.262, -0.081, 0.05, -0.17, -0.07, LEATHER.mid);
  return b.build();
}

export function buildForearm(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.058, -0.13, -0.06, 0.058, 0.0, 0.06, COAT);
  b.box(-0.066, -0.2, -0.068, 0.066, -0.115, 0.068, COAT_DARK);
  // Gloved fist around the grip point (0, -forearm, 0), thumb on the forward side.
  b.box(-0.06, -0.33, -0.065, 0.06, -0.2, 0.065, LEATHER.dark);
  b.box(-0.035, -0.3, 0.065, 0.035, -0.24, 0.085, LEATHER.dark);
  return b.build();
}

export function buildThigh(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.088, -0.4, -0.1, 0.088, 0.04, 0.1, TROUSERS);
  b.box(-0.062, -0.37, 0.1, 0.062, -0.27, 0.107, TROUSERS_PATCH);
  return b.build();
}

export function buildShin(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  b.box(-0.08, -0.12, -0.09, 0.08, 0.02, 0.09, TROUSERS);
  // Tall boots: a shaft to below the knee with a folded cuff and a strap, a long rounded toe and
  // a proud dark sole.
  b.box(-0.092, -0.36, -0.102, 0.092, -0.08, 0.102, BOOT);
  b.box(-0.099, -0.135, -0.109, 0.099, -0.07, 0.109, BOOT_LIGHT);
  b.box(-0.096, -0.27, -0.106, 0.096, -0.246, 0.106, LEATHER.dark);
  b.box(-0.092, -0.4, -0.102, 0.092, -0.32, 0.17, BOOT);
  b.box(-0.078, -0.395, 0.17, 0.078, -0.335, 0.198, BOOT);
  b.box(-0.098, -0.42, -0.108, 0.098, -0.395, 0.2, BOOT_SOLE);
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
