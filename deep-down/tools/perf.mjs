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
//
// The GPU cost model (W2 §5 MUST 1, CRITIQUE B16; owner 2D): SwiftShader cannot time a phone GPU, so the frame's
// passes (window.__DD__.render.passes(): pixels written, texture fetches and ALU per pixel) are scaled to the
// reference device (390 x 844 at DPR 2.75, capped by the preset's composite DPR) and priced with a mid-range
// 2022 GPU's throughput (Adreno 642L / Mali-G68 class: ~0.057 ns per bilinear fetch, ~0.0024 ns per ALU op,
// ~0.16 ns per 4 bytes written). The tool fails (exit 1) when a pass group exceeds SPEC §11.6: bloom 1.0 ms,
// composite (resolve + FXAA + the native final) 1.9 ms (1.6 + the 0.3 ms CRITIQUE B13 granted FXAA), the
// terrain estimate 4.5 ms, the whole modelled frame 12 ms, or the GPU memory estimate 80 MB (CRITIQUE B SHOULD 8).
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

// ---- The GPU cost model ----
const REF_DPR = 2.75;
const NS = { fetch: 0.057, alu: 0.0024, write4: 0.16 };
const BUDGET = { bloom: 1.0, composite: 1.9, terrain: 4.5, frame: 12, memoryMB: 80 };
const gpuModel = await page.evaluate(() => {
  const r = window.__DD__.render;
  return { passes: r.passes(), dpr: r.dpr(), scale: r.scale(), memoryBytes: r.memoryBytes(), quality: r.quality() };
});
const CAPS = { battery: 2, balanced: 2.25, high: 3 };
const refDpr = Math.min(REF_DPR, CAPS[gpuModel.quality] ?? 2.25);
const k = (refDpr / gpuModel.dpr) ** 2;
const priced = gpuModel.passes.map((p) => {
  const px = p.px * k;
  const bytes = p.name === 'bright' || p.name === 'down' || p.name === 'up' ? 8 : 4;
  const ms = (px * (p.fetches * NS.fetch + p.alu * NS.alu + (bytes / 4) * NS.write4)) / 1e6;
  return { ...p, px: Math.round(px), ms: +ms.toFixed(3) };
});
// The terrain estimate: about 80 % of the scene's pixels are terrain, at 1.6x overdraw, the HD section path
// costing ~8 fetches and ~200 ALU per pixel (look.ts: 3 noise + 2 params + ramp + light + lantern; the patterns).
const scenePx = (gpuModel.passes.find((p) => p.name === 'resolve')?.px ?? 0) * k;
const terrainMs = (scenePx * 0.8 * 1.6 * (8 * NS.fetch + 200 * NS.alu + 2 * NS.write4)) / 1e6;
const sum = (names) => priced.filter((p) => names.includes(p.name)).reduce((a, p) => a + p.ms, 0);
const groups = { bloom: +sum(['bright', 'down', 'up']).toFixed(3), composite: +sum(['resolve', 'fxaa', 'final']).toFixed(3), terrain: +terrainMs.toFixed(3) };
// Opaque besides terrain (props, crew, structures) and the transparent effects at their SPEC budgets.
const frameMs = +(groups.bloom + groups.composite + groups.terrain + 2.0 + 1.2 + 0.8).toFixed(2);
const memMB = +((gpuModel.memoryBytes * k) / 1048576 + 2.6 + 0.66 + 4.3 + 0.13 + 4 + 4).toFixed(1);
const over = Object.entries(groups).filter(([g, v]) => v > BUDGET[g]).map(([g]) => g);
if (frameMs > BUDGET.frame) over.push('frame');
if (memMB > BUDGET.memoryMB) over.push('memory');
const gpu = { refDpr, scale: gpuModel.scale, passes: priced, groups, frameMs, memoryMB: memMB, budget: BUDGET, over };
console.log('gpu model', JSON.stringify({ refDpr, scale: gpuModel.scale, groups, frameMs, memoryMB: memMB, over }));
for (const p of priced) console.log(`  ${p.name.padEnd(8)} ${String(p.px).padStart(8)} px  ${p.ms.toFixed(3)} ms`);

const results = { quality: opt.quality, viewport: opt.size, bootToFirstTapMs: bootMs, programs: { boot: programs0, end: 0 }, gpu, spots: {}, heap: null, errors };
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
if (over.length) {
  console.log(`perf: the GPU cost model is over SPEC §11.6 in: ${over.join(', ')}`);
  process.exitCode = 1;
}
