import { describe, expect, it } from 'vitest';
import { mobModel } from '../../src/render/mobs/models';
import { MAX_BONES } from '../../src/render/mobs/rig';
import type { MobKind } from '../../src/game/mobs/types';

// Every creature's model builds (round 2, MOBS): one merged geometry per kind, every vertex bound
// to a bone within the uniform array, sizes in the brief's range (tiny to huge).
const KINDS: MobKind[] = ['crawler', 'gnasher', 'wisp', 'stalker', 'sentinel', 'worm', 'lampling', 'glimmerkin', 'shellback', 'jelly', 'burrower'];

describe('creature models', () => {
  it.each(KINDS)('%s builds within the bone budget', (kind) => {
    const m = mobModel(kind);
    expect(m.bones.length).toBeGreaterThan(0);
    expect(m.bones.length).toBeLessThanOrEqual(MAX_BONES);
    const bone = m.geometry.getAttribute('aBone');
    const pos = m.geometry.getAttribute('position');
    expect(bone.count).toBe(pos.count);
    for (let i = 0; i < bone.count; i++) expect(bone.getX(i)).toBeLessThan(m.bones.length);
    // Parents come before children (the pose composes in order).
    m.bones.forEach((b, i) => expect(b.parent).toBeLessThan(i));
    for (let i = 0; i < pos.count; i++) expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
  });

  it('sizes run from tiny to huge', () => {
    const r = (k: MobKind) => mobModel(k).radius;
    expect(r('lampling')).toBeLessThan(0.3);
    expect(r('glimmerkin')).toBeLessThan(0.5);
    expect(r('stalker')).toBeGreaterThan(1.3);
    expect(r('sentinel')).toBeGreaterThan(1.5);
    expect(r('worm')).toBeGreaterThan(20);
  });
});
