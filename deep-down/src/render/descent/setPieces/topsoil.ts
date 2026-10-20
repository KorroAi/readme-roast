import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { finish, tube } from './kit';

/**
 * Topsoil Roots: the root chandelier (LOOK.md). A 12 m inverted tree of roots hangs from the cavern roof,
 * and the Halden crews have hung their lamps from its tips: warm points of people's light in the earth.
 */
export function buildTopsoil(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  const top = 13;
  const roots: Array<Array<[number, number, number]>> = [];
  const tips: Array<[number, number, number]> = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    const reach = rng.range(2.5, 5.5);
    const drop = rng.range(5, 8.5);
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const r = reach * Math.sin(t * Math.PI * 0.6);
      pts.push([Math.cos(a) * r + rng.range(-0.15, 0.15), top - t * drop, Math.sin(a) * r * 0.6]);
    }
    roots.push(pts);
    tips.push(pts[pts.length - 1]);
  }
  // The central bole and the roots.
  tube(b, [[0, top + 1, 0], [0.2, top - 1.5, 0.1], [-0.1, top - 4, 0], [0, top - 6, 0]], 1.2, 0.35, 8, 0x4a3422);
  for (const pts of roots) tube(b, pts, 0.45, 0.06, 6, 0x5a3e28);
  // Lamps on chains at the tips.
  const lights = [];
  for (const [x, y, z] of tips) {
    b.box(x - 0.02, y - 0.9, z - 0.02, x + 0.02, y, z + 0.02, 0x2a2622);
    // A lamp: iron caps above and below a glowing glass body (the body must stay outside the caps to show).
    b.cube(x, y - 0.86, z, 0.6, 0.12, 0.6, 0x3a2c1c);
    b.cube(x, y - 1.54, z, 0.6, 0.12, 0.6, 0x3a2c1c);
    b.cube(x, y - 1.2, z, 0.46, 0.56, 0.46, 0xffc070, 1);
    lights.push({ x, y: y - 1.2, z: z + 0.5, color: 0xffb35c, intensity: 2.4, radius: 9 });
  }
  lights.push({ x: 0, y: 3, z: 6, color: 0x6f7f96, intensity: 0.6, radius: 30 });
  const mesh = finish(b, SCENE_ENCODE, 0x6f7f96, 0.35, lights, 0, top);
  const g = new THREE.Group();
  g.name = 'setPiece:topsoil';
  g.add(mesh);
  return { object: g, footprint: { w: 12, h: 14 } };
}
