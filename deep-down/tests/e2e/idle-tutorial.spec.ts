import { expect, test, type Page } from '@playwright/test';
import { TUTORIAL_TIMES } from '../../src/idle/model/tutorial';
import { waitFrames, waitMode } from './dd';
import { Touch } from './touch';

// The tutorial and the goal bar (SPEC §13.3 G1, G2, G4; BUILD §2.3), driven by real touches. The model runs on its
// own fixed clock (≤ 4 steps a frame), so under SwiftShader it can run slower than the wall clock: every rate and
// every time here is in model seconds (`__DD__.idle.tutorial().time`), which is what a phone at 60 fps would see.
// Rendering is set to Battery (as the Settings sheet would) to keep the frame rate up; guidance does not depend on it.

test.describe.configure({ timeout: 2_400_000 });

type Snap = {
  time: number;
  id: string;
  index: number;
  started: boolean;
  guide: { id: string; x: number; y: number } | null;
  centre: { x: number; y: number };
  floorY: number;
  region: { top: number; bottom: number; left: number; right: number };
  steps: Array<{ id: string; mt: number }>;
  reveals: number;
  seals: number;
  dmax: number;
};

const snap = (page: Page): Promise<Snap> =>
  page.evaluate(() => {
    const d = window.__DD__.idle;
    const tu = d.tutorial();
    const c = d.columns();
    const s3 = c.strips[3];
    return {
      time: tu.time,
      id: tu.id,
      index: tu.index,
      started: tu.started,
      guide: d.guidePoint(),
      centre: { x: (s3.left + s3.right) / 2, y: c.floorY + 18 },
      floorY: c.floorY,
      region: c.region,
      steps: d.events('tutorial:step').map((e) => ({ id: e.payload.id as string, mt: e.mt })),
      reveals: d.events('biome:reveal').length,
      seals: d.events('seal:break').length,
      dmax: (window.__DD__ as unknown as { internals: { game: { state: { run: { dmax: number } } } } }).internals.game.state.run.dmax,
    };
  });

/** Sample the goal bar in every frame (after the game's own rAF callback). */
async function sampleGoal(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __G: { frames: number; bad: Array<{ f: number; text: string; visible: boolean; sheet: string }>; on: boolean; sheetFrames: number; ceremonyFrames: number } };
    w.__G = { frames: 0, bad: [], on: true, sheetFrames: 0, ceremonyFrames: 0 };
    const d = window.__DD__.idle;
    const tick = () => {
      if (!w.__G.on) return;
      requestAnimationFrame(tick);
      if (d.mode() !== 'playing') return;
      const g = d.goal();
      const sheet = (document.querySelector('.dd-sheet:not(.hide)') as HTMLElement | null) ? 'open' : '';
      w.__G.frames++;
      if (sheet) w.__G.sheetFrames++;
      if (document.querySelector('.dd-hud-stamp:not(.hide), .dd-stamp:not(.hide)')) w.__G.ceremonyFrames++;
      if (!g.visible || !g.text) w.__G.bad.push({ f: d.frame(), text: g.text, visible: g.visible, sheet });
    };
    requestAnimationFrame(tick);
  });
}

async function lowRender(page: Page): Promise<void> {
  await page.evaluate(() => window.__DD__.idle.settings({ quality: 'battery', renderScale: 0.5 }));
  await waitFrames(page, 2);
}

test('G1 + G2: a bot tapping the centre at 4/s and every highlighted target reaches the Halden Hatch and its reveal in order, on time; the goal bar shows in every frame', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  await sampleGoal(page);
  const touch = await Touch.attach(page);
  const RATE = 4;
  let taps = 0;
  let lastTargetTap = -1e9;
  let sheetOpened = false;
  const steps = new Map<string, number>();
  let s = await snap(page);
  const wall = Date.now();
  for (;;) {
    s = await snap(page);
    for (const st of s.steps) if (!steps.has(st.id)) steps.set(st.id, st.mt);
    // Done: the reveal step has run its course (the next step, the first gear, is waiting or showing).
    if (steps.has('reveal') && s.id !== 'reveal' && s.id !== 'hatch') break;
    if (s.time > 200 || Date.now() - wall > 2_200_000) break;
    // G2 with a sheet open: once, early on, open the Dig sheet for a few seconds with a real tap, then close it.
    if (!sheetOpened && steps.has('hireShovel') && s.id === 'chest') {
      const r = (await page.evaluate(() => window.__DD__.idle.hud())).rects['tab:dig'];
      if (r?.visible) {
        sheetOpened = true;
        await touch.tap({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
        await waitFrames(page, 6);
        await touch.tap({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
      }
    }
    const due = Math.floor(s.time * RATE) - taps;
    if (due <= 0) {
      await page.waitForTimeout(40);
      continue;
    }
    for (let k = 0; k < Math.min(due, 6); k++) {
      const g = s.guide;
      const ui = g && g.id !== 'cell' && g.id !== 'seal' && g.id !== 'crystal';
      if (g && ui && s.time - lastTargetTap > 1) {
        // A highlighted target (a card, a tab, a skill, a chest): press it like a player would.
        lastTargetTap = s.time;
        await touch.tapAt(g.x, g.y);
      } else if (g && (g.id === 'crystal' || g.id === 'seal')) await touch.tapAt(g.x, Math.max(g.y, s.floorY + 4));
      else await touch.tapAt(s.centre.x, s.centre.y);
      taps++;
    }
    await waitFrames(page, 1);
  }
  const goal = await page.evaluate(() => {
    const w = window as unknown as { __G: { frames: number; bad: unknown[]; on: boolean; sheetFrames: number; ceremonyFrames: number } };
    w.__G.on = false;
    return w.__G;
  });
  const order = [...steps.entries()].sort((a, b) => a[1] - b[1]);
  console.log(`G1: ${taps} taps in ${s.time.toFixed(1)} model s (${((Date.now() - wall) / 1000).toFixed(0)} s wall): ${order.map(([id, t]) => `${id}@${t.toFixed(1)}`).join(' ')}`);
  console.log(`G2: ${goal.frames} frames sampled (${goal.sheetFrames} with a sheet open, ${goal.ceremonyFrames} during a stamp), ${goal.bad.length} without the goal bar`);

  // Reached the Hatch and its reveal within 2:30 of model time.
  expect(s.seals, 'the Halden Hatch broke').toBeGreaterThanOrEqual(1);
  expect(s.reveals, 'the biome reveal played').toBeGreaterThanOrEqual(1);
  expect(steps.get('reveal')!, 'the reveal within 2:30').toBeLessThanOrEqual(150);
  // Every step shown, in the order of the step machine (crystals and dynamite may be skipped when passed by).
  const ids = Object.keys(TUTORIAL_TIMES);
  const seen = order.map(([id]) => id);
  for (const must of ['tapRock', 'clearRow', 'buyPick', 'hireShovel', 'chest', 'hatchNear', 'hatch', 'reveal']) expect(seen, `step ${must} shown`).toContain(must);
  const idx = seen.map((id) => ids.indexOf(id));
  for (let i = 1; i < idx.length; i++) expect(idx[i], `${seen[i - 1]} before ${seen[i]}`).toBeGreaterThan(idx[i - 1]);
  // No step waits more than 25 s, and each starts within ±25 % of the sim's times (CRITIQUE MUST 9; 4 taps/s sits
  // between the sim's 5 and 3; ±1 s for the first beats, which the frame quantum dominates).
  for (let i = 1; i < order.length; i++) expect(order[i][1] - order[i - 1][1], `${order[i - 1][0]} waits`).toBeLessThanOrEqual(25);
  for (const [id, t] of order) {
    const band = TUTORIAL_TIMES[id];
    if (!band) continue;
    const lo = Math.min(band[0], band[1]) * 0.75 - 1;
    const hi = Math.max(band[0], band[1]) * 1.25 + 1;
    expect(t, `${id} at ${t.toFixed(1)} s, expected ${lo.toFixed(1)}–${hi.toFixed(1)}`).toBeGreaterThanOrEqual(lo);
    expect(t, `${id} at ${t.toFixed(1)} s, expected ${lo.toFixed(1)}–${hi.toFixed(1)}`).toBeLessThanOrEqual(hi);
  }
  // G2: the goal bar was visible and non-empty in every sampled frame of play, a sheet open included.
  expect(goal.frames).toBeGreaterThan(50);
  expect(sheetOpened, 'a sheet was opened during the run').toBe(true);
  expect(goal.sheetFrames).toBeGreaterThan(0);
  expect(goal.bad, JSON.stringify(goal.bad.slice(0, 5))).toEqual([]);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('G4: a random tapper (3 taps/s at random world points, never reads) reaches 20 m within 60 s', async ({ page }) => {
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  let seed = 4242;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let taps = 0;
  let s = await snap(page);
  const wall = Date.now();
  while (s.time < 60 && Date.now() - wall < 2_200_000) {
    const due = Math.floor(s.time * 3) - taps;
    for (let k = 0; k < Math.min(due, 6); k++) {
      const r = s.region;
      await touch.tapAt(r.left + rnd() * (r.right - r.left), r.top + 6 + rnd() * (r.bottom - r.top - 12));
      taps++;
    }
    await waitFrames(page, 1);
    s = await snap(page);
  }
  console.log(`G4: ${taps} random taps, ${s.dmax} m at ${s.time.toFixed(1)} model s (${((Date.now() - wall) / 1000).toFixed(0)} s wall)`);
  expect(s.dmax).toBeGreaterThanOrEqual(20);
});
