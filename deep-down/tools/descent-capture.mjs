// Portrait captures of the descent through the Biome Lab (visuallab.html), real WebGL in headless Chromium.
//
// Usage:
//   node tools/descent-capture.mjs [--out artifacts/idle/w1] [--size 390x844] [--dpr 2] [--wait 1500]
//        name=query [name=query ...]
// The query goes to visuallab.html (depth=, crew=, pick=, look=, taps=, auto=, fx=1, menu=1, quality=).
// `--biome N --depth m` is a shortcut for one shot named biome-NN.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/idle/w1', size: '390x844', dpr: '2', wait: '1500', timeout: '120000' };
const shots = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else {
    const eq = a.indexOf('=');
    // name=query[::js[::waitMs]]: js runs on window.__DD__.lab (as `lab`) once ready, the shot follows waitMs later.
    const [query, js, waitMs] = a.slice(eq + 1).split('::');
    shots.push({ name: a.slice(0, eq), query, js, waitMs: Number(waitMs ?? 0) });
  }
}
if (opt.biome !== undefined) shots.push({ name: `biome-${String(opt.biome).padStart(2, '0')}`, query: `depth=${opt.depth ?? 0}&look=${opt.biome}` });
if (!shots.length) shots.push({ name: 'surface', query: 'depth=0' });
const [width, height] = opt.size.split('x').map(Number);
mkdirSync(opt.out, { recursive: true });

const server = await createServer({ server: { port: 5198, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5198/';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr), hasTouch: true });
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(`${url}visuallab.html?${shot.query}`);
    try {
      await page.waitForFunction(() => window.__DD__ && window.__DD__.ready, null, { timeout: Number(opt.timeout), polling: 250 });
    } catch (e) {
      console.log(`[${shot.name}] not ready:`, logs.slice(-12).join('\n'));
      throw e;
    }
    // Let the meshes settle, then the requested extra time.
    await page.evaluate(() => window.__DD__.lab.scene.world.chunks.flush());
    await page.waitForTimeout(Number(opt.wait));
    if (shot.js) {
      await page.evaluate((code) => new Function('lab', code)(window.__DD__.lab), shot.js);
      await page.waitForTimeout(shot.waitMs || 300);
    }
    if (opt.draws) {
      // Per top-level group draw calls in one frame (the P1 budget by owner).
      const per = await page.evaluate(() => {
        const lab = window.__DD__.lab;
        const scene = lab.scene.scene;
        const gl = lab.scene.renderer.gl;
        const orig = gl.renderBufferDirect.bind(gl);
        const name = (o) => {
          let p = o;
          let child = o;
          while (p.parent && p.parent !== scene) {
            child = p;
            p = p.parent;
          }
          const top = p.name || p.type;
          return top === 'world' && child !== p ? `world/${child.name || child.type}` : top;
        };
        const per = {};
        gl.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
          const k = sc === scene ? name(object) : 'post:' + (object.name || object.type);
          per[k] = (per[k] ?? 0) + 1;
          return orig(camera, sc, geometry, material, object, group);
        };
        return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => { gl.renderBufferDirect = orig; res(Object.fromEntries(Object.entries(per).map(([k, v]) => [k, v / 2]))); })));
      });
      console.log(`[${shot.name}] draws ${JSON.stringify(per)}`);
    }
    const file = `${opt.out}/${shot.name}.png`;
    await page.screenshot({ path: file, timeout: Number(opt.timeout) });
    const info = await page.evaluate(() => {
      const lab = window.__DD__.lab;
      const gl = lab.scene.renderer.gl.info;
      return JSON.stringify({ floor: lab.shaft.floor, frames: lab.frames, calls: gl.render.calls, tris: gl.render.triangles, programs: gl.programs?.length, slabs: lab.scene.debug.slabs(), dressing: lab.scene.debug.dressing(), cols: lab.scene.columns() });
    });
    console.log(`[${shot.name}] ${file} ${Date.now() - t0}ms ${info}`);
    const errs = logs.filter((l) => l.includes('error') || l.includes('warn'));
    if (errs.length) console.log(errs.slice(0, 8).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
