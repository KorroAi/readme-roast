import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const server = await createServer({ server: { port: 5196, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${url}visuallab.html?depth=${process.argv[2] ?? 2}`);
await page.waitForFunction(() => window.__DD__ && window.__DD__.ready, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const r = await page.evaluate(async () => {
  const lab = window.__DD__.lab;
  const frames = [];
  let last = performance.now();
  let on = true;
  const loop = (t) => { frames.push(t - last); last = t; if (on) requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  await new Promise((r) => setTimeout(r, 600));
  const out = [];
  for (let i = 0; i < 6; i++) {
    const n0 = frames.length;
    const t0 = performance.now();
    lab.tap(3, false); lab.tap(3, false); lab.tap(3, false);
    await new Promise((r) => setTimeout(r, 700));
    out.push({ i, max: Math.max(...frames.slice(n0)).toFixed(0), sync: (performance.now() - t0).toFixed(0) });
  }
  on = false;
  return { base: Math.max(...frames.slice(5, 30)).toFixed(0), out };
});
console.log(JSON.stringify(r));
await browser.close();
await server.close();
