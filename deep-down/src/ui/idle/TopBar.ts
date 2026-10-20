// The top bar (SPEC §9.1): the gold counter with its coin socket (the flights' target) and its rate, the depth plate
// with the biome's name, the gems chip, and ≡. Counters roll (Ticker) and the socket catches every landing on the
// jelly spring. Plates drop in the first time they are needed (the progressive reveal, SPEC §8.3).

import { Big } from '../../core/big';
import { format, formatDepth, formatRate } from '../../idle/num/notation';
import { t } from '../../i18n';
import { h } from '../dom';
import { Ticker } from '../fx/Ticker';
import { play, spring } from '../fx/waapi';
import { iconEl } from './icons';

const scratch = Big.zero();
const fmtLog = (l: number): string => (Number.isFinite(l) ? format(scratch.setLog10(l)) : '0');

export class TopBar {
  readonly goldEl: HTMLElement;
  readonly depthEl: HTMLElement;
  readonly gemsEl: HTMLElement;
  readonly menuBtn: HTMLButtonElement;
  /** The rank badge (an octagon plate with the rank and its XP as an octagonal stroke) and the XP bar under gold. */
  readonly rankEl: HTMLElement;
  readonly xpEl: HTMLElement;
  private readonly rankV: HTMLElement;
  private readonly xpFill: HTMLElement;
  private readonly rankRing: SVGPolygonElement;
  private rankS = -1;
  private xpS = -1;
  readonly coin: HTMLElement;
  readonly gemIcon: HTMLElement;
  readonly gold: Ticker;
  readonly gems: Ticker;
  private readonly rate: HTMLElement;
  private readonly depthV: HTMLElement;
  private readonly depthU: HTMLElement;
  private readonly biome: HTMLElement;
  private rateS = '';
  private depthS = '';
  private biomeS = '';
  private lastCatch = -Infinity;
  private charge = 0;
  onMenu: (() => void) | null = null;

  constructor() {
    this.gold = new Ticker(fmtLog, 'dd-gold-v', t('ui.hud.gold'));
    this.gems = new Ticker((l) => (Number.isFinite(l) ? String(Math.round(Math.pow(10, l))) : '0'), 'dd-gems-v', t('ui.hud.gems'));
    this.coin = h('span', { class: 'dd-coin-sock' }, iconEl('coin', 'dd-coin-ico'));
    this.rate = h('span', { class: 'dd-gold-rate' });
    this.goldEl = h('div', { class: 'dd-plate dd-gold hide', 'data-hud': 'gold' }, this.coin, h('span', { class: 'dd-gold-col' }, this.gold.el, this.rate));
    this.depthV = h('span', { class: 'dd-depth-v' });
    // The unit sits in the text face: the Lintel has capitals only, and "M" would read as millions.
    this.depthU = h('span', { class: 'dd-depth-u' });
    this.biome = h('span', { class: 'dd-depth-biome' });
    this.depthEl = h('div', { class: 'dd-plate dd-depthplate hide', 'data-hud': 'depth', role: 'text' }, h('span', { class: 'dd-depth-line' }, this.depthV, this.depthU), this.biome);
    this.gemIcon = iconEl('gem', 'dd-gem-ico');
    this.gemsEl = h('div', { class: 'dd-chip dd-gems hide', 'data-hud': 'gems' }, this.gemIcon, this.gems.el);
    this.menuBtn = h('button', { class: 'dd-menu-btn', type: 'button', 'aria-label': t('ui.hud.menu'), 'data-hud': 'menu', onclick: () => this.onMenu?.() }, iconEl('menu', 'dd-menu-ico'));
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('class', 'dd-rank-svg');
    const oct = '14,3 34,3 45,14 45,34 34,45 14,45 3,34 3,14 14,3';
    const track = document.createElementNS(NS, 'polygon');
    track.setAttribute('points', oct);
    track.setAttribute('class', 'dd-rank-track');
    this.rankRing = document.createElementNS(NS, 'polygon');
    this.rankRing.setAttribute('points', oct);
    this.rankRing.setAttribute('class', 'dd-rank-ring');
    this.rankRing.setAttribute('pathLength', '100');
    svg.append(track, this.rankRing);
    this.rankV = h('span', { class: 'dd-rank-v' });
    this.rankEl = h('div', { class: 'dd-rank hide', 'data-hud': 'rank', role: 'text' }, svg, this.rankV);
    this.xpFill = h('i', { class: 'dd-xp-fill' });
    this.xpEl = h('div', { class: 'dd-xp hide', 'aria-hidden': 'true' }, this.xpFill);
  }

  /** The rank and its XP (0..1 toward the next). Writes only on change. */
  setRank(rank: number, xpFrac: number): void {
    if (rank !== this.rankS) {
      this.rankS = rank;
      this.rankV.textContent = String(rank);
      this.rankEl.setAttribute('aria-label', t('ui.rank.label', { rank }));
    }
    const f = Math.round(Math.max(0, Math.min(1, xpFrac)) * 200) / 200;
    if (f !== this.xpS) {
      this.xpS = f;
      this.xpFill.style.transform = `scaleX(${f})`;
      this.rankRing.style.strokeDasharray = `${(f * 100).toFixed(1)} 100`;
    }
  }

  /** Show the rank badge and the XP bar (Rank 2 or the first Feat, SPEC §8.3); the gold plate moves over. */
  revealRank(instant = false): void {
    if (!this.rankEl.classList.contains('hide')) return;
    this.rankEl.classList.remove('hide');
    this.xpEl.classList.remove('hide');
    this.goldEl.classList.add('ranked');
    if (!instant) spring(this.rankEl, 'bounce', 0, 1, (v) => `scale(${v})`);
  }

  /** The rank-up pop (jelly 1 → 1.25). */
  popRank(): void {
    spring(this.rankEl, 'jelly', 1.25, 1, (v) => `scale(${v})`);
  }

  /** Reveal a plate (snap drop-in) once. */
  reveal(which: 'gold' | 'depth' | 'gems', instant = false): void {
    const el = which === 'gold' ? this.goldEl : which === 'depth' ? this.depthEl : this.gemsEl;
    if (!el.classList.contains('hide')) return;
    el.classList.remove('hide');
    if (!instant) spring(el, 'snap', 0, 1, (v) => `translateY(${(v - 1) * 24}px) scale(${0.85 + 0.15 * v})`);
  }

  revealed(which: 'gold' | 'depth' | 'gems'): boolean {
    const el = which === 'gold' ? this.goldEl : which === 'depth' ? this.depthEl : this.gemsEl;
    return !el.classList.contains('hide');
  }

  /** A token landed in the socket: catch it (sx 1.22 / sy 0.82 → 1 on the jelly spring; faster landings charge). */
  catch(kind: 'coin' | 'gem', now: number): void {
    const el = kind === 'gem' ? this.gemIcon : this.coin;
    if (now - this.lastCatch < 70) {
      this.charge = Math.min(0.13, this.charge + 0.03);
      return;
    }
    const k = 0.22 + this.charge;
    this.charge = 0;
    this.lastCatch = now;
    spring(el, 'jelly', 0, 1, (v) => `scale(${1 + k * (1 - v)}, ${1 - k * 0.82 * (1 - v)})`);
  }

  /** Motion Off: a counter changes with a 120 ms highlight instead of a flight. */
  highlight(): void {
    play(this.goldEl, [{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], { duration: 120 });
  }

  setRate(perSec: Big): void {
    const s = perSec.isZero() ? '' : formatRate(perSec);
    if (s === this.rateS) return;
    this.rateS = s;
    this.rate.textContent = s;
  }

  setDepth(rows: number, biome: string): void {
    const d = formatDepth(rows);
    if (d !== this.depthS) {
      this.depthS = d;
      // "20 m", "4.52 km" (the notation puts a thin space before the unit).
      const m = /^(.*?)[\s\u2009\u202f]+([a-zA-Z]+)$/.exec(d);
      this.depthV.textContent = m ? m[1] : d;
      this.depthU.textContent = m ? m[2] : '';
    }
    if (biome !== this.biomeS) {
      this.biomeS = biome;
      this.biome.textContent = biome;
    }
    if (d !== this.depthEl.dataset.v) {
      this.depthEl.dataset.v = d;
      this.depthEl.setAttribute('aria-label', t('ui.hud.depthOpen', { depth: d, biome }));
    }
  }

  /** The coin socket's centre (CSS px), for the FX flights. */
  socketCentre(which: 'gold' | 'gems'): { x: number; y: number } {
    const r = (which === 'gold' ? this.coin : this.gemIcon).getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
}
