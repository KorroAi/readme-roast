import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, mark, boot, centreOf, holdUntil, hud, newExpedition, quiet, tapControl, uiEvents, waitEvent, waitScreen, tapEl } from './r3';
import type { Touch } from './touch';

// Round 3 (UI): crafting and building with real touches at 390 x 844 (BRIEF §0.4, §0.6): the Craft
// menu makes a recipe once and five times (materials from the bag, the bank at camp), a torch is
// placed on a wall from the hotbar with the Place button, and a ladder climbs the wall (four cells
// for one ladder) and is climbed with the stick.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

const TORCH = 115;
const LADDER = 113;

const count = (page: Page, item: string) => page.evaluate((i) => window.__DD__.game.backpack.count(i) + window.__DD__.game.storage.count(i), item);

/** Stand in the open near the camp fire, facing a wall a couple of metres away (null: none found). */
async function faceAWall(page: Page): Promise<{ wall: [number, number, number]; stand: [number, number, number] } | null> {
  return page.evaluate(() => {
    const dd = window.__DD__;
    const g = dd.game;
    const fire = g.session.layout.campSite?.fire ?? [g.player.x, g.player.y, g.player.z];
    // Walk out from the fire in 16 directions and take the first wall 2.5 to 4 m from a standable cell.
    for (let a = 0; a < 16; a++) {
      const dx = Math.sin((a / 16) * Math.PI * 2);
      const dz = Math.cos((a / 16) * Math.PI * 2);
      for (let d = 3; d < 14; d++) {
        const sx = Math.floor(fire[0] + dx * d);
        const sz = Math.floor(fire[2] + dz * d);
        const stand = dd.standableNear(sx, fire[1], sz);
        if (!stand) continue;
        const wx = Math.floor(stand[0] + 0.5 + dx * 2.5);
        const wz = Math.floor(stand[2] + 0.5 + dz * 2.5);
        const wy = stand[1];
        const wallSolid = dd.isSolid(wx, wy, wz) && dd.isSolid(wx, wy + 1, wz) && dd.isSolid(wx, wy + 2, wz);
        const between = !dd.isSolid(Math.floor(stand[0] + 0.5 + dx * 1.4), wy, Math.floor(stand[2] + 0.5 + dz * 1.4)) && !dd.isSolid(Math.floor(stand[0] + 0.5 + dx * 1.4), wy + 1, Math.floor(stand[2] + 0.5 + dz * 1.4));
        if (wallSolid && between) return { wall: [wx, wy, wz] as [number, number, number], stand: stand as [number, number, number] };
      }
    }
    return null;
  });
}

async function selectItem(page: Page, touch: Touch, item: string): Promise<number> {
  const slot = await page.evaluate((i) => window.__DD__.game.loop.hotbarView().slots.findIndex((s: { item: string | null }) => s.item === i), item);
  expect(slot, `${item} is on the hotbar`).toBeGreaterThanOrEqual(0);
  await tapControl(page, touch, `hotbar:${slot}`);
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.hotbarView().held)) === item, 4), `${item} in hand`).toBe(true);
  return slot;
}

test('craft once and five times, place a torch on a wall, then a ladder that climbs the wall', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);

  // Craft ×1 and ×5 (by hand): planks from fungal wood, torches from fungal wood and coal; by the
  // camp's Workbench (the ladders need it).
  const bench = await page.evaluate(() => window.__DD__.game.session.layout.campSite?.stations.find((s: { station: string }) => s.station === 'workbench')?.p ?? null);
  expect(bench, 'the camp has a Workbench').not.toBeNull();
  const byBench = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x + 1, y, z + 1), bench!);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), byBench!);
  await page.evaluate(() => {
    window.__DD__.give('fungalWood', 8);
    window.__DD__.give('coal', 2);
  });
  await tapControl(page, touch, 'craft');
  expect(await waitScreen(page, 'crafting')).toBe(true);
  await tapEl(page, touch, page.locator('[data-key="tab:building"]'));
  const planks0 = await count(page, 'plank');
  const five = page.locator('[data-key="craft:plank:5"]');
  await expect(five).toBeEnabled();
  await tapEl(page, touch, five);
  expect(await untilGame(page, async () => (await count(page, 'plank')) - planks0 >= 20, 6), 'Craft ×5 made five batches of planks').toBe(true);
  const made = (await uiEvents(page, 'craft:made')).map((e) => e.payload);
  expect(made[0]).toMatchObject({ recipe: 'plank', times: 5 });
  // Only 3 fungal wood left: the ×5 of torches is off (2 coal), the ×1 is on.
  await expect(page.locator('[data-key="craft:torch:5"]')).toBeDisabled();
  const torches0 = await count(page, 'torch');
  await tapEl(page, touch, page.locator('[data-key="craft:torch:1"]'));
  expect(await untilGame(page, async () => (await count(page, 'torch')) > torches0, 6), 'Craft ×1 made torches').toBe(true);
  // Ladders need the Workbench (the camp's): 3 planks each.
  const ladder = page.locator('[data-key="craft:ladder:1"]');
  await expect(ladder).toBeEnabled();
  await tapEl(page, touch, ladder);
  expect(await untilGame(page, async () => (await count(page, 'ladder')) > 0, 6), 'a ladder at the Workbench').toBe(true);
  await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
  expect(await waitScreen(page, 'none')).toBe(true);

  await mark(page, 'build torch');
  // A torch on a wall: stand facing it, pick the torches, aim at the wall, tap Place.
  const spot = await faceAWall(page);
  expect(spot, 'a wall near the camp').not.toBeNull();
  const { wall, stand } = spot!;
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), stand);
  await selectItem(page, touch, 'torch');
  await expect(page.locator('.dd-pad-place')).toBeVisible();
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x + 0.5, y + 1.5, z + 0.5, 0, 0), wall);
  expect(await untilGame(page, async () => (await hud(page)).reticle === 'place', 4), 'the reticle reads "place" on the wall').toBe(true);
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'place');
  expect(await waitEvent(page, 'player:placed', 6), 'the torch was placed').toBe(true);
  const t = (await uiEvents(page, 'player:placed'))[0].payload;
  expect(t.item).toBe('torch');
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), [t.x, t.y, t.z])).toBe(TORCH);
  // VIS draws it (TorchLights reads the voxels); it lights its cell.
  expect(Math.hypot(t.x + 0.5 - (wall[0] + 0.5), t.z + 0.5 - (wall[2] + 0.5)), 'on the face of the wall').toBeLessThan(1.6);

  await mark(page, 'build ladder');
  // A ladder on the wall at the feet: one ladder item climbs four cells up.
  const ladders0 = await count(page, 'ladder');
  await selectItem(page, touch, 'ladder');
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x + 0.5, y + 0.5, z + 0.5, 0, 0), wall);
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'place');
  expect(await waitEvent(page, 'player:placed', 6), 'the ladder was placed').toBe(true);
  const l = (await uiEvents(page, 'player:placed'))[0].payload;
  expect(l.item).toBe('ladder');
  const column = await page.evaluate(([x, y, z]) => [0, 1, 2, 3].map((k) => window.__DD__.block(x, y + k, z)), [l.x, l.y, l.z]);
  expect(column.filter((id) => id === LADDER).length, 'the ladder climbs the wall').toBeGreaterThanOrEqual(3);
  expect(await count(page, 'ladder')).toBe(ladders0 - 1);

  await mark(page, 'build climb');
  // Climb it: step into the ladder and push the stick forward; the explorer goes up.
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), [l.x, l.y, l.z]);
  const y0 = await page.evaluate(() => window.__DD__.game.player.y);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x + 0.5, y + 2.5, z + 0.5, 0, 0), wall);
  const stick = { x: 70, y: 690 };
  const climbed = await holdUntil(page, touch, stick, { x: stick.x, y: stick.y - 50 }, async () => (await page.evaluate(() => window.__DD__.game.player.y)) - y0 > 1.2, 8);
  expect(climbed, 'the explorer climbed the ladder').toBe(true);
  void centreOf;
});
