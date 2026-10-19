import { Field2, MAT_SIZE, MatCanvas, PeriodicCells, Rng, fbm, hash2, mixHex, ramp, resolve, wrap, wrapDelta } from './paint';
import * as P from './palette';

/**
 * Loose ground: compacted cave soil (worn floor), layered soil banks (walls), and scree gravel.
 * Every stone embedded in them is cut from the rock palettes, so loose ground reads as the
 * same geology broken down, not as a separate block type. Stones are lit from the upper left
 * with a contact shadow, and stay in the mid values (they never flash white under the lantern).
 */

const S = MAT_SIZE;

/** A stone embedded in soil: shaded from one rock ramp, partly buried at its lower edge. */
function embedStones(c: MatCanvas, cells: PeriodicCells, share: number, size: [number, number], zone?: (x: number, y: number) => number): void {
  // Mostly weathered (neutral) stones: blue slate pebbles would read as dots on brown soil.
  const pals = [P.PEBBLE, P.PEBBLE, P.WEATHERED, P.PEBBLE];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = cells.query(x, y);
      const cell = cells.cells[q.id];
      const z = zone ? zone(cell.x, cell.y) : 1;
      if (cell.r > share * z) continue;
      const radius = size[0] + cell.r2 * (size[1] - size[0]);
      const dx = wrapDelta(cell.x, x);
      const dy = wrapDelta(cell.y, y);
      // Angular and flattened: a blend of round and square distance, squashed vertically and
      // skewed per stone so no two read as the same dot.
      const sk = (cell.r2 - 0.5) * 0.8;
      const ex = dx + dy * sk;
      const d = 0.5 * Math.sqrt(ex * ex + dy * dy * 2) + 0.5 * Math.max(Math.abs(ex), Math.abs(dy) * 1.5);
      if (d > radius + 1.2) continue;
      if (d > radius) {
        // contact shadow in the soil around the stone, heavier below it
        if (dy > -0.5) c.tint(x, y, 0x070505, 0.35);
        continue;
      }
      const pal = pals[Math.floor(cell.r3 * 3.99)];
      const lit = -(dx + dy) / Math.max(1, radius);
      // The buried lower edge fades back into the soil.
      const buried = dy > radius * 0.35;
      const v = 0.36 + lit * 0.16 + (cell.r3 - 0.5) * 0.14 + (d > radius - 1 ? -0.06 : 0);
      const hex = ramp(pal, Math.min(0.78, v), x, y, 0);
      c.set(x, y, buried ? mixHex(hex, c.getHex(x, y), 0.5) : hex, 175 + (radius - d) * 12);
    }
}

/** Floor of compacted cave soil: soft clumps, a few embedded stones, faint drying cracks. */
export function soil(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const macro = fbm(rng, 4, 3, 0.55);
  const clumps = fbm(rng, 12, 2);
  const grain = fbm(rng, 32, 1);
  const dry = new PeriodicCells(rng, 9, 9, 0.9);
  const dryN = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const cl = clumps(x, y);
      let v = 0.44 + (macro(x, y) - 0.5) * 0.24 + (cl - 0.5) * 0.18 + (grain(x, y) - 0.5) * 0.06;
      let h = 60 + cl * 60;
      const q = dry.query(x, y);
      if (q.d2 - q.d1 < 0.9 && dryN(x, y) < 0.42) {
        v -= 0.18;
        h = 30;
      } else if (cl > 0.62) v += 0.05; // clumps stand up a little and catch light
      f.v[i] = v;
      f.h[i] = h;
    }
  resolve(c, f, P.SOIL, 0x0a0807, 0);
  embedStones(c, new PeriodicCells(rng, 15, 15, 0.95), 0.16, [0.8, 3.8]);
  // A little pale grit, in pairs of texels so it never sparkles as single-pixel noise.
  for (let k = 0; k < 60; k++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    c.set(x, y, P.SOIL[6]);
    c.set(x + 1, y, P.SOIL[5]);
  }
}

/** Soil bank (walls): horizontal horizons, a gravelly lens, rills and a few hanging roots. */
export function soilSide(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const macro = fbm(rng, 4, 3, 0.55);
  const rills = fbm(rng, 24, 1, 0.5, 2);
  const wob = fbm(rng, 4, 2);
  const grain = fbm(rng, 32, 1);
  // Horizons: bands of 4-14 texels with their own tone, filling the period exactly.
  const bands: Array<{ y0: number; t: number; tone: number; stony: boolean }> = [];
  let y0 = 0;
  while (y0 < S) {
    let t = rng.int(4, 14);
    if (S - y0 - t < 4) t = S - y0;
    bands.push({ y0, t, tone: (rng.next() - 0.5) * 0.22, stony: rng.chance(0.3) });
    y0 += t;
  }
  const bandAt = new Uint8Array(S);
  bands.forEach((b, k) => {
    for (let j = 0; j < b.t; j++) bandAt[b.y0 + j] = k;
  });
  const bandOf = (x: number, y: number) => bandAt[Math.floor(wrap(y + (wob(x, y) - 0.5) * 6))];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const b = bands[bandOf(x, y)];
      let v = 0.45 + b.tone + (macro(x, y) - 0.5) * 0.2 + (grain(x, y) - 0.5) * 0.06 - Math.max(0, rills(x, y) - 0.6) * 0.3;
      const top = wrap(y + (wob(x, y) - 0.5) * 6) - b.y0;
      if (top < 1) v -= 0.08; // a faint parting between horizons
      f.v[i] = v;
      f.h[i] = 70 + (b.tone + 0.11) * 200;
    }
  resolve(c, f, P.SOIL, 0x0a0807, 0);
  embedStones(c, new PeriodicCells(rng, 18, 18, 0.95), 0.26, [1, 3.2], (x, y) => (bands[bandOf(x, y)].stony ? 2 : 0.45));
  // Roots hanging from above: thin, dark, meandering downward.
  for (let k = 0; k < 4; k++) {
    let x = rng.next() * S;
    const yStart = rng.next() * S;
    let dx = 0;
    const len = rng.int(14, 34);
    for (let j = 0; j < len; j++) {
      dx += (rng.next() - 0.5) * 0.35;
      dx *= 0.85;
      x += dx;
      c.tint(x, yStart + j, 0x0b0806, 0.75);
    }
  }
}

/**
 * Scree gravel: angular rock fragments in three sizes, packed over a dark fine matrix. Each
 * fragment is a small facet lit from the upper left; gaps between fragments stay dark, so at
 * a boundary the fragments push into the neighbouring stone and the stone fills the gaps.
 */
export function gravel(c: MatCanvas, rng: Rng): void {
  const matrix = fbm(rng, 16, 2);
  const scales = [
    { cells: new PeriodicCells(rng, 11, 11, 0.95), share: 0.32, gap: 1.1, h: 235 },
    { cells: new PeriodicCells(rng, 21, 21, 0.95), share: 0.5, gap: 0.9, h: 200 },
    { cells: new PeriodicCells(rng, 38, 38, 0.95), share: 0.62, gap: 0.8, h: 165 },
  ];
  const pals = [P.STONE, P.STONE, P.WEATHERED, P.DEEP];
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let painted = false;
      for (const sc of scales) {
        const q = sc.cells.query(x, y, 1, 1.15);
        const cell = sc.cells.cells[q.id];
        if (cell.r > sc.share) continue;
        const e = q.d2 - q.d1;
        if (e < sc.gap) continue;
        const size = S / sc.cells.nx;
        const dx = wrapDelta(cell.x, x) / size;
        const dy = wrapDelta(cell.y, y) / size;
        // A tilted facet per fragment plus a lit upper-left rim and a shadowed lower-right rim.
        let v = 0.4 + (cell.r2 - 0.5) * 0.18 - ((cell.r3 - 0.5) * dx + (cell.r2 - 0.4) * dy) * 0.35;
        if (e < sc.gap + 1.1) v += dx + dy < 0 ? 0.08 : -0.12;
        const pal = pals[Math.floor(cell.r3 * 3.99)];
        c.set(x, y, ramp(pal, Math.min(0.8, Math.max(0.05, v)), x, y, 0), sc.h - e * 2 + cell.r2 * 15);
        painted = true;
        break;
      }
      if (!painted) {
        const m = matrix(x, y);
        c.set(x, y, P.SOIL[m > 0.6 ? 2 : m > 0.4 ? 1 : 0], 35 + m * 20);
      }
    }
  // Fine dust in the matrix, in pairs so it never reads as speckle.
  for (let k = 0; k < 50; k++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    if (c.height(x, y) > 80 || hash2(x, y) < 0.3) continue;
    c.set(x, y, P.SOIL[4]);
    c.set(x, y + 1, P.SOIL[3]);
  }
}
