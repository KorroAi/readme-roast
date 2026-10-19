import { MAT_SIZE, MatCanvas, PeriodicCells, Rng, crackPath, fbm, hash2, mixHex, ramp, wrap, wrapDelta, type Pt } from './paint';
import { DEEP_SIDE, DEEP_TOP, STONE_SIDE, STONE_TOP, hostFloor, hostRock } from './rock';
import { resolve } from './paint';
import * as P from './palette';

/**
 * Mineral deposits, painted *into* the host rock: the copper and iron layers start from the
 * exact rock of the slate / deep slate beside them (same structure, same random stream), so
 * where an ore block meets plain rock the wall continues and only the vein ends, pushing a
 * little past the voxel edge (metal is "tall" in the height channel).
 *
 *   copper: branching veins along fractures, seams in the bedding partings and a stockwork of
 *           veinlets, oxidised dark metal with a warm lit edge, a few glints, and a grey-green
 *           verdigris crust that bleeds downward;
 *   iron:   banded ore following the strata: steel-grey metallic bands alternating with red
 *           jasper, pinching and swelling, with ochre rust staining running down the wall.
 *
 * Both are dense enough that any 1 m face of an ore block shows its ore (see the coverage
 * numbers in the material sheet tool), because the player mines them by sight.
 */

const S = MAT_SIZE;
const TAU = Math.PI * 2;

/** Rasterized vein mask: 0 = rock, otherwise 1. Stamps a small brush along each path. */
class VeinMask {
  readonly m = new Uint8Array(S * S);
  stamp(x: number, y: number, r: number): void {
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r * r + 0.25) this.m[wrap(x + dx) + wrap(y + dy) * S] = 1;
  }
  draw(pts: Pt[], width: (t: number) => number): void {
    pts.forEach(([x, y], k) => this.stamp(x, y, width(k / Math.max(1, pts.length - 1))));
  }
  at(x: number, y: number): number {
    return this.m[wrap(x) + wrap(y) * S];
  }
  coverage(): number {
    let n = 0;
    for (let i = 0; i < S * S; i++) n += this.m[i];
    return n / (S * S);
  }
}

/**
 * Guarantee that every 1 m window (16 x 16 texels, any position on a 4-texel step) shows at
 * least `min` ore texels: the player mines ore by sight, and an ore block is 1 m wide.
 */
function ensureCoverage(mask: VeinMask, rng: Rng, min: number, add: (x: number, y: number) => void): void {
  for (let pass = 0; pass < 3; pass++)
    for (let wy = 0; wy < S; wy += 4)
      for (let wx = 0; wx < S; wx += 4) {
        let n = 0;
        for (let y = 0; y < 16 && n < min; y++) for (let x = 0; x < 16; x++) n += mask.m[wrap(wx + x) + wrap(wy + y) * S];
        if (n < min) add(wx + 4 + rng.int(0, 8), wy + 4 + rng.int(0, 8));
      }
}

/** A dendritic vein: a long path with a few short branches. */
function branchingVein(mask: VeinMask, rng: Rng, x: number, y: number, ang: number, len: number, w: number): void {
  const pts = crackPath(rng, x, y, ang, len, 0.22, 0.06);
  // Pinch and swell along the path.
  const phase = rng.next() * TAU;
  mask.draw(pts, (t) => Math.max(0, w * (0.55 + 0.45 * Math.sin(t * TAU * 2 + phase))));
  const branches = rng.int(1, 3);
  for (let b = 0; b < branches; b++) {
    const [bx, by] = pts[rng.int(0, pts.length - 1)];
    const bp = crackPath(rng, bx, by, ang + (rng.chance(0.5) ? 1 : -1) * (0.5 + rng.next() * 0.6), rng.int(8, 26), 0.25, 0.08);
    mask.draw(bp, (t) => (t < 0.6 ? w * 0.5 : 0));
  }
}

/**
 * Colour the vein texels: mostly dark oxidised ore, a lit upper-left edge, and metal "beads"
 * where the fresh ore shows (2-3 texel nuggets, lit, with a rare glint). The bright colour is
 * a small share of the vein, so the deposit reads as ore in rock rather than painted lines.
 */
function paintVein(c: MatCanvas, rng: Rng, mask: VeinMask, pal: readonly number[], glint: number, glintShare: number, height: number, minor?: VeinMask): void {
  const n = fbm(rng, 16, 2);
  const bead = fbm(rng, 32, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!mask.at(x, y)) continue;
      const topOpen = !mask.at(x, y - 1) || !mask.at(x - 1, y);
      const botOpen = !mask.at(x, y + 1) || !mask.at(x + 1, y);
      // The stockwork between the main veins is oxidised: dark ore, no fresh metal, so there
      // is no glitter between veins.
      const isMinor = minor?.at(x, y) === 1;
      const b = isMinor ? 0 : bead(x, y);
      let v = (isMinor ? 0.16 : 0.33) + (n(x, y) - 0.5) * 0.24;
      if (topOpen && !botOpen) v += isMinor ? 0.08 : 0.16;
      else if (botOpen && !topOpen) v -= 0.08;
      if (b > 0.54) v += 0.28 + (b - 0.54) * 1.1 + (topOpen ? 0.1 : 0);
      let hex = ramp(pal, Math.max(0, Math.min(0.99, v)), x, y, 0);
      if (b > 0.68 && topOpen && hash2(x * 3, y * 5) < glintShare) hex = glint;
      c.set(x, y, hex, height + n(x, y) * 30);
    }
}

/** A crust (verdigris, rust) on the rock around a vein, patchy, bleeding downward on walls. */
function crust(c: MatCanvas, rng: Rng, mask: VeinMask, pal: readonly number[], amount: number, drip: number): void {
  const patch = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (mask.at(x, y)) continue;
      // distance to the vein within 2 texels
      let near = 0;
      for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) if (mask.at(x + dx, y + dy)) near = Math.abs(dx) + Math.abs(dy) <= 2 ? 1 : 0.5;
      const p = patch(x, y);
      if (near && p > 1 - amount) c.set(x, y, mixHex(c.getHex(x, y), pal[p > 1 - amount * 0.4 ? 2 : 1], near > 0.5 ? 0.6 : 0.35), Math.max(c.height(x, y), 185));
    }
  if (drip <= 0) return;
  for (let i = 0; i < S * S; i++) {
    if (!mask.m[i]) continue;
    const x = i % S;
    const y = Math.floor(i / S);
    if (mask.at(x, y + 1) || patch(x, y) < 1 - amount || !rng.chance(drip)) continue;
    const len = rng.int(3, 9);
    for (let k = 1; k <= len; k++) c.tint(x, y + k, pal[1], 0.5 * (1 - k / (len + 1)));
  }
}

export function copperVein(c: MatCanvas, rng: Rng): void {
  const host = hostRock('stoneSide');
  resolve(c, host.f, P.STONE, STONE_SIDE.crack);
  const mask = new VeinMask();
  // Main veins ride the host's own fractures, widened.
  for (const fr of host.fractures) mask.draw(fr, (t) => 0.8 + Math.sin(t * Math.PI) * 0.7);
  // Further branching veins, steep (they cut across the beds).
  for (let k = 0; k < 5; k++) branchingVein(mask, rng, rng.next() * S, rng.next() * S, (rng.chance(0.5) ? 1 : -1) * (0.9 + rng.next() * 0.5), rng.int(40, 90), 1.15);
  // Seams along some bedding partings.
  const seamBeds = host.thick.map(() => rng.chance(0.45));
  const seamN = fbm(rng, 8, 1);
  for (let i = 0; i < S * S; i++) {
    const dy = host.bedY[i] - host.bedStart[host.bed[i]];
    if (host.f.code[i] === 1 && dy < 1.2 && seamBeds[host.bed[i]] && seamN(i % S, Math.floor(i / S)) > 0.5) mask.m[i] = 1;
  }
  // Crust only around the main veins; the stockwork between them stays dark and thin.
  const main = new VeinMask();
  main.m.set(mask.m);
  const minor = new VeinMask();
  const veinlet = (m: VeinMask, x: number, y: number) => m.draw(crackPath(rng, x, y, rng.next() * TAU, rng.int(4, 9), 0.5, 0.15), () => 0);
  for (let k = 0; k < 30; k++) veinlet(minor, rng.next() * S, rng.next() * S);
  for (let i = 0; i < S * S; i++) if (minor.m[i]) mask.m[i] = 1;
  ensureCoverage(mask, rng, 9, (x, y) => {
    for (let k = 0; k < 2; k++) {
      const px = x + rng.int(-2, 2);
      const py = y + rng.int(-2, 2);
      const pts = crackPath(rng, px, py, rng.next() * TAU, rng.int(4, 8), 0.5, 0.15);
      mask.draw(pts, () => 0);
      minor.draw(pts, () => 0);
    }
  });
  paintVein(c, rng, mask, P.COPPER, P.COPPER_GLINT, 0.1, 215, minor);
  crust(c, rng, main, P.VERDIGRIS, 0.5, 0.14);
}

export function copperTop(c: MatCanvas, rng: Rng): void {
  const host = hostFloor('stoneTop');
  resolve(c, host.f, P.STONE, STONE_TOP.crack);
  const mask = new VeinMask();
  // Copper fills some of the floor's own cracks, then a few veins and scattered blebs.
  const fill = fbm(rng, 8, 1);
  for (let i = 0; i < S * S; i++) if (host.f.code[i] === 1 && fill(i % S, Math.floor(i / S)) > 0.35) mask.m[i] = 1;
  for (let k = 0; k < 5; k++) branchingVein(mask, rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(30, 70), 1.1);
  // Crust only around the main veins; the stockwork between them stays dark and thin.
  const main = new VeinMask();
  main.m.set(mask.m);
  const minor = new VeinMask();
  const veinlet = (m: VeinMask, x: number, y: number) => m.draw(crackPath(rng, x, y, rng.next() * TAU, rng.int(4, 9), 0.5, 0.15), () => 0);
  for (let k = 0; k < 30; k++) veinlet(minor, rng.next() * S, rng.next() * S);
  for (let i = 0; i < S * S; i++) if (minor.m[i]) mask.m[i] = 1;
  ensureCoverage(mask, rng, 9, (x, y) => {
    for (let k = 0; k < 2; k++) {
      const px = x + rng.int(-2, 2);
      const py = y + rng.int(-2, 2);
      const pts = crackPath(rng, px, py, rng.next() * TAU, rng.int(4, 8), 0.5, 0.15);
      mask.draw(pts, () => 0);
      minor.draw(pts, () => 0);
    }
  });
  paintVein(c, rng, mask, P.COPPER, P.COPPER_GLINT, 0.1, 215, minor);
  crust(c, rng, main, P.VERDIGRIS, 0.5, 0);
}

/**
 * Banded iron along the strata: groups of 2-4 thin metallic bands with red jasper between,
 * pinching and swelling, separated by plain rock, with ochre rust staining running down.
 */
export function ironVein(c: MatCanvas, rng: Rng): void {
  const host = hostRock('deepSide');
  resolve(c, host.f, P.DEEP, DEEP_SIDE.crack);
  const swell = fbm(rng, 4, 2);
  const grain = fbm(rng, 32, 1);
  // Band set in strata coordinates (centre, half-thickness, kind), filling the period.
  const bands: Array<{ y: number; t: number; metal: boolean; phase: number }> = [];
  let y = rng.next() * 4;
  while (y < S - 6) {
    const n = rng.int(2, 4);
    for (let k = 0; k < n && y < S - 4; k++) {
      bands.push({ y, t: 0.9 + rng.next() * 1.1, metal: true, phase: rng.next() * S });
      y += rng.int(3, 5);
      if (k < n - 1) bands.push({ y: y - 1.6, t: 0.7, metal: false, phase: rng.next() * S });
    }
    y += rng.int(7, 12);
  }
  // Nearest band per strata row (bands are sparse; this avoids testing them all per texel).
  const nearest = new Int16Array(S).fill(-1);
  for (let r = 0; r < S; r++) {
    let best = -1;
    let bd = 3.5;
    bands.forEach((b, k) => {
      const d = Math.abs(wrapDelta(b.y, r + 0.5));
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    nearest[r] = best;
  }
  const mask = new VeinMask();
  for (let i = 0; i < S * S; i++) {
    if (host.f.code[i] === 1) continue; // joints and partings cut the bands
    const x = i % S;
    const py = Math.floor(i / S);
    const yy = host.bedY[i];
    const row = Math.floor(yy);
    for (const r of [row, wrap(row + 1), wrap(row - 1)]) {
      const k = nearest[r];
      if (k < 0) continue;
      const b = bands[k];
      const sw = swell(x + b.phase, b.y * 4);
      const half = b.t * (0.15 + sw * 1.5);
      const dd = wrapDelta(b.y, yy);
      if (Math.abs(dd) > half) continue;
      if (b.metal) {
        mask.m[i] = 1;
        const lit = dd < -half + 0.9;
        const v = 0.36 + (grain(x, py) - 0.5) * 0.34 + (lit ? 0.1 : 0) - (dd > half - 0.7 && !lit ? 0.1 : 0);
        c.set(x, py, lit && hash2(x * 7, py * 3) < 0.012 ? P.IRON_GLINT : ramp(P.IRON, Math.min(0.99, v), x, py, 0), 220 + sw * 30);
      } else if (sw > 0.4) {
        mask.m[i] = 1;
        c.set(x, py, mixHex(ramp(P.JASPER, 0.3 + (grain(x, py) - 0.5) * 0.4 + sw * 0.2, x, py, 0), c.getHex(x, py), 0.3), 200);
      }
      break;
    }
  }
  // Rust: ochre stains running down from the metal bands, patchy.
  const patch = fbm(rng, 6, 2);
  for (let i = 0; i < S * S; i++) {
    if (!mask.m[i]) continue;
    const x = i % S;
    const py = Math.floor(i / S);
    if (mask.at(x, py + 1) || patch(x, py) < 0.5) continue;
    // A diffuse stain below the band, and now and then a longer run.
    const len = rng.chance(0.12) ? rng.int(5, 10) : rng.int(1, 3);
    for (let k = 1; k <= len; k++) c.tint(x, py + k, P.RUST, 0.4 * (1 - k / (len + 1)) * Math.min(1, (patch(x, py) - 0.5) * 4));
  }
}

/** Iron seen on a floor: the same banded ore cut obliquely, in patches, with rust halos. */
export function ironTop(c: MatCanvas, rng: Rng): void {
  const host = hostFloor('deepTop');
  resolve(c, host.f, P.DEEP, DEEP_TOP.crack);
  const warpN = fbm(rng, 4, 2);
  const grain = fbm(rng, 32, 1);
  const lens = fbm(rng, 4, 2);
  const mask = new VeinMask();
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (host.f.code[x + y * S] === 1) continue;
      // Oblique bands (integer frequencies keep them periodic), gently warped, in patches.
      const s = (x * 2 + y) / S + (warpN(x, y) - 0.5) * 0.8;
      const t = (((s * 4) % 1) + 1) % 1;
      const l = lens(x, y);
      if (l < 0.4) continue;
      const w = 0.12 + (l - 0.4) * 0.6;
      if (t < w) {
        mask.m[x + y * S] = 1;
        const lit = t < 0.035;
        c.set(x, y, lit && hash2(x * 5, y * 9) < 0.03 ? P.IRON_GLINT : ramp(P.IRON, 0.34 + (grain(x, y) - 0.5) * 0.34 + (lit ? 0.1 : 0), x, y, 0), 220);
      } else if (t > 0.45 && t < 0.45 + w * 0.6) {
        mask.m[x + y * S] = 1;
        c.set(x, y, mixHex(ramp(P.JASPER, 0.3 + grain(x, y) * 0.4, x, y, 0), c.getHex(x, y), 0.3), 195);
      }
    }
  ensureCoverage(mask, rng, 9, (x, y) => {
    const pts = crackPath(rng, x, y, 0.32, rng.int(5, 9), 0.1, 0);
    for (const [px, py] of pts) {
      mask.m[wrap(px) + wrap(py) * S] = 1;
      c.set(px, py, ramp(P.IRON, 0.36 + (grain(px, py) - 0.5) * 0.3, px, py, 0), 220);
    }
  });
  crust(c, rng, mask, [P.RUST, P.RUST, mixHex(P.RUST, P.DEEP[3], 0.4)], 0.3, 0);
}

/**
 * Crystal: dark teal glass in long prismatic facets with growth zoning. The light is inside:
 * a low, slow internal glow deep in the facets (emissive alpha), and bright glints on only a
 * few lit facet edges, so a crystal reads as a faceted object, never as a lit cube.
 */
export function crystal(c: MatCanvas, rng: Rng): void {
  const facets = new PeriodicCells(rng, 8, 4, 0.9);
  const glowN = fbm(rng, 4, 2);
  const glintN = fbm(rng, 16, 1);
  const n = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = facets.query(x, y, 1, 0.2);
      const cell = facets.cells[q.id];
      const e = q.d2 - q.d1;
      const dx = wrapDelta(cell.x, x) / 16;
      const dy = wrapDelta(cell.y, y) / 32;
      const facesLight = cell.r > 0.45;
      let v = 0.3 + (cell.r - 0.5) * 0.3 - ((cell.r2 - 0.5) * dx + (cell.r3 - 0.3) * dy) * 0.35 + (n(x, y) - 0.5) * 0.1;
      // Growth zoning: faint lines parallel to the facet border.
      if (e > 3 && Math.floor(e) % 5 === 2) v += 0.06;
      let alpha = 0;
      if (e < 1) v = facesLight ? 0.64 : 0.08;
      else {
        // Internal glow: strongest deep inside a facet, in slow broad patches.
        const depth = Math.min(1, (e - 1) / 7);
        const g = Math.max(0, glowN(x, y) - 0.52) * 2.4 * depth;
        alpha = Math.min(150, g * 170);
      }
      let hex = ramp(P.CRYSTAL, Math.max(0, Math.min(0.99, v)), x, y, 0);
      if (alpha > 0) hex = mixHex(hex, P.CRYSTAL_GLOW, Math.min(0.75, alpha / 200));
      if (e < 1 && facesLight && glintN(x, y) > 0.78) {
        hex = P.CRYSTAL_EDGE;
        alpha = 230;
      }
      c.set(x, y, hex, alpha);
    }
}
