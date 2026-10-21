// The one render facade of the first-person hybrid (BUILD §2, SPEC §12.2, W1-LEAD §1–§5): the streamed voxel world in
// the Lantern Voxel look, the face, the chamber props, the dressing, the viewmodel, the crew rigs, the FX. 1E's
// Renderer runs the light stack (its rig is lit from here every frame) and the filmic post. The game shell (D) drives
// it:
//
//   per frame: step the model → breakBlocks()/crumble()/strike() for this frame's events → frame(dt, fxDt, pose).
//   per tap:   NodeController reads faceCells()/targets() and pick(x, y), then calls strike()/relight()/…
//
// Every count the FX director needs comes from stats(); shakes only through shake(), when the director allows it.
//
// CONTRACT (W1, 1C, published at 0:45): the method list and signatures below are the seam. Bodies grow behind them.

import * as THREE from 'three';
import { B, SOLID } from '../../config/blocks';
import { hasText, t } from '../../i18n';
import { BIOMES } from '../../idle/config/biomes';
import type { NodePlacement } from '../../world/hybrid/placement';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { IrradianceSource, LampInput } from '../light/rig';
import { LanternChunks } from '../lantern/LanternChunks';
import { stoneTextures, type StoneTextures } from '../lantern/painter';
import { propMaterials, PROP_UNIFORMS, type PropMaterials } from '../lantern/propSurface';
import { SURFACE_UNIFORMS, createSurfaceMaterial } from '../lantern/surface';
import { PropBuilder, haldenLamp, nuggets } from '../lantern/props';
import { TINT } from '../lantern/propSurface';
import type { Renderer } from '../Renderer';
import { ChamberProps } from './ChamberProps';
import { NodeDressing } from './Dressing';
import { FaceRenderer } from './FaceRenderer';
import { Fx } from './Fx';
import { LOOKS, lookOf, type SpaceLook } from './looks';
import { NodeCrew } from './NodeCrew';
import { SetPieces } from './SetPieces';
import type { DepthSource } from './source';
import { REACH_STRIKE_M, type BlockBreak, type CameraPose, type CellRect, type FxStats, type GradeParams, type Pick, type ScreenTarget, type Vec3 } from './types';
import { Viewmodel } from './Viewmodel';
import { heatOfCombo } from './viewmodelState';

/** The camp's growth stage from Fortune (SPEC §5.10): 1 at Fortune 3, 2 at 6 (W1 builds 1–2). */
export function campStage(fortune: number): number {
  const steps = [3, 6, 12, 24, 48, 100, 303];
  let s = 1;
  for (let i = 1; i < steps.length; i++) if (fortune >= steps[i]) s = i + 1;
  return s;
}

/** Scene set pieces DepthScene can stage (SPEC §3.3, §5.5, BUILD §3.3 MUST 8; W1-LEAD §3 Camp). */
export type SetPiece = 'descent' | 'camp';

/** World voxel size (m): 1B's grid (src/world/hybrid/grid.ts VOXEL). */
const VOX = 0.5;
const HFOV = 52;
/** The LightField's decode gain when 1B's source names none (1E's rig default, light/rig.ts IrradianceSource). */
const LIGHTFIELD_GAIN = 3.6;
/** A far pick lands this far out when the ray finds nothing (m). */
const FAR_POINT_M = 12;
/** Floor picks for Explore reach this far (m). */
const FLOOR_PICK_M = 40;

/** A camera shake's law (SPEC §8.7): structural events only, ≤ 0.4°, ≤ 120 ms. */
export const SHAKE_MAX_DEG = 0.4;
export const SHAKE_MAX_MS = 120;
export function clampShake(deg: number, ms: number): { deg: number; ms: number } {
  return { deg: Math.min(SHAKE_MAX_DEG, Math.abs(deg) || 0), ms: Math.min(SHAKE_MAX_MS, Math.max(1, ms || 1)) };
}

/** Vertical FOV (deg) of a locked horizontal FOV at an aspect (v1 lockedVerticalFov). */
export function verticalFovFor(hfovDeg: number, aspect: number): number {
  const h = (hfovDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / Math.max(0.1, aspect)) * 180) / Math.PI;
}

/** Amanatides–Woo DDA over a voxel world in metres: the first solid voxel within maxT (m). */
export function raycastVoxels(world: VoxelWorld, o: THREE.Vector3, d: THREE.Vector3, maxT: number): { x: number; y: number; z: number; nx: number; ny: number; nz: number; t: number; id: number } | null {
  const ox = o.x / VOX, oy = o.y / VOX, oz = o.z / VOX;
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
  const tdx = d.x !== 0 ? Math.abs(1 / d.x) : Infinity, tdy = d.y !== 0 ? Math.abs(1 / d.y) : Infinity, tdz = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
  let tx = d.x !== 0 ? (d.x > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
  let ty = d.y !== 0 ? (d.y > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
  let tz = d.z !== 0 ? (d.z > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
  const max = maxT / VOX;
  let t = 0, nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < 1024 && t <= max; i++) {
    const id = world.get(x, y, z);
    if (i > 0 && SOLID[id]) return { x, y, z, nx, ny, nz, t: t * VOX, id };
    if (tx < ty && tx < tz) {
      x += sx;
      t = tx;
      tx += tdx;
      nx = -sx;
      ny = nz = 0;
    } else if (ty < tz) {
      y += sy;
      t = ty;
      ty += tdy;
      ny = -sy;
      nx = nz = 0;
    } else {
      z += sz;
      t = tz;
      tz += tdz;
      nz = -sz;
      nx = ny = 0;
    }
  }
  return null;
}

export class DepthScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(93, 390 / 844, 0.08, 140);
  /** The lantern and the tool (its own pass). */
  readonly viewmodel = new Viewmodel();
  source: DepthSource | null = null;
  protected readonly counts: FxStats = { calls: 0, tris: 0, fx: { fg: 0, ambient: 0, particles: 0, shards: 0, area: 0, shakes: 0 } };
  readonly tex: StoneTextures;
  readonly mats: PropMaterials;
  readonly stone: THREE.ShaderMaterial;
  readonly face: FaceRenderer;
  readonly props: ChamberProps;
  readonly crewRigs: NodeCrew;
  readonly fx: Fx;
  readonly pieces: SetPieces;
  chunks: LanternChunks | null = null;
  private campDressing: NodeDressing | null = null;
  world: VoxelWorld | null = null;
  private readonly worldGroup = new THREE.Group();
  private readonly dressings = new Map<number, NodeDressing>();
  private readonly placements = new Map<number, NodePlacement>();
  private readonly oreNuggets = new Map<number, THREE.Mesh>();
  private time = 0;
  private biome = -1;
  private spaceLook: SpaceLook = LOOKS.topsoil;
  private readonly flame = new THREE.Vector3();
  private irr: IrradianceSource | null = null;
  /** The player is in a drift (the LightField weight follows: SpaceLook.irrDrift). */
  private inDrift = true;
  private readonly faceLamp = new THREE.Vector3();
  private readonly glintScratch: Array<{ id: string; kind: 'ore' | 'crystal'; pos: THREE.Vector3; normal: THREE.Vector3; left: number }> = [];
  private readonly faceLampGroup = new THREE.Group();
  private readonly lamps: LampInput[] = [];
  private readonly litScratch: Array<{ id: string; pos: THREE.Vector3; color: number; intensity: number; range: number; shadow: boolean }> = [];
  private shakeT = 1;
  private shakeDeg = 0;
  private shakeMs = 0;
  private dimAmount = 0;
  private walkMark: THREE.Mesh;
  private walkT = 9;
  private piece: SetPiece = 'descent';
  private readonly css = { w: 390, h: 844 };
  private readonly raycaster = new THREE.Raycaster();
  private lastXfade = 0;
  /** The Reveal's biome title carved in light (1.6 s), placed in the world ahead of the camera. */
  private title: { mesh: THREE.Mesh; tex: THREE.CanvasTexture; t: number } | null = null;
  /** Paint time of the stone layers (ms, the W1-LEAD §1.3 budget: ≤ 1.5 s on a phone). */
  readonly paintMs: number;

  constructor(readonly renderer: Renderer) {
    this.camera.rotation.order = 'YXZ';
    this.tex = stoneTextures(renderer.gl);
    this.paintMs = this.tex.ms;
    this.stone = createSurfaceMaterial(this.tex);
    this.mats = propMaterials(this.tex);
    this.viewmodel.init(this.tex);
    this.face = new FaceRenderer(this.mats);
    this.props = new ChamberProps(this.mats);
    this.crewRigs = new NodeCrew(this.mats);
    this.fx = new Fx(this.mats);
    this.pieces = new SetPieces(this.mats);
    this.worldGroup.name = 'world';
    this.scene.add(this.worldGroup, this.face.group, this.props.group, this.crewRigs.group, this.fx.group, this.pieces.group);
    // The walk marker: a small amber ring on the destination (0.4 s).
    const ring = new THREE.RingGeometry(0.18, 0.24, 24);
    ring.rotateX(-Math.PI / 2);
    this.walkMark = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(0xffb35c, THREE.SRGBColorSpace).multiplyScalar(1.2), transparent: true, depthWrite: false }));
    this.walkMark.visible = false;
    this.walkMark.renderOrder = 5;
    this.walkMark.userData.noShadow = true;
    this.scene.add(this.walkMark);
    // The heading's hanging lamp (its light is the face practical).
    {
      const pb = new PropBuilder(), glow = new PropBuilder();
      haldenLamp(pb, glow, new THREE.Vector3(0, 0.15, 0), 0, false, 0.3);
      this.faceLampGroup.add(new THREE.Mesh(pb.build(), this.mats.prop), new THREE.Mesh(glow.build(), this.mats.glow));
      this.faceLampGroup.visible = false;
      this.scene.add(this.faceLampGroup);
    }
    this.look(0);
  }

  /** Bind the model and build the world around the player's node (slabs, light, meshes, the face, the props). */
  async attach(source: DepthSource): Promise<void> {
    this.source = source;
    const w = source.world?.();
    if (w) this.setWorld(w.voxels, w.irradiance ?? null);
    this.syncNodes(true);
    if (this.chunks) await this.chunks.buildAll();
  }

  /** The voxel world to draw and pick (1B's VoxelRing, or a lab world), and its LightField as irradiance. */
  setWorld(voxels: VoxelWorld, irradiance: IrradianceSource | null): void {
    this.irr = irradiance;
    if (this.world === voxels) {
      this.applyIrradiance();
      return;
    }
    if (this.chunks) {
      this.worldGroup.remove(this.chunks.group);
      this.chunks.dispose();
    }
    for (const m of this.oreNuggets.values()) {
      this.worldGroup.remove(m);
      m.geometry.dispose();
    }
    this.oreNuggets.clear();
    this.world = voxels;
    this.chunks = new LanternChunks(voxels, this.stone);
    this.chunks.onNuggets = (chunk, origin, list) => this.nuggetsFor(chunk, origin, list);
    this.worldGroup.add(this.chunks.group);
    this.applyIrradiance();
    this.renderer.light.invalidateShadows();
  }

  /**
   * 1B's LightField as 1E's irradiance volume, weighted by the space's look (`SpaceLook.irr`): the bounce of the crew
   * lamps and the sky shafts is the fill, never the key, so the lantern pool and the face lamp keep their contrast.
   */
  private applyIrradiance(): void {
    const src = this.irr;
    if (!src) {
      this.renderer.light.setIrradiance(null);
      return;
    }
    const w = this.inDrift ? this.spaceLook.irrDrift : this.spaceLook.irr;
    this.renderer.light.setIrradiance({ ...src, gain: (src.gain ?? LIGHTFIELD_GAIN) * w });
  }

  /** Mineral veins in the rock as real 3D nuggets (W1-LEAD §4): on every exposed ore face the mesher reports. */
  private nuggetsFor(chunk: number, origin: THREE.Vector3, list: Float32Array): void {
    const old = this.oreNuggets.get(chunk);
    if (old) {
      this.worldGroup.remove(old);
      old.geometry.dispose();
      this.oreNuggets.delete(chunk);
    }
    if (!list.length) return;
    const pb = new PropBuilder();
    const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let i = 0; i < list.length; i += 6) {
      const f = list[i + 3], cls = list[i + 4], seed = list[i + 5];
      const n = new THREE.Vector3(...(N[f] as [number, number, number]));
      const c = new THREE.Vector3(list[i], list[i + 1], list[i + 2]).add(origin);
      const tint = cls === 2 ? TINT.oreAmber : cls === 3 ? TINT.oreJade : this.biome <= 0 ? TINT.oreCopper : TINT.oreTin;
      nuggets(pb, c, n, 0.17, cls === 2 ? 4 : 3, tint, seed + chunk * 7);
    }
    const m = new THREE.Mesh(pb.build(), this.mats.prop);
    m.matrixAutoUpdate = false;
    m.name = `ore${chunk}`;
    this.oreNuggets.set(chunk, m);
    this.worldGroup.add(m);
  }

  /** Build the dressing and props of the nodes around the player (current, previous, next). */
  private syncNodes(force = false): void {
    const src = this.source;
    if (!src || !src.placement) return;
    const cur = src.node().index;
    const want = new Set([cur - 1, cur, cur + 1].filter((i) => i >= 0));
    for (const [i, d] of this.dressings) {
      if (want.has(i)) continue;
      this.worldGroup.remove(d.group);
      d.dispose();
      this.dressings.delete(i);
      this.placements.delete(i);
      this.props.drop(i);
      this.pieces.drop(i);
    }
    for (const i of want) {
      if (this.dressings.has(i) && !force) continue;
      const p = src.placement(i);
      if (!p) continue;
      this.placements.set(i, p);
      const old = this.dressings.get(i);
      if (old) {
        this.worldGroup.remove(old.group);
        old.dispose();
      }
      const d = new NodeDressing([...p.drift.dressing, ...p.chamber.dressing], [...p.drift.lights, ...p.chamber.lights], this.mats);
      this.dressings.set(i, d);
      this.worldGroup.add(d.group);
      this.props.build(i, p.chamber.sockets, p.chamber.exits, src.chamber(i), p.biome);
      this.pieces.build(p);
    }
    // The camp (built once, kept: it is small and the adit faces it).
    if (!this.campDressing && src.camp) {
      const c = src.camp();
      if (c) {
        this.campDressing = new NodeDressing(c.dressing, c.lights, this.mats);
        this.worldGroup.add(this.campDressing.group);
        this.pieces.buildCamp(c);
      }
    }
  }

  /** Stage the camp at the adit (menu, first launch) or the descent. */
  setPiece(which: SetPiece): void {
    this.piece = which;
    if (which === 'camp') this.applyLook(LOOKS.camp);
    else this.applyLook(lookOf(Math.max(0, this.biome)));
  }

  /** The Ride's pass-by glints (W1-LEAD §3): the model's list, placed on 1B's pass-by points with their wall normals. */
  private syncGlints(src: DepthSource): void {
    const list = src.glints?.() ?? [];
    this.glintScratch.length = 0;
    for (const g of list) {
      const q = g.pos;
      const pos = 'x' in q ? new THREE.Vector3(q.x, q.y, q.z) : new THREE.Vector3(q[0], q[1], q[2]);
      if (!pos.x && !pos.y && !pos.z) continue;
      let normal: THREE.Vector3 | null = null;
      for (const pl of this.placements.values())
        for (const e of pl.chamber.exits)
          for (const pb of e.passBys ?? [])
            if (Math.abs(pb.pos.x - pos.x) + Math.abs(pb.pos.y - pos.y) + Math.abs(pb.pos.z - pos.z) < 0.05) normal = new THREE.Vector3(pb.normal.x, pb.normal.y, pb.normal.z);
      this.glintScratch.push({ id: g.id, kind: g.kind, pos, normal: normal ?? this.wallNormal(pos), left: g.left });
    }
    this.props.glints(this.glintScratch, Math.max(0, this.biome));
  }

  /** The outward normal of the rock at a wall point: toward the open neighbour voxel (else toward the camera). */
  private wallNormal(p: THREE.Vector3): THREE.Vector3 {
    const w = this.world;
    if (w) {
      const x = Math.floor(p.x / VOX), y = Math.floor(p.y / VOX), z = Math.floor(p.z / VOX);
      const dirs: Array<[number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]];
      for (const [dx, dy, dz] of dirs) if (!SOLID[w.get(x + dx, y + dy, z + dz)]) return new THREE.Vector3(dx, dy, dz);
    }
    return new THREE.Vector3().subVectors(this.camera.position, p).setY(0).normalize();
  }

  /** Stream, animate and render one frame. `dt` real seconds, `fxDt` the FX clock (0 during a hit-stop). */
  frame(dt: number, fxDt: number, view: CameraPose): void {
    this.time += fxDt;
    const src = this.source;
    // The world may be swapped by the shell (a new ring after a reset).
    const w = src?.world?.();
    if (w && w.voxels !== this.world) this.setWorld(w.voxels, w.irradiance ?? null);
    this.syncNodes();
    // Camera.
    const el = this.renderer.canvas;
    this.css.w = el.clientWidth || 390;
    this.css.h = el.clientHeight || 844;
    const aspect = this.css.w / this.css.h;
    this.camera.aspect = aspect;
    this.camera.fov = verticalFovFor(view.hfov || HFOV, aspect);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(view.x, view.y, view.z);
    let shakeX = 0;
    if (this.shakeT < 1) {
      this.shakeT += (dt * 1000) / Math.max(1, this.shakeMs);
      shakeX = Math.sin(this.shakeT * Math.PI) * (1 - this.shakeT) * ((this.shakeDeg * Math.PI) / 180);
    }
    this.camera.rotation.set(view.pitch + shakeX, view.yaw, 0);
    this.camera.updateMatrixWorld(true);
    // The cross-fade: a dip toward the scene's dark (D's camera drives xfade 0..1).
    const xf = Math.max(0, Math.min(1, view.xfade || 0));
    this.renderer.post.params.dim = Math.max(this.dimAmount, xf * 0.85);
    this.lastXfade = xf;
    // Model state → face, props, crew.
    if (src) {
      const pl = this.placements.get(src.node().index);
      if (pl) this.face.heading = { w: pl.drift.width || 3.5, h: pl.drift.height || 3 };
      this.face.update(src.face(), this.world);
      const n = src.node();
      const drift = n.phase === 'drift';
      if (drift !== this.inDrift) {
        this.inDrift = drift;
        this.applyIrradiance();
      }
      this.props.sync(src.chamber(n.index));
      this.syncGlints(src);
      this.crewRigs.update(src.crew(), src.time(), this.face);
      this.viewmodel.set({ heat: heatOfCombo(src.combo()) });
      this.viewmodel.setCart(!!src.inCart?.());
      const f = src.face();
      const biome = f ? f.biome : (this.placements.get(n.index)?.biome ?? 0);
      if (biome !== this.biome && this.piece === 'descent') this.look(biome, 1.5);
    }
    this.props.update(fxDt, this.camera);
    this.stepTitle(dt);
    this.fx.update(fxDt);
    // The walk marker.
    if (this.walkT < 0.4) {
      this.walkT += dt;
      const k = this.walkT / 0.4;
      (this.walkMark.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k * k);
      this.walkMark.visible = this.walkT < 0.4;
    }
    // World meshes.
    if (this.chunks) {
      this.chunks.update(this.camera.position, 4);
      this.chunks.cull(this.camera);
    }
    // The viewmodel and the key light.
    this.viewmodel.update(fxDt);
    this.viewmodel.frame(this.camera, aspect);
    this.viewmodel.flameWorld(this.camera, this.flame);
    this.lamps.length = 0;
    // Lit dressing lamps are baked into 1B's LightField (the irradiance volume): no per-pixel double. Practicals are the
    // lamps the player relit (ChamberProps), the heading's lamp and the nearest burning Halden lamps (High).
    if (this.renderer.light.features.practicals > 4) for (const d of this.dressings.values()) for (const l of d.lamps) if (l.id.endsWith(':lamp')) this.lamps.push({ id: l.id, pos: l.pos, color: l.color, intensity: 0.5, range: l.radius || 5 });
    // The heading's hanging lamp (SPEC §3.4, upper-left nook): the crew's light on the face, so the face is the
    // brightest large area of a drift frame (C4) and the lantern pool stays on the floor.
    if (this.face.draws > 0) {
      const F = this.face.frameAxes;
      const sx = this.viewmodel.state.mirror ? 1 : -1;
      // Inside the octagon heading (|u| < 1.25 below the 2.5 m chamfer), 0.7 m out from the face: it models the blocks
      // from the upper left and front, and its lamp hangs at the frame's edge, clear of every block's tap bound (C8).
      this.faceLamp.copy(F.o).addScaledVector(F.r, sx * 1.1).addScaledVector(F.u, 2.3).addScaledVector(F.d, -0.7);
      this.lamps.push({ id: 'faceLamp', pos: this.faceLamp, color: 0xffc88a, intensity: 1.3, range: 3.0, shadow: false });
      this.faceLampGroup.position.copy(this.faceLamp);
      this.faceLampGroup.rotation.y = Math.atan2(-F.d.x, -F.d.z);
      this.faceLampGroup.visible = true;
    } else this.faceLampGroup.visible = false;
    this.litScratch.length = 0;
    this.props.litLamps(this.litScratch);
    for (const l of this.litScratch) this.lamps.push(l);
    const tier = this.viewmodel.state.lanternLevel;
    this.renderer.light.update(this.camera, { pos: this.flame, range: 9 + 0.6 * (tier - 1), intensity: this.spaceLook.lantern, color: this.spaceLook.lanternColor }, this.lamps, this.time);
    this.renderer.render(this.scene, this.camera, this.time, { scene: this.viewmodel.scene, camera: this.viewmodel.camera });
    // Stats.
    const info = this.renderer.gl.info;
    this.counts.calls = info.render.calls;
    this.counts.tris = info.render.triangles;
    this.counts.fx.fg = (this.viewmodel.moving ? 1 : 0) + this.fx.groups;
    this.counts.fx.ambient = this.crewRigs.active ? 1 : 0;
    this.counts.fx.particles = this.fx.particles;
    this.counts.fx.shards = this.fx.shards;
    this.counts.fx.area = this.fx.area(this.camera);
  }

  // ------------------------------------------------------------------------------------------------ what is on screen

  /** The live face blocks of the front slice as drawn now (CSS px), in model column order. Empty outside a drift. */
  faceCells(): CellRect[] {
    return this.face.cells(this.camera, this.css.w, this.css.h);
  }

  /** Every tappable, lamp, nav mark, rack tool, seal part and the lantern as drawn now, with padded hit rects. */
  targets(): ScreenTarget[] {
    const w = this.world;
    const occluded = (from: THREE.Vector3, to: THREE.Vector3) => {
      if (!w) return false;
      const d = to.clone().sub(from);
      const len = d.length();
      const hit = raycastVoxels(w, from, d.normalize(), len);
      return !!hit && hit.t < len - 0.45;
    };
    const out = this.props.targets(this.camera, this.css.w, this.css.h, occluded);
    const eye = this.camera.position;
    const rectOf = (box: THREE.Box3) => {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, behind = false;
      const c = new THREE.Vector3();
      for (let i = 0; i < 8; i++) {
        c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(this.camera);
        if (c.z > 1) behind = true;
        x0 = Math.min(x0, (c.x * 0.5 + 0.5) * this.css.w);
        x1 = Math.max(x1, (c.x * 0.5 + 0.5) * this.css.w);
        y0 = Math.min(y0, (-c.y * 0.5 + 0.5) * this.css.h);
        y1 = Math.max(y1, (-c.y * 0.5 + 0.5) * this.css.h);
      }
      const drawn = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      const hw = Math.max(drawn.w, 88), hh = Math.max(drawn.h, 88);
      return { drawn, hit: { x: drawn.x + (drawn.w - hw) / 2, y: drawn.y + (drawn.h - hh) / 2, w: hw, h: hh }, behind };
    };
    for (const sb of this.pieces.sealBoxes()) {
      const r = rectOf(sb.box);
      out.push({ id: sb.id, type: 'seal', kind: sb.weak ? 'weak' : 'body', drawn: r.drawn, hit: r.hit, dist: sb.box.getCenter(new THREE.Vector3()).distanceTo(eye), visible: !r.behind });
    }
    for (const st of this.pieces.stations) {
      const r = rectOf(st.box);
      out.push({ id: st.id, type: 'nav', kind: 'station', drawn: r.drawn, hit: r.hit, dist: st.centre.distanceTo(eye), visible: !r.behind && !occluded(eye.clone(), st.centre) });
    }
    const vb = this.viewmodel.bounds(this.css.w, this.css.h);
    out.push({ id: 'lantern', type: 'lantern', kind: 'lantern', drawn: vb.lantern, hit: vb.lantern, dist: 0.5, visible: true });
    return out;
  }

  /** The camera ray at a screen point (CSS px): the face, a tappable, a lamp, nav, the seal, skin, deep rock, floor, far. */
  pick(x: number, y: number): Pick {
    const ndc = new THREE.Vector2((x / this.css.w) * 2 - 1, -(y / this.css.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    const o = ray.origin, d = ray.direction;
    const vox = this.world ? raycastVoxels(this.world, o, d, FLOOR_PICK_M) : null;
    const voxT = vox ? vox.t : Infinity;
    const face = this.face.raycast(ray);
    const prop = this.props.raycast(ray, Math.min(voxT + 0.35, FLOOR_PICK_M));
    const P = (p: THREE.Vector3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
    // The seal (the Hatch: its padlock is the weak point) and the camp's stations.
    const seal = this.pieces.raycastSeal(ray, Math.min(voxT + 0.5, 12));
    if (seal) return { kind: 'seal', id: seal.weak ? 'weak' : 'body', weak: seal.weak, point: P(seal.point), dist: seal.t };
    const station = this.pieces.raycastStation(ray, Math.min(voxT + 0.5, FLOOR_PICK_M));
    if (station && (!prop || station.t < prop.t)) return { kind: 'nav', id: station.id, nav: 'station', point: P(station.point), dist: station.t };
    // The face (in a drift): a block wins over the plug voxels it stands in.
    if (face && face.t <= voxT + 0.6 && (!prop || face.t <= prop.t)) return { kind: 'face', col: face.col, depth: face.depth, slice: face.slice, point: P(face.point), dist: face.t };
    if (prop) {
      const ob = prop.o;
      const reach = this.props.reachOf(ob);
      if (ob.type === 'nav') return { kind: 'nav', id: ob.id, nav: 'exit', point: P(prop.point), dist: prop.t };
      if (prop.t <= reach) {
        if (ob.type === 'lamp') return { kind: 'lamp', id: ob.id, lit: !!ob.lit, point: P(prop.point), dist: prop.t };
        return { kind: 'tappable', id: ob.id, tappable: ob.kind as never, point: P(prop.point), dist: prop.t };
      }
    }
    if (vox) {
      const hit = o.clone().addScaledVector(d, vox.t);
      if (vox.id === B.FACE_PLUG && face) return { kind: 'face', col: face.col, depth: face.depth, slice: face.slice, point: P(face.point), dist: face.t };
      // An up-facing surface: a floor, ledge, tread or deck (Explore decides walkability with 1B's nav).
      if (vox.ny === 1) return { kind: 'floor', cell: [vox.x, vox.y + 1, vox.z], point: P(hit), dist: vox.t };
      if (vox.t <= REACH_STRIKE_M) {
        const skin = this.skinAt(vox.x, vox.y, vox.z);
        if (skin) return { kind: 'skin', id: skin, cell: [vox.x, vox.y, vox.z], point: P(hit), dist: vox.t };
        return { kind: 'deep', point: P(hit), dist: vox.t };
      }
      return { kind: 'far', point: P(hit), dist: vox.t };
    }
    return { kind: 'far', point: P(o.clone().addScaledVector(d, FAR_POINT_M)), dist: FAR_POINT_M };
  }

  /** The skin socket at a world voxel (1B's sockets of kind 'skin' carry their cell). */
  private skinAt(x: number, y: number, z: number): string | null {
    for (const p of this.placements.values())
      for (const s of p.chamber.sockets) if (s.kind === 'skin' && s.cell && s.cell[0] === x && s.cell[1] === y && s.cell[2] === z) return s.id;
    return null;
  }

  // --------------------------------------------------------------------------------------------------- feedback

  /** A strike lands (tap or hold): the tool's contact pose toward `contactPx`, a crack from the tapped point, chips. */
  strike(pick: Pick, contactPx: { x: number; y: number }, crit = false): void {
    void contactPx;
    const p = pick.point;
    this.viewmodel.strike(p, this.camera, crit);
    if (pick.kind === 'face') this.face.tap(pick.col, pick.depth, p);
    if (pick.kind === 'skin' || pick.kind === 'deep') this.crackAt(p, pick.kind === 'deep' ? 0.25 : 0.6);
    this.fx.chips(new THREE.Vector3(p.x, p.y, p.z), this.camera.position, pick.kind === 'deep' ? 2 : 4, pick.kind === 'deep');
  }

  private crackSlot = 0;
  private crackAt(p: Vec3, stage: number): void {
    const c = SURFACE_UNIFORMS.uCracks.value[this.crackSlot++ % 4];
    c.set(p.x, p.y, p.z, stage);
  }

  /** Face blocks the model broke this frame: 6–9 shards each, nuggets for ore, the hole shows the block behind. */
  breakBlocks(cells: ReadonlyArray<BlockBreak>): void {
    for (const c of cells) {
      const b = this.face.block(c.col, c.depth);
      if (!b) continue;
      this.fx.blockBreak(b.centre, this.face.frameAxes.d, b.kind, c.crit ? 9 : 7);
    }
    if (cells.length) this.renderer.light.invalidateShadows();
  }

  /** The slice at `depth` crumbles (5 of 7 down): the rest crack, shake 0.3 s on their own and fall as one burst. */
  crumble(depth: number): void {
    const F = this.face.frameAxes;
    for (let c = 0; c < 7; c++) {
      const b = this.face.block(c, depth);
      if (b) this.fx.blockBreak(b.centre, F.d, b.kind, 3);
    }
    this.renderer.light.invalidateShadows();
  }

  /** The breach of node `node` falls inward (10–16 large shards, 0.6 s) while the leak widens. */
  breach(node: number): void {
    void node;
    const F = this.face.frameAxes;
    const c = F.o.clone().addScaledVector(F.u, 1.2);
    this.fx.wallFall(c, F.d, F.r, 14);
    this.renderer.light.invalidateShadows();
  }

  /** First light of node `node`'s chamber: t01 0 → 1 drives its fill 0.6 → 1.0 (a uniform, no light propagation). */
  firstLight(node: number, t01: number): void {
    void node;
    const k = Math.max(0, Math.min(1, t01));
    this.renderer.light.setFill(0.6 + 0.4 * k * k * (3 - 2 * k));
  }

  /** A cold Halden lamp is relit (a per-pixel practical while you are in the chamber). */
  relight(lampId: string): void {
    this.props.setLit(lampId, true);
  }

  /** A strike-type tappable or a skin cell was struck (`left` its remaining fraction; 0 = broken). */
  hitTappable(id: string, left: number, crit = false): void {
    const o = this.props.objects.get(id);
    this.props.setLeft(id, left);
    if (o && left <= 0) this.fx.blockBreak(o.centre, new THREE.Vector3().subVectors(o.centre, this.camera.position).normalize(), 2, crit ? 9 : 6);
  }

  /** Deep rock answered a tap (two dark chips at the point). */
  tunk(point: Vec3): void {
    this.fx.chips(new THREE.Vector3(point.x, point.y, point.z), this.camera.position, 2, true);
  }

  /** The focus pop: the object rises to 1.8 m ahead, 1.4 m up in 0.3 s, the world dims 30 %; off returns it. */
  focusPop(id: string, on: boolean): void {
    this.props.focus(id, on);
    this.dim(on ? 0.3 : 0);
  }

  /** The chest in the focus pop opens (its lid lifts, a warm glow; the roll-up is the HUD's). */
  openFocus(id: string): void {
    const o = this.props.objects.get(id);
    if (o) this.fx.glow(o.centre.clone().add(o.group.position), 0xffc06a);
  }

  /** Lantern Raise toward a world point: the lantern lifts 0.2 s and a soft spot of light lands there for 1.4 s. */
  lanternRaise(point: Vec3): void {
    this.viewmodel.raise(point, this.camera);
    this.renderer.light.raise(point);
  }

  /** Explore (W1-LEAD §3): the small amber ring on the tapped destination, shown for 0.4 s (a new call replaces it). */
  walkMarker(point: Vec3): void {
    this.walkMark.position.set(point.x, point.y + 0.02, point.z);
    this.walkMark.visible = true;
    (this.walkMark.material as THREE.MeshBasicMaterial).opacity = 1;
    this.walkT = 0;
  }

  /** Explore: a secret (cracked wall, hollow floor, loose brick) breaks open and shows its cache. */
  revealSecret(id: string): void {
    for (const p of this.placements.values()) {
      const s = p.chamber.sockets.find((x) => x.id === id);
      if (!s) continue;
      for (const r of s.secret?.reveals ?? []) this.props.reveal(r.includes(':') ? r : `${p.node}:${r}`);
      this.fx.wallFall(new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z), new THREE.Vector3(-s.normal.x, -s.normal.y, -s.normal.z), new THREE.Vector3(1, 0, 0), 10);
    }
    this.renderer.light.invalidateShadows();
  }

  /** The single amber rim (SPEC §6.1): the id of a tappable, lamp, nav mark, rack tool or face block ('face:<col>'); null = none. */
  rim(id: string | null, bright = false): void {
    void bright;
    this.face.rim(id);
    this.props.rim(id && !id.startsWith('face:') ? id : null);
  }

  /** The dim hint rim for 0.6 s on the nearest unharvested tappable (after a tunk). */
  hintRim(id: string): void {
    this.props.hint(id);
  }

  /** Crew line levels (Shovel Hand, Pick Crew, Mine Cart in W1): their rigs in the nooks, the scaffold and on the rail. */
  crew(lines: ArrayLike<number>): void {
    this.crewRigs.setLines(lines);
  }

  /** The grade and fog of a biome (cross-faded over `seconds`). */
  look(biome: number, seconds = 0): void {
    void seconds;
    this.biome = biome;
    if (this.piece === 'descent') this.applyLook(lookOf(biome));
  }

  private applyLook(L: SpaceLook): void {
    this.spaceLook = L;
    this.applyIrradiance();
    const rig = this.renderer.light;
    rig.setAmbient({ sky: L.sky, ground: L.ground, gain: L.fillGain, rim: null, openWeight: 0.6, specGain: 1 });
    rig.setFog({ color: L.fog, density: L.fogDensity, heightDensity: L.heightDensity, heightFalloff: L.heightFalloff, heightBase: this.camera.position.y - 1.5 });
    SURFACE_UNIFORMS.uStoneTint.value.setHex(L.stoneTint, THREE.SRGBColorSpace);
    SURFACE_UNIFORMS.uGlowGain.value = [...L.glow];
    const p = this.renderer.post.params;
    p.zoneExposure = L.exposure;
    p.bloomStrength = L.bloomStrength;
    p.threshold = L.bloomThreshold;
    p.vignette = L.vignette;
    p.gradeA = p.gradeB = Math.max(0, this.biome);
    p.gradeMix = 0;
  }

  /** The current grade parameters (C11 lint). */
  grade(): GradeParams {
    const L = this.spaceLook;
    return { exposure: L.exposure, saturation: L.saturation, bloomThreshold: L.bloomThreshold, bloomStrength: L.bloomStrength, vignette: L.vignette };
  }

  /** A camera shake (structural events only: ≤ 0.4°, ≤ 120 ms, one decaying swing). D's FX director gates it. */
  shake(deg: number, ms: number): void {
    const c = clampShake(deg, ms);
    this.shakeDeg = c.deg;
    this.shakeMs = c.ms;
    this.shakeT = 0;
    this.counts.fx.shakes++;
  }

  /** The world dims through the grade (a sheet 30 %, the focus pop 30 %); 0 = none. */
  dim(amount: number): void {
    this.dimAmount = Math.max(0, Math.min(0.6, amount));
    this.renderer.post.params.dim = Math.max(this.dimAmount, this.lastXfade * 0.85);
  }

  // ------------------------------------------------------------------------------------------------- set pieces

  /** Dynamite: three charges hiss into the face (0.5 s fuse), one deep thump, `slices` blow out. */
  dynamite(slices: number): void {
    const F = this.face.frameAxes;
    this.fx.ceremony(1.2);
    for (let s = 0; s < Math.min(3, slices); s++) this.fx.wallFall(F.o.clone().addScaledVector(F.u, 1.2).addScaledVector(F.d, s), F.d, F.r, 12);
    this.renderer.light.invalidateShadows();
  }

  /** The seal fight's view: the mechanism's HP left (0..1) and whether its weak point is lit. */
  seal(left: number, weakLit: boolean): void {
    this.pieces.seal(left, weakLit);
  }

  /** The seal splits (≤ 40 shards, a 0.12 lift ≤ 150 ms) and light pours through the seams. */
  sealBreak(): void {
    const c = this.pieces.breakSeal();
    this.fx.ceremony(1.2);
    if (c) {
      // Planks fall into the light below (the shards go down, away from the viewer).
      this.fx.wallFall(c.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0), 16);
      this.fx.wallFall(c.clone().add(new THREE.Vector3(0, 0.1, 0.5)), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), 16);
    }
    this.renderer.post.params.flash = 0;
    this.renderer.light.invalidateShadows();
  }

  /** The Reveal composition of a biome's Threshold: its title carved in light for 1.6 s. */
  reveal(biome: number): void {
    this.look(biome, 1);
    const key = `idle.biome.${BIOMES[biome]?.id ?? ''}`;
    if (!hasText(key)) return;
    this.dropTitle();
    const tex = titleTexture(t(key), biome);
    if (!tex) return;
    // A plane 7 m out along the view (yaw only), a little above the horizon: the reveal's pitch-up glides onto it.
    const yaw = this.camera.rotation.y;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const w = 4.6, h = w / 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0 });
    mat.color.setScalar(1.6);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.copy(this.camera.position).addScaledVector(fwd, 7).add(new THREE.Vector3(0, 1.4, 0));
    mesh.rotation.set(0, yaw, 0);
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
    mesh.userData.noShadow = true;
    this.scene.add(mesh);
    this.title = { mesh, tex, t: 0 };
  }

  /** The title's life: 0.35 s to light up, a slow breath, gone by 1.6 s (SPEC §3.3 Reveal). */
  private stepTitle(dt: number): void {
    const ti = this.title;
    if (!ti) return;
    ti.t += dt;
    const k = ti.t < 0.35 ? ti.t / 0.35 : ti.t < 1.15 ? 1 : Math.max(0, 1 - (ti.t - 1.15) / 0.45);
    (ti.mesh.material as THREE.MeshBasicMaterial).opacity = k * k * (3 - 2 * k);
    if (ti.t >= 1.6) this.dropTitle();
  }

  private dropTitle(): void {
    if (!this.title) return;
    this.scene.remove(this.title.mesh);
    this.title.mesh.geometry.dispose();
    (this.title.mesh.material as THREE.Material).dispose();
    this.title.tex.dispose();
    this.title = null;
  }

  // ------------------------------------------------------------------------------------------------- tests

  /** Draw calls, triangles and the FX budget counters of the last frame. */
  stats(): FxStats {
    return this.counts;
  }

  /** Mesher and chunk statistics (perf tools, captures). */
  worldStats(): Record<string, number> {
    const c = this.chunks?.stats;
    return { paintMs: Math.round(this.paintMs), chunks: c?.meshed ?? 0, visibleTris: c?.visibleTris ?? 0, totalTris: c?.totalTris ?? 0, drawnChunks: c?.drawn ?? 0, maxMeshMs: Math.round((c?.maxMs ?? 0) * 10) / 10, workerMeshes: c?.workerMeshes ?? 0, propDraws: this.props.draws, propTris: Math.round(this.props.tris) };
  }

  /** Tests (C2, C8): render an ID buffer of the current view (ids 1..n per object, 0 = nothing) at CSS resolution. */
  idBuffer(): { width: number; height: number; ids: Uint16Array; names: string[] } {
    return { width: 0, height: 0, ids: new Uint16Array(0), names: [] };
  }

  dispose(): void {
    this.dropTitle();
    this.viewmodel.dispose();
    this.chunks?.dispose();
    for (const d of this.dressings.values()) d.dispose();
    this.face.dispose();
    this.props.dispose();
    this.crewRigs.dispose();
    this.fx.dispose();
    this.pieces.dispose();
    this.campDressing?.dispose();
    void PROP_UNIFORMS;
  }
}

/** The title carved in light: letters cut into the dark, lit from behind (a warm core, the biome's light bleeding out
 *  of the cuts), on a 1024 × 256 canvas. Null without a 2D canvas (tests, workers). */
function titleTexture(text: string, biome: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d');
  if (!g) return null;
  const glow = biome === 1 ? '120, 236, 170' : biome === 2 ? '120, 210, 255' : '255, 190, 110';
  let size = 96;
  const font = (px: number) => `600 ${px}px Lintel, Georgia, 'Times New Roman', serif`;
  g.font = font(size);
  while (g.measureText(text).width > 920 && size > 40) g.font = font((size -= 4));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // The light behind the cuts: two soft passes in the biome's light, then the hot core.
  g.shadowColor = `rgba(${glow}, 0.9)`;
  g.shadowBlur = 42;
  g.fillStyle = `rgba(${glow}, 0.55)`;
  g.fillText(text, 512, 132);
  g.shadowBlur = 14;
  g.fillStyle = `rgba(${glow}, 0.85)`;
  g.fillText(text, 512, 132);
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255, 246, 228, 0.95)';
  g.fillText(text, 512, 130);
  // The carved lip: the upper edge of each cut catches less light (a dark inner bevel).
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = 'rgba(0, 0, 0, 0.35)';
  g.fillText(text, 512, 124);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
