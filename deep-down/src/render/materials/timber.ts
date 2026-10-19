import { MAT_SIZE, MatCanvas, Rng, fbm, ramp } from './paint';

/** Aged timber for camp decks and mine supports: boards with grain, knots, nail heads, end grain. */

const S = MAT_SIZE;
const WOOD = [0x2a1a10, 0x382315, 0x472d1b, 0x573822, 0x67432a, 0x795134];

export function plank(c: MatCanvas, rng: Rng): void {
  const grain = fbm(rng, 4, 3);
  const fine = fbm(rng, 32, 1);
  // Boards of 7-11 texels (0.45 - 0.7 m) running along u, each with its own tone and seams.
  const boards: Array<{ y0: number; h: number; tone: number; seam: number }> = [];
  let y = 0;
  while (y < S) {
    let h = rng.int(7, 11);
    if (S - y - h < 7) h = S - y;
    boards.push({ y0: y, h, tone: rng.next(), seam: rng.int(0, S - 1) });
    y += h;
  }
  for (const b of boards)
    for (let j = 0; j < b.h; j++)
      for (let x = 0; x < S; x++) {
        const yy = b.y0 + j;
        if (j === b.h - 1) {
          c.set(x, yy, 0x140c07, 10);
          continue;
        }
        // Grain: stretched noise along the board.
        const g = grain(x * 0.25, yy * 3);
        let v = 0.3 + b.tone * 0.3 + (g - 0.5) * 0.45 + (fine(x, yy) - 0.5) * 0.1;
        if (j === 0) v += 0.1;
        if (Math.abs(((x - b.seam + S) % 48)) === 0) {
          c.set(x, yy, 0x140c07, 10); // butt joint every 3 m, staggered per board
          continue;
        }
        c.set(x, yy, ramp(WOOD, v, x, yy, 0.5), 120 + g * 60);
      }
  // Nail heads near the joints and a few knots.
  for (const b of boards) {
    for (let k = 0; k < 4; k++) c.set(b.seam + 2 + k * 48, b.y0 + 2, 0x8a8f96);
    if (rng.chance(0.6)) {
      const kx = rng.int(0, S - 1);
      const ky = b.y0 + Math.floor(b.h / 2);
      c.set(kx, ky, WOOD[0]);
      c.set(kx + 1, ky, WOOD[1]);
    }
  }
}

/** Beam side: vertical grain (posts), slight checking cracks. */
export function beamSide(c: MatCanvas, rng: Rng): void {
  const grain = fbm(rng, 4, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const g = grain(x * 3, y * 0.25);
      const v = 0.35 + (g - 0.5) * 0.55;
      c.set(x, y, ramp(WOOD, v, x, y, 0.5), 140);
    }
  for (let i = 0; i < 10; i++) {
    const x = rng.int(0, S - 1);
    const y0 = rng.int(0, S - 1);
    for (let k = 0; k < rng.int(6, 20); k++) c.set(x, y0 + k, 0x170e08, 30);
  }
}

/** End grain: growth rings centred on each 1 m post (16 texel period). */
export function beamEnd(c: MatCanvas, rng: Rng): void {
  const n = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x % 16) - 7.5;
      const dy = (y % 16) - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy) + (n(x, y) - 0.5) * 2;
      const ring = 0.5 + 0.5 * Math.sin(r * 1.6);
      const edge = Math.max(Math.abs(dx), Math.abs(dy)) > 7 ? -0.2 : 0;
      c.set(x, y, ramp(WOOD, 0.3 + ring * 0.35 + edge, x, y, 0.4), 140);
    }
}
