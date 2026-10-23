import { expect, test, type Page } from '@playwright/test';
import { LOADED_CEILING_MS, untilGame, quietDeep } from './dd';
import { CATCH_UP, mark } from './r3';

// Round 3 (UI): desktop play through real keyboard and mouse input on the production build, in the
// strata (the first version's desktop.spec walked the hand-made world's landmarks): WASD moves, Space
// jumps, right-drag looks, holding the left button mines a vein (with or without pointer lock), E uses
// the camp's Workbench (Craft opens and frees the mouse), Esc closes screens, I / Tab open the Bag,
// Esc pauses, and losing the pointer lock pauses too. The menu keys, Shift, Ctrl, Q and 1-6 are in
// r3-menus.spec.ts.

test.beforeEach(async ({ page }) => {
  await quietDeep(page);
});

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 720 } });
// SwiftShader under load renders a frame or two per second: give each test a generous budget.
test.describe.configure({ timeout: 1_800_000 });

const B = { COPPER_ORE: 7, SLATE: 1, AIR: 0 };

const state = (page: Page) => page.evaluate(() => window.__DD__.state());

async function waitMode(page: Page, mode: string): Promise<void> {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: LOADED_CEILING_MS, polling: 200 });
}

async function waitScreen(page: Page, screen: string): Promise<void> {
  await page.waitForFunction((s) => window.__DD__.state().screen === s, screen, { timeout: LOADED_CEILING_MS, polling: 50 });
}

const cameraYaw = (page: Page) => page.evaluate(() => window.__DD__.game.cameraRig.yaw as number);

/** Wait for a few game steps (in any mode), so input dispatched before the call has been consumed. */
async function settle(page: Page): Promise<void> {
  const t0 = await page.evaluate(() => window.__DD__.game.session.rig.uniforms.uTime.value as number);
  await page.waitForFunction((t) => window.__DD__.game.session.rig.uniforms.uTime.value > t + 0.06 && window.__DD__.game.input.lookDX === 0, t0, { timeout: LOADED_CEILING_MS, polling: 50 });
}

async function startSampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __samples: Array<{ y: number; grounded: boolean }>; __sampling: boolean };
    w.__samples = [];
    w.__sampling = true;
    const tick = () => {
      if (!w.__sampling) return;
      const p = window.__DD__.game.player;
      w.__samples.push({ y: p.y, grounded: p.grounded });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function stopSampling(page: Page): Promise<Array<{ y: number; grounded: boolean }>> {
  return page.evaluate(() => {
    const w = window as unknown as { __samples: Array<{ y: number; grounded: boolean }>; __sampling: boolean };
    w.__sampling = false;
    return w.__samples;
  });
}

/** Record every find name the HUD shows under the reticle (while shown). */
async function recordHudTargets(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __hudTargets: string[] };
    w.__hudTargets = [];
    const tick = () => {
      const name = document.querySelector('.dd-hud.on .dd-target.on .dd-target-name')?.textContent ?? '';
      if (name && w.__hudTargets[w.__hudTargets.length - 1] !== name) w.__hudTargets.push(name);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

const hudTargets = (page: Page) => page.evaluate(() => (window as unknown as { __hudTargets: string[] }).__hudTargets.slice());

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

async function startExpedition(page: Page): Promise<void> {
  // Game time keeps pace with the wall clock on a loaded machine (r3.ts CATCH_UP).
  await page.goto(`/index.html?${CATCH_UP}`);
  await waitMode(page, 'menu');
  // Desktop: no touch controls layer.
  expect(await page.evaluate(() => !!document.querySelector('.dd-touch-ui'))).toBe(false);
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  await waitScreen(page, 'none');
  await page.evaluate(() => {
    window.__DD__.game.quests.skipTutorial();
    window.__DD__.mobs.clear();
    // The keys and the mouse are what this spec measures, not the picture: the lightest quality
    // keeps a 1280 x 720 SwiftShader frame affordable.
    window.__DD__.game.updateSettings({ quality: 'battery' });
  });
}

const canvasAt = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id ?? '', [x, y]);

/** A trip card may open on a return to camp: close it (a captured mouse cannot aim, so dispatch the click). */
async function closeTripCard(page: Page, gameSeconds = 4): Promise<boolean> {
  const opened = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.state().screen)) === 'summary', gameSeconds);
  if (!opened) return false;
  await page.locator('[data-key="trip:close"], [data-key="summary-close"]').first().dispatchEvent('click');
  await waitScreen(page, 'none');
  return true;
}

/**
 * Turn the camera so block `b` sits off the screen centre, and return a pixel whose ray hits it
 * within reach while the centre ray does not (null if no such view was found).
 */
async function cursorOnBlock(page: Page, b: [number, number, number]): Promise<{ x: number; y: number } | null> {
  const vp = page.viewportSize()!;
  const turns: Array<[number, number]> = [];
  for (const yaw of [0.3, -0.3, 0.45, -0.45, 0.2, -0.2, 0.6, -0.6, 0.8, -0.8, 0.95, -0.95]) for (const pitch of [0.12, 0, -0.12, 0.25]) turns.push([yaw, pitch]);
  for (const [turnYaw, turnPitch] of turns) {
    const found = await page.evaluate(
      ([bx, by, bz, turnYaw, turnPitch, w, h]) => {
        const dd = window.__DD__;
        const g = dd.game;
        const rig = g.cameraRig;
        const p = g.player;
        if (!dd.aimAt(bx, by, bz, 0, 0)) return null;
        rig.yaw += turnYaw;
        rig.pitch += turnPitch;
        for (let i = 0; i < 16; i++) rig.update(0.25, p.x, p.y + 1.62 - p.stepOffset, p.z, rig.camera.aspect);
        const key = `${bx},${by},${bz}`;
        const hits = (nx: number, ny: number, fromPointer = true) => {
          const e = rig.eye;
          const t = g.mining.findTarget({ aimFromPointer: fromPointer, aimX: nx, aimY: ny }, e.x, e.y, e.z);
          return !!t && t.key === key && t.inReach;
        };
        if (hits(0, 0, false)) return null;
        const step = 16;
        const on = new Set<string>();
        for (let y = 40; y <= h - 40; y += step) for (let x = 40; x <= w - 40; x += step) if (hits((x / w) * 2 - 1, 1 - (y / h) * 2)) on.add(`${x},${y}`);
        let best: { x: number; y: number; n: number } | null = null;
        for (const k of on) {
          const [x, y] = k.split(',').map(Number);
          if (document.elementFromPoint(x, y)?.id !== 'game') continue;
          let n = 0;
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (on.has(`${x + dx * step},${y + dy * step}`)) n++;
          if (!best || n > best.n) best = { x, y, n };
        }
        return best && best.n >= 9 ? { x: best.x, y: best.y } : null;
      },
      [...b, turnYaw, turnPitch, vp.width, vp.height] as const,
    );
    if (found) return found;
  }
  return null;
}

/**
 * Hold the left mouse button on a copper vein near the camp until it breaks. A left click asks for
 * pointer lock (fine pointer): if it is granted, mining aims from the centre; otherwise from the cursor.
 */
async function mineWithMouse(page: Page): Promise<{ locked: boolean; press: { x: number; y: number } }> {
  const vp = page.viewportSize()!;
  const p = await page.evaluate(() => ({ x: window.__DD__.game.player.x, y: window.__DD__.game.player.y, z: window.__DD__.game.player.z }));
  const vein = await page.evaluate(([x, y, z, id]) => window.__DD__.prepareMining(id, x, y, z, 48), [p.x, p.y, p.z, B.COPPER_ORE] as [number, number, number, number]);
  expect(vein, 'a reachable copper vein near the camp').not.toBeNull();
  // One block of ore on its own in slate, so the screen points whose ray meets this block are a solid patch.
  await page.evaluate(([x, y, z]) => {
    for (let dz = -1; dz <= 1; dz++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) if ((dx || dy || dz) && window.__DD__.isSolid(x + dx, y + dy, z + dz)) window.__DD__.setBlock(x + dx, y + dy, z + dz, 1);
  }, vein!.block);
  await settle(page);
  const press = await cursorOnBlock(page, vein!.block);
  expect(press, 'a screen point off the centre whose ray hits the block').not.toBeNull();
  const ndc: [number, number] = [(press!.x / vp.width) * 2 - 1, 1 - (press!.y / vp.height) * 2];
  expect(await canvasAt(page, press!.x, press!.y)).toBe('game');
  await page.evaluate(() => window.__DD__.clearEvents());
  await recordHudTargets(page);
  const canLock = await page.evaluate(() => {
    const w = window as unknown as { __lockAnswer: string };
    w.__lockAnswer = 'pending';
    document.addEventListener('pointerlockchange', () => (w.__lockAnswer = 'change'), { once: true });
    document.addEventListener('pointerlockerror', () => (w.__lockAnswer = 'error'), { once: true });
    return typeof document.getElementById('game')?.requestPointerLock === 'function' && matchMedia('(pointer: fine)').matches;
  });
  await page.mouse.move(press!.x, press!.y);
  await page.mouse.down({ button: 'left' });
  if (canLock) await page.waitForFunction(() => (window as unknown as { __lockAnswer: string }).__lockAnswer !== 'pending', null, { timeout: LOADED_CEILING_MS });
  await settle(page);
  const locked = await page.evaluate(() => document.pointerLockElement === document.getElementById('game'));
  test.info().annotations.push({ type: 'pointer lock', description: locked ? 'granted: centre aim' : 'not granted: cursor aim' });
  const aim = await page.evaluate(() => {
    const i = window.__DD__.game.input;
    return { mining: i.mining, fromPointer: i.aimFromPointer, x: i.aimX, y: i.aimY };
  });
  expect(aim.mining).toBe(true);
  if (locked) {
    // Captured: the aim is the screen centre (the reticle), wherever the cursor was.
    expect(aim.fromPointer).toBe(false);
    expect(aim.x).toBeCloseTo(0, 6);
    expect(aim.y).toBeCloseTo(0, 6);
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), vein!.block);
  } else {
    // Free cursor: mining aims through the pressed point.
    expect(aim.fromPointer).toBe(true);
    expect(aim.x).toBeCloseTo(ndc[0], 3);
    expect(aim.y).toBeCloseTo(ndc[1], 3);
  }
  const broke = () => untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), vein!.block)) === B.AIR, 30, LOADED_CEILING_MS, 200);
  if (!(await broke()) && locked) {
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), vein!.block);
    await broke();
  }
  await page.mouse.up({ button: 'left' });
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), vein!.block)).toBe(B.AIR);
  const onTarget = await page.evaluate(([x, y, z]) => {
    const at = (e: { payload: any }) => e.payload.x === x && e.payload.y === y && e.payload.z === z;
    return { hits: window.__DD__.events('block:hit').filter(at).length, broken: window.__DD__.events('block:broken').some(at) };
  }, vein!.block);
  expect(onTarget.hits, 'pick hits on the target').toBeGreaterThan(1);
  expect(onTarget.broken).toBe(true);
  if (!locked) {
    const elsewhere = await page.evaluate(([x, y, z]) => {
      const off = (e: { payload: any }) => e.payload.x !== x || e.payload.y !== y || e.payload.z !== z;
      return [...window.__DD__.events('block:hit'), ...window.__DD__.events('block:broken')].filter(off).map((e) => `${e.type} ${e.payload.x},${e.payload.y},${e.payload.z}`);
    }, vein!.block);
    expect(elsewhere, 'strikes away from the block under the cursor').toEqual([]);
  }
  // While the button was held, the HUD named the find under the aim.
  expect(await hudTargets(page)).toContain('Copper Vein');
  expect(await page.evaluate(() => window.__DD__.game.input.mining)).toBe(false);
  return { locked, press: press! };
}

test('desktop controls in the strata: keyboard and mouse drive movement, look, mining, screens and pause', async ({ page }) => {
  const errors = watchErrors(page);
  await startExpedition(page);
  const vp = page.viewportSize()!;

  await mark(page, 'desktop walk');
  // 1. Hold W: the explorer walks forward (about 4.2 m/s).
  let s = await state(page);
  const start = s.player;
  const playT0 = await page.evaluate(() => window.__DD__.game.playTime as number);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.waitForFunction((t0) => window.__DD__.game.playTime - t0 >= 1.2, playT0, { timeout: LOADED_CEILING_MS, polling: 50 });
  await page.keyboard.up('KeyW');
  s = await state(page);
  const walked = Math.hypot(s.player.x - start.x, s.player.z - start.z);
  expect(walked, 'metres walked holding W for 1.2 s').toBeGreaterThan(1.5);
  expect(await page.evaluate(() => window.__DD__.game.input.moveY)).toBe(0);

  await mark(page, 'desktop jump');
  // 2. Space: the explorer leaves the ground and lands again.
  await page.waitForFunction(() => window.__DD__.game.player.grounded && window.__DD__.game.player.speed < 0.05, null, { timeout: LOADED_CEILING_MS });
  const groundY = (await state(page)).player.y;
  await startSampling(page);
  await page.keyboard.down('Space');
  await page.waitForTimeout(120);
  await page.keyboard.up('Space');
  await page.waitForFunction(
    (y0) => {
      const w = window as unknown as { __samples: Array<{ y: number; grounded: boolean }> };
      const air = w.__samples.findIndex((p) => !p.grounded && p.y > y0 + 0.3);
      return air >= 0 && w.__samples.slice(air).some((p) => p.grounded);
    },
    groundY,
    { timeout: LOADED_CEILING_MS },
  );
  const jump = await stopSampling(page);
  expect(jump.some((p) => !p.grounded), 'airborne after Space').toBe(true);
  expect(Math.max(...jump.map((p) => p.y)) - groundY, 'jump height in metres').toBeGreaterThan(0.5);

  await mark(page, 'desktop look');
  // 3. Right-button drag turns the camera; dragging back turns it back. It never mines.
  await page.evaluate(() => window.__DD__.clearEvents());
  const drag = async (fromX: number, toX: number) => {
    const y = Math.round(vp.height * 0.45);
    expect(await canvasAt(page, fromX, y)).toBe('game');
    await page.mouse.move(fromX, y);
    await settle(page);
    const before = await cameraYaw(page);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(toX, y, { steps: 10 });
    await page.mouse.up({ button: 'right' });
    await settle(page);
    return (await cameraYaw(page)) - before;
  };
  const right = await drag(560, 760);
  expect(Math.abs(right), 'yaw change for a 200 px right-drag').toBeGreaterThan(0.4);
  const left = await drag(760, 560);
  expect(left, 'dragging back by the same distance turns back by the same angle').toBeCloseTo(-right, 6);
  expect(await page.evaluate(() => window.__DD__.events('tool:swing').length + window.__DD__.events('block:hit').length)).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();

  await mark(page, 'desktop mine');
  // 4. Hold the left button on a vein until it is mined out.
  const mined = await mineWithMouse(page);

  await mark(page, 'desktop bench');
  // 5. At the camp's Workbench, E opens Craft (and frees the mouse); Esc closes it and play goes on.
  const bench = await page.evaluate(() => window.__DD__.game.session.layout.campSite.stations.find((x: { station: string }) => x.station === 'workbench').p as [number, number, number]);
  // Face it from a step away (the camp's Workbench is a prop: its prompt comes with it in focus; `p`
  // is its base centre), from the side where no other prop takes the focus first. (aimAt takes a
  // block and aims at its centre: the bench's middle is passed half a cell back.)
  // Back in the camp from the mining step's trip (its vein can lie out of the camp): the trip ends and
  // its card comes up over play, which holds the focus off (gate 05:28). It is closed first, then the
  // explorer stands on the standable cell's centre (standableNear gives the centre: an extra +0.5
  // stood it on a cell corner) and faces the bench.
  let reported = false;
  let focused = false;
  for (const [dx, dz] of [[1.6, 0], [0, 1.6], [-1.6, 0], [0, -1.6], [1.2, 1.2], [-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2]]) {
    const stand = await page.evaluate(([x, y, z, ox, oz]) => {
      const s = window.__DD__.standableNear(Math.floor(x + ox), Math.floor(y), Math.floor(z + oz));
      return s && Math.hypot(s[0] - x, s[2] - z) < 3 ? s : null;
    }, [...bench, dx, dz] as const);
    if (!stand) continue;
    await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), stand);
    if (await closeTripCard(page, 1.5)) reported = true;
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x - 0.5, y + 0.1, z - 0.5, 0, 0), bench);
    focused = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.ui.hud().interact?.icon)) === 'station', 3);
    if (focused) break;
  }
  expect(focused, 'the Workbench in focus').toBe(true);
  if (await closeTripCard(page, 1)) reported = true;
  await expect(page.locator('.dd-use')).toBeVisible({ timeout: LOADED_CEILING_MS });
  await expect(page.locator('.dd-use')).toContainText(/Workbench/i);
  if (!reported) expect(await page.evaluate(() => document.pointerLockElement === document.getElementById('game'))).toBe(mined.locked);
  await page.keyboard.press('KeyE');
  await waitScreen(page, 'crafting');
  await expect(page.locator('.dd-menu3[data-menu="crafting"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement), { message: 'screens release the mouse' }).toBeNull();
  await page.keyboard.press('Escape');
  await waitScreen(page, 'none');
  await settle(page);
  expect((await state(page)).mode).toBe('playing');

  await mark(page, 'desktop bag');
  // 6. I and Tab open the Bag (and close it again).
  await page.keyboard.press('KeyI');
  await waitScreen(page, 'inventory');
  await page.keyboard.press('Escape');
  await waitScreen(page, 'none');
  await page.keyboard.press('Tab');
  await waitScreen(page, 'inventory');
  await page.keyboard.press('Tab');
  await waitScreen(page, 'none');
  await settle(page);
  expect((await state(page)).mode).toBe('playing');

  await mark(page, 'desktop pause');
  // 7. Esc during play pauses.
  await page.keyboard.press('Escape');
  await waitMode(page, 'paused');
  expect((await state(page)).screen).toBe('pause');
  await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();

  await mark(page, 'desktop capture');
  // 8. With the mouse captured, losing the capture pauses, and a stray Esc right after must not resume.
  if (mined.locked) {
    const capture = async () => {
      await page.getByRole('button', { name: /Resume/i }).click();
      await waitMode(page, 'playing');
      await waitScreen(page, 'none');
      await page.mouse.move(vp.width / 2, vp.height / 2);
      await page.mouse.down();
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => document.pointerLockElement === document.getElementById('game'))).toBe(true);
      await settle(page);
      expect((await state(page)).mode).toBe('playing');
    };
    await capture();
    await page.evaluate(() => document.exitPointerLock());
    await waitMode(page, 'paused');
    expect((await state(page)).screen).toBe('pause');
    await capture();
    await page.evaluate(() => {
      document.exitPointerLock();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape', code: 'Escape', bubbles: true }));
    });
    await waitMode(page, 'paused');
    await settle(page);
    expect((await state(page)).mode, 'the release and its Esc are one press: still paused').toBe('paused');
    expect((await state(page)).screen).toBe('pause');
  }

  expect(errors, errors.join('\n')).toEqual([]);
});

test('desktop mining without pointer lock aims from the cursor', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Element.prototype, 'requestPointerLock', { value: undefined, configurable: true, writable: true });
  });
  const errors = watchErrors(page);
  await startExpedition(page);
  const { locked, press } = await mineWithMouse(page);
  expect(locked).toBe(false);
  const before = await cameraYaw(page);
  await page.mouse.move(press.x + 150, press.y, { steps: 10 });
  await settle(page);
  expect((await cameraYaw(page)) - before, 'a free cursor moving without a button does not look').toBeCloseTo(0, 9);
  expect(errors, errors.join('\n')).toEqual([]);
});
