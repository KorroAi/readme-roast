// Mounts the five widget UIs (SPEC §7.3) and routes the model's widget events to them: `widget:start` opens the UI of
// its kind, `event:hit` / `widget:input` give local feedback, `widget:end` closes it. Two widgets may run at once
// (an event's and a seal finisher's), so each kind keeps a small pool. The host also answers DigController's
// entity-first hit test with every live target in screen space, and states which widget the debug surface shows.

import type { IdleBus, IdleEvents, WidgetKind } from '../../../idle/bus';
import { h } from '../../dom';
import { CatchUi } from './Catch';
import { MashUi } from './Mash';
import { PickUi } from './Pick';
import { SequenceUi } from './Sequence';
import { StrikeUi } from './Strike';
import type { WidgetSource, WidgetTarget, WidgetUi } from './types';

export class WidgetHost {
  readonly el: HTMLElement;
  private readonly pools: Record<WidgetKind, WidgetUi[]>;
  private readonly all: WidgetUi[] = [];
  private readonly offs: Array<() => void> = [];
  private readonly list: WidgetTarget[] = [];
  /** Widgets opened so far by kind (the debug surface and tests). */
  readonly opened: Record<string, number> = {};

  constructor(private readonly src: WidgetSource, bus: IdleBus) {
    const two = <T extends WidgetUi>(mk: () => T): T[] => [mk(), mk()];
    this.pools = {
      catch: two(() => new CatchUi(src)),
      mash: two(() => new MashUi(src)),
      strike: two(() => new StrikeUi(src)),
      sequence: [new SequenceUi(src)],
      pick: [new PickUi(src)],
    };
    for (const k of Object.keys(this.pools) as WidgetKind[]) this.all.push(...this.pools[k]);
    this.el = h('div', { class: 'dd-widgets' }, ...this.all.map((w) => w.el));
    const on = <K extends keyof IdleEvents>(k: K, fn: (p: IdleEvents[K]) => void) => this.offs.push(bus.on(k, fn));
    on('widget:start', (p) => this.start(p.id, p.kind, p.owner));
    on('widget:end', (p) => this.find(p.id)?.close(p.result, performance.now()));
    on('event:hit', (p) => {
      for (const w of this.all) if (w.widgetId) w.hit(p.id, performance.now());
    });
    on('widget:input', (p) => this.find(p.id)?.hit(p.grade, performance.now()));
  }

  private find(widgetId: string): WidgetUi | undefined {
    return this.all.find((w) => w.widgetId === widgetId);
  }

  private start(id: string, kind: WidgetKind, owner: string): void {
    // Facet hands and the seal's own HUD have their UIs elsewhere; the facet hand is a Pick shown by FacetHand.
    if (owner === 'facet') return;
    const pool = this.pools[kind];
    if (!pool) return;
    const ui = pool.find((w) => w.idle) ?? pool.find((w) => !w.widgetId);
    if (!ui) return;
    this.opened[kind] = (this.opened[kind] ?? 0) + 1;
    ui.open(id, owner, this.src.floor(), performance.now());
  }

  /** Per frame (`now` ms, `dt` s). */
  frame(now: number, dt: number): void {
    for (const w of this.all) w.frame(now, dt);
  }

  /** Every live target in screen space (DigController hit-tests these first). */
  targets(): readonly WidgetTarget[] {
    this.list.length = 0;
    for (const w of this.all) if (w.widgetId) for (const t of w.targets()) this.list.push(t);
    return this.list;
  }

  /** The first open widget (the debug surface). */
  current(): { kind: string; widgetId: string; targets: WidgetTarget[] } | null {
    const w = this.all.find((x) => x.widgetId);
    return w ? { kind: w.kind, widgetId: w.widgetId, targets: w.targets().map((t) => ({ ...t })) } : null;
  }

  /** Every widget UI that is open (tests). */
  get openCount(): number {
    return this.all.filter((w) => w.widgetId).length;
  }

  dispose(): void {
    for (const o of this.offs) o();
    this.offs.length = 0;
  }
}
