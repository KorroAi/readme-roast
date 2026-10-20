import { beforeAll, describe, expect, it } from 'vitest';
import { B, BLOCKS, SOLID } from '../../src/config/blocks';
import { DISCOVERIES } from '../../src/gameplay/discoveries';
import { nearReachable, reachableCells } from '../../src/world/analysis/reachability';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { Region, WorldLayout } from '../../src/world/gen/types';
import { LightField } from '../../src/world/light';
import { emptyFloor, measureSpacing, openWorld } from '../../tools/poi-density';

/**
 * The feature pass (world/gen/features, final pass W2): it leaves the rest of the world alone,
 * every place it builds can be reached once its barrier is open (and not before), the rides are
 * clear, the light budget holds, and something new comes into view at least every 22 m of walking.
 */
let layout: WorldLayout;
let off: WorldLayout;

beforeAll(() => {
  layout = generateWorld();
  off = generateWorld(undefined, { features: false });
});

const inBox = (b: Region, x: number, y: number, z: number) => x >= b.min[0] && x <= b.max[0] && y >= b.min[1] && y <= b.max[1] && z >= b.min[2] && z <= b.max[2];

describe('the feature pass', () => {
  it('leaves every earlier prop and every voxel outside its boxes as they were', () => {
    const F = layout.features!;
    expect(off.features).toBeUndefined();
    // Earlier props keep their ids, kinds and places (the black stone is bedded 0.25 m deeper and
    // becomes something to touch: the one intended change).
    for (const [k, p] of off.props.entries()) {
      const q = layout.props[k];
      expect(q.id).toBe(p.id);
      expect(q.kind).toBe(p.kind);
      expect([q.x, q.z]).toEqual([p.x, p.z]);
      if (p.kind === 'abyssMonolith') expect(q.y).toBeCloseTo(p.y - 0.25, 6);
      else expect(q.y).toBe(p.y);
    }
    for (const p of layout.props.slice(off.props.length)) expect(p.id, 'new prop ids live in the feature namespace').toMatch(/^f_[a-z]+_\d+$/);
    const w = layout.world;
    let outside = 0;
    for (let i = 0; i < w.blocks.length; i++) {
      if (w.blocks[i] === off.world.blocks[i]) continue;
      const x = i % w.sx;
      const y = Math.floor(i / w.sx) % w.sy;
      const z = Math.floor(i / (w.sx * w.sy));
      if (!F.boxes.some((b) => inBox(b, x, y, z))) outside++;
    }
    expect(outside).toBe(0);
    // Deterministic.
    const again = generateWorld();
    expect(again.props.map((p) => p.id)).toEqual(layout.props.map((p) => p.id));
    let diff = 0;
    for (let i = 0; i < w.blocks.length; i++) if (again.world.blocks[i] !== w.blocks[i]) diff++;
    expect(diff).toBe(0);
  });

  it('keeps its boxes out of the camp (the office, nearest, starts past its edge)', () => {
    const c = layout.camp;
    for (const b of layout.features!.boxes) {
      const apart = b.max[0] < c.min[0] - 1 || b.min[0] > c.max[0] + 0.5 || b.max[1] < c.min[1] - 1 || b.min[1] > c.max[1] + 1 || b.max[2] < c.min[2] - 1 || b.min[2] > c.max[2] + 1;
      expect(apart, b.id).toBe(true);
    }
  });

  it('can reach every place once its barrier is open, and not before', () => {
    const F = layout.features!;
    const s = layout.spawn;
    const start = [Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z)] as const;
    const open = openWorld(layout);
    const reach = reachableCells(open, ...start, 3, F.links);
    for (const p of F.pois) if (p.mustReach) expect(nearReachable(open, reach, p.p[0], p.p[1], p.p[2], 2, 2), p.id).toBe(true);
    // Sealed: the rune-door rooms and the grotto before their door or plug; the rift floor without the rope.
    const sealed = reachableCells(layout.world, ...start, 3, F.links);
    for (const id of ['reliquary', 'gallery', 'grotto'] as const) {
      const p = layout.landmarks[id];
      expect(nearReachable(layout.world, sealed, p[0], p[1], p[2], 1, 1), `${id} sealed`).toBe(false);
    }
    const noRope = reachableCells(open, ...start, 3, F.links.filter((l) => l.id !== 'riftRope'));
    const camp = layout.landmarks.lastCamp;
    expect(nearReachable(open, noRope, camp[0], camp[1], camp[2], 2, 1), 'rift floor without the rope').toBe(false);
    expect(nearReachable(open, reach, camp[0], camp[1], camp[2], 2, 1), 'rift floor by the rope').toBe(true);
    // The balcony and the rift floor stay behind the seal until it is mined.
    const bal = layout.landmarks.balcony;
    expect(nearReachable(layout.world, sealed, bal[0], bal[1], bal[2], 2, 1), 'balcony sealed').toBe(false);
    expect(nearReachable(layout.world, sealed, camp[0], camp[1], camp[2], 2, 1), 'rift floor sealed').toBe(false);
  });

  it('gives each ride a clear path for the explorer and standable, reachable stands', () => {
    const F = layout.features!;
    const w = layout.world;
    const s = layout.spawn;
    const open = openWorld(layout);
    const reach = reachableCells(open, Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z), 3, F.links);
    for (const l of F.links) {
      let hits = 0;
      let samples = 0;
      for (let k = 1; k < l.path.length; k++) {
        const a = l.path[k - 1];
        const b = l.path[k];
        const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / 0.2);
        for (let st = 0; st <= n; st++) {
          const t = st / n;
          const x = a[0] + (b[0] - a[0]) * t;
          const y = a[1] + (b[1] - a[1]) * t;
          const z = a[2] + (b[2] - a[2]) * t;
          samples++;
          let hit = false;
          for (const dx of [-0.31, 0, 0.31]) for (const dz of [-0.31, 0, 0.31]) for (const dy of [0.02, 0.9, 1.7]) if (SOLID[w.get(Math.floor(x + dx), Math.floor(y + dy), Math.floor(z + dz))]) hit = true;
          if (hit) hits++;
        }
      }
      expect(samples).toBeGreaterThan(50);
      expect(hits, `${l.id} sweep`).toBe(0);
      for (const end of [l.top, l.bottom]) {
        const [x, y, z] = [Math.floor(end[0]), end[1], Math.floor(end[2])];
        expect(!SOLID[w.get(x, y, z)] && !SOLID[w.get(x, y + 1, z)] && SOLID[w.get(x, y - 1, z)] === 1, `${l.id} stand ${end}`).toBe(true);
        expect(reach[w.index(x, y, z)], `${l.id} stand reachable ${end}`).toBe(1);
      }
    }
  });

  it('keeps the light budget, with a warm lamp by every new navigation point', () => {
    const w = layout.world;
    let cyan = 0;
    let cyanOff = 0;
    const warm: Array<[number, number, number]> = [];
    for (let i = 0; i < w.blocks.length; i++) {
      const e = BLOCKS[w.blocks[i]]?.emission;
      if (e && e[2] > e[0]) cyan++;
      else if (e) warm.push([(i % w.sx) + 0.5, (Math.floor(i / w.sx) % w.sy) + 0.5, Math.floor(i / (w.sx * w.sy)) + 0.5]);
      const e2 = BLOCKS[off.world.blocks[i]]?.emission;
      if (e2 && e2[2] > e2[0]) cyanOff++;
    }
    // At most 14 more cold emitters than the world without the pass, and under the cap with the bloom.
    expect(cyan - cyanOff).toBeLessThanOrEqual(14);
    expect(cyan + 1).toBeLessThanOrEqual(120);
    for (const name of ['office', 'hoistTop', 'hoistFoot', 'ropeTop', 'lastCamp', 'haldenFace', 'surveyPost']) {
      const p = layout.landmarks[name];
      const near = Math.min(...warm.map((c) => Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2])));
      expect(near, `warm light near ${name}`).toBeLessThanOrEqual(7);
    }
  });

  it('lets the grotto\'s cold light leak up the squeeze to the crack, with a crystal glint in view through it', () => {
    const w = layout.world;
    const blueAt = (blocks: Uint8Array, x: number, y: number, z: number) => {
      const saved = w.blocks.slice();
      w.blocks.set(blocks);
      const light = new LightField(w);
      light.computeAll();
      w.blocks.set(saved);
      return light.data[w.index(x, y, z) * 4 + 2];
    };
    // The same world without the grotto's cold sources (its key light and crystals).
    const dark = w.blocks.slice();
    for (let z = 57; z <= 71; z++)
      for (let y = 90; y <= 100; y++)
        for (let x = 53; x <= 71; x++) {
          const i = w.index(x, y, z);
          if (dark[i] === B.LIGHT_CYAN) dark[i] = B.AIR;
          if (dark[i] === B.CRYSTAL && layout.features!.boxes.find((b) => b.id === 'grotto') && off.world.blocks[i] !== B.CRYSTAL) dark[i] = off.world.blocks[i] === B.AIR ? B.SLATE : off.world.blocks[i];
        }
    // In the slit (the tunnel's warm lamp is 2 m away, so its red stays the larger share there) and
    // inside the squeeze the grotto adds clearly more blue than the tunnel alone gives.
    expect(blueAt(w.blocks, 69, 96, 61) - blueAt(dark, 69, 96, 61), 'cold light at the slit').toBeGreaterThanOrEqual(15);
    expect(blueAt(w.blocks, 67, 95, 61) - blueAt(dark, 67, 95, 61), 'cold light in the squeeze').toBeGreaterThanOrEqual(30);
    // The plug the rusty pick opens, and a crystal face seen straight through the slit from the tunnel.
    expect(w.get(70, 94, 61)).toBe(B.GRAVEL);
    expect(w.get(70, 95, 61)).toBe(B.GRAVEL);
    let seen = false;
    for (let x = 69; x >= 55 && !seen; x--) {
      const id = w.get(x, 96, 61);
      if (id === B.CRYSTAL) seen = true;
      else if (SOLID[id]) break;
    }
    expect(seen, 'crystal glint through the slit').toBe(true);
  });

  it('puts something new in view at least every 22 m on every leg', () => {
    const legs = measureSpacing(layout);
    expect(legs.map((l) => l.name)).toEqual(['camp->ledge', 'ledge->stairsBottom', 'seal->balcony', 'balcony->stone', 'stairsBottom->reliquary', 'ledge->yard', 'yard->adit']);
    for (const l of legs) {
      expect(l.length, `${l.name} walked`).toBeGreaterThan(10);
      expect(l.maxSightGap, `${l.name} sight gap`).toBeLessThanOrEqual(22);
    }
    for (const name of ['camp->ledge', 'seal->balcony']) expect(legs.find((l) => l.name === name)!.maxGap, `${name} sight-or-ore gap`).toBeLessThanOrEqual(20);
  }, 30_000);

  it('leaves little empty floor', () => {
    const e = emptyFloor(layout);
    const before = emptyFloor(off);
    expect(e.columns).toBeGreaterThan(before.columns);
    expect(e.share10).toBeLessThanOrEqual(0.2);
    expect(e.over15).toBeLessThanOrEqual(200);
  }, 30_000);

  it('adds the beats: 11+ discoveries, 4 Halden logs, 3 secrets behind barriers, 1 shortcut', () => {
    const logs = DISCOVERIES.filter((d) => d.log);
    expect(logs.map((d) => d.id)).toEqual(['note.office', 'note.landing', 'note.yard', 'note.rift']);
    expect(DISCOVERIES.length - logs.length).toBeGreaterThanOrEqual(11);
    const notes = layout.props.filter((p) => p.feature?.kind === 'note').map((p) => p.feature!.id).sort();
    expect(notes).toEqual(['landing', 'office', 'rift', 'yard']);
    // Secrets: the grotto's plug, two rune doors (plus the shrine's crumbling wall).
    expect(layout.features!.runeDoors.length).toBe(2);
    expect(layout.discoveries.some((d) => d.id === 'mothGrotto')).toBe(true);
    expect(layout.features!.links.filter((l) => l.kind === 'hoist').length).toBe(1);
    // Every feature prop that can be used says what it does.
    for (const p of layout.props.filter((q) => q.interact === 'feature')) expect(p.feature, p.id).toBeDefined();
  });
});
