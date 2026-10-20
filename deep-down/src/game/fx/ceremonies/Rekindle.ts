// The Rekindle (SPEC §10.8; T5, 4,000 ms): 0–600 ms the lantern flares and embers stream from the depth plate to the
// Lantern tab · 600–1,500 ms an octagon iris closes on the lantern (radius 1.2 → 0, inOutCubic) with a brass rim ·
// the run resets behind a 300 ms black hold (the planted lantern stays at the depth reached) · 1,800–2,600 ms the iris
// opens at the surface · 2,600–4,000 ms "REKINDLED · Embers +N" and the count. A 0.40 violet flash with a 200 ms ramp
// (the only flash allowed above 0.35). Reduced motion: fades instead of the iris travel, same total time.

import { h } from '../../../ui/dom';
import { spring } from '../../../ui/fx/waapi';
import { Timeline } from '../Timeline';
import { TimelineCeremony, type CeremonyTier } from './Ceremony';
import { easeInOutCubic, type CeremonyStage } from './stage';

export class RekindleView {
  readonly el: HTMLElement;
  readonly head: HTMLElement;
  readonly sub: HTMLElement;
  /** A DOM fallback for the iris when the post chain has none (an octagon mask over the world). */
  readonly veil: HTMLElement;

  constructor(layer: HTMLElement) {
    this.head = h('span', { class: 'dd-rk-head' });
    this.sub = h('span', { class: 'dd-rk-sub' });
    this.veil = h('i', { class: 'dd-rk-veil' });
    this.el = h('div', { class: 'dd-rk hide', 'aria-hidden': 'true' }, this.veil, h('span', { class: 'dd-rk-plate' }, this.head, this.sub));
    layer.appendChild(this.el);
  }
}

export class RekindleCeremony extends TimelineCeremony {
  readonly id = 'rekindle' as const;
  readonly tier: CeremonyTier = 5;
  override readonly digFrom = 2600;
  readonly timeline: Timeline;
  private resetDone = false;

  constructor(private readonly st: CeremonyStage, private readonly v: RekindleView, gain: string, private readonly reset: () => void) {
    super();
    const lantern = () => {
      const c = st.centre();
      return { x: c.x, y: st.region().top + (st.region().bottom - st.region().top) * 0.45 };
    };
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            v.head.textContent = '';
            v.sub.textContent = '';
            v.el.classList.remove('hide', 'shown');
            st.hud.fade(0.4);
            st.audio.play('rekindle', {});
            st.haptics.play('rekindle');
            const from = st.hud.rect('depth');
            const to = st.hud.rect('tab:lantern');
            if (from) st.fx.sparksAt(from.x + from.w / 2, from.y + from.h / 2, 60, 'amber', performance.now(), 200, 520, 900, Math.PI * 0.2, Math.PI * 0.8, 500, 'star');
            if (to) st.fx.ring(to.x + to.w / 2, to.y + to.h / 2, 10, 60, 600, '255,138,61', performance.now(), 3);
            st.bloom(0.5, 800);
          },
        },
        { at: 400, run: () => st.post.flash(0.4, 5, [0.85, 0.75, 1], 200, true) },
        {
          at: 1500,
          run: () => {
            if (!this.resetDone) {
              this.resetDone = true;
              this.reset();
            }
          },
        },
        {
          at: 2600,
          run: () => {
            v.head.textContent = st.text('ui.ceremony.rekindled');
            v.sub.textContent = st.text('ui.lantern.gain', { gain });
            v.el.classList.add('shown');
            spring(v.head, 'snap', 1.8, 1, (k) => `scale(${k})`);
            st.hud.fade(1);
            st.trauma(0.4, 5);
          },
        },
      ],
      4000,
      2600,
      [
        // The iris closes on the lantern, holds black, and opens at the surface.
        { from: 600, to: 1500, run: (u) => this.iris(1.2 * (1 - easeInOutCubic(u)), lantern()) },
        { from: 1500, to: 1800, run: () => this.iris(0, lantern()) },
        { from: 1800, to: 2600, run: (u) => this.iris(1.5 * easeInOutCubic(u), lantern()) },
      ],
    );
  }

  /** The iris through the post chain, and the DOM veil (an octagon clip) so it reads with any pipeline. */
  private iris(r: number, at: { x: number; y: number }): void {
    this.st.post.iris(r, at.x, at.y);
    const px = Math.max(0, r) * innerHeight;
    const k = px * 0.4142;
    this.v.veil.style.clipPath = r >= 1.49 ? 'none' : `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${at.x - k}px ${at.y - px}px, ${at.x + k}px ${at.y - px}px, ${at.x + px}px ${at.y - k}px, ${at.x + px}px ${at.y + k}px, ${at.x + k}px ${at.y + px}px, ${at.x - k}px ${at.y + px}px, ${at.x - px}px ${at.y + k}px, ${at.x - px}px ${at.y - k}px, ${at.x - k}px ${at.y - px}px)`;
    this.v.veil.style.opacity = r >= 1.49 ? '0' : '1';
  }

  protected cleanup(): void {
    // A skipped or cut Rekindle still resets (the model already credited it).
    if (!this.resetDone) {
      this.resetDone = true;
      this.reset();
    }
    this.st.post.iris(1.5);
    this.v.veil.style.opacity = '0';
    this.v.veil.style.clipPath = 'none';
    this.v.el.classList.add('hide');
    this.st.hud.fade(1);
  }
}
