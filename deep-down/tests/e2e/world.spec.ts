import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { LOADED_CEILING_MS, waitPlay, quietDeep } from './dd';

// Round 2: the spawner stays off here (see quietDeep in dd.ts).
test.beforeEach(async ({ page }) => {
  await quietDeep(page);
});


// Beyond the success path: every discovery can be triggered and shows its banner; a black-out
// leaves the pack where the explorer last stood (a cache), returns the explorer to camp and is
// saved with the cache; the cache survives a reload and walking back to it restores the items.

// SwiftShader under load renders a frame or two per second: give the test a generous budget.
test.describe.configure({ timeout: 900_000 });
// First person on an upright phone, with real touches.
test.use({ viewport: { width: 390, height: 844 } });


const IRON_ORE = 8;

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: LOADED_CEILING_MS, polling: 200 });
}

async function visit(page: Page, at: [number, number, number]) {
  const p = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), at);
  expect(p, `standable near ${at}`).not.toBeNull();
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), p!);
}

async function discovered(page: Page, id: string, title: RegExp) {
  await page.waitForFunction((d) => window.__DD__.events('discovery').some((e) => e.payload.id === d), id, { timeout: LOADED_CEILING_MS });
  // Every discovery is saved at once: the next save after it is a 'discovery' save.
  const reason = await page.evaluate((d) => {
    const ev = window.__DD__.events();
    const i = ev.findIndex((e) => e.type === 'discovery' && e.payload.id === d);
    return ev.slice(i + 1).find((e) => e.type === 'game:saved')?.payload.reason ?? 'none';
  }, id);
  expect(reason, `save after the ${id} discovery`).toBe('discovery');
  // Banners play in turn, so a discovery right after another one shows a few seconds later.
  await expect(page.locator('.dd-discovery-title', { hasText: title })).toBeVisible({ timeout: LOADED_CEILING_MS });
}

/** The save the game would resume from (active slot of the two-slot store). */
async function persisted(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('deepdown.save.' + localStorage.getItem('deepdown.save.active'));
    return raw ? JSON.parse(JSON.parse(raw).json ?? raw) : null;
  });
}

test('every discovery triggers; a black-out leaves a cache, respawns at camp, is saved, and the pack can be recovered', async ({ page }) => {
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
  await page.getByRole('button', { name: /Ancient Tablet/i }).first().waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await page.getByRole('button', { name: /Ancient Tablet/i }).first().tap();
  await discovered(page, 'tablet', /Ancient Tablet/i);

  // Iron is visible but too hard for the rusty pickaxe: trying is itself a discovery.
  const iron = await page.evaluate(([x, y, z]) => window.__DD__.prepareMining(8, x, y, z, 60), lm.stairsBottom);
  expect(iron, 'a reachable iron vein').not.toBeNull();
  const vp = page.viewportSize()!;
  const at = { x: Math.round(vp.width / 2), y: Math.round(vp.height / 2) };
  await page.evaluate(([x, y, z, ax, ay]) => window.__DD__.aimAt(x, y, z, ax, ay), [...iron!.block, (at.x / vp.width) * 2 - 1, 1 - (at.y / vp.height) * 2]);
  await touch.down(at);
  await page.waitForFunction(
    (b) => window.__DD__.events('block:tooHard').some((e) => e.payload.block === b) || window.__DD__.events('discovery').some((e) => e.payload.id === 'ironVein'),
    IRON_ORE,
    { timeout: LOADED_CEILING_MS },
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
  await page.waitForFunction(() => window.__DD__.events('player:damaged').some((e) => e.payload.cause === 'fall'), null, { timeout: LOADED_CEILING_MS });
  const hp = (await page.evaluate(() => window.__DD__.state())).health as number;
  expect(hp, 'health after a 6 m fall').toBeGreaterThan(0);
  expect(hp).toBeLessThan(100);
  await expect(hearts).toHaveAttribute('aria-label', `Health ${Math.ceil(hp)} of 100`);
  // Calm HUD: the hearts come into view once hurt.
  await expect(hearts).toBeVisible();
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
  await expect.poll(async () => { const m = await meterVsFuel(); return m.shown < 20 && Math.abs(m.shown - m.fuel) <= 1; }, { message: 'lantern meter shows the burnt-down fuel', timeout: LOADED_CEILING_MS }).toBe(true);
  const meter = await meterVsFuel();
  expect(meter.fuel).toBeLessThan(20);
  expect(meter.label).toBe(`Lantern fuel ${meter.shown}%`);
  expect(meter.low, 'low-fuel warning on the meter').toBe(true);

  // Black-out: carry unbanked finds, fall 30 m onto the hall floor. The pack stays behind as a
  // cache where the explorer last stood (the hall floor after the 6 m fall), not at the bottom.
  // Stand there a moment first (a cache spot needs 0.3 s on the ground, in game time).
  await waitPlay(page, 0.6);
  const stood = await page.evaluate(() => {
    const p = window.__DD__.state().player;
    return [Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z)] as [number, number, number];
  });
  await page.evaluate(() => window.__DD__.give('copperOre', 3));
  const carried = (await page.evaluate(() => window.__DD__.state().backpack)).filter(Boolean).reduce((a: Record<string, number>, sl: any) => ({ ...a, [sl.item]: (a[sl.item] ?? 0) + sl.count }), {});
  expect(carried.copperOre ?? 0).toBeGreaterThanOrEqual(3);
  const deathsBefore = (await page.evaluate(() => window.__DD__.game.stats.deaths)) as number;
  await page.evaluate(() => window.__DD__.clearEvents());
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 3, y + 30, z), floor!);
  await waitMode(page, 'dead');
  await expect(page.getByText(/You Blacked Out/i).first()).toBeVisible();
  await expect(page.getByText(/Left in your pack/i).first()).toBeVisible();
  await expect(page.getByText(/Your pack lies at -\d+ m — \d+ items/).first()).toBeVisible();
  const cache = await page.evaluate(() => window.__DD__.loop.cache());
  expect(cache, 'a cache was left').not.toBeNull();
  expect(cache!.items).toEqual(carried);
  expect(await page.evaluate(([x, y, z]) => window.__DD__.loop.reachable(x, y, z), [cache!.x, cache!.y, cache!.z] as [number, number, number]), 'the cache lies where it can be walked to').toBe(true);
  // It lies where the explorer stood on the hall floor, not 30 m up in the air.
  expect([Math.floor(cache!.x), cache!.y, Math.floor(cache!.z)], 'the cache cell is where the explorer last stood').toEqual(stood);
  const ended = await page.evaluate(() => window.__DD__.events('expedition:ended').map((e) => e.payload.report));
  expect(ended.map((r: any) => r.outcome)).toEqual(['blackout']);
  expect(ended[0].cached).toEqual(carried);
  // The death is saved immediately, in the same write as the cache (closing the app now cannot undo it).
  const saved = await persisted(page);
  expect(saved?.stats?.deaths).toBe(deathsBefore + 1);
  expect(saved.backpack.filter(Boolean).length).toBe(0);
  expect(saved.progression.cache.items).toEqual(carried);
  await page.getByRole('button', { name: /Wake Up at Camp/i }).tap();
  await waitMode(page, 'playing');
  // Back at camp the Expedition Report shows the black-out (what waits in the pack): close it.
  const closeReport = page.locator('[data-key="summary-close"]');
  await closeReport.waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await expect(page.getByRole('dialog', { name: /Expedition \d+ report/ }).getByText(/Your pack lies at -\d+ m/).first()).toBeVisible();
  await closeReport.tap();
  await page.waitForFunction(() => window.__DD__.state().screen === 'none', null, { timeout: LOADED_CEILING_MS });
  let s = await page.evaluate(() => window.__DD__.state());
  expect(s.atCamp).toBe(true);
  expect(s.backpack.filter(Boolean).length).toBe(0);
  expect(await page.evaluate(() => window.__DD__.game.audio.paused ?? false)).toBe(false);
  // The HUD points at the pack, and the Next line says to recover it.
  await expect(page.locator('.dd-hud.on .dd-cache-chip')).toHaveText(/^Pack \d+ m$/, { timeout: LOADED_CEILING_MS });
  await expect(page.locator('.dd-hud.on .dd-objective')).toHaveText(/^Recover your pack — \d+ m$/, { timeout: LOADED_CEILING_MS });

  // The cache survives a reload.
  expect(await page.evaluate(() => window.__DD__.save())).toBe(true);
  await page.reload();
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /Continue/i }).click();
  await waitMode(page, 'playing');
  expect(await page.evaluate(() => window.__DD__.loop.cache())).toEqual(cache);

  // Walk back to it: within 1.6 m the items return to the pack.
  await page.evaluate(() => window.__DD__.clearEvents());
  const near = await page.evaluate(([x, y, z]) => {
    // A cell on the cache's level two to four steps away, with every cell between standable too
    // (a straight, flat walk to the pack).
    const dd = window.__DD__;
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    const stand = (i: number, k: number) => !dd.isSolid(i, y, k) && !dd.isSolid(i, y + 1, k) && dd.isSolid(i, y - 1, k);
    for (const n of [3, 4, 2])
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let ok = true;
        for (let s = 1; s <= n && ok; s++) ok = stand(cx + dx * s, cz + dz * s);
        if (ok) return [cx + dx * n + 0.5, y, cz + dz * n + 0.5] as [number, number, number];
      }
    return null;
  }, [cache!.x, cache!.y, cache!.z] as [number, number, number]);
  expect(near, `a standable spot a few steps from the cache at ${cache!.x},${cache!.y},${cache!.z}`).not.toBeNull();
  await page.evaluate(([x, y, z, cx, cz]) => {
    const dd = window.__DD__;
    dd.teleport(x, y, z);
    // Camera forward is (-sin(yaw), -cos(yaw)): face the cache and walk.
    dd.look(Math.atan2(-(cx - x), -(cz - z)), -0.2);
    dd.input({ moveY: 1 });
  }, [...near!, cache!.x, cache!.z] as [number, number, number, number, number]);
  await page.waitForFunction(() => window.__DD__.events('cache:recovered').length > 0, null, { timeout: LOADED_CEILING_MS });
  await page.evaluate(() => window.__DD__.input({ moveY: 0 }));
  const rec = await page.evaluate(() => window.__DD__.events('cache:recovered')[0].payload);
  expect(rec).toEqual({ count: Object.values(carried).reduce((a: number, n) => a + (n as number), 0), left: 0 });
  s = await page.evaluate(() => window.__DD__.state());
  expect(s.cache).toBeNull();
  const back = s.backpack.filter(Boolean).reduce((a: Record<string, number>, sl: any) => ({ ...a, [sl.item]: (a[sl.item] ?? 0) + sl.count }), {});
  expect(back).toEqual(carried);
  await expect(page.locator('.dd-hud.on .dd-cache-chip')).toBeHidden({ timeout: LOADED_CEILING_MS });
  // The recovery is saved at once.
  expect((await persisted(page)).progression.cache).toBeNull();

  // Back to camp for the lifecycle checks below.
  const campSpot = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x - 2, y, z), lm.campfire);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), campSpot!);
  await page.waitForFunction(() => window.__DD__.state().atCamp, null, { timeout: LOADED_CEILING_MS });

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

// World variety (final pass W2): a Halden log is read, the hoist is chained until released from
// below and stays released after a reload, rune door 1 wakes to the lantern, the rope goes down to
// the rift floor, and the black stone can be touched. Rides end standing, with no fall damage.
test('Halden log, hoist lock and ride, rune door, rope to the rift floor, the black stone', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const use = (name: RegExp) => page.getByRole('button', { name }).first();
  const rideEnded = (id: string) => page.waitForFunction((r) => window.__DD__.events('world:ride').some((e) => e.payload.id === r && e.payload.phase === 'end'), id, { timeout: LOADED_CEILING_MS });
  const at = async (p: number[]) => {
    const s = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), p as [number, number, number]);
    expect(s, `standable near ${p}`).not.toBeNull();
    await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), s!);
  };

  // The first Halden log, on the Survey Office's desk off the tunnel.
  await at([60.5, 100, 34.6]);
  await use(/^Use Read$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await use(/^Use Read$/).tap();
  await discovered(page, 'note.office', /Halden Log: Survey Office/i);

  // The hoist is chained from below: using it at the top does nothing but say so.
  const L = await page.evaluate(() => window.__DD__.features.layout());
  const hoist = L.links.find((l: any) => l.id === 'hoist');
  await page.evaluate(() => window.__DD__.clearEvents());
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), hoist.top);
  await use(/^Use Ride the hoist$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await use(/^Use Ride the hoist$/).tap();
  await expect(page.getByText(/The hoist is chained from below/i).first()).toBeVisible({ timeout: LOADED_CEILING_MS });
  expect(await page.evaluate(() => window.__DD__.features.state().riding)).toBeNull();
  // Released from the foot stage, it rides up to the ledge (and that is a discovery, saved at once).
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), hoist.bottom);
  await use(/^Use Release the hoist$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await use(/^Use Release the hoist$/).tap();
  await discovered(page, 'hoist', /Halden Hoist/i);
  await rideEnded('hoist');
  let s = await page.evaluate(() => window.__DD__.state());
  expect(s.player.y).toBe(hoist.top[1]);
  expect(Math.hypot(s.player.x - hoist.top[0], s.player.z - hoist.top[2])).toBeLessThan(0.05);
  expect(await page.evaluate(() => window.__DD__.events('player:damaged').length), 'no fall damage after the ride').toBe(0);

  // It stays released after a reload: from the top it now rides down.
  expect(await page.evaluate(() => window.__DD__.save())).toBe(true);
  await page.reload();
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /Continue/i }).click();
  await waitMode(page, 'playing');
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), hoist.top);
  await use(/^Use Ride the hoist$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await use(/^Use Ride the hoist$/).tap();
  await rideEnded('hoist');
  s = await page.evaluate(() => window.__DD__.state());
  expect(s.player.y).toBe(hoist.bottom[1]);

  // Rune door 1 at the bridge's end wakes to the lit lantern and sinks; the relic behind it is a discovery.
  const door = L.runeDoors.find((d: any) => d.id === 'reliquary');
  await at(door.wake);
  await page.waitForFunction(() => window.__DD__.events('world:runeOpen').length > 0, null, { timeout: LOADED_CEILING_MS });
  await page.waitForFunction((cells) => cells.every(([x, y, z]: number[]) => !window.__DD__.isSolid(x, y, z)), door.cells, { timeout: LOADED_CEILING_MS });
  await at([122.5, 42, 147]);
  await use(/^Use Take the relic$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await use(/^Use Take the relic$/).tap();
  await discovered(page, 'reliquary', /The Reliquary/i);

  // The rope from the balcony down to the rift floor (the floor itself is a discovery).
  const rope = L.links.find((l: any) => l.id === 'riftRope');
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), rope.top);
  await use(/^Use Climb down$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await page.evaluate(() => window.__DD__.clearEvents());
  await use(/^Use Climb down$/).tap();
  await rideEnded('riftRope');
  s = await page.evaluate(() => window.__DD__.state());
  expect([s.player.x, s.player.y, s.player.z]).toEqual(rope.bottom);
  await discovered(page, 'undercroft', /The Rift Floor/i);
  expect(await page.evaluate(() => window.__DD__.events('player:damaged').length), 'no fall damage after the rope').toBe(0);

  // The black stone: touched at its portal, it stays cold and silent (the finale is not this wave's).
  await at(lm.stonePortal);
  await use(/^Use Touch the stone$/).waitFor({ state: 'visible', timeout: LOADED_CEILING_MS });
  await use(/^Use Touch the stone$/).tap();
  await discovered(page, 'monolith', /The Black Stone/i);
  expect(await page.evaluate(() => window.__DD__.events('world:monolith').map((e) => e.payload.first))).toEqual([true]);

  expect(errors, errors.join('\n')).toEqual([]);
});
