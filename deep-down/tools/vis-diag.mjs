// VIS (round 3): a light/cull diagnostic of one or more real-camera spots (no rubric shot): the
// lantern's light (its uniforms and its 32^3 field), the cave culler (chunks known, reached, drawn),
// the chunk under the view, the camera, then a DPR-1 screenshot; again after 20 more frames.
// Usage: node tools/vis-diag.mjs --spots "1:96.5,20,124.5,5.89;2:87.5,37,80.5,0.98" [--out artifacts/r3/vis/diag]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { spots: '1:96.5,20,124.5,5.89;2:87.5,37,80.5,0.98', out: 'artifacts/r3/vis/diag', seed: '7', port: '4175', fps: '0.05' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
mkdirSync(opt.out, { recursive: true });
const server = await createServer({ server: { port: Number(opt.port), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${url}index.html?gen=strata`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 420000, polling: 500 });
  await page.evaluate(async ({ seed, fps }) => {
    const st = document.createElement('style');
    st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-tut,.dd-arrival{display:none!important}';
    document.head.appendChild(st);
    const g = window.__DD__.game;
    g.updateSettings({ quality: 'balanced' });
    await g.newGame(Number(seed));
    (g.quests ?? g.loop?.quests)?.skipTutorial?.();
    window.__DD__.mobs?.auto?.(false);
    window.__DD__.mobs?.clear?.();
    g.renderer.preset = { ...g.renderer.preset, fpsCap: Number(fps) };
  }, { seed: opt.seed, fps: opt.fps });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 180000 });
  console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const report = (label) => page.evaluate((label) => {
    const D = window.__DD__;
    const g = D.game;
    const s = g.session;
    const c = s.chunks;
    const w = s.world;
    const u = s.rig.uniforms;
    const cam = g.cameraRig.camera;
    const p = g.player;
    const f = s.lantern;
    let lit = 0;
    let sum = 0;
    for (let i = 0; i < f.data.length; i++) if (f.data[i]) { lit++; sum += f.data[i]; }
    const cs = w.chunkSize;
    const dir = cam.getWorldDirection(cam.position.clone());
    const probe = [p.x + dir.x * 4, p.y - 0.5, p.z + dir.z * 4];
    const ci = w.chunkIndex(Math.floor(probe[0] / cs), Math.floor(probe[1] / cs), Math.floor(probe[2] / cs));
    const mesh = c.meshes[ci];
    const r = g.renderer.gl.info.render;
    const v = (x) => (x && typeof x.x === 'number' ? [x.x, x.y, x.z].map((n) => +n.toFixed(2)) : x);
    return {
      label,
      stratum: g.strata.current,
      mode: g.mode,
      screen: g.ui.screen,
      player: v(p),
      vel: [p.vx, p.vy, p.vz].map((n) => +Number(n).toFixed(2)),
      grounded: p.grounded,
      camDir: v(dir),
      cam: v(cam.position),
      camRot: [cam.rotation.x, cam.rotation.y, cam.rotation.z].map((n) => +n.toFixed(2)),
      lantern: { pos: v(u.uLanternPos.value), origin: v(u.uLanternOrigin.value), radius: +u.uLanternRadius.value.toFixed(2), intensity: +u.uLanternIntensity.value.toFixed(3), color: v(u.uLanternColor.value), fieldLit: lit, fieldMean: lit ? Math.round(sum / lit) : 0, fieldAt: [f.originX, f.originY, f.originZ], last: [f.lastX, f.lastY, f.lastZ].map((n) => +Number(n).toFixed(2)), fuel: g.lanternFuel?.fraction, on: g.lanternFuel?.lit },
      cull: { drawn: c.culledVisible, known: c.culler.known, reached: c.culler.reached, meshes: c.meshes.filter(Boolean).length, view: c.viewDistance, caveCulling: c.caveCulling },
      probeChunk: { at: probe.map((n) => +n.toFixed(1)), solidBelow: D.isSolid(Math.floor(probe[0]), Math.floor(probe[1]), Math.floor(probe[2])), mesh: !!mesh, visible: mesh ? mesh.visible : null, seen: c.chunkDrawnAt(probe[0], probe[1], probe[2]) },
      render: { calls: r.calls, tris: r.triangles },
      atmos: u.uAtmos ? v(u.uAtmos.value) : null,
      revision: w.revision,
    };
  }, label);
  for (const spot of opt.spots.split(';')) {
    const [st, rest] = spot.split(':');
    const [x, y, z, yaw] = rest.split(',').map(Number);
    await page.evaluate(async ({ st }) => {
      const D = window.__DD__;
      if (D.game.strata.current !== st) await D.stratum(st);
      D.mobs?.clear?.();
    }, { st: Number(st) });
    await page.evaluate(({ x, y, z, yaw }) => {
      const D = window.__DD__;
      const g = D.game;
      D.teleport(x, y, z);
      g.player.yaw = yaw + Math.PI;
      D.look(yaw, -0.08);
      D.step(3, 0.34);
    }, { x, y, z, yaw });
    console.log(JSON.stringify(await report(`s${st} after step(3, 0.34)`)));
    await page.evaluate(async () => {
      const D = window.__DD__;
      await D.meshIdle?.();
      D.step(1, 0.05);
      await D.meshIdle?.();
      D.step(1, 0.02);
    });
    console.log(JSON.stringify(await report(`s${st} as shot`)));
    await page.screenshot({ path: `${opt.out}/s${st}-a.png`, timeout: 120000 });
    await page.evaluate(async () => {
      const D = window.__DD__;
      for (let i = 0; i < 20; i++) D.step(1, 0.05);
      await D.meshIdle?.();
      D.step(1, 0.05);
    });
    console.log(JSON.stringify(await report(`s${st} +21 frames`)));
    await page.screenshot({ path: `${opt.out}/s${st}-b.png`, timeout: 120000 });
    console.log(`[diag] s${st} shots ${opt.out}/s${st}-a.png, -b.png (${((Date.now() - t0) / 1000).toFixed(0)} s in)`);
  }
  if (logs.length) console.log(logs.slice(0, 15).join('\n'));
} finally {
  await browser.close();
  await server.close();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
