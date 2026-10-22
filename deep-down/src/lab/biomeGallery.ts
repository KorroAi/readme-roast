import { B } from '../config/blocks';
import { BIOMES, BIOME_IDS, type BiomeId } from '../config/biomes';
import type { PropKind, PropSpec } from '../world/gen/types';
import type { VoxelWorld } from '../world/VoxelWorld';
import { HANGING_KINDS } from '../render/props/biomeModels';

/**
 * Round 3 (VIS): the Visual Lab's biome gallery (?view=biomes&bay=0..12). One bay per biome (and the
 * Heart): a floor of the biome's floor block, a back wall of its two host rocks with its ores set in,
 * a rock shelf under which its hanging props hang, its ambient props on the floor and its light
 * pocket glowing in a corner. Two rows of seven bays south of the old lab (z 64..127).
 */

export const BAY_W = 18;
const ROW_Z = [66, 98] as const;

export interface Bay {
  biome: BiomeId;
  x0: number;
  z0: number;
  /** Camera and target for the bay's shot (the floor props and the back wall in frame). */
  cam: [number, number, number];
  target: [number, number, number];
  lantern: [number, number, number];
}

export function bays(): Bay[] {
  return BIOME_IDS.map((biome, i) => {
    const row = i < 7 ? 0 : 1;
    const col = i % 7;
    const x0 = 2 + col * BAY_W;
    const z0 = ROW_Z[row];
    const cx = x0 + BAY_W / 2;
    return { biome, x0, z0, cam: [cx, 3.4, z0 + 5], target: [cx, 2.6, z0 + 18], lantern: [cx, 3.2, z0 + 9] };
  });
}

/** Fill the gallery's voxels and return its props. */
export function buildBiomeGallery(w: VoxelWorld): PropSpec[] {
  const props: PropSpec[] = [];
  const set = (x: number, y: number, z: number, id: number) => {
    if (w.inBounds(x, y, z)) w.set(x, y, z, id);
  };
  let seed = 1;
  for (const bay of bays()) {
    const def = BIOMES[bay.biome];
    const [hostA, hostB] = def.hosts;
    const floor = def.floor;
    const { x0, z0 } = bay;
    const x1 = x0 + BAY_W - 1;
    const back = z0 + 21;
    // Floor (2 deep) and its border of host rock.
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= back; z++) {
        set(x, 0, z, hostA);
        set(x, 1, z, x === x0 || x === x1 ? hostA : floor);
      }
    // Back wall: host A on the left, host B on the right, 10 high, with a rough top.
    for (let x = x0; x <= x1; x++)
      for (let y = 2; y < 12; y++)
        for (let z = back; z < back + 3; z++) {
          if (y > 9 && ((x * 7 + z * 3 + y) % 5 === 0)) continue;
          set(x, y, z, x < x0 + BAY_W / 2 ? hostA : hostB);
        }
    // A low step of the floor block and a boulder of host rock in front of the wall.
    for (let x = x0 + 2; x <= x1 - 2; x++) set(x, 2, back - 1, (x & 3) === 0 ? hostB : floor);
    for (const [bx, bz] of [[x0 + 3, back - 4], [x1 - 3, back - 5]]) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) for (let y = 2; y < 4 - dx; y++) set(bx + dx, y, bz + dz, hostA);
    // Ores in the wall: a patch of each, rarer ones smaller and higher.
    def.ores.forEach((o, k) => {
      const px = x0 + 3 + k * 4;
      const py = 3 + k;
      for (let dx = 0; dx < 3 - Math.min(1, k); dx++) for (let dy = 0; dy < 2; dy++) set(px + dx, py + dy, back, o.block);
    });
    // A shelf of rock 8 m up the back wall: hanging props hang from it.
    for (let x = x0 + 1; x <= x1 - 1; x++) for (let z = back - 3; z < back; z++) set(x, 8, z, hostB);
    // Side walls (low), so each bay reads as its own place.
    for (const x of [x0, x1]) for (let z = z0 + 8; z <= back; z++) for (let y = 2; y < 6; y++) set(x, y, z, hostA);
    // The light pocket's emitter (the biome's own light colour) in the right corner, and a warm lamp
    // on the left (every cold space has a human flame).
    set(x1 - 2, 6, back - 1, def.lightBlock);
    set(x0 + 2, 4, back - 1, B.LIGHT_LAMP);
    // Props: ground ones in a row across the floor, hanging ones under the shelf.
    const kinds = def.props;
    let gi = 0;
    let hi = 0;
    for (const kind of kinds) {
      for (let rep = 0; rep < 2; rep++) {
        seed++;
        if (HANGING_KINDS.has(kind)) {
          const x = x0 + 3 + ((hi * 3.3) % (BAY_W - 6));
          hi++;
          props.push({ id: `lab_${bay.biome}_${kind}_${rep}`, kind: kind as PropKind, x: x + 0.5, y: 8, z: back - 1.5, rotY: seed * 0.7, scale: 1, anchor: [Math.floor(x), 8, back - 2], emitters: [], seed });
        } else {
          const x = x0 + 2.5 + ((gi * 2.6) % (BAY_W - 5));
          const z = back - 3.5 - (gi % 3) * 2.2;
          gi++;
          props.push({ id: `lab_${bay.biome}_${kind}_${rep}`, kind: kind as PropKind, x, y: 2, z, rotY: seed * 1.3, scale: 1, anchor: [Math.floor(x), 1, Math.floor(z)], emitters: [], seed });
        }
      }
    }
  }
  return props;
}
