// The one render facade of the first-person hybrid (BUILD §2, SPEC §12.2): the streamed voxel world in the Lantern Voxel
// look, the face, the chamber props, the viewmodel, the crew rigs, the FX and the grade. The game shell (D) drives it:
//
//   per frame: step the model → breakBlocks()/crumble()/strike() for this frame's events → frame(dt, fxDt, pose).
//   per tap:   NodeController reads faceCells()/targets() and pick(x, y), then calls strike()/relight()/…
//
// Every count the FX director needs comes from stats(); shakes only through shake(), when the director allows it.
//
// CONTRACT (W1, 1C, published at 0:45): the method list and signatures below are the seam. Bodies grow behind them.

import * as THREE from 'three';
import type { Renderer } from '../Renderer';
import type { DepthSource } from './source';
import type { BlockBreak, CameraPose, CellRect, FxStats, GradeParams, Pick, ScreenTarget, Vec3 } from './types';
import { Viewmodel } from './Viewmodel';

/** The camp's growth stage from Fortune (SPEC §5.10): 1 at Fortune 3, 2 at 6 (W1 builds 1–2). */
export function campStage(fortune: number): number {
  const steps = [3, 6, 12, 24, 48, 100, 303];
  let s = 1;
  for (let i = 1; i < steps.length; i++) if (fortune >= steps[i]) s = i + 1;
  return s;
}

/** Scene set pieces DepthScene can stage (SPEC §3.3, §5.5, BUILD §3.3 MUST 8). */
export type SetPiece = 'descent' | 'camp';

export class DepthScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(93, 390 / 844, 0.08, 120);
  /** The lantern and the tool (its own pass). */
  readonly viewmodel = new Viewmodel();
  source: DepthSource | null = null;
  protected readonly counts: FxStats = { calls: 0, tris: 0, fx: { fg: 0, ambient: 0, particles: 0, shards: 0, area: 0, shakes: 0 } };

  constructor(readonly renderer: Renderer) {}

  /** Bind the model and build the world around the player's node (slabs, light, meshes, the face, the props). */
  async attach(source: DepthSource): Promise<void> {
    this.source = source;
  }

  /** Stage the camp at the adit (menu, first launch) or the descent. */
  setPiece(which: SetPiece): void {
    void which;
  }

  /** Stream, animate and render one frame. `dt` real seconds, `fxDt` the FX clock (0 during a hit-stop). */
  frame(dt: number, fxDt: number, view: CameraPose): void {
    void dt;
    void fxDt;
    void view;
  }

  // ------------------------------------------------------------------------------------------------ what is on screen

  /** The live face blocks of the front slice as drawn now (CSS px), in model column order. Empty outside a drift. */
  faceCells(): CellRect[] {
    return [];
  }

  /** Every tappable, lamp, nav mark, rack tool, seal part and the lantern as drawn now, with padded hit rects. */
  targets(): ScreenTarget[] {
    return [];
  }

  /** The camera ray at a screen point (CSS px): the face, a tappable, a lamp, nav, the seal, skin, deep rock, or far. */
  pick(x: number, y: number): Pick {
    return { kind: 'far', point: { x, y, z: 0 }, dist: 12 };
  }

  // --------------------------------------------------------------------------------------------------- feedback

  /** A strike lands (tap or hold): the tool's contact pose toward `contactPx`, a crack from the tapped point, chips. */
  strike(pick: Pick, contactPx: { x: number; y: number }, crit = false): void {
    void pick;
    void contactPx;
    void crit;
  }

  /** Face blocks the model broke this frame: 6–9 shards each, nuggets for ore, the hole shows the block behind. */
  breakBlocks(cells: ReadonlyArray<BlockBreak>): void {
    void cells;
  }

  /** The slice at `depth` crumbles (5 of 7 down): the rest crack, shake 0.3 s on their own and fall as one burst. */
  crumble(depth: number): void {
    void depth;
  }

  /** The breach of node `node` falls inward (10–16 large shards, 0.6 s) while the leak widens. */
  breach(node: number): void {
    void node;
  }

  /** First light of node `node`'s chamber: t01 0 → 1 drives its fill 0.6 → 1.0 (a uniform, no light propagation). */
  firstLight(node: number, t01: number): void {
    void node;
    void t01;
  }

  /** A cold Halden lamp is relit (a per-pixel practical while you are in the chamber). */
  relight(lampId: string): void {
    void lampId;
  }

  /** A strike-type tappable or a skin cell was struck (`left` its remaining fraction; 0 = broken). */
  hitTappable(id: string, left: number, crit = false): void {
    void id;
    void left;
    void crit;
  }

  /** Deep rock answered a tap (two dark chips at the point). */
  tunk(point: Vec3): void {
    void point;
  }

  /** The focus pop: the object rises to 1.8 m ahead, 1.4 m up in 0.3 s, the world dims 30 %; off returns it. */
  focusPop(id: string, on: boolean): void {
    void id;
    void on;
  }

  /** The chest in the focus pop opens (its lid lifts, a warm glow; the roll-up is the HUD's). */
  openFocus(id: string): void {
    void id;
  }

  /** Lantern Raise toward a world point: the lantern lifts 0.2 s and a soft spot of light lands there for 1.4 s. */
  lanternRaise(point: Vec3): void {
    void point;
  }

  /** The single amber rim (SPEC §6.1): the id of a tappable, lamp, nav mark, rack tool or face block ('face:<col>'); null = none. */
  rim(id: string | null, bright = false): void {
    void id;
    void bright;
  }

  /** Crew line levels (Shovel Hand, Pick Crew, Mine Cart in W1): their rigs in the nooks, the scaffold and on the rail. */
  crew(lines: ArrayLike<number>): void {
    void lines;
  }

  /** The grade and fog of a biome (cross-faded over `seconds`). */
  look(biome: number, seconds = 0): void {
    void biome;
    void seconds;
  }

  /** The current grade parameters (C11 lint). */
  grade(): GradeParams {
    return { exposure: 1, saturation: 1, bloomThreshold: 1, bloomStrength: 0.2, vignette: 0.15 };
  }

  /** A camera shake (structural events only: ≤ 0.4°, ≤ 120 ms, one decaying swing). D's FX director gates it. */
  shake(deg: number, ms: number): void {
    void deg;
    void ms;
    this.counts.fx.shakes++;
  }

  /** The world dims through the grade (a sheet 30 %, the focus pop 30 %); 0 = none. */
  dim(amount: number): void {
    void amount;
  }

  // ------------------------------------------------------------------------------------------------- set pieces

  /** Dynamite: three charges hiss into the face (0.5 s fuse), one deep thump, `slices` blow out. */
  dynamite(slices: number): void {
    void slices;
  }

  /** The seal fight's view: the mechanism's HP left (0..1) and whether its weak point is lit. */
  seal(left: number, weakLit: boolean): void {
    void left;
    void weakLit;
  }

  /** The seal splits (≤ 40 shards, a 0.12 lift ≤ 150 ms) and light pours through the seams. */
  sealBreak(): void {}

  /** The Reveal composition of a biome's Threshold: its title carved in light for 1.6 s. */
  reveal(biome: number): void {
    void biome;
  }

  // ------------------------------------------------------------------------------------------------- tests

  /** Draw calls, triangles and the FX budget counters of the last frame. */
  stats(): FxStats {
    return this.counts;
  }

  /** Tests (C2, C8): render an ID buffer of the current view (ids 1..n per object, 0 = nothing) at CSS resolution. */
  idBuffer(): { width: number; height: number; ids: Uint16Array; names: string[] } {
    return { width: 0, height: 0, ids: new Uint16Array(0), names: [] };
  }

  dispose(): void {
    this.viewmodel.dispose();
  }
}
