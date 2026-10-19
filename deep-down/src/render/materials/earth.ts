import { MAT_SIZE, MatCanvas, PeriodicCells, Rng, fbm, mixHex, ramp } from './paint';

/** Loose ground: compacted soil with embedded stones and root fibres, and scree gravel. */

const S = MAT_SIZE;
const SOIL = [0x1b1511, 0x221a14, 0x2a2018, 0x33271d, 0x3d2f23, 0x48382a];
const PEBBLE = [0x2d3036, 0x3b3f46, 0x4b5059, 0x5e646e];
const ROOT = 0x15100c;

export function soil(c: MatCanvas, rng: Rng): void {
  const base = fbm(rng, 4, 4, 0.55);
  const clumps = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const b = base(x, y);
      const v = b * 0.7 + clumps(x, y) * 0.3;
      c.set(x, y, ramp(SOIL, v, x, y, 0.8), 70 + b * 70);
    }
  // Embedded stones: they stand proud (high height), so at a soil/stone boundary rock pokes through.
  const stones = new PeriodicCells(rng, 12, 12, 0.95);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = stones.query(x, y);
      const cell = stones.cells[q.id];
      if (cell.r > 0.42) continue;
      const radius = 1.2 + cell.r * 4.5;
      if (q.d1 > radius) continue;
      const dx = x - cell.x;
      const dy = y - cell.y;
      const lit = -(dx + dy) / Math.max(1, radius);
      const v = 0.45 + lit * 0.35 + (cell.r - 0.2) * 0.4;
      c.set(x, y, ramp(PEBBLE, v, x, y, 0.4), 170 + (radius - q.d1) * 14);
    }
  // Root fibres: thin dark meandering lines, sparse.
  for (let i = 0; i < 9; i++) {
    let x = rng.int(0, S - 1);
    let y = rng.int(0, S - 1);
    let dx = rng.next() - 0.5;
    let dy = rng.next() * 0.6 + 0.2;
    const len = rng.int(14, 40);
    for (let k = 0; k < len; k++) {
      c.set(Math.round(x), Math.round(y), mixHex(c.getHex(Math.round(x), Math.round(y)), ROOT, 0.8));
      dx += (rng.next() - 0.5) * 0.4;
      x += dx * 0.8;
      y += dy;
    }
  }
}

export function gravel(c: MatCanvas, rng: Rng): void {
  const bed = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) c.set(x, y, ramp(SOIL, 0.15 + bed(x, y) * 0.3, x, y, 0.6), 40);
  const stones = new PeriodicCells(rng, 26, 26, 0.95);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = stones.query(x, y, 1, 1.25);
      const cell = stones.cells[q.id];
      const edge = q.d2 - q.d1;
      if (edge < 0.9) continue; // dark gaps between stones
      const dx = x - cell.x;
      const dy = y - cell.y;
      const lit = -(dx + dy) * 0.18;
      const v = 0.3 + cell.r * 0.45 + lit + (edge > 3 ? 0.05 : -0.1);
      c.set(x, y, ramp(PEBBLE, v, x, y, 0.5), 90 + Math.min(edge, 5) * 25);
    }
}
