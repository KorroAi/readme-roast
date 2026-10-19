import { MAT_SIZE, MatCanvas, PeriodicCells, Rng, fbm, ramp } from './paint';
import { STONE, rockSide } from './rock';

/**
 * Mineral deposits: veins that run continuously through the host rock in world space (a vein
 * crosses block boundaries instead of sitting in a framed "ore block"), and glassy crystal.
 */

const S = MAT_SIZE;
const COPPER = [0x5e2e16, 0x8e4822, 0xbd6a33, 0xe0924f, 0xf6bf86];
const VERDIGRIS = [0x1f4f46, 0x2c7466, 0x43a08b, 0x7fd6bf];
const IRON = [0x3a2a22, 0x5a3e30, 0x7d5844, 0xa98a74, 0xd7c6b3];
const RUST = [0x4a2214, 0x6e331b, 0x934a28];
const CRYSTAL = [0x07202b, 0x0b3442, 0x10495c, 0x186a80, 0x2a95ab, 0x5fd0e2, 0xc8f8ff];

/** Ridged vein mask: 1 on the vein centreline, 0 beyond `width`. */
function veinField(rng: Rng, base: number, width: number) {
  const n = fbm(rng, base, 3, 0.55);
  const m = fbm(rng, base * 2, 2, 0.5);
  return (x: number, y: number) => {
    const a = 1 - Math.abs(n(x, y) - 0.5) / width;
    const b = 1 - Math.abs(m(x, y) - 0.5) / (width * 0.6);
    return Math.max(0, Math.max(a, b * 0.8));
  };
}

export function copperVein(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, STONE, { strata: 4, strataContrast: 0.12, fractures: 4, joints: 3, flecks: 10 });
  const vein = veinField(rng, 2, 0.07);
  const grain = fbm(rng, 32, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = vein(x, y);
      if (v <= 0) continue;
      // Copper sits proud of the rock (height) so the deposit pushes into neighbouring stone.
      if (v > 0.35) {
        const lit = v + (grain(x, y) - 0.5) * 0.5;
        c.set(x, y, ramp(COPPER, lit * 0.95, x, y, 0.7), 190 + v * 60);
      } else if (v > 0.18) {
        c.set(x, y, ramp(VERDIGRIS, 0.2 + grain(x, y) * 0.6, x, y, 0.6), 140);
      }
    }
  // A few bright nuggets along the vein.
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    if (vein(x, y) > 0.55) {
      c.set(x, y, COPPER[4], 255);
      c.set(x + 1, y + 1, COPPER[1]);
    }
  }
}

export function ironVein(c: MatCanvas, rng: Rng): void {
  rockSide(c, rng, STONE, { strata: 4, strataContrast: 0.12, fractures: 4, joints: 3, flecks: 10 });
  const vein = veinField(rng, 4, 0.05);
  const grain = fbm(rng, 32, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = vein(x, y);
      if (v > 0.4) c.set(x, y, ramp(IRON, v * 0.8 + (grain(x, y) - 0.5) * 0.4, x, y, 0.7), 200 + v * 50);
      else if (v > 0.15) c.set(x, y, ramp(RUST, grain(x, y), x, y, 0.6), 150);
    }
}

/**
 * Crystal: dark glassy facets with bright edges and a few inner sparks. Most of the surface
 * stays dark: the glow is in the edges (emissive alpha), so a crystal reads as a faceted
 * object rather than a lit cube.
 */
export function crystal(c: MatCanvas, rng: Rng): void {
  const facets = new PeriodicCells(rng, 7, 9, 0.9);
  const n = fbm(rng, 8, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = facets.query(x, y, 1.6, 0.7);
      const cell = facets.cells[q.id];
      const edge = q.d2 - q.d1;
      // Each facet is a gradient (light from one side), edges are bright.
      const dx = (x - cell.x) / 20;
      const v = 0.18 + cell.r * 0.3 + dx * 0.25 + (n(x, y) - 0.5) * 0.2;
      if (edge < 1.1) c.set(x, y, CRYSTAL[6], 255);
      else if (edge < 2.2) c.set(x, y, CRYSTAL[5], 150);
      else c.set(x, y, ramp(CRYSTAL, v, x, y, 0.6), Math.max(0, (v - 0.45) * 220));
    }
  for (let i = 0; i < 30; i++) c.set(rng.int(0, S - 1), rng.int(0, S - 1), CRYSTAL[6], 255);
}
