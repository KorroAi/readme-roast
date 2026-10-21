// Every touch → one action (SPEC §2.3–§2.4, W1-LEAD §3). Pure: the frame snapshot carries the screen rects of what is on
// screen and the camera ray (`pick`), and `resolve` walks the hit-test order:
//   1 HUD plates · 2 an open focus pop · 3 event objects [W2] · 4 the lantern (deliberate gesture) [W2] · 5 the rack ·
//   6 navigation targets · 7 focus-type tappables · 8 the camera ray · 9 the fat finger · 10 Lantern Raise.
// Every acting touch ends in one of: strike, relight, focus, navigation, skill, pulse, tunk, raise, and in Explore also
// walk and look (L2: there is no "nothing").
//
// Which gestures act depends on the phase (W1-LEAD §3):
// - Dig (the drift face) and the Seal: the press acts in the same frame (L1); a hold streams strikes; no drag-look.
// - Explore (a chamber you walk through) and the Camp: a TAP is a release within 300 ms and 12 px; a drag (> 12 px)
//   looks and never acts; a still hold (≥ 250 ms, ≤ 12 px) repeat-strikes a strike tappable under it, or sweeps the
//   ones in reach. A tappable within 3.5 m acts at once; farther, you walk to it and it acts on arrival. A tap on a
//   floor, ledge or stair walks there; far rock or the dark that is not walkable raises the lantern.
// - Ride (the cart run): a press on a passing glint mines it; a press on a side ledge's brake mark brakes; elsewhere
//   the lantern rises toward the point (never nothing). The ride is skipped from its HUD plate.
// Target sizes: hit areas are padded to ≥ 88 × 88 px; a fat finger never opens a chest or moves you (U-NC2) and in a
// chamber resolves only when exactly one candidate in reach lies within 48 px (U-NC3).

import type { V3 } from './ropeRide';

/** A screen rectangle in CSS px (x, y = top left). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The input kinds TapSurface queues: a press (pointerdown), a tap (a quick release: < 300 ms down, < 12 px travel), a
 * hold-stream hit, a release (with how long it was down), a drag step (finger travel past 12 px), a key.
 */
export type TouchKind = 'press' | 'tap' | 'hold' | 'up' | 'drag' | 'key';

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
  /** Where the pointer went down (holds, taps and releases). */
  downX?: number;
  downY?: number;
  /** For 'drag': the finger's travel since the last drag step (CSS px). */
  dx?: number;
  dy?: number;
}

/**
 * What the camera ray found under a point (DepthScene.pick, mapped by the shell). `dist` is metres from the eye; the
 * strike reach (3.5 m) is applied here, so a far tappable in Explore is walked to rather than struck.
 */
export type RayHit =
  /** A face block: the model column (snake map) and the slice (0 = the front). */
  | { kind: 'face'; col: number; slice: number; point: V3; dist?: number }
  /** A strike-type tappable (vein, gem cluster, geode shell, stash brick, a passing glint on a ride). */
  | { kind: 'tappable'; id: string; point: V3; dist?: number }
  /** A cold Halden lamp. A lit one answers as deep rock. */
  | { kind: 'lamp'; id: string; point: V3; dist?: number }
  /** A wall-skin cell. */
  | { kind: 'skin'; id: string; point: V3; dist?: number }
  /** Explore: a walkable floor, ledge or stair under the ray (the point is the floor destination, feet level). */
  | { kind: 'walk'; point: V3; dist?: number }
  /** Rock in reach that is not skin (or skin already broken): the tunk. */
  | { kind: 'deep'; point: V3; dist?: number }
  /** Nothing in reach: far rock, the dark, open air (the point is where the ray lands or 12 m out). */
  | { kind: 'far'; point: V3; dist?: number };

/** Navigation marks: exits and their plates, survey rings, chalk arrows, a ride's brake ledge, the camp's stations. */
export type NavKind = 'exit' | 'ring' | 'arrow' | 'ledge' | 'station';
export type FocusKind = 'chest' | 'relic' | 'note' | 'keystone' | 'depot' | 'mural' | 'royal';
export type StrikeKind = 'vein' | 'gem' | 'geode' | 'stash' | 'skin' | 'lamp';

/**
 * The phases a touch is resolved in (W1-LEAD §3): Dig is 'drift'; 'explore' is a chamber walked freely; 'ride' the
 * on-rails Way Down; 'seal' the mechanism fight; 'camp' the surface; 'reveal' a biome's Threshold reveal.
 */
export type TouchPhase = 'drift' | 'explore' | 'ride' | 'seal' | 'camp' | 'reveal';

/** The screen at the moment of a touch. Rects are hit areas (already padded to ≥ 88 px where §2.3 says so). */
export interface NodeFrame {
  phase: TouchPhase;
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
  /** Navigation targets: exits and their plates, survey rings, chalk arrows (hit rects ≥ 88 px). `dist` m from the eye;
   *  `at` the world point to walk to when it is beyond reach (Explore). */
  nav: ReadonlyArray<{ id: string; kind: NavKind; rect: Rect; dist?: number; at?: V3 }>;
  /** Focus-type tappables in view (padded hit rects), with their distance and world point (Explore walks to far ones). */
  focusables: ReadonlyArray<{ id: string; kind: FocusKind; rect: Rect; dist?: number; at?: V3 }>;
  /** Strike-type tappables and cold lamps IN REACH (padded hit rects, for the fat finger and the sweep). */
  strikeables: ReadonlyArray<{ id: string; kind: StrikeKind; rect: Rect; dist?: number; at?: V3 }>;
  /** Explore: strike-type tappables and cold lamps BEYOND reach, visible, with their padded hit rects (≥ 88 px) and the
   *  world point to walk to: a tap on one walks there and acts on arrival, even when the ray misses the small mesh. */
  far?: ReadonlyArray<{ id: string; kind: StrikeKind; rect: Rect; dist: number; at: V3 }>;
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

/** The eight verbs (U-NC1), Explore's walk and look, plus 'hud' (a plate: the DOM's, never the world's). */
export type Verb = 'strike' | 'relight' | 'focus' | 'navigation' | 'skill' | 'pulse' | 'tunk' | 'raise' | 'walk' | 'look' | 'hud';

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
  /**
   * Explore: walk to a floor point (`via: 'floor'`), or walk toward an object beyond reach and then do `then` on arrival
   * (`via: 'approach'`; the walk stops 0.9 m short of `to`), or walk to the objective's target (`via: 'goal'`).
   */
  | { verb: 'walk'; to: V3; via: 'floor' | 'approach' | 'goal'; then?: NodeTouch }
  /** Explore: drag-look by this much finger travel (CSS px). Never acts. */
  | { verb: 'look'; dx: number; dy: number }
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
  /** Explore: a tap is a release within this long (ms) and this far (px); farther is a drag. */
  tapMs: 300,
  tapSlopPx: 12,
  /** Strike reach and focus reach (m): within these a tappable acts at once; beyond, Explore walks to it first. */
  reachStrike: 3.5,
  reachFocus: 4.5,
} as const;

/** Whether a gesture kind acts in a phase (the others continue a gesture already answered: resolve returns null). */
export function actsIn(phase: TouchPhase, kind: TouchKind): boolean {
  if (kind === 'key' || kind === 'hold') return true;
  if (kind === 'up') return false;
  if (phase === 'explore' || phase === 'camp') return kind === 'tap' || kind === 'drag' || kind === 'press';
  // Dig, seal, ride, reveal: the press acts (L1); a quick release or a drag adds nothing.
  return kind === 'press';
}

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
 * Resolve one touch. An acting touch (see `actsIn`) never resolves to "nothing": it yields one of the verbs (or 'hud' on
 * a plate). A gesture continuation the phase does not answer (a quick release in a drift, where the press already
 * struck; a press in Explore, which waits for its release; a release outside an open focus pop) returns null. A hold
 * with nothing to strike is a 'tunk' (a response, never a miss).
 */
export function resolve(touch: TouchIn, f: NodeFrame): NodeTouch | null {
  const { x, y } = touch;
  const k = touch.kind;
  // Drags look (Explore and the camp only) and never act; elsewhere they continue the press.
  if (k === 'drag') return f.phase === 'explore' || f.phase === 'camp' ? { verb: 'look', dx: touch.dx ?? 0, dy: touch.dy ?? 0 } : null;
  // 1. HUD plates (where the gesture went down: a drag that ends on a plate is still the world's).
  const px = k === 'tap' ? touch.downX ?? x : x;
  const py = k === 'tap' ? touch.downY ?? y : y;
  if (k !== 'up' && k !== 'hold') for (let i = 0; i < f.plates.length; i++) if (inRect(px, py, f.plates[i])) return { verb: 'hud', index: i };
  // A release only matters to an open focus pop (the relic ring's hold-and-release); elsewhere it ends a gesture the
  // press, the tap or the hold already answered.
  if (k === 'up') {
    if (f.focus && inRect(touch.downX ?? x, touch.downY ?? y, f.focus.rect)) return { verb: 'focus', id: f.focus.id, input: 'release' };
    return null;
  }
  const walking = f.phase === 'explore' || f.phase === 'camp';
  // Any press during a long move, ride or ceremony skips it (and is consumed): in every phase, on the press.
  if (k === 'press' && f.skippable && f.phase !== 'ride') return { verb: 'navigation', nav: 'skip', id: '' };
  if (!actsIn(f.phase, k)) return null;
  // In Explore the press only skips; the tap (its release) acts.
  if (walking && k === 'press') return null;
  // 2. An open focus pop: the object, or outside (close).
  if (f.focus) {
    if (inRect(x, y, f.focus.rect)) return { verb: 'focus', id: f.focus.id, input: k === 'hold' ? 'hold' : 'tap' };
    if (k === 'hold') return { verb: 'focus', id: f.focus.id, input: 'hold' };
    return { verb: 'focus', id: f.focus.id, input: 'close' };
  }
  if (k === 'hold') return resolveHold(touch, f);
  // 3. Event objects [W2].
  for (const e of f.events) if (inRect(x, y, e.rect)) return { verb: 'strike', target: { kind: 'tappable', id: e.id }, via: 'direct' };
  // 4. The lantern, only under the deliberate-gesture rule (§2.4); otherwise the touch passes to the world.
  const L = f.lantern;
  if (L && L.full && !L.holding && inRect(x, y, L.rect) && touch.t - L.lastWorldUpAt >= HIT.pulseQuietMs) return { verb: 'pulse' };
  // 5. The rack's tools (drift): direct hit; ignored right after a strike stream that started outside it.
  if (f.phase === 'drift' && touch.t - f.strikeStreamAt >= HIT.rackQuietMs) {
    for (const r of f.rack) if (inRect(x, y, r.rect)) return { verb: 'skill', id: r.id };
  }
  // 6. Navigation targets: direct hit only. In Explore a far exit is walked to and taken on arrival.
  for (const n of f.nav) {
    if (!inRect(x, y, n.rect)) continue;
    const nav: NodeTouch = { verb: 'navigation', nav: n.kind, id: n.id };
    if (walking && n.at && (n.dist ?? 0) > HIT.reachStrike) return { verb: 'walk', to: n.at, via: 'approach', then: nav };
    return nav;
  }
  // 7. Focus-type tappables: direct hit on the padded area. In Explore a far one is walked to, then opened.
  for (const o of f.focusables) {
    if (!inRect(x, y, o.rect)) continue;
    const open: NodeTouch = { verb: 'focus', id: o.id, input: 'open' };
    if (walking && o.at && (o.dist ?? 0) > HIT.reachFocus) return { verb: 'walk', to: o.at, via: 'approach', then: open };
    return open;
  }
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
  if (f.phase === 'ride') {
    if (hit.kind === 'tappable' && (hit.dist ?? 0) <= HIT.reachStrike) return { verb: 'strike', target: { kind: 'tappable', id: hit.id }, via: 'ray', point: hit.point };
    const fat = fatChamber(x, y, f.strikeables);
    if (fat) return strikeOf(fat.kind, fat.id, 'fat');
    return { verb: 'raise', point: hit.point };
  }
  if (hit.kind === 'face') return { verb: 'strike', target: { kind: 'face', col: hit.col, slice: hit.slice }, via: 'ray', point: hit.point };
  const near = (hit.dist ?? 0) <= HIT.reachStrike;
  if (hit.kind === 'tappable' || hit.kind === 'lamp' || hit.kind === 'skin') {
    const act: NodeTouch = hit.kind === 'lamp' ? { verb: 'relight', lampId: hit.id, via: 'ray' } : { verb: 'strike', target: hit.kind === 'skin' ? { kind: 'skin', id: hit.id } : { kind: 'tappable', id: hit.id }, via: 'ray', point: hit.point };
    if (near || !walking) return act;
    // Explore: a far tappable is walked to, then struck (skin is only struck in reach: far skin is just rock to walk to).
    if (hit.kind !== 'skin') return { verb: 'walk', to: hit.point, via: 'approach', then: act };
  }
  // 9. The fat finger: exactly one strike-type tappable or cold lamp in reach within 48 px.
  const fat = fatChamber(x, y, f.strikeables);
  if (fat) return strikeOf(fat.kind, fat.id, 'fat');
  // 9b. Explore: a far tappable's padded hit area (the ray missed its mesh): walk there, then act (the nearest centre).
  if (walking && f.far?.length) {
    let best: (typeof f.far)[number] | null = null;
    let bd = Infinity;
    for (const o of f.far) {
      if (!inRect(x, y, o.rect)) continue;
      const d = Math.hypot(x - (o.rect.x + o.rect.w / 2), y - (o.rect.y + o.rect.h / 2));
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) return { verb: 'walk', to: best.at, via: 'approach', then: strikeOf(best.kind, best.id, 'ray') };
  }
  // Explore: a floor, a ledge or a stair (or the foot of a wall) walks there.
  if (walking && hit.kind === 'walk') return { verb: 'walk', to: hit.point, via: 'floor' };
  if (hit.kind === 'deep' && near) return { verb: 'tunk', point: hit.point, hint: f.hint };
  // 10. Lantern Raise.
  return { verb: 'raise', point: hit.point };
}

/** The chamber fat finger: the single candidate whose padded area lies within 48 px, or null (U-NC3). */
export function fatChamber(x: number, y: number, list: NodeFrame['strikeables']): { id: string; kind: StrikeKind } | null {
  let found: { id: string; kind: StrikeKind } | null = null;
  for (const s of list) {
    if (s.kind === 'skin') continue;
    if (s.dist !== undefined && s.dist > HIT.reachStrike) continue;
    if (rectDistance(x, y, s.rect) <= HIT.fatChamberPx) {
      if (found) return null;
      found = { id: s.id, kind: s.kind };
    }
  }
  return found;
}

/**
 * A hold-stream hit (§2.2, W1-LEAD §3). In a drift or a seal: the block under the thumb (a hole shows the block behind
 * it: boring in), else the weakest live block of the front slice, else the nearest. In Explore, the camp and a ride:
 * on a strike tappable in reach, repeat-strike it; elsewhere sweep the remaining strike-type tappables in reach,
 * nearest the screen centre first; with none left, a tunk that hints the exit.
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
  const near = (hit.dist ?? 0) <= HIT.reachStrike;
  if (near && hit.kind === 'tappable') return { verb: 'strike', target: { kind: 'tappable', id: hit.id }, via: 'hold', point: hit.point };
  if (near && hit.kind === 'skin') return { verb: 'strike', target: { kind: 'skin', id: hit.id }, via: 'hold', point: hit.point };
  if (near && hit.kind === 'lamp') return { verb: 'relight', lampId: hit.id, via: 'sweep' };
  // The sweep: nearest the screen centre first (the frame's centre is the strikeables' bounding middle).
  let best: NodeFrame['strikeables'][number] | null = null;
  let bd = Infinity;
  const cx = f.centre.x;
  const cy = f.centre.y;
  for (const s of f.strikeables) {
    if (s.kind === 'skin') continue;
    if (s.dist !== undefined && s.dist > HIT.reachStrike) continue;
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
