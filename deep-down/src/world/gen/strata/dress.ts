import { B, SOLID } from '../../../config/blocks';
import { BIOMES, type BiomeId } from '../../../config/biomes';
import { Rng } from '../../../core/rng';
import type { LakeDef } from '../features/types';
import type { CarveState } from './carve';
import type { PlanNode } from './plan';

/**
 * The dressing passes of a stratum (round 3, WORLD): floors, the biomes' block columns (giant
 * fungi, elder roots, ice and crystal spires, ruined colonnades, timbered drifts, vines, basalt and
 * glass spires), lakes, lava and toxic pools.
 */

const HOST = new Uint8Array(256);
for (const id of Object.keys(BIOMES) as BiomeId[]) {
  for (const h of BIOMES[id].hosts) HOST[h] = 1;
  HOST[BIOMES[id].floor] = 1;
}
HOST[B.BEDROCK] = 0;
/** Natural rock of any biome (hosts and floors): dressing may replace it. */
export const isHost = (id: number): boolean => HOST[id] === 1;

/** Every exposed top of natural rock becomes its biome's floor; the cells under it its host. */
export function floors(st: CarveState): number {
  const w = st.world;
  const { sx, sy, sz } = w;
  let n = 0;
  for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) {
    const floorBlock = BIOMES[st.plan.biomes[st.biomeCol[x + z * sx]]].floor;
    for (let y = sy - 3; y >= 1; y--) {
      const i = x + sx * (y + sy * z);
      if (w.blocks[i + sx] === B.AIR && HOST[w.blocks[i]]) {
        w.blocks[i] = floorBlock;
        n++;
      }
    }
  }
  return n;
}

/** The floor height (feet y) of the column at (x, z) nearest to y, or -1. */
export function floorNear(st: CarveState, x: number, y: number, z: number, span = 6): number {
  const w = st.world;
  for (let d = 0; d <= span; d++) for (const yy of d ? [y + d, y - d] : [y]) {
    if (yy < 1 || yy >= w.sy - 2) continue;
    if (!SOLID[w.get(x, yy, z)] && !SOLID[w.get(x, yy + 1, z)] && SOLID[w.get(x, yy - 1, z)]) return yy;
  }
  return -1;
}

export interface Decor {
  /** Light emitter cells placed by the dressing (for the darkness map). */
  lights: Array<[number, number, number]>;
  lakes: LakeDef[];
  /** Hazard pools (lava, gas): centre and radius. */
  pools: Array<{ kind: 'lava' | 'gas'; x: number; y: number; z: number; r: number }>;
  columns: number;
}

const setIf = (st: CarveState, x: number, y: number, z: number, id: number, onlyAir = true) => {
  const w = st.world;
  if (x < 2 || z < 2 || y < 1 || x >= w.sx - 2 || z >= w.sz - 2 || y >= w.sy - 2) return;
  const i = x + w.sx * (y + w.sy * z);
  if (onlyAir ? w.blocks[i] === B.AIR : HOST[w.blocks[i]] || w.blocks[i] === B.AIR) w.blocks[i] = id;
};

/** Roof height above (x, y, z): the first solid cell going up (or y + max). */
const roofAbove = (st: CarveState, x: number, y: number, z: number, max = 40) => {
  for (let k = 1; k <= max; k++) if (SOLID[st.world.get(x, y + k, z)]) return y + k;
  return y + max;
};

/** Dress every chamber with its biome's columns, and the tunnels with their biome's details. */
export function dressBiomes(st: CarveState, seed: number): Decor {
  const rng = new Rng(seed ^ 0xd2e55);
  const decor: Decor = { lights: [], lakes: [], pools: [], columns: 0 };
  for (const n of st.plan.nodes) {
    const b = BIOMES[n.biome];
    if (n.kind === 'arrival' || n.kind === 'gate' || n.kind === 'heart') continue;
    const count = n.kind === 'cavern' ? rng.int(5, 9) : n.kind === 'lair' ? 4 : rng.int(1, 3);
    for (let k = 0; k < count; k++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(0.25, n.kind === 'lair' ? 0.85 : 0.75);
      const x = Math.floor(n.x + Math.cos(a) * n.rx * r);
      const z = Math.floor(n.z + Math.sin(a) * n.rz * r);
      if (st.corridor[x + z * st.plan.sx]) continue;
      // Lairs keep their arena clear: their columns stand round the rim.
      if (n.kind === 'lair' && r < 0.7) continue;
      const y = floorNear(st, x, n.y, z, 4);
      if (y < 0) continue;
      if (column(st, rng, b.shape.columns, x, y, z, n, decor)) decor.columns++;
    }
    // Pools in the dips of the great caverns: water, lava or toxic crust.
    if (n.kind === 'cavern' || n.kind === 'room') pools(st, rng, n, decor);
  }
  return decor;
}

function column(st: CarveState, rng: Rng, kind: string, x: number, y: number, z: number, n: PlanNode, decor: Decor): boolean {
  const roof = roofAbove(st, x, y, z);
  const H = roof - y;
  if (H < 4) return false;
  switch (kind) {
    case 'fungi': {
      // A giant mushroom: a pale stem, a glowing dome cap (teal or magenta), light under it.
      const h = Math.min(H - 3, rng.int(5, 12));
      if (h < 4) return false;
      const stem = rng.chance(0.4) ? 1 : 0;
      for (let k = 0; k < h; k++) for (let dx = -stem; dx <= stem; dx++) for (let dz = -stem; dz <= stem; dz++) setIf(st, x + dx, y + k, z + dz, B.MUSHROOM_STEM);
      const cap = rng.chance(0.5) ? B.MUSHROOM_CAP_TEAL : B.MUSHROOM_CAP_MAGENTA;
      const cr = rng.int(3, 5);
      for (let dz = -cr; dz <= cr; dz++) for (let dx = -cr; dx <= cr; dx++) {
        const d = Math.hypot(dx, dz) / cr;
        if (d > 1) continue;
        const t = Math.round((1 - d * d) * 2.2);
        for (let k = 0; k <= t; k++) setIf(st, x + dx, y + h + k, z + dz, cap);
      }
      const ly = y + h - 1;
      setIf(st, x + 2, ly, z, cap === B.MUSHROOM_CAP_TEAL ? B.LIGHT_TEAL : B.LIGHT_MAGENTA);
      decor.lights.push([x + 2, ly, z]);
      return true;
    }
    case 'roots': {
      // An elder root from floor to roof, leaning with a slow wander; root tangles where it meets the roof.
      let px = x;
      let pz = z;
      for (let k = 0; k < H; k++) {
        if (k % 4 === 3) {
          px += rng.int(-1, 1);
          pz += rng.int(-1, 1);
        }
        for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) setIf(st, px + dx, y + k, pz + dz, B.THICK_ROOT);
      }
      for (let k = 0; k < 6; k++) setIf(st, px + rng.int(-2, 2), roof - 1, pz + rng.int(-2, 2), B.ROOTS);
      return true;
    }
    case 'ice': {
      // An ice spike from the floor and an icicle from the roof.
      const h = Math.min(H - 2, rng.int(3, 8));
      cone(st, x, y, z, h, 1.6, B.FROST_ICE, 1);
      cone(st, x + rng.int(-3, 3), roof - 1, z + rng.int(-3, 3), Math.min(H - 3, rng.int(2, 5)), 1.1, B.FROST_ICE, -1);
      if (rng.chance(0.4)) {
        setIf(st, x + 1, y + 1, z + 1, B.LIGHT_ICE);
        decor.lights.push([x + 1, y + 1, z + 1]);
      }
      return true;
    }
    case 'crystal': {
      // A crystal spire: glimmer and amethyst over a calcite foot (minable: the geode's riches).
      const h = Math.min(H - 2, rng.int(3, 7));
      const ore = rng.chance(0.5) ? B.CRYSTAL : B.AMETHYST;
      cone(st, x, y, z, h, 1.4, ore, 1);
      setIf(st, x + 1, y, z, B.GEODE_CALCITE);
      return true;
    }
    case 'ruins': {
      // A square column of carved stone, whole to the roof or broken.
      const broken = rng.chance(0.45);
      const h = broken ? Math.min(H - 1, rng.int(2, 5)) : H;
      for (let k = 0; k < h; k++) for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) setIf(st, x + dx, y + k, z + dz, k === 0 || k === h - 1 ? B.CITY_BRICK : B.CITY_STONE);
      if (!broken && rng.chance(0.5)) {
        setIf(st, x + 2, y + 2, z, B.LIGHT_RUNE);
        decor.lights.push([x + 2, y + 2, z]);
      }
      return true;
    }
    case 'timber': {
      // A timber set: two posts and a cap beam.
      const h = Math.min(H - 1, 4);
      for (let k = 0; k < h; k++) {
        setIf(st, x, y + k, z, B.BEAM);
        setIf(st, x + 3, y + k, z, B.BEAM);
      }
      for (let dx = 0; dx <= 3; dx++) setIf(st, x + dx, y + h, z, B.PLANK);
      return true;
    }
    case 'vines': {
      // Glowing vines hanging from the roof in a curtain.
      for (let k = 0; k < 5; k++) {
        const vx = x + rng.int(-2, 2);
        const vz = z + rng.int(-2, 2);
        const len = Math.min(roof - y - 3, rng.int(2, 6));
        for (let j = 1; j <= len; j++) setIf(st, vx, roof - j, vz, B.GLOW_VINE);
      }
      setIf(st, x, roof - 2, z, B.LIGHT_GLOWROOT);
      decor.lights.push([x, roof - 2, z]);
      return true;
    }
    case 'spires': {
      const host = BIOMES[n.biome].hosts[0];
      const tip = n.biome === 'obsidianAbyss' ? B.VOIDSHARD : B.EMBERITE;
      const h = Math.min(H - 2, rng.int(4, 10));
      cone(st, x, y, z, h, 1.8, host, 1);
      setIf(st, x, y + h, z, tip);
      return true;
    }
    default:
      return false;
  }
}

/** A cone of `id` from (x, y, z) rising (dir 1) or hanging (dir -1) `h` cells, base radius r. */
function cone(st: CarveState, x: number, y: number, z: number, h: number, r: number, id: number, dir: 1 | -1): void {
  for (let k = 0; k < h; k++) {
    const rr = r * (1 - k / h);
    const R = Math.ceil(rr);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= rr * rr + 0.3) setIf(st, x + dx, y + dir * k, z + dz, id);
  }
}

/** Fill the floor dips of a chamber: still water (VIS draws it), lava (magma) or toxic crust (bog). */
function pools(st: CarveState, rng: Rng, n: PlanNode, decor: Decor): void {
  const b = BIOMES[n.biome].shape;
  const w = st.world;
  const kind = b.lava > 0.5 ? 'lava' : n.biome === 'sulphurBog' ? 'gas' : b.lakes > 0.25 || rng.chance(b.lakes) ? 'water' : null;
  if (!kind) return;
  const R = Math.ceil(Math.max(n.rx, n.rz));
  const x0 = Math.max(3, Math.floor(n.x - R));
  const z0 = Math.max(3, Math.floor(n.z - R));
  const x1 = Math.min(w.sx - 4, Math.ceil(n.x + R));
  const z1 = Math.min(w.sz - 4, Math.ceil(n.z + R));
  const mask = new Uint8Array((x1 - x0 + 1) * (z1 - z0 + 1));
  let cells = 0;
  let sx = 0;
  let sz = 0;
  const level = n.y;
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (st.chamberOf[x + z * w.sx] !== n.id + 1) continue;
    // A dip: the floor top is below the chamber's rim level.
    const f = floorNear(st, x, level, z, 3);
    if (f < 0 || f >= level) continue;
    if (kind !== 'water' && st.corridor[x + z * w.sx]) continue;
    mask[(z - z0) * (x1 - x0 + 1) + (x - x0)] = 1;
    cells++;
    sx += x;
    sz += z;
    if (kind === 'lava') w.blocks[x + w.sx * (f - 1 + w.sy * z)] = B.LAVA;
    if (kind === 'gas') w.blocks[x + w.sx * (f - 1 + w.sy * z)] = B.TOXIC_POOL;
  }
  if (cells < 6) return;
  const cx = sx / cells;
  const cz = sz / cells;
  if (kind === 'water') decor.lakes.push({ id: `lake_${n.id}`, level: level - 0.18, min: [x0, z0], max: [x1, z1], mask });
  else {
    decor.pools.push({ kind, x: cx, y: level, z: cz, r: Math.sqrt(cells / Math.PI) + 1 });
    const lx = Math.floor(cx);
    const lz = Math.floor(cz);
    const ly = level + 1;
    const light = kind === 'lava' ? B.LIGHT_MAGMA : B.LIGHT_SULPHUR;
    if (w.get(lx, ly, lz) === B.AIR) {
      w.blocks[lx + w.sx * (ly + w.sy * lz)] = light;
      decor.lights.push([lx, ly, lz]);
    }
  }
}
