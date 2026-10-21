// U-NC1–U-NC3 (SPEC §13.1) and Explore's gestures (W1-LEAD §3): every acting touch resolves to a verb (never nothing);
// focus types need a direct hit and navigation is never a fat-finger result; the chamber fat finger needs exactly one
// candidate within 48 px; in Explore a tap acts within reach, walks to farther targets then acts, walks to floors, a
// drag looks and never acts, a hold repeat-strikes or sweeps.
import { describe, expect, it } from 'vitest';
import { Rng } from '../../../src/core/rng';
import { HIT, actsIn, fatChamber, padRect, resolve, verbOf, type NodeFrame, type NodeTouch, type RayHit, type TouchIn, type TouchPhase } from '../../../src/game/hybrid/NodeController';

const W = 390;
const V = (x: number, y: number, z: number) => ({ x, y, z });

/** A recorded drift frame: the 7-block face, the rack, an exit plate is not visible. */
function driftFrame(): NodeFrame {
  const face: Array<NodeFrame['face'][number]> = [];
  const rects = [
    [26, 330], [80, 240], [190, 240], [136, 330], [246, 330], [190, 420], [80, 420],
  ];
  rects.forEach(([x, y], col) => face.push({ col, slice: 0, rect: { x, y, w: 104, h: 100 } }));
  return {
    phase: 'drift',
    plates: [{ x: 8, y: 47, w: 374, h: 76 }, { x: 8, y: 746, w: 374, h: 64 }],
    skippable: false,
    focus: null,
    events: [],
    lantern: null,
    rack: [{ id: 'dynamite', rect: { x: 0, y: 560, w: 88, h: 88 }, ready: true }],
    strikeStreamAt: -Infinity,
    nav: [],
    focusables: [],
    strikeables: [],
    face,
    weakestCol: 3,
    hint: '',
    centre: { x: W / 2, y: 420 },
    pick: (x, y) => {
      for (const b of face) if (x >= b.rect.x && x < b.rect.x + b.rect.w && y >= b.rect.y && y < b.rect.y + b.rect.h) return { kind: 'face', col: b.col, slice: 0, point: V(x, y, 0), dist: 3 };
      return y > 520 ? { kind: 'deep', point: V(x, y, 0), dist: 2 } : { kind: 'far', point: V(x, y, -12), dist: 12 };
    },
  };
}

/** A recorded Explore frame: a vein and a lamp in reach, a chest in reach, a far chest, an exit far away, floor below. */
function exploreFrame(): NodeFrame {
  const vein = padRect({ x: 40, y: 300, w: 80, h: 80 });
  const lamp = padRect({ x: 290, y: 280, w: 70, h: 90 });
  const chest = padRect({ x: 160, y: 470, w: 90, h: 70 });
  const farChest = padRect({ x: 175, y: 330, w: 40, h: 30 });
  const exit = padRect({ x: 170, y: 200, w: 60, h: 60 });
  return {
    phase: 'explore',
    plates: [{ x: 8, y: 47, w: 374, h: 76 }, { x: 8, y: 746, w: 374, h: 64 }],
    skippable: false,
    focus: null,
    events: [],
    lantern: null,
    rack: [],
    strikeStreamAt: -Infinity,
    nav: [{ id: 'exit:0', kind: 'exit', rect: exit, dist: 11, at: V(0, 0, -11) }],
    focusables: [
      { id: 'chest:0', kind: 'chest', rect: chest, dist: 2.2, at: V(0, 0.8, -2.2) },
      { id: 'chest:far', kind: 'chest', rect: farChest, dist: 8, at: V(0, 0.8, -8) },
    ],
    strikeables: [
      { id: 'vein:0', kind: 'vein', rect: vein, dist: 2.6, at: V(-1.5, 1.4, -2) },
      { id: 'lamp:0', kind: 'lamp', rect: lamp, dist: 2.4, at: V(1.5, 1.6, -2) },
    ],
    face: [],
    weakestCol: -1,
    hint: 'vein:0',
    centre: { x: W / 2, y: 420 },
    pick: (x, y): RayHit => {
      const inside = (r: { x: number; y: number; w: number; h: number }, px = 0) => x >= r.x - px && x < r.x + r.w + px && y >= r.y - px && y < r.y + r.h + px;
      if (inside({ x: 40, y: 300, w: 80, h: 80 })) return { kind: 'tappable', id: 'vein:0', point: V(-1.5, 1.4, -2), dist: 2.6 };
      if (inside({ x: 290, y: 280, w: 70, h: 90 })) return { kind: 'lamp', id: 'lamp:0', point: V(1.5, 1.6, -2), dist: 2.4 };
      if (inside({ x: 300, y: 150, w: 60, h: 60 })) return { kind: 'tappable', id: 'gem:far', point: V(3, 3, -9), dist: 9.5 };
      if (y > 540) return { kind: 'walk', point: V((x - W / 2) / 60, 0, -(844 - y) / 40), dist: 3 + (844 - y) / 60 };
      if (y > 400) return { kind: 'deep', point: V(0, 0.5, -2), dist: 2.0 };
      return { kind: 'far', point: V(0, 3, -12), dist: 12 };
    },
  };
}

const touch = (x: number, y: number, kind: TouchIn['kind'], t = 10_000, extra: Partial<TouchIn> = {}): TouchIn => ({ x, y, kind, t, id: 1, downX: x, downY: y, ...extra });

const ACT_VERBS = new Set(['strike', 'relight', 'focus', 'navigation', 'skill', 'pulse', 'tunk', 'raise', 'walk', 'look', 'hud']);

describe('U-NC1: no touch resolves to nothing', () => {
  for (const [name, frame, kinds] of [
    ['drift', driftFrame(), ['press', 'hold', 'key']],
    ['explore', exploreFrame(), ['tap', 'hold', 'drag']],
  ] as const) {
    it(`1,000 seeded random acting touches over a recorded ${name} frame`, () => {
      const rng = new Rng(42);
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        const x = rng.next() * W;
        const y = 127 + rng.next() * (746 - 127);
        const kind = kinds[Math.floor(rng.next() * kinds.length)];
        const t = touch(x, y, kind, 10_000 + i * 50, { dx: 10, dy: 2 });
        expect(actsIn(frame.phase as TouchPhase, kind)).toBe(true);
        const r = resolve(t, frame as NodeFrame);
        expect(r).not.toBeNull();
        const v = verbOf(r as NodeTouch);
        expect(ACT_VERBS.has(v)).toBe(true);
        counts[v] = (counts[v] ?? 0) + 1;
      }
      expect(Object.keys(counts).length).toBeGreaterThanOrEqual(2);
    });
  }
  it('continuations that a phase does not answer return null, never a verb', () => {
    expect(resolve(touch(200, 400, 'tap'), driftFrame())).toBeNull();
    expect(resolve(touch(200, 400, 'drag'), driftFrame())).toBeNull();
    expect(resolve(touch(200, 400, 'press'), exploreFrame())).toBeNull();
  });
});

describe('U-NC2: focus types need a direct hit; navigation never fat-fingers', () => {
  it('a touch 1 px outside a chest’s padded area does not open it', () => {
    const f = exploreFrame();
    const c = f.focusables[0].rect;
    const r = resolve(touch(c.x - 1, c.y + c.h / 2, 'tap'), f)!;
    expect(r.verb === 'focus' && r.input === 'open').toBe(false);
    const hit = resolve(touch(c.x + 1, c.y + c.h / 2, 'tap'), f)!;
    expect(hit).toEqual({ verb: 'focus', id: 'chest:0', input: 'open' });
  });
  it('the exit is a direct hit only', () => {
    const f = exploreFrame();
    const e = f.nav[0].rect;
    const r = resolve(touch(e.x - 2, e.y - 2, 'tap'), f)!;
    expect(r.verb).not.toBe('navigation');
    expect(r.verb === 'walk' && r.then?.verb === 'navigation').toBe(false);
  });
});

describe('U-NC3: the chamber fat finger', () => {
  it('resolves only when exactly one candidate in reach lies within 48 px', () => {
    const a = { id: 'a', kind: 'vein' as const, rect: { x: 100, y: 100, w: 88, h: 88 }, dist: 2 };
    const b = { id: 'b', kind: 'gem' as const, rect: { x: 230, y: 100, w: 88, h: 88 }, dist: 2 };
    expect(fatChamber(100 - 40, 140, [a, b])?.id).toBe('a');
    expect(fatChamber(209, 140, [a, b])).toBeNull(); // within 48 px of both
    expect(fatChamber(100 - 49, 140, [a, b])).toBeNull();
    expect(fatChamber(60, 140, [{ ...a, dist: 6 }])).toBeNull(); // out of reach
    expect(HIT.fatChamberPx).toBe(48);
  });
});

describe('Dig (the drift face): the press strikes at once', () => {
  it('a press on a block strikes it; between blocks the fat finger takes the nearest', () => {
    const f = driftFrame();
    expect(resolve(touch(80, 380, 'press'), f)).toMatchObject({ verb: 'strike', target: { kind: 'face', col: 0 }, via: 'ray' });
    expect(resolve(touch(380, 600, "press"), f)).toMatchObject({ verb: "strike", target: { kind: "face" }, via: "fat" });
  });
  it('the rack is a direct hit, ignored right after a strike stream', () => {
    const f = driftFrame();
    expect(resolve(touch(40, 600, 'press'), f)).toEqual({ verb: 'skill', id: 'dynamite' });
    const g = { ...f, strikeStreamAt: 9_950 };
    expect(resolve(touch(40, 600, 'press', 10_000), g)?.verb).toBe('strike');
  });
  it('a hold strikes the block under the thumb, else the weakest', () => {
    const f = driftFrame();
    expect(resolve(touch(150, 380, 'hold'), f)).toMatchObject({ verb: 'strike', target: { col: 3 }, via: 'hold' });
    expect(resolve(touch(20, 200, 'hold'), f)).toMatchObject({ verb: 'strike', target: { col: 3, slice: 0 }, via: 'hold' });
  });
  it('a press on a plate is the HUD’s; a press during a long move skips it', () => {
    const f = driftFrame();
    expect(resolve(touch(100, 60, 'press'), f)).toEqual({ verb: 'hud', index: 0 });
    expect(resolve(touch(200, 400, 'press'), { ...f, skippable: true })).toEqual({ verb: 'navigation', nav: 'skip', id: '' });
  });
});

describe('Explore (W1-LEAD §3)', () => {
  it('a tappable within 3.5 m acts at once', () => {
    const f = exploreFrame();
    expect(resolve(touch(80, 340, 'tap'), f)).toMatchObject({ verb: 'strike', target: { kind: 'tappable', id: 'vein:0' } });
    expect(resolve(touch(320, 320, 'tap'), f)).toMatchObject({ verb: 'relight', lampId: 'lamp:0' });
  });
  it('a farther tappable is walked to, then acted on', () => {
    const f = exploreFrame();
    const r = resolve(touch(330, 180, 'tap'), f)!;
    expect(r).toMatchObject({ verb: 'walk', via: 'approach', then: { verb: 'strike', target: { id: 'gem:far' } } });
  });
  it('a far chest is walked to, then opened; a near one opens at once', () => {
    const f = exploreFrame();
    const far = f.focusables[1].rect;
    expect(resolve(touch(far.x + far.w / 2, far.y + far.h / 2, 'tap'), f)).toMatchObject({ verb: 'walk', via: 'approach', then: { verb: 'focus', id: 'chest:far', input: 'open' } });
    const near = f.focusables[0].rect;
    expect(resolve(touch(near.x + 10, near.y + 10, 'tap'), f)).toEqual({ verb: 'focus', id: 'chest:0', input: 'open' });
  });
  it('a far tappable is walked to by its padded hit area even when the ray misses its small mesh (the nearest centre wins)', () => {
    const f = exploreFrame();
    const vein = padRect({ x: 20, y: 440, w: 30, h: 30 });
    const lamp = padRect({ x: 60, y: 470, w: 20, h: 30 });
    const g: NodeFrame = { ...f, far: [{ id: 'vein:far', kind: 'vein', rect: vein, dist: 6.3, at: V(-3, 1, -6) }, { id: 'lamp:far', kind: 'lamp', rect: lamp, dist: 9, at: V(-2, 2, -9) }] };
    // The ray under (25, 445) hits rock in reach (deep): the vein's padded area still takes the tap.
    expect(g.pick(25, 445).kind).toBe('deep');
    expect(resolve(touch(25, 445, 'tap'), g)).toMatchObject({ verb: 'walk', via: 'approach', to: V(-3, 1, -6), then: { verb: 'strike', target: { kind: 'tappable', id: 'vein:far' } } });
    expect(resolve(touch(72, 488, 'tap'), g)).toMatchObject({ verb: 'walk', then: { verb: 'relight', lampId: 'lamp:far' } });
    // Outside every padded area: the old answers (a tunk on rock in reach).
    expect(resolve(touch(250, 450, 'tap'), g)?.verb).toBe('tunk');
  });
  it('a far exit is walked to, then taken', () => {
    const f = exploreFrame();
    const e = f.nav[0].rect;
    expect(resolve(touch(e.x + e.w / 2, e.y + e.h / 2, 'tap'), f)).toMatchObject({ verb: 'walk', then: { verb: 'navigation', nav: 'exit', id: 'exit:0' } });
  });
  it('a floor tap walks there', () => {
    const f = exploreFrame();
    expect(resolve(touch(300, 700, 'tap'), f)).toMatchObject({ verb: 'walk', via: 'floor' });
  });
  it('far rock or the dark raises the lantern; rock in reach tunks', () => {
    const f = exploreFrame();
    expect(resolve(touch(250, 150, 'tap'), f)?.verb).toBe('raise');
    expect(resolve(touch(330, 450, 'tap'), f)?.verb).toBe('tunk');
  });
  it('a drag looks and never acts, wherever it is', () => {
    const f = exploreFrame();
    for (const [x, y] of [[80, 340], [200, 500], [320, 320], [200, 700]]) expect(resolve(touch(x, y, 'drag', 0, { dx: 14, dy: -3 }), f)).toEqual({ verb: 'look', dx: 14, dy: -3 });
  });
  it('a hold on a strike tappable repeat-strikes it; elsewhere it sweeps the ones in reach', () => {
    const f = exploreFrame();
    expect(resolve(touch(80, 340, 'hold'), f)).toMatchObject({ verb: 'strike', target: { id: 'vein:0' }, via: 'hold' });
    const sweep = resolve(touch(200, 700, 'hold'), f)!;
    expect(['strike', 'relight']).toContain(sweep.verb);
    expect(JSON.stringify(sweep)).toMatch(/sweep/);
  });
  it('a hold never sweeps when it started on a chest or an exit', () => {
    const f = exploreFrame();
    const c = f.focusables[0].rect;
    expect(resolve(touch(c.x + 5, c.y + 5, 'hold'), f)?.verb).toBe('tunk');
  });
});

describe('Ride: a press on a passing glint mines it', () => {
  it('glint in reach → strike; elsewhere → raise (never nothing)', () => {
    const f: NodeFrame = {
      ...exploreFrame(),
      phase: 'ride',
      strikeables: [{ id: 'glint:0', kind: 'vein', rect: padRect({ x: 50, y: 300, w: 60, h: 60 }), dist: 2.5 }],
      pick: (x, y) => (x < 120 && y > 290 && y < 380 ? { kind: 'tappable', id: 'glint:0', point: V(0, 0, 0), dist: 2.5 } : { kind: 'far', point: V(0, 0, -12), dist: 12 }),
    };
    expect(resolve(touch(80, 330, 'press'), f)).toMatchObject({ verb: 'strike', target: { id: 'glint:0' } });
    expect(resolve(touch(300, 200, 'press'), f)?.verb).toBe('raise');
    expect(resolve(touch(300, 200, 'drag'), f)).toBeNull();
  });
});
