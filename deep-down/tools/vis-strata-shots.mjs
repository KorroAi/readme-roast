// VIS (round 3): real-camera captures of the strata's biomes, lairs and gates (the game's own first
// person camera, the shipped HUD, 390 x 844 @2 by default), with draw calls and triangles per frame.
//
// Usage: node tools/vis-strata-shots.mjs [--out artifacts/r3/vis] [--seed 7] [--q balanced]
//          [--targets amberHollows,mushroomForest,lair:amberHollows,gate:1,torch:amberHollows]
//          [--views 2] [--size 390x844] [--dpr 2] [--port 4175] [--hud 1] [--sonar 0] [--prod 0]
//
// A target is a biome id (WORLD's `__DD__.goto`: a cavern of that biome, then for view 2 a spawn
// point of the same biome at least 20 m away), `lair:<biome>` (the lair's entrance, facing its
// centre), `gate:<stratum>` (the gate's stand, facing the seal) or `torch:<biome>` (a few torches
// placed by the wall in front of the eye: the torch light). Each view faces the most open direction
// from the eye (rays through the voxels). With --sonar 1 every view also fires the sonar and captures
// mid-sweep.
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/r3/vis', seed: '7', q: 'balanced', targets: 'amberHollows,mushroomForest,rootGalleries,floodedGrottoes', views: '2', size: '390x844', dpr: '2', port: '4175', hud: '1', sonar: '0', prod: '0', wait: '1500' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
const [width, height] = opt.size.split('x').map(Number);
mkdirSync(opt.out, { recursive: true });

const server = opt.prod === '1'
  ? await preview({ preview: { port: Number(opt.port), strictPort: false }, logLevel: 'error' })
  : await createServer({ server: { port: Number(opt.port), strictPort: false, hmr: false }, logLevel: 'error' });
if (opt.prod !== '1') await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr), hasTouch: true, isMobile: true });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${url}index.html?gen=strata`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 240000, polling: 250 });
  await page.evaluate(async ({ q, hud, seed }) => {
    const st = document.createElement('style');
    st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-arrival{display:none!important}' + (hud === '1' ? '' : '.dd-ui{display:none!important}');
    document.head.appendChild(st);
    const g = window.__DD__.game;
    g.updateSettings({ quality: q });
    await g.newGame(Number(seed));
    g.renderer.preset = { ...g.renderer.preset, fpsCap: 4 };
  }, { q: opt.q, hud: opt.hud, seed: opt.seed });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 180000 });
  console.log(`booted seed ${opt.seed} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const targets = opt.targets.split(',').filter(Boolean);
  for (const target of targets) {
    for (let view = 1; view <= Number(opt.views); view++) {
      const name = `${target.replace(':', '-')}-${view}`;
      const res = await page.evaluate(async ({ target, view }) => {
        const D = window.__DD__;
        const g = D.game;
        const [kind, arg] = target.includes(':') ? target.split(':') : ['biome', target];
        let look = null;
        if (kind === 'biome' || kind === 'torch') {
          const p = await D.goto(arg);
          if (!p) return { err: `goto ${arg} failed` };
          if (view > 1) {
            const L = g.strata.layout;
            const far = L.spawnPoints.filter((s) => s.biome === arg && Math.hypot(s.p[0] - p[0], s.p[2] - p[2]) > 20 + view * 6);
            const pick = far[(view * 7919) % Math.max(1, far.length)];
            if (pick) {
              const at = D.standableNear(pick.p[0], pick.p[1], pick.p[2]);
              if (at) D.teleport(at[0], at[1], at[2]);
            }
          }
        } else if (kind === 'lair') {
          const p = await D.goto('lair', arg);
          if (!p) return { err: `no lair ${arg}` };
          const l = g.strata.layout.lairs.find((a) => a.biome === arg);
          if (l && view === 1) look = l.centre;
          if (l && view > 1) {
            const at = D.standableNear(l.centre[0] + l.radius * 0.5, l.centre[1], l.centre[2]);
            if (at) D.teleport(at[0], at[1], at[2]);
            look = l.centre;
          }
        } else if (kind === 'gate') {
          if (g.strata.current !== Number(arg)) await D.stratum(Number(arg));
          const p = await D.goto('gate');
          if (!p) return { err: 'no gate' };
          look = g.strata.layout.gate.centre;
        }
        const px = g.player.x, py = g.player.y, pz = g.player.z;
        const eye = [px, py + 1.62, pz];
        // The most open direction: rays through the voxels (prefer 10-35 m of clear air).
        let yaw = 0;
        let pitch = -0.08;
        if (look) {
          yaw = Math.atan2(-(look[0] - eye[0]), -(look[2] - eye[2]));
          pitch = Math.max(-0.35, Math.min(0.2, Math.atan2(look[1] + 1 - eye[1], Math.hypot(look[0] - eye[0], look[2] - eye[2]))));
        } else {
          let best = -1;
          for (let k = 0; k < 32; k++) {
            const a = (k / 32) * Math.PI * 2;
            const dx = -Math.sin(a), dz = -Math.cos(a);
            let d = 0;
            for (; d < 40; d += 0.5) if (D.isSolid(Math.floor(eye[0] + dx * d), Math.floor(eye[1] - d * 0.05), Math.floor(eye[2] + dz * d))) break;
            const score = Math.min(d, 32) + (view > 1 ? ((k * 37) % 5) : 0);
            if (score > best) {
              best = score;
              yaw = a;
            }
          }
        }
        if (kind === 'torch') {
          // Three torches by the walls round the eye, ~4-8 m ahead: the placed-torch light.
          const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
          let n = 0;
          for (let d = 3; d < 14 && n < 3; d += 2.5) {
            const sx = eye[0] + dx * d, sz = eye[2] + dz * d;
            const at = D.standableNear(sx + (n % 2 ? 2 : -2) * dz, py, sz - (n % 2 ? 2 : -2) * dx);
            if (!at) continue;
            D.setBlock(Math.floor(at[0]), Math.floor(at[1]), Math.floor(at[2]), 115 /* B.TORCH */);
            n++;
          }
        }
        g.player.yaw = yaw + Math.PI;
        D.look(yaw, pitch);
        D.step(30);
        return { at: [px, py, pz].map((n) => +n.toFixed(1)), yaw: +yaw.toFixed(2), biome: D.biomeHere(), stratum: g.strata.current };
      }, { target, view });
      if (res.err) {
        console.log(`[${name}] ${res.err}`);
        continue;
      }
      await page.waitForTimeout(Number(opt.wait));
      await page.evaluate(() => window.__DD__.meshIdle?.());
      await page.waitForTimeout(500);
      const file = `${opt.out}/${name}.png`;
      await page.screenshot({ path: file, timeout: 180000 });
      const r = await page.evaluate(() => {
        const D = window.__DD__;
        const r = D.report();
        const g = D.game;
        return { calls: r.render.calls, tris: Math.round(r.render.triangles / 1000) + 'k', vis: g.vis.report() };
      });
      console.log(`[${name}] ${file} ${JSON.stringify(res)} calls=${r.calls} tris=${r.tris} look=${r.vis.biome} w=${JSON.stringify(r.vis.weights)} torches=${r.vis.torches}`);
      if (opt.sonar === '1') {
        await page.evaluate(() => {
          const g = window.__DD__.game;
          g.vis.sonar({ x: g.player.x, y: g.player.y + 1.2, z: g.player.z });
          window.__DD__.step(14);
        });
        await page.waitForTimeout(600);
        const sf = `${opt.out}/${name}-sonar.png`;
        await page.screenshot({ path: sf, timeout: 180000 });
        const sr = await page.evaluate(() => window.__DD__.game.vis.report());
        console.log(`[${name}-sonar] ${sf} pings=${sr.sonarPings} revealed=${sr.revealed}`);
      }
    }
  }
  if (logs.length) console.log(logs.slice(0, 12).join('\n'));
} finally {
  await browser.close();
  await (server.close?.() ?? server.httpServer?.close());
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
