import './ui.css';
import './screens/compat.css';
import type { EventBus, GameEvents } from '../core/events';
import type { GameUi } from '../game/GameUi';
import { detectLanguage, hasText, language, onLanguage, setLanguage, t, type TextKey } from '../i18n';
import type { InputState } from '../input/types';
import type { ItemCounts, Settings } from '../save/types';
import { focusables, h } from './dom';
import { Hud } from './hud/Hud';
import { DiscoveryBanner, PickupFeed, Toasts, discoveryText, type ToastTone } from './notices';
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
import type { ArrivalCard, BlackoutInfo, DiscoveryNotice, HudState, MapSource, PickupNotice, ScreenId, UiActions } from './types';
import { createPlayerActions, type MenuScreen, type PlayerActions, type UiTargetId } from './hud/actions';
import { buildBag } from './screens/r3/bag';
import { buildCraft } from './screens/r3/craft';
import { buildMap } from './screens/r3/map';
import { buildQuests } from './screens/r3/quests';
import { buildBestiary } from './screens/r3/bestiary';
import { buildTrip } from './screens/r3/trip';
import { MilestoneBanner, type Milestone } from './hud/Milestones';
import { arrivalCard } from '../game/quests/Guide';
import { descentStratum, fromTemplate, hintPlace, noticeTurns, toastTop, type NoticeTurns } from './hud/noticeGate';
import { STRATA } from '../config/biomes';
import { languageOf, type ControlPrefs } from './controlPrefs';
import { setReducedMotion } from './brand/motion';
import { rewardLine } from '../game/quests/Quests';
import type { Reward } from '../config/quests';

type Builder = (host: ScreenHost) => HTMLElement;

/** Round 3: the Bag and Craft menus read LOOP's views; before LOOP's Loop exists the first version's screens stand in. */
const bagOrOld: Builder = (host) => (host.actions.loop() ? buildBag(host) : buildInventory(host));
const craftOrOld: Builder = (host) => (host.actions.loop() ? buildCraft(host) : buildTree(host));
/** Round 3: in the strata a return shows LOOP's trip card; the first version's world keeps its report. */
const tripOrReport: Builder = (host) => (host.state.trip ? buildTrip(host) : buildSummary(host));

/** The strata's end card waits this long after 'quest:ending' (VIS's relighting, AUDIO's sting play first). */
export const ENDING_DELAY_MS = 6500;
/** Within this long, a second toast of the Gate opening is the same news (WORLD's, then LOOP's). */
const GATE_NEWS_MS = 8000;
/** The toasts of a craft (LOOP's and the first version's): with Craft open, its card tells them. */
const CRAFT_RESULTS: readonly TextKey[] = ['craft3.made', 'craft3.madeGear', 'gear3.kept', 'toast.crafted', 'toast.built'];

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
  summary: tripOrReport,
  board: buildBoard,
  journal: buildJournal,
  ending: buildEnding,
  about: buildAbout,
};

/** The rail's order (Bag, Craft, Map, Quests, Bestiary): a switch slides the page that way. */
const RAIL_ORDER: readonly ScreenId[] = ['inventory', 'crafting', 'map', 'quests', 'bestiary'];

/** How a round 3 menu enters (pure): 'play' (rises over the game), 'left'/'right' (a rail switch), or null. */
export function menuEnter(from: ScreenId, to: ScreenId): 'play' | 'left' | 'right' | null {
  const b = RAIL_ORDER.indexOf(to);
  if (b < 0) return null;
  const a = RAIL_ORDER.indexOf(from);
  if (a < 0) return from === 'none' ? 'play' : null;
  return a === b ? null : b > a ? 'right' : 'left';
}

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
  /** The touch layer (built again in place when the language changes). */
  get touch(): TouchControls {
    return this.touchLayer;
  }
  private touchLayer: TouchControls;
  /** Round 3: the one action API every button and key drives (ui/hud/actions). */
  readonly player: PlayerActions;
  private readonly el: HTMLElement;
  private hud: Hud;
  /** What the HUD and the touch layer were last given (a language switch builds them again). */
  private lastPrefs: ControlPrefs | null = null;
  private lastLeftHanded = false;
  private lastMap: MapSource | null = null;
  private readonly toasts = new Toasts();
  private readonly pickups = new PickupFeed();
  /** A discovery waits while another notice card has the turn (ui/hud/noticeGate). */
  private readonly discovery = new DiscoveryBanner(() => !this.noticeTurns().discovery, discoveryText);
  /** The arrival card shown or waiting last (written again after a language switch). */
  private lastArrival: ArrivalCard | null = null;
  /** A biome arrival card waiting for its turn (one notice card at a time, QA 22:10). */
  private arrivalWaiting: ArrivalCard | null = null;
  /** The toast column's top (portrait: under the HUD, the guardian's bar, a bubble up there). */
  private toastTopV = '';
  private toastTopAt = 0;
  /** When the Gate's opening was last told (WORLD and LOOP both tell it: one toast, QA 01:41). */
  private gateToastAt = -1e9;
  /** First-time item tips waiting for a guardian fight to end (QA 00:03), and when the next may show. */
  private heldHints: Array<{ id: string; text: string; target: UiTargetId | null }> = [];
  private hintFreeAt = 0;
  /** Round 3: feats, Heart Shards and completed bestiary pages (one calm card at a time). */
  private readonly milestones: MilestoneBanner;
  /** The last reward paid for a feat (its card says what it gave). */
  private lastFeatReward: Reward | null = null;
  /** LOOP's plain toast for a feat that has its own card now (skipped once). */
  private skipToast: string | null = null;
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
  /** How the screen being replaced leaves (a rail switch, a close to play), for its exit. */
  private leaving: 'rail' | 'close' | null = null;
  /**
   * An Expedition Report waiting to open: 'free' opens as soon as play has no screen up;
   * 'respawn' (a black-out: the death screen is up) waits for 'player:respawned'.
   */
  private reportWaiting: 'free' | 'respawn' | null = null;
  /** The finale has been reached: the end card opens when play has no screen up. */
  private endingWaiting = false;
  /** The end card's fade to black is playing: play is held still under the veil. */
  private ceremony = false;
  /** Round 3: the strata's end card waits for the world's relighting (ENDING_DELAY_MS). */
  private endingTimer = 0;
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
    loadingStratum: null,
    deathLost: {},
    deathInfo: null,
    treeTab: 'workbench',
    treeSel: null,
    treeCrafted: null,
    journalTab: 'discoveries',
    aboutTab: 'about',
    reportAt: 0,
    bagTab: 'all',
    bagSel: null,
    bagSocket: null,
    assignSlot: -1,
    craftTab: null,
    craftStation: null,
    craftFlash: null,
    craftMade: null,
    questsTab: 'main',
    bestiaryBiome: null,
    help: null,
    mapCamera: null,
    trip: null,
    ending: null,
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
    this.hud = this.makeHud();
    this.milestones = new MilestoneBanner((screen) => this.player.open(screen));
    this.el.append(this.hud.el, h('div', { class: 'dd-notices' }, this.pickups.el, this.discovery.el), this.milestones.el);
    root.appendChild(this.el);
    this.touchLayer = new TouchControls(this.el, input, this.player);
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
        this.state.trip = null;
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
        // Round 3: what was taken flies into the Bag (from where it lay on screen).
        if (p.sx !== undefined && p.sy !== undefined && this.gameplay && this.current === 'none') this.hud.flyToBag(p.item, p.sx, p.sy);
        if (this.current === 'inventory') this.refresh();
      }),
      bus.on('toast', (p) => {
        if (p.text === this.skipToast) {
          this.skipToast = null;
          return;
        }
        this.toast(p.text, p.tone);
      }),
      // Round 3: the milestone cards (feats, Heart Shards, bestiary pages completed).
      bus.on('reward:paid', ({ items, reason }) => {
        if (reason === 'feat') this.lastFeatReward = items as Reward;
      }),
      bus.on('feat:earned', ({ id }) => {
        const key = `feat3.${id}`;
        if (!hasText(key)) return;
        const name = t(key);
        const text = `${key}.text`;
        const reward = this.lastFeatReward;
        this.lastFeatReward = null;
        this.skipToast = hasText('feat3.earned') ? t('feat3.earned', { name }) : null;
        // Each card can be written again in another language while it waits or shows (QA 00:32).
        const make = (): Milestone => ({ kind: 'feat', name: t(key as TextKey), line: hasText(text) ? t(text as TextKey) : '', reward: reward ? rewardLine(reward) : '', remake: make });
        this.milestones.push(make());
      }),
      bus.on('quest:shard', ({ biome, count }) => {
        const make = (): Milestone => {
          const bname = hasText(`biome.${biome}.name`) ? t(`biome.${biome}.name` as TextKey) : biome;
          return { kind: 'shard', name: t('ms3.shardName', { biome: bname }), line: t('ms3.shardLine', { have: count, total: 12 }), reward: '', remake: make };
        };
        this.milestones.push(make());
      }),
      bus.on('mob:bestiary', ({ kind, page }) => {
        if (page !== 'complete') return;
        const make = (): Milestone | null => {
          const e = this.actions.getBestiary()?.entries.find((x) => x.kind === kind);
          return e ? { kind: 'bestiary', name: e.name, line: e.bonus ?? '', reward: '', remake: () => make() ?? { kind: 'bestiary', name: e.name, line: e.bonus ?? '', reward: '' } } : null;
        };
        const m = make();
        if (m) this.milestones.push(m);
      }),
      bus.on('inventory:changed', () => {
        if (this.current === 'inventory' || this.current === 'crafting') this.refresh();
      }),
      // The Expedition Report: after the camp autosave (Game announces the trip after saving),
      // never over another open screen. A black-out ends the trip under the death screen: the
      // report waits for the respawn.
      bus.on('expedition:ended', ({ report }) => {
        // Round 3: in the strata LOOP's trip card ('trip:summary') replaces the first version's report.
        if (!report.show || this.actions.strata?.()) return;
        this.reportWaiting = report.outcome === 'blackout' ? 'respawn' : 'free';
        this.openWaiting();
      }),
      bus.on('trip:summary', (p) => {
        // While the tutorial teaches (its first minutes), a trip card would only interrupt it.
        if (!p?.summary || !this.actions.strata?.() || this.hud.tutorial.active) return;
        this.state.trip = p.summary;
        // A black-out's card waits for the wake-up; LOOP may end that trip a frame after it (the
        // death screen already gone), and then it opens at once.
        this.reportWaiting = p.summary.outcome === 'blackout' && this.current === 'death' ? 'respawn' : 'free';
        this.openWaiting();
      }),
      // Round 3: the Heart relit (its guardian fell): after the world's own relighting, the end card.
      bus.on('quest:ending', () => {
        if (!this.actions.strata?.()) return;
        window.clearTimeout(this.endingTimer);
        this.endingTimer = window.setTimeout(() => {
          const view = this.actions.endingView?.() ?? null;
          if (!view) return;
          this.state.ending = view;
          this.endingWaiting = true;
          this.openWaiting();
        }, ENDING_DELAY_MS);
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
      bus.on('guide:hint', (g) => this.guideHint(g)),
      bus.on('mine:combo', ({ count }) => this.hud.combo(count)),
      // The companion's chip pings when it senses a rare ore, zaps a foe or grows.
      bus.on('companion:ore', () => this.hud.companionPing('ore')),
      bus.on('companion:zap', () => this.hud.companionPing('zap')),
      bus.on('companion:level', ({ level }) => {
        this.hud.companionPing('level');
        const make = (): Milestone => {
          const name = this.actions.getBestiary()?.entries.find((e) => e.kind === 'lampling')?.name ?? '';
          return { kind: 'companion', name: t('ms3.petLevel', { name, level }), line: t('ms3.petLevelLine'), reward: '', remake: make };
        };
        this.milestones.push(make());
      }),
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
    // A language switch (Settings): every word on screen comes again in the new language.
    this.disposers.push(onLanguage(() => this.relanguage()));
    this.watchPresses();
  }

  /** The HUD with its buttons wired to the one action API. */
  private makeHud(): Hud {
    const player = this.player;
    return new Hud({
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
      skipTutorial: () => this.actions.skipTutorial(),
    });
  }

  /**
   * The language changed: the HUD and the touch layer hold their words in their DOM, so both are
   * built again in place (fed what they were last given; the next frame refills the rest) and the
   * open screen is built again in the new language.
   */
  private relanguage(): void {
    document.documentElement.lang = language();
    // Every notice up or waiting is written again in the new language (QA 00:32): the arrival card (the
    // HUD holding it is built again: it shows again, whole), the discovery band and its legend, the
    // milestone cards, the pickups' lines; the toasts, a few seconds' words already said, go.
    const arrivalAgain = this.lastArrival && (this.hud.arrivalUp || this.arrivalWaiting) ? arrivalCard(this.lastArrival.biome as Parameters<typeof arrivalCard>[0], this.lastArrival.first) : null;
    this.discovery.relanguage();
    this.milestones.relanguage();
    this.pickups.relanguage();
    this.toasts.relanguage();
    const hud = this.makeHud();
    this.hud.el.replaceWith(hud.el);
    this.hud.tutorialEl.replaceWith(hud.tutorialEl);
    this.hud.dispose();
    this.hud = hud;
    hud.setMap(this.lastMap);
    const old = this.touchLayer;
    const touch = new TouchControls(this.el, this.input, this.player);
    old.el.replaceWith(touch.el);
    old.dispose();
    this.touchLayer = touch;
    if (this.lastPrefs) touch.setPrefs(this.lastPrefs);
    touch.setLeftHanded(this.lastLeftHanded);
    if (arrivalAgain) {
      this.lastArrival = arrivalAgain;
      this.arrivalWaiting = arrivalAgain;
    }
    this.updateTouch();
    if (this.current !== 'none') this.rerender();
  }

  get screen(): ScreenId {
    return this.current;
  }

  showScreen(id: ScreenId, opts?: { confirm?: ConfirmSpec }): void {
    const first = this.retireBootMark();
    // A new screen is built now anyway: no press is waited on any more.
    this.refreshAfterPress = false;
    if (id !== this.current) this.pressesOnScreen = 0;
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
      else {
        this.actions.dismissReport();
        this.state.trip = null;
      }
    }
    // The strata's end card shows once: leaving it is free play.
    if (this.current === 'ending' && id !== 'ending' && id !== 'pause') this.state.ending = null;
    if (id !== 'loading') this.state.loadingStratum = null;
    if (id === 'menu' || id === 'loading') {
      this.reportWaiting = null;
      this.endingWaiting = false;
      this.state.trip = null;
      this.state.ending = null;
      window.clearTimeout(this.endingTimer);
    }
    if (id === 'summary') this.state.reportAt = performance.now();
    // A long-press assignment lasts while the Bag is open; the help card closes with its menu.
    if (id !== 'inventory') this.state.assignSlot = -1;
    if (id !== this.current) this.state.help = null;
    // A station's filter lasts while Craft is open (the next Craft from the HUD shows everything).
    if (this.current === 'crafting' && id !== 'crafting') this.state.craftStation = null;
    // Round 3: how a menu enters (from play it rises; along the rail its page slides that way).
    const enter = menuEnter(this.current, id);
    this.leaving = enter === 'left' || enter === 'right' ? 'rail' : id === 'none' && RAIL_ORDER.includes(this.current) ? 'close' : null;
    this.current = id;
    this.render(false);
    this.leaving = null;
    if (enter && this.screenEl) this.screenEl.dataset.enter = enter;
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
      if (this.state.ending || this.actions.getJournal().ending.reached) {
        this.openEnding();
        return;
      }
    }
    if (this.reportWaiting !== 'free') return;
    this.reportWaiting = null;
    if (this.state.trip || this.actions.getReport()) this.showScreen('summary');
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
    if (!this.gameplay) return;
    this.hud.update(state, this.showFps, performance.now());
    this.pumpNotices();
  }

  /** A guide hint, shown once: by its control, else in the hint line; a new find waits out a fight. */
  private guideHint(g: { id: string; text: string; target: UiTargetId | null }): void {
    const place = hintPlace({ item: g.id.startsWith('item:'), target: g.target !== null, fight: this.hud.fighting, cardUp: this.hud.arrivalUp || this.discovery.up || this.milestones.up });
    if (place === 'hold') {
      if (!this.heldHints.some((x) => x.id === g.id)) this.heldHints.push(g);
      return;
    }
    this.hintFreeAt = performance.now() + 4600;
    if (place === 'tip' && g.target && this.hud.tutorial.tip(`hint:${g.id}`, g.target, g.text)) return;
    this.hint(g.text, 4200);
  }

  /** What the notice cards may do now (ui/hud/noticeGate: one at a time, in turns). */
  private noticeTurns(): NoticeTurns {
    return noticeTurns({
      live: this.gameplay && this.current === 'none' && !this.ceremony,
      cardScreen: this.gameplay && (this.current === 'summary' || this.current === 'death' || this.current === 'ending'),
      // Any other screen over play but a stratum's load (its foot is free: the gate's toast shows there).
      menuUp: this.gameplay && this.current !== 'none' && this.current !== 'loading',
      fight: this.hud.fighting,
      bubbleUp: this.hud.tutorial.bandBottom() > 0,
      arrivalUp: this.hud.arrivalUp,
      arrivalWaiting: this.arrivalWaiting !== null,
      discoveryUp: this.discovery.up,
      discoveryWaiting: this.discovery.waiting,
      milestoneUp: this.milestones.up,
    });
  }

  /**
   * The notices take turns (QA 22:10): a waiting arrival card first (a milestone card up goes back
   * to its queue), then a discovery, then the milestones; toasts wait while a card is up and stand
   * under the HUD, the guardian's bar and a bubble up there. Each HUD frame and on a screen change.
   */
  private pumpNotices(): void {
    let turns = this.noticeTurns();
    if (turns.arrival && this.arrivalWaiting) {
      const card = this.arrivalWaiting;
      this.arrivalWaiting = null;
      this.milestones.setLive(false);
      this.hud.arrival(card);
      turns = this.noticeTurns();
    }
    this.milestones.setLive(turns.milestones);
    if (turns.discovery) this.discovery.pump();
    this.toasts.hold(this.noticeTurns().holdToasts);
    const now = performance.now();
    // The finds that waited out a fight, one at a time once its bar is gone.
    if (this.heldHints.length && !this.hud.fighting && this.gameplay && this.current === 'none' && now >= this.hintFreeAt) this.guideHint(this.heldHints.shift()!);
    if (now - this.toastTopAt < 250) return;
    this.toastTopAt = now;
    const top = `${toastTop(this.hud.topBottom(), this.hud.tutorial.bandBottom())}px`;
    if (top !== this.toastTopV) {
      this.toastTopV = top;
      this.el.style.setProperty('--toast-top', top);
    }
  }

  setLoading(progress01: number, label: string): void {
    this.state.loadingProgress = Math.max(0, Math.min(1, progress01));
    this.state.loadingLabel = label;
    // A stratum's own load (WORLD labels it with the stratum's name) shows that stratum's card, not
    // the boot's logo (QA 01:41). A depth record told on the way down is overtaken: the new
    // stratum's own is told once the explorer stands there (Progression, on the first grounded frame).
    const stratum = descentStratum(label, STRATA.map((s) => t(s.name)));
    if (stratum !== null && stratum !== this.state.loadingStratum) this.toasts.drop((text) => fromTemplate(text, t('toast.depthRecord')));
    this.state.loadingStratum = stratum;
    if (this.current === 'loading' && this.screenEl) updateLoading(this.screenEl, this.state.loadingProgress, label, stratum);
  }

  showDiscovery(n: DiscoveryNotice): void {
    this.discovery.show(n);
  }

  toast(text: string, tone: ToastTone = 'info'): void {
    // One toast for the Gate opening (QA 01:41): WORLD's and LOOP's both tell it; the first stands.
    if (fromTemplate(text, t('world.gate.opened')) || fromTemplate(text, t('quest.gateOpen'))) {
      const now = performance.now();
      if (now - this.gateToastAt < GATE_NEWS_MS) return;
      this.gateToastAt = now;
    }
    // No depth record while a stratum loads: it is told at the new stratum's real depth, on arrival.
    if (this.current === 'loading' && this.state.loadingStratum !== null && fromTemplate(text, t('toast.depthRecord'))) return;
    // A craft result while Craft is open is told in the card just made (QA 02:26), not over its buttons.
    if (this.current === 'crafting' && CRAFT_RESULTS.some((k) => fromTemplate(text, t(k)))) {
      this.state.craftMade = { text, at: performance.now() };
      return;
    }
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
    if (!this.gameplay) return;
    this.lastArrival = card;
    // It shows now unless a discovery is up or a menu is open (then when its turn comes).
    this.arrivalWaiting = card;
    this.pumpNotices();
  }

  /** Round 3: the explored stratum for the minimap (null before WORLD's strata are in). */
  setMap(src: MapSource | null): void {
    this.lastMap = src;
    this.hud.setMap(src);
  }

  /** Round 3: a small damage number at a screen point (0..1 from the top left). */
  damageNumber(sx: number, sy: number, amount: number, kind: 'hit' | 'weak' | 'hurt' | 'guard' = 'hit'): void {
    if (this.gameplay && this.current === 'none') this.hud.damageNumber(sx, sy, amount, kind);
  }

  /** Round 3: a first-time tooltip by a control (once per install). */
  tip(id: string, target: UiTargetId, text: string): boolean {
    return this.gameplay && this.current === 'none' ? this.hud.tutorial.tip(id, target, text) : false;
  }

  /** Round 3: the control layout's size and opacity. */
  setControlPrefs(p: ControlPrefs): void {
    this.lastPrefs = p;
    this.touch.setPrefs(p);
    // The language (the device's, or the one chosen in Settings): a change rebuilds the words.
    setLanguage(languageOf(p, () => detectLanguage()));
    // Accessibility: rarity told by pattern and letter too; motion reduced whatever the device says.
    this.el.classList.toggle('dd-cb', p.patterns);
    setReducedMotion(p.motion === 'reduce' ? true : null);
  }

  /** Round 3: the first-time tips show again (Settings). */
  replayTips(): void {
    this.hud.tutorial.resetTips();
  }

  /** Round 3: the next Craft menu opens on this station's recipes (null: every station). */
  focusCraft(station: string | null): void {
    this.state.craftStation = station;
  }

  showDeath(lost: ItemCounts, info?: BlackoutInfo): void {
    this.state.deathLost = { ...lost };
    this.state.deathInfo = info ?? null;
    this.showScreen('death');
  }

  applySettings(s: Settings): void {
    this.showFps = s.showFps;
    this.el.classList.toggle('dd-large', s.textSize === 'large');
    this.el.classList.toggle('dd-contrast', s.highContrast);
    this.lastLeftHanded = s.leftHanded;
    this.touch.setLeftHanded(s.leftHanded);
  }

  refresh(): void {
    if (this.current === 'none' || this.current === 'loading') return;
    // A finger (or the mouse) is down on the open screen: rebuilding it now would take the button
    // from under it and the tap would be lost (an item flying into the bag, a bank deposit...). The
    // rebuild waits until the press is over and its click has landed.
    if (this.pressesOnScreen > 0) {
      this.refreshAfterPress = true;
      return;
    }
    this.rerender();
  }

  /** Presses (pointers down) on the screens now; a refresh asked meanwhile waits for them. */
  private pressesOnScreen = 0;
  private refreshAfterPress = false;
  private pressTimer = 0;

  private watchPresses(): void {
    const down = () => {
      this.pressesOnScreen++;
      window.clearTimeout(this.pressTimer);
    };
    const up = () => {
      if (this.pressesOnScreen > 0) this.pressesOnScreen--;
      if (this.pressesOnScreen > 0 || !this.refreshAfterPress) return;
      // After the click that follows the lift (it comes a moment later on touch).
      window.clearTimeout(this.pressTimer);
      this.pressTimer = window.setTimeout(() => {
        if (this.pressesOnScreen > 0 || !this.refreshAfterPress) return;
        this.refreshAfterPress = false;
        this.refresh();
      }, 160);
    };
    this.screensEl.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    this.disposers.push(
      () => this.screensEl.removeEventListener('pointerdown', down, true),
      () => window.removeEventListener('pointerup', up, true),
      () => window.removeEventListener('pointercancel', up, true),
      () => window.clearTimeout(this.pressTimer),
    );
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
    window.clearTimeout(this.endingTimer);
    cancelAnimationFrame(this.patchRaf);
    this.touch.dispose();
    this.hud.dispose();
    this.toasts.dispose();
    this.pickups.dispose();
    this.discovery.dispose();
    this.milestones.dispose();
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
    // Round 3: along the rail the old page goes at once (the frame stays); closing to play it sinks.
    if (this.leaving === 'rail') old.classList.add('dd-rail-out');
    else if (this.leaving === 'close') old.classList.add('dd-close-out');
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
    // A screen up: the toasts stand at the foot of it, clear of its header (title, ?, Close).
    this.el.classList.toggle('dd-screen-up', this.current !== 'none');
    this.pumpNotices();
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
