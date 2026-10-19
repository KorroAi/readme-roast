import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { assistTarget } from '../../src/game/aimAssist';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Haptics, HAPTIC_PATTERNS } from '../../src/ui/haptics';
import { followBase, joystickRadiusFor, JOYSTICK_FOLLOW } from '../../src/ui/touchMath';

/** A floor at y 0..3 with the explorer's hand at (8.5, 5.25, 8.5) looking along -z. */
function room(): VoxelWorld {
  const w = new VoxelWorld(16, 16, 16);
  w.fill(0, 0, 0, 15, 3, 15, B.SLATE);
  return w;
}
const minable = (id: number) => (id === B.ANCIENT_BRICK ? null : 0);

describe('touch aim assist', () => {
  it('picks the exposed block the explorer faces, within reach', () => {
    const w = room();
    w.setRaw(8, 4, 6, B.COPPER_ORE); // ahead
    w.setRaw(8, 4, 11, B.COPPER_ORE); // behind
    const a = assistTarget(w, 8.5, 5.25, 8.5, 0, 0, -1, 4.6, minable);
    expect(a).not.toBeNull();
    expect([a!.x, a!.y, a!.z]).toEqual([8, 4, 6]);
    // The face that looks at the hand (+z here) is the one reported.
    expect([a!.nx, a!.ny, a!.nz]).toEqual([0, 0, 1]);
  });

  it('never targets through a wall or something it may not mine', () => {
    const w = room();
    w.fill(6, 4, 6, 10, 7, 6, B.ANCIENT_BRICK); // an unbreakable wall in front
    w.setRaw(8, 4, 4, B.COPPER_ORE); // ore behind the wall
    const a = assistTarget(w, 8.5, 5.25, 8.5, 0, 0, -1, 4.6, minable);
    // Only floor blocks in front of the wall remain (exposed, visible, minable).
    expect(a === null || a.z > 6).toBe(true);
  });

  it('prefers the block nearest the view direction', () => {
    const w = room();
    w.setRaw(8, 5, 5, B.SLATE); // straight ahead
    w.setRaw(10, 5, 6, B.SLATE); // off to the side, a bit nearer
    const a = assistTarget(w, 8.5, 5.25, 8.5, 0, 0, -1, 4.6, minable);
    expect([a!.x, a!.y, a!.z]).toEqual([8, 5, 5]);
  });

  it('ignores blocks outside the cone and beyond reach', () => {
    const w = new VoxelWorld(16, 16, 16);
    w.setRaw(8, 5, 2, B.SLATE); // 6 m ahead: out of reach
    w.setRaw(12, 5, 8, B.SLATE); // 90 degrees to the side
    expect(assistTarget(w, 8.5, 5.25, 8.5, 0, 0, -1, 4.6, minable)).toBeNull();
  });
});

describe('joystick sizing and follow', () => {
  it('sizes the stick to the screen within 54-72 px', () => {
    expect(joystickRadiusFor(844, 390)).toBe(59);
    expect(joystickRadiusFor(390, 844)).toBe(59);
    expect(joystickRadiusFor(640, 300)).toBe(54);
    expect(joystickRadiusFor(1366, 1024)).toBe(72);
  });

  it('lets the base follow a thumb that overshoots the rim, keeping its direction', () => {
    const r = 60;
    expect(followBase(100, 100, 150, 100, r)).toEqual([100, 100]);
    const [bx, by] = followBase(100, 100, 300, 100, r);
    expect(by).toBe(100);
    expect(300 - bx).toBeCloseTo(r * JOYSTICK_FOLLOW, 6);
  });
});

describe('haptics', () => {
  it('vibrates on game events when enabled, rate-limits bursts, and stays silent when disabled', () => {
    const bus = new EventBus<GameEvents>();
    const calls: Array<number | readonly number[]> = [];
    let on = true;
    let now = 0;
    const h = new Haptics(bus, () => on, (p) => (calls.push(p), true), () => now);
    bus.emit('block:broken', { x: 0, y: 0, z: 0, block: B.SLATE });
    expect(calls).toEqual([HAPTIC_PATTERNS.broken]);
    bus.emit('item:picked', { item: 'stone', count: 1 });
    bus.emit('item:picked', { item: 'stone', count: 1 }); // same instant: merged
    expect(calls.length).toBe(2);
    now = 200;
    bus.emit('item:picked', { item: 'stone', count: 1 });
    expect(calls.length).toBe(3);
    on = false;
    bus.emit('discovery', { id: 'ledge' });
    expect(calls.length).toBe(3);
    h.dispose();
    on = true;
    bus.emit('discovery', { id: 'ledge' });
    expect(calls.length).toBe(3);
  });
});
