import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { WEAPONS } from '../../src/config/weapons';
import { EventBus, type GameEvents } from '../../src/core/events';
import { Combat, type CombatHost } from '../../src/game/fp/Combat';
import { flameSize, lanternFlicker } from '../../src/game/fp/flame';
import type { Viewmodel } from '../../src/game/fp/Viewmodel';
import type { MiningController, MiningTarget } from '../../src/game/MiningController';
import type { Mob, MobHitResult, MobSystem } from '../../src/game/mobs/types';
import { SNAP_PX, TapController, type TapHost } from '../../src/game/TapController';
import { createInputState } from '../../src/input/types';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import '../../src/game/fp/events';

// Round 2 (FP): selection without the dot, the tunk on ordinary rock, the lantern's flame, and the
// tap-a-creature attack.

const W = 390;
const H = 844;

function block(id: number, x: number, inReach = true): MiningTarget {
  return {
    kind: 'block', key: `${x},1,0`, x, y: 1, z: 0, nx: 0, ny: 0, nz: 1, point: new THREE.Vector3(x + 0.5, 1.5, 1), block: id,
    prop: null, name: 'b', hardness: 3, tier: 1, protectedReason: id === B.SLATE ? 'unbreakable' : null, inReach,
  };
}

/** A tap host over a flat floor; `pickAt(px)` says what lies `px` CSS px from the tap. */
function rig(pickAt: (px: number) => MiningTarget | null, tapMob?: () => boolean) {
  const w = new VoxelWorld(24, 16, 24, 8);
  for (let z = 0; z < 24; z++) for (let x = 0; x < 24; x++) w.set(x, 0, z, B.SLATE);
  // The targets' cells exist (a lock on a cell that is air reads as already broken).
  for (let x = 0; x < 12; x++) w.set(x, 1, 0, B.SLATE);
  const calls = { nudge: 0, hints: [] as string[] };
  const host: TapHost = {
    world: w,
    player: () => ({ x: 5.5, y: 1, z: 5.5 }),
    hand: () => ({ x: 5.5, y: 2.62, z: 5.5 }),
    cameraYaw: () => 0,
    focusedPropId: () => null,
    propById: () => null,
    usable: () => true,
    viewport: () => ({ width: W, height: H }),
    hint: (t) => void calls.hints.push(t),
    ping: () => {},
    nudge: () => void calls.nudge++,
    tapMob,
  };
  const mining = {
    pick: (x: number, y: number) => {
      const px = Math.hypot((x * W) / 2, (y * H) / 2);
      return { target: pickAt(px), prop: null, hit: null };
    },
    target: null,
  } as unknown as MiningController;
  const bus = new EventBus<GameEvents>();
  const tap = new TapController(host, mining, bus);
  const tapAt = () => {
    const input = createInputState();
    input.tapPressed = true;
    tap.update(1 / 60, input, false);
    return input;
  };
  return { tap, calls, bus, tapAt };
}

describe('selection without the dot', () => {
  it('a tap on ordinary rock in reach is one soft strike (a tunk): locked once, released by the tunk, no hint', () => {
    const { calls, bus, tap, tapAt } = rig((px) => (px < 1 ? block(B.SLATE, 3) : null));
    const input = tapAt();
    expect(input.lock).toEqual({ kind: 'block', x: 3, y: 1, z: 0 });
    expect(calls.nudge).toBe(0);
    bus.emit('block:tunk', { x: 3, y: 1, z: 0, block: B.SLATE, px: 3.5, py: 1.5, pz: 1 });
    input.tapPressed = false;
    tap.update(1 / 60, input, false);
    expect(input.lock).toBeNull();
    expect(calls.hints).toEqual([]);
  });

  it('a tap on far plain rock or the dark raises the lantern; never "no way through"', () => {
    const { calls, tapAt } = rig((px) => (px < 1 ? block(B.SLATE, 3, false) : null));
    const input = tapAt();
    expect(input.lock).toBeNull();
    expect(calls.nudge).toBe(1);
    expect(calls.hints).toEqual([]);
  });

  it('snaps to the rarest find within 56 px of the finger, then the nearest', () => {
    // Copper (common) 14 px away, crystal (epic) 56 px away: the crystal wins.
    const a = rig((px) => (Math.abs(px - SNAP_PX * 0.25) < 2 ? block(B.COPPER_ORE, 4) : Math.abs(px - SNAP_PX) < 2 ? block(B.CRYSTAL, 7) : null));
    expect(a.tapAt().lock).toEqual({ kind: 'block', x: 7, y: 1, z: 0 });
    // Two coppers: the one nearer the finger.
    const b = rig((px) => (Math.abs(px - SNAP_PX * 0.75) < 2 ? block(B.COPPER_ORE, 4) : Math.abs(px - SNAP_PX * 0.25) < 2 ? block(B.COPPER_ORE, 9) : null));
    expect(b.tapAt().lock).toEqual({ kind: 'block', x: 9, y: 1, z: 0 });
    // Nothing beyond 56 px is taken.
    const c = rig((px) => (px > SNAP_PX + 4 ? block(B.CRYSTAL, 7) : null));
    expect(c.tapAt().lock).toBeNull();
    expect(c.calls.nudge).toBe(1);
  });

  it('the thing under the finger is the one tapped, even with a rarer find near it', () => {
    const { tapAt } = rig((px) => (px < 1 ? block(B.COPPER_ORE, 4) : Math.abs(px - SNAP_PX * 0.5) < 2 ? block(B.CRYSTAL, 7) : null));
    expect(tapAt().lock).toEqual({ kind: 'block', x: 4, y: 1, z: 0 });
  });

  it('a creature under the finger answers first (no block is locked behind it)', () => {
    let asked = 0;
    const { tapAt } = rig(() => block(B.COPPER_ORE, 4), () => ++asked > 0);
    expect(tapAt().lock).toBeNull();
    expect(asked).toBe(1);
  });
});

describe('the lantern flame', () => {
  it('shrinks as the oil drains, an ember when out; flickers calmly, a little livelier when low', () => {
    expect(flameSize(1, true)).toBeCloseTo(1, 6);
    expect(flameSize(0.5, true)).toBeLessThan(flameSize(0.9, true));
    expect(flameSize(0.05, true)).toBeGreaterThan(flameSize(0, false));
    let calm = 0;
    let low = 0;
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      const a = lanternFlicker(t, 0.9);
      const b = lanternFlicker(t, 0.05);
      expect(a).toBeGreaterThan(0.9);
      expect(a).toBeLessThan(1.1);
      expect(b).toBeGreaterThan(0.85);
      expect(b).toBeLessThan(1.15);
      calm += Math.abs(a - 1);
      low += Math.abs(b - 1);
    }
    expect(low).toBeGreaterThan(calm);
  });
});

/** A fake viewmodel recording what Combat asks of it. */
function fakeVm() {
  const log = { attacks: [] as string[], stops: [] as number[], hand: 'pick', raises: 0 };
  const vm = {
    attack: (tool: string) => void log.attacks.push(tool),
    hitStop: (s: number) => void log.stops.push(s),
    raise: () => void log.raises++,
    setRightHand: (t: string) => void (log.hand = t),
    get rightHand() {
      return log.hand;
    },
    swinging: false,
    toolWorld: (o: THREE.Vector3) => o.set(8.3, 1.4, 7.5),
  };
  return { vm: vm as unknown as Viewmodel, log };
}

function mob(kind: Mob['kind'], z: number, hostile = true): Mob {
  return {
    id: 7, kind, family: hostile ? 'monster' : 'being', position: new THREE.Vector3(8, 1.6, z), bounds: { radius: 0.4, halfHeight: 0 },
    yaw: 0, hp: 10, state: 'stalk', stateTime: 0, hostile, tappable: true,
  };
}

function combatRig(m: Mob, owned: string[] = []) {
  const world = new VoxelWorld(16, 16, 16, 8);
  const cam = new THREE.PerspectiveCamera(78, W / H, 0.05, 100);
  cam.position.set(8, 1.62, 8);
  cam.updateMatrixWorld();
  const log = { hits: [] as Array<{ dmg: number; weapon?: string }>, fired: 0, flashes: 0, walks: 0, charges: 1 };
  const sys: MobSystem = {
    update: () => {},
    pick: () => m,
    hit: (_mob, dmg, strike): MobHitResult => {
      log.hits.push({ dmg, weapon: strike?.weapon });
      return { hit: true, killed: false, hitStop: m.hostile ? 0.04 : 0 };
    },
    fire: () => void log.fired++,
    flash: () => ++log.flashes,
    spawnEvent: () => [],
    list: () => [m],
  };
  const host: CombatHost = {
    mobs: () => sys,
    world,
    owned: () => owned,
    camera: () => cam,
    eye: () => new THREE.Vector3(8, 1.62, 8),
    viewport: () => ({ width: W, height: H }),
    walkNear: () => (log.walks++, true),
    stopWalk: () => {},
    flashCharges: () => log.charges,
    useFlashCharge: () => (log.charges > 0 ? (log.charges--, true) : false),
    hint: () => {},
    nudge: () => {},
  };
  const v = fakeVm();
  const bus = new EventBus<GameEvents>();
  const combat = new Combat(host, v.vm, bus);
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) combat.update(1 / 60, false);
  };
  return { combat, log, vmLog: v.log, run, bus };
}

describe('tap a creature', () => {
  it('a monster in reach takes the machete: wind-up, the hit lands at contact with a 40 ms hit stop', () => {
    const r = combatRig(mob('crawler', 6.6), ['machete']);
    expect(r.combat.tap(0, 0)).toBe(true);
    r.run(0.05);
    expect(r.vmLog.attacks).toEqual(['machete']);
    expect(r.log.hits).toEqual([]); // still winding up
    r.run(WEAPONS.machete.windup + 0.05);
    expect(r.log.hits).toEqual([{ dmg: WEAPONS.machete.damage, weapon: 'machete' }]);
    expect(r.vmLog.stops).toEqual([0.04]);
  });

  it('out of melee reach it walks into reach; with the sling it shoots instead', () => {
    const far = combatRig(mob('wisp', 0.5), ['machete']);
    far.combat.tap(0, 0);
    far.run(0.2);
    expect(far.log.walks).toBeGreaterThan(0);
    expect(far.vmLog.attacks).toEqual([]);
    const sling = combatRig(mob('wisp', 0.5), ['machete', 'sling']);
    sling.combat.tap(0, 0);
    sling.run(WEAPONS.sling.windup + 0.1);
    expect(sling.vmLog.attacks).toEqual(['sling']);
    expect(sling.log.fired).toBe(1);
  });

  it('a small being in reach is touched (no damage, no hit stop); the pick only harvests a shellback', () => {
    const r = combatRig(mob('glimmerkin', 6.8, false));
    r.combat.tap(0, 0);
    r.run(0.3);
    expect(r.log.hits).toEqual([{ dmg: 0, weapon: 'hand' }]);
    expect(r.vmLog.attacks).toEqual([]);
    expect(r.vmLog.stops).toEqual([]);
    const s = combatRig(mob('shellback', 6.6, false));
    s.combat.tap(0, 0);
    s.run(0.5);
    expect(s.vmLog.attacks).toEqual(['pick']);
    expect(s.log.hits[0].dmg).toBe(0);
  });

  it('a Flash Charge is spent once and bursts after its wind-up; none left, nothing happens', () => {
    const r = combatRig(mob('crawler', 6.6));
    expect(r.combat.flash()).toBe(true);
    r.run(WEAPONS.flash.windup + 0.05);
    expect(r.log.flashes).toBe(1);
    expect(r.vmLog.attacks).toEqual(['flash']);
    expect(r.combat.flash()).toBe(false);
  });

  it('keeps the best weapon up while a monster is near, and the pick back a while after', () => {
    const m = mob('crawler', 6.6);
    const r = combatRig(m, ['spear']);
    r.run(0.1);
    expect(r.vmLog.hand).toBe('spear');
    m.position.set(8, 1.6, -40);
    r.run(5);
    expect(r.vmLog.hand).toBe('pick');
  });

  it('a finger held on a monster strikes again at the weapon rate; a single tap strikes once', () => {
    const once = combatRig(mob('crawler', 6.6), ['machete']);
    once.combat.tap(0, 0);
    once.run(1.5);
    expect(once.vmLog.attacks.length).toBe(1);
    const held = combatRig(mob('crawler', 6.6), ['machete']);
    held.combat.tap(0, 0);
    held.combat.holding = true;
    held.run(1.5);
    expect(held.vmLog.attacks.length).toBeGreaterThanOrEqual(Math.floor(1.5 / WEAPONS.machete.rate));
  });
});
