import './ui.css';
import './screens/compat.css';
import './idle/idle.css';
import { t } from '../i18n';
import type { Settings } from '../save/types';
import { focusables, h } from './dom';
import { installLintelFont } from './brand/lintelFont';
import { DURATION, playDuration } from './brand/motion';
import { FxCanvas } from './fx/FxCanvas';
import { Hud, type HudHooks, type HudModel } from './idle/Hud';
import { Toasts, type ToastTone } from './notices';
import { buildAbout } from './screens/about';
import type { ConfirmSpec, ScreenHost, ScreenState } from './screens/host';
import { buildMenu } from './screens/menu';
import { buildSettings } from './screens/settings';
import { btn } from './screens/widgets';
import type { ScreenId, UiActions } from './types';

type Builder = (host: ScreenHost) => HTMLElement;

const BUILDERS: Record<Exclude<ScreenId, 'none'>, Builder> = {
  menu: buildMenu,
  settings: buildSettings,
  about: buildAbout,
};

/**
 * The DOM over the world (SPEC §9.3), bottom to top: the HUD (z 1), sheets (z 2), the ceremony layer (z 3: the
 * return feast), toasts and first-time cards (z 4), the FX canvas (z 5), the tutorial guide (z 6), then the shell's
 * screens (the menu at the surface, settings, about) and confirms. It reads view models and requests UiActions.
 */
export class UI {
  readonly el: HTMLElement;
  readonly hud: Hud;
  readonly fx: FxCanvas;
  readonly toasts = new Toasts();
  private readonly screensEl: HTMLElement;
  private readonly modalEl: HTMLElement;
  private current: ScreenId = 'none';
  private screenEl: HTMLElement | null = null;
  private settingsReturn: ScreenId = 'menu';
  private opening = false;
  private pendingPatch: Partial<Settings> | null = null;
  private patchRaf = 0;
  private readonly host: ScreenHost;
  readonly state: ScreenState = { aboutTab: 'about' };
  private readonly fpsEl: HTMLElement;

  constructor(root: HTMLElement, private readonly actions: UiActions, model: HudModel, hooks: HudHooks) {
    installLintelFont();
    this.el = h('div', { class: 'dd-ui dd-idle' });
    // The layer is transparent to pointers (the world canvas below takes the taps); plates opt back in.
    this.el.style.pointerEvents = 'none';
    this.hud = new Hud(model, hooks);
    const layers = this.hud.layers;
    this.screensEl = h('div', { class: 'dd-screens' });
    this.modalEl = h('div', { class: 'dd-modal-layer' });
    this.fpsEl = h('div', { class: 'dd-fps hide', 'aria-hidden': 'true' });
    const ceremony = h('div', { class: 'dd-ceremony' }, layers.ceremony);
    const toasts = h('div', { class: 'dd-toast-layer' }, layers.toasts, this.toasts.el);
    this.el.append(this.hud.el, layers.sheets, ceremony, toasts);
    root.appendChild(this.el);
    this.fx = new FxCanvas(this.el);
    this.el.append(layers.guide, this.screensEl, this.modalEl, this.fpsEl);
    const ui = this;
    this.host = {
      actions,
      state: this.state,
      get opening() {
        return ui.opening;
      },
      show: (id) => this.showScreen(id),
      confirm: (c) => this.openConfirm(c),
      settingsBack: () => this.showScreen(this.settingsReturn),
      toast: (text, tone) => this.toast(text, tone),
      rerender: () => this.rerender(),
      patchSettings: (p, coalesce) => this.patchSettings(p, coalesce ?? false),
      aboutBack: () => this.showScreen(this.settingsReturn === 'none' ? 'none' : 'settings'),
    };
    // The Lintel face arrives after the first frame: rasterise the FX glyphs again then.
    void document.fonts?.ready.then(() => this.fx.fontLoaded());
  }

  get screen(): ScreenId {
    return this.current;
  }

  /** A shell screen is open over the world (play waits under it). */
  get blocking(): boolean {
    return this.current !== 'none' || this.modalEl.childElementCount > 0;
  }

  showScreen(id: ScreenId): void {
    if (id === 'settings' && this.current !== 'about') this.settingsReturn = this.current === 'settings' ? this.settingsReturn : this.current;
    if (id === 'about' && this.current === 'none') this.settingsReturn = 'none';
    const prev = this.screenEl;
    this.current = id;
    this.screenEl = null;
    if (prev) {
      prev.classList.add('leaving');
      prev.setAttribute('inert', '');
      window.setTimeout(() => prev.remove(), playDuration(DURATION.exit));
    }
    this.el.classList.toggle('dd-on-menu', id === 'menu');
    if (id === 'none') return;
    this.opening = true;
    const el = BUILDERS[id](this.host);
    this.opening = false;
    this.screenEl = el;
    this.screensEl.appendChild(el);
    const first = el.querySelector<HTMLElement>('[data-autofocus="true"]') ?? focusables(el)[0];
    first?.focus({ preventScroll: true });
  }

  private rerender(): void {
    if (this.current === 'none' || !this.screenEl) return;
    const scroll = this.screenEl.querySelector('.dd-scroll')?.scrollTop ?? 0;
    const key = (document.activeElement as HTMLElement | null)?.dataset?.key;
    const el = BUILDERS[this.current](this.host);
    this.screenEl.replaceWith(el);
    this.screenEl = el;
    const s = el.querySelector('.dd-scroll');
    if (s) s.scrollTop = scroll;
    if (key) el.querySelector<HTMLElement>(`[data-key="${key}"]`)?.focus({ preventScroll: true });
  }

  private openConfirm(c: ConfirmSpec): void {
    const close = () => {
      box.remove();
      this.screenEl?.classList.remove('dd-under-confirm');
    };
    const box = h(
      'div',
      { class: 'dd-modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': c.text },
      h(
        'div',
        { class: 'dd-panel dd-confirm' },
        h('p', { class: 'dd-confirm-text', text: c.text }),
        h(
          'div',
          { class: 'dd-confirm-actions' },
          btn(c.no, () => {
            close();
            c.onNo?.();
          }, { key: 'no', autofocus: true }),
          btn(c.yes, () => {
            close();
            c.onYes();
          }, { variant: c.danger ? 'danger' : 'primary', key: 'yes' }),
        ),
      ),
    );
    this.screenEl?.classList.add('dd-under-confirm');
    this.modalEl.appendChild(box);
    box.querySelector<HTMLElement>('[data-autofocus="true"]')?.focus();
  }

  /** Close the open confirm (Back). @returns true when one was open. */
  closeConfirm(): boolean {
    const box = this.modalEl.lastElementChild;
    if (!box) return false;
    box.remove();
    this.screenEl?.classList.remove('dd-under-confirm');
    return true;
  }

  private patchSettings(p: Partial<Settings>, coalesce: boolean): void {
    if (!coalesce) {
      this.actions.updateSettings(p);
      return;
    }
    this.pendingPatch = { ...(this.pendingPatch ?? {}), ...p };
    if (this.patchRaf) return;
    this.patchRaf = requestAnimationFrame(() => {
      this.patchRaf = 0;
      const patch = this.pendingPatch;
      this.pendingPatch = null;
      if (patch) this.actions.updateSettings(patch);
    });
  }

  toast(text: string, tone: ToastTone = 'info', ms?: number): HTMLElement {
    return this.toasts.show(text, tone, ms);
  }

  /** Large text, high contrast, left-handed (classes on the root). */
  applySettings(s: Settings): void {
    this.el.classList.toggle('dd-large', s.textSize === 'large');
    this.el.classList.toggle('dd-contrast', s.highContrast);
    this.el.classList.toggle('dd-lefty', s.leftHanded);
    this.el.classList.toggle('dd-motion-off', s.motion === 'off');
    this.el.classList.toggle('dd-motion-reduced', s.motion === 'reduced');
    this.fpsEl.classList.toggle('hide', !s.showFps);
  }

  setFps(text: string): void {
    if (this.fpsEl.classList.contains('hide')) return;
    if (this.fpsEl.textContent !== text) this.fpsEl.textContent = text;
  }

  dispose(): void {
    this.toasts.dispose();
    this.el.remove();
  }

  /** Accessible description of the world (the canvas). */
  static worldLabel(): string {
    return t('ui.a11y.world');
  }
}
