import { MAT_SIZE, MatCanvas, PeriodicCells, Rng, engraveEdges, fbm, fracture, mixHex, ramp, warp } from './paint';

/**
 * Geology: ancient dark stone, deep stone, weathered rock, damp stone, the dense seal stone
 * and abyssal bedrock. Sides carry strata and joints (rock is layered); tops are worn floors.
 */

const S = MAT_SIZE;
const TAU = Math.PI * 2;

export interface RockPalette {
  ramp: readonly number[];
  /** Colour for hairline fractures and pits. */
  crack: number;
  /** Highlight for chipped edges and mineral flecks. */
  fleck: number;
}

export const STONE: RockPalette = { ramp: [0x14171e, 0x1a1e27, 0x21262f, 0x282e39, 0x303743, 0x3a4250, 0x464f5f], crack: 0x0b0d12, fleck: 0x5a6476 };
export const DEEP: RockPalette = { ramp: [0x0d0f14, 0x12151b, 0x171b22, 0x1d222a, 0x242a34, 0x2c333e], crack: 0x07080b, fleck: 0x46506a };
export const WEATHERED: RockPalette = { ramp: [0x26231f, 0x2f2b26, 0x39342e, 0x443e36, 0x504840, 0x5d544a, 0x6b6156], crack: 0x15130f, fleck: 0x7d7364 };
export const DAMP: RockPalette = { ramp: [0x0f141a, 0x141a21, 0x192029, 0x1f2731, 0x262f3a, 0x2e3845], crack: 0x080b0f, fleck: 0x4f6170 };
export const SEAL: RockPalette = { ramp: [0x0e1016, 0x13151d, 0x181b25, 0x1e222e, 0x252a38], crack: 0x06070a, fleck: 0x8b98b4 };
export const BEDROCK: RockPalette = { ramp: [0x09090d, 0x0d0d13, 0x111118, 0x16151f, 0x1b1a26], crack: 0x040406, fleck: 0x3a2f55 };

export interface RockOptions {
  /** Number of strata bands over the 8 m period (0 = none). */
  strata?: number;
  /** Strength of strata tone shifts. */
  strataContrast?: number;
  /** Long fractures to draw. */
  fractures?: number;
  /** Vertical joints (sides only). */
  joints?: number;
  /** Pits and chips. */
  pits?: number;
  /** Mineral flecks. */
  flecks?: number;
}

/** Cliff / wall face: warped strata, broad tone clusters, joints, fractures and chips. */
export function rockSide(c: MatCanvas, rng: Rng, pal: RockPalette, o: RockOptions = {}): void {
  const strata = o.strata ?? 5;
  const contrast = o.strataContrast ?? 0.16;
  const base = fbm(rng, 4, 4, 0.55);
  const fine = fbm(rng, 16, 2, 0.5);
  const wx = fbm(rng, 2, 3);
  const wy = fbm(rng, 4, 2);
  // Strata: integer frequency in y keeps them periodic; a warp makes them wander.
  const bandPhase = Array.from({ length: strata }, () => rng.next());
  const strataAt = warp((x, y) => (strata > 0 ? 0.5 + 0.5 * Math.sin((y / S) * TAU * strata + Math.sin((x / S) * TAU * 2) * 0.6) : 0.5), wx, wy, 26);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const b = base(x, y);
      const s = strataAt(x, y);
      const band = strata > 0 ? Math.floor(((y + (wy(x, y) - 0.5) * 30) / S) * strata + 64) % strata : 0;
      const bandTone = strata > 0 ? (bandPhase[band] - 0.5) * contrast : 0;
      const v = b * 0.72 + fine(x, y) * 0.28 + (s - 0.5) * contrast * 0.9 + bandTone;
      c.set(x, y, ramp(pal.ramp, v, x, y, 0.7), 110 + b * 120);
    }
  details(c, rng, pal, o, true);
}

/** Floor face: worn and flatter, grit and small stones, no strata. */
export function rockTop(c: MatCanvas, rng: Rng, pal: RockPalette, o: RockOptions = {}): void {
  const base = fbm(rng, 4, 4, 0.5);
  const fine = fbm(rng, 32, 1);
  const grit = new PeriodicCells(rng, 22, 22, 0.9);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const b = base(x, y);
      let v = b * 0.8 + fine(x, y) * 0.2 - 0.04;
      const q = grit.query(x, y);
      // Small embedded stones: a lighter rim on their upper-left, a dark contact shadow below.
      if (q.d1 < 1.6 && grit.cells[q.id].r < 0.35) v += 0.12;
      c.set(x, y, ramp(pal.ramp, v, x, y, 0.6), 100 + b * 110);
    }
  details(c, rng, pal, { ...o, joints: 0 }, false);
}

function details(c: MatCanvas, rng: Rng, pal: RockPalette, o: RockOptions, side: boolean): void {
  // Long fractures with an engraved lit edge.
  for (let i = 0; i < (o.fractures ?? 6); i++) {
    const pts = fracture(c, rng, pal.crack, rng.int(18, 60), { dir: side ? (rng.chance(0.5) ? 0 : 4) : rng.int(0, 7), turn: 0.28, heightCut: 20 });
    engraveEdges(c, pts, 1.1, 0.85);
  }
  // Vertical joints split the strata into blocks of rock (sides only).
  for (let i = 0; i < (o.joints ?? (side ? 4 : 0)); i++) {
    const pts = fracture(c, rng, pal.crack, rng.int(10, 26), { dir: rng.chance(0.5) ? 2 : 6, turn: 0.18, heightCut: 25 });
    engraveEdges(c, pts, 1.08, 0.82);
  }
  // Pits and chips: 2-3 px dark spots with a lit lower-right rim.
  for (let i = 0; i < (o.pits ?? 40); i++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    const r = rng.chance(0.3) ? 2 : 1;
    for (let dy = 0; dy < r; dy++) for (let dx = 0; dx < r; dx++) c.set(x + dx, y + dy, mixHex(c.getHex(x + dx, y + dy), pal.crack, 0.7), 30);
    c.shade(x + r, y + r, 1.15);
  }
  // Mineral flecks: single bright pixels, sparse.
  for (let i = 0; i < (o.flecks ?? 26); i++) c.set(rng.int(0, S - 1), rng.int(0, S - 1), pal.fleck);
}

export function stoneSide(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, STONE, { strata: 5, strataContrast: 0.15, fractures: 6, joints: 5 });
}
export function stoneTop(c: MatCanvas, rng: Rng): void {
  rockTop(c, rng, STONE, { fractures: 5, pits: 50 });
}
export function deepSide(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, DEEP, { strata: 3, strataContrast: 0.12, fractures: 4, joints: 3, flecks: 40 });
}
export function deepTop(c: MatCanvas, rng: Rng): void {
  rockTop(c, rng, DEEP, { fractures: 3, flecks: 30 });
}
export function weatheredSide(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, WEATHERED, { strata: 7, strataContrast: 0.22, fractures: 9, joints: 6, pits: 70 });
}
export function weatheredTop(c: MatCanvas, rng: Rng): void {
  rockTop(c, rng, WEATHERED, { fractures: 7, pits: 80 });
}

/** Damp stone: darker, wet sheen streaks running down, sparse glowing lichen (emissive alpha). */
export function dampSide(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, DAMP, { strata: 4, strataContrast: 0.1, fractures: 5, joints: 4, flecks: 10 });
  wetAndLichen(c, rng, true);
}
export function dampTop(c: MatCanvas, rng: Rng): void {
  rockTop(c, rng, DAMP, { fractures: 4, pits: 40, flecks: 8 });
  wetAndLichen(c, rng, false);
}

function wetAndLichen(c: MatCanvas, rng: Rng, side: boolean): void {
  // Alpha becomes the emissive mask for this material: clear it first.
  c.a.fill(0);
  const wet = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // Wet streaks: vertical on walls, puddle-like blotches on floors.
      const w = side ? wet(x * 3, y * 0.4) : wet(x, y);
      if (w > 0.62) c.tint(x, y, 0x3c5566, (w - 0.62) * 1.4);
    }
  const lichen = new PeriodicCells(rng, 10, 10, 0.95);
  for (const cell of lichen.cells) {
    if (cell.r > (side ? 0.45 : 0.6)) continue;
    const n = rng.int(3, side ? 9 : 14);
    for (let i = 0; i < n; i++) {
      const x = Math.round(cell.x + (rng.next() - 0.5) * 7);
      const y = Math.round(cell.y + (rng.next() - 0.5) * (side ? 4 : 7));
      const bright = rng.chance(0.25);
      c.set(x, y, bright ? 0x6fe0c8 : 0x2f7f72, bright ? 220 : 90);
    }
  }
}

/** The seal: dense, plated stone with pale mineral flecks, clearly not ordinary rock. */
export function sealStone(c: MatCanvas, rng: Rng): void {
  const plates = new PeriodicCells(rng, 6, 5, 0.7);
  const n = fbm(rng, 8, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = plates.query(x, y, 1, 1.6);
      const edge = q.d2 - q.d1;
      let v = 0.35 + plates.cells[q.id].r * 0.3 + (n(x, y) - 0.5) * 0.35;
      if (edge < 1.4) v = 0.02;
      else if (edge < 2.6) v += 0.18;
      c.set(x, y, ramp(SEAL.ramp, v, x, y, 0.5), edge < 1.4 ? 10 : 160);
    }
  for (let i = 0; i < 70; i++) c.set(rng.int(0, S - 1), rng.int(0, S - 1), rng.chance(0.3) ? 0xc4d0e8 : SEAL.fleck);
}

/** Abyssal bedrock: near-black with faint violet veins. */
export function bedrock(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, BEDROCK, { strata: 2, strataContrast: 0.08, fractures: 3, joints: 2, flecks: 12 });
  const veins = fbm(rng, 4, 3);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = Math.abs(veins(x, y) - 0.5);
      if (v < 0.012) c.tint(x, y, 0x3b2a63, 0.6);
    }
}
