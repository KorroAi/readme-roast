import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';

// The brief's definition of success, step by step, on a phone-sized landscape viewport:
// start -> underground -> move with touch -> mine & collect -> discover -> return to camp ->
// craft -> feel the difference -> save and resume.

type DD = {
  ready: boolean;
  state(): any;
  report(): any;
  events(type?: string): Array<{ type: string; payload: any }>;
  clearEvents(): void;
  prepareMining(id: number, x: number, y: number, z: number, r?: number): { block: [number, number, number]; stand: [number, number, number] } | null;
  aimAt(x: number, y: number, z: number): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  landmarks(): Record<string, [number, number, number]>;
  standableNear(x: number, y: number, z: number): [number, number, number] | null;
  block(x: number, y: number, z: number): number;
  give(item: string, n: number): number;
  save(): boolean;
};
declare global {
  interface Window {
    __DD__: DD;
  }
}

const B = { SLATE: 1, COPPER_ORE: 7, HARDENED_SLATE: 10, AIR: 0 };

async function state(page: Page) {
  return page.evaluate(() => window.__DD__.state());
}

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: 120_000, polling: 200 });
}

/** Mine a block with press-and-hold at the screen center until it breaks; returns hits used. */
async function mineWithTouch(page: Page, touch: Touch, block: [number, number, number], maxMs = 9000): Promise<number> {
  const vp = page.viewportSize()!;
  await page.evaluate(() => window.__DD__.clearEvents());
  await page.waitForTimeout(250);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z), block);
  await page.waitForTimeout(150);
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z), block);
  const start = Date.now();
  // Hold in segments so we can stop as soon as it breaks.
  while (Date.now() - start < maxMs) {
    await touch.hold({ x: vp.width / 2, y: vp.height / 2 }, 700);
    const broken = await page.evaluate(() => window.__DD__.events('block:broken').length);
    if (broken > 0) break;
    await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z), block);
  }
  return page.evaluate(() => window.__DD__.events('block:hit').length);
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

  // 2. We are underground: the HUD shows depth in meters.
  await expect(page.getByText(/-\d+ m/).first()).toBeVisible();

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
  await mineWithTouch(page, touch, copper!.block);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), copper!.block)).toBe(B.AIR);
  await page.waitForFunction(() => window.__DD__.events('item:picked').length > 0, null, { timeout: 15_000 });
  s = await state(page);
  const backpackCopper = s.backpack.filter((x: any) => x && x.item === 'copperOre').reduce((a: number, x: any) => a + x.count, 0);
  expect(backpackCopper).toBeGreaterThan(0);

  // 5. Discover something unexpected: walk out onto the ledge above the Lantern Hollow.
  const ledge = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.ledge);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), ledge!);
  await page.waitForFunction(() => window.__DD__.events('discovery').some((e) => e.payload.id === 'hollow'), null, { timeout: 15_000 });
  await expect(page.getByText(/Lantern Hollow/i).first()).toBeVisible();

  // 6. Return to camp: the backpack is banked.
  const camp = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.campfire.map((v, i) => (i === 0 ? v - 2 : v)) as [number, number, number]);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), camp!);
  await page.waitForFunction(() => window.__DD__.state().atCamp && window.__DD__.events('items:banked').length > 0, null, { timeout: 15_000 });
  s = await state(page);
  expect(s.storage.copperOre ?? 0).toBeGreaterThan(0);

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
  await page.getByRole('button', { name: /Close/i }).first().tap();
  await page.waitForFunction(() => window.__DD__.state().screen === 'none', null, { timeout: 10_000 });

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
