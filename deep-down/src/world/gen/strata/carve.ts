import { B } from '../../../config/blocks';
import { BIOMES, type BiomeId } from '../../../config/biomes';
import { Noise } from '../../../core/noise';
import type { VoxelWorld } from '../../VoxelWorld';
import { edgePath, type PlanNode, type StratumPlan } from './plan';

/**
 * The voxel passes of a stratum (round 3, WORLD): host rock, the chambers and tunnels of the plan,
 * the organic "spaghetti" worm caves, and the floor guard that keeps every planned floor whole.
 *
 * The guard: `floorY[col]` holds the walking floor of the plan's tunnels and chambers at each column
 * (-1 elsewhere), dilated by two cells. The worm caves never carve the three cells under a guarded
 * floor, so they open side galleries and roofs but never a hole in a path.
 */
export interface CarveState {
  world: VoxelWorld;
  plan: StratumPlan;
  noise: Noise;
  /** Planned floor per column (feet y), -1 where no plan floor runs. */
  floorY: Int16Array;
  /** Columns on the walking line of a tunnel (decor keeps off them). */
  corridor: Uint8Array;
  /** Biome index per column after the transition dither (0 / 1). */
  biomeCol: Uint8Array;
  /** Chamber columns: node id + 1 (0 none). */
  chamberOf: Uint16Array;
}

const idx = (w: VoxelWorld, x: number, y: number, z: number) => x + w.sx * (y + w.sy * z);

/** Host rock: two rocks per biome in banded strata that dip with a slow noise, bedrock shell. */
export function fillHost(st: CarveState): void {
  const { world: w, plan, noise } = st;
  const { sx, sy, sz } = w;
  const hosts = plan.biomes.map((b) => BIOMES[b].hosts);
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const col = x + z * sx;
    // Transition: within ~6 m of the border the two biomes' rock interleaves in noisy patches.
    let bi = plan.regionMap[col];
    const blend = plan.regionBlend[col];
    if (blend < 12 && noise.noise2(x / 6.5 + 31, z / 6.5 - 17) * 12 > blend) bi = 1 - bi;
    st.biomeCol[col] = bi;
    const h = hosts[bi];
    const dip = 7 * noise.noise2(x / 52, z / 52) + 2.5 * noise.noise2(x / 13 + 5, z / 13);
    for (let y = 0; y < sy; y++) {
      const band = Math.floor((y + dip) / 6);
      w.blocks[x + sx * (y + sy * z)] = y === 0 || y === sy - 1 ? B.BEDROCK : h[band & 1];
    }
  }
}

/** Carve one chamber: an ellipsoid hall with a floor field (flat at the rim, mounds or dips inside). */
export function carveNode(st: CarveState, n: PlanNode): void {
  const { world: w, noise } = st;
  const { sx, sy } = w;
  const shape = BIOMES[n.biome].shape;
  const cos = Math.cos(n.rot);
  const sin = Math.sin(n.rot);
  const R = Math.max(n.rx, n.rz) + 3;
  const x0 = Math.max(2, Math.floor(n.x - R));
  const x1 = Math.min(w.sx - 3, Math.ceil(n.x + R));
  const z0 = Math.max(2, Math.floor(n.z - R));
  const z1 = Math.min(w.sz - 3, Math.ceil(n.z + R));
  const flat = n.kind === 'arrival' || n.kind === 'gate' || n.kind === 'lair' || n.kind === 'heart';
  const bumpAmp = flat ? 0 : n.kind === 'cavern' ? 3 : 1.2;
  const lakeBiome = shape.lakes > 0.4 || shape.lava > 0.4;
  const pillars: Array<[number, number, number]> = [];
  if (n.kind === 'cavern') {
    const count = Math.round(shape.pillars * 5);
    for (let k = 0; k < count; k++) {
      const a = (k / Math.max(1, count)) * Math.PI * 2 + noise.noise2(n.x, k) * 2;
      const r = 0.35 + 0.3 * ((noise.noise2(k * 3.1, n.z) + 1) / 2);
      pillars.push([n.x + Math.cos(a) * n.rx * r, n.z + Math.sin(a) * n.rz * r, 1.4 + 1.6 * ((noise.noise2(k, k) + 1) / 2)]);
    }
  }
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    const dx = x + 0.5 - n.x;
    const dz = z + 0.5 - n.z;
    const u = (dx * cos + dz * sin) / n.rx;
    const v = (-dx * sin + dz * cos) / n.rz;
    const wob = 1 + 0.16 * noise.noise2(x / 9 + n.id * 7, z / 9);
    const d = Math.sqrt(u * u + v * v) / wob;
    if (d >= 1) continue;
    let pillar = false;
    for (const [px, pz, pr] of pillars) if ((x + 0.5 - px) ** 2 + (z + 0.5 - pz) ** 2 < pr * pr) pillar = true;
    // Floor: flat at the rim, mounds and dips inside.
    const inner = 1 - smooth(0.42, 0.78, d);
    let bump = bumpAmp * inner * noise.noise2(x / 14 + n.id * 3.3, z / 14 - n.id);
    if (lakeBiome) bump = Math.max(-1, bump);
    else bump = Math.max(-2, bump);
    const floor = Math.round(n.y + bump);
    const roof = n.y + n.ry * Math.sqrt(1 - d * d) * (0.82 + 0.26 * noise.noise2(x / 11 - n.id, z / 11 + 2)) + 2.2;
    const top = Math.min(sy - 3, Math.floor(roof));
    const col = x + z * sx;
    st.chamberOf[col] = n.id + 1;
    if (pillar) continue;
    for (let y = floor; y <= top; y++) w.blocks[idx(w, x, y, z)] = B.AIR;
    // Guard the floor (the chamber floor is a planned floor).
    if (st.floorY[col] < 0 || floor < st.floorY[col]) st.floorY[col] = floor;
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Carve one tunnel sample: an arched cross-section of radius r and height h over the floor at cy.
 * `respect`: a side gallery never digs under a floor already guarded (it opens a wall at most).
 */
function carveSample(st: CarveState, cx: number, cy: number, cz: number, r: number, h: number, respect: boolean): void {
  const w = st.world;
  const { sx, sy } = w;
  const floor = Math.round(cy);
  const R = Math.ceil(r + 1);
  for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
    const x = Math.floor(cx) + dx;
    const z = Math.floor(cz) + dz;
    if (x < 3 || z < 3 || x >= w.sx - 3 || z >= w.sz - 3) continue;
    const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    if (d > r + 0.5) continue;
    const col = x + z * sx;
    const guard = st.floorY[col];
    if (respect && guard >= 0 && floor < guard && floor >= guard - 6) continue;
    if (d < 1.2 && !respect) st.corridor[col] = 1;
    const top = Math.min(sy - 3, Math.floor(floor + h * Math.sqrt(Math.max(0, 1 - (d / (r + 0.6)) ** 2)) + 0.6));
    // Inside a chamber the chamber's floor rules (a tunnel never digs a trench below it).
    const inChamber = st.chamberOf[col] > 0;
    const f = inChamber && guard >= 0 ? Math.max(floor, guard) : floor;
    for (let y = f; y <= Math.max(top, f + 2); y++) {
      if (respect && guard >= 0 && y < guard && y >= guard - 3) continue;
      w.blocks[idx(w, x, y, z)] = B.AIR;
    }
    if (guard < 0 || f < guard) st.floorY[col] = f;
  }
}

/** Carve every tunnel of the plan: an arched passage along the meandering edge, floor rising evenly. */
export function carveEdges(st: CarveState): void {
  const { plan, noise } = st;
  for (const e of plan.edges) {
    const path = edgePath(plan, e, 0.6);
    let s = 0;
    for (let i = 0; i < path.length; i++) {
      const [cx, cy, cz] = path[i];
      s += 0.6;
      const r = e.radius * (1 + 0.22 * noise.noise2(s / 9 + e.id * 13, 0.5));
      const h = e.height * (1 + 0.2 * noise.noise2(s / 7, e.id * 3.7));
      carveSample(st, cx, cy, cz, r, h, false);
    }
  }
}

/**
 * Side galleries: narrower passages that leave the tunnels at a random point and wander 16-50 m
 * (heading a random walk, the floor climbing at most 0.34 per metre), ending in a small pocket. They
 * are the forks and dead ends of the network: what to find off the main way. Returns their pockets.
 */
export function carveGalleries(st: CarveState, rng: { range(a: number, b: number): number; chance(p: number): boolean; int(a: number, b: number): number }): Array<[number, number, number]> {
  const { plan, world: w } = st;
  const pockets: Array<[number, number, number]> = [];
  for (const e of plan.edges) {
    const path = edgePath(plan, e, 0.6);
    const count = rng.chance(0.85) ? rng.int(1, 3) : 0;
    for (let k = 0; k < count; k++) {
      const i0 = rng.int(Math.floor(path.length * 0.2), Math.floor(path.length * 0.8));
      const [px, py, pz] = path[i0];
      const [qx, , qz] = path[Math.min(path.length - 1, i0 + 2)];
      const along = Math.atan2(qz - pz, qx - px);
      let yaw = along + (rng.chance(0.5) ? 1 : -1) * rng.range(0.6, 1.6);
      let x = px;
      let z = pz;
      let y = py;
      let slope = rng.range(-0.3, 0.3);
      const len = rng.range(16, 50);
      const r = rng.range(1.5, 2.3);
      const h = rng.range(2.9, 3.6);
      let ok = true;
      for (let s = 0; s < len && ok; s += 0.6) {
        yaw += rng.range(-0.09, 0.09);
        if (rng.chance(0.04)) slope = rng.range(-0.34, 0.34);
        x += Math.cos(yaw) * 0.6;
        z += Math.sin(yaw) * 0.6;
        y = Math.max(8, Math.min(78, y + slope * 0.6));
        if (x < 8 || z < 8 || x > w.sx - 8 || z > w.sz - 8) ok = false;
        else carveSample(st, x, y, z, s < 2 ? r + 0.5 : r, h, s > 3);
      }
      if (ok) {
        // The pocket at the end.
        for (let a = 0; a < 6; a++) carveSample(st, x + Math.cos(a) * 1.5, y, z + Math.sin(a) * 1.5, 2.6, 3.4, true);
        pockets.push([x, Math.round(y), z]);
      }
    }
  }
  return pockets;
}

/** Dilate the floor guard by `n` cells (keeps worms from opening pits right beside a path). */
export function dilateGuard(st: CarveState, n = 2): void {
  const { sx, sz } = st.plan;
  for (let it = 0; it < n; it++) {
    const src = st.floorY.slice();
    for (let z = 1; z < sz - 1; z++) for (let x = 1; x < sx - 1; x++) {
      const i = x + z * sx;
      if (src[i] >= 0) continue;
      let m = -1;
      for (const j of [i - 1, i + 1, i - sx, i + sx]) if (src[j] >= 0 && (m < 0 || src[j] < m)) m = src[j];
      if (m >= 0) st.floorY[i] = m;
    }
  }
}

/**
 * Worm caves: where two smooth 3D noise fields are both near zero (the intersection of two
 * surfaces is a tube). Sampled on a 2 m lattice and interpolated. They open side galleries, forks and
 * dead-end pockets; they never touch the three cells under a guarded floor, nor the zone's shell.
 */
export function carveWorms(st: CarveState, seed: number): number {
  const { world: w, plan } = st;
  const { sx, sy, sz } = w;
  const n1 = new Noise(seed ^ 0x3a3a);
  const n2 = new Noise(seed ^ 0x7c7c);
  const S = 2;
  const gx = Math.ceil(sx / S) + 1;
  const gy = Math.ceil(sy / S) + 1;
  const gz = Math.ceil(sz / S) + 1;
  const g = new Float32Array(gx * gy * gz);
  const scale = 1 / 30;
  for (let k = 0; k < gz; k++) for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    const x = i * S;
    const y = j * S;
    const z = k * S;
    const a = n1.noise3(x * scale, y * scale * 1.5, z * scale);
    const b = n2.noise3(x * scale + 17.3, y * scale * 1.5 - 4.1, z * scale + 9.2);
    g[i + gx * (j + gy * k)] = a * a + b * b;
  }
  const t = new Float32Array(2);
  t[0] = 0.0042;
  t[1] = 0.0042;
  for (let bi = 0; bi < 2; bi++) t[bi] *= BIOMES[plan.biomes[bi]].shape.tunnelWidth ** 2;
  let carved = 0;
  for (let z = 3; z < sz - 3; z++) {
    const k = Math.floor(z / S);
    const fz = z / S - k;
    for (let x = 3; x < sx - 3; x++) {
      const i = Math.floor(x / S);
      const fx = x / S - i;
      const col = x + z * sx;
      const thr = t[st.biomeCol[col]];
      const guard = st.floorY[col];
      for (let y = 5; y < sy - 6; y++) {
        if (guard >= 0 && y < guard && y >= guard - 3) continue;
        const j = Math.floor(y / S);
        const fy = y / S - j;
        const o = i + gx * (j + gy * k);
        const c00 = g[o] + (g[o + 1] - g[o]) * fx;
        const c10 = g[o + gx] + (g[o + gx + 1] - g[o + gx]) * fx;
        const c01 = g[o + gx * gy] + (g[o + gx * gy + 1] - g[o + gx * gy]) * fx;
        const c11 = g[o + gx * gy + gx] + (g[o + gx * gy + gx + 1] - g[o + gx * gy + gx]) * fx;
        const c0 = c00 + (c10 - c00) * fy;
        const c1 = c01 + (c11 - c01) * fy;
        const v = c0 + (c1 - c0) * fz;
        if (v < thr) {
          const id = x + sx * (y + sy * z);
          if (w.blocks[id] !== B.AIR) {
            w.blocks[id] = B.AIR;
            carved++;
          }
        }
      }
    }
  }
  return carved;
}

/** The biome of a column after the transition dither. */
export const colBiome = (st: CarveState, x: number, z: number): BiomeId => st.plan.biomes[st.biomeCol[Math.floor(x) + Math.floor(z) * st.plan.sx]];
