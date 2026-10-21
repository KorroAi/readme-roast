import * as THREE from 'three';
import { B, BLOCKS } from '../config/blocks';
import { PLAYER, SAVE, WORLD, lanternForTier, packForTier, pickaxeForTier } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import { NODES, type NodeId, type Place } from '../config/recipes';
import { EventBus, type GameEvents } from '../core/events';
import { clamp, damp, dampAngle } from '../core/math';
import { raycastVoxels } from '../world/raycast';
import { Rng } from '../core/rng';
import { t, type TextKey } from '../i18n';
import { DesktopInput } from '../input/DesktopInput';
import { consumeEdges, createInputState, type InputState } from '../input/types';
import { Renderer } from '../render/Renderer';
import type { PropSpec, Region } from '../world/gen/types';
import type { GameUi, UiFactory } from './GameUi';
import type { HudState, InventoryView, JournalTab, SaveSummary, UiActions } from '../ui/types';
import { AudioSystem } from '../audio/AudioSystem';
import { Backpack } from '../gameplay/Inventory';
import { CampStorage } from '../gameplay/Storage';
import { Equipment } from '../gameplay/Equipment';
import { Lantern } from '../gameplay/Lantern';
import { Health } from '../gameplay/Health';
import { MiningProgress, rollDrop } from '../gameplay/Mining';
import { Objectives } from '../gameplay/Objectives';
import { Journal } from '../gameplay/Journal';
import { SaveSystem, LocalStorageStore } from '../save/SaveSystem';
import { shiftWorldIfNeeded } from '../save/saveData';
import { DEFAULT_SETTINGS, type ItemCounts, type SaveData, type Settings } from '../save/types';
import { CameraRig, clearOfRock } from './CameraRig';
import { Viewmodel } from './fp/Viewmodel';
// VIS: light beams and ambient wonder.
import { LightBeams, beamsFor, zoneAnchorsFor } from './effects/LightBeams';
import { Ambience } from './effects/Ambience';
import { EYE_HEIGHT } from './fp/constants';
import { PlayerController } from './PlayerController';
import { MiningController } from './MiningController';
import { DropSystem } from './Drops';
import { DebrisSystem } from './effects/Debris';
import { ParticleSystem } from './effects/Particles';
import { TargetMarker } from './effects/TargetMarker';
import { Waterfall } from './effects/Waterfall';
import { HaloSystem, collectWorldLights, type HaloSource } from './effects/Halos';
import { WorldSession } from './WorldSession';
import { installDebugApi } from '../debug/DebugApi';
import { enterGameScreen } from '../ui/screenFormat';
import { Haptics } from '../ui/haptics';
import { Progression, summarizeSave } from './Progression';
import { MENU_FPS, MenuCamera, menuExplorerPose } from './MenuCamera';
import { FrameGuard } from './FrameGuard';
import { WorldFeatures } from './WorldFeatures';
import { TapController } from './TapController';
import { VERSION } from '../version';

/** 'crashed': the frame guard tripped (three failed frames in a row); the loop has stopped. */
export type GameMode = 'boot' | 'menu' | 'playing' | 'paused' | 'dead' | 'crashed';

const INTERACT_RANGE = 2.4;

/**
 * Owns every system and runs the frame loop. Systems communicate through the EventBus;
 * the UI only reads snapshots (HudState, InventoryView) and requests actions (UiActions).
 */
export class Game {
  readonly bus = new EventBus<GameEvents>();
  readonly input: InputState = createInputState();
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly saves = new SaveSystem(new LocalStorageStore());
  settings: Settings = { ...DEFAULT_SETTINGS };
  mode: GameMode = 'boot';

  // Created during boot.
  session!: WorldSession;
  ui!: GameUi;
  audio!: AudioSystem;
  private haptics: Haptics | null = null;
  /** Seconds since the look input last moved (touch camera follow waits for it). */
  private lookStill = 0;
  /** Tap to act on touch: tap a block to mine it, ground to walk there, an object to use it. */
  private tap!: TapController;
  /** When the last background/pagehide save succeeded (one backgrounding saves once). */
  private lastBackgroundSaveAt = -Infinity;
  desktop!: DesktopInput;
  cameraRig!: CameraRig;
  player!: PlayerController;
  /** First person: the pickaxe and the lantern in view (the explorer is never drawn). */
  viewmodel!: Viewmodel;
  mining!: MiningController;
  miningRules = new MiningProgress();
  drops!: DropSystem;
  debris!: DebrisSystem;
  particles!: ParticleSystem;
  marker!: TargetMarker;
  waterfall: Waterfall | null = null;
  private menuCamera: MenuCamera | null = null;
  halos!: HaloSystem;
  /** World variety: rides, rune doors, Halden logs, the black stone, moths, the living rock. */
  features!: WorldFeatures;
  private halosDirty = false;
  private staticHalos: HaloSource[] | null = null;

  // Progress state.
  backpack = new Backpack(packForTier(1).slots);
  storage = new CampStorage();
  equipment = new Equipment();
  lanternFuel = new Lantern(lanternForTier(1).fuelSeconds);
  health = new Health(PLAYER.maxHealth);
  objectives = new Objectives();
  journal = new Journal();
  stats = { blocksMined: 0, deaths: 0, itemsBanked: 0 };
  playTime = 0;
  /** Trips, records, the cache, the cold, the walk-home field and the Next line. */
  readonly progression = new Progression(this);
  /** Stops the loop and raises 'dd:crash' after three failed frames in a row. */
  readonly frameGuard = new FrameGuard((err) => this.crash(err));

  readonly rng = new Rng(0x5eed);
  private time = 0;
  private lastFrame = 0;
  private lastStep = 0;
  private frameAccumulator = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  fps = 0;
  frameMs = 0;
  private atCamp = false;
  /** Last screen-on state sent to the Android shell (null: none yet, so the first frame sends it). */
  private keepAwake: boolean | null = null;
  /** A New Game / Continue load is in progress (Back and repeated taps are ignored). */
  private loading = false;
  private autosaveTimer: number = SAVE.autosaveSeconds;
  private focusedProp: PropSpec | null = null;
  private lanternPos = new THREE.Vector3();
  private lanternSmoothed = new THREE.Vector3();
  private healthLowWarned = false;
  private campRegenCarry = 0;
  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly lightGuard = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private disposers: Array<() => void> = [];
  ready = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
    private readonly createUi: UiFactory,
  ) {
    this.settings = this.saves.loadSettings();
    this.renderer = new Renderer(canvas, this.settings.quality);
    this.renderer.renderScaleOverride = this.settings.renderScale;
    this.renderer.setUserBloom(this.settings.bloom);
    this.renderer.setBrightness(this.settings.brightness);
    this.renderer.resize();
  }

  // ------------------------------------------------------------------------------------
  // Boot

  async boot(): Promise<void> {
    this.ui = this.createUi(this.uiRoot, this.createActions(), this.bus, this.input);
    this.ui.applySettings(this.settings);
    this.ui.showScreen('loading');
    this.ui.setLoading(0, t('menu.loading'));
    this.audio = new AudioSystem(this.bus);
    this.applyAudioSettings();
    this.haptics = new Haptics(this.bus, () => this.settings.vibration && this.input.lastDevice === 'touch' && this.mode === 'playing');

    this.session = await WorldSession.create((p, phase) => {
      const label: TextKey = phase === 'carve' ? 'menu.loading' : phase === 'light' ? 'menu.loadingLight' : 'menu.loadingMesh';
      this.ui.setLoading(p, t(label));
    });
    const s = this.session;
    const layout = s.layout;
    this.scene.add(s.chunks.group, s.props.group);
    this.cameraRig = new CameraRig(s.world);
    this.player = new PlayerController(s.world);
    this.viewmodel = new Viewmodel();
    this.viewmodel.setVisible(false);
    this.scene.add(this.viewmodel.group);
    const preset = this.renderer.preset;
    this.drops = new DropSystem(s.world, s.rig.uniforms, s.atlas);
    this.debris = new DebrisSystem(s.world, s.rig.uniforms, preset.particleBudget);
    this.particles = new ParticleSystem(s.rig.uniforms, preset.particleBudget);
    this.marker = new TargetMarker(s.tileTexture, s.terrain);
    this.scene.add(this.drops.group, this.debris.group, this.particles.group, this.marker.group);
    s.chunks.viewDistance = preset.viewDistance;
    s.props.viewDistance = preset.viewDistance;
    const ft = layout.landmarks.fallTop;
    const fb = layout.landmarks.fallBottom;
    if (ft && fb) {
      this.waterfall = new Waterfall(s.rig.uniforms, new THREE.Vector3(...ft), new THREE.Vector3(...fb));
      this.scene.add(this.waterfall.group);
    }
    this.halos = new HaloSystem(s.rig.uniforms, this.haloSources());
    this.scene.add(this.halos.mesh);
    // VIS: light beams (the only volumetric light: the rift's rising light, the Spindle, the tablet)
    // and the deep zones' own air.
    const visLandmarks = s.layout.landmarks as Record<string, readonly number[] | undefined>;
    this.scene.add(new LightBeams(s.rig.uniforms, s.terrain.noiseTex, beamsFor(visLandmarks)).mesh);
    s.rig.setZoneAnchors(zoneAnchorsFor(visLandmarks));
    // VIS: ambient wonder (drips, glow caps, the deep glows and the monotone spaces' focal glows).
    this.scene.add(new Ambience(s.rig.uniforms, s.world, s.layout.content?.ambient ?? [], visLandmarks).group);
    this.features = new WorldFeatures(this);
    this.scene.add(this.features.moths.mesh, this.features.cage);
    this.menuCamera = new MenuCamera(layout.landmarks.ledge);

    this.mining = new MiningController(s.world, this.bus, this.miningRules, {
      blockBroken: (x, y, z, oldId) => this.onBlockBroken(x, y, z, oldId),
      propBroken: (spec) => this.onPropBroken(spec),
      rollDrop: (drop) => rollDrop(drop, this.rng),
      pickaxe: () => pickaxeForTier(this.equipment.tiers.pickaxe),
      swing: (d, contact, point) => this.viewmodel.swing(d, contact, point, this.cameraRig.camera),
      // A tapped block off to the side comes into view as it is mined (never while a finger holds:
      // the block under the finger would slide away).
      face: (x, y, z, dt) => {
        if (this.input.lock && !this.input.mining && this.lookStill > 0.3) this.cameraRig.faceToward(x, y, z, dt, 3.5, 16);
      },
      hint: (text) => this.ui.hint(text, 2600),
      propRaycast: (o, d, m) => s.props.raycast(o, d, m),
      propById: (id) => s.liveProps.get(id) ?? null,
      propFlash: (id) => s.props.flash(id),
    }, this.marker, this.debris, this.particles, this.drops, this.cameraRig, this.rng);
    this.tap = new TapController({
      get world() {
        return s.world;
      },
      player: () => this.player,
      hand: () => this.handPosition(),
      cameraYaw: () => this.cameraRig.moveYaw,
      focusedPropId: () => this.focusedProp?.id ?? null,
      propById: (id) => s.liveProps.get(id) ?? null,
      // A world feature with no use left (an opened cache) reads Infinity: a tap passes through it.
      usable: (spec) => spec.interact !== 'feature' || Number.isFinite(this.features.focusDistance(spec, this.player.x, this.player.y, this.player.z)),
      viewport: () => ({ width: window.innerWidth, height: window.innerHeight }),
      hint: (text) => this.ui.hint(text, 2200),
      ping: (x, y, z) => this.particles.sparkle(x, y, z, 0xffd29a, 5, this.rng, 0.9),
      nudge: (x, y) => {
        this.cameraRig.turnToward(x, y, 0.3);
        this.viewmodel.raise();
      },
    }, this.mining, this.bus);

    this.desktop = new DesktopInput(this.canvas, this.input);
    // Android Back button (see android/MainActivity): returns true when the game handled it.
    (window as unknown as { deepDownBack: () => boolean }).deepDownBack = () => this.handleBack();
    this.wireEvents();
    this.wireLifecycle();
    installDebugApi(this);

    this.enterMenu();
    this.ready = true;
    this.lastFrame = this.lastStep = performance.now();
    requestAnimationFrame(this.frame);
  }

  private wireEvents(): void {
    const bus = this.bus;
    const objective = (moved: boolean) => {
      if (moved) bus.emit('objective:changed', { id: this.objectives.current().id });
    };
    bus.on('item:picked', ({ item, count }) => {
      objective(this.objectives.onEvent('item:picked', { item, count }));
      this.progression.onItemPicked(item, count);
      this.tutorial('pickup', 'hint.pickup');
    });
    bus.on('objective:changed', () => this.progression.invalidateNext());
    bus.on('inventory:changed', () => this.progression.invalidateNext());
    bus.on('player:damaged', ({ amount }) => this.progression.onDamaged(amount));
    bus.on('block:broken', (e) => objective(this.objectives.onEvent('block:broken', e)));
    bus.on('craft:done', (e) => objective(this.objectives.onEvent('craft:done', e)));
    bus.on('discovery', (e) => objective(this.objectives.onEvent('discovery', e)));
    bus.on('camp:entered', () => objective(this.objectives.onEvent('camp:entered', {})));
    bus.on('block:tooHard', ({ block }) => {
      if (block === B.IRON_ORE) this.discover('ironVein');
    });
    // The tree, the runes, the rumours (final pass W3).
    this.progression.wire();
  }

  private wireLifecycle(): void {
    // On Android the shell's onPause saves first (deepDownLifecycle), then the WebView hides the
    // page: one backgrounding must not write twice, so a second background save within 1 s is skipped.
    const backgroundSave = (reason: string) => {
      if (performance.now() - this.lastBackgroundSaveAt >= 1000) this.saveNow(reason);
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        backgroundSave('background');
        this.audio.suspend();
        if (this.mode === 'playing') this.pause();
      } else this.audio.resume();
    };
    const onHide = () => backgroundSave('pagehide');
    const onResize = () => this.renderer.resize();
    const unlock = () => void this.audio.unlock();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('resize', onResize);
    // iOS only lets audio start inside the gesture handler that ends a touch, so listen to all.
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    // Every UI button gets the same soft click.
    const click = (e: Event) => {
      if ((e.target as HTMLElement | null)?.closest?.('button')) this.audio.ui('click');
    };
    this.uiRoot.addEventListener('click', click);
    this.disposers.push(
      () => document.removeEventListener('visibilitychange', onVis),
      () => window.removeEventListener('pagehide', onHide),
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('pointerdown', unlock),
      () => window.removeEventListener('pointerup', unlock),
      () => window.removeEventListener('touchend', unlock),
      () => window.removeEventListener('keydown', unlock),
      () => this.uiRoot.removeEventListener('click', click),
    );
  }

  // ------------------------------------------------------------------------------------
  // Modes

  private enterMenu(): void {
    this.mode = 'menu';
    this.mining?.cancel();
    this.tap?.reset(this.input);
    this.features?.cancelRide();
    this.desktop.releasePointer();
    this.ui.setGameplayActive(false);
    this.ui.showScreen('menu');
    this.audio.setPaused(false);
    this.viewmodel.setVisible(false);
    // Stage the explorer on the lip of the ledge overlooking the Hollow, like a title card.
    const pose = menuExplorerPose(this.session.world, this.session.layout.landmarks.ledge);
    this.player.teleport(pose.x, pose.y, pose.z, pose.yaw);
    this.menuCamera?.reset();
  }

  async newGame(): Promise<void> {
    if (this.loading || this.mode !== 'menu') return;
    this.loading = true;
    try {
      this.ui.showScreen('loading');
      this.ui.setLoading(0.5, t('menu.loadingMesh'));
      await this.session.reset();
      // Only now replace the old save (a failed reset must not have erased it).
      this.saves.clear();
      this.resetProgress();
      this.halosDirty = true;
      this.startPlaying();
    } catch (e) {
      this.loadFailed(e);
      return;
    } finally {
      this.loading = false;
    }
    // The tutorial's first steps (look, then walk) are the objective line's: no hint repeats them.
    this.saveNow('new');
  }

  /** A load threw: back to the menu with a message instead of a stuck loading screen. */
  private loadFailed(e: unknown): void {
    console.error('[deep-down] load failed', e);
    this.mode = 'menu';
    this.ui.showScreen('menu');
    this.ui.toast(t('error.loadFailed'), 'warn');
  }

  async continueGame(): Promise<void> {
    if (this.loading || this.mode !== 'menu') return;
    const res = this.saves.load();
    if (!res.data) {
      if (res.error) {
        // Never wipe a save we cannot read (e.g. written by a newer build) without asking.
        this.ui.toast(t(res.error === 'version' ? 'error.saveNewer' : 'error.saveUnreadable'), 'warn');
        return;
      }
      await this.newGame();
      return;
    }
    this.loading = true;
    // A save from another world generator keeps everything but its world edits (save/saveData).
    const { data, shifted } = shiftWorldIfNeeded(res.data, this.session.layout.spawn);
    try {
      this.ui.showScreen('loading');
      this.ui.setLoading(0.5, t('menu.loadingMesh'));
      await this.session.restore(data.worldEdits, data.removedProps);
      this.restoreProgress(data);
      this.halosDirty = true;
      this.startPlaying(data.removedProps);
    } catch (e) {
      this.loadFailed(e);
      return;
    } finally {
      this.loading = false;
    }
    if (res.recovered) this.ui.toast(t('error.saveCorrupt'), 'warn');
    if (shifted) this.ui.toast(t('save.worldShifted'), 'info');
    if (res.dropped) this.ui.toast(t('save.itemsDropped', { count: res.dropped }), 'warn');
    if (shifted) this.saveNow('worldShifted');
  }

  /** @param removed props the save had removed (the epoch's bloom stays gone once mined). */
  private startPlaying(removed: readonly string[] = []): void {
    this.mode = 'playing';
    this.ui.showScreen('none');
    this.ui.setGameplayActive(true);
    this.audio.setPaused(false);
    this.cameraRig.yaw = this.player.yaw + Math.PI;
    this.cameraRig.pitch = -0.12;
    this.cameraRig.snapTo(this.player.x, this.player.y + EYE_HEIGHT, this.player.z);
    this.viewmodel.setVisible(true);
    this.atCamp = this.inRegion(this.session.layout.camp);
    this.refreshEquipmentVisuals();
    // Rides become edges of the walking fields before attachWorld computes them.
    this.features.attach(removed);
    this.progression.attachWorld(this.atCamp);
    this.autosaveTimer = SAVE.autosaveSeconds;
  }

  /** System Back: close a screen, pause, or resume. False at the main menu (let the OS exit). */
  handleBack(): boolean {
    if (this.loading) return true;
    if (this.mode === 'menu') {
      if (this.ui.screen !== 'menu') {
        this.ui.showScreen('menu');
        return true;
      }
      return false;
    }
    if (this.mode === 'dead') return true;
    if (this.mode === 'paused') {
      if (this.ui.screen === 'pause') this.resume();
      else this.ui.showScreen('pause');
      return true;
    }
    if (this.ui.isBlockingInput()) this.ui.showScreen('none');
    else this.pause();
    return true;
  }

  pause(): void {
    if (this.mode !== 'playing') return;
    this.mode = 'paused';
    this.mining.cancel();
    this.input.mining = false;
    this.desktop.releasePointer();
    this.audio.setPaused(true);
    this.ui.showScreen('pause');
  }

  resume(): void {
    if (this.mode !== 'paused' && !(this.mode === 'playing' && this.ui.isBlockingInput())) return;
    this.mode = 'playing';
    this.audio.setPaused(false);
    this.ui.showScreen('none');
  }

  private resetProgress(): void {
    const spawn = this.session.layout.spawn;
    this.backpack = new Backpack(packForTier(1).slots, packForTier(1).pouch);
    this.storage = new CampStorage();
    this.equipment = new Equipment();
    this.lanternFuel = new Lantern(lanternForTier(1).fuelSeconds);
    this.health = new Health(PLAYER.maxHealth);
    this.objectives = new Objectives();
    this.journal = new Journal();
    this.stats = { blocksMined: 0, deaths: 0, itemsBanked: 0 };
    this.playTime = 0;
    this.progression.reset();
    this.progression.applyGear();
    this.drops.clear();
    this.player.teleport(spawn.x, spawn.y, spawn.z, spawn.yaw);
  }

  private restoreProgress(d: SaveData): void {
    this.equipment = new Equipment(d.equipment);
    const pack = packForTier(this.equipment.tiers.pack);
    this.backpack = Backpack.fromJSON(d.backpack, pack.slots, pack.pouch);
    this.storage = CampStorage.fromJSON(d.storage);
    this.lanternFuel = new Lantern(lanternForTier(this.equipment.tiers.lantern).fuelSeconds, d.player.lanternFuel);
    this.health = new Health(Health.maxFor(d.progression.gear), d.player.health);
    this.objectives = Objectives.fromJSON(d.objectives);
    this.journal = Journal.fromJSON({ discoveries: d.discoveries, keyItems: d.journal });
    this.stats = { ...d.stats };
    this.playTime = d.playTime;
    this.drops.clear();
    this.player.teleport(d.player.x, d.player.y, d.player.z, d.player.yaw);
    this.progression.fromSave(d.progression);
    // A returning player knows how to move, look, mine and pick up (saves from before hints were kept too).
    for (const h of ['move', 'look', 'mine', 'pickup']) this.progression.hintsShown.add(h);
  }

  // ------------------------------------------------------------------------------------
  // Save

  buildSave(): SaveData {
    // On the death screen, save the respawn the player is about to get (the pack is already cached).
    const dead = this.mode === 'dead';
    const spawn = this.session.layout.spawn;
    return {
      version: SAVE.version,
      genVersion: WORLD.genVersion,
      savedAt: Date.now(),
      worldSeed: WORLD.seed,
      playTime: this.playTime,
      player: dead
        ? { x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw, health: this.health.max, lanternFuel: lanternForTier(this.equipment.tiers.lantern).fuelSeconds }
        : {
            // Mid-ride, the save wakes the explorer on the ride's end stand.
            x: this.features.rideSavePosition?.[0] ?? this.player.x,
            y: this.features.rideSavePosition?.[1] ?? this.player.y,
            z: this.features.rideSavePosition?.[2] ?? this.player.z,
            yaw: this.player.yaw,
            health: this.health.current,
            lanternFuel: this.lanternFuel.fuel,
          },
      backpack: this.backpack.toJSON(),
      storage: this.storage.toJSON(),
      equipment: { ...this.equipment.tiers },
      journal: this.journal.toJSON().keyItems,
      discoveries: this.journal.toJSON().discoveries,
      objectives: this.objectives.toJSON(),
      worldEdits: this.session.worldEdits(),
      removedProps: [...this.session.removedProps],
      stats: { ...this.stats },
      progression: this.progression.toSave(),
    };
  }

  saveNow(reason: string): boolean {
    if (this.mode !== 'playing' && this.mode !== 'paused' && this.mode !== 'dead') return false;
    if (this.loading) return false;
    // Never save a state a failing frame may have broken (until a frame succeeds again).
    if (!this.frameGuard.canSave) return false;
    const res = this.saves.save(this.buildSave());
    if (res.ok) {
      if (reason === 'background' || reason === 'pagehide') this.lastBackgroundSaveAt = performance.now();
      this.bus.emit('game:saved', { reason });
    }
    else {
      this.bus.emit('game:saveFailed', { reason: res.error ?? 'unknown' });
      this.ui.toast(t('toast.saveFailed'), 'warn');
    }
    this.autosaveTimer = SAVE.autosaveSeconds;
    return res.ok;
  }

  // ------------------------------------------------------------------------------------
  // Frame loop

  private readonly frame = (now: number): void => {
    if (this.mode === 'crashed') return;
    requestAnimationFrame(this.frame);
    // Behind the pause and death overlays the world is frozen: a low rate saves the battery. The
    // title screen is a slow drift: 30 fps is plenty.
    const idle = this.mode === 'paused' || this.mode === 'dead';
    const preset = this.renderer.preset.fpsCap;
    const cap = idle ? 15 : this.mode === 'menu' ? (preset > 0 ? Math.min(preset, MENU_FPS) : MENU_FPS) : preset;
    const elapsed = Math.max(0, now - this.lastFrame);
    this.lastFrame = now;
    if (cap > 0) {
      // Frame limiter (90/120 Hz panels still average the cap: the remainder carries over).
      const interval = 1000 / cap;
      this.frameAccumulator += elapsed;
      if (this.frameAccumulator < interval - 1.5) return;
      this.frameAccumulator = Math.min(interval, Math.max(0, this.frameAccumulator - interval));
    }
    const dt = (now - this.lastStep) / 1000;
    this.lastStep = now;
    const step = Math.min(0.05, Math.max(0, dt));
    this.frameGuard.run(() => this.step(step));
  };

  /**
   * Stop for good where the game stands: the frame guard tripped, or the shell (src/main.ts) saw
   * an uncaught error. No frame runs and nothing is saved after this; the screen may sleep, audio
   * goes quiet, and the window event 'dd:crash' (detail: the error) brings up the crash panel.
   */
  crash(err: unknown): void {
    if (this.mode === 'crashed') return;
    this.frameGuard.trip(err);
    this.mode = 'crashed';
    this.keepAwake = false;
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

  /** One simulation + render step. Public so tests can advance deterministically. */
  step(dt: number): void {
    const t0 = performance.now();
    this.time += dt;
    this.session.rig.uniforms.uTime.value = this.time;

    if (this.mode === 'menu') this.updateMenu(dt);
    else if (this.mode === 'playing') this.updatePlaying(dt);
    else this.updateIdle(dt);

    this.render(dt);
    consumeEdges(this.input);
    const awake = this.mode === 'playing';
    if (awake !== this.keepAwake) {
      this.keepAwake = awake;
      // Android shell bridge: the screen may sleep on menus, pause and death screens.
      (window as unknown as { DeepDownAndroid?: { keepScreenOn(on: boolean): void } }).DeepDownAndroid?.keepScreenOn(awake);
    }
    this.frameMs = performance.now() - t0;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
  }

  private updateMenu(dt: number): void {
    // A slow cinematic drift just past the ledge rim (game/MenuCamera), in the gameplay lens.
    this.menuCamera?.update(dt, this.cameraRig.camera, this.renderer.aspect);
    this.player.update(dt, 0, 0, false, 0, false);
    this.updateLantern(dt, false);
    this.audio.update(dt, this.audioState(true));
  }

  private updateIdle(dt: number): void {
    // Paused or dead: keep the scene alive but frozen in gameplay terms.
    if (this.mode === 'paused' && this.input.pausePressed && this.ui.screen === 'pause') this.resume();
    this.cameraRig.update(0, this.player.x, this.player.y + EYE_HEIGHT - this.player.stepOffset, this.player.z, this.renderer.aspect);
    this.updateViewmodel(0);
    this.updateLantern(0, false);
    this.audio.update(dt, this.audioState(true));
  }

  private updatePlaying(dt: number): void {
    const input = this.input;
    const blocked = this.ui.isBlockingInput();
    this.playTime += dt;
    // Tap to act runs first: a tap on an object presses Use, a walk sets autoMove for this frame.
    this.tap.update(dt, input, blocked || this.features.riding);

    if (!blocked) {
      if (input.pausePressed || input.pauseRequested) {
        this.pause();
        return;
      }
      if (input.inventoryPressed) {
        this.openInventory();
        return;
      }
      if (input.interactPressed && this.focusedProp) this.interact(this.focusedProp);
      this.cameraRig.sensitivity = this.settings.lookSensitivity;
      this.cameraRig.invertY = this.settings.invertY;
      this.cameraRig.shakeScale = this.settings.cameraShake;
      this.cameraRig.look(input.lookDX, input.lookDY);
    } else if (input.pausePressed) {
      // Esc / back closes the open screen.
      this.ui.showScreen('none');
    }

    const p = this.player;
    const hand = this.handPosition();
    // On a ride (game/WorldFeatures) the explorer follows the hoist or the rope: no walking, no mining.
    const riding = this.features.riding;
    const swinging = this.mining.update(dt, input, !blocked && !riding, hand.x, hand.y, hand.z);
    p.speedFactor = swinging ? 0.55 : 1;
    const mx = blocked || riding ? 0 : input.moveX || input.autoMoveX;
    const my = blocked || riding ? 0 : input.moveY || input.autoMoveY;
    const ev = riding ? this.features.updateRide(dt) : p.update(dt, mx, my, !blocked && input.jumpPressed, this.cameraRig.moveYaw, false);
    // First person: the body faces the view (rides turn the view themselves).
    if (!riding) p.yaw = this.cameraRig.yaw + Math.PI;
    this.lookStill = input.lookDX !== 0 || input.lookDY !== 0 ? 0 : this.lookStill + dt;
    this.followWalk(dt, blocked || riding);
    if (ev.jumped) this.bus.emit('player:jump', {});
    if (ev.footstep) this.bus.emit('player:footstep', { block: ev.footBlock, speed: p.speed });
    if (ev.landedSpeed > 0) this.onLanded(ev.landedSpeed);
    if (ev.rescued) this.ui.hint(t('hint.outOfReach'), 1500);

    if (!blocked && (Math.abs(mx) > 0.2 || Math.abs(my) > 0.2)) this.tutorial('mine', this.isTouch() ? 'hint.mine' : 'hint.mineDesktop', 6000, 4);

    this.cameraRig.update(dt, p.x, p.y + EYE_HEIGHT - p.stepOffset, p.z, this.renderer.aspect);
    this.updateViewmodel(dt);
    this.updateLantern(dt, true);

    this.drops.update(
      dt, this.time, p.x, p.y, p.z,
      (item) => ITEMS[item].keyItem || this.backpack.canAccept(item),
      (item, count, x, y, z) => this.collect(item, count, x, y, z),
      (item) => {
        this.bus.emit('item:rejected', { item });
        this.ui.hint(t('hint.backpackFull'), 2500);
      },
    );

    this.updateCamp(dt);
    if (this.mode !== 'playing') return;
    // Cold, the turn-back mark, the cache, records and the compass.
    if (this.progression.update(dt)) {
      this.die();
      return;
    }
    this.updateDiscoveries();
    this.features.update(dt);
    this.updateFocus();
    this.updateHealthWarnings();
    const objectiveMoved = this.objectives.setTotals({
      copperOwned: this.backpack.count('copperOre') + this.storage.count('copperOre'),
      atCamp: this.atCamp,
      pickaxeTier: this.equipment.tiers.pickaxe,
    });
    if (objectiveMoved) this.bus.emit('objective:changed', { id: this.objectives.current().id });

    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) this.saveNow('auto');

    this.audio.update(dt, this.audioState(false));
    this.ui.setHud(this.hudState());
  }

  /** Where the pick is swung from: the eye (reach is measured from it). */
  private handPosition(): THREE.Vector3 {
    const e = this.cameraRig.eye;
    if (Number.isFinite(e.x) && e.lengthSq() > 0) return this.tmpV.copy(e);
    return this.tmpV.set(this.player.x, this.player.y + EYE_HEIGHT, this.player.z);
  }

  /**
   * Tap to walk in first person: while the explorer walks a tapped path and the player is not
   * looking around, the view turns gently along the way (and levels a downward look), so a walk
   * reads like walking. Off with the Camera follow setting.
   */
  private followWalk(dt: number, blocked: boolean): void {
    if (blocked || !this.settings.cameraFollow || this.lookStill < 0.35) return;
    const hd = this.tap.heading();
    if (!hd) return;
    const rig = this.cameraRig;
    rig.yaw = dampAngle(rig.yaw, Math.atan2(-hd[0], -hd[1]), this.tap.goalKind === 'walk' ? 2.4 : 1.6, dt);
    if (rig.pitch < -0.25) rig.pitch = damp(rig.pitch, -0.25, 1.2, dt);
  }

  private onLanded(speed: number): void {
    const below = this.session.world.get(Math.floor(this.player.x), Math.floor(this.player.y - 0.1), Math.floor(this.player.z));
    this.bus.emit('player:land', { fallSpeed: speed, block: below });
    // A landing dips the view a little (no shake, no roll).
    this.cameraRig.addTrauma(clamp((speed - 5) / 16, 0, 0.6));
    const dmg = Health.fallDamage(speed, this.player.safeFallSpeed);
    if (dmg > 0) {
      const dealt = this.health.damage(dmg);
      if (dealt > 0) this.bus.emit('player:damaged', { amount: dealt, cause: 'fall' });
      this.renderer.post.params.flash = 0.12;
      this.renderer.post.params.flashColor.setRGB(0.6, 0.05, 0.02);
      if (this.health.dead) this.die();
    }
  }

  private readonly vmAmbient = new THREE.Color();
  private readonly vmFlame = new THREE.Color();
  private readonly vmGrey = new THREE.Color();
  private readonly vmVel = new THREE.Vector3();

  /** The pickaxe and the lantern in view: placed for this frame's lens, lit by the flame and the room. */
  private updateViewmodel(dt: number): void {
    const vm = this.viewmodel;
    if (!vm.visible) return;
    const p = this.player;
    const cam = this.cameraRig.camera;
    // Sideways speed in the view (drives the lantern's sway).
    const v = this.vmVel.set(p.vx, 0, p.vz).applyQuaternion(this.tmpQ.copy(cam.quaternion).invert());
    // The room's light at the eye (the light volume, as the world shader reads it).
    const s = this.session;
    const l = s.sampleLight(cam.position.x, cam.position.y, cam.position.z);
    const u = s.rig.uniforms;
    const gain = typeof u.uEmitGain?.value === 'number' ? (u.uEmitGain.value as number) : 1.6;
    const amb = u.uAmbient?.value as THREE.Color | undefined;
    const open = u.uOpenAmbient?.value as THREE.Color | undefined;
    const a2 = l.open * l.open;
    // The tools are shaded in display terms: undo the scene exposure (the world's light and the
    // flame then read the same whatever a zone's exposure is).
    const post = this.renderer.post.params as { exposure?: number; zoneExposure?: number };
    const inv = 1 / Math.max(0.3, (post.exposure ?? 1) * (post.zoneExposure ?? 1));
    this.vmAmbient.setRGB(
      (amb?.r ?? 0.02) + (open?.r ?? 0.04) * a2 + Math.pow(l.r, 1.55) * gain,
      (amb?.g ?? 0.02) + (open?.g ?? 0.05) * a2 + Math.pow(l.g, 1.55) * gain,
      (amb?.b ?? 0.03) + (open?.b ?? 0.06) * a2 + Math.pow(l.b, 1.55) * gain,
    ).multiplyScalar(0.6 * inv);
    const lc = u.uLanternColor?.value as THREE.Color | undefined;
    const li = typeof u.uLanternIntensity?.value === 'number' ? (u.uLanternIntensity.value as number) : 1;
    // The flame on the tools: a little less saturated than the world's lantern colour (the tools
    // sit a hand's width from it and must not out-shine the way on).
    this.vmFlame.setRGB(lc?.r ?? 1, lc?.g ?? 0.62, lc?.b ?? 0.32);
    const fl = this.vmFlame.r * 0.2126 + this.vmFlame.g * 0.7152 + this.vmFlame.b * 0.0722;
    this.vmFlame.lerp(this.vmGrey.setScalar(fl), 0.35).multiplyScalar(1.5 * li * inv);
    vm.flame = this.lanternFuel.lit ? 0.55 + 0.45 * Math.min(1, this.lanternFuel.fraction * 4) : 0.2;
    vm.update(dt, cam, this.renderer.aspect, p.speed, v.x, this.vmAmbient, this.vmFlame);
  }

  private updateLantern(dt: number, burn: boolean): void {
    const def = lanternForTier(this.equipment.tiers.lantern);
    // On the title screen the explorer's lantern always burns, whatever the save holds.
    const menu = this.mode === 'menu';
    if (burn) {
      const edges = this.lanternFuel.update(dt, this.atCamp, def);
      if (edges.becameLow) {
        this.bus.emit('lantern:low', {});
        this.ui.hint(t('hint.lanternLow'), 3500);
      }
      if (edges.becameEmpty) {
        this.bus.emit('lantern:empty', {});
        this.ui.hint(t('hint.lanternEmpty'), 5000);
      }
      if (edges.refueled) {
        this.bus.emit('lantern:refueled', {});
        this.ui.toast(t('hint.lanternRefueled'), 'good');
      }
    }
    const fuel = menu ? 1 : this.lanternFuel.fraction;
    const lit = menu || this.lanternFuel.lit;
    this.lanternLightPosition(menu, this.lanternPos);
    // Smooth the light source a little so walking bob does not shimmer the whole scene.
    const lp = this.lanternSmoothed;
    if (lp.lengthSq() === 0 || dt === 0) lp.copy(this.lanternPos);
    else {
      lp.x = damp(lp.x, this.lanternPos.x, 18, dt);
      lp.y = damp(lp.y, this.lanternPos.y, 18, dt);
      lp.z = damp(lp.z, this.lanternPos.z, 18, dt);
    }
    const u = this.session.rig.uniforms;
    const flicker = 1 + Math.sin(this.time * 13.1) * 0.025 + Math.sin(this.time * 7.3 + 1.2) * 0.035 + (fuel < PLAYER.lanternLowFraction && lit ? Math.sin(this.time * 31) * 0.08 : 0);
    const radius = def.radius * (menu ? 1 : this.lanternFuel.radiusFactor);
    u.uLanternPos.value.copy(lp);
    u.uLanternRadius.value = radius;
    u.uLanternIntensity.value = def.intensity * (lit ? 0.75 + 0.25 * Math.min(1, fuel * 4) : 0.45) * flicker;
    const s = this.session;
    if (s.lantern.update(lp.x, lp.y, lp.z, radius)) {
      s.rig.markLanternDirty({ x: s.lantern.originX, y: s.lantern.originY, z: s.lantern.originZ });
    }
  }

  /**
   * The lantern light: where the drawn lantern hangs (low left of the eye), kept off rock and on
   * the eye's side of any wall (a light inside rock would light nothing, or the far side). On the
   * title screen it stands on the ledge lip, where the explorer waits.
   */
  private lanternLightPosition(menu: boolean, out: THREE.Vector3): void {
    const p = this.player;
    if (menu) {
      out.set(p.x, p.y + 1.0, p.z);
      return;
    }
    const cam = this.cameraRig.camera;
    const e = cam.position;
    this.viewmodel.lightWorld(cam, out);
    const w = this.session.world;
    clearOfRock(w, out.x, out.y, out.z, 0.3, this.lightGuard);
    out.copy(this.lightGuard);
    // Between the eye and the light: pull the light back toward the eye if rock comes between.
    const dx = out.x - e.x;
    const dy = out.y - e.y;
    const dz = out.z - e.z;
    const len = Math.hypot(dx, dy, dz);
    if (len > 1e-4) {
      const hit = raycastVoxels(w, e.x, e.y, e.z, dx / len, dy / len, dz / len, len + 0.25);
      if (hit) {
        const k = Math.max(0, hit.distance - 0.25) / len;
        out.set(e.x + dx * k, e.y + dy * k, e.z + dz * k);
      }
    }
    if (!Number.isFinite(out.x)) out.set(p.x, p.y + 1.2, p.z);
  }

  private collect(item: ItemId, count: number, x?: number, y?: number, z?: number): number {
    let taken: number;
    if (ITEMS[item].keyItem) {
      this.journal.addKeyItem(item);
      taken = count;
    } else taken = this.backpack.add(item, count);
    if (taken > 0) {
      const at = x !== undefined && y !== undefined && z !== undefined ? this.screenPoint(x, y, z) : null;
      this.bus.emit('item:picked', at ? { item, count: taken, sx: at[0], sy: at[1] } : { item, count: taken });
      this.bus.emit('inventory:changed', {});
      this.particles.sparkle(this.player.x, this.player.y + 1.1, this.player.z, ITEMS[item].color, 5, this.rng, 1.2);
    }
    return taken;
  }

  private updateCamp(dt: number): void {
    const inCamp = this.inRegion(this.session.layout.camp);
    if (inCamp && !this.atCamp) {
      this.atCamp = true;
      this.bus.emit('camp:entered', {});
      const banked = this.bank();
      if (!totalOf(banked) && this.playTime > 5) this.ui.toast(t('toast.welcomeBack'), 'info');
      this.tutorial('workbench', 'hint.workbench', 5000);
      // The trip ends before the camp save (so the save already holds the finished trip and its
      // records), and is announced after it (so the report never opens over an unsaved camp).
      const report = this.progression.onCampEntered(banked);
      this.saveNow('camp');
      if (report) this.progression.announceEnded(report);
    } else if (inCamp && !this.backpack.isEmpty) {
      // Drops that fly in after arrival, or a backpack restored from an in-camp save.
      if (totalOf(this.bank())) this.saveNow('camp');
    } else if (!inCamp && this.atCamp) {
      this.atCamp = false;
      this.bus.emit('camp:left', {});
      this.progression.onCampLeft();
      this.tutorial('camp', 'hint.camp', 5000);
    }
    if (this.atCamp && this.health.current < this.health.max) {
      this.campRegenCarry += PLAYER.campRegen * dt;
      if (this.campRegenCarry >= 1) {
        this.health.heal(Math.floor(this.campRegenCarry));
        this.campRegenCarry -= Math.floor(this.campRegenCarry);
      }
    }
  }

  /** Move the backpack into camp storage. @returns the counts banked. */
  private bank(): ItemCounts {
    const banked = this.storage.deposit(this.backpack);
    const total = totalOf(banked);
    if (total > 0) {
      this.stats.itemsBanked += total;
      this.bus.emit('items:banked', { total, items: banked });
      this.bus.emit('inventory:changed', {});
      this.ui.toast(t('toast.banked', { count: total }), 'good');
    }
    return banked;
  }

  /** True while the explorer is inside the camp region. */
  get inCamp(): boolean {
    return this.atCamp;
  }

  private inRegion(r: Region): boolean {
    const p = this.player;
    return p.x >= r.min[0] && p.x <= r.max[0] && p.y >= r.min[1] && p.y <= r.max[1] && p.z >= r.min[2] && p.z <= r.max[2];
  }

  private updateDiscoveries(): void {
    for (const r of this.session.layout.discoveries) {
      if (this.journal.has(r.id)) continue;
      if (r.max[0] - r.min[0] <= 0) continue; // event-triggered discoveries have empty regions
      if (this.inRegion(r)) this.discover(r.id);
    }
  }

  discover(id: string): void {
    if (!this.journal.addDiscovery(id)) return;
    const titleKey = `discovery.${id}.title` as TextKey;
    const bodyKey = `discovery.${id}.body` as TextKey;
    const n = this.progression.onDiscovery(id);
    this.ui.showDiscovery({ id, title: t(titleKey), body: t(bodyKey), index: n.index, total: n.total, major: n.major });
    this.bus.emit('discovery', { id });
    this.renderer.post.params.flash = 0.08;
    this.renderer.post.params.flashColor.setRGB(0.25, 0.75, 0.9);
    this.particles.sparkle(this.player.x, this.player.y + 1.6, this.player.z, 0x8ff6ff, 16, this.rng, 2.2);
    this.saveNow('discovery');
  }

  private updateFocus(): void {
    const p = this.player;
    let best: PropSpec | null = null;
    // Nearest relative to each prop's own range (world features: ride stands, the stone's faces).
    let bestD = 1;
    for (const spec of this.session.liveProps.values()) {
      if (!spec.interact) continue;
      const feature = spec.interact === 'feature';
      const d = feature ? this.features.focusDistance(spec, p.x, p.y, p.z) / this.features.focusRange(spec) : Math.hypot(spec.x - p.x, (spec.y - p.y) * 0.7, spec.z - p.z) / INTERACT_RANGE;
      if (d < bestD) {
        bestD = d;
        best = spec;
      }
    }
    if (best !== this.focusedProp) {
      this.focusedProp = best;
      this.session.props.setHighlight(best ? best.id : null);
      this.ui.touch.setInteractVisible(best ? this.interactLabel(best) : null);
    }
  }

  private interactLabel(spec: PropSpec): string {
    return this.progression.interactLabel(spec);
  }

  interact(spec: PropSpec): void {
    this.progression.interact(spec);
  }

  /** Drop the interaction focus (a prop was taken, a ride began). */
  clearFocus(): void {
    this.focusedProp = null;
    this.session.props.setHighlight(null);
    this.ui.touch.setInteractVisible(null);
  }

  /** Give the explorer an item as if picked up (key items go to the journal). */
  grant(item: ItemId, count = 1): number {
    return this.collect(item, count);
  }

  /** Read the Ancient Tablet: it goes to the journal and the prop leaves the shrine. */
  collectRelic(spec: PropSpec): void {
    this.collect('ancientTablet', 1);
    this.session.removeProp(spec.id);
    this.focusedProp = null;
    this.ui.touch.setInteractVisible(null);
    this.discover('tablet');
    // The Ancient Tablet is the Lantern rune: its socket on the Relic Shelf (game/Runes).
    this.progression.runes.onFound('ancientTablet');
  }

  private onBlockBroken(x: number, y: number, z: number, oldId: number): void {
    this.stats.blocksMined++;
    this.progression.onBlockMined();
    // Mining under a lamp makes it settle (its emitter moves): check before the settle runs.
    for (const p of this.session.liveProps.values()) {
      if (p.anchor && p.anchor[0] === x && p.anchor[1] === y && p.anchor[2] === z) this.halosDirty = true;
    }
    this.session.blockChanged(x, y, z, oldId);
    if (oldId === B.CRYSTAL) this.discover('crystals');
    if (oldId === B.ECHO_CRYSTAL) this.discover('echo');
  }

  /** Halo sources: lamps owned by live props plus static abyss lights. */
  private haloSources(): HaloSource[] {
    const s = this.session;
    if (!this.staticHalos) this.staticHalos = collectWorldLights(s.world).filter((h) => h.id === B.LIGHT_ABYSS);
    const out: HaloSource[] = [...this.staticHalos];
    for (const spec of s.liveProps.values()) {
      if (spec.kind === 'crystalCluster') continue;
      for (const [x, y, z] of spec.emitters) {
        const id = s.world.get(x, y, z);
        if (id === B.LIGHT_AMBER || id === B.LIGHT_LAMP || id === B.LIGHT_EMBER) out.push({ x, y, z, id });
      }
    }
    // The pack left behind glows like an ember so it can be found again.
    const cache = this.progression.haloSource();
    if (cache) out.push(cache);
    return out;
  }

  /** Rebuild the halo list on the next frame (props or the cache moved). */
  markHalosDirty(): void {
    this.halosDirty = true;
  }

  /** A world point on screen, 0..1 from the top left (clamped), for pickup feedback. */
  private screenPoint(x: number, y: number, z: number): [number, number] {
    const v = this.tmpP.set(x, y, z).project(this.cameraRig.camera);
    const c = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;
    return [c((v.x + 1) / 2), c((1 - v.y) / 2)];
  }

  private onPropBroken(spec: PropSpec): void {
    if (spec.minable?.drop === 'echoShard') this.discover('echo');
    this.session.removeProp(spec.id);
    this.halosDirty = true;
    if (this.focusedProp?.id === spec.id) this.focusedProp = null;
  }

  private updateHealthWarnings(): void {
    const low = this.health.current / this.health.max < 0.3;
    if (low && !this.healthLowWarned) this.ui.hint(t('hint.healthLow'), 3000);
    this.healthLowWarned = low;
  }

  /** A black-out: the pack waits where the explorer last stood safely (game/Progression). */
  private die(): void {
    this.mode = 'dead';
    this.mining.cancel();
    this.tap.reset(this.input);
    this.features.cancelRide();
    this.input.mining = false;
    this.desktop.releasePointer();
    const left = this.progression.onBlackout();
    this.stats.deaths++;
    this.bus.emit('player:died', { lost: left.cached });
    this.ui.setGameplayActive(false);
    this.ui.showDeath(left.cached);
    // The cache is written in the same save as the death.
    this.saveNow('death');
  }

  respawn(): void {
    const spawn = this.session.layout.spawn;
    this.features.cancelRide();
    this.health = new Health(this.health.max);
    this.lanternFuel.refill(lanternForTier(this.equipment.tiers.lantern));
    this.player.teleport(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.mode = 'playing';
    this.audio.setPaused(false);
    this.ui.showScreen('none');
    this.ui.setGameplayActive(true);
    this.cameraRig.yaw = this.player.yaw + Math.PI;
    this.cameraRig.pitch = -0.12;
    this.cameraRig.snapTo(spawn.x, spawn.y + EYE_HEIGHT, spawn.z);
    this.atCamp = true;
    this.bus.emit('player:respawned', {});
    this.saveNow('respawn');
  }

  /** Give up the trip from the pause menu: the pack stays here as a cache (none at camp). */
  returnToCamp(): void {
    const left = this.atCamp ? null : this.progression.onAbandon();
    this.respawn();
    if (left && left.cache) this.ui.toast(t('death.cacheAt', { depth: left.cache.depth, count: left.count }), 'warn');
    if (left && left.replaced > 0) this.ui.toast(t('toast.cacheReplaced', { count: left.replaced }), 'warn');
  }

  // ------------------------------------------------------------------------------------
  // Crafting & inventory

  /** Make a node of the upgrade tree (game/Progression holds the rules and the built list). */
  craft(id: NodeId): void {
    const before = { ...this.equipment.tiers };
    const res = this.progression.craft(id);
    if (!res.ok) {
      this.bus.emit('craft:failed', { recipe: id, reason: res.reason });
      this.audio.ui('error');
      return;
    }
    if (this.equipment.tiers.lantern !== before.lantern) this.lanternFuel.refill(lanternForTier(this.equipment.tiers.lantern));
    this.refreshEquipmentVisuals();
    this.bus.emit('craft:done', { recipe: id });
    this.bus.emit('inventory:changed', {});
    const def = NODES[id];
    this.ui.toast(t(def.result.kind === 'station' ? 'toast.built' : 'toast.crafted', { item: t(def.name) }), 'good');
    this.particles.sparkle(this.player.x, this.player.y + 1.2, this.player.z, 0xffc58a, 18, this.rng, 2);
    this.saveNow('craft');
  }

  private refreshEquipmentVisuals(): void {
    // The pick's head and the lantern's cage change with the tiers (first person).
    this.viewmodel.set({ pickTier: this.equipment.tiers.pickaxe, lanternTier: this.equipment.tiers.lantern, mirror: this.settings.leftHanded });
  }

  openInventory(): void {
    if (this.mode !== 'playing') return;
    this.mining.cancel();
    this.input.mining = false;
    this.desktop.releasePointer();
    this.ui.showScreen('inventory');
  }

  /** The upgrade tree, on the tab of `place`, optionally with a node selected (a stake sign). */
  openCrafting(place: Place = 'workbench', select: NodeId | null = null): void {
    if (this.mode !== 'playing') return;
    this.progression.focusTree(place, select);
    this.openScreen('crafting');
  }

  /** The Survey Table board: records and rumours. */
  openBoard(): void {
    if (this.mode !== 'playing') return;
    this.openScreen('board');
  }

  /** The Journal (discoveries, runes, relic texts). */
  openJournal(tab: JournalTab = 'discoveries'): void {
    if (this.mode !== 'playing' && this.mode !== 'paused') return;
    this.progression.focusJournal(tab);
    this.openScreen('journal');
  }

  private openScreen(id: 'crafting' | 'board' | 'journal'): void {
    this.mining.cancel();
    this.input.mining = false;
    this.desktop.releasePointer();
    this.ui.showScreen(id);
  }

  /** Drop one backpack stack in front of the explorer (it lies there like any drop). */
  dropStack(slot: number): void {
    if (this.mode !== 'playing') return;
    const s = this.backpack.dropStack(slot);
    if (!s) return;
    const p = this.player;
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    this.drops.spawn(s.item, s.count, p.x + fx * 0.9, p.y + 0.9, p.z + fz * 0.9, this.rng);
    this.bus.emit('inventory:changed', {});
  }

  inventoryView(): InventoryView {
    const available: ItemCounts = {};
    for (const id of Object.keys(ITEMS) as ItemId[]) {
      const n = this.backpack.count(id) + this.storage.count(id);
      if (n > 0) available[id] = n;
    }
    return {
      backpack: this.backpack.toJSON(),
      storage: this.storage.toJSON(),
      equipment: { ...this.equipment.tiers },
      journal: [...this.journal.toJSON().discoveries, ...this.journal.toJSON().keyItems],
      available,
      atCamp: this.atCamp,
      pouchSlots: this.backpack.pouchSlots,
    };
  }

  // ------------------------------------------------------------------------------------
  // HUD / audio state

  private readonly hud: HudState = {
    health: 0, maxHealth: 0, lantern: 0, lanternLow: false, backpackUsed: 0, backpackMax: 0, depth: 0, atCamp: true,
    campBearing: 0, campDistance: 0, objectiveText: '', interactLabel: null, target: null, showCrosshair: false,
    fps: 0, frameMs: 0, drawCalls: 0, triangles: 0, fuelSeconds: 0, fuelCapacity: 1, homeSeconds: null,
    turnBackFraction: null, fuelState: 'ok', cold: 0, compass: { kind: 'camp', bearing: 0, distance: 0 }, cache: null,
    bestDepth: 0, newBest: false, packFull: false, pouchSlots: 0,
  };

  /** The HUD snapshot (one object, refreshed in place every frame). */
  private hudState(): HudState {
    const p = this.player;
    const info = this.renderer.gl.info.render;
    const h = this.hud;
    h.health = this.health.current;
    h.maxHealth = this.health.max;
    h.lantern = this.lanternFuel.fraction;
    h.lanternLow = this.lanternFuel.low;
    h.backpackUsed = this.backpack.usedSlots;
    h.backpackMax = this.backpack.slotCount;
    h.depth = Math.max(0, Math.round(WORLD.depthOffset - p.y));
    h.atCamp = this.atCamp;
    h.interactLabel = this.focusedProp ? this.interactLabel(this.focusedProp) : null;
    h.target = this.mining.hudTarget();
    // First person: the dot is there on touch and with the mouse captured (a free desktop cursor
    // aims where it points instead). It brightens over a target.
    h.showCrosshair = this.desktop.pointerLocked || this.input.lastDevice === 'touch';
    h.fps = this.fps;
    h.frameMs = Math.round(this.frameMs * 10) / 10;
    h.drawCalls = info.calls;
    h.triangles = Math.round(info.triangles / 1000);
    // Fuel, the walk home, the compass (walking metres), the cache chip and the Next line.
    this.progression.hud(h);
    return h;
  }

  private audioState(inMenu: boolean) {
    const p = this.player;
    const s = this.session;
    const l = s.sampleLight(p.x, p.y + 1, p.z);
    const fire = s.layout.landmarks.campfire;
    const fireD = Math.hypot(fire[0] - p.x, fire[1] - p.y, fire[2] - p.z);
    return {
      depth: Math.max(0, WORLD.depthOffset - p.y),
      atCamp: this.atCamp,
      openness: l.open,
      lanternFuel: this.lanternFuel.fraction,
      lanternLit: this.lanternFuel.lit && !inMenu,
      nearCrystal: clamp(l.b * 1.4 - l.r * 0.6, 0, 1),
      nearFire: clamp(1 - fireD / 9, 0, 1),
      playerSpeed: p.speed,
      inMenu,
    };
  }

  // ------------------------------------------------------------------------------------
  // Render

  private render(dt: number): void {
    const s = this.session;
    const cam = this.cameraRig.camera;
    s.chunks.update(cam.position);
    s.rig.flush(this.renderer.gl);
    // Zone atmosphere (camp haze, tunnel grey, Hollow blue-black, rift violet) follows the explorer.
    s.rig.updateAtmosphere(dt, this.player.x, this.player.y, this.player.z, s.layout.camp);
    this.renderer.post.params.zoneExposure = s.rig.exposure;
    s.props.update(dt, this.time, cam.position);
    this.debris.update(dt);
    this.waterfall?.update(dt, this.particles, this.rng, cam.position);
    this.particles.update(dt, this.time, cam.position.x, cam.position.y, cam.position.z);
    this.particles.setPixelScale(this.renderer.canvas.height, cam.fov);
    if (this.halosDirty) {
      this.halosDirty = false;
      this.halos.setSources(this.haloSources());
    }
    this.halos.setPixelScale(this.renderer.canvas.height, cam.fov);
    const post = this.renderer.post.params;
    post.flash = damp(post.flash, 0, 5, dt);
    this.renderer.render(this.scene, cam, this.time);
  }

  // ------------------------------------------------------------------------------------
  // Settings & actions

  private applyAudioSettings(): void {
    const s = this.settings;
    this.audio.setVolumes({ master: s.masterVolume, music: s.musicVolume, sfx: s.sfxVolume, ambience: s.ambienceVolume });
  }

  updateSettings(patch: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    this.saves.saveSettings(this.settings);
    if (patch.quality && patch.quality !== prev.quality) {
      this.renderer.setQuality(patch.quality);
      const preset = this.renderer.preset;
      this.session.chunks.viewDistance = preset.viewDistance;
      this.session.props.viewDistance = preset.viewDistance;
      this.debris.setBudget(preset.particleBudget);
      this.particles.setBudget(preset.particleBudget);
    }
    if ('renderScale' in patch) {
      this.renderer.renderScaleOverride = this.settings.renderScale;
      this.renderer.resize();
    }
    if ('bloom' in patch) this.renderer.setUserBloom(this.settings.bloom);
    if ('brightness' in patch) this.renderer.setBrightness(this.settings.brightness);
    if ('leftHanded' in patch) this.viewmodel?.set({ mirror: this.settings.leftHanded });
    this.applyAudioSettings();
    this.ui.applySettings(this.settings);
  }

  isTouch(): boolean {
    return this.input.lastDevice === 'touch' && matchMedia('(pointer: coarse)').matches;
  }

  /** Show a tutorial hint once per game. */
  private tutorial(id: string, key: TextKey, ms = 4000, minPlaySeconds = 0): void {
    if (this.progression.hintsShown.has(id) || this.playTime < minPlaySeconds) return;
    this.progression.hintsShown.add(id);
    this.ui.hint(t(key), ms);
  }

  private createActions(): UiActions {
    return {
      // Both arrive from a tap: the one moment a phone browser grants fullscreen and a landscape lock.
      continueGame: () => {
        enterGameScreen();
        void this.continueGame();
      },
      newGame: () => {
        enterGameScreen();
        void this.newGame();
      },
      openVisualLab: () => {
        location.href = './visuallab.html';
      },
      pause: () => this.pause(),
      resume: () => this.resume(),
      returnToCamp: () => {
        this.mode = 'playing';
        this.returnToCamp();
      },
      quitToMenu: () => {
        this.saveNow('quit');
        this.enterMenu();
      },
      respawn: () => this.respawn(),
      craft: (id) => this.craft(id),
      openInventory: () => this.openInventory(),
      openCrafting: (place) => this.openCrafting(place ?? 'workbench'),
      closeScreen: () => {
        if (this.mode === 'paused') this.resume();
        else this.ui.showScreen(this.mode === 'menu' ? 'menu' : 'none');
      },
      updateSettings: (p) => this.updateSettings(p),
      resetSettings: () => this.updateSettings({ ...DEFAULT_SETTINGS }),
      deleteSave: () => {
        this.saves.clear();
        if (this.mode !== 'menu' && this.mode !== 'boot') this.enterMenu();
      },
      getInventory: () => this.inventoryView(),
      getSettings: () => this.settings,
      // An unreadable save still counts, so New Game asks before replacing it.
      hasSave: () => this.saves.hasSave() || this.saves.load().error !== undefined,
      saveTimestamp: () => this.saves.timestamp(),
      getSaveSummary: () => this.saveSummary(),
      getReport: () => this.progression.report,
      dismissReport: () => this.progression.dismissReport(),
      getCraftTree: () => this.progression.treeView(),
      openBoard: () => this.openBoard(),
      getSurvey: () => this.progression.surveyView(),
      setCompassTarget: (id) => this.progression.setCompassTarget(id),
      openJournal: (tab) => this.openJournal(tab ?? 'discoveries'),
      getJournal: () => this.progression.journalView(),
      openAbout: () => this.ui.showScreen('about'),
      continueAfterEnding: () => {
        if (this.ui.screen === 'ending') this.ui.showScreen('none');
      },
      dropStack: (slot) => this.dropStack(slot),
    };
  }

  /** The saved game for the Continue card (null when there is none or it cannot be read). */
  saveSummary(): SaveSummary | null {
    const res = this.saves.load();
    return res.data ? summarizeSave(res.data) : null;
  }

  get version(): string {
    return VERSION;
  }

  /** Debug/test helper: a short machine-readable summary. */
  snapshot() {
    const p = this.player;
    return {
      mode: this.mode,
      screen: this.ui.screen,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, grounded: p.grounded },
      camera: { yaw: this.cameraRig.yaw, pitch: this.cameraRig.pitch },
      health: this.health.current,
      lantern: this.lanternFuel.fraction,
      atCamp: this.atCamp,
      backpack: this.backpack.toJSON(),
      storage: this.storage.toJSON(),
      equipment: { ...this.equipment.tiers },
      // What the objective pill shows: the tutorial step, then the Next line.
      objective: { ...this.progression.nextStep },
      journal: this.journal.toJSON(),
      target: this.mining.target ? { key: this.mining.target.key, inReach: this.mining.target.inReach, name: this.mining.target.name } : null,
      progress: this.miningRules.progress,
      drops: this.drops.count,
      stats: { ...this.stats },
      blockNames: BLOCKS.length,
      cache: this.progression.cache ? { ...this.progression.cache, items: { ...this.progression.cache.items } } : null,
      trip: this.progression.records.trip ? { ...this.progression.records.trip } : null,
      records: { ...this.progression.records.records },
      home: { steps: this.progression.walkToCamp, seconds: this.progression.homeSeconds, fuelState: this.progression.fuelState },
    };
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.desktop.dispose();
    this.audio.dispose();
    this.haptics?.dispose();
    this.ui.dispose();
    this.features.dispose();
    this.session.dispose();
    this.renderer.dispose();
  }
}

function totalOf(c: ItemCounts): number {
  let n = 0;
  for (const k in c) n += c[k as ItemId] ?? 0;
  return n;
}
