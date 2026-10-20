// The widget UI contract (SPEC §7.3; BUILD §3.3 contracts): the five reusable one-tap verbs (Catch, Mash, Strike,
// Sequence, Pick) share one component shape. A widget UI opens on the model's `widget:start`, reads the model's own
// widget state every frame (src/idle/model/widgets.ts: CatchWidget, MashWidget, StrikeWidget, SequenceWidget,
// PickWidget), draws its overlay in the ceremony layer (z 3) and exposes its tappable targets in screen space.
// DigController hit-tests those targets first (entity first, SPEC §3.1) and sends the hit to the model as an entity id
// (W2.md seam 5: `event:<eventId>:<n>` for event targets, `<widgetId>` for a Strike's dial, `<widgetId>:<i>` for a
// Sequence mark or a Pick card), so a tap on a target is never a dig and a tap anywhere else always digs (SPEC §7.3:
// "never blocks digging outside its target"). Every widget times out by itself, and a miss removes nothing.

import type { WidgetKind } from '../../../idle/bus';
import type { WidgetState } from '../../../idle/model/state';

export type { WidgetKind } from '../../../idle/bus';

/** A tappable target on screen (CSS px). `id` is the model's entity id. */
export interface WidgetTarget {
  id: string;
  x: number;
  y: number;
  /** Hit radius (≥ 32 px; Catch targets use 44 px, SPEC §7.3). */
  r: number;
}

/** What a widget UI reads each frame (IdleGame implements it over the model and the scene). */
export interface WidgetSource {
  /** The model's widget by id (null once it is gone). */
  widget(id: string): WidgetState | null;
  /**
   * Screen point (CSS px) of a shaft position: `x` in columns (0 = the left cell's centre, 6 the right one's; the walls
   * at −0.8 and 6.8), `y` in rows below the floor's top at `floorDepth` (negative: above). The floor may have moved
   * since: the point stays put in the world.
   */
  screen(x: number, y: number, floorDepth: number): { x: number; y: number };
  /** The floor's depth now (rows). */
  floor(): number;
  /** The world region now. */
  region(): { top: number; bottom: number; left: number; right: number };
  /** The model clock (s). */
  time(): number;
  /** Text for a key the model names ('' when it has none yet: nothing unworded is shown). */
  text(key: string, params?: Record<string, string | number>): string;
  /** Send a tap on a target straight to the model (DOM targets such as Pick cards). */
  tap(id: string): void;
  /** The world draws this target itself (B's 3D entity): the UI then draws only its tap ring. */
  drawn(id: string): boolean;
  /** Motion level (Reduced: no travel; Off: static). */
  motion(): 'full' | 'reduced' | 'off';
}

/** One widget's UI. */
export interface WidgetUi {
  readonly kind: WidgetKind;
  /** The overlay (built once; mounted in the ceremony layer; only DOM targets take pointer events). */
  readonly el: HTMLElement;
  /** The model widget it shows ('' when closed). */
  readonly widgetId: string;
  /** Open on a model widget (`floor` the floor depth at the start; `now` ms). */
  open(widgetId: string, owner: string, floor: number, now: number): void;
  /** Per frame: read the widget, place the targets, animate. */
  frame(now: number, dt: number): void;
  /** The tappable targets drawn by this UI (DigController hit-tests them first); DOM targets are not listed. */
  targets(): readonly WidgetTarget[];
  /** A target was hit (the model takes it in the same frame): local feedback only. */
  hit(id: string, now: number): void;
  /** The widget closed (`widget:end`): play the result and hide. */
  close(result: string, now: number): void;
  /** Hidden and ready for the next one. */
  readonly idle: boolean;
}
