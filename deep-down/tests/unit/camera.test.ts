import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { ExplorerModel, FADE_RENDER_ORDER } from '../../src/entities/character/ExplorerModel';
import type { LightingUniforms } from '../../src/render/lighting';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { CameraRig } from '../../src/game/CameraRig';
import { segmentClear } from '../../src/world/light';
import { raycastVoxels } from '../../src/world/raycast';
import { generateWorld } from '../../src/world/gen/generateWorld';
import { standable } from '../../src/world/analysis/reachability';
import { Rng } from '../../src/core/rng';

/** A 3x3 tunnel along X (y 5..7, z 15..17) through solid rock. */
function tunnelWorld(): VoxelWorld {
  const w = new VoxelWorld(32, 16, 32);
  w.blocks.fill(B.SLATE);
  w.fill(1, 5, 15, 30, 7, 17, B.AIR);
  return w;
}

describe('CameraRig collision', () => {
  it('never puts the camera inside rock or behind rock while turning in a tight tunnel', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    const px = 16.5;
    const py = 5 + 1.45;
    const pz = 16.5;
    rig.snapTo(px, py, pz);
    let bad = 0;
    for (let i = 0; i < 360; i++) {
      rig.yaw = (i / 360) * Math.PI * 6; // fast swipes: three full turns in 6 s
      rig.pitch = -0.2 + 0.3 * Math.sin(i * 0.1);
      rig.update(1 / 60, px, py, pz, 16 / 9);
      const c = rig.camera.position;
      if (w.isSolidAt(c.x, c.y, c.z)) bad++;
      else if (!segmentClear(w, px, py, pz, c.x, c.y, c.z)) bad++;
    }
    expect(bad).toBe(0);
  });

  it('stays clear when the explorer is flush against a wall on the shoulder side', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    // Wall at z = 18 (solid). Put the explorer 0.31 m from it and look along -X so "right" is +Z.
    const px = 16.5;
    const py = 6.45;
    const pz = 17.69;
    rig.snapTo(px, py, pz);
    rig.yaw = Math.PI / 2 * 1; // camera forward = (-1, 0, 0)
    rig.yaw = Math.PI / 2;
    for (let i = 0; i < 30; i++) rig.update(1 / 60, px, py, pz, 16 / 9);
    const c = rig.camera.position;
    expect(w.isSolidAt(c.x, c.y, c.z)).toBe(false);
  });

  it('swaps to the left shoulder when the right is walled in, keeping the explorer off the crosshair', () => {
    const w = tunnelWorld();
    const rig = new CameraRig(w);
    const px = 16.5;
    const py = 6.45;
    const pz = 17.6; // right side (+Z when yaw = -pi/2) is the wall at z = 18
    rig.snapTo(px, py, pz);
    rig.yaw = -Math.PI / 2;
    rig.pitch = -0.1;
    for (let i = 0; i < 90; i++) rig.update(1 / 60, px, py, pz, 16 / 9);
    const c = rig.camera.position;
    expect(c.z).toBeLessThan(pz - 0.3);
    expect(w.isSolidAt(c.x, c.y, c.z)).toBe(false);
    expect(segmentClear(w, px, py, pz, c.x, c.y, c.z)).toBe(true);
  });

  it('uses the full boom in open space', () => {
    const w = new VoxelWorld(32, 32, 32);
    const rig = new CameraRig(w);
    rig.snapTo(16, 16, 16);
    for (let i = 0; i < 200; i++) rig.update(1 / 60, 16, 16, 16, 1);
    expect(rig.distance).toBeGreaterThan(rig.maxDistance - 0.05);
  });

  it('frames the explorer low and left of the crosshair in open space (phone landscape)', () => {
    const w = new VoxelWorld(48, 48, 48);
    const rig = new CameraRig(w);
    const feet = new THREE.Vector3(24.5, 20, 24.5);
    rig.snapTo(feet.x, feet.y + 1.45, feet.z);
    rig.yaw = 0.7;
    rig.pitch = -0.2;
    for (let i = 0; i < 120; i++) rig.update(1 / 60, feet.x, feet.y + 1.45, feet.z, 915 / 412);
    const screen = (y: number) => new THREE.Vector3(feet.x, feet.y + y, feet.z).project(rig.camera);
    const head = screen(1.87);
    const toes = screen(0);
    // Left of centre, clear of the crosshair, and wholly in the lower half: the route ahead (the
    // centre of the frame and above) is not behind the explorer.
    expect(head.x).toBeLessThan(-0.1);
    expect(head.x).toBeGreaterThan(-0.5);
    expect(head.y).toBeLessThan(-0.05);
    expect(toes.y).toBeGreaterThan(-0.95);
    // Smaller on screen than the round-2 framing (3.8 m boom, 62 degrees): about 35 % of the height.
    expect(head.y - toes.y).toBeLessThan(0.75);
    expect(rig.camera.fov).toBeCloseTo(rig.fov, 5);
  });

  it('keeps the explorer on screen on a portrait phone (smaller shoulder, wider lens)', () => {
    const w = new VoxelWorld(48, 48, 48);
    const rig = new CameraRig(w);
    rig.snapTo(24.5, 21.45, 24.5);
    rig.pitch = -0.2;
    for (let i = 0; i < 120; i++) rig.update(1 / 60, 24.5, 21.45, 24.5, 390 / 844);
    const pivot = new THREE.Vector3(24.5, 21.45, 24.5).project(rig.camera);
    expect(pivot.x).toBeLessThan(-0.05);
    expect(pivot.x).toBeGreaterThan(-0.6);
    expect(rig.camera.fov).toBeGreaterThan(rig.fov);
  });

  it('slides the shoulder in to see past a post behind it, and back out once clear', () => {
    // A post 2.5 m behind and right of the explorer, at boom height: the full shoulder runs into it.
    const w = new VoxelWorld(48, 48, 48);
    const rig = new CameraRig(w);
    const px = 24.5;
    const py = 21.45;
    const pz = 24.5;
    rig.yaw = 0; // lens looks along -Z, right is +X, the boom runs back along +Z
    rig.pitch = -0.1;
    rig.snapTo(px, py, pz);
    for (let i = 0; i < 120; i++) rig.update(1 / 60, px, py, pz, 915 / 412);
    const free = rig.distance;
    w.fill(26, 20, 27, 26, 23, 27, B.SLATE);
    rig.snapTo(px, py, pz);
    for (let i = 0; i < 120; i++) rig.update(1 / 60, px, py, pz, 915 / 412);
    const c = rig.camera.position;
    expect(w.isSolidAt(c.x, c.y, c.z)).toBe(false);
    expect(segmentClear(w, px, py, pz, c.x, c.y, c.z)).toBe(true);
    // A longer boom than the full shoulder allows, with the explorer still right of the lens line.
    expect(rig.distance).toBeGreaterThan(3.5);
    expect(c.x).toBeGreaterThan(px + 0.2);
    expect(free).toBeGreaterThan(rig.maxDistance - 0.05);
    // The post goes (mined away): the shoulder slides back out to its full width.
    w.fill(26, 20, 27, 26, 23, 27, B.AIR);
    for (let i = 0; i < 180; i++) rig.update(1 / 60, px, py, pz, 915 / 412);
    expect(rig.camera.position.x).toBeGreaterThan(px + 1.0);
    expect(rig.distance).toBeGreaterThan(rig.maxDistance - 0.05);
  });

  it('eases the shoulder back out without a jump when a wall beside the explorer ends', () => {
    // Walk along a wall on the right that stops: the lateral offset must not jump in one frame.
    const w = new VoxelWorld(64, 32, 32);
    w.fill(0, 10, 18, 30, 16, 18, B.SLATE); // wall at z = 18 for x <= 30
    const rig = new CameraRig(w);
    rig.yaw = -Math.PI / 2; // lens looks along +X: right is +Z, the wall side
    rig.pitch = -0.1;
    // 1 m from the wall: the right shoulder fits, shortened to 0.7 m (no swap).
    let x = 20.5;
    rig.snapTo(x, 11.45, 17);
    let last = rig.camera.position.z;
    let maxStep = 0;
    for (let i = 0; i < 240; i++) {
      x += 4 / 60;
      rig.update(1 / 60, x, 11.45, 17, 915 / 412);
      const z = rig.camera.position.z;
      if (i > 0) maxStep = Math.max(maxStep, Math.abs(z - last));
      last = z;
    }
    // At 4 m/s past the wall's end the camera drifts out instead of popping 0.45 m sideways
    // (the forward motion is 0.067 m per frame along X, not Z).
    expect(maxStep).toBeLessThan(0.05);
    expect(rig.camera.position.z).toBeGreaterThan(17 + 1.0);
  });

  it('keeps a clear line to the explorer at random poses all over the real zone (fuzz)', () => {
    const { world, landmarks } = generateWorld();
    const rng = new Rng(4242);
    const centres = Object.values(landmarks).filter((v): v is [number, number, number] => !!v);
    const rig = new CameraRig(world);
    let poses = 0;
    let blocked = 0;
    let inside = 0;
    for (let attempt = 0; attempt < 8000 && poses < 400; attempt++) {
      const c = centres[rng.int(0, centres.length - 1)];
      const x = Math.floor(c[0]) + rng.int(-8, 8);
      const y = Math.floor(c[1]) + rng.int(-4, 4);
      const z = Math.floor(c[2]) + rng.int(-8, 8);
      if (!standable(world, x, y, z)) continue;
      poses++;
      const px = x + 0.5;
      const py = y + 1.45;
      const pz = z + 0.5;
      rig.snapTo(px, py, pz);
      rig.yaw = rng.range(-Math.PI, Math.PI);
      rig.pitch = rng.range(-1.1, 0.8);
      for (let f = 0; f < 60; f++) {
        if (f % 20 === 10) rig.yaw += rng.range(-0.8, 0.8); // a swipe mid-settle
        rig.update(1 / 60, px, py, pz, 16 / 9);
        const cam = rig.camera.position;
        if (world.isSolidAt(cam.x, cam.y, cam.z)) inside++;
        else if (!segmentClear(world, px, py, pz, cam.x, cam.y, cam.z)) blocked++;
      }
    }
    expect(poses).toBeGreaterThan(300);
    expect(inside).toBe(0);
    expect(blocked).toBe(0);
  }, 60_000);
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

describe('CameraRig aim', () => {
  /** A big open room: floor at y 4, explorer standing on it, one block at its feet in front. */
  function room(): VoxelWorld {
    const w = new VoxelWorld(48, 32, 48);
    w.fill(0, 0, 0, 47, 4, 47, B.SLATE);
    w.setRaw(21, 5, 20, B.SLATE); // at the feet, directly in front (+x)
    return w;
  }

  it('can put the crosshair on a block at the feet directly in front when looking down', () => {
    // The landscape framing aims above the explorer; looking down it must ease back toward a
    // plain over-the-shoulder view, or blocks at the boots cannot be targeted (mining regression
    // found by the touch e2e at the deep seal).
    const w = room();
    const rig = new CameraRig(w);
    const px = 20.5, py = 5, pz = 20.5;
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    let best = Infinity;
    for (let yi = -20; yi <= 20; yi++) {
      for (let pi = 0; pi <= 30; pi++) {
        rig.snapTo(px, py + 1.45, pz);
        rig.yaw = -Math.PI / 2 + yi * 0.02; // facing +x
        rig.pitch = -0.3 - pi * 0.03;
        for (let f = 0; f < 120; f++) rig.update(1 / 30, px, py + 1.45, pz, 915 / 412);
        rig.rayThrough(0, 0, o, d);
        const hit = raycastVoxels(w, o.x, o.y, o.z, d.x, d.y, d.z, 12);
        if (hit && hit.x === 21 && hit.y === 5 && hit.z === 20) best = Math.min(best, -rig.pitch);
      }
    }
    // Reachable, and well before the -1.2 rad pitch limit.
    expect(best).toBeLessThan(1.1);
  });

  it('keeps the landscape framing at normal pitch (the explorer stays left and low)', () => {
    const w = room();
    const rig = new CameraRig(w);
    rig.snapTo(20.5, 6.45, 20.5);
    rig.yaw = 0;
    rig.pitch = -0.18;
    for (let f = 0; f < 120; f++) rig.update(1 / 30, 20.5, 6.45, 20.5, 915 / 412);
    const head = new THREE.Vector3(20.5, 6.9, 20.5).project(rig.camera);
    expect(head.x).toBeLessThan(-0.05); // left of centre
    expect(head.y).toBeLessThan(-0.05); // below centre
  });
});
