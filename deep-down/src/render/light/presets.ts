// What the lighting stack does on each quality preset (W1-LEAD §4.10), and the feature ladder the governor walks down
// before frames drop. Pure data and pure functions (no Three.js).

export type LightQuality = 'battery' | 'balanced' | 'high';

export interface LightFeatures {
  /** The lantern's cube shadow and its resolution per face. */
  shadows: boolean;
  shadowRes: number;
  /** PCF taps after the 4-tap blocker search (8 or 16). */
  shadowTaps: number;
  /** While the lantern moves, refresh the cube every N frames, and once when it stops (at rest: never). */
  shadowEveryFrames: number;
  /** One extra shadowed practical: the nearest lit lamp (High). */
  secondShadow: boolean;
  /** Only geometry within this distance of the light renders into its cube (m). */
  shadowFar: number;
  /** GTAO at a fraction of the scene resolution, multiplied with the baked AO on indirect light. */
  ao: boolean;
  aoScale: number;
  /** Raymarched single scattering (and the height fog) at a fraction of the scene resolution. */
  volumetric: boolean;
  volScale: number;
  volSteps: number;
  /** The lantern's cube shadow inside the volumetric march (High). */
  volShadow: boolean;
  /** Per-chamber reflection probes (wet stone, metal, crystal). */
  probes: boolean;
  probeRes: number;
  /** Per-pixel practicals (the rest stay baked in the LightField). */
  practicals: number;
}

export const LIGHT_PRESETS: Record<LightQuality, LightFeatures> = {
  battery: {
    shadows: false,
    shadowRes: 0,
    shadowTaps: 8,
    shadowEveryFrames: 2,
    secondShadow: false,
    shadowFar: 14,
    ao: false,
    aoScale: 0.5,
    volumetric: false,
    volScale: 0.5,
    volSteps: 0,
    volShadow: false,
    probes: false,
    probeRes: 0,
    practicals: 4,
  },
  balanced: {
    shadows: true,
    shadowRes: 256,
    shadowTaps: 8,
    shadowEveryFrames: 3,
    secondShadow: false,
    shadowFar: 14,
    ao: true,
    aoScale: 0.5,
    volumetric: true,
    volScale: 0.5,
    volSteps: 12,
    volShadow: false,
    probes: true,
    probeRes: 64,
    practicals: 8,
  },
  high: {
    shadows: true,
    shadowRes: 512,
    shadowTaps: 16,
    shadowEveryFrames: 2,
    secondShadow: true,
    shadowFar: 14,
    ao: true,
    aoScale: 0.5,
    volumetric: true,
    volScale: 0.5,
    volSteps: 20,
    volShadow: true,
    probes: true,
    probeRes: 128,
    practicals: 8,
  },
};

/**
 * The feature ladder (the governor's steps inside a preset, cheapest loss first). Step 0 is the preset itself; each
 * step sheds one thing the eye misses least. Battery has nothing left to shed.
 */
export const LADDER: ReadonlyArray<{ id: string; apply: (f: LightFeatures) => void }> = [
  { id: 'volSteps', apply: (f) => (f.volSteps = Math.min(f.volSteps, 8)) },
  { id: 'shadowTaps', apply: (f) => ((f.shadowTaps = 8), (f.secondShadow = false), (f.volShadow = false)) },
  { id: 'shadowCadence', apply: (f) => (f.shadowEveryFrames = Math.max(f.shadowEveryFrames, 5)) },
  { id: 'ao', apply: (f) => (f.ao = false) },
  { id: 'volumetric', apply: (f) => (f.volumetric = false) },
  { id: 'shadows', apply: (f) => (f.shadows = false) },
];

/** The features of `quality` with the first `step` ladder steps applied (0 = the preset as designed). */
export function featuresAt(quality: LightQuality, step: number): LightFeatures {
  const f: LightFeatures = { ...LIGHT_PRESETS[quality] };
  if (quality === 'battery') return f;
  const n = Math.max(0, Math.min(LADDER.length, Math.floor(step)));
  for (let i = 0; i < n; i++) LADDER[i].apply(f);
  return f;
}
