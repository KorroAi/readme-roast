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
import { LIGHTING_GLSL } from '../../src/render/lighting';
import { Ambience, deepGlowSources, focalGlows } from '../../src/game/effects/Ambience';
import { createEntityMaterial } from '../../src/render/entityMaterial';

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

  it('the lantern near field rolls off, and lit colour eases under a ceiling at arm\'s length', () => {
    // Polish round note 1: no hot spot at 1.5-2.5 m, and a shoulder on the flame-lit colour.
    // Polish 2: a little more roll-off within 1-2 m (the close wall's cream wash).
    expect(LIGHTING_GLSL).toContain('att *= 0.3 + 0.7 * smoothstep(0.3, 3.6, dist);');
    expect(LIGHTING_GLSL).toContain('const float NEAR_CEIL = 0.44;');
    expect(LIGHTING_GLSL).toMatch(/vec3 nearShoulder\(vec3 c, vec3 lit\)/);
    // The tank shades the floor below the flame (l points up to it), never the roof above.
    expect(LIGHTING_GLSL).toContain('smoothstep(0.8, 0.97, l.y)');
    const ent = createEntityMaterial(new LightingRig(new LightField(new VoxelWorld(16, 16, 16)), new LanternField(new VoxelWorld(16, 16, 16)), 16, 16, 16).uniforms);
    expect(ent.fragmentShader).toContain('nearShoulder(albedo * light, albedo * lantern)');
  });

  it('debris is lit from the open air and shrinks away near the lens', () => {
    const w = new VoxelWorld(16, 16, 16);
    const u = new LightingRig(new LightField(w), new LanternField(w), 16, 16, 16).uniforms;
    const m = createEntityMaterial(u, { debris: true });
    expect(m.defines.DEBRIS).toBe('');
    expect(m.vertexShader).toContain('smoothstep(0.6, 0.9, distance(centre, cameraPosition))');
    expect(createEntityMaterial(u).defines.DEBRIS).toBeUndefined();
  });

  it('ambient wonder: drips, glow caps and the deep and focal glows, in three draw calls', () => {
    const w = new VoxelWorld(32, 16, 32);
    w.set(4, 3, 4, B.LIGHT_MAGMA);
    w.set(8, 3, 8, B.LIGHT_GLOWROOT);
    expect(deepGlowSources(w)).toHaveLength(2);
    expect(focalGlows({})).toHaveLength(0);
    const lm = { seal: [10, 4, 10], lastCamp: [12, 4, 12], relic_glowroot: [14, 4, 14], emberDeep: [16, 4, 16] };
    expect(focalGlows(lm)).toHaveLength(1);
    for (const g of focalGlows(lm)) expect(g.color![0]).toBeGreaterThan(g.color![2] * 2); // warm
    expect(beamsFor({ emberDeep: [16, 2, 16] })).toHaveLength(1);
    const rig = new LightingRig(new LightField(w), new LanternField(w), 32, 16, 32);
    const amb = new Ambience(rig.uniforms, w, [
      { kind: 'drip', p: [5.5, 12, 5.5], drop: 6 },
      { kind: 'drip', p: [9.5, 12, 9.5], drop: 4 },
      { kind: 'fungus', p: [3.5, 2, 3.5], n: 4 },
    ], lm);
    expect(amb.drips).toBe(2);
    expect(amb.caps).toBe(4);
    expect(amb.haloCount).toBe(2 + 1 + 1);
    expect(amb.group.children).toHaveLength(3);
    amb.dispose();
  });
});
