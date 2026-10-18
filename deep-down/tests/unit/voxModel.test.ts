import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VoxBuilder } from '../../src/render/voxModel';

/** Every triangle's winding must agree with its stored normal (outward, CCW). */
function windingAgrees(g: THREE.BufferGeometry): boolean {
  const p = g.getAttribute('position');
  const n = g.getAttribute('normal');
  const idx = g.getIndex()!;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let t = 0; t < idx.count; t += 3) {
    a.fromBufferAttribute(p, idx.getX(t));
    b.fromBufferAttribute(p, idx.getX(t + 1));
    c.fromBufferAttribute(p, idx.getX(t + 2));
    const geo = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    nn.fromBufferAttribute(n, idx.getX(t));
    if (geo.dot(nn) < 0.9) return false;
  }
  return true;
}

describe('VoxBuilder', () => {
  it('builds boxes with outward counter-clockwise faces', () => {
    const g = new VoxBuilder().box(0, 0, 0, 1, 2, 3, 0xff0000).build();
    expect(g.getAttribute('position').count).toBe(24);
    expect(windingAgrees(g)).toBe(true);
  });

  it('builds crystals with outward faces and tips', () => {
    const g = new VoxBuilder().crystal(0.3, 1, 0.4, 6, 0x00ffff, 0x0088ff, 0.8).build();
    expect(windingAgrees(g)).toBe(true);
  });

  it('keeps winding valid under rotation and translation', () => {
    const b = new VoxBuilder();
    b.push().translate(1, 2, 3).rotateZ(0.6).rotateY(1.1).box(-0.5, 0, -0.5, 0.5, 1, 0.5, 0x888888).crystal(0.2, 0.5, 0.2, 5, 1, 2, 1).pop();
    expect(windingAgrees(b.build())).toBe(true);
  });
});

import { miniBlock } from '../../src/game/Drops';
import { generateTiles } from '../../src/render/textures';
import { TILE } from '../../src/config/tiles';

describe('miniBlock', () => {
  it('builds a 4x4-per-face mini block with outward faces', () => {
    const b = new VoxBuilder();
    miniBlock(b, generateTiles(), TILE.copperOre, 0.3);
    const g = b.build();
    expect(g.getAttribute('position').count).toBe(6 * 16 * 4);
    expect(windingAgrees(g)).toBe(true);
  });
});
