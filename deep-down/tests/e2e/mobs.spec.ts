import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { LOADED_CEILING_MS, untilGame } from './dd';

// The creatures of the deep (round 2, MOBS), with real touches at 390 x 844: catch a Glimmerkin,
// harvest a Shellback, fight off crawlers with the machete, shoot a wisp with the sling, defeat the
// Sentinel, survive a Stalker by raising the flame, and the black-out and recovery after dying to
// monsters. DD_MOB_SHOTS=1 also captures every creature at three sizes in frame (artifacts/mobs).

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ timeout: 900_000 });

type MobView = { id: number; kind: string; state: string; hp: number | null; x: number; y: number; z: number; foot: { x: number; y: number; z: number }; radius: number; halfHeight: number; tappable: boolean; crystals: number; open: number; fade: number };

async function waitMode(page: Page, mode: string) {
  await page.waitForFunction((m) => window.__DD__?.ready && window.__DD__.state().mode === m, mode, { timeout: LOADED_CEILING_MS, polling: 200 });
}

async function newGame(page: Page) {
  await page.goto('/index.html');
  await waitMode(page, 'menu');
  await page.getByRole('button', { name: /New Expedition/i }).click();
  await waitMode(page, 'playing');
  // The tests place their own creatures.
  await page.evaluate(() => {
    const m = (window.__DD__ as any).mobs;
    m.auto(false);
    m.clear();
  });
}

const mobs = (page: Page) => page.evaluate(() => (window.__DD__ as any).mobs.list() as MobView[]);
const mob = (page: Page, id: number) => page.evaluate((i) => (window.__DD__ as any).mobs.get(i) as MobView | null, id);

/** Stand somewhere deep and dark with open floor ahead (the Hollow's floor by the old camp). */
async function goDeep(page: Page, key = 'oldCamp', yaw = 0) {
  const lm = await page.evaluate(() => window.__DD__.landmarks());
  const p = lm[key] ?? lm.stairsBottom;
  const s = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), p as [number, number, number]);
  expect(s, `a standable cell near ${key}`).not.toBeNull();
  await page.evaluate(([x, y, z, w]) => window.__DD__.teleport(x + 0.5, y, z + 0.5, w), [...s!, yaw] as [number, number, number, number]);
  await page.evaluate((w) => window.__DD__.look(w, -0.08), yaw);
  await page.evaluate(() => window.__DD__.step(10));
}

/** Find a heading with open floor 3-9 m ahead, then return that floor point. */
async function floorAhead(page: Page, min = 3, max = 9): Promise<[number, number, number]> {
  for (let k = 0; k < 16; k++) {
    const f = await page.evaluate(([a, b]) => (window.__DD__ as any).mobs.floorAhead(a, b), [min, max] as const);
    if (f) return f as [number, number, number];
    const yaw = await page.evaluate(() => window.__DD__.game.cameraRig.yaw as number);
    await page.evaluate((w) => window.__DD__.look(w, -0.08), yaw + Math.PI / 8);
  }
  throw new Error('no open floor ahead');
}

/** Where a world point is on screen (CSS px), or null behind the camera. */
async function screenOf(page: Page, p: [number, number, number]): Promise<{ x: number; y: number } | null> {
  return page.evaluate(([x, y, z]) => {
    const cam = window.__DD__.game.cameraRig.camera;
    cam.updateMatrixWorld();
    const v = cam.position.clone().set(x, y, z).project(cam);
    if (v.z > 1) return null;
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }, p);
}

const ENV: Record<string, string | undefined> = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `artifacts/mobs/${name}.png` });
}

// ---------------------------------------------------------------------------------------

test('captures: every creature at three sizes in frame', async ({ page }) => {
  test.skip(!ENV.DD_MOB_SHOTS, 'captures only with DD_MOB_SHOTS=1');
  await newGame(page);
  await page.evaluate(() => (window.__DD__ as any).mobs.freeze(true));
  // kind, centre height above the floor (fliers), distances near / mid / far, the awake pose.
  const kinds: Array<[string, number, [number, number, number], Record<string, number>]> = [
    ['crawler', 0, [1.7, 3.6, 7], { strike: 0.8, open: 0 }],
    ['gnasher', 0, [2.3, 4.5, 8], { open: 0.9 }],
    ['wisp', 1.3, [2.4, 4.5, 8], {}],
    ['stalker', 0, [3, 5.5, 9], { strike: 0.35, alert: 1 }],
    ['sentinel', 0, [4, 6.5, 11], { open: 1, glow: 1 }],
    ['glimmerkin', 0, [1.2, 2.8, 5.5], {}],
    ['shellback', 0, [2.6, 4.6, 8], {}],
    ['jelly', 2.0, [2.6, 4.6, 8], {}],
    ['lampling', 1.5, [0.9, 2, 4.5], {}],
    ['burrower', 0, [1.2, 2.8, 5.5], {}],
    ['moth', 1.5, [0.7, 1.6, 3.5], {}],
  ];
  const only = ENV.DD_MOB_KINDS ? ENV.DD_MOB_KINDS.split(',') : null;
  for (const [kind, up, dists, anim] of kinds) {
    if (only && !only.includes(kind)) continue;
    await goDeep(page, 'oldCamp', 0.6);
    await page.evaluate(() => (window.__DD__ as any).mobs.clear());
    const ids: number[] = [];
    // Three of a kind, near (left), mid (centre), far (right): three sizes in one frame.
    const yaw0 = await page.evaluate(() => window.__DD__.game.cameraRig.yaw as number);
    for (let i = 0; i < 3; i++) {
      await page.evaluate((w) => window.__DD__.look(w, -0.08), yaw0 + (1 - i) * 0.32);
      const f = await floorAhead(page, dists[i], dists[i] + 2.5);
      const id = await page.evaluate(([k, x, y, z]) => (window.__DD__ as any).mobs.spawn(k, x, y, z, { asleep: false }), [kind, f[0], f[1] + up, f[2]] as const);
      if (id !== null) ids.push(id as number);
    }
    await page.evaluate((w) => window.__DD__.look(w, -0.08), yaw0);
    for (const id of ids) await page.evaluate(([m, a]) => (window.__DD__ as any).mobs.setAnim(m, { ...a, face: true }), [id, anim] as const);
    await page.evaluate(() => window.__DD__.step(8, 1 / 30));
    const mid = ids.length > 1 ? await mob(page, ids[1]) : ids.length ? await mob(page, ids[0]) : null;
    if (mid) await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.lookAt(x, y, z, -0.1), [mid.x, mid.y + (kind === 'stalker' || kind === 'sentinel' ? 0.3 : 0.2), mid.z] as const);
    await page.evaluate(() => window.__DD__.step(3, 1 / 30));
    await shot(page, `${kind}-sizes`);
    // A close look at the near one.
    const near = ids.length ? await mob(page, ids[0]) : null;
    if (near) {
      await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.lookAt(x, y, z, -0.05), [near.x, near.y + (kind === 'stalker' || kind === 'sentinel' ? 0.4 : 0), near.z] as const);
      await page.evaluate(() => window.__DD__.step(3, 1 / 30));
      await shot(page, `${kind}-close`);
    }
  }
  // The Deep Worm: a glimpse across the widest open view from the Hollow's floor.
  await goDeep(page, 'stairsBottom', 0);
  const v = await page.evaluate(() => (window.__DD__ as any).mobs.vista(28) as { point: [number, number, number]; free: number } | null);
  expect(v, 'an open view').not.toBeNull();
  const at = v!.point;
  await page.evaluate(() => (window.__DD__ as any).mobs.freeze(false));
  await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.lookAt(x, y, z), at);
  await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.spawn('worm', x, y, z), at);
  await page.evaluate(() => window.__DD__.step(56, 1 / 15));
  await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.lookAt(x, y, z), at);
  await page.evaluate(() => window.__DD__.step(2, 1 / 30));
  await shot(page, 'worm');
});

// ---------------------------------------------------------------------------------------
// The fights and the beings, with real touches.

const ev = (page: Page, type: string) => page.evaluate((t) => (window.__DD__ as any).mobs.events(t) as Array<{ type: string; payload: any }>, type);
const spawnAt = (page: Page, kind: string, p: [number, number, number], up = 0, opts: Record<string, unknown> = {}) =>
  page.evaluate(([k, x, y, z, o]) => (window.__DD__ as any).mobs.spawn(k, x, y, z, o) as number | null, [kind, p[0], p[1] + up, p[2], opts] as const);
const grant = (page: Page, node: string) => page.evaluate((n) => window.__DD__.progression.grantNode(n), node);
/** Plenty of health for the fights that test the weapons (the black-out has its own test). */
const tough = (page: Page, hp = 600) => page.evaluate((h) => {
  const g = window.__DD__.game;
  g.health = new g.health.constructor(h);
}, hp);
/** Burn the lantern down to a fraction of its oil (as the hours of a long trip would). */
const fuelTo = (page: Page, frac: number) => page.evaluate((f) => {
  const l = window.__DD__.game.lanternFuel;
  const burn = l.fuel - l.capacity * f;
  if (burn > 0) l.update(burn, false, { fuelSeconds: l.capacity, ember: 0.38 });
  return l.fraction as number;
}, frac);

/** Tap a creature on screen (looking at it first). */
async function tapOn(page: Page, touch: Touch, id: number): Promise<boolean> {
  const m = await mob(page, id);
  if (!m || m.state === 'dying') return false;
  await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.lookAt(x, y, z), [m.x, m.y, m.z] as const);
  await page.evaluate(() => window.__DD__.step(1));
  const at = await screenOf(page, [m.x, m.y, m.z]);
  if (!at) return false;
  await touch.tap({ x: Math.round(at.x), y: Math.round(at.y) });
  return true;
}

/** Keep tapping creatures of `kind` until none is left alive (or the game-time budget runs out). */
async function fightAll(page: Page, touch: Touch, kind: string, gameSeconds: number): Promise<boolean> {
  return untilGame(page, async () => {
    const live = (await mobs(page)).filter((m) => m.kind === kind && m.state !== 'dying');
    if (live.length === 0) return true;
    const p = await page.evaluate(() => window.__DD__.game.player);
    live.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    await tapOn(page, touch, live[0].id);
    await page.waitForTimeout(150);
    return false;
  }, gameSeconds, LOADED_CEILING_MS * 2.5, 50);
}

test('catch a Glimmerkin and harvest a Shellback', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  await goDeep(page);
  await page.evaluate(() => (window.__DD__ as any).mobs.clearEvents());
  const f = await floorAhead(page, 1.6, 2.4);
  const kin = await spawnAt(page, 'glimmerkin', f);
  expect(kin).not.toBeNull();
  await page.evaluate(() => window.__DD__.step(30));
  const caught = await untilGame(page, async () => {
    if ((await ev(page, 'mob:interact')).some((e) => e.payload.action === 'caught')) return true;
    await tapOn(page, touch, kin!);
    await page.waitForTimeout(300);
    return false;
  }, 30);
  expect(caught, 'the glimmerkin was caught by a tap').toBe(true);
  expect(await untilGame(page, async () => (await ev(page, 'item:picked')).length > 0, 10), 'its gems flew to the pack').toBe(true);

  // The Shellback: each tap lets one crystal go; they grow back.
  await page.evaluate(() => (window.__DD__ as any).mobs.clear());
  const g = await floorAhead(page, 2.2, 3.2);
  const shell = await spawnAt(page, 'shellback', g);
  expect(shell).not.toBeNull();
  await page.evaluate(() => window.__DD__.step(20));
  const before = (await mob(page, shell!))!.crystals;
  const harvested = await untilGame(page, async () => {
    if ((await ev(page, 'mob:interact')).some((e) => e.payload.action === 'harvested')) return true;
    await tapOn(page, touch, shell!);
    await page.waitForTimeout(300);
    return false;
  }, 30);
  expect(harvested, 'the shellback was harvested by a tap').toBe(true);
  expect((await mob(page, shell!))!.crystals).toBe(before - 1);
});

test('fight off crawlers with the machete', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  expect(await grant(page, 'machete')).toBe(true);
  await tough(page);
  await goDeep(page);
  // A low flame: they come close and strike (every blow telegraphed by a chitter and a rear-up).
  expect(await fuelTo(page, 0.15)).toBeLessThan(0.2);
  await page.evaluate(() => (window.__DD__ as any).mobs.clearEvents());
  for (let i = 0; i < 3; i++) {
    const f = await floorAhead(page, 2.5 + i, 3.5 + i);
    expect(await spawnAt(page, 'crawler', f)).not.toBeNull();
  }
  const won = await fightAll(page, touch, 'crawler', 120);
  if (!won) console.log('crawlers left', JSON.stringify(await mobs(page)), JSON.stringify((await ev(page, 'weapon:swing')).length));
  expect(won, 'every crawler fell').toBe(true);
  const hits = (await ev(page, 'weapon:hit')).filter((e) => e.payload.weapon === 'machete');
  expect(hits.length, 'machete blows landed').toBeGreaterThanOrEqual(3);
  expect((await ev(page, 'mob:died')).filter((e) => e.payload.kind === 'crawler').length).toBe(3);
  // Monsters that struck first telegraphed it.
  const tele = new Set((await ev(page, 'mob:telegraph')).map((e) => e.payload.id));
  for (const a of (await ev(page, 'mob:attack')).filter((e) => e.payload.landed)) expect(tele.has(a.payload.id)).toBe(true);
});

test('shoot a wisp with the Flare Sling', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  expect(await grant(page, 'sling')).toBe(true);
  await tough(page);
  await goDeep(page);
  await page.evaluate(() => (window.__DD__ as any).mobs.clearEvents());
  // One at the flame first: it drinks the oil and dims the light.
  const n = await floorAhead(page, 1.5, 2.5);
  const feeder = await spawnAt(page, 'wisp', n, 1.3);
  expect(feeder).not.toBeNull();
  const oil0 = await page.evaluate(() => window.__DD__.game.lanternFuel.fuel as number);
  const t0 = await page.evaluate(() => window.__DD__.game.playTime as number);
  expect(await untilGame(page, async () => (await mob(page, feeder!))?.state === 'attack', 15), 'the wisp feeds on the flame').toBe(true);
  await page.evaluate(() => window.__DD__.step(60, 1 / 20));
  const oil1 = await page.evaluate(() => window.__DD__.game.lanternFuel.fuel as number);
  const t1 = await page.evaluate(() => window.__DD__.game.playTime as number);
  expect(oil0 - oil1, 'it drank more oil than the time burnt').toBeGreaterThan((t1 - t0) * 1.5);
  expect(await page.evaluate(() => (window.__DD__ as any).mobs.dim() as number), 'the flame is dimmed').toBeLessThan(0.9);
  const f = await floorAhead(page, 7, 9);
  const w = await spawnAt(page, 'wisp', f, 1.5);
  expect(w).not.toBeNull();
  await page.evaluate(() => window.__DD__.step(20));
  const gone = await fightAll(page, touch, 'wisp', 90);
  if (!gone) console.log('wisps left', JSON.stringify(await mobs(page)), JSON.stringify((await ev(page, 'weapon:swing')).length));
  expect(gone, 'the wisp was dispersed').toBe(true);
  expect((await ev(page, 'weapon:swing')).some((e) => e.payload.weapon === 'sling' && e.payload.ranged), 'the sling was used').toBe(true);
  expect((await ev(page, 'mob:shot')).some((e) => e.payload.phase === 'hit'), 'a light shard struck').toBe(true);
});

test('defeat the Stone Sentinel that wakes when its relic is taken', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  expect(await grant(page, 'spear')).toBe(true);
  await tough(page, 900);
  const sites = await page.evaluate(() => (window.__DD__ as any).mobs.sentinelSites() as Array<{ relic: string; x: number; y: number; z: number }>);
  expect(sites.length, 'a guarded relic').toBeGreaterThan(0);
  const site = sites[0];
  const stand = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), [site.x + 5, site.y, site.z] as [number, number, number]);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), stand!);
  // It sleeps by the relic (placed, not bred).
  expect(await untilGame(page, async () => (await mobs(page)).some((m) => m.kind === 'sentinel' && m.state === 'sleep'), 10), 'the Sentinel sleeps by its relic').toBe(true);
  await page.evaluate(() => (window.__DD__ as any).mobs.clearEvents());
  // Take the relic: the Sentinel wakes.
  const took = await page.evaluate((relic) => {
    const g = window.__DD__.game;
    const id = Object.entries(g.features.relicItems as Record<string, string>).find(([, item]) => item === relic)?.[0];
    for (const spec of g.session.liveProps.values()) {
      if (spec.feature?.kind === 'relic' && spec.feature.id === id) {
        g.interact(spec);
        return true;
      }
    }
    return false;
  }, site.relic);
  expect(took, 'the relic was taken').toBe(true);
  const sentinel = (await mobs(page)).find((m) => m.kind === 'sentinel')!;
  expect(await untilGame(page, async () => ['wake', 'stalk', 'windup'].includes((await mob(page, sentinel.id))?.state ?? ''), 10), 'it woke').toBe(true);
  const down = await fightAll(page, touch, 'sentinel', 240);
  expect(down, 'the Sentinel fell').toBe(true);
  expect((await ev(page, 'mob:died')).some((e) => e.payload.kind === 'sentinel')).toBe(true);
  // Full blows only on its open core between sweeps: some strikes glanced off the stone.
  expect((await ev(page, 'mob:hit')).some((e) => e.payload.armoured)).toBe(true);
});

test('survive a Hollow Stalker by raising the flame', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  await goDeep(page);
  // A dim flame: it comes.
  expect(await fuelTo(page, 0.12)).toBeLessThan(0.15);
  const f = await floorAhead(page, 7, 9);
  const s = await spawnAt(page, 'stalker', f);
  expect(s).not.toBeNull();
  expect(await untilGame(page, async () => (await mob(page, s!))?.state === 'stalk', 15), 'it comes when the flame is dim').toBe(true);
  const hp0 = await page.evaluate(() => window.__DD__.state().health);
  // A tap on the dark (the far roof) raises the lantern: it flees the bright flame.
  await page.evaluate(() => {
    const rig = window.__DD__.game.cameraRig;
    rig.pitch = 0.9;
  });
  await page.evaluate(() => window.__DD__.step(2));
  await touch.tap({ x: 195, y: 160 });
  expect(await untilGame(page, async () => {
    const m = await mob(page, s!);
    return !m || m.state === 'flee';
  }, 6), 'the Stalker fled the raised flame').toBe(true);
  expect(await page.evaluate(() => window.__DD__.state().health)).toBe(hp0);
});

test('a black-out to monsters leaves the pack, the explorer wakes at camp and recovers it', async ({ page }) => {
  await newGame(page);
  const touch = await Touch.attach(page);
  await goDeep(page);
  await page.evaluate(() => window.__DD__.give('copperOre', 3));
  await page.evaluate(() => {
    const g = window.__DD__.game;
    g.health.damage(g.health.current - 4);
  });
  await page.evaluate(() => (window.__DD__ as any).mobs.clearEvents());
  // A Gnasher at the explorer's feet, its jaws already opening.
  const f = await floorAhead(page, 1.6, 2.4);
  const id = await spawnAt(page, 'gnasher', f);
  expect(id).not.toBeNull();
  await page.evaluate((m) => (window.__DD__ as any).mobs.setState(m, 'windup'), id);
  await waitMode(page, 'dead');
  expect((await ev(page, 'mob:attack')).some((e) => e.payload.landed)).toBe(true);
  const cache = await page.evaluate(() => window.__DD__.loop.cache());
  expect(cache, 'the pack was left as a cache').not.toBeNull();
  // Wake up at camp (a real touch on the death screen's button).
  const btn = page.getByRole('button', { name: /Wake Up at Camp/i });
  const box = await btn.boundingBox();
  expect(box).not.toBeNull();
  await touch.tap({ x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) });
  await waitMode(page, 'playing');
  expect(await page.evaluate(() => window.__DD__.state().atCamp)).toBe(true);
  expect((await mobs(page)).filter((m) => m.kind === 'gnasher').length).toBe(0);
  // Back down to the pack: it is recovered.
  const near = await page.evaluate(([x, y, z]) => window.__DD__.standableNear(x, y, z), [Math.floor(cache!.x), Math.floor(cache!.y), Math.floor(cache!.z)] as [number, number, number]);
  await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), near!);
  expect(await untilGame(page, async () => (await ev(page, 'cache:recovered')).length > 0, 10), 'the pack was recovered').toBe(true);
});
