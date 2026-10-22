// WORLD tool (round 3): JS heap after boot + New Game, legacy world vs a stratum, on a running preview (port 4176).
// Usage: node tools/strata-heap.mjs
import { chromium } from '@playwright/test';
const PORT = Number(process.env.DD_E2E_PORT ?? 4176);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
for (const gen of ['legacy', 'strata']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`http://localhost:${PORT}/index.html?gen=${gen}`);
  await page.waitForFunction(() => window.__DD__?.ready, null, { timeout: 240000 });
  await page.evaluate(() => window.__DD__.game?.newGame?.() ?? document.querySelector('[data-action="new"]')?.click());
  await page.waitForTimeout(8000);
  const heap = await page.evaluate(() => { globalThis.gc?.(); return performance.memory.usedJSHeapSize; });
  const st = await page.evaluate(() => window.__DD__.state().mode);
  console.log(gen, 'mode', st, 'usedJSHeapSize MB', (heap / 1e6).toFixed(1));
  await page.close();
}
await browser.close();
