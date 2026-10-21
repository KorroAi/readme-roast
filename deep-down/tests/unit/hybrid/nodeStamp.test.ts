// U-W3 (SPEC §13.1, §4.10) for the hybrid stamp: every model row has exactly one slice of face plug where deepPath
// puts it (FACE_PLUG: solid for light and picking, never meshed, never a kind the model did not choose), digging a row
// opens exactly its slice, slabs are pure functions of the seeds, and the camp's quarry opens to the sky and walks into
// the first drift.
import { describe, expect, it } from 'vitest';
import { B } from '../../../src/config/blocks';
import { fingerprintBytes } from '../../../src/world/hybrid/fingerprint';
import { deepPath } from '../../../src/world/hybrid/deepPath';
import { DeepWorld } from '../../../src/world/hybrid/DeepWorld';
import { generateSlab } from '../../../src/world/hybrid/slab';
import { SLAB_ROWS, VOXEL, vox, type Box3 } from '../../../src/world/hybrid/grid';
import { slabIdx } from '../../../src/world/hybrid/nodeStamp';
import { placeNode } from '../../../src/world/hybrid/layout';

const SEED = 12345;
const RUN = 7;

/** Every voxel id inside a box (metres). */
function idsIn(w: DeepWorld, b: Box3): Map<number, number> {
  const out = new Map<number, number>();
  for (let z = vox(b.min.z); z <= vox(b.max.z - 1e-6); z++)
    for (let x = vox(b.min.x); x <= vox(b.max.x - 1e-6); x++)
      for (let j = vox(b.min.y); j <= vox(b.max.y - 1e-6); j++) {
        const id = w.ring.get(x, j, z);
        out.set(id, (out.get(id) ?? 0) + 1);
      }
  return out;
}

describe('the face plug (U-W3)', () => {
  const world = new DeepWorld({ lifeSeed: SEED, runSeed: RUN, worker: false });

  it('every row 0–39 has its slice of FACE_PLUG where deepPath puts it, and only plug, air or chamfer rock in it', () => {
    world.prime(-6, 0);
    for (let d = 0; d < 40; d++) {
      const pp = deepPath(SEED, d);
      if (pp.kind !== 'drift') continue;
      const p = placeNode(SEED, { i: pp.node }, undefined, RUN);
      const box = p.drift.slices[pp.slice];
      expect(box, `row ${d}`).toBeDefined();
      // deepPath's point is on the slice's front plane, at the floor, inside the box.
      expect(pp.pos.x).toBeGreaterThanOrEqual(box.min.x - 1e-6);
      expect(pp.pos.x).toBeLessThanOrEqual(box.max.x + 1e-6);
      expect(pp.pos.z).toBeGreaterThanOrEqual(box.min.z - 1e-6);
      expect(pp.pos.z).toBeLessThanOrEqual(box.max.z + 1e-6);
      if (!world.ready(box.min.y) || !world.ready(box.max.y - 0.01)) continue;
      const ids = idsIn(world, box);
      const plug = ids.get(B.FACE_PLUG) ?? 0;
      // 7 wide x 6 tall x 2 deep, minus the 4 chamfered corners on each of the 2 layers.
      expect(plug, `row ${d}: plug voxels`).toBe((7 * 6 - 4) * 2);
      for (const [id] of ids) expect(id === B.FACE_PLUG || (id >= 64 && id < 176), `row ${d}: block ${id} in the slice`).toBe(true);
    }
  });

  it('digging a row opens exactly its slice; the next slice stays plugged', () => {
    world.prime(-6, 0);
    const d = 2;
    const pp = deepPath(SEED, d);
    const p = placeNode(SEED, { i: pp.node }, undefined, RUN);
    world.digTo(d + 1);
    for (let k = 0; k <= d; k++) expect(idsIn(world, p.drift.slices[k]).get(B.FACE_PLUG) ?? 0, `slice ${k}`).toBe(0);
    expect(idsIn(world, p.drift.slices[d + 1]).get(B.FACE_PLUG) ?? 0).toBe(76);
    // A regenerated window keeps the dug rows open.
    world.prime(-6, d + 1);
    expect(idsIn(world, p.drift.slices[d]).get(B.FACE_PLUG) ?? 0).toBe(0);
    expect(idsIn(world, p.drift.slices[d + 1]).get(B.FACE_PLUG) ?? 0).toBe(76);
  });
});

describe('slabs', () => {
  it('are pure: the same seeds give the same bytes; another run keeps the geometry of the drifts', () => {
    for (const k of [0, 1, 3]) {
      const a = generateSlab({ lifeSeed: SEED, runSeed: RUN, k, dugTo: 0 });
      const b = generateSlab({ lifeSeed: SEED, runSeed: RUN, k, dugTo: 0 });
      expect(fingerprintBytes(b.blocks)).toBe(fingerprintBytes(a.blocks));
      expect(b.nodes).toEqual(a.nodes);
    }
    // A new run (another run seed) re-rolls dressing and contents, never where the drifts and faces are.
    const p7 = placeNode(SEED, { i: 3 }, undefined, 7);
    const p8 = placeNode(SEED, { i: 3 }, undefined, 8);
    expect(p8.drift.slices).toEqual(p7.drift.slices);
    expect(p8.chamber.template).toBe(p7.chamber.template);
    expect(p8.chamber.exits[0].ride).toEqual(p7.chamber.exits[0].ride);
  });

  it('the camp’s quarry is open to the sky and its arrival walks into the first drift to the Dig pose', () => {
    const w = new DeepWorld({ lifeSeed: SEED, runSeed: RUN, worker: false });
    w.prime(-6, 0);
    const camp = w.camp();
    const nav = w.campNav()!;
    expect(nav).not.toBeNull();
    const a = { x: camp.arrival.pos.x, y: camp.floorY, z: camp.arrival.pos.z };
    // Open air from the quarry floor to the sky over the arrival.
    for (let y = camp.floorY + 0.25; y < 0; y += VOXEL) expect(w.ring.solidAtM(a.x, y, a.z), `y ${y}`).toBe(false);
    const dig = placeNode(SEED, { i: 0 }, undefined, RUN).drift.stand.pos;
    const path = nav.findPath(a, { x: dig.x, y: camp.floorY, z: dig.z });
    expect(path).not.toBeNull();
    for (const st of camp.stations) expect(nav.findPath(a, st.feet), st.id).not.toBeNull();
  });
});

describe('warm practicals in the light field', () => {
  /** The block at a world point in its freshly generated slab. */
  const blockAt = (q: { x: number; y: number; z: number }, opened: string[] = []) => {
    const j = vox(q.y);
    const k = Math.floor(-(j + 1) / SLAB_ROWS);
    const s = generateSlab({ lifeSeed: SEED, runSeed: RUN, k, dugTo: 0, opened });
    return s.blocks[slabIdx(vox(q.x), -SLAB_ROWS * k - 1 - j, vox(q.z))];
  };

  it('a burning lamp is an emitter in its slab; a cold lamp only once the run relit it', () => {
    const p = placeNode(SEED, { i: 2 }, undefined, RUN); // the Lamp Room: a lamp still burning, cold lamps to relight
    const burning = p.chamber.lights.find((l) => l.kind === 'lamp' && !l.cold)!;
    const cold = p.chamber.lights.find((l) => l.kind === 'lamp' && l.cold && l.socket)!;
    expect(burning).toBeDefined();
    expect(cold).toBeDefined();
    expect(blockAt(burning.pos)).toBe(B.LIGHT_LAMP);
    expect(blockAt(cold.pos)).toBe(B.AIR);
    expect(blockAt(cold.pos, [cold.socket!])).toBe(B.LIGHT_LAMP);
  });

  it('the world keeps a relit lamp baked when its slabs regenerate', () => {
    const w = new DeepWorld({ lifeSeed: SEED, runSeed: RUN, worker: false });
    const p = w.placement(2);
    const cold = p.chamber.lights.find((l) => l.kind === 'lamp' && l.cold && l.socket)!;
    w.prime(p.chamber.floorY, p.depthTop + p.K);
    w.bakeLamp(cold.socket!);
    expect(w.ring.get(vox(cold.pos.x), vox(cold.pos.y), vox(cold.pos.z))).toBe(B.LIGHT_LAMP);
    expect(w.openedIds()).toContain(cold.socket);
    w.prime(p.chamber.floorY, p.depthTop + p.K);
    expect(w.ring.get(vox(cold.pos.x), vox(cold.pos.y), vox(cold.pos.z))).toBe(B.LIGHT_LAMP);
  });
});
