import { writeFileSync, mkdirSync } from 'node:fs';
import { generateMaterials, MATERIAL_NAMES, BASE_LAYER_COUNT } from '../src/render/materials';
// @ts-expect-error - plain JS tool module
import { encodePng } from './png.mjs';

/**
 * Round 3 (VIS): the biome material sheet. Writes artifacts/r3/materials.png: every round 3 layer at
 * 2x (128 px = 8 m), in layer order, 8 per row, with its emissive mask (glow layers) as a thin strip
 * under it, and prints the names in grid order plus the paint time (all layers, and one stratum's).
 * Usage: node tools/run-ts.mjs tools/vis-materials.ts [first-layer]
 */
export default function visMaterials(args: string[]): void {
  const t0 = performance.now();
  const atlas = generateMaterials();
  const tAll = performance.now() - t0;
  const t1 = performance.now();
  generateMaterials({ biomes: ['amberHollows', 'mushroomForest'] });
  const tOne = performance.now() - t1;
  const first = Number(args[0] ?? BASE_LAYER_COUNT);
  const names = MATERIAL_NAMES.slice(first);
  const scale = 2;
  const cols = 8;
  const tile = 128 * scale;
  const cellW = tile + 6;
  const cellH = tile + 18;
  const rows = Math.ceil(names.length / cols);
  const W = cols * cellW;
  const H = rows * cellH;
  const out = new Uint8Array(W * H * 4);
  for (let i = 0; i < out.length; i += 4) {
    out[i] = 10;
    out[i + 1] = 12;
    out[i + 2] = 16;
    out[i + 3] = 255;
  }
  names.forEach((_, k) => {
    const layer = first + k;
    const ox = (k % cols) * cellW + 3;
    const oy = Math.floor(k / cols) * cellH + 3;
    for (let y = 0; y < tile; y++)
      for (let x = 0; x < tile; x++) {
        const src = (layer * 128 * 128 + Math.floor(x / scale) + Math.floor(y / scale) * 128) * 4;
        const o = ((oy + y) * W + ox + x) * 4;
        out[o] = atlas.data[src];
        out[o + 1] = atlas.data[src + 1];
        out[o + 2] = atlas.data[src + 2];
      }
    // Alpha strip (height or glow mask) under the tile, 10 px tall, from the tile's middle row.
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < tile; x++) {
        const src = (layer * 128 * 128 + Math.floor(x / scale) + (64 + y) * 128) * 4;
        const a = atlas.data[src + 3];
        const o = ((oy + tile + 3 + y) * W + ox + x) * 4;
        out[o] = a;
        out[o + 1] = a;
        out[o + 2] = a;
      }
  });
  mkdirSync('artifacts/r3', { recursive: true });
  writeFileSync('artifacts/r3/materials.png', encodePng(W, H, out));
  console.log(`layers ${MATERIAL_NAMES.length} (base ${BASE_LAYER_COUNT}); paint all ${Math.round(tAll)} ms, stratum I only ${Math.round(tOne)} ms`);
  for (let r = 0; r < rows; r++) console.log(`row ${r}: ${names.slice(r * cols, r * cols + cols).join(', ')}`);
}
