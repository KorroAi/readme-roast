// The return feast v1 (SPEC §4.4, T5): the plate drops in ("While you were away · 5 h 12 m"), its lines roll in one
// after another (metres, gold, chests on the rack, the crew waiting at a seal), the gold counts up in log space while
// coins rise from the plate, then Collect pops and breathes. Collect flies the haul to the counter (credited per
// landing through the ledger) and slides the Chest Rack in: one tap per chest, at least 0.8 s apart. Any tap on the
// plate before Collect skips the count to its end.

import { Big } from '../../core/big';
import { EASE } from '../../core/ease';
import type { OfflineResult } from '../../idle/model/state';
import { format, formatAway, formatDepth } from '../../idle/num/notation';
import { t } from '../../i18n';
import { h } from '../dom';
import { spring, tween } from '../fx/waapi';
import { scriptedMs } from '../fx/Ticker';
import { iconEl } from './icons';

export type FeastPhase = '' | 'counting' | 'collect' | 'rack';

export interface FeastHooks {
  /** Credit the haul (the model's collect). Called once, on Collect. */
  collect(): void;
  /** Open one chest from the rack. @returns false when the rack is empty. */
  openChest(): boolean;
  /** Chests on the rack now. */
  rackCount(): number;
  /** Coins rising from a point (FX) and the cash-roll tick. */
  coins(x: number, y: number, n: number): void;
  tick(progress: number): void;
  /** The feast closed (the BEST card and every affordable card light up: "Spend your haul"). */
  done(): void;
}

export class ReturnFeast {
  readonly el: HTMLElement;
  private readonly plate: HTMLElement;
  private readonly away: HTMLElement;
  private readonly lines: HTMLElement;
  private readonly total: HTMLElement;
  private readonly collectBtn: HTMLButtonElement;
  private readonly rack: HTMLElement;
  private readonly rackBtn: HTMLButtonElement;
  private readonly rackCount: HTMLElement;
  phase: FeastPhase = '';
  private t0 = 0;
  private countMs = 1000;
  private totalLog = 0;
  private skipped = false;
  private lastRackOpen = -Infinity;
  private lastTick = 0;
  private coinsFired = false;
  private readonly scratch = Big.zero();

  constructor(private readonly hooks: FeastHooks) {
    this.away = h('p', { class: 'dd-feast-away' });
    this.lines = h('ul', { class: 'dd-feast-lines' });
    this.total = h('p', { class: 'dd-feast-total' });
    this.collectBtn = h('button', { class: 'dd-btn primary dd-feast-collect', type: 'button', 'data-hud': 'collect', text: t('ui.feast.collect'), onclick: () => this.collect() });
    this.plate = h(
      'section',
      { class: 'dd-feast-plate', role: 'dialog', 'aria-label': t('ui.feast.title'), onpointerdown: () => this.skip() },
      h('h2', { class: 'dd-feast-title', text: t('ui.feast.title') }),
      this.away,
      this.lines,
      h('div', { class: 'dd-feast-sum' }, iconEl('coin', 'dd-feast-coin'), this.total),
      this.collectBtn,
    );
    this.rackCount = h('span', { class: 'dd-rack-count' });
    this.rackBtn = h('button', { class: 'dd-btn primary dd-rack-open', type: 'button', 'data-hud': 'rack', onclick: () => this.openChest() }, iconEl('chest', 'dd-rack-ico'), h('span', { text: t('ui.feast.open') }), this.rackCount);
    this.rack = h('div', { class: 'dd-rack hide' }, h('span', { class: 'dd-rack-title', text: t('ui.feast.rack') }), this.rackBtn);
    this.el = h('div', { class: 'dd-feast hide' }, this.plate, this.rack);
  }

  get open(): boolean {
    return this.phase !== '';
  }

  /** Start the feast for an offline result. `now` ms. */
  start(r: OfflineResult, now: number): void {
    this.phase = 'counting';
    this.t0 = now;
    this.skipped = false;
    this.coinsFired = false;
    this.totalLog = r.gold.isZero() ? 0 : r.gold.log10();
    this.countMs = scriptedMs(0, this.totalLog);
    this.away.textContent = formatAway(r.seconds);
    const rows: string[] = [];
    if (r.toDepth > r.fromDepth) rows.push(t('ui.feast.depth', { rows: formatDepth(r.toDepth - r.fromDepth), from: formatDepth(r.fromDepth), to: formatDepth(r.toDepth) }));
    rows.push(t('ui.feast.gold', { gold: format(r.gold) }));
    if (r.chests > 0) rows.push(r.chests === 1 ? t('ui.feast.chest') : t('ui.feast.chests', { count: r.chests }));
    if (r.sealBiome >= 0) rows.push(t('ui.feast.seal'));
    if (r.capped) rows.push(t('ui.feast.capped', { time: formatAway(r.seconds) }));
    this.lines.replaceChildren(...rows.map((text) => h('li', { class: 'dd-feast-line', text })));
    this.total.textContent = '0';
    this.collectBtn.classList.add('hide');
    this.rack.classList.add('hide');
    this.el.classList.remove('hide');
    // 300 ms: the plate drops in on the snap spring; 450 ms: the lines roll in one after another.
    this.plate.style.opacity = '0';
    window.setTimeout(() => {
      this.plate.style.opacity = '';
      spring(this.plate, 'snap', 0, 1, (v) => `translateY(${(v - 1) * 80}px)`);
    }, 300);
    let i = 0;
    for (const li of this.lines.children) {
      tween(li, [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }], 240, 'outQuint', { delay: 450 + 120 * i, fill: 'backwards' });
      i++;
    }
  }

  /** A tap on the plate before Collect: jump to the end of the count. */
  skip(): void {
    if (this.phase === 'counting') this.skipped = true;
  }

  private collect(): void {
    if (this.phase !== 'collect') return;
    this.hooks.collect();
    const r = this.collectBtn.getBoundingClientRect();
    this.hooks.coins(r.left + r.width / 2, r.top + r.height / 2, 24);
    if (this.hooks.rackCount() > 0) {
      this.phase = 'rack';
      this.plate.classList.add('hide');
      this.rack.classList.remove('hide');
      spring(this.rack, 'bounce', 0, 1, (v) => `translateY(${(1 - v) * 60}px)`);
    } else this.close();
  }

  private openChest(): void {
    const now = performance.now();
    if (this.phase !== 'rack' || now - this.lastRackOpen < 800) return;
    this.lastRackOpen = now;
    this.hooks.openChest();
    if (this.hooks.rackCount() <= 0) this.close();
  }

  close(): void {
    this.phase = '';
    this.el.classList.add('hide');
    this.plate.classList.remove('hide');
    this.hooks.done();
  }

  /** Per frame (`now` ms). */
  frame(now: number): void {
    if (this.phase === 'rack') {
      const n = String(this.hooks.rackCount());
      if (this.rackCount.textContent !== n) this.rackCount.textContent = n;
      return;
    }
    if (this.phase !== 'counting') return;
    const start = this.t0 + 600;
    const u = this.skipped ? 1 : Math.max(0, Math.min(1, (now - start) / this.countMs));
    if (now >= start || this.skipped) {
      const l = this.totalLog * EASE.outQuart(u);
      const text = u >= 1 ? format(this.scratch.setLog10(this.totalLog)) : format(this.scratch.setLog10(l));
      if (this.total.textContent !== text) this.total.textContent = text;
      if (now - this.lastTick > 1000 / 24 && u < 1) {
        this.lastTick = now;
        this.hooks.tick(u);
      }
      if (!this.coinsFired) {
        this.coinsFired = true;
        const r = this.total.getBoundingClientRect();
        this.hooks.coins(r.left + r.width / 2, r.top, 40);
      }
    }
    if (u >= 1 && now >= start + this.countMs + 250 - (this.skipped ? this.countMs + 250 : 0)) {
      this.phase = 'collect';
      this.collectBtn.classList.remove('hide');
      spring(this.collectBtn, 'jelly', 0.6, 1, (v) => `scale(${v})`);
      this.collectBtn.classList.add('breathe');
    }
  }
}
