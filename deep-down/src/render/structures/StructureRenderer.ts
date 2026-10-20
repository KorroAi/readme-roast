import * as THREE from 'three';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { StructureSpec } from './types';
import type { LightingUniforms } from '../lighting';
import type { TerrainUniforms } from '../terrainRig';
import { StructureBuilder } from './builder';
import { buildStructure } from './kinds';
import { COURSE_LIBRARIES } from '../materials/courses';
import { MAT } from '../materials';
import { MAT_SIZE } from '../materials/paint';
import { createStructureMaterial, stoneSpans } from './structureMaterial';

export interface StructureStats {
  structures: number;
  meshes: number;
  vertices: number;
  triangles: number;
  /** GPU bytes of the vertex and index buffers. */
  bytes: number;
  buildMs: number;
}

/** Structures are merged into one mesh per cell of this size (m, horizontal). */
const CELL = 32;
/** Main-thread time per frame spent building cells that are still pending (ms; >= 1 cell). */
const BUILD_BUDGET_MS = 6;

/**
 * Built forms (stair flights, columns, the bridge, coping, timber) drawn as meshes over their
 * voxel collision (B.STRUCTURE, B.RAMP_*): the generator writes both, and
 * structureMaterial.ts. They are static (unbreakable), so they are built once per zone and merged
 * into one draw call per 32 m cell; cells beyond the view distance are hidden like terrain chunks.
 * Cells are built in the first frames after the zone loads (cull(): the nearest first, at least
 * one per frame, then while under BUILD_BUDGET_MS), not during the load itself.
 */
export class StructureRenderer {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly stats: StructureStats = { structures: 0, meshes: 0, vertices: 0, triangles: 0, bytes: 0, buildMs: 0 };
  private readonly meshes: THREE.Mesh[] = [];
  private readonly pending: Array<{ specs: StructureSpec[]; centre: THREE.Vector3 }> = [];
  private readonly world: VoxelWorld | null;
  viewDistance = 96;

  constructor(specs: readonly StructureSpec[], world: VoxelWorld | null, lighting: LightingUniforms, terrain: TerrainUniforms) {
    this.group.name = 'structures';
    // Monolithic stones take the longest joint-free stone of each masonry strip, read from the
    // painted layer (so they follow the painter, whatever its seeds).
    const strips: Array<[number, number]> = [];
    let row = 0;
    for (const h of COURSE_LIBRARIES.A) {
      strips.push([row, h]);
      row += h;
    }
    const img = terrain.uMat.value?.image as { data?: ArrayLike<number> } | undefined;
    this.material = createStructureMaterial(lighting, terrain, stoneSpans(img?.data ?? null, MAT_SIZE, MAT.masonry, strips));
    const cells = new Map<string, { specs: StructureSpec[]; centre: THREE.Vector3 }>();
    for (const spec of specs) {
      const c = specCentre(spec);
      const key = `${Math.floor(c[0] / CELL)},${Math.floor(c[2] / CELL)}`;
      let cell = cells.get(key);
      if (!cell) cells.set(key, (cell = { specs: [], centre: new THREE.Vector3() }));
      cell.specs.push(spec);
      cell.centre.add(new THREE.Vector3(c[0], c[1], c[2]));
    }
    for (const cell of cells.values()) {
      cell.centre.divideScalar(cell.specs.length);
      this.pending.push(cell);
    }
    this.world = world;
  }

  /** Cells still to build. */
  get pendingCells(): number {
    return this.pending.length;
  }

  /** Build every pending cell now. */
  buildAll(): void {
    while (this.pending.length) this.buildCell(this.pending.pop()!);
  }

  /** Build pending cells, the nearest to `focus` first: at least one, then while under budget. */
  private buildPending(focus: THREE.Vector3): void {
    if (!this.pending.length) return;
    const t0 = performance.now();
    this.pending.sort((a, b) => b.centre.distanceToSquared(focus) - a.centre.distanceToSquared(focus));
    do this.buildCell(this.pending.pop()!);
    while (this.pending.length && performance.now() - t0 < BUILD_BUDGET_MS);
  }

  private buildCell(cell: { specs: StructureSpec[] }): void {
    const t0 = performance.now();
    const b = new StructureBuilder(this.world);
    for (const spec of cell.specs) {
      const before = b.vertexCount;
      buildStructure(b, spec);
      if (b.vertexCount > before) this.stats.structures++;
    }
    if (b.vertexCount) {
      const mesh = new THREE.Mesh(toGeometry(b), this.material);
      // Drawn before the terrain: a structure stands in front of the voxel faces next to its
      // hidden cells (a flank behind a parapet band, a wall behind a column), so the depth test
      // rejects those instead of shading them and then overdrawing them.
      mesh.renderOrder = -1;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.geometry.computeBoundingSphere();
      this.meshes.push(mesh);
      this.group.add(mesh);
      this.stats.vertices += b.vertexCount;
      this.stats.triangles += b.idx.length / 3;
      this.stats.bytes += b.vertexCount * 28 + b.idx.length * (b.vertexCount > 65535 ? 4 : 2);
      this.stats.meshes = this.meshes.length;
    }
    this.stats.buildMs = Math.round((this.stats.buildMs + performance.now() - t0) * 10) / 10;
  }

  /** Build what is pending (within budget), then hide cells beyond the view distance (as
   *  ChunkRenderer.cull does for chunks). */
  cull(focus: THREE.Vector3): void {
    this.buildPending(focus);
    for (const m of this.meshes) {
      const s = m.geometry.boundingSphere!;
      m.visible = s.center.distanceTo(focus) - s.radius < this.viewDistance;
    }
  }

  dispose(): void {
    this.pending.length = 0;
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.meshes.length = 0;
    this.group.clear();
  }
}

function toGeometry(b: StructureBuilder): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('aNrm', new THREE.BufferAttribute(new Int8Array(b.nrm), 4, true));
  g.setAttribute('aSt', new THREE.BufferAttribute(new Int16Array(b.st), 2, false));
  g.setAttribute('aLight', new THREE.BufferAttribute(new Int8Array(b.light), 4, true));
  g.setAttribute('aInfo', new THREE.BufferAttribute(new Uint8Array(b.info), 4, false));
  g.setIndex(b.vertexCount > 65535 ? new THREE.BufferAttribute(new Uint32Array(b.idx), 1) : new THREE.BufferAttribute(new Uint16Array(b.idx), 1));
  return g;
}

/** A point inside the structure, for its cell. */
export function specCentre(s: StructureSpec): [number, number, number] {
  switch (s.kind) {
    case 'stairFlight':
      return s.dir === 'x' ? [s.x0 + s.run / 2, s.top - s.run / 2, s.z0] : [s.x0, s.top - s.run / 2, s.z0 + s.run / 2];
    case 'column':
    case 'drum':
      return [s.x, s.y, s.z];
    case 'block':
      return [(s.min[0] + s.max[0]) / 2, (s.min[1] + s.max[1]) / 2, (s.min[2] + s.max[2]) / 2];
    case 'coping':
      return [(s.a[0] + s.b[0]) / 2, s.y, (s.a[1] + s.b[1]) / 2];
    case 'beam':
      return [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, (s.a[2] + s.b[2]) / 2];
    case 'bridge':
      return [s.x, s.deck, (s.z0 + s.z1) / 2];
    case 'pylon':
      return [s.path[0][0], (s.foot + s.top) / 2, s.path[0][1]];
    case 'kerbSlope':
      return [(s.x0 + s.x1) / 2, s.y, s.z];
    case 'deck':
    case 'weathering':
      return [(s.x0 + s.x1) / 2, s.y, (s.z0 + s.z1) / 2];
  }
}
