// The Feat toast (SPEC §10.8; T3, 3,000 ms): the plate (300 × 64, tier-coloured rim) slides from above to the top of
// the world region (snap); the medal stamps 0 → 1.25 → 1 with 24 confetti (120 ms); "FEAT · DELVER III" and the name
// rise 6 px (180 ms); a shine sweep (300 ms); the reward chip "+1 % all · +15 ◆" pops and the gems fly (450 ms); exit
// upward (2,600 ms). 700 ms between toasts; past 3 waiting they collapse into one "+N Feats"; never during a T4/T5
// (the director holds toasts). It never takes a tap (CRITIQUE MUST 7: the toast layer is pointer-events: none); the
// Feats tab shows the family. Rank-ups use the same plate with the rank badge.

import { h } from '../../../ui/dom';
import { spring, tween } from '../../../ui/fx/waapi';
import { iconEl, setIcon, type IconId } from '../../../ui/idle/icons';
import { Timeline } from '../Timeline';
import { TimelineCeremony, type CeremonyTier } from './Ceremony';
import type { CeremonyStage } from './stage';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
/** Tier I–X as a numeral; past X "X+3". */
export function roman(t: number): string {
  return t <= 10 ? ROMAN[Math.max(0, t)] : `X+${t - 10}`;
}

export class ToastView {
  readonly el: HTMLElement;
  readonly medal: HTMLElement;
  readonly head: HTMLElement;
  readonly name: HTMLElement;
  readonly reward: HTMLElement;
  readonly shine: HTMLElement;

  constructor(layer: HTMLElement) {
    this.medal = iconEl('medal', 'dd-ft-medal');
    this.head = h('span', { class: 'dd-ft-head' });
    this.name = h('span', { class: 'dd-ft-name' });
    this.reward = h('span', { class: 'dd-ft-reward' });
    this.shine = h('i', { class: 'dd-ft-shine' });
    this.el = h('div', { class: 'dd-ft hide', role: 'status', 'aria-live': 'polite', 'data-hud': 'featToast' }, this.shine, this.medal, h('span', { class: 'dd-ft-text' }, this.head, this.name), this.reward);
    layer.appendChild(this.el);
  }
}

export interface ToastPayload {
  head: string;
  name: string;
  reward: string;
  /** Tier colour: 'bronze' I–III, 'brass' IV–VI, 'rune' VII–IX, 'violet' X+, 'secret', 'rank'. */
  tone: string;
  icon: IconId;
  /** Gems to fly from the reward chip to the gem socket (they were held by the juice: released here). */
  sound: string;
  pitch: number;
}

export class ToastCeremony extends TimelineCeremony {
  readonly id: 'feat' | 'rankUp';
  readonly tier: CeremonyTier = 3;
  override readonly toast = true;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, private readonly v: ToastView, p: ToastPayload, id: 'feat' | 'rankUp' = 'feat') {
    super();
    this.id = id;
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            v.el.dataset.tone = p.tone;
            setIcon(v.medal, p.icon);
            v.head.textContent = p.head;
            v.name.textContent = p.name;
            v.reward.textContent = '';
            v.el.classList.remove('hide');
            spring(v.el, 'snap', 0, 1, (k) => `translateY(${((k - 1) * 90).toFixed(1)}px)`);
            st.audio.play(p.sound, { pitch: p.pitch });
            st.hud.announce(`${p.head} ${p.name}`);
          },
        },
        {
          at: 120,
          run: () => {
            spring(v.medal, 'bounce', 0, 1, (k) => `scale(${k})`);
            const r = v.medal.getBoundingClientRect();
            st.fx.sparksAt(r.left + r.width / 2, r.top + r.height / 2, 24, p.tone === 'rune' ? 'rune' : 'gold', performance.now(), 140, 360, 700, 0, Math.PI * 2, 380, 'star');
            st.haptics.play('star');
          },
        },
        { at: 180, run: () => tween(v.el.querySelector('.dd-ft-text')!, [{ transform: 'translateY(6px)', opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }], 220, 'outCubic') },
        { at: 300, run: () => tween(v.shine, [{ transform: 'translateX(-120%) skewX(-20deg)' }, { transform: 'translateX(320%) skewX(-20deg)' }], 520, 'standard') },
        {
          at: 450,
          run: () => {
            v.reward.textContent = p.reward;
            if (p.reward) spring(v.reward, 'jelly', 0.6, 1, (k) => `scale(${k})`);
            const r = v.reward.getBoundingClientRect();
            st.releaseHeld(r.left + r.width / 2, r.top + r.height / 2);
          },
        },
        { at: 2600, run: () => tween(v.el, [{ transform: 'translateY(0px)', opacity: 1 }, { transform: 'translateY(-70px)', opacity: 0 }], 360, 'inCubic') },
      ],
      3000,
    );
    this.timeline.skipFrom = Infinity;
  }

  protected cleanup(): void {
    this.v.el.classList.add('hide');
    this.st.releaseHeld(innerWidth / 2, 120);
  }
}

/** The rank-up (SPEC §10.8; T3, 1,400 ms; never blocks): the badge pops, a "RANK 12" stamp, 32 confetti. */
export class RankStampCeremony extends TimelineCeremony {
  readonly id = 'rankUp' as const;
  readonly tier: CeremonyTier = 3;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, rank: number, popBadge: () => void) {
    super();
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            popBadge();
            const r = st.hud.rect('rank');
            if (r) st.fx.sparksAt(r.x + r.w / 2, r.y + r.h / 2, 32, 'gold', performance.now(), 160, 420, 900, Math.PI * 0.1, Math.PI * 0.9, 600, 'star');
            st.hud.stamp(st.text('ui.rank.stamp', { rank }), '', 'amber');
            st.bloom(0.15, 300);
            st.trauma(0.1, 3);
            st.audio.play('rank', {});
            st.haptics.play('rank');
            st.hud.announce(st.text('ui.a11y.rank', { rank }));
          },
        },
      ],
      1400,
      1400,
      // The stamp stays up as long as the ceremony shows it (a held frame keeps it too).
      [{ from: 0, to: 1200, run: () => st.hud.holdStamp?.() }],
    );
  }

  protected cleanup(): void {
    void this.st;
  }
}
