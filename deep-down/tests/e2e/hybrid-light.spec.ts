import { expect, test, type Page } from '@playwright/test';
import { createServer, type ViteDevServer } from 'vite';

// The professional lighting stack (W1-LEAD §4; owner 1E) on the light lab (src/render/light/lab/), through the game's
// own Renderer in headless Chromium with SwiftShader (real WebGL 2), 390 × 844:
//   - every preset compiles and runs its passes (Battery none; Balanced shadows, GTAO, volumetrics, probe; High more);
//   - a grazing-angle wall is acne-free (W1-LEAD §4.2);
//   - at rest the shadows are still and the cube is never re-rendered, within the flicker's ΔL ≤ 0.01 (§4.11);
//   - the lantern casts real soft shadows that the "stack off" render does not have;
//   - the before/after captures of the lab's shots (artifacts/hybrid/w1/E/).
// The lab is served by its own Vite dev server (it is not a build input).

type Lab = {
  ready: boolean;
  frames(n: number): void;
  setShot(s: string): void;
  readLuma(name?: string): { w: number; h: number; luma: number[]; rect: [number, number, number, number] | null };
  readMask(name: string): { w: number; h: number; mask: number[] };
  stats(): {
    features: Record<string, unknown>;
    step: number;
    stackOff: boolean;
    stats: { shadowRenders: number; probeFaces: number; practicals: number };
    passes: Array<{ name: string; px: number }>;
    frame: { calls: number; tris: number };
  };
};
type Win = Window & { __LAB__: Lab };

const OUT = 'artifacts/hybrid/w1/E';
let server: ViteDevServer;
let base = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 4187, strictPort: false, hmr: false }, logLevel: 'error' });
  await server.listen();
  base = server.resolvedUrls?.local[0] ?? 'http://localhost:4187/';
  // node:fs through a string specifier (the project has no Node types; tests/unit/compat.test.ts does the same).
  const NODE_FS: string = 'node:fs';
  const fs = (await import(/* @vite-ignore */ NODE_FS)) as { mkdirSync(path: string, o: { recursive: boolean }): void };
  fs.mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await server?.close();
});

async function openLab(page: Page, query: string, errors: string[]): Promise<void> {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${base}src/render/light/lab/index.html?capture=1&${query}`);
  await page.waitForFunction(() => (window as unknown as Win).__LAB__?.ready === true, null, { timeout: 180_000 });
}

const frames = (page: Page, n: number) => page.evaluate((k) => (window as unknown as Win).__LAB__.frames(k), n);
const stats = (page: Page) => page.evaluate(() => (window as unknown as Win).__LAB__.stats());
const readLuma = (page: Page, name?: string) => page.evaluate((nm) => (window as unknown as Win).__LAB__.readLuma(nm), name);
const readMask = (page: Page, name: string) => page.evaluate((nm) => (window as unknown as Win).__LAB__.readMask(nm), name);

/**
 * Shadow-factor statistics over the panel's own pixels (the mask, eroded by 3 px so its silhouette edge is out). The
 * debug view goes through the grade, so "lit" is the panel's own 90th percentile and acne is any pixel darker than
 * 85 % of it.
 */
function panelStats(r: { w: number; h: number; luma: number[] }, m: { mask: number[] }): { n: number; dark: number; min: number; lit: number } {
  const vals: number[] = [];
  const E = 3;
  for (let y = E; y < r.h - E; y++)
    for (let x = E; x < r.w - E; x++) {
      let inside = true;
      for (let k = -E; k <= E && inside; k += E) for (let j = -E; j <= E && inside; j += E) if (!m.mask[(y + k) * r.w + x + j]) inside = false;
      if (inside) vals.push(r.luma[y * r.w + x]);
    }
  const sorted = vals.slice().sort((a, b) => a - b);
  const lit = sorted[Math.floor(sorted.length * 0.9)] ?? 1;
  let dark = 0;
  for (const v of vals) if (v < 0.85 * lit) dark++;
  return { n: vals.length, dark, min: sorted[0] ?? 0, lit };
}

test('every preset compiles and runs its passes; the ladder sheds them in order', async ({ page }) => {
  const errors: string[] = [];
  for (const q of ['battery', 'balanced', 'high'] as const) {
    await openLab(page, `q=${q}&flame=0&shot=arrival`, errors);
    await frames(page, 8);
    const s = await stats(page);
    const names = s.passes.map((p) => p.name);
    if (q === 'battery') {
      expect(names).not.toContain('gtao');
      expect(names).not.toContain('vol');
      expect(s.stats.shadowRenders).toBe(0);
    } else {
      expect(names).toEqual(expect.arrayContaining(['lightDepth', 'gtao', 'aoBlur', 'vol', 'composite', 'resolve', 'final']));
      expect(s.stats.shadowRenders).toBeGreaterThanOrEqual(1);
      expect(s.stats.probeFaces).toBe(6);
    }
    expect(s.stats.practicals).toBe(1);
    console.log(`${q}: passes ${names.join(',')} · calls ${s.frame.calls} · shadows ${s.stats.shadowRenders} · probe ${s.stats.probeFaces}`);
    await page.screenshot({ path: `${OUT}/preset-${q}-arrival.png` });
  }
  // The last ladder step on Balanced: no shadows, no GTAO, no volumetrics (the governor's floor).
  await openLab(page, 'q=balanced&flame=0&shot=arrival&ladder=6', errors);
  await frames(page, 4);
  const s = await stats(page);
  expect(s.passes.map((p) => p.name)).not.toContain('gtao');
  expect(s.stats.shadowRenders).toBe(0);
  expect(errors).toEqual([]);
});

test('a grazing-angle wall is free of shadow acne (W1-LEAD §4.2)', async ({ page }) => {
  const errors: string[] = [];
  // The raw shadow factor (debug view 1) on the smooth panel along the near wall: nothing stands between it and the
  // lantern, so every pixel should be lit (1.0); acne would show as dark stripes or speckle along the grazing run.
  for (const q of ['balanced', 'high']) {
    await openLab(page, `q=${q}&flame=0&shot=grazing&view=1`, errors);
    await frames(page, 4);
    const r = await readLuma(page);
    // The shadow-factor view itself (white = lit), before the mask pass replaces the frame.
    await page.screenshot({ path: `${OUT}/acne-grazing-shadowfactor-${q}.png` });
    const m = await readMask(page, 'lab-acne-panel');
    const st = panelStats(r, m);
    console.log(`acne (${q}): ${st.n} panel px, ${st.dark} darker than 85 % of lit ${st.lit.toFixed(3)} (${((100 * st.dark) / Math.max(1, st.n)).toFixed(3)} %), min ${st.min.toFixed(3)}`);
    expect(st.n).toBeGreaterThan(5000);
    expect(st.dark / st.n).toBeLessThan(0.002);
  }
  await openLab(page, 'q=balanced&flame=0&shot=grazing', errors);
  await frames(page, 20);
  await page.screenshot({ path: `${OUT}/acne-grazing.png` });
  expect(errors).toEqual([]);
});

test('at rest the frame is still within the flicker (mean ΔL ≤ 0.01) and the shadow cube is never re-rendered', async ({ page }) => {
  const errors: string[] = [];
  // The live flame (flicker and wobble on), the fixed 1/60 s clock.
  await openLab(page, 'q=balanced&shot=pillar', errors);
  await frames(page, 90);
  const s0 = await stats(page);
  const a = await readLuma(page);
  await frames(page, 29);
  const b = await readLuma(page);
  const s1 = await stats(page);
  let sum = 0;
  let max = 0;
  for (let i = 0; i < a.luma.length; i++) {
    const d = Math.abs(a.luma[i] - b.luma[i]);
    sum += d;
    max = Math.max(max, d);
  }
  const mean = sum / a.luma.length;
  console.log(`stillness: mean ΔL ${mean.toFixed(5)}, max ${max.toFixed(3)}, shadow renders ${s0.stats.shadowRenders} → ${s1.stats.shadowRenders}`);
  expect(mean).toBeLessThanOrEqual(0.01);
  expect(s1.stats.shadowRenders).toBe(s0.stats.shadowRenders);
  expect(errors).toEqual([]);
});

test('the lantern casts soft shadows the stack-off render does not have', async ({ page }) => {
  const errors: string[] = [];
  const shadowShare = async (query: string) => {
    await openLab(page, `q=balanced&flame=0&shot=pillar&view=1&${query}`, errors);
    await frames(page, 4);
    const r = await readLuma(page);
    let dark = 0;
    for (const v of r.luma) if (v < 0.3) dark++;
    return dark / r.luma.length;
  };
  const on = await shadowShare('');
  const off = await shadowShare('light=off');
  console.log(`shadowed share: on ${(100 * on).toFixed(2)} %, off ${(100 * off).toFixed(2)} %`);
  // The open sky above the shaft is the dark clear colour in both (≈ 0.1 %): the shadows are the difference.
  expect(on - off).toBeGreaterThan(0.005);
  expect(off).toBeLessThan(0.002);
  expect(errors).toEqual([]);
});

test('before / after: the stack changes every lab shot (captures for the beauty rubric)', async ({ page }) => {
  // Ten page loads on SwiftShader: a long test (a loaded machine needs the margin).
  test.setTimeout(1_200_000);
  const errors: string[] = [];
  // Before / after captures of every lab shot (DPR 1 here; the capture tools take DPR 2).
  for (const shot of ['arrival', 'pillar', 'shaft', 'crystal', 'grazing']) {
    const lum: number[][] = [];
    for (const mode of ['off', 'on']) {
      await openLab(page, `q=balanced&flame=0&shot=${shot}${mode === 'off' ? '&light=off' : ''}`, errors);
      await frames(page, 16);
      lum.push((await readLuma(page)).luma);
      await page.screenshot({ path: `${OUT}/${shot}-${mode === 'off' ? 'before' : 'after'}.png` });
    }
    let d = 0;
    for (let i = 0; i < lum[0].length; i++) d += Math.abs(lum[0][i] - lum[1][i]);
    console.log(`${shot}: mean |after − before| ${(d / lum[0].length).toFixed(4)}`);
    expect(d / lum[0].length).toBeGreaterThan(0.01);
  }
  expect(errors).toEqual([]);
});
