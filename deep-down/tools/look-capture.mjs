// The HD look's capture rounds (W2 §5 MUST 6; owner 2D): every biome at the dig face through the Biome Lab
// (visuallab.html, real WebGL in headless Chromium / SwiftShader), with the look metrics printed per capture:
//   V1 mean sRGB luminance of the world region (0.20-0.38) and its std (>= 0.16)
//   V2 share of world pixels below 0.03 (<= 10 %)        V3 clipped share, all channels > 0.98 (<= 0.8 %)
//   V4 accent share, saturation > 0.6 and luminance > 0.5 (1-6 %)
//   V7 the dig band (floor +-1 m) mean over the world mean (>= 1.25)
//   V11 valuables (ore, rich, gem, chest cells) in the floor row and the next 2 against their rows' host rock:
//       >= 1.6:1 luminance or >= 25 dE2000 (min over the valuables on screen); rows 4-5 >= 1.3:1
//   detail coverage: share of the world region's 32 px tiles with luminance std >= 0.02 (>= 85 %)
//
// Usage: node tools/look-capture.mjs [--out artifacts/idle/w2/look] [--size 390x844] [--dpr 2] [--wait 1800]
//                                    [--biomes 0,1,2] [--prefix r1-] [--query extra=1] [--depth-offset 14] [--vista 1]
// --post '{"iris":0.4,"dim":0.2}': set PostFX params before the shot (the ceremony parameters, W2 seam 2).
// --vista 1: the Vista shot. The tool opens a hall behind the shaft (rows floor-14..floor-1, x 4..60, z 0..56,
// a stand-in for B's Vista cavern), shows the biome's VistaBackdrop behind it and stands its hero set piece in it.
// Writes <out>/<prefix>biome-NN[-WxH].png and <out>/<prefix>metrics.json.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { decodePng } from './png.mjs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/idle/w2/look', size: '390x844', dpr: '2', wait: '1800', biomes: '0,1,2,3,4,5,6,7,8,9,10,11,12,13', prefix: '', query: '', timeout: '150000', 'depth-offset': '' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);
const dpr = Number(opt.dpr);
const STARTS = [0, 40, 120, 240, 400, 600, 900, 1300, 1800, 2400, 3100, 3900, 4800, 5800, 6900];
const biomes = opt.biomes.split(',').map(Number);
mkdirSync(opt.out, { recursive: true });

// ---- colour maths ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function lab(r, g, b) {
  const R = lin(r), G = lin(g), B = lin(b);
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
  const X = f((0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047), Y = f(0.2126 * R + 0.7152 * G + 0.0722 * B), Z = f((0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function dE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hf = (a, b) => { const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v; };
  const h1 = hf(a1p, b1), h2 = hf(a2p, b2);
  let dh = C1p * C2p === 0 ? 0 : h2 - h1;
  if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh * rad) / 2);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) hb = Math.abs(h1 - h2) > 180 ? (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2) : (h1 + h2) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const Rc = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)), dT = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const Sl = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dT * rad) * Rc;
  return Math.sqrt(((L2 - L1) / Sl) ** 2 + ((C2p - C1p) / Sc) ** 2 + (dH / Sh) ** 2 + Rt * ((C2p - C1p) / Sc) * (dH / Sh));
}

/** The metrics of one capture (img: decoded RGBA; info: floorY and the shaft cells from the page). */
function metrics(img, info) {
  const W = img.width, H = img.height, d = img.data;
  const lum = (i) => 0.2126 * (d[i] / 255) + 0.7152 * (d[i + 1] / 255) + 0.0722 * (d[i + 2] / 255);
  // The world region: below the goal bar and above the skill row (SPEC §9.1 at 390 x 844: 96..700 CSS px).
  const y0 = Math.round(H * (96 / 844)), y1 = Math.round(H * (700 / 844));
  let n = 0, sum = 0, sum2 = 0, dark = 0, clip = 0, accent = 0;
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const l = lum(i);
      n++;
      sum += l;
      sum2 += l * l;
      if (l < 0.03) dark++;
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      if (r > 0.98 && g > 0.98 && b > 0.98) clip++;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx > 0 && (mx - mn) / mx > 0.6 && l > 0.5) accent++;
    }
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  // V7: the dig band (the floor +- 1 m = 44 CSS px).
  const fy = info.floorY * dpr, band = 44 * dpr;
  let bs = 0, bn = 0;
  for (let y = Math.max(0, Math.round(fy - band)); y < Math.min(H, Math.round(fy + band)); y++)
    for (let x = 0; x < W; x++) {
      bs += lum((y * W + x) * 4);
      bn++;
    }
  // Detail coverage: 32 px tiles of the world region with luminance std >= 0.02.
  let tiles = 0, detailed = 0;
  for (let ty = y0; ty + 32 <= y1; ty += 32)
    for (let tx = 0; tx + 32 <= W; tx += 32) {
      let s = 0, s2 = 0;
      for (let y = ty; y < ty + 32; y++)
        for (let x = tx; x < tx + 32; x++) {
          const l = lum((y * W + x) * 4);
          s += l;
          s2 += l * l;
        }
      const m = s / 1024;
      tiles++;
      if (Math.sqrt(Math.max(0, s2 / 1024 - m * m)) >= 0.02) detailed++;
    }
  // V11: valuables against their rows' host rock.
  const cellStat = (c) => {
    const half = 44 * 0.28 * dpr;
    let r = 0, g = 0, b = 0, l = 0, k = 0;
    for (let y = Math.round(c.y * dpr - half); y < Math.round(c.y * dpr + half); y++)
      for (let x = Math.round(c.x * dpr - half); x < Math.round(c.x * dpr + half); x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = (y * W + x) * 4;
        r += d[i] / 255;
        g += d[i + 1] / 255;
        b += d[i + 2] / 255;
        l += lum(i);
        k++;
      }
    return k ? { l: l / k, lab: lab(r / k, g / k, b / k) } : null;
  };
  let v11Near = Infinity, v11NearDe = 0, v11NearId = 0, v11NearAt = '', v11Far = Infinity, valuables = 0;
  const rows = new Map();
  for (const c of info.cells) {
    if (!c.solid) continue;
    const s = cellStat(c);
    if (!s) continue;
    const key = c.rel;
    if (!rows.has(key)) rows.set(key, { host: [], val: [] });
    s.id = c.id;
    s.at = `${c.rel}/${c.col}`;
    (c.value ? rows.get(key).val : rows.get(key).host).push(s);
  }
  // Host reference: the row's own host cells, or the nearest row's when the row is all valuables.
  const hostOf = (rel) => {
    for (let dr = 0; dr <= 3; dr++) for (const r of [rel - dr, rel + dr]) { const h = rows.get(r)?.host; if (h && h.length) return h; }
    return null;
  };
  for (const [rel, R] of rows) {
    const host = hostOf(rel);
    if (!host) continue;
    const hl = host.reduce((a, s) => a + s.l, 0) / host.length;
    const hlab = [0, 1, 2].map((k) => host.reduce((a, s) => a + s.lab[k], 0) / host.length);
    for (const v of R.val) {
      const ratio = (Math.max(v.l, hl) + 0.05) / (Math.min(v.l, hl) + 0.05);
      const de = dE2000(v.lab, hlab);
      if (rel <= 2) {
        valuables++;
        // Pass if either measure passes: keep the better-scoring of the two per valuable, then the worst valuable.
        const score = Math.max(ratio / 1.6, de / 25);
        if (score < v11Near) {
          v11Near = score;
          v11NearDe = de;
          v11NearId = v.id;
          v11NearAt = v.at;
        }
      } else if (rel >= 4 && rel <= 5) v11Far = Math.min(v11Far, ratio);
    }
  }
  return {
    V1mean: +mean.toFixed(3), V1std: +std.toFixed(3), V2dark: +((100 * dark) / n).toFixed(2), V3clip: +((100 * clip) / n).toFixed(2), V4accent: +((100 * accent) / n).toFixed(2),
    V7focus: +(bs / bn / mean).toFixed(2), V11near: valuables ? +v11Near.toFixed(2) : null, V11nearDe: valuables ? +v11NearDe.toFixed(1) : null, V11worstId: valuables ? v11NearId : null, V11worstAt: valuables ? v11NearAt : null, V11far: Number.isFinite(v11Far) ? +v11Far.toFixed(2) : null, valuables,
    detail: +((100 * detailed) / tiles).toFixed(1),
  };
}

const pass = (m) => ({
  V1: m.V1mean >= 0.2 && m.V1mean <= 0.38 && m.V1std >= 0.16,
  V2: m.V2dark <= 10,
  V3: m.V3clip <= 0.8,
  V4: m.V4accent >= 1 && m.V4accent <= 6,
  V7: m.V7focus >= 1.25,
  V11: m.V11near === null || m.V11near >= 1,
  detail: m.detail >= 85,
});

const server = await createServer({ server: { port: 5196, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5196/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
let page = null;
const logs = [];
try {
  for (const b of biomes) {
    const span = STARTS[b + 1] - STARTS[b];
    const depth = STARTS[b] + (opt['depth-offset'] ? Number(opt['depth-offset']) : Math.min(24, Math.round(span * 0.3)));
    const name = `${opt.prefix}${opt.vista ? 'vista' : 'biome'}-${String(b).padStart(2, '0')}${opt.size === '390x844' ? '' : `-${opt.size}`}`;
    // One page for the whole round (booting SwiftShader is most of a capture): the first biome loads it, the
    // others jump the lab's window there (a fresh build of the slabs, light and meshes).
    if (!page) {
      page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dpr, hasTouch: true });
      page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 1500)}`); });
      if (opt.layers) await page.addInitScript((l) => { window.__VLAYERS__ = l.split(',').map(Number); }, opt.layers);
      // Reduced motion: no sway, no dolly, no breakthrough fall, so the shot and its measurements agree.
      await page.goto(`${url}visuallab.html?depth=${depth}&motion=reduced${opt.query ? `&${opt.query}` : ''}`);
      try {
        await page.waitForFunction(() => window.__DD__ && window.__DD__.ready, null, { timeout: Number(opt.timeout), polling: 250 });
      } catch (e) {
        console.log(`[biome ${b}] not ready:\n${logs.slice(0, 12).join('\n')}`);
        throw e;
      }
    } else {
      await page.evaluate(async (d) => {
        const old = window.__DD__.vistaObjs ?? [];
        for (const o of old) o.parent?.remove(o);
        window.__DD__.vistaObjs = [];
        await window.__DD__.lab.setDepth(d);
      }, depth);
    }
    logs.length = 0;
    await page.evaluate(() => window.__DD__.lab.scene.world.chunks.flush());
    if (opt.vista) {
      await page.evaluate(async (biome) => {
        const lab = window.__DD__.lab;
        const sc = lab.scene;
        const w = sc.world;
        const floor = lab.shaft.floor;
        for (let r = floor - 14; r <= floor - 1; r++)
          for (let z = 0; z <= 56; z++)
            for (let x = 4; x <= 60; x++) w.ring.set(x, -r - 1, z, 0);
        w.light.computeAll();
        w.rig.lightTex.needsUpdate = true;
        w.ring.markAllDirty();
        await w.chunks.buildAll();
        const { VistaBackdrop } = await import('/src/render/descent/VistaBackdrop.ts');
        const { buildSetPiece } = await import('/src/render/descent/setPieces/index.ts');
        const { Rng } = await import('/src/core/rng.ts');
        const v = new VistaBackdrop(sc.renderer.quality);
        sc.scene.add(v.group);
        v.show({ id: 'capture', biome, y0: floor - 14, y1: floor - 1, x0: 4, x1: 60 });
        const piece = buildSetPiece(biome, new Rng(7));
        if (piece) {
          piece.object.position.set(31.5, -floor, 26);
          sc.scene.add(piece.object);
        }
        let last = performance.now();
        const tick = (now) => {
          v.update((now - last) / 1000);
          last = now;
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        window.__DD__.vista = v;
        window.__DD__.vistaObjs = [v.group, ...(piece ? [piece.object] : [])];
        if (window.__VLAYERS__) v.group.children.forEach((m, i) => { if (m.name.startsWith('vista-layer-')) m.visible = window.__VLAYERS__.includes(Number(m.name.slice(12))); });
      }, b);
    }
    if (opt.post) {
      await page.evaluate((json) => {
        const p = window.__DD__.lab.scene.renderer.post.params;
        const v = JSON.parse(json);
        for (const [k, x] of Object.entries(v)) {
          if (Array.isArray(x) && p[k] && typeof p[k].set === 'function') p[k].set(x[0], x[1]);
          else p[k] = x;
        }
      }, opt.post);
    }
    await page.waitForTimeout(Number(opt.wait));
    // Wait for the camera to rest (the floor still to the pixel over 300 ms), up to 8 s.
    for (let k = 0; k < 26; k++) {
      const a = await page.evaluate(() => window.__DD__.lab.scene.floorScreenY());
      await page.waitForTimeout(300);
      const c = await page.evaluate(() => window.__DD__.lab.scene.floorScreenY());
      if (Math.abs(a - c) < 0.5) break;
    }
    const before = await page.evaluate(() => window.__DD__.lab.scene.floorScreenY());
    const buf = await page.screenshot({ timeout: Number(opt.timeout) });
    const file = `${opt.out}/${name}.png`;
    writeFileSync(file, buf);
    const info = await page.evaluate(() => {
      const lab = window.__DD__.lab;
      const sc = lab.scene;
      const floor = lab.shaft.floor;
      const cells = [];
      for (let rel = 0; rel <= 5; rel++)
        for (let col = 0; col < 7; col++) {
          const row = floor + rel;
          const id = sc.world.ring.get(28 + col, -row - 1, 59);
          const s = sc.screenOf(row, col);
          const slot = id >= 64 && id < 176 ? (id - 64) % 8 : -1;
          const value = (slot >= 4 && slot <= 6) || id === 41 || id === 44 || id === 45 || id === 46;
          cells.push({ rel, col, id, x: s.x, y: s.y, solid: id > 0, value });
        }
      const gl = sc.renderer.gl.info;
      return { floorY: sc.floorScreenY(), cells, calls: gl.render.calls, tris: gl.render.triangles, programs: gl.programs?.length ?? 0, scale: window.__DD__.render?.scale?.() ?? null };
    });
    if (Math.abs(info.floorY - before) > 2) console.log(`[biome ${b}] the camera moved during the shot: floor ${before.toFixed(1)} -> ${info.floorY.toFixed(1)} px`);
    if (opt.debug) console.log(JSON.stringify(info.cells.filter((c) => c.value)));
    const m = metrics(decodePng(buf), info);
    const p = pass(m);
    const r = { biome: b, depth, file, ...m, pass: p, calls: info.calls, tris: info.tris, programs: info.programs, scale: info.scale };
    results.push(r);
    console.log(JSON.stringify(r));
    if (logs.length) console.log(logs.slice(0, 6).join('\n'));
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(`${opt.out}/${opt.prefix}metrics${opt.size === '390x844' ? '' : `-${opt.size}`}.json`, JSON.stringify(results, null, 1));
const fails = results.filter((r) => Object.values(r.pass).some((v) => !v));
console.log(`look-capture: ${results.length} captures, ${results.length - fails.length} pass every metric`);
