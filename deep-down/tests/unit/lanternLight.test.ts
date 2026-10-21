import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LanternLight, type LanternLightInput } from '../../src/render/lanternLight';
import type { LightingUniforms } from '../../src/render/lighting';

function uniforms(): LightingUniforms {
  return { uLanternRadius: { value: 0 }, uLanternIntensity: { value: 0 }, uLanternColor: { value: new THREE.Color() } } as unknown as LightingUniforms;
}

const base: LanternLightInput = { dt: 1 / 30, time: 0, fuel: 1, lit: true, tier: 1, radius: 11, intensity: 1, ember: 0.3 };

/** Run the light for a while at a fixed input and return the last radius, intensity and colour. */
function settle(inp: Partial<LanternLightInput>, frames = 90) {
  const u = uniforms();
  const l = new LanternLight();
  for (let i = 0; i < frames; i++) l.update(u, { ...base, ...inp, time: i / 30 });
  return { radius: u.uLanternRadius.value as number, intensity: u.uLanternIntensity.value as number, color: (u.uLanternColor.value as THREE.Color).clone(), light: l };
}

describe('lantern light (VIS r2)', () => {
  it('the pool shrinks and dims as the oil drains, and an empty lantern is an ember', () => {
    const full = settle({ fuel: 1 });
    const quarter = settle({ fuel: 0.25 });
    const out = settle({ lit: false, fuel: 0 });
    expect(quarter.radius).toBeLessThan(full.radius * 0.85);
    expect(quarter.radius).toBeGreaterThan(full.radius * 0.7);
    expect(quarter.intensity).toBeLessThan(full.intensity);
    expect(out.radius).toBeCloseTo(11 * 0.3, 5);
    expect(out.light.flame).toBeCloseTo(0.25, 5);
  });

  it('flickers gently (never a strobe) and sputters a little more when low', () => {
    const u = uniforms();
    const l = new LanternLight();
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 600; i++) {
      l.update(u, { ...base, time: i / 30 });
      lo = Math.min(lo, l.flicker);
      hi = Math.max(hi, l.flicker);
    }
    expect(lo).toBeGreaterThan(0.85);
    expect(hi).toBeLessThan(1.06);
    expect(hi - lo).toBeGreaterThan(0.01);
  });

  it('each tier has its own flame colour, and low oil leans toward red-amber', () => {
    const t1 = settle({ tier: 1 }).color;
    const t3 = settle({ tier: 3 }).color;
    expect(t3.b / t3.r).toBeGreaterThan(t1.b / t1.r); // the attuned lantern is paler gold
    const low = settle({ fuel: 0.05 }).color;
    expect(low.g / low.r).toBeLessThan(t1.g / t1.r);
  });
});
