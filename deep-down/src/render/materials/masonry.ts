import { MAT_SIZE, MatCanvas, PeriodicCells, Rng, engraveEdges, fbm, fracture, mixHex, ramp } from './paint';

/**
 * Ancient masonry of a lost builder culture: large dressed stones in courses of varying
 * height (0.6 - 1.5 m), staggered joints, weathered faces, chipped arrises; big worn floor
 * slabs; masonry breaking apart. Stones span several voxels, so a wall reads as built
 * architecture rather than a grid of brick blocks.
 */

const S = MAT_SIZE;
const ASHLAR = [0x1a1d25, 0x20242d, 0x272b35, 0x2e333e, 0x363c48, 0x414755, 0x4c5363];
const MORTAR = 0x0b0c10;
const SOOT = [0x0e0d0d, 0x151313, 0x1d1a18, 0x26211e, 0x302925];
const EMBER = [0x5a1a08, 0x9a3a10, 0xe0701c, 0xffb050];

interface Stone {
  x0: number;
  y0: number;
  w: number;
  h: number;
  tone: number;
}

/** Courses with random heights summing to S, each split into stones with widths summing to S. */
function layoutCourses(rng: Rng, minH: number, maxH: number, minW: number, maxW: number): Stone[] {
  const stones: Stone[] = [];
  const heights: number[] = [];
  let total = 0;
  while (total < S) {
    let h = rng.int(minH, maxH);
    if (S - total - h < minH) h = S - total;
    heights.push(h);
    total += h;
  }
  let y = 0;
  for (const h of heights) {
    let x = rng.int(0, S - 1); // stagger: each course starts at a random offset (wraps)
    let used = 0;
    while (used < S) {
      let w = rng.int(minW, maxW);
      if (S - used - w < minW) w = S - used;
      stones.push({ x0: x, y0: y, w, h, tone: rng.next() });
      x += w;
      used += w;
    }
    y += h;
  }
  return stones;
}

function paintStones(c: MatCanvas, rng: Rng, stones: Stone[], pal: readonly number[], opts: { chip?: number; cracks?: number; worn?: number } = {}): void {
  const face = fbm(rng, 8, 3, 0.5);
  const fine = fbm(rng, 32, 1);
  for (const st of stones) {
    const chips: Array<[number, number]> = [];
    for (let k = 0; k < (opts.chip ?? 3); k++) chips.push([rng.int(0, st.w - 1), rng.next() < 0.5 ? 0 : st.h - 1]);
    for (let j = 0; j < st.h; j++)
      for (let i = 0; i < st.w; i++) {
        const x = st.x0 + i;
        const y = st.y0 + j;
        // 1 px mortar on the right and bottom of each stone.
        if (i === st.w - 1 || j === st.h - 1) {
          c.set(x, y, MORTAR, 0);
          continue;
        }
        let v = 0.32 + st.tone * 0.28 + (face(x, y) - 0.5) * 0.35 + (fine(x, y) - 0.5) * 0.12;
        // Dressed arrises: lit top/left edge, shadowed bottom/right edge, softened corners.
        if (j === 0 || i === 0) v += 0.14;
        if (j === st.h - 2 || i === st.w - 2) v -= 0.12;
        // Worn: the centre of each stone is slightly smoother/lighter.
        v += (opts.worn ?? 0) * (1 - Math.abs(i / st.w - 0.5) * 2) * 0.06;
        c.set(x, y, ramp(pal, v, x, y, 0.6), 150 + st.tone * 60 + face(x, y) * 30);
      }
    // Chipped arrises: a few missing corners/edge bites in mortar colour.
    for (const [ci, cj] of chips) {
      const r = rng.int(1, 3);
      for (let d = 0; d < r; d++) c.set(st.x0 + ci + d, st.y0 + cj, mixHex(MORTAR, pal[1], 0.4), 20);
    }
  }
  for (let i = 0; i < (opts.cracks ?? 5); i++) {
    const pts = fracture(c, rng, MORTAR, rng.int(8, 24), { turn: 0.35, heightCut: 15 });
    engraveEdges(c, pts, 1.08, 0.85);
  }
}

export function masonry(c: MatCanvas, rng: Rng): void {
  paintStones(c, rng, layoutCourses(rng, 10, 22, 18, 44), ASHLAR, { chip: 3, cracks: 6, worn: 1 });
}

/** Cap stones and wall tops: large square-ish blocks. */
export function masonryTop(c: MatCanvas, rng: Rng): void {
  paintStones(c, rng, layoutCourses(rng, 22, 40, 24, 48), ASHLAR, { chip: 4, cracks: 5, worn: 2 });
}

/**
 * Floor slabs: big, worn, irregular rectangles (1.5 - 3 m). No glow: inscriptions are
 * placed deliberately by the world generator as glyph stones, not printed on every tile.
 */
export function floorSlab(c: MatCanvas, rng: Rng): void {
  paintStones(c, rng, layoutCourses(rng, 22, 44, 26, 52), ASHLAR, { chip: 5, cracks: 10, worn: 3 });
  // Foot-worn grit in the joints.
  const grit = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) if (grit(x, y) > 0.7) c.shade(x, y, 0.9);
}

/** Masonry breaking apart: many cracks, displaced stones, faint cold light leaking through. */
export function crumbling(c: MatCanvas, rng: Rng): void {
  paintStones(c, rng, layoutCourses(rng, 8, 16, 10, 26), ASHLAR, { chip: 6, cracks: 18, worn: 0 });
  c.a.fill(0); // alpha is the emissive mask here
  for (let i = 0; i < 9; i++) {
    const pts = fracture(c, rng, 0x0d2a33, rng.int(10, 30), { turn: 0.4 });
    for (const [x, y] of pts) if (rng.chance(0.35)) c.set(x, y, 0x3fb8c8, 200);
  }
}

/** Hearth stones: soot-black, heat-cracked, embers in the joints (emissive alpha). */
export function hearth(c: MatCanvas, rng: Rng): void {
  const stones = new PeriodicCells(rng, 10, 10, 0.8);
  const n = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = stones.query(x, y);
      const edge = q.d2 - q.d1;
      if (edge < 1.5) {
        const hot = n(x, y) > 0.55;
        c.set(x, y, hot ? ramp(EMBER, (n(x, y) - 0.55) * 2.2, x, y, 0.5) : 0x0a0808, hot ? 200 : 0);
      } else c.set(x, y, ramp(SOOT, 0.25 + stones.cells[q.id].r * 0.5 + (n(x, y) - 0.5) * 0.4, x, y, 0.6), 0);
    }
}
