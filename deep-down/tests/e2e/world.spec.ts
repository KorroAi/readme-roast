import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import './dd';

// Beyond the success path: every discovery can be triggered and shows its banner, death costs
// the unbanked backpack and returns the explorer to camp, and the death itself is saved.


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
  // Every discovery is saved at once: the next save after it is a 'discovery' save.
  const reason = await page.evaluate((d) => {
    const ev = window.__DD__.events();
    const i = ev.findIndex((e) => e.type === 'discovery' && e.payload.id === d);
    return ev.slice(i + 1).find((e) => e.type === 'game:saved')?.payload.reason ?? 'none';
  }, id);
  expect(reason, `save after the ${id} discovery`).toBe('discovery');
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

  const floor = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), lm.stairsBottom);
  // The HUD hearts follow health: a 6 m fall onto the hall floor (away from camp, so no regen) hurts.
  const hearts = page.locator('.dd-hud.on .dd-hearts');
  await expect(hearts.locator('.dd-heart.f2')).toHaveCount(5);
  await page.evaluate(() => window.__DD__.clearEvents());
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 3, y + 6, z), floor!);
  await page.waitForFunction(() => window.__DD__.events('player:damaged').some((e) => e.payload.cause === 'fall'), null, { timeout: 15_000 });
  const hp = (await page.evaluate(() => window.__DD__.state())).health as number;
  expect(hp, 'health after a 6 m fall').toBeGreaterThan(0);
  expect(hp).toBeLessThan(100);
  await expect(hearts).toHaveAttribute('aria-label', `Health ${Math.ceil(hp)} of 100`);
  // Half-heart units, as specified for the HUD: nearest half heart, 1..9 while hurt but alive.
  const fullHearts = Math.floor(Math.max(1, Math.min(9, Math.round((hp / 100) * 10))) / 2);
  await expect(hearts.locator('.dd-heart.f2')).toHaveCount(fullHearts);
  await expect(hearts.locator('.dd-heart:not(.f2)')).toHaveCount(5 - fullHearts);

  // The lantern meter follows the fuel: burn 250 s of the 300 s oil lantern (as 250 s away from
  // camp would) and the HUD shows what is left and warns that it is low.
  // The fuel keeps burning, so the meter is compared with the live value in the same task.
  await page.evaluate(() => {
    const l = window.__DD__.game.lanternFuel;
    l.update(250, false, { fuelSeconds: l.capacity });
  });
  const meterVsFuel = () =>
    page.evaluate(() => {
      const el = document.querySelector('.dd-hud.on .dd-lantern[role="meter"]');
      const shown = Number(el?.getAttribute('aria-valuenow'));
      return { shown, label: el?.getAttribute('aria-label'), low: !!el?.classList.contains('low'), fuel: window.__DD__.game.lanternFuel.fraction * 100 };
    });
  await expect.poll(async () => { const m = await meterVsFuel(); return m.shown < 20 && Math.abs(m.shown - m.fuel) <= 1; }, { message: 'lantern meter shows the burnt-down fuel' }).toBe(true);
  const meter = await meterVsFuel();
  expect(meter.fuel).toBeLessThan(20);
  expect(meter.label).toBe(`Lantern fuel ${meter.shown}%`);
  expect(meter.low, 'low-fuel warning on the meter').toBe(true);

  // Death: carry unbanked finds, fall 30 m onto the hall floor.
  await page.evaluate(() => window.__DD__.give('copperOre', 3));
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

  // Backgrounding (Android onPause / tab hidden) saves at once and pauses play; coming back
  // stays paused until the player resumes.
  const hidden = await page.evaluate(() => {
    window.__DD__.clearEvents();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    // Read synchronously: the handler must have saved and paused before returning.
    return { saves: window.__DD__.events('game:saved').map((e) => e.payload.reason), mode: window.__DD__.state().mode, screen: window.__DD__.state().screen };
  });
  expect(hidden.saves).toEqual(['background']);
  expect(hidden.mode).toBe('paused');
  expect(hidden.screen).toBe('pause');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete (document as unknown as { visibilityState?: string }).visibilityState;
  });
  expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
  await page.waitForTimeout(300);
  expect((await page.evaluate(() => window.__DD__.state())).mode).toBe('paused');
  await page.getByRole('button', { name: /Resume/i }).tap();
  await waitMode(page, 'playing');

  expect(errors, errors.join('\n')).toEqual([]);
});
