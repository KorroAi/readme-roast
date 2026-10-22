import { SOLID } from '../../config/blocks';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { BeamSpec } from './LightBeams';

/**
 * Round 3 (VIS, a wow of the strata, in real places only): where a biome's light hangs high under the
 * roof of a tall space, its light falls in a soft shaft to the floor (LightBeams: one draw call for
 * the stratum, additive, fading before it meets the floor and into the haze). Honey-gold through the
 * Amber Hollows' resin, pale gold under the Sunken City's rune lamps, a cold prism light in the
 * Crystal Geode and the Frost Caverns. Few and far apart: a focal point, never a haze.
 */

/** The biomes whose high lights fall in shafts: the colour on the axis (linear HDR) and the cone. */
export const SHAFTS: Readonly<Record<string, { color: [number, number, number]; top: number; foot: number }>> = {
  amberHollows: { color: [0.05, 0.03, 0.011], top: 0.45, foot: 2.0 },
  sunkenCity: { color: [0.042, 0.034, 0.014], top: 0.5, foot: 1.8 },
  crystalGeode: { color: [0.018, 0.024, 0.06], top: 0.4, foot: 1.6 },
  frostCaverns: { color: [0.02, 0.034, 0.052], top: 0.4, foot: 1.7 },
};

/** A light under a roof (render/props/pocketModels Pocket, read by shape). */
export interface ShaftSource {
  x: number;
  y: number;
  z: number;
  biome: string | null;
  roof: number | null;
}

export interface ShaftOptions {
  /** The least fall from the roof to the floor (m) for a shaft. */
  minFall?: number;
  /** The least distance between two shafts (m). */
  spacing?: number;
  /** Shafts in all, and per biome. */
  max?: number;
  perBiome?: number;
}

/**
 * The shafts of a stratum (pure; unit-tested): the tallest falls first, spaced apart, from the roof
 * over each light down toward the floor under it.
 */
export function strataBeams(world: VoxelWorld, sources: readonly ShaftSource[], o: ShaftOptions = {}): BeamSpec[] {
  const minFall = o.minFall ?? 7;
  const spacing = o.spacing ?? 22;
  const max = o.max ?? 10;
  const perBiome = o.perBiome ?? 5;
  const cands: Array<{ s: ShaftSource; floor: number; fall: number }> = [];
  for (const s of sources) {
    if (!s.biome || !SHAFTS[s.biome] || s.roof === null) continue;
    // The floor under the light (the first solid cell below it).
    let floor = -1;
    for (let y = s.y - 1; y >= Math.max(0, s.y - 40); y--)
      if (SOLID[world.get(s.x, y, s.z)]) {
        floor = y + 1;
        break;
      }
    if (floor < 0) continue;
    const fall = s.roof - floor;
    if (fall >= minFall) cands.push({ s, floor, fall });
  }
  cands.sort((a, b) => b.fall - a.fall || a.s.x - b.s.x || a.s.z - b.s.z);
  const out: BeamSpec[] = [];
  const picked: Array<[number, number]> = [];
  const count = new Map<string, number>();
  for (const c of cands) {
    if (out.length >= max) break;
    const b = c.s.biome!;
    if ((count.get(b) ?? 0) >= perBiome) continue;
    const x = c.s.x + 0.5;
    const z = c.s.z + 0.5;
    if (picked.some(([px, pz]) => Math.hypot(px - x, pz - z) < spacing)) continue;
    picked.push([x, z]);
    count.set(b, (count.get(b) ?? 0) + 1);
    const sh = SHAFTS[b];
    // From the roof (narrow) down toward the floor (wide): the beam fades in under the roof and out
    // before the floor (LightBeams' ends), so it never cuts the rock.
    const k = Math.min(1.4, 0.8 + c.fall / 30);
    out.push({ from: [x, c.s.roof!, z], to: [x, c.floor + 0.3, z], r0: sh.top, r1: sh.foot * k, color: sh.color });
  }
  return out;
}
