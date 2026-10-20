// A scripted play session of the idle game in headless Chromium (SwiftShader), portrait, with REAL touches (CDP).
//
// Usage: node tools/play.mjs script.json [outDir=artifacts/play] [size=390x844] [dpr=1]
// The script is a list of steps; each may hold any of:
//   { "tap": [x, y] }                    one touch at a point (CSS px)
//   { "col": 3, "n": 20, "every": 150 }  n taps on a floor column (0..6), `every` ms apart (default 1, 150)
//   { "hud": "quick:0" }                 tap a HUD control by its __DD__.idle.hud() rect key (tab:dig, quick:2, …)
//   { "hold": "quick:0", "ms": 1500 }    press and hold a HUD control
//   { "eval": "js" }                     evaluate in the page (window.__DD__.idle is the surface), print the result
//   { "frames": 10 }                     wait for that many drawn frames
//   { "wait": 500 }                      wait (ms)
//   { "shot": "name" }                   screenshot to outDir/name.png
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';

const [, , scriptPath, outDir = 'artifacts/play', size = '390x844', dpr = '1'] = process.argv;
if (!scriptPath) {
  console.log('usage: node tools/play.mjs script.json [outDir] [size] [dpr]');
  process.exit(2);
}
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
const [width, height] = size.split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5196, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: Number(dpr), hasTouch: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 8, radiusY: 8, force: 1 })) });
const tapAt = async (x, y) => {
  await touch('touchStart', [{ x, y, id: 2 }]);
  await touch('touchEnd', []);
};
const rect = async (key) => {
  const r = await page.evaluate((k) => window.__DD__.idle.hud().rects[k], key);
  if (!r || !r.visible) throw new Error(`no visible HUD control ${key}`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const frames = async (n) => {
  const f0 = await page.evaluate(() => window.__DD__.idle.frame());
  await page.waitForFunction((t) => window.__DD__.idle.frame() >= t, f0 + n, { timeout: 240_000, polling: 50 });
};
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
try {
  await page.goto(`${url}index.html`);
  await page.waitForFunction(() => window.__DD__?.idle?.ready, null, { timeout: 180_000 });
  for (const step of steps) {
    if (step.tap) await tapAt(step.tap[0], step.tap[1]);
    if (step.col !== undefined) {
      for (let i = 0; i < (step.n ?? 1); i++) {
        const p = await page.evaluate((c) => {
          const cs = window.__DD__.idle.columns();
          const s = cs.strips[c];
          return { x: (s.left + s.right) / 2, y: cs.floorY + 18 };
        }, step.col);
        await tapAt(p.x, p.y);
        await page.waitForTimeout(step.every ?? 150);
      }
    }
    if (step.hud) {
      const p = await rect(step.hud);
      await tapAt(p.x, p.y);
    }
    if (step.hold) {
      const p = await rect(step.hold);
      await touch('touchStart', [{ ...p, id: 3 }]);
      await page.waitForTimeout(step.ms ?? 1000);
      await touch('touchEnd', []);
    }
    if (step.eval) {
      const r = await page.evaluate(step.eval);
      if (r !== undefined) console.log('eval ->', typeof r === 'string' ? r : JSON.stringify(r));
    }
    if (step.frames) await frames(step.frames);
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.shot) {
      // SwiftShader under load can take seconds per frame: allow it rather than fail the session.
      await page.screenshot({ path: `${outDir}/${step.shot}.png`, timeout: 240_000 });
      console.log('shot', step.shot);
    }
  }
} finally {
  const bad = logs.filter((l) => /error|warn/i.test(l));
  if (bad.length) console.log(bad.slice(0, 20).join('\n'));
  await browser.close();
  await server.close();
}
