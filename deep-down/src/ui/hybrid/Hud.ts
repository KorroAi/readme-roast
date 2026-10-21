// The calm first-person HUD (SPEC §8.9 "Lamplight on the Lintel" in first person; BUILD §3.4 MUST 5): opaque octagon
// plates (the depth, gold and ≡), the objective line (always shown, L5) with the seal's ring in its icon, the two cards
// (Pick and BEST, prices shown), one sheet (Dig, Crew, Settings), the first-time card, the return plate, the focus
// panel (a note's text, a chest's roll-up) and the ride's Skip plate. Plates cover ≤ 17 % of the screen; ≤ 5 numbers.
// The HUD animates only on a state change (enter: an 8 px rise and a fade over 200 ms; exit: a 140 ms fade; a counter
// pops 160 ms when its tokens land); it never shakes, flashes or moves with the camera. It reads a `HudFrame` each frame
// and writes the DOM only where something changed.

import { t } from '../../i18n';
import { h } from '../dom';
import { hybridLayout, plateArea, type HybridLayout, type Rect } from './layout';
import './hybrid.css';

export interface HudCard {
  slot: 'pick' | 'best';
  id: string;
  title: string;
  /** The effect or level line ("+12 % → 1.42K / strike", "Lv 9 → 10"). */
  sub: string;
  price: string;
  /** Affordable now (by the shown gold). */
  ready: boolean;
  /** 0..1: the shown gold over the price (the card is its own progress bar). */
  progress: number;
  /** The lowest payback (the BEST eyebrow). */
  best: boolean;
}

export interface HudGoal {
  id: string;
  text: string;
  /** 0..1. */
  fill: number;
  /** 'tap' | 'light' | 'chest' | 'go' | 'seal' | 'buy' | 'crew' | 'hold' | 'lamp' | 'relic' | 'walk' | 'deeper' … */
  icon: string;
  /** The reward chip ('' none). */
  reward: string;
  /** The seal fight's ring in the icon: HP left 0..1 and seconds left. */
  ring: null | { left: number; time: number };
}

export interface HudFrame {
  depth: string;
  biome: string;
  gold: string;
  /** The transient rate line under gold ('' none). */
  rate: string;
  goal: HudGoal;
  cards: [HudCard | null, HudCard | null];
  /** A badge on ≡ (new gear). */
  badge: boolean;
  /** The ride's Skip plate. */
  skip: boolean;
  /** The world is in a ceremony that owns the screen: the cards stand aside. */
  ceremony: boolean;
}

export interface SheetRow {
  id: string;
  title: string;
  sub: string;
  level: string;
  price: string;
  ready: boolean;
  locked: boolean;
  best: boolean;
}

export type SheetTab = 'dig' | 'crew' | 'settings';

export interface SettingsRow {
  id: string;
  label: string;
  /** Options for a segmented row, or a slider 0..1 when `range`. */
  options?: Array<{ value: string; label: string }>;
  range?: boolean;
  value: string | number;
}

export interface HudHooks {
  /** A card or sheet row buy (repeat = held). @returns whether it bought. */
  buy(id: string, repeat: boolean): boolean;
  /** The objective line was tapped: go where the goal is done. */
  goal(): void;
  /** The sheet opened (tab) or closed (null). */
  sheet(tab: SheetTab | null): void;
  /** The ride's Skip plate. */
  skip(): void;
  /** The sheet's rows. */
  rows(tab: 'dig' | 'crew'): SheetRow[];
  settings(): SettingsRow[];
  setSetting(id: string, value: string | number): void;
  /** The return plate's Collect. */
  collect(): void;
  /** Back to the camp (the ≡ sheet's footer). */
  toCamp(): void;
}

const ICON: Record<string, string> = {
  tap: '◆',
  light: '✦',
  chest: '▣',
  go: '▼',
  deeper: '▼',
  seal: '⬢',
  buy: '⬆',
  crew: '⚒',
  hold: '◉',
  lamp: '☼',
  relic: '◈',
  walk: '➜',
  note: '✎',
  gem: '◇',
  star: '★',
  dynamite: '✸',
};

const set = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};
/** Diff-writes (F10: a steady frame writes nothing to the DOM, not even an equal attribute or style). */
const attr = (el: Element, k: string, v: string) => {
  if (el.getAttribute(k) !== v) el.setAttribute(k, v);
};
const css = (el: HTMLElement | SVGElement, k: 'transform' | 'strokeDasharray', v: string) => {
  if (el.style[k] !== v) el.style[k] = v;
};
const cls = (el: Element, c: string, on: boolean) => {
  if (el.classList.contains(c) !== on) el.classList.toggle(c, on);
};
const place = (el: HTMLElement, r: Rect) => {
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.w}px`;
  el.style.height = `${r.h}px`;
};

/** Hold-to-buy: a press buys; held 380 ms it repeats at 8/s, 16/s after 1.5 s (SPEC §2.2). */
function holdToBuy(el: HTMLElement, fire: (repeat: boolean) => boolean): void {
  let timer = 0;
  let t0 = 0;
  let id = -1;
  const stop = () => {
    window.clearTimeout(timer);
    timer = 0;
    id = -1;
    el.classList.remove('hy-pressed');
  };
  const tick = () => {
    const held = performance.now() - t0;
    if (!fire(true)) {
      stop();
      return;
    }
    timer = window.setTimeout(tick, held > 1880 ? 62 : 125);
  };
  el.addEventListener('pointerdown', (e) => {
    if (id !== -1) return;
    id = e.pointerId;
    e.preventDefault();
    el.classList.add('hy-pressed');
    t0 = performance.now();
    fire(false);
    timer = window.setTimeout(tick, 380);
  });
  for (const k of ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'] as const) el.addEventListener(k, (e) => {
    if ((e as PointerEvent).pointerId === id) stop();
  });
}

export class Hud {
  readonly el: HTMLElement;
  layout: HybridLayout = hybridLayout(390, 844);
  private readonly depthEl: HTMLElement;
  private readonly depthNum: HTMLElement;
  private readonly depthUnit: HTMLElement;
  private readonly depthBiome: HTMLElement;
  private readonly goldEl: HTMLElement;
  private readonly goldNum: HTMLElement;
  private readonly rateEl: HTMLElement;
  private readonly menuEl: HTMLButtonElement;
  private readonly menuPlate: HTMLElement;
  private readonly goalEl: HTMLButtonElement;
  private readonly goalIcon: HTMLElement;
  private readonly goalRing: SVGCircleElement;
  private readonly goalText: HTMLElement;
  private readonly goalReward: HTMLElement;
  private readonly goalFill: HTMLElement;
  private readonly cardEls: HTMLButtonElement[] = [];
  private readonly skipEl: HTMLButtonElement;
  private readonly noteEl: HTMLElement;
  private readonly focusEl: HTMLElement;
  private readonly sheetEl: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly tabEls: Record<SheetTab, HTMLButtonElement>;
  private readonly returnEl: HTMLElement;
  private tab: SheetTab | null = null;
  private lastGoalId = '';
  private noteUntil = 0;
  private readonly noteQueue: Array<{ title: string; body: string; ms: number; tone: string }> = [];
  private readonly cardState: Array<{ id: string; visible: boolean }> = [
    { id: '', visible: false },
    { id: '', visible: false },
  ];
  private sheetRefreshAt = 0;
  private lastFrame: HudFrame | null = null;
  /** The focus panel's text ('' when closed). */
  focusText = '';
  returnPhase: '' | 'shown' | 'collected' = '';

  constructor(root: HTMLElement, private readonly hooks: HudHooks) {
    this.el = h('div', { class: 'hy-hud', 'data-hud': 'root' });
    // Row A.
    this.depthNum = h('span', { class: 'hy-depth-num' });
    this.depthUnit = h('span', { class: 'hy-depth-unit' });
    this.depthBiome = h('span', { class: 'hy-depth-biome' });
    this.depthEl = h('div', { class: 'hy-plate hy-depth', 'data-hud': 'depth', role: 'status' }, h('span', { class: 'hy-depth-line' }, this.depthNum, this.depthUnit), this.depthBiome);
    this.goldNum = h('span', { class: 'hy-gold-num' });
    this.rateEl = h('span', { class: 'hy-gold-rate' });
    this.goldEl = h('div', { class: 'hy-plate hy-gold', 'data-hud': 'gold', role: 'status', 'aria-label': t('ui.hud.gold') }, h('span', { class: 'hy-coin', 'aria-hidden': 'true' }), this.goldNum, this.rateEl);
    // ≡: a 38–44 px plate inside a ≥ 48 px touch target (the transparent button around it takes the slop).
    this.menuPlate = h('span', { class: 'hy-plate hy-menu', 'aria-hidden': 'true' }, h('span', { class: 'hy-menu-bars' }));
    this.menuEl = h('button', { class: 'hy-menu-hit', type: 'button', 'data-hud': 'menu', 'aria-label': t('ui.hud.menu') }, this.menuPlate);
    this.menuEl.addEventListener('click', () => this.toggleSheet(this.tab ? null : 'dig'));
    // Row B: the objective line.
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'hy-goal-ringsvg');
    this.goalRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.goalRing.setAttribute('cx', '12');
    this.goalRing.setAttribute('cy', '12');
    this.goalRing.setAttribute('r', '10');
    this.goalRing.setAttribute('class', 'hy-goal-ring');
    svg.appendChild(this.goalRing);
    this.goalIcon = h('span', { class: 'hy-goal-icon', 'aria-hidden': 'true' });
    this.goalText = h('span', { class: 'hy-goal-text' });
    this.goalReward = h('span', { class: 'hy-goal-reward' });
    this.goalFill = h('span', { class: 'hy-goal-fill', 'aria-hidden': 'true' });
    this.goalEl = h('button', { class: 'hy-plate hy-goal', type: 'button', 'data-hud': 'goal' }, h('span', { class: 'hy-goal-iconwrap' }, svg, this.goalIcon), this.goalText, this.goalReward, h('span', { class: 'hy-goal-track', 'aria-hidden': 'true' }, this.goalFill));
    this.goalEl.addEventListener('click', () => this.hooks.goal());
    // The two cards.
    for (let i = 0; i < 2; i++) {
      const c = h(
        'button',
        { class: 'hy-plate hy-card hy-hidden', type: 'button', 'data-hud': i === 0 ? 'card-pick' : 'card-best' },
        h('span', { class: 'hy-card-fill', 'aria-hidden': 'true' }),
        h('span', { class: 'hy-card-eyebrow' }),
        h('span', { class: 'hy-card-title' }),
        h('span', { class: 'hy-card-sub' }),
        h('span', { class: 'hy-card-price' }),
      );
      holdToBuy(c, (repeat) => {
        const id = this.cardState[i].id;
        return !!id && this.hooks.buy(id, repeat);
      });
      this.cardEls.push(c);
    }
    this.skipEl = h('button', { class: 'hy-plate hy-skip hy-hidden', type: 'button', 'data-hud': 'skip', text: t('hy.ride.skip') });
    this.skipEl.addEventListener('click', () => this.hooks.skip());
    this.noteEl = h('div', { class: 'hy-plate hy-note hy-hidden', 'data-hud': 'note', role: 'status', 'aria-live': 'polite' });
    this.focusEl = h('div', { class: 'hy-plate hy-focus hy-hidden', 'data-hud': 'focus', role: 'status', 'aria-live': 'polite' });
    // The sheet.
    this.tabEls = {
      dig: h('button', { class: 'hy-tab', type: 'button', text: t('hy.tab.dig') }),
      crew: h('button', { class: 'hy-tab', type: 'button', text: t('hy.tab.crew') }),
      settings: h('button', { class: 'hy-tab', type: 'button', text: t('hy.tab.settings') }),
    };
    for (const k of Object.keys(this.tabEls) as SheetTab[]) this.tabEls[k].addEventListener('click', () => this.toggleSheet(k));
    this.sheetBody = h('div', { class: 'hy-sheet-body' });
    const close = h('button', { class: 'hy-sheet-close', type: 'button', 'aria-label': t('hy.sheet.close'), text: '×' });
    close.addEventListener('click', () => this.toggleSheet(null));
    this.sheetEl = h('div', { class: 'hy-sheet hy-hidden', 'data-hud': 'sheet', role: 'dialog', 'aria-modal': 'false' }, h('div', { class: 'hy-tabs' }, this.tabEls.dig, this.tabEls.crew, this.tabEls.settings, close), this.sheetBody);
    this.returnEl = h('div', { class: 'hy-plate hy-return hy-hidden', 'data-hud': 'return', role: 'dialog' });
    this.el.append(this.depthEl, this.goldEl, this.menuEl, this.goalEl, ...this.cardEls, this.skipEl, this.noteEl, this.focusEl, this.sheetEl, this.returnEl);
    root.appendChild(this.el);
  }

  /** Lay out for a viewport (CSS px) and its safe insets. */
  setLayout(width: number, height: number, safeTop: number, safeBottom: number, large: boolean): void {
    const l = hybridLayout(width, height, safeTop, safeBottom, large);
    this.layout = l;
    place(this.depthEl, l.depth);
    place(this.goldEl, l.gold);
    const slop = Math.max(4, Math.ceil((48 - Math.min(l.menu.w, l.menu.h)) / 2));
    place(this.menuEl, { x: l.menu.x - slop, y: l.menu.y - slop, w: l.menu.w + 2 * slop, h: l.menu.h + 2 * slop });
    this.menuEl.style.setProperty('--slop', `${slop}px`);
    place(this.goalEl, l.goal);
    place(this.cardEls[0], l.cards[0]);
    place(this.cardEls[1], l.cards[1]);
    place(this.skipEl, l.skip);
    place(this.noteEl, l.note);
    place(this.focusEl, l.focus);
    this.sheetEl.style.top = `${l.sheetTop}px`;
    this.sheetEl.style.bottom = `${height - l.sheetBottom}px`;
    this.returnEl.style.top = `${Math.round(l.region.top + (l.region.bottom - l.region.top) * 0.22)}px`;
  }

  /** The sheet is open (taps on the world above it still act; the world dims 30 %). */
  get sheetOpen(): boolean {
    return this.tab !== null;
  }

  get sheetTab(): SheetTab | null {
    return this.tab;
  }

  toggleSheet(tab: SheetTab | null): void {
    if (tab === this.tab) tab = null;
    this.tab = tab;
    for (const k of Object.keys(this.tabEls) as SheetTab[]) this.tabEls[k].classList.toggle('hy-on', k === tab);
    this.sheetEl.classList.toggle('hy-hidden', tab === null);
    if (tab) this.renderSheet();
    this.hooks.sheet(tab);
  }

  /** Update from the frame's view (cheap: text and classes only where they changed). */
  update(f: HudFrame, now: number): void {
    this.lastFrame = f;
    // The number in Lintel numerals, the unit in the body face (the Lintel face has capitals only).
    const sp = f.depth.lastIndexOf(' ');
    set(this.depthNum, sp > 0 ? f.depth.slice(0, sp) : f.depth);
    set(this.depthUnit, sp > 0 ? f.depth.slice(sp) : '');
    set(this.depthBiome, f.biome);
    set(this.goldNum, f.gold);
    set(this.rateEl, f.rate);
    cls(this.goldEl, 'hy-with-rate', !!f.rate);
    cls(this.menuPlate, 'hy-badge', f.badge);
    // The objective line (L5: always shown).
    const g = f.goal;
    if (g.id !== this.lastGoalId) {
      this.lastGoalId = g.id;
      this.goalEl.dataset.goal = g.id;
      this.goalText.classList.remove('hy-enter');
      void this.goalText.offsetWidth;
      this.goalText.classList.add('hy-enter');
    }
    set(this.goalText, g.text);
    set(this.goalIcon, ICON[g.icon] ?? ICON.tap);
    set(this.goalReward, g.reward);
    cls(this.goalReward, 'hy-hidden', !g.reward);
    css(this.goalFill, 'transform', `scaleX(${Math.max(0, Math.min(1, g.fill)).toFixed(3)})`);
    const C = 2 * Math.PI * 10;
    if (g.ring) {
      css(this.goalRing, 'strokeDasharray', `${(C * Math.max(0, Math.min(1, g.ring.left))).toFixed(2)} ${C.toFixed(2)}`);
      cls(this.goalEl, 'hy-ringed', true);
    } else cls(this.goalEl, 'hy-ringed', false);
    attr(this.goalEl, 'aria-label', t('ui.hud.goal', { text: g.text }));
    // The cards.
    for (let i = 0; i < 2; i++) {
      // The cards stand aside for a ceremony and while the sheet (the full list they summarise) is open.
      const c = f.ceremony || this.tab ? null : f.cards[i];
      const el = this.cardEls[i];
      const st = this.cardState[i];
      const vis = !!c;
      if (vis !== st.visible) {
        st.visible = vis;
        el.classList.toggle('hy-hidden', !vis);
        if (vis) {
          el.classList.remove('hy-enter');
          void el.offsetWidth;
          el.classList.add('hy-enter');
        }
      }
      if (!c) {
        st.id = '';
        continue;
      }
      st.id = c.id;
      attr(el, 'data-id', c.id);
      const [fill, eyebrow, title, sub, price] = Array.from(el.children) as HTMLElement[];
      set(eyebrow, c.best ? t('ui.card.best') : '');
      set(title, c.title);
      set(sub, c.sub);
      set(price, c.price);
      cls(el, 'hy-ready', c.ready);
      css(fill, 'transform', `scaleX(${Math.max(0, Math.min(1, c.progress)).toFixed(3)})`);
      attr(el, 'aria-label', `${c.title}. ${c.sub}. ${c.price}`);
    }
    cls(this.skipEl, 'hy-hidden', !f.skip);
    // The first-time card and toasts (one at a time).
    if (this.noteUntil && now >= this.noteUntil) {
      this.noteUntil = 0;
      this.noteEl.classList.add('hy-hidden');
    }
    if (!this.noteUntil && this.noteQueue.length) {
      const n = this.noteQueue.shift()!;
      this.noteEl.replaceChildren(...[h('span', { class: 'hy-note-title', text: n.title }), n.body ? h('span', { class: 'hy-note-body', text: n.body }) : null].filter((x): x is HTMLSpanElement => !!x));
      this.noteEl.dataset.tone = n.tone;
      this.noteEl.classList.remove('hy-hidden', 'hy-enter');
      void this.noteEl.offsetWidth;
      this.noteEl.classList.add('hy-enter');
      this.noteUntil = now + n.ms;
    }
    if (this.tab && this.tab !== 'settings' && now >= this.sheetRefreshAt) {
      this.sheetRefreshAt = now + 250;
      this.renderSheet();
    }
  }

  /** One opaque plate under the objective line for 2.5 s, no button (SPEC §6.5). Queued behind the one showing. */
  firstTime(title: string, body = '', ms = 2500, tone = 'first'): void {
    if (this.noteQueue.length >= 3) this.noteQueue.shift();
    this.noteQueue.push({ title, body, ms, tone });
  }

  /** The text of the first-time card on screen ('' none). */
  get noteText(): string {
    return this.noteUntil ? this.noteEl.textContent ?? '' : '';
  }

  /** The focus pop's panel: a note's words (builders' script), a chest's roll-up line, a relic's grade. */
  focus(title: string, body: string, tone: 'note' | 'chest' | 'relic' | ''): void {
    if (!tone) {
      this.focusText = '';
      this.focusEl.classList.add('hy-hidden');
      return;
    }
    this.focusText = `${title} ${body}`.trim();
    this.focusEl.dataset.tone = tone;
    this.focusEl.replaceChildren(...[h('span', { class: 'hy-focus-title', text: title }), body ? h('span', { class: 'hy-focus-body', text: body }) : null].filter((x): x is HTMLSpanElement => !!x));
    this.focusEl.classList.remove('hy-hidden', 'hy-enter');
    void this.focusEl.offsetWidth;
    this.focusEl.classList.add('hy-enter');
  }

  /** The return plate (SPEC §5.3): "While you were away" lines and Collect. */
  showReturn(lines: string[]): void {
    const btn = h('button', { class: 'hy-btn hy-primary', type: 'button', 'data-hud': 'collect', text: t('hy.return.collect') });
    btn.addEventListener('click', () => {
      this.returnPhase = 'collected';
      this.returnEl.classList.add('hy-hidden');
      this.hooks.collect();
    });
    this.returnEl.replaceChildren(h('span', { class: 'hy-return-title', text: t('hy.return.title') }), ...lines.map((l) => h('span', { class: 'hy-return-line', text: l })), btn);
    this.returnEl.classList.remove('hy-hidden', 'hy-enter');
    void this.returnEl.offsetWidth;
    this.returnEl.classList.add('hy-enter');
    this.returnPhase = 'shown';
  }

  get returnShown(): boolean {
    return this.returnPhase === 'shown';
  }

  /** A counter pop (160 ms) when tokens land on the gold plate. */
  popGold(): void {
    this.goldNum.classList.remove('hy-pop');
    void this.goldNum.offsetWidth;
    this.goldNum.classList.add('hy-pop');
  }

  /** The objective line points at a card: brighten its rim for 0.6 s. @returns false when it is not on screen. */
  flashCard(id: string): boolean {
    const i = this.cardState.findIndex((c) => c.visible && c.id === id);
    if (i < 0) return false;
    const el = this.cardEls[i];
    el.classList.remove('hy-flash');
    void el.offsetWidth;
    el.classList.add('hy-flash');
    window.setTimeout(() => el.classList.remove('hy-flash'), 600);
    return true;
  }

  /** The gold plate's centre (tokens fly there). */
  goldPoint(): { x: number; y: number } {
    const r = this.layout.gold;
    return { x: r.x + r.w * 0.35, y: r.y + r.h / 2 };
  }

  /** Visible plate rects (E21's audit, the tap region's exclusions, NodeController's step 1). */
  plates(): Array<{ id: string; rect: Rect; visible: boolean }> {
    const l = this.layout;
    const out: Array<{ id: string; rect: Rect; visible: boolean }> = [
      { id: 'depth', rect: l.depth, visible: true },
      { id: 'gold', rect: l.gold, visible: true },
      { id: 'menu', rect: l.menu, visible: true },
      { id: 'goal', rect: l.goal, visible: true },
      { id: 'card-pick', rect: l.cards[0], visible: this.cardState[0].visible },
      { id: 'card-best', rect: l.cards[1], visible: this.cardState[1].visible },
      { id: 'skip', rect: l.skip, visible: !this.skipEl.classList.contains('hy-hidden') },
      { id: 'note', rect: l.note, visible: !!this.noteUntil },
    ];
    if (this.tab) out.push({ id: 'sheet', rect: { x: 0, y: l.sheetTop, w: l.width, h: l.sheetBottom - l.sheetTop }, visible: true });
    if (this.returnShown) {
      const r = this.returnEl.getBoundingClientRect();
      out.push({ id: 'return', rect: { x: r.x, y: r.y, w: r.width, h: r.height }, visible: true });
    }
    return out;
  }

  /** The persistent plates' share of the screen (E21). */
  plateArea(): number {
    return plateArea(this.layout);
  }

  /** The numbers on screen now (E21: ≤ 5 persistent + 1 transient). */
  numbers(): { persistent: string[]; transient: string } {
    const f = this.lastFrame;
    if (!f) return { persistent: [], transient: '' };
    const p = [f.depth, f.gold];
    const num = /\d/.exec(f.goal.text) ? f.goal.text : '';
    if (num) p.push(num);
    for (const c of f.cards) if (c && !f.ceremony && !this.tab) p.push(c.price);
    return { persistent: p, transient: f.rate };
  }

  /** The card slots as shown (debug and e2e). */
  cardViews(): Array<{ slot: 'pick' | 'best'; id: string; price: string; ready: boolean; visible: boolean }> {
    const f = this.lastFrame;
    return [0, 1].map((i) => ({
      slot: i === 0 ? ('pick' as const) : ('best' as const),
      id: this.cardState[i].id,
      price: f?.cards[i]?.price ?? '',
      ready: !!f?.cards[i]?.ready,
      visible: this.cardState[i].visible,
    }));
  }

  private renderSheet(): void {
    const tab = this.tab;
    if (!tab) return;
    if (tab === 'settings') {
      this.renderSettings();
      return;
    }
    const rows = this.hooks.rows(tab);
    const keep = this.sheetBody.dataset.tab === tab && this.sheetBody.childElementCount === rows.length;
    if (!keep) {
      this.sheetBody.dataset.tab = tab;
      this.sheetBody.replaceChildren(
        ...rows.map((r) => {
          const b = h(
            'button',
            { class: 'hy-row', type: 'button', 'data-id': r.id },
            h('span', { class: 'hy-row-title' }),
            h('span', { class: 'hy-row-sub' }),
            h('span', { class: 'hy-row-level' }),
            h('span', { class: 'hy-row-price' }),
          );
          holdToBuy(b, (repeat) => this.hooks.buy(b.dataset.id ?? '', repeat));
          return b;
        }),
      );
    }
    rows.forEach((r, i) => {
      const b = this.sheetBody.children[i] as HTMLElement;
      attr(b, 'data-id', r.id);
      const [title, sub, level, price] = Array.from(b.children) as HTMLElement[];
      set(title, r.best ? `${r.title} · ${t('ui.card.best')}` : r.title);
      set(sub, r.sub);
      set(level, r.level);
      set(price, r.price);
      cls(b, 'hy-ready', r.ready);
      cls(b, 'hy-locked', r.locked);
    });
  }

  private renderSettings(): void {
    const rows = this.hooks.settings();
    this.sheetBody.dataset.tab = 'settings';
    const els = rows.map((r) => {
      const row = h('div', { class: 'hy-set', 'data-id': r.id }, h('span', { class: 'hy-set-label', text: r.label }));
      if (r.range) {
        const input = h('input', { class: 'hy-range', type: 'range', min: '0', max: '1', step: '0.05', value: String(r.value), 'aria-label': r.label });
        input.addEventListener('input', () => this.hooks.setSetting(r.id, Number(input.value)));
        row.append(input);
      } else if (r.options) {
        const seg = h('div', { class: 'hy-seg', role: 'radiogroup', 'aria-label': r.label });
        for (const o of r.options) {
          const b = h('button', { class: `hy-seg-opt${String(r.value) === o.value ? ' hy-on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(String(r.value) === o.value), text: o.label });
          b.addEventListener('click', () => {
            this.hooks.setSetting(r.id, o.value);
            this.renderSettings();
          });
          seg.append(b);
        }
        row.append(seg);
      }
      return row;
    });
    const camp = h('button', { class: 'hy-btn', type: 'button', 'data-hud': 'to-camp', text: t('hy.sheet.toCamp') });
    camp.addEventListener('click', () => {
      this.toggleSheet(null);
      this.hooks.toCamp();
    });
    this.sheetBody.replaceChildren(...els, camp);
  }

  dispose(): void {
    this.el.remove();
  }
}
