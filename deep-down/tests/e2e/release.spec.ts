import { expect, test, type Page } from '@playwright/test';
import { readVersion } from '../../tools/version.mjs';
import { quietDeep } from './dd';
import './dd';

// Round 2: the spawner stays off here (see quietDeep in dd.ts).
test.beforeEach(async ({ page }) => {
  await quietDeep(page);
});


// The release shell around the game (src/main.ts): the crash panel, the Android bridge
// (predictive Back, lifecycle), the context-loss notice and the automatic quality governor.

type Release = {
  version: { version: string; build: number; versionCode: number };
  crashPanel(): boolean;
  crashDetails(): string;
  backHandled(): boolean;
  governor(): { auto: boolean; lastMedianMs: number } | null;
};
type BridgeCall = { handled: boolean; mode: string; screen: string };
type Win = Window & {
  __DD_RELEASE__: Release;
  deepDownLifecycle(phase: 'pause' | 'resume'): boolean;
  DeepDownAndroid: { backCalls: BridgeCall[]; screenOn: boolean[] };
  __e2e: { firstThrow: number; crashAt: number; panelAt: number; toasts: string[]; throws: number[] };
};

// First person on an upright phone.
test.use({ viewport: { width: 390, height: 844 } });

async function waitMode(page: Page, mode: string, timeout = 180_000) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout, polling: 200 });
}

async function startExpedition(page: Page) {
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
}

/** localStorage entries of the save slots (byte-for-byte comparison across a crash). */
const saveSlots = (page: Page) =>
  page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith('deepdown.save')).sort().map((k) => [k, localStorage.getItem(k)])));

/** Record when the crash panel appears, and every toast, from the first script on. */
async function watchPage(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__e2e = { firstThrow: 0, crashAt: 0, panelAt: 0, toasts: [], throws: [] };
    // Registered before the game's scripts run, so this sees 'dd:crash' before the panel does.
    window.addEventListener('dd:crash', () => (w.__e2e.crashAt ||= performance.now()));
    new MutationObserver((records) => {
      for (const r of records)
        for (const n of r.addedNodes) {
          if (!(n instanceof HTMLElement)) continue;
          if (n.classList.contains('dd-crash') && !w.__e2e.panelAt) w.__e2e.panelAt = performance.now();
          if (n.classList.contains('dd-toast')) w.__e2e.toasts.push(n.textContent ?? '');
        }
    }).observe(document, { childList: true, subtree: true });
  });
}

test('a GPU failure ends in the crash panel; Restart returns to the pre-crash save', async ({ page }) => {
  await watchPage(page);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await startExpedition(page);
  expect(await page.evaluate(() => window.__DD__.save())).toBe(true);
  const before = await saveSlots(page);
  expect(Object.keys(before).length).toBeGreaterThan(0);

  errors.length = 0;
  await page.evaluate(() => {
    const w = window as unknown as Win;
    WebGL2RenderingContext.prototype.drawElements = function () {
      if (!w.__e2e.firstThrow) w.__e2e.firstThrow = performance.now();
      w.__e2e.throws.push(performance.now());
      throw new Error('e2e: simulated GPU driver failure');
    };
  });
  await expect(page.locator('.dd-crash')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.dd-crash-message')).toHaveText('DEEP DOWN hit a problem. Your last autosave is safe.');
  await expect(page.getByRole('button', { name: 'Restart' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy details' })).toBeVisible();
  const timing = await page.evaluate(() => (window as unknown as Win).__e2e);
  const ms = (t: number) => Math.round(t - timing.firstThrow);
  console.log(`crash timing: failed frames at +${timing.throws.slice(0, 3).map(ms).join(', +')} ms, dd:crash at +${ms(timing.crashAt)} ms, panel at +${ms(timing.panelAt)} ms`);
  expect(timing.firstThrow).toBeGreaterThan(0);
  // The game's guard needs 3 failed frames; SwiftShader renders this scene at a few frames per
  // second (a phone at 30-60), so the guard's share is bounded loosely and the panel's tightly.
  expect(timing.crashAt - timing.firstThrow, 'guard trips within 3 frames').toBeLessThan(5000);
  expect(timing.panelAt - timing.crashAt, 'panel within 1 s of the crash').toBeLessThan(1000);
  expect(await page.evaluate(() => window.__DD__.state().mode)).toBe('crashed');
  // Let a few more frames come and go: the stopped loop must stay quiet and save nothing.
  await page.waitForTimeout(1500);
  const savesAfter = await page.evaluate((t0) => window.__DD__.events('game:saved').filter((e) => e.t >= t0).length, timing.firstThrow);
  expect(savesAfter, 'no game:saved after the first error').toBe(0);
  expect(errors.length, `console errors: ${errors.slice(0, 3).join(' | ')}`).toBeLessThan(10);
  expect(await page.evaluate(() => window.deepDownBack?.())).toBe(false);
  const details = await page.evaluate(() => (window as unknown as Win).__DD_RELEASE__.crashDetails());
  // The packaged version: package.json through tools/version.mjs, as the build stamps it (no DD_BUILD).
  const v = await readVersion(undefined, {});
  expect(details.startsWith(`DEEP DOWN ${v.version} (versionCode ${v.versionCode}, build 0)`), details.split('\n')[0]).toBe(true);
  expect(details).toContain('e2e: simulated GPU driver failure');
  expect(details).toMatch(/GL renderer: /);

  await page.getByRole('button', { name: 'Restart' }).click();
  await waitMode(page, 'menu');
  await expect(page.getByRole('button', { name: /Continue/i })).toBeVisible();
  expect(await saveSlots(page), 'the save is the one from before the crash').toEqual(before);
  await page.getByRole('button', { name: /Continue/i }).click();
  await waitMode(page, 'playing');
});

test('an error after boot (a rejected promise) shows the panel; Copy details copies the report', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await expect(page.locator('.dd-crash')).toHaveCount(0);
  await page.evaluate(() => {
    void Promise.reject(new Error('e2e: rejected after boot'));
  });
  await expect(page.locator('.dd-crash')).toBeVisible({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Copy details' }).click();
  await expect(page.locator('.dd-crash-note')).toHaveText(/Details copied|Select the details/);
  const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  const details = await page.evaluate(() => (window as unknown as Win).__DD_RELEASE__.crashDetails());
  if (copied) expect(copied).toBe(details);
  else await expect(page.locator('.dd-crash-details')).toHaveValue(details);
  expect(details).toContain('e2e: rejected after boot');
  expect(details).toContain(await page.evaluate(() => navigator.userAgent));
  // A platform refusal (a DOMException, e.g. a denied fullscreen) is not a crash.
  await page.reload();
  await waitMode(page, 'menu');
  await page.evaluate(() => {
    void Promise.reject(new DOMException('e2e: refused', 'NotAllowedError'));
  });
  await page.waitForTimeout(1000);
  await expect(page.locator('.dd-crash')).toHaveCount(0);
});

test('Android bridge: Back is the page’s except at the menu root; pause saves and pauses', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: BridgeCall[] = [];
    const screenOn: boolean[] = [];
    (window as unknown as { DeepDownAndroid: unknown }).DeepDownAndroid = {
      backCalls: calls,
      screenOn,
      keepScreenOn: (on: boolean) => screenOn.push(on),
      setBackHandled: (handled: boolean) => {
        const s = window.__DD__?.ready ? window.__DD__.state() : { mode: 'boot', screen: 'loading' };
        calls.push({ handled, mode: s.mode, screen: s.screen });
      },
    };
  });
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  const lastCall = () => page.evaluate(() => (window as unknown as Win).DeepDownAndroid.backCalls.at(-1)?.handled);
  await expect.poll(lastCall, { timeout: 5_000 }).toBe(false);

  // A screen over the menu: Back closes it, so the page handles Back again.
  await page.getByRole('button', { name: /Settings/i }).first().click();
  await expect.poll(lastCall, { timeout: 5_000 }).toBe(true);
  expect(await page.evaluate(() => window.deepDownBack?.())).toBe(true);
  await expect.poll(lastCall, { timeout: 5_000 }).toBe(false);

  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  await expect.poll(lastCall, { timeout: 5_000 }).toBe(true);
  const screenOn = () => page.evaluate(() => (window as unknown as Win).DeepDownAndroid.screenOn);
  await expect.poll(async () => (await screenOn()).at(-1), { timeout: 30_000 }).toBe(true); // playing keeps the screen on
  expect(await page.evaluate(() => window.deepDownBack?.())).toBe(true); // pauses
  await waitMode(page, 'paused', 10_000);
  await expect.poll(lastCall, { timeout: 5_000 }).toBe(true);
  expect(await page.evaluate(() => window.deepDownBack?.())).toBe(true); // resumes
  await waitMode(page, 'playing', 10_000);

  const calls = await page.evaluate(() => (window as unknown as Win).DeepDownAndroid.backCalls);
  for (const c of calls) {
    const root = c.mode === 'menu' && c.screen === 'menu';
    expect(c.handled, `setBackHandled(${c.handled}) at ${c.mode}/${c.screen}`).toBe(!root);
  }
  expect(calls.filter((c) => !c.handled).length).toBeGreaterThanOrEqual(2);
  // Sent on change only.
  for (let i = 1; i < calls.length; i++) expect(calls[i].handled).not.toBe(calls[i - 1].handled);

  // MainActivity.onPause → deepDownLifecycle('pause'): a 'background' save, then the pause.
  await page.waitForTimeout(1200); // past the one-save-per-second guard after the start save
  await page.evaluate(() => window.__DD__.clearEvents());
  expect(await page.evaluate(() => (window as unknown as Win).deepDownLifecycle('pause'))).toBe(true);
  const saves = await page.evaluate(() => window.__DD__.events('game:saved').map((e) => e.payload.reason));
  expect(saves).toEqual(['background']);
  expect(await page.evaluate(() => window.__DD__.state().mode)).toBe('paused');
  // A second pause within a second does not save again.
  expect(await page.evaluate(() => (window as unknown as Win).deepDownLifecycle('pause'))).toBe(true);
  expect(await page.evaluate(() => window.__DD__.events('game:saved').length)).toBe(1);
  expect(await page.evaluate(() => (window as unknown as Win).deepDownLifecycle('resume'))).toBe(true);
  // Paused: the game lets the screen sleep again (on its next frame).
  await expect.poll(async () => (await screenOn()).at(-1), { timeout: 30_000 }).toBe(false);
});

test('context loss pauses behind “Restoring graphics…”; 10 s without the context shows the crash panel', async ({ page }) => {
  await page.goto('/index.html');
  await startExpedition(page);
  await page.evaluate(() => {
    const gl = window.__DD__.game.renderer.gl.getContext() as WebGL2RenderingContext;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose = gl.getExtension('WEBGL_lose_context')!;
    (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext();
  });
  await expect(page.locator('.dd-gl-notice')).toHaveText('Restoring graphics…', { timeout: 5_000 });
  await waitMode(page, 'paused', 10_000);
  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.restoreContext());
  await expect(page.locator('.dd-gl-notice')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('.dd-crash')).toHaveCount(0);

  await page.evaluate(() => (window as unknown as { __lose: WEBGL_lose_context }).__lose.loseContext());
  await expect(page.locator('.dd-gl-notice')).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('.dd-crash')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => (window as unknown as Win).__DD_RELEASE__.crashDetails())).toContain('not restored within 10 s');
});

test('automatic quality: a slow device steps down to Battery once, with one toast, and it sticks', async ({ page }) => {
  await watchPage(page);
  // A capable device class (8 cores, 8 GB), so the first launch starts on Balanced.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
  });
  await page.goto('/index.html?autoq=1');
  await waitMode(page, 'menu');
  expect(await page.evaluate(() => window.__DD__.game.settings.quality)).toBe('balanced');
  expect(await page.evaluate(() => (window as unknown as Win).__DD_RELEASE__.governor())).toMatchObject({ auto: true });
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  try {
    await page.waitForFunction(() => window.__DD__.game.settings.quality === 'battery', null, { timeout: 150_000, polling: 500 });
    await page.waitForTimeout(2000);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }
  const toasts = await page.evaluate(() => (window as unknown as Win).__e2e.toasts.filter((t) => /Quality set to Battery/.test(t)));
  expect(toasts).toHaveLength(1);
  const median = await page.evaluate(() => (window as unknown as Win).__DD_RELEASE__.governor()?.lastMedianMs ?? 0);
  expect(median).toBeGreaterThan(22);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('deepdown.autoquality') ?? 'null'))).toEqual({ auto: true, toasted: true });

  await page.reload();
  await waitMode(page, 'menu');
  expect(await page.evaluate(() => window.__DD__.game.settings.quality)).toBe('battery');
  // A manual choice switches it off for good.
  await page.evaluate(() => window.__DD__.game.updateSettings({ quality: 'high' }));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('deepdown.autoquality') ?? 'null')?.auto), { timeout: 5_000 }).toBe(false);
});

test('a boot failure (no WebGL 2) uses the same panel with Restart, and Back exits', async ({ page }) => {
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
      return type === 'webgl2' ? null : (get as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    } as typeof HTMLCanvasElement.prototype.getContext;
  });
  await page.goto('/index.html');
  await expect(page.locator('.dd-crash-message')).toHaveText(/does not support the graphics features DEEP DOWN needs \(WebGL 2\)/, { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Restart' })).toBeVisible();
  expect(await page.evaluate(() => window.deepDownBack?.())).toBe(false);
});
