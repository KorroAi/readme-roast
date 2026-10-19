// Procedural launcher art: a glowing cyan crystal (the diamond "O" of the logo) over the dark blue
// of the depths, with a warm lantern ember below. Pixel art on a 24-cell design grid, scaled by
// whole pixels per cell so every size stays crisp.
//
// One mark, several layouts:
// - Adaptive icon (API 26+): a full-bleed background layer, a transparent foreground layer and a
//   monochrome layer (themed icons, API 33+), each 108 dp. The whole mark sits inside the 66 dp
//   safe circle, so no launcher mask (circle, squircle, rounded square, teardrop) ever cuts it.
//   `node tools/icon-masks.mjs` previews all four.
// - Legacy icon (API 24-25 launchers): the old rounded-square composite, mark filling the tile.
// - Play icon: 512 × 512, opaque, full-bleed, the adaptive composite (what the launcher shows).
// - Splash logo: the mark alone, for the pre-API-31 layer-list window background.
// - Web app icons (vite.config.ts webApp()): the adaptive composite, so "maskable" is honest.
//
// W2 brand swaps in the emblem by replacing MARK (and BG_* below); every layout follows.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePng } from '../tools/png.mjs';

const N = 24; // design grid
/** The mark: RGB per cell, null where transparent. */
const MARK = new Array(N * N).fill(null);
const set = (x, y, c) => {
  if (x >= 0 && y >= 0 && x < N && y < N) MARK[y * N + x] = c;
};
// Crystal diamond with facets.
const CX = 11.5, CY = 10;
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const dx = Math.abs(x - CX), dy = Math.abs(y - CY);
    const m = dx / 6 + dy / 8.5;
    if (m > 1) continue;
    const left = x < CX, top = y < CY;
    let c = left ? (top ? [126, 238, 252] : [26, 144, 171]) : top ? [72, 214, 234] : [16, 97, 122];
    if (m > 0.86) c = [10, 58, 76];
    if (Math.abs(x - CX) < 0.6 && y < CY) c = [226, 255, 255];
    set(x, y, c);
  }
set(9, 5, [240, 255, 255]);
set(10, 4, [240, 255, 255]);
// Ember / lantern glow at the bottom.
for (let x = 9; x <= 14; x++) set(x, 20, [255, 179, 92]);
for (let x = 10; x <= 13; x++) set(x, 21, [255, 197, 138]);
set(11, 19, [255, 220, 170]);
set(12, 19, [255, 220, 170]);

/** Monochrome (themed icon) alpha per mark colour: light facets full, dark facets dimmer. */
const monoAlpha = (c) => {
  const l = 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  return l > 150 ? 255 : l > 90 ? 205 : 150;
};

/** Background glow around the crystal, per design cell (cells outside 0..23 continue the ramp). */
const BG_CENTER = [11.5, 10];
const bgCell = (gx, gy) => {
  const k = Math.max(0, 1 - Math.hypot(gx - BG_CENTER[0], gy - BG_CENTER[1]) / 16);
  return [Math.round(6 + 22 * k), Math.round(10 + 38 * k), Math.round(18 + 62 * k)];
};

// The mark's centre and radius (over every corner of every cell it covers), in design cells.
const MARK_BOUNDS = (() => {
  let x0 = N, y0 = N, x1 = 0, y1 = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (MARK[y * N + x]) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x + 1)), (y1 = Math.max(y1, y + 1));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let r = 0;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) if (MARK[y * N + x]) for (const [ax, ay] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) r = Math.max(r, Math.hypot(ax - cx, ay - cy));
  return { cx, cy, r };
})();

/** Adaptive icon geometry, as fractions of the 108 dp layer. */
export const ADAPTIVE = { layerDp: 108, visibleDp: 72, safeDp: 66 };

/**
 * A layout maps output pixels to design cells: `unit` whole pixels per cell, `ox`/`oy` the pixel
 * where cell 0 starts. `fit` is the radius (fraction of the size) the mark must stay inside.
 */
function layout(size, fit) {
  const unit = Math.max(1, Math.floor((fit * size) / MARK_BOUNDS.r));
  return { unit, ox: Math.round(size / 2 - MARK_BOUNDS.cx * unit), oy: Math.round(size / 2 - MARK_BOUNDS.cy * unit) };
}
// 3 % inside the safe circle, so pixel rounding never touches its edge.
const adaptiveLayout = (size) => layout(size, (ADAPTIVE.safeDp / 2 / ADAPTIVE.layerDp) * 0.97);

function render(size, lay, pixel) {
  const img = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const gx = Math.floor((x - lay.ox) / lay.unit), gy = Math.floor((y - lay.oy) / lay.unit);
      const mark = gx >= 0 && gy >= 0 && gx < N && gy < N ? MARK[gy * N + gx] : null;
      img.set(pixel(mark, gx, gy, x, y), (y * size + x) * 4);
    }
  return img;
}

const CLEAR = [0, 0, 0, 0];

/** One adaptive icon layer as RGBA8: 'background' (opaque), 'foreground' or 'monochrome' (alpha). */
export function renderLayer(kind, size) {
  const lay = adaptiveLayout(size);
  if (kind === 'background') return render(size, lay, (_m, gx, gy) => [...bgCell(gx, gy), 255]);
  if (kind === 'foreground') return render(size, lay, (m) => (m ? [...m, 255] : CLEAR));
  if (kind === 'monochrome') return render(size, lay, (m) => (m ? [255, 255, 255, monoAlpha(m)] : CLEAR));
  throw new Error(`unknown layer ${kind}`);
}

/** Background + foreground, full-bleed and opaque (the Play icon, web icons, mask previews). */
export function renderComposite(size) {
  return render(size, adaptiveLayout(size), (m, gx, gy) => [...(m ?? bgCell(gx, gy)), 255]);
}

/**
 * The icon at `size` px as RGBA8. `masked`: the legacy launcher icon (rounded-square tile, mark
 * filling it). Unmasked: the full-bleed adaptive composite (web app icons, which the platform
 * masks itself; the mark sits inside the maskable safe zone).
 */
export function renderIcon(size, masked = true) {
  if (!masked) return renderComposite(size);
  const lay = { unit: size / N, ox: 0, oy: 0 };
  return render(size, lay, (m, gx, gy, x, y) => {
    const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
    const inside = Math.hypot(Math.max(0, Math.abs(u) - 0.38), Math.max(0, Math.abs(v) - 0.38)) <= 0.1;
    return inside ? [...(m ?? bgCell(gx, gy)), 255] : CLEAR;
  });
}

/** The mark alone on transparency, filling `size` (splash logo). */
export function renderMark(size) {
  return render(size, layout(size, 0.48), (m) => (m ? [...m, 255] : CLEAR));
}

/** The icon at `size` px as PNG bytes (see renderIcon). */
export function iconPng(size, masked = true) {
  return encodePng(size, size, renderIcon(size, masked));
}

/** The 512 px Play Console icon: opaque, full-bleed (Play applies its own mask and shadow). */
export function playIconPng() {
  return encodePng(512, 512, renderComposite(512));
}

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

/**
 * Every generated Android resource, as { 'mipmap-hdpi/ic_launcher.png': bytes, ... }. The static
 * XML that uses them (mipmap-anydpi-v26/ic_launcher.xml, drawable/splash_background.xml) lives
 * in android/app/src/main/res.
 */
export function androidResources() {
  const files = {};
  for (const [name, k] of Object.entries(DENSITIES)) {
    const legacy = Math.round(48 * k), layer = Math.round(ADAPTIVE.layerDp * k), splash = Math.round(128 * k);
    files[`mipmap-${name}/ic_launcher.png`] = iconPng(legacy, true);
    for (const kind of ['background', 'foreground', 'monochrome']) files[`mipmap-${name}/ic_launcher_${kind}.png`] = encodePng(layer, layer, renderLayer(kind, layer));
    files[`drawable-${name}/splash_logo.png`] = encodePng(splash, splash, renderMark(splash));
  }
  return files;
}

// CLI (android/build-apk.sh, the Gradle generateIcons task):
//   node android/make-icon.mjs <res-out-dir> [--play <play-icon-512.png>]
if (process.argv[1] && process.argv[1].endsWith('make-icon.mjs')) {
  const args = process.argv.slice(2);
  const out = args[0] && !args[0].startsWith('--') ? args[0] : 'build/icon-res';
  for (const [rel, bytes] of Object.entries(androidResources())) {
    mkdirSync(dirname(`${out}/${rel}`), { recursive: true });
    writeFileSync(`${out}/${rel}`, bytes);
  }
  const play = args.indexOf('--play');
  if (play >= 0 && args[play + 1]) {
    mkdirSync(dirname(args[play + 1]), { recursive: true });
    writeFileSync(args[play + 1], playIconPng());
  }
  console.log('icons written to', out);
}
