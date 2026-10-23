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
  // Away from the camp: where the kit goes down, found with Place's own rule before committing
  // (ActionLayer.placeCells, the cell the centre ray's face gives). Every outpost site of WORLD's
  // layout 25+ m from the camp in turn, then a wider ring of floor round the camp; at each, the
  // explorer stands on the standable cell's centre (standableNear gives the centre: an extra +0.5
  // stood it on a cell corner, its eye in a pillar beside the site, gate 03:32) and aims at the top
  // of the rock under each floor cell 1.2-3 m away until one takes the kit.
  const spot = await page.evaluate(() => {
    const dd = window.__DD__;
    const g = dd.game;
    const l = g.strata.layout;
    const camp = (l.campSite?.fire ?? [g.player.x, g.player.y, g.player.z]) as number[];
    const far = (p: number[]) => Math.hypot(p[0] - camp[0], p[2] - camp[2]) > 25;
    const stands: number[][] = [];
    for (const s of l.outpostSites as Array<{ p: number[] }>) {
      if (!far(s.p)) continue;
      const st = dd.standableNear(s.p[0], s.p[1], s.p[2]);
      if (st) stands.push(st);
    }
    for (let d = 30; d < 90; d += 6)
      for (let a = 0; a < 16; a++) {
        const st = dd.standableNear(camp[0] + Math.sin((a * Math.PI) / 8) * d, camp[1], camp[2] + Math.cos((a * Math.PI) / 8) * d);
        if (st && far(st)) stands.push(st);
      }
    const air = (x: number, y: number, z: number) => dd.block(x, y, z) === 0;
    for (const st of stands) {
      dd.teleport(st[0], st[1], st[2]);
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++)
          for (let dy = -2; dy <= 1; dy++) {
            const x = Math.floor(st[0]) + dx;
            const z = Math.floor(st[2]) + dz;
            const y = st[1] + dy;
            const h = Math.hypot(x + 0.5 - st[0], z + 0.5 - st[2]);
            if (h < 1.2 || h > 3 || !dd.isSolid(x, y - 1, z) || !air(x, y, z) || !air(x, y + 1, z)) continue;
            // (aimAt aims at its x + 0.5, y + 0.5, z + 0.5: here the top face of the rock under it.)
            dd.aimAt(x, y - 0.48, z, 0, 0);
            const cells = g.act.placeCells('outpost');
            if (cells && cells[0][0] === x && cells[0][1] === y && cells[0][2] === z) return { stand: st, cell: [x, y, z] };
          }
    }
    return null;
  });
  expect(spot, 'a spot away from the camp where the kit goes down (Place\'s own rule)').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), spot!.stand as [number, number, number]);
  await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 4);
  await tapControl(page, touch, 'hotbar:5');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.hotbarView().held)) === 'outpostKit', 4)).toBe(true);
  // Aim at that floor again (the explorer has stood a few frames) and ask Place before the tap.
  const floor = await page.evaluate(([x, y, z]) => {
    window.__DD__.aimAt(x, y - 0.48, z, 0, 0);
    return window.__DD__.game.act.placeCells('outpost') !== null;
  }, spot!.cell as [number, number, number]);
  expect(floor, 'open floor in reach for the kit').toBe(true);
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'place');
  expect(await waitEvent(page, 'player:placed', 6), 'the kit was set down').toBe(true);
  expect((await uiEvents(page, 'player:placed'))[0].payload.item).toBe('outpostKit');
  const outposts = await page.evaluate(() => window.__DD__.game.strata.outposts.map((o: { id: string; x: number; z: number }) => ({ id: o.id, x: o.x, z: o.z })));
  expect(outposts.length, 'the outpost is registered for fast travel').toBe(1);
  const outpost = outposts[0];

  await mark(page, 'travel rest');
  // Its Interact chip rests there (the bed becomes the respawn point) and opens the Bag on the
  // outpost's bank.
  expect(await untilGame(page, async () => (await hud(page)).interact?.icon === 'outpost', 6), 'the outpost chip').toBe(true);
  await tapControl(page, touch, 'interact');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.bed)) === outpost.id, 6), 'rested: the bed is the outpost').toBe(true);
  // A rest ends the trip there (LOOP): its card may come up first, or once the Bag is closed.
  await closeTripCard(page, touch);
  if (await waitScreen(page, 'inventory', 4)) {
    await expect(page.locator('.dd-menu3 .dd-m3-meta .dd-m3-good'), 'the Bag opened on the outpost bank').toBeVisible();
    await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
    expect(await waitScreen(page, 'none'), 'the Bag closed').toBe(true);
    await closeTripCard(page, touch, 3);
  }

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
  // Away from both, the rows wait (a trip starts from the camp or an outpost): standable floor 10-24 m
  // from the outpost, out of the camp, in whichever direction the rock allows.
  const apart = await page.evaluate(([ox, oy, oz]) => {
    const dd = window.__DD__;
    for (let d = 12; d <= 24; d += 4)
      for (let a = 0; a < 12; a++) {
        const s = dd.standableNear(Math.floor(ox + Math.sin((a * Math.PI) / 6) * d), oy, Math.floor(oz + Math.cos((a * Math.PI) / 6) * d));
        if (s && Math.hypot(s[0] - ox, s[2] - oz) > 9) return s as [number, number, number];
      }
    return null;
  }, [outpost.x, Math.floor(p.y), outpost.z] as const);
  expect(apart, 'floor away from the outpost').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), apart!);
  await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 3);
  await tapControl(page, touch, 'map');
  expect(await waitScreen(page, 'map')).toBe(true);
  await expect(page.locator('[data-key="travelrow:camp"] .dd-btn')).toBeDisabled();
});
