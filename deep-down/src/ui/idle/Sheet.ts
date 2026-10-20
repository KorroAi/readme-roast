// Bottom sheets (SPEC §9.4): a sheet rises to a top edge at 42 % of the screen on the soft spring (263 ms); rows
// stagger 24 ms with an 8 px rise; the world stays visible above it, the floor re-frames into that strip and taps
// there keep digging (F11). Tapping the open tab again, a swipe down (optional) or Back closes it (200 ms inCubic).
// The buy-mode control sits in the sheet's foot, under the thumb (U4).

import type { BuyMode } from '../../idle/bus';
import { t, type TextKey } from '../../i18n';
import { h } from '../dom';
import { closeBtn } from '../screens/widgets';
import { tween } from '../fx/waapi';
import { Spring, SPRINGS } from '../../core/spring';

export type SheetId = 'dig' | 'crew' | 'settings';

export interface SheetBody {
  readonly id: SheetId;
  readonly title: TextKey;
  /** The scrolling list's content (built once; `refresh` updates it in place). */
  readonly body: HTMLElement;
  /** The sheet uses the buy-mode control. */
  readonly modes: boolean;
  /** Called every frame while open (`now` ms). */
  refresh(now: number): void;
  /** Called when the sheet opens (rows may be rebuilt here). */
  opened(): void;
}

const MODES: Array<{ id: BuyMode; key: TextKey }> = [
  { id: 'x1', key: 'ui.mode.x1' },
  { id: 'x10', key: 'ui.mode.x10' },
  { id: 'star', key: 'ui.mode.star' },
  { id: 'max', key: 'ui.mode.max' },
];

export class Sheets {
  readonly el: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly title: HTMLElement;
  private readonly scroll: HTMLElement;
  private readonly foot: HTMLElement;
  private readonly seg: HTMLElement;
  private readonly modeBtns = new Map<BuyMode, HTMLButtonElement>();
  private readonly bodies = new Map<SheetId, SheetBody>();
  private current: SheetBody | null = null;
  private readonly spring = new Spring(SPRINGS.soft, 0);
  private closing = false;
  private dragY = -1;
  mode: BuyMode = 'x1';
  /** The buy modes are revealed (after the first ★). */
  modesShown = false;
  onMode: ((m: BuyMode) => void) | null = null;
  onChange: ((id: SheetId | null) => void) | null = null;
  reduced = false;

  constructor() {
    this.title = h('h2', { class: 'dd-sheet-title' });
    this.scroll = h('div', { class: 'dd-sheet-scroll' });
    const seg = h('div', { class: 'dd-modes', role: 'group', 'aria-label': t('ui.mode.label') });
    for (const m of MODES) {
      const b = h('button', { class: 'dd-mode', type: 'button', 'aria-pressed': String(m.id === this.mode), 'data-mode': m.id, text: t(m.key), onclick: () => this.setMode(m.id, true) });
      this.modeBtns.set(m.id, b);
      seg.appendChild(b);
    }
    this.seg = seg;
    seg.classList.add('hide');
    // The close button sits in the foot, under the thumb (U4); the head keeps the grip (a swipe down closes too).
    this.foot = h('div', { class: 'dd-sheet-foot' }, seg, closeBtn(t('ui.sheet.close'), () => this.close()));
    this.panel = h(
      'section',
      { class: 'dd-sheet', role: 'dialog', 'aria-modal': 'false' },
      h('header', { class: 'dd-sheet-head' }, h('span', { class: 'dd-sheet-grip', 'aria-hidden': 'true' }), this.title),
      this.scroll,
      this.foot,
    );
    this.el = h('div', { class: 'dd-sheets' }, this.panel);
    this.panel.style.display = 'none';
    // A swipe down on the head closes (optional, never required).
    const head = this.panel.querySelector('.dd-sheet-head') as HTMLElement;
    head.addEventListener('pointerdown', (e) => {
      this.dragY = e.clientY;
    });
    head.addEventListener('pointerup', (e) => {
      if (this.dragY >= 0 && e.clientY - this.dragY > 40) this.close();
      this.dragY = -1;
    });
  }

  register(b: SheetBody): void {
    this.bodies.set(b.id, b);
  }

  get open(): SheetId | null {
    return this.closing ? null : (this.current?.id ?? null);
  }

  /** How far the sheet is open (0..1), for the camera re-frame. */
  get fraction(): number {
    return Math.max(0, Math.min(1, this.spring.value));
  }

  toggle(id: SheetId): void {
    if (this.open === id) this.close();
    else this.show(id);
  }

  show(id: SheetId): void {
    const b = this.bodies.get(id);
    if (!b) return;
    const wasOpen = this.current && !this.closing;
    this.closing = false;
    this.current = b;
    this.title.textContent = t(b.title);
    this.scroll.replaceChildren(b.body);
    this.seg.classList.toggle('hide', !(b.modes && this.modesShown));
    this.panel.style.display = '';
    this.panel.dataset.sheet = id;
    b.opened();
    this.spring.target = 1;
    if (this.reduced) this.spring.set(1);
    if (!wasOpen) this.stagger();
    else tween(this.scroll, [{ transform: 'translateX(24px)', opacity: 0 }, { transform: 'translateX(0px)', opacity: 1 }], 180, 'outCubic');
    this.scroll.scrollTop = 0;
    this.onChange?.(id);
  }

  close(): void {
    if (!this.current || this.closing) return;
    this.closing = true;
    this.spring.target = 0;
    if (this.reduced) this.spring.set(0);
    this.onChange?.(null);
  }

  setMode(m: BuyMode, user = false): void {
    if (m === this.mode && !user) return;
    this.mode = m;
    for (const [id, b] of this.modeBtns) b.setAttribute('aria-pressed', String(id === m));
    if (user) this.onMode?.(m);
  }

  /** Show the buy-mode control (the first ★). */
  revealModes(): void {
    if (this.modesShown) return;
    this.modesShown = true;
    if (this.current?.modes) this.seg.classList.remove('hide');
  }

  private stagger(): void {
    const rows = this.current?.body.querySelectorAll<HTMLElement>('.dd-row-anim');
    if (!rows) return;
    let i = 0;
    for (const r of rows) {
      if (i > 12) break;
      tween(r, [{ transform: 'translateY(8px)', opacity: 0 }, { transform: 'translateY(0px)', opacity: 1 }], 240, 'outQuint', { delay: 24 * i, fill: 'backwards' });
      i++;
    }
  }

  /** Per frame: the spring, the open sheet's rows. `dt` seconds, `now` ms. */
  frame(dt: number, now: number): void {
    if (!this.current) return;
    const v = this.spring.step(dt);
    // Closing is quicker (an inCubic-ish fall): the spring runs at double speed on the way down.
    if (this.closing) this.spring.step(dt);
    const y = (1 - Math.max(0, Math.min(1, v))) * 100;
    const ty = `translateY(${y.toFixed(2)}%)`;
    if (this.panel.style.transform !== ty) this.panel.style.transform = ty;
    if (this.closing && this.spring.value <= 0.002) {
      this.closing = false;
      this.current = null;
      this.panel.style.display = 'none';
      this.spring.set(0);
      return;
    }
    this.current.refresh(now);
  }
}
