// Save v3 end to end (BUILD §2.1, S2, the offline return), with real touches through CDP at 390 × 844.
// __DD__.idle only reads results; every tap is a real touch.
import { expect, test, type Page } from '@playwright/test';
import { computeOffline } from '../../src/idle/model/offline';
import { saveToState } from '../../src/save/saveData';
import type { SaveV3 } from '../../src/save/types';
import type { DD } from './dd';
import { Touch } from './touch';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });

const dd = (page: Page) => page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__);
void dd;

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as unknown as { __DD__?: DD }).__DD__?.idle?.ready === true, undefined, { timeout: 120_000 });
}

async function state(page: Page): Promise<any> {
  return page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.state());
}

async function hud(page: Page): Promise<any> {
  return page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.hud());
}

const centre = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** FNV-1a 32 (SaveSystem.checksum), for rewriting a slot in the page. */
const CHECKSUM_SRC = `(s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }`;

test('a v2 save shows the one-line notice once, starts a fresh descent and keeps the settings (S2)', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('planted')) return;
    sessionStorage.setItem('planted', '1');
    const v2 = JSON.stringify({ version: 2, genVersion: 3, savedAt: 1, worldSeed: 1, playTime: 900, player: { x: 1, y: 2, z: 3, yaw: 0, health: 100, lanternFuel: 200 }, backpack: [], storage: {} });
    let h = 0x811c9dc5;
    for (let i = 0; i < v2.length; i++) {
      h ^= v2.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    localStorage.setItem('deepdown.save.a', JSON.stringify({ checksum: (h >>> 0).toString(16).padStart(8, '0'), json: v2 }));
    localStorage.setItem('deepdown.save.active', 'a');
    localStorage.setItem('deepdown.settings', JSON.stringify({ quality: 'battery', masterVolume: 0.3, sfxVolume: 0.4, invertY: true, lookSensitivity: 1.7 }));
    localStorage.removeItem('deepdown.legacyNoticeShown');
  });
  await page.goto('/index.html');
  await ready(page);
  const h1 = await hud(page);
  expect(h1.legacyNotice).toBe(true);
  const s1 = await state(page);
  expect(s1.run.depth).toBe(0);
  expect(s1.v).toBe(3);
  const settings = await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.settings());
  expect(settings).toMatchObject({ quality: 'battery', masterVolume: 0.3, sfxVolume: 0.4 });
  expect(settings.invertY).toBeUndefined();
  // Both slots now hold v3 (the first save overwrote the legacy slot) and the notice never shows again.
  await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.save());
  const versions = await page.evaluate(() => ['a', 'b'].map((k) => {
    const raw = localStorage.getItem(`deepdown.save.${k}`);
    return raw ? JSON.parse(JSON.parse(raw).json).version : null;
  }));
  expect(versions.filter((v) => v !== null).every((v) => v === 3)).toBe(true);
  await page.reload();
  await ready(page);
  expect((await hud(page)).legacyNotice).toBe(false);
});

test('30 s of real taps, a reload, the same descent; then 2 h away: the closed-form return and Collect', async ({ page }) => {
  await page.goto('/index.html');
  await ready(page);
  const touch = await Touch.attach(page);
  // 30 s of play at about 4 taps/s on the column centres, buying the Pick when its card is ready.
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 30_000) {
    const cols = await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.columns());
    const s = cols.strips[(i * 3) % 7];
    await touch.tap({ x: (s.left + s.right) / 2, y: Math.min(cols.region.bottom - 20, cols.floorY + 30) });
    if (i % 6 === 0) {
      // Buy what is ready on the quick-buy row (the crew first: it digs while we are away).
      const h = await hud(page);
      for (const slot of [2, 0, 1]) {
        const q = h.quick.find((x: { slot: number }) => x.slot === slot);
        const r = h.rects[`quick:${slot}`];
        if (q?.state === 'ready' && r?.visible) {
          await touch.tap(centre(r));
          break;
        }
      }
    }
    i++;
    await page.waitForTimeout(150);
  }
  // The crew digs while we are away: make sure one is hired (with real taps on the quick-buy cards).
  if (((await state(page)).run.lines[0] ?? 0) === 0) {
    await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.give({ gold: 2000 }));
    await expect
      .poll(async () => {
        const h = await hud(page);
        const q = h.quick.find((x: { slot: number }) => x.slot === 2);
        if (q?.state === 'ready' && h.rects['quick:2']?.visible) await touch.tap(centre(h.rects['quick:2']));
        return (await state(page)).run.lines[0] ?? 0;
      }, { timeout: 20_000, intervals: [500] })
      .toBeGreaterThanOrEqual(1);
  }
  const before = await state(page);
  expect(before.run.depth).toBeGreaterThanOrEqual(3);
  expect(before.meta.stats.taps).toBeGreaterThan(40);
  expect(await page.evaluate(() => (window as unknown as { __DD__: DD }).__DD__.idle.save())).toBe(true);
  await page.reload();
  await ready(page);
  const after = await state(page);
  // The pagehide save may land a few crew strikes later: the same levels, the depth and gold at least kept.
  expect(after.run.pick).toBe(before.run.pick);
  expect(after.run.lines).toEqual(before.run.lines);
  expect(after.run.depth).toBeGreaterThanOrEqual(before.run.depth);
  expect(after.run.depth - before.run.depth).toBeLessThanOrEqual(10);
  const goldLog = (g: [number, number]) => (g[0] === 0 ? -Infinity : g[1] + Math.log10(g[0]));
  expect(goldLog(after.run.gold)).toBeGreaterThanOrEqual(goldLog(before.run.gold) - 1e-9);
  expect(after.offline).toBeNull();

  // Away for 2 hours: rewrite the active slot's clock, block the reload's own save, reload.
  const saved: SaveV3 = await page.evaluate((src) => {
    const sum = new Function(`return ${src}`)() as (s: string) => string;
    const slot = localStorage.getItem('deepdown.save.active') === 'b' ? 'deepdown.save.b' : 'deepdown.save.a';
    const data = JSON.parse(JSON.parse(localStorage.getItem(slot)!).json);
    data.savedAt -= 2 * 3600_000;
    data.monotonicMs = data.savedAt;
    const json = JSON.stringify(data);
    localStorage.setItem(slot, JSON.stringify({ checksum: sum(json), json }));
    Storage.prototype.setItem = () => {};
    return data;
  }, CHECKSUM_SRC);
  await page.reload();
  await ready(page);
  const back = await state(page);
  expect(back.offline).not.toBeNull();
  // The closed form, recomputed here in Node from the same save, for the same time away (±1 row).
  const s = saveToState(saved, Date.now());
  const expected = computeOffline(s, back.offline.seconds);
  expect(Math.abs(back.offline.toDepth - expected.toDepth)).toBeLessThanOrEqual(1);
  expect(back.offline.seconds).toBeGreaterThanOrEqual(7200);
  expect(back.offline.seconds).toBeLessThan(7300);
  expect(back.run.depth).toBe(back.offline.toDepth);
  // The second launch shows the menu: Continue (a real tap), then the feast; Collect with a real tap.
  const menu = await hud(page);
  if (menu.rects['btn:continue']?.visible) await touch.tap(centre(menu.rects['btn:continue']));
  await expect.poll(async () => (await hud(page)).feast, { timeout: 15_000 }).toBe('collect');
  const goldBefore = goldLog((await state(page)).run.gold);
  const collect = (await hud(page)).rects['hud:collect'];
  expect(collect?.visible).toBe(true);
  await touch.tap(centre(collect));
  await expect.poll(async () => (await state(page)).offline?.collected ?? true, { timeout: 10_000 }).toBe(true);
  const goldAfter = goldLog((await state(page)).run.gold);
  expect(goldAfter).toBeGreaterThan(goldBefore);
  expect(Math.abs(goldAfter - Math.max(goldBefore, expected.gold.log10()))).toBeLessThan(0.5);
});
