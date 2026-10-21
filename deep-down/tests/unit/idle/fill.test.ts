// The hybrid fill helpers (src/world/hybrid/fill.ts): the frustum and line-of-sight tests the fill contract and the
// arrival framing use (the per-chamber contract itself runs in tests/unit/hybrid/fillStands.test.ts).
import { describe, expect, it } from 'vitest';
import { DeepWorld } from '../../../src/world/hybrid/DeepWorld';
import { actable, inView, lineOfSight } from '../../../src/world/hybrid/fill';

describe('fill helpers', () => {
  const w = new DeepWorld({ lifeSeed: 12345, runSeed: 7, worker: false });
  w.prime(-6, 5);
  const p = w.placement(0);
  const st = p.chamber.stands[0];

  it('the Root Cellar arrival frames its scripted chest and the sky shaft', () => {
    const chest = p.chamber.sockets.find((s) => s.local === 'f0')!;
    expect(inView(w, st.pos, st.yaw, st.pitch, chest.pos, 20, chest.normal)).not.toBeNull();
    expect(p.chamber.anchors.skyShaft).toBeDefined();
  });

  it('nothing behind the eye or through rock is in view', () => {
    const behind = { x: st.pos.x - 3 * -Math.sin(st.yaw), y: st.pos.y, z: st.pos.z - 3 * -Math.cos(st.yaw) };
    expect(inView(w, st.pos, st.yaw, st.pitch, behind, 20)).toBeNull();
    // Into the rock under the floor.
    expect(lineOfSight(w, st.pos, { x: st.pos.x, y: st.pos.y - 4, z: st.pos.z })).toBe(false);
  });

  it('actable sockets leave out skin, caches and hidden things', () => {
    for (const s of actable(p)) {
      expect(s.kind).not.toBe('skin');
      expect(s.kind).not.toBe('cache');
      expect(s.hidden).toBeFalsy();
    }
  });
});
