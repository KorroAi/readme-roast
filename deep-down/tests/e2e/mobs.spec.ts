import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { LOADED_CEILING_MS } from './dd';

// The creatures of the deep, round 3 (MOBS), in the strata world with real touches at 390 x 844:
// - a fight in three biomes (Amber Hollows, Flooded Grottoes, Frost Caverns): every blow told before it
//   lands, the explorer strikes back with taps and wins, the loot flies to the bag;
// - a guardian beaten end to end: asleep in its lair, it wakes when the explorer walks in, its bar on
//   the HUD, telegraphed patterns, its second phase, its fall, and the Heart Shard paid;
// - thirty-six creatures of twelve kinds in view within the draw-call budget (instancing);
// - the companion tamed with three glowcaps, an elite pack leader, the tutorial's first fight.

test.use({ viewport: { width: 390, height: 844 } });
test.describe.configure({ timeout: 900_000 });

type MobView = { id: number; kind: string; state: string; hp: number | null; maxHp: number | null; x: number; y: number; z: number; foot: { x: number; y: number; z: number }; radius: number; fade: number; phase: number; pattern: string | null; affixes: string[]; elite: boolean; tame?: boolean };
type Ev = { type: string; payload: any };

const SEED = 7;

/** Console errors of the page (a shader that fails to compile prints one: its material never draws). */
const consoleErrors = new WeakMap<Page, string[]>();

function shaderErrors(page: Page): string[] {
  return (consoleErrors.get(page) ?? []).filter((e) => /Shader Error|WebGLProgram|redefinition|VALIDATE_STATUS|compile/i.test(e));
}

async function boot(page: Page): Promise<void> {
  const errs: string[] = [];
  consoleErrors.set(page, errs);
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text());
  });
  page.on('pageerror', (e) => errs.push(e.message));
  // (catchup: game time keeps pace with the wall clock under SwiftShader's ~1 frame/s, UI's 21:29.)
  await page.goto('/index.html?gen=strata&catchup=6');
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: LOADED_CEILING_MS, polling: 250 });
  await page.evaluate(async (seed) => {
    await window.__DD__.game.newGame(seed);
  }, SEED);
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: LOADED_CEILING_MS, polling: 250 });
  await page.evaluate(() => {
    const dd = window.__DD__ as any;
    dd.game.quests?.skipTutorial?.();
    dd.mobs.auto(false);
    dd.mobs.clear();
  });
}

/**
 * Into a biome (switching stratum if needed), out of the camp, the chunks round the explorer meshed.
 * WORLD's goto can land in a guardian's lair (its first cavern), a lake or a cramped spot: then on to
 * open, dry floor of the same biome out of every lair with room ahead, so a fight there is the
 * creature's alone.
 */
async function goBiome(page: Page, biome: string): Promise<void> {
  const at = await page.evaluate((b) => (window.__DD__ as any).goto(b), biome);
  expect(at, `a spot in ${biome}`).not.toBeNull();
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: LOADED_CEILING_MS, polling: 250 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const dd = window.__DD__ as any;
    dd.mobs.auto(false);
    dd.step(4);
    // A stage: open, dry, nearly flat floor 3-8 m ahead, out of every lair (else at least dry ground).
    if (!dd.mobs.stage(6, 3, 8, 40)) dd.mobs.dryGround();
    dd.mobs.clear();
    dd.step(10);
  });
  expect(await page.evaluate(() => (window.__DD__ as any).biomeHere())).toBe(biome);
}

async function arm(page: Page, weapon: string): Promise<void> {
  await page.evaluate((w) => {
    const loop = (window.__DD__ as any).game.loop;
    loop.pay({ [w]: 1 }, 'e2e');
    loop.equip(w);
  }, weapon);
}

const mob = (page: Page, id: number) => page.evaluate((i) => (window.__DD__ as any).mobs.get(i) as MobView | null, id);
const events = (page: Page, type?: string) => page.evaluate((t) => (window.__DD__ as any).mobs.events(t) as Ev[], type);

/** Where a world point is on screen (CSS px), or null behind the camera. */
async function screenOf(page: Page, p: [number, number, number]): Promise<{ x: number; y: number } | null> {
  return page.evaluate(([x, y, z]) => {
    const cam = window.__DD__.game.cameraRig.camera;
    cam.updateMatrixWorld();
    const v = cam.position.clone().set(x, y, z).project(cam);
    if (v.z > 1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) return null;
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  }, p);
}

/** Stand `dist` m from a creature (on the floor between it and the explorer) and look at it. */
async function closeIn(page: Page, m: MobView, dist: number): Promise<void> {
  await page.evaluate(([mx, my, mz, d]) => {
    const dd = window.__DD__ as any;
    const p = dd.game.player;
    const dx = p.x - mx;
    const dz = p.z - mz;
    const l = Math.max(0.01, Math.hypot(dx, dz));
    if (l > d + 0.6) {
      const s = dd.standableNear(Math.floor(mx + (dx / l) * d), Math.floor(my), Math.floor(mz + (dz / l) * d));
      if (s) dd.teleport(s[0] + 0.5, s[1], s[2] + 0.5);
    }
  }, [m.x, m.foot.y > 0 ? m.foot.y : m.y - 1.6, m.z, dist] as const);
  await page.evaluate(([x, y, z]) => (window.__DD__ as any).mobs.lookAt(x, y, z, 0), [m.x, m.y, m.z] as const);
}

/** Tap a creature on screen until it dies (re-aiming each time), within `seconds`. @returns the taps used. */
async function tapUntilDead(page: Page, touch: Touch, id: number, maxTaps: number, reach = 1.9, only?: () => Promise<boolean>, seconds = 150): Promise<number> {
  let taps = 0;
  const t0 = Date.now();
  while (taps < maxTaps && Date.now() - t0 < seconds * 1000) {
    const m = await mob(page, id);
    if (!m || m.state === 'dying') break;
    if (only && !(await only())) {
      await page.waitForTimeout(120);
      continue;
    }
    await closeIn(page, m, reach);
    const pt = await screenOf(page, [m.x, m.y, m.z]);
    if (!pt) {
      await page.waitForTimeout(100);
      continue;
    }
    await touch.tap({ x: Math.round(pt.x), y: Math.round(pt.y) });
    taps++;
    await page.waitForTimeout(240);
  }
  return taps;
}

test('a fight in three biomes (real taps): every blow is told first, the explorer wins, the loot flies to the bag', async ({ page }) => {
  await boot(page);
  const touch = await Touch.attach(page);
  await arm(page, 'sword');
  const fights: Array<[string, string]> = [
    ['amberHollows', 'gritBoar'],
    ['floodedGrottoes', 'clatterclaw'],
    ['frostCaverns', 'icefang'],
  ];
  for (const [biome, kind] of fights) {
    await goBiome(page, biome);
    // Blows land as events and sounds, but the explorer does not die during the test.
    await page.evaluate(() => {
      const dd = window.__DD__ as any;
      dd.mobs.harmless(true);
      dd.mobs.clearEvents();
    });
    const id = await page.evaluate(([k]) => {
      const dd = window.__DD__ as any;
      const f = dd.mobs.floorAhead(3, 7);
      return f ? dd.mobs.spawn(k, f[0], f[1], f[2], { asleep: false }) : dd.mobs.spawnAhead(k, 4, 0, { asleep: false });
    }, [kind] as const);
    expect(id, `${kind} stands in ${biome}`).not.toBeNull();
    // Let it come at the explorer (its first blows, told), watching for its marker on the ground (a
    // charger's lane, a brute's slam circle) and the telegraph decals actually drawn while it is down.
    let marked = false;
    let decalsDrawn = false;
    await page.waitForFunction((i) => (window.__DD__ as any).mobs.events('mob:attack').some((e: Ev) => e.payload.id === i), id, { timeout: 60_000, polling: 250 });
    for (let k = 0; k < 40 && !(marked && decalsDrawn); k++) {
      const seen = await page.evaluate((i) => {
        const dd = window.__DD__ as any;
        const own = dd.mobs.markers().some((mk: { owner: number }) => mk.owner === i);
        const mesh = dd.game.mobs.group.getObjectByName('mobTelegraphs');
        return { own, drawn: own && !!mesh?.visible && mesh.geometry.instanceCount > 0 };
      }, id);
      marked ||= seen.own;
      decalsDrawn ||= seen.drawn;
      if (!(marked && decalsDrawn)) await page.waitForTimeout(250);
    }
    expect(marked, `${kind}: its blow marked on the ground`).toBe(true);
    expect(decalsDrawn, `${kind}: the telegraph decals drawn`).toBe(true);
    const dropsBefore = await page.evaluate(() => (window.__DD__ as any).game.drops.count as number);
    const taps = await tapUntilDead(page, touch, id as number, 40);
    await page.waitForFunction((i) => (window.__DD__ as any).mobs.events('mob:died').some((e: Ev) => e.payload.id === i), id, { timeout: 30_000, polling: 250 });
    // (Its loot is rolled: most kinds always leave something, some by chance, e.g. the Icefang 9 in 10.)
    const dropped = (await page.evaluate(() => (window.__DD__ as any).game.drops.count as number)) > dropsBefore || (await events(page, 'item:picked')).length > 0;
    const log = await events(page);
    const own = log.filter((e) => e.payload?.id === id);
    const firstTell = own.findIndex((e) => e.type === 'mob:telegraph');
    const firstBlow = own.findIndex((e) => e.type === 'mob:attack');
    expect(firstTell, `${kind}: a wind-up`).toBeGreaterThanOrEqual(0);
    expect(firstTell, `${kind}: told before its first blow`).toBeLessThan(firstBlow);
    expect(own.filter((e) => e.type === 'mob:hit').length, `${kind}: struck by taps`).toBeGreaterThan(0);
    expect(log.some((e) => e.type === 'mob:sfx'), `${kind}: heard`).toBe(true);
    // The loot flies to the bag (when it left any).
    const picked = dropped ? await page.waitForFunction(() => (window.__DD__ as any).mobs.events('item:picked').length > 0, null, { timeout: 20_000, polling: 250 }).then(() => true, () => false) : null;
    console.log(`[mobs] ${biome}: ${kind} beaten in ${taps} taps, ${own.filter((e) => e.type === 'mob:attack').length} blows at the explorer, loot ${picked === null ? 'none rolled' : picked}`);
    if (dropped) expect(picked, `${kind}: its loot reached the bag`).toBe(true);
  }
  expect(shaderErrors(page), 'every creature shader compiled').toEqual([]);
});

test('a guardian beaten end to end with real taps: asleep in its lair, its bar, told patterns struck in its open guard, phase two, its fall, the shard paid', async ({ page }) => {
  await boot(page);
  const touch = await Touch.attach(page);
  await arm(page, 'greatAxe');
  // The strata world (WORLD's hooks): stratum I, then into the Amber Hollows.
  expect(await page.evaluate(() => (window.__DD__ as any).stratum(1))).toBe(1);
  await goBiome(page, 'amberHollows');
  const lair = await page.evaluate(() => (window.__DD__ as any).strata().lairs.find((l: any) => l.biome === 'amberHollows'));
  expect(lair, 'the Amber Hollows lair').toBeTruthy();
  expect(await page.evaluate(() => (window.__DD__ as any).goto('lair', 'amberHollows'))).not.toBeNull();
  await page.waitForTimeout(1200);
  // Back out to the edge of the lair's reach (beyond its arena), so it is found asleep.
  await page.evaluate((l) => {
    const dd = window.__DD__ as any;
    dd.mobs.harmless(true);
    dd.mobs.clear();
    const e = l.entrance ?? l.centre;
    const dx = e[0] - l.centre[0];
    const dz = e[2] - l.centre[2];
    const len = Math.max(0.01, Math.hypot(dx, dz));
    for (let k = 0; k < 10; k++) {
      const d = l.radius + 14 + k;
      const s = dd.standableNear(Math.floor(l.centre[0] + (dx / len) * d), Math.floor(e[1]), Math.floor(l.centre[2] + (dz / len) * d));
      if (s) {
        dd.teleport(s[0] + 0.5, s[1], s[2] + 0.5);
        break;
      }
    }
    dd.mobs.clearEvents();
    dd.step(20);
  }, lair);
  // Asleep at its spawn once the explorer is near the arena.
  await page.waitForFunction(() => (window.__DD__ as any).mobs.list().some((m: MobView) => m.kind === 'amberMatriarch'), null, { timeout: 30_000, polling: 250 });
  const g0 = (await page.evaluate(() => (window.__DD__ as any).mobs.list().find((m: MobView) => m.kind === 'amberMatriarch'))) as MobView;
  expect(g0.state).toBe('sleep');
  expect(await page.locator('.dd-guardian.on').count(), 'no bar while it sleeps').toBe(0);
  // Walk in: it wakes.
  await closeIn(page, g0, 7);
  await page.waitForFunction(() => (window.__DD__ as any).mobs.events('mob:guardianAwake').length > 0, null, { timeout: 30_000, polling: 250 });
  await expect(page.locator('.dd-guardian.on .dd-guardian-name')).toHaveText(/Amber Matriarch/, { timeout: 15_000 });
  // It fights: told patterns (a wind-up with a marker on the ground).
  await page.waitForFunction(() => (window.__DD__ as any).mobs.events('mob:telegraph').length >= 2, null, { timeout: 60_000, polling: 250 });
  const id = g0.id;
  // Its open guard is told (the window's share runs 1 → 0 on the HUD's state).
  await page.waitForFunction(() => ((window.__DD__ as any).mobs.guardian()?.window ?? 0) > 0.5, null, { timeout: 60_000, polling: 100 });
  // Strike only while its guard is open (after each attack), with real taps, until it falls.
  const open = async () => {
    const m = await mob(page, id);
    return !!m && (m.state === 'recoil' || m.state === 'stunned');
  };
  // Through the fight, how near the explorer ever stands to its centre (QA 22:10: the lens ended up
  // inside its body; now the explorer is kept out of its bulk, ~2.1 m round the Matriarch).
  await page.evaluate((i) => {
    const w = window as any;
    w.__mobMinD = 99;
    w.__mobIv = setInterval(() => {
      const m = w.__DD__.mobs.get(i);
      const p = w.__DD__.game.player;
      if (m && m.state !== 'dying') w.__mobMinD = Math.min(w.__mobMinD, Math.hypot(m.x - p.x, m.z - p.z));
    }, 40);
  }, id);
  const taps = await tapUntilDead(page, touch, id, 90, 2.6, open, 420);
  const nearest = await page.evaluate(() => {
    const w = window as any;
    clearInterval(w.__mobIv);
    return w.__mobMinD as number;
  });
  expect(nearest, 'the explorer never inside its body').toBeGreaterThan(1.4);
  await page.waitForFunction(() => (window.__DD__ as any).mobs.events('mob:guardianDefeated').length > 0, null, { timeout: 60_000, polling: 250 });
  const log = await events(page);
  const phases = log.filter((e) => e.type === 'mob:guardianPhase');
  const def = log.find((e) => e.type === 'mob:guardianDefeated')!;
  const hits = log.filter((e) => e.type === 'mob:hit' && e.payload.id === id);
  expect(phases.length, 'its second phase').toBeGreaterThan(0);
  expect(def.payload.shard).toBe('amberHollows');
  expect(hits.length, 'struck by taps').toBeGreaterThan(3);
  // Struck in its open guard: those blows found the weak spot.
  expect(hits.filter((e) => e.payload.weak).length, 'blows in its open guard').toBeGreaterThan(2);
  // No debug blow: every hit came from a tap (the weapon's swing).
  expect(log.filter((e) => e.type === 'weapon:hit' && e.payload.mob === id).length, 'every blow a swing').toBe(hits.length);
  // LOOP pays the shard on 'mob:guardianDefeated' (its quest counts it, and its loot bundle).
  const shard = await page
    .waitForFunction(() => (window.__DD__ as any).game.quests.shards.has('amberHollows'), null, { timeout: 15_000, polling: 250 })
    .then(() => true, () => false);
  console.log(`[mobs] the Amber Matriarch beaten: ${taps} taps, ${phases.length} phase change(s), shard ${shard}, nearest the explorer stood ${nearest.toFixed(2)} m`);
  expect(shard, "LOOP's quest holds the Amber Hollows shard").toBe(true);
  // The bar goes.
  await expect(page.locator('.dd-guardian.on')).toHaveCount(0, { timeout: 15_000 });
});

test('thirty-six creatures of twelve kinds in view: one draw per kind, the frame within the 150-call budget', async ({ page }) => {
  await boot(page);
  await goBiome(page, 'mushroomForest');
  const kinds = ['amberTick', 'gritBoar', 'sporeling', 'capSpitter', 'thornback', 'spitNewt', 'shardling', 'prismBat', 'rustMite', 'icefang', 'glimmerkin', 'mudpup'];
  // A block of 36 in front of the explorer (6 across, 6 deep), all in the portrait view.
  const stats = await page.evaluate((ks) => {
    const dd = window.__DD__ as any;
    const g = dd.game;
    const yaw = g.cameraRig.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const p = g.player;
    const ids: number[] = [];
    for (let i = 0; i < 36; i++) {
      const k = ks[i % ks.length];
      const sp = dd.mobs.species(k);
      const col = i % 6;
      const row = Math.floor(i / 6);
      const d = 4 + row * 1.2;
      const x = p.x + fx * d + rx * (col - 2.5) * (0.35 + row * 0.12);
      const z = p.z + fz * d + rz * (col - 2.5) * (0.35 + row * 0.12);
      const id = dd.mobs.spawn(k, x, p.y + (sp.locomotion === 'fly' ? 1.6 : 0.2), z, { asleep: false });
      if (id !== null) ids.push(id);
    }
    dd.mobs.freeze(true);
    for (const id of ids) dd.mobs.setAnim(id, { face: true });
    dd.step(6);
    return { ids: ids.length, mobs: dd.mobs.drawStats() };
  }, kinds);
  await page.waitForTimeout(800);
  const frame = await page.evaluate(() => {
    const dd = window.__DD__ as any;
    dd.step(2);
    return { calls: dd.report().render.calls, triangles: dd.report().render.triangles, mobs: dd.mobs.drawStats() };
  });
  console.log(`[mobs] ${stats.ids} creatures placed, mobs ${JSON.stringify(frame.mobs)}, frame ${frame.calls} calls ${frame.triangles} triangles`);
  expect(stats.ids).toBeGreaterThanOrEqual(30);
  expect(frame.mobs.drawn).toBeGreaterThanOrEqual(24);
  expect(frame.mobs.calls).toBeLessThanOrEqual(kinds.length + 4);
  expect(frame.calls).toBeLessThanOrEqual(150);
});

test('the companion: three glowcaps tame a Lampling (real taps), it follows; an elite leads a pack; the tutorial brings its first fight', async ({ page }) => {
  await boot(page);
  const touch = await Touch.attach(page);
  await goBiome(page, 'mushroomForest');
  await page.evaluate(() => {
    const dd = window.__DD__ as any;
    dd.give('glowcap', 4);
    dd.mobs.clearEvents();
  });
  const lid = await page.evaluate(() => (window.__DD__ as any).mobs.spawnAhead('lampling', 2.2, 1.4));
  expect(lid, 'a wild lampling ahead').not.toBeNull();
  // Up to 14 tries (under load a tap can land while it flutters off its spot), each re-aimed.
  for (let i = 0; i < 14; i++) {
    const tamed = await page.evaluate(() => (window.__DD__ as any).mobs.events('companion:tamed').length > 0);
    if (tamed) break;
    const m = await mob(page, lid as number);
    if (!m) break;
    // (A wild one flutters about: step back within a hand's reach of it first.)
    await closeIn(page, m, 1.8);
    const pt = await screenOf(page, [m.x, m.y, m.z]);
    if (pt) await touch.tap({ x: Math.round(pt.x), y: Math.round(pt.y) });
    await page.waitForTimeout(700);
  }
  const trust = await events(page, 'companion:trust');
  expect(trust.length, 'fed glowcaps').toBeGreaterThanOrEqual(2);
  await page.waitForFunction(() => (window.__DD__ as any).mobs.events('companion:tamed').length > 0, null, { timeout: 10_000, polling: 200 });
  const view = await page.evaluate(() => (window.__DD__ as any).game.mobs.companion());
  expect(view).toMatchObject({ kind: 'lampling', level: 1 });
  // Its own moving warm light (VIS lights the rock round it from this).
  const light = await page.evaluate(() => (window.__DD__ as any).mobs.companionLight());
  expect(light?.glow ?? 0, 'the companion glows').toBeGreaterThan(0.3);
  // LOOP's items: one friend is enough for a lure; a Glow Treat is experience.
  const items = await page.evaluate(() => {
    const g = (window.__DD__ as any).game;
    const p = g.player;
    const before = g.mobs.companion().xp;
    return { has: g.mobs.hasCompanion(), lure: g.mobs.lureLampling(p.x, p.y, p.z, 10), fed: g.mobs.feedCompanion(1, 30), gained: g.mobs.companion().xp - before };
  });
  expect(items).toEqual({ has: true, lure: false, fed: true, gained: 3 });
  expect(await page.evaluate(() => (window.__DD__ as any).game.backpack.count('glowcap'))).toBe(1);
  // It follows the explorer a few metres on.
  await page.evaluate(() => {
    const dd = window.__DD__ as any;
    const p = dd.game.player;
    const s = dd.standableNear(Math.floor(p.x + 4), Math.floor(p.y), Math.floor(p.z + 4));
    if (s) dd.teleport(s[0] + 0.5, s[1], s[2] + 0.5);
    // 3 s of game time, undrawn (a loaded machine's frames would stretch it).
    for (let k = 0; k < 90; k++) dd.game.step(1 / 30, false);
  });
  const near = await page.evaluate(() => {
    const dd = window.__DD__ as any;
    const p = dd.game.player;
    const c = dd.mobs.list().find((m: MobView) => m.kind === 'lampling');
    return c ? Math.hypot(c.x - p.x, c.z - p.z) : 99;
  });
  expect(near, 'the companion keeps up').toBeLessThan(5);
  // It is saved with the bestiary.
  expect(await page.evaluate(() => (window.__DD__ as any).game.mobs.serialise().companion?.kind)).toBe('lampling');

  // An elite: its name and twist on first sight.
  await page.evaluate(() => (window.__DD__ as any).mobs.clearEvents());
  const eid = await page.evaluate(() => {
    const dd = window.__DD__ as any;
    const id = dd.mobs.spawnAhead('capSpitter', 5, 0, { asleep: false });
    if (id !== null) dd.mobs.elite(id, ['radiant']);
    return id;
  });
  expect(eid).not.toBeNull();
  await page.waitForFunction(() => (window.__DD__ as any).mobs.events('mob:elite').length > 0, null, { timeout: 20_000, polling: 250 });
  const el = (await events(page, 'mob:elite'))[0];
  expect(el.payload.name).toBe('Radiant Cap Spitter');

  // The tutorial's first fight: a soft tick comes into view.
  await page.evaluate(() => {
    const dd = window.__DD__ as any;
    dd.mobs.clear();
    dd.mobs.clearEvents();
    dd.game.bus.emit('tutorial:step', { id: 'fight', highlight: 'action', line: 'fight' });
  });
  await page.waitForFunction(() => (window.__DD__ as any).mobs.list().some((m: MobView) => m.kind === 'amberTick'), null, { timeout: 15_000, polling: 250 });
  const tick = await page.evaluate(() => {
    const dd = window.__DD__ as any;
    const p = dd.game.player;
    const m = dd.mobs.list().find((x: MobView) => x.kind === 'amberTick');
    return { d: Math.hypot(m.x - p.x, m.z - p.z), hp: m.hp };
  });
  expect(tick.hp).toBe(3);
  expect(tick.d).toBeGreaterThan(7);
  expect(tick.d).toBeLessThan(19);
});
