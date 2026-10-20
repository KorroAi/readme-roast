import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { finish } from './kit';

/**
 * Magma Veins: the Forge of the Bearers (LOOK.md). A 15 m anvil on a plinth of basalt columns, a river of lava
 * running at its foot and a hammer the size of a house leaning against it.
 */
export function buildMagma(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  // Basalt columns: the plinth.
  for (let i = 0; i < 14; i++) {
    const x = -6 + (i % 7) * 2;
    const z = -1.5 + Math.floor(i / 7) * 2;
    b.push().translate(x, 0, z);
    b.crystal(1.05, 3 + rng.range(0, 0.8), 0, 6, 0x2a2220, 0x221c1a, 0);
    b.pop();
  }
  // The anvil: foot, waist, face and horn.
  const y0 = 3.6;
  b.box(-4.5, y0, -1.8, 4.5, y0 + 1.6, 1.8, 0x2e2a2c);
  b.box(-2.6, y0 + 1.6, -1.2, 2.6, y0 + 4.6, 1.2, 0x34302e);
  b.box(-7, y0 + 4.6, -1.9, 6, y0 + 7.2, 1.9, 0x3c3836);
  b.push().translate(6, y0 + 5.9, 0).rotateZ(-0.25);
  b.crystal(1.3, 5, 2.5, 6, 0x3c3836, 0x34302e, 0);
  b.pop();
  // Glowing seams on the anvil face: still hot.
  b.box(-6.8, y0 + 7.2, -0.25, 5.8, y0 + 7.3, 0.25, 0xff8a30, 1);
  // The hammer leaning on the right.
  b.push().translate(-9, 0, 1).rotateZ(-0.35);
  b.box(-0.3, 0, -0.3, 0.3, 9, 0.3, 0x3a2a1c);
  b.box(-1.6, 9, -1, 1.6, 11, 1, 0x2a2628);
  b.pop();
  // The lava river.
  b.box(-12, -0.4, 2.5, 12, 0.05, 4.5, 0xff7a1a, 1);
  const lights = [
    { x: 0, y: 0.5, z: 4, color: 0xff6a2a, intensity: 4, radius: 16 },
    { x: 0, y: y0 + 7.5, z: 1.5, color: 0xffc04a, intensity: 1.6, radius: 8 },
  ];
  const mesh = finish(b, SCENE_ENCODE, 0x8a4a30, 0.3, lights, 0, 14);
  const g = new THREE.Group();
  g.name = 'setPiece:magma';
  g.add(mesh);
  return { object: g, footprint: { w: 24, h: 15 } };
}
