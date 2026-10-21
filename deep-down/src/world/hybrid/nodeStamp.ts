// Stamping nodes into slabs (SPEC §4.10; BUILD §3.2 MUST 4: replaces slab passes 4–9): the chamber's carved grid, its
// exit passage and Way Down (ladder shaft, stair or chute, the cart run), the next drift's stub and its face plug
// (FACE_PLUG, solid for light and picking, never meshed), and the camp's quarry. Pure: the slab worker and the tests
// run it.

import { B, EMITTER, SOLID } from '../../config/blocks';
import { CART_H, CART_HALF, type CartRun } from './rails';
import { RING_SX, RING_SZ, SLAB_ROWS, VOXEL } from './grid';
import { chamberGeom, campFrame, holeV, nodeFrame, toWorld, TUBE_H, TUBE_W, CAMP_FLOOR, type CornerFrame, type NodeFrame } from './layout';
/** Biome rock of any slot (host, soft skin, hard, ore, rich, gem, special): stamped as rock, never claimed. */
const isBiomeRock = (id: number): boolean => id >= 64 && id < 176;
import type { LocalGrid } from './caverns/local';

/** A slab being stamped: blocks for world rows [jTop - 31, jTop] (r = 0 is jTop, the slab's top row). */
export interface SlabTarget {
  k: number;
  blocks: Uint8Array;
  /** 1 where a node already wrote air or a built block (later rock never fills it). */
  claim: Uint8Array;
  /** World voxel row of r = 0. */
  jTop: number;
}

export const slabIdx = (x: number, r: number, z: number): number => x + RING_SX * (r + SLAB_ROWS * z);

export function newTarget(k: number): SlabTarget {
  const n = RING_SX * SLAB_ROWS * RING_SZ;
  return { k, blocks: new Uint8Array(n), claim: new Uint8Array(n), jTop: -SLAB_ROWS * k - 1 };
}

/** Write a world voxel into the slab (if it lies in it). mode: 'air' always wins over rock; 'built' wins over rock and
 *  air of other nodes; 'rock' only fills unclaimed voxels. */
export function put(t: SlabTarget, x: number, j: number, z: number, id: number, mode: 'air' | 'built' | 'rock' | 'force'): void {
  const r = t.jTop - j;
  if (r < 0 || r >= SLAB_ROWS || x < 0 || x >= RING_SX || z < 0 || z >= RING_SZ) return;
  const i = slabIdx(x, r, z);
  if (mode === 'rock') {
    if (t.claim[i]) return;
    t.blocks[i] = id;
    return;
  }
  if (mode === 'air' && t.claim[i] === 2) return; // a built block of another node stays
  t.blocks[i] = id;
  t.claim[i] = mode === 'built' || mode === 'force' ? 2 : 1;
}

/** Fill a world box (metres, [min, max)) with a block. */
export function putBox(t: SlabTarget, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, id: number, mode: 'air' | 'built' | 'rock' | 'force'): void {
  const a = (m: number) => Math.floor(m / VOXEL + 1e-6);
  const b = (m: number) => Math.ceil(m / VOXEL - 1e-6);
  const ja = a(Math.min(y0, y1));
  const jb = b(Math.max(y0, y1));
  const jLo = Math.max(ja, t.jTop - SLAB_ROWS + 1);
  const jHi = Math.min(jb - 1, t.jTop);
  if (jLo > jHi) return;
  for (let z = a(Math.min(z0, z1)); z < b(Math.max(z0, z1)); z++)
    for (let x = a(Math.min(x0, x1)); x < b(Math.max(x0, x1)); x++) for (let j = jLo; j <= jHi; j++) put(t, x, j, z, id, mode);
}

/** The world voxel of a chamber grid cell. */
function cellToWorld(F: CornerFrame, g: LocalGrid, i: number, j: number, k: number): [number, number, number] {
  const p = toWorld(F, { u: g.cu(i), y: g.cy(j), v: g.cv(k) });
  return [Math.floor(p.x / VOXEL), Math.floor(p.y / VOXEL), Math.floor(p.z / VOXEL)];
}

/** Stamp node i's chamber grid: its air and built blocks claim the voxels, its rock shell fills unclaimed ones. */
export function stampChamber(t: SlabTarget, lifeSeed: number, runSeed: number, i: number): void {
  const fr = nodeFrame(lifeSeed, i, runSeed);
  const geo = chamberGeom(lifeSeed, runSeed, i);
  const g = geo.grid;
  const F = fr.frame;
  // Quick reject: the grid's world y range against the slab.
  const yLo = F.o.y + g.y0;
  const yHi = F.o.y + g.y1;
  const sTop = (t.jTop + 1) * VOXEL;
  const sBot = (t.jTop - SLAB_ROWS + 1) * VOXEL;
  if (yHi < sBot || yLo > sTop) return;
  for (let k = 0; k < g.nv; k++)
    for (let jj = 0; jj < g.ny; jj++) {
      const wy = Math.floor((F.o.y + g.cy(jj)) / VOXEL);
      if (wy > t.jTop || wy < t.jTop - SLAB_ROWS + 1) continue;
      for (let ii = 0; ii < g.nu; ii++) {
        const id = g.data[g.idx(ii, jj, k)];
        const [x, , z] = cellToWorld(F, g, ii, jj, k);
        if (id === B.AIR || !SOLID[id]) put(t, x, wy, z, id, 'air');
        else if (isBiomeRock(id)) {
          // Only the shell next to air matters (inside rock is the base strata anyway).
          if (geo.shell[g.idx(ii, jj, k)]) put(t, x, wy, z, id, 'rock');
        } else put(t, x, wy, z, id, 'built');
      }
    }
}

/**
 * The connectors between node i and node i + 1: node i's exit passage beyond its right wall, the Way Down (ladder
 * shaft, stair or chute), node i + 1's stub and the K slices of its face plug (AIR when dug: rows < dugTo).
 */
export function stampConnectors(t: SlabTarget, lifeSeed: number, runSeed: number, i: number, dugTo: number, hostRock: number): void {
  const fr = nodeFrame(lifeSeed, i, runSeed);
  const next = nodeFrame(lifeSeed, i + 1, runSeed);
  const F = fr.frame;
  const e = fr.exit;
  const type = fr.spec.exit;
  const hv = holeV(fr);
  const exitY = F.o.y + e.dy;
  const box = (fr2: CornerFrame, u0: number, y0: number, v0: number, u1: number, y1: number, v1: number, id: number, mode: 'air' | 'built' | 'rock' | 'force') => {
    const a = toWorld(fr2, { u: u0, y: y0, v: v0 });
    const b = toWorld(fr2, { u: u1, y: y1, v: v1 });
    putBox(t, Math.min(a.x, b.x), Math.min(a.y, b.y), Math.min(a.z, b.z), Math.max(a.x, b.x), Math.max(a.y, b.y), Math.max(a.z, b.z), id, mode);
  };
  if (type !== 'hatch' && type !== 'closed') {
    // The exit passage from inside the room out to the Way Down's top (timbered; dressing in the placement).
    if (e.through) {
      box(F, e.u - 1.75, e.dy, fr.w - 2.5, e.u + 1.75, e.dy + 3.0, hv + 1.5, B.AIR, 'air');
      box(F, e.u - 1.25, e.dy + 3.0, fr.w - 2.5, e.u + 1.25, e.dy + 3.5, hv + 1.0, B.AIR, 'air');
      box(F, e.u - 1.75, e.dy - 1.0, fr.w - 2.5, e.u + 1.75, e.dy, hv + 1.5, hostRock, 'rock');
    }
    const landing = next.landing;
    if (type === 'cart' && fr.cart) {
      stampCart(t, fr.cart, hostRock);
    } else if (type === 'stair' || type === 'chute') {
      // A 45° flight from the top (hv, exit floor) down to the landing along the next drift's line: 0.5 m steps.
      const drop = exitY - landing.y;
      const nSteps = Math.round(drop / VOXEL);
      for (let s = 0; s <= nSteps; s++) {
        const v = hv + s * VOXEL;
        const fy = e.dy - s * VOXEL;
        box(F, e.u - 1.5, fy, v - 0.25, e.u + 1.5, fy + 3.2, v + 0.75, B.AIR, 'air');
        box(F, e.u - 1.5, fy - 1.0, v - 0.25, e.u + 1.5, fy, v + 0.25, type === 'stair' ? B.MASONRY : hostRock, type === 'stair' ? 'built' : 'rock');
      }
    } else {
      // A shaft (2 x 2 m) from the passage floor down to the landing (ladder, rope, the cart platform's drop).
      const yTop = exitY + 3.0;
      const c = toWorld(F, { u: e.u, y: 0, v: hv });
      putBox(t, c.x - 1.0, landing.y, c.z - 1.0, c.x + 1.0, yTop, c.z + 1.0, B.AIR, 'air');
    }
  }
  if (next.fromAbove) {
    // The Threshold's drop shaft: open air from its balcony up to the hatch (the hatch itself is the Lift Bottom's).
    const h = toWorld(F, { u: e.u, y: e.dy, v: e.v });
    putBox(t, h.x - 1.5, next.landing.y, h.z - 1.5, h.x + 1.5, h.y - 1.0, h.z + 1.5, B.AIR, 'air');
    return;
  }
  stampDrift(t, next, dugTo, hostRock);
}

/** The cart run's tunnel (3 m wide, 3.5 m tall over the rail), its grotto, the rock bed under the rails, gold glints. */
function stampCart(t: SlabTarget, run: CartRun, hostRock: number): void {
  const rl = run.rail;
  for (let k = 0; k < rl.length; k++) {
    const p = rl[k];
    const q = rl[Math.min(rl.length - 1, k + 1)];
    const r0 = rl[Math.max(0, k - 1)];
    const tx = q.x - r0.x;
    const tz = q.z - r0.z;
    const tl = Math.hypot(tx, tz) || 1;
    const sx = -tz / tl;
    const sz = tx / tl;
    for (let w = -CART_HALF; w <= CART_HALF; w += VOXEL * 0.5) {
      const x = p.x + sx * w;
      const z = p.z + sz * w;
      putBox(t, x - 0.26, p.y, z - 0.26, x + 0.26, p.y + CART_H - (Math.abs(w) > CART_HALF - 0.6 ? 0.6 : 0), z + 0.26, B.AIR, 'air');
      putBox(t, x - 0.26, p.y - 1.0, z - 0.26, x + 0.26, p.y, z + 0.26, hostRock, 'rock');
    }
  }
  const g = run.grotto;
  const r = g.r;
  for (let dz = -r; dz <= r; dz += VOXEL)
    for (let dx = -r; dx <= r; dx += VOXEL)
      for (let dy = 0; dy <= 5; dy += VOXEL) {
        const e = (dx / r) ** 2 + (dz / r) ** 2 + ((dy - 1.6) / 3.4) ** 2;
        if (e > 1) continue;
        put(t, Math.floor((g.centre.x + dx) / VOXEL), Math.floor((g.centre.y + dy) / VOXEL), Math.floor((g.centre.z + dz) / VOXEL), B.AIR, 'air');
      }
  // Gold glints in the grotto's walls (a few emitter voxels: the run's warm accent).
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const x = g.centre.x + Math.cos(a) * (r + 0.25);
    const z = g.centre.z + Math.sin(a) * (r + 0.25);
    const y = g.centre.y + 1.0 + (k % 3) * 0.7;
    put(t, Math.floor(x / VOXEL), Math.floor(y / VOXEL), Math.floor(z / VOXEL), EMITTER.GOLD, 'built');
  }
}

/** The drift of node `fr`: the stub (open) and its K slices (FACE_PLUG, or AIR when dug), octagon section. */
export function stampDrift(t: SlabTarget, fr: NodeFrame, dugTo: number, hostRock: number): void {
  const f = fr.dir;
  const half = TUBE_W / 2;
  const L = fr.topo.K;
  const along = (s: number) => ({ x: fr.landing.x + f.x * s, z: fr.landing.z + f.z * s });
  const total = Math.hypot(fr.face.x - fr.landing.x, fr.face.z - fr.landing.z) + L;
  const n = Math.floor(total / VOXEL + 1e-6);
  const y0 = fr.landing.y;
  for (let s = 0; s < n; s++) {
    const a = along((s + 0.5) * VOXEL);
    const tAlong = (s + 0.5) * VOXEL - Math.hypot(fr.face.x - fr.landing.x, fr.face.z - fr.landing.z);
    const slice = tAlong >= 0 ? Math.floor(tAlong) : -1;
    const dug = slice < 0 || fr.topo.depthTop + slice < dugTo;
    const id = dug ? B.AIR : B.FACE_PLUG;
    // Cross-section: 7 voxels wide, 6 tall, the 4 corners chamfered (the octagon heading).
    const wide = Math.round(TUBE_W / VOXEL);
    const tall = Math.round(TUBE_H / VOXEL);
    for (let w = 0; w < wide; w++)
      for (let h = 0; h < tall; h++) {
        const corner = (w === 0 || w === wide - 1) && (h === 0 || h === tall - 1);
        const lat = -half + (w + 0.5) * VOXEL;
        const px = a.x + (f.z !== 0 ? lat : 0);
        const pz = a.z + (f.x !== 0 ? lat : 0);
        const x = Math.floor(px / VOXEL);
        const z = Math.floor(pz / VOXEL);
        const j = Math.floor((y0 + (h + 0.5) * VOXEL) / VOXEL);
        if (corner) {
          put(t, x, j, z, hostRock, 'rock');
          continue;
        }
        put(t, x, j, z, id, id === B.AIR ? 'air' : 'built');
      }
    // The floor under the tube is rock.
    for (let w = 0; w < wide; w++) {
      const lat = -half + (w + 0.5) * VOXEL;
      const x = Math.floor((a.x + (f.z !== 0 ? lat : 0)) / VOXEL);
      const z = Math.floor((a.z + (f.x !== 0 ? lat : 0)) / VOXEL);
      put(t, x, Math.floor(y0 / VOXEL) - 1, z, hostRock, 'rock');
    }
  }
}

/** The camp's quarry at the surface: open to the sky, its floor at CAMP_FLOOR, the adit into node 0's stub. */
export function stampCamp(t: SlabTarget, lifeSeed: number, runSeed: number, hostRock: number, soil: number): void {
  const c = campFrame(lifeSeed, runSeed);
  const F = c.frame;
  const sTop = (t.jTop + 1) * VOXEL;
  if (sTop < CAMP_FLOOR - 2) return;
  const g = (u: number, y: number, v: number) => toWorld(F, { u, y, v });
  // The quarry: a rounded rectangle whose walls step back as they rise (two benches), open above.
  for (let ui = 0; ui < c.d / VOXEL; ui++)
    for (let vi = 0; vi < c.w / VOXEL; vi++) {
      const u = (ui + 0.5) * VOXEL;
      const v = (vi + 0.5) * VOXEL;
      const du = Math.max(0, Math.abs(u - c.d / 2) - (c.d / 2 - 3));
      const dv = Math.max(0, Math.abs(v - c.w / 2) - (c.w / 2 - 3));
      const r = Math.hypot(du, dv);
      if (r > 3) continue;
      // The floor rises in benches toward the rim: 0 inside, +1.5 at r > 1.5, +3 at r > 2.5; the adit's approach is cut
      // level through them.
      const cutAdit = Math.abs(u - c.aditU) < 2.25 && v > c.w / 2;
      const floorY = CAMP_FLOOR + (cutAdit ? 0 : r > 2.5 ? 3 : r > 1.5 ? 1.5 : 0);
      const p = g(u, 0, v);
      const x = Math.floor(p.x / VOXEL);
      const z = Math.floor(p.z / VOXEL);
      for (let j = Math.floor(floorY / VOXEL); j < 0; j++) put(t, x, j, z, B.AIR, 'air');
      // Turf on the floor's top voxel.
      put(t, x, Math.floor(floorY / VOXEL) - 1, z, soil, 'built');
    }
  // The adit: node 0's stub opens through the quarry's wall (its timber frame is dressing).
  void hostRock;
}
