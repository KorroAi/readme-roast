// Top-down maps and stats of the strata (round 3, WORLD): one PNG per stratum, walkable floor coloured
// by biome and shaded by height, unreachable floor dim, and the places marked: camp/arrival (white),
// gate (red), lairs (magenta), chests (yellow), pages (cyan), outposts (green), nests (orange).
// Usage: node tools/run-ts.mjs tools/strata-map.ts <outDir> [seed] [strata e.g. 1,2,3] [scale]
import { mkdirSync, writeFileSync } from 'node:fs';
import { BIOMES } from '../src/config/biomes';
import { SOLID } from '../src/config/blocks';
import { LightField } from '../src/world/light';
import { generateStratum } from '../src/world/gen/strata/generateStratum';
import { standableAt, walkBfs } from '../src/world/gen/strata/content';
import { SOLID as SOLID_T, B as BLK, CLIMB } from '../src/config/blocks';
import { forEachMove } from '../src/world/gen/strata/traps';
// @ts-expect-error untyped tool module
import { encodePng } from './png.mjs';

const BIOME_RGB: Record<string, [number, number, number]> = {
  amberHollows: [214, 156, 82], mushroomForest: [80, 210, 200], rootGalleries: [150, 170, 70], floodedGrottoes: [70, 130, 220],
  crystalGeode: [150, 110, 240], haldenMines: [200, 110, 60], frostCaverns: [170, 220, 250], glowrootJungle: [80, 220, 90],
  sulphurBog: [210, 220, 60], sunkenCity: [230, 200, 110], magmaVeins: [240, 90, 40], obsidianAbyss: [120, 70, 200], heart: [240, 40, 70],
};

export default function strataMap(args: string[]): void {
  const out = args[0] ?? 'strata-maps';
  const seed = Number(args[1] ?? 12345);
  const list = (args[2] ?? '1,2,3,4,5,6').split(',').map(Number);
  const S = Number(args[3] ?? 3);
  mkdirSync(out, { recursive: true });
  const report: unknown[] = [];
  for (const n of list) {
    const t0 = performance.now();
    const l = generateStratum(seed, n);
    const t1 = performance.now();
    const light = new LightField(l.world);
    light.computeAll();
    const t2 = performance.now();
    const w = l.world;
    const open = new Set([...l.gate.seal, ...(l.dungeon?.door ?? [])].map(([x, y, z]) => w.index(x, y, z)));
    const seen = walkBfs({ world: w }, [l.arrival.x, l.arrival.y, l.arrival.z], open);
    const W = w.sx * S;
    const H = w.sz * S;
    const img = new Uint8Array(W * H * 4);
    const px = (x: number, z: number, c: readonly number[], r = 0) => {
      for (let a = -r * S; a < S + r * S; a++) for (let b = -r * S; b < S + r * S; b++) {
        const X = x * S + a;
        const Z = z * S + b;
        if (X < 0 || Z < 0 || X >= W || Z >= H) continue;
        const i = (Z * W + X) * 4;
        img[i] = c[0];
        img[i + 1] = c[1];
        img[i + 2] = c[2];
        img[i + 3] = 255;
      }
    };
    let floor = 0;
    let reach = 0;
    for (let z = 0; z < w.sz; z++) for (let x = 0; x < w.sx; x++) {
      let best = -1;
      let br = false;
      for (let y = w.sy - 3; y > 0; y--) {
        if (!standableAt(w.blocks, w.sx, w.sy, x, y, z)) continue;
        floor++;
        const r = seen[w.index(x, y, z)] === 1;
        if (r) reach++;
        if (best < 0 || (r && !br)) {
          best = y;
          br = r;
        }
      }
      if (best < 0) {
        px(x, z, [12, 12, 16]);
        continue;
      }
      const b = l.biomeAt(x, best, z);
      const c = BIOME_RGB[b] ?? [128, 128, 128];
      const k = (0.35 + 0.65 * (best / w.sy)) * (br ? 1 : 0.32);
      px(x, z, [c[0] * k, c[1] * k, c[2] * k]);
    }
    const mark = (p: readonly number[], c: number[], r = 1) => px(Math.floor(p[0]), Math.floor(p[2]), c, r);
    // The great structures: the river (blue), the vista's balcony and ramp foot (white ring), the works
    // (orange), ravines (brown), secret rooms (pink), set pieces (lime).
    for (const rv of l.rivers) for (const q of rv.points) mark(q, rv.kind === 'lava' ? [255, 120, 20] : [60, 160, 255], 0);
    if (l.vista) {
      for (let a = 0; a < Math.PI * 2; a += 0.02) mark([l.vista.centre[0] + Math.cos(a) * l.vista.radius, 0, l.vista.centre[2] + Math.sin(a) * l.vista.radius], [235, 235, 235], 0);
      mark(l.vista.balcony, [255, 255, 255], 2);
      mark(l.vista.rampFoot, [200, 200, 200], 1);
    }
    if (l.dungeon) {
      for (const c of l.dungeon.door) mark(c, [255, 150, 0], 0);
      mark(l.dungeon.vault, [255, 150, 0], 2);
      mark(l.dungeon.entry, [255, 200, 120], 1);
    }
    for (const r of l.ravines) {
      mark(r.top, [150, 90, 40], 1);
      mark(r.bottom, [150, 90, 40], 1);
    }
    for (const sc of l.secrets) mark(sc.centre, [255, 120, 200], 1);
    for (const st of l.sites) if (st.kind === 'setPiece') mark(st.centre, [190, 255, 60], 1);
    for (const c of l.chests) mark(c.p, [255, 230, 60], 0);
    for (const p of l.pages) mark(p.p, [80, 240, 255], 1);
    for (const o of l.outpostSites) mark(o.p, [60, 255, 90], 1);
    for (const ne of l.nests) mark(ne.p, [255, 140, 40], 1);
    for (const a of l.lairs) mark(a.centre, [255, 60, 230], 2);
    mark(l.gate.centre, [255, 40, 40], 2);
    mark([l.arrival.x, l.arrival.y, l.arrival.z], [255, 255, 255], 2);
    if (l.heart) mark(l.heart.centre, [255, 20, 60], 3);
    // The ladders the trap mending placed (and the ravines' ropes): bright green-white dots.
    for (let i = 0; i < w.blocks.length; i++) if (CLIMB[w.blocks[i]]) px(i % w.sx, Math.floor(i / (w.sx * w.sy)), w.blocks[i] === BLK.LADDER ? [190, 255, 190] : [255, 220, 150]);
    // The walking routes (climbs included): the arrival to each lair and to the gate, a white trail.
    const routeLen: Record<string, number> = {};
    {
      const d = { sx: w.sx, sy: w.sy, sz: w.sz };
      const b = w.blocks.slice();
      for (const [x, y, z] of [...(l.dungeon?.door ?? []), ...(l.stratum === 6 ? l.gate.seal : [])]) b[w.index(x, y, z)] = BLK.AIR;
      const parent = new Int32Array(b.length).fill(-1);
      const sxy = w.sx * w.sy;
      let y0 = Math.floor(l.arrival.y);
      const x0 = Math.floor(l.arrival.x);
      const z0 = Math.floor(l.arrival.z);
      while (y0 > 1 && !standableAt(b, w.sx, w.sy, x0, y0, z0)) y0--;
      const q = [w.index(x0, y0, z0)];
      parent[q[0]] = q[0];
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        const z = (i / sxy) | 0;
        const r = i - z * sxy;
        const y = (r / w.sx) | 0;
        forEachMove(b, SOLID_T, d, i, r - y * w.sx, y, z, 3, (j) => {
          if (parent[j] < 0) {
            parent[j] = i;
            q.push(j);
          }
        });
      }
      const trail = (name: string, p: readonly number[]) => {
        let best = -1;
        let bd = Infinity;
        for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
          const x = Math.floor(p[0]) + dx;
          const y = Math.floor(p[1]) + dy;
          const z = Math.floor(p[2]) + dz;
          if (!w.inBounds(x, y, z) || parent[w.index(x, y, z)] < 0) continue;
          const dd = dx * dx + dz * dz + dy * dy * 2;
          if (dd < bd) {
            bd = dd;
            best = w.index(x, y, z);
          }
        }
        if (best < 0) return;
        let len = 0;
        for (let i = best; parent[i] !== i; i = parent[i]) {
          len++;
          const z = (i / sxy) | 0;
          const x = i % w.sx;
          const X = x * S + (S >> 1);
          const Z = z * S + (S >> 1);
          const k = (Z * W + X) * 4;
          img[k] = img[k + 1] = img[k + 2] = 255;
        }
        routeLen[name] = len;
      };
      for (const a of l.lairs) trail(a.id, a.centre);
      trail('gate', l.gate.stand);
      if (l.heart) trail('heart', l.heart.centre);
    }
    writeFileSync(`${out}/stratum-${n}.png`, encodePng(W, H, img));
    // Reachability of the key places (both ways: from the arrival, and back from each lair).
    const near = (sm: Uint8Array, p: readonly number[]) => {
      for (let dy = -3; dy <= 3; dy++) for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const x = Math.floor(p[0]) + dx;
        const y = Math.floor(p[1]) + dy;
        const z = Math.floor(p[2]) + dz;
        if (w.inBounds(x, y, z) && sm[w.index(x, y, z)]) return true;
      }
      return false;
    };
    const back = l.lairs.map((a) => near(walkBfs({ world: w }, a.centre), [l.arrival.x, l.arrival.y, l.arrival.z]));
    let ores = 0;
    let solid = 0;
    for (let i = 0; i < w.blocks.length; i++) if (SOLID[w.blocks[i]]) solid++;
    for (const b of l.biomes) ores += l.stats[b].oreBlocks;
    report.push({
      stratum: n,
      biomes: l.biomes.map((b) => BIOMES[b].id),
      genMs: Math.round(t1 - t0),
      lightMs: Math.round(t2 - t1),
      attempts: (l as unknown as { timings: { attempts: number; phases: Record<string, number> } }).timings.attempts,
      phases: (l as unknown as { timings: { phases: Record<string, number> } }).timings.phases,
      floorCells: floor,
      reachableFloor: reach,
      reachShare: +(reach / floor).toFixed(3),
      routes: routeLen,
      ladders: (() => {
        let k = 0;
        for (let i = 0; i < w.blocks.length; i++) if (w.blocks[i] === BLK.LADDER && w.blocks[i - w.sx] !== BLK.LADDER) k++;
        return k;
      })(),
      lairsReachable: l.lairs.map((a) => near(seen, a.centre)),
      lairsBack: back,
      gateReachable: near(seen, l.gate.stand),
      heartReachable: l.heart ? near(seen, l.heart.centre) : null,
      vista: l.vista ? { name: l.vista.name, balcony: near(seen, l.vista.balcony), floor: near(seen, l.vista.rampFoot), lava: l.vista.lava } : null,
      works: l.dungeon ? { puzzle: l.dungeon.puzzle, locks: l.dungeon.sockets.length, vault: near(seen, l.dungeon.vault), sealedShut: !near(walkBfs({ world: w }, [l.arrival.x, l.arrival.y, l.arrival.z], new Set(l.gate.seal.map(([x, y, z]) => w.index(x, y, z)))), l.dungeon.vault) } : null,
      river: l.rivers.map((r) => ({ kind: r.kind, points: r.points.length })),
      ravines: l.ravines.length,
      secrets: l.secrets.length,
      failed: (l as unknown as { failed?: string[] }).failed ?? [],
      chests: l.chests.length,
      pages: l.pages.length,
      props: l.props.length,
      ores,
      nests: l.nests.length,
      spawnPoints: l.spawnPoints.length,
      outposts: l.outpostSites.length,
      lakes: l.features?.lakes?.length ?? 0,
      hazards: l.hazards.length,
      sites: l.sites.map((s) => s.kind + (s.name ? ':' + s.name : '')),
      stats: l.stats,
      solidShare: +(solid / w.blocks.length).toFixed(3),
    });
  }
  writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.map((r) => { const { stats, phases, ...rest } = r as Record<string, unknown>; void stats; return { ...rest, phases }; }), null, 1));
}
