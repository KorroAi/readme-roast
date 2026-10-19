import { Rng } from '../../core/rng';
import { BRIDGE_NEWEL, archCircle } from '../../world/gen/architecture';
import type { StructureSpec } from '../../world/gen/types';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type V3 } from './builder';
import { newel } from './parts';
import { STRIP_A } from './strips';

type Bridge = Extract<StructureSpec, { kind: 'bridge' }>;

/** Radial depth of the arch ring (voussoirs) and of its keystone (m). */
const RING = 1.0;
const KEY = 1.3;

/**
 * The bridge over the chasm: a segmental barrel arch springing from the chasm's walls (the
 * soffit of its voussoirs shows from below), the arch ring standing proud of the spandrel walls
 * with a taller keystone, a string course at the deck, slender parapets (0.55 m, a course of
 * stones) with saddleback coping, and newels at both ends. The walk between the parapets is the
 * voxel floor (it continues the processional way's slabs). Along z; x across.
 */
export function buildBridge(b: StructureBuilder, br: Bridge): void {
  const rng = new Rng(br.seed);
  const halfBody = (br.width + 2 * br.parapet) / 2;
  const xL = br.x - halfBody - 0.04;
  const xR = br.x + halfBody + 0.04;
  const deck = br.deck;
  const { zc, yc, r } = archCircle(br);
  const half = (br.zB - br.zA) / 2;
  const phi0 = Math.asin(Math.min(1, half / r));
  const nv = Math.max(9, Math.round((2 * phi0 * r) / 0.75) | 1);
  const at = (phi: number, rad: number): [number, number] => [zc + Math.sin(phi) * rad, yc + Math.cos(phi) * rad];
  b.aoAt = () => 1;

  // Soffit: the intrados face of each voussoir, across the whole width.
  for (let k = 0; k < nv; k++) {
    const p0 = -phi0 + (2 * phi0 * k) / nv;
    const p1 = -phi0 + (2 * phi0 * (k + 1)) / nv;
    const [za, ya] = at(p0, r);
    const [zb, yb] = at(p1, r);
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: 0, vRef: za };
    const pm = (p0 + p1) / 2;
    b.quadOut([xL, ya, za], [xR, ya, za], [xR, yb, zb], [xL, yb, zb], [0, -Math.cos(pm), -Math.sin(pm)], [0.8, 0.8, 0.8, 0.8]);
  }

  for (const side of [-1, 1]) {
    const xf = side < 0 ? xL : xR;
    const out: V3 = [side, 0, 0];
    // Spandrel wall: from the arch ring (or the rock at the abutments) up to the deck.
    b.surface = { mode: TexMode.World, layer: MAT.masonry, row: 0, axis: [0, 0, 1], across: [1, 0, 0], u0: 0, top: 0 };
    const steps = 48;
    for (let k = 0; k < steps; k++) {
      const za = br.z0 + ((br.z1 - br.z0) * k) / steps;
      const zb = br.z0 + ((br.z1 - br.z0) * (k + 1)) / steps;
      const lo = (z: number) => {
        const d = z - zc;
        if (Math.abs(d) >= half) return br.spring - 3;
        return yc + Math.sqrt(Math.max(0, (r + RING) ** 2 - d * d)) - 0.05;
      };
      b.quadOut([xf, lo(za), za], [xf, lo(zb), zb], [xf, deck, zb], [xf, deck, za], out);
    }
    // Arch ring: voussoirs standing 6 cm proud, V-jointed, the keystone taller and prouder.
    for (let k = 0; k < nv; k++) {
      const key = k === (nv - 1) / 2;
      const d = 0.006;
      const p0 = -phi0 + (2 * phi0 * k) / nv + d;
      const p1 = -phi0 + (2 * phi0 * (k + 1)) / nv - d;
      const ro = r + (key ? KEY : RING);
      const proud = key ? 0.11 : 0.06;
      const xo = xf + side * proud;
      const xi = xf - side * 0.2;
      const q = (phi: number, rad: number, x: number): V3 => {
        const [z, y] = at(phi, rad);
        return [x, y, z];
      };
      b.surface = { mode: TexMode.Monolith, layer: MAT.masonry, row: STRIP_A.metre, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: at((p0 + p1) / 2, ro)[1] };
      const ri = r + 0.012;
      b.quadOut(q(p0, ri, xo), q(p1, ri, xo), q(p1, ro, xo), q(p0, ro, xo), out);
      // Joint faces, extrados and intrados edges (short, back to the wall).
      b.quadOut(q(p0, ri, xo), q(p0, ro, xo), q(p0, ro, xi), q(p0, ri, xi), [0, Math.sin(p0), -Math.cos(p0)]);
      b.quadOut(q(p1, ri, xo), q(p1, ro, xo), q(p1, ro, xi), q(p1, ri, xi), [0, -Math.sin(p1), Math.cos(p1)]);
      b.quadOut(q(p0, ro, xo), q(p1, ro, xo), q(p1, ro, xi), q(p0, ro, xi), [0, Math.cos((p0 + p1) / 2), Math.sin((p0 + p1) / 2)]);
      b.quadOut(q(p0, ri, xo), q(p1, ri, xo), q(p1, ri, xi), q(p0, ri, xi), [0, -Math.cos((p0 + p1) / 2), -Math.sin((p0 + p1) / 2)]);
    }
    // String course under the deck edge.
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: deck - 0.95 };
    b.box(Math.min(xf + side * 0.15, xf - side * 0.1), deck - 1.3, br.z0 - 0.15, Math.max(xf + side * 0.15, xf - side * 0.1), deck - 0.95, br.z1 + 0.15, 0.03);
    // Ledge outside the parapet (the top of the bridge body).
    const xp0 = side < 0 ? br.x - br.width / 2 - 0.55 : br.x + br.width / 2;
    const xp1 = xp0 + 0.55;
    const ledgeA = side < 0 ? xf : xp1;
    const ledgeB = side < 0 ? xp0 : xf;
    b.surface = { mode: TexMode.Stone, layer: MAT.floorSlab, row: STRIP_A.half, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: deck, vRef: ledgeA };
    b.quadOut([ledgeA, deck + 0.01, br.z0], [ledgeB, deck + 0.01, br.z0], [ledgeB, deck + 0.01, br.z1], [ledgeA, deck + 0.01, br.z1], [0, 1, 0]);
    // Parapet: one course of stones on the deck, between the newels.
    const zp0 = br.z0 + 0.95;
    const zp1 = br.z1 - 0.95;
    b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.metre, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: deck + 0.95, vRef: xp0 };
    b.box(xp0, deck - 0.08, zp0, xp1, deck + 0.95, zp1, 0.025, 8);
    // Saddleback coping, stone by stone.
    const mid = (xp0 + xp1) / 2;
    let z = zp0;
    while (z < zp1 - 0.05) {
      const len = Math.min(zp1 - z, rng.range(1.25, 1.95));
      b.push();
      b.translate(0, 0, z);
      b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 1023), top: deck + 1.2, vRef: xp0 };
      b.prism([[xp0 - 0.05, deck + 0.95], [xp1 + 0.05, deck + 0.95], [xp1 + 0.05, deck + 1.03], [mid, deck + 1.18], [xp0 - 0.05, deck + 1.03]], 0.012, len - 0.012);
      b.pop();
      z += len;
    }
    // Newels at both ends, and the lamp's pedestal at mid-span on the west parapet.
    for (const zn of side < 0 ? [br.z0, br.mid, br.z1 - 1] : [br.z0, br.z1 - 1]) newel(b, rng, (xp0 + xp1) / 2 + side * 0.06, zn + 0.5, 0.36, 0.36, deck, BRIDGE_NEWEL, zn === br.mid);
  }
}
