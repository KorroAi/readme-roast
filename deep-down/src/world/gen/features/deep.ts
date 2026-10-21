import { B, SOLID, isEmitter } from '../../../config/blocks';
import { Rng } from '../../../core/rng';
import { LIVING_TABLES } from '../../../config/livingRock';
import { hash32 } from '../../../core/math';
import { applyLiving, rollLiving } from './living';
import type { LivingSite } from './types';
import type { FeatureBuilder } from './index';
import type { V3 } from './types';

/**
 * The deep beyond the rift (finished game, content): three caverns carved into the solid rock under
 * the Hollow's floor, chained west and north from the rift floor's west edge (the reserved
 * `descentHook`). Each has its own light, its own rock and its own finds, and each opens with the
 * next pickaxe tier, so the tree keeps opening the world:
 *
 *   rift floor -> the Rootway -> the Glowroot Cavern (open; green-gold glowroot, hanging roots, soil
 *     and copper)
 *   Glowroot -> an Ironbound seal (tier 3) -> the Crystal Choir (a cathedral of echo spires around
 *     a builders' dais; cyan and violet)
 *   Glowroot -> Ember glass (tier 4) -> the Ember Deep (red fissures, lanternstone, iron; the
 *     floor at 148 m is the deepest point of the game)
 *
 * Everything is written inside the boxes declared here (the containment test), the caverns keep
 * at least 7 m of rock under the Hollow's floor (its lowest walk is y 36) and away from the rift's
 * walls, and the pass draws from its own random stream after every other place, so no earlier prop
 * id, position or draw changes.
 */
export function deepZones(b: FeatureBuilder): void {
  const w = b.w;
  const before = b.layout.living.map((s) => Array.from(s.cells, (i) => w.blocks[i]));
  const earlier = b.layout.living.slice();
  const d = new Deep(b);
  d.rootway();
  d.glowroot();
  d.choir();
  d.ember();
  // The Rootway opens the rift's west wall, where some cells are living rock: those leave the
  // living site, and the site re-deals its exact table over the cells it keeps (epoch 0).
  earlier.forEach((site, si) => {
    const keep: number[] = [];
    site.cells.forEach((i, k) => {
      if (w.blocks[i] === before[si][k]) keep.push(k);
    });
    if (keep.length === site.cells.length) return;
    for (const k of keep) w.blocks[site.cells[k]] = site.host[k];
    site.cells = Int32Array.from(keep.map((k) => site.cells[k]));
    site.host = Uint8Array.from(keep.map((k) => site.host[k]));
    applyLiving(w.blocks, w.blocks.slice(), w, site, rollLiving(site, b.ctx.seed, 0), (i, id) => {
      w.blocks[i] = id;
    });
  });
}

const HOST = new Set<number>([B.SLATE, B.DEEP_SLATE, B.UMBER, B.GRAVEL, B.SOIL, B.MOSS]);
const GLIMMER = (min: number, max: number) => ({ hardness: 2.5, tier: 1, drop: 'glimmerShard' as const, min, max });
const ECHO = (min: number, max: number) => ({ hardness: 4, tier: 3, drop: 'echoShard' as const, min, max });

/** Cavern centres (x, z), floor heights (feet) and radii: the tests and the tools read these. */
export const DEEP = {
  rootway: { from: [113, 6, 134] as V3, to: [97, 5, 135] as V3 },
  glowroot: { c: [83, 134] as const, floor: 4, rx: 13, rz: 12, h: 13 },
  choir: { c: [82, 98] as const, floor: 4, rx: 15, rz: 12, h: 22 },
  ember: { c: [44, 133] as const, floor: 2, rx: 14, rz: 12, h: 13 },
  /** The Choir's Ironbound seal (passage cells z 116..117) and the Ember glass (x 65..66). */
  choirSeal: { x0: 83, x1: 85, y0: 4, y1: 6, z0: 116, z1: 117 },
  emberSeal: { x0: 65, x1: 66, y0: 3, y1: 5, z0: 135, z1: 137 },
} as const;

class Deep {
  private readonly rng: Rng;
  private roots = 0;

  constructor(private readonly b: FeatureBuilder) {
    this.rng = new Rng(b.ctx.seed ^ 0xdee90001);
  }

  // ------------------------------------------------------------------------------------
  // The Rootway: a low passage west from the rift floor, roots already showing in its roof.

  rootway(): void {
    const b = this.b;
    b.box('rootway', [95, 4, 130], [115, 11, 139]);
    const { from, to } = DEEP.rootway;
    this.tunnel([from, [106, 6, 134.5], [101, 5, 135.5], to], 1.45, 3);
    // The rift's west edge opens into it: one more cell of head room where they meet.
    for (let z = 133; z <= 135; z++) for (let y = 6; y <= 8; y++) b.carve(113, y, z);
    // Roots creeping in from the cavern ahead, and the first glow of it.
    for (const x of [99.5, 102.5, 104.6]) this.root(x, 135 + this.rng.range(-0.8, 0.8), 2.4);
    b.keyLight(100, 6, 135, B.LIGHT_GLOWROOT);
    this.vein([103, 6, 133], B.COPPER_ORE, 4, [95, 4, 130], [115, 11, 139]);
    this.vein([108, 7, 136], B.IRON_ORE, 3, [95, 4, 130], [115, 11, 139]);
    b.poi('deep.rootway', [106, 7, 134.5], 'sight');
    b.landmark('rootway', [106, 6, 134.5]);
  }

  // ------------------------------------------------------------------------------------
  // The Glowroot Cavern: roots of the world above hang through its roof; the moss on its floor
  // gives a soft green-gold light of its own. Soil banks (root fibre), copper, the first lanternstone.

  glowroot(): void {
    const b = this.b;
    const Z = DEEP.glowroot;
    const [cx, cz] = Z.c;
    const box = { min: [cx - Z.rx - 3, 2, cz - Z.rz - 3] as V3, max: [cx + Z.rx + 3, Z.floor + Z.h + 4, cz + Z.rz + 3] as V3 };
    b.box('deep.glowroot', box.min, box.max);
    const floor = this.chamber(cx, cz, Z.rx, Z.rz, Z.floor, Z.h, 0.9);
    // Moss carpets the floor in drifts, soil banks lean on the walls.
    for (const [x, fy, z] of floor) {
      const n = b.noise.noise2(x * 0.17 + 11, z * 0.17 - 4);
      if (n > -0.15 && HOST.has(b.get(x, fy - 1, z))) b.put(x, fy - 1, z, B.MOSS);
    }
    this.skin(box.min, box.max, (x, y, z) => {
      if (y > Z.floor + 3) return;
      if (b.noise.noise3(x * 0.21, y * 0.3, z * 0.21) > 0.05) b.put(x, y, z, B.SOIL);
    });
    // Root curtains from the roof (no collision; they end well over head height).
    for (let k = 0; k < 30; k++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = Math.sqrt(this.rng.next()) * 0.85;
      this.root(cx + Math.cos(a) * r * Z.rx, cz + Math.sin(a) * r * Z.rz, 3.2);
    }
    // Glowroot light: drifts of it on the floor and tangles of it in the roof.
    const lights: Array<[number, number, number]> = [
      [cx - 7, Z.floor, cz - 4], [cx + 6, Z.floor, cz + 5], [cx - 2, Z.floor, cz + 8], [cx + 8, Z.floor, cz - 6],
      [cx - 9, Z.floor, cz + 4], [cx + 1, Z.floor, cz - 8], [cx + 2, Z.floor + 9, cz], [cx - 6, Z.floor + 7, cz + 2],
      [cx + 7, Z.floor + 6, cz + 1],
    ];
    for (const [x, y, z] of lights) b.keyLight(Math.floor(x), y, Math.floor(z), B.LIGHT_GLOWROOT);
    // Finds: copper in the walls, iron low down, a crystal seam, a little lanternstone, glimmer on the floor.
    for (const [x, y, z, ore, n] of [
      [cx - 12, 6, cz - 2, B.COPPER_ORE, 5], [cx + 11, 6, cz + 5, B.COPPER_ORE, 4], [cx - 3, 7, cz + 11, B.COPPER_ORE, 4],
      [cx + 4, 6, cz - 11, B.COPPER_ORE, 4], [cx - 10, 5, cz + 7, B.IRON_ORE, 3], [cx + 9, 5, cz - 8, B.IRON_ORE, 3],
      [cx + 12, 7, cz - 1, B.LANTERNSTONE, 2],
    ] as Array<[number, number, number, number, number]>)
      this.vein([x, y, z], ore, n, box.min, box.max);
    this.b.ctx.crystalSeam([cx - 8, 9, cz - 10], [cx - 3, 10, cz - 11], 0.9, 4);
    this.cluster('glowroot', cx + 3.4, cz + 2.6, 1.1, GLIMMER(1, 2));
    this.cluster('glowroot', cx - 5.2, cz - 6.1, 0.9, GLIMMER(1, 2));
    // A builders' tablet half sunk in the moss: the first relic beyond the rift.
    this.relic('glowroot', cx - 1.5, cz + 4.5, 'glowroot');
    b.moths('glowroot.a', [cx - 4, Z.floor + 2.2, cz + 1], 12, 3.2);
    b.moths('glowroot.b', [cx + 6, Z.floor + 3, cz - 3], 10, 3.0);
    b.moths('glowroot.c', [cx + 1, Z.floor + 5, cz + 7], 8, 2.6);
    b.discovery('glowroot', [cx - Z.rx + 2, Z.floor - 1, cz - Z.rz + 2], [cx + Z.rx - 2, Z.floor + 6, cz + Z.rz - 2]);
    b.layout.areas.push({ id: 'glowroot', p: [cx, Z.floor, cz], r: 14 });
    b.landmark('glowroot', [cx + 0.5, this.floorAt(cx, cz, Z.floor + 2), cz + 0.5]);
    b.poi('glowroot.heart', [cx, Z.floor + 2, cz], 'landmark');
    b.poi('glowroot.relic', [cx - 1.5, Z.floor + 0.6, cz + 4.5], 'pickup');
  }

  // ------------------------------------------------------------------------------------
  // The Crystal Choir: behind an Ironbound seal, a cathedral of echo-crystal spires round a builders'
  // dais. The spires ring when struck (echo shards); cyan from the high seams, violet from below.

  choir(): void {
    const b = this.b;
    const Z = DEEP.choir;
    const [cx, cz] = Z.c;
    const box = { min: [cx - Z.rx - 3, 2, cz - Z.rz - 3] as V3, max: [cx + Z.rx + 3, Z.floor + Z.h + 4, 125] as V3 };
    b.box('deep.choir', box.min, box.max);
    // The passage from the Glowroot's north wall, closed by the seal.
    this.tunnel([[84.5, 4, 124], [84.5, 4, 118], [84.5, 4, cz + Z.rz - 1]], 1.45, 3);
    const S = DEEP.choirSeal;
    for (let z = S.z0; z <= S.z1; z++) for (let y = S.y0; y <= S.y1; y++) for (let x = S.x0; x <= S.x1; x++) b.put(x, y, z, B.IRONBOUND);
    // A rune band over the seal, and a cold glint through a crack above it.
    for (let x = S.x0 - 1; x <= S.x1 + 1; x++) if (HOST.has(b.get(x, S.y1 + 1, S.z1 + 1))) b.put(x, S.y1 + 1, S.z1 + 1, B.GLYPH_STONE);
    b.keyLight(84, 5, 113, B.LIGHT_CYAN);
    b.poi('choir.seal', [84.5, 5.5, 118.5], 'sight');
    b.landmark('choirSeal', [84.5, 4, 119.5]);

    const floor = this.chamber(cx, cz, Z.rx, Z.rz, Z.floor, Z.h, 0.7);
    for (const [x, fy, z] of floor) if (HOST.has(b.get(x, fy - 1, z))) b.put(x, fy - 1, z, B.DEEP_SLATE);
    // The dais: a ring of dressed floor with a glyph kerb, the relic at its heart.
    const dais: V3 = [cx + 0.5, Z.floor, cz + 0.5];
    for (let z = cz - 5; z <= cz + 5; z++)
      for (let x = cx - 5; x <= cx + 5; x++) {
        const r = Math.hypot(x + 0.5 - dais[0], z + 0.5 - dais[2]);
        if (r > 4.6) continue;
        for (let y = Z.floor; y <= Z.floor + 4; y++) b.carve(x, y, z);
        b.put(x, Z.floor - 1, z, B.ANCIENT_TILE);
        if (r > 3.7 && (x + z) % 3 !== 0) b.put(x, Z.floor, z, B.GLYPH_STONE);
      }
    this.relic('choir', dais[0], dais[2], 'choir');
    // The spires: echo crystal round a glowing crystal core, tall and leaning a little.
    const spires: Array<[number, number, number, number]> = [
      [cx - 9, cz - 4, 1.8, 9], [cx + 9, cz + 3, 2.0, 10], [cx - 6, cz + 7, 1.5, 7], [cx + 6, cz - 7, 1.6, 8],
      [cx + 11, cz - 3, 1.3, 6], [cx - 12, cz + 3, 1.2, 5], [cx + 1, cz - 9, 1.2, 6], [cx - 2, cz + 9, 1.3, 6],
    ];
    for (const [x, z, r, h] of spires) this.spire(x, z, r, h, Z.floor);
    // Clusters at the spires' feet: echo for an iron pick, glimmer for anyone.
    this.cluster('choir', cx - 7.2, cz - 2.2, 1.6, ECHO(1, 2));
    this.cluster('choir', cx + 7.4, cz + 5.1, 1.8, ECHO(1, 2));
    this.cluster('choir', cx - 3.8, cz + 6.2, 1.2, GLIMMER(2, 3));
    this.cluster('choir', cx + 4.2, cz - 5.6, 1.3, GLIMMER(2, 3));
    // High cyan seams in the dome, violet from cracks in the floor's edge.
    this.b.ctx.crystalSeam([cx - 10, 16, cz - 8], [cx - 2, 20, cz - 11], 1.0, 8);
    this.b.ctx.crystalSeam([cx + 4, 15, cz + 10], [cx + 11, 18, cz + 6], 1.0, 8);
    for (const [x, y, z] of [[cx, Z.floor + 14, cz], [cx - 8, Z.floor + 9, cz + 1], [cx + 8, Z.floor + 10, cz - 1]] as V3[]) b.keyLight(x, y, z, B.LIGHT_CYAN);
    for (const [x, y, z] of [[cx - 12, Z.floor, cz - 6], [cx + 12, Z.floor, cz + 6]] as V3[]) b.keyLight(x, y, z, B.LIGHT_ABYSS);
    // Iron in the walls between the spires.
    for (const [x, y, z, n] of [[cx - 14, 6, cz, 4], [cx + 14, 7, cz - 2, 4], [cx + 3, 6, cz + 11, 3], [cx - 4, 6, cz - 11, 3]] as Array<[number, number, number, number]>)
      this.vein([x, y, z], B.IRON_ORE, n, box.min, box.max);
    b.moths('choir.a', [cx - 3, Z.floor + 4, cz - 2], 12, 4);
    b.moths('choir.b', [cx + 5, Z.floor + 7, cz + 3], 10, 4);
    b.discovery('choir', [cx - Z.rx + 2, Z.floor - 1, cz - Z.rz + 2], [cx + Z.rx - 2, Z.floor + 8, cz + Z.rz - 2]);
    b.layout.areas.push({ id: 'choir', p: [cx, Z.floor, cz], r: 15 });
    b.landmark('choir', dais);
    b.poi('choir.dais', [dais[0], Z.floor + 1, dais[2]], 'landmark');
    b.poi('choir.relic', [dais[0], Z.floor + 0.6, dais[2]], 'pickup');
  }

  // ------------------------------------------------------------------------------------
  // The Ember Deep: the bottom of the world behind a wall of ember glass. Red fissures breathe in
  // the walls, lanternstone grows at their backs, iron everywhere. Its floor is the deepest point.

  ember(): void {
    const b = this.b;
    const Z = DEEP.ember;
    const [cx, cz] = Z.c;
    const box = { min: [cx - Z.rx - 3, 1, cz - Z.rz - 3] as V3, max: [72, Z.floor + Z.h + 4, cz + Z.rz + 3] as V3 };
    b.box('deep.ember', box.min, box.max);
    // The descent from the Glowroot's west wall: a sloping passage down two metres, closed by the glass.
    this.tunnel([[71.5, 4, 136.5], [67, 4, 136.5], [62, 3, 135.5], [cx + Z.rx - 1, Z.floor, 134.5]], 1.45, 3);
    const S = DEEP.emberSeal;
    for (let z = S.z0; z <= S.z1; z++) for (let y = S.y0; y <= S.y1 + 1; y++) for (let x = S.x0; x <= S.x1; x++) if (!SOLID[b.get(x, y, z)] || HOST.has(b.get(x, y, z))) b.put(x, y, z, B.EMBER_GLASS);
    // The glass's red heart shows through a slit over it: something hot waits behind.
    b.keyLight(64, 6, 136, B.LIGHT_MAGMA);
    b.poi('ember.seal', [67.5, 4.5, 136.5], 'sight');
    b.landmark('emberSeal', [68.5, 4, 136.5]);

    const floor = this.chamber(cx, cz, Z.rx, Z.rz, Z.floor, Z.h, 0.8);
    for (const [x, fy, z] of floor) {
      const id = b.get(x, fy - 1, z);
      if (HOST.has(id)) b.put(x, fy - 1, z, b.noise.noise2(x * 0.3, z * 0.3) > 0.2 ? B.GRAVEL : B.UMBER);
    }
    // Fissures: narrow slits in the walls with a red glow inside and lanternstone at their backs.
    let fissures = 0;
    for (let k = 0; k < 40 && fissures < 9; k++) {
      const a = (k / 40) * Math.PI * 2 + this.rng.range(-0.1, 0.1);
      if (this.fissure(cx, cz, a, Z.rx, Z.rz, Z.floor)) fissures++;
    }
    // Lanternstone seams, rich iron, a little copper.
    for (const [x, y, z, ore, n] of [
      [cx - 13, 4, cz - 3, B.LANTERNSTONE, 3], [cx + 9, 3, cz + 9, B.LANTERNSTONE, 3], [cx - 4, 4, cz - 11, B.LANTERNSTONE, 2],
      [cx - 10, 3, cz + 8, B.IRON_ORE, 5], [cx + 12, 4, cz - 5, B.IRON_ORE, 5], [cx + 2, 3, cz + 11, B.IRON_ORE, 4],
      [cx - 13, 6, cz + 2, B.IRON_ORE, 4], [cx + 5, 5, cz - 11, B.COPPER_ORE, 4],
    ] as Array<[number, number, number, number, number]>)
      this.vein([x, y, z], ore, n, box.min, box.max);
    // The builders' hearth: a low ring of dressed stone round a bed of lanternstone, the last relic on it.
    const hx = cx + 0.5;
    const hz = cz + 0.5;
    for (let z = cz - 3; z <= cz + 3; z++)
      for (let x = cx - 3; x <= cx + 3; x++) {
        const r = Math.hypot(x + 0.5 - hx, z + 0.5 - hz);
        if (r > 3.2) continue;
        for (let y = Z.floor; y <= Z.floor + 4; y++) b.carve(x, y, z);
        b.put(x, Z.floor - 1, z, r < 1.2 ? B.LANTERNSTONE : B.ANCIENT_TILE);
        if (r > 2.3) b.put(x, Z.floor, z, B.ANCIENT_BRICK);
      }
    this.relic('ember', hx + 1.1, hz + 0.4, 'ember');
    this.livingWalls(box.min, box.max, Z.floor, [hx, hz]);
    // Two low key lights; the fissures carry the rest, so the walls read as dark rock with red veins.
    for (const [x, y, z] of [[cx - 6, Z.floor, cz + 5], [cx + 7, Z.floor, cz - 4]] as V3[]) b.keyLight(x, y, z, B.LIGHT_MAGMA);
    b.moths('ember.a', [cx - 2, Z.floor + 3, cz + 2], 10, 3.5);
    b.discovery('emberDeep', [cx - Z.rx + 2, Z.floor - 1, cz - Z.rz + 2], [cx + Z.rx - 2, Z.floor + 6, cz + Z.rz - 2]);
    b.layout.areas.push({ id: 'emberDeep', p: [cx, Z.floor, cz], r: 14 });
    b.landmark('emberDeep', [hx, Z.floor, hz]);
    b.poi('ember.hearth', [hx, Z.floor + 1, hz], 'landmark');
    b.poi('ember.relic', [hx + 1.1, Z.floor + 0.6, hz + 0.4], 'pickup');
  }

  /**
   * The Ember Deep breathes too: a third of its exposed wall rock at knee to head height becomes a
   * living site (iron and lanternstone re-roll every expedition into the Hollow, game/WorldFeatures).
   */
  private livingWalls(min: V3, max: V3, floor: number, hearth: [number, number]): void {
    const b = this.b;
    const w = b.w;
    const cells: number[] = [];
    const host: number[] = [];
    for (let z = min[2]; z <= max[2]; z++)
      for (let y = floor; y <= floor + 4; y++)
        for (let x = min[0]; x <= max[0]; x++) {
          const id = b.get(x, y, z);
          if (!HOST.has(id) || x > 59) continue;
          if (!(b.isAir(x + 1, y, z) || b.isAir(x - 1, y, z) || b.isAir(x, y, z + 1) || b.isAir(x, y, z - 1))) continue;
          if (Math.hypot(x + 0.5 - hearth[0], z + 0.5 - hearth[1]) < 4.5) continue;
          if (hash32(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ 0xe3b) % 3 !== 0) continue;
          cells.push(w.index(x, y, z));
          host.push(id);
        }
    const site: LivingSite = { id: 'emberWalls', area: 'emberDeep', cells: Int32Array.from(cells), host: Uint8Array.from(host), table: LIVING_TABLES.emberWalls.map((r) => ({ ...r })), box: { id: 'emberWalls', min, max } };
    applyLiving(w.blocks, w.blocks.slice(), w, site, rollLiving(site, b.ctx.seed, 0), (i, id) => {
      w.blocks[i] = id;
    });
    b.layout.living.push(site);
  }

  // ------------------------------------------------------------------------------------
  // Shapes

  /**
   * Carve a domed chamber over an elliptical floor (x radius rx, z radius rz), floor feet `floor`
   * rising by up to a metre toward the walls, roof `h` over the floor at the centre.
   * @returns the floor cells (x, feet y, z).
   */
  private chamber(cx: number, cz: number, rx: number, rz: number, floor: number, h: number, rough: number): Array<[number, number, number]> {
    const b = this.b;
    const out: Array<[number, number, number]> = [];
    for (let z = Math.floor(cz - rz - 2); z <= cz + rz + 2; z++)
      for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const nz = (z + 0.5 - cz) / rz;
        const r2 = nx * nx + nz * nz + b.noise.noise2(x * 0.19 + 3.1, z * 0.19 - 7.7) * 0.16 * rough;
        if (r2 >= 1) continue;
        const swell = r2 > 0.62 ? 1 : 0;
        const fy = Math.max(2, floor + swell + (b.noise.noise2(x * 0.09 - 2, z * 0.09 + 5) > 0.45 ? 1 : 0));
        const roof = floor + Math.max(3, Math.round(h * Math.sqrt(1 - Math.min(0.97, r2)) + b.noise.noise3(x * 0.15, 0.5, z * 0.15) * 2 * rough));
        for (let y = fy; y <= roof; y++) b.carve(x, y, z);
        if (SOLID[b.get(x, fy - 1, z)]) out.push([x, fy, z]);
      }
    return out;
  }

  /** A passage along feet points: a disc of radius r, `h` cells of head room over the feet. */
  private tunnel(pts: V3[], r: number, h: number): void {
    const b = this.b;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [a, c] = [pts[i], pts[i + 1]];
      const len = Math.hypot(c[0] - a[0], c[2] - a[2]);
      const n = Math.max(1, Math.ceil(len * 2));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const px = a[0] + (c[0] - a[0]) * t;
        const pz = a[2] + (c[2] - a[2]) * t;
        const fy = Math.round(a[1] + (c[1] - a[1]) * t);
        const R = Math.ceil(r);
        for (let dz = -R; dz <= R; dz++)
          for (let dx = -R; dx <= R; dx++) {
            const x = Math.floor(px) + dx;
            const z = Math.floor(pz) + dz;
            if (Math.hypot(x + 0.5 - px, z + 0.5 - pz) > r) continue;
            const top = fy + h - 1 + (Math.hypot(x + 0.5 - px, z + 0.5 - pz) < r * 0.55 ? 1 : 0);
            for (let y = fy; y <= top; y++) b.carve(x, y, z);
            if (!SOLID[b.get(x, fy - 1, z)]) b.put(x, fy - 1, z, B.DEEP_SLATE);
          }
      }
    }
  }

  /** Host rock facing open space inside the box: `fn` for each such cell. */
  private skin(min: V3, max: V3, fn: (x: number, y: number, z: number) => void): void {
    const b = this.b;
    for (let z = min[2]; z <= max[2]; z++)
      for (let y = min[1]; y <= max[1]; y++)
        for (let x = min[0]; x <= max[0]; x++) {
          if (!HOST.has(b.get(x, y, z))) continue;
          if (b.isAir(x + 1, y, z) || b.isAir(x - 1, y, z) || b.isAir(x, y, z + 1) || b.isAir(x, y, z - 1)) fn(x, y, z);
        }
  }

  /** A hanging root from the roof over (x, z), ending at least `clear` m over the floor. */
  private root(x: number, z: number, clear: number): void {
    const b = this.b;
    const fx = Math.floor(x);
    const fz = Math.floor(z);
    let fy = 1;
    while (fy < 30 && SOLID[b.get(fx, fy, fz)]) fy++;
    if (fy >= 30) return;
    let roof = fy;
    while (roof < 40 && !SOLID[b.get(fx, roof, fz)]) roof++;
    const span = roof - fy;
    if (span < clear + 0.8) return;
    const len = Math.min(span - clear, this.rng.range(1.2, 4.2));
    const w = this.rng.range(0.07, 0.16);
    const tip: V3 = [x + this.rng.range(-0.35, 0.35), roof - len, z + this.rng.range(-0.35, 0.35)];
    b.beam(`f_deep_root_${this.roots++}`, [x, roof + 0.15, z], tip, w, w * this.rng.range(0.8, 1.2), 2, this.rng.range(0, 1.5));
  }

  /** Grow a small vein of `ore` from the exposed host rock nearest `at` (inside the box). */
  private vein(at: V3, ore: number, size: number, min: V3, max: V3): void {
    const b = this.b;
    const inBox = (x: number, y: number, z: number) => x >= min[0] && x <= max[0] && y >= min[1] && y <= max[1] && z >= min[2] && z <= max[2];
    const exposed = (x: number, y: number, z: number) => b.isAir(x + 1, y, z) || b.isAir(x - 1, y, z) || b.isAir(x, y, z + 1) || b.isAir(x, y, z - 1) || b.isAir(x, y + 1, z);
    let start: V3 | null = null;
    let best = Infinity;
    for (let dz = -4; dz <= 4; dz++)
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const x = at[0] + dx;
          const y = at[1] + dy;
          const z = at[2] + dz;
          if (!inBox(x, y, z) || !HOST.has(b.get(x, y, z)) || !exposed(x, y, z)) continue;
          const d = Math.hypot(dx, dy * 1.5, dz);
          if (d < best) {
            best = d;
            start = [x, y, z];
          }
        }
    if (!start) return;
    let cur: V3 = start;
    for (let k = 0; k < size; k++) {
      if (HOST.has(b.get(...cur))) b.put(cur[0], cur[1], cur[2], ore);
      const dirs: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      const next = dirs.map(([dx, dy, dz]) => [cur[0] + dx, cur[1] + dy, cur[2] + dz] as V3).filter((c) => inBox(...c) && HOST.has(b.get(...c)) && exposed(...c));
      if (!next.length) break;
      cur = next[Math.floor(this.rng.next() * next.length)];
    }
    b.poi(`deep.ore.${start.join('_')}`, [start[0] + 0.5, start[1] + 0.5, start[2] + 0.5], 'pickup', false);
  }

  /** An echo spire: a leaning cone of echo crystal with a glowing crystal core near its top. */
  private spire(x: number, z: number, r: number, h: number, floor: number): void {
    const b = this.b;
    const lean = [this.rng.range(-0.12, 0.12), this.rng.range(-0.12, 0.12)];
    for (let k = 0; k < h; k++) {
      const y = floor + k;
      const rr = r * (1 - k / (h + 0.6)) + 0.35;
      const sx = x + lean[0] * k;
      const sz = z + lean[1] * k;
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          const cx = Math.floor(sx) + dx;
          const cz = Math.floor(sz) + dz;
          const d = Math.hypot(cx + 0.5 - sx, cz + 0.5 - sz);
          if (d > rr) continue;
          if (SOLID[b.get(cx, y, cz)] && !HOST.has(b.get(cx, y, cz))) continue;
          if (isEmitter(b.get(cx, y, cz))) continue;
          const core = d < rr * 0.45 && k >= h * 0.55;
          b.put(cx, y, cz, core ? B.CRYSTAL : B.ECHO_CRYSTAL);
        }
    }
    b.poi(`choir.spire.${Math.round(x)}_${Math.round(z)}`, [x, floor + h * 0.5, z], 'landmark', false);
  }

  /** A fissure in the cavern wall in direction `a`: a slit with a red light, lanternstone behind. */
  private fissure(cx: number, cz: number, a: number, rx: number, rz: number, floor: number): boolean {
    const b = this.b;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    // March out from the centre to the first wall cell at knee height.
    let wx = 0;
    let wz = 0;
    let found = false;
    for (let s = 2; s < Math.max(rx, rz) + 4; s += 0.5) {
      wx = Math.floor(cx + dx * s);
      wz = Math.floor(cz + dz * s);
      if (SOLID[b.get(wx, floor + 1, wz)]) {
        found = true;
        break;
      }
    }
    if (!found || !HOST.has(b.get(wx, floor + 1, wz))) return false;
    const ox = Math.round(dx);
    const oz = Math.round(dz);
    const tall = 3 + Math.floor(this.rng.next() * 3);
    for (let y = floor + 1; y < floor + 1 + tall; y++) {
      if (!HOST.has(b.get(wx, y, wz))) return false;
    }
    for (let y = floor + 1; y < floor + 1 + tall; y++) {
      b.carve(wx, y, wz);
      const bx = wx + ox;
      const bz = wz + oz;
      if (HOST.has(b.get(bx, y, bz))) b.put(bx, y, bz, B.LANTERNSTONE);
    }
    b.put(wx, floor + 1 + Math.floor(tall / 2), wz, B.LIGHT_MAGMA);
    b.poi(`ember.fissure.${wx}_${wz}`, [wx + 0.5, floor + 2, wz + 0.5], 'sight', false);
    return true;
  }

  /** A minable crystal cluster on the floor under (x, z). */
  private cluster(place: string, x: number, z: number, scale: number, minable: { hardness: number; tier: number; drop: 'glimmerShard' | 'echoShard'; min: number; max: number }): void {
    const b = this.b;
    const y = this.floorAt(Math.floor(x), Math.floor(z), 24);
    if (y < 0) return;
    b.prop(place, { kind: 'crystalCluster', x, y, z, rotY: this.rng.range(0, Math.PI * 2), scale, minable, anchor: [Math.floor(x), y - 1, Math.floor(z)] });
    b.poi(`deep.${place}.cluster.${Math.round(x)}_${Math.round(z)}`, [x, y + 0.5, z], 'pickup', false);
  }

  /** A builders' tablet (a relic: its key item and journal page, game/WorldFeatures). */
  private relic(place: string, x: number, z: number, id: string): void {
    const b = this.b;
    const y = this.floorAt(Math.floor(x), Math.floor(z), 24);
    if (y < 0) return;
    b.prop(place, { kind: 'tablet', x, y, z, rotY: this.rng.range(0, Math.PI * 2), scale: 0.9, interact: 'feature', feature: { kind: 'relic', id }, anchor: [Math.floor(x), y - 1, Math.floor(z)] });
    b.landmark(`relic_${id}`, [x, y, z]);
  }

  /** Feet height of the floor in column (x, z) at or below `y` (open cell over solid), or -1. */
  private floorAt(x: number, z: number, y: number): number {
    const b = this.b;
    let fy = y;
    while (fy > 1 && !(b.isAir(x, fy, z) && b.isAir(x, fy + 1, z) && SOLID[b.get(x, fy - 1, z)])) fy--;
    return fy > 1 ? fy : -1;
  }
}
