import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, aimAtOre, boot, newExpedition, quiet } from './r3';
import type { Touch } from './touch';

// Round 3 (UI): the tap-to-act accelerator in the strata (BRIEF §0.6: "a tap on a target within reach
// mines, attacks or uses it"), with real touches on an upright phone at 390 x 844 (the first version's
// tap.spec walked the hand-made world's landmarks; this one walks stratum I's camp):
// - one tap on a vein mines it until it breaks, with nothing held;
// - a tap on far floor walks there; a tap on the camp's Workbench walks up to it and opens Craft;
// - holding still on a vein mines it;
// - a drag anywhere looks (pitch held within 75 degrees, no roll); a tap into the dark raises the lantern;
// - a tap on plain rock is a soft tunk (nothing breaks), and a tap a little off a vein still takes it;
// - a tap on a monster strikes it with the weapon in hand, while a tap on ore uses the pick.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

const COPPER = 7;
const AIR = 0;

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

const player = (page: Page) => page.evaluate(() => ({ x: window.__DD__.game.player.x as number, y: window.__DD__.game.player.y as number, z: window.__DD__.game.player.z as number }));
const fire = (page: Page) => page.evaluate(() => (window.__DD__.game.session.layout.campSite?.fire ?? [window.__DD__.game.player.x, window.__DD__.game.player.y, window.__DD__.game.player.z]) as [number, number, number]);

/** A quick drag (start and moves pipelined, so harness latency cannot make it a hold). */
async function dragNow(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, id = 4): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', pts: Array<{ x: number; y: number }>) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ ...p, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const at = (k: number) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
  // The start and every move together (sent in order), then the end: one swipe whatever the latency.
  const sent = [send('touchStart', [from])];
  for (let i = 1; i <= 8; i++) sent.push(send('touchMove', [at(i / 8)]));
  await Promise.all(sent);
  await send('touchEnd', []);
  await cdp.detach();
}

/** Start an expedition with the tutorial skipped and the creatures held off. */
async function start(page: Page): Promise<Touch> {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);
  return touch;
}

test('one tap mines a vein until it breaks, with nothing held; holding still mines one too', async ({ page }) => {
  const touch = await start(page);
  const at = { x: 195, y: Math.round(844 * 0.45) };
  // A vein the tap's ray really meets (no corner of rock in front of it).
  const vein = await aimAtOre(page, COPPER, [0, 1 - (at.y / 844) * 2]);
  expect(vein, 'a copper vein near the camp').not.toBeNull();
  const block = vein!;
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)).toBe(COPPER);
  await page.evaluate(() => window.__DD__.clearEvents());
  await touch.tap(at);
  const broke = await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === AIR, 20);
  expect(broke, 'the tapped vein broke without holding').toBe(true);
  const hits = await page.evaluate(([x, y, z]) => window.__DD__.events('block:hit').filter((e) => e.payload.x === x && e.payload.y === y && e.payload.z === z).length, block);
  expect(hits).toBeGreaterThanOrEqual(2);
  // The lock lets go on the next frame after the break.
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.input.lock)) === null, 3)).toBe(true);

  // Holding still on another vein mines it (no button pressed).
  const vein2 = await aimAtOre(page, COPPER);
  expect(vein2, 'another copper vein').not.toBeNull();
  await page.evaluate(() => window.__DD__.clearEvents());
  await touch.down({ x: 195, y: 422 });
  const held = await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), vein2!)) === AIR, 25);
  await touch.up();
  expect(held, 'the held vein broke').toBe(true);
  expect(await page.evaluate(() => window.__DD__.events('tool:swing').length)).toBeGreaterThanOrEqual(2);
});

test('a tap on far floor walks there; a tap on the camp Workbench walks up to it and opens Craft', async ({ page }) => {
  const touch = await start(page);
  const f = await fire(page);
  // Stand by the fire and look at a stretch of open floor a few metres away.
  const spot = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 2, y, z + 3), f);
  expect(spot, 'floor by the fire').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), spot!);
  let goal: [number, number, number] | null = null;
  for (const [dx, dz] of [[-2, 9], [2, 9], [-6, 6], [6, 6], [0, -8], [-8, 0], [8, 0]]) {
    goal = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), [f[0] + dx, f[1], f[2] + dz]);
    if (goal && Math.hypot(goal[0] - spot![0], goal[2] - spot![2]) > 4) break;
  }
  expect(goal, 'open floor at camp').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y - 1, z, 0, -0.1), goal!);
  const pt = await screenOf(page, [goal![0] + 0.5, goal![1], goal![2] + 0.5]);
  expect(pt, 'the floor is on screen').not.toBeNull();
  const before = await player(page);
  const d0 = Math.hypot(before.x - goal![0] - 0.5, before.z - goal![2] - 0.5);
  await touch.tap({ x: Math.round(pt!.x), y: Math.round(pt!.y) });
  const arrived = await untilGame(page, async () => {
    const p = await player(page);
    return Math.hypot(p.x - goal![0] - 0.5, p.z - goal![2] - 0.5) < 1.4;
  }, 15);
  expect(arrived, `walked to the tapped floor (${d0.toFixed(1)} m away)`).toBe(true);

  // The Workbench: tap it from a few metres away; the explorer walks up and Craft opens.
  const bench = await page.evaluate(() => window.__DD__.game.session.layout.campSite.stations.find((s: { station: string }) => s.station === 'workbench').p as [number, number, number]);
  let near: [number, number, number] | null = null;
  for (const [dx, dz] of [[-1, 4], [1, 4], [4, 1], [-4, 1], [0, -4]]) {
    near = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), [bench[0] + dx, bench[1], bench[2] + dz]);
    if (near && Math.hypot(near[0] + 0.5 - bench[0], near[2] + 0.5 - bench[2]) > 2.6) break;
  }
  expect(near, 'floor a few metres from the Workbench').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), near!);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(Math.floor(x), Math.floor(y), Math.floor(z), 0, 0), bench);
  const bp = await screenOf(page, [bench[0], bench[1] + 0.6, bench[2]]);
  expect(bp, 'the Workbench is on screen').not.toBeNull();
  await touch.tap({ x: Math.round(bp!.x), y: Math.round(bp!.y) });
  const opened = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.state().screen)) === 'crafting', 20);
  expect(opened, 'the Workbench opened Craft').toBe(true);
});

test('a drag looks (pitch held, no roll); a tap into the dark raises the lantern', async ({ page }) => {
  const touch = await start(page);
  const cam = () => page.evaluate(() => ({ yaw: window.__DD__.game.cameraRig.yaw as number, pitch: window.__DD__.game.cameraRig.pitch as number }));
  await page.evaluate(() => window.__DD__.clearEvents());
  const a0 = await cam();
  await dragNow(page, { x: 280, y: 300 }, { x: 160, y: 300 });
  const turned = await untilGame(page, async () => (await cam()).yaw - a0.yaw > 0.3, 3);
  expect(turned, `yaw turned by a 120 px drag to the left (${((await cam()).yaw - a0.yaw).toFixed(3)} rad)`).toBe(true);
  // A long drag down cannot tip the view past 75 degrees. (From under the top HUD: a finger that
  // lands on the tracker presses it instead of looking.)
  await dragNow(page, { x: 200, y: 300 }, { x: 200, y: 840 });
  await untilGame(page, async () => (await cam()).pitch < -1.0, 3);
  await dragNow(page, { x: 200, y: 300 }, { x: 200, y: 840 });
  await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.input.lookDY)) === 0, 3);
  const down = (await cam()).pitch;
  expect(down).toBeLessThan(-1.2);
  expect(down).toBeGreaterThanOrEqual((-75 * Math.PI) / 180 - 1e-6);
  expect(await page.evaluate(() => window.__DD__.events('block:hit').length)).toBe(0);
  expect(await page.evaluate(() => window.__DD__.game.cameraRig.camera.rotation.z)).toBe(0);

  // A tap on the dark roof of the camp hall (no find, no floor in reach): the lantern is raised.
  await page.evaluate(() => window.__DD__.look(window.__DD__.game.cameraRig.yaw, 0.9));
  await untilGame(page, async () => true, 0.3);
  const b = await cam();
  await touch.tap({ x: 195, y: 160 });
  const reacted = await untilGame(page, async () => {
    const c = await cam();
    return (await page.evaluate(() => window.__DD__.game.viewmodel.raised as number)) > 0 || Math.abs(c.yaw - b.yaw) + Math.abs(c.pitch - b.pitch) > 1e-4;
  }, 5);
  expect(reacted, 'a tap into the dark raises the lantern or turns the view').toBe(true);
  expect(await page.evaluate(() => window.__DD__.game.input.lock)).toBeNull();
});

const SLATE = 1;

test('a tap on plain rock is a soft tunk; a tap a little off a vein still mines it, outlined', async ({ page }) => {
  const touch = await start(page);
  const p0 = await player(page);
  // Plain rock in reach: the host rock round the camp, or slate set on a wall cell for the test.
  const at = { x: 195, y: 400 };
  const ay = 1 - (at.y / 844) * 2;
  // The n-th wall cell round the explorer with a stand in front of it that sees one of its faces.
  const faceAt = (skip: number) =>
    page.evaluate(([x, y, z, n, ny]) => {
      const dd = window.__DD__;
      let k = 0;
      for (let r = 2; r < 12; r++)
        for (let a = 0; a < 16; a++) {
          const wx = Math.floor(x + Math.sin((a / 16) * Math.PI * 2) * r);
          const wz = Math.floor(z + Math.cos((a / 16) * Math.PI * 2) * r);
          const wy = Math.floor(y) + 1;
          if (!dd.isSolid(wx, wy, wz)) continue;
          const stand = dd.standableNear(wx + Math.sign(x - wx) * 1.5, y, wz + Math.sign(z - wz) * 1.5);
          if (!stand || k++ < n) continue;
          dd.setBlock(wx, wy, wz, 1);
          dd.teleport(stand[0] + 0.5, stand[1], stand[2] + 0.5);
          if (!dd.aimAt(wx, wy, wz, 0, ny)) continue;
          return { block: [wx, wy, wz] as [number, number, number], stand };
        }
      return null;
    }, [p0.x, p0.y, p0.z, skip, ay] as const);
  let face: Awaited<ReturnType<typeof faceAt>> = null;
  let plain = false;
  for (let n = 0; n < 6 && !plain; n++) {
    face = await faceAt(n);
    if (!face) break;
    await untilGame(page, async () => true, 0.3);
    plain = await page.evaluate(([ny]) => {
      const g = window.__DD__.game;
      const e = g.cameraRig.eye;
      const r = g.mining.pick(0, ny, e.x, e.y, e.z, 48);
      return !!r.target && r.target.kind === 'block' && r.target.inReach && r.target.block === 1;
    }, [ay] as const);
  }
  expect(face, 'a rock face near the camp').not.toBeNull();
  expect(plain, 'slate in reach under the finger').toBe(true);
  await page.evaluate(() => {
    const w = window as unknown as { __fp: string[] };
    w.__fp = [];
    const bus = window.__DD__.game.bus;
    for (const type of ['block:tunk', 'block:hit', 'weapon:hit', 'weapon:swing']) bus.on(type, () => w.__fp.push(type));
  });
  await touch.tap(at);
  const tunked = await untilGame(page, async () => page.evaluate(() => (window as unknown as { __fp: string[] }).__fp.includes('block:tunk')), 6);
  expect(tunked, 'the pick tunked on the slate').toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __fp: string[] }).__fp.filter((e) => e === 'block:hit').length)).toBe(0);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), face!.block)).toBe(SLATE);
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.input.lock)) === null, 3)).toBe(true);

  // A vein alone in slate: a tap 20 px past its edge on plain rock still takes it, and it wears the selection.
  const p1 = await player(page);
  const prep = await page.evaluate(([id, x, y, z]) => window.__DD__.prepareMining(id, x, y, z, 48), [COPPER, p1.x, p1.y, p1.z]);
  expect(prep, 'a copper vein in reach').not.toBeNull();
  const block = prep!.block;
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
        // Clear of the HUD's top rows and the bottom pads.
        if (x > 20 && x < innerWidth - 20 && y > 240 && y < innerHeight - 260 && !find(x, y)) return { x, y, edge: d };
        break;
      }
    return null;
  }, [vy]);
  expect(off, 'plain rock beside the vein').not.toBeNull();
  await page.evaluate(() => window.__DD__.clearEvents());
  await touch.tap(off!);
  const struck = await untilGame(page, async () => page.evaluate(() => window.__DD__.events('block:hit').some((e) => e.payload.block === 7)), 8);
  expect(struck, `a tap 20 px past the vein's edge (${off!.edge} px from its centre) mined copper`).toBe(true);
  expect((await page.evaluate(() => window.__DD__.game.highlight.selection))?.kind).toBe('block');
  const broke = await untilGame(page, async () => page.evaluate(() => window.__DD__.events('block:broken').some((e) => e.payload.block === 7)), 20);
  expect(broke, 'the snapped vein broke').toBe(true);
  expect(await page.evaluate(() => window.__DD__.events('block:hit').filter((e) => e.payload.block === 1).length)).toBe(0);
});

test('a tap on a monster strikes it with the weapon in hand; a tap on ore still uses the pick', async ({ page }) => {
  const touch = await start(page);
  // Out of the camp (creatures are put away inside it): open floor 20-40 m from the fire.
  const f = await fire(page);
  const away = await page.evaluate(([x, y, z]) => {
    const dd = window.__DD__;
    for (let d = 20; d < 60; d += 4)
      for (let a = 0; a < 12; a++) {
        const s = dd.standableNear(x + Math.sin(a) * d, y, z + Math.cos(a) * d);
        if (s && !dd.isSolid(s[0], s[1] + 2, s[2])) return s;
      }
    return null;
  }, f);
  expect(away, 'open floor away from the camp').not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), away!);
  expect(await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 4)).toBe(true);
  // The machete in hand (LOOP's gear: owned and equipped).
  await page.evaluate(() => {
    window.__DD__.give('machete', 1);
    window.__DD__.game.loop.equip('machete');
  });
  let id: number | null = null;
  for (let k = 0; k < 16 && id === null; k++) {
    await page.evaluate((y) => window.__DD__.look(y, -0.12), (k * Math.PI) / 8);
    id = await page.evaluate(() => {
      const dd = window.__DD__ as any;
      const fl = dd.mobs.floorAhead(2, 3.6);
      if (!fl) return null;
      const id = dd.mobs.spawn('crawler', fl[0], fl[1], fl[2]);
      dd.mobs.freeze(true);
      return id;
    });
    if (id !== null) break;
  }
  expect(id, 'a crawler on the floor ahead').not.toBeNull();
  await page.evaluate(() => {
    const w = window as unknown as { __fp: Array<{ type: string; p: any }> };
    w.__fp = [];
    const bus = window.__DD__.game.bus;
    for (const type of ['weapon:swing', 'weapon:hit', 'block:hit']) bus.on(type, (p: any) => w.__fp.push({ type, p }));
  });
  const m = await page.evaluate((i) => (window.__DD__ as any).mobs.get(i), id);
  const pt = await screenOf(page, [m.x, m.y + 0.3, m.z]);
  expect(pt, 'the crawler is on screen').not.toBeNull();
  await touch.tap({ x: Math.round(pt!.x), y: Math.round(pt!.y) });
  const hit = await untilGame(page, async () => page.evaluate(() => (window as unknown as { __fp: Array<{ type: string }> }).__fp.some((e) => e.type === 'weapon:hit')), 8);
  expect(hit, 'the tap struck the crawler').toBe(true);
  const fp = await page.evaluate(() => (window as unknown as { __fp: Array<{ type: string; p: any }> }).__fp);
  expect(fp.find((e) => e.type === 'weapon:swing')?.p.weapon).toBe('machete');
  expect(fp.find((e) => e.type === 'weapon:hit')?.p.kind).toBe('crawler');
  expect(fp.some((e) => e.type === 'block:hit')).toBe(false);
  await page.evaluate(() => (window.__DD__ as any).mobs.clear());

  // Ore: the pick, never the machete (no mode switch).
  const vein = await aimAtOre(page, COPPER);
  expect(vein, 'a copper vein').not.toBeNull();
  await page.evaluate(() => {
    (window as unknown as { __fp: unknown[] }).__fp.length = 0;
    window.__DD__.clearEvents();
  });
  await touch.tap({ x: 195, y: 422 });
  const swung = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.events('tool:swing').length)) > 0, 8);
  expect(swung, 'the pick swung at the vein').toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __fp: Array<{ type: string }> }).__fp.some((e) => e.type === 'weapon:swing'))).toBe(false);
});
