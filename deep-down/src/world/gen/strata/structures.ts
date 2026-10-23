import { B, SOLID } from '../../../config/blocks';
import { BIOMES, type BiomeId } from '../../../config/biomes';
import { Rng } from '../../../core/rng';
import type { LakeDef } from '../features/types';
import type { CarveState } from './carve';
import { floorNear, isHost } from './dress';
import { OVERLOOK_RISE, edgePath, riverEdges, type DungeonPlan, type PlanNode } from './plan';
import type { V3 } from './types';

/**
 * The great structures of a stratum (round 3, WORLD; BRIEF §0.1 and the §6 stretch): the landmark
 * vista (a huge hall with a balcony, a ramp down its wall and a fall into its lake), the underground
 * river that runs to it, the Halden works (a mini-dungeon whose door opens to levers or pressure
 * plates), the set pieces stamped into fitting caverns, and the ravines with their ropes.
 *
 * Every pass here works on the voxels before the walk BFS, so the reachability proof covers it: the
 * ramp is walkable (one step per ~2.8 m), the river is one block deep (stepped into and out of), the
 * works' door is the only way into its vault (the BFS opens it like the gate's seal).
 */

const idx = (st: CarveState, x: number, y: number, z: number) => x + st.world.sx * (y + st.world.sy * z);
const inZone = (st: CarveState, x: number, y: number, z: number, m = 2) => x >= m && z >= m && y >= 1 && x < st.world.sx - m && z < st.world.sz - m && y < st.world.sy - 2;
const get = (st: CarveState, x: number, y: number, z: number) => (inZone(st, x, y, z, 0) ? st.world.blocks[idx(st, x, y, z)] : B.BEDROCK);
function put(st: CarveState, x: number, y: number, z: number, id: number): void {
  if (inZone(st, x, y, z)) st.world.blocks[idx(st, x, y, z)] = id;
}
function putAir(st: CarveState, x: number, y: number, z: number, id: number): void {
  if (inZone(st, x, y, z) && st.world.blocks[idx(st, x, y, z)] === B.AIR) st.world.blocks[idx(st, x, y, z)] = id;
}

/** A water or lava fall for VIS to draw (top and foot in metres, its width). */
export interface FallSite {
  id: string;
  kind: 'water' | 'lava';
  top: V3;
  bottom: V3;
  width: number;
}

/** The underground river for VIS (a ribbon along the points, the water surface's height). */
export interface RiverSite {
  id: string;
  kind: 'water' | 'lava';
  /** Centre line, spring to mouth: x, surface y, z (about every 1.2 m). */
  points: V3[];
  width: number;
  /** The spring (its source pool) and the mouth (where it falls into the vista's hall). */
  spring: V3;
  mouth: V3;
}

/** Columns (x + z * sx) the density pass leaves alone (curated places). */
export type Reserved = Uint8Array;

export interface VistaOut {
  id: string;
  name: string;
  biome: BiomeId;
  centre: V3;
  radius: number;
  /** The balcony's centre (feet), where the view opens; the ramp's foot on the hall floor. */
  balcony: V3;
  /** The balcony's lip on the view line (feet): the parapet is open there, the hall in view below. */
  lookout: V3;
  rampFoot: V3;
  falls: FallSite[];
  lakes: LakeDef[];
  lights: V3[];
  /** Lava instead of water (the fire strata). */
  lava: boolean;
  /** Lamp posts down the ramp (feet, on its outer edge): from the balcony a line of lights winds to the lake. */
  rampLamps: V3[];
  /** The island at the lake's heart and the top of its spire (a light burns there). */
  island: V3;
  /** Stalactites hung from the dome. */
  stalactites: number;
}

/** The vista's name per stratum (WORLD_TEXT_EN `site.vista<n>.*`). */
/** The vista's name by the biome it opens in (its title and body say what that hall holds). */
export const VISTA_NAMES: Record<BiomeId, string> = {
  amberHollows: 'honeyCathedral', mushroomForest: 'sporeCathedral',
  rootGalleries: 'rootHall', floodedGrottoes: 'drownedHall',
  crystalGeode: 'singingVault', haldenMines: 'greatDig',
  frostCaverns: 'iceCathedral', glowrootJungle: 'greenVault',
  sulphurBog: 'sulphurDome', sunkenCity: 'sunkenForum',
  magmaVeins: 'fireThroat', obsidianAbyss: 'glassAbyss',
  heart: 'fireThroat',
};

/**
 * The landmark vista: a tall dome (a flat-topped roof profile, so the walls stand high) with a lake at
 * its heart, the balcony at the rim OVERLOOK_RISE m up (where the explorer first sees the hall), a ramp
 * winding down the wall to the floor, and a fall from the balcony's edge into a plunge pool.
 */
export function carveVista(st: CarveState, seed: number, reserved: Reserved): VistaOut | null {
  const plan = st.plan;
  if (plan.vista === null || plan.overlook === null) return null;
  const rng = new Rng(seed ^ 0x5157a);
  const n = plan.nodes[plan.vista];
  const o = plan.nodes[plan.overlook];
  const w = st.world;
  const { sx } = w;
  const R = n.rx;
  const H = n.ry;
  const lava = n.biome === 'magmaVeins' || (plan.stratum === 6 && n.biome !== 'obsidianAbyss');
  const host = BIOMES[n.biome].hosts;
  const noise = st.noise;
  const lakeR = R * 0.4;

  // 1. The hall.
  const lakeMask: Array<[number, number]> = [];
  for (let z = Math.floor(n.z - R - 2); z <= Math.ceil(n.z + R + 2); z++) {
    for (let x = Math.floor(n.x - R - 2); x <= Math.ceil(n.x + R + 2); x++) {
      if (!inZone(st, x, 2, z, 3)) continue;
      const dx = x + 0.5 - n.x;
      const dz = z + 0.5 - n.z;
      const wob = 1 + 0.06 * noise.noise2(x / 11 + 3.3, z / 11 - 1.7);
      const d = Math.hypot(dx, dz) / (R * wob);
      if (d >= 1) continue;
      const roof = n.y + H * Math.sqrt(Math.max(0, 1 - d ** 6)) * (0.9 + 0.1 * noise.noise2(x / 13, z / 13 + 8)) + 2;
      const top = Math.min(w.sy - 3, Math.floor(roof));
      const col = x + z * sx;
      for (let y = n.y; y <= top; y++) w.blocks[idx(st, x, y, z)] = B.AIR;
      // A floor of rock under the hall (worms may have hollowed it): the floor is whole.
      for (let y = n.y - 3; y < n.y; y++) if (!SOLID[w.blocks[idx(st, x, y, z)]]) w.blocks[idx(st, x, y, z)] = host[0];
      st.chamberOf[col] = n.id + 1;
      if (st.floorY[col] < 0 || n.y < st.floorY[col]) st.floorY[col] = n.y;
      // The lake: one block deep (stepped into and out of), a wobbly round heart.
      const ld = Math.hypot(dx, dz) / (lakeR * (1 + 0.18 * noise.noise2(x / 7 - 5, z / 7 + 2)));
      if (ld < 1) {
        w.blocks[idx(st, x, n.y - 1, z)] = lava ? B.AIR : B.AIR;
        if (lava) w.blocks[idx(st, x, n.y - 2, z)] = B.LAVA;
        lakeMask.push([x, z]);
      }
    }
  }

  // 1b. Rock bridges: a tunnel the graph needs across the hall spans it at its own height (a slab
  // three wide, open above), or runs over the hall's floor when it is that low.
  for (const e of plan.edges) {
    if (!e.bridge) continue;
    const path = edgePath(plan, e, 0.4);
    for (const [cx, cy, cz] of path) {
      const dc = Math.hypot(cx - n.x, cz - n.z) / R;
      if (dc >= 1.02) continue;
      const h = Math.round(cy);
      for (let k = -1.6; k <= 1.6; k += 0.4) {
        // Across the path (perpendicular to its heading toward the next point: use the edge's chord).
        const A = plan.nodes[e.a];
        const Bn = plan.nodes[e.b];
        const cl = Math.hypot(Bn.x - A.x, Bn.z - A.z) || 1;
        const x = Math.floor(cx - ((Bn.z - A.z) / cl) * k);
        const z = Math.floor(cz + ((Bn.x - A.x) / cl) * k);
        if (!inZone(st, x, h, z, 3)) continue;
        if (h > n.y + 1) {
          put(st, x, h - 1, z, host[0]);
          put(st, x, h - 2, z, host[1]);
          if (Math.abs(k) > 1.3 && h - 3 > n.y) put(st, x, h - 3, z, host[1]);
        } else if (h < n.y) {
          for (let y = h; y < n.y; y++) put(st, x, y, z, B.AIR);
        }
        for (let y = h; y <= h + 3; y++) put(st, x, y, z, B.AIR);
        reserved[x + z * sx] = 1;
      }
    }
  }

  // 2. The balcony: a half-disc slab at the rim, OVERLOOK_RISE up, with a low parapet facing the hall.
  const ux = (o.x - n.x) / Math.hypot(o.x - n.x, o.z - n.z);
  const uz = (o.z - n.z) / Math.hypot(o.x - n.x, o.z - n.z);
  const by = o.y;
  const P: V3 = [n.x + ux * (R - 4), by, n.z + uz * (R - 4)];
  const side = rng.chance(0.5) ? 1 : -1;
  const a0 = Math.atan2(uz, ux);
  const rampStart = a0 + side * 0.24;
  const fallAng = a0 - side * 0.2;
  const fallR = R - 8;
  const fallX = n.x + Math.cos(fallAng) * fallR;
  const fallZ = n.z + Math.sin(fallAng) * fallR;
  for (let z = Math.floor(P[2] - 8); z <= Math.ceil(P[2] + 8); z++) {
    for (let x = Math.floor(P[0] - 8); x <= Math.ceil(P[0] + 8); x++) {
      const dd = Math.hypot(x + 0.5 - P[0], z + 0.5 - P[2]);
      if (dd > 6.2) continue;
      // Only on the hall's side of the balcony line and inside the hall's wall.
      const r = Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z);
      if (r > R + 1.5) continue;
      put(st, x, by - 1, z, host[0]);
      put(st, x, by - 2, z, host[0]);
      for (let y = by; y <= by + 4; y++) put(st, x, y, z, B.AIR);
      reserved[x + z * sx] = 1;
      // The parapet: the slab's inner rim (toward the hall), not where the ramp leaves or the river falls.
      const inner = (x + 0.5 - n.x) * ux + (z + 0.5 - n.z) * uz;
      const ang = Math.atan2(z + 0.5 - n.z, x + 0.5 - n.x);
      const nearRamp = Math.abs(angDiff(ang, rampStart)) < 0.16;
      const nearFall = Math.abs(angDiff(ang, fallAng)) < 0.12;
      // Open on the view line (three cells across the axis to the hall's centre): from there the
      // lake, the island and the fall show below (a 1 m parapet hides all 6 degrees under the eye).
      const onView = Math.abs((x + 0.5 - P[0]) * uz - (z + 0.5 - P[2]) * ux) < 1.6;
      if (dd > 5.2 && inner < R - 6 && !nearRamp && !nearFall && !onView) put(st, x, by, z, host[1]);
    }
  }
  // The lookout: the slab's last cell on the axis toward the hall (where the view opens).
  let lookout: V3 = [P[0], by, P[2]];
  for (let d = 0; d <= 6.2; d += 0.25) {
    const x = Math.floor(P[0] - ux * d);
    const z = Math.floor(P[2] - uz * d);
    if (SOLID[get(st, x, by - 1, z)] && !SOLID[get(st, x, by, z)] && !SOLID[get(st, x, by + 1, z)]) lookout = [x + 0.5, by, z + 0.5];
  }
  // The fall's lip: the river's channel runs over the balcony to the edge (one block lower).
  const lipX = n.x + Math.cos(fallAng) * (R - 6.8);
  const lipZ = n.z + Math.sin(fallAng) * (R - 6.8);

  // 3. The ramp: 3 m wide, OVERLOOK_RISE down along the wall (one block every ~2.8 m).
  const rr = R - 4.5;
  const L = OVERLOOK_RISE / 0.34;
  const span = L / rr;
  let rampFoot: V3 = [n.x, n.y, n.z];
  const steps = Math.ceil(L / 0.25);
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const a = rampStart + side * span * t;
    const h = Math.round(by - OVERLOOK_RISE * t);
    for (let r = rr - 1.6; r <= rr + 1.6; r += 0.4) {
      const x = Math.floor(n.x + Math.cos(a) * r);
      const z = Math.floor(n.z + Math.sin(a) * r);
      if (!inZone(st, x, h, z, 3)) continue;
      put(st, x, h - 1, z, host[0]);
      if (h - 2 > n.y - 1) put(st, x, h - 2, z, host[0]);
      for (let y = h; y <= h + 3; y++) put(st, x, y, z, B.AIR);
      reserved[x + z * sx] = 1;
    }
    if (k === steps) rampFoot = [n.x + Math.cos(a) * rr, n.y, n.z + Math.sin(a) * rr];
  }
  // Lamp posts down the ramp, on its outer edge.
  const rampLamps: V3[] = [];
  for (const t of [0.16, 0.38, 0.6, 0.82]) {
    const a = rampStart + side * span * t;
    const h = Math.round(by - OVERLOOK_RISE * t);
    const x = Math.floor(n.x + Math.cos(a) * (rr + 1.1));
    const z = Math.floor(n.z + Math.sin(a) * (rr + 1.1));
    // On the ramp's floor as carved (each step re-cut the cells of the one before it).
    for (let y = h + 2; y >= h - 3; y--) if (!SOLID[get(st, x, y, z)] && !SOLID[get(st, x, y + 1, z)] && SOLID[get(st, x, y - 1, z)]) {
      rampLamps.push([x + 0.5, y, z + 0.5]);
      break;
    }
  }

  // 3b. The island at the lake's heart, and its spire with a light at the top: the first thing the
  // eye finds from the balcony, mirrored in the water (across the lava in the fire strata).
  const islandR = Math.max(2.2, Math.min(3.3, lakeR * 0.3));
  const islandCells = new Set<number>();
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const x = Math.floor(n.x) + dx;
    const z = Math.floor(n.z) + dz;
    if (Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z) > islandR) continue;
    put(st, x, n.y - 1, z, host[0]);
    put(st, x, n.y - 2, z, host[0]);
    islandCells.add(x + z * sx);
    reserved[x + z * sx] = 1;
  }
  const spireH = rng.int(8, 12);
  for (let k = 0; k < spireH; k++) {
    // (Tapering to a 2 x 2 tip that reaches the top: the light sits on it.)
    const r0 = Math.max(0.42, 1.35 * (1 - k / (spireH + 1.5)));
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      if ((dx + 0.5) ** 2 + (dz + 0.5) ** 2 > r0 * r0 + 0.35) continue;
      putAir(st, Math.floor(n.x) + dx, n.y + k, Math.floor(n.z) + dz, host[1]);
    }
  }
  const island: V3 = [Math.floor(n.x) + 0.5, n.y + spireH, Math.floor(n.z) + 0.5];
  for (let i = lakeMask.length - 1; i >= 0; i--) if (islandCells.has(lakeMask[i][0] + lakeMask[i][1] * sx)) lakeMask.splice(i, 1);

  // 3c. Stalactites from the dome (none over the balcony, the ramp or the fall): the hall's height reads.
  const dripStone = n.biome === 'frostCaverns' ? B.FROST_ICE : n.biome === 'obsidianAbyss' ? B.OBSIDIAN : host[1];
  const tipLight = lava ? B.LIGHT_MAGMA : BIOMES[n.biome].lightBlock;
  const stalactiteTips: V3[] = [];
  let made = 0;
  for (let k = 0; k < 60 && made < 14; k++) {
    const a = rng.range(0, Math.PI * 2);
    // Inside the ramp's ring (it winds along the wall), never over the balcony's view line or the fall.
    const r = rng.range(0.15, 1) * (rr - 4);
    if (Math.abs(angDiff(a, a0)) < 0.7 && r > R * 0.45) continue;
    const x = Math.floor(n.x + Math.cos(a) * r);
    const z = Math.floor(n.z + Math.sin(a) * r);
    if (Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z) < islandR + 2 || reserved[x + z * sx]) continue;
    let roof = -1;
    for (let y = n.y + 8; y < w.sy - 3; y++) if (SOLID[get(st, x, y, z)]) {
      roof = y;
      break;
    }
    if (roof < 0) continue;
    const len = Math.min(roof - (n.y + 7), rng.int(3, 8));
    if (len < 3) continue;
    const base = rng.range(1.1, 2.2);
    for (let j = 0; j < len; j++) {
      const rj = base * (1 - j / (len + 0.5));
      const Rj = Math.ceil(rj);
      for (let dz = -Rj; dz <= Rj; dz++) for (let dx = -Rj; dx <= Rj; dx++) if (dx * dx + dz * dz <= rj * rj + 0.3) putAir(st, x + dx, roof - 1 - j, z + dz, dripStone);
    }
    if (made % 3 === 0) stalactiteTips.push([x, roof - 1 - len, z]);
    made++;
  }

  // 4. The plunge pool under the fall (one deep) and the stream from it to the lake.
  const lakes: LakeDef[] = [];
  const pool: Array<[number, number]> = [];
  for (let z = Math.floor(fallZ - 4); z <= Math.ceil(fallZ + 4); z++) for (let x = Math.floor(fallX - 4); x <= Math.ceil(fallX + 4); x++) {
    if (Math.hypot(x + 0.5 - fallX, z + 0.5 - fallZ) > 3.4) continue;
    if (get(st, x, n.y, z) !== B.AIR) continue;
    put(st, x, n.y - 1, z, B.AIR);
    if (lava) put(st, x, n.y - 2, z, B.LAVA);
    pool.push([x, z]);
  }
  const toLake = Math.hypot(n.x - fallX, n.z - fallZ);
  for (let s = 0; s < toLake - lakeR + 1; s += 0.5) {
    const cx = fallX + ((n.x - fallX) / toLake) * s;
    const cz = fallZ + ((n.z - fallZ) / toLake) * s;
    for (const [ddx, ddz] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const x = Math.floor(cx) + ddx;
      const z = Math.floor(cz) + ddz;
      if (get(st, x, n.y, z) !== B.AIR || get(st, x, n.y - 1, z) === B.AIR) continue;
      put(st, x, n.y - 1, z, B.AIR);
      if (lava) put(st, x, n.y - 2, z, B.LAVA);
      pool.push([x, z]);
    }
  }
  if (!lava) {
    lakes.push(lakeOf(`vista_lake_${n.id}`, n.y - 0.2, lakeMask));
    if (pool.length) lakes.push(lakeOf(`vista_pool_${n.id}`, n.y - 0.2, pool));
  }

  // 5. Light: a ring high on the walls (the hall reads from the balcony), the ramp's foot, the lake.
  const lights: V3[] = [];
  const lb = lava ? B.LIGHT_MAGMA : BIOMES[n.biome].lightBlock;
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2 + 0.2;
    for (let r = R - 1.5; r > R - 8; r -= 0.5) {
      const x = Math.floor(n.x + Math.cos(a) * r);
      const z = Math.floor(n.z + Math.sin(a) * r);
      const y = n.y + 9 + (k % 3) * 2;
      if (get(st, x, y, z) === B.AIR) {
        put(st, x, y, z, lb);
        lights.push([x, y, z]);
        break;
      }
    }
  }
  for (const [x, y, z] of [[Math.floor(rampFoot[0]), n.y + 2, Math.floor(rampFoot[2])], [Math.floor(island[0]), island[1], Math.floor(island[2])], [Math.floor(P[0]), by + 2, Math.floor(P[2])]] as V3[]) {
    if (get(st, x, y, z) === B.AIR) {
      put(st, x, y, z, lb);
      lights.push([x, y, z]);
    }
  }
  // A glow under some of the stalactites' tips (glow-worm threads, a drop of light).
  for (const [x, y, z] of stalactiteTips) {
    if (get(st, x, y, z) === B.AIR) {
      put(st, x, y, z, tipLight);
      lights.push([x, y, z]);
    }
  }
  // 5b. The fall shows by the light round it (a strata fall is lit by its cave): lights out in the air
  // before it, at its lip, halfway down and over its pool, so the water catches them all the way.
  const towardX = (n.x - lipX) / (Math.hypot(n.x - lipX, n.z - lipZ) || 1);
  const towardZ = (n.z - lipZ) / (Math.hypot(n.x - lipX, n.z - lipZ) || 1);
  const fallLights: V3[] = [];
  for (const [out, y] of [[2.2, by + 1], [2.6, Math.round((by + n.y) / 2)], [2.4, n.y + 1], [3.6, n.y + 2]] as Array<[number, number]>) {
    const x = Math.floor(lipX + towardX * out);
    const z = Math.floor(lipZ + towardZ * out);
    if (get(st, x, y, z) !== B.AIR) continue;
    put(st, x, y, z, lb);
    lights.push([x, y, z]);
    fallLights.push([x, y, z]);
  }
  // 5c. The floor reads too: a lower ring along the walls, and soft lights over the lake's shore
  // (a light with no roof in reach floats as a mote of its biome's glow).
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.45;
    for (let r = R - 1.5; r > R - 9; r -= 0.5) {
      const x = Math.floor(n.x + Math.cos(a) * r);
      const z = Math.floor(n.z + Math.sin(a) * r);
      const y = n.y + 3 + (k % 2);
      if (get(st, x, y, z) === B.AIR && get(st, x, y - 1, z) === B.AIR) {
        put(st, x, y, z, lb);
        lights.push([x, y, z]);
        break;
      }
    }
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const r = lakeR + rng.range(2, 4);
    const x = Math.floor(n.x + Math.cos(a) * r);
    const z = Math.floor(n.z + Math.sin(a) * r);
    const y = n.y + 2 + (k % 2);
    if (get(st, x, y, z) === B.AIR && get(st, x, y - 1, z) === B.AIR) {
      put(st, x, y, z, lb);
      lights.push([x, y, z]);
    }
  }

  const falls: FallSite[] = [{ id: `fall_${n.id}`, kind: lava ? 'lava' : 'water', top: [lipX, by - 0.25, lipZ], bottom: [fallX, n.y - 0.2, fallZ], width: 2.4 }];
  void rng;
  return {
    id: `vista_${plan.stratum}`,
    name: VISTA_NAMES[n.biome],
    biome: n.biome,
    centre: [n.x, n.y, n.z],
    radius: R,
    balcony: [P[0], by, P[2]],
    lookout,
    rampFoot,
    falls,
    lakes,
    lights,
    lava,
    rampLamps,
    island,
    stalactites: made,
  };
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** A still-water surface over the cells (VIS's WaterSurfaces: a level and a mask over a box). */
export function lakeOf(id: string, level: number, cells: ReadonlyArray<readonly [number, number]>): LakeDef {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of cells) {
    x0 = Math.min(x0, x);
    z0 = Math.min(z0, z);
    x1 = Math.max(x1, x);
    z1 = Math.max(z1, z);
  }
  const wdt = x1 - x0 + 1;
  const mask = new Uint8Array(wdt * (z1 - z0 + 1));
  for (const [x, z] of cells) mask[(z - z0) * wdt + (x - x0)] = 1;
  return { id, level, min: [x0, z0], max: [x1, z1], mask };
}

/**
 * The underground river: a channel one block deep down the middle of the tunnels on the river's
 * chain (spring to the overlook), pools in its flat chambers, its surface 0.25 below the banks. Lava
 * in the fire stratum, with rock bridges every few metres (a lava channel is never stepped in).
 */
export function carveRiver(st: CarveState, reserved: Reserved, lavaRiver: boolean): { river: RiverSite; lakes: LakeDef[]; falls: FallSite[]; lights: V3[] } | null {
  const plan = st.plan;
  const edges = riverEdges(plan);
  if (!edges.length) return null;
  const w = st.world;
  const points: V3[] = [];
  const lakes: LakeDef[] = [];
  let s = 0;
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k];
    const from = plan.river[k];
    const path = edgePath(plan, e, 0.5);
    const seq = e.a === from ? path : [...path].reverse();
    for (let i = 0; i < seq.length; i++) {
      const [cx, cy, cz] = seq[i];
      s += 0.5;
      const f = Math.round(cy);
      const inChamber = st.chamberOf[Math.floor(cx) + Math.floor(cz) * w.sx] > 0;
      // A lava channel never crosses a chamber (it would cut its floor in two) and keeps bridges.
      if (lavaRiver && (inChamber || s % 7 < 1.5)) continue;
      // Where another tunnel runs alongside (two tunnels leaving a chamber together), no channel: it
      // would leave that tunnel's floor a two-block step above the water.
      if (!inChamber && otherTunnelNear(st, Math.floor(cx), Math.floor(cz), e.id, 3)) continue;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const x = Math.floor(cx) + dx;
        const z = Math.floor(cz) + dz;
        if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > 1.05) continue;
        if (!inZone(st, x, f, z, 3)) continue;
        // The channel only where the tunnel's floor is: air over a solid floor at f - 1.
        if (get(st, x, f, z) !== B.AIR || !SOLID[get(st, x, f - 1, z)]) continue;
        put(st, x, f - 1, z, B.AIR);
        if (!SOLID[get(st, x, f - 2, z)]) put(st, x, f - 2, z, BIOMES[plan.nodes[from].biome].hosts[0]);
        if (lavaRiver) put(st, x, f - 2, z, B.LAVA);
        reserved[x + z * w.sx] = 1;
      }
      if (i % 2 === 0) points.push([cx, f - 0.25, cz]);
    }
  }
  // Pools in the river's chambers (they are flat: the plan keeps them so).
  const poolCells = new Map<number, Array<[number, number]>>();
  const sink = (n: PlanNode, x: number, z: number, cells: Array<[number, number]>) => {
    if (get(st, x, n.y, z) !== B.AIR || !SOLID[get(st, x, n.y - 1, z)]) return;
    put(st, x, n.y - 1, z, B.AIR);
    if (lavaRiver) put(st, x, n.y - 2, z, B.LAVA);
    else if (!SOLID[get(st, x, n.y - 2, z)]) put(st, x, n.y - 2, z, BIOMES[n.biome].hosts[0]);
    cells.push([x, z]);
    reserved[x + z * w.sx] = 1;
  };
  for (const id of plan.river) {
    const n = plan.nodes[id];
    if (!n.river) continue;
    const r = Math.min(n.rx, n.rz) * 0.5;
    const cells: Array<[number, number]> = [];
    for (let z = Math.floor(n.z - r); z <= Math.ceil(n.z + r); z++) for (let x = Math.floor(n.x - r); x <= Math.ceil(n.x + r); x++) {
      if (Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z) > r) continue;
      sink(n, x, z, cells);
    }
    poolCells.set(id, cells);
  }
  // The source: the river pours out of the spring chamber's wall (or its roof's edge), on the side away
  // from its way out, into a lobe of the pool that reaches under it.
  const falls: FallSite[] = [];
  const lights: V3[] = [];
  const sp = plan.nodes[plan.river[0]];
  const nx = plan.nodes[plan.river[1]];
  if (sp && nx && sp.river) {
    const al = Math.hypot(sp.x - nx.x, sp.z - nx.z) || 1;
    const ax = (sp.x - nx.x) / al;
    const az = (sp.z - nx.z) / al;
    // Out from the centre along the floor to the wall (or the floor's edge): the fall's foot just
    // inside it, its top the roof over the foot (water out of the ceiling's edge, 3-12 m up).
    let footR = -1;
    for (let r = 2; r <= Math.max(sp.rx, sp.rz) + 3; r += 0.5) {
      const x = Math.floor(sp.x + ax * r);
      const z = Math.floor(sp.z + az * r);
      // (The pool, already sunk round the centre, counts as floor.)
      if (SOLID[get(st, x, sp.y, z)] || SOLID[get(st, x, sp.y + 1, z)] || (!SOLID[get(st, x, sp.y - 1, z)] && !SOLID[get(st, x, sp.y - 2, z)])) break;
      footR = r;
    }
    let roofY = -1;
    if (footR > 2.5) {
      const x = Math.floor(sp.x + ax * (footR - 0.5));
      const z = Math.floor(sp.z + az * (footR - 0.5));
      for (let y = sp.y + 2; y <= sp.y + 12; y++) if (SOLID[get(st, x, y, z)]) {
        roofY = y;
        break;
      }
    }
    if (footR > 2.5 && roofY >= sp.y + 3) {
      const topY = roofY;
      const fr = footR - 0.5;
      const fx = sp.x + ax * fr;
      const fz = sp.z + az * fr;
      const cells = poolCells.get(sp.id) ?? [];
      for (let s2 = Math.min(sp.rx, sp.rz) * 0.5 - 1; s2 <= fr + 0.6; s2 += 0.5) {
        const cx = sp.x + ax * s2;
        const cz = sp.z + az * s2;
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const x = Math.floor(cx) + dx;
          const z = Math.floor(cz) + dz;
          if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > 1.35 || !inZone(st, x, sp.y, z, 3)) continue;
          sink(sp, x, z, cells);
        }
      }
      poolCells.set(sp.id, cells);
      falls.push({ id: `spring_${sp.id}`, kind: lavaRiver ? 'lava' : 'water', top: [fx, topY - 0.2, fz], bottom: [fx, sp.y - 0.25, fz], width: 1.6 });
      // The fall shows by the light round it: a light over its pool and one halfway up, out in the
      // air before it (the biome's light: its glowing things hang there).
      const lb = lavaRiver ? B.LIGHT_MAGMA : BIOMES[sp.biome].lightBlock;
      for (const [out, y] of [[1.6, sp.y + 1], [1.8, Math.round((topY + sp.y) / 2)]] as Array<[number, number]>) {
        const x = Math.floor(fx - ax * out);
        const z = Math.floor(fz - az * out);
        if (get(st, x, y, z) !== B.AIR) continue;
        put(st, x, y, z, lb);
        lights.push([x, y, z]);
      }
    }
  }
  for (const [id, cells] of poolCells) if (!lavaRiver && cells.length > 4) lakes.push(lakeOf(`river_pool_${id}`, plan.nodes[id].y - 0.25, cells));
  if (points.length < 4) return null;
  const spring = plan.nodes[plan.river[0]];
  const mouth = plan.nodes[plan.river[plan.river.length - 1]];
  return {
    river: { id: `river_${plan.stratum}`, kind: lavaRiver ? 'lava' : 'water', points, width: 2.2, spring: [spring.x, spring.y, spring.z], mouth: [mouth.x, mouth.y, mouth.z] },
    lakes,
    falls,
    lights,
  };
}

/** What the works' stamp leaves for the content pass and the game (WorldFeatures' lock). */
export interface DungeonOut {
  id: string;
  biome: BiomeId;
  puzzle: DungeonPlan['puzzle'];
  /** The entry (feet), the hall's centre, the vault's centre. */
  entry: V3;
  hall: V3;
  vault: V3;
  /** The door's cells (HALDEN_DOOR): air once the lock is open. */
  door: V3[];
  /** One per lever or plate, in order: the socket's lamp cell (air: unset, LIGHT_RUNE: set). */
  sockets: V3[];
  /** Levers: the prop spot (feet) and its facing; plates: the plate's floor cells (feet level above them). */
  levers: Array<{ p: V3; rotY: number }>;
  plates: V3[][];
  /** Where the plate rooms' lamps hang (k lamps over room k's drift: the order), and the hall's lamps. */
  lamps: Array<{ p: V3; anchor: V3 }>;
  /** Reward chests (feet), props along the walls (feet + kind). */
  chests: V3[];
  dressing: Array<{ p: V3; kind: string; rotY: number }>;
  /** The box (plan) for the reserved mask: entry, axis, length, half width. */
  box: { e: [number, number]; dir: [number, number]; length: number; half: number };
  /** Floor materials to lay after the floors pass: x, y, z, block. */
  floorCells: Array<[number, number, number, number]>;
}

/**
 * The Halden works (one per stratum): an axis-aligned complex of timbered drifts entered from the
 * graph, its main hall, two to four side rooms with a lever or a pressure plate each, and an
 * iron-bound door to the reward vault. Stamped after the worms: the box is first filled with rock, so
 * no cave runs into the vault, then carved.
 */
export function stampDungeon(st: CarveState, seed: number, reserved: Reserved): DungeonOut | null {
  const plan = st.plan;
  const d = plan.dungeon;
  if (!d) return null;
  const rng = new Rng(seed ^ 0xd0d6e);
  const w = st.world;
  const n = plan.nodes[d.node];
  const y = n.y;
  const [dx, dz] = d.dir;
  const px = -dz;
  const pz = dx;
  const ex = n.x;
  const ez = n.z;
  const host = BIOMES[n.biome].hosts;
  const cell = (u: number, v: number): [number, number] => [Math.floor(ex + dx * (u + 0.5) + px * (v + 0.5)), Math.floor(ez + dz * (u + 0.5) + pz * (v + 0.5))];
  const at = (u: number, v: number, yy: number): V3 => {
    const [x, z] = cell(u, v);
    return [x + 0.5, yy, z + 0.5];
  };
  const L = d.length;
  const half = d.half;
  // 1. Fill the box with rock (two cells below the floor to six over the roofs).
  for (let u = -1; u <= L; u++) for (let v = -half - 1; v <= half + 1; v++) {
    const [x, z] = cell(u, v);
    for (let yy = y - 2; yy <= y + 7; yy++) put(st, x, yy, z, host[(yy + u) & 1 ? 0 : 1]);
    reserved[x + z * w.sx] = 1;
  }
  const carve = (u0: number, u1: number, v0: number, v1: number, h: number) => {
    for (let u = u0; u <= u1; u++) for (let v = v0; v <= v1; v++) {
      const [x, z] = cell(u, v);
      for (let yy = y; yy < y + h; yy++) put(st, x, yy, z, B.AIR);
      const col = x + z * w.sx;
      if (st.floorY[col] < 0 || y < st.floorY[col]) st.floorY[col] = y;
    }
  };
  // 2. The drifts and rooms.
  carve(-1, 5, -1, 1, 3); // entry drift (the tunnel arrives at u = 0)
  carve(6, 18, -5, 5, 5); // the main hall
  carve(21, 28, -3, 3, 4); // the vault
  type Room = { du0: number; du1: number; v0: number; v1: number; room: [number, number, number, number] };
  const allRooms: Room[] = [
    { du0: 9, du1: 11, v0: -10, v1: -6, room: [7, 13, -16, -11] },
    { du0: 9, du1: 11, v0: 6, v1: 10, room: [7, 13, 11, 16] },
    { du0: 15, du1: 17, v0: -10, v1: -6, room: [15, 20, -16, -11] },
    { du0: 15, du1: 17, v0: 6, v1: 10, room: [15, 20, 11, 16] },
  ];
  const rooms = allRooms.slice(0, Math.max(2, Math.min(4, d.count)));
  for (const r of rooms) {
    carve(r.du0, r.du1, r.v0, r.v1, 3);
    carve(r.room[0], r.room[1], r.room[2], r.room[3], 4);
  }
  // 3. Timber: posts along the hall's walls every 4 m and cap beams; frames in the entry drift.
  const timber = (u: number, v: number, h: number) => {
    const [x, z] = cell(u, v);
    for (let yy = y; yy < y + h; yy++) put(st, x, yy, z, B.BEAM);
  };
  for (let u = 7; u <= 17; u += 4) {
    timber(u, -5, 5);
    timber(u, 5, 5);
    for (let v = -5; v <= 5; v++) {
      const [x, z] = cell(u, v);
      put(st, x, y + 5, z, B.PLANK);
    }
  }
  for (const u of [1, 4]) {
    for (const v of [-2, 2]) {
      const [x, z] = cell(u, v);
      for (let yy = y; yy < y + 3; yy++) put(st, x, yy, z, B.BEAM);
    }
    for (let v = -2; v <= 2; v++) {
      const [x, z] = cell(u, v);
      put(st, x, y + 3, z, B.PLANK);
    }
  }
  // The floor (set after the floors pass, which would turn ballast into the biome's floor): mine
  // ballast in the drifts, tiles in the vault.
  const floorCells: Array<[number, number, number, number]> = [];
  for (let u = -1; u <= 28; u++) for (let v = -16; v <= 16; v++) {
    const [x, z] = cell(u, v);
    if (get(st, x, y, z) !== B.AIR || !SOLID[get(st, x, y - 1, z)]) continue;
    floorCells.push([x, y - 1, z, u >= 21 ? B.ANCIENT_TILE : B.MINE_FLOOR]);
  }
  // 4. The door (two thick, 3 x 3) and the sockets over it (glyph stones, their lamp cells in front).
  const door: V3[] = [];
  for (const u of [19, 20]) for (let v = -1; v <= 1; v++) for (let yy = y; yy < y + 3; yy++) {
    const [x, z] = cell(u, v);
    put(st, x, yy, z, B.HALDEN_DOOR);
    door.push([x, yy, z]);
  }
  const count = rooms.length;
  const sockV = count === 2 ? [-2, 2] : count === 3 ? [-3, 0, 3] : [-4, -2, 2, 4];
  const sockets: V3[] = [];
  for (const v of sockV) {
    const [x, z] = cell(19, v);
    put(st, x, y + 3, z, B.GLYPH_STONE);
    const [lx, lz] = cell(18, v);
    put(st, lx, y + 3, lz, B.AIR);
    sockets.push([lx, y + 3, lz]);
  }
  // 5. The puzzle: a lever at each room's back wall, or a plate in each room's floor.
  const levers: DungeonOut['levers'] = [];
  const plates: V3[][] = [];
  const lamps: DungeonOut['lamps'] = [];
  rooms.forEach((r, k) => {
    const cu = Math.floor((r.room[0] + r.room[1]) / 2);
    const back = r.room[2] < 0 ? r.room[2] : r.room[3];
    const inward = r.room[2] < 0 ? 1 : -1;
    if (d.puzzle === 'levers') {
      const p = at(cu, back, y);
      // Facing out of the back wall (toward the room).
      const rotY = Math.atan2(px * inward, pz * inward);
      levers.push({ p, rotY });
      // From the third stratum a lever room hides behind a cracked wall (mine it to reach the lever).
      if (plan.stratum >= 3 && k === 0) {
        const mv = r.v0 < 0 ? r.v1 : r.v0;
        for (let u = r.du0; u <= r.du1; u++) for (let yy = y; yy < y + 3; yy++) {
          const [x, z] = cell(u, mv);
          put(st, x, yy, z, B.CRACKED_WALL);
        }
      }
      if (plan.stratum >= 5 && k === 1) {
        const mv = r.v0 < 0 ? r.v1 : r.v0;
        for (let u = r.du0; u <= r.du1; u++) for (let yy = y; yy < y + 3; yy++) {
          const [x, z] = cell(u, mv);
          put(st, x, yy, z, B.CRACKED_WALL);
        }
      }
    } else {
      const cv = Math.floor((r.room[2] + r.room[3]) / 2);
      const cells: V3[] = [];
      for (let du = 0; du <= 1; du++) for (let dv = 0; dv <= 1; dv++) {
        const [x, z] = cell(cu + du, cv + dv);
        put(st, x, y - 1, z, B.PRESSURE_PLATE);
        cells.push([x, y - 1, z]);
      }
      plates.push(cells);
      // k + 1 lamps over the room's drift: the order to press the plates in.
      const mv = r.v0 < 0 ? r.v1 : r.v0;
      for (let j = 0; j <= k; j++) {
        const u = r.du0 + (j % 3);
        const vv = mv + (r.v0 < 0 ? -1 - Math.floor(j / 3) : 1 + Math.floor(j / 3));
        const [x, z] = cell(u, vv);
        put(st, x, y + 3, z, B.PLANK);
        lamps.push({ p: [x + 0.5, y + 2.2, z + 0.5], anchor: [x, y + 3, z] });
      }
    }
  });
  // The hall's lamps hang from its cap beams.
  for (const u of [7, 11, 15]) {
    const [x, z] = cell(u, 0);
    lamps.push({ p: [x + 0.5, y + 3.2, z + 0.5], anchor: [x, y + 5, z] });
  }
  // 6. The vault's chests and the works' clutter.
  const chests = [at(25, -2, y), at(25, 2, y), at(27, 0, y)];
  const dressing: DungeonOut['dressing'] = [];
  const rot = Math.atan2(dx, dz);
  for (const [u, v, kind] of [[8, -4, 'crate'], [9, -4, 'barrel'], [16, 4, 'brokenCart'], [13, 4, 'pickaxeRack'], [10, 4, 'crate'], [17, -4, 'ropeCoil'], [3, 1, 'barrel'], [22, -3, 'crate'], [22, 3, 'crate']] as Array<[number, number, string]>) {
    dressing.push({ p: at(u, v, y), kind, rotY: rot + rng.range(-0.3, 0.3) });
  }
  // The track runs down the hall (the rail model's length is its local x: rotY turns +x onto dir).
  for (let u = 7; u <= 17; u += 2) dressing.push({ p: at(u, 0, y), kind: 'rail', rotY: Math.atan2(-dz, dx) });
  return {
    id: `works_${plan.stratum}`,
    biome: n.biome,
    puzzle: d.puzzle,
    entry: at(0, 0, y),
    hall: at(12, 0, y),
    vault: at(24, 0, y),
    door,
    sockets,
    levers,
    plates,
    lamps,
    chests,
    dressing,
    box: { e: [ex, ez], dir: d.dir, length: L, half },
    floorCells,
  };
}

/** Lay the works' floor materials (after the floors pass), except where a plate already sits. */
export function finishDungeon(st: CarveState, d: DungeonOut): void {
  for (const [x, y, z, id] of d.floorCells) {
    const cur = get(st, x, y, z);
    if (cur === B.PRESSURE_PLATE || !SOLID[cur]) continue;
    put(st, x, y, z, id);
  }
}

/** Each biome's set piece (the old world's best rooms come back, and one new room per biome). */
export const SET_PIECES: Record<Exclude<BiomeId, 'heart'>, string> = {
  amberHollows: 'honeycomb',
  mushroomForest: 'grandCap',
  rootGalleries: 'worldRoot',
  floodedGrottoes: 'stillLake',
  crystalGeode: 'geode',
  haldenMines: 'lanternVault',
  frostCaverns: 'frozenFalls',
  glowrootJungle: 'bloomClearing',
  sulphurBog: 'geyserField',
  sunkenCity: 'colonnade',
  magmaVeins: 'emberDeep',
  obsidianAbyss: 'glassGarden',
};
/** A second set piece where a biome has a third cavern (the Crystal Choir in the geode). */
export const SECOND_PIECES: Partial<Record<BiomeId, string>> = { crystalGeode: 'crystalChoir' };

export interface SetPieceOut {
  name: string;
  lights: V3[];
  lakes: LakeDef[];
  /** Spots (feet) the content pass fills: a chest (the piece's reward) and props by kind. */
  chest: V3 | null;
  props: Array<{ p: V3; kind: string; anchor?: V3; rotY?: number }>;
}

/**
 * Stamp a set piece into a cavern (after the floors and the dressing; the cavern's own columns were
 * skipped). Everything stays walkable: features stand on the floor or hang from the roof, pools are
 * one block deep, nothing walls a tunnel's mouth (the corridor columns are kept clear).
 */
export function stampSetPiece(st: CarveState, n: PlanNode, name: string, seed: number, reserved: Reserved): SetPieceOut {
  const rng = new Rng(seed ^ (n.id * 0x9e37));
  const out: SetPieceOut = { name, lights: [], lakes: [], chest: null, props: [] };
  const w = st.world;
  const cx = Math.floor(n.x);
  const cz = Math.floor(n.z);
  const R = Math.min(n.rx, n.rz);
  const floorAt = (x: number, z: number) => floorNear(st, x, n.y, z, 5);
  const clear = (x: number, z: number) => !st.corridor[x + z * w.sx] && !hasCorridorNear(st, x, z, 2);
  const light = (x: number, y: number, z: number, id: number) => {
    if (get(st, x, y, z) === B.AIR) {
      put(st, x, y, z, id);
      out.lights.push([x, y, z]);
    }
  };
  const roofAt = (x: number, y: number, z: number, max = 30) => {
    for (let k = 1; k <= max; k++) if (SOLID[get(st, x, y + k, z)]) return y + k;
    return -1;
  };
  const column = (x: number, z: number, r: number, id: number, cap?: number) => {
    const f = floorAt(x, z);
    if (f < 0) return;
    const roof = roofAt(x, f, z);
    if (roof < 0) return;
    for (let y = f; y < roof; y++) for (let ddz = -Math.ceil(r); ddz <= Math.ceil(r); ddz++) for (let ddx = -Math.ceil(r); ddx <= Math.ceil(r); ddx++) {
      if (ddx * ddx + ddz * ddz > r * r + 0.3) continue;
      putAir(st, x + ddx, y, z + ddz, y === f || y === roof - 1 ? (cap ?? id) : id);
    }
  };
  const spire = (x: number, z: number, h: number, r: number, id: number, tip?: number) => {
    const f = floorAt(x, z);
    if (f < 0) return;
    for (let k = 0; k < h; k++) {
      const rr = r * (1 - k / h);
      const Rr = Math.ceil(rr);
      for (let ddz = -Rr; ddz <= Rr; ddz++) for (let ddx = -Rr; ddx <= Rr; ddx++) if (ddx * ddx + ddz * ddz <= rr * rr + 0.3) putAir(st, x + ddx, f + k, z + ddz, id);
    }
    if (tip !== undefined) putAir(st, x, f + h, z, tip);
  };
  const ring = (count: number, frac: number, fn: (x: number, z: number, a: number, k: number) => void) => {
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const x = Math.floor(n.x + Math.cos(a) * n.rx * frac);
      const z = Math.floor(n.z + Math.sin(a) * n.rz * frac);
      if (clear(x, z)) fn(x, z, a, k);
    }
  };
  const pool = (r: number, id: string, lava = false) => {
    const cells: Array<[number, number]> = [];
    for (let z = cz - Math.ceil(r); z <= cz + Math.ceil(r); z++) for (let x = cx - Math.ceil(r); x <= cx + Math.ceil(r); x++) {
      if (Math.hypot(x + 0.5 - n.x, z + 0.5 - n.z) > r * (1 + 0.15 * st.noise.noise2(x / 5, z / 5))) continue;
      const f = floorAt(x, z);
      if (f < 0 || f !== n.y || st.corridor[x + z * w.sx]) continue;
      put(st, x, f - 1, z, B.AIR);
      if (lava) put(st, x, f - 2, z, B.LAVA);
      else if (!SOLID[get(st, x, f - 2, z)]) put(st, x, f - 2, z, BIOMES[n.biome].floor);
      cells.push([x, z]);
    }
    if (!lava && cells.length > 4) out.lakes.push(lakeOf(id, n.y - 0.2, cells));
    return cells;
  };
  const markReserved = (r: number) => {
    for (let z = cz - Math.ceil(r); z <= cz + Math.ceil(r); z++) for (let x = cx - Math.ceil(r); x <= cx + Math.ceil(r); x++) if (Math.hypot(x - cx, z - cz) <= r && x >= 0 && z >= 0 && x < w.sx && z < w.sz) reserved[x + z * w.sx] = 1;
  };
  const chestNear = (frac: number) => {
    for (let t = 0; t < 30; t++) {
      const a = rng.range(0, Math.PI * 2);
      const x = Math.floor(n.x + Math.cos(a) * R * frac);
      const z = Math.floor(n.z + Math.sin(a) * R * frac);
      const f = floorAt(x, z);
      if (f < 0 || st.corridor[x + z * w.sx] || get(st, x, f, z) !== B.AIR || get(st, x, f + 1, z) !== B.AIR) continue;
      return [x + 0.5, f, z + 0.5] as V3;
    }
    return null;
  };

  switch (name) {
    case 'honeycomb': {
      // Amber Hollows: the walls turn to honeycomb, amber cells glowing in honey sandstone, drips from the roof.
      for (let z = cz - Math.ceil(n.rz) - 2; z <= cz + Math.ceil(n.rz) + 2; z++) for (let x = cx - Math.ceil(n.rx) - 2; x <= cx + Math.ceil(n.rx) + 2; x++) {
        for (let y = n.y; y < n.y + n.ry + 4; y++) {
          const id = get(st, x, y, z);
          if (!isHost(id)) continue;
          // Exposed rock only (a face onto the cavern's air).
          if (get(st, x + 1, y, z) !== B.AIR && get(st, x - 1, y, z) !== B.AIR && get(st, x, y, z + 1) !== B.AIR && get(st, x, y, z - 1) !== B.AIR && get(st, x, y - 1, z) !== B.AIR) continue;
          const hx = ((x * 0.58 + y * 0.33) % 3 + 3) % 3;
          const hz = ((z * 0.58 - y * 0.33) % 3 + 3) % 3;
          put(st, x, y, z, hx < 0.6 || hz < 0.6 ? B.AMBER_SANDSTONE : rng.chance(0.08) ? B.AMBER_ORE : B.AMBER_LIMESTONE);
        }
      }
      ring(10, 0.72, (x, z) => {
        const f = floorAt(x, z);
        if (f > 0) light(x, f + 5, z, B.LIGHT_AMBER);
      });
      ring(16, 0.55, (x, z) => {
        const f = floorAt(x, z);
        const roof = f > 0 ? roofAt(x, f, z) : -1;
        if (roof > 0 && isHost(get(st, x, roof, z))) out.props.push({ p: [x + 0.5, roof, z + 0.5], kind: 'amberDrip', anchor: [x, roof, z] });
      });
      out.chest = chestNear(0.35);
      break;
    }
    case 'grandCap': {
      // Mushroom Forest: one giant cap (the forest's queen tree) over the cavern, its gills glowing.
      const f = floorAt(cx, cz);
      if (f < 0) break;
      const roof = roofAt(cx, f, cz);
      const h = Math.max(6, Math.min((roof > 0 ? roof - f : 14) - 4, 16));
      for (let k = 0; k < h; k++) for (let ddz = -2; ddz <= 2; ddz++) for (let ddx = -2; ddx <= 2; ddx++) if (ddx * ddx + ddz * ddz <= 4.5) putAir(st, cx + ddx, f + k, cz + ddz, B.MUSHROOM_STEM);
      const cr = Math.min(R - 2, 10);
      for (let ddz = -cr; ddz <= cr; ddz++) for (let ddx = -cr; ddx <= cr; ddx++) {
        const dd = Math.hypot(ddx, ddz) / cr;
        if (dd > 1) continue;
        const t = Math.round((1 - dd * dd) * 3);
        for (let k = 0; k <= t; k++) putAir(st, cx + ddx, f + h + k, cz + ddz, (ddx + ddz) % 5 === 0 ? B.MUSHROOM_CAP_MAGENTA : B.MUSHROOM_CAP_TEAL);
      }
      ring(8, 0.3, (x, z, _a, k) => light(x, f + h - 1, z, k % 2 ? B.LIGHT_TEAL : B.LIGHT_MAGENTA));
      ring(12, 0.6, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.5) ? 'mushroomCluster' : 'sporePuff' }));
      markReserved(3);
      out.chest = chestNear(0.45);
      break;
    }
    case 'worldRoot': {
      // Root Galleries: a root as wide as a tower from floor to roof, its branches along the roof.
      column(cx, cz, 3.2, B.THICK_ROOT);
      const f = floorAt(cx + 4, cz);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2;
        let x = cx;
        let z = cz;
        const roof = roofAt(cx + 4, Math.max(1, f), cz);
        const y = roof > 0 ? roof - 1 : n.y + 8;
        for (let s = 0; s < R - 2; s++) {
          x = Math.floor(n.x + Math.cos(a) * s);
          z = Math.floor(n.z + Math.sin(a) * s);
          putAir(st, x, y, z, B.THICK_ROOT);
          putAir(st, x + 1, y, z, B.THICK_ROOT);
          if (s % 3 === 0) putAir(st, x, y - 1, z, B.ROOTS);
        }
      }
      ring(8, 0.55, (x, z) => {
        const ff = floorAt(x, z);
        if (ff > 0) light(x, ff + 3, z, B.LIGHT_GLOWROOT);
      });
      ring(10, 0.7, (x, z) => {
        const ff = floorAt(x, z);
        const roof = ff > 0 ? roofAt(x, ff, z) : -1;
        if (roof > 0) out.props.push({ p: [x + 0.5, roof, z + 0.5], kind: 'hangingRoots', anchor: [x, roof, z] });
      });
      markReserved(4);
      out.chest = chestNear(0.6);
      break;
    }
    case 'stillLake': {
      // Flooded Grottoes (the old world's Still Lake): a wide still lake with a shore of reeds and an islet.
      const cells = pool(R * 0.72, `still_${n.id}`);
      // The islet: a few cells left as floor in the lake, its chest the lake's reward.
      const ix = cx + Math.round(R * 0.15);
      const iz = cz;
      for (let ddz = -1; ddz <= 1; ddz++) for (let ddx = -1; ddx <= 1; ddx++) put(st, ix + ddx, n.y - 1, iz + ddz, BIOMES[n.biome].floor);
      if (out.lakes.length) {
        const lk = out.lakes[out.lakes.length - 1];
        const wdt = lk.max[0] - lk.min[0] + 1;
        for (let ddz = -1; ddz <= 1; ddz++) for (let ddx = -1; ddx <= 1; ddx++) {
          const mx = ix + ddx - lk.min[0];
          const mz = iz + ddz - lk.min[1];
          if (mx >= 0 && mz >= 0 && mx < wdt) lk.mask[mz * wdt + mx] = 0;
        }
      }
      out.chest = [ix + 0.5, n.y, iz + 0.5];
      ring(12, 0.82, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.6) ? 'reeds' : 'shells' }));
      ring(6, 0.5, (x, z) => light(x, n.y + 4, z, B.LIGHT_CYAN));
      void cells;
      break;
    }
    case 'geode': {
      // Crystal Geode (the old world's Geode): the cavern's walls lined with crystal and amethyst, glowing within.
      for (let z = cz - Math.ceil(n.rz) - 2; z <= cz + Math.ceil(n.rz) + 2; z++) for (let x = cx - Math.ceil(n.rx) - 2; x <= cx + Math.ceil(n.rx) + 2; x++) {
        for (let y = n.y - 1; y < n.y + n.ry + 4; y++) {
          const id = get(st, x, y, z);
          if (!isHost(id)) continue;
          if (get(st, x + 1, y, z) !== B.AIR && get(st, x - 1, y, z) !== B.AIR && get(st, x, y, z + 1) !== B.AIR && get(st, x, y, z - 1) !== B.AIR && get(st, x, y + 1, z) !== B.AIR && get(st, x, y - 1, z) !== B.AIR) continue;
          // Floors stay walkable rock; walls and roof turn to crystal.
          if (get(st, x, y + 1, z) === B.AIR && y < n.y + 2) continue;
          const r = rng.next();
          put(st, x, y, z, r < 0.12 ? B.AMETHYST : r < 0.2 ? B.CRYSTAL : B.GEODE_CALCITE);
        }
      }
      ring(9, 0.5, (x, z) => spire(x, z, rng.int(3, 6), 1.2, B.CRYSTAL, B.AMETHYST));
      ring(10, 0.75, (x, z) => {
        const f = floorAt(x, z);
        if (f > 0) light(x, f + 3, z, B.LIGHT_ABYSS);
      });
      out.chest = chestNear(0.3);
      break;
    }
    case 'crystalChoir': {
      // The Crystal Choir: rings of tall crystal pillars, each lit at its foot.
      ring(7, 0.35, (x, z) => column(x, z, 1.1, B.CRYSTAL, B.AMETHYST));
      ring(11, 0.68, (x, z) => column(x, z, 0.9, B.ECHO_CRYSTAL));
      ring(7, 0.52, (x, z) => {
        const f = floorAt(x, z);
        if (f > 0) light(x, f + 1, z, B.LIGHT_ABYSS);
      });
      out.chest = chestNear(0.15);
      break;
    }
    case 'lanternVault': {
      // Old Halden Mines (the old world's Lantern Vault): a lamp hall, rows of lantern posts and supplies.
      ring(10, 0.62, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: 'lanternPost' }));
      ring(6, 0.35, (x, z, a) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.5) ? 'crate' : 'barrel', rotY: a }));
      for (const [ddx, ddz] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
        const f = floorAt(cx + ddx, cz + ddz);
        const roof = f > 0 ? roofAt(cx + ddx, f, cz + ddz) : -1;
        if (roof > 0 && roof - f <= 9) out.props.push({ p: [cx + ddx + 0.5, roof - 1.8, cz + ddz + 0.5], kind: 'hangingLantern', anchor: [cx + ddx, roof, cz + ddz] });
      }
      out.chest = chestNear(0.2);
      break;
    }
    case 'frozenFalls': {
      // Frost Caverns: a frozen waterfall down one wall, a sheet of ice on the floor, icicles everywhere.
      const a = rng.range(0, Math.PI * 2);
      const wx = Math.floor(n.x + Math.cos(a) * (n.rx - 2));
      const wz = Math.floor(n.z + Math.sin(a) * (n.rz - 2));
      const f = floorAt(wx, wz);
      const roof = f > 0 ? roofAt(wx, f, wz) : -1;
      if (f > 0 && roof > 0) {
        for (let y = f; y < roof; y++) {
          const t = (y - f) / Math.max(1, roof - f);
          const wdt = 3 + Math.round(2 * Math.sin(t * Math.PI));
          for (let s = -wdt; s <= wdt; s++) {
            const x = Math.floor(wx - Math.sin(a) * s);
            const z = Math.floor(wz + Math.cos(a) * s);
            if (!clear(x, z)) continue;
            putAir(st, x, y, z, B.FROST_ICE);
            putAir(st, Math.floor(x + Math.cos(a)), y, Math.floor(z + Math.sin(a)), B.FROST_ICE);
          }
        }
        light(Math.floor(wx - Math.cos(a) * 2), f + 2, Math.floor(wz - Math.sin(a) * 2), B.LIGHT_ICE);
      }
      ring(14, 0.6, (x, z) => {
        const ff = floorAt(x, z);
        const rf = ff > 0 ? roofAt(x, ff, z) : -1;
        if (rf > 0) out.props.push({ p: [x + 0.5, rf, z + 0.5], kind: 'icicle', anchor: [x, rf, z] });
      });
      ring(6, 0.4, (x, z) => spire(x, z, rng.int(2, 4), 1, B.ICE_CRYSTAL));
      out.chest = chestNear(0.3);
      break;
    }
    case 'bloomClearing': {
      // Glowroot Jungle: a clearing round one great bloom (vine petals, a light at its heart).
      const f = floorAt(cx, cz);
      if (f < 0) break;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        for (let s = 1; s <= 4; s++) {
          const x = Math.floor(n.x + Math.cos(a) * s);
          const z = Math.floor(n.z + Math.sin(a) * s);
          putAir(st, x, f + Math.floor(s / 2), z, B.GLOW_VINE);
        }
      }
      putAir(st, cx, f, cz, B.JUNGLE_MOSS);
      light(cx, f + 2, cz, B.LIGHT_GLOWROOT);
      ring(12, 0.7, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.5) ? 'fern' : 'glowBulb' }));
      ring(9, 0.55, (x, z) => {
        const ff = floorAt(x, z);
        const rf = ff > 0 ? roofAt(x, ff, z) : -1;
        if (rf > 0) out.props.push({ p: [x + 0.5, rf, z + 0.5], kind: 'vineCurtain', anchor: [x, rf, z] });
      });
      markReserved(4.5);
      out.chest = chestNear(0.5);
      break;
    }
    case 'geyserField': {
      // Sulphur Bog: a field of small toxic pools and vents (the gas hazard, real pockets only).
      for (let k = 0; k < 7; k++) {
        const a = rng.range(0, Math.PI * 2);
        const r = rng.range(0.2, 0.6) * R;
        const px0 = Math.floor(n.x + Math.cos(a) * r);
        const pz0 = Math.floor(n.z + Math.sin(a) * r);
        if (!clear(px0, pz0)) continue;
        const f = floorAt(px0, pz0);
        if (f < 0) continue;
        for (let ddz = -1; ddz <= 1; ddz++) for (let ddx = -1; ddx <= 1; ddx++) if (Math.abs(ddx) + Math.abs(ddz) < 2 && isHost(get(st, px0 + ddx, f - 1, pz0 + ddz))) put(st, px0 + ddx, f - 1, pz0 + ddz, B.TOXIC_POOL);
        out.props.push({ p: [px0 + 2.5, f, pz0 + 0.5], kind: 'gasVent' });
        if (k % 2 === 0) light(px0, f + 1, pz0, B.LIGHT_SULPHUR);
      }
      ring(8, 0.75, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.5) ? 'deadTree' : 'bogBubble' }));
      out.chest = chestNear(0.7);
      break;
    }
    case 'colonnade': {
      // Sunken City: two rows of carved columns down the hall, rune lights between them.
      const a = rng.range(0, Math.PI);
      const along = [Math.cos(a), Math.sin(a)];
      const across = [-Math.sin(a), Math.cos(a)];
      for (let s = -R + 3; s <= R - 3; s += 4) for (const side of [-1, 1]) {
        const x = Math.floor(n.x + along[0] * s + across[0] * side * (R * 0.45));
        const z = Math.floor(n.z + along[1] * s + across[1] * side * (R * 0.45));
        if (!clear(x, z)) continue;
        column(x, z, 0.8, B.CITY_STONE, B.CITY_BRICK);
        const f = floorAt(x, z);
        if (f > 0 && s % 8 === 0) light(Math.floor(x - across[0] * side * 2), f + 3, Math.floor(z - across[1] * side * 2), B.LIGHT_RUNE);
      }
      ring(6, 0.25, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.5) ? 'statue' : 'urn' }));
      out.chest = chestNear(0.2);
      break;
    }
    case 'emberDeep': {
      // Magma Veins (the old world's Ember Deep): a lava pit with ember-glass walls round it.
      const cells = pool(R * 0.38, `ember_${n.id}`, true);
      for (const [x, z] of cells) {
        for (const [ddx, ddz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + ddx;
          const zz = z + ddz;
          if (get(st, xx, n.y, zz) === B.AIR && get(st, xx, n.y - 1, zz) !== B.AIR && !st.corridor[xx + zz * w.sx] && rng.chance(0.25)) put(st, xx, n.y - 1, zz, B.EMBER_GLASS);
        }
      }
      light(cx, n.y + 1, cz, B.LIGHT_MAGMA);
      ring(10, 0.7, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: rng.chance(0.5) ? 'emberVent' : 'charredBones' }));
      ring(6, 0.55, (x, z) => spire(x, z, rng.int(4, 7), 1.3, B.BASALT, B.EMBERITE));
      out.chest = chestNear(0.65);
      break;
    }
    case 'glassGarden': {
      // Obsidian Abyss: a garden of black glass spires tipped with voidshard, violet light at their feet.
      ring(12, 0.6, (x, z) => spire(x, z, rng.int(5, 10), 1.5, B.OBSIDIAN, B.VOIDSHARD));
      ring(6, 0.3, (x, z) => spire(x, z, rng.int(3, 5), 1, B.OBSIDIAN, B.VOIDSHARD));
      ring(8, 0.45, (x, z) => {
        const f = floorAt(x, z);
        if (f > 0) light(x, f + 1, z, B.LIGHT_VOID);
      });
      ring(8, 0.8, (x, z) => out.props.push({ p: [x + 0.5, floorAt(x, z), z + 0.5], kind: 'glassShard' }));
      out.chest = chestNear(0.15);
      break;
    }
    default:
      break;
  }
  return out;
}

/** Another tunnel's walking line (not edge `edge`'s) within r cells of (x, z). */
function otherTunnelNear(st: CarveState, x: number, z: number, edge: number, r: number): boolean {
  const { sx, sz } = st.world;
  const eo = st.edgeOf;
  if (!eo) return false;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx;
    const zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= sx || zz >= sz) continue;
    const v = eo[xx + zz * sx];
    if (v && v !== edge + 1 && st.chamberOf[xx + zz * sx] === 0) return true;
  }
  return false;
}

/**
 * A walking line within r cells of (x, z), other than chamber `n`'s own lines across its floor (from
 * its centre to its mouths): a crack in a chamber's floor may run beside those (the floor is wide), not
 * through a mouth or a tunnel.
 */
function walkLineNear(st: CarveState, x: number, z: number, r: number, n: PlanNode): boolean {
  const { sx, sz } = st.world;
  const inner = Math.max(n.rx, n.rz) * 0.8;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx;
    const zz = z + dz;
    if (xx < 0 || zz < 0 || xx >= sx || zz >= sz || !st.corridor[xx + zz * sx]) continue;
    if (st.chamberOf[xx + zz * sx] === n.id + 1 && Math.hypot(xx + 0.5 - n.x, zz + 0.5 - n.z) < inner) continue;
    return true;
  }
  return false;
}

/** Chamber n's own columns within r cells of (x, z) (its wall: the guard's dilated band round it). */
function nearChamber(st: CarveState, x: number, z: number, n: PlanNode, r: number): boolean {
  const { sx, sz } = st.world;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx;
    const zz = z + dz;
    if (xx >= 0 && zz >= 0 && xx < sx && zz < sz && st.chamberOf[xx + zz * sx] === n.id + 1) return true;
  }
  return false;
}

function hasCorridorNear(st: CarveState, x: number, z: number, r: number): boolean {
  const { sx, sz } = st.world;
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const xx = x + dx;
    const zz = z + dz;
    if (xx >= 0 && zz >= 0 && xx < sx && zz < sz && st.corridor[xx + zz * sx]) return true;
  }
  return false;
}

/** A ravine: a crack down from a chamber's floor to a dead-end pocket, with a rope to climb back up. */
export interface RavineOut {
  id: string;
  biome: BiomeId;
  /** The top of the rope (feet on the chamber floor) and the pocket at the bottom (feet). */
  top: V3;
  bottom: V3;
  rope: V3[];
}

/**
 * Ravines (BRIEF §0.1: natural ravines lead down into dead-end pockets only): per biome one or two
 * narrow cracks from a chamber's rim down 10-18 m to a pocket, a low lip round the opening, and a
 * generated rope (ROPE cells: climbable) from the pocket to the rim. Never across a tunnel's way.
 */
export function carveRavines(st: CarveState, seed: number, reserved: Reserved): RavineOut[] {
  const plan = st.plan;
  const rng = new Rng(seed ^ 0x7a71e);
  const w = st.world;
  const out: RavineOut[] = [];
  for (const biome of plan.biomes) {
    const want = BIOMES[biome].shape.shafts >= 0.3 ? 2 : 1;
    // Every chamber of the biome high enough for a drop, in a shuffled order, each tried in sixteen
    // directions round its wall (a crack needs rock clear of every tunnel, gallery and curated place).
    const hosts = plan.nodes.filter((n) => n.biome === biome && (n.kind === 'cavern' || n.kind === 'room') && !n.river && n.role === null && n.y >= 21);
    for (let i = hosts.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [hosts[i], hosts[j]] = [hosts[j], hosts[i]];
    }
    const tries: Array<[PlanNode, number]> = [];
    const turn = rng.range(0, Math.PI * 2);
    for (const n of hosts) for (let k = 0; k < 16; k++) tries.push([n, turn + (k / 16) * Math.PI * 2]);
    const used = new Set<number>();
    for (const [n, a] of tries) {
      if (out.filter((r) => r.biome === biome).length >= want) break;
      if (used.has(n.id)) continue;
      const ux = Math.cos(a);
      const uz = Math.sin(a);
      const startR = Math.max(n.rx, n.rz) * 0.55;
      const len = rng.range(10, 16);
      const depth = Math.min(n.y - 6, rng.int(10, 16));
      if (depth < 9) continue;
      // Check the crack's columns: in rock or this chamber, no tunnel's line near, not reserved.
      let ok = true;
      for (let s = 0; s <= len && ok; s += 1) {
        const x = Math.floor(n.x + ux * (startR + s));
        const z = Math.floor(n.z + uz * (startR + s));
        if (!inZone(st, x, 2, z, 6)) ok = false;
        else if (walkLineNear(st, x, z, 3, n) || reserved[x + z * w.sx]) ok = false;
        else {
          const ch = st.chamberOf[x + z * w.sx];
          if (ch && ch !== n.id + 1) ok = false;
          // Outside its chamber the crack runs in rock: no floor of the plan there (but the chamber's
          // own rim band, which the guard dilates, is its wall).
          if (!ch && st.floorY[x + z * w.sx] >= 0 && !nearChamber(st, x, z, n, 3)) ok = false;
        }
      }
      // The pocket at its far end stays in rock too (it never opens into a passage's floor).
      const px0 = n.x + ux * (startR + len);
      const pz0 = n.z + uz * (startR + len);
      for (let dz = -4; dz <= 4 && ok; dz++) for (let dx = -4; dx <= 4 && ok; dx++) {
        const x = Math.floor(px0) + dx;
        const z = Math.floor(pz0) + dz;
        if (!inZone(st, x, 2, z, 4)) ok = false;
        else if (reserved[x + z * w.sx] || (st.floorY[x + z * w.sx] >= 0 && st.chamberOf[x + z * w.sx] !== n.id + 1)) ok = false;
      }
      if (!ok) continue;
      // Carve: a 2-3 m wide crack, its floor falling from the rim to the pocket.
      const bottomY = n.y - depth;
      for (let s = 0; s <= len; s += 0.5) {
        const cx = n.x + ux * (startR + s);
        const cz = n.z + uz * (startR + s);
        // A disc of at least 1.05 m round the crack's line: the floor at its foot is one walk (a band
        // two cells wide whatever its heading, never cells that meet at a corner only).
        const wdt = Math.max(1.05, 0.95 + 0.45 * Math.sin((s / len) * Math.PI) + 0.3 * st.noise.noise2(cx / 4, cz / 4));
        for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
          const x = Math.floor(cx) + dx;
          const z = Math.floor(cz) + dz;
          if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) > wdt) continue;
          // Nothing behind the crack's start: the chamber's floor there is the rope's landing.
          if ((x + 0.5 - (n.x + ux * startR)) * ux + (z + 0.5 - (n.z + uz * startR)) * uz < -0.3) continue;
          for (let y = bottomY; y < n.y + 3; y++) if (y < n.y || get(st, x, y, z) !== B.AIR) put(st, x, y, z, B.AIR);
          reserved[x + z * w.sx] = 1;
        }
      }
      // The pocket at the far end.
      used.add(n.id);
      const ex = n.x + ux * (startR + len);
      const ez = n.z + uz * (startR + len);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        if (dx * dx + dz * dz > 9) continue;
        for (let y = bottomY; y < bottomY + 4; y++) put(st, Math.floor(ex) + dx, y, Math.floor(ez) + dz, B.AIR);
        reserved[Math.floor(ex) + dx + (Math.floor(ez) + dz) * w.sx] = 1;
      }
      // The bottom is solid ground.
      for (let s = -1; s <= len + 3; s += 0.5) for (let k = -4; k <= 4; k++) {
        const x = Math.floor(n.x + ux * (startR + s) - uz * k * 0.6);
        const z = Math.floor(n.z + uz * (startR + s) + ux * k * 0.6);
        if (!SOLID[get(st, x, bottomY - 1, z)]) put(st, x, bottomY - 1, z, BIOMES[biome].hosts[0]);
      }
      // A low lip round the opening (one block: stepped over on purpose, not walked off by mistake),
      // open at the crack's near end, where the rope comes up.
      for (let s = 2.5; s <= len; s += 0.5) for (const k of [-3, 3]) {
        const x = Math.floor(n.x + ux * (startR + s) - uz * k * 0.6);
        const z = Math.floor(n.z + uz * (startR + s) + ux * k * 0.6);
        if (get(st, x, n.y, z) === B.AIR && SOLID[get(st, x, n.y - 1, z)] && !st.corridor[x + z * w.sx]) put(st, x, n.y, z, BIOMES[biome].hosts[1]);
      }
      // The rope: against the crack's near wall, from the pocket's floor to the rim.
      const rx = Math.floor(n.x + ux * (startR + 0.6));
      const rz = Math.floor(n.z + uz * (startR + 0.6));
      const rope: V3[] = [];
      for (let y = bottomY; y < n.y + 1; y++) {
        if (get(st, rx, y, rz) === B.AIR) {
          put(st, rx, y, rz, B.ROPE);
          rope.push([rx, y, rz]);
        }
      }
      // The landing at the rope's top: the chamber's floor just behind the crack's start, two cells
      // clear to head height (the climber steps off there), kept clear of every later pass.
      // The two cells behind the rope (back toward the chamber), face to face with it.
      const [bx, bz] = Math.abs(ux) >= Math.abs(uz) ? [-Math.sign(ux), 0] : [0, -Math.sign(uz)];
      const landing: Array<[number, number]> = [
        [rx + bx, rz + bz],
        [rx + 2 * bx, rz + 2 * bz],
      ];
      for (const [x, z] of landing) {
        if (x === rx && z === rz) continue;
        if (!SOLID[get(st, x, n.y - 1, z)]) put(st, x, n.y - 1, z, BIOMES[biome].hosts[0]);
        for (let y = n.y; y <= n.y + 2; y++) put(st, x, y, z, B.AIR);
        reserved[x + z * w.sx] = 1;
      }
      // Its anchor stone beside the rope's top (to the side: the landing stays open).
      const sxA = Math.floor(rx - uz * 1.6);
      const szA = Math.floor(rz + ux * 1.6);
      if ((sxA !== rx || szA !== rz) && !landing.some(([x, z]) => x === sxA && z === szA) && SOLID[get(st, sxA, n.y - 1, szA)]) putAir(st, sxA, n.y, szA, BIOMES[biome].hosts[1]);
      out.push({ id: `ravine_${n.id}_${out.length}`, biome, top: [rx + 0.5, n.y, rz + 0.5], bottom: [ex, bottomY, ez], rope });
    }
  }
  return out;
}
