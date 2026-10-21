import { describe, expect, it } from 'vitest';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { LanternField, LightField } from '../../src/world/light';
import { ATMOSPHERES, EMIT_GAIN, LightingRig } from '../../src/render/lighting';
import { DETAIL, DETAIL_LAYERS, DETAIL_UNIFORM, detailGlsl, detailOf } from '../../src/render/detail';
import { MATERIAL_NAMES, BLOCK_SURFACES } from '../../src/render/materials';
import { QUALITY } from '../../src/render/Renderer';
import { CRUMBLE_MAX } from '../../src/game/effects/Debris';
import { FX_MAX } from '../../src/game/effects/Particles';
import { beamsFor, zoneAnchorsFor } from '../../src/game/effects/LightBeams';
import { B, BLOCKS } from '../../src/config/blocks';

// The finished game's visual rules (docs/final/BRIEF.md §2): exposure, clear air, calm FX, HD stone.
describe('visual pass rules', () => {
  it('every zone runs at exposure 1.0 +- 0.15 and carries its brightness in the lights', () => {
    for (const [zone, p] of Object.entries(ATMOSPHERES)) {
      // The player's brightness at its default multiplies by 1.05 (Renderer BASE_EXPOSURE).
      expect(Math.abs(p.exposure * 1.05 - 1), zone).toBeLessThanOrEqual(0.15);
      expect(p.lightGain, zone).toBeGreaterThanOrEqual(1);
    }
  });

  it('every material layer has an HD detail layer, and the GLSL tables cover them all', () => {
    for (const name of MATERIAL_NAMES) {
      const d = detailOf(name);
      expect(d.layer, name).toBeGreaterThanOrEqual(0);
      expect(d.layer, name).toBeLessThan(DETAIL_LAYERS);
      expect(d.rough, name).toBeGreaterThan(0.1);
      expect(d.rough, name).toBeLessThanOrEqual(1);
    }
    expect(detailOf('crystal').layer).toBe(DETAIL.crystal);
    expect(detailOf('stoneTop').layer).toBe(DETAIL.floor);
    expect(detailOf('masonry').layer).toBe(DETAIL.dressed);
    const glsl = detailGlsl(MATERIAL_NAMES);
    expect(glsl).toContain(`int DETAIL_L[${MATERIAL_NAMES.length}]`);
    expect(glsl).toContain(`float DETAIL_R[${MATERIAL_NAMES.length}]`);
    // Before a renderer paints, the placeholder is a flat, neutral array with every layer.
    expect((DETAIL_UNIFORM.value.image as { depth: number }).depth).toBe(DETAIL_LAYERS);
  });

  it('every visible solid block has a surface (no block falls back to an unlisted material)', () => {
    for (const b of BLOCKS) {
      if (!b || !b.solid || !b.visible) continue;
      expect(BLOCK_SURFACES[b.id], b.name).toBeDefined();
    }
  });

  it('calm FX: a crumble is at most 9 chunks, bursts of motes and glints are capped', () => {
    expect(CRUMBLE_MAX).toBeLessThanOrEqual(9);
    expect(FX_MAX.dust).toBeLessThanOrEqual(6);
    expect(FX_MAX.sparkle).toBeLessThanOrEqual(8);
  });

  it('FXAA runs where there is no MSAA, never on Battery', () => {
    expect(QUALITY.battery.fxaa).toBe(false);
    expect(QUALITY.balanced.fxaa).toBe(true);
    expect(QUALITY.high.msaa > 0 || QUALITY.high.fxaa).toBe(true);
  });

  it('beams only where the world has the landmark', () => {
    expect(beamsFor({})).toHaveLength(0);
    const b = beamsFor({ monolith: [10, 6, 10], spindle: [5, 41, 5] });
    expect(b).toHaveLength(2);
    for (const s of b) expect(s.to[1]).toBeGreaterThan(s.from[1]);
  });

  it('the deep zones keep their own air around their anchors', () => {
    const w = new VoxelWorld(64, 48, 64);
    const f = new LightField(w);
    const rig = new LightingRig(f, new LanternField(w), 64, 48, 64);
    rig.setZoneAnchors(zoneAnchorsFor({ glowroot: [10, 4, 10], emberDeep: [50, 2, 50] }));
    rig.updateAtmosphere(0, 10, 4, 12, null);
    expect(rig.zoneWeights.glowroot).toBeGreaterThan(0.95);
    expect(rig.uniforms.uEmitGain.value).toBeCloseTo(EMIT_GAIN * ATMOSPHERES.glowroot.lightGain, 4);
    rig.updateAtmosphere(0, 50, 2, 49, null);
    expect(rig.zoneWeights.ember).toBeGreaterThan(0.95);
    rig.updateAtmosphere(0, 30, 6, 30, null);
    expect(rig.zoneWeights.glowroot + rig.zoneWeights.ember).toBeLessThan(0.01);
    expect(rig.zoneWeights.rift).toBeGreaterThan(0.95);
    expect(B.LIGHT_GLOWROOT).toBeGreaterThan(0);
  });
});
