import { B, SOLID } from '../../../config/blocks';
import { BIOMES, PAGE_PLAN, type BiomeId, type StratumIndex } from '../../../config/biomes';
import { STRATA_GEN } from '../../../config/balance';
import { lootFor, type ChestKind } from '../../../config/loot';
import { Rng } from '../../../core/rng';
import { hash32 } from '../../../core/math';
import { ROSTERS } from '../../../game/mobs/rosters';
import type { MobKind } from '../../../game/mobs/types';
import { HANGING_PROPS, type PropKind, type PropSpec, type Region } from '../types';
import type { CarveState } from './carve';
import { floorNear, isHost, type Decor } from './dress';
import { edgePath, type PlanNode } from './plan';
import type { BiomeStats, CampSite, ChestSite, DungeonSite, GateSite, HazardZone, LairSite, NestSite, OutpostSite, PageSite, SecretSite, SpawnPoint, StructureSite, V3 } from './types';
import type { DungeonOut, RavineOut, Reserved, RiverSite, SetPieceOut, VistaOut } from './structures';
import type { LakeDef } from '../features/types';

/** The great structures' results the content pass dresses (structures.ts). */
export interface ContentExtras {
  /** Curated columns: the density pass places nothing there (no chest, vein, vault or clutter). */
  reserved: Reserved;
  vista: VistaOut | null;
  river: RiverSite | null;
  works: DungeonOut | null;
  ravines: RavineOut[];
  pieces: Array<SetPieceOut & { node: number }>;
  /** The side galleries' end pockets (the forks' dead ends): most hold a chest. */
  pockets: Array<[number, number, number]>;
  /** Still water the structures made (the vista's lake, the river's pools, the set pieces'): for the chill. */
  lakes?: LakeDef[];
}

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
  const blocks = w.blocks;
  // The open cells read as air during the walk (put back after it: no copy of the world).
  const saved = open && open.size ? [...open].map((i) => [i, blocks[i]] as const) : [];
  for (const [i] of saved) blocks[i] = B.AIR;
  try {
    return walkFrom(blocks, sx, sy, sz, from, maxDrop);
  } finally {
    for (const [i, id] of saved) blocks[i] = id;
  }
}

function walkFrom(blocks: Uint8Array, sx: number, sy: number, sz: number, from: V3, maxDrop: number): Uint8Array {
  const seen = new Uint8Array(sx * sy * sz);
  // A ring queue: the live frontier stays far below the walkable cells' count.
  const q = new Int32Array(Math.min(sx * sy * sz, 1 << 21));
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

/**
 * The last word on props (after every voxel pass): a prop whose anchor is not solid rock would fall or
 * break the moment the session loads (a spurious world edit in the first save), so it is dropped with
 * its light; a prop standing inside rock is dropped too. Returns how many were dropped.
 */
export function validateProps(w: { sx: number; sy: number; sz: number; blocks: Uint8Array }, props: PropSpec[]): number {
  const { sx, sy, sz } = w;
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? B.BEDROCK : w.blocks[x + sx * (y + sy * z)]);
  let dropped = 0;
  for (let k = props.length - 1; k >= 0; k--) {
    const p = props[k];
    const a = p.anchor;
    // A hanging prop's body is the cell under its anchor; a standing one's the cell its feet are in.
    const hangs = !!a && a[1] >= Math.floor(p.y);
    const body = at(Math.floor(p.x), Math.floor(p.y - (hangs ? 0.05 : 0)), Math.floor(p.z));
    const ok = (!a || SOLID[at(a[0], a[1], a[2])] === 1) && SOLID[body] !== 1;
    if (ok) continue;
    for (const [x, y, z] of p.emitters) if (!SOLID[at(x, y, z)]) w.blocks[x + sx * (y + sy * z)] = B.AIR;
    props.splice(k, 1);
    dropped++;
  }
  return dropped;
}

/**
 * After the traps' fills (traps.ts): a chest, a page or a crystal cluster whose cell was filled flush
 * rises onto the new floor of its column (up to 4 cells), its light with it, and the stratum's lists
 * follow (chests, pages). Returns how many props rose. Anything still buried is validateProps' to drop.
 */
export function liftBuried(w: { sx: number; sy: number; sz: number; blocks: Uint8Array }, c: { props: PropSpec[]; chests: ChestSite[]; pages: PageSite[] }): number {
  const { sx, sy, sz } = w;
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? B.BEDROCK : w.blocks[x + sx * (y + sy * z)]);
  let lifted = 0;
  for (const p of c.props) {
    const x = Math.floor(p.x);
    const z = Math.floor(p.z);
    const y = Math.floor(p.y);
    const hangs = !!p.anchor && p.anchor[1] >= y;
    // (Only what the explorer uses or takes; buried dressing is validateProps' to drop: raised onto a
    // step it would stand half on air.)
    if (!p.interact && !p.feature && !p.minable) continue;
    if (hangs || !SOLID[at(x, y, z)]) continue;
    let up = 0;
    for (let k = 1; k <= 4 && !up; k++) if (!SOLID[at(x, y + k, z)] && !SOLID[at(x, y + k + 1, z)] && SOLID[at(x, y + k - 1, z)]) up = k;
    if (!up) continue;
    p.y += up;
    if (p.anchor) p.anchor = [p.anchor[0], p.anchor[1] + up, p.anchor[2]];
    p.emitters = p.emitters.map(([ex, ey, ez]) => {
      const id = at(ex, ey, ez);
      if (!SOLID[id] && !SOLID[at(ex, ey + up, ez)]) {
        w.blocks[ex + sx * (ey + up + sy * ez)] = id;
        w.blocks[ex + sx * (ey + sy * ez)] = B.AIR;
      }
      return [ex, ey + up, ez] as [number, number, number];
    });
    for (const ch of c.chests) if (ch.prop === p.id) ch.p = [ch.p[0], ch.p[1] + up, ch.p[2]];
    for (const pg of c.pages) if (pg.prop === p.id) pg.p = [pg.p[0], pg.p[1] + up, pg.p[2]];
    lifted++;
  }
  return lifted;
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
  dungeon: DungeonSite | null;
  secrets: SecretSite[];
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

/**
 * The swarmer a nest breeds: one of its biome's nest kinds in MOBS' roster (ROSTERS[b].monsters with
 * `nest`), picked by weight from `h` (a hash: no draw from the content stream). Null when none.
 */
export function nestKind(biome: BiomeId, h: number): MobKind | null {
  const entries = ROSTERS[biome]?.monsters.filter((e) => e.nest) ?? [];
  const total = entries.reduce((a, e) => a + e.weight, 0);
  if (!entries.length || total <= 0) return null;
  let r = ((h >>> 0) / 4294967296) * total;
  for (const e of entries) if ((r -= e.weight) < 0) return e.kind;
  return entries[entries.length - 1].kind;
}

/** Everything placed on the walkable floor (after the walk BFS). */
/**
 * The base radius (m, at scale 1) of VIS's prop models that reach past their own cell (measured from
 * the models: `node tools/run-ts.mjs tools/strata-prop-footprints.ts`); the rest stand inside it.
 */
export const FOOT: Partial<Record<string, number>> = {
  basaltColumn: 0.81, bones: 0.7, brokenCart: 0.94, brokenColumn: 1.08, charredBones: 0.81, chest: 0.56, crate: 0.57,
  driftwood: 0.53, frozenBones: 0.69, geodeShards: 0.47, lavaGlow: 0.65, mushroomCluster: 0.55, ropeCoil: 0.76,
  rootKnot: 0.58, satchel: 0.56, shells: 0.54, statue: 0.57, timberProp: 0.58, waterfall: 0.75,
};
/** Kinds placed by rules of their own (along a wall, across a drift, round an arena, the camp's layout). */
export const OWN_RULES: ReadonlySet<string> = new Set(['rail', 'mineSet', 'lairPillar', 'lairBrazier', 'abyssMonolith', 'campfire', 'workbench', 'bedroll', 'hoistWinch']);

export function placeContent(st: CarveState, stratum: StratumIndex, seed: number, seen: Uint8Array, decor: Decor, places: ReturnType<typeof buildPlaces>, extras: ContentExtras): ContentOut {
  const w = st.world;
  const plan = st.plan;
  const { sx, sy, sz } = w;
  const rng = new Rng(seed ^ 0xc0e7e47);
  /** A curated column (the vista's balcony and ramp, the river, the works, ravines, set pieces). */
  const curated = (x: number, z: number) => x >= 0 && z >= 0 && x < sx && z < sz && extras.reserved[x + z * sx] === 1;
  /** Loot from LOOP's tables (config/loot: every chest kind of the strata has its own), deterministic for this stratum's stream. */
  const lootOf = (kind: ChestKind, tier: number, biome: BiomeId): PropSpec['loot'] => lootFor(kind, Math.min(6, tier), rng, biome);
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
    // Decor that stands on the floor: a smaller one where the whole will not stand, none where no size does.
    if (!p.interact && !p.minable && !p.feature && !p.anchor && !HANGING_PROPS.has(p.kind) && !OWN_RULES.has(p.kind)) {
      let s2 = spec.scale;
      while (s2 >= 0.6 && !footing(p.kind, s2, spec.x, Math.round(spec.y), spec.z)) s2 *= 0.85;
      if (s2 < 0.6) return spec;
      spec.scale = s2;
    }
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

  /** A lantern hung from the real roof over (x, z) (natural rock or timber within `reach` of the floor y0). */
  const hangLamp = (x: number, y0: number, z: number, light: number, reach = 9): boolean => {
    const lx = Math.floor(x);
    const lz = Math.floor(z);
    for (let k = 3; k <= reach; k++) {
      const id = get(lx, y0 + k, lz);
      if (!SOLID[id]) continue;
      if (!isHost(id) && id !== B.PLANK && id !== B.BEAM) return false;
      const roof = y0 + k;
      if (get(lx, roof - 2, lz) !== B.AIR || get(lx, roof - 1, lz) !== B.AIR) return false;
      addProp({ kind: 'hangingLantern', x: lx + 0.5, y: roof - 1.8, z: lz + 0.5, anchor: [lx, roof, lz] }, light);
      return true;
    }
    return false;
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
  /** No drop beside the cell (each side is rock at the feet or has rock under it): a prop wider than its cell never overhangs a ledge. */
  const steady = (x: number, y: number, z: number) =>
    (SOLID[get(x + 1, y, z)] || SOLID[get(x + 1, y - 1, z)]) && (SOLID[get(x - 1, y, z)] || SOLID[get(x - 1, y - 1, z)]) && (SOLID[get(x, y, z + 1)] || SOLID[get(x, y - 1, z + 1)]) && (SOLID[get(x, y, z - 1)] || SOLID[get(x, y - 1, z - 1)]);
  /**
   * A prop whose model reaches past its cell (FOOT x scale over 0.72 m) stands on rock all under it:
   * three quarters of its base disc over rock, at most a seventh of it in rock (a column lying by a
   * wall), so nothing floats over a drop or a lake's edge, or sinks into a wall (VIS's props probe).
   */
  const footing = (kind: string, scale: number, px: number, y: number, pz: number): boolean => {
    const R = (FOOT[kind] ?? 0.5) * scale;
    if (R <= 0.72) return true;
    let n = 0;
    let held = 0;
    let inRock = 0;
    for (let dz = -R; dz <= R + 1e-6; dz += 0.5) for (let dx = -R; dx <= R + 1e-6; dx += 0.5) {
      if (dx * dx + dz * dz > R * R) continue;
      const cx = Math.floor(px + dx);
      const cz = Math.floor(pz + dz);
      n++;
      if (SOLID[get(cx, y, cz)]) inRock++;
      else if (SOLID[get(cx, y - 1, cz)]) held++;
    }
    return held >= n * 0.75 && inRock <= n * 0.15;
  };
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
    const d2 = d * d;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const list = g.get(gx + a + (gz + b) * 1000);
        if (!list) continue;
        for (const q of list) {
          const ex = q[0] - p[0];
          const ey = (q[1] - p[1]) * 2;
          const ez = q[2] - p[2];
          if (ex * ex + ey * ey + ez * ez < d2) return false;
        }
      }
    return true;
  };
  const mark = (cat: string, p: V3, d: number) => {
    let g = grids.get(cat);
    if (!g) grids.set(cat, (g = new Map()));
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
    // Two lamps hang over the camp from its roof (where the roof is in reach).
    hangLamp(ax - 2, ay, az + 1, B.LIGHT_AMBER);
    hangLamp(ax + 2.5, ay, az - 1, B.LIGHT_AMBER);
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
    hangLamp(ax, ay, az + 3, B.LIGHT_AMBER);
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
  // Its monolith (VIS's abyssMonolith: at scale s a square base 15 s across and 2.5 s high, a stone up
  // to 25 s tall within 5.7 s of its axis): on the floor nearest its spot where the base stands on rock
  // and none of it is in the rock (a little smaller where the hall is tight).
  const monolithFits = (x: number, y: number, z: number, sc: number) => {
    const half = 7.52 * sc;
    let n = 0;
    let held = 0;
    let inRock = 0;
    for (let dz = -half; dz <= half + 1e-6; dz += 0.5) for (let dx = -half; dx <= half + 1e-6; dx += 0.5) {
      n++;
      const cx = Math.floor(x + dx);
      const cz = Math.floor(z + dz);
      if (SOLID[get(cx, y, cz)]) inRock++;
      else if (SOLID[get(cx, y - 1, cz)]) held++;
    }
    let up = 0;
    let upRock = 0;
    const r = 5.7 * sc;
    for (let yy = y + 1; yy < y + Math.ceil(25.2 * sc); yy++) for (let dz = -r; dz <= r + 1e-6; dz += 0.75) for (let dx = -r; dx <= r + 1e-6; dx += 0.75) {
      if (dx * dx + dz * dz > r * r) continue;
      up++;
      if (SOLID[get(Math.floor(x + dx), yy, Math.floor(z + dz))]) upRock++;
    }
    return held >= n * 0.8 && inRock <= n * 0.08 && upRock <= up * 0.05;
  };
  const mono: V3 = [places.gateStand[0], places.gateStand[1], places.gateStand[2] + (plan.heart === null ? 1.5 : 0)];
  let monoAt: V3 = mono;
  let monoScale = 0.25;
  // (Its stand stays within reach of its plinth: WorldFeatures uses a gate from the plinth's edge, 2.4 m.)
  const reachable = (x: number, z: number, sc: number) => Math.hypot(Math.max(0, Math.abs(places.gateStand[0] - x) - 7.52 * sc), Math.max(0, Math.abs(places.gateStand[2] - z) - 7.52 * sc)) <= 1.6;
  search: for (const sc of [0.35, 0.3, 0.25, 0.2]) for (let r = 0; r <= 4; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r || !reachable(mono[0] + dx, mono[2] + dz, sc)) continue;
    for (const dy of [0, 1, -1]) if (monolithFits(mono[0] + dx, mono[1] + dy, mono[2] + dz, sc)) {
      monoAt = [mono[0] + dx, mono[1] + dy, mono[2] + dz];
      monoScale = sc;
      break search;
    }
  }
  addProp({ kind: 'abyssMonolith', x: monoAt[0], y: monoAt[1], z: monoAt[2], rotY: 0, scale: monoScale, interact: 'feature', feature: { kind: 'gate', id: `gate_${stratum}` }, id: `gate_${stratum}` }, B.LIGHT_RUNE);
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
    // An outpost is a safe rest: never a room with a gas or lava pool in it (while another room is free).
    const pooled = (r: PlanNode) => decor.pools.some((pl) => Math.abs(pl.y - r.y) < 10 && Math.hypot(pl.x - r.x, pl.z - r.z) < pl.r + (pl.kind === 'gas' ? 3 : 1) + Math.max(r.rx, r.rz) + 3);
    const take = (role: string): PlanNode | null => {
      let free = rooms.filter((r) => r.role === null);
      if (role === 'outpost' && free.some((r) => !pooled(r))) free = free.filter((r) => !pooled(r));
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
    void caverns;
  }
  const floorAt = (n: { x: number; y: number; z: number }) => {
    const f = floorNear(st, Math.floor(n.x), n.y, Math.floor(n.z), 4);
    return f < 0 ? n.y : f;
  };
  for (const n of plan.nodes) {
    if (!n.role) continue;
    const c: V3 = [Math.floor(n.x) + 0.5, floorAt(n), Math.floor(n.z) + 0.5];
    // A set piece may stand on its centre (a giant cap, a world root): it is announced from its ring.
    if (!n.role.startsWith('set:') && !reachNear(seen, w, c, 2, 2)) continue;
    const lb = BIOMES[n.biome].lightBlock;
    if (n.role === 'nest') {
      nests.push({ id: `nest_${n.id}`, biome: n.biome, p: c, radius: Math.max(4, Math.min(n.rx, n.rz)), kind: nestKind(n.biome, hash32(seed ^ Math.imul(n.id + 1, 0x2c1b3c6d))) });
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
      // The camp's lamp hangs from the real roof over its centre (a post when the roof is out of reach).
      const lx = Math.floor(c[0]);
      const lz = Math.floor(c[2]);
      if (hangLamp(lx, c[1], lz, B.LIGHT_LAMP)) {
        // Hung.
      } else if (free(lx, c[1], lz)) {
        claim(lx, c[1], lz);
        addProp({ kind: 'lanternPost', x: lx + 0.5, y: c[1], z: lz + 0.5 }, B.LIGHT_LAMP);
      }
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
        if (st.corridor[x + z * sx] || curated(x, z)) continue;
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
      sites.push({ id: `set_${name}_${n.id}`, kind: 'setPiece', biome: n.biome, centre: [n.x, n.y, n.z], radius: Math.max(7, Math.min(n.rx, n.rz) * 0.85), name });
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
        if (!seen[x + sx * (y + sy * z)] || !free(x, y, z) || solidN(x, y, z) === 0 || !steady(x, y, z)) continue;
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
    if (curated(x, z)) continue;
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
  const addChest = (p: V3, kind: ChestSite['kind'], tier: number): string => {
    const biome = biomeAtCell(Math.floor(p[0]), Math.floor(p[2]));
    const id = `s${stratum}_chest_${chests.length}`;
    claim(Math.floor(p[0]), p[1], Math.floor(p[2]));
    addProp({ kind: 'chest', x: Math.floor(p[0]) + 0.5, y: p[1], z: Math.floor(p[2]) + 0.5, scale: kind === 'secret' || kind === 'dungeon' ? 1 : 0.85, interact: 'feature', feature: { kind: 'cache', id }, loot: lootOf(kind, tier, biome), id });
    chests.push({ id, biome, p: [Math.floor(p[0]) + 0.5, p[1], Math.floor(p[2]) + 0.5], prop: id, kind, tier });
    stats[biome].chests++;
    return id;
  };
  // BRIEF §0.1: about one chest per 25 m of walked tunnel. Along every tunnel of the plan one every
  // 21-29 m, by a wall near its walking line; one in each room (its role's kind: a mine camp's, a
  // shrine's, an ore room's) and two in each great cavern; one at the end of most side galleries (the
  // forks' reward). Never in a lair, the camp or a curated place.
  const tunnelM: Record<string, number> = {};
  const tunnelChests: Record<string, number> = {};
  const chestSpot = (c: readonly number[], r: number): V3 | null => {
    for (let t = 0; t < 28; t++) {
      const x = Math.floor(c[0]) + rng.int(-r, r);
      const z = Math.floor(c[2]) + rng.int(-r, r);
      for (let dy = 0; dy <= 6; dy++) {
        const y = Math.round(c[1]) + (dy & 1 ? -(dy + 1) / 2 : dy / 2);
        if (y < 1 || y >= sy - 2 || x < 1 || z < 1 || x >= sx - 1 || z >= sz - 1) continue;
        if (!seen[x + sx * (y + sy * z)] || curated(x, z) || !free(x, y, z) || solidN(x, y, z) < 1) continue;
        if (nearArrival([x, y, z], 14) || inLair([x, y, z]) || !spaced('chest', [x, y, z], 9)) continue;
        return [x, y, z];
      }
    }
    return null;
  };
  for (const e of plan.edges) {
    const path = edgePath(plan, e, 1);
    for (const q of path) {
      const b = biomeAtCell(Math.max(0, Math.min(sx - 1, Math.floor(q[0]))), Math.max(0, Math.min(sz - 1, Math.floor(q[2]))));
      tunnelM[b] = (tunnelM[b] ?? 0) + 1;
    }
    for (let k = rng.int(5, 15); k < path.length - 5; k += rng.int(21, 29)) {
      const q = chestSpot(path[k], 3);
      if (!q) continue;
      mark('chest', q, 9);
      addChest(q, 'tunnel', stratum);
      const b = biomeAtCell(q[0], q[2]);
      tunnelChests[b] = (tunnelChests[b] ?? 0) + 1;
    }
  }
  const roleKind: Record<string, ChestSite['kind']> = { mineCamp: 'camp', shrine: 'shrine', oreRoom: 'oreRoom' };
  for (const n of plan.nodes) {
    if ((n.kind !== 'room' && n.kind !== 'cavern') || n.role === 'nest' || n.role?.startsWith('set:')) continue;
    const want = n.kind === 'cavern' ? 2 : 1;
    for (let k = 0; k < want; k++) {
      const q = chestSpot([n.x, floorAt(n), n.z], Math.max(2, Math.floor(Math.min(n.rx, n.rz)) - 1));
      if (!q) continue;
      mark('chest', q, 9);
      const kind = (n.role && roleKind[n.role]) || 'tunnel';
      addChest(q, kind, kind === 'tunnel' ? stratum : stratum + (kind === 'oreRoom' ? 0 : 1));
    }
  }
  for (const pk of extras.pockets) {
    if (!rng.chance(0.7)) continue;
    const q = chestSpot(pk, 2);
    if (!q) continue;
    mark('chest', q, 9);
    addChest(q, 'tunnel', stratum);
  }

  // Treasure vaults behind cracked walls: a sealed room behind a tunnel wall, its chest one tier up;
  // each biome's first is a secret room (deeper, behind two cracked walls, rare loot two tiers up and
  // a gem cluster; sonar shows it, the map marks it once opened).
  const secrets: SecretSite[] = [];
  let vaults = 0;
  for (let bi = 0; bi < 2; bi++) {
    let made = 0;
    for (const i of order) {
      if (made >= 3) break;
      const p = cellOf(i);
      const [x, y, z] = p;
      if (biomeAtCell(x, z) !== plan.biomes[bi] || curated(x, z) || nearArrival(p, 20) || inLair(p) || !spaced('vault', p, 36)) continue;
      const secret = made === 0;
      const depth = secret ? 11 : 8;
      // A wall direction with `depth` m of untouched rock behind it.
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!isHost(get(x + dx, y, z + dz)) || !isHost(get(x + dx, y + 1, z + dz))) continue;
        let rock = true;
        for (let k = 1; k <= depth && rock; k++) for (let s = -3; s <= 3 && rock; s++) for (let h = -1; h <= 4 && rock; h++) {
          const cx = x + dx * k + (dz ? s : 0);
          const cz = z + dz * k + (dx ? s : 0);
          if (!isHost(get(cx, y + h, cz)) || curated(cx, cz)) rock = false;
        }
        if (!rock) continue;
        const k0 = secret ? 3 : 2;
        const k1 = secret ? 9 : 6;
        // Carve the room (k0..k1); the door: one cracked wall (two for a secret, a short crawl between).
        for (let k = k0; k <= k1; k++) for (let s = -2; s <= 2; s++) for (let h = 0; h <= 2; h++) set(x + dx * k + (dz ? s : 0), y + h, z + dz * k + (dx ? s : 0), B.AIR);
        const wall: V3[] = [];
        for (let k = 1; k < k0; k++) for (let h = 0; h <= 1; h++) {
          set(x + dx * k, y + h, z + dz * k, B.CRACKED_WALL);
          wall.push([x + dx * k, y + h, z + dz * k]);
        }
        const mid = Math.floor((k0 + k1) / 2);
        const cp: V3 = [x + dx * (k1 - 1), y, z + dz * (k1 - 1)];
        const lx = x + dx * mid + (dz ? 2 : 0);
        const lz = z + dz * mid + (dx ? 2 : 0);
        set(lx, y + 2, lz, BIOMES[plan.biomes[bi]].lightBlock);
        lights.push([lx, y + 2, lz]);
        const centre: V3 = [x + dx * mid + 0.5, y, z + dz * mid + 0.5];
        if (secret) {
          const chest = addChest(cp, 'secret', stratum + 2);
          // The rare find of the room: a gem cluster (minable crystal) by its wall.
          const gx = x + dx * mid + (dz ? -2 : 0);
          const gz = z + dz * mid + (dx ? -2 : 0);
          addProp({ kind: 'crystalCluster', x: gx + 0.5, y, z: gz + 0.5, scale: 1.2, minable: { hardness: 3, tier: 1, drop: stratum >= 3 ? 'echoShard' : 'glimmerShard', min: 2, max: 3 } });
          secrets.push({ id: `secret_${plan.biomes[bi]}`, biome: plan.biomes[bi], wall, centre, chest });
          sites.push({ id: `secret_${plan.biomes[bi]}`, kind: 'secret', biome: plan.biomes[bi], centre, radius: 3, name: 'secret' });
        } else {
          addChest(cp, 'vault', stratum + 1);
          sites.push({ id: `vault_${vaults}`, kind: 'vault', biome: plan.biomes[bi], centre, radius: 3 });
        }
        for (let k = k0; k <= k1; k++) for (let s = -2; s <= 2; s++) extras.reserved[x + dx * k + (dz ? s : 0) + (z + dz * k + (dx ? s : 0)) * sx] = 1;
        mark('vault', p, 36);
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

  // Halden's journal pages (config/biomes PAGE_PLAN; LOOP's text): each in a chamber of its biome, a
  // page that names a guardian 40-120 m from that lair (it tells where to look), the camp's page by
  // the camp, the first page below the gate by the lift, the last by the Heart's door.
  // (Never in a gas or lava pocket: a page is read, not fought for.)
  const inPool = (q: readonly number[], m: number) => decor.pools.some((pl) => Math.abs(pl.y - q[1]) < 10 && Math.hypot(pl.x - q[0], pl.z - q[2]) < pl.r + (pl.kind === 'gas' ? 3 : 1) + m);
  for (const pg of PAGE_PLAN) {
    if (BIOMES[pg.biome].stratum !== stratum) continue;
    const biome = plan.biomes.includes(pg.biome) ? pg.biome : plan.biomes[0];
    let p: V3 | null = null;
    if (pg.near === 'arrival') {
      for (let t = 0; t < 4 && !p; t++) p = nearWall([ax, ay, az], Math.ceil(Math.max(an.rx, an.rz)) + 4 + t * 2);
    } else if (pg.near === 'gate') {
      for (let t = 0; t < 4 && !p; t++) p = nearWall(places.gateStand, 5 + t * 2);
    }
    if (p && inPool(p, 1)) p = null;
    if (!p) {
      const lair = lairs.find((l) => l.biome === biome);
      const homes = plan.nodes
        .filter((n) => n.biome === biome && (n.kind === 'cavern' || n.kind === 'room') && n.role !== 'nest' && !curated(Math.floor(n.x), Math.floor(n.z)))
        .map((n) => ({ n, d: lair ? Math.hypot(n.x - lair.centre[0], n.z - lair.centre[2]) : 60 }))
        .filter((h) => !pg.lair || (h.d >= 40 && h.d <= 120))
        .sort((p1, p2) => (pg.lair ? Math.abs(p1.d - 70) - Math.abs(p2.d - 70) : rng.next() - 0.5));
      for (const h of homes) {
        const q = nearWall([Math.floor(h.n.x) + 0.5, floorAt(h.n), Math.floor(h.n.z) + 0.5], Math.min(6, Math.floor(Math.min(h.n.rx, h.n.rz))));
        if (q && spaced('page', q, 30) && !inPool(q, 1)) {
          p = q;
          break;
        }
      }
    }
    if (!p) {
      // Any reachable floor of the biome by a wall.
      for (const i of order) {
        const c = cellOf(i);
        if (biomeAtCell(c[0], c[2]) !== biome || curated(c[0], c[2]) || !free(c[0], c[1], c[2]) || solidN(c[0], c[1], c[2]) === 0 || !spaced('page', c, 30) || inPool([c[0] + 0.5, c[1], c[2] + 0.5], 1)) continue;
        claim(c[0], c[1], c[2]);
        p = [c[0] + 0.5, c[1], c[2] + 0.5];
        break;
      }
    }
    if (!p) continue;
    mark('page', p, 30);
    const id = `page_${pg.n}`;
    addProp({ kind: 'haldenNote', x: p[0], y: p[1], z: p[2], interact: 'feature', feature: { kind: 'note', id }, id });
    pages.push({ id, n: pg.n, biome, p, prop: id, revealsLair: pg.lair ? `lair_${pg.biome}` : null });
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
    if (curated(x, z) || nearArrival(p, 10) || inLair(p) || !free(x, y, z) || solidN(x, y, z) === 0 || !steady(x, y, z)) continue;
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
    if (curated(x, z) || nearArrival(p, 8) || inLair(p) || st.corridor[x + z * sx]) continue;
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
    } else if (kind === 'rail') {
      // Two metres of track (along the model's x) run along the wall it lies by, on a metre of open
      // floor at each end (VIS's probe: turned at random, a third of them ran into the rock).
      const wallX = SOLID[get(x + 1, y, z)] || SOLID[get(x - 1, y, z)];
      const wallZ = SOLID[get(x, y, z + 1)] || SOLID[get(x, y, z - 1)];
      if (!free(x, y, z) || wallX === wallZ) continue;
      const [ax, az] = wallX ? [0, 1] : [1, 0];
      const open = (k: number) => free(x + ax * k, y, z + az * k) && SOLID[get(x + ax * k, y - 1, z + az * k)] === 1;
      if (!open(1) || !open(-1)) continue;
      claim(x, y, z);
      addProp({ kind, x: x + 0.5, y, z: z + 0.5, rotY: Math.atan2(-az, ax), scale: rng.range(0.9, 1) });
    } else {
      if (!free(x, y, z) || solidN(x, y, z) === 0 || !steady(x, y, z)) continue;
      claim(x, y, z);
      addProp({ kind, x: x + 0.5, y, z: z + 0.5, scale: rng.range(0.75, 1.25) });
    }
    mark('decor', p, 4.5);
    stats[biome].props++;
  }

  // The Halden Mines' timbered drifts: a mine set (two posts and a cap, VIS's `mineSet`) across the
  // tunnel every 6-9 m where the passage is its width (2.2-3.6 m) and tall enough, turned to it.
  for (const e of plan.edges) {
    if (plan.nodes[e.a].biome !== 'haldenMines' && plan.nodes[e.b].biome !== 'haldenMines') continue;
    const path = edgePath(plan, e, 1);
    for (let k = rng.int(3, 6); k < path.length - 2; k++) {
      const [px, py, pz] = path[k];
      const x0 = Math.floor(px);
      const z0 = Math.floor(pz);
      if (biomeAtCell(Math.max(0, Math.min(sx - 1, x0)), Math.max(0, Math.min(sz - 1, z0))) !== 'haldenMines' || st.chamberOf[x0 + z0 * sx] || curated(x0, z0)) continue;
      const [qx, , qz] = path[k + 1];
      const hl = Math.hypot(qx - px, qz - pz) || 1;
      const dx = (qx - px) / hl;
      const dz = (qz - pz) / hl;
      const y = floorNear(st, x0, Math.round(py), z0, 2);
      if (y < 0 || nearArrival([px, y, pz], 12)) continue;
      // The passage's width across the heading, at the posts' height, and its roof over the cap.
      const reach = (sgn: number) => {
        for (let r = 0.5; r <= 2.4; r += 0.25) {
          const cx = Math.floor(px - dz * r * sgn);
          const cz = Math.floor(pz + dx * r * sgn);
          if (SOLID[get(cx, y + 1, cz)] || SOLID[get(cx, y, cz)]) return r;
        }
        return 9;
      };
      const left = reach(1);
      const right = reach(-1);
      if (left < 1.15 || right < 1.15 || left + right > 3.6) continue;
      const mx = px - dz * ((left - right) / 2);
      const mz = pz + dx * ((left - right) / 2);
      // The floor level right across (rock under every post, nothing of it in a step) and room up to the cap.
      let tall = true;
      for (let r = -1.1; r <= 1.1 && tall; r += 0.55) {
        const cx = Math.floor(mx - dz * r);
        const cz = Math.floor(mz + dx * r);
        if (SOLID[get(cx, y, cz)] || SOLID[get(cx, y + 1, cz)] || SOLID[get(cx, y + 2, cz)] || !SOLID[get(cx, y - 1, cz)]) tall = false;
      }
      if (!tall || !spaced('mineSet', [mx, y, mz], 6)) continue;
      mark('mineSet', [mx, y, mz], 6);
      addProp({ kind: 'mineSet' as PropKind, x: mx, y, z: mz, rotY: Math.atan2(dx, dz), scale: 1 });
      stats.haldenMines.props++;
      k += rng.int(5, 8);
    }
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

  // Ore veins (BRIEF §0.1: at least 3x the old density, rarity rising with depth): small distinct
  // veins in the walls (0-3 m up) and roofs within reach of the walkable floor, never touching another
  // vein (so they read as many finds, and a chain of ore never tunnels through a wall), the biome's ores
  // by weight (the rarer ones weigh more deeper, and come in smaller veins). Ore rooms hold big veins.
  let oreBlocks = 0;
  const veinsPerCell = (STRATA_GEN.veinsPer1000 * (1 + STRATA_GEN.veinDepthGain * (stratum - 1))) / 1000;
  const rarRank: Record<string, number> = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4 };
  const ORE = new Uint8Array(256);
  for (const bb of plan.biomes) for (const o of BIOMES[bb].ores) ORE[o.block] = 1;
  const orePick = (biome: BiomeId) => {
    const ores = BIOMES[biome].ores;
    let total = 0;
    const ws = ores.map((o) => {
      const v = o.weight * (1 + 0.12 * (stratum - 1) * rarRank[o.rarity]);
      total += v;
      return v;
    });
    let r = rng.next() * total;
    for (let k = 0; k < ores.length; k++) if ((r -= ws[k]) <= 0) return ores[k];
    return ores[ores.length - 1];
  };
  const oreRoomNear = (x: number, z: number) => sites.some((s2) => s2.kind === 'oreRoom' && Math.hypot(s2.centre[0] - x, s2.centre[2] - z) < s2.radius + 2);
  const touchesOre = (x: number, y: number, z: number, own: ReadonlySet<number> | null) => {
    for (let ddz = -1; ddz <= 1; ddz++) for (let ddy = -1; ddy <= 1; ddy++) for (let ddx = -1; ddx <= 1; ddx++) {
      if (!ddx && !ddy && !ddz) continue;
      const xx = x + ddx;
      const yy = y + ddy;
      const zz = z + ddz;
      if (ORE[get(xx, yy, zz)] && !(own && own.has(xx + sx * (yy + sy * zz)))) return true;
    }
    return false;
  };
  const DIRS: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
  for (let bi = 0; bi < 2; bi++) {
    const biome = plan.biomes[bi];
    if (!BIOMES[biome].ores.length) continue;
    const want = Math.round(stats[biome].floorCells * veinsPerCell);
    let made = 0;
    for (let tries = 0; tries < want * 24 && made < want; tries++) {
      const i = cells[rng.int(0, cells.length - 1)];
      const [x, y, z] = cellOf(i);
      if (biomeAtCell(x, z) !== biome || curated(x, z)) continue;
      if (nearArrival([x, y, z], 8)) continue;
      // March from the floor cell toward a wall (0..3 m up) or the roof.
      const [dx, dy, dz] = DIRS[rng.int(0, DIRS.length - 1)];
      const h = dy ? 1 : rng.int(0, 3);
      let hit: V3 | null = null;
      for (let k = 1; k <= (dy ? 7 : 6); k++) {
        const cx = x + dx * k;
        const cy = y + h + dy * k;
        const cz = z + dz * k;
        const id = get(cx, cy, cz);
        if (SOLID[id]) {
          if (isHost(id)) hit = [cx, cy, cz];
          break;
        }
      }
      if (!hit || touchesOre(hit[0], hit[1], hit[2], null)) continue;
      const ore = orePick(biome);
      const rank = rarRank[ore.rarity];
      const size = oreRoomNear(x, z) ? rng.int(6, 12) : rank >= 3 ? rng.int(1, 2) : rank === 2 ? rng.int(1, 3) : rng.int(2, 4);
      const n = growVein(hit[0], hit[1], hit[2], ore.block, size, false, true);
      if (n) {
        made++;
        oreBlocks += n;
        stats[biome].oreVeins++;
        stats[biome].oreBlocks += n;
      }
    }
  }
  function growVein(x: number, y: number, z: number, ore: number, size: number, inCurated = false, distinct = false): number {
    const q: V3[] = [[x, y, z]];
    const own = new Set<number>();
    let n = 0;
    while (q.length && n < size) {
      const [cx, cy, cz] = q.splice(rng.int(0, q.length - 1), 1)[0];
      if (!isHost(get(cx, cy, cz)) || (!inCurated && curated(cx, cz))) continue;
      if (distinct && touchesOre(cx, cy, cz, own)) continue;
      set(cx, cy, cz, ore);
      own.add(cx + sx * (cy + sy * cz));
      n++;
      for (const [ddx, ddy, ddz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) if (rng.chance(0.7)) q.push([cx + ddx, cy + ddy, cz + ddz]);
    }
    return n;
  }

  // ---- The great structures' content (curated: the density pass left these places alone).
  /** The reachable feet point nearest p (within 3 m), or null. */
  const onFloor = (p: V3): V3 | null => reachNear(seen, w, p, 3, 2);
  let dungeon: DungeonSite | null = null;
  const V = extras.vista;
  if (V) {
    // Its card shows at the lookout (the balcony's lip on the view line, its parapet open), the hall in
    // view below: 3 m round it (from the balcony's middle, the 1 m parapet hid the lake: QA 01:19).
    sites.push({ id: V.id, kind: 'vista', biome: V.biome, centre: V.lookout, radius: 3, name: V.name });
    landmarks.vista = V.balcony;
    for (const l of V.lights) {
      lights.push(l);
      markLit(l);
    }
    // Two lamp posts at the back of the balcony (the view stays open in front).
    const ux = V.balcony[0] - V.centre[0];
    const uz = V.balcony[2] - V.centre[2];
    const ul = Math.hypot(ux, uz) || 1;
    for (const side of [-1, 1]) {
      const q = onFloor([V.balcony[0] + (ux / ul) * 2.5 - (uz / ul) * side * 3, V.balcony[1], V.balcony[2] + (uz / ul) * 2.5 + (ux / ul) * side * 3]);
      if (q && free(Math.floor(q[0]), q[1], Math.floor(q[2]))) {
        claim(Math.floor(q[0]), q[1], Math.floor(q[2]));
        addProp({ kind: 'lanternPost', x: q[0], y: q[1], z: q[2] }, B.LIGHT_AMBER);
      }
    }
    // Lamp posts down the ramp: from the balcony, a line of lights winds down to the lake.
    for (const lp of V.rampLamps) {
      const lx = Math.floor(lp[0]);
      const lz = Math.floor(lp[2]);
      if (!free(lx, lp[1], lz) || !SOLID[get(lx, lp[1] - 1, lz)]) continue;
      claim(lx, lp[1], lz);
      addProp({ kind: 'lanternPost', x: lp[0], y: lp[1], z: lp[2] }, V.lava ? B.LIGHT_MAGMA : B.LIGHT_AMBER);
    }
    // The hall's floor, dressed generously with its biome's props round the lake.
    const kinds = BIOMES[V.biome].props.filter((k) => !HANGING_PROPS.has(k as PropKind) && !['chest', 'crate', 'barrel', 'lanternPost', 'runeStone', 'abyssMonolith'].includes(k));
    if (kinds.length) {
      for (const i of order) {
        const c = cellOf(i);
        const [x, y, z] = c;
        if (y !== V.centre[1] || Math.hypot(x + 0.5 - V.centre[0], z + 0.5 - V.centre[2]) > V.radius - 2) continue;
        if (curated(x, z) || !free(x, y, z) || !steady(x, y, z) || !spaced('vistaDecor', c, 3.2)) continue;
        claim(x, y, z);
        mark('vistaDecor', c, 3.2);
        addProp({ kind: kinds[rng.int(0, kinds.length - 1)] as PropKind, x: x + 0.5, y, z: z + 0.5, scale: rng.range(0.8, 1.4) });
        stats[V.biome].props++;
      }
    }
    const foot = onFloor(V.rampFoot);
    if (foot) outpostSites.push({ id: `outpost_${V.id}`, biome: V.biome, p: foot, radius: 4 });
  }

  const RV = extras.river;
  if (RV) {
    const sb = biomeAtCell(Math.floor(RV.spring[0]), Math.floor(RV.spring[2]));
    sites.push({ id: RV.id, kind: 'river', biome: sb, centre: RV.spring, radius: 8, name: RV.kind === 'lava' ? 'lavaRiver' : 'river' });
    landmarks.spring = RV.spring;
    // Its banks: reeds, shells and driftwood every few metres (charred bones and vents by lava).
    const bank = RV.kind === 'lava' ? ['charredBones', 'emberVent'] : ['reeds', 'shells', 'driftwood', 'reeds'];
    for (let k = 0; k < RV.points.length; k += 4) {
      const [px0, py0, pz0] = RV.points[k];
      const q = onFloor([px0 + rng.range(-2.5, 2.5), Math.round(py0 + 0.25), pz0 + rng.range(-2.5, 2.5)]);
      if (!q) continue;
      const qx = Math.floor(q[0]);
      const qz = Math.floor(q[2]);
      if (curated(qx, qz) || !free(qx, q[1], qz) || !steady(qx, q[1], qz) || !spaced('bank', q, 3)) continue;
      claim(qx, q[1], qz);
      mark('bank', q, 3);
      addProp({ kind: bank[rng.int(0, bank.length - 1)] as PropKind, x: q[0], y: q[1], z: q[2], scale: rng.range(0.8, 1.2) });
    }
    const sx0 = Math.floor(RV.spring[0]);
    const sz0 = Math.floor(RV.spring[2]);
    const sy0 = Math.round(RV.spring[1]) + 3;
    if (get(sx0, sy0, sz0) === B.AIR) {
      set(sx0, sy0, sz0, RV.kind === 'lava' ? B.LIGHT_MAGMA : B.LIGHT_CYAN);
      lights.push([sx0, sy0, sz0]);
    }
  }

  const WK = extras.works;
  if (WK) {
    sites.push({ id: WK.id, kind: 'dungeon', biome: WK.biome, centre: WK.entry, radius: 6, name: 'works' });
    landmarks.works = WK.entry;
    const leverIds: string[] = [];
    WK.levers.forEach((l, k) => {
      const id = `${WK.id}_lever_${k}`;
      claim(Math.floor(l.p[0]), l.p[1], Math.floor(l.p[2]));
      addProp({ kind: 'lever', x: l.p[0], y: l.p[1], z: l.p[2], rotY: l.rotY, interact: 'feature', feature: { kind: 'lever', id }, id });
      leverIds.push(id);
    });
    for (const lamp of WK.lamps) addProp({ kind: 'hangingLantern', x: lamp.p[0], y: lamp.p[1], z: lamp.p[2], anchor: lamp.anchor }, B.LIGHT_LAMP);
    const chestIds = WK.chests.map((c, k) => addChest(c, k === 2 ? 'secret' : 'dungeon', stratum + (k === 2 ? 2 : 1)));
    for (const d of WK.dressing) {
      const x = Math.floor(d.p[0]);
      const z = Math.floor(d.p[2]);
      if (!free(x, d.p[1], z)) continue;
      claim(x, d.p[1], z);
      addProp({ kind: d.kind as PropKind, x: d.p[0], y: d.p[1], z: d.p[2], rotY: d.rotY });
    }
    const ex = Math.floor(WK.entry[0]);
    const ez = Math.floor(WK.entry[2]);
    if (free(ex, WK.entry[1], ez)) addProp({ kind: 'lanternPost', x: WK.entry[0], y: WK.entry[1], z: WK.entry[2] }, B.LIGHT_LAMP);
    dungeon = { id: WK.id, biome: WK.biome, puzzle: WK.puzzle, entry: WK.entry, hall: WK.hall, vault: WK.vault, door: WK.door, sockets: WK.sockets, levers: leverIds, plates: WK.plates, chests: chestIds };
  }

  for (const r of extras.ravines) {
    sites.push({ id: r.id, kind: 'ravine', biome: r.biome, centre: r.bottom, radius: 4 });
    const bx = Math.floor(r.bottom[0]);
    const bz = Math.floor(r.bottom[2]);
    const by = r.bottom[1];
    if (get(bx, by, bz) === B.AIR && get(bx, by + 1, bz) === B.AIR && SOLID[get(bx, by - 1, bz)]) addChest([bx, by, bz], 'ravine', stratum + 1);
    if (get(bx, by + 3, bz) === B.AIR) {
      set(bx, by + 3, bz, BIOMES[r.biome].lightBlock);
      lights.push([bx, by + 3, bz]);
    }
    // The pocket's walls are rich: three veins of the biome's rarer ores.
    const ores = BIOMES[r.biome].ores;
    for (let k = 0; k < 3 && ores.length; k++) {
      const a = rng.range(0, Math.PI * 2);
      for (let s = 2; s < 6; s++) {
        const x = Math.floor(r.bottom[0] + Math.cos(a) * s);
        const z = Math.floor(r.bottom[2] + Math.sin(a) * s);
        if (isHost(get(x, by + 1, z))) {
          const ore = ores[Math.min(ores.length - 1, 1 + k)]?.block ?? ores[0].block;
          const n = growVein(x, by + 1, z, ore, rng.int(4, 7), true);
          stats[r.biome].oreBlocks += n;
          if (n) stats[r.biome].oreVeins++;
          break;
        }
      }
    }
  }

  for (const pc of extras.pieces) {
    const pn = plan.nodes[pc.node];
    for (const l of pc.lights) {
      lights.push(l);
      markLit(l);
    }
    if (pc.chest) {
      const q = onFloor(pc.chest);
      if (q && free(Math.floor(q[0]), q[1], Math.floor(q[2]))) addChest([Math.floor(q[0]), q[1], Math.floor(q[2])], 'setPiece', stratum + 1);
    }
    for (const pr of pc.props) {
      if (pr.p[1] < 1) continue;
      if (pr.anchor) {
        if (SOLID[get(pr.anchor[0], pr.anchor[1], pr.anchor[2])]) addProp({ kind: pr.kind as PropKind, x: pr.p[0], y: pr.p[1], z: pr.p[2], anchor: pr.anchor, scale: rng.range(0.8, 1.2) }, pr.kind === 'hangingLantern' ? B.LIGHT_LAMP : undefined);
        continue;
      }
      const x = Math.floor(pr.p[0]);
      const z = Math.floor(pr.p[2]);
      if (!free(x, pr.p[1], z) || !SOLID[get(x, pr.p[1] - 1, z)] || !steady(x, pr.p[1], z)) continue;
      claim(x, pr.p[1], z);
      addProp({ kind: pr.kind as PropKind, x: pr.p[0], y: pr.p[1], z: pr.p[2], rotY: pr.rotY ?? rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.25) }, pr.kind === 'lanternPost' ? B.LIGHT_AMBER : undefined);
      stats[pn.biome].props++;
    }
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
    if (n.kind !== 'cavern' && n.kind !== 'vista') continue;
    if (hk === 'cold' || hk === 'dark' || hk === 'void') hazards.push({ id: `hz_${hazards.length}`, kind: hk, biome: n.biome, centre: [n.x, n.y, n.z], radius: Math.max(n.rx, n.rz), strength: BIOMES[n.biome].hazard.strength });
  }
  // The gentle hazards of strata II and III, in real places only: the chill by the grottoes' water
  // (every lake and river pool of a chill biome), the long falls of the ravines' openings, the old
  // timbers of the mines' camps and works (rockfall).
  for (const lk of [...decor.lakes, ...(extras.lakes ?? [])]) {
    const cx = (lk.min[0] + lk.max[0]) / 2;
    const cz = (lk.min[1] + lk.max[1]) / 2;
    const b = biomeAtCell(Math.floor(cx), Math.floor(cz));
    if (BIOMES[b].hazard.kind !== 'chill') continue;
    hazards.push({ id: `hz_${hazards.length}`, kind: 'chill', biome: b, centre: [cx, lk.level, cz], radius: Math.hypot(lk.max[0] - lk.min[0], lk.max[1] - lk.min[1]) / 2 + 3, strength: BIOMES[b].hazard.strength });
  }
  for (const r of extras.ravines) hazards.push({ id: `hz_${hazards.length}`, kind: 'falls', biome: r.biome, centre: r.top, radius: 9, strength: Math.max(0.3, BIOMES[r.biome].hazard.kind === 'falls' ? BIOMES[r.biome].hazard.strength : 0.3) });
  for (const site of sites) {
    if ((site.kind !== 'mineCamp' && site.kind !== 'dungeon') || BIOMES[site.biome].hazard.kind !== 'rockfall') continue;
    hazards.push({ id: `hz_${hazards.length}`, kind: 'rockfall', biome: site.biome, centre: site.centre, radius: site.kind === 'dungeon' ? 16 : site.radius + 2, strength: BIOMES[site.biome].hazard.strength });
  }

  for (const b of plan.biomes) {
    const st2 = stats[b];
    // Chests along the plan's tunnels per 25 m of their walking line (BRIEF §0.1: about one).
    st2.tunnelMetres = Math.round(tunnelM[b] ?? 0);
    st2.chestsPer25m = tunnelM[b] ? +((tunnelChests[b] ?? 0) / (tunnelM[b] / STRATA_GEN.chestSpacing)).toFixed(2) : 0;
  }

  // The set pieces' own hazards: the geyser field's gas, the ember deep's and the vista's lava.
  for (const pc of extras.pieces) {
    const pn = plan.nodes[pc.node];
    if (pc.name === 'geyserField') hazards.push({ id: `hz_${hazards.length}`, kind: 'gas', biome: pn.biome, centre: [pn.x, pn.y, pn.z], radius: Math.min(pn.rx, pn.rz) * 0.7, strength: 0.7 });
    if (pc.name === 'emberDeep') hazards.push({ id: `hz_${hazards.length}`, kind: 'lava', biome: pn.biome, centre: [pn.x, pn.y, pn.z], radius: Math.min(pn.rx, pn.rz) * 0.45, strength: 1 });
  }
  if (V?.lava) hazards.push({ id: `hz_${hazards.length}`, kind: 'lava', biome: V.biome, centre: V.centre, radius: V.radius * 0.45, strength: 1 });

  return { props, lairs, gate, arrival, camp, campSite, outpostSites, pages, chests, nests, spawnPoints, hazards, sites, landmarks, heart, stats, oreBlocks, dungeon, secrets };
}
