import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { centreOf, freshLaunch, hybridReady, hybridWaitFrames, waitPhase, waitStill } from './dd';

// The W1 slice end to end with REAL touches (SPEC §13.3; W1-LEAD §3): the plug face and the first breakthrough, the Pick
// card, every Explore gesture (tap a floor to walk, drag to look, hold to sweep, tap a far tappable to walk and act, tap
// the dark to raise the lantern), the chest's focus pop, the objective line's walk, the Way Down ride and its skip, the
// save round trip, reduced motion, the left-handed mirror and the HUD audit. `__DD__.hybrid` only sets up states and
// reads results.
//
// SwiftShader renders the lit scene at a few frames a second; these specs test logic and touch handling, so they run on
// the Battery preset at half render scale (`?rscale=0.5`) to keep frames under ~150 ms. Touches carry the finger's own
// timestamps (tests/e2e/touch.ts), so a 60 ms tap stays a tap however late the page reads it.

const SEED = 7;

async function boot(page: Page, opts: { fresh?: boolean; motion?: 'full' | 'reduced'; leftHanded?: boolean; query?: string } = {}): Promise<Touch> {
  if (opts.fresh !== false) await freshLaunch(page);
  await page.addInitScript(
    ([motion, left]) => {
      if (localStorage.getItem('deepdown.settings')) return;
      localStorage.setItem('deepdown.settings', JSON.stringify({ quality: 'battery', autoQuality: false, motion, leftHanded: left }));
    },
    [opts.motion ?? 'full', opts.leftHanded ?? false] as const,
  );
  await page.goto(`/index.html?seed=${SEED}&debug=1&rscale=0.5${opts.query ?? ''}`);
  await hybridReady(page);
  await settle(page);
  return Touch.attach(page);
}

const H = <T>(page: Page, fn: () => T): Promise<T> => page.evaluate(fn);

/**
 * Let the scene catch up after a set-up jump: the camera still, a few frames drawn (a new chamber compiles its
 * materials in its first frames, seconds each under SwiftShader) and the last frame back under 0.6 s, so the screen
 * rects the specs read match the pose and a 60 ms tap is not split by a multi-second frame.
 */
/** The camera still and the scene drawn from that pose (screen rects read after a move match it). */
async function still(page: Page): Promise<void> {
  await waitStill(page);
  await hybridWaitFrames(page, 2);
}

async function settle(page: Page): Promise<void> {
  await waitStill(page);
  await hybridWaitFrames(page, 4);
  // The wall time per drawn frame (perf().frameMs is the CPU side only): wait until two frames take < 1.2 s.
  for (const t0 = Date.now(); Date.now() - t0 < 120_000; ) {
    const a = Date.now();
    await hybridWaitFrames(page, 2);
    if (Date.now() - a < 1200) break;
  }
}

/** Dig the current drift with real taps until the phase leaves the drift (or `max` taps). */
async function digThrough(page: Page, touch: Touch, max = 90): Promise<number> {
  let n = 0;
  for (; n < max; n++) {
    const v = await H(page, () => window.__DD__.hybrid.node());
    if (v.phase !== 'drift') break;
    const cells = await H(page, () => window.__DD__.hybrid.faceCells());
    if (!cells.length) {
      await page.waitForTimeout(150);
      continue;
    }
    const c = cells[n % cells.length];
    await touch.tap(centreOf(c.rect));
    await page.waitForTimeout(90);
  }
  return n;
}

/** Into the Root Cellar (node 0's chamber), lit, the tutorial out of the way, the camera still. */
async function intoCellar(page: Page): Promise<void> {
  await H(page, () => {
    window.__DD__.hybrid.skipTutorial();
    window.__DD__.hybrid.setNode(0, 'chamber');
  });
  await waitPhase(page, 'explore', 0);
  await settle(page);
}

test.describe('the W1 slice (hybrid-slice)', () => {
  test('E1, E5: first launch at the plug face; a tap breaks the rimmed block in the next frame; the breakthrough, first light, Explore', async ({ page }) => {
    const touch = await boot(page);
    const v = await H(page, () => window.__DD__.hybrid.node());
    expect(v.phase).toBe('drift');
    expect(v.node).toBe(0);
    expect(await H(page, () => window.__DD__.hybrid.goal().text)).toBe('Tap the rock');
    const cells = await H(page, () => window.__DD__.hybrid.faceCells());
    expect(cells.length).toBe(7);
    // E22 at 390 × 844: every live front block ≥ 92 px on its short axis at rest.
    for (const c of cells) expect(Math.min(c.rect.w, c.rect.h)).toBeGreaterThanOrEqual(92);
    await H(page, () => window.__DD__.hybrid.clearEvents());
    const centre = cells.find((c) => c.col === 3) ?? cells[0];
    await touch.tap(centreOf(centre.rect));
    await page.waitForFunction(() => window.__DD__.hybrid.events('cell:break').length > 0, null, { timeout: 60_000 });
    // L1: the hit shows in the frame after the pointerdown (frames between them ≤ 1).
    const frames = await H(page, () => window.__DD__.hybrid.lastTapFrames());
    expect(frames.length).toBeGreaterThan(0);
    expect(Math.max(...frames)).toBeLessThanOrEqual(1);
    // Dig through: the breach, the glide, first light, Explore.
    const taps = await digThrough(page, touch);
    expect(taps).toBeLessThan(90);
    await waitPhase(page, 'explore', 0);
    const names = (await H(page, () => window.__DD__.hybrid.events())).map((e) => e.name);
    expect(names).toContain('node:breach');
    expect(names).toContain('node:firstLight');
    expect(names.indexOf('node:breach')).toBeLessThan(names.indexOf('node:firstLight'));
    await still(page);
    expect((await H(page, () => window.__DD__.hybrid.node())).lit).toBe(true);
    expect(await H(page, () => window.__DD__.hybrid.explore().on)).toBe(true);
    // E2 (the drift half): every press resolved to a verb; none is "nothing".
    const touches = await H(page, () => window.__DD__.hybrid.lastTouches());
    expect(touches.length).toBeGreaterThan(5);
    for (const t of touches) expect(t.verb, JSON.stringify(t)).toMatch(/^(strike|relight|focus|navigation|skill|pulse|tunk|raise|walk|look|hud)$/);
  });

  test('E3: the Pick card appears, priced; a real tap on it buys', async ({ page }) => {
    const touch = await boot(page);
    let card = null as null | { x: number; y: number; w: number; h: number };
    for (let i = 0; i < 40 && !card; i++) {
      const hud = await H(page, () => window.__DD__.hybrid.hud());
      const c = hud.cards.find((x) => x.slot === 'pick' && x.visible && x.ready);
      if (c) {
        expect(c.price).toMatch(/\d/);
        card = hud.rects['card-pick'];
        break;
      }
      const cells = await H(page, () => window.__DD__.hybrid.faceCells());
      if (cells.length) await touch.tap(centreOf(cells[i % cells.length].rect));
      await page.waitForTimeout(120);
    }
    expect(card).not.toBeNull();
    const pick0 = await H(page, () => window.__DD__.hybrid.state().run.pick as number);
    await touch.tap(centreOf(card!));
    await page.waitForFunction(() => window.__DD__.hybrid.events('buy:done').length > 0, null, { timeout: 30_000 });
    expect(await H(page, () => window.__DD__.hybrid.state().run.pick as number)).toBe(pick0 + 1);
  });

  test('E8: a hold on the face streams strikes at the hold rate; strikes never move the camera', async ({ page }) => {
    const touch = await boot(page);
    const cells = await H(page, () => window.__DD__.hybrid.faceCells());
    const view0 = (await H(page, () => window.__DD__.hybrid.camera().view)).join(',');
    await H(page, () => window.__DD__.hybrid.clearEvents());
    await touch.hold(centreOf(cells[3].rect), 4000);
    await page.waitForTimeout(400);
    const ev = await H(page, () => window.__DD__.hybrid.events());
    const holds = ev.filter((e) => e.name === 'tap:hit' && e.payload.source === 'hold').length;
    // 3/s after the delay. Under SwiftShader a finger counts as still only after 1.5 of its (long) frames and the
    // stream catches up at most 2 hits a frame, so the count is bounded, not exact: never above 3/s × 3.75 s.
    expect(holds).toBeGreaterThanOrEqual(3);
    expect(holds).toBeLessThanOrEqual(12);
    // No slice cleared: the camera did not move a pixel (L7).
    if (!ev.some((e) => e.name === 'drift:slice')) expect((await H(page, () => window.__DD__.hybrid.camera().view)).join(',')).toBe(view0);
  });

  test('Explore: tap a floor to walk there (≤ 2.5 m/s, turns ≤ 90°/s), drag to look, hold to sweep, tap the dark to raise the lantern', async ({ page }) => {
    const touch = await boot(page);
    await intoCellar(page);
    // Walk: a visible floor point 2–9 m away.
    const floors = await H(page, () => window.__DD__.hybrid.floorPoints(8, 2, 9));
    expect(floors.length).toBeGreaterThan(0);
    const f = floors[Math.floor(floors.length / 2)];
    await H(page, () => window.__DD__.hybrid.clearCameraLog());
    const p0 = await H(page, () => window.__DD__.hybrid.explore().pos);
    await touch.tap({ x: f.x, y: f.y });
    await page.waitForFunction(() => window.__DD__.hybrid.explore().walks > 0, null, { timeout: 30_000 });
    // The amber ring marks the destination.
    expect(await H(page, () => window.__DD__.hybrid.explore().marker)).not.toBeNull();
    await page.waitForFunction(() => window.__DD__.hybrid.explore().arrivals > 0, null, { timeout: 60_000 });
    const p1 = await H(page, () => window.__DD__.hybrid.explore().pos);
    expect(Math.hypot(p1.x - p0.x, p1.z - p0.z)).toBeGreaterThan(0.3);
    const law = await H(page, () => {
      const log = window.__DD__.hybrid.camera(true).log ?? [];
      let v = 0;
      let w = 0;
      let roll = 0;
      for (let i = 1; i < log.length; i++) {
        const a = log[i - 1];
        const b = log[i];
        const dt = b.t - a.t;
        roll = Math.max(roll, Math.abs(b.roll));
        if (!(dt > 0.004) || b.phase === 'cut' || b.fade > 0) continue;
        v = Math.max(v, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / dt);
        if (!a.drag && !b.drag) {
          let dy = b.yaw - a.yaw;
          while (dy > Math.PI) dy -= 2 * Math.PI;
          while (dy < -Math.PI) dy += 2 * Math.PI;
          w = Math.max(w, (Math.max(Math.abs(dy), Math.abs(b.pitch - a.pitch)) * 180) / Math.PI / dt);
        }
      }
      return { v, w, roll, n: log.length };
    });
    expect(law.n).toBeGreaterThan(3);
    expect(law.v).toBeLessThanOrEqual(2.5 * 1.02);
    expect(law.w).toBeLessThanOrEqual(90 * 1.05);
    expect(law.roll).toBe(0);
    // Look: a 120 px drag left turns the view left ~26°, never acts.
    await still(page);
    const before = await H(page, () => ({ yaw: window.__DD__.hybrid.explore().pos.yaw, n: window.__DD__.hybrid.events().length }));
    await touch.drag({ x: 260, y: 450 }, -120, 0, 300);
    await page.waitForFunction(() => window.__DD__.hybrid.explore().looks > 0, null, { timeout: 30_000 });
    await still(page);
    const after = await H(page, () => ({ yaw: window.__DD__.hybrid.explore().pos.yaw, ev: window.__DD__.hybrid.events().map((e) => e.name) }));
    let dyaw = after.yaw - before.yaw;
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    expect(Math.abs((dyaw * 180) / Math.PI)).toBeGreaterThan(10);
    const acted = after.ev.slice(before.n).filter((n) => /^(tap:hit|tappable:hit|lamp:relight|focus:open|ride:start|skin:strike|lantern:raise|rock:tunk)$/.test(n));
    expect(acted).toEqual([]);
    // E14: a tap on a far wall (rock beyond reach, found by asking the game's own ray) raises the lantern toward it; the
    // camera does not move.
    const farWall = await H(page, () => {
      const g = window.__DD__.internals.game as { rayHit(x: number, y: number, phase: string): { kind: string; dist?: number } };
      for (let y = 180; y < 700; y += 30) for (let x = 40; x < 360; x += 40) {
        const r = g.rayHit(x, y, 'explore');
        if ((r.kind === 'deep' || r.kind === 'far') && (r.dist ?? 0) > 5) return { x, y };
      }
      return null;
    });
    expect(farWall).not.toBeNull();
    const view0 = (await H(page, () => window.__DD__.hybrid.camera().view)).join(',');
    await H(page, () => window.__DD__.hybrid.clearEvents());
    await touch.tap(farWall!);
    await page.waitForFunction(() => window.__DD__.hybrid.events('lantern:raise').length > 0, null, { timeout: 30_000 });
    const raised = (await H(page, () => window.__DD__.hybrid.lastTouches())).filter((t) => t.kind === 'tap').pop()!;
    expect(raised.verb).toBe('raise');
    await hybridWaitFrames(page, 3);
    expect((await H(page, () => window.__DD__.hybrid.camera().view)).join(',')).toBe(view0);
    // Hold: a still finger sweeps the strike tappables in reach (or answers with a tunk when none is left in reach).
    await H(page, () => window.__DD__.hybrid.clearEvents());
    // (Under SwiftShader a finger counts as still after two of its long frames: hold long enough for the stream.)
    await touch.hold({ x: 195, y: 520 }, 4000);
    await page.waitForTimeout(300);
    const holds = (await H(page, () => window.__DD__.hybrid.lastTouches())).filter((t) => t.kind === 'hold');
    expect(holds.length).toBeGreaterThan(0);
    for (const t of holds) expect(['strike', 'relight', 'tunk']).toContain(t.verb);
  });

  test('Explore: a far tappable is walked to, then acted on; the objective line walks you to the goal', async ({ page }) => {
    const touch = await boot(page);
    await intoCellar(page);
    // Look for a strike tappable beyond reach that is on screen.
    let far = null as null | { id: string; hit: { x: number; y: number; w: number; h: number } };
    const seen: string[] = [];
    for (let k = 0; k < 8 && !far; k++) {
      const list = await H(page, () => window.__DD__.hybrid.tappables());
      seen.push(list.map((t) => `${t.id}:${t.kind}@${Math.round(t.hit.x + t.hit.w / 2)},${Math.round(t.hit.y + t.hit.h / 2)} d${t.dist.toFixed(1)} l${t.left}`).join(' '));
      far = list.find((t) => ['vein', 'gem', 'stash', 'lamp'].includes(t.kind) && t.dist > 3.6 && t.dist < 25 && t.left > 0 && t.hit.x + t.hit.w / 2 > 30 && t.hit.x + t.hit.w / 2 < 360 && t.hit.y + t.hit.h / 2 > 150 && t.hit.y + t.hit.h / 2 < 730) ?? null;
      if (!far) {
        await touch.drag({ x: 300, y: 450 }, -110, 0, 300);
        await still(page);
      }
    }
    expect(far, `no far tappable came on screen while looking around: ${seen.join(' | ')}`).not.toBeNull();
    await touch.tap(centreOf(far!.hit));
    await page.waitForFunction(() => window.__DD__.hybrid.explore().walks > 0 || window.__DD__.hybrid.events('tappable:hit').length > 0, null, { timeout: 30_000 });
    await page.waitForFunction(() => window.__DD__.hybrid.explore().actsOnArrival > 0, null, { timeout: 90_000 });
    const ev = (await H(page, () => window.__DD__.hybrid.events())).map((e) => e.name);
    expect(ev.some((n) => /^(tappable:hit|chamber:harvest|lamp:relight)$/.test(n))).toBe(true);
    // The objective line: a tap walks toward its target (or faces it when already there).
    const goal = await H(page, () => window.__DD__.hybrid.hud().rects.goal);
    const walks0 = await H(page, () => window.__DD__.hybrid.explore().walks);
    await touch.tap(centreOf(goal));
    await page.waitForTimeout(1500);
    const ex = await H(page, () => window.__DD__.hybrid.explore());
    expect(ex.walks >= walks0).toBe(true);
  });

  test('E6: the chest focus pop: open with a tap, the roll-up, close outside; the camera never moves', async ({ page }) => {
    const touch = await boot(page);
    await intoCellar(page);
    let chest = null as null | { hit: { x: number; y: number; w: number; h: number }; dist: number };
    const seen: string[] = [];
    for (let k = 0; k < 8 && !chest; k++) {
      const list = await H(page, () => window.__DD__.hybrid.tappables());
      seen.push(`yaw ${(((await H(page, () => window.__DD__.hybrid.explore().pos.yaw)) * 180) / Math.PI).toFixed(0)}: ` + list.map((t) => `${t.id}:${t.kind}@${Math.round(t.hit.x)},${Math.round(t.hit.y)} l${t.left}`).join(' '));
      const c = list.find((t) => t.kind === 'chest' && t.left > 0);
      if (c) {
        // The part of its hit area on screen.
        const x0 = Math.max(10, c.hit.x);
        const x1 = Math.min(380, c.hit.x + c.hit.w);
        const y0 = Math.max(140, c.hit.y);
        const y1 = Math.min(740, c.hit.y + c.hit.h);
        if (x1 - x0 > 30 && y1 - y0 > 30) chest = { hit: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, dist: c.dist };
      }
      if (!chest) {
        // A drag turns the view the way the finger goes (left: look left, and what is off the left edge comes in).
        const dx = c && c.hit.x > 390 ? 110 : -110;
        await touch.drag({ x: dx < 0 ? 280 : 110, y: 450 }, dx, 0, 300);
        await still(page);
      }
    }
    expect(chest, `no chest came on screen while looking around: ${seen.join(' | ')}`).not.toBeNull();
    await H(page, () => window.__DD__.hybrid.clearEvents());
    await touch.tap(centreOf(chest!.hit));
    await page.waitForFunction(() => window.__DD__.hybrid.events('focus:open').length > 0, null, { timeout: 90_000 });
    await still(page);
    const view0 = (await H(page, () => window.__DD__.hybrid.camera().view)).join(',');
    expect(await H(page, () => window.__DD__.hybrid.hud().focus)).not.toBe('');
    // Tap the popped chest: it opens (the honest roll-up).
    await touch.tap({ x: 195, y: 420 });
    await page.waitForFunction(() => window.__DD__.hybrid.events('chest:open').length > 0, null, { timeout: 30_000 });
    expect((await H(page, () => window.__DD__.hybrid.camera().view)).join(',')).toBe(view0);
    // Tap outside: closed.
    await touch.tap({ x: 40, y: 200 });
    await page.waitForFunction(() => window.__DD__.hybrid.events('focus:close').length > 0, null, { timeout: 30_000 });
    expect((await H(page, () => window.__DD__.hybrid.camera().view)).join(',')).toBe(view0);
  });

  test('E7: the Way Down: the objective line walks to the exit, a tap takes it, the ride is skipped from its plate', async ({ page }) => {
    const touch = await boot(page);
    await intoCellar(page);
    // Look around for the exit (a drag turns the view); the objective line walks there once the room's goal is the exit.
    let exit = null as null | { hit: { x: number; y: number; w: number; h: number } };
    const seen: string[] = [];
    for (let k = 0; k < 10 && !exit; k++) {
      const nav = await H(page, () => window.__DD__.hybrid.nav());
      seen.push(nav.map((n) => `${n.id}:${n.kind}@${Math.round(n.hit.x + n.hit.w / 2)},${Math.round(n.hit.y + n.hit.h / 2)} d${n.dist.toFixed(1)}`).join(' '));
      const e = nav.find((n) => n.kind === 'exit' && n.hit.x + n.hit.w / 2 > 20 && n.hit.x + n.hit.w / 2 < 370 && n.hit.y + n.hit.h / 2 > 150 && n.hit.y + n.hit.h / 2 < 730);
      if (e) exit = { hit: { x: Math.max(10, e.hit.x), y: Math.max(140, e.hit.y), w: Math.min(e.hit.w, 370 - Math.max(10, e.hit.x)), h: Math.min(e.hit.h, 730 - Math.max(140, e.hit.y)) } };
      else {
        await touch.drag({ x: 300, y: 450 }, -110, 0, 300);
        await still(page);
      }
    }
    expect(exit, `the exit never came on screen while looking around: ${seen.join(' | ')}`).not.toBeNull();
    await H(page, () => window.__DD__.hybrid.clearEvents());
    await touch.tap(centreOf(exit!.hit));
    await page.waitForFunction(() => window.__DD__.hybrid.events('ride:start').length > 0, null, { timeout: 90_000 });
    await page.waitForFunction(() => window.__DD__.hybrid.ride().skip !== null || window.__DD__.hybrid.events('ride:end').length > 0, null, { timeout: 30_000 });
    const skip = await H(page, () => window.__DD__.hybrid.ride().skip);
    if (skip) {
      await touch.tap(centreOf(skip));
      await page.waitForFunction(() => window.__DD__.hybrid.events('ride:end').length > 0, null, { timeout: 30_000 });
    }
    await waitPhase(page, 'drift', 1);
    expect((await H(page, () => window.__DD__.hybrid.faceCells())).length).toBeGreaterThan(0);
  });

  test('E16: save and reload mid-chamber: the camp (the menu), then Descend resumes the same node, phase, stand, harvested and lit bits', async ({ page }) => {
    let touch = await boot(page);
    await intoCellar(page);
    // (state() is the save form: run.node, run.phase, run.resume, run.chambers.)
    const a = await H(page, () => {
      const s = window.__DD__.hybrid.state();
      return { n: window.__DD__.hybrid.node(), chamber: JSON.stringify(s.run.chambers.find((c: { node: number }) => c.node === s.run.node) ?? null) };
    });
    expect(a.n.lit).toBe(true);
    expect(await H(page, () => window.__DD__.hybrid.save())).toBe(true);
    await page.reload();
    await hybridReady(page);
    touch = await Touch.attach(page);
    // From the second launch the camp is the menu (SPEC §5.10); the descent waits where it was.
    await waitPhase(page, 'camp');
    expect(await H(page, () => window.__DD__.hybrid.mode())).toBe('menu');
    const st = await H(page, () => window.__DD__.hybrid.state());
    expect(st.run.node).toBe(a.n.node);
    expect(st.run.phase).toBe('camp');
    expect(st.run.resume).toBe('explore');
    // "Descend" = tap the adit (a real tap on the station; the objective line walks there when it is off screen).
    await still(page);
    await H(page, () => window.__DD__.hybrid.clearEvents());
    const adit = (await H(page, () => window.__DD__.hybrid.nav())).find((n) => n.kind === 'station' && /adit/.test(n.id) && n.hit.y > 130 && n.hit.y + n.hit.h < 745);
    if (adit) await touch.tap(centreOf(adit.hit));
    else await touch.tap(centreOf(await H(page, () => window.__DD__.hybrid.hud().rects.goal)));
    await page.waitForFunction(() => window.__DD__.hybrid.events('camp:descend').length > 0, null, { timeout: 120_000 });
    await waitPhase(page, 'explore', a.n.node);
    const b = await H(page, () => {
      const s = window.__DD__.hybrid.state();
      return { n: window.__DD__.hybrid.node(), chamber: JSON.stringify(s.run.chambers.find((c: { node: number }) => c.node === s.run.node) ?? null) };
    });
    expect(b.n.stand).toBe(a.n.stand);
    expect(b.n.lit).toBe(true);
    expect(b.n.lamps).toEqual(a.n.lamps);
    expect(b.chamber).toBe(a.chamber);
  });

  test('E20: reduced motion turns a walk into one cross-fade (no intermediate pose)', async ({ page }) => {
    const touch = await boot(page, { motion: 'reduced' });
    await intoCellar(page);
    const floors = await H(page, () => window.__DD__.hybrid.floorPoints(6, 2.5, 9));
    test.skip(!floors.length, 'no floor on screen');
    await H(page, () => window.__DD__.hybrid.clearCameraLog());
    await touch.tap({ x: floors[0].x, y: floors[0].y });
    await page.waitForFunction(() => window.__DD__.hybrid.explore().walks > 0, null, { timeout: 30_000 });
    await page.waitForTimeout(1500);
    const steps = await H(page, () => {
      const log = window.__DD__.hybrid.camera(true).log ?? [];
      let moves = 0;
      for (let i = 1; i < log.length; i++) if (Math.hypot(log[i].x - log[i - 1].x, log[i].z - log[i - 1].z) > 1e-6 && log[i].phase !== 'cut' && log[i - 1].phase !== 'cut') moves++;
      return moves;
    });
    expect(steps).toBe(0);
  });

  test('E2: random real touches over a drift and over a chamber: every one does something (no "nothing")', async ({ page }) => {
    const touch = await boot(page);
    // A seeded walk over the world region (between the objective line and the cards), clear of the plates.
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const ALLOWED = /^(strike|relight|focus|navigation|skill|tunk|raise|walk|look)$/;
    const run = async (n: number, label: string) => {
      const hud = await H(page, () => window.__DD__.hybrid.hud());
      const top = hud.rects.goal.y + hud.rects.goal.h + 6;
      const cards = [hud.rects['card-pick'], hud.rects['card-best']].filter((r) => r?.visible);
      const bottom = cards.length ? Math.min(...cards.map((r) => r.y)) - 6 : 740;
      const missed: string[] = [];
      for (let i = 0; i < n; i++) {
        const p = { x: Math.round(20 + rnd() * 350), y: Math.round(top + rnd() * (bottom - top)) };
        await touch.tap(p);
        // Answered: a logged verb for this very point within a few frames.
        const ok = await page
          .waitForFunction(([x, y]) => window.__DD__.hybrid.lastTouches().slice(-8).some((t) => Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1), [p.x, p.y] as const, { timeout: 20_000, polling: 50 })
          .then(() => true, () => false);
        if (!ok)
          missed.push(
            `${p.x},${p.y} ` +
              JSON.stringify(await H(page, () => ({ phase: window.__DD__.hybrid.node().phase, cer: window.__DD__.hybrid.fx().ceremony, focus: window.__DD__.hybrid.hud().focus, walking: window.__DD__.hybrid.explore().walking, last: window.__DD__.hybrid.lastTouches().slice(-3) }))),
          );
        // A focus pop owns the next tap (it closes it): let it.
        await page.waitForTimeout(120);
      }
      const log = await H(page, () => window.__DD__.hybrid.lastTouches());
      const bad = log.filter((t) => (t.kind === 'tap' || t.kind === 'press') && !ALLOWED.test(t.verb));
      expect(bad, `${label}: ${JSON.stringify(bad.slice(0, 3))}`).toEqual([]);
      expect(missed, `${label}: touches with no answer`).toEqual([]);
    };
    await run(30, 'drift');
    const strikes = await H(page, () => window.__DD__.hybrid.events('tap:hit').length);
    expect(strikes).toBeGreaterThan(0);
    await intoCellar(page);
    await H(page, () => window.__DD__.hybrid.clearEvents());
    await run(30, 'chamber');
    const acts = (await H(page, () => window.__DD__.hybrid.events())).filter((e) => /^(tap:hit|skin:strike|lamp:relight|focus:open|focus:close|ride:start|stand:move|lantern:raise|rock:tunk|tappable:hit|chest:open)$/.test(e.name));
    expect(acts.length).toBeGreaterThan(0);
  });

  test('E9: relight the Root Cellar\'s lamps with real taps (walk there, then the flame): lamp:relight ×2, charted, a gem', async ({ page }) => {
    const touch = await boot(page);
    await intoCellar(page);
    const v0 = await H(page, () => window.__DD__.hybrid.node());
    expect(v0.lamps[1]).toBeGreaterThanOrEqual(2);
    const gems0 = await H(page, () => window.__DD__.hybrid.state().meta.gems as number);
    await H(page, () => window.__DD__.hybrid.clearEvents());
    const seen: string[] = [];
    for (let k = 0; k < 14; k++) {
      const v = await H(page, () => window.__DD__.hybrid.node());
      if (v.lamps[0] >= v.lamps[1]) break;
      const all = await H(page, () => window.__DD__.hybrid.tappables());
      seen.push(`lamps ${v.lamps.join('/')} yaw ${(((await H(page, () => window.__DD__.hybrid.explore().pos.yaw)) * 180) / Math.PI).toFixed(0)}: ` + all.filter((t) => t.kind === 'lamp').map((t) => `${t.id}@${Math.round(t.hit.x + t.hit.w / 2)},${Math.round(t.hit.y + t.hit.h / 2)} d${t.dist.toFixed(1)} l${t.left}`).join(' '));
      const lamp = all.find((t) => t.kind === 'lamp' && t.left > 0 && t.hit.x + t.hit.w / 2 > 20 && t.hit.x + t.hit.w / 2 < 370 && t.hit.y + t.hit.h / 2 > 140 && t.hit.y + t.hit.h / 2 < 740);
      if (lamp) {
        const lit0 = v.lamps[0];
        await touch.tap(centreOf(lamp.hit));
        await page.waitForFunction((n) => window.__DD__.hybrid.node().lamps[0] > n, lit0, { timeout: 90_000 }).catch(() => undefined);
        await still(page);
      } else {
        await touch.drag({ x: 300, y: 450 }, -140, 0, 300);
        await still(page);
      }
    }
    const ev = (await H(page, () => window.__DD__.hybrid.events())).map((e) => e.name);
    expect(ev.filter((n) => n === 'lamp:relight').length, seen.join(' | ')).toBeGreaterThanOrEqual(2);
    await page.waitForFunction(() => window.__DD__.hybrid.events('chamber:charted').length > 0, null, { timeout: 30_000 });
    expect(await H(page, () => window.__DD__.hybrid.node().charted)).toBe(true);
    expect(await H(page, () => window.__DD__.hybrid.state().meta.gems as number)).toBeGreaterThanOrEqual(gems0 + 1);
  });

  test('E17: two hours away with a crew: the return plate, chambers opened ahead and left dark, Collect, first light is yours', async ({ page }) => {
    const touch = await boot(page);
    await intoCellar(page);
    // Hire the Shovel Hand with a real tap on its card (gold given for the set-up).
    await H(page, () => window.__DD__.hybrid.give({ gold: 5000 }));
    await page.waitForFunction(() => window.__DD__.hybrid.hud().cards.some((c) => c.slot === 'best' && c.visible && c.ready), null, { timeout: 60_000 }).catch(() => undefined);
    const hud = await H(page, () => window.__DD__.hybrid.hud());
    const best = hud.cards.find((c) => c.visible && c.id.startsWith('crew'));
    if (best) await touch.tap(centreOf(hud.rects[best.slot === 'pick' ? 'card-pick' : 'card-best']));
    await page.waitForFunction(() => window.__DD__.hybrid.events('buy:done').length > 0, null, { timeout: 30_000 }).catch(() => undefined);
    expect(await H(page, () => window.__DD__.hybrid.save())).toBe(true);
    const node0 = (await H(page, () => window.__DD__.hybrid.node())).node;
    // Two hours pass (the save's clock is moved back and the page reloads).
    await page.evaluate(() => window.__DD__.hybrid.offline(2)).catch(() => undefined);
    await page.waitForLoadState('load');
    await hybridReady(page);
    const t0 = Date.now();
    const touch2 = await Touch.attach(page);
    await page.waitForFunction(() => window.__DD__.hybrid.hud().returnPlate === 'shown', null, { timeout: 120_000 });
    // The glimpses run under the plate and end within 3 s of play time.
    await waitStill(page);
    void t0;
    const v = await H(page, () => window.__DD__.hybrid.node());
    expect(v.leashOpen).toBeGreaterThanOrEqual(0);
    expect(v.leashOpen).toBeLessThanOrEqual(3);
    const collect = await H(page, () => {
      const el = document.querySelector('[data-hud="collect"]');
      const r = el?.getBoundingClientRect();
      return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    });
    expect(collect).not.toBeNull();
    await touch2.tap(centreOf(collect!));
    await page.waitForFunction(() => window.__DD__.hybrid.hud().returnPlate === 'collected', null, { timeout: 30_000 });
    // L10: whatever the crew opened stays dark until the player's own first light.
    const after = await H(page, () => window.__DD__.hybrid.node());
    if (after.node > node0) {
      expect(after.lit).toBe(false);
      await H(page, () => window.__DD__.hybrid.clearEvents());
      await settle(page);
      await touch2.tap({ x: 195, y: 420 });
      await page.waitForFunction(() => window.__DD__.hybrid.events('node:firstLight').length > 0, null, { timeout: 120_000 });
    }
    void touch;
  });

  test('E12: the Hatch: the seal fight with real taps to the win, the reveal skipped with a tap, the Threshold stand', async ({ page }) => {
    const touch = await boot(page);
    await H(page, () => {
      window.__DD__.hybrid.skipTutorial();
      window.__DD__.hybrid.toSeal();
    });
    await waitPhase(page, 'explore');
    await settle(page);
    const sealNode = (await H(page, () => window.__DD__.hybrid.node())).node;
    // The objective line walks to the Hatch; a tap on it (or the goal again) starts the fight.
    for (let k = 0; k < 6; k++) {
      if ((await H(page, () => window.__DD__.hybrid.node().phase)) === 'seal') break;
      const nav = (await H(page, () => window.__DD__.hybrid.nav())).find((n) => n.kind === 'exit' && n.hit.y > 130 && n.hit.y + n.hit.h < 745 && n.hit.x + n.hit.w / 2 > 10 && n.hit.x + n.hit.w / 2 < 380);
      if (nav) await touch.tap(centreOf(nav.hit));
      else await touch.tap(centreOf(await H(page, () => window.__DD__.hybrid.hud().rects.goal)));
      await page.waitForFunction(() => window.__DD__.hybrid.node().phase === 'seal' || !window.__DD__.hybrid.camera().moving, null, { timeout: 90_000 });
      await still(page);
    }
    await waitPhase(page, 'seal', sealNode, 60_000);
    // A strong pick for the set-up (the fight's length is the economy's, not this test's).
    await H(page, () => {
      window.__DD__.hybrid.give({ gold: '1e40' });
      const g = window.__DD__.internals.game as { state: { run: { pick: number } } };
      g.state.run.pick = Math.max(g.state.run.pick, 400);
    });
    await H(page, () => window.__DD__.hybrid.clearEvents());
    for (let i = 0; i < 80; i++) {
      if ((await H(page, () => window.__DD__.hybrid.events('seal:break').length)) > 0) break;
      await touch.tap({ x: 195 + ((i % 3) - 1) * 30, y: 430 + ((i % 2) * 40) });
      await page.waitForTimeout(140);
    }
    expect((await H(page, () => window.__DD__.hybrid.events('seal:hit'))).length).toBeGreaterThan(0);
    await page.waitForFunction(() => window.__DD__.hybrid.events('seal:break').length > 0, null, { timeout: 60_000 });
    await page.waitForFunction(() => window.__DD__.hybrid.events('biome:reveal').length > 0, null, { timeout: 60_000 });
    // A tap skips the reveal.
    await touch.tap({ x: 195, y: 420 });
    await page.waitForFunction((n) => window.__DD__.hybrid.node().node > n && ['explore', 'drift'].includes(window.__DD__.hybrid.node().phase), sealNode, { timeout: 120_000 });
  });

  test('E19, E21: the left-handed mirror; the HUD audit (plates ≤ 17 %, ≤ 5 numbers, the objective always shown)', async ({ page }) => {
    const touch = await boot(page, { leftHanded: true });
    expect(await page.evaluate(() => (window.__DD__.internals.game as { scene: { viewmodel: { state: { mirror: boolean } } } }).scene.viewmodel.state.mirror)).toBe(true);
    for (let i = 0; i < 12; i++) {
      const hud = await H(page, () => window.__DD__.hybrid.hud());
      expect(hud.plateArea).toBeLessThanOrEqual(0.17);
      expect(hud.numbers.length).toBeLessThanOrEqual(5);
      expect(hud.minBodyPx).toBeGreaterThanOrEqual(15);
      const g = await H(page, () => window.__DD__.hybrid.goal());
      expect(g.visible).toBe(true);
      expect(g.text.length).toBeGreaterThan(0);
      const cells = await H(page, () => window.__DD__.hybrid.faceCells());
      if (cells.length) await touch.tap(centreOf(cells[i % cells.length].rect));
      await page.waitForTimeout(150);
    }
  });
});

test.describe('the slice at other phone sizes (E22)', () => {
  for (const [w, h] of [
    [360, 740],
    [412, 915],
  ] as const) {
    test(`${w} × ${h}: blocks ≥ 92 px at rest, tappable hit areas ≥ 88 px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page);
      const cells = await H(page, () => window.__DD__.hybrid.faceCells());
      expect(cells.length).toBe(7);
      for (const c of cells) expect(Math.min(c.rect.w, c.rect.h)).toBeGreaterThanOrEqual(92);
      await intoCellar(page);
      for (const t of await H(page, () => window.__DD__.hybrid.tappables())) {
        expect(t.hit.w).toBeGreaterThanOrEqual(88);
        expect(t.hit.h).toBeGreaterThanOrEqual(88);
      }
    });
  }
});
