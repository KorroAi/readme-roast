// The seal fight's HUD (SPEC §7.1, §10.3): under the goal bar, the Warden's name plate with a segmented HP bar that
// chunks on every hit, and the 30 s timer ring (red only under 5 s, the one place red is allowed: SPEC §9.5). On the
// floor, the weak point's reticle while it is lit (×5): a world target, so a tap on it is the weak hit and a tap
// beside it digs the seal. "The seal holds · 64 %" on a fail; tapping the seal starts again at once (nothing lost).

import { h } from '../dom';
import { spring, tween } from '../fx/waapi';

const SVG_NS = 'http://www.w3.org/2000/svg';
const RING_R = 19;
const RING_C = 2 * Math.PI * RING_R;
/** HP bar segments. */
const CHUNKS = 10;

export interface SealView {
  /** HP fraction left and the seconds left of the timer (and its length). */
  left: number;
  time: number;
  total: number;
  /** After a fail: the seal holds; a tap starts again. */
  held: boolean;
  /** The Warden's display name ('' when it has none). */
  warden: string;
  /** The weak point: lit now, its id (`weak:<sealId>:<i>`), which point (0..2). */
  weakLit: boolean;
  weakId: string;
  weakPoint: number;
  /** An estimate of the seconds an active player needs (H5's colour), NaN unknown. */
  estimate: number;
}

export class SealHud {
  readonly el: HTMLElement;
  /** The weak point's reticle (in the ceremony layer, over the floor). */
  readonly reticle: HTMLElement;
  private readonly name: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly ghost: HTMLElement;
  private readonly time: HTMLElement;
  private readonly ring: SVGCircleElement;
  private readonly est: HTMLElement;
  private shown = false;
  private leftS = -1;
  private timeS = '';
  private ringS = -1;
  private nameS = '';
  private heldS = false;
  private weakS = '';
  private estS = '';
  private reticleAt = '';

  constructor() {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 44 44');
    svg.setAttribute('class', 'dd-seal-ring');
    const track = document.createElementNS(SVG_NS, 'circle');
    track.setAttribute('class', 'dd-seal-ring-track');
    this.ring = document.createElementNS(SVG_NS, 'circle');
    this.ring.setAttribute('class', 'dd-seal-ring-arc');
    for (const c of [track, this.ring]) {
      c.setAttribute('cx', '22');
      c.setAttribute('cy', '22');
      c.setAttribute('r', String(RING_R));
      svg.appendChild(c);
    }
    this.ring.style.strokeDasharray = `${RING_C}`;
    this.time = h('span', { class: 'dd-seal-secs' });
    this.name = h('span', { class: 'dd-seal-name' });
    this.est = h('span', { class: 'dd-seal-est' });
    this.fill = h('i', { class: 'dd-seal-hp-fill' });
    this.ghost = h('i', { class: 'dd-seal-hp-ghost' });
    const ticks = h('span', { class: 'dd-seal-hp-ticks', 'aria-hidden': 'true' });
    for (let i = 1; i < CHUNKS; i++) ticks.appendChild(h('i', { style: `left:${(i * 100) / CHUNKS}%` }));
    this.el = h(
      'div',
      { class: 'dd-sealhud hide', 'aria-hidden': 'true', 'data-hud': 'seal' },
      h('span', { class: 'dd-seal-timer' }, svg, this.time),
      h('span', { class: 'dd-seal-col' }, h('span', { class: 'dd-seal-head' }, this.name, this.est), h('span', { class: 'dd-seal-hp' }, this.ghost, this.fill, ticks)),
    );
    this.reticle = h('div', { class: 'dd-weak hide', 'aria-hidden': 'true' }, h('i', { class: 'dd-weak-ring' }), h('i', { class: 'dd-weak-core' }));
  }

  /** Per frame: the fight's state (null: no fight); `weakAt` the weak point's screen point. */
  update(v: SealView | null, weakAt: { x: number; y: number } | null, holdsText: (pct: number) => string): void {
    if (!v) {
      if (this.shown) {
        this.shown = false;
        this.el.classList.add('hide');
        this.reticle.classList.add('hide');
        this.weakS = '';
      }
      return;
    }
    if (!this.shown) {
      this.shown = true;
      this.el.classList.remove('hide');
      spring(this.el, 'snap', 0, 1, (k) => `translateY(${(k - 1) * 18}px) scale(${0.9 + 0.1 * k})`);
      this.leftS = -1;
    }
    if (v.warden !== this.nameS) {
      this.nameS = v.warden;
      this.name.textContent = v.warden;
    }
    const left = Math.round(Math.max(0, Math.min(1, v.left)) * 1000) / 1000;
    if (left !== this.leftS) {
      const hitNow = this.leftS >= 0 && left < this.leftS;
      this.leftS = left;
      this.fill.style.transform = `scaleX(${left})`;
      if (hitNow) {
        // The chunk that just broke lingers as a pale ghost and drains (the HP bar "chunks").
        tween(this.ghost, [{ transform: this.ghost.style.transform || 'scaleX(1)' }, { transform: `scaleX(${left})` }], 380, 'inQuad', { delay: 120, fill: 'forwards' });
        tween(this.fill, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], 140, 'outCubic');
      } else this.ghost.style.transform = `scaleX(${left})`;
    }
    const secs = v.held ? '' : String(Math.max(0, Math.ceil(v.time)));
    if (secs !== this.timeS) {
      this.timeS = secs;
      this.time.textContent = secs;
      if (secs && Number(secs) <= 5) spring(this.time, 'snap', 1.3, 1, (k) => `scale(${k})`);
    }
    const ring = v.held ? 0 : Math.round(Math.max(0, Math.min(1, v.time / Math.max(1, v.total))) * 300) / 300;
    if (ring !== this.ringS) {
      this.ringS = ring;
      this.ring.style.strokeDashoffset = `${RING_C * (1 - ring)}`;
    }
    this.el.classList.toggle('urgent', !v.held && v.time <= 5);
    if (v.held !== this.heldS) {
      this.heldS = v.held;
      this.el.classList.toggle('held', v.held);
    }
    const est = v.held ? holdsText(Math.round(v.left * 100)) : Number.isFinite(v.estimate) && v.estimate > 0 ? `~${Math.ceil(v.estimate)} s` : '';
    if (est !== this.estS) {
      this.estS = est;
      this.est.textContent = est;
      this.est.dataset.tone = v.held ? 'held' : v.estimate <= v.total * 0.6 ? 'good' : v.estimate <= v.total ? 'warn' : 'bad';
    }
    // The weak point's reticle.
    const weak = v.weakLit && weakAt ? v.weakId : '';
    if (weak !== this.weakS) {
      this.weakS = weak;
      this.reticle.classList.toggle('hide', !weak);
      if (weak) spring(this.reticle.firstElementChild as Element, 'bounce', 1.8, 1, (k) => `scale(${k})`);
    }
    if (weak && weakAt) {
      const k = `${Math.round(weakAt.x)},${Math.round(weakAt.y)}`;
      if (k !== this.reticleAt) {
        this.reticleAt = k;
        this.reticle.style.transform = `translate(${Math.round(weakAt.x)}px, ${Math.round(weakAt.y)}px)`;
      }
    }
  }

  /** A weak hit: the reticle bursts. */
  weakHit(): void {
    tween(this.reticle, [{ opacity: 1 }, { opacity: 0 }], 220, 'outCubic');
  }
}
