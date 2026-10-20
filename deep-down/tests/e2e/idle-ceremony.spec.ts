import { expect, test, type Page } from '@playwright/test';
import { idleReady, until, waitFrames, waitMode } from './dd';
import { Touch } from './touch';

// Ceremonies (BUILD §3.3 E2E, SPEC §10.8, §13.2 F6/F8): taps every 37 ms through a pick tier and a biome reveal with 0
// dropped; the skip from 400 ms; the full-screen flash budget during a run of ceremonies; Reduced motion keeps the
// camera at rest in every frame; Motion Off launches no flights and keeps every event to ≤ 20 particles. Real touches
// through CDP; __DD__.idle starts the ceremonies (the capture hook) and reads results.

async function boot(page: Page, errors: string[]): Promise<Touch> {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html?seed=7');
  await waitMode(page, 'playing');
  await idleReady(page);
  await page.evaluate(() => {
    window.__DD__.idle.settings({ quality: 'battery', renderScale: 0.5 });
    window.__DD__.idle.skipTutorial();
    // A light scene (Topsoil, 20 m): the ceremonies do not depend on the biome, and a software renderer keeps its rate.
    window.__DD__.idle.setDepth(20);
  });
  await waitFrames(page, 4);
  return Touch.attach(page);
}

/** Sample fx() in every frame (after the game's rAF) until stopped. */
async function sample(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __F: Array<{ t: number; flashes: number[]; trauma: number; kick: number; tokens: number; particles: number; flights: number }>; __Fon: boolean };
    w.__F = [];
    w.__Fon = true;
    const d = window.__DD__.idle;
    const tick = () => {
      if (!w.__Fon) return;
      requestAnimationFrame(tick);
      const f = d.fx();
      w.__F.push({ t: performance.now(), flashes: f.flashes, trauma: f.trauma, kick: f.kick, tokens: f.tokens, particles: f.particles, flights: f.flights.length });
    };
    requestAnimationFrame(tick);
  });
}

async function stop(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __F: Array<{ t: number; flashes: number[]; trauma: number; kick: number; tokens: number; particles: number; flights: number }>; __Fon: boolean };
    w.__Fon = false;
    return w.__F;
  });
}

test('F6: taps every 37 ms through a pick tier and a biome reveal: none dropped, and a tap skips from 400 ms', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors);
  const before = await page.evaluate(() => window.__DD__.idle.lastTaps().length);
  expect(await page.evaluate(() => window.__DD__.idle.ceremony('pickTier'))).toBe(true);
  const strips = await page.evaluate(() => window.__DD__.idle.columns());
  const sent: number[] = [];
  const t0 = Date.now();
  for (let i = 0; i < 90; i++) {
    if (i === 45) await page.evaluate(() => window.__DD__.idle.ceremony('biomeReveal'));
    const s = strips.strips[2 + (i % 3)];
    await touch.tapAt((s.left + s.right) / 2, strips.floorY + 16);
    sent.push(Date.now() - t0);
    const wait = 37 * (i + 1) - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
  }
  await waitFrames(page, 3);
  const after = await page.evaluate(() => window.__DD__.idle.lastTaps().length);
  const log = await page.evaluate(() => window.__DD__.idle.ceremonies().log);
  console.log(`F6: ${sent.length} taps sent over ${sent[sent.length - 1]} ms; ${after - before} resolved; ceremonies ${log.map((e) => e.id).join(', ')}`);
  expect(after - before).toBe(sent.length);
  expect(log.some((e) => e.id === 'pickTier')).toBe(true);
  expect(log.some((e) => e.id === 'biomeReveal' || e.id === 'chartedGate')).toBe(true);

  // The skip: a pick tier, then a tap at 450 ms jumps it to its end state (≥ 1,300 ms) in that frame.
  await waitFrames(page, 2);
  await page.waitForFunction(() => !window.__DD__.idle.ceremonies().exclusive, null, { timeout: 60_000 });
  await page.evaluate(() => window.__DD__.idle.ceremony('pickTier'));
  await page.waitForFunction(() => (window.__DD__.idle.ceremonies().live.find((c) => c.id === 'pickTier')?.t ?? 0) >= 450, null, { timeout: 30_000, polling: 'raf' });
  const tBefore = await page.evaluate(() => window.__DD__.idle.ceremonies().live.find((c) => c.id === 'pickTier')?.t ?? -1);
  await touch.tapColumn(3);
  await waitFrames(page, 1);
  const st = await page.evaluate(() => window.__DD__.idle.ceremonies());
  const pt = st.live.find((c) => c.id === 'pickTier');
  console.log(`skip: at ${tBefore.toFixed(0)} ms → ${pt ? pt.t.toFixed(0) : 'ended'} ms`);
  expect(!pt || pt.t >= 1300).toBe(true);
  expect(tBefore).toBeLessThan(1300);
  expect(errors).toEqual([]);
});

test('F8: during a run of ceremonies, ≤ 2 full-screen flashes a second, ≤ 0.35 (Rekindle 0.40), every frame sampled', async ({ page }) => {
  const errors: string[] = [];
  await boot(page, errors);
  await sample(page);
  for (const id of ['sealBreak', 'pickTier', 'chest', 'chartedGate', 'rekindle']) {
    await page.evaluate((c) => window.__DD__.idle.ceremony(c), id);
    await page.waitForTimeout(300);
  }
  await page.waitForFunction(() => !window.__DD__.idle.ceremonies().exclusive && window.__DD__.idle.ceremonies().waiting === 0, null, { timeout: 120_000, polling: 250 });
  const f = await stop(page);
  const maxCount = Math.max(...f.map((x) => x.flashes.length));
  const maxV = Math.max(0, ...f.flatMap((x) => x.flashes));
  console.log(`F8: ${f.length} frames; at most ${maxCount} flashes in a second; strongest ${maxV.toFixed(2)}`);
  expect(maxCount).toBeLessThanOrEqual(2);
  expect(maxV).toBeLessThanOrEqual(0.4);
  expect(f.flatMap((x) => x.flashes).filter((v) => v > 0.35).length).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test('Reduced motion: the camera at rest in every frame through taps and ceremonies; Motion Off: no flights, ≤ 20 particles', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors);
  await page.evaluate(() => window.__DD__.idle.settings({ motion: 'reduced' }));
  await waitFrames(page, 2);
  await sample(page);
  await page.evaluate(() => window.__DD__.idle.ceremony('sealBreak'));
  for (let i = 0; i < 30; i++) {
    await touch.tapColumn(1 + (i % 5));
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.__DD__.idle.ceremony('pickTier'));
  await page.waitForTimeout(1500);
  const red = await stop(page);
  const moved = red.filter((x) => x.trauma > 1e-6 || Math.abs(x.kick) > 1e-6);
  const redFlash = Math.max(0, ...red.flatMap((x) => x.flashes));
  console.log(`Reduced: ${red.length} frames, ${moved.length} with camera motion; strongest flash ${redFlash.toFixed(2)}`);
  expect(moved.length).toBe(0);
  expect(redFlash).toBeLessThanOrEqual(0.15);

  await page.evaluate(() => window.__DD__.idle.settings({ motion: 'off' }));
  await waitFrames(page, 2);
  await sample(page);
  for (let i = 0; i < 30; i++) {
    await touch.tapColumn(1 + (i % 5));
    await page.waitForTimeout(60);
  }
  await page.evaluate(() => window.__DD__.idle.ceremony('chest'));
  await page.waitForTimeout(2500);
  const off = await stop(page);
  const maxTokens = Math.max(...off.map((x) => x.tokens));
  const maxParticles = Math.max(...off.map((x) => x.particles));
  console.log(`Off: ${off.length} frames; tokens in flight ≤ ${maxTokens}; FX particles ≤ ${maxParticles}`);
  expect(maxTokens).toBe(0);
  expect(maxParticles).toBeLessThanOrEqual(20);
  expect(errors).toEqual([]);
});

test('F2 with overlays (CRITIQUE MUST 7): random world taps under a Feat toast, a first-time card and an event bubble all dig', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors);
  /** 60 random taps over the upper world region (where the card, the toast and the bubbles sit). @returns misses. */
  const tapUpper = async (n: number): Promise<{ resolved: number; missed: number }> => {
    const before = await page.evaluate(() => window.__DD__.idle.lastTaps().length);
    const cols = await page.evaluate(() => window.__DD__.idle.columns());
    for (let i = 0; i < n; i++) {
      const x = cols.region.left + 2 + Math.random() * (cols.region.right - cols.region.left - 4);
      const y = cols.region.top + 2 + Math.random() * (cols.floorY - cols.region.top);
      await touch.tapAt(x, y);
      await page.waitForTimeout(35);
    }
    await waitFrames(page, 3);
    const taps = await page.evaluate(() => window.__DD__.idle.lastTaps());
    const mine = taps.slice(before).filter((t) => t.kind === 'tap');
    return { resolved: mine.length, missed: mine.filter((t) => t.col < 0 && !t.entity).length };
  };
  const shown = () =>
    page.evaluate(() => ({
      first: !document.querySelector('.dd-first')!.classList.contains('hide'),
      toast: !document.querySelector('.dd-ft')!.classList.contains('hide'),
      bubble: !!document.querySelector('.dd-bubble:not(.hide)'),
    }));
  // 1. A Feat toast and an event bubble; a first-time card waits its turn (one plate at a time under the goal bar).
  await page.evaluate(() => {
    const g = window.__DD__.internals.game;
    g.events.emit('event:announce', { id: '9', type: 'mothSwarm', inSeconds: 30 });
    window.__DD__.idle.ceremony('feat');
  });
  await waitFrames(page, 4);
  await page.evaluate(() => window.__DD__.internals.game.ui.hud.firstTime('Golden Vein', 'Gold in the next 5 rows!'));
  await waitFrames(page, 2);
  const a = await shown();
  console.log(`overlays (1): ${JSON.stringify(a)}`);
  expect(a.toast && a.bubble && !a.first).toBe(true);
  const r1 = await tapUpper(60);
  // 2. The toast gone, the first-time card that waited is on screen (with the bubble).
  expect(await until(page, async () => (await shown()).first, 30_000)).toBe(true);
  const b = await shown();
  console.log(`overlays (2): ${JSON.stringify(b)}`);
  expect(b.first && !b.toast).toBe(true);
  const r2 = await tapUpper(60);
  console.log(`F2 overlays: ${r1.resolved + r2.resolved} taps resolved, ${r1.missed + r2.missed} missed`);
  expect(r1.resolved + r2.resolved).toBe(120);
  expect(r1.missed + r2.missed).toBe(0);
  expect(errors).toEqual([]);
});
