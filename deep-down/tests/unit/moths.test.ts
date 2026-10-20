import { beforeAll, describe, expect, it } from 'vitest';
import { MOTHS } from '../../src/config/balance';
import { SOLID } from '../../src/config/blocks';
import { MothFlock, type MothAnchor, type MothLantern } from '../../src/game/moths';
import { B } from '../../src/config/blocks';
import { VoxelWorld } from '../../src/world/VoxelWorld';

// Synthetic anchors in a synthetic cave (the zone generator is gone): an open grotto 24 x 14 x 24 m in solid
// rock, with roosts in its middle and secrets against its walls (a crack, a rune door) and in an alcove.
let world: VoxelWorld;
let isOpen: (x: number, y: number, z: number) => boolean;
const ANCHORS: Record<string, MothAnchor> = {
  grotto: { id: 'grotto', x: 32, y: 8, z: 32, count: 8, radius: 1.2, secret: false },
  reliquary: { id: 'reliquary', x: 26, y: 6, z: 28, count: 6, radius: 1.2, secret: false },
  monolith: { id: 'monolith', x: 38, y: 7, z: 36, count: 6, radius: 1.2, secret: false },
  grottoCrack: { id: 'grottoCrack', x: 20.6, y: 6, z: 32, count: 5, radius: 0.4, secret: true },
  runeDoor1: { id: 'runeDoor1', x: 43.4, y: 5, z: 30, count: 5, radius: 0.4, secret: true },
};
const anchor = (id: string): MothAnchor => ANCHORS[id];
const dark: MothLantern = { x: 0, y: 0, z: 0, lit: false, fuelFrac: 0 };

beforeAll(() => {
  world = new VoxelWorld(64, 32, 64);
  world.fill(0, 0, 0, 63, 31, 63, B.SLATE);
  world.fill(20, 2, 20, 43, 15, 43, B.AIR);
  isOpen = (x, y, z) => !SOLID[world.get(x, y, z)];
});

function homeDistances(f: MothFlock, a: MothAnchor): number[] {
  const out: number[] = [];
  for (let i = 0; i < f.active; i++) out.push(Math.hypot(f.positions[i * 3] - a.x, f.positions[i * 3 + 1] - a.y, f.positions[i * 3 + 2] - a.z));
  return out;
}

describe('lumen moths', () => {
  it('are deterministic', () => {
    const a = anchor('grotto');
    const run = () => {
      const f = new MothFlock([a], 7, 32);
      for (let k = 0; k < 120; k++) f.step(1 / 30, { x: a.x + 3, y: a.y, z: a.z, lit: true, fuelFrac: 1 }, a.x + 3, a.y, a.z, isOpen);
      return Array.from(f.positions.slice(0, f.active * 3));
    };
    expect(run()).toEqual(run());
  });

  it('roost within 1.5 m of their anchor', () => {
    const a = anchor('grotto');
    const f = new MothFlock([a], 3, 32);
    for (let k = 0; k < 150; k++) f.step(1 / 30, dark, a.x, a.y, a.z, isOpen);
    expect(f.active).toBe(a.count);
    for (let k = 0; k < 150; k++) {
      f.step(1 / 30, dark, a.x, a.y, a.z, isOpen);
      for (const d of homeDistances(f, a)) expect(d).toBeLessThanOrEqual(1.5);
    }
  });

  it('come to a lit lantern 5 m away (4 or more within 2 m in 4 s), and go home when it fails', () => {
    const a = anchor('grotto');
    const f = new MothFlock([a], 5, 32);
    for (let k = 0; k < 60; k++) f.step(1 / 30, dark, a.x, a.y, a.z, isOpen);
    // A lantern 5 m off in the open geode.
    const L = { x: a.x - 4.1, y: a.y - 1.5, z: a.z + 2.4, lit: true, fuelFrac: 0.9 };
    expect(isOpen(Math.floor(L.x), Math.floor(L.y), Math.floor(L.z))).toBe(true);
    expect(Math.hypot(L.x - a.x, L.y - a.y, L.z - a.z)).toBeGreaterThan(4.9);
    let t = 0;
    let close = 0;
    while (t < 4 && close < 4) {
      f.step(1 / 30, L, L.x, L.y - 1, L.z, isOpen);
      t += 1 / 30;
      close = 0;
      for (let i = 0; i < f.active; i++) if (Math.hypot(f.positions[i * 3] - L.x, f.positions[i * 3 + 1] - L.y, f.positions[i * 3 + 2] - L.z) <= 2) close++;
    }
    expect(close, `moths within 2 m of the lantern after ${t.toFixed(1)} s`).toBeGreaterThanOrEqual(4);
    // Not more than drawnMax at a time.
    for (let k = 0; k < 60; k++) expect(f.step(1 / 30, L, L.x, L.y - 1, L.z, isOpen)).toBeLessThanOrEqual(MOTHS.drawnMax);
    // Low fuel releases them: all back within 2 m of the roost in 6 s.
    const low = { ...L, fuelFrac: 0.15 };
    for (let k = 0; k < 180; k++) f.step(1 / 30, low, L.x, L.y - 1, L.z, isOpen);
    for (const d of homeDistances(f, a)) expect(d).toBeLessThanOrEqual(2);
  });

  it('keep tapping at a secret (the slit, a rune door) even with a lantern beside them', () => {
    for (const id of ['grottoCrack', 'runeDoor1']) {
      const a = anchor(id);
      const f = new MothFlock([a], 17, 32);
      const L = { x: a.x + 1.5, y: a.y - 0.4, z: a.z, lit: true, fuelFrac: 1 };
      for (let k = 0; k < 240; k++) f.step(1 / 30, L, L.x, L.y - 1, L.z, isOpen);
      const tapping = homeDistances(f, a).filter((d) => d <= 0.5).length;
      expect(tapping, `${id} tapping moths`).toBeGreaterThanOrEqual(Math.min(3, a.count));
    }
  });

  it('keep to the cap, nearest anchors first, only within 45 m', () => {
    const all = Object.keys(ANCHORS).map(anchor);
    const f = new MothFlock(all, 9, 40);
    f.setLimit(16);
    const g = anchor('grotto');
    for (let k = 0; k < 30; k++) f.step(1 / 30, dark, g.x, g.y, g.z, isOpen);
    expect(f.active).toBeLessThanOrEqual(16);
    expect(f.active).toBeGreaterThan(0);
    f.setLimit(40);
    for (let k = 0; k < 30; k++) f.step(1 / 30, dark, g.x, g.y, g.z, isOpen);
    expect(f.active).toBeLessThanOrEqual(40);
    // Far from every anchor: none fly.
    for (let k = 0; k < 30; k++) f.step(1 / 30, dark, 2, 120, 2, isOpen);
    expect(f.active).toBe(0);
  });

  it('never enter rock (60 s at 30 fps at the grotto and the black stone, a lantern moving through)', () => {
    for (const id of ['grotto', 'grottoCrack', 'monolith', 'runeDoor1']) {
      const a = anchor(id);
      const f = new MothFlock([a], 11, 32);
      let bad = 0;
      for (let k = 0; k < 1800; k++) {
        const t = k / 30;
        const L = { x: a.x + Math.cos(t * 0.4) * 4, y: a.y - 0.5, z: a.z + Math.sin(t * 0.4) * 4, lit: k % 600 < 400, fuelFrac: 0.8 };
        if (k % 90 === 0) f.startle(a.x, a.y, a.z);
        if (k === 900) f.spiral(a.x, a.y, a.z, 40, 6);
        f.step(1 / 30, L, a.x, a.y - 1, a.z, isOpen);
        for (let i = 0; i < f.active; i++) if (!isOpen(Math.floor(f.positions[i * 3]), Math.floor(f.positions[i * 3 + 1]), Math.floor(f.positions[i * 3 + 2]))) bad++;
      }
      expect(bad, `${id} samples in rock`).toBe(0);
    }
  });

  it('cost well under 0.05 ms a step for 32 moths', () => {
    const anchors = ['grotto', 'reliquary', 'monolith', 'runeDoor1'].map(anchor);
    const f = new MothFlock(anchors.map((a) => ({ ...a, x: anchors[0].x, y: anchors[0].y, z: anchors[0].z, count: 8 })), 13, 32);
    const L = { x: anchors[0].x + 2, y: anchors[0].y, z: anchors[0].z, lit: true, fuelFrac: 1 };
    for (let k = 0; k < 600; k++) f.step(1 / 60, L, L.x, L.y, L.z, isOpen);
    expect(f.active).toBe(32);
    const n = 3000;
    const t0 = performance.now();
    for (let k = 0; k < n; k++) f.step(1 / 60, L, L.x, L.y, L.z, isOpen);
    const ms = (performance.now() - t0) / n;
    expect(ms).toBeLessThan(0.05);
  });
});
