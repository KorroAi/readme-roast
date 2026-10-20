// The play HUD (SPEC §9): the top bar, the goal bar (every frame), the Depth Ruler, the skill row, the quick-buy row,
// the tab bar, the sheets, first-time cards, the tutorial's guide, the return feast and the stamps, laid out by
// `hudLayout` at every viewport. Elements appear in the progressive reveal's order (SPEC §8.3). Nothing interactive
// sits over the shaft between the goal bar and the skill row (L2, CRITIQUE MUST 7): the ruler, the cards and the
// stamps there are pointer-events: none.

import type { BuyMode } from '../../idle/bus';
import type { CardView } from '../../idle/model/run';
import type { GoalView, OfflineResult } from '../../idle/model/state';
import { t } from '../../i18n';
import { h } from '../dom';
import { spring, tween } from '../fx/waapi';
import { DepthRuler, type RulerMark } from './DepthRuler';
import { FirstTimeCard } from './FirstTimeCard';
import { GhostHand, type GuideTarget } from './GhostHand';
import { GoalBar } from './GoalBar';
import { iconEl, type IconId } from './icons';
import type { HudLayout } from './layout';
import { QuickBuy } from './QuickBuy';
import { ReturnFeast, type FeastHooks } from './ReturnFeast';
import { Sheets, TABS, type SheetId } from './Sheet';
import { GuideSheet, type GuideSource } from './sheets/GuideSheet';
import { createCrewSheet } from './sheets/CrewSheet';
import { createDigSheet } from './sheets/DigSheet';
import type { CardSource } from './sheets/CardSheet';
import { SettingsSheet } from './sheets/SettingsSheet';
import type { SettingsSink } from '../screens/settings';
import { SkillRow, type SkillView } from './SkillRow';
import { SealHud, type SealView } from './SealHud';
import { EventBubbles } from './EventBubbles';
import { TopBar } from './TopBar';
import type { Big } from '../../core/big';

/** What the HUD reads from the game each frame (IdleGame implements it). */
export interface HudModel extends CardSource, GuideSource {
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
  /** The seal fight (null none). */
  seal(): SealView | null;
  /** The weak point's screen point while it is lit (null otherwise). */
  weakPoint(): { x: number; y: number } | null;
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

type RevealId =
  | 'gold' | 'depth' | 'gems' | 'quick1' | 'quick2' | 'quick3' | 'digTab' | 'crewTab' | 'boardTab' | 'featsTab' | 'codexTab' | 'lanternTab'
  | 'ruler' | 'buyMode' | 'skills' | 'combo' | 'surge' | 'goalBar' | 'guide';

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
  readonly feast: ReturnFeast;
  readonly dig: ReturnType<typeof createDigSheet>;
  readonly crew: ReturnType<typeof createCrewSheet>;
  readonly guideSheet: GuideSheet;
  private readonly tabs: HTMLElement;
  private readonly tabBtns = new Map<SheetId, HTMLButtonElement>();
  private readonly stampEl: HTMLElement;
  private readonly stampText: HTMLElement;
  private readonly stampSub: HTMLElement;
  readonly sealHud = new SealHud();
  readonly bubbles = new EventBubbles();
  private readonly live: HTMLElement;
  private readonly scrimTop: HTMLElement;
  private readonly scrimBottom: HTMLElement;
  private layoutV: HudLayout | null = null;
  private readonly revealed = new Set<string>();
  private stampUntil = 0;
  private readonly buyChainUntil = { t: 0 };

  constructor(private readonly model: HudModel, hooks: HudHooks) {
    this.quick = new QuickBuy((slot, id, repeat, index) => this.buy(slot, id, repeat, index), (id, slot) => hooks.onReady(id, slot));
    this.dig = createDigSheet(model);
    this.crew = createCrewSheet(model);
    this.sheets.register(this.dig);
    this.sheets.register(this.crew);
    this.sheets.register(new SettingsSheet(hooks.settings, { toMenu: hooks.toMenu, about: hooks.about }));
    this.guideSheet = new GuideSheet(model);
    this.sheets.register(this.guideSheet);
    this.sheets.onChange = (id) => {
      for (const [k, b] of this.tabBtns) b.setAttribute('aria-pressed', String(k === id));
      hooks.onSheet(id);
    };
    this.sheets.onMode = (m) => hooks.onMode(m);
    this.feast = new ReturnFeast(hooks.feast);
    this.ceremonyEl = h('div', { class: 'dd-ceremony-inner' }, this.sealHud.reticle, this.feast.el);
    const ring = h('i');
    ring.innerHTML = '<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polygon points="29,0 71,0 100,29 100,71 71,100 29,100 0,71 0,29"/></svg>';
    this.pingEl = h('span', { class: 'dd-ping hide', 'aria-hidden': 'true' }, ring);
    this.toastEl = h('div', { class: 'dd-toasts-inner' }, this.first.el, this.pingEl);
    this.tabs = h('nav', { class: 'dd-tabs-bar hide', 'aria-label': t('ui.tab.dig') });
    // Every tab is built once (hidden until its reveal, SPEC §8.3): a reveal never creates an element (F10).
    for (const tab of TABS) {
      const id = tab.id;
      const b = h('button', { class: 'dd-tab-btn hide', type: 'button', 'data-tab': id, 'aria-pressed': 'false', onclick: () => this.tabTap(id) }, iconEl(tab.icon as IconId, 'dd-tab-ico'), h('span', { class: 'dd-tab-label', text: t(tab.label) }), h('span', { class: 'dd-tab-dot hide', 'aria-hidden': 'true' }));
      this.tabBtns.set(id, b);
      this.tabs.appendChild(b);
    }
    this.top.onMenu = () => this.sheets.toggle('settings');
    this.goal.onGo = (go) => model.go(go);
    this.skill.onSkill = (id) => model.useSkill(id);
    this.skill.onGuide = () => {
      this.skill.guideDot(false);
      this.sheets.toggle('guide');
    };
    this.stampText = h('span', { class: 'dd-stamp-text' });
    this.stampSub = h('span', { class: 'dd-stamp-sub' });
    this.stampEl = h('div', { class: 'dd-stamp hide', 'aria-hidden': 'true' }, this.stampText, this.stampSub);
    this.live = h('div', { class: 'dd-sr', 'aria-live': 'polite' });
    this.scrimTop = h('div', { class: 'dd-scrim-top', 'aria-hidden': 'true' });
    this.scrimBottom = h('div', { class: 'dd-scrim-bottom', 'aria-hidden': 'true' });
    this.el = h(
      'div',
      { class: 'dd-hud' },
      this.scrimTop,
      this.scrimBottom,
      this.top.rankEl,
      this.top.xpEl,
      this.top.goldEl,
      this.top.depthEl,
      this.top.gemsEl,
      this.top.menuBtn,
      this.goal.el,
      this.sealHud.el,
      this.ruler.el,
      this.bubbles.el,
      this.stampEl,
      this.skill.el,
      this.quick.el,
      this.tabs,
      this.live,
    );
  }

  /** The ceremony layer's content (z 3): the feast, widgets, the seal HUD, chest reveals, the facet hand, titles. */
  readonly ceremonyEl: HTMLElement;
  /** The toast layer's content (z 4): first-time cards and Feat toasts, one at a time. */
  readonly toastEl: HTMLElement;

  /** The layers that live outside .dd-hud (sheets, toasts, guide, ceremony) for the UI to mount in z order. */
  get layers(): { sheets: HTMLElement; toasts: HTMLElement; guide: HTMLElement; ceremony: HTMLElement } {
    return { sheets: this.sheets.el, toasts: this.toastEl, guide: this.guide.el, ceremony: this.ceremonyEl };
  }

  /** Mount an overlay in the ceremony layer (the game's widgets and ceremonies). */
  mountCeremony(el: HTMLElement): void {
    this.ceremonyEl.appendChild(el);
  }

  /** Mount a toast in the toast layer (Feat toasts). */
  mountToast(el: HTMLElement): void {
    this.toastEl.appendChild(el);
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
    set('--goldr-x', l.goldR.x);
    set('--goldr-w', l.goldR.w);
    set('--rank-x', l.rank.x);
    set('--rank-w', l.rank.w);
    set('--xp-x', l.xp.x);
    set('--xp-y', l.xp.y);
    set('--xp-w', l.xp.w);
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
    for (const layer of [this.sheets.el, this.toastEl, this.ceremonyEl]) {
      for (const k of ['--col-x', '--col-w', '--sheet-top', '--sheet-bottom', '--toast-x', '--toast-y', '--toast-w', '--vh', '--region-top', '--region-bottom', '--goal-x', '--goal-y', '--goal-w', '--goal-h', '--skill-y', '--quick-y', '--gold-x', '--gold-y']) layer.style.setProperty(k, st.getPropertyValue(k));
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
      case 'crewTab':
      case 'boardTab':
      case 'featsTab':
      case 'codexTab':
      case 'lanternTab': {
        const tab = TABS.find((x) => x.reveal === id);
        const b = tab ? this.tabBtns.get(tab.id) : undefined;
        if (!b) break;
        this.tabs.classList.remove('hide');
        b.classList.remove('hide');
        this.tabs.dataset.count = String([...this.tabBtns.values()].filter((x) => !x.classList.contains('hide')).length);
        if (!instant) {
          spring(b, 'snap', 0, 1, (v) => `translateY(${(1 - v) * 20}px)`);
          b.querySelector('.dd-tab-dot')?.classList.remove('hide');
        }
        break;
      }
      case 'guide':
        this.skill.revealGuide(instant);
        break;
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

  /** Show a first-time card (and light the Guide chip, where it can be read again: CRITIQUE MUST 7). */
  firstTime(title: string, body: string): void {
    this.first.show(title, body);
    this.reveal('guide');
    this.skill.guideDot(true);
  }

  private fadeV = 1;
  /** Fade the HUD (T4/T5 ceremonies: 0.35) except one element ('pick' keeps the Pick card); 1 restores. */
  fade(v: number, keep = ''): void {
    if (v === this.fadeV && !keep) return;
    this.fadeV = v;
    this.el.classList.toggle('dd-fading', v < 1);
    const op = v < 1 ? String(v) : '';
    for (const child of [this.top.goldEl, this.top.depthEl, this.top.gemsEl, this.top.rankEl, this.top.xpEl, this.goal.el, this.ruler.el, this.skill.el, this.tabs]) child.style.opacity = op;
    this.quick.el.style.opacity = keep === 'pick' ? '' : op;
    if (keep === 'pick') for (let i = 0; i < 3; i++) this.quick.slotEl(i).style.opacity = this.quick.slotOf('pick') === i || v >= 1 ? '' : op;
    else for (let i = 0; i < 3; i++) this.quick.slotEl(i).style.opacity = '';
  }

  /** The goal bar pointed at a quick-buy card: it pings (snap 1 → 1.06 → 1 and a rim flash). */
  pingCard(id: string): void {
    const slot = this.quick.slotOf(id);
    if (slot < 0) return;
    const el = this.quick.slotEl(slot);
    spring(el, 'snap', 1.08, 1, (v) => `scale(${v})`);
    tween(el, [{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], 420, 'outCubic');
  }

  private readonly pingEl: HTMLElement;
  private pingAnim: Animation | null = null;

  /**
   * The goal bar's tap-to-go for a thing on screen (a cell, a crystal, a chest, the seal, a skill button): a ring
   * pulses twice on it (pointer-events none, so the next tap still digs). @returns false when it is not on screen.
   */
  ping(id: string): boolean {
    const t = this.guideTarget(id);
    if (!t) return false;
    const d = Math.round(Math.max(56, Math.min(120, Math.max(t.w, t.h) + 20)));
    const el = this.pingEl;
    el.style.width = el.style.height = `${d}px`;
    el.style.transform = `translate(${Math.round(t.x - d / 2)}px, ${Math.round(t.y - d / 2)}px)`;
    el.classList.remove('hide');
    this.pingAnim?.cancel();
    this.pingAnim = tween(el.firstElementChild as HTMLElement, [{ transform: 'scale(0.55)', opacity: 1 }, { transform: 'scale(1.15)', opacity: 0 }], 520, 'outCubic', { iterations: 2 });
    if (this.pingAnim) this.pingAnim.onfinish = () => el.classList.add('hide');
    else el.classList.add('hide');
    return true;
  }

  /** Keep the current stamp up a little longer (a ceremony holding its frame: the capture hook). */
  holdStamp(): void {
    if (this.stampUntil) this.stampUntil = Math.max(this.stampUntil, performance.now() + 150);
  }

  /** Pulse a HUD element the goal bar points at ('ruler' with its seal mark, 'surge' the combo ring). */
  pulse(which: 'ruler' | 'surge'): void {
    const el = which === 'ruler' ? this.ruler.el : this.skill.comboEl;
    tween(el, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], 700, 'standard');
  }

  /** The row a tab opens on (the Feat family just toasted, CRITIQUE MUST 7: the toast itself never takes a touch). */
  tabFocus: ((id: SheetId) => string) | null = null;

  /** A tab tap: toggle its sheet (at the row the game names), and clear its "new" dot. */
  private tabTap(id: SheetId): void {
    this.tabBtns.get(id)?.querySelector('.dd-tab-dot')?.classList.add('hide');
    if (this.sheets.open === id) this.sheets.close();
    else this.sheets.show(id, this.tabFocus?.(id) ?? '');
  }

  /** A "new" dot on a tab (gear arrived, a Feat to claim). */
  tabDot(id: SheetId, on: boolean): void {
    const d = this.tabBtns.get(id)?.querySelector('.dd-tab-dot');
    if (d) d.classList.toggle('hide', !on);
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
    // The seal fight: the Warden plate, HP and the timer under the goal bar; the weak point's reticle on the floor.
    this.sealHud.update(m.seal(), m.weakPoint(), (pct) => t('ui.seal.holds', { pct }));
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
