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
 *   - mean values stay close to the previous library so the lighting tuning still holds.
 */

/** Charcoal / blue-black base rock (slate). */
export const STONE = [0x0d1015, 0x12161c, 0x181c24, 0x1e232b, 0x252a33, 0x2d323b, 0x363b44, 0x41454d] as const;
/** Deep stone: the same family one step darker and denser. */
export const DEEP = [0x090b0f, 0x0d1014, 0x11141a, 0x161a21, 0x1b2028, 0x222730, 0x2a2f38, 0x33373f] as const;
/**
 * Weathered rock: lighter and neutral grey (never beige: the warm lantern already warms it);
 * its only warmth is the ochre deposits in its cracks.
 */
export const WEATHERED = [0x131416, 0x191a1d, 0x202124, 0x27282b, 0x2f3033, 0x37383b, 0x404144, 0x4a4b4d] as const;
/** Damp stone: the slate family, cooler and darker where water sits on it. */
export const DAMP = [0x090d11, 0x0d1217, 0x11171d, 0x161d24, 0x1b232b, 0x212a33, 0x28323c, 0x313b46] as const;
/** Wet sheen and water traces (used sparingly, on streak edges). */
export const WET_SHEEN = 0x46566a;
/** Lichen crust: muted grey-olive, a step above the rock it grows on. */
export const LICHEN = [0x1a221e, 0x212b25, 0x29352d, 0x324034, 0x3c4b3d] as const;

/** Stones that weathered out into the soil: warm-neutral, between rock and soil. */
export const PEBBLE = [0x171615, 0x1f1d1b, 0x282522, 0x312d29, 0x3b3631, 0x463f39] as const;
/** Compacted cave soil. */
export const SOIL = [0x110d0b, 0x16110e, 0x1b1512, 0x211a15, 0x281f19, 0x30251d, 0x382b21] as const;

/** Native copper and chalcopyrite: dark oxidised metal up to a warm copper lit edge. */
export const COPPER = [0x2a150c, 0x431f10, 0x632e16, 0x86401d, 0xa95628, 0xc8733a] as const;
export const COPPER_GLINT = 0xe8a46a;
/** Verdigris crust around copper: grey-green, deliberately not cyan. */
export const VERDIGRIS = [0x1d302a, 0x253d33, 0x2f4c3e, 0x3a5c49] as const;

/** Banded iron: steel-grey metallic bands, red jasper bands, ochre rust stains. */
export const IRON = [0x16171a, 0x202226, 0x2c2e33, 0x3a3d43, 0x4b4e55, 0x5e6269] as const;
export const IRON_GLINT = 0x737a83;
export const JASPER = [0x26130f, 0x341a14, 0x45221a, 0x572b20] as const;
export const RUST = 0x5b3a22;

/** Glimmer crystal body: deep teal glass. Light comes from inside, not from the paint. */
export const CRYSTAL = [0x031016, 0x05171f, 0x082029, 0x0c2b35, 0x123843, 0x1a4a56, 0x25606c, 0x347b88] as const;
export const CRYSTAL_GLOW = 0x2fb6cc;
export const CRYSTAL_EDGE = 0x8fe3ee;

/** The seal's dense plated stone. */
export const SEAL = [0x0a0c11, 0x0e1117, 0x12161d, 0x171b24, 0x1d222c, 0x242a35] as const;
export const SEAL_FLECK = 0x6f7b95;

/** Abyssal bedrock: near-black with violet undertone. */
export const BEDROCK = [0x060609, 0x09090d, 0x0c0c12, 0x100f17, 0x14131c, 0x191722, 0x1e1c28] as const;
export const ABYSS_VEIN = 0x2c2246;

/** Ancient builders' stone: finer and slightly cooler than the natural rock it was cut from. */
export const ASHLAR = [0x13161b, 0x181b21, 0x1e2128, 0x24282f, 0x2b2f37, 0x333740, 0x3c404a, 0x464b55] as const;
export const JOINT = 0x090a0d;
/** Soot-black hearth stones and their ash. */
export const SOOT = [0x0b0a0a, 0x100e0e, 0x161413, 0x1d1a18, 0x25211f, 0x2e2926, 0x37312d] as const;
export const ASH = [0x2f2c2a, 0x3b3835, 0x484440] as const;
export const EMBER = [0x4a1606, 0x7a2c0c, 0xb24a14, 0xd8722a] as const;

/** Aged timber: grey-brown, dried and soot-darkened. */
export const TIMBER = [0x130e0b, 0x19130f, 0x201813, 0x281e17, 0x30251c, 0x3a2c21, 0x443427, 0x4f3d2e] as const;
export const TIMBER_SILVER = 0x4a4540;
export const NAIL = [0x1c1b1b, 0x34302d, 0x4c3324] as const;
