import type { Rng } from '../../core/rng';
import type { VoxBuilder } from '../voxModel';
import type { ModelBuilder, PropModelOptions } from './models';
import { beam, disc, shade, vary } from './shapes';
import { CLOTH, FIRE, IRON, ROPE, WOOD } from './palette';

/**
 * Round 3 (VIS stretch): the camp that grows (LOOP's camp upgrades, BRIEF §6), in the props' crafted
 * style: a bigger tent, a stone forge chimney with its ember mouth, and the trophy wall where the
 * guardians' heads go up one by one.
 *
 * `trophyWall`'s variant is a bitmask of the guardians beaten, in BIOME_IDS order (bit 0 the Amber
 * Matriarch ... bit 11 the Obsidian Abyss's): LOOP passes it as the prop's `modelVariant`.
 */

type Build = (m: ModelBuilder, rng: Rng, o: PropModelOptions) => void;

const STONEC = [0x2a2c30, 0x34363b, 0x3e4046, 0x4a4c52, 0x56585e] as const;

const campTent: Build = (m, rng) => {
  // A wall tent: a ridge pole on two uprights, canvas sloping to the ground, a flap tied back, two
  // bedrolls inside and the guy ropes pegged out.
  const b = m.body;
  const L = 1.5;
  const H = 1.7;
  const W = 1.35;
  // The canvas: two slanted panels from the ridge to the ground, seams along their edges.
  for (const s of [-1, 1]) {
    beam(b, 0, H, 0, s * W, 0.02, 0, 2 * L, 0.03, s > 0 ? CLOTH.canvas : shade(CLOTH.canvas, 0.93));
    beam(b, 0, H, -L, s * W, 0.02, -L, 0.05, 0.05, WOOD.dark);
    beam(b, 0, H, L, s * W, 0.02, L, 0.05, 0.05, WOOD.dark);
  }
  b.box(-0.04, 0, -L - 0.05, 0.04, H + 0.08, -L + 0.03, WOOD.mid);
  b.box(-0.04, 0, L - 0.03, 0.04, H + 0.08, L + 0.05, WOOD.mid);
  beam(b, 0, H + 0.04, -L - 0.1, 0, H + 0.04, L + 0.1, 0.07, 0.07, WOOD.dark);
  // Bedrolls and a lamp hung from the ridge, warm inside.
  for (const x of [-0.42, 0.42]) {
    b.box(x - 0.26, 0, -0.9, x + 0.26, 0.12, 0.7, vary(CLOTH.cream, rng, 0.05));
    b.box(x - 0.26, 0.12, -0.9, x + 0.26, 0.2, -0.62, CLOTH.red);
  }
  b.box(-0.06, H - 0.36, -0.06, 0.06, H - 0.18, 0.06, IRON.dark);
  m.glow.box(-0.045, H - 0.34, -0.045, 0.045, H - 0.2, 0.045, FIRE.yellow, 0.9);
  // Guy ropes and pegs.
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    beam(b, x * W * 0.5, H * 0.62, z * L, x * (W + 0.7), 0.02, z * (L + 0.4), 0.014, 0.014, ROPE.mid);
    b.box(x * (W + 0.7) - 0.03, 0, z * (L + 0.4) - 0.03, x * (W + 0.7) + 0.03, 0.16, z * (L + 0.4) + 0.03, WOOD.dark);
  }
  m.glowScale = 1.8;
};

const forgeChimney: Build = (m, rng) => {
  // A squat stone forge with a tall tapering chimney, iron bands, a glowing mouth and an anvil.
  const b = m.body;
  let y = 0;
  let w = 0.62;
  for (let i = 0; i < 9; i++) {
    const h = i < 3 ? 0.3 : 0.32;
    const c = vary(STONEC[(i + 1) % STONEC.length], rng, 0.06);
    b.box(-w, y, -w * 0.9, w, y + h, w * 0.9, c);
    b.box(-w - 0.015, y + h - 0.03, -w * 0.9 - 0.015, w + 0.015, y + h + 0.002, w * 0.9 + 0.015, shade(c, 0.8));
    y += h;
    if (i >= 2) w *= 0.92;
  }
  b.box(-w - 0.06, y, -w * 0.9 - 0.06, w + 0.06, y + 0.12, w * 0.9 + 0.06, STONEC[4]);
  for (const yy of [0.95, 1.9]) b.box(-0.66, yy, -0.6, 0.66, yy + 0.06, 0.6, IRON.dark);
  // The mouth: a dark arch with the coals glowing in it.
  b.box(-0.3, 0.2, 0.55, 0.3, 0.72, 0.62, 0x141210);
  for (let i = 0; i < 6; i++) m.glow.cube(-0.2 + i * 0.08, 0.28 + (i % 2) * 0.04, 0.58, 0.07, 0.06, 0.04, i % 3 ? FIRE.ember : FIRE.coal, 0.9);
  m.glow.box(-0.24, 0.36, 0.585, 0.24, 0.62, 0.6, FIRE.orange, 0.55);
  // Embers glowing at the chimney's top.
  m.glow.box(-w * 0.6, y + 0.1, -w * 0.5, w * 0.6, y + 0.13, w * 0.5, FIRE.red, 0.6);
  // An anvil on a stump beside it.
  b.box(0.8, 0, 0.1, 1.15, 0.5, 0.45, WOOD.mid);
  b.box(0.72, 0.5, 0.18, 1.22, 0.6, 0.37, IRON.mid);
  b.box(0.68, 0.6, 0.15, 1.28, 0.7, 0.4, IRON.light);
  m.glowScale = 2;
};

/** One guardian's head on its plaque (local: the plaque's face at z = 0, centred at x, y). */
function trophyHead(b: VoxBuilder, g: VoxBuilder, k: number): void {
  switch (k) {
    case 0: // The Amber Matriarch: an amber carapace, mandibles.
      b.box(-0.13, -0.1, 0, 0.13, 0.1, 0.2, 0xa8601a);
      b.box(-0.1, 0.08, 0.02, 0.1, 0.14, 0.17, 0xd08a2a);
      for (const s of [-1, 1]) b.box(s * 0.04, -0.12, 0.16, s * 0.16, -0.08, 0.27, 0x5a3a12);
      g.cube(-0.06, 0.02, 0.2, 0.04, 0.03, 0.01, 0xffd060, 0.9);
      g.cube(0.06, 0.02, 0.2, 0.04, 0.03, 0.01, 0xffd060, 0.9);
      break;
    case 1: // The Mycelord: a magenta cap with teal spots.
      b.box(-0.07, -0.12, 0.02, 0.07, 0.04, 0.16, 0x8a8478);
      b.box(-0.165, 0.04, -0.02, 0.165, 0.12, 0.22, 0x6a1a62);
      for (const [x, z] of [[-0.09, 0.1], [0.08, 0.04], [0.02, 0.16]] as const) g.cube(x, 0.125, z, 0.04, 0.012, 0.04, 0x5af0dc, 0.9);
      break;
    case 2: // The Elder Taproot: a knotted wooden face.
      b.box(-0.12, -0.14, 0, 0.12, 0.14, 0.16, 0x4a3420);
      b.box(-0.15, 0.1, 0.02, 0.15, 0.16, 0.12, 0x3a2818);
      g.cube(-0.05, 0.03, 0.165, 0.035, 0.03, 0.01, 0xd8f070, 0.85);
      g.cube(0.05, 0.03, 0.165, 0.035, 0.03, 0.01, 0xd8f070, 0.85);
      break;
    case 3: // The Tide Warden: a blue shell helm, a pearl eye.
      b.box(-0.15, -0.08, 0, 0.15, 0.08, 0.2, 0x1e4a6a);
      b.box(-0.12, 0.06, 0.02, 0.12, 0.14, 0.16, 0x2e6a8a);
      g.cube(0, 0.0, 0.205, 0.06, 0.05, 0.01, 0xd8e8f0, 0.8);
      break;
    case 4: // The geode's guardian: violet crystals.
      b.box(-0.1, -0.1, 0, 0.1, 0.06, 0.16, 0x2a2040);
      for (let i = 0; i < 4; i++) {
        g.push().translate(-0.08 + i * 0.055, 0.05, 0.08).rotateZ(-0.4 + i * 0.27);
        g.crystal(0.025, 0.12 + (i % 2) * 0.05, 0.03, 5, 0x9a6aff, 0x4a2a9a, 0.8);
        g.pop();
      }
      break;
    case 5: // The mines' guardian: an iron helmet and its lamp.
      b.box(-0.13, -0.1, 0, 0.13, 0.08, 0.18, 0x4f4a45);
      b.box(-0.15, 0.06, 0, 0.15, 0.1, 0.2, 0x302d2b);
      b.box(-0.04, 0.0, 0.18, 0.04, 0.06, 0.22, 0x302d2b);
      g.cube(0, 0.03, 0.225, 0.05, 0.04, 0.01, 0xffbf47, 0.95);
      break;
    case 6: // Frost: ice horns.
      b.box(-0.12, -0.1, 0, 0.12, 0.08, 0.17, 0x6a7c92);
      for (const s of [-1, 1]) {
        g.push().translate(s * 0.1, 0.06, 0.08).rotateZ(-s * 0.5);
        g.crystal(0.025, 0.16, 0.04, 5, 0xd8f0fa, 0x4a8ab4, 0.4);
        g.pop();
      }
      break;
    case 7: // The jungle's: leaves and glowing bulbs.
      b.box(-0.11, -0.11, 0, 0.11, 0.09, 0.16, 0x24502a);
      for (const s of [-1, 1]) b.box(s * 0.08, 0.02, 0.0, s * 0.22, 0.05, 0.12, 0x3a7a3a);
      g.cube(-0.04, 0.02, 0.165, 0.03, 0.03, 0.01, 0x8aff6a, 0.9);
      g.cube(0.04, 0.02, 0.165, 0.03, 0.03, 0.01, 0x8aff6a, 0.9);
      break;
    case 8: // The bog's: a wide toad head.
      b.box(-0.165, -0.08, 0, 0.165, 0.06, 0.18, 0x6a6a1a);
      for (const s of [-1, 1]) b.box(s * 0.08 - 0.04, 0.05, 0.06, s * 0.08 + 0.04, 0.1, 0.14, 0x8a8a22);
      g.cube(-0.08, 0.08, 0.14, 0.03, 0.02, 0.01, 0xe0f04a, 0.9);
      g.cube(0.08, 0.08, 0.14, 0.03, 0.02, 0.01, 0xe0f04a, 0.9);
      break;
    case 9: // The drowned city's: a gold mask.
      b.box(-0.12, -0.13, 0, 0.12, 0.13, 0.12, 0xa8801e);
      b.box(-0.09, 0.02, 0.12, 0.09, 0.05, 0.14, 0x6a4a12);
      g.cube(0, -0.06, 0.125, 0.06, 0.012, 0.01, 0xffd060, 0.7);
      break;
    case 10: // Magma: basalt and red horns, cracks glowing.
      b.box(-0.12, -0.1, 0, 0.12, 0.08, 0.17, 0x242124);
      for (const s of [-1, 1]) b.box(s * 0.08, 0.06, 0.04, s * 0.16, 0.18, 0.1, 0x5a1a0a);
      g.box(-0.1, -0.02, 0.171, 0.1, -0.005, 0.175, 0xff6a1e, 0.9);
      break;
    default: // The abyss: black glass, a violet eye.
      b.box(-0.11, -0.12, 0, 0.11, 0.1, 0.15, 0x16121e);
      g.cube(0, 0.0, 0.155, 0.07, 0.04, 0.01, 0xa070ff, 0.95);
      break;
  }
}

const trophyWall: Build = (m, _rng, o) => {
  // A timber frame with a plank back: twelve plaques in two rows, a head on each one won.
  const b = m.body;
  const g = m.glow;
  const won = o.variant | 0;
  for (const x of [-1.6, 1.6]) b.box(x - 0.07, 0, -0.07, x + 0.07, 2.1, 0.07, WOOD.dark);
  b.box(-1.7, 2.05, -0.09, 1.7, 2.2, 0.09, WOOD.dark);
  for (let k = 0; k < 7; k++) b.box(-1.55, 0.45 + k * 0.22, -0.05, 1.55, 0.45 + k * 0.22 + 0.2, 0.0, k % 2 ? WOOD.mid : shade(WOOD.mid, 0.92));
  for (let i = 0; i < 12; i++) {
    const col = i % 6;
    const row = Math.floor(i / 6);
    const x = -1.25 + col * 0.5;
    const y = 1.62 - row * 0.62;
    b.box(x - 0.17, y - 0.17, 0.0, x + 0.17, y + 0.17, 0.035, WOOD.light);
    b.box(x - 0.02, y + 0.17, 0.0, x + 0.02, y + 0.22, 0.03, IRON.mid);
    if (!(won & (1 << i))) continue;
    for (const v of [b, g]) v.push().translate(x, y, 0.035);
    trophyHead(b, g, i);
    for (const v of [b, g]) v.pop();
  }
  // A shelf and two candles under the heads.
  b.box(-1.55, 0.36, -0.02, 1.55, 0.42, 0.22, WOOD.dark);
  for (const x of [-1.35, 1.35]) {
    b.push().translate(x, 0, 0.1);
    disc(b, 0.03, 0.42, 0.56, CLOTH.cream);
    b.pop();
    g.cube(x, 0.59, 0.1, 0.02, 0.05, 0.02, FIRE.yellow, 0.95);
  }
  m.glowScale = 1.8;
};

/** The camp's kinds (models.ts merges them; trophyWall takes 4096 variants: the bitmask). */
export const CAMP_PROPS: Record<string, { build: Build; variants: number }> = {
  campTent: { build: campTent, variants: 1 },
  forgeChimney: { build: forgeChimney, variants: 1 },
  trophyWall: { build: trophyWall, variants: 4096 },
};
