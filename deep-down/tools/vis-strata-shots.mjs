// VIS (round 3): real-camera captures of the strata's biomes, lairs and gates (the game's own first
// person camera, the shipped HUD, 390 x 844 @2 by default), with draw calls and triangles per frame.
//
// Usage: node tools/vis-strata-shots.mjs [--out artifacts/r3/vis] [--seed 7] [--q balanced]
//          [--targets amberHollows,mushroomForest,lair:amberHollows,gate:1,torch:amberHollows]
//          [--views 2] [--size 390x844] [--dpr 2] [--port 4175] [--hud 1] [--sonar 0] [--prod 0]
//          [--eval "<js run in the page after each view; its JSON result is printed>"]
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
const opt = { eval: '', blockmap: '0', calls: '0', out: 'artifacts/r3/vis', seed: '7', q: 'balanced', targets: 'amberHollows,mushroomForest,rootGalleries,floodedGrottoes', views: '2', size: '390x844', dpr: '2', port: '4175', hud: '1', sonar: '0', prod: '0', wait: '1500' };
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
  page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
  await page.goto(`${url}index.html?gen=strata`);
  try {
    await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 420000, polling: 500 });
  } catch (e) {
    console.log('boot timed out; logs:\n' + logs.slice(0, 20).join('\n'));
    throw e;
  }
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

  // A target may carry its own view count: `amberHollows*2`.
  const targets = opt.targets.split(',').filter(Boolean);
  for (const spec of targets) {
    const [target, nViews] = spec.split('*');
    for (let view = 1; view <= Number(nViews ?? opt.views); view++) {
      const name = `${target.replace(':', '-')}-${view}`;
      const res = await page.evaluate(async ({ target, view }) => {
        const D = window.__DD__;
        const g = D.game;
        const [kind, arg] = target.includes(':') ? target.split(':') : ['biome', target];
        let look = null;
        // A standable cell near (x, y, z): the floor under it (down to 14 m) in a small spiral.
        const stand = (x, y, z) => {
          for (let r = 0; r <= 5; r++)
            for (let dz = -r; dz <= r; dz++)
              for (let dx = -r; dx <= r; dx++) {
                if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
                const cx = Math.floor(x) + dx, cz = Math.floor(z) + dz;
                for (let dy = 6; dy >= -14; dy--) {
                  const cy = Math.floor(y) + dy;
                  if (!D.isSolid(cx, cy, cz) && !D.isSolid(cx, cy + 1, cz) && D.isSolid(cx, cy - 1, cz)) return [cx + 0.5, cy, cz + 0.5];
                }
              }
          return null;
        };
        if (kind === 'biome' || kind === 'torch' || kind === 'stations' || kind === 'climb') {
          const p = await D.goto(arg);
          if (!p) return { err: `goto ${arg} failed` };
          const L = g.strata.layout;
          // A cavern of the biome that is not its lair (view 1, 3...), else a spawn point far off.
          const lairs = L.lairs.filter((l) => l.biome === arg);
          const cav = L.caverns.filter((c) => c.biome === arg && !lairs.some((l) => Math.hypot(l.centre[0] - c.centre[0], l.centre[2] - c.centre[2]) < l.radius + 3));
          let at = null;
          if (view % 2 === 1 && cav.length) {
            const c = cav[((view - 1) / 2) % cav.length];
            at = stand(c.centre[0], c.centre[1], c.centre[2]);
          }
          if (!at) {
            const far = L.spawnPoints.filter((s) => s.biome === arg && Math.hypot(s.p[0] - p[0], s.p[2] - p[2]) > 20 + view * 6);
            const pick = far[(view * 7919) % Math.max(1, far.length)];
            if (pick) at = stand(pick.p[0], pick.p[1] + 1, pick.p[2]);
          }
          if (at) D.teleport(at[0], at[1], at[2]);
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
        if (kind === 'stations') {
          // LOOP's stations and an outpost in an arc 3-5 m ahead (the models as placed in play).
          const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
          const kinds = ['furnace', 'forge', 'alchemyTable', 'outpost'];
          kinds.forEach((st, i) => {
            const side = (i - 1.5) * 1.9;
            const at = stand(eye[0] + dx * (3.6 + Math.abs(side) * 0.3) + dz * side, py + 1, eye[2] + dz * (3.6 + Math.abs(side) * 0.3) - dx * side);
            if (!at) return;
            if (st === 'outpost') g.loop.placeOutpost({ x: at[0], y: at[1], z: at[2] });
            else g.loop.placeStation(st, { x: at[0], y: at[1], z: at[2] });
          });
          pitch = -0.2;
        }
        if (kind === 'climb') {
          // A ladder up the nearest wall ahead and a rope down beside it (the placed climbables).
          const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
          for (let d = 2; d < 12; d += 0.5) {
            const x = Math.floor(eye[0] + dx * d), z = Math.floor(eye[2] + dz * d);
            if (D.isSolid(x, Math.floor(py) + 1, z)) {
              const lx = Math.floor(eye[0] + dx * (d - 1)), lz = Math.floor(eye[2] + dz * (d - 1));
              for (let y = Math.floor(py); y < Math.floor(py) + 5; y++) D.setBlock(lx, y, lz, 113 /* B.LADDER */);
              const rx = lx + (Math.abs(dz) > Math.abs(dx) ? 2 : 0), rz = lz + (Math.abs(dx) >= Math.abs(dz) ? 2 : 0);
              for (let y = Math.floor(py); y < Math.floor(py) + 5; y++) if (!D.isSolid(rx, y, rz)) D.setBlock(rx, y, rz, 114 /* B.ROPE */);
              break;
            }
          }
          pitch = 0.12;
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
      if (opt.calls === '1') {
        // Draw calls and triangles per scene group: each hidden in turn and the frame re-rendered.
        const parts = await page.evaluate(() => {
          const g = window.__DD__.game;
          const r = g.renderer;
          const cam = g.cameraRig.camera;
          const info = r.gl.info;
          const measure = () => {
            r.render(g.scene, cam, g.time);
            return [info.render.calls, info.render.triangles];
          };
          const [c0, t0] = measure();
          const out = { total: `${c0}/${Math.round(t0 / 1000)}k` };
          const visit = (list, prefix) => {
            for (const c of list) {
              if (!c.visible) continue;
              c.visible = false;
              const [c1, t1] = measure();
              c.visible = true;
              const dc = c0 - c1;
              if (dc <= 0) continue;
              const key = `${prefix}${c.name || c.type}`;
              out[key] = `${dc}/${Math.round((t0 - t1) / 1000)}k`;
              if (dc >= 12 && c.children.length > 1 && c.children.length <= 40 && prefix.length < 8) visit(c.children, `${key}>`);
            }
          };
          visit(g.scene.children, '');
          // The props: baked decor cells vs single props.
          const pr = g.session.props;
          const decor = pr.decor.group;
          decor.visible = false;
          const [c2, t2] = measure();
          decor.visible = true;
          out['props>decor'] = `${c0 - c2}/${Math.round((t0 - t2) / 1000)}k (${pr.decor.drawnCells} cells, ${pr.decor.count} baked)`;
          let roots = 0;
          for (const ch of pr.group.children) if (ch !== decor && ch.visible) roots++;
          out['props>single'] = `${roots} visible`;
          return out;
        });
        console.log(`[${name}] calls: ${JSON.stringify(parts)}`);
      }
      if (opt.blockmap === '1') {
        // The first solid block (id) and its distance (m) under a 10 x 20 grid of screen points.
        const rows = await page.evaluate(() => {
          const g = window.__DD__.game;
          const c = g.cameraRig.camera;
          c.updateMatrixWorld(true);
          const w = g.session.world;
          const V = c.position.constructor;
          const out = [];
          for (let j = 0; j < 20; j++) {
            const row = [];
            for (let i = 0; i < 10; i++) {
              const v = new V((i + 0.5) / 5 - 1, 1 - (j + 0.5) / 10, 0.5).unproject(c).sub(c.position).normalize();
              let hit = '  .  ';
              for (let d = 0.1; d < 70; d += 0.05) {
                const id = w.get(Math.floor(c.position.x + v.x * d), Math.floor(c.position.y + v.y * d), Math.floor(c.position.z + v.z * d));
                if (window.__DD__.isSolid(Math.floor(c.position.x + v.x * d), Math.floor(c.position.y + v.y * d), Math.floor(c.position.z + v.z * d))) {
                  hit = `${String(id).padStart(3)}@${String(Math.round(d)).padStart(2)}`;
                  break;
                }
              }
              row.push(hit);
            }
            out.push(row.join(' '));
          }
          return out;
        });
        console.log(rows.map((r) => `   ${r}`).join('\n'));
      }
      if (opt.eval) console.log(`[${name}] eval: ${await page.evaluate((src) => { try { return JSON.stringify((0, eval)(src)); } catch (e) { return 'error ' + e.message; } }, opt.eval)}`);
      if (opt.sonar === '1') {
        await page.evaluate(() => {
          const g = window.__DD__.game;
          g.vis.sonar({ x: g.player.x, y: g.player.y + 1.2, z: g.player.z });
          window.__DD__.step(8);
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
