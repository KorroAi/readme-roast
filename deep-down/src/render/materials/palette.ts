/**
 * The terrain palette: every material family quantizes onto one of these ramps (sRGB,
 * dark -> light). Shared rules keep the families coherent:
 *
 *   - rock ramps run from blue-black shadows to neutral grey lights (cool shadows, never a
 *     saturated blue), so chipped lips read as stone dust rather than ice;
 *   - warm hues exist only where geology or people put them (oxidised metal, soil, timber,
 *     embers) and stay desaturated; the saturated amber of the camp comes from light, not paint;
 *   - cyan exists in exactly two places: crystal and the glyph ink. Verdigris is a muted
 *     grey-green, lichen a muted grey-olive, so neither competes with the progression colour;
 *   - ramps are ALBEDOS, not display colours: the light model (lantern, lamps, zone fill, fog)
 *     makes the image dark, the paint does not. Rock and ashlar mids sit around 0.05-0.10 linear
 *     luminance and their lightest steps around 0.18-0.21 (real slate and dressed stone), so the
 *     lantern can model form; the darkest steps keep 0.01-0.02 for crevices. Round 3 raised every
 *     ramp 2-3x in linear (metals and crystal less) with the family differences kept.
 */

/** Charcoal / blue-black base rock (slate). */
export const STONE = [0x151920, 0x1d232b, 0x272d38, 0x323944, 0x3e4553, 0x4c5461, 0x5c6472, 0x717784] as const;
/** Deep stone: the same family one step darker and denser. */
export const DEEP = [0x0f1217, 0x161a1f, 0x1d2129, 0x252b35, 0x2e3541, 0x3a424f, 0x48505e, 0x595f6c] as const;
/**
 * Weathered rock: lighter and neutral grey (never beige: the warm lantern already warms it);
 * its only warmth is the ochre deposits in its cracks.
 */
export const WEATHERED = [0x1b1d21, 0x24262c, 0x2d3036, 0x373a41, 0x43464d, 0x4f525a, 0x5d6068, 0x6c7077] as const;
/** Damp stone: the slate family, cooler and darker where water sits on it. */
export const DAMP = [0x0f141a, 0x161c23, 0x1c252d, 0x252f38, 0x2d3945, 0x384553, 0x445363, 0x546475] as const;
/** Wet sheen and water traces (used sparingly, on streak edges). */
export const WET_SHEEN = 0x5d728b;
/** Lichen crust: muted grey-olive, a step above the rock it grows on. */
export const LICHEN = [0x2a352f, 0x35433a, 0x404c44, 0x4c5a4e, 0x5a6a5b] as const;

/** Stones that weathered out into the soil: warm-neutral, between rock and soil. */
export const PEBBLE = [0x252423, 0x322f2c, 0x403b37, 0x4e4843, 0x5f5750, 0x71665d] as const;
/** Compacted cave soil. */
// Round 2: a little less red (lantern-lit camp soil read as one saturated orange).
export const SOIL = [0x1b1917, 0x231f1c, 0x2b2623, 0x342e29, 0x3e3731, 0x4a4139, 0x564c43] as const;

/** Native copper and chalcopyrite: dark oxidised metal up to a warm copper lit edge. */
export const COPPER = [0x3d2115, 0x5b2c19, 0x803e1f, 0xa65126, 0xc96832, 0xe58444] as const;
export const COPPER_GLINT = 0xffb978;
/** Verdigris crust around copper: grey-green, deliberately not cyan. */
export const VERDIGRIS = [0x2b453d, 0x37574a, 0x466d5a, 0x56856b] as const;

/** Banded iron: steel-grey metallic bands, red jasper bands, ochre rust stains. */
export const IRON = [0x24252a, 0x313439, 0x41434a, 0x53575f, 0x686c75, 0x7f848d] as const;
export const IRON_GLINT = 0x8f97a2;
export const JASPER = [0x3a201a, 0x4f2a22, 0x68362b, 0x834434] as const;
export const RUST = 0x7e5232;

/** Glimmer crystal body: deep teal glass. Light comes from inside, not from the paint. */
export const CRYSTAL = [0x030c11, 0x051219, 0x081a22, 0x0b232d, 0x10303b, 0x173f4b, 0x21525e, 0x2f6a77] as const;
export const CRYSTAL_GLOW = 0x2fb6cc;
export const CRYSTAL_EDGE = 0x8fe3ee;

/** The seal's dense plated stone. */
export const SEAL = [0x11141b, 0x181c25, 0x20252f, 0x292f3c, 0x343c4b, 0x414b5c] as const;
export const SEAL_FLECK = 0x8290ae;

/** Abyssal bedrock: near-black with violet undertone. */
export const BEDROCK = [0x0b0b0f, 0x101015, 0x14141c, 0x1a1923, 0x201f2b, 0x272534, 0x2f2c3d] as const;
export const ABYSS_VEIN = 0x3c2f5d;

/** Ancient builders' stone: finer and slightly cooler than the natural rock it was cut from. */
export const ASHLAR = [0x1d2128, 0x252931, 0x2e323c, 0x383e47, 0x434955, 0x515764, 0x606675, 0x717988] as const;
export const JOINT = 0x0e121c;
/** Soot-black hearth stones and their ash. */
export const SOOT = [0x131212, 0x1b1818, 0x23211f, 0x2e2a27, 0x3a3431, 0x47403c, 0x554d47] as const;
export const ASH = [0x433f3d, 0x534f4b, 0x655f5a] as const;
export const EMBER = [0x4a1606, 0x7a2c0c, 0xb24a14, 0xd8722a] as const;

/** Aged timber: grey-brown, dried and soot-darkened. */
export const TIMBER = [0x201915, 0x29201b, 0x342821, 0x403227, 0x4d3d2f, 0x5c4838, 0x6d5541, 0x7f634d] as const;
export const TIMBER_SILVER = 0x67615a;
export const NAIL = [0x282626, 0x46413d, 0x654532] as const;
