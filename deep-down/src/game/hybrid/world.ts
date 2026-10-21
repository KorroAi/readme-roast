// The world provider the shell plays on (1B's layout and walkability, adapted to `HybridWorld`): placements per node,
// the camp, and the walkability grid of each node's chamber. Placements are pure functions of the lifetime seed, so
// they are memoised per node; the walkability grids are built from the scene's voxel ring once a node is stamped.
//
// Until 1B's layout module is wired, `createWorld` returns a provider with no placements: the shell then keeps the
// camera where it is and the scene stages what it can (never a placeholder shown to players: the switch is internal).

import type { NavLike } from './explore';
import type { HybridWorld } from './HybridGame';
import type { CampPlacement, NodePlacement } from '../../world/hybrid/placement';

export interface WorldDeps {
  /** 1B's `placeNode` for node i (null out of range). */
  place?: (i: number) => NodePlacement | null;
  /** 1B's camp placement. */
  camp?: () => CampPlacement | null;
  /** A walkability grid for a node (built over the scene's voxel ring), or null until the node is stamped. */
  nav?: (i: number) => NavLike | null;
  campNav?: () => NavLike | null;
  /** Rebuild a node's walkability after a secret broke open. */
  opened?: (i: number, cells: ReadonlyArray<[number, number, number]>) => void;
}

export function createWorld(d: WorldDeps = {}): HybridWorld {
  const cache = new Map<number, NodePlacement | null>();
  let campCache: CampPlacement | null | undefined;
  return {
    placement(i: number): NodePlacement | null {
      if (i < 0 || !d.place) return null;
      let p = cache.get(i);
      if (p === undefined) {
        try {
          p = d.place(i);
        } catch (e) {
          console.warn('[deep-down] placement failed for node', i, e);
          p = null;
        }
        cache.set(i, p);
        if (cache.size > 64) cache.delete(cache.keys().next().value as number);
      }
      return p;
    },
    camp(): CampPlacement | null {
      if (campCache === undefined) campCache = d.camp ? d.camp() : null;
      return campCache;
    },
    nav: (i) => (d.nav ? d.nav(i) : null),
    campNav: () => (d.campNav ? d.campNav() : null),
    opened: (i, cells) => d.opened?.(i, cells),
  };
}
