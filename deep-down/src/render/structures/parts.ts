import type { Rng } from '../../core/rng';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, type V3 } from './builder';
import { STRIP_A } from './strips';

/**
 * A newel post, centred on (cx, cz) in the builder's frame with half-sizes hx, hz, standing on
 * y0 and `h` metres tall to the apex of its cap: a moulded base, a monolithic shaft, a cap stone
 * overhanging it with a low pyramidal top (`flat`: a flat one, for a lamp; arrises chamfered).
 */
export function newel(b: StructureBuilder, rng: Rng, cx: number, cz: number, hx: number, hz: number, y0: number, h: number, flat = false): void {
  const capH = 0.24;
  const pyr = flat ? 0 : 0.2;
  const yShaft = y0 + 0.28;
  const yCap = y0 + h - pyr - capH;
  b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: yShaft, vRef: cz - hz - 0.12 };
  b.box(cx - hx - 0.12, y0 - 0.3, cz - hz - 0.12, cx + hx + 0.12, yShaft, cz + hz + 0.12, 0.05, 8);
  b.surface = { mode: TexMode.Monolith, layer: MAT.masonry, row: STRIP_A.two, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: yCap };
  b.box(cx - hx, yShaft - 0.02, cz - hz, cx + hx, yCap + 0.01, cz + hz, 0.04, 8);
  // A thin band under the cap.
  b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: yCap, vRef: cz - hz - 0.05 };
  b.box(cx - hx - 0.05, yCap - 0.1, cz - hz - 0.05, cx + hx + 0.05, yCap, cz + hz + 0.05, 0.02);
  b.surface = { mode: TexMode.Stone, layer: MAT.masonry, row: STRIP_A.half, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 1023), top: yCap + capH, vRef: cz - hz - 0.14 };
  b.box(cx - hx - 0.14, yCap, cz - hz - 0.14, cx + hx + 0.14, yCap + capH, cz + hz + 0.14, 0.04, 8);
  if (!flat) pyramid(b, cx - hx - 0.1, cz - hz - 0.1, cx + hx + 0.1, cz + hz + 0.1, yCap + capH, yCap + capH + pyr);
}

/** A low four-sided pyramid from the rectangle x0..x1, z0..z1 at y0 to an apex at y1. */
export function pyramid(b: StructureBuilder, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void {
  const c: V3 = [(x0 + x1) / 2, y1, (z0 + z1) / 2];
  const p: V3[] = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
  for (let i = 0; i < 4; i++) {
    const a = p[i];
    const d = p[(i + 1) % 4];
    const out: V3 = [(a[0] + d[0]) / 2 - c[0], 0.5, (a[2] + d[2]) / 2 - c[2]];
    b.quadOut(a, d, c, c, out);
  }
}
