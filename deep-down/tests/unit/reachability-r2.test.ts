import { beforeAll, describe, expect, it } from 'vitest';
import { B, BLOCKS, SOLID } from '../../src/config/blocks';
import { isMinable, rarityOf } from '../../src/config/rarity';
import { nearReachable, reachableCells } from '../../src/world/analysis/reachability';
import { trappedCells } from '../../src/world/analysis/traps';
import { inReach } from '../../src/world/analysis/economy';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';
import type { VoxelWorld } from '../../src/world/VoxelWorld';
import { openWorld } from '../../tools/poi-density';

/**
 * Round 2 (WORLD): only interesting things are minable, so the world must be traversable without
 * free digging, and nobody may get trapped where the pick can no longer dig a way out.
 *
 * - Every place, every usable prop and every find is reached by walking (step up 1 m, drop up to
 *   3 m) and the rides, with the barriers a player opens (cracked masonry, the three seals by tier,
 *   the rune doors) open.
 * - From every cell a player can reach, a walk (and the rides) leads back to the camp: forward
 *   reachability is a subset of backward reachability to the camp. Checked on the world as
 *   generated and on the worst case where every minable block has been mined out.
 */
let layout: WorldLayout;
let open: VoxelWorld;
let start: [number, number, number];
let reach: Uint8Array;

beforeAll(() => {
  layout = generateWorld();
  open = openWorld(layout);
  const s = layout.spawn;
  start = [Math.floor(s.x), Math.floor(s.y) + 1, Math.floor(s.z)];
  reach = reachableCells(open, ...start, 3, layout.features!.links);
}, 120_000);

function trapped(w: VoxelWorld): Array<[number, number, number]> {
  return trappedCells(w, start, layout.features!.links, layout.camp);
}

describe('round 2: traversable without free digging, and no traps', () => {
  it('reaches every discovery region, usable prop and placed find by walking and the rides', () => {
    // Discoveries triggered by a region (the regions some events fill are zero boxes).
    const missing: string[] = [];
    for (const d of layout.discoveries) {
      if (d.max[0] - d.min[0] <= 0) continue;
      let hit = false;
      for (let z = d.min[2]; z <= d.max[2] && !hit; z++)
        for (let y = d.min[1]; y <= d.max[1] && !hit; y++)
          for (let x = d.min[0]; x <= d.max[0] && !hit; x++) if (open.inBounds(x, y, z) && reach[open.index(x, y, z)]) hit = true;
      if (!hit) missing.push(`discovery ${d.id}`);
    }
    // Every prop a player uses or mines, and every rarity-marked prop.
    for (const p of layout.props) {
      const usable = p.interact === 'feature' || p.interact === 'rune' || p.interact === 'relic' || !!p.minable || rarityOf(p) !== null;
      // The black stone is touched from its faces, 5 m from its centre (WorldFeatures.focusDistance).
      if (!usable || p.feature?.kind === 'monolith') continue;
      if (!nearReachable(open, reach, p.x, p.y, p.z, 2, 2)) missing.push(`prop ${p.id} ${p.kind}`);
    }
    for (const f of layout.features!.pois) if (f.mustReach && !nearReachable(open, reach, f.p[0], f.p[1], f.p[2], 2, 2)) missing.push(`poi ${f.id}`);
    expect(missing).toEqual([]);
  });

  it('puts the loose stone, root tangles, gem pockets and veins within reach of the pick', () => {
    const w = layout.world;
    const counts = new Map<number, { all: number; reach: number }>();
    for (let i = 0; i < w.blocks.length; i++) {
      const id = w.blocks[i];
      if (!isMinable(id, 4) || !BLOCKS[id].drop) continue;
      const z = Math.floor(i / (w.sx * w.sy));
      const y = Math.floor(i / w.sx) % w.sy;
      const x = i % w.sx;
      const exposed = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => !SOLID[w.get(x + dx, y + dy, z + dz)]);
      if (!exposed) continue;
      const c = counts.get(id) ?? { all: 0, reach: 0 };
      c.all++;
      if (inReach(layout, reach, x, y, z)) c.reach++;
      counts.set(id, c);
    }
    const rows = [...counts].map(([id, c]) => `${BLOCKS[id].name}: ${c.reach}/${c.all}`);
    console.log(`exposed minable voxels within reach: ${rows.join(', ')}`);
    for (const id of [B.RUBBLE, B.ROOTS, B.GEM_ORE, B.COPPER_ORE, B.IRON_ORE]) {
      const c = counts.get(id)!;
      expect(c, BLOCKS[id].name).toBeDefined();
      expect(c.reach / c.all, BLOCKS[id].name).toBeGreaterThanOrEqual(0.8);
    }
    expect(counts.get(B.RUBBLE)!.reach).toBeGreaterThanOrEqual(80);
    expect(counts.get(B.ROOTS)!.reach).toBeGreaterThanOrEqual(30);
    expect(counts.get(B.GEM_ORE)!.reach).toBeGreaterThanOrEqual(6);
  });

  it('never traps a player: from every reachable cell a walk leads back to the camp', () => {
    const t = trapped(open);
    if (t.length) console.log(`trapped cells (as generated): ${t.length}, e.g. ${t.slice(0, 80).map((c) => c.join(',')).join(' ')}`);
    expect(t).toEqual([]);
  });

  it('never traps a player even with every minable block mined out', () => {
    const w = openWorld(layout);
    for (let i = 0; i < w.blocks.length; i++) if (isMinable(w.blocks[i], 4)) w.blocks[i] = B.AIR;
    const t = trapped(w);
    if (t.length) console.log(`trapped cells (all mined): ${t.length}, e.g. ${t.slice(0, 80).map((c) => c.join(',')).join(' ')}`);
    expect(t).toEqual([]);
  });

  it('grows the walkable world (round 2: about 2x the floor of the first version where performance allows)', () => {
    let n = 0;
    for (let i = 0; i < reach.length; i++) if (reach[i]) n++;
    console.log(`reachable floor cells: ${n}`);
    // The first version reached 8 931 floor cells (tools/world-map.ts, barriers open, rides on).
    expect(n).toBeGreaterThanOrEqual(8931 * 1.35);
  });
});
