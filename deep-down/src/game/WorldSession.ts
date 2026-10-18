import * as THREE from 'three';
import { B, SOLID, isEmitter } from '../config/blocks';
import { loadZone } from '../world/gen/zoneLoader';
import { WORLD } from '../config/balance';
import type { PropSpec, WorldLayout } from '../world/gen/types';
import { LightField, LanternField } from '../world/light';
import { LightingRig } from '../render/lighting';
import { generateTiles, type TileAtlas } from '../render/textures';
import { createTerrainMaterial, createTileTexture } from '../render/terrainMaterial';
import { ChunkRenderer } from '../render/ChunkRenderer';
import { PropRenderer } from '../render/props/PropRenderer';

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * One loaded expedition zone: voxels, light volumes, terrain meshes and props, plus the
 * pristine generated copy used to reset the world and to compute save deltas.
 */
export class WorldSession {
  readonly layout: WorldLayout;
  readonly generated: Uint8Array;
  readonly light: LightField;
  readonly lantern: LanternField;
  readonly rig: LightingRig;
  readonly atlas: TileAtlas;
  readonly tileTexture: THREE.DataArrayTexture;
  readonly terrainMaterial: THREE.ShaderMaterial;
  readonly chunks: ChunkRenderer;
  readonly props: PropRenderer;
  /** Live prop specs by id (positions can change when a prop settles after its anchor is mined). */
  readonly liveProps = new Map<string, PropSpec>();
  readonly removedProps = new Set<string>();
  readonly timings: Record<string, number> = {};

  private constructor(layout: WorldLayout, atlas: TileAtlas, light: LightField) {
    this.layout = layout;
    this.generated = layout.world.blocks.slice();
    this.light = light;
    this.lantern = new LanternField(layout.world);
    const w = layout.world;
    this.rig = new LightingRig(this.light, this.lantern, w.sx, w.sy, w.sz);
    this.atlas = atlas;
    this.tileTexture = createTileTexture(atlas);
    this.terrainMaterial = createTerrainMaterial(this.rig.uniforms, this.tileTexture);
    this.chunks = new ChunkRenderer(w, this.terrainMaterial);
    this.props = new PropRenderer(this.rig.uniforms);
  }

  static async create(onProgress: (p: number, phase: 'carve' | 'light' | 'mesh') => void, seed: number = WORLD.seed): Promise<WorldSession> {
    onProgress(0.02, 'carve');
    await yieldFrame();
    const t0 = performance.now();
    const zone = await loadZone(seed, (phase) => onProgress(phase === 'carve' ? 0.05 : 0.3, phase));
    const atlas = generateTiles();
    const session = new WorldSession(zone.layout, atlas, zone.light);
    Object.assign(session.timings, zone.timings, { zoneTotalMs: Math.round(performance.now() - t0), worker: zone.usedWorker ? 1 : 0 });
    onProgress(0.5, 'mesh');
    await yieldFrame();
    const t2 = performance.now();
    await session.chunks.buildAll((p) => onProgress(0.5 + p * 0.48, 'mesh'));
    session.timings.meshMs = Math.round(performance.now() - t2);
    session.resetProps();
    onProgress(1, 'mesh');
    return session;
  }

  get world() {
    return this.layout.world;
  }

  private resetProps(): void {
    for (const id of [...this.liveProps.keys()]) this.props.remove(id);
    this.liveProps.clear();
    this.removedProps.clear();
    for (const spec of this.layout.props) {
      const copy: PropSpec = { ...spec, anchor: spec.anchor ? [...spec.anchor] : null, emitters: spec.emitters.map((e) => [...e] as [number, number, number]) };
      this.liveProps.set(copy.id, copy);
      this.props.add(copy);
    }
  }

  /** Restore the pristine generated world (New Expedition after a previous session). */
  async reset(): Promise<void> {
    const w = this.world;
    let changed = false;
    for (let i = 0; i < w.blocks.length; i++) {
      if (w.blocks[i] !== this.generated[i]) {
        changed = true;
        break;
      }
    }
    if (changed) {
      w.blocks.set(this.generated);
      w.revision++;
      this.light.computeAll();
      this.rig.lightTex.needsUpdate = true;
      w.markAllDirty();
      await this.chunks.buildAll();
    }
    this.resetProps();
  }

  /** Apply a saved delta (after reset). Invalid entries are ignored. */
  async applySave(edits: number[], removedProps: string[]): Promise<void> {
    const w = this.world;
    const n = w.blocks.length;
    for (let k = 0; k + 1 < edits.length; k += 2) {
      const i = edits[k];
      const id = edits[k + 1];
      if (Number.isInteger(i) && i >= 0 && i < n && Number.isInteger(id) && id >= 0 && id < 256) w.blocks[i] = id;
    }
    w.revision++;
    for (const id of removedProps) this.removeProp(id, false);
    this.settleProps();
    this.light.computeAll();
    this.rig.lightTex.needsUpdate = true;
    w.markAllDirty();
    await this.chunks.buildAll();
  }

  /** Delta of the live world against the generated one: [index, id, ...]. */
  worldEdits(): number[] {
    const out: number[] = [];
    const b = this.world.blocks;
    const g = this.generated;
    for (let i = 0; i < b.length; i++) if (b[i] !== g[i]) out.push(i, b[i]);
    return out;
  }

  /** Keep light and props consistent after a gameplay edit. */
  blockChanged(x: number, y: number, z: number, oldId: number): void {
    const box = this.light.onBlockChanged(x, y, z, oldId);
    this.rig.markLightDirty(box);
    if (!SOLID[this.world.get(x, y, z)]) this.settleProps(x, y, z);
  }

  setBlock(x: number, y: number, z: number, id: number): void {
    const old = this.world.get(x, y, z);
    if (!this.world.set(x, y, z, id)) return;
    this.blockChanged(x, y, z, old);
  }

  removeProp(id: string, updateLight = true): PropSpec | null {
    const spec = this.liveProps.get(id);
    if (!spec) return null;
    this.liveProps.delete(id);
    this.removedProps.add(id);
    this.props.remove(id);
    for (const [ex, ey, ez] of spec.emitters) {
      const cur = this.world.get(ex, ey, ez);
      if (isEmitter(cur) && !SOLID[cur]) {
        if (updateLight) this.setBlock(ex, ey, ez, B.AIR);
        else this.world.blocks[this.world.index(ex, ey, ez)] = B.AIR;
      }
    }
    return spec;
  }

  /**
   * Props whose supporting voxel was mined drop to the next solid ground below (their
   * light emitters move with them). If `x,y,z` is given, only props anchored there move.
   */
  settleProps(x?: number, y?: number, z?: number): void {
    const w = this.world;
    for (const spec of this.liveProps.values()) {
      if (!spec.anchor) continue;
      const [ax, ay, az] = spec.anchor;
      if (x !== undefined && (ax !== x || ay !== y || az !== z)) continue;
      if (SOLID[w.get(ax, ay, az)]) continue;
      // A hanging prop (anchor above its base) loses its chain: it breaks rather than landing half
      // inside the floor.
      if (ay > spec.y) {
        this.removeProp(spec.id);
        continue;
      }
      let ny = ay;
      while (ny > 1 && !SOLID[w.get(ax, ny, az)]) ny--;
      const drop = ay - ny;
      if (drop <= 0) continue;
      spec.anchor = [ax, ny, az];
      spec.y -= drop;
      const moved: Array<[number, number, number]> = [];
      for (const [ex, ey, ez] of spec.emitters) {
        const id = w.get(ex, ey, ez);
        const target: [number, number, number] = [ex, Math.max(ny + 1, ey - drop), ez];
        if (isEmitter(id) && !SOLID[id]) {
          this.setBlock(ex, ey, ez, B.AIR);
          if (!SOLID[w.get(...target)]) this.setBlock(target[0], target[1], target[2], id);
        }
        moved.push(target);
      }
      spec.emitters = moved;
      this.props.remove(spec.id);
      this.props.add(spec);
    }
  }

  /** Light (0..1 per channel) and openness at a world position, read on the CPU. */
  sampleLight(x: number, y: number, z: number): { r: number; g: number; b: number; open: number } {
    const w = this.world;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    if (!w.inBounds(xi, yi, zi)) return { r: 0, g: 0, b: 0, open: 0 };
    const i = w.index(xi, yi, zi) * 4;
    const d = this.light.data;
    return { r: d[i] / 255, g: d[i + 1] / 255, b: d[i + 2] / 255, open: d[i + 3] / 255 };
  }

  dispose(): void {
    this.chunks.dispose();
    this.props.dispose();
    this.rig.dispose();
    this.tileTexture.dispose();
    this.terrainMaterial.dispose();
  }
}
