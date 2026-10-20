// Biome looks (SPEC §11.2): the atmosphere, the section light, bloom and grade of each biome. Hex values
// are sRGB. BiomeLook (src/render/descent/BiomeLook.ts) blends the two looks nearest the camera's depth.
// Owner: world and render (BUILD §2.2). Pure data: no Three.js.

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
  /** Grade: shadow tint and highlight tint. */
  shadow: number;
  highlight: number;
  /** Emitter voxels per slab (the light budget, W6). */
  emitters: [number, number];
  /** The deep tint rock fades to more than 6 m below the floor (the fog of rock). */
  deepTint: number;
}

export const BIOME_LOOKS: readonly BiomeLookDef[] = [
  { accent: 0xffb35c, accent2: 0x9fc3e6, fog: 0x2a2420, fogLow: 0x17130f, open: 0x6f7f96, exposure: 2.3, bloomThreshold: 1.1, bloomStrength: 0.45, saturation: 1.05, shadow: 0x1a1e2a, highlight: 0xfff1d8, emitters: [4, 8], deepTint: 0x1a1612 },
  { accent: 0x9be7a8, accent2: 0x9be7a8, fog: 0x14261f, fogLow: 0x0c1a1e, open: 0x6fa293, exposure: 2.2, bloomThreshold: 1.0, bloomStrength: 0.55, saturation: 1.12, shadow: 0x0b1a1a, highlight: 0xf0ffe8, emitters: [6, 10], deepTint: 0x0c1814 },
  { accent: 0x2fb6cc, accent2: 0x8fe3ee, fog: 0x203046, fogLow: 0x121638, open: 0x8a9ab5, exposure: 2.25, bloomThreshold: 0.95, bloomStrength: 0.6, saturation: 1.1, shadow: 0x0e1530, highlight: 0xe8fbff, emitters: [10, 18], deepTint: 0x0e1426 },
  { accent: 0xffa04a, accent2: 0xe2b673, fog: 0x231a12, fogLow: 0x140e0a, open: 0x7a6048, exposure: 2.0, bloomThreshold: 1.05, bloomStrength: 0.5, saturation: 1.0, shadow: 0x120c10, highlight: 0xffc880, emitters: [8, 14], deepTint: 0x150f0b },
  { accent: 0xc58cff, accent2: 0xa8ff6a, fog: 0x1a0f22, fogLow: 0x0c1a12, open: 0x7a5a9a, exposure: 2.1, bloomThreshold: 0.95, bloomStrength: 0.6, saturation: 1.15, shadow: 0x100818, highlight: 0xe8ffc8, emitters: [18, 30], deepTint: 0x120a18 },
  { accent: 0x5fb7ff, accent2: 0xff9a48, fog: 0x0a2236, fogLow: 0x061628, open: 0x3f86b0, exposure: 2.1, bloomThreshold: 1.0, bloomStrength: 0.55, saturation: 1.05, shadow: 0x04101e, highlight: 0xc0f0ff, emitters: [14, 24], deepTint: 0x061424 },
  { accent: 0xff7a2e, accent2: 0xffb347, fog: 0x2a140c, fogLow: 0x1a0a06, open: 0x8a4a30, exposure: 1.8, bloomThreshold: 0.85, bloomStrength: 0.8, saturation: 1.2, shadow: 0x1a0a0a, highlight: 0xfff0c0, emitters: [20, 34], deepTint: 0x1a0a06 },
  { accent: 0xffb000, accent2: 0xd0c8ff, fog: 0x221e1a, fogLow: 0x15110e, open: 0x8f8070, exposure: 2.1, bloomThreshold: 1.0, bloomStrength: 0.5, saturation: 0.95, shadow: 0x16120e, highlight: 0xfff4dc, emitters: [12, 20], deepTint: 0x16120e },
  { accent: 0x7fd8ff, accent2: 0x9dffd8, fog: 0x1a2a3a, fogLow: 0x0e1826, open: 0xa8c4e0, exposure: 2.4, bloomThreshold: 1.0, bloomStrength: 0.55, saturation: 0.95, shadow: 0x0c1626, highlight: 0xf4fbff, emitters: [14, 24], deepTint: 0x0e1826 },
  { accent: 0xfff4d0, accent2: 0xb9a2ff, fog: 0x1e1c18, fogLow: 0x0e1420, open: 0xb0a888, exposure: 2.3, bloomThreshold: 0.85, bloomStrength: 0.7, saturation: 1.05, shadow: 0x0a1020, highlight: 0xfff4d0, emitters: [28, 48], deepTint: 0x0e1420 },
  { accent: 0x8fb8ff, accent2: 0xff7a2a, fog: 0x141820, fogLow: 0x0c0e14, open: 0x8a96b0, exposure: 2.1, bloomThreshold: 0.95, bloomStrength: 0.6, saturation: 1.0, shadow: 0x0c1018, highlight: 0xe8f0ff, emitters: [16, 28], deepTint: 0x0c0e14 },
  { accent: 0xfff1c2, accent2: 0xffb040, fog: 0x3a2a10, fogLow: 0x20160a, open: 0xe0c080, exposure: 2.6, bloomThreshold: 1.1, bloomStrength: 0.9, saturation: 1.1, shadow: 0x201408, highlight: 0xffffff, emitters: [24, 40], deepTint: 0x20160a },
  { accent: 0x6a5cff, accent2: 0xd8e0ff, fog: 0x0c0820, fogLow: 0x1a0c3a, open: 0x5a4a9a, exposure: 2.4, bloomThreshold: 0.85, bloomStrength: 0.75, saturation: 1.15, shadow: 0x06041a, highlight: 0xe8e0ff, emitters: [16, 30], deepTint: 0x0c0820 },
  { accent: 0x8fe3ee, accent2: 0xe2b673, fog: 0x1a1226, fogLow: 0x0e0a18, open: 0xa090c0, exposure: 2.6, bloomThreshold: 0.9, bloomStrength: 0.9, saturation: 1.15, shadow: 0x0e0a18, highlight: 0xfff4e0, emitters: [24, 40], deepTint: 0x0e0a18 },
];

/** Looks blend over this many rows around a biome boundary (SPEC §11.2: across 40 m). */
export const LOOK_BLEND_ROWS = 40;
