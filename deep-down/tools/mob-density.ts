// MOBS proof (round 3; BRIEF §0.5, §0.6): "creature encounters every 20-40 s in the deep", "monsters never
// spawn in the camp, at outposts or in torch light", nervous but fair. In Node, on WORLD's real strata
// (the generator and the light volume, as the game loads them), with the game's own wiring of a stratum
// (game/mobs/strataLink) and the game's MobSim at 30 Hz:
// - an explorer walks a long tour of each stratum through both its biomes (WORLD's walk moves, 4.2 m/s),
//   a full lantern of its tier, fighting back at LOOP's best damage per second for the stratum (it stops
//   to fight what comes within reach, and slings what keeps away);
// - run A: no torches (the encounter cadence); run B: a torch every 12 m of the walk and an outpost on it
//   (the no-spawn rules under pressure);
// - measured: encounters (a monster first seen within 14 m after 4 s without one), the gap from one to
//   the next, how long after first sight its first blow came (fair: told and seen first), every monster
//   spawn's light, camp and outpost (violations), the kinds met per biome, packs and elites.
// Usage: node tools/run-ts.mjs tools/mob-density.ts [seed=12345] [strata=1,2,3,4,5,6] [minutes=8]
import { B, SOLID } from '../src/config/blocks';
import { lanternForTier } from '../src/config/balance';
import { loadZone } from '../src/world/gen/zoneLoader';
import { standableAt } from '../src/world/gen/strata/content';
import { MobSim, type MobEnv, type SimMob } from '../src/game/mobs/MobSim';
import { MOBS_RULES } from '../src/game/mobs/config';
import { darkTide, linkStrata, underLake, type StrataLayout } from '../src/game/mobs/strataLink';
import type { StratumLayout } from '../src/world/gen/strata/types';
import type { MobContext } from '../src/game/mobs/types';

const WALK = 4.2;
const DT = 1 / 30;
/** LOOP's best damage per second by stratum (config/weapons' header). */
const DPS = [0, 6, 10.7, 13.7, 13.7, 23, 27.5];
const SIGHT = 14;
const QUIET_END = 4;

interface RunStats {
  label: string;
  seconds: number;
  encounters: number[];
  gaps: number[];
  firstBlowAfterSight: number[];
  spawns: number;
  violations: { light: number; camp: number; outpost: number; pool: number; nest: number; water: number };
  nestBrood: number;
  nestMaxLight: number;
  nestNearest: number;
  untoldKinds: string[];
  biomeTime: Map<string, number>;
  overdue: Map<string, number>;
  maxSpawnLight: number;
  kinds: Map<string, number>;
  elites: number;
  packs: number;
  kills: number;
}

/** BFS of WORLD's walk moves (walk, step up 1, drop up to 3) from a feet cell: parent indices. */
function bfs(l: StratumLayout, from: [number, number, number]): Int32Array {
  const w = l.world;
  const { sx, sy, sz } = w;
  const blocks = w.blocks;
  const parent = new Int32Array(sx * sy * sz).fill(-1);
  const q = new Int32Array(sx * sz * 24);
  let head = 0;
  let tail = 0;
  const [x0, y00, z0] = from;
  let y0 = y00;
  for (let k = 0; k < 6 && !standableAt(blocks, sx, sy, x0, y0, z0); k++) y0--;
  const start = x0 + sx * (y0 + sy * z0);
  parent[start] = start;
  q[tail++] = start;
  const sxy = sx * sy;
  while (head < tail && tail < q.length - 8) {
    const i = q[head++];
    const z = (i / sxy) | 0;
    const y = ((i - z * sxy) / sx) | 0;
    const x = i - z * sxy - y * sx;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
      const nz = d === 2 ? z + 1 : d === 3 ? z - 1 : z;
      if (nx < 1 || nz < 1 || nx >= sx - 1 || nz >= sz - 1) continue;
      let to = -1;
      if (standableAt(blocks, sx, sy, nx, y, nz)) to = nx + sx * (y + sy * nz);
      else if (!SOLID[blocks[x + sx * (y + 2 + sy * z)]] && standableAt(blocks, sx, sy, nx, y + 1, nz)) to = nx + sx * (y + 1 + sy * nz);
      else {
        const ni = nx + sx * (y + sy * nz);
        if (!SOLID[blocks[ni]] && !SOLID[blocks[ni + sx]]) {
          for (let dd = 1; dd <= 3 && to < 0; dd++) {
            if (y - dd < 1 || SOLID[blocks[ni - dd * sx]]) break;
            if (standableAt(blocks, sx, sy, nx, y - dd, nz)) to = nx + sx * (y - dd + sy * nz);
          }
        }
      }
      if (to >= 0 && parent[to] < 0) {
        parent[to] = i;
        q[tail++] = to;
      }
    }
  }
  return parent;
}

function cellOf(l: StratumLayout, i: number): [number, number, number] {
  const w = l.world;
  return [i % w.sx, Math.floor(i / w.sx) % w.sy, Math.floor(i / (w.sx * w.sy))];
}

/** A tour: from the arrival to far reachable cells (at least 45 m apart, both biomes), each leg WORLD's walk. */
function tour(l: StratumLayout, legs: number, rng: () => number): number[] {
  const w = l.world;
  let at: [number, number, number] = [Math.floor(l.arrival.x), Math.floor(l.arrival.y), Math.floor(l.arrival.z)];
  const path: number[] = [];
  const visited: Array<[number, number, number]> = [at];
  for (let k = 0; k < legs; k++) {
    const parent = bfs(l, at);
    // Candidates: reachable cells 45-110 m away from here, far from the places already visited, in the biome visited least.
    const cand: number[] = [];
    const count: Record<string, number> = {};
    for (const v of visited) count[l.biomeAt(v[0], v[1], v[2])] = (count[l.biomeAt(v[0], v[1], v[2])] ?? 0) + 1;
    const want = [...l.biomes].sort((a, b) => (count[a] ?? 0) - (count[b] ?? 0))[0];
    for (let tries = 0; tries < 60000 && cand.length < 60; tries++) {
      const i = Math.floor(rng() * parent.length);
      if (parent[i] < 0) continue;
      const [x, y, z] = cellOf(l, i);
      const d = Math.hypot(x - at[0], z - at[2]);
      if (d < 45 || d > 110) continue;
      if (visited.some((v) => Math.hypot(v[0] - x, v[2] - z) < 35)) continue;
      if (cand.length > 20 && l.biomeAt(x, y, z) !== want) continue;
      cand.push(i);
    }
    if (!cand.length) break;
    const goal = cand[Math.floor(rng() * cand.length)];
    const leg: number[] = [];
    for (let i = goal; ; i = parent[i]) {
      leg.push(i);
      if (parent[i] === i) break;
    }
    leg.reverse();
    path.push(...(path.length ? leg.slice(1) : leg));
    at = cellOf(l, goal);
    visited.push(at);
    void w;
  }
  return path;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))];
}

async function runStratum(seed: number, n: number, minutes: number, torches: boolean): Promise<RunStats> {
  const zone = await loadZone(seed, () => undefined, n, false);
  const l = zone.layout as unknown as StratumLayout;
  const light = zone.light;
  const w = l.world;
  const rng = mulberry(seed * 31 + n * 7 + (torches ? 1 : 0));
  const path = tour(l, 14, rng);
  // Run B: a torch every 12 m of the walk (the cell over the floor beside the way, else on it), and an
  // outpost a third of the way along; the light volume recomputed with them.
  const outposts: Array<[number, number, number]> = [];
  if (torches) {
    for (let k = 6; k < path.length; k += 12) {
      const [x, y, z] = cellOf(l, path[k]);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) {
        if (!w.isSolid(x + dx, y, z + dz) && w.isSolid(x + dx, y - 1, z + dz)) {
          w.set(x + dx, y, z + dz, B.TORCH);
          break;
        }
      }
    }
    light.computeAll();
    const [ox, oy, oz] = cellOf(l, path[Math.floor(path.length / 3)]);
    outposts.push([ox + 0.5, oy, oz + 0.5]);
  }
  const lightAt = (x: number, y: number, z: number): number => {
    if (!w.inBounds(x, y, z)) return 0;
    const i = w.index(x, y, z) * 4;
    const d = light.data;
    return Math.max(d[i], d[i + 1], d[i + 2]) / 255;
  };
  const camp = (l as unknown as { camp?: { min: number[]; max: number[] } }).camp;
  const inBox = (x: number, y: number, z: number, m: number) => !!camp && camp.max[0] > camp.min[0] && x >= camp.min[0] - m && x <= camp.max[0] + m && y >= camp.min[1] - m && y <= camp.max[1] + m && z >= camp.min[2] - m && z <= camp.max[2] + m;
  const env: MobEnv = {
    solid: (x, y, z) => SOLID[w.get(x, y, z)] === 1,
    light: lightAt,
    // The game's camp margin (MobDirector): nothing hostile within 4 m of the camp either.
    inCamp: (x, y, z) => inBox(x, y, z, 4),
    depthOf: (y) => 300 - y,
    safe: (x, y, z) => outposts.some((o) => Math.hypot(x - o[0], (y - o[1]) * 0.7, z - o[2]) < 11),
  };
  const sim = new MobSim(env, seed ^ (n * 977));
  linkStrata(sim, l as unknown as StrataLayout, () => false);
  // Still water, judged on WORLD's own lakes (independent of the sim's predicate).
  const lakes = ((l as unknown as StrataLayout).features?.lakes ?? []).slice();
  const wet = (x: number, y: number, z: number) => underLake(lakes, env.solid, x, y, z);
  const st: RunStats = { label: `stratum ${n} ${torches ? 'B (torches + outpost)' : 'A'}`, seconds: 0, encounters: [], gaps: [], firstBlowAfterSight: [], spawns: 0, violations: { light: 0, camp: 0, outpost: 0, pool: 0, nest: 0, water: 0 }, nestBrood: 0, nestMaxLight: 0, nestNearest: Infinity, untoldKinds: [], biomeTime: new Map(), overdue: new Map(), maxSpawnLight: 0, kinds: new Map(), elites: 0, packs: 0, kills: 0 };
  const lantern = lanternForTier(Math.min(5, n));
  const seen = new Map<number, number>();
  const struck = new Set<number>();
  const told = new Map<number, number>();
  const metGroups = new Set<string>();
  let lastStart = -99;
  const groups = new Set<number>();
  // The explorer.
  let pi = 0;
  let along = 0;
  const p = { x: 0, y: 0, z: 0 };
  const setAt = (i: number) => {
    const [x, y, z] = cellOf(l, path[i]);
    p.x = x + 0.5;
    p.y = y;
    p.z = z + 0.5;
  };
  setAt(0);
  const c: MobContext & { look: { x: number; y: number; z: number } } = {
    time: 0,
    player: { x: p.x, y: p.y, z: p.z, vx: 0, vz: 0 },
    eye: { x: p.x, y: p.y + 1.62, z: p.z },
    look: { x: 0, y: 0, z: 1 },
    lantern: { x: p.x, y: p.y + 1.2, z: p.z, radius: lantern.radius, flame: 1, lit: true, raised: false },
    depth: 0,
    atCamp: false,
    active: true,
    stratum: n,
    night: 0,
    airborne: false,
    invulnerable: false,
  };
  // Spawns are judged after their frame (a splitting elite's children are marked once spawned).
  const pending: SimMob[] = [];
  const judge = (m: SimMob) => {
    {
      if (!m.hostile || m.guardian || m.owner || m.split || m.brain === 'vista') return;
      if (m.nest) {
        // A nest's brood (it stirs first, told): never in a torch's pool, the camp or an outpost.
        st.nestBrood++;
        const li = lightAt(Math.floor(m.position.x), Math.floor(m.foot.y || m.position.y), Math.floor(m.position.z));
        st.nestMaxLight = Math.max(st.nestMaxLight, li);
        st.nestNearest = Math.min(st.nestNearest, Math.hypot(m.position.x - p.x, m.position.z - p.z));
        if (inBox(m.position.x, m.position.y, m.position.z, 0) || env.safe!(m.position.x, m.position.y, m.position.z) || li > MOBS_RULES.torchFear) st.violations.nest++;
        if (wet(Math.floor(m.position.x), Math.floor(m.foot.y || m.position.y), Math.floor(m.position.z))) st.violations.water++;
        return;
      }
      st.spawns++;
      if (m.group && !groups.has(m.group)) {
        groups.add(m.group);
        st.packs++;
      }
      const fx = Math.floor(m.def.locomotion === 'crawl' ? m.position.x : m.foot.x || m.position.x);
      const fy = Math.floor(m.def.locomotion === 'walk' || m.def.locomotion === 'still' ? m.foot.y : m.position.y);
      const fz = Math.floor(m.def.locomotion === 'crawl' ? m.position.z : m.foot.z || m.position.z);
      const li = lightAt(fx, fy, fz);
      st.maxSpawnLight = Math.max(st.maxSpawnLight, li);
      if (li > MOBS_RULES.darkLight) {
        st.violations.light++;
        if (process.env.MOB_DEBUG) console.log(`      [light] ${m.kind} (${m.brain}, ${m.def.locomotion}) at ${fx},${fy},${fz} light ${li.toFixed(2)} pos ${m.position.x.toFixed(1)},${m.position.y.toFixed(1)},${m.position.z.toFixed(1)} foot ${m.foot.x},${m.foot.y},${m.foot.z} cell ${m.cell.x},${m.cell.y},${m.cell.z} t ${sim.time.toFixed(1)}`);
      }
      if (inBox(m.position.x, m.position.y, m.position.z, 0)) st.violations.camp++;
      if (env.safe!(m.position.x, m.position.y, m.position.z)) st.violations.outpost++;
      if (wet(fx, fy, fz)) st.violations.water++;
      const pool = lantern.radius * MOBS_RULES.poolFactor + MOBS_RULES.poolMargin - 1.5;
      if (Math.hypot(m.position.x - c.lantern.x, m.position.y - c.lantern.y, m.position.z - c.lantern.z) < pool) {
        st.violations.pool++;
        if (process.env.MOB_DEBUG) console.log(`      [pool] ${m.kind} (${m.brain}) ${Math.hypot(m.position.x - c.lantern.x, m.position.y - c.lantern.y, m.position.z - c.lantern.z).toFixed(1)} m from the lantern (pool ${pool.toFixed(1)}), from the explorer ${Math.hypot(m.position.x - p.x, m.position.z - p.z).toFixed(1)} m, t ${sim.time.toFixed(1)}`);
      }
      const key = `${m.biome}:${m.kind}`;
      st.kinds.set(key, (st.kinds.get(key) ?? 0) + 1);
    }
  };
  sim.on((e) => {
    if (e.type === 'spawn') pending.push(e.mob);
    else if (e.type === 'telegraph') {
      // Its first wind-up (a later one may come while an earlier glob is still in the air).
      if (!told.has(e.mob.id)) told.set(e.mob.id, sim.time);
    } else if (e.type === 'attack' && e.landed && e.mob.hostile && !e.mob.guardian && !struck.has(e.mob.id)) {
      // Its first blow: how long after its wind-up was told (a sound, a pose, a marker), -1 if never.
      struck.add(e.mob.id);
      const t0 = told.get(e.mob.id);
      st.firstBlowAfterSight.push(t0 !== undefined ? sim.time - t0 : -1);
      if (t0 === undefined || sim.time - t0 < 0.35) st.untoldKinds.push(`${e.mob.kind}${t0 === undefined ? ' (untold)' : ` (${(sim.time - t0).toFixed(2)} s)`}`);
    } else if (e.type === 'die' && e.mob.hostile) st.kills++;
  });
  let engaged = false;
  let quietFor = 999;
  let lastEnd = -1;
  let swing = 0;
  let stuckOn = 0;
  let stuckT = 0;
  const total = minutes * 60;
  const eyeV = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < total && pi < path.length - 1; t += DT) {
    c.time = t;
    c.night = darkTide(t + n * 97);
    c.atCamp = inBox(p.x, p.y + 0.5, p.z, 0);
    // The nearest threat in sight.
    let target: SimMob | null = null;
    let td = Infinity;
    let anyInSight = false;
    eyeV.x = p.x;
    eyeV.y = p.y + 1.62;
    eyeV.z = p.z;
    for (const m of sim.mobs) {
      if (!m.hostile || m.dying || m.guardian || m.brain === 'vista' || m.mode === 'under' || m.fade < 0.3) continue;
      const d = Math.hypot(m.position.x - p.x, m.position.y - (p.y + 1), m.position.z - p.z);
      if (d > SIGHT) continue;
      if (!sim.clearSight(eyeV, m.position)) continue;
      anyInSight = true;
      if (!seen.has(m.id)) {
        seen.set(m.id, sim.time);
        // A new threat: a group (or a lone one) not met before; sightings within 6 s are one encounter.
        const key = m.group ? `g${m.group}` : `m${m.id}`;
        if (!metGroups.has(key)) {
          metGroups.add(key);
          if (t - lastStart > 6) {
            if (st.encounters.length) st.gaps.push(t - Math.max(lastEnd, lastStart));
            st.encounters.push(t);
            lastStart = t;
          }
        }
      }
      if (d < td) {
        td = d;
        target = m;
      }
    }
    if (anyInSight) {
      engaged = true;
      quietFor = 0;
    } else {
      quietFor += DT;
      if (engaged && quietFor >= QUIET_END) {
        engaged = false;
        lastEnd = t - QUIET_END;
      }
    }
    // Fight back: a blow every half second within reach, a sling shot at one that keeps away.
    let moving = true;
    swing -= DT;
    if (target && td < 9) {
      moving = false;
      if (swing <= 0) {
        swing = 0.5;
        if (td < 3.2) sim.hit(target, DPS[n] * 0.5, { weapon: 'sword', from: eyeV });
        else sim.hit(target, DPS[n] * 0.5 * 0.45, { weapon: 'sling', from: eyeV, light: true });
      }
      if (stuckOn === target.id) stuckT += DT;
      else {
        stuckOn = target.id;
        stuckT = 0;
      }
      // A fight that does not end (it cannot be reached): the explorer moves on.
      if (stuckT > 20) moving = true;
    }
    if (moving) {
      along += WALK * DT;
      while (along >= 1 && pi < path.length - 1) {
        along -= 1;
        pi++;
      }
      const [ax, ay, az] = cellOf(l, path[pi]);
      const [bx, by, bz] = cellOf(l, path[Math.min(path.length - 1, pi + 1)]);
      const k = Math.min(1, along);
      const nx = ax + 0.5 + (bx - ax) * k;
      const nz = az + 0.5 + (bz - az) * k;
      const vx = (nx - p.x) / DT;
      const vz = (nz - p.z) / DT;
      p.x = nx;
      p.z = nz;
      p.y = ay + (by - ay) * k;
      c.player.vx = vx;
      c.player.vz = vz;
      const ll = Math.hypot(vx, vz);
      if (ll > 0.1) {
        c.look.x = vx / ll;
        c.look.z = vz / ll;
        c.look.y = 0;
      }
    } else {
      c.player.vx = 0;
      c.player.vz = 0;
      if (target) {
        const dx = target.position.x - p.x;
        const dz = target.position.z - p.z;
        const ll = Math.max(0.01, Math.hypot(dx, dz));
        c.look.x = dx / ll;
        c.look.z = dz / ll;
      }
    }
    c.player.x = p.x;
    c.player.y = p.y;
    c.player.z = p.z;
    c.eye.x = p.x;
    c.eye.y = p.y + 1.62;
    c.eye.z = p.z;
    c.lantern.x = p.x + c.look.z * 0.3;
    c.lantern.y = p.y + 1.25;
    c.lantern.z = p.z - c.look.x * 0.3;
    sim.update(DT, c);
    {
      // Where the walk goes, and how long a hunting pack was due but could not be placed (no dark cell).
      const b = l.biomeAt(p.x, p.y + 0.5, p.z);
      st.biomeTime.set(b, (st.biomeTime.get(b) ?? 0) + DT);
      if (sim.quiet > sim.encounterDue + 3) st.overdue.set(b, (st.overdue.get(b) ?? 0) + DT);
    }
    for (const m of pending) judge(m);
    pending.length = 0;
    st.seconds = t;
  }
  for (const m of sim.mobs) if (m.elite) st.elites++;
  return st;
}

function report(s: RunStats): void {
  const iv: number[] = [];
  for (let i = 1; i < s.encounters.length; i++) iv.push(s.encounters[i] - s.encounters[i - 1]);
  const f = (x: number) => (Number.isFinite(x) ? x.toFixed(0) : '-');
  const fair = s.firstBlowAfterSight;
  console.log(`  ${s.label}: ${f(s.seconds)} s walked, ${s.encounters.length} encounters (one every ${f(s.seconds / Math.max(1, s.encounters.length))} s on average)`);
  console.log(`    start-to-start: median ${f(quantile(iv, 0.5))} s, p10 ${f(quantile(iv, 0.1))}, p90 ${f(quantile(iv, 0.9))}; gap from the last sight to the next encounter: median ${f(quantile(s.gaps, 0.5))} s, p90 ${f(quantile(s.gaps, 0.9))}, longest ${f(Math.max(0, ...s.gaps))}`);
  const toldOk = fair.filter((x) => x >= 0);
  console.log(`    first blows ${fair.length}: told first (its wind-up's sound, pose, marker) ${toldOk.length}, untold ${fair.length - toldOk.length}; time from tell to blow min ${toldOk.length ? Math.min(...toldOk).toFixed(2) : '-'} s, median ${toldOk.length ? quantile(toldOk, 0.5).toFixed(2) : '-'} s`);
  if (s.untoldKinds.length) console.log(`    blows told under 0.35 s: ${s.untoldKinds.join(', ')}`);
  console.log(`    roaming monster spawns ${s.spawns} (${s.packs} packs), kills ${s.kills}; violations: in light ${s.violations.light}, camp ${s.violations.camp}, outpost ${s.violations.outpost}, lantern pool ${s.violations.pool}, under a lake ${s.violations.water}; brightest spawn cell ${s.maxSpawnLight.toFixed(2)} (limit ${MOBS_RULES.darkLight})`);
  console.log(`    nest brood ${s.nestBrood} (stirring first): in a torch's pool, the camp or an outpost ${s.violations.nest}; brightest ${s.nestMaxLight.toFixed(2)} (nest limit ${MOBS_RULES.torchFear}); nearest to the explorer ${Number.isFinite(s.nestNearest) ? s.nestNearest.toFixed(1) : '-'} m`);
  console.log(`    time by biome: ${[...s.biomeTime].map(([b, t]) => `${b} ${t.toFixed(0)} s (a pack overdue ${(s.overdue.get(b) ?? 0).toFixed(0)} s)`).join(', ')}`);
  const byBiome = new Map<string, string[]>();
  for (const [k, v] of [...s.kinds].sort((a, b) => b[1] - a[1])) {
    const [b, kind] = k.split(':');
    if (!byBiome.has(b)) byBiome.set(b, []);
    byBiome.get(b)!.push(`${kind} ${v}`);
  }
  for (const [b, list] of byBiome) console.log(`    ${b}: ${list.join(', ')}`);
}

export default async function main(args: string[]): Promise<void> {
  const seed = Number(args[0] ?? 12345);
  const strata = (args[1] ?? '1,2,3,4,5,6').split(',').map(Number);
  const minutes = Number(args[2] ?? 8);
  console.log(`MOBS density on seed ${seed}, ${minutes} min a run (encounter = a new group of monsters first seen within ${SIGHT} m; sightings within 6 s are one)`);
  const all: number[] = [];
  const deep: number[] = [];
  for (const n of strata) {
    for (const torches of [false, true]) {
      const t0 = Date.now();
      const s = await runStratum(seed, n, minutes, torches);
      report(s);
      console.log(`    (${((Date.now() - t0) / 1000).toFixed(1)} s to run)`);
      if (!torches) {
        for (let i = 1; i < s.encounters.length; i++) {
          all.push(s.encounters[i] - s.encounters[i - 1]);
          if (n >= 2) deep.push(s.encounters[i] - s.encounters[i - 1]);
        }
      }
    }
  }
  if (deep.length) console.log(`the deep (strata II-VI, run A): start-to-start median ${quantile(deep, 0.5).toFixed(0)} s, p10 ${quantile(deep, 0.1).toFixed(0)}, p90 ${quantile(deep, 0.9).toFixed(0)} over ${deep.length} intervals`);
  if (all.length) console.log(`every stratum (run A): median ${quantile(all, 0.5).toFixed(0)} s over ${all.length} intervals`);
}
