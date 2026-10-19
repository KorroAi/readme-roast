// Preview the adaptive launcher icon under the four common launcher masks (circle, squircle,
// rounded square, teardrop), plus the themed (monochrome) icon and the legacy icon, and check
// that no pixel of the mark falls outside any mask.
//
// Usage: node tools/icon-masks.mjs [out.png]   (default artifacts/final-pass/icon-masks.png)
// Exit code 1 when a mask cuts the mark.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePng } from './png.mjs';
import { ADAPTIVE, renderComposite, renderIcon, renderLayer } from '../android/make-icon.mjs';

const out = process.argv[2] ?? 'artifacts/final-pass/icon-masks.png';
const LAYER = 432; // 108 dp at xxxhdpi
const VIS = Math.round((LAYER * ADAPTIVE.visibleDp) / ADAPTIVE.layerDp); // the 72 dp a launcher shows
const OFF = (LAYER - VIS) / 2;

/** Masks over the visible square, in coordinates u, v ∈ [-1, 1]. */
const rounded = (u, v, r) => {
  const qx = Math.max(0, Math.abs(u) - (1 - r)), qy = Math.max(0, Math.abs(v) - (1 - r));
  return Math.hypot(qx, qy) <= r;
};
const MASKS = {
  circle: (u, v) => u * u + v * v <= 1,
  squircle: (u, v) => u ** 4 + v ** 4 <= 1,
  'rounded square': (u, v) => rounded(u, v, 0.35),
  teardrop: (u, v) => rounded(u, v, u > 0 && v > 0 ? 0.3 : 1),
};

const composite = renderComposite(LAYER);
const fg = renderLayer('foreground', LAYER);
const mono = renderLayer('monochrome', LAYER);
const GAP = 24;
const TILE = VIS;
const tiles = Object.keys(MASKS).length + 2;
const W = GAP + tiles * (TILE + GAP);
const H = TILE + 2 * GAP;
const sheet = new Uint8Array(W * H * 4);
for (let i = 0; i < W * H; i++) sheet.set([46, 52, 60, 255], i * 4); // a mid-grey wallpaper

const put = (tx, x, y, rgba) => {
  const a = rgba[3] / 255;
  const o = ((GAP + y) * W + tx + x) * 4;
  for (let c = 0; c < 3; c++) sheet[o + c] = Math.round(rgba[c] * a + sheet[o + c] * (1 - a));
};
const px = (img, size, x, y) => [img[(y * size + x) * 4], img[(y * size + x) * 4 + 1], img[(y * size + x) * 4 + 2], img[(y * size + x) * 4 + 3]];

let failed = false;
let tx = GAP;
for (const [name, inside] of Object.entries(MASKS)) {
  let cut = 0;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const u = ((x + 0.5) / TILE) * 2 - 1, v = ((y + 0.5) / TILE) * 2 - 1;
      const lx = x + OFF, ly = y + OFF;
      if (inside(u, v)) put(tx, x, y, px(composite, LAYER, lx, ly));
      else if (px(fg, LAYER, lx, ly)[3] > 0) cut++;
    }
  // Mark pixels in the 18 dp bleed outside the visible square are cut by every mask.
  for (let y = 0; y < LAYER; y++)
    for (let x = 0; x < LAYER; x++) if ((x < OFF || y < OFF || x >= OFF + TILE || y >= OFF + TILE) && px(fg, LAYER, x, y)[3] > 0) cut++;
  console.log(`${cut === 0 ? 'PASS' : 'FAIL'} ${name}: ${cut} mark pixels outside the mask`);
  if (cut) failed = true;
  tx += TILE + GAP;
}
// Themed icon (API 33+): the launcher tints the monochrome layer; shown light-on-dark in a circle.
for (let y = 0; y < TILE; y++)
  for (let x = 0; x < TILE; x++) {
    const u = ((x + 0.5) / TILE) * 2 - 1, v = ((y + 0.5) / TILE) * 2 - 1;
    if (!MASKS.circle(u, v)) continue;
    put(tx, x, y, [32, 40, 52, 255]);
    const m = px(mono, LAYER, x + OFF, y + OFF);
    if (m[3] > 0) put(tx, x, y, [214, 228, 246, m[3]]);
  }
tx += TILE + GAP;
// Legacy icon (API 24-25 launchers), at its own size, centred in the tile.
const LEG = 192;
const legacy = renderIcon(LEG, true);
for (let y = 0; y < LEG; y++) for (let x = 0; x < LEG; x++) put(tx, x + (TILE - LEG) / 2, y + (TILE - LEG) / 2, px(legacy, LEG, x, y));

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, encodePng(W, H, sheet));
console.log(`wrote ${out} (${W}×${H}): ${Object.keys(MASKS).join(', ')}, themed, legacy`);
if (failed) process.exitCode = 1;
