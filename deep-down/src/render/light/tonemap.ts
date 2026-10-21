// The filmic tone map (W1-LEAD §4.8): AgX (Troy Sobotka's, with the minimal polynomial fit of the log2 contrast
// curve) and a restrained look (power and saturation near 1: no boosted colour, SPEC §8.3). The GLSL and a JS twin
// that the unit tests check (monotonic, mid grey near 0.18 display-linear, hot lights roll toward warm white, black
// stays black, no channel clip below 16× mid grey).

export const AGX_GLSL = /* glsl */ `
// AgX: an inset into a log2 domain, a sigmoid, an outset. Hues stay put as values rise; very hot lights roll to white.
const mat3 AGX_IN = mat3(
  0.842479062253094, 0.0423282422610123, 0.0423756549057051,
  0.0784335999999992, 0.878468636469772, 0.0784336,
  0.0792237451477643, 0.0791661274605434, 0.879142973793104);
const mat3 AGX_OUT = mat3(
  1.19687900512017, -0.0528968517574562, -0.0529716355144438,
  -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
  -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
vec3 agxCurve(vec3 x) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}
// look.x power (contrast), look.y saturation. Returns the display-encoded value: AgX's outset is already a 2.2-gamma
// encoding (close to sRGB above the deepest darks, which it lifts a little: never crushed), so there is no
// decode-then-encode round trip.
vec3 agxDisplay(vec3 c, vec2 look) {
  const float MIN_EV = -12.47393;
  const float MAX_EV = 4.026069;
  c = AGX_IN * max(c, vec3(0.0));
  c = clamp(log2(max(c, vec3(1e-10))), MIN_EV, MAX_EV);
  c = (c - MIN_EV) / (MAX_EV - MIN_EV);
  c = agxCurve(c);
  c = pow(max(c, vec3(0.0)), vec3(look.x));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = l + look.y * (c - l);
  return clamp(AGX_OUT * c, 0.0, 1.0);
}
`;

const IN = [
  [0.842479062253094, 0.0423282422610123, 0.0423756549057051],
  [0.0784335999999992, 0.878468636469772, 0.0784336],
  [0.0792237451477643, 0.0791661274605434, 0.879142973793104],
];
const OUT = [
  [1.19687900512017, -0.0528968517574562, -0.0529716355144438],
  [-0.0980208811401368, 1.15190312990417, -0.0980434501171241],
  [-0.0990297440797205, -0.0989611768448433, 1.15107367264116],
];

/** GLSL mat3(a..i) is column-major: column j = the j-th triple. m × v. */
function mul(m: number[][], v: number[]): number[] {
  return [0, 1, 2].map((r) => m[0][r] * v[0] + m[1][r] * v[1] + m[2][r] * v[2]);
}

const curve = (x: number) => {
  const x2 = x * x;
  const x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
};

/** The JS twin of `agxDisplay()`: the display-encoded value the resolve writes. */
export function agxDisplay(rgb: [number, number, number], look: [number, number] = TONE_LOOK): [number, number, number] {
  return agx(rgb, look).map((v) => Math.pow(v, 1 / 2.2)) as [number, number, number];
}

/** AgX to display-linear (the display-encoded value decoded with 2.2): tests compare it with scene-linear values. */
export function agx(rgb: [number, number, number], look: [number, number] = TONE_LOOK): [number, number, number] {
  const MIN = -12.47393;
  const MAX = 4.026069;
  let c = mul(IN, rgb.map((v) => Math.max(0, v)));
  c = c.map((v) => (Math.min(MAX, Math.max(MIN, Math.log2(Math.max(v, 1e-10)))) - MIN) / (MAX - MIN));
  c = c.map(curve).map((v) => Math.pow(Math.max(0, v), look[0]));
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  c = c.map((v) => l + look[1] * (v - l));
  c = mul(OUT, c);
  return c.map((v) => Math.min(1, Math.max(0, Math.pow(Math.max(0, v), 2.2)))) as [number, number, number];
}

/** The look: AgX's base plus contrast and a little saturation back (AgX desaturates as values rise): between its
 *  neutral base and its "punchy" look, so the lantern pool reads amber against cool stone. */
export const TONE_LOOK: [number, number] = [1.22, 1.18];
