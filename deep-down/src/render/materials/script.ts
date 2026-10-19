import { MAT_SIZE, MatCanvas, Rng } from './paint';

/**
 * The builders' script: eight lines of carved inscription, each one metre tall (16 texel rows)
 * and 8 m long, wrapping. The terrain shader lays a line along a band of glyph stones in world
 * space, so the band reads as text running along the course, not as one icon per stone.
 *
 * One chisel grammar for every glyph: a 2-texel (12 cm) stroke hanging from a carved headline (the line
 * the whole word hangs from): pendants ending in loops or hooks, hanging rings, vees, zigzags
 * and slanted tails, with the odd dot below the body. Glyph widths vary (5-9 texels, 0.3-0.55 m),
 * glyphs of a word share the headline, words are separated by gaps where it breaks, and a thin
 * baseline groove rules the whole line. Every glyph hangs from the top and none has the side
 * stems and bars of a Latin capital.
 *
 * Alpha: 255 inked stroke core, 140 carved stroke edge, 95 baseline groove, 0 stone (the shader
 * thresholds it into groove and ink). RGB: the ink colour.
 */

const S = MAT_SIZE;
const LINE = 16;
const HEAD = 1; // headline rows 1-2
const BODY = 3; // body rows 3-11
const RULE = 14; // baseline groove
const INK = 0x7ff3ff;
const RIM = 0x2aa9c0;

type Seg = [number, number, number, number];
interface Glyph {
  segs: Seg[];
  /** Rings: centre x, y and radius (stroke on the circle). */
  rings: Array<[number, number, number]>;
}

/**
 * One glyph in its own box: x 0..w-1, y 0..8 (body rows), y < 0 reaches the headline. A main
 * radical hangs from the headline (a pendant ending in a loop or a hook, a hanging ring, a vee, a
 * zigzag, a slanted tail with a foot), and a secondary mark may join it (a dot below, a tick, a
 * small cross-stroke). No full-height side stems with bars: those read as Latin capitals.
 */
function glyph(rng: Rng, w: number): Glyph {
  const g: Glyph = { segs: [], rings: [] };
  const mid = (w - 1) / 2;
  const right = w - 1.5;
  const left = 0.5;
  const r = rng.next();
  if (r < 0.24) {
    // Pendant: a stem from the headline ending in a loop or a hook.
    const x = rng.chance(0.5) ? mid : rng.chance(0.5) ? left + 1 : right - 1;
    const end = 3 + rng.next() * 2;
    g.segs.push([x, -1.5, x, end]);
    if (rng.chance(0.6)) g.rings.push([x + (rng.chance(0.5) ? 1.2 : -1.2), end + 2, 2]);
    else g.segs.push([x, end, x + 2, end + 2.5], [x + 2, end + 2.5, x + 3, end + 1]);
  } else if (r < 0.44) {
    // Hanging ring on a short stem, a tail sweeping down from it.
    const cx = Math.max(2, Math.min(w - 3, mid));
    g.segs.push([cx, -1.5, cx, 1]);
    g.rings.push([cx, 3.4, 2.4]);
    if (rng.chance(0.6)) g.segs.push([cx + 1.6, 5.2, right + 0.5, 8.5]);
  } else if (r < 0.6) {
    // Vee hanging from the headline, sometimes with a dot inside.
    g.segs.push([left, -1.5, mid, 5.5], [mid, 5.5, right, -1.5]);
    if (rng.chance(0.4)) g.segs.push([mid, 1.5, mid, 1.5]);
  } else if (r < 0.76) {
    // Zigzag stroke down the body.
    g.segs.push([left + 0.5, -1.5, right, 2], [right, 2, left, 5], [left, 5, right, 8]);
  } else if (r < 0.9) {
    // Slanted tail with a foot.
    g.segs.push([right, -1.5, left + 0.5, 7.5], [left + 0.5, 7.5, left + 3, 7.5]);
    if (rng.chance(0.5)) g.segs.push([mid + 0.5, 1, right + 0.5, 3]);
  } else {
    // Two short drops joined by a sagging stroke.
    g.segs.push([left, -1.5, left, 2.5], [right, -1.5, right, 2.5], [left, 2.5, mid, 5], [mid, 5, right, 2.5]);
  }
  const extra = rng.next();
  if (extra < 0.22) g.segs.push([mid, 10.3, mid, 10.3]);
  else if (extra < 0.32) g.segs.push([mid - 1, 10.3, mid - 1, 10.3], [mid + 1.5, 10.3, mid + 1.5, 10.3]);
  else if (extra < 0.42) g.segs.push([right - 0.5, -1.5, right + 0.5, 1]);
  return g;
}

function distToSeg(px: number, py: number, s: Seg): number {
  const [ax, ay, bx, by] = s;
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

export function script(c: MatCanvas, rng: Rng): void {
  c.a.fill(0);
  for (let line = 0; line < S / LINE; line++) {
    const y0 = line * LINE;
    const mark = (x: number, y: number, a: number, hex: number) => {
      const i = c.idx(x, y);
      if (c.a[i] >= a) return;
      c.set(x, y, hex, a);
    };
    // Baseline groove along the whole line, worn through in a few places.
    for (let x = 0; x < S; x++) if (!(x % 37 === 11 && rng.chance(0.6))) mark(x, y0 + RULE, 95, RIM);
    // Words of 2-5 glyphs; the last word gap takes the remainder, so the line wraps on a gap.
    let x = rng.int(2, 5);
    for (;;) {
      // A word that fits what is left of the line (shorter words toward its end).
      const room = S - x - 5;
      if (room < 6) break;
      const widths: number[] = [];
      let len = 0;
      for (let k = 0, count = rng.int(2, 5); k < count; k++) {
        const w = rng.int(5, 9);
        if (len + w + (k > 0 ? 2 : 0) > room) break;
        widths.push(w);
        len += w + (k > 0 ? 2 : 0);
      }
      if (!widths.length) break;
      // Headline over the whole word, one texel past it on both sides.
      for (let hx = x - 1; hx <= x + len; hx++) {
        mark(hx, y0 + HEAD, 255, INK);
        mark(hx, y0 + HEAD + 1, 255, INK);
      }
      let gx = x;
      for (const w of widths) {
        const gl = glyph(rng, w);
        for (let yy = -1; yy <= 11; yy++)
          for (let xx = -1; xx <= w; xx++) {
            let d = Infinity;
            for (const s of gl.segs) d = Math.min(d, distToSeg(xx, yy, s));
            for (const [cx, cy, rr] of gl.rings) d = Math.min(d, Math.abs(Math.hypot(xx - cx, yy - cy) - rr));
            const ay = y0 + BODY + yy;
            if (ay <= y0 + HEAD + 1 || ay >= y0 + RULE) continue;
            // Strokes about two texels wide (12 cm), so a line reads from across a hall.
            if (d <= 0.92) mark(gx + xx, ay, 255, INK);
            else if (d <= 1.55) mark(gx + xx, ay, 140, RIM);
          }
        gx += w + 2;
      }
      x += len + rng.int(4, 7);
    }
  }
}
