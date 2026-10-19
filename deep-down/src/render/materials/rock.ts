import { Field2, MAT_SIZE, MatCanvas, PeriodicCells, PeriodicNoise, Rng, beginPaintCache, cached, chip, cloneField, crackCurve, crackPath, endPaintCache, fbm, groove, hash2, mixHex, resolve, rngFor, wrap, wrapDelta, type Pt } from './paint';
import * as P from './palette';

/**
 * Geology: ancient dark stone, deep stone, weathered rock, damp stone, the dense seal stone
 * and abyssal bedrock.
 *
 * Walls are painted as rock is built: folded beds of varying thickness, bedding-plane partings
 * with a lit lip and a shadowed underside, joints that cross a bed and stop at the next parting,
 * a few long fractures through several beds, chipped flakes along the edges, and conchoidal
 * facets inside each block. Floors are worn bedding surfaces: broad plates, broken cracks and
 * grit that collects in them. All texel colours come from one palette ramp per family.
 */

const S = MAT_SIZE;
const TAU = Math.PI * 2;

export interface RockStyle {
  pal: readonly number[];
  crack: number;
  /** Bed thickness range in texels (16 = 1 m). */
  beds: [number, number];
  bedTone: number;
  /** Folding of the beds: amplitude in texels and waves per 8 m period. */
  fold: number;
  folds: number;
  /** Joint spacing (texels) and the chance that a bed is jointed at all. */
  joints: [number, number];
  jointChance: number;
  /** Facet cells across the texture (chipped, conchoidal faces) and their shading strength. */
  facets: number;
  facetStrength: number;
  /** Long fractures crossing several beds. */
  fractures: number;
  /** Clustered grain amplitude (2-4 texel clusters; never single-pixel speckle). */
  grain: number;
  /** Chance that a bed is finely laminated. */
  laminae: number;
  chips: number;
  /** Mean value (0..1) and macro variation. */
  base: number;
  macro: number;
  /** Height: mean and spread (0..255). Softer rock is lower, so harder rock overhangs it. */
  height: number;
  heightSpread: number;
}

export interface RockMap {
  f: Field2;
  /** Bed coordinate (texels, strata-following, 0..S) and bed index per texel. */
  bedY: Float32Array;
  bed: Uint8Array;
  thick: number[];
  bedStart: number[];
  fractures: Pt[][];
}

export const STONE_SIDE: RockStyle = {
  pal: P.STONE, crack: 0x07080b, beds: [9, 28], bedTone: 0.13, fold: 5, folds: 1, joints: [22, 64], jointChance: 0.24,
  facets: 7, facetStrength: 0.1, fractures: 2, grain: 0.06, laminae: 0.25, chips: 30, base: 0.53, macro: 0.08, height: 150, heightSpread: 80,
};
export const DEEP_SIDE: RockStyle = {
  pal: P.DEEP, crack: 0x050608, beds: [14, 38], bedTone: 0.11, fold: 3, folds: 1, joints: [22, 64], jointChance: 0.4,
  facets: 6, facetStrength: 0.12, fractures: 2, grain: 0.05, laminae: 0.1, chips: 22, base: 0.54, macro: 0.08, height: 165, heightSpread: 70,
};
export const WEATHERED_SIDE: RockStyle = {
  pal: P.WEATHERED, crack: 0x0b0a0a, beds: [5, 15], bedTone: 0.13, fold: 3, folds: 2, joints: [16, 44], jointChance: 0.45,
  facets: 9, facetStrength: 0.1, fractures: 4, grain: 0.07, laminae: 0.55, chips: 40, base: 0.52, macro: 0.08, height: 115, heightSpread: 80,
};
export const BEDROCK_SIDE: RockStyle = {
  pal: P.BEDROCK, crack: 0x030304, beds: [20, 44], bedTone: 0.08, fold: 2, folds: 1, joints: [24, 64], jointChance: 0.35,
  facets: 6, facetStrength: 0.13, fractures: 3, grain: 0.05, laminae: 0, chips: 14, base: 0.52, macro: 0.2, height: 170, heightSpread: 60,
};

/** Build the rock structure of a wall. Every random draw happens here, so the same rng gives the same rock. */
export function rockField(rng: Rng, st: RockStyle): RockMap {
  const f = new Field2();
  const macro = fbm(rng, 4, 3, 0.55);
  const grain = fbm(rng, 32, 2, 0.5);
  const wob = fbm(rng, 8, 2);
  const jitter = new PeriodicNoise(rng, 16, 16);
  const partingN = new PeriodicNoise(rng, 16, 8);
  const foldN = new PeriodicNoise(rng, 4, 4);
  const phase = rng.next() * TAU;
  // Mineral grains: a few round clusters of 2-3 texels (Worley cells, not a thresholded noise,
  // which leaves single texels and plus-shaped peaks that alias into a stipple).
  const grains = new PeriodicCells(rng, 32, 32, 0.95);
  const speckMask = new Int8Array(S * S);
  for (const gc of grains.cells) {
    if (gc.r >= st.grain) continue;
    const r = 0.9 + gc.r2 * 0.9;
    const sign = gc.r3 > 0.45 ? 1 : -1;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const px = Math.round(gc.x) + dx;
        const py = Math.round(gc.y) + dy;
        if ((px - gc.x) ** 2 + (py - gc.y) ** 2 < r * r) speckMask[wrap(px) + wrap(py) * S] = sign;
      }
  }

  // Beds of varying thickness filling the period exactly.
  const thick: number[] = [];
  let total = 0;
  while (total < S) {
    let t = rng.int(st.beds[0], st.beds[1]);
    if (S - total - t < st.beds[0]) t = S - total;
    thick.push(t);
    total += t;
  }
  const bedStart: number[] = [];
  const bedOfRow = new Uint8Array(S);
  let y0 = 0;
  thick.forEach((t, b) => {
    bedStart.push(y0);
    for (let k = 0; k < t; k++) bedOfRow[y0 + k] = b;
    y0 += t;
  });
  const bedTone = thick.map(() => (rng.next() - 0.5) * st.bedTone);
  const bedHard = thick.map(() => rng.next());
  const laminated = thick.map(() => rng.chance(st.laminae));
  const partingOpen = thick.map(() => 0.58 + rng.next() * 0.26);
  // Joints: near-vertical cracks inside a bed, ending at its partings (a few stop short).
  const joints = thick.map((t) => {
    const list: Array<{ x: number; tilt: number; from: number; to: number }> = [];
    if (!rng.chance(st.jointChance)) return list;
    const xStart = rng.next() * S;
    let x = xStart;
    for (;;) {
      x += rng.int(st.joints[0], st.joints[1]);
      if (x - xStart > S - st.joints[0] * 0.6) break;
      const partial = rng.chance(0.5);
      list.push({ x: wrap(x), tilt: (rng.next() - 0.5) * 0.7, from: partial ? rng.next() * t * 0.5 : 0, to: partial ? t - rng.next() * t * 0.5 : t });
    }
    return list;
  });
  const facets = new PeriodicCells(rng, st.facets, Math.round(st.facets * 1.25), 0.9);
  const cellSize = S / st.facets;

  // Pixel-art discipline: each bed sits in the middle of one ramp step and the noise inside it
  // stays under half a step, so beds read as clean bands and facets as defined plates, not as
  // quantized camouflage blotches.
  const step = 1 / st.pal.length;
  const bedBase = thick.map((_, b) => (Math.floor((st.base + bedTone[b] * 1.6 + (bedHard[b] - 0.5) * 0.05) / step) + 0.5) * step);
  const bedY = new Float32Array(S * S);
  const bedIdx = new Uint8Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const fold = Math.sin((x / S) * TAU * st.folds + phase) * st.fold + (foldN.at(x, 0) - 0.5) * st.fold * 1.4;
      const yy = wrap(y - fold + (wob(x, y) - 0.5) * 2.4);
      const bed = bedOfRow[Math.floor(yy)];
      const dy = yy - bedStart[bed];
      bedY[i] = yy;
      bedIdx[i] = bed;
      const m = macro(x, y);
      // Facets are stretched along the beds and fade out toward their borders, so they read as
      // broad conchoidal faces, not as a polygon network (craquelure / dried mud).
      const q = facets.query(x, y, 0.3, 1);
      const cell = facets.cells[q.id];
      const ddx = wrapDelta(cell.x, x) / (cellSize * 1.8);
      const ddy = wrapDelta(cell.y, y) / cellSize;
      const fade = Math.min(1, (q.d2 - q.d1) / 5);
      const facet = ((-(cell.r - 0.5) * ddx - (cell.r2 - 0.5) * ddy) * 1.1 + (cell.r3 - 0.5) * 0.6) * fade;
      const facetStep = facet > 0.26 ? step : facet < -0.3 ? -step : 0;
      // Grain as defined pixel clusters: lighter mineral grains and darker pits, a step apart.
      const g = grain(x, y);
      const speck = speckMask[i] * step;
      let v = bedBase[bed] + ((m - 0.5) * st.macro + (g - 0.5) * st.grain) * 0.6 + facetStep + speck;
      if (laminated[bed] && Math.floor(dy) % 3 === 2) v -= step * 0.9;
      let h = st.height + (bedHard[bed] - 0.5) * st.heightSpread * 0.7 + facet * st.heightSpread * 0.35 + (m - 0.5) * st.heightSpread * 0.4;
      let code = 0;
      // Bedding-plane parting at the top of each bed, broken where the beds are welded.
      const open = partingN.at(x, bed * 16) - partingOpen[bed];
      if (dy < 1 && open > 0) {
        code = 1;
        v -= 0.2;
        h = 16;
      } else if (dy < 2.5) {
        // The top of each bed is a small ledge that catches the light (strongest where the
        // parting is open); the bottom of the bed above overhangs it in shadow.
        code = 2;
        v += (open > -0.15 ? 0.1 : 0.05) * (dy < 1.5 ? 1 : 0.5);
        h += 12;
      } else if (thick[bed] - dy < 1.5) {
        code = 3;
        v -= open > -0.15 ? 0.08 : 0.04;
      }
      if (code !== 1)
        for (const j of joints[bed]) {
          if (dy < j.from || dy > j.to) continue;
          const jn = jitter.at(j.x, y);
          const xj = j.x + j.tilt * dy + (jn - 0.5) * 2.2;
          const d = wrapDelta(xj, x);
          const shut = jitter.at(j.x + 40, y * 2) < 0.45; // a joint is not open along its whole length
          if (d > -0.5 && d <= 0.5) {
            if (shut) v -= 0.06;
            else {
              code = 1;
              v -= 0.2;
              h = 20;
              break;
            }
          } else if (d > 0.5 && d <= 1.5) {
            // the joint's far wall faces the light
            code = 2;
            v += shut ? 0.03 : 0.08;
          } else if (d > -1.5 && d <= -0.5) {
            code = 3;
            v -= shut ? 0.03 : 0.07;
          }
        }
      f.v[i] = v;
      f.h[i] = h;
      f.code[i] = code;
    }

  // Long fractures: most run with the bedding (low angle), the odd one crosses several beds
  // steeply. Carved grooves that taper and close up, not drawn lines.
  const fractures: Pt[][] = [];
  for (let k = 0; k < st.fractures; k++) {
    const steep = k % 2 === 1;
    const ang = (steep ? (rng.chance(0.5) ? 1 : -1) * (0.95 + rng.next() * 0.45) : (rng.next() - 0.5) * 0.5) + (rng.chance(0.5) ? 0 : Math.PI);
    const pts = crackCurve(rng, rng.next() * S, rng.next() * S, ang, rng.int(30, 80), 0.14, 0.05);
    groove(f, pts, { width: steep ? 1.6 : 2, depth: 0.2, lip: 0.1, shadow: 0.08, height: 22, gaps: 0.2, rng });
    fractures.push(pts.map(([x, y]) => [Math.round(x), Math.round(y)] as Pt));
  }
  // Chipped flakes along partings and joints.
  const cracks: number[] = [];
  for (let i = 0; i < S * S; i++) if (f.code[i] === 1) cracks.push(i);
  for (let k = 0; k < st.chips && cracks.length; k++) {
    const i = cracks[rng.int(0, cracks.length - 1)];
    chip(f, rng, (i % S) + 1, Math.floor(i / S) + 1, rng.int(2, 4));
  }
  return { f, bedY, bed: bedIdx, thick, bedStart, fractures };
}

export interface FloorStyle {
  pal: readonly number[];
  crack: number;
  /** Plate cells across the texture (worn bedding plates of 1-2 m). */
  plates: number;
  plateTone: number;
  /** Share of plate borders that are open cracks. */
  crackShare: number;
  /** Density of small stones / grit collected near the cracks. */
  grit: number;
  fractures: number;
  chips: number;
  base: number;
  macro: number;
  grain: number;
  height: number;
  heightSpread: number;
}

export const STONE_TOP: FloorStyle = { pal: P.STONE, crack: 0x07080b, plates: 6, plateTone: 0.14, crackShare: 0.14, grit: 0.2, fractures: 1, chips: 10, base: 0.5, macro: 0.06, grain: 0.07, height: 140, heightSpread: 70 };
export const DEEP_TOP: FloorStyle = { pal: P.DEEP, crack: 0x050608, plates: 5, plateTone: 0.12, crackShare: 0.13, grit: 0.16, fractures: 1, chips: 8, base: 0.5, macro: 0.06, grain: 0.07, height: 150, heightSpread: 60 };
export const WEATHERED_TOP: FloorStyle = { pal: P.WEATHERED, crack: 0x0b0a0a, plates: 7, plateTone: 0.15, crackShare: 0.18, grit: 0.28, fractures: 2, chips: 12, base: 0.5, macro: 0.06, grain: 0.08, height: 110, heightSpread: 70 };

export interface FloorMap {
  f: Field2;
  /** Distance to the nearest plate border (texels), for overlays that follow the cracks. */
  edge: Float32Array;
}

/** A worn rock floor: broad plates, broken cracks, grit collected in the lows. */
export function floorField(rng: Rng, st: FloorStyle): FloorMap {
  const f = new Field2();
  const macro = fbm(rng, 4, 3, 0.55);
  const grain = fbm(rng, 32, 2, 0.5);
  const crackN = fbm(rng, 8, 2);
  const plates = new PeriodicCells(rng, st.plates, st.plates, 0.95);
  const grit = new PeriodicCells(rng, 32, 32, 0.95);
  const cellSize = S / st.plates;
  const edge = new Float32Array(S * S);
  // One ramp step for the floor, a step up or down for some plates, noise under half a step.
  const step = 1 / st.pal.length;
  const base = (Math.floor(st.base / step) + 0.5) * step;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const m = macro(x, y);
      const q = plates.query(x, y, 1, 1);
      const cell = plates.cells[q.id];
      const e = q.d2 - q.d1;
      edge[i] = e;
      const ddx = wrapDelta(cell.x, x) / cellSize;
      // A bedding-plane floor is one tone (the shader's macro variation and the light model it);
      // its character comes from grit, joint grooves and grain clusters, not from plate tones,
      // which draw a polygon network (dried mud) once quantized.
      const fade = Math.min(1, e / 4);
      const g = grain(x, y);
      let v = base + ((m - 0.5) * st.macro + (g - 0.5) * st.grain) * 0.6 + ((cell.r - 0.5) * st.plateTone * 0.25 - (cell.r2 - 0.5) * ddx * 0.02) * fade;
      let h = st.height + (cell.r - 0.5) * st.heightSpread * 0.6 * fade + (m - 0.5) * st.heightSpread * 0.5;
      let code = 0;
      const cn = crackN(x, y);
      if (e < 1.1 && cn < st.crackShare * 0.35) {
        // A few plate borders have opened: short shallow cracks.
        code = 1;
        v -= 0.12;
        h = 25;
      }
      // Grit and small stones gather near the borders (2-3 texel stones with a lit top).
      if (code === 0) {
        const near = Math.max(0, 1 - e / 7);
        const g = grit.query(x, y);
        const gc = grit.cells[g.id];
        if (gc.r < st.grit * (0.35 + near) && g.d1 < 1.25 + gc.r2) {
          const lit = wrapDelta(gc.x, x) + wrapDelta(gc.y, y) < 0;
          v += lit ? 0.13 : 0.02;
          h = 175 + gc.r2 * 50;
          code = lit ? 2 : 0;
        } else if (gc.r < st.grit * (0.35 + near) && g.d1 < 2.4 + gc.r2) {
          v -= 0.05; // contact shadow around the stone
        }
      }
      f.v[i] = v;
      f.h[i] = h;
      f.code[i] = code;
    }
  // A bedding-plane floor cracks along joint sets roughly at right angles (as a limestone
  // pavement does): long, nearly straight grooves that taper and close up in places.
  const theta = rng.next() * Math.PI;
  for (let set = 0; set < 2; set++) {
    const a = theta + set * (Math.PI / 2 + (rng.next() - 0.5) * 0.4);
    for (let k = 0; k < st.fractures; k++) {
      const pts = crackCurve(rng, rng.next() * S, rng.next() * S, a + (rng.next() - 0.5) * 0.2, rng.int(26, 64), 0.06, 0.02);
      groove(f, pts, { width: 1.5, depth: 0.12, lip: 0.09, shadow: 0.06, height: 25, gaps: 0.3, rng });
    }
  }
  const cracks: number[] = [];
  for (let i = 0; i < S * S; i++) if (f.code[i] === 1) cracks.push(i);
  for (let k = 0; k < st.chips && cracks.length; k++) {
    const i = cracks[rng.int(0, cracks.length - 1)];
    chip(f, rng, (i % S) + 1, Math.floor(i / S) + 1, rng.int(2, 3));
  }
  return { f, edge };
}

// ---------------------------------------------------------------------------------------
// Host rock shared between layers

/**
 * Damp stone and the ore layers are painted on the *same* rock as plain slate / deep slate,
 * so they continue it seamlessly. The host is always built from the named layer's own random
 * stream (rngFor(name)) and cached for one generateMaterials() pass, so it is computed once.
 */
export const beginHostCache = beginPaintCache;
export const endHostCache = endPaintCache;

export function hostRock(name: 'stoneSide' | 'deepSide'): RockMap {
  const m = cached(name, () => rockField(rngFor(name), name === 'stoneSide' ? STONE_SIDE : DEEP_SIDE));
  return { ...m, f: cloneField(m.f) };
}

export function hostFloor(name: 'stoneTop' | 'deepTop'): FloorMap {
  const m = cached(name, () => floorField(rngFor(name), name === 'stoneTop' ? STONE_TOP : DEEP_TOP));
  return { ...m, f: cloneField(m.f) };
}

// ---------------------------------------------------------------------------------------
// Painters (the plain rock painters take their structure from the named host stream)

export function stoneSide(c: MatCanvas): void {
  resolve(c, hostRock('stoneSide').f, P.STONE, STONE_SIDE.crack);
}
export function stoneTop(c: MatCanvas): void {
  resolve(c, hostFloor('stoneTop').f, P.STONE, STONE_TOP.crack);
}
export function deepSide(c: MatCanvas): void {
  resolve(c, hostRock('deepSide').f, P.DEEP, DEEP_SIDE.crack);
}
export function deepTop(c: MatCanvas): void {
  resolve(c, hostFloor('deepTop').f, P.DEEP, DEEP_TOP.crack);
}

/**
 * Weathered rock: thinner, more fractured beds that erode back behind the harder stone, with
 * mineral deposits where water ran through the cracks: ochre iron staining bleeding down from
 * partings and fractures, and thin pale calcite veins.
 */
export function weatheredSide(c: MatCanvas, rng: Rng): void {
  const m = rockField(rng, WEATHERED_SIDE);
  // Honeycomb weathering (tafoni) in a few soft beds: clustered 2-3 texel pits.
  const softBeds = m.thick.map(() => rng.chance(0.3));
  for (let k = 0; k < 700; k++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    const i = x + y * S;
    if (!softBeds[m.bed[i]]) continue;
    const r = rng.chance(0.4) ? 2 : 1;
    for (let dy = 0; dy <= r; dy++)
      for (let dx = 0; dx <= r; dx++) {
        if (dx === r && dy === r) continue;
        const j = m.f.i(x + dx, y + dy);
        if (m.f.code[j] === 1) continue;
        m.f.v[j] -= 0.13;
        m.f.h[j] -= 40;
      }
  }
  resolve(c, m.f, P.WEATHERED, WEATHERED_SIDE.crack);
  deposits(c, rng, m.f.code, true);
}
export function weatheredTop(c: MatCanvas, rng: Rng): void {
  const m = floorField(rng, WEATHERED_TOP);
  resolve(c, m.f, P.WEATHERED, WEATHERED_TOP.crack);
  deposits(c, rng, m.f.code, false);
}

/**
 * Ochre iron staining inside a few cracks (a short bleed below them on walls) and thin calcite
 * veins. The rock itself stays neutral grey: under the amber lantern a broad warm stain turns the
 * whole surface tan, so the ochre is kept to the cracks, where it reads as mineral, not as paint.
 */
function deposits(c: MatCanvas, rng: Rng, code: Uint8Array, side: boolean): void {
  const patch = fbm(rng, 4, 2);
  const OCHRE = mixHex(P.WEATHERED[3], 0x7a5a36, 0.6);
  for (let i = 0; i < S * S; i++) {
    if (code[i] !== 1) continue;
    const x = i % S;
    const y = Math.floor(i / S);
    const p = patch(x, y);
    if (p < 0.7) continue;
    const strength = Math.min(1, (p - 0.7) * 5);
    c.tint(x, y, OCHRE, 0.45 * strength);
    const len = side ? Math.round(1 + strength * 3) : 0;
    for (let k = 1; k <= len; k++) c.tint(x, y + k, OCHRE, (1 - k / (len + 1)) * 0.2 * strength);
  }
  // Calcite: thin, slightly raised pale veins, broken in places.
  const CALCITE = mixHex(P.WEATHERED[7], 0xd4d8da, 0.3);
  for (let k = 0; k < (side ? 2 : 1); k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(24, 60), 0.18, 0.05);
    for (const [x, y] of pts) {
      if (rng.chance(0.18)) continue;
      c.tint(x, y, CALCITE, 0.45);
      c.setHeight(x, y, Math.max(c.height(x, y), 190));
    }
  }
}

/**
 * Damp stone: the slate's own rock (identical structure, so a damp patch and the dry wall
 * beside it are one surface), darkened by seeping water, with vertical water traces, a
 * restrained wet sheen along their edges, and lichen crusts that stand slightly proud.
 */
export function dampSide(c: MatCanvas, rng: Rng): void {
  const m = hostRock('stoneSide');
  const seep = fbm(rng, 24, 2, 0.5, 2); // vertical streaks (more cells across x than y)
  const wet = fbm(rng, 4, 2);
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    const s = seep(x, y);
    // Water darkens the rock (we stay on the damp ramp: same structure, deeper values).
    m.f.v[i] -= 0.05 + Math.max(0, s - 0.5) * 0.28 + (wet(x, y) - 0.5) * 0.08;
  }
  resolve(c, m.f, P.DAMP, STONE_SIDE.crack);
  // Water traces: thin lines running straight down from crack texels; sheen on the lit edge.
  for (let i = 0; i < S * S; i++) {
    if (m.f.code[i] !== 1) continue;
    const x = i % S;
    const y = Math.floor(i / S);
    if (seep(x, y) < 0.56 || !rng.chance(0.35)) continue;
    const len = rng.int(4, 18);
    for (let k = 1; k <= len; k++) {
      const yy = y + k;
      c.tint(x, yy, 0x070a0e, 0.35);
      if (k > 1 && k < len - 1 && (k + x) % 5 === 0) c.tint(x - 1, yy, P.WET_SHEEN, 0.45);
    }
  }
  lichen(c, rng, m.f.code, true);
}
export function dampTop(c: MatCanvas, rng: Rng): void {
  const m = hostFloor('stoneTop');
  const pool = fbm(rng, 6, 2);
  for (let i = 0; i < S * S; i++) {
    const x = i % S;
    const y = Math.floor(i / S);
    const p = pool(x, y);
    m.f.v[i] -= 0.06 + Math.max(0, p - 0.55) * 0.35;
    if (p > 0.62) m.f.h[i] = Math.min(m.f.h[i], 70); // standing water sits in the lows
  }
  resolve(c, m.f, P.DAMP, STONE_TOP.crack);
  // A thin restrained sheen where a puddle meets the rock, facing the light.
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const p = pool(x, y);
      if (p > 0.62 && pool(x - 1, y - 1) <= 0.62 && (x + y) % 3 !== 0) c.tint(x, y, P.WET_SHEEN, 0.5);
    }
  lichen(c, rng, m.f.code, false);
}

/** Lichen and moss crusts in clumps (never scattered dots): muted grey-olive, raised. */
function lichen(c: MatCanvas, rng: Rng, code: Uint8Array, side: boolean): void {
  const edge = fbm(rng, 32, 1);
  const clumps = new PeriodicCells(rng, 7, 7, 0.95);
  for (const cl of clumps.cells) {
    // Tops get few, small crusts: a lichen-covered top reads as a moss block.
    if (cl.r > (side ? 0.45 : 0.2)) continue;
    const r = 1.5 + cl.r2 * (side ? 4.5 : 3.5);
    // A few satellites around each clump.
    const n = 1 + Math.floor(cl.r3 * 4);
    for (let k = 0; k < n; k++) {
      const cx = cl.x + (rng.next() - 0.5) * r * 3;
      const cy = cl.y + (rng.next() - 0.5) * r * (side ? 1.6 : 3);
      const rr = k === 0 ? r : r * (0.3 + rng.next() * 0.4);
      const R = Math.ceil(rr + 2);
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const px = Math.round(cx + dx);
          const py = Math.round(cy + dy);
          const d = Math.sqrt(dx * dx + dy * dy * (side ? 1.8 : 1));
          const lim = rr * (0.7 + 0.6 * edge(px, py));
          if (d > lim) continue;
          const i = wrap(px) + wrap(py) * S;
          if (code[i] === 1 && rng.chance(0.5)) continue; // cracks stay partly open
          const t = d / lim;
          const hv = hash2(px, py);
          const tone = t > 0.8 ? 3 : t < 0.4 && hv < 0.18 ? 4 : hv < 0.45 ? 2 : 1;
          c.set(px, py, mixHex(c.getHex(px, py), P.LICHEN[tone], side ? 0.65 : 0.5), Math.max(c.height(px, py), 165 + (1 - t) * 50));
        }
    }
  }
}

/** The seal: dense, plated stone with pale mineral flecks, clearly not ordinary rock. */
export function sealStone(c: MatCanvas, rng: Rng): void {
  const f = new Field2();
  const plates = new PeriodicCells(rng, 7, 6, 0.5);
  const n = fbm(rng, 8, 3);
  const g = fbm(rng, 32, 1);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = x + y * S;
      const q = plates.query(x, y, 1, 1.4);
      const cell = plates.cells[q.id];
      const e = q.d2 - q.d1;
      let v = 0.42 + (cell.r - 0.5) * 0.18 + (n(x, y) - 0.5) * 0.22 + (g(x, y) - 0.5) * 0.05;
      let h = 160 + cell.r * 40;
      if (e < 1.2) {
        f.code[i] = 1;
        v -= 0.35;
        h = 10;
      } else if (e < 2.4) {
        // Chamfer: lit toward the upper left, dark toward the lower right.
        const lit = wrapDelta(cell.x, x) + wrapDelta(cell.y, y) < 0;
        v += lit ? -0.1 : 0.12;
      }
      f.v[i] = v;
      f.h[i] = h;
    }
  resolve(c, f, P.SEAL, 0x040507, 0);
  // Flecks as 2-texel clusters, sparse.
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, S - 1);
    const y = rng.int(0, S - 1);
    c.set(x, y, P.SEAL_FLECK);
    c.set(x + (rng.chance(0.5) ? 1 : 0), y + 1, mixHex(P.SEAL_FLECK, P.SEAL[3], 0.5));
  }
}

/** Abyssal bedrock: near-black massive rock with thin, sparse violet veins. */
export function bedrock(c: MatCanvas, rng: Rng): void {
  const m = rockField(rng, BEDROCK_SIDE);
  resolve(c, m.f, P.BEDROCK, BEDROCK_SIDE.crack);
  for (let k = 0; k < 4; k++) {
    const pts = crackPath(rng, rng.next() * S, rng.next() * S, rng.next() * TAU, rng.int(30, 70), 0.25, 0.06);
    for (const [x, y] of pts) if (!rng.chance(0.2)) c.tint(x, y, P.ABYSS_VEIN, 0.8);
  }
}
