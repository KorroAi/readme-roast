// Performance measurement in headless Chromium (SwiftShader software GPU).
// SwiftShader rasterizes on the CPU, so FPS here is NOT a phone GPU number; CPU-side costs
// (JS frame time, chunk rebuilds, light updates, saves) and scene complexity (draw calls,
// triangles, memory) are meaningful and are what this tool reports.
//
// Usage: node tools/perf.mjs [--quality balanced] [--size 915x412] [--out artifacts/perf.json]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = { quality: 'balanced', size: '915x412', out: 'artifacts/perf.json', seconds: '4' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);

const server = await createServer({ server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(`${url}index.html`);
await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 180000 });
const bootMs = Date.now() - t0;
await page.evaluate(async (q) => {
  const g = window.__DD__.game;
  g.updateSettings({ quality: q });
  await g.newGame();
}, opt.quality);
await page.waitForFunction(() => window.__DD__.state().mode === 'playing');

const spots = {
  camp: { lm: 'campfire', dx: -2, yaw: -0.6, pitch: -0.25 },
  tunnel: { lm: 'firstCrystals', dx: -4, yaw: -2.3, pitch: -0.15 },
  ledgeVista: { lm: 'ledge', dx: 2, yaw: -2.5, pitch: -0.35 },
  hollowFloor: { lm: 'stairsBottom', dx: -4, yaw: 1.2, pitch: -0.05 },
  bridge: { lm: 'bridge', dx: 0, yaw: 3.1, pitch: -0.4 },
};
const results = { quality: opt.quality, viewport: opt.size, bootToMenuMs: bootMs, spots: {}, mining: null, save: null, memory: null };
for (const [name, s] of Object.entries(spots)) {
  await page.evaluate(({ s }) => {
    const dd = window.__DD__;
    const p = dd.landmarks()[s.lm];
    const st = dd.standableNear(p[0] + s.dx, p[1], p[2]);
    dd.teleport(st[0], st[1], st[2]);
    dd.look(s.yaw, s.pitch);
  }, { s });
  await page.waitForTimeout(1500);
  const sample = await page.evaluate(async (seconds) => {
    const g = window.__DD__.game;
    const frames = [];
    const cpu = [];
    let last = performance.now();
    const end = last + seconds * 1000;
    await new Promise((resolve) => {
      const tick = (now) => {
        frames.push(now - last);
        cpu.push(g.frameMs);
        last = now;
        if (now < end) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const sorted = [...cpu].sort((a, b) => a - b);
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const r = window.__DD__.report();
    return {
      wallFps: Math.round(1000 / avg(frames)),
      cpuFrameMsAvg: +avg(cpu).toFixed(2),
      cpuFrameMsP95: +sorted[Math.floor(sorted.length * 0.95)].toFixed(2),
      drawCalls: r.render.calls,
      trianglesK: Math.round(r.render.triangles / 1000),
      visibleChunks: g.session.chunks.group.children.filter((c) => c.visible).length,
      particles: r.particles,
    };
  }, Number(opt.seconds));
  results.spots[name] = sample;
  console.log(name, JSON.stringify(sample));
}

// Mining cost: break 20 slate blocks near the hall floor and time light + remesh work.
results.mining = await page.evaluate(() => {
  const g = window.__DD__.game;
  const s = g.session;
  const w = s.world;
  const p = window.__DD__.landmarks().stairsBottom;
  const lightMs = [];
  const meshMs = [];
  let n = 0;
  const minable = new Set([1, 2, 3, 4, 5, 6]);
  const exposed = (x, y, z) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => w.get(x + a, y + b, z + c) === 0);
  for (let z = Math.floor(p[2]) - 12; z < p[2] + 12 && n < 20; z++)
    for (let y = Math.floor(p[1]) - 3; y < p[1] + 3 && n < 20; y++)
    for (let x = Math.floor(p[0]) - 16; x < p[0] && n < 20; x++) {
      if (!minable.has(w.get(x, y, z)) || !exposed(x, y, z)) continue;
      const old = w.get(x, y, z);
      w.set(x, y, z, 0);
      const t1 = performance.now();
      s.blockChanged(x, y, z, old);
      lightMs.push(performance.now() - t1);
      const t2 = performance.now();
      s.chunks.update(g.cameraRig.camera.position, 1000);
      meshMs.push(performance.now() - t2);
      n++;
    }
  // Worst case: remove an emitter (crystal) -> local light rebuild.
  let crystalMs = null;
  for (let i = 0; i < w.blocks.length && crystalMs === null; i++) {
    if (w.blocks[i] !== 9) continue;
    const z = Math.floor(i / (w.sx * w.sy));
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    w.set(x, y, z, 0);
    const t = performance.now();
    s.blockChanged(x, y, z, 9);
    crystalMs = performance.now() - t;
  }
  const avg = (a) => +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2);
  return { blocks: n, lightMsAvg: avg(lightMs), lightMsMax: +Math.max(...lightMs).toFixed(2), remeshMsAvg: avg(meshMs), remeshMsMax: +Math.max(...meshMs).toFixed(2), emitterRemovalLightMs: +crystalMs.toFixed(2), maxChunkRebuildMs: +s.chunks.stats.maxRebuildMs.toFixed(2) };
});
console.log('mining', JSON.stringify(results.mining));

results.save = await page.evaluate(() => {
  const g = window.__DD__.game;
  const t1 = performance.now();
  const data = g.buildSave();
  const t2 = performance.now();
  const ok = g.saves.save(data).ok;
  const t3 = performance.now();
  const res = g.saves.load();
  const t4 = performance.now();
  return { ok, loadedOk: !!res.data, buildMs: +(t2 - t1).toFixed(2), writeMs: +(t3 - t2).toFixed(2), readMs: +(t4 - t3).toFixed(2), bytes: JSON.stringify(data).length, worldEdits: data.worldEdits.length / 2 };
});
console.log('save', JSON.stringify(results.save));

results.memory = await page.evaluate(() => {
  const g = window.__DD__.game;
  let geometryBytes = 0;
  const seen = new Set();
  g.scene.traverse((o) => {
    const geo = o.geometry;
    if (!geo || seen.has(geo)) return;
    seen.add(geo);
    for (const a of Object.values(geo.attributes)) geometryBytes += a.array.byteLength;
    if (geo.index) geometryBytes += geo.index.array.byteLength;
  });
  const w = g.session.world;
  const lightTexBytes = w.sx * w.sy * w.sz * 4;
  const canvas = g.renderer.canvas;
  const rtBytes = canvas.width * canvas.height * 8 * (g.renderer.preset.msaa ? 1 + g.renderer.preset.msaa : 1) * 1.4;
  const heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  return {
    jsHeapMB: heap,
    gpuGeometryMB: +(geometryBytes / 1048576).toFixed(1),
    lightVolumeMB: +(lightTexBytes / 1048576).toFixed(1),
    renderTargetsMB: +(rtBytes / 1048576).toFixed(1),
    textures: g.renderer.gl.info.memory.textures,
    geometries: g.renderer.gl.info.memory.geometries,
    dynamicLights: 1,
    staticEmitters: g.session.world.blocks.reduce((n, b) => n + (b >= 19 && b <= 23 ? 1 : 0), 0),
    canvas: `${canvas.width}x${canvas.height}`,
  };
});
console.log('memory', JSON.stringify(results.memory));
results.errors = errors;
mkdirSync(dirname(opt.out), { recursive: true });
writeFileSync(opt.out, JSON.stringify(results, null, 2));
console.log('wrote', opt.out, 'errors:', errors.length);
await browser.close();
await server.close();
