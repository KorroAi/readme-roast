import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { finish } from './kit';

/**
 * Drowned Ruins: the Drowned Procession (LOOK.md). Five stone figures descend a flight of steps into the dark
 * water, each holding a lantern that still burns: the bearers' light carried down.
 */
function figure(b: VoxBuilder, x: number, y: number, z: number, s: number, lean: number): void {
  b.push().translate(x, y, z).scale(s).rotateZ(lean);
  const stone = 0x5a7480;
  b.box(-0.45, 0, -0.3, 0.45, 1.6, 0.3, stone);       // robe
  b.box(-0.35, 1.6, -0.25, 0.35, 2.4, 0.25, 0x6a8490); // shoulders
  b.cube(0, 2.7, 0, 0.42, 0.5, 0.42, 0x6a8490);        // head (hooded)
  b.box(0.3, 1.5, 0.1, 0.5, 2.3, 0.3, stone);          // the arm holding the lamp out
  b.box(0.35, 1.25, 0.15, 0.65, 1.45, 0.45, 0x3a3020);
  b.cube(0.5, 1.0, 0.3, 0.32, 0.4, 0.32, 0xff9a48, 1);
  b.pop();
}

export function buildDrowned(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  // The steps, descending left to right into the water.
  for (let i = 0; i < 9; i++) b.box(-11 + i * 2.4, 0, -2.5, -8.6 + i * 2.4, 4.5 - i * 0.55, 2.5, i % 2 ? 0x3e5664 : 0x4a6470);
  const lights = [];
  for (let i = 0; i < 5; i++) {
    const x = -9.6 + i * 4.2;
    const y = 4.5 - (i * 4.2 / 2.4) * 0.55 - 0.05;
    figure(b, x, Math.max(0.1, y), rng.range(-0.6, 0.6), 1.25 - i * 0.04, rng.range(-0.05, 0.05));
    lights.push({ x: x + 0.6, y: Math.max(0.1, y) + 1.3, z: 1.2, color: 0xff9a48, intensity: 1.8, radius: 6 });
  }
  // Broken columns behind them.
  for (let i = 0; i < 4; i++) b.box(-10 + i * 6.5, 0, -4.5, -8.8 + i * 6.5, rng.range(5, 9), -3.3, 0x34505e);
  lights.push({ x: 0, y: 6, z: 6, color: 0x5fb7ff, intensity: 1.4, radius: 26 });
  const mesh = finish(b, SCENE_ENCODE, 0x3f86b0, 0.4, lights, 0, 9);
  const g = new THREE.Group();
  g.name = 'setPiece:drowned';
  g.add(mesh);
  return { object: g, footprint: { w: 24, h: 10 } };
}
