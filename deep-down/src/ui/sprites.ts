import { TILE_SIZE } from '../config/tiles';
import type { TileAtlas } from '../render/textures';

// Pure pixel rasterizers for UI icons (no DOM): isometric voxel cubes sampled from the
// procedural block tiles, and small hand-authored pixel sprites. icons.ts turns the
// buffers into cached data URLs.

export interface Raster {
  size: number;
  /** RGBA8, row-major. */
  data: Uint8ClampedArray;
}

const newRaster = (size: number): Raster => ({ size, data: new Uint8ClampedArray(size * size * 4) });

function put(r: Raster, x: number, y: number, rgb: number, a = 255): void {
  const i = (x + y * r.size) * 4;
  r.data[i] = (rgb >> 16) & 255;
  r.data[i + 1] = (rgb >> 8) & 255;
  r.data[i + 2] = rgb & 255;
  r.data[i + 3] = a;
}

/** Add a dark rim around every opaque shape so icons read on any background. */
export function outline(r: Raster, color = 0x05080d, passes = 1): Raster {
  const s = r.size;
  for (let p = 0; p < passes; p++) {
    const src = r.data.slice();
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        if (src[(x + y * s) * 4 + 3] !== 0) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
            if (src[(nx + ny * s) * 4 + 3] > 128) {
              near = true;
              break;
            }
          }
        if (near) put(r, x, y, color, 235);
      }
  }
  return r;
}

/**
 * Nearest-neighbor resample to `size` px. Exact at whole multiples of the sprite size;
 * otherwise sprite pixels differ by at most one device pixel, which keeps hard edges.
 */
export function scaleNearest(src: Raster, size: number): Raster {
  const out = newRaster(size);
  const k = size / src.size;
  for (let y = 0; y < size; y++) {
    const sy = Math.min(src.size - 1, Math.floor(y / k));
    for (let x = 0; x < size; x++) {
      const si = (Math.min(src.size - 1, Math.floor(x / k)) + sy * src.size) * 4;
      const oi = (x + y * size) * 4;
      out.data[oi] = src.data[si];
      out.data[oi + 1] = src.data[si + 1];
      out.data[oi + 2] = src.data[si + 2];
      out.data[oi + 3] = src.data[si + 3];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// Isometric voxel cube

const SHADE_TOP = 1.14;
const SHADE_LEFT = 0.84;
const SHADE_RIGHT = 0.62;

/**
 * An isometric cube (2:1 projection) whose three visible faces sample block tiles texel by
 * texel, so the icon keeps the crisp pixel-art of the terrain at any size. Top face is
 * lightest, the right side darkest (light from the top-left), front edges get a highlight.
 */
export function cubeIcon(atlas: TileAtlas, topLayer: number, sideLayer: number, size: number): Raster {
  const r = newRaster(size);
  const S = TILE_SIZE;
  const margin = Math.max(1, Math.round(size * 0.06));
  const hw = (size - margin * 2) / 2;
  const h = hw;
  const cx = size / 2;
  const top = margin;
  const sample = (layer: number, u: number, v: number, shade: number, x: number, y: number) => {
    const tx = Math.min(S - 1, Math.max(0, Math.floor(u * S)));
    const ty = Math.min(S - 1, Math.max(0, Math.floor(v * S)));
    const i = (layer * S * S + tx + ty * S) * 4;
    // Emissive texels (alpha mask) stay bright so ores and crystals sparkle in the icon.
    const glow = atlas.data[i + 3] > 0 ? 1.25 : 1;
    const f = shade * glow;
    const o = (x + y * size) * 4;
    r.data[o] = atlas.data[i] * f;
    r.data[o + 1] = atlas.data[i + 1] * f;
    r.data[o + 2] = atlas.data[i + 2] * f;
    r.data[o + 3] = 255;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      // Top rhombus: T + u*(R - T) + v*(L - T), with R - T = (hw, hw/2), L - T = (-hw, hw/2).
      const dx = (px - cx) / hw;
      const dy = (py - top) / (hw / 2);
      const tu = (dx + dy) / 2;
      const tv = (dy - dx) / 2;
      if (tu >= 0 && tu < 1 && tv >= 0 && tv < 1) {
        const edge = tu > 0.93 || tv > 0.93 ? 1.18 : 1;
        sample(topLayer, tu, tv, SHADE_TOP * edge, x, y);
        continue;
      }
      // Left face: from L = (cx - hw, top + hw/2) toward the front vertex C.
      const lu = (px - (cx - hw)) / hw;
      if (lu >= 0 && lu < 1) {
        const lv = (py - (top + hw / 2) - lu * (hw / 2)) / h;
        if (lv >= 0 && lv < 1) {
          sample(sideLayer, lu, lv, SHADE_LEFT * (lu > 0.95 ? 1.12 : 1), x, y);
          continue;
        }
      }
      // Right face: from the front vertex C = (cx, top + hw) toward R.
      const ru = (px - cx) / hw;
      if (ru >= 0 && ru < 1) {
        const rv = (py - (top + hw) + ru * (hw / 2)) / h;
        if (rv >= 0 && rv < 1) sample(sideLayer, ru, rv, SHADE_RIGHT * (ru < 0.05 ? 1.2 : 1), x, y);
      }
    }
  return outline(r, 0x05080d, size >= 72 ? 2 : 1);
}

// ---------------------------------------------------------------------------------------
// Pixel sprites: 16x16 ASCII art with a per-sprite palette ('.' = transparent).

export type Palette = Record<string, number>;

export function sprite(rows: readonly string[], palette: Palette): Raster {
  const size = Math.max(rows.length, ...rows.map((r) => r.length));
  const r = newRaster(size);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]];
      if (c !== undefined) put(r, x, y, c);
    }
  });
  return r;
}

export const SHARD_ROWS = [
  '................',
  '.........W......',
  '........WLC.....',
  '........WLCC....',
  '.......WLLCC....',
  '.......WLLCD....',
  '......WLLCCD....',
  '......WLLCCD....',
  '..W...LLLCDD....',
  '.WLC..LLCCDD....',
  '.WLCD.LLCCD.....',
  '.LLCD..LCCD.....',
  '..LCD..LCD......',
  '...D....D.......',
  '................',
  '................',
];
export const SHARD_PALETTE: Palette = { W: 0xe2ffff, L: 0x7eeefc, C: 0x30bfd8, D: 0x10617a };

export const TABLET_ROWS = [
  '................',
  '.....SSSSSS.....',
  '....SLLLLLLS....',
  '...SLsssssssS...',
  '...SLsGGsGssS...',
  '...SLsssssssS...',
  '...SLsGsGGGsS...',
  '...SLsssssssS...',
  '...SLsGGGsGsS...',
  '...SLsssssssS...',
  '...SLsGsGGssS...',
  '...SLsssssssS...',
  '...SDDDDDDDDS...',
  '....DDDDDDDD....',
  '................',
  '................',
];
export const TABLET_PALETTE: Palette = { S: 0x2a2f3a, L: 0x6a7384, s: 0x4b5260, G: 0x48d6ea, D: 0x1b1e25 };

export const PICKAXE_ROWS = [
  '................',
  '...LLLLLL.......',
  '..LHHHHHHLL.....',
  '...DDDDHHHHL....',
  '........DHHHL...',
  '.......W.DHHL...',
  '......Ww..DHHL..',
  '.....Ww....DHL..',
  '....Ww.....DHL..',
  '...Ww.......DL..',
  '..Ww........DD..',
  '.Ww.............',
  '.w..............',
  '................',
  '................',
  '................',
];

export const LANTERN_ROWS = [
  '................',
  '......MMMM......',
  '.....M....M.....',
  '.....M....M.....',
  '....DMMMMMMD....',
  '...DMHHHHHHMD...',
  '....MgYYYYgM....',
  '....MYYWWYYM....',
  '....MYWWWWYM....',
  '....MYYWWYYM....',
  '....MgYYYYgM....',
  '...DMHHHHHHMD...',
  '...DDDDDDDDDD...',
  '................',
  '................',
  '................',
];

export const TINY_PACK_ROWS = [
  '................',
  '.......DD.......',
  '......D..D......',
  '....RRRRRRRR....',
  '....RrrrrrrR....',
  '....BBBBBBBB....',
  '....BLBBBBLB....',
  '....BLBBBBLB....',
  '....BLPPPPLB....',
  '....BLPKKPLB....',
  '....BLPPPPLB....',
  '....bbbbbbbb....',
  '................',
  '................',
  '................',
  '................',
];

export const STURDY_PACK_ROWS = [
  '................',
  '......DDDD......',
  '.....D....D.....',
  '..RRRRRRRRRRRR..',
  '..RrrrrrrrrrrR..',
  '..rRRRRRRRRRRr..',
  '..BBBBBBBBBBBB..',
  '..BLKBBBBBBKLB..',
  '..BLBBBBBBBBLB..',
  '..BLBPPPPPPBLB..',
  '..BLBPKKKKPBLB..',
  '..BLBPPPPPPBLB..',
  '..BLBPPPPPPBLB..',
  '..bbbbbbbbbbbb..',
  '................',
  '................',
];

export const HEART_ROWS = ['.###.###.', '#########', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'];

/**
 * Heart sprite (11x11 with rim): `fill` 2 = full, 1 = left half, 0 = empty. Bottom-right
 * cells are shaded and the top-left lobe gets a highlight, like the terrain bevel.
 */
export function heartSprite(fill: 0 | 1 | 2): Raster {
  const w = 9;
  const r = newRaster(11);
  HEART_ROWS.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      if (row[x] !== '#') continue;
      const lit = fill === 2 || (fill === 1 && x <= 4);
      const edge = y === 7 || row[x + 1] !== '#' || HEART_ROWS[y + 1]?.[x] !== '#';
      let c = lit ? (edge ? 0xa51f33 : 0xe8414f) : edge ? 0x22161c : 0x3a2530;
      if (lit && ((y === 1 && (x === 1 || x === 2)) || (y === 2 && x === 1))) c = 0xffa0a4;
      put(r, x + 1, y + 2, c);
    }
  });
  return outline(r, 0x07050a);
}
