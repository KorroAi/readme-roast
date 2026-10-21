// VIS debugging probe: breakdown of visible meshes (draw-call sources) at a first-person view.
// Usage: node tools/vis-probe.mjs x y z yaw pitch
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const [x, y, z, yaw, pitch] = process.argv.slice(2).map(Number);
const server = await createServer({ server: { port: 5276, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${url}index.html`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 240000 });
  await page.evaluate(async () => { await window.__DD__.game.newGame(); });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing');
  const out = await page.evaluate(({ x, y, z, yaw, pitch }) => {
    const D = window.__DD__; const g = D.game;
    const s = D.standableNear(x, y, z); D.teleport(s[0], s[1], s[2]); D.look(yaw, pitch); D.step(20);
    // Visible objects per source (before frustum culling); `calls` is what the frame really drew.
    const counts = {};
    g.scene.traverseVisible((o) => {
      if (!o.isMesh && !o.isPoints && !o.isInstancedMesh) return;
      let p = o; let tag = o.name || '';
      while (p && !tag) { p = p.parent; tag = p?.name || ''; }
      const key = (o.parent?.name || tag || o.type).replace(/_[-0-9_]+$/, '');
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return { counts, calls: D.report().render.calls };
  }, { x, y, z, yaw, pitch });
  console.log(JSON.stringify(out));
} finally { await browser.close(); await server.close(); }
