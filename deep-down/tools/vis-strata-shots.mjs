// VIS (round 3): real-camera captures of the strata's biomes, lairs and gates (the game's own first
// person camera, the shipped HUD, 390 x 844 @2 by default), with draw calls and triangles per frame.
//
// Usage: node tools/vis-strata-shots.mjs [--out artifacts/r3/vis] [--seed 7] [--q balanced]
//          [--targets amberHollows,mushroomForest,lair:amberHollows,gate:1,torch:amberHollows,go:vista@2]
//          [--views 2] [--size 390x844] [--dpr 2] [--port 4175] [--hud 1] [--sonar 0] [--prod 0]
//          [--eval "<js run in the page after each view; its JSON result is printed>"]
//          [--pre "<js run once before the first view>" | --pre @file.js]
//
// A target is a biome id (WORLD's `__DD__.goto`: a cavern of that biome, then for view 2 a spawn
// point of the same biome at least 20 m away), `lair:<biome>` (the lair's entrance, facing its
// centre), `gate:<stratum>` (the gate's stand, facing the seal) or `torch:<biome>` (a few torches
// placed by the wall in front of the eye: the torch light) or `go:<where>[:which][@stratum]` (WORLD's
// structures through `__DD__.goto`: vista, vistaFloor, river, works, vault, secret, site:<name>, heart,
// facing what they are about). Each view faces the most open direction
// from the eye (rays through the voxels). With --sonar 1 every view also fires the sonar and captures
// mid-sweep.
import { chromium } from '@playwright/test';
import { createServer, preview } from 'vite';
import { mkdirSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { eval: '', pre: '', blockmap: '0', calls: '0', out: 'artifacts/r3/vis', seed: '7', q: 'balanced', targets: 'amberHollows,mushroomForest,rootGalleries,floodedGrottoes', views: '2', size: '390x844', dpr: '2', port: '4175', hud: '1', sonar: '0', prod: '0', wait: '1500' };
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
    st.textContent = '.dd-discovery,.dd-hint,.dd-hint3,.dd-milestone,.dd-toasts,.dd-toast,.dd-tutorial,.dd-tut,.dd-arrival{display:none!important}' + (hud === '1' ? '' : '.dd-ui{display:none!important}');
    document.head.appendChild(st);
    const g = window.__DD__.game;
    g.updateSettings({ quality: q });
    await g.newGame(Number(seed));
    // The real game with its tutorial done (its bubble would sit over the view).
    (g.quests ?? g.loop?.quests)?.skipTutorial?.();
    // No creatures in the frame (MOBS captures its own): the spawner off, the field cleared.
    window.__DD__.mobs?.auto?.(false);
    window.__DD__.mobs?.clear?.();
    // The game's own loop all but stopped (a frame every 20 s): every frame of a view is rendered by
    // D.step, and a screenshot only composites the last one (no SwiftShader render of its own).
    g.renderer.preset = { ...g.renderer.preset, fpsCap: 0.05 };
  }, { q: opt.q, hud: opt.hud, seed: opt.seed });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 180000 });
  console.log(`booted seed ${opt.seed} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  // --pre "<js expression>" (or --pre @file.js): run once in the page before the first view, e.g. to
  // try look values without a rebuild (an async IIFE importing /src/render/lighting.ts and
  // re-registering a biome's atmosphere). Its JSON result is printed.
  if (opt.pre) {
    const src = opt.pre.startsWith('@') ? readFileSync(opt.pre.slice(1), 'utf8') : opt.pre;
    console.log(`pre: ${await page.evaluate(async (src) => { try { return JSON.stringify(await (0, eval)(src)); } catch (e) { return 'error ' + e.message; } }, src)}`);
  }

  // A target may carry its own view count: `amberHollows*2`.
  const targets = opt.targets.split(',').filter(Boolean);
  for (const spec of targets) {
    const [target, nViews] = spec.split('*');
    for (let view = 1; view <= Number(nViews ?? opt.views); view++) {
      const name = `${target.replace(/[:@]/g, '-')}-${view}`;
      // One view's failure (a target that does not exist in this layout, an API change) is logged and
      // the next view goes on.
      const res = await page.evaluate(async ({ target, view }) => {
        const D = window.__DD__;
        const g = D.game;
        const [kind, arg] = target.startsWith('go:') ? ['go', ''] : target.startsWith('fx:') ? ['fx', ''] : target.includes(':') ? target.split(':') : ['biome', target];
        let look = null;
        let tall = false;
        let deep = false;
        // fx:<name>[@stratum]: a VIS moment, triggered after the camera is set (heartWake, heartRelight,
        // geyser, weather:<biome>), captured a few seconds into it.
        let fx = null;
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
          // The lair's stratum first (the lair goto looks in the loaded one only).
          if (!g.strata.layout.lairs.some((a) => a.biome === arg)) await D.goto(arg);
          const p = await D.goto('lair', arg);
          if (!p) return { err: `no lair ${arg}` };
          const l = g.strata.layout.lairs.find((a) => a.biome === arg);
          if (l && view === 1) look = l.centre;
          if (l && view > 1) {
            const at = D.standableNear(l.centre[0] + l.radius * 0.5, l.centre[1], l.centre[2]);
            if (at) D.teleport(at[0], at[1], at[2]);
            look = l.centre;
          }
        } else if (kind === 'go') {
          // go:<where>[:which][@stratum]: a WORLD structure (vista, vistaFloor, river, works, vault,
          // secret, ravine, site:<name>, heart), facing what it is about.
          const [rest, st] = target.slice(3).split('@');
          const [where, which] = rest.split(':');
          if (st && g.strata.current !== Number(st)) await D.stratum(Number(st));
          const L = g.strata.layout;
          // A site's centre can be inside its own piece (the Grand Cap's stem): its vantage below
          // stands on the rim anyway.
          const siteHere = where === 'site' ? L.sites.find((x) => x.name === which || x.id === which) : null;
          const p = where === 'heart' ? await D.goto('heart') : (await D.goto(where, which)) ?? (siteHere ? [...siteHere.centre] : null);
          if (!p) return { err: `goto ${where} failed` };
          // A walkable cell at (x, z), the highest between y0 and y1 (feet on rock, head room).
          const standTop = (x, y0, y1, z) => {
            const ix = Math.floor(x), iz = Math.floor(z);
            for (let y = Math.floor(y0); y >= Math.floor(y1); y--) if (!D.isSolid(ix, y, iz) && !D.isSolid(ix, y + 1, iz) && D.isSolid(ix, y - 1, iz)) return [ix + 0.5, y, iz + 0.5];
            return null;
          };
          // The lowest walkable cell at (x, z) from y0 up to y1 (a bank: just above the water).
          const standUp = (x, y0, y1, z) => {
            const ix = Math.floor(x), iz = Math.floor(z);
            for (let y = Math.floor(y0); y <= Math.floor(y1); y++) if (!D.isSolid(ix, y, iz) && !D.isSolid(ix, y + 1, iz) && D.isSolid(ix, y - 1, iz)) return [ix + 0.5, y, iz + 0.5];
            return null;
          };
          if (where === 'vista' && L.vista) {
            // Out to the balcony's lip (the last walkable step towards the deep), looking down into it.
            const b = L.vista.balcony, c = L.vista.centre;
            const dx = c[0] - b[0], dz = c[2] - b[2], len = Math.hypot(dx, dz) || 1;
            let lip = null;
            for (let d = 0; d < Math.min(len, 16); d += 0.5) {
              const at = standTop(b[0] + (dx / len) * d, b[1] + 1, b[1] - 1, b[2] + (dz / len) * d);
              if (!at) break;
              lip = at;
            }
            if (lip) {
              const back = standTop(lip[0] - (dx / len) * 1.2, lip[1] + 1, lip[1] - 1, lip[2] - (dz / len) * 1.2) ?? lip;
              D.teleport(back[0], back[1], back[2]);
            }
            look = c;
            deep = true;
          } else if (where === 'river' && L.rivers?.[0]) {
            // On the bank a little way down from the spring, looking downstream along the water.
            const pts = L.rivers[0].points;
            const i = Math.min(pts.length - 1, 8 + view * 9);
            const a = pts[i], b = pts[Math.min(pts.length - 1, i + 5)];
            const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
            let at = null;
            for (const off of [2.2, 3.0, 3.8, 4.6]) {
              for (const side of [1, -1]) {
                at = standUp(a[0] - (dz / len) * side * off - (dx / len) * 2, a[1] - 0.3, a[1] + 1.8, a[2] + (dx / len) * side * off - (dz / len) * 2);
                if (at) break;
              }
              if (at) break;
            }
            if (at) D.teleport(at[0], at[1], at[2]);
            look = pts[Math.min(pts.length - 1, i + 9)];
            deep = true;
          }
          else if (where === 'vistaFloor' && L.vista) look = L.falls?.[0]?.bottom ?? L.vista.centre;
          // The arrival (stratum I: the camp) as the explorer first sees it: along the arrival's yaw.
          else if (where === 'arrival' && L.arrival) look = [L.arrival.x + Math.sin(L.arrival.yaw) * 10, L.arrival.y + 0.6, L.arrival.z + Math.cos(L.arrival.yaw) * 10];
          else if (where === 'works' && L.dungeon) look = L.dungeon.hall;
          else if (where === 'heart' && L.heart) look = [L.heart.centre[0], L.heart.centre[1] + 6, L.heart.centre[2]];
          else if (where === 'site') {
            // A named place: seen from its rim (the most open side), looking at its heart.
            const site = L.sites.find((x) => x.name === which || x.id === which);
            if (site) {
              const c = site.centre;
              let best = null;
              for (let k = 0; k < 16; k++) {
                const a = (k / 16) * Math.PI * 2 + view * 0.9;
                for (const rk of [0.85, 0.6]) {
                  const r = Math.max(5, Math.min(14, site.radius * rk));
                  const at = D.standableNear(c[0] + Math.cos(a) * r, c[1], c[2] + Math.sin(a) * r);
                  if (!at) continue;
                  // A clear line to the centre (rays through the voxels), room round the eye (no
                  // wall at arm's length), and the site's own biome underfoot.
                  let clear = 0;
                  const dx = c[0] - at[0], dy = c[1] + 1 - (at[1] + 1.6), dz = c[2] - at[2];
                  const len = Math.hypot(dx, dy, dz);
                  for (let d = 0.5; d < len; d += 0.5) {
                    if (D.isSolid(Math.floor(at[0] + (dx / len) * d), Math.floor(at[1] + 1.6 + (dy / len) * d), Math.floor(at[2] + (dz / len) * d))) break;
                    clear = d;
                  }
                  let room = 0;
                  for (let ox = -2; ox <= 2; ox++) for (let oz = -2; oz <= 2; oz++) if (!D.isSolid(Math.floor(at[0]) + ox, Math.floor(at[1]) + 1, Math.floor(at[2]) + oz)) room++;
                  const same = L.biomeAt(at[0], at[1], at[2]) === site.biome ? 6 : 0;
                  const score = Math.min(clear, len) / Math.max(1, len) * 10 + room * 0.4 + same;
                  if (!best || score > best.score) best = { at, score };
                }
              }
              if (best) D.teleport(best.at[0], best.at[1], best.at[2]);
              // Tall pieces are looked up at (the Grand Cap's gills, the World Root, the frozen fall; the
              // Glass Garden's spire tips a little).
              const lift = { grandCap: 8, worldRoot: 6, frozenFalls: 6, colonnade: 4, crystalChoir: 3, lanternVault: 3, glassGarden: 2 }[site.name] ?? 1;
              look = [c[0], c[1] + lift, c[2]];
              tall = lift > 1;
            }
          }
          if (look && view > 1 && !['site', 'vista', 'river'].includes(where)) {
            // A second view of it from a few metres to the side.
            const at = D.standableNear(p[0] + (look[2] - p[2]) * 0.15, p[1], p[2] - (look[0] - p[0]) * 0.15);
            if (at) D.teleport(at[0], at[1], at[2]);
          }
        } else if (kind === 'fx') {
          const [rest, st] = target.slice(3).split('@');
          if (st && g.strata.current !== Number(st)) await D.stratum(Number(st));
          const L = g.strata.layout;
          fx = rest;
          if (rest === 'heartWake' || rest === 'heartRelight' || rest === 'heartLit') {
            if (!L.heart) return { err: 'no heart' };
            const h = L.heart;
            // From the chamber's rim, looking up at the Heart.
            const at = D.standableNear(h.centre[0] + h.radius * (view > 1 ? -0.55 : 0.6), h.centre[1], h.centre[2] + h.radius * 0.25);
            if (at) D.teleport(at[0], at[1], at[2]);
            look = [h.centre[0], h.centre[1] + 6, h.centre[2]];
          } else if (rest === 'geyser') {
            const vents = L.props.filter((p) => p.kind === 'gasVent');
            const v = vents[(view * 7) % Math.max(1, vents.length)];
            if (!v) return { err: 'no vents' };
            const at = D.standableNear(v.x + 5, v.y, v.z + 3) ?? D.standableNear(v.x - 5, v.y, v.z - 3);
            if (at) D.teleport(at[0], at[1], at[2]);
            look = [v.x, v.y + 2.5, v.z];
          } else if (rest.startsWith('weather:')) {
            const b = rest.split(':')[1];
            const cav = L.caverns.filter((c) => c.biome === b).sort((a, c) => c.radius[0] * c.radius[2] - a.radius[0] * a.radius[2]);
            const c = cav[(view - 1) % Math.max(1, cav.length)];
            if (!c) return { err: `no ${b} cavern` };
            const at = stand(c.centre[0], c.centre[1], c.centre[2]);
            if (at) D.teleport(at[0], at[1], at[2]);
          }
        } else if (kind === 'gate') {
          if (g.strata.current !== Number(arg)) await D.stratum(Number(arg));
          const p = await D.goto('gate');
          if (!p) return { err: 'no gate' };
          look = g.strata.layout.gate.centre;
        }
        D.mobs?.clear?.();
        const px = g.player.x, py = g.player.y, pz = g.player.z;
        const eye = [px, py + 1.62, pz];
        // The most open direction: rays through the voxels (prefer 10-35 m of clear air).
        let yaw = 0;
        let pitch = -0.08;
        if (look) {
          yaw = Math.atan2(-(look[0] - eye[0]), -(look[2] - eye[2]));
          pitch = Math.max(deep ? -0.5 : -0.35, Math.min(tall ? 0.45 : 0.2, Math.atan2(look[1] + 1 - eye[1], Math.hypot(look[0] - eye[0], look[2] - eye[2]))));
        } else {
          let best = -1;
          // Light along the way (the world light volume: lamps, glowing things): a lit focal point
          // weighs as much as open air.
          const W = g.session.world;
          const Lt = g.session.light?.data ?? null;
          const litAt = (x, y, z) => {
            if (!Lt || x < 0 || y < 0 || z < 0 || x >= W.sx || y >= W.sy || z >= W.sz) return 0;
            const i = (x + y * W.sx + z * W.sx * W.sy) * 4;
            return (Lt[i] + Lt[i + 1] + Lt[i + 2]) / 765;
          };
          for (let k = 0; k < 32; k++) {
            const a = (k / 32) * Math.PI * 2;
            const dx = -Math.sin(a), dz = -Math.cos(a);
            let d = 0;
            let lit = 0;
            for (; d < 40; d += 0.5) {
              const x = Math.floor(eye[0] + dx * d), y = Math.floor(eye[1] - d * 0.05), z = Math.floor(eye[2] + dz * d);
              if (D.isSolid(x, y, z)) break;
              lit += Math.max(litAt(x, y, z), litAt(x, y + 2, z)) / (1 + d / 12);
            }
            const score = Math.min(d, 32) + Math.min(lit, 30) * 0.8 + (view > 1 ? ((k * 37) % 5) : 0);
            if (score > best) {
              best = score;
              yaw = a;
            }
          }
        }
        if (kind === 'stations') {
          // LOOP's stations and an outpost in an arc 3-5 m ahead (the models as placed in play).
          const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
          const kinds = ['furnace', 'forge', 'alchemy', 'outpost'];
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
        // The lens jumps to the look now (a teleport snaps it): it eases only in small frames, and
        // the long settle steps below left it where it pointed before (straight up, after a switch).
        D.teleport(px, py, pz);
        // ~1 s of game time (the biome look, the air and the light settle; both snap on a teleport)
        // in three rendered frames: each is a full SwiftShader render at the capture size.
        D.step(3, 0.34);
        if (fx) {
          const v = g.vis;
          const P = g.player;
          let ok = true;
          if (fx === 'heartWake') v.heart.awaken();
          else if (fx === 'heartRelight') v.heart.start();
          // After the ending (free play): the deep relit, as a save past the ending loads it.
          else if (fx === 'heartLit') v.heart.setHeart(g.strata.layout.heart, 'lit', g.session.world);
          else if (fx === 'geyser') ok = v.geysers.erupt(P.x, P.y, P.z, 40);
          else if (fx.startsWith('weather:')) ok = v.weather.start(g.session.world, P.x, P.y, P.z);
          if (!ok) return { err: `fx ${fx} did not start here` };
          // Into the moment: the Heart's acts at ~3 s, a geyser at ~1.3 s, the weather at ~6 s.
          if (fx === 'geyser') D.step(4, 0.33);
          else if (fx === 'heartLit') D.step(2, 0.5);
          else D.step(fx.startsWith('weather') ? 12 : 6, 0.5);
        }
        return { at: [px, py, pz].map((n) => +n.toFixed(1)), yaw: +yaw.toFixed(2), pitch: +pitch.toFixed(3), feet: [px, py, pz], biome: D.biomeHere(), stratum: g.strata.current, ...(fx ? { fx, report: g.vis.report().weather ?? null } : {}) };
      }, { target, view }).catch((e) => ({ err: `failed: ${String(e.message).split('\n')[0]}` }));
      if (res.err) {
        console.log(`[${name}] ${res.err}`);
        continue;
      }
      await page.waitForTimeout(Number(opt.wait));
      // Every chunk round the view meshed and applied (the workers' meshes land asynchronously), a
      // frame for the cull and the light to follow, the meshes it asked for, then the frame the
      // screenshot shows.
      await page.evaluate(async ({ feet, yaw, pitch, fx }) => {
        const D = window.__DD__;
        const g = D.game;
        await D.meshIdle?.();
        // The baked decor round the view (in play two cells bake a frame).
        g.session.props.flushDecor?.(g.cameraRig.camera.position, 96);
        D.step(1, 0.05);
        await D.meshIdle?.();
        // Back on the chosen spot and heading, the lens snapped to it (look, then the teleport's
        // snap), the lantern's pendulum at rest (the turn to the view kicked it).
        g.player.yaw = yaw + Math.PI;
        D.look(yaw, pitch);
        if (!fx) D.teleport(feet[0], feet[1], feet[2]);
        else g.cameraRig.snapTo(g.player.x, g.player.y + 1.62, g.player.z);
        const vm = g.viewmodel;
        if (vm) {
          vm.swayX = vm.swayZ = vm.swayVX = vm.swayVZ = 0;
          vm.lastYaw = Number.NaN;
        }
        D.step(1, 0.02);
      }, { feet: res.feet, yaw: res.yaw, pitch: res.pitch, fx: !!res.fx });
      await page.waitForTimeout(300);
      const file = `${opt.out}/${name}.png`;
      const ts = Date.now();
      try {
        await page.screenshot({ path: file, timeout: 240000 });
      } catch (e) {
        // A busy machine can stall one frame for minutes: log it and go on with the next view.
        console.log(`[${name}] screenshot failed after ${((Date.now() - ts) / 1000).toFixed(0)} s: ${String(e.message).split('\n')[0]}`);
        continue;
      }
      console.log(`[${name}] shot in ${((Date.now() - ts) / 1000).toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s in)`);
      const r = await page.evaluate(() => {
        const D = window.__DD__;
        const r = D.report();
        const g = D.game;
        return { calls: r.render.calls, tris: Math.round(r.render.triangles / 1000) + 'k', vis: g.vis.report(), now: [g.player.x, g.player.y, g.player.z].map((n) => +n.toFixed(1)), terrain: g.session.chunks.culledVisible };
      });
      console.log(`[${name}] ${file} ${JSON.stringify(res)} calls=${r.calls} tris=${r.tris} look=${r.vis.biome} w=${JSON.stringify(r.vis.weights)} torches=${r.vis.torches} now=${r.now} chunks=${r.terrain}`);
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
