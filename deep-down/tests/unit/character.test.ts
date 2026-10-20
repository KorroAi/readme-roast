import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { LightingUniforms } from '../../src/render/lighting';
import { ExplorerModel, type ExplorerAnimState } from '../../src/entities/character/ExplorerModel';
import { ExplorerAnimator, SWING_IMPACT, type ExplorerPose } from '../../src/entities/character/pose';
import { RIG } from '../../src/entities/character/parts';
import { CoatTails, tailFloor } from '../../src/entities/character/secondary';

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
    uFogStart: { value: 0 },
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
    // One mesh per rigid part (hips, torso, head, pack, 2x4 limb segments, pickaxe, lantern) plus
    // the parts with their own secondary motion: two coat tails and the ember vial.
    expect(meshes).toBe(17);
    // The pack frame's poles rise above the hat, but stay clear of a 2 m tunnel ceiling.
    expect(box.max.y).toBeLessThan(1.9);
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
    // Peak swing over the half second after stopping (independent of the walk phase at the stop).
    let peak = 0;
    for (let i = 0; i < 30; i++) {
      t += 1 / 60;
      e.update(1 / 60, state({ time: t }));
      peak = Math.max(peak, Math.abs(pivot.rotation.x));
    }
    expect(peak).toBeGreaterThan(0.02);
    run(e, 4, {}, t);
    expect(Math.abs(pivot.rotation.x)).toBeLessThan(0.02);
  });

  it('keeps the lantern swing slight at the player\'s real acceleration, turning and walking', () => {
    const e = new ExplorerModel(lighting());
    const pivot = e.root.getObjectByName('lanternPivot')!;
    const angle = () => Math.max(Math.abs(pivot.rotation.x), Math.abs(pivot.rotation.z));
    const dt = 1 / 60;
    let t = 0;
    let v = 0;
    let peak = 0;
    let walking = 0;
    // Start at the player's ground acceleration (38 m/s^2), walk 2 s, stop just as hard.
    for (let i = 0; i < 60 * 3; i++) {
      t += dt;
      const target = t < 2 ? 4.6 : 0;
      v = target > v ? Math.min(target, v + 38 * dt) : Math.max(target, v - 38 * dt);
      e.root.position.z += v * dt;
      e.update(dt, state({ speed: v, time: t }));
      peak = Math.max(peak, angle());
      if (t > 1 && t < 2) walking = Math.max(walking, angle());
    }
    expect(peak).toBeGreaterThan(0.05);
    expect(peak).toBeLessThan(0.4);
    expect(walking).toBeLessThan(0.1);
    expect(angle()).toBeLessThan(0.02);
    // A fast turn on the spot.
    peak = 0;
    for (let i = 0; i < 30; i++) {
      t += dt;
      e.root.rotation.y += 6 * dt;
      e.update(dt, state({ time: t }));
      peak = Math.max(peak, angle());
    }
    expect(peak).toBeLessThan(0.3);
  });

  it('hangs the ember vial below its peg and swings it on a hard stop, then settles', () => {
    const e = new ExplorerModel(lighting());
    e.root.rotation.y = -0.7;
    const pivot = e.root.getObjectByName('charmPivot')!;
    const hook = () => worldOf(e.root, 'charmHook');
    const vial = () => {
      pivot.updateWorldMatrix(true, false);
      return new THREE.Vector3(0, -0.11, 0).applyMatrix4(pivot.matrixWorld);
    };
    let t = run(e, 0.5, {});
    // At rest it hangs straight down from the peg, above the hat brim.
    expect(vial().distanceTo(hook())).toBeLessThan(0.115);
    expect(hook().x - vial().x).toBeCloseTo(0, 2);
    expect(vial().y).toBeLessThan(hook().y - 0.1);
    expect(vial().y).toBeGreaterThan(1.6);
    const dt = 1 / 60;
    let v = 0;
    let peak = 0;
    let walking = 0;
    const fwd = new THREE.Vector3(Math.sin(e.root.rotation.y), 0, Math.cos(e.root.rotation.y));
    for (let i = 0; i < 60 * 3; i++) {
      t += dt;
      const target = i < 120 ? 4.6 : 0;
      v = target > v ? Math.min(target, v + 38 * dt) : Math.max(target, v - 38 * dt);
      e.root.position.addScaledVector(fwd, v * dt);
      e.update(dt, state({ speed: v, time: t }));
      const a = Math.max(Math.abs(pivot.rotation.x), Math.abs(pivot.rotation.z));
      peak = Math.max(peak, a);
      if (i > 60 && i < 120) walking = Math.max(walking, a);
      expect(allFinite(e.root)).toBe(true);
    }
    // A visible swing on starts and stops, a gentle sway while walking, never wild.
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThan(0.5);
    expect(walking).toBeLessThan(0.15);
    run(e, 2, {}, t);
    expect(Math.abs(pivot.rotation.x) + Math.abs(pivot.rotation.z)).toBeLessThan(0.01);
  });

  it('flares the coat tails when setting off and lifts them while falling, then lets them hang', () => {
    const e = new ExplorerModel(lighting());
    const tail = e.root.getObjectByName('coatTailL')!;
    let t = run(e, 0.5, {});
    const rest = tail.rotation.x;
    expect(rest).toBeGreaterThanOrEqual(0);
    expect(rest).toBeLessThan(0.15);
    let peak = 0;
    let v = 0;
    for (let i = 0; i < 30; i++) {
      t += 1 / 60;
      v = Math.min(4.6, v + 38 / 60);
      e.root.position.z += v / 60;
      e.update(1 / 60, state({ speed: v, time: t }));
      peak = Math.max(peak, tail.rotation.x);
    }
    expect(peak).toBeGreaterThan(rest + 0.2);
    t = run(e, 0.6, { grounded: false, verticalVelocity: -9 }, t);
    expect(tail.rotation.x).toBeGreaterThan(0.5);
    t = run(e, 2, {}, t);
    expect(tail.rotation.x).toBeCloseTo(rest, 2);
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

  it('walks at about three and a half steps per second at walking speed', () => {
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
    expect(stepsPerSecond).toBeGreaterThan(3.0);
    expect(stepsPerSecond).toBeLessThan(3.8);
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

  it('keeps each coat tail behind its leg through walking, jumping and landing', () => {
    // The floor really clears the leg: the back-bottom corner of the thigh is in front of the
    // tail plane at the floor angle, for every thigh angle the animation uses.
    for (let thigh = -0.8; thigh <= 0.9; thigh += 0.05) {
      const a = tailFloor(thigh, 0.08);
      const c = { y: (-RIG.thigh - 0.02) * Math.cos(thigh) + 0.1 * Math.sin(thigh), z: (-RIG.thigh - 0.02) * Math.sin(thigh) - 0.1 * Math.cos(thigh) };
      // Signed distance of the corner in front of (+) the tail's front face: the face hangs from
      // the joint along (-cos a, -sin a) in (y, z), so its forward normal is (-sin a, cos a).
      const d = (c.y - RIG.tailY) * -Math.sin(a) + (c.z - RIG.tailZ) * Math.cos(a);
      expect(d).toBeGreaterThan(-0.002);
    }
    const a = new ExplorerAnimator();
    const tails = new CoatTails();
    const acc = new THREE.Vector3();
    let t = 0;
    let prev = [tails.left, tails.right];
    let largest = 0;
    const sequence: Array<Partial<ExplorerAnimState>> = [{}, { speed: 4.6 }, { speed: 9 }, { grounded: false, verticalVelocity: 7 }, { grounded: false, verticalVelocity: -12 }, {}, { speed: 2 }];
    for (const s of sequence) {
      for (let i = 0; i < 50; i++) {
        t += 1 / 60;
        const st = state({ ...s, time: t });
        const p = a.update(1 / 60, st);
        tails.step(1 / 60, acc, st, p);
        expect(tails.left).toBeGreaterThanOrEqual(tailFloor(p.thighL, p.kneeL) - 1e-6);
        expect(tails.right).toBeGreaterThanOrEqual(tailFloor(p.thighR, p.kneeR) - 1e-6);
        expect(Number.isFinite(tails.left + tails.right + tails.roll)).toBe(true);
        largest = Math.max(largest, Math.abs(tails.left - prev[0]), Math.abs(tails.right - prev[1]));
        prev = [tails.left, tails.right];
      }
    }
    // Pushed by the stride but never popping.
    expect(largest).toBeLessThan(0.3);
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
