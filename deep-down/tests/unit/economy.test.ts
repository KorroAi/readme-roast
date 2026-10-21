import { beforeAll, describe, expect, it } from 'vitest';
import { B } from '../../src/config/blocks';
import { ITEMS, type ItemId } from '../../src/config/items';
import { NODE_LIST, nodeInputs } from '../../src/config/recipes';
import { generateWorld } from '../../src/world/gen/generateWorld';
import type { WorldLayout } from '../../src/world/gen/types';
import { economyTable, inReach, livingCells, reachFor, sightMinable, supplyAt, type EconomyRow } from '../../src/world/analysis/economy';

/**
 * The tree is affordable from what can be mined by sight, stage by stage, with the deep's renewal
 * (the living rock, the glimmer bloom) turned off (plan §2.3, MERGE §3). Data-driven: supply from
 * the drop tables, cost from the node table, so content (W4) adding tin as an input re-checks it.
 */
let layout: WorldLayout;
let rows: EconomyRow[];

beforeAll(() => {
  layout = generateWorld();
  rows = economyTable(layout);
}, 120_000);

const MATS: ItemId[] = ['stone', 'copperOre', 'ironOre', 'glimmerShard', 'echoShard', 'rootFibre', 'gem'];
const fmt = (v: number | undefined) => String(Math.round((v ?? 0) * 10) / 10).padStart(6);

describe('the economy (sight-minable supply vs the tree, renewal off)', () => {
  it('every MUST node is affordable from the supply unlocked before it', () => {
    // The per-node table (pasted into the wave report).
    const head = 'node            gate  ' + MATS.map((m) => `${m.slice(0, 6).padStart(6)} cost/supply`).join(' ');
    const lines = rows.map((r) => `${r.node.padEnd(15)} p${r.gate.pickaxe}l${r.gate.lantern}  ` + MATS.map((m) => `${fmt(r.cost[m])} /${fmt(r.supply[m])}`).join('  '));
    console.log(['', head, ...lines].join('\n'));
    for (const r of rows) expect(r.short, `${r.node} at pick ${r.gate.pickaxe}, lantern ${r.gate.lantern}`).toEqual([]);
    expect(rows.length).toBe(NODE_LIST.filter((n) => n.prio === 'must').length);
  });

  it('iron: at least 30 sight-minable voxels behind the seal, and supply >= 1.3 x the tree', () => {
    const skip = livingCells(layout);
    const before = reachFor(layout, { pickaxe: 1, lantern: 1 });
    const after = reachFor(layout, { pickaxe: 2, lantern: 2 });
    let behind = 0;
    const w = layout.world;
    for (let i = 0; i < w.blocks.length; i++) {
      if (w.blocks[i] !== B.IRON_ORE || skip.has(i)) continue;
      const z = Math.floor(i / (w.sx * w.sy));
      const y = Math.floor(i / w.sx) % w.sy;
      const x = i % w.sx;
      const open = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([dx, dy, dz]) => w.get(x + dx, y + dy, z + dz) === B.AIR);
      if (open && inReach(layout, after, x, y, z) && !inReach(layout, before, x, y, z)) behind++;
    }
    console.log(`sight-minable iron behind the seal: ${behind}`);
    expect(behind).toBeGreaterThanOrEqual(30);
    const treeFe = NODE_LIST.reduce((n, d) => n + (d.inputs.ironOre ?? 0), 0);
    const full = supplyAt(layout, { pickaxe: 4, lantern: 3 }).items;
    console.log(`iron: tree ${treeFe}, supply ${full.ironOre}`);
    expect(full.ironOre ?? 0).toBeGreaterThanOrEqual(1.3 * treeFe);
  });

  it('echo: at least 12 sight-minable Echo voxels in the rift, and with the clusters they cover the tree', () => {
    const seen = reachFor(layout, { pickaxe: 3, lantern: 3 });
    const voxels = sightMinable(layout, seen, { pickaxe: 3, lantern: 3 }, livingCells(layout)).get(B.ECHO_CRYSTAL) ?? 0;
    expect(voxels).toBeGreaterThanOrEqual(12);
    const treeEc = NODE_LIST.reduce((n, d) => n + (d.inputs.echoShard ?? 0), 0);
    expect(supplyAt(layout, { pickaxe: 3, lantern: 3 }, seen).items.echoShard ?? 0).toBeGreaterThanOrEqual(treeEc);
    // Echo needs the iron pick: none of it at copper.
    expect(supplyAt(layout, { pickaxe: 2, lantern: 2 }).items.echoShard ?? 0).toBe(0);
  });

  it('no node needs more of one material than two stacks (two trips of one slot each)', () => {
    for (const n of NODE_LIST) for (const [item, need] of nodeInputs(n)) expect(need, `${n.id} ${item}`).toBeLessThanOrEqual(2 * ITEMS[item].stackSize);
  });
});
