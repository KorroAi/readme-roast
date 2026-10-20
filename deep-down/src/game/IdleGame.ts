// The idle game's frame (SPEC §12.2): taps → model → DescentScene → JuiceDirector → FxCanvas → DOM, in one
// requestAnimationFrame. Modes: boot, menu (the surface, from the second launch), playing, paused, crashed. The model
// steps at a fixed 60 Hz (at most 4 steps a frame; a frame with taps always steps, so the hit shows in the frame after
// the pointerdown, F1). Autosave every 30 s, on pause and hide, and 2 s after a purchase burst. The idle frame cap
// (SPEC §4.1, CRITIQUE SHOULD 16): 30 fps after 20 s without input; never lower while in the foreground.

import { Vector3 } from 'three';
import { Big } from '../core/big';
import { EventBus } from '../core/events';
import { AudioSystem } from '../audio/AudioSystem';
import type { SfxName } from '../audio/sfx';
import { createIdleBus, type BuyMode, type IdleBus, type IdleEvents } from '../idle/bus';
import { biomeAt, biomeDef, biomeStart, nextBiomeStart } from '../idle/config/biomes';
import { SKILLS } from '../idle/config/skills';
import { openRack } from '../idle/model/chests';
import { collectOffline, returnFromAway, advanceIdle } from '../idle/model/offline';
import { buy, card, cards as sheetCards, quickSlots, type CardView } from '../idle/model/run';
import { nextSealDepth, rowAt, rowKinds } from '../idle/model/shaft';
import { cooldownLeft, useSkill } from '../idle/model/skills';
import { COLS, type IdleState } from '../idle/model/state';
import { createIdle, stepIdle, STEP_DT } from '../idle/model/step';
import { comboMult } from '../idle/model/run';
import { currentGoal } from '../idle/model/goals';
import { guideTarget, currentStep } from '../idle/model/tutorial';
import { sealTimeLeft } from '../idle/model/seals';
import { SURGE } from '../idle/config/upgrades';
import { format, formatRate, setNotation } from '../idle/num/notation';
import { t, type TextKey } from '../i18n';
import { DescentScene, type DescentSource } from '../render/descent/DescentScene';
import { Renderer } from '../render/Renderer';
import { LocalStorageStore, SaveSystem } from '../save/SaveSystem';
import { saveToState, stateToSave } from '../save/saveData';
import { DEFAULT_SETTINGS, type Settings } from '../save/types';
import { DisplayLedger, NUMBER_OPS, type LedgerOps } from '../ui/fx/displayLedger';
import { TOKENS_IN_FLIGHT } from '../ui/fx/FxCanvas';
import { setUiMotion } from '../ui/fx/waapi';
import { Haptics } from '../ui/haptics';
import { tr } from '../ui/idle/Card';
import type { RulerMark } from '../ui/idle/DepthRuler';
import type { GuideTarget } from '../ui/idle/GhostHand';
import type { HudModel } from '../ui/idle/Hud';
import { hudLayout } from '../ui/idle/layout';
import type { SkillView } from '../ui/idle/SkillRow';
import { TapSurface, holdRate, inReach, type TapInput } from '../ui/idle/TapSurface';
import { enterGameScreen } from '../ui/screenFormat';
import type { ScreenId, UiActions } from '../ui/types';
import { UI } from '../ui/UI';
import { DesktopInput } from '../input/DesktopInput';
import type { KeyAction } from '../input/types';
import { DigController, type UiEntity } from './DigController';
import { FrameGuard } from './FrameGuard';
import { CameraFx } from './fx/CameraFx';
import { JuiceDirector } from './fx/JuiceDirector';
import { installIdleSurface } from '../debug/idle';
import { debugMutationsAllowed } from '../debug/DebugApi';

/** 'crashed': the frame guard tripped (three failed frames in a row) or the shell saw an error. */
export type IdleMode = 'boot' | 'menu' | 'playing' | 'paused' | 'crashed';

/** The shell's own notifications (the model's are IdleEvents in src/idle/bus.ts). */
export interface ShellEvents {
  'game:saved': { reason: string };
  'game:saveFailed': { reason: string };
  toast: { text: string; tone?: 'info' | 'warn' | 'good' };
  /** The mode changed (menu → playing, playing → paused…). */
  'game:mode': { mode: IdleMode };
}

/** What the release shell (src/main.ts) needs from the game. */
export interface IdleShell {
  readonly bus: EventBus<ShellEvents>;
  readonly mode: IdleMode;
  /** The screen on top ('menu', 'settings', 'about', 'none'): Back at 'menu' exits the app. */
  readonly screen: string;
  settings: Settings;
  boot(): Promise<void>;
  crash(err: unknown): void;
  pause(): void;
  resume(): void;
  saveNow(reason: string): boolean;
  updateSettings(patch: Partial<Settings>): void;
  /** The WebGL renderer (the crash report's GPU name, context loss). */
  readonly renderer: Renderer;
  /** Audio, for the Android lifecycle. */
  readonly audio: { suspend(): void; resume(): void };
}

const AUTOSAVE_S = 30;
/** No input for this long: the frame cap drops to 30 fps (SPEC §4.1). */
const IDLE_CAP_AFTER_S = 20;
const IDLE_FPS = 30;

/** Big arithmetic for the gold ledger. */
const BIG_OPS: LedgerOps<Big> = {
  zero: () => Big.zero(),
  add: (a, b) => a.add(b),
  sub: (a, b) => a.sub(b),
  cmp: (a, b) => a.cmp(b),
};

function newSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] >>> 0 || 1;
  } catch {
    return (Date.now() ^ 0x5eed) >>> 0;
  }
}

export class IdleGame implements IdleShell, HudModel {
  readonly bus = new EventBus<ShellEvents>();
  /** The model's events (IdleEvents). */
  readonly events: IdleBus = createIdleBus();
  readonly renderer: Renderer;
  readonly saves = new SaveSystem(new LocalStorageStore());
  settings: Settings = { ...DEFAULT_SETTINGS };
  mode: IdleMode = 'boot';
  state!: IdleState;
  scene!: DescentScene;
  ui!: UI;
  audio!: AudioSystem;
  haptics!: Haptics;
  cam!: CameraFx;
  juice!: JuiceDirector;
  dig!: DigController;
  taps!: TapSurface;
  readonly gold = new DisplayLedger<Big>(BIG_OPS, 64);
  readonly gems = new DisplayLedger<number>(NUMBER_OPS, 32);
  readonly frameGuard = new FrameGuard((err) => this.crash(err));
  /** The buy mode (×1 until the first ★, then NEXT ★; MAX after the first Rekindle). */
  buyMode: BuyMode = 'x1';
  /** Frames drawn since boot. */
  frames = 0;
  ready = false;
  /** Frame timing (the perf surface). */
  frameMs = 0;
  readonly frameTimes: number[] = [];
  fps = 0;
  private lastFrame = 0;
  private acc = 0;
  private accFrame = 0;
  private lastInput = 0;
  private autosave = AUTOSAVE_S;
  private saveSoon = 0;
  private fpsN = 0;
  private fpsT = 0;
  private readonly downFrames: number[] = [];
  private readonly entities: UiEntity[] = [];
  private readonly rowScratch = new Uint8Array(COLS);
  private rowScratchDepth = -1;
  private lastBackgroundSave = -Infinity;
  private firstLaunch = false;
  private readonly disposers: Array<() => void> = [];
  private readonly recent: Array<{ name: string; payload: unknown; t: number; mt: number }> = [];
  private readonly quickCards: Array<CardView | null> = [null, null, null];
  private quickAt = -1;
  private readonly scratchBig = Big.zero();

  constructor(private readonly canvas: HTMLCanvasElement, private readonly uiRoot: HTMLElement) {
    this.settings = this.saves.loadSettings();
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches && this.settings.motion === 'full' && localStorage.getItem('deepdown.settings') === null) {
      this.settings.motion = 'reduced';
      this.settings.flashes = 'soft';
    }
    this.renderer = new Renderer(canvas, this.settings.quality);
    this.renderer.renderScaleOverride = this.settings.renderScale;
    this.renderer.setUserBloom(this.settings.bloom);
    this.renderer.setBrightness(this.settings.brightness);
    this.renderer.resize();
  }

  get screen(): string {
    return this.ui?.screen ?? 'none';
  }

  // ----------------------------------------------------------------------------------------------------------
  // Boot

  async boot(): Promise<void> {
    const now = Date.now();
    const res = this.saves.load();
    const legacy = this.saves.legacyNoticePending();
    let feast = false;
    if (res.data) {
      this.state = saveToState(res.data, now);
      const r = returnFromAway(this.state, res.data.savedAt, now, this.events);
      feast = !!r && r.seconds >= 30;
    } else {
      // ?seed=<n> under automation or ?debug=1 (the e2e G1 replays the sim's seed); otherwise a fresh random seed.
      const fixed = Number(new URLSearchParams(location.search).get('seed'));
      this.state = createIdle(debugMutationsAllowed() && Number.isInteger(fixed) && fixed > 0 ? fixed : newSeed(), now);
      this.firstLaunch = true;
    }
    this.audio = new AudioSystem(this.events);
    this.haptics = new Haptics(() => this.settings.vibration && this.settings.hapticStrength !== 'off' && this.mode === 'playing' && !document.hidden);
    this.scene = new DescentScene(this.renderer);
    await this.scene.attach(this.source());
    this.ui = new UI(this.uiRoot, this.actions(), this, {
      settings: { get: () => this.settings, set: (p) => this.updateSettings(p), drag: (p) => this.updateSettings(p) },
      toMenu: () => this.toMenu(),
      about: () => this.ui.showScreen('about'),
      feast: {
        collect: () => {
          collectOffline(this.state, this.events);
          this.saveSoon = 0.5;
        },
        openChest: () => openRack(this.state, this.events),
        rackCount: () => this.state.run.rack.length,
        coins: (x, y, n) => this.ui.fx.sparksAt(x, y, Math.min(n, 30), 'gold', performance.now(), 120, 380, 900, Math.PI * 1.1, Math.PI * 1.9, 500, 'star'),
        tick: () => this.audio.play('coin.tick', { pitch: 1 + Math.random() * 0.2 }),
        done: () => this.ui.hud.announce(t('ui.feast.spend')),
      },
      onReady: (_id, slot) => {
        this.audio.play('ui.tink', { pitch: [1, 1.26, 1.5][slot] ?? 1 });
        this.haptics.play('ready');
      },
      onSheet: (id) => {
        this.audio.ui(id ? 'open' : 'close');
      },
      onMode: (m) => {
        this.buyMode = m;
      },
    });
    this.ui.applySettings(this.settings);
    this.cam = new CameraFx(this.renderer, this.scene);
    this.applySettings();
    const fx = this.ui.fx;
    fx.format = (b) => format(b);
    fx.onLand = (kind, ids, count, socket, index) => {
      const now = performance.now();
      for (let i = 0; i < count; i++) (kind === 'gem' ? this.gems : this.gold).land(ids[i]);
      this.ui.hud.top.catch(kind, now);
      this.audio.play('coin.tick', { pitch: Math.pow(2, Math.min(12, index) / 12) });
      void socket;
    };
    this.juice = new JuiceDirector({
      bus: this.events,
      state: () => this.state,
      scene: this.scene,
      fx,
      cam: this.cam,
      haptics: this.haptics,
      audio: { play: (name, params) => this.audio.play(name as SfxName, params) },
      gold: this.gold,
      gems: this.gems,
      hud: {
        cardRect: (id) => this.ui.hud.cardRect(id),
        stampStar: (id, crown) => this.ui.hud.stampStar(id, crown),
        comboPoint: () => this.ui.hud.skill.comboPoint(),
        depthPoint: () => this.ui.hud.depthPoint(),
        stamp: (text, sub, tone) => this.ui.hud.stamp(text, sub, tone),
        announce: (text) => this.ui.hud.announce(text),
      },
      preset: () => this.settings.quality,
      holding: () => this.taps.holding,
      centre: () => {
        const l = this.ui.hud.layoutNow;
        return l ? { x: l.column.x + l.column.w / 2, y: (l.region.top + l.region.bottom) / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
      },
      buyChain: () => this.ui.hud.buyChain,
      cardName: (id) => this.cardName(id),
    });
    this.dig = new DigController(this.events, this.scene, () => this.state);
    this.dig.entities = () => this.uiEntities();
    this.taps = new TapSurface(this.canvas, {
      region: () => this.tapRegion(),
      strips: () => (this.mode === 'playing' ? this.scene.columns() : null),
    });
    this.ui.hud.worldTarget = (id) => this.worldTarget(id);
    this.wireEvents();
    this.wireLifecycle();
    this.layout();
    // What this save already revealed shows at once; the rest reveals as the tutorial goes.
    for (const id of this.state.meta.revealed) this.ui.hud.reveal(id, true);
    if (this.state.meta.tutorial.done) for (const id of ['gold', 'depth', 'quick1', 'quick2', 'quick3', 'digTab', 'crewTab', 'ruler', 'buyMode', 'combo', 'surge', 'skills']) this.ui.hud.reveal(id, true);
    if (this.state.meta.gems > 0) this.ui.hud.reveal('gems', true);
    if (this.state.meta.stats.stars > 0) this.setBuyMode('star');
    for (const sk of SKILLS) if (this.state.run.skills[sk.id]) this.addSkill(sk.id);
    this.ui.hud.top.gold.snap(this.state.run.gold.isZero() ? -Infinity : this.state.run.gold.log10());
    this.ui.hud.top.gems.snap(this.state.meta.gems > 0 ? Math.log10(this.state.meta.gems) : -Infinity);
    installIdleSurface(this);
    if (legacy) {
      this.ui.toast(t('ui.legacy.notice'), 'info', 6000).dataset.hud = 'legacy';
      this.saves.markLegacyNoticeShown();
    }
    // A first launch goes straight into the shaft (SPEC §8.1); later launches show the menu at the surface.
    if (this.firstLaunch) this.enterPlay();
    else this.enterMenu();
    if (feast && this.state.offline) {
      this.pendingFeast = true;
    }
    this.ready = true;
    this.lastFrame = performance.now();
    this.lastInput = this.lastFrame;
    requestAnimationFrame(this.frame);
    // The first save of a new game (it also overwrites any legacy slot).
    if (this.firstLaunch) this.saveNow('new');
  }

  private pendingFeast = false;

  /** The model as the scene reads it. */
  private source(): DescentSource {
    return {
      runSeed: () => this.state.runSeed,
      depth: () => this.state.run.depth,
      cellKind: (row, col) => {
        const r = rowAt(this.state, row);
        if (r) return r.kinds[col];
        if (row < this.state.run.depth) return 0;
        if (row !== this.rowScratchDepth) {
          rowKinds(this.state.runSeed, row, this.rowScratch);
          this.rowScratchDepth = row;
        }
        return this.rowScratch[col];
      },
      cellLeft: (row, col) => {
        const r = rowAt(this.state, row);
        if (r) return r.left[col];
        return row < this.state.run.depth ? 0 : 1;
      },
      crew: () => this.state.run.lines,
      pickLevel: () => this.state.run.pick,
      time: () => this.state.time,
    };
  }

  private wireEvents(): void {
    const ev = this.events;
    const on = <K extends keyof IdleEvents>(k: K, fn: (p: IdleEvents[K]) => void) => this.disposers.push(ev.on(k, fn));
    on('ui:reveal', (p) => this.ui.hud.reveal(p.id));
    on('skill:unlock', (p) => this.addSkill(p.id));
    on('buy:done', () => {
      this.saveSoon = 2;
    });
    on('crew:star', () => {
      if (this.buyMode === 'x1' && this.state.meta.stats.stars <= 1) this.setBuyMode('star');
    });
    // A first-time card shows only with its words (the model's idle.first.*, else the UI's own ui.first.*): never empty.
    on('firsttime', (p) => {
      const title = tr(`idle.first.${p.id}.title`) || tr(`ui.first.${p.id}.title`);
      const body = tr(`idle.first.${p.id}.body`) || tr(`ui.first.${p.id}.body`);
      if (title) this.ui.hud.firstTime(title, body);
    });
    on('seal:break', () => (this.saveSoon = 1));
    on('biome:reveal', (p) => this.ui.hud.stamp(tr(`idle.biome.${biomeDef(p.biome).id}`).toUpperCase(), tr('idle.biome.revealSub', { depth: biomeStart(p.biome) }), 'rune'));
    on('chest:exposed', (p) => this.addChestEntity(p.id, p.col, p.depth));
    on('chest:open', (p) => this.removeEntity(p.id));
    on('goal:done', () => this.ui.hud.goal.complete());
    // The recent-events ring (the debug surface).
    const all: Array<keyof IdleEvents> = ['tap:hit', 'cell:break', 'row:clear', 'buy:done', 'buy:fail', 'crew:star', 'pick:tier', 'gold:gain', 'gems:gain', 'chest:exposed', 'chest:open', 'seal:start', 'seal:break', 'biome:reveal', 'tutorial:step', 'tutorial:fallback', 'tutorial:done', 'goal:change', 'goal:done', 'ui:reveal', 'offline:ready', 'offline:collect', 'combo:tier', 'skill:use', 'skill:dynamite', 'firsttime', 'depth:mark'];
    const keep = (name: string, payload: unknown) => {
      this.recent.push({ name, payload, t: performance.now(), mt: this.state?.time ?? 0 });
      if (this.recent.length > 512) this.recent.shift();
    };
    for (const k of all) this.disposers.push(ev.on(k, (payload) => keep(k, payload)));
    // The shell's own (saves, mode changes) share the ring: the release spec counts saves across a crash.
    for (const k of ['game:saved', 'game:saveFailed', 'game:mode'] as const) this.disposers.push(this.bus.on(k, (payload) => keep(k, payload)));
  }

  private wireLifecycle(): void {
    const bgSave = (reason: string) => {
      if (performance.now() - this.lastBackgroundSave >= 1000) {
        if (this.saveNow(reason)) this.lastBackgroundSave = performance.now();
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        bgSave('background');
        this.audio.suspend();
        if (this.mode === 'playing') this.pause();
      } else {
        this.audio.resume();
        this.returnFromBackground();
      }
    };
    const onHide = () => bgSave('pagehide');
    const onResize = () => {
      this.renderer.resize();
      this.ui.fx.resize();
      this.layout();
    };
    const unlock = () => void this.audio.unlock();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('resize', onResize);
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    const keys = new DesktopInput({
      keysEnabled: () => this.mode === 'playing' && !this.ui.blocking,
      keyInput: () => (this.lastInput = performance.now()),
      keyAction: (a) => this.onKey(a),
    });
    this.disposers.push(() => keys.dispose());
    window.addEventListener('keydown', unlock);
    // Any pointer anywhere wakes the frame cap.
    window.addEventListener('pointerdown', () => (this.lastInput = performance.now()), { passive: true, capture: true });
    // A tap on the world ends a hit-stop in that frame (F6) and counts as input.
    this.canvas.addEventListener(
      'pointerdown',
      () => {
        const now = performance.now();
        this.cam?.pointerDown(now);
        this.downFrames.push(this.frames);
      },
      { passive: true, capture: true },
    );
    (window as unknown as { deepDownBack: () => boolean }).deepDownBack = () => this.handleBack();
    this.disposers.push(
      () => document.removeEventListener('visibilitychange', onVis),
      () => window.removeEventListener('pagehide', onHide),
      () => window.removeEventListener('resize', onResize),
    );
  }

  /** Back to the page after hiding: play resumes where it was. */
  private returnFromBackground(): void {
    if (this.mode === 'paused' && this.ui.screen === 'none') this.resume();
  }

  /** Keys 1–7 tap a column, Space taps the last column again, B buys BEST, Esc is Back (SPEC §3.1). */
  private onKey(a: KeyAction): void {
    if (a.kind === 'back') this.handleBack();
    else if (a.kind === 'tap') this.keyTap(a.col);
    else if (a.kind === 'again') this.keyTap(this.lastKeyCol);
    else {
      const best = this.quick()[1];
      if (best) this.buy(best.id, false, 0);
    }
  }

  private lastKeyCol = 3;
  private keyTap(col: number): void {
    this.lastKeyCol = col;
    const s = this.scene.columns();
    const w = (s.right - s.left) / 7;
    this.cam.pointerDown(performance.now());
    this.downFrames.push(this.frames);
    this.taps.push(s.left + (col + 0.5) * w, s.floorY + 10, -1 - col, performance.now(), 'key');
  }

  // ----------------------------------------------------------------------------------------------------------
  // Modes

  private setMode(m: IdleMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.bus.emit('game:mode', { mode: m });
  }

  private enterMenu(): void {
    this.setMode('menu');
    this.scene.setMenu(true, true);
    this.taps.reset();
    this.ui.showScreen('menu');
    this.ui.el.classList.add('dd-menu-mode');
    this.audio.setPaused(false);
  }

  private enterPlay(): void {
    this.setMode('playing');
    this.ui.showScreen('none');
    this.ui.el.classList.remove('dd-menu-mode');
    this.scene.setMenu(false);
    this.audio.setPaused(false);
    this.lastInput = performance.now();
    if (this.pendingFeast && this.state.offline && !this.state.offline.collected) {
      this.pendingFeast = false;
      this.ui.hud.startFeast(this.state.offline);
      this.haptics.play('feast');
    }
  }

  /** The menu's Continue (also the first tap's fullscreen and portrait request). */
  play(): void {
    enterGameScreen();
    this.enterPlay();
  }

  toMenu(): void {
    this.saveNow('menu');
    this.ui.hud.sheets.close();
    this.enterMenu();
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.setMode('paused');
    this.taps.reset();
    this.audio.setPaused(true);
  }

  resume(): void {
    if (this.mode !== 'paused') return;
    this.setMode('playing');
    this.audio.setPaused(false);
  }

  /** System Back: close a confirm, a screen, a sheet; at the menu root, let the OS exit. */
  handleBack(): boolean {
    if (this.ui.closeConfirm()) return true;
    if (this.mode === 'menu') {
      if (this.ui.screen !== 'menu') {
        this.ui.showScreen('menu');
        return true;
      }
      return false;
    }
    if (this.ui.screen !== 'none') {
      this.ui.showScreen('none');
      return true;
    }
    if (this.ui.hud.sheets.open) {
      this.ui.hud.sheets.close();
      return true;
    }
    this.toMenu();
    return true;
  }

  crash(err: unknown): void {
    if (this.mode === 'crashed') return;
    this.frameGuard.trip(err);
    this.mode = 'crashed';
    try {
      (window as unknown as { DeepDownAndroid?: { keepScreenOn(on: boolean): void } }).DeepDownAndroid?.keepScreenOn(false);
    } catch {
      // The shell bridge is best effort.
    }
    try {
      this.audio?.suspend();
    } catch {
      // Audio may be what failed.
    }
    window.dispatchEvent(new CustomEvent('dd:crash', { detail: err }));
  }

  // ----------------------------------------------------------------------------------------------------------
  // Save

  /**
   * Debug only (__DD__.idle.timeScale): the model clock's speed against the wall clock. The e2e tutorial bot slows
   * the model so its real taps keep their rate in model seconds on a slow software renderer.
   */
  modelScale = 1;

  /** Debug only (__DD__.idle.offline): a planted save must survive the reload's pagehide. */
  savesHeld = false;

  saveNow(reason: string): boolean {
    if (this.mode === 'boot' || this.mode === 'crashed' || !this.state || this.savesHeld) return false;
    if (!this.frameGuard.canSave) return false;
    let ok = false;
    try {
      this.state.now = Date.now();
      const res = this.saves.save(stateToSave(this.state));
      ok = res.ok;
      if (ok) this.bus.emit('game:saved', { reason });
      else this.bus.emit('game:saveFailed', { reason: res.error ?? 'unknown' });
    } catch (e) {
      console.warn('[deep-down] save failed', e);
      this.bus.emit('game:saveFailed', { reason: 'exception' });
    }
    this.autosave = AUTOSAVE_S;
    return ok;
  }

  // ----------------------------------------------------------------------------------------------------------
  // The frame

  private readonly frame = (now: number): void => {
    if (this.mode === 'crashed') return;
    requestAnimationFrame(this.frame);
    // The idle frame cap: 30 fps after 20 s without input (never lower in the foreground), the menu at 30.
    const idle = now - this.lastInput > IDLE_CAP_AFTER_S * 1000 || this.mode === 'menu' || this.mode === 'paused';
    const elapsed = now - this.lastFrame;
    if (idle && this.taps.pending === 0) {
      this.accFrame += elapsed;
      this.lastFrame = now;
      if (this.accFrame < 1000 / IDLE_FPS - 1.5) return;
      this.accFrame = 0;
    } else {
      this.accFrame = 0;
      this.lastFrame = now;
    }
    this.frameGuard.run(() => this.step(now, idle ? Math.min(0.1, 1 / IDLE_FPS) : Math.min(0.1, Math.max(0, elapsed / 1000))));
  };

  /** One frame (public so tests can advance deterministically). `dt` seconds. */
  step(now: number, dt: number): void {
    const t0 = performance.now();
    this.frames++;
    const playing = this.mode === 'playing' && !this.ui.blocking;
    // 1. Input: the hold stream and swipes, then drain the ring.
    const s = this.state;
    this.dig.begin();
    if (playing) {
      this.taps.update(now, holdRate(s.run.ups.steady ?? 0, s.tap.surgeEnd > s.time));
      this.taps.drain((tp: TapInput) => {
        this.dig.input(tp, this.frames, now);
        this.lastInput = now;
      });
    } else this.taps.drain(() => {});
    // 2. The model: fixed 1/60 s steps, ≤ 4 a frame; a frame with taps always steps (the hit shows now, F1).
    if (playing || this.mode === 'menu') {
      this.acc += dt * this.modelScale;
      let n = Math.min(4, Math.floor(this.acc / STEP_DT + 1e-6));
      if (n === 0 && this.dig.taps.length) n = 1;
      if (this.mode === 'menu') n = Math.min(n, 1);
      for (let i = 0; i < n; i++) {
        stepIdle(s, STEP_DT, i === 0 && playing ? this.dig.taps : NO_TAPS, this.events, Date.now());
        this.acc -= STEP_DT;
      }
      if (this.acc < 0) this.acc = 0;
      if (this.acc > STEP_DT * 4) this.acc = STEP_DT * 4;
    }
    // 3. The juice: the FX clock (hit-stops), flashes and bloom.
    this.cam.frame(dt, now);
    const fxDt = this.cam.fxDt(dt, now);
    // 4. The world: this frame's breaks, the floor.
    this.dig.flushBreaks();
    this.scene.rig.setFloor(s.run.depth);
    this.scene.setSheet(this.ui.hud.sheets.fraction);
    // 5–6. FX state and render.
    this.scene.frame(dt, fxDt);
    // 7. The FX canvas (sockets follow the HUD).
    this.updateSockets();
    this.ui.fx.frame(now, dt);
    // 8. The DOM.
    this.ui.hud.update(dt, now, this.cam.budget.exclusive(now));
    this.ui.hud.chests.update(this.mode === 'playing' ? this.uiEntities() : []);
    this.dig.drawn(this.frames, this.downFrames);
    this.downFrames.length = 0;
    // Autosave.
    if (this.mode === 'playing') {
      this.autosave -= dt;
      if (this.saveSoon > 0) {
        this.saveSoon -= dt;
        if (this.saveSoon <= 0) this.saveNow('purchase');
      }
      if (this.autosave <= 0) this.saveNow('auto');
    }
    this.audio.update(dt, { depth: s.run.depth, openness: 0.35, nearCrystal: biomeAt(s.run.depth) === 2 ? 0.5 : 0, nearFire: Math.max(0, 1 - s.run.depth / 12), inMenu: this.mode === 'menu' });
    this.keepAwake(now);
    this.frameMs = performance.now() - t0;
    this.frameTimes.push(this.frameMs);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    this.fpsN++;
    this.fpsT += dt;
    if (this.fpsT >= 0.5) {
      this.fps = Math.round(this.fpsN / this.fpsT);
      this.fpsN = 0;
      this.fpsT = 0;
      this.ui.setFps(`${this.fps} fps · ${this.frameMs.toFixed(1)} ms`);
    }
  }

  private awakeSent: boolean | null = null;
  /** The screen stays on only while there was input in the last 5 minutes (SPEC §4.1). */
  private keepAwake(now: number): void {
    const awake = this.mode === 'playing' && now - this.lastInput < 300_000;
    if (awake === this.awakeSent) return;
    this.awakeSent = awake;
    try {
      (window as unknown as { DeepDownAndroid?: { keepScreenOn(on: boolean): void } }).DeepDownAndroid?.keepScreenOn(awake);
    } catch {
      // Best effort.
    }
  }

  private updateSockets(): void {
    const top = this.ui.hud.top;
    if (!this.socketsAt || this.frames - this.socketsAt > 30) {
      this.socketsAt = this.frames;
      const g = top.socketCentre('gold');
      this.ui.fx.setSocket('gold', g.x, g.y);
      const m = top.socketCentre('gems');
      this.ui.fx.setSocket('gems', m.x, m.y);
    }
  }
  private socketsAt = 0;

  // ----------------------------------------------------------------------------------------------------------
  // Layout and settings

  private layout(): void {
    const probe = getComputedStyle(document.documentElement);
    const px = (v: string) => Number.parseFloat(v) || 0;
    const safeTop = px(probe.getPropertyValue('--safe-top-px')) || this.safeInset('top');
    const safeBottom = px(probe.getPropertyValue('--safe-bottom-px')) || this.safeInset('bottom');
    const l = hudLayout(window.innerWidth, window.innerHeight, safeTop, safeBottom, this.settings.textSize === 'large');
    this.ui.hud.layout(l);
    this.scene.setLayout({ width: l.width, height: l.height, regionTop: l.region.top, regionBottom: l.region.bottom });
    this.socketsAt = 0;
  }

  /** The safe-area inset in CSS px (measured once per layout from a probe element). */
  private safeInset(side: 'top' | 'bottom'): number {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;width:0;${side}:0;height:var(--safe-${side});visibility:hidden;pointer-events:none`;
    document.body.appendChild(el);
    const v = el.getBoundingClientRect().height;
    el.remove();
    return v;
  }

  private tapRegion() {
    const l = this.ui.hud.layoutNow;
    if (!l) return { top: 0, bottom: innerHeight, left: 0, right: innerWidth };
    const sheet = this.ui.hud.sheets.open ? Math.min(l.region.bottom, l.sheetTop) : l.region.bottom;
    return { top: l.region.top, bottom: sheet, left: 0, right: l.width };
  }

  updateSettings(patch: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    this.saves.saveSettings(this.settings);
    if (patch.quality && patch.quality !== prev.quality) {
      this.renderer.setQuality(patch.quality);
      this.cam?.presetChanged();
    }
    if ('renderScale' in patch) {
      this.renderer.renderScaleOverride = this.settings.renderScale;
      this.renderer.resize();
    }
    if ('bloom' in patch) this.renderer.setUserBloom(this.settings.bloom);
    if ('brightness' in patch) this.renderer.setBrightness(this.settings.brightness);
    if ('textSize' in patch) this.layout();
    this.applySettings();
    this.ui?.applySettings(this.settings);
  }

  private applySettings(): void {
    const s = this.settings;
    this.audio?.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, ambience: s.ambienceVolume });
    if (this.haptics) this.haptics.strength = s.vibration ? s.hapticStrength : 'off';
    setNotation(s.notation);
    setUiMotion(s.motion);
    if (this.cam) {
      this.cam.budget.motion = s.motion;
      this.cam.budget.flashes = s.flashes;
      this.cam.budget.shake = s.cameraShake;
    }
    if (this.ui) {
      this.ui.fx.motion = s.motion;
      this.ui.fx.tokenCap = TOKENS_IN_FLIGHT[s.quality];
      this.ui.hud.sheets.reduced = s.motion !== 'full';
      for (const tk of [this.ui.hud.top.gold, this.ui.hud.top.gems]) tk.reduced = s.motion === 'off';
    }
    this.scene?.setMotion({ motion: s.motion, shake: s.cameraShake });
  }

  private actions(): UiActions {
    return {
      play: () => this.play(),
      toMenu: () => this.toMenu(),
      getSettings: () => this.settings,
      updateSettings: (p) => this.updateSettings(p),
      resetSettings: () => this.updateSettings({ ...DEFAULT_SETTINGS }),
      deleteSave: () => {
        this.saves.clear();
        location.reload();
      },
      hasSave: () => this.saves.hasSave(),
      saveTimestamp: () => this.saves.timestamp(),
      saveSummary: () => (this.state ? `${this.state.run.depth} m · ${this.biomeName()}` : ''),
    };
  }

  private setBuyMode(m: BuyMode): void {
    this.buyMode = m;
    this.ui.hud.sheets.setMode(m);
  }

  private addSkill(id: string): void {
    this.ui.hud.skill.addSkill(id, tr(`idle.skill.${id}`), id === 'dynamite' ? 'dynamite' : 'skill');
  }

  // ----------------------------------------------------------------------------------------------------------
  // Entities the UI draws (W1: chests popped out of their cell)

  private addChestEntity(id: string, col: number, depth: number): void {
    const p = this.scene.screenOf(depth, col);
    this.entities.push({ id, x: p.x, y: p.y, r: 30 });
  }

  private removeEntity(id: string): void {
    const i = this.entities.findIndex((e) => e.id === id);
    if (i >= 0) this.entities.splice(i, 1);
  }

  private uiEntities(): readonly UiEntity[] {
    // Chests sit on the floor ledge: refresh their screen positions (the floor moves).
    for (const e of this.entities) {
      const c = this.state.chests.find((x) => x.id === e.id);
      if (!c) continue;
      const p = this.scene.screenOf(Math.min(c.depth, this.state.run.depth), c.col);
      e.x = p.x;
      e.y = p.y - 22;
    }
    // Chests the model opened by itself (the tutorial's fallback) leave the list.
    for (let i = this.entities.length - 1; i >= 0; i--) if (!this.state.chests.some((c) => c.id === this.entities[i].id)) this.entities.splice(i, 1);
    return this.entities;
  }

  /** World guide targets: the cell to tap, a chest, the seal. */
  private worldTarget(id: string): GuideTarget | null {
    const s = this.state;
    if (id === 'crystal') {
      // The nearest crystal cluster in reach (B's tappable props), else the floor.
      const c = this.crystalTarget();
      if (c) return c;
    }
    if (id === 'cell' || id === 'seal' || id === 'crystal') {
      const c = this.scene.screenOf(s.run.depth, 3);
      return { x: c.x, y: c.y, w: 44, h: 44 };
    }
    const e = this.uiEntities().find((x) => x.id === id);
    if (e) return { x: e.x, y: e.y, w: 56, h: 56 };
    return null;
  }

  private readonly projScratch = new Vector3();
  /** A live crystal cluster prop within the reach band, projected to the screen (read-only use of the scene's props). */
  private crystalTarget(): GuideTarget | null {
    const floorY = this.scene.columns().floorY;
    let best: GuideTarget | null = null;
    let bestD = Infinity;
    for (const spec of this.scene.world.liveProps.values()) {
      if (spec.tap !== 'crystal') continue;
      const p = this.scene.rig.project(spec.x, spec.y + 0.45 * spec.scale, spec.z, this.projScratch);
      const d = Math.abs(p.y - floorY);
      // A cluster half off the screen edge is still tappable (the pick radius is at least 32 px): the hand points at
      // the visible half.
      if (!inReach(p.y, floorY) || p.x < -24 || p.x > innerWidth + 24 || d >= bestD) continue;
      bestD = d;
      best = { x: Math.max(8, Math.min(innerWidth - 8, p.x)), y: p.y, w: 56, h: 56 };
    }
    return best;
  }

  // ----------------------------------------------------------------------------------------------------------
  // HudModel

  cards(sheet: 'dig' | 'crew', mode: BuyMode): CardView[] {
    return sheetCards(this.state, sheet, mode);
  }

  shownGoldLog10(): number {
    const shown = this.gold.shown(this.state.run.gold);
    return shown.isZero() ? -Infinity : shown.log10();
  }

  goldLog10(): number {
    return this.shownGoldLog10();
  }

  gemsShown(): number {
    return Math.max(0, this.gems.shown(this.state.meta.gems));
  }

  buy(id: string, repeat: boolean, index: number): boolean {
    void index;
    const mode = id === 'pick' && this.buyMode === 'star' ? 'x1' : this.buyMode;
    const r = buy(this.state, id, repeat && mode === 'max' ? 'x1' : mode, this.events);
    if (!r.ok) {
      this.audio.ui('no');
      this.haptics.play('no');
    }
    this.quickAt = -1;
    return r.ok;
  }

  /** The sheets' buy mode (CardSource). */
  buyModeNow(): BuyMode {
    return this.buyMode;
  }

  crewDps(): string {
    const d = this.state.rates.crewDps;
    return d.isZero() ? '' : format(d);
  }

  quick(): ReadonlyArray<CardView | null> {
    // Recomputed at most every other frame (cards are cheap, but this runs every frame).
    if (this.quickAt === this.frames) return this.quickCards;
    this.quickAt = this.frames;
    const ids = quickSlots(this.state);
    for (let i = 0; i < 3; i++) this.quickCards[i] = ids[i] ? card(this.state, ids[i], i === 0 ? 'x1' : this.buyMode) : null;
    return this.quickCards;
  }

  goal() {
    return currentGoal(this.state);
  }

  rate(): Big {
    return this.state.rates.goldPerSec;
  }

  depth(): number {
    return this.state.run.depth;
  }

  biomeName(): string {
    return tr(`idle.biome.${biomeDef(biomeAt(this.state.run.depth)).id}`);
  }

  floorFrac(): number {
    return -this.scene.rig.followY;
  }

  floorY(): number {
    return this.scene.floorScreenY();
  }

  rulerMarks(): readonly RulerMark[] {
    const s = this.state;
    const out = this.marks;
    out.length = 0;
    const seal = nextSealDepth(s, s.run.depth);
    const nb = nextBiomeStart(s.run.depth);
    if (Number.isFinite(seal)) out.push({ depth: seal, kind: 'seal', label: tr(`idle.warden.${biomeDef(biomeAt(seal) - 1 >= 0 ? biomeAt(seal) - 1 : 0).warden}`) });
    else if (Number.isFinite(nb)) out.push({ depth: nb, kind: 'biome', label: tr(`idle.biome.${biomeDef(biomeAt(nb)).id}`) });
    // Chest cells in the live shaft window.
    for (const r of s.shaft.rows) {
      for (let c = 0; c < COLS; c++) if (r.kinds[c] === 7 && r.left[c] > 0) out.push({ depth: r.depth, kind: 'chest', label: '' });
    }
    if (s.meta.record > s.run.depth) out.push({ depth: s.meta.record, kind: 'record', label: '' });
    return out;
  }
  private readonly marks: RulerMark[] = [];

  combo() {
    const s = this.state;
    return { combo: s.tap.combo, mult: comboMult(s.tap.combo), surge: s.tap.surge / SURGE.meterMax, surgeOn: s.tap.surgeEnd > s.time };
  }

  private readonly skillViews: SkillView[] = [];
  skills(): readonly SkillView[] {
    const s = this.state;
    this.skillViews.length = 0;
    for (const sk of SKILLS) {
      const k = s.run.skills[sk.id];
      if (!k) continue;
      const left = cooldownLeft(s, sk.id);
      this.skillViews.push({ id: sk.id, cooldown: sk.cooldown > 0 ? Math.min(1, left / sk.cooldown) : 0, ready: left <= 0, charges: k.charges, label: tr(`idle.skill.${sk.id}`) });
    }
    return this.skillViews;
  }

  useSkill(id: string): void {
    if (!useSkill(this.state, id, this.events)) {
      this.audio.ui('no');
      return;
    }
    this.haptics.play('dynamite');
  }

  guide(): { target: string; text: string } {
    const step = currentStep(this.state);
    return { target: guideTarget(this.state), text: step?.text ?? '' };
  }

  seal() {
    const st = this.state.seal;
    if (!st) return null;
    return { left: st.left, time: sealTimeLeft(this.state), total: st.time, held: st.phase === 'held' };
  }

  go(go: string): void {
    if (go.startsWith('sheet:')) this.ui.hud.sheets.show(go.slice(6) as 'dig' | 'crew');
    else if (go.startsWith('card:')) {
      const id = go.slice(5);
      this.ui.hud.sheets.show(id.startsWith('crew:') ? 'crew' : 'dig');
    }
  }

  /** The display name of a card id (and `tool:<tier>` for the pick's forms). */
  cardName(id: string): string {
    if (id.startsWith('tool:')) return tr(`idle.tool.${id.slice(5)}`);
    const v = card(this.state, id, 'x1');
    return v ? tr(v.nameKey, v.nameParams) : id;
  }

  // ----------------------------------------------------------------------------------------------------------
  // The debug surface's helpers

  recentEvents(name?: string): Array<{ name: string; payload: unknown; t: number; mt: number }> {
    return name ? this.recent.filter((e) => e.name === name) : [...this.recent];
  }

  clearEvents(): void {
    this.recent.length = 0;
  }

  /** Fast-forward with the crew only. */
  advance(seconds: number): void {
    advanceIdle(this.state, seconds, this.events);
    this.scene.jump(this.state.run.depth);
  }

  give(gold: Big, gems: number): void {
    this.state.run.gold.addIn(gold);
    this.state.meta.gems += gems;
    this.ui.hud.top.gold.snap(this.state.run.gold.log10());
    if (gems > 0) this.ui.hud.reveal('gems');
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.juice.dispose();
    this.dig.dispose();
    this.taps.dispose();
    this.audio.dispose();
    this.haptics.dispose();
    this.ui.dispose();
    this.scene.dispose();
    this.renderer.dispose();
  }

  /** Labels for screens (main.ts's Back logic). */
  static readonly MENU: ScreenId = 'menu';

  /** A text key resolved (the debug surface). */
  static text(key: string): string {
    return t(key as TextKey);
  }

  /** The rate as text (the debug surface). */
  rateText(): string {
    return formatRate(this.state.rates.goldPerSec);
  }

  /** Scratch: format a log10 value. */
  fmtLog(l: number): string {
    return Number.isFinite(l) ? format(this.scratchBig.setLog10(l)) : '0';
  }
}

const NO_TAPS: [] = [];
