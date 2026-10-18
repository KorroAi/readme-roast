import { CRACK_STAGES, TILE, TILE_NAMES, TILE_SIZE, type TileName } from '../config/tiles';
import { Rng } from '../core/rng';
import { hexToRgb } from '../core/math';

/**
 * Procedural pixel-art tiles for every block material, generated deterministically.
 *
 * Output layout: RGBA8, TILE_SIZE x TILE_SIZE per layer, one layer per TILE_NAMES entry.
 *   RGB = sRGB albedo
 *   A   = emissive mask (0 = not emissive) for block tiles,
 *         crack opacity for crack tiles.
 *
 * Design rules (see ART_DIRECTION.md): 4-6 shade ramps per material, clustered shapes
 * rather than per-pixel noise, light from the top-left, a subtle bevel on every block so
 * the voxel grid reads clearly at mobile resolutions.
 */

const S = TILE_SIZE;

class Tile {
  readonly rgb = new Uint8Array(S * S * 3);
  readonly a = new Uint8Array(S * S);

  set(x: number, y: number, hex: number, alpha?: number): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = x + y * S;
    this.rgb[i * 3] = (hex >> 16) & 255;
    this.rgb[i * 3 + 1] = (hex >> 8) & 255;
    this.rgb[i * 3 + 2] = hex & 255;
    if (alpha !== undefined) this.a[i] = alpha;
  }

  get(x: number, y: number): number {
    const i = ((x + S) % S) + ((y + S) % S) * S;
    return (this.rgb[i * 3] << 16) | (this.rgb[i * 3 + 1] << 8) | this.rgb[i * 3 + 2];
  }

  /** Multiply brightness of one pixel (for bevels and shading). */
  shade(x: number, y: number, f: number): void {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (x + y * S) * 3;
    for (let k = 0; k < 3; k++) this.rgb[i + k] = Math.max(0, Math.min(255, Math.round(this.rgb[i + k] * f)));
  }
}

/** Smooth value noise on a small periodic lattice so tiles have soft clusters, not static. */
function clusterField(rng: Rng, cell: number): Float32Array {
  const g = Math.max(1, Math.round(S / cell));
  const lattice = new Float32Array(g * g);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng.next();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const fx = (x / S) * g;
      const fy = (y / S) * g;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const v = (xx: number, yy: number) => lattice[((xx % g) + g) % g + (((yy % g) + g) % g) * g];
      const a = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * sx;
      const b = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * sx;
      out[x + y * S] = a + (b - a) * sy;
    }
  return out;
}

function fillRamp(t: Tile, rng: Rng, ramp: readonly number[], opts: { cell?: number; jitter?: number; bias?: number } = {}): void {
  const a = clusterField(rng, opts.cell ?? 4);
  const b = clusterField(rng, (opts.cell ?? 4) / 2);
  const jitter = opts.jitter ?? 0.12;
  const bias = opts.bias ?? 0;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let v = a[x + y * S] * 0.65 + b[x + y * S] * 0.35 + (rng.next() - 0.5) * jitter + bias;
      v = Math.max(0, Math.min(0.999, v));
      t.set(x, y, ramp[Math.floor(v * ramp.length)]);
    }
}

/** 1px bevel: lighter top/left edge, darker bottom/right edge. */
function bevel(t: Tile, light = 1.1, dark = 0.78): void {
  for (let i = 0; i < S; i++) {
    t.shade(i, 0, light);
    t.shade(0, i, light * 0.98);
    t.shade(i, S - 1, dark);
    t.shade(S - 1, i, dark * 1.02);
  }
}

/** A wandering hairline crack. */
function crack(t: Tile, rng: Rng, color: number, len: number, x?: number, y?: number): Array<[number, number]> {
  let cx = x ?? rng.int(2, S - 3);
  let cy = y ?? rng.int(2, S - 3);
  const pts: Array<[number, number]> = [];
  let dir = rng.int(0, 7);
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  for (let i = 0; i < len; i++) {
    t.set(cx, cy, color);
    pts.push([cx, cy]);
    if (rng.chance(0.35)) dir = (dir + (rng.chance(0.5) ? 1 : 7)) % 8;
    cx += dirs[dir][0];
    cy += dirs[dir][1];
    if (cx < 1 || cy < 1 || cx > S - 2 || cy > S - 2) break;
  }
  return pts;
}

/** A small rounded nugget with top-left highlight and bottom-right shadow. */
function nugget(t: Tile, rng: Rng, cx: number, cy: number, ramp: readonly number[], size: number, emissive = 0): void {
  const [dark, mid, light, hi] = ramp;
  for (let dy = -size; dy <= size; dy++)
    for (let dx = -size; dx <= size; dx++) {
      if (dx * dx + dy * dy > size * size + 0.6) continue;
      const shade = -dx - dy;
      const c = shade > size * 0.9 ? light : shade < -size * 0.7 ? dark : mid;
      t.set(cx + dx, cy + dy, c, emissive || undefined);
    }
  t.set(cx - Math.ceil(size / 2), cy - Math.ceil(size / 2), hi, emissive || undefined);
  // contact shadow
  t.shade(cx + size + 1, cy + size, 0.75);
  t.shade(cx + size, cy + size + 1, 0.75);
  if (rng.chance(0.5)) t.shade(cx + size + 1, cy + size + 1, 0.8);
}

// ---------------------------------------------------------------------------------------
// Material ramps (sRGB, dark -> light)

const SLATE = [0x1f242c, 0x282e38, 0x313844, 0x3b4351, 0x464f5e, 0x535d6d];
const DEEP = [0x15181e, 0x1b1f26, 0x21262f, 0x282e38, 0x313844];
const UMBER = [0x271f1a, 0x30271f, 0x3b3027, 0x473a2f, 0x544538];
const SOIL = [0x1f1813, 0x271e18, 0x30251d, 0x3a2d23];
const PEBBLE = [0x34373d, 0x45484f, 0x5a5e66, 0x737882];
const MOSS = [0x11283a, 0x163444, 0x1b4150, 0x22505e, 0x2a5f6c];
const COPPER = [0x6b3519, 0xa9582a, 0xdb8547, 0xffc58e];
const VERDIGRIS = [0x21564c, 0x318373, 0x48b29c, 0x86e2cc];
const IRON = [0x4a3d35, 0x7d6857, 0xb9a38c, 0xece0cf];
const CRYSTAL = [0x0a3a4c, 0x10617a, 0x1a90ab, 0x30bfd8, 0x7eeefc, 0xe2ffff];
const HARD = [0x0e1015, 0x13161c, 0x191c24, 0x20242e, 0x2a2e3b];
const ANCIENT = [0x2a2f3a, 0x343a46, 0x3f4552, 0x4b5260, 0x58606f];
const MORTAR = 0x1b1e25;
const GLYPH = [0x1f8fa6, 0x48d6ea, 0xb4fbff];
const WOOD = [0x2e2117, 0x3b2b1e, 0x4a3727, 0x5a4431, 0x6b523c];
const WOOD_DARK = [0x26190e, 0x312014, 0x3d291a, 0x4a3221];
const HEARTH = [0x1a1512, 0x26201c, 0x332b25, 0x40362e];
const BEDROCK = [0x08090c, 0x0e1014, 0x14161c, 0x1b1e25];

type Painter = (t: Tile, rng: Rng) => void;

const painters: Record<Exclude<TileName, `crack${number}`>, Painter> = {
  slate(t, rng) {
    fillRamp(t, rng, SLATE, { cell: 5, jitter: 0.1 });
    for (let i = 0; i < 2; i++) crack(t, rng, SLATE[0], rng.int(4, 7));
    for (let i = 0; i < 5; i++) t.set(rng.int(1, 14), rng.int(1, 14), SLATE[5]);
    bevel(t);
  },
  deepSlate(t, rng) {
    fillRamp(t, rng, DEEP, { cell: 4, jitter: 0.08 });
    // horizontal strata
    for (const y of [rng.int(3, 5), rng.int(9, 12)]) {
      for (let x = 0; x < S; x++) if (rng.chance(0.85)) t.set(x, y, DEEP[0]);
      for (let x = 0; x < S; x++) if (rng.chance(0.4)) t.set(x, y - 1, DEEP[3]);
    }
    for (let i = 0; i < 3; i++) t.set(rng.int(1, 14), rng.int(1, 14), DEEP[4]);
    bevel(t, 1.08, 0.8);
  },
  umber(t, rng) {
    fillRamp(t, rng, UMBER, { cell: 4, jitter: 0.12 });
    for (let i = 0; i < 3; i++) nugget(t, rng, rng.int(3, 12), rng.int(3, 12), [UMBER[0], UMBER[2], UMBER[4], 0x6a5747], 1);
    crack(t, rng, UMBER[0], 5);
    bevel(t);
  },
  soil(t, rng) {
    fillRamp(t, rng, SOIL, { cell: 3, jitter: 0.2 });
    for (let i = 0; i < 4; i++) {
      const x = rng.int(1, 14);
      const y = rng.int(1, 14);
      t.set(x, y, PEBBLE[rng.int(0, 1)]);
      if (rng.chance(0.5)) t.set(x + 1, y, PEBBLE[0]);
      t.set(x, y - 1, PEBBLE[2]);
    }
    bevel(t, 1.06, 0.82);
  },
  gravel(t, rng) {
    fillRamp(t, rng, [0x202227, 0x2a2c32], { cell: 2, jitter: 0.3 });
    for (let i = 0; i < 14; i++) nugget(t, rng, rng.int(1, 14), rng.int(1, 14), PEBBLE, rng.chance(0.3) ? 2 : 1);
    bevel(t, 1.05, 0.82);
  },
  mossTop(t, rng) {
    fillRamp(t, rng, MOSS, { cell: 4, jitter: 0.18 });
    for (let i = 0; i < 4; i++) t.set(rng.int(1, 14), rng.int(1, 14), SLATE[2]);
    // bioluminescent spores
    for (let i = 0; i < 4; i++) t.set(rng.int(1, 14), rng.int(1, 14), 0x6fe8d0, 160);
    bevel(t, 1.06, 0.84);
  },
  mossSide(t, rng) {
    painters.slate(t, rng);
    for (let x = 0; x < S; x++) {
      const depth = 2 + Math.floor(rng.next() * 3) + (rng.chance(0.15) ? 3 : 0);
      for (let y = 0; y < depth; y++) t.set(x, y, MOSS[Math.max(0, Math.min(4, 4 - y + rng.int(-1, 0)))]);
      if (rng.chance(0.12)) t.set(x, depth, 0x6fe8d0, 150);
    }
    for (let i = 0; i < S; i++) t.shade(i, 0, 1.1);
  },
  copperOre(t, rng) {
    painters.slate(t, rng);
    const spots = [[4, 4], [11, 5], [6, 11], [12, 12], [8, 7]];
    for (const [x, y] of spots) {
      if (rng.chance(0.15)) continue;
      nugget(t, rng, x + rng.int(-1, 1), y + rng.int(-1, 1), COPPER, rng.chance(0.4) ? 2 : 1, 0);
    }
    for (let i = 0; i < 4; i++) {
      const x = rng.int(2, 13);
      const y = rng.int(2, 13);
      t.set(x, y, VERDIGRIS[rng.int(1, 2)]);
      t.set(x + 1, y, VERDIGRIS[1]);
      t.set(x, y - 1, VERDIGRIS[3]);
    }
  },
  ironOre(t, rng) {
    painters.slate(t, rng);
    for (const [x, y] of [[4, 5], [10, 3], [12, 10], [5, 12], [8, 8]]) {
      if (rng.chance(0.2)) continue;
      nugget(t, rng, x + rng.int(-1, 1), y + rng.int(-1, 1), IRON, rng.chance(0.35) ? 2 : 1);
    }
  },
  crystal(t) {
    // Faceted crystal: diagonal facets, bright core, dark edges. Emissive mask follows brightness.
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const facet = (Math.floor((x + y) / 4) + Math.floor((x - y + 16) / 6)) % 3;
        const cx = Math.abs(x - 7.5) / 7.5;
        const cy = Math.abs(y - 7.5) / 7.5;
        const core = 1 - Math.max(cx, cy);
        let v = 1 + facet + Math.round(core * 2.2);
        if ((x + y) % 7 === 0) v += 1;
        v = Math.max(0, Math.min(CRYSTAL.length - 1, v));
        t.set(x, y, CRYSTAL[v], Math.round(90 + (v / (CRYSTAL.length - 1)) * 165));
      }
    // edge rim
    for (let i = 0; i < S; i++) {
      t.set(i, S - 1, CRYSTAL[0], 60);
      t.set(S - 1, i, CRYSTAL[1], 70);
      t.set(i, 0, CRYSTAL[4], 240);
      t.set(0, i, CRYSTAL[4], 230);
    }
  },
  hardenedSlate(t, rng) {
    fillRamp(t, rng, HARD, { cell: 4, jitter: 0.06 });
    // columnar joints
    for (const x of [3, 8, 13]) for (let y = 0; y < S; y++) if (rng.chance(0.88)) t.set(x + (y % 5 === 0 ? 1 : 0), y, HARD[0]);
    for (let i = 0; i < 6; i++) t.set(rng.int(1, 14), rng.int(1, 14), 0x34304a);
    for (let i = 0; i < 4; i++) t.set(rng.int(1, 14), rng.int(1, 14), HARD[4]);
    bevel(t, 1.15, 0.7);
  },
  ancientBrick(t, rng) {
    brickPattern(t, rng, ANCIENT, 8, 4, MORTAR);
  },
  ancientBrickTop(t, rng) {
    fillRamp(t, rng, ANCIENT, { cell: 6, jitter: 0.06, bias: 0.05 });
    for (let i = 0; i < S; i++) {
      t.set(i, 0, MORTAR);
      t.set(0, i, MORTAR);
      t.set(i, 2, ANCIENT[4]);
      t.set(2, i, ANCIENT[4]);
      t.set(i, S - 3, ANCIENT[1]);
      t.set(S - 3, i, ANCIENT[1]);
    }
    for (let y = 3; y < S - 3; y++) for (let x = 3; x < S - 3; x++) t.shade(x, y, 0.93);
    crack(t, rng, ANCIENT[0], 4);
  },
  ancientTile(t, rng) {
    fillRamp(t, rng, ANCIENT, { cell: 8, jitter: 0.05 });
    for (let i = 0; i < S; i++) {
      t.set(i, 0, MORTAR);
      t.set(0, i, MORTAR);
    }
    // Inlaid diamond with faint cyan glow.
    for (let i = 0; i < S; i++)
      for (let j = 0; j < S; j++) {
        const d = Math.abs(i - 8) + Math.abs(j - 8);
        if (d === 6) t.set(i, j, GLYPH[0], 110);
        else if (d === 2) t.set(i, j, GLYPH[1], 170);
      }
    t.set(8, 8, GLYPH[2], 230);
    bevel(t, 1.05, 0.85);
  },
  crumblingBrick(t, rng) {
    brickPattern(t, rng, ANCIENT.map((c) => lighten(c, 1.04)), 8, 4, MORTAR);
    // Deep cracks with cold light leaking through: a deliberate hint for observant players.
    for (let k = 0; k < 3; k++) {
      const pts = crack(t, rng, 0x0d0f13, rng.int(6, 10));
      for (const [x, y] of pts) if (rng.chance(0.55)) t.set(x, y, GLYPH[0], 150);
    }
    for (let k = 0; k < 3; k++) {
      const x = rng.int(1, 13);
      const y = rng.int(1, 13);
      t.set(x, y, 0x101217);
      t.set(x + 1, y, 0x101217);
      t.set(x, y + 1, 0x15181e);
    }
  },
  glyphStone(t, rng) {
    brickPattern(t, rng, ANCIENT, 16, 16, MORTAR);
    // A rune made of straight strokes on an 8-direction grid.
    // Symmetric, deliberately non-alphabetic: a spine, a diamond eye, descending arms, a base.
    const strokes: Array<[number, number, number, number]> = [
      [8, 2, 8, 13], [8, 3, 11, 6], [11, 6, 8, 9], [8, 9, 5, 6], [5, 6, 8, 3],
      [8, 10, 4, 13], [8, 10, 12, 13], [3, 13, 13, 13],
    ];
    for (const [x0, y0, x1, y1] of strokes) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        t.set(x, y, GLYPH[1], 255);
        t.set(x + 1, y + 1, GLYPH[0], 90);
      }
    }
    t.set(8, 6, GLYPH[2], 255);
    t.set(8, 2, GLYPH[2], 255);
  },
  glyphStoneB(t, rng) {
    brickPattern(t, rng, ANCIENT, 16, 16, MORTAR);
    // A ring pierced by a vertical stroke, with two dots: the "eye" rune.
    for (let a = 0; a < 40; a++) {
      const ang = (a / 40) * Math.PI * 2;
      const x = Math.round(8 + Math.cos(ang) * 4.2);
      const y = Math.round(8 + Math.sin(ang) * 4.2);
      t.set(x, y, GLYPH[1], 255);
    }
    for (let y = 2; y <= 13; y++) t.set(8, y, GLYPH[1], 255);
    t.set(4, 3, GLYPH[2], 255);
    t.set(12, 3, GLYPH[2], 255);
    t.set(8, 8, GLYPH[2], 255);
    for (let y = 3; y <= 13; y++) t.set(9, y, GLYPH[0], 90);
  },
  glyphStoneC(t, rng) {
    brickPattern(t, rng, ANCIENT, 16, 16, MORTAR);
    // Stacked bars joined by diagonals under a small triangle: the "descent" rune.
    const strokes: Array<[number, number, number, number]> = [
      [8, 2, 5, 5], [8, 2, 11, 5], [5, 5, 11, 5], [4, 8, 12, 8], [12, 8, 4, 11], [4, 11, 12, 11], [8, 11, 8, 14],
    ];
    for (const [x0, y0, x1, y1] of strokes) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let i = 0; i <= n; i++) {
        const x = Math.round(x0 + ((x1 - x0) * i) / n);
        const y = Math.round(y0 + ((y1 - y0) * i) / n);
        t.set(x, y, GLYPH[1], 255);
        t.set(x + 1, y + 1, GLYPH[0], 90);
      }
    }
    t.set(8, 2, GLYPH[2], 255);
    t.set(8, 14, GLYPH[2], 255);
  },
  ancientBrickCarved(t, rng) {
    brickPattern(t, rng, ANCIENT, 8, 4, MORTAR);
    // A recessed horizontal frieze with a repeating notch motif (no glow).
    for (let x = 0; x < S; x++) {
      t.set(x, 6, ANCIENT[0]);
      t.set(x, 9, ANCIENT[4]);
      for (let y = 7; y <= 8; y++) t.set(x, y, x % 4 === 1 ? ANCIENT[0] : ANCIENT[2]);
    }
  },
  plank(t, rng) {
    for (let board = 0; board < 4; board++) {
      const base = rng.int(1, 3);
      for (let y = board * 4; y < board * 4 + 4; y++)
        for (let x = 0; x < S; x++) {
          let v = base + (y === board * 4 ? 1 : 0) - (y === board * 4 + 3 ? 1 : 0);
          if (rng.chance(0.18)) v += rng.chance(0.5) ? 1 : -1;
          t.set(x, y, WOOD[Math.max(0, Math.min(4, v))]);
        }
      for (let x = 0; x < S; x++) t.set(x, board * 4 + 3, WOOD[0]);
      const seam = rng.int(3, 12);
      for (let y = board * 4; y < board * 4 + 3; y++) t.set((seam + board * 5) % S, y, WOOD[0]);
      if (board % 2 === 0) t.set((seam + board * 5 + 2) % S, board * 4 + 1, 0x5d5a55);
    }
    bevel(t, 1.06, 0.85);
  },
  beamSide(t, rng) {
    for (let x = 0; x < S; x++) {
      const base = x < 2 || x > 13 ? 0 : 1 + ((x * 7) % 3);
      for (let y = 0; y < S; y++) {
        let v = base;
        if (rng.chance(0.1)) v += 1;
        t.set(x, y, WOOD_DARK[Math.max(0, Math.min(3, v))]);
      }
    }
    for (const y of [3, 12]) for (let x = 0; x < S; x++) t.set(x, y, 0x1a120a);
    bevel(t, 1.05, 0.85);
  },
  beamEnd(t) {
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const r = Math.hypot(x - 7.5, y - 7.5);
        const ring = Math.floor(r * 0.9) % 2;
        t.set(x, y, r > 7 ? WOOD_DARK[0] : ring ? WOOD_DARK[2] : WOOD_DARK[3]);
      }
  },
  hearth(t, rng) {
    // Soot-blackened fire-pit stones with a few glowing ember cracks.
    brickPattern(t, rng, HEARTH, 6, 3, 0x0d0a08);
    for (let i = 0; i < 6; i++) t.set(rng.int(0, 15), rng.int(0, 15), 0x120d0a);
    for (let k = 0; k < 2; k++) {
      const pts = crack(t, rng, 0x0a0705, rng.int(4, 7));
      for (const [x, y] of pts) if (rng.chance(0.6)) t.set(x, y, rng.chance(0.5) ? 0xff8a3a : 0xd8561e, 200);
    }
  },
  bedrock(t, rng) {
    fillRamp(t, rng, BEDROCK, { cell: 3, jitter: 0.25 });
    for (let i = 0; i < 3; i++) crack(t, rng, 0x050608, 6);
    bevel(t, 1.2, 0.7);
  },
};

function lighten(hex: number, f: number): number {
  const [r, g, b] = hexToRgb(hex);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

function brickPattern(t: Tile, rng: Rng, ramp: readonly number[], bw: number, bh: number, mortar: number): void {
  for (let row = 0; row * bh < S; row++) {
    const offset = row % 2 === 0 ? 0 : Math.floor(bw / 2);
    for (let col = -1; col * bw < S + bw; col++) {
      const x0 = col * bw + offset;
      const tone = rng.int(1, ramp.length - 2);
      for (let y = row * bh; y < row * bh + bh; y++)
        for (let x = x0; x < x0 + bw; x++) {
          if (x < 0 || x >= S || y >= S) continue;
          const edgeTop = y === row * bh;
          const edgeLeft = x === x0;
          let v = tone;
          if (y === row * bh + 1) v = Math.min(ramp.length - 1, tone + 1);
          if (y === row * bh + bh - 1) v = Math.max(0, tone - 1);
          if (rng.chance(0.08)) v = Math.max(0, v - 1);
          t.set(x, y, edgeTop || edgeLeft ? mortar : ramp[v]);
        }
      // chipped corner
      if (rng.chance(0.3)) t.set(x0 + bw - 1, row * bh + 1, ramp[0]);
    }
  }
}

function paintCrack(t: Tile, stage: number): void {
  // Deterministic crack network that grows with the stage. Alpha = opacity of the overlay.
  const rng = new Rng(9001);
  const branches = 3 + stage * 2;
  const length = 2 + stage;
  for (let i = 0; i < S * S; i++) t.a[i] = 0;
  for (let b = 0; b < branches; b++) {
    let x = 7 + rng.int(-2, 2);
    let y = 7 + rng.int(-2, 2);
    const dir = rng.int(0, 7);
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    let d = dir;
    for (let s = 0; s < length; s++) {
      if (x < 0 || y < 0 || x >= S || y >= S) break;
      t.set(x, y, 0x050505, 235);
      if (stage > 5 && rng.chance(0.4)) t.set(x + 1, y, 0x0a0a0a, 150);
      if (rng.chance(0.3)) d = (d + (rng.chance(0.5) ? 1 : 7)) % 8;
      x += dirs[d][0];
      y += dirs[d][1];
    }
  }
}

export interface TileAtlas {
  width: number;
  height: number;
  layers: number;
  data: Uint8Array;
}

export function generateTiles(): TileAtlas {
  const layers = TILE_NAMES.length;
  const data = new Uint8Array(S * S * 4 * layers);
  TILE_NAMES.forEach((name, layer) => {
    const t = new Tile();
    const rng = new Rng(1000 + layer * 7919);
    if (name.startsWith('crack')) {
      paintCrack(t, Number(name.slice(5)));
    } else {
      painters[name as keyof typeof painters](t, rng);
    }
    const base = layer * S * S * 4;
    for (let i = 0; i < S * S; i++) {
      data[base + i * 4] = t.rgb[i * 3];
      data[base + i * 4 + 1] = t.rgb[i * 3 + 1];
      data[base + i * 4 + 2] = t.rgb[i * 3 + 2];
      data[base + i * 4 + 3] = t.a[i];
    }
  });
  return { width: S, height: S, layers, data };
}

/** Average albedo of a tile (sRGB), used for particles, icons and the map. */
export function tileAverage(atlas: TileAtlas, layer: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  const base = layer * S * S * 4;
  for (let i = 0; i < S * S; i++) {
    r += atlas.data[base + i * 4];
    g += atlas.data[base + i * 4 + 1];
    b += atlas.data[base + i * 4 + 2];
  }
  const n = S * S;
  return [r / n, g / n, b / n];
}

export const CRACK_LAYER = (stage: number): number => TILE.crack0 + Math.max(0, Math.min(CRACK_STAGES - 1, stage));
