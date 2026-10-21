// Performance of DEEP DOWN's first-person renderer in headless Chromium (SwiftShader software GPU), portrait (owner 1E;
// W1-LEAD §4.10, SPEC §11). SwiftShader rasterizes on the CPU, so FPS here is NOT a phone number; what is meaningful:
// the scene's complexity (draw calls, triangles, shader programs), the passes the lighting stack runs and their pixel
// counts, the shadow-cube refreshes, the boot time and the heap, and the GPU cost model below.
//
// Targets:
//   --target lab   the light lab (src/render/light/lab/, through a Vite dev server): every lab shot, still and walking
//   --target game  the game (a production build: dist/ by default, --outDir picks another) through
//                  window.__DD__.hybrid: the drift, a chamber in Explore, walking (the camera moving every frame)
// Usage: node tools/perf.mjs [--target lab|game] [--quality balanced] [--size 390x844] [--seconds 3]
//                            [--out artifacts/hybrid/w1/E/perf-<target>-<quality>.json] [--outDir dist]
//
// The GPU cost model (W1-LEAD §4.10): SwiftShader cannot time a phone GPU, so every pass (window.__DD__.render
// .passes(): pixels written, texture fetches and ALU per pixel) is scaled to the reference device (390 × 844 at DPR
// 2.75, capped by the preset's composite DPR) and priced with phone A's throughput (Adreno 642L / Mali-G68 class: ~0.057
// ns per bilinear fetch, ~0.0024 ns per ALU op, ~0.16 ns per 4 bytes written, ~1.4 ns per shadow-pass triangle). The
// world pass is modelled from the light chunk's per-pixel cost at the preset's features (shadow taps, practicals, the
// probe). The tool fails (exit 1) when a group is over budget: bloom 1.0 ms, composite (resolve + FXAA + final) 1.9 ms,
// lighting (depth, GTAO, blur, volumetrics, composite) 3.2 ms, the world 8.5 ms, the whole GPU frame 16 ms (W1-LEAD
// §4.10 replaces SPEC §11's 12 ms), GPU memory 80 MB.
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = { target: 'lab', quality: 'balanced', size: '390x844', seconds: '3', outDir: 'dist', out: '' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const out = opt.out || `artifacts/hybrid/w1/E/perf-${opt.target}-${opt.quality}.json`;
const [width, height] = opt.size.split('x').map(Number);

let server;
if (opt.target === 'lab') {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
  await server.listen();
} else {
  if (!existsSync(`${opt.outDir}/index.html`)) throw new Error(`${opt.outDir}/ missing: run npm run build first`);
  server = await preview({ build: { outDir: opt.outDir }, preview: { port: 5197, strictPort: false }, logLevel: 'error' });
}
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
let page = await context.newPage();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
};
watch(page);

// ---- The GPU cost model ----
const REF_DPR = 2.75;
const NS = { fetch: 0.057, alu: 0.0024, write4: 0.16, shadowTri: 1.4 };
const BUDGET = { bloom: 1.0, composite: 1.9, lighting: 3.2, world: 8.5, frame: 16, memoryMB: 80 };
const CAPS = { battery: 2, balanced: 2.25, high: 3 };
const LIGHT_PASSES = ['lightDepth', 'gtao', 'aoBlur', 'vol', 'composite'];

/** Per-pixel cost of the world's surfaces (1C's stone through the light chunk) at the preset's features. */
function worldCost(f) {
  // The surface itself: 2–3 array taps of two layers, the micro-relief noise, the crack loop: ~8 fetches, ~260 ALU.
  let fetches = 8;
  let alu = 260;
  // shade(): the SH, the irradiance (2 fetches), the BRDF of the lantern (~70 ALU), the env (1 fetch).
  fetches += (f.probes ? 1 : 0) + 2;
  alu += 180;
  // The lantern's cube shadow: the 4-tap blocker search on every lit pixel, the PCF where a blocker was found (~30 %).
  if (f.shadows) {
    fetches += 4 + 0.3 * f.shadowTaps;
    alu += 60 + 0.3 * f.shadowTaps * 14;
  }
  // Practicals: in range of ~2.5 of them on average (~55 ALU each with GGX); the loop's tests for the rest.
  alu += 2.5 * 55 + f.practicals * 6;
  // Battery fogs in the material (~40 ALU).
  if (!f.volumetric) alu += 40;
  return { fetches, alu };
}

/** Price one sample: { passes, features, light, dpr, quality, memoryBytes, tris }. */
function price(sample) {
  const refDpr = Math.min(REF_DPR, CAPS[sample.quality] ?? 2.25);
  const k = (refDpr / sample.dpr) ** 2;
  const priced = sample.passes.map((p) => {
    const px = p.px * k;
    const bytes = ['bright', 'down', 'up', 'vol', 'composite', 'gtao', 'aoBlur', 'lightDepth'].includes(p.name) ? 8 : 4;
    const ms = (px * (p.fetches * NS.fetch + p.alu * NS.alu + (bytes / 4) * NS.write4)) / 1e6;
    return { name: p.name, px: Math.round(px), ms: +ms.toFixed(3) };
  });
  const scenePx = (sample.passes.find((p) => p.name === 'resolve')?.px ?? 0) * k;
  const wc = worldCost(sample.features);
  // ~85 % of the scene's pixels are lit surfaces, at 1.4x overdraw (the face, props, ledges).
  const worldMs = (scenePx * 0.85 * 1.4 * (wc.fetches * NS.fetch + wc.alu * NS.alu + 2 * NS.write4)) / 1e6;
  // The shadow cube while the lantern moves: 6 faces of res² (the distance shader, ~12 ALU, 2 bytes) and the triangles
  // within 14 m (about 45 % of the frame's, each in ~1.6 faces), every N frames.
  const f = sample.features;
  let shadowMs = 0;
  if (f.shadows) {
    const fill = (6 * f.shadowRes * f.shadowRes * (12 * NS.alu + 0.5 * NS.write4)) / 1e6;
    const geo = (sample.tris * 0.45 * 1.6 * NS.shadowTri) / 1e6;
    shadowMs = (fill + geo) / Math.max(1, f.shadowEveryFrames) * (f.secondShadow ? 1.15 : 1);
  }
  const sum = (names) => priced.filter((p) => names.includes(p.name)).reduce((a, p) => a + p.ms, 0);
  const groups = {
    bloom: +sum(['bright', 'down', 'up']).toFixed(3),
    composite: +sum(['resolve', 'fxaa', 'final']).toFixed(3),
    lighting: +sum(LIGHT_PASSES).toFixed(3),
    world: +worldMs.toFixed(3),
    shadowWalking: +shadowMs.toFixed(3),
  };
  // The viewmodel, the crew and props besides the world, transparent effects at their SPEC budgets.
  const restMs = 1.2 + 0.8 + 0.6;
  const frameWalking = +(groups.bloom + groups.composite + groups.lighting + groups.world + groups.shadowWalking + restMs).toFixed(2);
  const frameRest = +(groups.bloom + groups.composite + groups.lighting + groups.world + restMs).toFixed(2);
  const memMB = +((sample.memoryBytes * k) / 1048576 + (sample.lightBytes ?? 0) / 1048576 + 4.3 + 8).toFixed(1);
  const over = ['bloom', 'composite', 'lighting', 'world'].filter((g) => groups[g] > BUDGET[g]);
  if (frameWalking > BUDGET.frame) over.push('frame');
  if (memMB > BUDGET.memoryMB) over.push('memory');
  return { refDpr, scale: sample.scale, passes: priced, groups, frameRestMs: frameRest, frameWalkingMs: frameWalking, memoryMB: memMB, over };
}

const results = { target: opt.target, quality: opt.quality, viewport: opt.size, shots: {}, errors, budget: BUDGET };
let worst = [];

if (opt.target === 'lab') {
  const shots = ['arrival', 'pillar', 'shaft', 'crystal', 'grazing'];
  for (const shot of shots) {
    const t0 = Date.now();
    // A fresh page per shot: SwiftShader's queue of the last page never delays the next navigation.
    await page.close();
    page = await context.newPage();
    watch(page);
    await page.goto(`${url}src/render/light/lab/index.html?capture=1&q=${opt.quality}&shot=${shot}`, { timeout: 300_000, waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__LAB__?.ready, null, { timeout: 300_000 });
    const bootMs = Date.now() - t0;
    // At rest: 20 frames; then walking: the eye moves 4 cm a frame (2.4 m/s) for 20 frames.
    const rest = await page.evaluate(() => {
      const L = window.__LAB__;
      const s0 = L.stats().stats.shadowRenders;
      const t = performance.now();
      L.frames(20);
      const ms = (performance.now() - t) / 20;
      const st = L.stats();
      return { cpuMsPerFrame: +ms.toFixed(1), shadowRendersAtRest: st.stats.shadowRenders - s0, st };
    });
    const walk = await page.evaluate(() => {
      const L = window.__LAB__;
      const s0 = L.stats().stats.shadowRenders;
      for (let i = 0; i < 20; i++) {
        L.nudge(0, 0, 0.04);
        L.frames(1);
      }
      const st = L.stats();
      return { shadowRendersWalking: st.stats.shadowRenders - s0, calls: st.frame.calls, tris: st.frame.tris };
    });
    const s = rest.st;
    const gpu = price({
      passes: s.passes,
      features: s.features,
      dpr: await page.evaluate(() => window.__LAB__.renderer.dpr()),
      quality: opt.quality,
      memoryBytes: s.memory,
      lightBytes: s.shadowBytes + s.probeBytes,
      scale: s.scale,
      tris: s.frame.tris,
    });
    results.shots[shot] = {
      bootMs,
      calls: s.frame.calls,
      tris: s.frame.tris,
      sceneTris: s.tris,
      shadowRendersAtRest: rest.shadowRendersAtRest,
      shadowRendersWalking20: walk.shadowRendersWalking,
      callsWalking: walk.calls,
      gpu,
    };
    worst = worst.concat(gpu.over.map((g) => `${shot}:${g}`));
    console.log(
      `${shot.padEnd(8)} calls ${s.frame.calls} (walking ${walk.calls}) · tris ${Math.round(s.frame.tris / 1000)}k · shadow renders rest ${rest.shadowRendersAtRest}/20, walking ${walk.shadowRendersWalking}/20 · ` +
        `GPU model rest ${gpu.frameRestMs} ms, walking ${gpu.frameWalkingMs} ms ${JSON.stringify(gpu.groups)} · mem ${gpu.memoryMB} MB`,
    );
  }
} else {
  const t0 = Date.now();
  await page.goto(`${url}index.html`, { timeout: 180_000 });
  await page.waitForFunction(() => window.__DD__?.hybrid?.ready, null, { timeout: 180_000, polling: 50 });
  results.bootMs = Date.now() - t0;
  await page.evaluate((q) => window.__DD__.hybrid.settings({ quality: q }), opt.quality).catch(() => undefined);
  await page.waitForTimeout(2000);
  const probe = async (label) => {
    const perf = await page.evaluate(() => window.__DD__.hybrid.perf());
    const r = await page.evaluate(() => {
      const d = window.__DD__.render;
      const l = d.light();
      return { passes: d.passes(), dpr: d.dpr(), scale: d.scale(), memoryBytes: d.memoryBytes(), quality: d.quality(), light: l };
    });
    // The world's own calls and triangles: the frame's minus what the shadow cubes and the probe face added to it.
    // (The two counters can come from different frames: when the passes' share is not below the frame's, it is unknown.)
    const pc = r.light.stats.passCalls ?? 0;
    const pt = r.light.stats.passTris ?? 0;
    const worldCalls = pc < perf.calls ? perf.calls - pc : perf.calls;
    const worldTris = pt < perf.tris ? perf.tris - pt : perf.tris;
    const gpu = price({ ...r, features: r.light.features, lightBytes: r.light.shadowBytes + r.light.probeBytes, tris: worldTris });
    results.shots[label] = { perf, worldCalls, worldTris, light: r.light.stats, gpu };
    worst = worst.concat(gpu.over.map((g) => `${label}:${g}`));
    console.log(`${label.padEnd(10)} calls ${perf.calls} (world ${worldCalls}, light passes ${r.light.stats.passCalls ?? 0}) · tris ${Math.round(perf.tris / 1000)}k (world ${Math.round(worldTris / 1000)}k) · GPU model rest ${gpu.frameRestMs} ms, walking ${gpu.frameWalkingMs} ms ${JSON.stringify(gpu.groups)} · mem ${gpu.memoryMB} MB`);
  };
  // One forced refresh of the lantern cube (what walking costs every N frames): its draw calls and casters.
  const refresh = async (label) => {
    await page.evaluate(() => window.__DD__.render.setLight({ refresh: true }));
    await page.waitForFunction((n) => window.__DD__.render.light().stats.shadowRenders > n, await page.evaluate(() => window.__DD__.render.light().stats.shadowRenders), { timeout: 120_000 });
    const st = await page.evaluate(() => window.__DD__.render.light().stats);
    const every = results.shots[label].gpu ? (await page.evaluate(() => window.__DD__.render.light().features.shadowEveryFrames)) : 1;
    const walkingCalls = Math.round(results.shots[label].worldCalls + st.lastShadowCalls / Math.max(1, every));
    results.shots[label].shadowRefresh = { calls: st.lastShadowCalls, casters: st.lastShadowCasters, everyFrames: every, walkingCallsPerFrame: walkingCalls };
    console.log(`${label.padEnd(10)} one lantern-cube refresh: ${st.lastShadowCalls} draw calls (6 faces), ${st.lastShadowCasters} casters within 14 m; walking ≈ ${walkingCalls} calls a frame (a refresh every ${every} frames)`);
  };
  await probe('drift');
  await refresh('drift');
  await page.evaluate(() => window.__DD__.hybrid.setNode(1, 'chamber'));
  await page.waitForTimeout(3000);
  await probe('chamber');
  await refresh('chamber');
}

const heap = await page.evaluate(() => (performance.memory ? performance.memory.usedJSHeapSize : 0));
results.heapMB = +(heap / 1048576).toFixed(1);
if (errors.length) console.log('page errors:', errors.slice(0, 5).join(' | '));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(results, null, 2));
console.log(`wrote ${out}`);
await browser.close();
await server.close();
if (worst.length) {
  console.log(`perf: the GPU cost model is over budget in: ${worst.join(', ')}`);
  process.exitCode = 1;
}
