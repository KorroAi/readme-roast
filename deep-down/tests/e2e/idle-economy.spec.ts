// The W2 economy end to end (BUILD §3.1, W2.md §5 2A): the Rekindle with real touches (the Lantern tab, the 0.6 s hold
// on REKINDLE), the Embers credited, the run reset, the Ember perks applied, the planted lantern visible and tappable
// for +2 % damage, the ghost of the par run; and 8 h away with a seal ahead: the crew stops at it and the return says so.
// __DD__.idle sets up states (setDepth, give, toSeal, offline) and reads results; every press is a real touch (CDP).
import { expect, test, type Page } from '@playwright/test';
import { hpLog10 } from '../../src/idle/config/curves';
import { embersTotal } from '../../src/idle/model/prestige';
import { type DD, freshLaunch, idleReady, until } from './dd';
import { Touch } from './touch';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
test.setTimeout(300_000);

type Rect = { x: number; y: number; w: number; h: number; visible: boolean };
const centre = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const state = (page: Page): Promise<any> => page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.state());
const hud = (page: Page): Promise<any> => page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.hud());

/** The rect of an element by selector (the Lantern sheet's button is not in hud().rects). */
async function rectOf(page: Page, sel: string): Promise<Rect> {
  return page.evaluate((q) => {
    const el = document.querySelector(q);
    if (!el) return { x: 0, y: 0, w: 0, h: 0, visible: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: r.left, y: r.top, w: r.width, h: r.height, visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.hide') };
  }, sel);
}

/** The scene's tappables now (B's DescentScene, read through the debug internals). */
async function tappables(page: Page): Promise<Array<{ id: string; kind: string; x: number; y: number; radius: number }>> {
  return page.evaluate(() => {
    const g = (window as unknown as { __DD__: DD }).__DD__.internals.game;
    return (g.scene.tappables() as Array<{ id: string; kind: string; x: number; y: number; radius: number }>).map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, radius: e.radius }));
  });
}

/** Tap the floor's middle column with a real touch. */
async function tapFloor(page: Page, touch: Touch, i = 3): Promise<void> {
  const cols = await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.columns());
  const s = cols.strips[i % 7];
  await touch.tap({ x: (s.left + s.right) / 2, y: Math.min(cols.region.bottom - 20, cols.floorY + 30) });
}

async function start(page: Page): Promise<Touch> {
  await freshLaunch(page);
  await page.goto('/index.html');
  await idleReady(page);
  const touch = await Touch.attach(page);
  const h = await hud(page);
  if (h.rects['btn:continue']?.visible) await touch.tap(centre(h.rects['btn:continue']));
  await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.skipTutorial());
  return touch;
}

test('Rekindle with real touches: Embers credited, the run reset, perks on, the planted lantern pays +2 %, the ghost races', async ({ page }) => {
  const touch = await start(page);
  // Reach the Ember Shrine: 620 m (every seal above opened by the jump).
  await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.setDepth(620));
  for (let i = 0; i < 6; i++) await tapFloor(page, touch, i);
  const before = await state(page);
  expect(before.run.dmax).toBeGreaterThanOrEqual(620);
  expect(before.meta.stats.rekindles).toBe(0);
  const record = Math.max(before.run.dmax, before.meta.cycleRecord);
  const expected = Math.floor(embersTotal(record).toNumber());
  expect(expected).toBeGreaterThanOrEqual(25);

  // The Lantern tab (revealed at 400 m), a real tap; the sheet opens.
  await expect.poll(async () => (await hud(page)).rects['tab:lantern']?.visible ?? false, { timeout: 30_000 }).toBe(true);
  await touch.tap(centre((await hud(page)).rects['tab:lantern']));
  await expect.poll(async () => (await hud(page)).sheet, { timeout: 15_000 }).toBe('lantern');
  // REKINDLE: a tap is not enough (the 0.6 s hold), a 0.9 s hold is.
  await expect.poll(async () => (await rectOf(page, '[data-key="rekindle"]')).visible, { timeout: 15_000 }).toBe(true);
  const btn = await rectOf(page, '[data-key="rekindle"]');
  await touch.tap(centre(btn));
  await page.waitForTimeout(1500);
  expect((await state(page)).meta.stats.rekindles).toBe(0);
  if ((await hud(page)).sheet !== 'lantern') {
    await touch.tap(centre((await hud(page)).rects['tab:lantern']));
    await expect.poll(async () => (await hud(page)).sheet, { timeout: 15_000 }).toBe('lantern');
  }
  await touch.hold(centre(await rectOf(page, '[data-key="rekindle"]')), 900);
  // The T5 ceremony plays, the reset lands behind the iris.
  await expect.poll(async () => (await state(page)).meta.stats.rekindles, { timeout: 60_000, intervals: [500] }).toBe(1);
  const after = await state(page);
  const embers = (g: [number, number]) => (g[0] === 0 ? 0 : g[0] * 10 ** g[1]);
  expect(Math.round(embers(after.meta.embers))).toBe(expected);
  // The run is new; the meta is kept.
  expect(after.run.depth).toBeLessThan(100);
  expect(after.meta.record).toBeGreaterThanOrEqual(620);
  // Perks at ≥ 25 Embers: Blueprints (1), Shovel Hand and Pick start at 10 (10), offline 6 h (25).
  expect(after.run.pick).toBeGreaterThanOrEqual(10);
  expect(after.run.lines[0] ?? 0).toBeGreaterThanOrEqual(10);
  // The lantern is planted at the record; the par is set; the ghost runs ahead of a fresh run.
  expect(after.meta.planted.length).toBe(1);
  const planted = after.meta.planted[0];
  expect(planted.depth).toBeGreaterThanOrEqual(620);
  expect(after.run.par.length).toBeGreaterThan(3);
  for (let i = 0; i < 8; i++) {
    await tapFloor(page, touch, i);
    await page.waitForTimeout(150);
  }
  const ghost = await page.evaluate(() => {
    const g = (window as unknown as { __DD__: DD }).__DD__.internals.game;
    const l = g.scene.lanterns as { ghostDepth: number | null; ghostMesh: { visible: boolean } };
    return { depth: l.ghostDepth, visible: l.ghostMesh.visible, floor: g.state.run.depth };
  });
  expect(ghost.depth).not.toBeNull();
  expect(ghost.depth!).toBeGreaterThanOrEqual(0);
  // Within 9 rows of the floor the ghost lantern is drawn (it starts beside the foreman).
  if (Math.abs(ghost.depth! - ghost.floor) < 9) expect(ghost.visible).toBe(true);

  // The planted lantern: jump just above it, it comes into reach; a real tap pays +2 % once.
  await page.evaluate((d) => (window as unknown as { __DD__: DD }).__DD__.idle.setDepth(d), planted.depth - 2);
  const id = `lantern:${planted.n}`;
  const found = await until(page, async () => (await tappables(page)).some((e) => e.id === id), 30_000, 250);
  expect(found).toBe(true);
  let lan = (await tappables(page)).find((e) => e.id === id)!;
  await page.screenshot({ path: 'test-results/idle-economy-planted.png' });
  // A real tap where the scene draws it (re-read each try: the camera may still be settling after the jump).
  await expect
    .poll(async () => {
      const now = (await tappables(page)).find((e) => e.id === id);
      if (now) {
        lan = now;
        await touch.tap({ x: now.x, y: now.y });
        await page.waitForTimeout(300);
      }
      return (await state(page)).run.plantedBonus;
    }, { timeout: 30_000, intervals: [700] })
    .toBeCloseTo(0.02, 6);
  // Once a run: it leaves the tappables, a second tap there pays nothing more.
  await page.waitForTimeout(500);
  expect((await tappables(page)).some((e) => e.id === id)).toBe(false);
  await touch.tap({ x: lan.x, y: lan.y });
  await page.waitForTimeout(500);
  expect((await state(page)).run.plantedBonus).toBeCloseTo(0.02, 6);
});

test('8 h away with a seal ahead: the crew stops at the seal, the return says so, the fight is there on return', async ({ page }) => {
  const touch = await start(page);
  // Two rows above the next seal never opened.
  await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.toSeal());
  const sealAt = (await state(page)).run.depth + 2;
  // A crew that could dig far past it while away (gold given, crew levels bought with real taps on the quick-buy
  // crew card): at least 3 rows' work in the first half hour.
  const need = hpLog10(sealAt) + Math.log10(7 * 3) - Math.log10(1800);
  const bigLog = (g: [number, number]) => (g[0] === 0 ? -Infinity : g[1] + Math.log10(g[0]));
  await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.give({ gold: '1e30' }));
  await expect
    .poll(async () => {
      const h = await hud(page);
      const q = h.quick.find((x: { slot: number }) => x.slot === 2);
      if (q?.state === 'ready' && h.rects['quick:2']?.visible) await touch.tap(centre(h.rects['quick:2']));
      return bigLog((await state(page)).rates.crewDps) >= need;
    }, { timeout: 90_000, intervals: [400] })
    .toBe(true);
  // The crew may already stand at the seal (it waits there: the crew alone never breaks a seal, E21).
  const s0 = await state(page);
  expect(s0.run.depth).toBeLessThanOrEqual(sealAt);
  // The debug surface plants a save 8 h old and reloads (the evaluate's context goes with the page).
  await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.offline(8)).catch(() => undefined);
  await page.waitForLoadState('load');
  await idleReady(page);
  const back = await state(page);
  expect(back.offline).not.toBeNull();
  // 8 h away counts the 3 h cap (no offline perk yet).
  expect(back.offline.seconds).toBeGreaterThanOrEqual(3 * 3600 - 1);
  // The crew stopped at the seal: the floor is the seal row, never past it.
  expect(back.offline.sealBiome).toBeGreaterThanOrEqual(0);
  expect(back.meta.sealsOpened).not.toContain(back.offline.sealBiome);
  expect(back.offline.toDepth).toBeLessThanOrEqual(sealAt);
  expect(back.offline.toDepth).toBeGreaterThanOrEqual(sealAt - 1);
  expect(back.run.depth).toBe(back.offline.toDepth);
  const t1 = await Touch.attach(page);
  const menu = await hud(page);
  if (menu.rects['btn:continue']?.visible) await t1.tap(centre(menu.rects['btn:continue']));
  await expect.poll(async () => (await hud(page)).feast, { timeout: 20_000 }).toBe('collect');
  // The seal card of the return: "Your crew waits at the seal".
  const lines = await page.evaluate(() => [...document.querySelectorAll('.dd-feast-line')].map((e) => e.textContent ?? ''));
  expect(lines.some((x) => /waits at the seal/i.test(x))).toBe(true);
  await page.screenshot({ path: 'test-results/idle-economy-seal-return.png' });
  await t1.tap(centre((await hud(page)).rects['hud:collect']));
  await expect.poll(async () => (await state(page)).offline?.collected ?? true, { timeout: 15_000 }).toBe(true);
  // The fight is there: a tap on the floor starts it (the seal HUD shows).
  const fought = await until(page, async () => {
    await tapFloor(page, t1);
    const s = await state(page);
    return !!s.seal;
  }, 30_000, 400);
  expect(fought).toBe(true);
  await expect.poll(async () => (await hud(page)).rects['hud:seal']?.visible ?? false, { timeout: 15_000 }).toBe(true);
});
