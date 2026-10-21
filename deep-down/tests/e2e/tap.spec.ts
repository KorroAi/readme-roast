import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { LOADED_CEILING_MS, untilGame, quietDeep } from './dd';

// Round 2: the spawner stays off here (see quietDeep in dd.ts).
test.beforeEach(async ({ page }) => {
  await quietDeep(page);
});


// First-person touch on an upright phone screen (game/TapController, ui/TouchControls), with real
// touch events at 390 x 844: one tap mines a vein until it breaks, a tap on far ground walks
// there, a tap on the workbench walks up to it and opens it, holding mines, a drag anywhere looks
// (pitch held within 75 degrees), a tap on nothing turns the view and raises the lantern, and the
// optional joystick appears where the thumb lands in the lower left third and walks.
// Round 2: there is no dot; a tap on ordinary rock is a soft tunk (nothing breaks); a tap a little
// off a find still takes it (56 px); a tap on a monster strikes it with the best weapon while a
// tap on ore always uses the pick.

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

  // A tap on the far dark (no find, no floor, nothing in reach): the view turns a little toward it
  // and the lantern is raised, so no tap does nothing; never a "no way through" hint.
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const ledge = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.ledge);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), ledge!);
  await page.evaluate(() => window.__DD__.look(window.__DD__.game.cameraRig.yaw, 0.55));
  await untilGame(page, async () => true, 0.3);
  {
    const b = await cam();
    await touch.tap({ x: 195, y: 200 });
    const reacted = await untilGame(page, async () => {
      const c = await cam();
      return (await page.evaluate(() => window.__DD__.game.viewmodel.raised as number)) > 0 || Math.abs(c.yaw - b.yaw) + Math.abs(c.pitch - b.pitch) > 1e-4;
    }, 5);
    expect(reacted, 'a tap into the dark raises the lantern').toBe(true);
    expect(await page.evaluate(() => window.__DD__.game.input.lock)).toBeNull();
    expect(await page.evaluate(() => document.querySelector('.dd-hint.on')?.textContent ?? '')).not.toMatch(/No way through/);
  }

  // The joystick: invisible at rest, it appears where the thumb lands in the lower left third.
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x - 2 + 0.5, y, z + 0.5), (await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 2, y, z + 3), lm.campfire))!);
  // Back at camp from the ledge, the trip's report opens: close it with its button.
  if (await untilGame(page, async () => (await page.evaluate(() => window.__DD__.state().screen)) === 'summary', 3)) {
    await page.locator('[data-key="summary-close"]').tap();
    await page.waitForFunction(() => window.__DD__.state().screen === 'none', null, { timeout: LOADED_CEILING_MS });
  }
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

const SLATE = 1;

test('round 2: no dot; a tap on ordinary rock is a soft tunk; a tap a little off a vein still mines it, outlined', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  await expect(page.locator('.dd-hud .dd-crosshair')).not.toHaveClass(/\bon\b/);
  // Ordinary rock in reach: one soft strike, a tunk; no damage, no crack, the rock stays.
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const rock = await page.evaluate(([x, y, z, id]) => window.__DD__.prepareMining(id, x, y, z, 30), [...lm.campfire, SLATE] as [number, number, number, number]);
  expect(rock, 'a slate face near camp').not.toBeNull();
  const at = { x: 195, y: 400 };
  await page.evaluate(([x, y, z, ax, ay]) => window.__DD__.aimAt(x, y, z, ax, ay), [...rock!.block, 0, 1 - (at.y / 844) * 2]);
  const plain = await page.evaluate(([ax, ay]) => {
    const g = window.__DD__.game;
    const e = g.cameraRig.eye;
    const r = g.mining.pick(ax, ay, e.x, e.y, e.z, 48);
    return !!r.target && r.target.kind === 'block' && r.target.inReach && r.target.block === 1;
  }, [0, 1 - (at.y / 844) * 2]);
  expect(plain, 'slate in reach under the finger').toBe(true);
  await page.evaluate(() => {
    const w = window as unknown as { __fp: string[] };
    w.__fp = [];
    const bus = window.__DD__.game.bus;
    for (const type of ['block:tunk', 'block:hit', 'weapon:hit', 'weapon:swing']) bus.on(type, () => w.__fp.push(type));
  });
  await touch.tap(at);
  const tunked = await untilGame(page, async () => (await page.evaluate(() => (window as unknown as { __fp: string[] }).__fp.includes('block:tunk'))), 6);
  expect(tunked, 'the pick tunked on the slate').toBe(true);
  // Polish 2: the first tunk says why (hint.plainRock); later ones only once in a while.
  expect(await page.evaluate(() => document.querySelector('.dd-hud .dd-hint')?.textContent ?? '')).toMatch(/Solid rock/);
  expect(await page.evaluate(() => (window as unknown as { __fp: string[] }).__fp.filter((e) => e === 'block:hit').length)).toBe(0);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), rock!.block)).toBe(SLATE);
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.input.lock)) === null, 3)).toBe(true);
  expect(await page.evaluate(() => window.__DD__.game.highlight.selection)).toBeNull();

  // A vein: the tap lands 40 px off it on plain rock and still mines copper; the vein wears the
  // selection outline and the progress ring sits on it while it cracks.
  const prep = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(7, x, y, z, 40), lm.firstCrystals);
  expect(prep, 'a copper vein in reach').not.toBeNull();
  const block = prep!.block;
  // The vein block alone in plain rock: every other solid cell round it becomes slate, so the
  // points beside it on screen show only stone no pick can break (the Root Galleries round the
  // camp are otherwise thick with roots and rubble, finds of their own).
  await page.evaluate(([bx, by, bz]) => {
    const dd = window.__DD__;
    for (let dz = -2; dz <= 2; dz++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const x = bx + dx;
          const y = by + dy;
          const z = bz + dz;
          if ((dx || dy || dz) && dd.isSolid(x, y, z) && dd.block(x, y, z) !== 1) dd.setBlock(x, y, z, 1);
        }
  }, block);
  const vy = 380;
  // Step back a cell or two (in reach still): from the cell beside it the vein fills the view.
  const backed = await page.evaluate(([bx, by, bz, sx, sy, sz, ay]) => {
    const dd = window.__DD__;
    const g = dd.game;
    const dx = Math.sign(sx - bx);
    const dz = Math.sign(sz - bz);
    for (const k of [2, 1, 0]) {
      const c = dd.standableNear(sx + 0.5 + dx * k, sy, sz + 0.5 + dz * k);
      if (!c) continue;
      dd.teleport(c[0], c[1], c[2]);
      dd.aimAt(bx, by, bz, 0, ay);
      const e = g.cameraRig.eye;
      const r = g.mining.pick(0, ay, e.x, e.y, e.z, 48);
      if (r.target && r.target.key === `${bx},${by},${bz}` && r.target.inReach) return k;
    }
    return -1;
  }, [...block, ...prep!.stand, 1 - (vy / 844) * 2] as [number, number, number, number, number, number, number]);
  expect(backed, 'the vein in reach from a step back').toBeGreaterThanOrEqual(0);
  // A point just beside the vein on screen (20 px past its edge) whose own ray meets no find.
  const off = await page.evaluate(([vy]) => {
    const g = window.__DD__.game;
    const e = g.cameraRig.eye;
    const find = (x: number, y: number) => {
      const r = g.mining.pick((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2, e.x, e.y, e.z, 48);
      return !!r.prop || (!!r.target && r.target.protectedReason === null);
    };
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      for (let d = 4; d < 300; d += 4) {
        if (find(195 + ux * d, vy + uy * d)) continue;
        const x = Math.round(195 + ux * (d + 20));
        const y = Math.round(vy + uy * (d + 20));
        if (x > 20 && x < innerWidth - 20 && y > 160 && y < innerHeight - 160 && !find(x, y)) return { x, y, edge: d };
        break;
      }
    return null;
  }, [vy]);
  expect(off, 'plain rock beside the vein').not.toBeNull();
  await page.evaluate(() => window.__DD__.clearEvents());
  await touch.tap(off!);
  const struck = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.events('block:hit').some((e) => e.payload.block === 7))), 8);
  expect(struck, `a tap 20 px past the vein's edge (${off!.edge} px from its centre) mined copper`).toBe(true);
  const sel = await page.evaluate(() => window.__DD__.game.highlight.selection);
  expect(sel?.kind).toBe('block');
  const broke = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.events('block:broken').some((e) => e.payload.block === 7))), 15);
  expect(broke, 'the snapped vein broke').toBe(true);
  expect(await page.evaluate(() => window.__DD__.events('block:hit').filter((e) => e.payload.block === 1).length)).toBe(0);
});

test('round 2: a tap on a monster strikes it with the best weapon; a tap on ore still uses the pick', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const stand = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.stairsBottom);
  await page.evaluate(([x, y, z]) => {
    const dd = window.__DD__ as any;
    dd.mobs.auto(false);
    dd.mobs.clear();
    dd.teleport(x, y, z);
    dd.look(-2.4, -0.12);
    dd.progression.grantNode('machete');
  }, stand!);
  // The camp check runs after the creatures each frame: spawn only once the explorer is known to
  // have left the camp, or the first frame puts the monster away as if it strayed into camp.
  expect(await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 3)).toBe(true);
  const id = await page.evaluate(() => {
    const dd = window.__DD__ as any;
    const f = dd.mobs.floorAhead(2.2, 3.4);
    if (!f) return null;
    const id = dd.mobs.spawn('crawler', f[0], f[1], f[2]);
    dd.mobs.freeze(true);
    return id;
  });
  expect(id, 'a crawler on the floor ahead').not.toBeNull();
  // With a monster near, the right hand brings the machete up.
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.viewmodel.rightHand)) === 'machete', 3)).toBe(true);
  await page.evaluate(() => {
    const w = window as unknown as { __fp: Array<{ type: string; p: any }> };
    w.__fp = [];
    const bus = window.__DD__.game.bus;
    for (const type of ['weapon:swing', 'weapon:hit', 'block:hit']) bus.on(type, (p: any) => w.__fp.push({ type, p }));
  });
  const m = await page.evaluate((id) => (window.__DD__ as any).mobs.get(id), id);
  const pt = await screenOf(page, [m.x, m.y, m.z]);
  expect(pt, 'the crawler is on screen').not.toBeNull();
  await touch.tap({ x: Math.round(pt!.x), y: Math.round(pt!.y) });
  const hit = await untilGame(page, async () => (await page.evaluate(() => (window as unknown as { __fp: Array<{ type: string }> }).__fp.some((e) => e.type === 'weapon:hit'))), 6);
  expect(hit, 'the tap struck the crawler').toBe(true);
  const fp = await page.evaluate(() => (window as unknown as { __fp: Array<{ type: string; p: any }> }).__fp);
  expect(fp.find((e) => e.type === 'weapon:swing')?.p.weapon).toBe('machete');
  expect(fp.find((e) => e.type === 'weapon:hit')?.p.kind).toBe('crawler');
  expect(fp.some((e) => e.type === 'block:hit')).toBe(false);

  // Ore: the pick, never the machete (no mode switch).
  const prep = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(8, x, y, z, 50), lm.stairsBottom);
  if (prep) {
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), prep.block);
    await page.evaluate(() => {
      (window as unknown as { __fp: unknown[] }).__fp.length = 0;
      window.__DD__.clearEvents();
    });
    await touch.tap({ x: 195, y: 422 });
    const swung = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.events('tool:swing').length)) > 0, 6);
    expect(swung, 'the pick swung at the vein').toBe(true);
    expect(await page.evaluate(() => (window as unknown as { __fp: Array<{ type: string }> }).__fp.some((e) => e.type === 'weapon:swing'))).toBe(false);
  }
});
