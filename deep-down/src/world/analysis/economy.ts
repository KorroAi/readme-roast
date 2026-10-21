import { B, BLOCKS, SOLID } from '../../config/blocks';
import type { ItemId } from '../../config/items';
import { NODE_LIST, nodeInputs, type NodeDef } from '../../config/recipes';
import type { ItemCounts } from '../../save/types';
import type { WorldLayout } from '../gen/types';
import { reachableCells } from './reachability';

/**
 * The economy check (final pass W3, plan §2.3): what the explorer can mine by sight at each stage
 * of the tree, against what the tree costs. Data-driven: supply comes from the block and prop
 * drop tables, cost from the node table, so a new ore (tin, W4) or node is counted without edits.
 *
 * "Sight-minable": an ore voxel with a face open to air, whose centre is within the pick's reach
 * (4.2 m) of the chest of a cell the explorer can walk to. The living rock is renewal and the bloom
 * is renewal, so both are left out: living cells count for nothing (the world is epoch 0).
 */

/** What the explorer has when making a node: the pick and lantern tiers. */
export interface Gate {
  pickaxe: number;
  lantern: number;
}

export const REACH = 4.2;

/** The walkable set from the camp spawn with this gate's barriers open (and the rides on). */
export function reachFor(layout: WorldLayout, gate: Gate): Uint8Array {
  const w = layout.world;
  const saved = w.blocks.slice();
  const open = (id: number) =>
    id === B.CRUMBLING_BRICK || (id === B.HARDENED_SLATE && gate.pickaxe >= 2) || (id === B.IRONBOUND && gate.pickaxe >= 3);
  for (let i = 0; i < w.blocks.length; i++) if (open(w.blocks[i])) w.blocks[i] = B.AIR;
  for (const d of layout.features?.runeDoors ?? []) {
    if (d.minLanternTier > gate.lantern) continue;
    for (const [x, y, z] of d.cells) w.blocks[w.index(x, y, z)] = B.AIR;
  }
  const sp = layout.spawn;
  const seen = reachableCells(w, Math.floor(sp.x), Math.floor(sp.y) + 1, Math.floor(sp.z), 3, layout.features?.links);
  w.blocks.set(saved);
  return seen;
}

/** Cells of the living rock (renewal: left out of the supply). */
export function livingCells(layout: WorldLayout): Set<number> {
  const s = new Set<number>();
  for (const site of layout.features?.living ?? []) for (const i of site.cells) s.add(i);
  return s;
}

/** Is any reachable cell's chest within `reach` of voxel (x, y, z)'s centre? */
export function inReach(layout: WorldLayout, seen: Uint8Array, x: number, y: number, z: number, reach = REACH): boolean {
  const w = layout.world;
  const r = Math.ceil(reach);
  for (let dy = -r - 1; dy <= r; dy++)
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        const zz = z + dz;
        if (!w.inBounds(xx, yy, zz) || !seen[w.index(xx, yy, zz)]) continue;
        if (Math.hypot(dx, dy - 1.3, dz) <= reach) return true;
      }
  return false;
}

/** Sight-minable voxels per block id (tier <= the gate's pick), living cells left out. */
export function sightMinable(layout: WorldLayout, seen: Uint8Array, gate: Gate, skip: ReadonlySet<number>): Map<number, number> {
  const w = layout.world;
  const out = new Map<number, number>();
  const ores = new Set(BLOCKS.filter((b) => b && b.drop && b.drop.item !== 'stone' && b.tier <= gate.pickaxe).map((b) => b.id));
  const open = (x: number, y: number, z: number) => !SOLID[w.get(x, y, z)];
  for (let i = 0; i < w.blocks.length; i++) {
    const id = w.blocks[i];
    if (!ores.has(id) || skip.has(i)) continue;
    const z = Math.floor(i / (w.sx * w.sy));
    const y = Math.floor(i / w.sx) % w.sy;
    const x = i % w.sx;
    if (!(open(x + 1, y, z) || open(x - 1, y, z) || open(x, y + 1, z) || open(x, y - 1, z) || open(x, y, z + 1) || open(x, y, z - 1))) continue;
    if (!inReach(layout, seen, x, y, z)) continue;
    out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

/**
 * Expected materials from what is sight-minable at a gate: each voxel's average drop, plus the
 * minable props (crystal and echo clusters) the pick can break within reach. Stone is not
 * counted here (every wall is stone); the test checks it separately against the walls' supply.
 */
export function supplyAt(layout: WorldLayout, gate: Gate, seen = reachFor(layout, gate), skip = livingCells(layout)): { items: ItemCounts; voxels: Map<number, number> } {
  const voxels = sightMinable(layout, seen, gate, skip);
  const items: ItemCounts = {};
  const add = (item: ItemId, n: number) => (items[item] = (items[item] ?? 0) + n);
  for (const [id, n] of voxels) {
    const d = BLOCKS[id].drop!;
    add(d.item, n * ((d.min + d.max) / 2) * d.chance);
  }
  for (const p of layout.props) {
    const m = p.minable;
    if (!m || m.tier > gate.pickaxe) continue;
    if (!inReach(layout, seen, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z))) continue;
    add(m.drop, (m.min + m.max) / 2);
  }
  return { items, voxels };
}

export interface EconomyRow {
  node: string;
  gate: Gate;
  /** Cumulative cost of the tree up to and including this node. */
  cost: ItemCounts;
  supply: ItemCounts;
  /** Materials whose cumulative cost exceeds the supply at this node's gate. */
  short: ItemId[];
}

/** The gate when making node `k` of `nodes`: the tiers the nodes before it gave. */
export function gateBefore(nodes: readonly NodeDef[], k: number): Gate {
  const g: Gate = { pickaxe: 1, lantern: 1 };
  for (let i = 0; i < k; i++) {
    const r = nodes[i].result;
    if (r.kind !== 'equip') continue;
    if (r.slot === 'pickaxe') g.pickaxe = Math.max(g.pickaxe, r.tier);
    if (r.slot === 'lantern') g.lantern = Math.max(g.lantern, r.tier);
  }
  return g;
}

/** One row per node in tree order (MUST nodes; `nodes` defaults to the tree). Stone is left out. */
export function economyTable(layout: WorldLayout, nodes: readonly NodeDef[] = NODE_LIST.filter((n) => n.prio === 'must')): EconomyRow[] {
  const skip = livingCells(layout);
  const cache = new Map<string, ItemCounts>();
  const cost: ItemCounts = {};
  const rows: EconomyRow[] = [];
  nodes.forEach((n, k) => {
    for (const [item, need] of nodeInputs(n)) cost[item] = (cost[item] ?? 0) + need;
    const gate = gateBefore(nodes, k);
    const key = `${gate.pickaxe}/${gate.lantern}`;
    let supply = cache.get(key);
    if (!supply) {
      supply = supplyAt(layout, gate, undefined, skip).items;
      cache.set(key, supply);
    }
    const short = (Object.keys(cost) as ItemId[]).filter((i) => i !== 'stone' && (cost[i] ?? 0) > (supply![i] ?? 0));
    rows.push({ node: n.id, gate, cost: { ...cost }, supply, short });
  });
  return rows;
}
