// A scripted play session of the first-person game in headless Chromium (SwiftShader), portrait, with REAL touches
// (CDP, stamped with the finger's own times: the game reads event.timeStamp, src/ui/hybrid/TapSurface.ts).
//
// Usage: node tools/play.mjs script.json [outDir=artifacts/play] [size=390x844] [dpr=1]
// The script is a list of steps; each may hold any of:
//   { "tap": [x, y] }                    one touch at a point (CSS px)
//   { "face": 3, "n": 20, "every": 150 } n taps on the face's front block in column 3 (any live block when gone),
//                                        `every` ms apart (default 1, 150); stops when the drift ends
//   { "hud": "card-pick" }               tap a HUD control by its __DD__.hybrid.hud() rect key (card-pick, menu, goal, …)
//   { "hold": "card-pick", "ms": 1500 }  press and hold a HUD control (or { "hold": [x, y] } a point)
//   { "drag": [x, y, dx, dy], "ms": 300 } a drag (Explore's look)
//   { "floor": 4 }                       tap the 4th visible floor point 2-9 m away (Explore's walk)
//   { "eval": "js" }                     evaluate in the page (window.__DD__.hybrid is the surface), print the result
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
const touch = async (type, pts, at = Date.now()) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id ?? 1, radiusX: 8, radiusY: 8, force: 1 })), timestamp: at / 1000 });
const tapAt = async (x, y) => {
  const t = Date.now();
  await touch('touchStart', [{ x, y, id: 2 }], t);
  await touch('touchEnd', [], t + 60);
};
const holdAt = async (p, ms) => {
  const t = Date.now();
  await touch('touchStart', [{ ...p, id: 3 }], t);
  await page.waitForTimeout(ms);
  await touch('touchEnd', [], t + ms);
};
const dragFrom = async ([x, y, dx, dy], ms) => {
  const t = Date.now();
  await touch('touchStart', [{ x, y, id: 4 }], t);
  for (let i = 1; i <= 10; i++) {
    const at = t + (ms * i) / 10;
    const wait = at - Date.now();
    if (wait > 0) await page.waitForTimeout(wait);
    await touch('touchMove', [{ x: x + (dx * i) / 10, y: y + (dy * i) / 10, id: 4 }], at);
  }
  await touch('touchEnd', [], t + ms + 16);
};
const rect = async (key) => {
  const r = await page.evaluate((k) => window.__DD__.hybrid.hud().rects[k], key);
  if (!r || !r.visible) throw new Error(`no visible HUD control ${key}`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const frames = async (n) => {
  const f0 = await page.evaluate(() => window.__DD__.hybrid.frame());
  await page.waitForFunction((t) => window.__DD__.hybrid.frame() >= t, f0 + n, { timeout: 240_000, polling: 50 });
};
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
try {
  await page.goto(`${url}index.html`);
  await page.waitForFunction(() => window.__DD__?.hybrid?.ready, null, { timeout: 180_000 });
  for (const step of steps) {
    if (step.tap) await tapAt(step.tap[0], step.tap[1]);
    if (step.face !== undefined) {
      for (let i = 0; i < (step.n ?? 1); i++) {
        const p = await page.evaluate((c) => {
          if (window.__DD__.hybrid.node().phase !== 'drift') return null;
          const cs = window.__DD__.hybrid.faceCells();
          const r = (cs.find((x) => x.col === c) ?? cs[0])?.rect;
          return r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { wait: true };
        }, step.face);
        if (!p) break;
        if (!p.wait) await tapAt(p.x, p.y);
        await page.waitForTimeout(step.every ?? 150);
      }
    }
    if (step.floor !== undefined) {
      const pts = await page.evaluate(() => window.__DD__.hybrid.floorPoints(8, 2, 9));
      const f = pts[Math.min(step.floor, pts.length - 1)];
      if (!f) throw new Error('no floor point on screen');
      await tapAt(f.x, f.y);
    }
    if (step.drag) await dragFrom(step.drag, step.ms ?? 300);
    if (step.hud) {
      const p = await rect(step.hud);
      await tapAt(p.x, p.y);
    }
    if (step.hold) await holdAt(Array.isArray(step.hold) ? { x: step.hold[0], y: step.hold[1] } : await rect(step.hold), step.ms ?? 1000);
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
