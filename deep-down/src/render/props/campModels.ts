import type { Rng } from '../../core/rng';
import type { VoxBuilder } from '../voxModel';
import type { ModelBuilder, PropModelOptions } from './models';
import { beam, disc, ring, shade, vary } from './shapes';
import { CLOTH, COPPER, FIRE, IRON, ROPE, WOOD } from './palette';

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
    case 11: // The abyss: black glass, a violet eye.
      b.box(-0.11, -0.12, 0, 0.11, 0.1, 0.15, 0x16121e);
      for (const s of [-1, 1]) b.box(s * 0.06, 0.08, 0.02, s * 0.1, 0.2, 0.08, 0x0c0a12);
      g.cube(0, 0.0, 0.155, 0.07, 0.04, 0.01, 0xa070ff, 0.95);
      break;
    default: // The Dark Heart: a black crystal heart with a rose ember in it.
      b.box(-0.12, -0.08, 0, 0.12, 0.1, 0.12, 0x1a0c14);
      b.push().translate(0, -0.08, 0.06).rotateX(Math.PI);
      b.crystal(0.1, 0.12, 0.08, 6, 0x1a0c14, 0x0c060a, 0);
      b.pop();
      g.cube(0, 0.01, 0.125, 0.05, 0.06, 0.01, 0xff4a6a, 0.95);
      break;
  }
}

/**
 * The trophy wall: a long timber wall with twelve iron hooks in a row, matching LOOP's trophy spots
 * (config/camp TROPHY_SPOTS: 0.8 m apart, 0.4 m in front of the wall, 1.5 m up; the wall stands at
 * LOOP's default decor scale 0.9, so the hooks sit at spot / 0.9 here). LOOP hangs each guardian's
 * head as its own `guardianTrophy` prop on its hook; a bitmask variant (bit i: the i-th guardian in
 * ROSTERS order) draws the heads on the wall itself instead (the Visual Lab).
 */
const WALL_SCALE = 0.9;
const HOOK_Y = 1.5 / WALL_SCALE;
const hookX = (i: number): number => (-4.5 + i * 0.8) / WALL_SCALE;

const trophyWall: Build = (m, rng, o) => {
  const b = m.body;
  const g = m.glow;
  const won = o.variant | 0;
  const W = 5.5;
  // Posts every ~1.85 m, a sill beam, planks, a cap beam and a little shingled roof.
  for (let k = 0; k <= 6; k++) {
    const x = -W + (k / 6) * 2 * W;
    b.box(x - 0.09, 0, -0.16, x + 0.09, 2.7, 0.02, vary(WOOD.dark, rng, 0.06));
    b.box(x - 0.12, 0, -0.2, x + 0.12, 0.12, 0.06, STONEC[2]);
  }
  b.box(-W, 0.1, -0.12, W, 0.24, 0.0, WOOD.dark);
  for (let k = 0; k < 10; k++) b.box(-W, 0.24 + k * 0.24, -0.1, W, 0.24 + k * 0.24 + 0.225, -0.02, k % 2 ? WOOD.mid : shade(WOOD.mid, 0.9));
  b.box(-W - 0.1, 2.64, -0.2, W + 0.1, 2.8, 0.06, WOOD.dark);
  for (let k = 0; k < 22; k++) {
    const x = -W - 0.08 + k * ((2 * W + 0.16) / 22);
    b.push().translate(x + 0.26, 2.86, -0.02).rotateX(0.42);
    b.box(-0.26, -0.03, -0.26, 0.24, 0.03, 0.26, vary(k % 2 ? WOOD.light : WOOD.mid, rng, 0.08));
    b.pop();
  }
  // The hooks, a blank brass plate under each, and a head on each hook the mask says is won.
  for (let i = 0; i < 12; i++) {
    const x = hookX(i);
    b.box(x - 0.025, HOOK_Y + 0.16, -0.02, x + 0.025, HOOK_Y + 0.22, 0.09, IRON.mid);
    b.box(x - 0.012, HOOK_Y + 0.08, 0.06, x + 0.012, HOOK_Y + 0.2, 0.09, IRON.mid);
    b.box(x - 0.16, HOOK_Y - 0.52, -0.02, x + 0.16, HOOK_Y - 0.44, 0.0, COPPER_DIM);
    if (!(won & (1 << i))) continue;
    for (const v of [b, g]) v.push().translate(x, HOOK_Y, 0.0).scale(1.5);
    b.box(-0.19, -0.19, 0.0, 0.19, 0.19, 0.035, WOOD.light);
    for (const v of [b, g]) v.push().translate(0, 0, 0.035);
    trophyHead(b, g, i);
    for (const v of [b, g]) v.pop().pop();
  }
  // A long shelf under the row with candles at both ends and a guttered one in the middle.
  b.box(-W + 0.3, 0.66, -0.02, W - 0.3, 0.72, 0.28, WOOD.dark);
  for (const x of [-W + 0.6, 0, W - 0.6]) {
    b.push().translate(x, 0, 0.14);
    disc(b, 0.04, 0.72, x === 0 ? 0.8 : 0.92, CLOTH.cream);
    b.pop();
    g.cube(x, x === 0 ? 0.83 : 0.95, 0.14, 0.025, 0.06, 0.025, FIRE.yellow, 0.95);
  }
  m.glowScale = 1.8;
};

const COPPER_DIM = 0x7a5a2e;

/**
 * One guardian's trophy on its hook of the wall (LOOP's 'guardianTrophy': variant = the guardian's
 * index in ROSTERS order, 0 the Amber Matriarch .. 12 the Dark Heart; placed on the floor 0.4 m in
 * front of the wall at scale 0.55): a shield plaque hung at 1.5 m, its back against the wall's face,
 * the head mounted on it, its eyes still faintly alight.
 */
const TROPHY_SCALE = 0.55;
const guardianTrophy: Build = (m, rng, o) => {
  const b = m.body;
  const g = m.glow;
  const k = Math.max(0, Math.min(12, o.variant | 0));
  const back = -0.4 / TROPHY_SCALE;
  const y = 1.5 / TROPHY_SCALE;
  for (const v of [b, g]) v.push().translate(0, y, back);
  // The plaque: a stepped oak shield with an iron rim, a ring to hang it by.
  b.box(-0.42, -0.5, 0, 0.42, 0.42, 0.07, vary(WOOD.light, rng, 0.05));
  b.box(-0.36, -0.62, 0, 0.36, -0.5, 0.07, WOOD.light);
  b.box(-0.22, -0.72, 0, 0.22, -0.62, 0.07, WOOD.light);
  for (const [x0, y0, x1, y1] of [[-0.45, 0.4, 0.45, 0.46], [-0.45, -0.49, -0.4, 0.4], [0.4, -0.49, 0.45, 0.4]] as const) b.box(x0, y0, 0.006, x1, y1, 0.085, IRON.dark);
  b.box(-0.04, 0.46, 0.0, 0.04, 0.56, 0.05, IRON.mid);
  // The head, scaled up from the wall's small heads.
  for (const v of [b, g]) v.push().translate(0, -0.08, 0.07).scale(2.3);
  trophyHead(b, g, k);
  for (const v of [b, g]) v.pop().pop();
  m.glowScale = 1.9;
};

/**
 * The trader's cart by the camp fire (LOOP's trader): a two-wheeled covered handcart, its striped
 * awning out over a counter of wares (jars, sacks, a crate of ore, bundled torches, a rolled rug),
 * a lantern on a pole, a little painted sign. Long axis x, the counter facing +z.
 */
const traderCart: Build = (m, rng) => {
  const b = m.body;
  const g = m.glow;
  const L = 0.95;
  const D = 0.5;
  const bed = 0.62;
  // The bed and its side boards.
  b.box(-L, bed - 0.08, -D, L, bed, D, WOOD.dark);
  for (let i = 0; i < 6; i++) b.box(-L + 0.05 + i * ((2 * L - 0.1) / 6) + 0.01, bed, -D + 0.05, -L + 0.05 + (i + 1) * ((2 * L - 0.1) / 6) - 0.01, bed + 0.03, D - 0.05, vary(WOOD.mid, rng, 0.1));
  for (const z of [-D, D - 0.05]) b.box(-L, bed, z, L, bed + 0.26, z + 0.05, vary(WOOD.mid, rng, 0.06));
  b.box(-L, bed, -D + 0.05, -L + 0.05, bed + 0.25, D - 0.05, WOOD.mid);
  b.box(L - 0.05, bed, -D + 0.05, L, bed + 0.25, D - 0.05, WOOD.mid);
  // Two big spoked wheels on an axle under the middle, iron tyres.
  for (const sz of [-1, 1]) {
    b.push().translate(0.1, 0.5, sz * (D + 0.08)).rotateX(Math.PI / 2);
    ring(b, { sides: 12, radius: 0.47, thickness: 0.06, y0: -0.035, y1: 0.035, color: (i) => (i % 2 ? IRON.dark : IRON.mid) });
    ring(b, { sides: 12, radius: 0.42, thickness: 0.05, y0: -0.03, y1: 0.03, color: () => WOOD.mid });
    for (let k = 0; k < 6; k++) {
      b.push().rotateY((k / 6) * Math.PI);
      b.box(-0.4, -0.018, -0.022, 0.4, 0.018, 0.022, WOOD.light);
      b.pop();
    }
    disc(b, 0.08, -0.06, 0.06, IRON.mid);
    b.pop();
  }
  b.box(0.06, 0.46, -D - 0.1, 0.14, 0.54, D + 0.1, IRON.dark);
  // The shafts out to -x, resting on the floor, and a prop leg at the +x end.
  for (const sz of [-1, 1]) beam(b, -L + 0.1, bed - 0.06, sz * 0.36, -L - 1.0, 0.05, sz * 0.3, 0.07, 0.07, WOOD.light);
  b.box(-L - 0.95, 0.04, -0.34, -L - 0.85, 0.1, 0.34, WOOD.dark);
  b.box(L - 0.12, 0, -0.06, L - 0.04, bed - 0.08, 0.06, WOOD.dark);
  // The hood: canvas over three hoops, rolled up on the counter side.
  const H = 1.5;
  for (const x of [-L + 0.08, 0, L - 0.08]) {
    beam(b, x, bed + 0.24, -D + 0.02, x, H, -D + 0.18, 0.04, 0.04, WOOD.light);
    beam(b, x, H, -D + 0.18, x, H + 0.08, 0.1, 0.04, 0.04, WOOD.light);
  }
  beam(b, -L - 0.03, H + 0.06, -D + 0.05, L + 0.03, H + 0.06, -D + 0.05, 2 * 0.02, 0.6, CLOTH.canvas);
  b.push().translate(0, H + 0.12, -0.05).rotateX(0.16);
  b.box(-L - 0.02, -0.02, -0.4, L + 0.02, 0.02, 0.38, shade(CLOTH.canvas, 0.95));
  b.pop();
  b.box(-L, bed + 0.26, -D - 0.01, L, H, -D + 0.04, CLOTH.canvasDark);
  // The striped awning out over the counter.
  for (let i = 0; i < 8; i++) {
    const x0 = -L - 0.05 + i * ((2 * L + 0.1) / 8);
    b.push().translate(x0 + (2 * L + 0.1) / 16, H - 0.05, D + 0.25).rotateX(0.36);
    b.box(-(2 * L + 0.1) / 16, -0.015, -0.32, (2 * L + 0.1) / 16, 0.015, 0.32, i % 2 ? CLOTH.cream : CLOTH.red);
    b.pop();
  }
  for (const x of [-L + 0.02, L - 0.02]) b.box(x - 0.025, bed, D + 0.02, x + 0.025, H - 0.12, D + 0.07, WOOD.light);
  // The wares: jars, sacks, a crate of ore, torches in a bundle, a rolled rug.
  for (let i = 0; i < 5; i++) {
    b.push().translate(-0.7 + i * 0.14, bed + 0.03, 0.3);
    disc(b, 0.05, 0, 0.16, vary(i % 2 ? 0x6a8a7a : 0x8a6a4a, rng, 0.1));
    disc(b, 0.035, 0.16, 0.19, WOOD.light);
    b.pop();
  }
  for (const [x, z, h] of [[-0.25, -0.15, 0.36], [0.05, -0.2, 0.31]] as const) {
    b.box(x - 0.16, bed + 0.03, z - 0.13, x + 0.16, bed + h, z + 0.13, vary(CLOTH.canvas, rng, 0.08));
    b.box(x - 0.1, bed + h, z - 0.06, x + 0.1, bed + h + 0.06, z + 0.06, CLOTH.canvasDark);
  }
  b.box(0.3, bed + 0.03, -0.1, 0.62, bed + 0.3, 0.22, WOOD.mid);
  for (let i = 0; i < 6; i++) b.cube(0.36 + (i % 3) * 0.1, bed + 0.33, -0.03 + Math.floor(i / 3) * 0.12, 0.09, 0.07, 0.09, i % 2 ? COPPER.mid : 0x6a7a8a);
  b.push().translate(0.75, bed + 0.03, 0.3).rotateZ(-0.35);
  for (let i = 0; i < 5; i++) b.box(-0.02 + (i % 3) * 0.035, 0, -0.03 + Math.floor(i / 3) * 0.04, 0.015 + (i % 3) * 0.035, 0.36, 0.0 + Math.floor(i / 3) * 0.04, WOOD.light);
  b.box(-0.03, 0.12, -0.04, 0.1, 0.15, 0.05, ROPE.mid);
  b.pop();
  b.push().translate(-0.2, bed + 0.1, 0.32).rotateZ(Math.PI / 2);
  disc(b, 0.08, -0.5, 0.5, CLOTH.red);
  disc(b, 0.05, -0.51, 0.51, CLOTH.cream);
  b.pop();
  // A lantern on a pole at the front corner (the trader's light), and the sign.
  b.box(L + 0.05, 0, D - 0.05, L + 0.11, 1.9, D + 0.01, WOOD.mid);
  b.box(L + 0.05, 1.84, D - 0.05, L + 0.4, 1.89, D + 0.01, WOOD.mid);
  b.box(L + 0.3, 1.62, D - 0.07, L + 0.42, 1.66, D + 0.05, IRON.dark);
  b.box(L + 0.31, 1.44, D - 0.06, L + 0.41, 1.48, D + 0.04, IRON.dark);
  for (const [dx, dz] of [[0, 0], [0.08, 0], [0, 0.08], [0.08, 0.08]] as const) b.box(L + 0.315 + dx, 1.48, D - 0.055 + dz, L + 0.325 + dx, 1.62, D - 0.045 + dz, IRON.mid);
  g.box(L + 0.32, 1.49, D - 0.05, L + 0.4, 1.61, D + 0.03, FIRE.yellow, 0.9);
  b.box(-L - 0.2, 1.0, D + 0.05, -L + 0.35, 1.32, D + 0.09, WOOD.light);
  b.box(-L - 0.17, 1.03, D + 0.09, -L + 0.32, 1.29, D + 0.095, CLOTH.cream);
  b.push().translate(-L + 0.07, 1.16, D + 0.1).rotateX(Math.PI / 2);
  disc(b, 0.07, -0.005, 0.005, COPPER.light);
  b.pop();
  m.glowScale = 1.9;
};

/** The camp's kinds (models.ts merges them; trophyWall takes 4096 variants: the bitmask). */
export const CAMP_PROPS: Record<string, { build: Build; variants: number }> = {
  campTent: { build: campTent, variants: 1 },
  forgeChimney: { build: forgeChimney, variants: 1 },
  trophyWall: { build: trophyWall, variants: 4096 },
  // LOOP's name for it (config/camp: the Forge Chimney upgrade).
  campChimney: { build: forgeChimney, variants: 1 },
  guardianTrophy: { build: guardianTrophy, variants: 13 },
  traderCart: { build: traderCart, variants: 1 },
};
