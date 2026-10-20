import { expect, test, type Page } from '@playwright/test';
import { idleReady, until, waitFrames, waitMode } from './dd';
import { Touch } from './touch';

// The W2 loops through their UI with real touches (BUILD §3.3 E2E, port 4175): each widget completed through its
// targets (Catch, Mash, Strike, Sequence, Pick), a chest opened with its roll-up steps, a seal fight won with real taps
// and one failed then retried, a facet hand picked, the Board's contracts, a Feat toast and the Feats tab, the Codex.
// __DD__.idle only sets up the state (depth, gold, forced events) and reads results; every tap is a CDP touch.

async function boot(page: Page, errors: string[], depth = 0): Promise<Touch> {
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/index.html?seed=7');
  await waitMode(page, 'playing');
  await idleReady(page);
  await page.evaluate(() => window.__DD__.idle.settings({ quality: 'battery', renderScale: 0.5 }));
  await page.evaluate(() => window.__DD__.idle.skipTutorial());
  if (depth > 0) await page.evaluate((d) => window.__DD__.idle.setDepth(d), depth);
  await waitFrames(page, 4);
  return Touch.attach(page);
}

const widget = (page: Page) => page.evaluate(() => window.__DD__.idle.widget());
const events = (page: Page, name: string) => page.evaluate((n) => window.__DD__.idle.events(n), name);

/** Tap every live widget target (real touches) until the widget closes. @returns targets hit. */
async function tapTargets(page: Page, touch: Touch, kind: string, ms: number): Promise<number> {
  let hits = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const w = await widget(page);
    if (!w) break;
    if (w.kind !== kind) {
      await page.waitForTimeout(100);
      continue;
    }
    const tg = w.targets[0];
    if (tg) {
      await touch.tapAt(tg.x, tg.y);
      hits++;
    }
    await page.waitForTimeout(60);
  }
  return hits;
}

test('Catch: a Glimmerfall caught with real taps on its crystals', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 60);
  // A slower model clock so a software-rendered page sees each crystal long enough to tap it.
  await page.evaluate(() => window.__DD__.idle.timeScale(0.35));
  expect(await page.evaluate(() => window.__DD__.idle.forceEvent('glimmerfall'))).toBe(true);
  expect(await until(page, async () => (await widget(page))?.kind === 'catch', 20_000)).toBe(true);
  const hits = await tapTargets(page, touch, 'catch', 60_000);
  expect(hits).toBeGreaterThan(0);
  expect(await until(page, async () => (await events(page, 'event:end')).length > 0, 60_000)).toBe(true);
  const caught = (await events(page, 'event:hit')).filter((e) => e.payload.caught).length;
  console.log(`Catch: ${hits} taps on targets, ${caught} caught; result ${(await events(page, 'event:end'))[0].payload.result}`);
  expect(caught).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Strike: a geode stopped in the perfect zone with a real tap on the dial', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 130);
  await page.evaluate(() => window.__DD__.idle.timeScale(0.5));
  expect(await page.evaluate(() => window.__DD__.idle.forceEvent('geode'))).toBe(true);
  expect(await until(page, async () => (await widget(page))?.kind === 'strike', 20_000)).toBe(true);
  // The dial on screen (placed by its first frame).
  const dialAt = () =>
    page.evaluate(() => {
      const el = [...document.querySelectorAll('[data-hud="strike"]')].find((d) => !d.closest('.hide') && (d.parentElement as HTMLElement).style.transform !== '');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
  expect(await until(page, async () => !!(await dialAt()), 20_000)).toBe(true);
  const dial = (await dialAt())!;
  console.log(`Strike: dial at ${Math.round(dial.x)}, ${Math.round(dial.y)}`);
  /** The needle's distance to the perfect zone's centre, and whether it is heading there (the model's own sweep). */
  const needle = () =>
    page.evaluate(() => {
      const s = window.__DD__.idle.state();
      // An event's widget lives on the event; a seal's finisher in the list.
      const ew = s.event?.widget;
      const w = ew && ew.kind === 'strike' && !ew.done ? ew : s.widgets.find((x: { kind: string; done: boolean }) => x.kind === 'strike' && !x.done);
      if (!w) return null;
      const u = Math.max(0, s.time - w.needleStart) / w.period;
      const f = u - 2 * Math.floor(u / 2);
      const pos = f <= 1 ? f : 2 - f;
      const rising = f <= 1;
      return { d: Math.abs(pos - w.zone), toward: rising ? pos < w.zone : pos > w.zone, perfect: w.perfect as number };
    });
  let perfect = 0;
  for (let n = 0; n < 3; n++) {
    // A software-rendered page draws about one frame a second here (the frame's dt is clamped at 0.1 s), so a model
    // step at full speed jumps the needle past the 0.08 zone. Slow the clock as the needle closes in (0.5 → 0.1: one
    // frame then moves it ~0.011 of the arc), tap once it is inside, then let the clock run again. The sweep stays
    // the model's; the tap is a real touch on the dial.
    const near = await until(page, async () => {
      const v = await needle();
      return !v || (v.toward && v.d < 0.22);
    }, 60_000, 20);
    if (!near || !(await needle())) break;
    await page.evaluate(() => window.__DD__.idle.timeScale(0.1));
    const inside = await until(page, async () => {
      const v = await needle();
      return !v || v.d < v.perfect * 0.4 || !v.toward;
    }, 90_000, 20);
    const v = await needle();
    if (!inside || !v) break;
    if (v.d < v.perfect * 0.5) {
      await touch.tapAt(dial.x, dial.y);
      await waitFrames(page, 2);
      perfect = (await events(page, 'widget:input')).filter((e) => e.payload.grade === 'perfect').length;
    }
    await page.evaluate(() => window.__DD__.idle.timeScale(0.5));
    if (!(await widget(page)) || perfect > 0) break;
  }
  const inputs = await events(page, 'widget:input');
  console.log(`Strike: ${inputs.map((e) => e.payload.grade).join(', ')}`);
  expect(inputs.length).toBeGreaterThan(0);
  expect(perfect).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('Mash and Sequence: Root Pull mashed, Ancient Echo tapped back in order', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 10);
  await page.evaluate(() => window.__DD__.idle.timeScale(0.5));
  expect(await page.evaluate(() => window.__DD__.idle.forceEvent('signature'))).toBe(true);
  expect(await until(page, async () => (await widget(page))?.kind === 'mash' && ((await widget(page))?.targets.length ?? 0) > 0, 20_000)).toBe(true);
  let tg = (await widget(page))!.targets[0];
  for (let i = 0; i < 30; i++) {
    tg = (await widget(page))?.targets[0] ?? tg;
    await touch.tapAt(tg.x, tg.y);
    await page.waitForTimeout(40);
    if (!(await widget(page))) break;
  }
  const mashTiers = (await events(page, 'widget:input')).filter((e) => e.payload.kind === 'mash').length;
  console.log(`Mash: tiers reached ${mashTiers}`);
  expect(mashTiers).toBeGreaterThan(0);
  await until(page, async () => !(await widget(page)), 30_000);

  // Ancient Echo unlocks at 400 m.
  await page.evaluate(() => {
    window.__DD__.idle.setDepth(410);
    window.__DD__.idle.clearEvents();
  });
  await waitFrames(page, 4);
  await page.evaluate(() => window.__DD__.idle.timeScale(1));
  expect(await page.evaluate(() => window.__DD__.idle.forceEvent('ancientEcho'))).toBe(true);
  expect(await until(page, async () => (await widget(page))?.kind === 'sequence', 30_000)).toBe(true);
  // Wait for the show to end (targets appear only for input), then tap the marks back in the model's order.
  expect(await until(page, async () => ((await widget(page))?.targets.length ?? 0) > 0, 150_000)).toBe(true);
  const order: number[] = await page.evaluate(() => {
    const s = window.__DD__.idle.state();
    const w = s.event?.widget;
    return w?.order ?? [];
  });
  for (const mark of order) {
    const t = (await widget(page))?.targets.find((x) => x.id.endsWith(`:${mark}`));
    if (!t) break;
    await touch.tapAt(t.x, t.y);
    await page.waitForTimeout(150);
  }
  const ok = (await events(page, 'widget:input')).filter((e) => e.payload.kind === 'sequence' && e.payload.grade === 'ok').length;
  console.log(`Sequence: ${ok} of ${order.length} marks`);
  expect(ok).toBe(order.length);
  expect(errors).toEqual([]);
});

test('Pick: a Supply Rope crate tapped, then a boost card picked', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 200);
  await page.evaluate(() => window.__DD__.idle.timeScale(0.5));
  expect(await page.evaluate(() => window.__DD__.idle.forceEvent('supplyRope'))).toBe(true);
  // The crate (a world target of the event), then the three cards.
  expect(await until(page, async () => !!(await widget(page)), 20_000)).toBe(true);
  for (let i = 0; i < 20; i++) {
    const w = await widget(page);
    if (!w || w.kind === 'pick') break;
    const tg = w.targets[0];
    if (tg) await touch.tapAt(tg.x, tg.y);
    await page.waitForTimeout(200);
  }
  expect(await until(page, () => page.evaluate(() => !!document.querySelector('.dd-hand-pick:not(.hide) .dd-hc:not(.hide)')), 20_000)).toBe(true);
  await page.waitForTimeout(400);
  const card = await page.evaluate(() => {
    const r = document.querySelector('.dd-hand-pick .dd-hc')!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: document.querySelector('.dd-hand-pick .dd-hc-name')?.textContent ?? '' };
  });
  expect(card.name.length).toBeGreaterThan(0);
  await touch.tapAt(card.x, card.y);
  expect(await until(page, async () => (await events(page, 'boost:start')).length > 0 || (await events(page, 'widget:end')).some((e) => e.payload.kind === 'pick'), 20_000)).toBe(true);
  console.log(`Pick: kept "${card.name}"`);
  expect(errors).toEqual([]);
});

test('a chest opened with a real tap rolls up through its steps; the ceremony plays them; its Board contract completes', async ({ page }) => {
  const errors: string[] = [];
  // Past the first Warden (130 m): the Board and its contracts run.
  const touch = await boot(page, errors, 130);
  // The setup: the Board's first slot holds "open 1 chest" (a contract the next real tap completes).
  await page.evaluate(() => {
    const s = window.__DD__.internals.game.state;
    s.meta.contracts[0] = { tpl: 'chests', target: 1, progress: 0, base: s.meta.stats.chests, arg: '', grand: false };
    window.__DD__.idle.clearEvents();
  });
  expect(await page.evaluate(() => window.__DD__.idle.forceChest('copper'))).toBe(true);
  await waitFrames(page, 2);
  const at = await page.evaluate(() => {
    const c = window.__DD__.idle.columns();
    const s = c.strips[3];
    return { x: (s.left + s.right) / 2, y: c.floorY };
  });
  await touch.tapAt(at.x, at.y);
  expect(await until(page, async () => (await events(page, 'chest:open')).length > 0, 20_000)).toBe(true);
  const open = (await events(page, 'chest:open'))[0].payload;
  const log = await page.evaluate(() => window.__DD__.idle.ceremonies().log);
  console.log(`Chest: ${open.floor} → ${open.tier} (${open.steps} steps, path ${(open.path ?? []).join(' → ')}); ceremonies ${log.map((e) => e.id).join(', ')}`);
  expect(log.some((e) => e.id === 'chest')).toBe(true);
  // The ceremony's chest is on screen during its roll-up.
  expect(await page.evaluate(() => !document.querySelector('.dd-cr')!.classList.contains('hide'))).toBe(true);
  expect(await until(page, async () => (await events(page, 'contract:done')).length > 0, 20_000)).toBe(true);
  const done = (await events(page, 'contract:done'))[0].payload;
  console.log(`Contract done: ${done.id} (+${done.gems} gems); Board dot ${await page.evaluate(() => !document.querySelector('[data-tab="board"] .dd-tab-dot')?.classList.contains('hide'))}`);
  expect(errors).toEqual([]);
});

/** Gold, the pick bought with real taps on its quick-buy card, then real taps across the floor down to the seal. */
async function digToSeal(page: Page, touch: Touch): Promise<{ started: boolean; col: number }> {
  await page.evaluate(() => {
    window.__DD__.idle.give({ gold: '1e9' });
    window.__DD__.idle.toSeal();
    window.__DD__.idle.clearEvents();
  });
  await waitFrames(page, 4);
  const pick0 = await page.evaluate(() => window.__DD__.idle.state().run.pick);
  for (let i = 0; i < 16; i++) {
    const h = await page.evaluate(() => window.__DD__.idle.hud());
    if (h.quick[0]?.state !== 'ready' || h.quick[0].level >= 30) break;
    const r = h.rects['quick:0'];
    await touch.tapAt(r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(150);
  }
  const pick1 = await page.evaluate(() => window.__DD__.idle.state().run.pick);
  console.log(`Seal: pick ${pick0} → ${pick1} bought with real taps`);
  expect(pick1).toBeGreaterThan(pick0);
  let col = 0;
  const started = await until(
    page,
    async () => {
      await touch.tapColumn(col++ % 7);
      return (await events(page, 'seal:start')).length > 0;
    },
    120_000,
    120,
  );
  return { started, col };
}

test('a seal fight won at 5 taps/s with real taps (its HUD on screen, the finisher tapped when it comes)', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 0);
  const at = await digToSeal(page, touch);
  expect(at.started).toBe(true);
  let col = at.col;
  const sealHud = await until(page, () => page.evaluate(() => {
    const el = document.querySelector('[data-hud="seal"]') as HTMLElement;
    return !!el && !el.classList.contains('hide');
  }), 10_000);
  expect(sealHud).toBe(true);
  const won = await until(
    page,
    async () => {
      const w = await widget(page);
      if (w?.kind === 'strike') {
        const r = await page.evaluate(() => {
          const e = [...document.querySelectorAll('[data-hud="strike"]')].find((d) => !d.closest('.hide'))!.getBoundingClientRect();
          return { x: e.left + e.width / 2, y: e.top + e.height / 2 };
        });
        await touch.tapAt(r.x, r.y);
      } else await touch.tapColumn(col++ % 7);
      return (await events(page, 'seal:break')).length > 0;
    },
    120_000,
    200,
  );
  console.log(`Seal: won ${won}; hits ${(await events(page, 'seal:hit')).length}; ceremonies ${(await page.evaluate(() => window.__DD__.idle.ceremonies().log)).map((e) => e.id).join(', ')}`);
  expect(won).toBe(true);
  expect(errors).toEqual([]);
});

test('a seal fight failed (its timer run out), then retried with one real tap', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 0);
  const at = await digToSeal(page, touch);
  expect(at.started).toBe(true);
  // Left alone: the timer is brought to its last half second (a software page runs ~1 frame a second, so 30 model
  // seconds would take minutes), then the fight is lost.
  await page.evaluate(() => {
    const s = window.__DD__.internals.game.state;
    if (s.seal) s.seal.endsAt = s.time + 0.5;
  });
  const failed = await until(page, async () => (await events(page, 'seal:fail')).length > 0, 60_000);
  expect(failed).toBe(true);
  const stamp = await page.evaluate(() => document.querySelector('.dd-stamp-text')?.textContent ?? '');
  await touch.tapColumn(3);
  const retried = await until(page, async () => (await events(page, 'seal:start')).some((e) => e.payload.retry), 20_000);
  console.log(`Seal: failed ${failed} (stamp "${stamp}"), retried ${retried}`);
  expect(retried).toBe(true);
  expect(errors).toEqual([]);
});

test('a facet hand picked with a real tap; the Board, Feats and Codex sheets open with real taps', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 130);
  expect(await page.evaluate(() => window.__DD__.idle.facetHand())).toBe(true);
  expect(await until(page, () => page.evaluate(() => !!document.querySelector('.dd-hand-facet:not(.hide) .dd-hc:not(.hide)')), 20_000)).toBe(true);
  await page.waitForTimeout(500);
  const card = await page.evaluate(() => {
    const r = document.querySelectorAll('.dd-hand-facet .dd-hc')[1]!.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.evaluate(() => window.__DD__.idle.clearEvents());
  await touch.tapAt(card.x, card.y);
  expect(await until(page, async () => (await events(page, 'facet:pick')).length > 0, 20_000)).toBe(true);
  const facets = await page.evaluate(() => window.__DD__.idle.state().run.facets.length);
  expect(facets).toBe(1);

  // A Feat (Delver at 240 m) and its toast; the tabs that have opened by now.
  await page.evaluate(() => {
    window.__DD__.idle.clearEvents();
    window.__DD__.idle.setDepth(250);
  });
  expect(await until(page, async () => (await events(page, 'feat:tier')).length > 0, 30_000)).toBe(true);
  expect(await until(page, () => page.evaluate(() => window.__DD__.idle.ceremonies().log.some((e) => e.id === 'feat')), 20_000)).toBe(true);
  const family = (await events(page, 'feat:tier'))[0].payload.family as string;
  for (const tab of ['feats', 'board', 'codex']) {
    const ok = await until(page, () => page.evaluate((k) => window.__DD__.idle.hud().rects[`tab:${k}`]?.visible === true, tab), 20_000);
    if (!ok) {
      console.log(`tab ${tab} not revealed yet`);
      continue;
    }
    const r = await page.evaluate((k) => window.__DD__.idle.hud().rects[`tab:${k}`], tab);
    await touch.tapAt(r.x + r.w / 2, r.y + r.h / 2);
    expect(await until(page, () => page.evaluate((k) => window.__DD__.idle.hud().sheet === k, tab), 10_000)).toBe(true);
    const rows = await page.evaluate(() => document.querySelectorAll('.dd-sheet .dd-row, .dd-sheet .dd-cx-plate').length);
    console.log(`sheet ${tab}: ${rows} rows`);
    expect(rows).toBeGreaterThan(0);
    if (tab === 'feats') {
      // The toast never takes a touch (CRITIQUE MUST 7); the Feats tab opens on the family it just toasted.
      const focused = await page.evaluate(() => document.querySelector('.dd-sheet [data-focused]')?.textContent ?? '');
      const name = await page.evaluate((f) => window.__DD__.internals.game.ceremonyHost.lastFeat.family === f, family);
      console.log(`Feats opened on "${focused.slice(0, 40)}" (family ${family})`);
      expect(name).toBe(true);
      expect(focused.length).toBeGreaterThan(0);
    }
    await touch.tapAt(r.x + r.w / 2, r.y + r.h / 2);
    await page.waitForTimeout(400);
  }
  expect(errors).toEqual([]);
});

test('a fossil broken with real taps gives a new Find: its label pops and the Codex page shows it', async ({ page }) => {
  const errors: string[] = [];
  const touch = await boot(page, errors, 130);
  // The setup: the Codex pity's sure find planted in the floor's middle cell (a fossil), and the Codex tab's reveal
  // rule met (past the first Warden). Every tap after this is a real touch.
  await page.evaluate(() => {
    const s = window.__DD__.internals.game.state;
    const row = s.shaft.rows.find((r: { depth: number }) => r.depth === s.run.depth);
    row.kinds[3] = 5;
    // Already cracked nearly through (a fossil at 130 m is hard rock for a fresh pick): a few real taps break it.
    row.left[3] = 0.004;
    s.overrides.push({ depth: s.run.depth, col: 3, kind: 5, floor: -2 });
    window.__DD__.idle.give({ gold: '1e12' });
    window.__DD__.idle.clearEvents();
  });
  const found = await until(page, async () => {
    await touch.tapColumn(3);
    return (await events(page, 'codex:new')).length > 0;
  }, 90_000, 150);
  expect(found).toBe(true);
  const entry = (await events(page, 'codex:new'))[0].payload;
  console.log(`Codex: new ${entry.section} "${entry.id}" (biome ${entry.biome})`);
  expect(await until(page, () => page.evaluate(() => window.__DD__.idle.hud().rects['tab:codex']?.visible === true), 20_000)).toBe(true);
  const r = await page.evaluate(() => window.__DD__.idle.hud().rects['tab:codex']);
  await touch.tapAt(r.x + r.w / 2, r.y + r.h / 2);
  expect(await until(page, () => page.evaluate(() => window.__DD__.idle.hud().sheet === 'codex'), 10_000)).toBe(true);
  // The page opens on the find's biome: the new plate is bright with its name.
  await page.waitForTimeout(400);
  const plates = await page.evaluate(() => [...document.querySelectorAll('.dd-sheet .dd-cx-plate.found')].map((e) => e.textContent ?? ''));
  console.log(`Codex sheet: ${plates.length} found plates: ${plates.join(' | ').slice(0, 120)}`);
  expect(plates.length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
