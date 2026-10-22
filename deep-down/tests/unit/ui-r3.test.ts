import { describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';
import { PlayerController } from '../../src/game/PlayerController';
import { createInputState, consumeEdges } from '../../src/input/types';
import { createPlayerActions, HOTBAR_SLOTS, isUiTarget, UI_TARGETS } from '../../src/ui/hud/actions';
import { Cooldown, DashAbility, SonarAbility, VeinCombo, dashDirection, sonarScan } from '../../src/game/fp/abilities';
import { COMBO_MAX, DASH_COOLDOWN, DASH_IFRAMES, MINE_TEMPO, SONAR_COOLDOWN, SPRINT_SPEED, WALK_SPEED } from '../../src/game/fp/constants';
import { bubblePlacement } from '../../src/ui/hud/Tutorial';
import { bearingTo } from '../../src/game/fp/ActionLayer';
import { firstFreeSlot } from '../../src/ui/screens/r3/bag';
import { pickCategory } from '../../src/ui/screens/r3/craft';
import { groupByBiome } from '../../src/ui/screens/r3/bestiary';
import { clampZoom, homeCamera, mapToView, scaleBarMetres, viewToMap, zoomAbout } from '../../src/ui/screens/r3/map';
import { MapRaster } from '../../src/ui/hud/Minimap';
import { trackerText } from '../../src/ui/hud/Hud';
import { openStratum } from '../../src/ui/screens/r3/quests';
import * as THREE from 'three';
import { Viewmodel } from '../../src/game/fp/Viewmodel';
import { sanitizeControlPrefs, DEFAULT_CONTROL_PREFS, languageOf } from '../../src/ui/controlPrefs';
import { GLYPH_NAMES, iconSvg } from '../../src/ui/hud/glyphs';
import { en } from '../../src/i18n/en';
import { controls } from '../../src/i18n/en/controls';

const FACE_PLUS_X = -Math.PI / 2;

function floorWorld(): VoxelWorld {
  const w = new VoxelWorld(32, 32, 32);
  w.fill(0, 0, 0, 31, 4, 31, B.SLATE);
  return w;
}

function run(p: PlayerController, seconds: number, moveX: number, moveY: number, camYaw = FACE_PLUS_X) {
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) p.update(dt, moveX, moveY, false, camYaw, false);
}

describe('round 3 action seam (ui/hud/actions)', () => {
  it('every action writes the InputState and the edges clear after a frame', () => {
    const input = createInputState();
    const a = createPlayerActions(input);
    a.move(2, -0.5, true);
    expect(input.moveX).toBe(1);
    expect(input.moveY).toBe(-0.5);
    expect(input.sprint).toBe(true);
    a.move(0, 0, true);
    expect(input.sprint).toBe(false);
    a.look(12, -3);
    a.look(Number.NaN, 2);
    expect([input.lookDX, input.lookDY]).toEqual([12, -1]);
    a.action(true);
    expect(input.actionHeld && input.actionPressed).toBe(true);
    a.jump();
    a.dash();
    a.interact();
    a.sonar();
    a.place();
    a.hotbar(3);
    a.open('map');
    expect(input.jumpPressed && input.dashPressed && input.interactPressed && input.sonarPressed && input.placePressed).toBe(true);
    expect(input.hotbarPressed).toBe(3);
    expect(input.openRequest).toBe('map');
    consumeEdges(input);
    expect(input.actionPressed || input.dashPressed || input.sonarPressed || input.placePressed || input.jumpPressed).toBe(false);
    expect(input.hotbarPressed).toBe(-1);
    expect(input.openRequest).toBeNull();
    // The held state stays until released.
    expect(input.actionHeld).toBe(true);
    a.action(false);
    expect(input.actionHeld).toBe(false);
    // Out-of-range slots are ignored; the Bag and pause go through their own edges.
    a.hotbar(HOTBAR_SLOTS);
    a.hotbar(-1);
    expect(input.hotbarPressed).toBe(-1);
    a.open('inventory');
    a.open('pause');
    expect(input.inventoryPressed && input.pausePressed).toBe(true);
  });

  it('names every tutorial target, hotbar slots included', () => {
    expect(UI_TARGETS).toContain('action');
    expect(UI_TARGETS).toContain('hotbar:5');
    expect(isUiTarget('sonar')).toBe(true);
    expect(isUiTarget('nope')).toBe(false);
    expect(new Set(UI_TARGETS).size).toBe(UI_TARGETS.length);
  });
});

describe('round 3 abilities (game/fp/abilities)', () => {
  it('a cooldown fires once, then waits its period', () => {
    const c = new Cooldown(2);
    expect(c.fire()).toBe(true);
    expect(c.fire()).toBe(false);
    expect(c.fraction).toBe(1);
    c.tick(1);
    expect(c.fraction).toBeCloseTo(0.5, 5);
    c.tick(1.5);
    expect(c.ready).toBe(true);
    expect(c.fraction).toBe(0);
  });

  it('a dash gives i-frames that run out, and waits its cooldown', () => {
    const d = new DashAbility();
    expect(d.tryDash()).toBe(true);
    expect(d.iframes).toBeCloseTo(DASH_IFRAMES, 5);
    expect(d.tryDash()).toBe(false);
    d.update(DASH_IFRAMES + 0.01);
    expect(d.iframes).toBe(0);
    d.update(DASH_COOLDOWN);
    expect(d.tryDash()).toBe(true);
  });

  it('dashes along the stick, or straight back when it rests', () => {
    const out = { x: 0, z: 0 };
    // yaw 0: forward is -z, right is +x.
    dashDirection(0, 1, 0, out);
    expect(out.x).toBeCloseTo(0, 5);
    expect(out.z).toBeCloseTo(-1, 5);
    dashDirection(1, 0, 0, out);
    expect(out.x).toBeCloseTo(1, 5);
    dashDirection(0, 0, 0, out);
    expect(out.z).toBeCloseTo(1, 5);
  });

  it('the sonar waits its cooldown between pulses', () => {
    const s = new SonarAbility();
    expect(s.tryPulse()).toBe(true);
    expect(s.tryPulse()).toBe(false);
    s.update(SONAR_COOLDOWN);
    expect(s.tryPulse()).toBe(true);
    expect(s.pulses).toBe(2);
  });

  it('the sonar scan finds the matching cells in the sphere, nearest first', () => {
    const w = new VoxelWorld(32, 32, 32);
    w.set(10, 10, 10, B.COPPER_ORE);
    w.set(14, 10, 10, B.IRON_ORE);
    w.set(30, 30, 30, B.COPPER_ORE);
    const found = sonarScan(w, 10.5, 10.5, 12.5, 8, (id) => id === B.COPPER_ORE || id === B.IRON_ORE);
    expect(found).toEqual([
      [10, 10, 10],
      [14, 10, 10],
    ]);
    expect(sonarScan(w, 10.5, 10.5, 12.5, 8, () => false)).toEqual([]);
  });

  it('chaining a vein speeds the swing up, to a cap, and lapses after the window', () => {
    const c = new VeinCombo();
    expect(c.tempo(0)).toBeCloseTo(MINE_TEMPO, 5);
    expect(c.onBreak(B.COPPER_ORE, 1, 1, 1, 0)).toBe(0);
    expect(c.onBreak(B.COPPER_ORE, 2, 1, 1, 1)).toBe(1);
    expect(c.tempo(1)).toBeLessThan(MINE_TEMPO);
    for (let i = 0; i < 10; i++) c.onBreak(B.COPPER_ORE, 2, 1, 1, 1 + i * 0.1);
    expect(c.count).toBe(COMBO_MAX);
    // Another kind, or a block far away, breaks the chain.
    expect(c.onBreak(B.IRON_ORE, 2, 1, 1, 2.5)).toBe(0);
    expect(c.onBreak(B.IRON_ORE, 20, 1, 1, 2.6)).toBe(0);
    c.onBreak(B.IRON_ORE, 20, 1, 2, 2.7);
    expect(c.live(2.7)).toBe(1);
    expect(c.live(20)).toBe(0);
  });
});

describe('round 3 movement (PlayerController)', () => {
  it('walks at about 4.2 m/s and sprints at about 6.5 m/s forward', () => {
    const p = new PlayerController(floorWorld());
    p.teleport(4.5, 5.5, 16.5);
    run(p, 0.5, 0, 0);
    run(p, 1.2, 0, 1);
    expect(p.speed).toBeCloseTo(WALK_SPEED, 2);
    p.sprint = true;
    run(p, 1.2, 0, 1);
    expect(p.speed).toBeCloseTo(SPRINT_SPEED, 2);
    // No sprint sideways or backwards.
    run(p, 1.2, 1, 0);
    expect(p.speed).toBeCloseTo(WALK_SPEED, 2);
  });

  it('a dash bursts along its direction, then the stride returns', () => {
    const p = new PlayerController(floorWorld());
    p.teleport(8.5, 5.5, 16.5);
    run(p, 0.5, 0, 0);
    const x0 = p.x;
    expect(p.dash(1, 0)).toBe(true);
    expect(p.dashing).toBe(true);
    run(p, 0.2, 0, 0);
    expect(p.x - x0).toBeGreaterThan(1.6);
    expect(p.dashing).toBe(false);
    run(p, 0.6, 0, 0);
    expect(p.speed).toBe(0);
    expect(p.dash(0, 0)).toBe(false);
  });

  it('climbs a ladder column and holds on it without falling', () => {
    const w = floorWorld();
    // A wall with a ladder column in front of it, 8 cells high.
    w.fill(12, 5, 10, 12, 20, 22, B.SLATE);
    for (let y = 5; y <= 13; y++) w.set(11, y, 16, B.LADDER);
    const p = new PlayerController(w);
    p.teleport(11.5, 5.5, 16.5);
    run(p, 0.3, 0, 0);
    expect(p.climbing).toBe(true);
    const y0 = p.y;
    run(p, 1.0, 0, 1);
    expect(p.y).toBeGreaterThan(y0 + 2.5);
    const y1 = p.y;
    run(p, 0.5, 0, 0);
    expect(Math.abs(p.y - y1)).toBeLessThan(0.05);
    p.jumpHeld = true;
    run(p, 0.5, 0, 0);
    expect(p.y).toBeGreaterThan(y1 + 1);
  });
});

describe('round 3 HUD and menu helpers', () => {
  it('puts a tutorial bubble above its target, else below, always on screen', () => {
    const view = { width: 390, height: 844 };
    const above = bubblePlacement({ left: 300, top: 700, width: 90, height: 90 }, { width: 300, height: 80 }, view);
    expect(above.side).toBe('above');
    expect(above.y + 80).toBeLessThanOrEqual(700);
    expect(above.x + 300).toBeLessThanOrEqual(390);
    const below = bubblePlacement({ left: 10, top: 10, width: 46, height: 46 }, { width: 300, height: 80 }, view);
    expect(below.side).toBe('below');
    expect(below.y).toBeGreaterThanOrEqual(56);
    expect(below.x).toBeGreaterThanOrEqual(10);
    // The pointer aims at the control even with the bubble pushed against the edge.
    expect(above.x + above.tip).toBeCloseTo(345, 0);
    // A pad: the bubble clears the whole pad cluster (never on the other pads).
    const cluster = { left: 200, top: 600, width: 180, height: 180 };
    const pad = bubblePlacement({ left: 285, top: 690, width: 90, height: 90 }, { width: 300, height: 80 }, view, 10, cluster);
    expect(pad.side).toBe('above');
    expect(pad.y + 80).toBeLessThanOrEqual(600);
    // A landscape phone: no room above the pads, so beside them on the open side.
    const land = { width: 915, height: 412 };
    const side = bubblePlacement({ left: 800, top: 300, width: 90, height: 90 }, { width: 300, height: 80 }, land, 10, { left: 690, top: 130, width: 215, height: 270 });
    expect(side.side).toBe('left');
    expect(side.x + 300).toBeLessThanOrEqual(690);
    expect(side.y).toBeGreaterThanOrEqual(10);
  });

  it('gives the arrow a bearing relative to the view (+ right)', () => {
    // yaw 0 looks toward -z: a target at -z is straight ahead, at +x to the right.
    expect(bearingTo(0, 0, -10)).toBeCloseTo(0, 5);
    expect(bearingTo(0, 10, 0)).toBeCloseTo(Math.PI / 2, 5);
    expect(bearingTo(0, -10, 0)).toBeCloseTo(-Math.PI / 2, 5);
    expect(Math.abs(bearingTo(0, 0, 10))).toBeCloseTo(Math.PI, 5);
  });

  it('fills a free hotbar slot (never the pick and weapon), reusing the slot already holding it', () => {
    const slots = [{ item: 'rustyPick' }, { item: null }, { item: 'bomb' }, { item: null }, { item: 'bread' }, { item: null }] as Array<{ item: never }>;
    expect(firstFreeSlot(slots, 'bomb' as never)).toBe(2);
    expect(firstFreeSlot(slots, 'torch' as never)).toBe(3);
    const full = slots.map(() => ({ item: 'stone' })) as Array<{ item: never }>;
    expect(firstFreeSlot(full, 'torch' as never)).toBe(5);
  });

  it('opens Craft on the remembered tab, else the first with a ready card', () => {
    const v = { categories: [{ id: 'tools', name: 'Tools', ready: 0, total: 3 }, { id: 'building', name: 'Building', ready: 2, total: 4 }, { id: 'armour', name: 'Armour', ready: 0, total: 0 }] } as never;
    expect(pickCategory(v, null)).toBe('building');
    expect(pickCategory(v, 'tools')).toBe('tools');
    expect(pickCategory(v, 'armour')).toBe('building');
  });

  it('groups the bestiary by biome in order', () => {
    const e = (kind: string, biome: string) => ({ kind, biome, name: kind, role: 'monster' as const, desc: '', seen: true, scanned: false, defeated: 0, bonus: null });
    const g = groupByBiome([e('a', 'Amber'), e('b', 'Amber'), e('c', 'Mushroom'), e('d', 'Amber')]);
    expect(g.map((x) => [x.biome, x.entries.length])).toEqual([
      ['Amber', 3],
      ['Mushroom', 1],
    ]);
  });

  it('pans and zooms the Map about a point, within the stratum and the zoom limits', () => {
    const src = { width: 256, depth: 256, playerX: 100, playerZ: 60 };
    const cam = homeCamera(src, 320);
    // Centred on the explorer, about 56 m across.
    expect(mapToView(cam, 100, 60, 320)).toEqual([160, 160]);
    expect(cam.zoom).toBeCloseTo(320 / 56, 5);
    const [wx, wz] = viewToMap(cam, 40, 300, 320);
    expect(mapToView(cam, wx, wz, 320).map((n) => Math.round(n))).toEqual([40, 300]);
    // A pinch keeps the point under the fingers still.
    const z = zoomAbout(cam, 2, 40, 300, 320, src);
    expect(z.zoom).toBeCloseTo(cam.zoom * 2, 5);
    expect(mapToView(z, wx, wz, 320).map((n) => Math.round(n))).toEqual([40, 300]);
    // Never past the whole stratum or the close limit.
    expect(clampZoom(0.01, 320, src)).toBeCloseTo((320 / 256) * 0.9, 5);
    expect(clampZoom(99, 320, src)).toBe(14);
    expect(scaleBarMetres(5.7)).toBe(10);
    expect(scaleBarMetres(1.4)).toBe(50);
  });

  it('paints the explored stratum: fog transparent, floor tinted, walls rimmed, rock dark', () => {
    // A 6 x 6 stratum: a 4 x 4 explored floor room with one rock column in it.
    const cell = (x: number, z: number) => (x >= 1 && x <= 4 && z >= 1 && z <= 4 ? (x === 3 && z === 3 ? 1 : 2) : 0);
    const src = { width: 6, depth: 6, originX: 0, originZ: 0, revision: 1, cell, biome: () => 0, biomeColors: [0x40a0ff], markers: [], playerX: 0, playerZ: 0, yaw: 0 };
    const r = new MapRaster();
    expect(r.update(src)).toBe(true);
    expect(r.update(src)).toBe(false);
    const px = (x: number, z: number) => Array.from(r.rgba.slice((x + z * 6) * 4, (x + z * 6) * 4 + 4));
    expect(px(0, 0)[3]).toBe(0);
    // An inner floor column (2,2) is tinted toward the biome's blue; a border one (1,1) is the pale rim.
    const inner = px(2, 2);
    const rim = px(1, 1);
    expect(inner[3]).toBe(255);
    expect(inner[2]).toBeGreaterThan(inner[0]);
    expect(rim[0] + rim[1] + rim[2]).toBeGreaterThan(inner[0] + inner[1] + inner[2]);
    const rock = px(3, 3);
    expect(rock[0] + rock[1] + rock[2]).toBeLessThan(inner[0] + inner[1] + inner[2]);
  });

  it('keeps the hands finite through a bad frame (QA 22:10: black hands, no lantern after a black-out)', () => {
    const vm = new Viewmodel();
    const cam = new THREE.PerspectiveCamera(70, 390 / 844, 0.05, 100);
    cam.updateMatrixWorld();
    const amb = new THREE.Color(0.2, 0.2, 0.2);
    const flame = new THREE.Color(1, 0.6, 0.3);
    // A frame with no time and a NaN speed (0 / 0), then ordinary frames.
    vm.update(0, cam, 390 / 844, Number.NaN, Number.NaN, amb, flame);
    for (let i = 0; i < 5; i++) vm.update(1 / 30, cam, 390 / 844, 1.2, 0.3, amb, flame);
    const bad: string[] = [];
    vm.group.traverse((o) => {
      o.updateMatrixWorld(true);
      if (!o.matrixWorld.elements.every(Number.isFinite)) bad.push(o.name || o.type);
    });
    expect(bad).toEqual([]);
  });

  it('opens the main chain on the stratum under way (the deeper ones stay sealed)', () => {
    const st = (...steps: Array<[boolean, boolean]>) => ({ steps: steps.map(([done, current]) => ({ done, current })) });
    expect(openStratum([st([true, false], [false, true]), st([false, false]), st([false, false])])).toBe(0);
    expect(openStratum([st([true, false]), st([true, false], [false, true]), st([false, false])])).toBe(1);
    // No current step (the tutorial is under way): the first with a step left.
    expect(openStratum([st([false, false]), st([false, false])])).toBe(0);
    expect(openStratum([st([true, false]), st([true, false])])).toBe(1);
  });

  it("drops a tracker line's own count when the count column shows it", () => {
    expect(trackerText("Find the guardians' lairs of Stratum I (0/2)", 2)).toBe("Find the guardians' lairs of Stratum I");
    expect(trackerText('Mine 25 veins 3/25', 25)).toBe('Mine 25 veins');
    // Another number, or no count column: the words stay.
    expect(trackerText('Reach 200 m (1/3)', 2)).toBe('Reach 200 m (1/3)');
    expect(trackerText('Learn the ropes (0/11)', undefined)).toBe('Learn the ropes (0/11)');
    expect(trackerText('2/2', 2)).toBe('2/2');
  });

  it('keeps the control preferences in range', () => {
    expect(sanitizeControlPrefs(null)).toEqual(DEFAULT_CONTROL_PREFS);
    expect(sanitizeControlPrefs({ scale: 9, opacity: -1 })).toEqual({ ...DEFAULT_CONTROL_PREFS, scale: 1.3, opacity: 0.35 });
    expect(sanitizeControlPrefs({ scale: 'x', opacity: Number.NaN })).toEqual(DEFAULT_CONTROL_PREFS);
    // The accessibility preferences: only a real true / 'reduce' turns them on.
    expect(sanitizeControlPrefs({ patterns: 'yes', motion: 'fast' })).toMatchObject({ patterns: false, motion: 'auto' });
    expect(sanitizeControlPrefs({ patterns: true, motion: 'reduce' })).toMatchObject({ patterns: true, motion: 'reduce' });
    // The language: one of the game's, else the device's ('auto').
    expect(sanitizeControlPrefs({ language: 'fr' }).language).toBe('fr');
    expect(sanitizeControlPrefs({ language: 'de' }).language).toBe('auto');
    expect(languageOf({ language: 'auto' }, () => 'fr')).toBe('fr');
    expect(languageOf({ language: 'en' }, () => 'fr')).toBe('en');
  });

  it('draws every glyph as a self-contained SVG', () => {
    for (const n of GLYPH_NAMES) expect(iconSvg(n)).toMatch(/^<svg [^>]*viewBox="0 0 24 24"[^>]*>.*<\/svg>$/);
    expect(iconSvg('unknown-name')).toBe(iconSvg('other'));
  });

  it('has every UI text key in the English table, none empty', () => {
    for (const [k, v] of Object.entries(controls)) {
      expect(en[k as keyof typeof en]).toBe(v);
      expect(v.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('round 3 UI, after the resume', () => {
  it('reads a New Game seed: digits as the number, any word hashed, blank as none', async () => {
    const { seedFromText } = await import('../../src/ui/seed');
    expect(seedFromText('')).toBeUndefined();
    expect(seedFromText('   ')).toBeUndefined();
    expect(seedFromText('12345')).toBe(12345);
    expect(seedFromText(' 42 ')).toBe(42);
    const a = seedFromText('lantern');
    expect(a).toBeGreaterThan(0);
    expect(seedFromText('LANTERN')).toBe(a);
    expect(seedFromText('lanterns')).not.toBe(a);
    // Too big for 32 bits: hashed, not wrapped.
    expect(seedFromText('99999999999')).toBeGreaterThan(0);
  });

  it('frames the title over a stratum: the hall\'s longest view, from its far side, never inside rock', async () => {
    const { findMenuShot, shotPose } = await import('../../src/game/MenuCamera');
    // A long hall along +x (40 m), 8 m wide, 6 m high, the fire 6 m from the west wall.
    const w = new VoxelWorld(64, 32, 32);
    w.fill(0, 0, 0, 63, 31, 31, B.SLATE);
    w.fill(4, 5, 12, 44, 10, 19, B.AIR);
    const shot = findMenuShot(w, [10, 5, 15]);
    // It looks down the hall (+x: forward = (-sin yaw, -cos yaw) has a positive x).
    expect(-Math.sin(shot.yaw)).toBeGreaterThan(0.8);
    // It stands west of the fire with room behind it, in air.
    expect(shot.x).toBeLessThan(10.5);
    expect(shot.x).toBeGreaterThan(4 + 1.2);
    expect(w.isSolid(Math.floor(shot.x), Math.floor(shot.y), Math.floor(shot.z))).toBe(false);
    for (let t = 0; t < 120; t += 7) {
      const p = shotPose(t, shot);
      expect(w.isSolid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))).toBe(false);
    }
    // The explorer (the title's lantern) waits on the floor just ahead.
    expect(shot.explorer.x).toBeGreaterThan(shot.x);
    expect(shot.explorer.y).toBe(5);
  });

  it('gives every round 3 action its own short haptic, rate-limited where it repeats', async () => {
    const { EventBus } = await import('../../src/core/events');
    const { Haptics, HAPTIC_PATTERNS } = await import('../../src/ui/haptics');
    const bus = new EventBus<import('../../src/core/events').GameEvents>();
    const calls: Array<number | readonly number[]> = [];
    let now = 0;
    const hp = new Haptics(bus, () => true, (p) => (calls.push(p), true), () => now);
    bus.emit('player:dash', { x: 0, y: 0, z: 0, iframes: 0.3 });
    bus.emit('player:sonar', { x: 0, y: 0, z: 0, radius: 26, seconds: 2 });
    bus.emit('player:placed', { item: 'torch', block: B.TORCH, x: 0, y: 0, z: 0 });
    bus.emit('quest:shard', { biome: 'amberHollows', count: 1 });
    expect(calls).toEqual([HAPTIC_PATTERNS.dash, HAPTIC_PATTERNS.sonar, HAPTIC_PATTERNS.place, HAPTIC_PATTERNS.shard]);
    bus.emit('hotbar:selected', { slot: 1, item: null });
    bus.emit('hotbar:selected', { slot: 2, item: null });
    expect(calls.length).toBe(5);
    now = 500;
    bus.emit('hotbar:selected', { slot: 3, item: null });
    expect(calls.length).toBe(6);
    // Every pattern stays short (no buzzer): under half a second in all.
    for (const p of Object.values(HAPTIC_PATTERNS)) expect(typeof p === 'number' ? p : p.reduce((a, b) => a + b, 0)).toBeLessThan(500);
    hp.dispose();
  });

  it('queues milestone cards without duplicates, keeping the newest few', async () => {
    const { enqueue } = await import('../../src/ui/hud/Milestones');
    const f = (name: string) => ({ kind: 'feat' as const, name, line: '', reward: '' });
    let q = enqueue([], f('Maker'));
    q = enqueue(q, f('Maker'));
    expect(q.length).toBe(1);
    for (const n of ['A', 'B', 'C', 'D', 'E']) q = enqueue(q, f(n));
    expect(q.map((m) => m.name)).toEqual(['B', 'C', 'D', 'E']);
  });

  it('draws every item of LOOP\'s table with its own art (no pebble fallbacks), within a 16 x 16 frame', async () => {
    const { ITEM_IDS, ITEMS } = await import('../../src/config/items');
    const { itemArt, itemTemplates } = await import('../../src/ui/itemArt');
    for (const rows of Object.values(itemTemplates())) {
      expect(rows.length).toBe(16);
      for (const r of rows) expect(r.length).toBe(16);
    }
    const legacy = (id: string) => /^rune[A-Z]/.test(id) || ITEMS[id as keyof typeof ITEMS].icon.kind === 'tablet';
    for (const id of ITEM_IDS) {
      if (legacy(id)) continue;
      const art = itemArt(id);
      expect(art, id).not.toBeNull();
      // Every glyph of the template has a colour in the palette.
      for (const row of art!.rows) for (const ch of row) if (ch !== '.') expect(art!.palette[ch], `${id} '${ch}'`).toBeDefined();
    }
  });
});

describe('round 3 UI, the second instance (map places, relief, cards)', () => {
  it('spans a stratum\'s floor heights from its finds and halls, padded by 4 m', async () => {
    const { heightRangeOf } = await import('../../src/game/fp/ActionLayer');
    const r = heightRangeOf({
      chests: [{ p: [0, 30, 0] }, { p: [0, 61, 0] }],
      pages: [{ p: [0, 44, 0] }],
      lairs: [{ centre: [0, 22, 0] }],
      gate: { centre: [0, 18.5, 0] },
      arrival: { y: 50 },
      caverns: [{ centre: [0, 70, 0] }],
    });
    expect(r).toEqual([14, 74]);
  });

  it('draws relief: higher floor lighter, a contour where the floor steps 4 m', async () => {
    const { MapRaster, CONTOUR_M } = await import('../../src/ui/hud/Minimap');
    expect(CONTOUR_M).toBe(4);
    // A 12 x 3 strip of floor rising 1 m per column (heights 40..51): contours at 43|44 and 47|48.
    const src = {
      width: 12, depth: 3, originX: 0, originZ: 0, revision: 1,
      cell: () => 2,
      biome: () => 0,
      height: (x: number) => 40 + Math.floor(x),
      biomeColors: [0x808080],
      markers: [],
      heightRange: [40, 52] as const,
      playerX: 0, playerZ: 0, yaw: 0,
    };
    const r = new MapRaster();
    r.update(src);
    const lum = (x: number) => {
      const o = (x + 1 * 12) * 4;
      return r.rgba[o] + r.rgba[o + 1] + r.rgba[o + 2];
    };
    // The middle row (z = 1) away from the rims: x 1..10. Higher is lighter, except on a contour.
    expect(lum(9)).toBeGreaterThan(lum(5));
    // Column 3 (43) meets 4 (44) to the east: a contour, darker than its neighbours of the same band.
    expect(lum(3)).toBeLessThan(lum(2));
    expect(lum(7)).toBeLessThan(lum(6));
  });

  it('has a legend row, a colour, a glyph and a name for every kind of map marker', async () => {
    const { LEGEND_ORDER } = await import('../../src/ui/screens/r3/map');
    const { MARKER_COLOR, MARKER_GLYPH } = await import('../../src/ui/hud/Minimap');
    const { GLYPH_NAMES } = await import('../../src/ui/hud/glyphs');
    const kinds = Object.keys(MARKER_COLOR);
    expect(new Set(LEGEND_ORDER)).toEqual(new Set(kinds));
    for (const k of kinds) expect(GLYPH_NAMES, k).toContain(MARKER_GLYPH[k as keyof typeof MARKER_GLYPH]);
    for (const k of ['vista', 'river', 'works', 'secret', 'place', 'ravine', 'cache']) expect(en[`m3.map.m.${k}` as keyof typeof en], k).toBeTruthy();
  });

  it('writes time played short on the title\'s Continue card', async () => {
    const { playTimeText } = await import('../../src/ui/screens/menu');
    expect(playTimeText(0)).toBe('0 min');
    expect(playTimeText(42 * 60 + 30)).toBe('42 min');
    expect(playTimeText(3 * 3600 + 5 * 60)).toBe('3 h 05');
  });

  it('lets the notice cards take turns, holds toasts under a card and keeps cards out of a fight (QA 22:10)', async () => {
    const { noticeTurns, toastTop } = await import('../../src/ui/hud/noticeGate');
    const quiet = { live: true, fight: false, bubbleUp: false, arrivalUp: false, arrivalWaiting: false, discoveryUp: false, discoveryWaiting: false, milestoneUp: false };
    // Nothing up: an arrival shows at once (a milestone card waits), and the toasts wait under it.
    expect(noticeTurns({ ...quiet, arrivalWaiting: true })).toEqual({ arrival: true, discovery: false, milestones: false, holdToasts: true });
    // A discovery already up: the arrival waits for it, so does a milestone.
    expect(noticeTurns({ ...quiet, arrivalWaiting: true, discoveryUp: true })).toMatchObject({ arrival: false, milestones: false, holdToasts: true });
    // Behind a menu nothing shows and the toasts are not held (they show over the menu)...
    expect(noticeTurns({ ...quiet, live: false, arrivalWaiting: true, discoveryWaiting: true })).toEqual({ arrival: false, discovery: false, milestones: false, holdToasts: false });
    // ...but they wait for a card screen (the trip's card: LOOP 22:47, they sat over its title).
    expect(noticeTurns({ ...quiet, live: false, cardScreen: true }).holdToasts).toBe(true);
    // A milestone card up keeps its turn: a discovery waits for it.
    expect(noticeTurns({ ...quiet, milestoneUp: true, discoveryWaiting: true })).toMatchObject({ discovery: false, milestones: true, holdToasts: true });
    // A waiting discovery goes before the next milestone card.
    expect(noticeTurns({ ...quiet, discoveryWaiting: true })).toMatchObject({ discovery: true, milestones: false, holdToasts: false });
    // A guardian fight, a tutorial bubble under the HUD: the cards wait; toasts flow under them.
    for (const busy of [{ fight: true }, { bubbleUp: true }]) expect(noticeTurns({ ...quiet, ...busy, discoveryWaiting: true })).toEqual({ arrival: false, discovery: false, milestones: false, holdToasts: false });
    // The toast column starts under the lowest of the HUD block (or the guardian's bar) and a bubble up there.
    expect(toastTop(157, 0)).toBe(167);
    expect(toastTop(236.4, 0)).toBe(246);
    expect(toastTop(157, 270)).toBe(280);
  });

  it('opens a round 3 menu rising from play, and slides along the rail', async () => {
    const { menuEnter } = await import('../../src/ui/UI');
    expect(menuEnter('none', 'map')).toBe('play');
    expect(menuEnter('inventory', 'map')).toBe('right');
    expect(menuEnter('bestiary', 'crafting')).toBe('left');
    expect(menuEnter('map', 'map')).toBeNull();
    expect(menuEnter('pause', 'settings')).toBeNull();
  });
});
