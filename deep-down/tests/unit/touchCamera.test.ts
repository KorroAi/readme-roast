import { describe, expect, it } from 'vitest';
import { angleDelta } from '../../src/core/math';
import { FOLLOW_RATE, followYaw } from '../../src/game/touchCamera';

describe('touch camera follow', () => {
  const cam = 0.4;
  const behind = cam - Math.PI; // body facing along the camera

  it('does nothing when walking straight ahead, standing, or walking back toward the camera', () => {
    expect(followYaw(cam, behind, 0, 1, 1 / 30)).toBe(cam);
    expect(followYaw(cam, behind + 1.5, 0.1, 0.1, 1 / 30)).toBe(cam);
    expect(followYaw(cam, behind + 2.5, 0.4, -0.9, 1 / 30)).toBe(cam);
  });

  it('swings toward the body when walking sideways, on either side, at a bounded rate', () => {
    const right = followYaw(cam, behind + Math.PI / 2, 1, 0, 1 / 30);
    const left = followYaw(cam, behind - Math.PI / 2, -1, 0, 1 / 30);
    expect(right).toBeGreaterThan(cam);
    expect(left).toBeLessThan(cam);
    // Never faster than FOLLOW_RATE x the gap per second.
    expect(Math.abs(right - cam)).toBeLessThanOrEqual((Math.PI / 2) * FOLLOW_RATE / 30 + 1e-9);
  });

  it('converges behind the explorer and turns less on a diagonal', () => {
    let y = cam;
    for (let i = 0; i < 30 * 12; i++) y = followYaw(y, behind + 1.2, 1, 0, 1 / 30);
    expect(Math.abs(angleDelta(y, behind + 1.2 + Math.PI))).toBeLessThan(0.05);
    const diag = followYaw(cam, behind + 0.8, 0.7, 0.7, 1 / 30) - cam;
    const side = followYaw(cam, behind + 0.8, 1, 0, 1 / 30) - cam;
    expect(diag).toBeGreaterThan(0);
    expect(diag).toBeLessThan(side);
  });
});
