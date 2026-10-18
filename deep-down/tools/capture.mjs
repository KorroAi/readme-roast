// Capture real WebGL screenshots in headless Chromium (SwiftShader) for visual inspection.
//
// Usage:
//   node tools/capture.mjs [--page index.html] [--out artifacts/shots] [--size 1280x720] [--wait 4000]
//                          name=query [name=query ...]
// Each shot loads `${page}?${query}`, waits until window.__DD__.ready, then a few extra frames.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { page: 'index.html', out: 'artifacts/shots', size: '1280x720', wait: '1500', dpr: '1', timeout: '120000' };
const shots = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else {
    const eq = a.indexOf('=');
    shots.push({ name: a.slice(0, eq), query: a.slice(eq + 1) });
  }
}
if (!shots.length) shots.push({ name: 'default', query: '' });
const [width, height] = opt.size.split('x').map(Number);
mkdirSync(opt.out, { recursive: true });

const server = await createServer({ server: { port: 5199, strictPort: false, hmr: false }, logLevel: 'error' });
await server.listen();
const port = server.config.server.port ?? 5199;
const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${port}/`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
try {
  for (const shot of shots) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr) });
    const logs = [];
    page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
    const t0 = Date.now();
    await page.goto(`${url}${opt.page}?${shot.query}`);
    try {
      await page.waitForFunction(() => window.__DD__ && window.__DD__.ready, null, { timeout: Number(opt.timeout), polling: 250 });
    } catch (e) {
      console.log(`[${shot.name}] not ready:`, logs.slice(-10).join('\n'));
      throw e;
    }
    await page.waitForTimeout(Number(opt.wait));
    const file = `${opt.out}/${shot.name}.png`;
    await page.screenshot({ path: file });
    const info = await page.evaluate(() => JSON.stringify(window.__DD__.report ? window.__DD__.report() : { info: window.__DD__.info, chunks: window.__DD__.chunks, frames: window.__DD__.frames }));
    console.log(`[${shot.name}] ${file} ${Date.now() - t0}ms ${info}`);
    const errs = logs.filter((l) => l.includes('error') || l.includes('warn'));
    if (errs.length) console.log(errs.slice(0, 8).join('\n'));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
