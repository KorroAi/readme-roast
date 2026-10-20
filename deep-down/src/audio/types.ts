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
}

/** Volume sliders, each 0..1. */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export type UiSound = 'tap' | 'open' | 'close' | 'no';
