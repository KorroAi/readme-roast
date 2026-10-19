import { COURSE_PIECE, strips, type CourseLibrary, type Strip } from './courses';
import { Field2, MAT_SIZE, MatCanvas, PeriodicCells, Rng, cached, chip, cloneField, crackCurve, fbm, groove, hash2, mixHex, ramp, resolve, rngFor, wrap, wrapDelta } from './paint';
import * as P from './palette';

/**
 * Ancient masonry of a lost builder culture, laid in courses by the terrain shader (see
 * courses.ts): every masonry layer is a *course library*, a stack of one-course strips that the
 * shader picks from per 4 m piece of each course, so walls never repeat and joints follow the
 * courses of the wall, not an 8 m tile.
 *
 *   library A, coursed ashlar: dressed stones 0.8 - 3 m (a few huge ones) with drafted margins;
 *     tall courses are sometimes laid as two thin ones over a stretch (broken bond);
 *   library B, megalithic: stones 1.5 - 4.5 m with pillowed faces, slanted and joggled
 *     (L-shaped) head joints and small stones fitted into notches of the big ones.
 *
 * Joints are cut-stone joints, not grout lines: a thin dark gap, the arris above it in shadow
 * and the one below it catching the light. Time has worked on all of it: chipped corners,
 * spalled faces, hairline cracks that end at a joint, water stains under the bed joints.
 *
 * Crumbling masonry is the *same* wall (same stones, same stains) loosening: joints opened,
 * stones slipped and darkened in their beds, corners and whole stones fallen out, cracks that
 * step along the joints; only there does cold light leak through.
 */

const S = MAT_SIZE;
/** One step of the ashlar ramp in value units. */
const STEP = 1 / P.ASHLAR.length;

interface Stone {
  tone: number;
  /** Weathering (0 fresh .. 1 eroded). */
  wear: number;
  /** Dressed with a drafted margin around a rougher boss. */
  drafted: boolean;
  /** Cushioned (pillowed) face: 0 flat .. 1 strongly rounded toward the joints. */
  pillow: number;
  /** Strip the stone belongs to. */
  strip: number;
}

/** Stone id per texel (-1 = joint) for one library layer, and per-texel distance to the joints. */
interface Bond {
  lib: CourseLibrary;
  ids: Int32Array;
  stones: Stone[];
  strips: Strip[];
  /** Strip index of each row. */
  stripOf: Uint8Array;
  /** Texels to the nearest joint upward / downward / left / right (1 = next to it). */
  up: Uint8Array;
  down: Uint8Array;
  left: Uint8Array;
  right: Uint8Array;
}

class BondBuilder {
  readonly ids = new Int32Array(S * S).fill(-2);
  readonly stones: Stone[] = [];
  constructor(readonly rng: Rng) {}
  stone(strip: number, courseTone: number, o: { drafted: number; pillow: [number, number] }): number {
    const rng = this.rng;
    this.stones.push({
      tone: Math.max(0, Math.min(1, courseTone * 0.55 + rng.next() * 0.45 + (rng.chance(0.1) ? 0.22 : 0))),
      wear: rng.next(),
      drafted: rng.chance(o.drafted),
      pillow: o.pillow[0] + rng.next() * (o.pillow[1] - o.pillow[0]),
      strip,
    });
    return this.stones.length - 1;
  }
  /** Fill a rectangle (x wraps) with a stone; its right column and bottom row are the joint. */
  rect(x0: number, w: number, y0: number, h: number, id: number): void {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) this.ids[wrap(x0 + i) + (y0 + j) * S] = i === w - 1 || j === h - 1 ? -1 : id;
  }
}

/** Widths that fill exactly `total` texels, each in [lo, hi] (the last one absorbs the rest). */
function widths(rng: Rng, total: number, lo: number, hi: number, huge = 0): number[] {
  const out: number[] = [];
  let x = 0;
  while (x < total) {
    let w = rng.chance(huge) ? rng.int(Math.round(hi * 1.15), Math.round(hi * 1.5)) : rng.int(lo, hi);
    if (total - x - w < lo) w = total - x;
    out.push(w);
    x += w;
  }
  return out;
}

/**
 * Library A, coursed ashlar. Stone width ranges per course height; tall courses are sometimes
 * laid as two thin courses over one stretch (broken bond), each with its own joints.
 */
function layoutA(rng: Rng): Bond {
  const b = new BondBuilder(rng);
  const lib = strips('A');
  lib.forEach((st, si) => {
    const courseTone = rng.next();
    // Thin courses are long levelling slabs; the tall ones carry the big blocks.
    // Stones are long for their course (2:1 to 4:1), never brick-sized.
    const [lo, hi] = st.h <= 8 ? [32, 64] : st.h <= 16 ? [24, 56] : st.h <= 24 ? [28, 56] : [30, 64];
    // Each strip is two 4 m pieces, each starting with a stone and ending on a joint, so the
    // shader can lay pieces in any order (and mirrored) along a course.
    const ws = [0, 1].flatMap(() => widths(rng, COURSE_PIECE, lo, Math.min(hi, COURSE_PIECE), st.h >= 24 ? 0.12 : 0.05));
    let x = 0;
    for (const w of ws) {
      if (st.h >= 24 && w >= 40 && rng.chance(0.15)) {
        // Broken bond: two thin courses over this stretch, joints staggered.
        const a = Math.round(st.h * (0.4 + rng.next() * 0.2));
        let xx = x;
        for (const ww of widths(rng, w, 20, 40)) {
          b.rect(xx, ww, st.y0, a, b.stone(si, courseTone, { drafted: 0.3, pillow: [0, 0.1] }));
          xx += ww;
        }
        xx = x;
        for (const ww of widths(rng, w, 20, 40)) {
          b.rect(xx, ww, st.y0 + a, st.h - a, b.stone(si, courseTone, { drafted: 0.3, pillow: [0, 0.1] }));
          xx += ww;
        }
      } else b.rect(x, w, st.y0, st.h, b.stone(si, courseTone, { drafted: 0.6, pillow: [0, 0.15] }));
      x += w;
    }
  });
  return finish('A', b, lib);
}

/**
 * Library B, megalithic. Head joints run slanted (1:4 to 1:2, clean pixel steps) or joggle
 * into an L; some big stones have a small stone fitted into a notch at their foot.
 */
function layoutB(rng: Rng): Bond {
  const b = new BondBuilder(rng);
  const lib = strips('B');
  lib.forEach((st, si) => {
    const courseTone = rng.next();
    // Mostly two stones per 4 m piece (so the slanted and joggled joints show), sometimes one.
    const [lo, hi] = st.h <= 16 ? [20, 40] : st.h <= 24 ? [22, 42] : [24, 46];
    // Joint lines between stones; the piece edges (x = 0 and 64) stay straight, because the
    // shader lays 4 m pieces in any order there.
    const ws = [0, 1].flatMap(() => widths(rng, COURSE_PIECE, lo, Math.min(hi, COURSE_PIECE), 0.1));
    const bounds: Array<(y: number) => number> = [() => 0];
    const joggles: Array<{ row: number; a: number; c: number }> = [];
    let x = 0;
    for (let k = 0; k < ws.length - 1; k++) {
      x += ws[k];
      const x0 = x;
      const kind = rng.next();
      if (kind < 0.35 || x0 % COURSE_PIECE === 0) bounds.push(() => x0);
      else if (kind < 0.7) {
        const slopes = [0.25, 1 / 3, 0.5];
        const s = slopes[rng.int(0, slopes.length - 1)] * (rng.chance(0.5) ? 1 : -1);
        bounds.push((y) => x0 + Math.round(s * (y - st.h / 2)));
      } else {
        const ys = Math.round(st.h * (0.3 + rng.next() * 0.4));
        const d = (rng.chance(0.5) ? 1 : -1) * rng.int(4, 9);
        bounds.push((y) => (y < ys ? x0 : x0 + d));
        joggles.push({ row: ys - 1, a: Math.min(x0, x0 + d) - 1, c: Math.max(x0, x0 + d) - 1 });
      }
    }
    const ids = ws.map(() => b.stone(si, courseTone, { drafted: 0.08, pillow: [0.55, 1] }));
    for (let y = 0; y < st.h; y++) {
      const pos = bounds.map((f) => f(y));
      for (let k = 0; k < pos.length; k++) {
        const x1 = k + 1 < pos.length ? pos[k + 1] : S;
        for (let xx = pos[k]; xx < x1; xx++) b.ids[wrap(xx) + (st.y0 + y) * S] = xx === x1 - 1 || y === st.h - 1 ? -1 : ids[k];
      }
    }
    for (const j of joggles) for (let xx = j.a; xx <= j.c; xx++) b.ids[wrap(xx) + (st.y0 + j.row) * S] = -1;
    // Small stones fitted into a notch at the foot of some big stones.
    for (let k = 0; k < ws.length; k++) {
      // Rare, and only in tall courses (whose strips have 8 piece variants): a distinctive mark
      // in the single 1 m strip would recur every few metres along every megalithic course.
      if (st.h < 24 || ws[k] < 36 || !rng.chance(0.25)) continue;
      const rw = rng.int(8, 14);
      const rh = Math.min(st.h - 4, rng.int(7, 12));
      const start = ws.slice(0, k).reduce((a, v) => a + v, 0);
      const rx = start + rng.int(10, ws[k] - rw - 8);
      const ry = st.h - rh;
      // Only if the notch lies wholly inside this stone.
      let inside = true;
      for (let y = ry - 1; y < st.h - 1 && inside; y++) for (let xx = rx - 1; xx < rx + rw; xx++) if (b.ids[wrap(xx) + (st.y0 + y) * S] !== ids[k]) inside = false;
      if (!inside) continue;
      const small = b.stone(si, courseTone, { drafted: 0, pillow: [0.4, 0.8] });
      for (let y = ry - 1; y < st.h; y++)
        for (let xx = rx - 1; xx < rx + rw; xx++) {
          const i = wrap(xx) + (st.y0 + y) * S;
          b.ids[i] = y === ry - 1 || xx === rx - 1 || xx === rx + rw - 1 || y === st.h - 1 ? -1 : small;
        }
    }
  });
  return finish('B', b, lib);
}

function finish(lib: CourseLibrary, b: BondBuilder, list: Strip[]): Bond {
  const stripOf = new Uint8Array(S);
  list.forEach((st, si) => stripOf.fill(si, st.y0, st.y0 + st.h));
  for (let i = 0; i < S * S; i++) if (b.ids[i] === -2) b.ids[i] = -1;
  const up = new Uint8Array(S * S);
  const down = new Uint8Array(S * S);
  const left = new Uint8Array(S * S);
  const right = new Uint8Array(S * S);
  const ids = b.ids;
  for (const st of list)
    for (let x = 0; x < S; x++) {
      // The row above a strip is the bed joint of the course above it (in the world).
      let d = 0;
      for (let y = st.y0; y < st.y0 + st.h; y++) {
        const i = x + y * S;
        d = ids[i] < 0 ? 0 : d + 1;
        up[i] = Math.min(255, d);
      }
      d = 0;
      for (let y = st.y0 + st.h - 1; y >= st.y0; y--) {
        const i = x + y * S;
        d = ids[i] < 0 ? 0 : d + 1;
        down[i] = Math.min(255, d);
      }
    }
  for (let y = 0; y < S; y++) {
    // Two passes around the wrap so every run is measured from its own joint.
    let d = 64;
    for (let k = 0; k < S * 2; k++) {
      const i = (k % S) + y * S;
      d = ids[i] < 0 ? 0 : Math.min(255, d + 1);
      if (k >= S) left[i] = d;
    }
    d = 64;
    for (let k = S * 2 - 1; k >= 0; k--) {
      const i = (k % S) + y * S;
      d = ids[i] < 0 ? 0 : Math.min(255, d + 1);
      if (k < S) right[i] = d;
    }
  }
  return { lib, ids, stones: b.stones, strips: list, stripOf, up, down, left, right };
}

const bond = (lib: CourseLibrary): Bond => cached(`bond${lib}`, () => (lib === 'A' ? layoutA(rngFor('masonryBondA')) : layoutB(rngFor('masonryBondB'))));

/** Stone ids per texel (-1 = joint) of a wall library, for tests and tools. */
export function masonryBond(lib: CourseLibrary): { ids: Int32Array; strips: Strip[] } {
  const b = bond(lib);
  return { ids: b.ids, strips: b.strips };
}

interface DressOptions {
  /** Light from above baked into the arrises (walls); floors get rounded, unlit arrises. */
  topLit: boolean;
  chips: number;
  /** Hairline cracks per stone (chance). */
  cracks: number;
  /** Dished, foot-worn centres (floors). */
  worn: number;
  spalls: number;
}

/** The dressed-stone value field of a bond (deterministic for a given rng). */
function dress(rng: Rng, bd: Bond, o: DressOptions): Field2 {
  const f = new Field2();
  const bedding = fbm(rng, 4, 3, 0.5, 16); // faint horizontal bedding inside each block
  const grain = fbm(rng, 16, 2, 0.5); // 3-8 texel clusters: a finer octave quantizes into speckle
  const spallN = fbm(rng, 24, 1);
  const jointN = fbm(rng, 16, 1);
  const { ids, stones, up, down, left, right } = bd;
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = (i - x) / S;
    const id = ids[i];
    if (id < 0) {
      // Cut-stone joints, not grout lines: in long stretches the stones still meet tight (a
      // hairline only a little darker than the stone, the arrises do the drawing); elsewhere
      // the joint has opened a little, or is packed with old grit.
      const jn = jointN(x, y);
      f.h[i] = 8;
      if (jn > 0.62) f.v[i] = 0.3;
      else if (jn < 0.34) {
        f.v[i] = 0.09;
        f.code[i] = 1;
      } else {
        f.v[i] = 0.17;
        f.code[i] = 1;
      }
      continue;
    }
    const st = stones[id];
    const dU = up[i];
    const dD = down[i];
    const dL = left[i];
    const dR = right[i];
    const m = Math.min(dU, dD, dL, dR);
    const rough = 0.5 + st.wear * 0.8;
    // Pixel-art discipline: each stone sits in the middle of one ramp step, and its surface
    // noise stays under half a step, so a stone reads as one tone with drawn details (arrises,
    // margin, spalls, chips, cracks) instead of quantized two-tone camouflage blotches.
    let v = (Math.floor((0.44 + (st.tone - 0.5) * 0.32) / STEP) + 0.5) * STEP + (bedding(x, y) - 0.5) * 0.04;
    let h = 195 + (st.tone - 0.5) * 40;
    // Cut-stone arrises: the edge under a bed joint catches light, the edge above one is in shadow.
    if (o.topLit) {
      if (dU === 1) v += STEP;
      else if (dD === 1) v -= STEP;
      else if (dL === 1 || dR === 1) v -= STEP * 0.5;
    } else if (m === 1) v -= STEP * 0.6;
    if (st.drafted && m <= 2) {
      // Drafted margin: a smooth tooled band around a rougher, slightly raised boss (a change
      // of texture, not a lighter frame: a printed frame per stone reads as a tile).
    } else {
      // Kept under half a step with the bedding: isolated texels a step off alias into a
      // stipple lattice at a texel per pixel.
      v += (grain(x, y) - 0.5) * (st.drafted ? 0.05 : 0.035) * rough;
      if (st.drafted) h += 12;
    }
    if (st.pillow > 0) {
      // Cushioned face: the edges roll away into the joint (a step darker), the face swells
      // (height only: a lighter centre in a dark rim prints a framed panel on every stone).
      if (m <= 2) v -= STEP * Math.min(1, st.pillow * 1.2);
      h += st.pillow * (Math.min(m, 7) / 7) * 22;
    }
    // Foot wear shows as rounded, darker edges (above) and fewer sharp details, not as a lighter
    // dished centre: a lit centre in a dark rim prints a frame on every slab, a tile.
    if (o.worn > 0 && m === 2) v -= STEP * 0.4 * Math.min(1, o.worn);
    if (st.wear > 1 - o.spalls && m > 1 && m <= 5) {
      // Spalled edges: small recessed scars along the arrises (where frost and load break the
      // stone), two steps darker, with a lit lower rim.
      const sp = spallN(x, y);
      if (sp > 0.68) {
        v -= STEP * 1.8;
        h -= 45;
      } else if (sp > 0.62 && spallN(x, y - 1) > 0.68) v += STEP;
    }
    f.v[i] = v;
    f.h[i] = h;
  }
  // Chipped corners: where a stone's top or bottom edge meets a head joint.
  for (let i = 0; i < S * S; i++) {
    if (ids[i] < 0) continue;
    const corner = (up[i] === 1 || down[i] === 1) && (left[i] === 1 || right[i] === 1);
    if (corner && rng.chance(o.chips)) {
      const x = i % S;
      chip(f, rng, x, (i - x) / S, rng.int(2, 4));
    }
  }
  // Hairline cracks: inside one stone, ending at its joints.
  stones.forEach((st, id) => {
    if (!rng.chance(o.cracks * (0.5 + st.wear))) return;
    let k = rng.int(0, S * S - 1);
    for (let tries = 0; tries < 400 && ids[k] !== id; tries++) k = rng.int(0, S * S - 1);
    if (ids[k] !== id) return;
    const x = k % S;
    const ang = (rng.chance(0.6) ? Math.PI / 2 : 0) + (rng.next() - 0.5) * 1.1;
    const pts = crackCurve(rng, x, (k - x) / S, ang, rng.int(6, 16), 0.3, 0.1);
    groove(f, pts, { width: 1.2, depth: 0.16, lip: 0.05, shadow: 0.05, height: 30, gaps: 0.25, rng, mask: (px, py) => ids[wrap(px) + wrap(py) * S] === id });
  });
  return f;
}

/** Water stains running down from bed joints over the stone below, fading, narrowing. */
function stains(c: MatCanvas, rng: Rng, bd: Bond, amount: number): void {
  const { ids, up } = bd;
  for (let i = 0; i < S * S; i++) {
    if (ids[i] < 0 || up[i] !== 1 || !rng.chance(amount / 30)) continue;
    const x0 = i % S;
    const y0 = (i - x0) / S;
    const w = rng.int(1, 3);
    const len = rng.int(5, 22);
    const id = ids[i];
    for (let k = 0; k < len; k++) {
      const t = 1 - k / len;
      for (let d = 0; d < w; d++) {
        if (k > len * 0.6 && d === w - 1) continue; // narrows toward the end
        const j = wrap(x0 + d) + wrap(y0 + k) * S;
        if (ids[j] !== id) continue;
        c.tint(x0 + d, y0 + k, P.JOINT, 0.2 * t + 0.06);
      }
    }
  }
}

const WALL: DressOptions = { topLit: true, chips: 0.2, cracks: 0.08, worn: 0, spalls: 0.2 };

/** A wall library (dressed field + bond), built once per pass and shared with crumbling. */
function wall(lib: CourseLibrary): { f: Field2; bd: Bond } {
  const m = cached(`masonryWall${lib}`, () => {
    const bd = bond(lib);
    return { f: dress(rngFor(`masonryDress${lib}`), bd, WALL), bd };
  });
  return { f: cloneField(m.f), bd: m.bd };
}

function paintWall(c: MatCanvas, lib: CourseLibrary): void {
  const { f, bd } = wall(lib);
  resolve(c, f, P.ASHLAR, P.JOINT, 0, 0.55);
  stains(c, rngFor(`masonryStains${lib}`), bd, 0.15);
}

/** Wall faces: coursed ashlar (library A). */
export function masonry(c: MatCanvas): void {
  paintWall(c, 'A');
}

/** Wall faces where a course piece is megalithic (library B). */
export function masonryB(c: MatCanvas): void {
  paintWall(c, 'B');
}

/** Cap stones, soffits and wall tops: large plain-dressed slabs laid in rows. */
export function masonryTop(c: MatCanvas, rng: Rng): void {
  const bd = layoutA(rng);
  const f = dress(rng, bd, { topLit: false, chips: 0.35, cracks: 0.18, worn: 0.6, spalls: 0.2 });
  resolve(c, f, P.ASHLAR, P.JOINT, 0, 0.55);
}

/**
 * Floor slabs: big worn flagstones laid in rows, dished by feet, a few cracked across, grit in
 * the joints. No glow: inscriptions are placed deliberately as glyph stones.
 */
export function floorSlab(c: MatCanvas, rng: Rng): void {
  const bd = layoutA(rng);
  const f = dress(rng, bd, { topLit: false, chips: 0.4, cracks: 0.3, worn: 1.6, spalls: 0.15 });
  resolve(c, f, P.ASHLAR, P.JOINT, 0, 0.55);
  // Grit settled along the joints.
  const grit = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (bd.ids[x + y * S] >= 0 || grit(x, y) <= 0.55) continue;
      c.set(x + 1, y, mixHex(c.getHex(x + 1, y), P.ASHLAR[2], 0.5));
    }
}

/**
 * Masonry loosening: the same wall as `masonry` / `masonryB`. Joints have opened (wider and
 * darker, eaten into the arrises), some stones have slipped in their beds (an open gap above,
 * a darker face), some have lost a corner or fallen out whole (a deep void with a lit lower
 * rim and rubble in it), and cracks step along the joints. Faint cold light leaks through a
 * few opened joints (alpha = emissive mask: well under 1 % of the surface glows).
 */
function paintCrumbling(c: MatCanvas, rng: Rng, lib: CourseLibrary): void {
  const { f, bd } = wall(lib);
  const { ids, stones, up, down, left, right } = bd;
  const rubble = fbm(rng, 16, 2);
  const erode = fbm(rng, 24, 1);
  // The rubble core of the wall, seen where a facing stone has fallen out.
  const core = new PeriodicCells(rng, 26, 26, 0.9);
  const grain = fbm(rng, 16, 2);
  const area = new Int32Array(stones.length);
  for (let i = 0; i < S * S; i++) if (ids[i] >= 0) area[ids[i]]++;
  const slipped = stones.map(() => rng.chance(0.35));
  // Only stones of a modest size fall out whole (a lost megalith would read as a doorway).
  const fallen = stones.map((_, k) => !slipped[k] && area[k] < 900 && rng.chance(0.2));
  const corner = stones.map(() => (rng.chance(0.7) ? rng.int(0, 3) : -1));
  // Corner breaks: a ragged triangle missing at one corner, sized to the stone.
  const cornerSize = stones.map((_, k) => Math.min(16, 4 + Math.sqrt(area[k]) * (0.2 + rng.next() * 0.25)));
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = (i - x) / S;
    const id = ids[i];
    if (id < 0) {
      // Every joint has opened: deep, with loose grit in places.
      f.code[i] = 1;
      f.v[i] = rubble(x, y) > 0.64 ? 0.12 : 0.02;
      f.h[i] = 5;
      continue;
    }
    const dU = up[i];
    const dD = down[i];
    const dL = left[i];
    const dR = right[i];
    if (fallen[id]) {
      // The stone is gone: small rubble stones packed behind it, in the shadow of the stone
      // above, its bed below catching the light.
      f.h[i] = 4;
      if (dD === 1) {
        f.v[i] = 0.4;
        continue;
      }
      const q = core.query(x, y);
      const cell = core.cells[q.id];
      f.code[i] = q.d2 - q.d1 < 1.1 ? 1 : 0;
      f.v[i] = f.code[i] ? 0.03 : 0.2 + cell.r * 0.14 + (wrapDelta(cell.y, y) < 0 ? 0.05 : -0.02) - (dU <= 3 ? 0.1 : 0);
      continue;
    }
    const cs = cornerSize[id] * (0.75 + 0.5 * erode(x, y));
    const cc = corner[id];
    if (cc >= 0) {
      const a = cc & 1 ? dR : dL;
      const b = cc & 2 ? dD : dU;
      if (a + b < cs) {
        // Broken off: a rough, fresher (lighter) fracture surface, recessed; its edge is lit
        // where the break faces up (top corners) and shadowed where it faces down.
        f.h[i] = 60;
        if (a + b > cs - 1.5) f.v[i] += cc & 2 ? -0.11 : 0.09;
        else f.v[i] += 0.02 + (grain(x, y) - 0.5) * 0.22;
        continue;
      }
    }
    // Arrises eaten back into the joint: the joint looks wider.
    const m = Math.min(dU, dD, dL, dR);
    if (m === 1 && erode(x, y) > 0.28) {
      f.code[i] = 1;
      f.v[i] = 0.08;
      f.h[i] = 6;
      continue;
    }
    if (slipped[id]) {
      // Slipped in its bed: the joint above has opened (ragged, not a ruled bar) and the face
      // has tilted out of the light toward its foot.
      if (dU === 1 && erode(x * 2, y) > 0.3) {
        f.code[i] = 1;
        f.v[i] = 0.07;
        f.h[i] = 5;
        continue;
      }
      f.v[i] -= 0.03 + Math.min(dU, 24) * 0.004;
    }
    f.v[i] += (rubble(x, y) - 0.5) * 0.08 - 0.05;
  }
  // Cracks stepping along the joints: open a run of head joint, then the bed joint below it.
  for (let k = 0; k < 10; k++) {
    let x = rng.int(0, S - 1);
    let y = rng.int(0, S - 1);
    for (let step = 0; step < 40; step++) {
      const i = wrap(x) + wrap(y) * S;
      if (ids[i] < 0) {
        f.v[i] = 0.01;
        f.code[i] = 1;
        // widen into the stone beside it
        const j = wrap(x + 1) + wrap(y) * S;
        if (ids[j] >= 0 && rng.chance(0.5)) {
          f.v[j] = 0.05;
          f.code[j] = 1;
        }
      }
      // Follow the joint network: prefer down, then sideways along a bed.
      const below = ids[wrap(x) + wrap(y + 1) * S];
      if (below < 0) y++;
      else if (ids[wrap(x + 1) + wrap(y) * S] < 0) x++;
      else if (ids[wrap(x - 1) + wrap(y) * S] < 0) x--;
      else y++;
    }
  }
  // Cracks through the stones: the wall is breaking, not only its joints.
  for (let k = 0; k < 18; k++) {
    const pts = crackCurve(rng, rng.next() * S, rng.next() * S, Math.PI / 2 + (rng.next() - 0.5) * 1.6, rng.int(10, 28), 0.35, 0.12);
    groove(f, pts, { width: 2.2, depth: 0.26, lip: 0.08, shadow: 0.08, height: 10, gaps: 0.1, rng });
  }
  resolve(c, f, P.ASHLAR, P.JOINT, 0, 0.6);
  stains(c, rngFor(`masonryStains${lib}`), bd, 0.3);
  c.a.fill(0); // alpha is the emissive mask here
  // Cold light leaks through a few short stretches of the opened joints (about 0.2 % of texels),
  // scattered over every course of the library.
  for (let k = 0; k < 14; k++) {
    let i = rng.int(0, S * S - 1);
    for (let tries = 0; tries < 200 && ids[i] >= 0; tries++) i = rng.int(0, S * S - 1);
    if (ids[i] >= 0) continue;
    let x = i % S;
    const y = (i - x) / S;
    const len = rng.int(2, 4);
    for (let n = 0; n < len && ids[wrap(x) + y * S] < 0; n++, x++) c.set(x, y, 0x2fa9bd, 110 + rng.next() * 90);
  }
}

export function crumbling(c: MatCanvas, rng: Rng): void {
  paintCrumbling(c, rng, 'A');
}

export function crumblingB(c: MatCanvas, rng: Rng): void {
  paintCrumbling(c, rng, 'B');
}

/** Hearth stones: soot-black, heat-cracked, ash packed in the joints, a few live embers. */
export function hearth(c: MatCanvas, rng: Rng): void {
  const stones = new PeriodicCells(rng, 13, 13, 0.8);
  const n = fbm(rng, 16, 2);
  const emberN = fbm(rng, 16, 1);
  const size = S / 13;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = stones.query(x, y);
      const cell = stones.cells[q.id];
      const e = q.d2 - q.d1;
      if (e < 1.6) {
        // Ash in the joints; very rarely a live ember (emissive).
        const em = emberN(x, y);
        if (em > 0.85 && hash2(x, y) < 0.45) c.set(x, y, ramp(P.EMBER, (em - 0.85) * 6, x, y, 0), 120 + (em - 0.85) * 600);
        else c.set(x, y, ramp(P.ASH, n(x, y), x, y, 0), 0);
        continue;
      }
      const dx = wrapDelta(cell.x, x) / size;
      const dy = wrapDelta(cell.y, y) / size;
      let v = 0.36 + (cell.r - 0.5) * 0.25 - ((cell.r2 - 0.5) * dx + (cell.r3 - 0.4) * dy) * 0.4 + (n(x, y) - 0.5) * 0.15;
      if (e < 2.6) v += dx + dy < 0 ? 0.08 : -0.1;
      c.set(x, y, ramp(P.SOOT, v, x, y, 0), 0);
    }
  // Heat cracks: short, dark.
  for (let k = 0; k < 14; k++) {
    const pts = crackCurve(rng, rng.next() * S, rng.next() * S, rng.next() * Math.PI * 2, rng.int(3, 7), 0.4, 0.2);
    for (const [x, y] of pts) if (c.a[c.idx(x, y)] === 0) c.set(x, y, P.SOOT[0]);
  }
}
