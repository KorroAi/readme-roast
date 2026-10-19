import * as THREE from 'three';
import type { VoxelWorld } from '../../world/VoxelWorld';
import type { StructureSpec } from '../../world/gen/types';
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

/**
 * Built forms (stair flights, columns, the bridge, coping, timber) drawn as meshes over their
 * voxel collision (B.STRUCTURE, B.RAMP_*): see world/gen (the generator writes both) and
 * structureMaterial.ts. They are static (unbreakable), so they are built once per zone and merged
 * into one draw call per 32 m cell; cells beyond the view distance are hidden like terrain chunks.
 */
export class StructureRenderer {
  readonly group = new THREE.Group();
  readonly material: THREE.ShaderMaterial;
  readonly stats: StructureStats = { structures: 0, meshes: 0, vertices: 0, triangles: 0, bytes: 0, buildMs: 0 };
  private readonly meshes: THREE.Mesh[] = [];
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
    const t0 = performance.now();
    const cells = new Map<string, StructureBuilder>();
    for (const spec of specs) {
      const c = specCentre(spec);
      const key = `${Math.floor(c[0] / CELL)},${Math.floor(c[2] / CELL)}`;
      let b = cells.get(key);
      if (!b) cells.set(key, (b = new StructureBuilder(world)));
      const before = b.vertexCount;
      buildStructure(b, spec);
      if (b.vertexCount > before) this.stats.structures++;
    }
    for (const b of cells.values()) {
      if (!b.vertexCount) continue;
      const mesh = new THREE.Mesh(toGeometry(b), this.material);
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.geometry.computeBoundingSphere();
      this.meshes.push(mesh);
      this.group.add(mesh);
      this.stats.vertices += b.vertexCount;
      this.stats.triangles += b.idx.length / 3;
      this.stats.bytes += b.vertexCount * 28 + b.idx.length * (b.vertexCount > 65535 ? 4 : 2);
    }
    this.stats.meshes = this.meshes.length;
    this.stats.buildMs = Math.round((performance.now() - t0) * 10) / 10;
  }

  /** Hide cells beyond the view distance (as ChunkRenderer.cull does for chunks). */
  cull(focus: THREE.Vector3): void {
    for (const m of this.meshes) {
      const s = m.geometry.boundingSphere!;
      m.visible = s.center.distanceTo(focus) - s.radius < this.viewDistance;
    }
  }

  dispose(): void {
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
