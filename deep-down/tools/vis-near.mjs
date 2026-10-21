// VIS meter: how lantern-lit stone reads at arm's length in the real first-person game.
//
// Usage: node tools/vis-near.mjs [--out artifacts/vis-near] [--dist 0.8,1,1.5,2,2.5,3,4,6]
//
// For each wall below, the explorer stands on the wall's line at each distance (eye to wall),
// looks straight at it (the shipped camera and the lantern in the hand), and the frame is read
// back: the 95th percentile and median of the per-pixel max channel (display 0-1) and the
// saturation over the wall area above the tools. Target: lit stone peaks at about 0.75 at 1 m and
// keeps its colour (saturation well above a washed-out cream's).
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/vis-near', dist: '0.8,1,1.5,2,2.5,3,4,6', port: '5277', walls: '' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const dists = opt.dist.split(',').map(Number);
const WALLS = [
  { name: 'copper', at: [60.5, 100, 34.5], dir: [1, 0] },
  { name: 'iron', at: [104.5, 43, 54.5], dir: [-1, 0] },
  { name: 'tunnel', at: [66.5, 98, 47.5], dir: [0, -1] },
  { name: 'gate', at: [130.5, 42, 100.5], dir: [1, 0] },
].filter((w) => !opt.walls || opt.walls.split(',').includes(w.name));
mkdirSync(opt.out, { recursive: true });

/** Decode an 8-bit RGB(A) PNG (Playwright's screenshots) to { w, h, px: Uint8Array RGBA }. */
function decodePng(buf) {
  let o = 8;
  let w = 0, h = 0, ct = 0;
  const idat = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  const bpp = ct === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * 4);
  const prev = new Uint8Array(w * bpp);
  const cur = new Uint8Array(w * bpp);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (w * bpp + 1)];
    const row = raw.subarray(y * (w * bpp + 1) + 1, (y + 1) * (w * bpp + 1));
    for (let i = 0; i < w * bpp; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c; const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    for (let x = 0; x < w; x++) for (let k = 0; k < 3; k++) px[(y * w + x) * 4 + k] = cur[x * bpp + k];
    prev.set(cur);
  }
  return { w, h, px };
}

function stats(png) {
  const mx = [], sat = [];
  const { w, h, px } = png;
  for (let y = Math.floor(h * 0.3); y < h * 0.58; y += 2)
    for (let x = Math.floor(w * 0.25); x < w * 0.75; x += 2) {
      const i = (y * w + x) * 4;
      const r = px[i] / 255, g = px[i + 1] / 255, b = px[i + 2] / 255;
      const M = Math.max(r, g, b), m = Math.min(r, g, b);
      mx.push(M);
      sat.push(M > 0.02 ? (M - m) / M : 0);
    }
  const q = (a, p) => [...a].sort((u, v) => u - v)[Math.floor(p * (a.length - 1))];
  return { p95: +q(mx, 0.95).toFixed(3), p50: +q(mx, 0.5).toFixed(3), sat: +q(sat, 0.5).toFixed(2) };
}

const server = await createServer({ server: { port: Number(opt.port), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await page.goto(`${url}index.html`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 240000, polling: 250 });
  await page.evaluate(async () => {
    const st = document.createElement('style');
    st.textContent = '.dd-ui{display:none!important}';
    document.head.appendChild(st);
    const g = window.__DD__.game;
    g.updateSettings({ quality: 'balanced' });
    await g.newGame();
    g.renderer.preset = { ...g.renderer.preset, fpsCap: 4 };
  });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 120000 });
  for (const wall of WALLS) {
    const line = [];
    for (const d of dists) {
      const ok = await page.evaluate(({ wall, d }) => {
        const D = window.__DD__;
        const s = D.standableNear(...wall.at);
        if (!s) return false;
        const [dx, dz] = wall.dir;
        // March from the stand cell's eye to the wall.
        let t = 0;
        while (t < 12 && !D.isSolid(Math.floor(s[0] + dx * t), Math.floor(s[1] + 1.62), Math.floor(s[2] + dz * t))) t += 0.02;
        const wx = s[0] + dx * t, wz = s[2] + dz * t;
        D.teleport(wx - dx * d, s[1], wz - dz * d);
        D.look(Math.atan2(-dx, -dz), 0);
        D.step(20);
        return true;
      }, { wall, d });
      if (!ok) continue;
      await page.waitForTimeout(500);
      const file = `${opt.out}/${wall.name}-${d}.png`;
      const buf = await page.screenshot({ path: file, timeout: 120000 });
      line.push(`${d}m ${JSON.stringify(stats(decodePng(buf)))}`);
    }
    console.log(`[${wall.name}] ${line.join('  ')}`);
  }
} finally {
  await browser.close();
  await server.close();
}
