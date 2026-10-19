import { expect, test, type Page } from '@playwright/test';
import { LOADED_CEILING_MS, untilGame } from './dd';

// Desktop play through real keyboard and mouse input on the production build: WASD moves,
// Space jumps, right-drag looks, holding the left button mines (with or without pointer lock),
// E uses the Workbench, Esc closes screens, I / Tab open the bag, Esc pauses.

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1280, height: 720 } });


const B = { SLATE: 1, AIR: 0 };

async function state(page: Page) {
  return page.evaluate(() => window.__DD__.state());
}

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: LOADED_CEILING_MS, polling: 200 });
}

async function waitScreen(page: Page, screen: string) {
  await page.waitForFunction((s) => window.__DD__.state().screen === s, screen, { timeout: LOADED_CEILING_MS, polling: 50 });
}

const cameraYaw = (page: Page) => page.evaluate(() => window.__DD__.game.cameraRig.yaw as number);

/**
 * Wait for a few game steps (in any mode), so input dispatched before the call has been
 * consumed. Software GL renders this viewport at a few frames per second, so a fixed delay
 * would not do.
 */
async function settle(page: Page): Promise<void> {
  const t0 = await page.evaluate(() => window.__DD__.game.session.rig.uniforms.uTime.value as number);
  await page.waitForFunction((t) => window.__DD__.game.session.rig.uniforms.uTime.value > t + 0.06 && window.__DD__.game.input.lookDX === 0, t0, { timeout: LOADED_CEILING_MS, polling: 50 });
}

/** Record the player's height and ground contact every animation frame until stopped. */
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

/** Record every block name the HUD target panel displays (while shown). */
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
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  // Desktop: no touch controls layer.
  expect(await page.evaluate(() => !!document.querySelector('.dd-touch-ui'))).toBe(false);
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  await waitScreen(page, 'none');
}

const canvasAt = (page: Page, x: number, y: number) => page.evaluate(([px, py]) => document.elementFromPoint(px, py)?.id ?? '', [x, y]);

/**
 * Turn the camera so block `b` sits off the screen centre, and return a pixel whose ray hits it
 * within reach while the centre ray does not (null if no such view was found). The debug aimAt
 * only converges reliably for the screen centre, so the centre is aimed first and then turned.
 */
async function cursorOnBlock(page: Page, b: [number, number, number]): Promise<{ x: number; y: number } | null> {
  const vp = page.viewportSize()!;
  // The block is next to the explorer, near the line the centre ray takes past the shoulder, so
  // it takes a wide turn to move it off the crosshair.
  const turns: Array<[number, number]> = [];
  for (const yaw of [0.75, -0.75, 0.9, -0.9, 0.6, -0.6, 1.05, -1.05]) for (const pitch of [0.15, 0, 0.3]) turns.push([yaw, pitch]);
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
        // Let the boom, pivot and shoulder settle at the new heading, as aimAt does.
        for (let i = 0; i < 16; i++) rig.update(0.25, p.x, p.y + 1.45 - p.stepOffset, p.z, rig.camera.aspect);
        const key = `${bx},${by},${bz}`;
        const hits = (nx: number, ny: number, fromPointer = true) => {
          const t = g.mining.findTarget({ aimFromPointer: fromPointer, aimX: nx, aimY: ny }, p.x, p.y + 1.25, p.z);
          return !!t && t.key === key && t.inReach;
        };
        if (hits(0, 0, false)) return null; // still under the crosshair: would not test cursor aim
        // Scan the screen for pixels showing the block and take one well inside its outline, so a
        // little camera drift while mining cannot slide the cursor off it.
        const step = 16;
        const on = new Set<string>();
        for (let y = 40; y <= h - 40; y += step)
          for (let x = 40; x <= w - 40; x += step) if (hits((x / w) * 2 - 1, 1 - (y / h) * 2)) on.add(`${x},${y}`);
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
 * Hold the left mouse button on a slate block near camp until it breaks. A left click asks for
 * pointer lock (fine pointer): if it is granted, mining aims from the crosshair at the screen
 * centre; otherwise from the cursor. Both are handled. @returns whether the pointer was locked.
 */
async function mineWithMouse(page: Page): Promise<{ locked: boolean; press: { x: number; y: number } }> {
  const vp = page.viewportSize()!;
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const slate = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(1, x, y, z, 20), lm.workbench);
  expect(slate, 'a reachable slate block near camp').not.toBeNull();
  await settle(page);
  const press = await cursorOnBlock(page, slate!.block);
  expect(press, 'a screen point off the centre whose ray hits the block').not.toBeNull();
  const ndc: [number, number] = [(press!.x / vp.width) * 2 - 1, 1 - (press!.y / vp.height) * 2];
  expect(await canvasAt(page, press!.x, press!.y)).toBe('game');
  await page.evaluate(() => window.__DD__.clearEvents());
  await recordHudTargets(page);
  // Pointer lock is answered asynchronously by a pointerlockchange or pointerlockerror event (or
  // never requested where the API is missing): wait for the answer rather than guessing a delay.
  const canLock = await page.evaluate(() => {
    const w = window as unknown as { __lockAnswer: string };
    w.__lockAnswer = 'pending';
    document.addEventListener('pointerlockchange', () => (w.__lockAnswer = 'change'), { once: true });
    document.addEventListener('pointerlockerror', () => (w.__lockAnswer = 'error'), { once: true });
    // DesktopInput asks for the lock only with a fine pointer and where the API exists.
    return typeof document.getElementById('game')?.requestPointerLock === 'function' && matchMedia('(pointer: fine)').matches;
  });
  await page.mouse.move(press!.x, press!.y);
  await page.mouse.down({ button: 'left' });
  if (canLock) await page.waitForFunction(() => (window as unknown as { __lockAnswer: string }).__lockAnswer !== 'pending', null, { timeout: LOADED_CEILING_MS });
  await settle(page);
  const locked = await page.evaluate(() => document.pointerLockElement === document.getElementById('game'));
  test.info().annotations.push({ type: 'pointer lock', description: locked ? 'granted: crosshair aim' : 'not granted: cursor aim' });
  const aim = await page.evaluate(() => {
    const i = window.__DD__.game.input;
    return { mining: i.mining, fromPointer: i.aimFromPointer, x: i.aimX, y: i.aimY };
  });
  expect(aim.mining).toBe(true);
  if (locked) {
    // Captured: the crosshair is shown and aim is the screen centre, wherever the cursor was.
    expect(aim.fromPointer).toBe(false);
    expect(aim.x).toBeCloseTo(0, 6);
    expect(aim.y).toBeCloseTo(0, 6);
    await expect(page.locator('.dd-crosshair')).toHaveClass(/\bon\b/);
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), slate!.block);
  } else {
    // Free cursor: mining aims through the pressed point; no crosshair.
    expect(aim.fromPointer).toBe(true);
    expect(aim.x).toBeCloseTo(ndc[0], 3);
    expect(aim.y).toBeCloseTo(ndc[1], 3);
    await expect(page.locator('.dd-crosshair')).not.toHaveClass(/\bon\b/);
  }
  // Hold for up to 30 s of game time (SwiftShader under load runs at a frame or two per second).
  await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), slate!.block)) === B.AIR, 30, LOADED_CEILING_MS, 200);
  await page.mouse.up({ button: 'left' });
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), slate!.block)).toBe(B.AIR);
  const onTarget = await page.evaluate(([x, y, z]) => {
    const at = (e: { payload: any }) => e.payload.x === x && e.payload.y === y && e.payload.z === z;
    return { hits: window.__DD__.events('block:hit').filter(at).length, broken: window.__DD__.events('block:broken').some(at) };
  }, slate!.block);
  expect(onTarget.hits, 'pickaxe hits on the target').toBeGreaterThan(1);
  expect(onTarget.broken).toBe(true);
  if (!locked) {
    // The centre ray does not hit the target first, so if mining ignored the cursor it would
    // strike other rock (or nothing). Every strike must have landed on the block under the cursor.
    const elsewhere = await page.evaluate(([x, y, z]) => {
      const off = (e: { payload: any }) => e.payload.x !== x || e.payload.y !== y || e.payload.z !== z;
      return [...window.__DD__.events('block:hit'), ...window.__DD__.events('block:broken')].filter(off).map((e) => `${e.type} ${e.payload.x},${e.payload.y},${e.payload.z}`);
    }, slate!.block);
    expect(elsewhere, 'strikes away from the block under the cursor').toEqual([]);
  }
  // While the button was held, the HUD named the block under the aim.
  expect(await hudTargets(page)).toContain('Slate');
  expect(await page.evaluate(() => window.__DD__.game.input.mining)).toBe(false);
  return { locked, press: press! };
}


// SwiftShader under load renders a frame or two per second: give each test a generous budget.
test.describe.configure({ timeout: 900_000 });

test('desktop controls: keyboard and mouse drive movement, look, mining, screens and pause', async ({ page }) => {
  const errors = watchErrors(page);
  await startExpedition(page);
  const vp = page.viewportSize()!;

  // 1. Hold W: the explorer walks forward. Software GL (SwiftShader) renders this viewport at a
  //    few frames per second and a simulation step is capped at 50 ms, so game time runs slower
  //    than the wall clock here: hold for 1.2 s and until 1.2 s of play has passed.
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
  expect(await page.evaluate(() => window.__DD__.game.input.moveY)).toBe(0); // released

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
  const apex = Math.max(...jump.map((p) => p.y)) - groundY;
  expect(jump.some((p) => !p.grounded), 'airborne after Space').toBe(true);
  expect(apex, 'jump height in metres').toBeGreaterThan(0.5);

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
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull(); // the right button never captures

  // 4. Hold the left button on a block until it is mined out.
  const mined = await mineWithMouse(page);

  // 5. At the Workbench, E opens crafting; Esc closes it and play continues.
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const bench = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z + 1.6), lm.workbench);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), bench!);
  await expect(page.locator('.dd-use-prompt.on')).toContainText(/Workbench/i, { timeout: LOADED_CEILING_MS });
  // A lock granted by the mining click is still held here, so the release below is the screen's doing.
  expect(await page.evaluate(() => document.pointerLockElement === document.getElementById('game'))).toBe(mined.locked);
  await page.keyboard.press('KeyE');
  await waitScreen(page, 'crafting');
  await expect(page.getByRole('dialog', { name: 'Workbench' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement), { message: 'screens release the mouse' }).toBeNull();
  await page.keyboard.press('Escape');
  await waitScreen(page, 'none');
  await settle(page);
  expect((await state(page)).mode).toBe('playing'); // Esc on a screen closes it, it does not pause

  // 6. I and Tab open the bag (and close it again).
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

  // 7. Esc during play pauses.
  await page.keyboard.press('Escape');
  await waitMode(page, 'paused');
  expect((await state(page)).screen).toBe('pause');
  await expect(page.getByRole('button', { name: /Resume/i })).toBeVisible();

  // 8. With the mouse captured, the browser takes Esc to release the capture instead of sending it
  //    to the page: losing the capture unexpectedly must pause too, and a stray Esc right after
  //    must not resume.
  if (mined.locked) {
    const vp = page.viewportSize()!;
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
    // (a) The browser releases the capture and keeps the key: the release alone pauses.
    await capture();
    await page.evaluate(() => document.exitPointerLock());
    await waitMode(page, 'paused');
    expect((await state(page)).screen).toBe('pause');
    // (b) The browser releases the capture and also delivers the Esc: still one press.
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
  // A browser without the Pointer Lock API (the game requests it optionally): the mouse stays
  // free, so the left button mines where the cursor is and the camera turns only on right-drag.
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
