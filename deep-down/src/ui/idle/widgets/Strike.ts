// Strike (SPEC §7.3): a needle sweeps a brass arc (0.9 s a pass, there and back); a tap on the dial stops it. The
// perfect zone (8 %, white-gold) pays ×5 (×10 for a seal finisher), the good zone (25 %, amber) ×2. Up to 3 needles,
// shown as pips. The model owns the needle (strikePos), so what the thumb sees is what it gets. The dial floats above
// the floor (2.6 m up), never over the floor row: taps on the seal or the rock keep digging. pointerdown stops the
// needle (never click: the timing is the game).

import type { StrikeWidget } from '../../../idle/model/state';
import { strikePos } from '../../../idle/model/widgets';
import { h } from '../../dom';
import { spring, tween } from '../../fx/waapi';
import type { WidgetSource, WidgetTarget, WidgetUi } from './types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 70;
const CX = 84;
const CY = 82;

/** Point on the dial's arc at position u (0 = left, 1 = right), radius r. */
function arcPt(u: number, r: number): { x: number; y: number } {
  const a = Math.PI * (1 - u);
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) };
}

/** An SVG arc path from u0 to u1 at radius r. */
function arcPath(u0: number, u1: number, r: number): string {
  const a = arcPt(Math.max(0, u0), r);
  const b = arcPt(Math.min(1, u1), r);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export class StrikeUi implements WidgetUi {
  readonly kind = 'strike' as const;
  readonly el: HTMLElement;
  widgetId = '';
  private owner = '';
  private floor0 = 0;
  private readonly dial: HTMLButtonElement;
  private readonly good: SVGPathElement;
  private readonly perfect: SVGPathElement;
  private readonly needle: SVGLineElement;
  private readonly pips: HTMLElement[] = [];
  private readonly label: HTMLElement;
  private readonly grade: HTMLElement;
  private closing = 0;
  private zoneS = '';
  private needleS = '';
  private placed = '';
  private gradesSeen = 0;

  constructor(private readonly src: WidgetSource) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 168 100');
    svg.setAttribute('class', 'dd-strike-svg');
    svg.setAttribute('aria-hidden', 'true');
    const track = document.createElementNS(SVG_NS, 'path');
    track.setAttribute('d', arcPath(0, 1, R));
    track.setAttribute('class', 'dd-strike-track');
    this.good = document.createElementNS(SVG_NS, 'path');
    this.good.setAttribute('class', 'dd-strike-good');
    this.perfect = document.createElementNS(SVG_NS, 'path');
    this.perfect.setAttribute('class', 'dd-strike-perfect');
    this.needle = document.createElementNS(SVG_NS, 'line');
    this.needle.setAttribute('class', 'dd-strike-needle');
    this.needle.setAttribute('x1', String(CX));
    this.needle.setAttribute('y1', String(CY));
    const hub = document.createElementNS(SVG_NS, 'circle');
    hub.setAttribute('cx', String(CX));
    hub.setAttribute('cy', String(CY));
    hub.setAttribute('r', '7');
    hub.setAttribute('class', 'dd-strike-hub');
    svg.append(track, this.good, this.perfect, this.needle, hub);
    const pipRow = h('span', { class: 'dd-strike-pips' });
    for (let i = 0; i < 3; i++) {
      const p = h('i', { class: 'dd-strike-pip' });
      this.pips.push(p);
      pipRow.appendChild(p);
    }
    this.label = h('span', { class: 'dd-strike-label' });
    this.grade = h('span', { class: 'dd-strike-grade hide' });
    this.dial = h('button', { class: 'dd-strike', type: 'button', 'data-hud': 'strike' }, svg, this.label, pipRow, this.grade);
    this.dial.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.widgetId) this.src.tap(this.widgetId);
    });
    this.el = h('div', { class: 'dd-widget dd-w-strike hide' }, this.dial);
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
    this.zoneS = '';
    this.placed = '';
    this.gradesSeen = 0;
    this.grade.classList.add('hide');
    for (const p of this.pips) p.className = 'dd-strike-pip';
    this.label.textContent = this.src.text(owner === 'seal' ? 'ui.widget.finisher' : 'ui.widget.strike');
    this.dial.setAttribute('aria-label', this.label.textContent ?? '');
    // Placed now: the model fills its widget after announcing it, and the dial must never paint at the origin.
    this.place();
    this.el.classList.remove('hide');
    spring(this.dial, 'bounce', 0.3, 1, (v) => `scale(${v})`);
  }

  /** Above the floor's centre, in the stage (never over the floor row), inside the lower 65 % of the world region. */
  private place(): void {
    const at = this.src.screen(3, -1.5, this.src.floor());
    const key = `${Math.round(at.x)},${Math.round(at.y)}`;
    if (key !== this.placed) {
      this.placed = key;
      this.el.style.transform = `translate(${Math.round(at.x)}px, ${Math.round(at.y)}px)`;
    }
  }

  private view(): StrikeWidget | null {
    const w = this.src.widget(this.widgetId);
    return w && w.kind === 'strike' ? w : null;
  }

  frame(now: number, dt: number): void {
    void dt;
    if (this.closing && now >= this.closing) {
      this.closing = 0;
      this.el.classList.add('hide');
    }
    if (!this.widgetId) return;
    const w = this.view();
    if (!w) return;
    this.place();
    const zone = `${w.zone.toFixed(3)}|${w.good}|${w.perfect}`;
    if (zone !== this.zoneS) {
      this.zoneS = zone;
      this.good.setAttribute('d', arcPath(w.zone - w.good / 2, w.zone + w.good / 2, R));
      this.perfect.setAttribute('d', arcPath(w.zone - w.perfect / 2, w.zone + w.perfect / 2, R));
    }
    const u = strikePos(w, this.src.time());
    const tip = arcPt(u, R + 8);
    const ns = `${tip.x.toFixed(1)},${tip.y.toFixed(1)}`;
    if (ns !== this.needleS) {
      this.needleS = ns;
      this.needle.setAttribute('x2', tip.x.toFixed(1));
      this.needle.setAttribute('y2', tip.y.toFixed(1));
    }
    for (let i = 0; i < 3; i++) {
      const p = this.pips[i];
      const want = i >= w.needles ? 'dd-strike-pip off' : i < w.grades.length ? `dd-strike-pip ${w.grades[i]}` : i === w.grades.length ? 'dd-strike-pip live' : 'dd-strike-pip';
      if (p.className !== want) p.className = want;
    }
    if (w.grades.length > this.gradesSeen) {
      this.gradesSeen = w.grades.length;
      this.showGrade(w.grades[w.grades.length - 1]);
    }
    void this.floor0;
    void this.owner;
  }

  private showGrade(g: string): void {
    const key = g === 'perfect' ? (this.owner === 'seal' ? 'ui.widget.perfect10' : 'ui.widget.perfect') : g === 'good' ? 'ui.widget.good' : 'ui.widget.miss';
    this.grade.textContent = this.src.text(key);
    this.grade.dataset.grade = g;
    this.grade.classList.remove('hide');
    spring(this.grade, 'snap', 1.8, 1, (v) => `translateX(-50%) rotate(${((v - 1) / 0.8) * -8}deg) scale(${v})`);
    if (g === 'perfect') tween(this.dial, [{ filter: 'brightness(2)' }, { filter: 'brightness(1)' }], 380, 'outCubic');
  }

  targets(): readonly WidgetTarget[] {
    return NONE;
  }

  hit(id: string, now: number): void {
    void id;
    void now;
    spring(this.dial, 'jelly', 0.92, 1, (v) => `scale(${v})`);
  }

  close(result: string, now: number): void {
    void result;
    // The last grade stays readable for a beat, then the dial goes.
    this.widgetId = '';
    this.closing = now + 650;
  }
}

const NONE: WidgetTarget[] = [];
