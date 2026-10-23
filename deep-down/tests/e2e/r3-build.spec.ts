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

/** Faces of a wall the build steps use: where the explorer stands, the torch's face, the ladder's. */
interface BuildSpot {
  stand: [number, number, number];
  /** The torch's wall cell (at chest height) and the point on its face toward the stand. */
  wall: [number, number, number];
  torchAim: [number, number, number];
  /** The ladder's wall column (its foot cell) beside the torch, and the point on its foot face. */
  ladderWall: [number, number, number];
  ladderAim: [number, number, number];
}

/**
 * A stand near the camp fire facing a wall 2-3 m away, where Place itself (ActionLayer.placeCells,
 * asked before committing) takes a torch on the wall at chest height and, on the column beside it, a
 * ladder of three cells or more (gate run 3: the reticle never read "place" for the ladder; the stand
 * then came from standableNear + 0.5, a cell corner, and aimAt chose whichever face it saw first).
 * The aims are points on the faces toward the stand (aimAt adds half a cell: they are passed back by
 * it). Walls are taken along the stand's main axis, so their faces look straight at it.
 */
async function buildSpot(page: Page): Promise<BuildSpot | null> {
  return page.evaluate(() => {
    const dd = window.__DD__;
    const g = dd.game;
    const fire = g.session.layout.campSite?.fire ?? [g.player.x, g.player.y, g.player.z];
    const air = (x: number, y: number, z: number) => dd.block(x, y, z) === 0;
    const solid = (x: number, y: number, z: number) => dd.isSolid(x, y, z);
    const ask = (kind: string, p: number[]) => {
      dd.aimAt(p[0] - 0.5, p[1] - 0.5, p[2] - 0.5, 0, 0);
      return g.act.placeCells(kind) as Array<[number, number, number]> | null;
    };
    for (let a = 0; a < 16; a++) {
      const dx = Math.sin((a / 16) * Math.PI * 2);
      const dz = Math.cos((a / 16) * Math.PI * 2);
      const ax = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) : 0;
      const az = ax === 0 ? Math.sign(dz) : 0;
      for (let d = 3; d < 14; d++) {
        const st = dd.standableNear(fire[0] + dx * d, fire[1], fire[2] + dz * d);
        if (!st) continue;
        const y = st[1];
        for (const k of [2, 3]) {
          const wx = Math.floor(st[0]) + ax * k;
          const wz = Math.floor(st[2]) + az * k;
          // Rock at chest height with air in front of it (and the way there open).
          if (!solid(wx, y + 1, wz) || !air(wx - ax, y + 1, wz - az) || !air(wx - ax, y, wz - az)) continue;
          for (const side of [1, -1, 2, -2]) {
            const lx = wx + az * side;
            const lz = wz + ax * side;
            if (![0, 1, 2].every((h) => solid(lx, y + h, lz) && air(lx - ax, y + h, lz - az))) continue;
            dd.teleport(st[0], st[1], st[2]);
            // (A hair into the rock past the face, so the ray meets that face.)
            const torchAim = [wx + 0.5 - ax * 0.48, y + 1.5, wz + 0.5 - az * 0.48];
            const ladderAim = [lx + 0.5 - ax * 0.48, y + 0.5, lz + 0.5 - az * 0.48];
            const torch = ask('torch', torchAim);
            const ladder = ask('ladder', ladderAim);
            const torchOk = !!torch && torch[0][0] === wx - ax && torch[0][1] === y + 1 && torch[0][2] === wz - az;
            const ladderOk = !!ladder && ladder.length >= 3 && ladder[0][0] === lx - ax && ladder[0][1] === y && ladder[0][2] === lz - az;
            if (torchOk && ladderOk)
              return { stand: st, wall: [wx, y, wz], torchAim, ladderWall: [lx, y, lz], ladderAim } as {
                stand: [number, number, number];
                wall: [number, number, number];
                torchAim: [number, number, number];
                ladderWall: [number, number, number];
                ladderAim: [number, number, number];
              };
          }
        }
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
  // (standableNear gives the cell's centre: stood there as it is.)
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), byBench!);
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
  // Slot 6 took the planks, so the ladders have no slot of their own and the camp's deposit banked
  // them: put them on slot 6 and take them from the bank (LOOP's assign and withdraw, as the Bag does).
  await page.evaluate(() => {
    const loop = window.__DD__.game.loop;
    loop.assign(5, 'ladder');
    loop.withdraw('ladder', 3);
  });
  expect(await page.evaluate(() => window.__DD__.game.loop.hotbarView().slots[5].item)).toBe('ladder');
  await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
  expect(await waitScreen(page, 'none')).toBe(true);

  await mark(page, 'build torch');
  // A torch on a wall: stand facing it, pick the torches, aim at the wall, tap Place.
  const spot = await buildSpot(page);
  expect(spot, 'a wall near the camp that takes a torch and a ladder (Place\'s own rule)').not.toBeNull();
  const { wall, stand, torchAim, ladderWall, ladderAim } = spot!;
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), stand);
  await selectItem(page, touch, 'torch');
  await expect(page.locator('.dd-pad-place')).toBeVisible();
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x - 0.5, y - 0.5, z - 0.5, 0, 0), torchAim);
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
  // At the foot of the wall, on the column beside the torch that Place took for a ladder (buildSpot).
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x - 0.5, y - 0.5, z - 0.5, 0, 0), ladderAim);
  expect(await untilGame(page, async () => (await hud(page)).reticle === 'place', 4), 'the reticle reads "place" for the ladder').toBe(true);
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
  // (The placed ladder's cell, an index: its centre is + 0.5.)
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), [l.x, l.y, l.z]);
  const y0 = await page.evaluate(() => window.__DD__.game.player.y);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y + 2, z, 0, 0), ladderWall);
  const stick = { x: 70, y: 690 };
  const climbed = await holdUntil(page, touch, stick, { x: stick.x, y: stick.y - 50 }, async () => (await page.evaluate(() => window.__DD__.game.player.y)) - y0 > 1.2, 8);
  expect(climbed, 'the explorer climbed the ladder').toBe(true);
  void centreOf;
});
