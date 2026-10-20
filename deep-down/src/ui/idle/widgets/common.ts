// Shared pieces of the widget UIs: a pooled target sprite (a glowing orb with an icon, a hit ring for multi-tap
// targets), the timer bar under the goal bar, and the icon of each target kind. Everything is built once; opening and
// closing a widget only toggles classes and writes transforms (no element is created during play, F10).

import { h } from '../../dom';
import { spring, tween } from '../../fx/waapi';
import { iconEl, setIcon, type IconId } from '../icons';

/** The icon a target kind shows (B may draw the 3D entity as well; the orb is the tap target either way). */
export function targetIcon(kind: string): IconId {
  switch (kind) {
    case 'moth':
      return 'moth';
    case 'crystal':
    case 'gem':
    case 'bubble':
      return 'gem';
    case 'crate':
    case 'mimic':
      return 'chest';
    case 'mole':
    case 'critter':
    case 'creature':
      return 'creature';
    case 'rune':
      return 'codex';
    case 'boulder':
    case 'pebble':
      return 'quake';
    case 'star':
    case 'meteor':
      return 'star';
    case 'root':
      return 'lantern';
    default:
      return 'find';
  }
}

/** The tone (CSS data-tone) of a target kind: gold for coins and moths, rune for crystals, bone for rock. */
export function targetTone(kind: string): string {
  if (kind === 'crystal' || kind === 'gem' || kind === 'bubble' || kind === 'rune') return 'rune';
  if (kind === 'boulder' || kind === 'pebble') return 'bone';
  if (kind === 'mimic' || kind === 'star' || kind === 'meteor') return 'violet';
  return 'gold';
}

/** One pooled target sprite. */
export class TargetSprite {
  readonly el: HTMLElement;
  private readonly icon: HTMLElement;
  private readonly ring: HTMLElement;
  private x = -1e4;
  private y = -1e4;
  on = false;
  id = '';
  private gen = 0;

  constructor() {
    this.icon = iconEl('moth', 'dd-tg-ico');
    this.ring = h('i', { class: 'dd-tg-ring' });
    this.el = h('div', { class: 'dd-tg hide', 'aria-hidden': 'true' }, h('i', { class: 'dd-tg-halo' }), this.ring, this.icon);
  }

  /** `ring`: the world draws the target (B's 3D entity); the sprite is only its tap ring. */
  show(id: string, kind: string, ring = false): void {
    this.gen++;
    this.id = id;
    this.el.classList.toggle('ring', ring);
    setIcon(this.icon, targetIcon(kind));
    this.el.dataset.tone = targetTone(kind);
    this.el.classList.remove('hide', 'caught', 'missed');
    this.on = true;
    spring(this.el.firstElementChild as HTMLElement, 'bounce', 0.2, 1, (v) => `scale(${v})`);
  }

  /** Place at a screen point; `left` the share of taps still needed (multi-tap targets show a ring). */
  place(x: number, y: number, left = 1): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== this.x || ry !== this.y) {
      this.x = rx;
      this.y = ry;
      this.el.style.transform = `translate(${rx}px, ${ry}px)`;
    }
    const ring = left >= 1 ? '' : `scale(${(0.6 + 0.4 * left).toFixed(2)})`;
    if (this.ring.style.transform !== ring) this.ring.style.transform = ring;
  }

  /** A hit that does not take it yet: a squash. */
  bump(): void {
    spring(this.icon, 'jelly', 0.7, 1, (v) => `scale(${v})`);
  }

  /** Caught: a pop, then hidden. */
  caught(): void {
    this.el.classList.add('caught');
    const a = tween(this.el.firstElementChild as HTMLElement, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(2.2)', opacity: 0 }], 260, 'outCubic');
    this.release(a ? 260 : 0);
  }

  /** Gone uncaught: a fade (nothing is lost). */
  missed(): void {
    this.el.classList.add('missed');
    this.release(240);
  }

  hide(): void {
    this.gen++;
    this.on = false;
    this.id = '';
    this.el.classList.add('hide');
  }

  /** Free the sprite now (it can be reused) and hide it after its exit animation unless it was reused. */
  private release(ms: number): void {
    const gen = ++this.gen;
    this.id = '';
    this.on = false;
    window.setTimeout(() => {
      if (this.gen === gen) this.el.classList.add('hide');
    }, ms);
  }
}

/** The widget's timer and counter chip under the goal bar ("3 / 7 · ▬▬▬▭"): non-interactive. */
export class WidgetBar {
  readonly el: HTMLElement;
  private readonly label: HTMLElement;
  private readonly fill: HTMLElement;
  private labelS = '';
  private fillS = -1;

  constructor() {
    this.label = h('span', { class: 'dd-wbar-label' });
    this.fill = h('i', { class: 'dd-wbar-fill' });
    this.el = h('div', { class: 'dd-wbar hide', 'aria-hidden': 'true' }, this.label, h('span', { class: 'dd-wbar-track' }, this.fill));
  }

  show(tone: string): void {
    this.el.dataset.tone = tone;
    this.el.classList.remove('hide');
    spring(this.el, 'snap', 0, 1, (v) => `translateY(${(v - 1) * 16}px)`);
  }

  set(label: string, left: number): void {
    if (label !== this.labelS) {
      this.labelS = label;
      this.label.textContent = label;
    }
    const f = Math.round(Math.max(0, Math.min(1, left)) * 200) / 200;
    if (f !== this.fillS) {
      this.fillS = f;
      this.fill.style.transform = `scaleX(${f})`;
    }
  }

  hide(): void {
    this.el.classList.add('hide');
    this.labelS = '';
    this.fillS = -1;
  }
}
