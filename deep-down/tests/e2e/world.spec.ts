import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';

// Beyond the success path: every discovery can be triggered and shows its banner, death costs
// the unbanked backpack and returns the explorer to camp, and the death itself is saved.

type DD = {
  ready: boolean;
  state(): any;
  events(type?: string): Array<{ type: string; payload: any }>;
  clearEvents(): void;
  teleport(x: number, y: number, z: number, yaw?: number): void;
  landmarks(): Record<string, [number, number, number]>;
  standableNear(x: number, y: number, z: number): [number, number, number] | null;
  prepareMining(id: number, x: number, y: number, z: number, r?: number): { block: [number, number, number]; stand: [number, number, number] } | null;
  aimAt(x: number, y: number, z: number, ndcX?: number, ndcY?: number): boolean;
  give(item: string, n: number): number;
  game: any;
};
declare global {
  interface Window {
    __DD__: DD;
  }
}

const IRON_ORE = 8;

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: 120_000, polling: 200 });
}

async function visit(page: Page, at: [number, number, number]) {
  const p = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), at);
  expect(p, `standable near ${at}`).not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), p!);
}

async function discovered(page: Page, id: string, title: RegExp) {
  await page.waitForFunction((d) => window.__DD__.events('discovery').some((e) => e.payload.id === d), id, { timeout: 15_000 });
  // Banners play in turn, so a discovery right after another one shows a few seconds later.
  await expect(page.locator('.dd-discovery-title', { hasText: title })).toBeVisible({ timeout: 20_000 });
}

test('every discovery triggers; death loses the backpack, respawns at camp and is saved', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  const touch = await Touch.attach(page);
  const lm = await page.evaluate(() => window.__DD__.landmarks());

  await visit(page, lm.firstCrystals);
  await discovered(page, 'crystals', /Glimmer Crystals/i);
  await visit(page, lm.ledge);
  await discovered(page, 'hollow', /Lantern Hollow/i);
  await visit(page, lm.balcony);
  await discovered(page, 'gate', /Deep Gate/i);
  await visit(page, lm.tablet);
  await discovered(page, 'shrine', /Sealed Shrine/i);

  // The tablet is read with the Use button.
  await page.getByRole('button', { name: /Ancient Tablet/i }).first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: /Ancient Tablet/i }).first().tap();
  await discovered(page, 'tablet', /Ancient Tablet/i);

  // Iron is visible but too hard for the rusty pickaxe: trying is itself a discovery.
  const iron = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(8, x, y, z, 60), lm.stairsBottom);
  expect(iron, 'a reachable iron vein').not.toBeNull();
  const vp = page.viewportSize()!;
  const at = { x: Math.ceil(vp.width / 2) + 6, y: Math.round(vp.height / 2) };
  await page.evaluate(([x, y, z, ax, ay]) => window.__DD__.aimAt(x, y, z, ax, ay), [...iron!.block, (at.x / vp.width) * 2 - 1, 1 - (at.y / vp.height) * 2]);
  await touch.down(at);
  await page.waitForFunction(
    (b) => window.__DD__.events('block:tooHard').some((e) => e.payload.block === b) || window.__DD__.events('discovery').some((e) => e.payload.id === 'ironVein'),
    IRON_ORE,
    { timeout: 20_000 },
  );
  await touch.up();
  await discovered(page, 'ironVein', /Iron Vein/i);
  const journal = (await page.evaluate(() => window.__DD__.state())).journal.discoveries;
  expect(journal).toEqual(expect.arrayContaining(['crystals', 'hollow', 'gate', 'shrine', 'tablet', 'ironVein']));

  // Death: carry unbanked finds, fall 30 m onto the hall floor.
  await page.evaluate(() => window.__DD__.give('copperOre', 3));
  const floor = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.stairsBottom);
  const deathsBefore = (await page.evaluate(() => window.__DD__.game.stats.deaths)) as number;
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 3, y + 30, z), floor!);
  await waitMode(page, 'dead');
  await expect(page.getByText(/You Blacked Out/i).first()).toBeVisible();
  // The death is saved immediately (closing the app now cannot undo it).
  const saved = await page.evaluate(() => {
    const raw = localStorage.getItem('deepdown.save.' + localStorage.getItem('deepdown.save.active'));
    return raw ? JSON.parse(JSON.parse(raw).json ?? raw) : null;
  });
  expect(saved?.stats?.deaths).toBe(deathsBefore + 1);
  expect(saved.backpack.filter(Boolean).length).toBe(0);
  await page.getByRole('button', { name: /Wake Up at Camp/i }).tap();
  await waitMode(page, 'playing');
  const s = await page.evaluate(() => window.__DD__.state());
  expect(s.atCamp).toBe(true);
  expect(s.backpack.filter(Boolean).length).toBe(0);
  expect(await page.evaluate(() => window.__DD__.game.audio.paused ?? false)).toBe(false);

  expect(errors, errors.join('\n')).toEqual([]);
});
