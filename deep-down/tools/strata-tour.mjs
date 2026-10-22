// WORLD tool (round 3): a real-camera tour of the strata's great places on a served build: the vista
// from its balcony and from its floor, the river's spring, the Halden works (its hall, then the vault
// once its lock is solved through the game's own lock), every set piece, a secret room. One PNG per
// view, the UI hidden (the world only), timings and console errors printed.
//
// Usage: node tools/strata-tour.mjs <outDir> [--strata 1,2,3,4,5,6] [--seed 12345] [--port 4176]
//          [--only vista,works,...] [--size 390x844] [--hud 0]
// Needs a preview of the build on --port (npx vite build --outDir .e2e-dist-4176 && npx vite preview --port 4176 --outDir .e2e-dist-4176).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2];
const args = process.argv.slice(3);
const opt = { strata: '1,2,3,4,5,6', seed: '12345', port: process.env.DD_E2E_PORT ?? '4176', only: '', size: '390x844', hud: '0', wait: '1800' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);
mkdirSync(out, { recursive: true });
const want = (k) => !opt.only || opt.only.split(',').includes(k);

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`http://localhost:${opt.port}/index.html`);
await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 300000, polling: 500 });
await page.evaluate(async ({ seed, hud }) => {
  const st = document.createElement('style');
  st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-arrival{display:none!important}' + (hud === '1' ? '' : '.dd-ui{display:none!important}');
  document.head.appendChild(st);
  await window.__DD__.game.newGame(Number(seed));
}, { seed: opt.seed, hud: opt.hud });
await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 180000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const settle = async () => {
  await page.evaluate(() => window.__DD__.meshIdle?.());
  await page.waitForTimeout(Number(opt.wait));
};
const shot = async (name, info) => {
  await settle();
  const path = `${out}/${name}.png`;
  await page.screenshot({ path });
  console.log(`  ${name}: ${JSON.stringify(info ?? {})}`);
};
/** Teleport with the debug hook, then look (yaw, pitch); returns where we stand. */
const go = (where, which, look) => page.evaluate(async ({ where, which, look }) => {
  const p = await window.__DD__.goto(where, which);
  if (p && look) window.__DD__.look(look[0], look[1]);
  return p;
}, { where, which, look });
/** Face (x, z) from the explorer: the camera's yaw convention (CameraRig yaw = heading + PI). */
const face = (tx, tz, pitch = -0.1) => page.evaluate(({ tx, tz, pitch }) => {
  const s = window.__DD__.state().player;
  const heading = Math.atan2(tx - s.x, tz - s.z);
  window.__DD__.look(heading + Math.PI, pitch);
  return heading;
}, { tx, tz, pitch });

for (const n of opt.strata.split(',').map(Number)) {
  const t1 = Date.now();
  await page.evaluate((n) => window.__DD__.stratum(n), n);
  await page.waitForFunction((n) => window.__DD__.stratum() === n && window.__DD__.state().mode === 'playing', n, { timeout: 180000 });
  const info = await page.evaluate(() => window.__DD__.strata());
  console.log(`stratum ${n} (${info.biomes.join(' + ')}) loaded in ${((Date.now() - t1) / 1000).toFixed(1)} s`);
  try {
    if (want('vista') && info.vista) {
      const v = info.vista;
      await go('vista');
      await face(v.centre[0], v.centre[2], -0.32);
      await shot(`s${n}-vista-balcony`, { name: v.name, balcony: v.balcony });
      await go('vistaFloor');
      await face(v.balcony[0], v.balcony[2], 0.35);
      await shot(`s${n}-vista-floor`, { looking: 'up at the balcony and the fall' });
    }
    if (want('river') && info.rivers[0]) {
      const r = info.rivers[0];
      await go('river');
      await face(r.mouth[0], r.mouth[2], -0.2);
      await shot(`s${n}-river-spring`, { kind: r.kind, points: r.points });
    }
    if (want('works') && info.dungeon) {
      const d = info.dungeon;
      await go('works');
      await face(d.hall[0], d.hall[2], -0.05);
      await shot(`s${n}-works-entry`, { puzzle: d.puzzle, locks: d.sockets.length });
      // Solve the lock the game's way: pull every lever, or step on every plate in order.
      const solved = await page.evaluate(async (d) => {
        const g = window.__DD__.game;
        const works = g.strata.works;
        if (d.puzzle === 'levers') for (const id of d.levers) works.pull(id);
        else {
          for (const cells of d.plates) {
            const [x, y, z] = cells[0];
            g.player.teleport(x + 0.5, y + 1, z + 0.5);
            works.update(1, x + 0.5, y + 1, z + 0.5);
            works.update(1, x + 0.5 + 5, y + 1, z + 0.5);
          }
        }
        return { set: works.setCount(), open: works.isOpen() };
      }, d);
      await go('vault');
      await face(d.vault[0] + (d.vault[0] - d.entry[0]), d.vault[2] + (d.vault[2] - d.entry[2]), -0.15);
      await shot(`s${n}-works-vault`, solved);
    }
    if (want('sets')) {
      for (const s of info.sites.filter((s) => s.kind === 'setPiece')) {
        const at = await go('site', s.name);
        if (!at) continue;
        // Stand back toward the rim and look across the piece.
        await page.evaluate(({ c, r }) => {
          const p = window.__DD__.state().player;
          const dx = p.x - c[0];
          const dz = p.z - c[2];
          const l = Math.hypot(dx, dz) || 1;
          const sp = window.__DD__.standableNear(c[0] + (dx / l) * r * 0.75, c[1] + 2, c[2] + (dz / l) * r * 0.75);
          if (sp) window.__DD__.teleport(sp[0], sp[1], sp[2]);
        }, { c: s.centre, r: s.radius });
        await face(s.centre[0], s.centre[2], -0.12);
        await shot(`s${n}-set-${s.name}`, { biome: s.biome });
      }
    }
    if (want('secret') && info.secrets[0]) {
      const sc = info.secrets[0];
      await go('secret', sc.biome);
      await face(sc.centre[0] + 3, sc.centre[2], -0.1);
      await shot(`s${n}-secret`, { biome: sc.biome });
    }
  } catch (e) {
    console.log(`  stratum ${n}: ${e.message}`);
  }
}
const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null));
console.log(`heap ${mem} MB; ${logs.length} console warnings/errors`);
for (const l of logs.slice(0, 30)) console.log('  ' + l);
await browser.close();
