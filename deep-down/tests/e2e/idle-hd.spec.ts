import { expect, test } from '@playwright/test';
import { idleReady, waitFrames } from './dd';

// The HD pipeline (W2 §5, owner 2D; SPEC §11.3, §13.5 P3): a 14-biome tour of the real game with setDepth, then
// every quality preset switched at runtime. No shader program may compile after load (the post chain, the terrain
// preset switches and the biome looks change uniforms and textures only), the crash panel never shows, and the
// page logs no error. Runs at 390 x 844 (playwright.config.ts) on port 4176: DD_E2E_PORT=4176 npx playwright test
// tests/e2e/idle-hd.spec.ts.

const STARTS = [0, 40, 120, 240, 400, 600, 900, 1300, 1800, 2400, 3100, 3900, 4800, 5800];

type RenderDebug = { passes(): Array<{ name: string; px: number }>; scale(): number; dpr(): number; programs(): number; quality(): string; memoryBytes(): number };
const render = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __DD__: { render: RenderDebug } }).__DD__.render.passes().map((p) => p.name));

test('a 14-biome tour and every preset switch compile no shader, crash nothing, log no error', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/index.html');
  await idleReady(page);
  await page.evaluate(() => window.__DD__.idle.skipTutorial());
  await waitFrames(page, 20);
  const programs0 = await page.evaluate(() => window.__DD__.idle.programs());
  expect(programs0).toBeGreaterThan(0);

  // The pipeline on Balanced: bloom, the resolve (LUT pair), FXAA before the upsample, the native composite.
  const balanced = await render(page);
  expect(balanced).toEqual(expect.arrayContaining(['bright', 'resolve', 'fxaa', 'final']));
  const two = await page.evaluate(() => {
    const r = (window as unknown as { __DD__: { render: RenderDebug } }).__DD__.render;
    return { scale: r.scale(), dpr: r.dpr(), quality: r.quality() };
  });
  expect(two.quality).toBe('balanced');
  expect(two.scale).toBeGreaterThanOrEqual(0.6);
  expect(two.scale).toBeLessThanOrEqual(0.7);

  // The tour: every authored biome at its face, then one Echo stratum.
  const seen: Array<{ depth: number; programs: number; mode: string }> = [];
  for (const d of [...STARTS.map((s) => s + 12), 7000]) {
    await page.evaluate((m) => window.__DD__.idle.setDepth(m), d);
    await waitFrames(page, 10);
    const s = await page.evaluate(() => ({ programs: window.__DD__.idle.programs(), mode: window.__DD__.idle.mode() }));
    seen.push({ depth: d, ...s });
  }
  for (const s of seen) {
    expect(s.mode, `mode at ${s.depth} m`).not.toBe('crashed');
    expect(s.programs, `programs at ${s.depth} m`).toBe(programs0);
  }

  // Every preset switched at runtime, then back: still no new program.
  for (const q of ['battery', 'high', 'balanced'] as const) {
    await page.evaluate((quality) => window.__DD__.idle.settings({ quality }), q);
    await waitFrames(page, 8);
    const s = await page.evaluate(() => ({ programs: window.__DD__.idle.programs(), mode: window.__DD__.idle.mode(), quality: (window as unknown as { __DD__: { render: RenderDebug } }).__DD__.render.quality() }));
    expect(s.quality).toBe(q);
    expect(s.mode, `mode on ${q}`).not.toBe('crashed');
    expect(s.programs, `programs on ${q}`).toBe(programs0);
    const passes = await render(page);
    if (q === 'battery') expect(passes).not.toContain('bright');
    if (q === 'high') expect(passes).not.toContain('fxaa');
  }
  // A biome change on Battery and on High too.
  await page.evaluate(() => window.__DD__.idle.settings({ quality: 'battery' }));
  await page.evaluate(() => window.__DD__.idle.setDepth(912));
  await waitFrames(page, 8);
  await page.evaluate(() => window.__DD__.idle.settings({ quality: 'high' }));
  await page.evaluate(() => window.__DD__.idle.setDepth(130));
  await waitFrames(page, 8);
  expect(await page.evaluate(() => window.__DD__.idle.programs())).toBe(programs0);
  expect(await page.evaluate(() => window.__DD__.idle.mode())).not.toBe('crashed');
  expect(errors).toEqual([]);
});
