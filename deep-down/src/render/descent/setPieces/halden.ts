import * as THREE from 'three';
import type { Rng } from '../../../core/rng';
import { SCENE_ENCODE } from '../../lighting';
import { lookShared } from '../../look';
import { VoxBuilder } from '../../voxModel';
import type { SetPiece } from './index';
import { finish } from './kit';

/**
 * Halden Works: the Crusher Hall (LOOK.md). A timber hoist tower over a boiler with a glowing firebox, and two
 * 12 m gear wheels turning against each other: the Halden machine still running, alone, in the deep.
 */
function gear(radius: number, teeth: number, color: number): VoxBuilder {
  const b = new VoxBuilder();
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2;
    b.push().rotateZ(a);
    b.box(-0.35, radius - 0.2, -0.3, 0.35, radius + 0.7, 0.3, color);
    b.pop();
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    b.push().rotateZ(a);
    b.box(-radius * 0.14, radius - 0.6, -0.35, radius * 0.14, radius + 0.05, 0.35, color);
    b.pop();
  }
  for (let i = 0; i < 6; i++) {
    b.push().rotateZ((i / 6) * Math.PI * 2);
    b.box(-0.25, 0, -0.2, 0.25, radius - 0.4, 0.2, color);
    b.pop();
  }
  b.cube(0, 0, 0, 1.4, 1.4, 1, 0xc8a060);
  return b;
}

export function buildHalden(rng: Rng): SetPiece {
  const b = new VoxBuilder();
  // The hoist tower: four timber legs, cross braces and a head with the sheave.
  const H = 17;
  for (const x of [-3, 3]) for (const z of [-2, 1]) b.box(x - 0.3, 0, z - 0.3, x + 0.3, H, z + 0.3, 0x5e4228);
  for (let y = 3; y < H; y += 3.5) {
    b.box(-3.3, y, 0.7, 3.3, y + 0.35, 1.3, 0x4a3420);
    b.push().translate(0, y + 1.6, 1).rotateZ(0.5);
    b.box(-3.6, -0.15, -0.15, 3.6, 0.15, 0.15, 0x4a3420);
    b.pop();
  }
  b.box(-3.6, H, -2.4, 3.6, H + 0.8, 1.6, 0x3e2c1a);
  // The boiler and its firebox.
  b.push().translate(-6.5, 0, 0);
  b.crystal(2, 5, 0, 10, 0x6a5038, 0x5a4430, 0);
  b.cube(0, 1.2, 2, 1.4, 1.1, 0.2, 0xff8a30, 1);
  b.box(-0.3, 5, -0.3, 0.3, 9, 0.3, 0x2a2420);
  b.pop();
  // A brass cage hanging in the tower.
  b.box(-1.2, 8, -0.8, 1.2, 10.4, 0.8, 0xb08840);
  b.cube(0, 9.2, 0.82, 1.9, 1.9, 0.05, 0x2a2016);
  const lights = [
    { x: -6.5, y: 1.4, z: 3.2, color: 0xff8a30, intensity: 3.5, radius: 12 },
    { x: 0, y: 10, z: 2.5, color: 0x6fd6c4, intensity: 1.8, radius: 10 },
    { x: 4, y: 16, z: 3, color: 0xffe0b0, intensity: 1.2, radius: 14 },
  ];
  const mesh = finish(b, SCENE_ENCODE, 0x7a6048, 0.35, lights, 0, H);
  const g = new THREE.Group();
  g.name = 'setPiece:halden';
  g.add(mesh);
  // Two gear wheels meshing, turning from the shared look clock.
  const clock = lookShared().uLookTime;
  const g1 = finish(gear(4.2, 18, 0x8a6a40), SCENE_ENCODE, 0x7a6048, 0.4, lights, -5, 5);
  const g2 = finish(gear(2.6, 11, 0x9a7a4a), SCENE_ENCODE, 0x7a6048, 0.4, lights, -3, 3);
  g1.position.set(5.8, 5.2, 0.4);
  g2.position.set(5.8 + 4.2 + 2.6 + 0.4, 8.4, 0.4);
  const spin = rng.range(0.25, 0.35);
  g1.onBeforeRender = () => (g1.rotation.z = clock.value * spin);
  g2.onBeforeRender = () => (g2.rotation.z = -clock.value * spin * (18 / 11) + 0.14);
  g.add(g1, g2);
  return { object: g, footprint: { w: 22, h: 19 } };
}
