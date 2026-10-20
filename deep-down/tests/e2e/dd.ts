// The slice of window.__DD__ the e2e specs use, declared once so every spec type-checks together. The idle game's
// surface is `__DD__.idle` (src/debug/idle.ts, SPEC §12.4): specs set up states and read results through it, and
// every tap is a real touch (tests/e2e/touch.ts). `internals` reaches the running game, typed loosely, for the
// release shell's tests only (the renderer's GL context, the settings).

import type { Page } from '@playwright/test';
import type { IdleDebug } from '../../src/debug/idle';

export type { IdleDebug } from '../../src/debug/idle';

export type DD = {
  /** The idle game's surface. */
  idle: IdleDebug;
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

/** Wait until the idle game drew its first frame. */
export async function idleReady(page: Page, timeout = 180_000): Promise<void> {
  await page.waitForFunction(() => window.__DD__?.idle?.ready === true, null, { timeout, polling: 200 });
}

/** Wait until the game is in `mode` ('menu', 'playing', 'paused', 'crashed'). */
export async function waitMode(page: Page, mode: string, timeout = 180_000): Promise<void> {
  await page.waitForFunction((m) => window.__DD__?.idle?.ready === true && window.__DD__.idle.mode() === m, mode, { timeout, polling: 200 });
}

/** Frames drawn so far. */
export const frames = (page: Page): Promise<number> => page.evaluate(() => window.__DD__.idle.frame());

/** Wait for `n` more frames (under the wall-clock ceiling). */
export async function waitFrames(page: Page, n: number, ceilingMs = LOADED_CEILING_MS): Promise<void> {
  const f0 = await frames(page);
  await page.waitForFunction((t) => window.__DD__.idle.frame() >= t, f0 + n, { timeout: ceilingMs, polling: 50 });
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
