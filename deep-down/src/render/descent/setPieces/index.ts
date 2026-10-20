import type * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { baseBiome } from '../../../idle/config/biomes';
import { buildTopsoil } from './topsoil';
import { buildGlowroot } from './glowroot';
import { buildCrystal } from './crystal';
import { buildHalden } from './halden';
import { buildFungal } from './fungal';
import { buildDrowned } from './drowned';
import { buildMagma } from './magma';

/**
 * Hero set pieces (SPEC §6.7, W2 seam 3; owner 2D). `buildSetPiece(biome, rng)` returns the biome's hero model
 * (2-8k triangles, light baked into the vertex colours, one shared material) and the footprint the cavern must
 * give it: `w` metres wide in x and `h` tall, standing on its local origin (the floor point at its centre), its
 * front facing +z (the camera). B's caverns.ts places it inside the Vista or Reveal Hall and adds it to the
 * scene; nothing else is needed (moving parts animate themselves from the shared look clock).
 *
 * The hero briefs are in docs/idle/LOOK.md. Biomes 7-13 return null until their heroes land (W3).
 */
export interface SetPiece {
  object: THREE.Object3D;
  footprint: { w: number; h: number };
}

export type SetPieceBuilder = (rng: Rng) => SetPiece;

const BUILDERS: ReadonlyArray<SetPieceBuilder | null> = [buildTopsoil, buildGlowroot, buildCrystal, buildHalden, buildFungal, buildDrowned, buildMagma];

/** The hero of `biome` (Echo strata: their base biome's), or null when it has none yet. */
export function buildSetPiece(biome: number, rng: Rng): SetPiece | null {
  const b = BUILDERS[baseBiome(biome)];
  return b ? b(rng) : null;
}

/** Biomes with a hero (for tests and the Biome Lab). */
export function setPieceBiomes(): number[] {
  return BUILDERS.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
}
