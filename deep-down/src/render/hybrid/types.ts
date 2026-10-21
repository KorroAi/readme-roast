// The render seam of the first-person hybrid (BUILD §2, SPEC §2.3, §3, §8): the types DepthScene takes from the game
// shell and gives back to it. Pure data, no Three.js, so NodeController (D) and the tests use them in Node.
//
// Coordinates: world metres, the RingWorld frame (x and z 0..64 across the footprint, y up, negative below the
// surface). Screen values are CSS px from the top-left of the viewport.

/** A world point or direction. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A screen rectangle (CSS px). */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the eye is and where it looks, one per rendered frame (FirstPersonCamera.pose(), D). The camera uses
 * Three's 'YXZ' Euler order: yaw turns about +y (0 looks along -z, +yaw turns left, i.e. toward -x), then pitch
 * about the camera's x axis (+ looks up). Forward = (-sin yaw · cos pitch, sin pitch, -cos yaw · cos pitch).
 * Roll is always 0 (SPEC §3.1).
 */
export interface CameraPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Horizontal field of view in degrees (52, locked: SPEC §3.1). The vertical one follows the aspect. */
  hfov: number;
  /** 0..1: how much of the frame before a cut still shows over this pose (the 0.15–0.25 s cross-fade). A rise from 0
   *  starts a new cross-fade: DepthScene keeps the last pose's frame and blends it out as `xfade` falls to 0. */
  xfade: number;
  /** The shot this pose belongs to (logs and tests only). */
  shot?: 'drift' | 'breakthrough' | 'stand' | 'wayDown' | 'reveal' | 'crossfade' | 'camp' | 'explore' | 'ride' | 'seal';
}

/** A live face block on screen (C7, C8, E22): `col` is the model column (0..6, snake map of SPEC §3.5). */
export interface CellRect {
  col: number;
  /** The model depth (row) this block belongs to; `slice` 0 = the front slice. */
  depth: number;
  slice: number;
  /** The projected block (its drawn silhouette's bounding box) and its centre. */
  rect: Rect;
  cx: number;
  cy: number;
  /** The tap bound used by C8 (the drawn rect inset by the joint). */
  bound: Rect;
  /** Remaining HP fraction 1..0 (the crack stage follows it). */
  left: number;
  kind: number;
}

/** What a chamber object is, for the hit-test order (SPEC §2.3) and the reach rules. */
export type TappableKind =
  | 'vein' // strike type
  | 'gem' // strike type (gem cluster)
  | 'geode' // strike type, then focus
  | 'stash' // strike type (a loose stash brick)
  | 'chest' // focus type
  | 'relic' // focus type
  | 'note' // focus type
  | 'mural' // focus type
  | 'keystone' // focus type [W2]
  | 'depot' // focus type [W2]
  // W1-LEAD §3 (Explore and Ride):
  | 'secret' // strike type: a cracked wall, a hollow floor or a loose brick; breaking it reveals a cache
  | 'cache' // focus type: the small chest or stash a secret reveals
  | 'glint'; // strike type: a Ride pass-by ore glint or crystal knot (one tap mines one)

export const STRIKE_KINDS: ReadonlySet<TappableKind> = new Set<TappableKind>(['vein', 'gem', 'geode', 'stash', 'secret', 'glint']);
export const FOCUS_KINDS: ReadonlySet<TappableKind> = new Set<TappableKind>(['chest', 'relic', 'note', 'mural', 'keystone', 'depot', 'cache']);

/** Navigation marks (SPEC §2.2): never fat-finger results, never chosen for a stray tap. */
export type NavKind = 'exit' | 'ring' | 'arrow' | 'station' | 'ledge';

/**
 * Something tappable as it is on screen now (DepthScene.targets()): the drawn silhouette's bounding box, the padded
 * hit area (≥ 88 × 88 px, overlaps shrunk to ≤ 20 % but never below the drawn box) and its distance from the eye.
 */
export interface ScreenTarget {
  id: string;
  type: 'tappable' | 'lamp' | 'nav' | 'rack' | 'lantern' | 'seal';
  /** Tappable kind, nav kind, rack tool id ('dynamite'), or seal part ('body' | 'weak'). */
  kind: string;
  drawn: Rect;
  hit: Rect;
  /** Metres from the eye to the object's centre (reach: strike ≤ 3.5 m, focus ≤ 4.5 m). */
  dist: number;
  /** False when it is behind rock or outside the frame (then it never takes a tap). */
  visible: boolean;
  /** Lamps: lit already. Tappables: harvested fraction 0..1. */
  state?: number;
}

/**
 * The camera ray's answer for one screen point (SPEC §2.3 step 8 and 10). NodeController (D) applies the hit-test
 * order around it (HUD, focus pop, event objects, lantern, rack, nav, focus types, then this, then the fat finger).
 */
export type Pick =
  | { kind: 'face'; col: number; depth: number; slice: number; point: Vec3; dist: number }
  | { kind: 'tappable'; id: string; tappable: TappableKind; point: Vec3; dist: number }
  | { kind: 'lamp'; id: string; lit: boolean; point: Vec3; dist: number }
  | { kind: 'nav'; id: string; nav: NavKind; point: Vec3; dist: number }
  | { kind: 'seal'; id: string; weak: boolean; point: Vec3; dist: number }
  /** A wall-skin cell within reach (strike it). `cell` is its world voxel. */
  | { kind: 'skin'; id: string; cell: [number, number, number]; point: Vec3; dist: number }
  /** Rock within reach that is not skin: the dull tunk (two dark chips, a hint rim). */
  | { kind: 'deep'; point: Vec3; dist: number }
  /**
   * Explore (W1-LEAD §3): an up-facing surface (floor, ledge, stair tread, bridge deck) at any distance ≤ 40 m.
   * `cell` is the world voxel of the air above it (where the eye would stand, minus 1.6 m); the shell asks 1B's
   * `walkableAt`/`findPath` whether it is walkable, and treats it as `far` (Lantern Raise) when it is not.
   */
  | { kind: 'floor'; cell: [number, number, number]; point: Vec3; dist: number }
  /** Nothing in reach: Lantern Raise toward `point` (far rock, the dark, open air: a point 12 m out). */
  | { kind: 'far'; point: Vec3; dist: number };

/** A face block the model broke this frame (DepthScene.breakBlocks). */
export interface BlockBreak {
  depth: number;
  col: number;
  /** The CellKind it had (shards and nuggets take its look). */
  kind: number;
  crit?: boolean;
  crew?: boolean;
}

/** The phases DepthScene stages (W1-LEAD §3). 'chamber' and 'explore' are the same space (Explore). */
export type ScenePhase = 'camp' | 'drift' | 'chamber' | 'explore' | 'ride' | 'seal' | 'reveal';

/** Live counts of the FX budget (SPEC §8.7; D's FX director reads them and refuses cues over budget). */
export interface FxStats {
  /** Draw calls and triangles of the last rendered frame (the world pass and the viewmodel pass). */
  calls: number;
  tris: number;
  fx: {
    /** Foreground moving groups now (the tool, a debris burst, a loot stream; ≤ 3). */
    fg: number;
    /** Ambient moving groups now (the crew bar or a cart; motes or the one wonder animation; ≤ 2). */
    ambient: number;
    /** Live particles (≤ 80) and live shards (≤ 36; ≤ 60 in a seal ceremony). */
    particles: number;
    shards: number;
    /** Particle screen area as a fraction of the frame (≤ 0.06). */
    area: number;
    /** Camera shakes started since attach (U-FX2 counts them). */
    shakes: number;
  };
}

/** The look of a biome as the grade applies it (C11 lints it: exposure 1 ± 0.15, saturation ≤ 1, bloom threshold
 *  ≥ 1, strength 0.15–0.25). */
export interface GradeParams {
  exposure: number;
  saturation: number;
  bloomThreshold: number;
  bloomStrength: number;
  vignette: number;
}

/** Breach promise classes and their leak colours (SPEC §8.4 node colour language). */
export type PromiseClass = 'dull' | 'treasure' | 'builders' | 'works' | 'sealed' | 'far';

/** The leak / rim colour of each promise (sRGB hex). Dull = the biome fog, no hue. */
export const PROMISE_COLOUR: Record<PromiseClass, number> = {
  dull: 0x6f7378,
  treasure: 0xe2b673,
  builders: 0x2fb6cc,
  works: 0xc99a52,
  sealed: 0xb9a2ff,
  far: 0x9be7a8,
};

/** The single amber of "you, your lantern, your crew" (SPEC §8.4) and the rim. */
export const AMBER = 0xffb35c;

/** Pick reach (SPEC §2.3): strike-type objects and lamps, focus-type objects. */
export const REACH_STRIKE_M = 3.5;
export const REACH_FOCUS_M = 4.5;
/** Minimum hit area (CSS px) and fat-finger radius (SPEC §2.3). */
export const HIT_MIN_PX = 88;
export const FAT_FINGER_PX = 48;
