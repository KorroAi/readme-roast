import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { dome, finish, tube } from './kit';

/**
 * Glowroot Caverns: the Rootheart (LOOK.md). An 18 m tangle of roots knotted around a glowing green heart,
 * its tendrils reaching down to the floor and up into the dark.
 */
export function buildGlowroot(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  const cy = 6;
  // The heart: a glowing core inside a cage of roots.
  dome(b, 0, cy, 0, 1.8, 2.2, 1.8, 10, 5, 0x6ae890, 1, -Math.PI / 2, Math.PI / 2);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const tilt = rng.range(-0.6, 0.6);
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const ang = a + t * 2.2;
      const r = 2.4 + Math.sin(t * Math.PI) * 1.4;
      pts.push([Math.cos(ang) * r, cy + Math.sin(t * Math.PI * 2 + tilt) * 2.6 + (t - 0.5) * 2, Math.sin(ang) * r * 0.55]);
    }
    tube(b, pts, 0.32, 0.18, 6, i % 3 === 0 ? 0x4e3a28 : 0x3a2c1e);
  }
  // Tendrils: down to the floor (roots) and up into the roof, with glowing tips.
  const lights = [{ x: 0, y: cy, z: 1.2, color: 0x9be7a8, intensity: 3.2, radius: 16 }];
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x0 = side * rng.range(1.5, 3);
    const up = i >= 6;
    const pts: Array<[number, number, number]> = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7;
      const x = x0 + side * t * rng.range(3, 8);
      const y = up ? cy + 2 + t * 7 : cy - 2 - t * (cy - 2) + Math.sin(t * Math.PI) * 1.2;
      pts.push([x, Math.max(0, y), rng.range(-1, 1) * t]);
    }
    tube(b, pts, 0.35, 0.08, 5, 0x3a2c1e);
    const tip = pts[pts.length - 1];
    b.cube(tip[0], tip[1], tip[2], 0.3, 0.3, 0.3, 0x9be7a8, 1);
    if (i % 3 === 0) lights.push({ x: tip[0], y: tip[1] + 0.5, z: tip[2] + 0.5, color: 0x5fe0c0, intensity: 1.2, radius: 6 });
  }
  const mesh = finish(b, SCENE_ENCODE, 0x6fa293, 0.3, lights, 0, 14);
  const g = new THREE.Group();
  g.name = 'setPiece:glowroot';
  g.add(mesh);
  return { object: g, footprint: { w: 18, h: 14 } };
}
