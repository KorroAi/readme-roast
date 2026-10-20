// The seal break and the biome reveal (SPEC §7.1, §10.8). SealBreak (T4, 1,100 ms): hit-stop 120 ms with slow motion,
// a 0.35 white flash that turns to the biome's colour over 600 ms, a screen shock, the 60 large shards (B's), "SEAL
// BROKEN". BiomeReveal (T5, 3,600 ms; digging resumes at 1,200 ms): the dive and the landing (trauma 0.7), the Vista
// dolly (B's), the title letter by letter (40 ms each) from 900 ms with rays from its centre, the subtitle (depth,
// biome number, the split) at 1,400 ms, the dissolve into glints at 2,600–3,100 ms, then the gear cards rise into the
// Dig tab. Reduced motion: a crossfade, the title as a fade, no dive, no shock, a 0.15 flash. The charted gate (T3,
// 1,200 ms) is the short form for a seal opened in an earlier run: the title chip with its split.

import { h } from '../../../ui/dom';
import { Timeline } from '../Timeline';
import { TimelineCeremony, type Ceremony, type CeremonyTier } from './Ceremony';
import { easeInOutCubic, easeOutCubic, type CeremonyStage } from './stage';

export class TitleView {
  readonly el: HTMLElement;
  readonly title: HTMLElement;
  readonly sub: HTMLElement;
  private readonly letters: HTMLElement[] = [];

  constructor(layer: HTMLElement) {
    this.title = h('span', { class: 'dd-title-name' });
    for (let i = 0; i < 28; i++) {
      const l = h('span', { class: 'dd-title-l' });
      this.letters.push(l);
      this.title.appendChild(l);
    }
    this.sub = h('span', { class: 'dd-title-sub' });
    this.el = h('div', { class: 'dd-title hide', 'aria-hidden': 'true' }, h('i', { class: 'dd-title-rays' }), this.title, this.sub);
    layer.appendChild(this.el);
  }

  /** Lay the name out in the pooled letter spans (no element is created). */
  set(name: string, tone: string): void {
    this.el.dataset.tone = tone;
    for (let i = 0; i < this.letters.length; i++) {
      const ch = name[i] ?? '';
      const l = this.letters[i];
      l.textContent = ch === ' ' ? ' ' : ch;
      l.style.display = ch ? '' : 'none';
      l.classList.remove('on');
    }
  }

  /** Letters up to `n` are lit. */
  lit(n: number): void {
    for (let i = 0; i < this.letters.length; i++) this.letters[i].classList.toggle('on', i < n);
  }
}

export interface RevealPayload {
  name: string;
  sub: string;
  /** The biome's accent as an RGB triple 0..1 (the flash turns to it). */
  rgb: readonly [number, number, number];
  tone: string;
  onDone: () => void;
}

export class SealBreakCeremony extends TimelineCeremony {
  readonly id = 'sealBreak' as const;
  readonly tier: CeremonyTier = 4;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, rgb: readonly [number, number, number]) {
    super();
    const full = st.motion() === 'full';
    const c = () => st.centre();
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            st.stop(120, 4, true);
            st.post.flash(full ? 0.35 : 0.15, 4, [1, 1, 1], 600);
            st.trauma(0.7, 4, true);
            st.scene.burst('dust', st.depth(), 3, 64);
            st.scene.burst('sparks', st.depth(), 3, 40);
            st.scene.impactLight(st.depth(), 3, 10, (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255), 2.4, 900);
            st.hud.stamp(st.text('ui.ceremony.sealBroken'), '', 'white');
            st.audio.play('seal.break', {});
            st.haptics.play('seal');
            st.hud.announce(st.text('ui.a11y.seal'));
          },
        },
        { at: 300, run: () => st.bloom(0.4, 700) },
      ],
      1100,
      1000,
      [{ from: 0, to: 600, run: (u) => st.post.shock(c().x, st.region().top + (st.region().bottom - st.region().top) * 0.52, full ? u : 0) }],
    );
  }

  protected cleanup(): void {
    this.st.post.shock(0, 0, 0);
  }
}

export class BiomeRevealCeremony extends TimelineCeremony {
  readonly id = 'biomeReveal' as const;
  readonly tier: CeremonyTier = 5;
  override readonly digFrom = 1200;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, private readonly v: TitleView, private readonly p: RevealPayload) {
    super();
    const full = st.motion() === 'full';
    const n = p.name.length;
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            v.set(p.name, p.tone);
            v.sub.textContent = '';
            v.el.classList.remove('hide', 'out');
            st.audio.play('reveal', {});
            if (full) st.scene.dolly(true);
          },
        },
        {
          at: 600,
          run: () => {
            st.trauma(0.7, 5, true);
            st.scene.burst('dust', st.depth(), 3, 64);
            st.haptics.play('biome');
            st.bloom(0.5, 1400);
          },
        },
        { at: 1400, run: () => (v.sub.textContent = p.sub) },
        { at: 1900, run: () => st.scene.dolly(false) },
        {
          at: 2600,
          run: () => {
            v.el.classList.add('out');
            const r = v.title.getBoundingClientRect();
            st.fx.sparksAt(r.left + r.width / 2, r.top + r.height / 2, 60, p.tone === 'rune' ? 'rune' : 'gold', performance.now(), 40, 160, 1100, Math.PI * 1.1, Math.PI * 1.9, -60, 'star');
          },
        },
        { at: 3100, run: () => p.onDone() },
      ],
      3600,
      2600,
      [
        // The title, letter by letter (40 ms each) from 900 ms.
        { from: 900, to: 900 + 40 * n + 1, run: (_u, t) => v.lit(Math.floor((t - 900) / 40) + 1) },
        { from: 900, to: 2300, run: (u) => (v.el.style.setProperty('--rays', (1 - easeOutCubic(u)).toFixed(3))) },
        // The world dims a touch behind the title.
        { from: 700, to: 1000, run: (u) => st.post.dim(0.25 * easeInOutCubic(u)) },
        { from: 2600, to: 3100, run: (u) => st.post.dim(0.25 * (1 - u)) },
      ],
    );
  }

  protected cleanup(): void {
    this.v.lit(99);
    this.v.el.classList.add('hide');
    this.st.post.dim(0);
    this.st.scene.dolly(false);
  }

  /** Waited too long behind another ceremony: the short T3 title chip instead. */
  demote(): Ceremony | null {
    return new GateCeremony(this.st, this.v, this.p.name, this.p.sub, this.p.tone, this.p.onDone);
  }
}

/** The charted gate (SPEC §7.1; T3, 1,200 ms): a 0.12 flash and the title chip with the split time. */
export class GateCeremony extends TimelineCeremony {
  readonly id = 'chartedGate' as const;
  readonly tier: CeremonyTier = 3;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, private readonly v: TitleView, name: string, sub: string, tone: string, onDone?: () => void) {
    super();
    this.timeline = new Timeline(
      [
        {
          at: 0,
          run: () => {
            v.set(name, tone);
            v.lit(99);
            v.sub.textContent = sub;
            v.el.classList.remove('hide', 'out');
            v.el.classList.add('chip');
            st.post.flash(0.12, 3, [1, 1, 1], 200);
            st.trauma(0.3, 3);
            st.stop(40, 3);
            st.bloom(0.2, 300);
            st.scene.burst('gold', st.depth(), 3, 40);
            st.audio.play('gate', {});
            st.haptics.play('gate');
          },
        },
        { at: 900, run: () => v.el.classList.add('out') },
        { at: 1150, run: () => onDone?.() },
      ],
      1200,
    );
  }

  protected cleanup(): void {
    this.v.el.classList.remove('chip');
    this.v.el.classList.add('hide');
    void this.st;
  }
}
