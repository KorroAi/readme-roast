import { Rng } from '../../core/rng';
import type { StructureSpec } from '../../world/gen/types';
import { MAT } from '../materials';
import { StructureBuilder, TexMode, norm, type V3 } from './builder';

type Beam = Extract<StructureSpec, { kind: 'beam' }>;
type Deck = Extract<StructureSpec, { kind: 'deck' }>;

/**
 * A squared timber (post, crossbeam, brace) from a to b: adzed arrises, grain along its length
 * (beamSide), end grain at its ends (beamEnd), a splintered end where it snapped.
 */
export function buildBeam(b: StructureBuilder, t: Beam): void {
  const rng = new Rng(t.seed);
  const d: V3 = [t.b[0] - t.a[0], t.b[1] - t.a[1], t.b[2] - t.a[2]];
  const len = Math.hypot(d[0], d[1], d[2]);
  const X = norm(d);
  // Up side of the section: world up projected off the axis (posts: world x).
  const ref: V3 = Math.abs(X[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const k = ref[0] * X[0] + ref[1] * X[1] + ref[2] * X[2];
  let Y = norm([ref[0] - k * X[0], ref[1] - k * X[1], ref[2] - k * X[2]]);
  let Z: V3 = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  if (t.roll) {
    const c = Math.cos(t.roll);
    const s = Math.sin(t.roll);
    const y2: V3 = [Y[0] * c + Z[0] * s, Y[1] * c + Z[1] * s, Y[2] * c + Z[2] * s];
    Z = [Z[0] * c - Y[0] * s, Z[1] * c - Y[1] * s, Z[2] * c - Y[2] * s];
    Y = y2;
  }
  b.aoAt = b.contactAo();
  b.stone(1, 1, t.seed, 0.82);
  b.push();
  b.basis(t.a, X, Y, Z);
  const hy = t.h / 2;
  const hz = t.w / 2;
  const sA = t.splinter === 1 ? 0.18 : 0;
  const sB = t.splinter === 2 ? 0.18 : 0;
  b.surface = { mode: TexMode.Plain, layer: MAT.beamSide, row: 0, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 127), top: 0, grainAlongV: true };
  // Sides only: the ends are end grain (or splinters).
  b.box(sA, -hy, -hz, len - sB, hy, hz, Math.min(0.03, t.w * 0.1), 1 | 2);
  b.surface = { mode: TexMode.Plain, layer: MAT.beamEnd, row: 0, axis: [0, 0, 1], across: [0, 1, 0], u0: rng.int(0, 127), top: 0, vRef: 0 };
  for (const end of [0, 1]) {
    const x = end === 0 ? sA : len - sB;
    const out = end === 0 ? -1 : 1;
    const splinter = end === 0 ? sA > 0 : sB > 0;
    if (!splinter) {
      b.quadOut([x, -hy, -hz], [x, -hy, hz], [x, hy, hz], [x, hy, -hz], [out, 0, 0]);
      continue;
    }
    // Torn fibres: a fan of slivers of different lengths over the broken section.
    const ring: V3[] = [];
    const n = 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const m = 1 / Math.max(Math.abs(c), Math.abs(s));
      ring.push([x, c * m * hy, s * m * hz]);
    }
    const tips: V3[] = ring.map((p, i) => [x + out * rng.range(0.02, 0.2) * (i % 2 ? 1 : 0.4), p[1] * 0.45, p[2] * 0.45]);
    const centre: V3 = [x + out * rng.range(0.05, 0.12), 0, 0];
    b.surface = { ...b.surface, layer: MAT.beamSide, grainAlongV: false };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      b.quadOut(ring[i], ring[j], tips[j], tips[i], [out, 0, 0]);
      const tri = [tips[i], tips[j], centre];
      const nrm = triNormal(tri);
      if (nrm[0] * out >= 0) b.poly(tri);
      else b.poly([tri[0], tri[2], tri[1]]);
    }
  }
  b.pop();
}

/**
 * A plank deck: boards (0.18-0.28 m, ragged ends, small gaps) on joists, its surface `y` a few cm
 * over the voxel floor it covers (the explorer walks the floor; the feet sink at most the deck's
 * height).
 */
export function buildDeck(b: StructureBuilder, k: Deck): void {
  const rng = new Rng(k.seed);
  const alongX = k.along === 'x';
  // Local frame: x along the boards, z across them.
  const L0 = alongX ? k.x0 : k.z0;
  const L1 = alongX ? k.x1 : k.z1;
  const C0 = alongX ? k.z0 : -k.x1;
  const C1 = alongX ? k.z1 : -k.x0;
  b.aoAt = b.contactAo();
  b.push();
  // Boards along z: local x = world z, local z = -world x (a proper rotation).
  if (!alongX) b.basis([0, 0, 0], [0, 0, 1], [0, 1, 0], [-1, 0, 0]);
  const top = k.y;
  const th = 0.045;
  // Joists under the boards, across them, near both ends and every ~1.4 m.
  b.surface = { mode: TexMode.Plain, layer: MAT.beamSide, row: 0, axis: [0, 0, 1], across: [1, 0, 0], u0: rng.int(0, 127), top: 0, grainAlongV: true };
  const nj = Math.max(2, Math.round((L1 - L0) / 1.4) + 1);
  for (let j = 0; j < nj; j++) {
    const x = L0 + 0.25 + ((L1 - L0 - 0.5) * j) / (nj - 1);
    b.box(x - 0.09, top - th - 0.13, C0 - 0.06, x + 0.09, top - th, C1 + 0.06, 0.012, 8);
  }
  // Boards.
  let c = C0;
  while (c < C1 - 0.05) {
    const w = Math.min(C1 - c, rng.range(0.18, 0.28));
    const gap = 0.012;
    // A board may be two lengths butted on a joist.
    const cut = rng.chance(0.45) ? L0 + 0.25 + ((L1 - L0 - 0.5) * rng.int(1, nj - 2)) / (nj - 1) : null;
    const pieces: Array<[number, number]> = cut ? [[L0 - rng.range(0, 0.12), cut - 0.006], [cut + 0.006, L1 + rng.range(0, 0.12)]] : [[L0 - rng.range(0, 0.12), L1 + rng.range(0, 0.12)]];
    for (const [a, e] of pieces) {
      const sag = rng.range(-0.008, 0.006);
      b.stone(Math.round(c * 50), Math.round(a * 8), k.seed, 0.78);
      b.surface = { mode: TexMode.Plain, layer: MAT.beamSide, row: 0, axis: [1, 0, 0], across: [0, 0, 1], u0: rng.int(0, 127), top: 0, grainAlongV: true };
      b.box(a, top - th + sag, c + gap / 2, e, top + sag, c + w - gap / 2, 0, 8);
    }
    c += w;
  }
  b.pop();
}

function triNormal(p: V3[]): V3 {
  const u: V3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const v: V3 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
