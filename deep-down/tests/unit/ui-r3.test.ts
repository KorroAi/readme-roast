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
import { mapToCanvas } from '../../src/ui/screens/r3/map';
import { sanitizeControlPrefs, DEFAULT_CONTROL_PREFS } from '../../src/ui/controlPrefs';
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

  it('maps a stratum onto the square map canvas', () => {
    const v = { originX: 0, originZ: 0, width: 256, depth: 256 };
    expect(mapToCanvas(v, 128, 64, 512)).toEqual([256, 128]);
    expect(mapToCanvas({ ...v, width: 128 }, 128, 256, 512)).toEqual([256, 512]);
  });

  it('keeps the control preferences in range', () => {
    expect(sanitizeControlPrefs(null)).toEqual(DEFAULT_CONTROL_PREFS);
    expect(sanitizeControlPrefs({ scale: 9, opacity: -1 })).toEqual({ scale: 1.3, opacity: 0.35 });
    expect(sanitizeControlPrefs({ scale: 'x', opacity: Number.NaN })).toEqual(DEFAULT_CONTROL_PREFS);
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
