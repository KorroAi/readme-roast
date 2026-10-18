import { B, SOLID } from '../../config/blocks';
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
 * monumental ancient stairs down to a pillared floor, a hidden shrine behind crumbling
 * brick, a violet-lit chasm that glimpses a rift far below, and a sealed temple gate that
 * the first pickaxe upgrade opens. Noise only adds natural irregularity to that plan.
 *
 * Everything is deterministic for a given seed.
 */

type V3 = [number, number, number];

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
  const props: PropSpec[] = [];
  const discoveries: Region[] = [];
  const landmarks: Record<string, V3> = {};
  let propSeq = 0;

  const { sx, sy, sz } = w;
  const interior = (x: number, y: number, z: number) => x > 0 && y > 0 && z > 0 && x < sx - 1 && y < sy - 1 && z < sz - 1;
  const carve = (x: number, y: number, z: number) => {
    if (interior(x, y, z)) w.blocks[w.index(x, y, z)] = B.AIR;
  };
  const put = (x: number, y: number, z: number, id: number) => {
    if (interior(x, y, z)) w.blocks[w.index(x, y, z)] = id;
  };
  const get = (x: number, y: number, z: number) => w.get(x, y, z);
  const isAir = (x: number, y: number, z: number) => !SOLID[w.get(x, y, z)];

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
      if (isAir(ex, ey, ez)) put(ex, ey, ez, spec.kind === 'campfire' ? B.LIGHT_EMBER : B.LIGHT_AMBER);
    }
    props.push(spec);
    return spec;
  };
  const setEmitter = (x: number, y: number, z: number, id: number) => {
    if (isAir(x, y, z)) put(x, y, z, id);
  };

  // ------------------------------------------------------------------------------------
  // 1. Base rock: depth-layered stone with umber strata near the top and deep slate below.
  for (let z = 0; z < sz; z++)
    for (let x = 0; x < sx; x++) {
      const strataOffset = noise.fbm2(x * 0.02, z * 0.02, 2) * 6;
      const deepLine = 56 + noise.fbm2(x * 0.03 + 40, z * 0.03, 2) * 6;
      for (let y = 0; y < sy; y++) {
        let id: number;
        if (!interior(x, y, z)) id = B.BEDROCK;
        else if (y < deepLine) id = B.DEEP_SLATE;
        else {
          const band = (y + strataOffset) % 11;
          id = y > 84 && band < 1.6 ? B.UMBER : B.SLATE;
        }
        w.blocks[x + sx * (y + sy * z)] = id;
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
  // 2. The Lantern Hollow: a vast chamber, wide at the floor, domed above.
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
      for (let y = fh; y <= H.cy + H.ry + 2; y++) {
        const e = hollowField(x, y, z);
        if (e > 1.15) continue;
        const n = noise.fbm3(x * 0.055, y * 0.07, z * 0.055, 2) * 0.13 + detail.noise3(x * 0.2, y * 0.2, z * 0.2) * 0.03;
        if (e + n < 1) carve(x, y, z);
      }
    }
  mark('hollow');

  // Stalactites and stalagmites give the dome scale and silhouette.
  for (let i = 0; i < 46; i++) {
    const x = H.cx + rng.range(-H.rx * 0.8, H.rx * 0.8);
    const z = H.cz + rng.range(-H.rz * 0.8, H.rz * 0.8);
    let y = 80;
    while (y < sy - 2 && isAir(Math.floor(x), y, Math.floor(z))) y++;
    if (y >= sy - 2) continue;
    const len = rng.range(5, 17);
    const r = rng.range(1.4, 3.2);
    cone([x, y, z], -1, len, r, rng.chance(0.5) ? B.SLATE : B.DEEP_SLATE);
  }
  for (let i = 0; i < 14; i++) {
    const x = H.cx + rng.range(-H.rx * 0.75, H.rx * 0.75);
    const z = H.cz + rng.range(-H.rz * 0.75, H.rz * 0.75);
    if (x > 106 && x < 136 && z > 118 && z < 140) continue; // keep the chasm area clear
    let y = 60;
    while (y > 2 && isAir(Math.floor(x), y, Math.floor(z))) y--;
    cone([x, y, z], 1, rng.range(2, 6), rng.range(1, 2), B.DEEP_SLATE);
  }
  mark('formations');

  // ------------------------------------------------------------------------------------
  // 3. Camp: a low, warm pocket near the top with a plank deck around a fire pit.
  const camp: Region = { id: 'camp', min: [24, 100, 30], max: [51, 111, 53] };
  for (let z = 29; z <= 54; z++)
    for (let x = 22; x <= 52; x++)
      for (let y = 101; y <= 112; y++) {
        const dx = (x - 37) / 14.5;
        const dz = (z - 41) / 12.5;
        const dy = (y - 101) / 9.5;
        const e = Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dz), 3) + Math.pow(Math.max(0, dy), 2.2);
        const n = noise.fbm3(x * 0.12, y * 0.12, z * 0.12, 2) * 0.25;
        if (e + n < 1) carve(x, y, z);
      }
  for (let z = 29; z <= 54; z++) for (let x = 22; x <= 52; x++) if (isAir(x, 101, z)) put(x, 100, z, B.SOIL);
  for (let z = 35; z <= 47; z++) for (let x = 29; x <= 43; x++) put(x, 100, z, B.PLANK);
  for (let z = 40; z <= 42; z++) for (let x = 35; x <= 37; x++) put(x, 100, z, B.HEARTH);
  // Support frame; the south-east post has snapped and its crossbeam lies on the floor.
  const posts: V3[] = [[29, 0, 35], [43, 0, 35], [29, 0, 47]];
  for (const [px, , pz] of posts) for (let y = 101; y <= 107; y++) put(px, y, pz, B.BEAM);
  for (let y = 101; y <= 103; y++) put(43, y, 47, B.BEAM);
  for (let x = 29; x <= 43; x++) put(x, 107, 35, B.BEAM);
  for (let z = 35; z <= 47; z++) put(29, 107, z, B.BEAM);
  for (let x = 29; x <= 36; x++) put(x, 107, 47, B.BEAM);
  line([37, 101, 48], [44, 102, 45], (x, y, z) => put(x, y, z, B.BEAM));
  blob([45, 101, 49], 1.8, (x, y, z) => { if (y >= 101 && isAir(x, y, z)) put(x, y, z, B.GRAVEL); });
  blob([47, 101, 33], 1.5, (x, y, z) => { if (y >= 101 && isAir(x, y, z)) put(x, y, z, B.SLATE); });
  // Make sure the camp ceiling clears the frame everywhere.
  for (let z = 34; z <= 48; z++) for (let x = 28; x <= 44; x++) for (let y = 101; y <= 106; y++) if (get(x, y, z) === B.SLATE || get(x, y, z) === B.UMBER) carve(x, y, z);

  addProp({ kind: 'campfire', x: 36.5, y: 101, z: 41.5, emitters: [[36, 101, 41]], interact: 'rest' });
  addProp({ kind: 'workbench', x: 40.5, y: 101, z: 37.5, rotY: Math.PI, interact: 'craft' });
  addProp({ kind: 'chest', x: 31.5, y: 101, z: 37.5, rotY: Math.PI, interact: 'storage' });
  addProp({ kind: 'bedroll', x: 32.5, y: 101, z: 45, rotY: 0.2 });
  addProp({ kind: 'crate', x: 41.5, y: 101, z: 45.5, rotY: 0.3 });
  addProp({ kind: 'crate', x: 42.4, y: 101, z: 43.9, rotY: -0.2, scale: 0.8 });
  addProp({ kind: 'barrel', x: 30.5, y: 101, z: 43.5 });
  addProp({ kind: 'pickaxeRack', x: 29.6, y: 101, z: 40.5, rotY: Math.PI / 2 });
  addProp({ kind: 'ropeCoil', x: 34, y: 101, z: 36.2 });
  addProp({ kind: 'hangingLantern', x: 32.5, y: 105.2, z: 35.5, anchor: [32, 107, 35], emitters: [[32, 105, 35]] });
  addProp({ kind: 'hangingLantern', x: 29.5, y: 105.2, z: 44.5, anchor: [29, 107, 44], emitters: [[29, 105, 44]] });
  const spawn = { x: 34.5, y: 101, z: 43.2, yaw: -Math.PI / 2 };
  landmarks.campfire = [36.5, 101, 41.5];
  landmarks.workbench = [40.5, 101, 37.5];
  mark('camp');

  // ------------------------------------------------------------------------------------
  // 4. Descent tunnel from the camp to the Hollow ledge, marked by route lanterns.
  const route: V3[] = [
    [48, 101, 41], [58, 100, 43], [66, 98, 49], [71, 96, 57], [75, 93, 64], [80, 91, 70], [85, 89, 73], [90, 88, 76],
  ];
  carveTunnel(route, 2.5, 4.6);
  // A side pocket with the first glimmer crystals: an early, safe taste of the mystery.
  carveRoom([76, 96, 55], 3.2, 3.0, 3.2);
  crystalFormation([77.5, 96, 54.5], 4, 3.5, [0, 1, -0.3]);
  discoveries.push({ id: 'crystals', min: [71, 93, 50], max: [81, 101, 60] });
  landmarks.firstCrystals = [77, 96, 55];

  lanternPost(57, 100, 45.2, 0.3);
  lanternPost(72.6, 96, 59.2, -0.6);
  lanternPost(81.5, 91, 72.2, 0.9);
  mark('tunnel');

  // ------------------------------------------------------------------------------------
  // 5. The ledge: a rock balcony overlooking the Hollow (the reveal).
  for (let z = 66; z <= 86; z++)
    for (let x = 82; x <= 100; x++) {
      const d = Math.hypot((x - 91) / 8.5, (z - 76) / 7.5);
      if (d > 1 + detail.noise2(x * 0.3, z * 0.3) * 0.12) continue;
      const depth = Math.round((1 - d) * 9 + 1);
      for (let y = 87 - depth; y <= 87; y++) put(x, y, z, y === 87 && d < 0.85 ? B.SLATE : B.DEEP_SLATE);
      for (let y = 88; y <= 93; y++) carve(x, y, z);
    }
  lanternPost(94.5, 88, 73.5, 0.2, true);
  discoveries.push({ id: 'hollow', min: [84, 86, 68], max: [100, 96, 84] });
  landmarks.ledge = [92, 88, 76];
  mark('ledge');

  // ------------------------------------------------------------------------------------
  // 6. Monumental ancient stairs: two flights with arches beneath and glowing balusters.
  for (let k = 0; k <= 22; k++) {
    const x = 96 + k;
    const top = 87 - k;
    for (let z = 72; z <= 75; z++) {
      for (let y = floorBase - 4; y <= top; y++) put(x, y, z, B.ANCIENT_BRICK);
      for (let y = top + 1; y <= top + 5; y++) carve(x, y, z);
    }
    if (k % 4 === 2) put(x, top + 1, 71, B.GLYPH_STONE);
    put(x, top, 71, B.ANCIENT_BRICK);
  }
  for (const ax of [101, 107, 113]) {
    for (let x = ax - 2; x <= ax + 1; x++)
      for (let y = floorBase; y <= floorBase + 11; y++) {
        const archTop = floorBase + 8 + Math.round(Math.sqrt(Math.max(0, 4 - (x - ax + 0.5) ** 2)) * 1.5);
        if (y <= archTop) for (let z = 71; z <= 75; z++) carve(x, y, z);
      }
  }
  for (let z = 69; z <= 79; z++)
    for (let x = 119; x <= 126; x++) {
      for (let y = floorBase - 4; y <= 64; y++) put(x, y, z, B.ANCIENT_BRICK);
      for (let y = 65; y <= 70; y++) carve(x, y, z);
    }
  lanternPost(125, 65, 70.5, 0, true);
  for (let k = 0; k <= 22; k++) {
    const z = 80 + k;
    const top = 63 - k;
    for (let x = 121; x <= 124; x++) {
      for (let y = floorBase - 4; y <= top; y++) put(x, y, z, B.ANCIENT_BRICK);
      for (let y = top + 1; y <= top + 5; y++) carve(x, y, z);
    }
    if (k % 4 === 1) put(125, top + 1, z, B.GLYPH_STONE);
    put(125, top, z, B.ANCIENT_BRICK);
  }
  lanternPost(119.5, floorBase + 1, 103.5, 0.4);
  landmarks.stairsBottom = [122.5, floorBase + 1, 104];
  mark('stairs');

  // ------------------------------------------------------------------------------------
  // 7. The pillared hall: the remains of a building far older than the camp.
  const pillarSpots: Array<[number, number, 'full' | 'broken' | 'stump']> = [
    [80, 92, 'broken'], [92, 98, 'stump'], [106, 92, 'full'],
    [80, 108, 'full'], [94, 112, 'broken'], [108, 112, 'broken'],
    [82, 124, 'broken'], [96, 128, 'full'], [110, 119, 'stump'],
  ];
  for (const [px, pz, kind] of pillarSpots) pillar(px, pz, kind);
  // A fallen column lies across the floor.
  for (let i = 0; i < 13; i++) {
    const x = 90 + i;
    const z = Math.round(108 + i * 0.35);
    const fy = floorHeight(x, z);
    for (let dy = 0; dy < 3; dy++) for (let dz = -1; dz <= 1; dz++) if (i % 4 !== 3 || dy < 2) put(x, fy + dy, z + dz, B.ANCIENT_BRICK);
  }
  mark('pillars');

  // ------------------------------------------------------------------------------------
  // 8. The Rift below the floor, glimpsed through a violet chasm, crossed by a bridge.
  const R = { cx: 124, cy: 20, cz: 132, rx: 17, ry: 17, rz: 18 };
  for (let z = R.cz - R.rz - 2; z <= R.cz + R.rz + 2; z++)
    for (let y = 3; y <= R.cy + R.ry + 2; y++)
      for (let x = R.cx - R.rx - 2; x <= R.cx + R.rx + 2; x++) {
        const e = Math.hypot((x - R.cx) / R.rx, (y - R.cy) / R.ry, (z - R.cz) / R.rz);
        const n = noise.fbm3(x * 0.08, y * 0.08, z * 0.08, 2) * 0.16;
        if (e + n < 1 && y >= 6) carve(x, y, z);
      }
  for (let z = 124; z <= 133; z++)
    for (let x = 109; x <= 136; x++) {
      const halfWidth = 2.4 + noise.noise2(x * 0.15, 3.3) * 1.2 - Math.abs(x - 122) * 0.035;
      if (Math.abs(z - 128.5 + noise.noise2(x * 0.08, 9.1) * 2) > halfWidth) continue;
      for (let y = 30; y <= floorBase + 6; y++) carve(x, y, z);
    }
  // Bridge with low rails.
  for (let z = 122; z <= 135; z++) {
    for (let x = 120; x <= 124; x++) {
      put(x, floorBase, z, x === 122 && z % 3 === 0 ? B.ANCIENT_TILE : B.ANCIENT_BRICK);
      put(x, floorBase - 1, z, B.ANCIENT_BRICK);
      if (Math.abs(z - 128.5) < 3) put(x, floorBase - 2, z, B.ANCIENT_BRICK);
      for (let y = floorBase + 1; y <= floorBase + 5; y++) if (x > 120 && x < 124) carve(x, y, z);
    }
    put(120, floorBase + 1, z, B.ANCIENT_BRICK);
    put(124, floorBase + 1, z, B.ANCIENT_BRICK);
  }
  put(120, floorBase + 2, 122, B.GLYPH_STONE);
  put(124, floorBase + 2, 122, B.GLYPH_STONE);
  put(120, floorBase + 2, 135, B.GLYPH_STONE);
  put(124, floorBase + 2, 135, B.GLYPH_STONE);
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
  crystalFormation([110, 12, 128], 5, 6, [0.4, 1, 0.1]);
  crystalFormation([137, 16, 140], 4, 5, [-0.5, 1, -0.2]);
  landmarks.bridge = [122.5, floorBase + 1, 128.5];
  landmarks.monolith = [123.5, 6, 135.5];
  mark('rift');

  // ------------------------------------------------------------------------------------
  // 9. The sealed temple gate on the east wall and the Deep Gate path to the rift balcony.
  for (let z = 88; z <= 113; z++)
    for (let y = floorBase - 3; y <= 66; y++)
      for (let x = 137; x <= 146; x++) {
        if (x >= 139) {
          if (isAir(x, y, z)) put(x, y, z, B.DEEP_SLATE);
          continue;
        }
        put(x, y, z, B.ANCIENT_BRICK);
      }
  for (const bz of [88, 89, 90, 111, 112, 113]) for (let y = floorBase - 1; y <= 64; y++) for (let x = 135; x <= 136; x++) put(x, y, bz, B.ANCIENT_BRICK);
  for (let z = 98; z <= 103; z++) for (let y = floorBase + 1; y <= floorBase + 8; y++) put(137, y, z, B.GLYPH_STONE);
  for (let z = 99; z <= 102; z++)
    for (let y = floorBase + 1; y <= floorBase + 6; y++) {
      put(137, y, z, B.HARDENED_SLATE);
      put(138, y, z, B.HARDENED_SLATE);
    }
  for (let z = 99; z <= 102; z++) for (let x = 132; x <= 136; x++) for (let y = floorBase + 1; y <= floorBase + 7; y++) carve(x, y, z);
  for (let z = 99; z <= 102; z++) for (let x = 130; x <= 136; x++) put(x, floorBase, z, B.ANCIENT_TILE);
  landmarks.seal = [136.5, floorBase + 1, 100.5];
  // Corridor east, stairs down south, then west onto the balcony.
  for (let x = 139; x <= 151; x++) for (let z = 99; z <= 102; z++) {
    put(x, floorBase, z, B.ANCIENT_TILE);
    for (let y = floorBase + 1; y <= floorBase + 5; y++) carve(x, y, z);
  }
  for (let k = 0; k <= 17; k++) {
    const z = 103 + k;
    const walk = floorBase + 1 - k;
    for (let x = 147; x <= 151; x++) {
      put(x, walk - 1, z, B.ANCIENT_BRICK);
      for (let y = walk; y <= walk + 5; y++) carve(x, y, z);
    }
  }
  const lowWalk = floorBase + 1 - 17;
  for (let z = 120; z <= 129; z++) for (let x = 141; x <= 151; x++) {
    put(x, lowWalk - 1, z, B.ANCIENT_TILE);
    for (let y = lowWalk; y <= lowWalk + 5; y++) carve(x, y, z);
  }
  for (let z = 122; z <= 132; z++)
    for (let x = 132; x <= 141; x++) {
      put(x, lowWalk - 1, z, B.ANCIENT_TILE);
      put(x, lowWalk - 2, z, B.ANCIENT_BRICK);
      for (let y = lowWalk; y <= lowWalk + 6; y++) carve(x, y, z);
      if (x === 132 || z === 122 || z === 132) put(x, lowWalk, z, B.ANCIENT_BRICK);
    }
  put(132, lowWalk + 1, 122, B.GLYPH_STONE);
  put(132, lowWalk + 1, 132, B.GLYPH_STONE);
  lanternPost(149.5, floorBase + 1, 100.5, 0, true);
  lanternPost(140.5, lowWalk, 127.5, 0, true);
  discoveries.push({ id: 'gate', min: [131, lowWalk - 1, 121], max: [142, lowWalk + 6, 133] });
  landmarks.balcony = [136, lowWalk, 127];
  mark('gate');

  // ------------------------------------------------------------------------------------
  // 10. The Sealed Shrine, hidden behind a half-buried facade on the west wall.
  const shrine = { x0: 52, x1: 61, z0: 98, z1: 110, y0: floorBase + 1, y1: floorBase + 7 };
  for (let z = shrine.z0 - 1; z <= shrine.z1 + 1; z++)
    for (let x = shrine.x0 - 1; x <= shrine.x1 + 1; x++)
      for (let y = shrine.y0 - 1; y <= shrine.y1 + 1; y++) {
        const wall = x === shrine.x0 - 1 || x === shrine.x1 + 1 || z === shrine.z0 - 1 || z === shrine.z1 + 1 || y === shrine.y1 + 1;
        if (y === shrine.y0 - 1) put(x, y, z, B.ANCIENT_TILE);
        else if (wall) put(x, y, z, (x + z + y) % 5 === 0 && y < shrine.y1 ? B.GLYPH_STONE : B.ANCIENT_BRICK);
        else carve(x, y, z);
      }
  // Facade toward the Hollow, partly swallowed by rock and rubble.
  for (let z = 96; z <= 112; z++)
    for (let y = floorBase - 1; y <= floorBase + 10; y++) {
      const buried = y > floorBase + 6 + Math.round(noise.noise2(z * 0.4, 5) * 3);
      if (!buried) put(62, y, z, B.ANCIENT_BRICK);
    }
  for (let z = 102; z <= 105; z++) for (let y = floorBase + 1; y <= floorBase + 4; y++) put(62, y, z, B.CRUMBLING_BRICK);
  for (let z = 95; z <= 113; z++) for (let x = 63; x <= 67; x++) for (let y = floorBase + 1; y <= floorBase + 6; y++) {
    if (x === 63 && (z < 101 || z > 106) && y > floorBase + 3 && rng.chance(0.5)) continue;
    carve(x, y, z);
  }
  for (let z = 95; z <= 113; z++) for (let x = 63; x <= 67; x++) put(x, floorBase, z, B.SOIL);
  blob([64, floorBase + 1, 98], 1.7, (x, y, z) => { if (y > floorBase && x >= 63) put(x, y, z, B.GRAVEL); });
  blob([64, floorBase + 1, 109], 2, (x, y, z) => { if (y > floorBase && x >= 63) put(x, y, z, B.ANCIENT_BRICK); });
  addProp({ kind: 'tablet', x: 55.5, y: shrine.y0, z: 104, rotY: Math.PI / 2, interact: 'relic', emitters: [] });
  setEmitter(57, shrine.y0 + 2, 104, B.LIGHT_CYAN);
  addProp({ kind: 'crystalCluster', x: 53.5, y: shrine.y0, z: 99.5, scale: 0.9, emitters: [], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 2, max: 3 } });
  addProp({ kind: 'crystalCluster', x: 53.5, y: shrine.y0, z: 108.5, scale: 1, emitters: [], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 2, max: 3 } });
  discoveries.push({ id: 'shrine', min: [shrine.x0, shrine.y0 - 1, shrine.z0], max: [shrine.x1 + 1, shrine.y1, shrine.z1 + 1] });
  landmarks.shrineDoor = [62, floorBase + 1, 103.5];
  landmarks.tablet = [55.5, shrine.y0, 104];
  mark('shrine');

  // ------------------------------------------------------------------------------------
  // 11. Crystal landmarks in the Hollow.
  crystalFormation([113, floorBase + 1, 108], 5, 5.5, [-0.3, 1, 0.25]);
  crystalFormation([71, 58, 122], 6, 7, [0.7, 0.6, -0.4]);
  crystalFormation([132, 70, 78], 4, 5, [-0.6, -0.8, 0.3]);
  addProp({ kind: 'crystalCluster', x: 110.5, y: floorBase + 1 + 0, z: 105.5, scale: 0.8, emitters: [], minable: { hardness: 2.5, tier: 1, drop: 'glimmerShard', min: 1, max: 2 } });
  landmarks.hollowCrystals = [113, floorBase + 1, 108];
  mark('crystals');

  // ------------------------------------------------------------------------------------
  // 12. Surface dressing: soil and glowmoss floors, then visible ore veins on walls.
  for (let z = 1; z < sz - 1; z++)
    for (let x = 1; x < sx - 1; x++)
      for (let y = 2; y < sy - 2; y++) {
        const id = w.blocks[w.index(x, y, z)];
        if (id !== B.SLATE && id !== B.DEEP_SLATE) continue;
        if (!isAir(x, y + 1, z)) continue;
        const n = detail.noise3(x * 0.09, y * 0.09, z * 0.09);
        if (n > 0.32) put(x, y, z, B.MOSS);
        else if (n < -0.38) put(x, y, z, B.GRAVEL);
        else if (n < -0.22 && y > 80) put(x, y, z, B.SOIL);
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
    for (let y = 0; y < sy; y++)
      for (let x = 0; x < sx; x++) if (!interior(x, y, z)) w.blocks[x + sx * (y + sy * z)] = B.BEDROCK;
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

  /** Cone hanging down (dir = -1) or rising (dir = 1) from the base point. */
  function cone(base: V3, dir: number, len: number, r: number, id: number): void {
    for (let i = 0; i <= len; i++) {
      const rr = r * (1 - i / (len + 1));
      const y = Math.floor(base[1]) + dir * i;
      const R = Math.ceil(rr);
      for (let dz = -R; dz <= R; dz++)
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dz * dz > rr * rr) continue;
          const x = Math.floor(base[0]) + dx;
          const z = Math.floor(base[2]) + dz;
          if (isAir(x, y, z)) put(x, y, z, id);
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
            for (let y = floor; y < floor + h; y++) carve(Math.round(cx + dx), y, Math.round(cz + dz));
          }
      }
    }
  }

  function lanternPost(x: number, y: number, z: number, rotY: number, bright = false): void {
    const ex = Math.floor(x);
    const ez = Math.floor(z);
    const spec = addProp({ kind: 'lanternPost', x, y, z, rotY, emitters: [] });
    const ey = Math.floor(y) + 1;
    if (isAir(ex, ey, ez)) put(ex, ey, ez, bright ? B.LIGHT_AMBER : B.LIGHT_LAMP);
    spec.emitters.push([ex, ey, ez]);
  }

  function crystalFormation(base: V3, count: number, length: number, lean: V3): void {
    const ln = Math.hypot(lean[0], lean[1], lean[2]);
    const dir: V3 = [lean[0] / ln, lean[1] / ln, lean[2] / ln];
    // Root the formation in the nearest rock behind it so crystals never float.
    for (let i = 0; i < 16 && isAir(Math.floor(base[0]), Math.floor(base[1]), Math.floor(base[2])); i++) {
      base = [base[0] - dir[0], base[1] - dir[1], base[2] - dir[2]];
    }
    base = [base[0] + dir[0] * 0.8, base[1] + dir[1] * 0.8, base[2] + dir[2] * 0.8];
    for (let i = 0; i < count; i++) {
      const spread = i === 0 ? 0 : 1.8;
      const b: V3 = [base[0] + rng.range(-spread, spread), base[1] - 0.5, base[2] + rng.range(-spread, spread)];
      const d: V3 = [dir[0] + rng.range(-0.35, 0.35), dir[1], dir[2] + rng.range(-0.35, 0.35)];
      const dl = Math.hypot(d[0], d[1], d[2]);
      const L = length * (i === 0 ? 1 : rng.range(0.45, 0.8));
      const r0 = i === 0 ? 1.45 : rng.range(0.8, 1.2);
      const steps = Math.ceil(L * 3);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const p: V3 = [b[0] + (d[0] / dl) * L * t, b[1] + (d[1] / dl) * L * t, b[2] + (d[2] / dl) * L * t];
        const r = r0 * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.32);
        const R = Math.ceil(r);
        for (let dz = -R; dz <= R; dz++)
          for (let dy = -R; dy <= R; dy++)
            for (let dx = -R; dx <= R; dx++) {
              if (dx * dx + dy * dy + dz * dz > r * r + 0.25) continue;
              const x = Math.floor(p[0]) + dx;
              const y = Math.floor(p[1]) + dy;
              const z = Math.floor(p[2]) + dz;
              const cur = get(x, y, z);
              if (cur === B.AIR || cur === B.SLATE || cur === B.DEEP_SLATE || cur === B.MOSS || cur === B.GRAVEL || cur === B.SOIL) put(x, y, z, B.CRYSTAL);
            }
      }
    }
  }

  function pillar(px: number, pz: number, kind: 'full' | 'broken' | 'stump'): void {
    const fy = floorHeight(px, pz);
    let top: number;
    if (kind === 'full') {
      top = fy;
      while (top < sy - 2 && isAir(px, top + 1, pz)) top++;
    } else if (kind === 'broken') top = fy + rng.int(9, 22);
    else top = fy + rng.int(2, 4);
    for (let y = fy - 2; y <= top; y++) {
      const base = y < fy + 2;
      const capital = kind === 'full' && y > top - 2;
      const r = base || capital ? 2 : 1;
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          if (kind !== 'full' && y > top - 2 && rng.chance(0.45)) continue;
          const band = !base && !capital && (y - fy) % 13 === 6 && kind !== 'stump';
          put(px + dx, y, pz + dz, band && (dx === 0 || dz === 0) && Math.abs(dx) + Math.abs(dz) === 1 ? B.GLYPH_STONE : B.ANCIENT_BRICK);
        }
    }
    if (kind !== 'full') {
      for (let i = 0; i < 5; i++) {
        const rx = px + rng.int(-4, 4);
        const rz = pz + rng.int(-4, 4);
        const ry = floorHeight(rx, rz);
        blob([rx, ry, rz], rng.range(0.6, 1.3), (x, y, z) => { if (isAir(x, y, z) && y >= ry) put(x, y, z, B.ANCIENT_BRICK); });
      }
    }
  }
}
