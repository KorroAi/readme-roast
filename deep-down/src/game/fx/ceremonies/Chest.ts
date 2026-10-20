// The chest reveal (SPEC §5.8, §10.8; T3 for Wood–Crystal, T4 for Reliquary and Lintel): the chest leaps out of its
// cell and lands (squash 0.82, two bounces), its seam glowing in its floor tier's colour. Each roll-up step is 450 ms:
// an anticipation squash (0–80), a 0.35 m jump with a ±6° tilt (80–240), the fall (240–320) and at 320 the landing,
// where the seam switches to the next tier's colour with a ring burst, glints, a sound a major third higher and a
// haptic tick of 12 × step ms. The roll is honest: it plays exactly the model's path (it already happened). Then the
// open: the lid hinges back, a beam in the tier colour, the flash and rays by tier, and the contents fly to their
// sockets (the held gains are released now). Crystal and better: a reveal card rotates in with a sunburst, "NEW" on a
// first find. A tap after 400 ms jumps to the end state; the rewards still fly.

import type { ChestTier } from '../../../idle/bus';
import { h } from '../../../ui/dom';
import { iconEl } from '../../../ui/idle/icons';
import { Timeline, type TimelineStep, type TimelineTrack } from '../Timeline';
import { TimelineCeremony, type CeremonyTier } from './Ceremony';
import { easeOutCubic, type CeremonyStage } from './stage';

export const TIER_ORDER: readonly ChestTier[] = ['wood', 'copper', 'crystal', 'reliquary', 'lintel'];
/** Tier colours (RARITY tokens + mythic, SPEC §5.8). */
export const TIER_RGB: Readonly<Record<ChestTier, string>> = {
  wood: '201,191,174',
  copper: '229,132,68',
  crystal: '143,227,238',
  reliquary: '185,162,255',
  lintel: '255,213,107',
};
const TIER_HEX: Readonly<Record<ChestTier, number>> = { wood: 0xc9bfae, copper: 0xe58444, crystal: 0x8fe3ee, reliquary: 0xb9a2ff, lintel: 0xffd56b };
/** Flash and hit-stop by tier (SPEC §10.3 chest open). */
export const OPEN_FLASH = [0, 0, 0.12, 0.2, 0.3];
const OPEN_STOP = [0, 40, 60, 80, 120];
const OPEN_LEN = [900, 1350, 1800, 2400, 3200];
const STEP_MS = 450;

export class ChestView {
  readonly el: HTMLElement;
  readonly chest: HTMLElement;
  readonly body: HTMLElement;
  readonly seam: HTMLElement;
  readonly beam: HTMLElement;
  readonly card: HTMLElement;
  readonly cardTitle: HTMLElement;
  readonly cardLines: HTMLElement;
  readonly cardNew: HTMLElement;
  readonly label: HTMLElement;

  constructor(layer: HTMLElement) {
    this.seam = h('i', { class: 'dd-cr-seam' });
    this.body = h('span', { class: 'dd-cr-body' }, iconEl('chest', 'dd-cr-ico'), this.seam);
    this.beam = h('i', { class: 'dd-cr-beam' });
    this.label = h('span', { class: 'dd-cr-label' });
    this.chest = h('span', { class: 'dd-cr-chest' }, this.beam, this.body, this.label);
    this.cardTitle = h('span', { class: 'dd-cr-card-title' });
    this.cardLines = h('span', { class: 'dd-cr-card-lines' });
    this.cardNew = h('span', { class: 'dd-cr-card-new hide' });
    this.card = h('div', { class: 'dd-cr-card hide' }, h('i', { class: 'dd-cr-sun' }), this.cardTitle, this.cardLines, this.cardNew);
    this.el = h('div', { class: 'dd-cr hide', 'aria-hidden': 'true' }, this.chest, this.card);
    layer.appendChild(this.el);
  }

  setTier(t: ChestTier): void {
    this.el.dataset.tier = t;
  }
}

export interface ChestPayload {
  floor: ChestTier;
  tier: ChestTier;
  path: readonly ChestTier[];
  /** Where it opens (CSS px). */
  x: number;
  y: number;
  gold: string;
  gems: number;
  extras: readonly string[];
  /** The best item's lines for the reveal card (Crystal+), and whether it is a first find. */
  card: { title: string; lines: string[]; isNew: boolean } | null;
}

export class ChestCeremony extends TimelineCeremony {
  readonly id = 'chest' as const;
  readonly tier: CeremonyTier;
  readonly timeline: Timeline;

  constructor(private readonly st: CeremonyStage, private readonly v: ChestView, p: ChestPayload) {
    super();
    const ti = TIER_ORDER.indexOf(p.tier);
    this.tier = ti >= 3 ? 4 : 3;
    const path = p.path.length ? p.path : [p.floor, p.tier];
    const steps = Math.max(0, path.length - 1);
    const reduced = st.motion() !== 'full';
    const t0 = 260;
    const openAt = t0 + steps * STEP_MS + (steps < 4 && ti < 4 ? 120 : 0) + 80;
    const len = openAt + OPEN_LEN[ti];
    const seq: TimelineStep[] = [
      {
        at: 0,
        run: () => {
          v.setTier(p.floor);
          v.el.classList.remove('hide', 'open');
          v.card.classList.add('hide');
          v.label.textContent = st.text(`ui.chest.${p.floor}`);
          v.el.style.transform = `translate(${p.x.toFixed(0)}px, ${p.y.toFixed(0)}px)`;
          st.audio.play('chest.creak', {});
        },
      },
    ];
    const tracks: TimelineTrack[] = [
      // The leap out of the cell and the landing (squash 0.82, two small bounces).
      {
        from: 0,
        to: t0,
        run: (u) => {
          const k = easeOutCubic(u);
          const hop = reduced ? 0 : Math.sin(Math.PI * Math.min(1, u * 1.2)) * 46 * (1 - u * 0.4);
          const sq = u > 0.82 ? 0.82 + (u - 0.82) * 1 : 1 + 0.12 * Math.sin(Math.PI * u);
          v.body.style.transform = `translateY(${(-hop).toFixed(1)}px) scale(${(0.5 + 0.5 * k).toFixed(3)}) scaleY(${sq.toFixed(3)})`;
        },
      },
    ];
    for (let i = 1; i <= steps; i++) {
      const s0 = t0 + (i - 1) * STEP_MS;
      const tierTo = path[i];
      tracks.push({
        from: s0,
        to: s0 + 320,
        run: (u, t) => {
          if (reduced) return;
          const lt = t - s0;
          let y = 0;
          let rot = 0;
          let sy = 1;
          if (lt < 80) sy = 1 - 0.14 * (lt / 80);
          else if (lt < 240) {
            const k = (lt - 80) / 160;
            y = -0.35 * 44 * Math.sin((Math.PI / 2) * k);
            rot = (i % 2 ? 6 : -6) * Math.sin(Math.PI * k);
          } else {
            const k = (lt - 240) / 80;
            y = -0.35 * 44 * (1 - k * k);
          }
          void u;
          v.body.style.transform = `translateY(${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scaleY(${sy.toFixed(3)})`;
        },
      });
      seq.push({
        at: s0 + 320,
        run: () => {
          v.setTier(tierTo);
          v.label.textContent = st.text(`ui.chest.${tierTo}`);
          v.body.style.transform = 'scaleY(0.86)';
          const now = performance.now();
          st.fx.ring(p.x, p.y, 16, 90 + 20 * i, 420, TIER_RGB[tierTo], now, 3);
          st.fx.sparksAt(p.x, p.y, 12, tierTo === 'crystal' ? 'rune' : tierTo === 'copper' ? 'amber' : 'gold', now, 160, 360, 500, Math.PI, Math.PI * 2, 400, 'star');
          st.bloom(0.12 * i, 400);
          st.trauma(0.1 * i, 3);
          st.audio.play('chest.step', { pitch: Math.pow(2, (4 * i) / 12) });
          st.haptics.play('chestStep');
        },
      });
    }
    if (steps < 4 && ti < 4) {
      // The roll stopped: grey sparks puff and the lid unlatches.
      seq.push({ at: t0 + steps * STEP_MS + 60, run: () => st.fx.sparksAt(p.x, p.y - 10, 8, 'grey', performance.now(), 60, 160, 420, Math.PI, Math.PI * 2, 200) });
    }
    seq.push({
      at: openAt,
      run: () => {
        v.el.classList.add('open');
        v.body.style.transform = 'scale(1.06)';
        const now = performance.now();
        if (OPEN_STOP[ti]) st.stop(OPEN_STOP[ti], this.tier);
        if (OPEN_FLASH[ti]) st.post.flash(OPEN_FLASH[ti], this.tier, ti === 2 ? [0.85, 1, 1] : ti === 3 ? [0.92, 0.88, 1] : [1, 0.95, 0.8], 160);
        st.bloom(0.2 + 0.1 * ti, 300 + 100 * ti);
        st.trauma(0.1 + 0.1 * ti, this.tier);
        st.fx.sparksAt(p.x, p.y - 18, 30 + 40 * ti, ti >= 2 ? (ti === 2 ? 'rune' : 'gold') : 'brass', now, 220, 560, 800, Math.PI * 1.05, Math.PI * 1.95, 520, 'star');
        st.scene.impactLight(st.depth(), 3, 4, TIER_HEX[p.tier], 1.6, 500);
        st.releaseHeld(p.x, p.y - 20);
        st.audio.play('chest.open', { intensity: ti / 4 });
        st.haptics.play(ti >= 3 ? 'chestBig' : 'chestOpen');
        st.hud.announce(st.text(`ui.chest.${p.tier}`));
      },
    });
    if (p.card && ti >= 2) {
      const card = p.card;
      seq.push({
        at: openAt + 220,
        run: () => {
          v.cardTitle.textContent = card.title;
          v.cardLines.replaceChildren(...card.lines.map((l) => h('span', { text: l })));
          v.cardNew.textContent = st.text('ui.chest.new');
          v.cardNew.classList.toggle('hide', !card.isNew);
          v.card.classList.remove('hide');
        },
      });
      // It turns in from edge-on (90° → 0°): its face is never seen mirrored.
      tracks.push({ from: openAt + 220, to: openAt + 580, run: (u) => (v.card.style.transform = `translate(-50%, -100%) rotateY(${((1 - easeOutCubic(u)) * 90).toFixed(1)}deg) scale(${(0.7 + 0.3 * easeOutCubic(u)).toFixed(3)})`) });
    }
    this.timeline = new Timeline(seq, len, openAt + 200, tracks);
    this.timeline.skipFrom = 400;
  }

  protected cleanup(): void {
    // Whatever happened, the held rewards fly (a skip, a cut).
    this.st.releaseHeld(this.v.el.getBoundingClientRect().left, this.v.el.getBoundingClientRect().top);
    this.v.el.classList.add('hide');
    this.v.card.classList.add('hide');
  }
}
