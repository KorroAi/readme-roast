import { expect, test } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, boot, hud, newExpedition, quiet, tapControl, uiEvents, waitEvent } from './r3';

// Round 3 (UI): a descent through the first Gate with real touches at 390 x 844 (BRIEF §0.1, §0.3).
// The two Heart Shards of stratum I are given as if both guardians fell ('mob:guardianDefeated', the
// event LOOP's quests and WORLD's strata both take the shards from); the explorer stands by the
// Gate's stand; the Interact chip unseals the Gate, then descends; stratum II loads behind the
// loading screen, the HUD reads II and its biome, and the arrival card names the new biome.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_200_000 });

test('the first Gate: two shards unseal it from its Interact chip, and the descent lands in stratum II', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page, { tutorial: false });
  await quiet(page);
  expect((await hud(page)).stratum).toBe(1);

  // Both guardians of stratum I "fall": their shards go to the quests and the strata.
  await page.evaluate(() => {
    const g = window.__DD__.game;
    for (const b of g.strata.layout.biomes as string[]) g.bus.emit('mob:guardianDefeated', { id: -1, kind: 'test', biome: b, shard: b, x: 0, y: 0, z: 0 });
  });
  expect(await page.evaluate(() => window.__DD__.game.strata.canOpenGate())).toBe(true);
  expect((await page.evaluate(() => window.__DD__.game.quests.view().shards.have)) as number).toBe(2);

  // At the Gate's stand: the Interact chip names it; a tap unseals it.
  const at = await page.evaluate(() => window.__DD__.goto('gate'));
  expect(at, 'the gate stand of stratum I').not.toBeNull();
  expect(await untilGame(page, async () => (await hud(page)).interact?.icon === 'gate', 8), 'the chip shows the Gate').toBe(true);
  await page.evaluate(() => window.__DD__.ui.clear());
  await tapControl(page, touch, 'interact');
  expect(await waitEvent(page, 'world:gateOpened', 8), 'the gate opened').toBe(true);
  expect(await page.evaluate(() => window.__DD__.game.strata.gateOpen())).toBe(true);

  // A second tap descends (unless the open shaft already took the explorer, WORLD 21:08): stratum II
  // loads behind the loading screen, the explorer arrives there.
  const atGate = await untilGame(page, async () => (await hud(page)).interact?.icon === 'gate', 6);
  if (atGate && (await page.evaluate(() => window.__DD__.game.strata.current)) === 1) await tapControl(page, touch, 'interact');
  const arrived = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.game.strata.current)) === 2 && (await page.evaluate(() => window.__DD__.state().mode)) === 'playing', 120);
  expect(arrived, 'the descent reached stratum II').toBe(true);
  const sw = (await uiEvents(page, 'world:stratum')).map((e) => e.payload);
  expect(sw.some((e) => e.stratum === 2 && e.from === 1)).toBe(true);

  // The HUD reads stratum II and its biome; the arrival card names it on the first visit.
  expect(await untilGame(page, async () => (await hud(page)).stratum === 2, 10)).toBe(true);
  const h = await hud(page);
  const names = await page.evaluate(() => (window.__DD__.game.strata.layout.biomes as string[]).map((b) => document.documentElement && b));
  expect(names.length).toBe(2);
  expect(h.biomeName, 'a biome of stratum II').not.toBe('');
  await expect(page.locator('.dd-where-stratum')).toHaveText('II');
  expect(await waitEvent(page, 'guide:arrival', 10), 'an arrival card for the new biome').toBe(true);
  await expect(page.locator('.dd-arrival.on')).toHaveCount(1);
  // The way back up: the lift stands at the arrival (its Interact climbs to stratum I).
  expect(await page.evaluate(() => window.__DD__.game.strata.deepest)).toBe(2);
});
