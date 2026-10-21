// The W1 templates as recipes on the Shaper (./build.ts): Topsoil's six authored rooms (SPEC §7), the Glowroot
// Threshold, the Glowroot mini-kit (4 templates, 2 sub-zones) and the Root Knot hall. Local frame: u forward from the
// entry wall, v from the outer (left) wall to the inner (right) one, y up from the entry floor. The exit is given by
// the layout (`s.input.exit`): every recipe brings a walkable route from the arrival to it.
//
// The first version's architecture vocabulary (`9eb4166` generateWorld.ts) lives on here: column shafts, stair flights,
// the corbelled shrine, the arched bridge, the crystal seam, dripstone, a lamp at every landmark.

import { B, EMITTER } from '../../../config/blocks';
import type { TemplateId } from '../kits/types';
import { l3, type Recipe, type Shaper } from './build';

// ------------------------------------------------------------------------------------------------------ helpers

/** The exit pad: floor at exit.dy around the exit, and the passage stub through the right wall when `through`. */
function exitPad(s: Shaper, r = 2.6): void {
  const e = s.input.exit;
  const w = s.input.w;
  s.floor(e.dy, (u, v) => Math.hypot(u - e.u, v - e.v) < r);
  if (e.through) {
    s.capsule(e.u, e.v - 1, e.u, w + 1.2, 1.9);
    s.floor(e.dy, (u, v) => Math.abs(u - e.u) < 2.0 && v > e.v - 2 && v < w + 1.2);
  }
  s.keepClear.push({ u: e.u, v: e.v, r: 2.2 });
}

/** The arrival landing at floor 0 (the breach opens onto it). */
function landing(s: Shaper, du = 5, dv = 3.2): void {
  const E = s.input.entryV;
  s.floor(0, (u, v) => u < du && Math.abs(v - E) < dv);
  s.keepClear.push({ u: 1.5, v: E, r: 2.2 });
}

const farWall = (d: number, k = 4) => (p: { u: number; v: number }) => (p.u > d - k ? 2 : 0) + p.u * 0.03;

/** A Halden lamp post's light (cold until relit) is added by the layout from the socket; authored burning lamps here. */
function warmLamp(s: Shaper, id: string, u: number, y: number, v: number, radius = 7): void {
  s.light({ id, kind: 'lamp', pos: l3(u, y, v), color: [1.0, 0.7, 0.4], radius });
}

/** Glowroot seams: emitter voxels scattered on rock near a set of points (the biome's teal-green key). */
function glowSeams(s: Shaper, pts: Array<[number, number, number]>, per = 5): void {
  s.carves.push(() => {
    for (const [u, y, v] of pts) s.seam(u, y, v, 2.2, per, EMITTER.GLOWROOT);
  });
  pts.slice(0, 3).forEach(([u, y, v], n) => s.light({ id: `glow${n}`, kind: 'glowroot', pos: l3(u, y, v), color: [0.38, 0.88, 0.72], radius: 6 }));
}

/** A cold Halden lamp post just inside the mouth, right of the arrival axis (seen on first light, relit in reach). */
function arrivalLamp(s: Shaper): void {
  const E = s.input.entryV;
  // A pair flanking the way in, the left one a little deeper (the first two lamps to relight).
  for (const [id, p] of [['l0', l3(5.2, 0, E + 1.3)], ['l1', l3(7.4, 0, E - 1.6)]] as Array<[string, ReturnType<typeof l3>]>) {
    s.socket({ id, kind: 'lamp', mount: 'post', level: 0, pos: p, normal: l3(-1, 0, 0), bound: l3(0.3, 0.9, 0.3) });
    s.blockers.push({ pos: p, r: 0.3 });
  }
  s.floor(0, (u, v) => Math.hypot(u - 7.4, v - (E - 1.6)) < 1.6);
}

/** A Halden lamp hanging on a chain from the roof (lit, warm): decor and a practical. */
function hangingLamp(s: Shaper, id: string, u: number, y: number, v: number, chain = 1.5): void {
  s.dress('hangingLamp', l3(u, y + chain, v), { to: l3(u, y, v) });
  warmLamp(s, id, u, y - 0.2, v, 7);
}

/** Roots hanging from the ceiling over a region (decor; Topsoil and Glowroot). */
function rootCanopy(s: Shaper, u0: number, u1: number, v0: number, v1: number, n: number, y: number): void {
  for (let j = 0; j < n; j++) {
    const u = u0 + (u1 - u0) * s.run.next();
    const v = v0 + (v1 - v0) * s.run.next();
    s.dress('hangingRoots', l3(u, y, v), { scale: 0.7 + 0.8 * s.run.next(), to: l3(u, y - 1.2 - 1.6 * s.run.next(), v) });
  }
}

// ------------------------------------------------------------------------------------------------------ Topsoil
//
// The portrait frame is narrow (hFOV 52°: 2.9 m wide at 3 m, 5.9 m at 6 m, 9.8 m at 10 m), so every room is a NAVE
// along the arrival axis: the near walls frame the arrival (the entry mouth), the treasure sits on the axis in the
// lantern pool, the wonder fills the top third at the far end, and the side bays hold the exit and the extras.

/** An accent light falling from above (a vent, a lift shaft, the sky shaft): a chimney with sky-light emitters. */
function skyChimney(s: Shaper, u: number, v: number, r: number, y0: number, y1: number): void {
  s.lift(u, v, r + 1.2, y0);
  s.carves.push(() => {
    s.blob(u, y0, v, r + 0.6, 1.2, r + 0.6);
    s.air(u - r, y0 - 0.5, v - r, u + r, y1, v + r);
    s.solid(u - r, y1 - 1.5, v - r, u + r, y1 - 0.5, v + r, B.LIGHT_SKY);
  });
  s.shafts.push({ id: 'sky', from: l3(u, y1 - 1.5, v), to: l3(u + 0.4, y0 - 4, v - 0.3), radius: r, color: [0.62, 0.76, 0.9] });
  s.light({ id: 'sky', kind: 'sky', pos: l3(u, y0, v), color: [0.62, 0.76, 0.9], radius: 8 });
  s.anchors.wonder = l3(u, y0 - 1.2, v);
}

/** A side bay off the nave (W1-LEAD §3: ≥ 1 side passage or alcove): a rounded alcove at floor h. */
function sideBay(s: Shaper, u: number, v: number, r: number, h: number): void {
  s.bay(u, v, r);
  s.floor(h, (cu, cv) => Math.hypot(cu - u, cv - v) < r + 0.3);
}

/** C1 the Root Cellar: an entry balcony, the Wood chest on a crate in the lantern pool, a stair down into the cellar,
 *  the sky shaft dropping dusk light through hanging roots onto Halden shelves, three root-knot veins on the left. */
const rootCellar: Recipe = (s) => {
  const { w, d, entryV: E } = s.input;
  const lo = -3;
  const roof = (s.input.surfaceDy ?? 6) - 1.5;
  s.plan(0.5, 3);
  s.nave(4.5, 6.5);
  s.capsule(d - 6, E + 4, s.input.exit.u, s.input.exit.v, 2.6);
  sideBay(s, 11, 1.8, 2.2, lo);
  s.floor(lo, () => true);
  s.floor(0, (u, v) => u < 7 && v < E + 4.8);
  landing(s, 7, 3.2);
  s.stair(5.0, E + 3.2, 0, 9.8, E + 3.2, lo, 2.8);
  exitPad(s);
  s.dome(roof, 2.6, 0.7);
  // The sky shaft over the cellar on the arrival axis, its mouth hung with roots.
  const su = 13.5;
  const sv = E + 0.6;
  const top = s.input.surfaceDy ?? 6;
  s.carves.push(() => {
    s.blob(su, roof, sv, 2.4, 1.0, 2.4);
    s.air(su - 1.25, roof - 1, sv - 1.25, su + 1.25, top + 2, sv + 1.25);
    s.solid(su - 1.25, top - 0.5, sv - 1.25, su + 1.25, top + 0.5, sv + 1.25, B.LIGHT_SKY);
  });
  s.shafts.push({ id: 'sky', from: l3(su, top, sv), to: l3(su + 0.5, lo, sv - 0.4), radius: 1.2, color: [0.62, 0.76, 0.9] });
  s.light({ id: 'sky', kind: 'sky', pos: l3(su, roof - 0.5, sv), color: [0.62, 0.76, 0.9], radius: 9 });
  s.anchors.skyShaft = l3(su, lo, sv);
  s.anchors.wonder = l3(su, roof, sv);
  rootCanopy(s, su - 3.5, su + 3.5, sv - 3, sv + 3, 12, roof);
  rootCanopy(s, 2, d - 2, 2, w - 3, 8, roof);
  // Halden shelves along the cellar's right wall, a barrel and crates.
  for (let j = 0; j < 3; j++) s.dress('shelf', l3(9.5 + j * 2.4, lo, E + 6.0), { size: l3(2.0, 2.2, 0.5), face: { u: 0, v: -1 } });
  s.dress('crateStack', l3(d - 2.5, lo, E + 4.5), { size: l3(1.4, 1.4, 1.2) });
  s.dress('barrel', l3(d - 2.2, lo, 3.0));
  s.dress('tools', l3(1.6, 0, E + 2.4));
  s.dress('crate', l3(5.4, 0, E - 2.2), { face: { u: 1, v: 0.3 } });
  // The scripted Wood chest on a crate in the lantern pool, just off the arrival axis and 3 m out, so the arrival frame
  // shows the chest against the cellar and its sky shaft instead of filling a third of the screen.
  s.socket({ id: 'f0', kind: 'feature', mount: 'crate', level: 0, pos: l3(4.4, 0.75, E - 0.35), normal: l3(-1, 0, 0) });
  s.blockers.push({ pos: l3(4.4, 0, E - 0.35), r: 0.55 });
  s.prefer.vein = (p) => (p.v < 4.2 && p.u > 5 ? 3 : 0) + (p.u < 16 ? 0.5 : 0);
  s.prefer.stash = (p) => (p.y < -1 ? 1 : 0) + (p.u > 14 ? 0.6 : 0);
  s.prefer.lamp = (p) => (p.y > -0.5 && p.v > E ? 1.6 : 0) + (p.y < -1 && p.v > E + 3 ? 1.2 : 0);
  s.prefer.secret = farWall(d, 4);
  s.prefer.gem = (p) => (Math.hypot(p.u - 11, p.v - 1.8) < 3 ? 2 : 0);
};

/** C2 the Copper Lode: a broad copper vein across the right wall, a gem ledge up a stair on the left, the main floor
 *  below, a Halden air vent letting dusk down at the far end, the cart platform at the exit. */
const copperLode: Recipe = (s) => {
  const { d, entryV: E } = s.input;
  const e = s.input.exit;
  const lo = -3;
  s.plan(0.5, 3);
  s.nave(4.5, 5.0);
  s.capsule(e.u - 4, E + 4, e.u, e.v, 2.6);
  s.floor(lo, () => true);
  landing(s, 5, 3.0);
  s.stair(4.6, E + 1.0, 0, 9.6, E + 1.0, lo, 3.2);
  // The gem ledge on the left wall, up a short stair from the landing.
  s.floor(1.5, (u, v) => u > 7.5 && u < 14.5 && v < E - 2.2);
  s.stair(3.8, E - 3.0, 0, 7.8, E - 3.0, 1.5, 2.4);
  exitPad(s);
  s.dome(7.5, 2.6, 0.9);
  skyChimney(s, d - 5.5, E + 1.0, 1.0, 7.5, 13);
  hangingLamp(s, 'vault', d * 0.5, 5.0, E + 0.8, 2.0);
  s.anchors.wonder = l3(d * 0.5, 5.6, E + 0.8);
  // The broad copper seam across the right wall: a sinuous band of ore voxels, rich knots in it.
  s.carves.push(() => {
    const g = s.grid;
    g.each((i, j, k, u, y, v) => {
      if (v < E + 3 || u < 6 || u > d - 2) return;
      const band = lo + 1.4 + 0.8 * Math.sin(u * 0.55) + 0.35 * Math.sin(u * 1.7 + 1);
      if (Math.abs(y - band) > 0.6) return;
      const id = g.get(i, j, k);
      if (id === s.hostA || id === s.hostB || id === s.hard) g.data[g.idx(i, j, k)] = (i * 7 + j * 3) % 9 === 0 ? s.rich : s.ore;
    });
  });
  s.prefer.vein = (p) => (p.v > E + 3 && p.u > 6 ? 3 : 0) + (p.y < lo + 2.4 ? 0.5 : 0);
  s.prefer.gem = (p) => (p.y > 1.4 ? 3 : 0);
  s.prefer.lamp = (p) => (p.y > 1 ? 1.5 : 0) + (p.u > d - 8 ? 1 : 0);
  s.prefer.stash = (p) => (p.u > d - 6 ? 1 : 0);
  s.prefer.secret = (p) => (p.u > d - 4 ? 1.5 : 0);
  // The cart platform: rails along the exit passage, a cart waiting, a buffer.
  s.dress('rail', l3(e.u - 0.6, e.dy, e.v - 3), { to: l3(e.u - 0.6, e.dy, s.input.w + 1) });
  s.dress('rail', l3(e.u + 0.6, e.dy, e.v - 3), { to: l3(e.u + 0.6, e.dy, s.input.w + 1) });
  s.dress('cart', l3(e.u, e.dy, e.v - 1.2), { face: { u: 0, v: 1 } });
  s.dress('railBuffer', l3(e.u, e.dy, e.v - 3.2), { face: { u: 0, v: 1 } });
  s.dress('brokenCart', l3(d - 3, lo, 3.4));
  s.dress('crate', l3(12, lo, E + 2.2));
  s.dress('tools', l3(9, 1.5, 2.8));
};

/** C3 the Halden Lamp Room: a built room (masonry lining, timber posts and beams), a lamp still burning on a crate
 *  with the "Day 40" note under it, a dais across the room, a pump pit down to the exit, a mineral seep. */
const lampRoom: Recipe = (s) => {
  const { d, entryV: E } = s.input;
  const e = s.input.exit;
  s.wallAmp = 0.3;
  s.ledgeAmp = 0.2;
  s.plan(0.6, 1.4);
  s.nave(4.0, 6.0);
  s.capsule(e.u - 3, E + 4, e.u, e.v, 2.5);
  s.floor(0, () => true);
  landing(s, 5, 3.0);
  // The dais across the far end, up three steps in the middle.
  s.floor(1.5, (u) => u > d - 5.5);
  s.stair(d - 9, E + 0.5, 0, d - 5.4, E + 0.5, 1.5, 3.2);
  // The pump pit to the exit (right far corner).
  s.floor(e.dy, (u, v) => Math.hypot(u - e.u, v - e.v) < 3.0);
  s.stair(e.u - 0.5, e.v - 6.2, 0, e.u - 0.5, e.v - 2.6, e.dy, 2.8);
  exitPad(s);
  s.dome(7.0, 3.6, 0.3);
  // The Halden lamp wheel hung from the roof over the room (cold lamps that catch the lantern).
  s.dress('chandelier', l3(d * 0.5, 6.8, E + 0.6), { to: l3(d * 0.5, 4.9, E + 0.6), size: l3(2.2, 0.5, 2.2) });
  // Masonry lining 2.5 m up the walls.
  s.carves.push(() => {
    const g = s.grid;
    g.each((i, j, k, _u, y) => {
      if (y < -0.1 || y > 2.6) return;
      const id = g.get(i, j, k);
      if (id === B.AIR) return;
      if (!g.solid(i + 1, j, k) || !g.solid(i - 1, j, k) || !g.solid(i, j, k + 1) || !g.solid(i, j, k - 1)) {
        if (id === s.hostA || id === s.hostB || id === s.hard) g.data[g.idx(i, j, k)] = B.MASONRY;
      }
    });
    // The mineral seep on the left wall: wet, glowing faintly (the room's cool accent).
    s.seam(7.5, 1.2, E - 3.8, 1.6, 6, EMITTER.AQUA);
  });
  s.light({ id: 'seep', kind: 'crystal', pos: l3(7.5, 1.0, E - 3.0), color: [0.2, 0.55, 0.8], radius: 5 });
  s.dress('puddle', l3(7.5, 0, E - 2.6), { size: l3(2.2, 0.05, 1.4) });
  for (let u = 2.5; u < d - 2; u += 3.4) {
    s.dress('timberPost', l3(u, 0, E - 3.4), { size: l3(0.3, 3.4, 0.3) });
    s.dress('timberPost', l3(u, 0, E + 5.4), { size: l3(0.3, 3.4, 0.3) });
    s.dress('beam', l3(u, 3.5, E - 3.4), { to: l3(u, 3.5, E + 5.4) });
  }
  // The lamp still burning on a crate on the axis, the note under it.
  const cu = 7.2;
  const cv = E + 0.7;
  s.socket({ id: 'l3', kind: 'lamp', mount: 'crate', level: 0, pos: l3(cu, 0.75, cv), normal: l3(-1, 0, 0), lit: true, bound: l3(0.3, 0.45, 0.3) });
  s.socket({ id: 'f0', kind: 'feature', mount: 'crate', level: 0, pos: l3(cu - 0.15, 0.8, cv - 0.6), normal: l3(-1, 0, 0) });
  s.blockers.push({ pos: l3(cu, 0, cv - 0.3), r: 0.75 });
  warmLamp(s, 'burning', cu, 1.3, cv, 8);
  s.dress('crate', l3(cu, 0, cv - 0.3), { size: l3(1.0, 0.75, 1.3) });
  s.dress('plaque', l3(0.5, 1.8, E + 2.2), { normal: l3(1, 0, 0) });
  s.dress('signpost', l3(d - 3.5, 1.5, E - 2.5));
  s.dress('survey', l3(d - 4.0, 1.5, E + 2.5));
  s.dress('shelf', l3(d - 1.5, 1.5, E + 0.5), { size: l3(2.4, 2.0, 0.5), face: { u: -1, v: 0 } });
  s.prefer.lamp = (p) => (p.y > 1 ? 2.2 : 0) + (p.u < 5 && p.v > E ? 1 : 0);
  s.prefer.vein = (p) => (p.u > d - 8 ? 1 : 0) + (p.v < E - 2.5 ? 0.6 : 0);
  s.prefer.secret = (p) => (p.v > E + 4 ? 1 : 0) + (p.u < d / 2 ? 0.5 : 0);
  s.anchors.wonder = l3(d * 0.5, 5.0, E + 0.6);
};

/** C4 the Reliquary niche: a natural hall, a stair up the axis to an arched masonry alcove lined with glyph stones
 *  (rune cyan), the relic on its plinth; the exit stair down on the right. */
const reliquary: Recipe = (s) => {
  const { d, entryV: E } = s.input;
  const e = s.input.exit;
  s.plan(0.5, 3.0);
  s.nave(4.0, 5.0);
  s.capsule(e.u - 3.5, E + 3.5, e.u, e.v, 2.5);
  sideBay(s, 7.5, E - 4.6, 2.0, 0);
  s.floor(0, () => true);
  landing(s, 5, 3.0);
  const av = E + 0.4;
  s.floor(2.0, (u, v) => u > d - 6.2 && Math.abs(v - av) < 3.2);
  s.stair(d - 10.6, av, 0, d - 6.4, av, 2.0, 3.2);
  s.floor(e.dy, (u, v) => Math.hypot(u - e.u, v - e.v) < 2.8);
  s.stair(e.u - 0.2, e.v - 6.0, 0, e.u - 0.2, e.v - 2.6, e.dy, 2.8);
  exitPad(s);
  s.dome(8, 2.8, 0.8);
  s.carves.push(() => {
    // The arched alcove: masonry jambs and lintel, glyph stones inside.
    s.air(d - 4.6, 2.0, av - 1.75, d + 0.8, 6.0, av + 1.75);
    s.solid(d - 5.5, 2.0, av - 2.25, d - 4.6, 7.0, av - 1.75, B.MASONRY);
    s.solid(d - 5.5, 2.0, av + 1.75, d - 4.6, 7.0, av + 2.25, B.MASONRY);
    s.solid(d - 5.5, 6.0, av - 2.25, d - 4.6, 7.0, av + 2.25, B.MASONRY);
    s.solid(d - 5.5, 6.5, av - 1.5, d - 5.0, 7.0, av + 1.5, B.GLYPH_STONE);
    s.solid(d + 0.8, 2.0, av - 1.75, d + 1.0, 6.0, av + 1.75, B.MASONRY);
    for (const dv of [-1.75, 1.5]) s.solid(d - 4.6, 2.5, av + dv, d + 0.8, 5.5, av + dv + 0.25, B.GLYPH_STONE);
    s.solid(d - 4.6, 5.5, av - 1.75, d + 0.8, 6.0, av + 1.75, B.MASONRY);
  });
  const au = d - 2.4;
  s.socket({ id: 'f0', kind: 'feature', mount: 'plinth', level: 1, pos: l3(au, 3.1, av), normal: l3(-1, 0, 0), bound: l3(0.4, 0.45, 0.4) });
  s.blockers.push({ pos: l3(au, 2.0, av), r: 0.6 });
  s.dress('rune', l3(d - 5.6, 6.7, av), { normal: l3(-1, 0, 0) });
  s.light({ id: 'runes', kind: 'crystal', pos: l3(au - 0.6, 3.8, av), color: [0.18, 0.71, 0.8], radius: 7 });
  // Two votive lanterns still burn at the alcove's mouth, flanking the relic: warm light on the masonry against the
  // runes' teal (the arrival's warm practical).
  for (const [id, dv] of [['votive0', -1.25], ['votive1', 1.25]] as Array<[string, number]>) {
    s.dress('crewLamp', l3(d - 4.1, 2.0, av + dv), { face: { u: -1, v: 0 } });
    warmLamp(s, id, d - 4.1, 2.35, av + dv, 6);
  }
  s.anchors.wonder = l3(d - 5.6, 6.6, av);
  s.dress('stairFlight', l3(e.u - 0.2, 0, e.v - 6.0), { to: l3(e.u - 0.2, e.dy, e.v - 2.6) });
  s.prefer.vein = (p) => (p.v < E - 2.5 ? 1 : 0) + (p.v > E + 3 ? 1 : 0) - (p.u > d - 7 ? 2 : 0);
  s.prefer.lamp = (p) => (Math.abs(p.v - av) < 4 && p.u > d - 12 ? 2 : 0) + (p.u < 5 ? 0.8 : 0);
  s.prefer.secret = (p) => (Math.hypot(p.u - 7.5, p.v - (E - 4.6)) < 3.2 ? 2 : 0);
  s.prefer.stash = (p) => (Math.hypot(p.u - 7.5, p.v - (E - 4.6)) < 3.2 ? 1 : 0);
};

/** C5 the Cache: a chest among collapsed crates on the axis, boulders, cracks in the floor ahead leaking green light
 *  from below (the Glowroot tease). */
const cache: Recipe = (s) => {
  const { d, entryV: E } = s.input;
  const e = s.input.exit;
  s.plan(0.5, 3);
  s.nave(4.5, 5.5);
  s.capsule(e.u - 3, E + 4, e.u, e.v, 2.5);
  sideBay(s, 9, E - 5.0, 2.2, 0);
  s.floor(0, () => true);
  landing(s, 5, 3.0);
  s.floor(e.dy, (u, v) => Math.hypot(u - e.u, v - e.v) < 2.8);
  s.stair(e.u - 0.4, e.v - 6.0, 0, e.u - 0.4, e.v - 2.6, e.dy, 2.8);
  exitPad(s);
  s.dome(7, 2.6, 1.0);
  const cu = 11.0;
  const cv = E + 0.8;
  s.carves.push(() => {
    s.blob(7.2, 0.4, E - 3.2, 1.4, 1.1, 1.2, s.hostB, 0);
    s.blob(d - 4.0, 0.3, E + 3.2, 1.2, 1.0, 1.0, s.hard, 0);
    // The green leak: a gap under the floor with glowing light, opened by hairline cracks across the axis.
    s.air(cu - 2.6, -1.5, cv - 0.75, cu + 2.6, -0.5, cv + 0.75);
    s.solid(cu - 2.2, -1.5, cv - 0.5, cu + 2.2, -1.0, cv + 0.5, B.LIGHT_LEAK_GREEN);
    for (let j = 0; j < 5; j++) s.air(cu - 2.2 + j * 1.0, -0.5, cv - 0.25 + ((j % 2) - 0.5) * 0.5, cu - 1.7 + j * 1.0, 0.0, cv + 0.25 + ((j % 2) - 0.5) * 0.5);
  });
  s.light({ id: 'leak', kind: 'leak', pos: l3(cu, -0.8, cv), color: [0.22, 0.62, 0.36], radius: 6 });
  s.anchors.leak = l3(cu, 0, cv);
  // The roof split above it: a fissure where roots hang and the same green seeps (Glowroot, below and around).
  s.lift(cu + 1.5, cv, 2.5, 8.5);
  s.carves.push(() => {
    s.seam(cu + 1.5, 8.0, cv, 1.6, 7, EMITTER.GLOWROOT);
  });
  rootCanopy(s, cu - 0.5, cu + 3.5, cv - 1.5, cv + 1.5, 6, 8.5);
  s.light({ id: 'fissure', kind: 'glowroot', pos: l3(cu + 1.5, 7.0, cv), color: [0.36, 0.8, 0.5], radius: 6 });
  s.anchors.wonder = l3(cu + 1.5, 7.0, cv);
  s.blockers.push({ pos: l3(cu, 0, cv), r: 2.8 });
  // The chest among collapsed crates, on the axis in the lantern pool.
  const fu = 4.4;
  const fv = E - 0.6;
  s.socket({ id: 'f0', kind: 'feature', mount: 'crate', level: 0, pos: l3(fu, 0.75, fv), normal: l3(-1, 0, 0) });
  s.blockers.push({ pos: l3(fu, 0, fv), r: 0.6 });
  s.dress('crateStack', l3(fu + 1.1, 0, fv - 1.4), { size: l3(1.2, 1.8, 1.2) });
  s.dress('crate', l3(fu + 0.4, 0, fv + 1.5), { face: { u: 0.8, v: 0.6 } });
  s.dress('crate', l3(fu + 1.6, 0, fv - 0.1), { face: { u: 0.6, v: -0.8 } });
  s.dress('brokenCart', l3(d - 3, 0, E - 2.5));
  s.dress('beam', l3(6.5, 2.8, E - 3.5), { to: l3(9.0, 0.2, E - 1.5) });
  s.prefer.vein = (p) => (p.u > d * 0.5 ? 1 : 0) + (p.v > E + 3 ? 0.6 : 0);
  s.prefer.lamp = (p) => (p.u < 7 && p.v > E ? 1.2 : 0) + (p.u > d - 7 ? 1 : 0);
  s.prefer.secret = (p) => (Math.hypot(p.u - 9, p.v - (E - 5)) < 3.4 ? 2 : 0);
  s.prefer.feature = (p) => (p.u > d - 6 ? 1 : 0);
};

/** C6 the Lift Bottom: the dead hoist cage under the lift shaft (dusk light far up it), chains, the Halden Hatch in
 *  the floor ahead (the seal). */
const liftBottom: Recipe = (s) => {
  const { d, entryV: E } = s.input;
  const e = s.input.exit;
  s.wallAmp = 0.5;
  s.plan(0.5, 2.0);
  s.nave(4.5, 6.0);
  sideBay(s, d - 3.5, E - 4.5, 2.0, -1.5);
  s.floor(0, () => true);
  s.stair(d - 7.4, E - 3.2, 0, d - 4.6, E - 3.2, -1.5, 2.6);
  landing(s, 5, 3.2);
  s.dome(7.5, 3.0, 0.6);
  // The lift shaft over the cage, rising far up to a square of dusk.
  const lu = Math.min(d - 3.0, e.u + 3.2);
  const lv = Math.min(E + 3.5, e.v + 0.8);
  skyChimney(s, lu, lv, 1.4, 7.5, 16);
  s.carves.push(() => {
    for (const [du, dv] of [
      [-1.5, -1.5],
      [1.0, -1.5],
      [-1.5, 1.0],
      [1.0, 1.0],
    ])
      s.solid(lu + du, 0, lv + dv, lu + du + 0.5, 15, lv + dv + 0.5, B.BEAM);
  });
  s.dress('hoistCage', l3(lu, 0, lv), { size: l3(2.4, 2.8, 2.4), face: { u: -1, v: 0 } });
  s.dress('chain', l3(lu - 0.6, 15, lv), { to: l3(lu - 0.6, 2.9, lv) });
  s.dress('chain', l3(lu + 0.6, 15, lv), { to: l3(lu + 0.6, 2.9, lv) });
  s.dress('chain', l3(e.u - 1.4, 7, e.v - 1.4), { to: l3(e.u - 1.2, 0.1, e.v - 1.2) });
  s.dress('chain', l3(e.u + 1.4, 7, e.v + 1.4), { to: l3(e.u + 1.2, 0.1, e.v + 1.2) });
  s.dress('winch', l3(lu - 2.6, 0, lv + 1.2), { face: { u: 1, v: 0 } });
  // The lift crew's work lamp still burns on its post by the landing: the arrival's warm practical (the lift bottom
  // is otherwise lit only by the dusk far up its shaft).
  s.dress('lampPost', l3(6.25, 0, E + 2.75), { face: { u: -1, v: 0 } });
  warmLamp(s, 'workLamp', 6.25, 1.75, E + 2.75, 8);
  s.blockers.push({ pos: l3(6.25, 0, E + 2.75), r: 0.35 });
  s.blockers.push({ pos: l3(lu, 0, lv), r: 1.6 });
  s.blockers.push({ pos: l3(e.u, 0, e.v), r: 1.7 });
  s.anchors.hatch = l3(e.u, e.dy, e.v);
  s.anchors.cage = l3(lu, 0, lv);
  s.prefer.vein = (p) => (p.v < E - 2.5 ? 1 : 0) + (p.u > d - 6 ? 0.5 : 0);
  s.prefer.lamp = (p) => (Math.hypot(p.u - e.u, p.v - e.v) < 6 ? 1.5 : 0);
  s.prefer.secret = (p) => (Math.hypot(p.u - (d - 3.5), p.v - (E - 4.5)) < 3 ? 2 : 0);
};

// ------------------------------------------------------------------------------------------------------ Glowroot

const isGallery = (s: Shaper) => s.input.subZone === 'galleries';

/** The Glowroot Threshold: a root balcony under the hatch, looking back over a glowing gulf to a root-hung vault; a
 *  long root stair down the right wall to the chute, a root bridge across the gulf to a ledge, the Other Lantern's
 *  warm point at the gulf's floor far below. */
const threshold: Recipe = (s) => {
  const { w } = s.input;
  const e = s.input.exit;
  const a = s.input.fromAbove ?? { u: 15, v: 8 };
  s.mouth = null;
  s.wallAmp = 1.1;
  s.plan(0.5, 4.5, (u, v) => Math.hypot(u - 6, v - w * 0.6) - 7);
  s.floor(-12, () => true);
  // The balcony under the hatch, jutting over the gulf toward −u.
  s.floor(0, (u, v) => Math.hypot(u - a.u, v - a.v) < 3.4 || (u > a.u && Math.abs(v - a.v) < 2.8));
  // The root stair down the right side to the exit landing (a 45° flight: 0.5 m steps, never steeper).
  const sv0 = a.v + 3.0;
  const sv1 = sv0 + Math.max(1, -e.dy) * 1.15;
  s.stair(e.u, sv0, 0, e.u, sv1, e.dy, 3.0);
  exitPad(s, 2.8);
  s.floor(e.dy, (u, v) => Math.abs(u - e.u) < 2.6 && v > sv1 - 0.2);
  // The gulf floor, reached by a second flight from the exit landing.
  const gDrop = -12 - e.dy;
  s.stair(e.u - 2.6, e.v - 0.6, e.dy, e.u - 2.6 + gDrop * 1.15, e.v - 0.6, -12, 3.0);
  // The far ledge on the left (a secret and the treasure), across the root bridge.
  const bh = Math.round((e.dy * 0.5) * 2) / 2;
  s.floor(bh, (u, v) => u > 3 && u < 12 && v < 5.2);
  s.dome(8, 0, 1.4);
  // The vault rises where nothing lies above: beyond the Lift Bottom's footprint, clear of its drift.
  s.lift(4.5, w * 0.72, 6, 9.5);
  // The reveal looks from the balcony toward the vault; the balcony's two cold lamps flank that view (the first thing
  // to relight in Glowroot).
  const wu = 4.5;
  const wv = w * 0.72;
  const L = Math.hypot(wu - a.u, wv - a.v);
  const lu = (wu - a.u) / L;
  const lv = (wv - a.v) / L;
  for (const [id, side] of [['l0', -1], ['l1', 1]] as Array<[string, number]>) {
    const p = l3(a.u + lu * 3.2 - lv * 0.95 * side, 0, a.v + lv * 3.2 + lu * 0.95 * side);
    s.socket({ id, kind: 'lamp', mount: 'post', level: 0, pos: p, normal: l3(-lu, 0, -lv), bound: l3(0.3, 0.9, 0.3) });
    s.blockers.push({ pos: p, r: 0.3 });
  }
  s.floor(0, (u, v) => Math.hypot(u - (a.u + lu * 2.8), v - (a.v + lv * 2.8)) < 2.2);
  s.lookFrom = { u: lu, v: lv };
  // Two crystal knots grown over the balcony's front lip (strike them from the balcony).
  for (const [id, side] of [['g0', -1], ['g1', 1]] as Array<[string, number]>) {
    const p = l3(a.u + lu * 3.8 - lv * 0.55 * side, 0.45, a.v + lv * 3.8 + lu * 0.55 * side);
    s.socket({ id, kind: 'gem', mount: 'ledge', level: 0, pos: p, normal: l3(-lu, 0, -lv), bound: l3(0.4, 0.45, 0.4) });
  }
  // Root-knot veins along the stair's outer wall and over the far ledge (things to strike all the way down).
  s.prefer.vein = (p) => (p.y < -2 ? 1 : 0) + (Math.hypot(p.u - wu, p.v - wv) < 7 ? 1.5 : 0) + (p.u > e.u + 1 && p.y < -0.5 ? 1.5 : 0) + (p.v < 5 && p.y < -1 ? 1.2 : 0);
  // Lamps on the gulf floor, by the root stair's foot and under the vault.
  s.socket({ id: 'l2', kind: 'lamp', mount: 'post', level: 2, pos: l3(9.0, -12, w * 0.55), normal: l3(1, 0, 0), bound: l3(0.3, 0.9, 0.3) });
  s.socket({ id: 'l3', kind: 'lamp', mount: 'post', level: 2, pos: l3(5.0, -12, w * 0.3), normal: l3(1, 0, 0), bound: l3(0.3, 0.9, 0.3) });
  s.blockers.push({ pos: l3(9.0, -12, w * 0.55), r: 0.3 }, { pos: l3(5.0, -12, w * 0.3), r: 0.3 });
  s.carves.push(() => {
    // The root bridge across the gulf, from the stair's −3.5 landing to the far ledge.
    const bv = sv0 + (sv1 - sv0) * (bh / e.dy);
    s.deck(e.u - 1.8, bv, 9.0, 4.6, bh, 2.4, B.DECK, 1.0);
  });
  glowSeams(s, [
    [6, -10, w * 0.45],
    [3, -6, 3],
    [2, -4, w * 0.6],
    [9, -9, w - 3],
    [5, 4, w * 0.45],
    [10, 2, 1.5],
    [3, 1, w - 4],
  ], 10);
  rootCanopy(s, 1, 12, 2, w - 2, 16, 7);
  s.dress('rootCurtain', l3(1.5, -4, w * 0.45), { size: l3(0.5, 6, 7), face: { u: 1, v: 0 } });
  s.dress('rootCurtain', l3(a.u - 3.2, -1, a.v - 3.2), { size: l3(3, 4, 0.4), face: { u: 0, v: 1 } });
  s.anchors.otherLantern = l3(4.5, -11.6, w * 0.4);
  // The reveal's wonder is the glowing far plane under the dark arch of the Lift Bottom's floor (SPEC §3.3 Reveal).
  s.anchors.wonder = l3(wu, 2.0, wv);
  s.anchors.balcony = l3(a.u, 0, a.v);
  s.light({ id: 'gulf', kind: 'glowroot', pos: l3(6, -9, w * 0.45), color: [0.38, 0.88, 0.75], radius: 12 });
  s.light({ id: 'vault', kind: 'glowroot', pos: l3(4.5, 6, w * 0.72), color: [0.36, 0.8, 0.66], radius: 9 });
  glowSeams(s, [
    [4, 8, w * 0.72],
    [2, 5, w * 0.6],
    [6, 6, w - 1.5],
  ], 12);
  rootCanopy(s, 1.5, 8, w * 0.55, w - 1.5, 14, 9);
  s.prefer.lamp = (p) => (p.y > -0.5 ? 2 : 0) + (p.y < -9 ? 1.5 : 0);
  s.prefer.stash = (p) => (p.y < -9 ? 2 : 0);
  s.prefer.gem = (p) => (p.y < -9 ? 2 : p.y < -3 ? 1 : 0) + (Math.hypot(p.u - wu, p.v - wv) < 6 ? 1.5 : 0);
  s.prefer.vein = (p) => (p.y < -2 ? 1 : 0) + (Math.hypot(p.u - wu, p.v - wv) < 7 ? 1.5 : 0);
  s.prefer.feature = (p) => (Math.abs(p.y - bh - 0.75) < 0.6 && p.v < 6 ? 3 : 0);
  s.zones.push({ kind: 'vein', n: 2, test: (p) => p.v < 4 && p.y > bh && p.y < bh + 2.2 && p.u > 2 && p.u < 12 });
  s.zones.push({ kind: 'vein', n: 2, test: (p) => p.u > e.u + 0.5 && p.y > e.dy && p.y < 2 });
  // The gulf's far corner under the vault's back wall: root-knot veins, so its floor has something to strike too.
  s.zones.push({ kind: 'vein', n: 2, test: (p) => p.u > 16 && p.v < 7 && p.y < -9 });
  s.prefer.secret = (p) => (p.v < 4 && p.y > -4.5 && p.y < -2 ? 2 : 0);
};

/** A Root Hall: tall and rounded, a root chandelier, a root stair up to a gallery ledge (stand 2), a chalk arrow. */
const rootHall: Recipe = (s) => {
  const { w, d, entryV: E } = s.input;
  const e = s.input.exit;
  s.plan(0.5, 4.5);
  s.floor(0, () => true);
  landing(s, 5, 3.4);
  arrivalLamp(s);
  // The gallery ledge along the left wall, +3, up a root stair.
  s.floor(3.0, (u, v) => u > 7 && u < d - 2 && v < 4.4);
  s.stair(3.6, 2.5, 0, 7.6, 2.5, 3.0, 3.0);
  // The lower floor toward the exit.
  s.floor(e.dy, (u, v) => u > d * 0.55 && v > w * 0.45);
  s.stair(d * 0.55 - 3.6, w * 0.62, 0, d * 0.55 + 0.4, w * 0.62, e.dy, 3.2);
  exitPad(s);
  s.dome(isGallery(s) ? 11 : 10, 3.0, 1.1);
  s.lift(d * 0.5, E + 1.0, 6, isGallery(s) ? 12.5 : 11.5);
  // Two natural columns.
  s.carves.push(() => {
    s.column(d * 0.42, E + 3.2, 0.9, -4, 12, s.hostB);
    s.column(d * 0.7, 3.0, 0.8, -4, 12, s.hostB);
  });
  // The root chandelier: hanging roots and a knot of glowroot at the dome's crown.
  rootCanopy(s, d * 0.5 - 2.5, d * 0.5 + 2.5, E + 1.0 - 2.5, E + 1.0 + 2.5, 14, isGallery(s) ? 11.5 : 10.5);
  glowSeams(s, [
    [d * 0.5, isGallery(s) ? 11.5 : 10.5, E + 1.0],
    [d * 0.3, 5, 1],
    [d * 0.8, 4, w - 1],
    [d - 1, 2, w * 0.4],
  ], isGallery(s) ? 10 : 6);
  s.anchors.wonder = l3(d * 0.5, 7.2, E + 1.0);
  s.dress('chalkArrow', l3(7.8, 3.6, 0.6), { normal: l3(0, 0, 1), face: { u: 1, v: 0 } });
  s.prefer.gem = (p) => (p.y > 2.5 ? 2 : 0);
  s.prefer.lamp = (p) => (p.y > 2.5 ? 1.5 : 0) + (p.u < 6 ? 1 : 0);
  s.prefer.vein = (p) => (p.y < 2 && p.v > w * 0.5 ? 1 : 0) + (p.u > d * 0.5 ? 0.4 : 0);
  s.prefer.secret = (p) => (p.y > 2.5 ? 1.5 : 0);
  if (!isGallery(s)) {
    s.dress('timberSet', l3(5, 0, E), { size: l3(3.6, 3.2, 0.4), face: { u: 1, v: 0 } });
    s.dress('crate', l3(d - 3, e.dy, w - 2));
  }
};

/** A Glow Gallery: long, glowroot seams on both walls, a ledge walk along the right wall, natural pillars. */
const glowGallery: Recipe = (s) => {
  const { w, d, entryV: E } = s.input;
  const e = s.input.exit;
  s.plan(0.5, 3);
  s.floor(0, () => true);
  landing(s, 5, 3.2);
  arrivalLamp(s);
  // The ledge walk along the left wall, up at both ends; the exit flight down on the right.
  s.floor(2.0, (u, v) => u > 6 && u < d - 7 && v < 4.2);
  s.stair(3.2, 2.3, 0, 6.4, 2.3, 2.0, 2.8);
  s.stair(d - 7.4, 2.3, 2.0, d - 4.2, 2.3, 0, 2.8);
  s.floor(e.dy, (u, v) => Math.abs(u - e.u) < 2.6 && v > e.v - 3.4);
  s.stair(e.u - 0.4, e.v - 7.0, 0, e.u - 0.4, e.v - 3.2, e.dy, 3.0);
  exitPad(s);
  s.dome(isGallery(s) ? 8.5 : 7.5, 2.6, 0.9);
  s.carves.push(() => {
    for (let u = 8; u < d - 9; u += 5) s.column(u, w * 0.38 + (u % 2), 0.7, -3, 10, s.hostB);
  });
  const seams: Array<[number, number, number]> = [];
  for (let u = 3; u < d - 2; u += 3.5) seams.push([u, 3.5 + (u % 3), 1], [u + 1.5, 2.0, w - 1]);
  glowSeams(s, seams, isGallery(s) ? 5 : 3);
  if (!isGallery(s)) rootCanopy(s, 2, d - 2, 1, w - 1, 10, 6);
  s.anchors.wonder = l3(d * 0.5, 6, w * 0.5);
  s.prefer.gem = (p) => (p.y > 1.8 ? 2 : 0);
  s.prefer.lamp = (p) => (p.y > 1.8 ? 1 : 0) + (p.u > d - 8 ? 1 : 0);
  s.prefer.vein = (p) => (p.v < 3 ? 1 : 0);
  void E;
};

/** A Mirror Pool: a dark pool under a root bridge, an island shrine with the feature. */
const mirrorPool: Recipe = (s) => {
  const { w, d, entryV: E } = s.input;
  const e = s.input.exit;
  s.plan(0.5, 4);
  s.floor(0, () => true);
  landing(s, 5, 3.4);
  arrivalLamp(s);
  const pu = d * 0.5;
  const pv = E + 1.6;
  // The pool basin (1 m deep: never walked into), on the arrival axis.
  s.floor(-1.0, (u, v) => Math.hypot((u - pu) / 1.25, v - pv) < 4);
  // The island shrine in the pool.
  s.floor(0, (u, v) => Math.hypot(u - (pu + 1.5), v - pv) < 1.9);
  // The exit: a flight down along +v beyond the pool to the exit landing.
  s.floor(e.dy, (u, v) => Math.abs(u - e.u) < 2.6 && v > e.v - 3.2);
  s.stair(e.u - 0.4, e.v - 6.6, 0, e.u - 0.4, e.v - 3.0, e.dy, 3.0);
  exitPad(s);
  s.dome(isGallery(s) ? 9 : 8, 2.6, 1.0);
  s.carves.push(() => {
    // The root bridge from the near shore to the island, and on to the far shore.
    s.deck(pu - 5.0, pv, pu + 0.2, pv, 0, 2.6, B.DECK, 1.0);
    s.deck(pu + 2.8, pv, pu + 6.6, pv, 0, 2.6, B.DECK, 1.0);
    // The corbelled shrine: a masonry plinth on the island.
    s.solid(pu + 0.9, 0, pv - 0.5, pu + 1.9, 0.5, pv + 0.5, B.MASONRY);
  });
  s.dress('puddle', l3(pu, -0.55, pv), { size: l3(10, 0.1, 9) });
  s.socket({ id: 'f0', kind: 'feature', mount: 'plinth', level: 0, pos: l3(pu + 1.4, 1.05, pv), normal: l3(-1, 0, 0), bound: l3(0.4, 0.45, 0.4) });
  s.blockers.push({ pos: l3(pu + 1.4, 0, pv), r: 0.6 });
  glowSeams(s, [
    [pu, 4, 1],
    [pu, 4, w - 1],
    [d - 1, 3, pv],
    [pu, isGallery(s) ? 8.5 : 7.5, pv],
  ], isGallery(s) ? 8 : 5);
  rootCanopy(s, pu - 4, pu + 4, pv - 3, pv + 3, isGallery(s) ? 6 : 12, isGallery(s) ? 8.5 : 7.5);
  s.anchors.wonder = l3(pu, isGallery(s) ? 7.5 : 6.5, pv);
  s.anchors.pool = l3(pu, -0.55, pv);
  s.prefer.vein = (p) => (p.v < 3 || p.v > w - 3 ? 1 : 0);
  s.prefer.lamp = (p) => (Math.hypot(p.u - pu, p.v - pv) < 7 ? 1 : 0);
  void E;
};

/** A Curtain Rift: narrow and tall, root curtains across side alcoves, an upper ledge, the exit below. */
const curtainRift: Recipe = (s) => {
  const { w, d, entryV: E } = s.input;
  const e = s.input.exit;
  s.wallAmp = 1.2;
  s.plan(2.0, 2.5, (u, v) => Math.min(Math.hypot(u - d * 0.35, v - 1.5) - 2.4, Math.hypot(u - d * 0.65, v - (w - 1.5)) - 2.4));
  s.floor(0, () => true);
  landing(s, 5, 3.2);
  arrivalLamp(s);
  s.floor(3.5, (u, v) => u > d * 0.55 && u < d - 3 && v < w * 0.4);
  s.stair(d * 0.55 - 5, w * 0.3, 0, d * 0.55 - 0.6, w * 0.3, 3.5, 3.0);
  s.floor(e.dy, (u, v) => u > d - 8 && v > w * 0.5);
  s.stair(d - 12.5, w * 0.62, 0, d - 8.4, w * 0.62, e.dy, 3.0);
  exitPad(s);
  s.dome(isGallery(s) ? 12 : 11, 4, 1.4);
  s.dress('rootCurtain', l3(d * 0.35, 4.5, 3.2), { size: l3(3.6, 4.5, 0.3), face: { u: 0, v: 1 } });
  s.dress('rootCurtain', l3(d * 0.65, 4.5, w - 3.2), { size: l3(3.6, 4.5, 0.3), face: { u: 0, v: -1 } });
  glowSeams(s, [
    [d * 0.35, 1.5, 0.5],
    [d * 0.65, 1.5, w - 0.5],
    [d * 0.5, 9, w * 0.5],
    [d - 1, 5, w * 0.5],
  ], isGallery(s) ? 9 : 6);
  rootCanopy(s, 2, d - 2, 2, w - 2, isGallery(s) ? 6 : 12, 8);
  s.anchors.wonder = l3(d * 0.5, 9, w * 0.5);
  s.prefer.secret = (p) => (Math.hypot(p.u - d * 0.35, p.v - 1) < 3.5 || Math.hypot(p.u - d * 0.65, p.v - (w - 1)) < 3.5 ? 2 : 0);
  s.prefer.gem = (p) => (p.y > 3 ? 2 : 0);
  s.prefer.feature = (p) => (p.y > 3 ? 1.5 : 0);
  s.prefer.vein = (p) => (p.u > 4 ? 0.5 : 0);
  void E;
};

/** The Root Knot hall: a root wall at the far end with three amber knots (the seal, shown closed in W1). */
const rootKnot: Recipe = (s) => {
  const { w, d, entryV: E } = s.input;
  const e = s.input.exit;
  s.plan(0.5, 3.5);
  s.floor(0, () => true);
  landing(s, 5, 3.4);
  s.floor(-1.5, (u, v) => u < d - 6 && u > 7 && v < 4.5);
  s.stair(5.2, 2.6, 0, 7.6, 2.6, -1.5, 2.6);
  exitPad(s);
  s.dome(9.5, 3.5, 1.0);
  // The knot wall: the far wall on the arrival axis, a root-bound masonry arch with three amber knots (the seal,
  // shown closed in this build).
  const ku = d - 1.0;
  s.floor(0, (u, v) => u > d - 6 && Math.abs(v - E) < 3.4);
  s.carves.push(() => {
    s.air(d - 4.5, 0, E - 3.0, d - 0.6, 6.0, E + 3.0);
    s.solid(d - 0.6, 0, E - 3.0, d + 0.4, 6.5, E + 3.0, B.ANCIENT_BRICK);
    s.solid(d - 1.6, 0, E - 3.5, d - 0.6, 6.5, E - 2.5, B.MASONRY);
    s.solid(d - 1.6, 0, E + 2.5, d - 0.6, 6.5, E + 3.5, B.MASONRY);
    s.solid(d - 1.6, 5.5, E - 3.5, d - 0.6, 6.5, E + 3.5, B.MASONRY);
    s.seam(ku, 3, E, 3.0, 10, EMITTER.GLOWROOT);
  });
  for (let j = 0; j < 3; j++) s.anchors[`knot${j}`] = l3(ku - 0.6, 1.4 + (j % 2) * 1.6, E - 1.5 + j * 1.5);
  s.anchors.wonder = l3(ku - 0.6, 6.0, E);
  s.anchors.seal = l3(ku - 0.6, 2.2, E);
  s.light({ id: 'knots', kind: 'glowroot', pos: l3(ku - 1.5, 2.5, E), color: [1.0, 0.72, 0.3], radius: 7 });
  rootCanopy(s, d - 5, d - 1, E - 3, E + 3, 10, 6);
  glowSeams(s, [
    [e.u, 3, e.v + 2],
    [d * 0.5, 8, w * 0.5],
    [3, 3, 1],
  ], 8);
  rootCanopy(s, 2, d - 2, 2, w - 2, 12, 8);
  s.prefer.lamp = (p) => (Math.hypot(p.u - e.u, p.v - e.v) < 7 ? 1.5 : 0);
  void E;
};

export const RECIPES: Readonly<Record<TemplateId, Recipe>> = {
  'topsoil.rootCellar': rootCellar,
  'topsoil.copperLode': copperLode,
  'topsoil.lampRoom': lampRoom,
  'topsoil.reliquary': reliquary,
  'topsoil.cache': cache,
  'topsoil.liftBottom': liftBottom,
  'glowroot.threshold': threshold,
  'glowroot.rootHall': rootHall,
  'glowroot.glowGallery': glowGallery,
  'glowroot.mirrorPool': mirrorPool,
  'glowroot.curtainRift': curtainRift,
  'glowroot.rootKnot': rootKnot,
};
