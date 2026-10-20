// Every touch → one action (SPEC §2.3–§2.4). Pure: the frame snapshot carries the screen rects of what is on screen and
// the camera ray (`pick`), and `resolve` walks the hit-test order:
//   1 HUD plates · 2 an open focus pop · 3 event objects [W2] · 4 the lantern (deliberate gesture) [W2] · 5 the rack ·
//   6 navigation targets · 7 focus-type tappables · 8 the camera ray · 9 the fat finger · 10 Lantern Raise.
// Every touch ends in one of: strike, relight, focus, navigation, skill, pulse, tunk, raise (L2: there is no "nothing").
// Target sizes: hit areas are padded to ≥ 88 × 88 px; a fat finger never opens a chest or moves you (U-NC2) and in a
// chamber resolves only when exactly one candidate lies within 48 px (U-NC3).

import type { V3 } from './ropeRide';

/** A screen rectangle in CSS px (x, y = top left). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The input kinds TapSurface queues: a press, a hold-stream hit, a release (with how long it was down), a key. */
export type TouchKind = 'tap' | 'hold' | 'up' | 'key';

export interface TouchIn {
  x: number;
  y: number;
  kind: TouchKind;
  /** performance.now() ms of the event. */
  t: number;
  /** The pointer id. */
  id: number;
  /** For 'up': ms the pointer was down; for 'hold': ms since it went down. */
  heldMs?: number;
  /** Where the pointer went down (holds and releases). */
  downX?: number;
  downY?: number;
}

/** What the camera ray found under a point (DepthScene.pick, mapped by the shell). */
export type RayHit =
  /** A face block: the model column (snake map) and the slice (0 = the front). */
  | { kind: 'face'; col: number; slice: number; point: V3 }
  /** A strike-type tappable in reach (vein, gem cluster, geode shell, stash brick). */
  | { kind: 'tappable'; id: string; point: V3 }
  /** A cold Halden lamp in reach. A lit one answers as deep rock. */
  | { kind: 'lamp'; id: string; point: V3 }
  /** A wall-skin cell in reach. */
  | { kind: 'skin'; id: string; point: V3 }
  /** Rock in reach that is not skin (or skin already broken): the tunk. */
  | { kind: 'deep'; point: V3 }
  /** Nothing in reach: far rock, the dark, open air (the point is where the ray lands or 12 m out). */
  | { kind: 'far'; point: V3 };

export type NavKind = 'exit' | 'ring' | 'arrow';
export type FocusKind = 'chest' | 'relic' | 'note' | 'keystone' | 'depot' | 'mural' | 'royal';
export type StrikeKind = 'vein' | 'gem' | 'geode' | 'stash' | 'skin' | 'lamp';

/** The screen at the moment of a touch. Rects are hit areas (already padded to ≥ 88 px where §2.3 says so). */
export interface NodeFrame {
  phase: 'drift' | 'chamber' | 'ride' | 'seal' | 'reveal';
  /** HUD plates (the DOM eats these touches; listed so the order is complete and testable). */
  plates: readonly Rect[];
  /** A camera move or ceremony longer than 1 s is running: any tap skips it and is consumed. */
  skippable: boolean;
  /** The open focus pop: its object's hit rect, whether it is resolved. */
  focus: { id: string; kind: FocusKind; rect: Rect; resolved: boolean } | null;
  /** Event objects [W2]: padded hit rects. */
  events: ReadonlyArray<{ id: string; rect: Rect }>;
  /** The lantern viewmodel [W2: the Pulse]: its 110 × 150 bound (mirrored for left hand) and the gesture state. */
  lantern: { rect: Rect; full: boolean; lastWorldUpAt: number; holding: boolean } | null;
  /** Tools on the rack (a drift's lower-left nook): direct hits only. */
  rack: ReadonlyArray<{ id: string; rect: Rect; ready: boolean }>;
  /** When the current strike stream (a hold or a tap burst) started outside the rack (ms; −∞ when none). */
  strikeStreamAt: number;
  /** Navigation targets: exits and their plates, survey rings, chalk arrows (hit rects ≥ 88 px). */
  nav: ReadonlyArray<{ id: string; kind: NavKind; rect: Rect }>;
  /** Focus-type tappables in view (padded hit rects). */
  focusables: ReadonlyArray<{ id: string; kind: FocusKind; rect: Rect }>;
  /** Strike-type tappables and cold lamps in reach (padded hit rects, for the fat finger and the sweep). */
  strikeables: ReadonlyArray<{ id: string; kind: StrikeKind; rect: Rect }>;
  /** Live face blocks (drift): the model column, the slice, the screen rect. */
  face: ReadonlyArray<{ col: number; slice: number; rect: Rect }>;
  /** The face's weakest live block in the front slice (the hold's fallback); −1 when none. */
  weakestCol: number;
  /** The nearest unharvested tappable to hint after a tunk ('' when none). */
  hint: string;
  /** The world region's centre (the sweep orders by distance to it). */
  centre: { x: number; y: number };
  /** The camera ray under a point. */
  pick(x: number, y: number): RayHit;
}

/** The eight verbs (U-NC1) plus 'hud' (a plate: the DOM's, never the world's). */
export type Verb = 'strike' | 'relight' | 'focus' | 'navigation' | 'skill' | 'pulse' | 'tunk' | 'raise' | 'hud';

export type StrikeTarget = { kind: 'face'; col: number; slice: number } | { kind: 'tappable'; id: string } | { kind: 'skin'; id: string };

export type NodeTouch =
  | { verb: 'strike'; target: StrikeTarget; via: 'direct' | 'ray' | 'fat' | 'hold' | 'sweep'; point?: V3 }
  | { verb: 'relight'; lampId: string; via: 'ray' | 'fat' | 'sweep' }
  | { verb: 'focus'; id: string; input: 'open' | 'tap' | 'hold' | 'release' | 'close' }
  | { verb: 'navigation'; nav: NavKind | 'skip'; id: string }
  | { verb: 'skill'; id: string }
  | { verb: 'pulse' }
  | { verb: 'tunk'; point: V3 | null; hint: string }
  | { verb: 'raise'; point: V3 }
  | { verb: 'hud'; index: number };

/** §2.3's numbers. */
export const HIT = {
  minPad: 88,
  fatChamberPx: 48,
  /** The Pulse needs this long since the last world pointer ended (ms). */
  pulseQuietMs: 300,
  /** The rack ignores a touch this soon after a strike stream that began outside it (ms). */
  rackQuietMs: 150,
  /** A drifting hold re-aims past this (px). */
  reaimPx: 24,
} as const;

export function inRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Pad a drawn rect symmetrically to at least `min` × `min` (the hit area). */
export function padRect(r: Rect, min: number = HIT.minPad): Rect {
  const w = Math.max(r.w, min);
  const h = Math.max(r.h, min);
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/** Distance from a point to a rect's edge (0 inside). */
export function rectDistance(x: number, y: number, r: Rect): number {
  const dx = Math.max(r.x - x, 0, x - (r.x + r.w));
  const dy = Math.max(r.y - y, 0, y - (r.y + r.h));
  return Math.hypot(dx, dy);
}

const centreDist = (x: number, y: number, r: Rect) => Math.hypot(x - (r.x + r.w / 2), y - (r.y + r.h / 2));

/** The nearest live face block in screen space (front slice first on a tie). */
export function nearestFace(x: number, y: number, face: NodeFrame['face']): { col: number; slice: number } | null {
  let best: { col: number; slice: number } | null = null;
  let bd = Infinity;
  for (const b of face) {
    const d = rectDistance(x, y, b.rect) * 1000 + centreDist(x, y, b.rect) + b.slice * 1e-3;
    if (d < bd) {
      bd = d;
      best = { col: b.col, slice: b.slice };
    }
  }
  return best;
}

function strikeOf(kind: StrikeKind, id: string, via: 'ray' | 'fat' | 'sweep', point?: V3): NodeTouch {
  if (kind === 'lamp') return { verb: 'relight', lampId: id, via };
  return { verb: 'strike', target: kind === 'skin' ? { kind: 'skin', id } : { kind: 'tappable', id }, via, point };
}

/**
 * Resolve one touch (a press 'tap', a hold-stream hit 'hold', a release 'up', a key). Never returns "nothing": a press
 * always yields one of the eight verbs (or 'hud' on a plate). A release outside an open focus pop and a hold with
 * nothing to strike are 'tunk' (a response, never a miss).
 */
export function resolve(touch: TouchIn, f: NodeFrame): NodeTouch {
  const { x, y } = touch;
  // 1. HUD plates.
  for (let i = 0; i < f.plates.length; i++) if (inRect(x, y, f.plates[i])) return { verb: 'hud', index: i };
  // A release only matters to an open focus pop (the relic ring's hold-and-release).
  if (touch.kind === 'up') {
    if (f.focus && inRect(touch.downX ?? x, touch.downY ?? y, f.focus.rect)) return { verb: 'focus', id: f.focus.id, input: 'release' };
    return { verb: 'tunk', point: null, hint: '' };
  }
  // Any press during a long move or ceremony skips it (and is consumed).
  if (touch.kind === 'tap' && f.skippable) return { verb: 'navigation', nav: 'skip', id: '' };
  // 2. An open focus pop: the object, or outside (close).
  if (f.focus) {
    if (inRect(x, y, f.focus.rect)) return { verb: 'focus', id: f.focus.id, input: touch.kind === 'hold' ? 'hold' : 'tap' };
    if (touch.kind === 'hold') return { verb: 'focus', id: f.focus.id, input: 'hold' };
    return { verb: 'focus', id: f.focus.id, input: 'close' };
  }
  if (touch.kind === 'hold') return resolveHold(touch, f);
  // 3. Event objects [W2].
  for (const e of f.events) if (inRect(x, y, e.rect)) return { verb: 'strike', target: { kind: 'tappable', id: e.id }, via: 'direct' };
  // 4. The lantern, only under the deliberate-gesture rule (§2.4); otherwise the touch passes to the world.
  const L = f.lantern;
  if (L && L.full && !L.holding && inRect(x, y, L.rect) && touch.t - L.lastWorldUpAt >= HIT.pulseQuietMs) return { verb: 'pulse' };
  // 5. The rack's tools (drift): direct hit; ignored right after a strike stream that started outside it.
  if (f.phase === 'drift' && touch.t - f.strikeStreamAt >= HIT.rackQuietMs) {
    for (const r of f.rack) if (inRect(x, y, r.rect)) return { verb: 'skill', id: r.id };
  }
  // 6. Navigation targets: direct hit only.
  for (const n of f.nav) if (inRect(x, y, n.rect)) return { verb: 'navigation', nav: n.kind, id: n.id };
  // 7. Focus-type tappables: direct hit on the padded area.
  for (const o of f.focusables) if (inRect(x, y, o.rect)) return { verb: 'focus', id: o.id, input: 'open' };
  // 8. The camera ray.
  const hit = f.pick(x, y);
  if (f.phase === 'drift' || f.phase === 'seal') {
    if (hit.kind === 'face') return { verb: 'strike', target: { kind: 'face', col: hit.col, slice: hit.slice }, via: 'ray', point: hit.point };
    // 9. The fat finger in a drift: the nearest live face block (never a miss).
    const nb = nearestFace(x, y, f.face);
    if (nb) return { verb: 'strike', target: { kind: 'face', col: nb.col, slice: nb.slice }, via: 'fat' };
    if (hit.kind === 'tappable') return { verb: 'strike', target: { kind: 'tappable', id: hit.id }, via: 'ray', point: hit.point };
    if (hit.kind === 'deep') return { verb: 'tunk', point: hit.point, hint: f.hint };
    return { verb: 'raise', point: hit.point };
  }
  if (hit.kind === 'face') return { verb: 'strike', target: { kind: 'face', col: hit.col, slice: hit.slice }, via: 'ray', point: hit.point };
  if (hit.kind === 'tappable') return { verb: 'strike', target: { kind: 'tappable', id: hit.id }, via: 'ray', point: hit.point };
  if (hit.kind === 'lamp') return { verb: 'relight', lampId: hit.id, via: 'ray' };
  if (hit.kind === 'skin') return { verb: 'strike', target: { kind: 'skin', id: hit.id }, via: 'ray', point: hit.point };
  // 9. The fat finger in a chamber: exactly one strike-type tappable or cold lamp within 48 px.
  const fat = fatChamber(x, y, f.strikeables);
  if (fat) return strikeOf(fat.kind, fat.id, 'fat');
  if (hit.kind === 'deep') return { verb: 'tunk', point: hit.point, hint: f.hint };
  // 10. Lantern Raise.
  return { verb: 'raise', point: hit.point };
}

/** The chamber fat finger: the single candidate whose padded area lies within 48 px, or null (U-NC3). */
export function fatChamber(x: number, y: number, list: NodeFrame['strikeables']): { id: string; kind: StrikeKind } | null {
  let found: { id: string; kind: StrikeKind } | null = null;
  for (const s of list) {
    if (s.kind === 'skin') continue;
    if (rectDistance(x, y, s.rect) <= HIT.fatChamberPx) {
      if (found) return null;
      found = { id: s.id, kind: s.kind };
    }
  }
  return found;
}

/**
 * A hold-stream hit (§2.2). In a drift: the block under the thumb (a hole shows the block behind it: boring in), else
 * the weakest live block of the front slice, else the nearest. In a chamber: the sweep, the remaining strike-type
 * tappables nearest the screen centre first; with none left, a tunk that hints the exit.
 */
function resolveHold(touch: TouchIn, f: NodeFrame): NodeTouch {
  const { x, y } = touch;
  if (f.phase === 'drift' || f.phase === 'seal') {
    const hit = f.pick(x, y);
    if (hit.kind === 'face') return { verb: 'strike', target: { kind: 'face', col: hit.col, slice: hit.slice }, via: 'hold', point: hit.point };
    if (f.weakestCol >= 0) return { verb: 'strike', target: { kind: 'face', col: f.weakestCol, slice: 0 }, via: 'hold' };
    const nb = nearestFace(x, y, f.face);
    if (nb) return { verb: 'strike', target: { kind: 'face', col: nb.col, slice: nb.slice }, via: 'hold' };
    return { verb: 'tunk', point: null, hint: f.hint };
  }
  // A hold that started on a navigation or focus target never sweeps (§2.2).
  const sx = touch.downX ?? x;
  const sy = touch.downY ?? y;
  for (const n of f.nav) if (inRect(sx, sy, n.rect)) return { verb: 'tunk', point: null, hint: '' };
  for (const o of f.focusables) if (inRect(sx, sy, o.rect)) return { verb: 'tunk', point: null, hint: '' };
  const hit = f.pick(x, y);
  if (hit.kind === 'tappable') return { verb: 'strike', target: { kind: 'tappable', id: hit.id }, via: 'hold', point: hit.point };
  if (hit.kind === 'skin') return { verb: 'strike', target: { kind: 'skin', id: hit.id }, via: 'hold', point: hit.point };
  if (hit.kind === 'lamp') return { verb: 'relight', lampId: hit.id, via: 'sweep' };
  // The sweep: nearest the screen centre first (the frame's centre is the strikeables' bounding middle).
  let best: NodeFrame['strikeables'][number] | null = null;
  let bd = Infinity;
  const cx = f.centre.x;
  const cy = f.centre.y;
  for (const s of f.strikeables) {
    if (s.kind === 'skin') continue;
    const d = centreDist(cx, cy, s.rect);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  if (best) return strikeOf(best.kind, best.id, 'sweep');
  return { verb: 'tunk', point: null, hint: f.nav.find((n) => n.kind === 'exit')?.id ?? '' };
}

/** The verb of a touch (U-NC1 counts these). */
export function verbOf(t: NodeTouch): Verb {
  return t.verb;
}
