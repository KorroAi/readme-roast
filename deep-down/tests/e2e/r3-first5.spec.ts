import { expect, test, type Page } from '@playwright/test';
import { untilGame } from './dd';
import { PHONE, aimAtOre, awayFromCamp, boot, centreOf, mark, dismissArrival, holdControl, holdUntil, hud, newExpedition, tapControl, tapEl, uiEvents, waitEvent, waitScreen } from './r3';
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

  await mark(page, 'first5 look');
  // 1. Look: no button (a ghost finger drags across the view); a few drags take it.
  expect(await step(page)).toBe('look');
  await expect(page.locator('.dd-tut-swipe.on')).toHaveCount(1);
  for (let i = 0; i < 6 && (await step(page)) === 'look'; i++) await look(touch, i % 2 ? 90 : -90);
  expect(await waitStep(page, 'move'), 'looking around took the first step').toBe(true);

  await mark(page, 'first5 move');
  // 2. Move: the ring is on the stick; a push walks (and the step goes on).
  expect(await untilGame(page, async () => (await ringed(page)) === 'joystick', 4)).toBe(true);
  const p0 = await page.evaluate(() => ({ x: window.__DD__.game.player.x, z: window.__DD__.game.player.z }));
  // The stick held forward until the step is taken (a few reports of walking, in game time).
  const walked = await holdUntil(page, touch, { x: 70, y: 690 }, { x: 70, y: 640 }, async () => (await step(page)) !== 'move', 20, 7);
  expect(walked && (await waitStep(page, 'mine')), 'walking took the second step').toBe(true);
  const p1 = await page.evaluate(() => ({ x: window.__DD__.game.player.x, z: window.__DD__.game.player.z }));
  expect(Math.hypot(p1.x - p0.x, p1.z - p0.z), 'the stick walked the explorer').toBeGreaterThan(1);

  await mark(page, 'first5 mine');
  // 3. Mine: the ring is on Action; a copper vein under the reticle, Action held until it breaks.
  expect(await untilGame(page, async () => (await ringed(page)) === 'action', 4)).toBe(true);
  const vein = await aimAtOre(page, COPPER);
  expect(vein, 'a copper vein in reach near the camp, the reticle on it').not.toBeNull();
  const block = vein!;
  expect(await untilGame(page, async () => (await hud(page)).reticle === 'mine', 4), 'the reticle reads "mine" on the vein').toBe(true);
  // What the pick is on (the reticle's block), for the record.
  const aim = () =>
    page.evaluate(([x, y, z]) => {
      const g = window.__DD__.game;
      const tg = g.mining.target;
      return { b: window.__DD__.block(x, y, z), target: tg ? [tg.x, tg.y, tg.z, tg.block, tg.inReach] : null, action: g.input.actionHeld, mining: g.input.mining, broken: window.__DD__.ui.events('block:broken').map((e) => e.payload as { x: number; y: number; z: number; block: number }) };
    }, block);
  const before = await aim();
  console.log(`[e2e] vein ${JSON.stringify(block)} before the hold ${JSON.stringify(before)}`);
  // (The event log is not cleared: the tutorial's steps are read from it at the end.)
  const brokenBefore = before.broken.length;
  const action = await centreOf(page, 'action');
  await touch.down(action, 8);
  let said = Date.now();
  // The vein's cell, or the copper cell the pick met first on the way to it, breaks.
  const broke = await untilGame(
    page,
    async () => {
      const a = await aim();
      if (Date.now() - said > 20_000) {
        said = Date.now();
        console.log(`[e2e] holding ${JSON.stringify(a)}`);
      }
      return a.b === AIR || a.broken.slice(brokenBefore).some((e: { block: number }) => e.block === COPPER);
    },
    25,
  );
  await touch.up();
  if (!broke) console.log(`[e2e] not broken ${JSON.stringify(await aim())}`);
  expect(broke, 'the vein broke under a held Action').toBe(true);

  await mark(page, 'first5 pickup');
  // 4. Pick up: the drops fly into the bag (auto-pickup); the step goes on by itself.
  expect(await waitEvent(page, 'item:picked', 15), 'the drops were picked up').toBe(true);
  expect(await waitStep(page, 'craft'), 'picking up took the fourth step').toBe(true);

  await mark(page, 'first5 craft');
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
  // LOOP's focus: Craft opens on the tutorial's recipe (its tab, its card ringed).
  await expect(page.locator('[data-key="tab:building"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.dd-m3-card.focus')).toHaveCount(1);
  const make = page.locator('[data-key="craft:torch:1"]');
  await expect(make).toBeEnabled();
  await tapEl(page, touch, make);
  expect(await waitEvent(page, 'craft:made', 6), 'the torches were made').toBe(true);
  const made = (await uiEvents(page, 'craft:made'))[0].payload;
  expect(made.item).toBe('torch');
  expect(await waitStep(page, 'torch'), 'the first craft took the fifth step').toBe(true);
  await tapEl(page, touch, '.dd-menu3 [data-key="close"]');
  expect(await waitScreen(page, 'none')).toBe(true);

  await mark(page, 'first5 torch');
  // 6. Torch: the ring is on the torch's slot (Place shows once a torch is in hand), then on Place.
  const slot = await page.evaluate(() => window.__DD__.game.loop.hotbarView().slots.findIndex((s: { item: string | null }) => s.item === 'torch'));
  expect(slot, 'the torches went to a hotbar slot').toBeGreaterThanOrEqual(0);
  expect(await untilGame(page, async () => (await ringed(page)) === `hotbar:${slot}`, 4), 'the ring points at the torch slot').toBe(true);
  await tapControl(page, touch, `hotbar:${slot}`);
  expect(await untilGame(page, async () => (await ringed(page)) === 'place', 4), 'then at the Place button').toBe(true);
  // Aim at the floor a step ahead (a face in reach; another way round if that floor is missing), then Place.
  let canPlace = false;
  for (let turn = 0; turn < 4 && !canPlace; turn++) {
    await page.evaluate((k) => {
      const g = window.__DD__.game;
      const p = g.player;
      const yaw = g.cameraRig.yaw + (k * Math.PI) / 2;
      window.__DD__.aimAt(p.x - Math.sin(yaw) * 1.6, p.y - 0.5, p.z - Math.cos(yaw) * 1.6, 0, 0);
    }, turn);
    canPlace = await untilGame(page, async () => (await hud(page)).reticle === 'place', 2);
  }
  expect(canPlace, 'the reticle reads "place"').toBe(true);
  await tapControl(page, touch, 'place');
  expect(await waitEvent(page, 'player:placed', 6), 'a torch was placed').toBe(true);
  const placed = (await uiEvents(page, 'player:placed'))[0].payload;
  expect(placed.item).toBe('torch');
  expect(await page.evaluate(([x, y, z]) => window.__DD__.block(x, y, z), [placed.x, placed.y, placed.z])).toBe(TORCH);
  expect(await waitStep(page, 'fight'), 'the torch took the sixth step').toBe(true);

  await mark(page, 'first5 fight');
  // 7. Fight: one gentle Amber Tick comes (MOBS's first fight: out of the camp's light, QA 21:29); aim
  // at it and strike with Action. The tutorial never blocks: with no creature the step moves on by
  // its own timeout, which the spec reports rather than fails (the strike is what the UI owns).
  const foe = () => page.evaluate(() => window.__DD__.mobs.list().find((m: { family: string; state: string }) => m.family !== 'being' && m.state !== 'dying') ?? null) as Promise<{ x: number; y: number; z: number } | null>;
  let came = await untilGame(page, async () => (await foe()) !== null, 5);
  if (!came) {
    const out = await awayFromCamp(page);
    if (out) await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), out);
    came = await untilGame(page, async () => (await foe()) !== null || (await step(page)) !== 'fight', 6);
    // Still none (MOBS's first fight did not find a spot in time): one Amber Tick a few metres ahead,
    // through the creatures' debug hook, so the strike itself is still tested.
    if (!came) console.log(`[e2e] no creature came for the fight step: a tick is placed ahead (${await page.evaluate(() => window.__DD__.mobs.spawnAhead('amberTick', 3))})`);
  }
  if ((await foe()) !== null) {
    const fought = await untilGame(
      page,
      async () => {
        const t = await foe();
        if (!t) return true;
        await page.evaluate(([x, y, z]) => window.__DD__.aimAt(x, y, z, 0, 0), [t.x, t.y + 0.2, t.z]);
        await holdControl(page, touch, 'action', 700);
        return (await step(page)) !== 'fight';
      },
      30,
    );
    expect(fought, 'the creature was struck').toBe(true);
    expect((await uiEvents(page, 'weapon:swing')).length, 'Action swung at it').toBeGreaterThan(0);
  } else console.log('[e2e] no creature came for the fight step: it moved on by its timeout (MOBS/LOOP, QA 21:29)');
  expect(await waitStep(page, 'sonar', 60), 'the fight step was taken').toBe(true);

  await mark(page, 'first5 sonar');
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

  await mark(page, 'first5 menus');
  // 9-11. The Bag, the Map and the Quests: each opened from its HUD button and closed again.
  for (const [target, screenId, next] of [
    ['bag', 'inventory', 'map'],
    ['map', 'map', 'quest'],
    ['quests', 'quests', null],
  ] as const) {
    expect(await untilGame(page, async () => (await ringed(page)) === target, 4), `the ring is on ${target}`).toBe(true);
    await tapControl(page, touch, target);
    expect(await waitScreen(page, screenId), `${target} opened`).toBe(true);
    await tapEl(page, touch, '.dd-menu3 [data-key="close"]');
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
