import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B } from '../../src/config/blocks';
import { pickaxeForTier } from '../../src/config/balance';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Rng } from '../../src/core/rng';
import { MiningProgress } from '../../src/gameplay/Mining';
import { CameraRig } from '../../src/game/CameraRig';
import { EYE_HEIGHT, REACH } from '../../src/game/fp/constants';
import { MiningController, type MiningHooks } from '../../src/game/MiningController';
import { createInputState } from '../../src/input/types';
import { VoxelWorld } from '../../src/world/VoxelWorld';

// First-person mining rules: reach is measured from the eye, a held finger follows the vein, and a
// strike never shakes the camera.

/** Floor at y 0..4, a slate wall at x = 10 with a copper vein in it, the explorer at x 8.5. */
function veinWorld(): VoxelWorld {
  const w = new VoxelWorld(32, 16, 32);
  w.fill(0, 0, 0, 31, 4, 31, B.SLATE);
  w.fill(10, 5, 10, 12, 9, 22, B.SLATE);
  for (const [x, y, z] of [[10, 6, 16], [10, 7, 16], [10, 6, 17]]) w.set(x, y, z, B.COPPER_ORE);
  return w;
}

function rig() {
  const w = veinWorld();
  const cam = new CameraRig(w);
  const eye = new THREE.Vector3(8.5, 5 + EYE_HEIGHT, 16.5);
  cam.yaw = -Math.PI / 2; // facing +x
  cam.pitch = Math.atan2(6.5 - eye.y, 1.5); // at the vein's first block
  cam.snapTo(eye.x, eye.y, eye.z);
  cam.update(1 / 60, eye.x, eye.y, eye.z, 390 / 844);
  const broken: string[] = [];
  const swings: number[] = [];
  const hooks: MiningHooks = {
    blockBroken: (x, y, z) => void broken.push(`${x},${y},${z}`),
    propBroken: () => undefined,
    rollDrop: () => 0,
    pickaxe: () => pickaxeForTier(3),
    swing: (_d, contact) => void swings.push(contact),
    face: () => undefined,
    hint: () => undefined,
    propRaycast: () => null,
    propById: () => null,
    propFlash: () => undefined,
  };
  const noop = { set: () => undefined, update: () => undefined, impact: () => undefined, burst: () => undefined, sparkle: () => undefined, dust: () => undefined, spawn: () => undefined };
  const shake = { trauma: 0 };
  const camProxy = new Proxy(cam, {
    get(t, k) {
      if (k === 'addTrauma') return (a: number) => void (shake.trauma += a);
      const v = Reflect.get(t, k);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  const bus = new EventBus<GameEvents>();
  const tunks: string[] = [];
  const hits: string[] = [];
  bus.on('block:tunk', (e) => void tunks.push(`${e.x},${e.y},${e.z}`));
  bus.on('block:hit', (e) => void hits.push(`${e.x},${e.y},${e.z}`));
  const m = new MiningController(w, bus, new MiningProgress(), hooks, noop as never, noop as never, noop as never, noop as never, camProxy, new Rng(7));
  return { w, cam, eye, m, broken, swings, shake, tunks, hits };
}

describe('first-person mining', () => {
  it('holding a finger on a vein mines it out block after block, with no camera shake', () => {
    const { w, eye, m, broken, swings, shake } = rig();
    const input = createInputState();
    input.lastDevice = 'touch';
    input.mining = true;
    input.aimFromPointer = true;
    input.aimX = 0;
    input.aimY = 0;
    for (let i = 0; i < 60 * 30 && broken.length < 3; i++) m.update(1 / 60, input, true, eye.x, eye.y, eye.z);
    expect(broken[0]).toBe('10,6,16');
    // The two other copper blocks of the vein, not the slate behind the first one.
    expect(broken.slice(1).sort()).toEqual(['10,6,17', '10,7,16']);
    expect(w.get(11, 6, 16)).toBe(B.SLATE);
    // Every strike lands on the swing's contact frame (the viewmodel times its head to it).
    expect(swings.every((c) => c === 0.55)).toBe(true);
    expect(shake.trauma).toBe(0);
  });

  it('measures reach from the eye: 3.5 m', () => {
    const { m, eye } = rig();
    const input = createInputState();
    input.lastDevice = 'mouse';
    const t = m.findTarget(input, eye.x, eye.y, eye.z);
    expect(t?.key).toBe('10,6,16');
    expect(t?.inReach).toBe(true);
    // From 3.6 m back the same block is out of reach.
    const far = m.findTarget({ ...input, lock: { kind: 'block', x: 10, y: 6, z: 16 } }, eye.x - (REACH + 0.6 - 1.5), eye.y, eye.z);
    expect(far?.inReach).toBe(false);
  });

  it('round 2: ordinary rock is a soft tunk, once per press: no damage, no crack, nothing breaks', () => {
    const { w, cam, eye, m, broken, tunks, hits } = rig();
    // Aim at the slate above the vein (10, 8, 16).
    cam.pitch = Math.atan2(8.5 - eye.y, 1.5);
    cam.snapTo(eye.x, eye.y, eye.z);
    cam.update(1 / 60, eye.x, eye.y, eye.z, 390 / 844);
    const input = createInputState();
    input.lastDevice = 'touch';
    input.mining = true;
    input.aimFromPointer = true;
    for (let i = 0; i < 60 * 4; i++) m.update(1 / 60, input, true, eye.x, eye.y, eye.z);
    expect(tunks).toEqual(['10,8,16']);
    expect(hits).toEqual([]);
    expect(broken).toEqual([]);
    expect(w.get(10, 8, 16)).toBe(B.SLATE);
    expect(m.hudTarget()).toBeNull();
    // A new press strikes once more.
    input.mining = false;
    m.update(1 / 60, input, true, eye.x, eye.y, eye.z);
    input.mining = true;
    for (let i = 0; i < 60; i++) m.update(1 / 60, input, true, eye.x, eye.y, eye.z);
    expect(tunks.length).toBe(2);
  });
});
