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
}

/** A navigation target on screen. */
export interface HybridNav {
  id: string;
  kind: 'exit' | 'ring' | 'arrow';
  rect: HybridRect;
  hit: HybridRect;
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
  /** The player's node index, phase and stand. */
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
