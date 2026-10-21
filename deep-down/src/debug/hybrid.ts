// window.__DD__.hybrid (SPEC §13.3): the test and support surface of the first-person game. End-to-end tests drive the
// game with REAL touches (tests/e2e/touch.ts) and use this only to set up states and read results. The type is shared
// with the e2e specs (tests/e2e/dd.ts imports it), so both sides compile together. Mutating helpers (advance, setNode,
// give, offline, toSeal, skipTutorial, timeScale, settings) work only under automation or with ?debug=1.

import type { CameraSample, MoveName, ShotKind } from '../game/hybrid/FirstPersonCamera';

export interface HybridRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A live face block on screen (drift): the model column, the slice (0 = front) and its screen rect. */
export interface HybridFaceCell {
  col: number;
  slice: number;
  rect: HybridRect;
  /** Remaining HP fraction (model). */
  left: number;
  kind: number;
}

/** A chamber tappable on screen: its drawn rect (silhouette bound) and its hit rect (padded ≥ 88 px). */
export interface HybridTappable {
  id: string;
  kind: string;
  rect: HybridRect;
  hit: HybridRect;
  /** The amber rim is on it (the suggestion). */
  rimmed: boolean;
  /** Metres from the eye; strike types act within 3.5 m, focus types within 4.5 m (farther: walk there first). */
  dist: number;
  /** Remaining fraction (strike types) or 1 / 0 (focus types unresolved / resolved; lamps unlit / lit). */
  left: number;
}

/** A navigation target on screen. */
export interface HybridNav {
  id: string;
  kind: 'exit' | 'ring' | 'arrow' | 'ledge' | 'station';
  rect: HybridRect;
  hit: HybridRect;
  /** Metres from the eye (Explore walks to far ones). */
  dist: number;
}

export interface HybridCameraView {
  /** The world camera's view matrix (column-major, 16 numbers). */
  view: number[];
  shot: ShotKind;
  moving: boolean;
  move: MoveName | '';
  pose: { x: number; y: number; z: number; yaw: number; pitch: number; roll: number; hfov: number };
  /** The cross-fade's dip 0..1. */
  fade: number;
  /** The camera log since the last `clearLog` (oldest first, ≤ 2,048 frames). */
  log?: CameraSample[];
  /** Moves started, newest last. */
  started: MoveName[];
}

export interface HybridGoalView {
  text: string;
  fill: number;
  id: string;
  /** The objective line is laid out and visible. */
  visible: boolean;
}

/** Live FX groups as the FX director counts them (§8.7) and the shakes it allowed. */
export interface HybridFxView {
  foreground: number;
  ambient: number;
  particles: number;
  particleArea: number;
  shards: number;
  floating: number;
  uiLoops: number;
  /** Ceremonies: the one running ('' when none) and every one played, with lengths (ms). */
  ceremony: string;
  ceremonies: Array<{ id: string; ms: number; skipped: boolean }>;
  /** Shakes allowed so far: cause and degrees. */
  shakes: Array<{ cause: string; deg: number; ms: number }>;
  /** Cues the director refused (over budget), by name. */
  refused: Record<string, number>;
}

export interface HybridHudView {
  /** id → rect for every visible plate and control. */
  rects: Record<string, HybridRect & { visible: boolean }>;
  /** Plate area / screen area (E21: ≤ 0.17). */
  plateArea: number;
  /** Persistent numbers on screen and the transient one ('' when none). */
  numbers: string[];
  transient: string;
  /** The smallest body text size in CSS px. */
  minBodyPx: number;
  /** Which sheet is open ('' none) and its tab. */
  sheet: string;
  /** The first-time card's text ('' when none), the return plate's phase. */
  firstTime: string;
  returnPlate: '' | 'shown' | 'collected';
  /** The focus pop's panel ('' when closed). */
  focus: string;
  /** The cards: id, price text, affordable. */
  cards: Array<{ slot: 'pick' | 'best'; id: string; price: string; ready: boolean; visible: boolean }>;
  /** The legacy-or-migration notice on screen. */
  notice: string;
}

export interface HybridNodeView {
  /** The player's node index, phase ('drift' | 'explore' | 'ride' | 'seal' | 'camp' | 'reveal') and stand. */
  node: number;
  phase: string;
  stand: number;
  /** The slice index in the drift (0 = the first). */
  slice: number;
  /** K for this node. */
  slices: number;
  /** The biome index and the node's kind ('cellar', 'gallery', 'seal', …). */
  biome: number;
  kind: string;
  /** Dark chambers the crew opened ahead (the leash). */
  leashOpen: number;
  lit: boolean;
  seen: boolean;
  charted: boolean;
  /** Lamps lit / total in the current chamber. */
  lamps: [number, number];
  /** The model's dig front (m). */
  depth: number;
}

/** Explore (W1-LEAD §3): the walk, the look and the destination ring. */
export interface HybridExploreView {
  /** The player walks and looks freely now (a chamber after first light, the camp). */
  on: boolean;
  walking: boolean;
  /** 'walk' | 'ride' | '' . */
  kind: string;
  /** The eye now. */
  pos: { x: number; y: number; z: number; yaw: number; pitch: number };
  /** Where the running walk ends (eye point), or null. */
  end: { x: number; y: number; z: number } | null;
  /** The last tapped destination (feet point) and when the amber ring was shown (performance.now() ms). */
  marker: { x: number; y: number; z: number; at: number } | null;
  /** Walks started, arrived, and actions done on arrival (walk-then-act). */
  walks: number;
  arrivals: number;
  actsOnArrival: number;
  /** Drag-look steps applied. */
  looks: number;
}

/** A screen point the e2e can tap to walk: a visible walkable floor cell and its feet point. */
export interface HybridFloorPoint {
  x: number;
  y: number;
  /** The feet point it walks to, and its distance from the eye (m). */
  at: { x: number; y: number; z: number };
  dist: number;
}

/** The Ride phase: the run's progress and the glints passing by. */
export interface HybridRideView {
  on: boolean;
  /** 'cart' | 'ladder' | 'stair' | 'chute' | 'rope' | ''. */
  kind: string;
  progress: number;
  glints: Array<{ id: string; rect: HybridRect; hit: HybridRect; left: number; dist: number }>;
  /** The Skip plate's rect while the ride is skippable (null otherwise). */
  skip: HybridRect | null;
}

export interface HybridDebug {
  /** True once the first frame of the scene drew. */
  ready: boolean;
  /** 'boot' | 'menu' | 'playing' | 'paused' | 'crashed'. */
  mode(): string;
  /** A JSON snapshot of the model (Big values as [m, e]). */
  state(): any;
  node(): HybridNodeView;
  phase(): string;
  faceCells(): HybridFaceCell[];
  tappables(): HybridTappable[];
  nav(): HybridNav[];
  /** Explore: the walk and the look. */
  explore(): HybridExploreView;
  /** Explore: up to `n` screen points over visible walkable floor between `minM` and `maxM` metres away. */
  floorPoints(n?: number, minM?: number, maxM?: number): HybridFloorPoint[];
  /** The Ride phase. */
  ride(): HybridRideView;
  camera(withLog?: boolean): HybridCameraView;
  /** Clear the camera log (then `camera(true)` returns only what follows). */
  clearCameraLog(): void;
  goal(): HybridGoalView;
  fx(): HybridFxView;
  hud(): HybridHudView;
  /** Recent model and shell events, newest last, ≤ 1,024 (t = performance.now() ms, mt = model clock s, f = frame). */
  events(name?: string): Array<{ name: string; payload: any; t: number; mt: number; f: number }>;
  clearEvents(): void;
  /** Frames drawn since boot. */
  frame(): number;
  /** Frames from each recent pointerdown to the frame that showed its hit (E1). */
  lastTapFrames(): number[];
  /** How recent touches resolved (verb, target), oldest first, ≤ 256. */
  lastTouches(): Array<{ x: number; y: number; kind: string; verb: string; target: string; t: number; f: number }>;
  /** Fast-forward `seconds` with the crew only (the analytic offline step). */
  advance(seconds: number): void;
  /** Put the player at node `i` (its drift face, or its chamber with `chamber`). */
  setNode(i: number, at?: 'drift' | 'chamber' | 'breach'): void;
  /** Explore set-up: stand at the approach of the chamber's exit (or a socket's, by local id), facing it. @returns false when there is none. */
  standAt(what: 'exit' | string): boolean;
  give(p: { gold?: number | string; gems?: number }): void;
  /** Rewind the save by `hours`, save and reload (the offline return). */
  offline(hours: number): void;
  /** Jump to the Seal hall of the current biome (its fight ready). */
  toSeal(): void;
  skipTutorial(): void;
  settings(patch?: Record<string, unknown>): any;
  timeScale(k?: number): number;
  perf(): { frameMs: number; p95FrameMs: number; fps: number; calls: number; tris: number };
  /** Save now. @returns success. */
  save(): boolean;
}

/** Install `window.__DD__.hybrid` (keeping `window.__DD__` as the container). */
export function installHybridDebug(api: HybridDebug): void {
  const w = window as unknown as { __DD__?: Record<string, unknown> };
  w.__DD__ = { ...(w.__DD__ ?? {}), hybrid: api };
}
