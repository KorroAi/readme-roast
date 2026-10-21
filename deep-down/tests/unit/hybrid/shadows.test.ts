// The lantern and practical cube shadows (W1-LEAD §4.2; owner 1E): refresh rules, casters, the filter's constants.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_GLSL } from '../../../src/render/light/chunk';
import { LIGHT_PRESETS, featuresAt } from '../../../src/render/light/presets';
import { LightRig } from '../../../src/render/light/rig';
import { CubeShadow, SHADOW_MOVE_EPS, beyond, castsShadow, shadowDue } from '../../../src/render/light/shadows';

describe('cube shadow presets', () => {
  it('512² on High with the second shadowed practical, 256² on Balanced, off on Battery; 14 m of geometry', () => {
    expect(LIGHT_PRESETS.high.shadowRes).toBe(512);
    expect(LIGHT_PRESETS.high.secondShadow).toBe(true);
    expect(LIGHT_PRESETS.balanced.shadowRes).toBe(256);
    expect(LIGHT_PRESETS.balanced.secondShadow).toBe(false);
    expect(LIGHT_PRESETS.battery.shadows).toBe(false);
    for (const q of ['balanced', 'high'] as const) expect(LIGHT_PRESETS[q].shadowFar).toBe(14);
    expect(LIGHT_PRESETS.balanced.shadowTaps).toBeGreaterThanOrEqual(8);
    expect(LIGHT_PRESETS.high.shadowTaps).toBeLessThanOrEqual(16);
  });
});

describe('refresh only when something moved (zero cost at rest)', () => {
  it('reuses the cube at rest and below the 1 cm threshold', () => {
    expect(shadowDue(0, false, 1000, 1)).toBe(false);
    expect(shadowDue(SHADOW_MOVE_EPS * 0.9, false, 1000, 1)).toBe(false);
  });
  it('refreshes when the light moved, at the preset cadence', () => {
    expect(shadowDue(0.05, false, 1, 1)).toBe(true);
    expect(shadowDue(0.05, false, 1, 2)).toBe(false);
    expect(shadowDue(0.05, false, 2, 2)).toBe(true);
  });
  it('refreshes once when the light stops between cadence frames, so the picture at rest is exact', () => {
    expect(shadowDue(0.05, false, 1, 3, false)).toBe(false);
    expect(shadowDue(0.05, false, 1, 3, true)).toBe(true);
    expect(shadowDue(0, false, 1, 3, true)).toBe(false);
  });
  it('refreshes at once when the world changed (a block broke within range)', () => {
    expect(shadowDue(0, true, 0, 3)).toBe(true);
  });
  it('a still lantern over 600 frames renders its cube once (the rig drives it through request/render)', () => {
    const s = new CubeShadow('test');
    s.configure(true, 256, 14);
    let renders = 0;
    // Stand-in for render(): the decision part only (no GL in Node).
    const pos = new THREE.Vector3(1, 2, 3);
    let valid = false;
    let origin = new THREE.Vector3(1e9, 0, 0);
    let last = -1e9;
    for (let f = 0; f < 600; f++) {
      const moved = valid ? pos.distanceTo(origin) : Infinity;
      if (!valid || shadowDue(moved, false, f - last, 2)) {
        renders++;
        valid = true;
        origin = pos.clone();
        last = f;
      }
    }
    expect(renders).toBe(1);
    s.dispose();
  });
});

describe('casters', () => {
  it('opaque meshes cast; transparent, additive, noShadow, points and sprites do not', () => {
    const geo = new THREE.BoxGeometry();
    expect(castsShadow(new THREE.Mesh(geo, new THREE.MeshBasicMaterial()))).toBe(true);
    expect(castsShadow(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true })))).toBe(false);
    expect(castsShadow(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending })))).toBe(false);
    const mover = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mover.userData.noShadow = true;
    expect(castsShadow(mover)).toBe(false);
    expect(castsShadow(new THREE.Points(geo))).toBe(false);
    expect(castsShadow(new THREE.Sprite())).toBe(false);
  });
});

describe('only geometry within the shadow range renders into the cube', () => {
  it('skips a mesh wholly beyond 14 m, keeps one that reaches into range, and handles instanced meshes', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const near = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    near.position.set(0, 0, 10);
    near.updateMatrixWorld();
    const far = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    far.position.set(0, 0, 20);
    far.updateMatrixWorld();
    const big = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), new THREE.MeshBasicMaterial());
    big.position.set(0, 0, 20);
    big.updateMatrixWorld();
    const o = new THREE.Vector3();
    expect(beyond(near, o, 14)).toBe(false);
    expect(beyond(far, o, 14)).toBe(true);
    expect(beyond(big, o, 14)).toBe(false);
    const inst = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), 2);
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 0, 30));
    inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 40));
    inst.updateMatrixWorld();
    expect(beyond(inst, o, 14)).toBe(true);
    inst.setMatrixAt(1, new THREE.Matrix4().makeTranslation(0, 0, 5));
    inst.boundingSphere = null;
    expect(beyond(inst, o, 14)).toBe(false);
    // A pebble 8 m away is left out; the same pebble at 2 m casts.
    const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial());
    pebble.position.set(0, 0, 8);
    pebble.updateMatrixWorld();
    expect(beyond(pebble, o, 14)).toBe(true);
    pebble.position.set(0, 0, 2);
    pebble.updateMatrixWorld();
    expect(beyond(pebble, o, 14)).toBe(false);
  });
});

describe('the filter (light chunk)', () => {
  it('uses normal offset, slope bias, a 4-tap blocker search and up to 16 rotated Vogel taps', () => {
    const f = /float L_cubeShadow\([\s\S]*?\n\}/.exec(LIGHTING_GLSL)?.[0] ?? '';
    expect(f).toContain('Normal offset');
    expect(f).toMatch(/float slope = /);
    expect(f).toMatch(/for \(int i = 0; i < 4; i\+\+\)/);
    expect(f).toMatch(/for \(int i = 0; i < 16; i\+\+\)/);
    expect(f).toContain('L_ign(gl_FragCoord.xy)');
    // The rotation is per pixel and never animated (stillness): no time in the filter.
    expect(f).not.toMatch(/uL_Frame|uTime/);
    expect((LIGHTING_GLSL.match(/vec2\(-?\d\.\d+, -?\d\.\d+\)/g) ?? []).length).toBeGreaterThanOrEqual(16);
  });
});

describe('the rig and the ladder', () => {
  it('shadows follow the preset and the ladder: Balanced keeps them until the last step', () => {
    expect(featuresAt('balanced', 0).shadows).toBe(true);
    expect(featuresAt('balanced', 5).shadows).toBe(true);
    expect(featuresAt('balanced', 6).shadows).toBe(false);
    expect(featuresAt('high', 2).secondShadow).toBe(false);
  });
  it('the stack-off switch ("before" captures) disables the lantern cube', () => {
    const rig = new LightRig();
    rig.stackOff = true;
    rig.update(new THREE.PerspectiveCamera(), { pos: { x: 0, y: 0, z: 0 } }, [], 0);
    expect(rig.shadowA.enabled).toBe(false);
    rig.stackOff = false;
    rig.update(new THREE.PerspectiveCamera(), { pos: { x: 0, y: 0, z: 0 } }, [], 0.1);
    expect(rig.shadowA.enabled).toBe(true);
    rig.dispose();
  });
});
