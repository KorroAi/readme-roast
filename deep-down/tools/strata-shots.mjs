// WORLD tool (round 3): real-camera captures of WORLD's structures in the shipped game (the first
// person camera, the HUD, 390 x 844 @2), on a running server (a vite preview of a build, or dev).
//
// Usage: node tools/strata-shots.mjs --url http://localhost:4196/ --out <dir> [--seed 12345]
//          [--views vista@1,island@1,fall@1,ladder@1,ravine@1,spring@2,works@3,mineSet@3] [--dpr 2]
//
// Views: `vista` (the balcony's lip, across the hall to the island's spire), `island` (the ramp's
// foot on the shore, up at the spire), `fall` (the hall floor, facing the great fall), `spring` (the
// river's head, facing the fall out of the spring chamber's wall), `works` (inside the Halden works'
// hall, down it to the vault's door), `ladder` (a ladder the trap mending placed, the most open one,
// from the floor before it), `ravine` (a ravine's top, looking down its rope), `mineSet` (a timber
// set across a Halden drift, from 5 m down the tunnel, the first seen clear). The game's own loop is all but
// stopped during the captures (VIS's 21:23 recipe): each frame is rendered by `__DD__.step`.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { url: 'http://localhost:4176/', out: 'artifacts/r3/world/shots', seed: '12345', views: 'vista@1,island@1,fall@1,ladder@1,spring@2,works@3,mineSet@3', dpr: '2', wait: '1200' };
for (let i = 0; i < args.length; i += 2) opt[args[i].replace(/^--/, '')] = args[i + 1];
mkdirSync(opt.out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const t0 = Date.now();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(opt.dpr), hasTouch: true, isMobile: true });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${opt.url}index.html?gen=strata`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 420000, polling: 500 });
  await page.evaluate(async ({ seed }) => {
    const st = document.createElement('style');
    st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-tut,.dd-arrival{display:none!important}';
    document.head.appendChild(st);
    const g = window.__DD__.game;
    await g.newGame(Number(seed));
    (g.quests ?? g.loop?.quests)?.skipTutorial?.();
    window.__DD__.mobs?.auto?.(false);
    window.__DD__.mobs?.clear?.();
    g.renderer.preset = { ...g.renderer.preset, fpsCap: 0.05 };
  }, { seed: opt.seed });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 180000 });
  console.log(`booted seed ${opt.seed} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  for (const spec of opt.views.split(',').filter(Boolean)) {
    const name = spec.replace(/[:@]/g, '-');
    const res = await page.evaluate(async (spec) => {
      const D = window.__DD__;
      const g = D.game;
      const [what, st] = spec.split('@');
      if (st && g.strata.current !== Number(st)) await D.stratum(Number(st));
      const L = g.strata.layout;
      const W = g.session.world;
      const solid = (x, y, z) => D.isSolid(Math.floor(x), Math.floor(y), Math.floor(z));
      // A walkable cell at (x, z), the highest between y0 and y1 (feet on rock, head room).
      const standTop = (x, y0, y1, z) => {
        const ix = Math.floor(x), iz = Math.floor(z);
        for (let y = Math.floor(y0); y >= Math.floor(y1); y--) if (!D.isSolid(ix, y, iz) && !D.isSolid(ix, y + 1, iz) && D.isSolid(ix, y - 1, iz)) return [ix + 0.5, y, iz + 0.5];
        return null;
      };
      // How far the eye at `at` sees towards `p` before rock (0..1 of the way).
      const clearTo = (at, p) => {
        const e = [at[0], at[1] + 1.62, at[2]];
        const d = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
        const len = Math.hypot(...d) || 1;
        let ok = 0;
        for (let s = 0.5; s < len - 0.8; s += 0.4) {
          if (solid(e[0] + (d[0] / len) * s, e[1] + (d[1] / len) * s, e[2] + (d[2] / len) * s)) break;
          ok = s;
        }
        return Math.min(1, (ok + 0.8) / len);
      };
      // The best stand round `from` along a heading (dx, dz) at the given distances, with a clear view of `look`.
      const vantage = (from, dx, dz, dists, look) => {
        const n = Math.hypot(dx, dz) || 1;
        let best = null;
        for (const d of dists) for (const side of [0, 0.35, -0.35, 0.7, -0.7]) {
          const hx = dx / n, hz = dz / n;
          const x = from[0] + (hx * Math.cos(side) - hz * Math.sin(side)) * d;
          const z = from[2] + (hz * Math.cos(side) + hx * Math.sin(side)) * d;
          const at = D.standableNear(x, from[1] + 2, z) ?? D.standableNear(x, from[1], z);
          if (!at) continue;
          const c = clearTo(at, look);
          const score = c * 10 - Math.abs(side) - Math.abs(Math.hypot(at[0] - from[0], at[2] - from[2]) - dists[0]) * 0.2;
          if (!best || score > best.score) best = { at, score, c };
        }
        return best;
      };
      let at = null;
      let look = null;
      let note = '';
      if (what === 'vista' && L.vista) {
        // Out to the balcony's lip (the last walkable step towards the deep), looking down into it.
        const b = L.vista.balcony, c = L.vista.centre;
        const dx = c[0] - b[0], dz = c[2] - b[2], len = Math.hypot(dx, dz) || 1;
        let lip = null;
        for (let d = 0; d < Math.min(len, 16); d += 0.5) {
          const s = standTop(b[0] + (dx / len) * d, b[1] + 1, b[1] - 1, b[2] + (dz / len) * d);
          if (!s) break;
          lip = s;
        }
        at = lip ? (standTop(lip[0] - (dx / len) * 1.2, lip[1] + 1, lip[1] - 1, lip[2] - (dz / len) * 1.2) ?? lip) : b;
        // Across the hall to the island's spire (its lit tip), the lake and the fall below.
        look = L.vista.island ? [L.vista.island[0], L.vista.island[1] - 3, L.vista.island[2]] : [c[0], c[1] + 2, c[2]];
        note = L.vista.name;
      } else if (what === 'island' && L.vista) {
        // From the ramp's foot on the shore, up at the island's spire over the lake.
        const isl = L.vista.island ?? L.vista.centre;
        look = [isl[0], isl[1] - 2, isl[2]];
        const f = L.vista.rampFoot;
        const v = vantage(f, isl[0] - f[0], isl[2] - f[2], [3, 1.5, 5, 0], look);
        at = v?.at ?? D.standableNear(f[0], f[1], f[2]);
        note = `${L.vista.name} spire tip ${(isl[1] - L.vista.centre[1]).toFixed(0)} m up`;
      } else if (what === 'fall') {
        const f = L.falls.find((x) => x.id.startsWith('fall_'));
        if (!f || !L.vista) return { err: 'no great fall' };
        const c = L.vista.centre;
        look = [f.top[0], (f.top[1] + f.bottom[1]) / 2 + 1, f.top[2]];
        const v = vantage(f.bottom, c[0] - f.bottom[0], c[2] - f.bottom[2], [17, 14, 20, 11, 23], look);
        at = v?.at ?? null;
        note = `${f.id} ${(f.top[1] - f.bottom[1]).toFixed(1)} m`;
      } else if (what === 'spring') {
        const f = L.falls.find((x) => x.id.startsWith('spring_'));
        const r = L.rivers[0];
        if (!f || !r) return { err: 'no spring fall' };
        const p = r.points[Math.min(r.points.length - 1, 5)];
        look = [f.top[0], (f.top[1] + f.bottom[1]) / 2, f.top[2]];
        const v = vantage(f.bottom, p[0] - f.bottom[0], p[2] - f.bottom[2], [8, 6.5, 9.5, 5, 11], look);
        at = v?.at ?? null;
        note = `${f.id} ${(f.top[1] - f.bottom[1]).toFixed(1)} m`;
      } else if (what === 'works' && L.dungeon) {
        // Inside the main hall, looking down it to the vault's iron door and its sockets.
        const e = L.dungeon.entry, h = L.dungeon.hall;
        const ux = h[0] - e[0], uz = h[2] - e[2], ul = Math.hypot(ux, uz) || 1;
        at = D.standableNear(e[0] + (ux / ul) * 7.5, h[1], e[2] + (uz / ul) * 7.5) ?? D.standableNear(h[0], h[1], h[2]);
        look = [h[0] + (ux / ul) * 6.5, h[1] + 1.4, h[2] + (uz / ul) * 6.5];
        note = `${L.dungeon.puzzle}, ${L.dungeon.sockets.length} locks`;
      } else if (what === 'ravine' && L.ravines.length) {
        // The deepest ravine, from its top, looking down along its rope.
        const r = [...L.ravines].sort((a, b) => (b.top[1] - b.bottom[1]) - (a.top[1] - a.bottom[1]))[0];
        const dx = r.bottom[0] - r.top[0], dz = r.bottom[2] - r.top[2], n = Math.hypot(dx, dz) || 1;
        at = D.standableNear(r.top[0] - (dx / n) * 2.5, r.top[1], r.top[2] - (dz / n) * 2.5) ?? r.top;
        look = [r.bottom[0], r.bottom[1], r.bottom[2]];
        note = `${r.id} ${(r.top[1] - r.bottom[1]).toFixed(0)} m`;
      } else if (what === 'ladder') {
        // The ladders the trap mending placed: columns of B.LADDER (113); the tallest one, seen from the floor before it.
        const cols = new Map();
        const B = W.blocks, sx = W.sx, sy = W.sy, sz = W.sz;
        for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) {
          const row = (y + z * sy) * sx;
          for (let x = 0; x < sx; x++) if (B[row + x] === 113) {
            const k = x + z * sx;
            const c = cols.get(k);
            if (c) { c.lo = Math.min(c.lo, y); c.hi = Math.max(c.hi, y); } else cols.set(k, { x, z, lo: y, hi: y });
          }
        }
        // The one with the most open floor before it (a ladder in a cramped slot shows nothing).
        const openBefore = (c) => {
          let best = 0;
          for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            let n = 0;
            for (let d = 1; d <= 5; d++) for (let s2 = -2; s2 <= 2; s2++) {
              const x = c.x + ox * d + oz * s2, z = c.z + oz * d + ox * s2;
              if (!D.isSolid(x, c.lo, z) && !D.isSolid(x, c.lo + 1, z) && !D.isSolid(x, c.lo + 2, z)) n++;
            }
            best = Math.max(best, n);
          }
          return best;
        };
        const list = [...cols.values()].filter((c) => c.hi - c.lo >= 2).sort((a, b) => openBefore(b) * 2 + (b.hi - b.lo) - (openBefore(a) * 2 + (a.hi - a.lo)));
        const c = list[0];
        if (!c) return { err: 'no ladders' };
        // The cliff it climbs: the side with rock at mid-height; the eye stands on the other side.
        const mid = Math.floor((c.lo + c.hi) / 2);
        const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oz]) => D.isSolid(c.x + ox, mid, c.z + oz));
        const [ox, oz] = sides[0] ?? [1, 0];
        look = [c.x + 0.5, (c.lo + c.hi) / 2 + 0.5, c.z + 0.5];
        const v = vantage([c.x + 0.5, c.lo, c.z + 0.5], -ox, -oz, [4.5, 3.5, 6, 2.5], look);
        at = v?.at ?? null;
        note = `${cols.size} columns; this one ${c.hi - c.lo + 1} m at ${c.x},${c.lo},${c.z}, clear ${v ? v.c.toFixed(2) : '-'}`;
      } else if (what === 'mineSet') {
        const sets = L.props.filter((p) => p.kind === 'mineSet');
        if (!sets.length) return { err: 'no mine sets' };
        // Down the drift to a set (its posts across the passage): the first one seen clear from 5 m.
        let pick = null;
        for (const p of sets) {
          const hx = Math.sin(p.rotY ?? 0), hz = Math.cos(p.rotY ?? 0);
          const lk = [p.x, p.y + 1.4, p.z];
          for (const sgn of [1, -1]) {
            const v = vantage([p.x, p.y, p.z], hx * sgn, hz * sgn, [5, 4, 6.5], lk);
            if (v && v.c >= 0.97 && (!pick || v.score > pick.v.score)) pick = { v, lk };
          }
          if (pick && pick.v.c >= 0.99) break;
        }
        if (!pick) return { err: 'no clear view of a mine set' };
        at = pick.v.at;
        look = pick.lk;
        note = `${sets.length} sets`;
      } else return { err: `unknown view ${what}` };
      if (!at || !look) return { err: `${what}: no vantage` };
      D.teleport(at[0], at[1], at[2]);
      D.mobs?.clear?.();
      const eye = [g.player.x, g.player.y + 1.62, g.player.z];
      const yaw = Math.atan2(-(look[0] - eye[0]), -(look[2] - eye[2]));
      const pitch = Math.max(-0.95, Math.min(0.6, Math.atan2(look[1] - eye[1], Math.hypot(look[0] - eye[0], look[2] - eye[2]))));
      g.player.yaw = yaw + Math.PI;
      D.look(yaw, pitch);
      D.step(3, 0.34);
      return { at: at.map((n) => +n.toFixed(1)), look: look.map((n) => +n.toFixed(1)), pitch: +pitch.toFixed(2), biome: D.biomeHere(), stratum: g.strata.current, note };
    }, spec);
    if (res.err) {
      console.log(`[${name}] ${res.err}`);
      continue;
    }
    await page.waitForTimeout(Number(opt.wait));
    await page.evaluate(async () => {
      const D = window.__DD__;
      await D.meshIdle?.();
      D.step(1, 0.05);
      await D.meshIdle?.();
      D.step(1, 0.02);
    });
    await page.waitForTimeout(300);
    const file = `${opt.out}/${name}.png`;
    const ts = Date.now();
    try {
      await page.screenshot({ path: file, timeout: 240000 });
    } catch (e) {
      console.log(`[${name}] screenshot failed after ${((Date.now() - ts) / 1000).toFixed(0)} s: ${String(e.message).split('\n')[0]}`);
      continue;
    }
    console.log(`[${name}] ${file} in ${((Date.now() - ts) / 1000).toFixed(1)} s (${((Date.now() - t0) / 1000).toFixed(0)} s in) ${JSON.stringify(res)}`);
  }
  console.log(`errors ${logs.length}`);
  for (const l of [...new Set(logs)].slice(0, 12)) console.log('  ' + l.slice(0, 400));
} finally {
  await browser.close();
}
