import { beforeAll, describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { doorIsOpen, doorRows, wakeStep, type DoorWake } from '../../src/game/runeDoor';
import { applyWorldEdits, encodeWorldEdits } from '../../src/save/worldDelta';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { RuneDoorDef } from '../../src/world/gen/features/types';
import type { WorldLayout } from '../../src/world/gen/types';

let layout: WorldLayout;
let door1: RuneDoorDef;
let door2: RuneDoorDef;

beforeAll(() => {
  layout = generateWorld();
  door1 = layout.features!.runeDoors.find((d) => d.id === 'reliquary')!;
  door2 = layout.features!.runeDoors.find((d) => d.id === 'gallery')!;
});

const at = (d: RuneDoorDef, lit = true, tier = 1) => ({ px: d.wake[0], py: d.wake[1], pz: d.wake[2], lanternLit: lit, lanternTier: tier });
const run = (d: RuneDoorDef, st: DoorWake, seconds: number, inp: ReturnType<typeof at>) => {
  for (let t = 0; t < seconds - 1e-9; t += 1 / 60) wakeStep(d, st, 1 / 60, inp);
  return st;
};

describe('rune doors', () => {
  it('open only after the hold time near them with a lit lantern', () => {
    const st: DoorWake = { progress: 0, state: 'idle' };
    run(door1, st, door1.hold - 0.1, at(door1));
    expect(st.state).toBe('waking');
    expect(st.progress).toBeLessThan(1);
    run(door1, st, 0.15, at(door1));
    expect(st.state).toBe('open');
    // Open stays open.
    run(door1, st, 1, { ...at(door1), px: 0 });
    expect(st.state).toBe('open');
  });

  it('let the waking fade, twice as fast, once the explorer steps away', () => {
    const st: DoorWake = { progress: 0, state: 'idle' };
    run(door1, st, 0.6, at(door1));
    const p = st.progress;
    run(door1, st, 0.15, { ...at(door1), px: door1.wake[0] + door1.radius + 1 });
    expect(st.state).toBe('idle');
    expect(st.progress).toBeCloseTo(p - (2 * 0.15) / door1.hold, 2);
    run(door1, st, 2, { ...at(door1), px: door1.wake[0] + 10 });
    expect(st.progress).toBe(0);
  });

  it('stay dark to a dead lantern, and the gallery door needs the copper lantern', () => {
    const dark = run(door1, { progress: 0, state: 'idle' }, 3, at(door1, false));
    expect(dark.state).toBe('dark');
    const weak = run(door2, { progress: 0, state: 'idle' }, 5, at(door2, true, 1));
    expect(door2.minLanternTier).toBe(2);
    expect(weak.state).toBe('weak');
    expect(weak.progress).toBe(0);
    const copper = run(door2, { progress: 0, state: 'idle' }, door2.hold + 0.1, at(door2, true, 2));
    expect(copper.state).toBe('open');
  });

  it('are unbreakable brick under a glyph lintel, with a standable wake point', () => {
    const w = layout.world;
    for (const d of layout.features!.runeDoors) {
      for (const [x, y, z] of d.cells) expect(w.get(x, y, z), `${d.id} door`).toBe(B.ANCIENT_BRICK);
      for (const [x, y, z] of d.lintel) expect(w.get(x, y, z), `${d.id} lintel`).toBe(B.GLYPH_STONE);
      const [wx, wy, wz] = d.wake;
      let near = false;
      for (let dz = -3; dz <= 3; dz++)
        for (let dx = -3; dx <= 3; dx++) {
          const x = Math.floor(wx) + dx;
          const z = Math.floor(wz) + dz;
          if (Math.hypot(dx, dz) > 3) continue;
          if (!w.isSolid(x, wy, z) && !w.isSolid(x, wy + 1, z) && w.isSolid(x, wy - 1, z)) near = true;
        }
      expect(near, `${d.id} wake point`).toBe(true);
      expect(doorRows(d).map((r) => r[0][1])).toEqual([...new Set(d.cells.map((c) => c[1]))].sort((a, b) => b - a));
    }
  });

  it('are open when their cells are air, and that survives a save round trip', () => {
    const w = layout.world;
    const generated = w.blocks.slice();
    expect(doorIsOpen(w, door1)).toBe(false);
    for (const [x, y, z] of door1.cells) w.blocks[w.index(x, y, z)] = B.AIR;
    const edits = encodeWorldEdits(generated, w.blocks);
    w.blocks.set(generated);
    expect(doorIsOpen(w, door1)).toBe(false);
    applyWorldEdits(w.blocks, edits);
    expect(doorIsOpen(w, door1)).toBe(true);
    expect(doorIsOpen(w, door2)).toBe(false);
    w.blocks.set(generated);
  });
});
