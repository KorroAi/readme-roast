// What DepthScene reads from the game each frame (BUILD §2: `attach(state, chart, layout)`). The game shell (D) adapts
// the model (A: IdleState, nodeView, chart) and the world layout (B: placeNode) to this one interface, as IdleGame
// adapted IdleState to DescentSource before. Field names follow BUILD §2's NodePlacement so B's objects pass through.

import type { PromiseClass, TappableKind, Vec3 } from './types';

/** A world point as either an object or a tuple (B's layout may use either). */
export type Vec3Like = Vec3 | readonly [number, number, number];

export function v3(p: Vec3Like): Vec3 {
  return Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : (p as Vec3);
}

/** The face frame of a drift (B: `placeNode().drift.faceFrame`): where slice 0's front plane is. */
export interface FaceFrame {
  /** The centre of the heading's floor line on slice 0's front plane (world m). */
  origin: Vec3Like;
  /** Unit direction into the rock (the drift's axis, nearly level). */
  dir: Vec3Like;
  /** Unit up (world +y unless the drift is a sump [W2]). */
  up: Vec3Like;
}

/** One model row of the face: the 7 cells' kinds and remaining HP fractions (the snake map of SPEC §3.5). */
export interface FaceRow {
  depth: number;
  kinds: ArrayLike<number>;
  left: ArrayLike<number>;
}

/** The drift the player is digging (null outside a drift). */
export interface FaceView {
  node: number;
  biome: number;
  frame: FaceFrame;
  /** Model depth of slice 0 of this drift; slice s sits at depth0 + s and 1 m further along `dir`. */
  depth0: number;
  /** Slices in this drift (K); slice K - 1 is the breach. */
  K: number;
  /** The live rows from the front (the first live row is the front slice), up to 8. */
  rows: ReadonlyArray<FaceRow>;
  /** The promise of the chamber behind the breach (the leak colour in the last 3 slices, C14). */
  promise: PromiseClass;
}

/** A socket of a chamber (B: `placeNode().chamber.sockets`), with the model's state for it. */
export interface ChamberSocket {
  id: string;
  /** veins, gems, lamps, feature, stash, keystone, secret, skin (B's socket kinds), or a tappable kind. */
  kind: string;
  pos: Vec3Like;
  /** The wall normal or facing at the socket (optional; the nearest open direction otherwise). */
  normal?: Vec3Like;
  /** Half extents of its bound (m), when B gives one. */
  bound?: Vec3Like | number;
}

export interface ChamberStand {
  id: string;
  pos: Vec3Like;
  yaw: number;
  pitch: number;
}

export interface ChamberExit {
  id: string;
  pos: Vec3Like;
  /** Where the carved octagon plate hangs. */
  plate?: Vec3Like;
  /** The Way Down polyline (stair, ladder, chute). */
  ride?: ReadonlyArray<Vec3Like>;
  /** 'ladder' | 'stair' | 'chute' | 'cage' | 'hatch'. */
  type?: string;
}

/** A chamber as placed (B) with its contents and state (A). */
export interface ChamberView {
  node: number;
  biome: number;
  /** The template id (B), e.g. 'topsoil.rootCellar'; scenes key their dressing on it. */
  template: string;
  box: { min: Vec3Like; max: Vec3Like };
  stands: ReadonlyArray<ChamberStand>;
  exits: ReadonlyArray<ChamberExit>;
  sockets: ReadonlyArray<ChamberSocket>;
  /** What each socket holds this run: a tappable kind, 'lamp', 'skin', or null (empty socket). */
  content(id: string): TappableKind | 'lamp' | 'litLamp' | 'skin' | 'sign' | null;
  /** Remaining HP fraction of a strike type, 0 when harvested; 1 for focus types not yet resolved, 0 once resolved. */
  left(id: string): number;
  /** Lamps relit this run. */
  lit(id: string): boolean;
  /** Lifetime: first light done in any run; every lamp relit once. */
  seen: boolean;
  charted: boolean;
}

/** The model state DepthScene reads (one adapter object; every method is cheap and pure). */
export interface DepthSource {
  lifeSeed(): number;
  runSeed(): number;
  /** The model clock (s): crew rigs strike on its 0.9 s bar. */
  time(): number;
  /** The player's node, its phase and stand. */
  node(): { index: number; phase: 'drift' | 'chamber' | 'ride'; stand: number };
  /** The drift being dug (the player's, or the crew's when it is the same one). */
  face(): FaceView | null;
  /** The chamber of node i, placed and filled (null when not generated or out of range). */
  chamber(i: number): ChamberView | null;
  /** Owned crew line levels (index = line). */
  crew(): ArrayLike<number>;
  /** The pick level (tool form follows the deepest biome; temper steps every 25 levels). */
  pickLevel(): number;
  /** The deepest biome reached (the tool form, SPEC §3.7). */
  deepestBiome(): number;
  /** The combo 0..50+ (the tool head's heat). */
  combo(): number;
  /** Lifetime record depth (the Other Lantern hangs 600 m below it). */
  record(): number;
  /** Fortune (digits of lifetime gold) for the camp stages. */
  fortune(): number;
  /** Dynamite on the rack: null when not unlocked; 0..1 cooldown (1 = ready). */
  dynamite(): number | null;
}
