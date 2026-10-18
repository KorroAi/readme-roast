import { B, SOLID, TILE_BOTTOM, TILE_SIDE, TILE_TOP, VISIBLE } from '../config/blocks';
import type { VoxelWorld } from '../world/VoxelWorld';

/**
 * Chunk mesher: emits one quad per visible block face that touches a non-opaque voxel.
 *
 * Vertex format (8 bytes):
 *   position: Uint8 x3   local block coordinates within the chunk (0..16)
 *   data:     Uint8 x4   [face 0..5, ambient occlusion 0..3, texture layer, uv bits (u | v<<1)]
 *
 * Pure function of the voxel data, so it is unit-testable and can move to a worker.
 */

export interface ChunkMeshData {
  positions: Uint8Array;
  data: Uint8Array;
  indices: Uint16Array | Uint32Array;
  vertexCount: number;
  faceCount: number;
}

// Face order: +X, -X, +Y, -Y, +Z, -Z. Corners are counter-clockwise seen from outside.
const FACE_NORMALS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
] as const;

const FACE_CORNERS: ReadonlyArray<ReadonlyArray<readonly [number, number, number]>> = [
  [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]],
  [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]],
  [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];

// Texture coordinates per corner so side textures stay upright and are not mirrored.
const FACE_UVS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[1, 0], [1, 1], [0, 1], [0, 0]],
  [[1, 0], [1, 1], [0, 1], [0, 0]],
  [[0, 0], [0, 1], [1, 1], [1, 0]],
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [0, 1]],
  [[0, 0], [1, 0], [1, 1], [0, 1]],
];

const P = 18; // padded chunk edge (16 + 1 border on each side)
const P2 = P * P;
const pad = new Uint8Array(P * P * P);

// AO sample offsets per face/corner: [side1, side2, diagonal] as padded-array index deltas
// relative to the voxel in front of the face.
const AO_OFFSETS: Int32Array[] = [];
for (let f = 0; f < 6; f++) {
  const n = FACE_NORMALS[f];
  const axis = n[0] !== 0 ? 0 : n[1] !== 0 ? 1 : 2;
  const t1 = (axis + 1) % 3;
  const t2 = (axis + 2) % 3;
  const arr = new Int32Array(12);
  for (let c = 0; c < 4; c++) {
    const corner = FACE_CORNERS[f][c];
    const s1 = corner[t1] * 2 - 1;
    const s2 = corner[t2] * 2 - 1;
    const v1 = [0, 0, 0];
    const v2 = [0, 0, 0];
    v1[t1] = s1;
    v2[t2] = s2;
    const idx = (v: number[]) => v[0] + v[1] * P + v[2] * P2;
    arr[c * 3] = idx(v1);
    arr[c * 3 + 1] = idx(v2);
    arr[c * 3 + 2] = idx([v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2]]);
  }
  AO_OFFSETS.push(arr);
}
const FACE_DELTA = FACE_NORMALS.map((n) => n[0] + n[1] * P + n[2] * P2);

const MAX_FACES = 16 * 16 * 16 * 6;
const scratchPos = new Uint8Array(MAX_FACES * 4 * 3);
const scratchData = new Uint8Array(MAX_FACES * 4 * 4);
const scratchIdx = new Uint32Array(MAX_FACES * 6);

/** Opaque = occludes neighbor faces and casts ambient occlusion. */
const OPAQUE = new Uint8Array(256);
for (let i = 0; i < 256; i++) OPAQUE[i] = SOLID[i] && VISIBLE[i] ? 1 : 0;

export function meshChunk(world: VoxelWorld, ccx: number, ccy: number, ccz: number): ChunkMeshData {
  const cs = world.chunkSize;
  if (cs !== 16) throw new Error('mesher expects 16^3 chunks');
  const bx = ccx * cs - 1;
  const by = ccy * cs - 1;
  const bz = ccz * cs - 1;

  // Copy the chunk plus a one-voxel border so the inner loop needs no bounds checks.
  const { sx, sy, sz, blocks } = world;
  let anyVisible = false;
  for (let z = 0; z < P; z++) {
    const wz = bz + z;
    for (let y = 0; y < P; y++) {
      const wy = by + y;
      const row = y * P + z * P2;
      const inside = wz >= 0 && wz < sz && wy >= 0 && wy < sy;
      for (let x = 0; x < P; x++) {
        const wx = bx + x;
        let id: number;
        if (inside && wx >= 0 && wx < sx) id = blocks[wx + sx * (wy + sy * wz)];
        else id = B.BEDROCK; // Outside the world: opaque, never meshed, only occludes.
        pad[x + row] = id;
        if (!anyVisible && x > 0 && y > 0 && z > 0 && x < P - 1 && y < P - 1 && z < P - 1 && VISIBLE[id]) anyVisible = true;
      }
    }
  }

  let faces = 0;
  if (anyVisible) {
    for (let z = 1; z < P - 1; z++)
      for (let y = 1; y < P - 1; y++)
        for (let x = 1; x < P - 1; x++) {
          const i = x + y * P + z * P2;
          const id = pad[i];
          if (!VISIBLE[id]) continue;
          for (let f = 0; f < 6; f++) {
            const front = i + FACE_DELTA[f];
            if (OPAQUE[pad[front]]) continue;
            const layer = f === 2 ? TILE_TOP[id] : f === 3 ? TILE_BOTTOM[id] : TILE_SIDE[id];
            const ao = AO_OFFSETS[f];
            const corners = FACE_CORNERS[f];
            const uvs = FACE_UVS[f];
            const v0 = faces * 4;
            let a0 = 0;
            let a1 = 0;
            let a2 = 0;
            let a3 = 0;
            for (let c = 0; c < 4; c++) {
              const s1 = OPAQUE[pad[front + ao[c * 3]]];
              const s2 = OPAQUE[pad[front + ao[c * 3 + 1]]];
              const cn = OPAQUE[pad[front + ao[c * 3 + 2]]];
              const occ = s1 && s2 ? 0 : 3 - (s1 + s2 + cn);
              if (c === 0) a0 = occ;
              else if (c === 1) a1 = occ;
              else if (c === 2) a2 = occ;
              else a3 = occ;
              const v = v0 + c;
              const corner = corners[c];
              scratchPos[v * 3] = x - 1 + corner[0];
              scratchPos[v * 3 + 1] = y - 1 + corner[1];
              scratchPos[v * 3 + 2] = z - 1 + corner[2];
              scratchData[v * 4] = f;
              scratchData[v * 4 + 1] = occ;
              scratchData[v * 4 + 2] = layer;
              scratchData[v * 4 + 3] = uvs[c][0] | (uvs[c][1] << 1);
            }
            const k = faces * 6;
            // Split along the diagonal joining the brighter pair so AO gradients stay symmetric.
            if (a0 + a2 >= a1 + a3) {
              scratchIdx[k] = v0;
              scratchIdx[k + 1] = v0 + 1;
              scratchIdx[k + 2] = v0 + 2;
              scratchIdx[k + 3] = v0;
              scratchIdx[k + 4] = v0 + 2;
              scratchIdx[k + 5] = v0 + 3;
            } else {
              scratchIdx[k] = v0 + 1;
              scratchIdx[k + 1] = v0 + 2;
              scratchIdx[k + 2] = v0 + 3;
              scratchIdx[k + 3] = v0 + 1;
              scratchIdx[k + 4] = v0 + 3;
              scratchIdx[k + 5] = v0;
            }
            faces++;
          }
        }
  }

  const vertexCount = faces * 4;
  const indexCount = faces * 6;
  const indices = vertexCount <= 65535 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
  for (let k = 0; k < indexCount; k++) indices[k] = scratchIdx[k];
  return {
    positions: scratchPos.slice(0, vertexCount * 3),
    data: scratchData.slice(0, vertexCount * 4),
    indices,
    vertexCount,
    faceCount: faces,
  };
}
