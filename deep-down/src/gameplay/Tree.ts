import { COLD, GEAR, PLAYER, lanternForTier, packForTier, pickaxeForTier } from '../config/balance';
import { ITEMS, type ItemId } from '../config/items';
import { NODES, NODE_LIST, nodeInputs, type NodeDef, type NodeId, type Place, type Prereq } from '../config/recipes';
import { t } from '../i18n';
import type { ItemCounts } from '../save/types';
import type { CostChip, CraftPlace, CraftTreeNode, CraftTreeView, NodeStat } from '../ui/types';
import { evaluate, isOwned, nodeDef, prereqMet, progressOf, type CraftContext, type CraftReason } from './Crafting';

/**
 * The upgrade tree as the screens see it (CraftTreeView), and the node the Next line and the
 * Expedition Report's Next card point at. Pure: everything comes in through the CraftContext.
 */

export interface TreeOptions {
  focus?: Place;
  select?: NodeId | null;
  next?: NodeId | null;
}

/** Materials on hand for the camp (pack + storage), key items excluded. */
export function availableCounts(ctx: Pick<CraftContext, 'backpack' | 'storage'>): ItemCounts {
  const out: ItemCounts = {};
  for (const id of Object.keys(ITEMS) as ItemId[]) {
    if (ITEMS[id].keyItem) continue;
    const n = ctx.backpack.count(id) + ctx.storage.count(id);
    if (n > 0) out[id] = n;
  }
  return out;
}

export function buildTreeView(ctx: CraftContext, o: TreeOptions = {}): CraftTreeView {
  const nodes = NODE_LIST.map((def) => nodeView(def, ctx));
  const forgeBuilt = isOwned(NODES.forge, ctx.equipment, ctx.built);
  const places: CraftPlace[] = [
    { id: 'workbench', name: t('place.workbench'), open: ctx.atCamp, reason: ctx.atCamp ? null : t('craft.notHere') },
    {
      id: 'forge',
      name: t('place.forge'),
      open: ctx.atCamp && forgeBuilt,
      reason: !forgeBuilt ? t('craft.lockedStation', { item: t(NODES.forge.name) }) : ctx.atCamp ? null : t('craft.notHere'),
    },
    { id: 'camp', name: t('place.camp'), open: ctx.atCamp, reason: ctx.atCamp ? null : t('craft.notHere') },
    { id: 'field', name: t('place.field'), open: true, reason: null },
  ];
  return {
    nodes,
    places,
    focus: o.focus ?? 'workbench',
    select: o.select ?? null,
    next: o.next ?? null,
    atCamp: ctx.atCamp,
    available: availableCounts(ctx),
  };
}

export function nodeView(def: NodeDef, ctx: CraftContext): CraftTreeNode {
  const res = evaluate(def.id, ctx);
  const cost: CostChip[] = nodeInputs(def).map(([item, need]) => ({ item, have: res.have[item] ?? 0, need }));
  const p = progressOf(def, res.have);
  return {
    id: def.id,
    name: t(def.name),
    does: t(def.does),
    place: def.place,
    line: def.line,
    row: def.row,
    result: def.result,
    prio: def.prio,
    state: res.reason,
    partial: res.reason !== 'owned' && p.have > 0 && p.have < p.need,
    reason: reasonText(def, res.reason, res.unmet),
    prereqs: def.prereqs.map((q) => ({ id: q, name: prereqName(q), met: prereqMet(q, ctx) })),
    cost,
    stats: nodeStats(def, ctx),
    auto: def.auto === true,
  };
}

export function prereqName(p: Prereq): string {
  if (p === 'rift') return t('prereq.rift');
  if (p === 'rune') return t('prereq.rune');
  return t(NODES[p].name);
}

/** The player-facing line for a node that cannot be made now (null when it can, or is owned). */
export function reasonText(def: NodeDef, reason: CraftReason, unmet: readonly Prereq[]): string | null {
  switch (reason) {
    case 'ok':
    case 'owned':
      return null;
    case 'locked': {
      const p = unmet[0];
      if (p === 'rift') return t('craft.lockedRift');
      if (p === 'rune') return t('craft.lockedRune');
      const n = NODES[p];
      return t(n.result.kind === 'station' ? 'craft.lockedStation' : 'craft.lockedNode', { item: t(n.name) });
    }
    case 'notHere':
      return t('craft.notHere');
    case 'carryToSite':
      return t('craft.carryToSite');
    case 'missing':
      return def.auto ? t('craft.lockedRune') : t('craft.missingNode');
  }
}

/** Before -> after numbers for the detail pane. */
export function nodeStats(def: NodeDef, ctx: Pick<CraftContext, 'equipment' | 'built'>): NodeStat[] {
  const r = def.result;
  const pct = (v: number) => t('craft.stat.percent', { value: Math.round(v) });
  if (r.kind === 'equip') {
    const cur = ctx.equipment.tier(r.slot);
    const from = Math.min(cur, r.tier - 1);
    if (r.slot === 'pickaxe') {
      const a = pickaxeForTier(from);
      const b = pickaxeForTier(r.tier);
      const top = pickaxeForTier(4);
      return [
        stat(t('equip.stat.speed'), a.power * 100, b.power * 100, top.power * 100, pct),
        stat(t('equip.stat.tier'), a.tier, b.tier, 4, (v) => t('equip.stat.tierValue', { value: v })),
      ];
    }
    if (r.slot === 'lantern') {
      const a = lanternForTier(from);
      const b = lanternForTier(r.tier);
      const top = lanternForTier(3);
      return [
        stat(t('equip.stat.fuel'), a.fuelSeconds / 60, b.fuelSeconds / 60, top.fuelSeconds / 60, (v) => t('equip.stat.fuelValue', { value: Math.round(v) })),
        stat(t('equip.stat.radius'), a.radius, b.radius, top.radius, (v) => t('equip.stat.radiusValue', { value: v })),
      ];
    }
    const a = packForTier(from);
    const b = packForTier(r.tier);
    return [stat(t('equip.stat.slots'), a.slots, b.slots, packForTier(3).slots, (v) => t('craft.stat.count', { value: v }))];
  }
  if (r.kind === 'gear' && r.gear === 'gripBoots') {
    const jump = (v: number) => (v * v) / (2 * PLAYER.gravity);
    const metres = (v: number) => t('craft.stat.metres', { value: Math.round(v * 10) / 10 });
    return [
      stat(t('craft.stat.jump'), jump(PLAYER.jumpVelocity), jump(GEAR.gripBoots.jumpVelocity), jump(GEAR.gripBoots.jumpVelocity), metres),
      stat(t('craft.stat.safeFall'), jump(PLAYER.safeFallSpeed), jump(GEAR.gripBoots.safeFallSpeed), jump(GEAR.gripBoots.safeFallSpeed), metres),
    ];
  }
  if (r.kind === 'gear' && r.gear === 'minersCoat') {
    const hearts = (v: number) => t('craft.stat.count', { value: v });
    return [
      stat(t('craft.stat.health'), PLAYER.maxHealth / 20, GEAR.minersCoat.maxHealth / 20, GEAR.minersCoat.maxHealth / 20, hearts),
      stat(t('craft.stat.cold'), 100, COLD.coatFactor * 100, 100, pct),
    ];
  }
  return [];
}

function stat(label: string, before: number, after: number, max: number, fmt: (v: number) => string): NodeStat {
  return { label, before, after, max, beforeText: fmt(before), afterText: fmt(after) };
}

/**
 * The node the Next line points at: of the MUST nodes not owned whose prerequisites are met (and
 * which are not built for free), the one with the fewest materials still missing; ties go to tree
 * order. `short` is its first short input as [item, have, need], null when it can be made now.
 */
export function closestNode(ctx: CraftContext): { id: NodeId; missing: number; short: [ItemId, number, number] | null } | null {
  let best: { id: NodeId; missing: number; short: [ItemId, number, number] | null } | null = null;
  for (const def of NODE_LIST) {
    if (def.prio !== 'must' || def.auto) continue;
    if (isOwned(def, ctx.equipment, ctx.built)) continue;
    if (!def.prereqs.every((p) => prereqMet(p, ctx))) continue;
    const field = def.place === 'field';
    let missing = 0;
    let short: [ItemId, number, number] | null = null;
    for (const [item, need] of nodeInputs(def)) {
      const have = ctx.backpack.count(item) + (field ? 0 : ctx.storage.count(item));
      if (have < need) {
        missing += need - have;
        short ??= [item, have, need];
      }
    }
    if (!best || missing < best.missing) best = { id: def.id, missing, short };
  }
  return best;
}

/** Can anything in the tree be made right now (the report's CTA)? */
export function anyCraftable(ctx: CraftContext): boolean {
  return NODE_LIST.some((def) => !def.auto && evaluate(def.id, ctx).ok);
}

export { nodeDef };
