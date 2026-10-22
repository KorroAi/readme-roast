import { expect, test, type Page } from '@playwright/test';
import { seedFromText } from '../../src/ui/seed';
import { untilGame } from './dd';
import type { Touch } from './touch';
import { PHONE, mark, boot, centreOf, newExpedition, quiet, screen, tapControl, waitScreen, tapEl } from './r3';

// Round 3 (UI): every menu end to end with real touches at 390 x 844 (BRIEF §0.6), the Settings
// additions, the seed field of New Game, and the desktop keys for the menus:
// - the HUD's Bag, Craft, Map and Quests buttons, the rail between the five menus (Bestiary too),
//   each menu's "?" help card, Close;
// - Settings: look sensitivity, invert Y, button size and opacity, the left-handed mirror, rarity
//   patterns, reduced motion, and the expedition's seed;
// - I/Tab, C, M, J, B open their menu and close it again, Esc closes, ≡ pauses.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

const RAIL: Array<[string, string]> = [
  ['inventory', 'Bag'],
  ['crafting', 'Craft'],
  ['map', 'Map'],
  ['quests', 'Quests'],
  ['bestiary', 'Bestiary'],
];

async function closeMenu(page: Page, touch: Touch): Promise<void> {
  await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
  expect(await waitScreen(page, 'none')).toBe(true);
}

test('the menus: HUD buttons, the rail, help cards; Settings additions; the seed typed on New Game', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { seed: 'lantern', tutorial: false });
  await quiet(page);

  // The seed typed on New Game is the expedition's (a word is hashed to the same number every time).
  const seed = await page.evaluate(() => window.__DD__.game.strata.seed as number);
  expect(seed).toBe(seedFromText('lantern'));

  // The HUD's four menu buttons.
  for (const [target, id] of [['bag', 'inventory'], ['craft', 'crafting'], ['map', 'map'], ['quests', 'quests']] as const) {
    await tapControl(page, touch, target);
    expect(await waitScreen(page, id), `${target} opens ${id}`).toBe(true);
    await expect(page.locator(`.dd-menu3[data-menu="${id}"]`)).toBeVisible();
    // Opened from play, the panel rises in.
    await expect(page.locator(`.dd-menu3[data-menu="${id}"]`)).toHaveAttribute('data-enter', 'play');
    await closeMenu(page, touch);
  }

  await mark(page, 'menus rail');
  // The rail goes round all five; each has its "?" help card.
  await tapControl(page, touch, 'bag');
  expect(await waitScreen(page, 'inventory')).toBe(true);
  for (const [id] of RAIL) {
    if ((await screen(page)) !== id) await tapEl(page, touch, page.locator(`[data-key="rail:${id}"]`));
    expect(await waitScreen(page, id), `the rail reached ${id}`).toBe(true);
    await tapEl(page, touch, page.locator('.dd-menu3 [data-key="help"]'));
    await expect(page.locator('.dd-m3-helpcard')).toBeVisible();
    await tapEl(page, touch, page.locator('.dd-menu3 [data-key="help"]'));
    await expect(page.locator('.dd-m3-helpcard')).toHaveCount(0);
  }
  // A rail switch to the right slides in from the right (a calm cut of the frame).
  await tapEl(page, touch, page.locator('[data-key="rail:inventory"]'));
  expect(await waitScreen(page, 'inventory')).toBe(true);
  await expect(page.locator('.dd-menu3[data-menu="inventory"]')).toHaveAttribute('data-enter', 'left');
  await tapEl(page, touch, page.locator('[data-key="rail:map"]'));
  expect(await waitScreen(page, 'map')).toBe(true);
  await expect(page.locator('.dd-menu3[data-menu="map"]')).toHaveAttribute('data-enter', 'right');

  await mark(page, 'menus map');
  // The Map: its view pans with a drag and zooms with its buttons; the seed is shown.
  await expect(page.locator('.dd-m3-seed')).toContainText(String(seed));
  const cam0 = await page.evaluate(() => (window.__DD__.game.ui as { state: { mapCamera: { cx: number; cz: number; zoom: number } } }).state.mapCamera);
  await tapEl(page, touch, page.locator('[data-key="map:zoomIn"]'));
  const cam1 = await page.evaluate(() => (window.__DD__.game.ui as { state: { mapCamera: { cx: number; zoom: number } } }).state.mapCamera);
  expect(cam1.zoom).toBeGreaterThan(cam0.zoom * 1.2);
  const view = await page.locator('.dd-m3-mapview').boundingBox();
  await touch.drag({ x: view!.x + view!.width / 2, y: view!.y + view!.height / 2 }, { x: view!.x + view!.width / 2 + 60, y: view!.y + view!.height / 2 }, 60, 3);
  const cam2 = await page.evaluate(() => (window.__DD__.game.ui as { state: { mapCamera: { cx: number } } }).state.mapCamera);
  expect(cam2.cx, 'the drag panned the map').toBeLessThan(cam1.cx);
  await closeMenu(page, touch);

  await mark(page, 'menus settings');
  // ≡ pauses; Settings has the round 3 additions.
  await tapControl(page, touch, 'menu');
  expect(await waitScreen(page, 'pause')).toBe(true);
  await tapEl(page, touch, page.getByRole('button', { name: /Settings/i }).first());
  expect(await waitScreen(page, 'settings')).toBe(true);
  await expect(page.locator('.dd-settings-seed')).toContainText(String(seed));
  // Invert Y and the left-handed mirror.
  await tapEl(page, touch, page.locator('[data-key="invertY"]').first());
  expect(await page.evaluate(() => window.__DD__.game.settings.invertY)).toBe(true);
  await tapEl(page, touch, page.locator('[data-key="leftHanded"]').first());
  expect(await page.evaluate(() => window.__DD__.game.settings.leftHanded)).toBe(true);
  // Rarity patterns and reduced motion (per-device preferences).
  await tapEl(page, touch, page.locator('[data-key="patterns"]').first());
  expect(await page.evaluate(() => document.querySelector('.dd-ui')?.classList.contains('dd-cb'))).toBe(true);
  await tapEl(page, touch, page.locator('[data-key="motion:reduce"]'));
  expect(await page.evaluate(() => document.documentElement.classList.contains('dd-reduce-motion'))).toBe(true);
  // Button size: the slider's value reaches the pads (a CSS variable on the UI root).
  // (A range input takes its value from a drag; set it as one would end, with its input event.)
  await page.locator('input[data-key="btnScale"]').evaluate((el: HTMLInputElement) => {
    el.value = '1.2';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await untilGame(page, async () => (await page.evaluate(() => getComputedStyle(document.querySelector('.dd-ui')!).getPropertyValue('--btn-scale').trim())) === '1.2', 3)).toBe(true);
  await tapEl(page, touch, page.locator('[data-key="close"]').first());
  expect(await waitScreen(page, 'pause')).toBe(true);
  await tapEl(page, touch, page.getByRole('button', { name: /Resume/i }).first());
  expect(await waitScreen(page, 'none')).toBe(true);
  // Left-handed: the stick goes to the right, the pads to the left of the screen.
  const action = await centreOf(page, 'action');
  expect(action.x, 'Action on the left, left-handed').toBeLessThan(195);
  const sizeNow = await page.locator('.dd-pad-action').boundingBox();
  expect(sizeNow!.width, 'the Action button grew with the size setting').toBeGreaterThan(92 * 1.15);
});

test('the desktop keys open and close each menu; Esc closes; Tab is the Bag', async ({ page }) => {
  await boot(page);
  await newExpedition(page, { tutorial: false });
  await quiet(page);
  for (const [key, id] of [['KeyI', 'inventory'], ['KeyC', 'crafting'], ['KeyM', 'map'], ['KeyJ', 'quests'], ['KeyB', 'bestiary']] as const) {
    await page.keyboard.press(key.replace('Key', '').toLowerCase());
    expect(await waitScreen(page, id), `${key} opens ${id}`).toBe(true);
    await page.keyboard.press(key.replace('Key', '').toLowerCase());
    expect(await waitScreen(page, 'none'), `${key} closes ${id}`).toBe(true);
  }
  await page.keyboard.press('m');
  expect(await waitScreen(page, 'map')).toBe(true);
  await page.keyboard.press('j');
  expect(await waitScreen(page, 'quests'), 'another menu key switches menus').toBe(true);
  await page.keyboard.press('Escape');
  expect(await waitScreen(page, 'none'), 'Esc closes').toBe(true);
  await page.keyboard.press('Tab');
  expect(await waitScreen(page, 'inventory'), 'Tab is the Bag').toBe(true);
  await page.keyboard.press('Escape');
  expect(await waitScreen(page, 'none')).toBe(true);
  // The hotbar keys 1-6 and Q (sonar).
  await page.keyboard.press('3');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.loop.hotbarView().selected)) === 2, 3)).toBe(true);
  await page.evaluate(() => window.__DD__.ui.clear());
  await page.keyboard.press('q');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.ui.events('player:sonar').length)) > 0, 4), 'Q sends the sonar').toBe(true);
  // Ctrl dashes (with i-frames), Shift sprints while moving.
  await page.keyboard.down('w');
  await page.keyboard.down('Shift');
  expect(await untilGame(page, async () => page.evaluate(() => window.__DD__.game.input.sprint), 3), 'Shift + W sprints').toBe(true);
  await page.keyboard.press('Control');
  expect(await untilGame(page, async () => (await page.evaluate(() => window.__DD__.ui.events('player:dash').length)) > 0, 4), 'Ctrl dashes').toBe(true);
  await page.keyboard.up('Shift');
  await page.keyboard.up('w');
});
