/** What the audio needs to know about the descent each frame. */
export interface AudioWorldState {
  /** The floor's depth in metres. */
  depth: number;
  /** 0..1, how open the space around the floor is (drives reverb and air tone). */
  openness: number;
  /** 0..1, how much crystal is around (the Crystal Grotto hums). */
  nearCrystal: number;
  /** 0..1, the camp fire at the surface. */
  nearFire: number;
  inMenu: boolean;
  /** The biome index (its mode and tempo, SPEC §6.5); undefined keeps the depth bands. */
  biome?: number;
  /** The biome's music (mode, root, bpm). */
  music?: { mode: string; root: string; bpm: number };
  /** 0..1: the drum layer's target (combo ≥ 25, a Surge, an event, the Plunge). */
  drums?: number;
  /** 0..1: the boss layer's target (a seal fight). */
  boss?: number;
  /** A tap in the last 5 s: the pluck melody plays (SPEC §10.10). */
  plucks?: boolean;
}

/** Volume sliders, each 0..1. */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export type UiSound = 'tap' | 'open' | 'close' | 'no';
