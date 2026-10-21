// The light lab's test chamber (owner 1E): a 12 × 7 × 18 m Topsoil-like vault of chamfered 0.5 m blocks with a raised
// ledge, two pillars, an alcove, a sky shaft through the roof, a far passage, rubble, a chest, a crystal cluster, ore
// nuggets and two Halden lamps (one lit). It exercises every term of the stack: the lantern's soft cube shadow at
// grazing angles (the pillar and the wall), the irradiance volume (the shaft, the crystals, the lamp), the SH fill, the
// rim from the far passage, wet stone and the probe, metal glints, crystal translucency and the volumetric air.

import * as THREE from 'three';
import { chamferCube, crystalPrism } from './geometry';
import { propMaterial, stoneMaterial } from './materials';

export const CELL = 0.5;
export const NX = 24;
export const NY = 16;
export const NZ = 40;

export class LabGrid {
  readonly data = new Uint8Array(NX * NY * NZ);
  idx(x: number, y: number, z: number): number {
    return x + NX * (y + NY * z);
  }
  solid(x: number, y: number, z: number): boolean {
    if (x < 0 || y < 0 || z < 0 || x >= NX || z >= NZ) return true;
    if (y >= NY) return false;
    return this.data[this.idx(x, y, z)] !== 0;
  }
  set(x: number, y: number, z: number, v: number): void {
    if (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ) return;
    this.data[this.idx(x, y, z)] = v;
  }
  /** Carve a box of cells [x0, x1) × [y0, y1) × [z0, z1) in metres. */
  carve(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, v = 0): void {
    for (let z = Math.floor(z0 / CELL); z < Math.ceil(z1 / CELL); z++)
      for (let y = Math.floor(y0 / CELL); y < Math.ceil(y1 / CELL); y++)
        for (let x = Math.floor(x0 / CELL); x < Math.ceil(x1 / CELL); x++) this.set(x, y, z, v);
  }
}

/** Kinds of block (the stone shader's albedo family). */
const WALL = 1;
const FLOOR = 2;
const TIMBER = 3;

export function buildGrid(): LabGrid {
  const g = new LabGrid();
  g.data.fill(WALL);
  // The vault: floor at y = 0.5, roof at 6.
  g.carve(1, 0.5, 1, 11, 6, 17);
  // The far passage (2.5 m wide) running on to z = 19.5, a little lower.
  g.carve(4.5, 0.5, 17, 7.5, 3.5, 19.5);
  // The sky shaft through the roof (open at the top).
  g.carve(6, 6, 11.5, 8, 8, 13.5);
  // A raised ledge along the left wall (1 m high) with a stair.
  g.carve(1, 0.5, 9, 3, 1.5, 15, WALL);
  g.carve(3, 0.5, 11, 3.5, 1.0, 13, WALL);
  // An alcove in the right wall.
  g.carve(11, 0.5, 5, 12, 3, 7.5);
  // Two pillars.
  g.carve(4, 0.5, 7.5, 5, 6, 8.5, WALL);
  g.carve(7.5, 0.5, 10.5, 8.5, 6, 11.5, WALL);
  // Rubble at the wall feet.
  for (const [x, z] of [
    [1, 3],
    [1.5, 3.5],
    [10.5, 9],
    [10.5, 9.5],
    [10, 14.5],
    [1, 16.5],
    [6.5, 16.5],
  ])
    g.carve(x, 0.5, z, x + 0.5, 1, z + 0.5, WALL);
  // Floor blocks are a separate family (warmer, wet in places).
  for (let z = 0; z < NZ; z++)
    for (let x = 0; x < NX; x++) {
      if (g.solid(x, 0, z) && !g.solid(x, 1, z)) g.set(x, 0, z, FLOOR);
      if (g.solid(x, 2, z) && !g.solid(x, 3, z) && g.data[g.idx(x, 2, z)] === WALL && x < 6) g.set(x, 2, z, FLOOR);
    }
  // A timber lintel over the far passage.
  g.carve(4, 3.5, 16.5, 8, 4, 17, TIMBER);
  return g;
}

export interface LabScene {
  scene: THREE.Scene;
  grid: LabGrid;
  irradiance: THREE.Data3DTexture;
  lamps: Array<{ id: string; pos: THREE.Vector3; color: number; intensity: number; range: number; shadow: boolean }>;
  probeCentre: THREE.Vector3;
  probeBox: { min: THREE.Vector3; max: THREE.Vector3 };
  tris: number;
}

const FACE = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

export function buildLab(): LabScene {
  const grid = buildGrid();
  const scene = new THREE.Scene();
  // ---- the surface blocks: every solid cell with an open neighbour, as an instanced chamfered cube
  const cells: Array<[number, number, number, number]> = [];
  for (let z = 0; z < NZ; z++)
    for (let y = 0; y < NY; y++)
      for (let x = 0; x < NX; x++) {
        if (!grid.solid(x, y, z)) continue;
        let open = false;
        for (const f of FACE) if (!grid.solid(x + f[0], y + f[1], z + f[2])) open = true;
        if (open) cells.push([x, y, z, grid.data[grid.idx(x, y, z)]]);
      }
  const cube = chamferCube(CELL, 0.03);
  const stone = stoneMaterial();
  const mesh = new THREE.InstancedMesh(cube, stone, cells.length);
  const seed = new Float32Array(cells.length);
  const kind = new Float32Array(cells.length);
  const m = new THREE.Matrix4();
  cells.forEach(([x, y, z, k], i) => {
    m.makeTranslation((x + 0.5) * CELL, (y + 0.5) * CELL, (z + 0.5) * CELL);
    mesh.setMatrixAt(i, m);
    const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
    seed[i] = h - Math.floor(h);
    kind[i] = k === FLOOR ? 1 : k === TIMBER ? 2 : 0;
  });
  cube.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  cube.setAttribute('aKind', new THREE.InstancedBufferAttribute(kind, 1));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.name = 'lab-stone';
  scene.add(mesh);
  let tris = (cube.getAttribute('position').count / 3) * cells.length;

  // ---- props
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0, s = 1) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.rotation.y = ry;
    o.scale.setScalar(s);
    scene.add(o);
    tris += (geo.index ? geo.index.count : geo.getAttribute('position').count) / 3;
    return o;
  };
  // The chest on the floor, a little left of centre, 6 m ahead.
  const wood = propMaterial({ albedo: 0x6a3f1e, roughness: 0.72, metal: 0 });
  const brass = propMaterial({ albedo: 0xd9a95a, roughness: 0.32, metal: 1 });
  const chestBody = chamferCube(1, 0.06);
  chestBody.scale(0.95, 0.55, 0.6);
  add(chestBody, wood, 5.0, 0.5 + 0.275, 9.6, 0.25);
  const band = chamferCube(1, 0.01);
  band.scale(0.08, 0.57, 0.62);
  for (const dx of [-0.32, 0.32]) {
    const o = add(band, brass, 5.0, 0.5 + 0.28, 9.6, 0.25);
    o.position.x += dx * Math.cos(0.25);
    o.position.z -= dx * Math.sin(0.25);
  }
  const lid = chamferCube(1, 0.08);
  lid.scale(0.97, 0.22, 0.62);
  add(lid, wood, 5.0, 0.5 + 0.62, 9.6, 0.25);
  // A crystal cluster on the ledge (cyan, glowing from inside).
  const cry = propMaterial({ albedo: 0x2fb6cc, roughness: 0.12, metal: 0, emission: 0x2fb6cc, emissionGain: 1.3, sss: 0.9, sssColor: 0x8fe3ee });
  const prism = crystalPrism(0.09, 0.5, 0.16);
  const cx = 2.1;
  const cz = 13.4;
  [
    [0, 0, 0, 1.0],
    [0.16, 0.05, 0.4, 0.8],
    [-0.14, 0.1, -0.5, 0.7],
    [0.05, -0.15, 0.25, 0.6],
    [-0.05, 0.16, -0.2, 0.9],
  ].forEach(([dx, dz, tilt, s]) => {
    const o = add(prism, cry, cx + dx, 1.5, cz + dz, 0, s);
    o.rotation.set(tilt * 0.6, dx * 4, tilt);
    o.userData.noShadow = false;
  });
  // Ore nuggets in the right wall (gold, glinting).
  const gold = propMaterial({ albedo: 0xe2b673, roughness: 0.28, metal: 1 });
  const nug = new THREE.IcosahedronGeometry(0.06, 0);
  for (let k = 0; k < 9; k++) {
    const o = add(nug, gold, 10.97, 1.3 + ((k * 0.37) % 0.9), 9.5 + ((k * 0.61) % 1.6), k);
    o.scale.set(1 + (k % 3) * 0.3, 0.8 + (k % 2) * 0.4, 1);
  }
  // Two Halden lamps on posts: one lit (warm), one cold.
  const iron = propMaterial({ albedo: 0x3a3a3c, roughness: 0.55, metal: 1 });
  const post = chamferCube(1, 0.02);
  post.scale(0.12, 1.8, 0.12);
  const glassLit = propMaterial({ albedo: 0xffd9a0, roughness: 0.2, metal: 0, emission: 0xffb35c, emissionGain: 5.5 });
  const glassCold = propMaterial({ albedo: 0x2a2f33, roughness: 0.2, metal: 0 });
  const head = chamferCube(1, 0.03);
  head.scale(0.22, 0.28, 0.22);
  add(post, iron, 9.6, 0.5 + 0.9, 13.0);
  add(head, glassLit, 9.6, 0.5 + 1.95, 13.0);
  add(post, iron, 2.6, 1.5 + 0.9, 4.0);
  add(head, glassCold, 2.6, 1.5 + 1.95, 4.0);

  // A smooth stone panel along the near left wall: the grazing-angle shadow-acne test looks along it (no occluder
  // stands between it and the lantern, so any shadow on it is acne).
  const panelMat = propMaterial({ albedo: 0x6b7378, roughness: 0.8, metal: 0 });
  const panel = new THREE.BoxGeometry(0.08, 3.4, 7.5);
  const pm = add(panel, panelMat, 1.04, 0.5 + 1.7, 5.25);
  pm.name = 'lab-acne-panel';

  // ---- the lamps as practicals (and the cold one, off)
  const lamps = [
    { id: 'lab.lampA', pos: new THREE.Vector3(9.6, 2.45, 13.0), color: 0xffb35c, intensity: 2.2, range: 6, shadow: true },
    { id: 'lab.lampB', pos: new THREE.Vector3(2.6, 3.45, 4.0), color: 0xffb35c, intensity: 0, range: 6, shadow: true },
  ];

  const irradiance = bakeIrradiance(grid, lamps[0].pos);
  return {
    scene,
    grid,
    irradiance,
    lamps,
    probeCentre: new THREE.Vector3(6, 2.2, 9),
    probeBox: { min: new THREE.Vector3(1, 0.5, 1), max: new THREE.Vector3(11, 6, 17) },
    tris,
  };
}

/**
 * The lab's irradiance volume (1 m cells, the LightField's encoding: rgb = (v / 3.6)^(1 / 1.55), a = openness):
 * the sky shaft (cool, straight down through the roof hole), the crystals (cyan) and the lit lamp (amber), each with
 * a voxel line-of-sight test and one blur pass. 1B's LightField takes this role in the game.
 */
export function bakeIrradiance(grid: LabGrid, lamp: THREE.Vector3): THREE.Data3DTexture {
  const sx = 12;
  const sy = 8;
  const sz = 20;
  const acc = new Float32Array(sx * sy * sz * 3);
  const open = new Float32Array(sx * sy * sz);
  const solidAt = (x: number, y: number, z: number) => grid.solid(Math.floor(x / CELL), Math.floor(y / CELL), Math.floor(z / CELL));
  const clear = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    const n = Math.ceil(d / 0.25);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (solidAt(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t)) return false;
    }
    return true;
  };
  const emitters = [
    { p: [2.1, 1.85, 13.4], c: [0.12, 0.62, 0.78], r: 5 },
    { p: [lamp.x, lamp.y, lamp.z], c: [1.6, 0.85, 0.35], r: 6 },
  ];
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const i = x + sx * (y + sy * z);
        const cxm = x + 0.5;
        const cym = y + 0.5;
        const czm = z + 0.5;
        // Openness: the fraction of the cell's 8 sub-cells that are air.
        let o = 0;
        for (let k = 0; k < 8; k++) if (!solidAt(x + (k & 1) * 0.5 + 0.25, y + ((k >> 1) & 1) * 0.5 + 0.25, z + ((k >> 2) & 1) * 0.5 + 0.25)) o++;
        open[i] = o / 8;
        if (o === 0) continue;
        for (const e of emitters) {
          const d = Math.hypot(cxm - e.p[0], cym - e.p[1], czm - e.p[2]);
          if (d >= e.r) continue;
          const w = 1 - (d / e.r) ** 2;
          const f = (w * w) / (1 + (d / 1.2) ** 2);
          if (!clear(e.p[0], e.p[1], e.p[2], cxm, cym, czm)) continue;
          for (let c = 0; c < 3; c++) acc[i * 3 + c] += e.c[c] * f;
        }
        // The sky shaft: cells under the roof hole that see the sky straight up (a slight slant).
        if (cxm > 5.6 && cxm < 8.6 && czm > 11.2 && czm < 14.2 && clear(cxm, cym, czm, cxm + 0.15 * (8 - cym), 7.9, czm)) {
          acc[i * 3] += 0.55;
          acc[i * 3 + 1] += 0.72;
          acc[i * 3 + 2] += 0.95;
        }
      }
  const data = new Uint8Array(sx * sy * sz * 4);
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) {
        const i = x + sx * (y + sy * z);
        let r = 0;
        let g = 0;
        let b = 0;
        let w = 0;
        if (open[i] > 0)
          for (let dz = -1; dz <= 1; dz++)
            for (let dy = -1; dy <= 1; dy++)
              for (let dx = -1; dx <= 1; dx++) {
                const X = x + dx;
                const Y = y + dy;
                const Z = z + dz;
                if (X < 0 || Y < 0 || Z < 0 || X >= sx || Y >= sy || Z >= sz) continue;
                const j = X + sx * (Y + sy * Z);
                if (open[j] <= 0) continue;
                const k = dx === 0 && dy === 0 && dz === 0 ? 4 : 1;
                r += acc[j * 3] * k;
                g += acc[j * 3 + 1] * k;
                b += acc[j * 3 + 2] * k;
                w += k;
              }
        const enc = (v: number) => Math.round(Math.min(1, Math.pow(Math.max(0, v) / 3.6, 1 / 1.55)) * 255);
        data[i * 4] = enc(w ? r / w : 0);
        data[i * 4 + 1] = enc(w ? g / w : 0);
        data[i * 4 + 2] = enc(w ? b / w : 0);
        data[i * 4 + 3] = Math.round(open[i] * 255);
      }
  const t = new THREE.Data3DTexture(data, sx, sy, sz);
  t.format = THREE.RGBAFormat;
  t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.ClampToEdgeWrapping;
  t.unpackAlignment = 1;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
