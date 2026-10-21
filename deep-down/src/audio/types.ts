/** What the audio needs to know about the world each frame. */
export interface AudioWorldState {
  /** Depth in meters (positive, grows downward). */
  depth: number;
  atCamp: boolean;
  /** 0..1, how big the space around the player is (drives reverb and air tone). */
  openness: number;
  /** 0..1 */
  lanternFuel: number;
  lanternLit: boolean;
  /** 0..1 proximity to crystals. */
  nearCrystal: number;
  /** 0..1 proximity to the campfire. */
  nearFire: number;
  playerSpeed: number;
  inMenu: boolean;
}

/** Volume sliders, each 0..1. */
export interface AudioVolumes {
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export type UiSound = 'click' | 'open' | 'close' | 'error' | 'craft' | 'confirm';
