// Capture the lantern look spike in headless Chromium (SwiftShader), portrait 390 x 844 at DPR 2.
//
// Usage: node tools/spike-capture.mjs --out <dir> --prefix r1- [--url http://localhost:4182/spike.html] [shots...]
// Shots: arrival, mining (real CDP tap on an ore block, then 120 ms of game clock), grotto, magma, perf.
// The page runs with ?capture=1: a manual clock (window.__SPIKE__.advance) so every frame is deterministic.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: '.', prefix: 'r-', url: 'http://localhost:4182/spike.html', dpr: '2' };
const shots = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
  else shots.push(args[i]);
}
if (!shots.length) shots.push('arrival', 'mining', 'grotto', 'magma');
mkdirSync(opt.out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(opt.dpr), hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => {
  const t = m.text();
  if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${t.slice(0, 2000)}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`${opt.url}?capture=1&dpr=${opt.dpr}`, { waitUntil: 'load', timeout: 300000 });
await page.waitForFunction(() => window.__SPIKE__?.ready === true, null, { timeout: 300000, polling: 250 }).catch(() => {});
const info = {};
info.load = { wallMs: Date.now() - t0, ...(await page.evaluate(() => window.__SPIKE__?.info?.() ?? null)) };
const cdp = await ctx.newCDPSession(page);
const touch = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 6, radiusY: 6, force: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const shoot = async (name) => {
  const file = `${opt.out}/${opt.prefix}${name}.png`;
  await page.screenshot({ path: file });
  info[name] = await page.evaluate(() => window.__SPIKE__.info());
  console.log('shot', file, JSON.stringify(info[name]));
};
for (const s of shots) {
  if (s === 'arrival' || s === 'grotto' || s === 'magma') {
    await page.evaluate((n) => window.__SPIKE__.scene(n), s);
    await page.evaluate(() => window.__SPIKE__.advance(1000));
    await shoot(s);
  } else if (s === 'mining') {
    await page.evaluate(() => window.__SPIKE__.scene('arrival'));
    await page.evaluate(() => window.__SPIKE__.advance(1000));
    const p = await page.evaluate(() => window.__SPIKE__.oreScreen());
    console.log('ore at', p);
    await touch(p.x, p.y);
    await page.evaluate(() => window.__SPIKE__.advance(120));
    await shoot('mining');
  } else if (s === 'glide') {
    // Tap the passage floor, then let the 0.4-0.8 s glide finish.
    await page.evaluate(() => window.__SPIKE__.scene('arrival'));
    await page.evaluate(() => window.__SPIKE__.advance(500));
    await touch(222, 470);
    await page.evaluate(() => window.__SPIKE__.advance(300));
    await shoot('glide-mid');
    await page.evaluate(() => window.__SPIKE__.advance(700));
    await shoot('glide-end');
  } else if (s.startsWith('pose:')) {
    // pose:name:scene:x,y,z,yaw,pitch
    const [, name, sc, nums] = s.split(':');
    const v = nums.split(',').map(Number);
    await page.evaluate((n) => window.__SPIKE__.scene(n), sc);
    await page.evaluate((a) => window.__SPIKE__.pose(...a), v);
    await page.evaluate(() => window.__SPIKE__.advance(500));
    await shoot(name);
  } else if (s.startsWith('look:')) {
    // look:name:{json patch} - applied to the current scene (combine with a scene shot before it)
    const i1 = s.indexOf(':', 5);
    const name = s.slice(5, i1);
    const patch = JSON.parse(s.slice(i1 + 1));
    await page.evaluate((p) => window.__SPIKE__.look(p), patch);
    await shoot(name);
  } else if (s === 'perf') {
    for (const sc of ['arrival', 'grotto', 'magma']) {
      await page.evaluate((n) => window.__SPIKE__.scene(n), sc);
      const r = await page.evaluate(() => window.__SPIKE__.perf(8));
      info[`perf-${sc}`] = { ...r, ...(await page.evaluate(() => window.__SPIKE__.info())) };
      console.log('perf', sc, JSON.stringify(info[`perf-${sc}`]));
    }
  }
}
writeFileSync(`${opt.out}/${opt.prefix}info.json`, JSON.stringify({ info, logs }, null, 2));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
