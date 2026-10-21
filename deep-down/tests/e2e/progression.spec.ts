import { expect, test, type Page } from '@playwright/test';
import { LOADED_CEILING_MS, untilGame } from './dd';

// The upgrade tree and the runes (final pass W3): craft the Copper Pickaxe, build the Survey Table
// and the Forge (they rise on their camp plots), forge the Iron Pickaxe, with the HUD's Next line
// moving on at each step; the stations survive a reload. Then the runes: seven granted, the eighth
// taken from its stone, the shelf shows 8/8, the black stone wakes and the finale is reached.

test.describe.configure({ timeout: 900_000 });

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: LOADED_CEILING_MS, polling: 200 });
}

/** The Next line on the HUD pill (as drawn) once it settles on something other than `prev`. */
async function nextChanges(page: Page, prev: string): Promise<string> {
  const pill = page.locator('.dd-hud .dd-objective, .dd-objective').first();
  await expect.poll(async () => (await pill.textContent())?.trim() ?? '', { timeout: LOADED_CEILING_MS }).not.toBe(prev);
  const text = (await pill.textContent())?.trim() ?? '';
  expect(text.length).toBeGreaterThan(0);
  expect(text).not.toMatch(/\bdone\b/i);
  return text;
}

async function pillText(page: Page): Promise<string> {
  const pill = page.locator('.dd-objective').first();
  await expect(pill).toHaveClass(/\bon\b/, { timeout: LOADED_CEILING_MS });
  return ((await pill.textContent()) ?? '').trim();
}

/** Bank materials as if carried home (key items and stats go through the pickup path). */
async function bank(page: Page, items: Record<string, number>) {
  await page.evaluate((it) => {
    const g = window.__DD__.game;
    for (const [id, n] of Object.entries(it)) g.storage.add(id, n);
    g.bus.emit('inventory:changed', {});
  }, items);
}

async function craft(page: Page, id: string) {
  const before = await page.evaluate(() => window.__DD__.events('craft:done').length);
  await page.evaluate((n) => window.__DD__.game.craft(n), id);
  await page.waitForFunction(([n, b]) => window.__DD__.events('craft:done').length > (b as number) && window.__DD__.events('craft:done').at(-1)!.payload.recipe === n, [id, before] as const, { timeout: LOADED_CEILING_MS });
}

async function persisted(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('deepdown.save.' + localStorage.getItem('deepdown.save.active'));
    return raw ? JSON.parse(JSON.parse(raw).json ?? raw) : null;
  });
}

test('the tree: copper pick, Survey Table, Forge, iron pick; the Next line moves on; stations survive a reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  expect(await page.evaluate(() => window.__DD__.mutations)).toBe(true);

  // The first steps of the chain, as a trip home with stone and copper would give them.
  await page.evaluate(() => {
    const g = window.__DD__.game;
    g.grant('stone', 30);
    g.grant('copperOre', 12);
    g.grant('rootFibre', 6);
    g.grant('glimmerShard', 2);
  });
  let next: string;
  await untilGame(page, async () => (await pillText(page)) === 'Craft a Copper Pickaxe at the Workbench', 30);
  next = await pillText(page);
  expect(next).toBe('Craft a Copper Pickaxe at the Workbench');

  // 1. The Copper Pickaxe (the plot stake and the tree agree it can be made).
  const tree = await page.evaluate(() => window.__DD__.progression.tree());
  expect(tree.nodes.length).toBe(12);
  expect(tree.nodes.find((n: { id: string }) => n.id === 'copperPickaxe').state).toBe('ok');
  expect(tree.nodes.find((n: { id: string }) => n.id === 'forge').reason).toBe('Make the Copper Pickaxe first');
  await craft(page, 'copperPickaxe');
  next = await nextChanges(page, next);
  // Finish the chain: the seal, then the Deep Gate.
  await page.evaluate(() => {
    const g = window.__DD__.game;
    g.bus.emit('block:broken', { x: 136, y: 42, z: 100, block: 10 });
    g.discover('gate');
  });
  // The Workbench side lines are made already, so the Next line follows the main line.
  await page.evaluate(() => ['sturdyPack', 'copperLantern', 'gripBoots'].forEach((id) => window.__DD__.progression.grantNode(id)));
  await untilGame(page, async () => (await pillText(page)).startsWith('Next:'), 30);
  next = await pillText(page);
  expect(next).toBe('Next: build the Survey Table at camp');

  // 2. The Survey Table rises on its plot (paid from the pack: 12 stone, 4 copper, 2 glimmer).
  await craft(page, 'surveyTable');
  await page.waitForFunction(() => window.__DD__.events('station:built').some((e) => e.payload.id === 'surveyTable'), null, { timeout: LOADED_CEILING_MS });
  next = await nextChanges(page, next);
  // The Forge's stone, counted from what is left after the pick and the table (costs are content's).
  const stoneLeft = await page.evaluate(() => {
    const g = window.__DD__.game;
    return (g.backpack.count('stone') as number) + (g.storage.count('stone') as number);
  });
  expect(next).toBe(`Next: Forge — Stone ${stoneLeft}/24`);

  // 3. The Forge: it needs iron from beyond the seal.
  await bank(page, { stone: 24, copperOre: 6, ironOre: 3 });
  next = await nextChanges(page, next);
  expect(next).toBe('Next: build the Forge at camp');
  await craft(page, 'forge');
  await page.waitForFunction(() => window.__DD__.events('station:built').some((e) => e.payload.id === 'forge'), null, { timeout: LOADED_CEILING_MS });
  next = await nextChanges(page, next);
  expect(next).toBe("Next: Miner's Coat — Iron Ore 0/4");
  const forgeTab = await page.evaluate(() => window.__DD__.progression.tree().places.find((p: { id: string }) => p.id === 'forge'));
  expect(forgeTab.open).toBe(true);

  // 4. The Iron Pickaxe at the Forge.
  await bank(page, { ironOre: 8, copperOre: 6, stone: 10 });
  next = await nextChanges(page, next);
  expect(next).toBe('Next: forge the Iron Pickaxe at the Forge');
  await craft(page, 'ironPickaxe');
  expect((await page.evaluate(() => window.__DD__.state().equipment)).pickaxe).toBe(3);
  next = await nextChanges(page, next);

  // The stations stand (risen), and are in the save.
  await page.waitForFunction(() => !window.__DD__.progression.state().busy, null, { timeout: LOADED_CEILING_MS });
  const st = await page.evaluate(() => window.__DD__.progression.state());
  expect(st.standing.sort()).toEqual(['forge', 'surveyTable']);
  expect((await persisted(page)).progression.stations.sort()).toEqual(['forge', 'surveyTable']);

  // Reload: the stations are still on their plots, the stakes are gone, the tree remembers.
  await page.reload();
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /Continue/i }).click();
  await waitMode(page, 'playing');
  const after = await page.evaluate(() => ({ s: window.__DD__.progression.state(), tree: window.__DD__.progression.tree(), stakes: [...window.__DD__.game.session.liveProps.values()].filter((p: { kind: string }) => p.kind === 'plotStake').map((p: { station: string }) => p.station) }));
  expect(after.s.standing.sort()).toEqual(['forge', 'surveyTable']);
  expect(after.stakes).toEqual(['relicShelf']);
  expect(after.tree.nodes.find((n: { id: string }) => n.id === 'ironPickaxe').state).toBe('owned');
  expect(after.tree.nodes.find((n: { id: string }) => n.id === 'forge').state).toBe('owned');
  // Using the stations: the Forge opens its tab of the tree, the Table the Survey board.
  const use = (id: string) =>
    page.evaluate((pid) => {
      const g = window.__DD__.game;
      g.ui.showScreen('none');
      g.interact(g.session.liveProps.get(pid));
      return { screen: window.__DD__.state().screen, focus: window.__DD__.progression.tree().focus };
    }, id);
  expect(await use('station:forge')).toEqual({ screen: 'crafting', focus: 'forge' });
  expect((await use('station:surveyTable')).screen).toBe('board');
  // The Relic Shelf's stake opens the camp tab on its node.
  const stake = await page.evaluate(() => {
    const g = window.__DD__.game;
    g.ui.showScreen('none');
    const p = [...g.session.liveProps.values()].find((q: { kind: string }) => q.kind === 'plotStake');
    g.interact(p);
    const t = window.__DD__.progression.tree();
    return { screen: window.__DD__.state().screen, focus: t.focus, select: t.select };
  });
  expect(stake).toEqual({ screen: 'crafting', focus: 'camp', select: 'relicShelf' });
  expect(errors).toEqual([]);
});

test('the runes: seven granted, the eighth taken, the shelf shows 8/8, the stone wakes, the finale', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  const sites = await page.evaluate(() => window.__DD__.progression.runeSites());
  expect(sites.length).toBe(7);

  // Seven runes (the RUNE_ITEMS order puts the Chasm last).
  expect(await page.evaluate(() => window.__DD__.progression.grantRunes(7))).toBe(7);
  let s = await page.evaluate(() => window.__DD__.progression.state());
  expect(s.awake).toBe(false);
  expect(s.stations).toContain('relicShelf');

  // The eighth from its stone: down the rope, open its Ironbound niche, take it.
  const chasm = sites.find((r: { item: string }) => r.item === 'runeChasm');
  expect(chasm.gate).toBe('tier3+rope');
  await page.evaluate((r) => {
    const D = window.__DD__;
    for (const [x, y, z] of r.seal) D.setBlock(x, y, z, 0);
    const p = D.standableNear(r.x, r.y, r.z - 1);
    D.teleport(p![0], p![1], p![2]);
  }, chasm);
  await page.waitForFunction((id) => {
    const D = window.__DD__;
    return D.state().mode === 'playing' && !!D.game.session.liveProps.get(id);
  }, chasm.prop, { timeout: LOADED_CEILING_MS });
  await page.evaluate((id) => {
    const g = window.__DD__.game;
    g.interact(g.session.liveProps.get(id));
  }, chasm.prop);
  await page.waitForFunction(() => window.__DD__.events('relic:found').some((e) => e.payload.count === 8), null, { timeout: LOADED_CEILING_MS });
  s = await page.evaluate(() => window.__DD__.progression.state());
  expect(s.runes.length).toBe(8);
  expect(s.runeMask).toBe(255);
  expect(s.awake).toBe(true);
  // The shelf shows all eight sockets lit, and the Journal agrees.
  const shelf = await page.evaluate(() => window.__DD__.game.session.liveProps.get('station:relicShelf')?.modelVariant ?? null);
  expect(shelf).toBe(255);
  const journal = await page.evaluate(() => window.__DD__.progression.journal());
  expect(journal.runesFound).toBe(8);

  // Walk to the black stone: within 4 m of its faces it answers, then the end card's event.
  const portal = await page.evaluate(() => window.__DD__.landmarks().stonePortal);
  const p = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z + 2), portal);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), p!);
  await page.waitForFunction(() => window.__DD__.events('discovery').some((e) => e.payload.id === 'answer'), null, { timeout: LOADED_CEILING_MS });
  await page.waitForFunction(() => window.__DD__.events('finale:reached').length === 1, null, { timeout: LOADED_CEILING_MS });
  expect((await persisted(page)).progression.finale).toBe(true);
  // Once only.
  await page.evaluate(() => window.__DD__.step(30));
  expect(await page.evaluate(() => window.__DD__.events('finale:reached').length)).toBe(1);
  expect(errors).toEqual([]);
});

test('the Survey Table: rumours from the living rock and the bloom, a compass target, the report after a night', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  await page.evaluate(() => window.__DD__.progression.grantNode('surveyTable'));
  const survey = await page.evaluate(() => window.__DD__.progression.survey());
  expect(survey.built).toBe(true);
  const ids = survey.rumours.map((r: { id: string }) => r.id);
  expect(ids).toEqual(expect.arrayContaining(['haldenFace', 'riftWalls', 'bloom_e0']));
  for (const r of survey.rumours) {
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.areaName.length).toBeGreaterThan(0);
    // The rift floor (and anything else past the seal) has no walk yet, so no distance (and none
    // shown); the Halden Face and the bloom are walkable from camp.
    if (r.id === 'riftWalls') expect(r.distance).toBeNull();
    else if (r.id === 'haldenFace' || r.id === 'bloom_e0') expect(r.distance).toBeGreaterThan(0);
    else expect(r.distance === null || r.distance > 0).toBe(true);
  }
  // Pick the Halden Face: the Next line leads there (after the tutorial's first steps).
  await page.evaluate(() => window.__DD__.progression.setTarget('haldenFace'));
  expect((await page.evaluate(() => window.__DD__.progression.state())).compassTarget).toBe('haldenFace');
  expect((await page.evaluate(() => window.__DD__.progression.survey())).rumours.find((r: { id: string }) => r.id === 'haldenFace').target).toBe(true);

  // A trip into the Hollow and back: the deep breathes, the report carries the night and a Next card.
  const hall = await page.evaluate(() => window.__DD__.standableNear(104, 42, 110));
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x, y, z), hall!);
  await page.waitForFunction(() => window.__DD__.state().trip !== null && window.__DD__.state().trip.deepest >= 100, null, { timeout: LOADED_CEILING_MS });
  const spawn = await page.evaluate(() => window.__DD__.game.session.layout.spawn);
  await page.evaluate((s) => window.__DD__.teleport(s.x, s.y, s.z), spawn);
  await page.waitForFunction(() => window.__DD__.events('expedition:ended').length > 0, null, { timeout: LOADED_CEILING_MS });
  const report = await page.evaluate(() => window.__DD__.loop.report());
  expect(report.overnight).not.toBeNull();
  expect(report.overnight.day).toBe(1);
  expect(report.overnight.rumours.length).toBeGreaterThanOrEqual(3);
  expect(report.next).not.toBeNull();
  expect(typeof report.craftableNow).toBe('boolean');
  expect(errors).toEqual([]);
});
