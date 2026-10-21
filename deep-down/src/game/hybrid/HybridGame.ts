// The first-person game shell (BUILD §3.4 MUST 4; SPEC §12.2; W1-LEAD §3): touches → actions → model → DepthScene →
// camera → FX director → HUD → audio, in one requestAnimationFrame. Copied in spirit from IdleGame (boot, modes, the
// fixed 60 Hz step, autosave, lifecycle, the offline return, Back, the crash hook), with the cutaway gone.
//
// The phases (W1-LEAD §3), all in first person, all one thumb:
//   camp    the surface at dusk: tap to walk between the adit, the crew board and the lantern maker; the adit descends.
//   dig     the drift face: tap or hold the 7 blocks; the camera creeps a metre per slice (A step / B glide).
//   explore the chamber after a breakthrough: tap a floor to walk there, a tappable to act (or walk to it and act),
//           drag to look, hold to sweep; the objective line walks you to the goal.
//   ride    the Way Down on rails (a ladder, a stair, the Copper Lode's cart run): tap the glints as they pass; skippable.
//   seal    the Halden Hatch: tap and hold, strike the padlock when it lights.
//
// Frame order: input (the press acts in the same frame, L1) → the model's fixed steps → the camera → the FX director
// (budgets from DepthScene.stats()) → the scene → the HUD → audio → autosave.

import { Big } from '../../core/big';
import { EventBus } from '../../core/events';
import { AudioSystem } from '../../audio/AudioSystem';
import type { AudioWorldState } from '../../audio/types';
import { createIdleBus, type IdleBus, type IdleEvents } from '../../idle/bus';
import { biomeAt, biomeDef, BIOMES } from '../../idle/config/biomes';
import { applyNodeAction, contentsOf, enableNodes, enterCamp, nodeView, playerBiome, playerDepth, setPlayerNode, setTemplateSource, type NodeAction, type StrikeRef } from '../../idle/model/nodes';
import { nodeAt } from '../../idle/model/chart';
import { best, buy, card, cards as sheetCards, type CardView } from '../../idle/model/run';
import { rowAt } from '../../idle/model/shaft';
import type { IdleState } from '../../idle/model/state';
import { COLS } from '../../idle/model/state';
import { createIdle, stepIdle, STEP_DT } from '../../idle/model/step';
import { returnFromAway, collectOffline } from '../../idle/model/offline';
import { sealTimeLeft } from '../../idle/model/seals';
import { format, formatRate, setNotation } from '../../idle/num/notation';
import { t, type TextKey } from '../../i18n';
import { DepthScene } from '../../render/hybrid/DepthScene';
import type { CameraPose as ScenePose, Pick, ScreenTarget } from '../../render/hybrid/types';
import { FOCUS_KINDS, STRIKE_KINDS } from '../../render/hybrid/types';
import { Renderer } from '../../render/Renderer';
import { LocalStorageStore, SaveSystem } from '../../save/SaveSystem';
import { saveToState, stateToSave } from '../../save/saveData';
import { DEFAULT_SETTINGS, type Settings } from '../../save/types';
import { DisplayLedger, type LedgerOps } from '../../ui/fx/displayLedger';
import { TOKENS_IN_FLIGHT } from '../../ui/fx/FxCanvas';
import { setUiMotion } from '../../ui/fx/waapi';
import { Haptics } from '../../ui/haptics';
import { HybridUI } from '../../ui/hybrid/HybridUI';
import type { HudCard, HudFrame, HudHooks, SettingsRow, SheetRow } from '../../ui/hybrid/Hud';
import { TapCap, TapSurface, holdRate, type TouchEvent2 } from '../../ui/hybrid/TapSurface';
import { enterGameScreen } from '../../ui/screenFormat';
import { debugMutationsAllowed } from '../../debug/DebugApi';
import { installHybridDebug, type HybridDebug } from '../../debug/hybrid';
import { FrameGuard } from '../FrameGuard';
import { DEG, PITCH } from './lens';
import {
  FirstPersonCamera,
  breakthroughMove,
  clonePose,
  crossFadeMove,
  glimpsesMove,
  makePose,
  revealMove,
  stepInMove,
  type CameraPose,
} from './FirstPersonCamera';
import { FxDirector } from './FxDirector';
import { resolve, type NodeFrame, type NodeTouch, type RayHit, type TouchIn, type TouchPhase } from './NodeController';
import { planWalk, snapToFloor, type NavLike } from './explore';
import { globalId, localId, makeSource, nodeOfId, type WorldProvider } from './source';
import { createWorld } from './world';
import { IrradianceVolume } from './irradiance';
import { DeepWorld } from '../../world/hybrid/DeepWorld';
import { templateFor } from '../../world/hybrid/kits/templates';
import { tx } from './text';
import { loadPrefs, savePrefs, type ShellPrefs } from './prefs';
import type { V3 } from './ropeRide';

export type GameMode = 'boot' | 'menu' | 'playing' | 'paused' | 'crashed';

/** The shell's own notifications (the model's are IdleEvents). */
export interface ShellEvents {
  'game:saved': { reason: string };
  'game:saveFailed': { reason: string };
  toast: { text: string; tone?: 'info' | 'warn' | 'good' };
  'game:mode': { mode: GameMode };
}

/** A world provider that also gives each node's walkability grid (1B's NavGrid). */
export interface HybridWorld extends WorldProvider {
  /** The walkability of node i's chamber and drift (null until stamped). */
  nav(i: number): NavLike | null;
  /** The camp's walkability. */
  campNav(): NavLike | null;
  /** A secret broke open in node i: rebuild its walkability. */
  opened?(i: number, cells: ReadonlyArray<[number, number, number]>): void;
}

const AUTOSAVE_S = 30;
const IDLE_CAP_AFTER_S = 20;
const IDLE_FPS = 30;

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

/** A key's text, or '' when the table has no such key (never a raw key on screen). */
/** The shell's touch phase for the model's phase. */
function touchPhaseOf(p: string): TouchPhase {
  return p === 'dig' ? 'drift' : p === 'explore' ? 'explore' : p === 'ride' ? 'ride' : p === 'seal' ? 'seal' : 'camp';
}

const NO_TAPS: never[] = [];

export class HybridGame {
  readonly bus = new EventBus<ShellEvents>();
  /** The model's events. */
  readonly events: IdleBus = createIdleBus();
  readonly renderer: Renderer;
  readonly saves = new SaveSystem(new LocalStorageStore());
  settings: Settings = { ...DEFAULT_SETTINGS };
  prefs: ShellPrefs = loadPrefs();
  mode: GameMode = 'boot';
  state!: IdleState;
  scene!: DepthScene;
  readonly cam = new FirstPersonCamera();
  ui!: HybridUI;
  audio!: AudioSystem;
  haptics!: Haptics;
  fx!: FxDirector;
  taps!: TapSurface;
  readonly cap = new TapCap();
  readonly frameGuard = new FrameGuard((err) => this.crash(err));
  readonly gold = new DisplayLedger<Big>(BIG_OPS, 64);
  world: HybridWorld | null = null;
  /** 1B's world: the voxel ring, its light, the slab stream, placements and walkability (null in a headless test). */
  deep: DeepWorld | null = null;
  private irr: IrradianceVolume | null = null;
  ready = false;
  frames = 0;
  frameMs = 0;
  fps = 0;
  readonly frameTimes: number[] = [];
  /** Debug only: the model clock's speed against the wall clock. */
  modelScale = 1;
  /** Debug only: hold saves (the offline e2e plants a save that must survive the reload's pagehide). */
  savesHeld = false;
  private lastFrame = 0;
  private acc = 0;
  private accFrame = 0;
  private lastInput = 0;
  private autosave = AUTOSAVE_S;
  private saveSoon = 0;
  private fpsN = 0;
  private fpsT = 0;
  private firstLaunch = false;
  private pendingReturn = false;
  private readonly actions: NodeAction[] = [];
  private readonly disposers: Array<() => void> = [];
  private readonly recent: Array<{ name: string; payload: unknown; t: number; mt: number; f: number }> = [];
  /** The touch phase each live finger went down in ('skipped' when its press skipped a move): its later events must match. */
  private readonly gesturePhase = new Map<number, string>();
  private readonly touchLog: Array<{ x: number; y: number; kind: string; verb: string; target: string; t: number; f: number }> = [];
  private readonly downFrames: number[] = [];
  private readonly tapFrames: number[] = [];
  private strikeStreamAt = -Infinity;
  private frameCache: { f: number; frame: NodeFrame } | null = null;
  private targetsCache: { f: number; list: ScreenTarget[] } | null = null;
  private lastPick: Pick | null = null;
  private rateUntil = 0;
  private lastContact = { x: 195, y: 420 };
  private readonly audioWorld: AudioWorldState = { depth: 0, openness: 0.35, nearCrystal: 0, nearFire: 1, inMenu: false };
  /** Explore stats (the debug surface). */
  private readonly ex = { walks: 0, arrivals: 0, acts: 0, looks: 0, marker: null as null | { x: number; y: number; z: number; at: number } };
  /** The breakthrough or reveal glide drives first light (node, the camera move's name). */
  private lightGlide: { node: number; move: string } | null = null;
  private sealView: { left: number; weakLit: boolean } | null = null;

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

  /** 'menu' at the camp with nothing open (Back there exits the app), else 'none'. */
  get screen(): string {
    if (!this.state || !this.ui) return 'none';
    return this.state.node.phase === 'camp' && !this.ui.hud.sheetOpen && !this.state.node.focus ? 'menu' : 'none';
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Boot

  async boot(world?: HybridWorld | null): Promise<void> {
    const now = Date.now();
    const res = this.saves.load();
    const legacy = this.saves.legacyNoticePending();
    let away = false;
    if (res.data) {
      this.state = saveToState(res.data, now);
      if (!this.state.node.on) enableNodes(this.state);
      const r = returnFromAway(this.state, res.data.savedAt, now, this.events);
      away = !!r && r.seconds >= 30 && (r.toDepth > r.fromDepth || !r.gold.isZero());
    } else {
      const fixed = Number(new URLSearchParams(location.search).get('seed'));
      this.state = createIdle(debugMutationsAllowed() && Number.isInteger(fixed) && fixed > 0 ? fixed : newSeed(), now);
      enableNodes(this.state);
      this.firstLaunch = true;
    }
    if (!world) {
      // The world (1B): primed around the player's node, its light as the irradiance volume (1E).
      const deep = new DeepWorld({ lifeSeed: this.state.seed, runSeed: this.state.runSeed });
      this.deep = deep;
      world = createWorld({
        place: (i) => deep.placement(i),
        camp: () => deep.camp(),
        nav: (i) => deep.nav(i),
        campNav: () => deep.campNav(),
      });
      this.world = world;
      deep.prime(this.focusY(), this.state.run.depth, this.openedIds(), { sync: 2 });
      this.irr = new IrradianceVolume(deep.light.data);
    }
    this.world = world;
    this.installTemplates();
    this.audio = new AudioSystem(this.events);
    this.haptics = new Haptics(() => this.settings.vibration && this.settings.hapticStrength !== 'off' && this.mode === 'playing' && !document.hidden);
    this.fx = new FxDirector({ preset: () => this.settings.quality, motion: () => this.settings.motion, shake: () => this.settings.cameraShake });
    this.scene = new DepthScene(this.renderer);
    await this.scene.attach(
      makeSource({
        state: () => this.state,
        world: this.world ?? { placement: () => null, camp: () => null },
        inCart: () => this.state.node.ride?.kind === 'cart',
        seal: () => this.sealView,
        voxels: () => (this.deep ? { voxels: this.deep.ring, irradiance: this.irr?.source ?? null } : null),
      }),
    );
    this.ui = new HybridUI(this.uiRoot, this.hudHooks());
    this.ui.applySettings(this.settings);
    this.applySettings();
    this.ui.fx.format = (b) => format(b);
    this.ui.fx.onLand = (kind, ids, count) => {
      for (let i = 0; i < count; i++) if (kind !== 'gem') this.gold.land(ids[i]);
      this.ui.hud.popGold();
      this.audio.play('coin.tick', { pitch: 1 + Math.random() * 0.15 });
    };
    this.taps = new TapSurface(this.canvas, { region: () => this.tapRegion() });
    this.wireEvents();
    this.wireLifecycle();
    this.layout();
    installHybridDebug(this.debugApi());
    if (debugMutationsAllowed() || navigator.webdriver) {
      // The release shell's tests reach the running game (its GL context, its settings) through `internals`.
      const w = window as unknown as { __DD__: Record<string, unknown> };
      w.__DD__.internals = { game: this, fx: this.ui.fx };
    }
    if (legacy || this.state.meta.rechartNotice === 1) {
      this.ui.hud.firstTime(t('hy.legacy.rechart'), '', 5000, 'info');
      if (legacy) this.saves.markLegacyNoticeShown();
      if (this.state.meta.rechartNotice === 1) this.state.meta.rechartNotice = 2;
    }
    // A first launch goes straight to the plug face at the camp (SPEC §5.10); a return with the crew's progress plays the
    // glimpses and lands at the first dark mouth (SPEC §5.3); a later launch without one opens on the camp at dusk.
    if (!this.firstLaunch && !away && this.state.node.phase !== 'camp') enterCamp(this.state, this.events);
    this.pendingReturn = away;
    this.stageForPhase(true);
    this.setMode('playing');
    if (away && this.state.offline) this.playReturn();
    this.ready = true;
    this.lastFrame = performance.now();
    this.lastInput = this.lastFrame;
    requestAnimationFrame(this.frameLoop);
    if (this.firstLaunch) this.saveNow('new');
  }

  /** The height the world streams around: the player's eye (the drift's Dig pose, the chamber's stand, the camp). */
  private focusY(): number {
    const s = this.state;
    const n = s.node;
    const w = this.world;
    if (!w) return 0;
    if (n.phase === 'camp') return w.camp()?.arrival.pos.y ?? 0;
    if (n.pose && n.phase === 'explore') return n.pose.y;
    const p = w.placement(n.node);
    if (!p) return 0;
    return n.phase === 'dig' ? p.drift.stand.pos.y : (p.chamber.stands[0]?.pos.y ?? p.drift.stand.pos.y);
  }

  /** Socket ids this run opened or lit in the world (secrets, mined skin, relit lamps): the regenerated slabs keep them. */
  private openedIds(): string[] {
    const out: string[] = [];
    for (const [k, c] of Object.entries(this.state.node.chambers)) {
      const node = Number(k);
      for (const id of c.secrets) out.push(globalId(node, id));
      for (const [id, left] of Object.entries(c.skin)) if (left <= 0) out.push(id.includes(':') ? id : globalId(node, id));
      // Relit lamps: the regenerated slabs bake their light again.
      for (const l of c.lamps) out.push(l.includes(':') ? l : globalId(node, l));
    }
    return out;
  }

  /** Register 1B's templates with the model (the contents of each chamber follow its sockets). */
  private installTemplates(): void {
    // Synchronous: the model reads a chamber's contents from its template from the first step on.
    setTemplateSource((lifeSeed, topo) => templateFor(lifeSeed, topo));
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Placement helpers

  private placement(i: number) {
    return this.world?.placement(i) ?? null;
  }

  /** The Dig pose of node i at slice `slice` (the rail's origin is the stand; a slice is 1 m). */
  private driftRail(i: number): { origin: V3; dir: V3; yaw: number; pitch: number } | null {
    const p = this.placement(i);
    if (!p) return null;
    const st = p.drift.stand;
    return { origin: { ...st.pos }, dir: { ...p.drift.dir }, yaw: st.yaw, pitch: st.pitch };
  }

  private standPose(i: number, k = 0): CameraPose | null {
    const p = this.placement(i);
    const st = p?.chamber.stands[k] ?? p?.chamber.stands[0];
    if (!st) return null;
    return makePose(st.pos.x, st.pos.y, st.pos.z, st.yaw, st.pitch);
  }

  /** Put the camera where the model's phase says, without motion (boot, a debug jump, a reload). */
  private stageForPhase(boot = false): void {
    const s = this.state;
    const n = s.node;
    const v = nodeView(s);
    this.cam.exitExplore();
    this.cam.clearRail();
    switch (n.phase) {
      case 'dig': {
        const r = this.driftRail(n.node);
        if (r) {
          this.cam.place({ x: r.origin.x, y: r.origin.y, z: r.origin.z, yaw: r.yaw, pitch: r.pitch }, 'drift');
          this.cam.setRail(r, Math.max(0, v.sliceIndex));
        }
        break;
      }
      case 'explore': {
        const pose = n.pose ? makePose(n.pose.x, n.pose.y, n.pose.z, n.pose.yaw, n.pose.pitch) : this.standPose(n.node, n.stand);
        if (pose) this.cam.place(pose, 'explore');
        this.cam.enterExplore();
        break;
      }
      case 'seal': {
        const pose = this.sealPose(n.node);
        if (pose) this.cam.place(pose, 'stand');
        break;
      }
      case 'ride': {
        // A save taken mid-ride resumes at its end (the ride is short and skippable).
        this.actions.push({ type: 'rideEnd', skipped: true });
        break;
      }
      case 'camp': {
        const c = this.world?.camp();
        if (c) this.cam.place({ x: c.arrival.pos.x, y: c.arrival.pos.y, z: c.arrival.pos.z, yaw: c.arrival.yaw, pitch: c.arrival.pitch }, 'camp');
        this.cam.enterExplore('camp');
        break;
      }
    }
    void boot;
  }

  /** The seal pose: the Seal hall's exit seen at −35° (the Hatch is a floor hatch). */
  private sealPose(i: number): CameraPose | null {
    const p = this.placement(i);
    const e = p?.chamber.exits[0];
    if (!e) return this.standPose(i);
    const a = e.approach;
    const yaw = Math.atan2(-(e.pos.x - a.x), -(e.pos.z - a.z));
    return makePose(a.x, a.y + 1.6, a.z, yaw, PITCH.floorSeal * DEG);
  }

  // ----------------------------------------------------------------------------------------------------------------
  // The model's events → scene, camera, HUD, audio, haptics

  private wireEvents(): void {
    const ev = this.events;
    const on = <K extends keyof IdleEvents>(k: K, fn: (p: IdleEvents[K]) => void) => this.disposers.push(ev.on(k, fn));
    on('cell:break', (p) => {
      this.scene.breakBlocks([{ depth: p.depth, col: p.col, kind: p.kind, crit: p.crit, crew: p.source === 'crew' }]);
      if (p.source !== 'crew') {
        this.fx.request('break.shards');
        this.haptics.play('break');
      }
    });
    on('gold:gain', (p) => this.flyGold(p.amount, p.source));
    on('tap:hit', (p) => {
      if (p.source !== 'crew') this.haptics.play('tap');
    });
    on('drift:slice', (p) => {
      if (p.node !== this.state.node.node) return;
      this.scene.crumble(p.depth - 1);
      this.fx.request('slice.crumble');
      this.cam.creepTo(Math.max(0, p.slice));
    });
    on('node:breach', (p) => {
      if (p.by === 'player' && p.node === this.state.node.node) this.playBreakthrough(p.node);
      else this.scene.breach(p.node);
    });
    on('node:arrive', (p) => {
      if (p.phase === 'dig') {
        const r = this.driftRail(p.node);
        if (r && !this.cam.running) this.cam.setRail(r, Math.max(0, p.dug));
      } else if (p.phase === 'explore') {
        if (!this.cam.running) {
          const pose = this.standPose(p.node);
          if (pose) this.cam.place(pose, 'explore');
        }
        this.cam.enterExplore();
      }
    });
    on('node:firstLight', (p) => {
      if (!this.lightGlide) this.scene.firstLight(p.node, 1);
    });
    on('tappable:hit', (p) => this.scene.hitTappable(globalId(p.node, p.id), p.left, p.crit));
    on('chamber:harvest', (p) => {
      this.scene.hitTappable(globalId(p.node, p.id), 0, p.crit);
      this.fx.request('break.shards');
      this.haptics.play('break');
    });
    on('skin:strike', (p) => {
      this.scene.hitTappable(p.id, p.left);
      if (p.broke) {
        this.deep?.breakSkin(p.id.includes(':') ? p.id : globalId(p.node, p.id));
        this.fx.request('skin.break');
      }
    });
    on('node:leave', (p) => {
      // The lamps relit there are written into the light volume after you leave (SPEC §4.6).
      const c = this.state.node.chambers[p.node];
      if (c && this.deep) for (const l of c.lamps) this.deep.bakeLamp(globalId(p.node, l));
    });
    on('secret:found', (p) => {
      this.deep?.openSecret(globalId(p.node, p.id));
      this.scene.revealSecret(globalId(p.node, p.id));
      this.fx.request('secret.open');
      const so = this.placement(p.node)?.chamber.sockets.find((x) => x.local === p.id);
      if (so?.secret) this.world?.opened?.(p.node, so.secret.cells);
    });
    on('lamp:relight', (p) => {
      this.scene.relight(globalId(p.node, p.id));
      this.fx.request('lamp.relight');
      this.haptics.play('tap');
    });
    on('chamber:charted', (p) => {
      this.ui.hud.firstTime(tx('idle.first.charted.title') || tx('hy.focus.note'), p.first ? tx('idle.first.charted.body') : '', 2500, 'first');
    });
    on('focus:open', (p) => {
      this.scene.focusPop(globalId(p.node, p.id), true);
      this.scene.dim(0.3);
      this.showFocusPanel(p.node, p.id, p.kind);
    });
    on('focus:close', (p) => {
      this.scene.focusPop(globalId(p.node, p.id), false);
      this.scene.dim(this.ui.hud.sheetOpen ? 0.3 : 0);
      this.ui.hud.focus('', '', '');
    });
    on('chest:open', (p) => {
      const id = p.id.includes(':') ? p.id : '';
      if (id) this.scene.openFocus(id);
      this.fx.ceremonyStart('chest', Math.min(1200, 250 * Math.max(1, p.steps + 1)), () => this.fx.request('chest.open'));
      const gold = format(p.gold);
      this.ui.hud.focus(t('hy.focus.chest', { tier: tx(`idle.chest.${p.tier}`) || p.tier }), p.gems > 0 ? t('hy.focus.chestGems', { gold, gems: p.gems }) : t('hy.focus.chestGot', { gold }), 'chest');
      this.haptics.play('chest');
    });
    on('relic:grade', (p) => {
      this.ui.hud.focus(t('hy.focus.relicGrade', { relic: tx(`idle.find.${p.relic}`) || tx('idle.relic') || p.relic, grade: tx(`idle.grade.${p.grade}`) || p.grade }), '', 'relic');
    });
    on('note:read', (p) => {
      this.ui.hud.focus(t('hy.focus.note'), tx(`${p.lore}`) || tx(`idle.lore.${p.lore}`), 'note');
    });
    on('ride:start', (p) => this.playRide(p.node, p.kind));
    on('ride:glint', (p) => {
      this.scene.hitTappable(p.id, 0);
      this.fx.request('glint.mine');
    });
    on('rock:tunk', (p) => {
      if (p.hint) this.scene.rim(globalId(this.state.node.node, p.hint), true);
    });
    on('phase:change', (p) => {
      if (p.to === 'seal') this.playSealApproach(p.node);
      if (p.to === 'camp') this.playCamp();
    });
    on('camp:descend', () => this.playDescend());
    on('seal:start', () => {
      this.sealView = { left: 1, weakLit: false };
    });
    on('seal:hit', (p) => {
      if (this.sealView) this.sealView.left = p.left;
    });
    on('seal:weak', (p) => {
      if (this.sealView) this.sealView.weakLit = p.lit;
      this.scene.seal(this.sealView?.left ?? 1, p.lit);
    });
    on('seal:fail', (p) => {
      this.ui.hud.firstTime(t('hy.seal.holds', { pct: Math.round(p.pct ?? p.left * 100) }), '', 2500, 'info');
    });
    on('seal:break', () => {
      this.fx.hitStop('seal', 60);
      const sh = this.fx.shake('seal');
      if (sh) this.scene.shake(sh.deg, sh.ms);
      this.fx.ceremonyStart('seal', 1200, () => this.fx.request('seal.split'));
      this.scene.sealBreak();
      this.deep?.openHatch(this.state.node.node - (this.state.node.phase === 'explore' ? 1 : 0));
      this.sealView = null;
      this.haptics.play('seal');
      this.saveSoon = 1;
    });
    on('seal:closed', () => this.ui.hud.firstTime(t('hy.seal.closed'), '', 2500, 'info'));
    on('skill:dynamite', (p) => {
      this.fx.ceremonyStart('dynamite', 1500, () => this.fx.request('dynamite.blast'));
      const sh = this.fx.shake('dynamite');
      if (sh) this.scene.shake(sh.deg, sh.ms);
      this.scene.dynamite(p.rows);
      this.haptics.play('dynamite');
    });
    on('biome:reveal', (p) => this.scene.reveal(p.biome));
    on('firsttime', (p) => {
      const title = tx(`idle.first.${p.id}.title`) || tx(`ui.first.${p.id}.title`);
      const body = tx(`idle.first.${p.id}.body`) || tx(`ui.first.${p.id}.body`);
      if (title) this.ui.hud.firstTime(title, body);
    });
    on('buy:done', () => {
      this.saveSoon = 2;
      this.rateUntil = performance.now() + 3000;
    });
    on('offline:ready', () => {
      this.pendingReturn = true;
    });
    // The recent-events ring (the debug surface): every model event.
    const keep = (name: string, payload: unknown) => {
      this.recent.push({ name, payload, t: performance.now(), mt: this.state?.time ?? 0, f: this.frames });
      if (this.recent.length > 1024) this.recent.shift();
    };
    const anyBus = ev as unknown as { onAny?: (fn: (k: string, p: unknown) => void) => () => void };
    if (anyBus.onAny) this.disposers.push(anyBus.onAny(keep));
    else {
      const names: Array<keyof IdleEvents> = [
        'tap:hit', 'cell:break', 'row:clear', 'buy:done', 'buy:fail', 'gold:gain', 'gems:gain', 'chest:open', 'seal:start', 'seal:hit', 'seal:weak', 'seal:break', 'seal:fail',
        'biome:reveal', 'tutorial:step', 'tutorial:done', 'goal:change', 'goal:done', 'offline:ready', 'offline:collect', 'skill:dynamite', 'firsttime', 'crew:star',
        'phase:change', 'node:arrive', 'node:breach', 'node:firstLight', 'node:leave', 'tappable:hit', 'chamber:harvest', 'skin:strike', 'skin:pocket', 'secret:found',
        'lamp:relight', 'chamber:charted', 'stand:move', 'focus:open', 'focus:close', 'relic:grade', 'note:read', 'ride:start', 'ride:glint', 'ride:end', 'drift:slice',
        'drift:creep', 'lantern:raise', 'rock:tunk', 'leash:full', 'works:haul', 'seal:closed', 'camp:enter', 'camp:descend', 'rack:add', 'crew:strike',
      ];
      for (const k of names) this.disposers.push(ev.on(k, (payload) => keep(k, payload)));
    }
    for (const k of ['game:saved', 'game:saveFailed', 'game:mode'] as const) this.disposers.push(this.bus.on(k, (payload) => keep(k, payload)));
  }

  /** Tokens fly from the last strike to the gold plate; the counter changes when they land (L8). */
  private flyGold(amount: Big, source: string): void {
    if (amount.isZero()) return;
    const id = this.gold.launch(amount);
    const from = source === 'offline' || source === 'works' ? { x: this.ui.hud.layout.width / 2, y: this.ui.hud.layout.region.top + 160 } : this.lastContact;
    const g = this.ui.hud.goldPoint();
    this.ui.fx.setSocket('gold', g.x, g.y);
    const now = performance.now();
    if (!this.fx.request('loot.stream') || !this.ui.fx.token('coin', from.x, from.y, 'gold', id, 0, now)) this.gold.land(id);
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Choreography: the breakthrough, the ride, the seal, the reveal, the camp, the return

  private playBreakthrough(node: number): void {
    this.scene.breach(node);
    const stand = this.standPose(node);
    this.cam.clearRail();
    const from = clonePose(this.cam.pose());
    const plain = contentsOf(this.state, node).promise === 'dull' && nodeAt(this.state.seed, node).kind === 'chamber';
    this.fx.ceremonyStart('breakthrough', 1200, () => this.fx.request('breakthrough.wall'));
    this.haptics.play('breakthrough');
    this.lightGlide = { node, move: plain ? 'stepIn' : 'breakthrough' };
    this.scene.firstLight(node, 0);
    if (!stand) {
      this.lightGlide = null;
      this.scene.firstLight(node, 1);
      this.cam.enterExplore();
      return;
    }
    const mv = plain ? stepInMove(from, stand) : breakthroughMove(from, stand);
    this.cam.play(mv, () => {
      this.scene.firstLight(node, 1);
      this.lightGlide = null;
      this.cam.enterExplore();
      this.actions.push({ type: 'stand', stand: 0 });
    });
  }

  /** The Way Down: the exit's ride on rails (the cart run, a ladder, a stair), skippable; glints pass within reach. */
  private playRide(node: number, kind: string): void {
    const p = this.placement(node);
    const exit = p?.chamber.exits[0];
    this.cam.exitExplore();
    const done = (skipped: boolean) => {
      this.actions.push({ type: 'rideEnd', skipped });
    };
    if (!exit || exit.ride.length < 1) {
      done(true);
      return;
    }
    const ride = exit.ride;
    const first = ride[0];
    const from = clonePose(this.cam.pose());
    // Turn to face down the ride (≤ 0.3 s), then ride it on rails.
    const yaw = Math.atan2(-(first.x - from.x), -(first.z - from.z));
    const turn = crossFadeMove('wayDown', makePose(from.x, from.y, from.z, Number.isFinite(yaw) ? yaw : exit.yaw, PITCH.wayDown * DEG), 0.01);
    void turn;
    let skipped = false;
    this.cam.walk(ride, {
      kind: 'ride',
      shot: kind === 'cart' ? 'ride' : 'wayDown',
      done: (arrived) => {
        if (!arrived) skipped = true;
        done(skipped);
      },
    });
  }

  private playSealApproach(node: number): void {
    const pose = this.sealPose(node);
    this.cam.exitExplore();
    if (!pose) return;
    this.cam.play({ shot: 'stand', name: 'surveyGlide', phases: [] });
    this.cam.play(revealMoveTo(this.cam.pose(), pose));
  }

  private playCamp(): void {
    const c = this.world?.camp();
    this.cam.exitExplore();
    if (c) this.cam.play(crossFadeMove('camp', makePose(c.arrival.pos.x, c.arrival.pos.y, c.arrival.pos.z, c.arrival.yaw, c.arrival.pitch)), () => this.cam.enterExplore('camp'));
    else this.cam.enterExplore('camp');
    this.scene.setPiece('camp');
  }

  private playDescend(): void {
    this.scene.setPiece('descent');
    const s = this.state;
    const n = s.node;
    if (n.phase === 'dig') {
      const r = this.driftRail(n.node);
      this.cam.exitExplore();
      if (r) {
        const to = makePose(r.origin.x, r.origin.y, r.origin.z, r.yaw, r.pitch);
        this.cam.play(crossFadeMove('drift', to), () => this.cam.setRail(r, Math.max(0, nodeView(s).sliceIndex)));
      }
    } else if (n.phase === 'explore') {
      const pose = n.pose ? makePose(n.pose.x, n.pose.y, n.pose.z, n.pose.yaw, n.pose.pitch) : this.standPose(n.node, n.stand);
      if (pose) this.cam.play(crossFadeMove('explore', pose), () => this.cam.enterExplore());
    }
  }

  /** The return (SPEC §5.3): ≤ 3 glimpses through what the crew dug, then the mouth of the first dark chamber; the plate. */
  private playReturn(): void {
    const s = this.state;
    const r = s.offline;
    if (!r) return;
    const n = s.node;
    const glimpses: Array<{ pose: CameraPose; dolly?: V3 }> = [];
    for (let i = Math.max(0, n.node - 2); i <= n.node && glimpses.length < 3; i++) {
      const rail = this.driftRail(i);
      if (rail) glimpses.push({ pose: makePose(rail.origin.x, rail.origin.y, rail.origin.z, rail.yaw, rail.pitch), dolly: { x: rail.origin.x + rail.dir.x, y: rail.origin.y, z: rail.origin.z + rail.dir.z } });
    }
    const mouth = n.phase === 'explore' ? this.standPose(n.node) : null;
    if (glimpses.length && mouth) {
      this.cam.exitExplore();
      this.fx.ceremonyStart('return', 3000);
      this.cam.play(glimpsesMove(glimpses, mouth), () => this.cam.enterExplore());
    }
    const lines: string[] = [];
    const h = Math.floor(r.seconds / 3600);
    const m = Math.floor((r.seconds % 3600) / 60);
    lines.push(t('hy.return.time', { time: h > 0 ? `${h} h ${m} m` : `${m} m` }));
    const dug = nodeView(s).dug;
    if (dug > 0) lines.push(dug === 1 ? t('hy.return.chamber') : t('hy.return.chambers', { n: dug }));
    if (r.toDepth > r.fromDepth) lines.push(t('hy.return.depth', { n: r.toDepth - r.fromDepth }));
    if (!r.gold.isZero()) lines.push(t('hy.return.gold', { gold: format(r.gold) }));
    const rack = s.run.rack.length;
    if (rack > 0) lines.push(t('hy.return.rack', { n: rack }));
    this.ui.hud.showReturn(lines);
    this.pendingReturn = false;
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Touches

  /** The screen as NodeController sees it this frame (built once per frame, on the first touch). */
  private nodeFrame(): NodeFrame {
    if (this.frameCache && this.frameCache.f === this.frames) return this.frameCache.frame;
    const s = this.state;
    const v = nodeView(s);
    const phase: TouchPhase = this.fx.ceremony === 'reveal' ? 'reveal' : touchPhaseOf(v.phase);
    const targets = this.targets();
    const plates = this.ui.hud.plates().filter((p) => p.visible).map((p) => p.rect);
    const nav: NodeFrame['nav'][number][] = [];
    const focusables: NodeFrame['focusables'][number][] = [];
    const strikeables: NodeFrame['strikeables'][number][] = [];
    const far: NonNullable<NodeFrame['far']>[number][] = [];
    const rack: NodeFrame['rack'][number][] = [];
    let focus: NodeFrame['focus'] = null;
    for (const tg of targets) {
      if (!tg.visible) continue;
      const at = this.targetPoint(tg);
      if (tg.type === 'nav') nav.push({ id: tg.id, kind: tg.kind as NodeFrame['nav'][number]['kind'], rect: tg.hit, dist: tg.dist, at: at ?? undefined });
      else if (tg.type === 'rack') rack.push({ id: tg.kind || tg.id, rect: tg.hit, ready: (tg.state ?? 1) >= 1 });
      else if (tg.type === 'lamp') {
        if (!tg.state && tg.dist <= 3.5) strikeables.push({ id: tg.id, kind: 'lamp', rect: tg.hit, dist: tg.dist, at: at ?? undefined });
        else if (!tg.state && at) far.push({ id: tg.id, kind: 'lamp', rect: tg.hit, dist: tg.dist, at });
      } else if (tg.type === 'tappable') {
        const k = tg.kind as never;
        if (FOCUS_KINDS.has(k)) {
          if (v.focus && localId(tg.id) === v.focus) focus = { id: tg.id, kind: tg.kind as never, rect: tg.hit, resolved: false };
          else focusables.push({ id: tg.id, kind: tg.kind as never, rect: tg.hit, dist: tg.dist, at: at ?? undefined });
        } else if (STRIKE_KINDS.has(k) && (tg.state ?? 0) < 1) {
          // (state is the harvested fraction: a spent vein is no longer a candidate.)
          const kind = (tg.kind === 'secret' || tg.kind === 'glint' ? 'vein' : tg.kind) as never;
          if (tg.dist <= 3.5) strikeables.push({ id: tg.id, kind, rect: tg.hit, dist: tg.dist, at: at ?? undefined });
          else if (at) far.push({ id: tg.id, kind, rect: tg.hit, dist: tg.dist, at });
        }
      }
    }
    if (v.focus && !focus) {
      const l = this.ui.hud.layout;
      // The popped object sits 1.8 m ahead at screen centre: its rect is the centre of the world region.
      focus = { id: globalId(v.node, v.focus), kind: 'chest', rect: { x: l.width * 0.2, y: l.region.top + (l.region.bottom - l.region.top) * 0.2, w: l.width * 0.6, h: (l.region.bottom - l.region.top) * 0.42 }, resolved: false };
    }
    const face = this.scene.faceCells().filter((c) => c.slice === 0 || true).map((c) => ({ col: c.col, slice: c.slice, rect: c.bound ?? c.rect }));
    const l = this.ui.hud.layout;
    const frame: NodeFrame = {
      phase,
      plates,
      skippable: this.cam.skippable || (this.fx.ceremony !== '' && this.fx.ceremony !== 'chest'),
      focus,
      events: [],
      lantern: null,
      rack,
      strikeStreamAt: this.strikeStreamAt,
      nav,
      focusables,
      strikeables,
      far,
      face,
      weakestCol: this.weakestCol(),
      hint: strikeables[0]?.id ?? '',
      centre: { x: l.width / 2, y: (l.region.top + l.region.bottom) / 2 },
      pick: (x, y) => this.rayHit(x, y, phase),
    };
    this.frameCache = { f: this.frames, frame };
    return frame;
  }

  private targets(): ScreenTarget[] {
    if (this.targetsCache && this.targetsCache.f === this.frames) return this.targetsCache.list;
    const list = this.scene.targets();
    this.targetsCache = { f: this.frames, list };
    return list;
  }

  /** The world point of a target (to walk to it): its socket, exit or station in the placement. */
  private targetPoint(tg: ScreenTarget): V3 | null {
    const node = nodeOfId(tg.id);
    if (tg.type === 'nav' && tg.kind === 'station') {
      const st = this.world?.camp()?.stations.find((x) => x.id === tg.id.replace(/^camp:/, ''));
      return st ? { ...st.feet } : null;
    }
    const p = this.placement(node >= 0 ? node : this.state.node.node);
    if (!p) return null;
    if (tg.type === 'nav') {
      const e = p.chamber.exits.find((x) => x.id === localId(tg.id));
      return e ? { ...e.approach } : null;
    }
    const so = p.chamber.sockets.find((x) => x.id === tg.id || x.local === localId(tg.id));
    return so ? { ...so.pos } : null;
  }

  /** The model's weakest live block of the front row (the hold's fallback), −1 when none. */
  private weakestCol(): number {
    const s = this.state;
    if (s.node.phase !== 'dig' && s.node.phase !== 'seal') return -1;
    const r = rowAt(s, s.run.depth);
    if (!r) return -1;
    let best = -1;
    let bl = Infinity;
    for (let c = 0; c < COLS; c++) {
      const l = r.left[c];
      if (l > 0 && l < bl) {
        bl = l;
        best = c;
      }
    }
    return best;
  }

  /** DepthScene's pick → NodeController's RayHit (with Explore's walkable floors and the reach). */
  private rayHit(x: number, y: number, phase: TouchPhase): RayHit {
    const p = this.scene.pick(x, y);
    this.lastPick = p;
    switch (p.kind) {
      case 'face':
        return { kind: 'face', col: p.col, slice: p.slice, point: p.point, dist: p.dist };
      case 'tappable':
        // Focus types (chests, relics, notes) answer by their hit rects (NodeController step 7), never as a strike.
        if (FOCUS_KINDS.has(p.tappable)) return { kind: p.dist <= 3.5 ? 'deep' : 'far', point: p.point, dist: p.dist };
        return { kind: 'tappable', id: p.id, point: p.point, dist: p.dist };
      case 'lamp':
        return p.lit ? { kind: 'deep', point: p.point, dist: p.dist } : { kind: 'lamp', id: p.id, point: p.point, dist: p.dist };
      case 'seal':
        return { kind: 'face', col: 3, slice: 0, point: p.point, dist: p.dist };
      case 'skin':
        return { kind: 'skin', id: p.id, point: p.point, dist: p.dist };
      case 'deep':
        return { kind: 'deep', point: p.point, dist: p.dist };
      case 'floor':
      case 'far':
      case 'nav': {
        if (phase === 'explore' || phase === 'camp') {
          const nav = this.navNow();
          const at = nav ? snapToFloor(nav, p.point, p.kind === 'floor' ? 1.0 : 1.5) : null;
          if (at) return { kind: 'walk', point: at, dist: p.dist };
        }
        return p.kind === 'floor' && p.dist <= 3.5 ? { kind: 'deep', point: p.point, dist: p.dist } : { kind: 'far', point: p.point, dist: p.dist };
      }
    }
    return { kind: 'far', point: { x, y, z: 0 }, dist: 12 };
  }

  private navNow(): NavLike | null {
    const s = this.state;
    if (s.node.phase === 'camp') return this.world?.campNav() ?? null;
    return this.world?.nav(s.node.node) ?? null;
  }

  /** One gesture event from TapSurface. */
  private touch(e: TouchEvent2, now: number): void {
    const f = this.nodeFrame();
    const ti: TouchIn = { x: e.x, y: e.y, kind: e.kind, t: e.t, id: e.id, heldMs: e.heldMs, downX: e.downX, downY: e.downY, dx: e.dx, dy: e.dy };
    if (e.kind === 'press') {
      this.downFrames.push(this.frames);
      this.gesturePhase.set(e.id, f.phase);
      // A press skips a running ceremony (L9) and still acts where the phase acts on presses.
      if (this.fx.ceremony && this.fx.ceremony !== 'chest' && this.fx.skipCeremony()) {
        if (this.cam.skippable) this.cam.skip();
        this.gesturePhase.set(e.id, 'skipped');
        this.log(ti, 'navigation', 'skip', now);
        return;
      }
    } else if (e.kind === 'up') {
      const was = this.gesturePhase.get(e.id);
      this.gesturePhase.delete(e.id);
      if (was !== undefined && was !== f.phase) return;
    } else if (e.kind !== 'key') {
      // One gesture, one phase: the tap, hold or drag of a finger that went down in another phase (the last strikes of a
      // drift that landed after the breach, a press that skipped a glide) is spent; it never walks the player off.
      const was = this.gesturePhase.get(e.id);
      if (was !== undefined && was !== f.phase) return;
    }
    // A scripted camera move (the breakthrough glide, a stand change, the return glimpses) owns Explore's taps and drags
    // until it ends: they never cut it short with a walk or a look (a long one is skipped by a press, above).
    if ((f.phase === 'explore' || f.phase === 'camp') && this.cam.running !== '' && (e.kind === 'tap' || e.kind === 'drag' || e.kind === 'hold')) return;
    const r = resolve(ti, f);
    if (!r) return;
    if (e.kind === 'press' && r.verb === 'navigation' && r.nav === 'skip') this.gesturePhase.set(e.id, 'skipped');
    this.lastInput = now;
    this.log(ti, r.verb, describe(r), now);
    this.dispatch(r, ti, now);
  }

  private log(ti: TouchIn, verb: string, target: string, now: number): void {
    this.touchLog.push({ x: ti.x, y: ti.y, kind: ti.kind, verb, target, t: now, f: this.frames });
    if (this.touchLog.length > 256) this.touchLog.shift();
  }

  /** Do what a resolved touch says (the model's actions go into this frame's step). */
  private dispatch(r: NodeTouch, ti: TouchIn, now: number): void {
    const s = this.state;
    const phase = s.node.phase;
    switch (r.verb) {
      case 'hud':
        return;
      case 'strike': {
        this.lastContact = { x: ti.x, y: ti.y };
        if (ti.kind === 'hold' || r.via === 'sweep') {
          if (now - this.strikeStreamAt > 400) this.strikeStreamAt = now;
        } else this.strikeStreamAt = now;
        const pick = this.lastPick ?? ({ kind: 'far', point: { x: 0, y: 0, z: 0 }, dist: 12 } as Pick);
        this.scene.strike(pick, { x: ti.x, y: ti.y });
        this.fx.request('tool.swing');
        this.fx.request('strike.chips');
        const counted = this.cap.admit(now);
        if (!counted) return;
        let target: StrikeRef;
        if (phase === 'seal') target = { kind: 'seal', weak: this.lastPick?.kind === 'seal' ? this.lastPick.weak : !!this.sealView?.weakLit && r.via === 'ray' };
        else if (r.target.kind === 'face') target = { kind: 'face', col: r.target.col };
        else if (r.target.kind === 'skin') target = { kind: 'skin', id: r.target.id };
        else if (phase === 'ride') target = { kind: 'glint', id: r.target.id };
        else target = { kind: 'tappable', id: localId(r.target.id) };
        this.actions.push({ type: 'strike', target, via: ti.kind === 'hold' ? 'hold' : r.via === 'sweep' ? 'sweep' : ti.kind === 'key' ? 'key' : 'tap' });
        if (this.downFrames.length) this.pendingHitFrames.push(...this.downFrames.splice(0));
        return;
      }
      case 'relight':
        this.actions.push({ type: 'relight', lampId: localId(r.lampId) });
        return;
      case 'focus':
        if (r.input === 'open') this.actions.push({ type: 'focus', id: localId(r.id) });
        else this.actions.push({ type: 'resolve', id: localId(r.id), input: r.input });
        return;
      case 'navigation':
        if (r.nav === 'skip') {
          if (!this.cam.skip()) this.fx.skipCeremony();
          return;
        }
        if (r.nav === 'exit') {
          this.actions.push({ type: 'exit', exitId: localId(r.id) });
          return;
        }
        if (r.nav === 'station') {
          this.station(r.id);
          return;
        }
        return;
      case 'skill':
        this.actions.push({ type: 'skill', id: r.id });
        return;
      case 'tunk':
        if (r.point) this.scene.tunk(r.point);
        this.fx.request('strike.tunk');
        this.actions.push({ type: 'tunk', hint: r.hint ? localId(r.hint) : '' });
        return;
      case 'raise':
        this.scene.lanternRaise(r.point);
        this.fx.request('lantern.raise');
        this.actions.push({ type: 'raise', x: r.point.x, y: r.point.y, z: r.point.z });
        return;
      case 'walk':
        this.walkTo(r.to, r.then ?? null, r.via, ti, now);
        return;
      case 'look':
        this.cam.look(r.dx, r.dy);
        this.ex.looks++;
        return;
      case 'pulse':
        return;
    }
  }

  /** Explore: walk to a floor point (or toward an object, then act on arrival). */
  private walkTo(to: V3, then: NodeTouch | null, via: 'floor' | 'approach' | 'goal', ti: TouchIn | null, now: number): boolean {
    const nav = this.navNow();
    if (!nav) {
      if (then) this.dispatch(then, ti ?? { x: 0, y: 0, kind: 'tap', t: now, id: 0 }, now);
      return false;
    }
    const eye = this.cam.pose();
    const plan = planWalk(nav, eye, to, via === 'floor' ? {} : { actOn: to });
    if (!plan) {
      if (then) {
        // Already close enough (or no floor nearer): act now.
        this.dispatch(then, ti ?? { x: 0, y: 0, kind: 'tap', t: now, id: 0 }, now);
        return true;
      }
      this.scene.lanternRaise(to);
      this.actions.push({ type: 'raise', x: to.x, y: to.y, z: to.z });
      return false;
    }
    this.ex.walks++;
    this.scene.walkMarker(plan.end);
    this.fx.request('walk.marker');
    this.ex.marker = { ...plan.end, at: now };
    this.cam.walk(plan.eye, {
      face: then ? to : undefined,
      done: (arrived) => {
        if (!arrived) return;
        this.ex.arrivals++;
        const p = this.cam.pose();
        this.actions.push({ type: 'walk', x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });
        if (then) {
          this.ex.acts++;
          this.dispatch(then, ti ?? { x: 0, y: 0, kind: 'tap', t: performance.now(), id: 0 }, performance.now());
        }
      },
    });
    return true;
  }

  /** The camp's stations: walk there; the adit descends, the board opens the Crew sheet, the maker the Dig sheet. */
  private station(sceneId: string): void {
    // The scene names stations 'camp:<id>'; the camp placement names them '<id>'.
    const id = sceneId.replace(/^camp:/, '');
    const c = this.world?.camp();
    const st = c?.stations.find((x) => x.id === id);
    const act = () => {
      if (id === 'adit') this.actions.push({ type: 'descend' });
      else if (id === 'board') this.ui.hud.toggleSheet('crew');
      else this.ui.hud.toggleSheet('dig');
    };
    if (!st) {
      act();
      return;
    }
    const nav = this.world?.campNav();
    const plan = nav ? planWalk(nav, this.cam.pose(), st.feet, { actOn: st.pos, stopShortM: 0.6 }) : null;
    if (!plan) {
      act();
      return;
    }
    this.ex.walks++;
    this.ex.marker = { ...plan.end, at: performance.now() };
    this.scene.walkMarker(plan.end);
    this.cam.walk(plan.eye, {
      face: st.pos,
      done: (a) => {
        if (!a) return;
        this.ex.arrivals++;
        this.ex.acts++;
        act();
      },
    });
  }

  /**
   * The objective line was tapped (SPEC §6.1, W1-LEAD §3): go where the goal is done. In a chamber, walk to its target
   * (a chest, a lamp, a vein, the exit) and face it, its rim brightened; a card's goal flashes that card (or opens its
   * sheet when it is not on screen); a face goal brightens the block's rim; at the camp, walk to the adit.
   */
  private goGoal(): void {
    const s = this.state;
    const g = s.goals.current;
    const go = g.go;
    const n = s.node;
    if (go.startsWith('card:')) {
      const id = go.slice(5);
      if (!this.ui.hud.flashCard(id)) this.ui.hud.toggleSheet(id.startsWith('crew') ? 'crew' : 'dig');
      return;
    }
    if (go.startsWith('sheet:')) {
      this.ui.hud.toggleSheet(go.includes('crew') ? 'crew' : 'dig');
      return;
    }
    if (go === 'enter') {
      this.actions.push({ type: 'enter' });
      return;
    }
    if (go === 'face' || go === 'breach') {
      this.scene.rim(`face:${Math.max(0, this.weakestCol())}`, true);
      return;
    }
    if (n.phase === 'camp') {
      this.station('adit');
      return;
    }
    if (n.phase !== 'explore') return;
    const p = this.placement(n.node);
    if (!p) return;
    let pos: V3 | null = null;
    let approach: V3 | null = null;
    let rimId = '';
    const m = /^(focus|lamp|strike):(.+)$/.exec(go);
    if (m) {
      const so = p.chamber.sockets.find((x) => x.local === m[2] || x.id === m[2]);
      if (so) {
        pos = so.pos;
        approach = so.approach;
        rimId = so.id;
      }
    } else if (go === 'exit' || go === 'seal') {
      const e = p.chamber.exits[0];
      if (e) {
        pos = e.plate ?? e.pos;
        approach = e.approach;
        rimId = `n${n.node}:${e.id}`;
      }
    }
    if (!pos || !approach) return;
    if (rimId) this.scene.rim(rimId, true);
    const eye = this.cam.pose();
    if (Math.hypot(approach.x - eye.x, approach.z - eye.z) < 0.6) {
      this.cam.faceTo(pos);
      return;
    }
    const nav = this.navNow();
    const plan = nav ? planWalk(nav, eye, approach) : null;
    if (!plan) {
      this.cam.faceTo(pos);
      return;
    }
    this.ex.walks++;
    this.scene.walkMarker(plan.end);
    this.ex.marker = { ...plan.end, at: performance.now() };
    const face = { ...pos };
    this.cam.walk(plan.eye, {
      face,
      done: (arrived) => {
        if (!arrived) return;
        this.ex.arrivals++;
        const q = this.cam.pose();
        this.actions.push({ type: 'walk', x: q.x, y: q.y, z: q.z, yaw: q.yaw, pitch: q.pitch });
      },
    });
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Modes

  private setMode(m: GameMode): void {
    if (this.mode === m) return;
    this.mode = m;
    this.bus.emit('game:mode', { mode: m });
  }

  /** The first tap's fullscreen and portrait request. */
  play(): void {
    enterGameScreen();
    if (this.mode !== 'playing') this.setMode('playing');
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

  /** Android Back: close the focus pop, then the sheet; else go to the camp; at the camp let the OS exit. */
  handleBack(): boolean {
    const s = this.state;
    if (s.node.focus) {
      this.actions.push({ type: 'resolve', id: s.node.focus.id, input: 'close' });
      return true;
    }
    if (this.ui.hud.sheetOpen) {
      this.ui.hud.toggleSheet(null);
      return true;
    }
    if (s.node.phase === 'camp') return false;
    this.toCamp();
    return true;
  }

  toCamp(): void {
    this.saveNow('camp');
    enterCamp(this.state, this.events);
  }

  crash(err: unknown): void {
    if (this.mode === 'crashed') return;
    this.frameGuard.trip(err);
    this.mode = 'crashed';
    try {
      (window as unknown as { DeepDownAndroid?: { keepScreenOn(on: boolean): void } }).DeepDownAndroid?.keepScreenOn(false);
    } catch {
      // Best effort.
    }
    try {
      this.audio?.suspend();
    } catch {
      // Audio may be what failed.
    }
    window.dispatchEvent(new CustomEvent('dd:crash', { detail: err }));
  }

  saveNow(reason: string): boolean {
    if (this.mode === 'boot' || this.mode === 'crashed' || !this.state || this.savesHeld) return false;
    if (!this.frameGuard.canSave) return false;
    let ok = false;
    try {
      this.state.now = Date.now();
      const p = this.cam.pose();
      if (this.state.node.phase === 'explore' && this.cam.exploring) this.state.node.pose = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch };
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

  // ----------------------------------------------------------------------------------------------------------------
  // The frame

  private readonly pendingHitFrames: number[] = [];
  private stepDist = 0;

  private readonly frameLoop = (now: number): void => {
    if (this.mode === 'crashed') return;
    requestAnimationFrame(this.frameLoop);
    const idle = (now - this.lastInput > IDLE_CAP_AFTER_S * 1000 && !this.cam.moving) || this.mode === 'paused';
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
    const playing = this.mode === 'playing';
    const s = this.state;
    // 1. Input: the drag steps and the hold stream, then every queued gesture (presses act this frame, L1).
    if (playing) {
      this.taps.holdsEnabled = !this.ui.hud.returnShown;
      this.taps.update(now, holdRate(s.run.ups.steady ?? 0, s.tap.surgeEnd > s.time));
      this.taps.drain((e) => this.touch(e, now));
    } else this.taps.drain(() => {});
    // 2. The model: fixed 1/60 s steps, ≤ 4 a frame; a frame with actions always steps (the hit shows now).
    if (playing) {
      this.acc += dt * this.modelScale;
      let n = Math.min(4, Math.floor(this.acc / STEP_DT + 1e-6));
      if (n === 0 && this.actions.length) n = 1;
      for (let i = 0; i < n; i++) {
        const acts = i === 0 ? this.actions.splice(0) : [];
        stepIdle(s, STEP_DT, NO_TAPS, acts, this.events, Date.now());
        this.acc -= STEP_DT;
      }
      if (this.actions.length && n === 0) for (const a of this.actions.splice(0)) applyNodeAction(s, a, this.events);
      if (this.acc < 0) this.acc = 0;
      if (this.acc > STEP_DT * 4) this.acc = STEP_DT * 4;
    }
    if (this.pendingReturn && this.state.offline && !this.state.offline.collected && !this.ui.hud.returnShown) this.playReturn();
    // 3. The camera (never on the FX clock: hit-stops do not freeze it).
    this.cam.motion = this.settings.motion === 'full' ? 'full' : 'reduced';
    this.cam.creepVariant = this.prefs.creep;
    const before = this.cam.pose();
    const bx = before.x;
    const bz = before.z;
    this.cam.update(dt);
    if (this.cam.walkKind === 'walk') {
      const a = this.cam.pose();
      this.stepDist += Math.hypot(a.x - bx, a.z - bz);
      if (this.stepDist >= 0.62) {
        this.stepDist = 0;
        this.audio.play('step');
      }
    } else this.stepDist = 0.3;
    if (this.lightGlide) this.scene.firstLight(this.lightGlide.node, Math.min(1, this.cam.progress));
    // The world: dig the drift slices the model cleared, stream the slabs around the eye, upload the changed light.
    if (this.deep) {
      if (s.run.depth > this.deep.dugTo) this.deep.digTo(s.run.depth);
      this.deep.update(this.cam.pose().y);
      this.irr?.apply(this.deep.consumeLightRows(), this.renderer.gl);
    }
    // 4. The FX director (the scene's live counts) and the FX clock.
    this.fx.frame(now, this.scene.stats().fx);
    const fxDt = this.fx.fxDt(dt);
    // 5. The scene.
    const p = this.cam.pose();
    const view: ScenePose = { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, hfov: p.hfov, xfade: this.cam.fade, shot: this.cam.shot as ScenePose['shot'] };
    this.scene.dim(s.node.focus ? 0.3 : this.ui.hud.sheetOpen ? 0.3 : 0);
    this.scene.frame(dt, fxDt, view);
    if (this.pendingHitFrames.length) {
      for (const f of this.pendingHitFrames.splice(0)) this.tapFrames.push(this.frames - f);
      while (this.tapFrames.length > 64) this.tapFrames.shift();
    }
    this.ui.setFade(this.cam.fade);
    // 6. The token canvas and the HUD.
    this.ui.fx.frame(now, dt);
    this.ui.hud.update(this.hudFrame(now), now);
    // 7. Audio.
    this.updateAudio(dt, now);
    // 8. Autosave.
    if (this.mode === 'playing') {
      this.autosave -= dt;
      if (this.saveSoon > 0) {
        this.saveSoon -= dt;
        if (this.saveSoon <= 0) this.saveNow('soon');
      }
      if (this.autosave <= 0) this.saveNow('auto');
    }
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

  private updateAudio(dt: number, now: number): void {
    const s = this.state;
    const b = playerBiome(s);
    const w = this.audioWorld;
    w.depth = playerDepth(s);
    w.biome = b;
    w.music = biomeDef(b).music;
    w.inMenu = s.node.phase === 'camp';
    w.nearFire = s.node.phase === 'camp' ? 1 : 0;
    w.openness = s.node.phase === 'explore' ? 0.7 : 0.3;
    w.drums = s.node.phase === 'seal' ? 1 : 0;
    w.boss = 0;
    w.plucks = now - this.lastInput < 5000;
    this.audio.update(dt, w);
  }

  private awakeSent: boolean | null = null;
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

  // ----------------------------------------------------------------------------------------------------------------
  // The HUD's view

  private cardOf(c: CardView | null, slot: 'pick' | 'best', shown: Big): HudCard | null {
    if (!c || c.locked) return null;
    const title = tx(c.nameKey, c.nameParams) || c.id;
    let sub = '';
    if (c.id === 'pick') sub = t('hy.card.pickSub', { level: c.level, after: format(c.after) });
    else if (c.id.startsWith('crew:')) sub = c.level === 0 ? t('hy.card.hire', { after: format(c.after) }) : t('hy.card.lineSub', { level: c.level, after: format(c.after) });
    else sub = t('hy.card.gearSub');
    const progress = c.cost.isZero() ? 1 : Math.min(1, Math.pow(10, Math.min(0, (shown.isZero() ? -Infinity : shown.log10()) - c.costLog10)));
    return { slot, id: c.id, title, sub, price: format(c.cost), ready: !c.maxed && shown.cmp(c.cost) >= 0, progress, best: c.best };
  }

  private hudFrame(now: number): HudFrame {
    const s = this.state;
    const shown = this.gold.shown(s.run.gold);
    const b = playerBiome(s);
    const g = s.goals.current;
    const seal = s.seal && s.seal.phase === 'fight';
    const text = tx(g.key, g.params) || (s.node.phase === 'camp' ? t('hy.camp.goal') : '');
    // The two cards: the Pick (once the tutorial reached it) and BEST (once a crew line can be hired).
    const reachedPick = s.run.pick > 1 || s.tutorial.index >= 2 || s.tutorial.done || s.meta.lifetime.gold.cmp(Big.from(30)) >= 0;
    const pick = reachedPick ? this.cardOf(card(s, 'pick'), 'pick', shown) : null;
    let bestCard: CardView | null = null;
    const bId = best(s);
    if (bId && bId !== 'pick') bestCard = card(s, bId);
    else {
      let pb = Infinity;
      for (const c of sheetCards(s, 'crew')) if (!c.locked && !c.maxed && c.payback < pb) {
        pb = c.payback;
        bestCard = c;
      }
    }
    const reachedBest = s.run.lines.some((x) => x > 0) || s.meta.lifetime.gold.cmp(Big.from(50)) >= 0 || s.tutorial.done;
    const bestView = reachedBest ? this.cardOf(bestCard, 'best', shown) : null;
    return {
      depth: t('hy.depth', { depth: playerDepth(s) }),
      biome: tx(`idle.biome.${BIOMES[b]?.id ?? ''}`) || '',
      gold: format(shown),
      rate: now < this.rateUntil ? t('hy.rate', { rate: formatRate(s.rates.goldPerSec) }) : '',
      goal: {
        id: g.id,
        text,
        fill: g.fill,
        icon: seal ? 'seal' : g.icon,
        reward: tx(g.reward, g.rewardParams),
        ring: seal && s.seal ? { left: s.seal.left, time: sealTimeLeft(s) } : null,
      },
      cards: [pick, bestView],
      badge: false,
      skip: this.cam.walkKind === 'ride' && this.cam.skippable,
      ceremony: this.fx.ceremony === 'reveal' || this.fx.ceremony === 'seal' || this.ui.hud.returnShown,
    };
  }

  private hudHooks(): HudHooks {
    return {
      buy: (id, repeat) => {
        const r = buy(this.state, id, 'x1', this.events);
        if (r.ok) {
          this.haptics.play('buy');
          this.lastInput = performance.now();
        } else if (!repeat) this.audio.ui('no');
        return r.ok;
      },
      goal: () => this.goGoal(),
      sheet: (tab) => {
        this.audio.ui(tab ? 'open' : 'close');
        this.taps.reset();
      },
      skip: () => {
        if (!this.cam.skip()) this.fx.skipCeremony();
      },
      rows: (tab) => this.sheetRows(tab),
      settings: () => this.settingsRows(),
      setSetting: (id, v) => this.setSetting(id, v),
      collect: () => {
        collectOffline(this.state, this.events);
        this.saveSoon = 0.5;
      },
      toCamp: () => this.toCamp(),
    };
  }

  private sheetRows(tab: 'dig' | 'crew'): SheetRow[] {
    const s = this.state;
    const shown = this.gold.shown(s.run.gold);
    return sheetCards(s, tab).map((c) => ({
      id: c.id,
      title: tx(c.nameKey, c.nameParams) || c.id,
      sub: c.locked ? t('hy.card.locked', { depth: c.unlockDepth }) : tx(c.descKey, c.descParams),
      level: c.maxed ? t('hy.row.maxed') : t('hy.row.level', { level: c.level }),
      price: c.locked || c.maxed ? '' : format(c.cost),
      ready: !c.locked && !c.maxed && shown.cmp(c.cost) >= 0,
      locked: c.locked,
      best: c.best,
    }));
  }

  private settingsRows(): SettingsRow[] {
    const st = this.settings;
    const seg = (prefix: string, values: string[]) => values.map((v) => ({ value: v, label: t(`${prefix}.${v}` as TextKey) }));
    return [
      { id: 'motion', label: t('hy.set.motion'), options: seg('hy.set.motion', ['full', 'reduced', 'off']), value: st.motion },
      { id: 'creep', label: t('hy.set.creep'), options: seg('hy.set.creep', ['A', 'B']), value: this.prefs.creep },
      { id: 'cameraShake', label: t('hy.set.shake'), range: true, value: st.cameraShake },
      { id: 'hapticStrength', label: t('hy.set.haptics'), options: seg('hy.set.haptics', ['off', 'light', 'normal', 'strong']), value: st.vibration ? st.hapticStrength : 'off' },
      { id: 'masterVolume', label: t('hy.set.master'), range: true, value: st.masterVolume },
      { id: 'musicVolume', label: t('hy.set.music'), range: true, value: st.musicVolume },
      { id: 'sfxVolume', label: t('hy.set.sfx'), range: true, value: st.sfxVolume },
      { id: 'quality', label: t('hy.set.quality'), options: seg('hy.set.quality', ['battery', 'balanced', 'high']), value: st.quality },
      { id: 'leftHanded', label: t('hy.set.hand'), options: seg('hy.set.hand', ['right', 'left']), value: st.leftHanded ? 'left' : 'right' },
      { id: 'textSize', label: t('hy.set.text'), options: seg('hy.set.text', ['normal', 'large']), value: st.textSize },
      { id: 'highContrast', label: t('hy.set.contrast'), options: seg('hy.set.contrast', ['normal', 'high']), value: st.highContrast ? 'high' : 'normal' },
    ];
  }

  private setSetting(id: string, v: string | number): void {
    switch (id) {
      case 'creep':
        this.prefs = { ...this.prefs, creep: v === 'B' ? 'B' : 'A' };
        savePrefs(this.prefs);
        return;
      case 'hapticStrength':
        this.updateSettings({ hapticStrength: v as Settings['hapticStrength'], vibration: v !== 'off' });
        return;
      case 'leftHanded':
        this.updateSettings({ leftHanded: v === 'left' });
        return;
      case 'highContrast':
        this.updateSettings({ highContrast: v === 'high' });
        return;
      case 'cameraShake':
      case 'masterVolume':
      case 'musicVolume':
      case 'sfxVolume':
        this.updateSettings({ [id]: Number(v) } as Partial<Settings>);
        return;
      default:
        this.updateSettings({ [id]: v } as Partial<Settings>);
    }
  }

  // ----------------------------------------------------------------------------------------------------------------
  // Layout, settings, lifecycle

  private layout(): void {
    const probe = getComputedStyle(document.documentElement);
    const px = (v: string) => Number.parseFloat(v) || 0;
    const safeTop = px(probe.getPropertyValue('--safe-top-px')) || this.safeInset('top');
    const safeBottom = px(probe.getPropertyValue('--safe-bottom-px')) || this.safeInset('bottom');
    this.ui.hud.setLayout(window.innerWidth, window.innerHeight, safeTop, safeBottom, this.settings.textSize === 'large');
    this.frameCache = null;
  }

  private safeInset(side: 'top' | 'bottom'): number {
    const el = document.createElement('div');
    el.style.cssText = `position:fixed;left:0;width:0;${side}:0;height:env(safe-area-inset-${side}, 0px);visibility:hidden;pointer-events:none`;
    document.body.appendChild(el);
    const v = el.getBoundingClientRect().height;
    el.remove();
    return v;
  }

  private tapRegion() {
    const l = this.ui.hud.layout;
    const bottom = this.ui.hud.sheetOpen ? Math.min(l.region.bottom, l.sheetTop) : l.region.bottom;
    return { top: l.region.top, bottom, left: 0, right: l.width };
  }

  updateSettings(patch: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    this.saves.saveSettings(this.settings);
    if (patch.quality && patch.quality !== prev.quality) this.renderer.setQuality(patch.quality);
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
    if (this.ui) {
      this.ui.fx.motion = s.motion;
      this.ui.fx.tokenCap = TOKENS_IN_FLIGHT[s.quality];
    }
    this.scene?.viewmodel.set({ mirror: s.leftHanded });
  }

  private wireLifecycle(): void {
    let lastBg = -Infinity;
    const bgSave = (reason: string) => {
      if (performance.now() - lastBg >= 1000 && this.saveNow(reason)) lastBg = performance.now();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        bgSave('background');
        this.audio.suspend();
        if (this.mode === 'playing') this.pause();
      } else {
        this.audio.resume();
        if (this.mode === 'paused') this.resume();
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
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('pointerdown', () => (this.lastInput = performance.now()), { passive: true, capture: true });
    window.addEventListener('keydown', (e) => this.onKey(e));
    (window as unknown as { deepDownBack: () => boolean }).deepDownBack = () => this.handleBack();
    this.disposers.push(
      () => document.removeEventListener('visibilitychange', onVis),
      () => window.removeEventListener('pagehide', onHide),
      () => window.removeEventListener('resize', onResize),
    );
  }

  /** Desktop keys (tests only, SPEC §2.7): 1–7 strike blocks, Space the suggestion, E the exit, R a lamp, B BEST, Esc Back. */
  private onKey(e: KeyboardEvent): void {
    if (this.mode !== 'playing') return;
    const k = e.key;
    this.lastInput = performance.now();
    if (k === 'Escape') {
      this.handleBack();
      return;
    }
    const s = this.state;
    if (/^[1-7]$/.test(k) && s.node.phase === 'dig') {
      this.actions.push({ type: 'strike', target: { kind: 'face', col: Number(k) - 1 }, via: 'key' });
      return;
    }
    if (k === 'e' || k === 'E') {
      const ex = this.placement(s.node.node)?.chamber.exits[0];
      if (ex && s.node.phase === 'explore') this.actions.push({ type: 'exit', exitId: ex.id });
      return;
    }
    if (k === 'b' || k === 'B') {
      const b = best(s);
      if (b) buy(s, b, 'x1', this.events);
    }
  }

  // ----------------------------------------------------------------------------------------------------------------
  // The focus panel

  private showFocusPanel(node: number, id: string, kind: string): void {
    const con = contentsOf(this.state, node);
    const sc = con.sockets[id];
    if (kind === 'chest') this.ui.hud.focus(t('hy.focus.chest', { tier: tx(`idle.chest.${['wood', 'copper', 'crystal', 'reliquary', 'lintel'][sc?.floor ?? 0]}`) || '' }).trim(), t('hy.focus.chestOpen'), 'chest');
    else if (kind === 'relic') this.ui.hud.focus(tx(`idle.find.${sc?.relic ?? ''}`) || t('hy.focus.relic'), t('hy.focus.relic'), 'relic');
    else if (kind === 'note' || kind === 'mural') this.ui.hud.focus(t('hy.focus.note'), tx(sc?.lore ?? '') || tx(`idle.lore.${sc?.lore ?? ''}`), 'note');
  }

  // ----------------------------------------------------------------------------------------------------------------
  // The debug surface (SPEC §13.3)

  private debugApi(): HybridDebug {
    const g = this;
    const rect = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, w: r.w, h: r.h });
    const allowed = () => debugMutationsAllowed();
    return {
      get ready() {
        return g.ready && g.frames > 0;
      },
      mode: () => g.mode,
      state: () => JSON.parse(JSON.stringify(stateToSave(g.state))),
      node: () => {
        const v = nodeView(g.state);
        return {
          node: v.node,
          phase: g.fx?.ceremony === 'reveal' ? 'reveal' : touchPhaseOf(v.phase),
          stand: v.stand,
          slice: v.sliceIndex,
          slices: v.K,
          biome: v.topo.biome,
          kind: v.topo.fixed || v.topo.kind,
          leashOpen: v.leashOpen,
          lit: v.lit,
          seen: v.seen,
          charted: v.charted,
          lamps: v.lamps,
          depth: v.digDepth,
        };
      },
      phase: () => touchPhaseOf(g.state.node.phase),
      faceCells: () => g.scene.faceCells().map((c) => ({ col: c.col, slice: c.slice, rect: rect(c.rect), left: c.left, kind: c.kind })),
      tappables: () =>
        g.targets()
          .filter((x) => (x.type === 'tappable' || x.type === 'lamp') && x.visible)
          .map((x) => ({ id: x.id, kind: x.type === 'lamp' ? 'lamp' : x.kind, rect: rect(x.drawn), hit: rect(x.hit), rimmed: false, dist: x.dist, left: 1 - (x.state ?? 0) })),
      nav: () => g.targets().filter((x) => x.type === 'nav' && x.visible).map((x) => ({ id: x.id, kind: x.kind as never, rect: rect(x.drawn), hit: rect(x.hit), dist: x.dist })),
      explore: () => {
        const p = g.cam.pose();
        return { on: g.cam.exploring, walking: g.cam.walking, kind: g.cam.walkKind, pos: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch }, end: g.cam.walkEnd(), marker: g.ex.marker, walks: g.ex.walks, arrivals: g.ex.arrivals, actsOnArrival: g.ex.acts, looks: g.ex.looks };
      },
      floorPoints: (n = 8, minM = 2, maxM = 10) => {
        const out: Array<{ x: number; y: number; at: { x: number; y: number; z: number }; dist: number }> = [];
        const nav = g.navNow();
        if (!nav) return out;
        const l = g.ui.hud.layout;
        const plates = g.ui.hud.plates().filter((q) => q.visible).map((q) => q.rect);
        for (let yy = l.region.bottom - 20; yy > l.region.top + 40 && out.length < n; yy -= 24) {
          for (let xx = 40; xx < l.width - 40 && out.length < n; xx += 36) {
            if (plates.some((r) => xx >= r.x && xx < r.x + r.w && yy >= r.y && yy < r.y + r.h)) continue;
            const pk = g.scene.pick(xx, yy);
            if (pk.kind !== 'floor' || pk.dist < minM || pk.dist > maxM) continue;
            const at = snapToFloor(nav, pk.point, 1.0);
            if (at) out.push({ x: xx, y: yy, at, dist: pk.dist });
          }
        }
        return out;
      },
      ride: () => {
        const r = g.state.node.ride;
        const glints = g.targets().filter((x) => x.type === 'tappable' && x.kind === 'glint' && x.visible);
        const l = g.ui.hud.layout;
        return {
          on: !!r,
          kind: r?.kind ?? '',
          progress: g.cam.walkProgress,
          glints: glints.map((x) => ({ id: x.id, rect: rect(x.drawn), hit: rect(x.hit), left: 1 - (x.state ?? 0), dist: x.dist })),
          skip: g.cam.walkKind === 'ride' && g.cam.skippable ? rect(l.skip) : null,
        };
      },
      camera: (withLog = false) => {
        const c = g.scene.camera;
        c.updateMatrixWorld(true);
        const p = g.cam.pose();
        return {
          view: Array.from(c.matrixWorldInverse.elements),
          shot: g.cam.shot,
          moving: g.cam.moving,
          move: g.cam.running || (g.cam.walkKind as never) || '',
          pose: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, roll: p.roll, hfov: p.hfov },
          fade: g.cam.fade,
          log: withLog ? g.cam.log() : undefined,
          started: g.cam.started.slice(-32),
        };
      },
      clearCameraLog: () => g.cam.clearLog(),
      goal: () => {
        const gv = g.state.goals.current;
        return { text: tx(gv.key, gv.params), fill: gv.fill, id: gv.id, visible: !!g.ui.hud.el.querySelector('[data-hud="goal"]') };
      },
      fx: () => {
        const c = g.fx.counts();
        return {
          foreground: c.fg,
          ambient: c.ambient,
          particles: c.particles,
          particleArea: c.area,
          shards: c.shards,
          floating: c.number,
          uiLoops: c.loop,
          ceremony: g.fx.ceremony,
          ceremonies: g.fx.played.slice(),
          shakes: g.fx.shakes.slice(),
          refused: { ...g.fx.refused },
        };
      },
      hud: () => {
        const rects: Record<string, { x: number; y: number; w: number; h: number; visible: boolean }> = {};
        for (const p of g.ui.hud.plates()) rects[p.id] = { ...p.rect, visible: p.visible };
        const nums = g.ui.hud.numbers();
        let minBody = Infinity;
        for (const el of Array.from(g.ui.hud.el.querySelectorAll<HTMLElement>('.hy-goal-text, .hy-card-title, .hy-depth-num, .hy-gold-num'))) {
          if (!el.offsetParent) continue;
          minBody = Math.min(minBody, Number.parseFloat(getComputedStyle(el).fontSize));
        }
        return {
          rects,
          plateArea: g.ui.hud.plateArea(),
          numbers: nums.persistent,
          transient: nums.transient,
          minBodyPx: Number.isFinite(minBody) ? minBody : 0,
          sheet: g.ui.hud.sheetTab ?? '',
          firstTime: g.ui.hud.noteText,
          returnPlate: g.ui.hud.returnPhase,
          focus: g.ui.hud.focusText,
          cards: g.ui.hud.cardViews(),
          notice: '',
        };
      },
      events: (name?: string) => (name ? g.recent.filter((e) => e.name === name) : g.recent.slice()),
      clearEvents: () => {
        g.recent.length = 0;
      },
      frame: () => g.frames,
      lastTapFrames: () => g.tapFrames.slice(),
      lastTouches: () => g.touchLog.slice(),
      advance: (seconds: number) => {
        if (!allowed()) return;
        const steps = Math.min(36000, Math.round(seconds / STEP_DT));
        for (let i = 0; i < steps; i++) stepIdle(g.state, STEP_DT, NO_TAPS, [], g.events, Date.now());
      },
      setNode: (i: number, at: 'drift' | 'chamber' | 'breach' = 'drift') => {
        if (!allowed()) return;
        setPlayerNode(g.state, i, at === 'chamber' ? 'explore' : at === 'breach' ? 'breach' : 'dig', g.events);
        g.scene.setPiece('descent');
        g.stageForPhase();
      },
      standAt: (what: string) => {
        if (!allowed()) return false;
        const n = g.state.node;
        if (n.phase !== 'explore') return false;
        const p = g.placement(n.node);
        if (!p) return false;
        let from: V3 | null = null;
        let to: V3 | null = null;
        if (what === 'exit') {
          const e = p.chamber.exits[0];
          if (e) {
            from = e.approach;
            to = e.plate ?? e.pos;
          }
        } else {
          const so = p.chamber.sockets.find((x) => x.local === what || x.id === what);
          if (so) {
            from = so.approach;
            to = so.pos;
          }
        }
        if (!from || !to) return false;
        const eyeY = from.y + 1.6;
        const yaw = Math.atan2(-(to.x - from.x), -(to.z - from.z));
        const pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(to.y - eyeY, Math.hypot(to.x - from.x, to.z - from.z))));
        g.cam.exitExplore();
        g.cam.place(makePose(from.x, eyeY, from.z, yaw, pitch), 'explore');
        g.cam.enterExplore();
        return true;
      },
      give: (p: { gold?: number | string; gems?: number }) => {
        if (!allowed()) return;
        if (p.gold !== undefined) {
          const amt = typeof p.gold === 'string' ? Big.fromLog10(Number(p.gold.replace(/^1e/, ''))) : Big.from(p.gold);
          g.state.run.gold = g.state.run.gold.add(amt);
          g.gold.settle();
        }
        if (p.gems) g.state.meta.gems += p.gems;
      },
      offline: (hours: number) => {
        if (!allowed()) return;
        g.saveNow('offline');
        const raw = localStorage.getItem('deepdown.save.pointer');
        void raw;
        g.savesHeld = true;
        const store = new LocalStorageStore();
        const sys = new SaveSystem(store);
        const res = sys.load();
        if (res.data) {
          res.data.savedAt -= hours * 3600_000;
          sys.save(res.data);
        }
        location.reload();
      },
      toSeal: () => {
        if (!allowed()) return;
        const s = g.state;
        for (let i = s.node.node; i < s.node.node + 40; i++) {
          const tp = nodeAt(s.seed, i);
          if (tp.exitSeal) {
            setPlayerNode(s, i, 'explore', g.events);
            g.stageForPhase();
            return;
          }
        }
      },
      skipTutorial: () => {
        if (!allowed()) return;
        g.state.tutorial.index = 999;
        g.state.tutorial.done = true;
      },
      settings: (patch?: Record<string, unknown>) => {
        if (patch && allowed()) {
          const { creep, ...rest } = patch as Record<string, unknown> & { creep?: 'A' | 'B' };
          if (creep) g.setSetting('creep', creep);
          if (Object.keys(rest).length) g.updateSettings(rest as Partial<Settings>);
        }
        return { ...g.settings, creep: g.prefs.creep };
      },
      timeScale: (k?: number) => {
        if (k !== undefined && allowed()) g.modelScale = Math.max(0, k);
        return g.modelScale;
      },
      perf: () => {
        const ft = g.frameTimes.slice().sort((a, b) => a - b);
        const st = g.scene.stats();
        return { frameMs: g.frameMs, p95FrameMs: ft[Math.floor(ft.length * 0.95)] ?? 0, fps: g.fps, calls: st.calls, tris: st.tris };
      },
      save: () => g.saveNow('debug'),
    };
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers.length = 0;
    this.taps?.dispose();
    this.scene?.dispose();
    this.ui?.dispose();
    this.audio?.dispose();
  }
}

/** A resolved touch as one short string (the touch log). */
function describe(r: NodeTouch): string {
  switch (r.verb) {
    case 'strike':
      return r.target.kind === 'face' ? `face:${r.target.col}` : r.target.id;
    case 'relight':
      return r.lampId;
    case 'focus':
      return `${r.id}:${r.input}`;
    case 'navigation':
      return `${r.nav}:${r.id}`;
    case 'skill':
      return r.id;
    case 'walk':
      return `${r.via}${r.then ? `>${describe(r.then)}` : ''}`;
    case 'look':
      return `${r.dx},${r.dy}`;
    default:
      return '';
  }
}

/** The seal approach: a short glide to the seal pose (the law's pace). */
function revealMoveTo(from: CameraPose, to: CameraPose) {
  const m = revealMove(from, to);
  // No pitch lift on the seal approach: drop the reveal's lift phase.
  return { ...m, shot: 'stand' as const, phases: m.phases.filter((p) => !(p.k === 'rotate' && p.lift)) };
}

void biomeAt;
