// Taps → the model → the world (SPEC §3.1, §12.2 steps 1 and 4). Each queued input resolves entity first (chests and
// other tappables, inside the reach band of 4 m above and below the floor, CRITIQUE MUST 8), then the column under the
// thumb (vertical position ignored: a tap can never miss, L2). Every counted hit from any pointer shares one cap of
// 8 per second (CRITIQUE MUST 1); a hit over the cap still flashes its cell but deals nothing. Cells the model
// breaks are batched and applied to the voxel world once per frame.

import type { IdleBus, IdleEvents } from '../idle/bus';
import type { ModelTap } from '../idle/model/tap';
import { columnTops } from '../idle/model/shaft';
import type { IdleState } from '../idle/model/state';
import type { DescentBreak, DescentScene } from '../render/descent/DescentScene';
import { TapCap, columnAt, inReach, targetColumn, type TapInput } from '../ui/idle/TapSurface';

/** A tappable the UI knows about (chests popped out, the moth): its id and screen circle. */
export interface UiEntity {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface TapRecord {
  x: number;
  y: number;
  col: number;
  row: number;
  kind: string;
  counted: boolean;
  entity: string;
  /** performance.now() at the pointerdown and the frame counter then (F1). */
  t: number;
  frame: number;
}

const RECORDS = 256;

export class DigController {
  readonly cap = new TapCap();
  /** The model taps of this frame (reused). */
  readonly taps: ModelTap[] = [];
  private readonly pool: ModelTap[] = [];
  private readonly breaks: DescentBreak[] = [];
  private readonly breakPool: DescentBreak[] = [];
  private readonly tops = new Float64Array(7);
  /** Recent taps and how they resolved (the debug surface: F2, F3). */
  readonly records: TapRecord[] = [];
  /** Frames from each recent pointerdown to the frame that showed it (F1). */
  readonly tapFrames: number[] = [];
  private readonly pendingFrames: Array<{ frame: number }> = [];
  private readonly offs: Array<() => void> = [];
  /** UI-drawn tappables (W1: popped chests), checked before the scene's own. */
  entities: () => readonly UiEntity[] = () => [];
  /** Cells that took a hit over the cap this frame (they flash, nothing else). */
  capped = 0;

  constructor(
    bus: IdleBus,
    private readonly scene: DescentScene,
    private readonly state: () => IdleState,
  ) {
    const onBreak = (p: IdleEvents['cell:break']) => {
      const b = this.breakPool.pop() ?? { row: 0, col: 0, kind: 0 };
      b.row = p.depth;
      b.col = p.col;
      b.kind = p.kind;
      b.crumble = p.source === 'crumble';
      b.crew = p.source === 'crew';
      this.breaks.push(b);
    };
    this.offs.push(bus.on('cell:break', onBreak));
  }

  private modelTap(col: number, kind: ModelTap['kind'], entity?: string): void {
    const t = this.pool.pop() ?? { col: 0, kind: 'tap' };
    t.col = col;
    t.kind = kind;
    if (entity) t.entity = entity;
    else delete t.entity;
    this.taps.push(t);
  }

  /** Start a frame: recycle last frame's taps. */
  begin(): void {
    for (const t of this.taps) this.pool.push(t);
    this.taps.length = 0;
    this.capped = 0;
  }

  /**
   * Resolve one input into a model tap (or a capped flash). `frame` is the frame counter now; `now` ms.
   * @returns the column hit (−1 for an entity).
   */
  input(tp: TapInput, frame: number, now: number): number {
    const strips = this.scene.columns();
    const floorY = strips.floorY;
    // Entity first (inside the reach band).
    let entity = '';
    if (tp.kind === 'tap' && inReach(tp.y, floorY)) {
      for (const e of this.entities()) {
        if (Math.hypot(tp.x - e.x, tp.y - e.y) <= Math.max(32, e.r + 10)) {
          entity = e.id;
          break;
        }
      }
      if (!entity) {
        const picked = this.scene.pickEntity(tp.x, tp.y);
        if (picked && inReach(picked.y, floorY)) entity = picked.id;
      }
    }
    if (entity) {
      this.modelTap(-1, 'tap', entity);
      this.record(tp, -1, -1, true, entity, frame);
      return -1;
    }
    const col = columnAt(tp.x, strips);
    const s = this.state();
    columnTops(s, this.tops);
    const target = targetColumn(col, this.tops);
    const row = target >= 0 ? s.run.depth + this.tops[target] : s.run.depth;
    const counted = this.cap.admit(now);
    if (counted) this.modelTap(col, tp.kind === 'key' ? 'key' : tp.kind);
    else {
      // Over the cap: the thumb still sees its hit (a flash), but nothing is dealt.
      this.capped++;
      if (target >= 0) this.scene.cellFx(row, target, 0.4, 0.4, 0);
    }
    this.record(tp, target >= 0 ? target : col, row, counted, '', frame);
    return target;
  }

  private record(tp: TapInput, col: number, row: number, counted: boolean, entity: string, frame: number): void {
    if (this.records.length >= RECORDS) this.records.shift();
    this.records.push({ x: tp.x, y: tp.y, col, row, kind: tp.kind, counted, entity, t: tp.t, frame });
    if (tp.kind === 'tap') this.pendingFrames.push({ frame });
  }

  /**
   * The frame that drew this frame's taps: their pointerdown → first changed frame counts (F1). A pointerdown handled
   * before this rAF is drawn by it: 1 frame.
   */
  drawn(frame: number, downFrames: readonly number[]): void {
    for (const f of downFrames) {
      if (this.tapFrames.length >= RECORDS) this.tapFrames.shift();
      this.tapFrames.push(Math.max(1, frame - f));
    }
    this.pendingFrames.length = 0;
  }

  /** Apply this frame's broken cells to the voxel world (one call; the scene batches its light fill). */
  flushBreaks(): void {
    if (!this.breaks.length) return;
    this.scene.applyBreaks(this.breaks);
    for (const b of this.breaks) this.breakPool.push(b);
    this.breaks.length = 0;
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.offs.length = 0;
  }
}
