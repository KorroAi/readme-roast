// Run the files packaged inside the APK the way android/MainActivity serves them: from the
// virtual origin https://appassets.androidplatform.net/ with the same MIME table, every other
// request refused (data:/blob: pass through). Then play the opening of the game on a phone-sized
// touch viewport. This checks packaging, relative paths, module workers and storage on that
// origin. It is not a device test: a real Android WebView may still differ.
//
// Usage: node tools/apk-sim.mjs [path/to/deep-down-debug.apk]
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const apk = process.argv[2] ?? 'android/build/deep-down-debug.apk';
const dir = mkdtempSync(join(tmpdir(), 'dd-apk-'));
execFileSync('unzip', ['-q', apk, 'assets/www/*', '-d', dir]);
const www = join(dir, 'assets/www');
const HOST = 'appassets.androidplatform.net';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', wasm: 'application/wasm', webmanifest: 'application/manifest+json' };

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 915, height: 412 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
const refused = [];
const served = [];
await ctx.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.protocol !== 'https:' || url.host !== HOST) {
    refused.push(url.href);
    return route.fulfill({ status: 403, contentType: 'text/plain', body: '' });
  }
  let path = url.pathname;
  if (!path || path === '/') path = '/index.html';
  const file = join(www, decodeURIComponent(path));
  if (!existsSync(file)) return route.fulfill({ status: 404, contentType: 'text/plain', body: '' });
  served.push(path);
  const ext = extname(path).slice(1).toLowerCase();
  return route.fulfill({ status: 200, contentType: MIME[ext] ?? 'application/octet-stream', headers: { 'Cache-Control': 'no-cache' }, body: readFileSync(file) });
});
const page = await ctx.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) process.exitCode = 1;
};

await page.goto(`https://${HOST}/index.html`);
await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 120_000 });
check(true, 'game boots to the main menu from the APK files');
const timings = await page.evaluate(() => window.__DD__.report().timings);
check(timings.worker === 1, `world generated in the module worker (${JSON.stringify(timings)})`);
await page.getByRole('button', { name: /New Expedition/i }).tap();
await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 120_000 });
check(true, 'New Expedition starts play');
const icons = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && i.naturalWidth > 0).length);
// Generated icons are data: PNGs (the shell must let them through): decode one for real.
const heart = await page.evaluate(async () => {
  const el = [...document.querySelectorAll('[style]')].find((e) => e.style.getPropertyValue('--heart-1'));
  const url = el?.style.getPropertyValue('--heart-1').match(/url\("(.*)"\)/)?.[1];
  if (!url) return 0;
  const img = new Image();
  img.src = url;
  await img.decode();
  return img.naturalWidth;
});
check(heart > 0, `HUD heart icon (data: PNG) decodes (${heart} px)`);
const saved = await page.evaluate(() => window.__DD__.save());
const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('deepdown.save')).length);
check(saved && stored > 0, `save written to localStorage on the app origin (${stored} keys)`);
await page.reload();
await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 120_000 });
check(await page.getByRole('button', { name: /Continue/i }).count() > 0, 'after a reload the menu offers Continue');
check(refused.length === 0, `no request left the app origin (${refused.length} refused${refused.length ? ': ' + refused.slice(0, 3).join(', ') : ''})`);
check(problems.length === 0, `no page errors (${problems.slice(0, 3).join(' | ')})`);
console.log(`served ${served.length} requests; ${icons} images loaded at the menu/HUD`);
await browser.close();
