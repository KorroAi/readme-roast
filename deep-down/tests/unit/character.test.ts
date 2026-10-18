import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LightingUniforms } from '../../src/render/lighting';
import { ExplorerModel, type ExplorerAnimState } from '../../src/entities/character/ExplorerModel';
import { ExplorerAnimator, SWING_IMPACT, type ExplorerPose } from '../../src/entities/character/pose';

/** Lighting uniforms with tiny placeholder volumes: enough to construct materials in Node. */
function lighting(): LightingUniforms {
  const tex = (n: number) => new THREE.Data3DTexture(new Uint8Array(n * n * n * 4), n, n, n);
  return {
    uLightTex: { value: tex(2) },
    uLanternTex: { value: tex(2) },
    uWorldSize: { value: new THREE.Vector3(160, 128, 160) },
    uLanternOrigin: { value: new THREE.Vector3() },
    uLanternPos: { value: new THREE.Vector3() },
    uLanternColor: { value: new THREE.Color(1, 0.7, 0.4) },
    uLanternRadius: { value: 11 },
    uLanternIntensity: { value: 1 },
    uAmbient: { value: new THREE.Color() },
    uOpenAmbient: { value: new THREE.Color() },
    uEmitGain: { value: 1.7 },
    uFogColor: { value: new THREE.Color() },
    uFogDensity: { value: 0.02 },
    uTime: { value: 0 },
    uDebug: { value: new THREE.Vector3() },
  };
}

const state = (over: Partial<ExplorerAnimState> = {}): ExplorerAnimState => ({
  speed: 0,
  grounded: true,
  verticalVelocity: 0,
  aimPitch: 0,
  time: 0,
  ...over,
});

function allFinite(root: THREE.Object3D): boolean {
  let ok = true;
  root.traverse((o) => {
    for (const e of o.matrixWorld.elements) if (!Number.isFinite(e)) ok = false;
  });
  return ok;
}

function worldOf(root: THREE.Object3D, name: string): THREE.Vector3 {
  const o = root.getObjectByName(name)!;
  o.updateWorldMatrix(true, false);
  return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
}

/** Run the model for `seconds` at 60 fps with a fixed state. */
function run(e: ExplorerModel, seconds: number, s: Partial<ExplorerAnimState>, t0 = 0): number {
  let t = t0;
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    t += 1 / 60;
    e.update(1 / 60, state({ ...s, time: t }));
  }
  return t;
}

describe('ExplorerModel', () => {
  it('builds a ~1.7 m explorer standing on its origin', () => {
    const e = new ExplorerModel(lighting());
    run(e, 0.5, {});
    const box = new THREE.Box3().setFromObject(e.root);
    const size = box.getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThanOrEqual(1.6);
    expect(size.y).toBeLessThanOrEqual(1.9);
    expect(box.min.y).toBeGreaterThan(-0.02);
    expect(box.min.y).toBeLessThan(0.02);
    expect(size.x).toBeLessThan(1.2);
    let meshes = 0;
    e.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    // One mesh per rigid part (hips, torso, head, pack, 2x4 limb segments, pickaxe, lantern).
    expect(meshes).toBe(14);
  });

  it('keeps every transform finite in every movement state', () => {
    const e = new ExplorerModel(lighting());
    let t = 0;
    const states: Array<Partial<ExplorerAnimState>> = [
      {},
      { speed: 1.2 },
      { speed: 4.6 },
      { speed: 9 },
      { grounded: false, verticalVelocity: 7.4 },
      { grounded: false, verticalVelocity: -20, speed: 4.6 },
      { grounded: true, speed: 4.6 },
      { aimPitch: 1.4 },
      { aimPitch: -1.4, speed: 2 },
    ];
    for (const s of states) {
      if (s.aimPitch) e.swing(0.42);
      t = run(e, 0.6, s, t);
      expect(allFinite(e.root)).toBe(true);
    }
    // Degenerate frame times must not break the springs either.
    e.update(0, state({ time: t }));
    e.update(0.5, state({ time: t + 0.5, grounded: false, verticalVelocity: -30 }));
    e.update(0.5, state({ time: t + 1, grounded: true }));
    expect(allFinite(e.root)).toBe(true);
  });

  it('swings the pickaxe over the head, strikes in front, and finishes', () => {
    const e = new ExplorerModel(lighting());
    run(e, 0.3, {});
    expect(e.swinging).toBe(false);
    const rest = e.getPickaxeTipWorldPosition(new THREE.Vector3());
    // A 1 s swing puts the end of the wind-up (40%) and the impact (55%) on exact frames.
    const duration = 1;
    e.swing(duration);
    expect(e.swinging).toBe(true);
    let t = run(e, duration * 0.4, {}, 0.3);
    const windup = e.getPickaxeTipWorldPosition(new THREE.Vector3());
    expect(e.swinging).toBe(true);
    t = run(e, duration * (SWING_IMPACT - 0.4), {}, t);
    const impact = e.getPickaxeTipWorldPosition(new THREE.Vector3());
    expect(windup.y).toBeGreaterThan(1.7);
    expect(windup.z).toBeLessThan(impact.z);
    expect(impact.z).toBeGreaterThan(0.7);
    expect(impact.y).toBeGreaterThan(0.6);
    expect(impact.y).toBeLessThan(1.5);
    run(e, duration * 0.5, {}, t);
    expect(e.swinging).toBe(false);
    const after = e.getPickaxeTipWorldPosition(new THREE.Vector3());
    expect(after.distanceTo(rest)).toBeLessThan(0.1);
  });

  it('holds the lantern hanging below the left hand', () => {
    const e = new ExplorerModel(lighting());
    e.root.position.set(10, 3, -2);
    e.root.rotation.y = 1.1;
    for (const s of [{}, { speed: 4.6 }, { grounded: false, verticalVelocity: 5 }]) {
      run(e, 0.8, s);
      const flame = e.getLanternWorldPosition(new THREE.Vector3());
      const hand = worldOf(e.root, 'handL');
      expect(flame.distanceTo(hand)).toBeLessThan(0.4);
      expect(flame.y).toBeLessThan(hand.y);
      // Left side of the body (+X locally), and held in front of the hips.
      const local = e.root.worldToLocal(flame.clone());
      expect(local.x).toBeGreaterThan(0.15);
      expect(local.z).toBeGreaterThan(0);
      expect(local.y).toBeGreaterThan(0.3);
    }
  });

  it('swings the lantern when the explorer stops suddenly', () => {
    const e = new ExplorerModel(lighting());
    const pivot = e.root.getObjectByName('lanternPivot')!;
    let t = 0;
    for (let i = 0; i < 90; i++) {
      t += 1 / 60;
      e.root.position.z += 4.6 / 60;
      e.update(1 / 60, state({ speed: 4.6, time: t }));
    }
    for (let i = 0; i < 6; i++) {
      t += 1 / 60;
      e.update(1 / 60, state({ time: t }));
    }
    expect(Math.abs(pivot.rotation.x)).toBeGreaterThan(0.02);
    run(e, 4, {}, t);
    expect(Math.abs(pivot.rotation.x)).toBeLessThan(0.02);
  });

  it('swaps tool meshes by tier and drives the lantern glow from fuel', () => {
    const e = new ExplorerModel(lighting());
    const pick = e.root.getObjectByName('pickTip')!.parent as THREE.Mesh;
    const rusty = pick.geometry;
    e.setEquipment(2, 2);
    expect(pick.geometry).not.toBe(rusty);
    e.setEquipment(1, 1);
    expect(pick.geometry).toBe(rusty);
    const mat = pick.material as THREE.ShaderMaterial;
    e.setLantern(1, true);
    const full = mat.uniforms.uEmissiveScale.value as number;
    e.setLantern(0.1, true);
    const low = mat.uniforms.uEmissiveScale.value as number;
    e.setLantern(1, false);
    const out = mat.uniforms.uEmissiveScale.value as number;
    expect(full).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(out);
    expect(out).toBeGreaterThan(0);
    e.setFade(0.4);
    expect(mat.uniforms.uFade.value).toBeCloseTo(0.4);
    e.setFade(1);
    const scene = new THREE.Scene();
    scene.add(e.root);
    e.dispose();
    expect(scene.children.length).toBe(0);
  });
});

describe('ExplorerAnimator', () => {
  const keys = Object.keys(new ExplorerAnimator().pose) as Array<keyof ExplorerPose>;
  const snapshot = (p: ExplorerPose) => keys.map((k) => p[k]);
  const maxJump = (a: number[], b: number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

  it('walks at about two steps per second at walking speed', () => {
    const a = new ExplorerAnimator();
    let t = 0;
    let crossings = 0;
    let prev = 0;
    for (let i = 0; i < 600; i++) {
      t += 1 / 60;
      const p = a.update(1 / 60, state({ speed: 4.6, time: t }));
      if (i > 60 && Math.sign(p.thighL) !== Math.sign(prev)) crossings++;
      prev = p.thighL;
    }
    // Each step swaps which thigh leads, so sign changes of one thigh count steps.
    const stepsPerSecond = crossings / ((600 - 60) / 60);
    expect(stepsPerSecond).toBeGreaterThan(1.7);
    expect(stepsPerSecond).toBeLessThan(2.3);
  });

  it('blends between states without pops', () => {
    // Largest per-frame change of any channel over a sequence of state changes, at a given rate.
    const largestStep = (fps: number) => {
      const a = new ExplorerAnimator();
      let t = 0;
      let prev = snapshot(a.pose);
      let largest = 0;
      const sequence: Array<Partial<ExplorerAnimState>> = [{}, { speed: 4.6 }, { grounded: false, verticalVelocity: 7 }, { grounded: false, verticalVelocity: -9 }, {}, { aimPitch: 0.8 }, { speed: 2 }];
      for (const s of sequence) {
        for (let i = 0; i < (2 * fps) / 3; i++) {
          t += 1 / fps;
          const cur = snapshot(a.update(1 / fps, state({ ...s, time: t })));
          largest = Math.max(largest, maxJump(cur, prev));
          prev = cur;
        }
      }
      return largest;
    };
    const at60 = largestStep(60);
    const at240 = largestStep(240);
    expect(at60).toBeLessThan(0.3);
    // A real discontinuity would not shrink with the frame time; smooth blends shrink with it.
    expect(at240).toBeLessThan(at60 * 0.4);
  });

  it('restarts a swing from the current arm pose', () => {
    const a = new ExplorerAnimator();
    let t = 0;
    a.startSwing(0.42);
    for (let i = 0; i < 22; i++) a.update(1 / 60, state({ time: (t += 1 / 60) }));
    expect(a.swingProgress).toBeGreaterThan(0.8);
    const before = snapshot(a.pose);
    a.startSwing(0.42);
    const after = snapshot(a.update(1 / 60, state({ time: (t += 1 / 60) })));
    expect(maxJump(after, before)).toBeLessThan(0.2);
  });

  it('crouches on landing in proportion to the fall and recovers', () => {
    const land = (vv: number) => {
      const a = new ExplorerAnimator();
      let t = 0;
      for (let i = 0; i < 40; i++) a.update(1 / 60, state({ grounded: false, verticalVelocity: vv, time: (t += 1 / 60) }));
      let lowest = 0;
      for (let i = 0; i < 20; i++) lowest = Math.min(lowest, a.update(1 / 60, state({ time: (t += 1 / 60) })).bodyY);
      for (let i = 0; i < 60; i++) a.update(1 / 60, state({ time: (t += 1 / 60) }));
      return { lowest, settled: a.pose.bodyY };
    };
    const soft = land(-6);
    const hard = land(-16);
    expect(soft.lowest).toBeLessThan(-0.02);
    expect(hard.lowest).toBeLessThan(soft.lowest);
    expect(Math.abs(hard.settled)).toBeLessThan(0.01);
  });
});
