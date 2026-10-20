// The popped-out chests (SPEC §5.8, W1): until the world draws its own chest entity, the HUD shows each waiting chest
// as a small brass chest on the floor ledge with a slow bob and a glint, where the tap that opens it lands. The
// markers are built once (a pool of 4) and never take a tap (pointer-events: none): the tap goes through to the
// world, where DigController resolves the chest entity first (SPEC §3.1).

import { h } from '../dom';
import { iconEl } from './icons';

const POOL = 4;

export class ChestMarkers {
  readonly el: HTMLElement;
  private readonly marks: Array<{ el: HTMLElement; key: string; on: boolean }> = [];

  constructor() {
    this.el = h('div', { class: 'dd-chests', 'aria-hidden': 'true' });
    for (let i = 0; i < POOL; i++) {
      const el = h('span', { class: 'dd-chest-mark hide' }, h('span', { class: 'dd-chest-bob' }, iconEl('chest', 'dd-chest-ico'), h('i', { class: 'dd-chest-glint' })));
      this.marks.push({ el, key: '', on: false });
      this.el.appendChild(el);
    }
  }

  /** Place one marker per waiting chest (CSS px of its centre); writes only what changed. */
  update(list: ReadonlyArray<{ x: number; y: number }>): void {
    for (let i = 0; i < POOL; i++) {
      const m = this.marks[i];
      const c = list[i];
      if (!c) {
        if (m.on) {
          m.on = false;
          m.key = '';
          m.el.classList.add('hide');
        }
        continue;
      }
      const x = Math.round(c.x);
      const y = Math.round(c.y);
      const key = `${x},${y}`;
      if (key !== m.key) {
        m.key = key;
        m.el.style.transform = `translate(${x}px, ${y}px)`;
      }
      if (!m.on) {
        m.on = true;
        m.el.classList.remove('hide');
      }
    }
  }
}
