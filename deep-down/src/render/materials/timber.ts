import { MAT_SIZE, MatCanvas, Rng, crackPath, fbm, hash2, mixHex, ramp, wrap } from './paint';
import * as P from './palette';

/**
 * Aged timber for camp decks and mine supports: dried, grey-brown boards with stretched grain,
 * silvered ends, soot, checking cracks, and iron nails bleeding rust. All grain noise uses
 * per-axis lattice counts (wood is stretched along the board), so it still wraps seamlessly.
 */

const S = MAT_SIZE;

export function plank(c: MatCanvas, rng: Rng): void {
  const grain = fbm(rng, 2, 3, 0.55, 24); // long along x, fine across y
  const fine = fbm(rng, 8, 1, 0.5, 64);
  const soot = fbm(rng, 4, 2);
  // Boards of 6-10 texels (0.4 - 0.6 m) filling the period, each with its own tone and joints.
  const boards: Array<{ y0: number; h: number; tone: number; joints: number[] }> = [];
  let y = 0;
  while (y < S) {
    let h = rng.int(6, 10);
    if (S - y - h < 6) h = S - y;
    const first = rng.int(0, S - 1);
    const joints = [first, wrap(first + rng.int(40, 80))];
    boards.push({ y0: y, h, tone: rng.next(), joints });
    y += h;
  }
  for (const b of boards)
    for (let j = 0; j < b.h; j++)
      for (let x = 0; x < S; x++) {
        const yy = b.y0 + j;
        if (j === b.h - 1) {
          c.set(x, yy, P.TIMBER[0], 12); // gap between boards
          continue;
        }
        if (b.joints.some((jx) => jx === x)) {
          c.set(x, yy, P.TIMBER[0], 12); // butt joint, staggered per board
          continue;
        }
        const g = grain(x, yy);
        const nearJoint = Math.min(...b.joints.map((jx) => Math.min(Math.abs(x - jx), S - Math.abs(x - jx))));
        let v = 0.34 + (b.tone - 0.5) * 0.22 + (g - 0.5) * 0.4 + (fine(x, yy) - 0.5) * 0.08 - Math.max(0, soot(x, yy) - 0.55) * 0.5;
        if (j === 0) v += 0.08; // lit board edge
        if (j === b.h - 2) v -= 0.06;
        let hex = ramp(P.TIMBER, Math.max(0, Math.min(0.99, v)), x, yy, 0);
        // Board ends weather to silver-grey.
        if (nearJoint < 5) hex = mixHex(hex, P.TIMBER_SILVER, (1 - nearJoint / 5) * 0.4);
        c.set(x, yy, hex, 120 + g * 60);
      }
  // Nails: a pair beside each joint, with a rust bleed below.
  for (const b of boards)
    for (const jx of b.joints)
      for (const side of [-2, 2]) {
        const nx = jx + side;
        const ny = b.y0 + Math.floor(b.h / 2) - 1;
        c.set(nx, ny, P.NAIL[1]);
        c.set(nx, ny + 1, P.NAIL[0]);
        c.tint(nx, ny + 2, P.NAIL[2], 0.5);
      }
  // Checking cracks along the grain.
  for (let k = 0; k < 14; k++) {
    const b = boards[rng.int(0, boards.length - 1)];
    const yy = b.y0 + rng.int(1, b.h - 3);
    const x0 = rng.int(0, S - 1);
    const len = rng.int(6, 22);
    for (let i = 0; i < len; i++) c.tint(x0 + i, yy, P.TIMBER[0], 0.7);
  }
}

/** Post / beam side: vertical grain, checking cracks, darker toward the soot-stained top. */
export function beamSide(c: MatCanvas, rng: Rng): void {
  const grain = fbm(rng, 24, 3, 0.55, 2);
  const fine = fbm(rng, 64, 1, 0.5, 8);
  const soot = fbm(rng, 4, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const g = grain(x, y);
      const v = 0.36 + (g - 0.5) * 0.45 + (fine(x, y) - 0.5) * 0.08 - Math.max(0, soot(x, y) - 0.55) * 0.45;
      c.set(x, y, ramp(P.TIMBER, Math.max(0, Math.min(0.99, v)), x, y, 0), 140);
    }
  for (let k = 0; k < 12; k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, Math.PI / 2 + (rng.next() - 0.5) * 0.1, rng.int(8, 26), 0.05, 0.02);
    for (const [x, y] of pts) {
      c.tint(x, y, P.TIMBER[0], 0.8);
      c.tint(x - 1, y, P.TIMBER[6], 0.25);
    }
  }
}

/** End grain: growth rings centred on each 1 m post (16 texel period), with radial checks. */
export function beamEnd(c: MatCanvas, rng: Rng): void {
  const n = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const dx = (x % 16) - 7.5;
      const dy = (y % 16) - 7.5;
      const r = Math.sqrt(dx * dx + dy * dy) + (n(x, y) - 0.5) * 2.2;
      const ring = Math.floor(r * 0.8) % 2;
      const rim = Math.max(Math.abs(dx), Math.abs(dy)) > 6.8;
      const v = rim ? 0.18 : 0.38 + ring * 0.1 + (n(x, y) - 0.5) * 0.12 - r * 0.012;
      c.set(x, y, ramp(P.TIMBER, v, x, y, 0), 140);
    }
  // Radial checks from the pith of some posts.
  for (let py = 0; py < S; py += 16)
    for (let px = 0; px < S; px += 16) {
      if (hash2(px, py) < 0.4) continue;
      const a = hash2(px + 3, py + 7) * Math.PI * 2;
      for (let k = 1; k < 6; k++) c.tint(px + 7.5 + Math.cos(a) * k, py + 7.5 + Math.sin(a) * k, P.TIMBER[0], 0.8);
    }
}
