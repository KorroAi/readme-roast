// Performance measurement in headless Chromium (SwiftShader software GPU).
// SwiftShader rasterizes on the CPU, so FPS here is NOT a phone GPU number; CPU-side costs
// (JS frame time, chunk rebuilds, light updates, saves) and scene complexity (draw calls,
// triangles, memory) are meaningful and are what this tool reports.
//
// Measures the production build in dist/ (run `npm run build` first) served by `vite preview`;
// pass --dev 1 to measure the dev server (unbundled modules) instead.
//
// Usage: node tools/perf.mjs [--quality balanced] [--size 915x412] [--out artifacts/perf.json] [--dev 1]
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = { quality: 'balanced', size: '915x412', out: 'artifacts/perf.json', seconds: '4' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);

let server;
if (opt.dev) {
  server = await createServer({ server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
  await server.listen();
} else {
  if (!existsSync('dist/index.html')) throw new Error('dist/ missing: run npm run build first (or pass --dev 1)');
  server = await preview({ preview: { port: 5197, strictPort: false }, logLevel: 'error' });
}
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const t0 = Date.now();
await page.goto(`${url}index.html`);
await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 180000 });
const bootMs = Date.now() - t0;
// Zone load and initial meshing at boot (mesh workers: 0 = main thread only, or a build without them).
const boot = await page.evaluate(() => {
  const r = window.__DD__.report();
  const c = r.chunks;
  return { ...r.timings, meshWorkers: c.workers ?? 0, workerFallback: c.workerFallback ?? null, bootWorkerMeshes: c.workerMeshes ?? 0, bootMainMeshes: c.syncMeshes ?? null };
});
console.log('boot', JSON.stringify({ bootToMenuMs: bootMs, ...boot }));
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
const results = { quality: opt.quality, viewport: opt.size, bootToMenuMs: bootMs, boot, spots: {}, mining: null, save: null, memory: null };
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

// Mining cost, in the real frame loop: break 20 blocks near the hall floor, each at the start of a
// frame's ChunkRenderer.update() (where a block broken in Game.step lands), and let the game render
// on. Per block: the main-thread chunk work of every frame until nothing is left to mesh (update()
// itself, plus worker results applied between frames on builds with mesh workers), the worst single
// frame of it, and how late the mined chunk's new mesh is drawn (0 = in the frame of the edit, as
// the synchronous mesher does; 1 = the next frame). The same code measures builds with and without
// workers. The light update is timed on its own.
results.mining = await page.evaluate(async () => {
  const g = window.__DD__.game;
  const s = g.session;
  const cr = s.chunks;
  const w = s.world;
  const p = window.__DD__.landmarks().stairsBottom;
  const minable = new Set([1, 2, 3, 4, 5, 6]);
  const exposed = (x, y, z) => [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => w.get(x + a, y + b, z + c) === 0);
  const blocks = [];
  for (let z = Math.floor(p[2]) - 12; z < p[2] + 12 && blocks.length < 20; z++)
    for (let y = Math.floor(p[1]) - 3; y < p[1] + 3 && blocks.length < 20; y++)
      for (let x = Math.floor(p[0]) - 16; x < p[0] && blocks.length < 20; x++) if (minable.has(w.get(x, y, z)) && exposed(x, y, z)) blocks.push([x, y, z]);
  // Exclude boot from the per-chunk maxima.
  for (const k of ['maxRebuildMs', 'maxWorkerMs', 'maxRoundTripMs', 'maxLatencyFrames']) if (k in cr.stats) cr.stats[k] = 0;
  const mainMs = () => cr.stats.mainMs ?? 0;
  const geoOf = (x, y, z) => cr.group.getObjectByName(`chunk_${x >> 4}_${y >> 4}_${z >> 4}`)?.geometry ?? null;
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
  let edit = null;
  let log = null;
  let exitMain = mainMs();
  const update = cr.update;
  cr.update = function (focus, budget) {
    if (edit) {
      const e = edit;
      edit = null;
      e();
    }
    const between = mainMs() - exitMain; // worker results applied since the last frame
    const t0 = performance.now();
    const n = update.call(this, focus, budget);
    const ms = performance.now() - t0;
    exitMain = mainMs();
    log?.push({ ms: ms + Math.max(0, between), geo: log.geo() });
    return n;
  };
  const lightMs = [];
  const perBlock = [];
  const frameMs = [];
  const late = [];
  const settle = [];
  const crystalMs = [];
  try {
    for (const [x, y, z] of blocks) {
      const before = geoOf(x, y, z);
      log = [];
      log.geo = () => geoOf(x, y, z);
      edit = () => {
        const old = w.get(x, y, z);
        w.set(x, y, z, 0);
        const t1 = performance.now();
        s.blockChanged(x, y, z, old);
        lightMs.push(performance.now() - t1);
      };
      for (let f = 0; f < 120; f++) {
        await nextFrame();
        if (edit || !log.length) continue;
        if (log.at(-1).geo !== before && !w.dirty.includes(1) && !(cr.stats.pending > 0)) break;
      }
      const shown = log.findIndex((e) => e.geo !== before);
      late.push(shown);
      settle.push(log.length);
      perBlock.push(log.reduce((a, e) => a + e.ms, 0));
      frameMs.push(Math.max(...log.map((e) => e.ms)));
    }
    // Worst case for light: remove an emitter (crystal) -> local light rebuild.
    for (let i = 0; i < w.blocks.length && !crystalMs.length; i++) {
      if (w.blocks[i] !== 9) continue;
      const z = Math.floor(i / (w.sx * w.sy));
      const y = Math.floor(i / w.sx) % w.sy;
      const x = i % w.sx;
      w.set(x, y, z, 0);
      const t = performance.now();
      s.blockChanged(x, y, z, 9);
      crystalMs.push(performance.now() - t);
    }
    await nextFrame();
  } finally {
    log = null;
    delete cr.update; // back to the prototype method
  }
  const avg = (a) => +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(2);
  const max = (a) => +Math.max(...a).toFixed(2);
  const st = cr.stats;
  const check = window.__DD__.meshCheck ? await window.__DD__.meshCheck() : null;
  return {
    blocks: perBlock.length,
    lightMsAvg: avg(lightMs),
    lightMsMax: max(lightMs),
    remeshMsAvg: avg(perBlock),
    remeshMsMax: max(perBlock),
    remeshFrameMsMax: max(frameMs),
    framesLateAvg: avg(late),
    framesLateMax: Math.max(...late),
    framesToSettleAvg: avg(settle),
    framesToSettleMax: Math.max(...settle),
    emitterRemovalLightMs: +crystalMs[0].toFixed(2),
    maxChunkRebuildMs: +st.maxRebuildMs.toFixed(2),
    meshWorkers: st.workers ?? 0,
    workerMeshMsMax: st.maxWorkerMs !== undefined ? +st.maxWorkerMs.toFixed(2) : null,
    workerRoundTripMsMax: st.maxRoundTripMs !== undefined ? +st.maxRoundTripMs.toFixed(2) : null,
    workerLatencyFramesMax: st.maxLatencyFrames ?? null,
    staleResults: st.staleResults ?? null,
    meshCheck: check ? { checked: check.checked, mismatched: check.mismatched.length } : null,
  };
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
    // Interleaved attributes share one buffer: count each buffer once.
    for (const a of Object.values(geo.attributes)) {
      const buf = a.isInterleavedBufferAttribute ? a.data : a;
      if (seen.has(buf)) continue;
      seen.add(buf);
      geometryBytes += buf.array.byteLength;
    }
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
    renderTargetsAreEstimate: true, // width x height x 8 B x (MSAA) x 1.4 for bloom levels
    dynamicLights: 1, // by design: the lantern is the only light computed at runtime
    emitters: (() => {
      const b = g.session.world.blocks;
      let propLights = 0;
      let crystal = 0;
      let glyphStone = 0;
      for (let i = 0; i < b.length; i++) {
        if (b[i] >= 19 && b[i] <= 23) propLights++;
        else if (b[i] === 9) crystal++;
        else if (b[i] === 14) glyphStone++;
      }
      return { propLights, crystal, glyphStone, total: propLights + crystal + glyphStone };
    })(),
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
