import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { LOADED_CEILING_MS, untilGame } from './dd';

// Tap to act on an upright phone screen (game/TapController), with real touch events:
// one tap mines a block until it breaks, a tap on far ground walks there, a tap on the workbench
// walks up to it and opens it, and one press of Mine finishes the highlighted block.

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
  expect(await page.evaluate(() => window.__DD__.game.input.lock)).toBeNull();
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

test('upright screen: one press of Mine finishes the highlighted block', async ({ page }) => {
  await newGame(page);
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const prep = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(7, x, y, z, 40), lm.firstCrystals);
  expect(prep).not.toBeNull();
  const block = prep!.block;
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), block);
  await page.evaluate(() => window.__DD__.step(2));
  await page.locator('.dd-mine').tap();
  const broke = await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === AIR, 12);
  expect(broke, 'the highlighted vein broke after one press').toBe(true);
});
