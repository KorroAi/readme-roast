import type { CraftReason, CraftTreeNode, Place, TreeLine } from '../types';
import type { TreeTab } from './host';

// Pure helpers for the progression screens (no DOM; unit tested in tests/unit/ui-screens.test.ts).

/** "4:12" for seconds (minutes may run past 59: "72:05"). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** "1:07" hours and minutes for a whole descent (seconds played). */
export function hoursMinutes(seconds: number): string {
  const m = Math.max(0, Math.floor((Number.isFinite(seconds) ? seconds : 0) / 60));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

/** The tree's columns, left to right. */
export const TREE_LINES: readonly TreeLine[] = ['pickaxe', 'lantern', 'pack', 'gear', 'stations'];

/** Which tab a node belongs to: field sites share the camp tab ("Camp & Field"). */
export const tabOf = (place: Place): TreeTab => (place === 'field' ? 'camp' : place);

/**
 * How a node is drawn. The game decides the state (gameplay/Crafting.evaluate, precedence
 * owned > locked > field site > not here > missing); the tree only maps it to a look, so the
 * precedence can never drift between the rules and the screen.
 */
export type NodeLook = 'owned' | 'craftable' | 'partial' | 'short' | 'locked' | 'carry' | 'away';

export function nodeLook(n: Pick<CraftTreeNode, 'state' | 'partial'>): NodeLook {
  const s: CraftReason = n.state;
  if (s === 'owned') return 'owned';
  if (s === 'locked') return 'locked';
  if (s === 'ok') return 'craftable';
  if (s === 'carryToSite') return 'carry';
  if (s === 'notHere') return 'away';
  return n.partial ? 'partial' : 'short';
}

/** How much of a node's cost is on hand, 0..1 (each material counts up to what it needs). */
export function costFraction(cost: ReadonlyArray<{ have: number; need: number }>): number {
  let have = 0;
  let need = 0;
  for (const c of cost) {
    have += Math.min(Math.max(0, c.have), c.need);
    need += Math.max(0, c.need);
  }
  return need > 0 ? have / need : 1;
}

/** The rows the tree uses (min..max over its nodes), so an empty top row is never drawn. */
export function rowSpan(nodes: ReadonlyArray<Pick<CraftTreeNode, 'row'>>): { first: number; count: number } {
  if (!nodes.length) return { first: 0, count: 0 };
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of nodes) {
    lo = Math.min(lo, n.row);
    hi = Math.max(hi, n.row);
  }
  return { first: lo, count: hi - lo + 1 };
}

/**
 * The node to select when the tree opens on `tab`: the one the game asks for, else the Next
 * line's node, else the first that can be made, else the first not yet owned, else the first.
 * Only nodes of the tab are candidates (except an explicit request, which wins outright).
 */
export function pickNode<T extends Pick<CraftTreeNode, 'id' | 'state' | 'place'>>(nodes: readonly T[], tab: TreeTab, want: string | null, next: string | null): T | null {
  const explicit = want ? nodes.find((n) => n.id === want) : undefined;
  if (explicit) return explicit;
  const here = nodes.filter((n) => tabOf(n.place) === tab);
  return (
    here.find((n) => n.id === next) ??
    here.find((n) => n.state === 'ok') ??
    here.find((n) => n.state !== 'owned') ??
    here[0] ??
    nodes[0] ??
    null
  );
}

/**
 * Banked items counting up over `ms`: the shown count of `total` at `elapsed` ms (ease-out, whole
 * numbers, exact at the end).
 */
export function countUp(total: number, elapsed: number, ms: number): number {
  if (elapsed >= ms || ms <= 0) return total;
  const k = Math.max(0, elapsed / ms);
  return Math.min(total, Math.floor(total * (1 - (1 - k) * (1 - k))));
}
