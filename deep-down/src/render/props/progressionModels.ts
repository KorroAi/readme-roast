import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import { runePixels } from '../../config/runes';
import type { ModelBuilder, PropModelOptions } from './models';
import { ASH, BRICK, CLOTH, COPPER, CYAN, FIRE, IRON, LEATHER, SLATE, WOOD } from './palette';
import { beam, shade, vary } from './shapes';

/**
 * Props of the upgrade tree and the runes (final pass W3): the camp plots, the three stations and
 * the rune stones. Every model stands on y = 0, centred on the origin, facing +Z (models.ts).
 * Camp things are Halden work (timber, iron, leather, warm); the runes are the builders' (stone,
 * cold ink).
 */

const CHALK = 0xd8d2c2;
const INK = 0x2a2420;

/**
 * A camp plot: a chalk outline 2 m square on the floor and a stake with a board at its front
 * corner. Variant 0 / 1 / 2: the board's chalk sketch (the Forge's anvil, the Survey Table's
 * compass rose, the Relic Shelf's eight dots).
 */
export function plotStake(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const h = 0.012;
  // The outline: chalk strokes along each side, broken where the chalk skipped.
  for (let side = 0; side < 4; side++) {
    b.push().rotateY((side * Math.PI) / 2);
    let x = -0.92;
    while (x < 0.92) {
      const len = rng.range(0.18, 0.42);
      const x1 = Math.min(0.92, x + len);
      b.box(x, 0, 0.93 + rng.range(-0.012, 0.012), x1, h, 0.975, vary(CHALK, rng, 0.06), 0, false);
      x = x1 + rng.range(0.03, 0.09);
    }
    b.pop();
  }
  // A chalk cross at the centre, where the station's foot will stand.
  b.box(-0.16, 0, -0.018, 0.16, h, 0.018, shade(CHALK, 0.9), 0, false);
  b.box(-0.018, 0, -0.16, 0.018, h, 0.16, shade(CHALK, 0.9), 0, false);
  // The stake at the front right corner, driven in at a slight lean, and its board.
  b.push().translate(0.86, 0, 1.02).rotateZ(0.05).rotateX(-0.04);
  b.box(-0.03, 0, -0.03, 0.03, 0.72, 0.03, vary(WOOD.mid, rng, 0.06));
  b.box(-0.034, 0.7, -0.034, 0.034, 0.74, 0.034, WOOD.end);
  b.push().translate(0, 0.46, 0.035);
  b.box(-0.17, 0, 0, 0.17, 0.22, 0.022, vary(WOOD.light, rng, 0.05));
  b.box(-0.172, 0.205, -0.002, 0.172, 0.226, 0.026, WOOD.dark);
  for (const x of [-0.13, 0.13]) b.box(x - 0.008, 0.1, 0.022, x + 0.008, 0.116, 0.028, IRON.dark);
  const z = 0.023;
  const c = CHALK;
  if (o.variant === 0) {
    // An anvil: horn, face, waist, foot.
    b.box(-0.08, 0.13, z, 0.06, 0.15, z + 0.004, c, 0, false);
    b.box(-0.12, 0.135, z, -0.08, 0.145, z + 0.004, c, 0, false);
    b.box(-0.02, 0.08, z, 0.02, 0.13, z + 0.004, c, 0, false);
    b.box(-0.06, 0.06, z, 0.06, 0.08, z + 0.004, c, 0, false);
  } else if (o.variant === 1) {
    // A compass rose.
    b.box(-0.004, 0.04, z, 0.004, 0.18, z + 0.004, c, 0, false);
    b.box(-0.07, 0.106, z, 0.07, 0.114, z + 0.004, c, 0, false);
    b.box(-0.02, 0.16, z, 0.02, 0.17, z + 0.004, c, 0, false);
  } else {
    // Eight dots in two rows.
    for (let i = 0; i < 8; i++) {
      const x = -0.09 + (i % 4) * 0.06;
      const y = i < 4 ? 0.14 : 0.07;
      b.box(x - 0.012, y - 0.012, z, x + 0.012, y + 0.012, z + 0.004, c, 0, false);
    }
  }
  b.pop();
  b.pop();
  m.hitBoxes = [boxOf(0.66, 0, 0.9, 1.06, 0.76, 1.14)];
}

/**
 * The Forge: a fieldstone hearth with a bed of coals under an iron hood and flue, the bellows on
 * its side, an anvil on a stump and a quench bucket. The coals glow (its emitter is LIGHT_EMBER).
 */
export function forge(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;
  // The hearth: a block of fieldstones, a rim of larger stones round the coal pan.
  b.box(-0.62, 0, -0.42, 0.42, 0.62, 0.42, BRICK.base);
  for (let i = 0; i < 26; i++) {
    const x = rng.range(-0.56, 0.34);
    const y = rng.range(0.1, 0.54);
    const side = rng.int(0, 2);
    const s = rng.range(0.1, 0.18);
    const col = vary(SLATE[rng.int(2, 4)], rng, 0.08);
    // Each stone stands proud of the hearth by its own amount, so no two faces share a plane.
    const out = 0.012 + i * 0.0017;
    if (side === 0) b.box(x - s / 2, y - s / 2.4, 0.4, x + s / 2, y + s / 2.4, 0.42 + out, col);
    else if (side === 1) b.box(x - s / 2, y - s / 2.4, -0.42 - out, x + s / 2, y + s / 2.4, -0.4, col);
    else {
      const z0 = rng.range(-0.38, 0.22);
      b.box(-0.62 - out, y - s / 2.4, z0, -0.6, y + s / 2.4, z0 + s, col);
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const s = rng.range(0.12, 0.16);
    b.cube(-0.1 + Math.cos(a) * 0.32, 0.65, Math.sin(a) * 0.28, s, 0.09, s, vary(SLATE[3], rng, 0.1));
  }
  // The coal pan and its coals.
  b.box(-0.36, 0.6, -0.22, 0.16, 0.64, 0.22, ASH.dark);
  for (let i = 0; i < 18; i++) {
    const x = rng.range(-0.32, 0.12);
    const z = rng.range(-0.18, 0.18);
    const s = rng.range(0.04, 0.08);
    const hot = rng.chance(0.55);
    if (hot) g.cube(x, 0.66, z, s, s * 0.6, s, rng.chance(0.4) ? FIRE.yellow : FIRE.ember, rng.range(0.7, 1));
    else b.cube(x, 0.66, z, s, s * 0.6, s, ASH.light);
  }
  // The hood and the flue, riveted iron sheet.
  b.push().translate(-0.1, 1.3, 0);
  b.box(-0.42, 0, -0.34, 0.42, 0.06, 0.34, IRON.mid);
  b.box(-0.32, 0.06, -0.26, 0.32, 0.22, 0.26, IRON.dark);
  b.box(-0.13, 0.22, -0.13, 0.13, 1.0, 0.13, IRON.mid);
  b.box(-0.15, 0.98, -0.15, 0.15, 1.04, 0.15, IRON.light);
  for (const x of [-0.38, 0.38]) for (const z of [-0.3, 0.3]) b.cube(x, 0.03, z, 0.025, 0.025, 0.025, IRON.shine);
  b.pop();
  // Two iron straps carrying the hood.
  beam(b, -0.48, 0.62, -0.3, -0.48, 1.3, -0.3, 0.04, 0.04, IRON.dark);
  beam(b, 0.28, 0.62, 0.3, 0.28, 1.3, 0.3, 0.04, 0.04, IRON.dark);
  // The bellows on the right side, its nozzle into the hearth.
  b.push().translate(0.62, 0.42, 0.05).rotateZ(0.12);
  b.box(-0.18, -0.05, -0.16, 0.2, 0.0, 0.16, WOOD.mid);
  b.box(-0.16, 0.0, -0.14, 0.18, 0.12, 0.14, LEATHER.mid);
  b.box(-0.18, 0.12, -0.16, 0.2, 0.17, 0.16, WOOD.mid);
  b.box(0.2, 0.12, -0.03, 0.42, 0.15, 0.03, WOOD.light);
  b.pop();
  b.box(0.42, 0.42, -0.03, 0.5, 0.46, 0.03, IRON.mid);
  // The anvil on its stump, in front of the hearth.
  b.push().translate(0.2, 0, 0.82).rotateY(0.25);
  b.box(-0.17, 0, -0.17, 0.17, 0.5, 0.17, WOOD.dark);
  b.box(-0.165, 0.5, -0.165, 0.165, 0.505, 0.165, WOOD.end);
  b.box(-0.08, 0.505, -0.1, 0.08, 0.56, 0.1, IRON.dark);
  b.box(-0.05, 0.56, -0.06, 0.05, 0.64, 0.06, IRON.mid);
  b.box(-0.2, 0.64, -0.08, 0.14, 0.72, 0.08, IRON.mid);
  b.box(0.14, 0.66, -0.05, 0.25, 0.71, 0.05, IRON.mid);
  b.box(-0.2, 0.715, -0.075, 0.14, 0.725, 0.075, IRON.shine);
  b.pop();
  // Tongs leaning on the hearth, a hammer on the anvil, the quench bucket.
  beam(b, -0.66, 0.014, 0.3, -0.7, 0.58, 0.22, 0.02, 0.02, IRON.dark);
  beam(b, -0.69, 0.014, 0.34, -0.72, 0.58, 0.25, 0.02, 0.02, IRON.dark);
  b.push().translate(0.2, 0.725, 0.82).rotateY(1.1);
  b.box(-0.14, 0, -0.014, 0.1, 0.026, 0.014, WOOD.pale);
  b.box(0.1, 0, -0.04, 0.15, 0.05, 0.04, IRON.mid);
  b.pop();
  b.push().translate(-0.7, 0, 0.72);
  b.box(-0.13, 0, -0.13, 0.13, 0.3, 0.13, WOOD.mid);
  b.box(-0.135, 0.06, -0.135, 0.135, 0.08, 0.135, IRON.dark);
  b.box(-0.135, 0.22, -0.135, 0.135, 0.24, 0.135, IRON.dark);
  b.box(-0.11, 0.26, -0.11, 0.11, 0.27, 0.11, 0x1d2730);
  b.pop();
  m.anim = 'fire';
  m.glowScale = 1.6;
  m.hitBoxes = [boxOf(-0.66, 0, -0.44, 0.7, 2.35, 0.44), boxOf(-0.85, 0, 0.44, 0.45, 0.8, 1.05)];
}

/**
 * The Survey Table: a plank table on trestles with a survey of the Hollow pinned across it, a brass
 * compass, a measuring rod and a lamp. Its front (+Z) faces the camp.
 */
export function surveyTable(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;
  const W = 0.72;
  const D = 0.46;
  const H = 0.86;
  // Trestles.
  for (const x of [-W + 0.14, W - 0.14]) {
    // The two legs of a trestle cross under its head; the second is a hair thinner, so their side
    // faces never share a plane.
    const leg = vary(WOOD.mid, rng, 0.06);
    beam(b, x, 0.03, -D + 0.06, x, H - 0.05, 0, 0.06, 0.06, leg);
    beam(b, x, 0.03, D - 0.06, x, H - 0.05, 0, 0.052, 0.06, leg);
    b.box(x - 0.05, H - 0.09, -D + 0.04, x + 0.05, H - 0.04, D - 0.04, WOOD.dark);
  }
  b.box(-W + 0.14, 0.26, -0.03, W - 0.14, 0.31, 0.03, WOOD.mid);
  // The top: four planks.
  for (let i = 0; i < 4; i++) {
    const z0 = -D + i * ((2 * D) / 4) + 0.004;
    const z1 = -D + (i + 1) * ((2 * D) / 4) - 0.004;
    b.box(-W, H - 0.05, z0, W, H, z1, vary(WOOD.light, rng, 0.08));
  }
  // The survey sheet: the Hollow's outline, the routes, the rift, in ink and red.
  const y = H;
  b.box(-0.56, y, -0.36, 0.5, y + 0.004, 0.34, CLOTH.cream);
  b.box(-0.5, y + 0.004, -0.3, 0.44, y + 0.0055, -0.29, INK);
  b.box(-0.5, y + 0.004, 0.27, 0.44, y + 0.0055, 0.28, INK);
  b.box(-0.5, y + 0.004, -0.3, -0.49, y + 0.0055, 0.28, INK);
  b.box(0.43, y + 0.004, -0.3, 0.44, y + 0.0055, 0.28, INK);
  for (let i = 0; i < 14; i++) {
    const x = rng.range(-0.44, 0.32);
    const z = rng.range(-0.24, 0.2);
    const len = rng.range(0.04, 0.14);
    const along = rng.chance(0.5);
    b.box(x, y + 0.004, z, x + (along ? len : 0.006), y + 0.0055, z + (along ? 0.006 : len), INK);
  }
  // The route in red over the ink, a hair above it (no shared plane).
  b.box(0.1, y + 0.0055, 0.02, 0.3, y + 0.0072, 0.06, CLOTH.red);
  b.box(0.18, y + 0.0055, -0.12, 0.22, y + 0.0068, 0.02, CLOTH.red);
  b.box(0.18, y + 0.0055, 0.06, 0.22, y + 0.0068, 0.14, CLOTH.red);
  // Pins at the corners, copper heads.
  for (const [x, z] of [[-0.54, -0.34], [0.48, -0.34], [-0.54, 0.32], [0.48, 0.32]] as const) b.cube(x, y + 0.012, z, 0.02, 0.02, 0.02, COPPER.light);
  // A brass compass, a measuring rod, a ledger.
  b.push().translate(-0.3, y + 0.0055, 0.12);
  b.box(-0.06, 0, -0.06, 0.06, 0.02, 0.06, COPPER.mid);
  b.box(-0.05, 0.02, -0.05, 0.05, 0.024, 0.05, CLOTH.cream);
  b.box(-0.004, 0.024, -0.04, 0.004, 0.028, 0.04, CLOTH.red);
  b.pop();
  beam(b, -0.6, y + 0.012, -0.4, 0.2, y + 0.012, -0.42, 0.018, 0.012, WOOD.pale);
  b.push().translate(0.58, y, 0.18).rotateY(0.3);
  b.box(-0.11, 0, -0.08, 0.11, 0.035, 0.08, LEATHER.dark);
  b.box(-0.1, 0.035, -0.07, 0.1, 0.04, 0.07, shade(CLOTH.cream, 0.92));
  b.pop();
  // The lamp at the back corner (a small warm glow; the camp's lamps do the lighting).
  b.push().translate(0.56, y, -0.32);
  b.box(-0.05, 0, -0.05, 0.05, 0.03, 0.05, IRON.dark);
  b.box(-0.035, 0.03, -0.035, 0.035, 0.13, 0.035, IRON.mid);
  g.box(-0.028, 0.04, -0.028, 0.028, 0.12, 0.028, FIRE.yellow, 0.8);
  b.box(-0.045, 0.13, -0.045, 0.045, 0.15, 0.045, IRON.dark);
  b.pop();
  m.anim = 'lantern';
  m.glowScale = 1.2;
  m.hitBoxes = [boxOf(-W - 0.02, 0, -D - 0.04, W + 0.02, H + 0.2, D + 0.04)];
}

/** Socket centres on the Relic Shelf's face (x, y), glyph order. */
export const SHELF_SOCKETS: ReadonlyArray<readonly [number, number]> = [
  [-0.39, 1.06], [-0.13, 1.06], [0.13, 1.06], [0.39, 1.06],
  [-0.39, 0.72], [-0.13, 0.72], [0.13, 0.72], [0.39, 0.72],
];

/**
 * The Relic Shelf: a dressed stone slab on a plinth, eight octagonal sockets in two rows. The
 * variant is the mask of lit sockets (bit i = glyph i): a lit socket holds its rune, inked cold.
 */
export function relicShelf(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const g = m.glow;
  // Plinth and slab.
  b.box(-0.62, 0, -0.26, 0.62, 0.16, 0.26, BRICK.mid);
  b.box(-0.6, 0.16, -0.22, 0.6, 0.3, 0.22, BRICK.base);
  b.box(-0.56, 0.3, -0.14, 0.56, 1.34, 0.08, BRICK.light);
  b.box(-0.6, 1.34, -0.18, 0.6, 1.42, 0.12, BRICK.mid);
  b.box(-0.5, 1.42, -0.12, 0.5, 1.47, 0.06, BRICK.base);
  // A shelf ledge under each row.
  for (const yy of [0.56, 0.9]) b.box(-0.54, yy, 0.08, 0.54, yy + 0.04, 0.16, BRICK.mid);
  // Worn edges.
  for (let i = 0; i < 6; i++) b.cube(rng.range(-0.55, 0.55), rng.range(0.32, 1.32), 0.082, rng.range(0.03, 0.07), rng.range(0.02, 0.05), 0.004, BRICK.dark);
  const mask = o.variant & 0xff;
  for (let i = 0; i < 8; i++) {
    const [x, y] = SHELF_SOCKETS[i];
    // The socket: an octagonal recess (a square with cut corners), dark inside.
    b.box(x - 0.09, y - 0.07, 0.08, x + 0.09, y + 0.07, 0.085, BRICK.mortar, 0, false);
    b.box(x - 0.07, y - 0.09, 0.08, x + 0.07, y + 0.09, 0.085, BRICK.mortar, 0, false);
    if (!(mask & (1 << i))) continue;
    // A lit socket: the rune's small stone, its glyph inked.
    b.box(x - 0.07, y - 0.075, 0.085, x + 0.07, y + 0.075, 0.11, SLATE[4]);
    const px = 0.0085;
    for (const [gx, gy] of uniq(runePixels(i))) g.box(x + (gx - 8) * px, y + (8 - gy) * px - px, 0.11, x + (gx - 7) * px, y + (8 - gy) * px, 0.114, CYAN.light, 0.9);
  }
  m.anim = 'glyph';
  m.glowScale = 1.3;
  m.hitBoxes = [boxOf(-0.62, 0, -0.26, 0.62, 1.47, 0.26)];
}

/**
 * A rune stone: a weathered standing stone set in the floor, one glyph inked on its face. The
 * variant is the glyph (config/runes).
 */
export function runeStone(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  const g = m.glow;
  const glyph = o.variant % 8;
  // Footing stones.
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    const s = rng.range(0.06, 0.11);
    b.cube(Math.cos(a) * 0.27, s / 2, Math.sin(a) * 0.17, s, s, s, vary(BRICK.mid, rng, 0.1));
  }
  // The stone, tapering, leaning back a little, its crown broken.
  b.push().translate(0, 0.02, 0).rotateX(-0.05).rotateZ(rng.range(-0.04, 0.04));
  b.box(-0.24, 0, -0.12, 0.24, 0.12, 0.12, BRICK.base);
  b.box(-0.22, 0.12, -0.11, 0.22, 0.62, 0.1, BRICK.light);
  b.box(-0.2, 0.62, -0.1, 0.19, 0.74, 0.09, BRICK.mid);
  b.box(-0.17, 0.74, -0.09, 0.08, 0.8, 0.08, BRICK.light);
  b.box(-0.205, 0.16, 0.1, 0.205, 0.6, 0.104, BRICK.base);
  // Chips off the edges.
  for (let i = 0; i < 4; i++) b.cube(rng.chance(0.5) ? -0.215 : 0.215, rng.range(0.2, 0.6), rng.range(-0.08, 0.08), 0.02, rng.range(0.04, 0.08), 0.05, BRICK.dark);
  // The glyph, inked on the face (16 x 16 grid, 0.024 m a pixel).
  const px = 0.024;
  for (const [gx, gy] of uniq(runePixels(glyph))) g.box((gx - 8) * px, 0.2 + (15 - gy) * px, 0.104, (gx - 7) * px, 0.2 + (16 - gy) * px, 0.11, gy % 5 === 0 ? CYAN.white : CYAN.light, 0.95);
  b.pop();
  m.anim = 'glyph';
  m.glowScale = 1.5;
  m.hitBoxes = [boxOf(-0.28, 0, -0.18, 0.28, 0.82, 0.18)];
}

function uniq(px: Array<[number, number]>): Array<[number, number]> {
  const seen = new Set<number>();
  return px.filter(([x, y]) => {
    const k = x * 32 + y;
    if (seen.has(k)) return false;
    seen.add(k);
    return x >= 0 && x < 16 && y >= 0 && y < 16;
  });
}

function boxOf(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
}
