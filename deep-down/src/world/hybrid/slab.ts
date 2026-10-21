// One slab of the hybrid world (SPEC §4.10; BUILD §3.2 MUST 4): 128 x 32 x 128 voxels of 0.5 m for world y in
// [-16k - 16, -16k), a pure function of (lifeSeed, runSeed, k) and the dig front. Passes: 1 the host rock by biome
// (keyed by the nodes around this height), 2 strata (dipping beds, a hard marker bed), 3 decorative ore lenses deep in
// the rock; then the stamp: the camp's quarry, every node's chamber, exit and Way Down, the drifts and their face
// plugs; then the runtime openings (secrets broken, skin cells mined, the hatch) the game passes back in.

import { B, SLOT, biomeBlock } from '../../config/blocks';
import { RING_SX, RING_SZ, SLAB_M, SLAB_ROWS, VOXEL } from './grid';
import { chamberGeom, nodeFrame, nodesInBand, placeNode, worldCell } from './layout';
import { newTarget, put, stampCamp, stampChamber, stampConnectors, stampDrift, slabIdx } from './nodeStamp';
import { h01, vnoise } from './caverns/local';

export interface SlabInput {
  lifeSeed: number;
  runSeed: number;
  k: number;
  /** Model depth dug so far: every drift slice whose row is < dugTo is open (AIR), the rest FACE_PLUG. */
  dugTo: number;
  /** Socket ids opened this run (`<node>:x0` secrets, `<node>:k12` skin cells, `<node>:hatch`, `<node>:l0` lamps
   *  relit: their flame is baked into the light field). */
  opened?: ReadonlyArray<string>;
}

export interface SlabOut {
  k: number;
  blocks: Uint8Array;
  /** The nodes stamped into it. */
  nodes: number[];
  ms: number;
}

export const SLAB_VOXELS = RING_SX * SLAB_ROWS * RING_SZ;

/** The biome of the rock at world y: the biome of the node whose chamber floor is nearest (Topsoil above 0). */
function biomeAtY(lifeSeed: number, y: number, nodes: number[]): number {
  let best = 0;
  let bd = Infinity;
  for (const i of nodes) {
    const fr = nodeFrame(lifeSeed, i);
    const d = Math.abs(fr.frame.o.y - y);
    if (d < bd) {
      bd = d;
      best = fr.spec.biome === 0 ? 0 : Math.max(1, fr.topo.biome);
    }
  }
  return best;
}

/** Generate slab k (pure; the worker and the main-thread fallback run the same code). */
export function generateSlab(input: SlabInput): SlabOut {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const { lifeSeed, runSeed, k } = input;
  const t = newTarget(k);
  if (k < 0) {
    t.blocks.fill(B.AIR);
    return { k, blocks: t.blocks, nodes: [], ms: 0 };
  }
  const yTop = -SLAB_M * k;
  const yBot = yTop - SLAB_M;
  const nodes = nodesInBand(lifeSeed, yBot, yTop, runSeed);
  // ---- passes 1–3: host rock by biome, strata, lenses ------------------------------------------------------------
  const rowBiome = new Int16Array(SLAB_ROWS);
  for (let r = 0; r < SLAB_ROWS; r++) rowBiome[r] = biomeAtY(lifeSeed, (t.jTop - r + 0.5) * VOXEL, nodes.length ? nodes : [0]);
  const seed = lifeSeed ^ 0x51ab;
  for (let z = 0; z < RING_SZ; z++)
    for (let x = 0; x < RING_SX; x++) {
      const warp = 1.2 * vnoise(seed, x / 18, 0.5, z / 18);
      for (let r = 0; r < SLAB_ROWS; r++) {
        const y = (t.jTop - r + 0.5) * VOXEL;
        const b = rowBiome[r];
        const bed = Math.floor((y + 0.08 * x * VOXEL + warp) / 2.25);
        const fam = h01(seed, bed, 17);
        let id = fam < 0.58 ? biomeBlock(b, SLOT.HOST_A) : fam < 0.9 ? biomeBlock(b, SLOT.HOST_B) : biomeBlock(b, SLOT.HARD);
        // Decorative lenses deep in the rock (only seen when something breaks into them).
        if (h01(seed ^ 0x77, x >> 2, (t.jTop - r) >> 2, z >> 2) < 0.012) id = biomeBlock(b, SLOT.ORE);
        t.blocks[slabIdx(x, r, z)] = id;
      }
    }
  const host = biomeBlock(rowBiome[0], SLOT.HOST_B);
  // ---- the camp (surface slab) --------------------------------------------------------------------------------------
  if (k === 0) {
    stampCamp(t, lifeSeed, runSeed, host, B.TOPSOIL);
    stampDrift(t, nodeFrame(lifeSeed, 0, runSeed), input.dugTo, host);
  }
  // ---- nodes: chambers, then connectors (so a passage's air wins over a neighbour's rock shell) --------------------------
  for (const i of nodes) stampChamber(t, lifeSeed, runSeed, i);
  for (const i of nodes) {
    const b = nodeFrame(lifeSeed, i).spec.biome;
    stampConnectors(t, lifeSeed, runSeed, i, input.dugTo, biomeBlock(b, SLOT.HOST_B));
  }
  // ---- runtime openings ---------------------------------------------------------------------------------------------
  if (input.opened?.length) applyOpenings(t, lifeSeed, runSeed, nodes, input.opened);
  // Crew lamps in the drifts glow in the light field.
  for (const i of nodes) {
    const fr = nodeFrame(lifeSeed, i);
    const lp = { x: fr.landing.x + fr.dir.x * 0.6, y: fr.landing.y + 2.4, z: fr.landing.z + fr.dir.z * 0.6 };
    if (!fr.fromAbove) put(t, Math.floor(lp.x / VOXEL), Math.floor(lp.y / VOXEL), Math.floor(lp.z / VOXEL), B.LIGHT_LAMP, 'air');
  }
  // The warm practicals that burn (authored lamps, lamps found lit, lamps relit this run) glow in the light field too,
  // so the irradiance 1E samples carries their amber bounce, not only their real-time light (kits/types WorldLight).
  const relit = new Set(input.opened ?? []);
  for (const i of nodes)
    for (const l of placeNode(lifeSeed, { i }, undefined, runSeed).chamber.lights) {
      if (l.kind !== 'lamp' && l.kind !== 'crew') continue;
      if (l.cold && !(l.socket && relit.has(l.socket))) continue;
      putLightInAir(t, Math.floor(l.pos.x / VOXEL), Math.floor(l.pos.y / VOXEL), Math.floor(l.pos.z / VOXEL));
    }
  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return { k, blocks: t.blocks, nodes, ms };
}

/** A warm emitter voxel at a lamp's flame, only where the flame is in open air (never a hole in the rock). */
function putLightInAir(t: ReturnType<typeof newTarget>, x: number, j: number, z: number): void {
  const r = t.jTop - j;
  if (r < 0 || r >= SLAB_ROWS || x < 0 || x >= RING_SX || z < 0 || z >= RING_SZ) return;
  if (t.blocks[slabIdx(x, r, z)] === B.AIR) t.blocks[slabIdx(x, r, z)] = B.LIGHT_LAMP;
}

/** Secrets broken open, skin cells mined, the hatch split: their voxels become AIR. */
function applyOpenings(t: ReturnType<typeof newTarget>, lifeSeed: number, runSeed: number, nodes: number[], opened: ReadonlyArray<string>): void {
  const set = new Set(opened);
  for (const i of nodes) {
    const g = chamberGeom(lifeSeed, runSeed, i);
    const F = nodeFrame(lifeSeed, i, runSeed).frame;
    for (const s of g.sockets) {
      const id = `${i}:${s.id}`;
      if (!set.has(id)) continue;
      if (s.secret) for (const c of s.secret.cells) {
        const [x, j, z] = worldCell(F, g, c);
        put(t, x, j, z, B.AIR, 'force');
      }
      if (s.kind === 'skin' && s.cell) {
        const [x, j, z] = worldCell(F, g, s.cell);
        put(t, x, j, z, B.AIR, 'force');
      }
    }
    if (set.has(`${i}:hatch`)) {
      const g2 = g.grid;
      for (let k2 = 0; k2 < g2.nv; k2++)
        for (let j2 = 0; j2 < g2.ny; j2++)
          for (let i2 = 0; i2 < g2.nu; i2++) {
            if (g2.data[g2.idx(i2, j2, k2)] !== B.HATCH) continue;
            const [x, j, z] = worldCell(F, g, [i2, j2, k2]);
            put(t, x, j, z, B.AIR, 'force');
          }
    }
  }
}
