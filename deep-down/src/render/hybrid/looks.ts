// The Lantern Voxel looks per space (W1-LEAD §1.2, §4; SPEC §8.3–§8.4): the cool hued fill, the rim, the haze, the
// stone tint, the emission gains and the grade numbers DepthScene hands to 1E's rig and post chain. Pure data.
//
// Rules: darks hued and never below 0.04 display (the fill carries a hue, never grey-brown); exposure 1 ± 0.15;
// saturation ≤ 1; bloom threshold ≥ 1, strength 0.15–0.25 (C11 lints `LOOKS`).

export interface SpaceLook {
  /** Cool hemispheric fill (sRGB hex) above / below, and its gain. */
  sky: number;
  ground: number;
  fillGain: number;
  /** The space's rim: the next space's accent through the far opening (direction is set per node). */
  rim: number;
  rimGain: number;
  /** A second accent (W1-LEAD §1.2: the Grotto needs a second accent and a value range). */
  accent2: number;
  /** Haze: colour, density (1/m), height-fog extra density and falloff. */
  fog: number;
  fogDensity: number;
  heightDensity: number;
  heightFalloff: number;
  /** Stone tint (multiplies the painted albedo). */
  stoneTint: number;
  /** Emission gains per glow class (glowroot, crystal, gold, ember, violet, rune). */
  glow: [number, number, number, number, number, number];
  /** The lantern's intensity in this space (1 = 1E's W1 lantern) and the shadow-side lift. */
  lantern: number;
  /** The lantern flame's core colour (sRGB; 1E deepens it to amber with distance): warm enough that the pool reads
   *  amber against the cool host stone (W1-LEAD §1.2), never white. */
  lanternColor: number;
  /** Weight of 1B's LightField bounce in this space (×1E's decode gain): the fill under the lantern, never a wash;
   *  `irrDrift` in the drift, where the crew lamp sits just behind the stand and would flatten the face. */
  irr: number;
  irrDrift: number;
  /** Grade. */
  exposure: number;
  saturation: number;
  bloomThreshold: number;
  bloomStrength: number;
  vignette: number;
}

export const LOOKS: Record<'camp' | 'topsoil' | 'glowroot' | 'rootKnot', SpaceLook> = {
  // Dusk at the Halden camp: blue-dusk sky, warm lamps. Outdoors the haze is thin (0.0035/m: 10 % at 30 m) so the
  // dusk sky (afterglow, stratus, the first stars) reads through 1E's analytic fog tail instead of a flat veil.
  camp: {
    sky: 0x5f7ea6, ground: 0x2a2620, fillGain: 0.55, rim: 0xffb36a, rimGain: 0.35, accent2: 0x9fc3e6,
    fog: 0x34405a, fogDensity: 0.0035, heightDensity: 0.0, heightFalloff: 0.4, stoneTint: 0xffffff,
    glow: [1, 1, 1, 1, 1, 1], lantern: 0.9, lanternColor: 0xffd6aa, irr: 0.8, irrDrift: 0.8, exposure: 1.0, saturation: 0.96, bloomThreshold: 1.0, bloomStrength: 0.2, vignette: 0.14,
  },
  // Topsoil Roots: mid key, blue-dusk darks, amber + sky-shaft blue accents.
  topsoil: {
    sky: 0x3c5268, ground: 0x1c1a1c, fillGain: 0.45, rim: 0x9fc3e6, rimGain: 0.4, accent2: 0xffb35c,
    fog: 0x1c222e, fogDensity: 0.014, heightDensity: 0.012, heightFalloff: 0.6, stoneTint: 0xfff6ee,
    glow: [1, 1, 1, 1, 1, 1], lantern: 0.75, lanternColor: 0xffc98e, irr: 0.38, irrDrift: 0.1, exposure: 1.0, saturation: 0.96, bloomThreshold: 1.0, bloomStrength: 0.18, vignette: 0.14,
  },
  // Glowroot Caverns: low key, green-black darks, two greens.
  glowroot: {
    sky: 0x284a48, ground: 0x10181a, fillGain: 0.42, rim: 0x9be7a8, rimGain: 0.45, accent2: 0x5fe0c0,
    fog: 0x132024, fogDensity: 0.016, heightDensity: 0.02, heightFalloff: 0.5, stoneTint: 0xf2f8f4,
    glow: [1.15, 1, 1, 1, 1, 1], lantern: 0.75, lanternColor: 0xffcf9c, irr: 0.5, irrDrift: 0.14, exposure: 1.05, saturation: 0.95, bloomThreshold: 1.0, bloomStrength: 0.22, vignette: 0.14,
  },
  // The Root Knot hall (closed in W1): Glowroot with a violet "sealed" rim.
  rootKnot: {
    sky: 0x2a3e48, ground: 0x10161a, fillGain: 0.4, rim: 0xb9a2ff, rimGain: 0.45, accent2: 0x9be7a8,
    fog: 0x161c2a, fogDensity: 0.015, heightDensity: 0.015, heightFalloff: 0.5, stoneTint: 0xf0f2f8,
    glow: [1, 1, 1, 1, 1.2, 1], lantern: 0.75, lanternColor: 0xffcf9c, irr: 0.5, irrDrift: 0.14, exposure: 1.0, saturation: 0.95, bloomThreshold: 1.0, bloomStrength: 0.2, vignette: 0.14,
  },
};

/** The look of a biome index (W1: 0 Topsoil, 1 Glowroot; deeper biomes reuse Glowroot until W2). */
export function lookOf(biome: number): SpaceLook {
  return biome <= 0 ? LOOKS.topsoil : LOOKS.glowroot;
}
