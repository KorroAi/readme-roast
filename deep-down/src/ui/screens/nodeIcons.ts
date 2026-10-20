import type { NodeResult } from '../types';
import {
  BOOTS_PALETTE,
  BOOTS_ROWS,
  COAT_PALETTE,
  COAT_ROWS,
  FORGE_PALETTE,
  FORGE_ROWS,
  LANTERN_ROWS,
  outline,
  PICKAXE_ROWS,
  scaleNearest,
  SHELF_PALETTE,
  SHELF_ROWS,
  sprite,
  STURDY_PACK_ROWS,
  TABLE_PALETTE,
  TABLE_ROWS,
  TINY_PACK_ROWS,
  type Palette,
  type Raster,
} from '../sprites';

// Icons for the upgrade tree's nodes: every equipment tier, the gear and the camp stations,
// drawn from the pixel sprites in sprites.ts and cached as PNG data URLs.

const PICKAXE: Palette[] = [
  { L: 0xb2a597, H: 0x7d6a5a, D: 0x4a3d35, W: 0x8a6440, w: 0x5a3f28 }, // rusty
  { L: 0xffc58e, H: 0xdb8547, D: 0x8a4322, W: 0x9a7048, w: 0x5a3f28 }, // copper
  { L: 0xe6e9ef, H: 0x9aa2b0, D: 0x454b57, W: 0x8a6440, w: 0x4a3322 }, // iron
  { L: 0xe2ffff, H: 0x7eeefc, D: 0x10617a, W: 0x6b4a2f, w: 0x3d291a }, // glimmer-edged
];
const LANTERN: Palette[] = [
  { M: 0x5b5048, H: 0x857868, D: 0x2e2722, g: 0x8a5a2a, Y: 0xe09a4a, W: 0xffd9a0 }, // oil
  { M: 0xa9582a, H: 0xdb8547, D: 0x5a2c14, g: 0xb07a3a, Y: 0xffb35c, W: 0xfff0d0 }, // copper
  { M: 0xb0823f, H: 0xe2b673, D: 0x5e4220, g: 0x8fe3ee, Y: 0xd8722a, W: 0xffd29a }, // attuned: rune bands
];
const PACK: Palette[] = [
  { D: 0x4a3221, R: 0xcdbb98, r: 0x9c8a6a, B: 0x7a5536, L: 0x4f3622, P: 0x6b4a2f, K: 0x3d291a, b: 0x3d291a }, // tiny
  { D: 0x3d291a, R: 0xd8c7a4, r: 0xa4916f, B: 0x6b4a2f, L: 0x3d291a, P: 0x5a3f28, K: 0xdba84a, b: 0x2e2117 }, // sturdy
  { D: 0x1d2420, R: 0xc9bfae, r: 0x948b7d, B: 0x4f5e50, L: 0x2e3a30, P: 0x6b4a2f, K: 0x8fe3ee, b: 0x1d2420 }, // expedition: the sealed pouch
];

const cache = new Map<string, string>();

function dataUrl(r: Raster): string {
  const canvas = document.createElement('canvas');
  canvas.width = r.size;
  canvas.height = r.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const img = ctx.createImageData(r.size, r.size);
  img.data.set(r.data);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

/** The sprite and palette for a node result. */
export function nodeArt(result: NodeResult): { rows: readonly string[]; palette: Palette } {
  if (result.kind === 'equip') {
    const i = Math.max(0, result.tier - 1);
    if (result.slot === 'pickaxe') return { rows: PICKAXE_ROWS, palette: PICKAXE[Math.min(i, PICKAXE.length - 1)] };
    if (result.slot === 'lantern') return { rows: LANTERN_ROWS, palette: LANTERN[Math.min(i, LANTERN.length - 1)] };
    return { rows: i === 0 ? TINY_PACK_ROWS : STURDY_PACK_ROWS, palette: PACK[Math.min(i, PACK.length - 1)] };
  }
  if (result.kind === 'gear') return result.gear === 'gripBoots' ? { rows: BOOTS_ROWS, palette: BOOTS_PALETTE } : { rows: COAT_ROWS, palette: COAT_PALETTE };
  if (result.station === 'surveyTable') return { rows: TABLE_ROWS, palette: TABLE_PALETTE };
  if (result.station === 'forge') return { rows: FORGE_ROWS, palette: FORGE_PALETTE };
  return { rows: SHELF_ROWS, palette: SHELF_PALETTE };
}

/** A node's icon at `size` device pixels. */
export function nodeIconDataUrl(result: NodeResult, size: number): string {
  const key = `${JSON.stringify(result)}:${size}`;
  let url = cache.get(key);
  if (url === undefined) {
    const art = nodeArt(result);
    url = dataUrl(scaleNearest(outline(sprite(art.rows, art.palette)), size));
    cache.set(key, url);
  }
  return url;
}
