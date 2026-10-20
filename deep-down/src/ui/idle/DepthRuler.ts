// The Depth Ruler v1 (SPEC §8.6): a non-interactive strip down the right edge (CRITIQUE MUST 7/11: it never takes a
// tap; the ruler sits in the right margin, nothing interactive on the left), from 10 m above the floor to 80 m below
// it. Its "you are here" notch is aligned with the floor's screen y, so it is part of the world; the next metres get
// the most room (a soft log compression below the floor). Ticks every 10 m, labels every 20 m, the next seal with its
// name and distance, chest cells. It answers "what's next?" without words. Every element is made up front.

import { formatDepth } from '../../idle/num/notation';
import { h } from '../dom';
import { iconEl, type IconId } from './icons';

export interface RulerMark {
  depth: number;
  kind: 'chest' | 'seal' | 'biome' | 'record';
  /** A short label ('' none): the seal's name. */
  label: string;
}

const TICKS = 12;
const LABELS = 6;
const MARKS = 8;
const ABOVE = 10;
const BELOW = 80;
/** The compression constant of the soft log scale below the floor (m). */
const K = 18;

/** Pure: screen y of depth `d` given the floor (fractional) depth, the floor's y and the ruler's top and bottom. */
export function rulerY(d: number, floor: number, floorY: number, top: number, bottom: number): number {
  const delta = d - floor;
  if (delta <= 0) return floorY + (delta / ABOVE) * (floorY - top);
  const norm = (1 - Math.exp(-delta / K)) / (1 - Math.exp(-BELOW / K));
  return floorY + norm * (bottom - floorY);
}

export class DepthRuler {
  readonly el: HTMLElement;
  private readonly notch: HTMLElement;
  private readonly ticks: HTMLElement[] = [];
  private readonly labels: HTMLElement[] = [];
  private readonly marks: Array<{ el: HTMLElement; icos: Record<string, HTMLElement>; text: HTMLElement; kind: string; label: string; y: number; shown: boolean }> = [];
  private readonly tickY: number[] = [];
  private readonly labelY: number[] = [];
  private readonly labelText: string[] = [];
  private top = 0;
  private bottom = 1;
  private lastKey = '';

  constructor() {
    this.notch = h('span', { class: 'dd-ruler-notch' });
    this.el = h('div', { class: 'dd-ruler hide', 'aria-hidden': 'true', 'data-hud': 'ruler' }, h('span', { class: 'dd-ruler-rail' }));
    for (let i = 0; i < TICKS; i++) {
      const t = h('span', { class: 'dd-ruler-tick' });
      this.ticks.push(t);
      this.tickY.push(NaN);
      this.el.appendChild(t);
    }
    for (let i = 0; i < LABELS; i++) {
      const l = h('span', { class: 'dd-ruler-label' });
      this.labels.push(l);
      this.labelY.push(NaN);
      this.labelText.push('');
      this.el.appendChild(l);
    }
    for (let i = 0; i < MARKS; i++) {
      // One icon per kind, made now and toggled (no element is created while playing).
      const icos: Record<string, HTMLElement> = {};
      for (const [kind, id] of [['chest', 'chest'], ['seal', 'seal'], ['biome', 'flag'], ['record', 'flag']] as Array<[string, IconId]>) {
        icos[kind] = iconEl(id, 'dd-ruler-ico');
        icos[kind].style.display = 'none';
      }
      const text = h('span', { class: 'dd-ruler-mark-t' });
      const el = h('span', { class: 'dd-ruler-mark', style: 'display:none' }, ...Object.values(icos), text);
      this.marks.push({ el, icos, text, kind: '', label: '', y: NaN, shown: false });
      this.el.appendChild(el);
    }
    this.el.appendChild(this.notch);
  }

  /** The ruler's extent in CSS px (top and bottom of the strip). */
  setBounds(top: number, bottom: number): void {
    this.top = top;
    this.bottom = bottom;
    this.lastKey = '';
  }

  reveal(): void {
    this.el.classList.remove('hide');
  }

  /**
   * Lay out for a fractional floor depth (the camera's follow, so the ruler moves with the world) and the floor's
   * screen y. Writes only what moved.
   */
  update(floor: number, floorY: number, marks: readonly RulerMark[]): void {
    const key = `${floor.toFixed(3)}|${floorY.toFixed(1)}|${marks.length}|${marks.length ? marks[0].depth : 0}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const top = this.top;
    const bottom = this.bottom;
    const ny = Math.round(floorY - top);
    this.notch.style.transform = `translateY(${ny}px)`;
    // Ticks every 10 m from 10 m above.
    const first = Math.ceil((floor - ABOVE) / 10) * 10;
    for (let i = 0; i < TICKS; i++) {
      const d = first + i * 10;
      const y = d <= floor + BELOW && d >= 0 ? Math.round(rulerY(d, floor, floorY, top, bottom) - top) : NaN;
      if (y !== this.tickY[i] && !(Number.isNaN(y) && Number.isNaN(this.tickY[i]))) {
        this.tickY[i] = y;
        const el = this.ticks[i];
        if (Number.isNaN(y)) el.style.display = 'none';
        else {
          el.style.display = '';
          el.style.transform = `translateY(${y}px)`;
          el.classList.toggle('major', d % 20 === 0);
        }
      }
    }
    // Labels every 20 m below the floor (not on the notch). Far below, the soft log scale packs them: a label closer
    // than a line (15 px) to the one above it, or to the next seal's mark, is left out.
    const firstL = Math.ceil((floor + 3) / 20) * 20;
    let lastY = ny;
    const sealY = marks.find((m) => m.kind === 'seal' && m.depth >= floor && m.depth <= floor + BELOW);
    const markY = sealY ? Math.round(rulerY(sealY.depth, floor, floorY, top, bottom) - top) : NaN;
    for (let i = 0; i < LABELS; i++) {
      const d = firstL + i * 20;
      let y = d <= floor + BELOW ? Math.round(rulerY(d, floor, floorY, top, bottom) - top) : NaN;
      if (!Number.isNaN(y) && (y - lastY < 15 || Math.abs(y - markY) < 15)) y = NaN;
      if (!Number.isNaN(y)) lastY = y;
      const el = this.labels[i];
      const text = Number.isNaN(y) ? '' : formatDepth(d);
      if (text !== this.labelText[i]) {
        this.labelText[i] = text;
        el.textContent = text;
      }
      if (y !== this.labelY[i] && !(Number.isNaN(y) && Number.isNaN(this.labelY[i]))) {
        this.labelY[i] = y;
        if (Number.isNaN(y)) el.style.display = 'none';
        else {
          el.style.display = '';
          el.style.transform = `translateY(${y}px)`;
        }
      }
    }
    // Marks.
    for (let i = 0; i < MARKS; i++) {
      const slot = this.marks[i];
      const m = marks[i];
      const visible = !!m && m.depth >= floor - ABOVE && m.depth <= floor + BELOW;
      if (!visible) {
        if (slot.shown) {
          slot.shown = false;
          slot.el.style.display = 'none';
        }
        continue;
      }
      if (!slot.shown) {
        slot.shown = true;
        slot.el.style.display = '';
      }
      if (m.kind !== slot.kind) {
        if (slot.kind) slot.icos[slot.kind].style.display = 'none';
        slot.kind = m.kind;
        slot.el.className = `dd-ruler-mark ${m.kind}`;
        slot.icos[m.kind].style.display = '';
      }
      const label = m.label ? `${m.label} · ${formatDepth(Math.max(0, Math.round(m.depth - floor)))}` : '';
      if (label !== slot.label) {
        slot.label = label;
        slot.text.textContent = label;
      }
      const y = Math.round(rulerY(m.depth, floor, floorY, top, bottom) - top);
      if (y !== slot.y) {
        slot.y = y;
        slot.el.style.transform = `translateY(${y}px)`;
      }
    }
  }
}
