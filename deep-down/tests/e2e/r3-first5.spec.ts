import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, boot, centreOf, dismissArrival, holdControl, hud, newExpedition, tapControl, uiEvents, waitEvent, waitScreen } from './r3';
import type { Touch } from './touch';

// Round 3 (UI): the first five minutes of a new expedition on an upright phone, with real touches
// only (BRIEF §0.7): the taught-by-doing tutorial from the first look to the Quests screen, one step
// at a time, each on its own control (the ring's `data-ui-target`), through the first vein mined,
// the first pick-up, the first craft (torches, by hand) and the first torch placed, the first
// fight (MOBS sends one gentle Amber Tick), the sonar, the Bag, the Map and the Quests.

test.use({ viewport: PHONE });
test.describe.configure({ timeout: 1_500_000 });

const COPPER = 7;
const AIR = 0;
const TORCH = 115;

const step = (page: Page) => page.evaluate(() => window.__DD__.game.quests.tutorial()?.id ?? null);

async function waitStep(page: Page, id: string | null, gameSeconds = 20): Promise<boolean> {
  return untilGame(page, async () => (await step(page)) === id, gameSeconds);
}

/** The control the tutorial rings now (null: none, e.g. the look step has no button). */
const ringed = (page: Page) => page.evaluate(() => window.__DD__.ui.ringed());

/** A drag on the view (look), from the right half of the screen. */
async function look(touch: Touch, dx: number): Promise<void> {
  await touch.drag({ x: 260, y: 430 }, { x: 260 + dx, y: 440 }, 120, 4);
}

test('the first five minutes: the tutorial, step by step on its controls, to the first craft and beyond', async ({ page }) => {
  await boot(page);
  const touch = await newExpedition(page);
  await page.evaluate(() => window.__DD__.mobs.harmless(true));
  await dismissArrival(page, touch);

  // 1. Look: no button (a ghost finger drags across the view); a few drags take it.
  expect(await step(page)).toBe('look');
  await expect(page.locator('.dd-tut-swipe.on')).toHaveCount(1);
  for (let i = 0; i < 6 && (await step(page)) === 'look'; i++) await look(touch, i % 2 ? 90 : -90);
  expect(await waitStep(page, 'move'), 'looking around took the first step').toBe(true);

  // 2. Move: the ring is on the stick; a push walks (and the step goes on).
  expect(await untilGame(page, async () => (await ringed(page)) === 'joystick', 4)).toBe(true);
  const p0 = await page.evaluate(() => ({ x: window.__DD__.game.player.x, z: window.__DD__.game.player.z }));
  await touch.drag({ x: 70, y: 690 }, { x: 70, y: 630 }, 2400, 7);
  expect(await waitStep(page, 'mine'), 'walking took the second step').toBe(true);
  const p1 = await page.evaluate(() => ({ x: window.__DD__.game.player.x, z: window.__DD__.game.player.z }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'the stick walked the explorer').toBeGreaterThan(1);

  // 3. Mine: the ring is on Action; a copper vein under the reticle, Action held until it breaks.
  expect(await untilGame(page, async () => (await ringed(page)) === 'action', 4)).toBe(true);
  const py = (await page.evaluate(() => window.__DD__.game.player.y)) as number;
  const prep = await page.evaluate(([id, x, y, z]) => window.__DD__.prepareMining(id, x, y, z, 48), [COPPER, p1.x, py, p1.z]);
  expect(prep, 'a copper vein in reach near the camp').not.toBeNull();
  const block = prep!.block;
  await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x + 0.5, y + 0.5, z + 0.5, 0, 0), block);
  expect(await untilGame(page, async () => (await hud(page)).reticle === 'mine', 4), 'the reticle reads "mine" on the vein').toBe(true);
  const action = await centreOf(page, 'action');
  await touch.down(action, 8);
  const broke = await untilGame(page, async () => (await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), block)) === AIR, 25);
  await touch.up();
  expect(broke, 'the vein broke under a held Action').toBe(true);

  // 4. Pick up: the drops fly into the bag (auto-pickup); the step goes on by itself.
  expect(await waitEvent(page, 'item:picked', 15), 'the drops were picked up').toBe(true);
  expect(await waitStep(page, 'craft'), 'picking up took the fourth step').toBe(true);

  // 5. Craft: the ring is on Craft; the menu opens on a tap; four torches by hand.
  expect(await untilGame(page, async () => (await ringed(page)) === 'craft', 4)).toBe(true);
  await page.evaluate(() => {
    // The tutorial's recipe (Fungal Wood + Coal): a mushroom stem and a coal seam are a walk away;
    // the starter kit does not carry them, so the test hands one of each.
    window.__DD__.give('fungalWood', 1);
    window.__DD__.give('coal', 1);
  });
  await tapControl(page, touch, 'craft');
  expect(await waitScreen(page, 'crafting'), 'Craft opened from its HUD button').toBe(true);
  await page.locator('[data-key="tab:building"]').tap();
  const make = page.locator('[data-key="craft:torch:1"]');
  await expect(make).toBeEnabled();
  await make.tap();
  expect(await waitEvent(page, 'craft:made', 6), 'the torches were made').toBe(true);
  const made = (await uiEvents(page, 'craft:made'))[0].payload;
  expect(made.item).toBe('torch');
  expect(await waitStep(page, 'torch'), 'the first craft took the fifth step').toBe(true);
  await page.locator('.dd-menu3 [data-key="close"], .dd-menu3 .dd-close').first().tap();
  expect(await waitScreen(page, 'none')).toBe(true);

  // 6. Torch: the ring is on the torch's slot (Place shows once a torch is in hand), then on Place.
  const slot = await page.evaluate(() => window.__DD__.game.loop.hotbarView().slots.findIndex((s: { item: string | null }) => s.item === 'torch'));
  expect(slot, 'the torches went to a hotbar slot').toBeGreaterThanOrEqual(0);
  expect(await untilGame(page, async () => (await ringed(page)) === `hotbar:${slot}`, 4), 'the ring points at the torch slot').toBe(true);
  await tapControl(page, touch, `hotbar:${slot}`);
  expect(await untilGame(page, async () => (await ringed(page)) === 'place', 4), 'then at the Place button').toBe(true);
  // Aim at the floor a step ahead (a face in reach), then Place.
  await page.evaluate(() => {
    const g = window.__DD__.game;
    const p = g.player;
    const f = { x: -Math.sin(g.cameraRig.yaw), z: -Math.cos(g.cameraRig.yaw) };
    window.__DD__.aimAt(p.x + f.x * 1.6, p.y - 0.5, p.z + f.z * 1.6, 0, 0);
  });
  expect(await untilGame(page, async () => (await hud(page)).reticle === 'place', 4), 'the reticle reads "place"').toBe(true);
  await tapControl(page, touch, 'place');
  expect(await waitEvent(page, 'player:placed', 6), 'a torch was placed').toBe(true);
  const placed = (await uiEvents(page, 'player:placed'))[0].payload;
  expect(placed.item).toBe('torch');
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), [placed.x, placed.y, placed.z])).toBe(TORCH);
  expect(await waitStep(page, 'fight'), 'the torch took the sixth step').toBe(true);

  // 7. Fight: one gentle Amber Tick comes; aim at it and strike with Action until it falls.
  let tick: { id: number; x: number; y: number; z: number } | null = null;
  expect(
    await untilGame(page, async () => {
      tick = await page.evaluate(() => window.__DD__.mobs.list().find((m: { family: string; state: string }) => m.family !== 'being' && m.state !== 'dying') ?? null);
      return tick !== null;
    }, 20),
    'a creature came for the fight step',
  ).toBe(true);
  const fought = await untilGame(
    page,
    async () => {
      const t = await page.evaluate(() => window.__DD__.mobs.list().find((m: { family: string; state: string }) => m.family !== 'being' && m.state !== 'dying') ?? null);
      if (!t) return true;
      await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), [t.x, t.y + 0.2, t.z]);
      await holdControl(page, touch, 'action', 700);
      return (await step(page)) !== 'fight';
    },
    60,
  );
  expect(fought, 'the creature was struck down').toBe(true);
  expect(await waitStep(page, 'sonar'), 'the fight took the seventh step').toBe(true);
  expect((await uiEvents(page, 'weapon:swing')).length).toBeGreaterThan(0);

  // 8. Sonar: the ring is on Sonar; a tap sends the pulse (VIS draws it, MOBS scans, WORLD reveals).
  expect(await untilGame(page, async () => (await ringed(page)) === 'sonar', 4)).toBe(true);
  await tapControl(page, touch, 'sonar');
  expect(await waitEvent(page, 'player:sonar', 6), 'the pulse went out').toBe(true);
  const ping = (await uiEvents(page, 'player:sonar'))[0].payload;
  expect(ping.radius).toBeGreaterThan(10);
  expect(ping.seconds).toBeGreaterThan(0);
  expect(await waitStep(page, 'bag'), 'the sonar took the eighth step').toBe(true);
  // The pulse cools down (its ring sweeps on the button).
  await expect(page.locator('.dd-pad-sonar.cooling')).toHaveCount(1);

  // 9-11. The Bag, the Map and the Quests: each opened from its HUD button and closed again.
  for (const [target, screenId, next] of [
    ['bag', 'inventory', 'map'],
    ['map', 'map', 'quest'],
    ['quests', 'quests', null],
  ] as const) {
    expect(await untilGame(page, async () => (await ringed(page)) === target, 4), `the ring is on ${target}`).toBe(true);
    await tapControl(page, touch, target);
    expect(await waitScreen(page, screenId), `${target} opened`).toBe(true);
    await page.locator('.dd-menu3 .dd-close, .dd-menu3 [data-key="close"]').first().tap();
    expect(await waitScreen(page, 'none')).toBe(true);
    expect(await waitStep(page, next), `${target} took its step`).toBe(true);
  }

  // The tutorial is over: no bubble, no ring; the tracker shows the main quest.
  await expect(page.locator('.dd-tut.on')).toHaveCount(0);
  const h = await hud(page);
  expect(h.tracker.main?.text ?? '', 'the tracker shows the Heart quest').not.toBe('');
  const steps = (await uiEvents(page, 'tutorial:step')).map((e) => e.payload.id);
  expect(steps).toEqual(expect.arrayContaining(['move', 'mine', 'pickup', 'craft', 'torch', 'fight', 'sonar', 'bag', 'map', 'quest', null]));
});
