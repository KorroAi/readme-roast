// MOBS capture sheets (round 3): every biome's roster lined up in its own biome, and every guardian
// in its own lair, in the real game (WebGL 2 through SwiftShader, the real camera and lighting).
//
// Usage: node tools/mob-sheets.mjs [--out artifacts/r3/mobs] [--size 1280x720] [--only rosters|guardians]
//                                  [--biomes amberHollows,mushroomForest] [--seed 12345] [--port 4177]
// Writes roster-<biome>.png and guardian-<kind>.png, and prints what each shot holds.
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = { out: 'artifacts/r3/mobs', size: '1024x576', only: '', biomes: '', seed: '7', port: '4177', quality: 'balanced', wait: '1500', hud: '0' };
for (let i = 0; i < args.length; i++) if (args[i].startsWith('--')) opt[args[i].slice(2)] = args[++i];
const [width, height] = opt.size.split('x').map(Number);
mkdirSync(opt.out, { recursive: true });

const BIOMES = ['amberHollows', 'mushroomForest', 'rootGalleries', 'floodedGrottoes', 'crystalGeode', 'haldenMines', 'frostCaverns', 'glowrootJungle', 'sulphurBog', 'sunkenCity', 'magmaVeins', 'obsidianAbyss', 'heart'];
const wanted = opt.biomes ? opt.biomes.split(',') : BIOMES;

const server = await createServer({ server: { port: Number(opt.port), strictPort: true, hmr: false }, logLevel: 'error' });
await server.listen();
const url = `http://localhost:${opt.port}/`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`${url}index.html?gen=strata&debug=1`);
  await page.waitForFunction(() => window.__DD__?.ready && window.__DD__.state().mode === 'menu', null, { timeout: 240_000, polling: 250 });
  log('menu');
  // A fixed expedition seed: the same caves every run.
  await page.evaluate(async ({ q, seed, hud }) => {
    // Sheets want the creatures: no toasts, hints, tutorial or arrival cards (and the HUD only with --hud 1).
    const st = document.createElement('style');
    st.textContent = '.dd-discovery,.dd-hint,.dd-toasts,.dd-toast,.dd-tutorial,.dd-arrival{display:none!important}' + (hud === '1' ? '' : '.dd-ui{display:none!important}');
    document.head.appendChild(st);
    const g = window.__DD__.game;
    window.__DD__.setQuality(q);
    await g.newGame(Number(seed));
  }, { q: opt.quality, seed: opt.seed, hud: opt.hud });
  await page.waitForFunction(() => window.__DD__.state().mode === 'playing', null, { timeout: 240_000, polling: 250 });
  log('playing');
  await page.evaluate(() => {
    const m = window.__DD__.mobs;
    m.auto(false);
    m.clear();
    m.harmless(true);
  });
  // Skip the tutorial's highlights if the quest system offers it (sheets want a clean view).
  await page.evaluate(() => window.__DD__.game.quests?.skipTutorial?.());

  /** Let the chunks round the explorer mesh in real time (a full flush of a stratum is too long), then a few frames. */
  const settle = async (frames = 20, wait = Number(opt.wait)) => {
    await page.evaluate((n) => window.__DD__.step(n, 1 / 30), frames);
    await page.waitForTimeout(wait);
    await page.evaluate(() => window.__DD__.meshIdle?.());
    await page.waitForTimeout(300);
  };
  const shoot = (file) => page.screenshot({ path: file, timeout: 180_000 });

  /** Turn until there is open floor 4-9 m ahead; @returns the heading's floor point or null. */
  const openAhead = async (min = 4, max = 9) => {
    for (let k = 0; k < 24; k++) {
      const f = await page.evaluate(([a, b]) => window.__DD__.mobs.floorAhead(a, b), [min, max]);
      if (f) {
        // Room to line up: the floor two steps further and to either side as well.
        const ok = await page.evaluate(([a, b]) => window.__DD__.mobs.floorAhead(a, b) !== null, [max - 1, max + 3]);
        if (ok) return f;
      }
      const yaw = await page.evaluate(() => window.__DD__.game.cameraRig.yaw);
      await page.evaluate((w) => window.__DD__.look(w, -0.1), yaw + Math.PI / 12);
    }
    return null;
  };

  // Each biome once: its roster lined up, then its guardian in its lair (one stratum load per pair).
  for (const biome of wanted) {
    if (opt.only !== 'guardians' && opt.only !== 'extras') {
        const r = await page.evaluate((b) => window.__DD__.mobs.roster(b), biome);
        if (!r) continue;
        const at = await page.evaluate((b) => window.__DD__.goto(b), biome);
        if (!at) {
          log(biome, 'no spot');
          continue;
        }
        await settle(30);
        await page.evaluate(() => window.__DD__.mobs.clear());
        if (!(await openAhead(3.5, 8))) log(biome, 'cramped');
        const kinds = [...r.monsters, ...r.beings];
        const ids = await page.evaluate(([k]) => window.__DD__.mobs.lineup(k, 4.2, 0.35), [kinds]);
        for (const id of ids) await page.evaluate(([i]) => window.__DD__.mobs.setAnim(i, { face: true, glow: 1, alert: 0.6 }), [id]);
        await settle(6, 400);
        // Look at the row's middle, a little above the floor.
        const list = await page.evaluate(() => window.__DD__.mobs.list());
        const row = list.filter((m) => ids.includes(m.id));
        // Aim at the row's middle at its mean body height (crawlers have no feet; the moths' cloud drifts).
        const aim = row.filter((m) => m.kind !== 'moth');
        if (aim.length) {
          const cx = aim.reduce((a, m) => a + m.x, 0) / aim.length;
          const cz = aim.reduce((a, m) => a + m.z, 0) / aim.length;
          const cy = aim.reduce((a, m) => a + m.y, 0) / aim.length;
          await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y, z, -0.05), [cx, cy, cz]);
        }
        await settle(4, 300);
        const file = `${opt.out}/roster-${biome}.png`;
        await shoot(file);
        const stats = await page.evaluate(() => window.__DD__.mobs.drawStats());
        const here = await page.evaluate(() => window.__DD__.biomeHere());
        log(`${file}: biome here ${here}, ${row.length}/${kinds.length} placed (${row.map((m) => m.kind).join(', ')}), draw ${JSON.stringify(stats)}`);
        await page.evaluate(() => {
          window.__DD__.mobs.clear();
          window.__DD__.mobs.freeze(false);
        });
    }
    if (opt.only !== 'rosters' && opt.only !== 'extras') {
        const r = await page.evaluate((b) => window.__DD__.mobs.roster(b), biome);
        if (!r) continue;
        const kind = r.guardian;
        let placed = false;
        if (biome !== 'heart') {
          const at = await page.evaluate(async (b) => {
            const st = window.__DD__.strata();
            void st;
            return window.__DD__.goto(b).then(() => window.__DD__.goto('lair', b));
          }, biome);
          if (at) {
            await settle(30);
            await page.evaluate(() => window.__DD__.mobs.clear());
            // The lair's guardian sleeps at its spawn: step until it is there.
            await page.evaluate((n) => window.__DD__.step(n, 1 / 30), 10);
            let g = (await page.evaluate(() => window.__DD__.mobs.list())).find((m) => m.kind === kind);
            if (g) {
              // Walk the explorer in to a good distance from it (toward the entrance), then look.
              const stand = await page.evaluate(([gx, gy, gz, ex, ey, ez, rad]) => {
                const dx = ex - gx;
                const dz = ez - gz;
                const l = Math.max(0.01, Math.hypot(dx, dz));
                const d = 5 + rad * 2.6;
                for (let k = 0; k < 8; k++) {
                  const dd = d + k * 0.8;
                  const s = window.__DD__.standableNear(Math.floor(gx + (dx / l) * dd), Math.floor(Math.max(gy, ey)), Math.floor(gz + (dz / l) * dd));
                  if (s) return s;
                }
                return null;
              }, [g.x, g.foot.y, g.z, at[0], at[1], at[2], g.radius]);
              if (stand) {
                await page.evaluate(([x, y, z]) => window.__DD__.teleport(x + 0.5, y, z + 0.5), stand);
                await settle(8);
              }
              g = (await page.evaluate(() => window.__DD__.mobs.list())).find((m) => m.kind === kind);
              if (g) {
                await page.evaluate(([id]) => {
                  window.__DD__.mobs.freeze(true);
                  window.__DD__.mobs.setAnim(id, { face: true, glow: 1, alert: 1, open: 0.3 });
                }, [g.id]);
                await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y, z, -0.08), [g.x, g.y, g.z]);
                placed = true;
              }
            }
          }
        }
        if (!placed) {
          // The Heart (or a lair not found): in front of the explorer in its biome.
          const at = await page.evaluate((b) => window.__DD__.goto(b), biome);
          if (!at) {
            log(kind, 'no spot');
            continue;
          }
          await settle(30);
          await page.evaluate(() => window.__DD__.mobs.clear());
          await openAhead(6, 12);
          const sp = await page.evaluate((k) => window.__DD__.mobs.species(k), kind);
          const dist = 4.5 + sp.radius * 2.6;
          const id = await page.evaluate(([k, d]) => window.__DD__.mobs.spawnAhead(k, d, 0, { asleep: false }), [kind, dist]);
          if (id === null) {
            log(kind, 'could not stand');
            continue;
          }
          await page.evaluate(([i]) => {
            window.__DD__.mobs.freeze(true);
            window.__DD__.mobs.setAnim(i, { face: true, glow: 1, alert: 1 });
          }, [id]);
          const g = await page.evaluate((i) => window.__DD__.mobs.get(i), id);
          await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y, z, -0.08), [g.x, g.y, g.z]);
        }
        await settle(4, 300);
        const file = `${opt.out}/guardian-${kind}.png`;
        await shoot(file);
        const stats = await page.evaluate(() => window.__DD__.mobs.drawStats());
        log(`${file}: ${placed ? 'in its lair' : 'in its biome'}, draw ${JSON.stringify(stats)}`);
        await page.evaluate(() => {
          window.__DD__.mobs.clear();
          window.__DD__.mobs.freeze(false);
        });
    }
  }
  if (opt.only === 'extras' || opt.only === 'all') {
    // Elites: one of each affix, side by side (radiant, armoured, swift, splitting).
    await page.evaluate(() => window.__DD__.goto('frostCaverns'));
    await settle(30);
    await page.evaluate(() => window.__DD__.mobs.clear());
    await openAhead(4, 9);
    const affixes = ['radiant', 'armoured', 'swift', 'splitting'];
    const eids = await page.evaluate(() => window.__DD__.mobs.lineup(['icefang', 'icefang', 'icefang', 'icefang'], 4.4, 0.7));
    for (let i = 0; i < eids.length; i++) await page.evaluate(([id, a]) => {
      window.__DD__.mobs.elite(id, [a]);
      window.__DD__.mobs.setAnim(id, { face: true, glow: 1, alert: 1 });
    }, [eids[i], affixes[i]]);
    const erow = (await page.evaluate(() => window.__DD__.mobs.list())).filter((m) => eids.includes(m.id));
    if (erow.length) await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y, z, -0.05), [erow.reduce((a, m) => a + m.x, 0) / erow.length, erow.reduce((a, m) => a + m.y, 0) / erow.length, erow.reduce((a, m) => a + m.z, 0) / erow.length]);
    await settle(4, 300);
    await shoot(`${opt.out}/elites.png`);
    log(`elites: ${erow.map((m) => `${m.kind}[${m.affixes.join('+')}]`).join(', ')}`);
    await page.evaluate(() => {
      window.__DD__.mobs.clear();
      window.__DD__.mobs.freeze(false);
    });

    // Telegraphs: real wind-ups and their ground markers (a charger's lane, a brute's slam circle, a dive's mark).
    for (const [biome, kinds] of [['rootGalleries', ['thornback', 'rootWeevil']], ['floodedGrottoes', ['clatterclaw', 'mistwing']]]) {
      await page.evaluate((b) => window.__DD__.goto(b), biome);
      await settle(30);
      await page.evaluate(() => {
        window.__DD__.mobs.clear();
        window.__DD__.mobs.harmless(true);
      });
      await openAhead(4, 9);
      const tids = [];
      for (let i = 0; i < kinds.length; i++) {
        const id = await page.evaluate(([k, d]) => window.__DD__.mobs.spawnAhead(k, d, k === 'mistwing' ? 2.5 : 0, { asleep: false }), [kinds[i], 4.5 + i * 2]);
        if (id !== null) tids.push(id);
      }
      // Let them come and wind up: wait for a marker well along, then hold the moment.
      let found = null;
      for (let k = 0; k < 60 && !found; k++) {
        await page.evaluate(() => window.__DD__.step(3, 1 / 30));
        const mk = await page.evaluate(() => window.__DD__.mobs.markers());
        found = mk.find((x) => x.progress > 0.45 && x.kind !== 'wave') ?? null;
      }
      await page.evaluate(() => window.__DD__.mobs.freeze(true));
      if (found) await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y + 0.6, z, -0.25), [found.x, found.y, found.z]);
      await settle(2, 300);
      await shoot(`${opt.out}/telegraph-${biome}.png`);
      log(`telegraph-${biome}: ${found ? `${found.kind} marker at progress ${found.progress.toFixed(2)}` : 'no marker caught'}`);
      await page.evaluate(() => {
        window.__DD__.mobs.clear();
        window.__DD__.mobs.freeze(false);
      });
    }

    // The companion: a tame Lampling at level 3 beside the explorer.
    await page.evaluate(() => window.__DD__.goto('mushroomForest'));
    await settle(30);
    await page.evaluate(() => window.__DD__.mobs.clear());
    await openAhead(3, 7);
    const cid = await page.evaluate(() => window.__DD__.mobs.spawnAhead('lampling', 1.8, 1.5));
    if (cid !== null) {
      await page.evaluate((id) => window.__DD__.mobs.tame(id, 14), cid);
      await page.evaluate(() => window.__DD__.step(40, 1 / 30));
      const c = await page.evaluate((id) => window.__DD__.mobs.get(id), cid);
      if (c) await page.evaluate(([x, y, z]) => window.__DD__.mobs.lookAt(x, y - 0.4, z, 0), [c.x, c.y, c.z]);
      await settle(2, 300);
      await shoot(`${opt.out}/companion.png`);
      log(`companion: ${JSON.stringify(await page.evaluate(() => window.__DD__.mobs.companion()))}`);
    }
  }
  if (errors.length) console.log('page errors:\n' + [...new Set(errors)].slice(0, 12).join('\n'));
} finally {
  await browser.close();
  await server.close();
}
