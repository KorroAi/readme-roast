// U-LOOK (SPEC §13.1, amended by W1-LEAD §1.1): the config lint of the looks and the sampler lint of the terrain
// programs (terrain programs may sample the stone texture arrays, the ramps and one noise, plus 1E's light chunk).
import { describe, expect, it } from 'vitest';
import { LOOKS } from '../../../src/render/hybrid/looks';
import { SURFACE_FRAG, SURFACE_VERT } from '../../../src/render/lantern/surface';
import { LAYER_COUNT, LAYER_FINISH, LAYER_SIDE, LAYER_TOP, erodable } from '../../../src/render/lantern/layers';
import { PAINT_RES, TILE_M } from '../../../src/render/lantern/painter';
import { BEVEL } from '../../../src/render/lantern/mesher';
import { B, BIOME_BLOCK_BASE } from '../../../src/config/blocks';

describe('U-LOOK: the Lantern Voxel looks and programs', () => {
  it('keeps every space look inside the grade law (exposure 1 ± 0.15, saturation ≤ 1, bloom ≥ 1 and 0.15–0.25, vignette ≤ 0.15)', () => {
    for (const [name, L] of Object.entries(LOOKS)) {
      expect(Math.abs(L.exposure - 1), name).toBeLessThanOrEqual(0.15);
      expect(L.saturation, name).toBeLessThanOrEqual(1);
      expect(L.bloomThreshold, name).toBeGreaterThanOrEqual(1);
      expect(L.bloomStrength, name).toBeGreaterThanOrEqual(0.15);
      expect(L.bloomStrength, name).toBeLessThanOrEqual(0.25);
      expect(L.vignette, name).toBeLessThanOrEqual(0.15);
      // Hued darks: the fog is never grey (some channel differs by ≥ 4 of 255).
      const r = (L.fog >> 16) & 255, g = (L.fog >> 8) & 255, b = L.fog & 255;
      expect(Math.max(r, g, b) - Math.min(r, g, b), name).toBeGreaterThanOrEqual(4);
    }
  });

  it('samples only the stone arrays and the light chunk in the surface program, and never shows a tile', () => {
    const samplers = [...SURFACE_FRAG.matchAll(/uniform\s+(?:highp\s+)?(sampler\w+)\s+(\w+)/g)].map((m) => m[2]);
    const allowed = new Set(['tStoneA', 'tStoneB', 'uL_ShadowA', 'uL_ShadowB', 'uL_Irr', 'uL_Probe']);
    for (const s of samplers) expect(allowed.has(s), s).toBe(true);
    // World space: the stone is projected from world positions (biplanar), never from per-block uvs.
    expect(SURFACE_VERT).not.toMatch(/attribute vec2 uv/);
    expect(SURFACE_FRAG).toMatch(/p\.zy|p\.xz|p\.xy/);
    // Two scales, rotated, blended: no period inside 8 m.
    expect(SURFACE_FRAG).toMatch(/rot2\(/);
    // It lights through 1E's shade() and writes lightOut().
    expect(SURFACE_FRAG).toMatch(/shade\(s, p, V\)/);
    expect(SURFACE_FRAG).toMatch(/lightOut\(/);
    // No post theatrics anywhere in the look path.
    for (const k of ['iris', 'shock', 'chroma', 'godray']) expect(SURFACE_FRAG.toLowerCase()).not.toContain(k);
  });

  it('paints at a budgeted base resolution and bevels in the 3–6 cm band', () => {
    expect(LAYER_FINISH.length).toBe(LAYER_COUNT);
    expect(PAINT_RES).toBeLessThanOrEqual(256);
    // ≥ 128 texels per metre of base detail (the fine detail is resolution-free in the shader).
    expect(PAINT_RES / TILE_M).toBeGreaterThanOrEqual(128);
    expect(BEVEL).toBeGreaterThanOrEqual(0.03);
    expect(BEVEL).toBeLessThanOrEqual(0.06);
  });

  it('gives every hybrid block a lantern layer and keeps built things exact', () => {
    for (const id of [B.SLATE, B.SOIL, B.MASONRY, B.DECK, B.CRACK, BIOME_BLOCK_BASE, BIOME_BLOCK_BASE + 8]) {
      expect(LAYER_TOP[id]).toBeLessThan(LAYER_COUNT);
      expect(LAYER_SIDE[id]).toBeLessThan(LAYER_COUNT);
    }
    expect(erodable(B.MASONRY)).toBe(false);
    expect(erodable(B.PLANK)).toBe(false);
  });
});
