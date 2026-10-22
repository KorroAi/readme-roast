// MOBS diagnostic (temporary): is a creature drawn where it stands? One Grit Boar on open floor in the
// Amber Hollows: a normal shot, a shot with everything but the creatures hidden, and the bone texture's
// first bone checked against the creature's position on the CPU.
// Usage: node tools/mob-diag.mjs <outDir> [kind] [biome]
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'artifacts/r3/mobs/diag';
const kind = process.argv[3] ?? 'gritBoar';
const biome = process.argv[4] ?? 'amberHollows';
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 4177, strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`);
  });
  await page.goto('http://localhost:4177/index.html?gen=strata&debug=1');
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 240_000, polling: 250 });
  await page.evaluate(async () => {
    const st = document.createElement('style');
    st.textContent = '.dd-ui,.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-arrival{display:none!important}';
    document.head.appendChild(st);
    await window.__DD__.game.newGame(7);
  });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 240_000, polling: 250 });
  log('playing');
  await page.evaluate(() => {
    const m = window.__DD__.mobs;
    window.__DD__.game.quests?.skipTutorial?.();
    m.auto(false);
    m.clear();
    m.harmless(true);
  });
  await page.evaluate((b) => window.__DD__.goto(b), biome);
  await page.evaluate(() => window.__DD__.step(30, 1 / 30));
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__DD__.meshIdle?.());
  await page.evaluate(() => window.__DD__.mobs.clear());
  // Turn until open floor 3-6 m ahead.
  let f = null;
  for (let k = 0; k < 24 && !f; k++) {
    f = await page.evaluate(() => window.__DD__.mobs.floorAhead(3, 6));
    if (!f) await page.evaluate((w) => window.__DD__.look(w, -0.15), (await page.evaluate(() => window.__DD__.game.cameraRig.yaw)) + Math.PI / 12);
  }
  log('floor ahead', JSON.stringify(f));
  const id = await page.evaluate(([k, p]) => window.__DD__.mobs.spawn(k, p[0], p[1], p[2], { asleep: false }), [kind, f ?? [0, 0, 0]]);
  await page.evaluate((i) => {
    const m = window.__DD__.mobs;
    m.freeze(true);
    m.setAnim(i, { face: true, glow: 1 });
  }, id);
  const mob = await page.evaluate((i) => window.__DD__.mobs.get(i), id);
  await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y, z, 0), [mob.x, mob.y, mob.z]);
  await page.evaluate(() => window.__DD__.step(4, 1 / 30));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/a-normal.png` });
  // The creatures only: every other root object hidden.
  const info = await page.evaluate((i) => {
    const g = window.__DD__.game;
    const mobs = g.mobs;
    const hidden = [];
    for (const o of g.scene.children) {
      if (o === mobs.group) continue;
      if (o.visible) {
        hidden.push(o.name || o.type);
        o.visible = false;
      }
    }
    const r = mobs.renderer;
    const tex = r.boneTex;
    const d = tex.image.data;
    const m = mobs.sim.mobs.find((x) => x.id === i);
    const batches = [];
    mobs.group.traverse((o) => {
      if (o.isMesh && o.visible) batches.push({ name: o.name, count: o.geometry.instanceCount ?? null, verts: o.geometry.getAttribute('position')?.count ?? 0, mat: o.material?.type, prog: !!o.material?.program });
    });
    return { hidden, firstBone: [d[3], d[7], d[11]], firstRowScale: Math.hypot(d[0], d[4], d[8]), pos: m ? [m.position.x, m.position.y, m.position.z] : null, scale: m?.scale, fade: m?.fade, cam: [g.cameraRig.camera.position.x, g.cameraRig.camera.position.y, g.cameraRig.camera.position.z], batches, texSize: [tex.image.width, tex.image.height], texType: tex.type };
  }, id);
  log('info', JSON.stringify(info));
  await page.evaluate(() => window.__DD__.step(1, 1 / 30));
  await page.waitForTimeout(400);
  const shot = await page.screenshot({ path: `${out}/b-mobs-only.png` });
  // Where the creature should be on screen (its capsule's box projected) against where pixels are lit.
  const boxes = await page.evaluate(async ([b64, i]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g2 = c.getContext('2d');
    g2.drawImage(img, 0, 0);
    const d = g2.getImageData(0, 0, c.width, c.height).data;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, lit = 0;
    for (let y = 0; y < c.height; y++)
      for (let x = 0; x < c.width; x++) {
        const k = (y * c.width + x) * 4;
        if (Math.max(d[k], d[k + 1], d[k + 2]) > 28) {
          lit++;
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    const g = window.__DD__.game;
    const m = g.mobs.sim.mobs.find((q) => q.id === i);
    const cam = g.cameraRig.camera;
    cam.updateMatrixWorld();
    let px0 = Infinity, py0 = Infinity, px1 = -Infinity, py1 = -Infinity;
    const r = m.bounds.radius;
    const h = m.bounds.halfHeight + r;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const v = cam.position.clone().set(m.position.x + sx * r, m.position.y + sy * h, m.position.z + sz * r).project(cam);
      const X = ((v.x + 1) / 2) * c.width;
      const Y = ((1 - v.y) / 2) * c.height;
      px0 = Math.min(px0, X);
      py0 = Math.min(py0, Y);
      px1 = Math.max(px1, X);
      py1 = Math.max(py1, Y);
    }
    return { lit, litBox: [x0, y0, x1, y1], expected: [Math.round(px0), Math.round(py0), Math.round(px1), Math.round(py1)], size: [c.width, c.height] };
  }, [shot.toString('base64'), id]);
  log('boxes', JSON.stringify(boxes));
  // Shader programs: any that failed?
  const progs = await page.evaluate(() => {
    const info = window.__DD__.game.renderer.gl.info;
    return info ? info.programs?.map((p) => ({ name: p.name, diag: p.diagnostics ? { ok: p.diagnostics.runnable, frag: p.diagnostics.fragmentShader?.log?.slice(0, 300), vert: p.diagnostics.vertexShader?.log?.slice(0, 300) } : null })).filter((p) => p.diag && !p.diag.ok) : 'no info';
  });
  log('failed programs', JSON.stringify(progs));
  console.log('console:', [...new Set(errors)].slice(0, 15).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
