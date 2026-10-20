// The play HUD (SPEC §9): the top bar, the goal bar (every frame), the Depth Ruler, the skill row, the quick-buy row,
// the tab bar, the sheets, first-time cards, the tutorial's guide, the return feast and the stamps, laid out by
// `hudLayout` at every viewport. Elements appear in the progressive reveal's order (SPEC §8.3). Nothing interactive
// sits over the shaft between the goal bar and the skill row (L2, CRITIQUE MUST 7): the ruler, the cards and the
// stamps there are pointer-events: none.

import type { BuyMode } from '../../idle/bus';
import type { CardView } from '../../idle/model/run';
import type { GoalView, OfflineResult } from '../../idle/model/state';
import { t, type TextKey } from '../../i18n';
import { h } from '../dom';
import { spring, tween } from '../fx/waapi';
import { DepthRuler, type RulerMark } from './DepthRuler';
import { FirstTimeCard } from './FirstTimeCard';
import { ChestMarkers } from './ChestMarkers';
import { GhostHand, type GuideTarget } from './GhostHand';
import { GoalBar } from './GoalBar';
import { iconEl } from './icons';
import type { HudLayout } from './layout';
import { QuickBuy } from './QuickBuy';
import { ReturnFeast, type FeastHooks } from './ReturnFeast';
import { Sheets, type SheetId } from './Sheet';
import { createCrewSheet } from './sheets/CrewSheet';
import { createDigSheet } from './sheets/DigSheet';
import type { CardSource } from './sheets/CardSheet';
import { SettingsSheet } from './sheets/SettingsSheet';
import type { SettingsSink } from '../screens/settings';
import { SkillRow, type SkillView } from './SkillRow';
import { TopBar } from './TopBar';
import type { Big } from '../../core/big';

/** What the HUD reads from the game each frame (IdleGame implements it). */
export interface HudModel extends CardSource {
  quick(): ReadonlyArray<CardView | null>;
  goal(): GoalView;
  goldLog10(): number;
  gemsShown(): number;
  rate(): Big;
  depth(): number;
  biomeName(): string;
  /** The camera's fractional floor depth and the floor's screen y (the ruler follows the world). */
  floorFrac(): number;
  floorY(): number;
  rulerMarks(): readonly RulerMark[];
  combo(): { combo: number; mult: number; surge: number; surgeOn: boolean };
  skills(): readonly SkillView[];
  useSkill(id: string): void;
  /** Where the guide points ('' none) and the prompt key. */
  guide(): { target: string; text: string };
  /** The seal fight (null none): the fraction left and the seconds left. */
  seal(): { left: number; time: number; total: number; held: boolean } | null;
  /** A goal-bar tap: go where the goal is done. */
  go(go: string): void;
}

export interface HudHooks {
  settings: SettingsSink;
  toMenu(): void;
  about(): void;
  feast: FeastHooks;
  /** A purchase from the quick-buy row (slot 0..2). */
  onReady(id: string, slot: number): void;
  onSheet(id: SheetId | null): void;
  onMode(m: BuyMode): void;
}

type RevealId = 'gold' | 'depth' | 'gems' | 'quick1' | 'quick2' | 'quick3' | 'digTab' | 'crewTab' | 'ruler' | 'buyMode' | 'skills' | 'combo' | 'surge' | 'goalBar';

export class Hud {
  readonly el: HTMLElement;
  private sheetUp = false;
  readonly top = new TopBar();
  readonly goal = new GoalBar();
  readonly ruler = new DepthRuler();
  readonly quick: QuickBuy;
  readonly skill = new SkillRow();
  readonly sheets = new Sheets();
  readonly first = new FirstTimeCard();
  readonly guide = new GhostHand();
  /** The popped chests waiting for a tap (W1: drawn by the HUD). */
  readonly chests = new ChestMarkers();
  readonly feast: ReturnFeast;
  readonly dig: ReturnType<typeof createDigSheet>;
  readonly crew: ReturnType<typeof createCrewSheet>;
  private readonly tabs: HTMLElement;
  private readonly tabBtns = new Map<SheetId, HTMLButtonElement>();
  private readonly stampEl: HTMLElement;
  private readonly stampText: HTMLElement;
  private readonly stampSub: HTMLElement;
  private readonly sealBar: HTMLElement;
  private readonly sealFill: HTMLElement;
  private readonly sealTime: HTMLElement;
  private readonly live: HTMLElement;
  private readonly scrimTop: HTMLElement;
  private readonly scrimBottom: HTMLElement;
  private layoutV: HudLayout | null = null;
  private readonly revealed = new Set<string>();
  private sealS = '';
  private stampUntil = 0;
  private readonly buyChainUntil = { t: 0 };

  constructor(private readonly model: HudModel, hooks: HudHooks) {
    this.quick = new QuickBuy((slot, id, repeat, index) => this.buy(slot, id, repeat, index), (id, slot) => hooks.onReady(id, slot));
    this.dig = createDigSheet(model);
    this.crew = createCrewSheet(model);
    this.sheets.register(this.dig);
    this.sheets.register(this.crew);
    this.sheets.register(new SettingsSheet(hooks.settings, { toMenu: hooks.toMenu, about: hooks.about }));
    this.sheets.onChange = (id) => {
      for (const [k, b] of this.tabBtns) b.setAttribute('aria-pressed', String(k === id));
      hooks.onSheet(id);
    };
    this.sheets.onMode = (m) => hooks.onMode(m);
    this.feast = new ReturnFeast(hooks.feast);
    this.tabs = h('nav', { class: 'dd-tabs-bar hide', 'aria-label': t('ui.tab.dig') });
    for (const [id, key, icon] of [['dig', 'ui.tab.dig', 'dig'], ['crew', 'ui.tab.crew', 'crew']] as Array<[SheetId, TextKey, 'dig' | 'crew']>) {
      const b = h('button', { class: 'dd-tab-btn hide', type: 'button', 'data-tab': id, 'aria-pressed': 'false', onclick: () => this.sheets.toggle(id) }, iconEl(icon, 'dd-tab-ico'), h('span', { class: 'dd-tab-label', text: t(key) }), h('span', { class: 'dd-tab-dot hide', 'aria-hidden': 'true' }));
      this.tabBtns.set(id, b);
      this.tabs.appendChild(b);
    }
    this.top.onMenu = () => this.sheets.toggle('settings');
    this.goal.onGo = (go) => model.go(go);
    this.skill.onSkill = (id) => model.useSkill(id);
    this.stampText = h('span', { class: 'dd-stamp-text' });
    this.stampSub = h('span', { class: 'dd-stamp-sub' });
    this.stampEl = h('div', { class: 'dd-stamp hide', 'aria-hidden': 'true' }, this.stampText, this.stampSub);
    this.sealFill = h('i', { class: 'dd-seal-fill' });
    this.sealTime = h('span', { class: 'dd-seal-time' });
    this.sealBar = h('div', { class: 'dd-sealbar hide', 'aria-hidden': 'true' }, h('span', { class: 'dd-seal-track' }, this.sealFill), this.sealTime);
    this.live = h('div', { class: 'dd-sr', 'aria-live': 'polite' });
    this.scrimTop = h('div', { class: 'dd-scrim-top', 'aria-hidden': 'true' });
    this.scrimBottom = h('div', { class: 'dd-scrim-bottom', 'aria-hidden': 'true' });
    this.el = h(
      'div',
      { class: 'dd-hud' },
      this.scrimTop,
      this.scrimBottom,
      this.top.goldEl,
      this.top.depthEl,
      this.top.gemsEl,
      this.top.menuBtn,
      this.goal.el,
      this.sealBar,
      this.ruler.el,
      this.chests.el,
      this.stampEl,
      this.skill.el,
      this.quick.el,
      this.tabs,
      this.live,
    );
  }

  /** The layers that live outside .dd-hud (sheets, toasts, guide, feast) for the UI to mount in z order. */
  get layers(): { sheets: HTMLElement; toasts: HTMLElement; guide: HTMLElement; ceremony: HTMLElement } {
    return { sheets: this.sheets.el, toasts: this.first.el, guide: this.guide.el, ceremony: this.feast.el };
  }

  /** A hold-to-buy chain is running (★ ceremonies merge). */
  get buyChain(): boolean {
    return performance.now() < this.buyChainUntil.t;
  }

  private buy(slot: number, id: string, repeat: boolean, index: number): boolean {
    if (repeat) this.buyChainUntil.t = performance.now() + 400;
    void slot;
    return this.model.buy(id, repeat, index);
  }

  /** Lay the HUD out (CSS variables from the pure layout). */
  layout(l: HudLayout): void {
    this.layoutV = l;
    const st = this.el.style;
    const px = (n: number) => `${Math.round(n)}px`;
    const set = (k: string, v: number) => st.setProperty(k, px(v));
    set('--col-x', l.column.x);
    set('--col-w', l.column.w);
    set('--gold-x', l.gold.x);
    set('--gold-y', l.gold.y);
    set('--gold-w', l.gold.w);
    set('--bar-h', l.gold.h);
    set('--depth-x', l.depth.x);
    set('--depth-w', l.depth.w);
    set('--menu-x', l.menu.x);
    set('--menu-y', l.menu.y);
    set('--gems-x', l.gems.x);
    set('--gems-y', l.gems.y);
    set('--gems-h', l.gems.h);
    set('--goal-x', l.goal.x);
    set('--goal-y', l.goal.y);
    set('--goal-w', l.goal.w);
    set('--goal-h', l.goal.h);
    set('--toast-x', l.toast.x);
    set('--toast-y', l.toast.y);
    set('--toast-w', l.toast.w);
    set('--ruler-x', l.ruler.x);
    set('--ruler-y', l.ruler.y);
    set('--ruler-h', l.ruler.h);
    set('--region-top', l.region.top);
    set('--region-bottom', l.region.bottom);
    set('--skill-y', l.skill.y);
    set('--skill-h', l.skill.h);
    set('--quick-y', l.quick[0].y);
    set('--quick-h', l.quick[0].h);
    set('--quick-x', l.quick[0].x);
    set('--card-w', l.quick[0].w);
    set('--card-gap', l.quick[1].x - l.quick[0].x - l.quick[0].w);
    set('--tabs-y', l.tabs.y);
    set('--sheet-top', l.sheetTop);
    set('--sheet-bottom', l.sheetBottom);
    set('--vh', l.height);
    this.el.classList.toggle('compact', l.compact);
    for (const layer of [this.sheets.el, this.first.el]) {
      for (const k of ['--col-x', '--col-w', '--sheet-top', '--sheet-bottom', '--toast-x', '--toast-y', '--toast-w', '--vh']) layer.style.setProperty(k, st.getPropertyValue(k));
    }
    this.ruler.setBounds(l.ruler.y, l.ruler.y + l.ruler.h);
  }

  /** Reveal an element (SPEC §8.3); `instant` on a load (no drop-in). */
  reveal(id: string, instant = false): void {
    if (this.revealed.has(id)) return;
    this.revealed.add(id);
    switch (id as RevealId) {
      case 'gold':
        this.top.reveal('gold', instant);
        break;
      case 'depth':
        this.top.reveal('depth', instant);
        break;
      case 'gems':
        this.top.reveal('gems', instant);
        break;
      case 'quick1':
        this.quick.reveal(0, instant);
        break;
      case 'quick2':
        this.quick.reveal(1, instant);
        break;
      case 'quick3':
        this.quick.reveal(2, instant);
        break;
      case 'digTab':
      case 'crewTab': {
        const b = this.tabBtns.get(id === 'digTab' ? 'dig' : 'crew')!;
        this.tabs.classList.remove('hide');
        b.classList.remove('hide');
        if (!instant) {
          spring(b, 'snap', 0, 1, (v) => `translateY(${(1 - v) * 20}px)`);
          b.querySelector('.dd-tab-dot')?.classList.remove('hide');
        }
        break;
      }
      case 'ruler':
        this.ruler.reveal();
        break;
      case 'buyMode':
        this.sheets.revealModes();
        break;
      case 'combo':
        this.skill.reveal('combo');
        break;
      case 'surge':
        this.skill.reveal('surge');
        break;
      default:
        break;
    }
  }

  isRevealed(id: string): boolean {
    return this.revealed.has(id);
  }

  /** Show a first-time card. */
  firstTime(title: string, body: string): void {
    this.first.show(title, body);
  }

  /** The ★ stamp on a card (and the ×2). */
  stampStar(id: string, _crown: boolean): void {
    const slot = this.quick.slotOf(id);
    const card = slot >= 0 ? this.quick.cards[slot] : null;
    card?.bought(true);
  }

  /** A big stamp at the world window's centre (1.8 → 1, −8° → 0°), held 900 ms. */
  stamp(text: string, sub: string, tone: 'amber' | 'rune' | 'white'): void {
    if (!text) return;
    this.stampText.textContent = text;
    this.stampSub.textContent = sub;
    this.stampSub.style.display = sub ? '' : 'none';
    this.stampEl.dataset.tone = tone;
    this.stampEl.classList.remove('hide');
    spring(this.stampEl, 'snap', 1.8, 1, (v) => `translate(-50%, -50%) rotate(${((v - 1) / 0.8) * -8}deg) scale(${v})`);
    this.stampUntil = performance.now() + 1400;
  }

  announce(text: string): void {
    this.live.textContent = text;
  }

  /** The rect of a card by id (quick-buy first, then the open sheet's row). */
  cardRect(id: string): DOMRect | null {
    const slot = this.quick.slotOf(id);
    if (slot >= 0) return this.quick.slotEl(slot).getBoundingClientRect();
    const row = this.dig.rowOf(id) ?? this.crew.rowOf(id);
    if (row && row.isConnected) return row.getBoundingClientRect();
    return null;
  }

  depthPoint(): { x: number; y: number } | null {
    if (!this.top.revealed('depth')) return null;
    const r = this.top.depthEl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /** Open the return feast. */
  startFeast(r: OfflineResult): void {
    this.feast.start(r, performance.now());
  }

  /** Per frame. `dt` seconds, `now` ms. */
  update(dt: number, now: number, ceremony: boolean): void {
    const m = this.model;
    // Counters: gold and gems through the ledger.
    this.top.gold.setTarget(m.goldLog10(), now);
    this.top.gold.update(dt, now);
    const gems = m.gemsShown();
    this.top.gems.setTarget(gems > 0 ? Math.log10(gems) : -Infinity, now, true);
    this.top.gems.update(dt, now);
    this.top.setRate(m.rate());
    this.top.setDepth(m.depth(), m.biomeName());
    // The goal bar: every frame of play.
    this.goal.update(m.goal(), dt);
    // The seal bar (the fight's HP and timer, under the goal bar).
    const seal = m.seal();
    const sealKey = seal ? `${seal.left.toFixed(3)}|${Math.ceil(seal.time)}|${seal.held ? 1 : 0}` : '';
    if (sealKey !== this.sealS) {
      this.sealS = sealKey;
      if (seal) {
        this.sealBar.classList.remove('hide');
        this.sealFill.style.transform = `scaleX(${Math.max(0, Math.min(1, seal.left))})`;
        this.sealTime.textContent = seal.held ? '' : `${Math.max(0, Math.ceil(seal.time))} s`;
        this.sealBar.classList.toggle('urgent', !seal.held && seal.time <= 5);
      } else this.sealBar.classList.add('hide');
    }
    // The ruler follows the world.
    if (this.revealed.has('ruler')) this.ruler.update(m.floorFrac(), m.floorY(), m.rulerMarks());
    // A risen sheet covers the skill row and the quick-buy row: they fade out under it (no overlap, no stray taps).
    const up = this.sheets.fraction > 0.35;
    if (up !== this.sheetUp) {
      this.sheetUp = up;
      this.el.classList.toggle('dd-sheet-up', up);
    }
    // Quick-buy.
    const shown = m.shownGoldLog10();
    const views = m.quick();
    // BEST shows when two options first compete (SPEC §8.3: about 0:20).
    if (!this.quick.revealed(1) && this.quick.revealed(0) && this.quick.revealed(2) && views[1] && views[1].id !== views[0]?.id && views[1].id !== views[2]?.id) this.reveal('quick2');
    this.quick.update(views, shown, now);
    // The skill row.
    const c = m.combo();
    this.skill.update(c.combo, c.mult, c.surge, c.surgeOn, m.skills());
    // Sheets.
    this.sheets.frame(dt, now);
    // First-time cards wait during ceremonies.
    this.first.frame(now, ceremony);
    // The guide.
    this.updateGuide();
    this.feast.frame(now);
    if (this.stampUntil && now > this.stampUntil) {
      this.stampUntil = 0;
      const a = tween(this.stampEl, [{ opacity: 1 }, { opacity: 0 }], 240, 'exit');
      if (a) a.onfinish = () => this.stampEl.classList.add('hide');
      else this.stampEl.classList.add('hide');
    }
  }

  private updateGuide(): void {
    const g = this.model.guide();
    const target = this.guideTarget(g.target);
    // The prompt rides on the goal bar; the hand (and for UI targets the focus scrim) points at the thing itself.
    const scrim = !!target && (g.target.startsWith('card:') || g.target.startsWith('tab:') || g.target.startsWith('skill:'));
    this.guide.show(target ? g.target : '', target, scrim);
  }

  /** Resolve a guide target id to a screen rect. */
  private guideTarget(id: string): GuideTarget | null {
    if (!id) return null;
    const rectOf = (el: Element | null): GuideTarget | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    };
    if (id.startsWith('card:')) {
      const cid = id.slice(5);
      const slot = this.quick.slotOf(cid);
      if (slot >= 0) return rectOf(this.quick.slotEl(slot));
      return null;
    }
    if (id.startsWith('tab:')) return rectOf(this.tabBtns.get(id.slice(4) as SheetId) ?? null);
    if (id.startsWith('skill:')) return rectOf(this.skill.skillEl(id.slice(6)));
    if (id === 'buyMode') return null;
    if (id === 'surge') return this.skill.comboPoint() ? rectOf(this.skill.comboEl) : null;
    // World targets (a cell, a chest, the seal) are resolved by the game.
    return this.worldTarget?.(id) ?? null;
  }

  /** The game resolves world targets ('cell', chest ids, 'seal', 'crystal'). */
  worldTarget: ((id: string) => GuideTarget | null) | null = null;

  get layoutNow(): HudLayout | null {
    return this.layoutV;
  }
}
