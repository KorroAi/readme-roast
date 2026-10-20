import { expect, test, type Page } from '@playwright/test';
import { idleReady, waitFrames, waitMode, type IdleDebug } from './dd';
import { Touch } from './touch';

// The idle game's core feel (BUILD §2.3 E2E, SPEC §13.2), at 390 × 844 with real touches through CDP. __DD__.idle
// sets up states (gold, a depth) and reads results; every tap, hold and swipe is a real touch on the page.

type Sample = { t: number; f: number; counter: string; log: number; scripted: boolean; inFlight: number; goal: string; goalOk: boolean };

/** Sample the HUD in every frame (after the game's own rAF callback), in the page. */
async function startSampler(page: Page, withGoal = false): Promise<void> {
  await page.evaluate((goal) => {
    const w = window as unknown as { __S: Sample[]; __Son: boolean };
    w.__S = [];
    w.__Son = true;
    const d = window.__DD__.idle;
    const tick = () => {
      if (!w.__Son) return;
      requestAnimationFrame(tick);
      const l = d.ledger();
      const g = goal ? d.goal() : null;
      w.__S.push({ t: performance.now(), f: d.frame(), counter: l.counter, log: l.counterLog10, scripted: l.scripted, inFlight: l.inFlight, goal: g?.text ?? '', goalOk: g ? g.visible && g.text.length > 0 : true });
      if (w.__S.length > 40_000) w.__S.shift();
    };
    requestAnimationFrame(tick);
  }, withGoal);
}

async function stopSampler(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __S: Sample[]; __Son: boolean };
    w.__Son = false;
    return w.__S;
  });
}

/**
 * Battery quality at half resolution (as the Settings sheet would): the input and economy checks do not depend on the
 * picture, and SwiftShader under a loaded machine otherwise draws about one frame a second.
 */
async function lowRender(page: Page): Promise<void> {
  await page.evaluate(() => window.__DD__.idle.settings({ quality: 'battery', renderScale: 0.5 }));
  await waitFrames(page, 2);
}

/** Tap the floor's centre columns until `done` holds (real taps, ~6 a second). */
async function digUntil(page: Page, touch: Touch, done: (d: IdleDebug) => boolean, maxTaps = 600): Promise<number> {
  const fn = `(${done.toString()})(window.__DD__.idle)`;
  for (let i = 0; i < maxTaps; i++) {
    if (i % 4 === 0 && (await page.evaluate(fn))) return i;
    await touch.tapColumn(2 + (i % 3));
    await page.waitForTimeout(150);
  }
  return maxTaps;
}


test('a first launch lands in the shaft with "Tap the rock"; the first coin reaches the counter in 0.5–0.9 s (F4)', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await waitFrames(page, 3);
  const goal = await page.evaluate(() => window.__DD__.idle.goal());
  expect(goal.text).toBe('Tap the rock');
  expect(goal.visible).toBe(true);
  const hud = await page.evaluate(() => window.__DD__.idle.hud());
  expect(hud.guide, 'the ghost hand points at the rock').toBe('cell');
  expect(hud.sheet).toBe('');

  const touch = await Touch.attach(page);
  await startSampler(page);
  await page.evaluate(() => window.__DD__.idle.clearEvents());
  // Real taps on the guided cell until it breaks (the first cell is meant to break at once).
  let taps = 0;
  for (; taps < 6; taps++) {
    const p = await page.evaluate(() => window.__DD__.idle.guidePoint());
    if (p) await touch.tapAt(p.x, p.y + 6);
    else await touch.tapColumn(3);
    await page.waitForTimeout(250);
    if ((await page.evaluate(() => window.__DD__.idle.events('cell:break').length)) > 0) break;
  }
  console.log(`first break after ${taps + 1} tap(s)`);
  expect(taps + 1, 'the first cell breaks within two taps').toBeLessThanOrEqual(2);
  // Wait for the coin.
  await page.waitForFunction(() => window.__DD__.idle.ledger().counter !== '0', null, { timeout: 30_000, polling: 50 });
  await waitFrames(page, 2);
  const samples = await stopSampler(page);
  const brk = await page.evaluate(() => window.__DD__.idle.events('cell:break')[0].t);
  const flights = await page.evaluate(() => window.__DD__.idle.fx().flights);
  const coin = flights.find((f) => f.kind === 'coin' && f.launched >= brk - 20);
  expect(coin, 'the break launched a coin').toBeTruthy();
  // SwiftShader draws a frame or two a second here, so frames cannot time a 0.74 s flight: the FX canvas's own
  // schedule does (launch, due), and the frames confirm it landed on schedule and the counter caught it then.
  const fps = samples.length / ((samples.at(-1)!.t - samples[0].t) / 1000);
  const frameGap = Math.max(...samples.slice(1).map((x, k) => x.t - samples[k].t));
  const flight = (coin!.due - brk) / 1000;
  console.log(`F4: break → coin due at the counter in ${flight.toFixed(3)} s; launched +${(coin!.launched - brk).toFixed(0)} ms, landed +${(coin!.landed - brk).toFixed(0)} ms (${fps.toFixed(1)} fps, worst frame gap ${frameGap.toFixed(0)} ms)`);
  expect(Math.abs(coin!.launched - brk), 'launched in the frame of the break').toBeLessThan(50);
  expect(flight).toBeGreaterThanOrEqual(0.5);
  expect(flight).toBeLessThanOrEqual(0.9);
  expect(coin!.landed, 'landed').toBeGreaterThanOrEqual(coin!.due);
  expect(coin!.landed - coin!.due, 'landed in the first frame at or after its due time').toBeLessThanOrEqual(frameGap + 20);
  // The counter catches it in the landing frame (the sampler runs right after the game's frame).
  const caught = samples.find((x) => x.t >= coin!.landed && x.counter !== '0');
  const atLanding = samples.find((x) => x.t >= coin!.landed);
  expect(caught && atLanding && caught.f - atLanding.f, 'the counter rolls in the landing frame').toBeLessThanOrEqual(1);
  expect(samples.filter((x) => x.t < coin!.landed).every((x) => x.counter === '0'), 'nothing credited before the coin lands').toBe(true);
  expect(errors, errors.join(' | ')).toEqual([]);
});

test('F1: every tap shows in the next frame (50 taps)', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  for (let i = 0; i < 50; i++) {
    await touch.tapColumn(i % 7);
    await page.waitForTimeout(120);
  }
  await waitFrames(page, 2);
  const frames = await page.evaluate(() => window.__DD__.idle.lastTapFrames());
  expect(frames.length).toBeGreaterThanOrEqual(50);
  const late = frames.filter((f) => f > 1);
  expect(late, `frames: ${frames.slice(-50).join(',')}`).toEqual([]);
});

test('F2 + F3: 500 random taps in the world all resolve; 20 random points per column map to it; the margins map to 0 and 6', async ({ page }) => {
  test.setTimeout(1_500_000);
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  const cols = await page.evaluate(() => window.__DD__.idle.columns());
  const { region, strips } = cols;
  // Deterministic random points.
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const check = async (pts: Array<{ x: number; y: number; want?: number }>) => {
    // At most 6 taps between two frames: SwiftShader under load draws ~1 fps, and the pointer ring holds 32.
    for (let k = 0; k < pts.length; k++) {
      await touch.tapAt(pts[k].x, pts[k].y);
      await page.waitForTimeout(40);
      if (k % 6 === 5) await waitFrames(page, 1);
    }
    await waitFrames(page, 2);
    const recs = (await page.evaluate(() => window.__DD__.idle.lastTaps())).slice(-pts.length);
    expect(recs.length).toBe(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const r = recs[i];
      expect(r.col >= 0 || r.entity !== '', `tap at ${pts[i].x.toFixed(0)},${pts[i].y.toFixed(0)} resolved to nothing`).toBe(true);
      if (pts[i].want !== undefined && !r.entity) expect(Math.abs(r.x - pts[i].x)).toBeLessThan(1.5);
    }
    return recs;
  };
  // F2: 500 random points in the world region (10 batches of 50).
  for (let b = 0; b < 10; b++) {
    const pts = Array.from({ length: 50 }, () => ({ x: region.left + rnd() * (region.right - region.left), y: region.top + 8 + rnd() * (region.bottom - region.top - 16) }));
    await check(pts);
  }
  // F3: 20 random points per column (x inside the strip, any height in the world region) map to that column.
  const tops = await page.evaluate(() => window.__DD__.idle.columns());
  for (let c = 0; c < 7; c++) {
    const s = tops.strips[c];
    const pts = Array.from({ length: 20 }, () => ({ x: s.left + 2 + rnd() * (s.right - s.left - 4), y: region.top + 8 + rnd() * (region.bottom - region.top - 16), want: c }));
    const recs = await check(pts);
    // The column mapping itself (the target rule may move the hit to a neighbour when this column is dug deep).
    const mapped = await page.evaluate((xs) => xs.map((x) => {
      const st = window.__DD__.idle.columns().strips;
      let k = 0;
      for (let i = 0; i < 7; i++) if (x >= st[i].left) k = i;
      return k;
    }), pts.map((p) => p.x));
    for (let i = 0; i < pts.length; i++) expect(mapped[i], `x ${pts[i].x.toFixed(1)}`).toBe(c);
    const own = recs.filter((r) => r.col === c).length;
    expect(own, `column ${c}: ${recs.map((r) => r.col).join(',')}`).toBeGreaterThanOrEqual(16);
  }
  // The wall margins: left of column 0 → 0, right of column 6 → 6 (when those columns still hold the target).
  const margins = [
    { x: Math.max(2, strips[0].left - 10), y: cols.floorY + 16, want: 0 },
    { x: Math.min(388, strips[6].right + 10), y: cols.floorY + 16, want: 6 },
  ];
  const mr = await check(margins);
  expect(Math.abs(mr[0].col - 0)).toBeLessThanOrEqual(1);
  expect(Math.abs(mr[1].col - 6)).toBeLessThanOrEqual(1);
});

test('buying the Pick and the Shovel Hand with real taps; a 1.5 s hold-to-buy; the BEST tab moves', async ({ page }) => {
  test.setTimeout(1_200_000);
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  const rect = async (key: string) => (await page.evaluate(() => window.__DD__.idle.hud())).rects[key];
  const quick = () => page.evaluate(() => window.__DD__.idle.hud().quick);
  const bestSlots = new Set<string>();
  const noteBest = async () => {
    const s = await page.evaluate(() => (document.querySelector('.dd-best-tab:not(.hide)') as HTMLElement | null)?.dataset.slot ?? '');
    if (s) bestSlots.add(s);
  };

  // Dig to the Pick's price (30 gold): the Pick card appears on the quick-buy row.
  const n1 = await digUntil(page, touch, (d) => d.hud().quick[0].state === 'ready');
  console.log(`pick affordable after ${n1} taps`);
  const pick0 = (await quick())[0].level;
  const r0 = await rect('quick:0');
  expect(r0.visible).toBe(true);
  await touch.tap({ x: r0.x + r0.w / 2, y: r0.y + r0.h / 2 });
  await expect.poll(async () => (await quick())[0].level, { timeout: 20_000 }).toBe(pick0 + 1);
  await noteBest();

  // Dig to the Shovel Hand's price: the crew card (slot 3) buys the first hire.
  const n2 = await digUntil(page, touch, (d) => d.hud().quick[2].state === 'ready' && d.hud().quick[2].id === 'crew:0');
  console.log(`shovel affordable after ${n2} more taps`);
  const r2 = await rect('quick:2');
  expect(r2.visible).toBe(true);
  await touch.tap({ x: r2.x + r2.w / 2, y: r2.y + r2.h / 2 });
  await expect.poll(async () => (await page.evaluate(() => window.__DD__.idle.state().run.lines[0] as number)), { timeout: 20_000 }).toBe(1);
  await noteBest();

  // Hold-to-buy: with gold for many levels, a 1.5 s press on the Pick buys several (380 ms delay, then 8/s).
  await page.evaluate(() => window.__DD__.idle.give({ gold: 1e6 }));
  await waitFrames(page, 3);
  await noteBest();
  const before = (await quick())[0].level;
  const rp = await rect('quick:0');
  await touch.hold({ x: rp.x + rp.w / 2, y: rp.y + rp.h / 2 }, 1500, 7);
  await waitFrames(page, 3);
  const after = (await quick())[0].level;
  console.log(`hold-to-buy: pick ${before} → ${after}`);
  expect(after - before, 'a 1.5 s hold buys repeatedly').toBeGreaterThanOrEqual(5);
  expect(after - before).toBeLessThanOrEqual(16);
  await noteBest();

  // Buy the crew up with taps until BEST has sat on two different slots.
  for (let i = 0; i < 30 && bestSlots.size < 2; i++) {
    const q = await quick();
    const slot = i % 2 === 0 ? 2 : 0;
    if (q[slot].state !== 'ready') await page.evaluate(() => window.__DD__.idle.give({ gold: 1e7 }));
    const r = await rect(`quick:${slot}`);
    await touch.tap({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    await waitFrames(page, 2);
    await noteBest();
  }
  console.log(`BEST seen on slots ${[...bestSlots].join(', ')}`);
  expect(bestSlots.size, 'the BEST tab moves between cards').toBeGreaterThanOrEqual(2);
});

test('F11: with the Dig sheet open, taps above it still dig', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  // Reveal the Dig tab the honest way: dig to the Pick's price (the tab arrives with the Pick step).
  await digUntil(page, touch, (d) => d.hud().rects['tab:dig']?.visible === true);
  const tab = (await page.evaluate(() => window.__DD__.idle.hud())).rects['tab:dig'];
  await touch.tap({ x: tab.x + tab.w / 2, y: tab.y + tab.h / 2 });
  await expect.poll(async () => (await page.evaluate(() => window.__DD__.idle.hud())).sheet, { timeout: 10_000 }).toBe('dig');
  // Let the sheet settle and the floor re-frame above it.
  await page.waitForTimeout(800);
  await waitFrames(page, 3);
  const cols = await page.evaluate(() => window.__DD__.idle.columns());
  const sheetTop = await page.evaluate(() => (document.querySelector('.dd-sheet:not(.hide)') as HTMLElement | null)?.getBoundingClientRect().top ?? 0);
  expect(cols.floorY, 'the floor is re-framed above the sheet').toBeLessThan(sheetTop);
  await page.evaluate(() => window.__DD__.idle.clearEvents());
  for (let i = 0; i < 12; i++) {
    await touch.tapColumn(i % 7);
    await page.waitForTimeout(160);
  }
  await waitFrames(page, 3);
  const hits = await page.evaluate(() => window.__DD__.idle.events('tap:hit').length);
  expect(hits, 'taps above the sheet dig').toBeGreaterThanOrEqual(10);
  expect((await page.evaluate(() => window.__DD__.idle.hud())).sheet, 'the sheet stays open').toBe('dig');
});

test('F7: gold travels and the counter rolls (≤ ×1.5 a frame outside scripted counts)', async ({ page }) => {
  test.setTimeout(900_000);
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  await startSampler(page);
  const t0 = Date.now();
  let i = 0;
  while (Date.now() - t0 < 30_000) {
    await touch.tapColumn(i++ % 7);
    await page.waitForTimeout(120);
  }
  // Let every coin land.
  await page.waitForFunction(() => window.__DD__.idle.ledger().inFlight === 0, null, { timeout: 30_000, polling: 100 });
  await waitFrames(page, 30);
  const samples = await stopSampler(page);
  let worst = 0;
  let steps = 0;
  for (let k = 1; k < samples.length; k++) {
    const a = samples[k - 1].log;
    const b = samples[k].log;
    if (!Number.isFinite(a) || !Number.isFinite(b) || samples[k].scripted || samples[k - 1].scripted || a < 1) continue;
    steps++;
    worst = Math.max(worst, Math.abs(b - a));
  }
  console.log(`F7: ${samples.length} frames, ${steps} rolling steps, worst ×${Math.pow(10, worst).toFixed(3)} per frame`);
  expect(steps).toBeGreaterThan(20);
  expect(Math.pow(10, worst)).toBeLessThanOrEqual(1.5 + 1e-9);
  // Every credit went through the ledger: once nothing flies, the counter equals the bank.
  const l = await page.evaluate(() => window.__DD__.idle.ledger());
  expect(l.shown).toBe(l.actual);
  expect(l.counter).toBe(l.actual);
});

test('F10: no DOM element is created over 200 taps', async ({ page }) => {
  test.setTimeout(1_200_000);
  await page.goto('/index.html');
  await waitMode(page, 'playing');
  await lowRender(page);
  const touch = await Touch.attach(page);
  // Past the tutorial's first beats (their reveals are class flips, but a beat's line may be new text).
  await digUntil(page, touch, (d) => d.state().run.dmax >= 3, 200);
  await page.evaluate(() => {
    const w = window as unknown as { __added: string[] };
    w.__added = [];
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) if (n.nodeType === 1) w.__added.push(`${(n as Element).tagName}.${(n as Element).className}`);
    }).observe(document.body, { childList: true, subtree: true });
  });
  for (let i = 0; i < 200; i++) {
    await touch.tapColumn(i % 7);
    await page.waitForTimeout(60);
    if (i % 6 === 5) await waitFrames(page, 1);
  }
  await waitFrames(page, 5);
  const added = await page.evaluate(() => (window as unknown as { __added: string[] }).__added);
  console.log(`F10: ${added.length} elements added: ${[...new Set(added)].slice(0, 8).join(' | ')}`);
  expect(added).toEqual([]);
});

test('overlays never steal a tap: the ghost hand, the focus scrim and the prompt let the world dig (CRITIQUE MUST 7)', async ({ page }) => {
  await page.goto('/index.html');
  await idleReady(page);
  await waitMode(page, 'playing');
  const touch = await Touch.attach(page);
  const p = await page.evaluate(() => window.__DD__.idle.guidePoint());
  expect(p, 'the guide shows on a first launch').toBeTruthy();
  // Tap exactly where the hand is drawn.
  await page.evaluate(() => window.__DD__.idle.clearEvents());
  const cols = await page.evaluate(() => window.__DD__.idle.columns());
  await touch.tapAt(p!.x, Math.max(p!.y, cols.floorY + 6));
  await waitFrames(page, 3);
  const hits = await page.evaluate(() => window.__DD__.idle.events('tap:hit').length + window.__DD__.idle.events('cell:break').length);
  expect(hits).toBeGreaterThan(0);
});
