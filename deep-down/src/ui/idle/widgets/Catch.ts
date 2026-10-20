// Catch (SPEC §7.3): targets cross on curves; tap each (moths, crystals, boulders, bubbles, stars). Each target follows
// its EventPath (a quadratic Bézier in shaft coordinates, inside the reach band: CRITIQUE MUST 8), drawn as a glowing
// orb with its icon where B's 3D entity flies; the orb is the tap target (44 px radius). A counter and a timer ride
// under the goal bar. A target that leaves uncaught fades; nothing is lost.

import type { CatchWidget } from '../../../idle/model/state';
import { pathAt } from '../../../idle/model/widgets';
import { h } from '../../dom';
import { TargetSprite, WidgetBar } from './common';
import type { WidgetSource, WidgetTarget, WidgetUi } from './types';

const POOL = 12;
const HIT_R = 44;

export class CatchUi implements WidgetUi {
  readonly kind = 'catch' as const;
  readonly el: HTMLElement;
  widgetId = '';
  private owner = '';
  private floor0 = 0;
  private readonly sprites: TargetSprite[] = [];
  private readonly bar = new WidgetBar();
  private readonly list: WidgetTarget[] = [];
  private closing = 0;

  constructor(private readonly src: WidgetSource) {
    for (let i = 0; i < POOL; i++) this.sprites.push(new TargetSprite());
    this.el = h('div', { class: 'dd-widget dd-w-catch hide', 'aria-hidden': 'true' }, this.bar.el, ...this.sprites.map((s) => s.el));
    for (let i = 0; i < POOL; i++) this.list.push({ id: '', x: 0, y: 0, r: HIT_R });
    this.list.length = 0;
  }

  get idle(): boolean {
    return this.widgetId === '' && this.closing === 0;
  }

  open(widgetId: string, owner: string, floor: number, now: number): void {
    void now;
    this.widgetId = widgetId;
    this.owner = owner;
    this.floor0 = floor;
    this.closing = 0;
    for (const s of this.sprites) s.hide();
    this.el.classList.remove('hide');
    this.bar.show('gold');
  }

  private view(): CatchWidget | null {
    const w = this.src.widget(this.widgetId);
    return w && w.kind === 'catch' ? w : null;
  }

  frame(now: number, dt: number): void {
    void dt;
    if (this.closing && now >= this.closing) {
      this.closing = 0;
      this.el.classList.add('hide');
      this.bar.hide();
      for (const s of this.sprites) s.hide();
    }
    this.list.length = 0;
    if (!this.widgetId) return;
    const w = this.view();
    if (!w) return;
    const t = this.src.time();
    let caught = 0;
    for (const tg of w.targets) if (tg.state === 'caught') caught++;
    // Each live target on screen gets a sprite (keyed by id); finished ones play out.
    for (const tg of w.targets) {
      let sp = this.sprites.find((s) => s.id === tg.id);
      const live = tg.state === 'live' && t >= tg.t0 && t <= tg.t1;
      if (!live) {
        if (sp) {
          if (tg.state === 'caught') sp.caught();
          else sp.missed();
        }
        continue;
      }
      if (!sp) {
        sp = this.sprites.find((s) => !s.on);
        if (!sp) continue;
        sp.show(tg.id, tg.kind, this.src.drawn(tg.id));
      }
      const u = (t - tg.t0) / Math.max(1e-6, tg.t1 - tg.t0);
      const p = pathAt(tg.path, u);
      const at = this.src.screen(p.x, p.y, this.floor0);
      sp.place(at.x, at.y, tg.need > 1 ? 1 - tg.hits / tg.need : 1);
      if (this.list.length < POOL) this.list.push({ id: tg.id, x: at.x, y: at.y, r: HIT_R });
    }
    const end = w.born + w.life;
    const left = Number.isFinite(end) ? (end - t) / Math.max(1e-6, w.life) : 1;
    this.bar.set(this.src.text('ui.widget.catch', { n: caught, of: w.targets.length }), left);
    void this.owner;
  }

  targets(): readonly WidgetTarget[] {
    return this.list;
  }

  hit(id: string, now: number): void {
    void now;
    this.sprites.find((s) => s.id === id)?.bump();
  }

  close(result: string, now: number): void {
    void result;
    // Every sprite still flying plays out (caught pops, misses fade), then the layer hides.
    const w = this.view();
    if (w) for (const tg of w.targets) {
      const sp = this.sprites.find((s) => s.id === tg.id);
      if (!sp) continue;
      if (tg.state === 'caught') sp.caught();
      else sp.missed();
    }
    this.widgetId = '';
    this.list.length = 0;
    this.closing = now + 320;
  }
}
