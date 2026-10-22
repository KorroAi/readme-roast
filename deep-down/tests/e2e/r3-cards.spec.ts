import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, mark, boot, newExpedition, quiet, screen, tapControl, waitMode, waitScreen, tapEl } from './r3';
import { Touch } from './touch';

// Round 3 (UI): the cards of an expedition with real touches at 390 x 844 (BRIEF §6: the trip summary,
// the black-out screen, the ending, the daily descent):
// - back at camp after a trip, LOOP's trip card (what it brought, its records, what is next);
// - a black-out: the card names what did it, where, what waits in the pack and where the explorer wakes,
//   and the trip card follows the wake-up;
// - the Heart relit ('quest:ending'): after the world's relighting the end card, then free play;
// - the title's Daily Descent: today's seed, goal and modifiers.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

const player = (page: Page) => page.evaluate(() => ({ x: window.__DD__.game.player.x as number, y: window.__DD__.game.player.y as number, z: window.__DD__.game.player.z as number }));

/** Open floor 18-50 m from the camp fire (out of the camp). */
async function awayFromCamp(page: Page): Promise<[number, number, number]> {
  const spot = await page.evaluate(() => {
    const dd = window.__DD__;
    const f = dd.game.session.layout.campSite.fire as [number, number, number];
    for (let d = 18; d < 50; d += 4)
      for (let a = 0; a < 12; a++) {
        const s = dd.standableNear(f[0] + Math.sin(a) * d, f[1], f[2] + Math.cos(a) * d);
        if (s) return s;
      }
    return null;
  });
  expect(spot, 'open floor away from the camp').not.toBeNull();
  return spot!;
}

test('a trip ends at camp with its card; a black-out tells its story, then the trip card follows the wake-up', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);

  // Out of the camp and back: the trip card opens once play has no screen up. (LOOP keeps no card
  // for a trip under 20 s that found nothing: this one stays out a little longer.)
  const away = await awayFromCamp(page);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), away);
  expect(await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 6), 'left the camp').toBe(true);
  await untilGame(page, async () => false, 21);
  const fire = await page.evaluate(() => window.__DD__.game.session.layout.campSite.fire as [number, number, number]);
  const home = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x + 1, y, z + 1), fire);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), home!);
  expect(await waitScreen(page, 'summary', 15), 'the trip card opened back at camp').toBe(true);
  await expect(page.locator('.dd-trip3-card')).toBeVisible();
  await expect(page.locator('.dd-trip3-title')).toHaveText(/Back at camp/i);
  expect(await page.locator('.dd-trip3-ledger li').count(), 'the trip in lines').toBeGreaterThan(2);
  await tapEl(page, touch, page.locator('[data-key="trip:close"]'));
  expect(await waitScreen(page, 'none')).toBe(true);

  await mark(page, 'cards blackout');
  // A black-out out there: the card names what did it and where; the pack waits on the Map.
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), away);
  expect(await untilGame(page, async () => !(await page.evaluate(() => window.__DD__.game.inCamp)), 6)).toBe(true);
  await untilGame(page, async () => false, 21);
  await page.evaluate(() => {
    window.__DD__.give('copperOre', 6);
    window.__DD__.game.health.damage(9999, true);
  });
  await waitMode(page, 'dead');
  await expect(page.locator('.dd-death.dd-bo')).toBeVisible();
  await expect(page.locator('.dd-death-title')).toHaveText(/lantern went out/i);
  await expect(page.locator('.dd-bo-where')).toContainText(/Stratum I/);
  await expect(page.locator('.dd-bo-wake')).toContainText(/wake/i);
  await tapEl(page, touch, page.locator('[data-key="respawn"]'));
  await waitMode(page, 'playing');
  // The black-out's trip card follows the wake-up.
  expect(await waitScreen(page, 'summary', 15), 'the black-out trip card after waking').toBe(true);
  await expect(page.locator('.dd-trip3-card.blackout')).toBeVisible();
  await tapEl(page, touch, page.locator('[data-key="trip:close"]'));
  expect(await waitScreen(page, 'none')).toBe(true);
  await mark(page, 'cards map');
  // The Map marks the pack left behind (in this stratum).
  const cache = await page.evaluate(() => window.__DD__.game.progression.cache);
  if (cache) {
    await tapControl(page, touch, 'map');
    expect(await waitScreen(page, 'map')).toBe(true);
    await expect(page.locator('.dd-m3-pin.k-cache')).toHaveCount(1);
    await tapEl(page, touch, page.locator('.dd-menu3 [data-key="close"]').first());
    expect(await waitScreen(page, 'none')).toBe(true);
  }
  void player;
});

test('the Heart relit: after the relighting, the end card, then free play', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);
  await page.evaluate(() => window.__DD__.game.bus.emit('quest:ending', {}));
  // The card waits for the world's own relighting (about 6.5 s), then rises out of a fade.
  expect(await waitScreen(page, 'ending', 30), 'the end card').toBe(true);
  await expect(page.locator('.dd-ending3 .dd-ending-complete')).toHaveText(/Heart burns again/i);
  expect(await page.locator('.dd-ending3 .dd-ledger li').count()).toBeGreaterThan(3);
  await tapEl(page, touch, page.locator('[data-key="ending-continue"]'));
  expect(await waitScreen(page, 'none'), 'free play').toBe(true);
  expect(await page.evaluate(() => window.__DD__.state().mode)).toBe('playing');
});

test("the title's Daily Descent starts today's seed with its goal and modifiers", async ({ page }) => {
  await boot(page);
  const daily = await page.evaluate(() => window.__DD__.game.loop.dailyToday());
  const btn = page.locator('[data-key="daily"]');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText(daily.goalText);
  const touch = await Touch.attach(page);
  const r = await btn.boundingBox();
  await touch.tap({ x: Math.round(r!.x + r!.width / 2), y: Math.round(r!.y + r!.height / 2) });
  const yes = page.locator('[data-key="yes"]');
  if (await yes.isVisible().catch(() => false)) await tapEl(page, touch, yes);
  await waitMode(page, 'playing');
  expect(await page.evaluate(() => window.__DD__.game.strata.seed)).toBe(daily.seed);
  expect(await page.evaluate(() => window.__DD__.game.loop.dailyMods())).toEqual(daily.mods);
  expect(await screen(page)).toBe('none');
});
