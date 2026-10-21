// The slice of window.__DD__ (src/debug/DebugApi.ts) the e2e specs use, declared once so every
// spec type-checks together. Game internals are reached through `game` and typed loosely.

import type { Page } from '@playwright/test';

export type Vec3i = [number, number, number];

export type DD = {
  ready: boolean;
  state(): any;
  report(): any;
  events(type?: string): Array<{ type: string; payload: any; t: number }>;
  clearEvents(): void;
  prepareMining(id: number, x: number, y: number, z: number, r?: number): { block: Vec3i; stand: Vec3i } | null;
  aimAt(x: number, y: number, z: number, ndcX?: number, ndcY?: number): boolean;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  landmarks(): Record<string, Vec3i>;
  standableNear(x: number, y: number, z: number): Vec3i | null;
  block(x: number, y: number, z: number): number;
  give(item: string, n: number): number;
  isSolid(x: number, y: number, z: number): boolean;
  save(): boolean;
  input(patch: Record<string, unknown>): void;
  look(yaw: number, pitch: number): void;
  step(frames: number, dt?: number): void;
  loop: {
    recompute(): { homeMs: number; reachMs: number; cacheMs: number; homeCells: number };
    homeSteps(x: number, y: number, z: number): number;
    reachable(x: number, y: number, z: number): boolean;
    cache(): { x: number; y: number; z: number; depth: number; items: Record<string, number> } | null;
    report(): any;
    next(): { id: string; text: string };
  };
  /** World variety (game/WorldFeatures). */
  features: {
    state(): any;
    ride(id: string, dir: 'up' | 'down', t?: number): boolean;
    release(): void;
    openDoor(id: string): boolean;
    wake(id: string): boolean;
    setEpoch(n: number): number;
    sites(): Array<{ kind: string; id: string; area: string; x: number; y: number; z: number; epoch: number; present: boolean }>;
    layout(): any;
  };
  /** Mutating helpers run (automation or ?debug=1). */
  mutations: boolean;
  setBlock(x: number, y: number, z: number, id: number): void;
  /** The tree, the stations, the runes, the rumours (final pass W3). */
  progression: {
    state(): any;
    tree(): any;
    survey(): any;
    journal(): any;
    craft(id: string): void;
    setTarget(id: string | null): void;
    grantNode(id: string): boolean;
    grantRunes(n: number): number;
    stoneDistance(): number;
    plots(): any[];
    runeSites(): any[];
  };
  game: any;
};

declare global {
  interface Window {
    __DD__: DD;
    /** Set by the Android shell's Back handling; installed by the game and the Visual Lab. */
    deepDownBack?: () => boolean;
  }
}


// ---------------------------------------------------------------------------------------
// Load-proof waits. Under machine load SwiftShader renders at 0-1 fps, so a wall-clock budget
// says nothing about the game: the specs wait on game time instead, under a generous
// wall-clock ceiling. The assertions themselves are unchanged.

/** Wall-clock ceiling for anything that waits on the game. */
export const LOADED_CEILING_MS = 240_000;

/** Seconds of play so far (advances only while playing). */
export const playTime = (page: Page): Promise<number> => page.evaluate(() => window.__DD__.game.playTime as number);

/** Seconds of game time in any mode (the shader clock). */
export const gameClock = (page: Page): Promise<number> => page.evaluate(() => window.__DD__.game.session.rig.uniforms.uTime.value as number);

/**
 * Poll `done` until it holds, giving up only after `gameSeconds` of game time (the shader clock)
 * or the wall-clock ceiling. @returns whether `done` held.
 */
export async function untilGame(page: Page, done: () => Promise<boolean>, gameSeconds: number, ceilingMs = LOADED_CEILING_MS, pollMs = 250): Promise<boolean> {
  const t0 = await gameClock(page);
  const wall = Date.now();
  for (;;) {
    if (await done()) return true;
    if ((await gameClock(page)) - t0 >= gameSeconds || Date.now() - wall >= ceilingMs) return done();
    await page.waitForTimeout(pollMs);
  }
}

/** Wait until `seconds` of play (playTime) have passed, under the wall-clock ceiling. */
export async function waitPlay(page: Page, seconds: number, ceilingMs = LOADED_CEILING_MS): Promise<void> {
  const t0 = await playTime(page);
  await page.waitForFunction(([t, s]) => window.__DD__.game.playTime - t >= s, [t0, seconds] as const, { timeout: ceilingMs, polling: 50 });
}

/**
 * Round 2: the creatures of the deep spawn on their own; specs about other systems keep the
 * spawner off so a crawler's blow never changes what they measure (the mobs have their own spec,
 * mobs.spec.ts, and place what they need by hand). Runs before the page's scripts on every load.
 */
export async function quietDeep(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const id = window.setInterval(() => {
      const mobs = (window as unknown as { __DD__?: { mobs?: { auto(on: boolean): boolean } } }).__DD__?.mobs;
      if (!mobs) return;
      mobs.auto(false);
      window.clearInterval(id);
    }, 50);
  });
}
