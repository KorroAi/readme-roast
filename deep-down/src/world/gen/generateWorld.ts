import { B, SOLID, isEmitter } from '../../config/blocks';
import { WORLD } from '../../config/balance';
import { Noise } from '../../core/noise';
import { Rng } from '../../core/rng';
import { VoxelWorld } from '../VoxelWorld';
import type { PropSpec, Region, WorldLayout } from './types';

/**
 * Authored-procedural generation of the first expedition zone.
 *
 * The composition is designed, not random: a cozy broken camp near the top, a winding
 * descent tunnel marked by lanterns, the reveal of the Lantern Hollow from a high ledge,
 * monumental ancient stairs down to a colonnaded processional way, a hidden shrine behind
 * crumbling masonry, a violet-lit chasm that glimpses a rift far below, and a sealed temple
 * gate that the first pickaxe upgrade opens. Noise only adds natural irregularity to that plan.
 *
 * The builders' architecture has one vocabulary, shaped for 1 m voxels instead of faked with
 * brick textures: battered (stepped-out) bases, framed recessed panels, corbelled openings and
 * vaults, octagonal columns with plinths, base rings, capitals and square abaci, and single-
 * course inscription friezes. Cyan is punctuation: three inscriptions placed where the story
 * is (the sealed gate, the shrine and its door), crystals as faceted clusters on dark host rock.
 * Warm light belongs to the explorers who came before: lamps mark every landing and crossing.
 *
 * Everything is deterministic for a given seed.
 */

type V3 = [number, number, number];
type Cells = Array<[number, number]>;

export interface GenTimings {
  totalMs: number;
  phases: Record<string, number>;
}

export function generateWorld(seed: number = WORLD.seed): WorldLayout & { timings: GenTimings } {
  const t0 = performance.now();
  const phases: Record<string, number> = {};
  let tp = t0;
  const mark = (name: string) => {
    const now = performance.now();
    phases[name] = Math.round((now - tp) * 10) / 10;
    tp = now;
  };

  const w = new VoxelWorld(WORLD.sizeX, WORLD.sizeY, WORLD.sizeZ, WORLD.chunkSize);
  const noise = new Noise(seed);
  const detail = new Noise(seed ^ 0x51a7e);
  const rng = new Rng(seed);
  // Independent streams: architecture and geology details never shift the layout stream.
  const archRng = rng.fork(0xa4c1);
  const geoRng = rng.fork(0x9e01);
  const props: PropSpec[] = [];
  const discoveries: Region[] = [];
  const landmarks: Record<string, V3> = {};
  let propSeq = 0;
  const discCache = new Map<number, Cells>();
  const plateCache = new Map<number, Cells>();

  const { sx, sy, sz } = w;
  const interior = (x: number, y: number, z: number) => x > 0 && y > 0 && z > 0 && x < sx - 1 && y < sy - 1 && z < sz - 1;
  const carve = (x: number, y: number, z: number) => {
    if (!interior(x, y, z)) return;
    const i = w.index(x, y, z);
    // Never erase a light already placed by an earlier feature (lamps are open space anyway).
    const cur = w.blocks[i];
    if (!SOLID[cur] && isEmitter(cur)) return;
    w.blocks[i] = B.AIR;
  };
  const put = (x: number, y: number, z: number, id: number) => {
    if (interior(x, y, z)) w.blocks[w.index(x, y, z)] = id;
  };
  const get = (x: number, y: number, z: number) => w.get(x, y, z);
  const isAir = (x: number, y: number, z: number) => !SOLID[w.get(x, y, z)];
  const isRock = (id: number) => id === B.SLATE || id === B.DEEP_SLATE || id === B.UMBER || id === B.GRAVEL || id === B.SOIL || id === B.MOSS;
  const exposed6 = (x: number, y: number, z: number) =>
    isAir(x + 1, y, z) || isAir(x - 1, y, z) || isAir(x, y + 1, z) || isAir(x, y - 1, z) || isAir(x, y, z + 1) || isAir(x, y, z - 1);

  const addProp = (p: Omit<PropSpec, 'id' | 'seed' | 'emitters' | 'rotY' | 'scale' | 'anchor'> & Partial<PropSpec>): PropSpec => {
    const spec: PropSpec = {
      id: `${p.kind}_${propSeq++}`,
      rotY: 0,
      scale: 1,
      anchor: [Math.floor(p.x), Math.floor(p.y) - 1, Math.floor(p.z)],
      emitters: [],
      seed: rng.int(0, 1 << 30),
      ...p,
    };
    for (const [ex, ey, ez] of spec.emitters) {
      const light = spec.kind === 'campfire' ? B.LIGHT_EMBER : spec.kind === 'crystalCluster' ? B.LIGHT_CYAN : B.LIGHT_AMBER;
      if (isAir(ex, ey, ez)) put(ex, ey, ez, light);
    }
    props.push(spec);
    return spec;
  };
  const setEmitter = (x: number, y: number, z: number, id: number) => {
    if (isAir(x, y, z)) put(x, y, z, id);
  };

  // ------------------------------------------------------------------------------------
  // 1. Base rock. Beds dip gently to the south-east, so strata cross walls on a slant instead
  // of ringing them in flat bands: thick umber beds near the top, thin marker beds in the
  // deep slate of the Hollow walls.
  {
    const blocks = w.blocks;
    const strideZ = sx * sy;
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const strataOffset = noise.fbm2(x * 0.02, z * 0.02, 2) * 6;
        const deepLine = 56 + noise.fbm2(x * 0.03 + 40, z * 0.03, 2) * 6;
        const dip = x * 0.11 - z * 0.07 + strataOffset;
        const thick = 1.25 + noise.fbm2(x * 0.05 + 11, z * 0.05, 1) * 0.9;
        const edge = x === 0 || z === 0 || x === sx - 1 || z === sz - 1;
        // Phase of the bedding at y = 0; it advances by one per block upward.
        let band = ((dip % 11) + 11) % 11;
        let marker = (((dip * 0.6) % 17) + 17) % 17;
        let i = x + strideZ * z;
        for (let y = 0; y < sy; y++, i += sx) {
          let id: number;
          if (edge || y === 0 || y === sy - 1) id = B.BEDROCK;
          else if (y < deepLine) id = y > 44 && marker < 0.75 ? B.UMBER : B.DEEP_SLATE;
          else id = y > 80 && band < thick ? B.UMBER : B.SLATE;
          blocks[i] = id;
          if (++band >= 11) band -= 11;
          if (++marker >= 17) marker -= 17;
        }
      }
  }
  // Gravel and umber pockets break up large walls.
  for (let i = 0; i < 90; i++) {
    const c: V3 = [rng.int(4, sx - 5), rng.int(8, sy - 9), rng.int(4, sz - 5)];
    const r = rng.range(1.5, 3.5);
    const id = rng.chance(0.6) ? B.GRAVEL : B.UMBER;
    blob(c, r, (x, y, z) => {
      const cur = get(x, y, z);
      if (cur === B.SLATE || cur === B.DEEP_SLATE) put(x, y, z, id);
    });
  }
  mark('baseRock');

  // ------------------------------------------------------------------------------------
  // 2. The Lantern Hollow: a vast chamber, wide at the floor, domed above. Its walls carry the
  // geology at room scale: strata ledges with undercut lips, buttress ribs, erosion pockets.
  const H = { cx: 104, cy: 70, cz: 100, rx: 44, ry: 32, rz: 46 };
  const floorBase = 41;
  const hollowField = (x: number, y: number, z: number) => {
    let hy = (y - H.cy) / H.ry;
    if (hy < 0) hy *= 0.6; // squash the lower half: broad floor, near-vertical lower walls
    const dx = (x - H.cx) / H.rx;
    const dz = (z - H.cz) / H.rz;
    return Math.sqrt(dx * dx + hy * hy + dz * dz);
  };
  const floorHeight = (x: number, z: number) => {
    const n = noise.fbm2(x * 0.045, z * 0.045, 2);
    const terraces = Math.round(n * 2.2);
    const dx = (x - H.cx) / H.rx;
    const dz = (z - H.cz) / H.rz;
    const rim = Math.max(0, Math.sqrt(dx * dx + dz * dz) - 0.7) * 14;
    return floorBase + terraces + Math.round(rim);
  };
  for (let z = H.cz - H.rz - 2; z <= H.cz + H.rz + 2; z++)
    for (let x = H.cx - H.rx - 2; x <= H.cx + H.rx + 2; x++) {
      const fh = floorHeight(x, z);
      const ax = (x - H.cx) / H.rx;
      const az = (z - H.cz) / H.rz;
      const hd = Math.hypot(ax, az) || 1e-6;
      // Position around the wall on the unit circle: seam-free coordinates for wall features.
      const ux = (ax / hd) * 3.4;
      const uz = (az / hd) * 3.4;
      const ledgeMask = Math.min(1, Math.max(0, noise.noise3(ux * 0.6 + 3.1, uz * 0.6 - 1.7, 2.5) * 1.6 + 0.45));
      const ledgeDip = (x - H.cx) * 0.09 - (z - H.cz) * 0.05;
      // The east and west walls hide the deep gate and the shrine: never erode them outward.
      const guard = x > 126 || x < 70;
      // Rib noise varies slowly with height: sample it every 4 blocks and interpolate.
      let ribY = -1;
      let ribA = 0;
      let ribB = 0;
      for (let y = fh; y <= H.cy + H.ry + 2; y++) {
        const e = hollowField(x, y, z);
        if (e > 1.22) continue;
        if (e < 0.71) {
          carve(x, y, z);
          continue;
        }
        let n = noise.fbm3(x * 0.055, y * 0.07, z * 0.055, 2) * 0.13;
        if (y > fh + 2) {
          // Erosion pockets: the hollows of the wall noise are scooped out deeper.
          if (n < -0.035 && !(guard && y < floorBase + 14)) n += (n + 0.035) * 0.9;
          // Strata ledges: each 7.5 m bed ends in a shelf that juts out with a sloping underside.
          const t = (y + ledgeDip) / 7.5;
          const f = t - Math.floor(t);
          if (f > 0.72) n += ((f - 0.72) / 0.28) * 0.055 * ledgeMask;
          // Buttress ribs: sharp vertical crests of harder rock standing out of the wall.
          if (y >= ribY + 4 || ribY < 0) {
            ribY = y - (y % 4);
            ribA = 1 - Math.abs(noise.noise3(ux, uz, ribY * 0.022 + 5));
            ribB = 1 - Math.abs(noise.noise3(ux, uz, (ribY + 4) * 0.022 + 5));
          }
          const r1 = ribA + (ribB - ribA) * ((y - ribY) / 4);
          const r2 = r1 * r1;
          n += r2 * r2 * r2 * 0.075;
        }
        n += detail.noise3(x * 0.2, y * 0.2, z * 0.2) * 0.03;
        if (e + n < 1) carve(x, y, z);
      }
    }
  mark('hollow');

  // Dripstone: stalactites with a thick root and a concave, wandering taper, in families
  // around a few large ones, plus thin flowstone curtains hanging from the dome.
  for (let i = 0; i < 30; i++) {
    const x = H.cx + rng.range(-H.rx * 0.8, H.rx * 0.8);
    const z = H.cz + rng.range(-H.rz * 0.8, H.rz * 0.8);
    let y = 80;
    while (y < sy - 2 && isAir(Math.floor(x), y, Math.floor(z))) y++;
    if (y >= sy - 2) continue;
    const len = rng.range(6, 18);
    const r = rng.range(1.6, 3.4);
    const id = rng.chance(0.5) ? B.SLATE : B.DEEP_SLATE;
    dripstone([x, y, z], -1, len, r, id);
    const family = len > 11 ? geoRng.int(2, 4) : geoRng.int(0, 2);
    for (let k = 0; k < family; k++) {
      const a = geoRng.range(0, Math.PI * 2);
      const d = r + geoRng.range(1.2, 3.5);
      const fx = x + Math.cos(a) * d;
      const fz = z + Math.sin(a) * d;
      let fy = 80;
      while (fy < sy - 2 && isAir(Math.floor(fx), fy, Math.floor(fz))) fy++;
      if (fy >= sy - 2) continue;
      dripstone([fx, fy, fz], -1, geoRng.range(2, len * 0.45), geoRng.range(0.7, 1.4), id);
    }
  }
  for (let i = 0; i < 8; i++) {
    const x0 = H.cx + geoRng.range(-30, 30);
    const z0 = H.cz + geoRng.range(-30, 30);
    curtain(x0, z0, geoRng.range(0, Math.PI), geoRng.int(7, 13));
  }
  // Stalagmites stay on the periphery, away from the processional way and the routes.
  for (let i = 0, placed = 0; i < 40 && placed < 12; i++) {
    const x = H.cx + rng.range(-H.rx * 0.78, H.rx * 0.78);
    const z = H.cz + rng.range(-H.rz * 0.78, H.rz * 0.78);
    if (z > 88 && z < 126) continue; // the avenue, the stairs' foot and the bridge approach
    if (x > 92 && x < 138 && z > 64) continue; // the stairs and the chasm
    let y = 60;
    while (y > 2 && isAir(Math.floor(x), y, Math.floor(z))) y--;
    dripstone([x, y, z], 1, rng.range(2, 6), rng.range(1, 2.1), B.DEEP_SLATE);
    placed++;
  }
  mark('formations');

  // ------------------------------------------------------------------------------------
  // 3. Camp: a low, warm pocket near the top with a plank deck around a fire pit.
  const camp: Region = { id: 'camp', min: [24, 100, 30], max: [51, 111, 53] };
  for (let z = 29; z <= 53; z++)
    for (let x = 23; x <= 51; x++)
      for (let y = 101; y <= 111; y++) {
        const dx = (x - 37) / 12.5;
        const dz = (z - 41) / 10.5;
        const dy = (y - 101) / 8.5;
        const e = Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dz), 3) + Math.pow(Math.max(0, dy), 2.2);
        const n = noise.fbm3(x * 0.12, y * 0.12, z * 0.12, 2) * 0.25;
        if (e + n < 1) carve(x, y, z);
      }
  // Earthen floor with gravel patches; two small plank decks (work and sleeping areas).
  for (let z = 29; z <= 53; z++)
    for (let x = 23; x <= 51; x++) {
      if (!isAir(x, 101, z)) continue;
      put(x, 100, z, detail.noise2(x * 0.35, z * 0.35) > 0.35 ? B.GRAVEL : B.SOIL);
    }
  for (let z = 34; z <= 39; z++) for (let x = 38; x <= 44; x++) put(x, 100, z, B.PLANK);
  for (let z = 43; z <= 47; z++) for (let x = 29; x <= 34; x++) put(x, 100, z, B.PLANK);
  // The fire pit: an ember bed under the fire inside a ring of scorched gravel (the stones
  // themselves are part of the campfire prop), not a grid of glowing floor tiles.
  for (let z = 40; z <= 42; z++) for (let x = 35; x <= 37; x++) put(x, 100, z, B.GRAVEL);
  put(36, 100, 41, B.HEARTH);
  // Support frame; the south-east post has snapped and its crossbeam lies on the floor.
  const posts: V3[] = [[29, 0, 35], [44, 0, 35], [29, 0, 48]];
  for (const [px, , pz] of posts) for (let y = 101; y <= 107; y++) put(px, y, pz, B.BEAM);
  for (let y = 101; y <= 103; y++) put(44, y, 48, B.BEAM);
  for (let x = 29; x <= 44; x++) put(x, 107, 35, B.BEAM);
  for (let z = 35; z <= 48; z++) put(29, 107, z, B.BEAM);
  for (let x = 29; x <= 36; x++) put(x, 107, 48, B.BEAM);
  line([37, 101, 49], [44, 102, 46], (x, y, z) => put(x, y, z, B.BEAM));
  blob([45, 101, 49], 1.6, (x, y, z) => { if (y >= 101 && isAir(x, y, z)) put(x, y, z, B.GRAVEL); });
  blob([46, 101, 33], 1.4, (x, y, z) => { if (y >= 101 && isAir(x, y, z)) put(x, y, z, B.SLATE); });
  // Make sure the camp ceiling clears the frame everywhere.
  for (let z = 34; z <= 49; z++) for (let x = 28; x <= 45; x++) for (let y = 101; y <= 106; y++) if (get(x, y, z) === B.SLATE || get(x, y, z) === B.UMBER) carve(x, y, z);

  addProp({ kind: 'campfire', x: 36.5, y: 101, z: 41.5, emitters: [[36, 101, 41]], interact: 'rest' });
  addProp({ kind: 'workbench', x: 40.5, y: 101, z: 37.5, rotY: 0, interact: 'craft' });
  addProp({ kind: 'chest', x: 31.5, y: 101, z: 37.5, rotY: 0.35, interact: 'storage' });
  addProp({ kind: 'bedroll', x: 32.5, y: 101, z: 45, rotY: 0.2 });
  addProp({ kind: 'crate', x: 42.5, y: 101, z: 45.5, rotY: 0.3 });
  addProp({ kind: 'crate', x: 43.4, y: 101, z: 43.9, rotY: -0.2, scale: 0.8 });
  addProp({ kind: 'crate', x: 42.6, y: 101.82, z: 45.4, rotY: 0.9, scale: 0.7, anchor: [42, 100, 45] });
  addProp({ kind: 'barrel', x: 30.4, y: 101, z: 41 });
  addProp({ kind: 'barrel', x: 30.6, y: 101, z: 39.7, rotY: 1.1, scale: 0.9 });
  addProp({ kind: 'crate', x: 46, y: 101, z: 38.5, rotY: 0.1, scale: 0.9 });
  addProp({ kind: 'pickaxeRack', x: 29.6, y: 101, z: 40.5, rotY: Math.PI / 2 });
  addProp({ kind: 'ropeCoil', x: 34, y: 101, z: 36.2 });
  addProp({ kind: 'hangingLantern', x: 32.5, y: 105.2, z: 35.5, anchor: [32, 107, 35], emitters: [[32, 105, 35]] });
  addProp({ kind: 'hangingLantern', x: 29.5, y: 105.2, z: 44.5, anchor: [29, 107, 44], emitters: [[29, 105, 44]] });
  lanternPost(47.5, 101, 43.5, 0, true);
  // Body forward is (sin(yaw), cos(yaw)): +X faces the camp exit and the tunnel.
  const spawn = { x: 34.5, y: 101, z: 43.2, yaw: Math.PI / 2 };
  landmarks.campfire = [36.5, 101, 41.5];
  landmarks.workbench = [40.5, 101, 37.5];
  mark('camp');

  // ------------------------------------------------------------------------------------
  // 4. Descent tunnel from the camp to the Hollow ledge, marked by route lanterns.
  const route: V3[] = [
    [48, 101, 41], [58, 100, 43], [66, 98, 49], [71, 96, 57], [75, 93, 64], [80, 91, 70], [85, 89, 73], [90, 88, 76],
  ];
  carveTunnel(route, 2.5, 4.6);
  // The tunnel is a fault, not a pipe: ceiling fissures open where it crosses joints, and
  // rubble from old collapses lies against the walls.
  fissure(route[2], route[3], 0.35, 0.7, 6);
  fissure(route[5], route[6], 0.2, 0.75, 8);
  rubble(route[1], route[2], 0.55, 1);
  rubble(route[4], route[5], 0.4, -1);
  // A side pocket with the first glimmer crystals: an early, safe taste of the mystery.
  carveRoom([76, 96, 55], 3.2, 3.0, 3.2);
  crystalSeam([78.5, 96.5, 52.5], [79.5, 98.5, 55.5], 1.15, 12);
  crystalSeam([75.5, 95.5, 52.2], [77.5, 95.5, 52.2], 0.9, 4);
  addProp({ kind: 'crystalCluster', x: 77.6, y: 96, z: 54.4, rotY: 0.7, scale: 1.25, emitters: [[77, 96, 54]], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 1, max: 2 } });
  shardOnFloor(79.2, 96, 56.3, 0.75);
  shardOnFloor(75.6, 96, 53.4, 0.6);
  discoveries.push({ id: 'crystals', min: [71, 93, 50], max: [81, 101, 60] });
  landmarks.firstCrystals = [77, 96, 55];

  lanternPost(57, 100, 45.2, 0.3);
  lanternPost(72.6, 96, 59.2, -0.6);
  lanternPost(81.5, 91, 72.2, 0.9);
  mark('tunnel');

  // ------------------------------------------------------------------------------------
  // 5. The ledge: a rock balcony overlooking the Hollow (the reveal), with a broken natural
  // parapet of crags along the drop so the edge reads and frames the view.
  for (let z = 66; z <= 86; z++)
    for (let x = 82; x <= 100; x++) {
      const d = Math.hypot((x - 91) / 8.5, (z - 76) / 7.5);
      const lim = 1 + detail.noise2(x * 0.3, z * 0.3) * 0.12;
      if (d > lim) continue;
      const depth = Math.round((1 - d) * 9 + 1);
      for (let y = 87 - depth; y <= 87; y++) put(x, y, z, y === 87 && d < 0.85 ? B.SLATE : B.DEEP_SLATE);
      for (let y = 88; y <= 93; y++) carve(x, y, z);
    }
  // Crags on the rim frame the view: rounded rocks to the east and south, a low gap toward
  // the south-east where the Hollow opens, and the stairs head left clear.
  for (const [deg, r, hmax] of [[14, 1.5, 2.6], [32, 1.0, 1.4], [68, 1.1, 1.6], [92, 1.6, 3.2], [118, 1.3, 2.2], [146, 1.5, 2.8], [170, 1.0, 1.5]]) {
    const a = (deg * Math.PI) / 180;
    const cx = 91 + Math.cos(a) * 8.5 * 0.9;
    const cz = 76 + Math.sin(a) * 7.5 * 0.9;
    for (let z = Math.floor(cz) - 3; z <= cz + 3; z++)
      for (let x = Math.floor(cx) - 3; x <= cx + 3; x++) {
        if (isAir(x, 87, z)) continue;
        const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
        const h = Math.round(hmax * (1 - (d / (r + 0.8)) ** 2) + detail.noise2(x * 0.8 + 5, z * 0.8) * 0.6);
        for (let y = 88; y < 88 + h; y++) put(x, y, z, B.SLATE);
      }
  }
  lanternPost(94.5, 88, 73.5, 0.2, true);
  discoveries.push({ id: 'hollow', min: [84, 86, 68], max: [100, 96, 84] });
  landmarks.ledge = [92, 88, 76];
  mark('ledge');

  // ------------------------------------------------------------------------------------
  // 6. Monumental stairs: two flights on battered bases, slab treads between stepped cheek
  // walls (a lip on both edges), framed recessed panels on the outer faces, corbelled
  // passages through the base, and a landing tower with a cornice.
  const FOOT = floorBase - 4;
  const M = B.ANCIENT_BRICK;
  for (let k = 0; k <= 22; k++) {
    const x = 96 + k;
    const t = 87 - k;
    for (let z = 69; z <= 78; z++) {
      const batter = z === 70 || z === 77 ? floorBase + 2 : z === 69 || z === 78 ? floorBase : -1;
      if (batter >= 0) {
        for (let y = FOOT; y <= batter; y++) put(x, y, z, M);
        continue;
      }
      for (let y = FOOT; y < t; y++) put(x, y, z, M);
      if (z === 71 || z === 76) {
        put(x, t, z, M);
        put(x, t + 1, z, M);
      } else {
        put(x, t, z, B.ANCIENT_TILE);
        for (let y = t + 1; y <= t + 5; y++) carve(x, y, z);
      }
    }
  }
  for (const [a, b] of [[97, 102], [104, 109], [111, 116]]) {
    for (let x = a + 1; x <= b - 1; x++) {
      const yt = 87 - (x - 96) - 3;
      for (let y = floorBase + 8; y <= yt; y++) {
        carve(x, y, 71);
        carve(x, y, 76);
      }
    }
    corbelPassage('z', a + 1, a + 4, 69, 78);
  }
  // Landing tower.
  for (let z = 67; z <= 80; z++)
    for (let x = 117; x <= 128; x++) {
      const inTower = x >= 119 && x <= 126 && z >= 69 && z <= 79;
      if (!inTower) {
        // Battered foot and the cornice course under the landing.
        const ring = Math.max(119 - x, x - 126, 69 - z, z - 79);
        const top = ring === 1 ? floorBase + 2 : floorBase;
        if (z <= 79 && z >= 69 || x <= 126 && x >= 119 || ring <= 1) for (let y = FOOT; y <= top; y++) put(x, y, z, M);
        if (ring === 1 && (x === 127 || z === 68)) put(x, 62, z, M);
        continue;
      }
      for (let y = FOOT; y < 64; y++) put(x, y, z, M);
      const rim = x === 119 || x === 126 || z === 69 || z === 79;
      const opening = (x === 119 && z >= 72 && z <= 75) || (z === 79 && x >= 121 && x <= 124);
      put(x, 64, z, rim ? M : B.ANCIENT_TILE);
      for (let y = 65; y <= 70; y++) carve(x, y, z);
      if (rim && !opening) put(x, 65, z, M);
    }
  for (let z = 71; z <= 77; z++) for (let y = floorBase + 5; y <= 59; y++) carve(126, y, z);
  for (let x = 121; x <= 124; x++) for (let y = floorBase + 5; y <= 59; y++) carve(x, y, 69);
  lanternPost(125, 65, 70.5, 0, true);
  lanternPost(120.5, 65, 77.5, Math.PI * 0.75);
  // Flight 2 runs south along x 121..124 from the landing (z 80, tread 63) to the floor.
  for (let k = 0; k <= 22; k++) {
    const z = 80 + k;
    const t = 63 - k;
    for (let x = 118; x <= 127; x++) {
      const batter = z <= 96 ? (x === 119 || x === 126 ? floorBase + 2 : x === 118 || x === 127 ? floorBase : -1) : x < 120 || x > 125 ? -2 : -1;
      if (batter === -2) continue;
      if (batter >= 0) {
        for (let y = FOOT; y <= batter; y++) put(x, y, z, M);
        continue;
      }
      for (let y = FOOT; y < t; y++) put(x, y, z, M);
      if (x === 120 || x === 125) {
        put(x, t, z, M);
        put(x, t + 1, z, M);
      } else {
        put(x, t, z, B.ANCIENT_TILE);
        for (let y = t + 1; y <= t + 5; y++) carve(x, y, z);
      }
    }
  }
  for (const [a, b] of [[81, 86], [88, 93], [95, 100]]) {
    for (let z = a + 1; z <= b - 1; z++) {
      const yt = 63 - (z - 80) - 3;
      for (let y = floorBase + 8; y <= yt; y++) {
        carve(120, y, z);
        carve(125, y, z);
      }
    }
    if (b <= 93) corbelPassage('x', a + 1, a + 4, 118, 127);
  }
  // Lamps on the cheek walls halfway down each flight: warm pools with dark gaps between.
  lanternPost(106.5, 79, 76.5, Math.PI);
  lanternPost(125.5, 54, 91.5, -Math.PI / 2);
  lanternPost(119.5, floorBase + 1, 103.5, 0.4);
  landmarks.stairsTop = [96.5, 88, 73.5];
  landmarks.landing = [122.5, 65, 74.5];
  landmarks.stairsBottom = [122.5, floorBase + 1, 104];
  mark('stairs');

  // ------------------------------------------------------------------------------------
  // 7. The colonnade: a processional way from the shrine (west) to the sealed gate (east),
  // flanked by octagonal columns, older than the camp by ages. Some still hold the dome,
  // some are broken, one lies where it fell.
  column(74, 94, 'full', true);
  column(88, 94, 'broken', true);
  column(102, 94, 'full', true);
  column(74, 116, 'full', true);
  column(102, 116, 'stump', true);
  // The fallen column: its drums rolled apart to the west, the capital at the far end.
  lyingDrum('x', 95, 116, 3, 2.9, 1);
  lyingDrum('x', 90, 115, 4, 2.9, 2);
  lyingDrum('x', 85, 117, 3, 2.9, 1);
  slab(79, 114, 4, 5, B.ANCIENT_BRICK, 1);
  slab(80, 115, 2, 3, B.ANCIENT_BRICK, 0, 1);
  column(82, 128, 'broken', false);
  lyingDrum('z', 87, 130, 2, 1.95, 1);
  slab(81, 98, 3, 2, B.ANCIENT_TILE, 0);
  slab(91, 98, 2, 3, B.ANCIENT_TILE, 0);
  // The way itself: worn slabs between kerbs, buried under the hall floor in places.
  for (let x = 66; x <= 134; x++)
    for (let z = 99; z <= 107; z++) {
      const fh = floorHeight(x, z);
      if (!isAir(x, fh, z) || isAir(x, fh - 1, z)) continue;
      if (detail.noise2(x * 0.11 + 40, z * 0.11) < -0.3) continue;
      put(x, fh - 1, z, z === 99 || z === 107 ? B.ANCIENT_BRICK : B.ANCIENT_TILE);
    }
  mark('pillars');

  // ------------------------------------------------------------------------------------
  // 8. The Rift below the floor, glimpsed through a violet chasm, crossed by a bridge.
  const R = { cx: 124, cy: 20, cz: 132, rx: 17, ry: 17, rz: 18 };
  for (let z = R.cz - R.rz - 2; z <= R.cz + R.rz + 2; z++)
    for (let y = 3; y <= R.cy + R.ry + 2; y++)
      for (let x = R.cx - R.rx - 2; x <= R.cx + R.rx + 2; x++) {
        const e = Math.hypot((x - R.cx) / R.rx, (y - R.cy) / R.ry, (z - R.cz) / R.rz);
        if (e > 1.2) continue;
        const n = noise.fbm3(x * 0.08, y * 0.08, z * 0.08, 2) * 0.16;
        if (e + n < 1 && y >= 6) carve(x, y, z);
      }
  for (let z = 124; z <= 133; z++)
    for (let x = 109; x <= 136; x++) {
      const halfWidth = 2.4 + noise.noise2(x * 0.15, 3.3) * 1.2 - Math.abs(x - 122) * 0.035;
      if (Math.abs(z - 128.5 + noise.noise2(x * 0.08, 9.1) * 2) > halfWidth) continue;
      for (let y = 30; y <= floorBase + 6; y++) carve(x, y, z);
    }
  // The bridge: one segmental arch, deep at the abutments and thin at the crown, a paved
  // walk between low parapets, and newel posts carrying lamps at both ends.
  for (let z = 121; z <= 136; z++) {
    const s = (z - 128.5) / 6.5;
    const depth = 1 + Math.round(Math.min(1, s * s) * 6);
    for (let x = 120; x <= 124; x++) {
      put(x, floorBase, z, x >= 121 && x <= 123 ? B.ANCIENT_TILE : M);
      for (let y = floorBase - depth; y < floorBase; y++) put(x, y, z, M);
      for (let y = floorBase + 1; y <= floorBase + 5; y++) if (x > 120 && x < 124) carve(x, y, z);
    }
    put(120, floorBase + 1, z, M);
    put(124, floorBase + 1, z, M);
  }
  for (const [nx, nz] of [[119, 121], [124, 121], [119, 135], [124, 135]])
    for (let dz = 0; dz <= 1; dz++)
      for (let dx = 0; dx <= 1; dx++) for (let y = floorBase - 3; y <= floorBase + 3; y++) put(nx + dx, y, nz + dz, M);
  lanternPost(119.5, floorBase + 4, 121.5, Math.PI / 2, true);
  lanternPost(125.5, floorBase + 4, 136.5, -Math.PI / 2);
  // Violet glow rising from the depths.
  for (const [x, z] of [[114, 128], [123, 127], [131, 129]]) setEmitter(x, 33, z, B.LIGHT_ABYSS);
  for (let i = 0; i < 9; i++) {
    const x = Math.round(R.cx + rng.range(-11, 11));
    const z = Math.round(R.cz + rng.range(-11, 11));
    let y = 8;
    while (y < 20 && !isAir(x, y, z)) y++;
    setEmitter(x, y, z, B.LIGHT_ABYSS);
  }
  addProp({ kind: 'abyssMonolith', x: 123.5, y: 6, z: 135.5, scale: 1, anchor: null });
  crystalFormation([110, 12, 128], 4, 6, [0.4, 1, 0.1]);
  crystalFormation([137, 16, 140], 3, 5, [-0.5, 1, -0.2]);
  // The Glimmerfall: luminous water from a crack in the dome, through the chasm, into the rift.
  {
    const fx = 113;
    const fz = 128;
    let top = 50;
    while (top < sy - 2 && isAir(fx, top + 1, fz)) top++;
    let bottom = 40;
    while (bottom > 2 && isAir(fx, bottom - 1, fz)) bottom--;
    for (let y = bottom + 2; y < top; y += 7) setEmitter(fx, y, fz, B.LIGHT_CYAN);
    landmarks.fallTop = [fx + 0.5, top + 1, fz + 0.5];
    landmarks.fallBottom = [fx + 0.5, bottom, fz + 0.5];
  }
  // Beside it the Spindle: a flowstone column grown from floor to dome, the Hollow's
  // landmark silhouette from the ledge.
  naturalColumn(104, 122, 6.0, 2.3, 7.5);
  landmarks.spindle = [104.5, floorHeight(104, 122), 122.5];
  landmarks.bridge = [122.5, floorBase + 1, 128.5];
  landmarks.monolith = [123.5, 6, 135.5];
  mark('rift');

  // ------------------------------------------------------------------------------------
  // 9. The sealed temple gate on the east wall: a deep portal between stepped buttresses,
  // a corbelled doorway closed by the plated seal, and an inscribed frieze above the lintel.
  for (let z = 88; z <= 113; z++)
    for (let y = floorBase - 3; y <= 66; y++)
      for (let x = 137; x <= 146; x++) {
        if (x >= 139) {
          if (isAir(x, y, z)) put(x, y, z, B.DEEP_SLATE);
          continue;
        }
        put(x, y, z, M);
      }
  for (const [z0, z1] of [[87, 90], [111, 114]])
    for (let y = floorBase - 2; y <= 64; y++) {
      const front = y <= floorBase + 7 ? 132 : y <= floorBase + 15 ? 134 : 135;
      for (let x = front; x <= 136; x++) for (let z = z0; z <= z1; z++) put(x, y, z, M);
    }
  // Portal face at x 135 with pilasters, the lintel and two cornice courses stepping out.
  for (let z = 92; z <= 109; z++)
    for (let y = floorBase - 2; y <= floorBase + 12; y++) {
      if (z >= 94 && z <= 107) {
        put(135, y, z, M);
        put(136, y, z, M);
      }
      const pilaster = (z >= 93 && z <= 94) || (z >= 107 && z <= 108);
      if (pilaster || (y === floorBase + 9 && z >= 95 && z <= 106) || (y === floorBase + 11 && z >= 93 && z <= 108)) put(134, y, z, M);
      if (y === floorBase + 12) put(133, y, z, M);
    }
  const doorway = (y: number, z: number) =>
    (y >= floorBase + 1 && y <= floorBase + 6 && z >= 98 && z <= 103) ||
    (y === floorBase + 7 && z >= 99 && z <= 102) ||
    (y === floorBase + 8 && z >= 100 && z <= 101);
  for (let z = 98; z <= 103; z++)
    for (let y = floorBase + 1; y <= floorBase + 8; y++) {
      if (!doorway(y, z)) continue;
      for (let x = 133; x <= 136; x++) carve(x, y, z);
      put(137, y, z, B.HARDENED_SLATE);
      put(138, y, z, B.HARDENED_SLATE);
    }
  // The frieze: one course of inscription between the lintel and the cornice; two stones
  // have weathered blank.
  for (let z = 96; z <= 105; z++) put(135, floorBase + 10, z, z === 97 || z === 104 ? M : B.GLYPH_STONE);
  // Forecourt and threshold.
  for (let z = 96; z <= 105; z++)
    for (let x = 126; x <= 136; x++) {
      if (x >= 135 && !doorway(floorBase + 1, z)) continue;
      put(x, floorBase, z, z === 96 || z === 105 ? M : B.ANCIENT_TILE);
      for (let y = floorBase + 1; y <= floorBase + 4; y++) if (x < 135 || doorway(y, z)) carve(x, y, z);
    }
  landmarks.seal = [136.5, floorBase + 1, 100.5];
  // Corridor east, stairs down south, then west onto the balcony.
  for (let x = 139; x <= 151; x++) for (let z = 99; z <= 102; z++) {
    put(x, floorBase, z, z === 100 || z === 101 ? B.ANCIENT_TILE : M);
    for (let y = floorBase + 1; y <= floorBase + 5; y++) carve(x, y, z);
  }
  for (let k = 0; k <= 17; k++) {
    const z = 103 + k;
    const walk = floorBase + 1 - k;
    for (let x = 147; x <= 151; x++) {
      put(x, walk - 1, z, x >= 148 && x <= 150 ? B.ANCIENT_TILE : M);
      for (let y = walk; y <= walk + 5; y++) carve(x, y, z);
    }
  }
  const lowWalk = floorBase + 1 - 17;
  for (let z = 120; z <= 129; z++) for (let x = 141; x <= 151; x++) {
    put(x, lowWalk - 1, z, M);
    for (let y = lowWalk; y <= lowWalk + 5; y++) carve(x, y, z);
  }
  for (let z = 122; z <= 132; z++)
    for (let x = 132; x <= 141; x++) {
      put(x, lowWalk - 1, z, z >= 125 && z <= 129 ? B.ANCIENT_TILE : M);
      put(x, lowWalk - 2, z, M);
      for (let y = lowWalk; y <= lowWalk + 6; y++) carve(x, y, z);
      if (x === 132 || z === 122 || z === 132) put(x, lowWalk, z, M);
    }
  // Newel posts at the balcony's outer corners, and a short inscription in the parapet that
  // faces the monolith: the last words of this zone.
  for (const nz of [122, 132]) for (let y = lowWalk; y <= lowWalk + 1; y++) put(132, y, nz, M);
  for (let z = 126; z <= 128; z++) put(132, lowWalk, z, B.GLYPH_STONE);
  lanternPost(149.5, floorBase + 1, 100.5, 0, true);
  lanternPost(140.5, lowWalk, 127.5, 0, true);
  discoveries.push({ id: 'gate', min: [131, lowWalk - 1, 121], max: [142, lowWalk + 6, 133] });
  landmarks.balcony = [136, lowWalk, 127];
  mark('gate');

  // ------------------------------------------------------------------------------------
  // 10. The Sealed Shrine, hidden behind a half-buried facade on the west wall: a corbel-
  // vaulted hall of three bays, a dais at the back under an inscribed panel, the tablet.
  const shrine = { x0: 52, x1: 61, z0: 98, z1: 110, y0: floorBase + 1, y1: floorBase + 9 };
  const spring = shrine.y0 + 5;
  for (let z = shrine.z0 - 1; z <= shrine.z1 + 1; z++)
    for (let x = shrine.x0 - 2; x <= shrine.x1 + 1; x++)
      for (let y = shrine.y0 - 1; y <= shrine.y1 + 1; y++) {
        const inside = x >= shrine.x0 && x <= shrine.x1 && z >= shrine.z0 && z <= shrine.z1 && y >= shrine.y0 && y <= shrine.y1;
        if (!inside) {
          put(x, y, z, y === shrine.y0 - 1 && x >= shrine.x0 ? B.ANCIENT_TILE : M);
          continue;
        }
        const fromWall = Math.min(z - shrine.z0, shrine.z1 - z);
        if (y >= spring && fromWall <= y - spring) put(x, y, z, M);
        else carve(x, y, z);
      }
  // Pilasters dividing the bays.
  for (const px of [54, 57, 60]) for (let y = shrine.y0; y < spring; y++) {
    put(px, y, shrine.z0, M);
    put(px, y, shrine.z1, M);
  }
  // Dais and the inscribed panel on the back wall, recessed into it.
  for (let z = 100; z <= 108; z++) for (let x = shrine.x0; x <= shrine.x0 + 1; x++) put(x, shrine.y0, z, B.ANCIENT_TILE);
  for (let z = 100; z <= 108; z++)
    for (let y = shrine.y0 + 1; y <= shrine.y0 + 5; y++) {
      carve(shrine.x0 - 1, y, z);
      put(shrine.x0 - 2, y, z, y === shrine.y0 + 3 && z !== 102 && z !== 107 ? B.GLYPH_STONE : M);
    }
  // Facade toward the Hollow: pilasters, a framed door of crumbling masonry under a lintel
  // with a short inscription (the hint), half swallowed by scree.
  for (let z = 95; z <= 113; z++)
    for (let y = floorBase - 1; y <= floorBase + 11; y++) {
      const buried = y > floorBase + 8 + Math.round(noise.noise2(z * 0.4, 5) * 2);
      if (!buried) put(62, y, z, M);
    }
  for (let z = 102; z <= 105; z++) for (let y = floorBase + 1; y <= floorBase + 4; y++) put(62, y, z, B.CRUMBLING_BRICK);
  for (let z = 95; z <= 113; z++) for (let x = 63; x <= 67; x++) for (let y = floorBase + 1; y <= floorBase + 6; y++) {
    if (x === 63 && (z < 100 || z > 107) && y > floorBase + 3 && rng.chance(0.5)) continue;
    carve(x, y, z);
  }
  for (let z = 95; z <= 113; z++) for (let x = 63; x <= 67; x++) put(x, floorBase, z, B.SOIL);
  for (let y = floorBase + 1; y <= floorBase + 5; y++) {
    put(63, y, 101, M);
    put(63, y, 106, M);
    put(63, y, 97, M);
    put(63, y, 110, M);
  }
  for (let z = 100; z <= 107; z++) put(63, floorBase + 5, z, M);
  for (let z = 102; z <= 105; z++) {
    put(62, floorBase + 6, z, B.GLYPH_STONE);
    carve(63, floorBase + 6, z);
  }
  for (let z = 99; z <= 108; z++) put(63, floorBase + 7, z, M);
  // Scree spilling over both ends of the facade.
  for (let z = 95; z <= 113; z++) {
    const end = z < 100 ? 100 - z : z > 107 ? z - 107 : 0;
    if (!end) continue;
    for (let x = 63; x <= 67; x++) {
      const h = Math.round(end * 0.9 - (x - 63) * 1.3 + detail.noise2(x * 0.5, z * 0.5) * 1.2);
      for (let y = floorBase + 1; y <= floorBase + Math.min(6, h); y++) put(x, y, z, (x + y + z) % 3 === 0 ? B.SLATE : B.GRAVEL);
    }
  }
  addProp({ kind: 'tablet', x: 55.5, y: shrine.y0, z: 104, rotY: Math.PI / 2, interact: 'relic', emitters: [] });
  setEmitter(56, shrine.y0 + 1, 104, B.LIGHT_CYAN);
  addProp({ kind: 'crystalCluster', x: 52.6, y: shrine.y0, z: 109.4, rotY: 2.2, scale: 0.9, emitters: [], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 2, max: 3 } });
  lanternPost(65.5, floorBase + 1, 100.5, Math.PI / 2);
  discoveries.push({ id: 'shrine', min: [shrine.x0, shrine.y0 - 1, shrine.z0], max: [shrine.x1 + 1, shrine.y1, shrine.z1 + 1] });
  landmarks.shrineDoor = [62, floorBase + 1, 103.5];
  landmarks.tablet = [55.5, shrine.y0, 104];
  mark('shrine');

  // ------------------------------------------------------------------------------------
  // 11. Crystal landmarks in the Hollow: faceted clusters on dark host rock, seams in walls.
  {
    const c: V3 = [113, floorBase + 1, 108];
    const fy = floorHeight(113, 108);
    blob([113.5, fy - 0.5, 108.5], 2.3, (x, y, z) => { if (y >= fy - 2 && y <= fy + 1) put(x, y, z, B.DEEP_SLATE); });
    crystalSeam([112.5, fy + 0.5, 107.2], [114.5, fy - 0.5, 109.8], 1.0, 10);
    let top = fy + 1;
    while (top < fy + 4 && !isAir(113, top, 108)) top++;
    addProp({ kind: 'crystalCluster', x: 113.5, y: top, z: 108.5, rotY: 0.4, scale: 2.1, emitters: [[113, top, 108]], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 1, max: 2 } });
    shardOnFloor(111.2, fy, 109.9, 1.1);
    shardOnFloor(115.4, fy, 107.3, 0.9);
    shardOnFloor(110.5, fy, 105.5, 0.8);
    landmarks.hollowCrystals = c;
  }
  crystalSeam([70.5, 57, 121.5], [72.5, 60, 123.5], 1.1, 9);
  crystalSeam([131.5, 69, 77.5], [133.5, 72, 79.5], 1.0, 8);
  // Small seams scattered over the walls: cold points that give the dark depth cues.
  let wallCrystals = 0;
  for (let attempt = 0; attempt < 60 && wallCrystals < 6; attempt++) {
    const yaw = rng.range(0, Math.PI * 2);
    const pitch = rng.range(-0.25, 0.55);
    const dx = Math.cos(yaw) * Math.cos(pitch);
    const dy = Math.sin(pitch);
    const dz = Math.sin(yaw) * Math.cos(pitch);
    let px = H.cx;
    let py = 62;
    let pz = H.cz;
    let hit = false;
    for (let i = 0; i < 70; i++) {
      px += dx;
      py += dy;
      pz += dz;
      if (!isAir(Math.floor(px), Math.floor(py), Math.floor(pz))) {
        hit = true;
        break;
      }
    }
    if (!hit || py < floorBase + 4) continue;
    if (Math.hypot(px - 62, pz - 104) < 14) continue; // keep the shrine wall in shadow
    if (Math.hypot(px - 137, pz - 100) < 16) continue; // and the gate's frieze alone
    crystalSeam([px, py, pz], [px + dx * 1.5 + rng.range(-1, 1), py + 1.5, pz + dz * 1.5 + rng.range(-1, 1)], 0.8, rng.int(3, 5));
    wallCrystals++;
  }
  mark('crystals');

  // ------------------------------------------------------------------------------------
  // Warm light in the cold hall: lamps at the sealed door, and an abandoned explorers' camp
  // on the processional way - someone came this far before.
  lanternPost(133.5, floorBase + 1, 97.5, 0, true);
  lanternPost(133.5, floorBase + 1, 104.5, 0, true);
  const oldCamp: V3 = [101, floorHeight(101, 104), 103.5];
  lanternPost(oldCamp[0], oldCamp[1], oldCamp[2], 0.7);
  lanternPost(84.5, floorHeight(84, 105), 105.5, 0.3);
  lanternPost(108.5, floorHeight(108, 115), 115.5, -0.6);
  addProp({ kind: 'brokenCart', x: oldCamp[0] + 2.2, y: floorHeight(103, 105), z: oldCamp[2] + 1.6, rotY: 2.1 });
  addProp({ kind: 'crate', x: oldCamp[0] - 1.4, y: floorHeight(100, 103), z: oldCamp[2] - 0.8, rotY: 0.6, scale: 0.85 });
  addProp({ kind: 'ropeCoil', x: oldCamp[0] + 0.6, y: floorHeight(101, 102), z: oldCamp[2] - 1.5 });
  landmarks.oldCamp = oldCamp;

  // ------------------------------------------------------------------------------------
  // 12. Surface dressing: gravel and soil floors, damp stone only where water runs (around
  // the Glimmerfall and the chasm), then visible ore veins on walls.
  {
    const blocks = w.blocks;
    const damp = new Uint8Array(sx * sz);
    for (let z = 0; z < sz; z++) for (let x = 0; x < sx; x++) damp[x + sx * z] = Math.hypot(x - 113, z - 128) < 21 ? 1 : 0;
    for (let z = 1; z < sz - 1; z++)
      for (let y = 2; y < sy - 2; y++) {
        const row = sx * (y + sy * z);
        for (let x = 1; x < sx - 1; x++) {
          // Most of the volume is buried rock: test the cell above first (one read).
          const i = row + x;
          if (SOLID[blocks[i + sx]]) continue;
          const id = blocks[i];
          if (id !== B.SLATE && id !== B.DEEP_SLATE) continue;
          const n = detail.noise3(x * 0.09, y * 0.09, z * 0.09);
          if (damp[x + sx * z] && n > 0.12 && y < 52) blocks[i] = B.MOSS;
          else if (n < -0.38) blocks[i] = B.GRAVEL;
          else if (n < -0.22 && y > 95) blocks[i] = B.SOIL;
        }
      }
  }
  // Ore veins: clusters grown from exposed wall voxels so players actually see them.
  const exposed = (x: number, y: number, z: number) =>
    isAir(x + 1, y, z) || isAir(x - 1, y, z) || isAir(x, y, z + 1) || isAir(x, y, z - 1) || isAir(x, y + 1, z);
  const plantVeins = (box: Region, count: number, ore: number, minSize: number, maxSize: number) => {
    let planted = 0;
    for (let attempt = 0; attempt < count * 60 && planted < count; attempt++) {
      const x = rng.int(box.min[0], box.max[0]);
      const y = rng.int(box.min[1], box.max[1]);
      const z = rng.int(box.min[2], box.max[2]);
      const id = get(x, y, z);
      if ((id !== B.SLATE && id !== B.DEEP_SLATE && id !== B.UMBER) || !exposed(x, y, z)) continue;
      const size = rng.int(minSize, maxSize);
      let cur: V3 = [x, y, z];
      for (let k = 0; k < size; k++) {
        const cid = get(cur[0], cur[1], cur[2]);
        if (cid === B.SLATE || cid === B.DEEP_SLATE || cid === B.UMBER || cid === B.MOSS || cid === B.GRAVEL) put(cur[0], cur[1], cur[2], ore);
        cur = [cur[0] + rng.int(-1, 1), cur[1] + rng.int(-1, 1), cur[2] + rng.int(-1, 1)];
      }
      planted++;
    }
    return planted;
  };
  plantVeins({ id: 'tunnel', min: [46, 92, 38], max: [90, 104, 78] }, 9, B.COPPER_ORE, 3, 6);
  plantVeins({ id: 'hollowWest', min: [60, 42, 60], max: [100, 62, 140] }, 14, B.COPPER_ORE, 3, 6);
  plantVeins({ id: 'hollowEast', min: [100, 42, 60], max: [146, 62, 140] }, 8, B.COPPER_ORE, 3, 5);
  plantVeins({ id: 'campEdge', min: [44, 100, 30], max: [52, 106, 52] }, 2, B.COPPER_ORE, 2, 3);
  plantVeins({ id: 'templeIron', min: [126, 42, 84], max: [146, 52, 118] }, 4, B.IRON_ORE, 2, 4);
  plantVeins({ id: 'gateIron', min: [139, 20, 98], max: [154, 48, 132] }, 8, B.IRON_ORE, 3, 5);
  plantVeins({ id: 'riftIron', min: [106, 6, 112], max: [142, 36, 152] }, 6, B.IRON_ORE, 3, 5);
  discoveries.push({ id: 'ironVein', min: [0, 0, 0], max: [0, 0, 0] }); // triggered by mining feedback, not a region
  mark('dressing');

  // Re-assert the bedrock shell (decoration passes must never open the world boundary).
  for (let z = 0; z < sz; z++)
    for (let y = 0; y < sy; y++) {
      const row = sx * (y + sy * z);
      if (z === 0 || y === 0 || z === sz - 1 || y === sy - 1) w.blocks.fill(B.BEDROCK, row, row + sx);
      else {
        w.blocks[row] = B.BEDROCK;
        w.blocks[row + sx - 1] = B.BEDROCK;
      }
    }
  mark('seal');

  const totalMs = Math.round(performance.now() - t0);
  return { world: w, seed, spawn, camp, discoveries, props, route, landmarks, timings: { totalMs, phases } };

  // ------------------------------------------------------------------------------------
  // helpers (hoisted)

  function blob(c: V3, r: number, fn: (x: number, y: number, z: number) => void): void {
    const R = Math.ceil(r);
    for (let z = Math.floor(c[2]) - R; z <= c[2] + R; z++)
      for (let y = Math.floor(c[1]) - R; y <= c[1] + R; y++)
        for (let x = Math.floor(c[0]) - R; x <= c[0] + R; x++) {
          const d = Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]);
          if (d <= r + detail.noise3(x * 0.5, y * 0.5, z * 0.5) * 0.6) fn(x, y, z);
        }
  }

  function line(a: V3, b: V3, fn: (x: number, y: number, z: number) => void): void {
    const n = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]), Math.abs(b[2] - a[2])));
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      fn(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t));
    }
  }

  /** Cells of a disc centred on a grid corner: offsets whose cell centres lie within r. */
  function disc(r: number): Cells {
    let cells = discCache.get(r);
    if (cells) return cells;
    cells = [];
    const R = Math.ceil(r) + 1;
    for (let dz = -R; dz < R; dz++) for (let dx = -R; dx < R; dx++) if ((dx + 0.5) ** 2 + (dz + 0.5) ** 2 <= r * r) cells.push([dx, dz]);
    discCache.set(r, cells);
    return cells;
  }

  /** Cells of a square centred on a grid corner, half-size h measured to the cell centres. */
  function plate(h: number): Cells {
    let cells = plateCache.get(h);
    if (cells) return cells;
    cells = [];
    const R = Math.ceil(h) + 1;
    for (let dz = -R; dz < R; dz++) for (let dx = -R; dx < R; dx++) if (Math.abs(dx + 0.5) <= h && Math.abs(dz + 0.5) <= h) cells.push([dx, dz]);
    plateCache.set(h, cells);
    return cells;
  }

  /**
   * Dripstone hanging down (dir = -1) or rising (dir = 1) from the base point: a thick root,
   * a concave taper that wanders a little, and a lumpy cross-section, so it reads as rock
   * grown by water rather than a stack of discs.
   */
  function dripstone(base: V3, dir: number, len: number, r: number, id: number): void {
    let cx = base[0];
    let cz = base[2];
    const lx = geoRng.range(-0.09, 0.09);
    const lz = geoRng.range(-0.09, 0.09);
    const steps = Math.ceil(len);
    for (let i = 0; i <= steps; i++) {
      const t = i / (steps + 1);
      const rr = r * Math.pow(1 - t, 1.6) + 0.3;
      const y = Math.floor(base[1]) + dir * i;
      const R = Math.ceil(rr + 0.6);
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const x = Math.floor(cx) + dx;
          const z = Math.floor(cz) + dz;
          const d = Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
          if (d > rr + detail.noise3(x * 0.45, y * 0.3, z * 0.45) * 0.55) continue;
          if (isAir(x, y, z)) put(x, y, z, id);
        }
      cx += lx + Math.sin(i * 0.7 + base[0]) * 0.12;
      cz += lz + Math.cos(i * 0.6 + base[2]) * 0.12;
    }
  }

  /** A flowstone curtain: a thin, wavy drapery hanging from the dome along a short line. */
  function curtain(x0: number, z0: number, a: number, len: number): void {
    const n = len * 2;
    for (let s = 0; s <= n; s++) {
      const u = s / n;
      const fx = x0 + Math.cos(a) * s * 0.5 + Math.sin(s * 0.9) * 0.5;
      const fz = z0 + Math.sin(a) * s * 0.5 + Math.cos(s * 0.8) * 0.5;
      const x = Math.floor(fx);
      const z = Math.floor(fz);
      let y = 78;
      while (y < sy - 2 && isAir(x, y, z)) y++;
      if (y >= sy - 2 || y < 80) continue;
      const depth = Math.round((1.2 + 4.5 * Math.sin(Math.PI * u)) * (0.75 + 0.35 * detail.noise2(fx * 0.7, fz * 0.7)));
      for (let k = 1; k <= depth; k++) if (isAir(x, y - k, z)) put(x, y - k, z, B.SLATE);
    }
  }

  /** An hourglass flowstone column from floor to dome, fluted by running water. */
  function naturalColumn(cx: number, cz: number, rBase: number, rWaist: number, rTop: number): void {
    const fy = floorHeight(cx, cz);
    let top = fy;
    while (top < sy - 3 && isAir(cx, top + 1, cz)) top++;
    const span = Math.max(1, top - fy);
    for (let y = fy - 3; y <= top + 5; y++) {
      const t = Math.min(1, Math.max(0, (y - fy) / span));
      const waist = 0.4;
      const u = t < waist ? 1 - t / waist : (t - waist) / (1 - waist);
      const r = rWaist + ((t < waist ? rBase : rTop) - rWaist) * u * u;
      const ox = cx + 0.5 + Math.sin(y * 0.07) * 1.1;
      const oz = cz + 0.5 + Math.cos(y * 0.05) * 0.8;
      const R = Math.ceil(r * 1.25 + 1);
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          const x = Math.floor(ox) + dx;
          const z = Math.floor(oz) + dz;
          const px = x + 0.5 - ox;
          const pz = z + 0.5 - oz;
          const ang = Math.atan2(pz, px);
          const flute = 1 + 0.12 * Math.sin(ang * 7 + y * 0.08) + detail.noise3(x * 0.3, y * 0.15, z * 0.3) * 0.12;
          if (px * px + pz * pz <= r * r * flute * flute && isAir(x, y, z)) put(x, y, z, y < 58 ? B.DEEP_SLATE : B.SLATE);
        }
    }
  }

  function carveRoom(c: V3, rx: number, ry: number, rz: number): void {
    for (let z = Math.floor(c[2] - rz - 1); z <= c[2] + rz + 1; z++)
      for (let y = Math.floor(c[1]); y <= c[1] + ry + 1; y++)
        for (let x = Math.floor(c[0] - rx - 1); x <= c[0] + rx + 1; x++) {
          const e = Math.hypot((x - c[0]) / rx, (y - c[1]) / ry, (z - c[2]) / rz) + detail.noise3(x * 0.3, y * 0.3, z * 0.3) * 0.15;
          if (e < 1) carve(x, y, z);
        }
  }

  /** Tunnel along a polyline of [x, walkY, z] points: flat stepped floor, domed ceiling. */
  function carveTunnel(pts: V3[], radius: number, height: number): void {
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s];
      const b = pts[s + 1];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const steps = Math.ceil(len * 2);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const cx = a[0] + (b[0] - a[0]) * t;
        const cz = a[2] + (b[2] - a[2]) * t;
        const floor = Math.round(a[1] + (b[1] - a[1]) * t);
        const r = radius + noise.noise2(cx * 0.2, cz * 0.2) * 0.8;
        const R = Math.ceil(r + 1);
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++) {
            const d = Math.hypot(dx, dz) / r;
            if (d > 1) continue;
            const h = height * (0.55 + 0.45 * Math.sqrt(1 - d * d)) + detail.noise2((cx + dx) * 0.4, (cz + dz) * 0.4) * 0.8;
            const vx = Math.round(cx + dx);
            const vz = Math.round(cz + dz);
            for (let y = floor; y < floor + h; y++) carve(vx, y, vz);
            // Where the path crosses open space, lay a rock shelf under it (a natural bridge).
            if (d < 0.85) {
              const depth = Math.round(3 * (1 - d) + 1);
              for (let y = floor - 1; y >= floor - depth; y--) if (isAir(vx, y, vz)) put(vx, y, vz, B.SLATE);
            }
          }
      }
    }
  }

  /** A narrow crack rising from the tunnel ceiling between fractions t0..t1 of a segment. */
  function fissure(a: V3, b: V3, t0: number, t1: number, rise: number): void {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) * 2);
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const u = (t - t0) / (t1 - t0);
      const x = Math.round(a[0] + (b[0] - a[0]) * t + Math.sin(i * 0.9) * 0.4);
      const z = Math.round(a[2] + (b[2] - a[2]) * t + Math.cos(i * 0.7) * 0.4);
      const floor = Math.round(a[1] + (b[1] - a[1]) * t);
      const h = Math.round(rise * Math.sin(Math.PI * u) * (0.7 + 0.3 * detail.noise2(x * 0.6, z * 0.6)));
      for (let y = floor + 3; y <= floor + 4 + h; y++) carve(x, y, z);
    }
  }

  /** A heap of rubble from an old collapse against one tunnel wall (side = +1 / -1). */
  function rubble(a: V3, b: V3, t: number, side: number): void {
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const l = Math.hypot(dx, dz);
    const nx = (-dz / l) * side;
    const nz = (dx / l) * side;
    const px = a[0] + dx * t;
    const pz = a[2] + dz * t;
    const cx = px + nx * 2.4;
    const cz = pz + nz * 2.4;
    const floor = Math.round(a[1] + (b[1] - a[1]) * t);
    for (let z = Math.floor(cz) - 4; z <= cz + 4; z++)
      for (let x = Math.floor(cx) - 4; x <= cx + 4; x++) {
        // Keep the walking line clear.
        const across = (x + 0.5 - px) * nx + (z + 0.5 - pz) * nz;
        if (across < 1.2) continue;
        const along = ((x + 0.5 - cx) * dx + (z + 0.5 - cz) * dz) / l;
        const d = Math.hypot(along / 1.6, across - 2.4);
        const h = Math.round(2.6 * (1 - d / 2.6) + detail.noise2(x * 0.7, z * 0.7) * 0.7);
        for (let y = floor; y < floor + h; y++) if (isAir(x, y, z)) put(x, y, z, detail.noise3(x * 0.8, y * 0.8, z * 0.8) > 0.25 ? B.SLATE : B.GRAVEL);
      }
  }

  /**
   * Corbelled passage through a stair base: 4 cells wide (c0..c0+3) across the axis, running
   * along the other axis from s0 to s1; vertical jambs, then each course steps in by one.
   */
  function corbelPassage(axis: 'x' | 'z', c0: number, c1: number, s0: number, s1: number): void {
    for (let s = s0; s <= s1; s++)
      for (let c = c0; c <= c1; c++) {
        const x = axis === 'z' ? c : s;
        const z = axis === 'z' ? s : c;
        const fl = floorHeight(axis === 'z' ? c0 + 2 : Math.round((s0 + s1) / 2), axis === 'z' ? Math.round((s0 + s1) / 2) : c0 + 2);
        const inset = Math.min(c - c0, c1 - c);
        const top = fl + 4 + inset;
        put(x, fl - 1, z, B.ANCIENT_TILE);
        for (let y = fl; y <= top; y++) carve(x, y, z);
      }
  }

  /**
   * An octagonal column centred on the grid corner (px, pz): buried footing, square plinth,
   * a wider base ring, the shaft, then (for whole columns) an echinus and a square abacus
   * meeting the rock. Broken shafts end in a slanting fracture.
   */
  function column(px: number, pz: number, kind: 'full' | 'broken' | 'stump', grand: boolean): void {
    const fy = floorHeight(px, pz);
    const shaft = disc(grand ? 2.9 : 1.95);
    const ring = disc(grand ? 3.6 : 2.9);
    const sq = plate(grand ? 3.5 : 2.5);
    const layer = (cells: Cells, y: number) => {
      for (const [dx, dz] of cells) put(px + dx, y, pz + dz, M);
    };
    for (let y = fy - 4; y <= fy; y++) layer(sq, y);
    layer(ring, fy + 1);
    if (kind === 'full') {
      let top = fy + 2;
      while (top < sy - 3 && isAir(px, top + 1, pz) && isAir(px - 1, top + 1, pz - 1)) top++;
      for (let y = fy + 2; y <= top - 3; y++) layer(shaft, y);
      layer(ring, top - 2);
      for (let y = top - 1; y <= top + 3; y++) layer(sq, y);
      return;
    }
    const top = kind === 'broken' ? fy + archRng.int(9, 17) : fy + archRng.int(2, 3);
    const a = archRng.range(0, Math.PI * 2);
    const rs = grand ? 2.9 : 1.95;
    for (let y = fy + 2; y <= top; y++)
      for (const [dx, dz] of shaft) {
        // A slanting break across the shaft, chipped at the edge.
        const slope = ((dx + 0.5) * Math.cos(a) + (dz + 0.5) * Math.sin(a)) / rs;
        const keep = top - y + slope * 2.2 + detail.noise3((px + dx) * 0.9, y * 0.9, (pz + dz) * 0.9) * 0.9;
        if (keep >= 0) put(px + dx, y, pz + dz, M);
      }
  }

  /** A column drum lying on its side along `axis`, starting at (x0, z0), partly sunk. */
  function lyingDrum(axis: 'x' | 'z', x0: number, z0: number, len: number, r: number, sink: number): void {
    const cells = disc(r);
    const mx = axis === 'x' ? x0 + Math.floor(len / 2) : x0;
    const mz = axis === 'z' ? z0 + Math.floor(len / 2) : z0;
    const fy = floorHeight(mx, mz);
    const lo = Math.min(...cells.map((c) => c[1]));
    const yBase = fy - lo - sink;
    for (let i = 0; i < len; i++)
      for (const [da, db] of cells) {
        const x = axis === 'x' ? x0 + i : x0 + da;
        const z = axis === 'z' ? z0 + i : z0 + da;
        put(x, yBase + db, z, M);
      }
    // Fill under the drum so it beds into the floor rather than resting on a point.
    for (let i = 0; i < len; i++)
      for (let da = -2; da <= 1; da++) {
        const x = axis === 'x' ? x0 + i : x0 + da;
        const z = axis === 'z' ? z0 + i : z0 + da;
        for (let y = yBase + lo - 2; y < yBase + lo; y++) if (isAir(x, y, z)) put(x, y, z, B.GRAVEL);
      }
  }

  /** A flat fallen slab on the floor (w x d cells), optionally lifted to rest on another. */
  function slab(x0: number, z0: number, wx: number, dz: number, id: number, sink: number, lift = 0): void {
    const fy = floorHeight(x0 + (wx >> 1), z0 + (dz >> 1));
    for (let z = z0; z < z0 + dz; z++) for (let x = x0; x < x0 + wx; x++) put(x, fy - sink + lift, z, id);
  }

  function lanternPost(x: number, y: number, z: number, rotY: number, bright = false): void {
    const ex = Math.floor(x);
    const ez = Math.floor(z);
    // Stand on the real floor: terraces and rubble may have moved it since layout time.
    let fy = Math.floor(y) + 4;
    while (fy > Math.floor(y) - 5 && !(isAir(ex, fy, ez) && !isAir(ex, fy - 1, ez))) fy--;
    if (fy <= Math.floor(y) - 5) return; // no floor nearby (e.g. over the chasm): skip this lamp
    y = fy;
    const spec = addProp({ kind: 'lanternPost', x, y, z, rotY, emitters: [] });
    const ey = Math.floor(y) + 1;
    if (isAir(ex, ey, ez)) put(ex, ey, ez, bright ? B.LIGHT_AMBER : B.LIGHT_LAMP);
    spec.emitters.push([ex, ey, ez]);
  }

  /**
   * A crystal seam: host rock along the segment a..b is replaced by crystal where it faces
   * open space, so crystal reads as a vein in dark stone instead of a pile of glowing cubes.
   */
  function crystalSeam(a: V3, b: V3, r: number, max: number): number {
    let placed = 0;
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) * 2) + 1;
    for (let i = 0; i <= n && placed < max; i++) {
      const t = i / n;
      const c: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
      // Walk into the nearest rock if the line runs through open space.
      blob(c, r, (x, y, z) => {
        if (placed >= max) return;
        if (!isRock(get(x, y, z)) || !exposed6(x, y, z)) return;
        put(x, y, z, B.CRYSTAL);
        placed++;
      });
    }
    return placed;
  }

  /** A small minable shard cluster standing on the nearest floor below (x, y, z). */
  function shardOnFloor(x: number, y: number, z: number, scale: number): void {
    const px = Math.floor(x);
    const pz = Math.floor(z);
    let py = Math.floor(y) + 3;
    while (py > Math.floor(y) - 4 && !(isAir(px, py, pz) && !isAir(px, py - 1, pz))) py--;
    if (!(isAir(px, py, pz) && !isAir(px, py - 1, pz))) return;
    addProp({
      kind: 'crystalCluster', x, y: py, z, rotY: geoRng.range(0, Math.PI * 2), scale,
      emitters: [], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 1, max: 2 },
    });
  }

  /** Deep formations: a seam in the host rock with faceted clusters on the ground around it. */
  function crystalFormation(base: V3, count: number, length: number, lean: V3): void {
    const ln = Math.hypot(lean[0], lean[1], lean[2]);
    const dir: V3 = [lean[0] / ln, lean[1] / ln, lean[2] / ln];
    for (let i = 0; i < 16 && isAir(Math.floor(base[0]), Math.floor(base[1]), Math.floor(base[2])); i++) {
      base = [base[0] - dir[0], base[1] - dir[1], base[2] - dir[2]];
    }
    crystalSeam(base, [base[0] + dir[0] * 1.5, base[1] + dir[1] * 1.5, base[2] + dir[2] * 1.5], 1.2, 6 + count);
    if (dir[1] < 0.5) return;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
      const r = k === 0 ? 0.6 : rng.range(1.2, 2.4);
      const px = Math.floor(base[0] + Math.cos(a) * r);
      const pz = Math.floor(base[2] + Math.sin(a) * r);
      let py = Math.floor(base[1]) + 3;
      while (py > Math.floor(base[1]) - 4 && !(isAir(px, py, pz) && !isAir(px, py - 1, pz))) py--;
      if (!(isAir(px, py, pz) && !isAir(px, py - 1, pz))) continue;
      const scale = k === 0 ? length * 0.36 : rng.range(0.8, 1.3);
      addProp({
        kind: 'crystalCluster', x: px + 0.5, y: py, z: pz + 0.5, rotY: rng.range(0, Math.PI * 2), scale,
        emitters: k === 0 ? [[px, py, pz]] : [], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 1, max: 2 },
      });
    }
  }
}
