// Scripted play session in headless Chromium for visual/gameplay checks.
// Usage: node tools/play.mjs script.json   (script: [{ "eval": "js", "wait": ms, "shot": "name" }, ...])
// Each step may: evaluate JS in the page (with window.__DD__ available), wait, take a screenshot.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';

const [, , scriptPath, outDir = 'artifacts/play', size = '1280x720'] = process.argv;
const steps = JSON.parse(readFileSync(scriptPath, 'utf8'));
const [width, height] = size.split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5196, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
try {
  await page.goto(`${url}index.html`);
  await page.waitForFunction(() => window.__DD__?.ready, null, { timeout: 180000 });
  for (const step of steps) {
    if (step.eval) {
      const r = await page.evaluate(step.eval);
      if (r !== undefined) console.log('eval ->', typeof r === 'string' ? r : JSON.stringify(r));
    }
    if (step.wait) await page.waitForTimeout(step.wait);
    if (step.shot) {
      await page.screenshot({ path: `${outDir}/${step.shot}.png` });
      console.log('shot', step.shot);
    }
  }
} finally {
  const bad = logs.filter((l) => /error|warn/i.test(l));
  if (bad.length) console.log(bad.slice(0, 20).join('\n'));
  await browser.close();
  await server.close();
}
