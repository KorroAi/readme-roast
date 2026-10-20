// Event bubbles (SPEC §7.2 "Announced", §9.1; CRITIQUE critic 2 MUST 11): non-interactive 36 px badges at x 4–40 on
// the left margin, never over the shaft's columns: the event coming in 10 s (a rune-cyan ring counting down) and the
// live one (an amber ring draining with its window). The world entity is the tap target, never the badge. Built once
// (a pool of 3); writes only on change.

import { h } from '../dom';
import { spring } from '../fx/waapi';
import { iconEl, setIcon, type IconId } from './icons';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 15;
const C = 2 * Math.PI * R;

export interface BubbleView {
  id: string;
  icon: IconId;
  /** 0..1 of the ring (time left). */
  left: number;
  tone: 'soon' | 'live';
  label: string;
}

export class EventBubbles {
  readonly el: HTMLElement;
  private readonly items: Array<{ el: HTMLElement; ico: HTMLElement; arc: SVGCircleElement; id: string; left: number }> = [];

  constructor() {
    for (let i = 0; i < 3; i++) {
      const svg = document.createElementNS(SVG_NS, 'svg');
      svg.setAttribute('viewBox', '0 0 36 36');
      svg.setAttribute('class', 'dd-bubble-ring');
      const arc = document.createElementNS(SVG_NS, 'circle');
      arc.setAttribute('cx', '18');
      arc.setAttribute('cy', '18');
      arc.setAttribute('r', String(R));
      arc.style.strokeDasharray = `${C}`;
      svg.appendChild(arc);
      const ico = iconEl('moth', 'dd-bubble-ico');
      const el = h('span', { class: 'dd-bubble hide' }, svg, ico);
      this.items.push({ el, ico, arc, id: '', left: -1 });
    }
    this.el = h('div', { class: 'dd-bubbles', 'aria-hidden': 'true', 'data-hud': 'bubbles' }, ...this.items.map((x) => x.el));
  }

  update(list: readonly BubbleView[]): void {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i];
      const v = list[i];
      if (!v) {
        if (it.id) {
          it.id = '';
          it.el.classList.add('hide');
        }
        continue;
      }
      if (v.id !== it.id) {
        it.id = v.id;
        setIcon(it.ico, v.icon);
        it.el.dataset.tone = v.tone;
        it.el.setAttribute('title', v.label);
        it.el.classList.remove('hide');
        spring(it.el, 'bounce', 0.3, 1, (k) => `scale(${k})`);
      }
      if (it.el.dataset.tone !== v.tone) it.el.dataset.tone = v.tone;
      const left = Math.round(Math.max(0, Math.min(1, v.left)) * 100) / 100;
      if (left !== it.left) {
        it.left = left;
        it.arc.style.strokeDashoffset = `${C * (1 - left)}`;
      }
    }
  }
}
