import { describe, expect, it } from 'vitest';
import { ITEM_IDS } from '../../src/config/items';
import { evaluate, type CraftContext } from '../../src/gameplay/Crafting';
import { Equipment } from '../../src/gameplay/Equipment';
import { Backpack } from '../../src/gameplay/Inventory';
import { CampStorage } from '../../src/gameplay/Storage';
import { t } from '../../src/i18n';
import { depthText, formatRelativeTime } from '../../src/ui/format';
import { HEART_COUNT, healthHalves, heartFill } from '../../src/ui/hud/hearts';
import { hasLintelGlyph, layoutLintel, LINTEL_H, LINTEL_REQUIRED, LINTEL_SPACE } from '../../src/ui/brand/strokeFont';
import { lanternPosition, wordmarkLayout } from '../../src/ui/brand/wordmark';
import { equipInfo } from '../../src/ui/screens/inventory';
import { nodeLook } from '../../src/ui/screens/progress';
import { heartSprite, itemRaster, scaleNearest, SPECIMENS, sprite, type Raster } from '../../src/ui/sprites';
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

describe('Lintel face (title and display type)', () => {
  it('has a glyph for every character of the title, the alphabet, the digits and the marks', () => {
    for (const text of ['DEEP DOWN', t('game.title'), t('game.tagline'), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', LINTEL_REQUIRED]) {
      for (const ch of text) expect(hasLintelGlyph(ch), `glyph for "${ch}"`).toBe(true);
      expect(layoutLintel(text).missing).toEqual([]);
    }
  });

  it('lays out DEEP DOWN on the 4 x 7 grid: 4-unit letters, a 5-unit W, 1-unit gaps', () => {
    const l = layoutLintel('DEEP DOWN');
    // DEEP = 4 letters x 4 + 3 gaps; the space is 2 with a gap each side; DOWN = 4 + 4 + 5 + 4 + 3 gaps.
    expect(layoutLintel('DEEP').width).toBe(19);
    expect(layoutLintel('DOWN').width).toBe(20);
    expect(LINTEL_SPACE).toBe(2);
    expect(l.width).toBe(19 + 1 + LINTEL_SPACE + 1 + 20);
    expect(l.height).toBe(LINTEL_H);
    for (const g of l.glyphs)
      for (const p of g.glyph.polygons)
        for (const [x, y] of p) {
          expect(x).toBeGreaterThanOrEqual(-1e-9);
          expect(x).toBeLessThanOrEqual(g.glyph.width + 1e-9);
          expect(y).toBeGreaterThanOrEqual(-1e-9);
          expect(y).toBeLessThanOrEqual(LINTEL_H + 1e-9);
        }
  });

  it('puts the lantern-rune O second in DOWN, hanging from its lintel, in both lockups', () => {
    for (const lockup of ['line', 'stack'] as const) {
      const L = wordmarkLayout(lockup);
      const pos = lanternPosition(lockup);
      expect(pos.wordIndex).toBe(1);
      expect(L.words[1].word).toBe('DOWN');
      const down = L.words[1];
      // Between the D and the W: the D ends before the lantern cell, the W starts after it.
      const [d, w] = down.letters.glyphs;
      expect(d.ch).toBe('D');
      expect(w.ch).toBe('W');
      expect(pos.x).toBeGreaterThan(down.x + d.x + d.glyph.width);
      expect(pos.x).toBeLessThan(down.x + w.x);
      // It hangs from the lintel (above the letters) and its ring centre sits within the letter band.
      expect(down.lantern!.hangY).toBeLessThan(down.y);
      expect(pos.y).toBeGreaterThan(down.y + 1);
      expect(pos.y).toBeLessThan(down.y + LINTEL_H - 1);
    }
    expect(lanternPosition('line').x).toBeGreaterThan(wordmarkLayout('line').words[0].x + wordmarkLayout('line').words[0].width);
  });

  it('reports characters it cannot draw instead of failing', () => {
    expect(layoutLintel('A~B').missing).toEqual(['~']);
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

  it('splits the screen into the move third and the look area, swapped when left-handed', () => {
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

  it('draws every item as a specimen sprite, with a fallback for ids without art', () => {
    const seen = new Set<string>();
    for (const id of ITEM_IDS) {
      const r = itemRaster(id, 32);
      expect(r.size).toBe(32);
      let opaque = 0;
      for (let i = 3; i < r.data.length; i += 4) if (r.data[i] > 0) opaque++;
      // A shape, not a filled square and not empty.
      expect(opaque / (32 * 32), id).toBeGreaterThan(0.15);
      expect(opaque / (32 * 32), id).toBeLessThan(0.92);
      expect(r.data[3], `${id} corner`).toBe(0);
      seen.add(Array.from(r.data).join(','));
    }
    // Materials each have their own art (the seven runes share the rune stone).
    expect(seen.size).toBeGreaterThanOrEqual(8);
    const unknown = itemRaster('tinOre', 16);
    expect(unknown.data.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
    for (const def of Object.values(SPECIMENS)) for (const row of def.rows) expect(row.length).toBe(16);
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
  const context = (o: { tiers?: Partial<Record<'pickaxe' | 'lantern' | 'pack', number>>; stone?: number; copper?: number; atCamp?: boolean; built?: string[] }): CraftContext => {
    const storage = new CampStorage();
    if (o.stone) storage.add('stone', o.stone);
    if (o.copper) storage.add('copperOre', o.copper);
    return { backpack: new Backpack(6), storage, equipment: new Equipment(o.tiers), built: new Set(o.built ?? []), atCamp: o.atCamp ?? true, rift: false, rune: false };
  };
  // The tree draws what the rules decide (gameplay/Crafting.evaluate), so the precedence the
  // W1 list had (owned first, then where you stand, then materials) holds on the screen too.
  const look = (id: Parameters<typeof evaluate>[0], c: CraftContext) => {
    const r = evaluate(id, c);
    return nodeLook({ state: r.reason, partial: false });
  };
  it('matches the gameplay precedence: owned > locked > not at camp > missing', () => {
    const inv = { stone: 20, copper: 9, tiers: { pickaxe: 1, lantern: 1, pack: 2 } };
    expect(look('copperPickaxe', context(inv))).toBe('craftable');
    expect(look('sturdyPack', context(inv))).toBe('owned');
    expect(look('copperLantern', context(inv))).toBe('short');
    expect(look('copperPickaxe', context({ ...inv, atCamp: false }))).toBe('away');
    expect(look('sturdyPack', context({ ...inv, atCamp: false }))).toBe('owned');
    // Owned wins over everything; a missing prerequisite wins over missing materials and place.
    expect(look('copperPickaxe', context({ tiers: { pickaxe: 2 }, atCamp: false }))).toBe('owned');
    expect(look('ironPickaxe', context({ atCamp: false }))).toBe('locked');
    expect(look('ironPickaxe', context({ tiers: { pickaxe: 2 }, built: ['forge'] }))).toBe('short');
  });

  it('maps every rule outcome to one look', () => {
    expect(nodeLook({ state: 'missing', partial: true })).toBe('partial');
    expect(nodeLook({ state: 'carryToSite', partial: true })).toBe('carry');
    expect(nodeLook({ state: 'owned', partial: true })).toBe('owned');
    expect(nodeLook({ state: 'locked', partial: true })).toBe('locked');
  });

  it('describes equipment stats from the balance tables', () => {
    expect(equipInfo('pickaxe', 1).stats[0][1]).toBe('100%');
    expect(equipInfo('pickaxe', 2).stats[0][1]).toBe('160%');
    expect(equipInfo('lantern', 2).stats.map((s) => s[1])).toEqual(['14.5 m', '10 min']);
    expect(equipInfo('pack', 2).stats[0][1]).toBe('8');
  });
});
