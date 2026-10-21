// The Ride's pass-by glints in ChamberProps (W1-LEAD §3 Ride; source.glints()): built from the model's list with the
// model's ids, strike targets of kind 'glint', hidden once mined, dropped when the run ends.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ChamberProps } from '../../../src/render/hybrid/ChamberProps';
import type { PropMaterials } from '../../../src/render/lantern/propSurface';

const mats = { prop: new THREE.MeshBasicMaterial(), crystal: new THREE.MeshBasicMaterial(), glow: new THREE.MeshBasicMaterial() } as unknown as PropMaterials;

function cam(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(93, 390 / 844, 0.08, 100);
  c.position.set(0, 1.6, 3);
  c.lookAt(0, 1.6, 0);
  c.updateMatrixWorld(true);
  return c;
}

describe('ChamberProps: Ride glints', () => {
  it('builds one strike target per glint with the model id, hides a mined one and drops them after the run', () => {
    const p = new ChamberProps(mats);
    const list = [
      { id: 'ride:0:0', kind: 'ore' as const, pos: new THREE.Vector3(-0.6, 1.5, 0), normal: new THREE.Vector3(0, 0, 1), left: 1 },
      { id: 'ride:0:1', kind: 'crystal' as const, pos: new THREE.Vector3(0.7, 1.7, 0), normal: new THREE.Vector3(0, 0, 1), left: 1 },
    ];
    p.glints(list, 1);
    const t = p.targets(cam(), 390, 844, () => false).filter((x) => x.kind === 'glint');
    expect(t.map((x) => x.id).sort()).toEqual(['ride:0:0', 'ride:0:1']);
    for (const x of t) {
      expect(x.type).toBe('tappable');
      expect(x.visible).toBe(true);
      expect(x.hit.w).toBeGreaterThanOrEqual(88);
      expect(x.state).toBe(0);
    }
    expect(p.draws).toBeGreaterThanOrEqual(3);
    // Mined: gone from the view and from the targets.
    p.glints([{ ...list[0], left: 0 }, list[1]], 1);
    expect(p.targets(cam(), 390, 844, () => false).filter((x) => x.kind === 'glint').map((x) => x.id)).toEqual(['ride:0:1']);
    // The run ends: every glint object is dropped.
    p.glints([], 1);
    expect([...p.objects.values()].filter((o) => o.kind === 'glint')).toHaveLength(0);
  });
});
