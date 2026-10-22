import './ui.css';
import './screens/compat.css';
import type { EventBus, GameEvents } from '../core/events';
import type { GameUi } from '../game/GameUi';
import { t, type TextKey } from '../i18n';
import type { InputState } from '../input/types';
import type { ItemCounts, Settings } from '../save/types';
import { focusables, h } from './dom';
import { Hud } from './hud/Hud';
import { DiscoveryBanner, PickupFeed, Toasts, type ToastTone } from './notices';
import { installLintelFont } from './brand/lintelFont';
import { DURATION, playDuration } from './brand/motion';
import { buildAbout } from './screens/about';
import { buildBoard } from './screens/board';
import { buildEnding } from './screens/ending';
import type { ConfirmSpec, ScreenHost, ScreenState } from './screens/host';
import { buildInventory } from './screens/inventory';
import { buildJournal } from './screens/journal';
import { buildSummary } from './screens/summary';
import { buildTree } from './screens/workbench';
import { buildDeath, buildLoading, buildMenu, buildPause, updateLoading } from './screens/menu';
import { buildSettings } from './screens/settings';
import { btn } from './screens/widgets';
import { TouchControls } from './TouchControls';
import type { ArrivalCard, DiscoveryNotice, HudState, MapSource, PickupNotice, ScreenId, UiActions } from './types';
import { createPlayerActions, type MenuScreen, type PlayerActions, type UiTargetId } from './hud/actions';
import { buildBag } from './screens/r3/bag';
import { buildCraft } from './screens/r3/craft';
import { buildMap } from './screens/r3/map';
import { buildQuests } from './screens/r3/quests';
import { buildBestiary } from './screens/r3/bestiary';

type Builder = (host: ScreenHost) => HTMLElement;

/** Round 3: the Bag and Craft menus read LOOP's views; before LOOP's Loop exists the first version's screens stand in. */
const bagOrOld: Builder = (host) => (host.actions.loop() ? buildBag(host) : buildInventory(host));
const craftOrOld: Builder = (host) => (host.actions.loop() ? buildCraft(host) : buildTree(host));

const BUILDERS: Partial<Record<ScreenId, Builder>> = {
  menu: buildMenu,
  loading: buildLoading,
  pause: buildPause,
  settings: buildSettings,
  inventory: bagOrOld,
  crafting: craftOrOld,
  map: buildMap,
  quests: buildQuests,
  bestiary: buildBestiary,
  death: buildDeath,
  summary: buildSummary,
  board: buildBoard,
  journal: buildJournal,
  ending: buildEnding,
  about: buildAbout,
};

/** Screens closed by Escape (and the system Back, through Game) straight back to play. */
const CLOSABLE: ReadonlySet<ScreenId> = new Set<ScreenId>(['inventory', 'crafting', 'board', 'journal', 'map', 'quests', 'bestiary']);

/** The menu keys (I/Tab, C, M, J, B): each opens its menu, and closes it when it is the one open. */
const MENU_KEYS: Record<string, MenuScreen> = { KeyI: 'inventory', Tab: 'inventory', KeyC: 'crafting', KeyM: 'map', KeyJ: 'quests', KeyB: 'bestiary' };

const CRAFT_FAIL: Record<string, TextKey> = { owned: 'craft.owned', notAtCamp: 'craft.notAtCamp', notHere: 'craft.notAtCamp', missing: 'craft.missing', locked: 'ui.tree.state.locked', carryToSite: 'ui.tree.state.carry' };

/**
 * The complete DOM user interface: screens, HUD, notifications and touch controls.
 * It reads snapshots and requests UiActions; it never touches game state directly.
 */
export class UI implements GameUi {
  readonly touch: TouchControls;
  /** Round 3: the one action API every button and key drives (ui/hud/actions). */
  readonly player: PlayerActions;
  private readonly el: HTMLElement;
  private readonly hud: Hud;
  private readonly toasts = new Toasts();
  private readonly pickups = new PickupFeed();
  private readonly discovery = new DiscoveryBanner();
  private readonly screensEl: HTMLElement;
  /** Screens on their way out: inert, aria-hidden, fading under the one entering. */
  private readonly exitEl: HTMLElement;
  private readonly exitTimers = new Set<number>();
  private veilEl: HTMLElement | null = null;
  private veilTimer = 0;
  private readonly modalEl: HTMLElement;
  private current: ScreenId = 'none';
  private screenEl: HTMLElement | null = null;
  private confirmSpec: ConfirmSpec | null = null;
  private underConfirm: ScreenId = 'none';
  private settingsReturn: ScreenId = 'menu';
  private gameplay = false;
  /** True while the open screen is being built because it was just opened (ScreenHost.opening). */
  private opening = false;
  /**
   * An Expedition Report waiting to open: 'free' opens as soon as play has no screen up;
   * 'respawn' (a black-out: the death screen is up) waits for 'player:respawned'.
   */
  private reportWaiting: 'free' | 'respawn' | null = null;
  /** The finale has been reached: the end card opens when play has no screen up. */
  private endingWaiting = false;
  /** The end card's fade to black is playing: play is held still under the veil. */
  private ceremony = false;
  private showFps = false;
  private pendingPatch: Partial<Settings> | null = null;
  private patchRaf = 0;
  private readonly host: ScreenHost;
  private readonly disposers: Array<() => void> = [];
  readonly state: ScreenState = {
    invTab: 'backpack',
    invSlot: 0,
    loadingProgress: 0,
    loadingLabel: '',
    deathLost: {},
    treeTab: 'workbench',
    treeSel: null,
    treeCrafted: null,
    journalTab: 'discoveries',
    aboutTab: 'about',
    reportAt: 0,
    bagTab: 'all',
    bagSel: null,
    assignSlot: -1,
    craftTab: null,
    craftFlash: null,
    questsTab: 'main',
    bestiaryBiome: null,
    help: null,
  };

  constructor(root: HTMLElement, private readonly actions: UiActions, bus: EventBus<GameEvents>, private readonly input: InputState) {
    this.screensEl = h('div', { class: 'dd-screens' });
    this.exitEl = h('div', { class: 'dd-screens-exit', 'aria-hidden': 'true', inert: true });
    this.modalEl = h('div', { class: 'dd-modal-layer' });
    this.el = h('div', { class: 'dd-ui' });
    // The host page may give its direct children pointer events; this layer must stay
    // transparent so the canvas below still receives mouse input. Inline beats any selector.
    this.el.style.pointerEvents = 'none';
    this.player = createPlayerActions(input);
    const player = this.player;
    this.hud = new Hud({
      bag: () => player.open('inventory'),
      menu: () => player.open('pause'),
      open: (screen) => player.open(screen),
      hotbar: (i) => player.hotbar(i),
      // A long-press on a slot: the Bag opens to fill it.
      assign: (i) => {
        this.state.assignSlot = i;
        this.state.bagTab = 'all';
        player.open('inventory');
      },
      skipTutorial: () => actions.skipTutorial(),
    });
    this.el.append(this.hud.el, h('div', { class: 'dd-notices' }, this.pickups.el, this.discovery.el));
    root.appendChild(this.el);
    this.touch = new TouchControls(this.el, input, player);
    // The exit layer comes after the live screens in the DOM (queries find the live screen
    // first) and sits under them (z-index), so the new screen fades in over the old one.
    this.el.append(this.screensEl, this.exitEl, this.modalEl, this.toasts.el, this.hud.tutorialEl);

    const ui = this;
    this.host = {
      actions,
      state: this.state,
      get opening() {
        return ui.opening;
      },
      show: (id) => this.showScreen(id),
      confirm: (c) => this.openConfirm(c),
      settingsBack: () => this.showScreen(this.settingsReturn === 'pause' || this.settingsReturn === 'menu' ? this.settingsReturn : 'none'),
      toast: (text, tone) => this.toast(text, tone),
      rerender: () => this.rerender(),
      patchSettings: (p, coalesce) => this.patchSettings(p, coalesce ?? false),
      closeReport: () => {
        actions.dismissReport();
        actions.closeScreen();
      },
      openFromReport: () => {
        actions.dismissReport();
        actions.openCrafting('workbench');
      },
      aboutBack: () => this.showScreen('settings'),
    };
    // The display face (titles, depth numerals) is built in code and registered here.
    void installLintelFont();

    this.disposers.push(
      bus.on('item:picked', (p) => {
        this.pickup(p);
        if (this.current === 'inventory') this.refresh();
      }),
      bus.on('toast', (p) => this.toast(p.text, p.tone)),
      bus.on('inventory:changed', () => {
        if (this.current === 'inventory' || this.current === 'crafting') this.refresh();
      }),
      // The Expedition Report: after the camp autosave (Game announces the trip after saving),
      // never over another open screen. A black-out ends the trip under the death screen: the
      // report waits for the respawn.
      bus.on('expedition:ended', ({ report }) => {
        if (!report.show) return;
        this.reportWaiting = report.outcome === 'blackout' ? 'respawn' : 'free';
        this.openWaiting();
      }),
      bus.on('player:respawned', () => {
        if (this.reportWaiting === 'respawn') this.reportWaiting = 'free';
        this.openWaiting();
      }),
      // The end card, once the black stone has answered (the game emits this after "The Answer"
      // has been read, with no screen up): the world fades to black and the card rises.
      bus.on('finale:reached', () => {
        this.endingWaiting = true;
        this.openWaiting();
      }),
      bus.on('craft:failed', ({ reason }) => this.toast(t(CRAFT_FAIL[reason] ?? 'craft.missing'), 'warn')),
      // Round 3: LOOP's guidance (arrival cards, hints with an optional control to point at),
      // the vein combo beside the reticle, a menu refreshed by what it shows changing.
      bus.on('guide:arrival', ({ card }) => this.arrival(card)),
      bus.on('guide:hint', ({ id, text, target }) => {
        this.hint(text, 4200);
        if (target) this.hud.tutorial.tip(`hint:${id}`, target, text);
      }),
      bus.on('mine:combo', ({ count }) => this.hud.combo(count)),
      bus.on('craft:made', () => {
        if (this.current === 'crafting' || this.current === 'inventory') this.refresh();
      }),
      bus.on('gear:equipped', () => {
        if (this.current === 'inventory') this.refresh();
      }),
    );
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    // Capture phase on window runs before DesktopInput, so keys a screen consumes
    // (Escape to go back, arrows to move focus) never reach gameplay.
    window.addEventListener('keydown', onKey, true);
    this.disposers.push(() => window.removeEventListener('keydown', onKey, true));
  }

  get screen(): ScreenId {
    return this.current;
  }

  showScreen(id: ScreenId, opts?: { confirm?: ConfirmSpec }): void {
    const first = this.retireBootMark();
    if (id === 'confirm') {
      if (opts?.confirm) this.openConfirm(opts.confirm);
      return;
    }
    if (this.confirmSpec) this.dismissConfirm();
    // About opens from Settings and returns to it: Settings keeps the screen it came from.
    if (id === 'settings' && this.current !== 'settings' && this.current !== 'about') this.settingsReturn = this.current;
    if (this.current === 'summary' && id !== 'summary') {
      // Backgrounding pauses over the report: it opens again on resume. Any other way out skips it.
      if (id === 'pause') this.reportWaiting = 'free';
      else this.actions.dismissReport();
    }
    if (id === 'menu' || id === 'loading') {
      this.reportWaiting = null;
      this.endingWaiting = false;
    }
    if (id === 'summary') this.state.reportAt = performance.now();
    // A long-press assignment lasts while the Bag is open; the help card closes with its menu.
    if (id !== 'inventory') this.state.assignSlot = -1;
    if (id !== this.current) this.state.help = null;
    this.current = id;
    this.render(false);
    // The first screen replaces the boot mark in one cut (it is drawn over it), not a crossfade.
    if (first) this.screenEl?.classList.add('dd-rebuilt');
    this.updateTouch();
    if (id === 'none') this.openWaiting();
  }

  /** Open a waiting end card or report once play has no screen up (the end card first). */
  private openWaiting(): void {
    if (!this.gameplay || this.current !== 'none' || this.confirmSpec || this.ceremony) return;
    if (this.endingWaiting) {
      this.endingWaiting = false;
      if (this.actions.getJournal().ending.reached) {
        this.openEnding();
        return;
      }
    }
    if (this.reportWaiting !== 'free') return;
    this.reportWaiting = null;
    if (this.actions.getReport()) this.showScreen('summary');
  }

  /** The end card's ceremony: the world fades to black, the card rises out of it. */
  private openEnding(): void {
    this.ceremony = true;
    this.updateTouch();
    void this.veil(true, DURATION.ceremony).then(() => {
      this.ceremony = false;
      // Something else took the screen during the fade (the app went to the background and
      // paused): the card waits for play to resume.
      if (this.current === 'none') this.showScreen('ending');
      else this.endingWaiting = true;
      void this.veil(false, DURATION.long);
    });
  }

  isBlockingInput(): boolean {
    return this.current !== 'none' || this.ceremony;
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

  /** Round 3: a biome arrival card (LOOP's 'guide:arrival', or WORLD's arrivalCard). */
  arrival(card: ArrivalCard): void {
    if (this.gameplay) this.hud.arrival(card);
  }

  /** Round 3: the explored stratum for the minimap (null before WORLD's strata are in). */
  setMap(src: MapSource | null): void {
    this.hud.setMap(src);
  }

  /** Round 3: a small damage number at a screen point (0..1 from the top left). */
  damageNumber(sx: number, sy: number, amount: number, kind: 'hit' | 'weak' | 'hurt' = 'hit'): void {
    if (this.gameplay && this.current === 'none') this.hud.damageNumber(sx, sy, amount, kind);
  }

  /** Round 3: a first-time tooltip by a control (once per install). */
  tip(id: string, target: UiTargetId, text: string): boolean {
    return this.gameplay && this.current === 'none' ? this.hud.tutorial.tip(id, target, text) : false;
  }

  /** Round 3: the control layout's size and opacity. */
  setControlPrefs(p: { scale: number; opacity: number }): void {
    this.touch.setPrefs(p);
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

  /**
   * A full-screen veil over everything (openings, fades to black): `on` fades it in over `ms`,
   * off fades it out and removes it. Resolves when the fade has played.
   */
  veil(on: boolean, ms: number = DURATION.medium): Promise<void> {
    const dur = playDuration(ms);
    window.clearTimeout(this.veilTimer);
    if (on && !this.veilEl) {
      this.veilEl = h('div', { class: 'dd-veil', 'aria-hidden': 'true' });
      this.el.appendChild(this.veilEl);
      void this.veilEl.offsetWidth; // start from transparent
    }
    const el = this.veilEl;
    if (!el) return Promise.resolve();
    el.style.transitionDuration = `${dur}ms`;
    el.classList.toggle('on', on);
    return new Promise((resolve) => {
      this.veilTimer = window.setTimeout(() => {
        if (!on && this.veilEl === el) {
          el.remove();
          this.veilEl = null;
        }
        resolve();
      }, dur);
    });
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    for (const id of this.exitTimers) window.clearTimeout(id);
    this.exitTimers.clear();
    window.clearTimeout(this.veilTimer);
    cancelAnimationFrame(this.patchRaf);
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
    const build = BUILDERS[id];
    this.opening = !keepPlace;
    let next: HTMLElement | null;
    try {
      next = build ? build(this.host) : null;
    } finally {
      this.opening = false;
    }
    if (old) {
      // A rebuild swaps in place; a real change lets the old screen fade out underneath.
      if (keepPlace) old.remove();
      else this.leave(old);
    }
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
    // Polish 2: the tree opened on a node below the fold (the Forge's Flash Charges) scrolls it into view.
    if (!keepPlace) {
      const board = next.querySelector<HTMLElement>('.dd-tree-board');
      const sel = board?.querySelector<HTMLElement>('.dd-node.selected');
      if (board && sel) {
        const below = sel.getBoundingClientRect().bottom - board.getBoundingClientRect().bottom;
        if (below > 0) board.scrollTop += below + 12;
      }
    }
    if (this.confirmSpec) return;
    const keep = focusKey ? next.querySelector<HTMLElement>(`[data-key="${CSS.escape(focusKey)}"]`) : null;
    if (keep && !(keep as HTMLButtonElement).disabled) keep.focus({ preventScroll: true });
    else if (this.keyboardUser()) this.autofocus(next);
  }

  private rerender(): void {
    this.render(true);
  }

  /** Move a screen to the exit layer, where it fades out (140 ms) and is removed. */
  private leave(old: HTMLElement): void {
    old.inert = true;
    this.exitEl.appendChild(old);
    const id = window.setTimeout(() => {
      this.exitTimers.delete(id);
      old.remove();
    }, playDuration(DURATION.exit) + 40);
    this.exitTimers.add(id);
  }

  /**
   * index.html's boot mark (the emblem shown before the bundle ran) gives way to the first screen,
   * which the UI layer draws over it; it is removed once that screen has painted. True the first time.
   */
  private retireBootMark(): boolean {
    const boot = document.getElementById('dd-boot');
    if (!boot || boot.classList.contains('out')) return false;
    boot.classList.add('out');
    requestAnimationFrame(() => requestAnimationFrame(() => boot.remove()));
    return true;
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
    const live = this.gameplay && this.current === 'none' && !this.ceremony;
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

  private onKey(e: KeyboardEvent): void {
    if (this.current === 'none') return;
    // Form controls outside the game UI (e.g. the Visual Lab scene picker) keep their keys.
    const target = e.target;
    if (target instanceof HTMLElement && !this.el.contains(target) && target.matches('select, input, textarea')) return;
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
      } else if (this.current === 'about') {
        stop();
        this.host.aboutBack();
      } else if (this.current === 'summary') {
        stop();
        this.host.closeReport();
      } else if (CLOSABLE.has(this.current)) {
        stop();
        this.actions.closeScreen();
      }
      return;
    }
    // The menu keys: the key of the open menu closes it, another menu's key switches to it.
    const menu = MENU_KEYS[e.code];
    if (menu && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && (CLOSABLE.has(this.current) || this.current === 'settings')) {
      stop();
      if (this.current === menu) this.actions.closeScreen();
      else if (CLOSABLE.has(this.current)) this.actions.openMenu(menu);
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
