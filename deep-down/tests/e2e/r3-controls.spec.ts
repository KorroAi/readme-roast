import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, mark, aimAtOre, boot, centreOf, hud, newExpedition, quiet, tapControl, uiEvents, waitEvent, waitScreen, tapEl } from './r3';

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
  const vein = await aimAtOre(page, COPPER, [0, -0.1]);
  expect(vein, 'a copper vein near the camp').not.toBeNull();
  const block = vein!;
  const at = await screenOf(page, [block[0] + 0.5, block[1] + 0.5, block[2] + 0.5]);
  expect(at, 'the vein is on screen').not.toBeNull();
  // (The tap's ray may meet the cell of the same vein in front of this one first: any copper broken.)
  const copper0 = await page.evaluate((id) => window.__DD__.events('block:broken').filter((e: { payload: { block?: number } }) => e.payload?.block === id).length, COPPER);
  await touch.tap({ x: Math.round(at!.x), y: Math.round(at!.y) });
  const veinBroke = () =>
    page.evaluate(([x, y, z, id, n, air]) => window.__DD__.block(x, y, z) === air || window.__DD__.events('block:broken').filter((e: { payload: { block?: number } }) => e.payload?.block === id).length > n, [...block, COPPER, copper0, AIR] as const);
  expect(await untilGame(page, veinBroke, 20), 'the tapped vein broke').toBe(true);

  await mark(page, 'controls look');
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

  await mark(page, 'controls pads');
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
  // Stand a step from it, facing it (a station's `p` is its prop's base centre), from the side that
  // is open floor and where no other prop (the fire, the board, a chest) takes the focus first.
  let chip = false;
  for (const [dx, dz] of [[1.6, 0], [0, 1.6], [-1.6, 0], [0, -1.6], [1.2, 1.2], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2]]) {
    const stand = await page.evaluate(([x, y, z, ox, oz]) => {
      const s = window.__DD__.standableNear(Math.floor(x + ox), Math.floor(y), Math.floor(z + oz));
      return s && Math.hypot(s[0] + 0.5 - x, s[2] + 0.5 - z) < 3 ? s : null;
    }, [...bench!, dx, dz] as const);
    if (!stand) continue;
    await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), stand);
    // (aimAt takes a block and aims at its centre: a point target is passed half a cell back.)
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x - 0.5, y + 0.1, z - 0.5, 0, 0), bench!);
    chip = await untilGame(page, async () => (await hud(page)).interact?.icon === 'station', 3);
    if (chip) break;
    const seen = await page.evaluate(() => ({ chip: window.__DD__.ui.hud().interact, focus: (window.__DD__.game.focusTarget()?.kind as string | undefined) ?? null }));
    console.log(`[e2e] the Workbench from ${stand}: ${JSON.stringify(seen)}`);
  }
  expect(chip, 'the chip shows a station').toBe(true);
  await expect(page.locator('.dd-use')).toBeVisible();
  await expect(page.locator('.dd-use-verb')).toHaveText(/Craft/);
  await tapControl(page, touch, 'interact');
  expect(await waitScreen(page, 'crafting'), 'Interact opened Craft').toBe(true);
  await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
  expect(await waitScreen(page, 'none')).toBe(true);

  await mark(page, 'controls bomb');
  // A bomb: on the hotbar's bomb slot, Action throws it; it bursts (MOBS's blast) where the ray lands.
  // Granted as a find (it takes its hotbar slot, so the camp's deposit leaves it in the bag).
  await page.evaluate(() => window.__DD__.game.grant('blastBomb', 2));
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
