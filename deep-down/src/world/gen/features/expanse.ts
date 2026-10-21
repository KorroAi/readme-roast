import { B } from '../../../config/blocks';
import { isMinable } from '../../../config/rarity';
import { untrap } from '../../analysis/traps';
import { VoxelWorld } from '../../VoxelWorld';
import type { Region } from '../types';
import type { FeatureBuilder } from './index';
import type { FeatureLayout, FeatureLinkId, LakeDef, V3 } from './types';

/**
 * The expanse (round 2, WORLD): the world grows vast, open and non-linear around the first
 * version's route, carved into rock the earlier passes left solid.
 *
 * - **The Root Galleries** (beside the camp, through a door in its west wall): five rooms of root
 *   tangles and loose stone on a loop, the stone and fibre the first recipes need; a cracked wall
 *   in the last one hides **the Geode**, a hollow lined with gem pockets.
 * - **The Sounding Shaft**: from the galleries' far room a rope drops 38 m to a ledge, a second
 *   rope 36 m more to the shore of the Still Lake.
 * - **The Still Lake**: a shallow mirror under a dome, an island with a Halden chest, and a long
 *   low window slot in its west wall over **the Deep**, black water nobody can reach, where the
 *   Deep Worm passes (MOBS: `layout.features.worm`). A climbing passage joins the lake to the
 *   Hollow's west floor: the loop camp -> galleries -> shaft -> lake -> Hollow -> stairs -> camp.
 * - **The Lantern Vault**: a shaft 65 m tall north of the Hollow, with two balconies on its walls
 *   and a pool on its floor. The top balcony opens west to the tunnel, the middle one south to
 *   the grand stair's landing, the floor south to the Hollow's north floor; ropes join the
 *   balconies to the floor.
 *
 * Every write lies inside a declared box (the containment test), nothing touches the camp box, and
 * every new place is reachable by walking and the rides (no free digging: the reachability tests).
 */
export function buildExpanse(b: FeatureBuilder): void {
  galleries(b);
  // The lake before the shaft: the lower rope's foot stands on the lake floor.
  stillLake(b);
  soundingShaft(b);
  lanternVault(b);
  underhall(b);
}

// ---------------------------------------------------------------------------------------------
// Carving helpers (each place tracks the bounding box of its writes, declared at the end).

class Place {
  private min: V3 = [Infinity, Infinity, Infinity];
  private max: V3 = [-Infinity, -Infinity, -Infinity];
  constructor(
    readonly b: FeatureBuilder,
    readonly id: string,
  ) {}

  private grow(x: number, y: number, z: number): void {
    if (x < this.min[0]) this.min[0] = x;
    if (y < this.min[1]) this.min[1] = y;
    if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x;
    if (y > this.max[1]) this.max[1] = y;
    if (z > this.max[2]) this.max[2] = z;
  }

  carve(x: number, y: number, z: number): void {
    if (!this.b.isAir(x, y, z)) {
      this.grow(x, y, z);
      this.b.carve(x, y, z);
    }
  }

  put(x: number, y: number, z: number, id: number): void {
    if (this.b.get(x, y, z) === id) return;
    this.grow(x, y, z);
    this.b.put(x, y, z, id);
  }

  /** Make sure a floor cell is solid (natural rock), so a carve over a void keeps its floor. */
  floor(x: number, y: number, z: number, id: number = B.SLATE): void {
    if (this.b.isAir(x, y, z)) this.put(x, y, z, id);
  }

  /** A domed room: an ellipse rx x rz on a floor at `feet`, `h` tall at its centre, noisy edges. */
  dome(cx: number, feet: number, cz: number, rx: number, rz: number, h: number, opts: { mounds?: boolean; floorId?: number } = {}): void {
    const n = this.b.noise;
    for (let z = Math.floor(cz - rz - 2); z <= cz + rz + 2; z++)
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const e = ((x + 0.5 - cx) / rx) ** 2 + ((z + 0.5 - cz) / rz) ** 2 + n.noise2(x * 0.21, z * 0.21) * 0.18;
        if (e >= 1) continue;
        const f = feet + (opts.mounds && n.noise2(x * 0.09 + 7, z * 0.09 - 3) > 0.42 && e < 0.8 ? 1 : 0);
        const top = f + Math.max(2, Math.round(h * Math.sqrt(1 - e) + n.noise2(x * 0.3 - 11, z * 0.3) * 1.2));
        for (let y = f; y <= top; y++) this.carve(x, y, z);
        this.floor(x, f - 1, z, opts.floorId);
      }
  }

  /**
   * A walkable passage along feet points: a disc of radius w/2 swept every 0.3 m, `h` cells tall
   * over the (floored) feet height. Slopes up to 1:1 become 1 m steps.
   */
  tube(pts: V3[], w = 2.6, h = 3): void {
    const r = w / 2;
    const n = this.b.noise;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1];
      const c = pts[k];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
      const steps = Math.max(1, Math.ceil(len / 0.3));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = a[0] + (c[0] - a[0]) * t;
        const py = a[1] + (c[1] - a[1]) * t;
        const pz = a[2] + (c[2] - a[2]) * t;
        const feet = Math.floor(py + 1e-6);
        const R = Math.ceil(r) + 1;
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++) {
            const x = Math.floor(px) + dx;
            const z = Math.floor(pz) + dz;
            const d = Math.hypot(x + 0.5 - px, z + 0.5 - pz);
            if (d > r + n.noise3(x * 0.4, py * 0.4, z * 0.4) * 0.35) continue;
            const hh = h + (d < r * 0.5 ? 1 : 0);
            for (let y = feet; y < feet + hh; y++) this.carve(x, y, z);
            this.floor(x, feet - 1, z);
          }
      }
    }
  }

  done(): void {
    if (this.max[0] >= this.min[0]) this.b.box(this.id, [...this.min] as V3, [...this.max] as V3);
  }
}

/** Feet height of the floor in column (x, z) at or below `y` (the first open cell over solid ground). */
function floorAt(b: FeatureBuilder, x: number, z: number, y: number): number {
  let fy = Math.floor(y) + 2;
  while (fy > 1 && !(b.isAir(x, fy, z) && b.isAir(x, fy + 1, z) && b.solid(x, fy - 1, z))) fy--;
  return fy;
}

/** Grow `n` cells of `id` over exposed plain rock round `at` (within r), facing open air. @returns cells placed. */
function vein(p: Place, at: V3, id: number, n: number, r = 2.5): V3[] {
  const b = p.b;
  const host = (x: number, y: number, z: number) => {
    const c = b.get(x, y, z);
    return c === B.SLATE || c === B.DEEP_SLATE || c === B.UMBER || c === B.SOIL || c === B.GRAVEL || c === B.MOSS;
  };
  const open = (x: number, y: number, z: number) => b.isAir(x + 1, y, z) || b.isAir(x - 1, y, z) || b.isAir(x, y, z + 1) || b.isAir(x, y, z - 1) || b.isAir(x, y - 1, z);
  const cand: V3[] = [];
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++)
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const x = Math.floor(at[0]) + dx;
        const y = Math.floor(at[1]) + dy;
        const z = Math.floor(at[2]) + dz;
        if (Math.hypot(dx, dy, dz) > r || !host(x, y, z) || !open(x, y, z)) continue;
        // Never a floor cell (no pits): only walls and roofs.
        if (b.isAir(x, y + 1, z) && b.isAir(x, y + 2, z)) continue;
        cand.push([x, y, z]);
      }
  cand.sort((u, v) => Math.hypot(u[0] - at[0], u[1] - at[1], u[2] - at[2]) - Math.hypot(v[0] - at[0], v[1] - at[1], v[2] - at[2]));
  const out: V3[] = [];
  for (const c of cand) {
    if (out.length >= n) break;
    p.put(c[0], c[1], c[2], id);
    out.push(c);
  }
  return out;
}

/**
 * A heap of loose stone against a wall: a low mound on the floor (each cell has two open cells
 * over it, so a heap is a step, never a wall across the way).
 */
function heap(p: Place, cx: number, feet: number, cz: number, r: number): number {
  const b = p.b;
  let n = 0;
  for (let dz = -Math.ceil(r); dz <= Math.ceil(r); dz++)
    for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const x = Math.floor(cx) + dx;
      const z = Math.floor(cz) + dz;
      const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
      if (d > r) continue;
      const f = floorAt(b, x, z, feet + 1);
      if (Math.abs(f - feet) > 1 || !b.isAir(x, f + 1, z) || !b.isAir(x, f + 2, z) || !b.isAir(x, f, z)) continue;
      p.put(x, f, z, B.RUBBLE);
      n++;
      // A second course at the heart of a big heap, against the wall (three open cells over it).
      if (d < r * 0.4 && r >= 1.6 && b.isAir(x, f + 3, z)) {
        p.put(x, f + 1, z, B.RUBBLE);
        n++;
      }
    }
  return n;
}

/** A rope ride: from a stand at the top, out over `over`, down to the floor below. */
function rope(p: Place, id: FeatureLinkId, top: V3, over: [number, number], bottomFeet: number, rotY: number): void {
  const b = p.b;
  const bottom: V3 = [over[0], floorAt(b, Math.floor(over[0]), Math.floor(over[1]), bottomFeet + 1), over[1]];
  const lift = top[1] + 1.5;
  const path: V3[] = [top, [top[0], lift, top[2]], [over[0], lift, over[1]], [over[0], bottom[1] + 0.6, over[1]], bottom];
  // A long drop runs faster (the winch lets the rope run), so no ride lasts more than about 6.5 s.
  let length = 0;
  for (let k = 1; k < path.length; k++) length += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1], path[k][2] - path[k - 1][2]);
  const pace = (length + 2 * 1.2) / 6.4;
  b.layout.links.push({ id, kind: 'rope', top, bottom, path, speedDown: Math.max(4.6, pace), speedUp: Math.max(4.2, pace) });
  // The winch stands behind the stand and to its side, so the view down the drop stays clear.
  const wx = top[0] - Math.sin(rotY) * 1.3 + Math.cos(rotY) * 1.0;
  const wz = top[2] - Math.cos(rotY) * 1.3 - Math.sin(rotY) * 1.0;
  b.prop(p.id, { kind: 'hoistWinch', x: wx, y: top[1], z: wz, rotY, anchor: [Math.floor(wx), top[1] - 1, Math.floor(wz)], variant: [1, 2], interact: 'feature', feature: { kind: 'rope', id, end: 'top' } });
  b.beam(`f_${p.id}_${id}`, [over[0] + 0.28, lift - 0.1, over[1]], [over[0] + 0.28, bottom[1] + 0.25, over[1]], 0.06, 0.06);
  b.beam(`f_${p.id}_${id}_tie`, [over[0] + 0.28, lift - 0.1, over[1]], [wx, top[1] + 0.55, wz], 0.06, 0.06);
  b.prop(p.id, { kind: 'ropeCoil', x: over[0] + 0.6, y: bottom[1], z: over[1] + 0.5, rotY: 0.4, anchor: [Math.floor(over[0] + 0.6), bottom[1] - 1, Math.floor(over[1] + 0.5)], interact: 'feature', feature: { kind: 'rope', id, end: 'bottom' } });
  b.lamp(p.id, top[0] + Math.cos(rotY) * 1.2, top[1], top[2] - Math.sin(rotY) * 1.2, rotY, B.LIGHT_LAMP);
}

// ---------------------------------------------------------------------------------------------
// 1. The Root Galleries (beside the camp, at its level): stone and fibre for the first recipes.

function galleries(b: FeatureBuilder): void {
  // Two boxes, so neither overlaps the camp's: the west wing (x <= 22) and the south wing (z >= 55).
  const w = new Place(b, 'galleries.west');
  const p = new Place(b, 'galleries.south');
  // G0, through the door in the camp's west wall (carved by generateWorld at x 22..26).
  w.tube([[21, 101, 40.5], [16, 101, 41]], 2.6, 3);
  w.dome(13, 101, 41, 7, 8.5, 6, { mounds: true });
  w.tube([[13, 101, 48], [12, 100, 55.5]], 2.8, 3);
  // G1: the root room.
  w.dome(12, 100, 61, 8, 6.5, 6.5, { mounds: true, floorId: B.SOIL });
  p.tube([[17, 100, 64], [23, 99, 69]], 2.6, 3);
  // G2: the scree hall, the biggest.
  p.dome(27, 99, 73, 9.5, 7, 8);
  p.tube([[31, 99, 77], [37, 98, 82]], 2.6, 3);
  // G3: the shaft head.
  p.dome(40, 98, 84.5, 7, 7.5, 7);
  p.tube([[24, 99, 77], [17, 99, 83]], 2.4, 3);
  // G4: the quiet room, and the loop back to G3.
  p.dome(14, 99, 87.5, 6, 6, 5.5, { mounds: true });
  p.tube([[19, 99, 89], [34, 98, 89]], 2.4, 3);
  // Root tangles in the walls and roofs of G0, G1 and G4 (fibre), loose stone heaps in G0, G2, G3.
  const roots: V3[] = [];
  for (const at of [[7, 103, 37], [19, 103, 45], [6, 102, 60], [12, 104, 64], [5, 101, 64], [17, 103, 60]] as V3[]) roots.push(...vein(w, at, B.ROOTS, 4));
  for (const at of [[10, 102, 92], [19, 101, 85], [28, 101, 67]] as V3[]) roots.push(...vein(p, at, B.ROOTS, 4));
  let stone = 0;
  for (const [x, z, r] of [[8, 36, 1.7], [18, 47, 1.3]] as Array<[number, number, number]>) stone += heap(w, x + 0.5, floorAt(b, x, z, 102), z + 0.5, r);
  for (const [x, z, r] of [[20, 70, 1.8], [33, 69, 1.6], [34, 78, 1.4], [44, 89, 1.5], [36, 80, 1.2], [9, 84, 1.3]] as Array<[number, number, number]>) {
    stone += heap(p, x + 0.5, floorAt(b, x, z, 102), z + 0.5, r);
  }
  // Copper in the scree hall's back wall, iron low in G3 (it needs the copper pick).
  for (const at of [[22, 100, 66], [33, 101, 66], [18, 100, 77]] as V3[]) vein(p, at, B.COPPER_ORE, 3);
  vein(p, [46, 99, 86], B.IRON_ORE, 3);
  // Lamps: one per room (warm), the Halden's work lights.
  b.lamp('galleries', 15.5, 101, 37.5, 0.4);
  b.lamp('galleries', 9.5, 100, 63.5, 2.2);
  b.lamp('galleries', 27.5, 99, 77.5, 0.0);
  b.lamp('galleries', 23.5, 99, 68.5, 0.9);
  b.lamp('galleries', 37.5, 98, 88.5, 1.2);
  b.lamp('galleries', 15.5, 99, 91.5, 2.8);
  // A Halden work camp in the scree hall: crates, a cart, a rope.
  b.prop('galleries', { kind: 'brokenCart', x: 29.5, y: floorAt(b, 29, 74, 100), z: 74.5, rotY: 0.6 });
  b.prop('galleries', { kind: 'crate', x: 24.6, y: floorAt(b, 24, 75, 100), z: 75.4, rotY: 0.2, interact: 'feature', feature: { kind: 'cache', id: 'f_galleries_crate' }, loot: { stone: 4, rootFibre: 2 } });
  b.prop('galleries', { kind: 'pickaxeRack', x: 21.5, y: floorAt(b, 21, 72, 100), z: 72.5, rotY: 1.2 });
  // The Geode beyond G4's south wall: a crawl from the room, closed by a cracked mouth (loose
  // masonry), into a hollow lined with gems.
  const geo: V3 = [6.5, 99, 97.5];
  const inGeode = (x: number, y: number, z: number) => Math.hypot((x + 0.5 - geo[0]) / 3.3, (y + 0.5 - (geo[1] + 1.5)) / 3, (z + 0.5 - geo[2]) / 3.3) < 1;
  const crawl: Array<[number, number]> = [];
  for (let z = 88; z <= 97; z++) crawl.push([14, z]);
  for (let x = 13; x >= 7; x--) crawl.push([x, 97]);
  const mouth: V3[] = [];
  for (const [x, z] of crawl) {
    if (inGeode(x, 99, z)) break;
    const wasRock = b.solid(x, 99, z) && b.solid(x, 100, z);
    p.carve(x, 99, z);
    p.carve(x, 100, z);
    p.floor(x, 98, z);
    if (wasRock && mouth.length < 4) mouth.push([x, 99, z], [x, 100, z]);
  }
  // The first two rock cells of the crawl (two courses each) are the cracked mouth.
  for (const [x, y, z] of mouth.slice(0, 4)) p.put(x, y, z, B.CRUMBLING_BRICK);
  for (let z = 94; z <= 101; z++)
    for (let y = 99; y <= 104; y++)
      for (let x = 3; x <= 10; x++) if (inGeode(x, y, z)) p.carve(x, y, z);
  for (let z = 94; z <= 101; z++) for (let x = 3; x <= 10; x++) if (b.isAir(x, 99, z)) p.floor(x, 98, z);
  // Gems round the hollow's walls and its roof (echo crystal stays the rift's: tests/unit/rift.test.ts).
  const gems = vein(p, [geo[0], geo[1] + 1.5, geo[2]], B.GEM_ORE, 8, 3.6);
  gems.push(...vein(p, [geo[0], geo[1] + 4, geo[2]], B.GEM_ORE, 6, 4.2));
  b.prop('galleries', { kind: 'chest', x: geo[0], y: floorAt(b, Math.floor(geo[0]), Math.floor(geo[2]), 100), z: geo[2], rotY: 1.2, scale: 0.85, interact: 'feature', feature: { kind: 'cache', id: 'f_geode_chest' }, loot: { glimmerShard: 2, copperOre: 2 }, secret: 'f_geode_chest' });
  b.moths('geode', [geo[0], geo[1] + 2, geo[2]], 6, 1.4);
  if (mouth.length) b.moths('geode.slit', [mouth[0][0] + 0.5, 100.2, mouth[0][2] - 0.5], 3, 0.6, true);
  b.discovery('galleries', [4, 97, 30], [22, 106, 52]);
  b.discovery('geode', [3, 98, 94], [10, 104, 101]);
  b.layout.areas.push({ id: 'galleries', p: [24, 99, 70], r: 22 }, { id: 'geode', p: geo, r: 4 });
  b.landmark('galleries', [27, 99, 73]);
  b.landmark('geode', geo);
  b.poi('galleries.hall', [27, 100.5, 73], 'sight');
  b.poi('galleries.cart', [29.5, 100, 74.5], 'sight');
  b.poi('galleries.crate', [24.6, 100, 75.4], 'pickup');
  for (const [k, g] of gems.entries()) if (k < 2) b.poi(`geode.gem${k}`, [g[0] + 0.5, g[1] + 0.5, g[2] + 0.5], 'pickup');
  b.poi('geode.chest', [geo[0], 99.5, geo[2]], 'pickup');
  b.layout.eventSites.push({ id: 'galleries.fall', p: [27, 99, 72], r: 1.6, tag: 'rockfall' }, { id: 'galleries.bloom', p: [40, 98, 85], r: 6, tag: 'migration' });
  void roots;
  void stone;
  w.done();
  p.done();
}

// ---------------------------------------------------------------------------------------------
// 2. The Sounding Shaft: two ropes from the galleries to the Still Lake, a ledge between them.

function soundingShaft(b: FeatureBuilder): void {
  const p = new Place(b, 'shaft');
  const cx = 44.5;
  const cz = 80.5;
  for (let y = 25; y <= 98; y++)
    for (let z = Math.floor(cz - 3); z <= cz + 3; z++)
      for (let x = Math.floor(cx - 3); x <= cx + 3; x++) {
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        if (d > 2.6 + b.noise.noise3(x * 0.3, y * 0.15, z * 0.3) * 0.4) continue;
        // Below the ledge (feet 60) the west half stays rock: the ledge stands on it.
        if (y < 60 && x < 45) continue;
        p.carve(x, y, z);
      }
  // The ledge: a little cave off the shaft's west side at feet 60, with a lamp and a cache.
  p.dome(41.5, 60, 80.5, 3.2, 2.6, 3.2);
  b.lamp('shaft', 40.5, 60, 79.5, 0.8);
  b.prop('shaft', { kind: 'chest', x: 40.2, y: 60, z: 81.8, rotY: 1.4, scale: 0.85, interact: 'feature', feature: { kind: 'cache', id: 'f_shaft_chest' }, loot: { ironOre: 2, glimmerShard: 1, copperOre: 2 } });
  // Rope 1: from the shaft's lip in the galleries (feet 98) down to the ledge.
  rope(p, 'shaftRopeHigh', [41.5, 98, 80.5], [43.5, 80.5], 60, Math.PI / 2);
  // Rope 2: from the ledge's lip down to the lake shore.
  rope(p, 'shaftRopeLow', [43.5, 60, 81.5], [46.5, 81.5], 24, Math.PI / 2);
  b.poi('shaft.ledge', [41.5, 61, 80.5], 'sight');
  b.poi('shaft.chest', [40.2, 60.5, 81.8], 'pickup');
  b.landmark('shaftTop', [41.5, 98, 80.5]);
  b.landmark('shaftLedge', [41.5, 60, 80.5]);
  p.done();
}

// ---------------------------------------------------------------------------------------------
// 3. The Still Lake and the Deep beyond its window; the passage up to the Hollow's west floor.

const LAKE_FEET = 24;
const LAKE_LEVEL = LAKE_FEET + 0.3;

function stillLake(b: FeatureBuilder): void {
  const p = new Place(b, 'lake');
  const cx = 34;
  const cz = 88;
  // The shallows: a flat stone floor under 0.3 m of still water; west of x 20 stays rock (the wall).
  const n = b.noise;
  for (let z = cz - 18; z <= cz + 18; z++)
    for (let x = 20; x <= cx + 18; x++) {
      const e = ((x + 0.5 - cx) / 16) ** 2 + ((z + 0.5 - cz) / 15) ** 2 + n.noise2(x * 0.19, z * 0.19) * 0.15;
      if (e >= 1) continue;
      const top = LAKE_FEET + Math.max(3, Math.round(15 * Math.sqrt(1 - e) + n.noise2(x * 0.25, z * 0.25 + 5) * 1.5));
      for (let y = LAKE_FEET; y <= top; y++) p.carve(x, y, z);
      p.put(x, LAKE_FEET - 1, z, (x + z) % 5 === 0 ? B.GRAVEL : B.SLATE);
    }
  // The island: a low mound of two courses with a Halden chest on it (a step out of the water).
  for (let z = 83; z <= 93; z++)
    for (let x = 27; x <= 37; x++) {
      const d = Math.hypot(x + 0.5 - 32, z + 0.5 - 88);
      if (d < 4.6) p.put(x, LAKE_FEET, z, B.MOSS);
      if (d < 2.4) p.put(x, LAKE_FEET + 1, z, B.MOSS);
    }
  // The Deep: x 4..17, its water at the same level, its floor twelve metres down; nobody reaches it.
  for (let z = 72; z <= 104; z++)
    for (let x = 3; x <= 17; x++) {
      const e = ((x + 0.5 - 10.5) / 7.5) ** 2 + ((z + 0.5 - 88) / 16) ** 2 + n.noise2(x * 0.2 + 3, z * 0.2) * 0.12;
      if (e >= 1) continue;
      const top = LAKE_FEET + Math.round(16 * Math.sqrt(1 - e));
      for (let y = 12; y <= top; y++) p.carve(x, y, z);
    }
  // The window: a slot one metre tall in the wall x 18..19, over a parapet one metre high, so the
  // eye (1.62 m) looks through and nobody can stand in it.
  for (let z = 80; z <= 96; z++) for (const x of [18, 19]) p.carve(x, LAKE_FEET + 1, z);
  // The passage up to the Hollow's west floor (reachable at x 72..75, feet 43, z 76..80).
  p.tube([[49, 24, 86], [54, 27, 84], [59, 31, 82], [64, 36, 80], [68, 40, 79], [73.5, 43, 78.5]], 2.6, 3);
  // Light: warm lamps on the shore and the island; in the Deep a faint green-gold glow (bioluminescence,
  // not the cold budget) so its water reads through the window.
  b.lamp('lake', 46.5, LAKE_FEET, 85.5, 2.6, B.LIGHT_LAMP, true);
  b.lamp('lake', 21.5, LAKE_FEET, 88.5, 1.6, B.LIGHT_LAMP, true);
  b.lamp('lake', 33.5, LAKE_FEET + 2, 87.5, 0.3, B.LIGHT_EMBER, true);
  for (const [x, y, z] of [[9, 14, 82], [12, 14, 95], [8, 20, 89]] as V3[]) b.keyLight(x, y, z, B.LIGHT_GLOWROOT);
  b.prop('lake', { kind: 'chest', x: 31.5, y: LAKE_FEET + 2, z: 88.6, rotY: 0.9, scale: 0.95, interact: 'feature', feature: { kind: 'cache', id: 'f_lake_chest' }, loot: { glimmerShard: 2, ironOre: 2, echoShard: 1 }, secret: 'f_lake_chest' });
  b.prop('lake', { kind: 'brokenCart', x: 44.5, y: LAKE_FEET, z: 95.5, rotY: 2.2 });
  b.prop('lake', { kind: 'barrel', x: 23.2, y: LAKE_FEET, z: 84.4, rotY: 0.4 });
  // Ore and gems in the shore walls.
  for (const at of [[44, 26, 75], [26, 26, 101], [48, 26, 93]] as V3[]) vein(p, at, B.IRON_ORE, 3);
  vein(p, [36, 27, 103], B.GEM_ORE, 3, 3);
  for (const [x, z, r] of [[45, 90, 1.4], [25, 79, 1.3]] as Array<[number, number, number]>) heap(p, x + 0.5, LAKE_FEET, z + 0.5, r);
  // The water: one still level over the shallows and the Deep (VIS draws it; MOBS' worm rises in the Deep).
  const lake: LakeDef = { id: 'stillLake', level: LAKE_LEVEL, min: [3, 70], max: [52, 106], mask: new Uint8Array((52 - 3 + 1) * (106 - 70 + 1)) };
  for (let z = 70; z <= 106; z++)
    for (let x = 3; x <= 52; x++) {
      const y = LAKE_FEET;
      const wet = b.isAir(x, y, z) && (b.solid(x, y - 1, z) || b.isAir(x, y - 1, z)) && !(x >= 18 && x <= 19);
      if (wet) lake.mask[(z - 70) * (52 - 3 + 1) + (x - 3)] = 1;
    }
  (b.layout.lakes ??= []).push(lake);
  b.layout.worm = [[4, LAKE_LEVEL - 2, 76], [10, LAKE_LEVEL + 1.5, 86], [12, LAKE_LEVEL + 2, 92], [6, LAKE_LEVEL - 2, 102]];
  b.discovery('lake', [20, 23, 73], [50, 34, 103]);
  b.layout.areas.push({ id: 'lake', p: [34, LAKE_FEET, 88], r: 16 });
  b.landmark('lake', [34, LAKE_FEET, 88]);
  b.landmark('lakeWindow', [20.5, LAKE_FEET, 88.5]);
  b.poi('lake.island', [32, LAKE_FEET + 2, 88], 'sight');
  b.poi('lake.window', [20.5, LAKE_FEET + 1.5, 88.5], 'sight');
  b.poi('lake.chest', [31.5, LAKE_FEET + 2.5, 88.6], 'pickup');
  b.poi('lake.climb', [64, 37, 80], 'sight');
  b.layout.blooms.push({ id: 'bloom.lake', p: [41.5, LAKE_FEET, 99.5], rotY: 0.7, area: 'lake' });
  b.layout.eventSites.push({ id: 'lake.geyser', p: [27.5, LAKE_FEET, 95.5], r: 2, tag: 'geyser' }, { id: 'lake.migration', p: [34, LAKE_FEET + 4, 88], r: 10, tag: 'migration' });
  p.done();
}

// ---------------------------------------------------------------------------------------------
// 4. The Lantern Vault: 65 m of shaft north of the Hollow, balconies, ropes, a pool.

const VAULT = { cx: 130, cz: 30, rx: 16, rz: 15, floor: 43, roof: 108, mid: 65, top: 92 };

function lanternVault(b: FeatureBuilder): void {
  const p = new Place(b, 'vault');
  const { cx, cz, rx, rz, floor, roof, mid, top } = VAULT;
  const n = b.noise;
  for (let z = cz - rz - 3; z <= cz + rz + 3; z++)
    for (let x = cx - rx - 3; x <= cx + rx + 3; x++) {
      const ux = (x + 0.5 - cx) / rx;
      const uz = (z + 0.5 - cz) / rz;
      const ang = Math.atan2(uz, ux);
      for (let y = floor; y <= roof; y++) {
        // The walls lean in toward the dome over the top balcony.
        const dome = y > top + 4 ? Math.sqrt(Math.max(0, 1 - ((y - top - 4) / (roof - top - 4)) ** 2)) : 1;
        const e = Math.hypot(ux, uz) / dome + n.noise3(x * 0.12, y * 0.08, z * 0.12) * 0.09;
        if (e >= 1) continue;
        // The middle balcony (south, toward the landing): rock out to 6 m in from the wall below feet 65,
        // undercut under a slab four metres thick.
        const south = ang > Math.PI * 0.3 && ang < Math.PI * 0.7;
        if (south && e > 1 - 6 / rz && y < mid && y >= mid - 4) continue;
        // The top balcony (west, toward the tunnel): five metres deep, a slab four thick.
        const west = Math.abs(Math.abs(ang) - Math.PI) < Math.PI * 0.2;
        if (west && e > 1 - 5 / rx && y < top && y >= top - 4) continue;
        p.carve(x, y, z);
      }
      // The floor, with a shallow pool in the middle (one step down, water 0.3 m).
      const r = Math.hypot(ux, uz);
      if (r < 1) {
        p.floor(x, floor - 1, z);
        if (r < 0.28 + n.noise2(x * 0.3, z * 0.3) * 0.05) {
          p.carve(x, floor - 1, z);
          p.put(x, floor - 2, z, B.SLATE);
        }
      }
    }
  // Passages: the floor south to the Hollow's north floor; the middle balcony south to the stair
  // landing; the top balcony west to the tunnel by the first crystals.
  p.tube([[127, 43, 44], [123, 43, 52], [117.5, 43, 60.5]], 2.8, 3.2);
  p.tube([[124, 65, 41], [123, 65, 52], [122.5, 65, 60], [122.5, 65, 67.5]], 2.6, 3.2);
  p.tube([[116, 92, 30.5], [104, 93, 34], [92, 94, 40], [84, 95, 46], [79.5, 96, 50.5]], 2.6, 3.2);
  // Ropes: the top balcony to the floor (49 m), the middle balcony to the floor (22 m).
  rope(p, 'vaultRopeHigh', [117.5, top, 30.5], [120.5, 30.5], floor, Math.PI / 2);
  rope(p, 'vaultRopeLow', [130.5, mid, 41.5], [130.5, 36], floor, Math.PI);
  // Light: a brazier on each balcony (seen from the floor, far below), lamps round the pool.
  b.prop('vault', { kind: 'campfire', x: 116.5, y: top, z: 26.5, emitters: [[116, top, 26]], light: B.LIGHT_EMBER });
  b.prop('vault', { kind: 'campfire', x: 135.5, y: mid, z: 42.5, emitters: [[135, mid, 42]], light: B.LIGHT_EMBER });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    b.lamp('vault', cx + Math.cos(a) * 7.2, floor, cz + Math.sin(a) * 6.8, a + Math.PI / 2);
  }
  // Lamps along both balconies' edges: seen from the floor far below, they mark the height.
  for (const z of [24.5, 33.5, 37.5]) b.lamp('vault', 118.5, top, z, Math.PI / 2);
  for (const x of [125.5, 132.5, 138.5]) b.lamp('vault', x, mid, 41.5, Math.PI);
  // The Halden's vault camp on the floor, and finds on the balconies.
  b.prop('vault', { kind: 'bedroll', x: 138.5, y: floor, z: 24.5, rotY: 0.8 });
  b.prop('vault', { kind: 'crate', x: 140.2, y: floor, z: 27.1, rotY: 0.3, interact: 'feature', feature: { kind: 'cache', id: 'f_vault_crate' }, loot: { ironOre: 2, copperOre: 2, stone: 3 } });
  b.prop('vault', { kind: 'chest', x: 114.8, y: top, z: 34.0, rotY: 1.3, interact: 'feature', feature: { kind: 'cache', id: 'f_vault_chest' }, loot: { glimmerShard: 3, ironOre: 2 } });
  for (const at of [[146, 46, 30], [114, 47, 26], [135, 47, 16], [126, 68, 46], [140, 67, 44]] as V3[]) vein(p, at, B.IRON_ORE, 3, 3);
  for (const at of [[145, 45, 31], [127, 67, 45]] as V3[]) vein(p, at, B.GEM_ORE, 2, 3);
  vein(p, [113, 95, 28], B.LANTERNSTONE, 2, 3);
  for (const [x, z, r] of [[142, 34, 1.6], [120, 40, 1.4], [133, 17, 1.5]] as Array<[number, number, number]>) heap(p, x + 0.5, floor, z + 0.5, r);
  // The pool's water.
  const pool: LakeDef = { id: 'vaultPool', level: floor - 1 + 0.3, min: [cx - 6, cz - 6], max: [cx + 6, cz + 6], mask: new Uint8Array(13 * 13) };
  for (let z = cz - 6; z <= cz + 6; z++) for (let x = cx - 6; x <= cx + 6; x++) if (b.isAir(x, floor - 1, z) && b.solid(x, floor - 2, z)) pool.mask[(z - cz + 6) * 13 + (x - cx + 6)] = 1;
  (b.layout.lakes ??= []).push(pool);
  b.discovery('vault', [115, 42, 15], [145, 70, 45]);
  b.layout.areas.push({ id: 'vault', p: [cx, floor, cz], r: 16 });
  b.landmark('vault', [cx, floor, cz]);
  b.landmark('vaultTop', [117.5, top, 30.5]);
  b.landmark('vaultMid', [130.5, mid, 41.5]);
  b.poi('vault.pool', [cx, floor, cz], 'landmark');
  b.poi('vault.topFire', [116.5, top + 0.5, 26.5], 'landmark');
  b.poi('vault.midFire', [135.5, mid + 0.5, 42.5], 'landmark');
  b.poi('vault.camp', [139.5, floor + 0.5, 25.5], 'sight');
  b.poi('vault.chest', [114.8, top + 0.5, 34], 'pickup');
  b.layout.blooms.push({ id: 'bloom.vault', p: [124.5, floor, 20.5], rotY: 1.9, area: 'vault' });
  b.layout.eventSites.push(
    { id: 'vault.fall', p: [125.5, floor, 36.5], r: 1.6, tag: 'rockfall' },
    { id: 'vault.geyser', p: [136.5, floor, 33.5], r: 2, tag: 'geyser' },
    { id: 'vault.migration', p: [cx, floor + 12, cz], r: 12, tag: 'migration' },
  );
  p.done();
}

// ---------------------------------------------------------------------------------------------
// 4b. The Underhall: a stone forest under the galleries, split by a chasm with a natural bridge; it
// joins the Still Lake (south) and the Halden Yard (east), another loop round the Hollow.

const UNDER = { feet: 21, x0: 8, x1: 56, z0: 16, z1: 60, chasmZ: 37, bridgeX: [29, 32] as [number, number] };

function underhall(b: FeatureBuilder): void {
  const p = new Place(b, 'underhall');
  const { feet, x0, x1, z0, z1, chasmZ, bridgeX } = UNDER;
  const n = b.noise;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2;
  const rz = (z1 - z0) / 2;
  // Pillars: a loose grid of natural columns, floor to roof, never on the bridge or the chasm.
  const pillars: Array<[number, number, number]> = [];
  for (let gz = z0 + 5; gz <= z1 - 4; gz += 9)
    for (let gx = x0 + 5; gx <= x1 - 4; gx += 9) {
      const px = gx + n.noise2(gx * 0.7, gz * 0.7) * 2.5;
      const pz = gz + n.noise2(gz * 0.7 + 9, gx * 0.7) * 2.5;
      if (Math.abs(pz - chasmZ) < 5) continue;
      pillars.push([px, pz, 1.4 + (n.noise2(px, pz) + 1) * 0.6]);
    }
  for (let z = z0 - 2; z <= z1 + 2; z++)
    for (let x = x0 - 2; x <= x1 + 2; x++) {
      const e = ((x + 0.5 - cx) / rx) ** 4 + ((z + 0.5 - cz) / rz) ** 4 + n.noise2(x * 0.15, z * 0.15) * 0.25;
      if (e >= 1) continue;
      const pillar = pillars.some(([px, pz, r]) => Math.hypot(x + 0.5 - px, z + 0.5 - pz) < r);
      const top = feet + Math.round(7 + 3 * (1 - e) + n.noise2(x * 0.22 + 4, z * 0.22) * 1.5);
      const chasm = Math.abs(z + 0.5 - chasmZ) < 2.2 + n.noise2(x * 0.3, 1.7) * 0.6 && !(x >= bridgeX[0] && x <= bridgeX[1]);
      const f = feet + (!chasm && n.noise2(x * 0.11 - 3, z * 0.11) > 0.5 ? 1 : 0);
      for (let y = chasm ? 9 : f; y <= top; y++) {
        // A pillar flares at its foot and its head.
        const flare = y - f < 2 || top - y < 2 ? 0.7 : 0;
        if (pillars.some(([px, pz, r]) => Math.hypot(x + 0.5 - px, z + 0.5 - pz) < r + flare)) continue;
        p.carve(x, y, z);
      }
      if (!chasm && !pillar) p.floor(x, f - 1, z);
    }
  // The bridge's deck stays rock; under it the chasm runs on (an arch).
  for (let x = bridgeX[0]; x <= bridgeX[1]; x++)
    for (let z = chasmZ - 3; z <= chasmZ + 2; z++) {
      p.floor(x, feet - 1, z);
      for (let y = 9; y < feet - 3; y++) p.carve(x, y, z);
    }
  // Passages: south to the Still Lake's north shore, east up to the Halden Yard's floor.
  p.tube([[31, 21, 58], [32, 22, 64], [33, 23, 69], [34, 24, 75]], 2.6, 3);
  p.tube([[55, 21, 46], [62, 25, 51], [69, 30, 56], [76, 36, 60], [81, 40, 63], [86.5, 42, 65.5]], 2.6, 3.2);
  // Light: the stone forest's own green-gold moss glow, warm lamps at the bridge and the passages.
  for (const [px, pz] of pillars.filter((_, k) => k % 2 === 0)) b.keyLight(Math.floor(px) + 2, feet + 2, Math.floor(pz), B.LIGHT_GLOWROOT);
  for (const [x, y] of [[30, 12], [44, 12], [16, 12]]) b.keyLight(x, y, chasmZ, B.LIGHT_GLOWROOT);
  b.lamp('underhall', bridgeX[0] - 0.5, feet, chasmZ - 3.5, 0.2);
  b.lamp('underhall', bridgeX[1] + 1.5, feet, chasmZ + 3.5, 3.3);
  b.lamp('underhall', 31.5, feet, 55.5, 1.1);
  b.lamp('underhall', 52.5, feet, 45.5, 2.0);
  // The Halden's survey camp in the north half, finds in the walls and on the floor.
  b.prop('underhall', { kind: 'campfire', x: 24.5, y: feet, z: 24.5, emitters: [[24, feet, 24]], light: B.LIGHT_EMBER });
  b.prop('underhall', { kind: 'bedroll', x: 22.4, y: feet, z: 26.6, rotY: 0.5 });
  b.prop('underhall', { kind: 'crate', x: 26.8, y: feet, z: 22.4, rotY: 0.2, interact: 'feature', feature: { kind: 'cache', id: 'f_underhall_crate' }, loot: { ironOre: 2, stone: 3, rootFibre: 2 } });
  b.prop('underhall', { kind: 'brokenCart', x: 44.5, y: feet, z: 49.5, rotY: 1.3 });
  for (const at of [[9, 23, 30], [54, 23, 25], [12, 23, 52], [50, 23, 56], [36, 23, 17]] as V3[]) vein(p, at, B.IRON_ORE, 3, 3);
  for (const at of [[10, 23, 44], [47, 23, 18]] as V3[]) vein(p, at, B.LANTERNSTONE, 2, 3);
  for (const at of [[20, 25, 17], [40, 25, 58]] as V3[]) vein(p, at, B.ROOTS, 3, 3);
  vein(p, [55, 24, 33], B.GEM_ORE, 2, 3);
  for (const [x, z, r] of [[14, 22, 1.5], [46, 28, 1.4], [20, 50, 1.5], [38, 54, 1.3]] as Array<[number, number, number]>) heap(p, x + 0.5, feet, z + 0.5, r);
  b.discovery('underhall', [x0, feet - 1, z0], [x1, feet + 8, z1]);
  b.layout.areas.push({ id: 'underhall', p: [cx, feet, cz], r: 22 });
  b.landmark('underhall', [30.5, feet, chasmZ]);
  b.poi('underhall.bridge', [30.5, feet + 0.5, chasmZ], 'landmark');
  b.poi('underhall.camp', [24.5, feet + 0.5, 24.5], 'sight');
  b.poi('underhall.crate', [26.8, feet + 0.5, 22.4], 'pickup');
  b.layout.blooms.push({ id: 'bloom.underhall', p: [17.5, feet, 47.5], rotY: 2.4, area: 'underhall' });
  b.layout.eventSites.push(
    { id: 'underhall.fall', p: [40.5, feet, 27.5], r: 1.6, tag: 'rockfall' },
    { id: 'underhall.geyser', p: [18.5, feet, 28.5], r: 2, tag: 'geyser' },
    { id: 'underhall.migration', p: [30.5, feet + 3, chasmZ], r: 12, tag: 'migration' },
  );
  // The worm may pass under the bridge too (a second glimpse, MOBS).
  p.done();
}

// ---------------------------------------------------------------------------------------------
// 5. No traps: the pick cannot dig a way out any more, so every pit a walk can drop into (or a
// player can mine open) is filled until a walk leads home from every reachable cell.

/** The world as a player can open it: every barrier and minable block, and the rune doors, as air. */
function openCopy(w: VoxelWorld, doors: ReadonlyArray<{ cells: V3[] }>): VoxelWorld {
  const copy = new VoxelWorld(w.sx, w.sy, w.sz, w.chunkSize);
  copy.blocks.set(w.blocks);
  const minable = new Uint8Array(256);
  for (let id = 0; id < 256; id++) if (isMinable(id, 4)) minable[id] = 1;
  const ob = copy.blocks;
  for (let i = 0; i < ob.length; i++) if (minable[ob[i]]) ob[i] = B.AIR;
  for (const d of doors) for (const [x, y, z] of d.cells) ob[copy.index(x, y, z)] = B.AIR;
  return copy;
}

function keepCells(w: VoxelWorld, F: FeatureLayout): Set<number> {
  const keep = new Set<number>();
  for (const s of F.living) for (const i of s.cells) keep.add(i);
  for (const d of F.runeDoors) for (const [x, y, z] of [...d.cells, ...d.lintel]) keep.add(w.index(x, y, z));
  return keep;
}

/** The trap pass of the feature pass (its fills are declared in the box 'untrap'). */
export function untrapFeatures(b: FeatureBuilder): void {
  const { spawn, camp } = b.ctx;
  if (!spawn || !camp) return;
  const p = new Place(b, 'untrap');
  const F = b.layout;
  const open = openCopy(b.w, F.runeDoors);
  untrap(b.w, open, [Math.floor(spawn.x), Math.floor(spawn.y) + 1, Math.floor(spawn.z)], F.links, camp, {
    keep: keepCells(b.w, F),
    props: b.ctx.props,
    fill: B.SLATE,
    put: (x, y, z, id) => p.put(x, y, z, id),
  });
  p.done();
}

/** The same after the content pass (its veins and heaps), on the finished world. */
export function untrapWorld(w: VoxelWorld, spawn: { x: number; y: number; z: number }, camp: Region, F: FeatureLayout, props: ReadonlyArray<{ x: number; y: number; z: number }>): Array<[number, number, number]> {
  const open = openCopy(w, F.runeDoors);
  return untrap(w, open, [Math.floor(spawn.x), Math.floor(spawn.y) + 1, Math.floor(spawn.z)], F.links, camp, { keep: keepCells(w, F), props, fill: B.SLATE });
}
