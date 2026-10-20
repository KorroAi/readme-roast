import type { ItemId } from '../config/items';
import type { EquipmentSlot } from '../config/recipes';
import { heartSprite, itemRaster, LANTERN_ROWS, outline, PICKAXE_ROWS, scaleNearest, sprite, STURDY_PACK_ROWS, TINY_PACK_ROWS, type Palette, type Raster } from './sprites';

// Item, equipment and heart icons as cached PNG data URLs, drawn from the pixel sprites in
// sprites.ts (specimens, not blocks). Ask for the size in device pixels for crisp results.

const cache = new Map<string, string>();

function toDataUrl(r: Raster): string {
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

function cached(key: string, build: () => Raster): string {
  let url = cache.get(key);
  if (url === undefined) {
    url = toDataUrl(build());
    cache.set(key, url);
  }
  return url;
}

const spriteIcon = (rows: readonly string[], palette: Palette, size: number) => scaleNearest(outline(sprite(rows, palette)), size);

/** Device pixel size for an icon shown at `cssPx`, so it maps texel-to-pixel crisply. */
export const iconPx = (cssPx: number): number => Math.round(cssPx * Math.min(3, Math.max(1, globalThis.devicePixelRatio || 1)));

/** An item's icon by id (an unknown id gets the fallback pebble, never an error). */
export function itemIconDataUrl(item: ItemId, size = 64): string {
  return cached(`item:${item}:${size}`, () => itemRaster(item, size));
}

// Equipment palettes per tier: tier 1 is the worn starter kit, tier 2 the copper upgrade.
const PICKAXE_PALETTES: Palette[] = [
  { L: 0xb2a597, H: 0x7d6a5a, D: 0x4a3d35, W: 0x8a6440, w: 0x5a3f28 },
  { L: 0xffc58e, H: 0xdb8547, D: 0x8a4322, W: 0x9a7048, w: 0x5a3f28 },
];
const LANTERN_PALETTES: Palette[] = [
  { M: 0x5b5048, H: 0x857868, D: 0x2e2722, g: 0x8a5a2a, Y: 0xe09a4a, W: 0xffd9a0 },
  { M: 0xa9582a, H: 0xdb8547, D: 0x5a2c14, g: 0xb07a3a, Y: 0xffb35c, W: 0xfff0d0 },
];
const PACK_PALETTES: Palette[] = [
  { D: 0x4a3221, R: 0xcdbb98, r: 0x9c8a6a, B: 0x7a5536, L: 0x4f3622, P: 0x6b4a2f, K: 0x3d291a, b: 0x3d291a },
  { D: 0x3d291a, R: 0xd8c7a4, r: 0xa4916f, B: 0x6b4a2f, L: 0x3d291a, P: 0x5a3f28, K: 0xdba84a, b: 0x2e2117 },
];

export function equipmentIconDataUrl(slot: EquipmentSlot, tier: number, size = 64): string {
  const i = Math.max(0, Math.min(1, tier - 1));
  return cached(`equip:${slot}:${i}:${size}`, () => {
    if (slot === 'pickaxe') return spriteIcon(PICKAXE_ROWS, PICKAXE_PALETTES[i], size);
    if (slot === 'lantern') return spriteIcon(LANTERN_ROWS, LANTERN_PALETTES[i], size);
    return spriteIcon(i === 0 ? TINY_PACK_ROWS : STURDY_PACK_ROWS, PACK_PALETTES[i], size);
  });
}

/** Heart at native resolution (11x11); scale it with CSS image-rendering: pixelated. */
export function heartDataUrl(fill: 0 | 1 | 2): string {
  return cached(`heart:${fill}`, () => heartSprite(fill));
}
