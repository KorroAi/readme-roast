// The first-person capture tool (BUILD §3.3 MUST 9, SPEC §8.10–§8.11; owner 1C): named shots of the Lantern Lab
// (visuallab.html → src/lab/hybridLab.ts, real WebGL in headless Chromium / SwiftShader) at one or more viewports, the
// readability metrics of tools/png.mjs printed per capture, a capture sheet.
//
// Usage: node tools/hybrid-capture.mjs [--out artifacts/hybrid/w1/C] [--size 390x844[,360x740,...]] [--dpr 2]
//          [--shots drift,breach,chamber,veins,lamps,exit] [--query quality=balanced] [--prefix r1-] [--port 4175]
//          [--frames 6] [--sheet 1] [--still 1]
// Per capture it prints the look metrics (C1, C4, C11, darks, warm/cool), the scene checks (C7 block size, C8 face band,
// C12 hit targets) and with --still 1 the C5 stillness delta 0.6 s later.
// Writes <out>/<prefix><shot>[-WxH].png, <out>/<prefix>metrics.json and (with --sheet) <out>/<prefix>sheet.png.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { decodePng, encodePng, frameDelta, lookMetrics, sceneChecks } from './png.mjs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/hybrid/w1/C', size: '390x844', dpr: '2', shots: 'drift,breach,chamber,veins,lamps,exit,reveal', query: '', prefix: '', port: '4175', frames: '6', sheet: '1', still: '0', timeout: '240000' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const sizes = opt.size.split(',').map((s) => s.split('x').map(Number));
const shots = opt.shots.split(',');
mkdirSync(opt.out, { recursive: true });

// No HMR or file watching: an edit elsewhere in the tree must not reload the page mid-capture.
const server = await createServer({ server: { port: Number(opt.port), strictPort: true, hmr: false, watch: { ignored: ['**/*'] } }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
try {
  for (const [width, height] of sizes) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr), hasTouch: true });
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
    const q = `capture=1&rscale=1${opt.query ? `&${opt.query}` : ''}&shot=${shots[0]}`;
    await page.goto(`http://localhost:${opt.port}/visuallab.html?${q}`);
    try {
      await page.waitForFunction(() => window.__DD__?.lab?.ready === true, null, { timeout: Number(opt.timeout) });
    } catch (e) {
      console.error(logs.slice(-30).join('\n'));
      throw e;
    }
    for (const shot of shots) {
      await page.evaluate(([s, n]) => {
        const lab = window.__DD__.lab;
        lab.shot(s);
        lab.render(n, 1 / 30);
      }, [shot, Number(opt.frames)]);
      // Let the chunk workers land any remesh the shot caused, then render settled frames.
      await page.waitForTimeout(400);
      await page.evaluate((n) => window.__DD__.lab.render(n, 1 / 30), Number(opt.frames));
      const buf = await page.screenshot({ type: 'png', timeout: 240000 });
      const suffix = sizes.length > 1 || width !== 390 ? `-${width}x${height}` : '';
      const file = `${opt.out}/${opt.prefix}${shot}${suffix}.png`;
      writeFileSync(file, buf);
      const info = await page.evaluate(() => window.__DD__.lab.info());
      const img = decodePng(buf);
      const m = lookMetrics(img);
      // C7 / C8 / C12 from the scene's own screen data.
      const sc = await page.evaluate(() => {
        const s = window.__DD__.lab.scene;
        return { cells: s.faceCells(), targets: s.targets(), w: s.css?.w ?? innerWidth, h: s.css?.h ?? innerHeight };
      });
      const checks = sceneChecks(sc.cells, sc.targets, sc.w, sc.h);
      // C5 stillness: 0.6 s of rest later (18 frames at 1/30 s) the frame must not have moved (mean ΔL ≤ 0.01).
      let still = null;
      if (opt.still === '1') {
        await page.evaluate(() => window.__DD__.lab.render(18, 1 / 30));
        still = frameDelta(img, decodePng(await page.screenshot({ type: 'png', timeout: 240000 })));
      }
      results.push({ shot, size: `${width}x${height}`, file, info, metrics: m, checks, still });
      const fmt = (o) => Object.entries(o).map(([k, v]) => `${k} ${typeof v === 'number' ? +v.toFixed(3) : v}`).join(' ');
      console.log(`${file}  calls ${info.calls} tris ${info.tris} | ${fmt(m)} | ${fmt(checks)}${still ? ` | C5 ${fmt(still)}` : ''}`);
    }
    const errs = logs.filter((l) => /error/i.test(l));
    if (errs.length) console.log(errs.slice(0, 10).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
writeFileSync(`${opt.out}/${opt.prefix}metrics.json`, JSON.stringify(results, null, 2));
if (opt.sheet === '1') {
  // The capture sheet: every shot of the first size side by side, at half resolution.
  const imgs = results.filter((r) => r.size === `${sizes[0][0]}x${sizes[0][1]}`).map((r) => decodePng(readFileSync(r.file)));
  if (imgs.length) {
    const k = 2;
    const w = Math.floor(imgs[0].width / k), h = Math.floor(imgs[0].height / k);
    const gap = 8;
    const W = imgs.length * (w + gap) + gap, H = h + 2 * gap;
    const out = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) out.set([12, 13, 16, 255], i * 4);
    imgs.forEach((img, n) => {
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          let r = 0, g = 0, b = 0;
          for (let dy = 0; dy < k; dy++)
            for (let dx = 0; dx < k; dx++) {
              const s = ((y * k + dy) * img.width + (x * k + dx)) * 4;
              r += img.data[s];
              g += img.data[s + 1];
              b += img.data[s + 2];
            }
          const o = ((y + gap) * W + gap + n * (w + gap) + x) * 4;
          out.set([r / (k * k), g / (k * k), b / (k * k), 255], o);
        }
    });
    writeFileSync(`${opt.out}/${opt.prefix}sheet.png`, encodePng(W, H, out));
    console.log(`${opt.out}/${opt.prefix}sheet.png`);
  }
}
