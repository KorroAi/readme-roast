import { MAT_SIZE, MatCanvas, Rng } from './paint';

/**
 * The builders' script: eight lines of carved inscription, each one metre tall (16 texel rows)
 * and 8 m long, wrapping. The terrain shader lays a line along a band of glyph stones in world
 * space, so the band reads as text running along the course, not as one icon per stone.
 *
 * One chisel grammar for every glyph: a 2-texel stroke hanging from a carved headline (the line
 * the whole word hangs from), built from stems, diagonals, side bowls, hooks, bars, chevrons and
 * the odd dot or tail below the body. Glyph widths vary (4-9 texels, 0.25-0.55 m), glyphs of a
 * word share the headline, words are separated by gaps where it breaks, and a thin baseline
 * groove rules the whole line. Nothing reads as a Latin letter: every glyph is attached at the
 * top and most strokes are angular.
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

/** Strokes of one glyph in its own box: x 0..w-1, y 0..8 (body rows), y < 0 reaches the headline. */
function glyph(rng: Rng, w: number): Seg[] {
  const segs: Seg[] = [];
  const left = 0.5;
  const right = w - 1.5;
  const stemX = rng.chance(0.55) ? left : right;
  const otherX = stemX === left ? right : left;
  const parts = rng.chance(0.35) ? 3 : 2;
  let attached = false;
  const used = new Set<string>();
  for (let p = 0; p < parts; p++) {
    const r = rng.next();
    const kind = r < 0.3 ? 'stem' : r < 0.45 ? 'diag' : r < 0.58 ? 'bowl' : r < 0.68 ? 'hook' : r < 0.78 ? 'bar' : r < 0.9 ? 'chevron' : 'tick';
    if (used.has(kind)) continue;
    used.add(kind);
    switch (kind) {
      case 'stem':
        segs.push([stemX, -1.5, stemX, rng.chance(0.75) ? 8 : 4.5]);
        attached = true;
        break;
      case 'diag':
        if (rng.chance(0.5)) segs.push([left, 1, right, 8]);
        else segs.push([right, 1, left, 8]);
        break;
      case 'bowl': {
        const x0 = stemX;
        const x1 = otherX;
        const y0 = rng.chance(0.5) ? 1.5 : 4;
        segs.push([x0, y0, x1, y0 + 1.2], [x1, y0 + 1.2, x1, y0 + 2.6], [x1, y0 + 2.6, x0, y0 + 3.6]);
        break;
      }
      case 'hook':
        segs.push([stemX, 8, (stemX + otherX) / 2, 8], [(stemX + otherX) / 2, 8, otherX, 6]);
        break;
      case 'bar': {
        const y = rng.chance(0.5) ? 3.5 : 5.5;
        segs.push([left, y, right, y]);
        break;
      }
      case 'chevron':
        segs.push([left, -1.5, (left + right) / 2, 4], [(left + right) / 2, 4, right, -1.5]);
        attached = true;
        break;
      case 'tick':
        segs.push([right, -1.5, right + 0.5, 2]);
        attached = true;
        break;
    }
  }
  if (!attached) segs.push([stemX, -1.5, stemX, rng.chance(0.5) ? 8 : 3]);
  // The odd dot or a tail below the body.
  const extra = rng.next();
  if (extra < 0.18) segs.push([w / 2 - 0.5, 10.2, w / 2 - 0.5, 10.2]);
  else if (extra < 0.3) segs.push([stemX, 8, stemX + (stemX === left ? -0.5 : 0.5), 10.5]);
  return segs;
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
      const count = rng.int(2, 5);
      const widths: number[] = [];
      let len = 0;
      for (let k = 0; k < count; k++) {
        const w = rng.int(4, 9);
        widths.push(w);
        len += w + (k > 0 ? 2 : 0);
      }
      if (x + len + 5 > S) break;
      // Headline over the whole word, one texel past it on both sides.
      for (let hx = x - 1; hx <= x + len; hx++) {
        mark(hx, y0 + HEAD, 255, INK);
        mark(hx, y0 + HEAD + 1, 255, INK);
      }
      let gx = x;
      for (const w of widths) {
        const segs = glyph(rng, w);
        for (let yy = -1; yy <= 11; yy++)
          for (let xx = -1; xx <= w; xx++) {
            let d = Infinity;
            for (const s of segs) d = Math.min(d, distToSeg(xx, yy, s));
            const ay = y0 + BODY + yy;
            if (ay <= y0 + HEAD + 1 || ay >= y0 + RULE) continue;
            if (d <= 0.72) mark(gx + xx, ay, 255, INK);
            else if (d <= 1.35) mark(gx + xx, ay, 140, RIM);
          }
        gx += w + 2;
      }
      x += len + rng.int(4, 7);
    }
  }
}
