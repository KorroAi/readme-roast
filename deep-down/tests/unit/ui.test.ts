import { describe, expect, it } from 'vitest';
import { RECIPES } from '../../src/config/recipes';
import { TILE } from '../../src/config/tiles';
import { t } from '../../src/i18n';
import { generateTiles } from '../../src/render/textures';
import { depthText, formatRelativeTime } from '../../src/ui/format';
import { HEART_COUNT, healthHalves, heartFill } from '../../src/ui/hud/hearts';
import { GLYPH_H, hasGlyph, layoutPixelText } from '../../src/ui/pixelFont';
import { craftState, equipInfo } from '../../src/ui/screens/inventory';
import { cubeIcon, heartSprite, scaleNearest, sprite, type Raster } from '../../src/ui/sprites';
import {
  advanceLookPhase,
  clampBase,
  HOLD_SLOP_PX,
  HOLD_TO_MINE_MS,
  JOYSTICK_DEAD_ZONE,
  JOYSTICK_RADIUS,
  joystick,
  releaseLook,
  toNdc,
  touchSide,
  type LookPhase,
  type StickOutput,
} from '../../src/ui/touchMath';

const stick = (): StickOutput => ({ x: 0, y: 0, knobX: 0, knobY: 0 });

describe('pixel font', () => {
  it('has a glyph for every character of the title and the alphabet', () => {
    for (const text of ['DEEP DOWN', t('game.title'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']) {
      for (const ch of text) expect(hasGlyph(ch), `glyph for "${ch}"`).toBe(true);
      expect(layoutPixelText(text).missing).toEqual([]);
    }
  });

  it('lays out DEEP DOWN on a 51 x 7 cell grid with one column between glyphs', () => {
    const l = layoutPixelText('DEEP DOWN');
    // 8 letters x 5 + a 3-wide space + 8 gaps.
    expect(l.width).toBe(51);
    expect(l.height).toBe(GLYPH_H);
    for (const c of l.cells) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.x).toBeLessThan(l.width);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeLessThan(GLYPH_H);
    }
  });

  it('marks only the O as crystal when asked, and is case-insensitive', () => {
    const plain = layoutPixelText('deep down');
    expect(plain.cells.some((c) => c.crystal)).toBe(false);
    const title = layoutPixelText('DEEP DOWN', { crystalO: true });
    const crystal = title.cells.filter((c) => c.crystal);
    expect(crystal.length).toBeGreaterThan(10);
    // The O is the 7th glyph: "DEEP" spans 0..22, the space 24..26, "D" 28..32, "O" 34..38.
    for (const c of crystal) {
      expect(c.x).toBeGreaterThanOrEqual(34);
      expect(c.x).toBeLessThanOrEqual(38);
    }
  });

  it('reports characters it cannot draw instead of failing', () => {
    expect(layoutPixelText('A~B').missing).toEqual(['~']);
  });
});

describe('relative time', () => {
  const now = 1_700_000_000_000;
  const min = 60_000;
  it('formats past timestamps in words', () => {
    expect(formatRelativeTime(now, now)).toBe('just now');
    expect(formatRelativeTime(now - 59_000, now)).toBe('just now');
    expect(formatRelativeTime(now - min, now)).toBe('1 minute ago');
    expect(formatRelativeTime(now - 7 * min, now)).toBe('7 minutes ago');
    expect(formatRelativeTime(now - 60 * min, now)).toBe('1 hour ago');
    expect(formatRelativeTime(now - 5 * 60 * min, now)).toBe('5 hours ago');
    expect(formatRelativeTime(now - 24 * 60 * min, now)).toBe('yesterday');
    expect(formatRelativeTime(now - 3 * 24 * 60 * min, now)).toBe('3 days ago');
  });
  it('treats clock skew (future saves) as just now', () => {
    expect(formatRelativeTime(now + 10 * min, now)).toBe('just now');
  });
  it('fills the menu line', () => {
    expect(t('menu.saveFound', { time: formatRelativeTime(now - 2 * min, now) })).toBe('Last saved 2 minutes ago');
  });
});

describe('depth readout', () => {
  it('reads "-N m" with an ASCII minus', () => {
    expect(depthText(128)).toBe('-128 m');
    expect(depthText(12.6)).toBe('-13 m');
    expect(depthText(128)).toMatch(/-\d+ m/);
  });
});

describe('joystick', () => {
  it('is zero at rest and inside the dead zone', () => {
    expect(joystick(0, 0, stick())).toMatchObject({ x: 0, y: 0, knobX: 0, knobY: 0 });
    const r = JOYSTICK_RADIUS * JOYSTICK_DEAD_ZONE * 0.9;
    expect(joystick(r, 0, stick())).toMatchObject({ x: 0, y: 0 });
  });

  it('maps screen up to forward and right to right', () => {
    const up = joystick(0, -JOYSTICK_RADIUS, stick());
    expect(up.y).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0);
    const right = joystick(JOYSTICK_RADIUS, 0, stick());
    expect(right.x).toBeCloseTo(1);
    expect(right.y).toBeCloseTo(0);
  });

  it('clamps the knob to the radius and keeps the direction beyond it', () => {
    const o = joystick(300, -400, stick());
    expect(Math.hypot(o.knobX, o.knobY)).toBeCloseTo(JOYSTICK_RADIUS);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(1);
    expect(o.x / o.y).toBeCloseTo(300 / 400);
  });

  it('ramps continuously and monotonically from the dead-zone edge', () => {
    const edge = JOYSTICK_RADIUS * JOYSTICK_DEAD_ZONE;
    expect(joystick(edge + 0.01, 0, stick()).x).toBeLessThan(0.01);
    let prev = 0;
    for (let d = 0; d <= JOYSTICK_RADIUS * 1.5; d += 1) {
      const v = Math.hypot(joystick(d * 0.6, d * 0.8, stick()).x, joystick(d * 0.6, d * 0.8, stick()).y);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(v).toBeLessThanOrEqual(1 + 1e-9);
      prev = v;
    }
    expect(prev).toBeCloseTo(1);
  });

  it('keeps the floating base on screen', () => {
    expect(clampBase(5, 5, 800, 400)).toEqual([JOYSTICK_RADIUS + 8, JOYSTICK_RADIUS + 8]);
    expect(clampBase(400, 200, 800, 400)).toEqual([400, 200]);
    expect(clampBase(799, 399, 800, 400)).toEqual([800 - JOYSTICK_RADIUS - 8, 400 - JOYSTICK_RADIUS - 8]);
  });
});

describe('touch geometry', () => {
  it('converts screen points to NDC', () => {
    const o = { x: 0, y: 0 };
    expect(toNdc(0, 0, 800, 400, o)).toEqual({ x: -1, y: 1 });
    expect(toNdc(800, 400, 800, 400, o)).toEqual({ x: 1, y: -1 });
    expect(toNdc(400, 200, 800, 400, o)).toEqual({ x: 0, y: 0 });
    expect(toNdc(600, 100, 800, 400, o)).toEqual({ x: 0.5, y: 0.5 });
    expect(toNdc(-50, 900, 800, 400, o)).toEqual({ x: -1, y: -1 });
  });

  it('splits the screen into move and look halves, swapped when left-handed', () => {
    expect(touchSide(100, 900, false)).toBe('move');
    expect(touchSide(800, 900, false)).toBe('look');
    expect(touchSide(450, 900, false)).toBe('look');
    expect(touchSide(100, 900, true)).toBe('look');
    expect(touchSide(800, 900, true)).toBe('move');
  });
});

describe('hold-to-mine state machine', () => {
  /** Replay a touch: moves as [ms, dx, dy], the hold timer at HOLD_TO_MINE_MS, then release. */
  function replay(moves: Array<[number, number, number]>, releaseAt: number) {
    let phase: LookPhase = 'pending';
    const events = [...moves.map(([at, dx, dy]) => ({ at, dx, dy })), { at: HOLD_TO_MINE_MS, dx: NaN, dy: NaN }].sort((a, b) => a.at - b.at);
    let last = { dx: 0, dy: 0 };
    for (const e of events) {
      if (e.at > releaseAt) break;
      if (Number.isNaN(e.dx)) phase = advanceLookPhase(phase, last.dx, last.dy, e.at);
      else {
        phase = advanceLookPhase(phase, e.dx, e.dy, e.at);
        last = e;
      }
    }
    return { phase, release: releaseLook(phase) };
  }

  it('stays pending while still and short', () => {
    expect(advanceLookPhase('pending', 3, 4, HOLD_TO_MINE_MS - 1)).toBe('pending');
  });

  it('becomes a camera drag when it moves beyond the slop first', () => {
    expect(advanceLookPhase('pending', HOLD_SLOP_PX + 1, 0, 50)).toBe('look');
    expect(replay([[30, 4, 0], [60, 20, 0], [400, 21, 0]], 500)).toEqual({ phase: 'look', release: 'none' });
  });

  it('becomes a mine touch after holding still for the hold time', () => {
    expect(advanceLookPhase('pending', 0, 0, HOLD_TO_MINE_MS)).toBe('mine');
    expect(replay([[50, 2, 2]], 800)).toEqual({ phase: 'mine', release: 'endMine' });
  });

  it('never turns a mine touch into a look, nor a look into mining', () => {
    expect(advanceLookPhase('mine', 300, 300, 2000)).toBe('mine');
    expect(advanceLookPhase('look', 0, 0, 2000)).toBe('look');
    // Moving a lot after the hold re-aims instead of rotating the camera.
    expect(replay([[HOLD_TO_MINE_MS + 60, 80, -40], [HOLD_TO_MINE_MS + 120, 160, -60]], 900)).toEqual({ phase: 'mine', release: 'endMine' });
  });

  it('treats a quick still tap as a single mining hit', () => {
    expect(replay([[40, 1, 1]], 90)).toEqual({ phase: 'pending', release: 'tapMine' });
  });
});

describe('hearts', () => {
  it('converts health to half hearts', () => {
    expect(healthHalves(100, 100)).toBe(10);
    expect(healthHalves(0, 100)).toBe(0);
    expect(healthHalves(-5, 100)).toBe(0);
    expect(healthHalves(50, 100)).toBe(5);
    expect(healthHalves(70, 100)).toBe(7);
  });

  it('shows at least half a heart while alive and all hearts only at full health', () => {
    expect(healthHalves(0.4, 100)).toBe(1);
    expect(healthHalves(99, 100)).toBe(9);
    expect(healthHalves(10, 0)).toBe(0);
  });

  it('fills hearts left to right with a half heart for odd totals', () => {
    const row = (halves: number) => Array.from({ length: HEART_COUNT }, (_, i) => heartFill(halves, i));
    expect(row(10)).toEqual([2, 2, 2, 2, 2]);
    expect(row(7)).toEqual([2, 2, 2, 1, 0]);
    expect(row(1)).toEqual([1, 0, 0, 0, 0]);
    expect(row(0)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('icon rasters', () => {
  const avg = (r: Raster, pick: (x: number, y: number) => boolean) => {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < r.size; y++)
      for (let x = 0; x < r.size; x++) {
        const i = (x + y * r.size) * 4;
        if (r.data[i + 3] === 255 && pick(x, y)) {
          sum += r.data[i] + r.data[i + 1] + r.data[i + 2];
          n++;
        }
      }
    return n ? sum / n : 0;
  };

  it('draws an isometric cube with a lit top and a darker right side', () => {
    const atlas = generateTiles();
    const r = cubeIcon(atlas, TILE.copperOre, TILE.copperOre, 64);
    let opaque = 0;
    for (let i = 3; i < r.data.length; i += 4) if (r.data[i] > 0) opaque++;
    expect(opaque / (64 * 64)).toBeGreaterThan(0.6);
    const top = avg(r, (x, y) => y < 16 && x > 24 && x < 40);
    const right = avg(r, (x, y) => y > 40 && y < 56 && x > 40 && x < 56);
    expect(top).toBeGreaterThan(right * 1.3);
    // Corners stay transparent: it is a hexagon silhouette, not a square.
    expect(r.data[3]).toBe(0);
    expect(r.data[(63 + 63 * 64) * 4 + 3]).toBe(0);
  });

  it('builds sprites from ASCII rows and scales them crisply', () => {
    const s = sprite(['ab', 'ba'], { a: 0xff0000, b: 0x0000ff });
    expect(s.size).toBe(2);
    const big = scaleNearest(s, 8);
    // Top-left 4x4 block is pure red, top-right pure blue: no blending between texels.
    expect([...big.data.slice(0, 4)]).toEqual([255, 0, 0, 255]);
    expect([...big.data.slice((3 + 0 * 8) * 4, (3 + 0 * 8) * 4 + 4)]).toEqual([255, 0, 0, 255]);
    expect([...big.data.slice((4 + 0 * 8) * 4, (4 + 0 * 8) * 4 + 4)]).toEqual([0, 0, 255, 255]);
  });

  it('draws full, half and empty hearts', () => {
    const red = (r: Raster) => avg(r, (x) => x < 5);
    const redRight = (r: Raster) => avg(r, (x) => x > 6);
    expect(red(heartSprite(2))).toBeGreaterThan(red(heartSprite(0)));
    expect(red(heartSprite(1))).toBeCloseTo(red(heartSprite(2)), 0);
    expect(redRight(heartSprite(1))).toBeLessThan(redRight(heartSprite(2)));
  });
});

describe('workbench rules shown in the UI', () => {
  const inv = { available: { stone: 20, copperOre: 9 }, equipment: { pickaxe: 1, lantern: 1, pack: 2 }, atCamp: true };
  it('matches the gameplay precedence: owned > not at camp > missing', () => {
    expect(craftState(RECIPES.copperPickaxe, inv)).toBe('ready');
    expect(craftState(RECIPES.sturdyPack, inv)).toBe('owned');
    expect(craftState(RECIPES.copperLantern, inv)).toBe('missing');
    expect(craftState(RECIPES.copperPickaxe, { ...inv, atCamp: false })).toBe('notAtCamp');
    expect(craftState(RECIPES.sturdyPack, { ...inv, atCamp: false })).toBe('owned');
  });

  it('describes equipment stats from the balance tables', () => {
    expect(equipInfo('pickaxe', 1).stats[0][1]).toBe('100%');
    expect(equipInfo('pickaxe', 2).stats[0][1]).toBe('160%');
    expect(equipInfo('lantern', 2).stats.map((s) => s[1])).toEqual(['14.5 m', '10 min']);
    expect(equipInfo('pack', 2).stats[0][1]).toBe('8');
  });
});
