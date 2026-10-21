import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BLOCKS, SOLID } from '../../src/config/blocks';
import { RARITY_CODE } from '../../src/config/rarity';
import { BLOCK_SURFACES, MATERIAL_NAMES } from '../../src/render/materials';
import { detailOf } from '../../src/render/detail';
import { createFlameMaterial, flameQuad } from '../../src/render/props/flame';
import { buildPropModel } from '../../src/render/props/models';
import { DebrisSystem } from '../../src/game/effects/Debris';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import type { LightingUniforms } from '../../src/render/lighting';

// Round 2 glitch hunt and visual-quality guards (VIS).
describe('round 2 visual guards', () => {
  it('every minable find has its own surface (none falls back to plain stone)', () => {
    for (const b of BLOCKS) {
      if (!b || !SOLID[b.id] || !RARITY_CODE[b.id]) continue;
      expect(BLOCK_SURFACES[b.id], `block ${b.id} ${b.name}`).toBeDefined();
    }
    for (const name of ['rubble', 'roots', 'gemOre'] as const) expect(MATERIAL_NAMES).toContain(name);
    expect(detailOf('gemOre').layer).toBe(detailOf('crystal').layer);
  });

  it('the camp fire burns with shader flames, additive and never writing depth', () => {
    const model = buildPropModel('campfire', { variant: 0 });
    expect(model.flames.length).toBe(3);
    const lighting = { uTime: { value: 0 } } as unknown as LightingUniforms;
    const m = createFlameMaterial(lighting, 1, 0.6, 0.9);
    expect(m.blending).toBe(THREE.AdditiveBlending);
    expect(m.depthWrite).toBe(false);
    expect(flameQuad().getIndex()!.count).toBe(6);
  });

  it('debris is chipped stone, not cubes', () => {
    const w = new VoxelWorld(16, 16, 16);
    const lighting = { uTime: { value: 0 } } as unknown as LightingUniforms;
    const d = new DebrisSystem(w, lighting, 50);
    const mesh = d.group.children[0] as THREE.InstancedMesh;
    const pos = mesh.geometry.getAttribute('position');
    // An icosahedron's 20 facets (60 corners), not a cube's 6 faces.
    expect(pos.count).toBe(60);
    const radii = new Set<number>();
    for (let i = 0; i < pos.count; i++) radii.add(Math.round(Math.hypot(pos.getX(i), pos.getY(i), pos.getZ(i)) * 100));
    expect(radii.size).toBeGreaterThan(4);
  });
});
