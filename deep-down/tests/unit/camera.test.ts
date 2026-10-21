import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B, RAMP, SOLID } from '../../src/config/blocks';
import { GEAR, PLAYER } from '../../src/config/balance';
import { ExplorerModel, FADE_RENDER_ORDER } from '../../src/entities/character/ExplorerModel';
import type { LightingUniforms } from '../../src/render/lighting';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { CameraRig, clearOfRock, fpVerticalFov } from '../../src/game/CameraRig';
import { EYE_CLEARANCE, EYE_HEIGHT, PITCH_LIMIT } from '../../src/game/fp/constants';
import { Viewmodel, swingAngle } from '../../src/game/fp/Viewmodel';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { standable } from '../../src/world/analysis/reachability';
import { Rng } from '../../src/core/rng';

/** A 1-wide, 2-high tunnel along X (y 5..6, z 16) through solid rock. */
function tunnelWorld(): VoxelWorld {
  const w = new VoxelWorld(32, 16, 32);
  w.blocks.fill(B.SLATE);
  w.fill(1, 5, 16, 30, 6, 16, B.AIR);
  return w;
}

/** Distance from a point to the nearest solid voxel box within 2 m (2 when none). */
function rockDistance(w: VoxelWorld, p: THREE.Vector3): number {
  let best = 2;
  for (let z = Math.floor(p.z) - 2; z <= Math.floor(p.z) + 2; z++)
    for (let y = Math.floor(p.y) - 2; y <= Math.floor(p.y) + 2; y++)
      for (let x = Math.floor(p.x) - 2; x <= Math.floor(p.x) + 2; x++) {
        const id = w.get(x, y, z);
        if (!SOLID[id] || RAMP[id]) continue;
        const dx = p.x - Math.max(x, Math.min(x + 1, p.x));
        const dy = p.y - Math.max(y, Math.min(y + 1, p.y));
        const dz = p.z - Math.max(z, Math.min(z + 1, p.z));
        best = Math.min(best, Math.hypot(dx, dy, dz));
      }
  return best;
}

describe('first-person camera', () => {
  it('sits at the eye, 1.62 m above the feet, in open space', () => {
    const w = new VoxelWorld(32, 32, 32);
    w.fill(0, 0, 0, 31, 4, 31, B.SLATE);
    const rig = new CameraRig(w);
    rig.update(1 / 60, 16.5, 5 + EYE_HEIGHT, 16.5, 390 / 844);
    expect(rig.camera.position.y).toBeCloseTo(5 + EYE_HEIGHT, 5);
    expect(rig.camera.position.x).toBeCloseTo(16.5, 5);
  });

  it('is a portrait lens of 78 degrees tall on an upright phone and 90 degrees wide on wide screens', () => {
    expect(fpVerticalFov(390 / 844)).toBeCloseTo(78, 3);
    const hfov = (aspect: number) => (2 * Math.atan(Math.tan((fpVerticalFov(aspect) * Math.PI) / 360) * aspect) * 180) / Math.PI;
    expect(hfov(16 / 9)).toBeCloseTo(90, 3);
    expect(hfov(915 / 412)).toBeCloseTo(90, 3);
    const rig = new CameraRig(tunnelWorld());
    rig.update(1 / 60, 10.5, 5 + EYE_HEIGHT, 16.5, 390 / 844);
    expect(rig.camera.fov).toBeCloseTo(78, 3);
    expect(rig.camera.near).toBeGreaterThanOrEqual(0.05);
  });

  it('holds pitch within 75 degrees, never rolls, and eases the view to the look in about 40 ms', () => {
    const w = new VoxelWorld(32, 32, 32);
    w.fill(0, 0, 0, 31, 4, 31, B.SLATE);
    const rig = new CameraRig(w);
    rig.snapTo(16.5, 6.62, 16.5);
    rig.look(0, -100000);
    expect(rig.pitch).toBeCloseTo(PITCH_LIMIT, 6);
    rig.look(0, 200000);
    expect(rig.pitch).toBeCloseTo(-PITCH_LIMIT, 6);
    rig.pitch = 0;
    rig.yaw = 0;
    rig.snapTo(16.5, 6.62, 16.5);
    rig.yaw = 0.5;
    rig.update(1 / 60, 16.5, 6.62, 16.5, 1);
    const first = rig.camera.rotation.y;
    expect(first).toBeGreaterThan(0.1); // moving at once
    expect(first).toBeLessThan(0.5); // eased
    for (let i = 0; i < 6; i++) rig.update(1 / 60, 16.5, 6.62, 16.5, 1);
    expect(rig.camera.rotation.y).toBeGreaterThan(0.45); // ~100 ms: there
    expect(rig.camera.rotation.z).toBe(0);
    rig.addTrauma(1);
    let maxRoll = 0;
    for (let i = 0; i < 30; i++) {
      rig.update(1 / 60, 16.5, 6.62, 16.5, 1);
      maxRoll = Math.max(maxRoll, Math.abs(rig.camera.rotation.z));
    }
    expect(maxRoll).toBe(0);
  });

  it('keeps the eye clear of rock in a 1 x 2 tunnel while the explorer brushes the walls and turns', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    let worst = Infinity;
    for (let i = 0; i < 360; i++) {
      // The body box is 0.62 wide: its centre stays 0.31 m from the walls.
      const z = 16.31 + 0.38 * (0.5 + 0.5 * Math.sin(i * 0.2));
      const x = 4 + i * 0.05;
      const y = 5 + EYE_HEIGHT;
      rig.yaw = i * 0.05;
      rig.pitch = 0.9 * Math.sin(i * 0.07);
      rig.update(1 / 60, x, y, z, 390 / 844);
      worst = Math.min(worst, rockDistance(w, rig.camera.position));
    }
    // A 2 m roof is 0.38 m over the eye: the guard lowers the eye a little, it never touches.
    expect(worst).toBeGreaterThan(0.3);
  });

  it('pushes a point off rock by the clearance, at most 0.32 m', () => {
    const w = tunnelWorld();
    const out = new THREE.Vector3();
    const moved = clearOfRock(w, 10.5, 5 + 1.62, 16.31, EYE_CLEARANCE, out);
    expect(moved).toBeGreaterThan(0.05);
    expect(out.z).toBeGreaterThan(16.31);
    expect(moved).toBeLessThanOrEqual(0.32 + 1e-9);
    expect(clearOfRock(w, 10.5, 5.5, 16.5, 0.3, out)).toBe(0);
  });

  it('keeps the eye clear of rock standing and at the top of a Grip Boots jump all over the real zone (fuzz)', () => {
    const { world, landmarks } = generateWorld();
    const rng = new Rng(4242);
    const apex = (GEAR.gripBoots.jumpVelocity * GEAR.gripBoots.jumpVelocity) / (2 * PLAYER.gravity);
    const centres = Object.values(landmarks).filter((v): v is [number, number, number] => !!v);
    const rig = new CameraRig(world);
    let poses = 0;
    let worst = Infinity;
    for (let attempt = 0; attempt < 12000 && poses < 500; attempt++) {
      const c = centres[rng.int(0, centres.length - 1)];
      const x = Math.floor(c[0]) + rng.int(-8, 8);
      const y = Math.floor(c[1]) + rng.int(-4, 4);
      const z = Math.floor(c[2]) + rng.int(-8, 8);
      if (!standable(world, x, y, z)) continue;
      // Jump only where the arc fits under the roof (the body never enters rock).
      const jump = poses % 2 === 1 && ![2, 3].some((k) => world.isSolidAt(x + 0.5, y + k + 0.5, z + 0.5));
      poses++;
      const px = x + 0.5 + rng.range(-0.18, 0.18);
      const py = y + EYE_HEIGHT + (jump ? Math.min(apex, 0.25) : 0);
      const pz = z + 0.5 + rng.range(-0.18, 0.18);
      rig.yaw = rng.range(-Math.PI, Math.PI);
      rig.pitch = rng.range(-1.2, 1.2);
      rig.snapTo(px, py, pz);
      for (let f = 0; f < 10; f++) {
        rig.update(1 / 60, px, py, pz, 390 / 844);
        worst = Math.min(worst, rockDistance(world, rig.camera.position));
      }
    }
    expect(poses).toBeGreaterThan(400);
    expect(worst).toBeGreaterThan(0.12);
  }, 60_000);

  it('turns toward a target off the centre of view, and leaves one near the centre alone', () => {
    const w = new VoxelWorld(32, 32, 32);
    w.fill(0, 0, 0, 31, 4, 31, B.SLATE);
    const rig = new CameraRig(w);
    rig.yaw = 0;
    rig.pitch = 0;
    rig.snapTo(16.5, 6.62, 16.5);
    rig.update(1 / 60, 16.5, 6.62, 16.5, 1);
    // Straight ahead is -z: a point 3 m ahead and slightly right is within 14 degrees.
    rig.faceToward(16.8, 6.62, 13.5, 1 / 60);
    expect(rig.yaw).toBe(0);
    // Far to the right (+x): the look comes round.
    for (let i = 0; i < 120; i++) {
      rig.faceToward(19.5, 6.62, 16.5, 1 / 60);
      rig.update(1 / 60, 16.5, 6.62, 16.5, 1);
    }
    expect(rig.yaw).toBeLessThan(-Math.PI / 2 + 0.3);
    // A tap at the right edge turns a share of the way there.
    const before = rig.yaw;
    rig.turnToward(1, 0, 0.3);
    expect(rig.yaw).toBeLessThan(before);
  });
});

describe('first-person viewmodel', () => {
  it('lands the pick on the contact frame of the swing and rests still between swings', () => {
    const contact = 0.55;
    // Strike angle is at its most forward at contact, lifted back before, home at the end.
    expect(swingAngle(contact, contact)).toBeCloseTo(-1, 6);
    expect(swingAngle(contact * 0.45, contact)).toBeCloseTo(0.42, 6);
    expect(swingAngle(0, contact)).toBe(0);
    expect(swingAngle(1, contact)).toBe(0);
    let minAt = 0;
    let min = Infinity;
    for (let i = 0; i <= 1000; i++) {
      const a = swingAngle(i / 1000, contact);
      if (a < min) {
        min = a;
        minAt = i / 1000;
      }
    }
    expect(minAt).toBeCloseTo(contact, 2);
  });

  it('changes the pick head and the lantern with the tiers, draws over the world, casts no shadow', () => {
    const vm = new Viewmodel();
    const meshes = () => {
      const out: THREE.Mesh[] = [];
      vm.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
      });
      return out;
    };
    const verts = () => meshes().map((m) => m.geometry.getAttribute('position').count).reduce((a, b) => a + b, 0);
    const v1 = verts();
    vm.set({ pickTier: 3 });
    const v3 = verts();
    expect(v3).not.toBe(v1);
    vm.set({ lanternTier: 2 });
    expect(verts()).not.toBe(v3);
    for (const m of meshes()) {
      expect(m.castShadow).toBe(false);
      expect(m.frustumCulled).toBe(false);
      expect(m.userData.viewmodel).toBe(true);
      const mat = m.material as THREE.ShaderMaterial;
      // The near-depth remap: drawn over the world, sorted among itself.
      expect(mat.vertexShader).toContain('0.0075');
    }
    // Placed at the camera: the meshes sit within a metre in front of the eye.
    const cam = new THREE.PerspectiveCamera(78, 390 / 844, 0.05, 100);
    cam.position.set(10, 5, 10);
    cam.rotation.set(-0.3, 1.2, 0, 'YXZ');
    cam.updateMatrixWorld();
    vm.update(1 / 60, cam, 390 / 844, 0, 0, new THREE.Color(0.05, 0.05, 0.05), new THREE.Color(1, 0.6, 0.3));
    for (const m of meshes()) {
      const p = new THREE.Vector3().setFromMatrixPosition(m.matrixWorld);
      expect(p.distanceTo(cam.position)).toBeLessThan(1);
    }
    vm.dispose();
  });

  it('mirrors for the left hand: the pick goes lower left, the lantern lower right', () => {
    const cam = new THREE.PerspectiveCamera(78, 390 / 844, 0.05, 100);
    cam.updateMatrixWorld();
    const amb = new THREE.Color(0.05, 0.05, 0.05);
    const fl = new THREE.Color(1, 0.6, 0.3);
    const side = (mirror: boolean) => {
      const vm = new Viewmodel();
      vm.set({ mirror });
      vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
      const flame = (vm as unknown as { uniforms: { uFlamePos: { value: THREE.Vector3 } } }).uniforms.uFlamePos.value.x;
      const light = vm.lightWorld(cam, new THREE.Vector3()).x;
      vm.dispose();
      return { flame, light };
    };
    const right = side(false);
    const left = side(true);
    expect(right.flame).toBeLessThan(0); // the lantern lower left
    expect(left.flame).toBeGreaterThan(0);
    expect(right.light).toBeLessThan(0);
    expect(left.light).toBeCloseTo(-right.light, 6);
  });

  it('holds the lantern still at rest and lifts its light for a raise', () => {
    const vm = new Viewmodel();
    const cam = new THREE.PerspectiveCamera(78, 390 / 844, 0.05, 100);
    cam.updateMatrixWorld();
    const amb = new THREE.Color(0.05, 0.05, 0.05);
    const fl = new THREE.Color(1, 0.6, 0.3);
    for (let i = 0; i < 120; i++) vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const flame = () => (vm as unknown as { uniforms: { uFlamePos: { value: THREE.Vector3 } } }).uniforms.uFlamePos.value;
    a.copy(flame());
    for (let i = 0; i < 60; i++) vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
    b.copy(flame());
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
    const rest = vm.lightWorld(cam, new THREE.Vector3()).y;
    vm.raise();
    for (let i = 0; i < 20; i++) vm.update(1 / 60, cam, 390 / 844, 0, 0, amb, fl);
    expect(vm.lightWorld(cam, new THREE.Vector3()).y).toBeGreaterThan(rest + 0.2);
    vm.dispose();
  });
});

describe('explorer near-camera fade', () => {
  it('is a true alpha fade with a depth pass, not a screen-door pattern', () => {
    const e = new ExplorerModel(lighting());
    const meshes = explorerMeshes(e);
    const colour = meshes[0].material as THREE.ShaderMaterial;
    // Opaque by default: plain opaque draws, no discard compiled in (early depth tests stay on).
    expect(colour.defines.USE_FADE).toBeUndefined();
    expect(colour.blending).toBe(THREE.NoBlending);
    e.setFade(0.4);
    for (const m of meshes) {
      const passes = m.material as THREE.Material[];
      expect(Array.isArray(passes)).toBe(true);
      const [depth, col] = passes;
      expect(col).toBe(colour);
      // Depth first: same render order, lower material id (three sorts by order, then id).
      expect(depth.colorWrite).toBe(false);
      const id = (mat: THREE.Material) => (mat as unknown as { id: number }).id;
      expect(id(depth)).toBeLessThan(id(col));
      expect(m.renderOrder).toBe(FADE_RENDER_ORDER);
      expect(m.geometry.groups.map((g) => g.materialIndex)).toEqual([0, 1]);
    }
    expect(colour.blending).toBe(THREE.CustomBlending);
    expect(colour.blendSrc).toBe(THREE.ConstantAlphaFactor);
    expect(colour.blendDst).toBe(THREE.OneMinusConstantAlphaFactor);
    // Eased: see-through only when genuinely close (0.4 requested -> 0.352 drawn).
    expect(colour.blendAlpha).toBeCloseTo(0.352, 3);
    // Tool swaps while faded: the new geometry gets its draw groups too.
    e.setEquipment(2, 2);
    e.setFade(0.5);
    for (const m of explorerMeshes(e)) expect(m.geometry.groups.length).toBe(2);
    // Back to full opacity: ordinary opaque draws again.
    e.setFade(1);
    for (const m of explorerMeshes(e)) {
      expect(m.material).toBe(colour);
      expect(m.renderOrder).toBe(0);
    }
    expect(colour.blending).toBe(THREE.NoBlending);
    // Hidden entirely when the opacity reaches zero.
    e.setFade(0);
    let shown = 0;
    e.root.traverseVisible((o) => {
      if ((o as THREE.Mesh).isMesh) shown++;
    });
    expect(shown).toBe(0);
    e.dispose();
  });
});

/** Lighting uniforms with tiny placeholder volumes: enough to construct materials in Node. */
function lighting(): LightingUniforms {
  const tex = (n: number) => new THREE.Data3DTexture(new Uint8Array(n * n * n * 4), n, n, n);
  return {
    uLightTex: { value: tex(2) },
    uLanternTex: { value: tex(2) },
    uWorldSize: { value: new THREE.Vector3(16, 16, 16) },
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

function explorerMeshes(e: ExplorerModel): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  e.root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}
