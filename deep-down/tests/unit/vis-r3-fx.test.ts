import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import type { LightingUniforms } from '../../src/render/lighting';
import { HazardFx } from '../../src/game/effects/HazardFx';
import { WeatherFx, WEATHER_OF } from '../../src/game/effects/WeatherFx';
import { HeartFinale } from '../../src/game/effects/HeartFinale';
import { BIOME_LOOKS, heartLight, relightHeart } from '../../src/render/biomeLook';
import { TerrainRig } from '../../src/render/terrainRig';
import { generateMaterials } from '../../src/render/materials';

const lighting = { uTime: { value: 0 } } as unknown as LightingUniforms;

function camAt(x: number, y: number, z: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(72, 0.46, 0.06, 200);
  c.position.set(x, y, z);
  c.updateMatrixWorld(true);
  return c;
}

describe('hazard visuals (VIS round 3)', () => {
  it('lays gas veils in the gas pockets only and lights the screen edge near them', () => {
    const fx = new HazardFx(lighting);
    fx.setZones([
      { kind: 'gas', centre: [10, 5, 10], radius: 6, strength: 0.8 },
      { kind: 'lava', centre: [60, 5, 60], radius: 4 },
      { kind: 'cold', centre: [100, 5, 100], radius: 20 },
    ]);
    expect(fx.veilCount).toBeGreaterThanOrEqual(5);
    // Far from everything: calm.
    for (let i = 0; i < 60; i++) fx.update(1 / 30, camAt(200, 6, 200), new Map(), null);
    expect(fx.levels.length()).toBeLessThan(0.01);
    // In the gas: the green cast eases in; by the lava: the heat.
    for (let i = 0; i < 120; i++) fx.update(1 / 30, camAt(10, 6.6, 10), new Map(), null);
    expect(fx.levels.y).toBeGreaterThan(0.4);
    for (let i = 0; i < 120; i++) fx.update(1 / 30, camAt(60, 6.6, 61), new Map(), null);
    expect(fx.levels.z).toBeGreaterThan(0.4);
    expect(fx.levels.y).toBeLessThan(0.1);
    // The cold meter drives the rime; the frost biome alone a little.
    for (let i = 0; i < 120; i++) fx.update(1 / 30, camAt(200, 6, 200), new Map([['frostCaverns', 1]]), { kind: 'cold', level: 0.9 });
    expect(fx.levels.x).toBeGreaterThan(0.8);
    fx.dispose();
  });
});

describe('weather (VIS round 3)', () => {
  it('runs only in a cavern of a weather biome, fades in and out, and stops when the explorer leaves', () => {
    const w = new VoxelWorld(64, 32, 64, 16);
    for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) w.setRaw(x, 0, z, B.SLATE);
    const fx = new WeatherFx(lighting);
    fx.setCaverns([
      { biome: 'frostCaverns', centre: [20, 6, 20], radius: [12, 6, 12] },
      { biome: 'amberHollows', centre: [50, 6, 50], radius: [10, 6, 10] },
    ]);
    expect(WEATHER_OF.amberHollows).toBeUndefined();
    expect(fx.start(w, 50, 3, 50)).toBe(false);
    expect(fx.start(w, 20, 3, 20)).toBe(true);
    expect(fx.kind).toBe('iceFog');
    const cam = camAt(20, 2.6, 20);
    for (let i = 0; i < 30 * 8; i++) fx.update(1 / 30, w, cam);
    expect(fx.level).toBeGreaterThan(0.95);
    // Out of the cavern: it fades out within five seconds and stops.
    const out = camAt(58, 2.6, 4);
    for (let i = 0; i < 30 * 6; i++) fx.update(1 / 30, w, out);
    expect(fx.kind).toBeNull();
    fx.dispose();
  });
});

describe('the Heart relit (VIS round 3)', () => {
  it('turns the Heart from dark rose to warm gold, and a save with it lit starts lit', () => {
    relightHeart(0);
    const dark = { ...BIOME_LOOKS.heart.grade, gain: [...BIOME_LOOKS.heart.grade.gain] };
    relightHeart(1);
    expect(heartLight()).toBe(1);
    expect(BIOME_LOOKS.heart.grade.gain[0]).toBeGreaterThan(dark.gain[0]);
    expect(BIOME_LOOKS.heart.atmosphere.lightGain).toBeGreaterThan(2.5);
    relightHeart(0);
    expect(BIOME_LOOKS.heart.grade.gain[0]).toBeCloseTo(dark.gain[0], 5);

    const terrain = new TerrainRig(generateMaterials({ biomes: ['heart'] }));
    const f = new HeartFinale(lighting);
    f.setHeart({ centre: [10, 10, 10] }, true);
    expect(f.lit).toBe(1);
    f.setHeart({ centre: [10, 10, 10] }, false);
    expect(f.lit).toBe(0);
    // The finale: the great ring sweeps out, the Heart lights by ~9 s and stays lit.
    f.start();
    const post = { flash: 0, flashColor: new THREE.Color() };
    for (let i = 0; i < 30 * 3; i++) f.update(1 / 30, i / 30, terrain, post);
    expect(terrain.uniforms.uSonarFx.value.y).toBeGreaterThan(0.5);
    expect(terrain.uniforms.uSonar.value.w).toBeGreaterThan(20);
    for (let i = 0; i < 30 * 20; i++) f.update(1 / 30, 3 + i / 30, terrain, post);
    expect(f.playing).toBe(false);
    expect(f.lit).toBe(1);
    expect(terrain.uniforms.uSonarFx.value.y).toBe(0);
    relightHeart(0);
    f.dispose();
  });
});
