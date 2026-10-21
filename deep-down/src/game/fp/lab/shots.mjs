// Dev only: render the viewmodel lab (vmlab.html) for a list of query strings and save PNGs.
// Usage: node src/game/fp/lab/shots.mjs outDir "query1" "query2" ...   (390 x 844 @2 by default; WxH@dpr as $VM_SIZE)
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const [, , outDir, ...queries] = process.argv;
const [size, dprS] = (process.env.VM_SIZE ?? '390x844@2').split('@');
const [width, height] = size.split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const server = await createServer({ server: { port: 5197, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(dprS ?? 2) });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()));
try {
  for (const [i, qs] of queries.entries()) {
    await page.goto(`${url}src/game/fp/lab/vmlab.html?${qs}`);
    await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
    const name = `${String(i).padStart(2, '0')}-${qs.replace(/[^a-z0-9=.]+/gi, '_').slice(0, 60)}`;
    await page.screenshot({ path: `${outDir}/${name}.png` });
    console.log('shot', name);
  }
} finally {
  await browser.close();
  await server.close();
}
