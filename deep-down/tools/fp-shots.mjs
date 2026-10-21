// First-person captures of the real game for the visual pass (VIS).
//
// Usage: node tools/fp-shots.mjs [--out artifacts/fp] [--size 390x844] [--dpr 2] [--q balanced]
//                                [--only camp,tunnel] [--hud 1] [--real 0] [--prod 0] [--port 5275] [--query ldr=1]
//
// Boots index.html (vite dev server, or dist/ with --prod 1), starts a New Expedition, then for each
// shot in tools/fp-shots.json teleports the explorer to the nearest standable cell, faces the target
// and frames the eye at 1.62 m. With --real 0 (the default) the tool places the camera itself (78°
// vertical lens, the explorer hidden, the lantern held low left like the viewmodel), so the captures do
// not depend on the camera rig in development; --real 1 keeps the game's own camera (the shipped first
// person) and only sets yaw and pitch. Prints the draw calls and triangles of each frame.
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/fp', size: '390x844', dpr: '2', q: 'balanced', only: '', hud: '1', real: '0', prod: '0', port: '5275', wait: '1800', shots: 'tools/fp-shots.json', query: '' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);
const only = opt.only ? new Set(opt.only.split(',')) : null;
const shots = JSON.parse(readFileSync(opt.shots, 'utf8')).filter((s) => !only || only.has(s.name));
mkdirSync(opt.out, { recursive: true });

const server = opt.prod === '1'
  ? await preview({ preview: { port: Number(opt.port), strictPort: false }, logLevel: 'error' })
  : await createServer({ server: { port: Number(opt.port), strictPort: false, hmr: false }, logLevel: 'error' });
if (opt.prod !== '1') await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr), hasTouch: true, isMobile: true });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${url}index.html${opt.query ? `?${opt.query}` : ''}`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 240000, polling: 250 });
  await page.evaluate(async ({ q, hud }) => {
    const st = document.createElement('style');
    st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast{display:none!important}' + (hud === '1' ? '' : '.dd-ui{display:none!important}');
    document.head.appendChild(st);
    const g = window.__DD__.game;
    g.updateSettings({ quality: q });
    await g.newGame();
    // The shots render through __DD__.step; the free-running loop only competes for SwiftShader's
    // CPU, so it idles at a few frames per second while capturing.
    g.renderer.preset = { ...g.renderer.preset, fpsCap: 4 };
  }, { q: opt.q, hud: opt.hud });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 120000 });
  await page.evaluate((real) => {
    const D = window.__DD__;
    const g = D.game;
    const rig = g.cameraRig;
    window.__fp = null;
    if (real === '1' || rig.__vis) return;
    rig.__vis = true;
    const orig = rig.update.bind(rig);
    rig.update = (...a) => {
      orig(...a);
      const f = window.__fp;
      if (!f) return;
      const c = rig.camera;
      c.position.set(f.x, f.y, f.z);
      c.rotation.order = 'YXZ';
      c.rotation.set(f.pitch, f.yaw, 0);
      c.fov = f.fov ?? 78;
      c.near = 0.06;
      c.updateProjectionMatrix();
      c.updateMatrixWorld(true);
      if (g.explorer) g.explorer.root.visible = false;
    };
    if (g.explorer) {
      const origL = g.explorer.getLanternWorldPosition.bind(g.explorer);
      g.explorer.getLanternWorldPosition = (v) => {
        const f = window.__fp;
        if (!f) return origL(v);
        // The viewmodel lantern: low left, a little ahead of the eye.
        const sy = Math.sin(f.yaw), cy = Math.cos(f.yaw);
        return v.set(f.x - sy * 0.42 - cy * 0.3, f.y - 0.5, f.z - cy * 0.42 + sy * 0.3);
      };
    }
  }, opt.real);
  for (const s of shots) {
    const res = await page.evaluate(({ s, real }) => {
      const D = window.__DD__;
      const g = D.game;
      for (const [x, y, z, id] of s.set ?? []) D.setBlock(x, y, z, id);
      if (s.eval) {
        try {
          (0, eval)(s.eval);
        } catch (e) {
          return { err: 'eval: ' + (e && e.message) };
        }
      }
      const at = D.standableNear(s.at[0], s.at[1], s.at[2]);
      if (!at) return { err: 'nostand ' + s.at };
      D.teleport(at[0], at[1], at[2]);
      const eye = [at[0], at[1] + 1.62, at[2]];
      const t = s.look;
      const yaw = Math.atan2(-(t[0] - eye[0]), -(t[2] - eye[2]));
      const pitch = s.pitch ?? Math.atan2(t[1] - eye[1], Math.hypot(t[0] - eye[0], t[2] - eye[2]));
      g.player.yaw = yaw + Math.PI;
      if (real === '1') {
        D.look(yaw, pitch);
      } else window.__fp = { x: eye[0], y: eye[1], z: eye[2], yaw, pitch, fov: s.fov };
      g.cameraRig.yaw = yaw;
      g.cameraRig.pitch = pitch;
      // A shot's eval may leave work for after the teleport (aim and mine, start a ride).
      if (window.__afterTeleport) {
        window.__afterTeleport();
        window.__afterTeleport = null;
      }
      D.step(s.frames ?? 14);
      // Back at camp the trip report opens: close it, the shot is of the world.
      const go = [...document.querySelectorAll('button')].find((b) => /Head Out Again/.test(b.textContent ?? ''));
      if (go) {
        go.click();
        D.step(4);
      }
      return { at, yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(2) };
    }, { s, real: opt.real });
    if (res.err) { console.log(`[${s.name}] ${res.err}`); continue; }
    await page.waitForTimeout(Number(opt.wait));
    await page.evaluate(() => window.__DD__.meshIdle?.());
    await page.waitForTimeout(400);
    const file = `${opt.out}/${s.name}.png`;
    await page.screenshot({ path: file, timeout: 180000 });
    const r = await page.evaluate(() => {
      const D = window.__DD__;
      const r = D.report();
      const g = D.game;
      const u = g.session.rig.uniforms;
      const v = (o) => [o.x, o.y, o.z].map((n) => +n.toFixed(2)).join(',');
      return { calls: r.render.calls, tris: Math.round(r.render.triangles / 1000) + 'k', fps: Math.round(r.fps), cam: v(g.cameraRig.camera.position), lantern: v(u.uLanternPos.value), li: +u.uLanternIntensity.value.toFixed(2), exp: +(g.renderer.post.params.exposure * g.renderer.post.params.zoneExposure).toFixed(2) };
    });
    console.log(`[${s.name}] ${file} at=${res.at.join(',')} ${JSON.stringify(r)}`);
  }
  if (logs.length) console.log(logs.slice(0, 12).join('\n'));
} finally {
  await browser.close();
  await (server.close?.() ?? server.httpServer?.close());
}
