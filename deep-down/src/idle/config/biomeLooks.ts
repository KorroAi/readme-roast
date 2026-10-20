// Biome looks (SPEC §11.2, docs/idle/LOOK.md): the atmosphere, the section light, bloom, the grade, the rock
// ramps and the Vista of each biome. Hex values are sRGB. BiomeLook (src/render/descent/BiomeLook.ts) blends
// the two looks nearest the camera's depth; src/render/look.ts paints the section from the ramps.
// Owner: 2D (the HD look, W2). Pure data: no Three.js. B reads looks, never writes them.

/** Section pattern styles (src/render/look.ts). */
export const SECTION_STYLE = {
  strata: 0,
  soft: 1,
  hard: 2,
  ore: 3,
  glow: 4,
  gem: 5,
  wood: 6,
  masonry: 7,
  glass: 8,
  metal: 9,
  bone: 10,
  chest: 11,
  organic: 12,
  fibrous: 13,
} as const;
export type SectionStyle = keyof typeof SECTION_STYLE;

/**
 * One block's section look: a 5-stop albedo ramp (crevice, shadow, mid, light, highlight; CRITIQUE B7) and
 * the pattern that walks it. Albedos, not display colours: the light model makes the image.
 */
export interface SlotLook {
  stops: readonly [number, number, number, number, number];
  style: SectionStyle;
  /** Pattern scale (1 = the default feature size; 0.25..4). */
  scale?: number;
  /** Bedding strength 0..1 (strata, soft, hard, ore). */
  layering?: number;
  /** Clast (pebble) density 0..1. */
  clasts?: number;
  /** Lantern specular 0..1 (ore, gem, metal). */
  spec?: number;
  /** Self-emission 0..1 (glowing veins, gems). */
  emit?: number;
  /** Mineral cover 0..1 (ore, glow). */
  cover?: number;
  /** How much the beds undulate 0..1. */
  warp?: number;
}

/** The 8 slots of a biome (SPEC §6.4): hostA, hostB, soft, hard, ore, rich, gem, special. */
export type BiomeRamps = readonly [SlotLook, SlotLook, SlotLook, SlotLook, SlotLook, SlotLook, SlotLook, SlotLook];

/** The Vista backdrop of a biome (src/render/descent/VistaBackdrop.ts; LOOK.md hero briefs). */
export interface VistaLook {
  /** Skyline shape term. */
  shape: 'hills' | 'roots' | 'spires' | 'city' | 'caps' | 'columns' | 'forge' | 'arcs' | 'icefall' | 'shelves' | 'gears' | 'sun' | 'islands' | 'gate';
  /** Far layer, near layer silhouette colours and the mystery glow behind layer 2. */
  far: number;
  near: number;
  glow: number;
  /** Lit points (windows, photophores, stars) on the near layer. */
  lights: number;
  /** God-ray colour. */
  rays: number;
}

export interface BiomeLookDef {
  /** The biome's accent light (lamps, the glow below, halos, rim). */
  accent: number;
  /** A second accent (crystal edges, braziers), or the accent again. */
  accent2: number;
  /** Mid-air haze and the haze pooled low. */
  fog: number;
  fogLow: number;
  /** The open-space fill (the section key is 0.9 of it, the camera fill 0.25). */
  open: number;
  /** Scene exposure for the post chain. */
  exposure: number;
  /** Bloom threshold and strength. */
  bloomThreshold: number;
  bloomStrength: number;
  saturation: number;
  /** Grade: shadow tint and highlight tint (the LUT, src/render/post/lut.ts). */
  shadow: number;
  highlight: number;
  /** Emitter voxels per slab (the light budget, W6). */
  emitters: [number, number];
  /** The deep tint rock fades to more than 6 m below the floor (the fog of rock). */
  deepTint: number;
  /** The dig lantern's core colour (warm biomes whiten it so the human amber stays apart: CRITIQUE B SHOULD 11). */
  lantern: number;
  /** Section ramps of the 8 block slots. */
  ramps: BiomeRamps;
  vista: VistaLook;
}

type Stops = SlotLook['stops'];
const sl = (style: SectionStyle, stops: Stops, o: Omit<SlotLook, 'stops' | 'style'> = {}): SlotLook => ({ stops, style, ...o });

/**
 * Host rock is toned after authoring (LOOK.md value plan): saturation x0.55 and value x0.82, so the matrix stays
 * a quiet near-neutral that lets ore, gems and chests carry the colour (V11), and the image keeps its mean
 * luminance in band (V1) under the biome's light.
 */
export function toneHex(hex: number, satK: number, valK: number): number {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx;
  const sat = mx > 0 ? (mx - mn) / mx : 0;
  // Rebuild from the channel ratios around the max at the new saturation and value.
  const k = (c: number) => {
    const t = mx > mn ? (mx - c) / (mx - mn) : 0;
    return Math.max(0, Math.min(1, v * valK * (1 - sat * satK * t)));
  };
  return (Math.round(k(r) * 255) << 16) | (Math.round(k(g) * 255) << 8) | Math.round(k(b) * 255);
}
const toned = (stops: Stops): Stops => stops.map((h) => toneHex(h, 0.55, 0.82)) as unknown as Stops;
const rk = (style: SectionStyle, stops: Stops, o: Omit<SlotLook, 'stops' | 'style'> = {}): SlotLook => sl(style, toned(stops), o);

/** The lantern core outside warm biomes (pale gold) and inside them (whitened). */
const LANTERN = 0xffe6c6;
const LANTERN_WHITE = 0xfff4ea;

export const BIOME_LOOKS: readonly BiomeLookDef[] = [
  // 0 Topsoil Roots: lamplit earth. Sienna soil and cool grey gravel beds, ochre clay, root wood; copper that
  // gleams, amber that glows, rose gems.
  {
    accent: 0xffb35c, accent2: 0x9fc3e6, fog: 0x2a2420, fogLow: 0x17130f, open: 0x6f7f96, exposure: 1.85, bloomThreshold: 1.1, bloomStrength: 0.45, saturation: 0.98,
    shadow: 0x1a1e2a, highlight: 0xfff1d8, emitters: [4, 8], deepTint: 0x1a1612, lantern: LANTERN,
    ramps: [
      rk('strata', [0x1c1a19, 0x3a3532, 0x5a524d, 0x7a7068, 0x9c9288], { layering: 0.7, clasts: 0.18 }),
      rk('strata', [0x262422, 0x4c4742, 0x726a60, 0x968c80, 0xbcb2a4], { layering: 0.35, clasts: 0.75, scale: 1.1 }),
      rk('soft', [0x24211c, 0x4a4438, 0x6e6654, 0x908670, 0xb0a68e], { layering: 0.8, clasts: 0.05 }),
      rk('wood', [0x1c120c, 0x3a2617, 0x5a3c24, 0x7a5434, 0x9a6e46], { layering: 0.2 }),
      sl('ore', [0x2c120a, 0x5e2612, 0xe0682a, 0xff9a52, 0xffd6a8], { spec: 0.85, cover: 0.58, clasts: 0.2 }),
      sl('glow', [0x3a1a04, 0x7a3a08, 0xe88c1c, 0xffbe4a, 0xffeab0], { emit: 0.55, spec: 0.5, cover: 0.62 }),
      sl('gem', [0x3a0820, 0x8a1c50, 0xe0508e, 0xff90c4, 0xffdcee], { spec: 0.9, emit: 0.5 }),
      sl('wood', [0x24160c, 0x4a2e18, 0x6e4626, 0x946238, 0xb8844e], { layering: 0.1, scale: 0.8 }),
    ],
    vista: { shape: 'hills', far: 0x3a2a2a, near: 0x1a1210, glow: 0xffb35c, lights: 0xffc070, rays: 0x9fc3e6 },
  },
  // 1 Glowroot Caverns: green-teal moss and blue slate, root wood laced with glowroot.
  {
    accent: 0x9be7a8, accent2: 0x5fe0c0, fog: 0x142226, fogLow: 0x0c1a1e, open: 0x6f96a2, exposure: 2.2, bloomThreshold: 1.0, bloomStrength: 0.55, saturation: 1.12,
    shadow: 0x0b1a1a, highlight: 0xf0ffe8, emitters: [6, 10], deepTint: 0x0c1814, lantern: LANTERN,
    ramps: [
      rk('soft', [0x10160f, 0x24301f, 0x3c4c32, 0x566a48, 0x768a64], { layering: 0.45, clasts: 0.12 }),
      rk('strata', [0x141a20, 0x27303a, 0x3e4a58, 0x586676, 0x7c8a9a], { layering: 0.75, clasts: 0.1 }),
      rk('soft', [0x10181e, 0x202e38, 0x344856, 0x4c6474, 0x688294], { layering: 0.6 }),
      rk('wood', [0x1a120a, 0x33251a, 0x4e3a28, 0x6a5038, 0x88684a]),
      sl('ore', [0x141a1e, 0x2a3036, 0x8290a0, 0xb4c0d0, 0xe2ecf8], { spec: 0.9, cover: 0.5, clasts: 0.1 }),
      sl('glow', [0x062818, 0x0f5a36, 0x26a062, 0x60dc94, 0xbcffd8], { emit: 0.7, cover: 0.58, spec: 0.4 }),
      sl('gem', [0x04261a, 0x0e5a3a, 0x2cac74, 0x80f2ba, 0xdafff2], { spec: 0.9, emit: 0.55 }),
      sl('fibrous', [0x061a0c, 0x0e4022, 0x26a452, 0x6aea92, 0xd2ffe2], { emit: 0.85, scale: 0.7 }),
    ],
    vista: { shape: 'roots', far: 0x16382e, near: 0x0a1a14, glow: 0x9be7a8, lights: 0x9be7a8, rays: 0x9be7a8 },
  },
  // 2 Crystal Grotto: cold blue slate and indigo deep slate, pale echo crystal, cyan crystal; quartz, sapphire.
  {
    accent: 0x2fb6cc, accent2: 0x8fe3ee, fog: 0x1e2a3a, fogLow: 0x121a30, open: 0x9c9ca8, exposure: 2.15, bloomThreshold: 0.95, bloomStrength: 0.6, saturation: 1.1,
    shadow: 0x0e1530, highlight: 0xe8fbff, emitters: [10, 18], deepTint: 0x0e1426, lantern: LANTERN,
    ramps: [
      rk('strata', [0x1c1c22, 0x36363e, 0x5e5e68, 0x80808a, 0xa2a2ac], { layering: 0.8, clasts: 0.08 }),
      rk('hard', [0x161820, 0x2c303c, 0x5a6274, 0x7a8496, 0x9ea8ba], { layering: 0.4 }),
      rk('glass', [0x222228, 0x44444c, 0x6c6a72, 0x908e96, 0xb6b4ba], { spec: 0.7, emit: 0.08 }),
      rk('glass', [0x04141c, 0x0a3644, 0x186c80, 0x38acc0, 0x90e8f4], { spec: 0.9, emit: 0.35 }),
      sl('ore', [0x2a0a06, 0x6a1a10, 0xe0502e, 0xff8a60, 0xffd0b8], { spec: 0.85, cover: 0.58, clasts: 0.12 }),
      sl('glow', [0x021a30, 0x0858a0, 0x18b4ff, 0x80e0ff, 0xe0faff], { emit: 1, spec: 0.7, cover: 0.62 }),
      sl('gem', [0x12062a, 0x34145e, 0x6c36b4, 0xa880f2, 0xe6d6ff], { spec: 0.95, emit: 0.55 }),
      sl('gem', [0x041a22, 0x0a4250, 0x1a8aa0, 0x4ccce0, 0xb8f6ff], { spec: 0.95, emit: 0.6, scale: 0.8 }),
    ],
    vista: { shape: 'spires', far: 0x1e3a5a, near: 0x0c1830, glow: 0x2fb6cc, lights: 0x8fe3ee, rays: 0x8fe3ee },
  },
  // 3 Halden Works: blue-grey deep slate, red brick, timber and brass; iron with rust, bright silver. A warm
  // biome: the lantern whitens; the accent is the steam-teal of the pressure lamps.
  {
    accent: 0x6fd6c4, accent2: 0xe2b673, fog: 0x231a12, fogLow: 0x140e0a, open: 0x7a6048, exposure: 2.1, bloomThreshold: 1.05, bloomStrength: 0.5, saturation: 1.0,
    shadow: 0x120c10, highlight: 0xffd8a0, emitters: [8, 14], deepTint: 0x150f0b, lantern: LANTERN_WHITE,
    ramps: [
      rk('strata', [0x14161c, 0x272a33, 0x3c404c, 0x545a68, 0x707686], { layering: 0.7, clasts: 0.15 }),
      rk('masonry', [0x1c1816, 0x36302c, 0x544a44, 0x726458, 0x908274]),
      rk('wood', [0x1e140c, 0x3e2a1a, 0x5e4228, 0x7e5a38, 0x9c764c], { layering: 0.9 }),
      rk('metal', [0x2e2008, 0x6a4c18, 0xac843c, 0xd8b266, 0xf8e2a4], { spec: 0.85 }),
      sl('ore', [0x2a1404, 0x703410, 0xf8862a, 0xffb060, 0xffe0b0], { spec: 0.85, cover: 0.64, emit: 0.2, clasts: 0.2 }),
      sl('ore', [0x22262c, 0x3e444e, 0xa0a8b6, 0xd6dce6, 0xffffff], { spec: 1, cover: 0.6, emit: 0.12 }),
      sl('gem', [0x2a0410, 0x6e0c26, 0xc42c4e, 0xf66e82, 0xffc6ce], { spec: 0.95, emit: 0.5 }),
      sl('wood', [0x140e08, 0x2a1c12, 0x44301e, 0x5e442c, 0x7a5c3e], { layering: 0.3, scale: 0.6 }),
    ],
    vista: { shape: 'gears', far: 0x3a2a1c, near: 0x160e08, glow: 0x6fd6c4, lights: 0xffd890, rays: 0xffe0b0 },
  },
  // 4 Fungal Deep: violet-brown umber, olive moss, magenta caps, pale mycelium; gold, spore pearls, lime gems.
  {
    accent: 0xc58cff, accent2: 0xa8ff6a, fog: 0x1a0f22, fogLow: 0x0c1a12, open: 0x7a5a9a, exposure: 2.12, bloomThreshold: 0.95, bloomStrength: 0.6, saturation: 1.15,
    shadow: 0x100818, highlight: 0xe8ffc8, emitters: [18, 30], deepTint: 0x120a18, lantern: LANTERN,
    ramps: [
      rk('strata', [0x1a1218, 0x34242e, 0x523a48, 0x705262, 0x906e80], { layering: 0.6, clasts: 0.12 }),
      rk('soft', [0x101a10, 0x22341e, 0x3a5030, 0x526a40, 0x6e8a54], { layering: 0.4, clasts: 0.1 }),
      rk('organic', [0x2a0a26, 0x5a1a50, 0x903682, 0xc05eb0, 0xea98da], { emit: 0.3, spec: 0.3 }),
      rk('fibrous', [0x1a1620, 0x3a3446, 0x847a94, 0xb4aac4, 0xded6ec], { emit: 0.15 }),
      sl('ore', [0x2a1c08, 0x4a3614, 0xc8a040, 0xf0d070, 0xfff4c0], { spec: 1, cover: 0.5, clasts: 0.15 }),
      sl('glow', [0x2a0a2a, 0x6a1a6a, 0xb44cbc, 0xe290f2, 0xfadeff], { emit: 0.7, cover: 0.58, spec: 0.5 }),
      sl('gem', [0x142a04, 0x34680c, 0x68b422, 0xa8f25c, 0xe2ffba], { spec: 0.95, emit: 0.6 }),
      sl('organic', [0x14200a, 0x2e5216, 0x5aa02a, 0x98e45a, 0xdcffb4], { emit: 0.7, scale: 1.3 }),
    ],
    vista: { shape: 'caps', far: 0x2e1840, near: 0x140a1c, glow: 0xc58cff, lights: 0xa8ff6a, rays: 0xd8b0ff },
  },
  // 5 Drowned Ruins: teal tile, cool glyph stone, pale masonry and coral; pearl, lapis, aquamarine.
  {
    accent: 0x5fb7ff, accent2: 0xff9a48, fog: 0x0a2236, fogLow: 0x061628, open: 0x3f86b0, exposure: 2.1, bloomThreshold: 1.0, bloomStrength: 0.55, saturation: 1.05,
    shadow: 0x04101e, highlight: 0xc0f0ff, emitters: [14, 24], deepTint: 0x061424, lantern: LANTERN,
    ramps: [
      rk('masonry', [0x0e1c22, 0x1e3842, 0x335866, 0x4c7888, 0x6c9aaa], { scale: 1.2 }),
      rk('masonry', [0x141c26, 0x283648, 0x3e5068, 0x586e88, 0x7890aa], { scale: 0.8 }),
      rk('strata', [0x22282a, 0x44504e, 0x6a7874, 0x909e98, 0xb6c4bc], { layering: 0.5, clasts: 0.3 }),
      rk('organic', [0x2a0e0c, 0x6a2a1e, 0xb4543c, 0xea886a, 0xffc4aa], { spec: 0.3, emit: 0.1 }),
      sl('ore', [0x1a1e26, 0x343a48, 0xb0b6c8, 0xdee4f2, 0xffffff], { spec: 1, cover: 0.5, emit: 0.15, clasts: 0.3 }),
      sl('ore', [0x060e2c, 0x0e2460, 0x2a50b8, 0x5a8af4, 0xa8c4ff], { spec: 0.8, cover: 0.62, emit: 0.2 }),
      sl('gem', [0x04202a, 0x0a4a5e, 0x1a8eac, 0x50d0ea, 0xbaf6ff], { spec: 0.95, emit: 0.6 }),
      sl('masonry', [0x10141e, 0x22283a, 0x384058, 0x505a78, 0x6c7698], { scale: 1.6 }),
    ],
    vista: { shape: 'city', far: 0x0e3048, near: 0x061624, glow: 0x5fb7ff, lights: 0xff9a48, rays: 0x8fd0ff },
  },
  // 6 Magma Veins: charcoal basalt columns, black-violet obsidian, ash; magma that glows, ruby, fire opal.
  // A warm biome: the lantern whitens.
  {
    accent: 0xff6a2a, accent2: 0xffc04a, fog: 0x2a140c, fogLow: 0x1a0a06, open: 0x8a4a30, exposure: 2.15, bloomThreshold: 0.85, bloomStrength: 0.8, saturation: 1.1,
    shadow: 0x1a0a0a, highlight: 0xfff0c0, emitters: [20, 34], deepTint: 0x1a0a06, lantern: LANTERN_WHITE,
    ramps: [
      rk('hard', [0x120d0d, 0x261d1b, 0x41342f, 0x5c4c45, 0x77655e], { layering: 0.3, scale: 0.8 }),
      rk('glass', [0x0c0a12, 0x1e1830, 0x3e3256, 0x5e4c7c, 0x8270a4], { spec: 1, emit: 0.04, layering: 0.12, scale: 0.55 }),
      rk('soft', [0x1e1a18, 0x3c3430, 0x5e544e, 0x7e726c, 0x9e928c], { layering: 0.5, clasts: 0.3 }),
      sl('glow', [0x1a0602, 0x4a1004, 0xc44208, 0xff8c22, 0xffda92], { emit: 0.75, cover: 0.45 }),
      sl('ore', [0x2a0410, 0x40081a, 0xd8203e, 0xff4a7a, 0xffb6ca], { spec: 0.95, cover: 0.55, emit: 0.15 }),
      sl('glow', [0x3a0c02, 0x902806, 0xec6610, 0xffa83c, 0xffe4a2], { emit: 0.85, cover: 0.6, spec: 0.6 }),
      sl('gem', [0x2a2004, 0x6a5010, 0xe8c040, 0xfff07a, 0xfffad8], { spec: 0.95, emit: 0.7 }),
      sl('glow', [0x200402, 0x5a0c02, 0xd83a06, 0xff7a1a, 0xffc878], { emit: 1, cover: 0.7, scale: 1.4 }),
    ],
    vista: { shape: 'forge', far: 0x4a1a0c, near: 0x1a0806, glow: 0xff6a2a, lights: 0xffb347, rays: 0xff9a50 },
  },
  // 7 Fossil Halls: ivory bone, amber resin, umber, flint; bone gold, insect amber, ghost-violet gems.
  // A warm biome: the lantern whitens; the accent is the ghost light.
  {
    accent: 0xc0b4ff, accent2: 0xff9a2a, fog: 0x221e1a, fogLow: 0x15110e, open: 0x8f8070, exposure: 1.5, bloomThreshold: 1.0, bloomStrength: 0.5, saturation: 0.9,
    shadow: 0x16120e, highlight: 0xfff4dc, emitters: [12, 20], deepTint: 0x16120e, lantern: LANTERN_WHITE,
    ramps: [
      rk('bone', [0x2a241c, 0x5a5040, 0x8e826c, 0xbeb29c, 0xe8decc], { clasts: 0.6 }),
      rk('glass', [0x1c140c, 0x3a2a1c, 0x5a4430, 0x7a5e44, 0x9a7c5e], { spec: 0.8, emit: 0.05, layering: 0.12, scale: 0.6 }),
      rk('strata', [0x1e1814, 0x3c322a, 0x5e5044, 0x7e6e5e, 0xa08e7c], { layering: 0.65, clasts: 0.25 }),
      rk('hard', [0x16120e, 0x2e2620, 0x4c4036, 0x685a4c, 0x867664]),
      sl('ore', [0x2a200c, 0x463818, 0xc8a44c, 0xecd480, 0xfff4c6], { spec: 0.9, cover: 0.55, clasts: 0.2 }),
      sl('glow', [0x3a1a02, 0x8a4204, 0xd87a12, 0xffb03c, 0xffe4a2], { emit: 0.4, cover: 0.5, spec: 0.6 }),
      sl('gem', [0x16122a, 0x3a3060, 0x7064aa, 0xaca2e8, 0xeae6ff], { spec: 0.95, emit: 0.55 }),
      sl('bone', [0x3a3428, 0x6e6450, 0xa49680, 0xd2c6ae, 0xf6eee0], { clasts: 0.3, scale: 0.6 }),
    ],
    vista: { shape: 'arcs', far: 0x3a3228, near: 0x16120e, glow: 0xc0b4ff, lights: 0xd0c8ff, rays: 0xe8e0ff },
  },
  // 8 Frost Hollow: glacier ice, frost slate, rime, echo crystal; rime silver, frost diamond, aurora gems.
  {
    accent: 0x7fd8ff, accent2: 0x9dffd8, fog: 0x1a2a3a, fogLow: 0x0e1826, open: 0xa8c4e0, exposure: 1.1, bloomThreshold: 1.0, bloomStrength: 0.55, saturation: 0.95,
    shadow: 0x06202a, highlight: 0xeafffa, emitters: [14, 24], deepTint: 0x0e1826, lantern: LANTERN,
    ramps: [
      rk('glass', [0x12222d, 0x29455a, 0x4a6a81, 0x718fa0, 0x99a9b2], { spec: 0.9, emit: 0.06, layering: 0.22, scale: 0.7 }),
      rk('strata', [0x111820, 0x232e3b, 0x374655, 0x4d5f70, 0x687a8b], { layering: 0.75, clasts: 0.1 }),
      rk('soft', [0x293139, 0x4a5561, 0x6d7884, 0x8d969e, 0xa8acb0], { layering: 0.4 }),
      rk('glass', [0x1c2331, 0x394357, 0x5c697e, 0x7f8b9b, 0xa0a7ae], { spec: 0.8, emit: 0.15, scale: 1.4 }),
      sl('ore', [0x2a0e24, 0x5a2050, 0xc85aa8, 0xf09ad8, 0xffe0f6], { spec: 1, cover: 0.55, clasts: 0.1 }),
      sl('gem', [0x1a1430, 0x48388a, 0x9a7ae8, 0xd0c0ff, 0xffffff], { spec: 1, emit: 0.6 }),
      sl('gem', [0x082a20, 0x146a50, 0x32b88c, 0x80f2ca, 0xdefff4], { spec: 0.95, emit: 0.6 }),
      sl('glass', [0x203a50, 0x4a7896, 0x80b4d4, 0xb6e0f4, 0xeefaff], { spec: 1, emit: 0.1, scale: 0.6 }),
    ],
    vista: { shape: 'icefall', far: 0x2a4a64, near: 0x10202e, glow: 0x9dffd8, lights: 0x7fd8ff, rays: 0xc8f0ff },
  },
  // 9 The Loom: pale ashlar, glyph stone, brick, violet thread rock; lumen crystal, loomstone.
  {
    accent: 0xfff4d0, accent2: 0xb9a2ff, fog: 0x1e1c18, fogLow: 0x0e1420, open: 0xb0a888, exposure: 1.65, bloomThreshold: 0.85, bloomStrength: 0.7, saturation: 1.05,
    shadow: 0x1c1408, highlight: 0xfff2cc, emitters: [28, 48], deepTint: 0x0e1420, lantern: LANTERN,
    ramps: [
      rk('masonry', [0x201d17, 0x413c31, 0x66604f, 0x878270, 0xa6a090], { scale: 0.9 }),
      rk('masonry', [0x16141d, 0x2b2a3a, 0x444256, 0x5f5e73, 0x7d7c90], { scale: 1.3 }),
      rk('masonry', [0x1e1814, 0x3c3228, 0x5e4f41, 0x7a6b59, 0x978775], { scale: 1.6 }),
      rk('fibrous', [0x130e23, 0x2a2148, 0x473b70, 0x665b94, 0x8f86b1], { emit: 0.5 }),
      sl('glow', [0x3a3010, 0x6a5820, 0xdcc060, 0xfff2aa, 0xfffcee], { emit: 0.65, cover: 0.55, spec: 0.7 }),
      sl('glow', [0x1c0e3a, 0x42227e, 0x764ac6, 0xb08ef6, 0xeadeff], { emit: 0.7, cover: 0.6 }),
      sl('gem', [0x3a3214, 0x7a6a2c, 0xd8c070, 0xfff0b0, 0xfffcf0], { spec: 1, emit: 0.6 }),
      sl('fibrous', [0x241c10, 0x4e4224, 0xc8b070, 0xfff0b4, 0xfffcf0], { emit: 0.8, scale: 0.8 }),
    ],
    vista: { shape: 'shelves', far: 0x3a3428, near: 0x14121a, glow: 0xfff4d0, lights: 0xfff0b0, rays: 0xfff4d0 },
  },
  // 10 Iron Core: dark ironbound, deep slate, rust, brass gear metal; mythril, magnetite.
  {
    accent: 0x8fb8ff, accent2: 0xff7a2a, fog: 0x141820, fogLow: 0x0c0e14, open: 0x8a96b0, exposure: 2.1, bloomThreshold: 0.95, bloomStrength: 0.6, saturation: 1.0,
    shadow: 0x081426, highlight: 0xe4eeff, emitters: [16, 28], deepTint: 0x0c0e14, lantern: LANTERN,
    ramps: [
      rk('metal', [0x101418, 0x22282e, 0x38404a, 0x505a66, 0x6c7886], { spec: 0.6, scale: 0.7 }),
      rk('strata', [0x0e1016, 0x1c2028, 0x2e3440, 0x424a58, 0x5a6272], { layering: 0.8 }),
      rk('soft', [0x1e1410, 0x40281c, 0x68422c, 0x8c5c3e, 0xb07c56], { layering: 0.5, clasts: 0.35 }),
      rk('metal', [0x2a1e0a, 0x5e461c, 0x987438, 0xc8a260, 0xf0d298], { spec: 0.9 }),
      sl('ore', [0x101c2c, 0x1c3048, 0x548cc0, 0x92c2ea, 0xdaf0ff], { spec: 1, cover: 0.55, emit: 0.12 }),
      sl('ore', [0x1a1424, 0x3c3050, 0x9a8ad8, 0xd8ccff, 0xffffff], { spec: 1, cover: 0.72, emit: 0.12 }),
      sl('gem', [0x0a1430, 0x183268, 0x3060b4, 0x6c9cf0, 0xc8deff], { spec: 1, emit: 0.55 }),
      sl('glow', [0x200802, 0x4a1404, 0xc04a10, 0xff8a30, 0xffd090], { emit: 0.9, cover: 0.4 }),
    ],
    vista: { shape: 'gears', far: 0x222a38, near: 0x0c0e14, glow: 0x8fb8ff, lights: 0xff7a2a, rays: 0xb8d0ff },
  },
  // 11 Star Heart: dark star glass, gold rock, pale sunstone, crystal; star shards, plasma pearls. A warm biome:
  // the lantern whitens.
  {
    accent: 0xfff1c2, accent2: 0xff8ac8, fog: 0x3a2a10, fogLow: 0x20160a, open: 0xe0c080, exposure: 1.6, bloomThreshold: 1.1, bloomStrength: 0.9, saturation: 1.1,
    shadow: 0x201408, highlight: 0xffffff, emitters: [24, 40], deepTint: 0x20160a, lantern: LANTERN_WHITE,
    ramps: [
      rk('glass', [0x030206, 0x07060d, 0x0e0b18, 0x19152a, 0x2a2445], { spec: 0.9, emit: 0.25, scale: 0.7, layering: 0.15 }),
      rk('strata', [0x1d1506, 0x42300f, 0x695020, 0x8c7037, 0xa98f57], { layering: 0.7, clasts: 0.15 }),
      rk('soft', [0x292011, 0x554526, 0x826d42, 0xa28f62, 0xb2a98d], { layering: 0.45 }),
      sl('gem', [0x2a2410, 0x6a5a26, 0xc8b058, 0xf8e8a0, 0xfffcec], { spec: 1, emit: 0.4 }),
      sl('glow', [0x2a3040, 0x5a6a8a, 0xa8c8ff, 0xe0eeff, 0xffffff], { emit: 0.8, cover: 0.55, spec: 0.8 }),
      sl('glow', [0x3a0a2a, 0x8a1e6a, 0xdc4cb4, 0xff96e2, 0xffe6f8], { emit: 0.8, cover: 0.6 }),
      sl('gem', [0x1e0a3a, 0x4a1c8a, 0x8a4ae8, 0xc090ff, 0xf0e0ff], { spec: 1, emit: 0.7 }),
      sl('glow', [0x2a2008, 0x6a5418, 0xf0d060, 0xfff4b0, 0xffffff], { emit: 1, cover: 0.75 }),
    ],
    vista: { shape: 'sun', far: 0x5a4018, near: 0x20160a, glow: 0xfff1c2, lights: 0xffd890, rays: 0xfff4d0 },
  },
  // 12 Void Sea: indigo void stone, pale violet echo crystal, bedrock, black null glass; void pearls.
  {
    accent: 0x7a6cff, accent2: 0xd8e0ff, fog: 0x0c0820, fogLow: 0x1a0c3a, open: 0x5a4a9a, exposure: 1.75, bloomThreshold: 0.85, bloomStrength: 0.75, saturation: 1.15,
    shadow: 0x06041a, highlight: 0xe8e0ff, emitters: [16, 30], deepTint: 0x0c0820, lantern: LANTERN,
    ramps: [
      rk('hard', [0x080518, 0x130f2e, 0x231b4a, 0x32275f, 0x453878], { layering: 0.35 }),
      rk('glass', [0x161425, 0x2e2b49, 0x4c486f, 0x6f6b90, 0x9693ad], { spec: 0.9, emit: 0.15, layering: 0.2, scale: 0.7 }),
      rk('strata', [0x0b0b10, 0x18171e, 0x2a2834, 0x3a3748, 0x4e4a60], { layering: 0.6 }),
      rk('glass', [0x02060a, 0x081620, 0x133242, 0x204a5a, 0x3a7080], { spec: 1, emit: 0.3 }),
      sl('glow', [0x2a200a, 0x6a5420, 0xe0c060, 0xfff0a8, 0xfffcec], { emit: 0.75, cover: 0.58, spec: 0.7 }),
      sl('glow', [0x041a24, 0x0a4258, 0x188caa, 0x4ad2ea, 0xbef8ff], { emit: 0.8, cover: 0.6 }),
      sl('gem', [0x101430, 0x2a3470, 0x5a6cc4, 0x9cacf6, 0xe4ecff], { spec: 1, emit: 0.65 }),
      sl('fibrous', [0x0a0620, 0x1e1450, 0x5a44c0, 0x9a88ff, 0xe0d8ff], { emit: 0.9 }),
    ],
    vista: { shape: 'islands', far: 0x1c1440, near: 0x08061a, glow: 0x7a6cff, lights: 0xd8e0ff, rays: 0xb0a8ff },
  },
  // 13 The Gate: rune-carved glyph stone, bedrock, black stone with gold veins; gate stone, sigil ore.
  {
    accent: 0x8fe3ee, accent2: 0xe2b673, fog: 0x1a1226, fogLow: 0x0e0a18, open: 0xa090c0, exposure: 2.6, bloomThreshold: 0.9, bloomStrength: 0.9, saturation: 1.15,
    shadow: 0x061a1e, highlight: 0xfff6e0, emitters: [24, 40], deepTint: 0x0e0a18, lantern: LANTERN,
    ramps: [
      rk('masonry', [0x16141e, 0x2e2a3c, 0x4a445c, 0x6a6280, 0x908aa8], { scale: 0.8 }),
      rk('strata', [0x0e0e14, 0x1f1d27, 0x323040, 0x49435c, 0x655e7e], { layering: 0.5 }),
      rk('masonry', [0x262a30, 0x4c5460, 0x76808e, 0xa0aab8, 0xcad2de], { scale: 1.4 }),
      rk('ore', [0x050506, 0x0e0d10, 0xb08a3a, 0xe4c070, 0xfff0c0], { spec: 0.9, cover: 0.3, emit: 0.2 }),
      sl('glow', [0x041a20, 0x0a4250, 0x18869c, 0x4ecee2, 0xb6f6ff], { emit: 0.8, cover: 0.55 }),
      sl('glow', [0x2a1a08, 0x6a4a18, 0xc89c40, 0xf6d680, 0xfff6ce], { emit: 0.7, cover: 0.6, spec: 0.8 }),
      sl('gem', [0x1c0e3a, 0x42227e, 0x784cc8, 0xb490f8, 0xece0ff], { spec: 1, emit: 0.65 }),
      sl('fibrous', [0x04141a, 0x0a3440, 0x1c90a8, 0x60dcf0, 0xc8faff], { emit: 0.9 }),
    ],
    vista: { shape: 'gate', far: 0x2a1e3a, near: 0x0e0a18, glow: 0x8fe3ee, lights: 0xe2b673, rays: 0xb9a2ff },
  },
];

/**
 * Specials 41..56 (config/blocks.ts B.*): chest shell, gate stone, seal stone, fossil, geode, golden, boulder,
 * topsoil; 49..56 reserved (dark neutral).
 */
const RESERVED = sl('strata', [0x141414, 0x242424, 0x343434, 0x444444, 0x545454]);
export const SPECIAL_RAMPS: readonly SlotLook[] = [
  // The chest's timber shell with brass bands: warm, bright and specular so it begs for the tap (V11).
  sl('chest', [0x2a0606, 0x701410, 0xc0281c, 0xf6c45c, 0xfff0b8], { spec: 1, emit: 0.35 }),
  sl('masonry', [0x1a1c22, 0x343842, 0x585e6c, 0x7e8696, 0xaab2c2], { scale: 1.2 }),
  sl('metal', [0x0e1018, 0x1a1e2a, 0x2c3242, 0x40485c, 0x58627a], { spec: 0.5 }),
  sl('bone', [0x2a241c, 0x6a5e4a, 0xb4a488, 0xe0d4ba, 0xfff8ea], { clasts: 0.4, spec: 0.3, emit: 0.12 }),
  sl('gem', [0x08182a, 0x183e6a, 0x3a80c4, 0x7cc4f4, 0xd0f0ff], { spec: 1, emit: 0.55 }),
  sl('ore', [0x3a2606, 0x7a5410, 0xe8b830, 0xffe270, 0xfffad8], { spec: 1, cover: 0.85, emit: 0.35 }),
  sl('hard', [0x141418, 0x26262c, 0x3c3c44, 0x54545e, 0x6e6e7a]),
  sl('soft', [0x10120a, 0x242a14, 0x3a4420, 0x52602c, 0x6e7e3c], { layering: 0.3, clasts: 0.2 }),
  RESERVED, RESERVED, RESERVED, RESERVED, RESERVED, RESERVED, RESERVED, RESERVED,
];

/** Emitters 176..191 (fissure stone in a key colour): dark stone split by glowing veins. */
const em = (c2: number, c3: number, c4: number): SlotLook => sl('glow', [0x0c0a0a, 0x1a1616, c2, c3, c4], { emit: 1, cover: 0.55 });
export const EMITTER_RAMPS: readonly SlotLook[] = [
  em(0x2a9a4c, 0x6ae890, 0xd0ffe0), em(0x167e94, 0x40c4dc, 0xb0f4ff), em(0xd06a1c, 0xffa848, 0xffe0b0), em(0xd0a020, 0xffd85a, 0xfff4c0),
  em(0x9a3cc0, 0xd884f4, 0xf8dcff), em(0x6ab02a, 0xa8ec5c, 0xe8ffc0), em(0x2a78c0, 0x5cb0f4, 0xc8e8ff), em(0xe04a10, 0xff8a30, 0xffd090),
  em(0xd08a10, 0xffbc40, 0xffeab0), em(0x5ab0dc, 0x9ae0ff, 0xeafaff), em(0xe0d090, 0xfff4cc, 0xffffff), em(0x5a7ad0, 0x96b8ff, 0xe0ecff),
  em(0xe0c070, 0xfff0b0, 0xffffff), em(0x5a48d8, 0x9a88ff, 0xe4dcff), em(0x1a9ab0, 0x5ad8ec, 0xc8faff), em(0xd85a78, 0xff90a8, 0xffdce4),
];

/** Looks blend over this many rows around a biome boundary (SPEC §11.2: across 40 m). */
export const LOOK_BLEND_ROWS = 40;

/** The human amber (the lantern, UI values, the purchase register: brand). */
export const HUMAN_AMBER = 0xffb35c;
/** Biomes whose rock or light is warm (CRITIQUE B SHOULD 11): their accents stay ≥ 25° from the amber, or the lantern whitens. */
export const WARM_BIOMES: readonly number[] = [3, 6, 7, 11];
