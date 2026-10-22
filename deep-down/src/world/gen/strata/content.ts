import { B, SOLID } from '../../../config/blocks';
import { BIOMES, LAIR_PAGES, STRATA_PAGES_PER_BIOME, type BiomeId, type StratumIndex } from '../../../config/biomes';
import { STRATA_GEN } from '../../../config/balance';
import { Rng } from '../../../core/rng';
import { HANGING_PROPS, type PropKind, type PropSpec, type Region } from '../types';
import type { CarveState } from './carve';
import { floorNear, isHost, type Decor } from './dress';
import { edgePath, type PlanNode } from './plan';
import type { BiomeStats, CampSite, ChestSite, GateSite, HazardZone, LairSite, NestSite, OutpostSite, PageSite, SpawnPoint, StructureSite, V3 } from './types';

/**
 * The content of a stratum (round 3, WORLD): the camp or the lift, the gate, the lairs, and the
 * density pass over the walkable floor (ore veins, chests, Halden's pages, props, light pockets,
 * nests, spawn points, outpost sites), with the per-biome counts the tests read.
 */

/** Standable for the walk: room for the explorer, solid ground that is not lava. */
export function standableAt(blocks: Uint8Array, sx: number, sy: number, x: number, y: number, z: number): boolean {
  if (y < 1 || y >= sy - 2) return false;
  const i = x + sx * (y + sy * z);
  const below = blocks[i - sx];
  return !SOLID[blocks[i]] && !SOLID[blocks[i + sx]] && SOLID[below] === 1 && below !== B.LAVA;
}

/**
 * Walk BFS (the explorer's moves: walk, auto-step up 1, drop up to 3) from a feet cell. `open`
 * cells count as air (the gate's seal, for the "gates open" proof). Returns the seen mask.
 */
export function walkBfs(st: { world: { sx: number; sy: number; sz: number; blocks: Uint8Array } }, from: V3, open?: ReadonlySet<number>, maxDrop = 3): Uint8Array {
  const w = st.world;
  const { sx, sy, sz } = w;
  let blocks = w.blocks;
  if (open && open.size) {
    blocks = blocks.slice();
    for (const i of open) blocks[i] = B.AIR;
  }
  const seen = new Uint8Array(sx * sy * sz);
  const q = new Int32Array(sx * sy * sz > 1 << 22 ? 1 << 23 : sx * sy * sz);
  const qm = q.length;
  let head = 0;
  let tail = 0;
  let x0 = Math.floor(from[0]);
  let y0 = Math.floor(from[1]);
  const z0 = Math.floor(from[2]);
  for (let k = 0; k < 6 && !standableAt(blocks, sx, sy, x0, y0, z0); k++) y0--;
  if (!standableAt(blocks, sx, sy, x0, y0, z0)) {
    y0 = Math.floor(from[1]);
    for (let k = 0; k < 6 && !standableAt(blocks, sx, sy, x0, y0, z0); k++) y0++;
  }
  if (!standableAt(blocks, sx, sy, x0, y0, z0)) {
    x0 = x0 | 0;
    return seen;
  }
  const push = (i: number) => {
    if (seen[i]) return;
    seen[i] = 1;
    q[tail % qm] = i;
    tail++;
  };
  push(x0 + sx * (y0 + sy * z0));
  const sxy = sx * sy;
  while (head < tail) {
    const i = q[head % qm];
    head++;
    const z = (i / sxy) | 0;
    const y = ((i - z * sxy) / sx) | 0;
    const x = i - z * sxy - y * sx;
    for (let d = 0; d < 4; d++) {
      const nx = d === 0 ? x + 1 : d === 1 ? x - 1 : x;
      const nz = d === 2 ? z + 1 : d === 3 ? z - 1 : z;
      if (nx < 1 || nz < 1 || nx >= sx - 1 || nz >= sz - 1) continue;
      if (standableAt(blocks, sx, sy, nx, y, nz)) {
        push(nx + sx * (y + sy * nz));
        continue;
      }
      // Step up one (headroom over the current cell).
      if (!SOLID[blocks[x + sx * (y + 2 + sy * z)]] && standableAt(blocks, sx, sy, nx, y + 1, nz)) {
        push(nx + sx * (y + 1 + sy * nz));
        continue;
      }
      // Drop into the neighbour column.
      const ni = nx + sx * (y + sy * nz);
      if (!SOLID[blocks[ni]] && !SOLID[blocks[ni + sx]]) {
        for (let dd = 1; dd <= maxDrop; dd++) {
          if (y - dd < 1) break;
          if (SOLID[blocks[ni - dd * sx]]) break;
          if (standableAt(blocks, sx, sy, nx, y - dd, nz)) {
            push(nx + sx * (y - dd + sy * nz));
            break;
          }
        }
      }
    }
  }
  return seen;
}

/** Is a reachable cell within r (plan) and dy levels of p? Returns the cell's feet point or null. */
export function reachNear(seen: Uint8Array, w: { sx: number; sy: number; sz: number }, p: V3, r = 3, levels = 4): V3 | null {
  const x0 = Math.floor(p[0]);
  const y0 = Math.floor(p[1]);
  const z0 = Math.floor(p[2]);
  let best: V3 | null = null;
  let bd = Infinity;
  for (let dy = -levels; dy <= levels; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const x = x0 + dx;
    const y = y0 + dy;
    const z = z0 + dz;
    if (x < 0 || y < 0 || z < 0 || x >= w.sx || y >= w.sy || z >= w.sz) continue;
    if (!seen[x + w.sx * (y + w.sy * z)]) continue;
    const d = dx * dx + dz * dz + dy * dy * 2;
    if (d < bd) {
      bd = d;
      best = [x + 0.5, y, z + 0.5];
    }
  }
  return best;
}

export interface ContentOut {
  props: PropSpec[];
  lairs: LairSite[];
  gate: GateSite;
  arrival: { x: number; y: number; z: number; yaw: number };
  camp: Region;
  campSite: CampSite | null;
  outpostSites: OutpostSite[];
  pages: PageSite[];
  chests: ChestSite[];
  nests: NestSite[];
  spawnPoints: SpawnPoint[];
  hazards: HazardZone[];
  sites: StructureSite[];
  landmarks: Record<string, [number, number, number]>;
  heart: { centre: V3; radius: number; spawn: V3 } | null;
  stats: Record<string, BiomeStats>;
  oreBlocks: number;
}

/**
 * Build the fixed places (the camp or the lift, the gate, the lairs, the heart) into the voxels. Runs
 * before the walk BFS (they change the floor). Returns the gate's seal cells and the places' data.
 */
export function buildPlaces(st: CarveState, stratum: StratumIndex, seed: number) {
  const w = st.world;
  const plan = st.plan;
  const rng = new Rng(seed ^ 0x91ace);
  const arrivalNode = plan.nodes[plan.arrival];
  const gateNode = plan.nodes[plan.gate];
  const set = (x: number, y: number, z: number, id: number) => {
    if (x < 1 || z < 1 || y < 1 || x >= w.sx - 1 || z >= w.sz - 1 || y >= w.sy - 1) return;
    w.blocks[x + w.sx * (y + w.sy * z)] = id;
  };
  const get = (x: number, y: number, z: number) => w.get(x, y, z);

  // The gate: a sealed shaft in the gate hall's floor (5 x 5 seal, a 3 m pit under it), or in VI the
  // door to the Heart's chamber across the passage.
  const seal: V3[] = [];
  const gx = Math.floor(gateNode.x);
  const gz = Math.floor(gateNode.z);
  const gy = gateNode.y;
  let gateCentre: V3 = [gx + 0.5, gy, gz + 0.5];
  let gateStand: V3 = [gx + 0.5, gy, gz + 4.5];
  if (plan.heart === null) {
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
      if (edge) {
        set(gx + dx, gy - 1, gz + dz, B.GLYPH_STONE);
        continue;
      }
      set(gx + dx, gy - 1, gz + dz, B.GATE_SEAL);
      seal.push([gx + dx, gy - 1, gz + dz]);
      for (let k = 2; k <= 4; k++) set(gx + dx, gy - k, gz + dz, Math.abs(dx) === 2 || Math.abs(dz) === 2 || k === 4 ? B.GLYPH_STONE : B.AIR);
    }
    // Four rune lights at the corners.
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) if (get(gx + dx, gy + 2, gz + dz) === B.AIR) set(gx + dx, gy + 2, gz + dz, B.LIGHT_RUNE);
  } else {
    // The Heart's door: plug the passage from the gate hall to the heart chamber.
    const e = plan.edges.find((ed) => (ed.a === plan.gate && ed.b === plan.heart) || (ed.b === plan.gate && ed.a === plan.heart))!;
    const path = edgePath(plan, e, 0.6);
    const fromGate = e.a === plan.gate ? path : [...path].reverse();
    const rim = Math.max(gateNode.rx, gateNode.rz) + 3;
    let k = 0;
    while (k < fromGate.length - 1 && Math.hypot(fromGate[k][0] - gateNode.x, fromGate[k][2] - gateNode.z) < rim) k++;
    const [px, py, pz] = fromGate[k];
    const [qx, , qz] = fromGate[Math.min(fromGate.length - 1, k + 2)];
    const tx = qx - px;
    const tz = qz - pz;
    const tl = Math.hypot(tx, tz) || 1;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) for (let dy = -1; dy <= 8; dy++) {
      const x = Math.floor(px) + dx;
      const z = Math.floor(pz) + dz;
      const y = Math.round(py) + dy;
      const along = ((x + 0.5 - px) * tx + (z + 0.5 - pz) * tz) / tl;
      if (Math.abs(along) > 0.8) continue;
      if (get(x, y, z) !== B.AIR) continue;
      set(x, y, z, B.GATE_SEAL);
      seal.push([x, y, z]);
    }
    gateCentre = [px, Math.round(py), pz];
    gateStand = [px - (tx / tl) * 3, Math.round(py), pz - (tz / tl) * 3];
  }

  // Lairs: flat arenas, a ring of the biome's light at the rim.
  for (const li of plan.lairs) {
    const n = plan.nodes[li];
    const lb = BIOMES[n.biome].lightBlock;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const x = Math.floor(n.x + Math.cos(a) * (n.rx - 2.5));
      const z = Math.floor(n.z + Math.sin(a) * (n.rz - 2.5));
      if (get(x, n.y + 3, z) === B.AIR) set(x, n.y + 3, z, lb);
    }
  }

  // The heart chamber (VI): a dais of heart stone with its red light.
  if (plan.heart !== null) {
    const h = plan.nodes[plan.heart];
    const hx = Math.floor(h.x);
    const hz = Math.floor(h.z);
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dz * dz <= 17) set(hx + dx, h.y - 1, hz + dz, B.HEART_STONE);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (let k = 0; k < 3; k++) set(hx + dx, h.y + k, hz + dz, B.HEART_STONE);
    for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) set(hx + dx, h.y + 4, hz + dz, B.LIGHT_HEART);
  }

  // The camp (stratum I) or the lift's landing: a plank deck, flat and lit.
  const ax = Math.floor(arrivalNode.x);
  const az = Math.floor(arrivalNode.z);
  const ay = arrivalNode.y;
  const deckR = stratum === 1 ? 7 : 4;
  for (let dz = -deckR; dz <= deckR; dz++) for (let dx = -deckR; dx <= deckR; dx++) {
    if (isHost(get(ax + dx, ay - 1, az + dz)) && get(ax + dx, ay, az + dz) === B.AIR) set(ax + dx, ay - 1, az + dz, B.PLANK);
  }
  void rng;
  return { seal, gateCentre, gateStand };
}

/** Everything placed on the walkable floor (after the walk BFS). */
export function placeContent(st: CarveState, stratum: StratumIndex, seed: number, seen: Uint8Array, decor: Decor, places: ReturnType<typeof buildPlaces>): ContentOut {
  const w = st.world;
  const plan = st.plan;
  const { sx, sy, sz } = w;
  const rng = new Rng(seed ^ 0xc0e7e47);
  const props: PropSpec[] = [];
  let propN = 0;
  const lights: V3[] = decor.lights.map((l) => [l[0], l[1], l[2]]);
  const set = (x: number, y: number, z: number, id: number) => {
    if (x < 1 || z < 1 || y < 1 || x >= sx - 1 || z >= sz - 1 || y >= sy - 1) return;
    w.blocks[x + sx * (y + sy * z)] = id;
  };
  const get = (x: number, y: number, z: number) => w.get(x, y, z);
  const addProp = (p: Omit<PropSpec, 'id' | 'seed' | 'emitters' | 'rotY' | 'scale' | 'anchor'> & Partial<PropSpec>, light?: number): PropSpec => {
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const y = Math.floor(p.y);
    const spec: PropSpec = {
      id: p.id ?? `s${stratum}_${p.kind}_${propN++}`,
      rotY: rng.range(0, Math.PI * 2),
      scale: 1,
      anchor: [x, y - 1, z],
      emitters: [],
      seed: rng.int(0, 1 << 30),
      ...p,
    };
    if (light !== undefined) {
      const ey = p.kind === 'hangingLantern' ? y : y + 1;
      if (get(x, ey, z) === B.AIR) {
        set(x, ey, z, light);
        spec.emitters = [[x, ey, z]];
        lights.push([x, ey, z]);
      }
    }
    props.push(spec);
    return spec;
  };

  // Reachable floor cells per biome (the density pass draws from them).
  const cells: number[] = [];
  const sxy = sx * sy;
  for (let i = 0; i < seen.length; i++) if (seen[i]) cells.push(i);
  const cellOf = (i: number): V3 => {
    const z = (i / sxy) | 0;
    const y = ((i - z * sxy) / sx) | 0;
    return [i - z * sxy - y * sx, y, z];
  };
  const biomeAtCell = (x: number, z: number): BiomeId => plan.biomes[st.biomeCol[x + z * sx]];
  const solidN = (x: number, y: number, z: number) => (SOLID[get(x + 1, y, z)] ? 1 : 0) + (SOLID[get(x - 1, y, z)] ? 1 : 0) + (SOLID[get(x, y, z + 1)] ? 1 : 0) + (SOLID[get(x, y, z - 1)] ? 1 : 0);
  const occupied = new Set<number>();
  const free = (x: number, y: number, z: number) => !occupied.has(x + sx * (y + sy * z)) && get(x, y, z) === B.AIR && get(x, y + 1, z) === B.AIR;
  const claim = (x: number, y: number, z: number) => occupied.add(x + sx * (y + sy * z));
  // A 2D spacing grid per category.
  const grids = new Map<string, Map<number, V3[]>>();
  const spaced = (cat: string, p: V3, d: number) => {
    let g = grids.get(cat);
    if (!g) grids.set(cat, (g = new Map()));
    const cs = Math.max(4, Math.ceil(d));
    const gx = Math.floor(p[0] / cs);
    const gz = Math.floor(p[2] / cs);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of g.get(gx + a + (gz + b) * 1000) ?? []) if (Math.hypot(q[0] - p[0], (q[1] - p[1]) * 2, q[2] - p[2]) < d) return false;
    return true;
  };
  const mark = (cat: string, p: V3, d: number) => {
    const g = grids.get(cat)!;
    const cs = Math.max(4, Math.ceil(d));
    const k = Math.floor(p[0] / cs) + Math.floor(p[2] / cs) * 1000;
    const list = g.get(k) ?? [];
    list.push(p);
    g.set(k, list);
  };
  const order = cells.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }

  // ---- The arrival: the camp (I) or the lift's landing.
  const an = plan.nodes[plan.arrival];
  const ax = Math.floor(an.x) + 0.5;
  const az = Math.floor(an.z) + 0.5;
  const ay = an.y;
  const landmarks: Record<string, [number, number, number]> = {};
  let campSite: CampSite | null = null;
  let camp: Region;
  if (stratum === 1) {
    addProp({ kind: 'campfire', x: ax, y: ay, z: az, interact: 'rest', id: 'camp_fire' }, B.LIGHT_EMBER);
    addProp({ kind: 'workbench', x: ax + 3, y: ay, z: az - 2.5, rotY: 0, interact: 'craft', id: 'camp_workbench' });
    addProp({ kind: 'chest', x: ax - 4, y: ay, z: az - 3, rotY: 0.35, interact: 'storage', id: 'camp_chest' });
    addProp({ kind: 'bedroll', x: ax - 4.5, y: ay, z: az + 2.5, rotY: 0.2, id: 'camp_bedroll' });
    addProp({ kind: 'crate', x: ax + 5.5, y: ay, z: az + 3.5 });
    addProp({ kind: 'barrel', x: ax + 5, y: ay, z: az + 5 });
    addProp({ kind: 'barrel', x: ax - 6, y: ay, z: az - 0.5 });
    addProp({ kind: 'pickaxeRack', x: ax + 1, y: ay, z: az - 5.5, rotY: 0 });
    for (const [dx, dz] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) addProp({ kind: 'lanternPost', x: ax + dx, y: ay, z: az + dz }, B.LIGHT_AMBER);
    campSite = {
      region: { id: 'camp', min: [ax - an.rx, ay - 1, az - an.rz], max: [ax + an.rx, ay + 7, az + an.rz] },
      fire: [ax, ay, az],
      stations: [
        { station: 'workbench', p: [ax + 3, ay, az - 2.5], rotY: 0 },
        { station: 'furnace', p: [ax + 6, ay, az - 1], rotY: -Math.PI / 2 },
        { station: 'forge', p: [ax - 1, ay, az - 6], rotY: 0 },
        { station: 'alchemy', p: [ax - 6.5, ay, az - 3.5], rotY: Math.PI / 2 },
        { station: 'storage', p: [ax - 4, ay, az - 3], rotY: 0.35 },
        { station: 'bedroll', p: [ax - 4.5, ay, az + 2.5], rotY: 0.2 },
      ],
    };
    camp = campSite.region;
    landmarks.campfire = [ax, ay, az];
  } else {
    addProp({ kind: 'hoistWinch', x: ax, y: ay, z: az - 2, rotY: 0, interact: 'feature', feature: { kind: 'lift', id: `lift_${stratum}` }, id: `lift_${stratum}` }, B.LIGHT_LAMP);
    for (const [dx, dz] of [[-3, 2], [3, 2]]) addProp({ kind: 'lanternPost', x: ax + dx, y: ay, z: az + dz }, B.LIGHT_AMBER);
    camp = { id: 'lift', min: [ax - 6, ay - 1, az - 6], max: [ax + 6, ay + 6, az + 6] };
    landmarks.campfire = [ax, ay, az];
  }
  for (let dz = -an.rz; dz <= an.rz; dz++) for (let dx = -an.rx; dx <= an.rx; dx++) claim(Math.floor(ax + dx), ay, Math.floor(az + dz));
  // The title camera's ledge: the arrival hall's centre, a little back from the fire.
  landmarks.ledge = [ax - 0.5, ay, az + 3.5];
  const arrivalYaw = Math.atan2(plan.nodes[plan.gate].x - ax, plan.nodes[plan.gate].z - az);
  const arrival = { x: ax, y: ay, z: az + (stratum === 1 ? 4 : 1.5), yaw: arrivalYaw };

  // ---- The gate.
  const gn = plan.nodes[plan.gate];
  addProp({ kind: 'abyssMonolith', x: places.gateStand[0], y: places.gateStand[1], z: places.gateStand[2] + (plan.heart === null ? 1.5 : 0), rotY: 0, scale: 0.35, interact: 'feature', feature: { kind: 'gate', id: `gate_${stratum}` }, id: `gate_${stratum}` }, B.LIGHT_RUNE);
  const gate: GateSite = {
    id: `gate_${stratum}`,
    stratum,
    centre: places.gateCentre,
    stand: places.gateStand,
    seal: places.seal,
    shards: [...plan.biomes],
    shardsNeeded: 2,
    next: stratum < 6 ? ((stratum + 1) as StratumIndex) : null,
  };
  landmarks.gate = [gn.x, gn.y, gn.z];

  // ---- Lairs.
  const lairs: LairSite[] = plan.lairs.map((li) => {
    const n = plan.nodes[li];
    const e = plan.edges.find((ed) => ed.a === li || ed.b === li)!;
    const path = edgePath(plan, e, 0.6);
    const fromLair = e.a === li ? path : [...path].reverse();
    let k = 0;
    while (k < fromLair.length - 1 && Math.hypot(fromLair[k][0] - n.x, fromLair[k][2] - n.z) < Math.max(n.rx, n.rz) - 1) k++;
    const ent = reachNear(seen, w, fromLair[k], 3, 3) ?? [fromLair[k][0], fromLair[k][1], fromLair[k][2]];
    const centre: V3 = reachNear(seen, w, [n.x, n.y, n.z], 3, 3) ?? [n.x, n.y, n.z];
    landmarks[`lair_${n.biome}`] = centre;
    for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) claim(Math.floor(n.x) + dx, n.y, Math.floor(n.z) + dz);
    return { id: `lair_${n.biome}`, biome: n.biome, guardian: BIOMES[n.biome].mobs.guardian, centre, radius: Math.min(n.rx, n.rz) - 1, spawn: centre, entrance: ent as V3, revealRadius: STRATA_GEN.lairReveal };
  });

  // ---- The heart.
  let heart: ContentOut['heart'] = null;
  if (plan.heart !== null) {
    const h = plan.nodes[plan.heart];
    heart = { centre: [h.x, h.y, h.z], radius: Math.max(h.rx, h.rz), spawn: [h.x, h.y, h.z + 8] };
    landmarks.heart = [h.x, h.y, h.z];
  }

  // ---- Roles of the rooms: per biome a shrine, an ore room, a mine camp (mines x2, amber x1), nests,
  // outposts, set pieces on the caverns.
  const sites: StructureSite[] = [];
  const nests: NestSite[] = [];
  const outpostSites: OutpostSite[] = [];
  for (let bi = 0; bi < 2; bi++) {
    const biome = plan.biomes[bi];
    const rooms = plan.nodes.filter((n) => n.kind === 'room' && n.biome === biome && n.role === null);
    const caverns = plan.nodes.filter((n) => n.kind === 'cavern' && n.biome === biome);
    const take = (role: string): PlanNode | null => {
      const free = rooms.filter((r) => r.role === null);
      if (!free.length) return null;
      const r = free[rng.int(0, free.length - 1)];
      r.role = role;
      return r;
    };
    const camps = biome === 'haldenMines' ? 2 : biome === 'amberHollows' ? 1 : 0;
    for (let k = 0; k < camps; k++) take('mineCamp');
    take('shrine');
    take('oreRoom');
    take('nest');
    take('nest');
    take('outpost');
    take('outpost');
    const setPiece: Partial<Record<BiomeId, string[]>> = { crystalGeode: ['geode', 'crystalChoir'], floodedGrottoes: ['stillLake'], haldenMines: ['lanternVault'], magmaVeins: ['emberDeep'] };
    (setPiece[biome] ?? []).forEach((name, k) => {
      if (caverns[k]) caverns[k].role = `set:${name}`;
    });
  }
  const floorAt = (n: { x: number; y: number; z: number }) => {
    const f = floorNear(st, Math.floor(n.x), n.y, Math.floor(n.z), 4);
    return f < 0 ? n.y : f;
  };
  for (const n of plan.nodes) {
    if (!n.role) continue;
    const c: V3 = [Math.floor(n.x) + 0.5, floorAt(n), Math.floor(n.z) + 0.5];
    if (!reachNear(seen, w, c, 2, 2)) continue;
    const lb = BIOMES[n.biome].lightBlock;
    if (n.role === 'nest') {
      nests.push({ id: `nest_${n.id}`, biome: n.biome, p: c, radius: Math.max(4, Math.min(n.rx, n.rz)), kind: null });
      // A nest's floor: tangles and loose stone.
      for (let k = 0; k < 10; k++) {
        const x = Math.floor(n.x) + rng.int(-3, 3);
        const z = Math.floor(n.z) + rng.int(-3, 3);
        const f = floorNear(st, x, n.y, z, 3);
        if (f > 0 && !st.corridor[x + z * sx] && isHost(get(x, f - 1, z))) set(x, f - 1, z, rng.chance(0.5) ? B.ROOTS : B.RUBBLE);
      }
      continue;
    }
    if (n.role === 'outpost') {
      outpostSites.push({ id: `outpost_${n.id}`, biome: n.biome, p: c, radius: 4 });
      continue;
    }
    if (n.role === 'mineCamp') {
      sites.push({ id: `mineCamp_${n.id}`, kind: 'mineCamp', biome: n.biome, centre: c, radius: Math.max(n.rx, n.rz) });
      addProp({ kind: 'hangingLantern', x: c[0], y: c[1] + 3.2, z: c[2], anchor: [Math.floor(c[0]), Math.floor(c[1]) + 5, Math.floor(c[2])] }, B.LIGHT_LAMP);
      for (const k of ['crate', 'crate', 'barrel', 'brokenCart', 'pickaxeRack', 'ropeCoil'] as const) {
        const p = nearWall(c, 5);
        if (p) addProp({ kind: k, x: p[0], y: p[1], z: p[2] });
      }
      continue;
    }
    if (n.role === 'shrine') {
      sites.push({ id: `shrine_${n.id}`, kind: 'shrine', biome: n.biome, centre: c, radius: 4 });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        const x = Math.floor(c[0] + Math.cos(a) * 3.5);
        const z = Math.floor(c[2] + Math.sin(a) * 3.5);
        if (st.corridor[x + z * sx]) continue;
        for (let h = 0; h < 2; h++) if (get(x, c[1] + h, z) === B.AIR) set(x, c[1] + h, z, h === 1 ? B.GLYPH_STONE : B.ANCIENT_BRICK);
      }
      if (get(Math.floor(c[0]), c[1] + 3, Math.floor(c[2])) === B.AIR) {
        set(Math.floor(c[0]), c[1] + 3, Math.floor(c[2]), B.LIGHT_RUNE);
        lights.push([Math.floor(c[0]), c[1] + 3, Math.floor(c[2])]);
      }
      continue;
    }
    if (n.role === 'oreRoom') {
      sites.push({ id: `oreRoom_${n.id}`, kind: 'oreRoom', biome: n.biome, centre: c, radius: Math.max(n.rx, n.rz) });
      continue;
    }
    if (n.role.startsWith('set:')) {
      const name = n.role.slice(4);
      sites.push({ id: `set_${name}`, kind: 'setPiece', biome: n.biome, centre: c, radius: Math.max(n.rx, n.rz), name });
      landmarks[name] = c;
      continue;
    }
    void lb;
  }

  /** A reachable floor point next to a wall within r of c (free, claimed when returned). */
  function nearWall(c: V3, r: number): V3 | null {
    for (let tries = 0; tries < 40; tries++) {
      const x = Math.floor(c[0]) + rng.int(-r, r);
      const z = Math.floor(c[2]) + rng.int(-r, r);
      for (let dy = -2; dy <= 2; dy++) {
        const y = c[1] + dy;
        if (!seen[x + sx * (y + sy * z)] || !free(x, y, z) || solidN(x, y, z) === 0) continue;
        claim(x, y, z);
        return [x + 0.5, y, z + 0.5];
      }
    }
    return null;
  }

  // ---- Density over the walkable floor: one pass, nearest-category spacing.
  const chests: ChestSite[] = [];
  const pages: PageSite[] = [];
  const spawnPoints: SpawnPoint[] = [];
  const stats: Record<string, BiomeStats> = {};
  for (const b of plan.biomes) stats[b] = { floorCells: 0, oreVeins: 0, oreBlocks: 0, chests: 0, props: 0, lights: 0, caverns: plan.nodes.filter((n) => n.kind === 'cavern' && n.biome === b).length, chestsPer25m: 0 };
  for (const i of cells) {
    const [x, , z] = cellOf(i);
    stats[biomeAtCell(x, z)].floorCells++;
  }
  const nearArrival = (p: V3, d: number) => Math.hypot(p[0] - ax, p[2] - az) < d;
  const inLair = (p: V3) => lairs.some((l) => Math.hypot(p[0] - l.centre[0], p[2] - l.centre[2]) < l.radius - 1);

  // Light: a darkness grid (4 m cells) of the lights placed so far, refreshed as lights are added.
  const darkKey = (x: number, y: number, z: number) => Math.floor(x / 4) + Math.floor(y / 4) * 64 + Math.floor(z / 4) * 64 * 24;
  const lit = new Set<number>();
  const markLit = (p: V3) => {
    for (let a = -2; a <= 2; a++) for (let b = -1; b <= 1; b++) for (let c2 = -2; c2 <= 2; c2++) lit.add(darkKey(p[0] + a * 4, p[1] + b * 4, p[2] + c2 * 4));
  };
  for (const l of lights) markLit(l);

  // Light pockets: about every lightSpacing metres of floor, the biome's light near the roof by a wall.
  for (const i of order) {
    const p = cellOf(i);
    const [x, y, z] = p;
    if (!spaced('light', p, STRATA_GEN.lightSpacing) || !spaced('lightAny', p, 12)) continue;
    if (lit.has(darkKey(x, y, z)) && rng.chance(0.7)) continue;
    if (solidN(x, y, z) === 0) continue;
    const biome = biomeAtCell(x, z);
    const lb = BIOMES[biome].lightBlock;
    // Mine and amber biomes hang lanterns; the others glow from the rock.
    if ((biome === 'haldenMines' || biome === 'amberHollows') && free(x, y, z) && rng.chance(0.6)) {
      claim(x, y, z);
      addProp({ kind: 'lanternPost', x: x + 0.5, y, z: z + 0.5 }, B.LIGHT_LAMP);
    } else {
      let ly = y + 2;
      while (ly < y + 6 && get(x, ly + 1, z) === B.AIR) ly++;
      if (get(x, ly, z) !== B.AIR) continue;
      set(x, ly, z, lb);
      lights.push([x, ly, z]);
    }
    mark('light', p, STRATA_GEN.lightSpacing);
    mark('lightAny', p, 12);
    markLit(p);
    stats[biome].lights++;
  }
  for (const l of decor.lights) stats[biomeAtCell(l[0], l[2])].lights++;

  // Chests: about one per chestSpacing m of walked floor, against a wall, never in a lair or the camp.
  const lootFor = (tier: number, kind: ChestSite['kind']): PropSpec['loot'] => {
    const m = kind === 'vault' || kind === 'lair' ? 2 : 1;
    const l: NonNullable<PropSpec['loot']> = { stone: rng.int(1, 3), copperOre: rng.int(1, 2) * m };
    if (tier >= 1) l.rootFibre = rng.int(1, 2);
    if (tier >= 2) l.ironOre = rng.int(1, 2) * m;
    if (tier >= 3) l.glimmerShard = rng.int(0, 2) * m;
    if (tier >= 4) l.echoShard = rng.int(1, 2) * m;
    return l;
  };
  const addChest = (p: V3, kind: ChestSite['kind'], tier: number): void => {
    const biome = biomeAtCell(p[0], p[2]);
    const id = `s${stratum}_chest_${chests.length}`;
    addProp({ kind: 'chest', x: p[0] + 0.5, y: p[1], z: p[2] + 0.5, scale: 0.85, interact: 'feature', feature: { kind: 'cache', id }, loot: lootFor(tier, kind), id });
    chests.push({ id, biome, p: [p[0] + 0.5, p[1], p[2] + 0.5], prop: id, kind, tier });
    stats[biome].chests++;
  };
  for (const i of order) {
    const p = cellOf(i);
    const [x, y, z] = p;
    if (!spaced('chest', p, STRATA_GEN.chestSpacing * 0.78)) continue;
    if (nearArrival(p, 14) || inLair(p) || !free(x, y, z) || solidN(x, y, z) < 1) continue;
    claim(x, y, z);
    addChest(p, 'tunnel', stratum);
    mark('chest', p, STRATA_GEN.chestSpacing * 0.78);
  }

  // Treasure vaults behind cracked walls: a sealed room behind a tunnel wall, its chest one tier up.
  let vaults = 0;
  for (let bi = 0; bi < 2; bi++) {
    let made = 0;
    for (const i of order) {
      if (made >= 2) break;
      const p = cellOf(i);
      const [x, y, z] = p;
      if (biomeAtCell(x, z) !== plan.biomes[bi] || nearArrival(p, 20) || inLair(p) || !spaced('vault', p, 40)) continue;
      // A wall direction with 7 m of rock behind it.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isHost(get(x + dx, y, z + dz)) || !isHost(get(x + dx, y + 1, z + dz))) continue;
        let rock = true;
        for (let k = 1; k <= 8 && rock; k++) for (let s = -3; s <= 3 && rock; s++) for (let h = -1; h <= 4 && rock; h++) {
          const cx = x + dx * k + (dz ? s : 0);
          const cz = z + dz * k + (dx ? s : 0);
          if (!isHost(get(cx, y + h, cz))) rock = false;
        }
        if (!rock) continue;
        // Carve the room (k 2..6), the door (k 1) as cracked wall.
        for (let k = 2; k <= 6; k++) for (let s = -2; s <= 2; s++) for (let h = 0; h <= 2; h++) set(x + dx * k + (dz ? s : 0), y + h, z + dz * k + (dx ? s : 0), B.AIR);
        set(x + dx, y, z + dz, B.CRACKED_WALL);
        set(x + dx, y + 1, z + dz, B.CRACKED_WALL);
        const cp: V3 = [x + dx * 5, y, z + dz * 5];
        addChest(cp, 'vault', Math.min(6, stratum + 1));
        const lx = x + dx * 4 + (dz ? 2 : 0);
        const lz = z + dz * 4 + (dx ? 2 : 0);
        set(lx, y + 2, lz, BIOMES[plan.biomes[bi]].lightBlock);
        lights.push([lx, y + 2, lz]);
        sites.push({ id: `vault_${vaults}`, kind: 'vault', biome: plan.biomes[bi], centre: [x + dx * 4 + 0.5, y, z + dz * 4 + 0.5], radius: 3 });
        mark('vault', p, 40);
        vaults++;
        made++;
        break;
      }
    }
  }
  // Each lair keeps a reward chest at its back wall.
  for (const l of lairs) {
    const back: V3 = [l.centre[0] + (l.centre[0] - l.entrance[0]) * 0.7, l.centre[1], l.centre[2] + (l.centre[2] - l.entrance[2]) * 0.7];
    const p = reachNear(seen, w, back, 3, 2);
    if (p) addChest([Math.floor(p[0]), p[1], Math.floor(p[2])], 'lair', Math.min(6, stratum + 1));
  }

  // Halden's journal pages: STRATA_PAGES_PER_BIOME per biome, in chambers of the biome, the first tells of the lair.
  let pageN = (stratum - 1) * STRATA_PAGES_PER_BIOME * 2;
  for (let bi = 0; bi < 2; bi++) {
    const biome = plan.biomes[bi];
    const homes = plan.nodes.filter((n) => n.biome === biome && (n.kind === 'cavern' || n.kind === 'room') && n.role !== 'nest');
    let made = 0;
    for (let k = 0; k < homes.length * 3 && made < STRATA_PAGES_PER_BIOME; k++) {
      const n = homes[(k * 7 + bi) % homes.length];
      const p = nearWall([Math.floor(n.x) + 0.5, floorAt(n), Math.floor(n.z) + 0.5], Math.min(6, Math.floor(Math.min(n.rx, n.rz))));
      if (!p || !spaced('page', p, 30)) continue;
      mark('page', p, 30);
      pageN++;
      const id = `page_${pageN}`;
      addProp({ kind: 'haldenNote', x: p[0], y: p[1], z: p[2], interact: 'feature', feature: { kind: 'note', id }, id });
      pages.push({ id, n: pageN, biome, p, prop: id, revealsLair: LAIR_PAGES.has(pageN) ? `lair_${biome}` : null });
      made++;
    }
  }

  // Ambient props along the floor: about every findSpacing m something to see (crates and carts in the
  // camps' biomes, crystal clusters in the geode and the frost, satchels and rope coils elsewhere).
  const ambient: Partial<Record<BiomeId, Array<PropSpec['kind']>>> = {
    amberHollows: ['crate', 'barrel', 'ropeCoil', 'satchel'],
    mushroomForest: ['crystalCluster', 'satchel'],
    rootGalleries: ['crate', 'ropeCoil'],
    floodedGrottoes: ['crystalCluster', 'barrel'],
    crystalGeode: ['crystalCluster', 'crystalCluster'],
    haldenMines: ['crate', 'barrel', 'brokenCart', 'ropeCoil', 'pickaxeRack'],
    frostCaverns: ['crystalCluster'],
    glowrootJungle: ['crystalCluster', 'satchel'],
    sulphurBog: ['barrel', 'satchel'],
    sunkenCity: ['crystalCluster', 'crate'],
    magmaVeins: ['crystalCluster'],
    obsidianAbyss: ['crystalCluster'],
  };
  for (const i of order) {
    const p = cellOf(i);
    const [x, y, z] = p;
    if (!spaced('prop', p, STRATA_GEN.findSpacing)) continue;
    if (nearArrival(p, 10) || inLair(p) || !free(x, y, z) || solidN(x, y, z) === 0) continue;
    const biome = biomeAtCell(x, z);
    const kinds = ambient[biome] ?? ['crate'];
    const kind = kinds[rng.int(0, kinds.length - 1)];
    claim(x, y, z);
    if (kind === 'crystalCluster') {
      const deep = stratum >= 3;
      addProp({ kind, x: x + 0.5, y, z: z + 0.5, scale: rng.range(0.7, 1.15), minable: { hardness: 2.5, tier: 1, drop: deep && rng.chance(0.4) ? 'echoShard' : 'glimmerShard', min: 1, max: 2 } });
    } else addProp({ kind, x: x + 0.5, y, z: z + 0.5, scale: rng.range(0.8, 1) });
    mark('prop', p, STRATA_GEN.findSpacing);
    stats[biome].props++;
  }

  // Ambient dressing: the biome's own props (BIOMES[b].props) about every 5 m of floor, standing by the
  // walls or hanging from the roof; they carry no use, so VIS batches them (no draw-call cost).
  const skipDecor = new Set(['chest', 'runeStone', 'abyssMonolith', 'crate', 'barrel', 'lanternPost', 'hangingLantern', 'crystalCluster', 'brokenCart', 'pickaxeRack']);
  for (const i of order) {
    const p = cellOf(i);
    const [x, y, z] = p;
    if (!spaced('decor', p, 4.5)) continue;
    if (nearArrival(p, 8) || inLair(p) || st.corridor[x + z * sx]) continue;
    const biome = biomeAtCell(x, z);
    const kinds = BIOMES[biome].props.filter((k) => !skipDecor.has(k));
    if (!kinds.length) continue;
    const kind = kinds[rng.int(0, kinds.length - 1)] as PropKind;
    if (HANGING_PROPS.has(kind)) {
      let roof = 0;
      for (let k = 2; k < 14; k++) if (SOLID[get(x, y + k, z)]) {
        roof = y + k;
        break;
      }
      if (!roof || !isHost(get(x, roof, z))) continue;
      addProp({ kind, x: x + 0.5, y: roof, z: z + 0.5, anchor: [x, roof, z], scale: rng.range(0.8, 1.2) });
    } else {
      if (!free(x, y, z) || solidN(x, y, z) === 0) continue;
      claim(x, y, z);
      addProp({ kind, x: x + 0.5, y, z: z + 0.5, scale: rng.range(0.75, 1.25) });
    }
    mark('decor', p, 4.5);
    stats[biome].props++;
  }

  // The lairs' dressing: pillars and braziers round the arena's rim (VIS models them).
  for (const l of lairs) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      const p = reachNear(seen, w, [l.centre[0] + Math.cos(a) * (l.radius - 1.5), l.centre[1], l.centre[2] + Math.sin(a) * (l.radius - 1.5)], 2, 2);
      if (!p) continue;
      const cx = Math.floor(p[0]);
      const cz = Math.floor(p[2]);
      if (!free(cx, p[1], cz)) continue;
      claim(cx, p[1], cz);
      addProp({ kind: k % 2 ? 'lairBrazier' : 'lairPillar', x: p[0], y: p[1], z: p[2], rotY: a }, k % 2 ? BIOMES[l.biome].lightBlock : undefined);
    }
  }

  // Ore veins: in the walls beside the walkable floor, the biome's ores by weight (rarer deeper).
  let oreBlocks = 0;
  const veinsPerCell = (STRATA_GEN.veinsPer1000 * (1 + STRATA_GEN.veinDepthGain * (stratum - 1))) / 1000;
  const rarRank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const orePick = (biome: BiomeId) => {
    const ores = BIOMES[biome].ores;
    let total = 0;
    const ws = ores.map((o) => {
      const v = o.weight * (1 + 0.12 * (stratum - 1) * rarRank[o.rarity]);
      total += v;
      return v;
    });
    let r = rng.next() * total;
    for (let k = 0; k < ores.length; k++) if ((r -= ws[k]) <= 0) return ores[k].block;
    return ores[ores.length - 1].block;
  };
  const oreRoomNear = (x: number, z: number) => sites.some((s) => s.kind === 'oreRoom' && Math.hypot(s.centre[0] - x, s.centre[2] - z) < s.radius + 2);
  for (let bi = 0; bi < 2; bi++) {
    const biome = plan.biomes[bi];
    if (!BIOMES[biome].ores.length) continue;
    const want = Math.round(stats[biome].floorCells * veinsPerCell);
    let made = 0;
    for (let tries = 0; tries < want * 30 && made < want; tries++) {
      const i = cells[rng.int(0, cells.length - 1)];
      const [x, y, z] = cellOf(i);
      if (biomeAtCell(x, z) !== biome) continue;
      if (nearArrival([x, y, z], 8)) continue;
      // March from the floor cell toward a wall at 0..2 m up.
      const dir = rng.int(0, 3);
      const dx = dir === 0 ? 1 : dir === 1 ? -1 : 0;
      const dz = dir === 2 ? 1 : dir === 3 ? -1 : 0;
      const h = rng.int(0, 2);
      let hx = -1;
      let hz = -1;
      for (let k = 1; k <= 6; k++) {
        const cx = x + dx * k;
        const cz = z + dz * k;
        const id = get(cx, y + h, cz);
        if (SOLID[id]) {
          if (isHost(id)) {
            hx = cx;
            hz = cz;
          }
          break;
        }
      }
      if (hx < 0) continue;
      const ore = orePick(biome);
      const size = oreRoomNear(x, z) ? rng.int(6, 12) : rng.int(3, 8);
      const n = growVein(hx, y + h, hz, ore, size);
      if (n) {
        made++;
        oreBlocks += n;
        stats[biome].oreVeins++;
        stats[biome].oreBlocks += n;
      }
    }
  }
  function growVein(x: number, y: number, z: number, ore: number, size: number): number {
    const q: V3[] = [[x, y, z]];
    let n = 0;
    while (q.length && n < size) {
      const [cx, cy, cz] = q.splice(rng.int(0, q.length - 1), 1)[0];
      if (!isHost(get(cx, cy, cz))) continue;
      set(cx, cy, cz, ore);
      n++;
      for (const [ddx, ddy, ddz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (rng.chance(0.7)) q.push([cx + ddx, cy + ddy, cz + ddz]);
    }
    return n;
  }

  // Spawn points: every ~14 m of floor, out of the camp and the lairs.
  for (const i of order) {
    const p = cellOf(i);
    const [x, y, z] = p;
    if (!spaced('spawn', p, 14) || nearArrival(p, 24) || inLair(p)) continue;
    let roof = 0;
    for (let k = 2; k < 12; k++) if (SOLID[get(x, y + k, z)]) {
      roof = k;
      break;
    }
    const open = roof === 0 || roof > 8;
    spawnPoints.push({ p: [x + 0.5, y, z + 0.5], biome: biomeAtCell(x, z), dark: !lit.has(darkKey(x, y, z)), open, ceiling: roof > 0 && roof <= 4 });
    mark('spawn', p, 14);
  }

  // Hazard pockets: the decor's lava and gas pools, cold in the frost's caverns, the dark in the sunken halls.
  const hazards: HazardZone[] = decor.pools.map((pl, k) => ({ id: `hz_${k}`, kind: pl.kind, biome: biomeAtCell(Math.floor(pl.x), Math.floor(pl.z)), centre: [pl.x, pl.y, pl.z], radius: pl.r + (pl.kind === 'gas' ? 3 : 1), strength: pl.kind === 'gas' ? 0.8 : 1 }));
  for (const n of plan.nodes) {
    const hk = BIOMES[n.biome].hazard.kind;
    if (n.kind !== 'cavern') continue;
    if (hk === 'cold' || hk === 'dark' || hk === 'void') hazards.push({ id: `hz_${hazards.length}`, kind: hk, biome: n.biome, centre: [n.x, n.y, n.z], radius: Math.max(n.rx, n.rz), strength: BIOMES[n.biome].hazard.strength });
  }

  for (const b of plan.biomes) {
    const s = stats[b];
    // Walked metres ~ floor cells / tunnel width (~3 standable cells across a passage).
    s.chestsPer25m = s.floorCells ? s.chests / (s.floorCells / 3 / STRATA_GEN.chestSpacing) : 0;
  }

  return { props, lairs, gate, arrival, camp, campSite, outpostSites, pages, chests, nests, spawnPoints, hazards, sites, landmarks, heart, stats, oreBlocks };
}
