// Taps → the model → the world (SPEC §3.1, §12.2 steps 1 and 4). Each queued input resolves entity first (chests and
// other tappables, inside the reach band of 4 m above and below the floor, CRITIQUE MUST 8), then the column under the
// thumb (vertical position ignored: a tap can never miss, L2). Every counted hit from any pointer shares one cap of
// 8 per second (CRITIQUE MUST 1); a hit over the cap still flashes its cell but deals nothing. Cells the model
// breaks are batched and applied to the voxel world once per frame.

import type { IdleBus, IdleEvents } from '../idle/bus';
import type { ModelTap } from '../idle/model/tap';
import { columnTops } from '../idle/model/shaft';
import type { IdleState } from '../idle/model/state';
import type { DescentBreak, DescentScene, PickedEntity } from '../render/descent/DescentScene';
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
  /** The column the target rule hit (−1: an entity). */
  col: number;
  /** The column under the finger (F3), before the target rule. */
  raw: number;
  row: number;
  kind: string;
  counted: boolean;
  entity: string;
  /** performance.now() at the pointerdown and the frame counter then (F1). */
  t: number;
  frame: number;
}

const RECORDS = 256;
/** Entity ids the model routes (W2.md seam 5). */
const MODEL_ID = /^(crystal|gem|fossil|crate|note|cache|creature|event|lantern|weak|chest|moth|find|widget):/;

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
  /** Hits so far on the scene's multi-tap props, and the tutorial crystals' model ids in the order first touched. */
  private readonly propHits = new Map<string, number>();
  private readonly crystalIds = new Map<string, string>();

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

  /** A tap the UI resolved itself (a Pick card, the Strike dial): straight to the model as an entity tap. */
  entityTap(id: string, frame: number): void {
    this.modelTap(-1, 'tap', id);
    if (this.records.length >= RECORDS) this.records.shift();
    this.records.push({ x: -1, y: -1, col: -1, raw: -1, row: -1, kind: 'tap', counted: true, entity: id, t: performance.now(), frame });
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
        if (picked && inReach(picked.y, floorY)) {
          const id = this.propEntity(picked, strips);
          if (id === '') {
            // A hit on a multi-tap prop that is not done yet: the thumb sees it, the model has nothing to do.
            this.record(tp, -1, picked.row, true, picked.id, frame);
            return -1;
          }
          if (id) entity = id;
        }
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
    this.record(tp, target >= 0 ? target : col, row, counted, '', frame, col);
    return target;
  }

  /**
   * The model's id for a scene prop that was tapped: '' for a hit that does not finish it yet, null when the model has
   * no use for it in this build (the tap then digs the column, as any other tap). W1: the tutorial grotto's crystal
   * clusters (B's props, `taps` hits each) become the model's `crystal:<n>` on their last hit.
   */
  private propEntity(p: PickedEntity, strips: { left: number; right: number }): string | null {
    // W2.md seam 5: the scene's tappables carry the model's ids; they go to the model as they are (it counts the hits
    // of multi-tap entities and answers with entity:hit / entity:done).
    if (MODEL_ID.test(p.id)) return p.id;
    if (p.kind !== 'crystal') return null;
    const hits = (this.propHits.get(p.id) ?? 0) + 1;
    this.propHits.set(p.id, hits);
    const col = Math.max(0, Math.min(6, Math.floor(((p.x - strips.left) / Math.max(1, strips.right - strips.left)) * 7)));
    if (hits < p.taps) {
      this.scene.burst('gem', p.row, col, 5);
      return '';
    }
    let id = this.crystalIds.get(p.id);
    if (!id) {
      id = `crystal:${this.crystalIds.size}`;
      this.crystalIds.set(p.id, id);
    }
    this.propHits.delete(p.id);
    this.scene.removeEntity(p.id);
    return id;
  }

  private record(tp: TapInput, col: number, row: number, counted: boolean, entity: string, frame: number, raw = -1): void {
    if (this.records.length >= RECORDS) this.records.shift();
    this.records.push({ x: tp.x, y: tp.y, col, raw, row, kind: tp.kind, counted, entity, t: tp.t, frame });
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
