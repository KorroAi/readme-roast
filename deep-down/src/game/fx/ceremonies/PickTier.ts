// The pick tier (SPEC §10.8; T4, 1,600 ms; a tap from 400 ms jumps to 1,300 ms): hit-stop 80 ms at ×0.05; the world
// dims to 0.55 and the HUD fades to 0.35 except the Pick card; the new tool's plate rises to 42 % of the screen with a
// full spin (0–400 ms); the charge (a ±3° shake at 18 Hz and a ring closing on the head, 400–700 ms); the snap at
// 700 ms (a 0.30 flash, a screen shock, trauma +0.55, rays, 120 glints); the name stamps letter by letter (900 ms);
// all back at 1,300 ms. Only the first time a tier is ever reached (CRITIQUE critic 1 SHOULD 10); later runs show a
// T2 chip ("Iron Pick ✓") instead.

import { h } from '../../../ui/dom';
import { iconEl } from '../../../ui/idle/icons';
import { Timeline } from '../Timeline';
import { TimelineCeremony, type CeremonyTier } from './Ceremony';
import { easeInOutCubic, easeOutCubic, type CeremonyStage } from './stage';

/** The plate (built once, reused). */
export class PickTierView {
  readonly el: HTMLElement;
  readonly tool: HTMLElement;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly glow: HTMLElement;

  constructor(layer: HTMLElement) {
    this.tool = h('span', { class: 'dd-pt-tool' }, iconEl('pick', 'dd-pt-ico'));
    this.glow = h('i', { class: 'dd-pt-glow' });
    this.name = h('span', { class: 'dd-pt-name' });
    this.sub = h('span', { class: 'dd-pt-sub' });
    this.el = h('div', { class: 'dd-pt hide', 'aria-hidden': 'true' }, this.glow, this.tool, this.name, this.sub);
    layer.appendChild(this.el);
  }
}

export class PickTierCeremony extends TimelineCeremony {
  readonly id = 'pickTier' as const;
  readonly tier: CeremonyTier = 4;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, private readonly v: PickTierView, name: string, sub: string) {
    super();
    const reduced = st.motion() !== 'full';
    const c = () => st.centre();
    const y42 = () => st.region().top + (st.region().bottom - st.region().top) * 0.3;
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            st.stop(80, 4, true);
            st.hud.fade(0.35, 'pick');
            v.name.textContent = '';
            v.sub.textContent = '';
            v.el.classList.remove('hide', 'snapped');
            st.audio.play('tool.tier', {});
          },
        },
        {
          at: 700,
          run: () => {
            v.el.classList.add('snapped');
            st.post.flash(0.3, 4, [1, 0.96, 0.88], 120);
            st.trauma(0.55, 4);
            st.bloom(0.4, 900);
            st.haptics.play('pickTier');
            const p = c();
            st.fx.sparksAt(p.x, y42(), 40, 'gold', performance.now(), 260, 620, 900, 0, Math.PI * 2, 300, 'star');
            st.fx.ring(p.x, y42(), 30, 220, 520, '255,213,107', performance.now(), 4);
            st.scene.burst('gold', st.depth(), 3, 60);
            st.scene.impactLight(st.depth(), 3, 8, 0xffe2a0, 2.2, 600);
          },
        },
        {
          at: 900,
          run: () => {
            v.name.textContent = name;
            v.sub.textContent = sub;
            st.hud.announce(name);
          },
        },
        { at: 1300, run: () => st.hud.fade(1) },
      ],
      1600,
      1300,
      [
        // The world dims 0 → 0.55 over 160 ms, holds, and clears from 1,300 ms.
        { from: 0, to: 160, run: (u) => st.post.dim(0.55 * easeOutCubic(u)) },
        { from: 1300, to: 1600, run: (u) => st.post.dim(0.55 * (1 - easeInOutCubic(u))) },
        // The plate rises to 30 % of the world region with one full spin (none in Reduced).
        {
          from: 0,
          to: 400,
          run: (u) => {
            const p = c();
            const k = easeOutCubic(u);
            const y = st.region().bottom - (st.region().bottom - y42()) * k;
            v.el.style.transform = `translate(${p.x.toFixed(1)}px, ${y.toFixed(1)}px)`;
            v.tool.style.transform = reduced ? 'scale(1.4)' : `rotate(${(360 * k).toFixed(1)}deg) scale(${(1 + 0.4 * k).toFixed(3)})`;
          },
        },
        // The charge: a ±3° shake at 18 Hz, a ring closing on the head.
        {
          from: 400,
          to: 700,
          run: (u, t) => {
            const a = reduced ? 0 : 3 * Math.sin((t / 1000) * 18 * Math.PI * 2);
            v.tool.style.transform = `rotate(${a.toFixed(2)}deg) scale(${(1.4 + 0.1 * u).toFixed(3)})`;
            v.glow.style.opacity = (0.3 + 0.7 * u).toFixed(2);
          },
        },
        // The screen shock after the snap.
        { from: 700, to: 1150, run: (u) => st.post.shock(c().x, y42(), u) },
        { from: 700, to: 1300, run: (u) => (v.tool.style.transform = `scale(${(1.6 - 0.2 * easeOutCubic(u)).toFixed(3)})`) },
      ],
    );
  }

  protected cleanup(): void {
    this.v.el.classList.add('hide');
    this.st.post.dim(0);
    this.st.post.shock(0, 0, 0);
    this.st.hud.fade(1);
  }
}
