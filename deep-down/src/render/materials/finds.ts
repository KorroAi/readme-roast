import { MAT_SIZE, MatCanvas, PeriodicCells, Rng, crackCurve, fbm, mixHex, ramp, wrap, wrapDelta } from './paint';
import { crystal } from './minerals';
import * as P from './palette';

/**
 * Round 2 (only interesting things are minable): the finds that replace free digging, each with a
 * look of its own so a player reads it as "something to take" before the highlight says so.
 *
 *   rubble: a heap of loose broken stone, paler and chunkier than the living rock around it, every
 *           stone a lit facet over a dark gap (the source of stone for recipes);
 *   roots:  root tangles over dark soil, twisted strands with a lit upper edge and a shadow under
 *           them, fine rootlets between (the source of fibre);
 *   gemOre: a gem pocket, violet crystal points crowded in a dark host rock with a slow inner glow
 *           (epic; the shader gives it a violet sheen).
 */

const S = MAT_SIZE;

const RUBBLE_PALS = [P.STONE, P.WEATHERED, P.PEBBLE, P.STONE] as const;

export function rubble(c: MatCanvas, rng: Rng): void {
  const matrix = fbm(rng, 16, 2);
  // Big stones first, then the smaller ones packed in between: about 0.3-0.7 m and 0.15-0.3 m.
  const scales = [
    { cells: new PeriodicCells(rng, 13, 13, 0.9), share: 0.82, gap: 1.3, h: 240 },
    { cells: new PeriodicCells(rng, 27, 27, 0.95), share: 0.9, gap: 0.9, h: 190 },
  ];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let painted = false;
      for (const sc of scales) {
        const q = sc.cells.query(x, y, 1, 1.2);
        const cell = sc.cells.cells[q.id];
        if (cell.r > sc.share) continue;
        const e = q.d2 - q.d1;
        if (e < sc.gap) continue;
        const size = S / sc.cells.nx;
        const dx = wrapDelta(cell.x, x) / size;
        const dy = wrapDelta(cell.y, y) / size;
        // One broken facet per stone, tilted its own way, a lit upper-left arris and a dark lower rim.
        let v = 0.5 + (cell.r2 - 0.5) * 0.2 - ((cell.r3 - 0.5) * dx + (cell.r2 - 0.35) * dy) * 0.45;
        if (e < sc.gap + 1.4) v += dx + dy < 0 ? 0.12 : -0.16;
        const pal = RUBBLE_PALS[Math.floor(cell.r3 * 3.99)];
        c.set(x, y, ramp(pal, Math.min(0.9, Math.max(0.08, v)), x, y, 0), sc.h - e * 2 + cell.r2 * 12);
        painted = true;
        break;
      }
      if (!painted) {
        // The gaps: dark grit, deepest where three stones meet.
        const m = matrix(x, y);
        c.set(x, y, P.SOIL[m > 0.62 ? 1 : 0], 20 + m * 18);
      }
    }
}

export function roots(c: MatCanvas, rng: Rng): void {
  // Dark damp soil underneath.
  const n = fbm(rng, 12, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = n(x, y);
      c.set(x, y, ramp(P.SOIL, 0.14 + v * 0.26, x, y, 0), 40 + v * 30);
    }
  const bark = [0x22170f, 0x302116, 0x3f2c1d, 0x523a26, 0x684b31, 0x80603f, 0x99784f] as const;
  const width = new Float32Array(S * S);
  const along = new Float32Array(S * S);
  const strand = (pts: Array<[number, number]>, w0: number, w1: number) => {
    pts.forEach(([px, py], k) => {
      const t = k / Math.max(1, pts.length - 1);
      const r = w0 + (w1 - w0) * t;
      const R = Math.ceil(r + 1);
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > r) continue;
          const i = wrap(Math.round(px) + dx) + wrap(Math.round(py) + dy) * S;
          // Keep the thickest strand at each texel; "across" is -1 (upper edge) .. 1 (lower edge).
          const across = dy / Math.max(0.5, r);
          if (r - d + 1 > width[i]) {
            width[i] = r - d + 1;
            along[i] = across;
          }
        }
    });
  };
  // A few thick roots running mostly downward, branching, and a web of thin ones.
  for (let k = 0; k < 9; k++) {
    const x = rng.next() * S;
    const y = rng.next() * S;
    const a = Math.PI / 2 + (rng.next() - 0.5) * 1.6;
    const pts = crackCurve(rng, x, y, a, rng.int(50, 110), 0.22, 0.05) as Array<[number, number]>;
    strand(pts, 2.2 + rng.next() * 1.6, 1.0);
    for (let b = 0; b < 3; b++) {
      const [bx, by] = pts[rng.int(4, pts.length - 1)];
      strand(crackCurve(rng, bx, by, a + (rng.chance(0.5) ? 0.9 : -0.9), rng.int(14, 40), 0.3, 0.08) as Array<[number, number]>, 1.3, 0.5);
    }
  }
  for (let k = 0; k < 26; k++) {
    strand(crackCurve(rng, rng.next() * S, rng.next() * S, rng.next() * Math.PI * 2, rng.int(10, 30), 0.4, 0.1) as Array<[number, number]>, 0.7, 0.4);
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const w = width[i];
      if (w <= 0) {
        // Contact shadow below a root.
        if (width[x + wrap(y - 1) * S] > 0 || width[x + wrap(y - 2) * S] > 0) c.tint(x, y, 0x050302, 0.45);
        continue;
      }
      // Round in section: lit along the upper edge, dark under it; fine bark ridges along it.
      const lit = -along[i];
      const ridge = (Math.sin((x * 0.9 + y * 0.35) * 1.7) * 0.5 + 0.5) * 0.08;
      const v = 0.42 + lit * 0.3 + ridge + Math.min(0.12, w * 0.03);
      c.set(x, y, ramp(bark, Math.min(0.97, Math.max(0.03, v)), x, y, 0), 150 + w * 25);
    }
}

const GEM = [0x0b0614, 0x130a22, 0x1d1033, 0x2a1748, 0x3a2160, 0x4c2d7a, 0x613c94, 0x7a52b0] as const;
const GEM_GLOW = 0xb98cff;
const GEM_EDGE = 0xeadcff;

export function gemOre(c: MatCanvas, rng: Rng): void {
  // The crystal druse, smaller and denser, recoloured into violet, in pockets of dark host rock.
  crystal(c, rng);
  const pockets = new PeriodicCells(rng, 9, 9, 0.9);
  const hostN = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = c.idx(x, y);
      const q = pockets.query(x, y);
      const cell = pockets.cells[q.id];
      const dx = wrapDelta(cell.x, x);
      const dy = wrapDelta(cell.y, y);
      const r = Math.hypot(dx, dy * 1.2);
      const R = 4.2 + cell.r * 3.5;
      if (r > R) {
        // Host rock between the pockets, a lighter rind around each pocket.
        const rind = r < R + 1.3 ? 0.14 : 0;
        c.set(x, y, ramp(P.DEEP, 0.22 + (hostN(x, y) - 0.5) * 0.22 + rind, x, y, 0), 90 + rind * 300);
        continue;
      }
      const lum = (c.rgb[i * 3] * 0.3 + c.rgb[i * 3 + 1] * 0.55 + c.rgb[i * 3 + 2] * 0.15) / 255;
      const glow = c.a[i];
      let hex = ramp(GEM, Math.min(0.99, lum * 2.6 + (1 - r / R) * 0.18), x, y, 0);
      if (glow > 200) hex = GEM_EDGE;
      else if (glow > 0) hex = mixHex(hex, GEM_GLOW, Math.min(0.45, glow / 300));
      // Deeper in the pocket, more of its inner light.
      const core = 1 - r / R;
      c.set(x, y, hex, Math.min(255, glow * 1.1 + core * 60));
    }
}
