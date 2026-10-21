import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import type { PropSpec } from '../../src/world/gen/types';
import { findPath, stickToward, TapController, type TapHost } from '../../src/game/TapController';
import type { MiningController } from '../../src/game/MiningController';
import { EventBus, type GameEvents } from '../../src/core/events';
import { createInputState } from '../../src/input/types';
import { isTap, PORTRAIT_STICK_TOP, TAP_MAX_MS, touchSide } from '../../src/ui/touchMath';
import { standable } from '../../src/world/analysis/reachability';
import { VoxelWorld } from '../../src/world/VoxelWorld';

/** A flat stone floor at y = 0 (stand at y = 1), 24 x 24, with optional walls. */
function floorWorld(): VoxelWorld {
  const w = new VoxelWorld(24, 16, 24, 8);
  for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) w.set(x, 0, z, B.SLATE);
  return w;
}

describe('tap to act: path search', () => {
  it('walks straight across open floor, ending on the goal', () => {
    const w = floorWorld();
    const p = findPath(w, 2, 1, 2, (x, y, z) => x === 8 && y === 1 && z === 2)!;
    expect(p).not.toBeNull();
    expect(p.length / 3).toBe(6);
    expect(p.slice(-3)).toEqual([8, 1, 2]);
    for (let i = 0; i < p.length; i += 3) expect(standable(w, p[i], p[i + 1], p[i + 2])).toBe(true);
  });

  it('goes round a wall, steps up one block and drops down safely', () => {
    const w = floorWorld();
    for (let z = 0; z < 20; z++) for (let y = 1; y <= 3; y++) w.set(6, y, z, B.SLATE); // wall x = 6, gap at z >= 20
    w.set(12, 1, 22, B.SLATE); // a one-block step on the way
    const p = findPath(w, 2, 1, 2, (x, y, z) => x === 10 && y === 1 && z === 2)!;
    expect(p).not.toBeNull();
    // Every move is a walk, a 1-block step up or a drop of at most 3.
    let prev = [2, 1, 2];
    for (let i = 0; i < p.length; i += 3) {
      const c = [p[i], p[i + 1], p[i + 2]];
      expect(Math.abs(c[0] - prev[0]) + Math.abs(c[2] - prev[2])).toBe(1);
      expect(c[1] - prev[1]).toBeLessThanOrEqual(1);
      expect(prev[1] - c[1]).toBeLessThanOrEqual(3);
      if (c[0] === 6) expect(c[2]).toBeGreaterThanOrEqual(20); // through the gap only
      prev = c;
    }
  });

  it('returns null when sealed off, or the nearest cell toward the goal when asked', () => {
    const w = floorWorld();
    for (let z = 0; z < 24; z++) for (let y = 1; y <= 3; y++) w.set(12, y, z, B.SLATE); // full wall
    expect(findPath(w, 2, 1, 2, (x, y, z) => x === 20 && y === 1 && z === 2)).toBeNull();
    const near = findPath(w, 2, 1, 2, (x, y, z) => x === 20 && y === 1 && z === 2, [20.5, 1, 2.5])!;
    expect(near.slice(-3)).toEqual([11, 1, 2]);
    expect(findPath(w, 2, 1, 2, (x, y, z) => x === 2 && y === 1 && z === 2)).toEqual([]);
  });
});

describe('tap to act: stick and touch zones', () => {
  it('turns a world direction into the stick input PlayerController walks along', () => {
    for (const yaw of [0, 0.7, -2.1, Math.PI]) {
      for (const [dx, dz] of [[1, 0], [0, -1], [-0.6, 0.8]]) {
        const [mx, my] = stickToward(dx, dz, yaw);
        // PlayerController: w = f * my + r * mx, f = (-sin, -cos), r = (cos, -sin).
        const wx = -Math.sin(yaw) * my + Math.cos(yaw) * mx;
        const wz = -Math.cos(yaw) * my - Math.sin(yaw) * mx;
        const len = Math.hypot(dx, dz);
        expect(wx).toBeCloseTo(dx / len, 6);
        expect(wz).toBeCloseTo(dz / len, 6);
      }
    }
    expect(stickToward(0, 0, 1)).toEqual([0, 0]);
  });

  it('the optional joystick starts only in the lower part of the left third; a drag anywhere else looks', () => {
    const W = 390;
    const H = 844;
    expect(touchSide(100, W, false, H * 0.8, H)).toBe('move');
    expect(touchSide(100, W, false, H * PORTRAIT_STICK_TOP - 1, H)).toBe('look');
    expect(touchSide(W / 3 + 2, W, false, H * 0.8, H)).toBe('look'); // the middle third looks
    expect(touchSide(300, W, false, H * 0.8, H)).toBe('look');
    expect(touchSide(300, W, true, H * 0.8, H)).toBe('move'); // left-handed mirrors it
    expect(touchSide(100, W, true, H * 0.8, H)).toBe('look');
    expect(touchSide(100, 915, false, 300, 412)).toBe('move'); // landscape: lower left third
    expect(touchSide(100, 915, false, 50, 412)).toBe('look');
    expect(touchSide(400, 915, false, 300, 412)).toBe('look');
    expect(touchSide(100, 915, false)).toBe('move');
  });

  it('a quick still press is a tap; a drag or a long hold is not', () => {
    expect(isTap(80, 3)).toBe(true);
    expect(isTap(TAP_MAX_MS + 1, 0)).toBe(false);
    expect(isTap(80, 30)).toBe(false);
  });
});

describe('tap to act: no tap does nothing', () => {
  function rig(pick: ReturnType<MiningController['pick']>, usable = true) {
    const w = floorWorld();
    const calls = { nudge: [] as Array<[number, number]>, hints: 0, pings: 0 };
    const host: TapHost = {
      world: w,
      player: () => ({ x: 5.5, y: 1, z: 5.5 }),
      hand: () => ({ x: 5.5, y: 2.62, z: 5.5 }),
      cameraYaw: () => 0,
      focusedPropId: () => null,
      propById: () => null,
      usable: () => usable,
      viewport: () => ({ width: 390, height: 844 }),
      hint: () => void calls.hints++,
      ping: () => void calls.pings++,
      nudge: (x, y) => void calls.nudge.push([x, y]),
    };
    const mining = { pick: () => pick, target: null } as unknown as MiningController;
    const tap = new TapController(host, mining, new EventBus<GameEvents>());
    return { tap, calls };
  }

  it('a tap that meets nothing turns the view toward it (and raises the lantern)', () => {
    const { tap, calls } = rig({ target: null, prop: null, hit: null });
    const input = createInputState();
    input.tapPressed = true;
    input.tapX = 0.4;
    input.tapY = 0.6;
    tap.update(1 / 60, input, false);
    expect(calls.nudge).toEqual([[0.4, 0.6]]);
    expect(input.lock).toBeNull();
    expect(tap.walking).toBe(false);
  });

  it('a tap on a chest walks up to use it; an opened cache is scenery and the tap passes through', () => {
    const chest = { id: 'cache-1', kind: 'chest', x: 9.5, y: 1, z: 5.5, interact: 'feature' } as unknown as PropSpec;
    const floor = { x: 12, y: 0, z: 5, nx: 0, ny: 1, nz: 0, distance: 7, block: B.SLATE };
    const full = rig({ target: null, prop: chest, hit: floor });
    const a = createInputState();
    a.tapPressed = true;
    full.tap.update(1 / 60, a, false);
    expect(full.tap.goalKind).toBe('use');
    const opened = rig({ target: null, prop: chest, hit: floor }, false);
    const b = createInputState();
    b.tapPressed = true;
    opened.tap.update(1 / 60, b, false);
    // Not a walk to the empty chest: the tap acts on what lies behind it (here the floor).
    expect(opened.tap.goalKind).toBe('walk');
  });

  it('a tap on floor far off walks there instead (and says where)', () => {
    const { tap, calls } = rig({ target: null, prop: null, hit: { x: 12, y: 0, z: 5, nx: 0, ny: 1, nz: 0, distance: 7, block: B.SLATE } });
    const input = createInputState();
    input.tapPressed = true;
    tap.update(1 / 60, input, false);
    expect(calls.nudge).toEqual([]);
    expect(calls.pings).toBe(1);
    expect(tap.walking).toBe(true);
    expect(tap.goalKind).toBe('walk');
    const h = tap.heading();
    expect(h).not.toBeNull();
    expect(h![0]).toBeGreaterThan(0.9); // the way on is +x
  });
});
