// VIS (round 3): draw calls and triangles on the big strata (BRIEF §4: Balanced holds <= 150 draw
// calls and <= 250k triangles visible), measured in the game's own first-person camera at 390 x 844
// (the whole frame: the scene and the post passes, as Renderer.render counts it).
//
// For each stratum: the vista's balcony (the widest view of the deep) and its floor, the largest
// caverns of each biome, each lair and the gate; at each spot 8 headings (a level look), after the
// chunks round it are meshed (--headings 6 by default). No screenshots; the worst spots are listed.
//
// Usage: node tools/vis-strata-perf.mjs [--strata 1,2,3,4,5,6] [--seed 7] [--q balanced]
//          [--caverns 3] [--out artifacts/r3/vis/perf.json] [--port 4175] [--prod 0]
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const args = process.argv.slice(2);
const opt = { strata: '1,2,3,4,5,6', seed: '7', q: 'balanced', caverns: '3', headings: '6', out: 'artifacts/r3/vis/perf.json', port: '4175', prod: '0', size: '390x844', dpr: '1' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);

const server = opt.prod === '1'
  ? await preview({ preview: { port: Number(opt.port), strictPort: false }, logLevel: 'error' })
  : await createServer({ server: { port: Number(opt.port), strictPort: false, hmr: false }, logLevel: 'error' });
if (opt.prod !== '1') await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
const result = { seed: Number(opt.seed), quality: opt.q, size: opt.size, strata: [] };
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr), hasTouch: true, isMobile: true });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 300)}`); });
  await page.goto(`${url}index.html?gen=strata`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 420000, polling: 500 });
  await page.evaluate(async ({ q, seed }) => {
    const st = document.createElement('style');
    st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-tut,.dd-arrival{display:none!important}';
    document.head.appendChild(st);
    const g = window.__DD__.game;
    g.updateSettings({ quality: q });
    await g.newGame(Number(seed));
    // The real game with its tutorial done (its bubble would sit over the view).
    (g.quests ?? g.loop?.quests)?.skipTutorial?.();
    // No creatures in the frame (MOBS captures its own): the spawner off, the field cleared.
    window.__DD__.mobs?.auto?.(false);
    window.__DD__.mobs?.clear?.();
    // The game's own loop all but stopped: every measured frame is a D.step render.
    g.renderer.preset = { ...g.renderer.preset, fpsCap: 0.05 };
  }, { q: opt.q, seed: opt.seed });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 180000 });
  console.log(`booted seed ${opt.seed} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  for (const n of opt.strata.split(',').map(Number)) {
    const r = await page.evaluate(async ({ n, caverns, headings }) => {
      const HEADINGS = headings;
      const D = window.__DD__;
      const g = D.game;
      if (g.strata.current !== n) await D.stratum(n);
      D.mobs?.clear?.();
      const L = g.strata.layout;
      const spots = [];
      if (L.vista) {
        spots.push({ name: 'vista', at: L.vista.balcony });
        spots.push({ name: 'vistaFloor', at: L.vista.rampFoot });
      }
      for (const b of L.biomes) {
        const cav = L.caverns.filter((c) => c.biome === b).sort((a, c) => c.radius[0] * c.radius[2] - a.radius[0] * a.radius[2]).slice(0, caverns);
        cav.forEach((c, i) => spots.push({ name: `${b}:cavern${i}`, at: c.centre }));
      }
      for (const l of L.lairs) spots.push({ name: `lair:${l.biome}`, at: l.centre });
      spots.push({ name: 'gate', at: L.gate.stand });
      if (L.heart) spots.push({ name: 'heart', at: L.heart.spawn });
      const out = [];
      for (const s of spots) {
        const at = D.standableNear(s.at[0], s.at[1], s.at[2]);
        if (!at) continue;
        D.teleport(at[0], at[1], at[2]);
        // Few rendered frames (each is a full SwiftShader render): the meshes round the spot are
        // built (meshIdle), the cull and the biome look follow in a frame or two.
        D.step(2, 0.1);
        D.meshIdle?.();
        D.step(1, 0.1);
        let worst = { calls: 0, tris: 0, yaw: 0 };
        let sumC = 0;
        let sumT = 0;
        for (let k = 0; k < HEADINGS; k++) {
          const yaw = (k / HEADINGS) * Math.PI * 2;
          g.player.yaw = yaw + Math.PI;
          D.look(yaw, -0.08);
          // One game frame (it renders the whole frame: the scene and the post passes).
          D.step(1, 0.05);
          const info = g.renderer.gl.info.render;
          sumC += info.calls;
          sumT += info.triangles;
          if (info.calls > worst.calls || (info.calls === worst.calls && info.triangles > worst.tris)) worst = { calls: info.calls, tris: info.triangles, yaw: +yaw.toFixed(2) };
        }
        out.push({ name: s.name, biome: D.biomeHere(), at: at.map((v) => +v.toFixed(1)), meanCalls: Math.round(sumC / HEADINGS), meanTris: Math.round(sumT / HEADINGS), maxCalls: worst.calls, maxTris: worst.tris, worstYaw: worst.yaw });
      }
      return { stratum: n, biomes: L.biomes, spots: out };
    }, { n, caverns: Number(opt.caverns), headings: Number(opt.headings) });
    const maxC = Math.max(...r.spots.map((s) => s.maxCalls));
    const maxT = Math.max(...r.spots.map((s) => s.maxTris));
    console.log(`stratum ${n} (${r.biomes.join(', ')}): ${r.spots.length} spots, worst ${maxC} calls, ${Math.round(maxT / 1000)}k tris`);
    for (const s of r.spots) console.log(`  ${s.name.padEnd(28)} mean ${String(s.meanCalls).padStart(3)} calls ${String(Math.round(s.meanTris / 1000)).padStart(4)}k | max ${String(s.maxCalls).padStart(3)} calls ${String(Math.round(s.maxTris / 1000)).padStart(4)}k (yaw ${s.worstYaw})`);
    result.strata.push({ ...r, maxCalls: maxC, maxTris: maxT });
  }
  if (logs.length) console.log(logs.slice(0, 12).join('\n'));
} finally {
  mkdirSync(dirname(opt.out), { recursive: true });
  writeFileSync(opt.out, JSON.stringify(result, null, 1));
  await browser.close();
  await (server.close?.() ?? server.httpServer?.close());
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s -> ${opt.out}`);
}
