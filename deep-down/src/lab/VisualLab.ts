import * as THREE from 'three';
import { B, BLOCKS } from '../config/blocks';
import { Rng } from '../core/rng';
import { t, type TextKey } from '../i18n';
import { VoxelWorld } from '../world/VoxelWorld';
import { LightField, LanternField } from '../world/light';
import { LightingRig } from '../render/lighting';
import { generateTiles } from '../render/textures';
import { createTerrainMaterial, createTileTexture } from '../render/terrainMaterial';
import { TerrainRig } from '../render/terrainRig';
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
import { lanternForTier } from '../config/balance';

/** The explorer's starting lantern (the lab's 'game' lighting uses its pool and intensity). */
const GAME_LANTERN = lanternForTier(1);

export type LabView = 'materials' | 'transitions' | 'crystal' | 'lantern' | 'cracks' | 'particles' | 'pickup' | 'character' | 'props';

export const LAB_VIEWS: Array<{ id: LabView; label: TextKey }> = [
  { id: 'materials', label: 'lab.materials' },
  { id: 'transitions', label: 'lab.transitions' },
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
}

/**
 * Lab lighting. 'review' (the default) is a neutral studio light so every view can be judged on a
 * screen: a grey hemisphere fill on every surface (terrain, props and explorers alike), the
 * preset's lantern as a neutral key with a wider pool, almost no fog and a fixed exposure.
 * 'game' is the real game lighting: the Hollow atmosphere, the tier-1 oil lantern (radius,
 * intensity, warm colour), no fill override. Emission (crystals, runes, lamps) is the same in both.
 */
export type LabLight = 'review' | 'game';
export const LAB_LIGHTS: LabLight[] = ['review', 'game'];
const REVIEW = {
  /** Linear fill on every surface (shaded by the surface's facing, darkened by AO). */
  ambient: [0.95, 0.95, 1.0] as const,
  /** Extra fill in open space (scaled by openness squared, like the zones' open-space fill). */
  open: [0.2, 0.2, 0.22] as const,
  /** Neutral key (the preset's lantern): colour (linear), intensity and minimum pool radius. */
  key: [1.55, 1.5, 1.45] as const,
  keyIntensity: 1.1,
  keyRadius: 15,
  fog: 0.004,
  exposure: 1.15,
};

/** Fixed camera + light presets so changes can be compared screenshot to screenshot. */
const PRESETS: Record<LabView, Preset> = {
  materials: { cam: [20, 11, 0.5], target: [20, 2.5, 12], lantern: [20, 7, 8], lanternRadius: 16 },
  transitions: { cam: [96, 11, 4], target: [96, 3.5, 25], lantern: [96, 4.2, 22], lanternRadius: 12 },
  crystal: { cam: [10, 4.6, 35.4], target: [15.5, 3.2, 44], lantern: [9.5, 4.5, 35], lanternRadius: 6 },
  lantern: { cam: [33, 7.5, 36], target: [40.5, 3, 43], lantern: [40, 3.8, 41], lanternRadius: 11 },
  cracks: { cam: [24, 4.6, 54.6], target: [24, 2.4, 59.5], lantern: [24, 5, 56], lanternRadius: 12 },
  particles: { cam: [51.5, 4.6, 54.6], target: [51.5, 2.8, 59.5], lantern: [51.5, 5, 56], lanternRadius: 12 },
  pickup: { cam: [11.5, 4.2, 54.2], target: [11.5, 2.6, 59.5], lantern: [11.5, 5, 56], lanternRadius: 12 },
  character: { cam: [57, 3.6, 25.2], target: [57, 3.0, 30.5], lantern: [57, 4.4, 28], lanternRadius: 11 },
  props: { cam: [24, 6.5, 22], target: [26, 3.2, 30], lantern: [24, 5.5, 25], lanternRadius: 13 },
};

/**
 * Transitions court (x 70..124, z 4..33, east of the original lab): the wall and floor pairs
 * the material system must join naturally, under an orbiting lantern and a fixed cyan source.
 * Camera stops: overview, two close-ups and a grazing look along the chunk seam at x = 96.
 */
export type TransitionCam = 'overview' | 'geology' | 'minerals' | 'masonry' | 'crumble' | 'seam';
export const TRANSITION_CAMS: TransitionCam[] = ['overview', 'geology', 'minerals', 'masonry', 'crumble', 'seam'];
/** Camera stops, each with the lantern orbit it is judged under (centre, radii, height). */
const TR_CAMS: Record<TransitionCam, { cam: [number, number, number]; target: [number, number, number]; orbit: { x: number; z: number; rx: number; rz: number; y: number } }> = {
  // The whole court (x 70..124) in one frame on a phone-shaped screen, the seam wall and the steps
  // in front, the labels above the back wall.
  overview: { cam: [96, 9, 5.5], target: [96, 5.5, 30], orbit: { x: 96, z: 25, rx: 16, rz: 3, y: 4.4 } },
  geology: { cam: [83, 5.2, 21.5], target: [83, 4.8, 30], orbit: { x: 83, z: 27, rx: 5, rz: 1.5, y: 4.6 } },
  minerals: { cam: [96, 5.6, 21.5], target: [96, 5.4, 30], orbit: { x: 96, z: 27, rx: 5, rz: 1.5, y: 4.6 } },
  masonry: { cam: [112, 5.2, 21.5], target: [112, 4.8, 30], orbit: { x: 112, z: 27, rx: 5, rz: 1.5, y: 4.6 } },
  crumble: { cam: [108.5, 4.2, 25.5], target: [108.5, 4, 30], orbit: { x: 108.5, z: 27.5, rx: 2.5, rz: 0.8, y: 4.2 } },
  seam: { cam: [89.5, 3.9, 8.5], target: [97, 3.2, 13.5], orbit: { x: 96, z: 9.5, rx: 5, rz: 1.2, y: 3.6 } },
};
const TR_FOG = { off: 0.012, on: 0.055 };

const TRANSITION_LABELS: Array<{ text: TextKey; x: number; y: number; z: number }> = [
  { text: 'lab.tr.stoneSoil', x: 75.5, y: 12, z: 29.5 },
  { text: 'lab.tr.stoneWeathered', x: 83.5, y: 12, z: 29.5 },
  { text: 'lab.tr.stoneOre', x: 92, y: 12, z: 29.5 },
  { text: 'lab.tr.stoneCrystal', x: 100.5, y: 12, z: 29.5 },
  { text: 'lab.tr.masonryCrumbling', x: 108.5, y: 12, z: 29.5 },
  { text: 'lab.tr.masonryRock', x: 117.5, y: 12, z: 29.5 },
  { text: 'lab.tr.seam', x: 96, y: 6.5, z: 12.5 },
  { text: 'lab.tr.steps', x: 108, y: 7, z: 14 },
];

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
  /** 64 m of original lab (x < 64) plus the transitions court (x 70..124). */
  readonly world = new VoxelWorld(128, 32, 64);
  readonly rig: LightingRig;
  private readonly light: LightField;
  private readonly lantern: LanternField;
  private readonly chunks: ChunkRenderer;
  private readonly props: PropRenderer;
  private readonly explorers: ExplorerModel[] = [];
  private readonly marker: TargetMarker;
  private readonly terrain: TerrainRig;
  private crackStage = -1;
  private readonly debris: DebrisSystem;
  private readonly particles: ParticleSystem;
  private readonly drops: DropSystem;
  private readonly rng = new Rng(42);
  private view: LabView = 'materials';
  private trCam: TransitionCam = 'overview';
  private trFog = false;
  /** Fixed lantern orbit angle for repeatable captures (null = animate). */
  private trLanternAngle: number | null = null;
  /** Optional fill-light override (?amb=0..1) to inspect albedo without the lantern. */
  ambientOverride: number | null = null;
  private lighting: LabLight = 'review';
  /** The real game lighting, captured from the rig before the lab changes anything. */
  private readonly gameLight: { ambient: THREE.Color; open: THREE.Color; lantern: THREE.Color; fog: number };
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
    const lu = this.rig.uniforms;
    this.gameLight = { ambient: lu.uAmbient.value.clone(), open: lu.uOpenAmbient.value.clone(), lantern: lu.uLanternColor.value.clone(), fog: lu.uFogDensity.value };
    const atlas = generateTiles();
    const tiles = createTileTexture(atlas);
    this.terrain = new TerrainRig();
    this.chunks = new ChunkRenderer(this.world, createTerrainMaterial(this.rig.uniforms, tiles, this.terrain.uniforms));
    this.props = new PropRenderer(this.rig.uniforms);
    this.debris = new DebrisSystem(this.world, this.rig.uniforms, 400);
    this.particles = new ParticleSystem(this.rig.uniforms, 320);
    this.drops = new DropSystem(this.world, this.rig.uniforms, atlas);
    this.scene.add(this.chunks.group, this.props.group, this.debris.group, this.particles.group, this.drops.group);
    // Crack stages are drawn by the terrain shader on the sculpted surface: one marker cycles
    // through all stages (with an impact flash per stage) on the centre block of the crack row.
    this.marker = new TargetMarker(tiles, this.terrain);
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
    // Crack row and particle / pickup pads, in front of a backdrop wall (so the views are judged
    // against stone, not the void past the lab's edge).
    w.fill(4, 2, 62, 58, 9, 63, B.SLATE);
    w.fill(19, 2, 59, 28, 2, 59, B.SLATE);
    w.fill(50, 2, 59, 53, 2, 59, B.COPPER_ORE);
    w.fill(10, 2, 59, 13, 2, 59, B.UMBER);
    // Character stage: soft warm lamp on the left, cyan rim on the right.
    w.fill(52, 2, 33, 62, 8, 33, B.ANCIENT_BRICK);
    w.setRaw(53, 3, 31, B.LIGHT_LAMP);
    w.setRaw(62, 3, 31, B.LIGHT_CYAN);
    this.buildTransitions();
    // Bedrock shell to keep the lab sealed like the game world.
    for (let z = 0; z < w.sz; z++)
      for (let x = 0; x < w.sx; x++) {
        w.setRaw(x, 31, z, B.BEDROCK);
      }
  }

  /**
   * The transitions court. Every pair shares a face plane (wall face z = 30 or the floor top at
   * y = 2), because that is where the terrain shader draws natural boundaries; boundaries are
   * ragged on purpose so no edge runs straight along the voxel grid.
   */
  private buildTransitions(): void {
    const w = this.world;
    const set = (x: number, y: number, z: number, id: number) => w.setRaw(x, y, z, id);
    const blobFloor = (cx: number, cz: number, r: number, id: number, salt: number) => {
      for (let z = Math.floor(cz - r - 1); z <= cz + r + 1; z++)
        for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
          const rr = r * (0.75 + 0.5 * ((Math.imul(x * 73856093 ^ z * 19349663 ^ salt, 83492791) >>> 0) / 4294967296));
          if ((x - cx) ** 2 + (z - cz) ** 2 <= rr * rr) set(x, 1, z, id);
        }
    };
    // Court floor (natural stone) and the back wall, 4 m thick and 12 m high.
    w.fill(70, 0, 4, 124, 0, 33, B.DEEP_SLATE);
    w.fill(70, 1, 4, 124, 1, 33, B.SLATE);
    w.fill(70, 2, 30, 124, 13, 33, B.SLATE);
    // A) stone / soil: a soil bank in the wall with an uneven top, soil spilling onto the floor.
    [4, 5, 5, 6, 4, 3, 4].forEach((h, i) => w.fill(72 + i, 2, 30, 72 + i, 1 + h, 31, B.SOIL));
    blobFloor(75, 26.5, 3.2, B.SOIL, 11);
    // B) stone / weathered rock: two folded weathered beds through the wall, a weathered floor patch.
    [0, 0, 1, 1, 1, 0, -1].forEach((o, i) => {
      w.fill(80 + i, 5 + o, 30, 80 + i, 6 + o, 31, B.UMBER);
      set(80 + i, 10 + (i > 3 ? 1 : 0), 30, B.UMBER);
    });
    blobFloor(83, 25.5, 3, B.UMBER, 23);
    // C) stone / copper and iron veins (the copper cluster runs into the next chunk at x = 96).
    for (const [x, y] of [[89, 4], [90, 4], [90, 5], [91, 5], [91, 6], [92, 6], [92, 7], [93, 7]]) set(x, y, 30, B.COPPER_ORE);
    for (const [x, y] of [[94, 7], [95, 7], [95, 8], [94, 8], [95, 9]]) set(x, y, 30, B.IRON_ORE);
    for (const [x, z] of [[90, 28], [91, 28], [91, 27], [92, 29]]) set(x, 1, z, B.COPPER_ORE);
    // D) stone / crystal, a damp floor beside it, and the fixed cyan source.
    for (const [x, y] of [[99, 3], [99, 4], [100, 4], [100, 5], [101, 3], [101, 4]]) set(x, y, 30, B.CRYSTAL);
    set(100, 2, 29, B.CRYSTAL);
    blobFloor(99.5, 24.5, 3.2, B.MOSS, 37);
    set(101, 3, 27, B.LIGHT_CYAN);
    // E) masonry / crumbling masonry (and one inscribed stone), a paved floor with a broken edge.
    w.fill(105, 2, 30, 111, 13, 31, B.ANCIENT_BRICK);
    // A door-sized crumbling patch (like the shrine door) with a few loose blocks around it.
    w.fill(107, 2, 30, 109, 5, 30, B.CRUMBLING_BRICK);
    for (const [x, y] of [[110, 3], [106, 5], [108, 6]]) set(x, y, 30, B.CRUMBLING_BRICK);
    set(110, 9, 30, B.GLYPH_STONE);
    for (let z = 21; z <= 29; z++)
      for (let x = 104; x <= 112; x++) {
        const ragged = (Math.imul(x * 2654435761, z * 40503 + 7) >>> 0) / 4294967296;
        if (z < 23 && ragged < 0.5) continue;
        if ((x === 104 || x === 112) && ragged < 0.4) continue;
        set(x, 1, z, B.ANCIENT_TILE);
      }
    // F) masonry built against natural rock: ashlar below a ragged rock overhang.
    [9, 8, 7, 7, 8, 9, 10, 12].forEach((top, i) => w.fill(113 + i, 2, 30, 113 + i, top, 31, B.ANCIENT_BRICK));
    // Irregular steps: natural stone treads rising to a masonry landing, ragged edges.
    const treads: Array<[number, number, number, number, number]> = [
      // x0, x1, z0, z1, top y
      [102, 104, 12, 16, 2],
      [104, 106, 11, 17, 3],
      [107, 107, 12, 16, 3],
      [108, 109, 12, 17, 4],
      [110, 113, 11, 16, 5],
    ];
    treads.forEach(([x0, x1, z0, z1, top], k) => w.fill(x0, 2, z0 + (k & 1), x1, top, z1 - (k % 3 === 0 ? 1 : 0), k < 3 ? B.SLATE : B.ANCIENT_BRICK));
    set(103, 2, 16, B.AIR);
    set(106, 3, 11, B.AIR);
    // Chunk-seam test: a low mixed-material wall and a gravel strip crossing x = 96 (and z = 16).
    w.fill(90, 2, 12, 102, 4, 13, B.SLATE);
    for (let x = 90; x <= 102; x++) {
      set(x, 3 + (x % 5 === 0 ? 1 : 0), 12, B.UMBER);
      if (x >= 93 && x <= 99) set(x, 5, 12 + (x & 1), B.MOSS);
    }
    for (let x = 91; x <= 101; x++) for (let z = 15; z <= 17; z++) if ((x + z) % 7 !== 0) set(x, 1, z, B.GRAVEL);
  }

  setView(view: LabView): void {
    this.view = view;
    this.burstTimer = 0;
    const p = PRESETS[view];
    this.camera.position.set(...p.cam);
    this.camera.lookAt(...p.target);
    this.rig.uniforms.uLanternPos.value.set(...p.lantern);
    this.applyLighting();
    if (view === 'transitions') this.applyTransitionOptions();
  }

  get lightMode(): LabLight {
    return this.lighting;
  }

  /** Switch between the review light and the real game lighting (?light=review|game). */
  setLighting(mode: LabLight): void {
    this.lighting = mode;
    this.applyLighting();
    if (this.view === 'transitions') this.applyTransitionOptions();
  }

  /** Lantern pool radius of the current view under the current lighting. */
  private lanternRadius(): number {
    const p = PRESETS[this.view];
    return this.lighting === 'review' ? Math.max(p.lanternRadius, REVIEW.keyRadius) : GAME_LANTERN.radius;
  }

  private applyLighting(): void {
    const u = this.rig.uniforms;
    const review = this.lighting === 'review';
    const g = this.gameLight;
    if (review) {
      u.uAmbient.value.setRGB(...REVIEW.ambient);
      u.uOpenAmbient.value.setRGB(...REVIEW.open);
      u.uLanternColor.value.setRGB(...REVIEW.key);
    } else {
      u.uAmbient.value.copy(g.ambient);
      u.uOpenAmbient.value.copy(g.open);
      u.uLanternColor.value.copy(g.lantern);
    }
    u.uLanternIntensity.value = review ? REVIEW.keyIntensity : GAME_LANTERN.intensity;
    u.uLanternRadius.value = this.lanternRadius();
    // ?amb= still adds a flat fill on terrain (albedo inspection) in either mode.
    u.uDebug.value.set(this.ambientOverride ?? 0, 9999, 0);
    u.uFogDensity.value = review ? REVIEW.fog : g.fog;
    this.renderer.post.params.zoneExposure = review ? REVIEW.exposure : this.rig.exposure;
    const lp = u.uLanternPos.value;
    this.lantern.compute(lp.x, lp.y, lp.z, u.uLanternRadius.value);
    this.rig.markLanternDirty({ x: this.lantern.originX, y: this.lantern.originY, z: this.lantern.originZ });
  }

  /** Transitions view options: camera stop, fog on/off, frozen lantern angle (for captures). */
  setTransitionOptions(o: { cam?: TransitionCam; fog?: boolean; lanternAngle?: number | null }): void {
    if (o.cam) this.trCam = o.cam;
    if (o.fog !== undefined) this.trFog = o.fog;
    if (o.lanternAngle !== undefined) this.trLanternAngle = o.lanternAngle;
    if (this.view === 'transitions') this.applyTransitionOptions();
  }

  get transitionOptions(): { cam: TransitionCam; fog: boolean } {
    return { cam: this.trCam, fog: this.trFog };
  }

  private applyTransitionOptions(): void {
    const c = TR_CAMS[this.trCam];
    this.camera.position.set(...c.cam);
    this.camera.lookAt(...c.target);
    this.rig.uniforms.uFogDensity.value = this.trFog ? TR_FOG.on : this.lighting === 'review' ? REVIEW.fog : this.gameLight.fog;
    this.placeTransitionLantern(this.trLanternAngle ?? this.time * 0.45, true);
  }

  private placeTransitionLantern(a: number, force = false): void {
    const o = TR_CAMS[this.trCam].orbit;
    const lx = o.x + Math.cos(a) * o.rx;
    const lz = o.z + Math.sin(a) * o.rz;
    const ly = o.y + Math.sin(a * 2) * 0.5;
    this.rig.uniforms.uLanternPos.value.set(lx, ly, lz);
    if (this.lantern.update(lx, ly, lz, this.lanternRadius(), force)) this.rig.markLanternDirty({ x: this.lantern.originX, y: this.lantern.originY, z: this.lantern.originZ });
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
      if (this.lantern.update(lx, 3.8, lz, this.lanternRadius())) this.rig.markLanternDirty({ x: this.lantern.originX, y: this.lantern.originY, z: this.lantern.originZ });
    }
    if (this.view === 'transitions') this.placeTransitionLantern(this.trLanternAngle ?? this.time * 0.45);
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
    if (this.view === 'cracks') {
      const stage = Math.floor(this.time * 2.5) % (CRACK_STAGES + 2);
      if (stage !== this.crackStage) {
        this.crackStage = stage;
        if (stage < CRACK_STAGES) this.marker.impact(1);
      }
      this.marker.set({ x: 24, y: 2, z: 59 }, stage < CRACK_STAGES ? (stage + 0.5) / CRACK_STAGES : 0, false, true);
    } else this.marker.set(null, 0, false, false);
    this.marker.update(dt);
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

  /** Labels for the views that have them (materials gallery, transitions court). */
  viewLabels(view: LabView): Array<{ text: string; x: number; y: number; z: number }> {
    if (view === 'materials') return this.materialLabels();
    if (view === 'transitions') return TRANSITION_LABELS.map((l) => ({ ...l, text: t(l.text) }));
    return [];
  }

  label(view: LabView): string {
    return t(LAB_VIEWS.find((v) => v.id === view)!.label);
  }
}
