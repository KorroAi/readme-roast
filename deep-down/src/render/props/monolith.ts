import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { VoxBuilder } from '../voxModel';
import type { ModelBuilder } from './models';
import { BRICK, CYAN, VIOLET } from './palette';
import { vary } from './shapes';

/** Plinth steps (half-width, top), the battered shaft (half-width at its foot and head). */
const PLINTH = [
  { hw: 7.4, y1: 1.1 },
  { hw: 6.3, y1: 2.4 },
] as const;
const SHAFT_Y0 = PLINTH[1].y1;
const SHAFT_Y1 = 21.5;
const SHAFT_HW0 = 4.7;
const SHAFT_HW1 = 3.0;
/** Corner chamfer of the shaft (m, along each face). */
const CORNER = 0.55;
/** Incised rings round the shaft: their middle heights. */
const RINGS = [8.2, 14.4, 19.2] as const;
const APEX = 25.2;
const CORE_Y = 26.6;
/** The portal on the front (+Z): half-width, sill and lintel heights, its niche. */
const PORTAL_HW = 2.1;
const PORTAL_TOP = 12.6;
const NICHE_HW = 1.0;
const NICHE_TOP = 10.9;

const hwAt = (y: number) => SHAFT_HW0 + ((SHAFT_HW1 - SHAFT_HW0) * (y - SHAFT_Y0)) / (SHAFT_Y1 - SHAFT_Y0);

/**
 * The abyss monolith: an ancient battered pylon deep in the rift (~25 m to its pyramidion, 15 m
 * across its stepped plinth), facing +Z. It is seen from the balcony through violet haze, so it is
 * one large silhouette with few, meaningful lines: three incised rings round the shaft, a portal
 * at its foot whose niche breathes the abyss's violet (the way on, below), and the only cyan of the
 * deep in the core that floats over the capstone. Weathered: stones fallen from the plinth, a
 * chipped arris here and there.
 */
export function buildMonolith(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;

  // Plinth: two broad steps with a cornice each; the stair cuts through their front.
  const sh = PORTAL_HW - 0.2;
  const notched = (x0: number, yA: number, zA: number, x1: number, yB: number, zB: number, color: number) => {
    b.box(x0, yA, zA, x1, yB, SHAFT_HW0, color);
    b.box(x0, yA, SHAFT_HW0, -sh, yB, zB, color);
    b.box(sh, yA, SHAFT_HW0, x1, yB, zB, color);
  };
  let y0 = 0;
  for (const p of PLINTH) {
    notched(-p.hw, y0, -p.hw, p.hw, p.y1 - 0.22, p.hw, BRICK.dark);
    notched(-p.hw - 0.12, p.y1 - 0.22, -p.hw - 0.12, p.hw + 0.12, p.y1, p.hw + 0.12, BRICK.mid);
    y0 = p.y1;
  }
  // Grand stair up the plinth's front to the portal: one slab per step (no coplanar faces).
  const steps = 8;
  const z0 = PLINTH[0].hw + 0.12;
  const run = (z0 - SHAFT_HW0) / steps;
  for (let k = 0; k < steps; k++) {
    const top = ((k + 1) * SHAFT_Y0) / steps;
    b.box(-sh, (k * SHAFT_Y0) / steps, SHAFT_HW0, sh, top, z0 - k * run + 0.02, k % 2 ? BRICK.base : BRICK.mid);
  }

  // Shaft: battered, corners chamfered, in stacked segments with an incised ring between them.
  const segs: Array<[number, number, number]> = [];
  let ya = SHAFT_Y0;
  for (const r of RINGS) {
    segs.push([ya, r - 0.22, 0]);
    segs.push([r - 0.22, r + 0.22, 0.16]);
    ya = r + 0.22;
  }
  segs.push([ya, SHAFT_Y1, 0]);
  for (const [s0, s1, inset] of segs) frustum(b, s0, s1, hwAt(s0) - inset, hwAt(s1) - inset, inset ? BRICK.dark : BRICK.base);
  // Capstone: a pyramidion over a thin cornice.
  b.box(-SHAFT_HW1 - 0.25, SHAFT_Y1, -SHAFT_HW1 - 0.25, SHAFT_HW1 + 0.25, SHAFT_Y1 + 0.45, SHAFT_HW1 + 0.25, BRICK.mid);
  pyramid(b, SHAFT_Y1 + 0.45, APEX, SHAFT_HW1 + 0.1, BRICK.light);

  // Portal at the foot of the front face: two piers and a lintel standing out of the batter,
  // a cornice over them, and the niche between them, dark, with the deep's violet inside.
  const zf = SHAFT_HW0 + 0.25;
  const zb = hwAt(PORTAL_TOP) - 0.3;
  b.box(-PORTAL_HW, SHAFT_Y0, zb, -NICHE_HW, PORTAL_TOP, zf, BRICK.base);
  b.box(NICHE_HW, SHAFT_Y0, zb, PORTAL_HW, PORTAL_TOP, zf, BRICK.base);
  b.box(-NICHE_HW, NICHE_TOP, zb, NICHE_HW, PORTAL_TOP, zf, BRICK.base);
  b.box(-PORTAL_HW - 0.3, PORTAL_TOP, zb, PORTAL_HW + 0.3, PORTAL_TOP + 0.5, zf + 0.25, BRICK.mid);
  // The niche: its back just in front of the battered face (the piers stand out of it), a soft
  // violet glow low and deep in it.
  const zn = SHAFT_HW0 + 0.04;
  b.box(-NICHE_HW, SHAFT_Y0, zn - 0.2, NICHE_HW, NICHE_TOP, zn, 0x07080c);
  g.box(-NICHE_HW + 0.12, SHAFT_Y0, zn, NICHE_HW - 0.12, NICHE_TOP - 1.4, zn + 0.03, VIOLET.deep, 0.55);
  g.box(-NICHE_HW + 0.35, SHAFT_Y0, zn + 0.03, NICHE_HW - 0.35, SHAFT_Y0 + 3.2, zn + 0.05, VIOLET.dark, 0.7);
  // Its sill: the one line of light that reaches out (the abyss seeping over the threshold).
  g.box(-NICHE_HW + 0.05, SHAFT_Y0 - 0.02, zn + 0.06, NICHE_HW - 0.05, SHAFT_Y0 + 0.03, zf + 0.04, VIOLET.mid, 0.6);

  // Fallen blocks resting on the plinth ledges (kept off the stair).
  for (let i = 0; i < 8; i++) {
    const ti = rng.int(0, 1);
    const ledge = PLINTH[ti];
    const inner = ti === 0 ? PLINTH[1].hw : SHAFT_HW0;
    const r = rng.range(inner + 0.4, ledge.hw - 0.3);
    const u = rng.range(-r, r);
    const side = rng.int(0, 3);
    if (side === 0 && Math.abs(u) < PORTAL_HW + 0.8) continue;
    const s = rng.range(0.45, 1.0);
    b.push().rotateY((side * Math.PI) / 2).translate(u, ledge.y1, r).rotateY(rng.range(-0.6, 0.6)).rotateZ(rng.range(-0.12, 0.12));
    b.box(-s / 2, 0, -s * 0.42, s / 2, s * rng.range(0.5, 0.85), s * 0.42, vary(BRICK.base, rng, 0.1));
    b.pop();
  }

  // The core floats over the capstone: the deep's only cyan, a slow-turning crystal.
  const core = m.part(0, CORE_Y, 0, 'float', 0);
  core.crystal(0.6, 0.32, 0.95, 6, CYAN.light, CYAN.mid, 0.95);
  core.push().rotateX(Math.PI).crystal(0.6, 0.32, 0.95, 6, CYAN.mid, CYAN.dark, 0.95).pop();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    core.cube(Math.cos(a) * 1.2, Math.sin(a * 2) * 0.12, Math.sin(a) * 1.2, 0.12, 0.12, 0.12, CYAN.mid, 0.9);
  }

  const box = (x0: number, yA: number, zA: number, x1: number, yB: number, zB: number) => new THREE.Box3(new THREE.Vector3(x0, yA, zA), new THREE.Vector3(x1, yB, zB));
  m.hitBoxes = [
    box(-PLINTH[0].hw - 0.3, 0, -PLINTH[0].hw - 0.3, PLINTH[0].hw + 0.3, PLINTH[0].y1, PLINTH[0].hw + 0.3),
    box(-PLINTH[1].hw - 0.3, PLINTH[0].y1, -PLINTH[1].hw - 0.3, PLINTH[1].hw + 0.3, PLINTH[1].y1, PLINTH[1].hw + 0.3),
    box(-SHAFT_HW0, SHAFT_Y0, -SHAFT_HW0, SHAFT_HW0, SHAFT_Y1, SHAFT_HW0 + 0.25),
    box(-SHAFT_HW1, SHAFT_Y1, -SHAFT_HW1, SHAFT_HW1, CORE_Y + 1.3, SHAFT_HW1),
  ];
  m.anim = 'monolith';
  m.glowScale = 1.6;
}

/**
 * A battered square frustum from y0 (half-width w0) to y1 (w1), corners chamfered (CORNER), its
 * faces leaning inward: 4 wide faces and 4 corner faces, open top and bottom (stacked).
 */
function frustum(b: VoxBuilder, y0: number, y1: number, w0: number, w1: number, color: number): void {
  const c0 = Math.min(CORNER, w0 * 0.3);
  const c1 = Math.min(CORNER, w1 * 0.3);
  // Octagon outline (counter-clockwise from above, starting at the front-right).
  const ring = (w: number, c: number): Array<[number, number]> => [
    [w - c, w],
    [-w + c, w],
    [-w, w - c],
    [-w, -w + c],
    [-w + c, -w],
    [w - c, -w],
    [w, -w + c],
    [w, w - c],
  ];
  const a = ring(w0, c0);
  const t = ring(w1, c1);
  const rgb = hexRgb(color);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    const p0: [number, number, number] = [a[i][0], y0, a[i][1]];
    const p1: [number, number, number] = [a[j][0], y0, a[j][1]];
    const p2: [number, number, number] = [t[j][0], y1, t[j][1]];
    const p3: [number, number, number] = [t[i][0], y1, t[i][1]];
    const n = faceN(p0, p1, p2);
    b.quad([p1, p0, p3, p2], n, i % 2 ? shadeRgb(rgb, 0.92) : rgb, 0);
  }
}

/** A four-sided pyramid from a square of half-width w at y0 to an apex at y1. */
function pyramid(b: VoxBuilder, y0: number, y1: number, w: number, color: number): void {
  const rgb = hexRgb(color);
  const apex: [number, number, number] = [0, y1, 0];
  const c: Array<[number, number]> = [[w, w], [-w, w], [-w, -w], [w, -w]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const p0: [number, number, number] = [c[i][0], y0, c[i][1]];
    const p1: [number, number, number] = [c[j][0], y0, c[j][1]];
    b.tri(p1, p0, apex, faceN(p0, p1, apex), i % 2 ? shadeRgb(rgb, 0.9) : rgb, 0);
  }
}

/** Outward normal of a face whose outline p0 -> p1 runs clockwise seen from outside. */
function faceN(p0: number[], p1: number[], p2: number[]): [number, number, number] {
  const u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const v = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
  const n = [u[2] * v[1] - u[1] * v[2], u[0] * v[2] - u[2] * v[0], u[1] * v[0] - u[0] * v[1]];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

function hexRgb(c: number): number[] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function shadeRgb(c: number[], k: number): number[] {
  return c.map((v) => Math.round(v * k));
}
