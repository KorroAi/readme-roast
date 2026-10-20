import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { dome, finish, tube } from './kit';

/**
 * Fungal Deep: the Mother Cap (LOOK.md). A mushroom as tall as a church, its gills glowing violet, its cap
 * spotted with lime light, smaller caps clustered around its foot.
 */
export function buildFungal(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  const H = 20;
  tube(b, [[0, 0, 0], [0.6, 6, 0], [-0.4, 12, 0], [0.2, H, 0]], 2.2, 1.3, 12, 0xd8c8d8);
  // The cap and its glowing gills underneath.
  dome(b, 0.2, H - 0.4, 0, 10, 4.6, 7, 16, 6, 0xa0408e, 0.15);
  dome(b, 0.2, H - 0.45, 0, 9.6, 0.9, 6.7, 16, 2, 0xc58cff, 1, -Math.PI / 2, 0);
  // Spots of lime light on the cap.
  for (let i = 0; i < 22; i++) {
    const lon = rng.range(0, Math.PI * 2);
    const lat = rng.range(0.15, 1.2);
    const x = 0.2 + Math.cos(lat) * Math.cos(lon) * 10;
    const y = H - 0.4 + Math.sin(lat) * 4.6;
    const z = Math.cos(lat) * Math.sin(lon) * 7;
    b.cube(x, y, z, 0.6, 0.25, 0.6, 0xa8ff6a, 1);
  }
  // A ring of smaller caps at the foot.
  for (let i = 0; i < 9; i++) {
    const x = rng.range(-10, 10);
    const z = rng.range(-1, 4);
    const h = rng.range(1.2, 4.5) * (1 - Math.abs(x) / 14);
    tube(b, [[x, 0, z], [x + 0.1, h, z]], 0.25 + h * 0.06, 0.2, 6, 0xd0c0d4);
    dome(b, x + 0.1, h, z, 0.8 + h * 0.35, 0.5 + h * 0.15, 0.8 + h * 0.35, 8, 3, i % 2 ? 0x8a3480 : 0x5aa02a, 0.25);
  }
  const lights = [
    { x: 0, y: H - 2, z: 2, color: 0xc58cff, intensity: 3.4, radius: 20 },
    { x: 0, y: 2, z: 6, color: 0xa8ff6a, intensity: 1.4, radius: 14 },
  ];
  const mesh = finish(b, SCENE_ENCODE, 0x7a5a9a, 0.35, lights, 0, H + 4);
  const g = new THREE.Group();
  g.name = 'setPiece:fungal';
  g.add(mesh);
  return { object: g, footprint: { w: 24, h: 26 } };
}
