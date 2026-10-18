import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import './dd';

// The brief's definition of success, step by step, on a phone-sized landscape viewport:
// start -> underground -> move with touch -> mine & collect -> discover -> return to camp ->
// craft -> feel the difference -> save and resume.


const B = { SLATE: 1, COPPER_ORE: 7, HARDENED_SLATE: 10, AIR: 0 };

async function state(page: Page) {
  return page.evaluate(() => window.__DD__.state());
}

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: 120_000, polling: 200 });
}

/** The save the game would resume from (active slot of the two-slot store). */
async function persisted(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('deepdown.save.' + localStorage.getItem('deepdown.save.active'));
    return raw ? JSON.parse(JSON.parse(raw).json) : null;
  });
}

/**
 * Reason of the first 'game:saved' recorded after the first `type` event whose payload matches
 * `match` ('none' if no save followed it, null if the event never happened).
 */
async function saveReasonAfter(page: Page, type: string, match: Record<string, unknown> = {}) {
  return page.evaluate(
    ([type, match]) => {
      const ev = window.__DD__.events();
      const i = ev.findIndex((e) => e.type === type && Object.entries(match).every(([k, v]) => e.payload?.[k] === v));
      if (i < 0) return null;
      return ev.slice(i + 1).find((e) => e.type === 'game:saved')?.payload.reason ?? 'none';
    },
    [type, match] as const,
  );
}

/** Record every name the HUD target panel shows while it is on (read with hudTargets). */
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

/** Mine a block with one press-and-hold at the screen center until it breaks; returns hits used. */
async function mineWithTouch(page: Page, touch: Touch, block: [number, number, number], maxMs = 20_000): Promise<number> {
  const vp = page.viewportSize()!;
  await page.evaluate(() => window.__DD__.clearEvents());
  await page.waitForTimeout(250);
  // The look/mine zone is the right half of the screen: press just right of the center.
  const at = { x: Math.ceil(vp.width / 2) + 6, y: Math.round(vp.height * 0.5) };
  await page.evaluate(([x, y, z, ax, ay]) => window.__DD__.aimAt(x, y, z, ax, ay), [...block, (at.x / vp.width) * 2 - 1, 1 - (at.y / vp.height) * 2]);
  await touch.down(at);
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await page.waitForTimeout(250);
    // Rock in front of the target is mined through first, as a player would.
    if ((await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === B.AIR) break;
  }
  await touch.up();
  // Hits on the target only (rock mined through on the way is not the pickaxe comparison).
  return page.evaluate(([x, y, z]) => window.__DD__.events('block:hit').filter((e) => e.payload.x === x && e.payload.y === y && e.payload.z === z).length, block);
}

test('DEEP DOWN vertical slice: the full success path on touch', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });

  // 1. Start the game.
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await expect(page.getByText('DEEP DOWN', { exact: false }).first()).toBeAttached();
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  const touch = await Touch.attach(page);
  let s = await state(page);
  expect(s.atCamp).toBe(true);

  // 2. We are underground: the HUD shows depth in meters, health, lantern fuel, the backpack,
  //    the camp compass and the current objective.
  await expect(page.getByText(/-\d+ m/).first()).toBeVisible();
  const hud = page.locator('.dd-hud');
  await expect(hud).toHaveClass(/\bon\b/);
  await expect(hud.locator('.dd-hearts')).toBeVisible();
  await expect(hud.locator('.dd-hearts .dd-heart')).toHaveCount(5);
  await expect(hud.locator('.dd-hearts .dd-heart.f2')).toHaveCount(5); // full health: five full hearts
  await expect(hud.locator('.dd-hearts')).toHaveAttribute('aria-label', /^Health (\d+) of \1$/);
  const lantern = hud.locator('.dd-lantern[role="meter"]');
  await expect(lantern.locator('.dd-bar-fill')).toBeVisible();
  await expect(lantern).toHaveAttribute('aria-label', /^Lantern fuel \d+%$/);
  expect(Number(await lantern.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(90);
  // The meter shows the lantern's real fuel (read in the same task, so no frame passes between).
  const fuel = await page.evaluate(() => ({ shown: Number(document.querySelector('.dd-hud .dd-lantern')?.getAttribute('aria-valuenow')), actual: window.__DD__.state().lantern * 100 }));
  expect(Math.abs(fuel.shown - fuel.actual), `lantern meter ${fuel.shown}% vs fuel ${fuel.actual}%`).toBeLessThanOrEqual(1);
  await expect(hud.locator('.dd-pill')).toHaveText('0/6');
  await expect(hud.locator('.dd-pill')).toHaveAttribute('aria-label', 'Backpack 0 of 6 slots');
  await expect(hud.locator('.dd-compass')).toHaveText('Camp');
  await expect(hud.locator('.dd-compass')).toHaveClass(/\bat-camp\b/);
  expect(s.objective.text.length).toBeGreaterThan(0);
  const firstObjective = s.objective.text as string;
  await expect(hud.locator('.dd-objective')).toHaveText(firstObjective);
  await expect(hud.locator('.dd-objective')).toHaveClass(/\bon\b/);

  // 3. Move naturally with the floating joystick (left half of the screen).
  const before = s.player;
  await touch.drag({ x: 140, y: 300 }, { x: 140, y: 230 }, 1300, 1);
  s = await state(page);
  const moved = Math.hypot(s.player.x - before.x, s.player.z - before.z);
  expect(moved).toBeGreaterThan(1.5);

  // 4. Mine blocks and collect resources (copper in the tunnel), with press-and-hold.
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const copper = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(7, x, y, z, 26), lm.firstCrystals);
  expect(copper, 'a reachable copper vein near the tunnel').not.toBeNull();
  await recordHudTargets(page);
  await mineWithTouch(page, touch, copper!.block);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), copper!.block)).toBe(B.AIR);
  // While the block was being mined, the HUD target panel named it.
  expect(await hudTargets(page)).toContain('Copper Vein');
  await page.waitForFunction(() => window.__DD__.events('item:picked').some((e) => e.payload.item === 'copperOre'), null, { timeout: 15_000 });
  s = await state(page);
  const backpackCopper = s.backpack.filter((x: any) => x && x.item === 'copperOre').reduce((a: number, x: any) => a + x.count, 0);
  expect(backpackCopper).toBeGreaterThan(0);
  // The HUD backpack pill counts the used slots.
  const used = s.backpack.filter(Boolean).length;
  expect(used).toBeGreaterThan(0);
  await expect(hud.locator('.dd-pill')).toHaveText(`${used}/6`);
  await expect(hud.locator('.dd-pill')).toHaveAttribute('aria-label', `Backpack ${used} of 6 slots`);

  // 5. Discover something unexpected: walk out onto the ledge above the Lantern Hollow.
  const ledge = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.ledge);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), ledge!);
  await page.waitForFunction(() => window.__DD__.events('discovery').some((e) => e.payload.id === 'hollow'), null, { timeout: 15_000 });
  await expect(page.getByText(/Lantern Hollow/i).first()).toBeVisible();
  // A discovery is saved at once.
  expect(await saveReasonAfter(page, 'discovery', { id: 'hollow' })).toBe('discovery');
  expect((await persisted(page)).discoveries).toContain('hollow');
  // Away from camp the compass gives the distance back to the campfire.
  await expect(hud.locator('.dd-compass')).not.toHaveClass(/\bat-camp\b/);
  const away = await page.evaluate((c) => {
    const p = window.__DD__.state().player;
    return { text: document.querySelector('.dd-hud .dd-compass')?.textContent ?? '', dist: Math.hypot(c[0] - p.x, c[1] - p.y, c[2] - p.z) };
  }, lm.campfire);
  expect(away.text).toMatch(/^Camp \d+ m$/);
  expect(Math.abs(Number(away.text.match(/\d+/)![0]) - away.dist), `compass "${away.text}" vs ${away.dist.toFixed(1)} m`).toBeLessThanOrEqual(1);

  // 6. Return to camp: the backpack is banked.
  const camp = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.campfire.map((v, i) => (i === 0 ? v - 2 : v)) as [number, number, number]);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), camp!);
  await page.waitForFunction(() => window.__DD__.state().atCamp && window.__DD__.events('items:banked').length > 0, null, { timeout: 15_000 });
  s = await state(page);
  expect(s.storage.copperOre ?? 0).toBeGreaterThan(0);
  // Banking at camp is saved at once: the saved game has the copper in storage, not in the pack.
  expect(await saveReasonAfter(page, 'items:banked')).toBe('camp');
  const campSave = await persisted(page);
  expect(campSave.storage.copperOre ?? 0).toBeGreaterThan(0);
  expect(campSave.backpack.filter(Boolean).length).toBe(0);
  await expect(hud.locator('.dd-compass')).toHaveText('Camp');
  await expect(hud.locator('.dd-compass')).toHaveClass(/\bat-camp\b/);
  await expect(hud.locator('.dd-pill')).toHaveText('0/6');

  // Gather the rest of the recipe quickly (tested mining already proved the loop works).
  await page.evaluate(() => {
    window.__DD__.give('copperOre', 8);
    window.__DD__.give('stone', 12);
  });

  // Baseline: hits needed to break slate with the rusty pickaxe.
  const slateNearCamp = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(1, x, y, z, 20), lm.workbench);
  expect(slateNearCamp).not.toBeNull();
  const hitsRusty = await mineWithTouch(page, touch, slateNearCamp!.block);

  // 7. Craft an upgrade at the Workbench: walk up, tap Use, tap Craft.
  const bench = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z + 1.6), lm.workbench);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), bench!);
  await page.getByRole('button', { name: /Workbench/i }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: /Workbench/i }).first().tap();
  await page.waitForFunction(() => window.__DD__.state().screen === 'crafting', null, { timeout: 10_000 });
  await page.getByRole('button', { name: /^Craft/ }).first().tap();
  await page.waitForFunction(() => window.__DD__.state().equipment.pickaxe === 2, null, { timeout: 10_000 });
  // Crafting is saved at once.
  expect(await saveReasonAfter(page, 'craft:done', { recipe: 'copperPickaxe' })).toBe('craft');
  expect((await persisted(page)).equipment.pickaxe).toBe(2);
  await page.getByRole('button', { name: /Close/i }).first().tap();
  await page.waitForFunction(() => window.__DD__.state().screen === 'none', null, { timeout: 10_000 });
  // The objective has moved on since the start, and the HUD line follows it.
  const objectiveNow = (await state(page)).objective.text as string;
  expect(objectiveNow).not.toBe(firstObjective);
  await expect(hud.locator('.dd-objective')).toHaveText(objectiveNow);

  // 8. Feel the difference: fewer hits on slate, and Hardened Slate now breaks.
  const slate2 = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(1, x, y, z, 20), lm.workbench);
  const hitsCopper = await mineWithTouch(page, touch, slate2!.block);
  expect(hitsCopper).toBeLessThan(hitsRusty);
  const seal = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(10, x, y, z, 6), lm.seal);
  expect(seal).not.toBeNull();
  await mineWithTouch(page, touch, seal!.block, 12000);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), seal!.block)).toBe(B.AIR);

  // 9. Save and resume: reload, Continue, everything is still there.
  s = await state(page);
  expect(await page.evaluate(() => window.__DD__.save())).toBe(true);
  const savedPos = s.player;
  await page.reload();
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /Continue/i }).click();
  await waitMode(page, 'playing');
  const r = await state(page);
  expect(r.equipment.pickaxe).toBe(2);
  expect(Math.hypot(r.player.x - savedPos.x, r.player.z - savedPos.z)).toBeLessThan(1);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), seal!.block)).toBe(B.AIR);
  expect(r.journal.discoveries).toContain('hollow');

  expect(errors, errors.join('\n')).toEqual([]);
});
