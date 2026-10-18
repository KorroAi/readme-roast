import './ui.css';
import type { EventBus, GameEvents } from '../core/events';
import type { GameUi } from '../game/GameUi';
import { t, type TextKey } from '../i18n';
import type { InputState } from '../input/types';
import type { ItemCounts, Settings } from '../save/types';
import { focusables, h } from './dom';
import { Hud } from './hud/Hud';
import { DiscoveryBanner, PickupFeed, Toasts, type ToastTone } from './notices';
import { renderPixelTitle } from './pixelFont';
import type { ConfirmSpec, ScreenHost, ScreenState } from './screens/host';
import { buildCrafting, buildInventory } from './screens/inventory';
import { buildDeath, buildLoading, buildMenu, buildPause, updateLoading } from './screens/menu';
import { buildSettings } from './screens/settings';
import { btn } from './screens/widgets';
import { TouchControls } from './TouchControls';
import type { DiscoveryNotice, HudState, PickupNotice, ScreenId, UiActions } from './types';

type Builder = (host: ScreenHost) => HTMLElement;

const BUILDERS: Partial<Record<ScreenId, Builder>> = {
  menu: buildMenu,
  loading: buildLoading,
  pause: buildPause,
  settings: buildSettings,
  inventory: buildInventory,
  crafting: buildCrafting,
  death: buildDeath,
};

const CRAFT_FAIL: Record<string, TextKey> = { owned: 'craft.owned', notAtCamp: 'craft.notAtCamp', missing: 'craft.missing' };

/**
 * The complete DOM user interface: screens, HUD, notifications and touch controls.
 * It reads snapshots and requests UiActions; it never touches game state directly.
 */
export class UI implements GameUi {
  readonly touch: TouchControls;
  private readonly el: HTMLElement;
  private readonly hud = new Hud();
  private readonly toasts = new Toasts();
  private readonly pickups = new PickupFeed();
  private readonly discovery = new DiscoveryBanner();
  private readonly screensEl: HTMLElement;
  private readonly modalEl: HTMLElement;
  private current: ScreenId = 'none';
  private screenEl: HTMLElement | null = null;
  private confirmSpec: ConfirmSpec | null = null;
  private underConfirm: ScreenId = 'none';
  private settingsReturn: ScreenId = 'menu';
  private gameplay = false;
  private showFps = false;
  private titleCanvas: HTMLCanvasElement | null = null;
  private titleScale = 1;
  private pendingPatch: Partial<Settings> | null = null;
  private patchRaf = 0;
  private resizeRaf = 0;
  private readonly host: ScreenHost;
  private readonly disposers: Array<() => void> = [];
  readonly state: ScreenState = { invTab: 'backpack', invSlot: 0, loadingProgress: 0, loadingLabel: '', deathLost: {} };

  constructor(root: HTMLElement, private readonly actions: UiActions, bus: EventBus<GameEvents>, private readonly input: InputState) {
    this.screensEl = h('div', { class: 'dd-screens' });
    this.modalEl = h('div', { class: 'dd-modal-layer' });
    this.el = h('div', { class: 'dd-ui' });
    // The host page may give its direct children pointer events; this layer must stay
    // transparent so the canvas below still receives mouse input. Inline beats any selector.
    this.el.style.pointerEvents = 'none';
    this.el.append(this.hud.el, h('div', { class: 'dd-notices' }, this.pickups.el, this.discovery.el));
    root.appendChild(this.el);
    this.touch = new TouchControls(this.el, input);
    this.el.append(this.screensEl, this.modalEl, this.toasts.el);

    this.host = {
      actions,
      state: this.state,
      show: (id) => this.showScreen(id),
      confirm: (c) => this.openConfirm(c),
      settingsBack: () => this.showScreen(this.settingsReturn === 'pause' || this.settingsReturn === 'menu' ? this.settingsReturn : 'none'),
      toast: (text, tone) => this.toast(text, tone),
      rerender: () => this.rerender(),
      patchSettings: (p, coalesce) => this.patchSettings(p, coalesce ?? false),
      setTitleCanvas: (c, scale) => {
        this.titleCanvas = c;
        this.titleScale = scale;
        this.drawTitle();
      },
    };

    this.disposers.push(
      bus.on('item:picked', (p) => {
        this.pickup(p);
        if (this.current === 'inventory') this.refresh();
      }),
      bus.on('toast', (p) => this.toast(p.text, p.tone)),
      bus.on('inventory:changed', () => {
        if (this.current === 'inventory' || this.current === 'crafting') this.refresh();
      }),
      bus.on('craft:failed', ({ reason }) => this.toast(t(CRAFT_FAIL[reason] ?? 'craft.missing'), 'warn')),
    );
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    const onResize = () => {
      cancelAnimationFrame(this.resizeRaf);
      this.resizeRaf = requestAnimationFrame(() => this.drawTitle());
    };
    // Capture phase on window runs before DesktopInput, so keys a screen consumes
    // (Escape to go back, arrows to move focus) never reach gameplay.
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onResize);
    this.disposers.push(
      () => window.removeEventListener('keydown', onKey, true),
      () => window.removeEventListener('resize', onResize),
    );
  }

  get screen(): ScreenId {
    return this.current;
  }

  showScreen(id: ScreenId, opts?: { confirm?: ConfirmSpec }): void {
    if (id === 'confirm') {
      if (opts?.confirm) this.openConfirm(opts.confirm);
      return;
    }
    if (this.confirmSpec) this.dismissConfirm();
    if (id === 'settings' && this.current !== 'settings') this.settingsReturn = this.current;
    this.current = id;
    this.render(false);
    this.updateTouch();
  }

  isBlockingInput(): boolean {
    return this.current !== 'none';
  }

  setGameplayActive(active: boolean): void {
    this.gameplay = active;
    this.updateTouch();
  }

  setHud(state: HudState): void {
    if (this.gameplay) this.hud.update(state, this.showFps, performance.now());
  }

  setLoading(progress01: number, label: string): void {
    this.state.loadingProgress = Math.max(0, Math.min(1, progress01));
    this.state.loadingLabel = label;
    if (this.current === 'loading' && this.screenEl) updateLoading(this.screenEl, this.state.loadingProgress, label);
  }

  showDiscovery(n: DiscoveryNotice): void {
    this.discovery.show(n);
  }

  toast(text: string, tone: ToastTone = 'info'): void {
    this.toasts.show(text, tone);
  }

  pickup(n: PickupNotice): void {
    this.pickups.show(n);
  }

  hint(text: string, ms = 3500): void {
    this.hud.hint(text, ms);
  }

  showDeath(lost: ItemCounts): void {
    this.state.deathLost = { ...lost };
    this.showScreen('death');
  }

  applySettings(s: Settings): void {
    this.showFps = s.showFps;
    this.el.classList.toggle('dd-large', s.textSize === 'large');
    this.el.classList.toggle('dd-contrast', s.highContrast);
    this.touch.setLeftHanded(s.leftHanded);
  }

  refresh(): void {
    if (this.current === 'none' || this.current === 'loading') return;
    this.rerender();
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    cancelAnimationFrame(this.patchRaf);
    cancelAnimationFrame(this.resizeRaf);
    this.touch.dispose();
    this.hud.dispose();
    this.toasts.dispose();
    this.pickups.dispose();
    this.discovery.dispose();
    this.el.remove();
  }

  // ------------------------------------------------------------------------------------
  // Screens

  /** Build the screen for `this.current` (or the one under an open confirm dialog). */
  private render(keepPlace: boolean): void {
    const id = this.confirmSpec ? this.underConfirm : this.current;
    const old = this.screenEl;
    const scroll = keepPlace ? old?.querySelector('.dd-scroll')?.scrollTop ?? 0 : 0;
    const focusKey = keepPlace ? (document.activeElement as HTMLElement | null)?.closest?.('[data-key]')?.getAttribute('data-key') : null;
    this.titleCanvas = null;
    const build = BUILDERS[id];
    const next = build ? build(this.host) : null;
    if (old) old.remove();
    this.screenEl = next;
    if (!next) {
      (document.activeElement as HTMLElement | null)?.blur?.();
      return;
    }
    // A rebuild of the open screen (tab switch, inventory change) must not replay its entrance.
    if (keepPlace) next.classList.add('dd-rebuilt');
    this.screensEl.appendChild(next);
    if (this.confirmSpec) next.inert = true;
    const scroller = next.querySelector('.dd-scroll');
    if (scroller && scroll) scroller.scrollTop = scroll;
    if (this.confirmSpec) return;
    const keep = focusKey ? next.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`) : null;
    if (keep && !(keep as HTMLButtonElement).disabled) keep.focus({ preventScroll: true });
    else if (this.keyboardUser()) this.autofocus(next);
  }

  private rerender(): void {
    this.render(true);
  }

  private openConfirm(spec: ConfirmSpec): void {
    if (!this.confirmSpec) this.underConfirm = this.current;
    else this.modalEl.replaceChildren();
    this.confirmSpec = spec;
    this.current = 'confirm';
    if (this.screenEl) this.screenEl.inert = true;
    const no = btn(spec.no, () => this.closeConfirm(false), { key: 'no', autofocus: true });
    const yes = btn(spec.yes, () => this.closeConfirm(true), { variant: spec.danger ? 'danger' : 'primary', key: 'yes' });
    const text = h('p', { class: 'dd-confirm-text', id: 'dd-confirm-text', text: spec.text });
    this.modalEl.appendChild(
      h(
        'div',
        { class: 'dd-modal' },
        h('div', { class: 'dd-panel dd-confirm', role: 'alertdialog', 'aria-modal': 'true', 'aria-describedby': 'dd-confirm-text' }, text, h('div', { class: 'dd-confirm-actions' }, no, yes)),
      ),
    );
    if (this.keyboardUser()) no.focus({ preventScroll: true });
    this.updateTouch();
  }

  /** Close the dialog and return to the screen under it, then run the chosen callback. */
  private closeConfirm(yes: boolean): void {
    const spec = this.confirmSpec;
    if (!spec) return;
    this.dismissConfirm();
    this.updateTouch();
    if (this.screenEl && this.keyboardUser()) this.autofocus(this.screenEl);
    if (yes) spec.onYes();
    else spec.onNo?.();
  }

  private dismissConfirm(): void {
    this.confirmSpec = null;
    this.modalEl.replaceChildren();
    this.current = this.underConfirm;
    if (this.screenEl) this.screenEl.inert = false;
  }

  /**
   * Move focus into a new screen only for keyboard users: on touch the focus ring would
   * just be noise (arrow keys and Tab still find the first control at any time).
   */
  private keyboardUser(): boolean {
    return this.input.lastDevice === 'keyboard';
  }

  private autofocus(scope: HTMLElement): void {
    (scope.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(scope)[0])?.focus({ preventScroll: true });
  }

  /** HUD and touch controls only while playing with no screen open (screens stay uncluttered). */
  private updateTouch(): void {
    const live = this.gameplay && this.current === 'none';
    this.touch.setEnabled(live);
    this.hud.setVisible(live);
  }

  private patchSettings(p: Partial<Settings>, coalesce: boolean): void {
    if (coalesce) {
      this.pendingPatch = { ...this.pendingPatch, ...p };
      if (!this.patchRaf) this.patchRaf = requestAnimationFrame(() => this.flushPatch());
      return;
    }
    this.flushPatch();
    this.actions.updateSettings(p);
  }

  private flushPatch(): void {
    cancelAnimationFrame(this.patchRaf);
    this.patchRaf = 0;
    const p = this.pendingPatch;
    this.pendingPatch = null;
    if (p) this.actions.updateSettings(p);
  }

  private drawTitle(): void {
    const c = this.titleCanvas;
    if (!c) return;
    const w = Math.min(window.innerWidth - 32, 640, window.innerHeight * 1.3) * this.titleScale;
    renderPixelTitle(c, t('game.title'), Math.max(120, w), Math.min(3, window.devicePixelRatio || 1), { crystalO: true });
  }

  private onKey(e: KeyboardEvent): void {
    if (this.current === 'none') return;
    // Keys the UI consumes never reach DesktopInput, so record the device here.
    this.input.lastDevice = 'keyboard';
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'Escape') {
      if (this.current === 'confirm') {
        stop();
        this.closeConfirm(false);
      } else if (this.current === 'settings') {
        stop();
        this.host.settingsBack();
      } else if (this.current === 'inventory' || this.current === 'crafting') {
        stop();
        this.actions.closeScreen();
      }
      return;
    }
    // The keys that open the bag (I, Tab) also close it.
    if ((e.code === 'KeyI' || e.code === 'Tab') && this.current === 'inventory' && !e.repeat) {
      stop();
      this.actions.closeScreen();
      return;
    }
    // Tab moves focus and Space presses the focused control. DesktopInput binds both (bag,
    // jump) and cancels their default action, so they must not reach it while a screen is open.
    if (e.code === 'Tab' || e.code === 'Space') {
      e.stopPropagation();
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'range') return;
      const scope = this.confirmSpec ? this.modalEl : this.screenEl;
      if (!scope) return;
      const list = focusables(scope);
      if (!list.length) return;
      stop();
      const i = list.indexOf(active as HTMLElement);
      const next = i < 0 ? 0 : (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next].focus();
    }
  }
}
