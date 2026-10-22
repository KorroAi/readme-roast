// Round 3 (UI): shared steps for the new game's specs, upright at 390 x 844 with real touches
// (CDP touch events through ./touch). They boot the strata world (the default since WORLD's
// switch), start an expedition from the title (optionally with a seed typed in its field), find the
// controls by their `data-ui-target` (ui/hud/actions UiTargetId) and wait on game time, never on
// wall time (SwiftShader may draw a frame a second under load).

import { expect, type Locator, type Page } from '@playwright/test';
import { LOADED_CEILING_MS, untilGame } from './dd';
import { Touch } from './touch';
import './dd';

/**
 * A real touch tap on an element's centre, sent as one gesture (start and end together, see
 * ./touch): Playwright's own tap() awaits each half, and under load the page then reads a
 * long-press (no click). Waits until the element is shown and has stopped moving (a menu rises in).
 */
export async function tapEl(page: Page, touch: Touch, target: string | Locator): Promise<void> {
  const loc = typeof target === 'string' ? page.locator(target).first() : target;
  await loc.waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await loc.scrollIntoViewIfNeeded({ timeout: LOADED_CEILING_MS });
  let b = await loc.boundingBox();
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(120);
    const n = await loc.boundingBox();
    const still = !!b && !!n && Math.abs(n.x - b.x) < 0.5 && Math.abs(n.y - b.y) < 0.5 && Math.abs(n.width - b.width) < 0.5;
    b = n;
    if (still) break;
  }
  expect(b, `${String(target)} has a box`).not.toBeNull();
  await touch.tap({ x: Math.round(b!.x + b!.width / 2), y: Math.round(b!.y + b!.height / 2) });
}

/** Press on a point (sliding to `to`) and hold until `done` holds (game time), then lift. */
export async function holdUntil(page: Page, touch: Touch, from: { x: number; y: number }, to: { x: number; y: number }, done: () => Promise<boolean>, gameSeconds: number, id = 7): Promise<boolean> {
  await touch.press(from, to, id);
  const ok = await untilGame(page, done, gameSeconds);
  await touch.up();
  return ok;
}

/** Close the strata's trip card if one opens (back at camp after a trip): @returns whether one did. */
export async function closeTripCard(page: Page, touch: Touch, gameSeconds = 4): Promise<boolean> {
  const opened = await untilGame(page, async () => (await page.evaluate(() => window.__DD__.state().screen)) === 'summary', gameSeconds);
  if (!opened) return false;
  await tapEl(page, touch, '[data-key="trip:close"], [data-key="summary-close"]');
  expect(await waitScreen(page, 'none'), 'the trip card closed').toBe(true);
  return true;
}

export const PHONE = { width: 390, height: 844 };

export async function waitMode(page: Page, mode: string, timeout = LOADED_CEILING_MS): Promise<void> {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout, polling: 200 });
}

/** Load the game and wait for the title. */
export async function boot(page: Page, query = ''): Promise<void> {
  await page.goto(`/index.html${query ? `?${query}` : ''}`);
  await waitMode(page, 'menu');
}

/**
 * Start a new expedition from the title with a real tap on "New Expedition" (typing `seed` in the
 * optional seed field first). `tutorial: false` skips the tutorial once in play.
 */
export async function newExpedition(page: Page, opts: { seed?: string; tutorial?: boolean } = {}): Promise<Touch> {
  const touch = await Touch.attach(page);
  if (opts.seed !== undefined) {
    await tapEl(page, touch, '.dd-seed-summary');
    await page.locator('.dd-seed-input').fill(opts.seed);
  }
  await tapEl(page, touch, page.getByRole('button', { name: /New Expedition/i }).first());
  // A save already there asks first.
  const yes = page.locator('[data-key="yes"]');
  if (await yes.isVisible().catch(() => false)) await tapEl(page, touch, yes);
  await waitMode(page, 'playing');
  if (opts.tutorial === false) await page.evaluate(() => window.__DD__.game.quests.skipTutorial());
  return touch;
}

/** The centre of a control on screen (CSS px), waiting until it is shown. */
export async function centreOf(page: Page, target: string, gameSeconds = 6): Promise<{ x: number; y: number }> {
  let r: { x: number; y: number; w: number; h: number } | null = null;
  await untilGame(page, async () => (r = await page.evaluate((t) => window.__DD__.ui.rect(t), target)) !== null, gameSeconds);
  expect(r, `the control '${target}' is on screen`).not.toBeNull();
  const b = r as unknown as { x: number; y: number; w: number; h: number };
  return { x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) };
}

/**
 * A real touch tap on a HUD control. A trip's card that came up meanwhile (back at camp, a rest at an
 * outpost: LOOP's 'trip:summary') is closed first; r3-cards checks the card itself.
 */
export async function tapControl(page: Page, touch: Touch, target: string): Promise<void> {
  await closeTripCard(page, touch, 0);
  await touch.tap(await centreOf(page, target));
}

/** A real touch press held on a control for `ms`. */
export async function holdControl(page: Page, touch: Touch, target: string, ms: number): Promise<void> {
  await touch.hold(await centreOf(page, target), ms, 6);
}

/** Round 3 events recorded since the last clear (window.__DD__.ui). */
export const uiEvents = (page: Page, type: string) => page.evaluate((t) => window.__DD__.ui.events(t), type);

/** Wait (game time) until an event of `type` was recorded. */
export async function waitEvent(page: Page, type: string, gameSeconds = 10): Promise<boolean> {
  return untilGame(page, async () => (await uiEvents(page, type)).length > 0, gameSeconds);
}

export const hud = (page: Page) => page.evaluate(() => window.__DD__.ui.hud());

export const screen = (page: Page) => page.evaluate(() => window.__DD__.state().screen as string);

/** Wait until a screen is open (or 'none'). */
export async function waitScreen(page: Page, id: string, gameSeconds = 8): Promise<boolean> {
  return untilGame(page, async () => (await screen(page)) === id, gameSeconds);
}

/** Stand somewhere quiet near the camp (out of the arrival card's way) with no creature about. */
export async function quiet(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__DD__.mobs.auto(false);
    window.__DD__.mobs.clear();
    window.__DD__.mobs.harmless(true);
  });
}

/** Dismiss a biome arrival card if one is up (a tap on it). */
export async function dismissArrival(page: Page, touch: Touch): Promise<void> {
  const r = await page.evaluate(() => {
    const el = document.querySelector('.dd-arrival.on');
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };
  });
  if (r) await touch.tap(r);
}
