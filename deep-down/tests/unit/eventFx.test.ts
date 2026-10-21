import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { EventBus } from '../../src/core/events';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { EventFx } from '../../src/game/effects/EventFx';
import type { EventLive, GameEvent } from '../../src/game/events/types';
import type { LightingUniforms } from '../../src/render/lighting';

/** Polish 2 (VIS): the world events' visuals, small and calm. */
function setup(kind: GameEvent['kind'] | null, extra: Partial<GameEvent> = {}) {
  const world = new VoxelWorld(32, 32, 32);
  for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) {
    world.setRaw(x, 4, z, B.SLATE);
    world.setRaw(x, 12, z, B.SLATE);
  }
  const bus = new EventBus();
  const src: { current: GameEvent | null; live: EventLive } = {
    current: kind ? { id: `${kind}-1`, kind, start: 0, end: 60, anchor: [16.5, 5, 16.5], radius: 3, ...extra } : null,
    live: { t: 0 },
  };
  const fx = new EventFx({} as LightingUniforms, bus, () => src, () => world);
  const points = fx.group.children[0] as THREE.Points;
  const attr = (n: string) => points.geometry.getAttribute(n) as THREE.BufferAttribute;
  const drawn = () => points.geometry.drawRange.count;
  return { world, bus, src, fx, attr, drawn };
}

const run = (fx: EventFx, seconds: number, t0 = 0) => {
  for (let i = 0; i < seconds * 30; i++) fx.update(1 / 30, t0 + i / 30);
};

describe('EventFx (world event visuals, VIS)', () => {
  it('draws nothing when no event runs', () => {
    const { fx, drawn } = setup(null);
    run(fx, 2);
    expect(drawn()).toBe(0);
  });

  it('rockfall: grit falls from the roof onto the spot and never below the floor, then stops when the stones land', () => {
    const { fx, attr, drawn, bus, src } = setup('rockfall', { target: [16.5, 11.9, 16.5] });
    run(fx, 1.5);
    expect(drawn()).toBeGreaterThan(8);
    const y = attr('aGlow');
    const pos = attr('position');
    let below = 0;
    let lit = 0;
    for (let i = 0; i < drawn(); i++) {
      if (pos.getY(i) < 5 - 0.01) below++;
      if (y.getX(i) === 0) lit++;
      expect(pos.getY(i)).toBeLessThanOrEqual(11.9);
    }
    expect(below).toBe(0);
    expect(lit).toBe(drawn()); // dust is lit like the rock, never emissive
    bus.emit('world:rockfall', { x: 16.5, y: 5, z: 16.5, hit: false });
    run(fx, 4, 2);
    src.current = null;
    run(fx, 3, 6);
    expect(fx.count).toBe(0);
  });

  it('geyser: spores rise from the vent, glowing, and stay a calm handful', () => {
    const { fx, attr, drawn } = setup('geyser');
    run(fx, 2);
    const n = drawn();
    expect(n).toBeGreaterThan(10);
    expect(n).toBeLessThanOrEqual(160);
    const pos = attr('position');
    let up = 0;
    for (let i = 0; i < n; i++) if (pos.getY(i) > 5.4) up++;
    expect(up).toBeGreaterThan(n / 2);
    expect(attr('aGlow').getX(0)).toBe(1);
  });

  it('bloom: a soft glow sits out from each lit crystal face, fading in and out with the event', () => {
    const { fx, world, attr, drawn, src } = setup('bloom');
    world.setRaw(18, 5, 16, B.CRYSTAL);
    world.setRaw(14, 5, 17, B.CRYSTAL);
    fx.update(1 / 30, 0);
    const first = drawn();
    run(fx, 3, 0.1);
    expect(drawn()).toBeGreaterThanOrEqual(2);
    expect(first).toBeLessThanOrEqual(drawn());
    const pos = attr('position');
    const glow = attr('aGlow');
    for (let i = 0; i < drawn(); i++) {
      expect(glow.getX(i)).toBe(2);
      // Never inside the crystal (the wall would cut the glow).
      const cell = world.get(Math.floor(pos.getX(i)), Math.floor(pos.getY(i)), Math.floor(pos.getZ(i)));
      expect(cell).toBe(B.AIR);
    }
    src.current = null;
    run(fx, 4, 4);
    expect(drawn()).toBe(0);
  });

  it('echo: the mote glides after live.light instead of hopping from cell to cell', () => {
    const { fx, attr, drawn, src } = setup('echo');
    src.live.light = [10.5, 6.5, 10.5];
    run(fx, 1);
    src.live.light = [12.5, 6.5, 10.5];
    fx.update(1 / 30, 1.1);
    const pos = attr('position');
    // The core is the last point drawn; one frame after the hop it is still near the old cell.
    const x = pos.getX(drawn() - 1);
    expect(x).toBeGreaterThan(10.4);
    expect(x).toBeLessThan(11);
    run(fx, 3, 1.2);
    expect(pos.getX(drawn() - 1)).toBeCloseTo(12.5, 1);
  });
});

describe('Halos far glow (polish 2: the Vault balcony lamps read from the floor)', () => {
  it('a lamp or fire with open air above gets a far glow over it, never one inside rock', async () => {
    const { HaloSystem } = await import('../../src/game/effects/Halos');
    const w = new VoxelWorld(16, 16, 16);
    w.setRaw(4, 6, 4, B.LIGHT_EMBER);
    w.setRaw(8, 6, 8, B.LIGHT_LAMP);
    w.setRaw(8, 7, 8, B.SLATE); // a lamp under a low roof: no far glow
    const halos = new HaloSystem({} as LightingUniforms, [
      { x: 4, y: 6, z: 4, id: B.LIGHT_EMBER },
      { x: 8, y: 6, z: 8, id: B.LIGHT_LAMP },
    ], () => w);
    expect(halos.count).toBe(3);
    const geo = halos.mesh.geometry;
    const far = geo.getAttribute('aFar') as THREE.BufferAttribute;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let farQuads = 0;
    for (let v = 0; v < far.count; v += 4) {
      if (far.getX(v) !== 1) continue;
      farQuads++;
      expect(w.get(Math.floor(pos.getX(v)), Math.floor(pos.getY(v)), Math.floor(pos.getZ(v)))).toBe(B.AIR);
    }
    expect(farQuads).toBe(1);
    // Without a world (tools), the old single halo per light.
    expect(new HaloSystem({} as LightingUniforms, [{ x: 4, y: 6, z: 4, id: B.LIGHT_EMBER }]).count).toBe(1);
  });
});

describe('the Vault floor keeps clear air (polish 2)', () => {
  it('weights the vault zone on its floor, with thinner haze than the Hollow, and not on the balconies far above', async () => {
    const { LightingRig, ATMOSPHERES } = await import('../../src/render/lighting');
    const { LightField } = await import('../../src/world/light');
    const { LanternField } = await import('../../src/world/light');
    const { zoneAnchorsFor } = await import('../../src/game/effects/LightBeams');
    const w = new VoxelWorld(48, 64, 48);
    const rig = new LightingRig(new LightField(w), new LanternField(w), 48, 64, 48);
    rig.setZoneAnchors(zoneAnchorsFor({ vault: [24, 10, 24] }));
    rig.updateAtmosphere(0, 26, 10, 22, null);
    expect(rig.zoneWeights.vault).toBeGreaterThan(0.95);
    expect(ATMOSPHERES.vault.density).toBeLessThan(ATMOSPHERES.hollow.density * 0.6);
    expect(rig.uniforms.uFogDensity.value).toBeCloseTo(ATMOSPHERES.vault.density, 4);
    rig.updateAtmosphere(0, 26, 32, 22, null); // 22 m up: a balcony
    expect(rig.zoneWeights.vault).toBeLessThan(0.01);
  });
});
