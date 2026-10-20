// Procedural launcher art: the DEEP DOWN emblem (a lintel segment with the builders' lantern rune
// hanging from it: cyan ink, an amber flame inside) over the warm dark of the depths. The
// geometry is src/ui/brand/emblem.mjs, the same polygons the wordmark, the boot mark and the
// favicon are drawn from; this file rasterizes them (4 x 4 supersampled scanline fill).
//
// One mark, several layouts:
// - Adaptive icon (API 26+): a full-bleed background layer, a transparent foreground layer and a
//   monochrome layer (themed icons, API 33+), each 108 dp. The whole mark sits inside the 66 dp
//   safe circle, so no launcher mask (circle, squircle, rounded square, teardrop) ever cuts it.
//   `node tools/icon-masks.mjs` previews all four.
// - Legacy icon (API 24-25 launchers): a rounded-square tile, the mark filling it.
// - Play icon: 512 x 512, opaque, full-bleed, the adaptive composite (what the launcher shows).
// - Splash logo: the mark alone, for the pre-API-31 layer-list window background.
// - Web app icons (vite.config.ts webApp()): the tile ("any") and the adaptive composite
//   ("maskable": the mark inside the safe zone).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { encodePng } from '../tools/png.mjs';
import { emblemLayers, flameCenter, PALETTE, ringOuter } from '../src/ui/brand/emblem.mjs';

const SS = 4; // supersamples per axis
const LAYERS = emblemLayers(0.3);

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** A paint as a function of unit coordinates -> [r, g, b]. */
function painter(paint) {
  if (paint.solid) {
    const c = hex(paint.solid);
    return () => c;
  }
  const [x0, y0, x1, y1, stops] = paint.linear;
  const s = stops.map(([o, c]) => [o, hex(c)]);
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy || 1;
  return (u, v) => {
    const t = Math.max(0, Math.min(1, ((u - x0) * dx + (v - y0) * dy) / len2));
    for (let i = 1; i < s.length; i++) if (t <= s[i][0]) return mix(s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0] || 1));
    return s[s.length - 1][1];
  };
}

const PREPARED = LAYERS.map((l) => {
  const edges = [];
  let y0 = Infinity, y1 = -Infinity;
  for (const c of l.contours)
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      if (a[1] === b[1]) continue;
      edges.push([a[0], a[1], b[0], b[1], b[1] > a[1] ? 1 : -1]);
      y0 = Math.min(y0, a[1], b[1]);
      y1 = Math.max(y1, a[1], b[1]);
    }
  return { ...l, edges, y0, y1, paint: painter(l.paint) };
});

/** Inside spans [xa, xb] of a layer on the horizontal line v (unit coordinates). */
function spans(layer, v) {
  if (v < layer.y0 || v >= layer.y1) return [];
  const xs = [];
  for (const [ax, ay, bx, by, dir] of layer.edges) {
    if ((v >= ay && v < by) || (v >= by && v < ay)) xs.push([ax + ((v - ay) * (bx - ax)) / (by - ay), dir]);
  }
  xs.sort((p, q) => p[0] - q[0]);
  const evenodd = layer.rule === 'evenodd';
  const inside = (n) => (evenodd ? (n & 1) === 1 : n !== 0);
  const out = [];
  let w = 0;
  for (const [x, dir] of xs) {
    const was = inside(w);
    w += evenodd ? 1 : dir;
    const now = inside(w);
    if (!was && now) out.push([x, Infinity]);
    else if (was && !now) out[out.length - 1][1] = x;
  }
  return out;
}

/** The emblem's centre and radius (over every vertex), units: what a layout must fit. */
const FIT = (() => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const l of LAYERS) for (const c of l.contours) for (const [x, y] of c) (x0 = Math.min(x0, x)), (y0 = Math.min(y0, y)), (x1 = Math.max(x1, x)), (y1 = Math.max(y1, y));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  let r = 0;
  for (const l of LAYERS) for (const c of l.contours) for (const [x, y] of c) r = Math.max(r, Math.hypot(x - cx, y - cy));
  return { cx, cy, r };
})();

/** Adaptive icon geometry, as fractions of the 108 dp layer. */
export const ADAPTIVE = { layerDp: 108, visibleDp: 72, safeDp: 66 };

/** A layout maps pixels to units: `k` px per unit, the unit origin at pixel (ox, oy). */
function layout(size, fit) {
  const k = (fit * size) / FIT.r;
  return { k, ox: size / 2 - FIT.cx * k, oy: size / 2 - FIT.cy * k };
}
// 3 % inside the safe circle, so anti-aliasing never touches its edge.
const adaptiveLayout = (size) => layout(size, (ADAPTIVE.safeDp / 2 / ADAPTIVE.layerDp) * 0.97);

/**
 * Rasterize the emblem: per pixel, the average over SS x SS samples of the topmost layer's paint.
 * `keep(role)` picks which layers count (the monochrome silhouette drops the carved outlines).
 * Returns colour sums and coverage per pixel.
 */
function rasterEmblem(size, lay, keep = () => true) {
  const col = new Float32Array(size * size * 3);
  const cov = new Float32Array(size * size);
  const layers = PREPARED;
  for (let py = 0; py < size; py++) {
    for (let sj = 0; sj < SS; sj++) {
      const sy = py + (sj + 0.5) / SS;
      const v = (sy - lay.oy) / lay.k;
      const rows = layers.map((l) => spans(l, v));
      if (rows.every((r) => !r.length)) continue;
      for (let px = 0; px < size; px++) {
        for (let si = 0; si < SS; si++) {
          const u = (px + (si + 0.5) / SS - lay.ox) / lay.k;
          let top = -1;
          for (let li = layers.length - 1; li >= 0; li--) {
            const r = rows[li];
            let hit = false;
            for (let k = 0; k < r.length; k++) if (u >= r[k][0] && u < r[k][1]) {
              hit = true;
              break;
            }
            if (hit) {
              top = li;
              break;
            }
          }
          if (top < 0 || !keep(layers[top].role)) continue;
          const c = layers[top].paint(u, v);
          const o = py * size + px;
          col[o * 3] += c[0];
          col[o * 3 + 1] += c[1];
          col[o * 3 + 2] += c[2];
          cov[o] += 1;
        }
      }
    }
  }
  return { col, cov, n: SS * SS };
}

/** The background: deep slate, warmed around the lantern (per pixel, unit coordinates). */
function background(lay) {
  const [fx, fy] = flameCenter();
  const center = hex(PALETTE.bgCenter), edge = hex(PALETTE.bgEdge), glow = hex(PALETTE.glow);
  const R = ringOuter();
  return (px, py) => {
    const u = (px + 0.5 - lay.ox) / lay.k, v = (py + 0.5 - lay.oy) / lay.k;
    const d = Math.hypot(u - fx, v - fy);
    const base = mix(center, edge, Math.min(1, d / (R * 5.2)));
    const g = Math.max(0, 1 - d / (R * 3.1));
    return mix(base, glow, 0.5 * g * g);
  };
}

function compose(size, lay, bg, keep, mono) {
  const { col, cov, n } = rasterEmblem(size, lay, keep);
  const img = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const a = cov[i] / n;
    const px = i % size, py = (i / size) | 0;
    if (mono) {
      img.set([255, 255, 255, Math.round(a * 255)], i * 4);
      continue;
    }
    const fg = cov[i] ? [col[i * 3] / cov[i], col[i * 3 + 1] / cov[i], col[i * 3 + 2] / cov[i]] : [0, 0, 0];
    if (bg) {
      const b = bg(px, py);
      const c = mix(b, fg, a);
      img.set([Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255], i * 4);
    } else img.set([Math.round(fg[0]), Math.round(fg[1]), Math.round(fg[2]), Math.round(a * 255)], i * 4);
  }
  return img;
}

/** One adaptive icon layer as RGBA8: 'background' (opaque), 'foreground' or 'monochrome' (alpha). */
export function renderLayer(kind, size) {
  const lay = adaptiveLayout(size);
  if (kind === 'background') {
    const bg = background(lay);
    const img = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) img.set([...bg(x, y).map(Math.round), 255], (y * size + x) * 4);
    return img;
  }
  if (kind === 'foreground') return compose(size, lay, null, () => true, false);
  if (kind === 'monochrome') return compose(size, lay, null, (role) => role !== 'carve', true);
  throw new Error(`unknown layer ${kind}`);
}

/** Background + foreground, full-bleed and opaque (the Play icon, maskable web icons, mask previews). */
export function renderComposite(size) {
  const lay = adaptiveLayout(size);
  return compose(size, lay, background(lay), () => true, false);
}

/**
 * The icon at `size` px as RGBA8. `masked`: the legacy launcher icon (rounded-square tile, mark
 * filling it). Unmasked: the full-bleed adaptive composite (web app "maskable" icons, which the
 * platform masks itself; the mark sits inside the safe zone).
 */
export function renderIcon(size, masked = true) {
  if (!masked) return renderComposite(size);
  const lay = layout(size, 0.45);
  const img = compose(size, lay, background(lay), () => true, false);
  // Rounded-square tile with an anti-aliased edge.
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5, v = (y + 0.5) / size - 0.5;
      const d = Math.hypot(Math.max(0, Math.abs(u) - 0.38), Math.max(0, Math.abs(v) - 0.38)) - 0.1;
      const a = Math.max(0, Math.min(1, 0.5 - d * size));
      img[(y * size + x) * 4 + 3] = Math.round(img[(y * size + x) * 4 + 3] * a);
    }
  return img;
}

/** The mark alone on transparency, filling `size` (splash logo). */
export function renderMark(size) {
  return compose(size, layout(size, 0.48), null, () => true, false);
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
