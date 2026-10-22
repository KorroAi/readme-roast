import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, boot, centreOf, hud, newExpedition, quiet, tapControl, uiEvents, waitEvent, waitScreen, tapEl } from './r3';

// Round 3 (UI): the mobile action layout's controls with real touches at 390 x 844 (BRIEF §0.6):
// - a tap on a vein mines it until it breaks (the tap-to-act accelerator stays);
// - a drag anywhere looks; the floating stick walks and, pushed to its edge, sprints;
// - Jump; Dash (a dodge with i-frames and a cooldown ring); Sonar (the pulse, its cooldown, a hint
//   when pressed again too soon);
// - the contextual Interact chip at the camp's Workbench (its icon and verb) opens Craft;
// - a bomb thrown from the hotbar with Action bursts where it lands.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

const COPPER = 7;
const AIR = 0;

const player = (page: Page) => page.evaluate(() => ({ x: window.__DD__.game.player.x as number, y: window.__DD__.game.player.y as number, z: window.__DD__.game.player.z as number }));

/** Where a world point is on screen (CSS px) under the current camera, or null behind it. */
async function screenOf(page: Page, p: [number, number, number]): Promise<{ x: number; y: number } | null> {
  return page.evaluate(([x, y, z]) => {
    const cam = window.__DD__.game.cameraRig.camera;
    cam.updateMatrixWorld();
    const v = cam.matrixWorldInverse.elements;
    const P = cam.projectionMatrix.elements;
    const vx = v[0] * x + v[4] * y + v[8] * z + v[12];
    const vy = v[1] * x + v[5] * y + v[9] * z + v[13];
    const vz = v[2] * x + v[6] * y + v[10] * z + v[14];
    const cx = P[0] * vx + P[4] * vy + P[8] * vz + P[12];
    const cy = P[1] * vx + P[5] * vy + P[9] * vz + P[13];
    const cw = P[3] * vx + P[7] * vy + P[11] * vz + P[15];
    if (cw <= 0) return null;
    return { x: ((cx / cw + 1) / 2) * innerWidth, y: ((1 - cy / cw) / 2) * innerHeight };
  }, p);
}

test('touch: a tap mines a vein; a drag looks; the stick walks and sprints at its edge; Jump, Dash, Sonar', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);

  // A tap on a vein mines it until it breaks (nothing held).
  const p0 = await player(page);
  const prep = await page.evaluate(([id, x, y, z]) => window.__DD__.prepareMining(id, x, y, z, 48), [COPPER, p0.x, p0.y, p0.z]);
  expect(prep, 'a copper vein near the camp').not.toBeNull();
  const block = prep!.block;
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x + 0.5, y + 0.5, z + 0.5, 0, -0.1), block);
  const at = await screenOf(page, [block[0] + 0.5, block[1] + 0.5, block[2] + 0.5]);
  expect(at, 'the vein is on screen').not.toBeNull();
  await touch.tap({ x: Math.round(at!.x), y: Math.round(at!.y) });
  expect(await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === AIR, 20), 'the tapped vein broke').toBe(true);

  // A drag on the view turns it.
  const yaw0 = await page.evaluate(() => window.__DD__.game.cameraRig.yaw as number);
  await touch.drag({ x: 300, y: 380 }, { x: 180, y: 380 }, 80, 4);
  expect(await untilGame(page, async () => Math.abs((await page.evaluate(() => window.__DD__.game.cameraRig.yaw as number)) - yaw0) > 0.25, 4), 'the drag looked round').toBe(true);

  // The stick: a short push walks, a push to the edge sprints (its ring lights).
  const stick = { x: 70, y: 690 };
  const half = { x: stick.x, y: stick.y - 24 };
  await touch.press(stick, half, 7);
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.player.speed as number)) > 1, 4), 'the stick walks').toBe(true);
  expect(await page.evaluate(() => window.__DD__.game.input.sprint)).toBe(false);
  await touch.slide(half, { x: stick.x, y: stick.y - 120 }, 7);
  expect(await untilGame(page, async () => page.evaluate(() => window.__DD__.game.input.sprint), 4), 'pushed to its edge, it sprints').toBe(true);
  await expect(page.locator('.dd-stick.sprint')).toHaveCount(1);
  const fast = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.player.speed as number)) > 5.2, 6);
  await touch.up();
  expect(fast, 'sprinting is faster than walking (about 6.5 m/s)').toBe(true);

  // Jump.
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'jump');
  expect(await waitEvent(page, 'player:jump', 4), 'Jump jumped').toBe(true);

  // Dash: a dodge with i-frames; its button cools down.
  await tapControl(page, touch, 'dash');
  expect(await waitEvent(page, 'player:dash', 4), 'Dash dashed').toBe(true);
  expect((await uiEvents(page, 'player:dash'))[0].payload.iframes).toBeGreaterThan(0);
  await expect(page.locator('.dd-pad-dash.cooling')).toHaveCount(1);
  expect((await hud(page)).dashCooldown).toBeGreaterThan(0);

  // Sonar: the pulse; pressed again at once, it is still charging (a hint says how long).
  await tapControl(page, touch, 'sonar');
  expect(await waitEvent(page, 'player:sonar', 4), 'the sonar pulsed').toBe(true);
  await expect(page.locator('.dd-pad-sonar.cooling')).toHaveCount(1);
  await tapControl(page, touch, 'sonar');
  await untilGame(page, async () => true, 0.5);
  expect((await uiEvents(page, 'player:sonar')).length, 'a second pulse waits for the cooldown').toBe(1);
  await expect(page.locator('.dd-hint3.on')).toContainText(/Sonar/);
});

test('touch: the Interact chip at the Workbench opens Craft; a bomb thrown from the hotbar bursts where it lands', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);

  // At the camp's Workbench: the chip shows its icon and verb; a tap opens Craft.
  const bench = await page.evaluate(() => window.__DD__.game.session.layout.campSite.stations.find((s: { station: string }) => s.station === 'workbench')?.p ?? null);
  expect(bench, 'the camp has a Workbench').not.toBeNull();
  const stand = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x + 1, y, z + 1), bench!);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), stand!);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x + 0.5, y + 0.6, z + 0.5, 0, 0), bench!);
  expect(await untilGame(page, async () => (await hud(page)).interact?.icon === 'station', 6), 'the chip shows a station').toBe(true);
  await expect(page.locator('.dd-use')).toBeVisible();
  await expect(page.locator('.dd-use-verb')).toHaveText(/Craft/);
  await tapControl(page, touch, 'interact');
  expect(await waitScreen(page, 'crafting'), 'Interact opened Craft').toBe(true);
  await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
  expect(await waitScreen(page, 'none')).toBe(true);

  // A bomb: on the hotbar's bomb slot, Action throws it; it bursts (MOBS's blast) where the ray lands.
  await page.evaluate(() => window.__DD__.give('blastBomb', 2));
  const slot = await page.evaluate(() => window.__DD__.game.loop.hotbarView().slots.findIndex((s: { item: string | null }) => s.item === 'blastBomb'));
  expect(slot, 'bombs went to the hotbar').toBeGreaterThanOrEqual(0);
  await tapControl(page, touch, `hotbar:${slot}`);
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.hotbarView().mode)) === 'throw', 4)).toBe(true);
  await page.evaluate(() => window.__DD__.ui.clear());
  await touch.tap(await centreOf(page, 'action'));
  expect(await waitEvent(page, 'weapon:flash', 6), 'the bomb burst').toBe(true);
  const burst = (await uiEvents(page, 'weapon:flash'))[0].payload;
  expect(burst.radius).toBeGreaterThan(1);
  expect(await page.evaluate(() => window.__DD__.game.backpack.count('blastBomb'))).toBe(1);
});
