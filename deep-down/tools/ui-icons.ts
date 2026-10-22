// UI tool (round 3): a contact sheet of every item icon (ui/sprites itemRaster) at 48 px, in
// ITEM_IDS order, 10 per row, on the menus' dark panel tone. Run: node tools/run-ts.mjs tools/ui-icons.ts [out.png]
import { writeFileSync } from 'node:fs';
import { ITEM_IDS } from '../src/config/items';
import { itemRaster } from '../src/ui/sprites';
// @ts-expect-error a plain .mjs helper
import { encodePng } from './png.mjs';

export default function main(args: string[]): void {
  const out = args[0] ?? 'artifacts/r3/ui/icons.png';
  const px = 48;
  const gap = 10;
  const cols = 10;
  const rows = Math.ceil(ITEM_IDS.length / cols);
  const w = cols * (px + gap) + gap;
  const h = rows * (px + gap) + gap;
  const img = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    img[i * 4] = 18;
    img[i * 4 + 1] = 20;
    img[i * 4 + 2] = 26;
    img[i * 4 + 3] = 255;
  }
  ITEM_IDS.forEach((id, n) => {
    const r = itemRaster(id, px);
    const ox = gap + (n % cols) * (px + gap);
    const oy = gap + Math.floor(n / cols) * (px + gap);
    for (let y = 0; y < px; y++)
      for (let x = 0; x < px; x++) {
        const si = (x + y * px) * 4;
        const a = r.data[si + 3] / 255;
        const di = (ox + x + (oy + y) * w) * 4;
        for (let c = 0; c < 3; c++) img[di + c] = Math.round(img[di + c] * (1 - a) + r.data[si + c] * a);
      }
  });
  writeFileSync(out, encodePng(w, h, img));
  console.log(`${ITEM_IDS.length} icons -> ${out}`);
  for (let r = 0; r < rows; r++) console.log(`row ${r + 1}: ${ITEM_IDS.slice(r * cols, r * cols + cols).join(' ')}`);
}
