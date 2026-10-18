// Procedural launcher icon: a glowing cyan crystal (the diamond "O" of the logo) over the
// dark blue of the depths, with a warm lantern ember below. Pixel art, upscaled crisply.
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodePng } from '../tools/png.mjs';

const out = process.argv[2] ?? 'build/icon-res';
const N = 24; // design grid
const px = new Array(N * N).fill(null).map(() => [0, 0, 0, 255]);
const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = [...c, 255]; };
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const d = Math.hypot(x - 11.5, y - 10) / 16;
    const k = Math.max(0, 1 - d);
    set(x, y, [Math.round(6 + 22 * k), Math.round(10 + 38 * k), Math.round(18 + 62 * k)]);
  }
// Crystal diamond with facets.
const cx = 11.5, cy = 10;
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    const m = dx / 6 + dy / 8.5;
    if (m > 1) continue;
    const left = x < cx, top = y < cy;
    let c = left ? (top ? [126, 238, 252] : [26, 144, 171]) : top ? [72, 214, 234] : [16, 97, 122];
    if (m > 0.86) c = [10, 58, 76];
    if (Math.abs(x - cx) < 0.6 && y < cy) c = [226, 255, 255];
    set(x, y, c);
  }
set(9, 5, [240, 255, 255]); set(10, 4, [240, 255, 255]);
// Ember / lantern glow at the bottom.
for (let x = 9; x <= 14; x++) set(x, 20, [255, 179, 92]);
for (let x = 10; x <= 13; x++) set(x, 21, [255, 197, 138]);
set(11, 19, [255, 220, 170]); set(12, 19, [255, 220, 170]);

const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [name, size] of Object.entries(sizes)) {
  const img = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const s = px[Math.floor((y / size) * N) * N + Math.floor((x / size) * N)];
      // Rounded-square mask for legacy launchers.
      const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
      const r = 0.42, corner = Math.max(0, Math.abs(u) - (0.5 - 0.08 - r * 0)) ;
      const inside = Math.hypot(Math.max(0, Math.abs(u) - 0.38), Math.max(0, Math.abs(v) - 0.38)) <= 0.1;
      const o = (y * size + x) * 4;
      img.set(inside ? s : [0, 0, 0, 0], o);
      void corner;
    }
  mkdirSync(`${out}/mipmap-${name}`, { recursive: true });
  writeFileSync(`${out}/mipmap-${name}/ic_launcher.png`, encodePng(size, size, img));
}
console.log('icons written to', out);
