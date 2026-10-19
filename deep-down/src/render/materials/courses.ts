import { MAT_DENSITY, MAT_SIZE } from './paint';

/**
 * Dressed stone is laid in courses, and the courses are computed in world space by the terrain
 * shader, not printed by an 8 m texture tile.
 *
 * Each masonry layer (wall faces, cap stones, floor slabs, crumbling masonry) is a *course
 * library*: a stack of horizontal strips, each one course of stones (0.5 - 2 m tall) that wraps
 * along x and starts with a joint at x = 0. The shader (`courseGlsl`) splits every face into
 * courses (2 m blocks of four 0.5 m slots, a bed joint at the block edge and at each slot edge
 * by chance, more often on whole metres so plinths and cornices tend to land on a joint), gives
 * each course its own offset along the wall, cuts it into 4 m pieces that start on a joint, and
 * draws each piece from a strip of the right height: which strip, which half of it, mirrored or
 * not, and which of two stone vocabularies, so no wall shows a repeat:
 *
 *   A  coursed ashlar: pseudo-isodomic courses, stones 0.8 - 3 m with drafted margins, broken
 *      bond (a tall course sometimes laid as two thin ones over a stretch);
 *   B  megalithic: large stones (1.5 - 4.5 m), pillowed faces, slanted and joggled (L-shaped)
 *      head joints, the polygonal work of the oldest builders.
 *
 * The mix of A and B is decided per region of the world (about 24 m x 16 m cells, hashed into
 * three vocabularies: coursed, mixed and megalithic), per 4 m piece of each course, so a
 * region boundary follows stone joints course by course instead of a straight line.
 *
 * Painters and shader share the strip tables below; the stone texture of a piece is a 1:1
 * texel copy of its strip, so the 16 texel/m pixel grid stays aligned in world space.
 */

/** Course heights (texels) of the strips stacked in each library layer, from the top row down. */
export const COURSE_LIBRARIES = {
  A: [8, 16, 16, 24, 32, 32],
  B: [16, 24, 24, 32, 32],
} as const;

export type CourseLibrary = keyof typeof COURSE_LIBRARIES;

/**
 * Strips are laid along a course in pieces of this many texels (4 m): each piece starts with a
 * stone and ends on a joint, and the shader picks every piece independently (which strip of the
 * right height, which half, mirrored or not), so a course never repeats at a fixed period.
 */
export const COURSE_PIECE = 64;

/** One course slot in metres (courses are 1 - 4 slots tall). */
export const COURSE_SLOT = 0.5;
const SLOT_TEXELS = COURSE_SLOT * MAT_DENSITY;

/**
 * Each 2 m block is one of four patterns: one 2 m course, two 1 m courses (chance `metre`), or a
 * 1.5 m course with a thin 0.5 m levelling course above or below it (chance `thin`). Thin
 * courses never come in pairs: stacked thin courses read as a brick bond. Walls get about 40 %
 * 2 m, 45 % 1 m, 11 % 1.5 m and 4 % 0.5 m courses; horizontal faces (paving rows, cap stones)
 * their own mix.
 */
export const COURSE_PATTERN = { wall: { metre: 0.45, thin: 0.25 }, flat: { metre: 0.42, thin: 0.15 } } as const;

/**
 * Region vocabularies: chance that a 4 m piece of a course (1 m or taller) is megalithic (B)
 * rather than coursed ashlar (A), and the size of the region cells (m).
 */
export const VOCABULARY_MEGALITHIC = [0.12, 0.5, 0.85] as const;
export const VOCABULARY_CELL = [24, 16, 24] as const;

export interface Strip {
  y0: number;
  h: number;
}

/** The strips of a library layer, top to bottom; they fill the layer exactly. */
export function strips(lib: CourseLibrary): Strip[] {
  const out: Strip[] = [];
  let y0 = 0;
  for (const h of COURSE_LIBRARIES[lib]) {
    out.push({ y0, h });
    y0 += h;
  }
  if (y0 !== MAT_SIZE) throw new Error(`course library ${lib} fills ${y0} rows, not ${MAT_SIZE}`);
  return out;
}

/** A GLSL float literal (exact for the short decimals used here). */
const f1 = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : `${+v.toFixed(4)}`);

/** GLSL: row of the strip of a library for a course of `n` slots (`alt` picks between two). */
function rowExpr(lib: CourseLibrary): string {
  const all = strips(lib);
  const parts: string[] = [];
  for (let n = 1; n <= 4; n++) {
    const rows = all.filter((s) => s.h === n * SLOT_TEXELS).map((s) => s.y0);
    if (!rows.length) continue;
    const e = rows.length === 1 ? f1(rows[0]) : `(alt ? ${f1(rows[1])} : ${f1(rows[0])})`;
    parts.push(`n < ${f1(n + 0.5)} ? ${e}`);
  }
  return `${parts.join(' : ')} : -1.0`;
}

/** GLSL: whether a library has a strip for a course of `n` slots. */
function hasExpr(lib: CourseLibrary): string {
  const heights = new Set(strips(lib).map((s) => s.h / SLOT_TEXELS));
  return [1, 2, 3, 4].filter((n) => heights.has(n)).map((n) => `abs(n - ${f1(n)}) < 0.5`).join(' || ');
}

/**
 * The course mapping for the terrain fragment shader. `layers` are the material layer indices.
 * Defines: `masonryCourse(st, face, plane)` and `courseSample(layer, crs, gx, gy)` (expects
 * `sharpUv` and `SOFT_CUT` from the terrain shader).
 * Cost per masonry fragment: 4 integer hashes and about 60 ALU operations, no extra fetch
 * (the one material fetch becomes a textureGrad with the continuous world-space gradients, so
 * mip selection does not jump at course joints).
 */
export function courseGlsl(layers: { masonry: number; masonryB: number; crumbling: number; crumblingB: number }): string {
  const pw = [COURSE_PATTERN.wall.metre, COURSE_PATTERN.wall.thin].map((p) => f1(p * 1024));
  const pf = [COURSE_PATTERN.flat.metre, COURSE_PATTERN.flat.thin].map((p) => f1(p * 1024));
  const [v0, v1, v2] = VOCABULARY_MEGALITHIC.map((p) => (p * 1024).toFixed(1));
  const [cx, cy, cz] = VOCABULARY_CELL.map(f1);
  return /* glsl */ `
highp uint ddHash(highp uint x) {
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}

// World position of a point given in a face's texture orientation (inverse of worldUv).
vec3 faceToWorld(int face, float plane, float s, float t) {
  if (face == 0) return vec3(plane, -t, -s);
  if (face == 1) return vec3(plane, -t, s);
  if (face == 2) return vec3(s, plane, t);
  if (face == 3) return vec3(s, plane, -t);
  if (face == 4) return vec3(s, -t, plane);
  return vec3(-s, -t, plane);
}

// Region vocabulary: chance (x1024) that a piece of course is megalithic.
float masonryVocab(vec3 p) {
  ivec3 c = ivec3(floor(p / vec3(${cx}, ${cy}, ${cz}))) + 4096;
  highp uint h = ddHash(uint(c.x) * 0x8da6b343u ^ uint(c.y) * 0xd8163841u ^ uint(c.z) * 0xcb1ab31fu);
  highp uint v = h % 3u;
  return v == 0u ? ${v0} : v == 1u ? ${v1} : ${v2};
}

// Course coordinates of a dressed-stone face. st: metres in texture orientation (worldUv x
// period), plane: the face's lattice plane. Returns x = texel along the course, y = texel row
// inside it, z = its strip row in library A, w = its strip row in library B (< 0: use A).
vec4 masonryCourse(vec2 st, int face, float plane) {
  float b = floor(st.y * 0.5);
  float k = floor((st.y - b * 2.0) * 2.0);
  bool horiz = face == 2 || face == 3;
  highp uint hb = ddHash(uint(int(b) + 65536) * 2654435761u ^ (horiz ? 0x5bd1e995u : 0x1b873593u));
  vec2 pj = horiz ? vec2(${pf[0]}, ${pf[1]}) : vec2(${pw[0]}, ${pw[1]});
  // Bed joints at slot edges 1, 2, 3 of the block: 2 m | 1 + 1 | 0.5 + 1.5 | 1.5 + 0.5.
  bool j2 = float((hb >> 10u) & 1023u) < pj.x;
  bool thin = !j2 && float(hb & 1023u) < pj.y;
  bool j1 = thin && ((hb >> 20u) & 1u) == 0u;
  bool j3 = thin && !j1;
  float lo = k > 2.5 && j3 ? 3.0 : k > 1.5 && j2 ? 2.0 : k > 0.5 && j1 ? 1.0 : 0.0;
  float hi = k < 0.5 && j1 ? 1.0 : k < 1.5 && j2 ? 2.0 : k < 2.5 && j3 ? 3.0 : 4.0;
  float n = hi - lo;
  highp uint hc = ddHash(hb ^ (uint(lo) * 0x27d4eb2fu + uint(face) * 0x165667b1u));
  float off = float(hc & 127u);
  float u = st.x * ${f1(MAT_DENSITY)} + off;
  float seg = floor(u * (1.0 / ${f1(COURSE_PIECE)}));
  highp uint hs = ddHash(hc ^ (uint(int(seg) + 65536) * 0x9e3779b9u));
  bool alt = ((hs >> 10u) & 1u) == 1u;
  // Which 4 m piece of the strip, and mirrored or not (the piece's last column, its joint,
  // stays in place so a mirrored piece still starts with a stone and ends on a joint).
  float piece = float((hs >> 11u) & 1u) * ${f1(COURSE_PIECE)};
  float pu = u - seg * ${f1(COURSE_PIECE)};
  if (((hs >> 12u) & 1u) == 1u && pu < ${f1(COURSE_PIECE - 1)}) pu = max(${f1(COURSE_PIECE - 1)} - 0.001 - pu, 0.0);
  // The vocabulary of this piece comes from the region around its middle.
  float sc = (seg * ${f1(COURSE_PIECE)} + ${f1(COURSE_PIECE / 2)} - off) * (1.0 / ${f1(MAT_DENSITY)});
  float pB = masonryVocab(faceToWorld(face, plane, sc, b * 2.0 + (lo + hi) * ${f1(COURSE_SLOT / 2)}));
  bool useB = (${hasExpr('B')}) && float(hs & 1023u) < pB;
  float rowA = ${rowExpr('A')};
  float rowB = ${rowExpr('B')};
  return vec4(piece + pu, (st.y - b * 2.0 - lo * ${f1(COURSE_SLOT)}) * ${f1(MAT_DENSITY)}, rowA, useB ? rowB : -1.0);
}

// One masonry layer sampled at its course coordinates; walls and crumbling switch to their
// megalithic twin layer where the course piece is megalithic.
vec4 courseSample(int layer, vec4 crs, vec2 gx, vec2 gy) {
  bool b = crs.w >= 0.0 && (layer == ${layers.masonry} || layer == ${layers.crumbling});
  int l = b ? (layer == ${layers.masonry} ? ${layers.masonryB} : ${layers.crumblingB}) : layer;
  vec2 uv = vec2(crs.x, (b ? crs.w : crs.z) + crs.y) * (1.0 / ${f1(MAT_SIZE)});
  // Crisp cut-stone texels (sharp bilinear: sharpUv in terrainMaterial.ts).
  return textureGrad(uMat, vec3(sharpUv(uv, gx, gy, SOFT_CUT), float(l)), gx, gy);
}
`;
}
