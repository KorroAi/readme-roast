import { writeFileSync, mkdirSync } from 'node:fs';
import { generateTiles } from '../src/render/textures';
import { TILE_NAMES } from '../src/config/tiles';
// @ts-expect-error - plain JS tool module
import { encodePng } from './png.mjs';

/** Writes artifacts/tiles.png: every tile at 8x, plus an emissive-mask row underneath. */
export default function dumpTiles(): void {
  const atlas = generateTiles();
  const scale = 8;
  const cols = 8;
  const rows = Math.ceil(TILE_NAMES.length / cols);
  const cell = 16 * scale + 8;
  const W = cols * cell;
  const H = rows * cell * 2;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = 12; out[i + 1] = 14; out[i + 2] = 18; out[i + 3] = 255; }
  TILE_NAMES.forEach((_, layer) => {
    const cx = (layer % cols) * cell + 4;
    const cy = Math.floor(layer / cols) * cell * 2 + 4;
    for (let y = 0; y < 16 * scale; y++)
      for (let x = 0; x < 16 * scale; x++) {
        const src = layer * 1024 + (Math.floor(x / scale) + Math.floor(y / scale) * 16) * 4;
        const o = ((cy + y) * W + cx + x) * 4;
        out[o] = atlas.data[src]; out[o + 1] = atlas.data[src + 1]; out[o + 2] = atlas.data[src + 2];
        const a = atlas.data[src + 3];
        const o2 = ((cy + cell + y) * W + cx + x) * 4;
        out[o2] = a; out[o2 + 1] = a; out[o2 + 2] = a;
      }
  });
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/tiles.png', encodePng(W, H, out));
  console.log('wrote artifacts/tiles.png', W, H, TILE_NAMES.join(','));
}
