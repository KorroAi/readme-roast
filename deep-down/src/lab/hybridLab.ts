// The Lantern Lab (visuallab.html): DepthScene on a stand-in Topsoil node at 1B's grid (0.5 m voxels) so the look can be
// developed, captured and measured before the slice is wired end to end. A drift with a 5-slice face plug opens into a
// Root-Cellar-like cavern (two levels, a sky shaft, a ledge, a passage on) dressed with 1B's dressing vocabulary.
// `window.__DD__.lab` drives it for tools/hybrid-capture.mjs (named shots, poses, stats).

import * as THREE from 'three';
import { B, BIOME_BLOCK_BASE, SLOT } from '../config/blocks';
import { CELL } from '../idle/model/state';
import { LightField } from '../world/light';
import { VoxelWorld } from '../world/VoxelWorld';
import type { Dress, WorldLight } from '../world/hybrid/kits/types';
import type { NodePlacement, SocketPlaced } from '../world/hybrid/placement';
import { Renderer } from '../render/Renderer';
import { DepthScene } from '../render/hybrid/DepthScene';
import type { ChamberView, DepthSource, FaceRow, FaceView } from '../render/hybrid/source';
import type { CameraPose } from '../render/hybrid/types';

const VOX = 0.5;
const SX = 128, SY = 64, SZ = 128;
const FLOOR = 8; // m
const K = 5;
const FACE_Z = 30; // slice 0's front plane (m)

const h3 = (x: number, y: number, z: number, s: number) => {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(s | 0, 0x85ebca77);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return ((h >>> 0) % 10000) / 10000;
};
function vn(x: number, y: number, z: number, s: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const f = (t: number) => t * t * (3 - 2 * t);
  const xf = f(x - xi), yf = f(y - yi), zf = f(z - zi);
  let r = 0;
  for (let c = 0; c < 8; c++) {
    const dx = c & 1, dy = (c >> 1) & 1, dz = (c >> 2) & 1;
    r += h3(xi + dx, yi + dy, zi + dz, s) * (dx ? xf : 1 - xf) * (dy ? yf : 1 - yf) * (dz ? zf : 1 - zf);
  }
  return r * 2 - 1;
}
const fbm = (x: number, y: number, z: number, s: number) => vn(x, y, z, s) * 0.6 + vn(x * 2.1, y * 2.1, z * 2.1, s + 7) * 0.3 + vn(x * 4.3, y * 4.3, z * 4.3, s + 13) * 0.1;

const V3 = (x: number, y: number, z: number) => ({ x, y, z });

/** Carve the stand-in node into a voxel world; returns the world and its placement. */
export function buildLabNode(): { world: VoxelWorld; placement: NodePlacement; light: LightField } {
  const w = new VoxelWorld(SX, SY, SZ);
  const hostA = BIOME_BLOCK_BASE + SLOT.HOST_A, hostB = BIOME_BLOCK_BASE + SLOT.HOST_B, soft = BIOME_BLOCK_BASE + SLOT.SOFT;
  const ore = BIOME_BLOCK_BASE + SLOT.ORE;
  // Rock with strata: slate below, umber bands, earth above (Topsoil).
  for (let z = 0; z < SZ; z++)
    for (let y = 0; y < SY; y++)
      for (let x = 0; x < SX; x++) {
        const my = y * VOX + 0.6 * fbm(x * 0.05, 0, z * 0.05, 3);
        const id = my > 17 ? hostA : my > 15.5 && my < 16.3 ? soft : my > 12.5 && my < 13.2 ? soft : hostB;
        w.setRaw(x, y, z, id);
      }
  const carve = (f: (x: number, y: number, z: number) => boolean) => {
    for (let z = 0; z < SZ; z++)
      for (let y = 0; y < SY; y++)
        for (let x = 0; x < SX; x++) {
          const cx = (x + 0.5) * VOX, cy = (y + 0.5) * VOX, cz = (z + 0.5) * VOX;
          if (f(cx, cy, cz)) w.setRaw(x, y, z, B.AIR);
        }
  };
  // The drift (3.5 × 3.0, octagon corners chamfered by one voxel), from z 44 to the face at z 30.
  const inDrift = (x: number, y: number, z: number, z0: number, z1: number) => {
    if (z < z0 || z > z1) return false;
    const u = x - 32, v = y - FLOOR;
    if (Math.abs(u) > 1.75 || v < 0 || v > 3.0) return false;
    if (Math.abs(u) > 1.25 && (v < 0.5 || v > 2.5)) return false;
    return true;
  };
  carve((x, y, z) => inDrift(x, y, z, FACE_Z, 46));
  // The chamber: two levels, irregular walls, a ledge on the left, a sky shaft, a passage on at the far end.
  carve((x, y, z) => {
    const ex = (x - 32) / 9, ez = (z - 15) / 11.5;
    const n = fbm(x * 0.18, y * 0.18, z * 0.18, 5) * 0.16 + fbm(x * 0.5, y * 0.5, z * 0.5, 9) * 0.05;
    const plan = ex * ex + ez * ez < 1 + n;
    const floor = FLOOR + (x < 27 ? 1.5 : 0) + (z < 9 ? -1.0 : 0) + (fbm(x * 0.3, 0, z * 0.3, 2) > 0.25 ? 0.5 : 0);
    const ceil = FLOOR + 9.5 - 3.5 * (ex * ex + ez * ez) + 1.2 * fbm(x * 0.2, 1, z * 0.2, 4);
    const room = plan && y > floor && y < ceil && z < FACE_Z - K;
    const shaft = Math.hypot(x - 35, z - 12) < 1.3 + 0.3 * fbm(x, y * 0.3, z, 8) && y > FLOOR + 4;
    // The passage on runs 4 m and drops into a ladder well (it ends in rock, never at the lab's world edge).
    const passage = Math.abs(x - 30) < 1.4 && z < 6 && z > 1.0 && y > FLOOR - 1.5 + (z < 3 ? -2.5 : 0) && y < FLOOR + 2.2;
    return room || shaft || passage;
  });
  // The breach slice opens into the chamber: carve between the plug's back and the room.
  carve((x, y, z) => inDrift(x, y, z, FACE_Z - K - 1.5, FACE_Z - K));
  // The face plug: FACE_PLUG through K slices (B's convention: the heading interior, never meshed).
  for (let z = 0; z < SZ; z++)
    for (let y = 0; y < SY; y++)
      for (let x = 0; x < SX; x++) {
        const cx = (x + 0.5) * VOX, cy = (y + 0.5) * VOX, cz = (z + 0.5) * VOX;
        if (inDrift(cx, cy, cz, FACE_Z - K, FACE_Z)) w.setRaw(x, y, z, B.FACE_PLUG);
      }
  // A copper vein across the left wall (ore voxels: the nugget dressing shows them).
  for (let z = 0; z < SZ; z++)
    for (let y = 0; y < SY; y++)
      for (let x = 0; x < SX; x++) {
        const cx = (x + 0.5) * VOX, cy = (y + 0.5) * VOX, cz = (z + 0.5) * VOX;
        if (w.get(x, y, z) === B.AIR || w.get(x, y, z) === B.FACE_PLUG) continue;
        if (cx > 27 || cx < 22 || cz > 22 || cz < 12) continue;
        if (Math.abs(cy - (FLOOR + 2.2 + 0.25 * (cz - 17))) < 0.35) w.setRaw(x, y, z, ore);
      }
  // A cracked wall (the secret) on the right.
  for (let y = 0; y < 4; y++) for (let z = 0; z < 3; z++) {
    const vx = Math.floor(40.6 / VOX), vy = Math.floor(FLOOR / VOX) + y, vz = Math.floor(16 / VOX) + z;
    for (let dx = 0; dx < 3; dx++) if (w.get(vx + dx, vy, vz) !== B.AIR) w.setRaw(vx + dx, vy, vz, B.CRACK);
  }
  // Light: the sky shaft (dusk), a crew lamp in the drift, the lit Halden lamp.
  const lightAt = (x: number, y: number, z: number, id: number) => {
    const vx = Math.floor(x / VOX), vy = Math.floor(y / VOX), vz = Math.floor(z / VOX);
    if (w.get(vx, vy, vz) === B.AIR) w.setRaw(vx, vy, vz, id);
  };
  for (let y = FLOOR + 1; y < SY * VOX - 1; y += 1) lightAt(35, y, 12, B.LIGHT_SKY);
  lightAt(25, FLOOR + 2.5, 8, B.LIGHT_AMBER);
  const light = new LightField(w);
  light.computeAll();

  // --- placement (1B's shapes) -------------------------------------------------------------------------------
  const floorAt = (x: number, z: number, from = FLOOR + 3): number => {
    const vx = Math.floor(x / VOX), vz = Math.floor(z / VOX);
    for (let vy = Math.floor(from / VOX); vy > 0; vy--) if (w.isSolid(vx, vy, vz)) return (vy + 1) * VOX;
    return FLOOR;
  };
  const ceilAt = (x: number, z: number, from = FLOOR + 1): number => {
    const vx = Math.floor(x / VOX), vz = Math.floor(z / VOX);
    for (let vy = Math.floor(from / VOX); vy < SY; vy++) if (w.isSolid(vx, vy, vz)) return vy * VOX;
    return SY * VOX;
  };
  const dressing: Dress[] = [];
  const d = (kind: Dress['kind'], x: number, y: number, z: number, extra: Partial<Dress> = {}) => dressing.push({ kind, pos: V3(x, y, z), rotY: 0, scale: 1, seed: dressing.length * 0.137 + 0.11, ...extra });
  // Drift: timber sets every 2.5 m, rails, a crew lamp, rubble at the wall feet.
  for (let z = FACE_Z + 1.2; z < 46; z += 2.5) d('timberSet', 32, FLOOR, z, { size: V3(3.0, 2.75, 0.2) });
  d('rail', 32, FLOOR, 45, { to: V3(32, FLOOR, FACE_Z + 0.6) });
  d('crewLamp', 33.3, FLOOR + 2.85, 38, { rotY: Math.PI });
  for (const z of [33, 37.5, 42]) {
    d('rubble', 30.6, FLOOR, z, { scale: 0.5 });
    d('pebbles', 33.3, FLOOR, z + 1.2, { scale: 0.6 });
  }
  d('cobweb', 30.4, FLOOR + 2.9, 36, { rotY: 0, scale: 0.8 });
  d('tools', 33.6, FLOOR, 34, { rotY: -Math.PI / 2 });
  // Chamber dressing: hanging roots under the earth vault, dripstone, pebbles and rubble along the walls, crates, a
  // puddle, crystal decor, chains, a plaque, a chalk arrow, a rope ladder at the passage.
  for (const [x, z, l] of [[29, 18, 1.6], [34, 20, 1.2], [31, 13, 2.0], [37, 16, 1.4], [27.5, 15, 1.1], [33, 9, 1.8], [36.5, 21, 1.0]] as const) d('hangingRoots', x, ceilAt(x, z), z, { to: V3(x, ceilAt(x, z) - l, z) });
  for (const [x, z] of [[30, 11], [36, 18], [28.5, 20], [34, 7]] as const) d('dripstone', x, ceilAt(x, z), z, { scale: 1.2 });
  for (const [x, z] of [[24, 19], [39.5, 20], [24.5, 12], [39, 10], [30, 6], [37, 22.5]] as const) d('rubble', x, floorAt(x, z), z, { scale: 0.8 });
  for (const [x, z] of [[27, 21], [36, 13], [33, 17.5], [29, 9]] as const) d('pebbles', x, floorAt(x, z), z);
  d('stalagmite', 38.5, floorAt(38.5, 14), 14, { scale: 1.3 });
  d('crateStack', 37.4, floorAt(37.4, 19.5), 19.5, { rotY: 0.4 });
  d('barrel', 38.6, floorAt(38.6, 18), 18);
  d('puddle', 33.5, floorAt(33.5, 14.5), 14.5, { scale: 1.3 });
  d('puddle', 35.5, floorAt(35.5, 11), 11, { scale: 0.9 });
  d('crystalDecor', 26, floorAt(26, 10, FLOOR + 5), 10, { scale: 1.1 });
  d('crystalDecor', 38, floorAt(38, 8), 8, { scale: 0.8 });
  d('plaque', 32.6, FLOOR + 1.9, 4.6, { rotY: 0 });
  d('chalkArrow', 31.2, FLOOR + 1.5, 5.2, { rotY: 0 });
  d('ropeLadder', 30, floorAt(30, 1.5, FLOOR), 1.5, { to: V3(30, FLOOR + 0.2, 1.5) });
  d('chain', 30.2, ceilAt(30.2, 16), 16, { to: V3(30.2, ceilAt(30.2, 16) - 2.2, 16.6) });
  d('glowroot', 28, ceilAt(28, 11), 11, { scale: 1.2 });
  d('cobweb', 24.3, FLOOR + 3.6, 22, { rotY: Math.PI / 2 });
  const lights: WorldLight[] = [
    { id: 'n0:sky', kind: 'sky', pos: V3(35, 20, 12), color: [0.36, 0.5, 0.66], radius: 12 },
    { id: 'n0:crew', kind: 'crew', pos: V3(33.3, FLOOR + 2.5, 38), color: [0.9, 0.55, 0.25], radius: 5 },
  ];
  const S = (id: string, kind: SocketPlaced['kind'], mount: SocketPlaced['mount'], x: number, y: number, z: number, nx: number, ny: number, nz: number, extra: Partial<SocketPlaced> = {}): SocketPlaced => ({
    id: `0:${id}`, local: id, kind, mount, pos: V3(x, y, z), normal: V3(nx, ny, nz), bound: V3(0.35, 0.35, 0.35), level: 0, approach: V3(x + nx, FLOOR, z + nz), ...extra,
  });
  const sockets: SocketPlaced[] = [
    S('v0', 'vein', 'wall', 24.8, FLOOR + 1.9 + 1.5, 17.5, 1, 0, 0, { bound: V3(0.1, 0.4, 0.5) }),
    S('v1', 'vein', 'wall', 39.6, FLOOR + 1.4, 13.5, -1, 0, 0, { rich: true }),
    S('g0', 'gem', 'ledge', 26.0, floorAt(26, 16, FLOOR + 5), 16, 0, 1, 0),
    S('l0', 'lamp', 'post', 28.6, floorAt(28.6, 21.5), 21.5, 1, 0, 0),
    S('l1', 'lamp', 'bracket', 39.4, FLOOR + 2.3, 9.5, -1, 0, 0),
    S('l2', 'lamp', 'post', 25.2, floorAt(25.2, 8, FLOOR + 5), 8, 1, 0, 0.5, { lit: true }),
    S('f0', 'feature', 'crate', 33.2, floorAt(33.2, 18.6), 18.6, 0, 0, 1),
    S('n0', 'note', 'shelf', 36.6, floorAt(36.6, 20.3) + 1.0, 20.3, 0, 0, 1),
    S('s0', 'stash', 'wall', 39.7, FLOOR + 0.9, 19, -1, 0, 0),
    S('x0', 'secret', 'wall', 40.5, FLOOR + 1.2, 16.7, -1, 0, 0, { secret: { kind: 'crack', cells: [], reveals: ['c0'] } }),
    S('c0', 'cache', 'niche', 41.6, FLOOR, 16.7, -1, 0, 0, { hidden: true }),
  ];
  d('shelf', 36.6, floorAt(36.6, 20.5), 20.5, { size: V3(1.2, 1.6, 0.35) });
  const placement: NodePlacement = {
    node: 0, biome: 0, lap: 0, corner: 0, depthTop: 0, K,
    drift: {
      origin: V3(32, FLOOR, 46), dir: V3(0, 0, -1), up: V3(0, 1, 0), length: K,
      faceFrame: { origin: V3(32, FLOOR, FACE_Z), dir: V3(0, 0, -1), up: V3(0, 1, 0) },
      stand: { pos: V3(32, FLOOR + 1.6, FACE_Z + 3.0), yaw: 0, pitch: -0.14 },
      stub: { min: V3(30.25, FLOOR, FACE_Z), max: V3(33.75, FLOOR + 3, 46) },
      slices: [], width: 3.5, height: 3, dressing: [], lights: [],
    },
    chamber: {
      template: 'topsoil.rootCellar', box: { min: V3(22, FLOOR - 2, -2), max: V3(42, FLOOR + 14, 26) }, volumes: [], entry: V3(32, FLOOR, FACE_Z - K), floorY: FLOOR,
      anchors: { skyShaft: V3(35, FLOOR, 12), wonder: V3(32, FLOOR + 7, 14) }, stands: [], sockets, dressing, lights, shafts: [{ id: 'sky', from: V3(35, 31, 12), to: V3(35, FLOOR, 12), radius: 1.3, color: [0.62, 0.76, 0.9] }], links: [], blockers: [], fill: 0.7,
      exits: [{ id: 'e0', type: 'ladder', pos: V3(30, FLOOR - 0.5, 2), plate: V3(31.6, FLOOR + 2.2, 4.4), approach: V3(30, FLOOR, 3), yaw: 0, ride: [], to: 1 }],
    },
  };
  return { world: w, placement, light };
}

/** The face rows of the stand-in drift: Topsoil rock with a copper run, a rich block, a gem and the chest lid. */
function faceRows(dug: number, hits: Map<string, number>): FaceRow[] {
  const rows: FaceRow[] = [];
  for (let s = dug; s < K; s++) {
    const kinds = new Uint8Array(7).fill(CELL.ROCK);
    if (s === 0) {
      kinds[0] = CELL.ORE;
      kinds[6] = CELL.ORE;
      kinds[2] = CELL.RICH;
    }
    if (s === 1) kinds[4] = CELL.GEM;
    if (s === 2) kinds[3] = CELL.CHEST;
    const left = new Float64Array(7).fill(1);
    for (let c = 0; c < 7; c++) left[c] = hits.get(`${s}:${c}`) ?? 1;
    rows.push({ depth: s, kinds, left });
  }
  return rows;
}

export interface HybridLabApi {
  ready: boolean;
  scene: DepthScene;
  /** Named shots of the capture sheet. */
  shot(name: string): void;
  pose(x: number, y: number, z: number, yaw: number, pitch: number): void;
  /** Render n frames at the current pose (the FX clock advances by dt each). */
  render(n?: number, dt?: number): void;
  /** A tap at CSS px: pick + strike (and its break when the block is out of HP). */
  tap(x: number, y: number): string;
  info(): Record<string, unknown>;
  /** 1E's light debug view (light/chunk.ts LIGHT_DEBUG: 0 none, 1 shadow, 2 irradiance, 3 ambient, 4 direct, 5 albedo). */
  debugView(n: number): void;
  shots: string[];
}

export async function bootHybridLab(canvas: HTMLCanvasElement): Promise<HybridLabApi> {
  const q = new URLSearchParams(location.search);
  const renderer = new Renderer(canvas, (q.get('quality') as 'battery' | 'balanced' | 'high') ?? 'balanced');
  const scene = new DepthScene(renderer);
  const t0 = performance.now();
  const { world, placement, light } = buildLabNode();
  const buildMs = performance.now() - t0;
  const tex3 = new THREE.Data3DTexture(light.data, SX, SY, SZ);
  tex3.format = THREE.RGBAFormat;
  tex3.type = THREE.UnsignedByteType;
  tex3.minFilter = tex3.magFilter = THREE.LinearFilter;
  tex3.unpackAlignment = 1;
  tex3.needsUpdate = true;
  let dug = 0;
  const hits = new Map<string, number>();
  let phase: 'drift' | 'chamber' = 'drift';
  const face = (): FaceView | null =>
    phase === 'drift' && dug < K
      ? { node: 0, biome: 0, frame: placement.drift.faceFrame, depth0: 0, K, rows: faceRows(dug, hits), promise: 'treasure' }
      : null;
  const lit = new Set<string>(['0:l2']);
  const chamber: ChamberView = {
    node: 0, biome: 0, template: placement.chamber.template, box: placement.chamber.box, stands: [], exits: [], sockets: [],
    content: (id) => {
      const s = placement.chamber.sockets.find((x) => x.id === id);
      if (!s) return null;
      return s.kind === 'vein' ? 'vein' : s.kind === 'gem' ? 'gem' : s.kind === 'lamp' ? (s.lit ? 'litLamp' : 'lamp') : s.kind === 'feature' ? 'chest' : s.kind === 'note' ? 'note' : s.kind === 'stash' ? 'stash' : s.kind === 'cache' ? 'cache' : s.kind === 'secret' ? 'secret' : null;
    },
    left: () => 1,
    lit: (id) => lit.has(id),
    seen: true,
    charted: false,
  };
  const source: DepthSource = {
    lifeSeed: () => 1, runSeed: () => 1, time: () => performance.now() / 1000,
    node: () => ({ index: 0, phase, stand: 0 }),
    face, chamber: (i) => (i === 0 ? chamber : null),
    crew: () => [q.has('crew') ? 3 : 0, q.has('crew') ? 2 : 0, q.has('crew') ? 1 : 0],
    pickLevel: () => 1, deepestBiome: () => 0, combo: () => 0, record: () => 0, fortune: () => 0, dynamite: () => null,
    placement: (i) => (i === 0 ? placement : null),
    world: () => ({ voxels: world, irradiance: { texture: tex3, origin: { x: 0, y: 0, z: 0 }, size: { x: SX * VOX, y: SY * VOX, z: SZ * VOX } } }),
  };
  await scene.attach(source);
  const pose: CameraPose = { x: 32, y: FLOOR + 1.6, z: FACE_Z + 3.0, yaw: 0, pitch: (-8 * Math.PI) / 180, hfov: 52, xfade: 0, shot: 'drift' };
  const frame = (dt = 1 / 60) => scene.frame(dt, dt, pose);
  const SHOTS: Record<string, () => void> = {
    drift: () => {
      phase = 'drift';
      dug = 0;
      Object.assign(pose, { x: 32, y: FLOOR + 1.6, z: FACE_Z + 3.0, yaw: 0, pitch: (-8 * Math.PI) / 180 });
    },
    breach: () => {
      phase = 'drift';
      dug = K - 1;
      Object.assign(pose, { x: 32, y: FLOOR + 1.6, z: FACE_Z - (K - 1) + 3.0, yaw: 0, pitch: (-8 * Math.PI) / 180 });
    },
    chamber: () => {
      phase = 'chamber';
      dug = K;
      openPlug();
      Object.assign(pose, { x: 32, y: FLOOR + 1.6, z: FACE_Z - K + 0.6, yaw: 0.12, pitch: 0.02 });
    },
    veins: () => {
      phase = 'chamber';
      dug = K;
      openPlug();
      Object.assign(pose, { x: 29.0, y: FLOOR + 1.6, z: 18.5, yaw: 1.2, pitch: 0.05 });
    },
    lamps: () => {
      phase = 'chamber';
      dug = K;
      openPlug();
      Object.assign(pose, { x: 33.0, y: FLOOR + 1.6, z: 14.0, yaw: -1.1, pitch: -0.05 });
    },
    exit: () => {
      phase = 'chamber';
      dug = K;
      openPlug();
      Object.assign(pose, { x: 33, y: FLOOR + 1.6, z: 12, yaw: 0.12, pitch: -0.1 });
    },
    // The Reveal's title carved in light over the chamber (take it last: it leaves the Glowroot grade on).
    reveal: () => {
      phase = 'chamber';
      dug = K;
      openPlug();
      Object.assign(pose, { x: 32, y: FLOOR + 1.6, z: FACE_Z - K + 0.6, yaw: 0.12, pitch: 0.14 });
      frame();
      scene.reveal(1);
    },
  };
  let opened = false;
  function openPlug(): void {
    if (opened) return;
    opened = true;
    for (let z = 0; z < SZ; z++) for (let y = 0; y < SY; y++) for (let x = 0; x < SX; x++) if (world.get(x, y, z) === B.FACE_PLUG) world.set(x, y, z, B.AIR);
  }
  const shot = q.get('shot') ?? 'drift';
  (SHOTS[shot] ?? SHOTS.drift)();
  if (scene.chunks) await scene.chunks.flush();
  for (let i = 0; i < 3; i++) frame();
  const api: HybridLabApi = {
    ready: true,
    scene,
    shots: Object.keys(SHOTS),
    shot(name: string) {
      (SHOTS[name] ?? SHOTS.drift)();
    },
    pose(x, y, z, yaw, pitch) {
      Object.assign(pose, { x, y, z, yaw, pitch });
    },
    render(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) frame(dt);
    },
    tap(x, y) {
      const p = scene.pick(x, y);
      scene.strike(p, { x, y });
      if (p.kind === 'face') {
        const key = `${p.depth}:${p.col}`;
        const left = (hits.get(key) ?? 1) - 0.34;
        hits.set(key, left);
        if (left <= 0) scene.breakBlocks([{ depth: p.depth, col: p.col, kind: 1 }]);
      }
      return p.kind;
    },
    debugView(n: number) {
      renderer.light.uniforms.uL_Frame.value.z = n;
    },
    info() {
      const s = scene.stats();
      return { buildMs: Math.round(buildMs), calls: s.calls, tris: s.tris, ...scene.worldStats(), fx: s.fx };
    },
  };
  // Live loop unless capturing (captures render on demand).
  if (!q.has('capture')) {
    let last = performance.now();
    const loop = (now: number) => {
      frame(Math.min(0.05, (now - last) / 1000));
      last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  return api;
}
