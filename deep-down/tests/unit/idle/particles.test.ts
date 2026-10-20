import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GpuParticles, governed, motionAt } from '../../../src/render/fx/GpuParticles';
import { Rng } from '../../../src/core/rng';
import type { LightingUniforms } from '../../../src/render/lighting';

// SPEC §11.4, §10.12: stateless particles; the closed-form motion matches a stepped integration; the density
// governor never exceeds the cap and never kills a live particle early.
describe('GPU particles', () => {
  it('the closed-form drag-and-gravity motion matches a stepped integration', () => {
    for (const [p0, v0, g, k] of [[0, 3, -9.8, 2], [1, -1, 0, 0.5], [0, 2, -4, 0], [5, 0, 1.2, 3.5]]) {
      let p = p0;
      let v = v0;
      const dt = 1e-4;
      for (let i = 0; i < 12000; i++) {
        const v1 = v + (g - k * v) * dt;
        p += ((v + v1) / 2) * dt;
        v = v1;
      }
      expect(motionAt(p0, v0, g, k, 1.2)).toBeCloseTo(p, 3);
    }
  });

  it('the governor scales a burst by min(1, cap / (live + requested)) and never exceeds the cap', () => {
    expect(governed(16, 0, 1024)).toBe(16);
    expect(governed(100, 1000, 1024)).toBeLessThanOrEqual(24);
    expect(governed(50, 1024, 1024)).toBe(0);
    for (let live = 0; live <= 1024; live += 37) for (const req of [1, 8, 64, 400]) expect(live + governed(req, live, 1024)).toBeLessThanOrEqual(1024);
  });

  it('a stream of bursts stays under the preset cap, and every particle lives its full life', () => {
    const lighting = {} as LightingUniforms;
    const ps = new GpuParticles(lighting, 384, 4096);
    const rng = new Rng(5);
    const cam = new THREE.PerspectiveCamera();
    let maxLive = 0;
    for (let f = 0; f < 600; f++) {
      ps.burst({ kind: 'dust', x: 0, y: 0, z: 0, count: 40, color: 0x808080, speed: [0.5, 1], life: [0.6, 1.2], size: [0.1, 0.3] }, rng);
      ps.update(1 / 60, cam);
      maxLive = Math.max(maxLive, ps.live);
      expect(ps.live).toBeLessThanOrEqual(ps.cap);
    }
    expect(maxLive).toBeGreaterThan(300);
    // Motion Off: at most 20 per burst.
    ps.motionOff = true;
    ps.update(5, cam);
    expect(ps.burst({ kind: 'spark', x: 0, y: 0, z: 0, count: 200, color: 0xffffff, speed: [1, 2], life: [0.2, 0.3], size: [0.05, 0.02] }, rng)).toBeLessThanOrEqual(20);
    ps.dispose();
  });
});
