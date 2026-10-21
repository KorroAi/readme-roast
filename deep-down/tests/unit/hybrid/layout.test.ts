// U-W2 (SPEC §13.1): placeNode's volumes never overlap, stay inside the ring, every stand's view to 20 m shows only its
// own node's spaces, and every ride stays in open air (no camera clips rock on a Way Down). Roads are W2: the test
// names the fallback the layout keeps room for (the shared-node road).
import { describe, expect, it } from 'vitest';
import { DeepWorld } from '../../../src/world/hybrid/DeepWorld';
import { HEADINGS, nodeFrame, planOverlap, placeNode, ROAD_FALLBACK, roadBay } from '../../../src/world/hybrid/layout';
import type { Box3, V3 } from '../../../src/world/hybrid/grid';

const SEED = 12345;
const RUN = 7;
const W1_NODES = 18;

const inside = (p: V3, b: Box3, pad = 0) => p.x >= b.min.x - pad && p.x <= b.max.x + pad && p.y >= b.min.y - pad && p.y <= b.max.y + pad && p.z >= b.min.z - pad && p.z <= b.max.z + pad;
const overlap3 = (a: Box3, b: Box3) => planOverlap(a, b, 0) && a.min.y < b.max.y && b.min.y < a.max.y;

describe('layout (U-W2)', () => {
  it('no two nodes’ volumes overlap (the only contacts are a node and the next one, through its Way Down)', () => {
    for (let i = 0; i < W1_NODES + 6; i++)
      for (let j = i + 2; j < W1_NODES + 6; j++)
        for (const a of nodeFrame(SEED, i).volumes) for (const b of nodeFrame(SEED, j).volumes) expect(overlap3(a, b), `nodes ${i} and ${j}`).toBe(false);
  });

  it('consecutive chambers never share space, except the Threshold under the Lift Bottom’s hatch', () => {
    for (let i = 0; i < W1_NODES; i++) {
      const a = placeNode(SEED, { i }, undefined, RUN).chamber;
      const b = placeNode(SEED, { i: i + 1 }, undefined, RUN).chamber;
      const nb = nodeFrame(SEED, i + 1);
      if (nb.fromAbove) continue;
      const shrink = (x: Box3): Box3 => ({ min: { x: x.min.x + 0.5, y: x.min.y + 0.5, z: x.min.z + 0.5 }, max: { x: x.max.x - 0.5, y: x.max.y - 0.5, z: x.max.z - 0.5 } });
      expect(overlap3(shrink(a.box), shrink(b.box)), `chambers ${i} and ${i + 1}`).toBe(false);
    }
  });

  it('every chamber, drift and ride point lies inside the ring’s 64 × 64 footprint', () => {
    for (let i = 0; i < W1_NODES; i++) {
      const p = placeNode(SEED, { i }, undefined, RUN);
      for (const v of [p.chamber.box, p.drift.stub, ...p.drift.slices, ...p.chamber.volumes]) {
        expect(v.min.x).toBeGreaterThanOrEqual(0);
        expect(v.min.z).toBeGreaterThanOrEqual(0);
        expect(v.max.x).toBeLessThanOrEqual(64);
        expect(v.max.z).toBeLessThanOrEqual(64);
      }
      for (const q of p.chamber.exits[0].ride) expect(q.x > 0 && q.x < 64 && q.z > 0 && q.z < 64).toBe(true);
    }
  });

  it('the trunk turns right at every chamber, drifts run along the sides, the Way Down drops 3.5–14 m', () => {
    for (let i = 1; i < W1_NODES; i++) {
      const a = nodeFrame(SEED, i - 1);
      const b = nodeFrame(SEED, i);
      if (b.fromAbove) {
        expect(b.corner).toBe(a.corner);
        continue;
      }
      expect(b.dir).toEqual(HEADINGS[(a.corner + 1) & 3]);
      expect(a.drop).toBeGreaterThanOrEqual(3.5);
      expect(a.drop).toBeLessThanOrEqual(14);
    }
  });

  it(`names the W2 road fallback (${'sharedNode'}): every Glowroot chamber has a free bay for a second exit`, () => {
    expect(ROAD_FALLBACK).toBe('sharedNode');
    for (let i = 7; i < W1_NODES - 1; i++) {
      const bay = roadBay(SEED, i);
      for (let j = 0; j < W1_NODES + 4; j++) {
        if (Math.abs(j - i) <= 1) continue;
        for (const v of nodeFrame(SEED, j).volumes) expect(overlap3(bay, v), `bay of ${i} vs ${j}`).toBe(false);
      }
    }
  });
});

describe('layout against the voxels (U-W2)', () => {
  const world = new DeepWorld({ lifeSeed: SEED, runSeed: RUN, worker: false });
  const windows = [
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13],
    [14, 15, 16, 17],
  ];
  for (const nodes of windows)
    it(`nodes ${nodes[0]}–${nodes[nodes.length - 1]}: stand views see only their own node to 20 m; rides stay in open air`, () => {
      const last = nodes[nodes.length - 1];
      world.prime(world.placement(nodes[0]).chamber.floorY + 4, world.placement(last + 1).depthTop + world.placement(last + 1).K);
      for (const i of nodes) {
        const p = world.placement(i);
        const own: Box3[] = [p.chamber.box, ...p.chamber.volumes, p.drift.stub, ...p.drift.slices];
        if (i > 0) own.push(...world.placement(i - 1).chamber.volumes, world.placement(i - 1).chamber.box);
        const nx = world.placement(i + 1);
        own.push(nx.drift.stub, ...nx.drift.slices, nx.chamber.box);
        const mine = (q: V3) => own.some((b) => inside(q, b, 1.0)) || q.y >= 0;
        for (const st of p.chamber.stands) {
          if (!world.ready(st.pos.y - 3) || !world.ready(st.pos.y + 3)) continue;
          let foreign = 0;
          for (let a = -0.42; a <= 0.42; a += 0.12)
            for (let b = -0.75; b <= 0.75; b += 0.15) {
              const yaw = st.yaw + a;
              const pitch = st.pitch + b;
              const d = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
              for (let t = 0.5; t <= 20; t += 0.25) {
                const q = { x: st.pos.x + d.x * t, y: st.pos.y + d.y * t, z: st.pos.z + d.z * t };
                if (world.ring.solidAtM(q.x, q.y, q.z)) break;
                if (!mine(q)) {
                  foreign++;
                  break;
                }
              }
            }
          expect(foreign, `node ${i} ${p.chamber.template} stand ${st.id}: rays into foreign space`).toBe(0);
        }
        const ex = p.chamber.exits[0];
        if (ex.type === 'closed' || !world.ready(ex.ride[ex.ride.length - 1].y)) continue;
        for (const q of ex.ride) {
          expect(world.ring.solidAtM(q.x, q.y, q.z), `node ${i} ride point in rock`).toBe(false);
          expect(world.ring.solidAtM(q.x, q.y + 0.35, q.z), `node ${i} ride head in rock`).toBe(false);
        }
      }
    }, 180_000);
});
