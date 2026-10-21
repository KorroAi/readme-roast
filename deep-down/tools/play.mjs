// Scripted play session in headless Chromium for visual/gameplay checks, with real touches.
// Usage: node tools/play.mjs script.json [outDir] [WxH] [dpr] [touch]
//   script: [{ ...step }, ...]. Each step may, in this order:
//   - "eval": "js"            evaluate JS in the page (window.__DD__ available; the result is printed)
//   - "click": "regex"        click the button whose accessible name matches
//   - "tap": [x, y]           a real touch tap at CSS px (CDP touch events)
//   - "tapWorld": [x, y, z]   a real touch tap where a world point is on screen now (or "js" returning one)
//   - "tapSel": "css"         a real touch tap on the centre of the first element matching
//   - "drag": [x0, y0, x1, y1, holdMs?]  a real touch drag
//   - "hold": [x, y, ms]      a real touch press held still
//   - "until": "js", "seconds": n   poll until the JS is truthy (n seconds of game time, default 10)
//   - "wait": ms              wait
//   - "shot": "name"          take a screenshot (outDir/name.png)
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';

const [, , scriptPath, outDir = 'artifacts/play', size = '1280x720', dpr = '1', touch = '0'] = process.argv;
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
const [width, height] = size.split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5196, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(dpr), hasTouch: true, isMobile: touch === '1' });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
const cdp = await page.context().newCDPSession(page);
const touchEv = (type, pts, id = 5) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const tap = async (x, y) => {
  await touchEv('touchStart', [{ x, y }]);
  await page.waitForTimeout(60);
  await touchEv('touchEnd', []);
};
const drag = async (x0, y0, x1, y1, holdMs = 0) => {
  const at = (k) => ({ x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k });
  await Promise.all([touchEv('touchStart', [{ x: x0, y: y0 }]), touchEv('touchMove', [at(0.125)])]);
  for (let i = 2; i <= 8; i++) await touchEv('touchMove', [at(i / 8)]);
  if (holdMs) await page.waitForTimeout(holdMs);
  await touchEv('touchEnd', []);
};
const screenOf = (p) =>
  page.evaluate(([x, y, z]) => {
    const cam = window.__DD__.game.cameraRig.camera;
    cam.updateMatrixWorld();
    const v = new cam.position.constructor(x, y, z).project(cam);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }, p);
const clock = () => page.evaluate(() => window.__DD__.game.session.rig.uniforms.uTime.value);
let failed = false;
try {
  await page.goto(`${url}index.html`);
  await page.waitForFunction(() => window.__DD__?.ready, null, { timeout: 180000 });
  for (const step of steps) {
    try {
      if (step.eval) {
        const r = await page.evaluate(step.eval);
        if (r !== undefined) console.log('eval ->', typeof r === 'string' ? r : JSON.stringify(r));
      }
      if (step.click) await page.getByRole('button', { name: new RegExp(step.click, 'i') }).first().click({ timeout: 60_000 });
      if (step.tap) await tap(step.tap[0], step.tap[1]);
      if (step.tapWorld) {
        // A literal [x, y, z], or a JS expression that returns one.
        const w = typeof step.tapWorld === 'string' ? await page.evaluate(step.tapWorld) : step.tapWorld;
        const s = w ? await screenOf(w) : null;
        console.log('tapWorld ->', s ? `${s.x.toFixed(0)},${s.y.toFixed(0)}` : 'off screen');
        if (s) await tap(Math.round(s.x), Math.round(s.y));
      }
      if (step.tapSel) {
        const r = await page.locator(step.tapSel).first().boundingBox({ timeout: 30_000 });
        if (r) await tap(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
        else console.log('tapSel -> not found', step.tapSel);
      }
      if (step.drag) await drag(...step.drag);
      if (step.hold) {
        await touchEv('touchStart', [{ x: step.hold[0], y: step.hold[1] }]);
        await page.waitForTimeout(step.hold[2]);
        await touchEv('touchEnd', []);
      }
      if (step.until) {
        const t0 = await clock();
        const wall = Date.now();
        let ok = false;
        for (;;) {
          ok = !!(await page.evaluate(step.until));
          if (ok || (await clock()) - t0 > (step.seconds ?? 10) || Date.now() - wall > 240_000) break;
          await page.waitForTimeout(200);
        }
        console.log('until', ok ? 'ok' : 'TIMED OUT', step.until.slice(0, 80));
      }
      if (step.wait) await page.waitForTimeout(step.wait);
      if (step.shot) {
        // SwiftShader under load can take minutes per frame: allow it rather than fail the tour.
        await page.screenshot({ path: `${outDir}/${step.shot}.png`, timeout: 240_000 });
        console.log('shot', step.shot);
      }
    } catch (e) {
      failed = true;
      console.log('STEP FAILED', JSON.stringify(step).slice(0, 120), String(e).slice(0, 300));
    }
  }
} finally {
  const bad = logs.filter((l) => /error|warn/i.test(l));
  if (bad.length) console.log(bad.slice(0, 20).join('\n'));
  await browser.close();
  await server.close();
  if (failed) process.exitCode = 1;
}
