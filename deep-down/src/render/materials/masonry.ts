import { Field2, MAT_SIZE, MatCanvas, PeriodicCells, Rng, blob, chip, crackPath, engrave, fbm, hash2, mixHex, ramp, resolve, rngFor, wrap, wrapDelta } from './paint';
import * as P from './palette';

/**
 * Ancient masonry of a lost builder culture. Walls are designed, not tiled: a pseudo-isodomic
 * rhythm of tall and short courses (about 1.2 m and 0.55 m), long stones of 1.5 - 3 m with
 * staggered joints, and dressed faces with a drafted margin around a slightly rougher boss.
 * Time has worked on all of it: corners are chipped, some stones have spalled, water has
 * left dark stains below the joints with a faint pale bloom at their ends.
 *
 * Crumbling masonry is the *same* wall (same stones, same stains) breaking apart, so a
 * crumbling patch continues the wall beside it; only there does cold light leak through.
 */

const S = MAT_SIZE;

interface Stone {
  x0: number;
  y0: number;
  w: number;
  h: number;
  tone: number;
  /** Dressed with a drafted margin (most stones) or plain. */
  drafted: boolean;
  /** Weathering of this stone (0 fresh .. 1 eroded). */
  wear: number;
}

interface CourseRule {
  /** Course heights, cycled (each entry a [min, max] range in texels). */
  rhythm: Array<[number, number]>;
  /** Stone width range per course kind (same index as rhythm). */
  widths: Array<[number, number]>;
  drafted: number;
}

/** Courses following the rhythm, filling the period exactly; joints never stack with the course above. */
function layoutCourses(rng: Rng, rule: CourseRule): Stone[] {
  const stones: Stone[] = [];
  const courses: Array<{ h: number; kind: number }> = [];
  let total = 0;
  let k = 0;
  while (total < S) {
    const kind = k % rule.rhythm.length;
    const [lo, hi] = rule.rhythm[kind];
    let h = rng.int(lo, hi);
    if (S - total - h < rule.rhythm[(k + 1) % rule.rhythm.length][0]) h = S - total;
    courses.push({ h, kind });
    total += h;
    k++;
  }
  let y = 0;
  let prevJoints: number[] = [];
  for (const course of courses) {
    // Stones of one course were cut from the same bed: they share a tone, with small variation.
    const courseTone = rng.next();
    const [wlo, whi] = rule.widths[course.kind];
    const joints: number[] = [];
    const start = rng.next() * S;
    let x = start;
    for (;;) {
      let w = rng.int(wlo, whi);
      // Keep at least 4 texels (25 cm) between this joint and any joint of the course above.
      for (let tries = 0; tries < 6; tries++) {
        const jx = wrap(x + w);
        if (!prevJoints.some((p) => Math.abs(wrapDelta(p, jx)) < 4)) break;
        w += 3;
      }
      if (x + w - start > S - wlo) {
        joints.push(wrap(start));
        break;
      }
      x += w;
      joints.push(wrap(x));
    }
    // Stones between consecutive joints.
    const sorted = [...joints].sort((a, b) => a - b);
    for (let j = 0; j < sorted.length; j++) {
      const x0 = sorted[j];
      const x1 = j + 1 < sorted.length ? sorted[j + 1] : sorted[0] + S;
      const tone = Math.max(0, Math.min(1, courseTone * 0.6 + rng.next() * 0.4 + (rng.chance(0.12) ? 0.25 : 0)));
      stones.push({ x0: Math.round(x0), y0: y, w: Math.max(3, Math.round(x1) - Math.round(x0)), h: course.h, tone, drafted: rng.chance(rule.drafted), wear: rng.next() });
    }
    prevJoints = sorted;
    y += course.h;
  }
  return stones;
}

interface AshlarOptions {
  pal: readonly number[];
  chips: number;
  cracks: number;
  /** Dished, foot-worn centres (floors). */
  worn: number;
  spalls: number;
}

/** The dressed-stone value field (deterministic for a given rng). */
function ashlarField(rng: Rng, stones: Stone[], o: AshlarOptions): Field2 {
  const f = new Field2();
  // Faint bedding inside each block (horizontal), not round blotches.
  const face = fbm(rng, 4, 3, 0.5, 16);
  const grain = fbm(rng, 32, 2, 0.5);
  const spallN = fbm(rng, 16, 2);
  const jointN = fbm(rng, 16, 1);
  for (const st of stones) {
    const rough = 0.5 + st.wear * 0.8;
    for (let j = 0; j < st.h; j++)
      for (let i = 0; i < st.w; i++) {
        const x = st.x0 + i;
        const y = st.y0 + j;
        const k = f.i(x, y);
        if (i === st.w - 1 || j === st.h - 1) {
          // Tight ancient joint: dark, but filled with old mortar and grit in places.
          f.v[k] = jointN(x, y) > 0.55 ? 0.22 : 0.12;
          f.h[k] = 8;
          f.code[k] = 1;
          continue;
        }
        let v = 0.4 + (st.tone - 0.5) * 0.26 + (face(x, y) - 0.5) * 0.14;
        let h = 195 + (st.tone - 0.5) * 40;
        // Arris: lit top / left edge, shadowed bottom / right edge.
        if (j === 0 || i === 0) v += 0.1;
        else if (j === st.h - 2 || i === st.w - 2) v -= 0.09;
        const m = Math.min(i, j, st.w - 2 - i, st.h - 2 - j);
        if (st.drafted && st.w > 8 && st.h > 6) {
          // Drafted margin: a smoother band 2 texels wide around a rougher, slightly raised boss.
          if (m <= 2) v += (grain(x, y) - 0.5) * 0.03 + 0.015;
          else {
            v += (grain(x, y) - 0.5) * 0.1 * rough;
            h += 12;
          }
        } else v += (grain(x, y) - 0.5) * 0.08 * rough;
        if (o.worn > 0) {
          // Foot-worn: smoother and lighter toward the middle, rounded off at the border.
          const cx = Math.abs(i / (st.w - 1) - 0.5) * 2;
          const cy = Math.abs(j / (st.h - 1) - 0.5) * 2;
          v += (1 - Math.max(cx, cy)) * 0.05 * o.worn - (m < 2 ? 0.04 : 0);
        }
        // Spalled patches on weathered stones: a recessed rough scar with a lit lower rim.
        if (st.wear > 1 - o.spalls && m > 1) {
          const sp = spallN(x, y);
          if (sp > 0.62) {
            v -= 0.1 + (grain(x, y) - 0.5) * 0.08;
            h -= 45;
          } else if (sp > 0.58) v += 0.06;
        }
        f.v[k] = v;
        f.h[k] = h;
      }
    // Chipped corners.
    for (const [cx, cy] of [[st.x0, st.y0], [st.x0 + st.w - 2, st.y0], [st.x0, st.y0 + st.h - 2], [st.x0 + st.w - 2, st.y0 + st.h - 2]] as const)
      if (rng.chance(o.chips)) chip(f, rng, cx, cy, rng.int(2, 4));
  }
  for (let k = 0; k < o.cracks; k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * Math.PI * 2, rng.int(10, 26), 0.2, 0.1);
    engrave(f, pts, { depth: 0.22, lip: 0.06, shadow: 0.06, height: 15 });
  }
  return f;
}

/** Water stains below horizontal joints, with a pale lime bloom at the end of the longest. */
function stains(c: MatCanvas, rng: Rng, stones: Stone[], amount: number): void {
  for (const st of stones) {
    if (!rng.chance(amount)) continue;
    const x0 = st.x0 + rng.int(1, Math.max(1, st.w - 3));
    const w = rng.int(1, 3);
    const len = rng.int(6, 26);
    const y0 = st.y0;
    for (let k = 0; k < len; k++) {
      const t = 1 - k / len;
      for (let d = 0; d < w; d++) {
        if (k > len * 0.6 && d === w - 1) continue; // narrows toward the end
        c.tint(x0 + d, y0 + k, P.JOINT, 0.22 * t + 0.08);
      }
    }
    if (len > 18 && rng.chance(0.5)) for (let d = 0; d < w + 1; d++) c.tint(x0 + d, y0 + len, 0x4f545d, 0.3);
  }
}

const WALL: CourseRule = { rhythm: [[18, 24], [10, 13], [20, 26], [9, 12]], widths: [[30, 58], [16, 34], [28, 54], [16, 30]], drafted: 0.6 };
const WALL_OPTS: AshlarOptions = { pal: P.ASHLAR, chips: 0.35, cracks: 3, worn: 0, spalls: 0.25 };

function masonryBase(rng: Rng): { f: Field2; stones: Stone[] } {
  const stones = layoutCourses(rng, WALL);
  return { f: ashlarField(rng, stones, WALL_OPTS), stones };
}

export function masonry(c: MatCanvas, rng: Rng): void {
  const { f, stones } = masonryBase(rng);
  resolve(c, f, P.ASHLAR, P.JOINT, 0);
  stains(c, rng, stones, 0.3);
}

/** Cap stones and wall tops: large square-ish slabs, plain dressed. */
export function masonryTop(c: MatCanvas, rng: Rng): void {
  const stones = layoutCourses(rng, { rhythm: [[22, 36], [18, 30]], widths: [[24, 46], [22, 40]], drafted: 0.2 });
  const f = ashlarField(rng, stones, { pal: P.ASHLAR, chips: 0.4, cracks: 5, worn: 0.6, spalls: 0.2 });
  resolve(c, f, P.ASHLAR, P.JOINT, 0);
}

/**
 * Floor slabs: big worn flagstones (1.2 - 3 m), dished by feet, a few cracked across, grit in
 * the joints. No glow: inscriptions are placed deliberately as glyph stones, never printed
 * on every slab.
 */
export function floorSlab(c: MatCanvas, rng: Rng): void {
  const stones = layoutCourses(rng, { rhythm: [[20, 34], [16, 28], [22, 40]], widths: [[22, 48], [20, 40], [26, 52]], drafted: 0 });
  const f = ashlarField(rng, stones, { pal: P.ASHLAR, chips: 0.45, cracks: 9, worn: 1.6, spalls: 0.15 });
  resolve(c, f, P.ASHLAR, P.JOINT, 0);
  // Grit settled along the joints.
  const grit = fbm(rng, 16, 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (c.height(x, y) > 20) continue;
      if (grit(x, y) > 0.55) {
        c.set(x + 1, y, mixHex(c.getHex(x + 1, y), P.ASHLAR[2], 0.5));
      }
    }
}

/**
 * Masonry breaking apart: the same wall as `masonry`, then cracked through, some stones
 * sunk and darkened, corners broken off, and faint cold light leaking from the deepest cracks
 * (alpha = emissive mask: well under 1 % of the surface glows).
 */
export function crumbling(c: MatCanvas, rng: Rng): void {
  const base = rngFor('masonry');
  const { f, stones } = masonryBase(base);
  const rubble = fbm(rng, 16, 2);
  const holeEdge = fbm(rng, 32, 1);
  for (const st of stones) {
    // The wall is loosening: every joint has opened, stones are darker and rougher, some have
    // sunk (open joint above), and many have lost a chunk of their face: a deep ragged hole
    // with a lit lower rim.
    const sunk = rng.chance(0.35);
    for (let j = 0; j < st.h; j++)
      for (let i = 0; i < st.w; i++) {
        const x = st.x0 + i;
        const y = st.y0 + j;
        const k = f.i(x, y);
        if (i >= st.w - 2 || j >= st.h - 2) {
          if (i === st.w - 1 || j === st.h - 1 || rubble(x, y) > 0.45) {
            f.v[k] = 0.02;
            f.code[k] = 1;
            f.h[k] = 5;
          }
          continue;
        }
        f.v[k] += (rubble(x, y) - 0.5) * 0.18 - (sunk ? 0.13 : 0.06);
      }
    if (rng.chance(0.75)) {
      const r = Math.min(st.h, st.w) * (0.4 + rng.next() * 0.3);
      const cx = st.x0 + rng.int(1, Math.max(1, st.w - 3));
      const cy = st.y0 + (rng.chance(0.5) ? 1 : st.h - 3);
      blob(cx, cy, r, holeEdge, (px, py, t, _dx, dy) => {
        const k = f.i(px, py);
        if (f.code[k] === 1) return;
        if (t > 0.8 && dy > 0) f.v[k] += 0.16; // lit lower rim of the break
        else {
          f.v[k] = (rubble(px, py) > 0.6 ? 0.14 : 0) + (holeEdge(px * 2, py * 2) - 0.5) * 0.08;
          f.h[k] = 30;
        }
      });
    }
  }
  for (let k = 0; k < 18; k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * Math.PI * 2, rng.int(12, 34), 0.3, 0.12);
    engrave(f, pts, { depth: 0.32, lip: 0.08, shadow: 0.08, height: 10, widen: 0.4, rng });
  }
  for (let k = 0; k < 28; k++) chip(f, rng, rng.int(0, S - 1), rng.int(0, S - 1), rng.int(3, 7));
  resolve(c, f, P.ASHLAR, P.JOINT, 0);
  stains(c, base, stones, 0.3);
  c.a.fill(0); // alpha is the emissive mask here
  // Cold light leaks through a few stretches of the opened joints (well under 1 % of texels).
  const leak = fbm(rng, 8, 1);
  for (const st of stones) {
    if (!rng.chance(0.18)) continue;
    const horizontal = rng.chance(0.6);
    const len = horizontal ? Math.min(st.w, rng.int(6, 16)) : Math.min(st.h, rng.int(4, 10));
    const x0 = horizontal ? st.x0 + rng.int(0, Math.max(0, st.w - len)) : st.x0 + st.w - 1;
    const y0 = horizontal ? st.y0 + st.h - 1 : st.y0 + rng.int(0, Math.max(0, st.h - len));
    for (let k = 0; k < len; k++) {
      const x = horizontal ? x0 + k : x0;
      const y = horizontal ? y0 : y0 + k;
      const l = leak(x, y);
      if (l > 0.42 && hash2(x, y) < 0.75) c.set(x, y, 0x2fa9bd, 120 + (l - 0.42) * 260);
      else c.set(x, y, 0x081418);
    }
  }
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
  for (let k = 0; k < 14; k++) for (const [x, y] of crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * Math.PI * 2, rng.int(3, 7), 0.4, 0.2)) if (c.a[c.idx(x, y)] === 0) c.set(x, y, P.SOOT[0]);
}
