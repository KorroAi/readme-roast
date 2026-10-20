// The goal bar (SPEC §8.4): one bar under the top bar, on screen in every frame of play (with a sheet open and during
// ceremonies): an icon, one line (≤ 32 characters), a 4 px progress bar, the reward chip and an ETA. Tapping it goes
// where the goal is done. On completion the bar flashes, and the next goal slides in without emptying: the fill
// morphs from the old value to the new goal's real fill.

import type { GoalView } from '../../idle/model/state';
import { formatEta } from '../../idle/num/notation';
import { t } from '../../i18n';
import { h } from '../dom';
import { tween } from '../fx/waapi';
import { tr } from './Card';
import { iconEl, setIcon, type IconId } from './icons';

const ICONS: Record<string, IconId> = {
  tap: 'dig', dig: 'dig', pick: 'pick', crew: 'crew', star: 'star', chest: 'chest', depth: 'depth', seal: 'seal', gear: 'gear', gem: 'gem',
  dynamite: 'dynamite', flag: 'flag', crown: 'crown', lantern: 'lantern', coin: 'coin', skill: 'skill',
};

export class GoalBar {
  readonly el: HTMLButtonElement;
  private readonly icon: HTMLElement;
  private readonly text: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly reward: HTMLElement;
  private readonly eta: HTMLElement;
  private id = '';
  private textS = '';
  private rewardS = '';
  private etaS = '';
  /** The fill shown (morphs toward the goal's fill). */
  private shown = 0;
  private written = -1;
  /** The goal's `go` target (what a tap opens). */
  go = '';
  onGo: ((go: string) => void) | null = null;

  constructor() {
    this.icon = iconEl('goal', 'dd-goal-ico');
    this.text = h('span', { class: 'dd-goal-text' });
    this.reward = h('span', { class: 'dd-goal-reward' });
    this.eta = h('span', { class: 'dd-goal-eta' });
    this.bar = h('i', { class: 'dd-goal-fill' });
    this.el = h(
      'button',
      { class: 'dd-goal', type: 'button', 'data-hud': 'goal', onclick: () => this.onGo?.(this.go) },
      h('span', { class: 'dd-goal-row' }, this.icon, this.text, this.reward, this.eta),
      h('span', { class: 'dd-goal-bar' }, this.bar),
    );
  }

  /** The goal's text as shown. */
  get value(): string {
    return this.textS;
  }

  get id_(): string {
    return this.id;
  }

  get fill(): number {
    return this.shown;
  }

  /** Show the goal (every frame; writes only on change). */
  update(g: GoalView, dt: number): void {
    if (g.id !== this.id) {
      const first = this.id === '';
      this.id = g.id;
      this.el.dataset.goal = g.id;
      setIcon(this.icon, ICONS[g.icon] ?? 'goal');
      if (!first) tween(this.el.querySelector('.dd-goal-row')!, [{ transform: 'translateY(10px)', opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }], 220, 'outCubic');
    }
    const text = tr(g.key, g.params);
    if (text !== this.textS) {
      this.textS = text;
      this.text.textContent = text;
      this.el.setAttribute('aria-label', t('ui.hud.goal', { text }));
    }
    const reward = g.reward ? tr(g.reward, g.rewardParams) : '';
    if (reward !== this.rewardS) {
      this.rewardS = reward;
      this.reward.textContent = reward;
      this.reward.style.display = reward ? '' : 'none';
    }
    const eta = Number.isFinite(g.eta) && g.eta > 0 && g.eta < 3600 && g.fill < 1 ? t('ui.hud.eta', { eta: formatEta(g.eta) }) : '';
    if (eta !== this.etaS) {
      this.etaS = eta;
      this.eta.textContent = eta;
    }
    this.go = g.go;
    // The fill morphs (never jumps back to empty when a goal changes).
    const target = Math.max(0, Math.min(1, g.fill));
    this.shown += (target - this.shown) * (1 - Math.exp(-dt / 0.12));
    if (Math.abs(target - this.shown) < 0.002) this.shown = target;
    const w = Math.round(this.shown * 400) / 400;
    if (w !== this.written) {
      this.written = w;
      this.bar.style.transform = `scaleX(${w})`;
    }
  }

  /** A goal completed: the bar flashes. */
  complete(): void {
    tween(this.el, [{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], 420, 'outCubic');
  }
}
