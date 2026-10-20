import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { finish } from './kit';

/**
 * Crystal Grotto: the Hand in the Crystal (LOOK.md). A 20 m cyan crystal leaning out of the floor, with the
 * dark outline of a human hand pressed inside it, palm out; smaller crystals crowd its foot.
 */
export function buildCrystal(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  b.push().rotateZ(-0.12);
  b.crystal(3.2, 15, 4.5, 6, 0x2a8ea2, 0x1c6e84, 0.55);
  // The hand inside, just under the front facet: a palm and five fingers in dark silhouette.
  b.push().translate(0.2, 7.5, 2.85);
  b.box(-1.0, -1.4, -0.05, 1.0, 1.0, 0.05, 0x06141c);
  const fingers: Array<[number, number, number]> = [[-0.85, 1.0, 1.7], [-0.4, 1.0, 2.3], [0.05, 1.0, 2.5], [0.5, 1.0, 2.2], [1.1, -0.3, 1.5]];
  fingers.forEach(([x, y, len], i) => {
    b.push().translate(x, y, 0);
    if (i === 4) b.rotateZ(-0.9);
    b.box(-0.17, 0, -0.04, 0.17, len, 0.04, 0x06141c);
    b.pop();
  });
  b.box(-0.7, -3.4, -0.04, 0.7, -1.4, 0.04, 0x08161e);
  b.pop();
  b.pop();
  // The crowd of smaller crystals.
  const lights = [{ x: 0, y: 8, z: 5, color: 0x8fe3ee, intensity: 2.6, radius: 18 }, { x: 0, y: 1, z: 3, color: 0x2fb6cc, intensity: 2, radius: 10 }];
  for (let i = 0; i < 16; i++) {
    const x = rng.range(-7, 7);
    const z = rng.range(-2, 3);
    const s = rng.range(0.4, 1.4) * (1 - Math.abs(x) / 10);
    b.push().translate(x, 0, z).rotateZ(rng.range(-0.5, 0.5)).rotateX(rng.range(-0.3, 0.3));
    b.crystal(0.5 * s + 0.2, 2.4 * s + 0.6, 0.8 * s, 6, i % 2 ? 0x3aa8bc : 0x6a4cb0, 0x1c6e84, 0.7);
    b.pop();
  }
  const mesh = finish(b, SCENE_ENCODE, 0x8a9ab5, 0.4, lights, 0, 20);
  const g = new THREE.Group();
  g.name = 'setPiece:crystal';
  g.add(mesh);
  return { object: g, footprint: { w: 14, h: 22 } };
}
