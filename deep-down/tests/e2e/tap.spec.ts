import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { LOADED_CEILING_MS, untilGame } from './dd';

// First-person touch on an upright phone screen (game/TapController, ui/TouchControls), with real
// touch events at 390 x 844: one tap mines a block until it breaks, a tap on far ground walks
// there, a tap on the workbench walks up to it and opens it, holding mines, a drag anywhere looks
// (pitch held within 75 degrees), a tap on nothing turns the view and raises the lantern, and the
// optional joystick appears where the thumb lands in the lower left third and walks.

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ timeout: 900_000 });

const COPPER = 7;
const AIR = 0;

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: LOADED_CEILING_MS, polling: 200 });
}

/** Where a world point is on screen (CSS px) under the current camera, or null if behind it. */
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

const player = (page: Page) => page.evaluate(() => {
  const p = window.__DD__.game.player;
  return { x: p.x as number, y: p.y as number, z: p.z as number };
});

/** A quick drag (start and first move pipelined, so harness latency cannot make it a hold). */
async function dragNow(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, id = 4): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const at = (k: number) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
  await Promise.all([send('touchStart', [from]), send('touchMove', [at(0.125)])]);
  for (let i = 2; i <= 8; i++) await send('touchMove', [at(i / 8)]);
  await send('touchEnd', []);
  await cdp.detach();
}

async function newGame(page: Page) {
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
}

test('upright screen: one tap mines a block until it breaks, with nothing held', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const prep = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(7, x, y, z, 40), lm.firstCrystals);
  expect(prep, 'a copper vein in reach').not.toBeNull();
  const block = prep!.block;
  const at = { x: 195, y: Math.round(844 * 0.45) };
  await page.evaluate(([x, y, z, ax, ay]) => window.__DD__.aimAt(x, y, z, ax, ay), [...block, (at.x / 390) * 2 - 1, 1 - (at.y / 844) * 2]);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)).toBe(COPPER);
  await page.evaluate(() => window.__DD__.clearEvents());
  await touch.tap(at);
  const broke = await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === AIR, 12);
  expect(broke, 'the tapped vein broke without holding').toBe(true);
  const hits = await page.evaluate(([x, y, z]) => window.__DD__.events('block:hit').filter((e) => e.payload.x === x && e.payload.y === y && e.payload.z === z).length, block);
  expect(hits).toBeGreaterThanOrEqual(2);
  // The lock lets go on the next frame after the break.
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.input.lock)) === null, 3)).toBe(true);
});

test('upright screen: a tap on far ground walks there; a tap on the workbench opens it', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  // Stand by the campfire and look at a stretch of open floor a few metres away.
  const spot = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 2, y, z + 3), lm.campfire);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), spot!);
  const goal = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 2, y, z + 9), lm.campfire);
  expect(goal, 'open floor at camp').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y - 1, z, 0, -0.1), goal!);
  const pt = await screenOf(page, [goal![0] + 0.5, goal![1], goal![2] + 0.5]);
  expect(pt, 'the floor is on screen').not.toBeNull();
  const before = await player(page);
  const d0 = Math.hypot(before.x - goal![0] - 0.5, before.z - goal![2] - 0.5);
  await touch.tap({ x: Math.round(pt!.x), y: Math.round(pt!.y) });
  const arrived = await untilGame(page, async () => {
    const p = await player(page);
    return Math.hypot(p.x - goal![0] - 0.5, p.z - goal![2] - 0.5) < 1.2;
  }, 15);
  expect(arrived, `walked to the tapped floor (${d0.toFixed(1)} m away)`).toBe(true);

  // The workbench: tap it from a few metres away; the explorer walks up and opens it.
  const bench = lm.workbench;
  const near = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 1, y, z + 4), bench);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), near!);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(Math.floor(x), Math.floor(y) - 1, Math.floor(z), 0, 0), bench);
  const bp = await screenOf(page, [bench[0], bench[1] + 0.6, bench[2]]);
  expect(bp, 'the workbench is on screen').not.toBeNull();
  await touch.tap({ x: Math.round(bp!.x), y: Math.round(bp!.y) });
  const opened = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.state().screen)) === 'crafting', 15);
  expect(opened, 'the workbench opened').toBe(true);
});

test('upright screen: holding still on a vein mines it with nothing else pressed', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const prep = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(7, x, y, z, 40), lm.firstCrystals);
  expect(prep).not.toBeNull();
  const block = prep!.block;
  const at = { x: 195, y: 422 };
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), block);
  await page.evaluate(() => window.__DD__.clearEvents());
  await touch.down(at);
  const broke = await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === AIR, 15);
  await touch.up();
  expect(broke, 'the held vein broke').toBe(true);
  // No screen shake on mining; the pick swung (strikes were sent) and the cracks showed progress.
  expect(await page.evaluate(() => window.__DD__.events('tool:swing').length)).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.dd-mine')).toHaveCount(0);
  await expect(page.locator('.dd-jump')).toHaveCount(0);
});

test('upright screen: a drag anywhere looks, a tap on nothing turns toward it, the joystick walks from the lower left third', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  const cam = () => page.evaluate(() => ({ yaw: window.__DD__.game.cameraRig.yaw as number, pitch: window.__DD__.game.cameraRig.pitch as number }));
  await page.evaluate(() => window.__DD__.clearEvents());
  // A drag in the upper middle of the screen turns the view (and mines nothing).
  const a0 = await cam();
  await dragNow(page, { x: 280, y: 300 }, { x: 160, y: 300 });
  // The look is applied on the next game frame (SwiftShader draws a few a second).
  const turned0 = await untilGame(page, async () => (await cam()).yaw - a0.yaw > 0.3, 3);
  expect(turned0, `yaw turned by a 120 px drag to the left (${((await cam()).yaw - a0.yaw).toFixed(3)} rad)`).toBe(true);
  // A long drag down (the finger moves the view, as a mouse does) cannot tip it past 75 degrees.
  await dragNow(page, { x: 200, y: 150 }, { x: 200, y: 800 });
  await untilGame(page, async () => (await cam()).pitch < -1.0, 3);
  await dragNow(page, { x: 200, y: 150 }, { x: 200, y: 800 });
  await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.input.lookDY)) === 0, 3);
  const down = (await cam()).pitch;
  expect(down).toBeLessThan(-1.2);
  expect(down).toBeGreaterThanOrEqual((-75 * Math.PI) / 180 - 1e-6);
  expect(await page.evaluate(() => window.__DD__.events('block:hit').length)).toBe(0);
  // Roll is never applied.
  expect(await page.evaluate(() => window.__DD__.game.cameraRig.camera.rotation.z)).toBe(0);

  // A tap on something no pick can break (the shrine's ancient brick): the view turns a little
  // toward it and the lantern is raised (no tap does nothing).
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const at = { x: 195, y: 422 };
  let side = false;
  for (const [id, near] of [[11, lm.tablet], [14, lm.tablet], [15, lm.campfire], [17, lm.campfire]] as Array<[number, [number, number, number]]>) {
    const hard = await page.evaluate(([i, x, y, z]) => window.__DD__.prepareMining(i, x, y, z, 30), [id, ...near] as [number, number, number, number]);
    if (!hard) continue;
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), hard.block);
    side = await page.evaluate(() => {
      const g = window.__DD__.game;
      const e = g.cameraRig.eye;
      const r = g.mining.pick(0, 0, e.x, e.y, e.z, 48);
      return !!r.hit && r.hit.ny !== 1 && !!r.target && r.target.inReach && r.target.protectedReason !== null && !r.prop;
    });
    if (side) break;
  }
  expect(side, 'an unbreakable face in reach at the dot').toBe(true);
  {
    const b = await cam();
    await touch.tap(at);
    const reacted = await untilGame(page, async () => {
      const c = await cam();
      return (await page.evaluate(() => window.__DD__.game.viewmodel.raised as number)) > 0 || Math.abs(c.yaw - b.yaw) + Math.abs(c.pitch - b.pitch) > 1e-4;
    }, 5);
    expect(reacted, 'a tap on unbreakable timber raises the lantern').toBe(true);
    expect(await page.evaluate(() => window.__DD__.game.input.lock)).toBeNull();
  }

  // The joystick: invisible at rest, it appears where the thumb lands in the lower left third.
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x - 2 + 0.5, y, z + 0.5), (await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 2, y, z + 3), lm.campfire))!);
  await expect(page.locator('.dd-stick')).toHaveClass(/\bidle\b/);
  const p0 = await player(page);
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id: 7, radiusX: 8, radiusY: 8, force: 1 })) });
  await send('touchStart', [{ x: 70, y: 720 }]);
  for (let i = 1; i <= 6; i++) await send('touchMove', [{ x: 70, y: 720 - i * 12 }]);
  await expect(page.locator('.dd-stick')).not.toHaveClass(/\bidle\b/);
  const walked = await untilGame(page, async () => {
    const p = await player(page);
    return Math.hypot(p.x - p0.x, p.z - p0.z) > 1.2;
  }, 4);
  await send('touchEnd', []);
  await cdp.detach();
  expect(walked, 'the joystick walked the explorer').toBe(true);
  await expect(page.locator('.dd-stick')).toHaveClass(/\bidle\b/);
});
