// The shared light chunk, the rig and the light model (W1-LEAD §4.1, §4.3, §4.6, §4.9; owner 1E).
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_GLSL, LIGHT_UNIFORMS, MAX_PRACTICALS, lightingUniforms } from '../../../src/render/light/chunk';
import { DARK_LIFT } from '../../../src/render/light/uniforms';
import { FLAME, LANTERN_GAIN, flicker, wobble } from '../../../src/render/light/flame';
import { displayValue, faceRadiance, hexLinear, lanternAtt, lanternRadiance, luma } from '../../../src/render/light/model';
import { LightRig } from '../../../src/render/light/rig';
import { SELECT, importance, newSelectState, selectLights, type LightCandidate } from '../../../src/render/light/select';
import { shAddDirectional, shAddHemisphere, shEval, shMin, shZero } from '../../../src/render/light/sh';

describe('the light chunk (the 1C ↔ 1E seam)', () => {
  it('declares Surface with albedo, normal, roughness, metal, ao, emission and shade(Surface, worldPos, viewDir)', () => {
    const struct = /struct Surface \{([\s\S]*?)\};/.exec(LIGHTING_GLSL)?.[1] ?? '';
    for (const f of ['vec3 albedo', 'vec3 normal', 'float roughness', 'float metal', 'float ao', 'vec3 emission']) expect(struct).toContain(f);
    expect(LIGHTING_GLSL).toMatch(/vec3 shade\(Surface s, vec3 p, vec3 V\)/);
    expect(LIGHTING_GLSL).toMatch(/vec4 lightOut\(vec3 col, vec3 p\)/);
    expect(LIGHTING_GLSL).toMatch(/Surface surfaceInit\(vec3 albedo, vec3 n\)/);
  });

  it('has a GGX + Smith + Schlick specular and a wrapped Burley diffuse (one model for every surface)', () => {
    expect(LIGHTING_GLSL).toContain('float L_D(float nh, float a)');
    expect(LIGHTING_GLSL).toContain('float L_V(float nv, float nl, float a)');
    expect(LIGHTING_GLSL).toContain('vec3 L_F(vec3 f0, float vh)');
    expect(LIGHTING_GLSL).toContain('float L_Burley(');
  });

  it('every uniform the chunk declares is in lightingUniforms() (no silent zero)', () => {
    const declared = [...LIGHTING_GLSL.matchAll(/^uniform\s+(?:highp\s+)?\w+\s+(\w+)/gm)].map((m) => m[1]);
    const set = lightingUniforms();
    expect(declared.length).toBeGreaterThan(25);
    for (const name of declared) expect(set, name).toHaveProperty(name);
  });

  it('lightingUniforms() shares the same IUniform objects across calls (one rig write lights every material)', () => {
    const a = lightingUniforms();
    const b = lightingUniforms();
    expect(a).not.toBe(b);
    for (const k of Object.keys(a)) expect(a[k]).toBe(b[k]);
    expect(a.uL_Lantern).toBe(LIGHT_UNIFORMS.uL_Lantern);
  });

  it('samples no 2D texture (U-LOOK as amended): cubes for shadows and the probe, one 3D volume', () => {
    expect(LIGHTING_GLSL).not.toMatch(/sampler2D\b/);
    expect([...LIGHTING_GLSL.matchAll(/uniform\s+(?:highp\s+)?(sampler\w+)/g)].map((m) => m[1]).sort()).toEqual(['sampler3D', 'samplerCube', 'samplerCube', 'samplerCube']);
  });

  it('caps the practicals at 8 per pixel', () => {
    expect(MAX_PRACTICALS).toBe(8);
    expect(LIGHT_UNIFORMS.uL_PracPos.value).toHaveLength(8);
    expect(LIGHTING_GLSL).toContain('#define L_MAX_PRAC 8');
  });
});

describe('the flame (W1-LEAD §4.9)', () => {
  it('flickers within ±3 % and never strobes (slope bounded by the 2.3 Hz band)', () => {
    let lo = Infinity;
    let hi = -Infinity;
    let maxSlope = 0;
    let prev = flicker(0);
    const dt = 1 / 240;
    for (let t = dt; t < 120; t += dt) {
      const f = flicker(t);
      lo = Math.min(lo, f);
      hi = Math.max(hi, f);
      maxSlope = Math.max(maxSlope, Math.abs(f - prev) / dt);
      prev = f;
    }
    expect(lo).toBeGreaterThanOrEqual(1 - FLAME.flicker - 1e-9);
    expect(hi).toBeLessThanOrEqual(1 + FLAME.flicker + 1e-9);
    expect(hi - lo).toBeGreaterThan(0.03);
    // d/dt of A sin(2πft) ≤ 2πfA: the whole signal's slope stays under 2π · 2.3 Hz · 3 %.
    expect(maxSlope).toBeLessThan(2 * Math.PI * FLAME.maxHz * FLAME.flicker);
  });

  it('wobbles the source by 2–4 cm at most, smoothly', () => {
    const o = [0, 0, 0];
    let maxLen = 0;
    for (let t = 0; t < 60; t += 1 / 60) {
      wobble(t, o);
      maxLen = Math.max(maxLen, Math.hypot(o[0], o[1], o[2]));
    }
    expect(maxLen).toBeLessThanOrEqual(0.04);
    expect(maxLen).toBeGreaterThan(0.01);
  });
});

describe('the lantern calibration (SPEC §8.3, through AgX)', () => {
  it('a mid stone face (albedo 0.4) at 1.5 m reads 0.62–0.75 display; darker stone less; the pool falls off fast', () => {
    const at15 = displayValue(faceRadiance(0.4, 1.5));
    expect(at15).toBeGreaterThanOrEqual(0.62);
    expect(at15).toBeLessThanOrEqual(0.75);
    expect(displayValue(faceRadiance(0.3, 1.5))).toBeGreaterThanOrEqual(0.55);
    // A pool, not a floodlight: at 6 m a face reads under a third of its 1.5 m value.
    expect(displayValue(faceRadiance(0.4, 6))).toBeLessThan(at15 / 3);
    const v = [0.7, 1.5, 3, 6].map((d) => displayValue(faceRadiance(0.3, d)));
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeLessThan(v[i - 1]);
    // Nothing at the range's end.
    expect(lanternAtt(9, 9)).toBe(0);
  });

  it('the core is warm-pale and deepens to amber with distance (the hue moves, never toward blue)', () => {
    const near = lanternRadiance(0.3);
    const far = lanternRadiance(4);
    const warmth = (c: number[]) => c[2] / c[0];
    expect(warmth(far)).toBeLessThan(warmth(near));
    expect(near[0]).toBeGreaterThan(near[2]);
    expect(LANTERN_GAIN).toBeGreaterThan(0);
  });

  it('the hued darks never fall below 0.04 display: the dark floor (DARK_LIFT in the fog hue) lifts black itself', () => {
    const fog = hexLinear(0x1e2430);
    const k = DARK_LIFT / luma(fog);
    const lift = fog.map((v) => v * k) as [number, number, number];
    expect(displayValue(lift)).toBeGreaterThanOrEqual(0.04);
    expect(displayValue(lift)).toBeLessThan(0.07);
    // It stays hued (the fog's blue), and barely moves a lit mid (≤ 0.01 display).
    expect(lift[2]).toBeGreaterThan(lift[0]);
    const mid = faceRadiance(0.4, 3);
    expect(displayValue([mid[0] + lift[0], mid[1] + lift[1], mid[2] + lift[2]]) - displayValue(mid)).toBeLessThan(0.01);
  });
});

describe('practical selection (W1-LEAD §4.6)', () => {
  const lamp = (id: string, x: number, power = 1, range = 5): LightCandidate => ({ id, x, y: 0, z: 0, power, range });

  it('keeps at most 8, nearest and brightest first', () => {
    const cands = Array.from({ length: 14 }, (_, i) => lamp(`l${i}`, i * 2 + 1));
    const st = newSelectState();
    const out = selectLights(cands, 0, 0, 0, st, 0);
    expect(out).toHaveLength(SELECT.max);
    expect(out.map((e) => e.c.id)).toEqual(['l0', 'l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7']);
    expect(importance(lamp('cold', 1, 0), 0, 0, 0)).toBe(0);
  });

  it('a newly lit lamp enters in the frame it is passed (relight shows at once)', () => {
    const st = newSelectState();
    selectLights([lamp('a', 3)], 0, 0, 0, st, 1 / 60);
    const out = selectLights([lamp('a', 3), lamp('b', 4)], 0, 0, 0, st, 1 / 60);
    expect(out.find((e) => e.c.id === 'b')?.w).toBe(1);
  });

  it('does not swap two lamps of similar weight back and forth (hysteresis)', () => {
    const st = newSelectState();
    const many = Array.from({ length: 8 }, (_, i) => lamp(`k${i}`, 2 + i * 0.1));
    selectLights([...many, lamp('x', 3.1)], 0, 0, 0, st, 1 / 60);
    const ids0 = selectLights([...many, lamp('x', 3.1)], 0, 0, 0, st, 1 / 60).map((e) => e.c.id);
    // The eye moves a little: the ninth lamp is now marginally better than the weakest incumbent, not 25 % better.
    const ids1 = selectLights([...many, lamp('x', 2.6)], 0, 0, 0, st, 1 / 60).map((e) => e.c.id);
    expect(ids1.slice().sort()).toEqual(ids0.slice().sort());
  });

  it('a lamp that loses its slot fades out over 0.2 s instead of popping', () => {
    const st = newSelectState();
    const eight = Array.from({ length: 8 }, (_, i) => lamp(`k${i}`, 4 + i * 0.2));
    selectLights(eight, 0, 0, 0, st, 1 / 60);
    // A much stronger lamp appears: it takes the weakest slot, the loser fades.
    const out = selectLights([...eight, lamp('hero', 1, 4)], 0, 0, 0, st, 1 / 60);
    expect(out.find((e) => e.c.id === 'hero')?.w).toBe(1);
    expect(out.length).toBeLessThanOrEqual(8);
  });
});

describe('the ambient probe (L1 SH, W1-LEAD §4.3)', () => {
  it('a sky/ground hemisphere is exact: E(up) = sky, E(down) = ground, E(side) = the mean', () => {
    const sh = shAddHemisphere(shZero(), [0.06, 0.1, 0.12], [0.02, 0.015, 0.012]);
    expect(shEval(sh, [0, 1, 0])).toEqual([0.06, 0.1, 0.12].map((v) => expect.closeTo(v, 12)));
    expect(shEval(sh, [0, -1, 0])[0]).toBeCloseTo(0.02, 12);
    expect(shEval(sh, [1, 0, 0])[1]).toBeCloseTo(0.0575, 12);
  });

  it('a directional lobe brightens the faces turned to it, never goes negative, and keeps a hued floor', () => {
    const sh = shAddHemisphere(shZero(), [0.05, 0.08, 0.1], [0.02, 0.02, 0.025]);
    shAddDirectional(sh, [0, 0, 1], [0.0, 0.2, 0.25]);
    expect(shEval(sh, [0, 0, 1])[2]).toBeGreaterThan(shEval(sh, [0, 0, -1])[2]);
    for (const n of [[0, 0, -1], [0, -1, 0], [1, 0, 0]] as Array<[number, number, number]>) for (const v of shEval(sh, n)) expect(v).toBeGreaterThanOrEqual(0);
    expect(shMin(sh).every((v) => v >= 0)).toBe(true);
  });
});

describe('LightRig.update', () => {
  it('writes the flame (with its wobble), the practicals and the frame flags into the shared uniforms', () => {
    const rig = new LightRig();
    rig.flameFrozen = true;
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 1.6, 0);
    cam.updateMatrixWorld();
    const lamps = Array.from({ length: 11 }, (_, i) => ({ id: `lamp${i}`, pos: { x: i, y: 2, z: -3 }, color: 0xffb35c, intensity: i === 3 ? 0 : 1.5, range: 5 }));
    rig.update(cam, { pos: { x: -0.3, y: 1.15, z: -0.35 }, range: 9 }, lamps, 1);
    const u = rig.uniforms;
    expect(u.uL_Lantern.value.toArray()).toEqual([-0.3, 1.15, -0.35, 1]);
    expect(u.uL_LanternColor.value.w).toBe(9);
    expect(u.uL_PracCount.value).toBe(8);
    // The cold lamp is never chosen.
    const xs = u.uL_PracPos.value.slice(0, 8).map((v) => v.x);
    expect(xs).not.toContain(3);
    // Battery: 4 practicals, no shadows.
    rig.features = { ...rig.features, practicals: 4, shadows: false };
    rig.update(cam, { pos: { x: 0, y: 1, z: 0 } }, lamps, 1.1);
    expect(u.uL_PracCount.value).toBe(4);
    rig.dispose();
  });

  it('the live flame flickers within ±3 % of its colour and moves by ≤ 4 cm', () => {
    const rig = new LightRig();
    const cam = new THREE.PerspectiveCamera();
    const lum: number[] = [];
    let maxMove = 0;
    for (let t = 0; t < 10; t += 1 / 30) {
      rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], t);
      const c = rig.uniforms.uL_LanternColor.value;
      lum.push(luma([c.x, c.y, c.z]));
      const p = rig.uniforms.uL_Lantern.value;
      maxMove = Math.max(maxMove, Math.hypot(p.x, p.y, p.z));
    }
    const base = luma(hexLinear(0xffe6c6)) * LANTERN_GAIN;
    for (const l of lum) expect(Math.abs(l / base - 1)).toBeLessThanOrEqual(0.0301);
    expect(maxMove).toBeLessThanOrEqual(0.04);
    rig.dispose();
  });

  it('captures the reflection probe on its own once the eye has rested 0.5 s in a new space (Balanced), never on Battery', () => {
    const rig = new LightRig();
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(10, 2, 10);
    cam.updateMatrixWorld();
    for (let f = 0; f < 29; f++) rig.update(cam, { pos: { x: 10, y: 1.5, z: 10 } }, [], f / 60);
    expect(rig.probe.pending).toBe(false);
    for (let f = 29; f < 33; f++) rig.update(cam, { pos: { x: 10, y: 1.5, z: 10 } }, [], f / 60);
    expect(rig.probe.pending).toBe(true);
    const battery = new LightRig();
    battery.features = { ...battery.features, probes: false };
    for (let f = 0; f < 60; f++) battery.update(cam, { pos: { x: 10, y: 1.5, z: 10 } }, [], f / 60);
    expect(battery.probe.pending).toBe(false);
    rig.dispose();
    battery.dispose();
  });

  it('light shafts: ≤ 2, lit surfaces in the cylinder and light in the air; they rise with first light, gone with the stack off', () => {
    expect(LIGHTING_GLSL).toContain('float L_shaftAt(int i, vec3 p)');
    const rig = new LightRig();
    const cam = new THREE.PerspectiveCamera();
    rig.setShafts([
      { top: { x: 7, y: 8, z: 12 }, radius: 1, length: 8, color: 0xd6e6ff, intensity: 2 },
      { top: { x: 0, y: 8, z: 0 }, dir: { x: 0.3, y: -1, z: 0 }, radius: 0.5, length: 6, color: 0xffffff, intensity: 1 },
      { top: { x: 9, y: 9, z: 9 }, radius: 1, length: 1, color: 0xffffff, intensity: 1 },
    ]);
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 0);
    const u = rig.uniforms;
    expect(u.uL_ShaftCount.value).toBe(2);
    expect(Math.hypot(u.uL_ShaftDir.value[1].x, u.uL_ShaftDir.value[1].y, u.uL_ShaftDir.value[1].z)).toBeCloseTo(1, 6);
    const full = u.uL_ShaftCol.value[0].x;
    expect(full).toBeGreaterThan(0);
    rig.setFill(0.6);
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 0.1);
    expect(u.uL_ShaftCol.value[0].x).toBe(0);
    rig.setFill(0.8);
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 0.2);
    expect(u.uL_ShaftCol.value[0].x).toBeCloseTo(full / 2, 6);
    rig.stackOff = true;
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 0.3);
    expect(u.uL_ShaftCount.value).toBe(0);
    rig.setShafts([]);
    rig.dispose();
  });

  it('setAmbient writes the SH probe and the rim; setFill drives first light; the Lantern Raise spot fades by 1.4 s', () => {
    const rig = new LightRig();
    rig.setAmbient({ sky: 0x9fc3e6, ground: 0x302820, gain: 0.1, rim: { dir: { x: 0, y: 0, z: 1 }, color: 0x8fe3ee, gain: 0.1 } });
    const sh = rig.uniforms.uL_SH.value;
    expect(sh[2].z).toBeGreaterThan(0);
    expect(rig.uniforms.uL_Rim.value.w).toBe(1);
    rig.setFill(0.6);
    expect(rig.uniforms.uL_Ambient.value.x).toBeCloseTo(0.6);
    const cam = new THREE.PerspectiveCamera();
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 0);
    rig.raise({ x: 0, y: 0, z: -6 });
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 0.5);
    expect(rig.uniforms.uL_Spot.value.w).toBeGreaterThan(0);
    rig.update(cam, { pos: { x: 0, y: 0, z: 0 } }, [], 1.5);
    expect(rig.uniforms.uL_Spot.value.w).toBe(0);
    rig.dispose();
  });
});
