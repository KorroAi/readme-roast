import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { VoxBuilder } from '../voxModel';
import type { ModelBuilder } from './models';
import { BRICK, CYAN, VIOLET } from './palette';
import { vary } from './shapes';

/** Stepped tiers from the plinth to the crown: half-width and vertical span, in meters. */
const TIERS = [
  { hw: 7.0, y0: 0, y1: 1.6 },
  { hw: 6.0, y0: 1.6, y1: 4.0 },
  { hw: 5.0, y0: 4.0, y1: 7.5 },
  { hw: 3.6, y0: 7.5, y1: 15.5 },
  { hw: 3.0, y0: 15.5, y1: 20.5 },
  { hw: 2.2, y0: 20.5, y1: 22.5 },
] as const;

/** The lower tiers are plinths; the grand stair cuts through their front up to the shaft. */
const PLINTHS = 3;
const SHAFT = TIERS[3].hw;
const STAIR_TOP = TIERS[2].y1;
const STAIR_HALF = 1.5;
const STEPS = 15;
const DOOR_HALF = 0.9;
const CORE_Y = 24.6;

/**
 * The abyss monolith: a stepped ancient tower deep in the rift, ~26 m tall and 14 m wide, facing +Z.
 * It is mostly seen from far away through fog, so the design leans on silhouette (stepped tiers,
 * corner pilasters, a horned crown and a floating core) and on thin cyan and violet lines that
 * punch through the haze. Surface relief is coarse; the whole model is roughly 650 boxes.
 */
export function buildMonolith(m: ModelBuilder, rng: Rng): void {
  const b = m.body;
  const g = m.glow;
  const L = m.layers;

  TIERS.forEach((t, ti) => {
    if (ti < PLINTHS) {
      b.box(-t.hw, t.y0, -t.hw, t.hw, t.y1, SHAFT, BRICK.dark);
      b.box(-t.hw, t.y0, SHAFT, -STAIR_HALF, t.y1, t.hw, BRICK.dark);
      b.box(STAIR_HALF, t.y0, SHAFT, t.hw, t.y1, t.hw, BRICK.dark);
    } else {
      b.box(-t.hw, t.y0, -t.hw, t.hw, t.y1, t.hw, BRICK.dark);
    }
    b.box(-t.hw - 0.12, t.y0, -t.hw - 0.12, t.hw + 0.12, t.y0 + 0.35, t.hw + 0.12, BRICK.mortar);
    for (let side = 0; side < 4; side++) {
      const front = side === 0;
      L.push().rotateY((side * Math.PI) / 2);
      // Cornices stand a little proud of the tier top, adjacent sides at different heights, so
      // no two ledge faces share a plane where they overlap (that z-fights at a distance).
      cornice(b, rng, t.hw, t.y1 + 0.03 + 0.02 * (side % 2), front && ti < PLINTHS);
      if (ti < PLINTHS) plinthFace(b, g, rng, t.hw, t.y0, t.y1, front);
      else if (ti === 3) shaftFace(b, g, t.hw, t.y0, t.y1, front, [-1, 0, 1], [9.3, 12.3, 14.5], [11.0, 13.5], 2.0);
      else if (ti === 4) shaftFace(b, g, t.hw, t.y0, t.y1, false, [-0.7, 0.7], [17.2, 19.4], [18.3], 1.6);
      else crownFace(b, g, t.hw, t.y0, t.y1);
      L.pop();
    }
  });

  // Corner pilasters rise past the shaft tiers like small towers, each banded with violet light.
  for (const [hw, y0, y1, w] of [[3.6, 7.5, 16.4, 0.75], [3.0, 15.5, 21.2, 0.6]] as const) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const cx = sx * hw;
        const cz = sz * hw;
        b.box(cx - w / 2, y0, cz - w / 2, cx + w / 2, y1, cz + w / 2, BRICK.mid);
        b.box(cx - w / 2 - 0.08, y1, cz - w / 2 - 0.08, cx + w / 2 + 0.08, y1 + 0.25, cz + w / 2 + 0.08, BRICK.light);
        g.box(cx - 0.12, y1 - 0.9, cz - w / 2 - 0.02, cx + 0.12, y1 - 0.3, cz + w / 2 + 0.02, VIOLET.mid, 0.85);
        g.box(cx - w / 2 - 0.02, y1 - 0.9, cz - 0.12, cx + w / 2 + 0.02, y1 - 0.3, cz + 0.12, VIOLET.mid, 0.85);
      }
  }

  // Horned crown: four stacked horns leaning inward, tipped with violet, around a cyan dais.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      let x = sx * 1.75;
      let z = sz * 1.75;
      let y = TIERS[5].y1;
      for (const [w, h] of [[0.9, 1.1], [0.62, 1.0], [0.4, 0.7]]) {
        b.box(x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2, BRICK.mid);
        y += h;
        x -= sx * 0.18;
        z -= sz * 0.18;
      }
      g.box(x - 0.13, y, z - 0.13, x + 0.13, y + 0.26, z + 0.13, VIOLET.light, 0.95);
    }
  b.box(-1.0, TIERS[5].y1, -1.0, 1.0, TIERS[5].y1 + 0.3, 1.0, BRICK.light);
  g.box(-0.5, TIERS[5].y1 + 0.3, -0.5, 0.5, TIERS[5].y1 + 0.36, 0.5, CYAN.mid, 0.9);

  // Grand stair: one slab per step (no coplanar faces), every third nosing lit in cyan.
  const z0 = TIERS[0].hw;
  const rise = STAIR_TOP / STEPS;
  const run = (z0 - SHAFT) / STEPS;
  for (let k = 0; k < STEPS; k++) {
    const zf = z0 - k * run;
    const top = (k + 1) * rise;
    b.box(-STAIR_HALF, k * rise, SHAFT, STAIR_HALF, top, zf, k % 2 ? BRICK.base : BRICK.mid);
    if (k % 3 === 1) g.box(-STAIR_HALF + 0.15, top - 0.07, zf, STAIR_HALF - 0.15, top - 0.02, zf + 0.03, CYAN.mid, 0.85);
  }

  // The door: a dark opening with a violet frame and a faint glow deep inside.
  b.box(-DOOR_HALF, STAIR_TOP, SHAFT, DOOR_HALF, 10.6, SHAFT + 0.02, 0x07080c);
  g.box(-0.5, STAIR_TOP, SHAFT + 0.02, 0.5, 9.8, SHAFT + 0.03, VIOLET.deep, 0.5);
  g.box(-DOOR_HALF - 0.12, STAIR_TOP, SHAFT, -DOOR_HALF, 10.72, SHAFT + 0.06, VIOLET.mid, 0.85);
  g.box(DOOR_HALF, STAIR_TOP, SHAFT, DOOR_HALF + 0.12, 10.72, SHAFT + 0.06, VIOLET.mid, 0.85);
  g.box(-DOOR_HALF - 0.12, 10.6, SHAFT, DOOR_HALF + 0.12, 10.72, SHAFT + 0.06, VIOLET.mid, 0.85);

  // Fallen blocks resting on the plinth ledges (kept off the stair).
  for (let i = 0; i < 12; i++) {
    const ti = rng.int(0, PLINTHS - 1);
    const ledge = TIERS[ti];
    const inner = TIERS[ti + 1].hw;
    const r = rng.range(inner + 0.3, ledge.hw - 0.35);
    const u = rng.range(-r, r);
    const side = rng.int(0, 3);
    if (side === 0 && Math.abs(u) < STAIR_HALF + 0.6) continue;
    const s = rng.range(0.35, 0.8);
    b.push().rotateY((side * Math.PI) / 2).translate(u, ledge.y1, r).rotateY(rng.range(-0.6, 0.6)).rotateZ(rng.range(-0.15, 0.15));
    b.box(-s / 2, 0, -s * 0.4, s / 2, s * rng.range(0.5, 0.9), s * 0.4, vary(BRICK.base, rng, 0.1));
    b.pop();
  }

  // The core floats above the crown: a cyan-violet diamond with an orbiting ring of sparks.
  const core = m.part(0, CORE_Y, 0, 'float', 0);
  core.crystal(0.62, 0.3, 0.9, 6, CYAN.light, VIOLET.mid, 0.95);
  core.push().rotateX(Math.PI).crystal(0.62, 0.3, 0.9, 6, CYAN.mid, VIOLET.light, 0.95).pop();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    core.cube(Math.cos(a) * 1.15, Math.sin(a * 2) * 0.12, Math.sin(a) * 1.15, 0.14, 0.14, 0.14, i % 2 ? CYAN.light : VIOLET.light, 1);
  }

  // Picking uses the stepped tiers rather than one huge box, so mining near the base still works.
  const box = (x0: number, y0: number, zA: number, x1: number, y1: number, zB: number) =>
    new THREE.Box3(new THREE.Vector3(x0, y0, zA), new THREE.Vector3(x1, y1, zB));
  m.hitBoxes = TIERS.map((t) => box(-t.hw - 0.25, t.y0, -t.hw - 0.25, t.hw + 0.25, t.y1, t.hw + 0.25));
  m.hitBoxes.push(box(-2.3, TIERS[5].y1, -2.3, 2.3, CORE_Y + 1.3, 2.3));
  m.anim = 'monolith';
  m.glowScale = 1.85;
}

/** Segmented cornice along the +Z edge of a tier top; a few stones have fallen. */
function cornice(b: VoxBuilder, rng: Rng, hw: number, y1: number, notch: boolean): void {
  const segs = Math.max(2, Math.round(hw / 1.6));
  const len = (2 * hw + 0.5) / segs;
  for (let k = 0; k < segs; k++) {
    const x0 = -hw - 0.25 + k * len + 0.02;
    const x1 = x0 + len - 0.04;
    const fallen = rng.chance(0.12);
    if (fallen) continue;
    if (notch && x0 < STAIR_HALF && x1 > -STAIR_HALF) {
      // Split around the stair notch, capping its edges a little proud of the notch walls.
      const cap = STAIR_HALF - 0.03;
      if (x0 < -STAIR_HALF) b.box(x0, y1 - 0.35, hw - 0.3, -cap, y1, hw + 0.25, vary(BRICK.light, rng, 0.08));
      if (x1 > STAIR_HALF) b.box(cap, y1 - 0.35, hw - 0.3, x1, y1, hw + 0.25, vary(BRICK.light, rng, 0.08));
      continue;
    }
    b.box(x0, y1 - 0.35, hw - 0.3, x1, y1, hw + 0.25, vary(BRICK.light, rng, 0.08));
  }
}

/** Plinth tier face (+Z side): courses of large relief blocks under a band of cyan glyph dashes. */
function plinthFace(b: VoxBuilder, g: VoxBuilder, rng: Rng, hw: number, y0: number, y1: number, front: boolean): void {
  const bandY = y1 - 0.75;
  const rows = y1 - y0 > 2 ? 2 : 1;
  const rowH = (bandY - 0.1 - (y0 + 0.35)) / rows;
  const clear = (x0: number, x1: number, margin: number) => !front || x1 < -STAIR_HALF - margin || x0 > STAIR_HALF + margin;
  for (let r = 0; r < rows; r++) {
    const ya = y0 + 0.35 + r * rowH;
    let x = -hw + 0.1;
    while (x < hw - 0.3) {
      const x1 = Math.min(hw - 0.1, x + rng.range(1.2, 2.2));
      if (clear(x, x1, 0) && rng.chance(0.85)) {
        b.box(x + 0.05, ya + 0.05, hw - 0.1, x1 - 0.05, ya + rowH - 0.05, hw + rng.range(0.03, 0.1), vary(BRICK.base, rng, 0.12));
      }
      x = x1;
    }
  }
  let x = -hw + 0.4;
  while (x < hw - 0.5) {
    const x1 = Math.min(hw - 0.4, x + rng.range(0.3, 0.9));
    if (clear(x, x1, 0.3)) g.box(x, bandY, hw, x1, bandY + 0.12, hw + 0.04, rng.chance(0.3) ? CYAN.light : CYAN.mid, 0.85);
    x = x1 + rng.range(0.2, 0.45);
  }
}

/**
 * Shaft tier face (+Z side): two ribs carrying vertical cyan lines, string courses with violet
 * lines under them, and framed window slits (violet in the lowest row, cyan above).
 */
function shaftFace(
  b: VoxBuilder,
  g: VoxBuilder,
  hw: number,
  y0: number,
  y1: number,
  front: boolean,
  columns: readonly number[],
  rows: readonly number[],
  courses: readonly number[],
  ribX: number,
): void {
  for (const sx of [-1, 1]) {
    const x = sx * ribX;
    // Ribs stop just behind the cornice front and below the tier top so they never share a face.
    b.box(x - 0.25, y0, hw - 0.1, x + 0.25, y1 - 0.02, hw + 0.22, BRICK.mid);
    g.box(x - 0.07, y0 + 0.4, hw + 0.22, x + 0.07, y1 - 0.6, hw + 0.24, CYAN.mid, 0.85);
  }
  const bay = ribX - 0.3;
  const outerX = (ribX + 0.3 + hw - 0.45) / 2;
  const hasOuter = hw - 0.45 - (ribX + 0.3) > 0.4;
  for (const y of courses) {
    b.box(-hw, y, hw - 0.05, hw, y + 0.25, hw + 0.14, BRICK.light);
    g.box(-bay, y - 0.12, hw, bay, y - 0.04, hw + 0.03, VIOLET.mid, 0.8);
  }
  rows.forEach((y, ri) => {
    const lower = ri === 0;
    for (const cx of columns) {
      if (front && lower && Math.abs(cx) < DOOR_HALF + 0.3) continue;
      slit(b, g, cx, y, hw, 0.26, 1.0, lower ? VIOLET.mid : CYAN.mid);
    }
    if (hasOuter) for (const sx of [-1, 1]) slit(b, g, sx * outerX, y, hw, 0.2, 0.8, lower ? VIOLET.mid : CYAN.dark);
  });
}

/** Crown face (+Z side): a row of glowing slots below the horns. */
function crownFace(b: VoxBuilder, g: VoxBuilder, hw: number, y0: number, y1: number): void {
  for (let i = 0; i < 5; i++) slit(b, g, -1.4 + i * 0.7, (y0 + y1) / 2 + 0.2, hw, 0.18, 0.5, CYAN.light);
}

/** A glowing slit in a dark frame, centered at (x, y) on the face z = hw. */
function slit(b: VoxBuilder, g: VoxBuilder, x: number, y: number, hw: number, w: number, h: number, color: number): void {
  b.box(x - w / 2 - 0.06, y - h / 2 - 0.06, hw, x + w / 2 + 0.06, y + h / 2 + 0.06, hw + 0.015, BRICK.mortar);
  g.box(x - w / 2, y - h / 2, hw, x + w / 2, y + h / 2, hw + 0.03, color, 0.85);
}
