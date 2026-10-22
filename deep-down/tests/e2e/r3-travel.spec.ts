import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, mark, boot, centreOf, closeTripCard, hud, newExpedition, quiet, tapControl, uiEvents, waitEvent, waitScreen, tapEl } from './r3';

// Round 3 (UI): outposts and fast travel with real touches at 390 x 844 (BRIEF §0.4, §0.6). A hotbar
// slot is filled by a long-press (the Bag opens on "choose for slot N"), the Outpost Kit is set down
// on open floor away from the camp with Place, its Interact chip rests there, and the Map's fast
// travel takes the explorer from the outpost to the camp and back.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

const player = (page: Page) => page.evaluate(() => ({ x: window.__DD__.game.player.x as number, y: window.__DD__.game.player.y as number, z: window.__DD__.game.player.z as number }));

test('an outpost from the hotbar, its rest, and fast travel from the Map to the camp and back', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);
  // Granted as a find (it takes its hotbar slot, so the camp's deposit leaves it in the bag).
  await page.evaluate(() => window.__DD__.game.grant('outpostKit', 1));

  await mark(page, 'travel long-press');
  // A long-press on the free slot (6) opens the Bag to fill it; a tap on the kit puts it there.
  const slot = await centreOf(page, 'hotbar:5');
  // Held until the Bag opens (a long-press is timed on the page, which may draw slowly).
  await touch.down(slot, 9);
  const opened = await waitScreen(page, 'inventory', 8);
  await touch.up();
  expect(opened, 'the long-press opened the Bag').toBe(true);
  await expect(page.locator('.dd-m3-banner')).toBeVisible();
  await tapEl(page, touch, page.locator('[data-key="item:outpostKit"]'));
  expect(await waitScreen(page, 'none'), 'choosing the kit closed the Bag').toBe(true);
  expect(await page.evaluate(() => window.__DD__.game.loop.hotbarView().slots[5].item)).toBe('outpostKit');

  await mark(page, 'travel place');
  // Away from the camp, on open floor: pick the kit and set it down with Place.
  const site = await page.evaluate(() => {
    const dd = window.__DD__;
    const g = dd.game;
    const l = g.strata.layout;
    const camp = l.campSite?.fire ?? [g.player.x, g.player.y, g.player.z];
    // An outpost site of WORLD's layout far from the camp, else any standable floor 30+ m away.
    const sites = (l.outpostSites as Array<{ p: [number, number, number] }>).map((s) => s.p).filter((p) => Math.hypot(p[0] - camp[0], p[2] - camp[2]) > 25);
    for (const p of sites) {
      const s = dd.standableNear(p[0], p[1], p[2]);
      if (s) return s;
    }
    for (let d = 30; d < 90; d += 6)
      for (let a = 0; a < 8; a++) {
        const s = dd.standableNear(Math.floor(camp[0] + Math.sin(a) * d), camp[1], Math.floor(camp[2] + Math.cos(a) * d));
        if (s) return s;
      }
    return null;
  });
  expect(site, 'open floor away from the camp').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), site!);
  await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 4);
  await tapControl(page, touch, 'hotbar:5');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.hotbarView().held)) === 'outpostKit', 4)).toBe(true);
  // Aim at the floor two metres ahead.
  await page.evaluate(() => {
    const g = window.__DD__.game;
    const p = g.player;
    window.__DD__.aimAt(p.x - Math.sin(g.cameraRig.yaw) * 2.2, p.y - 0.5, p.z - Math.cos(g.cameraRig.yaw) * 2.2, 0, 0);
  });
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'place');
  expect(await waitEvent(page, 'player:placed', 6), 'the kit was set down').toBe(true);
  expect((await uiEvents(page, 'player:placed'))[0].payload.item).toBe('outpostKit');
  const outposts = await page.evaluate(() => window.__DD__.game.strata.outposts.map((o: { id: string; x: number; z: number }) => ({ id: o.id, x: o.x, z: o.z })));
  expect(outposts.length, 'the outpost is registered for fast travel').toBe(1);
  const outpost = outposts[0];

  await mark(page, 'travel rest');
  // Its Interact chip rests there (the bed becomes the respawn point, the bag is banked).
  expect(await untilGame(page, async () => (await hud(page)).interact?.icon === 'outpost', 6), 'the outpost chip').toBe(true);
  await tapControl(page, touch, 'interact');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.bed)) === outpost.id, 6), 'rested: the bed is the outpost').toBe(true);
  // A rest ends the trip there (LOOP): its card may come up first.
  await closeTripCard(page, touch);

  await mark(page, 'travel to camp');
  // The Map: from the outpost, travel to the camp.
  await tapControl(page, touch, 'map');
  expect(await waitScreen(page, 'map')).toBe(true);
  await expect(page.locator('[data-key="travelrow:camp"] .dd-btn')).toBeEnabled();
  await tapEl(page, touch, page.locator('[data-key="travelrow:camp"] .dd-btn'));
  expect(await waitEvent(page, 'player:travelled', 30), 'travelled').toBe(true);
  expect((await uiEvents(page, 'player:travelled'))[0].payload.to).toBe('camp');
  expect(await untilGame(page, async () => page.evaluate(() => window.__DD__.game.inCamp), 6), 'at the camp').toBe(true);
  // Back at the camp, the trip's card may come up (a trip with an outpost set down): close it.
  await closeTripCard(page, touch);

  await mark(page, 'travel back');
  // And back: the outpost's row, from the camp.
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'map');
  expect(await waitScreen(page, 'map')).toBe(true);
  const row = page.locator(`[data-key="travelrow:${outpost.id}"] .dd-btn`);
  await expect(row).toBeEnabled();
  await tapEl(page, touch, row);
  expect(await waitEvent(page, 'player:travelled', 30)).toBe(true);
  const p = await player(page);
  expect(Math.hypot(p.x - outpost.x, p.z - outpost.z), 'back beside the outpost').toBeLessThan(4);
  // Away from both, the rows wait (a trip starts from the camp or an outpost).
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), (await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x + 14, y, z + 14), [Math.floor(outpost.x), Math.floor(p.y), Math.floor(outpost.z)]))!);
  await tapControl(page, touch, 'map');
  expect(await waitScreen(page, 'map')).toBe(true);
  await expect(page.locator('[data-key="travelrow:camp"] .dd-btn')).toBeDisabled();
});
