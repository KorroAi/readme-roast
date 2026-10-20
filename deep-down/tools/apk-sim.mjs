// Run the files packaged inside the APK the way android/MainActivity serves them: from the
// virtual origin https://appassets.androidplatform.net/ with the same MIME table, every other
// request refused (data:/blob: pass through). Then play the opening of the game on a phone-sized
// touch viewport. This checks packaging, relative paths, module workers and storage on that
// origin, the bundled privacy statement and licences, and the crash panel: a first launch lands in the
// shaft, a real tap digs, a save survives a reload (the menu at the surface offers Descend). It is not a
// device test: a real Android WebView may still differ.
//
// Usage: node tools/apk-sim.mjs [path/to/deep-down-debug.apk]
// SwiftShader under load is slow: every wait allows minutes, and the load average is printed so
// a timeout on a busy machine can be told apart from a real failure.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const apk = process.argv[2] ?? 'android/build/deep-down-debug.apk';
const dir = mkdtempSync(join(tmpdir(), 'dd-apk-'));
execFileSync('unzip', ['-q', apk, 'assets/www/*', '-d', dir]);
const www = join(dir, 'assets/www');
const HOST = 'appassets.androidplatform.net';
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', wasm: 'application/wasm', webmanifest: 'application/manifest+json', txt: 'text/plain' };
const WAIT = 180_000;
const load = () => loadavg().map((n) => n.toFixed(2)).join(' ');
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)} s`;
console.log(`apk-sim: ${apk}; load average ${load()}`);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
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
  // MainActivity answers every file with the "utf-8" encoding (WebResourceResponse).
  const type = MIME[ext] ?? 'application/octet-stream';
  return route.fulfill({ status: 200, contentType: type.startsWith('text/') ? `${type}; charset=utf-8` : type, headers: { 'Cache-Control': 'no-cache' }, body: readFileSync(file) });
});
const page = await ctx.newPage();
const problems = [];
let expectErrors = false;
page.on('pageerror', (e) => expectErrors || problems.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && !expectErrors && problems.push('console: ' + m.text()));
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
  if (!ok) process.exitCode = 1;
};
const atMode = (m) => page.waitForFunction((x) => window.__DD__?.idle?.ready && window.__DD__.idle.mode() === x, m, { timeout: WAIT });
const atMenu = () => atMode('menu');

try {
  await page.goto(`https://${HOST}/index.html`);
  // A first launch goes straight into the shaft.
  await atMode('playing');
  check(true, `a first launch boots into the shaft from the APK files (${since()})`);
  const version = await page.evaluate(() => window.__DD_RELEASE__?.version ?? null);
  const packaged = JSON.parse(readFileSync(join(www, 'version.json'), 'utf8'));
  check(version?.versionCode === packaged.versionCode && version?.version === packaged.version, `the game reports version ${version?.version} (versionCode ${version?.versionCode}), as packaged`);
  // A real tap on the floor digs.
  await page.evaluate(() => window.__DD__.idle.clearEvents());
  const floor = await page.evaluate(() => {
    const c = window.__DD__.idle.columns();
    const s = c.strips[3];
    return { x: (s.left + s.right) / 2, y: c.floorY + 18 };
  });
  for (let i = 0; i < 3; i++) await page.touchscreen.tap(floor.x, floor.y);
  await page.waitForFunction(() => window.__DD__.idle.events('tap:hit').length > 0, null, { timeout: WAIT });
  check(true, `a real tap digs the floor (${since()})`);
  // Streaming: the window built at boot is generated in place, so descend for real (a strong crew, no jump)
  // until a slab arrives from the module worker.
  await page.evaluate(() => {
    const g = window.__DD__.internals.game;
    window.__DD__.idle.give({ gold: '1e30' });
    for (let i = 0; i < 60; i++) for (const c of [...g.cards('crew', 'x1'), ...g.cards('dig', 'x1')]) g.buy(c.id, false, 0);
  });
  const streamed = await page.waitForFunction(() => window.__DD__.internals.game.scene.debug.slabs().applied > 0, null, { timeout: WAIT }).then(() => true, () => false);
  const slabs = await page.evaluate(() => ({ ...window.__DD__.internals.game.scene.debug.slabs(), depth: window.__DD__.idle.state().run.depth }));
  check(streamed && slabs.worker === true, `slabs streamed from the module worker while descending (${JSON.stringify(slabs)})`);
  // The icons are one inline SVG sprite sheet (no image files): every HUD icon resolves to a symbol.
  const icons = await page.evaluate(() => {
    const uses = [...document.querySelectorAll('#ui use')];
    return { uses: uses.length, missing: uses.filter((u) => !document.querySelector(u.getAttribute('href') ?? '#none')).length };
  });
  check(icons.uses > 0 && icons.missing === 0, `HUD icons resolve from the sprite sheet (${icons.uses} uses, ${icons.missing} missing)`);
  const saved = await page.evaluate(() => window.__DD__.idle.save());
  const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('deepdown.save')).length);
  check(saved && stored > 0, `save written to localStorage on the app origin (${stored} keys)`);
  await page.reload();
  await atMenu();
  check(await page.getByRole('button', { name: /Descend/i }).count() > 0, `after a reload the menu at the surface offers Descend (${since()})`);

  // The bundled privacy statement and licences open offline from the app origin.
  const doc = await ctx.newPage();
  await doc.goto(`https://${HOST}/privacy.html`);
  const privacy = await doc.evaluate(() => ({ h1: document.querySelector('h1')?.textContent ?? '', text: document.body.innerText, scripts: document.scripts.length, links: document.querySelectorAll('link[href], img[src]').length }));
  check(privacy.h1 === 'Privacy' && /does not collect any data/.test(privacy.text) && privacy.scripts === 0 && privacy.links === 0, 'privacy.html renders offline, self-contained (no scripts, no external files)');
  const licences = await doc.goto(`https://${HOST}/licenses.txt`);
  const licText = (await licences?.text()) ?? '';
  const licType = licences?.headers()['content-type'] ?? '';
  check(licType.startsWith('text/plain') && /Copyright © 2010-\d{4} three\.js authors/.test(licText) && /Permission is hereby granted, free of charge/.test(licText), `licenses.txt (${licType}) carries the three.js copyright and the MIT text`);
  await doc.close();

  // Crash panel: a GPU call that throws after boot (the release audit's probe) must end in the panel.
  expectErrors = true;
  await page.evaluate(() => {
    const proto = WebGL2RenderingContext.prototype;
    proto.drawElements = function () {
      throw new Error('apk-sim: simulated GPU driver failure');
    };
  });
  const shown = await page.waitForSelector('.dd-crash', { timeout: 30_000 }).then(() => true, () => false);
  const panelText = shown ? await page.locator('.dd-crash').innerText() : '';
  check(shown && /DEEP DOWN hit a problem\. Your last autosave is safe\./.test(panelText) && /Restart/.test(panelText) && /Copy details/.test(panelText), `crash panel shows after a GPU failure (${since()})`);
  const back = await page.evaluate(() => window.deepDownBack?.());
  check(back === false, 'Back on the crash panel exits (deepDownBack returns false)');
  if (shown) {
    await page.locator('.dd-crash-restart').tap();
    await atMenu();
    expectErrors = false;
    check(await page.getByRole('button', { name: /Descend/i }).count() > 0, `Restart reloads to the menu with Descend (${since()})`);
  }
} catch (e) {
  check(false, `${e instanceof Error ? e.message.split('\n')[0] : e} (after ${since()}, load average ${load()})`);
}
check(refused.length === 0, `no request left the app origin (${refused.length} refused${refused.length ? ': ' + refused.slice(0, 3).join(', ') : ''})`);
check(problems.length === 0, `no page errors (${problems.slice(0, 3).join(' | ')})`);
console.log(`served ${served.length} requests; total ${since()}; load average ${load()}`);
await browser.close();
