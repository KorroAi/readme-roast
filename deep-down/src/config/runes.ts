import type { ItemId } from './items';

/**
 * The builders' eight runes as stroke drawings on a 16 x 16 grid (moved here from
 * render/textures.ts in the final pass so the tile painter, the rune stones, the Relic Shelf and
 * the UI all read one source). Lines are [x0, y0, x1, y1]; rings [cx, cy, r]; dots [x, y].
 */
export type RuneStroke = [number, number, number, number];

export interface RuneGlyph {
  lines: RuneStroke[];
  rings?: Array<[number, number, number]>;
  dots?: Array<[number, number]>;
}

export const RUNES: readonly RuneGlyph[] = [
  { lines: [[8, 2, 8, 12], [8, 5, 5, 8], [8, 5, 11, 8], [6, 11, 10, 11], [4, 13, 12, 13]] }, // descent
  { lines: [[8, 1, 8, 3], [8, 11, 8, 14]], rings: [[8, 7, 3.6]], dots: [[8, 7]] }, // eye
  { lines: [[8, 1, 8, 3], [8, 3, 12, 7], [12, 7, 8, 11], [8, 11, 4, 7], [4, 7, 8, 3], [6, 13, 10, 13]], dots: [[8, 7]] }, // lantern
  { lines: [[5, 2, 5, 13], [11, 2, 11, 13], [5, 5, 11, 8], [11, 8, 5, 11]] }, // chasm
  { lines: [[8, 2, 13, 13], [13, 13, 3, 13], [3, 13, 8, 2], [6, 9, 10, 9]] }, // spire
  { lines: [[3, 5, 5, 3], [5, 3, 8, 5], [8, 5, 11, 3], [11, 3, 13, 5], [3, 11, 5, 9], [5, 9, 8, 11], [8, 11, 11, 9], [11, 9, 13, 11]] }, // waves
  { lines: [[4, 13, 4, 3], [4, 3, 12, 3], [12, 3, 12, 13], [8, 6, 8, 13]], dots: [[8, 4]] }, // gate
  { lines: [[8, 2, 8, 6], [8, 10, 8, 14], [2, 8, 6, 8], [10, 8, 14, 8], [5, 5, 6, 6], [11, 5, 10, 6], [5, 11, 6, 10], [11, 11, 10, 10]], rings: [[8, 8, 1.6]] }, // star
];

/** Each rune's key item and its glyph (index into RUNES, also its Relic Shelf socket). */
export const RUNE_GLYPH: Readonly<Record<string, number>> = {
  runeDescent: 0,
  runeEye: 1,
  ancientTablet: 2,
  runeChasm: 3,
  runeSpire: 4,
  runeWaves: 5,
  runeGate: 6,
  runeStar: 7,
} satisfies Partial<Record<ItemId, number>>;

/** The rune items in glyph order (journal plates, shelf sockets). */
export const RUNES_BY_GLYPH: readonly ItemId[] = ['runeDescent', 'runeEye', 'ancientTablet', 'runeChasm', 'runeSpire', 'runeWaves', 'runeGate', 'runeStar'];

/** The glyph's pixels on its 16 x 16 grid, in drawing order (lines, then rings, then dots). */
export function runePixels(index: number): Array<[number, number]> {
  const r = RUNES[((index % RUNES.length) + RUNES.length) % RUNES.length];
  const out: Array<[number, number]> = [];
  for (const [x0, y0, x1, y1] of r.lines) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) out.push([Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n)]);
  }
  for (const [cx, cy, rad] of r.rings ?? []) {
    for (let a = 0; a < 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      out.push([Math.round(cx + Math.cos(ang) * rad), Math.round(cy + Math.sin(ang) * rad)]);
    }
  }
  for (const d of r.dots ?? []) out.push([d[0], d[1]]);
  return out;
}
