import { ITEMS } from '../config/items';

// Pure pixel rasterizers for UI icons (no DOM): small hand-authored 16 x 16 pixel sprites,
// "specimens" lit from the top left. icons.ts turns the buffers into cached data URLs.

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

/** The builders' marks (7 x 7, '#' ink, 'o' the Lantern's flame), after the in-game rune glyphs. */
export const RUNE_MARKS: Record<string, readonly string[]> = {
  runeDescent: ['...#...', '..#.#..', '.#.#.#.', '...#...', '...#...', '..###..', '#######'],
  runeEye: ['...#...', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '...#...'],
  runeStar: ['...#...', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '...#...'],
  runeSpire: ['...#...', '..#.#..', '..#.#..', '.#####.', '.#...#.', '#.....#', '#######'],
  runeGate: ['#######', '#..#..#', '#.....#', '#..#..#', '#..#..#', '#..#..#', '#..#..#'],
  runeWaves: ['.......', '.#...#.', '#.#.#.#', '.......', '.#...#.', '#.#.#.#', '.......'],
  runeChasm: ['#.....#', '#.#...#', '#..#..#', '#...#.#', '#..#..#', '#.#...#', '#.....#'],
  ancientTablet: ['...#...', '...#...', '..#.#..', '.#.o.#.', '..#.#..', '...#...', '..###..'],
};

/** Cut a 7 x 7 mark into a 16 x 16 base at (x0, y0): ink 'G', a dark lip below-right 'g'. */
export function carveMark(base: readonly string[], mark: readonly string[], x0: number, y0: number, on = 'S'): string[] {
  const rows = base.map((r) => r.split(''));
  mark.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) {
      const c = line[x];
      if (c === '.') continue;
      const ty = y0 + y;
      const tx = x0 + x;
      const lip = rows[ty + 1]?.[tx + 1];
      if (lip === on && mark[y + 1]?.[x + 1] !== '#') rows[ty + 1][tx + 1] = 'g';
      rows[ty][tx] = c === 'o' ? 'o' : 'G';
    }
  });
  return rows.map((r) => r.join(''));
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

/** The Ancient Tablet (the Lantern rune): a dressed slab, the diamond on its stem cut in cyan. */
export const TABLET_ROWS = carveMark(
  [
    '................',
    '....SSSSSSSS....',
    '...SLLLLLLLLS...',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SLssssssssS..',
    '...SDDDDDDDDDS..',
    '....DDDDDDDDD...',
    '................',
    '................',
  ],
  RUNE_MARKS.ancientTablet,
  5,
  3,
  's',
);
export const TABLET_PALETTE: Palette = { S: 0x2a2f3a, L: 0x6a7384, s: 0x4b5260, G: 0x8fe3ee, g: 0x24303a, o: 0xffc785, D: 0x1b1e25 };

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

// ---------------------------------------------------------------------------------------
// Specimens: every material as the thing itself, not a block (no isometric cubes).

/** Stone: a flake of slate, its laminations showing on the broken face. */
export const SLATE_FLAKE_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '........HHHH....',
  '.....HHHLLLLH...',
  '..HHHLLLLLLLLM..',
  '.HLLLLLLLLLMMM..',
  '.DMMLLLLLMMMMd..',
  '.dDDMMMMMMMMdd..',
  '..ddDDDDMMddd...',
  '....dddddddd....',
  '................',
  '................',
  '................',
  '................',
]
export const SLATE_FLAKE_PALETTE: Palette = { H: 0xc4ccd6, L: 0x9aa6b6, M: 0x76839a, D: 0x4a5566, d: 0x323a47 };

/** Root fibre: a coiled hank, tied, with two loose ends. */
export const ROOT_COIL_ROWS = [
  '................',
  '.....DMMMMD.....',
  '...DMLLLLLLMD...',
  '..DMLD....DLMD..',
  '..MLD......DLM..',
  '.DML........LMD.',
  '.MLD........DLM.',
  '.MLD...TT...DLM.',
  '.DML..TttT..LMD.',
  '..MLD.TttT.DLM..',
  '..DMLLLTTLLLMD..',
  '...DDMMMMMMDD...',
  '.....DDDDDD.....',
  '....M......M....',
  '...D........D...',
  '................',
];
export const ROOT_COIL_PALETTE: Palette = { L: 0xd8c08f, M: 0xb0925f, D: 0x6e5434, T: 0x9a6a3a, t: 0x5e3e22 };

/** Copper ore: a lump of rock with copper glints and a fleck of verdigris. */
export const COPPER_LUMP_ROWS = [
  '................',
  '................',
  '.....hhhRR......',
  '...hhRRRRRRr....',
  '..hRRCCRRRRRr...',
  '..hRCGCcRRVRr...',
  '.hRRcCcRRRVVr...',
  '.hRRRRRRRCCRr...',
  '.RRRVRRRCGCcr...',
  '.RRRRRRRcCcRr...',
  '.rRRRCCRRRRrr...',
  '..rRCGcRRRrr....',
  '..rrRcRRrrr.....',
  '....rrrrr.......',
  '................',
  '................',
];
export const COPPER_LUMP_PALETTE: Palette = { h: 0x8a7a70, R: 0x5c4c45, r: 0x3a2e2a, C: 0xe0874a, c: 0xa3552a, G: 0xffd2a0, V: 0x7fc9a2 };

/** Iron ore: a dark, heavy lump with a jasper streak and a cold glint. */
export const IRON_LUMP_ROWS = [
  '................',
  '................',
  '......hhhM......',
  '....hhMMMMMd....',
  '...hMMMMMMMMd...',
  '..hMMJjMMMMMd...',
  '..MMMMJJjMMMdd..',
  '.hMMMMMMJJjMMd..',
  '.MMgMMMMMMJJjd..',
  '.MMMMMMMMMMMJd..',
  '.dMMMMMgMMMMdd..',
  '..dMMMMMMMMdd...',
  '...ddMMMMddd....',
  '.....dddd.......',
  '................',
  '................',
];
export const IRON_LUMP_PALETTE: Palette = { h: 0x737884, M: 0x454952, d: 0x2b2e35, J: 0xc0583e, j: 0x7e3324, g: 0xd9dde6 };

/** Echo shard: pale, almost white crystal, a tall prism and a small one beside it. */
export const ECHO_SHARD_ROWS = [
  '................',
  '.......W........',
  '......WLC.......',
  '......WLC.......',
  '.....WLLCD......',
  '.....WLLCD......',
  '....WLLLCD......',
  '....WLLCCD..W...',
  '....WLLCCD.WLC..',
  '....LLLCCD.WLCD.',
  '....LLLCDD.LLCD.',
  '.....LLCD..LCD..',
  '.....LCDD..LD...',
  '......DD...D....',
  '................',
  '................',
];
export const ECHO_SHARD_PALETTE: Palette = { W: 0xffffff, L: 0xe4f8fa, C: 0xb6e6ec, D: 0x6fa9b5 };

/** A rune stone: a river-smooth stone; each rune's mark is cut into it in cyan (runeStone()). */
export const RUNE_STONE_ROWS = [
  '................',
  '.....LLLLLS.....',
  '...LLSSSSSSSs...',
  '..LSSSSSSSSSSs..',
  '..LSSSSSSSSSSs..',
  '.LSSSSSSSSSSSss.',
  '.LSSSSSSSSSSSss.',
  '.LSSSSSSSSSSSss.',
  '.LSSSSSSSSSSSss.',
  '.SSSSSSSSSSSSss.',
  '.SSSSSSSSSSSsss.',
  '..SSSSSSSSSSss..',
  '..sSSSSSSSSsss..',
  '...sssSSSssss...',
  '.....sssssss....',
  '................',
];
export const RUNE_STONE_PALETTE: Palette = { L: 0x6a7484, S: 0x414a58, s: 0x2a303a, G: 0x8fe3ee, g: 0x1f6f7e, o: 0xffc785 };



/** Fallback for an item without its own sprite: a plain pebble in the item's colour. */
export const PEBBLE_ROWS = [
  '................',
  '................',
  '................',
  '................',
  '......HHMM......',
  '....HHMMMMMD....',
  '...HMMMMMMMMD...',
  '...MMMMMMMMMD...',
  '..HMMMMMMMMMDD..',
  '..MMMMMMMMMMDD..',
  '...MMMMMMMMDD...',
  '....DDMMMMDD....',
  '......DDDD......',
  '................',
  '................',
  '................',
];

const shade = (rgb: number, k: number) => {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (c((rgb >> 16) & 255) << 16) | (c((rgb >> 8) & 255) << 8) | c(rgb & 255);
};
export const pebblePalette = (rgb: number): Palette => ({ H: shade(rgb, 1.3), M: rgb, D: shade(rgb, 0.55) });

/** Sprite and palette per item id (the key items without their own art use the tablet). */
export const SPECIMENS: Record<string, { rows: readonly string[]; palette: Palette }> = {
  stone: { rows: SLATE_FLAKE_ROWS, palette: SLATE_FLAKE_PALETTE },
  rootFibre: { rows: ROOT_COIL_ROWS, palette: ROOT_COIL_PALETTE },
  copperOre: { rows: COPPER_LUMP_ROWS, palette: COPPER_LUMP_PALETTE },
  ironOre: { rows: IRON_LUMP_ROWS, palette: IRON_LUMP_PALETTE },
  echoShard: { rows: ECHO_SHARD_ROWS, palette: ECHO_SHARD_PALETTE },
};

/**
 * The icon for an item id at `size` px: its specimen sprite, the shard or tablet art, a rune stone
 * for the seven runes, or (for an id without art) a pebble in the item's colour.
 */
export function itemRaster(id: string, size: number): Raster {
  const own = SPECIMENS[id];
  const def = (ITEMS as Record<string, { icon: { kind: string }; color: number; keyItem: boolean } | undefined>)[id];
  let rows: readonly string[];
  let palette: Palette;
  if (own) ({ rows, palette } = own);
  else if (RUNE_MARKS[id] && id !== 'ancientTablet') [rows, palette] = [carveMark(RUNE_STONE_ROWS, RUNE_MARKS[id], 4, 4), RUNE_STONE_PALETTE];
  else if (id.startsWith('rune')) [rows, palette] = [RUNE_STONE_ROWS, RUNE_STONE_PALETTE];
  else if (def?.icon.kind === 'shard') [rows, palette] = [SHARD_ROWS, SHARD_PALETTE];
  else if (def?.icon.kind === 'tablet') [rows, palette] = [TABLET_ROWS, TABLET_PALETTE];
  else [rows, palette] = [PEBBLE_ROWS, pebblePalette(def?.color ?? 0x8a95a8)];
  return scaleNearest(outline(sprite(rows, palette)), size);
}

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
      let c = lit ? (edge ? 0xb2322a : 0xff6b5e) : edge ? 0x1d1418 : 0x33232a;
      if (lit && ((y === 1 && (x === 1 || x === 2)) || (y === 2 && x === 1))) c = 0xffc2b8;
      put(r, x + 1, y + 2, c);
    }
  });
  return outline(r, 0x07050a);
}
