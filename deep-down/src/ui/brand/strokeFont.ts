// Lintel: the display face of DEEP DOWN, carved rather than typeset. Every glyph is a few
// strokes on a 4 x 7 unit grid (M and W take 5 columns), 1.0 unit wide, running in the eight
// compass directions only; stroke ends and bends are chamfered at 45 degrees. A glyph is built
// as filled polygons: one rectangle per stroke segment plus one octagon per node, all wound the
// same way, so the nonzero union is the letter (SVG paths and the runtime font both fill it).
//
// Pure data and geometry (no DOM): the wordmark (wordmark.ts) and the runtime font
// (lintelFont.ts) are built from it, and tests/unit/brand.test.ts checks coverage and layout.

/** Glyph height in units (cap height; ',' descends one unit below). */
export const LINTEL_H = 7;
/** Space between glyphs, units. */
export const LINTEL_GAP = 1;
/** Width of a space, units (the gap is added on both sides as usual). */
export const LINTEL_SPACE = 2;

/** The characters the face must cover (plan §3): A-Z, 0-9 and − . · / ? '. */
export const LINTEL_REQUIRED = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789−.·/?'";

/**
 * Stroke centerlines. Each string is one polyline of lattice nodes "x,y x,y ..." (y down,
 * half nodes allowed); node (x, y) is the stroke centre at unit (x + 0.5, y + 0.5).
 */
const STROKES: Record<string, readonly string[]> = {
  A: ['0,6 0,1 1,0 2,0 3,1 3,6', '0,3 3,3'],
  B: ['0,0 0,6 2,6 3,5 3,4 2,3 0,3', '0,0 2,0 3,1 3,2 2,3'],
  C: ['3,0 1,0 0,1 0,5 1,6 3,6'],
  D: ['0,0 0,6 2,6 3,5 3,1 2,0 0,0'],
  E: ['3,0 0,0 0,6 3,6', '0,3 2,3'],
  F: ['3,0 0,0 0,6', '0,3 2,3'],
  G: ['3,1 2,0 1,0 0,1 0,5 1,6 2,6 3,5 3,3 2,3'],
  H: ['0,0 0,6', '3,0 3,6', '0,3 3,3'],
  I: ['0,0 2,0', '1,0 1,6', '0,6 2,6'],
  J: ['1,0 3,0 3,5 2,6 1,6 0,5'],
  K: ['0,0 0,6', '3,0 0,3 3,6'],
  L: ['0,0 0,6 3,6'],
  M: ['0,6 0,0 2,2 4,0 4,6'],
  N: ['0,6 0,0 3,3', '3,0 3,6'],
  O: ['1,0 2,0 3,1 3,5 2,6 1,6 0,5 0,1 1,0'],
  P: ['0,6 0,0 2,0 3,1 3,2 2,3 0,3'],
  Q: ['1,0 2,0 3,1 3,5 2,6 1,6 0,5 0,1 1,0', '1.5,4.5 3,6'],
  R: ['0,6 0,0 2,0 3,1 3,2 2,3 0,3', '2,3 3,4 3,6'],
  S: ['3,1 2,0 1,0 0,1 0,2 1,3 2,3 3,4 3,5 2,6 1,6 0,5'],
  T: ['0,0 3,0', '1.5,0 1.5,6'],
  U: ['0,0 0,5 1,6 2,6 3,5 3,0'],
  V: ['0,0 0,4.5 1.5,6 3,4.5 3,0'],
  W: ['0,0 0,6 2,4 4,6 4,0'],
  X: ['0,0 0,1.5 3,4.5 3,6', '3,0 3,1.5 0,4.5 0,6'],
  Y: ['0,0 0,1.5 1.5,3 3,1.5 3,0', '1.5,3 1.5,6'],
  Z: ['0,0 3,0 3,1.5 0,4.5 0,6 3,6'],
  '0': ['1,0 2,0 3,1 3,5 2,6 1,6 0,5 0,1 1,0', '0,4.5 3,1.5'],
  '1': ['0,1 1,0 1,6', '0,6 2,6'],
  '2': ['0,1 1,0 2,0 3,1 3,2 0,5 0,6 3,6'],
  '3': ['0,1 1,0 2,0 3,1 3,2 2,3 3,4 3,5 2,6 1,6 0,5', '1,3 2,3'],
  '4': ['2,6 2,0 0,2 0,4 3,4'],
  '5': ['3,0 0,0 0,3 2,3 3,4 3,5 2,6 0,6'],
  '6': ['3,0 1,0 0,1 0,5 1,6 2,6 3,5 3,4 2,3 0,3'],
  '7': ['0,0 3,0 3,1 1,3 1,6'],
  '8': ['1,3 0,2 0,1 1,0 2,0 3,1 3,2 2,3 1,3 0,4 0,5 1,6 2,6 3,5 3,4 2,3'],
  '9': ['0,6 2,6 3,5 3,1 2,0 1,0 0,1 0,2 1,3 3,3'],
  '-': ['0,3 2,3'],
  '−': ['0,3 2,3'],
  '.': ['0,6'],
  '·': ['0,3'],
  '/': ['0,6 0,4.5 3,1.5 3,0'],
  '?': ['0,1 1,0 2,0 3,1 3,2 1.5,3.5 1.5,4', '1.5,6'],
  "'": ['0,0 0,1.5'],
  '’': ['0,0 0,1.5'],
  ',': ['0,6 0,7'],
  ':': ['0,2.5', '0,6'],
  '!': ['0,0 0,4', '0,6'],
  '+': ['0,3 2,3', '1,2 1,4'],
  '×': ['0,2 2,4', '2,2 0,4'],
};

export type Point = readonly [number, number];
export type Polygon = Point[];

export interface Glyph {
  /** Advance width without the gap, units. */
  width: number;
  /** Stroke centerlines in unit coordinates. */
  strokes: Point[][];
  /** Filled polygons (same winding), unit coordinates, y down, origin top-left of the cap box. */
  polygons: Polygon[];
}

const parse = (line: string): Point[] => line.trim().split(/\s+/).map((p) => p.split(',').map((v) => Number(v) + 0.5) as unknown as Point);

/** Octagon of apothem 0.5 around a node: the chamfered joint and end cap of every stroke. */
const K = 0.5 * Math.tan(Math.PI / 8);
function octagon([x, y]: Point): Polygon {
  return [
    [x - K, y - 0.5],
    [x + K, y - 0.5],
    [x + 0.5, y - K],
    [x + 0.5, y + K],
    [x + K, y + 0.5],
    [x - K, y + 0.5],
    [x - 0.5, y + K],
    [x - 0.5, y - K],
  ];
}

function segment(a: Point, b: Point): Polygon {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  const nx = (-dy / len) * 0.5;
  const ny = (dx / len) * 0.5;
  return [
    [a[0] + nx, a[1] + ny],
    [b[0] + nx, b[1] + ny],
    [b[0] - nx, b[1] - ny],
    [a[0] - nx, a[1] - ny],
  ];
}

/** Shoelace area (positive = clockwise on a y-down screen). */
export function signedArea(p: Polygon): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/** Wind clockwise on screen (y down), so overlapping pieces add up under nonzero fill. */
const clockwise = (p: Polygon): Polygon => (signedArea(p) < 0 ? p.slice().reverse() : p);

const cache = new Map<string, Glyph | null>();

/** The glyph for a character (case-insensitive), or null if the face does not cover it. */
export function lintelGlyph(ch: string): Glyph | null {
  const key = ch.length === 1 ? ch.toUpperCase() : ch;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const def = STROKES[key];
  let glyph: Glyph | null = null;
  if (def) {
    const strokes = def.map(parse);
    const polygons: Polygon[] = [];
    const nodes = new Map<string, Point>();
    let maxX = 0;
    for (const line of strokes) {
      for (let i = 0; i < line.length; i++) {
        const p = line[i];
        nodes.set(`${p[0]},${p[1]}`, p);
        maxX = Math.max(maxX, p[0] + 0.5);
        if (i > 0) polygons.push(clockwise(segment(line[i - 1], p)));
      }
    }
    for (const p of nodes.values()) polygons.push(clockwise(octagon(p)));
    glyph = { width: maxX, strokes, polygons };
  }
  cache.set(key, glyph);
  return glyph;
}

export const hasLintelGlyph = (ch: string): boolean => ch === ' ' || lintelGlyph(ch) !== null;

/** Every character with a glyph (upper case and symbols), for the font builder and tests. */
export const LINTEL_CHARS: readonly string[] = Object.keys(STROKES);

export interface LintelLayout {
  /** Total width, units (no trailing gap). */
  width: number;
  height: number;
  glyphs: Array<{ ch: string; x: number; glyph: Glyph }>;
  /** Characters without a glyph (skipped), so gaps are visible in tests. */
  missing: string[];
}

/** Lay out one line: glyphs separated by LINTEL_GAP, spaces LINTEL_SPACE wide. */
export function layoutLintel(text: string, opts: { tracking?: number } = {}): LintelLayout {
  const gap = LINTEL_GAP + (opts.tracking ?? 0);
  const glyphs: LintelLayout['glyphs'] = [];
  const missing: string[] = [];
  let x = 0;
  let first = true;
  for (const ch of text) {
    if (ch === ' ') {
      // Same spacing as the font: gap, space, gap.
      if (!first) x += gap;
      x += LINTEL_SPACE;
      first = false;
      continue;
    }
    const glyph = lintelGlyph(ch);
    if (!glyph) {
      missing.push(ch);
      continue;
    }
    if (!first) x += gap;
    glyphs.push({ ch, x, glyph });
    x += glyph.width;
    first = false;
  }
  return { width: x, height: LINTEL_H, glyphs, missing };
}

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

/** SVG path data for polygons, scaled by `k` and offset by (ox, oy). */
export function polygonsPath(polys: readonly Polygon[], k = 1, ox = 0, oy = 0): string {
  return polys.map((p) => `M${p.map(([x, y]) => `${fmt(ox + x * k)} ${fmt(oy + y * k)}`).join('L')}Z`).join('');
}

/** SVG path data for a laid-out line at (ox, oy), `k` px per unit. */
export function lintelPath(layout: LintelLayout, k = 1, ox = 0, oy = 0): string {
  return layout.glyphs.map((g) => polygonsPath(g.glyph.polygons, k, ox + g.x * k, oy)).join('');
}
