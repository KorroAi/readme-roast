// The slice of window.__DD__ the e2e specs use, declared once so every spec type-checks together. The first-person
// game's surface is `__DD__.hybrid` (src/debug/hybrid.ts, SPEC §13.3): specs set up states and read results through
// it, and every touch is a real touch (tests/e2e/touch.ts). `internals` reaches the running game, typed loosely, for
// the release shell's tests only (the renderer's GL context, the settings).

import type { Page } from '@playwright/test';
import type { HybridDebug } from '../../src/debug/hybrid';

export type { HybridDebug, HybridFaceCell, HybridFloorPoint, HybridTappable, HybridNav } from '../../src/debug/hybrid';

export type DD = {
  /** The first-person game's surface (SPEC §13.3). */
  hybrid: HybridDebug;
  /** The running game and the FX canvas (debug only). */
  internals: { game: any; fx: any };
};

declare global {
  interface Window {
    __DD__: DD;
    /** Set by the Android shell's Back handling; installed by the game and the Visual Lab. */
    deepDownBack?: () => boolean;
  }
}

/** Wall-clock ceiling for anything that waits on the game (SwiftShader under load renders at a few fps). */
export const LOADED_CEILING_MS = 240_000;

/** Wait until the game drew its first frame. */
export async function idleReady(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => window.__DD__?.hybrid?.ready === true, null, { timeout, polling: 200 });
}

/** Wait until the game is in `mode` ('playing', 'paused', 'crashed'; the menu is the camp: `waitMenu`). */
export async function waitMode(page: Page, mode: string, timeout = 180_000): Promise<void> {
  await page.waitForFunction((m) => window.__DD__?.hybrid?.ready === true && window.__DD__.hybrid.mode() === m, mode, { timeout, polling: 200 });
}

/** Frames drawn so far. */
export const frames = (page: Page): Promise<number> => page.evaluate(() => window.__DD__.hybrid.frame());

/** Wait for `n` more frames (under the wall-clock ceiling). */
export async function waitFrames(page: Page, n: number, ceilingMs = LOADED_CEILING_MS): Promise<void> {
  const f0 = await frames(page);
  await page.waitForFunction((t) => window.__DD__.hybrid.frame() >= t, f0 + n, { timeout: ceilingMs, polling: 50 });
}

/** Poll `done` until it holds or `ms` of wall clock pass. @returns whether it held. */
export async function until(page: Page, done: () => Promise<boolean>, ms: number, pollMs = 200): Promise<boolean> {
  const t0 = Date.now();
  for (;;) {
    if (await done()) return true;
    if (Date.now() - t0 >= ms) return done();
    await page.waitForTimeout(pollMs);
  }
}

/** A fresh first launch: no save, no settings, no auto-quality record (run before the page's scripts). */
export async function freshLaunch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('dd.e2e.cleared')) return;
    sessionStorage.setItem('dd.e2e.cleared', '1');
    for (const k of Object.keys(localStorage)) if (k.startsWith('deepdown')) localStorage.removeItem(k);
  });
}

// ----- the first-person game (SPEC §13.3) -------------------------------------------------------------------------

/** Wait until the hybrid game drew its first frame. */
export async function hybridReady(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => window.__DD__?.hybrid?.ready === true, null, { timeout, polling: 200 });
}

/**
 * Wait for the menu: the camp at the adit mouth with nothing open (SPEC §5.10; `screen === 'menu'`, where Back belongs
 * to the OS). The game's mode there is 'playing': the camp is a place, not a screen.
 */
export async function waitMenu(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => window.__DD__?.hybrid?.ready === true && (window.__DD__.internals?.game as { screen?: string } | undefined)?.screen === 'menu', null, { timeout, polling: 200 });
}

/** "Descend" from the camp: a tap on the objective line ("Go down the adit") walks to the adit, which goes down. */
export async function descend(page: Page, timeout = 240_000): Promise<void> {
  await page.locator('[data-hud="goal"]').click();
  await page.waitForFunction(() => window.__DD__.hybrid.node().phase !== 'camp', null, { timeout, polling: 200 });
}

/** Wait until the hybrid game is in `mode` ('playing', 'paused', 'crashed'; the menu is the camp: `waitMenu`). */
export async function hybridMode(page: Page, mode: string, timeout = 180_000): Promise<void> {
  await page.waitForFunction((m) => window.__DD__?.hybrid?.ready === true && window.__DD__.hybrid.mode() === m, mode, { timeout, polling: 200 });
}

/** Frames the hybrid game drew so far. */
export const hybridFrames = (page: Page): Promise<number> => page.evaluate(() => window.__DD__.hybrid.frame());

/** Wait for `n` more hybrid frames. */
export async function hybridWaitFrames(page: Page, n: number, ceilingMs = LOADED_CEILING_MS): Promise<void> {
  const f0 = await hybridFrames(page);
  await page.waitForFunction((t) => window.__DD__.hybrid.frame() >= t, f0 + n, { timeout: ceilingMs, polling: 50 });
}

/** Wait until the player's phase is `phase` (and, optionally, at node `node`). */
export async function waitPhase(page: Page, phase: string, node?: number, timeout = LOADED_CEILING_MS): Promise<void> {
  await page.waitForFunction(
    ([p, n]) => {
      const h = window.__DD__?.hybrid;
      if (!h?.ready) return false;
      const v = h.node();
      return v.phase === p && (n === null || v.node === n);
    },
    [phase, node ?? null] as const,
    { timeout, polling: 100 },
  );
}

/** Wait until the camera stops moving (glides, walks, rides, the look's settle). */
export async function waitStill(page: Page, timeout = LOADED_CEILING_MS): Promise<void> {
  await page.waitForFunction(() => window.__DD__?.hybrid?.ready === true && !window.__DD__.hybrid.camera().moving, null, { timeout, polling: 100 });
}

/** The centre of a rect. */
export const centreOf = (r: { x: number; y: number; w: number; h: number }): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
