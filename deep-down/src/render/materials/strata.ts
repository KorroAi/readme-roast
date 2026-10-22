import { Field2, MAT_SIZE, MatCanvas, PeriodicCells, Rng, cached, chip, cloneField, crackCurve, crackPath, fbm, hash2, mixHex, ramp, resolve, rngFor, wrap, wrapDelta } from './paint';
import { BEDROCK_SIDE, DEEP_SIDE, DEEP_TOP, STONE_SIDE, STONE_TOP, WEATHERED_SIDE, WEATHERED_TOP, floorField, rockField, type FloorMap, type FloorStyle, type RockMap, type RockStyle } from './rock';
import { VeinMask, branchingVein, crust, crystal, ensureCoverage, paintVein } from './minerals';
import { gravel, soil, soilSide } from './earth';
import { roots as rootsPainter } from './finds';
import * as P from './palette';

/**
 * Round 3 (VIS): the twelve biomes' materials, in the Lantern Voxel discipline (albedo ramps, every
 * visible change a whole ramp step, carved grooves rather than lines, glow only where it means
 * something). Each biome's rocks reuse the hand-made rock structure (beds, joints, partings,
 * fractures, chips) through their own ramps and a structural style, then add what makes them that
 * place: mycelium threads, root fibres, rime frost, sulphur crust, calcite banding, basalt columns,
 * vesicles, moss. Ores are painted *into* their host rock (the same structure, so a vein continues
 * the wall beside it). A few materials have their own structure: ice, snow, lava, obsidian, the
 * giant fungi's stems and caps, the bog's toxic pools and crust, the city's dressed stone and runed
 * brick, the gate seal, cracked walls, the Heart's stone.
 *
 * Every layer is tagged with the biomes that use it (STRATA_LAYERS): generateMaterials can paint only
 * the current stratum's (the rest become a flat stand-in nobody sees).
 */

const S = MAT_SIZE;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------
// Ramps (sRGB albedo, dark -> light; mids around 0.05-0.10 linear, lights 0.15-0.22)

const R = {
  amberLime: [0x1c1915, 0x27231d, 0x332e26, 0x403a30, 0x4e463a, 0x5e5545, 0x6f6552, 0x83775f],
  amberSand: [0x1e1610, 0x2a1f16, 0x37291c, 0x453323, 0x543e2a, 0x644a32, 0x75573b, 0x886646],
  amberFloor: [0x1a1713, 0x231f1a, 0x2c2720, 0x363027, 0x41392e, 0x4c4335, 0x584e3d],
  amberOre: [0x3a1c06, 0x58290a, 0x7e3c0d, 0xa85612, 0xcf7a20, 0xeca23c],
  mycel: [0x111119, 0x171720, 0x1e1d29, 0x262532, 0x2f2d3d, 0x393749, 0x444256, 0x514e65],
  sporeLoam: [0x17121a, 0x1d1621, 0x241b29, 0x2c2132, 0x35283b, 0x3f2f45, 0x4a3750],
  mycelFloor: [0x0f1818, 0x132020, 0x182828, 0x1d3131, 0x243a3a, 0x2b4443, 0x334f4d],
  sporeQuartz: [0x041214, 0x07191c, 0x0b2328, 0x102e33, 0x163a40, 0x1e4a4f, 0x285a5e, 0x346c6e],
  stem: [0x252429, 0x2f2d34, 0x3a3740, 0x45414c, 0x504c58, 0x5b5664, 0x676170, 0x736c7e],
  capTeal: [0x081614, 0x0c1e1c, 0x112825, 0x17322e, 0x1e3d38, 0x264943, 0x2f564f],
  capMagenta: [0x1a0c18, 0x231220, 0x2c1628, 0x361b31, 0x41213b, 0x4d2847, 0x5a3053],
  rootEarth: [0x19130d, 0x211811, 0x2a1f15, 0x33261a, 0x3d2e1f, 0x483625, 0x543f2b],
  rootClay: [0x21180f, 0x2c2013, 0x382917, 0x45321c, 0x523c22, 0x614728, 0x71532f, 0x815f37],
  rootFloor: [0x17120c, 0x1e1810, 0x261e14, 0x2f2518, 0x382c1d, 0x423422],
  gold: [0x3a2806, 0x5a3e09, 0x80590d, 0xa87612, 0xcf961c, 0xedb732],
  bark: [0x1a120b, 0x22170e, 0x2b1d12, 0x352416, 0x402c1b, 0x4c3520, 0x593f26, 0x674a2d],
  flood: [0x0d1218, 0x131a22, 0x19222c, 0x202b37, 0x283543, 0x313f50, 0x3b4b5e, 0x47586d],
  floodShale: [0x0b0f15, 0x10151c, 0x151b24, 0x1b222c, 0x212935, 0x28313f, 0x30394a, 0x394355],
  floodFloor: [0x0e131a, 0x131a22, 0x18202a, 0x1e2733, 0x252f3c, 0x2c3746],
  pearl: [0x3c4450, 0x525c6a, 0x6a7686, 0x8492a2, 0xa0acba, 0xbcc6d2],
  geode: [0x100b17, 0x160f20, 0x1d1429, 0x251a34, 0x2e2040, 0x38284d, 0x43305b, 0x503a6b],
  calcite: [0x26222c, 0x322d3a, 0x3e3948, 0x4b4557, 0x595267, 0x676077, 0x766e87, 0x857c97],
  geodeFloor: [0x120d19, 0x181221, 0x1f172a, 0x271d34, 0x2f233e, 0x382a49],
  amethyst: [0x0e0618, 0x150a24, 0x1f0f33, 0x2a1545, 0x381c5a, 0x48256f, 0x5a2f86, 0x6e3a9e],
  mine: [0x18120e, 0x201812, 0x292017, 0x33281c, 0x3e3022, 0x4a3a29, 0x574430, 0x655038],
  mineShale: [0x131315, 0x19191c, 0x1f1f23, 0x26262b, 0x2e2e33, 0x37373d, 0x414148, 0x4c4c54],
  mineFloor: [0x161210, 0x1d1814, 0x251f19, 0x2d261f, 0x362e25, 0x40372b],
  coal: [0x07070a, 0x0c0c10, 0x121217, 0x19191f, 0x222229, 0x2d2d35],
  silver: [0x2a2c33, 0x40434c, 0x5a5e69, 0x787d89, 0x989ea9, 0xbac0ca],
  ice: [0x0b1c2e, 0x102840, 0x163552, 0x1d4364, 0x255275, 0x2f6286, 0x3a7297, 0x4783a8],
  frostRock: [0x161c25, 0x1d2430, 0x242d3b, 0x2c3646, 0x354052, 0x3f4b5e, 0x4a576b, 0x566479],
  snow: [0x3a4656, 0x45526a, 0x505e76, 0x5b6a82, 0x67778e, 0x73839a, 0x7f8fa5],
  frostIron: [0x1c2430, 0x283444, 0x364658, 0x46596e, 0x5a6f86, 0x70879e],
  iceCrystal: [0x0a2030, 0x0f2b3e, 0x15384e, 0x1d4760, 0x275873, 0x336a86, 0x417d99, 0x5191ac],
  jungle: [0x0d120d, 0x121812, 0x181f17, 0x1e271d, 0x252f23, 0x2d382a, 0x354232, 0x3f4d3b],
  jungleLoam: [0x13120a, 0x19180d, 0x201e11, 0x272515, 0x2f2c19, 0x37341e],
  jungleMoss: [0x0c1a0a, 0x10220d, 0x152b11, 0x1b3515, 0x22401a, 0x2a4b1f, 0x335725],
  verdite: [0x03140a, 0x051c0e, 0x082714, 0x0c331a, 0x114122, 0x18502b, 0x206036, 0x2a7242],
  sap: [0x2a1404, 0x3e1d06, 0x562a08, 0x72390b, 0x904a10, 0xae5e18, 0xc87622],
  vine: [0x0a1408, 0x0f1c0c, 0x152610, 0x1b3014, 0x223b19, 0x2a471e],
  sulphurRock: [0x17170b, 0x1e1e0e, 0x262612, 0x2f2f16, 0x38381a, 0x43431f, 0x4f4f25, 0x5c5c2b],
  bogMud: [0x12120a, 0x17170c, 0x1d1d0f, 0x232312, 0x2a2a16, 0x32321a],
  bogCrust: [0x1c1c0f, 0x242413, 0x2d2d18, 0x37371d, 0x414123, 0x4c4c29],
  sulphur: [0x3a3a08, 0x56560c, 0x767410, 0x989414, 0xbab41c, 0xd8d22a],
  opal: [0x0a2018, 0x0f2c22, 0x153a2d, 0x1d4a3a, 0x275b48, 0x336c57, 0x407f68, 0x4f927a],
  toxic: [0x142006, 0x1c2c08, 0x263a0b, 0x30480e, 0x3c5812, 0x486816],
  city: [0x211b12, 0x2b2318, 0x362c1e, 0x413624, 0x4d402b, 0x5a4b33, 0x68573b, 0x776444],
  cityBrick: [0x1f1810, 0x282015, 0x32281a, 0x3d3120, 0x483a26, 0x54442d, 0x614f35],
  cityTile: [0x1c1812, 0x241f17, 0x2d271d, 0x363023, 0x40392a, 0x4b4331, 0x574d39],
  runegold: [0x3e2a06, 0x5e400a, 0x84600e, 0xac8216, 0xd2a422, 0xf0c63a],
  orichalcum: [0x3c1608, 0x5a220c, 0x803212, 0xa8461a, 0xcc6026, 0xe8803a],
  basalt: [0x131213, 0x1a1819, 0x221f21, 0x2a2729, 0x332f32, 0x3d393c, 0x484347, 0x544e52],
  scoria: [0x1c0e0a, 0x26130d, 0x311911, 0x3d1f15, 0x4a261a, 0x582e20, 0x663626],
  ash: [0x1c1a1a, 0x232121, 0x2b2828, 0x333030, 0x3c3838, 0x464141, 0x504a4a],
  emberite: [0x1c0602, 0x2c0a03, 0x420f04, 0x5c1606, 0x7a2009, 0x9a2c0e, 0xbc3c14],
  obsidian: [0x07060b, 0x0b0910, 0x0f0c16, 0x14101d, 0x1a1525, 0x211b2f, 0x2a223b],
  voidStone: [0x0c0a12, 0x110e19, 0x161221, 0x1c172a, 0x231d34, 0x2b243f, 0x342b4b],
  voidshard: [0x0c0418, 0x130725, 0x1c0b35, 0x271048, 0x34175e, 0x431f76, 0x552990, 0x6834aa],
  starsteel: [0x24242e, 0x363646, 0x4c4c60, 0x64647c, 0x80809a, 0x9e9eb8],
  heart: [0x12050a, 0x1a070e, 0x240a13, 0x300e1a, 0x3d1222, 0x4b172b, 0x5a1d35],
  gate: [0x0f1015, 0x15161d, 0x1c1d26, 0x242530, 0x2d2e3b, 0x373846, 0x424352],
  doorOak: [0x1a120b, 0x23180f, 0x2d1f13, 0x382718, 0x44301d, 0x503922, 0x5d4228],
  builtOak: [0x2a1d12, 0x362617, 0x43301d, 0x513a23, 0x5f452a, 0x6e5031, 0x7d5c38],
  doorIron: [0x16171a, 0x1f2024, 0x2a2b30, 0x36373d, 0x44454c, 0x55565e, 0x6a6b74],
  plate: [0x1a1c22, 0x22252c, 0x2b2e37, 0x353943, 0x40444f, 0x4b505c, 0x575c69],
} as const;

// ---------------------------------------------------------------------------------------
// Shared structure (cached per pass): a biome's host rock, so its ores continue it.

type Base = 'stone' | 'deep' | 'weathered' | 'bedrock';
const SIDE_BASE: Record<Base, RockStyle> = { stone: STONE_SIDE, deep: DEEP_SIDE, weathered: WEATHERED_SIDE, bedrock: BEDROCK_SIDE };
const TOP_BASE: Record<Exclude<Base, 'bedrock'>, FloorStyle> = { stone: STONE_TOP, deep: DEEP_TOP, weathered: WEATHERED_TOP };

interface HostDef {
  base: Base;
  pal: readonly number[];
  crack: number;
  style?: Partial<RockStyle>;
  /** What makes the rock that place (applied after the ramp). */
  overlay?: (c: MatCanvas, rng: Rng, m: RockMap) => void;
}

function hostMap(key: string, h: HostDef): RockMap {
  const m = cached(`strata:${key}`, () => rockField(rngFor(`strata:${key}`), { ...SIDE_BASE[h.base], pal: h.pal, crack: h.crack, ...h.style }));
  return { ...m, f: cloneField(m.f) };
}

function floorMap(key: string, base: Exclude<Base, 'bedrock'>, pal: readonly number[], crack: number, style: Partial<FloorStyle> = {}): FloorMap {
  const m = cached(`strataTop:${key}`, () => floorField(rngFor(`strataTop:${key}`), { ...TOP_BASE[base], pal, crack, ...style }));
  return { ...m, f: cloneField(m.f) };
}

/** Paint a host rock side (structure + ramp + its overlay). */
function paintHost(c: MatCanvas, key: string, h: HostDef): RockMap {
  const m = hostMap(key, h);
  resolve(c, m.f, h.pal, h.crack);
  h.overlay?.(c, rngFor(`strata:${key}:overlay`), m);
  return m;
}

// ---------------------------------------------------------------------------------------
// Overlays

/** Pale branching threads (mycelium) or dark fibres (roots) creeping over the rock. */
function threads(c: MatCanvas, rng: Rng, color: number, count: number, opacity: number, lift = 0): void {
  for (let k = 0; k < count; k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(10, 34), 0.35, 0.1);
    pts.forEach(([x, y], j) => {
      if (j % 9 === 4 && rng.chance(0.5)) {
        const br = crackPath(rng, x, y, rng.next() * TAU, rng.int(3, 8), 0.5, 0.2);
        for (const [bx, by] of br) c.tint(bx, by, color, opacity * 0.6);
      }
      c.tint(x, y, color, opacity);
      if (lift) c.setHeight(x, y, Math.max(c.height(x, y), lift));
    });
  }
}

/** Clumps of a crust (moss, rime, sulphur) that gather on the upper lips of cracks and partings. */
function crustClumps(c: MatCanvas, rng: Rng, code: Uint8Array, pal: readonly number[], amount: number, height: number, onTop = true): void {
  const patch = fbm(rng, 8, 2);
  const fine = fbm(rng, 32, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      // On walls a crust sits on the lip above a crack (code 1 below), on floors anywhere patchy.
      const below = code[x + wrap(y + 1) * S] === 1 || code[x + wrap(y + 2) * S] === 1;
      const p = patch(x, y);
      const want = onTop ? (below ? 0.25 : 0) + p : p;
      if (want < 1 - amount) continue;
      if (code[i] === 1) continue;
      const t = Math.min(1, (want - (1 - amount)) / Math.max(amount, 0.05));
      const f = fine(x, y);
      const tone = Math.min(pal.length - 1, Math.floor((0.25 + t * 0.55 + (f - 0.5) * 0.3) * pal.length));
      c.set(x, y, mixHex(c.getHex(x, y), pal[Math.max(0, tone)], 0.55 + 0.35 * t), Math.max(c.height(x, y), height + t * 40));
    }
}

/** Specks that glow (spores, embers): pairs of texels with emissive alpha (layers with glow > 0). */
function glowSpecks(c: MatCanvas, rng: Rng, color: number, count: number, alpha: number): void {
  for (let k = 0; k < count; k++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    const a = alpha * (0.5 + rng.next() * 0.5);
    c.set(x, y, color, a);
    if (rng.chance(0.6)) c.set(x + 1, y, mixHex(color, c.getHex(x + 1, y), 0.4), a * 0.6);
  }
}

/** Concentric agate bands (calcite, sinter) around a few centres. */
function bands(c: MatCanvas, rng: Rng, pal: readonly number[], centres: number, strength: number): void {
  const cells = new PeriodicCells(rng, centres, centres, 0.9);
  const wob = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = cells.query(x, y, 1, 1.6);
      const ring = Math.sin((q.d1 + (wob(x, y) - 0.5) * 6) * 1.25);
      if (ring < 0.35) continue;
      const tone = ring > 0.85 ? pal.length - 2 : Math.floor(pal.length * 0.55);
      c.tint(x, y, pal[tone], strength * (ring - 0.35));
    }
}

/** Vesicles: round gas pits, dark inside with a lit lower rim (scoria, pumice). */
function vesicles(c: MatCanvas, rng: Rng, count: number, dark: number): void {
  for (let k = 0; k < count; k++) {
    const cx = rng.next() * S;
    const cy = rng.next() * S;
    const r = 0.8 + rng.next() * 1.8;
    const R2 = Math.ceil(r + 1);
    for (let dy = -R2; dy <= R2; dy++)
      for (let dx = -R2; dx <= R2; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r + 0.6) continue;
        const px = cx + dx;
        const py = cy + dy;
        if (d <= r) {
          c.tint(px, py, dark, 0.7);
          c.setHeight(px, py, 20);
        } else if (dy > 0) c.tint(px, py, 0xffffff, 0.06);
      }
  }
}

/**
 * Prism joints (columnar basalt). Walls (`vertical`): columns 0.6-1.2 m wide running up the face with
 * a slight lean, each face a tone of its own and a lit arris on one side; floors: the hexagonal
 * pavement of the columns' tops.
 */
function columnJoints(c: MatCanvas, rng: Rng, across: number, crack: number, vertical = true): void {
  const cols = vertical ? null : new PeriodicCells(rng, across, across, 0.75);
  const xs: number[] = [];
  const tone: number[] = [];
  for (let k = 0; k < across; k++) {
    xs.push(((k + 0.5 + (rng.next() - 0.5) * 0.6) * S) / across);
    tone.push(rng.next());
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let e: number;
      let r: number;
      let side: number;
      if (cols) {
        const q = cols.query(x, y);
        e = q.d2 - q.d1;
        const cell = cols.cells[q.id];
        r = cell.r;
        side = wrapDelta(cell.x, x) + wrapDelta(cell.y, y);
      } else {
        const px = wrap(x + Math.sin((y / S) * TAU) * 1.6);
        let d1 = Infinity;
        let d2 = Infinity;
        let id = 0;
        for (let k = 0; k < across; k++) {
          const d = Math.abs(wrapDelta(xs[k], px));
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = k;
          } else if (d < d2) d2 = d;
        }
        e = d2 - d1;
        r = tone[id];
        side = wrapDelta(xs[id], px);
      }
      if (e < 1.0) {
        c.set(x, y, mixHex(c.getHex(x, y), crack, 0.75), 20);
        continue;
      }
      // Each prism catches the light on its own face: a step up or down, a lit arris on one side.
      const f = (r - 0.5) * 0.36 + (e < 2.4 ? (side < 0 ? 0.3 : -0.25) : 0);
      c.tint(x, y, f > 0 ? 0x8a8288 : 0x000000, Math.min(0.5, Math.abs(f)));
      c.setHeight(x, y, 150 + r * 60);
    }
  // Cross joints every 0.5-1.5 m on the walls: short horizontal breaks.
  if (vertical)
    for (let k = 0; k < 18; k++) {
      const x0 = rng.int(0, S - 1);
      const y0 = rng.int(0, S - 1);
      const len = rng.int(4, 9);
      for (let j = 0; j < len; j++) c.set(x0 + j, y0 + (j > len / 2 ? 1 : 0), mixHex(c.getHex(x0 + j, y0), crack, 0.6), 30);
    }
}

// ---------------------------------------------------------------------------------------
// Ores and gems painted into a host

type VeinKind = 'branch' | 'band' | 'nugget' | 'seam';

function oreInto(c: MatCanvas, rng: Rng, hostKey: string, host: HostDef, kind: VeinKind, pal: readonly number[], glint: number, crustPal?: readonly number[]): void {
  const m = paintHost(c, hostKey, host);
  const mask = new VeinMask();
  if (kind === 'branch') {
    for (const fr of m.fractures) mask.draw(fr, (t) => 0.8 + Math.sin(t * Math.PI) * 0.7);
    for (let k = 0; k < 5; k++) branchingVein(mask, rng, rng.next() * S, rng.next() * S, (rng.chance(0.5) ? 1 : -1) * (0.9 + rng.next() * 0.5), rng.int(40, 90), 1.15);
    ensureCoverage(mask, rng, 10, (x, y) => branchingVein(mask, rng, x, y, rng.next() * TAU, rng.int(8, 16), 0.9));
  } else if (kind === 'band') {
    // Bands following the strata (pinching and swelling), as banded iron does.
    const bandBeds = m.thick.map(() => rng.chance(0.5));
    const pinch = fbm(rng, 8, 2);
    for (let i = 0; i < S * S; i++) {
      const b = m.bed[i];
      if (!bandBeds[b]) continue;
      const dy = m.bedY[i] - m.bedStart[b];
      const w = m.thick[b] * (0.25 + pinch(i % S, Math.floor(i / S)) * 0.4);
      if (dy > 1 && dy < 1 + w) mask.m[i] = 1;
    }
    ensureCoverage(mask, rng, 12, (x, y) => mask.draw(crackPath(rng, x, y, (rng.next() - 0.5) * 0.4, rng.int(10, 20), 0.1, 0.03), () => 1.2));
  } else if (kind === 'nugget') {
    // Nuggets and wires: clusters of round grains, a few strung along short wires.
    const cells = new PeriodicCells(rng, 14, 14, 0.9);
    for (const cl of cells.cells) {
      if (cl.r > 0.62) continue;
      const n = 1 + Math.floor(cl.r2 * 4);
      for (let k = 0; k < n; k++) mask.stamp(Math.round(cl.x + (rng.next() - 0.5) * 7), Math.round(cl.y + (rng.next() - 0.5) * 7), 0.9 + rng.next() * 1.6);
      if (cl.r3 > 0.6) mask.draw(crackPath(rng, cl.x, cl.y, rng.next() * TAU, rng.int(4, 10), 0.4, 0.1), () => 0.6);
    }
    ensureCoverage(mask, rng, 9, (x, y) => mask.stamp(x, y, 1.6));
  } else {
    // Seams: thick dark beds (coal), with a few lenses.
    const seamBeds = m.thick.map((t) => t > 9 && rng.chance(0.55));
    for (let i = 0; i < S * S; i++) {
      const b = m.bed[i];
      const dy = m.bedY[i] - m.bedStart[b];
      if (seamBeds[b] && dy > 1.5 && dy < m.thick[b] - 1.5) mask.m[i] = 1;
    }
    ensureCoverage(mask, rng, 20, (x, y) => mask.draw(crackPath(rng, x, y, 0, rng.int(12, 24), 0.08, 0.02), () => 2));
  }
  if (crustPal) crust(c, rng, mask, crustPal, 0.4, 0.06);
  paintVein(c, rng, mask, pal, glint, kind === 'seam' ? 0.05 : 0.28, kind === 'seam' ? 150 : 215);
}

/**
 * A crystal druse (prisms, the shader sparkles them) in a ramp, its inner glow and edge glints;
 * with `pockets`, the points crowd in pockets of `hostPal` rock (gems), otherwise they fill the face.
 */
function druse(c: MatCanvas, rng: Rng, pal: readonly number[], glow: number, edge: number, pockets: readonly number[] | null, glowMul = 1): void {
  crystal(c, rng);
  const cells = pockets ? new PeriodicCells(rng, 9, 9, 0.9) : null;
  const hostN = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = c.idx(x, y);
      if (cells && pockets) {
        const q = cells.query(x, y);
        const cell = cells.cells[q.id];
        const r = Math.hypot(wrapDelta(cell.x, x), wrapDelta(cell.y, y) * 1.2);
        const Rr = 4.2 + cell.r * 3.5;
        if (r > Rr) {
          const rind = r < Rr + 1.3 ? 0.14 : 0;
          c.set(x, y, ramp(pockets, 0.34 + (hostN(x, y) - 0.5) * 0.22 + rind, x, y, 0), 90 + rind * 300);
          continue;
        }
      }
      const lum = (c.rgb[i * 3] * 0.3 + c.rgb[i * 3 + 1] * 0.55 + c.rgb[i * 3 + 2] * 0.15) / 255;
      const g = c.a[i];
      let hex = ramp(pal, Math.min(0.99, lum * 2.6), x, y, 0);
      if (g > 200) hex = edge;
      else if (g > 0) hex = mixHex(hex, glow, Math.min(0.45, g / 300));
      c.set(x, y, hex, Math.min(255, g * glowMul));
    }
}

// ---------------------------------------------------------------------------------------
// Painters with their own structure

/** Swap a painted canvas onto another ramp by luminance (keeps every structure, changes the stone). */
function onto(c: MatCanvas, pal: readonly number[], lift = 0): void {
  let lo = Infinity;
  let hi = -Infinity;
  const n = S * S;
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const l = c.rgb[i * 3] * 0.2126 + c.rgb[i * 3 + 1] * 0.7152 + c.rgb[i * 3 + 2] * 0.0722;
    lum[i] = l;
    if (l < lo) lo = l;
    if (l > hi) hi = l;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < n; i++) {
    const t = Math.min(0.999, Math.max(0, (lum[i] - lo) / span + lift));
    const hex = pal[Math.floor(t * pal.length)];
    c.rgb[i * 3] = (hex >> 16) & 255;
    c.rgb[i * 3 + 1] = (hex >> 8) & 255;
    c.rgb[i * 3 + 2] = hex & 255;
  }
}

/** Blue glacier ice: broad smooth plates, pale fracture planes, trapped bubbles, a faint inner light. */
function ice(c: MatCanvas, rng: Rng): void {
  const plates = new PeriodicCells(rng, 5, 4, 0.9);
  const n = fbm(rng, 4, 3, 0.55);
  const fine = fbm(rng, 24, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = plates.query(x, y, 1, 1.3);
      const cell = plates.cells[q.id];
      const e = q.d2 - q.d1;
      // Deeper blue inside a plate, paler toward its edges (where the light scatters).
      let v = 0.3 + (cell.r - 0.5) * 0.2 + (n(x, y) - 0.5) * 0.3 + (fine(x, y) - 0.5) * 0.04 + Math.max(0, 1 - e / 6) * 0.18;
      let a = 20 + Math.max(0, 1 - e / 5) * 40;
      if (e < 0.9) {
        v = 0.86;
        a = 90;
      }
      c.set(x, y, ramp(R.ice, Math.min(0.99, Math.max(0, v)), x, y, 0), a);
    }
  // Fracture planes: long pale lines, a few.
  for (let k = 0; k < 5; k++) {
    const pts = crackCurve(rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(30, 70), 0.08, 0.02);
    for (const [x, y] of pts) {
      c.set(x, y, mixHex(c.getHex(x, y), 0x9fd0ec, 0.45), 110);
      c.tint(x + 1, y + 1, 0x061420, 0.3);
    }
  }
  // Bubbles: tiny pale rings.
  for (let k = 0; k < 40; k++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    c.set(x, y, 0x8cc4e0, 120);
    if (rng.chance(0.5)) c.set(x + 1, y, mixHex(0x8cc4e0, c.getHex(x + 1, y), 0.5), 70);
  }
}

/** Snow and hoar: soft drifts, wind ripples, sparkle pairs (never white: albedo, not light). */
function snow(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const drift = fbm(rng, 4, 3, 0.55);
  const ripple = fbm(rng, 16, 1, 0.5, 4);
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    f.v[i] = 0.5 + (drift(x, y) - 0.5) * 0.35 + (Math.sin((ripple(x, y) * 3 + y * 0.18) * TAU) * 0.06);
    f.h[i] = 120 + drift(x, y) * 80;
  }
  resolve(c, f, R.snow, 0x2a3442, 0);
  for (let k = 0; k < 70; k++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    c.set(x, y, R.snow[R.snow.length - 1]);
    c.set(x + 1, y + 1, R.snow[R.snow.length - 2]);
  }
}

/** Lava: dark crust plates drifting on a glowing melt; the cracks between are the hot light. */
function lava(c: MatCanvas, rng: Rng, cells = 7): void {
  const plates = new PeriodicCells(rng, cells, Math.max(3, cells - 1), 0.95);
  const n = fbm(rng, 8, 2);
  const crustN = fbm(rng, 24, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = plates.query(x, y, 1, 1.2);
      const cell = plates.cells[q.id];
      const e = q.d2 - q.d1 + (n(x, y) - 0.5) * 2.2;
      if (e < 2.4) {
        // The melt: white-gold at the heart of a crack, orange, then red at its edges.
        const h = Math.max(0, 1 - e / 2.4);
        const hex = h > 0.75 ? 0xffd27a : h > 0.45 ? 0xff9a2e : h > 0.2 ? 0xe0581a : 0x9a2a0c;
        c.set(x, y, hex, 120 + h * 135);
        continue;
      }
      // Crust: black-red cooling rock, a little glow at its rim.
      const rim = Math.max(0, 1 - (e - 2.4) / 3);
      const v = 0.2 + (cell.r - 0.5) * 0.2 + (crustN(x, y) - 0.5) * 0.18;
      c.set(x, y, mixHex(ramp(R.scoria, Math.max(0, Math.min(0.99, v)), x, y, 0), 0x6a1a06, rim * 0.6), rim * 70);
    }
}

/** Obsidian: black volcanic glass in conchoidal flakes with sharp violet-lit edges. */
function obsidian(c: MatCanvas, rng: Rng): void {
  const flakes = new PeriodicCells(rng, 7, 6, 0.95);
  const n = fbm(rng, 6, 2);
  const gate = fbm(rng, 10, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = flakes.query(x, y, 1, 1.3);
      const cell = flakes.cells[q.id];
      const e = q.d2 - q.d1;
      const dx = wrapDelta(cell.x, x);
      const dy = wrapDelta(cell.y, y);
      // Conchoidal ripples: rings round the flake's point of impact, a soft gradient across it.
      const ring = Math.sin(Math.hypot(dx, dy) * 0.9 + cell.r * 6) * 0.06;
      let v = 0.28 + (cell.r2 - 0.5) * 0.22 - (dx + dy) * 0.012 + ring + (n(x, y) - 0.5) * 0.1;
      let a = 8;
      // A sharp lit arris along part of the flake's edge (the side toward the light), violet; the
      // rest of the edge is a dark step, so the glass reads as broken flakes, not a tiled net.
      const edge = e < 1.1;
      const lit = edge && dx + dy < 0 && gate(x, y) > 0.45;
      if (lit) {
        v = 0.95;
        a = 70 + cell.r3 * 50;
      } else if (edge) v = 0.02;
      const hex = lit ? mixHex(R.obsidian[R.obsidian.length - 1], 0x7a5ab8, 0.55) : ramp(R.obsidian, Math.max(0, Math.min(0.99, v)), x, y, 0);
      c.set(x, y, hex, a);
    }
}

/** The giant fungi's stem: pale fibres running up it, dark gill lines, a soft sheen. */
function stem(c: MatCanvas, rng: Rng): void {
  const fib = fbm(rng, 32, 2, 0.5, 3);
  const n = fbm(rng, 4, 2);
  // Fibres running up the stem: a brightness per column, smoothed across (wraps at the edge).
  const raw = Array.from({ length: S }, () => rng.next());
  const streak = raw.map((_, x) => (raw[(x + S - 1) % S] + raw[x] * 2 + raw[(x + 1) % S]) / 4);
  const f = new Field2();
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    const fr = fib(x, y);
    f.v[i] = 0.46 + (fr - 0.5) * 0.26 + (n(x, y) - 0.5) * 0.16 + (streak[x] - 0.5) * 0.22;
    f.h[i] = 140 + fr * 50;
    if (fr < 0.2) {
      f.code[i] = 1;
      f.h[i] = 60;
    }
  }
  resolve(c, f, R.stem, 0x1a1712, 0, 0.5);
  // Bands where the stem grew in flushes.
  for (let k = 0; k < 4; k++) {
    const y0 = rng.int(0, S - 1);
    for (let x = 0; x < S; x++) {
      const yy = y0 + Math.round(Math.sin(x * 0.08 + k) * 1.5);
      c.tint(x, yy, R.stem[1], 0.45);
      c.tint(x, yy - 1, R.stem[R.stem.length - 1], 0.15);
    }
  }
}

/** A glowing cap: velvet skin, glowing gill-spots in the cap's colour, darker scales. */
function cap(pal: readonly number[], spot: number) {
  return (c: MatCanvas, rng: Rng): void => {
    const spots = new PeriodicCells(rng, 9, 9, 0.9);
    const n = fbm(rng, 6, 2);
    const fine = fbm(rng, 32, 1);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const q = spots.query(x, y);
        const cell = spots.cells[q.id];
        const r = q.d1;
        const Rr = 1.6 + cell.r * 3.2;
        let v = 0.38 + (n(x, y) - 0.5) * 0.3 + (fine(x, y) - 0.5) * 0.06;
        let a = 10;
        let hex = ramp(pal, Math.max(0, Math.min(0.99, v)), x, y, 0);
        if (cell.r2 < 0.62 && r < Rr) {
          const t = 1 - r / Rr;
          hex = mixHex(pal[pal.length - 1], spot, 0.35 + 0.5 * t);
          a = 90 + 150 * t;
        } else if (q.d2 - q.d1 < 0.8) {
          hex = pal[1];
        }
        c.set(x, y, hex, a);
      }
  };
}

/** The bog's toxic pools: an acid-green skin, swirls, bubbles that glow faintly. */
function toxicPool(c: MatCanvas, rng: Rng): void {
  const swirl = fbm(rng, 6, 3, 0.55);
  const fine = fbm(rng, 24, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const s = swirl(x + Math.sin(y * 0.1) * 4, y);
      const v = 0.4 + (s - 0.5) * 0.5 + (fine(x, y) - 0.5) * 0.06;
      const band = Math.abs(Math.sin(s * 18));
      c.set(x, y, ramp(R.toxic, Math.max(0, Math.min(0.99, v + (band > 0.92 ? 0.2 : 0))), x, y, 0), 40 + s * 60 + (band > 0.92 ? 50 : 0));
    }
  for (let k = 0; k < 26; k++) {
    const cx = rng.next() * S;
    const cy = rng.next() * S;
    const r = 1 + rng.next() * 2.2;
    for (let a = 0; a < 16; a++) {
      const px = cx + Math.cos((a / 16) * TAU) * r;
      const py = cy + Math.sin((a / 16) * TAU) * r;
      c.set(px, py, 0xb8f04a, 200);
    }
  }
}

/** Dried bog crust: polygon plates curling at their edges, dark mud in the gaps. */
function bogCrust(c: MatCanvas, rng: Rng): void {
  const plates = new PeriodicCells(rng, 10, 10, 0.9);
  const n = fbm(rng, 12, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = plates.query(x, y);
      const cell = plates.cells[q.id];
      const e = q.d2 - q.d1;
      if (e < 1.3) {
        c.set(x, y, R.bogMud[1], 20);
        continue;
      }
      const curl = e < 2.6 ? 0.12 : 0;
      c.set(x, y, ramp(R.bogCrust, Math.max(0, Math.min(0.99, 0.4 + (cell.r - 0.5) * 0.24 + (n(x, y) - 0.5) * 0.16 + curl)), x, y, 0), 140 + cell.r * 40 + curl * 200);
    }
}

/**
 * The city's dressed stone: large ashlar courses (0.5-1 m) with fine joints, tooled faces and worn
 * arrises; `runes` lays a band of gold inlay (emissive) along some courses.
 */
function ashlar(pal: readonly number[], courseMin: number, courseMax: number, runes: number) {
  return (c: MatCanvas, rng: Rng): void => {
    const f = new Field2();
    const n = fbm(rng, 8, 2);
    const tool = fbm(rng, 32, 1, 0.5, 8);
    const rows: Array<{ y0: number; h: number; off: number; len: number; rune: boolean }> = [];
    let y = 0;
    while (y < S) {
      let h = rng.int(courseMin, courseMax);
      if (S - y - h < courseMin) h = S - y;
      rows.push({ y0: y, h, off: rng.int(0, 40), len: rng.int(courseMax * 1.5, courseMax * 3.2), rune: rng.chance(runes) });
      y += h;
    }
    const rowAt = new Uint8Array(S);
    rows.forEach((r, k) => {
      for (let j = 0; j < r.h; j++) rowAt[r.y0 + j] = k;
    });
    for (let yy = 0; yy < S; yy++)
      for (let x = 0; x < S; x++) {
        const i = x + yy * S;
        const r = rows[rowAt[yy]];
        const u = wrap(x + r.off);
        const block = Math.floor(u / r.len);
        const inU = u - block * r.len;
        const inV = yy - r.y0;
        const joint = inV === 0 || inU === 0;
        const arris = inV === 1 || inU === 1;
        const tone = (hash2(block * 7 + rowAt[yy] * 13, rowAt[yy]) - 0.5) * 0.16;
        let v = 0.48 + tone + (n(x, yy) - 0.5) * 0.12 + (tool(x, yy) - 0.5) * 0.05;
        let h = 170 + tone * 200;
        if (joint) {
          v = 0.08;
          h = 10;
          f.code[i] = 1;
        } else if (arris) v += 0.08;
        f.v[i] = v;
        f.h[i] = h;
      }
    // Worn corners: chips along the joints.
    for (let k = 0; k < 24; k++) chip(f, rng, rng.int(0, S - 1), rng.int(0, S - 1), rng.int(2, 3));
    resolve(c, f, pal, 0x0a0806, 0, 0.6);
    // Gold inlay bands: a carved groove with the inlay glowing in it, glyph breaks along it.
    for (const r of rows) {
      if (!r.rune || r.h < 6) continue;
      const yy = r.y0 + Math.floor(r.h / 2);
      for (let x = 0; x < S; x++) {
        const glyph = Math.floor(x / 5);
        const gap = hash2(glyph, yy) < 0.2 || x % 5 === 4;
        c.set(x, yy - 1, mixHex(c.getHex(x, yy - 1), 0x0a0806, 0.5), 30);
        if (!gap) {
          const up = hash2(glyph * 3, yy) < 0.5;
          c.set(x, yy, 0xd8a838, 210);
          if (up) c.set(x, yy - 1, 0xb88a28, 150);
        }
        c.set(x, yy + 1, mixHex(c.getHex(x, yy + 1), 0x0a0806, 0.35), 30);
      }
    }
  };
}

/** Floor slabs of the city: 1-2 m slabs, worn hollows, a gold-inlaid ring on a few. */
function cityTile(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const n = fbm(rng, 6, 2);
  const wear = fbm(rng, 3, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const sx = Math.floor(x / 24);
      const sy = Math.floor(y / 24);
      const lx = x - sx * 24;
      const ly = y - sy * 24;
      const tone = (hash2(sx * 5, sy * 11) - 0.5) * 0.14;
      let v = 0.42 + tone + (n(x, y) - 0.5) * 0.1 - Math.max(0, wear(x, y) - 0.6) * 0.3;
      let h = 160 + tone * 150;
      if (lx === 0 || ly === 0) {
        v = 0.06;
        h = 8;
        f.code[i] = 1;
      }
      f.v[i] = v;
      f.h[i] = h;
    }
  resolve(c, f, R.cityTile, 0x0a0806, 0, 0.6);
  for (let k = 0; k < 2; k++) {
    const cx = 12 + rng.int(0, 4) * 24;
    const cy = 12 + rng.int(0, 4) * 24;
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * TAU;
      c.set(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7, 0xc89a30, 170);
    }
  }
}

/** The Gate's seal: plated ironbound stone, and the ring of its lock glowing faintly rose. */
function gateSeal(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const plates = new PeriodicCells(rng, 4, 4, 0.4);
  const n = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const q = plates.query(x, y);
      const e = q.d2 - q.d1;
      let v = 0.44 + (plates.cells[q.id].r - 0.5) * 0.16 + (n(x, y) - 0.5) * 0.14;
      let h = 170;
      if (e < 1.4) {
        v = 0.1;
        h = 12;
        f.code[i] = 1;
      }
      f.v[i] = v;
      f.h[i] = h;
    }
  resolve(c, f, R.gate, 0x050507, 0, 0.55);
  // Iron bands and rivets.
  for (const by of [20, 64, 108]) {
    for (let x = 0; x < S; x++) {
      for (let k = 0; k < 4; k++) c.set(x, by + k, mixHex(0x3a3a44, 0x5a5a66, k === 0 ? 1 : 0.3), 60);
      if (x % 12 === 0) c.set(x, by + 1, 0x8a8a96, 60);
    }
  }
  // The lock's ring and its spokes (glow).
  for (const [cx, cy, r] of [[64, 42, 15], [64, 42, 9]] as const) {
    for (let a = 0; a < 128; a++) {
      const ang = (a / 128) * TAU;
      c.set(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0xff6a8a, 200);
    }
  }
  for (let k = 0; k < 8; k++) {
    const ang = (k / 8) * TAU;
    for (let r = 10; r < 15; r++) c.set(64 + Math.cos(ang) * r, 42 + Math.sin(ang) * r, 0xd8486a, 160);
  }
}

/** A cracked wall: the biome's stone split by a few wide cracks, a faint draught of light behind. */
function crackedWall(c: MatCanvas, rng: Rng): void {
  const m = rockField(rngFor('strata:cracked'), { ...WEATHERED_SIDE, pal: P.WEATHERED, crack: 0x060606, fractures: 1 });
  resolve(c, m.f, P.WEATHERED, 0x060606);
  for (let i = 0; i < S * S; i++) c.a[i] = 0;
  for (let k = 0; k < 4; k++) {
    const pts = crackCurve(rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(40, 80), 0.25, 0.08);
    pts.forEach(([x, y], j) => {
      const w = 1 + Math.round(Math.sin((j / pts.length) * Math.PI) * 1.4);
      for (let d = -w; d <= w; d++) {
        const core = Math.abs(d) < w;
        c.set(x + d, y, core ? 0x060504 : mixHex(c.getHex(x + d, y), 0x0b0908, 0.6), core ? 45 : 8);
      }
      // A lit lip above the crack.
      c.tint(x, y - w - 1, 0xffffff, 0.1);
    });
  }
}

/** The Heart's stone: deep crimson rock with veins of a slow rose light. */
function heartStone(c: MatCanvas, rng: Rng): void {
  const m = rockField(rngFor('strata:heart'), { ...BEDROCK_SIDE, pal: R.heart, crack: 0x050103 });
  resolve(c, m.f, R.heart, 0x050103);
  for (let i = 0; i < S * S; i++) c.a[i] = 6;
  for (let k = 0; k < 7; k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(30, 70), 0.3, 0.07);
    pts.forEach(([x, y], j) => {
      const hot = 0.5 + 0.5 * Math.sin((j / Math.max(1, pts.length - 1)) * Math.PI);
      c.set(x, y, mixHex(0x8a1426, 0xff5a6a, hot * 0.7), 120 + hot * 110);
      c.tint(x + 1, y, 0x4a0a16, 0.5);
    });
  }
}

/** The galleries' great roots: thick bark ridges running along the root, knots, a lit crown. */
function thickRoot(c: MatCanvas, rng: Rng): void {
  const ridge = fbm(rng, 24, 2, 0.5, 3);
  const n = fbm(rng, 4, 2);
  const f = new Field2();
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    const r = ridge(x, y);
    f.v[i] = 0.42 + (r - 0.5) * 0.42 + (n(x, y) - 0.5) * 0.14;
    f.h[i] = 120 + r * 90;
    if (r < 0.22) {
      f.code[i] = 1;
      f.h[i] = 40;
    }
  }
  resolve(c, f, R.bark, 0x0a0705, 0, 0.55);
  // Knots: dark rings.
  for (let k = 0; k < 5; k++) {
    const cx = rng.next() * S;
    const cy = rng.next() * S;
    for (let rr = 1.5; rr < 4; rr += 1) for (let a = 0; a < 24; a++) c.tint(cx + Math.cos((a / 24) * TAU) * rr, cy + Math.sin((a / 24) * TAU) * rr * 1.6, R.bark[rr < 2.5 ? 0 : 1], 0.6);
  }
}

/** Glowing vines over dark rock: the root tangle recoloured green, with glowing bulbs. */
function glowVine(c: MatCanvas, rng: Rng): void {
  rootsPainter(c, rng);
  onto(c, R.vine);
  for (let i = 0; i < S * S; i++) c.a[i] = 4;
  glowSpecks(c, rng, 0x8aff6a, 90, 220);
}

/**
 * A timber door (16 texels a metre, the pattern repeating every block so a door of any size reads
 * the same): vertical oak planks with dark seams and grain, two iron straps a block with a rivet on
 * every plank. `heavy`: the Halden works' iron-bound vault door (darker oak, wide straps, an iron
 * frame at the block's edge); otherwise the explorer's crafted door (lighter wood, thin straps).
 */
function door(heavy: boolean) {
  return (c: MatCanvas, rng: Rng): void => {
    const pal = heavy ? R.doorOak : R.builtOak;
    const f = new Field2();
    const grain = fbm(rng, 32, 3, 0.55, 4);
    const tone = fbm(rng, 8, 2);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const i = x + y * S;
        const plank = Math.floor(x / 4);
        const px = x % 4;
        let v = 0.42 + (hash2(plank, 7) - 0.5) * 0.22 + (grain(x, y) - 0.5) * 0.32 + (tone(x, y) - 0.5) * 0.1;
        let h = 150 + (grain(x, y) - 0.5) * 40;
        if (px === 0) {
          v = 0.05;
          h = 20;
          f.code[i] = 1;
        } else if (px === 1) v += 0.08;
        // A knot now and then.
        if (hash2(plank, Math.floor(y / 5)) > 0.96 && px === 2) v -= 0.25;
        f.v[i] = v;
        f.h[i] = h;
      }
    resolve(c, f, pal, 0x060403, 0, 0.6);
    // Iron: the straps (and, heavy, the frame round each block's edge), with rivets on the planks.
    const iron = R.doorIron;
    const strapRows = heavy ? [2, 3, 4, 11, 12, 13] : [3, 4, 11, 12];
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const ly = y % 16;
        const lx = x % 16;
        const onStrap = strapRows.includes(ly);
        const onFrame = heavy && (lx === 0 || lx === 15);
        if (!onStrap && !onFrame) continue;
        const top = onStrap && ly === strapRows[0] % 16;
        const k = top ? 5 : onFrame ? 2 : 3 + Math.round((hash2(x, y) - 0.5) * 1.2);
        c.set(x, y, iron[Math.max(0, Math.min(iron.length - 1, k))], 215);
        const rivetRow = heavy ? ly === 3 || ly === 12 : ly === 3 || ly === 12;
        if (onStrap && rivetRow && x % 4 === 2) c.set(x, y, iron[6], 235);
      }
    if (heavy) {
      // Rust bleeding from the straps down the oak.
      for (let x = 0; x < S; x++)
        for (const y0 of [5, 14]) {
          if (hash2(x, y0) < 0.6) continue;
          for (let d = 0; d < 3; d++) c.tint(x, (y0 + d) % S, 0x5a2a14, 0.35 - d * 0.1);
        }
    }
  };
}

/**
 * The works' pressure plate (top face; the floor cell the explorer steps on): a dressed slab set in a
 * dark bevelled groove, a carved ring glyph inked in faint rune-gold (an emissive mask: it glows a
 * little in the dark, so the plates read as a set in the room's floor).
 */
function pressurePlate(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const n = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const lx = x % 16;
      const ly = y % 16;
      const edge = Math.min(lx, ly, 15 - lx, 15 - ly);
      let v = 0.5 + (n(x, y) - 0.5) * 0.16;
      if (edge === 0) v = 0.04;
      else if (edge === 1) v = lx === 1 || ly === 1 ? 0.78 : 0.24;
      f.v[i] = v;
      f.h[i] = edge === 0 ? 4 : 14;
      if (edge === 0) f.code[i] = 1;
    }
  resolve(c, f, R.plate, 0x050608, 0, 0.6);
  // The glyph: a ring with four ticks and a dot, carved (dark) with a gold inlay that glows.
  for (let by = 0; by < S; by += 16)
    for (let bx = 0; bx < S; bx += 16) {
      const cx = bx + 7.5;
      const cy = by + 7.5;
      for (let a = 0; a < 40; a++) {
        const ang = (a / 40) * TAU;
        c.set(cx + Math.cos(ang) * 4.6, cy + Math.sin(ang) * 4.6, 0xd8a640, 150);
      }
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * TAU + Math.PI / 4;
        for (let r = 5.5; r < 7; r += 0.7) c.set(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, 0xb08830, 110);
      }
      c.set(cx, cy, 0xffd870, 190);
      c.set(cx + 1, cy, 0xd8a640, 120);
    }
}

// ---------------------------------------------------------------------------------------
// The biome hosts (rock structure + ramp + overlay)

const H: Record<string, HostDef> = {
  amberLime: { base: 'weathered', pal: R.amberLime, crack: 0x0a0705, style: { beds: [6, 18], laminae: 0.5 }, overlay: (c, rng) => threads(c, rng, 0xa89070, 3, 0.25) },
  amberSand: { base: 'stone', pal: R.amberSand, crack: 0x0a0604, style: { beds: [4, 11], bedTone: 0.16, laminae: 0.6, jointChance: 0.15 } },
  mycel: { base: 'deep', pal: R.mycel, crack: 0x050508, overlay: (c, rng) => threads(c, rng, 0x9a98b4, 26, 0.32, 175) },
  rootClay: { base: 'weathered', pal: R.rootClay, crack: 0x0a0704, style: { beds: [5, 12], bedTone: 0.18, facets: 4 } },
  flood: { base: 'deep', pal: R.flood, crack: 0x05070a, overlay: (c, rng, m) => crustClumps(c, rng, m.f.code, [0x2a3a40, 0x34484e, 0x3e565a, 0x4a6466], 0.14, 160) },
  floodShale: { base: 'stone', pal: R.floodShale, crack: 0x040508, style: { beds: [3, 8], laminae: 0.8, bedTone: 0.12 } },
  geode: { base: 'bedrock', pal: R.geode, crack: 0x04030a, style: { facets: 9, fractures: 4 } },
  calcite: { base: 'weathered', pal: R.calcite, crack: 0x100e14, style: { beds: [10, 30], jointChance: 0.1 }, overlay: (c, rng) => bands(c, rng, R.calcite, 4, 0.5) },
  mine: { base: 'weathered', pal: R.mine, crack: 0x080604, overlay: (c, rng, m) => crustClumps(c, rng, m.f.code, [0x4a2a14, 0x5c3418, 0x6e3e1c, 0x7e4a22], 0.12, 150) },
  mineShale: { base: 'stone', pal: R.mineShale, crack: 0x050506, style: { beds: [3, 9], laminae: 0.7 } },
  frostRock: { base: 'stone', pal: R.frostRock, crack: 0x05070a, overlay: (c, rng, m) => crustClumps(c, rng, m.f.code, [0x5a6a80, 0x6a7c92, 0x7a8ea4, 0x8aa0b6], 0.3, 190) },
  jungle: { base: 'deep', pal: R.jungle, crack: 0x040604, overlay: (c, rng, m) => crustClumps(c, rng, m.f.code, R.jungleMoss, 0.34, 175) },
  sulphurRock: { base: 'weathered', pal: R.sulphurRock, crack: 0x080804, overlay: (c, rng, m) => crustClumps(c, rng, m.f.code, [0x6a6a1a, 0x82821e, 0x9a9824, 0xb0ac2c], 0.2, 170) },
  basalt: { base: 'bedrock', pal: R.basalt, crack: 0x030303, style: { beds: [30, 60], jointChance: 0.05, fractures: 1 }, overlay: (c, rng) => columnJoints(c, rng, 9, 0x050404) },
  scoria: { base: 'weathered', pal: R.scoria, crack: 0x080403, overlay: (c, rng) => vesicles(c, rng, 120, 0x0a0403) },
  voidStone: { base: 'bedrock', pal: R.voidStone, crack: 0x030206, overlay: (c, rng) => threads(c, rng, 0x4a3a7a, 6, 0.35) },
  heartHost: { base: 'bedrock', pal: R.heart, crack: 0x050103 },
};

const side = (key: string) => (c: MatCanvas): void => {
  paintHost(c, key, H[key]);
};
const top = (key: string, base: Exclude<Base, 'bedrock'>, pal: readonly number[], crack: number, extra?: (c: MatCanvas, rng: Rng, m: FloorMap) => void) => (c: MatCanvas, rng: Rng): void => {
  const m = floorMap(key, base, pal, crack);
  resolve(c, m.f, pal, crack);
  extra?.(c, rng, m);
};
const ore = (host: string, kind: VeinKind, pal: readonly number[], glint: number, crustPal?: readonly number[]) => (c: MatCanvas, rng: Rng): void => oreInto(c, rng, host, H[host], kind, pal, glint, crustPal);
const recolour = (base: (c: MatCanvas, rng: Rng) => void, pal: readonly number[], extra?: (c: MatCanvas, rng: Rng) => void) => (c: MatCanvas, rng: Rng): void => {
  base(c, rng);
  onto(c, pal);
  extra?.(c, rng);
};

export type StrataBiome =
  | 'amberHollows' | 'mushroomForest' | 'rootGalleries' | 'floodedGrottoes' | 'crystalGeode' | 'haldenMines'
  | 'frostCaverns' | 'glowrootJungle' | 'sulphurBog' | 'sunkenCity' | 'magmaVeins' | 'obsidianAbyss' | 'heart' | 'built';

export interface StrataLayer {
  painter: (c: MatCanvas, rng: Rng) => void;
  /** Emissive strength (> 0: the alpha is an emissive mask). */
  glow: number;
  /** The biomes that use it ('built' = every stratum). */
  biomes: readonly StrataBiome[];
}

/**
 * Every round 3 layer: name -> painter, glow and biomes. Order is the layer order (appended after the
 * older layers in MATERIAL_NAMES; append only, so saved captures and tests keep their indices).
 */
export const STRATA_LAYERS = {
  // I-A Amber Hollows
  amberLimeSide: { painter: side('amberLime'), glow: 0, biomes: ['amberHollows'] },
  amberLimeTop: { painter: top('amberLime', 'weathered', R.amberLime, 0x0a0705), glow: 0, biomes: ['amberHollows'] },
  amberSandSide: { painter: side('amberSand'), glow: 0, biomes: ['amberHollows'] },
  amberSandTop: { painter: top('amberSand', 'stone', R.amberSand, 0x0a0604), glow: 0, biomes: ['amberHollows'] },
  amberFloor: { painter: recolour(gravel, R.amberFloor), glow: 0, biomes: ['amberHollows'] },
  // Amber holds the light: its nuggets glow softly (the Honeycomb's cells, the starter biome's first ore).
  amberOre: { painter: ore('amberLime', 'nugget', R.amberOre, 0xffd890), glow: 0.35, biomes: ['amberHollows'] },
  // I-B Mushroom Forest
  mycelSide: { painter: side('mycel'), glow: 0, biomes: ['mushroomForest'] },
  mycelTop: { painter: top('mycel', 'deep', R.mycel, 0x050508, (c, rng) => threads(c, rng, 0x8a88a4, 14, 0.3, 165)), glow: 0, biomes: ['mushroomForest'] },
  sporeLoam: { painter: recolour(soilSide, R.sporeLoam, (c, rng) => glowSpecks(c, rng, 0x9af0e0, 40, 160)), glow: 0.6, biomes: ['mushroomForest'] },
  mycelFloor: { painter: recolour(soil, R.mycelFloor, (c, rng) => glowSpecks(c, rng, 0xe08af0, 30, 140)), glow: 0.5, biomes: ['mushroomForest'] },
  sporeQuartz: { painter: (c, rng) => druse(c, rng, R.sporeQuartz, 0x7af0e0, 0xe8b8f8, null, 1.05), glow: 0.95, biomes: ['mushroomForest'] },
  mushroomStem: { painter: stem, glow: 0, biomes: ['mushroomForest'] },
  capTeal: { painter: cap(R.capTeal, 0x6af8e0), glow: 1.2, biomes: ['mushroomForest'] },
  capMagenta: { painter: cap(R.capMagenta, 0xf878e8), glow: 1.2, biomes: ['mushroomForest'] },
  // II-A Root Galleries
  rootEarthSide: { painter: recolour(soilSide, R.rootEarth, (c, rng) => threads(c, rng, 0x0a0604, 10, 0.6)), glow: 0, biomes: ['rootGalleries'] },
  rootEarthTop: { painter: recolour(soil, R.rootEarth), glow: 0, biomes: ['rootGalleries'] },
  rootClaySide: { painter: side('rootClay'), glow: 0, biomes: ['rootGalleries'] },
  rootFloor: { painter: recolour(soil, R.rootFloor, (c, rng) => threads(c, rng, 0x5a4026, 8, 0.45, 160)), glow: 0, biomes: ['rootGalleries'] },
  goldVein: { painter: ore('rootClay', 'nugget', R.gold, 0xfff0b0), glow: 0, biomes: ['rootGalleries'] },
  thickRoot: { painter: thickRoot, glow: 0, biomes: ['rootGalleries'] },
  // II-B Flooded Grottoes
  floodSide: { painter: side('flood'), glow: 0, biomes: ['floodedGrottoes'] },
  floodTop: { painter: top('flood', 'deep', R.flood, 0x05070a), glow: 0, biomes: ['floodedGrottoes'] },
  floodShaleSide: { painter: side('floodShale'), glow: 0, biomes: ['floodedGrottoes'] },
  floodFloor: { painter: recolour(gravel, R.floodFloor), glow: 0, biomes: ['floodedGrottoes'] },
  pearlOre: { painter: ore('flood', 'nugget', R.pearl, 0xf4f8ff), glow: 0, biomes: ['floodedGrottoes'] },
  // III-A Crystal Geode
  geodeSide: { painter: side('geode'), glow: 0, biomes: ['crystalGeode'] },
  geodeTop: { painter: top('geode', 'deep', R.geode, 0x04030a), glow: 0, biomes: ['crystalGeode'] },
  calciteSide: { painter: side('calcite'), glow: 0, biomes: ['crystalGeode'] },
  geodeFloor: { painter: recolour(gravel, R.geodeFloor), glow: 0, biomes: ['crystalGeode'] },
  amethyst: { painter: (c, rng) => druse(c, rng, R.amethyst, 0xc08cff, 0xf0dcff, R.geode, 1.1), glow: 1.0, biomes: ['crystalGeode'] },
  // III-B Old Halden Mines
  mineSide: { painter: side('mine'), glow: 0, biomes: ['haldenMines'] },
  mineTop: { painter: top('mine', 'weathered', R.mine, 0x080604), glow: 0, biomes: ['haldenMines'] },
  mineShaleSide: { painter: side('mineShale'), glow: 0, biomes: ['haldenMines'] },
  mineFloor: { painter: recolour(gravel, R.mineFloor), glow: 0, biomes: ['haldenMines'] },
  coalSeam: { painter: ore('mineShale', 'seam', R.coal, 0x6a6a78), glow: 0, biomes: ['haldenMines'] },
  silverVein: { painter: ore('mine', 'branch', R.silver, 0xf0f4ff), glow: 0, biomes: ['haldenMines'] },
  // IV-A Frost Caverns
  frostIce: { painter: ice, glow: 0.35, biomes: ['frostCaverns'] },
  frostRockSide: { painter: side('frostRock'), glow: 0, biomes: ['frostCaverns'] },
  frostRockTop: { painter: top('frostRock', 'stone', R.frostRock, 0x05070a, (c, rng, m) => crustClumps(c, rng, m.f.code, R.snow, 0.5, 180, false)), glow: 0, biomes: ['frostCaverns'] },
  frostSnow: { painter: snow, glow: 0, biomes: ['frostCaverns'] },
  frostIron: { painter: ore('frostRock', 'band', R.frostIron, 0xd8ecff), glow: 0, biomes: ['frostCaverns'] },
  iceCrystal: { painter: (c, rng) => druse(c, rng, R.iceCrystal, 0x9ae0ff, 0xf0faff, null, 1.05), glow: 1.0, biomes: ['frostCaverns'] },
  // IV-B Glowroot Jungle
  jungleSide: { painter: side('jungle'), glow: 0, biomes: ['glowrootJungle'] },
  jungleTop: { painter: top('jungle', 'deep', R.jungle, 0x040604, (c, rng, m) => crustClumps(c, rng, m.f.code, R.jungleMoss, 0.5, 175, false)), glow: 0, biomes: ['glowrootJungle'] },
  jungleLoam: { painter: recolour(soil, R.jungleLoam), glow: 0, biomes: ['glowrootJungle'] },
  jungleMoss: { painter: recolour(soil, R.jungleMoss, (c, rng) => glowSpecks(c, rng, 0x9aff7a, 50, 150)), glow: 0.5, biomes: ['glowrootJungle'] },
  verdite: { painter: (c, rng) => druse(c, rng, R.verdite, 0x6aff8a, 0xd8ffe0, R.jungle, 1.05), glow: 1.0, biomes: ['glowrootJungle'] },
  sapAmber: { painter: ore('jungle', 'nugget', R.sap, 0xffd27a), glow: 0, biomes: ['glowrootJungle'] },
  glowVine: { painter: glowVine, glow: 1.0, biomes: ['glowrootJungle'] },
  // V-A Sulphur Bog
  sulphurSide: { painter: side('sulphurRock'), glow: 0, biomes: ['sulphurBog'] },
  sulphurTop: { painter: top('sulphurRock', 'weathered', R.sulphurRock, 0x080804), glow: 0, biomes: ['sulphurBog'] },
  bogMud: { painter: recolour(soil, R.bogMud), glow: 0, biomes: ['sulphurBog'] },
  bogCrust: { painter: bogCrust, glow: 0, biomes: ['sulphurBog'] },
  sulphurOre: { painter: ore('sulphurRock', 'branch', R.sulphur, 0xf8f480, [0x5a5a14, 0x6e6e18, 0x84841e]), glow: 0, biomes: ['sulphurBog'] },
  mireOpal: { painter: (c, rng) => druse(c, rng, R.opal, 0x8affc8, 0xf0fff8, R.sulphurRock, 1.05), glow: 1.0, biomes: ['sulphurBog'] },
  toxicPool: { painter: toxicPool, glow: 0.9, biomes: ['sulphurBog'] },
  // V-B Sunken City
  cityStone: { painter: ashlar(R.city, 8, 16, 0), glow: 0, biomes: ['sunkenCity'] },
  cityBrick: { painter: ashlar(R.cityBrick, 4, 8, 0.35), glow: 0.9, biomes: ['sunkenCity'] },
  cityTile: { painter: cityTile, glow: 0.6, biomes: ['sunkenCity'] },
  runegold: { painter: ore('voidStone', 'nugget', R.runegold, 0xfff0a0), glow: 0, biomes: ['sunkenCity'] },
  orichalcum: { painter: ore('voidStone', 'branch', R.orichalcum, 0xffd0a0), glow: 0, biomes: ['sunkenCity'] },
  // VI-A Magma Veins
  basaltSide: { painter: side('basalt'), glow: 0, biomes: ['magmaVeins'] },
  basaltTop: { painter: (c, rng) => { top('basalt', 'deep', R.basalt, 0x030303)(c, rng); columnJoints(c, rng, 8, 0x050404, false); }, glow: 0, biomes: ['magmaVeins'] },
  scoriaSide: { painter: side('scoria'), glow: 0, biomes: ['magmaVeins'] },
  ashFloor: { painter: recolour(soil, R.ash, (c, rng) => glowSpecks(c, rng, 0xff7a2a, 16, 120)), glow: 0.6, biomes: ['magmaVeins'] },
  emberite: { painter: (c, rng) => druse(c, rng, R.emberite, 0xff6a2a, 0xffd0a0, R.basalt, 1.1), glow: 1.1, biomes: ['magmaVeins'] },
  magmaCore: { painter: (c, rng) => lava(c, rng, 13), glow: 1.3, biomes: ['magmaVeins'] },
  lava: { painter: lava, glow: 1.5, biomes: ['magmaVeins'] },
  // VI-B Obsidian Abyss and the Heart
  obsidian: { painter: obsidian, glow: 0.5, biomes: ['obsidianAbyss'] },
  voidStoneSide: { painter: side('voidStone'), glow: 0, biomes: ['obsidianAbyss', 'sunkenCity', 'heart'] },
  obsidianFloor: { painter: (c, rng) => { obsidian(c, rng); for (let i = 0; i < S * S; i++) c.a[i] *= 0.5; }, glow: 0.4, biomes: ['obsidianAbyss'] },
  voidshard: { painter: (c, rng) => druse(c, rng, R.voidshard, 0xa070ff, 0xeadcff, R.voidStone, 1.1), glow: 1.1, biomes: ['obsidianAbyss'] },
  starsteel: { painter: ore('voidStone', 'band', R.starsteel, 0xffffff), glow: 0, biomes: ['obsidianAbyss'] },
  heartStone: { painter: heartStone, glow: 1.2, biomes: ['heart', 'obsidianAbyss'] },
  // Built things (every stratum)
  gateSeal: { painter: gateSeal, glow: 1.0, biomes: ['built'] },
  crackedWall: { painter: crackedWall, glow: 0.5, biomes: ['built'] },
  // The Halden works (one per stratum) and the explorer's crafted door.
  haldenDoor: { painter: door(true), glow: 0, biomes: ['built'] },
  pressurePlate: { painter: pressurePlate, glow: 0.55, biomes: ['built'] },
  builtDoor: { painter: door(false), glow: 0, biomes: ['built'] },
} satisfies Record<string, StrataLayer>;

export type StrataLayerName = keyof typeof STRATA_LAYERS;
export const STRATA_LAYER_NAMES = Object.keys(STRATA_LAYERS) as StrataLayerName[];
