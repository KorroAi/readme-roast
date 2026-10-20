import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';
import { BIOMES } from '../../src/idle/config/biomes';

// The streamed world (BUILD §2.2, SPEC §6.2), driven through the Biome Lab (visuallab.html: the descent scene
// on a stand-in shaft built from the model's pure row table). The crew-only descent runs 400 rows at the
// 6 rows/s envelope with every frame sampled; then real touches (CDP) dig the floor.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });

type Lab = {
  ready: boolean;
  frames: number;
  autoRows: number;
  sampling: boolean;
  samples: number[];
  history: Array<{ row: number; col: number }>;
  taps: number;
  fxSamples: Array<{ p: number; s: number }>;
  shaft: { floor: number };
  setDepth(m: number): Promise<void>;
  dolly(): void;
  scene: {
    debug: {
      meshCheck(): Promise<{ checked: number; mismatched: number }>;
      lightCheck(): { checked: number; mismatched: number; maxDiff: number; openMismatched: number; openMaxDiff: number };
      particles(): { live: number; cap: number; spawned: number; refused: number };
      shards(): { live: number; cap: number; spawned: number; refused: number };
      dressing(): { lamps: number; crew: number; props: number; creatures: number; entities: number; batches: number };
      calls(): number;
      missingChunks(): number;
      slabs(): { first: number; last: number; applied: number; maxApplyMs: number; pending: number; worker: boolean };
      debris(): { live: number; spawned: number };
      cellVoxel(row: number, col: number): number;
      programs(): number;
    };
    columns(): { left: number; right: number; floorY: number };
  };
};

const lab = (page: Page) => page.evaluateHandle(() => (window as unknown as { __DD__: { lab: Lab } }).__DD__.lab);

async function waitFloor(page: Page, depth: number, timeoutMs: number): Promise<void> {
  await page.waitForFunction((d) => (window as unknown as { __DD__: { lab: Lab } }).__DD__.lab.shaft.floor >= d, depth, { timeout: timeoutMs, polling: 250 });
}

test('streams 400 rows with no missing chunk in view, meshes and light equal a fresh build, then real taps dig', async ({ page }) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  // Battery preset: the streaming checks do not depend on the post chain, and SwiftShader frames are cheaper.
  await page.goto('/visuallab.html?depth=0&crew=10,8,1,1&seed=7&quality=battery');
  await page.waitForFunction(() => (window as unknown as { __DD__?: { ready?: boolean } }).__DD__?.ready === true, null, { timeout: 120_000, polling: 250 });
  const L = await lab(page);
  // Shader programs after the first frames: no compile may follow (P3).
  await page.waitForTimeout(1500);
  const programs0 = await L.evaluate((l) => l.scene.debug.programs());

  // The crew-only descent at the 6 rows/s envelope, sampling every frame.
  await L.evaluate((l) => {
    l.samples.length = 0;
    l.sampling = true;
    l.autoRows = 6;
  });
  const checks: Array<{ depth: number; mesh: { checked: number; mismatched: number } }> = [];
  for (const depth of [100, 200, 400]) {
    await waitFloor(page, depth, 400_000);
    await L.evaluate((l) => {
      l.autoRows = 0;
    });
    const mesh = await L.evaluate((l) => l.scene.debug.meshCheck());
    checks.push({ depth, mesh });
    if (depth < 400)
      await L.evaluate((l) => {
        l.autoRows = 6;
      });
  }
  const samples = await L.evaluate((l) => {
    l.sampling = false;
    return l.samples;
  });
  const slabs = await L.evaluate((l) => l.scene.debug.slabs());
  const light = await L.evaluate((l) => l.scene.debug.lightCheck());
  console.log(JSON.stringify({ frames: samples.length, missingMax: Math.max(...samples), checks, slabs, light }));
  expect(samples.length).toBeGreaterThan(60);
  // Every chunk in view has its mesh: a slab arrives 96 m below the floor, long before it is seen.
  expect(Math.max(...samples)).toBe(0);
  for (const c of checks) expect(c.mesh.mismatched, `meshCheck at ${c.depth} m`).toBe(0);
  expect(light.mismatched, `light at 400 m (max diff ${light.maxDiff})`).toBe(0);
  // W4: the openness the props and the terrain read is the exact one, after streaming and after breaks.
  expect(light.openMismatched, `openness at 400 m (max diff ${light.openMaxDiff})`).toBe(0);
  expect(slabs.applied).toBeGreaterThanOrEqual(24);
  expect(slabs.pending).toBeLessThanOrEqual(2);

  // 40 real taps on the floor: every break removes its cell's voxels and throws debris (once the camera has caught
  // up with the floor: the descent ran by wall-clock time on a slow software renderer).
  await page.waitForFunction(() => {
    const c = (window as unknown as { __DD__: { lab: Lab } }).__DD__.lab.scene.columns();
    return c.floorY > 150 && c.floorY < 700;
  }, null, { timeout: 120_000, polling: 250 });
  const touch = await Touch.attach(page);
  const before = await L.evaluate((l) => ({ breaks: l.history.length, debris: l.scene.debug.debris().spawned, particles: l.scene.debug.particles().spawned }));
  const cols = await L.evaluate((l) => l.scene.columns());
  const w = (cols.right - cols.left) / 7;
  for (let i = 0; i < 40; i++) {
    const c = (i * 3) % 7;
    await touch.tap({ x: cols.left + (c + 0.5) * w, y: cols.floorY - 60 + (i % 5) * 30 });
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  const after = await L.evaluate((l, n) => {
    const broken = l.history.slice(n);
    return { taps: l.taps, broken, voxels: broken.map((b) => l.scene.debug.cellVoxel(b.row, b.col)), debris: l.scene.debug.debris().spawned, particles: l.scene.debug.particles().spawned };
  }, before.breaks);
  console.log(JSON.stringify({ taps: after.taps, breaks: after.broken.length, shatters: after.debris - before.debris, particles: after.particles - before.particles }));
  expect(after.taps).toBe(40);
  expect(after.broken.length).toBeGreaterThanOrEqual(10);
  expect(after.voxels.every((v) => v === 0)).toBe(true);
  // W2: every break shatters its cell (one shard burst of 9-12 BSP pieces each) and throws dust and sparks.
  expect(after.debris - before.debris).toBeGreaterThanOrEqual(after.broken.length);
  expect(after.particles - before.particles).toBeGreaterThanOrEqual(after.broken.length * 4);
  const programs1 = await L.evaluate((l) => l.scene.debug.programs());
  expect(programs1).toBe(programs0);
  expect(errors, errors.join('\n')).toEqual([]);
});

async function boot(page: Page, query: string): Promise<{ L: Awaited<ReturnType<typeof lab>>; errors: string[] }> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/visuallab.html?${query}`);
  await page.waitForFunction(() => (window as unknown as { __DD__?: { ready?: boolean } }).__DD__?.ready === true, null, { timeout: 120_000, polling: 250 });
  return { L: await lab(page), errors };
}

/** `n` real touches spread over the floor's columns (the lab maps a touch to the column under it). */
async function tapFloor(page: Page, L: Awaited<ReturnType<typeof lab>>, touch: Touch, n: number): Promise<void> {
  const cols = await L.evaluate((l) => l.scene.columns());
  const w = (cols.right - cols.left) / 7;
  for (let i = 0; i < n; i++) {
    const c = (i * 3) % 7;
    await touch.tapAt(cols.left + (c + 0.5) * w, cols.floorY - 40 + (i % 4) * 20);
    await page.waitForTimeout(30);
  }
}

// BUILD W2 2B MUST (W2 §4): every biome 0-13 dresses its caverns, 30 real taps per biome stay inside the
// particle and shard caps every frame, and no shader compiles after load (P3).
test('a 14-biome tour: dressed caverns, 30 taps each within the FX caps, no new shader program', async ({ page }) => {
  test.setTimeout(1_800_000);
  // Battery: the harshest caps, and the cheapest SwiftShader frames (a CDP touch waits for the frame).
  const { L, errors } = await boot(page, 'depth=0&crew=10,8,1,1&seed=7&quality=battery');
  await page.waitForTimeout(1500);
  const programs0 = await L.evaluate((l) => l.scene.debug.programs());
  const touch = await Touch.attach(page);
  const rows: Array<{ biome: number; depth: number; props: number; creatures: number; breaks: number; maxP: number; capP: number; maxS: number; capS: number; calls: number; programs: number }> = [];
  for (let b = 0; b < 14; b++) {
    const depth = b === 0 ? 25 : BIOMES[b].start + 22;
    await L.evaluate((l, d) => l.setDepth(d), depth);
    await page.waitForTimeout(600);
    const before = await L.evaluate((l) => {
      l.fxSamples.length = 0;
      l.sampling = true;
      return l.history.length;
    });
    await tapFloor(page, L, touch, 30);
    await page.waitForTimeout(500);
    const r = await L.evaluate((l, n) => {
      l.sampling = false;
      const d = l.scene.debug;
      const dress = d.dressing();
      return {
        props: dress.props,
        creatures: dress.creatures,
        breaks: l.history.length - n,
        maxP: Math.max(0, ...l.fxSamples.map((x) => x.p)),
        capP: d.particles().cap,
        maxS: Math.max(0, ...l.fxSamples.map((x) => x.s)),
        capS: d.shards().cap,
        calls: d.calls(),
        programs: d.programs(),
      };
    }, before);
    rows.push({ biome: b, depth, ...r });
  }
  console.log(JSON.stringify(rows));
  for (const r of rows) {
    expect(r.props, `biome ${r.biome}: props near the floor`).toBeGreaterThan(5);
    expect(r.breaks, `biome ${r.biome}: 30 taps break cells`).toBeGreaterThanOrEqual(3);
    expect(r.maxP, `biome ${r.biome}: particles within the cap`).toBeLessThanOrEqual(r.capP);
    expect(r.maxS, `biome ${r.biome}: shards within the cap`).toBeLessThanOrEqual(r.capS);
    expect(r.programs, `biome ${r.biome}: no shader compiled after load`).toBe(programs0);
  }
  expect(rows.some((r) => r.creatures > 0)).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

// W2 §4 (Vistas): at a Vista the camera dollies out; the columns stay where the finger lands, so real taps
// still dig the floor during and after the dolly.
test('a Vista dolly keeps real taps on the floor', async ({ page }) => {
  test.setTimeout(600_000);
  const s = BIOMES[2].start;
  const top = s + Math.round(0.35 * (BIOMES[3].start - s));
  const { L, errors } = await boot(page, `depth=${top + 6}&crew=10,8,1,1&seed=7&quality=battery`);
  await page.waitForTimeout(1200);
  await L.evaluate((l) => l.dolly());
  await page.waitForTimeout(1600);
  const touch = await Touch.attach(page);
  const before = await L.evaluate((l) => ({ breaks: l.history.length, taps: l.taps, cols: l.scene.columns() }));
  await tapFloor(page, L, touch, 24);
  await page.waitForTimeout(400);
  const after = await L.evaluate((l, n) => {
    const broken = l.history.slice(n);
    return { taps: l.taps, broken: broken.length, voxels: broken.map((b) => l.scene.debug.cellVoxel(b.row, b.col)), cols: l.scene.columns() };
  }, before.breaks);
  console.log(JSON.stringify({ before: before.cols, after: after.cols, broken: after.broken }));
  // Dollied out, the shaft is narrower on screen than the 7-column width lock (44 px/m at 390 px).
  expect(before.cols.right - before.cols.left).toBeLessThan(300);
  expect(after.taps - before.taps).toBe(24);
  expect(after.broken).toBeGreaterThanOrEqual(3);
  expect(after.voxels.every((v) => v === 0)).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});
