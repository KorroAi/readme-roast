import * as THREE from 'three';
import { B, BLOCKS } from '../config/blocks';
import { PLAYER, SAVE, WORLD, lanternForTier, packForTier, pickaxeForTier } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import type { RecipeId } from '../config/recipes';
import { EventBus, type GameEvents } from '../core/events';
import { clamp, damp } from '../core/math';
import { Rng } from '../core/rng';
import { t, type TextKey } from '../i18n';
import { DesktopInput } from '../input/DesktopInput';
import { consumeEdges, createInputState, type InputState } from '../input/types';
import { Renderer } from '../render/Renderer';
import type { PropSpec, Region } from '../world/gen/types';
import type { GameUi, UiFactory } from './GameUi';
import type { HudState, InventoryView, UiActions } from '../ui/types';
import { AudioSystem } from '../audio/AudioSystem';
import { ExplorerModel } from '../entities/character/ExplorerModel';
import { Backpack } from '../gameplay/Inventory';
import { CampStorage } from '../gameplay/Storage';
import { Equipment } from '../gameplay/Equipment';
import { Crafting } from '../gameplay/Crafting';
import { Lantern } from '../gameplay/Lantern';
import { Health } from '../gameplay/Health';
import { MiningProgress, rollDrop } from '../gameplay/Mining';
import { Objectives } from '../gameplay/Objectives';
import { Journal } from '../gameplay/Journal';
import { SaveSystem, LocalStorageStore } from '../save/SaveSystem';
import { DEFAULT_SETTINGS, type ItemCounts, type SaveData, type Settings } from '../save/types';
import { CameraRig } from './CameraRig';
import { PlayerController } from './PlayerController';
import { MiningController } from './MiningController';
import { DropSystem } from './Drops';
import { DebrisSystem } from './effects/Debris';
import { ParticleSystem } from './effects/Particles';
import { TargetMarker } from './effects/TargetMarker';
import { Waterfall } from './effects/Waterfall';
import { HaloSystem, collectWorldLights, type HaloSource } from './effects/Halos';
import { WorldSession } from './WorldSession';
import { Guidance } from './Guidance';
import { installDebugApi } from '../debug/DebugApi';
import { enterGameScreen } from '../ui/screenFormat';
import { Haptics } from '../ui/haptics';

export type GameMode = 'boot' | 'menu' | 'playing' | 'paused' | 'dead';

const VERSION = '0.1.0';
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
  desktop!: DesktopInput;
  cameraRig!: CameraRig;
  player!: PlayerController;
  explorer!: ExplorerModel;
  mining!: MiningController;
  miningRules = new MiningProgress();
  drops!: DropSystem;
  debris!: DebrisSystem;
  particles!: ParticleSystem;
  marker!: TargetMarker;
  guidance!: Guidance;
  waterfall: Waterfall | null = null;
  halos!: HaloSystem;
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
  private keepAwake = false;
  /** A New Game / Continue load is in progress (Back and repeated taps are ignored). */
  private loading = false;
  private autosaveTimer: number = SAVE.autosaveSeconds;
  private hintsShown = new Set<string>();
  private focusedProp: PropSpec | null = null;
  private lanternPos = new THREE.Vector3();
  private lanternSmoothed = new THREE.Vector3();
  private menuTime = 0;
  private healthLowWarned = false;
  private campRegenCarry = 0;
  private readonly tmpV = new THREE.Vector3();
  private readonly guidePath: Array<[number, number, number]> = [];
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
    this.explorer = new ExplorerModel(s.rig.uniforms);
    this.scene.add(this.explorer.root);
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

    this.guidePath.push([layout.spawn.x, layout.spawn.y, layout.spawn.z], ...layout.route.map((p) => [p[0], p[1], p[2]] as [number, number, number]));
    for (const key of ['stairsTop', 'landing', 'stairsBottom'] as const) {
      const p = layout.landmarks[key];
      if (p) this.guidePath.push([p[0], p[1], p[2]]);
    }
    this.guidance = new Guidance(this.guidePath);

    this.mining = new MiningController(s.world, this.bus, this.miningRules, {
      blockBroken: (x, y, z, oldId) => this.onBlockBroken(x, y, z, oldId),
      propBroken: (spec) => this.onPropBroken(spec),
      rollDrop: (drop) => rollDrop(drop, this.rng),
      pickaxe: () => pickaxeForTier(this.equipment.tiers.pickaxe),
      swing: (d) => this.explorer.swing(d),
      face: (x, z, dt) => this.player.faceToward(x, z, dt),
      hint: (text) => this.ui.hint(text, 2600),
      propRaycast: (o, d, m) => s.props.raycast(o, d, m),
      propById: (id) => s.liveProps.get(id) ?? null,
      propFlash: (id) => s.props.flash(id),
    }, this.marker, this.debris, this.particles, this.drops, this.cameraRig, this.rng);

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
      this.tutorial('pickup', 'hint.pickup');
    });
    bus.on('block:broken', (e) => objective(this.objectives.onEvent('block:broken', e)));
    bus.on('craft:done', (e) => objective(this.objectives.onEvent('craft:done', e)));
    bus.on('discovery', (e) => objective(this.objectives.onEvent('discovery', e)));
    bus.on('camp:entered', () => objective(this.objectives.onEvent('camp:entered', {})));
    bus.on('block:tooHard', ({ block }) => {
      if (block === B.IRON_ORE) this.discover('ironVein');
    });
  }

  private wireLifecycle(): void {
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        this.saveNow('background');
        this.audio.suspend();
        if (this.mode === 'playing') this.pause();
      } else this.audio.resume();
    };
    const onHide = () => this.saveNow('pagehide');
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
    this.desktop.releasePointer();
    this.ui.setGameplayActive(false);
    this.ui.showScreen('menu');
    this.audio.setPaused(false);
    // Stage the explorer on the ledge overlooking the Hollow, like a title card.
    // Body forward is (sin(yaw), cos(yaw)): 0.85 looks across the chamber toward the stairs and
    // the temple. Walk the explorer out to the very edge of the ledge for the title composition.
    const ledge = this.session.layout.landmarks.ledge;
    const yaw = 0.98;
    const w = this.session.world;
    let ex = ledge[0] + 0.5;
    let ez = ledge[2] + 0.5;
    for (let i = 0; i < 40; i++) {
      const nx = ex + Math.sin(yaw) * 0.25;
      const nz = ez + Math.cos(yaw) * 0.25;
      if (!w.isSolid(Math.floor(nx + Math.sin(yaw) * 0.9), Math.floor(ledge[1]) - 1, Math.floor(nz + Math.cos(yaw) * 0.9))) break;
      ex = nx;
      ez = nz;
    }
    this.player.teleport(ex, ledge[1], ez, yaw);
    this.menuTime = 0;
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
    this.tutorial('move', this.isTouch() ? 'hint.move' : 'hint.moveDesktop', 6000);
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
    try {
      this.ui.showScreen('loading');
      this.ui.setLoading(0.5, t('menu.loadingMesh'));
      await this.session.restore(res.data.worldEdits, res.data.removedProps);
      this.restoreProgress(res.data);
      this.halosDirty = true;
      this.startPlaying();
    } catch (e) {
      this.loadFailed(e);
      return;
    } finally {
      this.loading = false;
    }
    if (res.recovered) this.ui.toast(t('error.saveCorrupt'), 'warn');
  }

  private startPlaying(): void {
    this.mode = 'playing';
    this.ui.showScreen('none');
    this.ui.setGameplayActive(true);
    this.audio.setPaused(false);
    this.cameraRig.yaw = this.player.yaw + Math.PI;
    this.cameraRig.pitch = -0.2;
    this.cameraRig.snapTo(this.player.x, this.player.y + 1.45, this.player.z);
    this.atCamp = this.inRegion(this.session.layout.camp);
    this.refreshEquipmentVisuals();
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
    this.backpack = new Backpack(packForTier(1).slots);
    this.storage = new CampStorage();
    this.equipment = new Equipment();
    this.lanternFuel = new Lantern(lanternForTier(1).fuelSeconds);
    this.health = new Health(PLAYER.maxHealth);
    this.objectives = new Objectives();
    this.journal = new Journal();
    this.stats = { blocksMined: 0, deaths: 0, itemsBanked: 0 };
    this.playTime = 0;
    this.hintsShown.clear();
    this.drops.clear();
    this.player.teleport(spawn.x, spawn.y, spawn.z, spawn.yaw);
  }

  private restoreProgress(d: SaveData): void {
    this.equipment = new Equipment(d.equipment);
    this.backpack = Backpack.fromJSON(d.backpack, packForTier(this.equipment.tiers.pack).slots);
    this.storage = CampStorage.fromJSON(d.storage);
    this.lanternFuel = new Lantern(lanternForTier(this.equipment.tiers.lantern).fuelSeconds, d.player.lanternFuel);
    this.health = new Health(PLAYER.maxHealth, d.player.health);
    this.objectives = Objectives.fromJSON(d.objectives);
    this.journal = Journal.fromJSON({ discoveries: d.discoveries, keyItems: d.journal });
    this.stats = { ...d.stats };
    this.playTime = d.playTime;
    this.drops.clear();
    this.player.teleport(d.player.x, d.player.y, d.player.z, d.player.yaw);
    this.hintsShown = new Set(['move', 'look', 'mine', 'pickup']);
  }

  // ------------------------------------------------------------------------------------
  // Save

  buildSave(): SaveData {
    // On the death screen, save the respawn the player is about to get (backpack already lost).
    const dead = this.mode === 'dead';
    const spawn = this.session.layout.spawn;
    return {
      version: SAVE.version,
      savedAt: Date.now(),
      worldSeed: WORLD.seed,
      playTime: this.playTime,
      player: dead
        ? { x: spawn.x, y: spawn.y, z: spawn.z, yaw: spawn.yaw, health: PLAYER.maxHealth, lanternFuel: lanternForTier(this.equipment.tiers.lantern).fuelSeconds }
        : {
            x: this.player.x,
            y: this.player.y,
            z: this.player.z,
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
    };
  }

  saveNow(reason: string): boolean {
    if (this.mode !== 'playing' && this.mode !== 'paused' && this.mode !== 'dead') return false;
    if (this.loading) return false;
    const res = this.saves.save(this.buildSave());
    if (res.ok) this.bus.emit('game:saved', { reason });
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
    requestAnimationFrame(this.frame);
    // Behind the pause and death overlays the world is frozen: a low rate saves the battery.
    const idle = this.mode === 'paused' || this.mode === 'dead';
    const cap = idle ? 15 : this.renderer.preset.fpsCap;
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
    this.step(Math.min(0.05, Math.max(0, dt)));
  };

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
    this.menuTime += dt;
    const ledge = this.session.layout.landmarks.ledge;
    // A slow cinematic drift just past the ledge rim: pillars, the glimmerfall, the stairs and
    // the sealed gate below. (The explorer waits on the ledge, out of frame.)
    const t = this.menuTime;
    const cam = this.cameraRig.camera;
    cam.position.set(ledge[0] + 5 + Math.sin(t * 0.05) * 1.2, ledge[1] + 3.5 + Math.sin(t * 0.08) * 0.4, ledge[2] + 6 + Math.cos(t * 0.05) * 1.2);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-0.5 + Math.sin(t * 0.06) * 0.04, -2.2 + Math.sin(t * 0.045) * 0.16, 0);
    cam.fov = 68;
    cam.aspect = this.renderer.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.player.update(dt, 0, 0, false, 0, false);
    this.updateExplorer(dt, 0);
    this.updateLantern(dt, false);
    this.audio.update(dt, this.audioState(true));
  }

  private updateIdle(dt: number): void {
    // Paused or dead: keep the scene alive but frozen in gameplay terms.
    if (this.mode === 'paused' && this.input.pausePressed && this.ui.screen === 'pause') this.resume();
    this.updateExplorer(0, 0);
    this.updateLantern(0, false);
    this.audio.update(dt, this.audioState(true));
    this.cameraRig.update(0, this.player.x, this.player.y + 1.45 - this.player.stepOffset, this.player.z, this.renderer.aspect);
  }

  private updatePlaying(dt: number): void {
    const input = this.input;
    const blocked = this.ui.isBlockingInput();
    this.playTime += dt;

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
    const swinging = this.mining.update(dt, input, !blocked, hand.x, hand.y, hand.z);
    p.speedFactor = swinging ? 0.55 : 1;
    const mx = blocked ? 0 : input.moveX;
    const my = blocked ? 0 : input.moveY;
    const ev = p.update(dt, mx, my, !blocked && input.jumpPressed, this.cameraRig.moveYaw, !swinging);
    if (ev.jumped) this.bus.emit('player:jump', {});
    if (ev.footstep) this.bus.emit('player:footstep', { block: ev.footBlock, speed: p.speed });
    if (ev.landedSpeed > 0) this.onLanded(ev.landedSpeed);
    if (ev.rescued) this.ui.hint(t('hint.outOfReach'), 1500);

    if (!blocked && (Math.abs(mx) > 0.2 || Math.abs(my) > 0.2)) this.tutorial('mine', this.isTouch() ? 'hint.mine' : 'hint.mineDesktop', 6000, 4);
    if (!blocked && this.isTouch() && this.hintsShown.has('mine')) this.tutorial('look', 'hint.look', 5000, 11);

    this.cameraRig.update(dt, p.x, p.y + 1.45 - p.stepOffset, p.z, this.renderer.aspect);
    this.updateExplorer(dt, swinging ? 1 : 0);
    this.updateLantern(dt, true);

    this.drops.update(
      dt, this.time, p.x, p.y, p.z,
      (item) => ITEMS[item].keyItem || this.backpack.canAccept(item),
      (item, count) => this.collect(item, count),
      (item) => {
        this.bus.emit('item:rejected', { item });
        this.ui.hint(t('hint.backpackFull'), 2500);
      },
    );

    this.updateCamp(dt);
    this.updateDiscoveries();
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

  private handPosition(): THREE.Vector3 {
    return this.tmpV.set(this.player.x, this.player.y + 1.25, this.player.z);
  }

  private onLanded(speed: number): void {
    const below = this.session.world.get(Math.floor(this.player.x), Math.floor(this.player.y - 0.1), Math.floor(this.player.z));
    this.bus.emit('player:land', { fallSpeed: speed, block: below });
    this.cameraRig.addTrauma(clamp((speed - 6) / 20, 0, 0.6));
    const dmg = Health.fallDamage(speed);
    if (dmg > 0) {
      const dealt = this.health.damage(dmg);
      if (dealt > 0) this.bus.emit('player:damaged', { amount: dealt, cause: 'fall' });
      this.renderer.post.params.flash = 0.25;
      this.renderer.post.params.flashColor.setRGB(0.6, 0.05, 0.02);
      if (this.health.dead) this.die();
    }
  }

  private updateExplorer(dt: number, _mining: number): void {
    const p = this.player;
    const e = this.explorer;
    e.root.position.set(p.x, p.y - p.stepOffset, p.z);
    e.root.rotation.y = p.yaw;
    e.update(dt, {
      speed: p.speed,
      grounded: p.grounded,
      verticalVelocity: p.vy,
      aimPitch: this.mode === 'menu' ? -0.3 : -this.cameraRig.pitch * 0.5,
      time: this.time,
    });
    const camDist = this.cameraRig.camera.position.distanceTo(this.tmpV.set(p.x, p.y + 1.2, p.z));
    // In tight tunnels the boom is short and the explorer would hide the crosshair: dither them out.
    e.setFade(this.mode === 'menu' ? 1 : clamp((camDist - 0.7) / 1.3, 0.25, 1));
  }

  private updateLantern(dt: number, burn: boolean): void {
    const def = lanternForTier(this.equipment.tiers.lantern);
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
    const fuel = this.lanternFuel.fraction;
    const lit = this.lanternFuel.lit;
    this.explorer.setLantern(fuel, lit);
    this.explorer.getLanternWorldPosition(this.lanternPos);
    if (!Number.isFinite(this.lanternPos.x)) this.lanternPos.set(this.player.x, this.player.y + 1, this.player.z);
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
    const radius = def.radius * this.lanternFuel.radiusFactor;
    u.uLanternPos.value.copy(lp);
    u.uLanternRadius.value = radius;
    u.uLanternIntensity.value = def.intensity * (lit ? 0.75 + 0.25 * Math.min(1, fuel * 4) : 0.45) * flicker;
    const s = this.session;
    if (s.lantern.update(lp.x, lp.y, lp.z, radius)) {
      s.rig.markLanternDirty({ x: s.lantern.originX, y: s.lantern.originY, z: s.lantern.originZ });
    }
  }

  private collect(item: ItemId, count: number): number {
    let taken: number;
    if (ITEMS[item].keyItem) {
      this.journal.addKeyItem(item);
      taken = count;
    } else taken = this.backpack.add(item, count);
    if (taken > 0) {
      this.bus.emit('item:picked', { item, count: taken });
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
      if (!this.bank() && this.playTime > 5) this.ui.toast(t('toast.welcomeBack'), 'info');
      this.tutorial('workbench', 'hint.workbench', 5000);
      this.saveNow('camp');
    } else if (inCamp && !this.backpack.isEmpty) {
      // Drops that fly in after arrival, or a backpack restored from an in-camp save.
      if (this.bank()) this.saveNow('camp');
    } else if (!inCamp && this.atCamp) {
      this.atCamp = false;
      this.bus.emit('camp:left', {});
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

  /** Move the backpack into camp storage. @returns the number of items banked. */
  private bank(): number {
    const banked = this.storage.deposit(this.backpack);
    const total = Object.values(banked).reduce((a, b) => a + (b ?? 0), 0);
    if (total > 0) {
      this.stats.itemsBanked += total;
      this.bus.emit('items:banked', { total, items: banked });
      this.bus.emit('inventory:changed', {});
      this.ui.toast(t('toast.banked', { count: total }), 'good');
    }
    return total;
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
    this.ui.showDiscovery({ id, title: t(titleKey), body: t(bodyKey) });
    this.bus.emit('discovery', { id });
    this.renderer.post.params.flash = 0.18;
    this.renderer.post.params.flashColor.setRGB(0.25, 0.75, 0.9);
    this.particles.sparkle(this.player.x, this.player.y + 1.6, this.player.z, 0x8ff6ff, 16, this.rng, 2.2);
    this.saveNow('discovery');
  }

  private updateFocus(): void {
    const p = this.player;
    let best: PropSpec | null = null;
    let bestD = INTERACT_RANGE;
    for (const spec of this.session.liveProps.values()) {
      if (!spec.interact) continue;
      const d = Math.hypot(spec.x - p.x, (spec.y - p.y) * 0.7, spec.z - p.z);
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
    switch (spec.interact) {
      case 'craft':
        return t('hint.interactWorkbench');
      case 'storage':
        return t('hint.interactChest');
      case 'rest':
        return t('hint.interactCampfire');
      case 'relic':
        return t('hint.interactTablet');
      default:
        return t('hud.interact');
    }
  }

  interact(spec: PropSpec): void {
    switch (spec.interact) {
      case 'craft':
        this.openCrafting();
        break;
      case 'storage':
        this.openInventory();
        break;
      case 'rest':
        this.health.heal(this.health.max);
        this.lanternFuel.refill(lanternForTier(this.equipment.tiers.lantern));
        this.ui.toast(t('toast.rested'), 'good');
        this.saveNow('rest');
        break;
      case 'relic':
        this.collect('ancientTablet', 1);
        this.session.removeProp(spec.id);
        this.focusedProp = null;
        this.ui.touch.setInteractVisible(null);
        this.discover('tablet');
        break;
    }
  }

  private onBlockBroken(x: number, y: number, z: number, oldId: number): void {
    this.stats.blocksMined++;
    // Mining under a lamp makes it settle (its emitter moves): check before the settle runs.
    for (const p of this.session.liveProps.values()) {
      if (p.anchor && p.anchor[0] === x && p.anchor[1] === y && p.anchor[2] === z) this.halosDirty = true;
    }
    this.session.blockChanged(x, y, z, oldId);
    if (oldId === B.CRYSTAL) this.discover('crystals');
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
    return out;
  }

  private onPropBroken(spec: PropSpec): void {
    this.session.removeProp(spec.id);
    this.halosDirty = true;
    if (this.focusedProp?.id === spec.id) this.focusedProp = null;
  }

  private updateHealthWarnings(): void {
    const low = this.health.current / this.health.max < 0.3;
    if (low && !this.healthLowWarned) this.ui.hint(t('hint.healthLow'), 3000);
    this.healthLowWarned = low;
  }

  private die(): void {
    this.mode = 'dead';
    this.mining.cancel();
    this.input.mining = false;
    this.desktop.releasePointer();
    const lost: ItemCounts = this.backpack.takeAll();
    const ground = this.drops.clear();
    for (const [k, v] of Object.entries(ground)) {
      if (!ITEMS[k as ItemId].keyItem) lost[k as ItemId] = (lost[k as ItemId] ?? 0) + (v ?? 0);
    }
    this.stats.deaths++;
    this.bus.emit('player:died', { lost });
    this.ui.setGameplayActive(false);
    this.ui.showDeath(lost);
    this.saveNow('death');
  }

  respawn(): void {
    const spawn = this.session.layout.spawn;
    this.health = new Health(PLAYER.maxHealth);
    this.lanternFuel.refill(lanternForTier(this.equipment.tiers.lantern));
    this.player.teleport(spawn.x, spawn.y, spawn.z, spawn.yaw);
    this.mode = 'playing';
    this.audio.setPaused(false);
    this.ui.showScreen('none');
    this.ui.setGameplayActive(true);
    this.cameraRig.yaw = this.player.yaw + Math.PI;
    this.cameraRig.pitch = -0.2;
    this.cameraRig.snapTo(spawn.x, spawn.y + 1.45, spawn.z);
    this.atCamp = true;
    this.bus.emit('player:respawned', {});
    this.saveNow('respawn');
  }

  returnToCamp(): void {
    const lost = this.backpack.takeAll();
    this.drops.clear();
    const n = Object.values(lost).reduce((a, b) => a + (b ?? 0), 0);
    this.respawn();
    if (n > 0) this.ui.toast(t('death.lost') + ': ' + n, 'warn');
  }

  // ------------------------------------------------------------------------------------
  // Crafting & inventory

  craft(recipe: RecipeId): void {
    const before = { ...this.equipment.tiers };
    const res = Crafting.craft(recipe, this.backpack, this.storage, this.equipment, this.atCamp);
    if (!res.ok) {
      this.bus.emit('craft:failed', { recipe, reason: res.reason });
      this.audio.ui('error');
      return;
    }
    if (this.equipment.tiers.pack !== before.pack) this.backpack.resize(packForTier(this.equipment.tiers.pack).slots);
    if (this.equipment.tiers.lantern !== before.lantern) this.lanternFuel.refill(lanternForTier(this.equipment.tiers.lantern));
    this.refreshEquipmentVisuals();
    this.bus.emit('craft:done', { recipe });
    this.bus.emit('inventory:changed', {});
    const name = t(recipe === 'copperPickaxe' ? 'recipe.copperPickaxe' : recipe === 'copperLantern' ? 'recipe.copperLantern' : 'recipe.sturdyPack');
    this.ui.toast(t('toast.crafted', { item: name }), 'good');
    this.particles.sparkle(this.player.x, this.player.y + 1.2, this.player.z, 0xffc58a, 18, this.rng, 2);
    this.saveNow('craft');
  }

  private refreshEquipmentVisuals(): void {
    this.explorer.setEquipment(this.equipment.tiers.pickaxe, this.equipment.tiers.lantern);
  }

  openInventory(): void {
    if (this.mode !== 'playing') return;
    this.mining.cancel();
    this.input.mining = false;
    this.desktop.releasePointer();
    this.ui.showScreen('inventory');
  }

  openCrafting(): void {
    if (this.mode !== 'playing') return;
    this.mining.cancel();
    this.input.mining = false;
    this.desktop.releasePointer();
    this.ui.showScreen('crafting');
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
    };
  }

  // ------------------------------------------------------------------------------------
  // HUD / audio state

  private hudState(): HudState {
    const p = this.player;
    const target = this.guidance.next(p.x, p.y, p.z);
    const camp = this.session.layout.landmarks.campfire;
    const info = this.renderer.gl.info.render;
    return {
      health: this.health.current,
      maxHealth: this.health.max,
      lantern: this.lanternFuel.fraction,
      lanternLow: this.lanternFuel.low,
      backpackUsed: this.backpack.usedSlots,
      backpackMax: this.backpack.slotCount,
      depth: Math.max(0, Math.round(WORLD.depthOffset - p.y)),
      atCamp: this.atCamp,
      campBearing: Guidance.bearing(this.cameraRig.yaw, p.x, p.z, target[0], target[2]),
      campDistance: Math.round(Math.hypot(camp[0] - p.x, camp[1] - p.y, camp[2] - p.z)),
      objectiveText: this.objectives.current().text,
      interactLabel: this.focusedProp ? this.interactLabel(this.focusedProp) : null,
      target: this.mining.hudTarget(),
      showCrosshair: this.desktop.pointerLocked,
      fps: this.fps,
      frameMs: Math.round(this.frameMs * 10) / 10,
      drawCalls: info.calls,
      triangles: Math.round(info.triangles / 1000),
    };
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
    this.applyAudioSettings();
    this.ui.applySettings(this.settings);
  }

  isTouch(): boolean {
    return this.input.lastDevice === 'touch' && matchMedia('(pointer: coarse)').matches;
  }

  /** Show a tutorial hint once per game. */
  private tutorial(id: string, key: TextKey, ms = 4000, minPlaySeconds = 0): void {
    if (this.hintsShown.has(id) || this.playTime < minPlaySeconds) return;
    this.hintsShown.add(id);
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
      craft: (r) => this.craft(r),
      openInventory: () => this.openInventory(),
      openCrafting: () => this.openCrafting(),
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
    };
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
      objective: this.objectives.current(),
      journal: this.journal.toJSON(),
      target: this.mining.target ? { key: this.mining.target.key, inReach: this.mining.target.inReach, name: this.mining.target.name } : null,
      progress: this.miningRules.progress,
      drops: this.drops.count,
      stats: { ...this.stats },
      blockNames: BLOCKS.length,
    };
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.desktop.dispose();
    this.audio.dispose();
    this.haptics?.dispose();
    this.ui.dispose();
    this.session.dispose();
    this.renderer.dispose();
  }
}
