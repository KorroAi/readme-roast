import type * as THREE from 'three';
import { Rng } from '../../core/rng';
import { VoxBuilder } from '../voxModel';
import type { ModelBuilder, PropModelOptions } from './models';
import { CLOTH, FIRE, IRON, LEATHER, ROPE, WOOD } from './palette';
import { beam, disc, ring, shade, vary } from './shapes';

/**
 * Props of the world-variety pass (the old feature pass): the Halden logs, the hoist gear, and the
 * pack an explorer leaves behind on a black-out. Halden timber, iron and leather; nothing cyan.
 * Every model stands on y = 0 and faces +Z, like the others in models.ts.
 */

const INK = 0x2a2420;

/**
 * A Halden log. Variant 0: a ledger lying open on a surface, a pencil in the gutter, a loose sheet
 * beside it. Variant 1: a survey sheet pinned under a tin strip to a slanted board with an oilcloth
 * hood, on a bracket that sits on top of a post.
 */
export function haldenNote(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  if (o.variant === 0) {
    b.box(-0.22, 0, -0.15, 0.22, 0.016, 0.15, LEATHER.dark);
    b.box(-0.205, 0.016, -0.137, -0.009, 0.034, 0.137, CLOTH.cream);
    b.box(0.009, 0.016, -0.137, 0.205, 0.038, 0.137, shade(CLOTH.cream, 0.96));
    b.box(-0.009, 0.016, -0.142, 0.009, 0.026, 0.142, LEATHER.mid);
    // Lines of figures down both pages (the right page is half written).
    for (let i = 0; i < 9; i++) {
      const z = -0.11 + i * 0.026;
      const l = rng.range(0.09, 0.16);
      b.box(-0.19, 0.034, z, -0.19 + l, 0.0355, z + 0.005, INK);
      if (i < 5) b.box(0.025, 0.038, z, 0.025 + rng.range(0.06, 0.15), 0.0395, z + 0.005, INK);
    }
    // A sketch of a hall in a box on the left page.
    b.box(-0.17, 0.0352, 0.115, -0.05, 0.0362, 0.12, INK);
    // The pencil, and the ribbon hanging out of the book.
    beam(b, 0.04, 0.043, 0.075, 0.18, 0.043, 0.095, 0.009, 0.009, WOOD.pale);
    beam(b, 0.18, 0.043, 0.095, 0.2, 0.043, 0.098, 0.005, 0.005, INK);
    b.box(-0.004, 0.026, 0.142, 0.004, 0.028, 0.2, CLOTH.red);
    // The loose sheet, half under the cover.
    b.push().translate(0.27, 0, -0.04).rotateY(0.45);
    b.box(-0.075, 0, -0.1, 0.075, 0.003, 0.1, shade(CLOTH.cream, 0.9));
    for (let i = 0; i < 5; i++) b.box(-0.06, 0.003, -0.08 + i * 0.03, -0.06 + rng.range(0.05, 0.11), 0.0042, -0.075 + i * 0.03, INK);
    b.pop();
    return;
  }
  // Bracket on the post top.
  b.box(-0.1, 0, -0.1, 0.1, 0.05, 0.1, IRON.dark);
  b.box(-0.025, 0.05, -0.06, 0.025, 0.12, 0.02, IRON.mid);
  b.push().translate(0, 0.08, 0.0).rotateX(-0.55);
  b.box(-0.19, 0, -0.014, 0.19, 0.31, 0.014, vary(WOOD.mid, rng, 0.06));
  b.box(-0.2, 0, -0.016, -0.18, 0.31, 0.02, WOOD.dark);
  b.box(0.18, 0, -0.016, 0.2, 0.31, 0.02, WOOD.dark);
  b.box(-0.15, 0.03, 0.014, 0.15, 0.255, 0.018, CLOTH.cream);
  for (let i = 0; i < 7; i++) {
    const y = 0.05 + i * 0.026;
    b.box(-0.13, y, 0.018, -0.13 + rng.range(0.1, 0.24), y + 0.006, 0.0195, INK);
  }
  b.box(-0.17, 0.235, 0.0195, 0.17, 0.26, 0.026, IRON.light);
  for (const x of [-0.15, 0.15]) b.box(x - 0.008, 0.24, 0.026, x + 0.008, 0.256, 0.03, IRON.shine);
  // The oilcloth hood over the top edge.
  b.push().translate(0, 0.31, 0.0).rotateX(0.9);
  b.box(-0.215, 0, -0.012, 0.215, 0.11, 0.0, CLOTH.canvasDark);
  b.pop();
  b.pop();
}

/**
 * Hoist gear. Variant 0: a sheave block (an iron-cheeked pulley) that hangs under the headframe's
 * apex, its top at 0.85 m. Variant 1: a ratchet drum on a timber stand, wound with rope, with a pawl
 * and a crank: the brake and release at either end of the hoist, and the capstan at the rift rope.
 */
export function hoistWinch(m: ModelBuilder, rng: Rng, o: PropModelOptions): void {
  const b = m.body;
  if (o.variant === 0) {
    for (const s of [-1, 1]) b.box(s > 0 ? 0.055 : -0.075, 0.1, -0.3, s > 0 ? 0.075 : -0.055, 0.7, 0.3, IRON.dark);
    b.push().translate(0, 0.42, 0).rotateZ(Math.PI / 2);
    ring(b, { sides: 12, radius: 0.235, thickness: 0.06, y0: -0.035, y1: 0.035, color: (i) => (i % 2 ? IRON.mid : IRON.light) });
    ring(b, { sides: 12, radius: 0.27, thickness: 0.026, y0: -0.018, y1: 0.018, color: () => ROPE.mid, phase: 0.2 });
    disc(b, 0.07, -0.05, 0.05, IRON.shine);
    for (let k = 0; k < 3; k++) {
      b.push().rotateY((k * Math.PI) / 3);
      b.box(-0.21, -0.014, -0.016, 0.21, 0.014, 0.016, IRON.mid);
      b.pop();
    }
    b.pop();
    // The axle bolt through both cheeks, and the strap up to the apex.
    beam(b, -0.1, 0.42, 0, 0.1, 0.42, 0, 0.05, 0.05, IRON.light);
    b.box(-0.09, 0.7, -0.055, 0.09, 0.78, 0.055, IRON.mid);
    b.box(-0.05, 0.78, -0.035, 0.05, 0.85, 0.035, IRON.dark);
    b.box(-0.08, 0.094, -0.09, 0.08, 0.14, 0.09, IRON.mid);
    return;
  }
  // Two A-frames on sills.
  for (const x of [-0.5, 0.5]) {
    b.box(x - 0.055, 0, -0.38, x + 0.055, 0.08, 0.38, vary(WOOD.dark, rng, 0.05));
    beam(b, x, 0.04, -0.32, x, 0.76, -0.02, 0.09, 0.09, vary(WOOD.mid, rng, 0.06));
    beam(b, x, 0.04, 0.32, x, 0.76, 0.02, 0.092, 0.092, vary(WOOD.mid, rng, 0.06));
    b.box(x - 0.06, 0.62, -0.07, x + 0.06, 0.66, 0.07, IRON.dark);
  }
  beam(b, -0.5, 0.2, 0, 0.5, 0.2, 0, 0.06, 0.07, WOOD.light);
  beam(b, -0.62, 0.7, 0, 0.62, 0.7, 0, 0.05, 0.05, IRON.dark);
  // The drum, its flanges and the rope wound on it.
  b.push().translate(0, 0.7, 0).rotateZ(Math.PI / 2);
  ring(b, { sides: 10, radius: 0.14, thickness: 0.1, y0: -0.36, y1: 0.36, color: (i) => (i % 2 ? WOOD.light : WOOD.mid) });
  for (let k = 0; k < 7; k++) {
    const y = -0.3 + k * 0.092;
    ring(b, { sides: 10, radius: 0.215, thickness: 0.044, y0: y, y1: y + 0.08, color: (i) => ((i + k) % 2 ? ROPE.mid : ROPE.light), phase: k * 0.15 });
  }
  disc(b, 0.27, -0.42, -0.37, IRON.mid);
  disc(b, 0.27, 0.37, 0.42, IRON.mid);
  b.pop();
  // The ratchet wheel and its pawl on the left; the crank on the right.
  b.push().translate(-0.47, 0.7, 0).rotateZ(Math.PI / 2);
  ring(b, { sides: 12, radius: 0.27, thickness: 0.06, y0: -0.022, y1: 0.022, color: (i) => (i % 2 ? IRON.light : IRON.dark) });
  disc(b, 0.08, -0.03, 0.03, IRON.shine);
  b.pop();
  beam(b, -0.565, 0.38, 0.3, -0.545, 0.82, 0.235, 0.03, 0.03, IRON.light);
  beam(b, 0.62, 0.7, 0, 0.66, 0.44, 0.16, 0.04, 0.04, IRON.mid);
  beam(b, 0.64, 0.44, 0.16, 0.78, 0.44, 0.16, 0.05, 0.05, WOOD.pale);
  // A length of chain off the drum to the floor.
  for (let k = 0; k < 7; k++) {
    const t = k / 6;
    const z = 0.27 + t * 0.32;
    const y = 0.62 * (1 - t) * (1 - t) + 0.02;
    b.push().translate(0.12, y, z).rotateX(k % 2 ? 0.9 : -0.2).rotateY(k % 2 ? Math.PI / 2 : 0);
    b.box(-0.03, -0.012, -0.012, 0.03, 0.012, 0.012, k % 2 ? IRON.mid : IRON.dark);
    b.pop();
  }
}

/**
 * The pack left behind on a black-out: a worn leather satchel lying where its owner fell, the strap
 * trailing, and the explorer's ember tin still glowing in its clip so it can be found again.
 */
export function satchel(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;
  b.push().rotateY(0.25);
  b.box(-0.2, 0, -0.12, 0.2, 0.2, 0.12, LEATHER.mid);
  b.box(-0.19, 0.2, -0.11, 0.19, 0.235, 0.11, shade(LEATHER.mid, 1.08));
  // The flap over the top and down the front, two straps and a buckle.
  b.box(-0.205, 0.235, -0.03, 0.205, 0.252, 0.144, LEATHER.dark);
  b.box(-0.205, 0.085, 0.12, 0.205, 0.252, 0.144, LEATHER.dark);
  for (const x of [-0.12, 0.12]) b.box(x - 0.022, 0.07, 0.144, x + 0.022, 0.256, 0.152, vary(LEATHER.light, rng, 0.05));
  b.box(-0.032, 0.11, 0.152, 0.032, 0.15, 0.16, IRON.shine);
  b.box(-0.014, 0.118, 0.16, 0.014, 0.142, 0.165, IRON.dark);
  // Side pocket, and the ember tin clipped to the other side, a seam of embers showing.
  b.box(-0.235, 0.03, -0.07, -0.2, 0.15, 0.07, shade(LEATHER.mid, 0.9));
  b.box(0.2, 0.05, -0.055, 0.245, 0.14, 0.055, IRON.dark);
  b.box(0.21, 0.14, -0.012, 0.235, 0.17, 0.012, IRON.mid);
  g.box(0.245, 0.08, -0.038, 0.25, 0.1, 0.038, FIRE.ember, 0.9);
  g.box(0.245, 0.1, -0.022, 0.249, 0.11, 0.022, FIRE.orange, 1);
  // The shoulder strap trailing over the floor.
  let x = 0.18;
  let z = -0.12;
  let a = -0.6;
  for (let i = 0; i < 6; i++) {
    const nx = x + Math.cos(a) * 0.09;
    const nz = z + Math.sin(a) * 0.09;
    beam(b, x, 0.008, z, nx, 0.008, nz, 0.042, i % 2 ? 0.014 : 0.0146, i % 2 ? LEATHER.dark : shade(LEATHER.dark, 1.1));
    x = nx;
    z = nz;
    a += rng.range(0.25, 0.6);
  }
  b.pop();
  m.anim = 'fire';
  m.glowScale = 1.3;
}

/**
 * The Halden hoist's cage: a plank platform with a low rail, four chains to a spreader and the
 * hook the rope takes. Its walking surface is at y = 0 (the explorer's feet); the hook's eye is at
 * HOIST_CAGE_HOOK. Built once; game/WorldFeatures moves it with the ride.
 */
export const HOIST_CAGE_HOOK = 2.45;

export function hoistCageGeometry(): THREE.BufferGeometry {
  const b = new VoxBuilder();
  const h = 0.62;
  b.box(-h, -0.14, -h, h, -0.02, h, WOOD.dark);
  for (let i = 0; i < 6; i++) {
    const z0 = -h + 0.02 + i * 0.205;
    b.box(-h + 0.02, -0.02, z0, h - 0.02, 0.0, z0 + 0.195, vary(WOOD.mid, CAGE_RNG, 0.08));
  }
  // Iron corner straps and a waist-high rail on three sides (open toward the stand).
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.box(sx * h - 0.035, -0.16, sz * h - 0.035, sx * h + 0.035, 0.95, sz * h + 0.035, IRON.dark);
      beam(b, sx * h, 0.95, sz * h, sx * 0.12, HOIST_CAGE_HOOK - 0.55, sz * 0.12, 0.022, 0.022, IRON.mid);
    }
  b.box(-h, 0.88, -h - 0.03, h, 0.94, -h + 0.03, WOOD.light);
  b.box(-h, 0.88, h - 0.03, h, 0.94, h + 0.03, WOOD.light);
  b.box(h - 0.03, 0.88, -h + 0.03, h + 0.03, 0.94, h - 0.03, WOOD.light);
  b.box(-h - 0.032, 0.42, -h + 0.03, -h + 0.028, 0.47, h - 0.03, WOOD.light);
  // Spreader and hook.
  b.box(-0.2, HOIST_CAGE_HOOK - 0.6, -0.2, 0.2, HOIST_CAGE_HOOK - 0.52, 0.2, IRON.mid);
  b.box(-0.03, HOIST_CAGE_HOOK - 0.52, -0.03, 0.03, HOIST_CAGE_HOOK - 0.1, 0.03, IRON.dark);
  b.box(-0.07, HOIST_CAGE_HOOK - 0.12, -0.02, 0.07, HOIST_CAGE_HOOK, 0.02, IRON.light);
  return b.build();
}

/** The hoist rope: one metre of rope standing on y = 0 (scaled along y to its length). */
export function hoistRopeGeometry(): THREE.BufferGeometry {
  return new VoxBuilder().box(-0.035, 0, -0.035, 0.035, 1, 0.035, ROPE.mid, 0, false).build();
}

const CAGE_RNG = new Rng(0xca9e);
