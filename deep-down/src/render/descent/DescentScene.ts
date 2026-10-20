import * as THREE from 'three';
import { BLOCKS, VALUE_CLASS } from '../../config/blocks';
import { Rng } from '../../core/rng';
import { ExplorerModel } from '../../entities/character/ExplorerModel';
import { DebrisSystem } from '../../game/effects/Debris';
import { ParticleSystem } from '../../game/effects/Particles';
import { CELL } from '../../idle/model/state';
import { RING_SX, SLAB_ROWS } from '../../world/descent/RingWorld';
import { CELL_Z1 } from '../../world/descent/slab';
import { MAT_SIDE, MATERIAL_NAMES } from '../materials';
import type { Renderer } from '../Renderer';
import { BiomeLook } from './BiomeLook';
import { CrewRenderer } from './CrewRenderer';
import { CUT_Z, DescentCamera, SHAFT_X0, defaultLayout, type CameraLayout, type ColumnStripsPx } from './DescentCamera';
import { DescentWorld } from './DescentWorld';
import { SectionField } from './SectionField';
import { ShaftDressing } from './ShaftDressing';
import { SurfaceSky } from './SurfaceSky';
import { ToolRig } from './ToolRig';

/**
 * The one facade the game drives (BUILD §1, SPEC §11.4): the streamed ring world, its meshes and light, the
 * descent camera, the foreman, the strike ghost, the crew rigs, the shaft dressing, the sky, cell FX, debris
 * and bursts. IdleGame / DigController call it; nothing else in src/game reaches into src/render.
 *
 * Coordinates for callers are game coordinates: `row` is the depth row (metres below the surface, the floor
 * row is `depth`), `col` is the shaft column 0..6 (screen left to right). Screen values are CSS px.
 *
 * Frame order (SPEC §12.2): the game steps the model, then calls `applyBreaks()` for this frame's broken
 * cells, `cellFx()` for hits, `strike()` / `burst()` / `shock()` / `kick()` / `trauma()` for feedback, then
 * `frame(dt, fxDt)` once, which streams slabs, updates the camera and every effect, and renders (post included).
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
}

/** A cell the model broke this frame. `kind` is the CellKind it had; `crumble` for the leftover crumble. */
export interface DescentBreak {
  row: number;
  col: number;
  kind: number;
  crumble?: boolean;
  /** The hit that broke it came from the crew (rigs swing) rather than a tap. */
  crew?: boolean;
}

export type BurstKind = 'dust' | 'chips' | 'sparks' | 'gold' | 'gem' | 'crumble' | 'star';

/** Something tappable on screen (entity-first picking, SPEC §3.1). */
export interface PickedEntity {
  id: string;
  kind: 'chest' | 'gem' | 'fossil' | 'crystal' | 'crate' | 'note' | 'creature' | 'lantern';
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

/** Debug and test surface (window.__DD__.descent). */
export interface DescentDebug {
  /** Chunks whose GPU mesh differs from a fresh main-thread mesh (after flush). */
  meshCheck(): Promise<{ checked: number; mismatched: number }>;
  /** Light texels that differ from a fresh compute of the live window. */
  lightCheck(): { checked: number; mismatched: number; maxDiff: number };
  /** Chunks of the slabs in view (the floor's and its neighbours) with no mesh since their slab was written. */
  missingChunks(): number;
  /** Live slab range, slabs applied, the last slab apply time (ms). */
  slabs(): { first: number; last: number; applied: number; lastApplyMs: number; maxApplyMs: number; pending: number; worker: boolean };
  /** Debris pieces alive and spawned since boot. */
  debris(): { live: number; spawned: number };
  /** The voxel id at a cell's front voxel (0 = air) - to check that a break removed it. */
  cellVoxel(row: number, col: number): number;
  /** Shader programs compiled (P3). */
  programs(): number;
  /** Lamps lit, crew figures shown, live props. */
  dressing(): { lamps: number; crew: number; props: number };
}

const FX_SLOTS = 8;
/** Flash decays from 0.6 to 0 over 67 ms; the pop rises to its peak at F2 (33 ms) and is back by F4. */
const FLASH_MS = 67;
const POP_MS = 100;
const IMPACTS = 4;

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
  readonly debris: DebrisSystem;
  readonly particles: ParticleSystem;
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
  private debrisSpawned = 0;
  private building: Promise<void> | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly lanternPos = new THREE.Vector3();
  private menu = false;

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
    this.debris = new DebrisSystem(this.world.ring, lu, renderer.preset.particleBudget);
    this.particles = new ParticleSystem(lu, renderer.preset.particleBudget);
    this.scene.add(this.world.group, this.sky.group, this.dressing.halos.mesh, this.crew.group, this.foreman.root, this.tool.group, this.debris.group, this.particles.group);
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
      debris: () => ({ live: this.debris.activeCount, spawned: this.debrisSpawned }),
      cellVoxel: (row, col) => this.world.ring.get(SHAFT_X0 + col, -row - 1, CELL_Z1),
      programs: () => this.programs(),
      dressing: () => ({ lamps: this.dressing.lamps, crew: this.crew.visible, props: this.world.liveProps.size }),
    };
    for (const p of SurfaceSky.campProps()) this.world.props.add(p);
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __DD__?: Record<string, unknown> };
      w.__DD__ = { ...(w.__DD__ ?? {}), descent: this.debug };
    }
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
  }

  /**
   * Compile every material the scene can draw now, hidden ones included (debris, ghosts, crew rigs), so no
   * shader compiles mid-play (P3).
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
      for (const imp of this.crew.impacts) this.particles.dust(imp.x, imp.y + 0.1, CUT_Z - 1.5, 0x6a5e52, 1, this.rng, 0.15);
      this.tool.setTier(Math.floor(s.pickLevel() / 25) + 1);
    }
    this.section.update();
    // The camera, then the lantern in the apron at the foreman's column (CRITIQUE B2).
    this.rig.update(dt);
    this.rig.apply(this.camera);
    this.foremanX += (this.foremanTarget - this.foremanX) * Math.min(1, dt * 22);
    const floorY = this.rig.followY;
    this.foreman.root.position.set(this.foremanX, floorY, CUT_Z - 0.55);
    this.foreman.root.rotation.y = this.foremanTarget > this.foremanX + 0.05 ? 0.9 : this.foremanTarget < this.foremanX - 0.05 ? -0.9 : 0.25;
    this.foreman.root.visible = !this.menu || this.floor > 0;
    this.foreman.update(dt, { speed: Math.abs(this.foremanTarget - this.foremanX) * 8, grounded: true, verticalVelocity: 0, aimPitch: -0.5, time: this.time });
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
    this.debris.update(dt);
    const cam = this.camera.position;
    this.particles.update(dt, this.time, cam.x, cam.y, cam.z);
    this.particles.setPixelScale(this.renderer.canvas.height, 2 * Math.atan(1 / Math.max(1e-3, this.camera.projectionMatrix.elements[5])) * (180 / Math.PI));
    this.dressing.halos.setPixelScale(this.renderer.canvas.height * 0.55, 2 * Math.atan(1 / Math.max(1e-3, this.camera.projectionMatrix.elements[5])) * (180 / Math.PI));
    this.world.props.update(dt, this.time, cam);
    this.sky.update(this.time, this.floor);
    this.world.uploadLight(this.renderer.gl);
    this.renderer.render(this.scene, this.camera, this.time);
  }

  private readonly tmpColor = new THREE.Color();
  private readonly tmpColor2 = new THREE.Color();

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

  /** The model broke these cells this frame: their voxels go to air, debris flies (coloured from the cell). */
  applyBreaks(cells: readonly DescentBreak[]): void {
    if (!cells.length) return;
    const ids = this.world.breakCells(cells);
    this.section.markDirty();
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const def = BLOCKS[ids[i]];
      const x = SHAFT_X0 + c.col + 0.5;
      const y = -c.row - 0.5;
      const many = cells.length > 6;
      const colors = def && def.debris.length ? def.debris : [0x6a6a6a];
      const glow = VALUE_CLASS[ids[i]] >= 3;
      this.debris.burst(x, y, CUT_Z - 0.4, colors, this.rng, { count: many ? 4 : c.crumble ? 6 : 10, speed: c.crumble ? 2 : 4.2, size: [0.08, 0.24], dir: [0, 0.4, 1], spread: 0.4, glow });
      this.debrisSpawned += many ? 4 : c.crumble ? 6 : 10;
      this.particles.dust(x, y, CUT_Z + 0.3, colors[0], many ? 2 : 4, this.rng, 0.35);
      if (glow) this.particles.sparkle(x, y, CUT_Z + 0.4, colors[0], 8, this.rng);
      // A cell that broke clears its FX slot.
      for (const f of this.fx) if (f.row === c.row && f.col === c.col) f.crack = 0;
    }
    if (cells.length >= 1) this.impactLight(cells[0].row, cells[0].col, cells.length > 6 ? 6 : 2.5, 0xffc080, cells.length > 6 ? 2 : 1.1, cells.length > 6 ? 250 : 120);
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
    this.particles.dust(SHAFT_X0 + col + 0.5, -row - 0.05, CUT_Z + 0.2, 0x7a6c5e, 2, this.rng, 0.2);
  }

  /** A transient light at a cell (crits 2 m / 90 ms, breaks 2.5 m, blasts 6 m / 250 ms). */
  impactLight(row: number, col: number, radius: number, hex: number, intensity: number, ms: number): void {
    const i = this.nextImpact;
    this.nextImpact = (i + 1) % IMPACTS;
    const tu = this.world.terrain.uniforms;
    tu.uImpactPos.value[i].set(SHAFT_X0 + col + 0.5, -row - 0.3, CUT_Z + 0.6, radius);
    const c = new THREE.Color(hex);
    tu.uImpactCol.value[i].set(c.r, c.g, c.b, intensity);
    this.impacts[i].t = 0;
    this.impacts[i].dur = ms;
    this.impacts[i].intensity = intensity;
  }

  /** A burst of `n` particles of `kind` at a cell. */
  burst(kind: BurstKind, row: number, col: number, n: number): void {
    const x = SHAFT_X0 + col + 0.5;
    const y = -row - 0.5;
    const hex = kind === 'gold' ? 0xffd060 : kind === 'gem' ? 0xd0a0ff : kind === 'sparks' ? 0xffb060 : kind === 'star' ? 0xfff0c0 : 0x9a8a78;
    if (kind === 'dust' || kind === 'crumble' || kind === 'chips') this.particles.dust(x, y, CUT_Z + 0.3, hex, n, this.rng, 0.5);
    else this.particles.sparkle(x, y, CUT_Z + 0.4, hex, n, this.rng);
  }

  /** A world shock ring centred on a cell's face (W1: a short impact light; the ring arrives with GpuParticles in W2). */
  shock(row: number, col: number): void {
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

  /** The tappable entity under a screen point (radius max(32 px, bound + 10 px)), or null. */
  pickEntity(x: number, y: number): PickedEntity | null {
    let best: PickedEntity | null = null;
    let bestD = Infinity;
    const ppm = this.rig.pxPerMetre();
    for (const spec of this.world.liveProps.values()) {
      if (!spec.tap) continue;
      const p = this.rig.project(spec.x, spec.y + 0.45 * spec.scale, spec.z, this.tmp);
      // Projected size shrinks with distance behind the cut.
      const k = 12.6 / (12.6 + (CUT_Z - spec.z));
      const radius = Math.max(32, 0.6 * spec.scale * ppm * k + 10);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d <= radius && d < bestD) {
        bestD = d;
        best = { id: spec.id, kind: spec.tap === 'lantern' ? 'lantern' : spec.tap, x: p.x, y: p.y, radius, row: Math.round(-spec.y), taps: spec.taps ?? 1 };
      }
    }
    return best;
  }

  /** An entity was used up (a chest opened, a cluster broken): remove it from the world, with a burst. */
  removeEntity(id: string): void {
    const spec = this.world.liveProps.get(id);
    if (spec) {
      const hex = spec.tap === 'gem' || spec.tap === 'crystal' ? 0x9ff6ff : 0xffd060;
      this.particles.sparkle(spec.x, spec.y + 0.4, spec.z, hex, 14, this.rng);
      this.debris.burst(spec.x, spec.y + 0.4, spec.z, [hex, 0xffffff], this.rng, { count: 8, speed: 3, size: [0.05, 0.14], glow: true });
    }
    this.world.removeProp(id);
    this.dressing.touch();
  }

  /** The HUD's world region and the viewport (CSS px). */
  setLayout(layout: CameraLayout): void {
    this.rig.setLayout(layout);
  }

  /** How far a sheet is open (0..1): the floor re-frames above it. */
  setSheet(fraction: number): void {
    this.rig.setSheet(fraction);
  }

  /** The menu framing at the surface (true) or the dig framing (false). */
  setMenu(on: boolean, snap = false): void {
    this.menu = on;
    this.rig.setMenu(on, snap);
  }

  /** Motion settings (Reduced: the camera at rest every frame). */
  setMotion(m: DescentMotion): void {
    const reduced = m.motion !== 'full';
    this.rig.motion = { reduced, life: !reduced && !m.battery, shake: m.shake };
  }

  /** Tap kick along a screen direction (CSS px, y down). */
  kick(dx: number, dy: number, crit = false): void {
    this.rig.kick(dx, dy, crit);
  }

  trauma(t: number): void {
    this.rig.addTrauma(t);
  }

  /** The Vista dolly (W1 SHOULD; a no-op until it lands). */
  dolly(on: boolean): void {
    void on;
  }

  /** The seal at a biome boundary: 'closed' | 'fighting' | 'broken' (W2 draws the Warden). */
  seal(biome: number, state: 'closed' | 'fighting' | 'broken'): void {
    void biome;
    void state;
  }

  /** Spawn an event entity (W2). Returns its id ('' when not supported yet). */
  spawnEntity(kind: string, row: number, col: number): string {
    void kind;
    void row;
    void col;
    return '';
  }

  /** A planted lantern at a depth (W2). */
  plant(depth: number): void {
    void depth;
  }

  /** The ghost lantern of the previous run at a depth (W2). */
  ghost(depth: number): void {
    void depth;
  }

  /** Force a biome look (the Biome Lab); -1 returns to the depth-driven blend. */
  look(biome: number): void {
    this.biomeLook.forced = biome;
  }

  /** Shader programs compiled so far (P3: constant after load). */
  programs(): number {
    return this.renderer.gl.info.programs?.length ?? 0;
  }

  /** The ring's width (for tests). */
  static readonly WIDTH = RING_SX;

  dispose(): void {
    this.source = null;
    this.world.dispose();
    this.section.dispose();
  }
}
