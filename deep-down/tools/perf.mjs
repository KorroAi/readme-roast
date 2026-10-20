// Performance of the idle game in headless Chromium (SwiftShader software GPU), portrait (SPEC §13.5 P1–P6).
// SwiftShader rasterizes on the CPU, so FPS here is NOT a phone number; the CPU side of a frame (the model, the
// juice, the DOM), the scene's complexity (draw calls, triangles, shader programs), the slab apply time, the boot
// time and the heap are meaningful and are what this tool reports.
//
// Measures a production build (dist/ by default, run `npm run build` first; --outDir picks another, e.g. the e2e
// build .e2e-dist-4175) served by `vite preview`; --dev 1 measures the dev server instead.
//
// Usage: node tools/perf.mjs [--quality balanced] [--size 390x844] [--out artifacts/idle/perf.json] [--seconds 4]
//                            [--taps 200] [--outDir dist] [--dev 1]
// Spots: the descent at 0, 20, 60 and 150 m (Topsoil, the first marks, Halden Works, the Grotto), each sampled
// still and during 5 taps/s on the floor (real CDP touches).
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = { quality: 'balanced', size: '390x844', out: 'artifacts/idle/perf.json', seconds: '4', taps: '200', outDir: 'dist' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);

let server;
if (opt.dev) {
  server = await createServer({ server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
  await server.listen();
} else {
  if (!existsSync(`${opt.outDir}/index.html`)) throw new Error(`${opt.outDir}/ missing: run npm run build first (or pass --dev 1)`);
  server = await preview({ build: { outDir: opt.outDir }, preview: { port: 5197, strictPort: false }, logLevel: 'error' });
}
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const tapAt = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const floorPoint = (c) => page.evaluate((col) => {
  const cs = window.__DD__.idle.columns();
  const s = cs.strips[col];
  return { x: (s.left + s.right) / 2, y: cs.floorY + 18 };
}, c);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

// P6: boot to the first tap (the first frame of the shaft with the tap surface live).
const t0 = Date.now();
await page.goto(`${url}index.html`);
await page.waitForFunction(() => window.__DD__?.idle?.ready && window.__DD__.idle.mode() === 'playing', null, { timeout: 180_000, polling: 20 });
const bootMs = Date.now() - t0;
console.log('boot', JSON.stringify({ bootToFirstTapMs: bootMs }));
await page.evaluate((q) => window.__DD__.idle.settings({ quality: q }), opt.quality);
const programs0 = await page.evaluate(() => window.__DD__.idle.programs());

/** Sample `seconds` of frames in the page: wall interval and the game's own CPU frame time. */
const sample = (seconds) => page.evaluate(async (s) => {
  const g = window.__DD__.internals.game;
  const frames = [];
  const cpu = [];
  let last = performance.now();
  const end = last + s * 1000;
  const f0 = g.frames;
  await new Promise((resolve) => {
    let lastF = g.frames;
    const tick = (now) => {
      if (g.frames !== lastF) {
        lastF = g.frames;
        frames.push(now - last);
        cpu.push(g.frameMs);
        last = now;
      }
      if (now < end) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });
  const sorted = [...cpu].sort((a, b) => a - b);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const info = g.renderer.gl.info.render;
  const slabs = g.scene.debug.slabs();
  return {
    frames: g.frames - f0,
    wallFps: frames.length ? Math.round(1000 / avg(frames)) : 0,
    cpuFrameMsAvg: +avg(cpu).toFixed(2),
    cpuFrameMsP95: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) : 0,
    drawCalls: info.calls,
    trianglesK: Math.round(info.triangles / 1000),
    slabApplyMaxMs: +slabs.maxApplyMs.toFixed(2),
    shards: g.scene.debug.debris().live,
  };
}, seconds);

const results = { quality: opt.quality, viewport: opt.size, bootToFirstTapMs: bootMs, programs: { boot: programs0, end: 0 }, spots: {}, heap: null, errors };
for (const depth of [0, 20, 60, 150]) {
  if (depth > 0) await page.evaluate((d) => window.__DD__.idle.setDepth(d), depth);
  // Let the slabs and the light settle.
  await page.waitForTimeout(2500);
  const still = await sample(Number(opt.seconds));
  // P2: during 5 taps/s on the floor.
  const p = await floorPoint(3);
  let tapping = true;
  const tapper = (async () => {
    let i = 0;
    while (tapping) {
      const q = i++ % 3 === 0 ? await floorPoint(i % 7) : p;
      await tapAt(q.x, q.y);
      await page.waitForTimeout(200);
    }
  })();
  const taps = await sample(Number(opt.seconds));
  tapping = false;
  await tapper;
  results.spots[`${depth}m`] = { still, taps };
  console.log(`${depth} m`, JSON.stringify({ still, taps }));
}

// P5: the heap over N taps (after a GC where the browser exposes one).
const heap = async () => page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
const h0 = await heap();
for (let i = 0; i < Number(opt.taps); i++) {
  const q = await floorPoint(i % 7);
  await tapAt(q.x, q.y);
  await page.waitForTimeout(60);
}
await page.waitForTimeout(1500);
await cdp.send('HeapProfiler.collectGarbage').catch(() => undefined);
const h1 = await heap();
results.heap = { taps: Number(opt.taps), deltaKB: Math.round((h1 - h0) / 1024), beforeMB: +(h0 / 1048576).toFixed(1), afterMB: +(h1 / 1048576).toFixed(1) };
results.programs.end = await page.evaluate(() => window.__DD__.idle.programs());
console.log('heap', JSON.stringify(results.heap), 'programs', JSON.stringify(results.programs));
if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
mkdirSync(dirname(opt.out), { recursive: true });
writeFileSync(opt.out, JSON.stringify(results, null, 2));
console.log(`wrote ${opt.out}`);
await browser.close();
await server.close();
