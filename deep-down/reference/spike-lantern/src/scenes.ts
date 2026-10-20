// The three spike scenes. Each is a voxel grid carved from simple shapes plus noise, its props, its emitters and
// its look (ambient, fog, lantern, grade). Shapes are authored for the portrait first-person frame.

import * as THREE from 'three';
import { Blk, CELL, Grid, LAYER } from './grid';
import { CrystalBuilder, PropBuilder, chest, pebbles, roots } from './props';
import type { Emitter, Occluder, SunShaft } from './volumes';
import { fbm3, hashf, lin, rng } from './util';

export interface Look {
  sky: [number, number, number];
  ground: [number, number, number];
  fog: [number, number, number];
  fogDensity: number;
  fogHeight: [number, number];
  fogScatter: number;
  lantern: [number, number, number];
  lanternSoft: number;
  lanternRange: number;
  lanternScatter: number;
  accentGain: number;
  crystalGain: number;
  emissive: [number, number, number, number];
  exposure: number;
  bloom: number;
  threshold: number;
  lift: [number, number, number];
  gain: [number, number, number];
  sat: number;
  vignette: number;
  motes: { count: number; min: [number, number, number]; size: [number, number, number]; rise: number };
  /** Magma-vein glow in basalt (0 = off). */
  vein?: number;
}

export interface Tappable {
  kind: 'chest' | 'crystal' | 'gem';
  box: THREE.Box3;
}

export interface Shaft {
  top: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  r0: number;
  r1: number;
  color: [number, number, number];
}

export interface SceneDef {
  name: string;
  grid: Grid;
  cam: { pos: THREE.Vector3; yaw: number; pitch: number };
  emitters: Emitter[];
  suns: SunShaft[];
  occluders: Occluder[];
  crystals: CrystalBuilder;
  props: PropBuilder;
  shafts: Shaft[];
  look: Look;
  tappables: Tappable[];
  /** Cells whose gem prop belongs to them (removed when mined). */
  gemCell?: [number, number, number];
  objective?: string;
  lava?: { y: number; min: [number, number]; max: [number, number] };
}

const scale = (c: [number, number, number], k: number): [number, number, number] => [c[0] * k, c[1] * k, c[2] * k];

/** Highest solid cell's bottom above a point (the ceiling), metres. */
function ceilingAt(g: Grid, x: number, y: number, z: number): number {
  const [cx, cy, cz] = g.cellOf(x, y, z);
  for (let j = cy; j < g.ny; j++) if (g.solid(cx, j, cz)) return g.oy + j * CELL;
  return g.oy + g.ny * CELL;
}
/** Top of the floor below a point, metres. */
function floorAt(g: Grid, x: number, y: number, z: number): number {
  const [cx, cy, cz] = g.cellOf(x, y, z);
  for (let j = cy; j >= 0; j--) if (g.solid(cx, j, cz)) return g.oy + (j + 1) * CELL;
  return g.oy;
}

// ---------------------------------------------------------------------------------------------------- 1. arrival
// Glowroot Caverns, the first cavern: a rock face on the left (copper vein, a gem), a crystal crown on its ledge,
// a chest on the floor, and straight ahead a passage that falls away towards a daylit chamber.
export function arrival(): SceneDef {
  const g = new Grid(30, 26, 58, -5, -4, -26);
  const n = (x: number, y: number, z: number, f = 0.6, s = 1) => fbm3(x * f, y * f, z * f, 3, s);
  g.fill(() => true, Blk.Rock);
  g.fill((x, y, z) => {
    // Near cavern: floor at 0, rough walls, a domed earthy vault.
    const ceil = 4.6 + 0.8 * n(x, 0, z, 0.45, 2) - 0.06 * (x - 0.3) * (x - 0.3);
    const inNear = z < 2.8 && x > -2.6 + 0.5 * n(0, y, z, 0.7, 3) && x < 3.1 + 0.5 * n(0, y, z, 0.7, 4) && y > 0 && y < ceil;
    // The rock face at z = -3 left of x = 0, blocks standing proud here and there; a ledge at 2.5 m.
    const facePro = n(x, y, 0, 1.3, 5) > 0.3 ? 0.5 : 0;
    const faceZ = y < 2.5 ? -3.0 + facePro : -4.5 + (n(x, y, 0, 0.8, 6) > 0.25 ? 0.5 : 0);
    // Right of the passage mouth the cavern closes at z = -3.5 with a rough pillar.
    const rightZ = -3.5 + (n(x, y, 0, 1.0, 13) > 0.2 ? 0.5 : 0);
    const nearOk = inNear && (x < 0 ? z > faceZ : x > 2.2 ? z > rightZ : true);
    // Passage: straight, then easing right; the floor falls away after 5 m.
    const t = Math.max(0, -z - 7);
    const cx = 1.1 + t * t * 0.04;
    const hw = 1.1 + 0.25 * n(0, y, z, 0.6, 7);
    const fy = z > -5 ? 0 : z > -12 ? -(-z - 5) * 0.15 : -1.05;
    const pc = fy + 2.7 + 0.35 * n(x, 0, z, 0.7, 8);
    const inPass = z < -2 && z > -14.5 && Math.abs(x - cx) < hw && y > fy && y < pc;
    // Far chamber, lit from a crack to the surface.
    const ex = (x - 2.2) / 4.6, ey = (y - 0.6) / 4.2, ez = (z + 17.5) / 4.4;
    const inFar = ex * ex + ey * ey + ez * ez < 1 + 0.22 * n(x, y, z, 0.5, 9) && y > -1.0 + (n(x, 0, z, 0.9, 10) > 0.35 ? 0.5 : 0);
    const inHole = Math.hypot(x - 2.9, z + 18.2) < 0.9 + 0.25 * n(x, y, z, 1, 11) && y > 2.5;
    return nearOk || inPass || inFar || inHole;
  }, Blk.Air);
  // A few fallen blocks at the foot of the walls.
  g.fill((x, y, z) => y > 0 && y < 0.5 && z > -2.9 && z < 1.5 && (x < -2.0 || x > 2.6) && hashf(Math.floor(x * 2), Math.floor(z * 2), 3) > 0.5, Blk.Rock);
  g.sealBorder();
  g.cleanup();
  // Strata: earth in the vault.
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) {
        const [cx, cy, cz] = g.center(x, y, z);
        if (g.get(x, y, z) === Blk.Rock && cy > 3.6 + 0.6 * n(cx, 0, cz, 0.5, 12)) g.data[g.idx(x, y, z)] = Blk.Soil;
      }
  // Copper vein rising across the face, two blocks deep.
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) {
        const [cx, cy, cz] = g.center(x, y, z);
        if (g.get(x, y, z) !== Blk.Rock || cz > -2.4 || cz < -4.2 || cx > 0.1 || cx < -2.6 || cy > 2.5 || cy < 0) continue;
        const band = Math.abs(cy - (0.45 + 0.7 * (cx + 1.6)));
        if (band < 0.3) g.data[g.idx(x, y, z)] = Blk.Ore;
      }
  // The gem block: the first solid cell behind the face at about (-0.75, 1.75).
  const gemRay = g.raycast(-0.75, 1.75, 0, 0, 0, -1, 8)!;
  g.data[g.idx(gemRay.x, gemRay.y, gemRay.z)] = Blk.Gem;
  g.version++;

  const crystals = new CrystalBuilder();
  const props = new PropBuilder();
  // Glowing crystal crown on the ledge.
  const ledgeY = floorAt(g, -0.75, 3.4, -3.75);
  crystals.cluster(new THREE.Vector3(-0.75, ledgeY - 0.05, -3.75), new THREE.Vector3(0.2, 1, 0.3), 8, 1.1, 0.55, 0, 21);
  // A small one at the passage mouth.
  const smallY = floorAt(g, 1.55, 1, -3.15);
  crystals.cluster(new THREE.Vector3(1.55, smallY - 0.04, -3.15), new THREE.Vector3(-0.3, 1, 0.3), 6, 0.62, 0.6, 0, 22);
  // Breadcrumbs: two small crystals down the passage.
  const b1y = floorAt(g, 0.45, 1, -8.2), b2y = floorAt(g, 2.6, 0, -12.6);
  crystals.cluster(new THREE.Vector3(0.45, b1y - 0.03, -8.2), new THREE.Vector3(0.3, 1, 0.1), 4, 0.42, 0.6, 0, 24);
  crystals.cluster(new THREE.Vector3(2.6, b2y - 0.03, -12.6), new THREE.Vector3(-0.2, 1, 0.1), 4, 0.5, 0.6, 0, 25);
  // Gem cluster growing out of the gem block's face.
  const [gx, gy, gz] = g.center(gemRay.x, gemRay.y, gemRay.z);
  const gemBase = new THREE.Vector3(gx, gy - 0.02, gz + CELL / 2 - 0.02);
  crystals.cluster(gemBase, new THREE.Vector3(0.15, 0.4, 1), 4, 0.42, 0.35, 2, 23);
  // Treasure chest in front of the passage mouth.
  const cpos = new THREE.Vector3(0.12, 0, -2.45);
  const ch = chest(props, crystals, cpos, -0.3);
  // Roots from the vault.
  const anchors: Array<[THREE.Vector3, number]> = [];
  for (const [x, z, l] of [[-1.3, -1.6, 1.5], [0.3, -2.4, 1.1], [1.6, -1.3, 1.9], [2.4, -2.8, 1.3], [-0.5, -0.6, 0.9], [1.25, -4.6, 1.2], [0.7, -6.2, 0.8], [-1.9, -2.6, 1.3]] as const) {
    anchors.push([new THREE.Vector3(x, ceilingAt(g, x, 2.5, z), z), l]);
  }
  roots(props, anchors, 31);
  // Pebbles and small rubble on the floor.
  const r = rng(41);
  const spots: Array<[THREE.Vector3, number, number]> = [];
  for (let i = 0; i < 28; i++) {
    const x = -2.2 + r() * 5.0, z = -2.9 + r() * 3.2;
    if (Math.hypot(x - cpos.x, z - cpos.z) < 0.65) continue;
    const y = floorAt(g, x, 1.2, z);
    if (y > 0.6) continue;
    spots.push([new THREE.Vector3(x, y, z), 0.05 + r() * r() * 0.15, r() < 0.7 ? LAYER.rock[i % 4] : LAYER.floor[0]]);
  }
  pebbles(props, spots, 42);

  const look: Look = {
    sky: [0.05, 0.1, 0.125],
    ground: [0.014, 0.017, 0.024],
    fog: [0.006, 0.012, 0.017],
    fogDensity: 0.04,
    fogHeight: [-1.0, 0.0],
    fogScatter: 0.5,
    lantern: scale(lin(0xffb070), 6.5),
    lanternSoft: 1.0,
    lanternRange: 8.5,
    lanternScatter: 0.0006,
    accentGain: 1,
    crystalGain: 1,
    emissive: [0.4, 1, 1, 1],
    exposure: 1.25,
    bloom: 0.42,
    threshold: 1.0,
    lift: [0.002, 0.004, 0.006],
    gain: [1.04, 1.0, 0.94],
    sat: 1.06,
    vignette: 0.28,
    motes: { count: 70, min: [-2.2, 0.2, -4.5], size: [5, 3.2, 5], rise: 0.0 },
  };
  return {
    name: 'arrival',
    grid: g,
    cam: { pos: new THREE.Vector3(0.1, 1.6, 0.55), yaw: 0.0, pitch: -0.09 },
    emitters: [
      { p: [-0.75, ledgeY + 0.5, -3.55], c: scale(lin(0x3fd8f0), 2.4), r: 5.5, near: 1.0 },
      { p: [1.55, smallY + 0.4, -3.05], c: scale(lin(0x3fd8f0), 1.3), r: 4.0, near: 0.7 },
      { p: [gemBase.x, gemBase.y, gemBase.z + 0.25], c: scale(lin(0xb070ff), 0.5), r: 2.0, near: 0.4 },
      { p: [0.45, b1y + 0.25, -8.2], c: scale(lin(0x3fd8f0), 0.7), r: 3.2, near: 0.6 },
      { p: [2.6, b2y + 0.3, -12.6], c: scale(lin(0x3fd8f0), 0.8), r: 3.5, near: 0.6 },
      { p: [ch.seam.x, ch.seam.y, ch.seam.z], c: scale(lin(0xffb050), 0.55), r: 1.8, near: 0.35 },
      // Daylight pooling on the far chamber floor and bouncing around it.
      { p: [2.7, -0.2, -17.8], c: scale(lin(0xa8c8d4), 4.5), r: 10, near: 2.6 },
    ],
    suns: [{ dir: [0.08, -1, 0.05], c: scale(lin(0xdcebf0), 7.0), region: [2.9, -18.2, 2.6] }],
    occluders: [{ min: [cpos.x - 0.5, 0, cpos.z - 0.4], max: [cpos.x + 0.5, 0.6, cpos.z + 0.4], amount: 0.5 }],
    crystals,
    props,
    shafts: [{ top: new THREE.Vector3(2.85, 8.6, -18.2), dir: new THREE.Vector3(0.08, -1, 0.05), length: 9.6, r0: 0.7, r1: 1.4, color: scale(lin(0xcfe2ea), 0.45) }],
    look,
    tappables: [
      { kind: 'chest', box: new THREE.Box3().setFromCenterAndSize(cpos.clone().add(new THREE.Vector3(0, 0.3, 0)), ch.size.clone().addScalar(0.1)) },
      { kind: 'crystal', box: new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(-0.75, ledgeY + 0.5, -3.75), new THREE.Vector3(1.0, 1.2, 0.9)) },
      { kind: 'gem', box: new THREE.Box3().setFromCenterAndSize(gemBase.clone().add(new THREE.Vector3(0, 0, 0.12)), new THREE.Vector3(0.5, 0.5, 0.4)) },
    ],
    gemCell: [gemRay.x, gemRay.y, gemRay.z],
  };
}

// ---------------------------------------------------------------------------------------------- 2. crystal grotto
// The reveal: from the lip of a tunnel, a cathedral of blue-violet stone falls away in terraces to a forest of
// glowing crystals; a giant cluster in the middle, crystals hanging from the vault, a pale shaft from a crack.
const HANGING = [[-3, -16, 2.8, 61], [5, -20, 3.2, 62], [-7, -26, 2.4, 63], [1, -24, 2.0, 64]] as const;
export function grotto(): SceneDef {
  const g = new Grid(52, 48, 82, -13, -8, -38);
  const n = (x: number, y: number, z: number, f = 0.5, s = 1) => fbm3(x * f, y * f, z * f, 3, s);
  g.fill(() => true, Blk.Grotto);
  const terrace = (z: number) => (z > -2.5 ? 0 : z > -5 ? -1 : z > -7.5 ? -2.5 : z > -10 ? -4 : z > -27 ? -6 : -6 + Math.min(3, (-z - 27) * 0.5));
  g.fill((x, y, z) => {
    const inTunnel = z > -3.5 && z < 2.8 && Math.abs(x) < 1.5 + 0.3 * n(0, y, z, 0.8, 2) && y > 0 && y < 3.2 + 0.4 * n(x, 0, z, 0.8, 3);
    const ex = x / 11.5, ey = (y - 3.5) / 11.3, ez = (z + 18) / 15.5;
    const inCh = ex * ex + ey * ey * 0.8 + ez * ez < 1 + 0.18 * n(x, y, z, 0.35, 4);
    const fl = terrace(z) + (n(x, 0, z, 0.4, 5) > 0.3 ? 0.5 : 0) + Math.max(0, Math.abs(x) - 7) * 0.4;
    const inChamber = inCh && z < -2.2 && y > fl;
    // Stalactites: hanging voxel columns under the vault.
    const vault = 3.5 + 11.3 * Math.sqrt(Math.max(0, 1 - ex * ex - ez * ez) / 0.8);
    const sn = n(x, 0, z, 0.8, 6);
    // No stalactites where crystals hang from the vault (they would cut into them).
    const clearOfHanging = HANGING.every(([hx, hz]) => Math.hypot(x - hx, z - hz) > 2.2);
    const stal = clearOfHanging && sn > 0.46 && y > vault - 1.0 - 2.2 * (sn - 0.46) * 6;
    // Two rock columns.
    const col = Math.hypot(x + 6.5, z + 21) < 1.3 + 0.3 * n(x, y, z, 1, 7) || Math.hypot(x - 7.5, z + 27) < 1.5 + 0.3 * n(x, y, z, 1, 8);
    // A crack in the vault for the shaft.
    const crack = Math.hypot(x + 4, z + 14) < 1.0 + 0.25 * n(x, y, z, 1, 9) && y > 8;
    return inTunnel || (inChamber && !stal && !col) || crack;
  }, Blk.Air);
  g.sealBorder(Blk.Grotto);
  g.cleanup();
  // The tunnel we came from is still ordinary slate: the grotto stone starts at the lip.
  for (let z = 0; z < g.nz; z++)
    for (let y = 0; y < g.ny; y++)
      for (let x = 0; x < g.nx; x++) {
        const [cx, cy, cz] = g.center(x, y, z);
        if (g.get(x, y, z) === Blk.Grotto && cz > -2.4 + 0.6 * n(cx, cy, 0, 1.2, 12) && cy > -1.5) g.data[g.idx(x, y, z)] = Blk.Rock;
      }

  const crystals = new CrystalBuilder();
  const props = new PropBuilder();
  const emitters: Emitter[] = [];
  const cyan = lin(0x3fdcf4), violet = lin(0x9a6bff);
  const put = (x: number, z: number, size: number, pal: number, count: number, seed: number, axis = new THREE.Vector3(0, 1, 0), y?: number, gain = 1) => {
    const yy = y ?? floorAt(g, x, 10, z);
    crystals.cluster(new THREE.Vector3(x, yy - 0.1 * size, z), axis, count, size, 0.5, (i) => (pal === 2 ? (i % 3 === 1 ? 1 : 0) : pal), seed);
    const c = pal === 1 ? violet : cyan;
    const k = Math.min(3.2, 0.55 * size) * gain;
    emitters.push({ p: [x, yy + axis.y * size * 0.45, z], c: [c[0] * k, c[1] * k, c[2] * k], r: 2.5 + size * 1.25, near: 0.5 + size * 0.3 });
  };
  put(1.6, -17.5, 8.5, 2, 9, 51, new THREE.Vector3(0.05, 1, 0.08));
  put(-5.2, -10.5, 3.2, 0, 6, 52, new THREE.Vector3(0.25, 1, 0.1));
  put(6.0, -12.5, 3.6, 0, 6, 53, new THREE.Vector3(-0.3, 1, 0.1));
  put(-8.0, -23, 4.8, 1, 7, 54, new THREE.Vector3(0.2, 1, 0.1));
  put(7.2, -15.5, 3.4, 0, 6, 55, new THREE.Vector3(-0.2, 1, 0.15));
  put(-1.5, -31, 5.5, 1, 7, 56, new THREE.Vector3(0.05, 1, 0.2));
  put(-3.6, -6.3, 1.6, 0, 5, 58, new THREE.Vector3(0.3, 1, 0.2));
  put(3.4, -7.8, 1.9, 1, 5, 59, new THREE.Vector3(-0.2, 1, 0.2));
  // Hanging from the vault.
  for (const [x, z, sz, seed] of HANGING) {
    // Only where the vault is flat enough over the whole cluster, so no rock cuts through a crystal.
    const r = sz * 0.45;
    const tops = [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, -r], [r, -r], [-r, r]].map(([dx, dz]) => ceilingAt(g, x + dx, 6, z + dz));
    const lo = Math.min(...tops);
    if (Math.max(...tops) - lo > 1.1) continue;
    put(x, z, sz * 0.9, seed % 2, 5, seed, new THREE.Vector3(0.05, -1, 0.05), lo + 0.05 * sz, 0.6);
  }
  // Small ones at the lip, close enough to touch.
  put(-1.35, -2.9, 0.8, 0, 5, 65, new THREE.Vector3(0.25, 1, 0.3), undefined, 0.8);
  put(1.45, -3.3, 0.6, 1, 4, 66, new THREE.Vector3(-0.3, 1, 0.2), undefined, 0.8);
  // Soft bounce that gives the vault its form.
  for (const [x, y, z, c, k] of [[-8, 2, -15, 0x5a6cff, 0.35], [8, 4, -21, 0x3fbcf4, 0.3], [0, 9, -24, 0x7a5cff, 0.3], [0, -3, -26, 0x3fdcf4, 0.35]] as const) {
    const cc = lin(c);
    emitters.push({ p: [x, y, z], c: [cc[0] * k, cc[1] * k, cc[2] * k], r: 13, near: 5 });
  }
  const look: Look = {
    sky: [0.04, 0.085, 0.13],
    ground: [0.02, 0.022, 0.04],
    fog: [0.004, 0.009, 0.022],
    fogDensity: 0.028,
    fogHeight: [-3, 0.0],
    fogScatter: 0.6,
    lantern: scale(lin(0xffb070), 6.0),
    lanternSoft: 1.3,
    lanternRange: 10,
    lanternScatter: 0.0006,
    accentGain: 1,
    crystalGain: 1.2,
    emissive: [0.4, 1, 1, 1],
    exposure: 1.0,
    bloom: 0.7,
    threshold: 0.85,
    lift: [0.004, 0.008, 0.016],
    gain: [1.02, 1.0, 0.98],
    sat: 1.05,
    vignette: 0.26,
    motes: { count: 90, min: [-3, -1, -9], size: [6, 4.5, 9], rise: 0.0 },
  };
  return {
    name: 'grotto',
    grid: g,
    cam: { pos: new THREE.Vector3(0.0, 1.6, -1.2), yaw: 0.0, pitch: 0.05 },
    emitters,
    suns: [{ dir: [0.25, -1, -0.12], c: scale(lin(0xcfe2ff), 1.4), region: [-1.5, -15, 4] }],
    occluders: [],
    crystals,
    props,
    shafts: [{ top: new THREE.Vector3(-4.2, 15.8, -14), dir: new THREE.Vector3(0.25, -1, -0.12), length: 20, r0: 0.7, r1: 2.6, color: scale(lin(0xcfe2ff), 0.3) }],
    look,
    tappables: [],
    objective: 'Crystal Grotto discovered',
  };
}

// ------------------------------------------------------------------------------------------------- 3. magma veins
// Deeper and hotter: a basalt ledge over a chasm, a lava river far below, columns standing in it, veins of magma
// glowing through the walls; the lantern is the only cool-headed light here.
export function magma(): SceneDef {
  const g = new Grid(44, 44, 74, -11, -12, -34);
  const n = (x: number, y: number, z: number, f = 0.5, s = 1) => fbm3(x * f, y * f, z * f, 3, s);
  g.fill(() => true, Blk.Basalt);
  const LAVA = -5.6;
  g.fill((x, y, z) => {
    const ledge = z > -2.2 + (n(x, 0, 0, 1.2, 2) > 0.2 ? 0.5 : 0) && z < 2.8 && x > -2.4 + 0.4 * n(0, y, z, 1, 3) && x < 2.8 + 0.4 * n(0, y, z, 1, 4) && y > 0 && y < 3.6 + 0.5 * n(x, 0, z, 0.8, 5);
    const ex = x / 9.5, ez = (z + 13.2) / 12.2;
    const wall = ex * ex + ez * ez < 1 + 0.2 * n(x, y, z, 0.35, 6);
    const ceil = 8.5 + 1.5 * n(x, 0, z, 0.4, 7);
    const chasm = wall && z < -1.6 && y > LAVA - 1.0 && y < ceil;
    // Basalt columns rising from the lava: hexagon-ish stacks of different heights.
    let column = false;
    for (const [cx, cz, top] of [[-3.8, -8, -1.0], [3.2, -10.5, -2.5], [-1.2, -15, 0.5], [5.5, -17, -3.5], [-6.2, -16, -2.0], [1.8, -21, -0.5]] as const) {
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz), Math.abs(x - cx + z - cz) * 0.7) < 1.25 && y < top + (n(x, 0, z, 2, 8) > 0 ? 0.5 : 0)) column = true;
    }
    return ledge || (chasm && !column);
  }, Blk.Air);
  g.sealBorder(Blk.Basalt);
  g.cleanup();
  const crystals = new CrystalBuilder();
  const props = new PropBuilder();
  // The lava river: one plane with the magma texture, drawn by the world shader as lava (tint 4).
  const lava = new THREE.PlaneGeometry(22, 26, 1, 1).rotateX(-Math.PI / 2).translate(0, LAVA, -15);
  const lp = lava.getAttribute('position'), luv = lava.getAttribute('uv');
  for (let i = 0; i < lp.count; i++) luv.setXY(i, lp.getX(i) * 0.4, lp.getZ(i) * 0.4);
  props.geometry(lava, new THREE.Matrix4(), 15, 4, 1, 0.5);
  const emitters: Emitter[] = [];
  const hot = lin(0xff6a1e);
  for (let z = -4; z >= -25; z -= 3)
    for (let x = -7; x <= 7; x += 3.5) emitters.push({ p: [x, LAVA + 0.8, z], c: [hot[0] * 3.2, hot[1] * 3.2, hot[2] * 3.2], r: 10, near: 2.2 });
  // A few amber crystals on the ledge: the lantern's kin.
  crystals.cluster(new THREE.Vector3(-1.7, 0, -2.3), new THREE.Vector3(0.3, 1, 0.1), 5, 0.6, 0.55, 3, 71);
  emitters.push({ p: [-1.7, 0.4, -2.2], c: scale(lin(0xffb347), 0.8), r: 2.5, near: 0.5 });
  const look: Look = {
    sky: [0.05, 0.04, 0.085],
    ground: [0.05, 0.018, 0.01],
    fog: [0.012, 0.005, 0.008],
    fogDensity: 0.022,
    fogHeight: [-3, 0.03],
    fogScatter: 0.28,
    lantern: scale(lin(0xffb070), 5.5),
    lanternSoft: 1.3,
    lanternRange: 10,
    lanternScatter: 0.0006,
    accentGain: 1,
    crystalGain: 1,
    emissive: [0.4, 1, 1, 1],
    vein: 1,
    exposure: 1.0,
    bloom: 0.7,
    threshold: 0.9,
    lift: [0.008, 0.005, 0.012],
    gain: [1.03, 0.99, 0.95],
    sat: 1.04,
    vignette: 0.26,
    motes: { count: 80, min: [-5, -7, -14], size: [10, 12, 12], rise: 0.35 },
  };
  return {
    name: 'magma',
    grid: g,
    cam: { pos: new THREE.Vector3(0.3, 1.6, 0.9), yaw: 0.06, pitch: -0.3 },
    emitters,
    suns: [],
    occluders: [],
    crystals,
    props,
    shafts: [],
    look,
    tappables: [],
    lava: { y: LAVA, min: [-11, -28], max: [11, -2] },
    objective: 'Find a way across the Magma Veins',
  };
}

export const SCENES: Record<string, () => SceneDef> = { arrival, grotto, magma };
