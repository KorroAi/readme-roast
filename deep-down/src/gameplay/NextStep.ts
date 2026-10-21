import { ITEMS, type ItemId } from '../config/items';
import { NODES, type NodeId } from '../config/recipes';
import { t } from '../i18n';
import type { ObjectiveView } from './Objectives';

/**
 * The Next line: the one actionable sentence on the objective pill. It is never empty and never
 * says "done". In priority order (plan §2.7, as amended: no field sites remain, so "carry a site's
 * cost" has nothing to point at):
 *   1. a pack is waiting (a cache exists)        -> "Recover your pack — 84 m"
 *   2. the tutorial chain is not finished        -> its current step
 *   2b. a rumour picked on the Survey Table      -> "Fresh iron at the Halden Face — 61 m"
 *   3. the cheapest MUST node with prereqs met   -> "Next: Forge — Iron Ore 1/3"
 *   4. runes still out there                     -> "Find the runes — 5/8"
 *   5. all eight found, the stone not woken      -> "Take the eight runes to the black stone"
 *   6. a rumour (the living rock, the bloom)     -> "Fresh iron at the Halden Face — 61 m"
 *   7. otherwise                                 -> "Go deeper — your best is -96 m"
 */
export interface NextInput {
  /** Walking metres to the cache, or null when there is none. */
  cacheDistance: number | null;
  /** The tutorial chain's current step, or null once it is complete. */
  chain: Readonly<ObjectiveView> | null;
  /** The closest node (gameplay/Tree closestNode), or null when nothing is left to make. */
  node: { id: NodeId; short: [ItemId, number, number] | null } | null;
  runes: number;
  runesTotal: number;
  /** The black stone has answered. */
  finale: boolean;
  /** The best rumour: what grew where, and the walk to it (metres), or null. */
  rumour: { id: string; what: string; distance: number | null } | null;
  /** The rumour is the compass target the player picked (it comes before the tree). */
  targeted?: boolean;
  /** Deepest depth ever reached, metres. */
  bestDepth: number;
}

export interface NextLine {
  id: string;
  text: string;
}

export function nextLine(s: NextInput): NextLine {
  if (s.cacheDistance !== null) return { id: 'recoverPack', text: t('next.recoverPack', { distance: Math.max(0, Math.round(s.cacheDistance)) }) };
  if (s.chain && s.chain.text) return { id: s.chain.id, text: s.chain.text };
  if (s.rumour && s.targeted) return rumourLine(s.rumour);
  if (s.node) {
    const def = NODES[s.node.id];
    const item = t(def.name);
    const id = `craft:${def.id}`;
    if (!s.node.short) {
      const key = def.place === 'forge' ? 'next.readyForge' : def.place === 'camp' ? 'next.readyCamp' : 'next.craftReady';
      return { id, text: t(key, { item }) };
    }
    const [mat, have, need] = s.node.short;
    return { id, text: t('next.craft', { item, material: t(ITEMS[mat].name), have, need }) };
  }
  if (s.runes < s.runesTotal) return { id: 'runes', text: t('next.runes', { have: s.runes, total: s.runesTotal }) };
  if (!s.finale) return { id: 'stone', text: t('next.stone') };
  if (s.rumour) return rumourLine(s.rumour);
  return { id: 'deeper', text: t('next.deeper', { depth: Math.max(0, Math.round(s.bestDepth)) }) };
}

function rumourLine(r: NonNullable<NextInput['rumour']>): NextLine {
  const text = r.distance === null ? r.what : t('next.rumour', { what: r.what, distance: Math.max(0, Math.round(r.distance)) });
  return { id: `rumour:${r.id}`, text };
}
