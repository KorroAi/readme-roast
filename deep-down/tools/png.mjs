// Minimal PNG encoder (RGBA8) for tooling. No dependencies.
import zlib, { deflateSync } from 'node:zlib';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Decode an 8-bit RGB or RGBA, non-interlaced PNG (what Playwright and Chromium write) to RGBA8. */
export function decodePng(buf) {
  const { inflateSync } = zlib;
  let p = 8;
  let width = 0;
  let height = 0;
  let type = 6;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const t = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (t === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || data[12] !== 0) throw new Error('decodePng: 8-bit non-interlaced only');
      type = data[9];
    } else if (t === 'IDAT') idat.push(data);
    else if (t === 'IEND') break;
    p += 12 + len;
  }
  const bpp = type === 6 ? 4 : type === 2 ? 3 : 0;
  if (!bpp) throw new Error(`decodePng: colour type ${type} not supported`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      out[o] = cur[x * bpp];
      out[o + 1] = cur[x * bpp + 1];
      out[o + 2] = cur[x * bpp + 2];
      out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev.set(cur);
  }
  return { width, height, data: out };
}

/** Two RGBA images side by side (a before/after pair), with a gap; heights may differ (top-aligned). */
export function sideBySide(a, b, gap = 12, bg = [12, 14, 18]) {
  const w = a.width + gap + b.width;
  const h = Math.max(a.height, b.height);
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = bg[0];
    out[i * 4 + 1] = bg[1];
    out[i * 4 + 2] = bg[2];
    out[i * 4 + 3] = 255;
  }
  const blit = (img, x0) => {
    for (let y = 0; y < img.height; y++) out.set(img.data.subarray(y * img.width * 4, (y + 1) * img.width * 4), (y * w + x0) * 4);
  };
  blit(a, 0);
  blit(b, a.width + gap);
  return { width: w, height: h, data: out };
}

/**
 * The readability metrics of one first-person capture (SPEC §8.10; tools/hybrid-capture.mjs prints them):
 *   mean      mean display luminance of the world region (between the HUD bands, 15–88 % of the height)
 *   dark      share of the world region below 0.04 display (hued darks ≥ 0.04: W1-LEAD §1.2)
 *   clip      C11 share of pixels with any channel ≥ 0.98 (≤ 1.5 %)
 *   sat       C11 share of pixels with saturation ≥ 0.6 (≤ 10 %)
 *   neon      share with saturation ≥ 0.9 and value ≥ 0.9 (never neon: ≤ 0.5 %)
 *   peak      C4 brightest 1/16-area window's mean over the frame mean (≥ 1.6 on a tap target)
 *   streak    C1 horizontal luminance-edge autocorrelation at 2–40 px lags (texel stair-steps, streaks; < 0.35)
 *   warm/cool C4/§8.3 share of the world region that reads warm (r > b + 0.06) / cool (b > r + 0.02)
 */
export function lookMetrics(img) {
  const W = img.width, H = img.height, d = img.data;
  const y0 = Math.round(H * 0.15), y1 = Math.round(H * 0.88);
  const L = new Float32Array(W * H);
  let n = 0, sum = 0, dark = 0, clip = 0, sat = 0, neon = 0, warm = 0, cool = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      L[y * W + x] = l;
      if (y < y0 || y >= y1) continue;
      n++;
      sum += l;
      if (l < 0.04) dark++;
      if (r >= 0.98 || g >= 0.98 || b >= 0.98) clip++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = mx > 0 ? (mx - mn) / mx : 0;
      if (s >= 0.6 && mx > 0.15) sat++;
      if (s >= 0.9 && mx >= 0.9) neon++;
      if (r > b + 0.06) warm++;
      else if (b > r + 0.02) cool++;
    }
  const mean = sum / n;
  // C4: the brightest window of 1/16 of the frame area (4 × 4 grid offsets every 1/8).
  let peak = 0;
  const ww = Math.round(W / 4), wh = Math.round((y1 - y0) / 4);
  for (let oy = y0; oy + wh <= y1; oy += Math.round(wh / 2))
    for (let ox = 0; ox + ww <= W; ox += Math.round(ww / 2)) {
      let s = 0;
      for (let y = oy; y < oy + wh; y += 2) for (let x = ox; x < ox + ww; x += 2) s += L[y * W + x];
      peak = Math.max(peak, s / (Math.ceil(wh / 2) * Math.ceil(ww / 2)));
    }
  // C1 streak detector: autocorrelation of the horizontal luminance gradient at lags 2..40 px (repeating texel edges
  // or painted stripes show as a periodic peak); the reported value is the strongest normalised correlation.
  let streak = 0;
  const rows = 48;
  for (let lag = 2; lag <= 40; lag++) {
    let num = 0, den = 0;
    for (let k = 0; k < rows; k++) {
      const y = Math.round(y0 + ((k + 0.5) / rows) * (y1 - y0));
      for (let x = 1; x + lag + 1 < W; x++) {
        const g0 = L[y * W + x + 1] - L[y * W + x - 1];
        const g1 = L[y * W + x + lag + 1] - L[y * W + x + lag - 1];
        num += g0 * g1;
        den += g0 * g0;
      }
    }
    streak = Math.max(streak, den > 0 ? num / den : 0);
  }
  return { mean, dark: dark / n, clip: clip / n, sat: sat / n, neon: neon / n, peak: peak / Math.max(1e-4, mean), streak, warm: warm / n, cool: cool / n };
}

/**
 * C5 stillness / C6 locality between two captures of the same view (same size): `meanDL` is the mean display-luminance
 * change over the frame, `changed` the share of pixels whose luminance moved by more than `thr` (0.02 by default).
 */
export function frameDelta(a, b, thr = 0.02) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('frameDelta: size mismatch');
  const n = a.width * a.height;
  let sum = 0, changed = 0;
  for (let i = 0; i < n; i++) {
    const j = i * 4;
    const la = (0.2126 * a.data[j] + 0.7152 * a.data[j + 1] + 0.0722 * a.data[j + 2]) / 255;
    const lb = (0.2126 * b.data[j] + 0.7152 * b.data[j + 1] + 0.0722 * b.data[j + 2]) / 255;
    const dl = Math.abs(la - lb);
    sum += dl;
    if (dl > thr) changed++;
  }
  return { meanDL: sum / n, changed: changed / n };
}

/**
 * The scene-side checks of a capture (SPEC §8.10) from the DepthScene's own screen data (CSS px):
 *   C7  the front blocks' smallest short axis (≥ 92 px at rest), C8 that they sit in 27–68 % of the height and 7–93 % of
 *   the width, C12 every visible tappable's drawn size (≥ 72 px on its long axis), hit area (≥ 88 × 88) and height band
 *   (15–72 %), and the worst pairwise hit overlap (≤ 20 %).
 */
export function sceneChecks(cells, targets, width, height) {
  const front = cells.filter((c) => c.slice === 0 && c.left > 0);
  const c7 = front.length ? Math.min(...front.map((c) => Math.min(c.rect.w, c.rect.h))) : null;
  const c8 = front.every((c) => c.rect.y >= 0.27 * height - 1 && c.rect.y + c.rect.h <= 0.68 * height + 1 && c.rect.x >= 0.07 * width - 1 && c.rect.x + c.rect.w <= 0.93 * width + 1);
  const taps = targets.filter((t) => t.type === 'tappable' && t.visible);
  const drawnMin = taps.length ? Math.min(...taps.map((t) => Math.max(t.drawn.w, t.drawn.h))) : null;
  const hitOk = taps.every((t) => t.hit.w >= 88 && t.hit.h >= 88);
  const cy = (t) => (t.drawn.y + t.drawn.h / 2) / height;
  const bandOk = taps.every((t) => cy(t) >= 0.15 && cy(t) <= 0.72);
  let overlap = 0;
  for (let i = 0; i < taps.length; i++)
    for (let j = i + 1; j < taps.length; j++) {
      const a = taps[i].hit, b = taps[j].hit;
      const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      overlap = Math.max(overlap, (ix * iy) / Math.min(a.w * a.h, b.w * b.h));
    }
  return { front: front.length, c7, c8, taps: taps.length, c12drawn: drawnMin, c12hit: hitOk, c12band: bandOk, c12overlap: overlap };
}
