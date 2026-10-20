import * as THREE from 'three';
import { BLOCKS, VALUE_CLASS } from '../../config/blocks';
import { Rng } from '../../core/rng';
import { ExplorerModel } from '../../entities/character/ExplorerModel';
import { EventEntities } from '../../game/effects/EventEntities';
import { Lanterns } from '../../game/effects/Lanterns';
import { CHEST_TIER_GLOW } from '../props/descentModels';
import { KEY_COLOUR } from '../../world/descent/biomeKits';
import type { EventPath, IdleBus } from '../../idle/bus';
import { biomeAt, nextBiomeStart } from '../../idle/config/biomes';
import { CELL } from '../../idle/model/state';
import { RING_SX, SLAB_ROWS, storageRow } from '../../world/descent/RingWorld';
import { CELL_Z1 } from '../../world/descent/slab';
import { MAT_SIDE, MATERIAL_NAMES } from '../materials';
import type { Renderer } from '../Renderer';
import { Beams, type BeamSpec } from '../fx/Beams';
import { GpuParticles, type ParticleBurst, type ParticleKind } from '../fx/GpuParticles';
import { Shards } from '../fx/Shards';
import { RigidBatch } from '../fx/rigidBatch';
import { BiomeLook } from './BiomeLook';
import type { CavernProps } from './CavernProps';
import { Creatures } from './Creatures';
import { CrewRenderer } from './CrewRenderer';
import { CUT_Z, DescentCamera, SHAFT_X0, defaultLayout, type CameraLayout, type ColumnStripsPx } from './DescentCamera';
import { DescentWorld } from './DescentWorld';
import { LiquidPlane } from './LiquidPlane';
import { SealRenderer, type SealPhase } from './SealRenderer';
import { SectionField } from './SectionField';
import { ShaftDressing } from './ShaftDressing';
import { SurfaceSky } from './SurfaceSky';
import { ToolRig } from './ToolRig';

/**
 * The one facade the game drives (BUILD §1, SPEC §11.4): the streamed ring world, its meshes and light, the
 * descent camera, the foreman, the strike ghost, the crew rigs, the shaft dressing, the sky, cell FX, GPU
 * particles and shards, beams, the seal and its Warden, creatures, event entities, the lanterns (planted, the
 * ghost, the Other Lantern) and the Vista backdrops. IdleGame / DigController call it; nothing else in src/game
 * reaches into src/render.
 *
 * Coordinates for callers are game coordinates: `row` is the depth row (metres below the surface, the floor
 * row is `depth`), `col` is the shaft column 0..6 (screen left to right). Screen values are CSS px.
 *
 * Frame order (SPEC §12.2): the game steps the model, then calls `applyBreaks()` for this frame's broken
 * cells, `cellFx()` for hits, `strike()` / `burst()` / `shock()` / `kick()` / `trauma()` for feedback, then
 * `frame(dt, fxDt)` once, which streams slabs, updates the camera and every effect, and renders (post included).
 *
 * W2 (BUILD §3.2): `bindBus(bus)` once after `attach()` lets the scene follow the model's world events by itself
 * (event targets, entity hits and removals, popped and opened chests, seal phases and weak points, repainted
 * cells, planted lanterns, the ghost pass, breakthroughs and the camera part of the biome reveal), so the game
 * shell only routes taps. The model reads it needs beyond the shaft come through the optional DescentSource
 * methods (record, planted lanterns, the ghost's depth, the seal, taken harvests).
 */

/** What the scene reads from the model each frame (IdleGame adapts IdleState to it). */
export interface DescentSource {
  /** Seed of this run (slabs are a pure function of it and the slab index). */
  runSeed(): number;
  /** The floor row: the depth (metres) of the topmost row that still has a solid cell. */
  depth(): number;
  /** The model's cell kind at (row, col) (CellKind from src/idle/model/state.ts); rows below the
   *  shaft model's window come from the same pure table. */
  cellKind(row: number, col: number): number;
  /** Remaining fraction of cell (row, col): 1 intact .. 0 broken. */
  cellLeft(row: number, col: number): number;
  /** Owned crew line levels (index = line; 0 = not hired). */
  crew(): ArrayLike<number>;
  /** The pick level (its tier is floor(level / 25) + 1). */
  pickLevel(): number;
  /** The model clock (seconds), so crew rigs strike on the model's impact frames. */
  time(): number;
  /** Seconds into crew line `line`'s loop (default: time() mod its period). */
  crewPhase?(line: number): number;
  /** Lifetime deepest row (the Other Lantern hangs 600 m below it). Default: the floor. */
  record?(): number;
  /** Planted lanterns of past runs (`meta.planted`). */
  planted?(): ReadonlyArray<{ depth: number; n: number }>;
  /** Where the ghost (the par run) is now, in rows; null when there is none. */
  ghostDepth?(): number | null;
  /** The seal fight now (`state.seal`): null when the floor is not a never-opened seal. */
  sealView?(): { biome: number; depth: number; phase: 'fight' | 'held'; left: number } | null;
  /** True when this tappable was already harvested this run (a regenerated slab skips it). */
  taken?(id: string): boolean;
  /** Crowns per crew line (every 50 levels; the rigs' glow). Default: floor(level / 50). */
  crowns?(line: number): number;
}

/** A cell the model broke this frame. `kind` is the CellKind it had; `crumble` for the leftover crumble. */
export interface DescentBreak {
  row: number;
  col: number;
  kind: number;
  crumble?: boolean;
  /** The hit that broke it came from the crew (rigs swing) rather than a tap. */
  crew?: boolean;
  /** A crit broke it (hotter shards). */
  crit?: boolean;
}

export type BurstKind = 'dust' | 'chips' | 'sparks' | 'gold' | 'gem' | 'crumble' | 'star' | 'embers' | 'confetti' | 'biome';

/** Something tappable on screen (entity-first picking, SPEC §3.1; ids of W2.md §3.5). */
export interface PickedEntity {
  /** `crystal:<n>`, `gem:<n>`, `fossil:<n>`, `crate:<n>`, `note:<n>`, `cache:<n>`, `creature:<kind>:<n>`,
   *  `event:<eventId>:<n>`, `lantern:<n>`, `weak:<sealId>:<i>`, `chest:<n>`, `moth:<n>`. */
  id: string;
  kind: 'chest' | 'gem' | 'fossil' | 'crystal' | 'crate' | 'note' | 'creature' | 'lantern' | 'cache' | 'event' | 'weak' | 'moth';
  /** Screen position of its centre (CSS px) and the tap radius used. */
  x: number;
  y: number;
  radius: number;
  /** Depth row it sits at (for rewards scaled by depth). */
  row: number;
  /** Taps it takes in all. */
  taps: number;
}

export interface DescentMotion {
  /** 'full' | 'reduced' | 'off' (Settings.motion). */
  motion: 'full' | 'reduced' | 'off';
  /** Camera shake 0..1. */
  shake: number;
  /** Battery preset: no camera life. */
  battery?: boolean;
}

/** A Vista or Reveal Hall opening (W2.md §3.3): where the back wall opens onto 2D's backdrop layers. */
export interface VistaOpening {
  id: string;
  biome: number;
  /** World y range (y0 the top, y1 the bottom: y0 > y1) and the x range of the opening. */
  y0: number;
  y1: number;
  x0: number;
  x1: number;
}

/** The backdrop host DescentScene drives (2D's VistaBackdrop satisfies it; a no-op until it is bound). */
export interface VistaHost {
  readonly group?: THREE.Object3D;
  show(o: VistaOpening): void;
  hide(id: string): void;
  update?(time: number, camera: THREE.Camera): void;
}

/** Debug and test surface (window.__DD__.descent). */
export interface DescentDebug {
  /** Chunks whose GPU mesh differs from a fresh main-thread mesh (after flush). */
  meshCheck(): Promise<{ checked: number; mismatched: number }>;
  /** Light texels that differ from a fresh compute of the live window (RGB), and openness texels (A). */
  lightCheck(): { checked: number; mismatched: number; maxDiff: number; openMismatched: number; openMaxDiff: number };
  /** Chunks of the slabs in view (the floor's and its neighbours) with no mesh since their slab was written. */
  missingChunks(): number;
  /** Live slab range, slabs applied, the last slab apply time (ms). */
  slabs(): { first: number; last: number; applied: number; lastApplyMs: number; maxApplyMs: number; pending: number; worker: boolean };
  /** Live shards and shards spawned since boot (W1's "debris"). */
  debris(): { live: number; spawned: number };
  /** GPU particles: live, the preset cap, spawned and refused by the governor since boot. */
  particles(): { live: number; cap: number; spawned: number; refused: number };
  /** Shards: live, the preset cap, bursts spawned and refused. */
  shards(): { live: number; cap: number; spawned: number; refused: number };
  /** The voxel id at a cell's front voxel (0 = air) - to check that a break removed it. */
  cellVoxel(row: number, col: number): number;
  /** Shader programs compiled (P3). */
  programs(): number;
  /** Lamps lit, crew figures shown, live props, creatures, event entities. */
  dressing(): { lamps: number; crew: number; props: number; creatures: number; entities: number; batches: number; liquids: number };
  /** Draw calls of the last frame (P1). */
  calls(): number;
}

const FX_SLOTS = 8;
/** Flash decays from 0.6 to 0 over 67 ms; the pop rises to its peak at F2 (33 ms) and is back by F4. */
const FLASH_MS = 67;
const POP_MS = 100;
const IMPACTS = 4;
/** Event entities sit just in front of the cut, so their screen position matches the shaft's columns. */
export const ENTITY_Z = CUT_Z + 0.25;

interface CellFxSlot {
  row: number;
  col: number;
  flash: number;
  pop: number;
  popT: number;
  crack: number;
  /** Last touched (ms), for slot reuse. */
  t: number;
}

interface ImpactLight {
  t: number;
  dur: number;
  intensity: number;
}

/** World point of an EventPath at u (0..1), the floor row at spawn being `floor` (bus.ts: x in columns, y rows below the floor). */
export function eventPathPoint(path: EventPath, floor: number, u: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  const t = Math.min(1, Math.max(0, u));
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  const px = a * path.x0 + b * path.cx + c * path.x1;
  const py = a * path.y0 + b * path.cy + c * path.y1;
  out.x = SHAFT_X0 + 0.5 + px;
  out.y = -floor - py;
  return out;
}

const NO_VISTAS: VistaHost = { show: () => {}, hide: () => {} };

export class DescentScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera();
  readonly rig: DescentCamera;
  readonly world: DescentWorld;
  readonly biomeLook = new BiomeLook();
  readonly section: SectionField;
  readonly dressing: ShaftDressing;
  readonly sky = new SurfaceSky();
  readonly tool = new ToolRig();
  readonly crew: CrewRenderer;
  readonly foreman: ExplorerModel;
  readonly particles: GpuParticles;
  readonly shards: Shards;
  readonly beams = new Beams();
  readonly sealView: SealRenderer;
  readonly creatures: Creatures;
  readonly entities: EventEntities;
  readonly lanterns: Lanterns;
  readonly cavernProps: CavernProps;
  readonly liquids: LiquidPlane;
  /** 2D's VistaBackdrop (W2.md §3.3), bound with `setVistas()`; caverns.ts decides where they open. */
  vistas: VistaHost = NO_VISTAS;
  readonly debug: DescentDebug;
  /** The bound model (null before attach). */
  source: DescentSource | null = null;
  private floor = 0;
  private foremanX = SHAFT_X0 + 3.5;
  private foremanTarget = SHAFT_X0 + 3.5;
  private lastStrikeAt = -1e9;
  private time = 0;
  private nowMs = 0;
  private readonly fx: CellFxSlot[] = [];
  private readonly impacts: ImpactLight[] = [];
  private nextImpact = 0;
  private readonly rng = new Rng(0xd16);
  private building: Promise<void> | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly lanternPos = new THREE.Vector3();
  private menu = false;
  private readonly picks: PickedEntity[] = [];
  private picksAt = -1;
  private lastCalls = 0;
  private unbind: Array<() => void> = [];
  /** Vistas already dollied this run. */
  private readonly dollied = new Set<string>();
  /** The foreman and the crew rigs drawn as one mesh each (P1). */
  private readonly foremanBatch: RigidBatch;
  private readonly crewBatch: RigidBatch;

  constructor(readonly renderer: Renderer) {
    this.rig = new DescentCamera(defaultLayout(typeof window !== 'undefined' ? window.innerWidth || 390 : 390, typeof window !== 'undefined' ? window.innerHeight || 844 : 844));
    this.world = new DescentWorld();
    this.section = new SectionField(this.world.ring);
    const tu = this.world.terrain.uniforms;
    tu.uSectionField.value = this.section.texture;
    tu.uSection.value.x = 1;
    // Valuables by material layer (glints, the pulse and the shine sweep).
    const values = new Array(MATERIAL_NAMES.length).fill(0);
    for (let id = 0; id < 256; id++) if (VALUE_CLASS[id]) values[MAT_SIDE[id]] = Math.max(values[MAT_SIDE[id]], VALUE_CLASS[id] - 1);
    this.world.terrain.setValues(values);
    const lu = this.world.rig.uniforms;
    this.dressing = new ShaftDressing(this.world, lu);
    this.crew = new CrewRenderer(lu);
    this.foreman = new ExplorerModel(lu);
    this.foreman.setEquipment(1, 1);
    this.foreman.setLantern(1, true);
    this.foreman.root.scale.setScalar(0.92);
    const caps = DescentScene.caps(renderer.quality);
    this.particles = new GpuParticles(lu, caps.particles);
    this.shards = new Shards(lu, tu.uMat.value, { uSectionKey: tu.uSectionKey, uCamFill: tu.uCamFill }, caps.shards);
    this.sealView = new SealRenderer(lu);
    this.creatures = new Creatures(lu);
    this.entities = new EventEntities(lu);
    this.lanterns = new Lanterns(lu);
    this.cavernProps = this.world.cavernProps;
    this.world.onSlab = (k, slab) => {
      // A streamed slab rewrites its ring rows: the section field is recomputed whole (under 1 ms).
      this.section.markDirty();
      for (const c of slab.creatures) if (!this.source?.taken?.(c.id)) this.creatures.add(c);
      for (const l of slab.liquids) this.liquids.add(l);
      void k;
    };
    this.world.onDrop = (k, slab) => {
      if (!slab) return;
      this.creatures.removeMany(slab.creatures.map((c) => c.id));
      for (const l of slab.liquids) this.liquids.remove(l.id);
      void k;
    };
    this.liquids = new LiquidPlane(lu);
    this.scene.add(
      this.world.group,
      this.sky.group,
      this.dressing.halos.mesh,
      this.crew.group,
      this.foreman.root,
      this.tool.group,
      this.liquids.group,
      this.sealView.group,
      this.creatures.group,
      this.entities.group,
      this.lanterns.group,
      this.shards.mesh,
      this.beams.mesh,
      this.particles.mesh,
    );
    this.foreman.root.name = 'foreman';
    this.foremanBatch = RigidBatch.of(this.foreman.root);
    this.crewBatch = RigidBatch.of(this.crew.group);
    for (let i = 0; i < FX_SLOTS; i++) this.fx.push({ row: -999, col: 0, flash: 0, pop: 0, popT: 1e9, crack: 0, t: -1e9 });
    for (let i = 0; i < IMPACTS; i++) this.impacts.push({ t: 1e9, dur: 1, intensity: 0 });
    // The lantern hangs in the apron in front of the cut (CRITIQUE B2): radius 9 m, intensity 1.35.
    lu.uLanternRadius.value = 9;
    lu.uLanternIntensity.value = 1.35;
    this.debug = {
      meshCheck: async () => {
        await this.world.chunks.flush();
        const r = this.world.chunks.verify();
        return { checked: r.checked, mismatched: r.mismatched.length };
      },
      lightCheck: () => this.world.lightCheck(),
      missingChunks: () => (this.building ? 0 : this.world.missingNear(this.floor)),
      slabs: () => ({ ...this.world.window, applied: this.world.stats.applied, lastApplyMs: this.world.stats.lastApplyMs, maxApplyMs: this.world.stats.maxApplyMs, pending: this.world.pendingSlabs, worker: this.world.loader.usingWorker }),
      debris: () => ({ live: this.shards.live, spawned: this.shards.spawned }),
      particles: () => ({ live: this.particles.live, cap: this.particles.cap, spawned: this.particles.spawned, refused: this.particles.refused }),
      shards: () => ({ live: this.shards.live, cap: this.shards.cap, spawned: this.shards.spawned, refused: this.shards.refused }),
      cellVoxel: (row, col) => this.world.ring.get(SHAFT_X0 + col, -row - 1, CELL_Z1),
      programs: () => this.programs(),
      dressing: () => ({
        lamps: this.dressing.lamps,
        crew: this.crew.visible,
        props: this.world.liveProps.size,
        creatures: this.creatures.views().length,
        entities: this.entities.views().length,
        batches: this.cavernProps.batches,
        liquids: this.liquids.count,
      }),
      calls: () => this.lastCalls,
    };
    for (const p of SurfaceSky.campProps()) this.world.props.add(p);
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __DD__?: Record<string, unknown> };
      w.__DD__ = { ...(w.__DD__ ?? {}), descent: this.debug };
    }
  }

  /** Live caps per preset (SPEC §11.5): GPU particles, shards. */
  static caps(q: string): { particles: number; shards: number } {
    if (q === 'battery') return { particles: 384, shards: 72 };
    if (q === 'high') return { particles: 2048, shards: 320 };
    return { particles: 1024, shards: 192 };
  }

  /** The shaft cell kinds of slab k from the model (AIR where dug or broken). */
  private kindsFor = (k: number): Uint8Array => {
    const out = new Uint8Array(SLAB_ROWS * 7);
    const s = this.source;
    if (!s || k < 0) return out;
    const floor = s.depth();
    for (let r = 0; r < SLAB_ROWS; r++) {
      const row = k * SLAB_ROWS + r;
      for (let c = 0; c < 7; c++) {
        if (row < floor) continue;
        const kind = s.cellKind(row, c);
        out[r * 7 + c] = s.cellLeft(row, c) <= 0 ? CELL.AIR : kind;
      }
    }
    return out;
  };

  /** Bind the model and build the window around its floor (the first slabs, light and meshes). */
  async attach(source: DescentSource): Promise<void> {
    this.source = source;
    this.floor = source.depth();
    this.rig.setFloor(this.floor, true);
    this.biomeLook.update(this.floor, 0);
    this.building = this.world.build(source.runSeed(), this.floor, this.kindsFor);
    await this.building;
    this.building = null;
    this.section.markDirty();
    this.dressing.reset();
    this.precompile();
    this.warmUp();
  }

  /**
   * Warm the break path at boot (W2 MUST 0: the first break cost a 1.0-1.4 s frame on SwiftShader): one break and
   * restore of a cell in the deepest live slab (the light fill, the openness box, the section field, the remesh
   * through the workers), and one frame with a shard block and a particle alive far below the view (their buffers
   * upload now, not on the first tap).
   */
  private warmUp(): void {
    const { last } = this.world.window;
    const row = last * SLAB_ROWS + 8;
    if (!this.world.ring.hasSlab(last)) return;
    const col = 3;
    const x = SHAFT_X0 + col;
    const y = -row - 1;
    const saved: number[] = [];
    for (let z = CELL_Z1 - 2; z <= CELL_Z1; z++) saved.push(this.world.ring.get(x, y, z));
    this.world.breakCells([{ row, col }]);
    for (let z = CELL_Z1 - 2, i = 0; z <= CELL_Z1; z++, i++) this.world.setVoxel(x, y, z, saved[i]);
    this.world.light.computeOpennessBox(x - 7, x + 7, ((y - 7) % 160 + 160) % 160, ((y - 7) % 160 + 160) % 160 + 14, CELL_Z1 - 9, 63);
    this.section.markDirty();
    this.section.update();
    this.shards.shatter({ x: x + 0.5, y: y + 0.5, z: CUT_Z - 0.5, blockId: saved[2], layer: MAT_SIDE[saved[2]] ?? 0, floorY: -1e4 });
    this.particles.burst({ kind: 'dust', x: x + 0.5, y: y + 0.5, z: CUT_Z + 0.3, count: 1, color: 0x808080, speed: [0, 0], life: [0.05, 0.05], size: [0.1, 0.1] }, this.rng);
    this.shards.update(0);
    this.particles.update(0, this.camera);
    this.world.uploadLight(this.renderer.gl);
    this.renderer.render(this.scene, this.camera, this.time);
    // The warm-up's counters do not count as play.
    this.shards.spawned = 0;
    this.particles.spawned = 0;
  }

  /**
   * Follow the model's world events (W2): event targets, entity hits and removals, chests, the seal and its
   * weak points, repainted cells, lanterns, breakthroughs and the camera part of the biome reveal. Call once
   * after attach(); @returns the unsubscribe.
   */
  bindBus(bus: IdleBus): () => void {
    const u = this.unbind;
    u.push(
      bus.on('event:target', (p) => this.spawnTarget(p)),
      bus.on('event:hit', (p) => {
        if (p.left <= 0 && p.caught) this.removeEntity(p.id);
        else this.hitEntity(p.id, p.left);
      }),
      bus.on('event:miss', (p) => this.entities.remove(p.id, false)),
      bus.on('entity:hit', (p) => this.hitEntity(p.id, p.need - p.hits)),
      bus.on('entity:done', (p) => this.removeEntity(p.id)),
      bus.on('find:surface', (p) => void this.spawnEntity(p.kind, p.depth, p.col, p.id, p.life)),
      bus.on('moth:spawn', (p) => {
        const t = this.source ? this.source.time() : 0;
        // The Lucky Moth crosses the shaft in the lower part of the world region (CRITIQUE MUST 8).
        const ltr = (p.id.length + Math.floor(t)) % 2 === 0;
        this.entities.spawn({ id: p.id, kind: 'moth', t0: t, t1: t + p.life, floor: this.floor, taps: 1, path: { x0: ltr ? -1.2 : 7.2, y0: -1.6, cx: 3, cy: -3.2, x1: ltr ? 7.4 : -1.4, y1: -1.2 } });
      }),
      bus.on('moth:catch', (p) => this.removeEntity(p.id)),
      bus.on('moth:gone', (p) => this.entities.remove(p.id, false)),
      bus.on('chest:exposed', (p) => this.popChest(p.id, p.col, p.depth, p.floor)),
      bus.on('chest:open', (p) => this.openChest(p.id, p.tier)),
      bus.on('seal:start', (p) => this.seal(p.biome, 'fighting', 1)),
      bus.on('seal:hit', (p) => {
        this.sealView.left = p.left;
        this.sealView.hit(p.weak);
        if (p.weak) this.weakBurst();
      }),
      bus.on('seal:weak', (p) => {
        if (p.point !== undefined) this.weakPoint(p.point, p.lit);
      }),
      bus.on('seal:fail', (p) => this.seal(p.biome, 'held', p.left)),
      bus.on('seal:break', (p) => this.breakSeal(p.biome, p.depth)),
      bus.on('gate:break', (p) => this.gateFlash(p.depth)),
      bus.on('cells:change', (p) => this.repaint(p.cells)),
      bus.on('lantern:planted', (p) => this.plant(p.depth, p.n)),
      bus.on('lantern:tap', (p) => {
        this.lanterns.usePlanted(p.n);
        this.removeEntity(p.id);
      }),
      bus.on('ghost:pass', () => this.ghostBurst()),
      bus.on('biome:reveal', (p) => this.reveal(p.biome)),
    );
    return () => {
      for (const f of this.unbind) f();
      this.unbind = [];
    };
  }

  /** Bind 2D's VistaBackdrop (its group joins the scene). */
  setVistas(host: VistaHost): void {
    if (this.vistas.group) this.scene.remove(this.vistas.group);
    this.vistas = host;
    if (host.group) this.scene.add(host.group);
  }

  /**
   * Compile every material the scene can draw now, hidden ones included (shards, ghosts, crew rigs, the
   * Warden), so no shader compiles mid-play (P3).
   */
  precompile(): void {
    const hidden: THREE.Object3D[] = [];
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    this.rig.apply(this.camera);
    this.renderer.gl.compile(this.scene, this.camera);
    for (const o of hidden) o.visible = false;
  }

  /** Jump the window to a new floor (setDepth, Rekindle): regenerates the slabs around it. */
  async jump(depth: number): Promise<void> {
    if (!this.source) return;
    this.floor = depth;
    this.rig.setFloor(depth, true);
    this.biomeLook.update(depth, 0);
    this.dressing.reset();
    this.building = this.world.build(this.source.runSeed(), depth, this.kindsFor);
    await this.building;
    this.building = null;
    this.section.markDirty();
  }

  /** Stream, animate and render one frame. `dt` real seconds; `fxDt` the FX clock (0 during a hit-stop). */
  frame(dt: number, fxDt: number = dt): void {
    const s = this.source;
    this.time += dt;
    this.nowMs += fxDt * 1000;
    if (s && !this.building) {
      const d = s.depth();
      if (d !== this.floor) {
        if (Math.abs(d - this.floor) > 64) void this.jump(d);
        else {
          this.floor = d;
          this.rig.setFloor(d);
        }
      }
      this.world.update(this.floor, this.camera.position, this.renderer.gl);
      this.dressing.update(this.floor);
      this.crew.setLevels(s.crew());
      const phase = (line: number) => (s.crewPhase ? s.crewPhase(line) : s.time());
      this.crew.update(this.rig.followY, phase);
      this.crewBatch.update();
      for (const imp of this.crew.impacts) this.crewImpact(imp.line, imp.x, imp.y);
      this.tool.setTier(Math.floor(s.pickLevel() / 25) + 1);
      this.updateSeal(s);
    }
    this.section.update();
    // The camera, then the lantern in the apron at the foreman's column (CRITIQUE B2).
    this.rig.update(dt);
    this.rig.apply(this.camera);
    if (this.rig.landed) {
      // The breakthrough's (or the reveal's) landing: a dust skirt of 64 on the floor.
      const y = -this.floor;
      this.particles.burst({ kind: 'dust', x: SHAFT_X0 + 3.5, y: y + 0.2, z: CUT_Z - 0.2, count: 64, color: 0x9a8a78, color2: 0x6a5e52, speed: [1.5, 4.5], dir: [0, 0.25, 0.4], spread: 0.95, life: [0.7, 1.4], size: [0.3, 0.9], drag: 2.4, gravity: -0.3, jitter: 3.2 }, this.rng);
    }
    this.world.vistaCheck(
      this.floor,
      (o, enter) => (enter ? this.vistas.show(o) : this.vistas.hide(o.id)),
      // The dolly plays once per Vista per run, as the dig enters the room (its walls open around the pillar).
      (id) => {
        if (this.dollied.has(id) || !id.startsWith('vista:') || this.building) return;
        this.dollied.add(id);
        this.rig.startDolly();
      },
    );
    this.foremanX += (this.foremanTarget - this.foremanX) * Math.min(1, dt * 22);
    const floorY = this.rig.followY;
    this.foreman.root.position.set(this.foremanX, floorY, CUT_Z - 0.55);
    this.foreman.root.rotation.y = this.foremanTarget > this.foremanX + 0.05 ? 0.9 : this.foremanTarget < this.foremanX - 0.05 ? -0.9 : 0.25;
    this.foreman.root.visible = !this.menu || this.floor > 0;
    this.foreman.update(dt, { speed: Math.abs(this.foremanTarget - this.foremanX) * 8, grounded: true, verticalVelocity: 0, aimPitch: -0.5, time: this.time });
    this.foremanBatch.update();
    this.lanternPos.set(this.foremanX, floorY + 1.2, CUT_Z + 0.8);
    const lu = this.world.rig.uniforms;
    lu.uLanternPos.value.copy(this.lanternPos);
    lu.uTime.value = this.time;
    const lf = this.world.lantern;
    if (lf.update(this.lanternPos.x, this.lanternPos.y, this.lanternPos.z, lu.uLanternRadius.value)) this.world.rig.markLanternDirty({ x: lf.originX, y: lf.originY, z: lf.originZ });
    // The look: atmosphere, section light, bloom.
    const m = this.biomeLook.update(this.floor, dt);
    const tu = this.world.terrain.uniforms;
    const open = m.open;
    tu.uSectionKey.value.copy(open).multiplyScalar(0.9 * 0.55);
    tu.uRimColor.value.copy(m.accent).multiplyScalar(1.6 * 0.35);
    tu.uCamFill.value.copy(open).multiplyScalar(0.25 * 0.5);
    tu.uDeepTint.value.copy(m.deepTint);
    tu.uSection.value.set(1, -this.floor, this.camera.position.x, this.camera.position.y);
    this.world.rig.applyLook({
      fog: m.fog,
      fogLow: m.fogLow,
      ambient: this.tmpColor.copy(open).multiplyScalar(0.05),
      open: this.tmpColor2.copy(open).multiplyScalar(0.7),
      density: 0.0267,
      fogStart: 15,
      scatter: 0.12,
      bounce: 0.1,
      absorb: 0.6,
      exposure: m.exposure,
    });
    const post = this.renderer.post.params;
    post.zoneExposure = m.exposure;
    post.threshold = m.bloomThreshold;
    post.bloomStrength = m.bloomStrength;
    this.updateFx(dt);
    this.tool.update(fxDt * 1000);
    const mt = s ? s.time() : this.time;
    this.shards.update(fxDt);
    this.particles.update(fxDt, this.camera);
    this.beams.update(fxDt * 1000, this.camera);
    this.sealView.update(fxDt, this.time);
    this.creatures.floor = this.floor;
    this.creatures.update(fxDt, this.time);
    this.ambient(dt);
    this.entities.update(fxDt, mt);
    if (s) {
      this.lanterns.setRecord(s.record ? s.record() : this.floor);
      if (s.ghostDepth) this.lanterns.setGhost(s.ghostDepth());
    }
    this.lanterns.update(dt, this.time, this.floor);
    {
      // The Other Lantern at the bottom edge of the world region, 64 px across (SPEC §7.8).
      const L = this.rig.layout;
      this.lanterns.placeOther(this.camera, 1 - (2 * (L.regionBottom - 26)) / L.height, (2 * 64) / L.width, 1);
    }
    this.liquids.update(this.time);
    this.vistas.update?.(this.time, this.camera);
    const cam = this.camera.position;
    this.dressing.halos.setPixelScale(this.renderer.canvas.height * 0.55, 2 * Math.atan(1 / Math.max(1e-3, this.camera.projectionMatrix.elements[5])) * (180 / Math.PI));
    this.world.props.update(dt, this.time, cam);
    this.sky.update(this.time, this.floor);
    this.world.uploadLight(this.renderer.gl);
    this.renderer.render(this.scene, this.camera, this.time);
    this.lastCalls = this.renderer.gl.info.render.calls;
  }

  private readonly tmpColor = new THREE.Color();
  private readonly tmpColor2 = new THREE.Color();
  private moteAcc = 0;

  /** Ambient particles from the caverns near the view (fill rule 5): one puff from each emitter every ~0.4 s. */
  private ambient(dt: number): void {
    this.moteAcc += dt;
    if (this.moteAcc < 0.4) return;
    this.moteAcc = 0;
    for (const data of this.world.slabData.values())
      for (const m of data.motes) {
        if (Math.abs(-m.y - this.floor) > 12) continue;
        const spec = MOTES[m.kind];
        this.particles.burst({ ...spec, x: m.x + (this.rng.next() * 2 - 1) * m.rx, y: m.y + (this.rng.next() * 2 - 1) * m.ry, z: m.z + (this.rng.next() * 2 - 1) * m.rz, count: 1, color: m.color }, this.rng);
      }
  }

  /** The seal below: shown from 10 rows above a never-opened seal, its phase from the model. */
  private updateSeal(s: DescentSource): void {
    const sv = s.sealView ? s.sealView() : null;
    if (sv) {
      this.sealView.set(sv.biome, sv.depth, sv.phase === 'fight' ? 'fighting' : 'held', sv.left);
      return;
    }
    const at = nextBiomeStart(this.floor);
    const seal = at - this.floor <= 10 && s.cellKind(at, 3) === CELL.SEAL;
    const here = s.cellKind(this.floor, 3) === CELL.SEAL;
    const live = this.sealView.phase === 'fighting' || this.sealView.phase === 'held' || this.sealView.phase === 'broken';
    // The seal events (bindBus) set fighting / held / broken while the floor is the seal; nothing downgrades them.
    if (live && this.sealView.depth === this.floor) return;
    if (here) this.sealView.set(biomeAt(this.floor + 1), this.floor, live && this.sealView.depth === this.floor ? this.sealView.phase : 'closed', this.sealView.left);
    else if (seal) this.sealView.set(biomeAt(at + 1), at, 'closed', 1);
    else if (this.sealView.phase !== 'broken') this.sealView.set(-1, 0, 'none');
  }

  private updateFx(dt: number): void {
    const tu = this.world.terrain.uniforms;
    for (let i = 0; i < FX_SLOTS; i++) {
      const f = this.fx[i];
      f.flash = Math.max(0, f.flash - (dt * 1000 * 0.6) / FLASH_MS);
      f.popT += dt * 1000;
      // The pop: up to its peak at 33 ms, back by 100 ms (the kick spring's shape, sampled).
      const p = f.popT < 33 ? f.popT / 33 : f.popT < POP_MS ? 1 - (f.popT - 33) / (POP_MS - 33) : 0;
      const v = tu.uCellFx.value[i];
      v.set(SHAFT_X0 + f.col, -f.row - 1, f.flash, f.crack);
      tu.uCellPop.value[i >> 2].setComponent(i & 3, p * f.pop);
    }
    for (let i = 0; i < IMPACTS; i++) {
      const L = this.impacts[i];
      L.t += dt * 1000;
      const k = L.t >= L.dur ? 0 : (1 - L.t / L.dur) ** 2;
      tu.uImpactCol.value[i].w = L.intensity * k;
    }
  }

  /** A crew rig's strike lands (its impact frame): dust for the hands, each deep line its own spectacle. */
  private crewImpact(line: number, x: number, y: number): void {
    const col = Math.max(0, Math.min(6, Math.round(x - SHAFT_X0 - 0.5)));
    if (line < 4) {
      this.burst('dust', this.floor, col, 2);
      return;
    }
    const hex = CREW_GLOW[(line - 4) % CREW_GLOW.length];
    const cx = SHAFT_X0 + col + 0.5;
    if (line === 6 || line === 7 || line === 12) this.beams.add({ kind: 'pillar', from: [cx, y - 0.2, CUT_Z - 0.4], to: [cx, y + 4.2, CUT_Z - 0.4], width: [0.6, 0.2], color: hex, intensity: 2, life: 220, grow: 40 });
    if (line === 11 || line === 13) this.particles.burst({ kind: 'ring', x: cx, y: y - 0.3, z: CUT_Z + 0.3, count: 1, color: hex, speed: [0, 0], life: [0.4, 0.4], size: [0.3, 2.6], drag: 0, gravity: 0, jitter: 0, glow: 1 }, this.rng);
    this.particles.burst({ kind: line === 7 || line === 12 ? 'ember' : 'spark', x: cx, y: y - 0.1, z: CUT_Z + 0.3, count: 8, color: hex, color2: 0xffffff, speed: [1.5, 4], dir: [0, 1, 0.5], spread: 0.7, life: [0.25, 0.6], size: [0.05, 0.02], drag: 1.5, gravity: -5, jitter: 0.3, glow: 1 }, this.rng);
    this.burst('dust', this.floor, col, 3);
  }

  /**
   * The model broke these cells this frame: their voxels go to air and, in the same frame (F0, SPEC §10.5), each
   * cell's front metre becomes shards with dust and sparks coloured from the cell.
   */
  applyBreaks(cells: readonly DescentBreak[]): void {
    if (!cells.length) return;
    const ids = this.world.breakCells(cells);
    // The section field relaxes around the opened cut voxels only (a cell outside the live window stays as it was).
    const cut: Array<readonly [number, number]> = [];
    for (const c of cells) if (this.world.ring.get(SHAFT_X0 + c.col, -c.row - 1, CELL_Z1) === 0 /* air */) cut.push([SHAFT_X0 + c.col, storageRow(-c.row - 1)]);
    this.section.open(cut);
    const many = cells.length > 6;
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const id = ids[i];
      const def = BLOCKS[id];
      const x = SHAFT_X0 + c.col + 0.5;
      const y = -c.row - 0.5;
      const colors = def && def.debris.length ? def.debris : [0x6a6a6a];
      const value = VALUE_CLASS[id] ?? 0;
      // The ledge below: the next row's top if its cell is still there.
      const below = this.source ? this.source.cellLeft(c.row + 1, c.col) > 0 : true;
      this.shards.shatter({ x, y, z: CUT_Z - 0.5, blockId: id, layer: MAT_SIDE[id] ?? 0, floorY: below ? -c.row - 1 : -1e4, side: c.col < 3 ? -1 : c.col > 3 ? 1 : 0, heat: c.crit ? 0.8 : value >= 3 ? 0.5 : 0, crumble: c.crumble });
      this.particles.burst({ kind: 'dust', x, y: y - 0.2, z: CUT_Z + 0.3, count: many ? 6 : c.crumble ? 8 : 16, color: colors[0], color2: colors[colors.length - 1], speed: [0.4, 1.6], dir: [0, 0.6, 0.8], spread: 0.8, life: [0.6, 1.3], size: [0.18, 0.55], drag: 2.2, gravity: -0.6, jitter: 0.35 }, this.rng);
      if (!c.crumble) this.particles.burst({ kind: 'spark', x, y, z: CUT_Z + 0.35, count: many ? 2 : 6, color: 0xffc070, color2: 0xfff0c0, speed: [2.5, 5.5], dir: [0, 0.7, 0.7], spread: 0.7, life: [0.18, 0.4], size: [0.035, 0.02], drag: 1.5, gravity: -9, jitter: 0.2, glow: 1 }, this.rng);
      if (value >= 2) this.particles.burst({ kind: 'glint', x, y, z: CUT_Z + 0.4, count: value >= 3 ? 12 : 8, color: colors[0], color2: 0xffffff, speed: [0.8, 2.6], spread: 1, life: [0.4, 0.9], size: [0.09, 0.02], drag: 2.5, gravity: -1.2, jitter: 0.3, glow: 1 }, this.rng);
      // A cell that broke clears its FX slot.
      for (const f of this.fx) if (f.row === c.row && f.col === c.col) f.crack = 0;
    }
    // The world shock ring of a break (0.45 s, to 3.15 m) and its transient light.
    const c0 = cells[0];
    this.ring(c0.row, c0.col, many ? 4 : 3.15, many ? 0xffd8a0 : 0xffe4c0);
    this.impactLight(c0.row, c0.col, many ? 6 : 2.5, 0xffc080, many ? 2 : 1.1, many ? 250 : 120);
  }

  /** A world shock ring centred on a cell's face. */
  private ring(row: number, col: number, radius: number, hex: number): void {
    this.particles.burst({ kind: 'ring', x: SHAFT_X0 + col + 0.5, y: -row - 0.5, z: CUT_Z + 0.3, count: 1, color: hex, speed: [0, 0], life: [0.45, 0.45], size: [0.2, radius * 2], drag: 0, gravity: 0, jitter: 0, glow: 0.6 }, this.rng);
  }

  /** Hit feedback on a cell: flash 0..1, face pop 0..1 (1 = the full pop, 1.75 a crit's 1.14), crack stage 0..1. Up to 8 at once. */
  cellFx(row: number, col: number, flash: number, pop: number, crack: number): void {
    let slot = this.fx.find((f) => f.row === row && f.col === col);
    if (!slot) {
      slot = this.fx[0];
      for (const f of this.fx) if (f.t < slot.t) slot = f;
      slot.row = row;
      slot.col = col;
      slot.crack = 0;
    }
    slot.t = this.nowMs;
    slot.flash = Math.max(slot.flash, flash);
    slot.pop = pop;
    if (pop > 0) slot.popT = 0;
    slot.crack = Math.max(slot.crack, crack);
  }

  /** The foreman (and the ghost tool) strikes cell (row, col). `tier` is the pick tier 1..16+. */
  strike(row: number, col: number, crit: boolean, tier: number): void {
    this.tool.setTier(tier);
    this.tool.strike(row, col, crit);
    this.foremanTarget = SHAFT_X0 + col + 0.5 + (col < 3 ? 0.35 : col > 3 ? -0.35 : 0.3);
    // Taps closer than 0.12 s play the flurry (a shorter recovery).
    const flurry = this.time - this.lastStrikeAt < 0.12;
    this.lastStrikeAt = this.time;
    this.foreman.strike(flurry ? 0.08 : 0.14);
    if (crit) this.impactLight(row, col, 2, 0xffd890, 1.4, 90);
    // E0: 4 dust and 2 chips at the impact.
    const x = SHAFT_X0 + col + 0.5;
    this.particles.burst({ kind: 'dust', x, y: -row - 0.1, z: CUT_Z + 0.25, count: 4, color: 0x8a7c6c, speed: [0.3, 1.0], dir: [0, 1, 0.6], spread: 0.7, life: [0.4, 0.8], size: [0.12, 0.35], drag: 2.5, gravity: -0.4, jitter: 0.25 }, this.rng);
    this.particles.burst({ kind: 'chip', x, y: -row - 0.15, z: CUT_Z + 0.25, count: crit ? 4 : 2, color: 0x6a5e52, color2: 0x9a8a78, speed: [1.5, 3.2], dir: [0, 1, 0.5], spread: 0.6, life: [0.35, 0.6], size: [0.06, 0.05], drag: 0.5, gravity: -9.8, jitter: 0.2 }, this.rng);
    if (crit) this.particles.burst({ kind: 'spark', x, y: -row - 0.1, z: CUT_Z + 0.3, count: 10, color: 0xffb040, color2: 0xfff0c0, speed: [3, 6], dir: [0, 1, 0.5], spread: 0.8, life: [0.15, 0.35], size: [0.04, 0.02], drag: 1.2, gravity: -9, jitter: 0.15, glow: 1 }, this.rng);
  }

  /** A transient light at a cell (crits 2 m / 90 ms, breaks 2.5 m, blasts 6 m / 250 ms). */
  impactLight(row: number, col: number, radius: number, hex: number, intensity: number, ms: number): void {
    this.impactLightAt(SHAFT_X0 + col + 0.5, -row - 0.3, CUT_Z + 0.6, radius, hex, intensity, ms);
  }

  /** A transient light at a world point (CRITIQUE B14: chest beams, the pick-tier snap, seal breaks). */
  impactLightAt(x: number, y: number, z: number, radius: number, hex: number, intensity: number, ms: number): void {
    const i = this.nextImpact;
    this.nextImpact = (i + 1) % IMPACTS;
    const tu = this.world.terrain.uniforms;
    tu.uImpactPos.value[i].set(x, y, z, radius);
    const c = this.tmpColor.set(hex);
    tu.uImpactCol.value[i].set(c.r, c.g, c.b, intensity);
    this.impacts[i].t = 0;
    this.impacts[i].dur = ms;
    this.impacts[i].intensity = intensity;
  }

  /** A burst of `n` GPU particles of `kind` at a cell (counts are Balanced; the governor caps them). */
  burst(kind: BurstKind, row: number, col: number, n: number): void {
    const x = SHAFT_X0 + col + 0.5;
    const y = -row - 0.5;
    const spec = BURSTS[kind];
    this.particles.burst({ ...spec, x, y: y + (spec.dy ?? 0), z: CUT_Z + 0.3, count: n }, this.rng);
  }

  /** A burst at a world point. */
  burstAt(b: ParticleBurst): number {
    return this.particles.burst(b, this.rng);
  }

  /** A beam (a chest's cone, a column pillar, a crack line). */
  beam(spec: BeamSpec): void {
    this.beams.add(spec);
  }

  /** A world shock ring centred on a cell's face. */
  shock(row: number, col: number): void {
    this.ring(row, col, 3.15, 0xffe0b0);
    this.impactLight(row, col, 3, 0xffe0b0, 0.8, 180);
  }

  /** The column strips at the floor row (TapSurface's ColumnStrips). */
  columns(): ColumnStripsPx {
    return this.rig.columns();
  }

  floorScreenY(): number {
    return this.rig.floorScreenY();
  }

  /** Screen centre (CSS px) of cell (row, col)'s front face. */
  screenOf(row: number, col: number): { x: number; y: number } {
    const p = this.rig.screenOf(row, col, this.tmp);
    return { x: p.x, y: p.y };
  }

  /** Screen point (CSS px, rest pose) of a world point. */
  screenAt(x: number, y: number, z: number): { x: number; y: number } {
    const p = this.rig.project(x, y, z, this.tmp);
    return { x: p.x, y: p.y };
  }

  /**
   * Every tappable on screen now (rest pose, CSS px): props (crystals, gems, fossils, crates, notes, caches),
   * creatures, event targets, chests, weak points, planted lanterns. Recomputed at most once a frame.
   */
  tappables(): readonly PickedEntity[] {
    if (this.picksAt === this.time) return this.picks;
    this.picksAt = this.time;
    const out = this.picks;
    out.length = 0;
    const ppm = this.rig.pxPerMetre();
    const { width, height } = this.rig.layout;
    const push = (id: string, kind: PickedEntity['kind'], x: number, y: number, z: number, boundM: number, taps: number) => {
      const p = this.rig.project(x, y, z, this.tmp);
      if (p.x < -40 || p.x > width + 40 || p.y < -40 || p.y > height + 40) return;
      const k = 12.6 / (12.6 + Math.max(0, CUT_Z - z));
      out.push({ id, kind, x: p.x, y: p.y, radius: Math.max(32, boundM * ppm * k + 10), row: Math.max(0, Math.round(-y - 0.5)), taps });
    };
    for (const spec of this.world.liveProps.values()) {
      if (!spec.tap) continue;
      push(spec.id, spec.tap === 'lantern' ? 'lantern' : spec.tap, spec.x, spec.y + 0.45 * spec.scale, spec.z, 0.6 * spec.scale, spec.taps ?? 1);
    }
    for (const c of this.creatures.views()) push(c.id, 'creature', c.x, c.y, c.z, c.radius, 3);
    for (const e of this.entities.views()) push(e.id, e.id.startsWith('chest:') ? 'chest' : e.id.startsWith('moth:') ? 'moth' : e.id.startsWith('cache:') ? 'cache' : 'event', e.x, e.y, e.z, e.radius, e.taps);
    for (const w of this.sealView.weakPoints()) if (w.lit) push(w.id, 'weak', w.x, w.y, w.z, 0.5, 1);
    for (const l of this.lanterns.views()) push(l.id, 'lantern', l.x, l.y, l.z, l.radius, 1);
    return out;
  }

  /** The tappable entity under a screen point (radius max(32 px, bound + 10 px)), or null. Event targets and weak points win ties. */
  pickEntity(x: number, y: number): PickedEntity | null {
    let best: PickedEntity | null = null;
    let bestD = Infinity;
    for (const e of this.tappables()) {
      const d = Math.hypot(e.x - x, e.y - y) - (e.kind === 'event' || e.kind === 'weak' || e.kind === 'moth' ? 12 : 0);
      if (Math.hypot(e.x - x, e.y - y) <= e.radius && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** An entity was used up (a chest opened, a cluster broken, a creature caught): remove it from the world, with a burst. */
  removeEntity(id: string): void {
    const spec = this.world.liveProps.get(id);
    if (spec) {
      const hex = spec.tap === 'gem' || spec.tap === 'crystal' ? 0x9ff6ff : 0xffd060;
      this.particles.burst({ kind: 'glint', x: spec.x, y: spec.y + 0.4, z: spec.z, count: 18, color: hex, color2: 0xffffff, speed: [1, 3.5], spread: 1, life: [0.4, 0.9], size: [0.12, 0.03], drag: 2, gravity: -2, jitter: 0.3, glow: 1 }, this.rng);
      this.particles.burst({ kind: 'chip', x: spec.x, y: spec.y + 0.4, z: spec.z, count: 8, color: hex, color2: 0xffffff, speed: [2, 3.5], dir: [0, 1, 0.3], spread: 0.8, life: [0.4, 0.7], size: [0.08, 0.06], drag: 0.6, gravity: -9.8, jitter: 0.2, glow: 0.6 }, this.rng);
    }
    this.world.removeProp(id);
    this.creatures.remove(id, true);
    this.entities.remove(id, true);
    this.dressing.touch();
  }

  /** A multi-tap entity took a hit (`left` taps still needed). */
  hitEntity(id: string, left: number): void {
    this.creatures.hit(id);
    this.entities.hit(id, left);
    const spec = this.world.liveProps.get(id);
    if (spec) this.particles.burst({ kind: 'glint', x: spec.x, y: spec.y + 0.4, z: spec.z, count: 6, color: 0x9ff6ff, speed: [0.8, 2], spread: 1, life: [0.3, 0.6], size: [0.08, 0.02], drag: 2, gravity: -1, jitter: 0.2, glow: 1 }, this.rng);
  }

  /** An event target entered the world (the model's `event:target`). */
  spawnTarget(t: { id: string; kind: string; t0: number; t1: number; path: EventPath; taps: number }): void {
    this.entities.spawn({ ...t, floor: this.floor });
  }

  /**
   * Spawn a simple entity at a cell (the find guarantee's micro-surfacings: 'gem', 'critter', 'pebble').
   * `id` is the model's entity id. @returns the id ('' when not supported).
   */
  spawnEntity(kind: string, row: number, col: number, id = '', life = 6): string {
    if (!id || !this.source) return '';
    const t = this.source.time();
    const y = row - this.floor;
    this.entities.spawn({ id, kind, t0: t, t1: t + life, floor: this.floor, taps: 1, path: { x0: col, y0: y - 0.3, cx: col, cy: y - 0.6, x1: col, y1: y - 0.5 } });
    return id;
  }

  /** A chest popped out of its cell (`chest:exposed`): it lands on the floor ledge and waits for a tap. */
  popChest(id: string, col: number, depth: number, tier: string): void {
    this.entities.chest(id, col, depth, tier);
  }

  /** The seal of biome `biome` (the one it opens) is in this phase (the model's seal events). */
  seal(biome: number, state: SealPhase | 'fighting' | 'closed' | 'broken', left = 1, at?: number): void {
    const s = this.source;
    const depth = at ?? (s && s.cellKind(this.floor, 3) === CELL.SEAL ? this.floor : nextBiomeStart(this.floor));
    this.sealView.set(biome, depth, state, left);
  }

  /** The Warden's weak point `point` lit or went dark (`weak:<sealId>:<point>`). */
  weakPoint(point: number, lit: boolean): void {
    this.sealView.setWeak(point, lit);
  }

  /** A planted lantern at a depth (`lantern:<n>`). */
  plant(depth: number, n = 0): void {
    const list = [...(this.source?.planted?.() ?? [])];
    if (!list.some((p) => p.n === n)) list.push({ depth, n });
    this.lanterns.setPlanted(list);
  }

  /** The ghost lantern of the par run at a depth (null hides it). */
  ghost(depth: number | null): void {
    this.lanterns.setGhost(depth);
  }

  /** The breakthrough fall (SPEC §6.3): the camera follows the floor's jump by itself (DescentCamera.setFloor); this
   *  forces it for callers that move the floor some other way. */
  fall(from: number, to: number): void {
    if (to - from > 3) {
      this.rig.setFloor(from, true);
      this.rig.setFloor(to);
    }
  }

  /** The Vista dolly (SPEC §6.3): D 12.6 → 24 m over 1,200 ms, hold 1,600 ms, back in 900 ms; taps still dig. */
  dolly(on: boolean): void {
    if (on) this.rig.startDolly();
  }

  /** The camera part of the first-time biome reveal (SPEC §10.8): the dive into the hall, the landing, the dolly. */
  reveal(biome: number): void {
    void biome;
    this.rig.startReveal(8);
  }

  /** Repaint cells the model changed (`cells:change`: Golden Vein, boulders, the boredom breaker). */
  repaint(cells: ReadonlyArray<{ depth: number; col: number; kind: number }>): void {
    const changed = this.world.repaintCells(cells);
    if (changed) this.section.markDirty();
    for (const c of cells) if (c.kind === CELL.GOLDEN) this.burst('gold', c.depth, c.col, 8);
  }

  /** A chest opened: its lid swings, a beam cone in the tier colour, the contents spray (SPEC §10.8). */
  openChest(id: string, tier: string): void {
    const at = this.entities.where(id);
    const hex = CHEST_TIER_GLOW[tier] ?? 0xffb35c;
    this.entities.open(id);
    if (!at) return;
    this.beams.add({ kind: 'cone', from: [at.x, at.y, at.z], to: [at.x, at.y + 3.2, at.z], width: [0.5, 1.9], color: hex, intensity: 2.4, life: 900, grow: 120 });
    this.particles.burst({ kind: 'glint', x: at.x, y: at.y + 0.3, z: at.z + 0.2, count: 30, color: hex, color2: 0xffffff, speed: [1.5, 4.5], dir: [0, 1, 0.3], spread: 0.6, life: [0.5, 1.1], size: [0.14, 0.03], drag: 1.6, gravity: -3, jitter: 0.2, glow: 1 }, this.rng);
    this.particles.burst({ kind: 'ring', x: at.x, y: at.y + 0.2, z: at.z + 0.2, count: 1, color: hex, speed: [0, 0], life: [0.5, 0.5], size: [0.3, 3.2], drag: 0, gravity: 0, jitter: 0, glow: 1 }, this.rng);
    this.impactLightAt(at.x, at.y + 0.6, at.z + 0.4, 4, hex, 2, 600);
  }

  private readonly tmpV = new THREE.Vector3();

  /** The weak point took a ×5 hit: a ring and glints there. */
  private weakBurst(): void {
    for (const w of this.sealView.weakPoints()) {
      if (!w.lit) continue;
      const hex = this.sealView.weakColor;
      this.particles.burst({ kind: 'ring', x: w.x, y: w.y, z: w.z + 0.3, count: 1, color: hex, speed: [0, 0], life: [0.35, 0.35], size: [0.2, 2.2], drag: 0, gravity: 0, jitter: 0, glow: 1 }, this.rng);
      this.particles.burst({ kind: 'spark', x: w.x, y: w.y, z: w.z + 0.3, count: 14, color: hex, color2: 0xffffff, speed: [2, 6], spread: 1, life: [0.2, 0.45], size: [0.05, 0.02], drag: 1.2, gravity: -6, jitter: 0.1, glow: 1 }, this.rng);
      this.impactLightAt(w.x, w.y, w.z + 0.8, 3, hex, 2.2, 160);
    }
  }

  /** The seal broke (first time ever): the slab shatters into large shards, light floods up from the next biome. */
  private breakSeal(biome: number, depth: number): void {
    const c = this.sealView.centre(this.tmpV);
    this.sealView.set(biome, depth, 'broken');
    const hex = KEY_COLOUR[biome] ?? 0xffe0b0;
    for (let col = 0; col < 7; col++) {
      const x = SHAFT_X0 + col + 0.5;
      this.shards.shatter({ x, y: -depth - 0.5, z: CUT_Z - 0.5, blockId: 43, layer: MAT_SIDE[43] ?? 0, floorY: -1e4, side: col < 3 ? -1 : col > 3 ? 1 : 0, heat: 0.7, speed: 1.4 });
    }
    this.particles.burst({ kind: 'mote', x: c.x, y: c.y - 1, z: CUT_Z, count: 160, color: hex, color2: 0xffffff, speed: [1, 7], dir: [0, 1, 0.4], spread: 0.8, life: [0.8, 2], size: [0.16, 0.03], drag: 1.2, gravity: 1.5, jitter: 2.5, glow: 1 }, this.rng);
    this.particles.burst({ kind: 'ring', x: c.x, y: -depth, z: CUT_Z + 0.3, count: 1, color: hex, speed: [0, 0], life: [0.7, 0.7], size: [0.5, 12], drag: 0, gravity: 0, jitter: 0, glow: 1 }, this.rng);
    this.beams.add({ kind: 'pillar', from: [c.x, -depth - 4, CUT_Z - 0.2], to: [c.x, -depth + 6, CUT_Z - 0.2], width: [7.5, 3], color: hex, intensity: 2.5, life: 900, grow: 100 });
    this.impactLightAt(c.x, -depth - 1, CUT_Z + 0.5, 10, hex, 3, 600);
  }

  /** A charted gate broke (T3): a band of light across the row and biome motes. */
  private gateFlash(depth: number): void {
    const hex = KEY_COLOUR[biomeAt(depth + 1)] ?? 0xffe0b0;
    this.beams.add({ kind: 'ray', from: [SHAFT_X0 - 0.5, -depth - 0.5, CUT_Z + 0.2], to: [SHAFT_X0 + 7.5, -depth - 0.5, CUT_Z + 0.2], width: [1.2, 1.2], color: hex, intensity: 2, life: 500, grow: 60 });
    this.particles.burst({ kind: 'mote', x: SHAFT_X0 + 3.5, y: -depth - 0.5, z: CUT_Z + 0.2, count: 60, color: hex, color2: 0xffffff, speed: [1, 4], spread: 1, life: [0.6, 1.4], size: [0.12, 0.03], drag: 1.5, gravity: 1, jitter: 2.5, glow: 1 }, this.rng);
    this.impactLightAt(SHAFT_X0 + 3.5, -depth, CUT_Z + 0.5, 6, hex, 2, 400);
  }

  /** The ghost was overtaken: it bursts into blue sparks. */
  private ghostBurst(): void {
    const g = this.source?.ghostDepth?.();
    const y = g === null || g === undefined ? -this.floor + 0.6 : -g + 0.6;
    this.particles.burst({ kind: 'glint', x: SHAFT_X0 + 7.45, y, z: 58.6, count: 28, color: 0x9fd0ff, color2: 0xffffff, speed: [1, 3.5], spread: 1, life: [0.5, 1], size: [0.12, 0.03], drag: 2, gravity: -1, jitter: 0.2, glow: 1 }, this.rng);
    this.lanterns.setGhost(null);
  }

  /** Force a biome look (the Biome Lab); -1 returns to the depth-driven blend. `blend` is reserved (2D's BiomeLook). */
  look(biome: number, blend = 0): void {
    void blend;
    this.biomeLook.forced = biome;
  }

  /** The world dims (0..1) for a ceremony: forwarded to 2D's PostFX `dim`. */
  dim(v: number): void {
    (this.renderer.post.params as unknown as Record<string, unknown>).dim = Math.min(1, Math.max(0, v));
  }

  /** The octagon iris (radius 0..1.5, centre in CSS px; Rekindle): forwarded to 2D's PostFX `iris`. */
  iris(r: number, cx?: number, cy?: number): void {
    const p = this.renderer.post.params as unknown as Record<string, unknown>;
    const { width, height } = this.rig.layout;
    p.iris = r;
    p.irisCenter = [(cx ?? width / 2) / width, 1 - (cy ?? height / 2) / height];
  }

  /** The menu framing at the surface (true) or the dig framing (false). */
  setMenu(on: boolean, snap = false): void {
    this.menu = on;
    this.rig.setMenu(on, snap);
  }

  /** The HUD's world region and the viewport (CSS px). */
  setLayout(layout: CameraLayout): void {
    this.rig.setLayout(layout);
  }

  /** How far a sheet is open (0..1): the floor re-frames above it. */
  setSheet(fraction: number): void {
    this.rig.setSheet(fraction);
  }

  /** Motion settings (Reduced: the camera at rest every frame; particles 60 %; Off ≤ 20 per burst). */
  setMotion(m: DescentMotion): void {
    const reduced = m.motion !== 'full';
    this.rig.motion = { reduced, life: !reduced && !m.battery, shake: m.shake };
    this.particles.scale = m.motion === 'full' ? 1 : 0.6;
    this.particles.motionOff = m.motion === 'off';
  }

  /** Quality preset changed: the live caps follow (SPEC §11.5). */
  setQuality(q: string): void {
    const c = DescentScene.caps(q);
    this.particles.cap = Math.min(this.particles.size, c.particles);
    this.shards.cap = c.shards;
  }

  /** Tap kick along a screen direction (CSS px, y down). */
  kick(dx: number, dy: number, crit = false): void {
    this.rig.kick(dx, dy, crit);
  }

  trauma(t: number): void {
    this.rig.addTrauma(t);
  }

  /** Shader programs compiled so far (P3: constant after load). */
  programs(): number {
    return this.renderer.gl.info.programs?.length ?? 0;
  }

  /** The ring's width (for tests). */
  static readonly WIDTH = RING_SX;

  dispose(): void {
    for (const u of this.unbind) u();
    this.unbind = [];
    this.source = null;
    this.world.dispose();
    this.section.dispose();
    this.particles.dispose();
    this.shards.dispose();
  }
}

/** The deep crew lines' strike colours (lines 4-14). */
const CREW_GLOW = [0xff9a40, 0xffc070, 0x6fe8ff, 0xff7a2e, 0xffb000, 0x7fd8ff, 0xfff4d0, 0xb9a2ff, 0xfff1c2, 0x6a5cff, 0x8fe3ee];

type BurstSpec = Omit<ParticleBurst, 'x' | 'y' | 'z' | 'count'> & { dy?: number };
const B = (kind: ParticleKind, color: number, color2: number, speed: [number, number], life: [number, number], size: [number, number], gravity: number, glow: number, dy = 0): BurstSpec => ({ kind, color, color2, speed, life, size, gravity, glow, dy, drag: 2, spread: 1, jitter: 0.3 });
/** The burst kinds callers name (JuiceDirector's cues), as GPU particle specs. */
const BURSTS: Record<BurstKind, BurstSpec> = {
  dust: { ...B('dust', 0x9a8a78, 0x6a5e52, [0.3, 1.4], [0.6, 1.2], [0.16, 0.5], -0.5, 0, 0.3), dir: [0, 0.6, 0.8], spread: 0.8 },
  chips: { ...B('chip', 0x7a6c5e, 0x9a8a78, [1.5, 3.5], [0.35, 0.6], [0.06, 0.05], -9.8, 0, 0.4), dir: [0, 1, 0.5], spread: 0.6, drag: 0.5 },
  crumble: { ...B('dust', 0x8a7c6c, 0x5a5048, [0.2, 0.8], [0.8, 1.4], [0.2, 0.6], -0.8, 0), dir: [0, -0.2, 1], spread: 0.6 },
  sparks: { ...B('spark', 0xffb060, 0xfff0c0, [2.5, 6], [0.15, 0.4], [0.04, 0.02], -9, 1, 0.4), dir: [0, 0.8, 0.6], spread: 0.8, drag: 1.4 },
  gold: B('glint', 0xffd060, 0xfff4c0, [0.8, 2.8], [0.4, 0.9], [0.1, 0.02], -1.5, 1),
  gem: B('glint', 0xd0a0ff, 0x9ff6ff, [0.8, 2.8], [0.45, 1.0], [0.12, 0.02], -1.2, 1),
  star: B('glint', 0xfff0c0, 0xffffff, [1, 3.5], [0.5, 1.1], [0.14, 0.02], -0.8, 1),
  embers: { ...B('ember', 0xff7a2e, 0xffc060, [0.5, 2], [0.8, 1.8], [0.06, 0.02], 1.2, 1), dir: [0, 1, 0.3], spread: 0.7 },
  confetti: { ...B('chip', 0xffd060, 0x9ff6ff, [2, 4.5], [0.8, 1.4], [0.07, 0.06], -4, 0.8, 0.5), dir: [0, 1, 0.4], spread: 0.6, drag: 1.2 },
  biome: { ...B('mote', 0x9be7a8, 0xffffff, [0.3, 1.5], [1.2, 2.4], [0.1, 0.03], 0.6, 1), spread: 1 },
};

/** Ambient emitter kinds (slab motes) as particle specs (one puff each). */
const MOTES: Record<string, Omit<ParticleBurst, 'x' | 'y' | 'z' | 'count' | 'color'>> = {
  dust: { kind: 'mote', speed: [0.05, 0.25], spread: 1, life: [3, 5], size: [0.05, 0.04], drag: 0.6, gravity: 0.02, jitter: 0, glow: 0.3 },
  glint: { kind: 'glint', speed: [0.05, 0.2], spread: 1, life: [1.5, 3], size: [0.08, 0.02], drag: 0.5, gravity: 0.05, jitter: 0, glow: 1 },
  spore: { kind: 'mote', speed: [0.1, 0.35], dir: [0, 1, 0], spread: 0.7, life: [3, 5], size: [0.08, 0.05], drag: 0.4, gravity: 0.08, jitter: 0, glow: 1 },
  ember: { kind: 'ember', speed: [0.3, 0.8], dir: [0, 1, 0], spread: 0.5, life: [1.5, 3], size: [0.06, 0.02], drag: 0.6, gravity: 0.4, jitter: 0, glow: 1 },
  bubble: { kind: 'bubble', speed: [0.2, 0.5], dir: [0, 1, 0], spread: 0.3, life: [2, 3.5], size: [0.08, 0.14], drag: 0.5, gravity: 0.3, jitter: 0, glow: 0.6 },
  snow: { kind: 'mote', speed: [0.05, 0.2], dir: [0, -1, 0], spread: 0.6, life: [3, 5], size: [0.06, 0.05], drag: 0.6, gravity: -0.15, jitter: 0, glow: 0.5 },
  thread: { kind: 'streak', speed: [0.4, 0.9], spread: 1, life: [1.5, 2.5], size: [0.05, 0.03], drag: 0.3, gravity: 0, jitter: 0, glow: 1 },
};
