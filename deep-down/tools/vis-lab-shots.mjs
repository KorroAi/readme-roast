// VIS (round 3): the Visual Lab's biome gallery, one capture per bay (?view=biomes&bay=0..13): each
// biome's floor, its two host rocks with its ores set in, its hanging and ground props, its light
// pocket and a warm lamp; bay 13 is the workshop (LOOP's stations, the camp's upgrades with the
// guardians' trophies, the works' levers, an arena's dressing).
// Usage: node tools/vis-lab-shots.mjs [--out artifacts/r3/vis/lab] [--bays 0,1,...,13] [--size 1280x720] [--dpr 1]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/r3/vis/lab', bays: Array.from({ length: 14 }, (_, i) => i).join(','), size: '1280x720', dpr: '1', port: '4175', light: 'game' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);
mkdirSync(opt.out, { recursive: true });
const server = await createServer({ server: { port: Number(opt.port), strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr) });
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text().slice(0, 300)}`); });
  // One page load; each bay is switched in place (__DD__.setBay), a few frames to settle.
  const list = opt.bays.split(',').map(Number);
  await page.goto(`${url}visuallab.html?view=biomes&bay=${list[0]}&chrome=0&labels=0${opt.light === 'game' ? '&light=game' : ''}`);
  await page.waitForFunction(() => window.__DD__?.ready, null, { timeout: 300000, polling: 500 });
  for (const bay of list) {
    await page.evaluate((n) => window.__DD__.setBay(n), bay);
    await page.waitForTimeout(2500);
    const file = `${opt.out}/bay-${String(bay).padStart(2, '0')}.png`;
    try {
      await page.screenshot({ path: file, timeout: 240000 });
      const r = await page.evaluate(() => window.__DD__.report());
      console.log(`[bay ${bay}] ${file} calls=${r.render.calls} tris=${Math.round(r.render.triangles / 1000)}k (${((Date.now() - t0) / 1000).toFixed(0)} s in)`);
    } catch (e) {
      console.log(`[bay ${bay}] screenshot failed: ${String(e.message).split('\n')[0]}`);
    }
  }
  if (logs.length) console.log(logs.slice(0, 12).join('\n'));
} finally {
  await browser.close();
  await server.close();
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
