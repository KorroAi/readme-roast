import { expect, test, type Page } from '@playwright/test';
import { Touch } from './touch';

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
  shaft: { floor: number };
  scene: {
    debug: {
      meshCheck(): Promise<{ checked: number; mismatched: number }>;
      lightCheck(): { checked: number; mismatched: number; maxDiff: number };
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
  test.setTimeout(600_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/visuallab.html?depth=0&crew=10,8,1,1&seed=7');
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
  expect(slabs.applied).toBeGreaterThanOrEqual(24);
  expect(slabs.pending).toBeLessThanOrEqual(2);

  // 40 real taps on the floor: every break removes its cell's voxels and throws debris.
  const touch = await Touch.attach(page);
  const before = await L.evaluate((l) => ({ breaks: l.history.length, debris: l.scene.debug.debris().spawned }));
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
    return { taps: l.taps, broken, voxels: broken.map((b) => l.scene.debug.cellVoxel(b.row, b.col)), debris: l.scene.debug.debris().spawned };
  }, before.breaks);
  console.log(JSON.stringify({ taps: after.taps, breaks: after.broken.length, debris: after.debris - before.debris }));
  expect(after.taps).toBe(40);
  expect(after.broken.length).toBeGreaterThanOrEqual(10);
  expect(after.voxels.every((v) => v === 0)).toBe(true);
  expect(after.debris - before.debris).toBeGreaterThanOrEqual(after.broken.length * 4);
  const programs1 = await L.evaluate((l) => l.scene.debug.programs());
  expect(programs1).toBe(programs0);
  expect(errors, errors.join('\n')).toEqual([]);
});
