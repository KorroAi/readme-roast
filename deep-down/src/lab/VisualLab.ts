import * as THREE from 'three';
import { B, BLOCKS } from '../config/blocks';
import { Rng } from '../core/rng';
import { t, type TextKey } from '../i18n';
import { VoxelWorld } from '../world/VoxelWorld';
import { LightField, LanternField } from '../world/light';
import { LightingRig } from '../render/lighting';
import { generateTiles } from '../render/textures';
import { createTerrainMaterial, createTileTexture } from '../render/terrainMaterial';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { Renderer } from '../render/Renderer';
import { PropRenderer } from '../render/props/PropRenderer';
import { ExplorerModel } from '../entities/character/ExplorerModel';
import { TargetMarker } from '../game/effects/TargetMarker';
import { DebrisSystem } from '../game/effects/Debris';
import { ParticleSystem } from '../game/effects/Particles';
import { DropSystem } from '../game/Drops';
import { CRACK_STAGES } from '../config/tiles';
import type { ItemId } from '../config/items';

export type LabView = 'materials' | 'crystal' | 'lantern' | 'cracks' | 'particles' | 'pickup' | 'character' | 'props';

export const LAB_VIEWS: Array<{ id: LabView; label: TextKey }> = [
  { id: 'materials', label: 'lab.materials' },
  { id: 'crystal', label: 'lab.crystalLight' },
  { id: 'lantern', label: 'lab.lantern' },
  { id: 'cracks', label: 'lab.cracks' },
  { id: 'particles', label: 'lab.particles' },
  { id: 'pickup', label: 'lab.pickup' },
  { id: 'character', label: 'lab.character' },
  { id: 'props', label: 'lab.props' },
];

interface Preset {
  cam: [number, number, number];
  target: [number, number, number];
  lantern: [number, number, number];
  lanternRadius: number;
  ambient: number;
}

/** Fixed camera + light presets so changes can be compared screenshot to screenshot. */
const PRESETS: Record<LabView, Preset> = {
  materials: { cam: [20, 11, 0.5], target: [20, 2.5, 12], lantern: [20, 7, 8], lanternRadius: 16, ambient: 0.22 },
  crystal: { cam: [10, 6.5, 32], target: [16, 4, 44], lantern: [9, 5, 33], lanternRadius: 6, ambient: 0 },
  lantern: { cam: [33, 7.5, 36], target: [40.5, 3, 43], lantern: [40, 3.8, 41], lanternRadius: 11, ambient: 0 },
  cracks: { cam: [24, 4.6, 54.6], target: [24, 2.4, 59.5], lantern: [24, 5, 56], lanternRadius: 12, ambient: 0.1 },
  particles: { cam: [51.5, 4.6, 54.6], target: [51.5, 2.8, 59.5], lantern: [51.5, 5, 56], lanternRadius: 12, ambient: 0.06 },
  pickup: { cam: [11.5, 4.2, 54.2], target: [11.5, 2.6, 59.5], lantern: [11.5, 5, 56], lanternRadius: 12, ambient: 0.06 },
  character: { cam: [57, 3.6, 25.2], target: [57, 3.0, 30.5], lantern: [57, 4.4, 28], lanternRadius: 11, ambient: 0.05 },
  props: { cam: [24, 6.5, 22], target: [26, 3.2, 30], lantern: [24, 5.5, 25], lanternRadius: 13, ambient: 0.05 },
};

/** Material gallery grid: 6 per row, 3 rows, 4 blocks apart. */
const galleryCell = (i: number) => ({ x: 9 + (i % 6) * 4, z: 6 + Math.floor(i / 6) * 5 });

const MATERIAL_ROW = [
  B.SLATE, B.DEEP_SLATE, B.UMBER, B.SOIL, B.GRAVEL, B.MOSS, B.COPPER_ORE, B.IRON_ORE, B.CRYSTAL, B.HARDENED_SLATE,
  B.ANCIENT_BRICK, B.ANCIENT_TILE, B.CRUMBLING_BRICK, B.GLYPH_STONE, B.PLANK, B.BEAM, B.HEARTH, B.BEDROCK,
];

/**
 * VisualLab: an isolated test world for every core visual element, with repeatable camera
 * and light presets (?view=...). Uses exactly the same renderer, materials and effects as
 * the game, so what passes here looks the same in the cave.
 */
export class VisualLab {
  readonly renderer: Renderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 200);
  readonly world = new VoxelWorld(64, 32, 64);
  readonly rig: LightingRig;
  private readonly light: LightField;
  private readonly lantern: LanternField;
  private readonly chunks: ChunkRenderer;
  private readonly props: PropRenderer;
  private readonly explorers: ExplorerModel[] = [];
  private readonly markers: TargetMarker[] = [];
  private readonly debris: DebrisSystem;
  private readonly particles: ParticleSystem;
  private readonly drops: DropSystem;
  private readonly rng = new Rng(42);
  private view: LabView = 'materials';
  private time = 0;
  private burstTimer = 0;
  frames = 0;
  ready = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, 'high');
    this.build();
    this.light = new LightField(this.world);
    this.light.computeAll();
    this.lantern = new LanternField(this.world);
    this.rig = new LightingRig(this.light, this.lantern, this.world.sx, this.world.sy, this.world.sz);
    const atlas = generateTiles();
    const tiles = createTileTexture(atlas);
    this.chunks = new ChunkRenderer(this.world, createTerrainMaterial(this.rig.uniforms, tiles));
    this.props = new PropRenderer(this.rig.uniforms);
    this.debris = new DebrisSystem(this.world, this.rig.uniforms, 400);
    this.particles = new ParticleSystem(this.rig.uniforms, 320);
    this.drops = new DropSystem(this.world, this.rig.uniforms, atlas);
    this.scene.add(this.chunks.group, this.props.group, this.debris.group, this.particles.group, this.drops.group);
    // Crack stages: one marker per stage on a row of slate blocks.
    for (let s = 0; s < CRACK_STAGES; s++) {
      const m = new TargetMarker(tiles);
      m.set({ x: 19 + s, y: 2, z: 59 }, (s + 0.5) / CRACK_STAGES, false, true);
      this.markers.push(m);
      this.scene.add(m.group);
    }
    // Explorer line-up: idle, walking, jumping, mining (tier 2 tools).
    const poses = [0, 1, 2, 3];
    for (const i of poses) {
      const e = new ExplorerModel(this.rig.uniforms);
      e.root.position.set(54.5 + i * 1.6, 2, 30.5);
      e.root.rotation.y = Math.PI + 0.5;
      e.setEquipment(i < 2 ? 1 : 2, i < 2 ? 1 : 2);
      e.setLantern(1, true);
      this.explorers.push(e);
      this.scene.add(e.root);
    }
    this.props.add({ id: 'lab_crystal', kind: 'crystalCluster', x: 16.5, y: 2, z: 44.5, rotY: 0, scale: 1.3, anchor: null, emitters: [], seed: 7 });
    const kinds = ['campfire', 'workbench', 'chest', 'bedroll', 'crate', 'barrel', 'lanternPost', 'tablet', 'pickaxeRack', 'ropeCoil', 'brokenCart', 'hangingLantern'] as const;
    kinds.forEach((kind, i) => {
      this.props.add({ id: `lab_${kind}`, kind, x: 18.5 + (i % 6) * 2.4, y: kind === 'hangingLantern' ? 4 : 2, z: 29.5 + Math.floor(i / 6) * 3, rotY: Math.PI, scale: 1, anchor: null, emitters: [], seed: i * 13 });
    });
    this.chunks.buildAll().then(() => {
      this.ready = true;
    });
  }

  /** Lab geometry: a floor, a material gallery, a crystal room, a lantern room, demo rows. */
  private build(): void {
    const w = this.world;
    w.fill(0, 0, 0, 63, 31, 63, B.AIR);
    w.fill(0, 0, 0, 63, 1, 63, B.DEEP_SLATE);
    // Material gallery: pedestals of 2x2x2 blocks per material along x, backed by a wall.
    MATERIAL_ROW.forEach((id, i) => {
      const { x, z } = galleryCell(i);
      w.fill(x, 2, z, x + 1, 3, z + 1, id);
    });
    w.fill(0, 2, 22, 63, 9, 22, B.SLATE);
    // Crystal room: a closed dark chamber with one crystal formation and the cluster prop.
    w.fill(4, 2, 36, 28, 12, 52, B.SLATE);
    w.fill(5, 2, 37, 27, 11, 51, B.AIR);
    w.fill(9, 2, 33, 11, 6, 36, B.AIR); // doorway for the camera
    for (const [x, y, z] of [[15, 2, 44], [16, 2, 44], [15, 3, 44], [15, 4, 44], [16, 3, 45], [14, 2, 45], [15, 5, 44], [21, 2, 40], [21, 3, 40]]) w.setRaw(x, y, z, B.CRYSTAL);
    w.setRaw(16, 3, 44, B.LIGHT_CYAN);
    // Lantern room: pillars that cast lantern shadows, no other light.
    w.fill(30, 2, 34, 50, 10, 50, B.SLATE);
    w.fill(31, 2, 35, 49, 9, 49, B.AIR);
    w.fill(33, 2, 32, 35, 6, 35, B.AIR);
    for (const [x, z] of [[37, 39], [43, 39], [37, 45], [43, 45], [40, 47]]) w.fill(x, 2, z, x, 7, z, B.ANCIENT_BRICK);
    w.fill(44, 2, 41, 48, 3, 43, B.COPPER_ORE);
    // Crack row and particle / pickup pads.
    w.fill(19, 2, 59, 28, 2, 59, B.SLATE);
    w.fill(50, 2, 59, 53, 2, 59, B.COPPER_ORE);
    w.fill(10, 2, 59, 13, 2, 59, B.UMBER);
    // Character stage: soft warm lamp on the left, cyan rim on the right.
    w.fill(52, 2, 33, 62, 8, 33, B.ANCIENT_BRICK);
    w.setRaw(53, 3, 31, B.LIGHT_LAMP);
    w.setRaw(62, 3, 31, B.LIGHT_CYAN);
    // Bedrock shell to keep the lab sealed like the game world.
    for (let z = 0; z < 64; z++)
      for (let x = 0; x < 64; x++) {
        w.setRaw(x, 31, z, B.BEDROCK);
      }
  }

  setView(view: LabView): void {
    this.view = view;
    this.burstTimer = 0;
    const p = PRESETS[view];
    this.camera.position.set(...p.cam);
    this.camera.lookAt(...p.target);
    const u = this.rig.uniforms;
    u.uLanternPos.value.set(...p.lantern);
    u.uLanternRadius.value = p.lanternRadius;
    u.uDebug.value.set(p.ambient, 9999, 0);
    u.uFogDensity.value = 0.012;
    this.lantern.compute(p.lantern[0], p.lantern[1], p.lantern[2], p.lanternRadius);
    this.rig.markLanternDirty({ x: this.lantern.originX, y: this.lantern.originY, z: this.lantern.originZ });
  }

  get currentView(): LabView {
    return this.view;
  }

  step(dt: number): void {
    this.time += dt;
    const u = this.rig.uniforms;
    u.uTime.value = this.time;
    if (this.view === 'lantern') {
      // Orbit the lantern around the pillars so occlusion can be judged from any angle.
      const a = this.time * 0.6;
      const lx = 40 + Math.cos(a) * 4;
      const lz = 42 + Math.sin(a) * 4;
      u.uLanternPos.value.set(lx, 3.8, lz);
      if (this.lantern.update(lx, 3.8, lz, PRESETS.lantern.lanternRadius)) this.rig.markLanternDirty({ x: this.lantern.originX, y: this.lantern.originY, z: this.lantern.originZ });
    }
    this.burstTimer -= dt;
    if (this.burstTimer <= 0) {
      this.burstTimer = 1.2;
      if (this.view === 'particles') {
        const def = BLOCKS[B.COPPER_ORE];
        this.debris.burst(52.5, 3.2, 59.5, def.debris, this.rng, { count: 12, speed: 4.2, size: [0.09, 0.22], spread: 0.35 });
        this.particles.dust(52.5, 3.2, 59.5, def.debris[0], 7, this.rng);
        this.debris.burst(50.5, 3.2, 59.5, BLOCKS[B.CRYSTAL].debris, this.rng, { count: 8, speed: 3.5, size: [0.06, 0.14], glow: true });
        this.particles.sparkle(50.5, 3.4, 59.5, 0x8ff6ff, 14, this.rng);
      } else if (this.view === 'pickup') {
        const items: ItemId[] = ['stone', 'copperOre', 'ironOre', 'glimmerShard'];
        for (const item of items) this.drops.spawn(item, 1, 12.5 + this.rng.range(-0.5, 0.5), 3.5, 59.5, this.rng);
      }
    }
    this.markers.forEach((m) => m.update(dt));
    this.explorers.forEach((e, i) => {
      if (i === 3 && !e.swinging) e.swing(0.42);
      e.update(dt, { speed: i === 1 ? 4.6 : 0, grounded: i !== 2, verticalVelocity: i === 2 ? 3 : 0, aimPitch: 0, time: this.time });
    });
    // Pickups fly to a point 2 m in front of the pad (stands in for the explorer).
    this.drops.update(dt, this.time, 10.5, 2, 56.5, () => true, (_i, n) => n, () => undefined);
    this.props.update(dt, this.time, this.camera.position);
    this.debris.update(dt);
    this.particles.update(dt, this.time, this.camera.position.x, this.camera.position.y, this.camera.position.z);
    this.particles.setPixelScale(this.renderer.canvas.height, this.camera.fov);
    this.chunks.update(this.camera.position);
    this.rig.flush(this.renderer.gl);
    this.camera.aspect = this.renderer.aspect;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera, this.time);
    this.frames++;
  }

  /** Screen-space labels for the material gallery (name + world anchor). */
  materialLabels(): Array<{ text: string; x: number; y: number; z: number }> {
    return MATERIAL_ROW.map((id, i) => {
      const { x, z } = galleryCell(i);
      return { text: t(BLOCKS[id].name), x: x + 1, y: 4.5, z: z + 1 };
    });
  }

  label(view: LabView): string {
    return t(LAB_VIEWS.find((v) => v.id === view)!.label);
  }
}
